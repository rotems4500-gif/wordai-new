import React from 'react';
import { saveBlobInBrowser } from './services/browserDocxExport';
import {
  SPSS_QUICK_ACTIONS,
  buildQuickActionSyntax,
  buildSmartSuggestions,
  collectDeclaredTargetNames,
  generateSpssSyntax,
  getGuardrailGuidanceMessage,
  getQuickActionState,
  interpretSpssOutput,
  isGuardrailSyntaxResponse,
  repairSpssSyntaxFromError,
  runSpssGuidance,
  splitMergedSpssLines,
} from './services/spssSyntaxService';
import { SUPPORTED_DATA_FILE_ACCEPT, readDataFileToAnalysis } from './services/spssDataIngest';
import { BROWSER_DOC_ACCEPT, pickDesktopDocument, readBrowserDocumentFile } from './services/documentUpload';
import {
  getSpssPreferences,
  saveSpssPreferences,
  getProviderConfig,
  getConfiguredProviderChoices,
  getProviderModelChoices,
  normalizeProviderModelName,
} from './services/aiService';
import { generateSpssChart } from './services/chartService';

// Methods that write new variables back to the data — these belong in prep mode.
const PREP_METHOD_PATTERN = /(reliability|cronbach|recode|compute|scale|index|reverse|מהימנות|סולם|מדד|היפוך|recoding)/i;

