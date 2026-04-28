import React, { useEffect, useRef, useState } from "react";
import ProfileOnboarding from './ProfileOnboarding';
import {
  DEFAULT_PERSONAL_STYLE,
  buildExternalStyleAnalysisPrompt,
  getExternalAnalysisProviderHint,
  getProviderConfig,
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
  processExternalStyleAnalysis,
  testProviderConnection,
} from "./services/aiService";
import { loadProjectMaterials, saveHelperMaterial, syncLearnedStyleFromWorkspace, MATERIAL_UPLOAD_PRESETS, getMaterialUploadMeta } from "./services/workspaceLearningService";

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

const PROVIDER_MODEL_OPTIONS = {
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
  openai: ['gpt-4o', 'gpt-4.1', 'gpt-4o-mini'],
  claude: ['claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-opus-4-7'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
  perplexity: ['sonar-pro', 'sonar', 'sonar-reasoning-pro'],
  ollama: ['llama3.2', 'qwen2.5', 'mistral'],
  custom: ['deepseek-chat', 'mistral-large-latest', 'openrouter/auto', 'grok-3-mini-beta', 'loaded-model'],
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
    tabs: [['debug', '🪵 לוגים']],
  },
];

const mergeUniqueStrings = (values = []) => [...new Set((Array.isArray(values) ? values : [values])
  .flatMap((item) => (Array.isArray(item) ? item : [item]))
  .map((item) => String(item || '').trim())
  .filter(Boolean))];

