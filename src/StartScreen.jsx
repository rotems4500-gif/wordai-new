import React, { useEffect, useRef, useState } from 'react';
import ChefModeDialog from './ChefModeDialog';
import {
  getHomeInstructions,
  getWorkspaceTemplateCards,
  loadPastDocsIndex,
  loadProjectMaterials,
  saveHelperMaterial,
  saveHomeInstructions,
  syncLearnedStyleFromWorkspace,
  readInstructionFile,
  MATERIAL_UPLOAD_PRESETS,
  getMaterialUploadMeta,
} from './services/workspaceLearningService';
import { getOrderedRoleAgents, getWorkspaceAutomation, saveWorkspaceAutomation, getPersonalStyleProfile, savePersonalStyleProfile, chefModeInterview, getWorkspacesLibrary, switchToWorkspace, setWorkspaceBypassEnabled, getConfiguredProviderChoices, getProviderModelChoices, getProviderConfig, getAppMemory, saveAppMemory } from './services/aiService';

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

const PRIMARY_TEMPLATE_CARD_LIMIT = 3;

const QUICK_PROMPTS = [
  '✍️ כתוב לי מכתב פורמלי למעסיק',
  '📝 צור הצעת מחקר על בינה מלאכותית',
  '📊 עזור לי להכין דוח ביצועים רבעוני',
  '🎯 כתוב תוכנית עסקית לסטארטאפ',
  '📚 סכם לי מאמר אקדמי מורכב',
  '💌 צור פוסט מרגש לרשתות חברתיות',
];

const WORKFLOW_LABELS = {
  'manager-auto': 'מנהל אוטומטי בוחר מסלול',
  'circular-team': 'סביבה מעגלית',
  'manager-pipeline': 'מנהל ← מקורות ← מבנה ← כתיבה ← ליטוש',
  'design-first': 'מבנה קודם',
  'research-first': 'חקר קודם',
  'custom-order': 'סדר מותאם אישית',
};

const NO_WORKSPACE_OPTION_VALUE = '__no-workspace__';

const WORKSPACE_PROVIDER_LABELS = {
  gemini: 'Gemini',
  claude: 'Claude',
  perplexity: 'Perplexity',
  openai: 'OpenAI',
  groq: 'Groq',
  ollama: 'Ollama',
  custom: 'Custom',
};

const summarizeWorkspaceProviders = (agents = []) => {
  const providers = [...new Set((Array.isArray(agents) ? agents : [])
    .map((agent) => String(agent?.provider || '').trim())
    .filter(Boolean))];
  if (!providers.length) return 'ספקים דינמיים לפי הסוכן או ברירת המחדל';
  return providers.map((providerId) => WORKSPACE_PROVIDER_LABELS[providerId] || providerId).join(' + ');
};

const getProviderLabelFromChoices = (providerId = '', choices = []) => {
  const normalizedId = String(providerId || '').trim();
  if (!normalizedId) return 'AI';
  return choices.find((choice) => choice.id === normalizedId)?.label || WORKSPACE_PROVIDER_LABELS[normalizedId] || normalizedId;
};

const buildDirectGenerationSummary = ({ providerId = '', modelId = '', choices = [] } = {}) => {
  const providerLabel = getProviderLabelFromChoices(providerId, choices);
  const cleanModel = String(modelId || '').trim();
  return cleanModel ? `${providerLabel} · ${cleanModel}` : providerLabel;
};

