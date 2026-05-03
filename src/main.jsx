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
import OneAxisAirHockeyGame from './OneAxisAirHockeyGame';
import { getShortcutsConfig, getAssistantBehavior, getWordPreferences, saveWordPreferences, matchShortcut, getAgentDebugLogs, getLatestAgentRunSummary, getWorkspaceAutomation, getProviderConfig, getToolLinksConfig, buildExternalToolUrl, hydrateAppSettingsFromDisk, hydrateProviderConfigFromDisk, syncPersistedAppSettings, getPersonalStyleProfile, hasMeaningfulPersonalProfileData, getConfiguredProviderChoices, getRoleAgents, getProviderModelChoices, updateCurrentWorkspace } from './services/aiService';
import { buildTemplateSkeleton, generateDocumentFromPrompt, reviseDocumentWithFeedback, reviewDocumentRecommendations, saveDocumentHistory, learnFromDocumentDraft, saveHomeInstructions } from './services/workspaceLearningService';
import { downloadBrowserDocx } from './services/browserDocxExport';

const DOCUMENT_STYLE_PRESETS = {
  academic: { label: 'אקדמי', fontFamily: "'Frank Ruhl Libre', 'Times New Roman', serif", fontSize: '12pt', lineHeight: '1.9', padding: '2.8cm', maxWidth: '21cm', background: '#fffefc', textAlign: 'right' },
  legal: { label: 'משפטי', fontFamily: "'Times New Roman', 'Miriam Libre', serif", fontSize: '12.5pt', lineHeight: '2', padding: '2.6cm 2.9cm', maxWidth: '21cm', background: '#fffefe', textAlign: 'justify' },
  business: { label: 'עסקי', fontFamily: "'Segoe UI', 'Assistant', sans-serif", fontSize: '11.5pt', lineHeight: '1.65', padding: '2.4cm', maxWidth: '21cm', background: '#ffffff', textAlign: 'right' },
  presentation: { label: 'מצגת', fontFamily: "'Heebo', 'Segoe UI', sans-serif", fontSize: '15pt', lineHeight: '1.5', padding: '1.8cm', maxWidth: '25cm', background: 'linear-gradient(180deg,#ffffff 0%,#f8fbff 100%)', textAlign: 'center' },
};

const GENERATION_LABEL_FALLBACKS = {
  blank: 'מסמך חדש',
  academic: 'עבודה אקדמית',
  legal: 'מסמך משפטי',
  report: 'דוח מסודר',
  summary: 'סיכום נושא',
  office: 'מסמך משרדי',
  proposal: 'הצעה',
  letter: 'מכתב רשמי',
};

const MAGIC_WAND_SELECTION_CONTEXT_SIDE = 420;

const LIVE_GENERATION_SHELL_MARKER = 'data-wordai-live-generation-shell="true"';

const escHtml = (txt) => String(txt ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const getLiveGenerationStateMeta = (state = 'running') => {
  if (state === 'success') {
    return {
      label: 'הושלם',
      title: 'המסמך מוכן',
      description: 'התוכן המלא נטען לעורך.',
      tone: '#047857',
      background: '#ECFDF5',
      border: '#A7F3D0',
    };
  }
  if (state === 'warning') {
    return {
      label: 'ממתין לאישור',
      title: 'המסמך מוכן לבדיקה',
      description: 'נוצרה טיוטה בטוחה שממתינה לעדכון או אישור.',
      tone: '#B45309',
      background: '#FFFBEB',
      border: '#FCD34D',
    };
  }
  if (state === 'error') {
    return {
      label: 'שגיאה',
      title: 'אירעה שגיאה בתהליך',
      description: 'ההרצה נעצרה לפני שהמסמך הושלם.',
      tone: '#B91C1C',
      background: '#FEF2F2',
      border: '#FCA5A5',
    };
  }
  return {
    label: 'בתהליך',
    title: 'בונה את המסמך בלייב',
    description: 'העורך מתעדכן כאן בכל פעם שמתקבל שלב או אירוע חדש מההרצה.',
    tone: '#1D4ED8',
    background: '#EFF6FF',
    border: '#BFDBFE',
  };
};

const formatLiveGenerationTime = (value) => {
  if (!value) return '--:--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const buildLiveGenerationStageMarkup = (stages = []) => {
  const recentStages = Array.isArray(stages) ? stages.slice(0, 5) : [];
  if (!recentStages.length) {
    return '<li style="padding:8px 10px;border:1px solid #DBEAFE;border-radius:10px;background:#FFFFFF;">מאתחל שלבי ריצה...</li>';
  }
  return recentStages.map((stage) => {
    const stateLabel = stage?.state === 'success'
      ? 'הושלם'
      : stage?.state === 'error'
        ? 'שגיאה'
        : stage?.state === 'running'
          ? 'רץ עכשיו'
          : 'ממתין';
    const stateColor = stage?.state === 'success'
      ? '#047857'
      : stage?.state === 'error'
        ? '#B91C1C'
        : stage?.state === 'running'
          ? '#1D4ED8'
          : '#64748B';
    return `<li style="display:flex;justify-content:space-between;gap:12px;align-items:center;padding:8px 10px;border:1px solid #DBEAFE;border-radius:10px;background:#FFFFFF;"><span style="font-weight:600;color:#0F172A;">${escHtml(stage?.label || 'שלב לא מזוהה')}</span><span style="font-size:12px;font-weight:700;color:${stateColor};white-space:nowrap;">${stateLabel}</span></li>`;
  }).join('');
};

const buildLiveGenerationLogMarkup = (logs = []) => {
  const recentLogs = Array.isArray(logs) ? logs.slice(0, 6) : [];
  if (!recentLogs.length) {
    return '<li style="padding:8px 10px;border:1px solid #E2E8F0;border-radius:10px;background:#FFFFFF;">ממתין לאירועים הראשונים של ההרצה...</li>';
  }
  return recentLogs.map((log, index) => {
    const logTime = formatLiveGenerationTime(log?.timestamp || log?.time || log?.ts);
    const logAgent = escHtml(log?.agentLabel || log?.agentId || 'מערכת');
    const logMessage = escHtml(log?.message || log?.type || 'עודכן סטטוס תהליך');
    return `<li style="padding:8px 10px;border:1px solid #E2E8F0;border-radius:10px;background:#FFFFFF;"><div style="display:flex;justify-content:space-between;gap:12px;font-size:11px;color:#64748B;margin-bottom:4px;"><span style="font-weight:700;color:#334155;">${logAgent}</span><span>${logTime}</span></div><div style="color:#0F172A;line-height:1.55;">${logMessage}</div></li>`;
  }).join('');
};

const buildLiveGenerationShell = ({ titleText = 'מסמך חדש', state = 'running', stages = [], logs = [], runId = '' } = {}) => {
  const stateMeta = getLiveGenerationStateMeta(state);
  const safeRunId = escHtml(runId);
  return `
  <div ${LIVE_GENERATION_SHELL_MARKER} data-wordai-live-generation-run-id="${safeRunId}" data-wordai-live-generation-state="${escHtml(state)}" style="border:1px solid ${stateMeta.border};background:${stateMeta.background};padding:18px;border-radius:16px;margin-bottom:18px;">
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px;">
      <div>
        <p style="margin:0 0 6px 0;font-size:18px;font-weight:700;color:#0F172A;">${stateMeta.title}</p>
        <p style="margin:0;color:#334155;line-height:1.6;">${stateMeta.description}</p>
      </div>
      <div style="padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;color:${stateMeta.tone};background:#FFFFFF;border:1px solid ${stateMeta.border};white-space:nowrap;">${stateMeta.label}</div>
    </div>
    <h1 style="margin:0 0 10px 0;color:#0F172A;">${escHtml(titleText || 'מסמך חדש')}</h1>
    <p style="margin:0 0 14px 0;color:#334155;"><strong>סטטוס:</strong> ${stateMeta.label}</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;align-items:start;">
      <div>
        <p style="margin:0 0 8px 0;font-size:13px;font-weight:700;color:#0F172A;">שלבי הריצה האחרונים</p>
        <ul style="margin:0;padding:0;list-style:none;display:grid;gap:8px;">${buildLiveGenerationStageMarkup(stages)}</ul>
      </div>
      <div>
        <p style="margin:0 0 8px 0;font-size:13px;font-weight:700;color:#0F172A;">אירועים אחרונים</p>
        <ul style="margin:0;padding:0;list-style:none;display:grid;gap:8px;">${buildLiveGenerationLogMarkup(logs)}</ul>
      </div>
    </div>
  </div>
  <p style="margin:0;color:#475569;">התוכן המלא יחליף את ה־shell הזה אוטומטית כשההרצה תסתיים.</p>
`;
};

const isLiveGenerationShellHtml = (html = '', runId = '') => {
  const markup = String(html || '');
  if (!markup.includes(LIVE_GENERATION_SHELL_MARKER)) return false;
  if (!runId) return true;
  return markup.includes(`data-wordai-live-generation-run-id="${escHtml(runId)}"`);
};

const buildGenerationLabel = ({ promptText = '', instructionsText = '', templateId = 'blank' } = {}) => {
  const cleanPrompt = String(promptText || '').trim();
  if (cleanPrompt) return cleanPrompt;

  const lines = String(instructionsText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const preferredLine = lines.find((line, index) => index > 0 || !/^קובץ\s+הנחיות\s*:/i.test(line)) || lines[0] || '';
  const normalizedLine = preferredLine
    .replace(/^(?:[-*]+|\d+[.)])\s+/, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:!?-]+|[\s,;:!?-]+$/g, '')
    .trim();

  return normalizedLine || GENERATION_LABEL_FALLBACKS[templateId] || GENERATION_LABEL_FALLBACKS.blank;
};

const DEFAULT_BASE_DRAFT_REFINEMENT_REQUEST = 'המשתמש בחר ללטש את הטיוטה הקיימת. שפר ניסוח, סדר מבנה, תקן שגיאות ושמור על כל המידע החשוב.';

const buildBaseDraftRevisionRequest = ({ promptText = '', instructionsText = '', baseDraftTitle = '', templateId = 'blank' } = {}) => {
  const cleanPrompt = String(promptText || '').trim();
  const cleanInstructions = String(instructionsText || '').trim();
  const resolvedDraftTitle = String(baseDraftTitle || '').trim();

  if (!cleanPrompt && !cleanInstructions) {
    return {
      feedback: DEFAULT_BASE_DRAFT_REFINEMENT_REQUEST,
      title: resolvedDraftTitle ? `${resolvedDraftTitle} · ליטוש טיוטה` : 'ליטוש טיוטה',
      originalPrompt: resolvedDraftTitle || 'טיוטת בסיס',
    };
  }

  const sections = [];
  if (cleanInstructions) sections.push(`הנחיות לעדכון:\n${cleanInstructions}`);
  if (cleanPrompt) sections.push(`מטרה או הקשר:\n${cleanPrompt}`);

  return {
    feedback: sections.join('\n\n'),
    title: buildGenerationLabel({ promptText: cleanPrompt, instructionsText: cleanInstructions, templateId }),
    originalPrompt: cleanPrompt || resolvedDraftTitle || 'טיוטת בסיס',
  };
};

