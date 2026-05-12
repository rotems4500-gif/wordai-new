import React, { useEffect, useRef, useState } from "react";
import ProfileOnboarding from './ProfileOnboarding';
import { normalizeDelimitedList, useDelimitedListInput } from './delimitedListInput';
import { COPYLEAKS_TEXT_MAX_CHARS, COPYLEAKS_TEXT_MIN_CHARS } from './services/copyleaksService';
import {
  DEFAULT_WORKSPACES_LIBRARY,
  DEFAULT_ASSISTANT_BEHAVIOR,
  DEFAULT_PERSONAL_STYLE,
  DEFAULT_PROVIDER_CONFIG,
  DEFAULT_WORKSPACE_AUTOMATION,
  buildExternalStyleAnalysisPrompt,
  getExternalAnalysisProviderHint,
  getProviderConfig,
  getProviderModelChoices,
  isProviderModelChoiceCompatible,
  getExternalAnalysisAvailability,
  hasMeaningfulPersonalProfileData,
  mergeExternalStyleExtractionIntoProfile,
  saveProviderConfig,
  getShortcutsConfig,
  saveShortcutsConfig,
  getRoleAgents,
  saveRoleAgents,
  getAssistantBehavior,
  saveAssistantBehavior,
  getWordPreferences,
  saveWordPreferences,
  getPersonalStyleProfile,
  normalizePersonalStyleProfile,
  savePersonalStyleProfile,
  getSharedAgentInstructions,
  saveSharedAgentInstructions,
  getWorkspaceAutomation,
  saveWorkspaceAutomation,
  getWorkspaceAgentPresets,
  buildWorkspaceAgentPreset,
  getWorkspacesLibrary,
  createNewWorkspace,
  switchToWorkspace,
  deleteWorkspace,
  updateWorkspaceById,
  getAgentDebugLogs,
  clearAgentDebugLogs,
  getLatestAgentRunSummary,
  getSkillCatalog,
  getSkillsConfig,
  saveSkillsConfig,
  getAppMemory,
  clearAppMemory,
  clearSidebarChatHistory,
  buildPortablePrompt,
  applyManualProfileScalarFieldUpdate,
  mergeSyllabusImportPatchIntoProfile,
  processExternalStyleAnalysis,
  processSyllabusProfileImport,
  testProviderConnection,
} from "./services/aiService";
import { loadProjectMaterials, saveHelperMaterial, syncLearnedStyleFromWorkspace, MATERIAL_UPLOAD_PRESETS, getMaterialUploadMeta, readInstructionFile, getHelperMaterialAcceptList } from "./services/workspaceLearningService";
import { getMaterialExtractionStatusInfo } from "./services/workspaceLearningService";

// ─── ספקים נפוצים לדוגמה ───
const POPULAR_CUSTOM = [
  { name: 'Ollama (מקומי - חינם)', url: 'http://localhost:11434/v1',              note: 'הורד מ-ollama.com — ✅ לא דורש מפתח',    model: 'llama3.2',                             keyNote: 'ריק (לא נדרש)' },
  { name: 'LM Studio (מקומי)',      url: 'http://localhost:1234/v1',               note: 'הורד מ-lmstudio.ai — ✅ לא דורש מפתח',  model: 'loaded-model',                         keyNote: 'ריק (לא נדרש)' },
];

