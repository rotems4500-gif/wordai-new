import React from 'react';
import { mergeSpssFindingsIntoDraftHtml } from './services/spssFindingsMerge';
import { showConfirm } from './services/uiFeedback';
import { buildChapterFigures } from './services/spssChartRenderer';
import { saveBlobInBrowser } from './services/browserDocxExport';
import { SUPPORTED_DATA_FILE_ACCEPT, readDataFileToAnalysis } from './services/spssDataIngest';
import { BROWSER_DOC_ACCEPT, BROWSER_OUTPUT_ACCEPT, pickDesktopDocument, readBrowserDocumentFile } from './services/documentUpload';
import { CHART_IMAGE_ACCEPT, CHART_IMAGE_EXTENSIONS, readImageFileAsBase64, describeChartImages } from './services/chartVisionService';
import { deriveResearchTopicQuery } from './services/sourceQueryBuilder';
import {
  getSpssPreferences,
  saveSpssPreferences,
  getProviderConfig,
  getConfiguredProviderChoices,
  getProviderModelChoices,
  normalizeProviderModelName,
} from './services/aiService';
import {
  adviseLecturerNextSteps,
  analyzeSpssAssignment,
  buildLiteratureReview,
  buildSpssFindingsChapter,
  buildSpssSubmissionWork,
  buildSpssSummaryChapter,
  collectDeclaredTargetNames,
  consultAssignmentPlan,
  critiqueSpssRun,
  ensureGraphCoverage,
  generateSpssSyntax,
  interpretSpssOutput,
  parseSpssOutputErrors,
  repairSpssSyntaxFromError,
  reviseAssignmentProfile,
  reviewSpssMasterSyntax,
  splitMergedSpssLines,
  validatePlanCoverage,
} from './services/spssSyntaxService';
import {
  createLocalId,
  PREP_METHOD_PATTERN,
  buildSafeFileStem,
  stripAssemblyArtifacts,
  buildMasterSyntax,
  buildCritiqueFingerprint,
  buildAdviceFingerprint,
} from './services/spssStudioShared';

const STAGES = [
  { id: 'understand', label: 'הבנת המשימה', hint: 'מטלה + נתונים' },
  { id: 'code', label: 'הבאת קוד', hint: 'syntax אוטומטי' },
  { id: 'output', label: 'הדבקת פלט', hint: 'מ-SPSS' },
  { id: 'refine', label: 'מקצה שיפורים', hint: 'בדיקה ותיקון' },
  { id: 'explain', label: 'הסברים ותוצר', hint: 'פרק / .sps' },
];

const DELIVERABLE_LABELS = {
  'findings-chapter': 'מסמך עם פרק ממצאים',
  interpretation: 'פירוש פלט',
  code: 'קובץ .sps בלבד',
};


const noticeToneClassMap = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  error: 'border-rose-200 bg-rose-50 text-rose-700',
  info: 'border-slate-200 bg-slate-50 text-slate-700',
};

const PROVIDER_LABELS = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  claude: 'Anthropic Claude',
  groq: 'Groq',
  perplexity: 'Perplexity',
  ollama: 'Ollama',
};

const formatModelLabel = ({ providerId = '', model = '' } = {}) => {
  const prov = PROVIDER_LABELS[providerId] || providerId || 'מודל AI';
  return model ? `${prov} · ${model}` : prov;
};

// AI-usage appendix (section ה) — human-readable, honest documentation of every
// AI call the studio made, ready to paste into the assignment as a נספח.
const buildAiAppendixText = (log = []) => {
  if (!Array.isArray(log) || !log.length) return '';
  const lines = [
    'נספח: שימוש בבינה מלאכותית',
    '',
    'בעבודה זו נעזרתי בכלי WordFlow AI (מצב עבודה מונחה · SPSS). להלן פירוט השימוש בבינה מלאכותית בכל שלב:',
    '',
  ];
  log.forEach((entry, index) => {
    lines.push(`${index + 1}. ${entry.stage || 'שלב'} — ${formatModelLabel(entry)}`);
    if (entry.description) lines.push(`   מטרה: ${entry.description}`);
    if (entry.prompt) lines.push(`   פרומפט/קלט: ${entry.prompt}`);
    lines.push('');
  });
  lines.push('הבינה המלאכותית שימשה ככלי עזר לניתוח הנתונים, ליצירת ה-syntax, לבדיקת הפלט ולהצעות ניסוח כמפורט לעיל. עברתי על הפלט, בדקתי אותו והתאמתי את הנוסח הסופי בעצמי.');
  return lines.join('\n');
};

const escapeHtml = (value = '') => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const textToHtmlParagraphs = (text = '') => String(text || '')
  .split(/\n{2,}/)
  .map((block) => block.trim())
  .filter(Boolean)
  .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
  .join('\n');