const mergePersonalStyleForSave = (draft = {}) => {
  const live = getPersonalStyleProfile();
  return finalizePersonalProfile({
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
  });
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
function FieldRow({ label, type = 'text', placeholder, value, onChange, hint }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 11, color: '#605E5C', display: 'block', marginBottom: 3, fontWeight: 500 }}>{label}</label>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type={type === 'password' && !show ? 'password' : 'text'}
          placeholder={placeholder} value={value || ''}
          onChange={e => onChange(e.target.value)}
          style={{ flex: 1, padding: '7px 10px', border: '1px solid #C8C6C4', borderRadius: 4, fontSize: 12, direction: 'ltr', fontFamily: 'monospace', outline: 'none' }} />
        {type === 'password' && (
          <button type="button" onClick={() => setShow(v => !v)} style={{ padding: '0 10px', border: '1px solid #C8C6C4', borderRadius: 4, background: 'white', cursor: 'pointer', fontSize: 12 }}>
            {show ? '🙈' : '👁️'}
          </button>
        )}
      </div>
      {hint && <div style={{ fontSize: 10, color: '#919191', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

// ─── כפתור בדיקת תקינות API ───
function ApiTestButton({ providerId, providerConfig }) {
  const [status, setStatus] = useState(null); // null | 'loading' | 'ok' | 'fail'
  const [resultText, setResultText] = useState('');

  const handleTest = async () => {
    setStatus('loading');
    setResultText('');
    try {
      const result = await testProviderConnection(providerId, providerConfig);
      if (result.ok) {
        setStatus('ok');
        const modelLabel = result.model ? ` (${result.model})` : '';
        const tried = result.triedModels.length > 1 ? ` · ניסה ${result.triedModels.length} מודלים` : '';
        setResultText(`✅ מחובר${modelLabel}${tried}`);
      } else {
        setStatus('fail');
        const tried = result.triedModels.length ? ` · נוסו: ${result.triedModels.join(', ')}` : '';
        setResultText(`❌ נכשל: ${result.error}${tried}`);
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
            const isDisabled = config.multiModelEnabled !== true || (!configured && !isSelected);
            return (
              <label key={providerId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: isDisabled ? '#64748B' : '#14532D', background: 'white', border: `1px solid ${isDisabled ? '#E5E7EB' : '#BBF7D0'}`, borderRadius: 999, padding: '6px 10px', opacity: isDisabled ? 0.7 : 1 }}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={isDisabled}
                  onChange={() => toggleMultiProvider(providerId)}
                />
                {label}{configured ? '' : ' (לא מוגדר)'}
              </label>
            );
          })}
        </div>
        <div style={{ fontSize: 10, color: '#166534', marginTop: 8 }}>
          רק מנועים שהוגדרו במלואם ניתנים לבחירה להפעלה משולבת.
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
          options={PROVIDER_MODEL_OPTIONS.gemini}
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
          options={PROVIDER_MODEL_OPTIONS.openai}
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
          options={PROVIDER_MODEL_OPTIONS.claude}
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
          options={PROVIDER_MODEL_OPTIONS.groq}
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
          options={PROVIDER_MODEL_OPTIONS.perplexity}
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
          options={PROVIDER_MODEL_OPTIONS.ollama}
          hint="אפשר לבחור מהרשימה או להקליד ידנית"
        />
        <ApiTestButton providerId="ollama" providerConfig={{ baseUrl: config.ollama?.baseUrl, model: config.ollama?.model }} />
      </ProviderSection>

      <ProviderSection title="Google Scholar / SerpAPI" icon="🎓" active={false} configured={isProviderConfigured(config, 'scholar')} onActivate={() => {}} allowActivate={false}
        description="אם קיבלת מפתח דרך SerpAPI, אפשר לשמור אותו כאן לשימוש במחקר וחיפוש מקורות. הוצא מפתח מכאן: https://serpapi.com/google-scholar-api">
        <FieldRow label="מפתח SerpAPI" type="password" placeholder="your_serpapi_key" value={config.scholar?.key}
          onChange={v => update('scholar', 'key', v)} hint="המפתח משמש לחיבור חיפושי Google Scholar" />
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

function PromptSettings({ sharedInstructions, setSharedInstructions, personalStyle }) {
  const [copyState, setCopyState] = useState('');
  const portablePrompt = buildPortablePrompt({
    sharedInstructions,
    profile: personalStyle,
  });

  const copyPortablePrompt = async () => {
    try {
      await navigator.clipboard.writeText(portablePrompt || '');
      setCopyState('הועתק ללוח');
    } catch {
      setCopyState('ההעתקה נכשלה');
    } finally {
      setTimeout(() => setCopyState(''), 1800);
    }
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: '#605E5C', marginBottom: 16, lineHeight: 1.7 }}>
        כאן מגדירים prompt קבוע ונייד שאפשר להעתיק לכל ספק AI. ה-preview משלב אוטומטית את ההנחיות המשותפות עם הפרופיל והסגנון האישי הקיימים.
      </p>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 8 }}>הנחיות משותפות לכל ספקי AI</div>
        <textarea
          value={sharedInstructions}
          onChange={(e) => setSharedInstructions(e.target.value)}
          rows={7}
          placeholder="למשל: כתוב בעברית תקנית, אל תמציא מקורות, שמור על טון ענייני, אל תוסיף מבוא אם לא ביקשו"
          style={{ width: '100%', padding: '10px 12px', border: '1px solid #C8C6C4', borderRadius: 10, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
        />
        <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.6 }}>
          הפרופיל האישי, העדפות הסגנון והלמידה הקיימת מצטרפים אוטומטית ל-preview שמתחת, בלי להעמיס על StartScreen.
        </div>
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: '#FAFAFA' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#323130' }}>Portable Prompt מוכן להעתקה</div>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>אותו prompt יעבוד גם ב-Claude, Gemini, ChatGPT או כל ספק אחר.</div>
          </div>
          <button
            type="button"
            onClick={copyPortablePrompt}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
          >
            העתק Prompt
          </button>
        </div>

        <textarea
          readOnly
          value={portablePrompt}
          rows={14}
          style={{ width: '100%', padding: '10px 12px', border: '1px solid #CBD5E1', borderRadius: 10, fontSize: 12, resize: 'vertical', background: 'white', color: '#0F172A' }}
        />

        {copyState ? <div style={{ fontSize: 11, color: copyState === 'הועתק ללוח' ? '#166534' : '#991B1B', marginTop: 8 }}>{copyState}</div> : null}
      </div>
    </div>
  );
}

const splitList = (value) => String(value || '').split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
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

