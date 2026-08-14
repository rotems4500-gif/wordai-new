// StyleSetupFlow.jsx — זרימת בניית פרופיל סגנון מאוחדת (intake → processing → verify → summary).
// משמש בשני מקומות: אונבורדינג (variant='onboarding', theme כהה glassmorphism, אמבר #efab4d)
// ופאנל הגדרות (variant='panel', theme לבן/slate כמו StyleProfilePanel). הלוגיקה זהה, רק העיצוב שונה.
//
// שלב 1 (intake): שני מסלולי קלט מקבילים — העלאת עבודות (ingestAndAnalyze מקומי, ללא דפוסים)
//                  וניתוח דרך AI חיצוני (פרומפט מוכן להעתקה + הדבקת פלט JSON, אפשר כמה פעמים).
// שלב 2 (processing): runUnifiedStyleAnalysis מאחד את שני המקורות לפרופיל אחד + בונה תור אימות.
// שלב 3 (verify): שאלת אימות אחת בכל פעם — pin / reject / skip על דפוסים ועל "negative space".
// שלב 4 (summary): finalizeStyleVerification + סיכום קצר וכפתור סיום.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ingestAndAnalyze,
  runUnifiedStyleAnalysis,
  removeNegativeSpaceItem,
  finalizeStyleVerification,
  pinPattern,
  rejectPattern,
  setStyleEngineEnabled,
  getStyleOverview,
} from '../services/styleIngestService';
// ייבוא namespace נוסף (ולא named) עבור getRepresentativeExcerpts: הפונקציה נוספה לשירות
// במקביל, ו-named import של export חסר מפיל את ה-build. כאן היעדרותה מדרדרת ל-[] בשקט.
import * as styleIngestModule from '../services/styleIngestService';
import { getSampleStoreStats } from '../services/styleSampleStore';
import {
  buildExternalPatternAnalysisPrompt,
  buildVerificationQuestions,
  parsePatternExtractionResult,
  buildStyleWritingReport,
  CONFIDENCE_LABELS,
} from '../services/styleProfileService';
import { getExternalAnalysisProviderHint } from '../services/aiService';

// האם ההדבקה בכלל נראית כמו JSON — משמש רק כדי לבחור הודעת שגיאה מדויקת
// ("נקרא אבל אין שדות מוכרים" מול "לא JSON בכלל"). לא שער קליטה.
const isJsonLike = (text) => /[{[][\s\S]*[}\]]/.test(String(text || ''));

// סוגי קבצים לעבודות עבר — זהה ל-PAST_WORKS_ACCEPT ב-ProfileOnboarding.jsx.
const PAST_WORKS_ACCEPT = '.docx,.pdf,.txt,.md,.rtf,.html';

// רשימת ספקים לניתוח חיצוני — מועתקת מ-ProfileOnboarding.jsx (EXTERNAL_PROVIDER_OPTIONS).
const EXTERNAL_PROVIDER_OPTIONS = [
  { id: 'gemini', label: 'Gemini' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'claude', label: 'Claude' },
  { id: 'groq', label: 'Groq' },
  { id: 'perplexity', label: 'Perplexity' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'mistral', label: 'Mistral' },
  { id: 'together', label: 'Together.ai' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'xai', label: 'xAI (Grok)' },
  { id: 'ollama', label: 'Ollama' },
  { id: 'lmstudio', label: 'LM Studio' },
  { id: 'custom', label: 'ספק אחר / מותאם' },
];

// C2 — ספקים שהממשק שלהם לא תומך בהעלאת קבצים (ר' EXTERNAL_ANALYSIS_PROVIDER_HINTS
// ב-aiService: "אם אין העלאת קבצים... הדבק קטעים מייצגים"). כשאחד מהם נבחר, ה-toggle
// של "כלול קטעים מייצגים" נדלק אוטומטית — כל עוד המשתמש לא נגע בו ידנית.
const NO_FILE_UPLOAD_PROVIDERS = new Set(['groq', 'perplexity', 'ollama', 'lmstudio']);

// תוויות עבריות לשדות שהמילוי האוטומטי (deriveProfileFactsFromSamples) יכול למלא.
const AUTO_FILLED_FIELD_LABELS = {
  displayName: 'שם',
  institutionName: 'מוסד',
  studyTrack: 'חוג או מסלול',
  studentId: 'ת.ז.',
  lecturerNames: 'מרצים',
  currentCourses: 'קורסים',
};

const PHASE_STEPS = [
  { key: 'intake', label: 'קליטה' },
  { key: 'processing', label: 'עיבוד' },
  { key: 'verify', label: 'אימות' },
  { key: 'summary', label: 'סיכום' },
];

// --- stage: אילו שלבים מהזרימה פעילים (אורתוגונלי ל-variant שהוא רק theme). ---
// full = ההתנהגות הנוכחית (StyleProfilePanel). collect = מוקדם, העלאה בלבד ללא verify.
// refine = מאוחר, הדבקה+ניתוח עמוק→verify, עם אזור העלאה קומפקטי.
const STAGE_CONFIG = {
  full:    { showUpload: true,  showExternal: true,  runVerify: true },   // התנהגות נוכחית — StyleProfilePanel
  collect: { showUpload: true,  showExternal: true,  runVerify: false },  // מוקדם: העלאה ו/או הדבקת פלט חיצוני → baseline → summary קצר (בלי אימות)
  refine:  { showUpload: true,  showExternal: true,  runVerify: true, compactUpload: true }, // מאוחר: הדבקה+ניתוח עמוק→verify
};

// --- ערכות עיצוב לפי variant. מחלקה אחת לכל תפקיד — משומשת בכל ה-JSX, בלי תנאים מפוזרים. ---
const THEME_PANEL = {
  wrapper: 'text-slate-800',
  stepperTrack: 'bg-slate-100',
  stepperDone: 'bg-indigo-500',
  stepperCurrent: 'text-indigo-600 font-extrabold',
  stepperMuted: 'text-slate-400',
  card: 'bg-white border border-slate-200 rounded-2xl p-4',
  cardAlt: 'bg-slate-50 border border-slate-200 rounded-2xl p-4',
  title: 'text-[15px] font-extrabold text-slate-800',
  subtitle: 'text-[12.5px] text-slate-500 leading-relaxed',
  muted: 'text-[12px] text-slate-400',
  label: 'block text-[12.5px] font-semibold text-slate-600 mb-1',
  input: 'w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-indigo-300',
  textarea: 'w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-300 resize-none',
  textareaReadonly: 'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 text-xs leading-relaxed resize-none outline-none',
  buttonPrimary: 'px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
  buttonSecondary: 'px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-[13px] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
  buttonGhost: 'px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[13px] font-semibold transition-colors disabled:opacity-50',
  buttonDanger: 'px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[13px] font-bold transition-colors disabled:opacity-50',
  chip: 'inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100',
  chipRemove: 'text-indigo-400 hover:text-rose-600',
  dropzone: 'border-2 border-dashed border-slate-200 bg-slate-50 hover:bg-slate-100',
  dropzoneActive: 'border-indigo-400 bg-indigo-50',
  progressTrack: 'w-full h-1.5 bg-slate-100 rounded-full overflow-hidden',
  progressFill: 'h-full bg-indigo-500 rounded-full transition-all duration-500',
  successBox: 'text-[12.5px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2',
  errorBox: 'text-[12.5px] font-semibold text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2',
  hintBox: 'text-[12px] text-cyan-700 bg-cyan-50 border border-cyan-100 rounded-lg px-3 py-2 leading-relaxed',
  spinner: 'w-3.5 h-3.5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin',
  questionTypeLabel: 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100',
  questionLabel: 'text-[15px] font-extrabold text-slate-800',
  questionEvidence: 'text-[12.5px] text-slate-500 italic',
  confidenceBadge: 'text-[12px] font-bold px-3 py-1 rounded-full border',
};

