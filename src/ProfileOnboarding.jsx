import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDelimitedListInput } from './useDelimitedListInput';
import { getSyllabusFileAcceptList } from './services/workspaceLearningService';
import { getStyleOverview, maybeRunDeepExtractionOnProviderReady } from './services/styleIngestService';
import { ensureSampleStoreReady } from './services/styleSampleStore';
import { getExternalAnalysisAvailability } from './services/aiService';
import { deriveManualDefaultsFromMetrics, summarizeStyleLearning } from './services/styleProfileService';
import StyleSetupFlow from './components/StyleSetupFlow';
import { ONBOARDING_AI_PROVIDERS } from './components/onboardingProviders';

// מספר שלבי האשף. היה 12 עד שהוסר משחק הסגנון הישן (שלב 8) — כל המספור נגזר מכאן.
const TOTAL_STEPS = 11;
const ONBOARDING_STEP_NUMBERS = Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1);
// שלבים שבהם StyleSetupFlow מציג כפתורי המשך/דילוג משלו — כפתור "המשך" של הפוטר מוסתר בהם
// כדי שלא יהיו שתי דרכים סותרות להתקדם באותו מסך.
const SELF_ADVANCING_STEPS = new Set([4, 10]);
const ONBOARDING_LOCAL_PROVIDERS = new Set(['ollama', 'lmstudio', 'custom']);
// ספקים שמותר לקדם ל-active — חייבים להיות מתוך KNOWN_PROVIDER_IDS של aiService,
// אחרת normalizeProviderConfig מחזיר את active ל-gemini בשקט.
const ONBOARDING_PROMOTABLE_PROVIDERS = new Set(['gemini', 'openai', 'claude', 'groq', 'perplexity', 'ollama', 'custom']);

function SyllabusListTextarea({ value, onCommit, commitLockRef, onUnlock = () => {}, disabled = false, ...props }) {
  const input = useDelimitedListInput(value, (nextValue) => {
    if (commitLockRef?.current) return;
    onCommit(nextValue);
  });

  return (
    <textarea
      {...props}
      {...input}
      disabled={disabled}
      onFocus={(event) => {
        if (!disabled) onUnlock();
        input.onFocus?.(event);
      }}
    />
  );
}