function GuideSettings() {
  const [memorySnapshot, setMemorySnapshot] = useState(() => getAppMemory());
  const demoPrompts = [
    { title: 'שכתוב מהיר', text: 'שכתב את הפסקה הזאת בצורה טבעית וברורה יותר' },
    { title: 'הפעלת סוכן', text: '@writer נסח לי פתיח קצר ומקצועי למייל הזה' },
    { title: 'הפעלת סקיל', text: '/academic-structure בנה לי שלד לעבודה על מנהיגות דיגיטלית' },
    { title: 'מקורות מחקר', text: '/source-hunter תן לי מילות חיפוש ל-Google Scholar על חרדת מבחנים' },
  ];

  const resetSavedMemory = () => {
    clearAppMemory();
    try {
      clearSidebarChatHistory({ clearAll: true });
    } catch {}
    setMemorySnapshot(getAppMemory());
  };

  return (
    <div>
      <div style={{ border: '1px solid #DBEAFE', borderRadius: 12, padding: '14px', background: '#F8FBFF', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E3A8A', marginBottom: 6 }}>מדריך שימוש מלא ל-WordFlow AI</div>
        <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.7 }}>
          ריכזתי את כל הפעולות במקום אחד ברור: יצירת מסמך, עבודה עם הסוכן, שימוש בסקילים, והבנה איפה כל הגדרה נמצאת.
        </div>
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#323130' }}>זיכרון מתמשך</div>
          <button onClick={resetSavedMemory} style={{ border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', borderRadius: 8, padding: '7px 10px', fontSize: 11, cursor: 'pointer' }}>
            אפס זיכרון שמור
          </button>
        </div>
        <div style={{ fontSize: 11, color: '#605E5C', lineHeight: 1.6 }}>
          האפליקציה שומרת מקומית את היסטוריית הצ'אט האחרונה, הסוכן האחרון, הסקיל האחרון והעדפות שנלמדו, כדי שלא תצטרך להסביר הכול מחדש בכל פתיחה.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          <span style={{ fontSize: 10, background: '#EEF2FF', color: '#3730A3', padding: '4px 8px', borderRadius: 999 }}>שיחות שמורות: {(memorySnapshot.recentChats || []).length}</span>
          <span style={{ fontSize: 10, background: '#ECFDF5', color: '#166534', padding: '4px 8px', borderRadius: 999 }}>תזכורות פעילות: {(memorySnapshot.memoryNotes || []).length}</span>
          <span style={{ fontSize: 10, background: '#F8FAFC', color: '#334155', padding: '4px 8px', borderRadius: 999 }}>סקיל אחרון: {memorySnapshot.lastSelectedSkillId || 'ללא'}</span>
        </div>
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 10 }}>איפה עושים כל דבר?</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            { title: 'דף הבית', text: 'רק להתחלת מסמך, פתיחת טיוטה וטעינת חומרי עזר.' },
            { title: 'הגדרות', text: 'כל מה שקשור לסקילים, זיכרון, סגנון אישי, גופנים ומנועי AI.' },
            { title: 'חלונית AI', text: 'לשאול, לשכתב, לבחור סוכן עם @ או סקיל עם /.' },
          ].map((item) => (
            <div key={item.title} style={{ border: '1px solid #E5E7EB', borderRadius: 10, padding: '10px 11px', background: '#FAFAFA' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>{item.title}</div>
              <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.6 }}>{item.text}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 10 }}>זרימת עבודה מומלצת</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {[
            '1. פתח מסמך ריק או בחר תבנית מדף הבית.',
            '2. אם צריך, צרף חומרי עזר והנחיות למסמך הנוכחי בלבד.',
            '3. פתח את חלונית ה-AI ובקש ניסוח, שכתוב או בניית שלד.',
            '4. הקלד @ כדי לבחור סוכן ייעודי, או / כדי לבחור סקיל ממוקד.',
            '5. אם התוצאה טובה — לחץ על הוספה למסמך. אם לא, חדד את הבקשה במשפט קצר נוסף.',
            '6. להתאמה קבועה פתח את טאב הסקילים או הסגנון האישי בהגדרות.',
          ].map((step) => (
            <div key={step} style={{ fontSize: 12, color: '#334155', lineHeight: 1.7, borderRight: '3px solid #2B579A', paddingRight: 10, background: '#F8FAFC', borderRadius: 8, paddingTop: 8, paddingBottom: 8, paddingLeft: 8 }}>{step}</div>
          ))}
        </div>
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 10 }}>הדגמות מוכנות להעתקה</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {demoPrompts.map((item) => (
            <div key={item.title} style={{ border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 11px', background: '#F8FAFC' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 11, color: '#1E293B', lineHeight: 1.7, fontFamily: 'Consolas, monospace', background: 'white', border: '1px dashed #CBD5E1', borderRadius: 8, padding: '8px 9px' }}>
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
  const updateField = (field, value) => setProfile(prev => ({ ...prev, [field]: value }));
  const updateList = (field, value) => setProfile(prev => ({ ...prev, [field]: splitList(value) }));
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
      onComplete={markOnboardingComplete}
      onDismiss={onDismiss}
    />
  );
}

function PersonalStyleSettings({ profile, setProfile }) {
  const updateField = (field, value) => setProfile(prev => ({ ...prev, [field]: value }));
  const updateList = (field, value) => setProfile(prev => ({ ...prev, [field]: splitList(value) }));
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
  const [uploadKind, setUploadKind] = useState('writing-sample');
  const fileInputRef = useRef(null);

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
      for (const file of files) {
        await saveHelperMaterial(file, selectedUploadMeta);
      }
      await syncLearnedStyleFromWorkspace();
      setProfile(getPersonalStyleProfile());
      const items = await loadProjectMaterials();
      setRecentMaterials(items.slice(0, 4));
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
          value={(profile.currentCourses || []).join(', ')}
          onChange={(e) => updateList('currentCourses', e.target.value)}
          placeholder="קורסים, שיעורים או נושאים פעילים כרגע"
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
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.md,.markdown,.html,.htm,.png,.jpg,.jpeg,.webp" style={{ display: 'none' }} onChange={handleUpload} />
        </div>
        <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.6 }}>
          אפשר לצרף עבודות קודמות, סיכומים, PDF, מצגות, דפי שער לדוגמה, תבניות מסמך או טיוטות. בחר את סוג הקובץ לפני ההעלאה כדי שהסוכן ילמד בדיוק ממה להשתמש.
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: '#334155', background: 'white', border: '1px solid #DBEAFE', borderRadius: 10, padding: '8px 10px' }}>
          נסרקו: {profile.scanStats?.totalScanned || 0} מתוך {profile.scanStats?.totalKnown || 0} • חדשים בריענון האחרון: {profile.scanStats?.newlyScanned || 0}
        </div>
        {recentMaterials.length ? (
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {recentMaterials.map((item) => (
              <span key={item.id} style={{ fontSize: 10, background: '#EFF6FF', color: '#1D4ED8', padding: '4px 8px', borderRadius: 999 }}>
                {item.title}
              </span>
            ))}
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
        value={(profile.manualVocabulary || []).join(', ')}
        onChange={(e) => updateList('manualVocabulary', e.target.value)}
        placeholder="מונחים שהעוזר יעדיף להשתמש בהם"
        rows={3}
        style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
      />

      <textarea
        value={(profile.protectedVocabulary || []).join(', ')}
        onChange={(e) => updateList('protectedVocabulary', e.target.value)}
        placeholder="מונחים שלא תרצה לשנות לעולם"
        rows={3}
        style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
      />

      <textarea
        value={(profile.manualPhrases || []).join(', ')}
        onChange={(e) => updateList('manualPhrases', e.target.value)}
        placeholder="ביטויים אופייניים שתרצה לשלב"
        rows={3}
        style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
      />

      <textarea
        value={(profile.preferredSentenceStructures || []).join(', ')}
        onChange={(e) => updateList('preferredSentenceStructures', e.target.value)}
        placeholder="מבני משפט מועדפים, למשל: מצד אחד... מצד שני, יתרה מזו, ניתן לראות כי"
        rows={3}
        style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
      />

      <textarea
        value={(profile.tonePreferences || []).join(', ')}
        onChange={(e) => updateList('tonePreferences', e.target.value)}
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

function WorkspacesManager({ automation, setAutomation, onWorkspaceChange, setAgents }) {
  const [workspacesLib, setWorkspacesLib] = useState(getWorkspacesLibrary());
  const [showAdvancedCreate, setShowAdvancedCreate] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [lastSavedWorkspaceName, setLastSavedWorkspaceName] = useState('');
  const [quickAgentName, setQuickAgentName] = useState('');
  const [quickAgentStatus, setQuickAgentStatus] = useState('');
  const [previewWorkspaceId, setPreviewWorkspaceId] = useState('');
  const [editWorkspaceState, setEditWorkspaceState] = useState({ id: '', name: '', sharedGoal: '' });

  const refreshWorkspaceState = () => {
    const nextAutomation = getWorkspaceAutomation();
    const nextLibrary = getWorkspacesLibrary();
    setWorkspacesLib(nextLibrary);
    setAutomation((prev) => (JSON.stringify(prev) === JSON.stringify(nextAutomation) ? prev : nextAutomation));
    onWorkspaceChange?.();
    return nextLibrary;
  };

  const formatWorkflowLabel = (workflowMode = '') => {
    if (workflowMode === 'manager-auto') return 'AUTOPILOT דינמי';
    if (workflowMode === 'circular-team') return 'צוות מעגלי';
    if (workflowMode === 'custom-order') return 'סדר מותאם';
    if (workflowMode === 'manager-pipeline') return 'Pipeline מנוהל';
    return workflowMode || 'ברירת מחדל';
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
    if (!targetId || targetId === 'default-content-studio') return;
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

  const openDeepWorkspaceEdit = (workspaceId) => {
    const switched = switchToWorkspace(workspaceId);
    if (!switched) {
      window.alert('לא הצלחתי לעבור לסביבת העבודה שנבחרה.');
      return;
    }
    refreshWorkspaceState();
    setPreviewWorkspaceId('');
    closeEditWorkspace();
    setAgents(getRoleAgents());
    if (typeof document !== 'undefined') {
      const target = document.getElementById('role-agents-settings');
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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

  const handleAddQuickAgent = () => {
    const agentName = String(quickAgentName || '').trim() || 'סוכן חדש';
    setAgents((prev) => ([
      ...(Array.isArray(prev) ? prev : []),
      {
        id: `custom-${Date.now()}`,
        name: agentName,
        prompt: 'כתוב כאן את התפקיד וההנחיות של הסוכן.',
        provider: '',
        model: '',
        enabled: true,
      },
    ]));
    setQuickAgentName('');
    setQuickAgentStatus(`נוסף סוכן חדש לסביבה הפעילה: ${automation?.workspaceName || 'ללא שם'}`);
    setTimeout(() => setQuickAgentStatus(''), 2500);
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
                      {formatWorkflowLabel(ws?.automation?.workflowMode)} · {(Array.isArray(ws?.agents) ? ws.agents.length : 0)} סוכנים
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
                    {String(ws.id) !== 'default-content-studio' ? (
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
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>{formatWorkflowLabel(previewWorkspace?.automation?.workflowMode)}</div>
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
                <button type="button" onClick={() => openDeepWorkspaceEdit(previewWorkspace.id)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', fontWeight: 700 }}>עבור לעריכה עמוקה</button>
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
                <button type="button" onClick={() => openDeepWorkspaceEdit(editingWorkspace.id)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', fontWeight: 700 }}>עבור לעריכה עמוקה</button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={closeEditWorkspace} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #CBD5E1', background: 'white', color: '#334155', cursor: 'pointer', fontWeight: 700 }}>ביטול</button>
                  <button type="button" onClick={saveWorkspaceDetails} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #16A34A', background: '#16A34A', color: 'white', cursor: 'pointer', fontWeight: 700 }}>שמור שינויים</button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

      <div style={{ fontSize: 11, color: '#6B7280', background: '#F3F4F6', padding: '10px', borderRadius: 6 }}>
        💡 <strong>טיפ:</strong> אחרי יצירת סביבה חדשה, אפשר להוסיף לה סוכן מיד מהאזור למטה.
      </div>

      <div style={{ marginTop: 10, border: '1px solid #DBEAFE', borderRadius: 10, background: '#EFF6FF', padding: '10px 12px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', marginBottom: 6 }}>
          הוספת סוכן מהירה
        </div>
        <div style={{ fontSize: 11, color: '#475569', marginBottom: 8, lineHeight: 1.6 }}>
          הסוכן יתווסף לסביבה הפעילה כרגע: <strong>{automation?.workspaceName || 'ללא שם'}</strong>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: quickAgentStatus ? 6 : 0 }}>
          <input
            value={quickAgentName}
            onChange={(e) => setQuickAgentName(e.target.value)}
            placeholder="שם סוכן, למשל: בודק עובדות"
            style={{ flex: 1, padding: '8px 10px', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: 12 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddQuickAgent();
              }
            }}
          />
          <button
            type="button"
            onClick={handleAddQuickAgent}
            style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#2563EB', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            ➕ צור סוכן
          </button>
        </div>
        {quickAgentStatus ? <div style={{ fontSize: 11, color: '#166534' }}>{quickAgentStatus}</div> : null}
      </div>

      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-start' }}>
        <button
          type="button"
          onClick={() => {
            if (typeof document === 'undefined') return;
            const target = document.getElementById('role-agents-settings');
            if (!target) return;
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #C7D2FE', background: '#EEF2FF', color: '#3730A3', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
        >
          ➕ פתח הגדרות סוכנים מלאות
        </button>
      </div>
    </div>
  );
}

function RoleAgentsSettings({ agents, setAgents, automation, setAutomation, config }) {
  const presets = getWorkspaceAgentPresets();
  const managerIndex = agents.findIndex((agent) => /manager|מנהל/i.test(`${agent?.id || ''} ${agent?.name || ''}`));
  const managerAgent = managerIndex >= 0 ? agents[managerIndex] : null;
  const isManagerWorkflow = ['manager-auto', 'circular-team'].includes(automation?.workflowMode);
  const isAutopilotManagerMode = isManagerWorkflow && automation?.autopilotEnabled !== false;
  const selectedWorkflowMode = automation?.workflowMode === 'manager-auto'
    ? 'circular-team'
    : (automation?.workflowMode || 'manager-pipeline');
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
    setAgents(prev => prev.map((agent, i) => i === index ? { ...agent, [field]: value } : agent));
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
      </div>

      <div style={{ border: `1px solid ${isAutopilotManagerMode ? '#BFDBFE' : '#DDD6FE'}`, borderRadius: 12, padding: '12px 14px', background: isAutopilotManagerMode ? '#F8FBFF' : '#F8F7FF', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: isAutopilotManagerMode ? '#1E3A8A' : '#6D28D9', marginBottom: 6 }}>
          חוקי ההכרעה הפעילים
        </div>
        <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.7 }}>
          {isAutopilotManagerMode
            ? 'במצב הזה כל סוכן מדווח מה הושלם ומה עדיין חסר, ומנהל הצוות הוא זה שמחליט על הצעד הבא.'
            : 'במצב הזה כל סוכן עדיין מדווח מה חסר, אבל ההמשך נקבע לפי כללים וסקילים פעילים ולא על ידי מנהל מרכזי.'}
        </div>
      </div>

      <div style={{ border: '1px solid #DBEAFE', borderRadius: 12, padding: '14px', background: '#F8FBFF', marginBottom: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#1E3A8A', fontWeight: 700, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={automation?.enabled !== false}
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
              {Object.entries(presets).map(([id, preset]) => (
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
                  preset: nextMode === 'custom-order' ? 'custom-workspace' : prev.preset,
                  circularWorkflowEnabled: nextMode === 'circular-team' ? true : false,
                }));
                if (nextMode === 'circular-team') {
                  setAgents((prev) => {
                    const hasManager = prev.some((agent) => /manager|מנהל/i.test(`${agent?.id || ''} ${agent?.name || ''}`));
                    const hasAdditionalRoles = prev.some((agent) => !/manager|מנהל/i.test(`${agent?.id || ''} ${agent?.name || ''}`));
                    if (hasManager && hasAdditionalRoles) return prev;
                    const fallbackTeam = buildWorkspaceAgentPreset(automation?.preset || 'content-studio');
                    const currentManager = prev.find((agent) => /manager|מנהל/i.test(`${agent?.id || ''} ${agent?.name || ''}`));
                    return fallbackTeam.map((agent) => (
                      /manager|מנהל/i.test(`${agent?.id || ''} ${agent?.name || ''}`) && currentManager
                        ? { ...agent, ...currentManager }
                        : agent
                    ));
                  });
                }
              }}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, background: 'white' }}
            >
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
              AUTOPILOT מלא — קבע תפקידים, סדר ומודל באופן אוטומטי
            </label>
            כשהאפשרות פעילה, מנהל העבודה מחליט לבד מי צריך לעבוד, באיזה סדר, ואיזה תפקיד זמני יהיה לכל שלב.
            <div style={{ marginTop: 6, color: '#334155' }}>
              במצב מעגלי, אם מתגלים פערים, הסוכן הכותב או סוכנים אחרים יכולים לחזור לעוד סבב שיפור.
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#323130' }}>
            <input
              type="checkbox"
              checked={automation?.autoDispatch !== false}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#323130' }}>
            <span>Timeout</span>
            <input
              type="number"
              min="10"
              max="180"
              value={automation?.requestTimeoutMs ?? 45}
              onChange={(e) => setAutomation(prev => ({ ...prev, requestTimeoutMs: Math.max(10, Number(e.target.value) || 45) }))}
              style={{ width: 70, padding: '6px 8px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12 }}
            />
            <span>שניות</span>
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
                  value={(agent.provider && PROVIDER_MODEL_OPTIONS[agent.provider]?.includes(agent.model || '')) ? (agent.model || '') : ''}
                  onChange={(e) => updateAgent(index, 'model', e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, background: 'white', marginBottom: 6 }}
                >
                  <option value="">בחר מודל מהרשימה</option>
                  {((agent.provider && PROVIDER_MODEL_OPTIONS[agent.provider]) || []).map((modelName) => (
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
export default function FileMenu({ onClose, onCommand, shortcuts, onShortcutsChange, assistantBehavior, onAssistantBehaviorChange, wordPreferences, onWordPreferencesChange, initialSettingsTab = null, updateCheckToken = 0 }) {
  const [activePanel, setActivePanel] = useState(initialSettingsTab ? 'settings' : 'main');
  const [settingsTab, setSettingsTab] = useState(initialSettingsTab || 'ai');
  const onboardingSessionActiveRef = useRef(initialSettingsTab === 'onboarding');
  const [config, setConfig] = useState(getProviderConfig);
  const [shortcutsState, setShortcutsState] = useState(shortcuts || getShortcutsConfig());
  const [assistantBehaviorState, setAssistantBehaviorState] = useState(assistantBehavior || getAssistantBehavior());
  const [wordPrefsState, setWordPrefsState] = useState(wordPreferences || getWordPreferences());
  const [personalStyleState, setPersonalStyleState] = useState(getPersonalStyleProfile());
  const personalStyleStateRef = useRef(getPersonalStyleProfile());
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
      setPersonalStyleState((prev) => {
        const next = mergePersonalStyleForSave(prev);
        return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
      });
    };

    window.addEventListener('wordai-personal-style-updated', syncProfile);
    return () => window.removeEventListener('wordai-personal-style-updated', syncProfile);
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
            onClick={() => { setActivePanel('settings'); setSettingsTab('ai'); }}>
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
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6 md:mb-8">
                  {SETTINGS_TAB_GROUPS.map((group) => (
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

                <div className="bg-white rounded-3xl p-5 sm:p-8 border border-slate-200 shadow-sm min-h-[500px]">
                  {settingsTab === 'guide'       && <GuideSettings />}
                  {settingsTab === 'ai'          && <AiSettings config={config} setConfig={setConfig} />}
                  {settingsTab === 'prompt'      && <PromptSettings sharedInstructions={sharedInstructionsState} setSharedInstructions={setSharedInstructionsState} personalStyle={personalStyleState} />}
                  {settingsTab === 'skills'      && <SkillsSettings skillsState={skillsState} setSkillsState={setSkillsState} />}
                  {settingsTab === 'agents'      && (
                    <div>
                      <WorkspacesManager 
                        automation={workspaceAutomationState} 
                        setAutomation={setWorkspaceAutomationState}
                        setAgents={setRoleAgents}
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





