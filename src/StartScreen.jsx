import React, { useEffect, useRef, useState } from 'react';
import { GeneratingOverlay } from './WordFlowAnimations';
import ChefModeDialog from './ChefModeDialog';
import ProjectsPanel from './components/ProjectsPanel';
import ProjectSettingsModal from './components/ProjectSettingsModal';
import ProjectBrainstormPanel from './components/ProjectBrainstormPanel';
import StyleEngineControls, { getStyleCreativityTemperature, getStyleDepth } from './components/StyleEngineControls';
import DesktopDownloadCard from './components/DesktopDownloadCard';
import { showToast, showConfirm } from './services/uiFeedback';
import {
  listProjects,
  getUngroupedDocuments,
  assignDocumentToProject,
  unassignDocumentFromProject,
  PROJECTS_UPDATED_EVENT,
} from './services/projectService';
import { scoreTextAuthenticity } from './services/styleAuthenticityService';
import {
  getHomeInstructions,
  saveHomeInstructionFileText,
  getHomeInstructionFileText,
  saveHomeInstructionFileName,
  getHomeInstructionFileName,
  getWorkspaceTemplateCards,
  loadPastDocsIndex,
  loadProjectMaterials,
  getMaterialExtractionStatusInfo,
  saveHelperMaterial,
  removeHelperMaterial,
  saveHomeInstructions,
  getRecentDocuments,
  removeDocumentHistoryByFilePath,
  syncLearnedStyleFromWorkspace,
  readInstructionFile,
  MATERIAL_UPLOAD_PRESETS,
  getMaterialUploadMeta,
  getHelperMaterialAcceptList,
  getInstructionFileAcceptList,
} from './services/workspaceLearningService';
import { getTheme, toggleTheme, onThemeChange } from './theme';
import { getOrderedRoleAgents, getRoleAgents, getWorkspaceAutomation, saveWorkspaceAutomation, saveRoleAgents, buildWorkspaceAgentPreset, getPersonalStyleProfile, savePersonalStyleProfile, chefModeInterview, formatChefResponsesForCompose, getWorkspacesLibrary, switchToWorkspace, setWorkspaceBypassEnabled, getConfiguredProviderChoices, getProviderModelChoices, getProviderConfig, getAppMemory, saveAppMemory, testProviderConnection, normalizeProviderModelName, buildWorkspaceRoutingSummary, getWorkspaceV2Templates, getHumanizerPreferences, saveHumanizerPreferences } from './services/aiService';
import { readBrowserDocumentFile, BROWSER_DOC_ACCEPT } from './services/documentUpload';

const MODERN_TEMPLATES = [
  { 
    id: 'blank', 
    title: '📄 דף ריק', 
    subtitle: 'התחל עם רעיון חדש', 
    description: 'יצירה חופשית ללא מגבלות',
    gradient: 'from-slate-400 to-slate-600',
    icon: '✨'
  },
  { 
    id: 'academic', 
    title: '🎓 מאמר אקדמי', 
    subtitle: 'עבודת מחקר מקצועית', 
    description: 'מבוא, פרקים, מקורות וסיכום',
    gradient: 'from-blue-400 to-indigo-600',
    icon: '📚'
  },
  { 
    id: 'report', 
    title: '📊 דוח עסקי', 
    subtitle: 'ניתוח וממצאים מסודרים', 
    description: 'נתונים, גרפים והמלצות',
    gradient: 'from-emerald-400 to-teal-600',
    icon: '📈'
  },
  { 
    id: 'summary', 
    title: '⚡ סיכום מהיר', 
    subtitle: 'נקודות מפתח בקצרה', 
    description: 'תמצית יעילה של נושא מורכב',
    gradient: 'from-yellow-400 to-orange-600',
    icon: '🔥'
  },
  { 
    id: 'proposal', 
    title: '💡 הצעת פרויקט', 
    subtitle: 'רעיון שמוכר את עצמו', 
    description: 'רקע, מטרות ותוכנית פעולה',
    gradient: 'from-purple-400 to-pink-600',
    icon: '🚀'
  },
  { 
    id: 'creative', 
    title: '🎨 כתיבה יצירתית', 
    subtitle: 'סיפור, שיר או תוכן מקורי', 
    description: 'בטא את עצמך ללא גבולות',
    gradient: 'from-pink-400 to-rose-600',
    icon: '🌟'
  },
];

const PPT_THEMES = [
  { id: 'premium', label: 'פרימיום' },
  { id: 'academic', label: 'אקדמי' },
  { id: 'cinematic', label: 'קולנועי' },
  { id: 'bold', label: 'נועז' },
];

const PPT_DENSITY = [
  { id: 'lean', label: 'רזה', blurb: 'מינימלי ונקי' },
  { id: 'balanced', label: 'מאוזן', blurb: 'איזון תוכן/ויזואל' },
  { id: 'rich', label: 'עשיר', blurb: 'ויזואלי ומלא' },
];

const PRIMARY_TEMPLATE_CARD_LIMIT = 3;

const QUICK_PROMPTS = [
  '✍️ כתוב לי מכתב פורמלי למעסיק',
  '📝 צור הצעת מחקר על בינה מלאכותית',
  '📊 עזור לי להכין דוח ביצועים רבעוני',
  '🎯 כתוב תוכנית עסקית לסטארטאפ',
  '📚 סכם לי מאמר אקדמי מורכב',
  '💌 צור פוסט מרגש לרשתות חברתיות',
];

const START_SCREEN_REVEAL_DELAYS = {
  hero: 0,
  templatesHeading: 140,
  cards: 210,
  quickAccess: 360,
};

const createSeededRandom = (seed = 1) => {
  let nextSeed = seed % 2147483647;
  if (nextSeed <= 0) nextSeed += 2147483646;
  return () => {
    nextSeed = (nextSeed * 16807) % 2147483647;
    return (nextSeed - 1) / 2147483646;
  };
};

const START_SCREEN_PARTICLES = (() => {
  const random = createSeededRandom(4129);
  return Array.from({ length: 14 }, (_, index) => ({
    id: `start-screen-particle-${index}`,
    size: Math.round(random() * 8) + 4,
    left: Math.round(random() * 1000) / 10,
    top: Math.round(random() * 1000) / 10,
    driftX: Math.round((random() - 0.5) * 42),
    driftY: Math.round((random() - 0.5) * 28),
    duration: Number((12 + random() * 10).toFixed(2)),
    delay: Number((random() * -10).toFixed(2)),
    opacity: Number((0.18 + random() * 0.25).toFixed(2)),
  }));
})();

const buildStartScreenRevealClassName = (mounted = false, className = '') => [
  'wordai-reveal',
  mounted ? 'is-visible' : '',
  className,
].filter(Boolean).join(' ');

const buildStartScreenRevealStyle = (delayMs = 0) => ({
  '--wordai-reveal-delay': `${delayMs}ms`,
});

const WORKFLOW_LABELS = {
  'autopilot-full': 'Auto Pilot מלא עם preflight',
  'manager-auto': 'Auto Pilot דינמי',
  'circular-team': 'סביבה מעגלית',
  'manager-pipeline': 'מנהל ← מקורות ← מבנה ← כתיבה ← ליטוש',
  'design-first': 'מבנה קודם',
  'research-first': 'חקר קודם',
  'custom-order': 'סדר מותאם אישית',
};

const AUTOPILOT_DISABLED_WORKFLOW_LABELS = {
  'autopilot-full': 'סדר סוכנים מוגדר',
  'manager-auto': 'סדר סוכנים מוגדר',
  'circular-team': 'סביבה מעגלית',
};

const getWorkflowModeDisplayLabel = (workflowMode = '', autopilotEnabled = true) => {
  const normalizedWorkflowMode = String(workflowMode || '').trim() || 'manager-auto';
  const baseLabel = WORKFLOW_LABELS[normalizedWorkflowMode] || normalizedWorkflowMode;
  return autopilotEnabled === false
    ? AUTOPILOT_DISABLED_WORKFLOW_LABELS[normalizedWorkflowMode] || baseLabel
    : baseLabel;
};

const getWorkspaceModeLabel = (workspace = {}) => {
  const workflowMode = String(workspace?.workflowMode || '').trim() || 'manager-auto';
  const baseLabel = getWorkflowModeDisplayLabel(workflowMode, workspace?.autopilotEnabled !== false);
  if (workspace?.autopilotEnabled === false) {
    return `${baseLabel} · Auto Pilot כבוי`;
  }
  return baseLabel;
};

const getManagedWorkflowCoreRoleKey = (agent = {}) => {
  const value = `${agent?.id || ''} ${agent?.name || ''}`;
  if (/manager|מנהל/i.test(value) && !/review|בדיק/i.test(value)) return 'manager';
  if (/research|source|חוקר|מקורות/i.test(value)) return 'researcher';
  if (/design|designer|structure|outline|מעצב|מבנה/i.test(value)) return 'designer';
  if (/writer|draft|כותב/i.test(value)) return 'writer';
  if (/proof|proofreader|review|editor|מגיה|ליטוש|הגהה|בודק/i.test(value)) return 'proofreader';
  return '';
};

const hasManagedWorkflowCoreTeam = (agents = []) => {
  const roles = new Set((Array.isArray(agents) ? agents : [])
    .filter((agent) => agent && agent.enabled !== false)
    .map((agent) => getManagedWorkflowCoreRoleKey(agent))
    .filter(Boolean));
  return ['manager', 'researcher', 'designer', 'writer', 'proofreader'].every((role) => roles.has(role));
};

const mergeMissingManagedWorkflowRoles = (agents = [], presetId = 'content-studio') => {
  const currentAgents = Array.isArray(agents) ? agents : [];
  const existingRoles = new Set(currentAgents
    .filter((agent) => agent && agent.enabled !== false)
    .map((agent) => getManagedWorkflowCoreRoleKey(agent))
    .filter(Boolean));
  const fallbackTeam = buildWorkspaceAgentPreset(presetId).filter((agent) => agent && agent.enabled !== false);
  const missingAgents = fallbackTeam.filter((agent) => {
    const roleKey = getManagedWorkflowCoreRoleKey(agent);
    return roleKey && !existingRoles.has(roleKey);
  });
  return missingAgents.length ? [...currentAgents, ...missingAgents] : currentAgents;
};

const NO_WORKSPACE_OPTION_VALUE = '__no-workspace__';
const WORKSPACE_V2_DIRECT_OPTION = '__direct__';

const WORKSPACE_PROVIDER_LABELS = {
  gemini: 'Gemini',
  claude: 'Claude',
  perplexity: 'Perplexity',
  openai: 'OpenAI',
  groq: 'Groq',
  ollama: 'Ollama',
  custom: 'Custom',
};

const MATERIAL_FILTER_OPTIONS = [
  { id: 'all', label: 'הכל' },
  { id: 'examples', label: 'דוגמאות' },
  { id: 'course-materials', label: 'חומרי קורס' },
  { id: 'writing-samples', label: 'דוגמאות כתיבה' },
  { id: 'templates', label: 'תבניות' },
];

const ACADEMIC_GENERATION_STRONG_SIGNAL_PATTERN = /(אקדמ|סמינר|סילבוס|ביבליוגרפ|apa|mla|doi|peer[-\s]?reviewed|journal|מאמר|מחקר\s+אקדמי|literature\s+review)/i;
const ACADEMIC_GENERATION_WEAK_SIGNALS = ['קורס', 'מרצה', 'מנחה', 'סטודנט', 'ציטוט'];

const countAcademicGenerationWeakSignals = (value = '') => {
  const normalizedValue = String(value || '').toLowerCase();
  return ACADEMIC_GENERATION_WEAK_SIGNALS.filter((token) => normalizedValue.includes(token)).length;
};

const isLikelyAcademicGenerationRequest = ({ prompt = '', instructions = '', templateId = 'blank' } = {}) => (
  String(templateId || '').trim().toLowerCase() === 'academic'
  || ACADEMIC_GENERATION_STRONG_SIGNAL_PATTERN.test([prompt, instructions].filter(Boolean).join('\n'))
  || countAcademicGenerationWeakSignals([prompt, instructions].filter(Boolean).join('\n')) >= 2
);

const MATERIAL_GROUP_ORDER = ['course-materials', 'writing-samples', 'templates', 'examples', 'other'];

const MATERIAL_GROUP_LABELS = {
  'course-materials': 'חומרי קורס',
  'writing-samples': 'דוגמאות כתיבה',
  templates: 'תבניות',
  examples: 'דוגמאות',
  other: 'כללי',
};

const normalizeMaterialValue = (value = '') => String(value || '').trim().toLowerCase();

const isTemplateMaterial = ({ kind = '', label = '' } = {}) => (
  ['template-example', 'cover-page'].includes(kind)
  || /תבנית|דף\s*שער|template/.test(label)
);

const isWritingSampleMaterial = ({ kind = '', label = '' } = {}) => (
  kind === 'writing-sample'
  || /דוגמ(?:ת|ה)?\s*כתיבה|writing\s*sample/.test(label)
);

const isCourseMaterial = ({ kind = '', label = '' } = {}) => (
  kind === 'course-material'
  || /חומר\s*קורס|רקע|course\s*material/.test(label)
);

const isExampleMaterial = ({ kind = '', label = '' } = {}) => (
  kind.includes('example')
  || kind === 'cover-page'
  || /דוגמ(?:ת|ה)?|example|sample/.test(label)
);

const resolveMaterialGroupId = (item = {}) => {
  const kind = normalizeMaterialValue(item.uploadKind);
  const label = normalizeMaterialValue(item.label);

  if (isCourseMaterial({ kind, label })) return 'course-materials';
  if (isWritingSampleMaterial({ kind, label })) return 'writing-samples';
  if (isTemplateMaterial({ kind, label })) return 'templates';
  if (isExampleMaterial({ kind, label })) return 'examples';
  return 'other';
};

const doesMaterialMatchFilter = (item = {}, filter = 'all') => {
  if (filter === 'all') return true;

  const kind = normalizeMaterialValue(item.uploadKind);
  const label = normalizeMaterialValue(item.label);
  if (filter === 'course-materials') return isCourseMaterial({ kind, label });
  if (filter === 'writing-samples') return isWritingSampleMaterial({ kind, label });
  if (filter === 'templates') return isTemplateMaterial({ kind, label });
  if (filter === 'examples') return isExampleMaterial({ kind, label });
  return true;
};

const summarizeWorkspaceProviders = (agents = []) => {
  return buildWorkspaceRoutingSummary(agents, getProviderConfig());
};

const getProviderLabelFromChoices = (providerId = '', choices = []) => {
  const normalizedId = String(providerId || '').trim();
  if (!normalizedId) return 'AI';
  return choices.find((choice) => choice.id === normalizedId)?.label || WORKSPACE_PROVIDER_LABELS[normalizedId] || normalizedId;
};

const START_SCREEN_DEFAULT_PROVIDER_ID = 'gemini';

const resolveStartScreenDefaultProviderId = (config = {}, choices = []) => {
  const defaultChoice = choices.find((choice) => choice.id === START_SCREEN_DEFAULT_PROVIDER_ID);
  if (defaultChoice) return defaultChoice.id;

  const activeProviderId = String(config?.active || '').trim();
  if (activeProviderId && choices.some((choice) => choice.id === activeProviderId)) return activeProviderId;

  return choices[0]?.id || activeProviderId || START_SCREEN_DEFAULT_PROVIDER_ID;
};

const buildDirectGenerationSummary = ({ providerId = '', modelId = '', choices = [] } = {}) => {
  const providerLabel = getProviderLabelFromChoices(providerId, choices);
  const cleanModel = String(modelId || '').trim();
  return cleanModel ? `${providerLabel} · ${cleanModel}` : providerLabel;
};

