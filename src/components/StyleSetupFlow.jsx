// StyleSetupFlow.jsx — זרימת בניית פרופיל סגנון מאוחדת (intake → processing → verify → summary).
// משמש בשני מקומות: אונבורדינג (variant='onboarding', theme כהה glassmorphism, אמבר #efab4d)
// ופאנל הגדרות (variant='panel', theme לבן/slate כמו StyleProfilePanel). הלוגיקה זהה, רק העיצוב שונה.
//
// שלב 1 (intake): שני מסלולי קלט מקבילים — העלאת עבודות (ingestAndAnalyze מקומי, ללא דפוסים)
//                  וניתוח דרך AI חיצוני (פרומפט מוכן להעתקה + הדבקת פלט JSON, אפשר כמה פעמים).
// שלב 2 (processing): runUnifiedStyleAnalysis מאחד את שני המקורות לפרופיל אחד + בונה תור אימות.
// שלב 3 (verify): שאלת אימות אחת בכל פעם — pin / reject / skip על דפוסים ועל "negative space".
// שלב 4 (summary): finalizeStyleVerification + סיכום קצר וכפתור סיום.

import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import { getSampleStoreStats } from '../services/styleSampleStore';
import {
  buildExternalPatternAnalysisPrompt,
  buildVerificationQuestions,
  parsePatternExtractionResult,
  CONFIDENCE_LABELS,
} from '../services/styleProfileService';
import { getExternalAnalysisProviderHint } from '../services/aiService';

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
  collect: { showUpload: true,  showExternal: false, runVerify: false },  // מוקדם: העלאה בלבד → baseline → summary קצר
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
  providerConfig = null,
}) {
  const T = variant === 'onboarding' ? THEME_ONBOARDING : THEME_PANEL;
  // stage — אילו שלבים פעילים. ברירת מחדל 'full' = אפס שינוי התנהגות למי שקורא בלי stage.
  const stageCfg = STAGE_CONFIG[stage] || STAGE_CONFIG.full;

  // --- שלב הזרימה ---
  const [phase, setPhase] = useState('intake');

  // --- Phase 1: העלאת עבודות ---
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploadReport, setUploadReport] = useState(null); // result.ingest האחרון
  const [docStats, setDocStats] = useState(() => {
    try { return getSampleStoreStats(); } catch { return null; }
  });

  // --- Phase 1: ניתוח דרך AI חיצוני ---
  const [externalProviderId, setExternalProviderId] = useState('gemini');
  const [copyState, setCopyState] = useState('');
  const [pasteRaw, setPasteRaw] = useState('');
  const [pasteError, setPasteError] = useState('');
  const [pastedOutputs, setPastedOutputs] = useState([]); // [{ id, raw, patternsCount }]

  const promptText = useMemo(() => {
    try {
      return buildExternalPatternAnalysisPrompt({ profile }) || '';
    } catch {
      return '';
    }
  }, [profile]);

  // F6 — רמז ספציפי-ספק (טקסט עברי מ-aiService) מתחת ל-select לפי הספק הנבחר.
  const providerHint = useMemo(() => {
    try {
      return getExternalAnalysisProviderHint(externalProviderId) || '';
    } catch {
      return '';
    }
  }, [externalProviderId]);

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

  const docCount = docStats?.docCount || 0;
  const canAnalyze = docCount > 0 || pastedOutputs.length > 0;

  // ============================ Phase 1 handlers ============================

  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    setUploadError('');
    setUploadReport(null);
    setUploading(true);
    setUploadProgress(`מנתח מסמך 1/${files.length}...`);
    try {
      const result = await ingestAndAnalyze(files, {
        runPatterns: false,
        onProgress: (info) => {
          const current = Number(info?.current ?? info?.index ?? 0) + 1;
          const total = Number(info?.total ?? files.length);
          setUploadProgress(`מנתח מסמך ${Math.min(current, total)}/${total}...`);
        },
      });
      // F3.1 — דוח העלאה מפורט (נוספו/דולגו/פונו/כשלים) מוצג מתחת לאזור ההעלאה.
      setUploadReport(result?.ingest || null);
      const stats = getSampleStoreStats();
      setDocStats(stats);
      // F3.2 — משתמש שהעלה ומדלג (בלי "נתח והמשך") עדיין מקבל מנוע פעיל (כמו בזרימה הישנה).
      if ((stats?.docCount || 0) > 0) {
        try { setStyleEngineEnabled(true); } catch (err) {
          console.error('StyleSetupFlow: setStyleEngineEnabled failed', err);
        }
      }
    } catch (err) {
      console.error('StyleSetupFlow: ingestAndAnalyze failed', err);
      setUploadError(`העלאת הקבצים נכשלה: ${err?.message || 'שגיאה לא ידועה'}`);
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  }, []);

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
      if (count <= 0) {
        setPasteError('לא זוהה JSON תקין — ודא שהדבקת את כל התשובה מה-AI.');
        return;
      }
      setPastedOutputs((prev) => [
        ...prev,
        { id: `ext_${Date.now()}_${prev.length}`, raw, patternsCount: count },
      ]);
      setPasteRaw('');
    } catch (err) {
      console.error('StyleSetupFlow: parsePatternExtractionResult failed', err);
      setPasteError('לא זוהה JSON תקין — ודא שהדבקת את כל התשובה מה-AI.');
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
                {!uploading && uploadError && (
                  <div className={`${T.errorBox} mt-1`}>{uploadError}</div>
                )}
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
                    {(uploadReport.failed || []).map((f) => (
                      <div key={f.name} className={T.errorBox}>✗ {f.name}: {f.error}</div>
                    ))}
                  </div>
                )}
              </div>
              )}
            </div>

            {/* כרטיס ב' — ניתוח דרך AI חיצוני. stage: מוסתר ב-collect (showExternal=false). */}
            {stageCfg.showExternal && (
            <div className={T.card}>
              <div className={T.title}>🧠 ניתוח דרך AI חיצוני</div>
              <p className={`${T.subtitle} mt-1 mb-3`}>
                פתח את הספק שבחרת, צרף 2-3 עבודות שכתבת, הדבק את הפרומפט ושלח. את התשובה הדבק כאן:
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
                <p className={`${T.muted} mb-3`}>{providerHint}</p>
              )}

              <label className={T.label}>הפרומפט להעתקה</label>
              <textarea
                readOnly
                dir="ltr"
                rows={6}
                value={promptText}
                className={`${T.textareaReadonly} mb-1`}
              />
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
                    <span key={o.id} className={T.chip}>
                      פלט #{idx + 1} · {o.patternsCount} דפוסים ✓
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
      {phase === 'summary' && (
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
          {/* stage: ב-collect הכפתור מוביל הלאה בזרימה ("המשך"), בשאר "סיום". שניהם קוראים ל-onComplete. */}
          <button type="button" onClick={handleComplete} className={`${T.buttonPrimary} mt-2`}>
            {stage === 'collect' ? 'המשך' : 'סיום'}
          </button>
        </div>
      )}
    </div>
  );
}