const shouldAutoOpenOnboarding = (profile = {}) => {
  if (String(profile?.onboardingCompletedAt || '').trim()) return false;
  if (String(profile?.onboardingDismissedAt || '').trim()) return false;
  const snoozedUntil = String(profile?.onboardingSnoozedUntil || '').trim();
  if (snoozedUntil) {
    const snoozeDate = new Date(snoozedUntil);
    if (Number.isNaN(snoozeDate.getTime())) return true;
    return snoozeDate.getTime() <= Date.now();
  }

  return !hasMeaningfulPersonalProfileData(profile);
};

const normalizeStoredDefaultFont = (value = '') => {
  const firstFamily = String(value || '').split(',')[0] || '';
  return firstFamily.replace(/^['"]+|['"]+$/g, '').trim() || 'Alef';
};

const getActiveWorkspaceId = () => String(getWorkspaceAutomation().activeWorkspaceId || '').trim();

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
  selectedMaterials: [],
  selectedModel: '',
  selectedProviderId: '',
  selectedProviderModel: '',
  selectedOptions: [],
  freeText: '',
  usedFallback: false,
  submitting: false,
  submissionRequestId: null,
  reviewResult: null,
  reviewFocus: '',
  reviewErrorMessage: '',
};

const DEFAULT_INPUT_DIALOG = {
  open: false,
  title: '',
  description: '',
  fields: [],
  values: {},
  confirmLabel: 'אישור',
  closeOnEscape: true,
  closeOnBackdrop: false,
  submitOnEnter: true,
  submitOnCtrlEnterForTextarea: true,
  resolve: null,
};

const getFeedbackSurveyGenerationContext = (survey = {}, fallback = {}) => {
  const surveyPrompt = String(survey.prompt || '').trim();
  const fallbackPrompt = String(fallback.prompt || '').trim();
  const surveyTemplateId = String(survey.templateId || '').trim();
  const fallbackTemplateId = String(fallback.templateId || '').trim();
  const surveySelectedMaterials = Array.isArray(survey.selectedMaterials) ? survey.selectedMaterials.filter(Boolean) : [];
  const fallbackSelectedMaterials = Array.isArray(fallback.selectedMaterials) ? fallback.selectedMaterials.filter(Boolean) : [];
  const surveySelectedProviderId = String(survey.selectedProviderId || survey.selectedModel || '').trim();
  const fallbackSelectedProviderId = String(fallback.selectedProviderId || fallback.selectedModel || '').trim();
  const surveySelectedProviderModel = String(survey.selectedProviderModel || '').trim();
  const fallbackSelectedProviderModel = String(fallback.selectedProviderModel || '').trim();
  const hasSurveyGenerationContext = Boolean(
    surveyPrompt
    || survey.usedFallback
    || surveySelectedMaterials.length
    || surveySelectedProviderId
    || surveySelectedProviderModel
  );

  return {
    prompt: surveyPrompt || fallbackPrompt,
    templateId: (hasSurveyGenerationContext
      ? (surveyTemplateId || fallbackTemplateId || 'blank')
      : (fallbackTemplateId || surveyTemplateId || 'blank')),
    usedFallback: Boolean(survey.usedFallback || fallback.usedFallback),
    selectedMaterials: surveySelectedMaterials.length ? [...surveySelectedMaterials] : [...fallbackSelectedMaterials],
    selectedModel: surveySelectedProviderId || fallbackSelectedProviderId,
    selectedProviderId: surveySelectedProviderId || fallbackSelectedProviderId,
    selectedProviderModel: surveySelectedProviderModel || fallbackSelectedProviderModel,
  };
};

const buildFeedbackSurveyStateWithGenerationContext = (survey = {}, fallback = {}) => ({
  ...DEFAULT_FEEDBACK_SURVEY,
  ...getFeedbackSurveyGenerationContext(survey, fallback),
});

const buildFeedbackSurveyRequestText = ({ selectedOptions = [], freeText = '', includeIntro = true } = {}) => {
  const normalizedOptions = Array.isArray(selectedOptions)
    ? selectedOptions.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const cleanFreeText = String(freeText || '').trim();
  const sections = [];

  if (normalizedOptions.length) sections.push(`נקודות לתיקון:\n- ${normalizedOptions.join('\n- ')}`);
  if (cleanFreeText) sections.push(`בקשה חופשית:\n${cleanFreeText}`);
  if (!sections.length) return '';

  return includeIntro
    ? ['המשתמש ביקש לעדכן את המסמך לפי המשוב הבא:', ...sections].join('\n\n')
    : sections.join('\n\n');
};

const getDraftTitleFromFilePath = (filePath = '') => {
  const filename = String(filePath || '').split(/[\\/]/).filter(Boolean).pop() || '';
  return filename.replace(/\.[^.]+$/, '').replace(/\s+/g, ' ').trim();
};

const getDraftTitleFromText = (text = '', templateId = 'blank') => {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const normalized = String(lines[0] || '')
    .replace(/^[#*\-\d.)\s]+/, '')
    .trim();

  if (!normalized) {
    return GENERATION_LABEL_FALLBACKS[templateId] || GENERATION_LABEL_FALLBACKS.blank;
  }

  return normalized.length > 72 ? `${normalized.slice(0, 72).trim()}...` : normalized;
};

const EXPORT_DOC_STYLES = `<style>
    body { direction: rtl; font-family: Arial, sans-serif; padding: 40px; line-height: 1.7; }
    [data-type="page-break"] { display: block; height: 0; page-break-after: always; break-after: page; }
    body > p:first-child { text-align: center; font-size: 11pt; font-weight: 700; color: #64748B; letter-spacing: 1px; margin-top: 20px; }
    body > h1:nth-child(2) { text-align: center; font-size: 28pt; color: #2B579A; margin: 0 0 10pt; }
    body > h2:nth-child(3) { text-align: center; font-size: 15pt; color: #475569; margin: 0 0 14pt; }
    body > hr:nth-child(4) { width: 96px; margin: 14px auto; border: none; border-top: 4px solid #93C5FD; }
    body > p:nth-child(5), body > p:nth-child(6) { text-align: center; color: #475569; }
  </style>`;

const isLegacyHomeEnabled = () => {
  try {
    return localStorage.getItem('wordai_legacy_home_enabled') !== 'false';
  } catch {
    return true;
  }
};

const getRecentAgentLogs = (limit = 18, filters = {}) => {
  const automation = getWorkspaceAutomation();
  const workspaceId = String(filters.workspaceId || automation?.activeWorkspaceId || 'default-content-studio').trim();
  const runId = String(filters.runId || '').trim();
  return getAgentDebugLogs({ workspaceId, runId, includeUnscoped: false }).slice(-limit).reverse();
};

function App() {
  // ביטול טיימר הפולבק לאחר שReact עשה commit ראשון לDOM
  React.useEffect(() => {
    if (window.__mountTimer) clearTimeout(window.__mountTimer);

    let isMounted = true;

    (async () => {
      try {
        await hydrateAppSettingsFromDisk().catch(() => {});
        await hydrateProviderConfigFromDisk().catch(() => {});
        if (!isMounted) return;
        setShortcuts(getShortcutsConfig());
        setAssistantBehavior(getAssistantBehavior());
        setWordPreferences(getWordPreferences());
        setDocumentStyle(localStorage.getItem('wordai_document_style') || 'academic');
        setActiveTemplateId(localStorage.getItem('wordai_active_template') || 'blank');
      } finally {
        if (isMounted) setSettingsHydrated(true);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const [editor, setEditor] = React.useState(null);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [wordCount, setWordCount] = React.useState(0);
  const [pageCount, setPageCount] = React.useState(1);
  const [zoom, setZoom] = React.useState(100);
  const [viewMode, setViewMode] = React.useState('print');
  const [fileMenuOpen, setFileMenuOpen] = React.useState(false);
  const [fileMenuTargetTab, setFileMenuTargetTab] = React.useState(null);
  const [updateCheckToken, setUpdateCheckToken] = React.useState(0);
  const [formatPainterActive, setFormatPainterActive] = React.useState(false);
  const [selectedText, setSelectedText] = React.useState('');
  const [selectionContext, setSelectionContext] = React.useState(null);
  const [currentBlockText, setCurrentBlockText] = React.useState('');
  const [trackChanges, setTrackChanges] = React.useState(false);
  const [shortcuts, setShortcuts] = React.useState(getShortcutsConfig());
  const [assistantBehavior, setAssistantBehavior] = React.useState(getAssistantBehavior());
  const [wordPreferences, setWordPreferences] = React.useState(getWordPreferences());
  const [documentStyle, setDocumentStyle] = React.useState(() => localStorage.getItem('wordai_document_style') || 'academic');
  const [activeTemplateId, setActiveTemplateId] = React.useState(() => localStorage.getItem('wordai_active_template') || 'blank');
  const [showStartScreen, setShowStartScreen] = React.useState(() => {
    if (isLegacyHomeEnabled()) return true;
    return getWordPreferences().showStartExperience !== false;
  });
  const [startScreenInstructionsResetToken, setStartScreenInstructionsResetToken] = React.useState(0);
  const [currentFilePath, setCurrentFilePath] = React.useState('');
  const [lastEditorActivityAt, setLastEditorActivityAt] = React.useState(Date.now());
  const [lastManualStyleLearningAt, setLastManualStyleLearningAt] = React.useState(0);
  const [liveGeneration, setLiveGeneration] = React.useState({
    active: false,
    state: 'idle',
    prompt: '',
    summary: getLatestAgentRunSummary(getWorkspaceAutomation()),
    logs: getRecentAgentLogs(),
    runId: '',
    workspaceId: getWorkspaceAutomation().activeWorkspaceId || '',
  });
  const [lastGenerationAction, setLastGenerationAction] = React.useState(null);
  const [generationRecovery, setGenerationRecovery] = React.useState({
    runId: '',
    agentId: '',
    provider: '',
    model: '',
    pending: false,
    error: '',
  });
  const [feedbackSurvey, setFeedbackSurvey] = React.useState({ ...DEFAULT_FEEDBACK_SURVEY });
  const [inputDialog, setInputDialog] = React.useState({ ...DEFAULT_INPUT_DIALOG });
  const [assistantTrigger, setAssistantTrigger] = React.useState('manual');
  const [settingsHydrated, setSettingsHydrated] = React.useState(false);
  const [sidebarCompact, setSidebarCompact] = React.useState(() => (typeof window !== 'undefined' ? window.innerWidth < 1180 : false));
  const activeWorkspaceIdRef = React.useRef(getActiveWorkspaceId());
  const workspaceEpochRef = React.useRef(0);
  const activeGenerationRequestIdRef = React.useRef(0);
  const lastLiveGenerationShellRef = React.useRef({ runId: '', html: '' });
  const pendingImportRef = React.useRef(null);
  const clearDraftReviewState = React.useCallback(() => {
    activeGenerationRequestIdRef.current += 1;
    lastLiveGenerationShellRef.current = { runId: '', html: '' };
    setFeedbackSurvey({ ...DEFAULT_FEEDBACK_SURVEY });
    setLiveGeneration((prev) => ({
      ...prev,
      active: false,
      state: 'idle',
      prompt: '',
      runId: '',
    }));
  }, []);
  const beginGenerationRequest = (runIdPrefix = 'doc') => {
    const requestId = activeGenerationRequestIdRef.current + 1;
    activeGenerationRequestIdRef.current = requestId;
    return {
      requestId,
      runId: `${runIdPrefix}-${Date.now()}-${requestId}`,
      workspaceEpoch: workspaceEpochRef.current,
      workspaceId: getActiveWorkspaceId(),
    };
  };
  const isGenerationRequestCurrent = (request) => (
    activeGenerationRequestIdRef.current === request.requestId
    && workspaceEpochRef.current === request.workspaceEpoch
    && getActiveWorkspaceId() === request.workspaceId
  );
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
    const savedFont = String(wordPreferences.defaultFontStack || localStorage.getItem('default-font-stack') || wordPreferences.defaultFontFamily || localStorage.getItem('default-font') || '').trim();
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

  const resolveCurrentDraftFeedbackMeta = React.useCallback(() => {
    const templateId = activeTemplateId || 'blank';
    const editorText = String(editor?.getText?.() || '').trim();
    const prompt = getDraftTitleFromFilePath(currentFilePath)
      || getDraftTitleFromText(editorText, templateId)
      || GENERATION_LABEL_FALLBACKS[templateId]
      || GENERATION_LABEL_FALLBACKS.blank;
    const surveyPrompt = String(feedbackSurvey.prompt || '').trim();
    const surveyTemplateId = String(feedbackSurvey.templateId || '').trim() || 'blank';
    const matchesActiveDraft = Boolean(surveyPrompt)
      && surveyPrompt === prompt
      && surveyTemplateId === templateId;

    return {
      prompt,
      templateId,
      selectedMaterials: matchesActiveDraft && Array.isArray(feedbackSurvey.selectedMaterials)
        ? feedbackSurvey.selectedMaterials.filter(Boolean)
        : [],
      selectedModel: matchesActiveDraft ? String(feedbackSurvey.selectedModel || '').trim() : '',
      selectedProviderId: matchesActiveDraft ? String(feedbackSurvey.selectedProviderId || '').trim() : '',
      selectedProviderModel: matchesActiveDraft ? String(feedbackSurvey.selectedProviderModel || '').trim() : '',
    };
  }, [editor, currentFilePath, feedbackSurvey.prompt, feedbackSurvey.templateId, feedbackSurvey.selectedMaterials, feedbackSurvey.selectedModel, feedbackSurvey.selectedProviderId, feedbackSurvey.selectedProviderModel, activeTemplateId]);

  const openDraftRecommendations = React.useCallback(() => {
    if (feedbackSurvey.submitting || liveGeneration.state === 'running' || !hasMeaningfulEditorContent(editor)) {
      return;
    }

    const currentDraftContext = resolveCurrentDraftFeedbackMeta();
    if (showStartScreen) {
      setShowStartScreen(false);
    }
    setFeedbackSurvey((prev) => ({
      ...buildFeedbackSurveyStateWithGenerationContext(currentDraftContext, prev),
      open: true,
      phase: 'details',
    }));
  }, [editor, feedbackSurvey.submitting, hasMeaningfulEditorContent, liveGeneration.state, resolveCurrentDraftFeedbackMeta, showStartScreen]);

  const changeDocumentStyle = React.useCallback((styleId) => {
    const nextStyle = DOCUMENT_STYLE_PRESETS[styleId] ? styleId : 'academic';
    setDocumentStyle(nextStyle);
    localStorage.setItem('wordai_document_style', nextStyle);
    syncPersistedAppSettings();
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

  const runStartTransition = React.useCallback((applyChange, focusPosition = 'start') => {
    if (!editor) {
      window.alert('העורך עדיין נטען. נסה שוב בעוד רגע.');
      return false;
    }
    applyChange(editor);
    setShowStartScreen(false);
    focusEditorSoon(focusPosition);
    return true;
  }, [editor, focusEditorSoon]);

  const openExternalLink = React.useCallback((url) => {
    if (!url) return;
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      window.location.href = url;
    }
  }, []);

  const sanitizeLinkUrl = React.useCallback((rawUrl = '') => {
    const value = String(rawUrl || '').trim();
    if (!value) return '';
    if (/^mailto:/i.test(value)) return value;
    if (/^https?:\/\//i.test(value)) return value;
    return '';
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
      closeOnEscape: config.closeOnEscape !== false,
      closeOnBackdrop: config.closeOnBackdrop === true,
      submitOnEnter: config.submitOnEnter !== false,
      submitOnCtrlEnterForTextarea: config.submitOnCtrlEnterForTextarea !== false,
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

  const submitInputDialog = React.useCallback(() => {
    closeInputDialog(inputDialog.values || {});
  }, [closeInputDialog, inputDialog.values]);

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
    const surveySnapshot = {
      ...feedbackSurvey,
      selectedOptions: [...selectedOptions],
      freeText,
      phase: 'details',
      reviewResult: null,
      reviewFocus: '',
      reviewErrorMessage: '',
    };

    if (!selectedOptions.length && !freeText) {
      alert('בחר לפחות אפשרות אחת או כתוב הערה חופשית.');
      return;
    }

    const feedbackText = buildFeedbackSurveyRequestText({
      selectedOptions,
      freeText,
      includeIntro: true,
    });

    await runDocumentFeedbackRevision({
      kind: 'feedback-revision',
      workspaceId: getActiveWorkspaceId(),
      payload: {
        existingHtml: editor?.getHTML?.() || '',
        originalPrompt: feedbackSurvey.prompt,
        templateId: feedbackSurvey.templateId || activeTemplateId || 'blank',
        feedback: feedbackText,
        selectedMaterials: Array.isArray(feedbackSurvey.selectedMaterials) ? feedbackSurvey.selectedMaterials.filter(Boolean) : [],
        selectedModel: String(feedbackSurvey.selectedModel || '').trim(),
        selectedProviderId: String(feedbackSurvey.selectedProviderId || '').trim(),
        selectedProviderModel: String(feedbackSurvey.selectedProviderModel || '').trim(),
        surveySnapshot,
      },
    });
  }, [activeTemplateId, editor, feedbackSurvey]);

  const requestDocumentRecommendations = React.useCallback(async () => {
    const selectedOptions = feedbackSurvey.selectedOptions || [];
    const freeText = String(feedbackSurvey.freeText || '').trim();
    const reviewFocus = buildFeedbackSurveyRequestText({
      selectedOptions,
      freeText,
      includeIntro: false,
    });
    const surveySnapshot = {
      ...feedbackSurvey,
      selectedOptions: [...selectedOptions],
      freeText,
      phase: 'details',
      reviewResult: null,
      reviewFocus,
      reviewErrorMessage: '',
    };

    await runDocumentRecommendationsReview({
      kind: 'review-recommendations',
      workspaceId: getActiveWorkspaceId(),
      payload: {
        existingHtml: editor?.getHTML?.() || '',
        originalPrompt: feedbackSurvey.prompt,
        templateId: feedbackSurvey.templateId || activeTemplateId || 'blank',
        selectedMaterials: Array.isArray(feedbackSurvey.selectedMaterials) ? feedbackSurvey.selectedMaterials.filter(Boolean) : [],
        selectedModel: String(feedbackSurvey.selectedModel || '').trim(),
        selectedProviderId: String(feedbackSurvey.selectedProviderId || '').trim(),
        selectedProviderModel: String(feedbackSurvey.selectedProviderModel || '').trim(),
        focus: reviewFocus,
        surveySnapshot,
      },
    });
  }, [activeTemplateId, editor, feedbackSurvey]);

  const closeFeedbackSurvey = React.useCallback(() => {
    setFeedbackSurvey((prev) => {
      if (prev.submitting) {
        return prev;
      }

      return {
        ...buildFeedbackSurveyStateWithGenerationContext(prev),
        open: false,
        phase: 'details',
      };
    });
  }, []);

  const approveFeedbackSurvey = React.useCallback(() => {
    setFeedbackSurvey((prev) => ({
      ...buildFeedbackSurveyStateWithGenerationContext(prev),
      open: false,
      phase: 'details',
    }));
    setLiveGeneration((prev) => ({ ...prev, active: false }));
  }, []);

  const currentWorkspaceId = getActiveWorkspaceId();
  const currentProviderConfig = getProviderConfig();
  const configuredProviderChoices = getConfiguredProviderChoices(currentProviderConfig);
  const liveGenerationStages = Array.isArray(liveGeneration.summary?.stages) ? liveGeneration.summary.stages : [];
  const failedGenerationStage = liveGeneration.state === 'error'
    ? [...liveGenerationStages].reverse().find((stage) => stage?.state === 'error' && stage?.id) || null
    : null;
  const activeWorkspaceAgents = lastGenerationAction?.workspaceId === currentWorkspaceId && liveGeneration.workspaceId === currentWorkspaceId
    ? getRoleAgents()
    : [];
  const failedStageAgentRecord = failedGenerationStage
    ? activeWorkspaceAgents.find((agent) => agent.id === failedGenerationStage.id) || null
    : null;
  const failedStageCurrentProvider = failedStageAgentRecord?.provider || failedGenerationStage?.provider || '';
  const failedStageCurrentModel = failedStageAgentRecord?.model || failedGenerationStage?.model || '';
  const recoveryModelChoices = getProviderModelChoices(
    generationRecovery.provider || failedStageCurrentProvider,
    currentProviderConfig,
    [failedGenerationStage?.model, failedStageAgentRecord?.model].filter(Boolean),
  );
  const canRetryFailedGeneration = Boolean(
    liveGeneration.state === 'error'
    && failedGenerationStage?.id
    && failedStageAgentRecord
    && lastGenerationAction?.payload
    && lastGenerationAction.workspaceId === currentWorkspaceId
    && liveGeneration.workspaceId === currentWorkspaceId
    && configuredProviderChoices.length
  );
  const failedStageProviderLabel = configuredProviderChoices.find((item) => item.id === failedStageCurrentProvider)?.label || failedStageCurrentProvider || 'לא הוגדר';
  const failedStageModelLabel = failedStageCurrentModel || 'לא הוגדר';

  React.useEffect(() => {
    if (!canRetryFailedGeneration) {
      setGenerationRecovery((prev) => (
        prev.runId || prev.agentId || prev.provider || prev.model || prev.error || prev.pending
          ? { runId: '', agentId: '', provider: '', model: '', pending: false, error: '' }
          : prev
      ));
      return;
    }

    const initialProvider = configuredProviderChoices.some((item) => item.id === failedStageCurrentProvider)
      ? failedStageCurrentProvider
      : (configuredProviderChoices[0]?.id || '');
    const initialModels = getProviderModelChoices(initialProvider, currentProviderConfig, [failedGenerationStage?.model, failedStageAgentRecord?.model].filter(Boolean));
    const preferredModel = failedStageCurrentModel && initialModels.includes(failedStageCurrentModel)
      ? failedStageCurrentModel
      : (initialModels[0] || '');

    setGenerationRecovery((prev) => {
      if (prev.runId === liveGeneration.runId && prev.agentId === failedGenerationStage.id) {
        return prev;
      }
      return {
        runId: liveGeneration.runId,
        agentId: failedGenerationStage.id,
        provider: initialProvider,
        model: preferredModel,
        pending: false,
        error: '',
      };
    });
  }, [canRetryFailedGeneration, configuredProviderChoices, currentProviderConfig, failedGenerationStage, failedStageAgentRecord, failedStageCurrentModel, failedStageCurrentProvider, liveGeneration.runId]);

  const handleRecoveryProviderChange = React.useCallback((event) => {
    const nextProvider = String(event.target.value || '').trim();
    const nextModels = getProviderModelChoices(nextProvider, getProviderConfig(), [failedGenerationStage?.model, failedStageAgentRecord?.model].filter(Boolean));
    setGenerationRecovery((prev) => ({
      ...prev,
      provider: nextProvider,
      model: nextModels[0] || '',
      error: '',
    }));
  }, [failedGenerationStage, failedStageAgentRecord]);

  const handleRecoveryModelChange = React.useCallback((event) => {
    const nextModel = String(event.target.value || '').trim();
    setGenerationRecovery((prev) => ({
      ...prev,
      model: nextModel,
      error: '',
    }));
  }, []);

  const retryFailedGenerationWithUpdatedAgent = React.useCallback(async () => {
    if (!canRetryFailedGeneration || generationRecovery.pending) return;

    const nextProvider = String(generationRecovery.provider || '').trim();
    const nextModel = String(generationRecovery.model || '').trim();
    if (!nextProvider || !nextModel) {
      setGenerationRecovery((prev) => ({ ...prev, error: 'בחר provider ומודל תקפים לפני ההרצה מחדש.' }));
      return;
    }

    const latestEditorHtml = editor?.getHTML?.() || '';
    const agents = getRoleAgents();
    const targetAgent = agents.find((agent) => agent.id === failedGenerationStage.id);
    if (!targetAgent) {
      setGenerationRecovery((prev) => ({ ...prev, error: 'לא מצאתי את הסוכן שנכשל בסביבת העבודה הפעילה.' }));
      return;
    }

    const updated = updateCurrentWorkspace({
      agents: agents.map((agent) => (agent.id === targetAgent.id ? { ...agent, provider: nextProvider, model: nextModel } : agent)),
    });
    if (!updated) {
      setGenerationRecovery((prev) => ({ ...prev, error: 'לא הצלחתי לעדכן את הסוכן בסביבת העבודה הפעילה.' }));
      return;
    }

    setGenerationRecovery((prev) => ({ ...prev, pending: true, error: '' }));
    try {
      const started = await runStoredGenerationAction({
        ...lastGenerationAction,
        workspaceId: currentWorkspaceId,
        payload: {
          ...(lastGenerationAction?.payload || {}),
          ...((lastGenerationAction?.kind === 'feedback-revision' || lastGenerationAction?.kind === 'review-recommendations')
            ? { existingHtml: latestEditorHtml }
            : {}),
        },
      }, { skipConfirmReplace: true });
      if (!started) {
        setGenerationRecovery((prev) => ({ ...prev, error: 'לא הצלחתי להפעיל מחדש את הפעולה האחרונה.' }));
      }
    } finally {
      setGenerationRecovery((prev) => ({ ...prev, pending: false }));
    }
  }, [canRetryFailedGeneration, currentWorkspaceId, editor, failedGenerationStage, generationRecovery.model, generationRecovery.pending, generationRecovery.provider, lastGenerationAction]);

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
    const syncLiveGeneration = (event) => {
      const nextAutomation = getWorkspaceAutomation();
      const nextWorkspaceId = getActiveWorkspaceId();
      const previousWorkspaceId = activeWorkspaceIdRef.current;
      const isWorkspaceChange = event?.type === 'wordai-workspace-changed';
      const hasWorkspaceSwitched = isWorkspaceChange && previousWorkspaceId !== nextWorkspaceId;
      if (hasWorkspaceSwitched) {
        workspaceEpochRef.current += 1;
        setFeedbackSurvey({ ...DEFAULT_FEEDBACK_SURVEY });
      }
      setLiveGeneration((prev) => {
        const scopedRunId = hasWorkspaceSwitched ? '' : String(prev.runId || '').trim();
        const scopedWorkspaceId = nextWorkspaceId || previousWorkspaceId;
        return {
          ...(hasWorkspaceSwitched
            ? { active: false, state: 'idle', prompt: '', runId: '' }
            : prev),
          summary: getLatestAgentRunSummary(nextAutomation, scopedRunId),
          logs: getRecentAgentLogs(18, { workspaceId: scopedWorkspaceId, runId: scopedRunId }),
          runId: scopedRunId,
          workspaceId: scopedWorkspaceId,
        };
      });
      activeWorkspaceIdRef.current = nextWorkspaceId || previousWorkspaceId;
    };

    syncLiveGeneration();
    window.addEventListener('wordai-agent-logs-updated', syncLiveGeneration);
    window.addEventListener('wordai-workspace-changed', syncLiveGeneration);
    return () => {
      window.removeEventListener('wordai-agent-logs-updated', syncLiveGeneration);
      window.removeEventListener('wordai-workspace-changed', syncLiveGeneration);
    };
  }, []);

  React.useEffect(() => {
    if (!editor) return;
    if (liveGeneration.state !== 'running') {
      lastLiveGenerationShellRef.current = { runId: '', html: '' };
      return;
    }

    const currentHtml = String(editor.getHTML?.() || '');
    const lastShell = lastLiveGenerationShellRef.current;
    if (!lastShell.html || lastShell.runId !== liveGeneration.runId || currentHtml !== lastShell.html) {
      lastLiveGenerationShellRef.current = { runId: '', html: '' };
      return;
    }
    if (!isLiveGenerationShellHtml(currentHtml, liveGeneration.runId)) {
      lastLiveGenerationShellRef.current = { runId: '', html: '' };
      return;
    }

    const nextShell = buildLiveGenerationShell({
      titleText: liveGeneration.prompt || 'מסמך חדש',
      state: liveGeneration.state,
      stages: liveGeneration.summary?.stages || [],
      logs: liveGeneration.logs || [],
      runId: liveGeneration.runId,
    });

    if (currentHtml === nextShell) return;
    editor.commands.setContent(nextShell, false);
    lastLiveGenerationShellRef.current = {
      runId: liveGeneration.runId,
      html: String(editor.getHTML?.() || nextShell),
    };
  }, [editor, liveGeneration.state, liveGeneration.prompt, liveGeneration.summary, liveGeneration.logs, liveGeneration.runId]);

  // Ref allows the keyboard shortcut effect to call handleCommand without
  // adding it to the dependency array (which would cause a TDZ error since
  // handleCommand is defined later in the component body).
  const handleCommandRef = React.useRef(null);

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
        handleCommandRef.current?.('saveLocal');
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [shortcuts, editor]);

  React.useEffect(() => {
    const topmostOverlay = fileMenuOpen
      ? ''
      : inputDialog.open && inputDialog.closeOnEscape !== false
        ? 'input-dialog'
        : feedbackSurvey.open
          ? 'feedback-survey'
          : sidebarOpen && !showStartScreen
            ? 'ai-sidebar'
            : '';
    if (!topmostOverlay) return;

    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;

      if (topmostOverlay === 'input-dialog') {
        event.preventDefault();
        closeInputDialog(null);
        return;
      }

      if (topmostOverlay === 'feedback-survey') {
        event.preventDefault();
        closeFeedbackSurvey();
        return;
      }

      event.preventDefault();
      closeAssistantPopup();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [
    inputDialog.open,
    inputDialog.closeOnEscape,
    feedbackSurvey.open,
    sidebarOpen,
    fileMenuOpen,
    showStartScreen,
    closeInputDialog,
    closeFeedbackSurvey,
  ]);

  const initializedDocRef = React.useRef(false);

  const openUpdatesPanel = React.useCallback(() => {
    setFileMenuTargetTab('updates');
    setFileMenuOpen(true);
    setUpdateCheckToken((prev) => prev + 1);
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
        const { doc, selection } = editor.state;
        const { from, to, empty } = selection;
        const selectionText = empty ? '' : doc.textBetween(from, to, ' ');
        const docEnd = doc.content.size;
        setSelectedText(selectionText);
        setSelectionContext(empty ? null : {
          before: doc.textBetween(Math.max(0, from - MAGIC_WAND_SELECTION_CONTEXT_SIDE), from, ' ').trim(),
          selection: selectionText,
          after: doc.textBetween(to, Math.min(docEnd, to + MAGIC_WAND_SELECTION_CONTEXT_SIDE), ' ').trim(),
        });
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
    if (!editor || initializedDocRef.current || !settingsHydrated) return;

    const shouldShowHome = isLegacyHomeEnabled() ? true : wordPreferences.showStartExperience !== false;
    const savedDraft = wordPreferences.keepLastAutosavedVersion === false
      ? null
      : (localStorage.getItem('wordai_document_autosave') || localStorage.getItem('wordai_document'));
    const profile = getPersonalStyleProfile();

    if (shouldShowHome) {
      setShowStartScreen(true);
    } else if (savedDraft && editor.isEmpty) {
      editor.commands.setContent(savedDraft);
      focusEditorSoon('end');
    } else {
      setShowStartScreen(false);
      focusEditorSoon('start');
    }

    if (shouldAutoOpenOnboarding(profile)) {
      setFileMenuTargetTab('onboarding');
      setFileMenuOpen(true);
    }

    initializedDocRef.current = true;
  }, [editor, settingsHydrated, wordPreferences, focusEditorSoon]);

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

  const closeAssistantPopup = React.useCallback(() => {
    setSidebarOpen(false);
    setAssistantTrigger('manual');
    setLastEditorActivityAt(Date.now());
  }, []);

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

  const executeStartScreenGeneration = React.useCallback(async (action, options = {}) => {
    const payload = action?.payload || {};
    if (!editor) {
      window.alert('העורך עדיין נטען. נסה שוב בעוד רגע.');
      return false;
    }
    if (!options.skipConfirmReplace && !confirmReplaceCurrentDocument()) return false;

    const resolvedAction = {
      ...action,
      kind: 'start-screen-generate',
      workspaceId: action?.workspaceId || getActiveWorkspaceId(),
    };
    setLastGenerationAction(resolvedAction);

    const prompt = String(payload.prompt || '').trim();
    const templateId = String(payload.templateId || 'blank').trim() || 'blank';
    const instructions = String(payload.instructions || '').trim();
    const selectedMaterials = Array.isArray(payload.selectedMaterials) ? payload.selectedMaterials.filter(Boolean) : [];
    const selectedProviderId = String(payload.selectedProviderId || payload.selectedModel || '').trim();
    const selectedProviderModel = String(payload.selectedProviderModel || '').trim();
    const selectedModel = selectedProviderId;
    const requestedStyle = String(payload.documentStyle || '').trim();
    const baseDraft = payload.baseDraft && typeof payload.baseDraft === 'object' ? { ...payload.baseDraft } : null;

    setCurrentFilePath('');
    localStorage.setItem('wordai_active_template', templateId);
    syncPersistedAppSettings();
    setActiveTemplateId(templateId);
    setFeedbackSurvey({ ...DEFAULT_FEEDBACK_SURVEY });
    changeDocumentStyle(requestedStyle || documentStyle);
    setAssistantTrigger('autopilot');
    setSidebarCompact(false);
    setSidebarOpen(true);
    setShowStartScreen(false);

    const generationRequest = beginGenerationRequest('doc');
    const originWorkspaceId = generationRequest.workspaceId;
    const hasBaseDraft = Boolean(String(baseDraft?.html || '').trim());
    const baseDraftTitle = String(baseDraft?.title || baseDraft?.name || '').trim();
    const revisionRequest = hasBaseDraft
      ? buildBaseDraftRevisionRequest({
          promptText: prompt,
          instructionsText: instructions,
          baseDraftTitle,
          templateId,
        })
      : null;
    const generationLabel = hasBaseDraft
      ? String(revisionRequest?.title || baseDraftTitle || 'טיוטת בסיס').trim() || 'טיוטת בסיס'
      : buildGenerationLabel({ promptText: prompt, instructionsText: instructions, templateId });
    const initialSummary = getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId);
    const initialLogs = getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId });

    setLiveGeneration({
      active: true,
      state: 'running',
      prompt: generationLabel,
      summary: initialSummary,
      logs: initialLogs,
      runId: generationRequest.runId,
      workspaceId: originWorkspaceId,
    });

    const initialShell = buildLiveGenerationShell({
      titleText: generationLabel,
      state: 'running',
      stages: initialSummary?.stages || [],
      logs: initialLogs,
      runId: generationRequest.runId,
    });
    editor.commands.setContent(initialShell);
    lastLiveGenerationShellRef.current = {
      runId: generationRequest.runId,
      html: String(editor.getHTML?.() || initialShell),
    };
    focusEditorSoon('start');

    try {
      const result = hasBaseDraft
        ? await reviseDocumentWithFeedback({
            existingHtml: baseDraft.html,
            originalPrompt: revisionRequest?.originalPrompt || baseDraftTitle || 'טיוטת בסיס',
            templateId,
            feedback: revisionRequest?.feedback || DEFAULT_BASE_DRAFT_REFINEMENT_REQUEST,
            selectedMaterials,
            selectedModel,
            selectedProviderId,
            selectedProviderModel,
            forceDirectMode: false,
            runId: generationRequest.runId,
            returnMeta: true,
          })
        : await generateDocumentFromPrompt({ prompt, templateId, instructions, selectedMaterials, selectedModel, selectedProviderId, selectedProviderModel, runId: generationRequest.runId, returnMeta: true });
      const resolvedTitle = hasBaseDraft
        ? String(generationLabel || baseDraftTitle || 'טיוטת בסיס').trim()
        : String(result?.title || generationLabel || 'מסמך חדש').trim();
      const generated = result?.html || (hasBaseDraft
        ? String(baseDraft?.html || '').trim() || `<h1>${escHtml(resolvedTitle)}</h1><p>לא נוצר תוכן.</p>`
        : `<h1>${escHtml(resolvedTitle)}</h1><p>לא נוצר תוכן.</p>`);
      const usedFallback = Boolean(result?.usedFallback);
      if (!isGenerationRequestCurrent(generationRequest)) return true;

      lastLiveGenerationShellRef.current = { runId: '', html: '' };
      editor.commands.setContent(generated);
      saveDocumentHistory({ title: resolvedTitle, content: generated, templateId, source: 'start-screen' });
      persistLocalCache(generated);
      setLiveGeneration((prev) => ({ ...prev, active: true, state: usedFallback ? 'warning' : 'success', prompt: usedFallback ? 'נוצרה טיוטה בטוחה לבדיקה ושיפור' : resolvedTitle, summary: getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId), logs: getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId }), runId: generationRequest.runId, workspaceId: originWorkspaceId }));
      setFeedbackSurvey({
        ...buildFeedbackSurveyStateWithGenerationContext({}, {
          prompt: resolvedTitle,
          templateId,
          usedFallback,
          selectedMaterials,
          selectedModel,
          selectedProviderId,
          selectedProviderModel,
        }),
        open: false,
        phase: 'details',
      });
    } catch (error) {
      if (!isGenerationRequestCurrent(generationRequest)) return true;
      setLiveGeneration((prev) => ({ ...prev, active: true, state: 'error', prompt: hasBaseDraft ? 'עדכון טיוטת הבסיס נכשל' : 'יצירת המסמך נכשלה', summary: getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId), logs: getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId }), runId: generationRequest.runId, workspaceId: originWorkspaceId }));
      lastLiveGenerationShellRef.current = { runId: '', html: '' };
      editor.commands.setContent(`<h1>${escHtml(generationLabel)}</h1><p>אירעה שגיאה בזמן יצירת המסמך. אפשר לנסות שוב.</p>`);
    }

    return true;
  }, [beginGenerationRequest, changeDocumentStyle, confirmReplaceCurrentDocument, documentStyle, editor, focusEditorSoon, isGenerationRequestCurrent, persistLocalCache]);

  const runDocumentFeedbackRevision = React.useCallback(async (action) => {
    const payload = action?.payload || {};
    const resolvedAction = {
      ...action,
      kind: 'feedback-revision',
      workspaceId: action?.workspaceId || getActiveWorkspaceId(),
    };
    setLastGenerationAction(resolvedAction);

    const surveySnapshot = payload.surveySnapshot && typeof payload.surveySnapshot === 'object'
      ? { ...payload.surveySnapshot }
      : { ...DEFAULT_FEEDBACK_SURVEY };
    const generationRequest = beginGenerationRequest('doc-feedback');
    const originWorkspaceId = generationRequest.workspaceId;
    setFeedbackSurvey((prev) => ({
      ...prev,
      open: false,
      phase: 'details',
      submitting: true,
      submissionRequestId: generationRequest.requestId,
    }));
    setAssistantTrigger('manual');
    setSidebarOpen(true);
    setLiveGeneration({
      active: true,
      state: 'running',
      prompt: 'מעדכן את המסמך לפי המשוב שלך',
      summary: getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId),
      logs: getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId }),
      runId: generationRequest.runId,
      workspaceId: originWorkspaceId,
    });

    const clearHiddenFeedbackSubmittingAfterStale = () => {
      setFeedbackSurvey((prev) => {
        if (prev.submissionRequestId !== generationRequest.requestId || prev.open || !prev.submitting) {
          return prev;
        }

        return {
          ...prev,
          submitting: false,
          submissionRequestId: null,
        };
      });
    };

    try {
      const templateId = String(payload.templateId || activeTemplateId || 'blank').trim() || 'blank';
      const selectedMaterials = Array.isArray(payload.selectedMaterials) ? payload.selectedMaterials.filter(Boolean) : [];
      const selectedProviderId = String(payload.selectedProviderId || payload.selectedModel || '').trim();
      const selectedProviderModel = String(payload.selectedProviderModel || '').trim();
      const selectedModel = selectedProviderId;
      const result = await reviseDocumentWithFeedback({
        existingHtml: payload.existingHtml || editor?.getHTML?.() || '',
        originalPrompt: payload.originalPrompt,
        templateId,
        feedback: payload.feedback || '',
        selectedMaterials,
        selectedModel,
        selectedProviderId,
        selectedProviderModel,
        runId: generationRequest.runId,
        returnMeta: true,
      });

      const revisedHtml = result?.html || payload.existingHtml || editor?.getHTML?.() || '';
      const usedFallback = Boolean(result?.usedFallback);
      if (!isGenerationRequestCurrent(generationRequest)) {
        clearHiddenFeedbackSubmittingAfterStale();
        return true;
      }

      if (editor && revisedHtml) {
        lastLiveGenerationShellRef.current = { runId: '', html: '' };
        editor.commands.setContent(revisedHtml);
      }

      persistLocalCache(revisedHtml);
      saveDocumentHistory({
        title: `${payload.originalPrompt || 'מסמך'} · תיקון לפי משוב`,
        content: revisedHtml,
        templateId,
        source: 'feedback-revision',
      });

      setLiveGeneration({
        active: true,
        state: usedFallback ? 'warning' : 'success',
        prompt: usedFallback ? 'נשמרה הגרסה הקודמת כי העדכון לא הושלם במלואו' : 'המסמך עודכן לפי המשוב שלך',
        summary: getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId),
        logs: getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId }),
        runId: generationRequest.runId,
        workspaceId: originWorkspaceId,
      });

      setFeedbackSurvey({
        ...buildFeedbackSurveyStateWithGenerationContext(surveySnapshot, {
          prompt: payload.originalPrompt,
          templateId,
          usedFallback,
          selectedMaterials,
          selectedModel,
          selectedProviderId,
          selectedProviderModel,
        }),
        open: false,
        phase: 'details',
        usedFallback,
      });

      if (usedFallback && result?.errorMessage) {
        alert(`לא הצלחתי ליישם את כל ההערות: ${result.errorMessage}`);
      }
    } catch (error) {
      if (!isGenerationRequestCurrent(generationRequest)) {
        clearHiddenFeedbackSubmittingAfterStale();
        return true;
      }
      setFeedbackSurvey({
        ...surveySnapshot,
        open: true,
        phase: 'details',
        submitting: false,
      });
      setLiveGeneration({
        active: true,
        state: 'error',
        prompt: 'עדכון המסמך נכשל',
        summary: getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId),
        logs: getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId }),
        runId: generationRequest.runId,
        workspaceId: originWorkspaceId,
      });
      alert(error?.message || 'לא הצלחתי לעדכן את המסמך לפי המשוב.');
    }

    return true;
  }, [activeTemplateId, beginGenerationRequest, editor, isGenerationRequestCurrent, persistLocalCache]);

  const runDocumentRecommendationsReview = React.useCallback(async (action) => {
    const payload = action?.payload || {};
    const resolvedAction = {
      ...action,
      kind: 'review-recommendations',
      workspaceId: action?.workspaceId || getActiveWorkspaceId(),
    };
    setLastGenerationAction(resolvedAction);

    const surveySnapshot = payload.surveySnapshot && typeof payload.surveySnapshot === 'object'
      ? { ...payload.surveySnapshot }
      : { ...DEFAULT_FEEDBACK_SURVEY };
    const generationRequest = beginGenerationRequest('doc-review');
    const originWorkspaceId = generationRequest.workspaceId;
    setFeedbackSurvey((prev) => ({
      ...prev,
      open: true,
      phase: 'review',
      submitting: true,
      submissionRequestId: generationRequest.requestId,
      reviewResult: null,
      reviewFocus: String(payload.focus || '').trim(),
      reviewErrorMessage: '',
    }));
    setAssistantTrigger('manual');
    setSidebarOpen(true);
    setLiveGeneration({
      active: true,
      state: 'running',
      prompt: 'מכין המלצות עריכה למסמך',
      summary: getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId),
      logs: getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId }),
      runId: generationRequest.runId,
      workspaceId: originWorkspaceId,
    });

    const clearHiddenReviewSubmittingAfterStale = () => {
      setFeedbackSurvey((prev) => {
        if (prev.submissionRequestId !== generationRequest.requestId || !prev.submitting) {
          return prev;
        }

        return {
          ...prev,
          submitting: false,
          submissionRequestId: null,
        };
      });
    };

    try {
      const templateId = String(payload.templateId || activeTemplateId || 'blank').trim() || 'blank';
      const selectedMaterials = Array.isArray(payload.selectedMaterials) ? payload.selectedMaterials.filter(Boolean) : [];
      const selectedProviderId = String(payload.selectedProviderId || payload.selectedModel || '').trim();
      const selectedProviderModel = String(payload.selectedProviderModel || '').trim();
      const selectedModel = selectedProviderId;
      const reviewFocus = String(payload.focus || '').trim();
      const result = await reviewDocumentRecommendations({
        existingHtml: payload.existingHtml || editor?.getHTML?.() || '',
        originalPrompt: payload.originalPrompt,
        templateId,
        selectedMaterials,
        selectedModel,
        selectedProviderId,
        selectedProviderModel,
        focus: reviewFocus,
        runId: generationRequest.runId,
        returnMeta: true,
      });

      if (!isGenerationRequestCurrent(generationRequest)) {
        clearHiddenReviewSubmittingAfterStale();
        return true;
      }

      setFeedbackSurvey((prev) => {
        if (prev.submissionRequestId !== generationRequest.requestId) return prev;

        return {
          ...prev,
          phase: 'review',
          submitting: false,
          submissionRequestId: null,
          reviewFocus,
          reviewErrorMessage: String(result?.errorMessage || '').trim(),
          reviewResult: {
            summary: String(result?.summary || '').trim(),
            suggestions: Array.isArray(result?.suggestions) ? result.suggestions : [],
            usedFallback: Boolean(result?.usedFallback),
          },
        };
      });

      setLiveGeneration((prev) => (prev.runId !== generationRequest.runId ? prev : {
        ...prev,
        active: false,
        state: 'idle',
        prompt: '',
        summary: getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId),
        logs: getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId }),
        runId: '',
        workspaceId: originWorkspaceId,
      }));
    } catch (error) {
      if (!isGenerationRequestCurrent(generationRequest)) {
        clearHiddenReviewSubmittingAfterStale();
        return true;
      }

      setFeedbackSurvey({
        ...surveySnapshot,
        open: true,
        phase: 'details',
        submitting: false,
        submissionRequestId: null,
        reviewResult: null,
        reviewErrorMessage: '',
      });
      setLiveGeneration({
        active: true,
        state: 'error',
        prompt: 'הכנת המלצות העריכה נכשלה',
        summary: getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId),
        logs: getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId }),
        runId: generationRequest.runId,
        workspaceId: originWorkspaceId,
      });
      alert(error?.message || 'לא הצלחתי להכין המלצות עריכה למסמך.');
    }

    return true;
  }, [activeTemplateId, beginGenerationRequest, editor, isGenerationRequestCurrent]);

  const runStoredGenerationAction = React.useCallback(async (action, options = {}) => {
    if (!action?.kind) return false;
    if (action.kind === 'start-screen-generate') return executeStartScreenGeneration(action, options);
    if (action.kind === 'feedback-revision') return runDocumentFeedbackRevision(action);
    if (action.kind === 'review-recommendations') return runDocumentRecommendationsReview(action);
    return false;
  }, [executeStartScreenGeneration, runDocumentFeedbackRevision, runDocumentRecommendationsReview]);

  const clearPersistedDraftCache = React.useCallback(() => {
    localStorage.removeItem('wordai_document');
    localStorage.removeItem('wordai_document_autosave');
    localStorage.removeItem('wordai_document_autosave_at');
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

    clearDraftReviewState();
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
    syncPersistedAppSettings();
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
  }, [editor, confirmReplaceCurrentDocument, clearDraftReviewState, focusEditorSoon, persistLocalCache, applyDocumentStyleToEditor, documentStyle]);

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

  const buildDesktopSavePayload = React.useCallback((preferredExtension = 'docx') => {
    const currentPreset = DOCUMENT_STYLE_PRESETS[documentStyle] || DOCUMENT_STYLE_PRESETS.academic;
    const html = editor?.getHTML?.() || '';
    const text = editor?.getText?.() || '';
    const fontStack = String(
      wordPreferences.defaultFontStack
      || localStorage.getItem('default-font-stack')
      || wordPreferences.defaultFontFamily
      || localStorage.getItem('default-font')
      || currentPreset.fontFamily
      || ''
    ).trim();
    const fontSize = String(
      wordPreferences.defaultFontSize
      || localStorage.getItem('default-size')
      || currentPreset.fontSize
      || '12pt'
    ).trim();

    return {
      title: text.trim().slice(0, 60) || 'מסמך',
      html,
      text,
      preferredExtension,
      exportOptions: {
        documentStyle,
        fontStack,
        fontSize,
        language: 'he-IL',
        disableProofing: false,
      },
    };
  }, [documentStyle, editor, wordPreferences.defaultFontFamily, wordPreferences.defaultFontSize, wordPreferences.defaultFontStack]);

  const downloadBrowserDocxOrAlert = React.useCallback(async (preferredExtension = 'docx') => {
    try {
      return await downloadBrowserDocx(buildDesktopSavePayload(preferredExtension));
    } catch (error) {
      console.error('Browser DOCX export failed:', error);
      window.alert(error?.message || 'לא הצלחתי לשמור את קובץ ה-Word בדפדפן.');
      return { handled: false, canceled: false, error };
    }
  }, [buildDesktopSavePayload]);



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
        const currentFontStack = String(editor.getAttributes('textStyle')?.fontFamily || window.getComputedStyle(editor.view.dom).fontFamily || 'Alef').trim();
        const currentFont = normalizeStoredDefaultFont(currentFontStack);
        const currentSize = editor.getAttributes('textStyle')?.fontSize || window.getComputedStyle(editor.view.dom).fontSize || '12pt';
        localStorage.setItem('default-font', currentFont);
        localStorage.setItem('default-font-stack', currentFontStack || currentFont);
        localStorage.setItem('default-size', currentSize);
        saveWordPreferences({
          ...wordPreferences,
          defaultFontFamily: currentFont,
          defaultFontStack: currentFontStack || currentFont,
          defaultFontSize: currentSize,
        });
        setWordPreferences((prev) => ({
          ...prev,
          defaultFontFamily: currentFont,
          defaultFontStack: currentFontStack || currentFont,
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
      case 'insertLink': {
        const href = sanitizeLinkUrl(value);
        if (href) editor.chain().focus().setLink({ href }).run();
        break;
      }
      case 'insertLinkDialog': {
        const result = await requestInputDialog({
          title: 'הוספת קישור מהיר',
          description: 'הדבק כתובת. אפשר להגדיר גם טקסט להצגה במקום הכתובת.',
          fields: [
            { id: 'url', label: 'כתובת URL', placeholder: 'https://...' },
            { id: 'text', label: 'טקסט להצגה (אופציונלי)', placeholder: 'למשל: מקור אקדמי מלא' },
          ],
          confirmLabel: 'הוסף קישור',
        });
        const href = sanitizeLinkUrl(result?.url || '');
        const text = String(result?.text || '').trim();
        if (!href) break;
        if (!editor.state.selection.empty) {
          editor.chain().focus().setLink({ href }).run();
          break;
        }
        const content = text || href;
        editor.chain().focus().insertContent(`<a href="${escHtml(href)}" target="_blank" rel="noopener noreferrer">${escHtml(content)}</a>`).run();
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
        const config = getProviderConfig();
        const googleUrlTemplate = String(getToolLinksConfig(config)?.googleSearch?.url || '');
        if (googleUrlTemplate && !googleUrlTemplate.includes('{query}')) {
          const url = buildExternalToolUrl('googleSearch', '', config);
          if (url) openExternalLink(url);
          break;
        }

        const initial = String(selectedText || currentBlockText || '').trim();
        const result = await requestInputDialog({
          title: 'חיפוש בגוגל',
          fields: [
            { id: 'query', label: 'מה לחפש?', placeholder: 'נושא, מושג או שאלה', value: initial },
          ],
          confirmLabel: 'פתח חיפוש',
        });
        if (result?.query) {
          const url = buildExternalToolUrl('googleSearch', String(result.query).trim(), config);
          if (url) openExternalLink(url);
        }
        break;
      }
      case 'searchScholar': {
        const config = getProviderConfig();
        const scholarUrlTemplate = String(getToolLinksConfig(config)?.scholar?.url || '');
        if (scholarUrlTemplate && !scholarUrlTemplate.includes('{query}')) {
          const url = buildExternalToolUrl('scholar', '', config);
          if (url) openExternalLink(url);
          break;
        }

        const initial = String(selectedText || currentBlockText || '').trim();
        const result = await requestInputDialog({
          title: 'חיפוש ב-Google Scholar',
          description: 'אפשר לחפש נושא, מאמר, חוקר או מילות מפתח.',
          fields: [
            { id: 'query', label: 'מונח חיפוש', placeholder: 'למשל: legal writing pedagogy', value: initial },
          ],
          confirmLabel: 'פתח Scholar',
        });
        if (result?.query) {
          const url = buildExternalToolUrl('scholar', String(result.query).trim(), config);
          if (url) openExternalLink(url);
        }
        break;
      }
      case 'openOrbit': {
        const url = buildExternalToolUrl('orbit', '', getProviderConfig());
        if (url) openExternalLink(url);
        break;
      }
      case 'openModelHub': {
        const url = buildExternalToolUrl('modelHub', '', getProviderConfig());
        if (url) openExternalLink(url);
        break;
      }
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
          const shouldShowStartExperience = isLegacyHomeEnabled() ? true : wordPreferences.showStartExperience !== false;
          clearDraftReviewState();
          editor.chain().focus().clearContent().run();
          localStorage.removeItem('wordai_document_autosave');
          localStorage.removeItem('wordai_document_autosave_at');
          localStorage.removeItem('wordai_document');
          saveHomeInstructions('');
          setStartScreenInstructionsResetToken((prev) => prev + 1);
          setCurrentFilePath('');
          localStorage.setItem('wordai_active_template', 'blank');
          syncPersistedAppSettings();
          setActiveTemplateId('blank');
          setShowStartScreen(shouldShowStartExperience);
        }
        break;
      }
      case 'saveLocal': {
        const html = editor.getHTML();
        const text = editor.getText();
        persistLocalCache(html);

        if (window.desktopApp?.saveDocumentDialog) {
          const ext = String(currentFilePath || '').toLowerCase().split('.').pop();
          const canSaveDirectly = Boolean(currentFilePath) && ['txt', 'html', 'htm', 'docx'].includes(ext);
          const result = await window.desktopApp.saveDocumentDialog({
            ...buildDesktopSavePayload(ext === 'txt' ? 'txt' : 'docx'),
            filePath: canSaveDirectly ? currentFilePath : '',
          });

          if (!result?.canceled && result?.filePath) {
            setCurrentFilePath(String(result.filePath));
            saveDocumentHistory({
              title: editor.getText().trim().slice(0, 60) || 'מסמך שמור',
              content: html,
              templateId: activeTemplateId || 'blank',
              source: 'save-local',
            });
            alert(canSaveDirectly ? 'המסמך נשמר בהצלחה במחשב.' : `המסמך נשמר בהצלחה ב:\n${result.filePath}`);
          }
          break;
        }

        const browserSaveResult = await downloadBrowserDocxOrAlert('docx');
        if (browserSaveResult?.handled && !browserSaveResult.canceled) {
          saveDocumentHistory({
            title: editor.getText().trim().slice(0, 60) || 'מסמך שמור',
            content: html,
            templateId: activeTemplateId || 'blank',
            source: 'save-local',
          });
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
        const title = editor.getText().trim().slice(0, 60) || 'מסמך שמור';

        if (window.desktopApp?.saveDocumentDialog) {
          const result = await window.desktopApp.saveDocumentDialog(buildDesktopSavePayload('docx'));

          if (!result?.canceled) {
            setCurrentFilePath(String(result.filePath || ''));
            persistLocalCache(html);
            saveDocumentHistory({
              title,
              content: html,
              templateId: activeTemplateId || 'blank',
              source: 'save-as',
            });
            alert(`המסמך נשמר בהצלחה ב:\n${result.filePath}`);
          }
          break;
        }

        const browserSaveResult = await downloadBrowserDocxOrAlert('docx');
        if (browserSaveResult?.handled && !browserSaveResult.canceled) {
          persistLocalCache(html);
          saveDocumentHistory({
            title,
            content: html,
            templateId: activeTemplateId || 'blank',
            source: 'save-as',
          });
        }
        break;
      }
      case 'exportDocx': {
        if (window.desktopApp?.saveDocumentDialog) {
          const result = await window.desktopApp.saveDocumentDialog(buildDesktopSavePayload('docx'));
          if (!result?.canceled && result?.filePath) setCurrentFilePath(String(result.filePath));
          break;
        }
        await downloadBrowserDocxOrAlert('docx');
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
        const htmlCtx = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8" /><title>WordFlow AI Document</title>${EXPORT_DOC_STYLES}</head><body>${editor.getHTML()}</body></html>`;
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
        syncPersistedAppSettings();
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
        syncPersistedAppSettings();
        editor.chain().focus().insertContent(`<sup style="color:#2B579A;cursor:pointer" title="${titleTip}">${citText}</sup>`).run();
        break;
      }
      case 'setCitationStyle':
        localStorage.setItem('citation-style', value);
        syncPersistedAppSettings();
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
  handleCommandRef.current = handleCommand;

  const hasPendingUserApproval = Boolean(feedbackSurvey.prompt || feedbackSurvey.usedFallback)
    && (liveGeneration.state === 'success' || liveGeneration.state === 'warning');
  const shouldShowProgressOnlyPanel = liveGeneration.active
    && (liveGeneration.state === 'running' || feedbackSurvey.open || hasPendingUserApproval);
  const progressLogs = Array.isArray(liveGeneration.logs) ? liveGeneration.logs : [];
  const feedbackReviewSuggestions = Array.isArray(feedbackSurvey.reviewResult?.suggestions)
    ? feedbackSurvey.reviewResult.suggestions
    : [];
  const feedbackReviewSummary = String(feedbackSurvey.reviewResult?.summary || '').trim();
  const canOpenDraftRecommendations = !feedbackSurvey.submitting
    && liveGeneration.state !== 'running'
    && hasMeaningfulEditorContent(editor);
  return (
    <div className="flex flex-col h-screen bg-[var(--page-bg,#E1DFDD)] text-[var(--text-color,#323130)] overflow-hidden" dir="rtl">
      <TopBar
        onOpenUpdates={openUpdatesPanel}
        onOpen={() => handleCommand('openFile')}
        onNew={() => handleCommand('newDoc')}
        onSave={() => handleCommand('saveLocal')}
        onSaveAs={() => handleCommand('saveAs')}
        onUndo={() => editor?.chain().focus().undo().run()}
        onRedo={() => editor?.chain().focus().redo().run()}
        onHome={() => setShowStartScreen(true)}
        onOpenDraftRecommendations={openDraftRecommendations}
        draftRecommendationsDisabled={!canOpenDraftRecommendations}
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
            className="order-last h-full min-h-0 shrink-0 border-r border-slate-300 bg-[#F8FAFC] z-20 transition-all duration-200 shadow-[8px_0_24px_rgba(15,23,42,0.06)] flex flex-col overflow-hidden"
            style={{ width: sidebarCompact ? 'min(340px, 36vw)' : 'min(460px, 44vw)', minWidth: sidebarCompact ? 280 : 340, maxWidth: sidebarCompact ? '38vw' : '520px' }}
          >
            {liveGeneration.active && (
              <div className={`${shouldShowProgressOnlyPanel ? 'h-full min-h-0 p-4' : 'border-b border-slate-200 bg-white px-3 py-3'}`}>
                <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${shouldShowProgressOnlyPanel ? 'h-full min-h-0 flex flex-col overflow-hidden p-4' : 'p-3'}`}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="text-base font-bold text-slate-900">
                        {liveGeneration.state === 'success' ? 'המסמך מוכן' : liveGeneration.state === 'warning' ? 'המסמך מוכן לבדיקה' : liveGeneration.state === 'error' ? 'אירעה שגיאה בתהליך' : 'יוצר מסמך עכשיו'}
                      </div>
                      <div className="text-xs text-slate-600 mt-1 truncate">{liveGeneration.prompt || 'מעבד את הבקשה שלך...'}</div>
                    </div>
                    <div className={`text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${liveGeneration.state === 'success' ? 'bg-emerald-100 text-emerald-700' : liveGeneration.state === 'warning' ? 'bg-amber-100 text-amber-700' : liveGeneration.state === 'error' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                      {liveGeneration.state === 'success' ? 'הושלם' : liveGeneration.state === 'warning' ? 'ממתין לאישור' : liveGeneration.state === 'error' ? 'שגיאה' : 'בתהליך'}
                    </div>
                  </div>

                  <div className={`${shouldShowProgressOnlyPanel ? 'flex-1 min-h-0 overflow-y-auto pr-1 pb-1' : ''}`}>
                    <div className="space-y-2">
                      {(liveGeneration.summary?.stages || []).slice(0, 6).map((stage) => (
                        <div key={stage.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-xs bg-slate-50">
                          <span className="font-medium text-slate-700 truncate pr-2">{stage.label}</span>
                          <span className={`font-bold ${stage.state === 'success' ? 'text-emerald-600' : stage.state === 'error' ? 'text-red-600' : stage.state === 'running' ? 'text-blue-600' : 'text-slate-400'}`}>
                            {stage.state === 'success' ? '✓' : stage.state === 'error' ? '✗' : stage.state === 'running' ? '...' : '•'}
                          </span>
                        </div>
                      ))}
                    </div>

                    {liveGeneration.state === 'running' && (
                      <OneAxisAirHockeyGame title="Arcade בזמן שהצוות עובד" compact allowPopup />
                    )}

                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-2.5">
                      <div className="text-[11px] font-bold text-slate-700 mb-2">לוג חי של ההרצה</div>
                      <div className={`${shouldShowProgressOnlyPanel ? 'max-h-[34vh]' : 'max-h-32'} overflow-auto space-y-1.5 pr-1`}>
                        {progressLogs.length ? progressLogs.map((log, index) => {
                          const logTimeValue = log?.timestamp || log?.time || log?.ts;
                          const logTime = logTimeValue ? new Date(logTimeValue).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--';
                          const logAgent = String(log?.agentLabel || log?.agentId || 'מערכת');
                          const logMessage = String(log?.message || log?.type || 'עודכן סטטוס תהליך');
                          return (
                            <div key={`${logTime}-${logAgent}-${index}`} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                              <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 mb-0.5">
                                <span className="font-semibold text-slate-600 truncate">{logAgent}</span>
                                <span>{logTime}</span>
                              </div>
                              <div className="text-[11px] text-slate-700 leading-4">{logMessage}</div>
                            </div>
                          );
                        }) : (
                          <div className="text-[11px] text-slate-500 px-1 py-1">הלוגים יופיעו כאן בזמן אמת...</div>
                        )}
                      </div>
                    </div>

                    {canRetryFailedGeneration && (
                      <div className="mt-3 rounded-xl border border-red-200 bg-red-50/80 p-3">
                        <div className="text-[11px] font-bold text-red-700">הסוכן שנכשל: {failedGenerationStage?.label || failedStageAgentRecord?.name || 'לא זוהה'}</div>
                        <div className="mt-1 text-[11px] leading-4 text-slate-700">
                          ההרצה נעצרה ב־{failedStageProviderLabel} / {failedStageModelLabel}. אפשר לעדכן רק את הסוכן הזה ולהפעיל מחדש את אותה פעולה מההתחלה.
                        </div>

                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <label className="block text-[11px] text-slate-700">
                            <span className="mb-1 block font-semibold">Provider חלופי</span>
                            <select
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[12px] text-slate-800 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                              value={generationRecovery.provider}
                              onChange={handleRecoveryProviderChange}
                              disabled={generationRecovery.pending}
                            >
                              {configuredProviderChoices.map((provider) => (
                                <option key={provider.id} value={provider.id}>{provider.label}</option>
                              ))}
                            </select>
                          </label>

                          <label className="block text-[11px] text-slate-700">
                            <span className="mb-1 block font-semibold">מודל חלופי</span>
                            <select
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[12px] text-slate-800 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                              value={generationRecovery.model}
                              onChange={handleRecoveryModelChange}
                              disabled={generationRecovery.pending || !recoveryModelChoices.length}
                            >
                              {recoveryModelChoices.map((model) => (
                                <option key={model} value={model}>{model}</option>
                              ))}
                            </select>
                          </label>
                        </div>

                        {generationRecovery.error && (
                          <div className="mt-2 text-[11px] font-medium text-red-700">{generationRecovery.error}</div>
                        )}

                        <button
                          className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-red-600 px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
                          onClick={retryFailedGenerationWithUpdatedAgent}
                          disabled={generationRecovery.pending || !generationRecovery.provider || !generationRecovery.model}
                        >
                          {generationRecovery.pending ? 'מעדכן סוכן ומריץ מחדש...' : 'החלף מודל והרץ מחדש'}
                        </button>
                      </div>
                    )}

                    {(liveGeneration.state === 'success' || liveGeneration.state === 'warning') && (feedbackSurvey.prompt || feedbackSurvey.usedFallback) && (
                      <div className="mt-3 flex gap-2">
                        <button
                          className="btn btn-sm btn-primary flex-1"
                          onClick={() => setFeedbackSurvey((prev) => ({ ...prev, open: true, phase: 'details' }))}
                        >
                          בקש תיקונים
                        </button>
                        <button
                          className="btn btn-sm btn-ghost flex-1"
                          onClick={() => setLiveGeneration((prev) => ({ ...prev, active: false }))}
                        >
                          אשר והמשך לערוך
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!shouldShowProgressOnlyPanel && (
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
            )}
          </aside>
        )}

        <div id="editor-wrapper" className={`flex-1 min-w-0 overflow-y-auto overflow-x-auto p-8 justify-center items-start bg-[#E1DFDD] relative ${showStartScreen ? '!hidden' : 'flex'}`} style={{ display: showStartScreen ? 'none' : 'flex' }}>
          {inputDialog.open && (
            <div
              className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 transition-all duration-300"
              dir="rtl"
              onMouseDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (inputDialog.closeOnBackdrop) closeInputDialog(null);
              }}
            >
              <div className="w-[520px] max-w-[96%] rounded-[24px] bg-white shadow-2xl border border-slate-200 p-6 md:p-8 transform transition-all scale-100 opacity-100 flex flex-col gap-6">
                
                {/* Header */}
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                  <div className="flex-1 text-right">
                    <h3 className="text-2xl font-bold text-slate-800 tracking-tight">{inputDialog.title || 'השלם פרטים'}</h3>
                    {inputDialog.description ? <p className="text-sm text-slate-500 mt-2 leading-relaxed">{inputDialog.description}</p> : null}
                  </div>
                  <button 
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors flex-shrink-0" 
                    onClick={() => closeInputDialog(null)}
                    title="סגור"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>

                {/* Body */}
                <div className="space-y-5">
                  {(inputDialog.fields || []).map((field, idx) => (
                    <label key={field.id} className="block text-right group">
                      <div className="text-sm font-semibold text-slate-700 mb-2">{field.label}</div>
                      {field.type === 'textarea' ? (
                        <textarea
                          autoFocus={idx === 0}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none min-h-[120px] resize-y"
                          placeholder={field.placeholder || ''}
                          value={inputDialog.values?.[field.id] || ''}
                          onChange={(e) => setInputDialog((prev) => ({
                            ...prev,
                            values: { ...prev.values, [field.id]: e.target.value },
                          }))}
                          onKeyDown={(e) => {
                            if (inputDialog.submitOnCtrlEnterForTextarea && e.key === 'Enter' && e.ctrlKey) {
                              e.preventDefault();
                              submitInputDialog();
                            }
                          }}
                        />
                      ) : (
                        <input
                          type={field.type || 'text'}
                          autoFocus={idx === 0}
                          dir="rtl"
                          className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl ${field.id === 'url' ? 'text-left dir-ltr font-mono text-sm' : 'text-slate-800'} placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none`}
                          placeholder={field.placeholder || ''}
                          value={inputDialog.values?.[field.id] || ''}
                          onChange={(e) => setInputDialog((prev) => ({
                            ...prev,
                            values: { ...prev.values, [field.id]: e.target.value },
                          }))}
                          onKeyDown={(e) => {
                            if (inputDialog.submitOnEnter && e.key === 'Enter') {
                              e.preventDefault();
                              submitInputDialog();
                            }
                          }}
                        />
                      )}
                    </label>
                  ))}
                </div>

                {/* Footer */}
                <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                  <button 
                    className="px-6 py-2.5 rounded-xl font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors" 
                    onClick={() => closeInputDialog(null)}
                  >
                    ביטול
                  </button>
                  <button 
                    className="px-8 py-2.5 rounded-xl font-semibold text-white bg-[#0066cc] hover:bg-blue-700 shadow-sm hover:shadow transition-all active:scale-[0.98]" 
                    onClick={submitInputDialog}
                  >
                    {inputDialog.confirmLabel || 'אישור'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {feedbackSurvey.open && (
            <div className="absolute inset-0 z-40 bg-slate-900/35 flex items-center justify-center p-4">
              <div className="w-[760px] max-w-[96%] rounded-[28px] bg-white shadow-2xl border border-slate-200 p-5 md:p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">{feedbackSurvey.phase === 'question' ? 'איך יצא המסמך?' : feedbackSurvey.phase === 'review' ? 'המלצות לעריכה בטיוטה' : 'מה לתקן במסמך?'}</h3>
                    <p className="text-sm text-slate-500 mt-1">
                      {feedbackSurvey.phase === 'question'
                        ? 'אפשר לאשר שהכול מצוין, או לבקש תיקון ישיר של המסמך.'
                        : feedbackSurvey.phase === 'review'
                          ? (feedbackSurvey.submitting ? 'בודק את הטיוטה ומכין המלצות לא מחייבות בלבד.' : 'אלו המלצות עריכה בלבד. המסמך עצמו לא שונה.')
                          : 'בחר את הנקודות החשובות לך, כתוב חופשי מה לשפר, או בקש קודם המלצות בלבד.'}
                    </p>
                  </div>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={closeFeedbackSurvey}
                  >
                    סגור
                  </button>
                </div>

                {feedbackSurvey.usedFallback && (
                  <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    נוצרה כרגע טיוטה בטוחה. אפשר לאשר אותה או לשלוח עכשיו הערות לעדכון ישיר של המסמך.
                  </div>
                )}

                {feedbackSurvey.phase === 'question' ? (
                  <div className="flex flex-col md:flex-row gap-3">
                    <button
                      className="btn btn-primary flex-1"
                      onClick={approveFeedbackSurvey}
                    >
                      כן, המסמך מוכן
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
                ) : feedbackSurvey.phase === 'review' ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-sm font-bold text-slate-800">
                        {feedbackSurvey.submitting ? 'בודק ומכין המלצות לעריכת המסמך...' : (feedbackReviewSummary || 'אלו כמה המלצות לעריכה ממוקדת בטיוטה.')}
                      </div>
                      <div className="mt-2 text-xs leading-6 text-slate-500 whitespace-pre-wrap">
                        {feedbackSurvey.reviewFocus || 'המיקוד לבדיקה לא הוגדר ולכן נבדקה הטיוטה בכללותה.'}
                      </div>
                    </div>

                    {feedbackSurvey.reviewErrorMessage && (
                      <div className={`rounded-2xl px-4 py-3 text-sm ${feedbackReviewUsedFallback ? 'border border-amber-200 bg-amber-50 text-amber-800' : 'border border-rose-200 bg-rose-50 text-rose-700'}`}>
                        {feedbackReviewUsedFallback
                          ? `חלק מההמלצות לא הושלמו במלואן${feedbackSurvey.reviewErrorMessage ? `: ${feedbackSurvey.reviewErrorMessage}` : '.'}`
                          : feedbackSurvey.reviewErrorMessage}
                      </div>
                    )}

                    {feedbackSurvey.submitting ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                        ההמלצות נבנות עכשיו לפי המיקוד שביקשת, בלי לשנות עדיין את המסמך עצמו.
                      </div>
                    ) : feedbackReviewSuggestions.length ? (
                      <div className="space-y-3 max-h-[48vh] overflow-y-auto pr-1">
                        {feedbackReviewSuggestions.map((suggestion, index) => (
                          <div key={`${suggestion.title || 'review'}-${index}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                            <div className="text-base font-bold text-slate-800">{suggestion.title || `המלצה ${index + 1}`}</div>
                            <div className="mt-2 text-sm leading-6 text-slate-600">{suggestion.reason}</div>
                            <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-3">
                              <div className="text-[11px] font-bold tracking-[0.16em] text-slate-400">ניסוח מוצע</div>
                              <div className="mt-1 text-sm leading-6 text-slate-700">{suggestion.suggestedChange}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
                        לא נוצרו המלצות ממוקדות. אפשר לנסות שוב, או לשלוח הערות מדויקות כדי שנבצע תיקון ישיר.
                      </div>
                    )}

                    <div className="flex flex-col md:flex-row gap-3 justify-end">
                      <button
                        className="btn btn-ghost"
                        onClick={() => setFeedbackSurvey((prev) => ({ ...prev, phase: 'details', submitting: false, submissionRequestId: null }))}
                        disabled={feedbackSurvey.submitting}
                      >
                        שנה מיקוד
                      </button>
                      <button
                        className={`btn btn-outline ${feedbackSurvey.submitting ? 'btn-disabled' : ''}`}
                        onClick={requestDocumentRecommendations}
                        disabled={feedbackSurvey.submitting}
                      >
                        {feedbackSurvey.submitting ? 'מכין המלצות...' : 'רענן המלצות'}
                      </button>
                      <button
                        className={`btn btn-primary ${feedbackSurvey.submitting ? 'btn-disabled' : ''}`}
                        onClick={submitDocumentFeedback}
                        disabled={feedbackSurvey.submitting}
                      >
                        שלח לעדכון ישיר
                      </button>
                    </div>
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
                      <div className="font-bold text-slate-800 mb-2">הערה חופשית</div>
                      <textarea
                        className="textarea textarea-bordered w-full min-h-[120px]"
                        placeholder="למשל: חזקי יותר את הטיעון המרכזי, הוסיפי מקור עדכני, קצרי את הפתיחה, או בדקי שוב את ניסוח הסיכום..."
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
                        חזור
                      </button>
                      <button
                        className={`btn btn-outline ${feedbackSurvey.submitting ? 'btn-disabled' : ''}`}
                        onClick={requestDocumentRecommendations}
                        disabled={feedbackSurvey.submitting}
                      >
                        קבל המלצות בלבד
                      </button>
                      <button
                        className={`btn btn-primary ${feedbackSurvey.submitting ? 'btn-disabled' : ''}`}
                        onClick={submitDocumentFeedback}
                        disabled={feedbackSurvey.submitting}
                      >
                        {feedbackSurvey.submitting ? 'מעדכן...' : 'שלח לעדכון ישיר'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
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

        {showStartScreen && (
          <div className="flex-1 overflow-y-auto">
            <StartScreen
              instructionsResetToken={startScreenInstructionsResetToken}
              onInstructionsResetConsumed={() => setStartScreenInstructionsResetToken(0)}
              documentStyle={documentStyle}
              onDocumentStyleChange={changeDocumentStyle}
              escapeBlocked={fileMenuOpen || inputDialog.open || feedbackSurvey.open}
              onClose={() => {
                setShowStartScreen(false);
                focusEditorSoon('start');
              }}
              hasDraft={wordPreferences.keepLastAutosavedVersion !== false && Boolean(localStorage.getItem('wordai_document_autosave') || localStorage.getItem('wordai_document'))}
              lastSavedAt={localStorage.getItem('wordai_document_autosave_at') || ''}
              onCreateBlank={() => {
                if (!confirmReplaceCurrentDocument()) return;
                clearPersistedDraftCache();
                clearDraftReviewState();
                runStartTransition((activeEditor) => {
                  activeEditor.chain().focus().clearContent().run();
                  setCurrentFilePath('');
                  localStorage.setItem('wordai_active_template', 'blank');
                  syncPersistedAppSettings();
                  setActiveTemplateId('blank');
                }, 'start');
              }}
              onCreateTemplate={(template) => {
                if (!confirmReplaceCurrentDocument()) return;
                const templateId = typeof template === 'string' ? template : template?.id;
                const templateExamples = Array.isArray(template?.examples) ? template.examples : [];
                clearPersistedDraftCache();
                clearDraftReviewState();
                runStartTransition((activeEditor) => {
                  setCurrentFilePath('');
                  localStorage.setItem('wordai_active_template', templateId || 'blank');
                  syncPersistedAppSettings();
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
                  activeEditor.commands.setContent(buildTemplateSkeleton(templateId, '', templateExamples));
                }, 'start');
              }}
              onOpenDocument={() => handleCommand('openFile')}
              onOpenLastDraft={() => {
                if (!confirmReplaceCurrentDocument()) return;
                const savedDraft = wordPreferences.keepLastAutosavedVersion === false
                  ? null
                  : (localStorage.getItem('wordai_document_autosave') || localStorage.getItem('wordai_document'));
                clearDraftReviewState();
                runStartTransition((activeEditor) => {
                  if (savedDraft) activeEditor.commands.setContent(savedDraft);
                  setCurrentFilePath('');
                  setActiveTemplateId(localStorage.getItem('wordai_active_template') || 'blank');
                }, 'end');
              }}
              onOpenSettings={(targetTab = 'guide') => {
                setFileMenuTargetTab(targetTab || 'guide');
                setFileMenuOpen(true);
              }}
              onGenerateFromPrompt={(payload) => executeStartScreenGeneration({
                kind: 'start-screen-generate',
                workspaceId: getActiveWorkspaceId(),
                payload,
              })}
            />
          </div>
        )}

        {/* עט קסמים צף */}
        {!showStartScreen && <MagicWand
          sidebarOpen={sidebarOpen}
          escapeBlocked={fileMenuOpen || inputDialog.open || feedbackSurvey.open || sidebarOpen}
          documentContext={() => editor ? editor.getText().slice(0, 7000) : ''}
          selectedText={selectedText}
          selectionContext={selectionContext}
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
          updateCheckToken={updateCheckToken}
          onClose={() => {
            setFileMenuOpen(false);
            setFileMenuTargetTab(null);
            setUpdateCheckToken(0);
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
  const appRoot = rootElement.__wordflowReactRoot || ReactDOM.createRoot(rootElement);
  rootElement.__wordflowReactRoot = appRoot;
  appRoot.render(
    <ErrorBoundary><App /></ErrorBoundary>
  );
}

export default App;