// נושא לאיתור מקורות (סקירת ספרות): קודם topic שהמתכנן חילץ (נושא תוכני נקי), אחרת
// summary, ורק כמוצא אחרון — טקסט המטלה אחרי הסרת שורות בירוקרטיה (הגשה/מועד/ניקוד),
// כדי לא לשלוח הוראות הגשה כשאילתת חיפוש אקדמית.
const ASSIGNMENT_BOILERPLATE_LINE = /(?:הגשה|מועד\s+אחרון|תאריך\s+הגשה|נקוד(?:ה|ות)|משקל\s+הציון|שם\s+הקורס|מספר\s+הקורס|מרצה|מתרגל|סמסטר|שנה"ל|יש\s+להגיש|בהצלחה|דרישות\s+פורמט|גופן|רווח\s+כפול)/;
const buildLitReviewTopic = (profile = null, assignmentText = '') => {
  const fromProfile = String(profile?.topic || profile?.summary || '').trim();
  if (fromProfile) return fromProfile.slice(0, 220);
  const derivedTopic = deriveResearchTopicQuery(assignmentText);
  if (derivedTopic) return derivedTopic.slice(0, 220);
  const stripped = String(assignmentText || '')
    .split('\n')
    .filter((line) => line.trim() && !ASSIGNMENT_BOILERPLATE_LINE.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.slice(0, 220);
};

const buildLitReviewText = (litReview = null) => {
  if (!litReview) return '';
  const parts = [];
  if (litReview.review) parts.push(`סקירת ספרות\n\n${litReview.review}`);
  if (Array.isArray(litReview.references) && litReview.references.length) {
    parts.push(['רשימת מקורות', '', ...litReview.references.map((ref, index) => `${index + 1}. ${ref}`)].join('\n'));
  }
  return parts.join('\n\n');
};

const downloadTextFile = (content = '', fileName = 'wordflow-spss-syntax.sps') => {
  const blob = new Blob([String(content || '')], { type: 'text/plain;charset=utf-8' });
  return saveBlobInBrowser(blob, fileName);
};

// Small round numbered badge for the explain-stage section titles — pure ordering hint,
// no logic attached.
const StageBadge = ({ n }) => (
  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{n}</span>
);

export default function SpssProjectStudio({ onExit = () => {}, onEmitDocument = null, onOpenHelp = null }) {
  const fileInputRef = React.useRef(null);
  const draftInputRef = React.useRef(null);
  const assignmentInputRef = React.useRef(null);
  const outputInputRef = React.useRef(null);
  const chartImageInputRef = React.useRef(null);
  const chartFolderInputRef = React.useRef(null);
  const [stage, setStage] = React.useState('understand');
  const [analysis, setAnalysis] = React.useState(null);
  const [assignmentText, setAssignmentText] = React.useState('');
  const [draft, setDraft] = React.useState(null);
  const [profile, setProfile] = React.useState(null);
  const [blocks, setBlocks] = React.useState([]);
  const [output, setOutput] = React.useState('');
  const [critique, setCritique] = React.useState(null);
  const [reviewNotes, setReviewNotes] = React.useState([]);
  // Deterministic backstops (no AI cost): graphNotes = plan "graph" entries whose chart
  // command was auto-synthesized; coverageGaps = plan analyses not found in the final
  // syntax at all (advisory — never blocks the user from running/copying the code).
  const [graphNotes, setGraphNotes] = React.useState([]);
  const [coverageGaps, setCoverageGaps] = React.useState([]);
  // חסימה מתודולוגית דטרמיניסטית (detectMethodologyIssue) — לא נעשה עליה retry אוטומטי,
  // מוצג למשתמש עם אפשרות מפורשת לעקוף אם הוא בטוח שהבדיקה שגויה.
  const [methodologyBlock, setMethodologyBlock] = React.useState(null);
  const methodologyOverrideRef = React.useRef(false);
  const lastFixFingerprintRef = React.useRef('');
  const [repeatedIssues, setRepeatedIssues] = React.useState(false);
  // זיכרון-סבבים ליועצים: כל עצה/תיקון שניתנו + מה נעשה איתם. מוזרם לפרומפט של
  // היועצים כדי שלא יחזרו על עצמם (שובר לולאת הייעוץ).
  const [advisoryLedger, setAdvisoryLedger] = React.useState([]);
  // הקוד/התוכנית השתנו אחרי ההרצה שהודבקה — ייעוץ/ביקורת על פלט ישן חוזרים על עצמם.
  const [outputStale, setOutputStale] = React.useState(false);
  const lastAppliedAdviceFingerprintRef = React.useRef('');
  const [repeatedAdvice, setRepeatedAdvice] = React.useState(false);

  // פלט חדש הודבק ⇒ הוא כבר משקף את הקוד הנוכחי.
  React.useEffect(() => {
    if (String(output || '').trim()) setOutputStale(false);
  }, [output]);

  // רישום עצות ב-ledger (dedupe לפי טקסט) + סימון עצה כמיושמת.
  const noteAdvisoryEntries = React.useCallback((entries = []) => {
    setAdvisoryLedger((prev) => {
      const seen = new Set(prev.map((entry) => entry.text));
      const fresh = entries.filter((entry) => entry?.text && !seen.has(entry.text));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  }, []);
  const markAdvisoryApplied = React.useCallback((text = '', appliedAs = '') => {
    setAdvisoryLedger((prev) => {
      const index = prev.findIndex((entry) => entry.text === text);
      if (index === -1) return [...prev, { source: 'lecturer', text, appliedAs }];
      const next = [...prev];
      next[index] = { ...next[index], appliedAs };
      return next;
    });
  }, []);
  const [interpretations, setInterpretations] = React.useState([]);
  const [litReview, setLitReview] = React.useState(null);
  const [lecturerAdvice, setLecturerAdvice] = React.useState(null);
  // מפתחות המלצות מרצה שכבר נוספו לקוד — חיווי ✓ קבוע על הכרטיס ומניעת הוספה כפולה.
  const [addedLecturerRecKeys, setAddedLecturerRecKeys] = React.useState(() => new Set());
  const [chapterTruncated, setChapterTruncated] = React.useState(false);
  // בקשת שינוי חופשית לתוכנית הניתוח + תקציר השינוי האחרון שהוחל.
  const [changeRequestText, setChangeRequestText] = React.useState('');
  const [planRevisionNote, setPlanRevisionNote] = React.useState('');
  // כפתור ייעודי חושף כתיבה חופשית — לפני שלב הקוד. showPlanChange: תיבת שינוי
  // התוכנית (שלב הקוד/מקצה שיפורים) מקופלת מאחורי כפתור. analysisGuidance:
  // הנחיה חופשית שנכתבת עוד בשלב הבנת המשימה ומוזרמת ל-analyzeSpssAssignment.
  const [showPlanChange, setShowPlanChange] = React.useState(false);
  const [showGuidanceBox, setShowGuidanceBox] = React.useState(false);
  const [analysisGuidance, setAnalysisGuidance] = React.useState('');
  // התייעצות לפני הקוד (advisory בלבד — לא משנה תוכנית). showConsult: פותח את
  // התיבה. consultThread: שרשור {question, answer}. consultQuestion: הקלט הנוכחי.
  const [showConsult, setShowConsult] = React.useState(false);
  const [consultQuestion, setConsultQuestion] = React.useState('');
  const [consultThread, setConsultThread] = React.useState([]);
  // AI-usage log — every model call the studio makes, for the required AI appendix (section ה).
  const [aiLog, setAiLog] = React.useState([]);
  const [busy, setBusy] = React.useState('');
  const [dragActive, setDragActive] = React.useState(false);
  const [notice, setNotice] = React.useState({ tone: 'info', text: 'התחל מטעינת קובץ נתונים והדבקת טקסט המטלה.' });

  // בורר ספק/מודל בטאב עצמו (מקביל למסך הבית ולטאב SPSS). ריק = לפי הספק הפעיל
  // בהגדרות; ברגע שהמשתמש בוחר — זה דורס per-request לכל קריאות ה-AI בטאב.
  const spssPrefsRef = React.useRef(getSpssPreferences());
  const [providerConfigState, setProviderConfigState] = React.useState(() => getProviderConfig());
  const [spssProviderId, setSpssProviderId] = React.useState(() => String(spssPrefsRef.current.providerId || '').trim());
  const [spssModel, setSpssModel] = React.useState(() => String(spssPrefsRef.current.model || '').trim());
  // צירוף נספח AI (תיעוד שימוש + הדרכה) לתוצר כשהוא נפתח בעורך — קריאת API נוספת.
  const [attachAiAppendix, setAttachAiAppendix] = React.useState(false);
  // פרקי ממצאים/סיכום שכבר נבנו על ידי "צור מסמך פרק ממצאים" — נשמרים כדי ש"הכן עבודה
  // מוכנה להגשה" יוכל להשתמש בהם ישירות במקום לבנות אותם שוב. מתאפס בכל שינוי בפלט.
  const [builtChapters, setBuiltChapters] = React.useState(null);

  const providerChoices = React.useMemo(() => {
    const configured = getConfiguredProviderChoices(providerConfigState);
    if (configured.length) return configured;
    const fallbackId = String(providerConfigState?.active || 'gemini').trim() || 'gemini';
    return [{ id: fallbackId, label: fallbackId, isDefault: true }];
  }, [providerConfigState]);

  const activeProviderId = String(providerConfigState?.active || '').trim();
  const resolvedSpssProviderId = (spssProviderId && providerChoices.some((choice) => choice.id === spssProviderId))
    ? spssProviderId
    : (providerChoices.some((choice) => choice.id === activeProviderId) ? activeProviderId : (providerChoices[0]?.id || ''));

  const modelChoices = React.useMemo(
    () => getProviderModelChoices(resolvedSpssProviderId, providerConfigState, [spssModel].filter(Boolean)),
    [providerConfigState, resolvedSpssProviderId, spssModel],
  );
  const normalizedSpssModel = normalizeProviderModelName(resolvedSpssProviderId, spssModel);
  const resolvedSpssModel = (normalizedSpssModel && modelChoices.includes(normalizedSpssModel))
    ? normalizedSpssModel
    : (modelChoices[0] || '');

  const spssRouteRef = React.useRef({ providerId: '', model: '' });
  React.useEffect(() => {
    spssRouteRef.current = spssProviderId
      ? { providerId: resolvedSpssProviderId, model: resolvedSpssModel }
      : { providerId: '', model: '' };
  }, [spssProviderId, resolvedSpssProviderId, resolvedSpssModel]);

  const persistSpssRoute = React.useCallback((providerId, model) => {
    const next = { ...getSpssPreferences(), providerId, model };
    spssPrefsRef.current = next;
    saveSpssPreferences(next);
  }, []);

  const onPickSpssProvider = React.useCallback((providerId) => {
    const nextModel = getProviderModelChoices(providerId, getProviderConfig())[0] || '';
    setSpssProviderId(providerId);
    setSpssModel(nextModel);
    persistSpssRoute(providerId, nextModel);
  }, [persistSpssRoute]);

  const onPickSpssModel = React.useCallback((model) => {
    setSpssModel(model);
    setSpssProviderId(resolvedSpssProviderId);
    persistSpssRoute(resolvedSpssProviderId, model);
  }, [persistSpssRoute, resolvedSpssProviderId]);

  React.useEffect(() => {
    const refreshProviderConfig = () => setProviderConfigState(getProviderConfig());
    refreshProviderConfig();
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('focus', refreshProviderConfig);
    window.addEventListener('wordai-provider-config-changed', refreshProviderConfig);
    window.addEventListener('wordai-settings-hydrated', refreshProviderConfig);
    return () => {
      window.removeEventListener('focus', refreshProviderConfig);
      window.removeEventListener('wordai-provider-config-changed', refreshProviderConfig);
      window.removeEventListener('wordai-settings-hydrated', refreshProviderConfig);
    };
  }, []);

  const masterSyntax = React.useMemo(() => buildMasterSyntax(blocks), [blocks]);
  // Deterministic scan of the pasted output for real SPSS Error/Warning blocks —
  // drives the "repair from real error" path (Part 2). Cheap, runs on every edit.
  const outputErrors = React.useMemo(() => parseSpssOutputErrors(output), [output]);

  // Record one AI call into the usage log that feeds the required AI appendix (section ה).
  const logAi = React.useCallback((entry) => {
    setAiLog((prev) => [...prev, {
      id: createLocalId(),
      stage: entry?.stage || '',
      description: entry?.description || '',
      prompt: String(entry?.prompt || '').trim(),
      providerId: String(entry?.providerId || spssRouteRef.current.providerId || '').trim(),
      model: String(entry?.model || spssRouteRef.current.model || '').trim(),
    }]);
  }, []);

  const stageIndex = STAGES.findIndex((entry) => entry.id === stage);
  const spsFileName = `${buildSafeFileStem(analysis?.fileName || 'dataset')}-project.sps`;
  const statusToneClass = noticeToneClassMap[notice.tone] || noticeToneClassMap.info;

  const goToStage = React.useCallback((nextStage) => {
    const nextIndex = STAGES.findIndex((entry) => entry.id === nextStage);
    if (nextIndex < 0) return;
    // Only allow jumping to a stage that's already been reached (or the next one).
    setShowPlanChange(false);
    setStage(nextStage);
  }, []);

  const openFilePicker = React.useCallback(() => {
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    fileInputRef.current.click();
  }, []);

  const applyDataAnalysis = React.useCallback((nextAnalysis, { fromDefault = false } = {}) => {
    setAnalysis(nextAnalysis);
    setProfile(null);
    setBlocks([]);
    setOutput('');
    setCritique(null);
    setReviewNotes([]);
    setInterpretations([]);
    setLitReview(null);
    setLecturerAdvice(null);
    setChapterTruncated(false);
    setBuiltChapters(null);
    setAiLog([]);
    setGraphNotes([]);
    setCoverageGaps([]);
    lastFixFingerprintRef.current = '';
    setRepeatedIssues(false);
    setRepeatedAdvice(false);
    setAdvisoryLedger([]);
    setOutputStale(false);
    lastAppliedAdviceFingerprintRef.current = '';
    setMethodologyBlock(null);
    setAddedLecturerRecKeys(new Set());
    setChangeRequestText('');
    setPlanRevisionNote('');
    setShowPlanChange(false);
    setShowGuidanceBox(false);
    setAnalysisGuidance('');
    setShowConsult(false);
    setConsultQuestion('');
    setConsultThread([]);
    setStage('understand');
    setNotice({
      tone: 'success',
      text: `${fromDefault ? 'נטען קובץ ברירת המחדל' : 'נטען'} ${nextAnalysis.fileName || 'קובץ נתונים'} · ${Number(nextAnalysis.rowCount || 0).toLocaleString('he-IL')} שורות, ${nextAnalysis.columnCount || 0} עמודות. עכשיו הדבק את המטלה ולחץ "נתח משימה".`,
    });
  }, []);

  React.useEffect(() => {
    const defaultAnalysis = spssPrefsRef.current?.defaultDataAnalysis;
    if (analysis || !defaultAnalysis || typeof defaultAnalysis !== 'object') return;
    if (!Array.isArray(defaultAnalysis.columns) || !defaultAnalysis.columns.length) return;
    applyDataAnalysis(defaultAnalysis, { fromDefault: true });
  }, [analysis, applyDataAnalysis]);

  // הפלט השתנה → הפרקים שנבנו קודם (אם נבנו) כבר לא תואמים לו.
  React.useEffect(() => {
    setBuiltChapters(null);
  }, [output]);

  const handleDataFile = React.useCallback(async (file) => {
    if (!file) return;
    setBusy('upload');
    try {
      const nextAnalysis = await readDataFileToAnalysis(file);
      applyDataAnalysis(nextAnalysis);
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'קריאת קובץ הנתונים נכשלה.' });
    } finally {
      setBusy('');
    }
  }, [applyDataAnalysis]);

  const onFileInputChange = React.useCallback((event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (file) handleDataFile(file);
  }, [handleDataFile]);

  // טיוטה קיימת (אופציונלי) — נשלחת ל-AI כהקשר/סגנון, ופרק הממצאים ימוזג לתוכה בתוצר.
  const onSelectDraft = React.useCallback(async () => {
    setBusy('draft');
    try {
      const desktop = await pickDesktopDocument();
      if (desktop.canceled) return;
      if (desktop.unsupported) {
        draftInputRef.current?.click();
        return;
      }
      setDraft(desktop.doc);
      setNotice({ tone: 'success', text: `נטענה טיוטה: ${desktop.doc.name}. פרק הממצאים ישתלב בה.` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'טעינת הטיוטה נכשלה.' });
    } finally {
      setBusy('');
    }
  }, []);

  const onDraftInputChange = React.useCallback(async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;
    setBusy('draft');
    try {
      const next = await readBrowserDocumentFile(file);
      if (next) {
        setDraft(next);
        setNotice({ tone: 'success', text: `נטענה טיוטה: ${next.name}. פרק הממצאים ישתלב בה.` });
      }
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'טעינת הטיוטה נכשלה.' });
    } finally {
      setBusy('');
    }
  }, []);

  const clearDraft = React.useCallback(() => {
    setDraft(null);
    if (draftInputRef.current) draftInputRef.current.value = '';
  }, []);

  // קובץ משימה (אופציונלי) — חלופה להדבקת טקסט המטלה; ממלא את שדה המטלה.
  const onSelectAssignmentFile = React.useCallback(async () => {
    setBusy('assignment-file');
    try {
      const desktop = await pickDesktopDocument();
      if (desktop.canceled) return;
      if (desktop.unsupported) {
        assignmentInputRef.current?.click();
        return;
      }
      const text = String(desktop.doc.text || '').trim();
      if (!text) {
        setNotice({ tone: 'error', text: 'לא נמצא טקסט בקובץ המשימה.' });
        return;
      }
      setAssignmentText(text);
      setNotice({ tone: 'success', text: `נטענה המטלה מתוך ${desktop.doc.name}. אפשר לערוך לפני הניתוח.` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'טעינת קובץ המשימה נכשלה.' });
    } finally {
      setBusy('');
    }
  }, []);

  const onAssignmentFileInputChange = React.useCallback(async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;
    setBusy('assignment-file');
    try {
      const next = await readBrowserDocumentFile(file);
      const text = String(next?.text || '').trim();
      if (!text) {
        setNotice({ tone: 'error', text: 'לא נמצא טקסט בקובץ המשימה.' });
        return;
      }
      setAssignmentText(text);
      setNotice({ tone: 'success', text: `נטענה המטלה מתוך ${next.name}. אפשר לערוך לפני הניתוח.` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'טעינת קובץ המשימה נכשלה.' });
    } finally {
      setBusy('');
    }
  }, []);

  // קובץ פלט (אופציונלי) — חלופה להדבקת ה-Output מ-SPSS; ממלא את שדה הפלט.
  // תמיד דרך <input type="file"> (גם בדסקטופ): הדיאלוג הנייטיבי מוגבל ל-docx/txt
  // ומחזיר טקסט בלבד, ואילו כאן נתמכים גם pdf/xlsx/spv/תמונות + קריאת גרפים.
  const onSelectOutputFile = React.useCallback(() => {
    if (!outputInputRef.current) return;
    outputInputRef.current.value = '';
    outputInputRef.current.click();
  }, []);

  const onOutputFileInputChange = React.useCallback(async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;
    setBusy('output-file');
    try {
      const next = await readBrowserDocumentFile(file, { readCharts: true });
      const text = String(next?.text || '').trim();
      if (!text) {
        setNotice({ tone: 'error', text: 'לא נמצא טקסט בקובץ הפלט.' });
        return;
      }
      setOutput((prev) => (prev.trim() ? `${prev.trim()}\n\n${text}` : text));
      // הודעת מצב לגבי גרפים: קריאה מוצלחת, כשל חלקי, או EMF וקטורי שדפדפן לא קורא.
      const cs = next?.chartStatus;
      if (cs && cs.vectorOnly > 0) {
        setNotice({ tone: 'info', text: `נטען פלט מתוך ${next.name}. ⚠ נמצאו ${cs.vectorOnly} גרפים בפורמט EMF (וקטורי של Windows) שלא ניתן לקרוא בדפדפן — ייצא את הפלט ל-PDF‏ (File → Export → PDF) והעלה אותו, או ייצא כל גרף כ-PNG ולחץ "📊 העלה גרף (תמונה)".` });
      } else if (cs && cs.described > 0) {
        setNotice({ tone: 'success', text: `נטען פלט מתוך ${next.name} · נקראו ${cs.described} גרפים מהקובץ. אפשר לערוך לפני הבדיקה.` });
      } else {
        setNotice({ tone: 'success', text: `נטען פלט מתוך ${next.name}. אפשר לערוך לפני הבדיקה.` });
      }
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'טעינת קובץ הפלט נכשלה.' });
    } finally {
      setBusy('');
    }
  }, []);

  // תמונות גרפים — גרף ב-SPSS הוא תמונה, אז קוראים אותו דרך מודל vision והתיאור
  // הטקסטואלי מצטרף לשדה הפלט כמו כל Output אחר. הליבה מנותקת מה-input כדי שגם
  // הדבקה (Ctrl+V) לתיבת הפלט תוכל לקרוא לה עם קבצי תמונה שהגיעו מה-clipboard.
  const describeAndAppendChartImages = React.useCallback(async (files) => {
    if (!files.length) return;
    setBusy('chart-image');
    try {
      const images = [];
      for (const file of files) images.push(await readImageFileAsBase64(file));
      const described = await describeChartImages(images);
      if (described.described < 1) {
        throw new Error('קריאת הגרפים נכשלה. ודא שמוגדר מפתח לספק עם ראייה (Gemini / OpenAI / Claude).');
      }
      setOutput((prev) => (prev.trim() ? `${prev.trim()}\n\n${described.text}` : described.text));
      logAi({ stage: 'קריאת גרפים', description: `קריאת ${described.total} תמונות גרף מפלט SPSS דרך מודל ראייה והמרתן לתיאור טקסטואלי`, prompt: files.map((f) => f.name).join(', '), providerId: described.providerId, model: described.model });
      const missed = described.total - described.described;
      setNotice({
        tone: missed ? 'info' : 'success',
        text: missed
          ? `נקראו ${described.described} מתוך ${described.total} גרפים. עבור השאר — ייצא מחדש כ-PNG ונסה שוב.`
          : `נקרא${described.total > 1 ? 'ו' : ''} ${described.total} גרפ${described.total > 1 ? 'ים' : ''} והתיאור נוסף לפלט. אפשר לערוך לפני הבדיקה.`,
      });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'קריאת תמונות הגרפים נכשלה.' });
    } finally {
      setBusy('');
    }
  }, [logAi]);

  const onChartImageInputChange = React.useCallback(async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    await describeAndAppendChartImages(files);
  }, [describeAndAppendChartImages]);

  // העלאת תיקיית גרפים שלמה (SPSS Export עם Type: None — Graphics only): קבצי התמונה
  // בתיקייה נסוננים, ממוינים לפי שם, ונקראים ב-batches של 6 (סדרתי) כדי לא להציף vision.
  const onChartFolderInputChange = React.useCallback(async (event) => {
    const rawFiles = Array.from(event.target.files || []);
    event.target.value = '';
    if (!rawFiles.length) return;
    const files = rawFiles
      .filter((file) => CHART_IMAGE_EXTENSIONS.includes(String(file.name || '').toLowerCase().split('.').pop()))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (!files.length) {
      setNotice({ tone: 'error', text: 'לא נמצאו קבצי תמונה בתיקייה שנבחרה.' });
      return;
    }
    let limited = files;
    if (files.length > 20) {
      limited = files.slice(0, 20);
      setNotice({ tone: 'info', text: `נמצאו ${files.length} תמונות — נקראות 20 הראשונות.` });
    }
    for (let i = 0; i < limited.length; i += 6) {
      const batch = limited.slice(i, i + 6);
      // eslint-disable-next-line no-await-in-loop
      await describeAndAppendChartImages(batch);
    }
  }, [describeAndAppendChartImages]);

  // הדבקת תמונת גרף ישירות לתיבת הפלט (Ctrl+V) — אם ה-clipboard מכיל תמונות,
  // חוסמים את ההדבקה הרגילה וקוראים אותן דרך אותו נתיב vision; אחרת מתנהג כרגיל.
  const onOutputPaste = React.useCallback((event) => {
    const items = Array.from(event.clipboardData?.items || []);
    const imageFiles = items
      .filter((item) => item.type && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (!imageFiles.length) return;
    event.preventDefault();
    describeAndAppendChartImages(imageFiles);
  }, [describeAndAppendChartImages]);

  const onDrop = React.useCallback((event) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) handleDataFile(file);
  }, [handleDataFile]);

  // Stage 1 — understand the task.
  const onAnalyzeAssignment = React.useCallback(async () => {
    if (!analysis) {
      setNotice({ tone: 'error', text: 'טען קובץ נתונים לפני ניתוח המטלה.' });
      return;
    }
    if (!assignmentText.trim()) {
      setNotice({ tone: 'error', text: 'הדבק את טקסט המטלה כדי שאבין מה צריך לעשות.' });
      return;
    }
    setBusy('analyze');
    setNotice({ tone: 'info', text: 'מנתח את המטלה מול הנתונים...' });
    try {
      const result = await analyzeSpssAssignment({ assignmentText, analysis, draftText: draft?.text || '', extraGuidance: analysisGuidance.trim(), providerOverride: spssRouteRef.current.providerId, modelOverride: spssRouteRef.current.model });
      if (!result.ok) {
        setNotice({ tone: 'error', text: result.error || 'ניתוח המטלה נכשל.' });
        return;
      }
      setProfile(result.profile);
      setBlocks([]);
      setOutput('');
      setCritique(null);
      setInterpretations([]);
      setReviewNotes([]);
      setGraphNotes([]);
      lastFixFingerprintRef.current = '';
      setRepeatedIssues(false);
      lastFixFingerprintRef.current = '';
      setCoverageGaps([]);
      setPlanRevisionNote('');
      setConsultThread([]);
      logAi({ stage: 'הבנת המשימה', description: 'ניתוח טקסט המטלה מול קובץ הנתונים וזיהוי הניתוחים הסטטיסטיים הנדרשים', prompt: analysisGuidance.trim() ? `${assignmentText}\n\n[הנחיה חופשית מהסטודנט: ${analysisGuidance.trim()}]` : assignmentText, providerId: result.providerId, model: result.model });
      setStage('code');
      setNotice({ tone: 'success', text: `זוהו ${result.profile.analyses.length} ניתוחים · תוצר נדרש: ${DELIVERABLE_LABELS[result.profile.deliverable]}.` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'ניתוח המטלה נכשל.' });
    } finally {
      setBusy('');
    }
  }, [analysis, assignmentText, draft, analysisGuidance, logAi]);

  // Stage 2 — generate the full master syntax in ONE holistic pass.
  // נתיב אחד: אותו מנוע כמו הטאב הרגיל. במקום בלוק מבודד לכל ניתוח (שהפיק קוד
  // דליל ונחסם לעיתים), שולחים בקשה הוליסטית אחת — טקסט המטלה + תוכנית הניתוחים —
  // ומקבלים master syntax עשיר ורציף, בדיוק כמו שהטאב הרגיל מפיק.
  const generateAllCode = React.useCallback(async (profileArg) => {
    if (!profileArg?.analyses?.length) return;
    setBusy('code');
    setNotice({ tone: 'info', text: 'מייצר syntax מלא לכל הניתוחים...' });
    try {
      const route = { providerOverride: spssRouteRef.current.providerId, modelOverride: spssRouteRef.current.model };

      // Prep-before-use ordering (age_group, dummy, index, MISSING VALUES declarations
      // must precede the analyses that consume them). The single holistic call sees the
      // whole plan, but we still present it prep-first so the ordering is explicit.
      const isPrepItem = (item) => PREP_METHOD_PATTERN.test(`${item?.method || ''} ${item?.label || ''}`);
      const orderedAnalyses = [
        ...profileArg.analyses.filter((item) => isPrepItem(item)),
        ...profileArg.analyses.filter((item) => !isPrepItem(item)),
      ];

      const planChecklist = orderedAnalyses
        .map((item, index) => `${index + 1}. ${item.label}${item.method ? ` (${item.method})` : ''} — ${item.request || item.label}`)
        .join('\n');
      const combinedRequest = [
        'בצע עבודת SPSS מלאה שעונה על כל דרישות המטלה, בסינטקס אחד רציף ומלא.',
        '',
        'טקסט המטלה:',
        String(assignmentText || '').trim(),
        '',
        'תוכנית הניתוחים הנדרשים (בצע את כולם, בסדר הזה — הכנת נתונים תחילה):',
        planChecklist,
        '',
        'הנחיות פלט: הפק syntax אחד שכולל את כל הניתוחים לפי הסדר. לכל מבחן היסק הוסף בדיקות הנחות רלוונטיות (נורמליות, שוויון שונויות). הפרד בין הבלוקים בהערות תיאוריות (* --- כותרת ---.). ספק קוד עשיר ומלא לעבודת סיום — לא מינימלי. השתמש אך ורק במשתנים שבמטא-דאטה; אל תמציא משתנים.',
      ].join('\n');

      // סולם retry הוליסטי: ניסיון ראשון prep (עבודה מלאה כוללת הכנת נתונים), עם
      // skipMethodologyGuard רק אם המשתמש בחר במפורש לעקוף חסימה מתודולוגית קודמת.
      // אם נחסם ע"י guardrail (תגובת ERROR של המודל) — retry עם בקשה מועשרת.
      // אם נחסם ע"י detectMethodologyIssue הדטרמיניסטי ולא הופעל override — אין retry
      // אוטומטי; מציגים למשתמש את סיבת החסימה עם אפשרות מפורשת לעקוף.
      let result = await generateSpssSyntax({
        analysis, request: combinedRequest, tutorMode: true, mode: 'prep', extraAllowedNames: [],
        skipMethodologyGuard: methodologyOverrideRef.current, ...route,
      });
      let repaired = false;
      if ((!result.ok || !result.syntax) && result?.blockedBy === 'methodology' && !methodologyOverrideRef.current) {
        setMethodologyBlock({ message: result?.guidanceMessage || 'הבקשה נחסמה מסיבה מתודולוגית.' });
        setNotice({ tone: 'error', text: result?.guidanceMessage || 'הבקשה נחסמה מסיבה מתודולוגית — בדוק את התוכנית או עקוף את הבדיקה.' });
        return;
      }
      if (!result.ok || !result.syntax) {
        const enrichedRequest = `${combinedRequest}\n(ספק syntax מלא ושמיש; אל תחזיר ERROR אלא אם זה באמת בלתי אפשרי.)`;
        const retry = await generateSpssSyntax({
          analysis, request: enrichedRequest, tutorMode: true, mode: 'prep', extraAllowedNames: [],
          repairHint: result?.guidanceMessage || '', ...route,
        });
        if (retry.ok && retry.syntax) { result = retry; repaired = true; }
        else { result = retry || result; }
      }
      setMethodologyBlock(null);

      const genRoute = result?.providerId ? { providerId: result.providerId, model: result.model } : null;
      const succeeded = Boolean(result.ok && result.syntax);
      const nextBlocks = succeeded
        ? [{ id: createLocalId(), title: 'Master syntax', syntax: result.syntax, blocked: false }]
        : [{ id: createLocalId(), title: 'ניתוח מלא', syntax: `* ${result.guidanceMessage || 'הבקשה נעצרה לפני יצירת syntax.'}`, blocked: true }];
      setBlocks(nextBlocks);
      logAi({ stage: 'הבאת קוד', description: `יצירת master syntax הוליסטי לכל הניתוחים (${profileArg.analyses.length}): ${profileArg.analyses.map((a) => a.label).join(', ')}`, prompt: combinedRequest, providerId: genRoute?.providerId, model: genRoute?.model });

      // Pre-flight review — one holistic look at the master against the task + plan +
      // metadata, auto-applying only certain fixes (phantom var, prep order, missing
      // values) BEFORE the user runs SPSS. Non-destructive: replaces only when it changed.
      const repairedNote = repaired ? ' (שוקם בניסיון חוזר)' : '';
      let reviewNote = '';
      let trackedSyntax = buildMasterSyntax(nextBlocks);
      if (succeeded) {
        setNotice({ tone: 'info', text: 'בודק את הקוד לפני הרצה...' });
        try {
          const review = await reviewSpssMasterSyntax({ assignmentText, analysis, profile: profileArg, masterSyntax: trackedSyntax, ...route });
          if (review.ok && review.changed && review.syntax) {
            trackedSyntax = review.syntax;
            setBlocks([{ id: createLocalId(), title: 'Master syntax (נבדק אוטומטית)', syntax: review.syntax, blocked: false }]);
            setReviewNotes(review.notes);
            logAi({ stage: 'בדיקת קוד', description: `בדיקה מקדימה של הקוד לפני הרצה — תוקנו ${review.notes.length} נקודות`, prompt: 'בדוק את ה-master syntax מול המטלה ותקן בעיות ודאיות לפני הרצה', providerId: review.providerId, model: review.model });
            reviewNote = ` הקוד נבדק ותוקן אוטומטית לפני הרצה (${review.notes.length} תיקונים).`;
          } else {
            setReviewNotes([]);
            if (review.ok) reviewNote = ' הקוד נבדק לפני הרצה ✓';
          }
        } catch {
          setReviewNotes([]);
        }

        // Deterministic backstops — no LLM call. Graph guarantee first (it can add
        // commands the coverage check would otherwise flag), then the advisory
        // plan↔code coverage scan over whatever syntax survived so far.
        try {
          const graphResult = ensureGraphCoverage({ profile: profileArg, analysis, masterSyntax: trackedSyntax });
          if (graphResult.changed && graphResult.syntax) {
            trackedSyntax = graphResult.syntax;
            setBlocks([{ id: createLocalId(), title: 'Master syntax (גרפים הושלמו אוטומטית)', syntax: graphResult.syntax, blocked: false }]);
          }
          setGraphNotes(graphResult.missing || []);
        } catch {
          setGraphNotes([]);
        }
        try {
          setCoverageGaps(validatePlanCoverage({ profile: profileArg, analysis, masterSyntax: trackedSyntax }));
        } catch {
          setCoverageGaps([]);
        }
      } else {
        setReviewNotes([]);
        setGraphNotes([]);
        setCoverageGaps([]);
      }

      setNotice(succeeded
        ? { tone: 'success', text: `נוצר master syntax מלא${repairedNote}.${reviewNote} העתק/הורד, הרץ ב-SPSS, ואז הדבק את הפלט.` }
        : { tone: 'error', text: `יצירת הקוד נעצרה — ${result.guidanceMessage || 'נסח מחדש את המטלה או בדוק את התוכנית'}.` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'יצירת ה-syntax נכשלה.' });
    } finally {
      methodologyOverrideRef.current = false;
      setBusy('');
    }
  }, [analysis, assignmentText, logAi]);

  const onGenerateAllCode = React.useCallback(() => generateAllCode(profile), [generateAllCode, profile]);

  // בקשת שינוי חופשית לתוכנית הניתוח (אחרי ניתוח ראשוני או במקצה השיפורים) —
  // שולח בקשת שינוי + התוכנית הקיימת ל-AI, ומקבל תוכנית מעודכנת שלמה.
  // regenerate=false: מעדכן את התוכנית בלבד ומציג אותה מחדש (לפני שלב הקוד — המשתמש
  // בודק ואז לוחץ "ייצר את כל הקוד" בעצמו). regenerate=true: מייצר מיד קוד מהתוכנית
  // המעודכנת (מקצה שיפורים / קוד שכבר קיים).
  // הרצף המשותף לכל שינוי-תוכנית — גם בקשה חופשית של המשתמש וגם יישום המלצת
  // יועץ/ביקורת: רוויזיה מאומתת → ניקוי מצב ישן (פלט/ביקורת/fingerprints) → קוד מחדש.
  // זה הגשר ששובר את לולאת הייעוץ: יישום עצה משנה באמת את התוכנית, לא רק מדביק בלוק.
  const applyPlanChange = React.useCallback(async (changeText, { regenerate = true, advisoryContext = '', expectedAnalysis = '', stageLabel = 'עדכון תוכנית', stageDescription = 'עדכון תוכנית הניתוח לפי בקשת שינוי חופשית של המשתמש', busyKey = 'revise' } = {}) => {
    const cleanChange = String(changeText || '').trim();
    if (!cleanChange) return { ok: false };
    setBusy(busyKey);
    setNotice({ tone: 'info', text: 'מעדכן את תוכנית הניתוח...' });
    try {
      const route = { providerOverride: spssRouteRef.current.providerId, modelOverride: spssRouteRef.current.model };
      const result = await reviseAssignmentProfile({
        profile, changeRequest: cleanChange, assignmentText, analysis, advisoryContext, expectedAnalysis, ...route,
      });
      if (!result.ok) {
        setNotice({ tone: 'error', text: result.error || 'עדכון התוכנית נכשל.' });
        setBusy('');
        return { ok: false };
      }
      setProfile(result.profile);
      setOutput('');
      setOutputStale(false);
      setCritique(null);
      setInterpretations([]);
      setReviewNotes([]);
      setBuiltChapters(null);
      setGraphNotes([]);
      setCoverageGaps([]);
      setRepeatedIssues(false);
      setRepeatedAdvice(false);
      lastFixFingerprintRef.current = '';
      const revisionNote = [result.changeSummary || 'התוכנית עודכנה.', result.resolutionNote ? `✔ ${result.resolutionNote}` : '']
        .filter(Boolean).join('\n');
      setPlanRevisionNote(revisionNote);
      setChangeRequestText('');
      setShowPlanChange(false);
      setMethodologyBlock(null);
      setConsultThread([]);
      logAi({ stage: stageLabel, description: stageDescription, prompt: cleanChange, providerId: result.providerId, model: result.model });
      setStage('code');
      if (regenerate) {
        setNotice({ tone: 'success', text: 'התוכנית עודכנה — מייצר קוד מחדש...' });
        setBusy('');
        await generateAllCode(result.profile);
      } else {
        // עדכון בלבד — הקוד הקודם (אם היה) כבר לא תואם לתוכנית, אז מנקים אותו
        // וממתינים שהמשתמש יבדוק את התוכנית המעודכנת ויפיק קוד בעצמו.
        setBlocks([]);
        setBusy('');
        setNotice({ tone: 'success', text: `התוכנית עודכנה${result.changeSummary ? ` (${result.changeSummary})` : ''}. בדוק אותה ולחץ "ייצר את כל הקוד".` });
      }
      return { ok: true, result };
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'עדכון התוכנית נכשל.' });
      setBusy('');
      return { ok: false };
    }
  }, [profile, assignmentText, analysis, logAi, generateAllCode]);

  const onReviseProfile = React.useCallback(async (regenerate = true) => {
    if (busy || !changeRequestText.trim()) return;
    await applyPlanChange(changeRequestText.trim(), { regenerate });
  }, [busy, changeRequestText, applyPlanChange]);

  // התייעצות לפני הקוד (advisory) — שאלה חופשית על התוכנית/המשתנים/המבחנים אחרי
  // שהמשימה כבר נותחה ולפני יצירת הקוד. לא משנה את התוכנית — רק מחזיר עצה,
  // ומצרף אותה לשרשור ההתייעצות (multi-turn).
  const onConsult = React.useCallback(async () => {
    const question = consultQuestion.trim();
    if (busy || !question || !profile) return;
    setBusy('consult');
    setNotice({ tone: 'info', text: 'מתייעץ...' });
    try {
      const result = await consultAssignmentPlan({
        profile,
        question,
        assignmentText,
        analysis,
        history: consultThread,
        priorAdvice: advisoryLedger,
        providerOverride: spssRouteRef.current.providerId,
        modelOverride: spssRouteRef.current.model,
      });
      if (!result.ok) {
        setNotice({ tone: 'error', text: result.error || 'ההתייעצות נכשלה.' });
        return;
      }
      setConsultThread((prev) => [...prev, { id: createLocalId(), question, answer: result.answer, proposedChange: result.proposedChange || null }]);
      noteAdvisoryEntries([{ source: 'consult', text: String(result.answer || '').slice(0, 300), appliedAs: '' }]);
      setConsultQuestion('');
      logAi({ stage: 'התייעצות', description: 'התייעצות עם היועץ הסטטיסטי על התוכנית לפני יצירת הקוד', prompt: question, providerId: result.providerId, model: result.model });
      setNotice({ tone: 'success', text: 'התקבלה עצה. אפשר להמשיך לשאול, לשנות את התוכנית, או לייצר את הקוד.' });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'ההתייעצות נכשלה.' });
    } finally {
      setBusy('');
    }
  }, [busy, consultQuestion, profile, assignmentText, analysis, consultThread, advisoryLedger, noteAdvisoryEntries, logAi]);

  // יישום עצת התייעצות בלחיצה אחת — במקום "לך לכפתור שינוי התוכנית ונסח לבד":
  // תשובת היועץ נשלחת כבקשת-שינוי ל-applyPlanChange (אותו גשר של המלצת מרצה).
  const onApplyConsultAdvice = React.useCallback(async (turn) => {
    const answer = String(turn?.answer || '').trim();
    if (!answer || busy) return;
    const question = String(turn?.question || '').slice(0, 200);
    const proposedChange = turn?.proposedChange;
    let changeText;
    let extraOptions;
    if (proposedChange && proposedChange.changeRequest) {
      changeText = proposedChange.changeRequest;
      const nv = proposedChange.newVariable;
      if (nv?.name) {
        changeText += `\n\nמשתנה נגזר לבניה: ${nv.name} — מבוסס על ${(nv.buildFrom || []).join(', ')} — ${nv.how || ''}`;
      }
      extraOptions = {
        regenerate: true,
        expectedAnalysis: proposedChange.expectedAnalysis || '',
        advisoryContext: `שאלת הסטודנט: ${question}\nתשובת היועץ: ${answer.slice(0, 3500)}`.slice(0, 4000),
        stageLabel: 'התייעצות',
        stageDescription: 'עדכון התוכנית ויצירת קוד לפי עצה מההתייעצות',
        busyKey: `consult-apply-${turn?.id || ''}`,
      };
    } else {
      changeText = `יישם בתוכנית את ההמלצה הבאה מההתייעצות (שנה/הוסף רק את מה שההמלצה דורשת):\n${answer.slice(0, 4000)}`;
      extraOptions = {
        regenerate: true,
        advisoryContext: `שאלת הסטודנט: ${question}`,
        stageLabel: 'התייעצות',
        stageDescription: 'עדכון התוכנית לפי עצה מההתייעצות',
        busyKey: `consult-apply-${turn?.id || ''}`,
      };
    }
    const applied = await applyPlanChange(changeText, extraOptions);
    if (applied.ok) {
      markAdvisoryApplied(answer.slice(0, 300), 'התוכנית עודכנה לפי עצת ההתייעצות');
      setShowConsult(false);
    }
  }, [busy, applyPlanChange, markAdvisoryApplied]);

  // Stage 4 — critique the run against the task.
  const onCritique = React.useCallback(async (force = false) => {
    if (!output.trim()) {
      setNotice({ tone: 'error', text: 'הדבק את הפלט מ-SPSS לפני הבדיקה.' });
      return;
    }
    // עצירת-לולאה באפס קריאות: הקוד/התוכנית השתנו אחרי ההרצה שהודבקה — ביקורת על
    // פלט ישן תחזיר את אותן נקודות שוב. חוסמים לפני הקריאה עד שיודבק פלט עדכני.
    if (outputStale && !force) {
      setNotice({ tone: 'error', text: 'הקוד השתנה מאז ההרצה שהודבקה — הרץ את הקוד המעודכן ב-SPSS והדבק פלט חדש לפני בדיקה חוזרת (אחרת יעלו שוב אותן נקודות).' });
      return;
    }
    setBusy('critique');
    setStage('refine');
    setNotice({ tone: 'info', text: 'בודק את הפלט מול המטלה...' });
    try {
      const result = await critiqueSpssRun({ assignmentText, analysis, masterSyntax, output, priorAdvice: advisoryLedger, providerOverride: spssRouteRef.current.providerId, modelOverride: spssRouteRef.current.model });
      if (!result.ok) {
        setCritique(null);
        setNotice({ tone: 'error', text: result.error || 'בדיקת הפלט נכשלה.' });
        return;
      }
      setCritique(result);
      const fingerprint = buildCritiqueFingerprint(result?.issues || []);
      const repeated = result?.verdict !== 'clean' && Boolean(lastFixFingerprintRef.current) && fingerprint === lastFixFingerprintRef.current;
      setRepeatedIssues(repeated);
      logAi({ stage: 'מקצה שיפורים', description: 'בדיקת הפלט מ-SPSS מול דרישות המטלה וזיהוי נקודות לתיקון', prompt: 'בדוק את הפלט מול המטלה', providerId: result.providerId, model: result.model });
      setNotice(result.verdict === 'clean'
        ? { tone: 'success', text: 'ההרצה תקינה מול המטלה. אפשר להמשיך להסברים ולתוצר.' }
        : { tone: 'error', text: `נמצאו ${result.issues.length} נקודות לתיקון. תקן את הקוד או המשך בכל זאת.` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'בדיקת הפלט נכשלה.' });
    } finally {
      setBusy('');
    }
  }, [output, outputStale, assignmentText, analysis, masterSyntax, advisoryLedger, logAi]);

  // Stage 4 — apply a single fix as a new/replacement block.
  const onApplyFix = React.useCallback(async (issue) => {
    if (!issue?.fixRequest) return;
    setBusy(`fix-${issue.fixRequest}`);
    try {
      const createdNames = blocks.flatMap((block) => Array.from(collectDeclaredTargetNames(block.syntax)));
      const result = await generateSpssSyntax({
        analysis,
        request: issue.fixRequest,
        tutorMode: true,
        mode: PREP_METHOD_PATTERN.test(issue.label || issue.fixRequest) ? 'prep' : 'analysis',
        extraAllowedNames: createdNames,
        providerOverride: spssRouteRef.current.providerId,
        modelOverride: spssRouteRef.current.model,
      });
      if (result.ok && result.syntax) {
        setBlocks((prev) => [...prev, { id: createLocalId(), title: `תיקון: ${issue.label || issue.problem || 'ניתוח'}`, syntax: result.syntax, blocked: false }]);
        // הקוד השתנה — הפלט שהודבק כבר לא משקף אותו, וגם תיקון בודד נספר לזיהוי-חזרות.
        lastFixFingerprintRef.current = buildCritiqueFingerprint(critique?.issues || []);
        setOutputStale(true);
        markAdvisoryApplied(`${issue.label || ''}: ${issue.problem || issue.fixRequest || ''}`.trim(), 'נוסף בלוק תיקון לקוד');
        logAi({ stage: 'מקצה שיפורים', description: `יצירת בלוק תיקון: ${issue.label || issue.problem || 'ניתוח'}`, prompt: issue.fixRequest, providerId: result.providerId, model: result.model });
        setNotice({ tone: 'success', text: 'נוסף בלוק תיקון ל-master syntax. הרץ מחדש ב-SPSS והדבק פלט מעודכן.' });
      } else {
        setNotice({ tone: 'error', text: result.guidanceMessage || 'יצירת בלוק התיקון נעצרה.' });
      }
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'יצירת התיקון נכשלה.' });
    } finally {
      setBusy('');
    }
  }, [analysis, blocks, critique, markAdvisoryApplied, logAi]);

  // Stage 4 — "תקן הכל": merge the current master syntax with every critique issue
  // in a single model call and replace the blocks with one updated master syntax.
  // The model keeps the parts that already worked and only fixes/adds what the
  // issues demand — so the user gets a runnable, updated code without going back
  // and without hand-stitching per-issue patch blocks.
  const onApplyAllFixes = React.useCallback(async () => {
    if (!critique?.issues?.length) {
      setNotice({ tone: 'info', text: 'אין נקודות לתיקון — ההרצה כבר תקינה.' });
      return;
    }
    setBusy('fix-all');
    setNotice({ tone: 'info', text: 'מאחד את הקוד הקיים עם כל התיקונים...' });
    try {
      const createdNames = blocks.flatMap((block) => Array.from(collectDeclaredTargetNames(block.syntax)));
      const issuesText = critique.issues
        .map((issue, index) => {
          const head = issue.label ? `${issue.label}: ` : '';
          const why = issue.explanation ? ` — למה זה חשוב: ${issue.explanation}` : '';
          const fix = issue.fixRequest ? ` — נדרש: ${issue.fixRequest}` : '';
          const rerun = issue.rerunInstruction ? ` — אחרי התיקון: ${issue.rerunInstruction}` : '';
          return `${index + 1}. ${head}${issue.problem}${why}${fix}${rerun}`;
        })
        .join('\n');
      const request = [
        'לפניך master syntax קיים של SPSS שכבר רץ, ורשימת נקודות לתיקון שעלו מבדיקת הפלט.',
        'החזר גרסה אחת, מלאה ומעודכנת של ה-master syntax: שמור כפי שהם על כל הבלוקים התקינים, ותקן/הוסף רק את מה שנדרש כדי לענות על כל הנקודות. אל תמחק ניתוחים תקינים ואל תחזיר patch חלקי — החזר את הקוד המלא. שמור על סדר הרצה נכון (הכנת נתונים לפני שימוש בה).',
        '',
        'ה-master syntax הנוכחי:',
        masterSyntax,
        '',
        'נקודות לתיקון:',
        issuesText,
      ].join('\n');
      // skipMethodologyGuard מוצדק כאן: זה תיקון על קוד שכבר עבר את הבדיקה המתודולוגית
      // ואושר (אחרי onGenerateAllCode) — לא בקשה חדשה שצריכה בדיקה מאפס.
      const result = await generateSpssSyntax({
        analysis,
        request,
        tutorMode: true,
        mode: 'prep',
        extraAllowedNames: createdNames,
        skipMethodologyGuard: true,
        providerOverride: spssRouteRef.current.providerId,
        modelOverride: spssRouteRef.current.model,
      });
      if (result.ok && result.syntax) {
        let finalSyntax = result.syntax;
        let postFixReviewNotes = [];
        try {
          const review = await reviewSpssMasterSyntax({
            assignmentText,
            analysis,
            profile,
            masterSyntax: result.syntax,
            providerOverride: spssRouteRef.current.providerId,
            modelOverride: spssRouteRef.current.model,
          });
          if (review.ok && review.changed && review.syntax) {
            finalSyntax = review.syntax;
            postFixReviewNotes = review.notes || [];
            logAi({ stage: 'בדיקת קוד', description: `בדיקה אחרי מקצה שיפורים — תוקנו ${postFixReviewNotes.length} נקודות לפני הרצה מחדש`, prompt: 'בדוק את הקוד המעודכן אחרי תקן הכל', providerId: review.providerId, model: review.model });
          } else if (review.ok && review.notes?.length) {
            postFixReviewNotes = review.notes;
          }
        } catch {
          postFixReviewNotes = [];
        }

        // Deterministic backstops — same as onGenerateAllCode: graph guarantee first,
        // then advisory plan↔code coverage over the syntax that will actually ship.
        try {
          const graphResult = ensureGraphCoverage({ profile, analysis, masterSyntax: finalSyntax });
          if (graphResult.changed && graphResult.syntax) finalSyntax = graphResult.syntax;
          setGraphNotes(graphResult.missing || []);
        } catch {
          setGraphNotes([]);
        }
        try {
          setCoverageGaps(validatePlanCoverage({ profile, analysis, masterSyntax: finalSyntax }));
        } catch {
          setCoverageGaps([]);
        }

        setBlocks([{ id: createLocalId(), title: 'Master syntax מעודכן (מקצה שיפורים)', syntax: finalSyntax, blocked: false }]);
        setReviewNotes(postFixReviewNotes);
        logAi({ stage: 'מקצה שיפורים', description: `איחוד הקוד הקיים עם כל התיקונים (${critique.issues.length}) לקוד מעודכן אחד`, prompt: `תקן הכל: ${critique.issues.map((it) => it.label || it.problem).filter(Boolean).join('; ')}`, providerId: result.providerId, model: result.model });
        // The old output is now stale — clear it and the old verdict so the next
        // critique runs against the NEW run, not the pre-fix output (that was the
        // cause of the same fixes repeating every round).
        lastFixFingerprintRef.current = buildCritiqueFingerprint(critique?.issues || []);
        noteAdvisoryEntries((critique?.issues || []).map((issue) => ({
          source: 'critique',
          text: `${issue.label || ''}: ${issue.problem || issue.fixRequest || ''}`.trim(),
          appliedAs: 'תקן הכל — הקוד עודכן',
        })));
        setOutput('');
        setCritique(null);
        const reviewTail = postFixReviewNotes.length ? ` בוצעה גם בדיקת קוד נוספת (${postFixReviewNotes.length} הערות).` : '';
        setNotice({ tone: 'success', text: `נוצר קוד מעודכן.${reviewTail} הקוד למטה — העתק/הורד, הרץ אותו ב-SPSS, ואז לחץ "עדכן פלט" והדבק את הפלט החדש (הפלט הישן נוקה).` });
      } else {
        setNotice({ tone: 'error', text: result.guidanceMessage || 'יצירת הקוד המעודכן נעצרה.' });
      }
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'יצירת הקוד המעודכן נכשלה.' });
    } finally {
      setBusy('');
    }
  }, [critique, blocks, masterSyntax, assignmentText, analysis, profile, logAi]);

  // Stage 3/4 — repair the master syntax from a REAL SPSS runtime error. The
  // generic critique judges "does the output answer the task"; this instead parses
  // the pasted output's Error #/Warning # blocks deterministically and asks the
  // model to fix only what produced them (minimal, targeted). Convergence lever —
  // a fatal Error means the run failed, so fix-and-rerun beats re-critiquing.
  const onRepairFromError = React.useCallback(async () => {
    if (!output.trim() || !masterSyntax.trim()) return;
    setBusy('repair');
    setNotice({ tone: 'info', text: 'מתקן את הקוד לפי שגיאת ה-SPSS...' });
    try {
      const result = await repairSpssSyntaxFromError({ analysis, priorSyntax: masterSyntax, output, providerOverride: spssRouteRef.current.providerId, modelOverride: spssRouteRef.current.model });
      if (result.ok && result.syntax) {
        setBlocks([{ id: createLocalId(), title: 'Master syntax מתוקן (משגיאת SPSS)', syntax: result.syntax, blocked: false }]);
        const fatalCount = result.parsed?.fatal?.length || 0;
        const warnCount = result.parsed?.warnings?.length || 0;
        logAi({ stage: 'תיקון משגיאה', description: `תיקון הקוד לפי ${fatalCount} שגיאות ו-${warnCount} אזהרות מ-SPSS Output`, prompt: 'תקן את ה-master syntax לפי הודעות השגיאה/אזהרה מ-SPSS', providerId: result.providerId, model: result.model });
        // The old run failed — clear the stale output+verdict so the next check runs
        // against the fixed run, not the errored one.
        lastFixFingerprintRef.current = buildCritiqueFingerprint(critique?.issues || []);
        setOutput('');
        setCritique(null);
        setNotice({ tone: 'success', text: 'נוצר קוד מתוקן לפי שגיאת ה-SPSS. הקוד למטה — העתק/הורד, הרץ אותו מחדש ב-SPSS, ואז הדבק את הפלט החדש (הפלט הישן נוקה).' });
      } else {
        setNotice({ tone: 'error', text: result.error || 'לא הצלחתי לתקן את הקוד מהשגיאה. ודא שהדבקת את הודעת השגיאה המלאה מחלון ה-Output.' });
      }
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'תיקון הקוד נכשל.' });
    } finally {
      setBusy('');
    }
  }, [output, masterSyntax, analysis, logAi]);

  // Stage 5 — interpret output and assemble the deliverable.
  const onInterpret = React.useCallback(async () => {
    if (!output.trim()) return;
    setBusy('interpret');
    setNotice({ tone: 'info', text: 'מפרש את הפלט...' });
    try {
      const result = await interpretSpssOutput({ analysis, output, question: '', providerOverride: spssRouteRef.current.providerId, modelOverride: spssRouteRef.current.model });
      if (!result.ok) {
        setNotice({ tone: 'error', text: result.error || 'פירוש הפלט נכשל.' });
        return;
      }
      setInterpretations([{ id: createLocalId(), label: 'פירוש הפלט', answer: result.answer }]);
      logAi({ stage: 'פירוש הפלט', description: 'פירוש הפלט מ-SPSS בעברית וניסוח בסגנון APA לכל ניתוח', prompt: 'פרש את הפלט מ-SPSS', providerId: result.providerId, model: result.model });
      setNotice({ tone: 'success', text: 'הפירוש מוכן.' });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'פירוש הפלט נכשל.' });
    } finally {
      setBusy('');
    }
  }, [analysis, output, logAi]);

  // שלבי הכנה משותפים לפרק הממצאים: פירוש הפלט (אם חסר), סקירת ספרות (אם
  // חסרה) ותרשימי ההתפלגות הדטרמיניסטיים. משמש גם ל"צור מסמך פרק ממצאים" וגם
  // ל"הכן עבודה מוכנה להגשה" — אותה לוגיקה 1:1, רק ניסוח ההתקדמות (notify) שונה.
  // כשל בשלב עזר (פירוש/סקירה) לא עוצר את התהליך — רק נרשם ב-skippedSteps שמוחזר.
  const ensureChapterPrereqs = React.useCallback(async ({ notify } = {}) => {
    const say = typeof notify === 'function' ? notify : () => {};
    const skippedSteps = [];

    // שלב 1 — פירוש הפלט (קלט ישיר לפרק הממצאים).
    let chapterInterpretations = interpretations;
    if (!chapterInterpretations.length) {
      say('שלב 1/4: מפרש את הפלט...');
      try {
        const interpretResult = await interpretSpssOutput({ analysis, output, question: '', providerOverride: spssRouteRef.current.providerId, modelOverride: spssRouteRef.current.model });
        if (interpretResult.ok) {
          chapterInterpretations = [{ id: createLocalId(), label: 'פירוש הפלט', answer: interpretResult.answer }];
          setInterpretations(chapterInterpretations);
          logAi({ stage: 'פירוש הפלט', description: 'פירוש הפלט מ-SPSS בעברית וניסוח בסגנון APA לכל ניתוח', prompt: 'פרש את הפלט מ-SPSS', providerId: interpretResult.providerId, model: interpretResult.model });
        } else {
          skippedSteps.push('פירוש הפלט');
        }
      } catch {
        skippedSteps.push('פירוש הפלט');
      }
    }

    // שלב 2 — סקירת ספרות ומקורות (מוכנה בפאנל; מצורפת לתוצר רק כשאין טיוטה,
    // כדי לא לשכפל סקירה שכבר קיימת בעבודה).
    let chapterLitReview = litReview;
    if (!chapterLitReview) {
      const topic = buildLitReviewTopic(profile, assignmentText);
      if (topic) {
        say('שלב 2/4: מאתר מקורות אקדמיים וכותב סקירת ספרות...');
        try {
          const litResult = await buildLiteratureReview({ topic, topicEn: profile?.topicEn || '', vetTopic: assignmentText.trim().slice(0, 2000), count: 5, providerOverride: spssRouteRef.current.providerId, modelOverride: spssRouteRef.current.model });
          if (litResult.ok) {
            chapterLitReview = { review: litResult.review, references: litResult.references };
            setLitReview(chapterLitReview);
            logAi({ stage: 'סקירת ספרות ומקורות', description: `איתור ${litResult.references.length} מקורות אקדמיים מאומתים וסקירת ספרות קצרה מבוססת עליהם`, prompt: `אתר מקורות אקדמיים בנושא: ${topic}`, providerId: litResult.providerId, model: litResult.model });
          } else {
            skippedSteps.push('סקירת ספרות');
          }
        } catch {
          skippedSteps.push('סקירת ספרות');
        }
      } else {
        skippedSteps.push('סקירת ספרות (אין נושא מחקר)');
      }
    }

    // תרשימי התפלגות דטרמיניסטיים מהנתונים עצמם (לא מהמודל) — משובצים בפרק
    // דרך מרקרים. כשל ברינדור (canvas) לא עוצר את הפרק.
    let chapterFigures = [];
    try {
      const figuresResult = buildChapterFigures(analysis, { priorityText: assignmentText });
      chapterFigures = figuresResult?.figures || [];
      if (figuresResult?.skipped?.length) {
        console.warn('SPSS chapter figures skipped beyond cap:', figuresResult.skipped.join(', '));
      }
    } catch {
      skippedSteps.push('תרשימי התפלגות');
    }

    return { chapterInterpretations, chapterLitReview, chapterFigures, skippedSteps };
  }, [analysis, output, interpretations, litReview, assignmentText, profile, logAi]);

  // "צור מסמך פרק ממצאים" = one-click: מריץ אוטומטית גם פירוש פלט וגם סקירת
  // ספרות אם עוד לא הופקו, ואז מרכיב את הפרק — במקום שלוש לחיצות נפרדות.
  // כשל בשלב עזר (פירוש/סקירה) לא עוצר את הפרק — רק מדווח בסוף.
  const onBuildChapter = React.useCallback(async () => {
    if (!output.trim()) {
      setNotice({ tone: 'error', text: 'אין פלט להרכבת פרק ממצאים.' });
      return;
    }
    setBusy('chapter');
    setChapterTruncated(false);
    try {
      const { chapterInterpretations, chapterLitReview, chapterFigures, skippedSteps } = await ensureChapterPrereqs({
        notify: (text) => setNotice({ tone: 'info', text }),
      });

      setNotice({ tone: 'info', text: 'שלב 3/4: מרכיב פרק ממצאים...' });
      const result = await buildSpssFindingsChapter({ assignmentText, analysis, masterSyntax, output, interpretations: chapterInterpretations, draftText: draft?.text || '', figures: chapterFigures, providerOverride: spssRouteRef.current.providerId, modelOverride: spssRouteRef.current.model });
      if (!result.ok) {
        setNotice({ tone: 'error', text: result.error || 'הרכבת פרק הממצאים נכשלה.' });
        return;
      }
      logAi({ stage: 'פרק ממצאים', description: `הרכבת פרק ממצאים בעברית מהפלט, הפירושים והמטלה${chapterFigures.length ? `, כולל ${chapterFigures.length} תרשימי התפלגות שנוצרו מהנתונים` : ''}`, prompt: 'הרכב פרק ממצאים מהפלט והפירושים', providerId: result.providerId, model: result.model });

      // שלב 4/4 — פרק סיכום ודיון. כשל כאן לא חוסם את פליטת המסמך.
      setNotice({ tone: 'info', text: 'שלב 4/4: כותב פרק סיכום ודיון...' });
      let summaryResult = null;
      try {
        summaryResult = await buildSpssSummaryChapter({ assignmentText, analysis, interpretations: chapterInterpretations, findingsHtml: result.html, litReview: chapterLitReview, draftText: draft?.text || '', providerOverride: spssRouteRef.current.providerId, modelOverride: spssRouteRef.current.model });
        if (summaryResult.ok) {
          logAi({ stage: 'פרק סיכום ודיון', description: 'כתיבת פרק סיכום ודיון: מהלך המחקר, ממצאים מול ההשערות, דיון מול הספרות, מגבלות והמלצות', prompt: 'כתוב פרק סיכום ודיון על בסיס פרק הממצאים והספרות', providerId: summaryResult.providerId, model: summaryResult.model });
        } else {
          skippedSteps.push('פרק סיכום ודיון');
        }
      } catch {
        skippedSteps.push('פרק סיכום ודיון');
      }
      const summaryHtml = summaryResult?.ok ? summaryResult.html : '';
      setChapterTruncated(Boolean(result.truncated || (summaryResult?.ok && summaryResult.truncated)));
      // שומרים את הפרקים שנבנו כדי ש"הכן עבודה מוכנה להגשה" יוכל להשתמש בהם
      // ישירות במקום לבנות אותם מחדש.
      setBuiltChapters({ findingsHtml: result.html, summaryHtml, figures: chapterFigures });
      if (typeof onEmitDocument === 'function') {
        // יש טיוטה? קודם מנסים שילוב חכם: הערות "(הערה: חלק זה יורחב לאחר
        // הרצת הניתוח בפועל)" בטיוטה מוחלפות בתת-הפרק המתאים מהממצאים, כך
        // שהתוצאות נכנסות במקום הנכון בגוף העבודה. אין הערות כאלה? נופלים
        // לצירוף הישן — טיוטה + פרק בסופה.
        let mergedHtml = result.html;
        let mergeSummary = '';
        if (draft?.html) {
          const smartMerge = mergeSpssFindingsIntoDraftHtml(draft.html, result.html);
          if (smartMerge && smartMerge.replacedCount > 0) {
            mergedHtml = smartMerge.mergedHtml;
            mergeSummary = `שולב בגוף העבודה (${smartMerge.replacedCount} הערות "יורחב לאחר ההרצה" הוחלפו בתוצאות${smartMerge.appendedCount ? `, ${smartMerge.appendedCount} תתי-פרקים נוספו בסוף` : ''})`;
          } else {
            mergedHtml = `${draft.html}\n<hr>\n${result.html}`;
            mergeSummary = 'צורף בסוף הטיוטה';
          }
          // פרק הסיכום תמיד מצטרף בסוף העבודה.
          if (summaryHtml) mergedHtml = `${mergedHtml}\n<hr>\n${summaryHtml}`;
        } else if (chapterLitReview?.review) {
          // אין טיוטה (= אין סקירה קיימת בעבודה) → מסמך עצמאי שלם: פרק ממצאים +
          // סקירת ספרות + סיכום ודיון + רשימת מקורות.
          mergedHtml = [
            result.html,
            '<h2>סקירת ספרות</h2>',
            textToHtmlParagraphs(chapterLitReview.review),
            summaryHtml,
            '<h2>רשימת מקורות</h2>',
            `<ol>${(chapterLitReview.references || []).map((ref) => `<li>${escapeHtml(ref)}</li>`).join('')}</ol>`,
          ].filter(Boolean).join('\n');
          mergeSummary = 'כולל סקירת ספרות, פרק סיכום ודיון ורשימת מקורות';
        } else if (summaryHtml) {
          mergedHtml = `${result.html}\n${summaryHtml}`;
        }
        onEmitDocument({
          html: mergedHtml,
          title: draft?.title || result.title || 'פרק ממצאים',
          withAiAppendix: attachAiAppendix,
        });
        if (result.truncated || (summaryResult?.ok && summaryResult.truncated)) {
          setNotice({ tone: 'error', text: 'הפרק ארוך ונקטע למרות ניסיונות השלמה — נסה שוב או פצל את הבקשה.' });
        } else {
          const doneParts = [summaryHtml ? 'פרק הממצאים ופרק הסיכום מוכנים' : 'פרק הממצאים מוכן'];
          if (chapterFigures.length) doneParts.push(`${chapterFigures.length} תרשימי התפלגות שובצו`);
          if (mergeSummary) doneParts.push(mergeSummary);
          if (draft?.html && chapterLitReview?.review) doneParts.push('סקירת הספרות מוכנה בפאנל למטה — "הוסף לתוצר" כשתרצה');
          const skippedText = skippedSteps.length ? ` (דולג: ${skippedSteps.join(', ')})` : '';
          setNotice({ tone: skippedSteps.length ? 'info' : 'success', text: `${doneParts.join(' · ')}.${skippedText}` });
        }
      } else {
        setNotice({ tone: 'error', text: 'אין יעד להזרמת המסמך. נסה שוב מתוך האפליקציה.' });
      }
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'הרכבת פרק הממצאים נכשלה.' });
    } finally {
      setBusy('');
    }
  }, [assignmentText, analysis, masterSyntax, output, draft, onEmitDocument, logAi, attachAiAppendix, ensureChapterPrereqs]);

  // "הכן עבודה מוכנה להגשה" = מרכיב עבודה שלמה: שלבי ההכנה המשותפים (ensureChapterPrereqs),
  // פרק ממצאים + פרק סיכום (משתמש בפרקים שכבר נבנו אם קיימים), ואז מרכיב הכל
  // לעבודה שלמה דרך buildSpssSubmissionWork ומחליף את המסמך בעורך.
  const onBuildSubmissionWork = React.useCallback(async () => {
    if (busy || !output.trim()) return;
    if (draft?.text) {
      const proceed = await showConfirm('הפעולה תבנה עבודה שלמה ותחליף את המסמך הפתוח בעורך. להמשיך?', {
        title: 'בניית עבודה להגשה',
        confirmLabel: 'המשך',
      });
      if (!proceed) return;
    } else {
      const proceed = await showConfirm('אין טיוטה — העבודה תיבנה מהחומרים (המטלה, הממצאים) בלבד. להמשיך?', {
        title: 'בניית עבודה להגשה',
        confirmLabel: 'המשך',
      });
      if (!proceed) return;
    }

    setBusy('submission');
    try {
      const route = { providerOverride: spssRouteRef.current.providerId, modelOverride: spssRouteRef.current.model };
      const { chapterInterpretations, chapterLitReview, chapterFigures, skippedSteps } = await ensureChapterPrereqs({
        notify: (text) => setNotice({ tone: 'info', text: text.replace('/4', '/5') }),
      });

      let findingsHtml = '';
      let summaryHtml = '';
      let figures = [];
      if (builtChapters?.findingsHtml) {
        setNotice({ tone: 'info', text: 'שלב 3/5: משתמש בפרקים שכבר נבנו...' });
        findingsHtml = builtChapters.findingsHtml;
        summaryHtml = builtChapters.summaryHtml || '';
        figures = builtChapters.figures || [];
      } else {
        setNotice({ tone: 'info', text: 'שלב 3/5: מרכיב פרק ממצאים...' });
        figures = Array.isArray(chapterFigures) ? chapterFigures : [];
        const findingsResult = await buildSpssFindingsChapter({ assignmentText, analysis, masterSyntax, output, interpretations: chapterInterpretations, draftText: draft?.text || '', figures, providerOverride: route.providerOverride, modelOverride: route.modelOverride });
        if (!findingsResult.ok) {
          setNotice({ tone: 'error', text: findingsResult.error || 'הרכבת פרק הממצאים נכשלה.' });
          return;
        }
        logAi({ stage: 'פרק ממצאים', description: 'הרכבת פרק ממצאים בעברית מהפלט, הפירושים והמטלה', prompt: 'הרכב פרק ממצאים מהפלט והפירושים', providerId: findingsResult.providerId, model: findingsResult.model });
        findingsHtml = findingsResult.html;

        setNotice({ tone: 'info', text: 'שלב 4/5: כותב פרק סיכום ודיון...' });
        try {
          const summaryResult = await buildSpssSummaryChapter({ assignmentText, analysis, interpretations: chapterInterpretations, findingsHtml, litReview: chapterLitReview, draftText: draft?.text || '', providerOverride: route.providerOverride, modelOverride: route.modelOverride });
          if (summaryResult.ok) {
            summaryHtml = summaryResult.html;
            logAi({ stage: 'פרק סיכום ודיון', description: 'כתיבת פרק סיכום ודיון: מהלך המחקר, ממצאים מול ההשערות, דיון מול הספרות, מגבלות והמלצות', prompt: 'כתוב פרק סיכום ודיון על בסיס פרק הממצאים והספרות', providerId: summaryResult.providerId, model: summaryResult.model });
          } else {
            skippedSteps.push('פרק סיכום ודיון');
          }
        } catch {
          skippedSteps.push('פרק סיכום ודיון');
        }
      }

      setNotice({ tone: 'info', text: 'שלב 5/5: מרכיב את העבודה המלאה...' });
      const submission = await buildSpssSubmissionWork({
        assignmentText, analysis, masterSyntax, output,
        interpretations: chapterInterpretations,
        draftText: draft?.text || '',
        findingsHtml, summaryHtml,
        litReview: chapterLitReview,
        figures,
        ...route,
      });
      if (!submission.ok) {
        setNotice({ tone: 'error', text: submission.error || 'הרכבת העבודה להגשה נכשלה.' });
        return;
      }
      logAi({ stage: 'עבודה מוכנה להגשה', description: 'הרכבת עבודה שלמה מהטיוטה, פרק הממצאים, פרק הסיכום וסקירת הספרות', prompt: 'הרכב עבודה שלמה מוכנה להגשה', providerId: submission.providerId, model: submission.model });

      if (typeof onEmitDocument === 'function') {
        onEmitDocument({ html: submission.html, title: submission.title || 'עבודה מוכנה להגשה', withAiAppendix: attachAiAppendix, mode: 'replace' });
        const skippedText = skippedSteps.length ? ` (דולג: ${skippedSteps.join(', ')})` : '';
        if (submission.truncated) {
          setNotice({ tone: 'error', text: `העבודה המלאה נבנתה ונטענה לעורך, אך נקטעה למרות ניסיונות השלמה — בדוק את הסוף.${skippedText}` });
        } else {
          setNotice({ tone: skippedSteps.length ? 'info' : 'success', text: `העבודה המלאה נבנתה ונטענה לעורך.${skippedText}` });
        }
      } else {
        setNotice({ tone: 'error', text: 'אין יעד להזרמת המסמך. נסה שוב מתוך האפליקציה.' });
      }
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'הרכבת העבודה להגשה נכשלה.' });
    } finally {
      setBusy('');
    }
  }, [busy, output, draft, builtChapters, assignmentText, analysis, masterSyntax, onEmitDocument, logAi, attachAiAppendix, ensureChapterPrereqs]);

  // Lit review + reference list (sections א+ד) — verified academic sources only.
  const onBuildLitReview = React.useCallback(async () => {
    const topic = buildLitReviewTopic(profile, assignmentText);
    if (!topic) {
      setNotice({ tone: 'error', text: 'אין נושא מחקר. הדבק את טקסט המטלה כדי לאתר מקורות.' });
      return;
    }
    setBusy('litreview');
    setNotice({ tone: 'info', text: 'מאתר מקורות אקדמיים מאומתים...' });
    try {
      const result = await buildLiteratureReview({ topic, topicEn: profile?.topicEn || '', vetTopic: assignmentText.trim().slice(0, 2000), count: 5, providerOverride: spssRouteRef.current.providerId, modelOverride: spssRouteRef.current.model });
      if (!result.ok) {
        setNotice({ tone: 'error', text: result.error || 'איתור המקורות נכשל.' });
        return;
      }
      setLitReview({ review: result.review, references: result.references });
      logAi({ stage: 'סקירת ספרות ומקורות', description: `איתור ${result.references.length} מקורות אקדמיים מאומתים וסקירת ספרות קצרה מבוססת עליהם`, prompt: `אתר מקורות אקדמיים בנושא: ${topic}`, providerId: result.providerId, model: result.model });
      setNotice({ tone: 'success', text: `נמצאו ${result.references.length} מקורות מאומתים ונכתבה סקירת ספרות. בדוק והוסף לתוצר.` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'איתור המקורות נכשל.' });
    } finally {
      setBusy('');
    }
  }, [assignmentText, profile, logAi]);

  // Optional lecturer-advice panel (שלב D) — guidance-only call, no chapter/syntax
  // changes on its own; suggestions are validated against real metadata in the service
  // (buildAliasToColumnMap) before they ever reach the UI, so every suggestedVariables
  // entry here is guaranteed to exist in the dataset.
  const onAdviseLecturer = React.useCallback(async (force = false) => {
    if (!output.trim()) {
      setNotice({ tone: 'error', text: 'הדבק פלט מ-SPSS לפני בקשת המלצת מרצה.' });
      return;
    }
    // עצירת-לולאה באפס קריאות: הקוד השתנה מאז ההרצה שהודבקה — ייעוץ על פלט ישן
    // יחזיר את אותן המלצות. חוסמים עד שיודבק פלט עדכני (או force מכפתור מפורש).
    if (outputStale && !force) {
      setNotice({ tone: 'error', text: 'הקוד השתנה מאז ההרצה שהודבקה — הרץ את הקוד המעודכן ב-SPSS והדבק פלט חדש לפני בקשת המלצה חוזרת (אחרת יחזרו אותן המלצות).' });
      return;
    }
    setBusy('lecturer-advice');
    setNotice({ tone: 'info', text: 'מכין המלצת מרצה על סמך התוצאות...' });
    try {
      const result = await adviseLecturerNextSteps({
        assignmentText,
        analysis,
        profile,
        masterSyntax,
        output,
        interpretations,
        priorAdvice: advisoryLedger,
        providerOverride: spssRouteRef.current.providerId,
        modelOverride: spssRouteRef.current.model,
      });
      if (!result.ok) {
        setNotice({ tone: 'error', text: result.error || 'הפקת המלצת המרצה נכשלה.' });
        return;
      }
      setLecturerAdvice(result);
      // רישום ההמלצות ב-ledger (טרם יושמו) + זיהוי דטרמיניסטי של עצה חוזרת: אותה
      // המלצה שכבר יושמה חוזרת ⇒ היישום לא פתר, מסלימים לשינוי תוכנית במקום סבב נוסף.
      noteAdvisoryEntries((result.recommendations || []).map((rec) => ({
        source: 'lecturer',
        text: `${rec.finding || ''}: ${rec.recommendation || rec.suggestedAnalysis || ''}`.trim(),
        appliedAs: '',
      })));
      const adviceFingerprint = buildAdviceFingerprint(result.recommendations || []);
      setRepeatedAdvice(Boolean(adviceFingerprint) && adviceFingerprint === lastAppliedAdviceFingerprintRef.current);
      logAi({ stage: 'המלצת מרצה', description: 'ייעוץ מרצה על סמך התוצאות — כיווני המשך והמלצות', prompt: 'המלץ על כיווני המשך על סמך התוצאות', providerId: result.providerId, model: result.model });
      setNotice({ tone: 'success', text: 'המלצת המרצה מוכנה.' });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'הפקת המלצת המרצה נכשלה.' });
    } finally {
      setBusy('');
    }
  }, [output, outputStale, assignmentText, analysis, profile, masterSyntax, interpretations, advisoryLedger, noteAdvisoryEntries, logAi]);

  // יישום המלצת מרצה = שינוי תוכנית אמיתי (הגשר ששובר את הלולאה): ההמלצה מנותבת
  // ל-reviseAssignmentProfile דרך applyPlanChange — התוכנית מתעדכנת, הקוד מתרענן
  // מהתוכנית המלאה, הפלט הישן מנוקה, וה-ledger + fingerprint זוכרים שהעצה יושמה.
  // (המסלול הישן רק הדביק בלוק קוד בלי לגעת בתוכנית — והיועץ חזר על אותה עצה.)
  const onAddLecturerRecommendation = React.useCallback(async (rec) => {
    if (!rec?.suggestedAnalysis || !Array.isArray(rec.suggestedVariables) || !rec.suggestedVariables.length) return;
    const busyKey = `lecturer-rec-${rec.finding || rec.suggestedAnalysis}`;
    const changeRequest = [
      `הוסף לתוכנית ניתוח: ${rec.suggestedAnalysis} עבור המשתנים: ${rec.suggestedVariables.join(', ')}.`,
      rec.recommendation ? `רקע להמלצה: ${rec.recommendation}` : '',
      rec.integrityNote ? `הערת יושרה (לציין ב-rationale): ${rec.integrityNote}` : '',
    ].filter(Boolean).join('\n');
    const advisoryContext = [rec.finding, rec.recommendation].filter(Boolean).join(' — ');
    const applied = await applyPlanChange(changeRequest, {
      regenerate: true,
      advisoryContext,
      expectedAnalysis: rec.suggestedAnalysis,
      stageLabel: 'המלצת מרצה',
      stageDescription: `עדכון התוכנית לפי המלצת מרצה: ${String(rec.finding || rec.suggestedAnalysis || '').slice(0, 60)}`,
      busyKey,
    });
    if (applied.ok) {
      // חיווי מקומי על הכרטיס עצמו — ה-notice העליון נגלל מחוץ למסך כשהפאנל בתחתית.
      setAddedLecturerRecKeys((prev) => { const next = new Set(prev); next.add(busyKey); return next; });
      markAdvisoryApplied(`${rec.finding || ''}: ${rec.recommendation || rec.suggestedAnalysis || ''}`.trim(), `התוכנית עודכנה (${rec.suggestedAnalysis})`);
      lastAppliedAdviceFingerprintRef.current = buildAdviceFingerprint(lecturerAdvice?.recommendations || []);
    }
  }, [applyPlanChange, markAdvisoryApplied, lecturerAdvice]);

  const onCopySyntax = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(masterSyntax);
      setNotice({ tone: 'success', text: 'ה-master syntax הועתק ללוח.' });
    } catch {
      setNotice({ tone: 'error', text: 'ההעתקה נכשלה. סמן והעתק ידנית.' });
    }
  }, [masterSyntax]);

  const onDownloadSyntax = React.useCallback(async () => {
    try {
      await downloadTextFile(masterSyntax, spsFileName);
      setNotice({ tone: 'success', text: `קובץ הסינטקס נוצר: ${spsFileName}` });
    } catch {
      setNotice({ tone: 'error', text: 'הורדת קובץ הסינטקס נכשלה.' });
    }
  }, [masterSyntax, spsFileName]);

  // פאנל המלצת מרצה — מרונדר גם במקצה השיפורים (שם עוד עובדים על הקוד ו"הוסף
  // לקוד" הכי שימושי) וגם בשלב ההסבר. badgeNumber מוצג רק בשלב ההסבר הממוספר.
  const renderLecturerPanel = (badgeNumber = null) => (
    <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold text-slate-900">{badgeNumber !== null && <StageBadge n={badgeNumber} />} 🎓 המלצת מרצה</div>
          <p className="mt-1 text-sm text-slate-600">אופציונלי — ייעוץ על סמך התוצאות: כיווני חיזוק, מנבאים חלופיים והסתייגויות.</p>
        </div>
        <button
          type="button"
          className={`rounded-2xl px-5 py-2.5 text-sm font-semibold text-white transition ${busy === 'lecturer-advice' ? 'cursor-wait bg-slate-300' : 'bg-[#0066cc] hover:bg-blue-700'}`}
          onClick={() => onAdviseLecturer()}
          disabled={!output.trim() || Boolean(busy)}
        >
          {busy === 'lecturer-advice' ? 'מכין המלצה...' : (lecturerAdvice ? 'בקש המלצת מרצה מחדש' : 'בקש המלצת מרצה')}
        </button>
      </div>
      {outputStale && output.trim() && (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-800">
          ⚠️ הקוד השתנה מאז ההרצה שהודבקה — המלצה חדשה על פלט ישן תחזור על עצמה. הרץ את הקוד המעודכן והדבק פלט חדש.
          <button type="button" className="mr-2 rounded-full border border-amber-300 bg-white px-3 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100" onClick={() => onAdviseLecturer(true)} disabled={Boolean(busy)}>בקש המלצה בכל זאת</button>
        </div>
      )}
      {repeatedAdvice && (
        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-6 text-rose-800">
          <strong>המרצה חזר על המלצה שכבר יושמה</strong> — כנראה שהיישום לא פתר את הבעיה. במקום סבב נוסף, שנה את התוכנית עצמה:
          <button
            type="button"
            className="mr-2 rounded-full border border-rose-300 bg-white px-3 py-1 text-[11px] font-semibold text-rose-800 hover:bg-rose-100"
            onClick={() => {
              setShowPlanChange(true);
              setChangeRequestText(`ההמלצה "${String(lecturerAdvice?.recommendations?.[0]?.recommendation || lecturerAdvice?.summary || '').slice(0, 200)}" חזרה גם אחרי שיושמה — שנה את התוכנית בגישה שונה שתפתור את הבעיה מהשורש.`);
            }}
          >
            עבור לשינוי תוכנית
          </button>
        </div>
      )}
      {lecturerAdvice ? (
        <div className="mt-4 space-y-3">
          {lecturerAdvice.summary && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-800 whitespace-pre-wrap">{lecturerAdvice.summary}</div>
          )}
          {(lecturerAdvice.recommendations || []).map((rec, index) => {
            const hasVariables = Array.isArray(rec.suggestedVariables) && rec.suggestedVariables.length > 0;
            const busyKey = `lecturer-rec-${rec.finding || rec.suggestedAnalysis}`;
            return (
              <div key={`${rec.finding || 'rec'}-${index}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-800">
                <div className="font-semibold text-slate-900">{rec.finding}</div>
                {rec.recommendation && <div className="mt-1 text-slate-700">{rec.recommendation}</div>}
                {rec.suggestedAnalysis && <div className="mt-1 text-xs text-slate-500">ניתוח מוצע: {rec.suggestedAnalysis}</div>}
                {hasVariables && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {rec.suggestedVariables.map((varName) => (
                      <span key={varName} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{varName}</span>
                    ))}
                  </div>
                )}
                {rec.integrityNote && (
                  <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-800">⚖️ הערת יושרה אקדמית: {rec.integrityNote}</div>
                )}
                {hasVariables && (
                  <div className="mt-3">
                    {addedLecturerRecKeys.has(busyKey) ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.2 7.3a1 1 0 0 1-1.42.004L3.29 9.21a1 1 0 1 1 1.42-1.408l3.09 3.116 6.49-6.582a1 1 0 0 1 1.414-.006Z" clipRule="evenodd" /></svg>
                          יושם בתוכנית
                        </span>
                        <span className="text-xs text-slate-500">התוכנית עודכנה והקוד נוצר מחדש — הרץ ב-SPSS והדבק פלט חדש.</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition ${busy === busyKey ? 'cursor-wait border-blue-200 bg-blue-50 text-blue-500' : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
                        onClick={() => onAddLecturerRecommendation(rec)}
                        disabled={Boolean(busy)}
                      >
                        {busy === busyKey && (
                          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
                          </svg>
                        )}
                        {busy === busyKey ? 'מעדכן תוכנית וקוד...' : 'יישם בתוכנית ובקוד'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">הדבק פלט מ-SPSS ולחץ "בקש המלצת מרצה" לקבלת כיווני המשך.</div>
      )}
    </section>
  );

  // התייעצות לפני הקוד — כפתור ייעודי חושף כתיבה חופשית + שרשור שאלות-תשובות.
  // advisory בלבד: לא נוגע בתוכנית ולא מייצר קוד. מוצג בשלב הקוד, ליד התוכנית.
  const renderConsultBox = () => (
    <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 px-4 py-4">
      {!showConsult && consultThread.length === 0 ? (
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-60"
          onClick={() => setShowConsult(true)}
          disabled={Boolean(busy)}
        >
          🤔 התייעץ לפני יצירת הקוד
        </button>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-bold text-indigo-900">🤔 התייעצות לפני הקוד <span className="font-normal text-indigo-500">(ייעוץ בלבד — לא משנה את התוכנית)</span></div>
            {consultThread.length > 0 && (
              <button
                type="button"
                className="text-xs font-semibold text-slate-400 transition hover:text-slate-600 disabled:opacity-60"
                onClick={() => { setConsultThread([]); setConsultQuestion(''); setShowConsult(false); }}
                disabled={Boolean(busy)}
              >
                נקה שיחה
              </button>
            )}
          </div>

          {consultThread.length > 0 && (
            <div className="mt-3 space-y-3">
              {consultThread.map((turn) => (
                <div key={turn.id} className="space-y-2">
                  <div className="rounded-2xl bg-indigo-100/70 px-3 py-2 text-sm leading-6 text-indigo-900">
                    <span className="font-semibold">אתה: </span>{turn.question}
                  </div>
                  <div className="rounded-2xl border border-indigo-100 bg-white px-3 py-2 text-sm leading-7 text-slate-800 whitespace-pre-wrap">
                    <span className="font-semibold text-indigo-700">יועץ: </span>{turn.answer}
                  </div>
                  {turn.proposedChange && (
                    <div className="flex flex-wrap gap-1.5">
                      {turn.proposedChange.newVariable?.name ? (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                          🧮 {turn.proposedChange.newVariable.name} ← {(turn.proposedChange.newVariable.buildFrom || []).join(', ')}
                        </span>
                      ) : (
                        (turn.proposedChange.suggestedVariables || []).map((varName) => (
                          <span key={varName} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{varName}</span>
                        ))
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${busy === `consult-apply-${turn.id}` ? 'cursor-wait border-indigo-200 bg-indigo-50 text-indigo-400' : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}
                    onClick={() => onApplyConsultAdvice(turn)}
                    disabled={Boolean(busy)}
                  >
                    {busy === `consult-apply-${turn.id}` ? 'מעדכן תוכנית...' : '✔ יישם בתוכנית וצור קוד'}
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            className="mt-3 min-h-[64px] w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100/70"
            placeholder={consultThread.length ? 'שאל שאלת המשך...' : 'למשל: "האם t-test הוא המבחן הנכון כאן?", "כדאי להוסיף בקרה על גיל?", "מה ההבדל בין המבחנים בתוכנית?"'}
            value={consultQuestion}
            onChange={(event) => setConsultQuestion(event.target.value)}
            disabled={busy === 'consult'}
            autoFocus
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`rounded-2xl px-5 py-2.5 text-sm font-semibold text-white transition ${busy === 'consult' || !consultQuestion.trim() ? 'cursor-not-allowed bg-slate-300' : 'bg-indigo-600 hover:bg-indigo-700'}`}
              onClick={onConsult}
              disabled={Boolean(busy) || !consultQuestion.trim()}
            >
              {busy === 'consult' ? 'מתייעץ...' : (consultThread.length ? 'שאל' : 'התייעץ')}
            </button>
            <button
              type="button"
              className="rounded-2xl px-3 py-2.5 text-sm font-semibold text-slate-500 transition hover:text-slate-700 disabled:opacity-60"
              onClick={() => setShowConsult(false)}
              disabled={Boolean(busy)}
            >
              {consultThread.length ? 'סגור' : 'ביטול'}
            </button>
          </div>
        </>
      )}
    </div>
  );

  // בקשת שינוי חופשית לתוכנית הניתוח — משותפת לשלב הקוד ולמקצה השיפורים.
  // כפתור ייעודי חושף את הכתיבה החופשית (במקום textarea תמידי). שני מסלולים:
  // "עדכן תוכנית בלבד" (בודקים לפני שמייצרים קוד) ו"עדכן וייצר קוד מחדש".
  const renderPlanChangeBox = (title) => (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      {!showPlanChange ? (
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-60"
          onClick={() => setShowPlanChange(true)}
          disabled={Boolean(busy)}
        >
          ✏️ {title}
        </button>
      ) : (
        <>
          <div className="text-sm font-bold text-slate-800">{title}</div>
          <textarea
            className="mt-2 min-h-[64px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100/70"
            placeholder='למשל: "במקום גיל תשתמש בסטטוס סוציו-אקונומי", "תוריד את ניתוח החי-בריבוע", "הוסף מבחן מתאם לכל זוג"'
            value={changeRequestText}
            onChange={(event) => setChangeRequestText(event.target.value)}
            disabled={Boolean(busy)}
            autoFocus
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`rounded-2xl px-5 py-2.5 text-sm font-semibold text-white transition ${busy === 'revise' || !changeRequestText.trim() ? 'cursor-not-allowed bg-slate-300' : 'bg-[#0066cc] hover:bg-blue-700'}`}
              onClick={() => onReviseProfile(false)}
              disabled={Boolean(busy) || !changeRequestText.trim()}
            >
              {busy === 'revise' ? 'מעדכן תוכנית...' : 'עדכן תוכנית בלבד'}
            </button>
            <button
              type="button"
              className={`rounded-2xl border px-5 py-2.5 text-sm font-semibold transition ${busy === 'revise' || busy === 'code' || !changeRequestText.trim() ? 'cursor-not-allowed border-slate-200 text-slate-400' : 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50'}`}
              onClick={() => onReviseProfile(true)}
              disabled={Boolean(busy) || !changeRequestText.trim()}
            >
              עדכן וייצר קוד מחדש
            </button>
            <button
              type="button"
              className="rounded-2xl px-3 py-2.5 text-sm font-semibold text-slate-500 transition hover:text-slate-700 disabled:opacity-60"
              onClick={() => { setShowPlanChange(false); setChangeRequestText(''); }}
              disabled={Boolean(busy)}
            >
              ביטול
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-slate-500">"עדכן תוכנית בלבד" מרענן את התוכנית מבלי לייצר קוד — כדי שתבדוק אותה ותפיק קוד בעצמך.</p>
        </>
      )}
    </div>
  );

  const appendixText = React.useMemo(() => buildAiAppendixText(aiLog), [aiLog]);
  const litReviewText = React.useMemo(() => buildLitReviewText(litReview), [litReview]);
  // Honest Scholar hint (שלב A2) — only claim it's configured when the user actually
  // set SerpAPI + a key, mirroring the real gate in sourceRetrieval/pipeline.js.
  const scholarConfigured = Boolean(providerConfigState?.scholar?.provider === 'serpapi' && providerConfigState?.scholar?.key);

  const copyToClipboard = React.useCallback(async (text, okMsg) => {
    try {
      await navigator.clipboard.writeText(String(text || ''));
      setNotice({ tone: 'success', text: okMsg });
    } catch {
      setNotice({ tone: 'error', text: 'ההעתקה נכשלה. סמן והעתק ידנית.' });
    }
  }, []);

  // Append a standalone section (lit review, refs, AI appendix) to the emitted document.
  const onAddSectionToDoc = React.useCallback((html, title) => {
    if (typeof onEmitDocument !== 'function') {
      setNotice({ tone: 'error', text: 'אין יעד להזרמת המסמך. נסה מתוך האפליקציה.' });
      return;
    }
    onEmitDocument({ html, title });
    setNotice({ tone: 'success', text: `"${title}" נוסף למסמך בעורך.` });
  }, [onEmitDocument]);

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-[#ECE8E1]" dir="rtl">
      <input
        ref={fileInputRef}
        type="file"
        accept={SUPPORTED_DATA_FILE_ACCEPT}
        className="hidden"
        onChange={onFileInputChange}
      />
      <input
        ref={draftInputRef}
        type="file"
        accept={BROWSER_DOC_ACCEPT}
        className="hidden"
        onChange={onDraftInputChange}
      />
      <input
        ref={assignmentInputRef}
        type="file"
        accept={BROWSER_DOC_ACCEPT}
        className="hidden"
        onChange={onAssignmentFileInputChange}
      />
      <input
        ref={outputInputRef}
        type="file"
        accept={BROWSER_OUTPUT_ACCEPT}
        className="hidden"
        onChange={onOutputFileInputChange}
      />
      <input
        ref={chartImageInputRef}
        type="file"
        accept={CHART_IMAGE_ACCEPT}
        multiple
        className="hidden"
        onChange={onChartImageInputChange}
      />
      <input
        ref={chartFolderInputRef}
        type="file"
        webkitdirectory=""
        multiple
        className="hidden"
        onChange={onChartFolderInputChange}
      />

      {/* Header + stepper */}
      <div className="border-b border-slate-200 bg-white px-5 py-4 md:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center rounded-full bg-[#1F6FEB]/10 px-3 py-1 text-[11px] font-bold text-[#1F6FEB]">עבודת סיום · SPSS</div>
            <h1 className="text-xl font-bold text-slate-900">מצב עבודה מונחה</h1>
          </div>
          <div className="flex items-center gap-2">
            {onOpenHelp && (
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
                onClick={() => onOpenHelp('studios')}
                title="מדריך הסטודיו"
              >
                ❓ מדריך
              </button>
            )}
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
              onClick={onExit}
            >
              יציאה
            </button>
          </div>
        </div>
        {stage !== 'quick-interpret' && (
        <div className="mx-auto mt-4 flex w-full max-w-6xl items-center gap-2 overflow-x-auto">
          {STAGES.map((entry, index) => {
            const reached = index <= stageIndex;
            const active = entry.id === stage;
            return (
              <React.Fragment key={entry.id}>
                <button
                  type="button"
                  disabled={index > stageIndex}
                  onClick={() => goToStage(entry.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-xs font-bold transition ${
                    active ? 'bg-[#0066cc] text-white shadow-sm'
                      : reached ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                        : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${active ? 'bg-white/25' : reached ? 'bg-blue-200/70 text-blue-800' : 'bg-slate-200 text-slate-500'}`}>{index + 1}</span>
                  <span className="whitespace-nowrap">{entry.label}</span>
                </button>
                {index < STAGES.length - 1 && <span className="h-px w-4 shrink-0 bg-slate-200" />}
              </React.Fragment>
            );
          })}
        </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-8">
        <div className="mx-auto w-full max-w-6xl space-y-5">
          <div className={`rounded-[24px] border px-5 py-4 text-sm leading-7 shadow-sm ${statusToneClass}`}>
            {notice.text}
          </div>

          {/* STAGE 1 — understand */}
          {stage === 'understand' && (
            <>
            <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-5 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-lg font-bold text-slate-900">מודל ה-AI לעבודה</span>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={resolvedSpssProviderId}
                    onChange={(event) => onPickSpssProvider(event.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
                  >
                    {providerChoices.map((choice) => (
                      <option key={choice.id} value={choice.id}>{choice.label}{choice.isDefault ? ' (ברירת מחדל)' : ''}</option>
                    ))}
                  </select>
                  <select
                    value={resolvedSpssModel}
                    onChange={(event) => onPickSpssModel(event.target.value)}
                    disabled={!modelChoices.length}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
                  >
                    {modelChoices.length
                      ? modelChoices.map((modelName) => (<option key={modelName} value={modelName}>{modelName}</option>))
                      : <option value="">אין מודלים זמינים</option>}
                  </select>
                </div>
                <span className="text-[11px] text-slate-400">נבחר כאן — בלי להיכנס להגדרות. חל על כל שלבי העבודה.</span>
              </div>
            </section>

            <button
              type="button"
              onClick={() => { setStage('quick-interpret'); setNotice({ tone: 'info', text: 'הדבק או העלה פלט מ-SPSS וקבל פירוש.' }); }}
              className="flex w-full items-center justify-between gap-3 rounded-[28px] border border-blue-200 bg-blue-50/60 px-6 py-4 text-right shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
            >
              <span className="text-sm leading-7 text-slate-700"><span className="font-bold text-blue-800">כבר יש לך פלט מ-SPSS?</span> דלג ישר לפירוש והסבר — בלי להעלות מטלה או נתונים.</span>
              <span className="shrink-0 rounded-full bg-[#0066cc] px-4 py-2 text-sm font-semibold text-white">פרש פלט →</span>
            </button>

            <div className="grid gap-5 lg:grid-cols-2">
              <section
                className={`rounded-[28px] border-2 border-dashed px-6 py-6 shadow-sm transition ${dragActive ? 'border-[#1F6FEB] bg-blue-50/70' : 'border-slate-300 bg-white'}`}
                onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget)) setDragActive(false); }}
                onDrop={onDrop}
              >
                <div className="text-lg font-bold text-slate-900">1. קובץ הנתונים</div>
                <p className="mt-2 text-sm leading-7 text-slate-600">העלה SAV, CSV, Excel, TSV או TXT. ל-AI נשלחים רק שמות המשתנים וסטטיסטיקות סיכום — לא שורות הדאטה.</p>
                <button
                  type="button"
                  className={`mt-4 rounded-2xl px-5 py-3 text-sm font-semibold text-white transition ${busy === 'upload' ? 'cursor-wait bg-slate-300' : 'bg-[#0066cc] hover:bg-blue-700'}`}
                  onClick={openFilePicker}
                  disabled={busy === 'upload'}
                >
                  {busy === 'upload' ? 'טוען...' : (analysis ? 'החלף קובץ' : 'טען קובץ נתונים')}
                </button>
                {analysis && (
                  <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{analysis.fileName || 'קובץ'}</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{analysis.rowCount.toLocaleString('he-IL')} שורות</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{analysis.columnCount} עמודות</span>
                  </div>
                )}
              </section>

              <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="text-lg font-bold text-slate-900">2. טקסט המטלה</div>
                  <button
                    type="button"
                    className={`rounded-2xl border px-4 py-2 text-xs font-semibold transition ${busy === 'assignment-file' ? 'cursor-wait border-slate-200 bg-slate-100 text-slate-400' : 'border-[#1F6FEB]/30 bg-[#1F6FEB]/5 text-[#1F6FEB] hover:bg-[#1F6FEB]/10'}`}
                    onClick={onSelectAssignmentFile}
                    disabled={busy === 'assignment-file'}
                  >
                    {busy === 'assignment-file' ? 'טוען...' : '📎 העלה קובץ משימה'}
                  </button>
                </div>
                <p className="mt-2 text-sm leading-7 text-slate-600">הדבק את הוראות העבודה כפי שקיבלת אותן — או העלה קובץ משימה (Word, PDF, txt או html) והטקסט ייטען לכאן. ה-AI יפרק אותן לניתוחים הנדרשים ולסוג התוצר.</p>
                <textarea
                  className="mt-4 min-h-[200px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100/70"
                  placeholder="למשל: בדקו האם יש הבדל בשביעות הרצון בין גברים לנשים, ובדקו קשר בין ותק לשכר. דווחו ממצאים בפרק ממצאים מסודר."
                  value={assignmentText}
                  onChange={(event) => setAssignmentText(event.target.value)}
                />

                {/* הנחיה חופשית לפני הניתוח — כפתור ייעודי חושף כתיבה חופשית שמוזרמת
                    לבניית תוכנית הניתוח (לפני שלב הקוד). */}
                {!showGuidanceBox ? (
                  <button
                    type="button"
                    className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-white px-4 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
                    onClick={() => setShowGuidanceBox(true)}
                  >
                    ➕ {analysisGuidance.trim() ? 'ערוך הנחיה חופשית לניתוח (מוגדרת)' : 'הוסף הנחיה חופשית לניתוח'}
                  </button>
                ) : (
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-sm font-bold text-slate-800">הנחיה חופשית לניתוח <span className="font-normal text-slate-500">(אופציונלי)</span></div>
                    <p className="mt-1 text-xs leading-6 text-slate-500">משהו שתרצה שה-AI ייקח בחשבון כשהוא בונה את תוכנית הניתוח — עוד לפני יצירת הקוד. למשל: "המשתנה התלוי הוא שביעות רצון", "אל תוסיף רגרסיה", "התייחס לגיל כמשתנה קטגוריאלי".</p>
                    <textarea
                      className="mt-2 min-h-[64px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100/70"
                      placeholder="כתוב כאן הנחיות חופשיות שיכוונו את תוכנית הניתוח..."
                      value={analysisGuidance}
                      onChange={(event) => setAnalysisGuidance(event.target.value)}
                      disabled={busy === 'analyze'}
                      autoFocus
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 transition hover:text-slate-700"
                        onClick={() => setShowGuidanceBox(false)}
                      >
                        סגור
                      </button>
                      {analysisGuidance.trim() && (
                        <button
                          type="button"
                          className="rounded-xl px-3 py-2 text-xs font-semibold text-rose-500 transition hover:text-rose-700"
                          onClick={() => { setAnalysisGuidance(''); setShowGuidanceBox(false); }}
                        >
                          נקה הנחיה
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  className={`mt-4 w-full rounded-2xl px-5 py-3 text-sm font-semibold text-white transition ${busy === 'analyze' ? 'cursor-wait bg-slate-300' : 'bg-[#0066cc] hover:bg-blue-700'}`}
                  onClick={onAnalyzeAssignment}
                  disabled={busy === 'analyze' || !analysis || !assignmentText.trim()}
                >
                  {busy === 'analyze' ? 'מנתח...' : 'נתח משימה →'}
                </button>
              </section>

              <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-6 shadow-sm lg:col-span-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-lg font-bold text-slate-900">3. טיוטה קיימת <span className="text-sm font-normal text-slate-500">(אופציונלי)</span></div>
                    <p className="mt-2 text-sm leading-7 text-slate-600">יש כבר טיוטה? העלה אותה כדי שפרק הממצאים ישתלב בסגנון ובמינוח שלה — וייווצר כמסמך אחד שלם, לא פרק נפרד.</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className={`rounded-2xl px-5 py-3 text-sm font-semibold text-white transition ${busy === 'draft' ? 'cursor-wait bg-slate-300' : 'bg-[#0066cc] hover:bg-blue-700'}`}
                      onClick={onSelectDraft}
                      disabled={busy === 'draft'}
                    >
                      {busy === 'draft' ? 'טוען...' : (draft ? 'החלף טיוטה' : 'העלה טיוטה')}
                    </button>
                    {draft && (
                      <button
                        type="button"
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300"
                        onClick={clearDraft}
                      >
                        הסר
                      </button>
                    )}
                  </div>
                </div>
                {draft && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700" title={draft.name}>📄 {draft.name}</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600">פרק הממצאים ימוזג לתוך הטיוטה</span>
                  </div>
                )}
              </section>
            </div>
            </>
          )}

          {/* SHORTCUT — quick output interpretation (no assignment/data needed) */}
          {stage === 'quick-interpret' && (
            <div className="space-y-5">
              <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-lg font-bold text-slate-900">פירוש פלט SPSS — מהיר</div>
                    <p className="mt-1 text-sm leading-7 text-slate-600">הדבק או העלה פלט מ-SPSS וקבל הסבר בעברית בסגנון APA — בלי מטלה או נתונים. נתמכים: Excel, Word, PDF, HTML, csv, txt, קובץ SPSS Output‏ (.spv) ותמונות גרפים (png/jpg — נקראות עם מודל ראייה). אפשר גם להעלות קובץ נתונים להקשר טוב יותר — לא חובה.</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className={`rounded-2xl border px-4 py-2 text-xs font-semibold transition ${busy === 'upload' ? 'cursor-wait border-slate-200 bg-slate-100 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'}`}
                      onClick={openFilePicker}
                      disabled={busy === 'upload'}
                    >
                      {busy === 'upload' ? 'טוען...' : (analysis ? 'החלף נתונים' : '+ נתונים (אופציונלי)')}
                    </button>
                    <button
                      type="button"
                      className={`rounded-2xl border px-4 py-2 text-xs font-semibold transition ${busy === 'output-file' ? 'cursor-wait border-slate-200 bg-slate-100 text-slate-400' : 'border-[#1F6FEB]/30 bg-[#1F6FEB]/5 text-[#1F6FEB] hover:bg-[#1F6FEB]/10'}`}
                      onClick={onSelectOutputFile}
                      disabled={busy === 'output-file'}
                    >
                      {busy === 'output-file' ? 'טוען...' : '📎 העלה קובץ פלט'}
                    </button>
                    <button
                      type="button"
                      className={`rounded-2xl border px-4 py-2 text-xs font-semibold transition ${busy === 'chart-image' ? 'cursor-wait border-slate-200 bg-slate-100 text-slate-400' : 'border-[#1F6FEB]/30 bg-[#1F6FEB]/5 text-[#1F6FEB] hover:bg-[#1F6FEB]/10'}`}
                      onClick={() => { if (chartImageInputRef.current) { chartImageInputRef.current.value = ''; chartImageInputRef.current.click(); } }}
                      disabled={busy === 'chart-image'}
                    >
                      {busy === 'chart-image' ? 'קורא גרפים...' : '📊 העלה גרף (תמונה)'}
                    </button>
                    <button
                      type="button"
                      className={`rounded-2xl border px-4 py-2 text-xs font-semibold transition ${busy === 'chart-image' ? 'cursor-wait border-slate-200 bg-slate-100 text-slate-400' : 'border-[#1F6FEB]/30 bg-[#1F6FEB]/5 text-[#1F6FEB] hover:bg-[#1F6FEB]/10'}`}
                      onClick={() => { if (chartFolderInputRef.current) { chartFolderInputRef.current.value = ''; chartFolderInputRef.current.click(); } }}
                      disabled={busy === 'chart-image'}
                    >
                      {busy === 'chart-image' ? 'קורא גרפים...' : '📁 העלה תיקיית גרפים'}
                    </button>
                  </div>
                </div>
                {analysis && (
                  <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{analysis.fileName || 'קובץ'}</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{analysis.columnCount} עמודות</span>
                  </div>
                )}
                <textarea
                  className="mt-4 min-h-[300px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-[12px] leading-6 text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100/70"
                  placeholder="הדבק כאן את הפלט מ-SPSS (טבלה אחת או כמה: Group Statistics, Independent Samples Test, Correlations, ANOVA וכו')."
                  value={output}
                  onChange={(event) => setOutput(event.target.value)}
                />
                <div className="mt-4 flex flex-wrap gap-3">
                  <button type="button" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300" onClick={() => setStage('understand')}>← חזרה</button>
                  <button
                    type="button"
                    className={`rounded-2xl px-5 py-2.5 text-sm font-semibold text-white transition ${busy === 'interpret' ? 'cursor-wait bg-slate-300' : 'bg-[#0066cc] hover:bg-blue-700'}`}
                    onClick={onInterpret}
                    disabled={busy === 'interpret' || !output.trim()}
                  >
                    {busy === 'interpret' ? 'מפרש...' : (interpretations.length ? 'פרש מחדש' : 'פרש את הפלט')}
                  </button>
                </div>
              </section>

              {interpretations.length > 0 && (
                <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-6 shadow-sm">
                  <div className="text-lg font-bold text-slate-900">הפירוש</div>
                  <div className="mt-4 space-y-3">
                    {interpretations.map((entry) => (
                      <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-800 whitespace-pre-wrap">{entry.answer}</div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* STAGE 2 — code */}
          {stage === 'code' && profile && (
            <div className="space-y-5">
              <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-bold text-slate-900">תוכנית הניתוח</div>
                    <p className="mt-1 text-sm text-slate-600">{profile.summary || 'לפי המטלה שסיפקת.'}</p>
                    <div className="mt-2 inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">תוצר נדרש: {DELIVERABLE_LABELS[profile.deliverable]}</div>
                    {planRevisionNote && (
                      <div className="mt-2 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">התוכנית עודכנה: {planRevisionNote}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    className={`rounded-2xl px-5 py-3 text-sm font-semibold text-white transition ${busy === 'code' ? 'cursor-wait bg-slate-300' : 'bg-[#0066cc] hover:bg-blue-700'}`}
                    onClick={onGenerateAllCode}
                    disabled={busy === 'code'}
                  >
                    {busy === 'code' ? 'מייצר...' : (blocks.length ? 'ייצר מחדש' : 'ייצר את כל הקוד')}
                  </button>
                </div>
                <div className="mt-4 grid gap-3">
                  {profile.analyses.map((item, index) => (
                    <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-600">{index + 1}</span>
                        <span className="font-semibold text-slate-800">{item.label}</span>
                        {item.method && <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">{item.method}</span>}
                        {item.variables.map((name) => (
                          <span key={`${item.id}-${name}`} className="rounded-full bg-white px-2.5 py-0.5 text-[11px] text-slate-500">{name}</span>
                        ))}
                      </div>
                      {item.rationale && <div className="mt-2 text-xs leading-6 text-slate-500">{item.rationale}</div>}
                    </div>
                  ))}
                </div>
                {profile.notes && (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-800">{profile.notes}</div>
                )}
                {methodologyBlock && (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-7 text-amber-800">
                    <div>{methodologyBlock.message}</div>
                    <div className="mt-1 text-xs text-amber-700">אפשר לעקוף אם אתה בטוח שהבדיקה שגויה.</div>
                    <button
                      type="button"
                      className={`mt-3 rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 ${busy === 'code' ? 'cursor-wait opacity-60' : ''}`}
                      disabled={busy === 'code'}
                      onClick={() => {
                        methodologyOverrideRef.current = true;
                        setMethodologyBlock(null);
                        onGenerateAllCode();
                      }}
                    >
                      המשך בכל זאת (דלג על הבדיקה המתודולוגית)
                    </button>
                  </div>
                )}
                {renderConsultBox()}
                {renderPlanChangeBox('רוצה לשנות משהו בתוכנית?')}
              </section>

              {blocks.length > 0 && (
                <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-6 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-lg font-bold text-slate-900">Master syntax</div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700" onClick={onCopySyntax}>העתק</button>
                      <button type="button" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700" onClick={onDownloadSyntax}>הורד .sps</button>
                    </div>
                  </div>
                  {reviewNotes.length > 0 && (
                    <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
                      <div className="text-sm font-semibold text-sky-800">✓ בדיקה מקדימה תיקנה את הקוד לפני הרצה ({reviewNotes.length}):</div>
                      <ul className="mt-2 list-disc space-y-1 pr-5 text-xs leading-6 text-sky-700">
                        {reviewNotes.map((note, index) => (<li key={index}>{note}</li>))}
                      </ul>
                    </div>
                  )}
                  {graphNotes.length > 0 && (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-sm font-semibold text-slate-700">ℹ️ הושלמו אוטומטית פקודות גרף עבור: {graphNotes.join(', ')}.</div>
                    </div>
                  )}
                  {coverageGaps.length > 0 && (
                    <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                      <div className="text-sm font-semibold text-rose-800">⚠️ ניתוחים מהתוכנית שלא נמצאו בקוד:</div>
                      <ul className="mt-2 list-disc space-y-1 pr-5 text-xs leading-6 text-rose-700">
                        {coverageGaps.map((gap, index) => (
                          <li key={index}>{gap.label}{gap.variables?.length ? ` (${gap.variables.join(', ')})` : ''}</li>
                        ))}
                      </ul>
                      <div className="mt-2 text-xs leading-6 text-rose-700">שקול לייצר מחדש את הקוד או להשלים ידנית לפני ההרצה ב-SPSS.</div>
                    </div>
                  )}
                  <textarea
                    readOnly
                    value={masterSyntax}
                    className="mt-4 min-h-[320px] w-full rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 font-mono text-[13px] leading-6 text-slate-100 outline-none"
                  />
                  <button
                    type="button"
                    className="mt-4 w-full rounded-2xl bg-[#0066cc] px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                    onClick={() => { setStage('output'); setNotice({ tone: 'info', text: 'הרץ את הסינטקס ב-SPSS, ואז הדבק כאן את הפלט.' }); }}
                  >
                    הרצתי ב-SPSS · המשך להדבקת פלט →
                  </button>
                </section>
              )}
            </div>
          )}

          {/* STAGE 3 — output */}
          {stage === 'output' && (
            <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="text-lg font-bold text-slate-900">הדבקת פלט מ-SPSS</div>
                <div className="flex flex-wrap gap-2">
                  {output.trim() && (
                    <button
                      type="button"
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-rose-200 hover:text-rose-600"
                      onClick={() => { setOutput(''); setCritique(null); setNotice({ tone: 'info', text: 'הפלט נוקה. הדבק את הפלט החדש מההרצה המעודכנת.' }); }}
                    >
                      נקה פלט
                    </button>
                  )}
                  <button
                    type="button"
                    className={`rounded-2xl border px-4 py-2 text-xs font-semibold transition ${busy === 'output-file' ? 'cursor-wait border-slate-200 bg-slate-100 text-slate-400' : 'border-[#1F6FEB]/30 bg-[#1F6FEB]/5 text-[#1F6FEB] hover:bg-[#1F6FEB]/10'}`}
                    onClick={onSelectOutputFile}
                    disabled={busy === 'output-file'}
                  >
                    {busy === 'output-file' ? 'טוען...' : '📎 העלה קובץ פלט'}
                  </button>
                  <button
                    type="button"
                    className={`rounded-2xl border px-4 py-2 text-xs font-semibold transition ${busy === 'chart-image' ? 'cursor-wait border-slate-200 bg-slate-100 text-slate-400' : 'border-[#1F6FEB]/30 bg-[#1F6FEB]/5 text-[#1F6FEB] hover:bg-[#1F6FEB]/10'}`}
                    onClick={() => { if (chartImageInputRef.current) { chartImageInputRef.current.value = ''; chartImageInputRef.current.click(); } }}
                    disabled={busy === 'chart-image'}
                  >
                    {busy === 'chart-image' ? 'קורא גרפים...' : '📊 העלה גרף (תמונה)'}
                  </button>
                  <button
                    type="button"
                    className={`rounded-2xl border px-4 py-2 text-xs font-semibold transition ${busy === 'chart-image' ? 'cursor-wait border-slate-200 bg-slate-100 text-slate-400' : 'border-[#1F6FEB]/30 bg-[#1F6FEB]/5 text-[#1F6FEB] hover:bg-[#1F6FEB]/10'}`}
                    onClick={() => { if (chartFolderInputRef.current) { chartFolderInputRef.current.value = ''; chartFolderInputRef.current.click(); } }}
                    disabled={busy === 'chart-image'}
                  >
                    {busy === 'chart-image' ? 'קורא גרפים...' : '📁 העלה תיקיית גרפים'}
                  </button>
                </div>
              </div>
              <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
                💡 הדרך הקלה — קובץ אחד עם הכל: ב-SPSS, בחלון ה-Output, בחר File ← Export, ב-Type בחר <b>PDF (מומלץ)</b> או Word (docx*.), וייצא. העלה את הקובץ כאן — הטבלאות והגרפים ייקראו אוטומטית, בלי להעתיק כל גרף בנפרד.
                <br />
                לחלופין: ייצא עם Type: None (Graphics only) והעלה את תיקיית התמונות בכפתור "העלה תיקיית גרפים".
              </div>
              <p className="mt-2 text-sm leading-7 text-slate-600">הרץ את ה-master syntax ב-SPSS, סמן את טבלאות ה-Output הרלוונטיות והדבק כאן — או העלה קובץ פלט וה-Output ייטען לכאן. נתמכים: Excel‏ (xlsx), Word‏ (docx), PDF, HTML, csv, txt, קובץ SPSS Output‏ (.spv) ותמונות גרפים (png/jpg). 💡 לתוצאה הנקייה ביותר, ב-SPSS: File → Export → Excel‏/HTML. אפשר להדביק/לטעון כמה טבלאות יחד.</p>
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-800">📊 יש בתוכנית גרפים? גרף ב-SPSS הוא תמונה, ולכן הוא לא נכנס לטקסט שמדביקים כאן. ייצא כל גרף מ-SPSS כתמונה (קליק ימני על הגרף → Export → PNG) ולחץ "📊 העלה גרף (תמונה)", או פשוט הדבק (Ctrl+V) את תמונת הגרף ישירות לתיבת הפלט למטה — הגרף ייקרא על ידי מודל ראייה והתיאור שלו יצטרף לפלט. בהעלאת קובץ ‎.spv הגרפים שבפנים נקראים אוטומטית. את התמונה עצמה הדבק גם לתוצר בעורך.</div>
              <textarea
                className="mt-4 min-h-[320px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-[12px] leading-6 text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100/70"
                placeholder="הדבק כאן את הפלט (Independent Samples Test, Correlations, ANOVA וכו')."
                value={output}
                onChange={(event) => setOutput(event.target.value)}
                onPaste={onOutputPaste}
              />
              {outputErrors.hasFatal && (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4">
                  <div className="text-sm font-bold text-rose-700">⚠ זוהו {outputErrors.fatal.length} שגיאות SPSS בפלט (Error #{outputErrors.fatal.map((entry) => entry.number).join(', #')})</div>
                  <div className="mt-1 text-xs leading-6 text-rose-600">שגיאה פטאלית = הפקודה לא רצה, כך שהתוצאות אינן אמינות. תקן את הקוד לפי השגיאה, הרץ מחדש, ורק אז בדוק מול המטלה — מהיר יותר מבדיקה כללית.</div>
                  <button
                    type="button"
                    className={`mt-3 w-full rounded-2xl px-5 py-3 text-sm font-bold text-white transition ${busy === 'repair' ? 'cursor-wait bg-slate-300' : 'bg-rose-600 hover:bg-rose-700'}`}
                    onClick={onRepairFromError}
                    disabled={Boolean(busy)}
                  >
                    {busy === 'repair' ? 'מתקן קוד...' : '🛠 תקן את הקוד לפי שגיאת ה-SPSS'}
                  </button>
                </div>
              )}
              {!blocks.length && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <p className="mb-2">עדיין לא נוצר קוד — חזור לשלב הקוד וצור master syntax קודם.</p>
                  <button
                    type="button"
                    className="rounded-2xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300"
                    onClick={() => setStage('code')}
                  >
                    → לשלב הקוד
                  </button>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300" onClick={() => setStage('code')}>← חזרה לקוד</button>
                <button
                  type="button"
                  className={`rounded-2xl px-5 py-2.5 text-sm font-semibold text-white transition ${busy === 'critique' ? 'cursor-wait bg-slate-300' : 'bg-[#0066cc] hover:bg-blue-700'}`}
                  onClick={() => onCritique()}
                  disabled={busy === 'critique' || !output.trim() || !blocks.length}
                >
                  {busy === 'critique' ? 'בודק...' : 'בדוק מול המטלה →'}
                </button>
              </div>
            </section>
          )}

          {/* STAGE 4 — refine */}
          {stage === 'refine' && (
            <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-lg font-bold text-slate-900">מקצה שיפורים</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`rounded-2xl border px-4 py-2 text-xs font-semibold transition ${busy === 'chart-image' ? 'cursor-wait border-slate-200 bg-slate-100 text-slate-400' : 'border-[#1F6FEB]/30 bg-[#1F6FEB]/5 text-[#1F6FEB] hover:bg-[#1F6FEB]/10'}`}
                    onClick={() => { if (chartImageInputRef.current) { chartImageInputRef.current.value = ''; chartImageInputRef.current.click(); } }}
                    disabled={busy === 'chart-image'}
                  >
                    {busy === 'chart-image' ? 'קורא גרפים...' : '📊 העלה גרף (תמונה)'}
                  </button>
                  <button
                    type="button"
                    className={`rounded-2xl border px-4 py-2 text-xs font-semibold transition ${busy === 'chart-image' ? 'cursor-wait border-slate-200 bg-slate-100 text-slate-400' : 'border-[#1F6FEB]/30 bg-[#1F6FEB]/5 text-[#1F6FEB] hover:bg-[#1F6FEB]/10'}`}
                    onClick={() => { if (chartFolderInputRef.current) { chartFolderInputRef.current.value = ''; chartFolderInputRef.current.click(); } }}
                    disabled={busy === 'chart-image'}
                  >
                    {busy === 'chart-image' ? 'קורא גרפים...' : '📁 העלה תיקיית גרפים'}
                  </button>
                </div>
              </div>
              {outputErrors.hasFatal && (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4">
                  <div className="text-sm font-bold text-rose-700">⚠ הפלט מכיל {outputErrors.fatal.length} שגיאות SPSS (Error #{outputErrors.fatal.map((entry) => entry.number).join(', #')}) — ההרצה נכשלה</div>
                  <div className="mt-1 text-xs leading-6 text-rose-600">תקן את הקוד לפי השגיאה והרץ מחדש לפני שממשיכים. זה מדויק יותר מבדיקה כללית מול המטלה.</div>
                  <button
                    type="button"
                    className={`mt-3 w-full rounded-2xl px-5 py-3 text-sm font-bold text-white transition ${busy === 'repair' ? 'cursor-wait bg-slate-300' : 'bg-rose-600 hover:bg-rose-700'}`}
                    onClick={onRepairFromError}
                    disabled={Boolean(busy)}
                  >
                    {busy === 'repair' ? 'מתקן קוד...' : '🛠 תקן את הקוד לפי שגיאת ה-SPSS'}
                  </button>
                </div>
              )}
              {busy === 'critique' && <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">בודק את הפלט מול המטלה...</div>}
              {!critique && !output.trim() && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <p className="mb-2">הדבק את הפלט מ-SPSS בשלב הקודם ואז לחץ 'בדוק מול המטלה'.</p>
                  <button
                    type="button"
                    className="rounded-2xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300"
                    onClick={() => setStage('output')}
                  >
                    ← חזור להדבקת פלט
                  </button>
                </div>
              )}
              {critique && critique.verdict === 'clean' && (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-7 text-emerald-800">
                  {critique.summary || 'ההרצה עונה על המטלה. אין צורך בתיקונים.'}
                </div>
              )}
              {critique && critique.verdict === 'needs-fixes' && (
                <div className="mt-4 space-y-3">
                  {critique.summary && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-7 text-amber-800">{critique.summary}</div>}

                  {repeatedIssues && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-800">
                      <strong>אותן נקודות עלו שוב אחרי התיקון הקודם</strong> — "תקן הכל" נוסף כנראה לא יעזור. ודא שהרצת ב-SPSS את כל הקוד המעודכן (Run → All) והדבקת את הפלט החדש במלואו — או פתור מהשורש בשינוי התוכנית:
                      <button
                        type="button"
                        className="mr-2 mt-2 rounded-full border border-rose-300 bg-white px-3 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                        onClick={() => {
                          setShowPlanChange(true);
                          setChangeRequestText(`הנקודות הבאות חוזרות גם אחרי "תקן הכל": ${(critique?.issues || []).map((issue) => issue.label || issue.problem).filter(Boolean).slice(0, 4).join('; ')}. שנה את התוכנית בגישה שונה שתפתור אותן מהשורש.`);
                        }}
                      >
                        עבור לשינוי תוכנית
                      </button>
                    </div>
                  )}

                  {/* One-click: merge the existing code with every issue into one updated master syntax. */}
                  <button
                    type="button"
                    className={`w-full rounded-2xl px-5 py-3.5 text-sm font-bold transition ${busy === 'fix-all' ? 'cursor-wait bg-slate-300 text-white' : repeatedIssues ? 'border border-slate-300 bg-white text-slate-600 hover:border-slate-400' : 'bg-[#0066cc] text-white hover:bg-blue-700'}`}
                    onClick={onApplyAllFixes}
                    disabled={Boolean(busy)}
                  >
                    {busy === 'fix-all' ? 'מאחד קוד מעודכן...' : `🔧 תקן הכל — צור קוד מעודכן (${critique.issues.length})`}
                  </button>
                  <div className="text-center text-xs text-slate-500">מאחד את הקוד הקיים עם כל התיקונים לקוד אחד מעודכן. או תקן נקודה־נקודה למטה.</div>

                  {critique.issues.map((issue, index) => (
                    <div key={`${issue.label}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold text-slate-800">{issue.label || `נקודה ${index + 1}`}</div>
                        {issue.severity && <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500">{issue.severity}</span>}
                      </div>
                      <div className="mt-1 text-sm leading-6 text-slate-600">{issue.problem}</div>
                      {issue.explanation && <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-800"><b>למה זה חשוב:</b> {issue.explanation}</div>}
                      {issue.rerunInstruction && <div className="mt-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-6 text-blue-800"><b>אחרי התיקון:</b> {issue.rerunInstruction}</div>}
                      {issue.fixRequest && <div className="mt-2 text-xs leading-6 text-slate-500">תיקון מוצע: {issue.fixRequest}</div>}
                      {issue.fixRequest && (
                        <button
                          type="button"
                          className={`mt-3 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold transition ${busy === `fix-${issue.fixRequest}` ? 'cursor-wait bg-slate-100 text-slate-400' : 'bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700'}`}
                          onClick={() => onApplyFix(issue)}
                          disabled={Boolean(busy)}
                        >
                          {busy === `fix-${issue.fixRequest}` ? 'מתקן...' : 'תקן נקודה זו בלבד'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {profile && renderPlanChangeBox('רוצה לשנות את התוכנית עצמה? (החלפת משתנה, הסרת ניתוח...)')}

              {/* Updated master syntax — visible right here so the user never has to go back to the code stage. */}
              {blocks.length > 0 && (
                <section className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-bold text-slate-900">קוד מעודכן (Master syntax)</div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700" onClick={onCopySyntax}>העתק</button>
                      <button type="button" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700" onClick={onDownloadSyntax}>הורד .sps</button>
                    </div>
                  </div>
                  <textarea
                    readOnly
                    value={masterSyntax}
                    className="mt-3 min-h-[240px] w-full rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 font-mono text-[13px] leading-6 text-slate-100 outline-none"
                  />
                </section>
              )}

              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300" onClick={() => setStage('output')}>← עדכן פלט</button>
                {critique && (
                  <button
                    type="button"
                    className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${busy === 'critique' ? 'cursor-wait border-slate-200 bg-slate-100 text-slate-400' : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
                    onClick={() => onCritique()}
                    disabled={Boolean(busy) || !output.trim()}
                  >
                    {busy === 'critique' ? 'בודק...' : 'בדוק שוב מול הפלט'}
                  </button>
                )}
                <button
                  type="button"
                  className="rounded-2xl bg-[#0066cc] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                  onClick={() => { setStage('explain'); setNotice({ tone: 'info', text: 'הפק פירוש והרכב את התוצר הסופי.' }); }}
                >
                  המשך להסברים ולתוצר →
                </button>
              </div>
            </section>
          )}
          {/* המלצת מרצה זמינה כבר במקצה השיפורים — כאן "הוסף לקוד" הכי שימושי,
              כשעדיין עובדים על ה-syntax מול הפלט. */}
          {stage === 'refine' && renderLecturerPanel()}

          {/* STAGE 5 — explain + deliverable */}
          {stage === 'explain' && (
            <div className="space-y-5">
              {!output.trim() && (
                <section className="rounded-[28px] border border-slate-200 bg-slate-50 px-6 py-6 shadow-sm">
                  <div className="text-sm text-slate-600">
                    <p className="mb-2">חסר הפלט מ-SPSS — חזור לשלב "הדבקת פלט" והדבק את התוצאות מההרצה.</p>
                    <button
                      type="button"
                      className="rounded-2xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300"
                      onClick={() => setStage('output')}
                    >
                      ← לשלב הדבקת פלט
                    </button>
                  </div>
                </section>
              )}

              <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-lg font-bold text-slate-900"><StageBadge n={1} /> פירוש הפלט</div>
                  <button
                    type="button"
                    className={`rounded-2xl px-5 py-2.5 text-sm font-semibold text-white transition ${busy === 'interpret' ? 'cursor-wait bg-slate-300' : 'bg-[#0066cc] hover:bg-blue-700'}`}
                    onClick={onInterpret}
                    disabled={busy === 'interpret' || !output.trim()}
                  >
                    {busy === 'interpret' ? 'מפרש...' : (interpretations.length ? 'פרש מחדש' : 'פרש את הפלט')}
                  </button>
                </div>
                {interpretations.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {interpretations.map((entry) => (
                      <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-800 whitespace-pre-wrap">{entry.answer}</div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">לחץ "פרש את הפלט" כדי לקבל הסבר בעברית בסגנון APA.</div>
                )}
              </section>

              <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-6 shadow-sm">
                <div className="flex items-center gap-2 text-lg font-bold text-slate-900"><StageBadge n={2} /> התוצר הסופי</div>
                <p className="mt-1 text-sm text-slate-600">תוצר מומלץ לפי המטלה: <span className="font-semibold text-blue-700">{DELIVERABLE_LABELS[profile?.deliverable || 'findings-chapter']}</span></p>
                {interpretations.length === 0 && (
                  <div className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs leading-6 text-blue-700">מומלץ קודם "פרש את הפלט" — הפרק ישתמש בפירושים לניסוח מדויק יותר.</div>
                )}
                {draft ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700" title={draft.name}>נבנה על בסיס הטיוטה: {draft.name}</span>
                    <button type="button" className="text-xs font-semibold text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline" onClick={clearDraft}>הסר</button>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600">אין טיוטה מצורפת — הפרק ייווצר עצמאית.</span>
                    <button type="button" className="text-xs font-semibold text-blue-700 underline-offset-2 hover:underline" onClick={onSelectDraft} disabled={busy === 'draft'}>{busy === 'draft' ? 'טוען...' : 'צרף טיוטה'}</button>
                  </div>
                )}
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <button
                    type="button"
                    className={`rounded-2xl px-4 py-4 text-sm font-semibold text-white transition ${busy === 'chapter' ? 'cursor-wait bg-slate-300' : 'bg-[#0066cc] hover:bg-blue-700'}`}
                    onClick={onBuildChapter}
                    disabled={busy === 'chapter' || !output.trim()}
                  >
                    {busy === 'chapter' ? 'מרכיב...' : 'צור מסמך פרק ממצאים'}
                  </button>
                  <button type="button" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700" onClick={onDownloadSyntax}>הורד קובץ .sps</button>
                  <button type="button" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700" onClick={onCopySyntax}>העתק syntax</button>
                </div>
                <button
                  type="button"
                  className={`mt-3 w-full rounded-2xl px-4 py-4 text-sm font-semibold text-white transition ${busy === 'submission' ? 'cursor-wait bg-slate-300' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                  onClick={onBuildSubmissionWork}
                  disabled={busy === 'submission' || !output.trim()}
                >
                  {busy === 'submission' ? 'בונה עבודה מלאה...' : '🎓 הכן עבודה מוכנה להגשה'}
                </button>
                <div className="mt-1 text-xs leading-6 text-slate-500">בונה מחדש את כל העבודה על בסיס הטיוטה — לפי הפרקים שהמטלה דורשת — ומחליף את המסמך בעורך.</div>
                <label className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 cursor-pointer">
                  <input type="checkbox" checked={attachAiAppendix} onChange={(e) => setAttachAiAppendix(e.target.checked)} className="h-4 w-4 accent-amber-500" />
                  📎 צרף נספח AI (תיעוד שימוש + הדרכה) לסוף התוצר — כרוך בקריאת API נוספת
                </label>
                <div className="mt-3 text-xs leading-6 text-slate-500">לחיצה אחת מריצה הכל: פירוש הפלט וסקירת ספרות (אם עוד לא הופקו) ואז הרכבת הפרק — והעורך נפתח עם התוצר המוכן.</div>
                {chapterTruncated && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-6 text-amber-800">⚠️ הפרק ארוך ונקטע למרות ניסיונות השלמה — נסה שוב או פצל את הבקשה.</div>
                )}
              </section>

              {/* Literature review + reference list (sections א+ד) */}
              <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-lg font-bold text-slate-900"><StageBadge n={3} /> סקירת ספרות ומקורות</div>
                    <p className="mt-1 text-sm text-slate-600">מאתר מקורות אקדמיים אמיתיים ומאומתים לנושא המחקר וכותב סקירה קצרה מבוססת עליהם — בלי מקורות מומצאים.</p>
                  </div>
                  <button
                    type="button"
                    className={`rounded-2xl px-5 py-2.5 text-sm font-semibold text-white transition ${busy === 'litreview' ? 'cursor-wait bg-slate-300' : 'bg-[#0066cc] hover:bg-blue-700'}`}
                    onClick={onBuildLitReview}
                    disabled={busy === 'litreview'}
                  >
                    {busy === 'litreview' ? 'מאתר מקורות...' : (litReview ? 'אתר מחדש' : 'אתר מקורות וכתוב סקירה')}
                  </button>
                </div>
                {litReview ? (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-800 whitespace-pre-wrap">{litReviewText}</div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700" onClick={() => copyToClipboard(litReviewText, 'סקירת הספרות והמקורות הועתקו.')}>העתק</button>
                      {typeof onEmitDocument === 'function' && (
                        <button type="button" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700" onClick={() => onAddSectionToDoc(`<h2>סקירת ספרות</h2>\n${textToHtmlParagraphs(litReview.review)}\n<h2>רשימת מקורות</h2>\n<ol>${(litReview.references || []).map((ref) => `<li>${escapeHtml(ref)}</li>`).join('')}</ol>`, 'סקירת ספרות ומקורות')}>הוסף לתוצר</button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    {scholarConfigured
                      ? 'Scholar מוגדר ✓ — לחץ "אתר מקורות וכתוב סקירה" לאיתור מקורות אקדמיים.'
                      : 'דורש SerpAPI (Google Scholar) מוגדר בהגדרות כדי לשלוף מאמרים אקדמיים אמיתיים.'}
                  </div>
                )}
              </section>

              {/* Optional lecturer-advice panel (שלב D) — מוצג גם במקצה השיפורים */}
              {renderLecturerPanel(4)}

              {/* AI-usage appendix (section ה) */}
              <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-6 shadow-sm">
                <div className="flex items-center gap-2 text-lg font-bold text-slate-900"><StageBadge n={5} /> נספח שימוש בבינה מלאכותית</div>
                <p className="mt-1 text-sm text-slate-600">נדרש במטלה (סעיף ה'). נבנה אוטומטית מכל קריאת AI שבוצעה כאן: איזה מודל, לאיזו מטרה, ועם איזה קלט.</p>
                {appendixText ? (
                  <div className="mt-4 space-y-3">
                    <div className="max-h-[320px] overflow-auto rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-800 whitespace-pre-wrap">{appendixText}</div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700" onClick={() => copyToClipboard(appendixText, 'נספח הבינה המלאכותית הועתק.')}>העתק נספח</button>
                      <button type="button" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700" onClick={() => downloadTextFile(appendixText, `${buildSafeFileStem(analysis?.fileName || 'wordflow')}-ai-appendix.txt`).then(() => setNotice({ tone: 'success', text: 'הנספח הורד.' })).catch(() => setNotice({ tone: 'error', text: 'ההורדה נכשלה.' }))}>הורד .txt</button>
                      {typeof onEmitDocument === 'function' && (
                        <button type="button" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700" onClick={() => onAddSectionToDoc(textToHtmlParagraphs(appendixText), 'נספח בינה מלאכותית')}>הוסף לתוצר</button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">הנספח יתמלא אוטומטית ככל שתשתמש בשלבים (ניתוח מטלה, יצירת קוד, בדיקה, פירוש).</div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