const ONBOARDING_AREAS = ['אקדמיה ומחקר', 'עסקים וניהול', 'משפט ומסמכים רשמיים', 'שיווק ותוכן', 'עבודה משרדית', 'שימוש כללי'];
const ONBOARDING_AUDIENCES = ['מרצים ובודקים', 'לקוחות ושותפים', 'מנהלים בארגון', 'קהל רחב', 'שימוש פנימי'];
const ONBOARDING_FORMATS = ['פסקאות קצרות וברורות', 'סגנון מפורט ומעמיק', 'תוכן עם כותרות וסעיפים', 'ניסוח תכליתי ומהיר'];
const ONBOARDING_TONES = ['רשמי', 'אקדמי', 'אנושי', 'ישיר', 'משכנע', 'ידידותי'];
const LENGTH_OPTIONS = ['קצר', 'מאוזן', 'מעמיק'];
const PARAGRAPH_OPTIONS = ['תמציתי', 'בינוני', 'מפורט'];
const LEARNING_GAMES = [
  {
    id: 'tone-game',
    title: 'איזה קול אתה רוצה מהסוכן?',
    options: [
      { id: 'formal', label: 'רשמי ומדויק', insight: 'להעדיף טון רשמי ומדויק', tone: 'רשמי' },
      { id: 'human', label: 'אנושי וזורם', insight: 'להעדיף ניסוח אנושי וזורם', tone: 'אנושי' },
      { id: 'direct', label: 'ישיר ולעניין', insight: 'להעדיף תשובות ישירות וללא מריחות', tone: 'ישיר' },
    ],
  },
  {
    id: 'depth-game',
    title: 'איזו רמת פירוט עובדת הכי טוב בשבילך?',
    options: [
      { id: 'short', label: 'קצר ומהיר', insight: 'להעדיף תמצות ותשובות קצרות', sentenceLength: 'קצר', paragraphLength: 'תמציתי' },
      { id: 'balanced', label: 'מאוזן וברור', insight: 'להעדיף איזון בין קיצור להסבר', sentenceLength: 'מאוזן', paragraphLength: 'בינוני' },
      { id: 'deep', label: 'מעמיק ומפורט', insight: 'להעדיף עומק ופירוט כשיש צורך', sentenceLength: 'מעמיק', paragraphLength: 'מפורט' },
    ],
  },
  {
    id: 'structure-game',
    title: 'איך הכי נוח לך לקבל טקסט?',
    options: [
      { id: 'headings', label: 'כותרות וסעיפים', insight: 'להעדיף מבנה היררכי עם כותרות', format: 'תוכן עם כותרות וסעיפים' },
      { id: 'paragraphs', label: 'פסקאות זורמות', insight: 'להעדיף כתיבה רציפה בפסקאות', format: 'סגנון מפורט ומעמיק' },
      { id: 'quick', label: 'נקודות קצרות', insight: 'להעדיף נקודות תכליתיות ומהירות', format: 'ניסוח תכליתי ומהיר' },
    ],
  },
  {
    id: 'avoid-game',
    title: 'מה הכי חשוב לך שהסוכן ימנע ממנו?',
    options: [
      { id: 'invent', label: 'לא להמציא מקורות', insight: 'לא להמציא עובדות או מקורות חסרים' },
      { id: 'repeat', label: 'לא לחזור על עצמו', insight: 'להימנע מחזרתיות וניפוח' },
      { id: 'robotic', label: 'לא להיות רובוטי', insight: 'להעדיף שפה טבעית ולא מכנית' },
    ],
  },
];

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

const getDraftTitleFromFileName = (name = '') => String(name || '').replace(/\.[^.]+$/, '').trim() || 'טיוטת בסיס';

const formatInstructionFileUploadError = (error) => {
  const code = String(error?.message || '').trim();
  if (code === 'unsupported-binary-file') return 'קובץ ההנחיות לא נתמך. אפשר להעלות כרגע docx, txt, md, html, json או pdf.';
  if (code === 'empty-pdf-text') return 'לא הצלחתי לחלץ טקסט קריא מתוך קובץ ה-PDF.';
  if (code === 'empty-docx-text') return 'לא הצלחתי לחלץ טקסט קריא מתוך קובץ ה-DOCX.';
  if (code === 'empty-file-text') return 'לא נמצא טקסט קריא בתוך קובץ ההנחיות שנבחר.';
  return 'לא הצלחתי לקרוא את קובץ ההנחיות.';
};