const THEME_ONBOARDING = {
  wrapper: 'text-white',
  stepperTrack: 'bg-white/15',
  stepperDone: 'bg-[#efab4d]',
  stepperCurrent: 'text-[#efab4d] font-extrabold',
  stepperMuted: 'text-white/40',
  card: 'bg-white/5 border border-white/15 rounded-2xl p-4',
  cardAlt: 'bg-slate-900/40 border border-slate-700/70 rounded-2xl p-4',
  title: 'text-[15px] font-extrabold text-white',
  subtitle: 'text-[12.5px] text-white/70 leading-relaxed',
  muted: 'text-[12px] text-[#8f7e69]',
  label: 'block text-[12.5px] font-semibold text-white/80 mb-1',
  input: 'w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white outline-none focus:ring-2 focus:ring-amber-400',
  textarea: 'w-full px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 outline-none focus:ring-2 focus:ring-amber-400 resize-none',
  textareaReadonly: 'w-full px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-xl text-white/90 text-xs leading-relaxed resize-none outline-none',
  buttonPrimary: 'px-4 py-2 rounded-xl bg-emerald-500/80 hover:bg-emerald-500 text-white text-[13px] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
  buttonSecondary: 'px-4 py-2 rounded-xl bg-cyan-500/70 hover:bg-cyan-500 text-white text-[13px] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
  buttonGhost: 'px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 text-[13px] font-semibold transition-colors disabled:opacity-50',
  buttonDanger: 'px-4 py-2 rounded-xl bg-rose-500/70 hover:bg-rose-500 text-white text-[13px] font-bold transition-colors disabled:opacity-50',
  chip: 'inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full bg-[#efab4d]/15 text-[#efab4d] border border-[#efab4d]/30',
  chipRemove: 'text-[#efab4d]/70 hover:text-rose-300',
  dropzone: 'border-2 border-dashed border-[#efab4d]/30 bg-white/5 hover:bg-white/10',
  dropzoneActive: 'border-[#efab4d]/60 bg-white/10',
  progressTrack: 'w-full h-1.5 bg-white/15 rounded-full overflow-hidden',
  progressFill: 'h-full bg-gradient-to-r from-[#efab4d] via-[#e0a04a] to-[#cba24f] rounded-full transition-all duration-500',
  successBox: 'text-[12.5px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-400/20 rounded-lg px-3 py-2',
  errorBox: 'text-[12.5px] font-semibold text-rose-300 bg-rose-500/10 border border-rose-400/20 rounded-lg px-3 py-2',
  hintBox: 'text-[12px] text-cyan-100 bg-cyan-950/35 border border-cyan-400/20 rounded-lg px-3 py-2 leading-relaxed',
  spinner: 'w-3.5 h-3.5 border-2 border-[#efab4d]/40 border-t-[#efab4d] rounded-full animate-spin',
  questionTypeLabel: 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#efab4d]/15 text-[#efab4d] border border-[#efab4d]/30',
  questionLabel: 'text-[15px] font-extrabold text-white',
  questionEvidence: 'text-[12.5px] text-white/60 italic',
  confidenceBadge: 'text-[12px] font-bold px-3 py-1 rounded-full border',
};

// תגית ודאות עם צבע לפי level — סובלני לצורות שונות של אובייקט confidence.
function resolveConfidence(confidence) {
  if (!confidence) return { label: '', score: null };
  const level = typeof confidence === 'string' ? confidence : confidence.level;
  const score = typeof confidence === 'object' ? confidence.score : null;
  return {
    label: CONFIDENCE_LABELS[level] || '',
    score: Number.isFinite(Number(score)) ? Math.round(Number(score)) : null,
  };
}