const formatRelativeSavedAt = (iso) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return '';
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'לפני פחות מדקה';
  if (diffMinutes === 1) return 'לפני דקה';
  if (diffMinutes < 60) return `לפני ${diffMinutes} דקות`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours === 1) return 'לפני שעה';
  if (diffHours === 2) return 'לפני שעתיים';
  if (diffHours < 24) return `לפני ${diffHours} שעות`;
  if (diffHours < 48) return 'אתמול';
  return date.toLocaleDateString('he-IL');
};


const splitInlineList = (value = '') => String(value || '')
  .split(/[\n,•]+/)
  .map((item) => item.trim())
  .filter(Boolean);

const getStartScreenCustomizations = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem('wordflow_home_customizations') || '{}');
    return {
      templates: parsed?.templates || {},
      styles: parsed?.styles || {},
    };
  } catch {
    return { templates: {}, styles: {} };
  }
};

const applyStartScreenCustomizations = (items = [], kind = 'templates') => {
  const overrides = getStartScreenCustomizations()?.[kind] || {};
  return items.map((item) => ({
    ...item,
    ...(overrides[item.id] || {}),
  }));
};

const escapeHtml = (value = '') => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const plainTextToHtml = (text = '') => {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return '<p></p>';
  return normalized
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br />')}</p>`)
    .join('');
};

const getDraftTitleFromFileName = (name = '') => String(name || '')
  .replace(/\.[^.]+$/, '')
  .replace(/_/g, ' ')
  .replace(/-/g, ' ')
  .trim() || 'טיוטת בסיס';

const getAcceptedFileExtensions = (acceptList = '') => new Set(
  String(acceptList || '')
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.startsWith('.'))
);

const getFileExtensionFromName = (name = '') => {
  const normalizedName = String(name || '').trim().toLowerCase();
  const lastDotIndex = normalizedName.lastIndexOf('.');
  return lastDotIndex > -1 ? normalizedName.slice(lastDotIndex) : '';
};

const partitionFilesByAcceptList = (files = [], acceptList = '') => {
  const acceptedExtensions = getAcceptedFileExtensions(acceptList);
  const initialState = { accepted: [], rejected: [] };
  if (!acceptedExtensions.size) {
    return {
      accepted: Array.from(files || []).filter(Boolean),
      rejected: [],
    };
  }

  return Array.from(files || []).filter(Boolean).reduce((state, file) => {
    const extension = getFileExtensionFromName(file?.name || '');
    if (extension && acceptedExtensions.has(extension)) {
      state.accepted.push(file);
    } else {
      state.rejected.push(file);
    }
    return state;
  }, initialState);
};

const formatInstructionFileUploadError = (error) => {
  const code = String(error?.message || '').trim();
  if (code === 'unsupported-binary-file') return 'קובץ ההנחיות לא נתמך. אפשר docx, pdf, txt, md, html, json, מצגות (pptx), Excel‏ (xls/xlsx) ותמונות. פורמטים ישנים (.doc/.ppt) וארכיונים לא נתמכים.';
  if (code === 'empty-pdf-text') return 'לא הצלחתי לחלץ טקסט קריא מתוך קובץ ה-PDF.';
  if (code === 'empty-docx-text') return 'לא הצלחתי לחלץ טקסט קריא מתוך קובץ ה-DOCX.';
  if (code === 'empty-file-text') return 'לא נמצא טקסט קריא בתוך קובץ ההנחיות שנבחר.';
  return 'לא הצלחתי לקרוא את קובץ ההנחיות.';
};