export default function StartScreen({ onCreateBlank, onCreateTemplate, onOpenLastDraft, onOpenDocument = () => {}, onGenerateFromPrompt, onDocumentStyleChange = () => {}, onOpenSettings = () => {}, onClose = () => {}, escapeBlocked = false, documentStyle = 'academic', hasDraft = false, lastSavedAt = '', instructionsResetToken = 0, onInstructionsResetConsumed = () => {} }) {
  const [prompt, setPrompt] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [showChefDialog, setShowChefDialog] = useState(false);
  const [selectedModel, setSelectedModel] = useState();
  const [providerConfigState, setProviderConfigState] = useState(() => getProviderConfig());
  const [directProviderId, setDirectProviderId] = useState(() => {
    const initialConfig = getProviderConfig();
    const memory = getAppMemory();
    const configuredChoices = getConfiguredProviderChoices(initialConfig);
    const fallbackProviderId = configuredChoices[0]?.id || String(initialConfig?.active || 'gemini').trim() || 'gemini';
    const rememberedProviderId = String(memory.homeProviderId || '').trim();
    return configuredChoices.some((choice) => choice.id === rememberedProviderId)
      ? rememberedProviderId
      : (rememberedProviderId || fallbackProviderId);
  });
  const [directProviderModel, setDirectProviderModel] = useState(() => {
    const initialConfig = getProviderConfig();
    const memory = getAppMemory();
    const configuredChoices = getConfiguredProviderChoices(initialConfig);
    const fallbackProviderId = configuredChoices[0]?.id || String(initialConfig?.active || 'gemini').trim() || 'gemini';
    const rememberedProviderId = String(memory.homeProviderId || '').trim() || fallbackProviderId;
    const modelChoices = getProviderModelChoices(rememberedProviderId, initialConfig, [memory.homeProviderModel]);
    const rememberedProviderModel = String(memory.homeProviderModel || '').trim();
    return modelChoices.includes(rememberedProviderModel) ? rememberedProviderModel : (modelChoices[0] || '');
  });
  const previousDirectProviderIdRef = useRef('');
  
  const profile = getPersonalStyleProfile();
  const onboardingDone = Boolean(profile?.onboardingCompletedAt);

  const fileInputRef = useRef(null);
  const baseDraftInputRef = useRef(null);
  const instructionFileInputRef = useRef(null);
  const [instructions, setInstructions] = useState(() => (instructionsResetToken > 0 ? '' : (typeof getHomeInstructions === 'function' ? getHomeInstructions() : '')));
  const [materials, setMaterials] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [instructionFileName, setInstructionFileName] = useState('');
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
  const workspaceBypassActive = currentWorkspaceId === NO_WORKSPACE_OPTION_VALUE;

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

  const resolvedDirectProviderModel = directProviderModelChoices.includes(String(directProviderModel || '').trim())
    ? String(directProviderModel || '').trim()
    : (directProviderModelChoices[0] || '');

  const directGenerationSummary = buildDirectGenerationSummary({
    providerId: resolvedDirectProviderId,
    modelId: resolvedDirectProviderModel,
    choices: directProviderChoices,
  });

  useEffect(() => {
    if (instructionsResetToken <= 0) return;
    setInstructions('');
    setInstructionFileName('');
    if (typeof saveHomeInstructions === 'function') saveHomeInstructions('');
    onInstructionsResetConsumed?.();
  }, [instructionsResetToken, onInstructionsResetConsumed]);

  useEffect(() => {
    const refreshProviderConfig = () => setProviderConfigState(getProviderConfig());
    refreshProviderConfig();
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('focus', refreshProviderConfig);
    window.addEventListener('wordai-settings-hydrated', refreshProviderConfig);
    return () => {
      window.removeEventListener('focus', refreshProviderConfig);
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

  const [templateCards, setTemplateCards] = useState(() => applyStartScreenCustomizations(MODERN_TEMPLATES, 'templates'));
  const [editingCard, setEditingCard] = useState(null);
  const [showExtraTemplates, setShowExtraTemplates] = useState(false);
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
    if (editingCard?.id || showChefDialog || escapeBlocked) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      onClose?.();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [editingCard?.id, showChefDialog, escapeBlocked, onClose]);

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
    setQuickWorkflowMode(['circular-team', 'custom-order'].includes(nextWorkflowMode) ? nextWorkflowMode : '__keep-current__');
    setCircularWorkflowEnabled(automation?.circularWorkflowEnabled !== false);
    setCircularMaxRounds(Math.max(1, Math.min(4, Number(automation?.circularMaxRounds) || 2)));
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
          providerSummary: summarizeWorkspaceProviders(ws.agents),
        }));
        setWorkspacesList(nextWorkspacesList);
      }
    };

    if (typeof loadProjectMaterials === 'function') loadProjectMaterials().then(setMaterials).catch(()=>null);
    refreshWorkspaceState();

    if (typeof window === 'undefined') return undefined;
    window.addEventListener('wordai-workspace-changed', refreshWorkspaceState);
    return () => window.removeEventListener('wordai-workspace-changed', refreshWorkspaceState);
  }, []);

  const handleUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const selectedUploadMeta = typeof getMaterialUploadMeta === 'function' ? getMaterialUploadMeta(uploadKind) : { id: uploadKind };
      const uploadedIds = [];
      for (const file of files) {
        if (typeof saveHelperMaterial === 'function') {
          const result = await saveHelperMaterial(file, selectedUploadMeta);
          if (result?.entry?.id) uploadedIds.push(result.entry.id);
        }
      }
      if (typeof loadProjectMaterials === 'function') {
        const mats = await loadProjectMaterials();
        setMaterials(mats);
      }
      if (uploadedIds.length) {
        setSelectedIds((prev) => Array.from(new Set([...prev, ...uploadedIds])));
      }
    } catch(e) { console.error(e); } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleInstructionFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      let extracted = '';
      if (typeof readInstructionFile === 'function') extracted = await readInstructionFile(file);
      if (!String(extracted || '').trim()) {
        window.alert('לא הצלחתי לקרוא תוכן מתוך קובץ ההנחיות.');
        return;
      }
      const labeledText = 'קובץ הנחיות: ' + file.name + '\n' + String(extracted).trim();
      setInstructions((prev) => {
        const currentInstructions = String(prev || '').trim();
        const nextInstructions = currentInstructions ? currentInstructions + '\n\n---\n' + labeledText : labeledText;
        if (typeof saveHomeInstructions === 'function') saveHomeInstructions(nextInstructions);
        return nextInstructions;
      });
      setInstructionFileName(file.name);
    } catch (error) {
      console.error(error);
      window.alert(formatInstructionFileUploadError(error));
    } finally {
      event.target.value = '';
    }
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
          window.alert(result?.error || 'לא הצלחתי לטעון את הטיוטה שנבחרה.');
          return;
        }
        setBaseDraft(normalizeBaseDraft({
          ...result,
          source: 'desktop',
        }));
        return;
      }

      baseDraftInputRef.current?.click();
    } catch (error) {
      console.error(error);
      window.alert('לא הצלחתי לבחור טיוטת בסיס.');
    }
  };

  const handleBaseDraftUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const ext = String(file.name || '').toLowerCase().split('.').pop();
      if (!['txt', 'md', 'markdown', 'html', 'htm'].includes(ext)) {
        window.alert('בדפדפן אפשר לבחור כעת רק קובצי txt, md או html כטיוטת בסיס.');
        return;
      }

      const rawText = await file.text();
      const html = /<(html|body|p|h1|h2|div|span|br|ul|ol|li)\b/i.test(rawText)
        ? rawText
        : plainTextToHtml(rawText);

      setBaseDraft(normalizeBaseDraft({
        name: file.name,
        title: getDraftTitleFromFileName(file.name),
        html,
        text: rawText,
        source: 'browser',
      }));
    } catch (error) {
      console.error(error);
      window.alert('לא הצלחתי לקרוא את הטיוטה שנבחרה.');
    } finally {
      event.target.value = '';
    }
  };

  const handleLoadWorkspace = () => {
    if (typeof getWorkspaceAutomation !== 'function' || typeof getOrderedRoleAgents !== 'function') return;
    const automation = getWorkspaceAutomation();
    const agents = getOrderedRoleAgents(automation.workflowMode);
    if (!automation?.enabled) {
      window.alert('צריך קודם להפעיל את סביבת הסוכנים במסך ההגדרות.');
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
        window.alert('לא הצלחתי לעבור למצב ללא סביבת עבודה.');
      }
      return;
    }
    
    try {
      const switched = await switchToWorkspace(selectedWorkspaceId);
      if (!switched) {
        window.alert('לא הצלחתי להחליף סביבת עבודה. בדוק שהסביבה קיימת.');
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
      window.alert('שגיאה בהחלפת סביבת העבודה');
    }
  };

  const handleAutopilotToggle = (event) => {
    const checked = Boolean(event.target.checked);
    setAutopilotEnabled(checked);
    persistAutomationUpdates({ autopilotEnabled: checked });
  };

  const handleWorkflowModeChange = (event) => {
    const nextMode = event.target.value === 'custom-order' ? 'custom-order' : 'circular-team';
    setQuickWorkflowMode(nextMode);
    setActualWorkflowMode(nextMode);
    persistAutomationUpdates({
      workflowMode: nextMode,
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
    // אנימציה מחזורית של ההצעות המהירות
    const interval = setInterval(() => {
      setCurrentPromptIndex(prev => (prev + 1) % QUICK_PROMPTS.length);
    }, 3000);
    
    return () => clearInterval(interval);
  }, []);

  const hasBaseDraft = Boolean(String(baseDraft?.html || '').trim());
  const hasGenerationInput = Boolean(String(prompt || '').trim() || String(instructions || '').trim() || hasBaseDraft);
  const canGenerate = hasGenerationInput && !isGenerating;

  const handleGenerate = async () => {
    if (!hasGenerationInput || isGenerating) return;

    setIsGenerating(true);
    try {
      const selectedMaterials = materials.filter((item) => selectedIds.includes(item.id));
      const selectedProviderId = workspaceBypassActive ? resolvedDirectProviderId : '';
      const selectedProviderModel = workspaceBypassActive ? resolvedDirectProviderModel : '';
      await onGenerateFromPrompt?.({
        prompt,
        templateId: selectedTemplate,
        instructions: String(instructions || '').trim(),
        selectedMaterials,
        selectedModel: selectedProviderId,
        selectedProviderId,
        selectedProviderModel,
        baseDraft,
      });
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

  const handleChefStart = async (responses, model) => {
    try {
      setIsGenerating(true);
      const result = await chefModeInterview(responses, model);
      const generatedPrompt = String(result?.brief ?? result?.html ?? responses?.[0]?.answer ?? 'בישול אוטומטי').trim();
      const selectedMaterials = materials.filter((item) => selectedIds.includes(item.id));
      const selectedProviderId = workspaceBypassActive ? String(model || '').trim() : '';
      const selectedProviderModel = workspaceBypassActive && selectedProviderId === resolvedDirectProviderId
        ? resolvedDirectProviderModel
        : '';
      await onGenerateFromPrompt?.({
        prompt: generatedPrompt,
        templateId: selectedTemplate,
        instructions: String(instructions || '').trim(),
        selectedMaterials,
        selectedModel: model,
        selectedProviderId,
        selectedProviderModel,
        baseDraft,
      });
      setSelectedModel(undefined);
      setShowChefDialog(false);
    } catch (error) {
      console.error('שגיאה בשלב הבישול:', error);
      window.alert('שגיאה בשלב הבישול. בדוק את הקונסול.');
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
      className={`group relative bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 cursor-pointer transition-all duration-500 transform hover:scale-105 hover:bg-white/15 shadow-xl hover:shadow-2xl ${
        selectedTemplate === template.id ? 'ring-2 ring-pink-400 bg-white/20' : ''
      }`}
      onClick={() => handleTemplateSelect(template)}
      style={{
        animationDelay: `${(indexOffset + i) * 0.1}s`
      }}
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
    <div className="min-h-[calc(100vh-140px)] w-full flex-1 bg-gradient-to-br from-slate-950 via-blue-950 to-cyan-950 relative overflow-hidden" dir="rtl">
      {/* Animated Background Elements */}
      <div className="absolute inset-0">
        <div className="absolute top-20 right-20 w-72 h-72 bg-cyan-300/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 left-20 w-96 h-96 bg-sky-300/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-amber-200/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '4s' }}></div>
      </div>

      {/* Floating Particles */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute bg-white/5 rounded-full animate-bounce"
            style={{
              width: Math.random() * 10 + 5 + 'px',
              height: Math.random() * 10 + 5 + 'px',
              left: Math.random() * 100 + '%',
              top: Math.random() * 100 + '%',
              animationDelay: Math.random() * 5 + 's',
              animationDuration: (Math.random() * 3 + 2) + 's'
            }}
          />
        ))}
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-12">
        {/* Hero Section */}
        <div className={`text-center mb-16 transition-all duration-1000 ${mounted ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-10'}`}>
          <div className="mb-8">
            <h1 className="text-6xl md:text-7xl font-bold text-white mb-4" style={{ textShadow: '2px 2px 20px rgba(0,0,0,0.5)' }}>
              {profile?.displayName ? (
                <>שלום <span className="bg-gradient-to-r from-cyan-200 to-amber-200 bg-clip-text text-transparent">{profile.displayName}</span>! 👋</>
              ) : (
                <>יוצרים <span className="bg-gradient-to-r from-cyan-200 to-amber-200 bg-clip-text text-transparent">תוכן חכם</span> ביחד? 🚀</>
              )}
            </h1>
            <p className="text-xl md:text-2xl text-white/80 max-w-3xl mx-auto leading-relaxed" style={{ textShadow: '1px 1px 10px rgba(0,0,0,0.3)' }}>
              AI שמבין אותך, יוצר איתך, וממשיך ללמוד מהסגנון שלך ⚡
            </p>
          </div>

          {/* Quick Prompt Animation */}
          <div className="bg-white/12 backdrop-blur-2xl border border-white/35 rounded-2xl p-6 max-w-4xl mx-auto mb-8 shadow-[0_20px_60px_rgba(2,6,23,0.45)]">
            <div className="text-white/70 text-sm mb-4">רעיונות למסמכים:</div>
            <div 
              className="text-white text-lg font-medium transition-all duration-500"
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

          {/* Main Input Area */}
          <div className="bg-white/12 backdrop-blur-2xl border border-white/35 rounded-3xl p-8 max-w-5xl mx-auto shadow-[0_24px_80px_rgba(3,7,18,0.55)]">
            <div className="flex flex-col md:flex-row gap-4 items-center mb-6">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                  placeholder="נושא קצר או הקשר אופציונלי למסמך. אפשר להשאיר ריק אם ההנחיות למטה כבר מגדירות הכול"
                  className="w-full px-6 py-4 bg-white/18 backdrop-blur-md border border-white/40 rounded-2xl text-white placeholder-white/70 text-lg outline-none focus:ring-2 focus:ring-cyan-200 focus:border-transparent transition-all duration-300"
                />
                <div className="absolute left-4 top-1/2 transform -translate-y-1/2">
                  <div className="w-3 h-3 bg-cyan-200 rounded-full animate-pulse"></div>
                </div>
              </div>
              
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className={`px-8 py-4 rounded-2xl font-bold text-lg transition-all duration-300 transform hover:scale-105 ${
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
                    <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full"></div>
                    יוצר...
                  </div>
                ) : (
                  <>{hasBaseDraft ? '✨ עדכן מהטיוטה' : '✨ בואו נתחיל'}</>
                )}
              </button>

              <button
                onClick={() => setShowChefDialog(true)}
                disabled={isGenerating}
                className="px-8 py-4 rounded-2xl font-bold text-lg transition-all duration-300 transform hover:scale-105 bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 shadow-lg hover:shadow-2xl disabled:bg-gray-500/50 disabled:text-gray-200 disabled:cursor-not-allowed"
                style={{
                  boxShadow: !isGenerating ? '0 10px 30px rgba(245, 158, 11, 0.45)' : 'none'
                }}
              >
                👨‍🍳 בוא נבשל
              </button>
            </div>

            <div className="text-right text-xs text-white/72 mb-6">
              שדה הנושא העליון הוא רשות. ההנחיות למטה הן המקור המחייב, והשדה הזה נועד רק להוסיף brief או הקשר קצר אם צריך. אם בחרת טיוטת בסיס, אפשר גם להשאיר את שני השדות ריקים כדי לבצע ליטוש ראשוני.
            </div>

            <div className="bg-white/10 backdrop-blur-xl border border-white/25 rounded-2xl p-5 mb-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <div className="text-white font-semibold text-sm">📄 טיוטת בסיס אופציונלית</div>
                  <div className="text-white/70 text-xs mt-1">בחר מסמך קיים כדי לעדכן או ללטש אותו במקום להתחיל מסמך חדש.</div>
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
                accept=".txt,.md,.markdown,.html,.htm"
                className="hidden"
                onChange={handleBaseDraftUpload}
              />
            </div>

            {/* Advance Options Area */}
            <div className="bg-white/10 backdrop-blur-xl border border-white/30 rounded-2xl p-6">
               <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-3">
                 <div className="text-white/80 font-medium whitespace-nowrap">✨ סביבת עבודה ומצב הפעלה</div>
                 <div className="flex flex-wrap items-center gap-2 justify-end w-full">
                   <select 
                     value={currentWorkspaceId} 
                     onChange={handleWorkspaceChange} 
                     className="px-3 py-2 bg-cyan-500/25 hover:bg-cyan-500/35 border border-cyan-200/45 rounded-xl text-white text-xs transition-all shadow-sm appearance-none cursor-pointer min-w-[120px]"
                   >
                     <option value={NO_WORKSPACE_OPTION_VALUE} className="bg-gray-800 text-white">
                       ללא סביבת עבודה · {directGenerationSummary}
                     </option>
                     {workspacesList.map(workspace => (
                       <option key={workspace.id} value={workspace.id} className="bg-gray-800 text-white">
                         {workspace.name} · {workspace.providerSummary}
                       </option>
                     ))}
                   </select>
                    <label className="px-3 py-2 bg-violet-500/25 hover:bg-violet-500/35 border border-violet-200/45 rounded-xl text-white text-xs transition-all shadow-sm cursor-pointer min-w-[150px] inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={autopilotEnabled}
                        onChange={handleAutopilotToggle}
                        disabled={workspaceBypassActive}
                        className="checkbox checkbox-xs border-violet-200 rounded bg-white/20"
                        aria-label="הפעל אוטופיילוט"
                      />
                      הפעל אוטופיילוט
                    </label>
                 </div>
               </div>

               <div className="flex flex-wrap items-center justify-end gap-2 mb-4">
                 <button
                   type="button"
                   onClick={() => instructionFileInputRef.current?.click()}
                   className="px-3 py-2 bg-fuchsia-500/25 hover:bg-fuchsia-500/35 border border-fuchsia-200/45 rounded-xl text-white text-xs transition-all shadow-sm"
                 >
                   קובץ הנחיות
                 </button>
                 <select
                   value={uploadKind}
                   onChange={(e) => setUploadKind(e.target.value)}
                   className="px-3 py-2 bg-white/10 hover:bg-white/15 border border-white/25 rounded-xl text-white text-xs transition-all shadow-sm appearance-none cursor-pointer min-w-[140px]"
                 >
                   {Object.values(MATERIAL_UPLOAD_PRESETS).map((item) => (
                     <option key={item.id} value={item.id} className="bg-slate-900 text-white">{item.label}</option>
                   ))}
                 </select>
                 <button
                   type="button"
                   onClick={() => fileInputRef.current?.click()}
                   className="px-3 py-2 bg-cyan-500/25 hover:bg-cyan-500/35 border border-cyan-200/45 rounded-xl text-white text-xs transition-all shadow-sm"
                 >
                   {uploading ? 'מעלה...' : 'הוסף מסמכי עזר'}
                 </button>
                 <input ref={instructionFileInputRef} type="file" accept=".docx,.txt,.md,.markdown,.html,.htm,.json,.pdf" className="hidden" onChange={handleInstructionFileUpload} />
                 <input ref={fileInputRef} type="file" multiple accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.md,.markdown,.html,.htm,.png,.jpg,.jpeg,.webp" className="hidden" onChange={handleUpload} />
               </div>

               <div className="bg-white/6 border border-white/15 rounded-2xl p-4 mb-4">
                 <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
                   <div className="text-white font-semibold text-sm">🧠 ספק ומודל למסלול הישיר</div>
                   <span className="text-[11px] text-cyan-100 bg-cyan-500/20 border border-cyan-200/30 px-3 py-1 rounded-full">
                     {workspaceBypassActive ? `פעיל עכשיו: ${directGenerationSummary}` : `ברירת מחדל למסלול הישיר: ${directGenerationSummary}`}
                   </span>
                 </div>

                 <div className="grid md:grid-cols-2 gap-3">
                   <label className="flex flex-col gap-2 text-right">
                     <span className="text-white/80 text-xs">ספק AI</span>
                     <select
                       value={resolvedDirectProviderId}
                       onChange={(event) => setDirectProviderId(event.target.value)}
                       className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white text-sm outline-none focus:ring-1 focus:ring-cyan-300 focus:border-transparent"
                     >
                       {directProviderChoices.map((choice) => (
                         <option key={choice.id} value={choice.id} className="bg-slate-900 text-white">
                           {choice.label}{choice.isDefault ? ' · ברירת מחדל' : ''}
                         </option>
                       ))}
                     </select>
                   </label>

                   <label className="flex flex-col gap-2 text-right">
                     <span className="text-white/80 text-xs">מודל</span>
                     <select
                       value={resolvedDirectProviderModel}
                       onChange={(event) => setDirectProviderModel(event.target.value)}
                       disabled={!directProviderModelChoices.length}
                       className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white text-sm outline-none focus:ring-1 focus:ring-cyan-300 focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed"
                     >
                       {directProviderModelChoices.length ? directProviderModelChoices.map((modelId) => (
                         <option key={modelId} value={modelId} className="bg-slate-900 text-white">
                           {modelId}
                         </option>
                       )) : (
                         <option value="" className="bg-slate-900 text-white">המודל נקבע בהגדרות הספק</option>
                       )}
                     </select>
                   </label>
                 </div>

                 <div className="mt-3 text-[11px] text-white/70">
                   הבורר הזה שולט במסלול הישיר של דף הבית. כשהבחירה למעלה היא "ללא סביבת עבודה" הוא יופעל בפועל; כשנבחר workspace, המנועים נקבעים לפי צוות הסוכנים של אותה סביבה.
                 </div>
               </div>

               <div className="bg-white/6 border border-white/15 rounded-2xl p-4 mb-4">
                 <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
                   <div className="text-white font-semibold text-sm">🔁 הגדרות זרימת עבודה מהירה</div>
                   {instructionFileName ? (
                     <span className="text-[11px] text-fuchsia-100 bg-fuchsia-500/20 border border-fuchsia-200/30 px-3 py-1 rounded-full">קובץ הנחיות: {instructionFileName}</span>
                   ) : null}
                 </div>
                 <select
                   value={quickWorkflowMode}
                   onChange={handleWorkflowModeChange}
                   disabled={workspaceBypassActive}
                   className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white text-sm outline-none focus:ring-1 focus:ring-cyan-300 focus:border-transparent"
                 >
                   <option value="__keep-current__" className="bg-slate-900 text-white" disabled>השאר מצב קיים: {WORKFLOW_LABELS[actualWorkflowMode] || actualWorkflowMode}</option>
                   <option value="circular-team" className="bg-slate-900 text-white">סביבה מעגלית</option>
                   <option value="custom-order" className="bg-slate-900 text-white">סדר ידני</option>
                 </select>
                 {quickWorkflowMode === 'circular-team' ? (
                   <div className="mt-3 border border-cyan-200/20 bg-cyan-400/10 rounded-xl p-3">
                     <label className="flex items-center gap-2 text-white text-xs font-semibold mb-3">
                       <input
                         type="checkbox"
                         checked={circularWorkflowEnabled}
                         onChange={handleCircularWorkflowToggle}
                         disabled={workspaceBypassActive}
                         className="checkbox checkbox-xs border-cyan-200 rounded bg-white/20"
                       />
                       אפשר חזרה לסוכן קודם
                     </label>
                     <div className="flex items-center justify-between gap-3">
                       <span className="text-white/75 text-xs">מקסימום סבבים</span>
                       <input
                         type="number"
                         min="1"
                         max="4"
                         value={circularMaxRounds}
                         onChange={handleCircularMaxRoundsChange}
                         disabled={workspaceBypassActive}
                         className="w-20 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm text-center outline-none focus:ring-1 focus:ring-cyan-300 focus:border-transparent"
                       />
                     </div>
                   </div>
                 ) : quickWorkflowMode === 'custom-order' ? (
                   <div className="mt-3 text-[11px] text-white/70">במצב סדר ידני, המערכת תרוץ לפי סדר הסוכנים שהגדרת בסביבת העבודה.</div>
                 ) : (
                   <div className="mt-3 text-[11px] text-white/70">מצב העבודה הנוכחי נשמר כפי שהוגדר בסביבת העבודה: {WORKFLOW_LABELS[actualWorkflowMode] || actualWorkflowMode}.</div>
                 )}
               </div>
               
               <div className="grid md:grid-cols-2 gap-4 text-right">
                 <div>
                   <textarea
                     value={instructions}
                     onChange={(e) => {
                       const nextInstructions = e.target.value;
                       setInstructions(nextInstructions);
                       if (!nextInstructions.trim()) setInstructionFileName('');
                       if (typeof saveHomeInstructions === 'function') saveHomeInstructions(nextInstructions);
                     }}
                     placeholder="הנחיות מחייבות למסמך הזה... (למשל: מבנה, סגנון, דרישות, היקף)"
                     className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 text-sm outline-none focus:ring-1 focus:ring-pink-400 focus:border-transparent resize-y min-h-[90px] h-full"
                   />
                 </div>
                 <div className="bg-white/5 border border-white/10 rounded-xl p-3 min-h-[90px] max-h-[140px] overflow-y-auto">
                   {materials.length === 0 ? (
                     <div className="text-white/40 text-[11px] text-center mt-4">בחר 'הוסף מסמכי עזר' כדי לבסס את הצ'אט עליהם.</div>
                   ) : (
                     materials.map(item => (
                       <label key={item.id} className="flex items-center justify-between gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg mb-1 cursor-pointer transition-colors">
                         <div className="flex items-center gap-2 overflow-hidden w-[85%]">
                           <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={e => setSelectedIds(prev => e.target.checked ? [...prev, item.id] : prev.filter(id => id !== item.id))} className="checkbox checkbox-xs border-indigo-300 rounded bg-white/20" />
                           <span className="text-white/90 text-xs truncate leading-tight w-full" title={item.title}>{item.title}</span>
                         </div>
                         <span className="text-white/50 text-[9px] whitespace-nowrap border border-white/20 bg-white/5 px-2 py-0.5 rounded">{item.label || 'כללי'}</span>
                       </label>
                     ))
                   )}
                 </div>
               </div>
               
               {currentWorkspaceId === NO_WORKSPACE_OPTION_VALUE ? (
                 <div className="mt-4 p-3 bg-slate-500/20 border border-slate-300/30 rounded-xl text-right">
                   <div className="text-slate-100 text-sm font-semibold mb-1">ללא סביבת עבודה</div>
                   <div className="text-slate-200/85 text-xs">
                     כל הבקשות יישלחו ישירות דרך: {directGenerationSummary}
                   </div>
                   <div className="text-slate-200/60 text-[10px] mt-1">
                     סביבת העבודה האחרונה נשמרת ברקע, ואפשר לחזור אליה מייד דרך הבחירה למעלה.
                   </div>
                 </div>
               ) : loadedWorkspace && (
                 <div className="mt-4 p-3 bg-amber-500/20 border border-amber-400/30 rounded-xl text-right">
                   <div className="text-amber-100 text-sm font-semibold mb-1">סביבת העבודה שנטענה</div>
                   <div className="text-amber-200/80 text-xs">
                     {loadedWorkspace?.workflowMode === 'custom-order' || loadedWorkspace?.autopilotEnabled === false
                       ? ((loadedWorkspace?.agents || []).map((agent) => String(agent?.name || '').trim()).filter(Boolean).join(' ← ') || 'אין סדר מוגדר')
                       : (WORKFLOW_LABELS[loadedWorkspace?.workflowMode] || loadedWorkspace?.workflowMode || 'manager-auto')}
                   </div>
                   <div className="text-amber-200/60 text-[10px] mt-1">
                     מנועים: {loadedWorkspace?.providerSummary}
                   </div>
                   <div className="text-amber-200/60 text-[10px] mt-1">
                     {(loadedWorkspace?.agents || []).map((agent) => String(agent?.name || '').trim()).filter(Boolean).join(' • ')}
                   </div>
                 </div>
               )}
            </div>
            
          </div>
        </div>

        {/* Templates Grid */}
        <div className={`transition-all duration-1000 delay-300 ${mounted ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-10'}`}>
          <h2 className="text-3xl font-bold text-white mb-8 text-center" style={{ textShadow: '1px 1px 10px rgba(0,0,0,0.5)' }}>
            תבניות חכמות להתחלה מהירה
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
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
                <div id="start-screen-extra-templates" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
                  {renderTemplateCards(extraTemplateCards, primaryTemplateCards.length)}
                </div>
              ) : null}
            </>
          ) : (
            <div className="mb-16"></div>
          )}
        </div>

        {/* Quick Access Bar */}
        <div className={`bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 transition-all duration-1000 delay-500 ${mounted ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-10'}`}>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={onOpenDocument}
              className="flex items-center gap-2 px-6 py-3 bg-white/20 hover:bg-white/30 border border-white/30 rounded-xl text-white transition-all duration-300 transform hover:scale-105"
            >
              📁 פתח מסמך קיים
            </button>
            
            {hasDraft && (
              <button
                onClick={onOpenLastDraft}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500/80 to-emerald-600/80 hover:from-green-600/80 hover:to-emerald-700/80 border border-white/30 rounded-xl text-white transition-all duration-300 transform hover:scale-105 shadow-lg"
              >
                ⚡ המשך טיוטה אחרונה
              </button>
            )}
            
            <button
              onClick={() => onOpenSettings('onboarding')}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500/80 to-orange-600/80 hover:from-amber-600/80 hover:to-orange-700/80 border border-white/30 rounded-xl text-white transition-all duration-300 transform hover:scale-105 shadow-lg"
            >
              {onboardingDone ? '🧭 עדכון פרופיל היכרות' : '🎯 התחלת היכרות חכמה'}
            </button>

            <button
              onClick={() => onOpenSettings('guide')}
              className="flex items-center gap-2 px-6 py-3 bg-white/20 hover:bg-white/30 border border-white/30 rounded-xl text-white transition-all duration-300 transform hover:scale-105"
            >
              ⚙️ הגדרות וסקילים
            </button>
          </div>
        </div>

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
            }}
          />
        )}
      </div>
    </div>
  );
}