const PROVIDER_SETUP_CATALOG = [
  {
    id: 'gemini',
    label: 'Gemini',
    setupMode: 'builtin',
    badge: 'מהיר להתחלה',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyCta: 'פתח את Google AI Studio',
    keyHint: 'מפתח חינמי, לרוב מתחיל ב-AIza.',
    recommendation: [
      'מתאים לכתיבה כללית, אקדמית וטיוטות שרוצים להניע מהר.',
      'בחירה טובה להתחלה כשצריך איזון בין מחיר, מהירות ואיכות.',
    ],
    setupSteps: [
      'פתח את Google AI Studio וצור API key חדש.',
      'הדבק את המפתח כאן ובחר מודל כמו gemini-2.5-flash.',
      'לחץ על "בדוק חיבור" לפני שממשיכים.',
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    setupMode: 'builtin',
    badge: 'גמיש',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyCta: 'פתח את OpenAI API Keys',
    keyHint: 'המפתח מתחיל בדרך כלל ב-sk-.',
    recommendation: [
      'מתאים למסמכים מורכבים, שכתוב איכותי ועבודה כללית ברמה גבוהה.',
      'טוב כשצריך מודלים יציבים עם הרבה כלים והרחבות סביבם.',
    ],
    setupSteps: [
      'היכנס ל-platform.openai.com/api-keys.',
      'צור Secret key חדש ושמור אותו במקום בטוח.',
      'הדבק אותו כאן ובחר מודל כמו gpt-4o או gpt-4.1.',
    ],
  },
  {
    id: 'claude',
    label: 'Claude',
    setupMode: 'builtin',
    badge: 'ליטוש',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyCta: 'פתח את Anthropic Keys',
    keyHint: 'המפתח מתחיל בדרך כלל ב-sk-ant-.',
    recommendation: [
      'מתאים לעבודה זהירה, ניסוח נקי, וקריאה עמוקה של טקסטים ארוכים.',
      'בחירה טובה לליטוש מסמכים, סיכום וכתיבה עם טון מאוזן.',
    ],
    setupSteps: [
      'פתח את console.anthropic.com/settings/keys.',
      'צור API key חדש בחשבון Anthropic.',
      'הדבק אותו כאן ובחר מודל Claude מתאים.',
    ],
  },
  {
    id: 'groq',
    label: 'Groq',
    setupMode: 'builtin',
    badge: 'מהיר וזול',
    keyUrl: 'https://console.groq.com/keys',
    keyCta: 'פתח את Groq Console',
    keyHint: 'המפתח מתחיל בדרך כלל ב-gsk_ ואפשר להתחיל בלי כרטיס אשראי.',
    recommendation: [
      'מתאים לטיוטות מהירות, רעיונות, ניסויים ותשובות בזמני תגובה קצרים.',
      'טוב כשחשוב להרגיש זריזות ולאו דווקא להשתמש במודל היקר ביותר.',
    ],
    setupSteps: [
      'פתח את console.groq.com/keys והתחבר.',
      'צור API key חדש והעתק אותו.',
      'הדבק כאן ובדוק חיבור עם מודל Groq מהרשימה.',
    ],
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    setupMode: 'builtin',
    badge: 'מחקר',
    keyUrl: 'https://www.perplexity.ai/settings/api',
    keyCta: 'פתח את Perplexity API',
    keyHint: 'המפתח מתחיל בדרך כלל ב-pplx-.',
    recommendation: [
      'מתאים למחקר, fact-checking וחיפוש מבוסס מקורות בזמן אמת.',
      'בחירה טובה כשצריך אינטרנט חי וניתוח מהיר של מקורות.',
    ],
    setupSteps: [
      'פתח את perplexity.ai/settings/api.',
      'צור מפתח API והעתק אותו.',
      'הדבק כאן ובחר מודל Sonar מתאים.',
    ],
  },
  {
    id: 'ollama',
    label: 'Ollama',
    setupMode: 'builtin',
    badge: 'מקומי',
    keyUrl: 'https://ollama.com/download',
    keyCta: 'פתח את Ollama Download',
    keyHint: 'לא צריך מפתח. רק התקנה מקומית ומודל טעון.',
    recommendation: [
      'מתאים למי שרוצה פרטיות מלאה ועבודה מקומית בלי לשלוח טקסט החוצה.',
      'טוב כשאפשר לוותר על שירות ענן לטובת שליטה מלאה במחשב המקומי.',
    ],
    setupSteps: [
      'התקן את Ollama מאתר ollama.com.',
      'הרץ מודל כמו llama3.2 או qwen2.5 במחשב שלך.',
      'פתח את כרטיס Ollama, ודא שהכתובת המקומית והמודל נכונים, ואז בדוק חיבור.',
    ],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    setupMode: 'custom',
    badge: 'חסכוני',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    keyCta: 'פתח את DeepSeek Platform',
    keyHint: 'המפתח מתחיל בדרך כלל ב-sk-.',
    recommendation: [
      'מתאים לטקסטים ארוכים, שכתוב, וכתיבה בנפח גבוה עם עלות נמוכה יחסית.',
      'טוב כשחשוב לחסוך בעלויות ועדיין לקבל פלט חזק בטקסט.',
    ],
    setupSteps: [
      'פתח את platform.deepseek.com/api_keys וצור מפתח.',
      'הדבק את המפתח בחלק של Custom או בכרטיס המוכן.',
      'השתמש ב-base URL ובמודל deepseek-chat שמולאו עבורך.',
    ],
    customConfig: {
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    },
  },
  {
    id: 'mistral',
    label: 'Mistral',
    setupMode: 'custom',
    badge: 'אירופי',
    keyUrl: 'https://console.mistral.ai/api-keys',
    keyCta: 'פתח את Mistral Console',
    keyHint: 'מפתח אלפאנומרי מ-console.mistral.ai.',
    recommendation: [
      'מתאים לכתיבה עסקית, סיכומים ושימושים שדורשים מודלים אירופיים.',
      'בחירה טובה כשצריך חלופה איכותית ל-OpenAI-compatible דרך Custom.',
    ],
    setupSteps: [
      'היכנס ל-console.mistral.ai/api-keys.',
      'צור מפתח חדש והעתק אותו.',
      'מלא אוטומטית את Custom עם base URL ומודל Mistral.',
    ],
    customConfig: {
      name: 'Mistral AI',
      baseUrl: 'https://api.mistral.ai/v1',
      model: 'mistral-large-latest',
    },
  },
  {
    id: 'together',
    label: 'Together.ai',
    setupMode: 'custom',
    badge: 'מודלים פתוחים',
    keyUrl: 'https://api.together.ai/settings/api-keys',
    keyCta: 'פתח את Together API',
    keyHint: 'המפתח נוצר ב-Together.ai ומשמש ספק OpenAI-compatible.',
    recommendation: [
      'מתאים למודלים פתוחים, ניסויים ועלות גמישה יחסית.',
      'בחירה טובה כשצריך מגוון מודלים בלי להינעל לספק יחיד.',
    ],
    setupSteps: [
      'פתח את Together API וצור key חדש.',
      'הדבק את המפתח ב-Custom עם ה-base URL של Together.',
      'התחל עם מודל Llama או החלף לשם מודל אחר מהרשימה שלהם.',
    ],
    customConfig: {
      name: 'Together.ai',
      baseUrl: 'https://api.together.xyz/v1',
      model: 'meta-llama/Llama-3-70b-chat-hf',
    },
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    setupMode: 'custom',
    badge: 'רב-מודלי',
    keyUrl: 'https://openrouter.ai/keys',
    keyCta: 'פתח את OpenRouter Keys',
    keyHint: 'המפתח מתחיל בדרך כלל ב-sk-or-v1-.',
    recommendation: [
      'מתאים למי שרוצה גישה למבחר גדול של מודלים דרך endpoint אחד.',
      'טוב להשוואות, ניסויים ובחירת מודל לפי משימה בלי להחליף ספק כל פעם.',
    ],
    setupSteps: [
      'פתח את openrouter.ai/keys וצור key.',
      'הדבק את המפתח כאן כדי לעבוד דרך Custom/OpenAI-compatible.',
      'השתמש במודל openrouter/auto או החלף לשם מודל ידני.',
    ],
    customConfig: {
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'openrouter/auto',
    },
  },
  {
    id: 'custom',
    label: 'Custom API',
    setupMode: 'custom',
    badge: 'OpenAI-compatible',
    keyUrl: 'https://platform.openai.com/docs/api-reference/introduction',
    keyCta: 'פתח דוגמת OpenAI-compatible',
    keyHint: 'אם הספק לא מזוהה, צריך Base URL, API key ושם מודל. פטור ממפתח נתמך רק ל-loopback מקומי מאושר של Ollama או LM Studio על 11434/1234.',
    recommendation: [
      'מתאים לכל ספק שתואם את פרוטוקול OpenAI ולא קיבל כרטיס מובנה.',
      'טוב כשיש לך Base URL, key ומודל אבל הספק עדיין לא מופיע ברשימה.',
    ],
    setupSteps: [
      'מצא בתיעוד של הספק את Base URL, המפתח ושם המודל.',
      'מלא את שדות Custom ושמור על כתובת שמסתיימת בדרך כלל ב-/v1.',
      'בדוק חיבור עם המודל שבחרת לפני שממשיכים.',
    ],
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    setupMode: 'custom',
    badge: 'Grok',
    keyUrl: 'https://console.x.ai',
    keyCta: 'פתח את xAI Console',
    keyHint: 'המפתח מנוהל בחשבון xAI/Grok API.',
    recommendation: [
      'מתאים לשיחות יצירתיות, רעיונות מהירים ועבודה עם משפחת Grok.',
      'טוב כשרוצים חלופה נוספת דרך endpoint תואם OpenAI.',
    ],
    setupSteps: [
      'פתח את console.x.ai וצור API key.',
      'מלא את Custom עם כתובת xAI והדבק את המפתח.',
      'התחל מ-grok-3-mini-beta או החלף למודל אחר בחשבון.',
    ],
    customConfig: {
      name: 'xAI (Grok)',
      baseUrl: 'https://api.x.ai/v1',
      model: 'grok-3-mini-beta',
    },
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    setupMode: 'custom',
    badge: 'מקומי',
    keyUrl: 'https://lmstudio.ai/download',
    keyCta: 'פתח את LM Studio',
    keyHint: 'לא צריך מפתח. רק להפעיל Local Server מתוך LM Studio.',
    recommendation: [
      'מתאים להרצה מקומית של מודלים בלי לשלוח טקסט לענן.',
      'בחירה טובה כשצריך סביבת פיתוח מקומית וגמישות בבחירת מודל.',
    ],
    setupSteps: [
      'התקן את LM Studio והורד מודל מתאים.',
      'הפעל Local Server מתוך האפליקציה.',
      'מלא אוטומטית את Custom עם הכתובת המקומית ובדוק חיבור.',
    ],
    customConfig: {
      name: 'LM Studio (מקומי)',
      baseUrl: 'http://localhost:1234/v1',
      model: 'loaded-model',
    },
  },
];

const PROVIDER_SETUP_INDEX = PROVIDER_SETUP_CATALOG.reduce((acc, provider) => {
  acc[provider.id] = provider;
  return acc;
}, {});

const isLocalOpenAICompatibleBaseUrl = (baseUrl = '') => {
  try {
    const parsed = new URL(String(baseUrl || '').trim());
    const hostname = String(parsed.hostname || '').trim().toLowerCase();
    const port = String(parsed.port || '').trim() || (parsed.protocol === 'https:' ? '443' : '80');
    if (!hostname) return false;
    const isLoopbackHost = hostname === 'localhost'
      || hostname === '::1'
      || /^127(?:\.\d+){3}$/.test(hostname);
    if (!isLoopbackHost) return false;
    return port === '11434' || port === '1234';
  } catch {
    return false;
  }
};
const normalizeProviderIdentity = (value = '') => String(value || '').trim().toLowerCase().replace(/\/+$/, '');
const matchesMappedCustomPreset = (cfg = {}, preset = {}) => {
  if (!preset) return false;
  const customBaseUrl = normalizeProviderIdentity(cfg?.custom?.baseUrl || '');
  const presetBaseUrl = normalizeProviderIdentity(preset.baseUrl || '');
  if (customBaseUrl && presetBaseUrl) return customBaseUrl === presetBaseUrl;

  const customName = normalizeProviderIdentity(cfg?.custom?.name || '');
  const presetName = normalizeProviderIdentity(preset.name || '');
  return Boolean(customName) && Boolean(presetName) && customName === presetName;
};

const deriveMappedCustomProviderId = (config = {}) => {
  const match = PROVIDER_SETUP_CATALOG.find((provider) => {
    if (!provider.customConfig) return false;
    return matchesMappedCustomPreset(config, provider.customConfig);
  });

  return match?.id || '';
};

const deriveProviderGuideId = (config = {}) => {
  if (config?.active && config.active !== 'custom' && PROVIDER_SETUP_INDEX[config.active]) return config.active;

  const mappedCustomProviderId = deriveMappedCustomProviderId(config);
  if (mappedCustomProviderId) return mappedCustomProviderId;

  if (config?.active === 'custom') return 'custom';
  return 'gemini';
};

const deriveExternalAnalysisProviderId = (config = {}) => {
  if (config?.active === 'custom') {
    const mappedCustomProviderId = deriveMappedCustomProviderId(config);
    return mappedCustomProviderId || 'custom';
  }
  if (config?.active && PROVIDER_SETUP_INDEX[config.active]) return config.active;
  return 'gemini';
};

const EXTERNAL_ANALYSIS_RUNTIME_CUSTOM_PRESETS = {
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  mistral: { name: 'Mistral AI', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-large-latest' },
  together: { name: 'Together.ai', baseUrl: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3-70b-chat-hf' },
  openrouter: { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/auto' },
  xai: { name: 'xAI (Grok)', baseUrl: 'https://api.x.ai/v1', model: 'grok-3-mini-beta' },
  lmstudio: { name: 'LM Studio (מקומי)', baseUrl: 'http://localhost:1234/v1', model: 'loaded-model' },
};

const isExternalAnalysisRuntimeModelCompatible = (providerId = '', modelValue = '') => {
  const cleanModel = String(modelValue || '').trim().toLowerCase();
  if (!cleanModel) return false;
  switch (providerId) {
    case 'deepseek':
      return cleanModel.startsWith('deepseek');
    case 'mistral':
      return cleanModel.includes('mistral');
    case 'together':
      return /(llama|qwen|mixtral|mistral|gemma|deepseek|dbrx|wizardlm|nous)/.test(cleanModel);
    case 'openrouter':
    case 'lmstudio':
      return true;
    case 'xai':
      return cleanModel.startsWith('grok');
    default:
      return false;
  }
};

const normalizeExternalAnalysisRuntimeConfig = (providerId = '', cfg = {}) => {
  const preset = EXTERNAL_ANALYSIS_RUNTIME_CUSTOM_PRESETS[providerId];
  if (!preset) return cfg;
  const currentModel = String(cfg?.custom?.model || '').trim();
  const shouldReuseExistingPresetConfig = matchesMappedCustomPreset(cfg, preset);
  return {
    ...cfg,
    custom: {
      ...(cfg?.custom || {}),
      name: preset.name,
      baseUrl: preset.baseUrl,
      model: shouldReuseExistingPresetConfig && isExternalAnalysisRuntimeModelCompatible(providerId, currentModel) ? currentModel : preset.model,
      key: shouldReuseExistingPresetConfig && providerId !== 'lmstudio' ? String(cfg?.custom?.key || '') : '',
    },
  };
};

const DEFAULT_FONT_OPTIONS = ['Alef', 'Heebo', 'Assistant', 'Frank Ruhl Libre', 'Miriam Libre', 'Arial', 'Calibri', 'David', 'Georgia', 'Segoe UI', 'Tahoma', 'Times New Roman'];

const DEFAULT_FONT_STACKS = {
  Alef: "'Alef', sans-serif",
  Heebo: "'Heebo', 'Segoe UI', sans-serif",
  Assistant: "'Assistant', 'Segoe UI', sans-serif",
  'Frank Ruhl Libre': "'Frank Ruhl Libre', 'Times New Roman', serif",
  'Miriam Libre': "'Miriam Libre', 'Times New Roman', serif",
  Arial: 'Arial, sans-serif',
  Calibri: "Calibri, 'Segoe UI', sans-serif",
  David: "'David', 'Times New Roman', serif",
  Georgia: "Georgia, 'Times New Roman', serif",
  'Segoe UI': "'Segoe UI', sans-serif",
  Tahoma: "Tahoma, 'Segoe UI', sans-serif",
  'Times New Roman': "'Times New Roman', serif",
};

const getDefaultFontStack = (fontLabel = 'Alef') => DEFAULT_FONT_STACKS[fontLabel] || fontLabel || 'Alef';

const ACTION_VISIBILITY_OPTIONS = [
  { id: 'fix', label: 'תיקון מהיר', hint: 'כתיב, דקדוק וליטוש' },
  { id: 'summary', label: 'סיכום', hint: 'תקציר קצר של הקטע' },
  { id: 'academic', label: 'אקדמי', hint: 'ניסוח רשמי ומובנה' },
  { id: 'humanize', label: 'האנשה', hint: 'ריכוך ושפה טבעית יותר' },
  { id: 'organize', label: 'ארגון', hint: 'סידור מבנה ורצף' },
  { id: 'textToTable', label: 'המרה לטבלה', hint: 'כשהקטע מתאים להצגה טבלאית' },
  { id: 'expand', label: 'הרחבה', hint: 'הוספת עומק ודוגמאות' },
  { id: 'bullets', label: 'רשימת נקודות', hint: 'הפיכה לרשימה ברורה' },
  { id: 'shorter', label: 'קיצור', hint: 'צמצום בלי לאבד משמעות' },
  { id: 'continue', label: 'המשך כתיבה', hint: 'יצירת המשך חדש' },
  { id: 'intro', label: 'מבוא', hint: 'פתיחה למסמך' },
  { id: 'conclusion', label: 'מסקנה', hint: 'סיום חד וברור' },
  { id: 'sources', label: 'מקורות', hint: 'הצעת כיווני חיפוש' },
  { id: 'translate', label: 'תרגום לאנגלית', hint: 'המרת הקטע לאנגלית' },
];

const normalizeSettingsSearchValue = (value = '') => String(value || '')
  .toLowerCase()
  .replace(/[_/-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const mergeSettingsSearchTerms = (values = []) => [...new Set((Array.isArray(values) ? values : [values])
  .flatMap((item) => (Array.isArray(item) ? item : [item]))
  .map((item) => normalizeSettingsSearchValue(item))
  .filter(Boolean))];

const SETTINGS_TAB_SEARCH_KEYWORDS = {
  guide: ['guide', 'help', 'manual', 'docs', 'מדריך', 'עזרה'],
  assistant: ['assistant', 'helper', 'behavior', 'tone', 'assistant behavior', 'עוזר'],
  updates: ['updates', 'updater', 'version', 'release', 'עדכונים', 'גרסה'],
  ai: ['ai', 'api', 'provider', 'model', 'key', 'engine', 'gemini', 'openai', 'claude', 'copyleaks', 'detector', 'detection', 'ai detector', 'ספק', 'מודל', 'מפתח', 'זיהוי ai', 'בדיקת ai'],
  prompt: ['prompt', 'instructions', 'system', 'template', 'הנחיות'],
  skills: ['skills', 'skill', 'capabilities', 'סקילים'],
  agents: ['agents', 'agent', 'timeout', 'workflow', 'autopilot', 'workspace', 'automation', 'manager', 'retry', 'סוכנים', 'אוטומציה', 'סביבת עבודה'],
  developer: ['developer', 'advanced', 'timeout', 'override', 'logs', 'model', 'provider', 'מתקדם', 'לוגים', 'timeout ms'],
  onboarding: ['onboarding', 'profile', 'style', 'learning', 'materials', 'submission', 'פרופיל', 'הגשה'],
  writing: ['writing', 'document', 'word', 'defaults', 'כתיבה'],
  appearance: ['appearance', 'theme', 'font', 'colors', 'ui', 'מראה'],
  debug: ['debug', 'logs', 'log', 'console', 'לוגים', 'ניפוי'],
  personal: ['personal', 'profile', 'style', 'preferences', 'tone', 'סגנון אישי', 'פרופיל אישי'],
};

const SETTINGS_TAB_GROUPS = [
  {
    title: 'התחלה ועזרה',
    tabs: [['guide', '📘 מדריך'], ['assistant', '✨ עוזר'], ['updates', '⬆️ עדכונים']],
  },
  {
    title: 'AI וצוות עבודה',
    tabs: [['ai', '🤖 מנועי AI'], ['prompt', '📌 Prompt'], ['skills', '🧠 סקילים'], ['agents', '🧩 סוכנים']],
  },
  {
    title: 'כתיבה והתאמה אישית',
    tabs: [['onboarding', '👤 פרופיל והגשה'], ['writing', '✍️ כתיבה'], ['appearance', '🎨 מראה']],
  },
  {
    title: 'תחזוקה ולוגים',
    tabs: [['developer', '🛠️ Developer'], ['debug', '🪵 לוגים']],
  },
];

const SETTINGS_TAB_SEARCH_INDEX = [
  ...SETTINGS_TAB_GROUPS.flatMap((group) => group.tabs.map(([id, label]) => ({
    id,
    label,
    groupTitle: group.title,
    searchText: mergeSettingsSearchTerms([id, label, group.title, SETTINGS_TAB_SEARCH_KEYWORDS[id] || []]).join(' '),
  }))),
  {
    id: 'personal',
    label: '🧬 סגנון אישי',
    groupTitle: 'כתיבה והתאמה אישית',
    searchText: mergeSettingsSearchTerms([
      'personal',
      'סגנון אישי',
      'פרופיל אישי',
      SETTINGS_TAB_SEARCH_KEYWORDS.personal || [],
    ]).join(' '),
  },
];

const mergeUniqueStrings = (values = []) => [...new Set((Array.isArray(values) ? values : [values])
  .flatMap((item) => (Array.isArray(item) ? item : [item]))
  .map((item) => String(item || '').trim())
  .filter(Boolean))];

const getLecturerNamesFromProfile = (profile = {}) => {
  const lecturerNames = [...new Set(normalizeDelimitedList(profile.lecturerNames))];
  if (lecturerNames.length) return lecturerNames;
  const fallback = String(profile.lecturerName || '').trim();
  return fallback ? [fallback] : [];
};

const applyProfileListFieldUpdate = (profile = {}, field = '', value = []) => {
  const normalizedValue = normalizeDelimitedList(value);
  if (field !== 'lecturerNames') return { ...profile, [field]: normalizedValue };

  return {
    ...profile,
    lecturerNames: normalizedValue,
    lecturerName: normalizedValue[0] || '',
  };
};

const mergePersonalStyleForSave = (draft = {}) => {
  const live = getPersonalStyleProfile();
  return finalizePersonalProfile(normalizePersonalStyleProfile({
    ...live,
    ...draft,
    learnedVocabularyCounts: live.learnedVocabularyCounts || {},
    learnedPhraseCounts: live.learnedPhraseCounts || {},
    learnedVocabulary: live.learnedVocabulary || [],
    learnedPhrases: live.learnedPhrases || [],
    learnedNotes: live.learnedNotes || [],
    learnedSentencePatterns: live.learnedSentencePatterns || [],
    preferredConnectors: live.preferredConnectors || [],
    preferredSentenceOpeners: live.preferredSentenceOpeners || [],
    toneDescriptors: live.toneDescriptors || [],
    styleFingerprint: live.styleFingerprint || {},
    scannedSourceIds: live.scannedSourceIds || [],
    scanStats: live.scanStats || {},
    autoLearnedFromEditorAt: live.autoLearnedFromEditorAt || '',
    lastAutoLearnedSignature: live.lastAutoLearnedSignature || '',
    autoLearnedVocabularyCounts: live.autoLearnedVocabularyCounts || {},
    autoLearnedPhraseCounts: live.autoLearnedPhraseCounts || {},
  }));
};

const buildComparablePersonalStyleProfile = (profile = {}) => {
  const normalizedProfile = mergePersonalStyleForSave(profile);
  const { last_updated: _lastUpdated, ...comparableProfile } = normalizedProfile || {};
  return comparableProfile;
};

const STYLE_TRAINING_QUESTIONS = [
  {
    id: 'tone',
    title: 'איזה ניסוח מרגיש יותר אתה?',
    options: [
      { id: 'formal', label: 'אפשרות א', text: 'בהתאם לממצאים, ניתן להסיק כי יש חשיבות להמשך בחינה מדויקת של הנושא.', insight: 'מעדיף ניסוח רשמי, נקי ומדויק.', avoid: 'סלנג או קלילות מוגזמת' },
      { id: 'natural', label: 'אפשרות ב', text: 'מהממצאים די ברור שכדאי להמשיך לבדוק את הנושא בצורה מסודרת.', insight: 'מעדיף שפה טבעית, ישירה ונגישה.', avoid: 'ניסוח כבד ומרוחק מדי' },
    ],
  },
  {
    id: 'depth',
    title: 'איזו רמת פירוט מתאימה יותר?',
    options: [
      { id: 'concise', label: 'אפשרות א', text: 'לסיכום, ההצעה תחסוך זמן ותשפר את רצף העבודה.', insight: 'מעדיף ניסוח תמציתי ומהיר לקריאה.', avoid: 'הרחבות ארוכות שלא מוסיפות ערך' },
      { id: 'rich', label: 'אפשרות ב', text: 'לסיכום, ההצעה צפויה לחסוך זמן, לשפר את רצף העבודה וליצור חוויית שימוש מדויקת וברורה יותר לאורך התהליך.', insight: 'מעדיף עומק והשלמת רעיונות לפני סיום.', avoid: 'משפטים קצרים מדי בלי הקשר' },
    ],
  },
  {
    id: 'structure',
    title: 'איזה מבנה קריאה נוח יותר עבורך?',
    options: [
      { id: 'structured', label: 'אפשרות א', text: 'המסמך יכלול: מטרה, שלבים, סיכונים והמלצה סופית.', insight: 'מעדיף מבנה מאורגן עם נקודות וכותרות ברורות.', avoid: 'פסקאות זורמות בלי היררכיה' },
      { id: 'flowing', label: 'אפשרות ב', text: 'המסמך ייפתח בהסבר קצר, ימשיך לניתוח מרכזי ויסתיים בהמלצה טבעית ורציפה.', insight: 'מעדיף זרימה טבעית ופחות רשימות נוקשות.', avoid: 'עודף כותרות ונקודות טכניות' },
    ],
  },
  {
    id: 'assertiveness',
    title: 'איזה סיום נשמע לך נכון יותר?',
    options: [
      { id: 'soft', label: 'אפשרות א', text: 'נראה שכדאי לשקול את ההצעה הזו בזהירות ובהתאם לצורך.', insight: 'מעדיף טון זהיר, מאוזן ולא תוקפני.', avoid: 'קביעות חדות מדי' },
      { id: 'direct', label: 'אפשרות ב', text: 'ההצעה הזו היא הכיוון הנכון וצריך לקדם אותה כבר עכשיו.', insight: 'מעדיף טון החלטי, חד ובטוח.', avoid: 'זהירות יתר וניסוח מהוסס' },
    ],
  },
  {
    id: 'linguistic_register',
    title: 'איזו רמה לשונית נשמעת לך נכון יותר?',
    options: [
      { id: 'academic', label: 'אקדמי', text: 'ניתוח הממצאים מעיד על מגמה ברורה הדורשת התייחסות מעמיקה בספרות המקצועית.', insight: 'מעדיף שפה אקדמית, מינוח מקצועי ומדויק.', avoid: 'שפה יומיומית ומינוח לא מקצועי' },
      { id: 'standard', label: 'תקנית', text: 'הממצאים מראים מגמה ברורה שחשוב להתייחס אליה בצורה מסודרת.', insight: 'מעדיף שפה תקנית, תקינה ומאוזנת.', avoid: 'ז\'רגון אקדמי כבד מדי' },
      { id: 'conversational', label: 'שיחתית', text: 'רואים בבירור מגמה מעניינת — שווה לחשוב על זה ולדון בה.', insight: 'מעדיף שפה שיחתית, נגישה וקרובה לקורא.', avoid: 'ניסוח רשמי מדי שמרחיק את הקורא' },
    ],
  },
];

const buildLearningGameProfilePatch = (answers = {}) => {
  const selectedOptions = STYLE_TRAINING_QUESTIONS
    .map((question) => question.options.find((option) => option.id === answers[question.id]))
    .filter(Boolean);

  const insights = mergeUniqueStrings(selectedOptions.map((option) => option.insight)).slice(0, 8);
  const preferredTrainingExamples = selectedOptions.map((option) => option.text).slice(0, 4);
  const dislikedStylePatterns = mergeUniqueStrings(selectedOptions.map((option) => option.avoid)).slice(0, 8);
  const linguisticInsight = answers['linguistic_register']
    ? (STYLE_TRAINING_QUESTIONS.find(q => q.id === 'linguistic_register')?.options.find(o => o.id === answers['linguistic_register'])?.insight || '')
    : '';

  return {
    learningGameAnswers: answers,
   learningGamesCompletedAt: Object.keys(answers).filter(k => answers[k]).length >= STYLE_TRAINING_QUESTIONS.length ? new Date().toISOString() : '',
    learningGameInsights: insights,
   styleTrainingSummary: [...insights, ...(linguisticInsight ? [linguisticInsight] : [])].join(' '),
   linguisticRegisterPreference: answers['linguistic_register'] || '',
    preferredTrainingExamples,
    dislikedStylePatterns,
  };
};

const linkifyText = (text = '') => {
  const value = String(text || '');
  const parts = value.split(/(https?:\/\/[^\s)]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s)]*)?)/gi);

  return parts.map((part, index) => {
    const trimmed = String(part || '').trim();
    if (!trimmed) return <React.Fragment key={index}>{part}</React.Fragment>;
    const isLink = /^(https?:\/\/|(?:[a-z0-9-]+\.)+[a-z]{2,})/i.test(trimmed);
    if (!isLink) return <React.Fragment key={index}>{part}</React.Fragment>;

    const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return (
      <a key={index} href={href} target="_blank" rel="noreferrer"
        style={{ color: '#2B579A', textDecoration: 'underline', wordBreak: 'break-all' }}>
        {trimmed}
      </a>
    );
  });
};

// ─── שדה קלט עם toggle לסיסמה ───
function FieldRow({ label, type = 'text', placeholder, value, onChange, hint, options = [] }) {
  const [show, setShow] = useState(false);
  const datalistIdRef = useRef(`field-row-options-${Math.random().toString(36).slice(2, 9)}`);
  const normalizedOptions = [...new Set((Array.isArray(options) ? options : [])
    .map((option) => String(option || '').trim())
    .filter(Boolean))];
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 11, color: '#605E5C', display: 'block', marginBottom: 3, fontWeight: 500 }}>{label}</label>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type={type === 'password' && !show ? 'password' : 'text'}
          placeholder={placeholder} value={value || ''}
          onChange={e => onChange(e.target.value)}
          list={normalizedOptions.length ? datalistIdRef.current : undefined}
          style={{ flex: 1, padding: '7px 10px', border: '1px solid #C8C6C4', borderRadius: 4, fontSize: 12, direction: 'ltr', fontFamily: 'monospace', outline: 'none' }} />
        {type === 'password' && (
          <button type="button" onClick={() => setShow(v => !v)} style={{ padding: '0 10px', border: '1px solid #C8C6C4', borderRadius: 4, background: 'white', cursor: 'pointer', fontSize: 12 }}>
            {show ? '🙈' : '👁️'}
          </button>
        )}
      </div>
      {normalizedOptions.length ? (
        <datalist id={datalistIdRef.current}>
          {normalizedOptions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      ) : null}
      {hint && <div style={{ fontSize: 10, color: '#919191', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

// ─── כפתור בדיקת תקינות API ───
function ApiTestButton({ providerId, providerConfig }) {
  const [status, setStatus] = useState(null); // null | 'loading' | 'ok' | 'fail'
  const [resultText, setResultText] = useState('');

  const formatAvailableModels = (models = []) => {
    const safeModels = [...new Set((Array.isArray(models) ? models : [])
      .map((model) => String(model || '').trim())
      .filter(Boolean))];
    if (!safeModels.length) return '';
    const preview = safeModels.slice(0, 5).join(', ');
    return safeModels.length > 5 ? `${preview} ועוד ${safeModels.length - 5}` : preview;
  };

  const handleTest = async () => {
    setStatus('loading');
    setResultText('');
    try {
      const result = await testProviderConnection(providerId, providerConfig);
      const availableModelsLabel = formatAvailableModels(result.availableModels);
      if (result.ok) {
        setStatus('ok');
        const modelLabel = result.model ? ` (${result.model})` : '';
        const tried = result.triedModels.length > 1 ? ` · ניסה ${result.triedModels.length} מודלים` : '';
        const available = availableModelsLabel ? ` · זמינים למפתח: ${availableModelsLabel}` : '';
        setResultText(`✅ מחובר${modelLabel}${tried}${available}`);
      } else {
        setStatus('fail');
        const tried = result.triedModels.length ? ` · נוסו: ${result.triedModels.join(', ')}` : '';
        const available = availableModelsLabel ? ` · זמינים למפתח: ${availableModelsLabel}` : '';
        setResultText(`❌ נכשל: ${result.error}${available}${tried}`);
      }
    } catch (e) {
      setStatus('fail');
      setResultText(`❌ ${e?.message || 'שגיאה לא ידועה'}`);
    }
  };

  const btnColor = status === 'ok' ? '#D1FAE5' : status === 'fail' ? '#FEE2E2' : '#F1F5F9';
  const btnBorder = status === 'ok' ? '#6EE7B7' : status === 'fail' ? '#FCA5A5' : '#CBD5E1';
  const btnTextColor = status === 'ok' ? '#065F46' : status === 'fail' ? '#991B1B' : '#334155';

  return (
    <div style={{ marginTop: 4 }}>
      <button
        type="button"
        onClick={handleTest}
        disabled={status === 'loading'}
        style={{ fontSize: 11, padding: '4px 10px', background: btnColor, color: btnTextColor, border: `1px solid ${btnBorder}`, borderRadius: 6, cursor: status === 'loading' ? 'wait' : 'pointer', transition: 'all 0.15s' }}
      >
        {status === 'loading' ? '⏳ בודק...' : '🔌 בדוק חיבור'}
      </button>
      {resultText && (
        <div style={{ marginTop: 4, fontSize: 11, color: status === 'ok' ? '#065F46' : '#991B1B', lineHeight: 1.5, direction: 'rtl' }}>
          {resultText}
        </div>
      )}
    </div>
  );
}

// ─── קטע ספק ───
const isProviderConfigured = (config, providerId) => {
  const provider = config?.[providerId] || {};
  switch (providerId) {
    case 'gemini':
    case 'openai':
    case 'claude':
    case 'groq':
    case 'perplexity':
    case 'scholar':
      return Boolean(String(provider.key || '').trim());
    case 'copyleaks':
      return Boolean(String(provider.email || '').trim() && String(provider.key || '').trim());
    case 'ollama': {
      const baseUrl = String(provider.baseUrl || '').trim();
      return Boolean(baseUrl && String(provider.model || '').trim() && isLocalOpenAICompatibleBaseUrl(baseUrl));
    }
    case 'custom': {
      const baseUrl = String(provider.baseUrl || '').trim();
      return Boolean(baseUrl && String(provider.model || '').trim() && (String(provider.key || '').trim() || isLocalOpenAICompatibleBaseUrl(baseUrl)));
    }
    default:
      return false;
  }
};

function ProviderSection({ title, icon, description, active, configured, onActivate, children, allowActivate = true, expandedHint = false }) {
  const [expanded, setExpanded] = useState(active || configured);

  useEffect(() => {
    if (active) setExpanded(true);
  }, [active]);

  useEffect(() => {
    if (expandedHint) setExpanded(true);
  }, [expandedHint]);

  return (
    <div style={{ border: `2px solid ${active ? '#2B579A' : '#E1DFDD'}`, borderRadius: 10, padding: '10px 12px', marginBottom: 10, background: active ? '#FAFCFF' : 'white', transition: 'all 0.15s' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#323130' }}>{title}</span>
          {active && <span style={{ fontSize: 10, background: '#2B579A', color: 'white', padding: '2px 8px', borderRadius: 10 }}>ברירת מחדל</span>}
          {configured && <span style={{ fontSize: 10, background: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: 10 }}>מוגדר</span>}
          {!configured && <span style={{ fontSize: 10, background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: 10 }}>חסר מפתח/הגדרה</span>}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            style={{ fontSize: 11, padding: '4px 10px', background: 'white', color: '#334155', border: '1px solid #CBD5E1', borderRadius: 6, cursor: 'pointer' }}
          >
            {expanded ? 'הסתר פרטים' : 'הצג פרטים'}
          </button>
          {allowActivate && (
            <button onClick={onActivate}
              disabled={!configured}
              style={{ fontSize: 11, padding: '4px 12px', background: active ? '#E1DFDD' : '#2B579A', color: active ? '#605E5C' : 'white', border: 'none', borderRadius: 6, cursor: !configured ? 'not-allowed' : 'pointer', opacity: !configured ? 0.55 : 1 }}>
              {active ? 'ברירת מחדל פעילה' : 'קבע כברירת מחדל'}
            </button>
          )}
        </div>
      </div>

      {expanded ? (
        <>
          {description && <p style={{ fontSize: 11, color: '#605E5C', marginBottom: 10, marginTop: 8 }}>{linkifyText(description)}</p>}
          <div>{children}</div>
        </>
      ) : (
        <div style={{ fontSize: 10, color: '#64748B', marginTop: 8, lineHeight: 1.6, opacity: 0.9 }}>
          {configured ? 'הספק מוכן לעבודה. אפשר לפתוח כדי לראות או לערוך את ההגדרות.' : 'פתח את הכרטיס כדי להגדיר מפתח API, כתובת או מודל.'}
        </div>
      )}
    </div>
  );
}

// ─── הגדרות AI ───
function AiSettings({ config, setConfig }) {
  const [showCustomHelp, setShowCustomHelp] = useState(false);
  const [selectedGuideId, setSelectedGuideId] = useState(() => deriveProviderGuideId(config));
  const [openedGuideProviderId, setOpenedGuideProviderId] = useState('');
  const [quickKeyPopup, setQuickKeyPopup] = useState(null); // { providerId, label, keyField, baseUrlField? }
  const update = (provider, field, value) =>
    setConfig(prev => ({ ...prev, [provider]: { ...prev[provider], [field]: value } }));
  const updateToolLink = (toolId, field, value) =>
    setConfig((prev) => ({
      ...prev,
      toolLinks: {
        ...(prev.toolLinks || {}),
        [toolId]: {
          ...(prev.toolLinks?.[toolId] || {}),
          [field]: value,
        },
      },
    }));
  const activate = (id) => setConfig(prev => ({
    ...prev,
    active: id,
    activeProviders: [id, ...Array.from(new Set([...(Array.isArray(prev.activeProviders) && prev.activeProviders.length ? prev.activeProviders : [prev.active]), id].filter(Boolean))).filter((providerId) => providerId !== id)],
  }));
  const selectedProviders = new Set(
    config.multiModelEnabled === true
      ? (Array.isArray(config.activeProviders) && config.activeProviders.length ? config.activeProviders : [config.active])
      : [config.active]
  );
  const toggleMultiProvider = (providerId) => {
    setConfig((prev) => {
      const current = new Set(Array.isArray(prev.activeProviders) && prev.activeProviders.length ? prev.activeProviders : [prev.active]);
      if (current.has(providerId)) {
        if (current.size === 1) return prev;
        current.delete(providerId);
      } else {
        current.add(providerId);
      }
      const nextProviders = Array.from(current);
      return {
        ...prev,
        activeProviders: nextProviders,
        active: current.has(prev.active) ? prev.active : nextProviders[0],
      };
    });
  };
  useEffect(() => {
    setSelectedGuideId((currentGuideId) => {
      const currentGuide = PROVIDER_SETUP_INDEX[currentGuideId];
      const nextGuideId = currentGuide && currentGuide.setupMode !== 'builtin'
        ? deriveProviderGuideId({ ...config, active: 'custom' })
        : deriveProviderGuideId(config);
      return nextGuideId === currentGuideId ? currentGuideId : nextGuideId;
    });
  }, [config.active, config.custom?.name, config.custom?.baseUrl]);
  const providerGuide = PROVIDER_SETUP_INDEX[selectedGuideId] || PROVIDER_SETUP_INDEX.gemini;
  const applyGuidePreset = (guide) => {
    if (!guide) return;
    setSelectedGuideId(guide.id);
    if (guide.setupMode === 'builtin') {
      setOpenedGuideProviderId(guide.id);
      return;
    }

    setConfig((prev) => {
      const nextCustomName = guide.customConfig?.name || prev.custom?.name || '';
      const nextCustomBaseUrl = guide.customConfig?.baseUrl || prev.custom?.baseUrl || '';
      const preserveExistingKey = !guide.customConfig || (
        normalizeProviderIdentity(prev.custom?.name || '') === normalizeProviderIdentity(nextCustomName)
        && normalizeProviderIdentity(prev.custom?.baseUrl || '') === normalizeProviderIdentity(nextCustomBaseUrl)
      );

      return {
        ...prev,
        custom: {
          ...prev.custom,
          name: nextCustomName,
          baseUrl: nextCustomBaseUrl,
          key: preserveExistingKey ? (prev.custom?.key || '') : '',
          model: guide.customConfig?.model || prev.custom?.model || '',
        },
      };
    });
    setShowCustomHelp(true);
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: '#605E5C', marginBottom: 12, lineHeight: 1.6 }}>
        אפשר לשמור כמה מנועי AI במקביל. במסך הזה יש רק <strong>ברירת מחדל אחת</strong>, אבל בתוך סוכני התפקיד אפשר לבחור מנוע אחר לכל סוכן וכך לעבוד עם כמה מודלים יחד.
      </p>

      <div style={{ border: '1px solid #DBEAFE', borderRadius: 12, padding: '10px 12px', background: '#F8FBFF', marginBottom: 12, fontSize: 11, color: '#1E3A8A', lineHeight: 1.7 }}>
        לדוגמה: אפשר להפעיל ביחד Gemini + Claude, וכל בקשה תעבור דרך שניהם ואז תאוחד לתשובה אחת.
      </div>

      <div style={{ border: '1px solid #E2E8F0', borderRadius: 16, padding: '14px', background: 'white', marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>בחר מדריך הגדרה לפי השימוש הצפוי</div>
            <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.7 }}>
              הבחירה כאן לא מחליפה את ברירת המחדל הפעילה. ספקים מובנים יפתחו את הכרטיס שלהם, וספקים תואמי OpenAI ימלאו אוטומטית את אזור Custom עם הכתובת והמודל הראשוני.
            </div>
          </div>
          <a
            href={providerGuide.keyUrl}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 11, color: '#1D4ED8', textDecoration: 'underline', fontWeight: 700 }}
          >
            {providerGuide.keyCta}
          </a>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
          {PROVIDER_SETUP_CATALOG.map((guide) => {
            const selected = providerGuide.id === guide.id;
            return (
              <button
                key={guide.id}
                type="button"
                onClick={() => setSelectedGuideId(guide.id)}
                style={{
                  textAlign: 'right',
                  border: `1px solid ${selected ? '#93C5FD' : '#E5E7EB'}`,
                  borderRadius: 14,
                  padding: '12px 12px 10px',
                  background: selected ? '#EFF6FF' : '#F8FAFC',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <strong style={{ fontSize: 13, color: '#0F172A' }}>{guide.label}</strong>
                  <span style={{ fontSize: 10, color: selected ? '#1D4ED8' : '#475569', background: selected ? '#DBEAFE' : 'white', border: '1px solid #CBD5E1', borderRadius: 999, padding: '2px 8px' }}>{guide.badge}</span>
                </div>
                <div style={{ fontSize: 11, color: '#334155', lineHeight: 1.6 }}>{guide.recommendation[0]}</div>
                <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.6, marginTop: 4 }}>{guide.recommendation[1]}</div>
              </button>
            );
          })}
        </div>

        <div style={{ border: '1px solid #DBEAFE', borderRadius: 14, padding: '12px 14px', background: '#F8FBFF' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1E3A8A', marginBottom: 4 }}>איך משיגים גישה ל-{providerGuide.label}</div>
              <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.7 }}>{providerGuide.keyHint}</div>
            </div>
            <button
              type="button"
              onClick={() => applyGuidePreset(providerGuide)}
              style={{ fontSize: 11, padding: '7px 12px', background: '#1D4ED8', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}
            >
              {providerGuide.setupMode === 'builtin' ? 'פתח את הכרטיס המתאים' : 'מלא הגדרות עזר ב-Custom'}
            </button>
          </div>
          <ol style={{ margin: 0, paddingRight: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: '#334155', lineHeight: 1.7 }}>
            {providerGuide.setupSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </div>

      <div style={{ border: '1px solid #D1FAE5', borderRadius: 12, padding: '12px', background: '#F0FDF4', marginBottom: 18 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#166534', fontWeight: 700, marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={config.multiModelEnabled === true}
            onChange={(e) => setConfig((prev) => {
              const preservedProviders = Array.isArray(prev.activeProviders) && prev.activeProviders.length
                ? prev.activeProviders
                : [prev.active].filter(Boolean);
              return {
              ...prev,
              multiModelEnabled: e.target.checked,
                activeProviders: preservedProviders.includes(prev.active)
                  ? preservedProviders
                  : [prev.active, ...preservedProviders].filter(Boolean),
              };
            })}
          />
          הפעל מצב Multi-Model
        </label>

        <div style={{ fontSize: 11, color: '#166534', lineHeight: 1.7, marginBottom: 8 }}>
          סמן כאן כמה מנועים שירוצו על אותה בקשה. מנוע ברירת המחדל יבצע גם את האיחוד הסופי של התוצאה.
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {[
            ['gemini', 'Gemini'],
            ['claude', 'Claude'],
            ['openai', 'OpenAI'],
            ['groq', 'Groq'],
            ['perplexity', 'Perplexity'],
            ['ollama', 'Ollama'],
            ['custom', config.custom?.name || 'Custom'],
          ].map(([providerId, label]) => {
            const configured = isProviderConfigured(config, providerId);
            const isSelected = selectedProviders.has(providerId);
            const isDisabled = config.multiModelEnabled !== true;
            const showWarning = isSelected && !configured;
            const QUICK_KEY_META = {
              gemini: { keyField: 'key', keyPlaceholder: 'AIza...', hint: 'מפתח Gemini' },
              claude: { keyField: 'key', keyPlaceholder: 'sk-ant-...', hint: 'מפתח Claude' },
              openai: { keyField: 'key', keyPlaceholder: 'sk-...', hint: 'מפתח OpenAI' },
              groq: { keyField: 'key', keyPlaceholder: 'gsk_...', hint: 'מפתח Groq' },
              perplexity: { keyField: 'key', keyPlaceholder: 'pplx-...', hint: 'מפתח Perplexity' },
              ollama: { baseUrlField: 'baseUrl', baseUrlPlaceholder: 'http://localhost:11434', hint: 'כתובת Ollama מקומית' },
              custom: { keyField: 'key', keyPlaceholder: 'API key...', baseUrlField: 'baseUrl', baseUrlPlaceholder: 'https://...', hint: 'ספק מותאם' },
            };
            const meta = QUICK_KEY_META[providerId];
            return (
              <label
                key={providerId}
                title={!configured ? 'לחץ פעמיים להזנת מפתח מהיר' : 'לחץ פעמיים לעריכת מפתח'}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  if (!meta) return;
                  setQuickKeyPopup({ providerId, label, ...meta });
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
                  color: isDisabled ? '#64748B' : showWarning ? '#92400E' : '#14532D',
                  background: showWarning ? '#FFFBEB' : 'white',
                  border: `1px solid ${isDisabled ? '#E5E7EB' : showWarning ? '#FCD34D' : '#BBF7D0'}`,
                  borderRadius: 999, padding: '6px 10px',
                  opacity: isDisabled ? 0.6 : 1,
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={isDisabled}
                  onChange={() => toggleMultiProvider(providerId)}
                />
                {label}
                {showWarning && <span style={{ fontSize: 10, marginRight: 2 }}>⚠️ חסר מפתח</span>}
                {!configured && !isSelected && <span style={{ fontSize: 10, color: '#94A3B8' }}> (לא מוגדר)</span>}
              </label>
            );
          })}
        </div>
        {quickKeyPopup && (
          <div style={{ position: 'relative', marginTop: 10 }}>
            <div style={{ border: '1px solid #FCD34D', borderRadius: 12, padding: '14px', background: '#FFFBEB', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E' }}>⚡ הגדרת מפתח מהיר — {quickKeyPopup.label}</div>
                <button type="button" onClick={() => setQuickKeyPopup(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#64748B', lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ fontSize: 11, color: '#78350F' }}>{quickKeyPopup.hint} — אחרי השמירה, לחץ על "בדוק חיבור" בכרטיס הספק למטה.</div>
              {quickKeyPopup.baseUrlField && (
                <div>
                  <div style={{ fontSize: 11, color: '#374151', marginBottom: 4 }}>Base URL</div>
                  <input
                    type="text"
                    placeholder={quickKeyPopup.baseUrlPlaceholder}
                    value={config[quickKeyPopup.providerId]?.[quickKeyPopup.baseUrlField] || ''}
                    onChange={(e) => update(quickKeyPopup.providerId, quickKeyPopup.baseUrlField, e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 12, direction: 'ltr' }}
                  />
                </div>
              )}
              {quickKeyPopup.keyField && (
                <div>
                  <div style={{ fontSize: 11, color: '#374151', marginBottom: 4 }}>API Key</div>
                  <input
                    type="password"
                    placeholder={quickKeyPopup.keyPlaceholder}
                    value={config[quickKeyPopup.providerId]?.[quickKeyPopup.keyField] || ''}
                    onChange={(e) => update(quickKeyPopup.providerId, quickKeyPopup.keyField, e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 12, direction: 'ltr' }}
                  />
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setQuickKeyPopup(null)} style={{ padding: '6px 14px', border: '1px solid #D1D5DB', borderRadius: 8, background: 'white', fontSize: 12, cursor: 'pointer', color: '#374151' }}>סגור</button>
                <button type="button" onClick={() => { setOpenedGuideProviderId(quickKeyPopup.providerId); setQuickKeyPopup(null); }} style={{ padding: '6px 14px', border: 'none', borderRadius: 8, background: '#D97706', color: 'white', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>פתח כרטיס מלא ↓</button>
              </div>
            </div>
          </div>
        )}
        <div style={{ fontSize: 10, color: '#166534', marginTop: 8 }}>
          ניתן לבחור גם ספקים לא מוגדרים — הם יופיעו עם אזהרה עד שיוגדר מפתח API בכרטיס שלהם למטה. לחיצה כפולה על ספק פותחת הגדרה מהירה.
        </div>
      </div>

      {/* Gemini */}
      <ProviderSection title="Google Gemini" icon="🔵" active={config.active === 'gemini'} configured={isProviderConfigured(config, 'gemini')} onActivate={() => activate('gemini')} expandedHint={openedGuideProviderId === 'gemini'}
        description="קבל מפתח API חינמי ב: aistudio.google.com/app/apikey">
        <FieldRow label="מפתח API" type="password" placeholder="AIza..." value={config.gemini?.key}
          onChange={v => update('gemini', 'key', v)} hint="מתחיל ב-AIza" />
        <FieldRow
          label="מודל"
          placeholder="gemini-2.5-flash"
          value={config.gemini?.model}
          onChange={v => update('gemini', 'model', v)}
          options={getProviderModelChoices('gemini', config)}
          hint="אפשר לבחור מהרשימה או להקליד ידנית"
        />
        <ApiTestButton providerId="gemini" providerConfig={{ key: config.gemini?.key, model: config.gemini?.model }} />
      </ProviderSection>

      {/* OpenAI */}
      <ProviderSection title="OpenAI (ChatGPT / GPT-4)" icon="🟢" active={config.active === 'openai'} configured={isProviderConfigured(config, 'openai')} onActivate={() => activate('openai')} expandedHint={openedGuideProviderId === 'openai'}
        description="קבל מפתח API ב: platform.openai.com/api-keys">
        <FieldRow label="מפתח API" type="password" placeholder="sk-..." value={config.openai?.key}
          onChange={v => update('openai', 'key', v)} hint="מתחיל ב-sk-" />
        <FieldRow
          label="מודל"
          placeholder="gpt-4o"
          value={config.openai?.model}
          onChange={v => update('openai', 'model', v)}
          options={getProviderModelChoices('openai', config)}
          hint="אפשר לבחור מהרשימה או להקליד ידנית"
        />
        <ApiTestButton providerId="openai" providerConfig={{ key: config.openai?.key, model: config.openai?.model }} />
      </ProviderSection>

      {/* Claude */}
      <ProviderSection title="Claude (Anthropic)" icon="🟠" active={config.active === 'claude'} configured={isProviderConfigured(config, 'claude')} onActivate={() => activate('claude')} expandedHint={openedGuideProviderId === 'claude'}
        description="קבל מפתח API ב: console.anthropic.com/settings/keys">
        <FieldRow label="מפתח API" type="password" placeholder="sk-ant-..." value={config.claude?.key}
          onChange={v => update('claude', 'key', v)} hint="מתחיל ב-sk-ant-" />
        <FieldRow
          label="מודל"
          placeholder="claude-sonnet-4-6"
          value={config.claude?.model}
          onChange={v => update('claude', 'model', v)}
          options={getProviderModelChoices('claude', config)}
          hint="אפשר לבחור מהרשימה או להקליד ידנית"
        />
        <ApiTestButton providerId="claude" providerConfig={{ key: config.claude?.key, model: config.claude?.model }} />
      </ProviderSection>

      {/* Groq */}
      <ProviderSection title="Groq (מהיר ובחינם)" icon="⚡" active={config.active === 'groq'} configured={isProviderConfigured(config, 'groq')} onActivate={() => activate('groq')} expandedHint={openedGuideProviderId === 'groq'}
        description="מהיר מאוד ובחינם! קבל מפתח API ב: console.groq.com — לא דורש כרטיס אשראי">
        <FieldRow label="מפתח API" type="password" placeholder="gsk_..." value={config.groq?.key}
          onChange={v => update('groq', 'key', v)} hint="מתחיל ב-gsk_" />
        <FieldRow
          label="מודל"
          placeholder="llama-3.3-70b-versatile"
          value={config.groq?.model}
          onChange={v => update('groq', 'model', v)}
          options={getProviderModelChoices('groq', config)}
          hint="אפשר לבחור מהרשימה או להקליד ידנית"
        />
        <ApiTestButton providerId="groq" providerConfig={{ key: config.groq?.key, model: config.groq?.model }} />
      </ProviderSection>

      {/* Perplexity */}
      <ProviderSection title="Perplexity AI" icon="🔍" active={config.active === 'perplexity'} configured={isProviderConfigured(config, 'perplexity')} onActivate={() => activate('perplexity')} expandedHint={openedGuideProviderId === 'perplexity'}
        description="AI עם גישה לאינטרנט בזמן אמת. מפתח ב: perplexity.ai/settings/api">
        <FieldRow label="מפתח API" type="password" placeholder="pplx-..." value={config.perplexity?.key}
          onChange={v => update('perplexity', 'key', v)} hint="מתחיל ב-pplx-" />
        <FieldRow
          label="מודל"
          placeholder="sonar-pro"
          value={config.perplexity?.model}
          onChange={v => update('perplexity', 'model', v)}
          options={getProviderModelChoices('perplexity', config)}
          hint="אפשר לבחור מהרשימה או להקליד ידנית"
        />
        <ApiTestButton providerId="perplexity" providerConfig={{ key: config.perplexity?.key, model: config.perplexity?.model }} />
      </ProviderSection>

      {/* Ollama */}
      <ProviderSection title="Ollama (מקומי — חינמי לחלוטין)" icon="🦙" active={config.active === 'ollama'} configured={isProviderConfigured(config, 'ollama')} onActivate={() => activate('ollama')} expandedHint={openedGuideProviderId === 'ollama'}
        description="הרץ AI ישירות על המחשב שלך! הורד מ-ollama.com — פרטי, חינמי, ללא אינטרנט">
        <FieldRow label="כתובת שרת" placeholder="http://localhost:11434/v1" value={config.ollama?.baseUrl}
          onChange={v => update('ollama', 'baseUrl', v)} hint="ברירת מחדל כשאולמה רץ על המחשב" />
        <FieldRow
          label="שם מודל"
          placeholder="llama3.2"
          value={config.ollama?.model}
          onChange={v => update('ollama', 'model', v)}
          options={getProviderModelChoices('ollama', config)}
          hint="אפשר לבחור מהרשימה או להקליד ידנית"
        />
        <ApiTestButton providerId="ollama" providerConfig={{ baseUrl: config.ollama?.baseUrl, model: config.ollama?.model }} />
      </ProviderSection>

      <ProviderSection title="Google Scholar / SerpAPI" icon="🎓" active={false} configured={isProviderConfigured(config, 'scholar')} onActivate={() => {}} allowActivate={false}
        description="אם קיבלת מפתח דרך SerpAPI, אפשר לשמור אותו כאן לשימוש במחקר וחיפוש מקורות. הוצא מפתח מכאן: https://serpapi.com/google-scholar-api">
        <FieldRow label="מפתח SerpAPI" type="password" placeholder="your_serpapi_key" value={config.scholar?.key}
          onChange={v => update('scholar', 'key', v)} hint="המפתח משמש לחיבור חיפושי Google Scholar" />
      </ProviderSection>

      <ProviderSection title="Copyleaks לזיהוי AI" icon="🛡️" active={false} configured={isProviderConfigured(config, 'copyleaks')} onActivate={() => {}} allowActivate={false}
        description="בדיקת טקסט דרך Copyleaks למסמך, לפסקה או לטקסט מסומן. ממלאים את הפרטים כאן, ואפשר לבדוק חיבור כדי לוודא שהכל מוכן לפני ההרצה הראשונה.">
        <div style={{ border: '1px solid #DBEAFE', borderRadius: 10, padding: '10px 12px', background: '#F8FBFF', color: '#1E3A8A', fontSize: 11, lineHeight: 1.7, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>מה זה?</div>
          <div>זה כלי שבודק אם טקסט נראה אנושי או נראה כתוכן שנוצר בעזרת AI דרך Copyleaks. הוא לא כותב טקסט ולא מחליף את מנוע הכתיבה.</div>
          <div style={{ marginTop: 8 }}>1. כתבו את האימייל של חשבון Copyleaks.</div>
          <div>2. הדביקו את המפתח הסודי מלוח הבקרה של Copyleaks.</div>
          <div>
            אין לכם עדיין מפתח? <a href="https://api.copyleaks.com/dashboard" target="_blank" rel="noreferrer" style={{ color: '#1D4ED8', textDecoration: 'underline', fontWeight: 700 }}>פתחו את Copyleaks Developer Dashboard</a>.
          </div>
          <div>3. אפשר ללחוץ על בדיקת חיבור כדי לוודא שהפרטים נכונים, ומומלץ לעשות זאת לפני הפעם הראשונה.</div>
          <div style={{ marginTop: 8 }}>בכל בדיקה אפשר לשלוח קטע באורך {COPYLEAKS_TEXT_MIN_CHARS}-{COPYLEAKS_TEXT_MAX_CHARS} תווים.</div>
        </div>
        <FieldRow label="אימייל של חשבון Copyleaks" placeholder="name@example.com" value={config.copyleaks?.email}
          onChange={v => update('copyleaks', 'email', v)} hint="האימייל שאיתו נכנסים לחשבון Copyleaks." />
        <FieldRow label="מפתח סודי" type="password" placeholder="הדביקו כאן את המפתח" value={config.copyleaks?.key}
          onChange={v => update('copyleaks', 'key', v)} hint="המפתח הסודי מלוח הבקרה של Copyleaks. הוא משמש רק לבדיקה הזו." />
        <FieldRow label="רגישות" placeholder="2" value={String(config.copyleaks?.sensitivity ?? 2)}
          onChange={v => update('copyleaks', 'sensitivity', v)} options={['1', '2', '3']} hint="כמה מחמיר הזיהוי: 1 פחות מחמיר, 3 יותר מחמיר." />
        <FieldRow label="שפה לבדיקה (אופציונלי)" placeholder="he" value={config.copyleaks?.language}
          onChange={v => update('copyleaks', 'language', v)} hint="אפשר להשאיר ריק כדי ש-Copyleaks יזהה את השפה לבד." />

        <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#334155', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={config.copyleaks?.explain === true}
              onChange={(e) => update('copyleaks', 'explain', e.target.checked)}
            />
            פירוט נוסף: מוסיף הסבר מפורט יותר למה Copyleaks סימן את הטקסט
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#334155', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={config.copyleaks?.sandbox === true}
              onChange={(e) => update('copyleaks', 'sandbox', e.target.checked)}
            />
            מצב הדגמה: מחזיר תוצאות הדגמה כדי לוודא שהחיבור עובד, בלי בדיקה אמיתית
          </label>
        </div>

        <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 12px', background: '#F8FAFC', color: '#475569', fontSize: 11, lineHeight: 1.7, marginBottom: 10 }}>
          חשוב: זה כלי בדיקה בלבד. הוא לא ספק הכתיבה הפעיל, לא יוצר טקסט, ופועל רק מטאב "זיהוי AI" ב-Ribbon או מתוך חלון הבדיקה.
        </div>

        <ApiTestButton providerId="copyleaks" providerConfig={{
          email: config.copyleaks?.email,
          key: config.copyleaks?.key,
          sensitivity: config.copyleaks?.sensitivity,
          explain: config.copyleaks?.explain,
          sandbox: config.copyleaks?.sandbox,
          language: config.copyleaks?.language,
        }} />
      </ProviderSection>

      <div style={{ border: '1px solid #DBEAFE', borderRadius: 12, padding: '12px 14px', background: '#F8FBFF', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1E3A8A', marginBottom: 6 }}>קישורי תוספות בסרגל</div>
        <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.7, marginBottom: 10 }}>
          כאן אפשר לשנות גם את שם הכפתור וגם את הכתובת של כל קישור. בשדות חיפוש אפשר להשתמש ב־{'{query}'} כדי לשלב את מה שסימנת או כתבת, וב־{'{serpapiKey}'} כדי לשלב אוטומטית את מפתח SerpAPI ששמרת.
        </div>
        {[
          ['googleSearch', 'חיפוש גוגל'],
          ['scholar', 'Google Scholar'],
          ['modelHub', 'מודל'],
          ['orbit', 'Orbit'],
        ].map(([toolId, fallbackLabel]) => (
          <div key={toolId} style={{ borderTop: '1px solid #DBEAFE', paddingTop: 10, marginTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>{fallbackLabel}</div>
            <FieldRow
              label="כותרת כפתור"
              placeholder={fallbackLabel}
              value={config.toolLinks?.[toolId]?.label || ''}
              onChange={(v) => updateToolLink(toolId, 'label', v)}
            />
            <FieldRow
              label="כתובת אתר"
              placeholder="https://example.com/search?q={query}"
              value={config.toolLinks?.[toolId]?.url || ''}
              onChange={(v) => updateToolLink(toolId, 'url', v)}
              hint="אפשר להשתמש ב־{'{query}'} וב־{'{serpapiKey}'} בתוך הכתובת"
            />
          </div>
        ))}
      </div>

      <ProviderSection title={config.custom?.name || 'מנוע אחר (מותאם אישית)'} icon="🔌"
        active={config.active === 'custom'} configured={isProviderConfigured(config, 'custom')} onActivate={() => activate('custom')}
        expandedHint={showCustomHelp}
        description="">

        {/* כפתור הסבר */}
        <button onClick={() => setShowCustomHelp(v => !v)}
          style={{ fontSize: 12, color: '#2B579A', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 12, textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: 4 }}>
          {showCustomHelp ? '▴' : '▾'} מה צריך להכין? איך זה עובד?
        </button>

        {/* הסבר מפורט */}
        {showCustomHelp && (
          <div style={{ background: '#F8F7F6', border: '1px solid #E1DFDD', borderRadius: 8, padding: '14px 16px', marginBottom: 14, fontSize: 12, lineHeight: 1.7, color: '#323130' }}>
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>🔌 מנוע מותאם אישית — OpenAI-Compatible API</div>
            <p style={{ marginBottom: 10, color: '#605E5C' }}>
              רוב ספקי ה-AI הקטנים והמקומיים מספקים API התואם לפרוטוקול של OpenAI.
              בדרך כלל, בדשבורד של הספק תמצא <strong>שלושה דברים</strong> שצריך להעתיק לכאן:
            </p>
            <ul style={{ paddingRight: 18, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li><strong>כתובת API (Base URL)</strong> — מופיעה בתיעוד תחת &ldquo;API Reference&rdquo; או &ldquo;Endpoint&rdquo;. נראית כך: <code style={{ background: '#E8E8E8', padding: '1px 5px', borderRadius: 3 }}>https://api.groq.com/openai/v1</code></li>
              <li><strong>מפתח API</strong> — מחרוזת שהספק נותן, לפעמים מתחילה ב-<code style={{ background: '#E8E8E8', padding: '1px 5px', borderRadius: 3 }}>sk-</code>. <em>ללא מפתח נתמך רק ב-loopback מקומי מאושר של Ollama או LM Studio על פורטים 11434 או 1234.</em></li>
              <li><strong>שם מודל</strong> — השם הטכני כמו <code style={{ background: '#E8E8E8', padding: '1px 5px', borderRadius: 3 }}>llama-3.3-70b-versatile</code>. מופיע ברשימת Models בתיעוד.</li>
            </ul>

            <div style={{ fontWeight: 700, marginBottom: 8 }}>🌐 ספקים נפוצים — לחץ להעתקה מהירה:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {POPULAR_CUSTOM.map(p => (
                <div key={p.name} style={{ background: 'white', border: '1px solid #E1DFDD', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontWeight: 600, color: '#2B579A', marginBottom: 4 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 6 }}>📌 {linkifyText(p.note)}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => update('custom', 'baseUrl', p.url)}
                      style={{ fontSize: 11, padding: '3px 10px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 4, cursor: 'pointer', color: '#1D4ED8' }}>
                      📋 העתק URL
                    </button>
                    <button onClick={() => update('custom', 'model', p.model)}
                      style={{ fontSize: 11, padding: '3px 10px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 4, cursor: 'pointer', color: '#166534' }}>
                      📋 העתק שם מודל
                    </button>
                    <button onClick={() => { update('custom', 'baseUrl', p.url); update('custom', 'model', p.model); update('custom', 'name', p.name); }}
                      style={{ fontSize: 11, padding: '3px 10px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 4, cursor: 'pointer', color: '#92400E' }}>
                      ⚡ מלא הכל
                    </button>
                    <span style={{ fontSize: 10, color: '#919191', alignSelf: 'center' }}>מפתח: {p.keyNote}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <FieldRow label="שם לתצוגה" placeholder="Groq / Ollama / DeepSeek ..." value={config.custom?.name}
          onChange={v => update('custom', 'name', v)} />
        <FieldRow label="כתובת API (Base URL)" placeholder="https://api.groq.com/openai/v1" value={config.custom?.baseUrl}
          onChange={v => update('custom', 'baseUrl', v)} hint="הכתובת מסתיימת בדרך כלל ב-/v1" />
        <FieldRow label="מפתח API" type="password" placeholder="gsk_... (ריק אם לא נדרש)" value={config.custom?.key}
          onChange={v => update('custom', 'key', v)} />
        <FieldRow label="שם מודל" placeholder="llama-3.3-70b-versatile" value={config.custom?.model}
          onChange={v => update('custom', 'model', v)} hint="חובה — העתק מרשימת Models של הספק" />
        <ApiTestButton providerId="custom" providerConfig={{ baseUrl: config.custom?.baseUrl, key: config.custom?.key, model: config.custom?.model }} />
      </ProviderSection>
    </div>
  );
}

// ─── הגדרות עוזר חכם ───
function AssistantBehaviorSettings({ behavior, setBehavior }) {
  return (
    <div>
      <p style={{ fontSize: 13, color: '#605E5C', marginBottom: 16 }}>
        כשהכתיבה נתקעת, העוזר נפתח אוטומטית כסיידבר קבוע בצד ימין כדי לעזור בלי לחסום את המסמך.
      </p>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#323130', fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={behavior.autoPopup !== false}
            onChange={(e) => setBehavior(prev => ({ ...prev, autoPopup: e.target.checked }))}
          />
          פתח פאנל עוזר אוטומטית כשאני נתקע בכתיבה
        </label>
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: '#FAFAFA' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#323130', marginBottom: 6 }}>זמן המתנה לפני קפיצה</div>
        <input
          type="number"
          min="3"
          max="30"
          value={behavior.idleSeconds || 5}
          onChange={(e) => setBehavior(prev => ({ ...prev, idleSeconds: Math.max(3, Number(e.target.value) || 5) }))}
          style={{ width: 110, padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12 }}
        />
        <span style={{ marginRight: 8, fontSize: 12, color: '#605E5C' }}>שניות</span>
      </div>
    </div>
  );
}

function PromptSettings({ sharedInstructions, setSharedInstructions, personalStyle, setPersonalStyle }) {
  const [copyState, setCopyState] = useState('');
  const [analysisOutput, setAnalysisOutput] = useState('');
  const [applyState, setApplyState] = useState(''); // '' | 'ok' | 'error'
  const [applyMessage, setApplyMessage] = useState('');

  const portablePrompt = buildPortablePrompt({ sharedInstructions, profile: personalStyle });
  const analysisPrompt = buildExternalStyleAnalysisPrompt({ profile: personalStyle });

  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text || '');
      setCopyState(label);
    } catch {
      setCopyState('ההעתקה נכשלה');
    } finally {
      setTimeout(() => setCopyState(''), 2000);
    }
  };

  const applyAnalysisOutput = () => {
    const raw = String(analysisOutput || '').trim();
    if (!raw) { setApplyState('error'); setApplyMessage('אין פלט להדבקה.'); return; }
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('לא נמצא JSON בפלט.');
      const parsed = JSON.parse(jsonMatch[0]);
      const merged = mergeExternalStyleExtractionIntoProfile(parsed, personalStyle);
      if (setPersonalStyle) setPersonalStyle(merged);
      setApplyState('ok');
      setApplyMessage('הפרופיל עודכן בהצלחה מהניתוח!');
      setAnalysisOutput('');
    } catch (e) {
      setApplyState('error');
      setApplyMessage(`שגיאה בפירוש הפלט: ${e.message}`);
    } finally {
      setTimeout(() => { setApplyState(''); setApplyMessage(''); }, 3500);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 13, color: '#605E5C', marginBottom: 0, lineHeight: 1.7 }}>
        כאן מגדירים הנחיות קבועות לכל ספקי AI, ואפשר גם לנתח עבודות קיימות דרך AI חיצוני ולייבא את הממצאים לפרופיל.
      </p>

      {/* הנחיות משותפות */}
      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 8 }}>הנחיות משותפות לכל ספקי AI</div>
        <textarea
          value={sharedInstructions}
          onChange={(e) => setSharedInstructions(e.target.value)}
          rows={5}
          placeholder="למשל: כתוב בעברית תקנית, אל תמציא מקורות, שמור על טון ענייני, אל תוסיף מבוא אם לא ביקשו"
          style={{ width: '100%', padding: '10px 12px', border: '1px solid #C8C6C4', borderRadius: 10, fontSize: 12, resize: 'vertical', marginBottom: 6 }}
        />
        <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.6 }}>הפרופיל האישי והלמידה הקיימת מצטרפים אוטומטית ל-Portable Prompt למטה.</div>
      </div>

      {/* ניתוח סגנון דרך AI חיצוני */}
      <div style={{ border: '1px solid #DBEAFE', borderRadius: 12, padding: '14px', background: '#F8FBFF' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E3A8A', marginBottom: 4 }}>🔍 ניתוח סגנון דרך AI חיצוני → ייבוא לפרופיל</div>
        <div style={{ fontSize: 11, color: '#475569', marginBottom: 12, lineHeight: 1.7 }}>
          העתק את פרומפט הניתוח, הדבק אותו ב-Claude / Gemini / ChatGPT יחד עם 2-3 עבודות לדוגמה, ואז הדבק כאן את הפלט JSON שתקבל.
        </div>

        {/* שלב 1 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1E3A8A' }}>שלב 1 — פרומפט הניתוח</div>
            <button
              type="button"
              onClick={() => copyText(analysisPrompt, 'פרומפט הניתוח הועתק ✓')}
              style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
            >
              📋 העתק פרומפט ניתוח
            </button>
          </div>
          <textarea
            readOnly
            value={analysisPrompt}
            rows={6}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: 11, resize: 'vertical', background: 'white', color: '#0F172A', direction: 'ltr' }}
          />
          <div style={{ fontSize: 10, color: '#64748B', marginTop: 4 }}>צרף לפרומפט גם 2-3 עבודות שכתבת בעבר — ככה הניתוח יהיה מדויק יותר.</div>
        </div>

        {/* שלב 2 */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1E3A8A', marginBottom: 6 }}>שלב 2 — הדבק את הפלט מה-AI</div>
          <textarea
            value={analysisOutput}
            onChange={(e) => setAnalysisOutput(e.target.value)}
            rows={5}
            placeholder='הדבק כאן את ה-JSON שהחזיר ה-AI (מתחיל ב-{"profileSummary":...)'
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 11, resize: 'vertical', direction: 'ltr', marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={applyAnalysisOutput}
              disabled={!analysisOutput.trim()}
              style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: analysisOutput.trim() ? '#1D4ED8' : '#CBD5E1', color: 'white', cursor: analysisOutput.trim() ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 700 }}
            >
              ✅ החל על הפרופיל
            </button>
            {applyMessage && (
              <div style={{ fontSize: 11, color: applyState === 'ok' ? '#166534' : '#991B1B', fontWeight: 600 }}>{applyMessage}</div>
            )}
          </div>
        </div>
      </div>

      {/* Portable Prompt */}
      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: '#FAFAFA' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#323130' }}>Portable Prompt מוכן להעתקה</div>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>יעבוד גם ב-Claude, Gemini, ChatGPT או כל ספק אחר.</div>
          </div>
          <button
            type="button"
            onClick={() => copyText(portablePrompt, 'הועתק ללוח ✓')}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
          >
            העתק Prompt
          </button>
        </div>
        <textarea
          readOnly
          value={portablePrompt}
          rows={10}
          style={{ width: '100%', padding: '10px 12px', border: '1px solid #CBD5E1', borderRadius: 10, fontSize: 12, resize: 'vertical', background: 'white', color: '#0F172A' }}
        />
        {copyState ? <div style={{ fontSize: 11, color: copyState.includes('נכשלה') ? '#991B1B' : '#166534', marginTop: 8 }}>{copyState}</div> : null}
      </div>
    </div>
  );
}

const STYLE_PRESET_OPTIONS = [
  { id: 'academic', label: 'אקדמי' },
  { id: 'legal', label: 'משפטי' },
  { id: 'business', label: 'עסקי' },
  { id: 'presentation', label: 'מצגת' },
];

const finalizePersonalProfile = (profile = {}) => {
  const normalizedFavoriteStyles = Array.from(new Set([
    ...((Array.isArray(profile.preferredHomeStyleIds) ? profile.preferredHomeStyleIds : []).filter(Boolean)),
    profile.defaultDocumentStyle || 'academic',
  ])).slice(0, 4);

  const hasMeaningfulStyleCustomization = Boolean(
    String(profile.customStyleGuidance || '').trim() ||
    (profile.defaultDocumentStyle && profile.defaultDocumentStyle !== 'academic') ||
    normalizedFavoriteStyles.some((item) => item && item !== 'academic')
  );

  const hasProfileDetails = hasMeaningfulPersonalProfileData(profile) || hasMeaningfulStyleCustomization;

  const currentFavoriteStyles = Array.isArray(profile.preferredHomeStyleIds) && profile.preferredHomeStyleIds.length
    ? profile.preferredHomeStyleIds
    : ['academic'];

  if (!hasProfileDetails) {
    const favoritesChanged = JSON.stringify(currentFavoriteStyles) !== JSON.stringify(normalizedFavoriteStyles);
    return favoritesChanged ? { ...profile, preferredHomeStyleIds: normalizedFavoriteStyles } : profile;
  }
  const favoritesChanged = JSON.stringify(currentFavoriteStyles) !== JSON.stringify(normalizedFavoriteStyles);
  const needsNormalization = profile.onboardingDismissedAt || profile.onboardingSnoozedUntil || favoritesChanged;
  if (!needsNormalization) return profile;

  return {
    ...profile,
    preferredHomeStyleIds: normalizedFavoriteStyles,
    onboardingCompletedAt: profile.onboardingCompletedAt || '',
    onboardingDismissedAt: '',
    onboardingSnoozedUntil: '',
  };
};

function WordDefaultsSettings({ prefs, setPrefs }) {
  const setFlag = (field, value) => setPrefs(prev => ({ ...prev, [field]: value }));
  const setActionVisibility = (actionId, value) => setPrefs(prev => ({
    ...prev,
    aiQuickActions: {
      ...(prev.aiQuickActions || {}),
      [actionId]: value,
    },
  }));

  return (
    <div>
      <p style={{ fontSize: 13, color: '#605E5C', marginBottom: 16 }}>
        סימנתי כברירת מחדל את האפשרויות המרכזיות שסומנו אצלך ב-Word המקורי.
      </p>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 10 }}>טיפוגרפיה ברירת מחדל</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4 }}>גופן כללי למסמכים חדשים</div>
            <select
              value={prefs.defaultFontFamily || 'Alef'}
              onChange={(e) => setPrefs(prev => ({ ...prev, defaultFontFamily: e.target.value, defaultFontStack: getDefaultFontStack(e.target.value) }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, background: 'white' }}
            >
              {DEFAULT_FONT_OPTIONS.map((font) => <option key={font} value={font}>{font}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4 }}>גודל ברירת מחדל</div>
            <input
              type="text"
              value={prefs.defaultFontSize || '12pt'}
              onChange={(e) => setFlag('defaultFontSize', e.target.value)}
              placeholder="12pt"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12 }}
            />
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.6 }}>אפשר להגדיר כאן ברירת מחדל כללית, ובמסך הבית לערוך סגנון ספציפי עם אייקון העיפרון.</div>
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 10 }}>בדיקות בזמן כתיבה</div>
        {[
          ['checkSpellingAsYouType', 'בדיקת איות תוך כדי כתיבה'],
          ['markGrammarAsYouType', 'סימון שגיאות דקדוק תוך כדי כתיבה'],
          ['grammarWithSpelling', 'בדיקת דקדוק יחד עם איות'],
        ].map(([field, label]) => (
          <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#323130', marginBottom: 8 }}>
            <input type="checkbox" checked={prefs[field] !== false} onChange={(e) => setFlag(field, e.target.checked)} />
            {label}
          </label>
        ))}
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 10 }}>עריכה חכמה</div>
        {[
          ['replaceSelectionOnType', 'החלף טקסט מסומן כשמתחילים להקליד'],
          ['selectWholeWord', 'בחר אוטומטית מילה שלמה'],
          ['allowDragDropEditing', 'אפשר גרירה ושחרור של טקסט'],
          ['ctrlClickOpensLinks', 'Ctrl + לחיצה על קישור לפתיחה'],
          ['showPasteOptions', 'הצג אפשרויות הדבקה'],
          ['smartCutPaste', 'הדבקה וחיתוך חכמים'],
        ].map(([field, label]) => (
          <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#323130', marginBottom: 8 }}>
            <input type="checkbox" checked={prefs[field] !== false} onChange={(e) => setFlag(field, e.target.checked)} />
            {label}
          </label>
        ))}
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 10 }}>הדפסה ותצוגה</div>
        {[
          ['showDrawings', 'הצג ציורים ותיבות טקסט על המסך'],
          ['showTextHighlighting', 'הצג סימון טקסט'],
          ['printBackgrounds', 'הדפס צבעי רקע ותמונות'],
          ['updateFieldsBeforePrint', 'עדכן שדות לפני הדפסה'],
        ].map(([field, label]) => (
          <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#323130', marginBottom: 8 }}>
            <input type="checkbox" checked={prefs[field] !== false} onChange={(e) => setFlag(field, e.target.checked)} />
            {label}
          </label>
        ))}
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 6 }}>התאמה אישית של פעולות AI</div>
        <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 10, lineHeight: 1.6 }}>
          בחר אילו פעולות יופיעו בסרגל האקדמי ובחלונית ה-AI. השינויים חלים מיד.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {ACTION_VISIBILITY_OPTIONS.map((action) => (
            <label key={action.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#323130', border: '1px solid #E5E7EB', borderRadius: 10, padding: '8px 10px', background: '#FAFAFA' }}>
              <input
                type="checkbox"
                checked={prefs.aiQuickActions?.[action.id] !== false}
                onChange={(e) => setActionVisibility(action.id, e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>
                <strong style={{ display: 'block', marginBottom: 2 }}>{action.label}</strong>
                <span style={{ fontSize: 10, color: '#64748B' }}>{action.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: '#FAFAFA' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 10 }}>שמירה ושחזור</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#323130', marginBottom: 10 }}>
          <input type="checkbox" checked={prefs.autoSave !== false} onChange={(e) => setFlag('autoSave', e.target.checked)} />
          שמירה אוטומטית פעילה כברירת מחדל
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#323130', marginBottom: 10 }}>
          <input type="checkbox" checked={prefs.keepLastAutosavedVersion !== false} onChange={(e) => setFlag('keepLastAutosavedVersion', e.target.checked)} />
          שמור את הגרסה האחרונה לשחזור
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#323130', marginBottom: 10 }}>
          <input type="checkbox" checked={prefs.allowBackgroundSave !== false} onChange={(e) => setFlag('allowBackgroundSave', e.target.checked)} />
          אפשר שמירה ברקע
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#323130', marginBottom: 10 }}>
          <input type="checkbox" checked={prefs.savePreview !== false} onChange={(e) => setFlag('savePreview', e.target.checked)} />
          שמור תמונת תצוגה למסמך
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: '#605E5C' }}>שמור כל</span>
          <input
            type="number"
            min="1"
            max="60"
            value={prefs.autoSaveMinutes || 10}
            onChange={(e) => setFlag('autoSaveMinutes', Math.max(1, Number(e.target.value) || 10))}
            style={{ width: 90, padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12 }}
          />
          <span style={{ fontSize: 12, color: '#605E5C' }}>דקות</span>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#323130' }}>
          <input type="checkbox" checked={prefs.showStartExperience !== false} onChange={(e) => setFlag('showStartExperience', e.target.checked)} />
          הצג את מסך הבית בעת הפתיחה
        </label>
      </div>
    </div>
  );
}

function SkillsSettings({ skillsState, setSkillsState }) {
  const skills = getSkillCatalog();
  const updateMode = (skillId, mode) => setSkillsState((prev) => ({
    ...prev,
    skills: {
      ...(prev.skills || {}),
      [skillId]: {
        ...(prev.skills?.[skillId] || {}),
        mode,
      },
    },
  }));
  const updateSkillField = (skillId, field, value) => setSkillsState((prev) => ({
    ...prev,
    skills: {
      ...(prev.skills || {}),
      [skillId]: {
        ...(prev.skills?.[skillId] || {}),
        [field]: value,
      },
    },
  }));
  const resetSkill = (skillId) => setSkillsState((prev) => ({
    ...prev,
    skills: {
      ...(prev.skills || {}),
      [skillId]: {
        mode: skillId === 'style-guardian' ? 'auto' : 'manual',
        customInstruction: '',
        customKeywords: [],
      },
    },
  }));

  return (
    <div>
      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 8 }}>שליטה מלאה בסקילים</div>
        <div style={{ fontSize: 11, color: '#605E5C', lineHeight: 1.6, marginBottom: 10 }}>
          כאן בוחרים איזה סקיל יפעל אוטומטית, איזה יישאר ידני בלבד, ואיך כל סקיל ידבר ויעבוד בדיוק בדרך שמתאימה לך.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4 }}>סקיל ברירת מחדל</div>
            <select
              value={skillsState.defaultSkillId || 'style-guardian'}
              onChange={(e) => setSkillsState((prev) => ({ ...prev, defaultSkillId: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, background: 'white' }}
            >
              {skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.label}</option>)}
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#323130', alignSelf: 'end', marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={skillsState.autoApplyDefault === true}
              onChange={(e) => setSkillsState((prev) => ({ ...prev, autoApplyDefault: e.target.checked }))}
            />
            החל אוטומטית את ברירת המחדל
          </label>
        </div>
        <div style={{ fontSize: 10, color: '#64748B' }}>טיפ: אם אתה רוצה שליטה גבוהה, השאר את הסקילים על מצב ידני והפעל אותם דרך / בחלונית ה-AI.</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {skills.map((skill) => {
          const mode = skillsState.skills?.[skill.id]?.mode || 'manual';
          const customInstruction = String(skillsState.skills?.[skill.id]?.customInstruction || '');
          const customKeywords = Array.isArray(skillsState.skills?.[skill.id]?.customKeywords)
            ? skillsState.skills?.[skill.id]?.customKeywords.join(', ')
            : String(skillsState.skills?.[skill.id]?.customKeywords || '');
          return (
            <div key={skill.id} style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start', marginBottom: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 4 }}>{skill.label}</div>
                  <div style={{ fontSize: 11, color: '#605E5C', lineHeight: 1.6 }}>{skill.description}</div>
                  <div style={{ fontSize: 10, color: '#64748B', marginTop: 4 }}>מתאים במיוחד ל: {skill.usageHint}</div>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4 }}>טריגרים קיימים: {(skill.keywords || []).slice(0, 5).join(' • ')}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={mode}
                    onChange={(e) => updateMode(skill.id, e.target.value)}
                    style={{ width: 138, padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, background: 'white', flexShrink: 0 }}
                  >
                    <option value="manual">ידני בלבד</option>
                    <option value="auto">אוטומטי כשמתאים</option>
                    <option value="off">כבוי</option>
                  </select>
                  <button type="button" onClick={() => resetSkill(skill.id)} style={{ border: '1px solid #CBD5E1', background: '#F8FAFC', color: '#334155', borderRadius: 8, padding: '8px 10px', fontSize: 11, cursor: 'pointer' }}>
                    אפס התאמה
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>איך אתה רוצה שהסקיל יעבוד?</div>
                  <textarea
                    value={customInstruction}
                    onChange={(e) => updateSkillField(skill.id, 'customInstruction', e.target.value)}
                    rows={4}
                    placeholder="למשל: תמיד תהיה תמציתי, אל תמציא מקורות, תכתוב עם כותרות קצרות, שמור על טון אקדמי רגוע"
                    style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>מילות זיהוי שאתה רוצה להוסיף</div>
                  <textarea
                    value={customKeywords}
                    onChange={(e) => updateSkillField(skill.id, 'customKeywords', e.target.value)}
                    rows={4}
                    placeholder="מופרדות בפסיקים, למשל: עבודה, מאמר, מבוא, סיכום"
                    style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical' }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GuideSettings({ activeTab = 'guide', onNavigate = () => {} }) {
  const [memorySnapshot, setMemorySnapshot] = useState(() => getAppMemory());
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const guidedTourSteps = [
    {
      id: 'home',
      eyebrow: 'שלב 1 · מסך הבית',
      title: 'כאן מתחילים כל מסמך חדש',
      description: 'מסך הבית הוא נקודת הכניסה: בוחרים נושא, תבנית, טיוטת בסיס, חומרי עזר והנחיות. אם אין צורך בצוות סוכנים, אפשר לעבוד ישירות כבר מכאן.',
      bullets: [
        'שדה הנושא העליון הוא brief קצר בלבד, וההנחיות למטה הן המקור המחייב.',
        'אפשר לבחור טיוטת בסיס כדי לעדכן מסמך קיים במקום להתחיל מאפס.',
        'אפשר להוסיף חומרי עזר, קובץ הנחיות וסביבת עבודה עוד לפני שמריצים את היצירה.',
      ],
      actions: [],
    },
    {
      id: 'direct',
      eyebrow: 'שלב 2 · מסלול ישיר',
      title: 'ללא סביבת עבודה = ספק ומודל ישירים',
      description: 'כשבוחרים "ללא סביבת עבודה", הבקשה לא עוברת דרך צוות סוכנים. היא נשלחת ישירות לספק והמודל שבחרת במסך הבית.',
      bullets: [
        'המסלול הזה טוב לטיוטות מהירות, ניסוחים נקודתיים ועבודה חופשית בלי workflow כבד.',
        'הבורר של ספק AI ומודל במסך הבית שולט בדיוק על המסלול הזה.',
        'אם המטרה שלך פשוטה או דחופה, לרוב זה המסלול המהיר ביותר.',
      ],
      actions: [
        { label: 'פתח מנועי AI', tab: 'ai' },
      ],
    },
    {
      id: 'workspaces',
      eyebrow: 'שלב 3 · סביבות עבודה',
      title: 'כשצריך צוות, בוחרים workspace מתאים',
      description: 'סביבת עבודה מפעילה workflow מוכן מראש: אילו סוכנים רצים, באיזה סדר, ואיזה סוג תוצר המערכת מנסה להחזיר.',
      bullets: [
        'בחר workspace לפי סוג המשימה, לא לפי ספק בלבד.',
        'אם צריך יותר שליטה, אפשר לפתוח את טאב הסוכנים ולערוך את ה-workspace.',
        'הסביבות החדשות מכסות אקדמי, מחקר, מוצר, משפטי, ליטוש והגשה, ותוכן שיווקי.',
      ],
      actions: [
        { label: 'פתח ניהול סוכנים', tab: 'agents' },
      ],
    },
    {
      id: 'chat',
      eyebrow: 'שלב 4 · חלונית AI',
      title: 'מפה ממשיכים בשיחה רציפה',
      description: 'חלונית ה-AI מיועדת לעבודה שוטפת על המסמך: שכתוב, קיצור, הרחבה, בדיקות, ורצף איטרציות עד שהתוצאה יושבת נכון.',
      bullets: [
        'כותבים בקשה חופשית כשלא צריך שליטה מיוחדת.',
        'משתמשים ב-@ כדי לבחור סוכן תפקיד ייעודי.',
        'משתמשים ב-/ כדי להפעיל skill ממוקד כמו academic-structure או source-hunter.',
      ],
      actions: [
        { label: 'פתח הגדרות עוזר', tab: 'assistant' },
      ],
    },
    {
      id: 'skills',
      eyebrow: 'שלב 5 · שליטה מדויקת',
      title: 'סקילים, prompts וסוכנים',
      description: 'אם אתה רוצה לקבע צורת עבודה מסוימת, זה האזור שבו מגדירים איך המערכת חושבת: skills, prompts משותפים, וסדר הריצה של הצוות.',
      bullets: [
        'טאב הסקילים מתאים ליכולות ממוקדות כמו מחקר, שלד אקדמי, או הגשה סופית.',
        'טאב Prompt מתאים להנחיות רוחביות שחוזרות כמעט בכל הרצה.',
        'טאב הסוכנים מתאים כשצריך לשנות סדר, תפקידים, timeouts או אוטופיילוט.',
      ],
      actions: [
        { label: 'פתח סקילים', tab: 'skills' },
        { label: 'פתח Prompt', tab: 'prompt' },
        { label: 'פתח סוכנים', tab: 'agents' },
      ],
    },
    {
      id: 'style',
      eyebrow: 'שלב 6 · התאמה אישית',
      title: 'מלמדים את המערכת איך אתה כותב',
      description: 'המערכת יכולה ללמוד העדפות כתיבה, טון, דוגמאות זהב, חומרי לימוד וסגנון אישי, כדי שלא תצטרך לחזור על אותן הנחיות בכל פעם.',
      bullets: [
        'טאב פרופיל והגשה מרכז את ה-onboarding, רקע, תפקידי שימוש והשלמת הגשה.',
        'טאב סגנון אישי מיועד להעדפות כתיבה, דוגמאות, ביטויים ולמידה מחומרים.',
        'כשאתה מצרף חומרים אישיים, עדיף להסביר בקצרה למה הם משמשים: סגנון, תוכן, או מבנה.',
      ],
      actions: [
        { label: 'פתח פרופיל והגשה', tab: 'onboarding' },
        { label: 'פתח סגנון אישי', tab: 'personal' },
      ],
    },
    {
      id: 'finish',
      eyebrow: 'שלב 7 · לפני מסירה',
      title: 'ליטוש, עיצוב וייצוא',
      description: 'בסוף התהליך עוברים על כתיבה, גופנים, מראה, ליטוש והגשה, ואז מייצאים ל-DOCX או ממשיכים לעוד איטרציה אחת קצרה.',
      bullets: [
        'טאב כתיבה מרכז ברירות מחדל כמו גופנים, גדלים והעדפות מסמך.',
        'טאב מראה מתאים להתאמות ויזואליות של הממשק.',
        'אם הטיוטה כבר כתובה, סביבת העבודה "ליטוש והגשה סופית" היא מסלול ייעודי לסגירה לפני מסירה.',
      ],
      actions: [
        { label: 'פתח כתיבה', tab: 'writing' },
        { label: 'פתח מראה', tab: 'appearance' },
      ],
    },
  ];
  const quickRoutes = [
    { title: 'חיבור ספק AI', text: 'להגדיר API key, לבחור מודל ולבדוק חיבור לפני שמתחילים.', tab: 'ai' },
    { title: 'בחירת סביבה', text: 'לערוך סוכנים, workflow ואוטופיילוט של סביבות העבודה.', tab: 'agents' },
    { title: 'התאמת סגנון אישי', text: 'ללמד את המערכת העדפות כתיבה, טון ודוגמאות זהב.', tab: 'personal' },
    { title: 'אוןבורדינג והגשה', text: 'להשלים פרופיל, רקע אקדמי ומסלול הגשה מסודר.', tab: 'onboarding' },
  ];
  const workspaceShowcase = [
    { workspaceId: '__no-workspace__', title: 'ללא סביבת עבודה', bestFor: 'טיוטה מהירה, שאלה נקודתית או ניסוח ישיר', note: 'המסלול הישיר של ספק+מודל מהמסך הראשי, בלי צוות סוכנים.' },
    { workspaceId: 'default-content-studio', title: 'סטודיו תוכן', bestFor: 'עבודה כללית, מסמכים, סיכומים וטיוטות', note: 'ברירת המחדל הגמישה כשרוצים להתחיל בלי לחשוב יותר מדי.' },
    { workspaceId: 'default-system-research-heavy', title: 'מחקר מערכת כבד', bestFor: 'משימות מורכבות עם מחקר רחב, אקדמי וחזותי', note: 'המסלול הכי עשיר לבקשות שדורשות עומק, בדיקה וסבבים.' },
    { workspaceId: 'default-system-research-light', title: 'מחקר מערכת קל', bestFor: 'מחקר מהיר יותר עם פחות עלות וזמן', note: 'שומר על מבנה מחקרי אבל בגרסה חסכונית יותר.' },
    { workspaceId: 'default-academic-lab', title: 'כתיבה אקדמית מהירה', bestFor: 'עבודות, סמינרים וסיכומים בלי מסלול מחקר כבד', note: 'טוב כשצריך מבנה אקדמי וליטוש, בלי orchestration עמוס.' },
    { workspaceId: 'default-academic-verified', title: 'אקדמי מאומת ומבוסס מקורות', bestFor: 'עבודה אקדמית עם הפניות ומקורות כמוקד מרכזי', note: 'מסלול קשיח יותר שמפריד בין מחקר אקדמי למחקר משלים.' },
    { workspaceId: 'default-product-desk', title: 'מוצר, אפיון ושיווק', bestFor: 'PRD, אפיון, מסמכי מוצר ורעיונות עסקיים', note: 'מתמקד במבנה, בהירות ותיעדוף עסקי.' },
    { workspaceId: 'default-legal-contracts', title: 'משפטי וחוזים', bestFor: 'נהלים, חוזים, מכתבים רשמיים וניסוח זהיר', note: 'שומר על מבנה משפטי ברור ומצמצם ניסוחים עמומים.' },
    { workspaceId: 'default-final-polish', title: 'ליטוש והגשה סופית', bestFor: 'מסמך כמעט גמור שצריך מעבר סופי לפני מסירה', note: 'מסלול קצר של מבנה, ניסוח, בדיקת הגשה ושער סופי.' },
    { workspaceId: 'default-social-content', title: 'תוכן שיווקי לרשתות', bestFor: 'פוסטים, קרוסלות, מודעות ו-CTA מהירים', note: 'מיועד למסרים קצרים, hooks ותוכן מותאם פלטפורמה.' },
  ].filter((item) => item.workspaceId === '__no-workspace__' || Boolean(DEFAULT_WORKSPACES_LIBRARY[item.workspaceId]));
  const demoPrompts = [
    { title: 'שכתוב מהיר', text: 'שכתב את הפסקה הזאת בצורה טבעית וברורה יותר' },
    { title: 'הפעלת סוכן', text: '@writer נסח לי פתיח קצר ומקצועי למייל הזה' },
    { title: 'הפעלת סקיל', text: '/academic-structure בנה לי שלד לעבודה על מנהיגות דיגיטלית' },
    { title: 'מקורות מחקר', text: '/source-hunter תן לי מילות חיפוש ל-Google Scholar על חרדת מבחנים' },
  ];
  const activeStep = guidedTourSteps[activeStepIndex] || guidedTourSteps[0];

  const resetSavedMemory = () => {
    clearAppMemory();
    try {
      clearSidebarChatHistory({ clearAll: true });
    } catch {}
    setMemorySnapshot(getAppMemory());
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ border: '1px solid #C7D2FE', borderRadius: 20, padding: '18px 18px 16px', background: 'linear-gradient(135deg, #EEF2FF 0%, #F8FAFC 45%, #ECFEFF 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#4338CA', marginBottom: 6, letterSpacing: '0.08em' }}>GUIDED TOUR</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginBottom: 6 }}>סיור מודרך ב-WordFlow AI</div>
            <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.8, maxWidth: 760 }}>
              במקום מדריך סטטי, הטאב הזה מוביל אותך שלב-שלב דרך המסך הראשי, הסביבות, הספקים, הסקילים וההגדרות. אפשר להתקדם בסדר, או לקפוץ ישר לאזור הרלוונטי.
            </div>
          </div>
          <div style={{ minWidth: 180, padding: '12px 14px', borderRadius: 16, background: 'rgba(255,255,255,0.8)', border: '1px solid #DBEAFE' }}>
            <div style={{ fontSize: 11, color: '#6366F1', fontWeight: 700, marginBottom: 6 }}>התקדמות בסיור</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#1E293B' }}>{activeStepIndex + 1}<span style={{ fontSize: 15, color: '#64748B' }}> / {guidedTourSteps.length}</span></div>
            <div style={{ marginTop: 10, height: 8, borderRadius: 999, background: '#E2E8F0', overflow: 'hidden' }}>
              <div style={{ width: `${((activeStepIndex + 1) / guidedTourSteps.length) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #4F46E5 0%, #06B6D4 100%)' }} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          {guidedTourSteps.map((step, index) => {
            const selected = index === activeStepIndex;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStepIndex(index)}
                style={{
                  border: selected ? '1px solid #4F46E5' : '1px solid #CBD5E1',
                  background: selected ? '#EEF2FF' : 'rgba(255,255,255,0.75)',
                  color: selected ? '#312E81' : '#334155',
                  borderRadius: 999,
                  padding: '8px 12px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {index + 1}. {step.title}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ border: '1px solid #E2E8F0', borderRadius: 20, padding: '16px', background: 'white' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#0284C7', marginBottom: 6, letterSpacing: '0.08em' }}>מתחילים כאן</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>מילון מושגים למתחילים</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 14, background: '#F8FAFC', padding: '11px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', marginBottom: 5 }}>מה זה Agent?</div>
            <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.7 }}>Agent הוא עוזר עם תפקיד מוגדר מראש, למשל כתיבה, מחקר או ליטוש. במקום בקשה כללית אחת, כל Agent מטפל בחלק אחר של המשימה.</div>
          </div>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 14, background: '#F8FAFC', padding: '11px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', marginBottom: 5 }}>מה זה API key?</div>
            <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.7 }}>API key הוא מפתח גישה אישי לספק ה-AI שלך. האפליקציה משתמשת בו כדי להתחבר לחשבון שלך ולהפעיל מודלים.</div>
          </div>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 14, background: '#F8FAFC', padding: '11px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', marginBottom: 5 }}>מה זה Provider?</div>
            <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.7 }}>Provider הוא ספק השירות שמריץ את מודל ה-AI בפועל, כמו Gemini או OpenAI. אפשר לבחור ספק אחר לפי מהירות, מחיר וסוג המשימה.</div>
          </div>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 14, background: '#F8FAFC', padding: '11px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', marginBottom: 5 }}>Direct mode מול Workspace/Workflow mode</div>
            <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.7 }}>ב-Direct mode הבקשה נשלחת ישירות למודל שבחרת. ב-Workspace/Workflow mode המערכת מפעילה תהליך מסודר עם כמה סוכנים ותפקידים.</div>
          </div>
        </div>
        <div style={{ border: '1px solid #DBEAFE', borderRadius: 14, background: '#EFF6FF', padding: '10px 12px', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1E3A8A', marginBottom: 4 }}>מתי לבחור "ללא סביבת עבודה"?</div>
          <div style={{ fontSize: 11, color: '#1E40AF', lineHeight: 1.7 }}>כשרוצים תשובה מהירה, ניסוח נקודתי או טיוטה קצרה בלי תהליך מורכב. אם המשימה גדולה או דורשת מבנה מחקרי, עדיף לבחור סביבת עבודה.</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[
            { label: 'הגדרת AI וספקים', tab: 'ai' },
            { label: 'ניהול Agents ו-Workflow', tab: 'agents' },
            { label: 'הגדרות Assistant', tab: 'assistant' },
          ].map((action) => {
            const selected = action.tab === activeTab;
            return (
              <button
                key={`beginner-${action.tab}`}
                type="button"
                onClick={() => onNavigate(action.tab)}
                style={{
                  border: selected ? '1px solid #1D4ED8' : '1px solid #BFDBFE',
                  background: selected ? '#DBEAFE' : '#EFF6FF',
                  color: selected ? '#1E3A8A' : '#1D4ED8',
                  borderRadius: 12,
                  padding: '8px 11px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {selected ? `פתוח עכשיו: ${action.label}` : action.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.45fr 1fr', gap: 14 }}>
        <div style={{ border: '1px solid #E2E8F0', borderRadius: 20, padding: '18px', background: 'white' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#0284C7', marginBottom: 6, letterSpacing: '0.08em' }}>{activeStep.eyebrow}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>{activeStep.title}</div>
          <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.8, marginBottom: 14 }}>{activeStep.description}</div>
          <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
            {activeStep.bullets.map((item) => (
              <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, borderRadius: 12, background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '10px 12px' }}>
                <span style={{ color: '#4F46E5', fontWeight: 900, lineHeight: 1.5 }}>•</span>
                <span style={{ fontSize: 12, color: '#334155', lineHeight: 1.75 }}>{item}</span>
              </div>
            ))}
          </div>

          {activeStep.actions.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {activeStep.actions.map((action) => {
                const selected = action.tab === activeTab;
                return (
                  <button
                    key={`${activeStep.id}-${action.tab}`}
                    type="button"
                    onClick={() => onNavigate(action.tab)}
                    style={{
                      border: selected ? '1px solid #1D4ED8' : '1px solid #BFDBFE',
                      background: selected ? '#DBEAFE' : '#EFF6FF',
                      color: selected ? '#1E3A8A' : '#1D4ED8',
                      borderRadius: 12,
                      padding: '9px 12px',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {selected ? `פתוח עכשיו: ${action.label}` : action.label}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setActiveStepIndex((prev) => Math.max(0, prev - 1))}
              disabled={activeStepIndex === 0}
              style={{ border: '1px solid #CBD5E1', background: activeStepIndex === 0 ? '#F8FAFC' : 'white', color: activeStepIndex === 0 ? '#94A3B8' : '#334155', borderRadius: 12, padding: '9px 12px', fontSize: 11, fontWeight: 700, cursor: activeStepIndex === 0 ? 'not-allowed' : 'pointer' }}
            >
              השלב הקודם
            </button>
            <button
              type="button"
              onClick={() => setActiveStepIndex((prev) => Math.min(guidedTourSteps.length - 1, prev + 1))}
              disabled={activeStepIndex === guidedTourSteps.length - 1}
              style={{ border: '1px solid #0EA5E9', background: activeStepIndex === guidedTourSteps.length - 1 ? '#E2E8F0' : '#0EA5E9', color: activeStepIndex === guidedTourSteps.length - 1 ? '#64748B' : 'white', borderRadius: 12, padding: '9px 12px', fontSize: 11, fontWeight: 700, cursor: activeStepIndex === guidedTourSteps.length - 1 ? 'not-allowed' : 'pointer' }}
            >
              השלב הבא
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 20, padding: '16px', background: 'white' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 10 }}>קפיצה מהירה להגדרות</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {quickRoutes.map((route) => (
                <button
                  key={route.tab}
                  type="button"
                  onClick={() => onNavigate(route.tab)}
                  style={{ textAlign: 'right', border: '1px solid #E2E8F0', background: route.tab === activeTab ? '#EEF2FF' : '#F8FAFC', borderRadius: 14, padding: '11px 12px', cursor: 'pointer' }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>{route.title}</div>
                  <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.6 }}>{route.text}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ border: '1px solid #E2E8F0', borderRadius: 20, padding: '16px', background: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A' }}>זיכרון מתמשך</div>
              <button onClick={resetSavedMemory} style={{ border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', borderRadius: 10, padding: '7px 10px', fontSize: 11, cursor: 'pointer' }}>
                אפס זיכרון שמור
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.7, marginBottom: 10 }}>
              האפליקציה זוכרת מקומית שיחות אחרונות, סקילים והעדפות, כדי להמשיך מאותה נקודה במקום להתחיל מחדש בכל פתיחה.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 10, background: '#EEF2FF', color: '#3730A3', padding: '4px 8px', borderRadius: 999 }}>שיחות שמורות: {(memorySnapshot.recentChats || []).length}</span>
              <span style={{ fontSize: 10, background: '#ECFDF5', color: '#166534', padding: '4px 8px', borderRadius: 999 }}>תזכורות פעילות: {(memorySnapshot.memoryNotes || []).length}</span>
              <span style={{ fontSize: 10, background: '#F8FAFC', color: '#334155', padding: '4px 8px', borderRadius: 999 }}>סקיל אחרון: {memorySnapshot.lastSelectedSkillId || 'ללא'}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ border: '1px solid #E2E8F0', borderRadius: 20, padding: '16px', background: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>איזו סביבת עבודה מתאימה למה?</div>
            <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.6 }}>הבחירה צריכה להיות לפי סוג המשימה. הסביבות למטה מופיעות לך במסך הבית.</div>
          </div>
          <button type="button" onClick={() => onNavigate('agents')} style={{ border: '1px solid #CBD5E1', background: '#F8FAFC', color: '#334155', borderRadius: 12, padding: '8px 11px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            פתח ניהול workspaces
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          {workspaceShowcase.map((workspace) => (
            <div key={workspace.title} style={{ border: '1px solid #E2E8F0', borderRadius: 16, padding: '12px 13px', background: '#F8FAFC' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>{workspace.title}</div>
              <div style={{ fontSize: 11, color: '#1D4ED8', fontWeight: 700, marginBottom: 6 }}>מתאים ל: {workspace.bestFor}</div>
              <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.7 }}>{workspace.note}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ border: '1px solid #E2E8F0', borderRadius: 20, padding: '16px', background: 'white' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 10 }}>הדגמות מוכנות להעתקה לחלונית ה-AI</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          {demoPrompts.map((item) => (
            <div key={item.title} style={{ border: '1px solid #E2E8F0', borderRadius: 14, padding: '12px', background: '#F8FAFC' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 11, color: '#1E293B', lineHeight: 1.7, fontFamily: 'Consolas, monospace', background: 'white', border: '1px dashed #CBD5E1', borderRadius: 10, padding: '9px 10px' }}>
                {item.text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OnboardingTabContainer({ profile, setProfile, persistProfile = null, setProviderConfig = () => {}, onOpenAiSettings = () => {}, onOpenPersonalStyle = () => {}, onDismiss = () => {}, onSubmitExternalAnalysis = () => {}, externalAnalysisBusy = false, providerConfig = getProviderConfig() }) {
  const persistProfileState = persistProfile || setProfile;
  const updateField = (field, value) => setProfile(prev => applyManualProfileScalarFieldUpdate(prev, field, value));
  const updateList = (field, value) => setProfile(prev => applyProfileListFieldUpdate(prev, field, value));
  const [syllabusImport, setSyllabusImport] = useState({ status: 'idle', fileName: '', message: '', summary: '' });
  const markOnboardingComplete = () => persistProfileState((prev) => (
    prev.onboardingCompletedAt
      ? prev
      : {
          ...prev,
          onboardingCompletedAt: new Date().toISOString(),
          onboardingDismissedAt: '',
          onboardingSnoozedUntil: '',
          onboardingVersion: prev.onboardingVersion || 1,
        }
  ));
  const toggleStyle = (styleId) => setProfile((prev) => {
    const current = Array.isArray(prev.preferredHomeStyleIds) ? prev.preferredHomeStyleIds : [];
    const next = current.includes(styleId)
      ? current.filter((item) => item !== styleId)
      : [...current, styleId].slice(0, 4);
    return { ...prev, preferredHomeStyleIds: next.length ? next : [styleId] };
  });

  const trainingAnswers = profile.learningGameAnswers || {};
  const inferredExternalProviderId = deriveExternalAnalysisProviderId(providerConfig);
  const selectedExternalProviderId = String(profile.externalStyleAnalysisProvider || inferredExternalProviderId || providerConfig?.active || 'gemini').trim() || 'gemini';
  const [quickSetupProviderId, setQuickSetupProviderId] = useState(selectedExternalProviderId);
  const resolvedQuickSetupProviderId = String(quickSetupProviderId || selectedExternalProviderId || 'gemini').trim() || 'gemini';
  const externalAnalysisAvailability = getExternalAnalysisAvailability('', providerConfig);
  const externalAnalysisPreparationHint = getExternalAnalysisProviderHint(selectedExternalProviderId);
  const externalAnalysisPrompt = buildExternalStyleAnalysisPrompt({ providerId: selectedExternalProviderId, profile });
  const openRouterBaseUrl = normalizeProviderIdentity('https://openrouter.ai/api/v1');
  const CUSTOM_PROVIDER_PRESETS = {
    deepseek: {
      label: 'DeepSeek',
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      placeholder: 'sk-...',
      helpText: 'הדבקה כאן תגדיר אוטומטית את DeepSeek בתוך Custom עם ה-endpoint והמודל הראשוני.',
      acceptsKey: true,
    },
    mistral: {
      label: 'Mistral',
      name: 'Mistral AI',
      baseUrl: 'https://api.mistral.ai/v1',
      model: 'mistral-large-latest',
      placeholder: 'API key',
      helpText: 'הדבקה כאן תגדיר אוטומטית את Mistral בתוך Custom עם ה-endpoint והמודל הראשוני.',
      acceptsKey: true,
    },
    together: {
      label: 'Together.ai',
      name: 'Together.ai',
      baseUrl: 'https://api.together.xyz/v1',
      model: 'meta-llama/Llama-3-70b-chat-hf',
      placeholder: 'API key',
      helpText: 'הדבקה כאן תגדיר אוטומטית את Together.ai בתוך Custom עם ה-endpoint והמודל הראשוני.',
      acceptsKey: true,
    },
    openrouter: {
      label: 'OpenRouter',
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'openrouter/auto',
      placeholder: 'sk-or-v1-...',
      helpText: 'הדבקה כאן תגדיר אוטומטית את OpenRouter בתוך Custom עם ה-endpoint והמודל הראשוני.',
      acceptsKey: true,
    },
    xai: {
      label: 'xAI (Grok)',
      name: 'xAI (Grok)',
      baseUrl: 'https://api.x.ai/v1',
      model: 'grok-3-mini-beta',
      placeholder: 'API key',
      helpText: 'הדבקה כאן תגדיר אוטומטית את xAI בתוך Custom עם ה-endpoint והמודל הראשוני.',
      acceptsKey: true,
    },
    lmstudio: {
      label: 'LM Studio',
      name: 'LM Studio (מקומי)',
      baseUrl: 'http://localhost:1234/v1',
      model: 'loaded-model',
      placeholder: 'לא נדרש מפתח',
      helpText: 'ל-LM Studio לא נדרש מפתח. הבחירה כאן לא דורסת custom קיים; כדי להגדיר חיבור חדש פתח את מסך ה-AI ושמור שם את הכתובת והמודל.',
      acceptsKey: false,
    },
  };
  const customProviderMatchesPreset = (cfg, preset) => matchesMappedCustomPreset(cfg, preset);
  const isModelCompatibleWithCustomPreset = (presetId, modelValue = '') => {
    const cleanModel = String(modelValue || '').trim().toLowerCase();
    if (!cleanModel) return false;
    switch (presetId) {
      case 'deepseek':
        return cleanModel.startsWith('deepseek');
      case 'mistral':
        return cleanModel.includes('mistral');
      case 'together':
          return /(llama|qwen|mixtral|mistral|gemma|deepseek|dbrx|wizardlm|nous)/.test(cleanModel);
      case 'openrouter':
      case 'lmstudio':
        return true;
      case 'xai':
        return cleanModel.startsWith('grok');
      default:
        return false;
    }
  };
  const prioritizeQuickSetupRuntimeProvider = (cfg, providerId) => {
    const normalizedProviderId = String(providerId || '').trim();
    if (!normalizedProviderId) return cfg;

    const runtimeProviderId = CUSTOM_PROVIDER_PRESETS[normalizedProviderId] || normalizedProviderId === 'custom'
      ? 'custom'
      : normalizedProviderId;
    const currentProviders = Array.isArray(cfg?.activeProviders) && cfg.activeProviders.length
      ? cfg.activeProviders
      : [cfg?.active];

    return {
      ...cfg,
      active: runtimeProviderId,
      activeProviders: [
        runtimeProviderId,
        ...Array.from(new Set(currentProviders.filter(Boolean))).filter((providerItemId) => providerItemId !== runtimeProviderId),
      ],
    };
  };
  const syncQuickSetupRuntimeProvider = (providerId, configUpdater = null) => {
    const normalizedProviderId = String(providerId || '').trim();
    if (!normalizedProviderId) return;

    setProviderConfig((prev) => {
      const nextConfig = typeof configUpdater === 'function' ? configUpdater(prev) : prev;
      return prioritizeQuickSetupRuntimeProvider(nextConfig, normalizedProviderId);
    });
    setProfile((prev) => {
      if (String(prev.externalStyleAnalysisProvider || '').trim() === normalizedProviderId) return prev;
      return {
        ...prev,
        externalStyleAnalysisProvider: normalizedProviderId,
      };
    });
  };
  const customPreset = CUSTOM_PROVIDER_PRESETS[resolvedQuickSetupProviderId] || null;
  const customLooksLikeSelectedPreset = customProviderMatchesPreset(providerConfig, customPreset);
  const quickProviderSetup = (() => {
    switch (resolvedQuickSetupProviderId) {
      case 'gemini':
        return { label: 'Gemini', keyValue: providerConfig?.gemini?.key || '', placeholder: 'AIza...', helpText: 'אפשר להדביק כאן את המפתח, והוא יישמר ישירות ל-Gemini.', acceptsKey: true };
      case 'openai':
        return { label: 'OpenAI', keyValue: providerConfig?.openai?.key || '', placeholder: 'sk-...', helpText: 'אפשר להדביק כאן את המפתח, והוא יישמר ישירות ל-OpenAI.', acceptsKey: true };
      case 'claude':
        return { label: 'Claude', keyValue: providerConfig?.claude?.key || '', placeholder: 'sk-ant-...', helpText: 'אפשר להדביק כאן את המפתח, והוא יישמר ישירות ל-Claude.', acceptsKey: true };
      case 'groq':
        return { label: 'Groq', keyValue: providerConfig?.groq?.key || '', placeholder: 'gsk_...', helpText: 'אפשר להדביק כאן את המפתח, והוא יישמר ישירות ל-Groq.', acceptsKey: true };
      case 'perplexity':
        return { label: 'Perplexity', keyValue: providerConfig?.perplexity?.key || '', placeholder: 'pplx-...', helpText: 'אפשר להדביק כאן את המפתח, והוא יישמר ישירות ל-Perplexity.', acceptsKey: true };
      case 'deepseek':
      case 'mistral':
      case 'together':
      case 'openrouter':
      case 'xai':
      case 'lmstudio':
        return { ...customPreset, keyValue: customLooksLikeSelectedPreset ? (providerConfig?.custom?.key || '') : '' };
      case 'ollama':
        return { label: 'Ollama', keyValue: '', placeholder: 'לא נדרש מפתח', helpText: 'ל-Ollama מקומי לא נדרש מפתח. מספיק להפעיל את השרת המקומי ולוודא שהמודל טעון.', acceptsKey: false };
      case 'custom':
        return { label: 'ספק מותאם', keyValue: providerConfig?.custom?.key || '', placeholder: 'API key', helpText: 'אפשר להדביק כאן את המפתח. אם צריך גם Base URL או מודל, פתח אחר כך את הגדרות ה-AI.', acceptsKey: true };
      default:
        return { label: 'ספק חיצוני', keyValue: '', placeholder: 'API key', helpText: 'לספק הזה אין שדה הדבקה מהיר כאן. אפשר לעבור להגדרות ה-AI המלאות.', acceptsKey: false };
    }
  })();

  const updateQuickProviderKey = (value) => {
    const nextValue = String(value || '');
    if (customPreset?.acceptsKey) {
      const applyCustomPresetConfig = (prev) => ({
        ...prev,
        custom: {
          ...prev.custom,
          name: customPreset.name,
          baseUrl: customPreset.baseUrl,
          model: customProviderMatchesPreset(prev, customPreset) && isModelCompatibleWithCustomPreset(resolvedQuickSetupProviderId, prev.custom?.model)
            ? (prev.custom?.model || customPreset.model)
            : customPreset.model,
          key: nextValue,
        },
      });

      if (nextValue.trim()) {
        syncQuickSetupRuntimeProvider(resolvedQuickSetupProviderId, applyCustomPresetConfig);
      } else {
        setProviderConfig(applyCustomPresetConfig);
      }
      return;
    }

    if (resolvedQuickSetupProviderId === 'custom') {
      const applyCustomKey = (prev) => ({
        ...prev,
        custom: {
          ...prev.custom,
          key: nextValue,
        },
      });

      if (nextValue.trim()) {
        syncQuickSetupRuntimeProvider(resolvedQuickSetupProviderId, applyCustomKey);
      } else {
        setProviderConfig(applyCustomKey);
      }
      return;
    }

    if (!['gemini', 'openai', 'claude', 'groq', 'perplexity'].includes(resolvedQuickSetupProviderId)) return;
    const applyBuiltinProviderKey = (prev) => ({
      ...prev,
      [resolvedQuickSetupProviderId]: {
        ...prev[resolvedQuickSetupProviderId],
        key: nextValue,
      },
    });

    if (nextValue.trim()) {
      syncQuickSetupRuntimeProvider(resolvedQuickSetupProviderId, applyBuiltinProviderKey);
    } else {
      setProviderConfig(applyBuiltinProviderKey);
    }
  };

  const selectLearningOption = (questionId, optionId) => {
    setProfile((prev) => ({
      ...prev,
      ...buildLearningGameProfilePatch({ ...(prev.learningGameAnswers || {}), [questionId]: optionId })
    }));
  };

  const resetLearningGame = () => {
    if (confirm('האם אתה בטוח שברצונך לאפס את הלמידה?')) {
      setProfile((prev) => ({
        ...prev,
        learningGameAnswers: {},
        learningGameInsights: [],
        learningGamesCompletedAt: '',
        styleTrainingSummary: '',
        preferredTrainingExamples: [],
        dislikedStylePatterns: [],
      }));
    }
  };

  const updateExternalAnalysisRaw = (value) => setProfile((prev) => {
    const nextRaw = String(value || '');
    const rawChanged = String(prev.externalStyleAnalysisRaw || '').trim() !== nextRaw.trim();
    return {
      ...prev,
      externalStyleAnalysisRaw: nextRaw,
      externalStyleAnalysisStatus: rawChanged ? '' : prev.externalStyleAnalysisStatus,
      externalStyleAnalysisProcessedAt: rawChanged ? '' : prev.externalStyleAnalysisProcessedAt,
      externalStyleAnalysisLastError: rawChanged ? '' : prev.externalStyleAnalysisLastError,
      externalStyleAnalysisPendingAt: rawChanged ? '' : (nextRaw.trim() ? prev.externalStyleAnalysisPendingAt : ''),
    };
  });

  const formatSyllabusImportError = (error) => {
    const code = String(error?.message || '').trim();
    if (code === 'unsupported-binary-file') return 'הקובץ לא נתמך בסביבה הזו. אפשר להעלות docx, txt, md, html או pdf, ובגרסת desktop גם Excel ותמונות עם OCR.';
    if (code === 'empty-pdf-text') return 'לא הצלחתי לחלץ טקסט קריא מתוך קובץ ה-PDF.';
    if (code === 'empty-docx-text') return 'לא הצלחתי לחלץ טקסט קריא מתוך קובץ ה-DOCX.';
    if (code === 'empty-spreadsheet-text' || code === 'spreadsheet-read-failed') return 'לא הצלחתי לחלץ טקסט קריא מתוך קובץ ה-Excel.';
    if (code === 'empty-image-text' || code === 'image-ocr-failed') return 'לא הצלחתי לחלץ טקסט קריא מתוך התמונה באמצעות OCR.';
    if (code === 'empty-file-text') return 'לא נמצא טקסט קריא בתוך הקובץ שנבחר.';
    return 'לא הצלחתי לקרוא את קובץ הסילבוס.';
  };

  const handleSyllabusImport = async (file) => {
    if (!file) return;

    setSyllabusImport({
      status: 'reading',
      fileName: String(file.name || '').trim(),
      message: 'קורא את קובץ הסילבוס...',
      summary: '',
    });

    try {
      const extractedText = await readInstructionFile(file, 48000);
      if (!String(extractedText || '').trim()) throw new Error('empty-file-text');

      setSyllabusImport((prev) => ({
        ...prev,
        status: 'processing',
        message: externalAnalysisAvailability.hasLocalProvider
          ? `ממפה פרטי קורס בעזרת ${externalAnalysisAvailability.processingProviderLabel || 'AI'}...`
          : 'מזהה פרטים מרכזיים מתוך הסילבוס...',
      }));

      const result = await processSyllabusProfileImport({
        rawText: extractedText,
        fileName: file.name,
        profile,
        providerConfig,
      });
      const profilePatch = result?.profilePatch && typeof result.profilePatch === 'object' ? result.profilePatch : {};
      const hasPatch = Object.keys(profilePatch).length > 0;

      if (hasPatch) {
        persistProfileState((prev) => mergeSyllabusImportPatchIntoProfile(prev, profilePatch));
      }

      setSyllabusImport({
        status: String(result?.status || (hasPatch ? 'processed' : 'no-change')).trim() || 'no-change',
        fileName: String(file.name || '').trim(),
        message: hasPatch
          ? (result?.status === 'processed'
            ? 'הסילבוס נותח והפרופיל עודכן אוטומטית.'
            : 'זוהו פרטים מרכזיים מהסילבוס והם נוספו לפרופיל.')
          : (result?.error || 'לא נמצאו שדות חדשים למילוי מתוך הסילבוס.'),
        summary: String(result?.extractedSummary || '').trim(),
      });
    } catch (error) {
      setSyllabusImport({
        status: 'error',
        fileName: String(file.name || '').trim(),
        message: formatSyllabusImportError(error),
        summary: '',
      });
    }
  };

  return (
    <ProfileOnboarding
      profile={profile}
      updateField={updateField}
      updateList={updateList}
      externalAnalysis={{
        selectedProviderId: selectedExternalProviderId,
        quickSetupProviderId: resolvedQuickSetupProviderId,
        preparationHint: externalAnalysisPreparationHint,
        promptText: externalAnalysisPrompt,
        hasLocalProvider: externalAnalysisAvailability.hasLocalProvider,
        processingProviderLabel: externalAnalysisAvailability.processingProviderLabel,
        status: String(profile.externalStyleAnalysisStatus || '').trim(),
        error: String(profile.externalStyleAnalysisLastError || '').trim(),
        isBusy: externalAnalysisBusy,
        quickProviderSetup,
      }}
      onExternalProviderChange={(value) => updateField('externalStyleAnalysisProvider', value)}
      onQuickProviderChange={(value) => {
        setQuickSetupProviderId(value);

        if (value === 'ollama') {
          syncQuickSetupRuntimeProvider(value);
          return;
        }

        if (value === 'lmstudio') {
          const lmStudioPreset = CUSTOM_PROVIDER_PRESETS.lmstudio;
          if (customProviderMatchesPreset(providerConfig, lmStudioPreset)) {
            syncQuickSetupRuntimeProvider(value);
          }
          return;
        }
      }}
      onExternalAnalysisRawChange={updateExternalAnalysisRaw}
      onQuickProviderKeyChange={updateQuickProviderKey}
      onSubmitExternalAnalysis={onSubmitExternalAnalysis}
      STYLE_TRAINING_QUESTIONS={STYLE_TRAINING_QUESTIONS}
      STYLE_PRESET_OPTIONS={STYLE_PRESET_OPTIONS}
      trainingAnswers={trainingAnswers}
      selectLearningOption={selectLearningOption}
      toggleStyle={toggleStyle}
      resetLearningGame={resetLearningGame}
      onOpenAiSettings={onOpenAiSettings}
      onOpenPersonalStyle={onOpenPersonalStyle}
      syllabusImport={syllabusImport}
      onImportSyllabusFile={handleSyllabusImport}
      onComplete={markOnboardingComplete}
      onDismiss={onDismiss}
    />
  );
}

function PersonalStyleSettings({ profile, setProfile }) {
  const updateField = (field, value) => setProfile(prev => applyManualProfileScalarFieldUpdate(prev, field, value));
  const updateList = (field, value) => setProfile(prev => applyProfileListFieldUpdate(prev, field, value));
  const toggleStyle = (styleId) => setProfile((prev) => {
    const current = Array.isArray(prev.preferredHomeStyleIds) ? prev.preferredHomeStyleIds : [];
    const next = current.includes(styleId)
      ? current.filter((item) => item !== styleId)
      : [...current, styleId].slice(0, 4);
    return { ...prev, preferredHomeStyleIds: next.length ? next : [styleId] };
  });
  const onboardingDone = Boolean(profile.onboardingCompletedAt);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [recentMaterials, setRecentMaterials] = useState([]);
  const [lastUploadedMaterials, setLastUploadedMaterials] = useState([]);
  const [uploadKind, setUploadKind] = useState('writing-sample');
  const fileInputRef = useRef(null);
  const currentCoursesInput = useDelimitedListInput(profile.currentCourses, (value) => updateList('currentCourses', value));
  const lecturerNamesInput = useDelimitedListInput(getLecturerNamesFromProfile(profile), (value) => updateList('lecturerNames', value));
  const syllabusTopicsInput = useDelimitedListInput(profile.syllabusTopics, (value) => updateList('syllabusTopics', value));
  const manualVocabularyInput = useDelimitedListInput(profile.manualVocabulary, (value) => updateList('manualVocabulary', value));
  const protectedVocabularyInput = useDelimitedListInput(profile.protectedVocabulary, (value) => updateList('protectedVocabulary', value));
  const manualPhrasesInput = useDelimitedListInput(profile.manualPhrases, (value) => updateList('manualPhrases', value));
  const preferredSentenceStructuresInput = useDelimitedListInput(profile.preferredSentenceStructures, (value) => updateList('preferredSentenceStructures', value));
  const tonePreferencesInput = useDelimitedListInput(profile.tonePreferences, (value) => updateList('tonePreferences', value));

  const handleResetProfile = () => {
    if (!confirm('לאפס רק את העדפות הפרופיל, נתוני ההיכרות והלמידה השמורה בפרופיל? חומרי מקור מקומיים, עבודות עבר והיסטוריית הלמידה המקומית לא יימחקו.')) return;
    savePersonalStyleProfile(DEFAULT_PERSONAL_STYLE);
    setProfile(getPersonalStyleProfile());
  };

  useEffect(() => {
    loadProjectMaterials().then((items) => setRecentMaterials(items.slice(0, 4))).catch(() => {});
  }, []);

  const handleUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const selectedUploadMeta = getMaterialUploadMeta(uploadKind);
      const uploadedIds = [];
      for (const file of files) {
        const result = await saveHelperMaterial(file, selectedUploadMeta);
        if (result?.entry?.id) uploadedIds.push(result.entry.id);
      }
      await syncLearnedStyleFromWorkspace();
      setProfile(getPersonalStyleProfile());
      const items = await loadProjectMaterials();
      setRecentMaterials(items.slice(0, 4));
      const uploadedMaterials = uploadedIds.length ? items.filter((item) => uploadedIds.includes(item.id)) : [];
      setLastUploadedMaterials(uploadedMaterials);
      const problematicUploads = uploadedMaterials
        .map((item) => ({ item, info: getMaterialExtractionStatusInfo(item) }))
        .filter(({ info }) => info.status !== 'success');
      if (problematicUploads.length) {
        window.alert([
          'חלק מהקבצים נשמרו אבל לא נקראו במלואם:',
          ...problematicUploads.map(({ item, info }) => `- ${item.title}: ${info.message}`),
        ].join('\n'));
      }
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await syncLearnedStyleFromWorkspace();
      setProfile(getPersonalStyleProfile());
      const items = await loadProjectMaterials();
      setRecentMaterials(items.slice(0, 4));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: '#605E5C', marginBottom: 16 }}>
        הקובץ האישי שלך מחובר עכשיו לעוזר, כך שהוא יכתוב בהתאם לרמה, למונחים ולהעדפות שלך.
      </p>

      <div style={{ border: '1px solid #DBEAFE', borderRadius: 12, padding: '14px', background: onboardingDone ? '#F8FBFF' : '#FFF7ED', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: '#1E3A8A', fontWeight: 700, marginBottom: 6 }}>היכרות אישית עם הסוכן</div>
        <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.6 }}>
          {onboardingDone
            ? 'ההיכרות הושלמה. הסוכן מתאים את עצמו אליך ויכול להמשיך ללמוד מהחומרים המקומיים שלך לאורך הזמן.'
            : 'עדיין לא בוצעה היכרות מלאה. אפשר למלא כאן את המידע הידני, או לפתוח את מסך הבית ולבצע היכרות מהירה.'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {profile.displayName ? <span style={{ fontSize: 10, background: '#FAE8FF', color: '#A21CAF', padding: '4px 8px', borderRadius: 999 }}>{profile.displayName}</span> : null}
            {profile.institutionName ? <span style={{ fontSize: 10, background: '#FEF3C7', color: '#92400E', padding: '4px 8px', borderRadius: 999 }}>{profile.institutionName}</span> : null}
            {profile.userBackground ? <span style={{ fontSize: 10, background: '#EFF6FF', color: '#1D4ED8', padding: '4px 8px', borderRadius: 999 }}>{profile.userBackground}</span> : null}
            {profile.defaultAudience ? <span style={{ fontSize: 10, background: '#F1F5F9', color: '#334155', padding: '4px 8px', borderRadius: 999 }}>קהל יעד: {profile.defaultAudience}</span> : null}
            {(profile.tonePreferences || []).slice(0, 4).map((tone) => (
              <span key={tone} style={{ fontSize: 10, background: '#EEF2FF', color: '#4338CA', padding: '4px 8px', borderRadius: 999 }}>{tone}</span>
            ))}
            <span style={{ fontSize: 10, background: profile.learningConsent === false ? '#FEF3C7' : '#DCFCE7', color: profile.learningConsent === false ? '#92400E' : '#166534', padding: '4px 8px', borderRadius: 999 }}>
              {profile.learningConsent === false ? 'למידה אוטומטית כבויה' : 'למידה אוטומטית פעילה'}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <button
              type="button"
              onClick={handleResetProfile}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #FCA5A5', background: 'white', color: '#B91C1C', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
            >
              אפס פרופיל בלבד
            </button>
            <div style={{ fontSize: 11, color: '#64748B' }}>מאפס העדפות, onboarding ולמידה שמורה בפרופיל בלבד. חומרי מקור והיסטוריית למידה מקומית נשארים כפי שהם.</div>
          </div>
        </div>
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 10 }}>פרופיל היכרות</div>

        <input
          value={profile.displayName || ''}
          onChange={(e) => updateField('displayName', e.target.value)}
          placeholder="שם או איך תרצה שהסוכן יקרא לך"
          style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, marginBottom: 8 }}
        />

        <input
          value={profile.institutionName || ''}
          onChange={(e) => updateField('institutionName', e.target.value)}
          placeholder="מוסד לימודים, ארגון או מקום עבודה"
          style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, marginBottom: 8 }}
        />

        <input
          value={profile.studyTrack || ''}
          onChange={(e) => updateField('studyTrack', e.target.value)}
          placeholder="חוג, מסלול, התמחות או תחום מרכזי"
          style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, marginBottom: 8 }}
        />

        <input
          value={profile.userRole || ''}
          onChange={(e) => updateField('userRole', e.target.value)}
          placeholder="סטטוס או תפקיד, למשל: סטודנט, מרצה, מנהל"
          style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, marginBottom: 8 }}
        />

        <textarea
          {...currentCoursesInput}
          placeholder="קורסים, שיעורים או נושאים פעילים כרגע"
          rows={2}
          style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
        />

        <textarea
          {...lecturerNamesInput}
          placeholder="מרצים או מנחים קבועים. אפשר להפריד בפסיק או שורה חדשה"
          rows={2}
          style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
        />

        <textarea
          {...syllabusTopicsInput}
          placeholder="נושאי סילבוס, יחידות לימוד או דגשים חוזרים. אפשר להפריד בפסיק או שורה חדשה"
          rows={2}
          style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
        />

        <textarea
          value={profile.userBackground || ''}
          onChange={(e) => updateField('userBackground', e.target.value)}
          placeholder="מי אתה ככותב או באיזה הקשר אתה בדרך כלל כותב"
          rows={2}
          style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
        />

        <textarea
          value={profile.writingGoals || ''}
          onChange={(e) => updateField('writingGoals', e.target.value)}
          placeholder="מטרות הכתיבה שלך, למשל: עבודה אקדמית מדויקת, ניסוח עסקי חד, סיכומים קצרים"
          rows={3}
          style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
        />

        <textarea
          value={profile.defaultAudience || ''}
          onChange={(e) => updateField('defaultAudience', e.target.value)}
          placeholder="מי קהל היעד הטיפוסי שלך"
          rows={2}
          style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
        />

        <textarea
          value={profile.formatPreferences || ''}
          onChange={(e) => updateField('formatPreferences', e.target.value)}
          placeholder="איך אתה מעדיף שהטקסט ייראה: קצר, מובנה, עם סעיפים, מפורט, וכדומה"
          rows={2}
          style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
        />

        <textarea
          value={profile.additionalContext || ''}
          onChange={(e) => updateField('additionalContext', e.target.value)}
          placeholder="כל פרט נוסף שיעזור לסוכן להכיר אותך ולהתאים את התשובות"
          rows={2}
          style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
        />

        <div style={{ borderTop: '1px solid #E5E7EB', marginTop: 10, paddingTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 10 }}>התאמת סגנונות אישית</div>

          <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 6 }}>סגנונות מועדפים במסך הבית</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {STYLE_PRESET_OPTIONS.map((style) => {
              const active = (profile.preferredHomeStyleIds || []).includes(style.id);
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => toggleStyle(style.id)}
                  style={{ padding: '6px 10px', borderRadius: 999, border: `1px solid ${active ? '#1D4ED8' : '#CBD5E1'}`, background: active ? '#DBEAFE' : 'white', color: active ? '#1D4ED8' : '#334155', cursor: 'pointer', fontSize: 12 }}
                >
                  {style.label}
                </button>
              );
            })}
          </div>

          <select
            value={profile.defaultDocumentStyle || 'academic'}
            onChange={(e) => updateField('defaultDocumentStyle', e.target.value)}
            style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, marginBottom: 8, background: 'white' }}
          >
            {STYLE_PRESET_OPTIONS.map((style) => <option key={style.id} value={style.id}>ברירת מחדל: {style.label}</option>)}
          </select>

          <select
            value={profile.sentenceLengthPreference || 'מאוזן'}
            onChange={(e) => updateField('sentenceLengthPreference', e.target.value)}
            style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, marginBottom: 8, background: 'white' }}
          >
            <option value="קצר">משפטים קצרים</option>
            <option value="מאוזן">משפטים מאוזנים</option>
            <option value="מעמיק">משפטים מעמיקים</option>
          </select>

          <select
            value={profile.paragraphLengthPreference || 'בינוני'}
            onChange={(e) => updateField('paragraphLengthPreference', e.target.value)}
            style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, marginBottom: 8, background: 'white' }}
          >
            <option value="תמציתי">פסקאות קצרות</option>
            <option value="בינוני">פסקאות בינוניות</option>
            <option value="מפורט">פסקאות מפורטות</option>
          </select>

          <textarea
            value={profile.customStyleGuidance || ''}
            onChange={(e) => updateField('customStyleGuidance', e.target.value)}
            placeholder="חוקים אישיים לסגנון הכתיבה שלך"
            rows={2}
            style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
          />
        </div>

        <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.7, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '8px 10px', marginBottom: 10 }}>
          סקיל הסגנון הקיים משתמש עכשיו גם בלמידה אוטומטית מהרקע. כשהאפשרות פעילה, האפליקציה לומדת מקומית מהמסמך הפעיל ומהתיקונים שלך לאורך הזמן.
          {profile.autoLearnedFromEditorAt ? <div style={{ marginTop: 4, color: '#64748B' }}>עודכן לאחרונה: {new Date(profile.autoLearnedFromEditorAt).toLocaleString('he-IL')}</div> : null}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#323130' }}>
          <input type="checkbox" checked={profile.learningConsent === true} onChange={(e) => updateField('learningConsent', e.target.checked)} />
          אפשר לסוכן להמשיך ללמוד מהמסמכים המקומיים שלי עם הזמן
        </label>
      </div>

      <div style={{ border: '1px solid #DBEAFE', borderRadius: 12, padding: '14px', background: '#F8FBFF', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 13, color: '#1E3A8A', fontWeight: 700 }}>העלה קבצים ללמידת סגנון</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={uploadKind}
              onChange={(e) => setUploadKind(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #C8C6C4', background: 'white', fontSize: 12 }}
            >
              {Object.values(MATERIAL_UPLOAD_PRESETS).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <button
              type="button"
              onClick={handleRefresh}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #86EFAC', background: 'white', color: '#166534', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
            >
              {refreshing ? 'מרענן...' : 'רענן סריקה'}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #93C5FD', background: 'white', color: '#1D4ED8', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
            >
              {uploading ? 'מעלה...' : 'העלה קבצים'}
            </button>
          </div>
          <input ref={fileInputRef} type="file" multiple accept={getHelperMaterialAcceptList()} style={{ display: 'none' }} onChange={handleUpload} />
        </div>
        <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.6 }}>
          אפשר לצרף עבודות קודמות, סיכומים, PDF, מצגות, דפי שער לדוגמה, תבניות מסמך או טיוטות. בחר את סוג הקובץ לפני ההעלאה כדי שהסוכן ילמד בדיוק ממה להשתמש.
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: '#334155', background: 'white', border: '1px solid #DBEAFE', borderRadius: 10, padding: '8px 10px' }}>
          נסרקו: {profile.scanStats?.totalScanned || 0} מתוך {profile.scanStats?.totalKnown || 0} • חדשים בריענון האחרון: {profile.scanStats?.newlyScanned || 0}
        </div>
        {lastUploadedMaterials.length ? (
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {lastUploadedMaterials.slice(0, 6).map((item) => {
              const extractionInfo = getMaterialExtractionStatusInfo(item);
              const successTone = extractionInfo.status === 'success';
              return (
                <span
                  key={`last-upload-${item.id}`}
                  title={`${item.title}\n${extractionInfo.message}`}
                  style={{
                    fontSize: 10,
                    background: successTone ? '#DCFCE7' : '#FEE2E2',
                    color: successTone ? '#166534' : '#B91C1C',
                    padding: '4px 8px',
                    borderRadius: 999,
                    border: `1px solid ${successTone ? '#86EFAC' : '#FCA5A5'}`,
                  }}
                >
                  {item.title} · {extractionInfo.label}
                </span>
              );
            })}
          </div>
        ) : null}
        {recentMaterials.length ? (
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {recentMaterials.map((item) => {
              const extractionInfo = getMaterialExtractionStatusInfo(item);
              const successTone = extractionInfo.status === 'success';
              return (
                <span
                  key={item.id}
                  title={`${item.title}\n${extractionInfo.message}`}
                  style={{
                    fontSize: 10,
                    background: successTone ? '#DCFCE7' : '#FEE2E2',
                    color: successTone ? '#166534' : '#B91C1C',
                    padding: '4px 8px',
                    borderRadius: 999,
                    border: `1px solid ${successTone ? '#86EFAC' : '#FCA5A5'}`,
                  }}
                >
                  {item.title}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4, fontWeight: 500 }}>רמה אקדמית</div>
        <select
          value={profile.academic_level || 'undergraduate'}
          onChange={(e) => updateField('academic_level', e.target.value)}
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, background: 'white' }}
        >
          <option value="school">בית ספר</option>
          <option value="undergraduate">תואר ראשון</option>
          <option value="graduate">תואר שני</option>
          <option value="doctoral">דוקטורט</option>
          <option value="professional">מקצועי</option>
        </select>
      </div>

      <textarea
        {...manualVocabularyInput}
        placeholder="מונחים שהעוזר יעדיף להשתמש בהם"
        rows={3}
        style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
      />

      <textarea
        {...protectedVocabularyInput}
        placeholder="מונחים שלא תרצה לשנות לעולם"
        rows={3}
        style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
      />

      <textarea
        {...manualPhrasesInput}
        placeholder="ביטויים אופייניים שתרצה לשלב"
        rows={3}
        style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
      />

      <textarea
        {...preferredSentenceStructuresInput}
        placeholder="מבני משפט מועדפים, למשל: מצד אחד... מצד שני, יתרה מזו, ניתן לראות כי"
        rows={3}
        style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
      />

      <textarea
        {...tonePreferencesInput}
        placeholder="טון כתיבה מועדף, למשל: ענייני, אקדמי, רהוט, ישיר"
        rows={2}
        style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
      />

      <textarea
        value={profile.paragraphPreferences || ''}
        onChange={(e) => updateField('paragraphPreferences', e.target.value)}
        placeholder="העדפות לפסקאות, למשל: פסקאות קצרות של 3–4 שורות, או פסקאות ארוכות ומעמיקות"
        rows={3}
        style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
      />

      <textarea
        value={profile.notes || ''}
        onChange={(e) => updateField('notes', e.target.value)}
        placeholder="הערות נוספות על הסגנון האישי שלך"
        rows={4}
        style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical' }}
      />

      <div style={{ marginTop: 12, border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px', background: '#F9FAFB' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#323130', marginBottom: 6 }}>מה נלמד אוטומטית מהקבצים</div>
        <div style={{ fontSize: 11, color: '#605E5C', lineHeight: 1.8 }}>
          מונחים בולטים: {(profile.learnedVocabulary || []).slice(0, 8).join(', ') || 'עדיין אין'}
          <br />
          פתיחות משפט: {(profile.preferredSentenceOpeners || []).slice(0, 4).join(', ') || 'עדיין אין'}
          <br />
          טון שנלמד: {(profile.toneDescriptors || []).slice(0, 4).join(', ') || 'עדיין אין'}
          <br />
          למידה ממשחקים: {(profile.learningGameInsights || []).slice(0, 4).join(' • ') || 'עדיין אין'}
        </div>
      </div>
    </div>
  );
}

function WorkspacesManager({ automation, setAutomation, onWorkspaceChange, setAgents, config }) {
  const [workspacesLib, setWorkspacesLib] = useState(getWorkspacesLibrary());
  const [showAdvancedCreate, setShowAdvancedCreate] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [lastSavedWorkspaceName, setLastSavedWorkspaceName] = useState('');
  const [previewWorkspaceId, setPreviewWorkspaceId] = useState('');
  const [editWorkspaceState, setEditWorkspaceState] = useState({ id: '', name: '', sharedGoal: '' });
  const [deepEditWorkspaceState, setDeepEditWorkspaceState] = useState({ id: '', automation: null, agents: [] });

  const refreshWorkspaceState = () => {
    const nextAutomation = getWorkspaceAutomation();
    const nextLibrary = getWorkspacesLibrary();
    setWorkspacesLib(nextLibrary);
    setAutomation((prev) => (JSON.stringify(prev) === JSON.stringify(nextAutomation) ? prev : nextAutomation));
    onWorkspaceChange?.();
    return nextLibrary;
  };

  const formatWorkflowLabel = (automation = {}) => {
    const workflowMode = String(automation?.workflowMode || '').trim();
    const autopilotEnabled = automation?.autopilotEnabled !== false;
    let baseLabel = workflowMode || 'ברירת מחדל';
    if (workflowMode === 'autopilot-full') baseLabel = 'AUTOPILOT מלא';
    if (workflowMode === 'manager-auto') baseLabel = 'AUTOPILOT דינמי';
    if (workflowMode === 'circular-team') baseLabel = 'צוות מעגלי';
    if (workflowMode === 'custom-order') baseLabel = 'סדר מותאם';
    if (workflowMode === 'manager-pipeline') baseLabel = 'Pipeline מנוהל';
    if (!autopilotEnabled) {
      if (workflowMode === 'autopilot-full' || workflowMode === 'manager-auto') {
        return 'סדר סוכנים מוגדר · Auto Pilot כבוי';
      }
      return `${baseLabel} · Auto Pilot כבוי`;
    }
    return baseLabel;
  };

  useEffect(() => {
    const syncLibrary = () => refreshWorkspaceState();

    if (typeof window === 'undefined') return undefined;
    window.addEventListener('wordai-workspace-changed', syncLibrary);
    return () => window.removeEventListener('wordai-workspace-changed', syncLibrary);
  }, [setAutomation, onWorkspaceChange]);

  const buildSimpleWorkspaceName = () => {
    const usedNames = new Set(
      Object.values(workspacesLib)
        .map((ws) => String(ws?.name || '').trim())
        .filter(Boolean)
    );

    if (!usedNames.has('סביבה חדשה')) return 'סביבה חדשה';
    let index = 2;
    while (usedNames.has(`סביבה חדשה ${index}`)) index += 1;
    return `סביבה חדשה ${index}`;
  };

  const getWorkspaceFallbackName = () => buildSimpleWorkspaceName();

  const createAndSwitchWorkspace = (useTypedName = true) => {
    const fallbackName = getWorkspaceFallbackName();
    const typedName = useTypedName ? String(newWorkspaceName ?? '') : '';
    const nextName = typedName.trim() ? typedName : fallbackName;
    const newId = createNewWorkspace(nextName, 'content-studio');
    const switched = switchToWorkspace(newId);
    if (!switched) {
      window.alert('הסביבה נוצרה, אבל לא הצלחתי לעבור אליה אוטומטית. נסה לבחור אותה מהרשימה.');
      return;
    }
    const nextLibrary = getWorkspacesLibrary();
    const savedWorkspaceName = String(nextLibrary?.[newId]?.name || nextName);
    setWorkspacesLib(nextLibrary);
    setAutomation(getWorkspaceAutomation());
    setLastSavedWorkspaceName(savedWorkspaceName);
    setNewWorkspaceName('');
    setShowAdvancedCreate(false);
    onWorkspaceChange?.();
  };

  const handleQuickCreateWorkspace = () => createAndSwitchWorkspace(false);

  const handleDeleteWorkspace = (workspaceId, workspaceName) => {
    const targetId = String(workspaceId || '').trim();
    if (!targetId || Object.prototype.hasOwnProperty.call(DEFAULT_WORKSPACES_LIBRARY, targetId)) return;
    if (!window.confirm(`למחוק את סביבת העבודה "${workspaceName || targetId}"?`)) return;
    const deleted = deleteWorkspace(targetId);
    if (!deleted) {
      window.alert('לא הצלחתי למחוק את סביבת העבודה.');
      return;
    }
    refreshWorkspaceState();
  };

  const savedWorkspaces = Object.values(workspacesLib || {})
    .filter((ws) => ws && typeof ws === 'object')
    .sort((a, b) => String(b?.lastModified || '').localeCompare(String(a?.lastModified || '')));

  const previewWorkspace = previewWorkspaceId ? workspacesLib?.[previewWorkspaceId] : null;
  const editingWorkspace = editWorkspaceState.id ? workspacesLib?.[editWorkspaceState.id] : null;
  const deepEditingWorkspace = deepEditWorkspaceState.id ? workspacesLib?.[deepEditWorkspaceState.id] : null;

  const openPreviewWorkspace = (workspace) => {
    setPreviewWorkspaceId(String(workspace?.id || ''));
  };

  const openEditWorkspace = (workspace) => {
    setEditWorkspaceState({
      id: String(workspace?.id || ''),
      name: String(workspace?.name || workspace?.automation?.workspaceName || '').trim(),
      sharedGoal: String(workspace?.automation?.sharedGoal || '').trim(),
    });
  };

  const closeEditWorkspace = () => setEditWorkspaceState({ id: '', name: '', sharedGoal: '' });

  const closeDeepWorkspaceEdit = () => setDeepEditWorkspaceState({ id: '', automation: null, agents: [] });

  const setDeepEditAutomation = (updater) => {
    setDeepEditWorkspaceState((prev) => {
      const currentAutomation = prev.automation && typeof prev.automation === 'object' ? prev.automation : {};
      const nextAutomation = typeof updater === 'function' ? updater(currentAutomation) : updater;
      return {
        ...prev,
        automation: nextAutomation && typeof nextAutomation === 'object' ? nextAutomation : currentAutomation,
      };
    });
  };

  const setDeepEditAgents = (updater) => {
    setDeepEditWorkspaceState((prev) => {
      const currentAgents = Array.isArray(prev.agents) ? prev.agents : [];
      const nextAgents = typeof updater === 'function' ? updater(currentAgents) : updater;
      return {
        ...prev,
        agents: Array.isArray(nextAgents) ? nextAgents : currentAgents,
      };
    });
  };

  const openDeepWorkspaceEdit = (workspaceInput) => {
    const resolvedWorkspace = typeof workspaceInput === 'string'
      ? workspacesLib?.[String(workspaceInput || '').trim()]
      : workspaceInput;
    const targetId = String(resolvedWorkspace?.id || '').trim();
    if (!targetId || !resolvedWorkspace) {
      window.alert('לא הצלחתי לפתוח את סביבת העבודה לעריכה.');
      return;
    }

    const workspaceName = String(resolvedWorkspace?.name || resolvedWorkspace?.automation?.workspaceName || targetId).trim() || targetId;
    setDeepEditWorkspaceState({
      id: targetId,
      automation: {
        ...(resolvedWorkspace?.automation || {}),
        activeWorkspaceId: targetId,
        workspaceName,
      },
      agents: Array.isArray(resolvedWorkspace?.agents) ? resolvedWorkspace.agents.map((agent) => ({ ...agent })) : [],
    });
    setPreviewWorkspaceId('');
    closeEditWorkspace();
  };

  const saveDeepWorkspaceEdit = () => {
    const targetId = String(deepEditWorkspaceState.id || '').trim();
    if (!targetId) return;

    const automationDraft = deepEditWorkspaceState.automation && typeof deepEditWorkspaceState.automation === 'object'
      ? deepEditWorkspaceState.automation
      : {};
    const nextName = String(automationDraft.workspaceName || deepEditingWorkspace?.name || '').trim();
    if (!nextName) {
      window.alert('צריך לתת שם לסביבת העבודה.');
      return;
    }

    const updated = updateWorkspaceById(targetId, {
      name: nextName,
      workspaceName: nextName,
      automation: {
        ...automationDraft,
        workspaceName: nextName,
      },
      agents: Array.isArray(deepEditWorkspaceState.agents) ? deepEditWorkspaceState.agents : [],
    });
    if (!updated) {
      window.alert('לא הצלחתי לשמור את העריכה המלאה של סביבת העבודה.');
      return;
    }

    refreshWorkspaceState();
    if (String(getWorkspaceAutomation().activeWorkspaceId || '').trim() === targetId) {
      setAgents(getRoleAgents());
      setAutomation(getWorkspaceAutomation());
    }
    closeDeepWorkspaceEdit();
  };

  const saveWorkspaceDetails = () => {
    const targetId = String(editWorkspaceState.id || '').trim();
    if (!targetId) return;
    const nextName = String(editWorkspaceState.name || '').trim();
    if (!nextName) {
      window.alert('צריך לתת שם לסביבת העבודה.');
      return;
    }
    const updated = updateWorkspaceById(targetId, {
      name: nextName,
      workspaceName: nextName,
      automation: {
        sharedGoal: String(editWorkspaceState.sharedGoal || '').trim(),
      },
    });
    if (!updated) {
      window.alert('לא הצלחתי לשמור את פרטי סביבת העבודה.');
      return;
    }
    refreshWorkspaceState();
    closeEditWorkspace();
  };

  return (
    <div style={{ marginBottom: 20, border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: '#F9FAFB' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginBottom: 12 }}>
        📦 יצירה ושמירה של סביבות עבודה
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.7 }}>
          כאן יוצרים סביבות עבודה ומגדירים להן סוכנים ישירות, בלי תלות בדף הבית.
        </div>
      </div>

      {lastSavedWorkspaceName ? (
        <div style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 8, border: '1px solid #BBF7D0', background: '#F0FDF4', color: '#166534', fontSize: 11 }}>
          נשמרה סביבת עבודה: <strong>{lastSavedWorkspaceName}</strong>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          onClick={handleQuickCreateWorkspace}
          aria-label="צור סביבת עבודה פשוטה חדשה"
          style={{
            flex: 1,
            padding: '10px 12px',
            background: '#10B981',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ⚡ צור סביבה פשוטה
        </button>
        <button
          onClick={() => setShowAdvancedCreate((prev) => !prev)}
          aria-label="הצג או הסתר יצירת סביבת עבודה מתקדמת"
          style={{
            flex: 1,
            padding: '10px 12px',
            background: '#3B82F6',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {showAdvancedCreate ? 'הסתר מתקדם' : 'יצירה מתקדמת'}
        </button>
      </div>

      {showAdvancedCreate && (
        <div style={{
          border: '1px solid #DBEAFE',
          borderRadius: 8,
          padding: '12px',
          background: '#F0F9FF',
          marginBottom: 12,
        }}>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 11, color: '#1E40AF', fontWeight: 600, marginBottom: 4 }}>
              שם הסביבה החדשה
            </label>
            <input
              aria-label="שם סביבת העבודה החדשה"
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              placeholder="למשל: צוות מחקר"
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #93C5FD',
                borderRadius: 6,
                fontSize: 12,
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  createAndSwitchWorkspace();
                }
              }}
            />
            <div style={{ marginTop: 6, fontSize: 10, color: '#475569' }}>
              שם בפועל: <strong>{String(newWorkspaceName ?? '').trim() ? String(newWorkspaceName ?? '') : getWorkspaceFallbackName()}</strong>
            </div>
          </div>

          <div style={{ marginBottom: 10, fontSize: 10, color: '#475569', lineHeight: 1.6 }}>
            הסביבה החדשה תיווצר עם הגדרות ברירת מחדל ותהפוך מיד לסביבה הפעילה לעריכת סוכנים.
          </div>

          <button
            onClick={() => createAndSwitchWorkspace()}
            style={{
              width: '100%',
              padding: '10px 12px',
              background: '#3B82F6',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ✅ צור סביבה
          </button>
        </div>
      )}

      <div style={{ marginBottom: 12, background: 'white', border: '1px solid #D1D5DB', borderRadius: 8, padding: '10px 12px' }}>
        <div style={{ fontSize: 12, color: '#374151', fontWeight: 700, marginBottom: 8 }}>
          סביבות שמורות ({savedWorkspaces.length})
        </div>
        <div style={{ display: 'grid', gap: 6, maxHeight: 170, overflow: 'auto' }}>
          {savedWorkspaces.map((ws) => (
              <div key={ws.id} style={{ fontSize: 11, color: '#4B5563', border: '1px solid #E5E7EB', borderRadius: 8, padding: '10px', background: '#F9FAFB' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <strong style={{ color: '#111827', display: 'block' }}>{ws.name || ws.id}</strong>
                    <div style={{ color: '#6B7280', marginTop: 4 }}>
                      {formatWorkflowLabel(ws?.automation)} · {(Array.isArray(ws?.agents) ? ws.agents.length : 0)} סוכנים
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      title="צפייה מהירה"
                      onClick={() => openPreviewWorkspace(ws)}
                      style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}
                    >
                      👁
                    </button>
                    <button
                      type="button"
                      title="עריכה בסיסית"
                      onClick={() => openEditWorkspace(ws)}
                      style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #DDD6FE', background: '#F5F3FF', color: '#6D28D9', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}
                    >
                      ✏️
                    </button>
                    {!Object.prototype.hasOwnProperty.call(DEFAULT_WORKSPACES_LIBRARY, String(ws.id || '')) ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteWorkspace(ws.id, ws.name)}
                        style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#B91C1C', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                      >
                        מחק
                      </button>
                    ) : null}
                  </div>
              </div>
              <div style={{ color: '#6B7280', marginTop: 4 }}>
                עודכנה: {new Date(ws.lastModified || Date.now()).toLocaleDateString('he-IL')}
              </div>
                {ws?.automation?.sharedGoal ? (
                  <div style={{ color: '#475569', marginTop: 6, lineHeight: 1.5 }}>
                    מטרה: {String(ws.automation.sharedGoal).slice(0, 80)}{String(ws.automation.sharedGoal).length > 80 ? '…' : ''}
                  </div>
                ) : null}
            </div>
          ))}
        </div>
      </div>

        {previewWorkspace ? (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1700, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ width: 'min(680px, 94vw)', background: 'white', borderRadius: 18, border: '1px solid #CBD5E1', boxShadow: '0 24px 64px rgba(15,23,42,0.28)', padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#0F172A' }}>{previewWorkspace.name || previewWorkspace.id}</div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>{formatWorkflowLabel(previewWorkspace?.automation)}</div>
                </div>
                <button type="button" onClick={() => setPreviewWorkspaceId('')} style={{ border: '1px solid #CBD5E1', background: 'white', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#334155' }}>סגור</button>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px 14px', background: '#F8FAFC' }}>
                  <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>שם</div>
                  <div style={{ fontSize: 13, color: '#111827', fontWeight: 700 }}>{previewWorkspace.name || previewWorkspace.id}</div>
                </div>

                <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px 14px', background: '#F8FAFC' }}>
                  <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>מטרה משותפת</div>
                  <div style={{ fontSize: 13, color: '#111827', lineHeight: 1.7 }}>{previewWorkspace?.automation?.sharedGoal || 'לא הוגדרה מטרה משותפת.'}</div>
                </div>

                <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px 14px', background: '#F8FAFC' }}>
                  <div style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>סוכנים בסביבה</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {(Array.isArray(previewWorkspace?.agents) ? previewWorkspace.agents : []).length ? (previewWorkspace.agents || []).map((agent) => (
                      <div key={`${previewWorkspace.id}-${agent.id}`} style={{ border: '1px solid #E2E8F0', borderRadius: 10, padding: '8px 10px', background: 'white' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{agent.name || agent.id}</div>
                        <div style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>{agent.provider || 'ברירת מחדל'}{agent.model ? ` · ${agent.model}` : ''}</div>
                      </div>
                    )) : <div style={{ fontSize: 12, color: '#64748B' }}>אין סוכנים שמורים בסביבה זו.</div>}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => openEditWorkspace(previewWorkspace)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #DDD6FE', background: '#F5F3FF', color: '#6D28D9', cursor: 'pointer', fontWeight: 700 }}>עריכה בסיסית</button>
                <button type="button" onClick={() => openDeepWorkspaceEdit(previewWorkspace)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', fontWeight: 700 }}>פתח עריכה מלאה</button>
              </div>
            </div>
          </div>
        ) : null}

        {editingWorkspace ? (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1700, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ width: 'min(620px, 94vw)', background: 'white', borderRadius: 18, border: '1px solid #CBD5E1', boxShadow: '0 24px 64px rgba(15,23,42,0.28)', padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#0F172A' }}>עריכה בסיסית של סביבת עבודה</div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>{editingWorkspace.name || editingWorkspace.id}</div>
                </div>
                <button type="button" onClick={closeEditWorkspace} style={{ border: '1px solid #CBD5E1', background: 'white', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#334155' }}>סגור</button>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>שם הסביבה</div>
                  <input
                    value={editWorkspaceState.name}
                    onChange={(e) => setEditWorkspaceState((prev) => ({ ...prev, name: e.target.value }))}
                    style={{ width: '100%', padding: '9px 10px', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 12 }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>מטרה משותפת</div>
                  <textarea
                    value={editWorkspaceState.sharedGoal}
                    onChange={(e) => setEditWorkspaceState((prev) => ({ ...prev, sharedGoal: e.target.value }))}
                    rows={5}
                    placeholder="למשל: לבנות טיוטות אקדמיות קצרות עם דגש על מקורות ומבנה ברור"
                    style={{ width: '100%', padding: '9px 10px', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 12, resize: 'vertical' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => openDeepWorkspaceEdit(editingWorkspace)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', fontWeight: 700 }}>פתח עריכה מלאה</button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={closeEditWorkspace} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #CBD5E1', background: 'white', color: '#334155', cursor: 'pointer', fontWeight: 700 }}>ביטול</button>
                  <button type="button" onClick={saveWorkspaceDetails} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #16A34A', background: '#16A34A', color: 'white', cursor: 'pointer', fontWeight: 700 }}>שמור שינויים</button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {deepEditingWorkspace ? (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1710, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ width: 'min(1040px, 96vw)', maxHeight: '92vh', background: 'white', borderRadius: 20, border: '1px solid #CBD5E1', boxShadow: '0 28px 72px rgba(15,23,42,0.32)', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#0F172A' }}>עריכה מלאה של סביבת עבודה</div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>{deepEditWorkspaceState.automation?.workspaceName || deepEditingWorkspace.name || deepEditingWorkspace.id}</div>
                </div>
                <button type="button" onClick={closeDeepWorkspaceEdit} style={{ border: '1px solid #CBD5E1', background: 'white', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#334155' }}>סגור</button>
              </div>

              <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.7 }}>
                העריכה כאן נפתחת בפופאפ ייעודי ונשמרת רק בלחיצה על "שמור סביבת עבודה".
              </div>

              <div style={{ overflow: 'auto', paddingRight: 4 }}>
                <RoleAgentsSettings
                  agents={Array.isArray(deepEditWorkspaceState.agents) ? deepEditWorkspaceState.agents : []}
                  setAgents={setDeepEditAgents}
                  automation={deepEditWorkspaceState.automation || {}}
                  setAutomation={setDeepEditAutomation}
                  config={config}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, color: '#64748B' }}>
                  השינויים בפופאפ הזה לא מחליפים את סביבת העבודה הפעילה עד לשמירה.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={closeDeepWorkspaceEdit} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #CBD5E1', background: 'white', color: '#334155', cursor: 'pointer', fontWeight: 700 }}>ביטול</button>
                  <button type="button" onClick={saveDeepWorkspaceEdit} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #16A34A', background: '#16A34A', color: 'white', cursor: 'pointer', fontWeight: 700 }}>שמור סביבת עבודה</button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

      <div style={{ fontSize: 11, color: '#6B7280', background: '#F3F4F6', padding: '10px', borderRadius: 6 }}>
        💡 <strong>טיפ:</strong> לחץ על <strong>עריכה מלאה</strong> בסביבה שמורה לעריכת הסוכנים שלה, או השתמש בהגדרות הסוכנים למטה לעריכת הסביבה הפעילה.
      </div>
    </div>
  );
}

function RoleAgentsSettings({ agents, setAgents, automation, setAutomation, config }) {
  const presets = getWorkspaceAgentPresets();
  const deprecatedPresetIds = new Set(['gemini-studio', 'claude-studio', 'perplexity-studio']);
  const managerIndex = agents.findIndex((agent) => /manager|מנהל/i.test(`${agent?.id || ''} ${agent?.name || ''}`));
  const managerAgent = managerIndex >= 0 ? agents[managerIndex] : null;
  const isManagerWorkflow = ['autopilot-full', 'manager-auto', 'circular-team'].includes(automation?.workflowMode);
  const isAutopilotManagerMode = isManagerWorkflow && automation?.autopilotEnabled !== false;
  const bypassActive = automation?.workspaceBypassEnabled === true;
  const visiblePresetEntries = Object.entries(presets).filter(([presetId]) => (
    !deprecatedPresetIds.has(presetId) || presetId === (automation?.preset || 'content-studio')
  ));
  const selectedWorkflowMode = automation?.workflowMode || 'manager-pipeline';
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState(automation?.workspaceName || '');

  useEffect(() => {
    setWorkspaceNameDraft(automation?.workspaceName || '');
  }, [automation?.activeWorkspaceId, automation?.workspaceName]);

  const commitWorkspaceNameDraft = () => {
    const nextName = String(workspaceNameDraft ?? '');
    if (!nextName.trim()) {
      setWorkspaceNameDraft(automation?.workspaceName || '');
      return;
    }
    if (nextName === String(automation?.workspaceName || '')) return;
    setAutomation((prev) => ({ ...prev, workspaceName: nextName }));
  };

  const updateAgent = (index, field, value) => {
    setAgents((prev) => prev.map((agent, i) => {
      if (i !== index) return agent;

      const nextAgent = { ...agent, [field]: value };
      if (field === 'provider' && !isProviderModelChoiceCompatible(String(value || '').trim(), agent?.model || '', config)) {
        nextAgent.model = '';
      }

      return nextAgent;
    }));
  };

  const applyPreset = () => {
    const nextPresetId = automation?.preset || 'content-studio';
    const preset = presets[nextPresetId];
    setAgents(buildWorkspaceAgentPreset(nextPresetId));
    if (preset?.automation) {
      setAutomation((prev) => ({
        ...prev,
        ...preset.automation,
        workspaceName: prev.workspaceName || 'סביבת עבודה מותאמת',
      }));
    }
  };

  const startCustomWorkspace = () => {
    setAutomation((prev) => ({
      ...prev,
      enabled: true,
      preset: 'custom-workspace',
      workflowMode: 'custom-order',
      workspaceName: prev.workspaceName || 'סביבת סוכנים מותאמת',
    }));
    if (!Array.isArray(agents) || agents.length === 0) {
      setAgents(buildWorkspaceAgentPreset('custom-workspace'));
    }
  };

  const addAgent = () => {
    setAgents(prev => ([
      ...prev,
      { id: `custom-${Date.now()}`, name: 'סוכן חדש', prompt: 'כתוב כאן את התפקיד וההנחיות של הסוכן.', provider: '', model: '', enabled: true },
    ]));
  };

  const moveAgent = (index, direction) => {
    setAgents((prev) => {
      const next = [...prev];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
    setAutomation((prev) => ({
      ...prev,
      preset: 'custom-workspace',
      workflowMode: 'custom-order',
      enabled: true,
    }));
  };

  const removeAgent = (index) => {
    setAgents((prev) => {
      const target = prev[index];
      if (isAutopilotManagerMode && /manager|מנהל/i.test(`${target?.id || ''} ${target?.name || ''}`)) {
        return prev;
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const updateManager = (field, value) => {
    if (managerIndex < 0) return;
    updateAgent(managerIndex, field, value);
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: '#605E5C', marginBottom: 10 }}>
        הוסף סוכני AI לפי תפקידים, וקבע לכל אחד מהם הוראות עבודה משלו.
      </p>

      <div style={{ border: '1px solid #D1FAE5', borderRadius: 12, padding: '10px 12px', background: '#F0FDF4', marginBottom: 10, fontSize: 11, color: '#166534', lineHeight: 1.7 }}>
        כאן בדיוק אפשר לשלב כמה מודלים יחד: בחר לכל סוכן ספק ומודל שונים, והמערכת תריץ אותם לפי סדר העבודה שהגדרת.
        אם משאירים את הספק ריק, האפליקציה יכולה לנתב את הסוכן אוטומטית בין הספקים שהוגדרו לפי החוזקות שלהם למחקר, ניהול, כתיבה וליטוש. אם בוחרים ספק אבל משאירים את המודל ריק, ייעשה שימוש במודל ברירת המחדל של אותו ספק.
      </div>

      {bypassActive ? (
        <div style={{ border: '1px solid #FDE68A', borderRadius: 12, padding: '10px 12px', background: '#FFFBEB', marginBottom: 10, fontSize: 11, color: '#92400E', lineHeight: 1.7 }}>
          כרגע מופעל מצב `ללא סביבת עבודה` מהמסך הראשי. ה-workspace נשמר ברקע, ושני המתגים של הפעלת סביבת העבודה הרב-סוכנית ושל הדילוג האוטומטי בין סוכנים מושעים זמנית כאן עד שתחזור לבחור סביבת עבודה פעילה במסך הבית. שאר ההגדרות בטאב הזה עדיין עורכות את ה-workspace שייטען מחדש כשתחזור אליו.
        </div>
      ) : null}

      <div style={{ border: `1px solid ${isAutopilotManagerMode ? '#BFDBFE' : '#DDD6FE'}`, borderRadius: 12, padding: '12px 14px', background: isAutopilotManagerMode ? '#F8FBFF' : '#F8F7FF', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: isAutopilotManagerMode ? '#1E3A8A' : '#6D28D9', marginBottom: 6 }}>
          חוקי ההכרעה הפעילים
        </div>
        <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.7 }}>
          {isAutopilotManagerMode
            ? automation?.workflowMode === 'autopilot-full'
              ? 'במצב הזה מתבצעת קריאת preflight: מנהל הצוות בוחר דינמית סוכנים, ספקים, מודלים, הנחיות שלב ומספר סבבים לפני ההרצה עצמה.'
              : 'במצב הזה כל סוכן מדווח מה הושלם ומה עדיין חסר, ומנהל הצוות הוא זה שמחליט על הצעד הבא.'
            : 'במצב הזה כל סוכן עדיין מדווח מה חסר, אבל ההמשך נקבע לפי כללים וסקילים פעילים ולא על ידי מנהל מרכזי.'}
        </div>
      </div>

      <div style={{ border: '1px solid #DBEAFE', borderRadius: 12, padding: '14px', background: '#F8FBFF', marginBottom: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: bypassActive ? '#94A3B8' : '#1E3A8A', fontWeight: 700, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={automation?.enabled !== false}
            disabled={bypassActive}
            onChange={(e) => setAutomation(prev => ({ ...prev, enabled: e.target.checked }))}
          />
          הפעל סביבת עבודה רב-סוכנית אוטומטית
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4, fontWeight: 500 }}>Preset</div>
            <select
              value={automation?.preset || 'content-studio'}
              onChange={(e) => setAutomation(prev => ({ ...prev, preset: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, background: 'white' }}
            >
              {visiblePresetEntries.map(([id, preset]) => (
                <option key={id} value={id}>{preset.label}</option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4, fontWeight: 500 }}>סדר עבודה</div>
            <select
              value={selectedWorkflowMode}
              onChange={(e) => {
                const nextMode = e.target.value;
                setAutomation(prev => ({
                  ...prev,
                  workflowMode: nextMode,
                  autopilotEnabled: ['autopilot-full', 'manager-auto'].includes(nextMode) ? true : prev.autopilotEnabled,
                  preset: nextMode === 'custom-order' ? 'custom-workspace' : prev.preset,
                  circularWorkflowEnabled: nextMode === 'circular-team' ? true : false,
                }));
                if (['autopilot-full', 'manager-auto', 'circular-team'].includes(nextMode)) {
                  setAgents((prev) => {
                    if (hasManagedWorkflowCoreTeam(prev)) return prev;
                    return mergeMissingManagedWorkflowRoles(prev, automation?.preset || 'content-studio');
                  });
                }
              }}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, background: 'white' }}
            >
              <option value="autopilot-full">אוטופיילוט מלא — preflight בוחר הכל</option>
              <option value="manager-auto">אוטופיילוט דינמי — מנהל בוחר סדר ותפקידים</option>
              <option value="circular-team">סביבה מעגלית — שיפור בסבבים</option>
              <option value="manager-pipeline">מצב רגיל — כללים וסקילים מובילים</option>
              <option value="design-first">מבנה קודם</option>
              <option value="research-first">חקר קודם</option>
              <option value="custom-order">סדר מותאם אישית</option>
            </select>
          </div>

          <button
            type="button"
            onClick={applyPreset}
            style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #93C5FD', background: 'white', color: '#1D4ED8', cursor: 'pointer', fontWeight: 600 }}
          >
            טען צוות מוכן
          </button>

          <button
            type="button"
            onClick={startCustomWorkspace}
            style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #C4B5FD', background: 'white', color: '#6D28D9', cursor: 'pointer', fontWeight: 600 }}
          >
            סביבה מותאמת
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4, fontWeight: 500 }}>שם סביבת העבודה</div>
            <input
              value={workspaceNameDraft}
              onChange={(e) => setWorkspaceNameDraft(e.target.value)}
              onBlur={commitWorkspaceNameDraft}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitWorkspaceNameDraft();
                }
              }}
              placeholder="למשל: צוות כתיבה אקדמי"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12 }}
            />
            <div style={{ marginTop: 4, fontSize: 10, color: '#64748B' }}>אפשר להקליד שם עם רווחים. השמירה מתבצעת ב-Enter או ביציאה מהשדה.</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4, fontWeight: 500 }}>Retry אוטומטי</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'white', border: '1px solid #C8C6C4', borderRadius: 6, padding: '8px 10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#323130' }}>
                <input
                  type="checkbox"
                  checked={automation?.retryEnabled !== false}
                  onChange={(e) => setAutomation(prev => ({ ...prev, retryEnabled: e.target.checked }))}
                />
                פעיל
              </label>
              <span style={{ fontSize: 12, color: '#605E5C' }}>עד</span>
              <input
                type="number"
                min="0"
                max="5"
                value={automation?.maxRetries ?? 2}
                onChange={(e) => setAutomation(prev => ({ ...prev, maxRetries: Math.max(0, Number(e.target.value) || 0) }))}
                style={{ width: 60, padding: '6px 8px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12 }}
              />
              <span style={{ fontSize: 12, color: '#605E5C' }}>ניסיונות</span>
            </div>
          </div>
        </div>

        {isManagerWorkflow && (
          <div style={{ marginTop: 10, fontSize: 11, color: '#1E3A8A', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '8px 10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 4 }}>
              <input
                type="checkbox"
                checked={automation?.autopilotEnabled !== false}
                onChange={(e) => setAutomation(prev => ({ ...prev, autopilotEnabled: e.target.checked }))}
              />
              הפעל תכנון דינמי של מנהל AI
            </label>
            {automation?.workflowMode === 'autopilot-full'
              ? 'כשהאפשרות פעילה, מנהל העבודה מבצע קריאת preflight ובוחר לבד מי צריך לעבוד, באיזה סדר, עם איזה ספק או מודל, אילו הנחיות stage-level נדרשות וכמה סבבים להקצות.'
              : 'כשהאפשרות פעילה, מנהל העבודה מחליט לבד מי צריך לעבוד, באיזה סדר, ואיזה תפקיד זמני יהיה לכל שלב.'}
            <div style={{ marginTop: 6, color: '#334155' }}>
              {automation?.workflowMode === 'autopilot-full'
                ? 'האלגוריתם לא חייב למחזר אותו pipeline לכל מטלה, ולכן הוא יכול גם לבחור מסלול קצר, עמוק או מרובה-בדיקות לפי סוג המשימה.'
                : 'במצב מעגלי, אם מתגלים פערים, הסוכן הכותב או סוכנים אחרים יכולים לחזור לעוד סבב שיפור.'}
            </div>
            {automation?.workflowMode === 'circular-team' && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={automation?.circularWorkflowEnabled === true}
                    onChange={(e) => setAutomation(prev => ({ ...prev, circularWorkflowEnabled: e.target.checked }))}
                  />
                  אפשר חזרה לסוכן קודם
                </label>
                <span style={{ color: '#605E5C' }}>מקסימום סבבים לכל סוכן</span>
                <input
                  type="number"
                  min="1"
                  max="4"
                  value={automation?.circularMaxRounds ?? 2}
                  onChange={(e) => setAutomation(prev => ({ ...prev, circularMaxRounds: Math.max(1, Math.min(4, Number(e.target.value) || 2)) }))}
                  style={{ width: 64, padding: '6px 8px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, background: 'white' }}
                />
              </div>
            )}
          </div>
        )}

        {automation?.workflowMode === 'custom-order' && (
          <div style={{ marginTop: 10, fontSize: 11, color: '#6D28D9', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: '8px 10px' }}>
            סדר העבודה נקבע לפי סדר הכרטיסים של הסוכנים למטה. אפשר להזיז כל סוכן למעלה או למטה.
          </div>
        )}

        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4, fontWeight: 500 }}>מטרה והנחיה משותפת לסביבת הסוכנים</div>
          <textarea
            value={automation?.sharedGoal || ''}
            onChange={(e) => setAutomation(prev => ({ ...prev, sharedGoal: e.target.value }))}
            placeholder="למשל: כתיבת עבודות אקדמיות בעברית, עם מבנה מסודר, מקורות, וליטוש סופי"
            rows={3}
            style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', background: 'white' }}
          />
        </div>

        <div style={{ marginTop: 10, border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 12px', background: '#FFFFFF' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#1E293B', fontWeight: 700, marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={automation?.appendAgentNotesToOutput === true}
              onChange={(e) => setAutomation(prev => ({ ...prev, appendAgentNotesToOutput: e.target.checked }))}
            />
            צרף בסוף המסמך נספח הערות סוכנים (כולל סיכום מנהל ואינדיקציה פנימית להגשה)
          </label>
          <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.7, marginBottom: 8 }}>
            כשפעיל, המסמך יקבל בסוף נספח שמרכז הערות לפי סוכן, המלצות מנהל עבודה והערכת היצמדות להנחיות.
          </div>
          <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4, fontWeight: 500 }}>הנחיה מותאמת להערות הסוכן בסוף העבודה</div>
          <textarea
            value={automation?.agentNotesInstruction || ''}
            onChange={(e) => setAutomation(prev => ({ ...prev, agentNotesInstruction: e.target.value }))}
            placeholder="למשל: ציין פערים מתודולוגיים, מה לתקן לפני הגשה, ומה נשמר מצוין לפי ההנחיות"
            rows={2}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 12, resize: 'vertical', background: 'white' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: bypassActive ? '#94A3B8' : '#323130' }}>
            <input
              type="checkbox"
              checked={automation?.autoDispatch !== false}
              disabled={bypassActive}
              onChange={(e) => setAutomation(prev => ({ ...prev, autoDispatch: e.target.checked }))}
            />
            הפעלה אוטומטית בין הסוכנים
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#323130' }}>
            <input
              type="checkbox"
              checked={automation?.showProgress !== false}
              onChange={(e) => setAutomation(prev => ({ ...prev, showProgress: e.target.checked }))}
            />
            הצג חיווי התקדמות וסטטוס חי
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#323130' }}>
            <input
              type="checkbox"
              checked={automation?.timeoutEnabled === true}
              onChange={(e) => setAutomation(prev => ({ ...prev, timeoutEnabled: e.target.checked }))}
            />
            הפעל timeout לסוכנים
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: automation?.timeoutEnabled === true ? '#323130' : '#94A3B8' }}>
              <span>Timeout</span>
              <input
                type="number"
                min="10000"
                max="300000"
                step="1000"
                disabled={automation?.timeoutEnabled !== true}
                value={automation?.requestTimeoutMs ?? 45000}
                onChange={(e) => setAutomation(prev => ({ ...prev, requestTimeoutMs: Math.max(10000, Number(e.target.value) || 45000) }))}
                style={{
                  width: 70,
                  padding: '6px 8px',
                  border: '1px solid #C8C6C4',
                  borderRadius: 6,
                  fontSize: 12,
                  background: automation?.timeoutEnabled === true ? 'white' : '#F8FAFC',
                  color: automation?.timeoutEnabled === true ? '#323130' : '#94A3B8',
                  opacity: automation?.timeoutEnabled === true ? 1 : 0.75,
                }}
              />
              <span>ms</span>
            </div>
            <div style={{ fontSize: 11, color: automation?.timeoutEnabled === true ? '#475569' : '#0F766E', lineHeight: 1.6 }}>
              {automation?.timeoutEnabled === true
                ? 'המערכת תעצור ריצת סוכנים ארוכה במיוחד לפי הערך שהוגדר במילישניות.'
                : 'כבוי כברירת מחדל. ריצות סוכנים ימשיכו ללא timeout אוטומטי.'}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 11, color: '#475569', lineHeight: 1.7 }}>
          אפשר לבנות כאן סביבת עבודה משלך: לבחור שם לסביבה, מטרה, להוסיף או למחוק סוכנים, ולהגדיר לכל סוכן מודל ותפקיד שונים. במצב AUTOPILOT המערכת גם תקבע לבד מי יעבוד, באיזה סדר, ומה יהיה התפקיד המעשי של כל שלב לפי ההנחיה והחומרים.
        </div>
      </div>

      {isAutopilotManagerMode && managerAgent && (
        <div style={{ border: '1px solid #BFDBFE', borderRadius: 12, padding: '14px', background: '#F8FBFF', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1E3A8A' }}>בקרת מנהל העבודה</div>
              <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>כאן בוחרים מהר את המנוע והמודל של מי שמנהל את כל תהליך ה-AUTOPILOT.</div>
            </div>
            <span style={{ fontSize: 10, background: '#DBEAFE', color: '#1D4ED8', padding: '4px 8px', borderRadius: 999, fontWeight: 700 }}>AUTOPILOT</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4, fontWeight: 500 }}>ספק למנהל</div>
              <select
                value={managerAgent.provider || ''}
                onChange={(e) => updateManager('provider', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, background: 'white' }}
              >
                <option value="">כמו הספק הפעיל</option>
                <option value="gemini" disabled={!isProviderConfigured(config, 'gemini')}>Gemini</option>
                <option value="openai" disabled={!isProviderConfigured(config, 'openai')}>OpenAI</option>
                <option value="claude" disabled={!isProviderConfigured(config, 'claude')}>Claude</option>
                <option value="groq" disabled={!isProviderConfigured(config, 'groq')}>Groq</option>
                <option value="perplexity" disabled={!isProviderConfigured(config, 'perplexity')}>Perplexity</option>
                <option value="ollama" disabled={!isProviderConfigured(config, 'ollama')}>Ollama</option>
                <option value="custom" disabled={!isProviderConfigured(config, 'custom')}>Custom</option>
              </select>
            </div>

            <div>
              <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4, fontWeight: 500 }}>מודל למנהל</div>
              <input
                value={managerAgent.model || ''}
                onChange={(e) => updateManager('model', e.target.value)}
                placeholder="למשל: gemini-2.5-pro או claude-sonnet-4-6"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, direction: 'ltr', background: 'white' }}
              />
            </div>
          </div>

          <div style={{ marginTop: 8, fontSize: 11, color: '#334155', lineHeight: 1.6 }}>
            ההנחיות המלאות של המנהל זמינות לעריכה בכרטיס שלו למטה, אבל בחירת המוח המנהל עכשיו הרבה יותר ישירה.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {agents.map((agent, index) => {
          const agentModelChoices = getProviderModelChoices(agent.provider, config, [agent.model]);
          return (
          <div key={agent.id || index} style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <span style={{ minWidth: 28, height: 28, borderRadius: 999, background: '#EEF4FF', color: '#2B579A', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                {index + 1}
              </span>
              <input
                value={agent.name || ''}
                onChange={(e) => updateAgent(index, 'name', e.target.value)}
                placeholder="שם סוכן"
                style={{ flex: 1, padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12 }}
              />
              <button
                type="button"
                disabled={index === 0}
                onClick={() => moveAgent(index, -1)}
                style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #BFDBFE', background: index === 0 ? '#F8FAFC' : '#EFF6FF', color: '#1D4ED8', cursor: index === 0 ? 'default' : 'pointer' }}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={index === agents.length - 1}
                onClick={() => moveAgent(index, 1)}
                style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #BFDBFE', background: index === agents.length - 1 ? '#F8FAFC' : '#EFF6FF', color: '#1D4ED8', cursor: index === agents.length - 1 ? 'default' : 'pointer' }}
              >
                ↓
              </button>
              <button
                onClick={() => removeAgent(index)}
                disabled={isAutopilotManagerMode && /manager|מנהל/i.test(`${agent.id || ''} ${agent.name || ''}`)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #FCA5A5',
                  background: (isAutopilotManagerMode && /manager|מנהל/i.test(`${agent.id || ''} ${agent.name || ''}`)) ? '#FFF5F5' : '#FEF2F2',
                  color: '#B91C1C',
                  cursor: (isAutopilotManagerMode && /manager|מנהל/i.test(`${agent.id || ''} ${agent.name || ''}`)) ? 'default' : 'pointer',
                  opacity: (isAutopilotManagerMode && /manager|מנהל/i.test(`${agent.id || ''} ${agent.name || ''}`)) ? 0.6 : 1,
                }}
              >
                מחק
              </button>
            </div>

            <textarea
              value={agent.prompt || ''}
              onChange={(e) => updateAgent(index, 'prompt', e.target.value)}
              placeholder="הנחיות לסוכן"
              rows={4}
              style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4, fontWeight: 500 }}>ספק מועדף</div>
                <select
                  value={agent.provider || ''}
                  onChange={(e) => updateAgent(index, 'provider', e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, background: 'white' }}
                >
                  <option value="">כמו הספק הפעיל</option>
                  <option value="gemini" disabled={!isProviderConfigured(config, 'gemini')}>Gemini</option>
                  <option value="openai" disabled={!isProviderConfigured(config, 'openai')}>OpenAI</option>
                  <option value="claude" disabled={!isProviderConfigured(config, 'claude')}>Claude</option>
                  <option value="groq" disabled={!isProviderConfigured(config, 'groq')}>Groq</option>
                  <option value="perplexity" disabled={!isProviderConfigured(config, 'perplexity')}>Perplexity</option>
                  <option value="ollama" disabled={!isProviderConfigured(config, 'ollama')}>Ollama</option>
                  <option value="scholar" disabled={!isProviderConfigured(config, 'scholar')}>Google Scholar</option>
                  <option value="custom" disabled={!isProviderConfigured(config, 'custom')}>Custom</option>
                </select>
              </div>

              <div>
                <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4, fontWeight: 500 }}>מודל מועדף לסוכן</div>
                <select
                  value={(agent.provider && agentModelChoices.includes(agent.model || '')) ? (agent.model || '') : ''}
                  onChange={(e) => updateAgent(index, 'model', e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, background: 'white', marginBottom: 6 }}
                >
                  <option value="">בחר מודל מהרשימה</option>
                  {agentModelChoices.map((modelName) => (
                    <option key={modelName} value={modelName}>{modelName}</option>
                  ))}
                </select>
                <input
                  value={agent.model || ''}
                  onChange={(e) => updateAgent(index, 'model', e.target.value)}
                  placeholder="אפשר גם להקליד ידנית: gemini-2.5-flash / gpt-4o / claude-sonnet-4-6"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, direction: 'ltr' }}
                />
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#323130' }}>
              <input
                type="checkbox"
                checked={agent.enabled !== false}
                onChange={(e) => updateAgent(index, 'enabled', e.target.checked)}
              />
              פעיל בחלונית ה-AI
            </label>
          </div>
          );
        })}
      </div>

      <button
        onClick={addAgent}
        style={{ marginTop: 14, padding: '9px 16px', borderRadius: 8, border: '1px dashed #93C5FD', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', fontWeight: 600 }}
      >
        + הוסף סוכן תפקידי
      </button>

      {isAutopilotManagerMode && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#475569', lineHeight: 1.6 }}>
          אפשר לערוך כאן חופשי את ההוראות והסדר. בזמן ריצה, מצב AUTOPILOT רשאי לסטות מהסדר אם מנהל העבודה מזהה צורך בכך.
        </div>
      )}
    </div>
  );
}

function UpdateSettings({ checkToken = 0, onCheckTokenConsumed = () => {} }) {
  const [updateInfo, setUpdateInfo] = useState({
    status: 'idle',
    message: 'מוכן לבדיקת עדכונים',
    currentVersion: '',
    availableVersion: '',
    percent: 0,
    isPackaged: false,
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dispose;

    const loadInfo = async () => {
      try {
        if (!window.desktopApp?.getAppUpdateInfo) {
          setUpdateInfo({ status: 'web', message: 'אפשרות זו זמינה רק באפליקציית שולחן העבודה', isPackaged: false });
          return;
        }
        const info = await window.desktopApp.getAppUpdateInfo();
        setUpdateInfo((prev) => ({ ...prev, ...(info || {}) }));
      } catch {}
    };

    loadInfo();
    if (window.desktopApp?.onAppUpdateStatus) {
      dispose = window.desktopApp.onAppUpdateStatus((payload) => {
        setUpdateInfo((prev) => ({ ...prev, ...(payload || {}) }));
      });
    }

    return () => dispose?.();
  }, []);

  const checkNow = async () => {
    if (!window.desktopApp?.checkForAppUpdates) return;
    setBusy(true);
    try {
      const result = await window.desktopApp.checkForAppUpdates();
      setUpdateInfo((prev) => ({ ...prev, ...(result || {}) }));
    } catch (error) {
      setUpdateInfo((prev) => ({ ...prev, status: 'error', message: error?.message || 'בדיקת העדכונים נכשלה' }));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!checkToken) return;
    onCheckTokenConsumed(checkToken);
    checkNow();
  }, [checkToken, onCheckTokenConsumed]);

  const installNow = async () => {
    if (!window.desktopApp?.installAppUpdate) return;
    setBusy(true);
    try {
      const result = await window.desktopApp.installAppUpdate();
      setUpdateInfo((prev) => ({ ...prev, ...(result || {}) }));
    } catch (error) {
      setUpdateInfo((prev) => ({ ...prev, status: 'error', message: error?.message || 'התקנת העדכון נכשלה' }));
    } finally {
      setBusy(false);
    }
  };

  const getStatusMeta = (state) => {
    if (state === 'downloaded') return { color: '#166534', bg: '#F0FDF4', border: '#BBF7D0', title: 'העדכון מוכן להתקנה' };
    if (state === 'downloading' || state === 'checking') return { color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE', title: 'העדכון בבדיקה/הורדה' };
    if (state === 'up-to-date') return { color: '#166534', bg: '#F0FDF4', border: '#BBF7D0', title: 'האפליקציה מעודכנת' };
    if (state === 'manual-download') return { color: '#92400E', bg: '#FFFBEB', border: '#FDE68A', title: 'נדרש עדכון ידני' };
    if (state === 'dev-mode' || state === 'web' || state === 'unavailable') return { color: '#92400E', bg: '#FFFBEB', border: '#FDE68A', title: 'עדכון לא זמין כרגע' };
    if (state === 'error') return { color: '#991B1B', bg: '#FEF2F2', border: '#FECACA', title: 'אירעה שגיאה בעדכון' };
    return { color: '#475569', bg: '#F8FAFC', border: '#CBD5E1', title: 'בדיקת עדכונים' };
  };

  const meta = getStatusMeta(updateInfo.status);

  return (
    <div>
      <p style={{ fontSize: 13, color: '#605E5C', marginBottom: 14, lineHeight: 1.7 }}>
        כאן אפשר לבדוק ידנית אם יש גרסה חדשה, ולהתקין אותה מתוך האפליקציה ברגע שהיא מוכנה.
      </p>

      <div style={{ border: `1px solid ${meta.border}`, background: meta.bg, borderRadius: 14, padding: '14px', marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: meta.color, marginBottom: 6 }}>{meta.title}</div>
        <div style={{ fontSize: 12, color: '#334155', marginBottom: 8 }}>{updateInfo.message || 'מוכן לבדיקת עדכונים'}</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: '#475569' }}>
          <span>גרסה נוכחית: {updateInfo.currentVersion || '—'}</span>
          {updateInfo.availableVersion && <span>גרסה זמינה: {updateInfo.availableVersion}</span>}
          {(updateInfo.status === 'downloading' || updateInfo.status === 'checking') && <span>התקדמות: {Math.round(Number(updateInfo.percent || 0))}%</span>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={checkNow}
          disabled={busy || updateInfo.status === 'checking' || updateInfo.status === 'downloading' || !window.desktopApp?.checkForAppUpdates}
          style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #93C5FD', background: (busy || updateInfo.status === 'checking' || updateInfo.status === 'downloading') ? '#E5E7EB' : '#EFF6FF', color: '#1D4ED8', cursor: (busy || updateInfo.status === 'checking' || updateInfo.status === 'downloading') ? 'default' : 'pointer', fontWeight: 700 }}
        >
          {busy ? 'בודק…' : 'בדוק אם יש עדכון'}
        </button>

        {updateInfo.status === 'downloaded' && (
          <button
            onClick={installNow}
            disabled={busy}
            style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #16A34A', background: '#16A34A', color: 'white', cursor: busy ? 'default' : 'pointer', fontWeight: 700 }}
          >
            התקן עכשיו
          </button>
        )}

        {updateInfo.status === 'manual-download' && (
          <button
            onClick={() => window.open('https://github.com/rotems4500-gif/wordai-new/releases', '_blank', 'noopener,noreferrer')}
            style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #D97706', background: '#FEF3C7', color: '#92400E', cursor: 'pointer', fontWeight: 700 }}
          >
            פתח עמוד הורדות
          </button>
        )}
      </div>
    </div>
  );
}

function DebugConsoleSettings({ automation }) {
  const activeWorkspaceId = automation?.activeWorkspaceId || 'default-content-studio';
  const [logs, setLogs] = useState(() => getAgentDebugLogs({ workspaceId: activeWorkspaceId, includeUnscoped: false }).slice(-120).reverse());
  const [summary, setSummary] = useState(() => getLatestAgentRunSummary(automation));

  const getAgentTitle = (log = {}) => {
    const primary = String(log.agentName || log.agentLabel || '').trim() || 'מערכת';
    const secondary = String(log.agentLabel || '').trim();
    if (secondary && secondary !== primary) return `${primary} · ${secondary}`;
    return primary;
  };

  useEffect(() => {
    const sync = () => {
      setLogs(getAgentDebugLogs({ workspaceId: activeWorkspaceId, includeUnscoped: false }).slice(-120).reverse());
      setSummary(getLatestAgentRunSummary(automation));
    };

    sync();
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('wordai-agent-logs-updated', sync);
    window.addEventListener('wordai-workspace-changed', sync);
    return () => {
      window.removeEventListener('wordai-agent-logs-updated', sync);
      window.removeEventListener('wordai-workspace-changed', sync);
    };
  }, [automation, activeWorkspaceId]);

  const getStatusMeta = (state) => {
    if (state === 'success') return { icon: '✓', color: '#166534', bg: '#F0FDF4', border: '#BBF7D0' };
    if (state === 'running') return { icon: '…', color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' };
    if (state === 'idle') return { icon: '✗', color: '#475569', bg: '#F8FAFC', border: '#CBD5E1' };
    return { icon: '✗', color: '#991B1B', bg: '#FEF2F2', border: '#FECACA' };
  };

  const formatTime = (ts) => {
    try {
      return new Date(ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '';
    }
  };

  const copyLogs = async () => {
    try {
      const text = getAgentDebugLogs({ workspaceId: activeWorkspaceId, includeUnscoped: false }).map((log) => {
        const parts = [
          formatTime(log.ts),
          getAgentTitle(log),
          log.workspaceName ? `סביבה: ${log.workspaceName}` : '',
          log.message || '',
          log.provider ? `מנוע: ${log.provider}` : '',
          log.model ? `מודל: ${log.model}` : '',
          log.errorMessage ? `שגיאה: ${log.errorMessage}` : '',
        ].filter(Boolean);
        return parts.join(' | ');
      }).join('\n');
      await navigator.clipboard.writeText(text || 'אין לוגים זמינים כרגע.');
    } catch {}
  };

  const resetLogs = () => {
    clearAgentDebugLogs(activeWorkspaceId);
    setLogs([]);
    setSummary(getLatestAgentRunSummary(automation));
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: '#605E5C', marginBottom: 14, lineHeight: 1.7 }}>
        כאן אפשר לראות בדיוק מה קרה בהרצה האחרונה: האם הופעל API, האם AUTOPILOT ניהל את הצוות, ואילו שלבים הושלמו או נכשלו.
      </p>

      <div style={{ marginBottom: 14, border: '1px solid #E2E8F0', background: '#F8FAFC', borderRadius: 10, padding: '8px 10px', fontSize: 11, color: '#334155' }}>
        סביבת עבודה פעילה בלוגים: <strong>{summary?.workspaceName || automation?.workspaceName || 'ללא שם'}</strong> ({summary?.workspaceId || activeWorkspaceId})
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, marginBottom: 14 }}>
        {(summary?.criteria || []).map((item) => {
          const meta = getStatusMeta(item.state);
          return (
            <div key={item.key} style={{ border: `1px solid ${meta.border}`, background: meta.bg, borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1F2937' }}>{item.label}</span>
                <span style={{ width: 26, height: 26, borderRadius: 999, background: 'white', color: meta.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{meta.icon}</span>
              </div>
              <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.6 }}>{item.details}</div>
            </div>
          );
        })}
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 10 }}>מצב שלבים</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {(summary?.stages || []).map((stage) => {
            const meta = getStatusMeta(stage.state);
            return (
              <div key={stage.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: `1px solid ${meta.border}`, borderRadius: 10, padding: '8px 10px', background: meta.bg }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1F2937' }}>{stage.label}</div>
                  {stage.configuredName && stage.configuredName !== stage.label && (
                    <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>שם מוגדר: {stage.configuredName}</div>
                  )}
                  <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>{stage.details || 'לא הופעל'}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {(stage.provider || stage.model) && <span style={{ fontSize: 10, color: '#475569' }}>{[stage.provider, stage.model].filter(Boolean).join(' · ')}</span>}
                  <span style={{ width: 24, height: 24, borderRadius: 999, background: 'white', color: meta.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{meta.icon}</span>
                </div>
              </div>
            );
          })}
        </div>
        {!!summary?.lastError && (
          <div style={{ marginTop: 10, fontSize: 11, color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '8px 10px' }}>
            סיבת הכשל האחרונה: {summary.lastError}
          </div>
        )}
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#323130' }}>קונסולת לוגים</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={copyLogs} style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #CBD5E1', background: 'white', cursor: 'pointer', fontSize: 11 }}>העתק</button>
            <button onClick={resetLogs} style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', cursor: 'pointer', fontSize: 11 }}>נקה</button>
          </div>
        </div>

        <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, background: '#0F172A', borderRadius: 12, padding: '10px' }}>
          {logs.length ? logs.map((log) => {
            const meta = getStatusMeta(log.state);
            return (
              <div key={log.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#E2E8F0' }}>{getAgentTitle(log)}</span>
                  <span style={{ fontSize: 10, color: '#94A3B8' }}>{formatTime(log.ts)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 999, background: 'white', color: meta.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11 }}>{meta.icon}</span>
                  <span style={{ fontSize: 11, color: '#F8FAFC', lineHeight: 1.5 }}>{log.message || 'ללא הודעה'}</span>
                </div>
                <div style={{ fontSize: 10, color: '#94A3B8' }}>
                  {[log.workspaceName ? `סביבה: ${log.workspaceName}` : '', log.provider, log.model, log.errorMessage].filter(Boolean).join(' • ')}
                </div>
              </div>
            );
          }) : (
            <div style={{ fontSize: 11, color: '#94A3B8', padding: '8px 4px' }}>עדיין אין לוגים להצגה.</div>
          )}
        </div>
      </div>
    </div>
  );
}

const DEVELOPER_PROVIDER_OPTIONS = [
  ['gemini', 'Gemini'],
  ['openai', 'OpenAI'],
  ['claude', 'Claude'],
  ['groq', 'Groq'],
  ['perplexity', 'Perplexity'],
  ['ollama', 'Ollama'],
  ['custom', 'Custom API'],
];

const SIDEBAR_PRESET_OPTIONS = [
  ['word-taskpane', 'Taskpane קלאסי (Word Add-in)'],
  ['modern', 'Sidebar מודרני'],
];

const downloadTextAsFile = (filename = 'wordflow-debug.json', text = '') => {
  try {
    const blob = new Blob([String(text || '')], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  } catch {}
};

const getWordAiStorageInfo = () =>
  Object.keys(localStorage)
    .filter((k) => k.startsWith('wordai'))
    .map((k) => { const val = localStorage.getItem(k) || ''; return { key: k, sizeBytes: new Blob([val]).size }; })
    .sort((a, b) => b.sizeBytes - a.sizeBytes);

const DEV_QUICK_ACTION_LABELS = {
  fix: 'תיקון שגיאות', humanize: 'הפנס אנושי', summary: 'סיכום', academic: 'אקדמי',
  organize: 'ארגון', textToTable: 'טקסט לטבלה', expand: 'הרחבה', translate: 'תרגום',
  bullets: 'נקודות', shorter: 'קיצור', continue: 'המשך', intro: 'מבוא', conclusion: 'סיכום/מסקנה', sources: 'מקורות',
};

const WORKFLOW_MODE_OPTIONS = [
  ['autopilot-full', 'Autopilot Full — preflight בוחר סוכנים, ספקים, מודלים וסבבים'],
  ['manager-auto', 'Manager Auto — מנהל AI מחליט על סדר הסוכנים'],
  ['circular-team', 'Circular Team — סבבי ביקורת מרובים'],
  ['manager-pipeline', 'Manager Pipeline — pipeline קבוע עם מנהל'],
  ['custom-order', 'Custom Order — הסוכנים רצים לפי הסדר שהגדרת'],
];

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

const buildGenerationInspectorMaterialSummary = (item = {}, index = 0) => {
  const previewText = String(item?.previewText || '').trim();
  const rawPreviewChars = Number(item?.previewChars);
  return {
    id: item?.id || item?.file || `material-${index + 1}`,
    title: String(item?.title || item?.file || `material-${index + 1}`).trim(),
    label: String(item?.label || '').trim(),
    hasPreview: Boolean(item?.hasPreview || previewText),
    previewChars: Number.isFinite(rawPreviewChars) && rawPreviewChars >= 0 ? rawPreviewChars : previewText.length,
    previewStatus: String(item?.previewStatus || (previewText ? 'ready' : '')).trim(),
    previewError: String(item?.previewError || '').trim(),
  };
};

const resolveGenerationInspectorRouteMode = (logs = []) => {
  const requestStart = (Array.isArray(logs) ? logs : []).find((log) => log?.type === 'request-start');
  if (!requestStart) return { routeMode: '', routeModeReason: '' };
  return {
    routeMode: requestStart.automationSkipped === true ? 'direct' : 'workspace-automation',
    routeModeReason: String(requestStart.automationSkipReason || '').trim(),
  };
};

const resolveGenerationInspectorProviderMeta = ({ logs = [], stages = [], inspector = {}, actionPayload = {} } = {}) => {
  const lastLogMeta = [...(Array.isArray(logs) ? logs : [])]
    .reverse()
    .find((log) => String(log?.provider || '').trim() || String(log?.model || '').trim());
  const lastStageMeta = [...(Array.isArray(stages) ? stages : [])]
    .reverse()
    .find((stage) => String(stage?.provider || '').trim() || String(stage?.model || '').trim());
  const meta = lastLogMeta || lastStageMeta || {};
  return {
    provider: String(meta?.provider || inspector?.requestedProviderId || actionPayload?.selectedProviderId || '').trim(),
    model: String(meta?.model || inspector?.requestedProviderModel || actionPayload?.selectedProviderModel || '').trim(),
  };
};

const buildGenerationInspectorSnapshot = ({ lastGenerationAction = null, liveGeneration = null } = {}) => {
  if (!lastGenerationAction || typeof lastGenerationAction !== 'object') return null;

  const inspector = lastGenerationAction?.inspector && typeof lastGenerationAction.inspector === 'object'
    ? lastGenerationAction.inspector
    : {};
  const actionPayload = lastGenerationAction?.payload && typeof lastGenerationAction.payload === 'object'
    ? lastGenerationAction.payload
    : {};
  const runId = String(inspector.runId || lastGenerationAction?.runId || '').trim();
  const liveMatchesRun = Boolean(runId) && String(liveGeneration?.runId || '').trim() === runId;
  const liveLogs = liveMatchesRun && Array.isArray(liveGeneration?.logs) ? liveGeneration.logs : [];
  const liveSummary = liveMatchesRun && liveGeneration?.summary && typeof liveGeneration.summary === 'object'
    ? liveGeneration.summary
    : null;
  const stages = Array.isArray(liveSummary?.stages) ? liveSummary.stages : [];
  const routeMeta = resolveGenerationInspectorRouteMode(liveLogs);
  const routeMode = String(routeMeta.routeMode || inspector?.routeMode || '').trim();
  const routeModeReason = String(routeMeta.routeModeReason || inspector?.routeModeReason || '').trim();
  const providerMeta = resolveGenerationInspectorProviderMeta({
    logs: liveLogs,
    stages,
    inspector,
    actionPayload,
  });
  const baseDraft = inspector?.baseDraft || (actionPayload?.baseDraft ? {
    title: String(actionPayload?.baseDraft?.title || actionPayload?.baseDraft?.name || '').trim() || 'טיוטת בסיס',
    htmlChars: String(actionPayload?.baseDraft?.html || '').trim().length,
    textChars: String(actionPayload?.baseDraft?.text || '').trim().length,
  } : null);
  const selectedMaterialsSource = Array.isArray(inspector?.selectedMaterials)
    ? inspector.selectedMaterials
    : Array.isArray(actionPayload?.selectedMaterials)
      ? actionPayload.selectedMaterials
      : [];
  const selectedMaterials = selectedMaterialsSource.map(buildGenerationInspectorMaterialSummary);
  const actionType = String(
    inspector?.actionType
    || (lastGenerationAction?.kind === 'feedback-revision' ? 'revise' : '')
    || (lastGenerationAction?.kind === 'review-recommendations' ? 'review' : '')
    || (baseDraft ? 'revise' : 'generate')
  ).trim() || 'generate';
  const instructionsChars = Number.isFinite(Number(inspector?.instructionsChars))
    ? Number(inspector.instructionsChars)
    : String(actionPayload?.instructions || '').trim().length;
  const promptChars = Number.isFinite(Number(inspector?.promptChars))
    ? Number(inspector.promptChars)
    : String(actionPayload?.prompt || '').trim().length;

  return {
    actionType,
    actionKind: String(lastGenerationAction?.kind || '').trim(),
    runId,
    route: String(inspector?.routeResolved || inspector?.routeRequested || '').trim(),
    routeMode,
    routeModeReason,
    provider: providerMeta.provider,
    model: providerMeta.model,
    state: String(inspector?.liveState || (liveMatchesRun ? liveGeneration?.state : '') || '').trim(),
    workspaceId: String(lastGenerationAction?.workspaceId || liveGeneration?.workspaceId || '').trim(),
    promptChars,
    instructionsChars,
    baseDraft,
    selectedMaterials,
    usedFallback: Boolean(inspector?.usedFallback),
    errorMessage: String(inspector?.errorMessage || liveSummary?.lastError || '').trim(),
  };
};

function GenerationInspectorCard({ lastGenerationAction, liveGeneration }) {
  const snapshot = buildGenerationInspectorSnapshot({ lastGenerationAction, liveGeneration });

  if (!snapshot) {
    return (
      <div style={{ border: '1px solid #E2E8F0', borderRadius: 14, padding: '14px', background: '#FFFFFF', gridColumn: 'span 2' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginBottom: 8 }}>Generation Inspector</div>
        <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.6 }}>עדיין לא נשמר snapshot של generation או revise להצגה.</div>
      </div>
    );
  }

  const exportPayload = {
    actionType: snapshot.actionType,
    actionKind: snapshot.actionKind,
    state: snapshot.state,
    runId: snapshot.runId,
    route: snapshot.route,
    routeMode: snapshot.routeMode,
    routeModeReason: snapshot.routeModeReason,
    provider: snapshot.provider,
    model: snapshot.model,
    workspaceId: snapshot.workspaceId,
    promptChars: snapshot.promptChars,
    instructionsChars: snapshot.instructionsChars,
    baseDraft: snapshot.baseDraft,
    selectedMaterials: snapshot.selectedMaterials,
    usedFallback: snapshot.usedFallback,
    errorMessage: snapshot.errorMessage,
  };
  const exportText = JSON.stringify(exportPayload, null, 2);

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
    } catch {}
  };

  const exportSummary = () => {
    downloadTextAsFile(`wordflow-generation-${snapshot.runId || Date.now()}.json`, exportText);
  };

  return (
    <div style={{ border: '1px solid #E2E8F0', borderRadius: 14, padding: '14px', background: '#FFFFFF', gridColumn: 'span 2' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginBottom: 4 }}>Generation Inspector</div>
          <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.6 }}>
            snapshot מינימלי של מה שנשלח למסלול generation ומה באמת נפתר בזמן הריצה האחרונה.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={copySummary} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #CBD5E1', background: 'white', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Copy summary</button>
          <button onClick={exportSummary} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #CBD5E1', background: '#F8FAFC', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Export JSON</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
        {[
          { label: 'פעולה', value: snapshot.actionType || 'generate' },
          { label: 'Route', value: snapshot.route || 'לא זוהה' },
          { label: 'Routing mode', value: snapshot.routeMode || 'לא זוהה' },
          { label: 'Provider / Model', value: [snapshot.provider, snapshot.model].filter(Boolean).join(' · ') || 'לא זוהה' },
          { label: 'runId', value: snapshot.runId || 'לא זוהה' },
          { label: 'instructions chars', value: String(snapshot.instructionsChars || 0) },
        ].map((item) => (
          <div key={item.label} style={{ border: '1px solid #E2E8F0', borderRadius: 10, background: '#F8FAFC', padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1F2937', lineHeight: 1.5, wordBreak: 'break-word' }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
        <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, background: '#F8FAFC', padding: '10px 12px' }}>
          <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>Base draft</div>
          <div style={{ fontSize: 12, color: '#1F2937', lineHeight: 1.6 }}>
            {snapshot.baseDraft
              ? `${snapshot.baseDraft.title || 'טיוטת בסיס'} · html ${snapshot.baseDraft.htmlChars || 0} chars · text ${snapshot.baseDraft.textChars || 0} chars`
              : 'לא נשלחה טיוטת בסיס בהרצה האחרונה.'}
          </div>
        </div>

        <div style={{ border: `1px solid ${snapshot.errorMessage ? '#FECACA' : snapshot.usedFallback ? '#FDE68A' : '#E2E8F0'}`, borderRadius: 10, background: snapshot.errorMessage ? '#FEF2F2' : snapshot.usedFallback ? '#FFFBEB' : '#F8FAFC', padding: '10px 12px' }}>
          <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>Fallback / Error</div>
          <div style={{ fontSize: 12, color: snapshot.errorMessage ? '#991B1B' : '#1F2937', lineHeight: 1.6 }}>
            {snapshot.errorMessage || (snapshot.usedFallback ? 'ההרצה חזרה ל-fallback בטוח.' : 'לא נרשם fallback או error בהרצה האחרונה.')}
          </div>
          {snapshot.routeModeReason ? (
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 6 }}>route hint: {snapshot.routeModeReason}</div>
          ) : null}
        </div>
      </div>

      <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, background: '#FFFFFF', padding: '12px 12px 4px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#1F2937', marginBottom: 10 }}>Selected materials</div>
        {snapshot.selectedMaterials.length ? snapshot.selectedMaterials.map((item) => {
          const previewLabel = item.hasPreview
            ? `excerpt ${item.previewChars || 0} chars`
            : item.previewStatus
              ? `preview ${item.previewStatus}`
              : 'ללא preview';
          return (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, borderTop: '1px solid #F1F5F9', padding: '10px 0' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1F2937' }}>{item.title || 'חומר עזר'}</div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>{item.label || 'ללא label'}</div>
                {item.previewError ? (
                  <div style={{ fontSize: 11, color: '#B91C1C', marginTop: 4 }}>preview error: {item.previewError}</div>
                ) : null}
              </div>
              <div style={{ fontSize: 11, color: item.hasPreview ? '#166534' : '#475569', background: item.hasPreview ? '#F0FDF4' : '#F8FAFC', border: `1px solid ${item.hasPreview ? '#BBF7D0' : '#E2E8F0'}`, borderRadius: 999, padding: '4px 8px', whiteSpace: 'nowrap' }}>
                {previewLabel}
              </div>
            </div>
          );
        }) : (
          <div style={{ fontSize: 11, color: '#94A3B8', paddingBottom: 8 }}>לא נבחרו חומרי עזר בהרצה האחרונה.</div>
        )}
      </div>
    </div>
  );
}

function DeveloperSettings({ config, setConfig, automation, setAutomation, setAgents, assistantBehavior, setAssistantBehavior, wordPrefs, setWordPrefs, lastGenerationAction, liveGeneration }) {
  const activeWorkspaceId = automation?.activeWorkspaceId || 'default-content-studio';
  const activeProviderId = String(config?.active || 'gemini').trim() || 'gemini';
  const activeProviderModel = String(config?.[activeProviderId]?.model || '').trim();
  const activeModelChoices = getProviderModelChoices(activeProviderId, config, [activeProviderModel]);
  const [logsCount, setLogsCount] = useState(() => getAgentDebugLogs({ workspaceId: activeWorkspaceId, includeUnscoped: false }).length);
  const [summary, setSummary] = useState(() => getLatestAgentRunSummary(automation));
  const defaultProviderId = DEFAULT_PROVIDER_CONFIG.active;
  const defaultProviderModel = DEFAULT_PROVIDER_CONFIG?.[defaultProviderId]?.model || '';
  const sidebarPreset = String(assistantBehavior?.sidebarPreset || DEFAULT_ASSISTANT_BEHAVIOR.sidebarPreset || 'word-taskpane').trim() || 'word-taskpane';
  const sourceRoutingEnabled = assistantBehavior?.autoRouteSourceRequests !== false;
  const sourceGroundingEnabled = true;
  const perplexityConfigured = isProviderConfigured(config, 'perplexity');
  const scholarConfigured = isProviderConfigured(config, 'scholar');
  const verifiedRetrievalConfigured = perplexityConfigured || scholarConfigured;

  // Connection test state
  const [connTest, setConnTest] = useState({ status: 'idle', result: null, elapsed: null });
  const runConnTest = async () => {
    setConnTest({ status: 'running', result: null, elapsed: null });
    const t0 = Date.now();
    try {
      const result = await testProviderConnection(activeProviderId, config?.[activeProviderId] || {});
      setConnTest({ status: 'done', result, elapsed: Date.now() - t0 });
    } catch (err) {
      setConnTest({ status: 'done', result: { ok: false, error: String(err?.message || err) }, elapsed: Date.now() - t0 });
    }
  };

  // Storage inspector state
  const [storageInfo, setStorageInfo] = useState(getWordAiStorageInfo);
  const refreshStorageInfo = () => setStorageInfo(getWordAiStorageInfo());
  const clearStorageKey = (key) => {
    if (!window.confirm(`למחוק את המפתח "${key}" מה-localStorage?\nפעולה זו לא ניתנת לביטול.`)) return;
    localStorage.removeItem(key);
    refreshStorageInfo();
  };
  const totalStorageBytes = storageInfo.reduce((sum, e) => sum + e.sizeBytes, 0);

  // App memory & chat history state
  const [appMemory, setAppMemory] = useState(() => getAppMemory());
  const [chatCleared, setChatCleared] = useState(false);
  const handleClearAppMemory = () => { clearAppMemory(); setAppMemory(getAppMemory()); };
  const handleClearChatHistory = () => {
    clearSidebarChatHistory({ workspaceId: automation?.activeWorkspaceId || 'default-content-studio', clearAll: false });
    setAppMemory(getAppMemory());
    setChatCleared(true);
    setTimeout(() => setChatCleared(false), 3000);
  };

  const resetDeveloperDefaults = () => {
    setConfig((prev) => {
      const fallbackProviderId = [
        defaultProviderId,
        String(prev?.active || '').trim(),
        'gemini',
        'openai',
        'claude',
        'groq',
        'perplexity',
        'ollama',
        'custom',
      ].find((providerId) => providerId && isProviderConfigured(prev, providerId)) || defaultProviderId;
      const fallbackProviderModel = DEFAULT_PROVIDER_CONFIG?.[fallbackProviderId]?.model || '';

      return {
        ...prev,
        active: fallbackProviderId,
        [fallbackProviderId]: {
          ...(prev?.[fallbackProviderId] || {}),
          model: fallbackProviderModel,
        },
      };
    });
    setAutomation((prev) => ({
      ...prev,
      timeoutEnabled: DEFAULT_WORKSPACE_AUTOMATION.timeoutEnabled,
      requestTimeoutMs: DEFAULT_WORKSPACE_AUTOMATION.requestTimeoutMs,
      appendAgentNotesToOutput: DEFAULT_WORKSPACE_AUTOMATION.appendAgentNotesToOutput,
      agentNotesInstruction: DEFAULT_WORKSPACE_AUTOMATION.agentNotesInstruction,
    }));
    setAssistantBehavior((prev) => ({
      ...prev,
      sidebarPreset: DEFAULT_ASSISTANT_BEHAVIOR.sidebarPreset,
      autoRouteSourceRequests: DEFAULT_ASSISTANT_BEHAVIOR.autoRouteSourceRequests,
      strictSourceGrounding: DEFAULT_ASSISTANT_BEHAVIOR.strictSourceGrounding,
    }));
  };

  useEffect(() => {
    const sync = () => {
      setLogsCount(getAgentDebugLogs({ workspaceId: activeWorkspaceId, includeUnscoped: false }).length);
      setSummary(getLatestAgentRunSummary(getWorkspaceAutomation()));
    };

    sync();
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('wordai-agent-logs-updated', sync);
    window.addEventListener('wordai-workspace-changed', sync);
    return () => {
      window.removeEventListener('wordai-agent-logs-updated', sync);
      window.removeEventListener('wordai-workspace-changed', sync);
    };
  }, [activeWorkspaceId, automation]);

  const exportLogs = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      workspaceId: activeWorkspaceId,
      workspaceName: summary?.workspaceName || automation?.workspaceName || '',
      summary,
      logs: getAgentDebugLogs({ workspaceId: activeWorkspaceId, includeUnscoped: false }),
    };
    downloadTextAsFile(`wordflow-debug-${activeWorkspaceId}-${Date.now()}.json`, JSON.stringify(payload, null, 2));
  };

  const resetLogs = () => {
    clearAgentDebugLogs(activeWorkspaceId);
    setLogsCount(0);
    setSummary(getLatestAgentRunSummary(getWorkspaceAutomation()));
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 13, color: '#605E5C', marginBottom: 0, lineHeight: 1.7, flex: '1 1 320px' }}>
          אזור מרוכז למשתמש מתקדם: שליטה מהירה על provider/model פעיל, shell של חלונית הצ׳אט, guardrails למחקר ומקורות, timeout במילישניות, ו-debug בסיסי בלי לטייל בין כמה טאבים.
        </p>
        <div style={{ display: 'grid', gap: 6, justifyItems: 'start' }}>
          <button
            onClick={resetDeveloperDefaults}
            style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #CBD5E1', background: 'white', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
          >
            Reset to defaults
          </button>
          <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.6 }}>
            מחזיר provider/model, preset חלונית, כללי מקורות, timeout ונספח הערות סוכנים לברירת המחדל. מפתחות API לא נמחקים.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        <div style={{ border: '1px solid #E2E8F0', borderRadius: 14, padding: '14px', background: '#FFFFFF' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginBottom: 8 }}>Provider / Model פעיל</div>
          <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.6, marginBottom: 12 }}>
            זהו ה-override הזמין ביותר למסלול הישיר ולכל מקום שנשען על הספק הפעיל בהגדרות.
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>ספק פעיל</span>
              <select
                value={activeProviderId}
                onChange={(e) => setConfig((prev) => ({ ...prev, active: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: 10, fontSize: 12, background: 'white' }}
              >
                {DEVELOPER_PROVIDER_OPTIONS.map(([providerId, label]) => (
                  <option key={providerId} value={providerId} disabled={!isProviderConfigured(config, providerId) && activeProviderId !== providerId}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>מודל פעיל</span>
              <select
                value={activeModelChoices.includes(activeProviderModel) ? activeProviderModel : ''}
                onChange={(e) => setConfig((prev) => ({
                  ...prev,
                  [activeProviderId]: {
                    ...(prev?.[activeProviderId] || {}),
                    model: e.target.value,
                  },
                }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: 10, fontSize: 12, background: 'white', marginBottom: 6 }}
              >
                <option value="">בחר מודל מוכן</option>
                {activeModelChoices.map((modelName) => (
                  <option key={modelName} value={modelName}>{modelName}</option>
                ))}
              </select>
              <input
                value={activeProviderModel}
                onChange={(e) => setConfig((prev) => ({
                  ...prev,
                  [activeProviderId]: {
                    ...(prev?.[activeProviderId] || {}),
                    model: e.target.value,
                  },
                }))}
                placeholder="אפשר גם להקליד ידנית model id"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: 10, fontSize: 12, direction: 'ltr', background: 'white' }}
              />
            </label>
          </div>
        </div>

        <div style={{ border: '1px solid #E2E8F0', borderRadius: 14, padding: '14px', background: '#FFFFFF' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginBottom: 8 }}>Chat Pane Shell & Grounding</div>
          <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.6, marginBottom: 12 }}>
            כאן בוחרים איזה shell המשתמש רואה בתוך ה-sidebar, ואיך בקשות למקורות מטופלות כדי לצמצם הזיות, URLs שבורים והמצאת כתבות.
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>Preset לחלונית הצ׳אט</span>
              <select
                value={sidebarPreset}
                onChange={(e) => setAssistantBehavior((prev) => ({ ...prev, sidebarPreset: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: 10, fontSize: 12, background: 'white' }}
              >
                {SIDEBAR_PRESET_OPTIONS.map(([presetId, label]) => (
                  <option key={presetId} value={presetId}>{label}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#1F2937', cursor: 'pointer' }}>
              <input
                type="checkbox"
                style={{ marginTop: 2, flexShrink: 0 }}
                checked={sourceRoutingEnabled}
                onChange={(e) => setAssistantBehavior((prev) => ({ ...prev, autoRouteSourceRequests: e.target.checked }))}
              />
              <span style={{ lineHeight: 1.5 }}>
                Source Auto-Route: בבקשות שמשלבות כתיבה עם מקורות, שלבי המחקר ינותבו ל-Perplexity כשאפשר גם אם ספק אחר פעיל. בקשות מקורות בלבד עדיין נשארות תחת Verified Sources Only.
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#1F2937', cursor: 'pointer' }}>
              <input
                type="checkbox"
                style={{ marginTop: 2, flexShrink: 0 }}
                checked={sourceGroundingEnabled}
                readOnly
                disabled
              />
              <span style={{ lineHeight: 1.5 }}>
                Verified Sources Only: תמיד פעיל. בקשות למקורות, ציטוטים ולינקים יחזירו רק תוצאות אחזור מאומתות או חסימה מפורשת עם NO_VERIFIED_SOURCES_FOUND.
              </span>
            </label>
          </div>

          <div style={{ fontSize: 11, color: verifiedRetrievalConfigured ? '#475569' : '#B45309', lineHeight: 1.6, marginTop: 10 }}>
            {perplexityConfigured && scholarConfigured
              ? 'Perplexity ו-SerpAPI Scholar מוגדרים: Perplexity זמין למחקר כללי ולבקשות משולבות, ו-Scholar זמין לבקשות מקורות אקדמיים מאומתים.'
              : perplexityConfigured
                ? 'Perplexity מוגדר, לכן Auto-Route יכול לעבור למסלול מחקר עם אינטרנט אמיתי כשנדרשים מקורות.'
                : scholarConfigured
                  ? 'Perplexity לא מוגדר, אבל SerpAPI Scholar כן מוגדר. לכן בקשות מקורות אקדמיים מאומתים עדיין זמינות במסלול source-only, בעוד שבקשות משולבות או מקורות כלליים ללא אחזור מאומת ייחסמו.'
                  : 'Perplexity ו-SerpAPI Scholar עדיין לא מוגדרים. האכיפה עדיין פעילה, ולכן בקשות למקורות יחזירו חסימה מפורשת עד שיוגדר ספק אחזור מאומת.'}
          </div>
        </div>

        <div style={{ border: '1px solid #E2E8F0', borderRadius: 14, padding: '14px', background: '#FFFFFF' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginBottom: 8 }}>Timeout לסוכנים</div>
          <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.6, marginBottom: 12 }}>
            כאן משנים את timeout ברמת orchestration. הערך נשמר במילישניות ומוחל בכל הריצות הבאות.
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#1F2937', marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={automation?.timeoutEnabled === true}
              onChange={(e) => setAutomation((prev) => ({ ...prev, timeoutEnabled: e.target.checked }))}
            />
            הפעל timeout גלובלי לבקשות סוכנים
          </label>

          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: automation?.timeoutEnabled === true ? '#475569' : '#94A3B8' }}>Timeout במילישניות</span>
            <input
              type="number"
              min="10000"
              max="300000"
              step="1000"
              disabled={automation?.timeoutEnabled !== true}
              value={automation?.requestTimeoutMs ?? 45000}
              onChange={(e) => setAutomation((prev) => ({ ...prev, requestTimeoutMs: Math.max(10000, Number(e.target.value) || 45000) }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: 10, fontSize: 12, background: automation?.timeoutEnabled === true ? 'white' : '#F8FAFC', color: automation?.timeoutEnabled === true ? '#1F2937' : '#94A3B8' }}
            />
          </label>

          <div style={{ fontSize: 11, color: automation?.timeoutEnabled === true ? '#475569' : '#0F766E', lineHeight: 1.6, marginTop: 8 }}>
            {automation?.timeoutEnabled === true
              ? 'הערך ייחתך אוטומטית למינימום 10000ms כדי למנוע timeout אגרסיבי מדי.'
              : 'כבוי כרגע. ריצות ארוכות ימשיכו ללא עצירה אוטומטית.'}
          </div>
        </div>

        <div style={{ border: '1px solid #E2E8F0', borderRadius: 14, padding: '14px', background: '#FFFFFF' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginBottom: 8 }}>Workspace automation</div>
          <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.6, marginBottom: 12 }}>
            Override נקודתי למסלול העבודה הרב-סוכני כשבסוף הריצה מוחזר מסמך מלא.
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#1F2937', marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={automation?.appendAgentNotesToOutput === true}
              onChange={(e) => setAutomation((prev) => ({ ...prev, appendAgentNotesToOutput: e.target.checked }))}
            />
            צרף בסוף הפלט נספח הערות סוכנים
          </label>

          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>הנחיה מותאמת לנספח</span>
            <textarea
              value={automation?.agentNotesInstruction || ''}
              onChange={(e) => setAutomation((prev) => ({ ...prev, agentNotesInstruction: e.target.value }))}
              placeholder="למשל: ציין פערים מתודולוגיים, מה לתקן לפני הגשה, ומה נשמר מצוין לפי ההנחיות"
              rows={3}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: 10, fontSize: 12, resize: 'vertical', background: 'white' }}
            />
          </label>

          <div style={{ fontSize: 11, color: automation?.appendAgentNotesToOutput === true ? '#475569' : '#0F766E', lineHeight: 1.6, marginTop: 8 }}>
            {automation?.appendAgentNotesToOutput === true
              ? 'הנספח יצורף רק לריצות automation שמחזירות מסמך, עם ההנחיה הייעודית שנכתבה כאן.'
              : 'כבוי כרגע. הפלט יישאר נקי מנספח הערות עד שמפעילים את ההגדרה.'}
          </div>
        </div>

        <div style={{ border: '1px solid #E2E8F0', borderRadius: 14, padding: '14px', background: '#FFFFFF' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginBottom: 8 }}>Debug Logs</div>
          <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.6, marginBottom: 12 }}>
            ייצוא מהיר של הלוגים הפעילים או ניקוי מלא של סביבת העבודה הנוכחית.
          </div>

          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, background: '#F8FAFC', padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: '#64748B' }}>סביבה פעילה</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginTop: 4 }}>{summary?.workspaceName || automation?.workspaceName || 'ללא שם'}</div>
              <div style={{ fontSize: 11, color: '#475569', marginTop: 6 }}>לוגים שמורים: {logsCount}</div>
            </div>
            {!!summary?.lastError && (
              <div style={{ border: '1px solid #FECACA', borderRadius: 10, background: '#FEF2F2', padding: '10px 12px', fontSize: 11, color: '#991B1B', lineHeight: 1.6 }}>
                שגיאה אחרונה: {summary.lastError}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={exportLogs} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #CBD5E1', background: 'white', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>ייצא JSON</button>
            <button onClick={resetLogs} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>נקה לוגים</button>
          </div>
        </div>

        <GenerationInspectorCard lastGenerationAction={lastGenerationAction} liveGeneration={liveGeneration} />

        {/* ─── כרטיס: בדיקת חיבור ─── */}
        <div style={{ border: '1px solid #E2E8F0', borderRadius: 14, padding: '14px', background: '#FFFFFF' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginBottom: 8 }}>בדיקת חיבור לספק</div>
          <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.6, marginBottom: 12 }}>
            שולח בקשת ping לספק הפעיל ומציג תשובה, מודל שנענה, ועיכוב ברמת מילישניות.
          </div>
          <button
            onClick={runConnTest}
            disabled={connTest.status === 'running'}
            style={{ padding: '9px 16px', borderRadius: 999, border: '1px solid #CBD5E1', background: connTest.status === 'running' ? '#F1F5F9' : 'white', cursor: connTest.status === 'running' ? 'wait' : 'pointer', fontSize: 12, fontWeight: 700, marginBottom: 12 }}
          >
            {connTest.status === 'running' ? '⏳ בודק...' : '🔌 בדוק עכשיו'}
          </button>
          {connTest.status === 'done' && connTest.result && (
            <div style={{ border: `1px solid ${connTest.result.ok ? '#BBF7D0' : '#FECACA'}`, borderRadius: 10, background: connTest.result.ok ? '#F0FDF4' : '#FEF2F2', padding: '10px 12px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: connTest.result.ok ? '#15803D' : '#B91C1C', marginBottom: 6 }}>
                {connTest.result.ok ? `✅ חיבור תקין — ${connTest.elapsed}ms` : `❌ שגיאה — ${connTest.elapsed}ms`}
              </div>
              {connTest.result.model && (
                <div style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>מודל: <code style={{ background: '#E2E8F0', padding: '1px 5px', borderRadius: 4 }}>{connTest.result.model}</code></div>
              )}
              {connTest.result.reply && (
                <div style={{ fontSize: 11, color: '#475569', marginBottom: 4, lineHeight: 1.5 }}>תגובה: <em>{String(connTest.result.reply).slice(0, 120)}{connTest.result.reply.length > 120 ? '…' : ''}</em></div>
              )}
              {connTest.result.error && (
                <div style={{ fontSize: 11, color: '#B91C1C', lineHeight: 1.5 }}>{connTest.result.error}</div>
              )}
            </div>
          )}
        </div>

        {/* ─── כרטיס: Storage Inspector ─── */}
        <div style={{ border: '1px solid #E2E8F0', borderRadius: 14, padding: '14px', background: '#FFFFFF', gridColumn: 'span 2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', flex: 1 }}>Storage Inspector</div>
            <div style={{ fontSize: 11, color: '#64748B' }}>סה"כ: {(totalStorageBytes / 1024).toFixed(1)} KB</div>
            <button onClick={refreshStorageInfo} style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid #CBD5E1', background: 'white', cursor: 'pointer', fontSize: 11 }}>רענן</button>
          </div>
          <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.6, marginBottom: 10 }}>
            כל מפתחות ה-localStorage של WordFlow. לחץ על 🗑 למחיקת מפתח ספציפי.
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #F1F5F9', borderRadius: 10 }}>
            {storageInfo.length === 0 && (
              <div style={{ padding: 12, fontSize: 11, color: '#94A3B8', textAlign: 'center' }}>אין נתונים</div>
            )}
            {storageInfo.map(({ key, sizeBytes }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid #F8FAFC', direction: 'ltr' }}>
                <div style={{ flex: 1, fontSize: 11, color: '#1F2937', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{key}</div>
                <div style={{ fontSize: 10, color: '#94A3B8', whiteSpace: 'nowrap' }}>{(sizeBytes / 1024).toFixed(1)} KB</div>
                <button onClick={() => clearStorageKey(key)} title="מחק מפתח" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#F87171', padding: '0 2px', lineHeight: 1 }}>🗑</button>
              </div>
            ))}
          </div>
        </div>

        {/* ─── כרטיס: App Memory & Chat History ─── */}
        <div style={{ border: '1px solid #E2E8F0', borderRadius: 14, padding: '14px', background: '#FFFFFF' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginBottom: 8 }}>App Memory & Chat</div>
          <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.6, marginBottom: 12 }}>
            זיכרון ה-AI (הערות + שיחות אחרונות) והיסטוריית Sidebar Chat.
          </div>
          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, background: '#F8FAFC', padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: '#64748B' }}>הערות זיכרון</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1F2937' }}>{appMemory.memoryNotes?.length ?? 0}</div>
            </div>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, background: '#F8FAFC', padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: '#64748B' }}>שיחות אחרונות שמורות</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1F2937' }}>{appMemory.recentChats?.length ?? 0}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={handleClearAppMemory} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>נקה זיכרון AI</button>
            <button onClick={handleClearChatHistory} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #FECACA', background: chatCleared ? '#F0FDF4' : '#FEF2F2', color: chatCleared ? '#15803D' : '#B91C1C', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
              {chatCleared ? '✓ נוקה' : 'נקה צ׳אט Sidebar'}
            </button>
          </div>
        </div>

        {/* ─── כרטיס: Workflow Engine ─── */}
        <div style={{ border: '1px solid #E2E8F0', borderRadius: 14, padding: '14px', background: '#FFFFFF' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginBottom: 8 }}>🔄 Workflow Engine</div>
          <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.6, marginBottom: 12 }}>
            שליטה מלאה על מנגנון ריצת הסוכנים: מצב, אוטומציה, ו-Bypass לסביבת עבודה.
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>מצב Workflow</span>
              <select
                value={automation?.workflowMode || 'manager-auto'}
                onChange={(e) => {
                  const nextMode = e.target.value;
                  setAutomation((prev) => ({
                    ...prev,
                    workflowMode: nextMode,
                    autopilotEnabled: ['autopilot-full', 'manager-auto'].includes(nextMode) ? true : prev.autopilotEnabled,
                    circularWorkflowEnabled: nextMode === 'circular-team' ? true : prev.circularWorkflowEnabled,
                  }));
                  if (['autopilot-full', 'manager-auto', 'circular-team'].includes(nextMode)) {
                    setAgents((prev) => {
                      if (hasManagedWorkflowCoreTeam(prev)) return prev;
                      return mergeMissingManagedWorkflowRoles(prev, automation?.preset || 'content-studio');
                    });
                  }
                }}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: 10, fontSize: 12, background: 'white' }}
              >
                {WORKFLOW_MODE_OPTIONS.map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </label>
            {[
              ['autopilotEnabled', 'Autopilot — AI מחליט על חלוקת העבודה בין סוכנים'],
              ['autoDispatch', 'Auto Dispatch — שלח למנהל AI אוטומטית בלי אישור ידני'],
              ['onlyFromMaterials', 'Only From Materials — אסור לסוכנים לייצר מידע ממקורות חיצוניים'],
              ['workspaceBypassEnabled', 'Workspace Bypass — דלג על סביבת עבודה ורוץ ישירות'],
            ].map(([key, desc]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#1F2937', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  style={{ marginTop: 2, flexShrink: 0 }}
                  checked={automation?.[key] !== false && automation?.[key] !== undefined ? !!automation?.[key] : (key === 'autopilotEnabled' || key === 'autoDispatch')}
                  onChange={(e) => setAutomation((prev) => ({ ...prev, [key]: e.target.checked }))}
                />
                <span style={{ lineHeight: 1.5 }}>{desc}</span>
              </label>
            ))}
          </div>
        </div>

        {/* ─── כרטיס: Circular + Retry ─── */}
        <div style={{ border: '1px solid #E2E8F0', borderRadius: 14, padding: '14px', background: '#FFFFFF' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginBottom: 8 }}>🔁 Circular Workflow & Retry</div>
          <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.6, marginBottom: 12 }}>
            סבבי ביקורת (circular) ומדיניות ניסיונות חוזרים בכשל.
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#1F2937' }}>
              <input
                type="checkbox"
                checked={automation?.circularWorkflowEnabled === true}
                onChange={(e) => setAutomation((prev) => ({ ...prev, circularWorkflowEnabled: e.target.checked }))}
              />
              הפעל Circular Workflow (ביקורת מרובת סבבים)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>סבבים מינימום</span>
                <input type="number" min={1} max={10}
                  value={automation?.circularMinRounds ?? 1}
                  onChange={(e) => setAutomation((prev) => ({ ...prev, circularMinRounds: Math.max(1, Number(e.target.value) || 1) }))}
                  style={{ padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: 10, fontSize: 12 }}
                />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>סבבים מקסימום</span>
                <input type="number" min={1} max={10}
                  value={automation?.circularMaxRounds ?? 2}
                  onChange={(e) => setAutomation((prev) => ({ ...prev, circularMaxRounds: Math.max(1, Number(e.target.value) || 2) }))}
                  style={{ padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: 10, fontSize: 12 }}
                />
              </label>
            </div>
            <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 10, display: 'grid', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#1F2937' }}>
                <input
                  type="checkbox"
                  checked={automation?.retryEnabled !== false}
                  onChange={(e) => setAutomation((prev) => ({ ...prev, retryEnabled: e.target.checked }))}
                />
                הפעל Retry בכשל בקשה
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>מספר ניסיונות חוזרים</span>
                <input type="number" min={0} max={5}
                  disabled={automation?.retryEnabled === false}
                  value={automation?.maxRetries ?? 2}
                  onChange={(e) => setAutomation((prev) => ({ ...prev, maxRetries: Math.max(0, Number(e.target.value) || 0) }))}
                  style={{ padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: 10, fontSize: 12, background: automation?.retryEnabled === false ? '#F8FAFC' : 'white' }}
                />
              </label>
            </div>
          </div>
        </div>

        {/* ─── כרטיס: Assistant Popup ─── */}
        {assistantBehavior && setAssistantBehavior && (
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 14, padding: '14px', background: '#FFFFFF' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginBottom: 8 }}>🤖 Assistant Popup</div>
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#1F2937' }}>
                <input
                  type="checkbox"
                  checked={assistantBehavior?.autoPopup !== false}
                  onChange={(e) => setAssistantBehavior((prev) => ({ ...prev, autoPopup: e.target.checked }))}
                />
                פתח עוזר אוטומטית כשנתקע בכתיבה
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>זמן עצירה לפני קפיצה (שניות)</span>
                <input type="number" min={2} max={60}
                  disabled={assistantBehavior?.autoPopup === false}
                  value={assistantBehavior?.idleSeconds ?? 5}
                  onChange={(e) => setAssistantBehavior((prev) => ({ ...prev, idleSeconds: Math.max(2, Number(e.target.value) || 5) }))}
                  style={{ padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: 10, fontSize: 12, width: 120 }}
                />
              </label>
            </div>
          </div>
        )}

        {/* ─── כרטיס: AI Quick Actions ─── */}
        {wordPrefs?.aiQuickActions && setWordPrefs && (
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 14, padding: '14px', background: '#FFFFFF', gridColumn: 'span 2' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', flex: 1 }}>⚡ AI Quick Actions בסרגל</div>
              <button
                onClick={() => setWordPrefs((prev) => ({ ...prev, aiQuickActions: Object.fromEntries(Object.keys(prev.aiQuickActions || {}).map((k) => [k, true])) }))}
                style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid #CBD5E1', background: 'white', cursor: 'pointer', fontSize: 11 }}
              >הפעל הכל</button>
              <button
                onClick={() => setWordPrefs((prev) => ({ ...prev, aiQuickActions: Object.fromEntries(Object.keys(prev.aiQuickActions || {}).map((k) => [k, false])) }))}
                style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', cursor: 'pointer', fontSize: 11 }}
              >כבה הכל</button>
            </div>
            <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.6, marginBottom: 10 }}>
              שלוט אילו כפתורי AI מהיר מוצגים בסרגל הכלים כשמסמנים טקסט.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
              {Object.entries(wordPrefs.aiQuickActions).map(([key, enabled]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#1F2937', padding: '6px 10px', border: `1px solid ${enabled ? '#BFDBFE' : '#E2E8F0'}`, borderRadius: 8, background: enabled ? '#EFF6FF' : '#F8FAFC', cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={!!enabled}
                    onChange={(e) => setWordPrefs((prev) => ({ ...prev, aiQuickActions: { ...prev.aiQuickActions, [key]: e.target.checked } }))}
                  />
                  {DEV_QUICK_ACTION_LABELS[key] || key}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── הגדרות מראה ───
function AppearanceSettings() {
  const themes = [
    { name: 'Word Classic',    vars: { '--word-blue': '#2B579A', '--page-bg': '#E1DFDD', '--text-color': '#323130' }, preview: ['#2B579A', '#E1DFDD'] },
    { name: 'ירוק Office',     vars: { '--word-blue': '#217346', '--page-bg': '#D5E8D4', '--text-color': '#1E3A2B' }, preview: ['#217346', '#D5E8D4'] },
    { name: 'כהה (Dark)',      vars: { '--word-blue': '#3B82F6', '--page-bg': '#1E1E1E', '--text-color': '#D4D4D4' }, preview: ['#1E1E1E', '#2D2D2D'] },
    { name: 'מינימל לבן',     vars: { '--word-blue': '#4B5563', '--page-bg': '#F9FAFB', '--text-color': '#111827' }, preview: ['#4B5563', '#F9FAFB'] },
    { name: 'סגול',             vars: { '--word-blue': '#7C3AED', '--page-bg': '#EDE9FE', '--text-color': '#2E1065' }, preview: ['#7C3AED', '#EDE9FE'] },
    { name: 'כחול בהיר',       vars: { '--word-blue': '#0369A1', '--page-bg': '#E0F2FE', '--text-color': '#0C4A6E' }, preview: ['#0369A1', '#E0F2FE'] },
  ];
  const applyTheme = (vars) => Object.entries(vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));

  return (
    <div>
      <p style={{ fontSize: 13, color: '#605E5C', marginBottom: 16 }}>ערכת נושא — תחול מיידית:</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {themes.map(t => (
          <button key={t.name} onClick={() => applyTheme(t.vars)}
            style={{ border: '1px solid #E1DFDD', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', background: 'white', textAlign: 'center', transition: 'box-shadow 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
            <div style={{ height: 36, background: `linear-gradient(90deg, ${t.preview[0]} 50%, ${t.preview[1]} 50%)` }} />
            <div style={{ padding: '7px 6px', fontSize: 11, color: '#323130', fontWeight: 500 }}>{t.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── FileMenu ראשי ───
export default function FileMenu({ onClose, onCommand, shortcuts, onShortcutsChange, assistantBehavior, onAssistantBehaviorChange, wordPreferences, onWordPreferencesChange, initialSettingsTab = null, updateCheckToken = 0, lastGenerationAction = null, liveGeneration = null }) {
  const [activePanel, setActivePanel] = useState(initialSettingsTab ? 'settings' : 'main');
  const [settingsTab, setSettingsTab] = useState(initialSettingsTab || 'ai');
  const [settingsSearchQuery, setSettingsSearchQuery] = useState('');
  const openedDirectlyInSettings = Boolean(initialSettingsTab);
  const onboardingSessionActiveRef = useRef(initialSettingsTab === 'onboarding');
  const [config, setConfig] = useState(getProviderConfig);
  const [shortcutsState, setShortcutsState] = useState(shortcuts || getShortcutsConfig());
  const [assistantBehaviorState, setAssistantBehaviorState] = useState(assistantBehavior || getAssistantBehavior());
  const [wordPrefsState, setWordPrefsState] = useState(wordPreferences || getWordPreferences());
  const [personalStyleState, setPersonalStyleState] = useState(getPersonalStyleProfile());
  const personalStyleStateRef = useRef(getPersonalStyleProfile());
  const skipNextPersonalStylePersistRef = useRef(false);
  const [sharedInstructionsState, setSharedInstructionsState] = useState(getSharedAgentInstructions());
  const [skillsState, setSkillsState] = useState(getSkillsConfig());
  const [roleAgents, setRoleAgents] = useState(getRoleAgents());
  const [workspaceAutomationState, setWorkspaceAutomationState] = useState(getWorkspaceAutomation());
  const [saved, setSaved] = useState(false);
  const didHydrate = useRef(false);
  const externalAnalysisAutoRef = useRef('');
  const [inlineUpdateState, setInlineUpdateState] = useState({ status: 'idle', message: '' });
  const [externalAnalysisBusy, setExternalAnalysisBusy] = useState(false);
  const [consumedUpdateCheckToken, setConsumedUpdateCheckToken] = useState(0);
  const pendingUpdateCheckToken = updateCheckToken > consumedUpdateCheckToken ? updateCheckToken : 0;
  const inferredExternalProviderId = deriveExternalAnalysisProviderId(config);
  const normalizedSettingsSearch = normalizeSettingsSearchValue(settingsSearchQuery);
  const settingsSearchTokens = normalizedSettingsSearch ? normalizedSettingsSearch.split(' ').filter(Boolean) : [];
  const settingsSearchResults = settingsSearchTokens.length
    ? SETTINGS_TAB_SEARCH_INDEX.filter((entry) => settingsSearchTokens.every((token) => entry.searchText.includes(token)))
    : [];
  const settingsSearchResultIds = new Set(settingsSearchResults.map((entry) => entry.id));
  const visibleSettingsGroups = settingsSearchTokens.length
    ? SETTINGS_TAB_GROUPS
      .map((group) => ({
        ...group,
        tabs: group.tabs.filter(([id]) => settingsSearchResultIds.has(id)),
      }))
      .filter((group) => group.tabs.length)
    : SETTINGS_TAB_GROUPS;
  const settingsSearchHasNoResults = settingsSearchTokens.length > 0 && settingsSearchResults.length === 0;

  useEffect(() => {
    personalStyleStateRef.current = personalStyleState;
  }, [personalStyleState]);

  const setPersonalStyleDraftState = (updater) => {
    const currentProfile = personalStyleStateRef.current || getPersonalStyleProfile();
    const nextProfile = typeof updater === 'function' ? updater(currentProfile) : updater;
    personalStyleStateRef.current = nextProfile;
    setPersonalStyleState(nextProfile);
    return nextProfile;
  };

  const persistPersonalStyleDraft = (updater) => {
    const currentProfile = mergePersonalStyleForSave(personalStyleStateRef.current || getPersonalStyleProfile());
    const nextProfile = mergePersonalStyleForSave(typeof updater === 'function' ? updater(currentProfile) : updater);
    personalStyleStateRef.current = nextProfile;
    setPersonalStyleState(nextProfile);
    savePersonalStyleProfile(nextProfile);
    return nextProfile;
  };

  const postponeIncompleteOnboarding = () => {
    persistPersonalStyleDraft((prev) => {
      if (String(prev?.onboardingCompletedAt || '').trim()) return prev;
      return {
        ...prev,
        onboardingDismissedAt: '',
        onboardingSnoozedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
    });
  };

  const applyExternalAnalysisResult = (result, persistedProviderId = '') => {
    const metaPatch = {
      externalStyleAnalysisProvider: persistedProviderId,
      externalStyleAnalysisRaw: result?.profilePatch?.externalStyleAnalysisRaw || '',
      externalStyleAnalysisPendingAt: result?.profilePatch?.externalStyleAnalysisPendingAt || '',
      externalStyleAnalysisProcessedAt: result?.profilePatch?.externalStyleAnalysisProcessedAt || '',
      externalStyleAnalysisStatus: result?.profilePatch?.externalStyleAnalysisStatus || '',
      externalStyleAnalysisLastError: result?.profilePatch?.externalStyleAnalysisLastError || '',
    };
    persistPersonalStyleDraft((prev) => ({
      ...prev,
      ...(result?.extracted && typeof result.extracted === 'object' ? mergeExternalStyleExtractionIntoProfile(result.extracted, prev) : {}),
      ...metaPatch,
    }));
  };

  const runExternalAnalysisProcessing = async ({ source = 'manual' } = {}) => {
    const profileSnapshot = mergePersonalStyleForSave(personalStyleState);
    const rawText = String(profileSnapshot.externalStyleAnalysisRaw || '').trim();
    if (!rawText || externalAnalysisBusy) return;

    const explicitProviderId = String(profileSnapshot.externalStyleAnalysisProvider || '').trim();
    const selectedProviderId = explicitProviderId || String(inferredExternalProviderId || config?.active || 'gemini').trim() || 'gemini';
    const availability = getExternalAnalysisAvailability('', config);
    const attemptKey = `${availability.processingProviderId || 'pending'}::${rawText}`;
    if (source === 'auto') externalAnalysisAutoRef.current = attemptKey;

    setExternalAnalysisBusy(true);
    persistPersonalStyleDraft((prev) => ({
      ...prev,
      externalStyleAnalysisProvider: explicitProviderId,
      externalStyleAnalysisRaw: rawText,
      externalStyleAnalysisStatus: availability.hasLocalProvider ? 'processing' : 'pending-provider',
      externalStyleAnalysisPendingAt: prev.externalStyleAnalysisPendingAt || new Date().toISOString(),
      externalStyleAnalysisProcessedAt: '',
      externalStyleAnalysisLastError: '',
    }));
    try {
      const result = await processExternalStyleAnalysis({
        rawText,
        profile: {
          ...profileSnapshot,
          externalStyleAnalysisProvider: explicitProviderId,
        },
        preferredProviderId: selectedProviderId,
        processingProviderId: availability.processingProviderId,
        providerConfig: config,
      });
      applyExternalAnalysisResult(result, explicitProviderId);
    } catch (error) {
      persistPersonalStyleDraft((prev) => ({
        ...prev,
        externalStyleAnalysisProvider: explicitProviderId,
        externalStyleAnalysisRaw: rawText,
        externalStyleAnalysisStatus: availability.hasLocalProvider ? 'error' : 'pending-provider',
        externalStyleAnalysisPendingAt: prev.externalStyleAnalysisPendingAt || new Date().toISOString(),
        externalStyleAnalysisProcessedAt: '',
        externalStyleAnalysisLastError: error?.message || 'שגיאה בעיבוד התוצאה החיצונית.',
      }));
    } finally {
      setExternalAnalysisBusy(false);
    }
  };

  useEffect(() => {
    if (initialSettingsTab) {
      setActivePanel('settings');
      setSettingsTab(initialSettingsTab);
      if (initialSettingsTab === 'onboarding') onboardingSessionActiveRef.current = true;
    }
  }, [initialSettingsTab]);

  useEffect(() => {
    if (settingsTab === 'onboarding') onboardingSessionActiveRef.current = true;
  }, [settingsTab]);

  useEffect(() => {
    const syncWorkspaceState = () => {
      const nextAutomation = getWorkspaceAutomation();
      const nextAgents = getRoleAgents();
      setWorkspaceAutomationState((prev) => (JSON.stringify(prev) === JSON.stringify(nextAutomation) ? prev : nextAutomation));
      setRoleAgents((prev) => (JSON.stringify(prev) === JSON.stringify(nextAgents) ? prev : nextAgents));
    };

    if (typeof window === 'undefined') return undefined;
    window.addEventListener('wordai-workspace-changed', syncWorkspaceState);
    return () => window.removeEventListener('wordai-workspace-changed', syncWorkspaceState);
  }, []);

  useEffect(() => {
    const syncProfile = () => {
      const nextProfile = getPersonalStyleProfile();
      const currentProfile = buildComparablePersonalStyleProfile(personalStyleStateRef.current || {});
      const comparableNextProfile = buildComparablePersonalStyleProfile(nextProfile);
      if (JSON.stringify(currentProfile) === JSON.stringify(comparableNextProfile)) return;
      skipNextPersonalStylePersistRef.current = true;
      personalStyleStateRef.current = nextProfile;
      setPersonalStyleState(nextProfile);
    };

    syncProfile();
    window.addEventListener('wordai-personal-style-updated', syncProfile);
    window.addEventListener('wordai-settings-hydrated', syncProfile);
    return () => {
      window.removeEventListener('wordai-personal-style-updated', syncProfile);
      window.removeEventListener('wordai-settings-hydrated', syncProfile);
    };
  }, []);

  useEffect(() => {
    const rawText = String(personalStyleState.externalStyleAnalysisRaw || '').trim();
    if (!rawText || externalAnalysisBusy) return;
    if (String(personalStyleState.externalStyleAnalysisStatus || '').trim() !== 'pending-provider') return;

    const availability = getExternalAnalysisAvailability('', config);
    if (!availability.hasLocalProvider) return;

    const attemptKey = `${availability.processingProviderId || 'pending'}::${rawText}`;
    if (externalAnalysisAutoRef.current === attemptKey) return;
    runExternalAnalysisProcessing({ source: 'auto' });
  }, [personalStyleState.externalStyleAnalysisRaw, personalStyleState.externalStyleAnalysisStatus, personalStyleState.externalStyleAnalysisProvider, config, externalAnalysisBusy]);

  useEffect(() => {
    if (!didHydrate.current) {
      didHydrate.current = true;
      return;
    }

    const normalizedPersonalStyle = mergePersonalStyleForSave(personalStyleState);
    const shouldSkipPersonalStylePersist = skipNextPersonalStylePersistRef.current;
    const persistedComparableProfile = buildComparablePersonalStyleProfile(getPersonalStyleProfile());
    const nextComparableProfile = buildComparablePersonalStyleProfile(normalizedPersonalStyle);
    const shouldPersistPersonalStyle = !shouldSkipPersonalStylePersist
      && JSON.stringify(persistedComparableProfile) !== JSON.stringify(nextComparableProfile);
    skipNextPersonalStylePersistRef.current = false;

    saveProviderConfig(config);
    saveShortcutsConfig(shortcutsState);
    saveAssistantBehavior(assistantBehaviorState);
    saveWordPreferences(wordPrefsState);
    localStorage.setItem('default-font', wordPrefsState.defaultFontFamily || 'Alef');
    localStorage.setItem('default-font-stack', wordPrefsState.defaultFontStack || wordPrefsState.defaultFontFamily || 'Alef');
    localStorage.setItem('default-size', wordPrefsState.defaultFontSize || '12pt');
    if (shouldPersistPersonalStyle) {
      savePersonalStyleProfile(normalizedPersonalStyle);
    }
    saveSharedAgentInstructions(sharedInstructionsState);
    saveSkillsConfig(skillsState);
    saveRoleAgents(roleAgents);
    saveWorkspaceAutomation(workspaceAutomationState);
    const nextDocumentStyle = normalizedPersonalStyle.defaultDocumentStyle || 'academic';
    if (localStorage.getItem('wordai_document_style') !== nextDocumentStyle) {
      localStorage.setItem('wordai_document_style', nextDocumentStyle);
      onCommand?.('applyDocumentStyle', nextDocumentStyle);
    }
    onShortcutsChange?.(shortcutsState);
    onAssistantBehaviorChange?.(assistantBehaviorState);
    onWordPreferencesChange?.(wordPrefsState);
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), 1200);
    return () => clearTimeout(timer);
  }, [config, shortcutsState, assistantBehaviorState, wordPrefsState, personalStyleState, sharedInstructionsState, skillsState, roleAgents, workspaceAutomationState, onShortcutsChange, onAssistantBehaviorChange, onWordPreferencesChange]);

  const menuItems = [
    { id: 'openFile',   icon: 'ph-fill ph-folder-open',   label: 'פתח מהמחשב',         desc: 'פותח מסמך מקומי' },
    { id: 'newDoc',     icon: 'ph-fill ph-file',          label: 'מסמך ריק חדש',       desc: 'מנקה את תוכן העורך' },
    { id: 'saveLocal',  icon: 'ph-fill ph-floppy-disk',   label: 'שמור',               desc: 'שומר למחשב. המטמון מתעדכן אוטומטית ברקע' },
    { id: 'saveAs',     icon: 'ph-fill ph-floppy-disk-back', label: 'שמור עותק בשם', desc: 'שמירת עותק חדש לכל תיקייה במחשב' },
    { id: 'exportDocx', icon: 'ph-fill ph-microsoft-word',label: 'הורד ל-Word (.docx)', desc: 'מייצא קובץ Word אמיתי בפורמט DOCX' },
    { id: 'print',      icon: 'ph-fill ph-printer',       label: 'הדפסה / ייצוא PDF',  desc: 'פותח תפריט הדפסה' },
  ];

  const handleItem = (id) => { onCommand(id); if (id !== 'print') onClose(); };

  const maybePostponeOnboardingSession = () => {
    const currentProfile = personalStyleStateRef.current || getPersonalStyleProfile();
    const shouldPostpone = onboardingSessionActiveRef.current && !String(currentProfile?.onboardingCompletedAt || '').trim();
    onboardingSessionActiveRef.current = false;
    if (shouldPostpone) postponeIncompleteOnboarding();
  };

  const closeFileMenu = () => {
    maybePostponeOnboardingSession();
    onClose();
  };

  const closeSettingsPanel = () => {
    maybePostponeOnboardingSession();
    setSettingsSearchQuery('');
    if (openedDirectlyInSettings) {
      onClose();
      return;
    }
    setActivePanel('main');
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      if (activePanel === 'settings') {
        closeSettingsPanel();
        return;
      }
      closeFileMenu();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [activePanel, closeFileMenu, closeSettingsPanel]);

  const handleSave = () => {
    const normalizedPersonalStyle = mergePersonalStyleForSave(personalStyleState);

    saveProviderConfig(config);
    saveShortcutsConfig(shortcutsState);
    saveAssistantBehavior(assistantBehaviorState);
    saveWordPreferences(wordPrefsState);
    localStorage.setItem('default-font', wordPrefsState.defaultFontFamily || 'Alef');
    localStorage.setItem('default-font-stack', wordPrefsState.defaultFontStack || wordPrefsState.defaultFontFamily || 'Alef');
    localStorage.setItem('default-size', wordPrefsState.defaultFontSize || '12pt');
    savePersonalStyleProfile(normalizedPersonalStyle);
    saveSharedAgentInstructions(sharedInstructionsState);
    saveSkillsConfig(skillsState);
    saveRoleAgents(roleAgents);
    saveWorkspaceAutomation(workspaceAutomationState);
    const nextDocumentStyle = normalizedPersonalStyle.defaultDocumentStyle || 'academic';
    if (localStorage.getItem('wordai_document_style') !== nextDocumentStyle) {
      localStorage.setItem('wordai_document_style', nextDocumentStyle);
      onCommand?.('applyDocumentStyle', nextDocumentStyle);
    }
    onShortcutsChange?.(shortcutsState);
    onAssistantBehaviorChange?.(assistantBehaviorState);
    onWordPreferencesChange?.(wordPrefsState);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const sideBtn = (id, icon, label, isSettings = false) => (
    <button
      key={id}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 6, fontSize: 13, background: (activePanel === id || (isSettings && activePanel === 'settings')) ? 'rgba(255,255,255,0.25)' : 'none', border: 'none', color: 'white', cursor: 'pointer', textAlign: 'right', width: '100%', transition: 'background 0.15s' }}
      onClick={() => isSettings ? setActivePanel('settings') : handleItem(id)}
      onMouseEnter={e => { if (!((activePanel === id) || (isSettings && activePanel === 'settings'))) e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
      onMouseLeave={e => { if (!((activePanel === id) || (isSettings && activePanel === 'settings'))) e.currentTarget.style.background = 'none'; }}>
      <i className={icon} style={{ fontSize: 16, flexShrink: 0 }} />
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[999] bg-slate-900/30 backdrop-blur-sm transition-opacity duration-300" dir="rtl"
      onClick={e => { if (e.target === e.currentTarget && activePanel !== 'settings') closeFileMenu(); }}>

      {/* ─── Sliding Sidebar Drawer ─── */}
      <div className={`absolute top-0 right-0 bottom-0 w-[240px] sm:w-[280px] bg-gradient-to-b from-slate-950 via-slate-900 to-indigo-950 border-x-0 transition-transform duration-300 shadow-2xl flex flex-col ${activePanel === 'settings' ? 'pointer-events-none translate-x-full' : 'translate-x-0'}`}>
        <div className="flex flex-col items-center justify-center gap-3 px-6 pt-10 pb-8 border-b border-white/5">
          <div className="w-14 h-14 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-[18px] shadow-lg shadow-indigo-500/20 flex items-center justify-center">
              <i className="ph-fill ph-circles-four text-white text-[28px]" />
          </div>
          <div className="text-center mt-2">
            <div className="text-white font-extrabold text-xl tracking-wide">WordFlow OS</div>
            <div className="text-indigo-300/80 text-[10px] font-bold tracking-widest uppercase mt-1">Workspace Settings</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-1.5 scrollbar-hide">
          <div className="px-2 py-1 text-[10px] font-bold text-slate-500 tracking-widest mb-1 mt-1">קובץ ומסמך</div>
          {menuItems.map(item => (
            <button key={item.id} className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 hover:translate-x-[-2px] transition-transform w-full text-right group outline-none focus:ring-1 focus:ring-indigo-400/50" onClick={() => handleItem(item.id)}>
              <i className={`${item.icon} text-lg text-indigo-400/70 group-hover:text-indigo-300 group-hover:scale-110 transition-transform`} />
              <span className="font-semibold text-[13px]">{item.label}</span>
            </button>
          ))}

          <div className="h-px bg-white/5 my-3 mx-2" />

          <div className="px-2 py-1 text-[10px] font-bold text-slate-500 tracking-widest mb-1">הגדרות מערכת</div>
          <div className="flex flex-col gap-1">
            <button
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 hover:translate-x-[-2px] transition-transform w-full text-right group outline-none focus:ring-1 focus:ring-indigo-400/50"
              disabled={inlineUpdateState.status === 'checking'}
              onClick={async () => {
                if (!window.desktopApp?.checkForAppUpdates) {
                  setInlineUpdateState({ status: 'error', message: 'זמין רק באפליקציה' });
                  return;
                }
                setInlineUpdateState({ status: 'checking', message: 'בודק...' });
                try {
                  const result = await window.desktopApp.checkForAppUpdates();
                  const s = String(result?.status || '').toLowerCase();
                  if (['downloaded', 'downloading', 'update-available', 'manual-download'].includes(s)) {
                    setInlineUpdateState({ status: 'available', message: 'עדכון זמין!' });
                  } else if (['up-to-date', 'not-available', 'dev-mode', 'unavailable'].includes(s)) {
                    setInlineUpdateState({ status: 'uptodate', message: 'הגרסה עדכנית ✓' });
                    setTimeout(() => setInlineUpdateState({ status: 'idle', message: '' }), 4000);
                  } else {
                    setInlineUpdateState({ status: 'uptodate', message: 'בדיקה הושלמה ✓' });
                    setTimeout(() => setInlineUpdateState({ status: 'idle', message: '' }), 4000);
                  }
                } catch {
                  setInlineUpdateState({ status: 'error', message: 'שגיאה בבדיקה' });
                  setTimeout(() => setInlineUpdateState({ status: 'idle', message: '' }), 4000);
                }
              }}>
              <i className={`ph-fill ph-arrow-circle-up text-lg transition-transform ${inlineUpdateState.status === 'checking' ? 'animate-spin text-yellow-400/80' : inlineUpdateState.status === 'available' ? 'text-yellow-400' : 'text-emerald-400/70 group-hover:text-emerald-300 group-hover:scale-110'}`} />
              <div className="flex flex-col items-start">
                <span className="font-semibold text-[13px]">בדוק עדכונים</span>
                {inlineUpdateState.message && (
                  <span className={`text-[10px] font-medium mt-0.5 ${inlineUpdateState.status === 'available' ? 'text-yellow-400' : inlineUpdateState.status === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                    {inlineUpdateState.message}
                  </span>
                )}
              </div>
            </button>

            {inlineUpdateState.status === 'available' && (
              <div className="px-4">
                <button
                  className="text-[10px] bg-yellow-400/20 border border-yellow-400/40 text-yellow-300 px-2 py-0.5 rounded-lg hover:bg-yellow-400/40 transition-colors"
                  onClick={() => { setActivePanel('settings'); setSettingsTab('updates'); }}>
                  פרטים והתקנה
                </button>
              </div>
            )}
          </div>

          <button
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-white bg-indigo-500/20 border border-indigo-500/30 hover:bg-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/10 transition-all w-full text-right group mt-2 outline-none focus:ring-2 focus:ring-indigo-400/50"
            onClick={() => { setActivePanel('settings'); setSettingsTab('developer'); }}>
            <i className="ph-fill ph-sliders-horizontal text-lg text-indigo-300 group-hover:text-white transition-colors" />
            <span className="font-bold text-[13px]">הגדרות מתקדמות</span>
          </button>
        </div>
        
        <div className="px-4 pb-4 pt-2">
            <button className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-slate-400 bg-black/20 hover:text-white hover:bg-black/40 transition-colors w-full outline-none focus:ring-1 focus:ring-indigo-400/50" onClick={closeFileMenu}>
              <i className="ph ph-x text-sm" />
              <span className="font-semibold text-xs">חזור לעריכה</span>
            </button>
        </div>

        <div className="pb-4 text-center text-[10px] text-slate-600 font-mono tracking-wider opacity-60">
          WF-OS v1.0.13
        </div>
      </div>

      {/* ─── Settings Popup Modal ─── */}
      {activePanel === 'settings' && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-md transition-opacity duration-200" onClick={closeSettingsPanel}>
          <div className={`${settingsTab === 'onboarding' ? 'bg-transparent w-full max-w-[1400px] h-[95vh] border-none shadow-none' : 'bg-slate-50 w-full max-w-[1280px] h-[90vh] sm:h-[85vh] rounded-[24px] shadow-2xl border border-slate-200/60'} flex flex-col overflow-hidden`} onClick={e => e.stopPropagation()}>
             {/* POPUP HEADER */}
             <div className="bg-white px-6 sm:px-8 py-5 border-b border-slate-200 flex items-center justify-between shadow-sm z-10 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center shadow-inner border border-indigo-100/50">
                        <i className="ph-fill ph-gear-fine text-[26px] text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-xl sm:text-2xl font-extrabold text-slate-800 tracking-tight">הגדרות סביבת עבודה</h2>
                        <div className="text-[12px] sm:text-[13px] text-slate-500 font-semibold mt-0.5" dir="rtl">WordFlow OS &mdash; Advanced Configuration</div>
                    </div>
                </div>
                <button onClick={closeSettingsPanel} className="w-10 h-10 bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 rounded-full flex items-center justify-center transition-colors outline-none focus:ring-2 focus:ring-rose-200">
                    <i className="ph ph-x text-lg font-bold" />
                </button>
             </div>
             
             {/* POPUP CONTENT (TABS + SCREENS) */}
             <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 bg-slate-50/50 custom-scrollbar-slim">
                <div className="bg-white border border-slate-200/70 rounded-2xl p-4 sm:p-5 shadow-sm mb-6 md:mb-8">
                  <div className="flex flex-col gap-3">
                    <div>
                      <div className="text-[12px] font-bold text-slate-700">חיפוש מהיר בהגדרות</div>
                      <div className="text-[11px] text-slate-500 mt-1">אפשר לחפש לפי טאב או מילות מפתח כמו API, timeout, logs, workspace או updates.</div>
                    </div>
                    <div className="relative">
                      <i className="ph ph-magnifying-glass absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                      <input
                        type="text"
                        dir="auto"
                        value={settingsSearchQuery}
                        onChange={(e) => setSettingsSearchQuery(e.target.value)}
                        placeholder="חפש טאב, ספק, timeout, logs, updates או profile"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pr-11 pl-10 text-[13px] font-medium text-slate-700 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100/70"
                      />
                      {settingsSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setSettingsSearchQuery('')}
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-colors outline-none focus:ring-2 focus:ring-slate-200"
                        >
                          <i className="ph ph-x text-sm" />
                        </button>
                      )}
                    </div>

                    {settingsSearchTokens.length > 0 && (
                      settingsSearchHasNoResults ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] font-semibold text-amber-700">
                          לא נמצאו הגדרות תואמות
                        </div>
                      ) : (
                        <div>
                          <div className="text-[11px] font-bold text-slate-400 mb-2 tracking-widest">קפיצה ישירה</div>
                          <div className="flex flex-wrap gap-2">
                            {settingsSearchResults.map((entry) => (
                              <button
                                key={entry.id}
                                type="button"
                                onClick={() => setSettingsTab(entry.id)}
                                className={`px-3 py-2 rounded-xl text-[12px] font-semibold border transition-all outline-none focus:ring-2 ${settingsTab === entry.id ? 'bg-indigo-600 text-white border-indigo-600 focus:ring-indigo-200' : 'bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100 focus:ring-indigo-100'}`}
                              >
                                {entry.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>

                {visibleSettingsGroups.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6 md:mb-8">
                    {visibleSettingsGroups.map((group) => (
                      <div key={group.title} className="bg-white border border-slate-200/70 rounded-2xl p-4 shadow-sm hover:border-slate-300 transition-colors">
                        <div className="text-[11px] font-bold text-slate-400 mb-3 tracking-widest">{group.title}</div>
                        <div className="flex flex-col gap-1.5">
                          {group.tabs.map(([id, label]) => (
                            <button key={id} onClick={() => setSettingsTab(id)}
                              className={`w-full text-right px-3 py-2 rounded-xl text-[12px] sm:text-[13px] font-semibold transition-all outline-none focus:ring-2 ${settingsTab === id ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm focus:ring-indigo-100' : 'bg-transparent text-slate-600 border border-transparent hover:bg-slate-50 hover:text-slate-900 focus:ring-slate-100 focus:bg-slate-50'}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="bg-white rounded-3xl p-5 sm:p-8 border border-slate-200 shadow-sm min-h-[500px]">
                  {settingsTab === 'guide'       && <GuideSettings activeTab={settingsTab} onNavigate={setSettingsTab} />}
                  {settingsTab === 'ai'          && <AiSettings config={config} setConfig={setConfig} />}
                  {settingsTab === 'prompt'      && <PromptSettings sharedInstructions={sharedInstructionsState} setSharedInstructions={setSharedInstructionsState} personalStyle={personalStyleState} setPersonalStyle={setPersonalStyleState} />}
                  {settingsTab === 'skills'      && <SkillsSettings skillsState={skillsState} setSkillsState={setSkillsState} />}
                  {settingsTab === 'agents'      && (
                    <div>
                      <WorkspacesManager 
                        automation={workspaceAutomationState} 
                        setAutomation={setWorkspaceAutomationState}
                        setAgents={setRoleAgents}
                        config={config}
                        onWorkspaceChange={() => {
                          const nextAgents = getRoleAgents();
                          setRoleAgents((prev) => (JSON.stringify(prev) === JSON.stringify(nextAgents) ? prev : nextAgents));
                        }}
                      />
                      <div id="role-agents-settings">
                        <RoleAgentsSettings agents={roleAgents} setAgents={setRoleAgents} automation={workspaceAutomationState} setAutomation={setWorkspaceAutomationState} config={config} />
                      </div>
                    </div>
                  )}
                  {settingsTab === 'updates'     && (
                    <UpdateSettings
                      checkToken={pendingUpdateCheckToken}
                      onCheckTokenConsumed={(token) => setConsumedUpdateCheckToken((prev) => Math.max(prev, Number(token) || 0))}
                    />
                  )}
                  {settingsTab === 'developer'   && <DeveloperSettings config={config} setConfig={setConfig} automation={workspaceAutomationState} setAutomation={setWorkspaceAutomationState} setAgents={setRoleAgents} assistantBehavior={assistantBehaviorState} setAssistantBehavior={setAssistantBehaviorState} wordPrefs={wordPrefsState} setWordPrefs={setWordPrefsState} lastGenerationAction={lastGenerationAction} liveGeneration={liveGeneration} />}
                  {settingsTab === 'assistant'   && <AssistantBehaviorSettings behavior={assistantBehaviorState} setBehavior={setAssistantBehaviorState} />}      
                  {settingsTab === 'debug'       && <DebugConsoleSettings automation={workspaceAutomationState} />}
                  {settingsTab === 'onboarding'  && (
                    <OnboardingTabContainer
                      profile={personalStyleState}
                      setProfile={setPersonalStyleDraftState}
                      persistProfile={persistPersonalStyleDraft}
                      setProviderConfig={setConfig}
                      externalAnalysisBusy={externalAnalysisBusy}
                      providerConfig={config}
                      onOpenAiSettings={() => setSettingsTab('ai')}
                      onOpenPersonalStyle={() => setSettingsTab('personal')}
                      onDismiss={closeSettingsPanel}
                      onSubmitExternalAnalysis={() => runExternalAnalysisProcessing({ source: 'manual' })}
                    />
                  )}
                  {settingsTab === 'writing'     && <WordDefaultsSettings prefs={wordPrefsState} setPrefs={setWordPrefsState} />}
                  {settingsTab === 'personal'    && <PersonalStyleSettings profile={personalStyleState} setProfile={setPersonalStyleState} />}
                  {settingsTab === 'appearance'  && <AppearanceSettings />}       
                </div>

                {/* Footer Actions */}
                <div className="mt-6 md:mt-8 flex flex-wrap gap-4 items-center justify-end bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm">
                  <div className="flex-1 text-[12px] text-slate-400 font-semibold px-2">
                     * שינויים מוחלים מיד בלחיצה על שמירה.
                  </div>
                  <button onClick={closeSettingsPanel}
                    className="px-6 py-2.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-xl cursor-pointer text-[13px] sm:text-[14px] font-bold hover:bg-slate-100 transition-colors shadow-sm focus:ring-2 focus:ring-slate-200 outline-none">
                    בטל וחזור לתפריט
                  </button>
                  <button onClick={handleSave}
                    className={`px-8 py-2.5 text-white rounded-xl cursor-pointer text-[13px] sm:text-[14px] font-bold transition-all shadow-md outline-none focus:ring-2 ${saved ? 'bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 shadow-emerald-600/30 focus:ring-emerald-200' : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 border border-indigo-500 shadow-indigo-600/30 focus:ring-indigo-200'}`}>
                    {saved ? '✓ עודכן בהצלחה!' : 'שמור והחל שינויים'}
                  </button>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}





