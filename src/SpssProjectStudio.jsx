import React from 'react';
import { saveBlobInBrowser } from './services/browserDocxExport';
import { SUPPORTED_DATA_FILE_ACCEPT, readDataFileToAnalysis } from './services/spssDataIngest';
import { BROWSER_DOC_ACCEPT, BROWSER_OUTPUT_ACCEPT, pickDesktopDocument, readBrowserDocumentFile } from './services/documentUpload';
import {
  getSpssPreferences,
  saveSpssPreferences,
  getProviderConfig,
  getConfiguredProviderChoices,
  getProviderModelChoices,
  normalizeProviderModelName,
} from './services/aiService';
import {
  analyzeSpssAssignment,
  buildLiteratureReview,
  buildSpssFindingsChapter,
  collectDeclaredTargetNames,
  critiqueSpssRun,
  ensureGraphCoverage,
  generateSpssSyntax,
  interpretSpssOutput,
  parseSpssOutputErrors,
  repairSpssSyntaxFromError,
  reviewSpssMasterSyntax,
  validatePlanCoverage,
} from './services/spssSyntaxService';

const createLocalId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `spss-proj-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

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

// Methods that need data-prep mode (they write new variables back to the data).
const PREP_METHOD_PATTERN = /(reliability|cronbach|recode|compute|scale|index|reverse|dummy|missing|מהימנות|סולם|מדד|היפוך|recoding|דמ[יה]|חסר)/i;

const noticeToneClassMap = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  error: 'border-rose-200 bg-rose-50 text-rose-700',
  info: 'border-slate-200 bg-slate-50 text-slate-700',
};

// Run-order preamble. Derived variables (age_groups, attitude_index, voted_binary…)
// are created by COMPUTE/RECODE and live only in the active dataset in memory —
// they are NOT saved to the .sav. If the user runs only the analysis block, or
// reopens the data, those variables vanish and SPSS throws "undefined variable
// name". This banner tells them to always run the whole thing top-to-bottom.
const MASTER_SYNTAX_PREAMBLE = [
  '* ═══════════════════════════════════════════════════════════════════════.',
  '* חשוב: הרץ את כל הסינטקס יחד, מלמעלה למטה, על קובץ הנתונים המקורי (Run → All).',
  '* משתנים מחושבים (כמו age_groups / attitude_index) נוצרים בשלבי ההכנה ונשמרים רק בזיכרון.',
  '* אם תריץ רק חלק מהקוד, או תפתח מחדש את הנתונים — הם ייעלמו ותקבל "undefined variable name".',
  '* ═══════════════════════════════════════════════════════════════════════.',
].join('\n');

const buildMasterSyntax = (blocks = []) => {
  const body = blocks
    .map((block, index) => [
      `* --- ${index + 1}. ${String(block.title || 'SPSS block').replace(/\s+/g, ' ').trim()} ---.`,
      String(block.syntax || '').trim(),
    ].filter(Boolean).join('\n'))
    .join('\n\n')
    .trim();
  return body ? `${MASTER_SYNTAX_PREAMBLE}\n\n${body}` : '';
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

const buildLitReviewText = (litReview = null) => {
  if (!litReview) return '';
  const parts = [];
  if (litReview.review) parts.push(`סקירת ספרות\n\n${litReview.review}`);
  if (Array.isArray(litReview.references) && litReview.references.length) {
    parts.push(['רשימת מקורות', '', ...litReview.references.map((ref, index) => `${index + 1}. ${ref}`)].join('\n'));
  }
  return parts.join('\n\n');
};

const buildSafeFileStem = (value = 'wordflow-spss') => {
  const base = String(value || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
  return base || 'wordflow-spss';
};

const downloadTextFile = (content = '', fileName = 'wordflow-spss-syntax.sps') => {
  const blob = new Blob([String(content || '')], { type: 'text/plain;charset=utf-8' });
  return saveBlobInBrowser(blob, fileName);
};

export default function SpssProjectStudio({ onExit = () => {}, onEmitDocument = null }) {
  const fileInputRef = React.useRef(null);
  const draftInputRef = React.useRef(null);
  const assignmentInputRef = React.useRef(null);
  const outputInputRef = React.useRef(null);
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
  const [interpretations, setInterpretations] = React.useState([]);
  const [litReview, setLitReview] = React.useState(null);
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
    setAiLog([]);
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
  const onSelectOutputFile = React.useCallback(async () => {
    setBusy('output-file');
    try {
      const desktop = await pickDesktopDocument();
      if (desktop.canceled) return;
      if (desktop.unsupported) {
        outputInputRef.current?.click();
        return;
      }
      const text = String(desktop.doc.text || '').trim();
      if (!text) {
        setNotice({ tone: 'error', text: 'לא נמצא טקסט בקובץ הפלט.' });
        return;
      }
      setOutput((prev) => (prev.trim() ? `${prev.trim()}\n\n${text}` : text));
      setNotice({ tone: 'success', text: `נטען פלט מתוך ${desktop.doc.name}. אפשר לערוך לפני הבדיקה.` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'טעינת קובץ הפלט נכשלה.' });
    } finally {
      setBusy('');
    }
  }, []);

  const onOutputFileInputChange = React.useCallback(async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;
    setBusy('output-file');
    try {
      const next = await readBrowserDocumentFile(file);
      const text = String(next?.text || '').trim();
      if (!text) {
        setNotice({ tone: 'error', text: 'לא נמצא טקסט בקובץ הפלט.' });
        return;
      }
      setOutput((prev) => (prev.trim() ? `${prev.trim()}\n\n${text}` : text));
      setNotice({ tone: 'success', text: `נטען פלט מתוך ${next.name}. אפשר לערוך לפני הבדיקה.` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'טעינת קובץ הפלט נכשלה.' });
    } finally {
      setBusy('');
    }
  }, []);

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
      const result = await analyzeSpssAssignment({ assignmentText, analysis, draftText: draft?.text || '', providerOverride: spssRouteRef.current.providerId, modelOverride: spssRouteRef.current.model });
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
      setCoverageGaps([]);
      logAi({ stage: 'הבנת המשימה', description: 'ניתוח טקסט המטלה מול קובץ הנתונים וזיהוי הניתוחים הסטטיסטיים הנדרשים', prompt: assignmentText, providerId: result.providerId, model: result.model });
      setStage('code');
      setNotice({ tone: 'success', text: `זוהו ${result.profile.analyses.length} ניתוחים · תוצר נדרש: ${DELIVERABLE_LABELS[result.profile.deliverable]}.` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'ניתוח המטלה נכשל.' });
    } finally {
      setBusy('');
    }
  }, [analysis, assignmentText, draft, logAi]);

  // Stage 2 — generate the full master syntax in ONE holistic pass.
  // נתיב אחד: אותו מנוע כמו הטאב הרגיל. במקום בלוק מבודד לכל ניתוח (שהפיק קוד
  // דליל ונחסם לעיתים), שולחים בקשה הוליסטית אחת — טקסט המטלה + תוכנית הניתוחים —
  // ומקבלים master syntax עשיר ורציף, בדיוק כמו שהטאב הרגיל מפיק.
  const onGenerateAllCode = React.useCallback(async () => {
    if (!profile?.analyses?.length) return;
    setBusy('code');
    setNotice({ tone: 'info', text: 'מייצר syntax מלא לכל הניתוחים...' });
    try {
      const route = { providerOverride: spssRouteRef.current.providerId, modelOverride: spssRouteRef.current.model };

      // Prep-before-use ordering (age_group, dummy, index, MISSING VALUES declarations
      // must precede the analyses that consume them). The single holistic call sees the
      // whole plan, but we still present it prep-first so the ordering is explicit.
      const isPrepItem = (item) => PREP_METHOD_PATTERN.test(`${item?.method || ''} ${item?.label || ''}`);
      const orderedAnalyses = [
        ...profile.analyses.filter((item) => isPrepItem(item)),
        ...profile.analyses.filter((item) => !isPrepItem(item)),
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

      // סולם retry הוליסטי: ניסיון ראשון prep (עבודה מלאה כוללת הכנת נתונים); אם נחסם —
      // ניסיון שני עם דילוג על ה-guard המתודולוגי + בקשה מועשרת, עם סיבת החסימה כרמז.
      let result = await generateSpssSyntax({ analysis, request: combinedRequest, tutorMode: true, mode: 'prep', extraAllowedNames: [], ...route });
      let repaired = false;
      if (!result.ok || !result.syntax) {
        const enrichedRequest = `${combinedRequest}\n(ספק syntax מלא ושמיש; אל תחזיר ERROR אלא אם זה באמת בלתי אפשרי.)`;
        const retry = await generateSpssSyntax({
          analysis, request: enrichedRequest, tutorMode: true, mode: 'prep', extraAllowedNames: [],
          skipMethodologyGuard: true, repairHint: result.guidanceMessage, ...route,
        });
        if (retry.ok && retry.syntax) { result = retry; repaired = true; }
        else { result = retry || result; }
      }

      const genRoute = result?.providerId ? { providerId: result.providerId, model: result.model } : null;
      const succeeded = Boolean(result.ok && result.syntax);
      const nextBlocks = succeeded
        ? [{ id: createLocalId(), title: 'Master syntax', syntax: result.syntax, blocked: false }]
        : [{ id: createLocalId(), title: 'ניתוח מלא', syntax: `* ${result.guidanceMessage || 'הבקשה נעצרה לפני יצירת syntax.'}`, blocked: true }];
      setBlocks(nextBlocks);
      logAi({ stage: 'הבאת קוד', description: `יצירת master syntax הוליסטי לכל הניתוחים (${profile.analyses.length}): ${profile.analyses.map((a) => a.label).join(', ')}`, prompt: combinedRequest, providerId: genRoute?.providerId, model: genRoute?.model });

      // Pre-flight review — one holistic look at the master against the task + plan +
      // metadata, auto-applying only certain fixes (phantom var, prep order, missing
      // values) BEFORE the user runs SPSS. Non-destructive: replaces only when it changed.
      const repairedNote = repaired ? ' (שוקם בניסיון חוזר)' : '';
      let reviewNote = '';
      let trackedSyntax = buildMasterSyntax(nextBlocks);
      if (succeeded) {
        setNotice({ tone: 'info', text: 'בודק את הקוד לפני הרצה...' });
        try {
          const review = await reviewSpssMasterSyntax({ assignmentText, analysis, profile, masterSyntax: trackedSyntax, ...route });
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
          const graphResult = ensureGraphCoverage({ profile, analysis, masterSyntax: trackedSyntax });
          if (graphResult.changed && graphResult.syntax) {
            trackedSyntax = graphResult.syntax;
            setBlocks([{ id: createLocalId(), title: 'Master syntax (גרפים הושלמו אוטומטית)', syntax: graphResult.syntax, blocked: false }]);
          }
          setGraphNotes(graphResult.missing || []);
        } catch {
          setGraphNotes([]);
        }
        try {
          setCoverageGaps(validatePlanCoverage({ profile, analysis, masterSyntax: trackedSyntax }));
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
      setBusy('');
    }
  }, [profile, analysis, assignmentText, logAi]);

  // Stage 4 — critique the run against the task.
  const onCritique = React.useCallback(async () => {
    if (!output.trim()) {
      setNotice({ tone: 'error', text: 'הדבק את הפלט מ-SPSS לפני הבדיקה.' });
      return;
    }
    setBusy('critique');
    setStage('refine');
    setNotice({ tone: 'info', text: 'בודק את הפלט מול המטלה...' });
    try {
      const result = await critiqueSpssRun({ assignmentText, analysis, masterSyntax, output, providerOverride: spssRouteRef.current.providerId, modelOverride: spssRouteRef.current.model });
      if (!result.ok) {
        setCritique(null);
        setNotice({ tone: 'error', text: result.error || 'בדיקת הפלט נכשלה.' });
        return;
      }
      setCritique(result);
      logAi({ stage: 'מקצה שיפורים', description: 'בדיקת הפלט מ-SPSS מול דרישות המטלה וזיהוי נקודות לתיקון', prompt: 'בדוק את הפלט מול המטלה', providerId: result.providerId, model: result.model });
      setNotice(result.verdict === 'clean'
        ? { tone: 'success', text: 'ההרצה תקינה מול המטלה. אפשר להמשיך להסברים ולתוצר.' }
        : { tone: 'error', text: `נמצאו ${result.issues.length} נקודות לתיקון. תקן את הקוד או המשך בכל זאת.` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'בדיקת הפלט נכשלה.' });
    } finally {
      setBusy('');
    }
  }, [output, assignmentText, analysis, masterSyntax, logAi]);

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
  }, [analysis, blocks, logAi]);

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

  const onBuildChapter = React.useCallback(async () => {
    if (!output.trim()) {
      setNotice({ tone: 'error', text: 'אין פלט להרכבת פרק ממצאים.' });
      return;
    }
    setBusy('chapter');
    setNotice({ tone: 'info', text: 'מרכיב פרק ממצאים...' });
    try {
      const result = await buildSpssFindingsChapter({ assignmentText, analysis, masterSyntax, output, interpretations, draftText: draft?.text || '', providerOverride: spssRouteRef.current.providerId, modelOverride: spssRouteRef.current.model });
      if (!result.ok) {
        setNotice({ tone: 'error', text: result.error || 'הרכבת פרק הממצאים נכשלה.' });
        return;
      }
      logAi({ stage: 'פרק ממצאים', description: 'הרכבת פרק ממצאים בעברית מהפלט, הפירושים והמטלה', prompt: 'הרכב פרק ממצאים מהפלט והפירושים', providerId: result.providerId, model: result.model });
      if (typeof onEmitDocument === 'function') {
        // יש טיוטה? ממזגים: הטיוטה כבסיס + פרק הממצאים בסופה → מסמך אחד שלם.
        const mergedHtml = draft?.html
          ? `${draft.html}\n<hr>\n${result.html}`
          : result.html;
        onEmitDocument({
          html: mergedHtml,
          title: draft?.title || result.title || 'פרק ממצאים',
        });
      } else {
        setNotice({ tone: 'error', text: 'אין יעד להזרמת המסמך. נסה שוב מתוך האפליקציה.' });
      }
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'הרכבת פרק הממצאים נכשלה.' });
    } finally {
      setBusy('');
    }
  }, [assignmentText, analysis, masterSyntax, output, interpretations, draft, onEmitDocument, logAi]);

  // Lit review + reference list (sections א+ד) — verified academic sources only.
  const onBuildLitReview = React.useCallback(async () => {
    const topic = (assignmentText.trim() || profile?.summary || '').slice(0, 400);
    if (!topic) {
      setNotice({ tone: 'error', text: 'אין נושא מחקר. הדבק את טקסט המטלה כדי לאתר מקורות.' });
      return;
    }
    setBusy('litreview');
    setNotice({ tone: 'info', text: 'מאתר מקורות אקדמיים מאומתים...' });
    try {
      const result = await buildLiteratureReview({ topic, count: 5, providerOverride: spssRouteRef.current.providerId, modelOverride: spssRouteRef.current.model });
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

  const appendixText = React.useMemo(() => buildAiAppendixText(aiLog), [aiLog]);
  const litReviewText = React.useMemo(() => buildLitReviewText(litReview), [litReview]);

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

      {/* Header + stepper */}
      <div className="border-b border-slate-200 bg-white px-5 py-4 md:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center rounded-full bg-[#1F6FEB]/10 px-3 py-1 text-[11px] font-bold text-[#1F6FEB]">עבודת סיום · SPSS</div>
            <h1 className="text-xl font-bold text-slate-900">מצב עבודה מונחה</h1>
          </div>
          <button
            type="button"
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
            onClick={onExit}
          >
            יציאה
          </button>
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
                    <p className="mt-2 text-sm leading-7 text-slate-600">יש כבר עבודה בכתיבה? העלה אותה כדי שפרק הממצאים ישתלב בסגנון ובמינוח שלה — וייווצר כמסמך אחד שלם, לא פרק נפרד.</p>
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
                    <p className="mt-1 text-sm leading-7 text-slate-600">הדבק או העלה פלט מ-SPSS וקבל הסבר בעברית בסגנון APA — בלי מטלה או נתונים. נתמכים: Excel, Word, PDF, HTML, csv, txt וקובץ SPSS Output‏ (.spv). אפשר גם להעלות קובץ נתונים להקשר טוב יותר — לא חובה.</p>
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
                </div>
              </div>
              <p className="mt-2 text-sm leading-7 text-slate-600">הרץ את ה-master syntax ב-SPSS, סמן את טבלאות ה-Output הרלוונטיות והדבק כאן — או העלה קובץ פלט וה-Output ייטען לכאן. נתמכים: Excel‏ (xlsx), Word‏ (docx), PDF, HTML, csv, txt וקובץ SPSS Output‏ (.spv). 💡 לתוצאה הנקייה ביותר, ב-SPSS: File → Export → Excel‏/HTML. אפשר להדביק/לטעון כמה טבלאות יחד.</p>
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-800">📊 יש בתוכנית גרפים? גרף ב-SPSS הוא תמונה — הוא לא נכנס לטקסט שמדביקים כאן, והבדיקה לא "רואה" אותו. ייצא כל גרף מ-SPSS (קליק ימני על הגרף → Copy / Export) והדבק אותו ישירות לתוצר בעורך.</div>
              <textarea
                className="mt-4 min-h-[320px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-[12px] leading-6 text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100/70"
                placeholder="הדבק כאן את הפלט (Independent Samples Test, Correlations, ANOVA וכו')."
                value={output}
                onChange={(event) => setOutput(event.target.value)}
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
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300" onClick={() => setStage('code')}>← חזרה לקוד</button>
                <button
                  type="button"
                  className={`rounded-2xl px-5 py-2.5 text-sm font-semibold text-white transition ${busy === 'critique' ? 'cursor-wait bg-slate-300' : 'bg-[#0066cc] hover:bg-blue-700'}`}
                  onClick={onCritique}
                  disabled={busy === 'critique' || !output.trim()}
                >
                  {busy === 'critique' ? 'בודק...' : 'בדוק מול המטלה →'}
                </button>
              </div>
            </section>
          )}

          {/* STAGE 4 — refine */}
          {stage === 'refine' && (
            <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-6 shadow-sm">
              <div className="text-lg font-bold text-slate-900">מקצה שיפורים</div>
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
              {critique && critique.verdict === 'clean' && (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-7 text-emerald-800">
                  {critique.summary || 'ההרצה עונה על המטלה. אין צורך בתיקונים.'}
                </div>
              )}
              {critique && critique.verdict === 'needs-fixes' && (
                <div className="mt-4 space-y-3">
                  {critique.summary && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-7 text-amber-800">{critique.summary}</div>}

                  {/* One-click: merge the existing code with every issue into one updated master syntax. */}
                  <button
                    type="button"
                    className={`w-full rounded-2xl px-5 py-3.5 text-sm font-bold text-white transition ${busy === 'fix-all' ? 'cursor-wait bg-slate-300' : 'bg-[#0066cc] hover:bg-blue-700'}`}
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
                    onClick={onCritique}
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

          {/* STAGE 5 — explain + deliverable */}
          {stage === 'explain' && (
            <div className="space-y-5">
              <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-lg font-bold text-slate-900">פירוש הפלט</div>
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
                <div className="text-lg font-bold text-slate-900">התוצר הסופי</div>
                <p className="mt-1 text-sm text-slate-600">תוצר מומלץ לפי המטלה: <span className="font-semibold text-blue-700">{DELIVERABLE_LABELS[profile?.deliverable || 'findings-chapter']}</span></p>
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
                <div className="mt-3 text-xs leading-6 text-slate-500">"צור מסמך" פותח את העורך עם פרק הממצאים מוכן להמשך עריכה.</div>
              </section>

              {/* Literature review + reference list (sections א+ד) */}
              <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-bold text-slate-900">סקירת ספרות ומקורות</div>
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
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">דורש SerpAPI (Google Scholar) מוגדר בהגדרות כדי לשלוף מאמרים אקדמיים אמיתיים.</div>
                )}
              </section>

              {/* AI-usage appendix (section ה) */}
              <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-6 shadow-sm">
                <div className="text-lg font-bold text-slate-900">נספח שימוש בבינה מלאכותית</div>
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