export default function StyleSetupFlow({
  variant = 'panel',
  stage = 'full',
  profile = {},
  onProfileMetaPatch = null,
  onComplete = null,
  onSkip = null,
  onIngestReport = null,
  providerConfig = null,
  // autoStart — כשיש כבר מסמכים שנקלטו קודם (למשל בשלב 'collect' המוקדם) מדלגים על שלב
  // ה-intake כאן ומריצים ניתוח מיד, כדי לא להציג שוב את אותם טפסי העלאה/הדבקת JSON.
  autoStart = false,
  // refinementNotes/onRefinementNotesChange — שדה "דיוקים" חופשי המוצג רק ב-stage='refine'
  // summary (ProfileOnboarding שלב 11). נשמר לפרופיל דרך ה-callback, לא דרך onProfileMetaPatch
  // (שממזג רק לתוך שדה ריק — כאן רוצים לאפשר עריכה חוזרת בתוך אותו ביקור).
  refinementNotes = '',
  onRefinementNotesChange = null,
}) {
  const T = variant === 'onboarding' ? THEME_ONBOARDING : THEME_PANEL;
  // stage — אילו שלבים פעילים. ברירת מחדל 'full' = אפס שינוי התנהגות למי שקורא בלי stage.
  const stageCfg = STAGE_CONFIG[stage] || STAGE_CONFIG.full;

  // נבדק פעם אחת ב-mount (סינכרוני, לפני הרינדור הראשון) כדי שלא יהיה הבזק של שלב ה-intake
  // כשעומדים לדלג עליו. אותו מקור-אמת כמו docStats למטה.
  const [shouldAutoStart] = useState(() => {
    if (!autoStart) return false;
    try { return (getSampleStoreStats()?.docCount || 0) > 0; } catch { return false; }
  });

  // --- שלב הזרימה ---
  const [phase, setPhase] = useState(shouldAutoStart ? 'processing' : 'intake');

  // --- Phase 1: העלאת עבודות ---
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploadReport, setUploadReport] = useState(null); // result.ingest האחרון
  const [fileLog, setFileLog] = useState([]); // [{name,status}] — כל קובץ שהסתיים בהעלאה הנוכחית
  const [docStats, setDocStats] = useState(() => {
    try { return getSampleStoreStats(); } catch { return null; }
  });

  // --- Phase 1: ניתוח דרך AI חיצוני ---
  const [externalProviderId, setExternalProviderId] = useState('gemini');
  const [copyState, setCopyState] = useState('');
  const [pasteRaw, setPasteRaw] = useState('');
  const [pasteError, setPasteError] = useState('');
  const [pastedOutputs, setPastedOutputs] = useState([]); // [{ id, raw, patternsCount, structuralCount, avoidedCount }]

  // C1 — סקירת המנוע (metrics שכבר נמדדו) נכנסת לפרומפט החיצוני, כדי שהמודל החיצוני
  // לא ינחש מחדש מספרים שכבר יש לנו. אותו accessor שמשמש את writingReport.
  const [styleEngine, setStyleEngine] = useState(() => {
    try { return getStyleOverview(); } catch { return null; }
  });

  // C2 — "כלול קטעים מייצגים בתוך הפרומפט". ברירת המחדל כבויה (עדיף לצרף קבצים), ונדלקת
  // אוטומטית רק לספקים בלי העלאת קבצים — ורק כל עוד המשתמש לא נגע ב-checkbox בעצמו.
  const [includeExcerpts, setIncludeExcerpts] = useState(false);
  const excerptsToggleTouchedRef = useRef(false);
  const [excerpts, setExcerpts] = useState([]);
  const [excerptsLoading, setExcerptsLoading] = useState(false);

  const providerLacksFileUpload = NO_FILE_UPLOAD_PROVIDERS.has(externalProviderId);

  // F6 — רמז ספציפי-ספק (טקסט עברי מ-aiService) מתחת ל-select לפי הספק הנבחר.
  const providerHint = useMemo(() => {
    try {
      return getExternalAnalysisProviderHint(externalProviderId) || '';
    } catch {
      return '';
    }
  }, [externalProviderId]);

  // stage='refine' summary: "ככה אתה כותב" + הצעות לשיפור, במקום להציג שוב טפסי העלאה.
  // נגזר מ-getStyleOverview() העדכני ברגע שמגיעים לסיכום — אחרי שהניתוח (auto או ידני) רץ.
  const writingReport = useMemo(() => {
    if (stage !== 'refine' || phase !== 'summary') return null;
    try {
      return buildStyleWritingReport(getStyleOverview());
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, phase]);

  // --- Phase 2: עיבוד ---
  const [processingText, setProcessingText] = useState('מאחד את מקורות הסגנון...');
  const [processingError, setProcessingError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);

  // --- Phase 3: אימות ---
  const [questions, setQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answerCounts, setAnswerCounts] = useState({ pinned: 0, rejected: 0, skipped: 0 });

  // --- Phase 4: סיכום ---
  const [summaryData, setSummaryData] = useState(null); // { confidence, patternsCount, docCount }
  // שדות פרופיל שהניתוח מילא אוטומטית מהעבודות — מוצג למשתמש כדי שכתיבה לפרופיל לא תהיה שקטה.
  const [autoFilledFields, setAutoFilledFields] = useState([]);

  const docCount = docStats?.docCount || 0;
  const canAnalyze = docCount > 0 || pastedOutputs.length > 0;

  // C2 — אין קורפוס ⇒ אין מה לצרף לפרומפט, ה-checkbox מושבת.
  const excerptsAvailable = docCount > 0;

  // C2 — ברירת מחדל אוטומטית לפי הספק. flips רק כשהמשתמש עוד לא נגע ב-checkbox
  // (excerptsToggleTouchedRef), כדי שבחירה ידנית לא תידרס במעבר בין ספקים.
  useEffect(() => {
    if (excerptsToggleTouchedRef.current) return;
    setIncludeExcerpts(providerLacksFileUpload && excerptsAvailable);
  }, [providerLacksFileUpload, excerptsAvailable]);

  // C2 — שליפת הקטעים המייצגים. הפונקציה עשויה להיות סינכרונית או async, ועשויה גם לא
  // להתקיים כלל (גרסת שירות ישנה) — כל שלושת המקרים מדרדרים ל-[] בלי לרוקן את הכרטיס.
  useEffect(() => {
    if (!includeExcerpts || !excerptsAvailable) {
      setExcerpts([]);
      setExcerptsLoading(false);
      return undefined;
    }
    let cancelled = false;
    setExcerptsLoading(true);
    (async () => {
      let out = [];
      try {
        const fn = styleIngestModule?.getRepresentativeExcerpts;
        if (typeof fn === 'function') out = await fn({ max: 6, maxChars: 5000 });
      } catch (err) {
        console.error('StyleSetupFlow: getRepresentativeExcerpts failed', err);
        out = [];
      }
      if (cancelled) return;
      setExcerpts(Array.isArray(out) ? out.map((e) => String(e || '').trim()).filter(Boolean) : []);
      setExcerptsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [includeExcerpts, excerptsAvailable, docStats]);

  // C1+C2 — הפרומפט נבנה עם המדדים שכבר נמדדו ועם הקטעים (כשהוקטע ה-toggle דלוק).
  // memo כדי שהטקסט לא ייבנה מחדש בכל רינדור (הוא ארוך — עד אלפי תווים).
  const promptText = useMemo(() => {
    try {
      return buildExternalPatternAnalysisPrompt({
        profile,
        engine: styleEngine,
        excerpts: includeExcerpts ? excerpts : [],
      }) || '';
    } catch (err) {
      console.error('StyleSetupFlow: buildExternalPatternAnalysisPrompt failed', err);
      return '';
    }
  }, [profile, styleEngine, includeExcerpts, excerpts]);

  // C2 — גודל הפרומפט מוצג חי, כדי שתוספת הקטעים לא תפתיע (חלון הקשר של הספק).
  const promptCharsLabel = useMemo(
    () => `~${(promptText.length || 0).toLocaleString('en-US')}`,
    [promptText],
  );

  // ============================ Phase 1 handlers ============================

  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    setUploadError('');
    setUploadReport(null);
    setFileLog([]);
    setUploading(true);
    setUploadProgress(`מנתח מסמך 1/${files.length}...`);
    try {
      const result = await ingestAndAnalyze(files, {
        runPatterns: false,
        onProgress: (info) => {
          // onProgress מ-ingestFiles שולח { index, total, name, status } לכל קובץ; אותו
          // callback משמש גם ל-computeChunkEmbeddings (צורה אחרת) — לכן סובלנות מלאה.
          if (!info || typeof info !== 'object') return;
          const total = Number(info.total ?? files.length) || files.length;
          const name = String(info.name || '').trim();
          if (info.status === 'done') {
            // צובר את outcome פר-קובץ ('added'|'skipped'|'failed') — התצוגה נשענת עליו
            // ישירות (בלי הצלבת שמות), כך שגם קבצים כפולי-שם מסומנים נכון.
            // outcome לא מזוהה → לא רושמים שורה כלל (עדיף כלום על ✓ שקרי).
            const outcome = ['added', 'skipped', 'failed'].includes(info.outcome) ? info.outcome : null;
            if (name && outcome) setFileLog((prev) => [...prev, { name, outcome }]);
            return;
          }
          // computeChunkEmbeddings→embedTexts שולח { done:<n>, total:<n> } בלי name/index —
          // שלב בניית טביעת-האצבע. מציגים הודעה קבועה במקום להשאיר את שם הקובץ האחרון (progress קופא).
          if (typeof info.done === 'number' && !name && !Number.isFinite(Number(info.index))) {
            setUploadProgress('בונה טביעת-אצבע סגנונית...');
            return;
          }
          const idx = Number(info.index);
          const current = Number.isFinite(idx) ? Math.min(idx + 1, total) : null;
          if (name && current) {
            setUploadProgress(`מנתח את «${name}» (${current}/${total})...`);
          } else if (current) {
            setUploadProgress(`מנתח מסמך ${current}/${total}...`);
          }
        },
      });
      // F3.1 — דוח העלאה מפורט (נוספו/דולגו/פונו/כשלים) מוצג מתחת לאזור ההעלאה.
      setUploadReport(result?.ingest || null);
      // שלב B.3 — מדווח את דוח ההעלאה החוצה (best-effort; לעולם לא שובר את הזרימה).
      if (typeof onIngestReport === 'function') {
        try { onIngestReport(result?.ingest || null); } catch { /* noop */ }
      }
      const stats = getSampleStoreStats();
      setDocStats(stats);
      // C1 — רענון המדדים אחרי קליטה, כדי שהפרומפט החיצוני יישא את המספרים המעודכנים.
      try { setStyleEngine(getStyleOverview()); } catch { /* noop */ }
      // F3.2 — משתמש שהעלה ומדלג (בלי "נתח והמשך") עדיין מקבל מנוע פעיל (כמו בזרימה הישנה).
      if ((stats?.docCount || 0) > 0) {
        try { setStyleEngineEnabled(true); } catch (err) {
          console.error('StyleSetupFlow: setStyleEngineEnabled failed', err);
        }
      }
    } catch (err) {
      console.error('StyleSetupFlow: ingestAndAnalyze failed', err);
      setUploadError(`העלאת הקבצים נכשלה: ${err?.message || 'שגיאה לא ידועה'}`);
      // כשל כולל — מנקים את ה-✓ הפר-קובציים כדי שלא יוצגו סימוני הצלחה ירוקים לצד השגיאה.
      setFileLog([]);
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  }, [onIngestReport]);

  const handleFileInputChange = useCallback((event) => {
    const files = event.target.files;
    event.target.value = '';
    handleFiles(files);
  }, [handleFiles]);

  const handleDrop = useCallback((event) => {
    event.preventDefault();
    setDragActive(false);
    if (uploading) return;
    handleFiles(event.dataTransfer?.files);
  }, [uploading, handleFiles]);

  const handleCopyPrompt = useCallback(async () => {
    const text = String(promptText || '').trim();
    if (!text) {
      setCopyState('אין פרומפט להעתקה');
      return;
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopyState('הועתק ללוח ✓');
    } catch {
      setCopyState('ההעתקה נכשלה — סמן ידנית והעתק');
    }
  }, [promptText]);

  const handleAddPastedOutput = useCallback(() => {
    const raw = String(pasteRaw || '').trim();
    if (!raw) return;
    setPasteError('');
    try {
      // lenientTypes:true — יישור למיזוג בשירות (applyExternalPatternAnalyses), כדי שפלט
      // תקין עם type לא-סטנדרטי לא יידחה כאן ולא יגיע כלל למסלול הלניאנטי.
      const parsed = parsePatternExtractionResult(raw, { lenientTypes: true });
      const count = parsed?.patterns?.length || 0;
      // C4 — parsePatternExtractionResult מחזיר עכשיו גם structuralSignature (5 מפתחות,
      // לעולם לא null) ו-avoidedPhrases. פלט "מטא בלבד" (0 דפוסים אבל חתימה מבנית או
      // ניסוחים נמנעים) נשמר בשירות, ולכן הוא מתקבל גם כאן. הדחייה נשארת רק כשלא נקלט כלום.
      const structuralCount = Object.values(parsed?.structuralSignature || {})
        .filter((v) => String(v || '').trim()).length;
      const negativeCount = parsed?.negativeSpace?.length || 0;
      const avoidedCount = parsed?.avoidedPhrases?.length || 0;
      // ⚠️ עד 12.8.26 השער הזה התעלם מ-hasMeta ודחה פלט "מטא בלבד" (profileSummary/
      // style/coverPageDefaults) בהודעת "לא נקלט כלום" — בזמן ש-applyExternalPatternAnalyses
      // דווקא ממזג אותו לפרופיל. זה בדיוק המקרה של פלט פרופיל ההיכרות.
      const hasMeta = parsed?.hasMeta === true;
      if (count <= 0 && structuralCount <= 0 && avoidedCount <= 0 && negativeCount <= 0 && !hasMeta) {
        // הודעה שמבדילה בין "לא JSON בכלל" ל-"JSON תקין בלי שדות מוכרים" — בלי ההבחנה
        // הזאת המשתמש מדביק שוב ושוב את אותו פלט תקין ולא מבין מה חסר.
        // ההודעה מציגה את המפתחות שכן נמצאו בפלט — בלי זה המשתמש מדביק שוב ושוב
        // את אותו JSON תקין בלי דרך לדעת מה בדיוק לא הותאם.
        const foundKeys = (parsed?.topKeys || []).slice(0, 8).join(', ');
        setPasteError(isJsonLike(raw)
          ? `ה-JSON נקרא, אבל אין בו אף שדה מוכר. נמצאו: ${foundKeys || '—'}. מצופה patterns / structuralSignature / avoidedPhrases / style / coverPageDefaults. ודא שהרצת את הפרומפט שמוצג כאן, והעתק את כל הפלט.`
          : 'לא נקלט כלום מהטקסט הזה — ודא שהדבקת את כל התשובה מה-AI (JSON מלא, מהסוגר הפותח ועד הסוגר הסוגר).');
        return;
      }
      setPastedOutputs((prev) => [
        ...prev,
        { id: `ext_${Date.now()}_${prev.length}`, raw, patternsCount: count, structuralCount, avoidedCount, hasMeta },
      ]);
      setPasteRaw('');
    } catch (err) {
      console.error('StyleSetupFlow: parsePatternExtractionResult failed', err);
      setPasteError('לא נקלט כלום מהטקסט הזה — ודא שהדבקת את כל התשובה מה-AI (JSON מלא).');
    }
  }, [pasteRaw]);

  const handleRemovePastedOutput = useCallback((id) => {
    setPastedOutputs((prev) => prev.filter((o) => o.id !== id));
  }, []);

  // ============================ Phase 2: עיבוד מאוחד ============================

  const runAnalysis = useCallback(async () => {
    setAnalyzing(true);
    setProcessingError('');
    setProcessingText('מאחד את מקורות הסגנון...');
    try {
      const result = await runUnifiedStyleAnalysis({
        externalRawTexts: pastedOutputs.map((p) => p.raw),
        onProgress: (info) => {
          const text = typeof info === 'string' ? info : info?.text || info?.message;
          if (text) setProcessingText(text);
        },
        applyMetaPatch: !onProfileMetaPatch,
      });

      if (result?.metaPatch && onProfileMetaPatch) {
        try { onProfileMetaPatch(result.metaPatch); } catch (err) {
          console.error('StyleSetupFlow: onProfileMetaPatch failed', err);
        }
      }

      setAutoFilledFields(Array.isArray(result?.profileFactsFilled) ? result.profileFactsFilled : []);

      if (result?.ok) {
        try { setStyleEngineEnabled(true); } catch (err) {
          console.error('StyleSetupFlow: setStyleEngineEnabled failed', err);
        }
      } else if (result?.error) {
        setProcessingError(String(result.error));
        setAnalyzing(false);
        return;
      }

      proceedFromProcessing();
    } catch (err) {
      console.error('StyleSetupFlow: runUnifiedStyleAnalysis failed', err);
      setProcessingError(err?.message || 'הניתוח נכשל. אפשר לנסות שוב או להמשיך עם מה שיש.');
    } finally {
      setAnalyzing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pastedOutputs, onProfileMetaPatch]);

  // עובר משלב העיבוד הלאה: בונה תור אימות מהפרופיל הנוכחי; אם ריק — ישר לסיכום.
  const proceedFromProcessing = useCallback(() => {
    // stage: ב-collect אין verify — דלג ישר לסיכום בלי לבנות תור.
    if (!stageCfg.runVerify) {
      goToSummary();
      return;
    }
    let builtQuestions = [];
    try {
      const overview = getStyleOverview();
      builtQuestions = buildVerificationQuestions(overview, {}) || [];
    } catch (err) {
      console.error('StyleSetupFlow: buildVerificationQuestions failed', err);
      builtQuestions = [];
    }
    if (builtQuestions.length > 0) {
      setQuestions(builtQuestions);
      setQuestionIndex(0);
      setAnswerCounts({ pinned: 0, rejected: 0, skipped: 0 });
      setPhase('verify');
    } else {
      goToSummary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStartAnalyze = useCallback(() => {
    setPhase('processing');
    runAnalysis();
  }, [runAnalysis]);

  // shouldAutoStart: phase כבר אותחל ל-'processing' (למעלה) כדי שלא יהיה הבזק intake — כאן
  // רק מפעילים בפועל את הניתוח, פעם אחת ב-mount.
  useEffect(() => {
    if (shouldAutoStart) runAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetryAnalysis = useCallback(() => {
    runAnalysis();
  }, [runAnalysis]);

  const handleContinueAnyway = useCallback(() => {
    setProcessingError('');
    proceedFromProcessing();
  }, [proceedFromProcessing]);

  // ============================ Phase 3: אימות ============================

  const currentQuestion = questions[questionIndex] || null;

  const advanceQuestion = useCallback(() => {
    const nextIndex = questionIndex + 1;
    if (nextIndex < questions.length) {
      setQuestionIndex(nextIndex);
    } else {
      goToSummary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionIndex, questions.length]);

  const handlePatternAnswer = useCallback((action) => {
    const q = questions[questionIndex];
    if (!q) return;
    try {
      if (action === 'yes') {
        pinPattern(q.patternId, true);
        setAnswerCounts((prev) => ({ ...prev, pinned: prev.pinned + 1 }));
      } else if (action === 'no') {
        rejectPattern(q.patternId);
        setAnswerCounts((prev) => ({ ...prev, rejected: prev.rejected + 1 }));
      } else {
        setAnswerCounts((prev) => ({ ...prev, skipped: prev.skipped + 1 }));
      }
    } catch (err) {
      console.error('StyleSetupFlow: pattern answer failed', err);
    }
    advanceQuestion();
  }, [questions, questionIndex, advanceQuestion]);

  const handleNegativeAnswer = useCallback((action) => {
    const q = questions[questionIndex];
    if (!q) return;
    try {
      if (action === 'remove') {
        removeNegativeSpaceItem(q.item);
        setAnswerCounts((prev) => ({ ...prev, rejected: prev.rejected + 1 }));
      } else if (action === 'confirm') {
        setAnswerCounts((prev) => ({ ...prev, pinned: prev.pinned + 1 }));
      } else {
        setAnswerCounts((prev) => ({ ...prev, skipped: prev.skipped + 1 }));
      }
    } catch (err) {
      console.error('StyleSetupFlow: negative answer failed', err);
    }
    advanceQuestion();
  }, [questions, questionIndex, advanceQuestion]);

  const handleFinishVerification = useCallback(() => {
    goToSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================ Phase 4: סיכום ============================

  function goToSummary() {
    let confidence = null;
    let patternsCount = 0;
    try {
      const result = finalizeStyleVerification();
      confidence = result?.confidence ?? result ?? null;
    } catch (err) {
      console.error('StyleSetupFlow: finalizeStyleVerification failed', err);
    }
    try {
      const overview = getStyleOverview();
      patternsCount = overview?.qualitativePatterns?.length || 0;
    } catch (err) {
      console.error('StyleSetupFlow: getStyleOverview failed', err);
    }
    setSummaryData({ confidence, patternsCount });
    setPhase('summary');
  }

  const handleComplete = useCallback(() => {
    if (onComplete) {
      onComplete({
        pinned: answerCounts.pinned,
        rejected: answerCounts.rejected,
        docCount,
        externalOutputs: pastedOutputs.length,
      });
    }
  }, [onComplete, answerCounts, docCount, pastedOutputs.length]);

  const confidenceInfo = resolveConfidence(summaryData?.confidence);
  const progressPercent = questions.length > 0 ? Math.round(((questionIndex + 1) / questions.length) * 100) : 0;
  // stage: ב-collect מסתירים את שלב 'verify' מהמחוון (אין אימות בזרימה הזו).
  const visibleSteps = useMemo(
    () => (stageCfg.runVerify ? PHASE_STEPS : PHASE_STEPS.filter((s) => s.key !== 'verify')),
    [stageCfg.runVerify],
  );
  const currentPhaseIndex = visibleSteps.findIndex((s) => s.key === phase);

  // ============================ רינדור ============================

  return (
    <div className={`flex flex-col gap-4 ${T.wrapper}`} dir="rtl">
      {/* מחוון שלבים — visibleSteps מסונן לפי stage (collect ללא 'verify'). */}
      <div className="flex items-center gap-2">
        {visibleSteps.map((step, idx) => (
          <React.Fragment key={step.key}>
            <span className={`text-[11.5px] ${idx === currentPhaseIndex ? T.stepperCurrent : T.stepperMuted}`}>
              {idx + 1}. {step.label}
            </span>
            {idx < visibleSteps.length - 1 && (
              <span className={`flex-1 h-[2px] rounded-full ${idx < currentPhaseIndex ? T.stepperDone : T.stepperTrack}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* ================= Phase 1: intake ================= */}
      {phase === 'intake' && (
        <div className="flex flex-col gap-4">
          {/* stage: כשאין כרטיס חיצוני (collect) — כרטיס ההעלאה במרכז/רוחב מלא, עמודה אחת. */}
          <div className={stageCfg.showExternal ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : 'w-full max-w-xl mx-auto'}>
            {/* כרטיס א' — העלאת עבודות */}
            <div className={T.card}>
              <div className={T.title}>📄 העלאת עבודות</div>
              <p className={`${T.subtitle} mt-1 mb-3`}>
                {/* stage: ב-collect מדגישים שאין צורך במפתח AI — לומדים כבר עכשיו מההעלאה. */}
                {stage === 'collect'
                  ? 'העלה עבודות שכתבת — נלמד את הסגנון האמיתי שלך כבר עכשיו (בלי צורך במפתח AI).'
                  : 'העלה עבודות שכתבת בעצמך — ככל שיותר, החיקוי מדויק יותר. הטקסט נשאר במכשיר שלך.'}
              </p>
              {/* stage: ב-refine עם compactUpload ומסמכים שכבר נקלטו — שורת סטטוס קומפקטית במקום dropzone גדול (עדיין אפשר להוסיף). */}
              {stageCfg.compactUpload && docCount > 0 && !uploading ? (
                <div className="flex items-center justify-between gap-2">
                  <div className={T.successBox}>
                    נקלטו {docCount} מסמכים ✓
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`${T.buttonGhost} shrink-0`}
                  >
                    ➕ הוסף עוד
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={PAST_WORKS_ACCEPT}
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                </div>
              ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center gap-2 rounded-2xl px-4 py-7 text-center transition-colors ${dragActive ? T.dropzoneActive : T.dropzone}`}
              >
                <span className="text-[26px]">📄</span>
                <p className={`text-[13px] font-semibold ${T.title}`}>
                  גרור לכאן קבצים או
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="mx-1 underline disabled:opacity-50"
                  >
                    בחר קבצים
                  </button>
                </p>
                <p className={T.muted}>תומך ב-Word, PDF, טקסט, Markdown, RTF ו-HTML.</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={PAST_WORKS_ACCEPT}
                  onChange={handleFileInputChange}
                  disabled={uploading}
                  className="hidden"
                />
                {uploading && (
                  <div className="flex items-center gap-2 mt-1 text-[12.5px] font-semibold">
                    <span className={T.spinner} />
                    {uploadProgress || 'מעלה ומנתח...'}
                  </div>
                )}
                {!uploading && docCount > 0 && (
                  <div className={`${T.successBox} mt-1`}>
                    נקלטו {docCount} מסמכים ({(docStats?.totalWords || 0).toLocaleString('he-IL')} מילים) ✓
                  </div>
                )}
              </div>
              )}

              {/* MAJOR 2 — פידבק ההעלאה (שגיאה / יומן פר-קובץ / דוח מסכם) מחוץ ל-ternary,
                  כדי שיוצג גם במצב הקומפקטי (refine) וגם במצב ה-dropzone הרגיל. */}
              {!uploading && uploadError && (
                <div className={`${T.errorBox} mt-2`}>{uploadError}</div>
              )}
              {/* יומן פר-קובץ חי — מוצג גם בזמן העלאה. MINOR 3: outcome ישיר (added/skipped/failed).
                  MINOR — צירוף טקסט השגיאה לשורת קובץ כושל (מתוך uploadReport.failed לפי שם/סדר),
                  כדי לא לכפול את אותו קובץ גם ביומן וגם ברשימת failed הנפרדת. */}
              {fileLog.length > 0 && (() => {
                // תור-שגיאות לכל שם — תומך בקבצים כפולי-שם (שולף לפי סדר ההופעה).
                const failedQueues = {};
                (uploadReport?.failed || []).forEach((f) => {
                  const n = String(f?.name || '');
                  (failedQueues[n] = failedQueues[n] || []).push(String(f?.error || ''));
                });
                const consumed = {};
                return (
                  <div className="w-full mt-2 flex flex-col gap-1 text-right">
                    {fileLog.map((f, i) => {
                      const cfg = f.outcome === 'failed'
                        ? { cls: 'text-rose-300', icon: '✗', suffix: '' }
                        : f.outcome === 'skipped'
                          ? { cls: 'text-amber-300', icon: '⏭', suffix: ' — כבר נקלט בעבר' }
                          : { cls: 'text-emerald-300', icon: '✓', suffix: '' };
                      let errText = '';
                      if (f.outcome === 'failed') {
                        const q = failedQueues[f.name] || [];
                        const k = consumed[f.name] || 0;
                        consumed[f.name] = k + 1;
                        errText = q[k] || '';
                      }
                      return (
                        <div key={`${f.name}_${i}`} className={`text-[12px] font-semibold ${cfg.cls}`}>
                          {cfg.icon} {f.name}{errText ? `: ${errText}` : cfg.suffix}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              {!uploading && uploadReport && (
                <div className="w-full mt-2 flex flex-col gap-1.5 text-right">
                  {(Number(uploadReport.added) > 0 || Number(uploadReport.skipped) > 0) && (
                    <div className={T.muted}>
                      נוספו {Number(uploadReport.added) || 0} · דולגו {Number(uploadReport.skipped) || 0}
                    </div>
                  )}
                  {Number(uploadReport.evicted) > 0 && (
                    <div className={T.muted}>⚠ פונו {uploadReport.evicted} קטעים ישנים כדי לפנות מקום.</div>
                  )}
                  {uploadReport.writeError && (
                    <div className={T.errorBox}>שגיאת שמירה: {uploadReport.writeError}</div>
                  )}
                  {/* רשימת failed הנפרדת — רק כשאין יומן פר-קובץ (אחרת השגיאה כבר מצורפת שם). */}
                  {fileLog.length === 0 && (uploadReport.failed || []).map((f) => (
                    <div key={f.name} className={T.errorBox}>✗ {f.name}: {f.error}</div>
                  ))}
                </div>
              )}
            </div>

            {/* כרטיס ב' — ניתוח דרך AI חיצוני. stage: מוסתר ב-collect (showExternal=false). */}
            {stageCfg.showExternal && (
            <div className={T.card}>
              <div className={T.title}>🧠 ניתוח דרך AI חיצוני</div>
              <p className={`${T.subtitle} mt-1`}>
                פתח את הספק שבחרת, צרף 2-3 עבודות שכתבת, הדבק את הפרומפט ושלח. את התשובה הדבק כאן:
              </p>
              {/* C3 — הפרומפט התעמק: מעבר לדפוסי משפט הוא מחלץ גם את מבנה העבודה וניסוחים נמנעים. */}
              <p className={`${T.muted} mt-1 mb-3`}>
                הניתוח לומד גם את מבנה העבודה (פתיחה, מיקום התזה, סיום) וניסוחים שאתה נמנע מהם.
              </p>

              <label className={T.label}>ספק חיצוני</label>
              <select
                value={externalProviderId}
                onChange={(e) => setExternalProviderId(e.target.value)}
                className={`${T.input} mb-1`}
              >
                {EXTERNAL_PROVIDER_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              {providerHint && (
                <p className={`${T.muted} mb-2`}>{providerHint}</p>
              )}

              {/* C2 — צירוף קטעים מייצגים לתוך הפרומפט עצמו (לספקים בלי העלאת קבצים). */}
              <label className={`flex items-start gap-2 mb-1 cursor-pointer ${!excerptsAvailable ? 'opacity-60 cursor-not-allowed' : ''}`}>
                <input
                  type="checkbox"
                  checked={includeExcerpts}
                  disabled={!excerptsAvailable}
                  onChange={(e) => {
                    excerptsToggleTouchedRef.current = true;
                    setIncludeExcerpts(e.target.checked);
                  }}
                  className="mt-0.5 shrink-0"
                />
                <span className="text-[12.5px] font-semibold leading-snug">
                  כלול קטעים מייצגים מהעבודות בתוך הפרומפט
                </span>
              </label>
              <p className={`${providerLacksFileUpload ? T.hintBox : T.muted} mb-3`}>
                {!excerptsAvailable
                  ? 'אין עדיין קטעים — העלה עבודה קודם'
                  : 'שימושי כשהספק לא תומך בהעלאת קבצים — הקטעים נבחרו אוטומטית לפי מגוון.'}
              </p>

              <label className={T.label}>הפרומפט להעתקה</label>
              <textarea
                readOnly
                dir="ltr"
                rows={6}
                value={promptText}
                className={`${T.textareaReadonly} mb-1`}
              />
              <p className={`${T.muted} mb-1`}>
                הפרומפט: {promptCharsLabel} תווים
                {includeExcerpts && excerptsLoading ? ' · מכין קטעים מייצגים...' : ''}
                {includeExcerpts && !excerptsLoading && excerpts.length > 0 ? ` · כולל ${excerpts.length} קטעים` : ''}
                {includeExcerpts && !excerptsLoading && excerpts.length === 0 && excerptsAvailable ? ' · לא נמצאו קטעים לצירוף' : ''}
              </p>
              <div className="flex items-center justify-between gap-2 mb-3">
                <button type="button" onClick={handleCopyPrompt} className={T.buttonSecondary}>
                  📋 העתק פרומפט
                </button>
                <span className={T.muted}>{copyState}</span>
              </div>

              <label className={T.label}>הדבקת פלט ה-AI</label>
              <textarea
                dir="ltr"
                rows={5}
                value={pasteRaw}
                onChange={(e) => setPasteRaw(e.target.value)}
                placeholder="הדבק כאן את כל התשובה שקיבלת מהספק החיצוני (JSON)."
                className={`${T.textarea} mb-1`}
              />
              <div className="flex items-center justify-between gap-2 mb-2">
                <button type="button" onClick={handleAddPastedOutput} className={T.buttonPrimary} disabled={!pasteRaw.trim()}>
                  ➕ הוסף פלט
                </button>
                {pasteError && <span className={T.errorBox}>{pasteError}</span>}
              </div>

              {pastedOutputs.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {pastedOutputs.map((o, idx) => (
                    <span
                      key={o.id}
                      className={T.chip}
                      title={`פלט #${idx + 1}: ${o.patternsCount} דפוסים${o.structuralCount ? ` · חתימה מבנית (${o.structuralCount} שדות)` : ''}${o.avoidedCount ? ` · ${o.avoidedCount} ניסוחים נמנעים` : ''}${o.hasMeta ? ' · פרטי פרופיל וברירות מחדל לעמוד שער' : ''}`}
                    >
                      {/* C4 — הצ'יפ משקף גם את מה שהתווסף לסכימה: חתימה מבנית וניסוחים נמנעים. */}
                      פלט #{idx + 1} · {o.patternsCount} דפוסים
                      {o.structuralCount > 0 ? ' · מבנה ✓' : ''}
                      {o.avoidedCount > 0 ? ` · ${o.avoidedCount} ניסוחים נמנעים` : ''}
                      {o.hasMeta ? ' · פרופיל ✓' : ''}
                      {' ✓'}
                      <button
                        type="button"
                        onClick={() => handleRemovePastedOutput(o.id)}
                        className={T.chipRemove}
                        aria-label="הסר פלט"
                        title="הסר פלט"
                      >
                        ✗
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className={T.hintBox}>
                💡 הדבק 3 פלטים או יותר (הרצות חוזרות או ספקים שונים) — דפוס שחוזר בכמה הרצות מקבל משקל גבוה. הדבקה בודדת נקלטת במשקל מוקטן.
              </div>
            </div>
            )}
          </div>

          {/* כפתורים תחתונים */}
          <div className="flex items-center justify-between gap-3">
            {onSkip ? (
              <button type="button" onClick={onSkip} className={T.buttonGhost}>
                דלג
              </button>
            ) : <span />}
            <button
              type="button"
              onClick={handleStartAnalyze}
              disabled={!canAnalyze}
              className={T.buttonPrimary}
            >
              נתח והמשך ←
            </button>
          </div>
        </div>
      )}

      {/* ================= Phase 2: processing ================= */}
      {phase === 'processing' && (
        <div className={`${T.card} flex flex-col items-center justify-center gap-4 py-12 text-center`}>
          {analyzing && !processingError && (
            <>
              <span className={`${T.spinner} !w-8 !h-8`} />
              <div className={T.title}>{processingText}</div>
              <p className={T.muted}>זה עשוי לקחת כמה שניות — מאחדים דפוסים ממספר מקורות.</p>
            </>
          )}
          {processingError && (
            <>
              <div className="text-[26px]">⚠️</div>
              <div className={`${T.errorBox} max-w-md`}>{processingError}</div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={handleRetryAnalysis} className={T.buttonPrimary}>
                  נסה שוב
                </button>
                <button type="button" onClick={handleContinueAnyway} className={T.buttonGhost}>
                  המשך בכל זאת
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ================= Phase 3: verify ================= */}
      {phase === 'verify' && currentQuestion && (
        <div className="flex flex-col gap-4">
          <div>
            <div className={`${T.muted} mb-1.5`}>
              שאלה {questionIndex + 1} מתוך {questions.length}
            </div>
            <div className={T.progressTrack}>
              <div className={T.progressFill} style={{ width: `${progressPercent}%` }} />
            </div>
          </div>

          <div className={`${T.card} flex flex-col gap-3`}>
            {currentQuestion.kind === 'pattern' ? (
              <>
                <span className={`${T.questionTypeLabel} self-start`}>{currentQuestion.typeLabel}</span>
                <div className={T.questionLabel}>{currentQuestion.label}</div>
                {currentQuestion.evidence && (
                  <div className={T.questionEvidence}>"{currentQuestion.evidence}"</div>
                )}
                <div className={`${T.title} mt-1`}>{currentQuestion.question || 'זה נשמע כמוך?'}</div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <button type="button" onClick={() => handlePatternAnswer('yes')} className={T.buttonPrimary}>
                    כן, זה אני
                  </button>
                  <button type="button" onClick={() => handlePatternAnswer('no')} className={T.buttonDanger}>
                    לא — זה מקרי
                  </button>
                  <button type="button" onClick={() => handlePatternAnswer('skip')} className={T.buttonGhost}>
                    דלג
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className={T.title}>נכון שאתה כמעט אף פעם לא —</div>
                <div className={T.questionLabel}>{currentQuestion.item}</div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <button type="button" onClick={() => handleNegativeAnswer('confirm')} className={T.buttonPrimary}>
                    נכון
                  </button>
                  <button type="button" onClick={() => handleNegativeAnswer('remove')} className={T.buttonDanger}>
                    לא נכון, אני כן
                  </button>
                  <button type="button" onClick={() => handleNegativeAnswer('skip')} className={T.buttonGhost}>
                    דלג
                  </button>
                </div>
              </>
            )}
          </div>

          <button type="button" onClick={handleFinishVerification} className={`${T.buttonGhost} self-start`}>
            סיים אימות
          </button>
        </div>
      )}

      {/* ================= Phase 4: summary ================= */}
      {phase === 'summary' && stage === 'refine' ? (
        // refine — במקום להציג שוב טפסי העלאה/JSON (כבר מולאו בשלב האיסוף המוקדם): מסמך
        // תיאורי קצר ("ככה אתה כותב" + הצעות לשיפור) ושדה חופשי לדיוקים, שממשיך להשפיע
        // על כל כתיבה עתידית (customStyleGuidance-style). חידוד נוסף אפשרי תמיד דרך הגדרות → סגנון אישי.
        <div className={`${T.card} flex flex-col gap-4 py-8 text-right`} dir="rtl">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="text-[26px]">✓</div>
            <div className={`${T.title} text-[17px]`}>ככה אתה כותב</div>
            {confidenceInfo.label && (
              <span className={`${T.confidenceBadge} ${T.chip}`}>
                ודאות פרופיל: {confidenceInfo.label}
                {confidenceInfo.score !== null ? ` (${confidenceInfo.score}%)` : ''}
              </span>
            )}
          </div>

          {writingReport && (
            <>
              <ul className="flex flex-col gap-1.5">
                {writingReport.description.map((line, i) => (
                  <li key={`desc_${i}`} className={`${T.subtitle} flex gap-2`}>
                    <span>•</span><span>{line}</span>
                  </li>
                ))}
              </ul>
              <div>
                <div className={`${T.title} text-[13.5px] mb-1.5`}>הצעות לשיפור</div>
                <ul className="flex flex-col gap-1.5">
                  {writingReport.suggestions.map((line, i) => (
                    <li key={`sugg_${i}`} className={`${T.subtitle} flex gap-2`}>
                      <span>💡</span><span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {autoFilledFields.length > 0 && (
            <div className={T.successBox}>
              ✓ מילאתי מהעבודות גם: {autoFilledFields.map((f) => AUTO_FILLED_FIELD_LABELS[f] || f).join(', ')}. אפשר לתקן בהגדרות ← סגנון אישי.
            </div>
          )}

          <div>
            <label className={T.label}>משהו לא מדויק? כתוב דיוקים כאן</label>
            <textarea
              value={refinementNotes}
              onChange={(e) => onRefinementNotesChange?.(e.target.value)}
              placeholder="למשל: אני כותב יותר ענייני ממה שזה נשמע, או: אני לא באמת משתמש בביטוי הזה."
              rows={3}
              className={T.textarea}
            />
            <p className={`${T.muted} mt-1`}>הדיוקים נכנסים מיד לפרומפט הסגנון. אפשר לחדד עוד בכל שלב דרך הגדרות ← סגנון אישי.</p>
          </div>

          <button type="button" onClick={handleComplete} className={`${T.buttonPrimary} self-center mt-1`}>
            סיום
          </button>
        </div>
      ) : phase === 'summary' && (
        <div className={`${T.card} flex flex-col items-center gap-3 py-10 text-center`}>
          <div className="text-[30px]">✓</div>
          {/* stage: ב-collect זה בסיס ראשוני בלבד — כותרת/טקסט מרוככים, בלי pinned/rejected. */}
          {stage === 'collect' ? (
            <>
              <div className={`${T.title} text-[17px]`}>הבסיס מוכן ✓</div>
              <p className={T.subtitle}>
                למדנו את הבסיס — {docCount} מסמכים, {summaryData?.patternsCount || 0} דפוסים ראשוניים. נחדד בהמשך.
              </p>
            </>
          ) : (
            <>
              <div className={`${T.title} text-[17px]`}>הפרופיל שלך מוכן ✓</div>
              <p className={T.subtitle}>
                {summaryData?.patternsCount || 0} דפוסים בפרופיל · אישרת {answerCounts.pinned} · דחית {answerCounts.rejected}
              </p>
              {confidenceInfo.label && (
                <span className={`${T.confidenceBadge} ${T.chip}`}>
                  ודאות פרופיל: {confidenceInfo.label}
                  {confidenceInfo.score !== null ? ` (${confidenceInfo.score}%)` : ''}
                </span>
              )}
            </>
          )}
          {autoFilledFields.length > 0 && (
            <div className={T.successBox}>
              ✓ מילאתי מהעבודות גם: {autoFilledFields.map((f) => AUTO_FILLED_FIELD_LABELS[f] || f).join(', ')}
            </div>
          )}
          {/* stage: ב-collect הכפתור מוביל הלאה בזרימה ("המשך"), בשאר "סיום". שניהם קוראים ל-onComplete. */}
          <button type="button" onClick={handleComplete} className={`${T.buttonPrimary} mt-2`}>
            {stage === 'collect' ? 'המשך' : 'סיום'}
          </button>
        </div>
      )}
    </div>
  );
}
