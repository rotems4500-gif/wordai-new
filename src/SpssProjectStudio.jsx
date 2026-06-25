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
  buildSpssFindingsChapter,
  collectDeclaredTargetNames,
  critiqueSpssRun,
  generateSpssSyntax,
  interpretSpssOutput,
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

const buildMasterSyntax = (blocks = []) => blocks
  .map((block, index) => [
    `* --- ${index + 1}. ${String(block.title || 'SPSS block').replace(/\s+/g, ' ').trim()} ---.`,
    String(block.syntax || '').trim(),
  ].filter(Boolean).join('\n'))
  .join('\n\n')
  .trim();

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
  const [interpretations, setInterpretations] = React.useState([]);
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

  const handleDataFile = React.useCallback(async (file) => {
    if (!file) return;
    setBusy('upload');
    try {
      const nextAnalysis = await readDataFileToAnalysis(file);
      setAnalysis(nextAnalysis);
      setNotice({
        tone: 'success',
        text: `נטען ${nextAnalysis.fileName || 'קובץ נתונים'} · ${nextAnalysis.rowCount.toLocaleString('he-IL')} שורות, ${nextAnalysis.columnCount} עמודות. עכשיו הדבק את המטלה ולחץ "נתח משימה".`,
      });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'קריאת קובץ הנתונים נכשלה.' });
    } finally {
      setBusy('');
    }
  }, []);

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
      const result = await analyzeSpssAssignment({ assignmentText, analysis, providerOverride: spssRouteRef.current.providerId, modelOverride: spssRouteRef.current.model });
      if (!result.ok) {
        setNotice({ tone: 'error', text: result.error || 'ניתוח המטלה נכשל.' });
        return;
      }
      setProfile(result.profile);
      setBlocks([]);
      setOutput('');
      setCritique(null);
      setInterpretations([]);
      setStage('code');
      setNotice({ tone: 'success', text: `זוהו ${result.profile.analyses.length} ניתוחים · תוצר נדרש: ${DELIVERABLE_LABELS[result.profile.deliverable]}.` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'ניתוח המטלה נכשל.' });
    } finally {
      setBusy('');
    }
  }, [analysis, assignmentText]);

  // Stage 2 — generate all syntax from the task profile.
  const onGenerateAllCode = React.useCallback(async () => {
    if (!profile?.analyses?.length) return;
    setBusy('code');
    setNotice({ tone: 'info', text: 'מייצר syntax לכל ניתוח...' });
    try {
      const route = { providerOverride: spssRouteRef.current.providerId, modelOverride: spssRouteRef.current.model };

      // סולם retry: ניסיון ראשון לפי הסיווג; אם נחסם — ניסיון תיקון במצב prep
      // (מתיר הכנת נתונים) תוך דילוג על ה-guard המתודולוגי, עם סיבת החסימה כרמז.
      const generateBlockWithRetry = async (item, createdNames) => {
        const baseMode = PREP_METHOD_PATTERN.test(`${item.method} ${item.label}`) ? 'prep' : 'analysis';
        const baseRequest = item.request || item.label;

        let result = await generateSpssSyntax({ analysis, request: baseRequest, tutorMode: true, mode: baseMode, extraAllowedNames: createdNames, ...route });
        if (result.ok && result.syntax) return { result, repaired: false };

        // ניסיון 2 — prep + דילוג על guard + רמז התיקון.
        let result2 = await generateSpssSyntax({
          analysis, request: baseRequest, tutorMode: true, mode: 'prep', extraAllowedNames: createdNames,
          skipMethodologyGuard: true, repairHint: result.guidanceMessage, ...route,
        });
        if (result2.ok && result2.syntax) return { result: result2, repaired: true };

        // ניסיון 3 — בקשה מועשרת שמורה במפורש לכלול הכנת נתונים ולא להחזיר ERROR.
        const enrichedRequest = `${baseRequest}\n(אם נדרשת הכנת נתונים — בצע אותה תחילה ואז את הניתוח. ספק syntax מלא ושמיש; אל תחזיר ERROR אלא אם זה באמת בלתי אפשרי.)`;
        let result3 = await generateSpssSyntax({
          analysis, request: enrichedRequest, tutorMode: true, mode: 'prep', extraAllowedNames: createdNames,
          skipMethodologyGuard: true, repairHint: (result2.guidanceMessage || result.guidanceMessage), ...route,
        });
        if (result3.ok && result3.syntax) return { result: result3, repaired: true };

        return { result: result3 || result2 || result, repaired: false };
      };

      // B5 — prep-before-use: a block that consumes a derived variable (age_group,
      // dummy, a computed index, a MISSING VALUES declaration) must run AFTER the block
      // that creates it, otherwise it references an "invented" variable and gets blocked.
      // The planner is asked to order prep first, but enforce it deterministically with a
      // STABLE partition (preserve each group's relative order) as a safety net.
      const isPrepItem = (item) => PREP_METHOD_PATTERN.test(`${item?.method || ''} ${item?.label || ''}`);
      const orderedAnalyses = [
        ...profile.analyses.filter((item) => isPrepItem(item)),
        ...profile.analyses.filter((item) => !isPrepItem(item)),
      ];

      const nextBlocks = [];
      const createdNames = [];
      let repairedCount = 0;
      for (const item of orderedAnalyses) {
        const { result, repaired } = await generateBlockWithRetry(item, createdNames);
        if (result.ok && result.syntax) {
          if (repaired) repairedCount += 1;
          nextBlocks.push({ id: createLocalId(), title: item.label, syntax: result.syntax, blocked: false });
          createdNames.push(...Array.from(collectDeclaredTargetNames(result.syntax)));
        } else {
          nextBlocks.push({
            id: createLocalId(),
            title: item.label,
            syntax: `* ${item.label}: ${result.guidanceMessage || 'הבקשה נעצרה לפני יצירת syntax.'}`,
            blocked: true,
          });
        }
      }
      setBlocks(nextBlocks);
      const blockedCount = nextBlocks.filter((block) => block.blocked).length;
      const repairedNote = repairedCount ? ` (${repairedCount} שוקמו בניסיון חוזר)` : '';
      setNotice(blockedCount
        ? { tone: 'error', text: `נוצרו ${nextBlocks.length - blockedCount}/${nextBlocks.length} בלוקים${repairedNote}. ${blockedCount} נעצרו — בדוק אותם או נסח מחדש את המטלה.` }
        : { tone: 'success', text: `נוצר master syntax עם ${nextBlocks.length} בלוקים${repairedNote}. העתק/הורד, הרץ ב-SPSS, ואז הדבק את הפלט.` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'יצירת ה-syntax נכשלה.' });
    } finally {
      setBusy('');
    }
  }, [profile, analysis]);

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
      setNotice(result.verdict === 'clean'
        ? { tone: 'success', text: 'ההרצה תקינה מול המטלה. אפשר להמשיך להסברים ולתוצר.' }
        : { tone: 'error', text: `נמצאו ${result.issues.length} נקודות לתיקון. תקן את הקוד או המשך בכל זאת.` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'בדיקת הפלט נכשלה.' });
    } finally {
      setBusy('');
    }
  }, [output, assignmentText, analysis, masterSyntax]);

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
        setNotice({ tone: 'success', text: 'נוסף בלוק תיקון ל-master syntax. הרץ מחדש ב-SPSS והדבק פלט מעודכן.' });
      } else {
        setNotice({ tone: 'error', text: result.guidanceMessage || 'יצירת בלוק התיקון נעצרה.' });
      }
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'יצירת התיקון נכשלה.' });
    } finally {
      setBusy('');
    }
  }, [analysis, blocks]);

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
      setNotice({ tone: 'success', text: 'הפירוש מוכן.' });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'פירוש הפלט נכשל.' });
    } finally {
      setBusy('');
    }
  }, [analysis, output]);

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
  }, [assignmentText, analysis, masterSyntax, output, interpretations, draft, onEmitDocument]);

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
                <button
                  type="button"
                  className={`rounded-2xl border px-4 py-2 text-xs font-semibold transition ${busy === 'output-file' ? 'cursor-wait border-slate-200 bg-slate-100 text-slate-400' : 'border-[#1F6FEB]/30 bg-[#1F6FEB]/5 text-[#1F6FEB] hover:bg-[#1F6FEB]/10'}`}
                  onClick={onSelectOutputFile}
                  disabled={busy === 'output-file'}
                >
                  {busy === 'output-file' ? 'טוען...' : '📎 העלה קובץ פלט'}
                </button>
              </div>
              <p className="mt-2 text-sm leading-7 text-slate-600">הרץ את ה-master syntax ב-SPSS, סמן את טבלאות ה-Output הרלוונטיות והדבק כאן — או העלה קובץ פלט וה-Output ייטען לכאן. נתמכים: Excel‏ (xlsx), Word‏ (docx), PDF, HTML, csv, txt וקובץ SPSS Output‏ (.spv). 💡 לתוצאה הנקייה ביותר, ב-SPSS: File → Export → Excel‏/HTML. אפשר להדביק/לטעון כמה טבלאות יחד.</p>
              <textarea
                className="mt-4 min-h-[320px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-[12px] leading-6 text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100/70"
                placeholder="הדבק כאן את הפלט (Independent Samples Test, Correlations, ANOVA וכו')."
                value={output}
                onChange={(event) => setOutput(event.target.value)}
              />
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
              {busy === 'critique' && <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">בודק את הפלט מול המטלה...</div>}
              {critique && critique.verdict === 'clean' && (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-7 text-emerald-800">
                  {critique.summary || 'ההרצה עונה על המטלה. אין צורך בתיקונים.'}
                </div>
              )}
              {critique && critique.verdict === 'needs-fixes' && (
                <div className="mt-4 space-y-3">
                  {critique.summary && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-7 text-amber-800">{critique.summary}</div>}
                  {critique.issues.map((issue, index) => (
                    <div key={`${issue.label}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="font-semibold text-slate-800">{issue.label || `נקודה ${index + 1}`}</div>
                      <div className="mt-1 text-sm leading-6 text-slate-600">{issue.problem}</div>
                      {issue.fixRequest && (
                        <button
                          type="button"
                          className={`mt-3 rounded-full px-4 py-2 text-xs font-semibold text-white transition ${busy === `fix-${issue.fixRequest}` ? 'cursor-wait bg-slate-300' : 'bg-[#0066cc] hover:bg-blue-700'}`}
                          onClick={() => onApplyFix(issue)}
                          disabled={busy.startsWith('fix-')}
                        >
                          {busy === `fix-${issue.fixRequest}` ? 'מתקן...' : 'הוסף בלוק תיקון'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300" onClick={() => setStage('output')}>← עדכן פלט</button>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
