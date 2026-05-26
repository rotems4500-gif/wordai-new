import React from 'react';
import {
  SPSS_QUICK_ACTIONS,
  buildQuickActionSyntax,
  buildSmartSuggestions,
  generateSpssSyntax,
  getGuardrailGuidanceMessage,
  getQuickActionState,
  isGuardrailSyntaxResponse,
  parseCsvText,
} from './services/spssSyntaxService';

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
  'quick-action': 'פעולה מהירה',
  guardrail: 'הכוונה',
};

const normalizeBlockTitle = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const buildMasterSyntax = (blocks = []) => blocks
  .map((block, index) => [
    `* --- Block ${index + 1}: ${normalizeBlockTitle(block.title) || 'SPSS block'} | ${formatTime(block.createdAt)} ---.`,
    String(block.syntax || '').trim(),
  ].filter(Boolean).join('\n'))
  .join('\n\n')
  .trim();

const downloadTextFile = (content = '', fileName = 'wordflow-spss-syntax.sps') => {
  const blob = new Blob([String(content || '')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

const noticeToneClassMap = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  error: 'border-rose-200 bg-rose-50 text-rose-700',
  info: 'border-slate-200 bg-slate-50 text-slate-700',
};

const SUPPORTED_DATA_FILE_ACCEPT = '.csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,.tsv,text/tab-separated-values,.txt,text/plain,.sav,application/x-spss-sav';
const TEXT_TABULAR_EXTENSIONS = new Set(['csv', 'tsv', 'txt']);
const EXCEL_TABULAR_EXTENSIONS = new Set(['xlsx', 'xls']);

const getFileExtension = (fileName = '') => {
  const cleanName = String(fileName || '').trim().toLowerCase();
  const match = cleanName.match(/\.([^.]+)$/);
  return match?.[1] || '';
};

const readExcelFileAsCsvText = async (file) => {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const firstSheetName = workbook.SheetNames?.[0] || '';
  if (!firstSheetName) throw new Error('לא נמצא גיליון בקובץ Excel.');

  const worksheet = workbook.Sheets[firstSheetName];
  const csvText = XLSX.utils.sheet_to_csv(worksheet, { blankrows: false });
  if (!String(csvText || '').trim()) throw new Error('הגיליון הראשון בקובץ Excel ריק.');
  return csvText;
};

const readTabularUploadAsText = async (file) => {
  const extension = getFileExtension(file?.name);
  const mimeType = String(file?.type || '').toLowerCase();

  if (extension === 'sav') {
    throw new Error('קובצי SAV אינם נתמכים כרגע. יש לייצא את הקובץ מ-SPSS ל-CSV או XLSX ואז להעלות אותו שוב.');
  }

  if (TEXT_TABULAR_EXTENSIONS.has(extension) || mimeType.startsWith('text/')) {
    return file.text();
  }

  if (EXCEL_TABULAR_EXTENSIONS.has(extension) || mimeType.includes('spreadsheet') || mimeType === 'application/vnd.ms-excel') {
    return readExcelFileAsCsvText(file);
  }

  throw new Error('סוג הקובץ לא נתמך. אפשר להעלות CSV, XLSX, XLS, TSV או TXT. קובצי SAV דורשים ייצוא קודם ל-CSV או XLSX.');
};

export default function SpssSyntaxStudio() {
  const fileInputRef = React.useRef(null);
  const activeUploadRequestIdRef = React.useRef('');
  const activeSessionIdRef = React.useRef('');
  const activeGenerateRequestIdRef = React.useRef('');
  const [analysis, setAnalysis] = React.useState(null);
  const [request, setRequest] = React.useState('');
  const [tutorMode, setTutorMode] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [dragActive, setDragActive] = React.useState(false);
  const [blocks, setBlocks] = React.useState([]);
  const [lastBlockId, setLastBlockId] = React.useState('');
  const [guidance, setGuidance] = React.useState('');
  const [notice, setNotice] = React.useState({ tone: 'info', text: 'העלה CSV, Excel, TSV או TXT כדי להתחיל לבנות syntax ל-SPSS.' });

  const suggestions = React.useMemo(() => buildSmartSuggestions(analysis), [analysis]);
  const masterSyntax = React.useMemo(() => buildMasterSyntax(blocks), [blocks]);
  const lastBlock = React.useMemo(() => blocks.find((block) => block.id === lastBlockId) || blocks[blocks.length - 1] || null, [blocks, lastBlockId]);
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
    setRequest('');
    setGuidance('');
    setNotice({
      tone: 'success',
      text: `נטען ${nextAnalysis.fileName || 'קובץ נתונים'} עם ${nextAnalysis.rowCount.toLocaleString('he-IL')} שורות ו-${nextAnalysis.columnCount} עמודות. רק metadata טוקניזי יישלח ל-AI.`,
    });
  }, []);

  const handleDataFile = React.useCallback(async (file) => {
    if (!file) return;
    const uploadRequestId = createLocalId();
    activeUploadRequestIdRef.current = uploadRequestId;
    activeGenerateRequestIdRef.current = '';
    setLoading(false);

    try {
      const content = await readTabularUploadAsText(file);
      if (activeUploadRequestIdRef.current !== uploadRequestId) return;

      const nextAnalysis = parseCsvText(content, { fileName: file.name });
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
      setNotice({ tone: 'error', text: guidanceMessage });
      return;
    }

    const syntax = buildQuickActionSyntax({ actionId, column, tutorMode });
    if (isGuardrailSyntaxResponse(syntax)) {
      const guidanceMessage = getGuardrailGuidanceMessage(syntax);
      setGuidance(guidanceMessage);
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
      setNotice({ tone: 'error', text: guidanceMessage });
      return;
    }
    if (!request.trim()) {
      const guidanceMessage = 'כתוב בקשה קצרה בעברית כדי לייצר syntax.';
      setGuidance(guidanceMessage);
      setNotice({ tone: 'error', text: guidanceMessage });
      return;
    }

    const currentAnalysis = analysis;
    const requestText = request.trim();
    const sessionId = String(currentAnalysis?.sessionId || '');
    const generateRequestId = createLocalId();
    activeGenerateRequestIdRef.current = generateRequestId;

    setLoading(true);
    setGuidance('');
    setNotice({ tone: 'info', text: 'מייצר syntax דרך ה-provider הפעיל, עם metadata טוקניזי בלבד...' });
    try {
      const result = await generateSpssSyntax({ analysis: currentAnalysis, request: requestText, tutorMode });
      if (
        activeGenerateRequestIdRef.current !== generateRequestId
        || activeSessionIdRef.current !== sessionId
      ) {
        return;
      }

      if (!result.ok) {
        const guidanceMessage = result.guidanceMessage || 'הבקשה נעצרה לפני יצירת syntax כדי למנוע פלט שגוי.';
        setGuidance(guidanceMessage);
        setNotice({ tone: 'error', text: 'לא הוספתי את התוצאה ל-master syntax כי ה-guardrail עצר את הבקשה.' });
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
        text: 'נוסף בלוק syntax חדש ל-master syntax.',
      });
    } catch (error) {
      if (
        activeGenerateRequestIdRef.current !== generateRequestId
        || activeSessionIdRef.current !== sessionId
      ) {
        return;
      }

      setGuidance('הקריאה ל-provider נכשלה. אפשר לנסח מחדש את הבקשה או לבדוק את הגדרות ה-AI.');
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'יצירת syntax נכשלה.' });
    } finally {
      if (
        activeGenerateRequestIdRef.current === generateRequestId
        && activeSessionIdRef.current === sessionId
      ) {
        setLoading(false);
      }
    }
  }, [analysis, appendBlock, request, tutorMode]);

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

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
                  <div className="text-sm font-bold text-slate-900">פרטיות כברירת מחדל</div>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    WordFlow מנתח מקומית שמות עמודות, טיפוסים, וחלון inference קטן בלבד. ל-AI נשלח רק metadata טוקניזי, לא כל הדאטה שלך.
                  </p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
                  <div className="text-sm font-bold text-slate-900">מה להכין מראש</div>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    ודא שהשורה הראשונה בקובץ היא שמות משתנים ברורים. אם יש קובץ SAV, ייצא אותו קודם ל-CSV או XLSX מתוך SPSS.
                  </p>
                </div>
              </div>
            </section>

            <aside className="space-y-4">
              <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
                <div className="text-lg font-bold text-slate-900">איך מייצאים נתונים מ-SPSS?</div>
                <ol className="mt-4 space-y-3 pr-5 text-sm leading-7 text-slate-600 list-decimal">
                  <li>פתח את קובץ ה-SAV ב-SPSS.</li>
                  <li>בחר File ואז Save As.</li>
                  <li>בחר CSV (*.csv) או Excel (*.xlsx) ושמור עם שורת כותרות של שמות המשתנים.</li>
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
                רק metadata טוקניזי נשלח ל-AI. שורות הדאטה המלאות לא נשלחות החוצה.
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-bold text-slate-900">מה תרצה לעשות עם הדאטה?</div>
                <div className="mt-1 text-sm text-slate-500">כתוב בעברית חופשית. אם תזכיר שמות עמודות, WordFlow יטוקנז אותם לפני השליחה.</div>
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
            <summary className="cursor-pointer text-lg font-bold text-slate-900">פרטיות, טוקניזציה והרצה ב-SPSS</summary>
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-700">
                העמודות עוברות טוקניזציה ל-VAR_n לפני שליחה ל-AI, ואז הסינטקס חוזר לשמות המשתנים הבטוחים שלך לפני תצוגה או ייצוא.
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

          {guidance && (
            <div className="rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-5 shadow-sm text-sm leading-7 text-amber-900">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-base font-bold">הבקשה נעצרה לפני כתיבה ל-syntax</div>
                  <div className="mt-2 max-w-3xl text-sm leading-7 text-amber-800">{guidance}</div>
                  <div className="mt-2 text-xs font-semibold text-amber-700">ההודעה נשארת נפרדת ולא נכנסת ל-master syntax או ל-history.</div>
                </div>
                <button
                  type="button"
                  className="rounded-full border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                  onClick={() => setGuidance('')}
                >
                  סגור
                </button>
              </div>
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.92fr),minmax(0,1.08fr)]">
            <div className="space-y-5">
              <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-bold text-slate-900">התוצאה האחרונה</div>
                    <div className="mt-1 text-sm text-slate-500">רק בלוקים תקפים נכנסים לכאן. guardrails נשארים כהכוונה נפרדת.</div>
                  </div>
                  {lastBlock && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
                        onClick={() => handleCopy(lastBlock.syntax, 'הבלוק האחרון הועתק ללוח.')}
                      >
                        העתק
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
                        onClick={() => downloadTextFile(lastBlock.syntax, 'wordflow-last-block.sps')}
                      >
                        הורד .sps
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-rose-200 hover:text-rose-700"
                        onClick={removeLastBlock}
                      >
                        הסר בלוק אחרון
                      </button>
                    </div>
                  )}
                </div>

                {lastBlock ? (
                  <div className="mt-4 space-y-4">
                    <div className="flex flex-wrap items-center gap-2 text-[12px]">
                      <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{lastBlock.title}</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{sourceLabelMap[lastBlock.source] || lastBlock.source}</span>
                      {lastBlock.providerId && <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{lastBlock.providerId}</span>}
                      {lastBlock.model && <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{lastBlock.model}</span>}
                      <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{formatTime(lastBlock.createdAt)}</span>
                    </div>
                    {lastBlock.tokenizedRequest && (
                      <details className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-600">
                        <summary className="cursor-pointer font-semibold text-slate-700">פרטים טכניים של הבקשה האחרונה</summary>
                        <div className="mt-3">בקשה טוקניזית שנשלחה ל-AI: {lastBlock.tokenizedRequest}</div>
                      </details>
                    )}
                    <textarea
                      readOnly
                      value={lastBlock.syntax}
                      className="min-h-[280px] w-full rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 font-mono text-[13px] leading-6 text-slate-100 outline-none"
                    />
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-sm leading-7 text-slate-500">
                    עדיין לא נוצר בלוק syntax תקף. אפשר להתחיל מפעולה מהירה מתאימה, או לכתוב בקשה חופשית בעברית.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm flex min-h-[480px] flex-col">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-slate-900">Master syntax</div>
                  <div className="mt-1 text-sm text-slate-500">כל הבלוקים שנוצרו מצטברים כאן לפי הסדר.</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
                    onClick={() => handleCopy(masterSyntax, 'ה-master syntax הועתק ללוח.')}
                    disabled={!masterSyntax}
                  >
                    העתק הכל
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
                    onClick={() => downloadTextFile(masterSyntax, 'wordflow-master-syntax.sps')}
                    disabled={!masterSyntax}
                  >
                    הורד .sps
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-rose-200 hover:text-rose-700"
                    onClick={removeLastBlock}
                    disabled={!masterSyntax}
                  >
                    הסר בלוק אחרון
                  </button>
                </div>
              </div>

              {masterSyntax ? (
                <textarea
                  readOnly
                  value={masterSyntax}
                  className="mt-4 flex-1 min-h-[420px] w-full rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 font-mono text-[13px] leading-6 text-slate-100 outline-none"
                />
              ) : (
                <div className="mt-4 flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm leading-7 text-slate-500">
                  ברגע שתוסיף בלוק ראשון, master syntax יצטבר כאן ויהיה מוכן להעתקה או להורדה כקובץ .sps.
                </div>
              )}
            </div>
          </div>

          <details className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
            <summary className="cursor-pointer text-lg font-bold text-slate-900">רצף עבודה אחרון{blocks.length ? ` (${blocks.length})` : ''}</summary>
            <div className="mt-4 space-y-3">
              {blocks.length ? blocks.slice().reverse().map((block) => (
                <button
                  key={block.id}
                  type="button"
                  className={`w-full rounded-2xl border px-4 py-3 text-right transition ${block.id === lastBlockId ? 'border-blue-300 bg-blue-50/70' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}
                  onClick={() => setLastBlockId(block.id)}
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
        </section>
      </div>
    </div>
  );
}