const createLocalId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `spss-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const formatTime = (value = 0) => new Date(value || Date.now()).toLocaleTimeString('he-IL', {
  hour: '2-digit',
  minute: '2-digit',
});

const sourceLabelMap = {
  ai: 'AI',
  local: 'SPSS בטוח',
  'quick-action': 'פעולה מהירה',
  guardrail: 'הכוונה',
};

const normalizeBlockTitle = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const buildSafeFileStem = (value = 'wordflow-spss') => {
  const base = String(value || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
  return base || 'wordflow-spss';
};

const buildSyntaxFileName = ({ analysis = null, mode = 'master', blockCount = 0, block = null } = {}) => {
  const datasetStem = buildSafeFileStem(analysis?.fileName || 'dataset');
  const countPart = Math.max(0, Number(blockCount) || 0);
  const timePart = new Date(block?.createdAt || Date.now())
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+$/, '')
    .replace('T', '-');
  const modePart = mode === 'block' ? `block-${countPart || 1}` : `master-${countPart}`;
  return `${datasetStem}-${modePart}-${timePart}.sps`;
};

const buildMasterSyntax = (blocks = []) => blocks
  .map((block, index) => [
    `* --- Block ${index + 1}: ${normalizeBlockTitle(block.title) || 'SPSS block'} | ${formatTime(block.createdAt)} ---.`,
    // מפצל שורות שהתמזגו ב-round-trip של המודל (פקודה. * הערה) — ב-SPSS מיזוג
    // כזה מבליע פקודות בתוך הערות וגורם ל-"undefined variable" בהמשך.
    splitMergedSpssLines(String(block.syntax || '').trim()),
  ].filter(Boolean).join('\n'))
  .join('\n\n')
  .trim();

const downloadTextFile = (content = '', fileName = 'wordflow-spss-syntax.sps') => {
  const blob = new Blob([String(content || '')], { type: 'text/plain;charset=utf-8' });
  return saveBlobInBrowser(blob, fileName);
};

const noticeToneClassMap = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  error: 'border-rose-200 bg-rose-50 text-rose-700',
  info: 'border-slate-200 bg-slate-50 text-slate-700',
};

export default function SpssSyntaxStudio({ onOpenProjectMode = null }) {
  const fileInputRef = React.useRef(null);
  const draftInputRef = React.useRef(null);
  const activeUploadRequestIdRef = React.useRef('');
  const activeSessionIdRef = React.useRef('');
  const activeGenerateRequestIdRef = React.useRef('');
  const spssPrefsRef = React.useRef(getSpssPreferences());
  const [analysis, setAnalysis] = React.useState(null);
  const [draft, setDraft] = React.useState(null);
  const [draftBusy, setDraftBusy] = React.useState(false);
  const [request, setRequest] = React.useState('');
  const [tutorMode, setTutorMode] = React.useState(() => spssPrefsRef.current.tutorMode !== false);
  const [genMode, setGenMode] = React.useState(() => spssPrefsRef.current.defaultGenMode || 'analysis');
  const [loading, setLoading] = React.useState(false);
  const [dragActive, setDragActive] = React.useState(false);
  const [blocks, setBlocks] = React.useState([]);
  const [lastBlockId, setLastBlockId] = React.useState('');
  const [syntaxView, setSyntaxView] = React.useState(() => spssPrefsRef.current.defaultSyntaxView || 'master');
  const [guidance, setGuidance] = React.useState('');
  const [lastRejectedRequest, setLastRejectedRequest] = React.useState(null);
  const [notice, setNotice] = React.useState({ tone: 'info', text: 'העלה SAV, CSV, Excel, TSV או TXT כדי להתחיל לבנות syntax ל-SPSS.' });
  const [studioView, setStudioView] = React.useState('syntax');
  const [chatMessages, setChatMessages] = React.useState([]);
  const [chatInput, setChatInput] = React.useState('');
  const [chatInputMode, setChatInputMode] = React.useState('ask');
  const [outputDraft, setOutputDraft] = React.useState('');
  const [chatBusy, setChatBusy] = React.useState(false);
  // On-page provider/model picker (mirrors the home screen). Empty = follow the
  // active provider / settings; once the user picks, it overrides per-request.
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

  // The override actually sent to the service: empty until the user picks, so an
  // untouched studio still honors the active provider / settings feature config.
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

  const suggestions = React.useMemo(() => buildSmartSuggestions(analysis), [analysis]);
  const masterSyntax = React.useMemo(() => buildMasterSyntax(blocks), [blocks]);
  const priorCreatedNames = React.useMemo(
    () => Array.from(new Set(blocks.flatMap((block) => Array.from(collectDeclaredTargetNames(block.syntax))))),
    [blocks],
  );
  const latestBlock = React.useMemo(() => blocks[blocks.length - 1] || null, [blocks]);
  const selectedBlock = React.useMemo(() => blocks.find((block) => block.id === lastBlockId) || latestBlock, [blocks, lastBlockId, latestBlock]);
  const activeSyntaxContent = syntaxView === 'block' ? String(selectedBlock?.syntax || '') : masterSyntax;
  const activeSyntaxFileName = React.useMemo(() => buildSyntaxFileName({
    analysis,
    mode: syntaxView,
    blockCount: blocks.length,
    block: syntaxView === 'block' ? selectedBlock : latestBlock,
  }), [analysis, blocks.length, latestBlock, selectedBlock, syntaxView]);
  const activeSyntaxTitle = syntaxView === 'block'
    ? (selectedBlock ? `בלוק נבחר: ${selectedBlock.title}` : 'בלוק נבחר')
    : 'Master syntax עדכני';
  const openFilePicker = React.useCallback(() => {
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    fileInputRef.current.click();
  }, []);

  const appendBlock = React.useCallback((block) => {
    const nextBlock = {
      id: createLocalId(),
      createdAt: Date.now(),
      title: normalizeBlockTitle(block?.title) || 'SPSS block',
      syntax: String(block?.syntax || '').trim(),
      source: String(block?.source || 'ai').trim(),
      providerId: String(block?.providerId || '').trim(),
      model: String(block?.model || '').trim(),
      tokenizedRequest: String(block?.tokenizedRequest || '').trim(),
    };
    setBlocks((prev) => [...prev, nextBlock]);
    setLastBlockId(nextBlock.id);
    setSyntaxView('master');
    setLastRejectedRequest(null);
    return nextBlock;
  }, []);

  const handleCopy = React.useCallback(async (content, successMessage) => {
    try {
      await navigator.clipboard.writeText(String(content || ''));
      setNotice({ tone: 'success', text: successMessage });
    } catch {
      setNotice({ tone: 'error', text: 'ההעתקה נכשלה. אפשר לסמן ולהעתיק ידנית.' });
    }
  }, []);

  const handleDownloadSyntax = React.useCallback(async (content, fileName) => {
    try {
      await downloadTextFile(content, fileName);
      setNotice({ tone: 'success', text: `קובץ הסינטקס נוצר: ${fileName}` });
    } catch {
      setNotice({ tone: 'error', text: 'הורדת קובץ הסינטקס נכשלה. אפשר להעתיק את הסינטקס ידנית.' });
    }
  }, []);

  const resetForNewDataset = React.useCallback((nextAnalysis) => {
    const nextSessionId = createLocalId();
    activeSessionIdRef.current = nextSessionId;
    activeGenerateRequestIdRef.current = '';
    setLoading(false);
    setAnalysis({
      ...nextAnalysis,
      sessionId: nextSessionId,
    });
    setBlocks([]);
    setLastBlockId('');
    setSyntaxView('master');
    setRequest('');
    setGuidance('');
    setLastRejectedRequest(null);
    setChatMessages([]);
    setChatInput('');
    setOutputDraft('');
    setChatInputMode('ask');
    setChatBusy(false);
    setNotice({
      tone: 'success',
      text: `נטען ${nextAnalysis.fileName || 'קובץ נתונים'} עם ${nextAnalysis.rowCount.toLocaleString('he-IL')} שורות ו-${nextAnalysis.columnCount} עמודות. ל-AI נשלחים שמות המשתנים וסטטיסטיקות סיכום — לא שורות הדאטה.`,
    });
  }, []);

  React.useEffect(() => {
    const defaultAnalysis = spssPrefsRef.current?.defaultDataAnalysis;
    if (analysis || !defaultAnalysis || typeof defaultAnalysis !== 'object') return;
    if (!Array.isArray(defaultAnalysis.columns) || !defaultAnalysis.columns.length) return;
    resetForNewDataset(defaultAnalysis);
    setNotice({
      tone: 'success',
      text: `נטען קובץ ברירת המחדל ${defaultAnalysis.fileName || 'קובץ נתונים'} עם ${Number(defaultAnalysis.rowCount || 0).toLocaleString('he-IL')} שורות ו-${defaultAnalysis.columnCount || 0} עמודות. אפשר להחליף קובץ דרך הכפתור.`,
    });
  }, [analysis, resetForNewDataset]);

  const handleDataFile = React.useCallback(async (file) => {
    if (!file) return;
    const uploadRequestId = createLocalId();
    activeUploadRequestIdRef.current = uploadRequestId;
    activeGenerateRequestIdRef.current = '';
    setLoading(false);

    try {
      const nextAnalysis = await readDataFileToAnalysis(file);
      if (activeUploadRequestIdRef.current !== uploadRequestId) return;

      resetForNewDataset(nextAnalysis);
    } catch (error) {
      if (activeUploadRequestIdRef.current !== uploadRequestId) return;

      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'קריאת קובץ הנתונים נכשלה.' });
    }
  }, [resetForNewDataset]);

  const handleFileInputChange = React.useCallback((event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (file) handleDataFile(file);
  }, [handleDataFile]);

  // טיוטה קיימת (אופציונלי) — נשלחת ל-AI כהקשר/סגנון בפירוש הפלט ובצ'אט.
  const onSelectDraft = React.useCallback(async () => {
    setDraftBusy(true);
    try {
      const desktop = await pickDesktopDocument();
      if (desktop.canceled) return;
      if (desktop.unsupported) {
        draftInputRef.current?.click();
        return;
      }
      setDraft(desktop.doc);
      setNotice({ tone: 'success', text: `נטענה טיוטה: ${desktop.doc.name}. ה-AI יתחשב בה בפירוש הפלט ובצ'אט.` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'טעינת הטיוטה נכשלה.' });
    } finally {
      setDraftBusy(false);
    }
  }, []);

  const onDraftInputChange = React.useCallback(async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;
    setDraftBusy(true);
    try {
      const next = await readBrowserDocumentFile(file);
      if (next) {
        setDraft(next);
        setNotice({ tone: 'success', text: `נטענה טיוטה: ${next.name}. ה-AI יתחשב בה בפירוש הפלט ובצ'אט.` });
      }
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'טעינת הטיוטה נכשלה.' });
    } finally {
      setDraftBusy(false);
    }
  }, []);

  const clearDraft = React.useCallback(() => {
    setDraft(null);
    if (draftInputRef.current) draftInputRef.current.value = '';
  }, []);

  const onDrop = React.useCallback((event) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) handleDataFile(file);
  }, [handleDataFile]);

  const onDragEnter = React.useCallback((event) => {
    event.preventDefault();
    setDragActive(true);
  }, []);

  const onDragOver = React.useCallback((event) => {
    event.preventDefault();
  }, []);

  const onDragLeave = React.useCallback((event) => {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setDragActive(false);
  }, []);

  const removeLastBlock = React.useCallback(() => {
    if (!blocks.length) return;
    const nextBlocks = blocks.slice(0, -1);
    setBlocks(nextBlocks);
    setLastBlockId(nextBlocks[nextBlocks.length - 1]?.id || '');
    setNotice({
      tone: 'success',
      text: nextBlocks.length
        ? 'הבלוק האחרון הוסר מ-master syntax.'
        : 'הבלוק האחרון הוסר. ה-master syntax ריק כרגע.',
    });
  }, [blocks]);

  const onQuickAction = React.useCallback((actionId, column) => {
    const actionState = getQuickActionState({ actionId, column });
    if (!actionState.available) {
      const guidanceMessage = getGuardrailGuidanceMessage(actionState.reason);
      setGuidance(guidanceMessage);
      setLastRejectedRequest(null);
      setNotice({ tone: 'error', text: guidanceMessage });
      return;
    }

    const syntax = buildQuickActionSyntax({ actionId, column, tutorMode });
    if (isGuardrailSyntaxResponse(syntax)) {
      const guidanceMessage = getGuardrailGuidanceMessage(syntax);
      setGuidance(guidanceMessage);
      setLastRejectedRequest(null);
      setNotice({ tone: 'error', text: guidanceMessage });
      return;
    }

    setGuidance('');
    appendBlock({
      title: `${actionState.action?.label || 'SPSS'} · ${column.originalName}`,
      syntax,
      source: 'quick-action',
    });
    setNotice({
      tone: 'success',
      text: actionState.action?.destructive
        ? 'נוסף בלוק היפוך סולם. שים לב שהוא מחליף את הערכים בעמודה המקורית.'
        : `נוסף בלוק ${actionState.action?.command || 'SPSS'} ל-master syntax.`,
    });
  }, [appendBlock, tutorMode]);

  const onGenerate = React.useCallback(async () => {
    if (!analysis) {
      const guidanceMessage = 'צריך להעלות קובץ נתונים לפני יצירת syntax.';
      setGuidance(guidanceMessage);
      setLastRejectedRequest(null);
      setNotice({ tone: 'error', text: guidanceMessage });
      return;
    }
    if (!request.trim()) {
      const guidanceMessage = 'כתוב בקשה קצרה בעברית כדי לייצר syntax.';
      setGuidance(guidanceMessage);
      setLastRejectedRequest(null);
      setNotice({ tone: 'error', text: guidanceMessage });
      return;
    }

    const currentAnalysis = analysis;
    const requestText = request.trim();
    let effectiveMode = genMode;
    if (
      genMode === 'analysis'
      && spssPrefsRef.current.autoSwitchPrepForReliability !== false
      && PREP_METHOD_PATTERN.test(requestText)
    ) {
      effectiveMode = 'prep';
      setGenMode('prep');
    }
    const sessionId = String(currentAnalysis?.sessionId || '');
    const generateRequestId = createLocalId();
    activeGenerateRequestIdRef.current = generateRequestId;

    setLoading(true);
    setGuidance('');
    setLastRejectedRequest(null);
    setNotice({ tone: 'info', text: 'מייצר syntax דרך ה-provider הפעיל...' });
    try {
      const route = {
        providerOverride: spssRouteRef.current.providerId,
        modelOverride: spssRouteRef.current.model,
      };

      // C6 — retry ladder (mirrors the project studio): a deterministic guardrail
      // false-positive should NOT be final here. If the first pass is blocked, retry in
      // prep mode (allows data-prep) while skipping the methodology guard and feeding the
      // block reason back as a repair hint, then a final enriched attempt. Only a genuine
      // dead-end (still ERROR after prep) surfaces as a rejection.
      let result = await generateSpssSyntax({
        analysis: currentAnalysis,
        request: requestText,
        tutorMode,
        mode: effectiveMode,
        extraAllowedNames: priorCreatedNames,
        ...route,
      });
      let repaired = false;
      if (!result.ok || !result.syntax) {
        const result2 = await generateSpssSyntax({
          analysis: currentAnalysis, request: requestText, tutorMode, mode: 'prep',
          extraAllowedNames: priorCreatedNames, skipMethodologyGuard: true, repairHint: result.guidanceMessage, ...route,
        });
        if (result2.ok && result2.syntax) {
          result = result2;
          repaired = true;
        } else {
          const enrichedRequest = `${requestText}\n(אם נדרשת הכנת נתונים — בצע אותה תחילה ואז את הניתוח. ספק syntax מלא ושמיש; אל תחזיר ERROR אלא אם זה באמת בלתי אפשרי.)`;
          const result3 = await generateSpssSyntax({
            analysis: currentAnalysis, request: enrichedRequest, tutorMode, mode: 'prep',
            extraAllowedNames: priorCreatedNames, skipMethodologyGuard: true,
            repairHint: result2.guidanceMessage || result.guidanceMessage, ...route,
          });
          if (result3.ok && result3.syntax) {
            result = result3;
            repaired = true;
          } else {
            result = result3 || result2 || result;
          }
        }
      }

      if (
        activeGenerateRequestIdRef.current !== generateRequestId
        || activeSessionIdRef.current !== sessionId
      ) {
        return;
      }

      if (!result.ok || !result.syntax) {
        const guidanceMessage = result.guidanceMessage || 'הבקשה נעצרה לפני יצירת syntax כדי למנוע פלט שגוי.';
        setGuidance(guidanceMessage);
        setLastRejectedRequest({
          id: generateRequestId,
          createdAt: Date.now(),
          title: requestText,
          guidance: guidanceMessage,
          tokenizedRequest: String(result.tokenizedRequest || '').trim(),
          rawSyntax: String(result.rawSyntax || '').trim(),
        });
        setNotice({ tone: 'error', text: 'הבקשה נעצרה: ה-master syntax ורצף העבודה למטה נשארו ללא שינוי.' });
        return;
      }

      appendBlock({
        title: requestText,
        syntax: result.syntax,
        source: result.source,
        providerId: result.providerId,
        model: result.model,
        tokenizedRequest: result.tokenizedRequest,
      });
      setGuidance('');
      setNotice({
        tone: 'success',
        text: repaired
          ? 'נוסף בלוק syntax חדש ל-master syntax (שוקם בניסיון חוזר עם הכנת נתונים).'
          : 'נוסף בלוק syntax חדש ל-master syntax.',
      });
    } catch (error) {
      if (
        activeGenerateRequestIdRef.current !== generateRequestId
        || activeSessionIdRef.current !== sessionId
      ) {
        return;
      }

      setGuidance('הקריאה ל-provider נכשלה. אפשר לנסח מחדש את הבקשה או לבדוק את הגדרות ה-AI.');
      setLastRejectedRequest(null);
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'יצירת syntax נכשלה.' });
    } finally {
      if (
        activeGenerateRequestIdRef.current === generateRequestId
        && activeSessionIdRef.current === sessionId
      ) {
        setLoading(false);
      }
    }
  }, [analysis, appendBlock, request, tutorMode, genMode, priorCreatedNames]);

  const appendChatMessage = React.useCallback((message) => {
    setChatMessages((prev) => [...prev, { id: createLocalId(), createdAt: Date.now(), ...message }]);
  }, []);

  const onSendGuidance = React.useCallback(async () => {
    const question = chatInput.trim();
    if (!question || chatBusy) return;

    const history = chatMessages.map((message) => ({ role: message.role, text: message.text }));
    appendChatMessage({ role: 'user', text: question, kind: 'ask' });
    setChatInput('');
    setChatBusy(true);
    try {
      const result = await runSpssGuidance({ analysis, question, history, mode: genMode, draftText: draft?.text || '', providerOverride: spssRouteRef.current.providerId, modelOverride: spssRouteRef.current.model });
      appendChatMessage(
        result.ok
          ? { role: 'assistant', text: result.answer, kind: 'guidance', providerId: result.providerId, model: result.model }
          : { role: 'assistant', text: result.error || 'קבלת ההדרכה נכשלה.', kind: 'error' },
      );
    } catch (error) {
      appendChatMessage({ role: 'assistant', text: error instanceof Error ? error.message : 'קבלת ההדרכה נכשלה.', kind: 'error' });
    } finally {
      setChatBusy(false);
    }
  }, [analysis, appendChatMessage, chatBusy, chatInput, chatMessages, genMode, draft]);

  const onInterpretOutput = React.useCallback(async () => {
    const output = outputDraft.trim();
    if (!output || chatBusy) return;

    const focus = chatInput.trim();
    appendChatMessage({ role: 'user', text: `פירוש פלט SPSS${focus ? ` · ${focus}` : ''}:\n${output}`, kind: 'output' });
    setOutputDraft('');
    setChatInput('');
    setChatBusy(true);
    try {
      const result = await interpretSpssOutput({ analysis, output, question: focus, draftText: draft?.text || '', providerOverride: spssRouteRef.current.providerId, modelOverride: spssRouteRef.current.model });
      appendChatMessage(
        result.ok
          ? { role: 'assistant', text: result.answer, kind: 'interpretation', providerId: result.providerId, model: result.model }
          : { role: 'assistant', text: result.error || 'פירוש הפלט נכשל.', kind: 'error' },
      );
    } catch (error) {
      appendChatMessage({ role: 'assistant', text: error instanceof Error ? error.message : 'פירוש הפלט נכשל.', kind: 'error' });
    } finally {
      setChatBusy(false);
    }
  }, [analysis, appendChatMessage, chatBusy, chatInput, outputDraft, draft]);

  const onRepairFromError = React.useCallback(async () => {
    const output = outputDraft.trim();
    if (!output || chatBusy) return;
    if (!masterSyntax.trim()) {
      setNotice({ tone: 'error', text: 'אין master syntax לתקן — צור קוד קודם.' });
      return;
    }

    appendChatMessage({ role: 'user', text: `תקן את ה-syntax לפי שגיאות SPSS:\n${output}`, kind: 'output' });
    setChatBusy(true);
    setNotice({ tone: 'info', text: 'מנתח את שגיאות SPSS ומתקן את ה-syntax...' });
    try {
      const result = await repairSpssSyntaxFromError({ analysis, priorSyntax: masterSyntax, output, providerOverride: spssRouteRef.current.providerId, modelOverride: spssRouteRef.current.model });
      const parsed = result.parsed;
      const summary = parsed ? `זוהו ${parsed.fatal.length} שגיאות ו-${parsed.warnings.length} אזהרות. ` : '';
      if (result.ok && result.syntax) {
        appendChatMessage({
          role: 'assistant',
          kind: 'repair',
          text: `${summary}הקוד תוקן — העתק והרץ שוב ב-SPSS. אם נשארת שגיאה, הדבק אותה שוב לתיקון נוסף.`,
          syntax: result.syntax,
          providerId: result.providerId,
          model: result.model,
        });
        setOutputDraft('');
        setChatInput('');
        setNotice({ tone: 'success', text: 'הקוד תוקן. העתק את הגרסה המתוקנת מהצ׳אט.' });
      } else {
        appendChatMessage({ role: 'assistant', kind: 'error', text: `${summary}${result.error || result.guidanceMessage || 'תיקון הקוד נכשל.'}` });
        setNotice({ tone: 'error', text: result.error || result.guidanceMessage || 'תיקון הקוד נכשל.' });
      }
    } catch (error) {
      appendChatMessage({ role: 'assistant', kind: 'error', text: error instanceof Error ? error.message : 'תיקון הקוד נכשל.' });
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'תיקון הקוד נכשל.' });
    } finally {
      setChatBusy(false);
    }
  }, [analysis, appendChatMessage, chatBusy, masterSyntax, outputDraft]);

  const onGenerateChart = React.useCallback(async () => {
    const output = outputDraft.trim();
    if (!output || chatBusy) return;

    const focus = chatInput.trim();
    appendChatMessage({ role: 'user', text: `צור גרף מהפלט${focus ? ` · ${focus}` : ''}:\n${output}`, kind: 'output' });
    setChatBusy(true);
    setNotice({ tone: 'info', text: 'מחלץ נתונים מהפלט ומרנדר גרף...' });
    try {
      const result = await generateSpssChart({ analysis, output, focus });
      if (result.ok) {
        appendChatMessage({
          role: 'assistant',
          kind: 'chart',
          text: result.engine === 'ai' ? 'גרף המחשה שנוצר ב-AI (לא מדויק מספרית).' : 'גרף מדויק מנתוני הפלט.',
          dataUrl: result.dataUrl,
          chartTitle: result.title || 'תרשים',
          chartAlt: result.alt || 'תרשים',
          engine: result.engine,
        });
        setOutputDraft('');
        setChatInput('');
        setNotice({ tone: 'success', text: 'הגרף נוצר. אפשר להוריד או לגרור לעורך.' });
      } else {
        appendChatMessage({ role: 'assistant', kind: 'error', text: result.reason || 'יצירת הגרף נכשלה.' });
        setNotice({ tone: 'error', text: result.reason || 'יצירת הגרף נכשלה.' });
      }
    } catch (error) {
      appendChatMessage({ role: 'assistant', kind: 'error', text: error instanceof Error ? error.message : 'יצירת הגרף נכשלה.' });
    } finally {
      setChatBusy(false);
    }
  }, [analysis, appendChatMessage, chatBusy, chatInput, outputDraft]);

  const handleDownloadChart = React.useCallback(async (dataUrl, title) => {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await saveBlobInBrowser(blob, `${buildSafeFileStem(title || analysis?.fileName || 'spss-chart')}.png`);
      setNotice({ tone: 'success', text: 'הגרף נשמר כקובץ PNG.' });
    } catch {
      setNotice({ tone: 'error', text: 'שמירת הגרף נכשלה.' });
    }
  }, [analysis]);

  const statusToneClass = noticeToneClassMap[notice.tone] || noticeToneClassMap.info;

  if (!analysis) {
    return (
      <div className="flex flex-1 min-h-0 overflow-auto bg-[#ECE8E1]" dir="rtl">
        <input
          ref={fileInputRef}
          type="file"
          accept={SUPPORTED_DATA_FILE_ACCEPT}
          className="hidden"
          onChange={handleFileInputChange}
        />
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-6 md:px-8 md:py-10">
          <div className={`rounded-[28px] border px-5 py-4 text-sm leading-7 shadow-sm ${statusToneClass}`}>
            {notice.text}
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.18fr),minmax(300px,0.82fr)]">
            <section
              className={`rounded-[32px] border-2 border-dashed px-6 py-7 shadow-sm transition md:px-8 md:py-9 ${dragActive ? 'border-[#1F6FEB] bg-blue-50/70' : 'border-slate-300 bg-white'}`}
              onDragEnter={onDragEnter}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              <div className="inline-flex items-center rounded-full bg-[#1F6FEB]/10 px-3 py-1 text-[11px] font-bold text-[#1F6FEB]">SPSS AI</div>
              <h1 className="mt-4 text-3xl font-bold leading-tight text-slate-900 md:text-[2.5rem]">טען קובץ נתונים כדי להתחיל לעבוד עם SPSS AI</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
                המשטח המלא נפתח רק אחרי שיש dataset, כדי לשמור על פוקוס על upload, על הבקשה, ועל התוצאה שבאמת תריץ ב-SPSS.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="rounded-2xl bg-[#0066cc] px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                  onClick={openFilePicker}
                >
                  טען קובץ נתונים
                </button>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-600">
                  אפשר גם לגרור קובץ ישירות לאזור הזה.
                </div>
              </div>

              {onOpenProjectMode && (
                <button
                  type="button"
                  className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-[#1F6FEB]/30 bg-[#1F6FEB]/5 px-5 py-3 text-sm font-semibold text-[#1F6FEB] transition hover:bg-[#1F6FEB]/10"
                  onClick={onOpenProjectMode}
                >
                  עבודת סיום שלמה? עבור למצב עבודה מונחה →
                </button>
              )}

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
                  <div className="text-sm font-bold text-slate-900">איך זה עובד</div>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    WordFlow מנתח מקומית שמות עמודות, טיפוסים וטווחי ערכים. ל-AI נשלחים שמות המשתנים וסטטיסטיקות הסיכום כדי לייצר syntax והדרכה מדויקים — שורות הדאטה עצמן לא נשלחות.
                  </p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
                  <div className="text-sm font-bold text-slate-900">מה להכין מראש</div>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    אפשר להעלות קובץ SAV ישירות. בקובצי CSV, Excel, TSV או TXT ודא שהשורה הראשונה כוללת שמות משתנים ברורים.
                  </p>
                </div>
              </div>
            </section>

            <aside className="space-y-4">
              <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
                <div className="text-lg font-bold text-slate-900">קבצים נתמכים</div>
                <ol className="mt-4 space-y-3 pr-5 text-sm leading-7 text-slate-600 list-decimal">
                  <li>SAV מקורי של SPSS.</li>
                  <li>CSV, TSV או TXT עם שורת כותרות.</li>
                  <li>Excel מסוג XLSX או XLS, לפי הגיליון הראשון.</li>
                </ol>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
                <div className="text-lg font-bold text-slate-900">מה תקבל אחרי הטעינה?</div>
                <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
                  <p>בקשה חופשית בעברית ליצירת syntax.</p>
                  <p>תוצאה נקייה ומוכנה להעתקה ל-SPSS.</p>
                  <p>פעולות מהירות רק לעמודות שהטיפוס שלהן באמת מתאים.</p>
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
                <div className="text-lg font-bold text-slate-900">בשלב הזה אין persistence חדש</div>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  ה-session נשאר זמני. אם תרצה לשמור תוצר, אפשר להוריד קובץ .sps אחרי שנוצר syntax.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden bg-[#ECE8E1]" dir="rtl">
      <input
        ref={fileInputRef}
        type="file"
        accept={SUPPORTED_DATA_FILE_ACCEPT}
        className="hidden"
        onChange={handleFileInputChange}
      />
      <input
        ref={draftInputRef}
        type="file"
        accept={BROWSER_DOC_ACCEPT}
        className="hidden"
        onChange={onDraftInputChange}
      />
      <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-[minmax(320px,390px),1fr]">
        <aside className="min-h-0 overflow-y-auto border-l border-slate-200 bg-[#F8FAFC] px-5 py-5 md:px-6 md:py-6 space-y-5">
          <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center rounded-full bg-[#1F6FEB]/10 px-3 py-1 text-[11px] font-bold text-[#1F6FEB]">SPSS AI</div>
                <h2 className="mt-3 text-2xl font-bold text-slate-900">SPSS Syntax Studio</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  העלית dataset פעיל. מכאן הפוקוס הוא על בקשה בעברית, על syntax נקי, ועל recovery קטן אם צריך לחזור צעד אחד אחורה.
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={tutorMode}
                  onChange={(event) => setTutorMode(event.target.checked)}
                />
                Tutor mode
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px]">
              <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{analysis.fileName || 'קובץ נתונים נטען'}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{analysis.rowCount.toLocaleString('he-IL')} שורות</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{analysis.columnCount} עמודות</span>
              <span className="rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-700">{analysis.inferenceSampleRowCount} שורות inference</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                className="rounded-2xl bg-[#0066cc] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                onClick={openFilePicker}
              >
                החלף קובץ
              </button>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-600">
ל-AI נשלחים שמות המשתנים וסטטיסטיקות סיכום. שורות הדאטה המלאות לא נשלחות.
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-lg font-bold text-slate-900">טיוטה קיימת <span className="text-sm font-normal text-slate-500">(אופציונלי)</span></div>
                <p className="mt-1 text-sm leading-6 text-slate-600">העלה עבודה בכתיבה כדי שהפירושים והצ'אט יתאימו למינוח ולסגנון שלה.</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <button
                  type="button"
                  className={`rounded-2xl px-4 py-2.5 text-sm font-semibold text-white transition ${draftBusy ? 'cursor-wait bg-slate-300' : 'bg-[#0066cc] hover:bg-blue-700'}`}
                  onClick={onSelectDraft}
                  disabled={draftBusy}
                >
                  {draftBusy ? 'טוען...' : (draft ? 'החלף' : 'העלה טיוטה')}
                </button>
                {draft && (
                  <button
                    type="button"
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300"
                    onClick={clearDraft}
                  >
                    הסר
                  </button>
                )}
              </div>
            </div>
            {draft && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px]">
                <span className="rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-700" title={draft.name}>📄 {draft.name}</span>
              </div>
            )}
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-bold text-slate-900">מה תרצה לעשות עם הדאטה?</div>
                <div className="mt-1 text-sm text-slate-500">כתוב בעברית חופשית. אפשר להזכיר שמות עמודות מהקובץ — WordFlow מזהה אותם אוטומטית.</div>
              </div>
              <button
                type="button"
                className={`rounded-2xl px-4 py-2.5 text-sm font-semibold text-white transition ${loading ? 'cursor-wait bg-slate-300' : 'bg-[#0066cc] hover:bg-blue-700'}`}
                onClick={onGenerate}
                disabled={loading || !analysis || !request.trim()}
              >
                {loading ? 'מייצר syntax...' : 'צור syntax'}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${genMode === 'analysis' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  onClick={() => setGenMode('analysis')}
                >
                  ניתוח (read-only)
                </button>
                <button
                  type="button"
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${genMode === 'prep' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  onClick={() => setGenMode('prep')}
                >
                  הכנת דאטה
                </button>
              </div>
              <span className="text-xs leading-5 text-slate-500">
                {genMode === 'prep'
                  ? 'מותרות פעולות שמשנות נתונים: COMPUTE, RECODE, בניית סולמות, Cronbach, טיפול בחסרים. צור משתנים חדשים.'
                  : 'רק ניתוח לקריאה. פקודות שמשנות נתונים חסומות — עבור ל״הכנת דאטה״ כדי לאפשר אותן.'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <span className="text-xs font-bold text-slate-600">מודל ל-AI</span>
              <select
                value={resolvedSpssProviderId}
                onChange={(event) => onPickSpssProvider(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              >
                {providerChoices.map((choice) => (
                  <option key={choice.id} value={choice.id}>{choice.label}{choice.isDefault ? ' (ברירת מחדל)' : ''}</option>
                ))}
              </select>
              <select
                value={resolvedSpssModel}
                onChange={(event) => onPickSpssModel(event.target.value)}
                disabled={!modelChoices.length}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
              >
                {modelChoices.length
                  ? modelChoices.map((modelName) => (<option key={modelName} value={modelName}>{modelName}</option>))
                  : <option value="">אין מודלים זמינים</option>}
              </select>
              <span className="text-[11px] text-slate-400">נבחר כאן — בלי להיכנס להגדרות</span>
            </div>
            <textarea
              className="min-h-[150px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100/70"
              placeholder="למשל: בצע T-test עבור שביעות רצון לפי מגדר, עם הסבר קצר בבחירת הפרוצדורה"
              value={request}
              onChange={(event) => setRequest(event.target.value)}
            />
            {suggestions.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-700">הצעות חכמות לפי המטא-דאטה</div>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                      onClick={() => setRequest(suggestion.prompt)}
                    >
                      {suggestion.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <details className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
            <summary className="cursor-pointer text-lg font-bold text-slate-900">איך זה עובד והרצה ב-SPSS</summary>
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-700">
                פנימית כל עמודה מקבלת token יציב (VAR_n) שמאפשר ל-WordFlow לאמת שה-AI לא ממציא משתנים, ואז הסינטקס חוזר לשמות המשתנים שלך לפני תצוגה או ייצוא.
              </div>
              <ol className="space-y-3 pr-5 text-sm leading-7 text-slate-600 list-decimal">
                <li>פתח את קובץ הנתונים שלך ב-SPSS וודא ששמות המשתנים תקינים.</li>
                <li>העתק את ה-master syntax או הורד קובץ .sps ופתח אותו ב-Syntax Editor של SPSS.</li>
                <li>הרץ את הבלוקים לפי הסדר ובדוק את Output Viewer עבור טבלאות, boxplots או שגיאות.</li>
              </ol>
            </div>
          </details>

          <details className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
            <summary className="cursor-pointer text-lg font-bold text-slate-900">סייר משתנים ופעולות מהירות</summary>
            <div className="mt-4 grid gap-3">
              {analysis.columns.map((column) => {
                const availableActions = SPSS_QUICK_ACTIONS
                  .map((action) => getQuickActionState({ actionId: action.id, column }))
                  .filter((actionState) => actionState.available && actionState.action);

                return (
                  <div key={column.token} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-base font-bold text-slate-900 break-words">{column.originalName}</div>
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                          <span className="rounded-full bg-white px-2.5 py-1 font-bold text-slate-700">{column.token}</span>
                          <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-600">{column.typeLabel}</span>
                          <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-600">{column.measurementLabel}</span>
                        </div>
                        {column.outputName !== column.originalName && (
                          <div className="mt-2 text-xs text-slate-500">שם SPSS בטוח: {column.outputName}</div>
                        )}
                        <div className="mt-2 text-xs text-slate-500">
                          {column.distinctCount.toLocaleString('he-IL')} ערכים שונים · {column.missingCount.toLocaleString('he-IL')} חסרים
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {availableActions.length ? availableActions.map((actionState) => (
                          <div key={`${column.token}-${actionState.action.id}`} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1.5">
                            <button
                              type="button"
                              className={`rounded-full px-2 py-1 text-xs font-semibold transition ${actionState.action.destructive ? 'text-amber-700 hover:bg-amber-50' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'}`}
                              onClick={() => onQuickAction(actionState.action.id, column)}
                            >
                              {actionState.action.label}
                            </button>
                            {actionState.warningLabel && (
                              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-700">{actionState.warningLabel}</span>
                            )}
                          </div>
                        )) : (
                          <span className="text-xs leading-6 text-slate-500">אין פעולות מהירות תקפות לטיפוס של העמודה הזו.</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        </aside>

        <section className="min-h-0 overflow-y-auto px-5 py-5 md:px-6 md:py-6 space-y-5">
          <div className={`rounded-[28px] border px-5 py-4 text-sm leading-7 shadow-sm ${statusToneClass}`}>
            {notice.text}
          </div>

          <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              className={`rounded-full px-4 py-2 text-xs font-bold transition ${studioView === 'syntax' ? 'bg-[#0066cc] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              onClick={() => setStudioView('syntax')}
            >
              סטודיו Syntax
            </button>
            <button
              type="button"
              className={`rounded-full px-4 py-2 text-xs font-bold transition ${studioView === 'tutor' ? 'bg-[#0066cc] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              onClick={() => setStudioView('tutor')}
            >
              מדריך ושיחה
            </button>
          </div>

          {studioView === 'tutor' && (
            <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm flex min-h-[620px] flex-col">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-slate-900">מדריך SPSS</div>
                  <div className="mt-1 text-sm text-slate-500">
                    שאל איך עושים משהו ב-SPSS (תפריטים + syntax), מתי להשתמש בכל מבחן, או הדבק פלט וקבל פירוש. השיחה זוכרת את הדאטה והקשר.
                  </div>
                </div>
                {chatMessages.length > 0 && (
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-rose-200 hover:text-rose-700"
                    onClick={() => { setChatMessages([]); setChatInput(''); setOutputDraft(''); }}
                  >
                    נקה שיחה
                  </button>
                )}
              </div>

              <div className="mt-4 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-4">
                {chatMessages.length ? chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-2xl border px-4 py-3 text-sm leading-7 ${
                      message.role === 'user'
                        ? 'border-blue-100 bg-blue-50 text-slate-800'
                        : message.kind === 'error'
                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : 'border-slate-200 bg-white text-slate-800'
                    }`}
                  >
                    <div className="mb-1 text-[11px] font-bold text-slate-400">
                      {message.role === 'user' ? 'אתה' : (message.kind === 'chart' ? 'גרף' : message.kind === 'repair' ? 'תיקון קוד' : 'מדריך SPSS')}
                      {message.providerId ? ` · ${message.providerId}` : ''}
                    </div>
                    {message.kind === 'repair' && message.syntax ? (
                      <div className="flex flex-col gap-2">
                        <div className="whitespace-pre-wrap break-words">{message.text}</div>
                        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[12px] leading-6 text-slate-800">{message.syntax}</pre>
                        <button
                          type="button"
                          className="self-start text-xs font-bold text-blue-700 hover:underline"
                          onClick={() => handleCopy(message.syntax, 'הקוד המתוקן הועתק ללוח.')}
                        >
                          העתק קוד מתוקן
                        </button>
                      </div>
                    ) : message.kind === 'chart' && message.dataUrl ? (
                      <div className="flex flex-col gap-2">
                        {message.chartTitle && <div className="text-sm font-bold text-slate-700">{message.chartTitle}</div>}
                        <img
                          src={message.dataUrl}
                          alt={message.chartAlt || 'תרשים'}
                          draggable
                          className="w-full max-w-[520px] rounded-xl border border-slate-200 bg-white"
                        />
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            className="text-xs font-bold text-blue-700 hover:underline"
                            onClick={() => handleDownloadChart(message.dataUrl, message.chartTitle)}
                          >
                            ⬇ הורד PNG
                          </button>
                          {message.engine === 'ai' && <span className="text-[11px] text-amber-600">המחשה — לא מדויק מספרית</span>}
                        </div>
                        {message.text && <div className="text-[11px] text-slate-400">{message.text}</div>}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap break-words">{message.text}</div>
                    )}
                  </div>
                )) : (
                  <div className="flex h-full items-center justify-center px-6 py-10 text-center text-sm leading-7 text-slate-500">
                    התחל בשאלה כמו "מתי משתמשים ב-ANOVA ולא ב-T-test?" או "איך מריצים מהימנות לסולם?", או עבור ל״פירוש פלט״ והדבק טבלה מ-SPSS.
                  </div>
                )}
                {chatBusy && (
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">חושב...</div>
                )}
              </div>

              <div className="mt-4 inline-flex self-start rounded-full border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${chatInputMode === 'ask' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  onClick={() => setChatInputMode('ask')}
                >
                  שאלה
                </button>
                <button
                  type="button"
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${chatInputMode === 'output' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  onClick={() => setChatInputMode('output')}
                >
                  פירוש פלט
                </button>
              </div>

              {chatInputMode === 'output' && (
                <textarea
                  className="mt-3 min-h-[120px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-[12px] leading-6 text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100/70"
                  placeholder="הדבק כאן את ה-Output מ-SPSS: טבלה לפירוש/גרף, או הודעת שגיאה (Error # / Warning #) ולחץ ‏🛠 תקן קוד."
                  value={outputDraft}
                  onChange={(event) => setOutputDraft(event.target.value)}
                />
              )}

              <div className="mt-3 flex items-end gap-2">
                <textarea
                  className="min-h-[52px] flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100/70"
                  placeholder={chatInputMode === 'output' ? 'שאלה ממוקדת על הפלט (לא חובה).' : 'כתוב שאלה על SPSS...'}
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey && chatInputMode === 'ask') {
                      event.preventDefault();
                      onSendGuidance();
                    }
                  }}
                />
                {chatInputMode === 'output' && (
                  <button
                    type="button"
                    className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${chatBusy || !outputDraft.trim() || !masterSyntax.trim() ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'border border-amber-200 bg-white text-amber-700 hover:bg-amber-50'}`}
                    onClick={onRepairFromError}
                    disabled={chatBusy || !outputDraft.trim() || !masterSyntax.trim()}
                    title="הדבק את שגיאת ה-Output מ-SPSS ותקן את ה-master syntax אוטומטית"
                  >
                    🛠 תקן קוד
                  </button>
                )}
                {chatInputMode === 'output' && (
                  <button
                    type="button"
                    className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${chatBusy || !outputDraft.trim() ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'border border-blue-200 bg-white text-blue-700 hover:bg-blue-50'}`}
                    onClick={onGenerateChart}
                    disabled={chatBusy || !outputDraft.trim()}
                    title="חלץ את המספרים מהפלט וצור תרשים מדויק"
                  >
                    📈 צור גרף
                  </button>
                )}
                <button
                  type="button"
                  className={`rounded-2xl px-4 py-3 text-sm font-semibold text-white transition ${chatBusy ? 'cursor-wait bg-slate-300' : 'bg-[#0066cc] hover:bg-blue-700'}`}
                  onClick={chatInputMode === 'output' ? onInterpretOutput : onSendGuidance}
                  disabled={chatBusy || (chatInputMode === 'output' ? !outputDraft.trim() : !chatInput.trim())}
                >
                  {chatBusy ? '...' : (chatInputMode === 'output' ? 'פרש' : 'שלח')}
                </button>
              </div>
            </div>
          )}

          {studioView === 'syntax' && guidance && (
            <div className="rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-5 shadow-sm text-sm leading-7 text-amber-900">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-base font-bold">הבקשה נעצרה לפני כתיבה ל-syntax</div>
                  <div className="mt-2 max-w-3xl text-sm leading-7 text-amber-800">{guidance}</div>
                  <div className="mt-2 text-xs font-semibold text-amber-700">ההודעה נשארת נפרדת ולא נכנסת ל-master syntax או לרצף העבודה.</div>
                  {lastRejectedRequest && (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-white/70 px-4 py-3 text-xs leading-6 text-amber-800">
                      <div className="font-bold">הבקשה שלא נשמרה: {lastRejectedRequest.title}</div>
                      {lastRejectedRequest.tokenizedRequest && (
                        <details className="mt-2">
                          <summary className="cursor-pointer font-semibold">פרטים טכניים</summary>
                          <div className="mt-2">בקשה טוקניזית: {lastRejectedRequest.tokenizedRequest}</div>
                        </details>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="rounded-full border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                  onClick={() => {
                    setGuidance('');
                    setLastRejectedRequest(null);
                  }}
                >
                  סגור
                </button>
              </div>
            </div>
          )}

          {studioView === 'syntax' && (
          <>
          <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm flex min-h-[620px] flex-col">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-lg font-bold text-slate-900">{activeSyntaxTitle}</div>
                <div className="mt-1 text-sm text-slate-500">
                  {syntaxView === 'master'
                    ? 'זה הקובץ העדכני להרצה: כל הבלוקים התקפים מצטברים כאן לפי הסדר.'
                    : 'תצוגת בלוק יחיד מתוך הרצף. להורדה מלאה עבור SPSS עבור ל-Master.'}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${syntaxView === 'master' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                    onClick={() => setSyntaxView('master')}
                  >
                    Master
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${syntaxView === 'block' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                    onClick={() => setSyntaxView('block')}
                    disabled={!selectedBlock}
                  >
                    בלוק נבחר
                  </button>
                </div>
                <button
                  type="button"
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => handleCopy(activeSyntaxContent, syntaxView === 'master' ? 'ה-master syntax הועתק ללוח.' : 'הבלוק הנבחר הועתק ללוח.')}
                  disabled={!activeSyntaxContent}
                >
                  העתק
                </button>
                <button
                  type="button"
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => handleDownloadSyntax(activeSyntaxContent, activeSyntaxFileName)}
                  disabled={!activeSyntaxContent}
                >
                  הורד .sps
                </button>
                <button
                  type="button"
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-rose-200 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={removeLastBlock}
                  disabled={!blocks.length}
                >
                  הסר אחרון
                </button>
              </div>
            </div>

            {selectedBlock && syntaxView === 'block' && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px]">
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{selectedBlock.title}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{sourceLabelMap[selectedBlock.source] || selectedBlock.source}</span>
                {selectedBlock.providerId && <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{selectedBlock.providerId}</span>}
                {selectedBlock.model && <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{selectedBlock.model}</span>}
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{formatTime(selectedBlock.createdAt)}</span>
              </div>
            )}

            {selectedBlock?.tokenizedRequest && syntaxView === 'block' && (
              <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-600">
                <summary className="cursor-pointer font-semibold text-slate-700">פרטים טכניים של הבלוק הנבחר</summary>
                <div className="mt-3">בקשה טוקניזית שנשלחה ל-AI: {selectedBlock.tokenizedRequest}</div>
              </details>
            )}

            {lastRejectedRequest && activeSyntaxContent && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-6 text-amber-800">
                ה-syntax שמוצג כאן הוא מהבלוקים התקפים הקודמים. הבקשה האחרונה נעצרה ולא נוספה לקובץ הזה.
              </div>
            )}

            {activeSyntaxContent ? (
              <>
                <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-semibold leading-6 text-blue-700">
                  שם הקובץ הבא: {activeSyntaxFileName}
                </div>
                <textarea
                  readOnly
                  value={activeSyntaxContent}
                  className="mt-4 flex-1 min-h-[460px] w-full rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 font-mono text-[13px] leading-6 text-slate-100 outline-none"
                />
              </>
            ) : (
              <div className="mt-4 flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm leading-7 text-slate-500">
                עדיין לא נוצר syntax תקף. אפשר להתחיל מפעולה מהירה מתאימה, או לכתוב בקשה חופשית בעברית.
              </div>
            )}
          </div>

          <details className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
            <summary className="cursor-pointer text-lg font-bold text-slate-900">רצף עבודה אחרון{blocks.length ? ` (${blocks.length})` : ''}</summary>
            <div className="mt-4 space-y-3">
              {blocks.length ? blocks.slice().reverse().map((block) => (
                <button
                  key={block.id}
                  type="button"
                  className={`w-full rounded-2xl border px-4 py-3 text-right transition ${block.id === lastBlockId ? 'border-blue-300 bg-blue-50/70' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}
                  onClick={() => {
                    setLastBlockId(block.id);
                    setSyntaxView('block');
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-slate-800">{block.title}</div>
                    <div className="text-[11px] text-slate-500">{formatTime(block.createdAt)}</div>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">{sourceLabelMap[block.source] || block.source}{block.providerId ? ` · ${block.providerId}` : ''}{block.model ? ` · ${block.model}` : ''}</div>
                </button>
              )) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-sm text-slate-500">
                  היסטוריית blocks תופיע כאן רק אחרי שתיווצר תוצאה תקפה.
                </div>
              )}
            </div>
          </details>
          </>
          )}
        </section>
      </div>
    </div>
  );
}