export default function ProfileOnboarding({
  profile,
  updateField,
  updateList,
  onOpenAiSettings = () => {},
  onOpenSecuritySettings = () => {},
  onOpenPersonalStyle = () => {},
  syllabusImport = {},
  onImportSyllabusFile = () => {},
  onComplete = () => {},
  onDismiss = () => {},
  providerConfig = {},
  setProviderConfig = () => {},
}) {
  const [step, setStep] = useState(1);
  const [maxVisitedStep, setMaxVisitedStep] = useState(1); // השלב הרחוק ביותר שהמשתמש כבר הגיע אליו — קובע לאילו נקודות מותר לקפוץ
  const [animating, setAnimating] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [styleDerived, setStyleDerived] = useState(null);
  const [learn, setLearn] = useState(null); // מודל-תצוגה "מה למדתי עליך" מנתוני מנוע הסגנון (summarizeStyleLearning)
  const [styleFilled, setStyleFilled] = useState({ tone: false, length: false }); // האם ה-pre-fill באמת מילא (לא לדווח "מילאנו" כששדה כבר היה מלא)
  const [syllabusImportCycle, setSyllabusImportCycle] = useState(0);
  const [selectedAiProviders, setSelectedAiProviders] = useState(() =>
    ONBOARDING_AI_PROVIDERS.filter(([id]) => providerConfig?.[id]?.key || providerConfig?.[id]?.baseUrl).map(([id]) => id),
  );
  const toggleAiProvider = (id) => setSelectedAiProviders((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  const setProviderField = (id, field, value) => setProviderConfig((prev) => {
    const next = { ...(prev || {}), [id]: { ...((prev || {})[id] || {}), [field]: value } };
    // קידום ספק לפעיל: אם לספק הפעיל הנוכחי אין מפתח/כתובת ולספק שהוזן עכשיו יש —
    // הוא הופך ל-active. בלי זה משתמש שהזין רק מפתח OpenAI נשאר על gemini בלי מפתח בכלל.
    const activeId = String(next.active || 'gemini');
    const hasCred = (p) => Boolean(String(p?.key || '').trim() || String(p?.baseUrl || '').trim());
    if (ONBOARDING_PROMOTABLE_PROVIDERS.has(id) && String(value || '').trim() && id !== activeId && !hasCred(next[activeId])) {
      next.active = id;
      next.activeProviders = [id];
    }
    return next;
  });
  const syllabusFileInputRef = useRef(null);
  const previousSyllabusImportBusyRef = useRef(false);
  // שלב החידוד = שאלות בלבד: הניתוח רץ אוטומטית ב-mount (autoStart), וה-ref מוודא
  // שניווט הלוך-חזור (10→9→10) לא מריץ את כל ה-pipeline מחדש. קליטת עבודות ופלט
  // JSON חיה בשלב 4 — לא כאן.
  const refineAnalysisRanRef = useRef(false);
  useEffect(() => {
    if (step === 10) refineAnalysisRanRef.current = true;
  }, [step]);
  const stepTimerRef = useRef(null); // טיימר מעבר השלבים — נשמר כדי לנקות אותו ולא להשאיר setTimeout תלוי באוויר

  useEffect(() => {
    setMounted(true);
  }, []);

  // ניקוי הטיימר של מעבר השלבים כשהרכיב יורד מהמסך
  useEffect(() => () => {
    if (stepTimerRef.current) {
      clearTimeout(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  }, []);

  const nextStep = () => {
    goToStep(step + 1);
  };

  const prevStep = () => {
    goToStep(step - 1);
  };

  const goToStep = (targetStep) => {
    const safeStep = Math.max(1, Math.min(TOTAL_STEPS, Number(targetStep) || 1));
    if (safeStep === step || animating) return;
    setMaxVisitedStep((prev) => Math.max(prev, safeStep));
    setAnimating(true);
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current); // לא להשאיר טיימר קודם רץ
    stepTimerRef.current = setTimeout(() => {
      stepTimerRef.current = null;
      setStep(safeStep);
      setAnimating(false);
    }, 250);
  };

  const lecturerNamesValue = Array.isArray(profile.lecturerNames) && profile.lecturerNames.length
    ? profile.lecturerNames
    : (String(profile.lecturerName || '').trim() ? [String(profile.lecturerName || '').trim()] : []);
  const tonePreferenceLabel = {
    very_formal: 'רשמי לחלוטין',
    formal: 'מכובד ומקצועי',
    balanced: 'מאוזן ונגיש',
    casual: 'חצי-רשמי וחברי',
    very_casual: 'קליל וזורם',
  }[profile.tonePreference || 'balanced'];
  const lengthPreferenceLabel = {
    short: 'קצר ולעניין',
    default: 'מאוזן עם הסבר',
    detailed: 'מפורט עם דוגמאות',
  }[profile.lengthPreference || 'default'];
  const profileSummary = [profile.displayName, profile.institutionName, profile.studyTrack || profile.userRole]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' · ');
  // שער סיום: אי אפשר לסגור אונבורדינג בלי שם תצוגה (נקלט בשלב 2)
  const completionBlocked = step === TOTAL_STEPS && !String(profile?.displayName || '').trim();
  const configuredAiProviderCount = ONBOARDING_AI_PROVIDERS
    .filter(([id]) => providerConfig?.[id]?.key || providerConfig?.[id]?.baseUrl).length;
  const providerSummary = configuredAiProviderCount > 0
    ? `מחוברים ${configuredAiProviderCount} מנועי AI`
    : 'אפשר להשלים חיבור ספק AI בכל רגע';
  const analysisSummary = 'פרופיל הסגנון וההגדרות המתקדמות זמינים בכל רגע מהמסכים הייעודיים.';
  const syllabusImportStatus = String(syllabusImport.status || 'idle').trim() || 'idle';
  const syllabusImportBusy = syllabusImportStatus === 'reading' || syllabusImportStatus === 'processing';
  const syllabusImportSignature = `${syllabusImportCycle}:${String(syllabusImport.fileName || '').trim()}::${syllabusImportStatus}`;
  const [unlockedSyllabusImportSignature, setUnlockedSyllabusImportSignature] = useState('');
  const syllabusListCommitLocked = syllabusImportBusy || (
    (syllabusImportStatus === 'processed' || syllabusImportStatus === 'heuristic')
    && unlockedSyllabusImportSignature !== syllabusImportSignature
  );
  const syllabusListCommitLockRef = useRef(false);
  syllabusListCommitLockRef.current = syllabusListCommitLocked;

  useEffect(() => {
    if (syllabusImportBusy && !previousSyllabusImportBusyRef.current) {
      setSyllabusImportCycle((value) => value + 1);
    }
    previousSyllabusImportBusyRef.current = syllabusImportBusy;
  }, [syllabusImportBusy]);

  const syllabusImportToneClass = syllabusImportStatus === 'error'
    ? 'border-rose-400/35 bg-rose-500/10 text-rose-50'
    : (syllabusImportStatus === 'processed' || syllabusImportStatus === 'heuristic')
      ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-50'
      : syllabusImportBusy
        ? 'border-cyan-400/35 bg-cyan-500/10 text-cyan-50'
        : 'border-white/15 bg-white/5 text-white/75';
  const syllabusImportBadge = syllabusImportStatus === 'processed'
    ? 'עודכן אוטומטית'
    : syllabusImportStatus === 'heuristic'
      ? 'זוהה חלקית'
      : syllabusImportStatus === 'error'
        ? 'נדרש תיקון'
        : syllabusImportBusy
          ? 'בתהליך'
          : 'מומלץ';
  const syllabusImportHint = 'העלה סילבוס כדי למלא אוטומטית קורסים, מרצים, נושאי לימוד ותאריך הגשה. גם בלי ספק AI מחובר ננסה לחלץ פרטים בסיסיים.';

  const unlockSyllabusListEditing = () => {
    if (syllabusImportBusy) return;
    setUnlockedSyllabusImportSignature(syllabusImportSignature);
  };

  const handleSyllabusFileSelection = (event) => {
    const file = event.target.files?.[0];
    if (file) onImportSyllabusFile(file);
    event.target.value = '';
  };

  // מיזוג שמרני של פרופיל-הסגנון ש-StyleSetupFlow בונה (שלב 11) לתוך ה-state של האונבורדינג.
  // metaPatch הוא אובייקט פרופיל מלא שנקרא מהדיסק — אסור לו לדרוס ערכים שהמשתמש הקליד
  // בשלבים הידניים (2-3, 5-9) וטרם נשמרו. לכן ממלאים רק שדות שריקים כרגע ב-state; שדות רשימה עוברים
  // דרך updateList (נורמליזציה), השאר דרך updateField.
  const isEmptyProfileValue = (value) => (
    value === null || value === undefined
    || (typeof value === 'string' && value.trim() === '')
    || (Array.isArray(value) && value.length === 0)
    || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)
  );

  const handleStyleMetaPatch = (metaPatch) => {
    if (!metaPatch || typeof metaPatch !== 'object') return;
    Object.entries(metaPatch).forEach(([field, value]) => {
      if (isEmptyProfileValue(value)) return;              // אין מה למזג משדה ריק ב-patch
      if (!isEmptyProfileValue(profile?.[field])) return;  // ה-state כבר מכיל ערך — לא דורסים
      if (Array.isArray(value)) updateList(field, value);
      else updateField(field, value);
    });
  };

  // שלב B.3 — רענון מיידי של "מה למדתי עליך" מיד אחרי העלאה (מעבר לרענון מונע-האירועים).
  const handleIngestReport = useCallback(() => {
    let hasLlm = false;
    try { hasLlm = Boolean(getExternalAnalysisAvailability()?.hasLocalProvider); } catch { hasLlm = false; }
    let ov = null;
    try { ov = getStyleOverview(); } catch { ov = null; }
    try { setLearn(summarizeStyleLearning(ov || {}, { hasLlmProvider: hasLlm })); } catch { /* noop */ }
    if (ov?.stats?.docCount) {
      try { setStyleDerived(deriveManualDefaultsFromMetrics(ov)); } catch { /* noop */ }
    }
  }, []);

  // שלב C/D — מרענן את "מה למדתי עליך" (learn) ואת ה-derive (styleDerived) מנתוני מנוע
  // הסגנון. רץ ב-mount ובכל עדכון פרופיל-סגנון או קונפיג-ספק, כך ש-tone/length/exemplars
  // מוכנים כבר לפני שמגיעים לשלבים הידניים. לא ממלא שדות — תצוגה בלבד (המילוי גדור לשלב 6).
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try { await ensureSampleStoreReady(); } catch { /* noop */ }
      if (!alive) return;
      let hasLlm = false;
      try { hasLlm = Boolean(getExternalAnalysisAvailability()?.hasLocalProvider); } catch { hasLlm = false; }
      let ov = null;
      try { ov = getStyleOverview(); } catch { ov = null; }
      if (!alive) return;
      let summary = null;
      try { summary = summarizeStyleLearning(ov || {}, { hasLlmProvider: hasLlm }); } catch { summary = null; }
      if (summary) setLearn(summary);
      // derive מוקדם — ל-state לצורך תצוגה (exemplars/tone/length), בלי updateField.
      if (ov?.stats?.docCount) {
        try { setStyleDerived(deriveManualDefaultsFromMetrics(ov)); } catch { /* noop */ }
      }
      // MAJOR 1/7 — יש ספק LLM זמין אך חילוץ עמוק מעולם לא רץ (למשל המפתח חובר לפני
      // ההעלאה, כך שאירוע config-changed לא יירה אחרי שנוצרו chunks). מפעילים את אותו
      // auto-run במפורש; ה-in-flight guard ב-service מונע כפילות מול ה-listener הגלובלי.
      if (summary?.deepLayerNotRun) {
        try { maybeRunDeepExtractionOnProviderReady(); } catch { /* noop */ }
      }
    };
    refresh();
    const onRefresh = () => { refresh(); };
    window.addEventListener('wordai-personal-style-updated', onRefresh);
    window.addEventListener('wordai-provider-config-changed', onRefresh);
    return () => {
      alive = false;
      window.removeEventListener('wordai-personal-style-updated', onRefresh);
      window.removeEventListener('wordai-provider-config-changed', onRefresh);
    };
  }, []);

  // Pre-fill שמרני של השלבים הידניים לפי baseline שנלמד מהעבודות שלב 4 (StyleSetupFlow collect).
  // ממלא רק שדות ריקים (isEmptyProfileValue) — לא דורס ערכים שהמשתמש כבר הזין.
  // אם אין baseline (המשתמש דילג) — יוצא בשקט והשלבים נשארים ריקים (graceful).
  useEffect(() => {
    if (step !== 6) return; // בעבר גם שלב 8 (משחק האימון) — הוסר; ה-derive משרת רק את שלב הטון/אורך
    let ov;
    try { ov = getStyleOverview(); } catch { return; }
    if (!ov?.stats?.docCount) return;
    const d = deriveManualDefaultsFromMetrics(ov);
    setStyleDerived(d);
    // מסמנים filled רק כשבאמת מילאנו שדה ריק — כדי שהבאנר "מילאנו לפי הכתיבה שלך"
    // לא יופיע כשהערך כבר היה מוגדר (מ-session קודם / הזנה ידנית).
    let length = false;
    let tone = false;
    if (isEmptyProfileValue(profile?.lengthPreference) && d.lengthPreference) { updateField('lengthPreference', d.lengthPreference); length = true; }
    if (isEmptyProfileValue(profile?.tonePreference) && d.tonePreference) { updateField('tonePreference', d.tonePreference); tone = true; }
    // רק מדליקים — ביקור חוזר בשלב מוצא את השדות כבר מלאים (כי מילאנו אותם בעצמנו)
    // וכיבוי כאן היה מוחק את הבאנר "מילאנו לפי הכתיבה שלך" מעצמו.
    if (tone || length) setStyleFilled((prev) => ({ tone: prev.tone || tone, length: prev.length || length }));
  }, [step]);

  const stepIcons = {
    1: '👋',
    2: '👤',
    3: '📚',
    4: '🗂️',
    5: '👥',
    6: '🎯',
    7: '⚖️',
    8: '📝',
    9: '🔌',
    10: '🖋️',
    11: '✨',
  };

  const stepTitles = {
    1: 'ברוכים הבאים',
    2: 'פרטים',
    3: 'קורסים',
    4: 'העבודות שלך',
    5: 'קהל ומטרות',
    6: 'טון ואורך',
    7: 'חוקים',
    8: 'ניסוח',
    9: 'חיבור AI',
    10: 'חידוד הסגנון',
    11: 'סיום',
  };

  // תווית ודאות עברית לפי level (משמש גם בפאנל החי וגם במסך הסיום).
  const confidenceLevelLabel = { low: 'נמוכה', medium: 'בינונית', high: 'גבוהה' };

  // פאנל "הפרופיל מתגבש" החי (עיצוב המוקאפ) — נגזר מהשדות שכבר מולאו.
  // שלב C.2 — בראש: שורות אמת מנתוני מנוע הסגנון (learn), כשיש מה שנלמד.
  const liveProfileLines = [
    learn?.ready && `נלמדו ${(learn.docCount || 0).toLocaleString('he-IL')} מסמכים · ${(learn.wordCount || 0).toLocaleString('he-IL')} מילים`,
    learn?.ready && learn.signatureCount > 0 && `${(learn.signatureCount || 0).toLocaleString('he-IL')} ביטויי-חתימה זוהו`,
    learn?.ready && `ודאות פרופיל: ${confidenceLevelLabel[learn.confidenceLevel] || 'נמוכה'} (${learn.confidenceScore || 0}%)`,
    profile.displayName && `שם: ${profile.displayName}`,
    profile.institutionName && `מוסד: ${profile.institutionName}`,
    (profile.studyTrack || profile.userRole) && `מסלול / תפקיד: ${profile.studyTrack || profile.userRole}`,
    lecturerNamesValue.length && `מרצים: ${lecturerNamesValue.join(', ')}`,
    profile.tonePreference && `טון: ${tonePreferenceLabel}`,
    profile.lengthPreference && `אורך ופירוט: ${lengthPreferenceLabel}`,
    String(profile.syllabusTopics || '').trim() && `נושאי לימוד: ${String(profile.syllabusTopics).trim().slice(0, 40)}`,
    // שלב E — כשמנוע הסגנון כבר למד (learn.ready) השורות למעלה הן המקור; ה-✓ הישן
    // ממשחק הלמידה נשאר רק כ-fallback כשעדיין אין נתוני מנוע.
    !learn?.ready && String(profile.styleTrainingSummary || '').trim() && 'סגנון אישי: נלמד ✓',
  ].filter(Boolean);

  // האם יש baseline שנלמד מהעבודות (שלב 4) — משמש להצגת באנרים/דוגמאות בשלבים הידניים.
  const styleExemplars = Array.isArray(styleDerived?.exemplars) ? styleDerived.exemplars : [];
  const styleBaselineReady = !!(styleDerived && (styleDerived.tonePreference || styleDerived.lengthPreference || styleExemplars.length));
  const styleAutoFilled = styleFilled.tone || styleFilled.length; // האם באמת מילאנו משהו בשלב 6
  const styleToneIsSuggestion = styleFilled.tone && ['medium', 'low'].includes(styleDerived?.tonePreferenceConfidence);

  // שלב C.3 — סיכום "כתיבה וסגנון" למסך הסיום, מנתוני מנוע הסגנון (learn) במקום styleTrainingSummary.
  const styleFinishSummary = (() => {
    // MINOR 6 — נקלטו מסמכים אך לא חולץ מהם טקסט (docCount>0, wordCount=0) — מצב שונה מ"לא הועלה כלום".
    if (learn?.docsButNoText) return 'נקלטו מסמכים אך לא חולץ מהם טקסט — נסה קבצים אחרים (Word/PDF עם טקסט נבחר, לא סרוק).';
    if (!learn?.ready) return 'עדיין לא הועלו עבודות — אפשר להעלות בכל רגע ממנוע הסגנון.';
    const parts = [
      `נלמדו ${(learn.docCount || 0).toLocaleString('he-IL')} מסמכים · ${(learn.wordCount || 0).toLocaleString('he-IL')} מילים`,
    ];
    if (learn.signatureCount > 0) parts.push(`${(learn.signatureCount).toLocaleString('he-IL')} ביטויי-חתימה`);
    parts.push(`ודאות ${confidenceLevelLabel[learn.confidenceLevel] || 'נמוכה'} (${learn.confidenceScore || 0}%)`);
    let text = parts.join(' · ');
    // חילוץ עמוק כבר רץ אך כל הבאטצ'ים נכשלו — לא מבטיחים "יופקו ברקע" לשווא.
    if (learn.deepLayerFailed) text += ' · החילוץ העמוק נכשל, ננסה שוב מאוחר יותר.';
    // MAJOR 7 — יש ספק אבל חילוץ עמוק טרם רץ: מובטח שיופק אוטומטית ברקע (ה-auto-run אמיתי).
    else if (learn.deepLayerNotRun) text += ' · דפוסים עמוקים וסיווג ז\'אנר טרם הופקו — יופקו אוטומטית ברקע.';
    // אין ספק עדיין: יופקו אחרי חיבור מפתח AI.
    else if (learn.deepLayerPending) text += ' · דפוסים עמוקים וסיווג ז\'אנר יושלמו אוטומטית אחרי חיבור מפתח AI.';
    return text;
  })();
  // דוגמאות קומפקטיות (1-2 משפטים) — למסך הסיום ולשלב 6.
  const styleExemplarsCompact = styleExemplars.slice(0, 2).map((s) => String(s || '').trim()).filter(Boolean);

  return (
    <div className="relative flex flex-col justify-center min-h-[500px] overflow-y-auto custom-scrollbar-slim py-6" dir="rtl">
      {/* Animated Background - תרבקע רגוע יותר */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #251f1c 0%, #1f1916 55%, #1a1512 100%)' }}></div>
      <div className="absolute inset-0 opacity-60" style={{ background: 'radial-gradient(620px circle at 88% -6%, rgba(239,171,77,0.18), transparent 70%), radial-gradient(520px circle at 6% 108%, rgba(224,116,74,0.14), transparent 70%)' }}></div>

      {/* Floating Decorative Elements - פחות מסיח דעת */}
      <div className="absolute top-10 right-10 w-16 h-16 bg-amber-200 bg-opacity-5 rounded-full animate-pulse" style={{ animationDuration: '4s' }}></div>
      <div className="absolute bottom-20 left-10 w-12 h-12 bg-amber-300 bg-opacity-10 rounded-full animate-pulse" style={{ animationDuration: '6s' }}></div>
      
      {/* Main Glassmorphism Container */}
      <div
        className={`relative mx-auto w-full max-w-5xl px-2 mt-2 backdrop-blur-xl bg-[#1f1916]/60 border border-[#efab4d]/20 rounded-3xl shadow-2xl overflow-hidden transition-all duration-1000 ${
          mounted ? 'transform translate-y-0 opacity-100' : 'transform translate-y-10 opacity-0'
        }`}
        style={{
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
        }}
      >
        {/* פס התקדמות דק + שורת מיקום + נקודות ניווט (החליף את שורת הנקודות המתויגות) */}
        <div className="px-4 pt-5 pb-4">
          <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#efab4d] transition-all duration-700 ease-out"
              style={{ width: `${(step / TOTAL_STEPS) * 100}%`, boxShadow: '0 0 14px rgba(239, 171, 77, 0.45)' }}
            />
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-3">
            <div className="text-[12.5px] font-semibold text-[#ddcfb9]">
              <span className="ml-1.5">{stepIcons[step]}</span>
              שלב {step} מתוך {TOTAL_STEPS} · {stepTitles[step]}
            </div>
            <div className="flex items-center gap-1.5">
              {ONBOARDING_STEP_NUMBERS.map((s) => {
                // ניווט חופשי אחורה ולשלבים שכבר ביקרנו בהם, ועוד שלב אחד קדימה — בלי קפיצות רחוקות
                const reachable = s <= Math.max(maxVisitedStep, step + 1);
                const dotDisabled = animating || !reachable;
                const dotTone = s === step
                  ? 'bg-[#efab4d]'
                  : s < step
                    ? 'bg-[#efab4d]/50'
                    : 'bg-white/20';
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={dotDisabled ? undefined : () => goToStep(s)}
                    aria-label={`עבור לשלב ${s}: ${stepTitles[s]}`}
                    aria-current={s === step ? 'step' : undefined}
                    disabled={dotDisabled}
                    className={`h-2.5 w-2.5 rounded-full transition-all duration-300 ${dotTone} ${
                      reachable ? 'hover:scale-125' : 'opacity-40 cursor-not-allowed'
                    }`}
                    style={{ cursor: dotDisabled ? 'default' : 'pointer' }}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Content Area — דו-פאנל: טופס + פאנל פרופיל חי (עיצוב המוקאפ) */}
        {/* 9 (חיבור AI) נוסף לרשימה — הפאנל החי מוסתר בו, ובלי זה נשארה עמודה ריקה */}
        <div className={`px-4 pb-4 ${[1, 4, 9, 10, 11].includes(step) ? '' : 'lg:grid lg:grid-cols-[1fr_300px] lg:gap-4 lg:items-start'}`}>
          <div 
            className={`bg-[#1a1512]/55 backdrop-blur-md rounded-2xl p-4 border border-[#efab4d]/12 shadow-xl transition-all duration-700 ${
              animating 
                ? 'transform translate-x-10 opacity-0 scale-95' 
                : 'transform translate-x-0 opacity-100 scale-100'
            }`}
            style={{
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 15px 35px rgba(0, 0, 0, 0.1)'
            }}
          >
            {step === 1 && (
              <div className="animate-in fade-in duration-700 text-center max-w-2xl mx-auto py-6">
                <h2 className="font-bold text-white mb-4 leading-tight" style={{ fontSize: 26, textShadow: '2px 2px 8px rgba(0,0,0,0.8)' }}>
                  ככל שנכיר,<br />כך אכתוב בדיוק כמוך.
                </h2>
                <p className="text-[#bcac96] text-sm leading-relaxed mb-6">
                  כמה דקות של היכרות — פרטים, טון, חוקים וחיבור למנוע ה-AI שלך, הכול במקום אחד. בסוף, כבר הטיוטה הראשונה תרגיש כאילו אתה כתבת אותה.
                </p>
                <div className="flex flex-wrap justify-center gap-2.5">
                  {['לומד את הטון', 'מבין את הקהל', 'כותב כמוך'].map((t) => (
                    <span key={t} className="inline-flex items-center gap-2 rounded-full border border-[#efab4d]/22 bg-white/5 px-4 py-2 text-[13px] font-semibold text-[#ecdcc4]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#efab4d]" />{t}
                    </span>
                  ))}
                </div>
                <p className="text-[#8f7e69] text-xs mt-6">פחות מ-3 דקות · אפשר לדלג ולחזור בכל רגע · הכול נשמר רק אצלך</p>
              </div>
            )}
            {step === 2 && (
              <div className="space-y-3 animate-in slide-in-from-left-5 duration-700">
                <div className="text-center mb-4">
                  <h2 className="text-base font-bold text-white mb-3" style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.8)' }}>
                    👤 פרטים אישיים
                  </h2>
                  <p className="text-white text-sm leading-relaxed" style={{ textShadow: '1px 1px 4px rgba(0,0,0,0.7)' }}>
                    ספר לי על עצמך כדי שאוכל לכתוב בסגנון שמתאים לך בדיוק
                  </p>
                </div>
                
                <div className="space-y-2">
                  <div className="group">
                    <label className="block text-sm font-medium text-white mb-1 group-hover:text-yellow-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                      שם הסטודנט/ית או שם התצוגה ✨
                    </label>
                    <input
                      value={profile.displayName || ''}
                      onChange={(e) => updateField('displayName', e.target.value)}
                      placeholder="השם שלך..."
                      className="w-full px-4 py-2 bg-white/5 backdrop-blur-sm border border-[#efab4d]/20 rounded-xl text-white placeholder-[#8f7e69] outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all duration-300 hover:bg-white/10"
                    />
                  </div>
                  
                  <div className="group">
                    <label className="block text-sm font-medium text-white mb-1 group-hover:text-blue-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                      מוסד / מרכז אקדמי 🏢
                    </label>
                    <input
                      value={profile.institutionName || ''}
                      onChange={(e) => updateField('institutionName', e.target.value)}
                      placeholder="אוניברסיטה, חברה, או ארגון..."
                      className="w-full px-4 py-2 bg-white/5 backdrop-blur-sm border border-[#efab4d]/20 rounded-xl text-white placeholder-[#8f7e69] outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all duration-300 hover:bg-white/10"
                    />
                  </div>
                  
                  <div className="group">
                    <label className="block text-sm font-medium text-white mb-1 group-hover:text-green-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                      פקולטה / חוג / מסלול 🎓
                    </label>
                    <input
                      value={profile.studyTrack || ''}
                      onChange={(e) => updateField('studyTrack', e.target.value)}
                      placeholder="מסלול אקדמי, התמחות או תחום מקצועי..."
                      className="w-full px-4 py-2 bg-white/5 backdrop-blur-sm border border-[#efab4d]/20 rounded-xl text-white placeholder-[#8f7e69] outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all duration-300 hover:bg-white/10"
                    />
                  </div>
                  
                  <div className="group">
                    <label className="block text-sm font-medium text-white mb-1 group-hover:text-cyan-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                      תפקיד או סטטוס נוכחי 👤
                    </label>
                    <input
                      value={profile.userRole || ''}
                      onChange={(e) => updateField('userRole', e.target.value)}
                      placeholder="סטודנט, חוקר, מנהל, יועץ..."
                      className="w-full px-4 py-2 bg-white/5 backdrop-blur-sm border border-[#efab4d]/20 rounded-xl text-white placeholder-[#8f7e69] outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all duration-300 hover:bg-white/10"
                    />
                  </div>
                  
                  <div className="group">
                    <label className="block text-sm font-medium text-white mb-1 group-hover:text-yellow-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                      שם קורס / קורסים פעילים 📚
                    </label>
                    <SyllabusListTextarea
                      key={`currentCourses:${syllabusImportSignature}`}
                      value={profile.currentCourses}
                      onCommit={(value) => updateList('currentCourses', value)}
                      commitLockRef={syllabusListCommitLockRef}
                      onUnlock={unlockSyllabusListEditing}
                      disabled={syllabusImportBusy}
                      placeholder="פרט על הקורסים, הנושאים או הפרויקטים שאתה עובד עליהם..."
                      rows={2}
                      className="w-full px-4 py-2 bg-white/5 backdrop-blur-sm border border-[#efab4d]/20 rounded-xl text-white placeholder-[#8f7e69] resize-none outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all duration-300 hover:bg-white/10"
                    />
                  </div>

                  <div className="group">
                    <label className="block text-sm font-medium text-white mb-1 group-hover:text-rose-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                      תז 🪪
                    </label>
                    <input
                      value={profile.studentId || ''}
                      onChange={(e) => updateField('studentId', e.target.value)}
                      placeholder="מספר תז להגשה..."
                      className="w-full px-4 py-2 bg-white/5 backdrop-blur-sm border border-[#efab4d]/20 rounded-xl text-white placeholder-[#8f7e69] outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all duration-300 hover:bg-white/10"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3 animate-in slide-in-from-left-5 duration-700">
                <div className="text-center mb-4">
                  <h2 className="text-base font-bold text-white mb-3" style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.8)' }}>
                    📚 קורסים והגשה
                  </h2>
                  <p className="text-white text-sm leading-relaxed" style={{ textShadow: '1px 1px 4px rgba(0,0,0,0.7)' }}>
                    כאן מגדירים גם פרטי הגשה קבועים וגם את הקונטקסט שבו אתה כותב
                  </p>
                </div>
                
                <div className="rounded-3xl border border-cyan-300/25 bg-gradient-to-br from-cyan-500/18 via-sky-500/10 to-slate-900/70 p-5 shadow-2xl shadow-cyan-950/35">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="max-w-2xl">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-200/25 bg-white/10 text-[11px] font-semibold text-cyan-100 mb-3">
                        <span>📄</span>
                        <span>ייבוא סילבוס מהיר</span>
                      </div>
                      <h3 className="text-lg font-bold text-white mb-2" style={{ textShadow: '1px 1px 5px rgba(0,0,0,0.7)' }}>
                        אפשר להתחיל מקובץ סילבוס במקום למלא הכל ידנית
                      </h3>
                      <p className="text-sm text-cyan-50/90 leading-relaxed">
                        {syllabusImportHint}
                      </p>
                      <p className="text-xs text-white/70 mt-2 leading-relaxed">
                        לאחר הייבוא אפשר לעבור על הפרטים ולעדכן ידנית רק מה שחסר.
                      </p>
                    </div>

                    <div className="flex flex-col sm:items-end gap-3">
                      <button
                        type="button"
                        onClick={() => syllabusFileInputRef.current?.click()}
                        disabled={syllabusImportBusy}
                        className="px-5 py-3 rounded-2xl bg-cyan-400/85 hover:bg-cyan-300 text-slate-950 text-sm font-bold shadow-lg shadow-cyan-900/30 transition-all duration-300 disabled:opacity-70 disabled:cursor-wait"
                      >
                        {syllabusImportBusy ? 'מייבא סילבוס...' : 'העלה סילבוס'}
                      </button>
                      <div className="text-[11px] text-white/65">
                        תומך ב־docx, txt, md, html, pdf, מצגות (pptx), Excel ובתמונות עם OCR
                      </div>
                    </div>
                  </div>

                  <input
                    ref={syllabusFileInputRef}
                    type="file"
                    accept={getSyllabusFileAcceptList()}
                    className="hidden"
                    onChange={handleSyllabusFileSelection}
                  />

                  {(syllabusImport.fileName || syllabusImport.message) && (
                    <div className={`mt-4 rounded-2xl border px-4 py-3 ${syllabusImportToneClass}`}>
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                        <div className="min-w-0">
                          {syllabusImport.fileName ? (
                            <div className="text-sm font-semibold truncate" title={syllabusImport.fileName}>
                              {syllabusImport.fileName}
                            </div>
                          ) : null}
                          <div className="text-sm leading-relaxed mt-1">
                            {syllabusImport.message || 'בחר קובץ כדי להתחיל ייבוא.'}
                          </div>
                          {syllabusImport.summary ? (
                            <div className="text-xs mt-2 text-white/80 leading-relaxed">
                              {syllabusImport.summary}
                            </div>
                          ) : null}
                        </div>

                        <div className="shrink-0">
                          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/90">
                            {syllabusImportBadge}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs font-semibold text-white/85">מילוי ידני משלים</div>
                  <div className="text-[11px] text-white/65 mt-1 leading-relaxed">
                    אם חלק מהפרטים לא זוהו מהסילבוס, אפשר להשלים או לתקן אותם ידנית כאן למטה.
                  </div>
                </div>

                <div className="space-y-3 opacity-95">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="group">
                      <label className="block text-sm font-medium text-white mb-1 group-hover:text-amber-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                        מרצים / מנחים 👩‍🏫
                      </label>
                      <SyllabusListTextarea
                        key={`lecturerNames:${syllabusImportSignature}`}
                        value={lecturerNamesValue}
                        onCommit={(value) => updateList('lecturerNames', value)}
                        commitLockRef={syllabusListCommitLockRef}
                        onUnlock={unlockSyllabusListEditing}
                        disabled={syllabusImportBusy}
                        rows={3}
                        placeholder="אפשר להפריד בין שמות בפסיקים או בשורות חדשות"
                        className="w-full px-4 py-2 bg-white/5 backdrop-blur-sm border border-[#efab4d]/20 rounded-xl text-white placeholder-[#8f7e69] outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all duration-300 hover:bg-white/10"
                      />
                    </div>
                    <div className="group">
                      <label className="block text-sm font-medium text-white mb-1 group-hover:text-violet-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                        נושאי סילבוס / דגשים 📚
                      </label>
                      <SyllabusListTextarea
                        key={`syllabusTopics:${syllabusImportSignature}`}
                        value={profile.syllabusTopics}
                        onCommit={(value) => updateList('syllabusTopics', value)}
                        commitLockRef={syllabusListCommitLockRef}
                        onUnlock={unlockSyllabusListEditing}
                        disabled={syllabusImportBusy}
                        rows={3}
                        placeholder="נושאים, יחידות לימוד או דגשים שחוזרים לאורך הקורס"
                        className="w-full px-4 py-2 bg-white/5 backdrop-blur-sm border border-[#efab4d]/20 rounded-xl text-white placeholder-[#8f7e69] outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all duration-300 hover:bg-white/10"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="group">
                      <label className="block text-sm font-medium text-white mb-1 group-hover:text-emerald-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                        סוג מטלה / מסמך 📄
                      </label>
                      <input
                        value={profile.assignmentType || ''}
                        onChange={(e) => updateField('assignmentType', e.target.value)}
                        disabled={syllabusImportBusy}
                        placeholder="למשל: עבודה מסכמת"
                        className="w-full px-4 py-2 bg-white/5 backdrop-blur-sm border border-[#efab4d]/20 rounded-xl text-white placeholder-[#8f7e69] outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all duration-300 hover:bg-white/10"
                      />
                    </div>
                    <div className="group">
                      <label className="block text-sm font-medium text-white mb-1 group-hover:text-cyan-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                        תאריך הגשה 📅
                      </label>
                      <input
                        type="date"
                        value={profile.submissionDate || ''}
                        onChange={(e) => updateField('submissionDate', e.target.value)}
                        disabled={syllabusImportBusy}
                        className="w-full px-4 py-2 bg-white/5 backdrop-blur-sm border border-[#efab4d]/20 rounded-xl text-white outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all duration-300 hover:bg-white/10"
                      />
                    </div>
                  </div>

                  <div className="group">
                    <label className="block text-sm font-medium text-white mb-1 group-hover:text-purple-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                      הצהרת שימוש ב-AI להגשה 🤖
                    </label>
                    <textarea
                      value={profile.aiAssistanceDeclaration || ''}
                      onChange={(e) => updateField('aiAssistanceDeclaration', e.target.value)}
                      placeholder="אם למוסד יש נוסח קבוע, הדבק אותו כאן לשימוש עתידי בעמודי שער והצהרות."
                      rows={2}
                      className="w-full px-4 py-2 bg-white/5 backdrop-blur-sm border border-[#efab4d]/20 rounded-xl text-white placeholder-[#8f7e69] resize-none outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all duration-300 hover:bg-white/10"
                    />
                  </div>

                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4 animate-in slide-in-from-left-5 duration-700">
                <div className="text-center mb-4">
                  <h2 className="text-base font-bold text-white mb-3" style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.8)' }}>
                    🗂️ העבודות שלך
                  </h2>
                  <p className="text-white text-sm leading-relaxed" style={{ textShadow: '1px 1px 4px rgba(0,0,0,0.7)' }}>
                    העלה כמה עבודות קודמות שכתבת — או הדבק ניתוח מ-AI חיצוני, או גם וגם. אלמד מהן את הסגנון שלך ואמלא עבורך חלק מההעדפות בהמשך. אפשר גם לדלג ולהזין הכול ידנית.
                  </p>
                </div>
                <StyleSetupFlow
                  variant="onboarding"
                  stage="collect"
                  profile={profile}
                  onProfileMetaPatch={handleStyleMetaPatch}
                  onIngestReport={handleIngestReport}
                  onComplete={() => nextStep()}
                  onSkip={() => nextStep()}
                />
              </div>
            )}

            {step === 5 && (
              <div className="space-y-3 animate-in slide-in-from-left-5 duration-700">
                <div className="text-center mb-4">
                  <h2 className="text-base font-bold text-white mb-3" style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.8)' }}>
                    👥 קהל ומטרות
                  </h2>
                  <p className="text-white text-sm leading-relaxed" style={{ textShadow: '1px 1px 4px rgba(0,0,0,0.7)' }}>
                    למי אתה כותב ולמה — כך אכוון את הטון, העומק והמבנה.
                  </p>
                </div>
                <div className="space-y-3 opacity-95">
                  <div className="group">
                    <label className="block text-sm font-medium text-white mb-1 group-hover:text-green-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                      הרקע שלך ככותב ✍️
                    </label>
                    <textarea
                      value={profile.userBackground || ''}
                      onChange={(e) => updateField('userBackground', e.target.value)}
                      placeholder="מה מאפיין אותך? למשל: אוהב שפה פשוטה, כותב מאמרים אקדמיים, מעדיף סגנון עיתונאי..."
                      rows={2}
                      className="w-full px-4 py-2 bg-white/5 backdrop-blur-sm border border-[#efab4d]/20 rounded-xl text-white placeholder-[#8f7e69] resize-none outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all duration-300 hover:bg-white/10"
                    />
                  </div>
                  
                  <div className="group">
                    <label className="block text-sm font-medium text-white/90 mb-1 group-hover:text-white transition-colors">
                      המטרות שלך בכתיבה 🎯
                    </label>
                    <textarea
                      value={profile.writingGoals || ''}
                      onChange={(e) => updateField('writingGoals', e.target.value)}
                      placeholder="למה אתה כותב? כתיבה שיווקית, עבודות אקדמיות, דוחות מקצועיים, תוכן למדיה חברתית..."
                      rows={2}
                      className="w-full px-4 py-2 bg-white/5 border border-[#efab4d]/20 rounded-xl text-white placeholder-[#8f7e69] resize-none outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all duration-300 hover:bg-white/10"
                    />
                  </div>
                  
                  <div className="group">
                    <label className="block text-sm font-medium text-white/90 mb-1 group-hover:text-white transition-colors">
                      הקהל שלך 👥
                    </label>
                    <textarea
                      value={profile.defaultAudience || ''}
                      onChange={(e) => updateField('defaultAudience', e.target.value)}
                      placeholder="מי קורא את מה שאתה כותב? סטודנטים, עמיתים, לקוחות, הקהל הרחב..."
                      rows={2}
                      className="w-full px-4 py-2 bg-white/5 border border-[#efab4d]/20 rounded-xl text-white placeholder-[#8f7e69] resize-none outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all duration-300 hover:bg-white/10"
                    />
                  </div>
                  
                  <div className="group">
                    <label className="block text-sm font-medium text-white/90 mb-1 group-hover:text-white transition-colors">
                      העדפות עיצוב וסגנון 🎨
                    </label>
                    <textarea
                      value={profile.formatPreferences || ''}
                      onChange={(e) => updateField('formatPreferences', e.target.value)}
                      placeholder="איך אתה אוהב לעצב טקסטים? קצר ולעניין, פסקאות ארוכות, עם כותרות משנה, רשימות..."
                      rows={2}
                      className="w-full px-4 py-2 bg-white/5 border border-[#efab4d]/20 rounded-xl text-white placeholder-[#8f7e69] resize-none outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all duration-300 hover:bg-white/10"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="space-y-3 animate-in slide-in-from-left-5 duration-700">
                <div className="text-center mb-4">
                  <h2 className="text-base font-bold text-white mb-3" style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.8)' }}>
                    🎯 קהל יעד
                  </h2>
                  <p className="text-white text-sm leading-relaxed" style={{ textShadow: '1px 1px 4px rgba(0,0,0,0.7)' }}>
                    איך תרצה שהטקסט ירגיש לאנשים שקוראים אותו?
                  </p>
                </div>

                {styleAutoFilled && (
                  <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-[13px] leading-relaxed text-[#ddcfb9]">
                    <span className="shrink-0 text-emerald-300 font-extrabold">✓</span>
                    <span>מילאנו לפי מה שלמדנו מהעבודות שלך — אשר או שנה.</span>
                  </div>
                )}

                {/* שלב D.2 — דוגמאות קומפקטיות "ככה אתה כותב" גם בשלב 6 (1-2 משפטים). */}
                {styleBaselineReady && styleExemplarsCompact.length > 0 && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3" dir="rtl">
                    <div className="text-[12px] font-bold text-[#f4ecde] mb-1.5">ככה אתה כותב:</div>
                    <div className="space-y-1.5">
                      {styleExemplarsCompact.map((sentence, i) => (
                        <blockquote key={i} className="border-r-2 border-[#efab4d]/40 pr-2.5 text-[12.5px] leading-relaxed text-[#ddcfb9]">
                          {sentence}
                        </blockquote>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="group">
                    <label className="flex items-center gap-2 text-sm font-medium text-white mb-1 group-hover:text-pink-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                      <span>סגנון רשמי או חברי? (Tone)</span>
                      {styleToneIsSuggestion && (
                        <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-[#bcac96]">הצעה לפי הכתיבה שלך</span>
                      )}
                    </label>
                    <select
                      value={profile.tonePreference || 'balanced'}
                      onChange={(e) => updateField('tonePreference', e.target.value)}
                      className="w-full px-4 py-2 bg-white/5 backdrop-blur-sm border border-[#efab4d]/20 rounded-xl text-white outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all duration-300 hover:bg-white/10 cursor-pointer"
                    >
                      <option value="very_formal" className="bg-slate-800 text-white">רשמי לחלוטין (אקדמי / עסקי נוקשה)</option>
                      <option value="formal" className="bg-slate-800 text-white">מכובד ומקצועי</option>
                      <option value="balanced" className="bg-slate-800 text-white">מאוזן (נגיש אך מקצועי)</option>
                      <option value="casual" className="bg-slate-800 text-white">חצי-רשמי / חברי</option>
                      <option value="very_casual" className="bg-slate-800 text-white">סלנג וזורם לחלוטין</option>
                    </select>
                  </div>

                  <div className="group">
                    <label className="block text-sm font-medium text-white/90 mb-1 group-hover:text-white transition-colors">
                      אורך פסקאות ופירוט עיקרי
                    </label>
                    <select
                      value={profile.lengthPreference || 'default'}
                      onChange={(e) => updateField('lengthPreference', e.target.value)}
                      className="w-full px-4 py-2 bg-white/5 border border-[#efab4d]/20 rounded-xl text-white outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all duration-300 hover:bg-white/10 cursor-pointer"
                    >
                      <option value="short" className="bg-slate-800 text-white">קצר ולעניין - ישר ולנקודה</option>
                      <option value="default" className="bg-slate-800 text-white">ממוצע - עם מעט רקע והסבר</option>
                      <option value="detailed" className="bg-slate-800 text-white">מפורט - הסברים ארוכים ודוגמאות</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {step === 7 && (
              <div className="space-y-3 animate-in slide-in-from-left-5 duration-700">
                <div className="text-center mb-4">
                  <h2 className="text-base font-bold text-white mb-3" style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.8)' }}>
                    ⚖️ חוקי ברזל ואוצר מילים
                  </h2>
                  <p className="text-white text-sm leading-relaxed" style={{ textShadow: '1px 1px 4px rgba(0,0,0,0.7)' }}>
                    מהם הדברים שיגרמו לטקסט להיראות בדיוק כמו שצריך?
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="group">
                    <label className="block text-sm font-medium text-white mb-1 group-hover:text-red-300 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                      ממה להימנע לחלוטין? 🚫
                    </label>
                    <textarea
                      value={profile.avoidRules || ''}
                      onChange={(e) => updateField('avoidRules', e.target.value)}
                      placeholder="למשל: אל תשתמש באימוג'י, בלי מילים גבוהות מדי, אורך משפט עד 10 מילים..."
                      rows={2}
                      className="w-full px-4 py-2 bg-white/5 backdrop-blur-sm border border-[#efab4d]/20 rounded-xl text-white placeholder-[#8f7e69] resize-none outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all duration-300 hover:bg-white/10"
                    />
                  </div>

                  <div className="group">
                    <label className="block text-sm font-medium text-white/90 mb-1 group-hover:text-green-300 transition-colors">
                      חוקים שתמיד צריך לקיים ✅
                    </label>
                    <textarea
                      value={profile.alwaysRules || ''}
                      onChange={(e) => updateField('alwaysRules', e.target.value)}
                      placeholder="למשל: כתוב תמיד בלשון נקבה, תמיד תסיים במשפט מניע לפעולה, הוסף סימן קריאה בכותרת..."
                      rows={2}
                      className="w-full px-4 py-2 bg-white/5 border border-[#efab4d]/20 rounded-xl text-white placeholder-[#8f7e69] resize-none outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all duration-300 hover:bg-white/10"
                    />
                  </div>
                  </div>

                  <div className="group">
                    <label className="block text-sm font-medium text-white/90 mb-1 group-hover:text-blue-300 transition-colors">
                      מילים או ביטויים אהובים עליך ✨
                    </label>
                    <textarea
                      value={profile.favoritePhrases || ''}
                      onChange={(e) => updateField('favoritePhrases', e.target.value)}
                      placeholder="מילים שאתה משתמש בהן הרבה (למשל: 'סופר מעניין', 'בגדול', 'קלאסי'...)"
                      rows={2}
                      className="w-full px-4 py-2 bg-white/5 border border-[#efab4d]/20 rounded-xl text-white placeholder-[#8f7e69] resize-none outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all duration-300 hover:bg-white/10"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 8 && (
              <div className="space-y-3 animate-in slide-in-from-left-5 duration-700">
                <div className="text-center mb-4">
                  <h2 className="text-base font-bold text-white mb-3" style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.8)' }}>
                    📝 הטאצ'ים הקטנים ודוגמת הזהב
                  </h2>
                  <p className="text-white text-sm leading-relaxed" style={{ textShadow: '1px 1px 4px rgba(0,0,0,0.7)' }}>
                    כדי להגיע לתוצאה מושלמת, אצטרך לדעת מה ההרגלים שלך
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="group">
                      <label className="block text-sm font-medium text-white mb-1 group-hover:text-yellow-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                         פתיח אהוב (Greetings)
                      </label>
                      <input
                        value={profile.greetingStyle || ''}
                        onChange={(e) => updateField('greetingStyle', e.target.value)}
                        placeholder="למשל: היי צוות, שלום לכולם, או בלי פתיח..."
                        className="w-full px-4 py-2 bg-white/5 backdrop-blur-sm border border-[#efab4d]/20 rounded-xl text-white outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all duration-300 hover:bg-white/10"
                      />
                    </div>
                    <div className="group">
                      <label className="block text-sm font-medium text-white mb-1 group-hover:text-yellow-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                        סיום אהוב (Sign-offs)
                      </label>
                      <input
                        value={profile.signOffStyle || ''}
                        onChange={(e) => updateField('signOffStyle', e.target.value)}
                        placeholder="למשל: בברכה, תודה מראש, נדבר..."
                        className="w-full px-4 py-2 bg-white/5 backdrop-blur-sm border border-[#efab4d]/20 rounded-xl text-white outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all duration-300 hover:bg-white/10"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="group">
                      <label className="block text-sm font-medium text-white mb-1 group-hover:text-cyan-200 transition-colors">
                        שימוש באימוג'י 😊
                      </label>
                      <select
                        value={profile.emojiPreference || 'moderate'}
                        onChange={(e) => updateField('emojiPreference', e.target.value)}
                        className="w-full px-4 py-2 bg-white/5 border border-[#efab4d]/20 rounded-xl text-white outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all duration-300 hover:bg-white/10 cursor-pointer"
                      >
                        <option value="none" className="bg-slate-800 text-white">ללא אימוג'י בכלל</option>
                        <option value="rare" className="bg-slate-800 text-white">מעט מאוד (רק בסוף)</option>
                        <option value="moderate" className="bg-slate-800 text-white">במידה (כאן ושם לפי ההקשר)</option>
                        <option value="lots" className="bg-slate-800 text-white">משתמש בהרבה אימוג'ים</option>
                      </select>
                    </div>
                    <div className="group">
                      <label className="block text-sm font-medium text-white mb-1 group-hover:text-cyan-200 transition-colors">
                        הרגלי עיצוב רשימות
                      </label>
                      <select
                        value={profile.listPreference || 'bullets'}
                        onChange={(e) => updateField('listPreference', e.target.value)}
                        className="w-full px-4 py-2 bg-white/5 border border-[#efab4d]/20 rounded-xl text-white outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all duration-300 hover:bg-white/10 cursor-pointer"
                      >
                        <option value="bullets" className="bg-slate-800 text-white">עדיפות לנקודות (Bullets •)</option>
                        <option value="numbers" className="bg-slate-800 text-white">עדיפות למספרים (1,2,3)</option>
                        <option value="hyphens" className="bg-slate-800 text-white">עדיפות לקווים מפרידים (-)</option>
                      </select>
                    </div>
                  </div>

                  <div className="group pt-2">
                    <label className="block text-sm font-medium text-white mb-1 group-hover:text-purple-300 transition-colors">
                      ✨ דוגמת הזהב - הדבק כאן טקסט לדוגמה שכתבת (רשות אך מומלץ)
                    </label>
                    <textarea
                      value={profile.goldenExample || ''}
                      onChange={(e) => updateField('goldenExample', e.target.value)}
                      placeholder="טקסט קצר שכתבת (מייל, פוסט, או סיכום). אני אלמד לנתח בדיוק אותו..."
                      rows={4}
                      className="w-full px-4 py-2 bg-white/5 border border-[#efab4d]/20 rounded-xl text-white placeholder-[#8f7e69] resize-none outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all duration-300 hover:bg-white/10"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 9 && (
              <div className="space-y-4 animate-in slide-in-from-left-5 duration-700">
                <div className="text-center mb-4">
                  <h2 className="text-base font-bold text-white mb-3" style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.8)' }}>
                    🔌 חיבור מנוע AI
                  </h2>
                  <p className="text-white text-sm leading-relaxed" style={{ textShadow: '1px 1px 4px rgba(0,0,0,0.7)' }}>
                    כדי שאוכל לכתוב עבורך — חבר מנוע AI אחד לפחות (Gemini, OpenAI, Claude ועוד). אפשר גם מאוחר יותר.
                  </p>
                </div>
                {/* ⚠️ הבהרת דרגה. עד כה המשתמש שדילג על מפתח קיבל טיוטה בלי לדעת
                    שהוא בדרגה מופחתת — בדיוק הדרדור השקט ש-rewriteBackendService
                    נבנה כדי למנוע. הפער נמדד: ציון סגנון 32 במסלול הכללים מול 59
                    עם שכבת הניסוח, על אותה מטלה. הניסוח כאן בשפת משתמש, בלי מספרים
                    פנימיים, ומבחין בין שלוש הדרגות האמיתיות. */}
                <div className="rounded-2xl border border-[#efab4d]/25 bg-[#efab4d]/[0.07] p-4 flex flex-col gap-2">
                  <div className="text-[13.5px] font-bold text-[#f4ecde]">אפשר להמשיך בלי מפתח — כדאי לדעת מה זה אומר</div>
                  <div className="text-[12.5px] text-[#cbbba4] leading-relaxed">
                    <b className="text-[#e8d9c2]">מה תקבל גם בלי מפתח:</b> שלד מלא של המטלה וטיוטה שנכתבת
                    מחומרי הקורס שהעלית. כל משפט תוכן קשור למקור שממנו נגזר, והמערכת
                    לא תמציא מקורות, חוקים או פסקי דין. סעיף שאין לו חומר יישאר ריק ויגיד זאת.
                  </div>
                  <div className="text-[12.5px] text-[#cbbba4] leading-relaxed">
                    <b className="text-[#e8d9c2]">המחיר:</b> המשפטים מורכבים מתוך לשון המקורות ומתוך מסגרות
                    כתיבה קבועות — הם יישארו קרובים לניסוח שבמקור, ולא ייכתבו בסגנון
                    האישי שלך. זה ההבדל המרכזי בין טיוטה שצריך לשכתב לבין טיוטה שצריך רק לערוך.
                  </div>
                  <div className="text-[12.5px] text-[#cbbba4] leading-relaxed">
                    <b className="text-[#e8d9c2]">בלי מפתח ובלי ענן:</b> באפליקציה לשולחן העבודה אפשר להריץ מודל
                    מקומי על המחשב שלך ולקבל את שכבת הניסוח המלאה — בלי מפתח, בלי עלות,
                    ובלי שהחומרים עוזבים את המכשיר.
                  </div>
                </div>

                <div>
                  <div className="text-sm font-bold text-[#e8d9c2] mb-1">בחר ספקי AI <span className="font-normal text-[#8f7e69]">(אפשר כמה)</span></div>
                  <div className="text-[12.5px] text-[#8f7e69] mb-3">לחץ על מנוע כדי להוסיף אותו — לכל אחד מפתח משלו. הכול נשמר מוצפן במכשיר.</div>
                  <div className="flex flex-wrap gap-2">
                    {ONBOARDING_AI_PROVIDERS.map(([id, label]) => {
                      const on = selectedAiProviders.includes(id);
                      return (
                        <button key={id} type="button" onClick={() => toggleAiProvider(id)}
                          className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition ${on ? 'border-[#efab4d] bg-[#efab4d]/18 text-[#f4ecde]' : 'border-white/12 bg-white/5 text-[#bcac96] hover:bg-white/10'}`}>
                          {on ? '✓ ' : ''}{label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedAiProviders.length > 0 && (
                  <div className="flex flex-col gap-2.5">
                    {selectedAiProviders.map((id) => {
                      const label = (ONBOARDING_AI_PROVIDERS.find(([pid]) => pid === id) || [id, id])[1];
                      const isLocal = ONBOARDING_LOCAL_PROVIDERS.has(id);
                      const field = isLocal ? 'baseUrl' : 'key';
                      const val = providerConfig?.[id]?.[field] || '';
                      return (
                        <div key={id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 flex items-center gap-2.5">
                          <span className="shrink-0 min-w-[78px] text-[13.5px] font-bold text-[#f4ecde]">{label}</span>
                          <input
                            type={isLocal ? 'text' : 'password'}
                            value={val}
                            onChange={(e) => setProviderField(id, field, e.target.value)}
                            placeholder={isLocal ? 'כתובת שרת מקומי (למשל http://localhost:11434)' : `מפתח API של ${label}`}
                            className="flex-1 min-w-0 px-3 py-2.5 bg-white/5 border border-[#efab4d]/20 rounded-xl text-white placeholder-[#8f7e69] text-[14px] outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition"
                            style={{ letterSpacing: isLocal ? 'normal' : '0.06em' }}
                          />
                          <button type="button" onClick={() => toggleAiProvider(id)} title="הסר" className="shrink-0 grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-[#d8a08a] hover:bg-rose-500/20 transition text-lg leading-none">×</button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="rounded-2xl border border-[#efab4d]/16 bg-white/5 p-4 flex flex-col gap-2">
                  <div className="text-[12.5px] text-[#8f7e69] leading-relaxed">המפתחות נשמרים מוצפנים במכשיר שלך בלבד. אפשר לחבר כמה מנועים ולבחור ברירת מחדל מאוחר יותר.</div>
                  <button type="button" onClick={onOpenAiSettings} className="self-start text-[13px] font-bold text-[#efab4d] border-b border-[#efab4d]/40">הגדרות מנועי AI מתקדמות (מודלים, ברירת מחדל) ↗</button>
                </div>

                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.08] p-4 flex flex-col gap-2">
                  <div className="text-[13.5px] font-bold text-[#dff3e8] flex items-center gap-1.5">🔒 רוצה לסנכרן מפתחות בין מכשירים בבטחה?</div>
                  <div className="text-[12.5px] text-[#9db8a8] leading-relaxed">
                    הפעל הצפנת קצה-לקצה — המפתחות יעלו לענן מוצפנים, וניתנים לפענוח רק עם סיסמת הצפנה שאתה בוחר.
                  </div>
                  <button type="button" onClick={onOpenSecuritySettings} className="self-start text-[13px] font-bold text-emerald-300 border-b border-emerald-300/40">פתח הגדרות אבטחה והצפנה ↗</button>
                </div>
              </div>
            )}

            {step === 10 && (
              <div className="space-y-4 animate-in slide-in-from-left-5 duration-700">
                <StyleSetupFlow
                  variant="onboarding"
                  stage="refine"
                  profile={profile}
                  onProfileMetaPatch={handleStyleMetaPatch}
                  onIngestReport={handleIngestReport}
                  onComplete={() => nextStep()}
                  onSkip={() => nextStep()}
                  autoStart={!refineAnalysisRanRef.current}
                  refinementNotes={profile.styleRefinementNotes || ''}
                  onRefinementNotesChange={(text) => updateField('styleRefinementNotes', text)}
                />
              </div>
            )}

            {step === 11 && (
              <div className="space-y-4 animate-in slide-in-from-left-5 duration-700">
                <div className="text-center mb-4">
                  <div className="w-24 h-24 bg-gradient-to-br from-green-400 to-emerald-500 text-white rounded-full flex items-center justify-center text-5xl mb-4 mx-auto animate-bounce shadow-2xl shadow-green-400/50">
                    ✨
                  </div>
                  <h2 className="text-4xl font-bold text-white mb-4" style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.8)' }}>
                    הכל מוכן להתחלה! 🎉
                  </h2>
                  <p className="text-white text-sm leading-relaxed max-w-md mx-auto" style={{ textShadow: '1px 1px 4px rgba(0,0,0,0.7)' }}>
                    שמרנו את ההעדפות המרכזיות שלך, כך שאפשר להיכנס לעבודה מיד. את כל ההגדרות המתקדמות אפשר לפתוח אחר כך מהמסכים הייעודיים.
                  </p>
                </div>

                <div className="bg-slate-900/50 backdrop-blur-md border border-slate-700/50 rounded-2xl p-4 shadow-xl space-y-4">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                    ✅ מה כבר הוגדר
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4">
                      <div className="text-xs font-semibold text-cyan-100/90 mb-2">פרופיל</div>
                      <div className="text-sm font-semibold text-white leading-relaxed">
                        {profileSummary || 'פרטי הבסיס נשמרו ויהיו זמינים לעדכון בכל שלב.'}
                      </div>
                      <div className="text-xs text-white/70 mt-2 leading-relaxed">
                        {profile.defaultAudience
                          ? `קהל היעד שהוגדר: ${profile.defaultAudience}`
                          : 'אפשר להרחיב הקשר, קהל יעד ומטרות גם אחרי הכניסה לעורך.'}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/10 p-4">
                      <div className="text-xs font-semibold text-fuchsia-100/90 mb-2">כתיבה וסגנון</div>
                      <div className="text-sm font-semibold text-white leading-relaxed">
                        {tonePreferenceLabel} · {lengthPreferenceLabel}
                      </div>
                      <div className="text-xs text-white/70 mt-2 leading-relaxed">
                        {styleFinishSummary}
                      </div>
                      {learn?.writeError && (
                        <div className="text-xs text-rose-200 mt-2 leading-relaxed">
                          ⚠ שגיאת שמירה: {learn.writeError}
                        </div>
                      )}
                      {styleExemplarsCompact.length > 0 && (
                        <div className="mt-2 space-y-1" dir="rtl">
                          <div className="text-[11px] font-semibold text-fuchsia-100/80">ככה אתה כותב:</div>
                          {styleExemplarsCompact.map((sentence, i) => (
                            <blockquote key={i} className="border-r-2 border-[#efab4d]/40 pr-2 text-[11.5px] leading-relaxed text-white/70">
                              {sentence}
                            </blockquote>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                      <div className="text-xs font-semibold text-emerald-100/90 mb-2">AI והמשך הגדרה</div>
                      <div className="text-sm font-semibold text-white leading-relaxed">
                        {providerSummary}
                      </div>
                      <div className="text-xs text-white/70 mt-2 leading-relaxed">
                        {analysisSummary}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                    <div className="text-sm font-semibold text-white">הגדרות מתקדמות עדיין זמינות</div>
                    <div className="text-xs text-white/75 leading-relaxed">
                      אם תרצה לדייק ספקים, חומרים אישיים או העדפות נוספות, אפשר לפתוח את המשטחים הייעודיים בלי להעמיס על מסך הסיום.
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={onOpenAiSettings}
                        className="px-4 py-2 rounded-xl bg-indigo-500/75 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
                      >
                        פתח הגדרות AI
                      </button>
                      <button
                        type="button"
                        onClick={onOpenPersonalStyle}
                        className="px-4 py-2 rounded-xl bg-emerald-500/75 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
                      >
                        פתח סגנון אישי וחומרים
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* פאנל הפרופיל החי — מוסתר בשלבי פתיח/עבודות/חיבור/חידוד-סגנון/סיום */}
          {![1, 4, 9, 10, 11].includes(step) && (
            <aside className="hidden lg:block lg:sticky lg:top-2 rounded-2xl border border-[#efab4d]/16 p-5 shadow-xl" style={{ background: 'rgba(26,21,18,0.55)', boxShadow: '0 20px 44px rgba(10,7,5,0.4)' }}>
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#efab4d]" style={{ boxShadow: '0 0 10px 1px rgba(239,171,77,0.6)' }} />
                  <span className="text-[14px] font-bold text-[#f4ecde]">הפרופיל שלך מתגבש</span>
                </div>
                <span className="rounded-full bg-[#efab4d]/12 px-2.5 py-1 text-[12px] font-bold text-[#efab4d]">נשמרו {liveProfileLines.length}</span>
              </div>
              {liveProfileLines.length ? (
                <div className="flex max-h-[46vh] flex-col gap-3 overflow-y-auto custom-scrollbar-slim pl-1">
                  {liveProfileLines.map((line, i) => (
                    <div key={i} className="flex items-start gap-2.5" style={{ animation: 'popIn .3s ease both' }}>
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#efab4d]/18 text-[11px] font-extrabold text-[#efab4d]">✓</span>
                      <span className="text-[13px] font-medium leading-snug text-[#ddcfb9]">{line}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 px-2 py-7 text-center text-[#8f7e69]">
                  <div className="h-10 w-10 rounded-full border border-dashed border-[#efab4d]/45" />
                  <span className="text-[13px] leading-relaxed">מתחילים להכיר —<br />כל פרט שתמלא יופיע כאן בזמן אמת.</span>
                </div>
              )}
              <div className="mt-4 border-t border-[#efab4d]/14 pt-3 text-[12px] leading-relaxed text-[#8f7e69]">ככל שאדע יותר — כך הטיוטה הראשונה תרגיש כאילו אתה כתבת אותה.</div>
            </aside>
          )}
        </div>

        {/* Modern Navigation Buttons */}
        <div className="flex items-center justify-between px-4 py-6">
          <button
            onClick={prevStep}
            disabled={step === 1}
            className={`group relative px-4 py-4 rounded-2xl text-base font-bold transition-all duration-300 ${
              step === 1 
                ? 'bg-slate-800/30 text-slate-400 cursor-not-allowed backdrop-blur-sm border border-slate-600/50' 
                : 'bg-slate-800/60 text-white hover:bg-white/10 backdrop-blur-md border border-slate-600 shadow-lg hover:shadow-xl transform hover:scale-105'
            }`}
          >
            <span className="flex items-center gap-2">
              ← חזור
            </span>
          </button>

          <button
            type="button"
            onClick={onDismiss}
            className="px-4 py-3 rounded-2xl text-sm font-semibold bg-white/10 text-white/85 border border-white/20 hover:bg-white/20 transition-all duration-300"
          >
            אמשיך אחר כך
          </button>
          
          {/* בשלבי StyleSetupFlow (4 העלאה, 10 חידוד) הכפתורים של הזרימה עצמה מקדמים —
              כפתור "המשך" כפול כאן רק מבלבל. placeholder שומר על פריסת justify-between. */}
          {SELF_ADVANCING_STEPS.has(step) ? <div className="w-[96px]" /> : (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={step === TOTAL_STEPS ? onComplete : nextStep}
              disabled={completionBlocked}
              className={`group relative px-4 py-4 rounded-2xl text-base font-bold transition-all duration-300 bg-gradient-to-r from-[#efab4d] to-[#e0a04a] text-[#251f1c] shadow-lg border border-[#f4ecde]/25 ${
                completionBlocked
                  ? 'opacity-40 cursor-not-allowed'
                  : 'hover:from-[#f0b65f] hover:to-[#e6a851] hover:shadow-2xl transform hover:scale-105'
              }`}
              style={{ boxShadow: completionBlocked ? 'none' : '0 10px 30px rgba(239, 171, 77, 0.32)' }}
            >
              <span className="flex items-center gap-2">
                {step === TOTAL_STEPS ? (profile.onboardingCompletedAt ? 'הושלם ✓' : 'סיום ✨') : 'המשך →'}
              </span>
            </button>
            {completionBlocked && (
              <div className="text-[12px] font-medium text-[#f0b65f]">חסר שם — חזור לשלב 2 כדי להשלים</div>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

