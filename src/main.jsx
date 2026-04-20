import React from 'react';
import ReactDOM from 'react-dom/client';
import '../tailwind.css';
import DocumentEditor from './DocumentEditor';
import Ribbon from './Ribbon';
import AiSidebar from './AiSidebar';
import TopBar from './TopBar';
import FileMenu from './FileMenu';
import MagicWand from './MagicWand';
import StartScreen from './StartScreen';
import { getShortcutsConfig, getAssistantBehavior, getWordPreferences, matchShortcut, getAgentDebugLogs, getLatestAgentRunSummary, getWorkspaceAutomation, hydrateProviderConfigFromDisk } from './services/aiService';
import { buildTemplateSkeleton, generateDocumentFromPrompt, reviseDocumentWithFeedback, saveDocumentHistory, learnFromDocumentDraft } from './services/workspaceLearningService';

const DOCUMENT_STYLE_PRESETS = {
  academic: { label: 'אקדמי', fontFamily: "'Frank Ruhl Libre', 'Times New Roman', serif", fontSize: '12pt', lineHeight: '1.9', padding: '2.8cm', maxWidth: '21cm', background: '#fffefc', textAlign: 'right' },
  legal: { label: 'משפטי', fontFamily: "'Times New Roman', 'Miriam Libre', serif", fontSize: '12.5pt', lineHeight: '2', padding: '2.6cm 2.9cm', maxWidth: '21cm', background: '#fffefe', textAlign: 'justify' },
  business: { label: 'עסקי', fontFamily: "'Segoe UI', 'Assistant', sans-serif", fontSize: '11.5pt', lineHeight: '1.65', padding: '2.4cm', maxWidth: '21cm', background: '#ffffff', textAlign: 'right' },
  presentation: { label: 'מצגת', fontFamily: "'Heebo', 'Segoe UI', sans-serif", fontSize: '15pt', lineHeight: '1.5', padding: '1.8cm', maxWidth: '25cm', background: 'linear-gradient(180deg,#ffffff 0%,#f8fbff 100%)', textAlign: 'center' },
};

const buildLiveGenerationShell = (promptText = '') => `
  <div style="border:1px solid #BFDBFE;background:#EFF6FF;padding:16px 18px;border-radius:14px;margin-bottom:18px;">
    <p><strong>מכין את המסמך בלייב...</strong></p>
    <p>אפשר כבר לראות את שלבי העבודה בזמן אמת. התוכן המלא יופיע כאן אוטומטית בעוד רגע.</p>
  </div>
  <h1>${String(promptText || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</h1>
  <p>טוען מבנה, מקורות וניסוח...</p>
`;

const FEEDBACK_OPTION_GROUPS = [
  {
    title: 'לאקדמיה',
    options: [
      'לחדד שפה אקדמית ורשמית יותר',
      'לשפר את מבנה הפרקים והכותרות',
      'לחזק נימוקים, דיון ומסקנות',
      'להוסיף מקום למקורות, אסמכתאות וציטוטים',
    ],
  },
  {
    title: 'לשימוש חופשי',
    options: [
      'לקצר ולתמצת את המסמך',
      'להרחיב ולהעמיק את התוכן',
      'להפוך את הסגנון לברור ופשוט יותר',
      'לתקן ניסוח, שגיאות וזרימה',
    ],
  },
];

const DEFAULT_FEEDBACK_SURVEY = {
  open: false,
  phase: 'question',
  prompt: '',
  templateId: 'blank',
  selectedOptions: [],
  freeText: '',
  usedFallback: false,
  submitting: false,
};

const DEFAULT_INPUT_DIALOG = {
  open: false,
  title: '',
  description: '',
  fields: [],
  values: {},
  confirmLabel: 'אישור',
  resolve: null,
};