export default function StartScreen({ onCreateBlank, onCreateTemplate, onOpenLastDraft, onOpenDocument = () => {}, onGenerateFromPrompt, onGeneratePresentation = () => {}, onUploadDocDraft = null, onOpenSpssProject = null, onOpenAssignmentScaffold = null, onDocumentStyleChange = () => {}, onOpenSettings = () => {}, onOpenHelp = null, onClose = () => {}, escapeBlocked = false, documentStyle = 'academic', hasDraft = false, hasOpenDocument = false, lastSavedAt = '', instructionsResetToken = 0, onInstructionsResetConsumed = () => {}, onOpenProjectHub = null, projectDocSeed = null, onProjectDocSeedConsumed = () => {} }) {
  const [prompt, setPrompt] = useState('');
  // seed שהגיע מ-Project Hub ("צור מסמך לשלב"): נשמר כדי לשייך את המסמך שנוצר לשלב.
  const [pendingProjectSeed, setPendingProjectSeed] = useState(null);
  const [outputType, setOutputType] = useState('document');
  const [pptSlideCount, setPptSlideCount] = useState(10);
  const [pptSlideAuto, setPptSlideAuto] = useState(false);
  const [pptTheme, setPptTheme] = useState('premium');
  const [pptDensity, setPptDensity] = useState('balanced');
  const [pptImageIntensity, setPptImageIntensity] = useState('high');
  const [pptSpeakerNotes, setPptSpeakerNotes] = useState(false);
  const [pptIncludeCover, setPptIncludeCover] = useState(true);
  const [pptAiAppendix, setPptAiAppendix] = useState(false);
  const [uiTheme, setUiTheme] = useState(getTheme);
  useEffect(() => onThemeChange(setUiTheme), []);
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
  const [isGenerating, setIsGenerating] = useState(false);
  const [humanizeLoopEnabled, setHumanizeLoopEnabled] = useState(() => Boolean(getAppMemory().humanizeLoopOnGenerate));
  const [aiAppendixEnabled, setAiAppendixEnabled] = useState(() => Boolean(getAppMemory().aiAppendixOnGenerate));
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [showChefDialog, setShowChefDialog] = useState(false);
  const [selectedModel, setSelectedModel] = useState();
  const [providerConfigState, setProviderConfigState] = useState(() => getProviderConfig());
  const [directProviderId, setDirectProviderId] = useState(() => {
    const initialConfig = getProviderConfig();
    const memory = getAppMemory();
    const configuredChoices = getConfiguredProviderChoices(initialConfig);
    const fallbackProviderId = resolveStartScreenDefaultProviderId(initialConfig, configuredChoices);
    const rememberedProviderId = String(memory.homeProviderId || '').trim();
    return rememberedProviderId !== 'ollama' && configuredChoices.some((choice) => choice.id === rememberedProviderId)
      ? rememberedProviderId
      : fallbackProviderId;
  });
  const [directProviderModel, setDirectProviderModel] = useState(() => {
    const initialConfig = getProviderConfig();
    const memory = getAppMemory();
    const configuredChoices = getConfiguredProviderChoices(initialConfig);
    const fallbackProviderId = resolveStartScreenDefaultProviderId(initialConfig, configuredChoices);
    const rememberedProviderId = String(memory.homeProviderId || '').trim();
    const initialProviderId = rememberedProviderId !== 'ollama' && configuredChoices.some((choice) => choice.id === rememberedProviderId)
      ? rememberedProviderId
      : fallbackProviderId;
    const modelChoices = getProviderModelChoices(initialProviderId, initialConfig, [memory.homeProviderModel]);
    const rememberedProviderModel = normalizeProviderModelName(initialProviderId, String(memory.homeProviderModel || '').trim());
    return modelChoices.includes(rememberedProviderModel) ? rememberedProviderModel : (modelChoices[0] || '');
  });
  const [directProviderTestStatus, setDirectProviderTestStatus] = useState('idle');
  const [directProviderTestMessage, setDirectProviderTestMessage] = useState('');
  const previousDirectProviderIdRef = useRef('');
  const [profile, setProfile] = useState(() => getPersonalStyleProfile());
  const onboardingDone = Boolean(profile?.onboardingCompletedAt);

  const fileInputRef = useRef(null);
  const baseDraftInputRef = useRef(null);
  const docDraftInputRef = useRef(null);
  const instructionFileInputRef = useRef(null);
  const [instructions, setInstructions] = useState(() => {
    if (instructionsResetToken > 0) return '';
    const savedInstructions = typeof getHomeInstructions === 'function' ? getHomeInstructions() : '';
    if (String(savedInstructions || '').trim()) return savedInstructions;
    return typeof getHomeInstructionFileText === 'function' ? getHomeInstructionFileText() : '';
  });
  const [materials, setMaterials] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [materialsFilter, setMaterialsFilter] = useState('all');
  const [uploading, setUploading] = useState(false);
  // התקדמות העלאה לכל קובץ - מאפשר feedback אמיתי במקום ספינר עיוור
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, fileName: '' });
  const [lastUploadedMaterials, setLastUploadedMaterials] = useState([]);
  const [activeDropZone, setActiveDropZone] = useState('');
  const [instructionFileName, setInstructionFileName] = useState(() => (instructionsResetToken > 0 ? '' : (typeof getHomeInstructionFileName === 'function' ? getHomeInstructionFileName() : '')));
  const [baseDraft, setBaseDraft] = useState(null);
  const [loadedWorkspace, setLoadedWorkspace] = useState(null);
  const [uploadKind, setUploadKind] = useState('general');
  const [workspacesList, setWorkspacesList] = useState([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState('');
  const [autopilotEnabled, setAutopilotEnabled] = useState(true);
  const [actualWorkflowMode, setActualWorkflowMode] = useState('manager-auto');
  const [quickWorkflowMode, setQuickWorkflowMode] = useState('circular-team');
  const [circularWorkflowEnabled, setCircularWorkflowEnabled] = useState(true);
  const [circularMaxRounds, setCircularMaxRounds] = useState(2);
  const [recentDocs, setRecentDocs] = useState(() => (typeof getRecentDocuments === 'function' ? getRecentDocuments(8) : []));
  const canOpenRecentDocs = typeof window !== 'undefined' && typeof window.desktopApp?.openDocumentByPath === 'function';
  const [projectsList, setProjectsList] = useState(() => (typeof listProjects === 'function' ? listProjects() : []));
  const [selectedProjectForSettings, setSelectedProjectForSettings] = useState(null);
  const [selectedProjectForBrainstorm, setSelectedProjectForBrainstorm] = useState(null);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof listProjects !== 'function') return undefined;
    const refreshProjectsList = () => setProjectsList(listProjects());
    window.addEventListener(PROJECTS_UPDATED_EVENT, refreshProjectsList);
    return () => window.removeEventListener(PROJECTS_UPDATED_EVENT, refreshProjectsList);
  }, []);
  const [workspaceV2Templates, setWorkspaceV2Templates] = useState(() => (
    typeof getWorkspaceV2Templates === 'function' ? getWorkspaceV2Templates() : []
  ));
  const [selectedWorkspaceV2Id, setSelectedWorkspaceV2Id] = useState(() => {
    const remembered = String(getAppMemory().homeWorkspaceV2TemplateId || WORKSPACE_V2_DIRECT_OPTION).trim();
    return remembered && remembered !== NO_WORKSPACE_OPTION_VALUE ? remembered : WORKSPACE_V2_DIRECT_OPTION;
  });
  const [showWorkspaceV2Details, setShowWorkspaceV2Details] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof getWorkspaceV2Templates !== 'function') return undefined;
    const refreshWorkspaceV2Templates = () => setWorkspaceV2Templates(getWorkspaceV2Templates());
    window.addEventListener('wordai-workspace-v2-templates-changed', refreshWorkspaceV2Templates);
    return () => window.removeEventListener('wordai-workspace-v2-templates-changed', refreshWorkspaceV2Templates);
  }, []);
  const activeWorkspaceV2 = workspaceV2Templates.find((workspace) => workspace.id === selectedWorkspaceV2Id) || null;
  const workspaceBypassActive = !activeWorkspaceV2;
  const workflowSelectorCurrentLabel = getWorkflowModeDisplayLabel(actualWorkflowMode, autopilotEnabled);
  const workflowSelectorSummary = autopilotEnabled === false
    ? `${workflowSelectorCurrentLabel} · Auto Pilot כבוי`
    : workflowSelectorCurrentLabel;
  const displayedQuickWorkflowMode = autopilotEnabled === false && ['autopilot-full', 'manager-auto'].includes(quickWorkflowMode)
    ? '__keep-current__'
    : quickWorkflowMode;

  const directProviderChoices = React.useMemo(() => {
    const configuredChoices = getConfiguredProviderChoices(providerConfigState);
    if (configuredChoices.length) return configuredChoices;
    const fallbackProviderId = String(providerConfigState?.active || 'gemini').trim() || 'gemini';
    return [{ id: fallbackProviderId, label: getProviderLabelFromChoices(fallbackProviderId), isDefault: true }];
  }, [providerConfigState]);

  const resolvedDirectProviderId = directProviderChoices.some((choice) => choice.id === directProviderId)
    ? directProviderId
    : (directProviderChoices[0]?.id || String(providerConfigState?.active || 'gemini').trim() || 'gemini');

  const directProviderModelChoices = React.useMemo(() => (
    getProviderModelChoices(resolvedDirectProviderId, providerConfigState, [directProviderModel])
  ), [directProviderModel, providerConfigState, resolvedDirectProviderId]);

  const normalizedDirectProviderModel = normalizeProviderModelName(resolvedDirectProviderId, String(directProviderModel || '').trim());

  const resolvedDirectProviderModel = directProviderModelChoices.includes(normalizedDirectProviderModel)
    ? normalizedDirectProviderModel
    : (directProviderModelChoices[0] || '');

  const directGenerationSummary = buildDirectGenerationSummary({
    providerId: resolvedDirectProviderId,
    modelId: resolvedDirectProviderModel,
    choices: directProviderChoices,
  });
  const workspaceV2ProviderId = activeWorkspaceV2?.providerId || resolvedDirectProviderId;
  const workspaceV2ModelChoices = React.useMemo(() => (
    getProviderModelChoices(workspaceV2ProviderId, providerConfigState, [activeWorkspaceV2?.model, resolvedDirectProviderModel].filter(Boolean))
  ), [activeWorkspaceV2?.model, providerConfigState, resolvedDirectProviderModel, workspaceV2ProviderId]);
  const workspaceV2ProviderModel = activeWorkspaceV2?.model && workspaceV2ModelChoices.includes(normalizeProviderModelName(workspaceV2ProviderId, activeWorkspaceV2.model))
    ? normalizeProviderModelName(workspaceV2ProviderId, activeWorkspaceV2.model)
    : (workspaceV2ProviderId === resolvedDirectProviderId ? resolvedDirectProviderModel : (workspaceV2ModelChoices[0] || ''));
  const hasWorkspaceV2StepRoutes = Boolean(activeWorkspaceV2)
    && (activeWorkspaceV2.pipeline || []).some((step) => step.providerId || step.model);
  const activeGenerationSummary = hasWorkspaceV2StepRoutes
    ? 'Workspace v2 · מודלים לפי שלב'
    : buildDirectGenerationSummary({
      providerId: workspaceV2ProviderId,
      modelId: workspaceV2ProviderModel,
      choices: directProviderChoices,
    });
  const selectedUploadMeta = typeof getMaterialUploadMeta === 'function' ? getMaterialUploadMeta(uploadKind) : { id: uploadKind, label: uploadKind };
  const helperMaterialAcceptList = typeof getHelperMaterialAcceptList === 'function'
    ? getHelperMaterialAcceptList()
    : '.pdf,.pptx,.doc,.docx,.txt,.md,.markdown,.html,.htm,.png,.jpg,.jpeg,.webp';
  const instructionFileAcceptList = typeof getInstructionFileAcceptList === 'function'
    ? getInstructionFileAcceptList()
    : '.docx,.txt,.md,.markdown,.html,.htm,.json,.pdf';

  const validateMaterialFiles = (files = []) => {
    const { accepted, rejected } = partitionFilesByAcceptList(files, helperMaterialAcceptList);
    if (rejected.length) {
      showToast('חלק מהקבצים נדחו כי הסוג שלהם לא נתמך למסמכי עזר.', { tone: 'warning' });
    }
    return accepted;
  };

  const validateInstructionFile = (file) => {
    const { accepted, rejected } = partitionFilesByAcceptList(file ? [file] : [], instructionFileAcceptList);
    if (rejected.length) {
      showToast('קובץ ההנחיות לא נתמך.', { tone: 'warning' });
      return null;
    }
    return accepted[0] || null;
  };

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotionPreference = () => setPrefersReducedMotion(mediaQuery.matches);
    syncMotionPreference();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncMotionPreference);
      return () => mediaQuery.removeEventListener('change', syncMotionPreference);
    }

    mediaQuery.addListener(syncMotionPreference);
    return () => mediaQuery.removeListener(syncMotionPreference);
  }, []);

  useEffect(() => {
    if (instructionsResetToken <= 0) return;
    setInstructions('');
    setInstructionFileName('');
    if (typeof saveHomeInstructions === 'function') saveHomeInstructions('');
    if (typeof saveHomeInstructionFileText === 'function') saveHomeInstructionFileText('');
    if (typeof saveHomeInstructionFileName === 'function') saveHomeInstructionFileName('');
    onInstructionsResetConsumed?.();
  }, [instructionsResetToken, onInstructionsResetConsumed]);

  useEffect(() => {
    const refreshProfileState = () => setProfile(getPersonalStyleProfile());
    refreshProfileState();
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('focus', refreshProfileState);
    window.addEventListener('wordai-settings-hydrated', refreshProfileState);
    window.addEventListener('wordai-personal-style-updated', refreshProfileState);
    return () => {
      window.removeEventListener('focus', refreshProfileState);
      window.removeEventListener('wordai-settings-hydrated', refreshProfileState);
      window.removeEventListener('wordai-personal-style-updated', refreshProfileState);
    };
  }, []);

  useEffect(() => {
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

  useEffect(() => {
    if (directProviderId !== resolvedDirectProviderId) {
      setDirectProviderId(resolvedDirectProviderId);
    }
  }, [directProviderId, resolvedDirectProviderId]);

  useEffect(() => {
    const previousProviderId = String(previousDirectProviderIdRef.current || '').trim();
    if (previousProviderId && previousProviderId !== resolvedDirectProviderId) {
      const nextModelChoices = getProviderModelChoices(resolvedDirectProviderId, providerConfigState);
      const nextModel = nextModelChoices[0] || '';
      if (directProviderModel !== nextModel) {
        setDirectProviderModel(nextModel);
      }
    }
    previousDirectProviderIdRef.current = resolvedDirectProviderId;
  }, [directProviderModel, providerConfigState, resolvedDirectProviderId]);

  useEffect(() => {
    if (directProviderModel !== resolvedDirectProviderModel) {
      setDirectProviderModel(resolvedDirectProviderModel);
    }
  }, [directProviderModel, resolvedDirectProviderModel]);

  useEffect(() => {
    saveAppMemory({
      homeProviderId: resolvedDirectProviderId,
      homeProviderModel: resolvedDirectProviderModel,
    });
  }, [resolvedDirectProviderId, resolvedDirectProviderModel]);

  useEffect(() => {
    saveAppMemory({
      homeWorkspaceV2TemplateId: activeWorkspaceV2 ? activeWorkspaceV2.id : WORKSPACE_V2_DIRECT_OPTION,
    });
  }, [activeWorkspaceV2]);

  useEffect(() => {
    setDirectProviderTestStatus('idle');
    setDirectProviderTestMessage('');
  }, [providerConfigState, resolvedDirectProviderId, resolvedDirectProviderModel]);

  const [templateCards, setTemplateCards] = useState(() => applyStartScreenCustomizations(MODERN_TEMPLATES, 'templates'));
  const [editingCard, setEditingCard] = useState(null);
  const [showExtraTemplates, setShowExtraTemplates] = useState(false);
  const [showAdvancedUploads, setShowAdvancedUploads] = useState(false);
  const [showEngineSettings, setShowEngineSettings] = useState(false);
  const advancedUploadsCount = (materials?.length || 0) + (instructions?.trim() ? 1 : 0) + (instructionFileName ? 1 : 0);
  const primaryTemplateCards = templateCards.slice(0, PRIMARY_TEMPLATE_CARD_LIMIT);
  const extraTemplateCards = templateCards.slice(PRIMARY_TEMPLATE_CARD_LIMIT);
  const hasSelectedHiddenTemplate = extraTemplateCards.some((template) => template.id === selectedTemplate);
  const shouldShowExtraTemplates = showExtraTemplates || hasSelectedHiddenTemplate;

  const saveCardCustomization = () => {
    if (!editingCard?.id) return;
    const nextCustomizations = getStartScreenCustomizations();
    nextCustomizations['templates'] = {
      ...(nextCustomizations['templates'] || {}),
      [editingCard.id]: {
        title: String(editingCard.title || '').trim() || editingCard.title,
        subtitle: String(editingCard.subtitle || '').trim() || editingCard.subtitle,
        customPrompt: String(editingCard.customPrompt || '').trim() || '',
      },
    };
    localStorage.setItem('wordflow_home_customizations', JSON.stringify(nextCustomizations));

    setTemplateCards((prev) => prev.map((item) => item.id === editingCard.id ? {
      ...item,
      title: String(editingCard.title || '').trim() || item.title,
      subtitle: String(editingCard.subtitle || '').trim() || item.subtitle,
      customPrompt: String(editingCard.customPrompt || '').trim() || '',
    } : item));

    setEditingCard(null);
  };

  useEffect(() => {
    if (!editingCard?.id || escapeBlocked) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setEditingCard(null);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [editingCard?.id, escapeBlocked]);

  useEffect(() => {
    if (!showWorkspaceV2Details || escapeBlocked) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setShowWorkspaceV2Details(false);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showWorkspaceV2Details, escapeBlocked]);

  useEffect(() => {
    if (editingCard?.id || showChefDialog || showWorkspaceV2Details || escapeBlocked) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      onClose?.();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [editingCard?.id, showChefDialog, showWorkspaceV2Details, escapeBlocked, onClose]);

  const buildLoadedWorkspaceState = (automation) => {
    if (!automation?.enabled || automation?.workspaceBypassEnabled) return null;
    const agents = typeof getOrderedRoleAgents === 'function'
      ? getOrderedRoleAgents(automation.workflowMode)
      : [];
    return { ...automation, agents, providerSummary: summarizeWorkspaceProviders(agents) };
  };

  const applyAutomationSnapshot = (automation) => {
    if (!automation) return;
    const nextWorkflowMode = String(automation?.workflowMode || 'manager-auto');
    setLoadedWorkspace(buildLoadedWorkspaceState(automation));
    setCurrentWorkspaceId(automation?.workspaceBypassEnabled ? NO_WORKSPACE_OPTION_VALUE : (automation?.activeWorkspaceId || 'default-content-studio'));
    setAutopilotEnabled(automation?.autopilotEnabled !== false);
    setActualWorkflowMode(nextWorkflowMode);
    setQuickWorkflowMode(['autopilot-full', 'manager-auto', 'circular-team', 'custom-order'].includes(nextWorkflowMode) ? nextWorkflowMode : '__keep-current__');
    setCircularWorkflowEnabled(automation?.circularWorkflowEnabled !== false);
    setCircularMaxRounds(Math.max(1, Math.min(4, Number(automation?.circularMaxRounds) || 2)));
    if (automation?.workspaceBypassEnabled !== true && automation?.autopilotEnabled !== false && ['autopilot-full', 'manager-auto', 'circular-team'].includes(nextWorkflowMode)) {
      ensureManagedWorkflowTeam(nextWorkflowMode);
    }
  };

  const persistAutomationUpdates = (updates = {}) => {
    if (typeof saveWorkspaceAutomation !== 'function') return;
    if (typeof getWorkspaceAutomation === 'function' && getWorkspaceAutomation()?.workspaceBypassEnabled) {
      applyAutomationSnapshot(getWorkspaceAutomation());
      return;
    }
    const nextAutomation = saveWorkspaceAutomation(updates);
    applyAutomationSnapshot(nextAutomation);
  };

  const ensureManagedWorkflowTeam = (nextMode = '') => {
    if (!['autopilot-full', 'manager-auto', 'circular-team'].includes(String(nextMode || '').trim())) return;
    if (typeof getOrderedRoleAgents !== 'function' || typeof getRoleAgents !== 'function' || typeof saveRoleAgents !== 'function' || typeof buildWorkspaceAgentPreset !== 'function') return;

    const currentAutomation = typeof getWorkspaceAutomation === 'function' ? getWorkspaceAutomation() : {};
    const currentAgents = getOrderedRoleAgents(nextMode);
    if (hasManagedWorkflowCoreTeam(currentAgents)) return;

    const nextAgents = mergeMissingManagedWorkflowRoles(getRoleAgents(), currentAutomation?.preset || 'content-studio');
    saveRoleAgents(nextAgents);
  };

  useEffect(() => {
    const refreshWorkspaceState = () => {
      if (typeof getWorkspaceAutomation === 'function') {
        const auto = getWorkspaceAutomation();
        applyAutomationSnapshot(auto);
      }
      if (typeof getWorkspacesLibrary === 'function') {
        const library = getWorkspacesLibrary();
        const nextWorkspacesList = Object.values(library).map((ws) => ({
          id: ws.id,
          name: ws.name,
          workflowMode: ws?.automation?.workflowMode || ws?.workflowMode || 'manager-auto',
          autopilotEnabled: ws?.automation?.autopilotEnabled ?? ws?.autopilotEnabled ?? true,
          providerSummary: summarizeWorkspaceProviders(ws.agents),
        }));
        setWorkspacesList(nextWorkspacesList);
      }
    };

    if (typeof loadProjectMaterials === 'function') loadProjectMaterials().then(setMaterials).catch(()=>null);
    refreshWorkspaceState();

    if (typeof window === 'undefined') return undefined;
    window.addEventListener('wordai-workspace-changed', refreshWorkspaceState);
    window.addEventListener('wordai-provider-config-changed', refreshWorkspaceState);
    window.addEventListener('wordai-settings-hydrated', refreshWorkspaceState);
    return () => {
      window.removeEventListener('wordai-workspace-changed', refreshWorkspaceState);
      window.removeEventListener('wordai-provider-config-changed', refreshWorkspaceState);
      window.removeEventListener('wordai-settings-hydrated', refreshWorkspaceState);
    };
  }, []);

  const processMaterialUploads = async (files = []) => {
    const normalizedFiles = Array.from(files || []).filter(Boolean);
    if (!normalizedFiles.length || uploading) return;
    // אזהרת קבצים גדולים (מעל 25MB) - מתריע על תהליך ארוך לפני שחוסם UI
    const LARGE_FILE_THRESHOLD = 25 * 1024 * 1024;
    const largeFiles = normalizedFiles.filter((file) => (file?.size || 0) > LARGE_FILE_THRESHOLD);
    if (largeFiles.length) {
      const sizesText = largeFiles.map((f) => `- ${f.name} (${Math.round((f.size || 0) / (1024 * 1024))}MB)`).join('\n');
      const proceed = await showConfirm(`שמת לב שהקבצים הבאים כבדים מ-25MB ויעלו לאט יותר:\n${sizesText}\n\nלהמשיך?`, { title: 'קבצים גדולים', confirmLabel: 'המשך' });
      if (!proceed) return;
    }
    setUploading(true);
    setUploadProgress({ current: 0, total: normalizedFiles.length, fileName: '' });
    const failedUploads = [];
    try {
      const uploadedIds = [];
      for (let i = 0; i < normalizedFiles.length; i += 1) {
        const file = normalizedFiles[i];
        setUploadProgress({ current: i + 1, total: normalizedFiles.length, fileName: file?.name || '' });
        if (typeof saveHelperMaterial !== 'function') break;
        try {
          const result = await saveHelperMaterial(file, selectedUploadMeta);
          if (result?.entry?.id) uploadedIds.push(result.entry.id);
        } catch (err) {
          // נכשל קובץ בודד - לא להפיל את כל הבאצ', לאסוף לדוח סופי
          console.error('Material upload failed:', file?.name, err);
          failedUploads.push({ name: file?.name || 'קובץ ללא שם', message: err?.message || String(err) });
        }
      }
      let uploadedMaterials = [];
      if (typeof loadProjectMaterials === 'function') {
        const mats = await loadProjectMaterials();
        setMaterials(mats);
        uploadedMaterials = uploadedIds.length ? mats.filter((item) => uploadedIds.includes(item.id)) : [];
      }
      if (uploadedIds.length) {
        setSelectedIds((prev) => Array.from(new Set([...prev, ...uploadedIds])));
      }
      setLastUploadedMaterials(uploadedMaterials);
      const problematicUploads = uploadedMaterials
        .map((item) => ({ item, info: getMaterialExtractionStatusInfo(item) }))
        .filter(({ info }) => info.status !== 'success');
      const messages = [];
      if (failedUploads.length) {
        messages.push('הקבצים הבאים נכשלו בהעלאה ולא נשמרו:');
        failedUploads.forEach(({ name, message }) => messages.push(`- ${name}: ${message}`));
      }
      if (problematicUploads.length) {
        if (messages.length) messages.push('');
        messages.push('חלק מהקבצים נשמרו אבל לא נקראו במלואם:');
        problematicUploads.forEach(({ item, info }) => messages.push(`- ${item.title}: ${info.message}`));
      }
      if (messages.length) {
        showToast(messages.join('\n'), { tone: 'warning', duration: 7000 });
      }
    } catch (e) {
      // כשל גלובלי בלתי צפוי - חייב הודעה למשתמש, לא רק console
      console.error('Material upload pipeline failed:', e);
      showToast(`ההעלאה נכשלה: ${e?.message || 'שגיאה לא ידועה'}`, { tone: 'error' });
    } finally {
      setUploading(false);
      setUploadProgress({ current: 0, total: 0, fileName: '' });
    }
  };

  const handleUpload = async (event) => {
    const files = validateMaterialFiles(Array.from(event.target.files || []));
    try {
      await processMaterialUploads(files);
    } finally {
      event.target.value = '';
    }
  };

  const processInstructionUpload = async (file) => {
    if (!file) return;
    try {
      let extracted = '';
      if (typeof readInstructionFile === 'function') extracted = await readInstructionFile(file);
      const nextInstructions = String(extracted || '').trim();
      if (!nextInstructions) {
        showToast('לא הצלחתי לקרוא תוכן מתוך קובץ ההנחיות.', { tone: 'warning' });
        return;
      }
      setInstructions(nextInstructions);
      setInstructionFileName(file.name);
      if (typeof saveHomeInstructions === 'function') saveHomeInstructions(nextInstructions);
      if (typeof saveHomeInstructionFileName === 'function') saveHomeInstructionFileName(file.name);
      if (typeof saveHomeInstructionFileText === 'function') saveHomeInstructionFileText(nextInstructions);
    } catch (error) {
      console.error(error);
      showToast(formatInstructionFileUploadError(error), { tone: 'error' });
    }
  };

  const handleInstructionFileUpload = async (event) => {
    const file = validateInstructionFile(event.target.files?.[0]);
    try {
      await processInstructionUpload(file);
    } finally {
      event.target.value = '';
    }
  };

  const activateDropZone = (zone) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (activeDropZone !== zone) setActiveDropZone(zone);
  };

  const deactivateDropZone = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const nextTarget = event.relatedTarget;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setActiveDropZone('');
  };

  const handleMaterialsDrop = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveDropZone('');
    await processMaterialUploads(validateMaterialFiles(Array.from(event.dataTransfer?.files || [])));
  };

  const handleInstructionDrop = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveDropZone('');
    const file = validateInstructionFile(Array.from(event.dataTransfer?.files || [])[0]);
    await processInstructionUpload(file);
  };

  const normalizeBaseDraft = (payload = {}) => {
    const resolvedName = String(
      payload.name
      || String(payload.filePath || '').split(/[\\/]/).pop()
      || payload.title
      || 'טיוטת בסיס'
    ).trim() || 'טיוטת בסיס';

    return {
      name: resolvedName,
      title: String(payload.title || getDraftTitleFromFileName(resolvedName)).trim() || 'טיוטת בסיס',
      html: String(payload.html || '').trim() || '<p></p>',
      text: String(payload.text || '').trim(),
      filePath: String(payload.filePath || '').trim(),
      source: String(payload.source || 'upload').trim() || 'upload',
    };
  };

  // מחיל טיוטת בסיס + בדיקת סגנון אוטומטית: אם הטקסט נשמע גנרי/מכונה — התרעה רכה.
  const commitBaseDraft = (payload = {}) => {
    const normalized = normalizeBaseDraft(payload);
    setBaseDraft(normalized);
    try {
      const sampleText = normalized.text
        || String(normalized.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const res = scoreTextAuthenticity(sampleText);
      if (res.ok && res.score >= res.threshold) {
        showToast(`⚠️ הטיוטה נשמעת גנרית/מכונה (${res.score}/100). אפשר לבדוק לעומק עם "בדיקת סגנון".`, { tone: 'warning', duration: 6000 });
      }
    } catch {}
    return normalized;
  };

  const clearBaseDraft = () => {
    setBaseDraft(null);
    if (baseDraftInputRef.current) baseDraftInputRef.current.value = '';
  };

  const handleSelectBaseDraft = async () => {
    try {
      if (window.desktopApp?.openDocumentDialog) {
        const result = await window.desktopApp.openDocumentDialog();
        if (result?.canceled) return;
        if (result?.ok === false || result?.error) {
          showToast(result?.error || 'לא הצלחתי לטעון את הטיוטה שנבחרה.', { tone: 'error' });
          return;
        }
        commitBaseDraft({
          ...result,
          source: 'desktop',
        });
        return;
      }

      baseDraftInputRef.current?.click();
    } catch (error) {
      console.error(error);
      showToast('לא הצלחתי לבחור טיוטת בסיס.', { tone: 'error' });
    }
  };

  const handleBaseDraftUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      // קורא Word‏ (docx), PDF, וגם טקסט/HTML דרך המחלץ של הדפדפן (אותה תמיכה כמו בדסקטופ).
      const doc = await readBrowserDocumentFile(file);
      if (!doc) return;
      const rawText = doc.text || '';
      const html = doc.html || (/<(html|body|p|h1|h2|div|span|br|ul|ol|li)\b/i.test(rawText)
        ? rawText
        : plainTextToHtml(rawText));

      commitBaseDraft({
        name: file.name,
        title: getDraftTitleFromFileName(file.name),
        html,
        text: rawText,
        source: 'browser',
      });
    } catch (error) {
      console.error(error);
      showToast('לא הצלחתי לקרוא את הטיוטה שנבחרה.', { tone: 'error' });
    } finally {
      event.target.value = '';
    }
  };

  const handleLoadWorkspace = () => {
    if (typeof getWorkspaceAutomation !== 'function' || typeof getOrderedRoleAgents !== 'function') return;
    const automation = getWorkspaceAutomation();
    const agents = getOrderedRoleAgents(automation.workflowMode);
    if (!automation?.enabled) {
      showToast('צריך קודם להפעיל את סביבת הסוכנים במסך ההגדרות.', { tone: 'warning' });
      return;
    }
    setLoadedWorkspace({ ...automation, agents });
  };

  const handleWorkspaceChange = async (event) => {
    const selectedWorkspaceId = event.target.value;
    if (!selectedWorkspaceId || selectedWorkspaceId === currentWorkspaceId) return;

    if (selectedWorkspaceId === NO_WORKSPACE_OPTION_VALUE) {
      try {
        const nextAutomation = typeof setWorkspaceBypassEnabled === 'function'
          ? setWorkspaceBypassEnabled(true)
          : getWorkspaceAutomation();
        applyAutomationSnapshot(nextAutomation);
      } catch (error) {
        console.error('שגיאה במעבר למצב ללא סביבת עבודה:', error);
        showToast('לא הצלחתי לעבור למצב ללא סביבת עבודה.', { tone: 'error' });
      }
      return;
    }
    
    try {
      const switched = await switchToWorkspace(selectedWorkspaceId);
      if (!switched) {
        showToast('לא הצלחתי להחליף סביבת עבודה. בדוק שהסביבה קיימת.', { tone: 'error' });
        return;
      }
      
      // טען את ה-workspace החדש
      if (typeof getWorkspaceAutomation === 'function' && typeof getOrderedRoleAgents === 'function') {
        const automation = getWorkspaceAutomation();
        applyAutomationSnapshot({
          ...automation,
          activeWorkspaceId: automation?.activeWorkspaceId || selectedWorkspaceId,
        });
      }
    } catch (error) {
      console.error('שגיאה בהחלפת סביבת עבודה:', error);
      showToast('שגיאה בהחלפת סביבת העבודה', { tone: 'error' });
    }
  };

  const handleAutopilotToggle = (event) => {
    const checked = Boolean(event.target.checked);
    setAutopilotEnabled(checked);
    persistAutomationUpdates({ autopilotEnabled: checked });
  };

  const handleWorkflowModeChange = (event) => {
    const nextMode = String(event.target.value || '').trim();
    if (!nextMode || nextMode === '__keep-current__') return;
    const nextAutopilotEnabled = ['autopilot-full', 'manager-auto'].includes(nextMode) ? true : autopilotEnabled;
    setQuickWorkflowMode(nextMode);
    setActualWorkflowMode(nextMode);
    setAutopilotEnabled(nextAutopilotEnabled);
    ensureManagedWorkflowTeam(nextMode);
    persistAutomationUpdates({
      workflowMode: nextMode,
      autopilotEnabled: nextAutopilotEnabled,
      circularWorkflowEnabled: nextMode === 'circular-team' ? circularWorkflowEnabled : false,
    });
  };

  const handleCircularWorkflowToggle = (event) => {
    const checked = Boolean(event.target.checked);
    setCircularWorkflowEnabled(checked);
    setActualWorkflowMode('circular-team');
    setQuickWorkflowMode('circular-team');
    persistAutomationUpdates({
      workflowMode: 'circular-team',
      circularWorkflowEnabled: checked,
    });
  };

  const handleCircularMaxRoundsChange = (event) => {
    const nextRounds = Math.max(1, Math.min(4, Number(event.target.value) || 2));
    setCircularMaxRounds(nextRounds);
    setActualWorkflowMode('circular-team');
    setQuickWorkflowMode('circular-team');
    persistAutomationUpdates({
      workflowMode: 'circular-team',
      circularMaxRounds: nextRounds,
    });
  };

  
  useEffect(() => {
    setMounted(true);
    if (prefersReducedMotion) {
      setCurrentPromptIndex(0);
      return undefined;
    }
    if (typeof document === 'undefined') return undefined;

    // אנימציה מחזורית של ההצעות המהירות
    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      setCurrentPromptIndex(prev => (prev + 1) % QUICK_PROMPTS.length);
    }, 3000);
    
    return () => clearInterval(interval);
  }, [prefersReducedMotion]);

  const hasBaseDraft = Boolean(String(baseDraft?.html || '').trim());
  const hasGenerationInput = Boolean(String(prompt || '').trim() || String(instructions || '').trim() || hasBaseDraft);
  const isPresentationOutput = outputType === 'presentation';
  const canGeneratePresentation = Boolean(String(prompt || '').trim() || hasBaseDraft);
  const canGenerate = (isPresentationOutput ? canGeneratePresentation : hasGenerationInput) && !isGenerating;

  const filteredMaterials = React.useMemo(() => (
    materials.filter((item) => doesMaterialMatchFilter(item, materialsFilter))
  ), [materials, materialsFilter]);

  const groupedFilteredMaterials = React.useMemo(() => {
    const grouped = filteredMaterials.reduce((acc, item) => {
      const groupId = resolveMaterialGroupId(item);
      if (!acc[groupId]) {
        acc[groupId] = {
          id: groupId,
          label: MATERIAL_GROUP_LABELS[groupId] || MATERIAL_GROUP_LABELS.other,
          items: [],
        };
      }
      acc[groupId].items.push(item);
      return acc;
    }, {});

    return MATERIAL_GROUP_ORDER
      .map((groupId) => grouped[groupId])
      .filter((group) => Array.isArray(group?.items) && group.items.length > 0);
  }, [filteredMaterials]);

  const handleDirectProviderConnectionTest = async () => {
    setDirectProviderTestStatus('loading');
    setDirectProviderTestMessage('');

    try {
      const providerSettings = {
        ...(providerConfigState?.[resolvedDirectProviderId] || {}),
        model: resolvedDirectProviderModel,
      };
      const result = await testProviderConnection(resolvedDirectProviderId, providerSettings);

      if (result.ok) {
        const modelLabel = result.model ? ` (${result.model})` : '';
        const tried = result.triedModels.length > 1 ? ` · ניסה ${result.triedModels.length} מודלים` : '';
        setDirectProviderTestStatus('ok');
        setDirectProviderTestMessage(`✅ מחובר${modelLabel}${tried}`);
        return;
      }

      const tried = result.triedModels.length ? ` · נוסו: ${result.triedModels.join(', ')}` : '';
      setDirectProviderTestStatus('fail');
      setDirectProviderTestMessage(`❌ נכשל: ${result.error}${tried}`);
    } catch (error) {
      setDirectProviderTestStatus('fail');
      setDirectProviderTestMessage(`❌ ${error?.message || 'שגיאה לא ידועה'}`);
    }
  };

  const handleOpenRecentDoc = async (doc) => {
    const filePath = String(doc?.filePath || '').trim();
    if (!filePath || !canOpenRecentDocs) return;
    try {
      const result = await window.desktopApp.openDocumentByPath(filePath);
      if (result?.ok === false) {
        if (/(?:ENOENT|not found|לא נמצא)/i.test(String(result.error || ''))) {
          setRecentDocs((currentDocs) => currentDocs.filter((entry) => String(entry?.filePath || '').trim() !== filePath));
          removeDocumentHistoryByFilePath(filePath);
        }
        showToast(result.error || 'לא ניתן לפתוח את הקובץ', { tone: 'error' });
        return;
      }

      await onOpenDocument(result);
    } catch (error) {
      showToast(error?.message || 'קרתה שגיאה בזמן פתיחת הקובץ', { tone: 'error' });
    }
  };

  const handleDeleteRecentDoc = async (event, doc) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const filePath = String(doc?.filePath || '').trim();
    if (!filePath) return;
    const title = doc?.title || 'המסמך הזה';
    const confirmed = await showConfirm(`להסיר את "${title}" מרשימת המסמכים האחרונים?\nהקובץ עצמו לא יימחק מהמחשב.`, { title: 'הסרה מהרשימה', confirmLabel: 'הסר', tone: 'danger' });
    if (!confirmed) return;
    const nextHistory = removeDocumentHistoryByFilePath(filePath);
    setRecentDocs(nextHistory.slice(0, 8));
  };

  const handleMoveRecentDoc = (doc, targetProjectId) => {
    if (targetProjectId) assignDocumentToProject(doc.id, targetProjectId);
    else unassignDocumentFromProject(doc.id);
    setRecentDocs(typeof getRecentDocuments === 'function' ? getRecentDocuments(8) : []);
  };

  // "מסמך חדש" מתוך כרטיס פרויקט: מילוי מוקדם של שדה הנושא בהקשר הפרויקט. שיוך המסמך
  // עצמו לפרויקט קורה אחרי היצירה, כשהמשתמש בוחר "העבר לפרויקט…" ברשימת המסמכים
  // (המסך הזה לא מקבל callback על סיום היצירה, כך שזו הדרך הכי לא-פולשנית לחבר את הזרימה).
  const handleNewDocumentInProject = (project) => {
    setPrompt((prev) => (String(prev || '').trim() ? prev : `הפרויקט: ${project.name}\n`));
    setOutputType('document');
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        document.querySelector('input[placeholder*="נושא"]')?.focus();
      });
    }
  };

  // תוצאה של "הפוך לכיוון עבודה" מתוך שיחת התכנון של הפרויקט: מזין את הבריף כטקסט המקור
  // ליצירת המסמך (זהה למסלול שה-Chef Mode כבר מזין אליו).
  const handleTurnProjectBrainstormIntoWorkDirection = ({ brief, projectId } = {}) => {
    const project = projectsList.find((p) => p.id === projectId);
    const briefText = String(brief || '').trim();
    setPrompt(project ? `הפרויקט: ${project.name}\n${briefText}` : briefText);
    setOutputType('document');
    setSelectedProjectForBrainstorm(null);
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        document.querySelector('input[placeholder*="נושא"]')?.focus();
      });
    }
  };

  // seed "צור מסמך לשלב" מה-Project Hub: ממלא את הפרומפט ושומר את השיוך לשלב.
  useEffect(() => {
    if (!projectDocSeed || !projectDocSeed.token) return;
    setPrompt(String(projectDocSeed.prompt || ''));
    setOutputType('document');
    setPendingProjectSeed({
      projectId: String(projectDocSeed.projectId || ''),
      milestoneId: String(projectDocSeed.milestoneId || ''),
    });
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        document.querySelector('input[placeholder*="נושא"]')?.focus();
      });
    }
    onProjectDocSeedConsumed();
  }, [projectDocSeed?.token]);

  const handleDeleteMaterial = async (event, item) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const title = item?.title || 'קובץ העזר הזה';
    const canDeleteStoredFile = ['materials-local', 'materials-browser'].includes(String(item?.source || ''));
    const confirmMessage = canDeleteStoredFile
      ? `למחוק את "${title}" מקבצי העזר?\nקבצים שהועלו לאפליקציה יוסרו גם מהאחסון המקומי.`
      : `להסיר את "${title}" מרשימת קבצי העזר?\nקובץ מובנה יוסתר מהרשימה, אבל לא יימחק מקבצי האפליקציה.`;
    const confirmed = await showConfirm(confirmMessage, { title: 'מחיקת קובץ עזר', confirmLabel: 'מחק', tone: 'danger' });
    if (!confirmed) return;

    try {
      const result = await removeHelperMaterial(item);
      if (result?.ok === false) {
        showToast(result.error || 'לא הצלחתי למחוק את קובץ העזר', { tone: 'error' });
        return;
      }
      const nextMaterials = typeof loadProjectMaterials === 'function'
        ? await loadProjectMaterials()
        : materials.filter((material) => material.id !== item.id);
      setMaterials(nextMaterials);
      setSelectedIds((prev) => prev.filter((id) => id !== item.id));
      setLastUploadedMaterials((prev) => prev.filter((material) => material.id !== item.id));
    } catch (error) {
      showToast(error?.message || 'לא הצלחתי למחוק את קובץ העזר', { tone: 'error' });
    }
  };

  const handleGenerate = async () => {
    if (isGenerating) return;

    if (outputType === 'presentation') {
      const presentationSelectedMaterials = materials.filter((item) => selectedIds.includes(item.id));
      const fromDraft = hasBaseDraft;
      const draftSourceText = fromDraft
        ? (String(baseDraft?.text || '').trim() || String(baseDraft?.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
        : '';
      if (!fromDraft && !String(prompt || '').trim()) return;
      setIsGenerating(true);
      try {
        await onGeneratePresentation?.({
          source: fromDraft ? 'document' : 'topic',
          topic: String(prompt || '').trim(),
          documentText: draftSourceText,
          slideCount: pptSlideAuto ? 'auto' : pptSlideCount,
          theme: pptTheme,
          density: pptDensity,
          imageIntensity: pptImageIntensity,
          speakerNotes: pptSpeakerNotes,
          includeCover: pptIncludeCover,
          aiAppendix: pptAiAppendix,
          selectedMaterials: presentationSelectedMaterials,
        });
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    if (!hasGenerationInput) return;

    setIsGenerating(true);
    try {
      const selectedMaterials = materials.filter((item) => selectedIds.includes(item.id));
      const selectedProviderId = activeWorkspaceV2 ? workspaceV2ProviderId : resolvedDirectProviderId;
      const selectedProviderModel = activeWorkspaceV2 ? workspaceV2ProviderModel : resolvedDirectProviderModel;
      await onGenerateFromPrompt?.({
        prompt,
        templateId: selectedTemplate,
        instructions: String(instructions || '').trim(),
        instructionFileName: String(instructionFileName || '').trim(),
        selectedMaterials,
        workspaceId: activeWorkspaceV2 ? `workspace-v2:${activeWorkspaceV2.id}` : currentWorkspaceId,
        workspaceBypassActive,
        useWorkspaceV2: Boolean(activeWorkspaceV2),
        workspaceV2TemplateId: activeWorkspaceV2?.id || '',
        selectedModel: selectedProviderId,
        selectedProviderId,
        selectedProviderModel,
        baseDraft,
        additionalReviewRounds: 0,
        humanizeLoop: humanizeLoopEnabled ? { enabled: true, convergence: true, target: getHumanizerPreferences().target } : null,
        aiAppendix: aiAppendixEnabled,
        temperature: getStyleCreativityTemperature(),
        styleDepth: getStyleDepth(),
        projectSeed: pendingProjectSeed,
        // Direct מבטיח "קריאה יחידה ונקייה": כשנדרשים מקורות הם מאוחזרים בקריאה-אחת
        // (googleSearch בתוך הכתיבה), לא ב-pipeline רב-קריאות. סביבות עבודה — היוריסטיקה.
        ...(workspaceBypassActive ? { sourceRoute: 'single-call' } : {}),
      });
      setPendingProjectSeed(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template.id);
    if (template.id === 'blank') {
      onCreateBlank?.();
    } else {
      onCreateTemplate?.(template);
    }
  };

  const handleChefStart = async (responses, model, chefOptions = {}) => {
    // sourceRoute מהבורר בסוף הבישול: 'auto' | 'pipeline' | 'single-call' | 'none'
    const chefSourceRoute = String(chefOptions?.sourceRoute || '').trim().toLowerCase();
    try {
      setIsGenerating(true);
      // בריף שאושר/נערך במסך "הנה מה שהבנתי" בדיאלוג — מקור אמת. זיקוק כאן הוא fallback
      // בלבד למקרה שהדיאלוג לא הצליח להכין בריף.
      let briefText = String(chefOptions?.finalBrief || '').trim();
      if (!briefText) {
        const result = await chefModeInterview(responses, model, null, {
          documentPrompt: prompt,
          templateId: selectedTemplate,
          instructions,
        });
        briefText = String(result?.brief ?? result?.html ?? '').trim();
      }
      // הדרישות המקוריות מצורפות לבריף כלשונן: זיהוי מכסות מקורות (מאמרים אקדמיים, כתבות)
      // רץ על טקסט הבקשה, ובריף מזוקק שהשמיט ניסוח דרישה גרם לניתוב שגוי (web במקום Scholar).
      const originalRequest = String(prompt || '').trim()
        || String(responses?.[0]?.answer || '').trim();
      // הכותב מקבל גם את תשובות הבישול המלאות — הזיקוק ל-6 שורות היה צוואר בקבוק
      // שאיבד ניואנסים. סדר עדיפות מוצהר: תשובות (מאוחרות) גוברות על הבקשה המקורית.
      const fullResponsesText = formatChefResponsesForCompose(responses);
      const generatedPrompt = [
        briefText || originalRequest || 'בישול אוטומטי',
        fullResponsesText
          ? `תשובות הבישול המלאות של המשתמש — מחייבות; בכל סתירה מול הבקשה המקורית, התשובות גוברות (הן מאוחרות יותר):\n${fullResponsesText}`
          : '',
        briefText && originalRequest && originalRequest !== briefText
          ? `הדרישות המקוריות של המשתמש — מחייבות כלשונן אלא אם שונו בתשובות הבישול, כולל כל דרישה מספרית (מקורות, מאמרים אקדמיים, כתבות, מבנה):\n${originalRequest}`
          : '',
      ].filter(Boolean).join('\n\n');
      const selectedMaterials = materials.filter((item) => selectedIds.includes(item.id));
      const selectedProviderId = String(model || resolvedDirectProviderId || '').trim();
      const selectedProviderModel = selectedProviderId === resolvedDirectProviderId
        ? resolvedDirectProviderModel
        : '';
      await onGenerateFromPrompt?.({
        prompt: generatedPrompt,
        templateId: selectedTemplate,
        instructions: String(instructions || '').trim(),
        instructionFileName: String(instructionFileName || '').trim(),
        selectedMaterials,
        workspaceId: currentWorkspaceId,
        workspaceBypassActive,
        selectedModel: model,
        selectedProviderId,
        selectedProviderModel,
        baseDraft,
        additionalReviewRounds: 0,
        humanizeLoop: humanizeLoopEnabled ? { enabled: true, convergence: true, target: getHumanizerPreferences().target } : null,
        aiAppendix: aiAppendixEnabled,
        temperature: getStyleCreativityTemperature(),
        styleDepth: getStyleDepth(),
        forceDirectMode: true,
        skipWorkflowAutomation: true,
        directModeReason: 'chef-final-compose',
        ...(chefSourceRoute && chefSourceRoute !== 'auto' ? {
          sourceRoute: chefSourceRoute,
          includeSources: chefSourceRoute !== 'none',
        } : {}),
      });
      setSelectedModel(undefined);
      setShowChefDialog(false);
    } catch (error) {
      console.error('שגיאה בשלב הבישול:', error);
      showToast('שגיאה בשלב הבישול. בדוק את הקונסול.', { tone: 'error' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleChefClose = () => {
    setSelectedModel(undefined);
    setShowChefDialog(false);
  };

  const handleExtraTemplatesToggle = () => {
    if (hasSelectedHiddenTemplate) return;
    setShowExtraTemplates((prev) => !prev);
  };

  const extraTemplatesToggleLabel = hasSelectedHiddenTemplate
    ? 'עוד תבניות פתוחות עבור הבחירה הנוכחית'
    : shouldShowExtraTemplates
      ? 'הסתר תבניות נוספות'
      : 'עוד תבניות';

  const renderTemplateCards = (cards, indexOffset = 0) => cards.map((template, i) => (
    <div
      key={template.id}
      className={`${buildStartScreenRevealClassName(mounted, 'wordai-reveal-card')} group relative bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 cursor-pointer transition-all duration-500 transform hover:scale-105 hover:bg-white/15 shadow-xl hover:shadow-2xl ${
        selectedTemplate === template.id ? 'ring-2 ring-pink-400 bg-white/20' : ''
      }`}
      onClick={() => handleTemplateSelect(template)}
      style={buildStartScreenRevealStyle(START_SCREEN_REVEAL_DELAYS.cards + ((indexOffset + i) * 70))}
    >
      <span
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setEditingCard({
            kind: 'template',
            id: template.id,
            title: template.title,
            subtitle: template.subtitle || '',
            customPrompt: template.customPrompt || '',
          });
        }}
        className="absolute left-4 top-4 z-10 inline-flex items-center justify-center w-8 h-8 rounded-full border border-white/30 bg-white/10 text-white/50 hover:text-white hover:bg-white/30 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
        title="ערוך תבנית"
      >
        ✎
      </span>
      <div className="text-center mb-4">
        <div className={`w-16 h-16 mx-auto bg-gradient-to-br ${template.gradient} rounded-full flex items-center justify-center text-2xl mb-4 shadow-lg`}>
          {template.icon}
        </div>
        <h3 className="text-xl font-bold text-white mb-2" style={{ textShadow: '1px 1px 5px rgba(0,0,0,0.5)' }}>
          {template.title}
        </h3>
        <p className="text-white/70 text-sm mb-3">{template.subtitle}</p>
        <p className="text-white/50 text-xs">{template.description}</p>
      </div>

      <div className="mt-6 opacity-0 group-hover:opacity-100 transition-all duration-300">
        <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
          <div className={`h-full bg-gradient-to-r ${template.gradient} transform translate-x-full group-hover:translate-x-0 transition-transform duration-500`}></div>
        </div>
      </div>
    </div>
  ));

  return (
    <div className="min-h-[calc(100dvh-140px)] w-full flex-1 relative overflow-hidden" dir="rtl" style={{ background: 'radial-gradient(125% 120% at 82% -8%, #14304a 0%, #0d1b2e 46%, #0a1422 100%)' }}>
      <GeneratingOverlay isVisible={isGenerating} prompt={prompt} prefersReducedMotion={prefersReducedMotion} />
      {/* Animated Background Elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="wordai-ambient-orb wordai-ambient-orb-cyan absolute top-20 right-20 w-72 h-72 bg-cyan-300/20 rounded-full blur-3xl"></div>
        <div className="wordai-ambient-orb wordai-ambient-orb-sky absolute bottom-20 left-20 w-96 h-96 bg-sky-300/20 rounded-full blur-3xl"></div>
        <div className="wordai-ambient-orb wordai-ambient-orb-amber absolute top-1/2 left-1/2 w-80 h-80 bg-amber-200/20 rounded-full blur-3xl"></div>
      </div>

      {/* Floating Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {START_SCREEN_PARTICLES.map((particle) => (
          <div
            key={particle.id}
            className="wordai-particle absolute rounded-full bg-white/10"
            style={{
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              left: `${particle.left}%`,
              top: `${particle.top}%`,
              opacity: particle.opacity,
              '--wordai-particle-x': `${particle.driftX}px`,
              '--wordai-particle-y': `${particle.driftY}px`,
              '--wordai-particle-duration': `${particle.duration}s`,
              '--wordai-particle-delay': `${particle.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Main Content — שני טורים: תוכן ראשי (1fr, מימין ב-RTL) + רייל צדדי 344px (עיצוב חדש) */}
      <div className="relative z-10 px-4 sm:px-6 py-8 sm:py-10">
        <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_344px]">
        <main className="min-w-0">
        {/* Hero Section */}
        <div className={buildStartScreenRevealClassName(mounted, 'text-right mb-8')} style={buildStartScreenRevealStyle(START_SCREEN_REVEAL_DELAYS.hero)}>
          <div className="mb-8">
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold text-white mb-4" style={{ textShadow: '2px 2px 20px rgba(0,0,0,0.5)' }}>
              {profile?.displayName ? (
                <>שלום <span className="bg-gradient-to-r from-cyan-200 to-amber-200 bg-clip-text text-transparent">{profile.displayName}</span>! 👋</>
              ) : (
                <>יוצרים <span className="bg-gradient-to-r from-cyan-200 to-amber-200 bg-clip-text text-transparent">תוכן חכם</span> ביחד? 🚀</>
              )}
            </h1>
            <p className="text-base sm:text-xl md:text-2xl text-white/80 max-w-3xl mx-auto leading-relaxed" style={{ textShadow: '1px 1px 10px rgba(0,0,0,0.3)' }}>
              AI שמבין אותך, יוצר איתך, וממשיך ללמוד מהסגנון שלך ⚡
            </p>
          </div>

          {/* Quick Prompt Animation */}
          <div className="bg-white/12 backdrop-blur-2xl border border-white/35 rounded-2xl p-4 sm:p-6 max-w-4xl mx-auto mb-8 shadow-[0_20px_60px_rgba(2,6,23,0.45)]">
            <div className="text-white/70 text-sm mb-4">רעיונות למסמכים:</div>
            <div 
              className="text-white text-base sm:text-lg font-medium transition-all duration-500"
              style={{ textShadow: '1px 1px 5px rgba(0,0,0,0.5)' }}
            >
              {QUICK_PROMPTS[currentPromptIndex]}
            </div>
            <div className="flex justify-center mt-4 space-x-2">
              {QUICK_PROMPTS.map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    i === currentPromptIndex ? 'bg-cyan-200 w-6' : 'bg-white/30'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Continue Last Draft Banner */}
          {hasDraft && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 max-w-5xl mx-auto mb-6 rounded-2xl border border-emerald-200/40 bg-gradient-to-l from-emerald-500/25 via-teal-500/15 to-white/10 backdrop-blur-2xl px-5 sm:px-7 py-4 sm:py-5 shadow-[0_16px_50px_rgba(4,120,87,0.35)]">
              <div className="flex items-center gap-3 text-right">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-400/25 border border-emerald-200/50 text-xl">⚡</div>
                <div>
                  <div className="text-white font-bold text-base sm:text-lg">יש לך טיוטה פתוחה</div>
                  {formatRelativeSavedAt(lastSavedAt) ? (
                    <div className="text-emerald-100/80 text-xs sm:text-sm">נשמרה {formatRelativeSavedAt(lastSavedAt)}</div>
                  ) : null}
                </div>
              </div>
              <button
                onClick={onOpenLastDraft}
                className="flex w-full sm:w-auto items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500/80 to-emerald-600/80 hover:from-green-600/80 hover:to-emerald-700/80 border border-white/30 rounded-xl text-white font-bold transition-all duration-300 transform hover:scale-105 shadow-lg"
              >
                המשך מאיפה שעצרת
              </button>
            </div>
          )}

          {/* Main Input Area */}
          <div className="bg-white/12 backdrop-blur-2xl border border-white/35 rounded-3xl p-4 sm:p-8 max-w-5xl mx-auto shadow-[0_24px_80px_rgba(3,7,18,0.55)]">
            <div className="flex justify-center mb-6">
              <div className="inline-flex rounded-2xl bg-white/10 border border-white/25 p-1">
                <button
                  type="button"
                  onClick={() => setOutputType('document')}
                  className={`rounded-xl px-5 py-2 text-sm font-bold transition ${!isPresentationOutput ? 'bg-white text-[#2B579A] shadow-sm' : 'text-white/80 hover:bg-white/15'}`}
                >
                  📄 מסמך
                </button>
                <button
                  type="button"
                  onClick={() => setOutputType('presentation')}
                  className={`rounded-xl px-5 py-2 text-sm font-bold transition ${isPresentationOutput ? 'bg-white text-[#2B579A] shadow-sm' : 'text-white/80 hover:bg-white/15'}`}
                >
                  📊 מצגת
                </button>
                {onUploadDocDraft && (
                  <button
                    type="button"
                    onClick={() => docDraftInputRef.current?.click()}
                    className="rounded-xl px-5 py-2 text-sm font-bold text-white/80 transition hover:bg-white/15"
                    title="העלה טיוטת מסמך Word — הסוכן ישכתב אותה לסגנון הכתיבה שלך, בלי לשנות עיצוב"
                  >
                    📥 שכתוב טיוטה
                  </button>
                )}
                {onOpenSpssProject && (
                  <button
                    type="button"
                    onClick={() => onOpenSpssProject()}
                    className="rounded-xl px-5 py-2 text-sm font-bold text-white/80 transition hover:bg-white/15"
                    title="עבודת סיום סטטיסטית: נתונים → קוד → פלט → פרק ממצאים"
                  >
                    📈 עבודת SPSS
                  </button>
                )}
                {onOpenAssignmentScaffold && (
                  <button
                    type="button"
                    onClick={() => onOpenAssignmentScaffold()}
                    className="rounded-xl px-5 py-2 text-sm font-bold text-white/80 transition hover:bg-white/15"
                    title="הנחיות המטלה + החומרים שלך → שלד עם ראיות. עובד מקומית, בלי מפתח API"
                  >
                    🧭 שלד מטלה
                  </button>
                )}
              </div>
              <input
                ref={docDraftInputRef}
                type="file"
                accept=".docx"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadDocDraft?.(f); e.target.value = ''; }}
              />
            </div>

            <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center mb-6">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                  placeholder={isPresentationOutput
                    ? (hasBaseDraft ? 'זווית או דגש למצגת (אופציונלי) — המקור הוא טיוטת הבסיס למטה' : 'נושא המצגת')
                    : 'נושא קצר או הקשר אופציונלי למסמך. אפשר להשאיר ריק אם ההנחיות למטה כבר מגדירות הכול'}
                  className="w-full px-5 sm:px-6 py-4 bg-white/18 backdrop-blur-md border border-white/40 rounded-2xl text-white placeholder-white/70 text-base sm:text-lg outline-none focus:ring-2 focus:ring-cyan-200 focus:border-transparent transition-all duration-300"
                />
                <div className="absolute left-4 top-1/2 transform -translate-y-1/2">
                  <div className={`w-3 h-3 bg-cyan-200 rounded-full ${prefersReducedMotion ? '' : 'animate-pulse'}`}></div>
                </div>
              </div>
              
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className={`w-full md:w-auto px-6 sm:px-8 py-4 rounded-2xl font-bold text-base sm:text-lg transition-all duration-300 transform hover:scale-105 ${
                  !canGenerate
                    ? 'bg-gray-500/50 text-gray-300 cursor-not-allowed'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg hover:shadow-2xl'
                }`}
                style={{
                  boxShadow: !canGenerate ? 'none' : '0 10px 30px rgba(8, 145, 178, 0.45)'
                }}
              >
                {isGenerating ? (
                  <div className="flex items-center gap-2">
                    <div className={`${prefersReducedMotion ? '' : 'animate-spin'} w-5 h-5 border-2 border-white/30 border-t-white rounded-full`}></div>
                    יוצר...
                  </div>
                ) : (
                  <>{isPresentationOutput ? '📊 צור מצגת' : (hasBaseDraft ? '✨ עדכן מהטיוטה' : '✨ בואו נתחיל')}</>
                )}
              </button>

              {!isPresentationOutput && (
                <button
                  onClick={() => setShowChefDialog(true)}
                  disabled={isGenerating}
                  className="w-full md:w-auto px-6 sm:px-8 py-4 rounded-2xl font-bold text-base sm:text-lg transition-all duration-300 transform hover:scale-105 bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 shadow-lg hover:shadow-2xl disabled:bg-gray-500/50 disabled:text-gray-200 disabled:cursor-not-allowed"
                  style={{
                    boxShadow: !isGenerating ? '0 10px 30px rgba(245, 158, 11, 0.45)' : 'none'
                  }}
                >
                  👨‍🍳 בוא נבשל
                </button>
              )}
            </div>

            {!isPresentationOutput && (
              <label className="flex items-center gap-3 mb-6 px-4 py-3 bg-white/10 backdrop-blur-md border border-white/25 rounded-2xl cursor-pointer text-right">
                <input
                  type="checkbox"
                  checked={humanizeLoopEnabled}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setHumanizeLoopEnabled(next);
                    saveAppMemory({ ...getAppMemory(), humanizeLoopOnGenerate: next });
                  }}
                  className="w-4 h-4 accent-cyan-400 shrink-0"
                />
                <span className="flex flex-col">
                  <span className="text-white font-semibold text-sm">🧬 האנשה בלולאה עד תוצאה מספקת</span>
                  <span className="text-white/65 text-xs">אחרי היצירה, המסמך משוכתב שוב ושוב ונמדד מול גלאי ה-AI עד שאין שיפור. איטי יותר, אבל אנושי ככל האפשר.</span>
                </span>
              </label>
            )}

            {!isPresentationOutput && (
              <label className="flex items-center gap-3 mb-6 px-4 py-3 bg-white/10 backdrop-blur-md border border-white/25 rounded-2xl cursor-pointer text-right">
                <input
                  type="checkbox"
                  checked={aiAppendixEnabled}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setAiAppendixEnabled(next);
                    saveAppMemory({ ...getAppMemory(), aiAppendixOnGenerate: next });
                  }}
                  className="w-4 h-4 accent-amber-400 shrink-0"
                />
                <span className="flex flex-col">
                  <span className="text-white font-semibold text-sm">📎 צירוף נספח AI (תיעוד שימוש + הדרכה)</span>
                  <span className="text-white/65 text-xs">אחרי היצירה, נוסף לסוף המסמך פרק נספח עם הפרומפטים לפי שלבים, פסקת רפלקציה והדרכה איך להריץ ולצלם מסך. כרוך בקריאת API נוספת.</span>
                </span>
              </label>
            )}

            {!isPresentationOutput && <StyleEngineControls />}

            {isPresentationOutput && (
              <div className="bg-white/10 backdrop-blur-xl border border-white/25 rounded-2xl p-5 mb-6 text-right">
                <div className="text-white font-semibold text-sm mb-4">⚙️ הגדרות מצגת</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-white/80 text-xs font-semibold">מספר שקופיות</span>
                      <button
                        type="button"
                        onClick={() => setPptSlideAuto((v) => !v)}
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${pptSlideAuto ? 'bg-cyan-400 text-slate-900' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
                      >
                        ✨ אוטומטי
                      </button>
                    </div>
                    <input
                      type="number"
                      min="4"
                      max="40"
                      value={pptSlideAuto ? '' : pptSlideCount}
                      disabled={pptSlideAuto}
                      placeholder={pptSlideAuto ? 'ה-AI יחליט לפי התוכן' : ''}
                      onChange={(e) => setPptSlideCount(Math.max(4, Math.min(40, Number(e.target.value) || 10)))}
                      className="rounded-xl bg-white/15 border border-white/30 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-cyan-200 disabled:opacity-50 placeholder:text-white/40 placeholder:text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-white/80 text-xs font-semibold">סגנון עיצובי</span>
                    <select
                      value={pptTheme}
                      onChange={(e) => setPptTheme(e.target.value)}
                      className="rounded-xl bg-white/15 border border-white/30 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-cyan-200 [&>option]:text-slate-900"
                    >
                      {PPT_THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-white/80 text-xs font-semibold">דגש על תמונות</span>
                    <select
                      value={pptImageIntensity}
                      onChange={(e) => setPptImageIntensity(e.target.value)}
                      className="rounded-xl bg-white/15 border border-white/30 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-cyan-200 [&>option]:text-slate-900"
                    >
                      <option value="high">גבוה</option>
                      <option value="medium">בינוני</option>
                      <option value="low">נמוך</option>
                    </select>
                  </label>
                  <div className="flex flex-col gap-2">
                    <span className="text-white/80 text-xs font-semibold">רמת עומס</span>
                    <div className="grid grid-cols-3 gap-2">
                      {PPT_DENSITY.map((d) => {
                        const active = d.id === pptDensity;
                        return (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => setPptDensity(d.id)}
                            title={d.blurb}
                            className={`rounded-xl border px-2 py-2 text-xs font-bold transition ${active ? 'border-cyan-200 bg-cyan-400/25 text-white' : 'border-white/25 bg-white/8 text-white/75 hover:bg-white/15'}`}
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <label className="inline-flex items-center gap-2 text-white/85 text-xs">
                    <input type="checkbox" checked={pptIncludeCover} onChange={(e) => setPptIncludeCover(e.target.checked)} />
                    שקופית פתיחה
                  </label>
                  <label className="inline-flex items-center gap-2 text-white/85 text-xs">
                    <input type="checkbox" checked={pptSpeakerNotes} onChange={(e) => setPptSpeakerNotes(e.target.checked)} />
                    הערות מרצה קצרות
                  </label>
                  <label className="inline-flex items-center gap-2 text-amber-200/90 text-xs" title="שקופיות נספח בסוף הדק עם הפרומפטים לפי שלבים והדרכה. כרוך בקריאת API נוספת.">
                    <input type="checkbox" checked={pptAiAppendix} onChange={(e) => setPptAiAppendix(e.target.checked)} />
                    📎 נספח AI (קריאת API נוספת)
                  </label>
                </div>
                <div className="mt-3 text-white/55 text-[11px]">
                  {hasBaseDraft ? 'המקור: טיוטת הבסיס שנבחרה למטה. שדה הנושא למעלה אופציונלי (זווית/דגש).' : 'המצגת תיווצר מהנושא למעלה. אפשר גם לבחור טיוטת בסיס למטה כמקור.'}
                </div>
              </div>
            )}

            <div className="text-right text-xs text-white/72 mb-6">
              {isPresentationOutput
                ? 'בחרת מצגת: ה-deck נפתח כמסמך חדש. אם בחרת טיוטת בסיס היא תהפוך לשקופיות בלי לדרוס את הקובץ המקורי.'
                : 'שדה הנושא העליון הוא רשות. ההנחיות למטה הן המקור המחייב, והשדה הזה נועד רק להוסיף brief או הקשר קצר אם צריך. אם בחרת טיוטת בסיס, אפשר גם להשאיר את שני השדות ריקים כדי לבצע ליטוש ראשוני.'}
            </div>

            <div className="bg-white/10 backdrop-blur-xl border border-white/25 rounded-2xl p-5 mb-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <div className="text-white font-semibold text-sm">📄 טיוטת בסיס אופציונלית</div>
                  <div className="text-white/70 text-xs mt-1">בחר מסמך קיים כדי לעדכן או ללטש אותו במלואו. חומרי עזר למטה משמשים להקשר בלבד.</div>
                </div>
                <div className="flex flex-wrap items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={handleSelectBaseDraft}
                    className="px-3 py-2 bg-emerald-500/25 hover:bg-emerald-500/35 border border-emerald-200/45 rounded-xl text-white text-xs transition-all shadow-sm"
                  >
                    {baseDraft ? 'החלף טיוטה' : 'בחר טיוטת בסיס'}
                  </button>
                  {baseDraft ? (
                    <button
                      type="button"
                      onClick={clearBaseDraft}
                      className="px-3 py-2 bg-white/10 hover:bg-white/15 border border-white/25 rounded-xl text-white text-xs transition-all shadow-sm"
                    >
                      הסר
                    </button>
                  ) : null}
                </div>
              </div>

              {baseDraft ? (
                <div className="mt-4 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white/8 border border-cyan-200/25 rounded-xl px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-white text-sm font-semibold truncate" title={baseDraft.name}>{baseDraft.name}</div>
                    <div className="text-white/60 text-[11px] mt-1 truncate" title={baseDraft.filePath || ''}>
                      {baseDraft.filePath || (baseDraft.source === 'desktop' ? 'נטען דרך בחירת קובץ במחשב' : 'נטען דרך דפדפן')}
                    </div>
                  </div>
                  <div className="text-[11px] text-cyan-100 bg-cyan-500/15 border border-cyan-200/30 px-3 py-1 rounded-full whitespace-nowrap">
                    הדור הבא יעדכן את הטיוטה הזאת
                  </div>
                </div>
              ) : (
                <div className="mt-4 text-white/45 text-[11px]">לא נבחרה טיוטת בסיס. במצב הזה תיווצר טיוטה חדשה כרגיל.</div>
              )}

              <input
                ref={baseDraftInputRef}
                type="file"
                accept={BROWSER_DOC_ACCEPT}
                className="hidden"
                onChange={handleBaseDraftUpload}
              />
            </div>

            {/* Advance Options Area */}
            <div className="bg-white/10 backdrop-blur-xl border border-white/30 rounded-2xl p-6">
              <button
                type="button"
                onClick={() => setShowAdvancedUploads((v) => !v)}
                aria-expanded={showAdvancedUploads}
                aria-controls="start-screen-advanced-uploads"
                className="w-full flex items-center justify-between gap-3 text-right"
              >
                <span className="text-white/85 text-sm font-semibold">
                  📎 אפשרויות מתקדמות — קבצים, חומרים והנחיות
                  {advancedUploadsCount > 0 ? ` (${advancedUploadsCount})` : ''}
                </span>
                <span className="text-white/60 text-xs">{showAdvancedUploads ? '▲ סגור' : '▼ הרחב'}</span>
              </button>

              {showAdvancedUploads && (
              <div id="start-screen-advanced-uploads" className="pt-4 mt-4 border-t border-white/10">
                 <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                   <div>
                     <div className="text-white/80 font-medium whitespace-nowrap">📎 קבצים, חומרי עזר והנחיות</div>
                     <div className="text-white/55 text-[11px] mt-1">חומרי עזר נשמרים כהקשר למסמך. כדי לעבוד על מסמך קיים במלואו, השתמש בטיוטת בסיס.</div>
                   </div>
                   {instructionFileName ? (
                     <span className="text-[11px] text-fuchsia-100 bg-fuchsia-500/20 border border-fuchsia-200/30 px-3 py-1 rounded-full">קובץ הנחיות: {instructionFileName}</span>
                   ) : null}
                 </div>

                 <div className="flex flex-wrap items-center justify-end gap-2 mb-4">
                   <button
                     type="button"
                     onClick={() => instructionFileInputRef.current?.click()}
                     className="px-3 py-2 bg-fuchsia-500/25 hover:bg-fuchsia-500/35 border border-fuchsia-200/45 rounded-xl text-white text-xs transition-all shadow-sm"
                   >
                     קובץ הנחיות
                   </button>
                   <button
                     type="button"
                     onClick={() => fileInputRef.current?.click()}
                     className="px-3 py-2 bg-cyan-500/25 hover:bg-cyan-500/35 border border-cyan-200/45 rounded-xl text-white text-xs transition-all shadow-sm"
                   >
                     {uploading ? (uploadProgress.total > 1 ? `מעלה ${uploadProgress.current}/${uploadProgress.total}…` : 'מעלה…') : 'הוסף מסמכי עזר'}
                   </button>
                   {/* בורר טיוטת הבסיס מרוכז בכרטיס הייעודי למעלה (open-items #19) — הוסר כפל כאן */}
                   <input ref={instructionFileInputRef} type="file" accept={instructionFileAcceptList} className="hidden" onChange={handleInstructionFileUpload} />
                   <input ref={fileInputRef} type="file" multiple accept={helperMaterialAcceptList} className="hidden" onChange={handleUpload} />
                 </div>

                 <div className="bg-white/6 border border-white/15 rounded-2xl p-4 mb-4">
                   <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                     <label className="flex flex-col gap-2 text-right">
                       <span className="text-white font-semibold text-sm">סוג שמירה למסמכי העזר</span>
                       <select
                         value={uploadKind}
                         onChange={(e) => setUploadKind(e.target.value)}
                         className="px-3 py-2 bg-white/10 hover:bg-white/15 border border-white/25 rounded-xl text-white text-xs transition-all shadow-sm appearance-none cursor-pointer min-w-[220px]"
                       >
                         {Object.values(MATERIAL_UPLOAD_PRESETS).map((item) => (
                           <option key={item.id} value={item.id} className="bg-slate-900 text-white">{item.label}</option>
                         ))}
                       </select>
                     </label>
                     <div className="text-[11px] text-cyan-100 bg-cyan-500/20 border border-cyan-200/30 px-3 py-2 rounded-xl">
                       סוג שמירה פעיל: {selectedUploadMeta?.label || 'קובץ עזר כללי'}
                     </div>
                   </div>
                 </div>

                 <div className="grid md:grid-cols-2 gap-3 mb-4">
                   <div
                     onDragEnter={activateDropZone('materials')}
                     onDragOver={activateDropZone('materials')}
                     onDragLeave={deactivateDropZone}
                     onDrop={handleMaterialsDrop}
                     className={`rounded-2xl border border-dashed p-4 transition-all ${activeDropZone === 'materials'
                       ? 'border-cyan-200/80 bg-cyan-400/20 shadow-lg shadow-cyan-950/20'
                       : 'border-white/20 bg-white/5 hover:bg-white/10'}`}
                   >
                     <div className="flex items-start justify-between gap-3">
                       <div>
                         <div className="text-white font-semibold text-sm">גרירה ייעודית לחומרי עזר</div>
                         <div className="text-white/65 text-[11px] mt-1">
                           {activeDropZone === 'materials' ? 'שחרר כאן כדי להעלות את הקבצים כהקשר בלבד.' : 'גרור לכאן PDF, DOCX, TXT, HTML, תמונות או גיליונות נתמכים. זה לא מחליף טיוטת בסיס.'}
                         </div>
                       </div>
                       <div className={`text-[11px] px-3 py-1 rounded-full border ${activeDropZone === 'materials'
                         ? 'bg-cyan-500/25 text-cyan-50 border-cyan-200/60'
                         : 'bg-white/10 text-white/75 border-white/20'}`}>
                         {uploading ? (uploadProgress.total > 1 ? `מעלה ${uploadProgress.current}/${uploadProgress.total}…` : 'מעלה…') : 'materials'}
                       </div>
                     </div>
                   </div>

                   <div
                     onDragEnter={activateDropZone('instructions')}
                     onDragOver={activateDropZone('instructions')}
                     onDragLeave={deactivateDropZone}
                     onDrop={handleInstructionDrop}
                     className={`rounded-2xl border border-dashed p-4 transition-all ${activeDropZone === 'instructions'
                       ? 'border-fuchsia-200/80 bg-fuchsia-400/20 shadow-lg shadow-fuchsia-950/20'
                       : 'border-white/20 bg-white/5 hover:bg-white/10'}`}
                   >
                     <div className="flex items-start justify-between gap-3">
                       <div>
                         <div className="text-white font-semibold text-sm">גרירה ייעודית להנחיות</div>
                         <div className="text-white/65 text-[11px] mt-1">
                           {activeDropZone === 'instructions' ? 'שחרר כאן כדי לקרוא את קובץ ההנחיות ולהוסיף את תוכנו.' : 'גרור לכאן DOCX, PDF, TXT, MD, HTML או JSON עם הנחיות.'}
                         </div>
                       </div>
                       <div className={`text-[11px] px-3 py-1 rounded-full border ${activeDropZone === 'instructions'
                         ? 'bg-fuchsia-500/25 text-fuchsia-50 border-fuchsia-200/60'
                         : 'bg-white/10 text-white/75 border-white/20'}`}>
                         instructions
                       </div>
                     </div>
                     <div className="mt-3 text-[11px] text-fuchsia-100/90 bg-fuchsia-500/10 border border-fuchsia-200/20 rounded-xl px-3 py-2 min-h-[42px] flex items-center">
                       {instructionFileName ? `הקובץ האחרון שנקרא: ${instructionFileName}` : 'עדיין לא נטען קובץ הנחיות במסלול הזה.'}
                     </div>
                   </div>
                 </div>

                 <div className="grid md:grid-cols-2 gap-4 text-right">
                   <div>
                     <textarea
                       value={instructions}
                       onChange={(e) => {
                         const nextInstructions = e.target.value;
                         setInstructions(nextInstructions);
                         if (!nextInstructions.trim()) {
                           setInstructionFileName('');
                           if (typeof saveHomeInstructionFileText === 'function') saveHomeInstructionFileText('');
                           if (typeof saveHomeInstructionFileName === 'function') saveHomeInstructionFileName('');
                         }
                         if (typeof saveHomeInstructions === 'function') saveHomeInstructions(nextInstructions);
                       }}
                       placeholder="הנחיות מחייבות למסמך הזה... (למשל: מבנה, סגנון, דרישות, היקף)"
                       className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 text-sm outline-none focus:ring-1 focus:ring-pink-400 focus:border-transparent resize-y min-h-[90px] h-full"
                     />
                   </div>
                   <div className="bg-white/5 border border-white/10 rounded-xl p-3 min-h-[90px] overflow-y-auto resize-y h-full">
                     {lastUploadedMaterials.length ? (
                       <div className="flex flex-wrap gap-1.5 mb-3">
                         {lastUploadedMaterials.slice(0, 6).map((item) => {
                           const extractionInfo = getMaterialExtractionStatusInfo(item);
                           const successTone = extractionInfo.status === 'success';
                           return (
                             <span
                               key={`last-upload-${item.id}`}
                               title={`${item.title}\n${extractionInfo.message}`}
                               className={`px-2 py-1 rounded-lg text-[10px] border ${successTone
                                 ? 'bg-emerald-500/20 border-emerald-300/40 text-emerald-50'
                                 : 'bg-rose-500/20 border-rose-300/40 text-rose-50'}`}
                             >
                               {item.title} · {extractionInfo.label}
                             </span>
                           );
                         })}
                       </div>
                     ) : null}
                     {materials.length > 0 ? (
                       <div className="flex flex-wrap items-center gap-1.5 mb-2">
                         {MATERIAL_FILTER_OPTIONS.map((option) => {
                           const isActive = materialsFilter === option.id;
                           return (
                             <button
                               key={option.id}
                               type="button"
                               onClick={() => setMaterialsFilter(option.id)}
                               className={`px-2 py-1 rounded-lg text-[10px] border transition-colors ${isActive
                                 ? 'bg-cyan-500/35 border-cyan-200/60 text-cyan-50'
                                 : 'bg-white/5 border-white/15 text-white/70 hover:bg-white/10'}`}
                             >
                               {option.label}
                             </button>
                           );
                         })}
                       </div>
                     ) : null}
                     {materials.length === 0 ? (
                       <div className="text-white/40 text-[11px] text-center mt-4">בחר 'הוסף מסמכי עזר' כדי לבסס את הצ'אט עליהם.</div>
                     ) : groupedFilteredMaterials.length === 0 ? (
                       <div className="text-white/40 text-[11px] text-center mt-4">אין פריטים שמתאימים לפילטר שנבחר.</div>
                     ) : (
                       groupedFilteredMaterials.map((group) => (
                         <div key={group.id} className="mb-2 last:mb-0">
                           <div className="text-white/65 text-[10px] font-semibold mb-1 px-1">
                             {group.label} ({group.items.length})
                           </div>
                           {group.items.map((item) => {
                             const extractionInfo = getMaterialExtractionStatusInfo(item);
                             const successTone = extractionInfo.status === 'success';
                             return (
                               <label
                                 key={item.id}
                                 title={`${item.title}\n${extractionInfo.message}`}
                                 className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg mb-1 cursor-pointer transition-colors border ${successTone
                                   ? 'bg-emerald-500/10 hover:bg-emerald-500/15 border-emerald-300/25'
                                   : 'bg-rose-500/10 hover:bg-rose-500/15 border-rose-300/25'}`}
                               >
                                 <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                                   <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={e => setSelectedIds(prev => e.target.checked ? [...prev, item.id] : prev.filter(id => id !== item.id))} className="checkbox checkbox-xs border-indigo-300 rounded bg-white/20" />
                                   <div className="flex min-w-0 flex-col overflow-hidden">
                                     <span className="text-white/90 text-xs truncate leading-tight w-full">{item.title}</span>
                                     <span className={`text-[10px] truncate ${successTone ? 'text-emerald-100' : 'text-rose-100'}`}>{extractionInfo.label}</span>
                                   </div>
                                 </div>
                                 <div className="flex shrink-0 items-center gap-1">
                                   <span className="text-white/50 text-[9px] whitespace-nowrap border border-white/20 bg-white/5 px-2 py-0.5 rounded">{item.label || 'כללי'}</span>
                                   <button
                                     type="button"
                                     onClick={(event) => handleDeleteMaterial(event, item)}
                                     title="מחק קובץ עזר"
                                     className="w-6 h-6 rounded-md border border-rose-300/35 bg-rose-500/15 text-rose-50 hover:bg-rose-500/30 transition-colors text-xs leading-none"
                                   >
                                     ×
                                   </button>
                                 </div>
                               </label>
                             );
                           })}
                         </div>
                       ))
                     )}
                   </div>
                 </div>
               </div>
              )}
            </div>

          </div>
        </div>

        {/* Templates Grid */}
        <div>
          <h2 className={buildStartScreenRevealClassName(mounted, 'text-3xl font-bold text-white mb-8 text-center')} style={{ ...buildStartScreenRevealStyle(START_SCREEN_REVEAL_DELAYS.templatesHeading), textShadow: '1px 1px 10px rgba(0,0,0,0.5)' }}>
            תבניות חכמות להתחלה מהירה
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6">
            {renderTemplateCards(primaryTemplateCards)}
          </div>

          {extraTemplateCards.length > 0 ? (
            <>
              <div className={`flex justify-center ${shouldShowExtraTemplates ? 'mb-6' : 'mb-16'}`}>
                <button
                  type="button"
                  onClick={handleExtraTemplatesToggle}
                  disabled={hasSelectedHiddenTemplate}
                  aria-expanded={shouldShowExtraTemplates}
                  aria-controls="start-screen-extra-templates"
                  className="px-5 py-2.5 bg-white/10 hover:bg-white/15 disabled:hover:bg-white/10 border border-white/20 rounded-full text-white/85 text-sm font-medium transition-all duration-300 shadow-lg disabled:opacity-80 disabled:cursor-default"
                >
                  {extraTemplatesToggleLabel}
                </button>
              </div>

              {shouldShowExtraTemplates ? (
                <div id="start-screen-extra-templates" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-16">
                  {renderTemplateCards(extraTemplateCards, primaryTemplateCards.length)}
                </div>
              ) : null}
            </>
          ) : (
            <div className="mb-16"></div>
          )}
        </div>

        {/* Quick Access Bar */}
        <div className={buildStartScreenRevealClassName(mounted, 'bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 sm:p-6')} style={buildStartScreenRevealStyle(START_SCREEN_REVEAL_DELAYS.quickAccess)}>
          <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
            {hasOpenDocument && (
              <button
                onClick={onClose}
                className="flex w-full sm:w-auto items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-500/80 to-blue-600/80 hover:from-cyan-600/80 hover:to-blue-700/80 border border-white/30 rounded-xl text-white transition-all duration-300 transform hover:scale-105 shadow-lg"
                title="חזרה למסמך הפתוח (Esc)"
              >
                ↩ חזרה למסמך
              </button>
            )}

            <button
              onClick={onOpenDocument}
              className="flex w-full sm:w-auto items-center justify-center gap-2 px-6 py-3 bg-white/20 hover:bg-white/30 border border-white/30 rounded-xl text-white transition-all duration-300 transform hover:scale-105"
            >
              📁 פתח מסמך קיים
            </button>

            <button
              onClick={() => onOpenSettings('onboarding')}
              className="flex w-full sm:w-auto items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500/80 to-orange-600/80 hover:from-amber-600/80 hover:to-orange-700/80 border border-white/30 rounded-xl text-white transition-all duration-300 transform hover:scale-105 shadow-lg"
            >
              {onboardingDone ? '🧭 עדכון פרופיל היכרות' : '🎯 התחלת היכרות חכמה'}
            </button>

            <button
              onClick={() => onOpenSettings('guide')}
              className="flex w-full sm:w-auto items-center justify-center gap-2 px-6 py-3 bg-white/20 hover:bg-white/30 border border-white/30 rounded-xl text-white transition-all duration-300 transform hover:scale-105"
            >
              ⚙️ הגדרות וסקילים
            </button>

            {onOpenHelp && (
              <button
                onClick={() => onOpenHelp('guideUser')}
                className="flex w-full sm:w-auto items-center justify-center gap-2 px-6 py-3 bg-white/20 hover:bg-white/30 border border-white/30 rounded-xl text-white transition-all duration-300 transform hover:scale-105"
                title="מדריך למשתמש"
              >
                📖 מדריך למשתמש
              </button>
            )}
          </div>
        </div>

        {/* הורדת אפליקציית המחשב — מוצג רק בדפדפן (בתוך הדסקטופ הרכיב מחזיר null) */}
        <div className="mt-6">
          <DesktopDownloadCard variant="glass" />
        </div>
        </main>

        {/* ════ RAIL — רייל צדדי 344px: מותג, פרופיל, מנוע AI, סביבת עבודה, אחרונים (עיצוב חדש) ════ */}
        <aside className="lg:sticky lg:top-4 self-start flex flex-col gap-6 rounded-[20px] border border-white/[0.08] p-5 text-right" style={{ background: 'rgba(3,10,22,0.55)' }}>
          {/* מותג */}
          <div className="flex items-center gap-3">
            <div className="grid h-[42px] w-[42px] place-items-center rounded-[13px]" style={{ background: 'linear-gradient(135deg,#2dd4bf,#1c7fb0)', boxShadow: '0 8px 22px rgba(45,212,191,0.32)' }}>
              <div className="h-[13px] w-[13px] rounded-full bg-[#06231f]" />
            </div>
            <div className="leading-tight">
              <div className="text-[17px] font-extrabold text-[#f1f6fb]">WordAI</div>
              <div className="text-[11.5px] text-[#7e96b0]">כתיבה שלומדת אותך</div>
            </div>
            <button
              type="button"
              onClick={() => toggleTheme()}
              title={uiTheme === 'dark' ? 'עבור למצב בהיר' : 'עבור למצב כהה'}
              aria-label="החלפת ערכת נושא (בהיר/כהה)"
              className="ms-auto grid h-9 w-9 place-items-center rounded-full border border-white/12 bg-white/5 text-[16px] text-[#cfe0ef] transition hover:bg-white/10"
            >
              <i className={`ph ${uiTheme === 'dark' ? 'ph-sun' : 'ph-moon'}`} />
            </button>
          </div>

          {/* פרופיל */}
          <div className="flex items-center gap-3 rounded-[15px] border border-white/10 bg-white/5 px-3.5 py-3">
            <div className="grid h-10 w-10 place-items-center rounded-full text-[16px] font-extrabold text-[#2dd4bf]" style={{ background: 'linear-gradient(135deg,#1c3a52,#13283a)', border: '1px solid rgba(45,212,191,0.38)' }}>
              {(profile?.displayName || 'אורח').trim().charAt(0) || 'א'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-[#f1f6fb]">{profile?.displayName || 'אורח/ת'}</div>
              <div className="flex items-center gap-1.5 text-[11.5px] text-[#7fd4c4]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#7fd4c4]" />הסגנון האישי פעיל
              </div>
            </div>
            <button type="button" onClick={() => onOpenSettings('onboarding')} title="פרופיל והיכרות" className="text-[17px] text-[#7e96b0] transition hover:text-white">⚙</button>
          </div>

          {/* מנוע וסביבת עבודה */}
          <div>
            <button
              type="button"
              onClick={() => setShowEngineSettings((v) => !v)}
              aria-expanded={showEngineSettings}
              aria-controls="start-screen-engine-settings"
              className="w-full flex items-center justify-between gap-2 text-right"
            >
              <span className="flex items-center gap-2 text-[13px] font-extrabold text-[#cfe0ef]"><span>🧠</span>מנוע וסביבת עבודה</span>
              <span className="text-white/60 text-[11px]">{showEngineSettings ? '▲ סגור' : '▼ הרחב'}</span>
            </button>
            <div className="mt-1.5 flex min-w-0 items-center gap-1.5 truncate text-[11.5px] font-bold text-[#7fd4c4]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#7fd4c4]" />{activeGenerationSummary}
            </div>

            {showEngineSettings && (
            <div id="start-screen-engine-settings" className="mt-3">

          {/* מנוע AI ומודל */}
          <div>
            <div className="mb-2.5 flex items-center gap-2 text-[13px] font-extrabold text-[#cfe0ef]"><span>🧠</span>מנוע AI ומודל</div>
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {directProviderChoices.map((choice) => {
                const on = resolvedDirectProviderId === choice.id;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    onClick={() => setDirectProviderId(choice.id)}
                    className={`rounded-full border px-3 py-1.5 text-[12.5px] font-bold transition ${on ? 'border-[#2dd4bf] bg-[#2dd4bf]/[0.18] text-[#eaf2fb]' : 'border-white/10 bg-white/5 text-[#8ba3bd] hover:bg-white/10'}`}
                    title={choice.isDefault ? 'ברירת מחדל' : undefined}
                  >
                    {choice.label}
                  </button>
                );
              })}
            </div>
            <select
              value={resolvedDirectProviderModel}
              onChange={(event) => setDirectProviderModel(event.target.value)}
              disabled={!directProviderModelChoices.length}
              className="mb-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[13.5px] font-bold text-[#f1f6fb] outline-none focus:ring-1 focus:ring-[#2dd4bf] disabled:opacity-60 [&>option]:text-slate-900"
            >
              {directProviderModelChoices.length
                ? directProviderModelChoices.map((modelId) => <option key={modelId} value={modelId}>{modelId}</option>)
                : <option value="">המודל נקבע בהגדרות הספק</option>}
            </select>
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 truncate text-[11.5px] font-bold text-[#7fd4c4]">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#7fd4c4]" />{activeGenerationSummary}
              </span>
              <button
                type="button"
                onClick={handleDirectProviderConnectionTest}
                disabled={directProviderTestStatus === 'loading'}
                className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-[11.5px] font-bold transition ${directProviderTestStatus === 'ok' ? 'border-emerald-300/40 bg-emerald-500/20 text-emerald-50' : directProviderTestStatus === 'fail' ? 'border-rose-300/40 bg-rose-500/20 text-rose-50' : 'border-[#2dd4bf]/40 bg-[#2dd4bf]/10 text-[#2dd4bf] hover:bg-[#2dd4bf]/20'} disabled:opacity-70`}
              >
                {directProviderTestStatus === 'loading' ? 'בודק…' : 'בדוק חיבור'}
              </button>
            </div>
            {directProviderTestMessage ? (
              <div className={`mt-1.5 text-[11px] leading-5 ${directProviderTestStatus === 'ok' ? 'text-emerald-200' : 'text-rose-200'}`}>{directProviderTestMessage}</div>
            ) : null}
          </div>

          {/* סביבת עבודה */}
          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <div className="text-[13px] font-extrabold text-[#cfe0ef]">סביבת עבודה</div>
              <button type="button" onClick={() => setShowWorkspaceV2Details(true)} className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] text-white/85 transition hover:bg-white/15">פרטים</button>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setSelectedWorkspaceV2Id(WORKSPACE_V2_DIRECT_OPTION)}
                className={`rounded-xl border px-3 py-2.5 text-right transition ${!activeWorkspaceV2 ? 'border-[#2dd4bf] bg-[#2dd4bf]/[0.16]' : 'border-white/10 bg-white/[0.045] hover:bg-white/10'}`}
              >
                <div className="text-[13.5px] font-bold text-[#f1f6fb]">Direct</div>
                <div className="text-[11px] text-[#8ba3bd]">קריאה יחידה ונקייה</div>
              </button>
              {workspaceV2Templates.map((workspace) => {
                const active = activeWorkspaceV2?.id === workspace.id;
                return (
                  <button
                    key={workspace.id}
                    type="button"
                    onClick={() => setSelectedWorkspaceV2Id(workspace.id)}
                    className={`rounded-xl border px-3 py-2.5 text-right transition ${active ? 'border-[#2dd4bf] bg-[#2dd4bf]/[0.16]' : 'border-white/10 bg-white/[0.045] hover:bg-white/10'}`}
                  >
                    <div className="text-[13.5px] font-bold text-[#f1f6fb]">{workspace.label}</div>
                    <div className="text-[11px] text-[#8ba3bd]">
                      {workspace.pipeline?.length || 0} שלבים{(workspace.pipeline || []).some((step) => step.providerId || step.model) ? ' · מודלים לפי שלב' : ''}
                    </div>
                  </button>
                );
              })}
            </div>
            {/* טייס אוטומטי הוסתר: מפעיל את ה-orchestrator הישן שנמצא ב-quarantine (aiService WORKSPACE_AUTOMATION_QUARANTINED). */}
          </div>
            </div>
            )}
          </div>

          {/* פרויקטים */}
          <ProjectsPanel
            onOpenProjectBrainstorm={(project) => setSelectedProjectForBrainstorm(project)}
            onOpenProjectSettings={(project) => setSelectedProjectForSettings(project)}
            onOpenDocument={(doc) => handleOpenRecentDoc(doc)}
            onNewDocumentInProject={handleNewDocumentInProject}
            onOpenProjectHub={onOpenProjectHub}
          />

          {/* מסמכים אחרונים (ללא פרויקט, אם קיימים פרויקטים — אחרת כל המסמכים) */}
          {canOpenRecentDocs && recentDocs.some((doc) => Boolean(String(doc?.filePath || '').trim())) && (
            <div className="mt-auto pt-2">
              <div className="mb-2 text-[13px] font-extrabold text-[#cfe0ef]">{projectsList.length ? 'מסמכים אחרונים · ללא פרויקט' : 'מסמכים אחרונים'}</div>
              <div className="flex flex-col gap-0.5">
                {(projectsList.length
                  ? (typeof getUngroupedDocuments === 'function' ? getUngroupedDocuments() : recentDocs)
                  : recentDocs
                ).filter((doc) => Boolean(String(doc?.filePath || '').trim())).slice(0, 5).map((doc) => {
                  const savedAt = doc?.savedAt ? new Date(doc.savedAt) : null;
                  const dateLabel = savedAt && !Number.isNaN(savedAt.getTime())
                    ? savedAt.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
                    : '';
                  return (
                    <div key={doc.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-white/5">
                      <button type="button" onClick={() => handleOpenRecentDoc(doc)} title={doc.title || 'מסמך ללא שם'} className="flex min-w-0 flex-1 items-center gap-2 text-right">
                        <span className="text-[13px] opacity-75">📄</span>
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#bcd2e6]">{doc.title || 'מסמך ללא שם'}</span>
                        {dateLabel && <span className="whitespace-nowrap text-[10.5px] text-[#6f87a1]">{dateLabel}</span>}
                      </button>
                      {Boolean(projectsList.length) && (
                        <select
                          value=""
                          onChange={(e) => e.target.value && handleMoveRecentDoc(doc, e.target.value)}
                          title="העבר לפרויקט…"
                          className="shrink-0 rounded-md border border-white/15 bg-slate-900 px-1 py-0.5 text-[9.5px] text-white/60 opacity-0 outline-none transition group-hover:opacity-100"
                        >
                          <option value="">העבר לפרויקט…</option>
                          {projectsList.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      )}
                      <button type="button" onClick={(event) => handleDeleteRecentDoc(event, doc)} title="הסר" className="text-sm text-[#7e96b0] opacity-0 transition hover:text-rose-300 group-hover:opacity-100">×</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </aside>
        </div>{/* /grid שני-טורים */}

        {showWorkspaceV2Details && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowWorkspaceV2Details(false)}>
            <div className="w-[760px] max-w-[96vw] max-h-[88vh] overflow-y-auto rounded-[24px] bg-slate-900 shadow-2xl border border-white/20 p-6 text-right" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <div className="text-2xl font-bold text-white">{activeWorkspaceV2 ? activeWorkspaceV2.label : 'Direct'}</div>
                  <div className="text-sm text-slate-300 mt-2 leading-6">
                    {activeWorkspaceV2?.mission || 'קריאה יחידה למודל הפעיל, בלי pipeline של סביבת עבודה.'}
                  </div>
                </div>
                <button type="button" onClick={() => setShowWorkspaceV2Details(false)} className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors">✕</button>
              </div>

              <div className="grid md:grid-cols-3 gap-3 mb-5">
                <div className="rounded-xl border border-cyan-200/20 bg-cyan-500/10 p-4">
                  <div className="text-[11px] text-cyan-100/75 font-semibold mb-1">ספק ומודל</div>
                  <div className="text-white text-sm font-bold">{activeGenerationSummary}</div>
                </div>
                <div className="rounded-xl border border-emerald-200/20 bg-emerald-500/10 p-4">
                  <div className="text-[11px] text-emerald-100/75 font-semibold mb-1">מסלול</div>
                  <div className="text-white text-sm font-bold">{activeWorkspaceV2 ? 'Workspace v2' : 'Direct'}</div>
                </div>
                <div className="rounded-xl border border-white/15 bg-white/8 p-4">
                  <div className="text-[11px] text-white/55 font-semibold mb-1">שלבים</div>
                  <div className="text-white text-sm font-bold">{activeWorkspaceV2?.pipeline?.length || 1}</div>
                </div>
              </div>

              {activeWorkspaceV2 ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-white/15 bg-white/8 p-4">
                    <div className="text-white text-sm font-bold mb-2">מדיניות</div>
                    <div className="grid md:grid-cols-2 gap-3 text-xs leading-6 text-slate-200">
                      <div>
                        <div className="text-slate-400 font-semibold mb-1">מקורות</div>
                        <div>מצב: {activeWorkspaceV2.sourcePolicy?.mode || 'context-aware'}</div>
                        <div>ציטוט: {activeWorkspaceV2.sourcePolicy?.citationStyle || 'לפי הצורך'}</div>
                        {(activeWorkspaceV2.sourcePolicy?.requireSourcesWhen || []).length ? (
                          <div className="mt-1">מופעל כש: {activeWorkspaceV2.sourcePolicy.requireSourcesWhen.join(' | ')}</div>
                        ) : null}
                      </div>
                      <div>
                        <div className="text-slate-400 font-semibold mb-1">סגנון</div>
                        <div>{activeWorkspaceV2.stylePolicy?.preservePersonalStyle ? 'שמירת סגנון אישי פעילה' : 'סגנון אישי לפי הצורך'}</div>
                        {(activeWorkspaceV2.stylePolicy?.avoid || []).length ? (
                          <div className="mt-1">להימנע מ: {activeWorkspaceV2.stylePolicy.avoid.join(' | ')}</div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/15 bg-white/8 p-4">
                    <div className="text-white text-sm font-bold mb-3">תפקידי הצוות</div>
                    <div className="space-y-3">
                      {(activeWorkspaceV2.pipeline || []).map((step, index) => (
                        <div key={step.id || index} className="rounded-xl border border-white/10 bg-slate-950/35 p-4">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-2">
                            <div className="text-white text-sm font-bold">{index + 1}. {step.role || step.id}</div>
                            <div className="text-[11px] text-cyan-100 bg-cyan-500/15 border border-cyan-200/20 px-2 py-1 rounded-full self-start md:self-auto">{step.output || 'תוצר ביניים'}</div>
                          </div>
                          <div className="text-slate-200 text-xs leading-6">{step.goal}</div>
                          {(step.providerId || step.model) ? (
                            <div className="mt-2 text-cyan-100 text-[11px] leading-5">
                              מודל השלב: {[step.providerId, step.model].filter(Boolean).join(' · ')}
                            </div>
                          ) : null}
                          {(step.instructions || []).length ? (
                            <div className="mt-2 text-slate-400 text-[11px] leading-5">{step.instructions.join(' | ')}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-white/15 bg-white/8 p-4 text-slate-200 text-sm leading-7">
                  Direct משתמש באותו ספק ומודל שמוצגים כאן, ומדלג על חוזה Workspace v2. זה המסלול הכי נקי ומהיר ליצירה בלי תפקידי צוות.
                </div>
              )}
            </div>
          </div>
        )}

        {editingCard && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-[520px] max-w-[96%] rounded-[24px] bg-slate-800 shadow-2xl border border-white/20 p-6 text-right">
              <div className="flex items-center justify-between gap-3 mb-6">
                <div>
                  <div className="text-2xl font-bold text-white">עריכת תבנית</div>
                  <div className="text-sm text-slate-400 mt-1">אפשר לעדכן את השם, התיאור, והנחיות העבודה של התבנית.</div>
                </div>
                <button type="button" onClick={() => setEditingCard(null)} className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors">✕</button>
              </div>

              <div className="space-y-4">
                <input
                  value={editingCard.title || ''}
                  onChange={(e) => setEditingCard((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="שם התבנית"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 text-base outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all"
                />
                <textarea
                  value={editingCard.subtitle || ''}
                  onChange={(e) => setEditingCard((prev) => ({ ...prev, subtitle: e.target.value }))}
                  placeholder="תיאור קצר"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 text-base outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all min-h-[60px] resize-y"
                />
                <textarea
                  value={editingCard.customPrompt || ''}
                  onChange={(e) => setEditingCard((prev) => ({ ...prev, customPrompt: e.target.value }))}
                  placeholder="הנחיות או פרומפט מותאם אישית לתבנית זו (למשל: 'כתוב בצורה אקדמית עם פסקאות קצרות')"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 text-base outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all min-h-[100px] resize-y"
                />
              </div>

              <div className="flex gap-3 justify-end mt-6">
                <button type="button" onClick={() => setEditingCard(null)} className="px-5 py-2.5 rounded-xl text-white hover:bg-white/10 transition-colors">ביטול</button>
                <button type="button" onClick={() => { saveCardCustomization(); setEditingCard(null); }} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold shadow-lg hover:shadow-pink-500/25 transition-all">שמור</button>
              </div>
            </div>
          </div>
        )}

        {showChefDialog && (
          <ChefModeDialog
            onStart={handleChefStart}
            onClose={handleChefClose}
            escapeBlocked={escapeBlocked}
            onModelChange={setSelectedModel}
            onGoToEditor={() => {
              setSelectedModel(undefined);
              setShowChefDialog(false);
            }}
            selectedModel={selectedModel || resolvedDirectProviderId}
            chefContext={{
              prompt: String(prompt || '').trim(),
              templateId: selectedTemplate,
              instructions: String(instructions || '').trim(),
              selectedMaterials: materials.filter((item) => selectedIds.includes(item.id)),
              baseDraftText: String(baseDraft?.text || '').trim()
                || String(baseDraft?.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
            }}
          />
        )}

        {selectedProjectForSettings && (
          <ProjectSettingsModal
            project={selectedProjectForSettings}
            onClose={() => setSelectedProjectForSettings(null)}
          />
        )}

        {selectedProjectForBrainstorm && (
          <ProjectBrainstormPanel
            project={selectedProjectForBrainstorm}
            onClose={() => setSelectedProjectForBrainstorm(null)}
            onTurnIntoWorkDirection={handleTurnProjectBrainstormIntoWorkDirection}
          />
        )}
      </div>
    </div>
  );
}
