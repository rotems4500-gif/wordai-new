import React, { useState, useEffect, useRef } from 'react';
import { useDelimitedListInput } from './useDelimitedListInput';
import { getSyllabusFileAcceptList } from './services/workspaceLearningService';
import { getStyleOverview } from './services/styleIngestService';
import { deriveManualDefaultsFromMetrics } from './services/styleProfileService';
import StyleSetupFlow from './components/StyleSetupFlow';

const ONBOARDING_AI_PROVIDERS = [
  ['gemini', 'Gemini'], ['openai', 'OpenAI'], ['claude', 'Claude'], ['groq', 'Groq'],
  ['perplexity', 'Perplexity'], ['deepseek', 'DeepSeek'], ['mistral', 'Mistral'],
  ['together', 'Together.ai'], ['openrouter', 'OpenRouter'], ['xai', 'xAI (Grok)'],
  ['ollama', 'Ollama'], ['lmstudio', 'LM Studio'], ['custom', 'מותאם'],
];
const ONBOARDING_LOCAL_PROVIDERS = new Set(['ollama', 'lmstudio', 'custom']);

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
  STYLE_TRAINING_QUESTIONS,
  trainingAnswers,
  selectLearningOption,
  resetLearningGame,
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
  const [animating, setAnimating] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [styleDerived, setStyleDerived] = useState(null);
  const [styleFilled, setStyleFilled] = useState({ tone: false, length: false }); // האם ה-pre-fill באמת מילא (לא לדווח "מילאנו" כששדה כבר היה מלא)
  const [syllabusImportCycle, setSyllabusImportCycle] = useState(0);
  const [selectedAiProviders, setSelectedAiProviders] = useState(() =>
    ONBOARDING_AI_PROVIDERS.filter(([id]) => providerConfig?.[id]?.key || providerConfig?.[id]?.baseUrl).map(([id]) => id),
  );
  const toggleAiProvider = (id) => setSelectedAiProviders((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  const setProviderField = (id, field, value) => setProviderConfig((prev) => ({ ...(prev || {}), [id]: { ...((prev || {})[id] || {}), [field]: value } }));
  const syllabusFileInputRef = useRef(null);
  const previousSyllabusImportBusyRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const nextStep = () => {
    goToStep(step + 1);
  };

  const prevStep = () => {
    goToStep(step - 1);
  };

  const goToStep = (targetStep) => {
    const safeStep = Math.max(1, Math.min(12, Number(targetStep) || 1));
    if (safeStep === step || animating) return;
    setAnimating(true);
    setTimeout(() => {
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
  const styleSummary = String(profile.styleTrainingSummary || '').trim() || 'העדפות הכתיבה האישיות שלך נשמרו וימשיכו לחדד את התוצאות.';
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

  // Pre-fill שמרני של השלבים הידניים לפי baseline שנלמד מהעבודות שלב 4 (StyleSetupFlow collect).
  // ממלא רק שדות ריקים (isEmptyProfileValue) — לא דורס ערכים שהמשתמש כבר הזין.
  // אם אין baseline (המשתמש דילג) — יוצא בשקט והשלבים נשארים ריקים (graceful).
  useEffect(() => {
    if (step !== 6 && step !== 8) return;
    let ov;
    try { ov = getStyleOverview(); } catch { return; }
    if (!ov?.stats?.docCount) return;
    const d = deriveManualDefaultsFromMetrics(ov);
    setStyleDerived(d);
    if (step === 6) {
      // מסמנים filled רק כשבאמת מילאנו שדה ריק — כדי שהבאנר "מילאנו לפי הכתיבה שלך"
      // לא יופיע כשהערך כבר היה מוגדר (מ-session קודם / הזנה ידנית).
      let length = false;
      let tone = false;
      if (isEmptyProfileValue(profile?.lengthPreference) && d.lengthPreference) { updateField('lengthPreference', d.lengthPreference); length = true; }
      if (isEmptyProfileValue(profile?.tonePreference) && d.tonePreference) { updateField('tonePreference', d.tonePreference); tone = true; }
      setStyleFilled({ tone, length });
    }
  }, [step]);

  const stepIcons = {
    1: '👋',
    2: '👤',
    3: '📚',
    4: '🗂️',
    5: '👥',
    6: '🎯',
    7: '⚖️',
    8: '🎨',
    9: '📝',
    10: '🔌',
    11: '🖋️',
    12: '✨',
  };

  const stepTitles = {
    1: 'ברוכים הבאים',
    2: 'פרטים',
    3: 'קורסים',
    4: 'העבודות שלך',
    5: 'קהל ומטרות',
    6: 'קהל יעד',
    7: 'חוקים',
    8: 'סגנון',
    9: 'ניסוח',
    10: 'חיבור AI',
    11: 'חידוד הסגנון',
    12: 'סיום',
  };

  // פאנל "הפרופיל מתגבש" החי (עיצוב המוקאפ) — נגזר מהשדות שכבר מולאו
  const liveProfileLines = [
    profile.displayName && `שם: ${profile.displayName}`,
    profile.institutionName && `מוסד: ${profile.institutionName}`,
    (profile.studyTrack || profile.userRole) && `מסלול / תפקיד: ${profile.studyTrack || profile.userRole}`,
    lecturerNamesValue.length && `מרצים: ${lecturerNamesValue.join(', ')}`,
    profile.tonePreference && `טון: ${tonePreferenceLabel}`,
    profile.lengthPreference && `אורך ופירוט: ${lengthPreferenceLabel}`,
    String(profile.syllabusTopics || '').trim() && `נושאי לימוד: ${String(profile.syllabusTopics).trim().slice(0, 40)}`,
    String(profile.styleTrainingSummary || '').trim() && 'סגנון אישי: נלמד ✓',
  ].filter(Boolean);

  // האם יש baseline שנלמד מהעבודות (שלב 4) — משמש להצגת באנרים/דוגמאות בשלבים הידניים.
  const styleExemplars = Array.isArray(styleDerived?.exemplars) ? styleDerived.exemplars : [];
  const styleBaselineReady = !!(styleDerived && (styleDerived.tonePreference || styleDerived.lengthPreference || styleExemplars.length));
  const styleAutoFilled = styleFilled.tone || styleFilled.length; // האם באמת מילאנו משהו בשלב 6
  const styleToneIsSuggestion = styleFilled.tone && ['medium', 'low'].includes(styleDerived?.tonePreferenceConfidence);

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
        {/* Modern Progress Bar */}
        <div className="relative px-4 py-6">
          {/* Progress Track */}
          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-full h-2 bg-white/20 rounded-full backdrop-blur-sm">
                <div 
                  className="h-full bg-gradient-to-r from-[#efab4d] via-[#e0a04a] to-[#cba24f] rounded-full shadow-lg transition-all duration-1000 ease-out"
                  style={{
                    width: `${(step / 12) * 100}%`,
                    boxShadow: '0 0 20px rgba(239, 171, 77, 0.4)'
                  }}
                ></div>
              </div>
            </div>
            
            {/* Step Indicators */}
            <div className="relative flex justify-between">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((s) => (
                <div key={s} className="flex flex-col items-center">
                  <button
                    type="button"
                    onClick={() => goToStep(s)}
                    aria-label={`עבור לשלב ${s}: ${stepTitles[s]}`}
                    className={`relative z-10 w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-700 border-2 ${
                      s <= step
                        ? 'bg-gradient-to-br from-[#efab4d] to-[#e0a04a] text-[#251f1c] border-[#f4ecde]/30 shadow-xl transform scale-110'
                        : 'bg-white/10 text-[#d8c6ac] border-white/20 backdrop-blur-sm'
                    }`}
                    style={{
                      boxShadow: s <= step ? '0 10px 25px rgba(239, 171, 77, 0.32)' : 'none',
                      animationDelay: `${s * 0.1}s`,
                      cursor: animating ? 'default' : 'pointer'
                    }}
                    disabled={animating}
                  >
                    <span className="text-base">{stepIcons[s]}</span>
                  </button>
                  <div className={`mt-2 text-xs font-medium transition-all duration-500 ${
                    s <= step ? 'text-white' : 'text-white/60'
                  }`}>
                    {stepTitles[s]}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Content Area — דו-פאנל: טופס + פאנל פרופיל חי (עיצוב המוקאפ) */}
        <div className={`px-4 pb-4 ${[1, 4, 11, 12].includes(step) ? '' : 'lg:grid lg:grid-cols-[1fr_300px] lg:gap-4 lg:items-start'}`}>
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
              <div className="space-y-3 animate-in slide-in-from-right-5 duration-700">
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
                      className="w-full px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-white/60 resize-none outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all duration-300 hover:bg-white/25"
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
                      className="w-full px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-white/60 resize-none outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all duration-300 hover:bg-white/25"
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
                      className="w-full px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-white/60 resize-none outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all duration-300 hover:bg-white/25"
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
                      className="w-full px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all duration-300 hover:bg-white/25 cursor-pointer"
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
                      className="w-full px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-white/60 resize-none outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all duration-300 hover:bg-white/25"
                    />
                  </div>
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
                      className="w-full px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-white/60 resize-none outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all duration-300 hover:bg-white/25"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 8 && (
              <div className="space-y-3 animate-in slide-in-from-bottom-5 duration-700">
                <div className="text-center mb-4">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-base font-bold text-white" style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.8)' }}>
                      🎨 למד את הסגנון שלי
                    </h2>
                    <button
                      type="button"
                      onClick={resetLearningGame}
                      className="px-4 py-2 rounded-xl bg-white/5 backdrop-blur-sm border border-[#efab4d]/20 text-white text-sm font-semibold hover:bg-white/10 transition-all duration-300 shadow-lg"
                    >
                      🔄 איפוס
                    </button>
                  </div>
                  <p className="text-white text-sm leading-relaxed" style={{ textShadow: '1px 1px 4px rgba(0,0,0,0.7)' }}>
                    בחר את הניסוחים שמתאימים לך כדי שאלמד את הסגנון האישי שלך
                  </p>
                </div>

                {styleBaselineReady && styleExemplars.length > 0 && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4" dir="rtl">
                    <div className="text-sm font-bold text-[#f4ecde] mb-2">ככה אתה כותב:</div>
                    <div className="space-y-2">
                      {styleExemplars.slice(0, 3).map((sentence, i) => (
                        <blockquote
                          key={i}
                          className="border-r-2 border-[#efab4d]/40 pr-3 text-[13px] leading-relaxed text-[#ddcfb9]"
                        >
                          {String(sentence || '').trim()}
                        </blockquote>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                  {STYLE_TRAINING_QUESTIONS.map((question, index) => (
                    <div 
                      key={question.id} 
                      className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-5 shadow-lg hover:bg-white/15 transition-all duration-300"
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      <div className="text-base font-bold text-white mb-4 drop-shadow-sm">
                        {question.title}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {question.options.map((option) => {
                          const selected = trainingAnswers[question.id] === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => selectLearningOption(question.id, option.id)}
                              className={`text-right p-4 rounded-xl border-2 transition-all duration-300 transform hover:scale-105 ${
                                selected
                                  ? 'border-yellow-300 bg-yellow-400/20 text-white shadow-lg shadow-yellow-400/25'
                                  : 'border-white/30 bg-white/10 text-white/90 hover:border-white/50 hover:bg-white/20'
                              }`}
                            >
                              <div className="text-sm font-bold mb-1 text-shadow-sm">{option.label}</div>
                              <div className="text-xs leading-relaxed opacity-90">{option.text}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="bg-gradient-to-r from-white/10 to-white/20 backdrop-blur-md border border-white/30 rounded-2xl p-4 shadow-xl">
                  <div className="text-sm font-bold text-white mb-1">💡 מה למדתי עד עכשיו:</div>
                  <div className="text-sm text-white/80 leading-relaxed">
                    {profile.styleTrainingSummary || 'עדיין אין מספיק בחירות כדי ללמוד את הסגנון שלך.'}
                  </div>
                </div>
              </div>
            )}

                        {step === 9 && (
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
                        className="w-full px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all duration-300 hover:bg-white/25 cursor-pointer"
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
                        className="w-full px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all duration-300 hover:bg-white/25 cursor-pointer"
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
                      className="w-full px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-white/60 resize-none outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all duration-300 hover:bg-white/25"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 10 && (
              <div className="space-y-4 animate-in slide-in-from-left-5 duration-700">
                <div className="text-center mb-4">
                  <h2 className="text-base font-bold text-white mb-3" style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.8)' }}>
                    🔌 חיבור מנוע AI
                  </h2>
                  <p className="text-white text-sm leading-relaxed" style={{ textShadow: '1px 1px 4px rgba(0,0,0,0.7)' }}>
                    כדי שאוכל לכתוב עבורך — חבר מנוע AI אחד לפחות (Gemini, OpenAI, Claude ועוד). אפשר גם מאוחר יותר.
                  </p>
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

            {step === 11 && (
              <div className="space-y-4 animate-in slide-in-from-left-5 duration-700">
                <StyleSetupFlow
                  variant="onboarding"
                  stage="refine"
                  profile={profile}
                  providerConfig={providerConfig}
                  onProfileMetaPatch={handleStyleMetaPatch}
                  onComplete={() => nextStep()}
                  onSkip={() => nextStep()}
                />
              </div>
            )}

            {step === 12 && (
              <div className="space-y-4 animate-in slide-in-from-top-5 duration-700">
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
                        {styleSummary}
                      </div>
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
          {![1, 4, 10, 11, 12].includes(step) && (
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
          
          <button
            onClick={step === 12 ? onComplete : nextStep}
            className="group relative px-4 py-4 rounded-2xl text-base font-bold transition-all duration-300 bg-gradient-to-r from-[#efab4d] to-[#e0a04a] text-[#251f1c] hover:from-[#f0b65f] hover:to-[#e6a851] shadow-lg hover:shadow-2xl transform hover:scale-105 border border-[#f4ecde]/25"
            style={{ boxShadow: '0 10px 30px rgba(239, 171, 77, 0.32)' }}
          >
            <span className="flex items-center gap-2">
              {step === 12 ? (profile.onboardingCompletedAt ? 'הושלם ✓' : 'סיום ✨') : 'המשך →'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