function App() {
  // ביטול טיימר הפולבק לאחר שReact עשה commit ראשון לDOM
  React.useEffect(() => {
    if (window.__mountTimer) clearTimeout(window.__mountTimer);
    hydrateProviderConfigFromDisk().catch(() => {});
  }, []);

  const [editor, setEditor] = React.useState(null);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [wordCount, setWordCount] = React.useState(0);
  const [pageCount, setPageCount] = React.useState(1);
  const [zoom, setZoom] = React.useState(100);
  const [viewMode, setViewMode] = React.useState('print');
  const [fileMenuOpen, setFileMenuOpen] = React.useState(false);
  const [fileMenuTargetTab, setFileMenuTargetTab] = React.useState(null);
  const [formatPainterActive, setFormatPainterActive] = React.useState(false);
  const [selectedText, setSelectedText] = React.useState('');
  const [currentBlockText, setCurrentBlockText] = React.useState('');
  const [trackChanges, setTrackChanges] = React.useState(false);
  const [shortcuts, setShortcuts] = React.useState(getShortcutsConfig());
  const [assistantBehavior, setAssistantBehavior] = React.useState(getAssistantBehavior());
  const [wordPreferences, setWordPreferences] = React.useState(getWordPreferences());
  const [documentStyle, setDocumentStyle] = React.useState(() => localStorage.getItem('wordai_document_style') || 'academic');
  const [activeTemplateId, setActiveTemplateId] = React.useState(() => localStorage.getItem('wordai_active_template') || 'blank');
  const [showStartScreen, setShowStartScreen] = React.useState(false);
  const [currentFilePath, setCurrentFilePath] = React.useState('');
  const [lastEditorActivityAt, setLastEditorActivityAt] = React.useState(Date.now());
  const [lastManualStyleLearningAt, setLastManualStyleLearningAt] = React.useState(0);
  const [liveGeneration, setLiveGeneration] = React.useState({
    active: false,
    state: 'idle',
    prompt: '',
    summary: getLatestAgentRunSummary(getWorkspaceAutomation()),
    logs: getAgentDebugLogs().slice(-5).reverse(),
  });
  const [feedbackSurvey, setFeedbackSurvey] = React.useState({ ...DEFAULT_FEEDBACK_SURVEY });
  const [inputDialog, setInputDialog] = React.useState({ ...DEFAULT_INPUT_DIALOG });
  const [assistantTrigger, setAssistantTrigger] = React.useState('manual');
  const [sidebarCompact, setSidebarCompact] = React.useState(() => (typeof window !== 'undefined' ? window.innerWidth < 1180 : false));
  const pendingImportRef = React.useRef(null);
  const [activeFormats, setActiveFormats] = React.useState({
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    bulletList: false,
    orderedList: false,
    alignRight: true,
    alignCenter: false,
    alignLeft: false,
    alignJustify: false,
    dir: 'rtl',
    fontFamily: 'Alef',
    fontSize: '12',
  });
  // פונקציות מברשת עיצוב מה-DocumentEditor
  const formatPainterRef = React.useRef({ copyFormat: null, applyFormat: null });

  // סניטיזציה פשוטה נגד XSS ל-HTML שמוזרק לעורך
  const escHtml = (txt) => String(txt)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const normalizeFontSizeValue = React.useCallback((rawValue) => {
    const raw = String(rawValue || '').trim().toLowerCase();
    const numeric = parseFloat(raw) || 12;
    if (raw.endsWith('px')) return String(Math.max(8, Math.round(numeric * 0.75)));
    return String(Math.max(8, Math.round(numeric)));
  }, []);

  const applyDocumentStyleToEditor = React.useCallback((styleId, currentEditor = editor) => {
    if (!currentEditor?.view?.dom) return;
    const preset = DOCUMENT_STYLE_PRESETS[styleId] || DOCUMENT_STYLE_PRESETS.academic;
    const dom = currentEditor.view.dom;
    let styleOverrides = {};
    try {
      styleOverrides = JSON.parse(localStorage.getItem('wordflow_style_overrides') || '{}');
    } catch {
      styleOverrides = {};
    }
    const currentOverride = styleOverrides?.[styleId] || {};
    const savedFont = String(wordPreferences.defaultFontFamily || localStorage.getItem('default-font') || '').trim();
    const savedSizeRaw = String(wordPreferences.defaultFontSize || localStorage.getItem('default-size') || '').trim();
    const savedSize = savedSizeRaw && /px|pt|em|rem$/i.test(savedSizeRaw) ? savedSizeRaw : (savedSizeRaw ? `${savedSizeRaw}pt` : '');
    dom.setAttribute('data-doc-style', styleId);
    dom.style.fontFamily = currentOverride.fontFamily || savedFont || preset.fontFamily;
    dom.style.fontSize = currentOverride.fontSize || savedSize || preset.fontSize;
    dom.style.lineHeight = currentOverride.lineHeight || preset.lineHeight;
    dom.style.padding = dom.dataset.customPadding || preset.padding;
    dom.style.maxWidth = dom.dataset.viewMode === 'print' ? (dom.dataset.customWidth || preset.maxWidth) : dom.style.maxWidth;
    dom.style.background = dom.dataset.customBackground || preset.background;
    dom.style.textAlign = preset.textAlign;
    dom.style.border = dom.dataset.customBorder || dom.style.border;
  }, [editor, wordPreferences]);

  const hasMeaningfulEditorContent = React.useCallback((currentEditor = editor) => {
    if (!currentEditor) return false;
    const html = String(currentEditor.getHTML?.() || '');
    const plain = String(currentEditor.getText?.() || '').trim();
    if (plain.length > 0) return true;
    return /<(img|table|hr|ul|ol|li|blockquote)\b|data-type="page-break"/i.test(html);
  }, [editor]);

  const changeDocumentStyle = React.useCallback((styleId) => {
    const nextStyle = DOCUMENT_STYLE_PRESETS[styleId] ? styleId : 'academic';
    setDocumentStyle(nextStyle);
    localStorage.setItem('wordai_document_style', nextStyle);
    applyDocumentStyleToEditor(nextStyle);
  }, [applyDocumentStyleToEditor]);

  React.useEffect(() => {
    applyDocumentStyleToEditor(documentStyle);
  }, [documentStyle, wordPreferences.defaultFontFamily, wordPreferences.defaultFontSize, applyDocumentStyleToEditor]);

  const focusEditorSoon = React.useCallback((position = 'end') => {
    window.requestAnimationFrame(() => {
      try {
        editor?.chain().focus(position).run();
      } catch {}
    });
  }, [editor]);

  const openExternalLink = React.useCallback((url) => {
    if (!url) return;
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      window.location.href = url;
    }
  }, []);

  const requestInputDialog = React.useCallback((config = {}) => new Promise((resolve) => {
    const fields = Array.isArray(config.fields) ? config.fields : [];
    const nextValues = fields.reduce((acc, field) => {
      acc[field.id] = String(field.value ?? '');
      return acc;
    }, {});

    setInputDialog({
      open: true,
      title: config.title || 'השלם פרטים',
      description: config.description || '',
      fields,
      values: nextValues,
      confirmLabel: config.confirmLabel || 'אישור',
      resolve,
    });
  }), []);

  const closeInputDialog = React.useCallback((result = null) => {
    setInputDialog((prev) => {
      try {
        prev.resolve?.(result);
      } catch {}
      return { ...DEFAULT_INPUT_DIALOG };
    });
  }, []);

  const toggleFeedbackOption = React.useCallback((option) => {
    setFeedbackSurvey((prev) => ({
      ...prev,
      selectedOptions: prev.selectedOptions.includes(option)
        ? prev.selectedOptions.filter((item) => item !== option)
        : [...prev.selectedOptions, option],
    }));
  }, []);

  const submitDocumentFeedback = React.useCallback(async () => {
    const selectedOptions = feedbackSurvey.selectedOptions || [];
    const freeText = String(feedbackSurvey.freeText || '').trim();

    if (!selectedOptions.length && !freeText) {
      alert('בחר לפחות אפשרות אחת או כתוב הערה חופשית.');
      return;
    }

    const feedbackText = [
      'המשתמש ביקש לעדכן את המסמך לפי המשוב הבא:',
      selectedOptions.length ? `נקודות לתיקון:\n- ${selectedOptions.join('\n- ')}` : '',
      freeText ? `בקשה חופשית:\n${freeText}` : '',
    ].filter(Boolean).join('\n\n');

    setFeedbackSurvey((prev) => ({ ...prev, submitting: true }));
    setAssistantTrigger('autopilot');
    setSidebarOpen(true);
    setLiveGeneration({
      active: true,
      state: 'running',
      prompt: 'מנהל הצוות מתקן את המסמך לפי המשוב שלך',
      summary: getLatestAgentRunSummary(getWorkspaceAutomation()),
      logs: getAgentDebugLogs().slice(-5).reverse(),
    });

    try {
      const result = await reviseDocumentWithFeedback({
        existingHtml: editor?.getHTML?.() || '',
        originalPrompt: feedbackSurvey.prompt,
        templateId: feedbackSurvey.templateId || activeTemplateId || 'blank',
        feedback: feedbackText,
        returnMeta: true,
      });

      const revisedHtml = result?.html || editor?.getHTML?.() || '';
      const usedFallback = Boolean(result?.usedFallback);

      if (editor && revisedHtml) {
        editor.commands.setContent(revisedHtml);
      }

      persistLocalCache(revisedHtml);
      saveDocumentHistory({
        title: `${feedbackSurvey.prompt || 'מסמך'} · תיקון לפי משוב`,
        content: revisedHtml,
        templateId: feedbackSurvey.templateId || activeTemplateId || 'blank',
        source: 'feedback-revision',
      });

      setLiveGeneration({
        active: true,
        state: usedFallback ? 'warning' : 'success',
        prompt: usedFallback ? 'נשמרה הגרסה הקודמת כי העדכון לא הושלם במלואו' : 'המסמך עודכן לפי המשוב שלך',
        summary: getLatestAgentRunSummary(getWorkspaceAutomation()),
        logs: getAgentDebugLogs().slice(-5).reverse(),
      });

      setFeedbackSurvey({
        ...DEFAULT_FEEDBACK_SURVEY,
        open: false,
        phase: 'details',
        prompt: feedbackSurvey.prompt,
        templateId: feedbackSurvey.templateId || activeTemplateId || 'blank',
        usedFallback,
      });

      if (usedFallback && result?.errorMessage) {
        alert(`לא הצלחתי ליישם את כל ההערות: ${result.errorMessage}`);
      }
    } catch (error) {
      setFeedbackSurvey((prev) => ({ ...prev, submitting: false }));
      setLiveGeneration({
        active: true,
        state: 'error',
        prompt: 'עדכון המסמך נכשל',
        summary: getLatestAgentRunSummary(getWorkspaceAutomation()),
        logs: getAgentDebugLogs().slice(-5).reverse(),
      });
      alert(error?.message || 'לא הצלחתי לעדכן את המסמך לפי המשוב.');
    }
  }, [feedbackSurvey, editor, activeTemplateId]);

  const updateActiveFormats = React.useCallback((currentEditor) => {
    if (!currentEditor) return;
    const textStyleAttrs = currentEditor.getAttributes('textStyle') || {};
    const rawFontFamily = String(textStyleAttrs.fontFamily || window.getComputedStyle(currentEditor.view.dom).fontFamily || 'Alef');
    const fontFamily = rawFontFamily.split(',')[0].replace(/["']/g, '').trim() || 'Alef';
    const rawFontSize = String(textStyleAttrs.fontSize || window.getComputedStyle(currentEditor.view.dom).fontSize || '12pt');
    const fontSize = normalizeFontSizeValue(rawFontSize);

    setActiveFormats({
      bold: currentEditor.isActive('bold'),
      italic: currentEditor.isActive('italic'),
      underline: currentEditor.isActive('underline'),
      strike: currentEditor.isActive('strike'),
      bulletList: currentEditor.isActive('bulletList'),
      orderedList: currentEditor.isActive('orderedList'),
      alignRight: currentEditor.isActive({ textAlign: 'right' }),
      alignCenter: currentEditor.isActive({ textAlign: 'center' }),
      alignLeft: currentEditor.isActive({ textAlign: 'left' }),
      alignJustify: currentEditor.isActive({ textAlign: 'justify' }),
      dir: currentEditor.getAttributes('paragraph')?.dir || 'rtl',
      fontFamily,
      fontSize,
    });
  }, []);

  React.useEffect(() => {
    const syncLiveGeneration = () => {
      setLiveGeneration((prev) => ({
        ...prev,
        summary: getLatestAgentRunSummary(getWorkspaceAutomation()),
        logs: getAgentDebugLogs().slice(-5).reverse(),
      }));
    };

    syncLiveGeneration();
    window.addEventListener('wordai-agent-logs-updated', syncLiveGeneration);
    return () => window.removeEventListener('wordai-agent-logs-updated', syncLiveGeneration);
  }, []);

  React.useEffect(() => {
    const handler = (e) => {
      if (matchShortcut(e, shortcuts.toggleAssistant)) {
        e.preventDefault();
        setAssistantTrigger('manual');
        setLastEditorActivityAt(Date.now());
        setSidebarOpen(v => !v);
        return;
      }

      if (matchShortcut(e, shortcuts.openFileMenu)) {
        e.preventDefault();
        setFileMenuTargetTab(null);
        setFileMenuOpen(true);
        return;
      }

      if (matchShortcut(e, shortcuts.saveLocal)) {
        e.preventDefault();
        handleCommand('saveLocal');
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [shortcuts, editor]);

  const initializedDocRef = React.useRef(false);

  const openUpdatesPanel = React.useCallback(() => {
    setFileMenuTargetTab('updates');
    setFileMenuOpen(true);
  }, []);

  const handleEditorReady = React.useCallback((ed, helpers) => {
    setEditor(ed);
    updateActiveFormats(ed);
    if (helpers) {
      formatPainterRef.current = helpers;
      setFormatPainterActive(helpers.formatPainterActive);
    }
  }, [updateActiveFormats]);

  // מעקב אחר בחירת טקסט + מצב עיצוב פעיל
  React.useEffect(() => {
    if (!editor) return;
    let frameId = null;

    const syncState = (includePages = false) => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const { from, to, empty } = editor.state.selection;
        setSelectedText(empty ? '' : editor.state.doc.textBetween(from, to, ' '));
        setCurrentBlockText(editor.state.selection.$from.parent?.textContent || '');
        setLastEditorActivityAt(Date.now());
        if (includePages) {
          let markers = 0;
          editor.state.doc.descendants((node) => {
            if (node.type?.name === 'pageBreak') markers += 1;
          });
          setPageCount(markers + 1);
        }
        updateActiveFormats(editor);
      });
    };

    const handleSelection = () => syncState(false);
    const handleUpdate = () => syncState(true);
    const markManualEdit = () => setLastManualStyleLearningAt(Date.now());
    const dom = editor.view?.dom;

    syncState(true);
    editor.on('selectionUpdate', handleSelection);
    editor.on('update', handleUpdate);
    dom?.addEventListener('input', markManualEdit);
    dom?.addEventListener('paste', markManualEdit);
    dom?.addEventListener('drop', markManualEdit);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      editor.off('selectionUpdate', handleSelection);
      editor.off('update', handleUpdate);
      dom?.removeEventListener('input', markManualEdit);
      dom?.removeEventListener('paste', markManualEdit);
      dom?.removeEventListener('drop', markManualEdit);
    };
  }, [editor, updateActiveFormats]);

  React.useEffect(() => {
    if (editor) applyDocumentStyleToEditor(documentStyle, editor);
  }, [editor, documentStyle, applyDocumentStyleToEditor]);

  React.useEffect(() => {
    if (!editor || initializedDocRef.current) return;
    const savedDraft = wordPreferences.keepLastAutosavedVersion === false
      ? localStorage.getItem('wordai_document')
      : (localStorage.getItem('wordai_document_autosave') || localStorage.getItem('wordai_document'));

    if (savedDraft && editor.isEmpty) {
      editor.commands.setContent(savedDraft);
      focusEditorSoon('end');
    } else {
      setShowStartScreen(false);
      focusEditorSoon('start');
    }
    initializedDocRef.current = true;
  }, [editor, wordPreferences, focusEditorSoon]);

  React.useEffect(() => {
    if (!editor) return;
    const page = document.querySelector('.ProseMirror');
    if (!page) return;
    page.setAttribute('spellcheck', wordPreferences.checkSpellingAsYouType === false ? 'false' : 'true');
    page.setAttribute('autocorrect', 'on');
    page.setAttribute('autocomplete', 'on');
  }, [editor, wordPreferences]);

  React.useEffect(() => {
    if (wordPreferences.keepLastAutosavedVersion === false) {
      localStorage.removeItem('wordai_document_autosave');
      localStorage.removeItem('wordai_document_autosave_at');
    }
  }, [wordPreferences.keepLastAutosavedVersion]);

  React.useEffect(() => {
    if (!editor || !lastManualStyleLearningAt) return;

    const timer = window.setTimeout(() => {
      try {
        const html = String(editor.getHTML?.() || '');
        learnFromDocumentDraft({
          html,
          title: currentFilePath || 'המסמך הפעיל',
        });
      } catch {}
    }, 8000);

    return () => window.clearTimeout(timer);
  }, [editor, lastManualStyleLearningAt, currentFilePath]);

  React.useEffect(() => {
    if (!editor || wordPreferences.autoSave === false) return;

    const saveSnapshot = () => {
      if (wordPreferences.keepLastAutosavedVersion === false) return;
      if (!hasMeaningfulEditorContent(editor)) return;
      const html = editor.getHTML();
      try {
        localStorage.setItem('wordai_document_autosave', html);
        localStorage.setItem('wordai_document_autosave_at', new Date().toISOString());
      } catch {
        // לא חוסמים את המשתמש אם המטמון התמלא
      }
    };

    const interval = window.setInterval(
      saveSnapshot,
      Math.max(1, Number(wordPreferences.autoSaveMinutes || 10)) * 60 * 1000,
    );

    window.addEventListener('beforeunload', saveSnapshot);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('beforeunload', saveSnapshot);
    };
  }, [editor, wordPreferences]);

  React.useEffect(() => {
    if (!editor || sidebarOpen || assistantBehavior.autoPopup === false) return;
    const hasText = editor.getText().trim().length > 0;
    if (!hasText) return;

    const timer = window.setTimeout(() => {
      const activeInEditor = document.activeElement?.closest?.('.ProseMirror');
      if (activeInEditor && !sidebarOpen) {
        setAssistantTrigger('idle');
        setSidebarCompact(false);
        setSidebarOpen(true);
      }
    }, Math.max(3, Number(assistantBehavior.idleSeconds || 5)) * 1000);

    return () => window.clearTimeout(timer);
  }, [editor, lastEditorActivityAt, sidebarOpen, assistantBehavior]);

  const closeAssistantPopup = () => {
    setSidebarOpen(false);
    setAssistantTrigger('manual');
    setLastEditorActivityAt(Date.now());
  };

  const hasMeaningfulContent = React.useCallback(() => {
    return hasMeaningfulEditorContent(editor);
  }, [editor, hasMeaningfulEditorContent]);

  const confirmReplaceCurrentDocument = React.useCallback(() => {
    if (!hasMeaningfulContent()) return true;
    return window.confirm('יש במסמך תוכן קיים. להחליף אותו?');
  }, [hasMeaningfulContent]);

  const downloadFile = (content, filename, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const persistLocalCache = React.useCallback((html) => {
    try {
      localStorage.setItem('wordai_document', html);
      localStorage.setItem('wordai_document_autosave', html);
      localStorage.setItem('wordai_document_autosave_at', new Date().toISOString());
    } catch {
      // המטמון נועד לנוחות וללמידה — לא נחסום עבודה אם הוא מלא
    }
  }, []);

  const getCurrentBlockElement = React.useCallback(() => {
    const selection = window.getSelection?.();
    const anchorNode = selection?.anchorNode;
    const baseElement = anchorNode?.nodeType === Node.TEXT_NODE ? anchorNode.parentElement : anchorNode;
    return baseElement?.closest?.('p, h1, h2, h3, h4, h5, h6, blockquote, li, ul, ol') || null;
  }, []);

  const applyImportedDocument = React.useCallback((payload = {}) => {
    if (!editor) return;
    if (payload?.ok === false || payload?.error) {
      alert(payload?.error || 'לא ניתן לפתוח את הקובץ שנבחר.');
      return;
    }
    const importedHtml = String(payload.html || '').trim() || '<p></p>';
    if (!confirmReplaceCurrentDocument()) return;

    editor.commands.setContent(importedHtml);
    editor.setEditable(true);
    setViewMode('print');
    if (editor.view?.dom) {
      editor.view.dom.contentEditable = 'true';
      editor.view.dom.dataset.viewMode = 'print';
    }
    applyDocumentStyleToEditor(localStorage.getItem('wordai_document_style') || documentStyle, editor);
    setCurrentFilePath(String(payload.filePath || ''));
    localStorage.setItem('wordai_active_template', 'blank');
    setActiveTemplateId('blank');
    saveDocumentHistory({
      title: String(payload.title || 'מסמך שנפתח מהמחשב').trim(),
      content: importedHtml,
      templateId: 'blank',
      source: 'opened-file',
    });
    persistLocalCache(importedHtml);
    setLastEditorActivityAt(Date.now());
    setShowStartScreen(false);
    focusEditorSoon('start');
  }, [editor, confirmReplaceCurrentDocument, focusEditorSoon, persistLocalCache, applyDocumentStyleToEditor, documentStyle]);

  React.useEffect(() => {
    if (!window.desktopApp?.onOpenExternalDocument) return;
    return window.desktopApp.onOpenExternalDocument((payload) => {
      if (!editor) {
        pendingImportRef.current = payload;
        return;
      }
      applyImportedDocument(payload);
    });
  }, [editor, applyImportedDocument]);

  React.useEffect(() => {
    if (!editor) return;

    const applyPending = async () => {
      if (pendingImportRef.current) {
        const payload = pendingImportRef.current;
        pendingImportRef.current = null;
        applyImportedDocument(payload);
        return;
      }

      if (window.desktopApp?.consumePendingOpenDocument) {
        const payload = await window.desktopApp.consumePendingOpenDocument();
        if (payload && !payload.canceled) {
          applyImportedDocument(payload);
        }
      }
    };

    applyPending();
  }, [editor, applyImportedDocument]);

  const exportDocStyles = `<style>
    body { direction: rtl; font-family: Arial, sans-serif; padding: 40px; line-height: 1.7; }
    [data-type="page-break"] { display: block; height: 0; page-break-after: always; break-after: page; }
    body > p:first-child { text-align: center; font-size: 11pt; font-weight: 700; color: #64748B; letter-spacing: 1px; margin-top: 20px; }
    body > h1:nth-child(2) { text-align: center; font-size: 28pt; color: #2B579A; margin: 0 0 10pt; }
    body > h2:nth-child(3) { text-align: center; font-size: 15pt; color: #475569; margin: 0 0 14pt; }
    body > hr:nth-child(4) { width: 96px; margin: 14px auto; border: none; border-top: 4px solid #93C5FD; }
    body > p:nth-child(5), body > p:nth-child(6) { text-align: center; color: #475569; }
  </style>`;

  const handleCommand = async (cmd, value) => {
    const safeCommands = ['zoom','exportHTML','exportText','focusMode','toggleWatermark',
      'setPageColor','togglePageBorders','toggleRuler','toggleGrid','formatPainter','openFile'];
    if (!editor && !safeCommands.includes(cmd)) return;

    switch (cmd) {
      case 'bold': editor.chain().focus().toggleBold().run(); break;
      case 'italic': editor.chain().focus().toggleItalic().run(); break;
      case 'underline': editor.chain().focus().toggleUnderline?.().run(); break;
      case 'strike': editor.chain().focus().toggleStrike().run(); break;
      case 'subscript': editor.chain().focus().toggleSubscript().run(); break;
      case 'superscript': editor.chain().focus().toggleSuperscript().run(); break;
      case 'clearFormatting': editor.chain().focus().unsetAllMarks().unsetTextAlign().run(); break;
      case 'bulletList': editor.chain().focus().toggleBulletList().run(); break;
      case 'orderedList': editor.chain().focus().toggleOrderedList().run(); break;
      case 'alignRight': editor.chain().focus().setTextAlign('right').run(); break;
      case 'alignLeft': editor.chain().focus().setTextAlign('left').run(); break;
      case 'alignCenter': editor.chain().focus().setTextAlign('center').run(); break;
      case 'alignJustify': editor.chain().focus().setTextAlign('justify').run(); break;
      case 'indent': editor.chain().focus().sinkListItem('listItem').run(); break;
      case 'outdent': editor.chain().focus().liftListItem('listItem').run(); break;
      case 'heading': editor.chain().focus().toggleHeading({ level: value }).run(); break;
      case 'paragraph': editor.chain().focus().setParagraph().run(); break;
      case 'blockquote': editor.chain().focus().toggleBlockquote().run(); break;
      case 'codeBlock': editor.chain().focus().toggleCodeBlock().run(); break;
      case 'insertHR': editor.chain().focus().setHorizontalRule().run(); break;
      case 'fontFamily': {
        editor.chain().focus().setFontFamily(value).run();
        updateActiveFormats(editor);
        break;
      }
      case 'fontSize': {
        editor.chain().focus().setFontSize(value).run();
        updateActiveFormats(editor);
        break;
      }
      case 'fontSizeInc': {
        const rawSize = String(editor.getAttributes('textStyle').fontSize || window.getComputedStyle(editor.view.dom).fontSize || '12pt');
        const next = Number(normalizeFontSizeValue(rawSize) || 12) + 1;
        editor.chain().focus().setFontSize(`${next}pt`).run();
        updateActiveFormats(editor);
        break;
      }
      case 'fontSizeDec': {
        const rawSize = String(editor.getAttributes('textStyle').fontSize || window.getComputedStyle(editor.view.dom).fontSize || '12pt');
        const next = Math.max(8, Number(normalizeFontSizeValue(rawSize) || 12) - 1);
        editor.chain().focus().setFontSize(`${next}pt`).run();
        updateActiveFormats(editor);
        break;
      }
      case 'lineHeight': editor.chain().focus().setLineHeight(value).run(); break;
      case 'applyParagraphSpacing': {
        const spacing = value || {};
        const block = getCurrentBlockElement();
        if (spacing.lineHeight) editor.chain().focus().setLineHeight(spacing.lineHeight).run();
        if (block) {
          if (spacing.before != null) block.style.marginTop = `${Math.max(0, Number(spacing.before) || 0)}pt`;
          if (spacing.after != null) block.style.marginBottom = `${Math.max(0, Number(spacing.after) || 0)}pt`;
        }
        break;
      }
      case 'saveDefaultTypography': {
        const currentFont = editor.getAttributes('textStyle')?.fontFamily || window.getComputedStyle(editor.view.dom).fontFamily || 'Alef';
        const currentSize = editor.getAttributes('textStyle')?.fontSize || window.getComputedStyle(editor.view.dom).fontSize || '12pt';
        localStorage.setItem('default-font', currentFont);
        localStorage.setItem('default-size', currentSize);
        setWordPreferences((prev) => ({
          ...prev,
          defaultFontFamily: currentFont,
          defaultFontSize: currentSize,
        }));
        applyDocumentStyleToEditor(documentStyle);
        alert(`ברירת המחדל נשמרה: ${currentFont} · ${currentSize}`);
        break;
      }
      case 'applyDocumentStyle':
        changeDocumentStyle(value || 'academic');
        break;

      // --- כיווניות RTL / LTR ברמת הבלוק ---
      case 'setDirRTL': {
        editor.chain().focus().updateAttributes('paragraph', { dir: 'rtl' }).run();
        editor.chain().focus().updateAttributes('heading', { dir: 'rtl' }).run();
        break;
      }
      case 'setDirLTR': {
        editor.chain().focus().updateAttributes('paragraph', { dir: 'ltr' }).run();
        editor.chain().focus().updateAttributes('heading', { dir: 'ltr' }).run();
        break;
      }

      // --- מברשת עיצוב ---
      case 'formatPainter': {
        if (!formatPainterRef.current.copyFormat) return;
        if (formatPainterActive) {
          formatPainterRef.current.applyFormat?.();
          setFormatPainterActive(false);
        } else {
          formatPainterRef.current.copyFormat?.();
          setFormatPainterActive(true);
        }
        break;
      }

      case 'insertTable':
        editor.chain().focus().insertTable({ rows: value?.rows ?? 3, cols: value?.cols ?? 3, withHeaderRow: true }).run();
        break;
      case 'insertImage': editor.chain().focus().setImage({ src: value }).run(); break;
      case 'insertImageUrl': {
        const result = await requestInputDialog({
          title: 'הוספת תמונה מקישור',
          description: 'הדבק כתובת תמונה מלאה.',
          fields: [
            { id: 'url', label: 'כתובת תמונה', placeholder: 'https://example.com/image.png' },
          ],
          confirmLabel: 'הוסף תמונה',
        });
        if (result?.url) editor.chain().focus().setImage({ src: String(result.url).trim() }).run();
        break;
      }
      case 'insertLink': editor.chain().focus().setLink({ href: value }).run(); break;
      case 'insertLinkDialog': {
        const result = await requestInputDialog({
          title: 'הוספת קישור',
          description: 'אפשר להוסיף גם קישור למקור אקדמי או מערכת חיצונית.',
          fields: [
            { id: 'url', label: 'כתובת URL', placeholder: 'https://...' },
          ],
          confirmLabel: 'הוסף קישור',
        });
        if (result?.url) editor.chain().focus().setLink({ href: String(result.url).trim() }).run();
        break;
      }
      case 'insertBookmarkDialog': {
        const result = await requestInputDialog({
          title: 'יצירת סימניה',
          fields: [
            { id: 'name', label: 'שם הסימניה', placeholder: 'למשל: מבוא או מקורות' },
          ],
          confirmLabel: 'צור סימניה',
        });
        if (result?.name) editor.chain().focus().insertContent(`<a id="${escHtml(String(result.name).trim())}" name="${escHtml(String(result.name).trim())}" style="color:inherit;text-decoration:none;">⚓ ${escHtml(String(result.name).trim())}</a>`).run();
        break;
      }
      case 'openGoogleSearch': {
        const initial = String(selectedText || currentBlockText || '').trim();
        const result = await requestInputDialog({
          title: 'חיפוש בגוגל',
          fields: [
            { id: 'query', label: 'מה לחפש?', placeholder: 'נושא, מושג או שאלה', value: initial },
          ],
          confirmLabel: 'פתח חיפוש',
        });
        if (result?.query) openExternalLink(`https://www.google.com/search?q=${encodeURIComponent(String(result.query).trim())}`);
        break;
      }
      case 'searchScholar': {
        const initial = String(selectedText || currentBlockText || '').trim();
        const result = await requestInputDialog({
          title: 'חיפוש ב-Google Scholar',
          description: 'אפשר לחפש נושא, מאמר, חוקר או מילות מפתח.',
          fields: [
            { id: 'query', label: 'מונח חיפוש', placeholder: 'למשל: legal writing pedagogy', value: initial },
          ],
          confirmLabel: 'פתח Scholar',
        });
        if (result?.query) openExternalLink(`https://scholar.google.com/scholar?q=${encodeURIComponent(String(result.query).trim())}`);
        break;
      }
      case 'openOrbit':
        openExternalLink('https://orbit.livemind-app.com/');
        break;
      case 'openModelHub':
        openExternalLink('https://aistudio.google.com/');
        break;
      case 'setColor': editor.chain().focus().setColor(value).run(); break;
      case 'setHighlight': editor.chain().focus().toggleHighlight({ color: value }).run(); break;
      case 'insertTaskList': editor.chain().focus().toggleTaskList().run(); break;
      case 'pageBreak':
        editor.chain().focus().setPageBreak().run();
        break;
      case 'insertDate': {
        const d = new Date().toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
        editor.chain().focus().insertContent(d).run(); break;
      }
      case 'insertMath': editor.chain().focus().insertContent(' ∑ ').run(); break;
      case 'insertSymbol': editor.chain().focus().insertContent(value).run(); break;
      case 'addComment': editor.chain().focus().toggleHighlight({ color: '#FCE100' }).run(); break;
      case 'removeComment': editor.chain().focus().unsetHighlight().run(); break;

      case 'copySelection': {
        const { from, to, empty } = editor.state.selection;
        if (empty) {
          alert('בחר טקסט להעתקה.');
          break;
        }
        const text = editor.state.doc.textBetween(from, to, ' ');
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          document.execCommand('copy');
        }
        break;
      }
      case 'cutSelection': {
        const { from, to, empty } = editor.state.selection;
        if (empty) {
          alert('בחר טקסט לגזירה.');
          break;
        }
        const text = editor.state.doc.textBetween(from, to, ' ');
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          document.execCommand('cut');
        }
        editor.chain().focus().deleteSelection().run();
        break;
      }
      case 'pasteClipboard': {
        try {
          const text = await navigator.clipboard.readText();
          if (text) editor.chain().focus().insertContent(escHtml(text).replace(/\n/g, '<br />')).run();
        } catch {
          alert('הדבקה אוטומטית נחסמה על ידי המערכת. אפשר להשתמש גם ב־Ctrl+V.');
        }
        break;
      }
      case 'wordCount': {
        const txt = editor.getText();
        const wc = txt.trim() ? txt.trim().split(/\s+/).length : 0;
        alert(`ספירת מילים: ${wc}`); break;
      }
      case 'charCount': {
        const cc = editor.getText().length;
        alert(`ספירת תווים: ${cc}`); break;
      }

      // --- תוכן עניינים אמיתי (מוזרק לתוך העורך) ---
      case 'generateTOC': {
        const headings = [];
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'heading') {
            const id = `heading-${pos}`;
            headings.push({ level: node.attrs.level, text: node.textContent, id });
          }
        });
        if (!headings.length) { alert('לא נמצאו כותרות במסמך'); break; }
        const tocItems = headings
          .map((h) => `<li style="padding-right:${(h.level - 1) * 16}px"><a href="#${h.id}">${h.text}</a></li>`)
          .join('');
        const tocHtml = `<p><strong>תוכן עניינים</strong></p><ul style="list-style:none;padding:0">${tocItems}</ul><hr/>`;
        editor.chain().focus().insertContentAt(1, tocHtml).run();
        break;
      }

      // --- הערת שוליים ---
      case 'insertFootnote': {
        const result = await requestInputDialog({
          title: 'הוספת הערת שוליים',
          fields: [
            { id: 'footnote', label: 'טקסט הערת שוליים', placeholder: 'הקלד כאן את ההערה' },
          ],
          confirmLabel: 'הוסף הערה',
        });
        const footnoteText = String(result?.footnote || '').trim();
        if (!footnoteText) break;
        const existingFootnotes = document.querySelectorAll('.footnote-ref').length;
        const num = existingFootnotes + 1;
        const safeFnText = escHtml(footnoteText);
        editor.chain().focus().insertContent(
          `<sup class="footnote-ref" id="fnref-${num}" style="color:#2B579A;cursor:pointer" title="${safeFnText}">[${num}]</sup>`
        ).run();
        // הוסף הערה בתחתית הדף
        editor.chain().focus().insertContentAt(
          editor.state.doc.content.size,
          `<p><small id="fn-${num}"><sup>${num}</sup> ${safeFnText}</small></p>`
        ).run();
        break;
      }

      case 'aiSpellCheck': alert('בדיקת איות AI: סמן טקסט ולחץ "תיקון" ב-BubbleMenu.'); break;

      // --- פקודות File Menu ---
      case 'newDoc': {
        if (window.confirm('האם למחוק את תוכן המסמך הנוכחי ולפתוח מסמך חדש?')) {
          editor.chain().focus().clearContent().run();
          localStorage.removeItem('wordai_document_autosave');
          localStorage.removeItem('wordai_document_autosave_at');
          localStorage.removeItem('wordai_document');
          setCurrentFilePath('');
          localStorage.setItem('wordai_active_template', 'blank');
          setActiveTemplateId('blank');
          setShowStartScreen(wordPreferences.showStartExperience !== false);
        }
        break;
      }
      case 'saveLocal': {
        const html = editor.getHTML();
        const text = editor.getText();
        persistLocalCache(html);
        saveDocumentHistory({
          title: editor.getText().trim().slice(0, 60) || 'מסמך שמור',
          content: html,
          templateId: activeTemplateId || 'blank',
          source: 'save-local',
        });

        if (currentFilePath && window.desktopApp?.saveDocumentDialog) {
          const ext = String(currentFilePath).toLowerCase().split('.').pop();
          const canSaveDirectly = ['txt', 'html', 'htm', 'docx'].includes(ext);
          const result = await window.desktopApp.saveDocumentDialog({
            filePath: canSaveDirectly ? currentFilePath : '',
            title: editor.getText().trim().slice(0, 60) || 'מסמך',
            html,
            text,
          });
          if (!canSaveDirectly) {
            alert('קובץ Word שנפתח נשמר מעכשיו בעותק חדש בפורמט נתמך, בלי לדרוס את המקור.');
          } else if (!result?.canceled && result?.filePath) {
            alert('המסמך נשמר גם במיקום שבחרת במחשב וגם במטמון המקומי.');
          }
          if (!result?.canceled && result?.filePath) {
            setCurrentFilePath(String(result.filePath));
          }
        } else {
          alert('המסמך נשמר בהצלחה במטמון המקומי לצורך שחזור ולמידה.');
        }
        break;
      }
      case 'openFile': {
        if (window.desktopApp?.openDocumentDialog) {
          const result = await window.desktopApp.openDocumentDialog();
          if (!result?.canceled) applyImportedDocument(result);
          break;
        }

        const picker = document.createElement('input');
        picker.type = 'file';
        picker.accept = '.txt,.md,.markdown,.html,.htm';
        picker.onchange = async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const text = await file.text();
          const html = /<(html|body|p|h1|h2|div|span|br|ul|ol|li)\b/i.test(text)
            ? text
            : text.split(/\n{2,}/).map((block) => `<p>${escHtml(block).replace(/\n/g, '<br />')}</p>`).join('');
          applyImportedDocument({ title: file.name, html });
        };
        picker.click();
        break;
      }
      case 'saveAs': {
        const html = editor.getHTML();
        const text = editor.getText();

        if (window.desktopApp?.saveDocumentDialog) {
          const result = await window.desktopApp.saveDocumentDialog({
            title: editor.getText().trim().slice(0, 60) || 'מסמך',
            html,
            text,
            preferredExtension: 'docx',
          });

          if (!result?.canceled) {
            setCurrentFilePath(String(result.filePath || ''));
            persistLocalCache(html);
            saveDocumentHistory({
              title: editor.getText().trim().slice(0, 60) || 'מסמך שמור',
              content: html,
              templateId: activeTemplateId || 'blank',
              source: 'save-as',
            });
            alert(`המסמך נשמר בהצלחה ב:\n${result.filePath}`);
          }
          break;
        }

        downloadFile(html, 'document.doc', 'application/msword');
        break;
      }
      case 'exportDocx': {
        const html = editor.getHTML();
        const text = editor.getText();
        if (window.desktopApp?.saveDocumentDialog) {
          const result = await window.desktopApp.saveDocumentDialog({
            title: editor.getText().trim().slice(0, 60) || 'מסמך',
            html,
            text,
            preferredExtension: 'docx',
          });
          if (!result?.canceled && result?.filePath) setCurrentFilePath(String(result.filePath));
          break;
        }
        const htmlContent = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'/><title>WordFlow AI Document</title>${exportDocStyles}</head><body dir="rtl">${html}</body></html>`;
        downloadFile(htmlContent, 'document.doc', 'application/msword');
        break;
      }
      case 'print': {
        setFileMenuOpen(false);
        window.setTimeout(() => window.print(), 60);
        break;
      }

      case 'zoom': setZoom(value); break;
      case 'focusMode': setSidebarOpen(false); break;
      case 'toggleWatermark': {
        const el = document.querySelector('.ProseMirror');
        if (el) el.style.backgroundImage = el.style.backgroundImage
          ? '' : 'repeating-linear-gradient(-45deg, transparent, transparent 100px, rgba(200,200,200,0.1) 100px, rgba(200,200,200,0.1) 200px)';
        break;
      }
      case 'setPageColor': {
        const el = document.querySelector('.ProseMirror');
        if (el) {
          el.dataset.customBackground = value;
          el.style.background = value;
        }
        break;
      }
      case 'togglePageBorders': {
        const el = document.querySelector('.ProseMirror');
        if (el) {
          const nextBorder = el.dataset.customBorder ? '' : '2px solid var(--word-blue)';
          el.dataset.customBorder = nextBorder;
          el.style.border = nextBorder || '';
        }
        break;
      }
      case 'exportHTML': {
        const htmlCtx = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8" /><title>WordFlow AI Document</title>${exportDocStyles}</head><body>${editor.getHTML()}</body></html>`;
        downloadFile(htmlCtx, 'my-document.html', 'text/html');
        break;
      }
      case 'exportText':
        downloadFile(editor.getText(), 'my-document.txt', 'text/plain');
        break;

      /* ---- פקודות פריסה ---- */
      case 'setMargins': {
        const marginMap = { normal: '2.54cm', narrow: '1.27cm', moderate: '1.91cm', wide: '3.81cm', centered: '5cm' };
        const m = marginMap[value] || '2.54cm';
        const page = document.querySelector('.ProseMirror');
        if (page) {
          page.dataset.customPadding = m;
          page.style.padding = m;
        }
        break;
      }
      case 'setOrientation': {
        const page2 = document.querySelector('.ProseMirror');
        if (!page2) break;
        if (value === 'landscape') {
          page2.dataset.customWidth = '29.7cm';
          page2.dataset.customMinHeight = '21cm';
        } else {
          page2.dataset.customWidth = '21cm';
          page2.dataset.customMinHeight = '29.7cm';
        }
        if ((page2.dataset.viewMode || viewMode) === 'print') {
          applyDocumentStyleToEditor(documentStyle);
        }
        break;
      }
      case 'setPageSize': {
        const sizes = { a4: ['21cm','29.7cm'], a3: ['29.7cm','42cm'], letter: ['21.59cm','27.94cm'], legal: ['21.59cm','35.56cm'] };
        const [pw, ph] = sizes[value] || sizes.a4;
        const pg = document.querySelector('.ProseMirror');
        if (pg) {
          pg.dataset.customWidth = pw;
          pg.dataset.customMinHeight = ph;
          if ((pg.dataset.viewMode || viewMode) === 'print') {
            applyDocumentStyleToEditor(documentStyle);
          }
        }
        break;
      }
      case 'setColumns': {
        const pg2 = document.querySelector('.ProseMirror');
        if (pg2) { pg2.style.columnCount = value > 1 ? String(value) : ''; pg2.style.columnGap = value > 1 ? '2em' : ''; }
        break;
      }
      case 'setMarginBefore': {
        const block = getCurrentBlockElement();
        if (block) block.style.marginRight = `${Math.max(0, Number(value) || 0)}cm`;
        break;
      }
      case 'setMarginAfter': {
        const block = getCurrentBlockElement();
        if (block) block.style.marginLeft = `${Math.max(0, Number(value) || 0)}cm`;
        break;
      }
      case 'setSpacingBefore': {
        const block = getCurrentBlockElement();
        if (block) block.style.marginTop = `${Math.max(0, Number(value) || 0)}pt`;
        break;
      }
      case 'setSpacingAfter': {
        const block = getCurrentBlockElement();
        if (block) block.style.marginBottom = `${Math.max(0, Number(value) || 0)}pt`;
        break;
      }

      /* ---- פקודות הוספה ---- */
      case 'insertHTML':
        editor.chain().focus().insertContent(value).run();
        break;
      case 'insertBookmark':
        editor.chain().focus().insertContent(`<a id="${value}" name="${value}" style="color:inherit;text-decoration:none;">⚓ ${value}</a>`).run();
        break;
      case 'insertSignature':
        editor.chain().focus().insertContent(
          `<div style="margin-top:40px;border-top:1px solid #333;width:200px;padding-top:4px;font-size:12px;color:#555;">חתימה</div>`
        ).run();
        break;
      case 'insertHeader': {
        const headerMap = {
          'ריק': '<div style="border-bottom:1px solid #ccc;padding-bottom:6px;margin-bottom:12px;color:#555;font-size:12px">&nbsp;</div>',
          'שם מסמך': '<div style="border-bottom:1px solid #ccc;padding-bottom:6px;margin-bottom:12px;color:#555;font-size:12px;text-align:center"><strong>כותרת מסמך</strong></div>',
          'תאריך + שם': `<div style="border-bottom:1px solid #ccc;padding-bottom:6px;margin-bottom:12px;color:#555;font-size:12px;display:flex;justify-content:space-between"><span><strong>שם המסמך</strong></span><span>${new Date().toLocaleDateString('he-IL')}</span></div>`,
          'מספר עמוד': '<div style="border-bottom:1px solid #ccc;padding-bottom:6px;margin-bottom:12px;color:#555;font-size:12px;text-align:left">עמוד 1</div>',
        };
        editor.chain().focus().insertContentAt(1, headerMap[value] || headerMap['ריק']).run();
        break;
      }
      case 'insertFooter': {
        const footerMap = {
          'ריק': '<div style="border-top:1px solid #ccc;padding-top:6px;margin-top:20px;color:#555;font-size:12px">&nbsp;</div>',
          'שם מסמך': '<div style="border-top:1px solid #ccc;padding-top:6px;margin-top:20px;color:#555;font-size:12px;text-align:center"><strong>שם המסמך</strong></div>',
          'מספר עמוד': '<div style="border-top:1px solid #ccc;padding-top:6px;margin-top:20px;color:#555;font-size:12px;text-align:left">עמוד 1</div>',
          'תאריך': `<div style="border-top:1px solid #ccc;padding-top:6px;margin-top:20px;color:#555;font-size:12px">${new Date().toLocaleDateString('he-IL')}</div>`,
        };
        const pos = editor.state.doc.content.size;
        editor.chain().focus().insertContentAt(pos, footerMap[value] || footerMap['ריק']).run();
        break;
      }
      case 'insertPageNum':
        editor.chain().focus().insertContent(`<span style="border:1px solid #ccc;padding:1px 6px;border-radius:3px;font-size:11px;color:#555">[עמוד]</span>`).run();
        break;
      case 'insertTextBox': {
        const tbMap = {
          'פשוט': 'border:1px solid #ccc;padding:12px;margin:8px 0;min-height:60px',
          'עם כותרת': 'border:1px solid #2B579A;padding:12px;margin:8px 0;min-height:60px',
          'ציטוט': 'border-right:4px solid #2B579A;padding:8px 16px;margin:8px 0;color:#555;font-style:italic',
          'הדגשה': 'background:#f3f4f6;border:none;padding:12px;margin:8px 0;border-radius:4px',
        };
        editor.chain().focus().insertContent(`<div style="${tbMap[value] || tbMap['פשוט']}">לחץ לעריכה...</div>`).run();
        break;
      }
      case 'insertWordArt': {
        const { text: waText, style: waStyle } = value || {};
        if (waText && waStyle) editor.chain().focus().insertContent(`<span style="${waStyle}">${waText}</span>`).run();
        break;
      }
      case 'insertSmartArt': {
        const result = await requestInputDialog({
          title: 'יצירת SmartArt',
          description: 'הפרד בין הפריטים בפסיקים.',
          fields: [
            { id: 'items', label: 'פריטים', placeholder: 'למשל: מבוא, שיטה, ממצאים, מסקנה' },
          ],
          confirmLabel: 'צור מבנה',
        });
        const items = String(result?.items || '').split(',').map(s => s.trim()).filter(Boolean);
        if (!items.length) break;
        const smartMap = {
          list: `<ul style="padding-right:20px">${items.map(i => `<li>${i}</li>`).join('')}</ul>`,
          process: `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${items.map((it, idx) => `<span style="background:#2B579A;color:white;padding:6px 12px;border-radius:4px">${it}</span>${idx < items.length - 1 ? '<span>→</span>' : ''}`).join('')}</div>`,
          cycle: `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${items.map((it, idx) => `<span style="background:#217346;color:white;padding:6px 12px;border-radius:20px">${it}</span>${idx < items.length - 1 ? '<span>↻</span>' : ''}`).join('')}</div>`,
          hierarchy: `<div style="text-align:center"><div style="background:#2B579A;color:white;padding:6px 20px;display:inline-block;margin-bottom:12px">${items[0] || ''}</div><div style="display:flex;gap:12px;justify-content:center">${items.slice(1).map(it => `<div style="background:#DEECF9;border:1px solid #2B579A;padding:6px 12px">${it}</div>`).join('')}</div></div>`,
          matrix: `<table style="border-collapse:collapse;width:100%">${items.map((it, i) => i % 2 === 0 ? `<tr><td style="border:1px solid #ccc;padding:8px;background:#f3f4f6">${it}</td><td style="border:1px solid #ccc;padding:8px">${items[i + 1] || ''}</td></tr>` : '').join('')}</table>`,
        };
        editor.chain().focus().insertContent(smartMap[value] || smartMap.list).run();
        break;
      }
      case 'insertChart': {
        const result = await requestInputDialog({
          title: 'בניית תרשים',
          description: 'הקלד זוגות של שם וערך בפורמט שם:ערך, מופרדים בפסיקים.',
          fields: [
            { id: 'chartData', label: 'נתונים', placeholder: 'ינואר:45, פברואר:72, מרץ:60' },
          ],
          confirmLabel: 'צור תרשים',
        });
        const chartData = String(result?.chartData || '');
        const rows = chartData.split(',').map(r => r.trim().split(':').map(s => s.trim())).filter(r => r.length === 2);
        if (!rows.length) break;
        const max = Math.max(...rows.map(r => parseFloat(r[1]) || 0)) || 1;
        const barChart = `<div style="padding:12px;background:#f9f9f9;border:1px solid #ddd;border-radius:4px;margin:8px 0"><div style="font-weight:bold;margin-bottom:8px;text-align:center">תרשים</div>${rows.map(([lbl, val]) => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><span style="width:70px;font-size:12px;text-align:right">${lbl}</span><div style="flex:1;background:#e5e7eb;border-radius:2px;height:18px;position:relative"><div style="width:${Math.round((parseFloat(val) / max) * 100)}%;background:#2B579A;height:100%;border-radius:2px;display:flex;align-items:center;padding-right:4px"><span style="font-size:11px;color:white">${val}</span></div></div></div>`).join('')}</div>`;
        editor.chain().focus().insertContent(barChart).run();
        break;
      }

      /* ---- פקודות עמודים ---- */
      case 'insertCoverPage': {
        const styleType = value || 'classic';
        const initialTitle = editor.getText().trim().split('\n').find(Boolean) || 'כותרת המסמך';
        const result = await requestInputDialog({
          title: 'פרטי עמוד שער',
          description: 'אם כבר קיים עמוד שער קודם, הוא יוחלף בצורה בטוחה.',
          fields: [
            { id: 'title', label: 'כותרת המסמך', value: initialTitle },
            { id: 'subtitle', label: 'כותרת משנה', value: 'כותרת משנה' },
            { id: 'author', label: 'שם המחבר', value: '________________' },
          ],
          confirmLabel: 'החל עמוד שער',
        });
        if (!result) break;
        const title = String(result.title || 'כותרת המסמך').trim() || 'כותרת המסמך';
        const sub = String(result.subtitle || 'כותרת משנה').trim() || 'כותרת משנה';
        const author = String(result.author || '________________').trim() || '________________';
        const date = new Date().toLocaleDateString('he-IL', { year: 'numeric', month: 'long' });
        const safeTitle = escHtml(title);
        const safeSub = escHtml(sub);
        const safeAuthor = escHtml(author);
        const safeDate = escHtml(date);

        const coverTemplates = {
          classic: `<div data-cover-page="true"><p>מסמך רשמי</p><h1>${safeTitle}</h1><h2>${safeSub}</h2><hr /><p>נכתב על ידי ${safeAuthor}</p><p>${safeDate}</p></div>`,
          modern: `<div data-cover-page="true"><p>WordFlow AI</p><h1>${safeTitle}</h1><h2>${safeSub}</h2><hr /><p>${safeAuthor}</p><p>${safeDate}</p></div>`,
          academic: `<div data-cover-page="true"><p>עבודה אקדמית</p><h1>${safeTitle}</h1><h2>${safeSub}</h2><hr /><p>מגיש/ה: ${safeAuthor}</p><p>${safeDate}</p></div>`,
          bold: `<div data-cover-page="true"><p>דוח / מצגת / מסמך</p><h1>${safeTitle}</h1><h2>${safeSub}</h2><hr /><p>${safeAuthor}</p><p>${safeDate}</p></div>`,
        };

        localStorage.setItem('wordai_active_template', 'cover');
        setActiveTemplateId('cover');
        const existingHtml = String(editor.getHTML() || '').replace(/<div data-cover-page="true">[\s\S]*?<\/div>\s*(<div data-type="page-break"><\/div>)?/i, '').trim();
        const cover = `${coverTemplates[styleType] || coverTemplates.classic}<div data-type="page-break"></div>${existingHtml || '<h1>כותרת פרק</h1><p></p>'}`;
        editor.commands.setContent(cover);
        break;
      }
      case 'insertBlankPage': {
        const blankPageHtml = `<div data-type="page-break"></div>${'<p>&nbsp;</p>'.repeat(14)}<div data-type="page-break"></div><p></p>`;
        editor.chain().focus().insertContent(blankPageHtml).run();
        break;
      }

      /* ---- פקודות סקירה ---- */
      case 'toggleComments': {
        const marks = document.querySelectorAll('.ProseMirror mark');
        marks.forEach(m => { m.style.display = m.style.display === 'none' ? '' : 'none'; });
        break;
      }
      case 'toggleTracking': {
        const newVal = !trackChanges;
        setTrackChanges(newVal);
        alert(newVal ? 'מעקב שינויים: פעיל' : 'מעקב שינויים: כבוי');
        break;
      }
      case 'acceptAllChanges': {
        const html = editor.getHTML();
        const div = document.createElement('div');
        div.innerHTML = html;
        div.querySelectorAll('[data-ai-suggestion="true"]').forEach(el => {
          el.replaceWith(...Array.from(el.childNodes));
        });
        editor.commands.setContent(div.innerHTML);
        break;
      }
      case 'rejectAllChanges': {
        const html2 = editor.getHTML();
        const div2 = document.createElement('div');
        div2.innerHTML = html2;
        div2.querySelectorAll('[data-ai-suggestion="true"]').forEach(el => {
          const origHtml = el.getAttribute('data-original-html');
          if (origHtml) {
            const holder = document.createElement('div');
            holder.innerHTML = origHtml;
            el.replaceWith(...Array.from(holder.childNodes));
            return;
          }
          const orig = el.getAttribute('data-original-text') || '';
          const span = document.createElement('span');
          span.textContent = orig;
          el.replaceWith(span);
        });
        editor.commands.setContent(div2.innerHTML);
        break;
      }

      /* ---- פקודות ציטוטים ---- */
      case 'insertCitation': {
        const result = await requestInputDialog({
          title: 'הוספת ציטוט',
          fields: [
            { id: 'author', label: 'שם המחבר', placeholder: 'למשל: Cohen' },
            { id: 'year', label: 'שנה', value: String(new Date().getFullYear()) },
            { id: 'title', label: 'כותרת המקור', placeholder: 'שם מאמר או ספר' },
          ],
          confirmLabel: 'הוסף ציטוט',
        });
        const author = String(result?.author || '').trim();
        const year = String(result?.year || new Date().getFullYear()).trim();
        const title = String(result?.title || '').trim();
        if (!author) break;
        const citStyle = localStorage.getItem('citation-style') || 'APA';
        const citText = citStyle === 'APA'
          ? `(${escHtml(author)}, ${escHtml(String(year))})`
          : citStyle === 'MLA'
            ? `(${escHtml(author)} ${escHtml(String(year))})`
            : `${escHtml(author)} (${escHtml(String(year))})`;
        const titleTip = escHtml(`${author} (${year}). ${title}`);
        const src = { author, year, title };
        let sources = [];
        try { sources = JSON.parse(localStorage.getItem('bib-sources') || '[]'); } catch { sources = []; }
        sources.push(src);
        localStorage.setItem('bib-sources', JSON.stringify(sources));
        editor.chain().focus().insertContent(`<sup style="color:#2B579A;cursor:pointer" title="${titleTip}">${citText}</sup>`).run();
        break;
      }
      case 'setCitationStyle':
        localStorage.setItem('citation-style', value);
        break;
      case 'manageSources': {
        let srcs = [];
        try { srcs = JSON.parse(localStorage.getItem('bib-sources') || '[]'); } catch { srcs = []; }
        if (!srcs.length) { alert('אין מקורות שמורים עדיין.'); break; }
        alert('מקורות שמורים:\n\n' + srcs.map((s, i) => `${i + 1}. ${s.author} (${s.year}). ${s.title}`).join('\n'));
        break;
      }
      case 'insertBibliography': {
        let srcs2 = [];
        try { srcs2 = JSON.parse(localStorage.getItem('bib-sources') || '[]'); } catch { srcs2 = []; }
        const style = localStorage.getItem('citation-style') || 'APA';
        if (!srcs2.length) { alert('אין מקורות לביבליוגרפיה. הוסף ציטוטים תחילה.'); break; }
        const bibItems = srcs2.map(s => {
          const a = escHtml(s.author), y = escHtml(String(s.year)), t = escHtml(s.title);
          if (style === 'APA') return `<li>${a} (${y}). <em>${t}</em>.</li>`;
          if (style === 'MLA') return `<li>${a}. "<em>${t}</em>." ${y}.</li>`;
          return `<li>${a}, "${t}" (${y}).</li>`;
        }).join('');
        editor.chain().focus().insertContent(`<div style="margin-top:24px"><h2 style="font-size:16px;font-weight:bold;border-bottom:1px solid #ccc;padding-bottom:4px">ביבליוגרפיה</h2><ol style="padding-right:20px;line-height:2">${bibItems}</ol></div>`).run();
        break;
      }

      /* ---- פקודות תצוגה ---- */
      case 'setViewMode': {
        const pg = document.querySelector('.ProseMirror');
        if (!pg) break;
        const nextViewMode = value || 'print';
        pg.dataset.viewMode = nextViewMode;
        setViewMode(nextViewMode);
        switch (nextViewMode) {
          case 'read':
            editor.setEditable(false);
            pg.style.background = '#FAFAFA';
            pg.style.fontFamily = 'Georgia, serif';
            pg.style.fontSize = '17px';
            pg.style.lineHeight = '1.8';
            pg.style.maxWidth = '700px';
            break;
          case 'web':
            pg.style.maxWidth = '100%';
            pg.style.padding = '20px 40px';
            pg.style.background = 'white';
            pg.style.boxShadow = 'none';
            editor.setEditable(true);
            break;
          case 'outline':
            editor.setEditable(true);
            pg.style.fontFamily = 'monospace';
            pg.style.fontSize = '13px';
            pg.style.lineHeight = '1.4';
            break;
          case 'draft':
            pg.style.maxWidth = '100%';
            pg.style.background = 'white';
            pg.style.boxShadow = 'none';
            pg.style.border = 'none';
            editor.setEditable(true);
            break;
          default: // print
            editor.setEditable(true);
            pg.contentEditable = 'true';
            pg.style.maxWidth = '21cm';
            pg.style.background = 'white';
            pg.style.fontFamily = '';
            pg.style.fontSize = '';
            pg.style.lineHeight = '';
            applyDocumentStyleToEditor(documentStyle);
        }
        break;
      }
      case 'toggleRuler': {
        const wrapper = document.querySelector('#editor-wrapper');
        if (!wrapper) break;
        const shouldShow = typeof value === 'boolean' ? value : !wrapper.classList.contains('show-ruler');
        wrapper.classList.toggle('show-ruler', shouldShow);
        break;
      }
      case 'toggleGrid': {
        const wrapper = document.querySelector('#editor-wrapper');
        if (!wrapper) break;
        const shouldShow = typeof value === 'boolean' ? value : !wrapper.classList.contains('show-grid');
        wrapper.classList.toggle('show-grid', shouldShow);
        break;
      }
      case 'splitWindow':
        alert('הפצל אינו נתמך בדפדפן. פתח חלון נוסף עם Ctrl+T.');
        break;

      default: break;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[var(--page-bg,#E1DFDD)] text-[var(--text-color,#323130)] overflow-hidden" dir="rtl">
      <TopBar
        onOpenUpdates={openUpdatesPanel}
        onOpen={() => handleCommand('openFile')}
        onSave={() => handleCommand('saveLocal')}
        onSaveAs={() => handleCommand('saveAs')}
        onNew={() => handleCommand('newDoc')}
        onUndo={() => editor?.chain().focus().undo().run()}
        onRedo={() => editor?.chain().focus().redo().run()}
        onHome={() => setShowStartScreen(true)}
      />
      <Ribbon
        onCommand={handleCommand}
        documentStyle={documentStyle}
        onToggleTaskpane={() => {
          setAssistantTrigger('manual');
          setSidebarOpen((v) => {
            const next = !v;
            if (next) setSidebarCompact(false);
            return next;
          });
          setLastEditorActivityAt(Date.now());
        }}
        zoom={zoom}
        onOpenFileMenu={() => {
          setFileMenuTargetTab(null);
          setFileMenuOpen(true);
        }}
        formatPainterActive={formatPainterActive}
        activeFormats={activeFormats}
        shortcuts={shortcuts}
        assistantOpen={sidebarOpen}
      />
      
      <main id="workspace" className="flex flex-1 overflow-hidden relative">
        {!showStartScreen && sidebarOpen && (
          <aside
            className="order-last h-full shrink-0 border-r border-slate-300 bg-[#F8FAFC] z-20 transition-all duration-200 shadow-[8px_0_24px_rgba(15,23,42,0.06)]"
            style={{ width: sidebarCompact ? 'min(340px, 36vw)' : 'min(460px, 44vw)', minWidth: sidebarCompact ? 280 : 340, maxWidth: sidebarCompact ? '38vw' : '520px' }}
          >
            {liveGeneration.active && (
              <div className="border-b border-slate-200 bg-white px-3 py-3">
                <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-white to-blue-50 p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="text-sm font-bold text-slate-800">{liveGeneration.state === 'success' ? 'המסמך מוכן' : liveGeneration.state === 'warning' ? 'המסמך מוכן לבדיקה' : liveGeneration.state === 'error' ? 'אירעה שגיאה' : 'מכין את המסמך בלייב'}</div>
                      <div className="text-[11px] text-slate-500">{liveGeneration.prompt || 'מעבד את הבקשה שלך'}</div>
                    </div>
                    <div className={`text-[10px] font-bold px-2 py-1 rounded-full ${liveGeneration.state === 'success' ? 'bg-green-100 text-green-700' : liveGeneration.state === 'warning' ? 'bg-amber-100 text-amber-700' : liveGeneration.state === 'error' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                      {liveGeneration.state === 'success' ? 'הושלם' : liveGeneration.state === 'warning' ? 'לבדיקה' : liveGeneration.state === 'error' ? 'שגיאה' : 'בתהליך'}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {(liveGeneration.summary?.stages || []).slice(0, 4).map((stage) => (
                      <div key={stage.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-[11px] bg-white">
                        <span className="font-medium text-slate-700">{stage.label}</span>
                        <span className={`${stage.state === 'success' ? 'text-green-600' : stage.state === 'error' ? 'text-red-600' : stage.state === 'running' ? 'text-blue-600' : 'text-slate-400'}`}>
                          {stage.state === 'success' ? '✓' : stage.state === 'error' ? '✗' : stage.state === 'running' ? '…' : '•'}
                        </span>
                      </div>
                    ))}
                  </div>

                  {!!(liveGeneration.logs || []).length && (
                    <div className="mt-2 rounded-xl bg-slate-900 text-slate-100 p-2 text-[11px] space-y-1 max-h-24 overflow-auto">
                      {(liveGeneration.logs || []).slice(0, 3).map((log) => (
                        <div key={log.id || `${log.ts}-${log.message}`}>
                          {log.message || 'מעדכן סטטוס...'}
                        </div>
                      ))}
                    </div>
                  )}

                  {(liveGeneration.state === 'success' || liveGeneration.state === 'warning') && (feedbackSurvey.prompt || feedbackSurvey.usedFallback) && (
                    <div className="mt-2 flex gap-2">
                      <button
                        className="btn btn-sm btn-primary flex-1"
                        onClick={() => setFeedbackSurvey((prev) => ({ ...prev, open: true, phase: 'details' }))}
                      >
                        פתח תיקונים
                      </button>
                      <button
                        className="btn btn-sm btn-ghost flex-1"
                        onClick={() => setLiveGeneration((prev) => ({ ...prev, active: false }))}
                      >
                        המשך לערוך
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
            <AiSidebar
              mode="sidebar"
              compactMode={sidebarCompact}
              onToggleCompact={() => setSidebarCompact((prev) => !prev)}
              reason={assistantTrigger}
              documentContext={() => editor ? editor.getText().slice(0, 9000) : ''}
              selectedText={selectedText}
              currentBlockText={currentBlockText}
              wordPreferences={wordPreferences}
              onInsert={(text) => {
                if (editor) editor.chain().focus().insertContent(`\n\n${text}\n\n`).run();
              }}
              onClose={closeAssistantPopup}
            />
          </aside>
        )}

        <div id="editor-wrapper" className="flex-1 min-w-0 overflow-y-auto overflow-x-auto p-8 flex justify-center items-start bg-[#E1DFDD] relative">
          {inputDialog.open && (
            <div className="absolute inset-0 z-40 bg-slate-900/35 flex items-center justify-center p-4">
              <div className="w-[560px] max-w-[96%] rounded-[24px] bg-white shadow-2xl border border-slate-200 p-5 md:p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">{inputDialog.title || 'השלם פרטים'}</h3>
                    {inputDialog.description ? <p className="text-sm text-slate-500 mt-1">{inputDialog.description}</p> : null}
                  </div>
                  <button className="btn btn-sm btn-ghost" onClick={() => closeInputDialog(null)}>סגור</button>
                </div>

                <div className="space-y-3">
                  {(inputDialog.fields || []).map((field) => (
                    <label key={field.id} className="block text-right">
                      <div className="text-sm font-semibold text-slate-700 mb-1">{field.label}</div>
                      {field.type === 'textarea' ? (
                        <textarea
                          className="textarea textarea-bordered w-full min-h-[110px]"
                          placeholder={field.placeholder || ''}
                          value={inputDialog.values?.[field.id] || ''}
                          onChange={(e) => setInputDialog((prev) => ({
                            ...prev,
                            values: {
                              ...(prev.values || {}),
                              [field.id]: e.target.value,
                            },
                          }))}
                        />
                      ) : (
                        <input
                          className="input input-bordered w-full"
                          placeholder={field.placeholder || ''}
                          value={inputDialog.values?.[field.id] || ''}
                          onChange={(e) => setInputDialog((prev) => ({
                            ...prev,
                            values: {
                              ...(prev.values || {}),
                              [field.id]: e.target.value,
                            },
                          }))}
                        />
                      )}
                    </label>
                  ))}
                </div>

                <div className="flex gap-3 justify-end mt-5">
                  <button className="btn btn-ghost" onClick={() => closeInputDialog(null)}>ביטול</button>
                  <button className="btn btn-primary" onClick={() => closeInputDialog(inputDialog.values || {})}>{inputDialog.confirmLabel || 'אישור'}</button>
                </div>
              </div>
            </div>
          )}

          {feedbackSurvey.open && (
            <div className="absolute inset-0 z-40 bg-slate-900/35 flex items-center justify-center p-4">
              <div className="w-[760px] max-w-[96%] rounded-[28px] bg-white shadow-2xl border border-slate-200 p-5 md:p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">{feedbackSurvey.phase === 'question' ? 'איך יצא המסמך?' : 'מה לתקן במסמך?'}</h3>
                    <p className="text-sm text-slate-500 mt-1">
                      {feedbackSurvey.phase === 'question'
                        ? 'אפשר לאשר שהכול מצוין, או לבקש תיקון ממנהל הצוות.'
                        : 'בחר את הנקודות החשובות לך, או כתוב חופשי מה לשפר.'}
                    </p>
                  </div>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => {
                      setFeedbackSurvey({ ...DEFAULT_FEEDBACK_SURVEY });
                      setLiveGeneration((prev) => ({ ...prev, active: false }));
                    }}
                  >
                    סגור
                  </button>
                </div>

                {feedbackSurvey.usedFallback && (
                  <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    נוצרה כרגע טיוטה בטוחה. אפשר לאשר אותה או לשלוח עכשיו הערות כדי שמנהל הצוות ישפר אותה.
                  </div>
                )}

                {feedbackSurvey.phase === 'question' ? (
                  <div className="flex flex-col md:flex-row gap-3">
                    <button
                      className="btn btn-primary flex-1"
                      onClick={() => {
                        setFeedbackSurvey({ ...DEFAULT_FEEDBACK_SURVEY });
                        setLiveGeneration((prev) => ({ ...prev, active: false }));
                      }}
                    >
                      כן, המסמך טוב
                    </button>
                    <button
                      className="btn btn-outline flex-1"
                      onClick={() => {
                        setFeedbackSurvey((prev) => ({ ...prev, phase: 'details' }));
                        setLiveGeneration((prev) => ({ ...prev, active: false }));
                      }}
                    >
                      לא, צריך תיקונים
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      {FEEDBACK_OPTION_GROUPS.map((group) => (
                        <div key={group.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="font-bold text-slate-800 mb-3">{group.title}</div>
                          <div className="space-y-2">
                            {group.options.map((option) => (
                              <label key={option} className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="checkbox checkbox-sm mt-0.5"
                                  checked={feedbackSurvey.selectedOptions.includes(option)}
                                  onChange={() => toggleFeedbackOption(option)}
                                />
                                <span>{option}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div>
                      <div className="font-bold text-slate-800 mb-2">כתיבה חופשית</div>
                      <textarea
                        className="textarea textarea-bordered w-full min-h-[120px]"
                        placeholder="לדוגמה: תוסיף יותר מקורות, תחדד את המסקנה, תקצר את הפתיחה, או תשנה את הסגנון..."
                        value={feedbackSurvey.freeText}
                        onChange={(e) => setFeedbackSurvey((prev) => ({ ...prev, freeText: e.target.value }))}
                      />
                    </div>

                    <div className="flex flex-col md:flex-row gap-3 justify-end">
                      <button
                        className="btn btn-ghost"
                        onClick={() => setFeedbackSurvey((prev) => ({ ...prev, phase: 'question' }))}
                        disabled={feedbackSurvey.submitting}
                      >
                        חזרה
                      </button>
                      <button
                        className={`btn btn-primary ${feedbackSurvey.submitting ? 'btn-disabled' : ''}`}
                        onClick={submitDocumentFeedback}
                        disabled={feedbackSurvey.submitting}
                      >
                        {feedbackSurvey.submitting ? 'מעדכן...' : 'שלח למנהל הצוות'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {showStartScreen && (
            <StartScreen
              documentStyle={documentStyle}
              onDocumentStyleChange={changeDocumentStyle}
              hasDraft={wordPreferences.keepLastAutosavedVersion !== false && Boolean(localStorage.getItem('wordai_document_autosave') || localStorage.getItem('wordai_document'))}
              lastSavedAt={localStorage.getItem('wordai_document_autosave_at') || ''}
              onCreateBlank={() => {
                if (!confirmReplaceCurrentDocument()) return;
                editor?.chain().focus().clearContent().run();
                localStorage.setItem('wordai_active_template', 'blank');
                setActiveTemplateId('blank');
                setShowStartScreen(false);
                focusEditorSoon('start');
              }}
              onCreateTemplate={(template) => {
                if (!confirmReplaceCurrentDocument()) return;
                const templateId = typeof template === 'string' ? template : template?.id;
                const templateExamples = Array.isArray(template?.examples) ? template.examples : [];
                localStorage.setItem('wordai_active_template', templateId || 'blank');
                setActiveTemplateId(templateId || 'blank');
                const recommendedStyle = {
                  academic: 'academic',
                  legal: 'legal',
                  report: 'business',
                  summary: 'presentation',
                  office: 'business',
                  proposal: 'business',
                  letter: 'legal',
                };
                changeDocumentStyle(recommendedStyle[templateId] || documentStyle);
                editor?.commands.setContent(buildTemplateSkeleton(templateId, '', templateExamples));
                setShowStartScreen(false);
                focusEditorSoon('start');
              }}
              onOpenDocument={() => handleCommand('openFile')}
              onOpenLastDraft={() => {
                if (!confirmReplaceCurrentDocument()) return;
                const savedDraft = wordPreferences.keepLastAutosavedVersion === false
                  ? null
                  : (localStorage.getItem('wordai_document_autosave') || localStorage.getItem('wordai_document'));
                if (savedDraft && editor) editor.commands.setContent(savedDraft);
                setActiveTemplateId(localStorage.getItem('wordai_active_template') || 'blank');
                setShowStartScreen(false);
                focusEditorSoon('end');
              }}
              onOpenSettings={() => {
                setFileMenuTargetTab('guide');
                setFileMenuOpen(true);
              }}
              onGenerateFromPrompt={async ({ prompt, templateId, instructions, selectedMaterials, documentStyle: requestedStyle }) => {
                if (!confirmReplaceCurrentDocument()) return;
                localStorage.setItem('wordai_active_template', templateId || 'blank');
                setActiveTemplateId(templateId || 'blank');
                setFeedbackSurvey({ ...DEFAULT_FEEDBACK_SURVEY });
                changeDocumentStyle(requestedStyle || documentStyle);
                setAssistantTrigger('autopilot');
                setSidebarCompact(false);
                setSidebarOpen(true);
                setShowStartScreen(false);
                setLiveGeneration({
                  active: true,
                  state: 'running',
                  prompt,
                  summary: getLatestAgentRunSummary(getWorkspaceAutomation()),
                  logs: getAgentDebugLogs().slice(-5).reverse(),
                });
                if (editor) {
                  editor.commands.setContent(buildLiveGenerationShell(prompt));
                }
                focusEditorSoon('start');

                try {
                  const result = await generateDocumentFromPrompt({ prompt, templateId, instructions, selectedMaterials, returnMeta: true });
                  const generated = result?.html || `<h1>${escHtml(prompt)}</h1><p>לא נוצר תוכן.</p>`;
                  const usedFallback = Boolean(result?.usedFallback);
                  if (editor) {
                    editor.commands.setContent(generated);
                  }
                  saveDocumentHistory({
                    title: prompt,
                    content: generated,
                    templateId,
                    source: 'start-screen',
                  });
                  persistLocalCache(generated);
                  setLiveGeneration((prev) => ({
                    ...prev,
                    active: true,
                    state: usedFallback ? 'warning' : 'success',
                    prompt: usedFallback ? 'נוצרה טיוטה בטוחה לבדיקה ושיפור' : prompt,
                    summary: getLatestAgentRunSummary(getWorkspaceAutomation()),
                    logs: getAgentDebugLogs().slice(-5).reverse(),
                  }));
                  setFeedbackSurvey({
                    ...DEFAULT_FEEDBACK_SURVEY,
                    open: false,
                    phase: 'details',
                    prompt,
                    templateId: templateId || 'blank',
                    usedFallback,
                  });
                } catch (error) {
                  setLiveGeneration((prev) => ({
                    ...prev,
                    active: true,
                    state: 'error',
                    logs: getAgentDebugLogs().slice(-5).reverse(),
                  }));
                  if (editor) {
                    editor.commands.setContent(`<h1>${escHtml(prompt)}</h1><p>אירעה שגיאה בזמן יצירת המסמך. אפשר לנסות שוב.</p>`);
                  }
                }
              }}
            />
          )}
          <div className="w-full flex justify-center" style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center', transition: 'transform 0.2s' }}>
            <DocumentEditor
              documentStyle={documentStyle}
              viewMode={viewMode}
              activeTemplateId={activeTemplateId}
              onReady={handleEditorReady}
              onWordCountChange={setWordCount}
              onCommand={handleCommand}
              wordPreferences={wordPreferences}
              onOpenAssistant={() => {
                setAssistantTrigger('manual');
                setLastEditorActivityAt(Date.now());
                setSidebarOpen(true);
              }}
            />
          </div>

        </div>

        {/* עט קסמים צף */}
        {!showStartScreen && <MagicWand
          sidebarOpen={sidebarOpen}
          documentContext={() => editor ? editor.getText().slice(0, 7000) : ''}
          selectedText={selectedText}
          shortcuts={shortcuts}
          onInsert={(text) => {
            if (editor) editor.chain().focus().insertContent(text).run();
          }}
        />}
      </main>

      <footer id="status-bar" className="h-6 bg-[#2B579A] text-white flex items-center justify-between px-4 text-[11px] shrink-0 z-30">
        <div className="flex items-center gap-4">
          <span>עמוד 1 מתוך {pageCount}</span>
          <span>{wordCount} מילים</span>
          <span><i className="ph ph-check text-green-400"></i> עברית (ישראל)</span>
        </div>
        <div className="flex items-center gap-4">
          <span>מצב הדפסה</span>
          <span>{zoom}%</span>
        </div>
      </footer>

      {/* File Menu Backstage */}
      {fileMenuOpen && (
        <FileMenu
          initialSettingsTab={fileMenuTargetTab}
          onClose={() => {
            setFileMenuOpen(false);
            setFileMenuTargetTab(null);
          }}
          onCommand={(cmd, value) => handleCommand(cmd, value)}
          shortcuts={shortcuts}
          onShortcutsChange={setShortcuts}
          assistantBehavior={assistantBehavior}
          onAssistantBehaviorChange={setAssistantBehavior}
          wordPreferences={wordPreferences}
          onWordPreferencesChange={setWordPreferences}
        />
      )}
    </div>
  );
}

const rootElement = document.getElementById('app');
if (rootElement) {
  class ErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { error: null }; }
    static getDerivedStateFromError(error) { return { error }; }
    componentDidCatch(error, info) {
      console.error('[ErrorBoundary]', error, info);
      if (window.__showCrashOverlay) window.__showCrashOverlay(error?.message || String(error));
    }
    render() {
      if (this.state.error) return null; // ה-overlay הוצג מ-componentDidCatch
      return this.props.children;
    }
  }
  ReactDOM.createRoot(rootElement).render(
    <ErrorBoundary><App /></ErrorBoundary>
  );
}

export default App;
