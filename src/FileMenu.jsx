import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle, FontFamily, FontSize, LineHeight } from "@tiptap/extension-text-style";
import ProfileOnboarding from './ProfileOnboarding';
import StyleProfilePanel from './components/StyleProfilePanel';
import PersonalTrainerPanel from './components/PersonalTrainerPanel';
import DesktopDownloadCard from './components/DesktopDownloadCard';
import { getSampleStoreStats } from './services/styleSampleStore';
import { normalizeDelimitedList } from './delimitedListInput';
import { useDelimitedListInput } from './useDelimitedListInput';
import { AGENTS_CONFIG } from './agentConfig';
import { isDesktopApp } from './platform';
import { COPYLEAKS_TEXT_MAX_CHARS, COPYLEAKS_TEXT_MIN_CHARS } from './services/copyleaksService';
import { saveBlobInBrowser } from './services/browserDocxExport';
import { SUPPORTED_DATA_FILE_ACCEPT, readDataFileToAnalysis } from './services/spssDataIngest';
import { showToast, showConfirm } from './services/uiFeedback';
import { onCloudAuthChange, saveCloudCryptoMeta, fetchCloudCryptoMeta, deleteCloudCryptoMeta } from './firebase/services';
import {
  isCloudCryptoEnabled,
  setCloudCryptoEnabled,
  triggerCloudSync,
  pullFromCloud,
} from './services/cloudSyncManager';
import {
  isUnlocked as isCryptoUnlocked,
  lockSession as lockCryptoSession,
  initializePassphrase as initCryptoPassphrase,
  unlockWithPassphrase as unlockCryptoPassphrase,
  unlockWithRecoveryCode as unlockCryptoRecovery,
  changePassphrase as changeCryptoPassphrase,
  rotateRecoveryCode as rotateCryptoRecovery,
  getSessionDek as getCryptoSessionDek,
} from './services/cloudCryptoSession';
import { saveDeviceKey as saveCloudDeviceKey, clearDeviceKey as clearCloudDeviceKey, hasDeviceKey as hasCloudDeviceKey } from './services/cloudDeviceKey';
import { APP_VERSION_LABEL } from './appVersion';
import { getTheme, setTheme as setAppTheme, onThemeChange } from './theme';
import { DECK_THEMES } from './presentation/deckThemes';
import {
  DEFAULT_WORKSPACES_LIBRARY,
  DEFAULT_ASSISTANT_BEHAVIOR,
  DEFAULT_PERSONAL_STYLE,
  DEFAULT_PROVIDER_CONFIG,
  DEFAULT_WORKSPACE_AUTOMATION,
  normalizeSidebarModeSettings,
  getProviderConfig,
  getConfiguredProviderChoices,
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
  getBlockedSourceDomains,
  saveBlockedSourceDomains,
  getWordPreferences,
  saveWordPreferences,
  getPresentationPreferences,
  savePresentationPreferences,
  getSpssPreferences,
  saveSpssPreferences,
  getPersonalStyleProfile,
  normalizePersonalStyleProfile,
  savePersonalStyleProfile,
  COVER_TEMPLATE_FIELDS,
  fillCoverTemplateTokens,
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
  applyPortableProfilePackage,
  buildPortablePrompt,
  applyManualProfileScalarFieldUpdate,
  mergeSyllabusImportPatchIntoProfile,
  processExternalStyleAnalysis,
  processSyllabusProfileImport,
  testProviderConnection,
  getWorkspaceV2Templates,
  saveWorkspaceV2Template,
  createWorkspaceV2Template,
  deleteWorkspaceV2Template,
  resetWorkspaceV2Templates,
} from "./services/aiService";
import { loadProjectMaterials, saveHelperMaterial, syncLearnedStyleFromWorkspace, buildGoldenExampleFromWorkspace, probePersonalStyleInfluence, MATERIAL_UPLOAD_PRESETS, getMaterialUploadMeta, readInstructionFile, getHelperMaterialAcceptList } from "./services/workspaceLearningService";
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
    id: 'scholar',
    label: 'Google Scholar',
    setupMode: 'builtin',
    badge: 'אקדמי',
    keyUrl: 'https://serpapi.com/google-scholar-api',
    keyCta: 'פתח את SerpAPI (Scholar)',
    keyHint: 'המפתח משמש לשליפת מאמרים ומקורות אקדמיים דרך SerpAPI.',
    recommendation: [
      'מתאים למציאת מקורות אקדמיים מאומתים וציטוטים מתוך Google Scholar.',
      'בחירה טובה לסטודנטים וחוקרים שצריכים ביבליוגרפיה אמינה.',
    ],
    setupSteps: [
      'פתח את serpapi.com.',
      'צור חשבון והעתק את ה-API Key.',
      'הדבק אותו כאן כדי לאפשר חיפוש אקדמי ישיר.',
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
  security: ['security', 'encryption', 'encrypt', 'e2ee', 'passphrase', 'password', 'recovery', 'privacy', 'keys', 'api keys', 'cloud encryption', 'אבטחה', 'הצפנה', 'סיסמה', 'סיסמא', 'שחזור', 'פרטיות', 'מפתחות', 'הצפנת ענן'],
  ai: ['ai', 'api', 'provider', 'model', 'key', 'engine', 'gemini', 'openai', 'claude', 'copyleaks', 'detector', 'detection', 'ai detector', 'ספק', 'מודל', 'מפתח', 'זיהוי ai', 'בדיקת ai'],
  media: ['media', 'images', 'image', 'photo', 'stock', 'pexels', 'unsplash', 'imagen', 'gpt-image', 'chart', 'charts', 'graph', 'quickchart', 'תמונות', 'תמונה', 'גרף', 'גרפים', 'תרשים', 'spss', 'ויזואל'],
  sidebar: ['sidebar', 'taskpane', 'chat panel', 'modes', 'provider', 'model', 'חלונית', 'צאט', 'צ׳אט', 'מצבים', 'ספק', 'מודל'],
  prompt: ['prompt', 'instructions', 'system', 'template', 'הנחיות'],
  skills: ['skills', 'skill', 'capabilities', 'סקילים'],
  workspaceV2: ['workspace', 'workspace v2', 'workspaces', 'agents', 'roles', 'pipeline', 'סביבת עבודה', 'סביבות עבודה', 'תפקידים', 'סוכנים', 'פרומפטים'],
  developer: ['developer', 'advanced', 'timeout', 'override', 'logs', 'model', 'provider', 'מתקדם', 'לוגים', 'timeout ms'],
  onboarding: ['onboarding', 'profile', 'style', 'learning', 'materials', 'submission', 'פרופיל', 'הגשה'],
  writing: ['writing', 'document', 'word', 'defaults', 'כתיבה'],
  presentation: ['presentation', 'slides', 'deck', 'pptx', 'powerpoint', 'theme', 'density', 'מצגת', 'מצגות', 'שקופיות', 'סטודיו מצגות'],
  spss: ['spss', 'syntax', 'statistics', 'analysis', 'tutor', 'data', 'סטטיסטיקה', 'תחביר', 'ניתוח', 'סטודיו spss'],
  appearance: ['appearance', 'theme', 'font', 'colors', 'ui', 'מראה'],
  debug: ['debug', 'logs', 'log', 'console', 'לוגים', 'ניפוי'],
  personal: ['personal', 'profile', 'style', 'preferences', 'tone', 'סגנון אישי', 'פרופיל אישי', 'style engine', 'personal style engine', 'writing samples', 'blacklist', 'qualitative patterns', 'confidence', 'מנוע סגנון', 'מנוע הסגנון', 'דוגמאות כתיבה', 'רשימה שחורה', 'דפוסים'],
};

const SETTINGS_TAB_GROUPS = [
  {
    title: 'AI ומנועים',
    desc: 'מפתחות, מודלים והעוזר החכם',
    tabs: [['ai', '🤖 מנועי AI'], ['sidebar', '💬 עוזר וצ׳אט'], ['skills', '🧠 סקילים'], ['workspaceV2', '🧩 סביבות עבודה']],
  },
  {
    title: 'הכתיבה שלי',
    desc: 'הפרופיל, הסגנון וברירות המחדל למסמך',
    tabs: [['onboarding', '👤 פרופיל והגשה'], ['personal', '🧬 סגנון אישי'], ['prompt', '📌 הנחיות קבועות'], ['writing', '✍️ ברירות מחדל']],
  },
  {
    title: 'תוכן וויזואל',
    desc: 'תמונות, מצגות, נתונים ומראה',
    tabs: [['media', '🖼️ תמונות וגרפים'], ['presentation', '📊 מצגות'], ['spss', '📈 SPSS'], ['appearance', '🎨 מראה']],
  },
  {
    title: 'מערכת ועזרה',
    desc: 'אבטחה, עדכונים, מדריך ותחזוקה',
    tabs: [['security', '🔒 אבטחה'], ['updates', '⬆️ עדכונים'], ['guide', '📘 מדריך'], ['developer', '🛠️ תחזוקה']],
  },
];

// כותרת + תיאור לכל טאב (לכותרת העמוד מעל התוכן) — מתוך עיצוב "הגדרות" (linen).
const SETTINGS_TAB_META = {
  ai: { icon: '🤖', title: 'מנועי AI', desc: 'מפתחות ומודלים לכל ספק. אפשר לשמור כמה מנועים במקביל ולבחור ברירת מחדל אחת.' },
  sidebar: { icon: '💬', title: 'העוזר והצ׳אט', desc: 'איך העוזר החכם מתנהג ומה קורה בחלונית הצד.' },
  skills: { icon: '🧠', title: 'סקילים', desc: 'איזה סקיל פועל אוטומטית, איזה נשאר ידני, ואיך כל אחד עובד.' },
  workspaceV2: { icon: '🧩', title: 'סביבות עבודה', desc: 'הצוותים שמופיעים במסך הבית — תפקיד, יעד ותוצר לכל סוכן.' },
  onboarding: { icon: '👤', title: 'פרופיל הכתיבה שלך', desc: 'הפרטים שמלמדים את WordAI לכתוב בדיוק כמוך.' },
  personal: { icon: '🧬', title: 'סגנון אישי', desc: 'מי אתה, איך אתה כותב, ומה מנוע הסגנון למד מהעבודות שלך.' },
  prompt: { icon: '📌', title: 'הנחיות קבועות', desc: 'הנחיות שמצורפות לכל ספקי ה-AI, וייצוא/ייבוא ההגדרות בין מכשירים.' },
  writing: { icon: '✍️', title: 'ברירות מחדל למסמך', desc: 'טיפוגרפיה, בדיקות, עריכה חכמה ושמירה אוטומטית.' },
  media: { icon: '🖼️', title: 'תמונות וגרפים', desc: 'ה-API שמייצרים תוכן ויזואלי: תמונות סטוק וגרפים מנתוני SPSS.' },
  presentation: { icon: '📊', title: 'ברירות מחדל למצגות', desc: 'מה ימולא אוטומטית בטופס יצירת מצגת חדשה.' },
  spss: { icon: '📈', title: 'ברירות מחדל ל-SPSS', desc: 'הערכים שחלים בכל כניסה לסטודיו ה-SPSS.' },
  appearance: { icon: '🎨', title: 'מראה', desc: 'ערכת הנושא של ההגדרות וצבעי המסמך.' },
  security: { icon: '🔒', title: 'אבטחה והצפנה', desc: 'הצפנת קצה-לקצה למפתחות ה-API שלך בענן — סיסמת הצפנה וקוד שחזור.' },
  updates: { icon: '⬆️', title: 'עדכונים', desc: 'גרסה, ערוץ עדכון ובדיקה ידנית.' },
  guide: { icon: '📘', title: 'מדריך', desc: 'הסברים מלאים לכל מה שאפשר לעשות ב-WordAI.' },
  developer: { icon: '🛠️', title: 'תחזוקה וכלים מתקדמים', desc: 'timeout, איפוסים ולוגים — רק אם אתה יודע מה אתה עושה.' },
};

const SETTINGS_TAB_SEARCH_INDEX = [
  ...SETTINGS_TAB_GROUPS.flatMap((group) => group.tabs.map(([id, label]) => ({
    id,
    label,
    groupTitle: group.title,
    searchText: mergeSettingsSearchTerms([id, label, group.title, SETTINGS_TAB_SEARCH_KEYWORDS[id] || []]).join(' '),
  }))),
  {
    id: 'sidebar',
    label: '💬 עוזר וצ׳אט',
    groupTitle: 'AI ומנועים',
    searchText: mergeSettingsSearchTerms([
      'assistant', 'helper', 'behavior', 'auto popup', 'עוזר', 'התנהגות עוזר', 'קפיצה אוטומטית',
      SETTINGS_TAB_SEARCH_KEYWORDS.assistant || [],
    ]).join(' '),
  },
  {
    id: 'developer',
    label: '🛠️ תחזוקה',
    groupTitle: 'מערכת ועזרה',
    searchText: mergeSettingsSearchTerms([
      'debug', 'logs', 'console', 'לוגים', 'ניפוי', 'קונסולה',
      SETTINGS_TAB_SEARCH_KEYWORDS.debug || [],
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
        style={{ color: 'var(--color-chrome)', textDecoration: 'underline', wordBreak: 'break-all' }}>
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
      <label style={{ fontSize: 11, color: 'var(--s-muted)', display: 'block', marginBottom: 3, fontWeight: 500 }}>{label}</label>
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
      {hint && <div style={{ fontSize: 10, color: 'var(--s-muted)', marginTop: 2 }}>{hint}</div>}
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
  const btnBorder = status === 'ok' ? '#6EE7B7' : status === 'fail' ? '#FCA5A5' : 'var(--s-border)';
  const btnTextColor = status === 'ok' ? '#065F46' : status === 'fail' ? '#991B1B' : 'var(--s-text)';

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

function ProviderSection({ title, icon, description, active, configured, onActivate, children, allowActivate = true, expandedHint = false, guideId = '' }) {
  const [expanded, setExpanded] = useState(active || configured);
  const guide = guideId ? PROVIDER_SETUP_INDEX[guideId] : null;

  useEffect(() => {
    if (active) setExpanded(true);
  }, [active]);

  useEffect(() => {
    if (expandedHint) setExpanded(true);
  }, [expandedHint]);

  return (
    <div style={{ border: `2px solid ${active ? 'var(--color-chrome)' : 'var(--s-border)'}`, borderRadius: 10, padding: '10px 12px', marginBottom: 10, background: active ? '#FAFCFF' : 'white', transition: 'all 0.15s' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--s-text-strong)' }}>{title}</span>
          {active && <span style={{ fontSize: 10, background: 'var(--color-chrome)', color: 'white', padding: '2px 8px', borderRadius: 10 }}>ברירת מחדל</span>}
          {configured && <span style={{ fontSize: 10, background: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: 10 }}>מוגדר</span>}
          {!configured && <span style={{ fontSize: 10, background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: 10 }}>חסר מפתח/הגדרה</span>}
          {guide?.badge && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--s-muted)', background: 'var(--s-surface-2)', border: '1px solid var(--s-border)', padding: '2px 8px', borderRadius: 999 }}>{guide.badge}</span>}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            style={{ fontSize: 11, padding: '4px 10px', background: 'white', color: 'var(--s-text)', border: '1px solid var(--s-border)', borderRadius: 6, cursor: 'pointer' }}
          >
            {expanded ? 'הסתר פרטים' : 'הצג פרטים'}
          </button>
          {allowActivate && (
            <button onClick={onActivate}
              disabled={!configured}
              style={{ fontSize: 11, padding: '4px 12px', background: active ? 'var(--s-border)' : 'var(--color-chrome)', color: active ? 'var(--s-muted)' : 'white', border: 'none', borderRadius: 6, cursor: !configured ? 'not-allowed' : 'pointer', opacity: !configured ? 0.55 : 1 }}>
              {active ? 'ברירת מחדל פעילה' : 'קבע כברירת מחדל'}
            </button>
          )}
        </div>
      </div>

      {guide?.recommendation?.length ? (
        <div style={{ marginTop: 9, padding: '9px 11px', borderRadius: 10, background: 'var(--s-surface-2)', border: '1px solid var(--s-border)' }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--s-text)', lineHeight: 1.6 }}>{guide.recommendation[0]}</div>
          {guide.recommendation[1] && <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6, marginTop: 3 }}>{guide.recommendation[1]}</div>}
        </div>
      ) : null}

      {expanded ? (
        <>
          {description && <p style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 10, marginTop: 8 }}>{linkifyText(description)}</p>}
          <div>{children}</div>
        </>
      ) : (
        <div style={{ fontSize: 10, color: 'var(--s-muted)', marginTop: 8, lineHeight: 1.6, opacity: 0.9 }}>
          {configured ? 'הספק מוכן לעבודה. אפשר לפתוח כדי לראות או לערוך את ההגדרות.' : 'פתח את הכרטיס כדי להגדיר מפתח API, כתובת או מודל.'}
        </div>
      )}
    </div>
  );
}

// ─── הגדרות AI ───
function MediaVisualsSettings({ config, setConfig }) {
  const update = (provider, field, value) =>
    setConfig((prev) => ({ ...prev, [provider]: { ...prev[provider], [field]: value } }));
  const chartEngine = config.chartEngine || {};

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--s-muted)', marginBottom: 16, lineHeight: 1.7 }}>
        כאן מגדירים את כל ה-API שמייצרים תוכן ויזואלי: תמונות לסטודיו המצגות, וגרפים אמיתיים מנתוני SPSS.
        מנוע הגרפים מרנדר תרשים מדויק מהמספרים שבפלט — לא תמונה ש-AI ממציא.
      </p>

      <ProviderSection title="תמונות סטוק למצגות" icon="🖼️" active={false} allowActivate={false}
        configured={Boolean(String(config.pexels?.key || '').trim() || String(config.unsplash?.key || '').trim())}
        onActivate={() => {}}
        description="חיפוש תמונות סטוק (Pexels/Unsplash — חינמי). יצירת תמונות ב-AI עברה לכרטיס 'יצירת תמונות AI' בטאב 'מנועי AI'.">
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: 'var(--s-muted)', display: 'block', marginBottom: 3, fontWeight: 500 }}>ספק תמונות סטוק פעיל</label>
          <select value={config.imageProvider || 'pexels'} onChange={(e) => setConfig((prev) => ({ ...prev, imageProvider: e.target.value }))} style={{ width: '100%', padding: '7px 10px', border: '1px solid #C8C6C4', borderRadius: 4, fontSize: 12 }}>
            <option value="pexels">Pexels</option>
            <option value="unsplash">Unsplash</option>
          </select>
        </div>
        <FieldRow label="מפתח Pexels" type="password" placeholder="your_pexels_key" value={config.pexels?.key}
          onChange={(v) => update('pexels', 'key', v)} hint="מפתח חינמי מ-pexels.com/api" />
        <FieldRow label="מפתח Unsplash (Access Key)" type="password" placeholder="your_unsplash_access_key" value={config.unsplash?.key}
          onChange={(v) => update('unsplash', 'key', v)} hint="Access Key מ-unsplash.com/developers" />
      </ProviderSection>

      <ProviderSection title="גרפים מנתוני SPSS" icon="📈" active={false} allowActivate={false}
        configured={(chartEngine.provider || 'quickchart') === 'quickchart'}
        onActivate={() => {}}
        description="מנוע גרפים אמיתי. AI מחלץ את המספרים מפלט ה-SPSS, ו-QuickChart מרנדר תרשים PNG מדויק (עמודות / קו / עוגה / פיזור). עובד חינם ללא מפתח; אפשר מפתח להגבלות גבוהות יותר.">
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: 'var(--s-muted)', display: 'block', marginBottom: 3, fontWeight: 500 }}>מנוע גרפים</label>
          <select value={chartEngine.provider || 'quickchart'} onChange={(e) => update('chartEngine', 'provider', e.target.value)} style={{ width: '100%', padding: '7px 10px', border: '1px solid #C8C6C4', borderRadius: 4, fontSize: 12 }}>
            <option value="quickchart">QuickChart (Chart.js — מדויק)</option>
          </select>
        </div>
        <FieldRow label="כתובת שרת QuickChart" placeholder="https://quickchart.io" value={chartEngine.baseUrl || ''}
          onChange={(v) => update('chartEngine', 'baseUrl', v)} hint="ברירת מחדל: quickchart.io הציבורי. אפשר להפנות ל-self-host." />
        <FieldRow label="מפתח QuickChart (אופציונלי)" type="password" placeholder="leave empty for free tier" value={chartEngine.key || ''}
          onChange={(v) => update('chartEngine', 'key', v)} hint="ריק = שכבה חינמית. מפתח מ-quickchart.io מסיר הגבלות קצב." />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--s-text-strong)', marginTop: 10 }}>
          <input type="checkbox" checked={chartEngine.fallbackToAi !== false} onChange={(e) => update('chartEngine', 'fallbackToAi', e.target.checked)} />
          גיבוי AI — אם רינדור הגרף נכשל, צור תמונת המחשה ב-AI (לא מדויקת מספרית)
        </label>
      </ProviderSection>
    </div>
  );
}

function AiSettings({ config, setConfig }) {
  const [showCustomHelp, setShowCustomHelp] = useState(false);
  const [openedGuideProviderId] = useState('');
  const [quickKeyPopup, setQuickKeyPopup] = useState(null); // { providerId, label, keyField, baseUrlField? }
  const update = (provider, field, value) =>
    setConfig(prev => ({ ...prev, [provider]: { ...prev[provider], [field]: value } }));
  const updateFeatureOverride = (featureId, patch) =>
    setConfig(prev => ({
      ...prev,
      featureOverrides: {
        ...(prev.featureOverrides || {}),
        [featureId]: { ...(prev.featureOverrides?.[featureId] || {}), ...patch },
      },
    }));
  const updateFeatureImage = (featureId, patch) =>
    setConfig(prev => ({
      ...prev,
      featureOverrides: {
        ...(prev.featureOverrides || {}),
        [featureId]: {
          ...(prev.featureOverrides?.[featureId] || {}),
          image: { ...(prev.featureOverrides?.[featureId]?.image || {}), ...patch },
        },
      },
    }));
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
  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--s-muted)', marginBottom: 12, lineHeight: 1.6 }}>
        אפשר לשמור כמה מנועי AI במקביל. במסך הזה יש רק <strong>ברירת מחדל אחת</strong>, אבל בתוך סוכני התפקיד אפשר לבחור מנוע אחר לכל סוכן וכך לעבוד עם כמה מודלים יחד.
      </p>

      {/* כרטיס "מנוע ברירת המחדל" — פריסת המוקאפ */}
      <div style={{ border: '1px solid var(--s-border)', borderRadius: 16, padding: 16, background: 'var(--s-surface)', marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--s-text-strong)', marginBottom: 4 }}>מנוע ברירת המחדל</div>
        <div style={{ fontSize: 12, color: 'var(--s-muted)', marginBottom: 12, lineHeight: 1.6 }}>המנוע שמריץ כל בקשה כברירת מחדל. אפשר לבחור מנוע אחר לכל סוכן בהמשך.</div>
        <select
          value={config.active || 'gemini'}
          onChange={(e) => activate(e.target.value)}
          style={{ width: '100%', padding: '11px 13px', borderRadius: 12, border: '1px solid var(--s-border)', background: 'var(--s-surface-2)', color: 'var(--s-text)', fontSize: 14, fontWeight: 600, outline: 'none', cursor: 'pointer' }}
        >
          {[['gemini', 'Google Gemini'], ['openai', 'OpenAI (GPT)'], ['claude', 'Claude (Anthropic)'], ['groq', 'Groq'], ['perplexity', 'Perplexity'], ['ollama', 'Ollama (מקומי)'], ['custom', config.custom?.name || 'מותאם']].map(([id, label]) => (
            <option key={id} value={id}>{label}{config.active === id ? ' · פעיל' : ''}</option>
          ))}
        </select>
      </div>

      <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '10px 12px', background: 'var(--s-surface-2)', marginBottom: 12, fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.7 }}>
        לדוגמה: אפשר להפעיל ביחד Gemini + Claude, וכל בקשה תעבור דרך שניהם ואז תאוחד לתשובה אחת.
      </div>

      <div style={{ border: '1px solid var(--s-border)', borderRadius: 16, padding: '14px 16px', background: 'var(--s-surface)', marginBottom: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--s-text-strong)', marginBottom: 8 }}>מצב Multi-Model</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--s-text)', fontWeight: 700, marginBottom: 8 }}>
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

        <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.7, marginBottom: 8 }}>
          סמן כאן כמה מנועים שירוצו על אותה בקשה. מנוע ברירת המחדל יבצע גם את האיחוד הסופי של התוצאה.
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {[
            ['gemini', 'Gemini'],
            ['claude', 'Claude'],
            ['openai', 'OpenAI'],
            ['groq', 'Groq'],
            ['perplexity', 'Perplexity'],
            ['scholar', 'Google Scholar'],
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
                  color: isDisabled ? 'var(--s-muted)' : showWarning ? '#92400E' : '#14532D',
                  background: showWarning ? '#FFFBEB' : 'white',
                  border: `1px solid ${isDisabled ? 'var(--s-border)' : showWarning ? '#FCD34D' : '#BBF7D0'}`,
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
                {!configured && !isSelected && <span style={{ fontSize: 10, color: 'var(--s-muted)' }}> (לא מוגדר)</span>}
              </label>
            );
          })}
        </div>
        {quickKeyPopup && (
          <div style={{ position: 'relative', marginTop: 10 }}>
            <div style={{ border: '1px solid #FCD34D', borderRadius: 12, padding: '14px', background: '#FFFBEB', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E' }}>⚡ הגדרת מפתח מהיר — {quickKeyPopup.label}</div>
                <button type="button" onClick={() => setQuickKeyPopup(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--s-muted)', lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ fontSize: 11, color: '#78350F' }}>{quickKeyPopup.hint} — אחרי השמירה, לחץ על "בדוק חיבור" בכרטיס הספק למטה.</div>
              {quickKeyPopup.baseUrlField && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>Base URL</div>
                  <input
                    type="text"
                    placeholder={quickKeyPopup.baseUrlPlaceholder}
                    value={config[quickKeyPopup.providerId]?.[quickKeyPopup.baseUrlField] || ''}
                    onChange={(e) => update(quickKeyPopup.providerId, quickKeyPopup.baseUrlField, e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--s-border)', borderRadius: 8, fontSize: 12, direction: 'ltr' }}
                  />
                </div>
              )}
              {quickKeyPopup.keyField && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>API Key</div>
                  <input
                    type="password"
                    placeholder={quickKeyPopup.keyPlaceholder}
                    value={config[quickKeyPopup.providerId]?.[quickKeyPopup.keyField] || ''}
                    onChange={(e) => update(quickKeyPopup.providerId, quickKeyPopup.keyField, e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--s-border)', borderRadius: 8, fontSize: 12, direction: 'ltr' }}
                  />
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setQuickKeyPopup(null)} style={{ padding: '6px 14px', border: '1px solid var(--s-border)', borderRadius: 8, background: 'white', fontSize: 12, cursor: 'pointer', color: 'var(--s-muted)' }}>סגור</button>
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
      <ProviderSection title="Google Gemini" icon="🔵" active={config.active === 'gemini'} configured={isProviderConfigured(config, 'gemini')} onActivate={() => activate('gemini')} expandedHint={openedGuideProviderId === 'gemini'} guideId="gemini"
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
      <ProviderSection title="OpenAI (ChatGPT / GPT-4)" icon="🟢" active={config.active === 'openai'} configured={isProviderConfigured(config, 'openai')} onActivate={() => activate('openai')} expandedHint={openedGuideProviderId === 'openai'} guideId="openai"
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
      <ProviderSection title="Claude (Anthropic)" icon="🟠" active={config.active === 'claude'} configured={isProviderConfigured(config, 'claude')} onActivate={() => activate('claude')} expandedHint={openedGuideProviderId === 'claude'} guideId="claude"
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
      <ProviderSection title="Groq (מהיר ובחינם)" icon="⚡" active={config.active === 'groq'} configured={isProviderConfigured(config, 'groq')} onActivate={() => activate('groq')} expandedHint={openedGuideProviderId === 'groq'} guideId="groq"
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
      <ProviderSection title="Perplexity AI" icon="🔍" active={config.active === 'perplexity'} configured={isProviderConfigured(config, 'perplexity')} onActivate={() => activate('perplexity')} expandedHint={openedGuideProviderId === 'perplexity'} guideId="perplexity"
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
      <ProviderSection title="Ollama (מקומי — חינמי לחלוטין)" icon="🦙" active={config.active === 'ollama'} configured={isProviderConfigured(config, 'ollama')} onActivate={() => activate('ollama')} expandedHint={openedGuideProviderId === 'ollama'} guideId="ollama"
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

      <ProviderSection title="Google Scholar / SerpAPI" icon="🎓" active={false} configured={isProviderConfigured(config, 'scholar')} onActivate={() => {}} allowActivate={false} guideId="scholar"
        description="מנוע מאמרים ומקורות אקדמיים דרך Google Scholar. שמירת מפתח SerpAPI כאן מאפשרת לבקשות כמו מקורות אקדמיים, bibliography או peer reviewed לעבור למסלול Scholar. הוצא מפתח מכאן: https://serpapi.com/google-scholar-api">
        <FieldRow label="מפתח SerpAPI" type="password" placeholder="your_serpapi_key" value={config.scholar?.key}
          onChange={v => update('scholar', 'key', v)} hint="המפתח משמש לשליפת מאמרים ומקורות אקדמיים מ-Google Scholar במסלול מקורות מאומתים" />
      </ProviderSection>

      <ProviderSection title="Copyleaks לזיהוי AI" icon="🛡️" active={false} configured={isProviderConfigured(config, 'copyleaks')} onActivate={() => {}} allowActivate={false}
        description="בדיקת טקסט דרך Copyleaks למסמך, לפסקה או לטקסט מסומן. ממלאים את הפרטים כאן, ואפשר לבדוק חיבור כדי לוודא שהכל מוכן לפני ההרצה הראשונה.">
        <div style={{ border: '1px solid #DBEAFE', borderRadius: 10, padding: '10px 12px', background: 'var(--s-surface-2)', color: '#1E3A8A', fontSize: 11, lineHeight: 1.7, marginBottom: 12 }}>
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--s-text)', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={config.copyleaks?.explain === true}
              onChange={(e) => update('copyleaks', 'explain', e.target.checked)}
            />
            פירוט נוסף: מוסיף הסבר מפורט יותר למה Copyleaks סימן את הטקסט
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--s-text)', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={config.copyleaks?.sandbox === true}
              onChange={(e) => update('copyleaks', 'sandbox', e.target.checked)}
            />
            מצב הדגמה: מחזיר תוצאות הדגמה כדי לוודא שהחיבור עובד, בלי בדיקה אמיתית
          </label>
        </div>

        <div style={{ border: '1px solid var(--s-border)', borderRadius: 10, padding: '10px 12px', background: 'var(--s-surface-2)', color: 'var(--s-muted)', fontSize: 11, lineHeight: 1.7, marginBottom: 10 }}>
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

      <ProviderSection title="יצירת תמונות AI" icon="🎨" active={false} allowActivate={false}
        configured={Boolean(String(config.imageGen?.key || '').trim()) || ['gemini', 'openai'].includes(config.imageGen?.provider || 'gemini')}
        onActivate={() => {}}
        description="יצירת תמונות מקור ב-AI לסטודיו המצגות (Imagen של Gemini, gpt-image של OpenAI, Stability, xAI Grok או FLUX).">
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: 'var(--s-muted)', display: 'block', marginBottom: 3, fontWeight: 500 }}>ספק יצירת תמונות</label>
          <select value={config.imageGen?.provider || 'gemini'} onChange={(e) => update('imageGen', 'provider', e.target.value)} style={{ width: '100%', padding: '7px 10px', border: '1px solid #C8C6C4', borderRadius: 4, fontSize: 12 }}>
            <option value="gemini">Gemini (Imagen)</option>
            <option value="openai">OpenAI (gpt-image)</option>
            <option value="stability">Stability AI (Stable Diffusion)</option>
            <option value="xai">xAI Grok</option>
            <option value="flux">Black Forest FLUX (fal.ai)</option>
          </select>
        </div>
        <FieldRow label="מפתח ליצירת תמונות (אופציונלי ל-Gemini/OpenAI — חובה לשאר)" type="password" placeholder="leave empty to reuse text key" value={config.imageGen?.key}
          onChange={(v) => update('imageGen', 'key', v)} hint="Gemini/OpenAI: ריק = מפתח הטקסט הרגיל. Stability/xAI/FLUX: חובה מפתח ייעודי." />
        <FieldRow label="מודל יצירת תמונות" placeholder="imagen-3.0-generate-002" value={config.imageGen?.model}
          onChange={(v) => update('imageGen', 'model', v)} options={['imagen-3.0-generate-002', 'gpt-image-1', 'stable-diffusion-xl-1024-v1-0', 'grok-2-image', 'fal-ai/flux/schnell', 'fal-ai/flux/dev']} hint="Gemini: imagen-3.0-generate-002 · OpenAI: gpt-image-1 · Stability: stable-diffusion-xl-1024-v1-0 · xAI: grok-2-image · FLUX: fal-ai/flux/schnell" />
      </ProviderSection>

      {(() => {
        const ov = config.featureOverrides?.spss || {};
        const providerId = ov.providerId || '';
        const needsBaseUrl = providerId === 'custom' || providerId === 'ollama';
        return (
          <ProviderSection title="קוד (SPSS Syntax)" icon="💻" active={false} allowActivate={false}
            configured={Boolean(ov.enabled && providerId)}
            onActivate={() => {}}
            description="ספק ומודל ייעודיים ליצירת SPSS syntax. ריק = הספק הפעיל הרגיל. אפשר גם לבחור מודל ישירות במסך ה-SPSS Studio בכל הרצה.">
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: 'var(--s-muted)', display: 'block', marginBottom: 3, fontWeight: 500 }}>ספק ל-SPSS</label>
              <select
                value={providerId}
                onChange={(e) => {
                  const next = e.target.value;
                  updateFeatureOverride('spss', next ? { enabled: true, providerId: next, model: '' } : { enabled: false, providerId: '', model: '' });
                }}
                style={{ width: '100%', padding: '7px 10px', border: '1px solid #C8C6C4', borderRadius: 4, fontSize: 12 }}
              >
                <option value="">— ברירת מחדל (הספק הפעיל) —</option>
                {[
                  ['gemini', 'Google Gemini'],
                  ['openai', 'OpenAI'],
                  ['claude', 'Claude (Anthropic)'],
                  ['groq', 'Groq'],
                  ['perplexity', 'Perplexity'],
                  ['ollama', 'Ollama (מקומי)'],
                  ['custom', 'מותאם אישית'],
                ].map(([pid, plabel]) => (<option key={pid} value={pid}>{plabel}</option>))}
              </select>
            </div>
            {providerId && (
              <>
                <FieldRow label="מודל (אופציונלי)" placeholder={`ברירת מחדל: ${config[providerId]?.model || '—'}`}
                  value={ov.model || ''} onChange={(v) => updateFeatureOverride('spss', { model: v })}
                  options={getProviderModelChoices(providerId, config, [ov.model].filter(Boolean))} hint="ריק = המודל הגלובלי של הספק" />
                {needsBaseUrl && (
                  <FieldRow label="Base URL" placeholder={config[providerId]?.baseUrl || 'https://...'}
                    value={ov.baseUrl || ''} onChange={(v) => updateFeatureOverride('spss', { baseUrl: v })} hint="ריק = הכתובת הגלובלית של הספק" />
                )}
                <FieldRow label="מפתח API ייעודי (אופציונלי)" type="password" placeholder="ריק = המפתח הגלובלי של הספק"
                  value={ov.key || ''} onChange={(v) => updateFeatureOverride('spss', { key: v })} hint="מפתח נפרד ל-SPSS — שימושי לבילינג/מכסה נפרדים" />
                <ApiTestButton providerId={providerId} providerConfig={{ key: ov.key || config[providerId]?.key, baseUrl: ov.baseUrl || config[providerId]?.baseUrl, model: ov.model || config[providerId]?.model }} />
              </>
            )}
          </ProviderSection>
        );
      })()}

      <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '12px 14px', background: 'var(--s-surface)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20 }}>🖼️</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--s-text-strong)' }}>תמונות סטוק וגרפים</div>
          <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6 }}>מפתחות תמונות סטוק (Pexels/Unsplash) ומנוע הגרפים ל-SPSS נמצאים בטאב "תמונות וגרפים".</div>
        </div>
      </div>

      <div style={{ border: '1px solid #DBEAFE', borderRadius: 12, padding: '12px 14px', background: 'var(--s-surface-2)', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1E3A8A', marginBottom: 6 }}>קישורי תוספות בסרגל</div>
        <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.7, marginBottom: 10 }}>
          כאן אפשר לשנות גם את שם הכפתור וגם את הכתובת של כל קישור. בשדות חיפוש אפשר להשתמש ב־{'{query}'} כדי לשלב את מה שסימנת או כתבת, וב־{'{serpapiKey}'} כדי לשלב אוטומטית את מפתח SerpAPI ששמרת.
        </div>
        {[
          ['googleSearch', 'חיפוש גוגל'],
          ['scholar', 'Google Scholar'],
          ['modelHub', 'מודל'],
          ['orbit', 'Orbit'],
        ].map(([toolId, fallbackLabel]) => (
          <div key={toolId} style={{ borderTop: '1px solid #DBEAFE', paddingTop: 10, marginTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--s-text)', marginBottom: 6 }}>{fallbackLabel}</div>
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
        guideId="custom"
        description="">

        {/* כפתור הסבר */}
        <button onClick={() => setShowCustomHelp(v => !v)}
          style={{ fontSize: 12, color: 'var(--color-chrome)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 12, textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: 4 }}>
          {showCustomHelp ? '▴' : '▾'} מה צריך להכין? איך זה עובד?
        </button>

        {/* הסבר מפורט */}
        {showCustomHelp && (
          <div style={{ background: 'var(--s-surface)', border: '1px solid var(--s-border)', borderRadius: 8, padding: '14px 16px', marginBottom: 14, fontSize: 12, lineHeight: 1.7, color: 'var(--s-text-strong)' }}>
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>🔌 מנוע מותאם אישית — OpenAI-Compatible API</div>
            <p style={{ marginBottom: 10, color: 'var(--s-muted)' }}>
              רוב ספקי ה-AI הקטנים והמקומיים מספקים API התואם לפרוטוקול של OpenAI.
              בדרך כלל, בדשבורד של הספק תמצא <strong>שלושה דברים</strong> שצריך להעתיק לכאן:
            </p>
            <ul style={{ paddingRight: 18, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li><strong>כתובת API (Base URL)</strong> — מופיעה בתיעוד תחת &ldquo;API Reference&rdquo; או &ldquo;Endpoint&rdquo;. נראית כך: <code style={{ background: 'var(--s-border)', padding: '1px 5px', borderRadius: 3 }}>https://api.groq.com/openai/v1</code></li>
              <li><strong>מפתח API</strong> — מחרוזת שהספק נותן, לפעמים מתחילה ב-<code style={{ background: 'var(--s-border)', padding: '1px 5px', borderRadius: 3 }}>sk-</code>. <em>ללא מפתח נתמך רק ב-loopback מקומי מאושר של Ollama או LM Studio על פורטים 11434 או 1234.</em></li>
              <li><strong>שם מודל</strong> — השם הטכני כמו <code style={{ background: 'var(--s-border)', padding: '1px 5px', borderRadius: 3 }}>llama-3.3-70b-versatile</code>. מופיע ברשימת Models בתיעוד.</li>
            </ul>

            <div style={{ fontWeight: 700, marginBottom: 8 }}>🌐 ספקים נפוצים — לחץ להעתקה מהירה:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {POPULAR_CUSTOM.map(p => (
                <div key={p.name} style={{ background: 'white', border: '1px solid var(--s-border)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--color-chrome)', marginBottom: 4 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 6 }}>📌 {linkifyText(p.note)}</div>
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
                    <span style={{ fontSize: 10, color: 'var(--s-muted)', alignSelf: 'center' }}>מפתח: {p.keyNote}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* תואמים גם — ספקים תואמי OpenAI שמוגדרים דרך הכרטיס הזה */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 8 }}>תואמים גם — מלא בלחיצה:</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
            {['deepseek', 'mistral', 'together', 'openrouter', 'xai', 'lmstudio'].map((cid) => {
              const g = PROVIDER_SETUP_INDEX[cid];
              if (!g) return null;
              const cc = g.customConfig || {};
              return (
                <div key={cid} style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '10px 12px', background: 'var(--s-surface-2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <strong style={{ fontSize: 12.5, color: 'var(--s-text-strong)' }}>{g.label}</strong>
                    {g.badge && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--s-muted)', background: 'var(--s-surface)', border: '1px solid var(--s-border)', padding: '2px 8px', borderRadius: 999 }}>{g.badge}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6, marginBottom: 8 }}>{g.recommendation?.[0]}</div>
                  <button
                    type="button"
                    onClick={() => { update('custom', 'name', cc.name || g.label); update('custom', 'baseUrl', cc.baseUrl || ''); update('custom', 'model', cc.model || ''); }}
                    style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', background: 'var(--color-chrome)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}
                  >
                    ⚡ מלא ב-Custom
                  </button>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--s-muted)', marginTop: 8, lineHeight: 1.6 }}>
            אחרי המילוי הוסף את מפתח ה-API של הספק בשדה למטה ולחץ "בדוק חיבור".
          </div>
        </div>

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

      {/* API ייעודי לפי פיצ'ר — SPSS ומצגות */}
      <div style={{ border: '1px solid #DDD6FE', borderRadius: 12, padding: '14px 16px', background: '#FAF5FF', marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#5B21B6', marginBottom: 4 }}>🎯 API ייעודי למצגות</div>
        <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.7, marginBottom: 12 }}>
          אפשר להקצות למצגות ספק/מודל/מפתח נפרדים מהספק הגלובלי. כשכבוי — הפיצ'ר משתמש בספק הפעיל הרגיל. מפתח או מודל ריקים נופלים אוטומטית לערך הגלובלי. ל-SPSS יש כרטיס ייעודי משלו ("קוד (SPSS Syntax)") למעלה.
        </div>
        {[
          { id: 'presentations', label: 'מצגות — Presentation Studio', icon: '🖼️' },
        ].map(({ id, label, icon }) => {
          const ov = config.featureOverrides?.[id] || {};
          const enabled = ov.enabled === true;
          const providerId = ov.providerId || '';
          const needsBaseUrl = providerId === 'custom' || providerId === 'ollama';
          return (
            <div key={id} style={{ borderTop: '1px solid #E9D5FF', paddingTop: 12, marginTop: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#4C1D95', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => updateFeatureOverride(id, { enabled: e.target.checked })}
                />
                {icon} {label}
              </label>
              {enabled && (
                <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>ספק ייעודי</div>
                    <select
                      value={providerId}
                      onChange={(e) => updateFeatureOverride(id, { providerId: e.target.value, model: '' })}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #C4B5FD', borderRadius: 8, fontSize: 12, background: 'white' }}
                    >
                      <option value="">— בחר ספק —</option>
                      {[
                        ['gemini', 'Google Gemini'],
                        ['openai', 'OpenAI'],
                        ['claude', 'Claude (Anthropic)'],
                        ['groq', 'Groq'],
                        ['perplexity', 'Perplexity'],
                        ['ollama', 'Ollama (מקומי)'],
                        ['custom', 'מותאם אישית'],
                      ].map(([pid, plabel]) => (
                        <option key={pid} value={pid}>{plabel}</option>
                      ))}
                    </select>
                  </div>
                  {providerId && (
                    <>
                      <FieldRow
                        label="מודל (אופציונלי)"
                        placeholder={`ברירת מחדל: ${config[providerId]?.model || '—'}`}
                        value={ov.model || ''}
                        onChange={(v) => updateFeatureOverride(id, { model: v })}
                        options={getProviderModelChoices(providerId, config, [ov.model].filter(Boolean))}
                        hint="ריק = המודל הגלובלי של הספק"
                      />
                      {needsBaseUrl && (
                        <FieldRow
                          label="Base URL"
                          placeholder={config[providerId]?.baseUrl || 'https://...'}
                          value={ov.baseUrl || ''}
                          onChange={(v) => updateFeatureOverride(id, { baseUrl: v })}
                          hint="ריק = הכתובת הגלובלית של הספק"
                        />
                      )}
                      <FieldRow
                        label="מפתח API ייעודי (אופציונלי)"
                        type="password"
                        placeholder="ריק = המפתח הגלובלי של הספק"
                        value={ov.key || ''}
                        onChange={(v) => updateFeatureOverride(id, { key: v })}
                        hint="מפתח נפרד לפיצ'ר זה — שימושי לבילינג/מכסה נפרדים"
                      />
                      <ApiTestButton
                        providerId={providerId}
                        providerConfig={{
                          key: ov.key || config[providerId]?.key,
                          baseUrl: ov.baseUrl || config[providerId]?.baseUrl,
                          model: ov.model || config[providerId]?.model,
                        }}
                      />
                    </>
                  )}
                </div>
              )}

              {/* override תמונות לפיצ'ר */}
              {(() => {
                const im = ov.image || {};
                const imEnabled = im.enabled === true;
                const genProvider = im.genProvider || '';
                const genNeedsKey = genProvider && genProvider !== 'gemini' && genProvider !== 'openai';
                return (
                  <div style={{ marginTop: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: '#6D28D9', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={imEnabled}
                        onChange={(e) => updateFeatureImage(id, { enabled: e.target.checked })}
                      />
                      🖼️ API תמונות ייעודי לפיצ'ר זה
                    </label>
                    {imEnabled && (
                      <div style={{ marginTop: 10, display: 'grid', gap: 10, paddingRight: 22 }}>
                        <div style={{ fontSize: 10, color: '#7C3AED' }}>שדה ריק נופל להגדרת התמונות הגלובלית.</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>תמונות סטוק</div>
                            <select
                              value={im.stockProvider || ''}
                              onChange={(e) => updateFeatureImage(id, { stockProvider: e.target.value })}
                              style={{ width: '100%', padding: '8px 10px', border: '1px solid #C4B5FD', borderRadius: 8, fontSize: 12, background: 'white' }}
                            >
                              <option value="">— גלובלי —</option>
                              <option value="pexels">Pexels</option>
                              <option value="unsplash">Unsplash</option>
                            </select>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>יצירת תמונות AI</div>
                            <select
                              value={genProvider}
                              onChange={(e) => updateFeatureImage(id, { genProvider: e.target.value, genModel: '' })}
                              style={{ width: '100%', padding: '8px 10px', border: '1px solid #C4B5FD', borderRadius: 8, fontSize: 12, background: 'white' }}
                            >
                              <option value="">— גלובלי —</option>
                              <option value="gemini">Gemini (Imagen)</option>
                              <option value="openai">OpenAI (gpt-image)</option>
                              <option value="stability">Stability AI</option>
                              <option value="xai">xAI Grok</option>
                              <option value="flux">FLUX (fal.ai)</option>
                            </select>
                          </div>
                        </div>
                        {im.stockProvider && (
                          <FieldRow
                            label={`מפתח ${im.stockProvider === 'unsplash' ? 'Unsplash' : 'Pexels'} (אופציונלי)`}
                            type="password"
                            placeholder="ריק = המפתח הגלובלי"
                            value={im.stockKey || ''}
                            onChange={(v) => updateFeatureImage(id, { stockKey: v })}
                          />
                        )}
                        {genProvider && (
                          <>
                            <FieldRow
                              label="מודל יצירת תמונות (אופציונלי)"
                              placeholder="ברירת מחדל של הספק"
                              value={im.genModel || ''}
                              onChange={(v) => updateFeatureImage(id, { genModel: v })}
                              options={['imagen-3.0-generate-002', 'gpt-image-1', 'stable-diffusion-xl-1024-v1-0', 'grok-2-image', 'fal-ai/flux/schnell', 'fal-ai/flux/dev']}
                            />
                            <FieldRow
                              label={genNeedsKey ? 'מפתח API לתמונות (חובה)' : 'מפתח API לתמונות (אופציונלי)'}
                              type="password"
                              placeholder={genNeedsKey ? 'מפתח הספק' : 'ריק = מפתח הטקסט/הגלובלי'}
                              value={im.genKey || ''}
                              onChange={(v) => updateFeatureImage(id, { genKey: v })}
                              hint={genNeedsKey ? 'Stability/xAI/FLUX דורשים מפתח ייעודי.' : ''}
                            />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── הגדרות עוזר חכם ───
function AssistantBehaviorSettings({ behavior, setBehavior }) {
  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--s-muted)', marginBottom: 16 }}>
        כשהכתיבה נתקעת, העוזר נפתח אוטומטית כסיידבר קבוע בצד ימין כדי לעזור בלי לחסום את המסמך.
      </p>

      <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--s-text-strong)', fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={behavior.autoPopup !== false}
            onChange={(e) => setBehavior(prev => ({ ...prev, autoPopup: e.target.checked }))}
          />
          פתח פאנל עוזר אוטומטית כשאני נתקע בכתיבה
        </label>
      </div>

      <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '14px', background: 'var(--s-surface)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--s-text-strong)', marginBottom: 6 }}>זמן המתנה לפני קפיצה</div>
        <input
          type="number"
          min="3"
          max="30"
          value={behavior.idleSeconds || 5}
          onChange={(e) => setBehavior(prev => ({ ...prev, idleSeconds: Math.max(3, Number(e.target.value) || 5) }))}
          style={{ width: 110, padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12 }}
        />
        <span style={{ marginRight: 8, fontSize: 12, color: 'var(--s-muted)' }}>שניות</span>
      </div>
    </div>
  );
}

function SidebarPanelSettings({ behavior, setBehavior, config }) {
  const sidebarSettings = normalizeSidebarModeSettings(behavior?.sidebarModeSettings);
  const selectedModeIds = new Set(sidebarSettings.modes.map((mode) => mode.id));
  const availableModes = Object.entries(AGENTS_CONFIG)
    .filter(([id, agent]) => agent?.label && !selectedModeIds.has(id))
    .map(([id, agent]) => ({ id, label: agent.label || id }));
  const [modeToAdd, setModeToAdd] = useState(() => availableModes[0]?.id || '');

  useEffect(() => {
    if (!availableModes.some((mode) => mode.id === modeToAdd)) {
      setModeToAdd(availableModes[0]?.id || '');
    }
  }, [availableModes.map((mode) => mode.id).join('|'), modeToAdd]);

  const commitSettings = (updater) => {
    setBehavior((prev) => {
      const current = normalizeSidebarModeSettings(prev?.sidebarModeSettings);
      const draft = typeof updater === 'function' ? updater(current) : updater;
      return {
        ...prev,
        sidebarModeSettings: normalizeSidebarModeSettings(draft),
      };
    });
  };

  const updateMode = (modeId, patch) => {
    commitSettings((current) => ({
      ...current,
      modes: current.modes.map((mode) => {
        if (mode.id !== modeId) return mode;
        const next = { ...mode, ...patch };
        if (Object.prototype.hasOwnProperty.call(patch, 'providerId')) {
          const providerId = String(patch.providerId || '').trim();
          const choices = getProviderModelChoices(providerId, config);
          next.model = providerId ? (choices.includes(mode.model) ? mode.model : (choices[0] || '')) : '';
        }
        return next;
      }),
    }));
  };

  const addMode = () => {
    const id = String(modeToAdd || '').trim();
    const agent = AGENTS_CONFIG[id];
    if (!id || !agent) return;
    commitSettings((current) => ({
      ...current,
      modes: [
        ...current.modes,
        {
          id,
          label: agent.label || id,
          enabled: true,
          providerId: agent.sidebarSelection?.providerId || agent.route || '',
          model: agent.sidebarSelection?.model || '',
        },
      ],
    }));
  };

  const removeMode = (modeId) => {
    commitSettings((current) => ({
      ...current,
      modes: current.modes.filter((mode) => mode.id !== modeId),
    }));
  };

  const providerOptions = [
    ['gemini', 'Gemini'],
    ['openai', 'OpenAI'],
    ['claude', 'Claude'],
    ['groq', 'Groq'],
    ['perplexity', 'Perplexity'],
    ['ollama', 'Ollama'],
    ['custom', config?.custom?.name || 'Custom'],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ border: '1px solid #DBEAFE', borderRadius: 14, padding: '14px', background: 'var(--s-surface-2)' }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: '#1E3A8A', fontWeight: 700 }}>
          <input
            type="checkbox"
            checked={sidebarSettings.forceGlobalProvider === true}
            onChange={(e) => commitSettings((current) => ({ ...current, forceGlobalProvider: e.target.checked }))}
            style={{ marginTop: 2 }}
          />
          <span>
            השתמש תמיד בספק ובמודל הכלליים מהגדרות מנועי AI
            <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6, fontWeight: 500 }}>
              כשזה פעיל, כל שליחה מהחלונית מתעלמת מהגדרות מצב, מהבחירה המקומית בחלונית ומניתוב הסוכן, ורצה דרך הספק הפעיל בטאב מנועי AI.
            </span>
          </span>
        </label>
      </div>

      <div style={{ border: '1px solid var(--s-border)', borderRadius: 14, padding: '14px', background: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--s-text-strong)' }}>מצבים בחלונית</div>
            <div style={{ fontSize: 11, color: 'var(--s-muted)', marginTop: 4, lineHeight: 1.6 }}>הסדר כאן הוא הסדר שיופיע בשורת הכפתורים של הצ׳אט הקלאסי.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              value={modeToAdd}
              onChange={(e) => setModeToAdd(e.target.value)}
              disabled={!availableModes.length}
              style={{ padding: '8px 10px', border: '1px solid var(--s-border)', borderRadius: 10, fontSize: 12, background: 'white', minWidth: 180 }}
            >
              {availableModes.length ? availableModes.map((mode) => (
                <option key={mode.id} value={mode.id}>{mode.label}</option>
              )) : <option value="">כל המצבים כבר נוספו</option>}
            </select>
            <button
              type="button"
              onClick={addMode}
              disabled={!modeToAdd}
              style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #93C5FD', background: modeToAdd ? '#EFF6FF' : 'var(--s-surface-2)', color: modeToAdd ? '#1D4ED8' : 'var(--s-muted)', cursor: modeToAdd ? 'pointer' : 'default', fontSize: 12, fontWeight: 700 }}
            >
              + הוסף מצב
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sidebarSettings.modes.map((mode, index) => {
            const providerId = String(mode.providerId || '').trim();
            const modelChoices = getProviderModelChoices(providerId, config);
            const configured = providerId ? isProviderConfigured(config, providerId) : true;
            return (
              <div key={mode.id} style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '12px', background: mode.enabled === false ? 'var(--s-surface-2)' : 'var(--s-surface)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) minmax(120px, 0.9fr) minmax(160px, 1.1fr) auto', gap: 8, alignItems: 'end' }}>
                  <label style={{ display: 'grid', gap: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--s-muted)' }}>שם מצב</span>
                    <input
                      value={mode.label || ''}
                      onChange={(e) => updateMode(mode.id, { label: e.target.value })}
                      style={{ padding: '8px 10px', border: '1px solid var(--s-border)', borderRadius: 10, fontSize: 12 }}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--s-muted)' }}>ספק</span>
                    <select
                      value={providerId}
                      onChange={(e) => updateMode(mode.id, { providerId: e.target.value })}
                      disabled={sidebarSettings.forceGlobalProvider === true}
                      style={{ padding: '8px 10px', border: '1px solid var(--s-border)', borderRadius: 10, fontSize: 12, background: sidebarSettings.forceGlobalProvider === true ? 'var(--s-surface-2)' : 'white' }}
                    >
                      <option value="">ברירת מחדל כללית</option>
                      {providerOptions.map(([id, label]) => (
                        <option key={id} value={id}>{label}{!isProviderConfigured(config, id) ? ' · לא מוגדר' : ''}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--s-muted)' }}>מודל</span>
                    <select
                      value={providerId && modelChoices.includes(mode.model) ? mode.model : ''}
                      onChange={(e) => updateMode(mode.id, { model: e.target.value })}
                      disabled={sidebarSettings.forceGlobalProvider === true || !providerId || !modelChoices.length}
                      style={{ padding: '8px 10px', border: '1px solid var(--s-border)', borderRadius: 10, fontSize: 12, background: sidebarSettings.forceGlobalProvider === true || !providerId ? 'var(--s-surface-2)' : 'white' }}
                    >
                      <option value="">מודל ברירת מחדל של הספק</option>
                      {modelChoices.map((modelName) => <option key={modelName} value={modelName}>{modelName}</option>)}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => removeMode(mode.id)}
                    style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                  >
                    הסר
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--s-text)', fontWeight: 600 }}>
                    <input type="checkbox" checked={mode.enabled !== false} onChange={(e) => updateMode(mode.id, { enabled: e.target.checked })} />
                    מוצג בחלונית
                  </label>
                  <div style={{ fontSize: 10, color: configured ? 'var(--s-muted)' : '#B45309' }}>
                    #{index + 1} · {AGENTS_CONFIG[mode.id]?.placeholder || mode.id}{configured ? '' : ' · הספק עדיין לא מוגדר בטאב מנועי AI'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// legacy — זרם הניתוח החיצוני בסכימה הישנה (מילוי-חורים לפרופיל). הזרם החדש:
// StyleSetupFlow (טאב "מנוע סגנון" + אונבורדינג שלב 10) שמזין את מנוע v3 ישירות.
// נשמר לתאימות לאחור; הסרה = פיצ'ר עתידי נפרד.
function PromptSettings({ sharedInstructions, setSharedInstructions, personalStyle, setPersonalStyle, onNavigate = null }) {
  const [copyState, setCopyState] = useState('');
  const [importRaw, setImportRaw] = useState('');
  const [applyState, setApplyState] = useState(''); // '' | 'ok' | 'error'
  const [applyMessage, setApplyMessage] = useState('');
  const [portablePrompt, setPortablePrompt] = useState('');
  const [portablePromptDirty, setPortablePromptDirty] = useState(true);

  const deferredSharedInstructions = useDeferredValue(sharedInstructions);
  const deferredPersonalStyle = useDeferredValue(personalStyle);
  const promptsReady = deferredSharedInstructions === sharedInstructions && deferredPersonalStyle === personalStyle;

  useEffect(() => {
    setPortablePromptDirty(true);
  }, [deferredSharedInstructions, deferredPersonalStyle]);

  // async — הייצוא כולל עכשיו דגימות כתיבה אמיתיות מה-store (טעינה אסינכרונית).
  const buildPortablePromptDraft = async () => {
    const nextPrompt = await buildPortablePrompt({
      sharedInstructions: deferredSharedInstructions,
      profile: deferredPersonalStyle,
      // יעד: AI חיצוני בלבד — בלוק voice רזה, בלי dump JSON כבד שרלוונטי רק לייבוא חזרה לוורדפלו.
      emphasizeVoice: true,
    });
    setPortablePrompt(nextPrompt);
    setPortablePromptDirty(false);
    return nextPrompt;
  };

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

  // ייבוא חבילת WordFlow (הצד השני של ה-Portable Prompt שמייצאים כאן). ניתוח סגנון דרך AI
  // חיצוני *לא* חי כאן יותר — הוא כפילות מלאה של הכרטיס שבטאב "סגנון אישי", שהפרומפט שלו
  // כבר מבקש את אותה סכימת style/coverPageDefaults ומריץ את אותו mergeExternalStyleExtractionIntoProfile.
  // מי שמדביק כאן פלט ניתוח בטעות מקבל הפנייה לשם במקום שגיאת parse סתומה.
  const applyImportPackage = () => {
    const raw = String(importRaw || '').trim();
    if (!raw) { setApplyState('error'); setApplyMessage('אין מה לייבא.'); return; }
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('לא נמצא JSON בטקסט שהודבק.');
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed?.kind !== 'wordflow-portable-profile') {
        const looksLikeStyleAnalysis = parsed && typeof parsed === 'object'
          && (Array.isArray(parsed.patterns) || parsed.style || parsed.coverPageDefaults || typeof parsed.profileSummary === 'string');
        throw new Error(looksLikeStyleAnalysis
          ? 'זה נראה כמו פלט ניתוח סגנון — הדבק אותו בהגדרות ← סגנון אישי, בכרטיס "ניתוח דרך AI חיצוני".'
          : 'זו לא חבילת WordFlow. הדבק כאן רק פלט של "העתק Prompt" מהכרטיס הזה במכשיר אחר.');
      }
      const imported = applyPortableProfilePackage(parsed);
      if (!imported?.ok) throw new Error(imported?.error || 'ייבוא החבילה נכשל.');
      if (setSharedInstructions && typeof parsed.sharedInstructions === 'string') setSharedInstructions(parsed.sharedInstructions);
      if (setPersonalStyle) setPersonalStyle(getPersonalStyleProfile());
      setApplyState('ok');
      setApplyMessage('חבילת WordFlow יובאה בהצלחה במחשב הזה.');
      setImportRaw('');
    } catch (e) {
      setApplyState('error');
      setApplyMessage(e.message);
    } finally {
      setTimeout(() => { setApplyState(''); setApplyMessage(''); }, 6000);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 13, color: 'var(--s-muted)', marginBottom: 0, lineHeight: 1.7 }}>
        כאן מגדירים הנחיות קבועות שנשלחות לכל ספקי ה-AI, ומייצאים או מייבאים את ההגדרות כחבילה אחת בין מכשירים.
      </p>
      {!promptsReady && (
        <div style={{ fontSize: 11, color: '#1D4ED8', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '8px 10px' }}>
          מעדכן את ה-Prompt ברקע...
        </div>
      )}

      {/* הנחיות משותפות */}
      <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '14px', background: 'white' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 8 }}>הנחיות משותפות לכל ספקי AI</div>
        <textarea
          value={sharedInstructions}
          onChange={(e) => setSharedInstructions(e.target.value)}
          rows={5}
          placeholder="למשל: כתוב בעברית תקנית, אל תמציא מקורות, שמור על טון ענייני, אל תוסיף מבוא אם לא ביקשו"
          style={{ width: '100%', padding: '10px 12px', border: '1px solid #C8C6C4', borderRadius: 10, fontSize: 12, resize: 'vertical', marginBottom: 6 }}
        />
        <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6 }}>הפרופיל האישי והלמידה הקיימת מצטרפים אוטומטית ל-Portable Prompt למטה.</div>
      </div>

      {/* ניתוח סגנון דרך AI חיצוני היה כאן — הוסר כי היה כפילות מלאה של הכרטיס שבטאב
          "סגנון אישי" (אותה סכימה מילולית, אותה פונקציית מיזוג). נשארה הפנייה בלבד. */}
      <div style={{ border: '1px solid #DBEAFE', borderRadius: 12, padding: '12px 14px', background: 'var(--s-surface-2)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.7, flex: 1, minWidth: 240 }}>
          <span style={{ fontWeight: 700, color: '#1E3A8A' }}>🔍 מנתח את הכתיבה שלך דרך AI חיצוני?</span> הזרימה הזו עברה לטאב "סגנון אישי" — שם היא מזינה גם את מנוע הסגנון וגם את פרטי הזהות וההגשה (מוסד, מרצה, קורס, ת"ז) בהדבקה אחת.
        </div>
        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate('personal')}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}
          >
            פתח סגנון אישי ↗
          </button>
        )}
      </div>

      {/* Portable Prompt */}
      <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '14px', background: 'var(--s-surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--s-text-strong)' }}>Portable Prompt מוכן להעתקה</div>
            <div style={{ fontSize: 11, color: 'var(--s-muted)', marginTop: 3 }}>יעבוד גם ב-Claude, Gemini, ChatGPT או כל ספק אחר.</div>
          </div>
          <button
            type="button"
            onClick={async () => {
              const text = portablePrompt && !portablePromptDirty ? portablePrompt : await buildPortablePromptDraft();
              copyText(text, 'הועתק ללוח ✓');
            }}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
          >
            העתק Prompt
          </button>
        </div>
        {portablePrompt ? (
          <textarea
            readOnly
            value={portablePrompt}
            rows={10}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--s-border)', borderRadius: 10, fontSize: 12, resize: 'vertical', background: 'white', color: 'var(--s-text-strong)' }}
          />
        ) : (
          <button
            type="button"
            onClick={buildPortablePromptDraft}
            style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px dashed var(--s-border)', background: 'white', color: 'var(--s-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
          >
            הצג Portable Prompt
          </button>
        )}
        {portablePrompt && portablePromptDirty ? (
          <div style={{ fontSize: 11, color: '#B45309', marginTop: 8 }}>הפרופיל השתנה. לחץ העתק או הצג מחדש כדי לרענן את ה-Prompt.</div>
        ) : null}
        {copyState ? <div style={{ fontSize: 11, color: copyState.includes('נכשלה') ? '#991B1B' : '#166534', marginTop: 8 }}>{copyState}</div> : null}

        {/* ייבוא — הצד השני של אותו כרטיס: מדביקים כאן חבילה שיוצאה במכשיר אחר. */}
        <div style={{ borderTop: '1px solid var(--s-border)', marginTop: 12, paddingTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 4 }}>ייבוא חבילה ממכשיר אחר</div>
          <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 6, lineHeight: 1.6 }}>הדבק כאן חבילת WordFlow שהעתקת מהכרטיס הזה במכשיר אחר, כדי לשחזר את הפרופיל וההנחיות.</div>
          <textarea
            value={importRaw}
            onChange={(e) => setImportRaw(e.target.value)}
            rows={4}
            placeholder='הדבק כאן חבילת WordFlow (מתחילה ב-{"kind":"wordflow-portable-profile"...)'
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 11, resize: 'vertical', direction: 'ltr', marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={applyImportPackage}
              disabled={!importRaw.trim()}
              style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: importRaw.trim() ? '#1D4ED8' : 'var(--s-border)', color: 'white', cursor: importRaw.trim() ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 700 }}
            >
              ⬇️ ייבא חבילה
            </button>
            {applyMessage && (
              <div style={{ fontSize: 11, color: applyState === 'ok' ? '#166534' : '#991B1B', fontWeight: 600, lineHeight: 1.6, flex: 1, minWidth: 200 }}>{applyMessage}</div>
            )}
          </div>
        </div>
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

function PresentationDefaultsSettings({ prefs, setPrefs }) {
  const set = (field, value) => setPrefs((prev) => ({ ...prev, [field]: value }));
  const densityOptions = [
    ['lean', 'רזה'],
    ['balanced', 'מאוזן'],
    ['rich', 'עשיר'],
  ];
  const imageOptions = [
    ['high', 'גבוה'],
    ['medium', 'בינוני'],
    ['low', 'נמוך'],
  ];

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--s-muted)', marginBottom: 16 }}>
        ברירות המחדל של סטודיו המצגות. הערכים האלה ימולאו אוטומטית בטופס יצירת מצגת חדשה.
      </p>

      <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 10 }}>סגנון ברירת מחדל</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {DECK_THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => set('defaultThemeId', theme.id)}
              title={theme.blurb || ''}
              style={{
                textAlign: 'right',
                border: `1px solid ${prefs.defaultThemeId === theme.id ? '#2563EB' : 'var(--s-border)'}`,
                background: prefs.defaultThemeId === theme.id ? '#EFF6FF' : 'var(--s-surface)',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--s-text-strong)',
                cursor: 'pointer',
              }}
            >
              {theme.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 10 }}>מבנה ברירת מחדל</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>רמת עומס</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {densityOptions.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => set('defaultDensity', id)}
                  style={{
                    flex: 1,
                    border: `1px solid ${prefs.defaultDensity === id ? '#2563EB' : '#C8C6C4'}`,
                    background: prefs.defaultDensity === id ? '#EFF6FF' : 'white',
                    borderRadius: 6,
                    padding: '7px 4px',
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--s-text-strong)',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>מספר שקופיות</div>
            <input
              type="number"
              min="4"
              max="40"
              value={prefs.defaultSlideCount ?? 10}
              onChange={(e) => set('defaultSlideCount', Math.max(4, Math.min(40, Number(e.target.value) || 10)))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12 }}
            />
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>דגש על תמונות</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {imageOptions.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => set('defaultImageIntensity', id)}
                style={{
                  flex: 1,
                  border: `1px solid ${prefs.defaultImageIntensity === id ? '#2563EB' : '#C8C6C4'}`,
                  background: prefs.defaultImageIntensity === id ? '#EFF6FF' : 'white',
                  borderRadius: 6,
                  padding: '7px 4px',
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--s-text-strong)',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 10 }}>קהל ומטרה ברירת מחדל</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>קהל יעד</div>
            <input
              type="text"
              value={prefs.defaultAudience || ''}
              onChange={(e) => set('defaultAudience', e.target.value)}
              placeholder="משקיעים, מרצה, לקוח..."
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>מטרה</div>
            <input
              type="text"
              value={prefs.defaultGoal || ''}
              onChange={(e) => set('defaultGoal', e.target.value)}
              placeholder="לשכנע, להסביר, למכור..."
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12 }}
            />
          </div>
        </div>
      </div>

      <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '14px', background: 'var(--s-surface)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--s-text-strong)' }}>
          <input type="checkbox" checked={prefs.rememberLastChoices !== false} onChange={(e) => set('rememberLastChoices', e.target.checked)} />
          זכור את הבחירות האחרונות שלי בטופס היצירה
        </label>
      </div>
    </div>
  );
}

function SpssDefaultsSettings({ prefs, setPrefs }) {
  const set = (field, value) => setPrefs((prev) => ({ ...prev, [field]: value }));
  const defaultDataInputRef = React.useRef(null);
  const [defaultDataBusy, setDefaultDataBusy] = React.useState(false);
  const [defaultDataError, setDefaultDataError] = React.useState('');
  const defaultDataAnalysis = prefs.defaultDataAnalysis && typeof prefs.defaultDataAnalysis === 'object'
    ? prefs.defaultDataAnalysis
    : null;
  const genModeOptions = [
    ['analysis', 'ניתוח', 'יצירת syntax לניתוחים סטטיסטיים'],
    ['prep', 'הכנת נתונים', 'recode / compute / מהימנות — כותב משתנים חדשים'],
  ];
  const viewOptions = [
    ['master', 'Master מאוחד'],
    ['block', 'בלוק אחרון'],
  ];
  const onDefaultDataInputChange = async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;
    setDefaultDataBusy(true);
    setDefaultDataError('');
    try {
      const analysis = await readDataFileToAnalysis(file);
      setPrefs((prev) => ({
        ...prev,
        defaultDataFileName: analysis.fileName || file.name || '',
        defaultDataSavedAt: new Date().toISOString(),
        defaultDataAnalysis: analysis,
      }));
    } catch (error) {
      setDefaultDataError(error instanceof Error ? error.message : 'קריאת קובץ הנתונים נכשלה.');
    } finally {
      setDefaultDataBusy(false);
    }
  };
  const clearDefaultData = () => {
    setDefaultDataError('');
    setPrefs((prev) => ({
      ...prev,
      defaultDataFileName: '',
      defaultDataSavedAt: '',
      defaultDataAnalysis: null,
    }));
  };

  return (
    <div>
      <input
        ref={defaultDataInputRef}
        type="file"
        accept={SUPPORTED_DATA_FILE_ACCEPT}
        style={{ display: 'none' }}
        onChange={onDefaultDataInputChange}
      />
      <p style={{ fontSize: 13, color: 'var(--s-muted)', marginBottom: 16 }}>
        ברירות המחדל של סטודיו ה-SPSS. הערכים חלים בכל פעם שנכנסים לסטודיו.
      </p>

      <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 4 }}>קובץ נתונים ברירת מחדל</div>
            <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6 }}>
              נטען אוטומטית בכניסה לטאבי SPSS. נשמר snapshot של metadata וסטטיסטיקות סיכום, לא שורות הדאטה הגולמיות.
            </div>
          </div>
          <button
            type="button"
            onClick={() => defaultDataInputRef.current?.click()}
            disabled={defaultDataBusy}
            style={{ border: '1px solid #2563EB', background: defaultDataBusy ? '#DBEAFE' : '#EFF6FF', color: '#1D4ED8', borderRadius: 8, padding: '7px 10px', fontSize: 12, fontWeight: 700, cursor: defaultDataBusy ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}
          >
            {defaultDataBusy ? 'טוען...' : (defaultDataAnalysis ? 'החלף קובץ' : 'בחר קובץ')}
          </button>
        </div>
        {defaultDataAnalysis ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <span style={{ borderRadius: 999, background: '#F1F5F9', padding: '5px 9px', fontSize: 11, fontWeight: 700, color: '#334155' }}>{defaultDataAnalysis.fileName || prefs.defaultDataFileName || 'קובץ נתונים'}</span>
            <span style={{ borderRadius: 999, background: '#F1F5F9', padding: '5px 9px', fontSize: 11, fontWeight: 700, color: '#334155' }}>{Number(defaultDataAnalysis.rowCount || 0).toLocaleString('he-IL')} שורות</span>
            <span style={{ borderRadius: 999, background: '#F1F5F9', padding: '5px 9px', fontSize: 11, fontWeight: 700, color: '#334155' }}>{defaultDataAnalysis.columnCount || 0} עמודות</span>
            <button type="button" onClick={clearDefaultData} style={{ border: '1px solid #CBD5E1', background: 'white', color: '#475569', borderRadius: 8, padding: '5px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>נקה</button>
          </div>
        ) : (
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--s-muted)' }}>לא הוגדר קובץ ברירת מחדל.</div>
        )}
        {defaultDataError && <div style={{ marginTop: 8, fontSize: 11, color: '#B91C1C', lineHeight: 1.6 }}>{defaultDataError}</div>}
      </div>

      <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 6 }}>מצב יצירה ברירת מחדל</div>
        <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 10, lineHeight: 1.6 }}>
          איזה מצב יהיה פעיל כשפותחים את הסטודיו.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {genModeOptions.map(([id, label, hint]) => (
            <button
              key={id}
              type="button"
              onClick={() => set('defaultGenMode', id)}
              style={{
                textAlign: 'right',
                border: `1px solid ${prefs.defaultGenMode === id ? '#2563EB' : 'var(--s-border)'}`,
                background: prefs.defaultGenMode === id ? '#EFF6FF' : 'var(--s-surface)',
                borderRadius: 10,
                padding: '10px 12px',
                cursor: 'pointer',
              }}
            >
              <strong style={{ display: 'block', fontSize: 12, color: 'var(--s-text-strong)', marginBottom: 2 }}>{label}</strong>
              <span style={{ fontSize: 10, color: 'var(--s-muted)' }}>{hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 10 }}>תצוגת סינטקס ברירת מחדל</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {viewOptions.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => set('defaultSyntaxView', id)}
              style={{
                flex: 1,
                border: `1px solid ${prefs.defaultSyntaxView === id ? '#2563EB' : '#C8C6C4'}`,
                background: prefs.defaultSyntaxView === id ? '#EFF6FF' : 'white',
                borderRadius: 6,
                padding: '7px 4px',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--s-text-strong)',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '14px', background: 'var(--s-surface)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 10 }}>הסברים והתנהגות</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--s-text-strong)', marginBottom: 10 }}>
          <input type="checkbox" checked={prefs.tutorMode !== false} onChange={(e) => set('tutorMode', e.target.checked)} />
          מצב לימוד — הוסף הסברים לכל בלוק syntax כברירת מחדל
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--s-text-strong)' }}>
          <input type="checkbox" checked={prefs.autoSwitchPrepForReliability !== false} onChange={(e) => set('autoSwitchPrepForReliability', e.target.checked)} />
          עבור אוטומטית למצב הכנת נתונים בבקשות מהימנות / recode / היפוך סולם
        </label>
      </div>
    </div>
  );
}

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
      <p style={{ fontSize: 13, color: 'var(--s-muted)', marginBottom: 16 }}>
        סימנתי כברירת מחדל את האפשרויות המרכזיות שסומנו אצלך ב-Word המקורי.
      </p>

      <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 10 }}>טיפוגרפיה ברירת מחדל</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>גופן כללי למסמכים חדשים</div>
            <select
              value={prefs.defaultFontFamily || 'Alef'}
              onChange={(e) => setPrefs(prev => ({ ...prev, defaultFontFamily: e.target.value, defaultFontStack: getDefaultFontStack(e.target.value) }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, background: 'white' }}
            >
              {DEFAULT_FONT_OPTIONS.map((font) => <option key={font} value={font}>{font}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>גודל ברירת מחדל</div>
            <input
              type="text"
              value={prefs.defaultFontSize || '12pt'}
              onChange={(e) => setFlag('defaultFontSize', e.target.value)}
              placeholder="12pt"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12 }}
            />
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6 }}>אפשר להגדיר כאן ברירת מחדל כללית, ובמסך הבית לערוך סגנון ספציפי עם אייקון העיפרון.</div>
      </div>

      <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 10 }}>בדיקות בזמן כתיבה</div>
        {[
          ['checkSpellingAsYouType', 'בדיקת איות תוך כדי כתיבה'],
          ['markGrammarAsYouType', 'סימון שגיאות דקדוק תוך כדי כתיבה'],
          ['grammarWithSpelling', 'בדיקת דקדוק יחד עם איות'],
        ].map(([field, label]) => (
          <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--s-text-strong)', marginBottom: 8 }}>
            <input type="checkbox" checked={prefs[field] !== false} onChange={(e) => setFlag(field, e.target.checked)} />
            {label}
          </label>
        ))}
      </div>

      <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 10 }}>עריכה חכמה</div>
        {[
          ['replaceSelectionOnType', 'החלף טקסט מסומן כשמתחילים להקליד'],
          ['selectWholeWord', 'בחר אוטומטית מילה שלמה'],
          ['allowDragDropEditing', 'אפשר גרירה ושחרור של טקסט'],
          ['ctrlClickOpensLinks', 'Ctrl + לחיצה על קישור לפתיחה'],
          ['showPasteOptions', 'הצג אפשרויות הדבקה'],
          ['smartCutPaste', 'הדבקה וחיתוך חכמים'],
        ].map(([field, label]) => (
          <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--s-text-strong)', marginBottom: 8 }}>
            <input type="checkbox" checked={prefs[field] !== false} onChange={(e) => setFlag(field, e.target.checked)} />
            {label}
          </label>
        ))}
      </div>

      <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 10 }}>הדפסה ותצוגה</div>
        {[
          ['showDrawings', 'הצג ציורים ותיבות טקסט על המסך'],
          ['showTextHighlighting', 'הצג סימון טקסט'],
          ['printBackgrounds', 'הדפס צבעי רקע ותמונות'],
          ['updateFieldsBeforePrint', 'עדכן שדות לפני הדפסה'],
        ].map(([field, label]) => (
          <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--s-text-strong)', marginBottom: 8 }}>
            <input type="checkbox" checked={prefs[field] !== false} onChange={(e) => setFlag(field, e.target.checked)} />
            {label}
          </label>
        ))}
      </div>

      <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 6 }}>התאמה אישית של פעולות AI</div>
        <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 10, lineHeight: 1.6 }}>
          בחר אילו פעולות יופיעו בסרגל האקדמי ובחלונית ה-AI. השינויים חלים מיד.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {ACTION_VISIBILITY_OPTIONS.map((action) => (
            <label key={action.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--s-text-strong)', border: '1px solid var(--s-border)', borderRadius: 10, padding: '8px 10px', background: 'var(--s-surface)' }}>
              <input
                type="checkbox"
                checked={prefs.aiQuickActions?.[action.id] !== false}
                onChange={(e) => setActionVisibility(action.id, e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>
                <strong style={{ display: 'block', marginBottom: 2 }}>{action.label}</strong>
                <span style={{ fontSize: 10, color: 'var(--s-muted)' }}>{action.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '14px', background: 'var(--s-surface)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 10 }}>שמירה ושחזור</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--s-text-strong)', marginBottom: 10 }}>
          <input type="checkbox" checked={prefs.autoSave !== false} onChange={(e) => setFlag('autoSave', e.target.checked)} />
          שמירה אוטומטית פעילה כברירת מחדל
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--s-text-strong)', marginBottom: 10 }}>
          <input type="checkbox" checked={prefs.keepLastAutosavedVersion !== false} onChange={(e) => setFlag('keepLastAutosavedVersion', e.target.checked)} />
          שמור את הגרסה האחרונה לשחזור
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--s-text-strong)', marginBottom: 10 }}>
          <input type="checkbox" checked={prefs.allowBackgroundSave !== false} onChange={(e) => setFlag('allowBackgroundSave', e.target.checked)} />
          אפשר שמירה ברקע
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--s-text-strong)', marginBottom: 10 }}>
          <input type="checkbox" checked={prefs.savePreview !== false} onChange={(e) => setFlag('savePreview', e.target.checked)} />
          שמור תמונת תצוגה למסמך
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--s-muted)' }}>שמור כל</span>
          <input
            type="number"
            min="1"
            max="60"
            value={prefs.autoSaveMinutes || 10}
            onChange={(e) => setFlag('autoSaveMinutes', Math.max(1, Number(e.target.value) || 10))}
            style={{ width: 90, padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12 }}
          />
          <span style={{ fontSize: 12, color: 'var(--s-muted)' }}>דקות</span>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--s-text-strong)' }}>
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
      <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 8 }}>שליטה מלאה בסקילים</div>
        <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6, marginBottom: 10 }}>
          כאן בוחרים איזה סקיל יפעל אוטומטית, איזה יישאר ידני בלבד, ואיך כל סקיל ידבר ויעבוד בדיוק בדרך שמתאימה לך.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>סקיל ברירת מחדל</div>
            <select
              value={skillsState.defaultSkillId || 'style-guardian'}
              onChange={(e) => setSkillsState((prev) => ({ ...prev, defaultSkillId: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, background: 'white' }}
            >
              {skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.label}</option>)}
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--s-text-strong)', alignSelf: 'end', marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={skillsState.autoApplyDefault === true}
              onChange={(e) => setSkillsState((prev) => ({ ...prev, autoApplyDefault: e.target.checked }))}
            />
            החל אוטומטית את ברירת המחדל
          </label>
        </div>
        <div style={{ fontSize: 10, color: 'var(--s-muted)' }}>טיפ: אם אתה רוצה שליטה גבוהה, השאר את הסקילים על מצב ידני והפעל אותם דרך / בחלונית ה-AI.</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {skills.map((skill) => {
          const mode = skillsState.skills?.[skill.id]?.mode || 'manual';
          const customInstruction = String(skillsState.skills?.[skill.id]?.customInstruction || '');
          const customKeywords = Array.isArray(skillsState.skills?.[skill.id]?.customKeywords)
            ? skillsState.skills?.[skill.id]?.customKeywords.join(', ')
            : String(skillsState.skills?.[skill.id]?.customKeywords || '');
          return (
            <div key={skill.id} style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '14px', background: 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start', marginBottom: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 4 }}>{skill.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6 }}>{skill.description}</div>
                  <div style={{ fontSize: 10, color: 'var(--s-muted)', marginTop: 4 }}>מתאים במיוחד ל: {skill.usageHint}</div>
                  <div style={{ fontSize: 10, color: 'var(--s-muted)', marginTop: 4 }}>טריגרים קיימים: {(skill.keywords || []).slice(0, 5).join(' • ')}</div>
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
                  <button type="button" onClick={() => resetSkill(skill.id)} style={{ border: '1px solid var(--s-border)', background: 'var(--s-surface-2)', color: 'var(--s-text)', borderRadius: 8, padding: '8px 10px', fontSize: 11, cursor: 'pointer' }}>
                    אפס התאמה
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>איך אתה רוצה שהסקיל יעבוד?</div>
                  <textarea
                    value={customInstruction}
                    onChange={(e) => updateSkillField(skill.id, 'customInstruction', e.target.value)}
                    rows={4}
                    placeholder="למשל: תמיד תהיה תמציתי, אל תמציא מקורות, תכתוב עם כותרות קצרות, שמור על טון אקדמי רגוע"
                    style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>מילות זיהוי שאתה רוצה להוסיף</div>
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

const workspaceTextToList = (value = '') => String(value || '')
  .split('\n')
  .map((item) => item.trim())
  .filter(Boolean);

const workspaceListToText = (value = []) => (Array.isArray(value) ? value : [])
  .filter(Boolean)
  .join('\n');

const createWorkspaceStep = (index = 1) => ({
  id: `step-${Date.now()}-${index}`,
  role: 'סוכן עבודה',
  goal: 'לקדם את המשימה לשלב הבא בצורה מדויקת',
  instructions: ['פעל לפי ההנחיות, שמור על הסגנון האישי, ואל תמציא מידע שלא נמצא בחומרים.'],
  output: 'תוצר ביניים שימושי',
  providerId: '',
  model: '',
});

const createWorkspaceDraft = () => ({
  label: 'סביבת עבודה חדשה',
  mission: 'פתרון משימה מותאמת אישית בעזרת צוות עבודה ברור וממוקד.',
  taskSignals: ['משימה מותאמת אישית'],
  providerId: '',
  model: '',
  sourcePolicy: {
    mode: 'context-aware',
    citationStyle: 'לפי הצורך',
    requireSourcesWhen: ['עבודה אקדמית', 'טענות עובדתיות', 'בקשה למקורות'],
  },
  stylePolicy: {
    preservePersonalStyle: true,
    allowPersuasiveReframing: false,
    avoid: ['המצאת מקורות', 'שינוי סגנון אישי בלי צורך', 'הבטחות שלא נתמכות בחומרים'],
  },
  pipeline: [
    {
      id: 'planner',
      role: 'מתכנן עבודה',
      goal: 'להבין את המשימה, לפרק אותה לשלבים, ולזהות מה חסר לפני כתיבה.',
      instructions: ['זהה סוג משימה, דרישות, מגבלות, חומרי עזר וחוסרים.', 'אם חסרים מקורות, ציין זאת בתוך התוצר במקום להמציא.'],
      output: 'תכנית עבודה קצרה',
    },
    {
      id: 'writer',
      role: 'כותב ראשי',
      goal: 'לייצר טיוטה מלאה שעונה ישירות למשימה.',
      instructions: ['כתוב בעברית טבעית וברורה.', 'שמור על הסגנון האישי והימנע משפה רובוטית.'],
      output: 'טיוטה מלאה',
    },
    {
      id: 'reviewer',
      role: 'מבקר איכות',
      goal: 'לבדוק התאמה להנחיות, מקורות, מבנה וסגנון לפני הגשה.',
      instructions: ['תקן פערים, הדק ניסוחים, וסמן מקומות שבהם אין בסיס מספיק.', 'אל תוסיף מקורות פיקטיביים.'],
      output: 'גרסה סופית נקייה',
    },
  ],
});

function WorkspaceV2Settings({ config }) {
  const [templates, setTemplates] = useState(() => getWorkspaceV2Templates());
  const [selectedId, setSelectedId] = useState(() => templates[0]?.id || '');
  const [draft, setDraft] = useState(() => templates[0] || createWorkspaceDraft());
  const [status, setStatus] = useState('');

  const providerChoices = useMemo(() => {
    const choices = getConfiguredProviderChoices(config);
    if (choices.length) return choices;
    const fallback = String(config?.active || 'gemini').trim() || 'gemini';
    return [{ id: fallback, label: fallback }];
  }, [config]);

  const selectedProviderId = String(draft?.providerId || '').trim();
  const modelChoices = useMemo(() => (
    selectedProviderId ? getProviderModelChoices(selectedProviderId, config, [draft?.model].filter(Boolean)) : []
  ), [config, draft?.model, selectedProviderId]);

  const selectedTemplate = templates.find((template) => template.id === selectedId) || null;
  const isBuiltin = Boolean(selectedTemplate?.builtIn);

  const refreshTemplates = (nextSelectedId = selectedId) => {
    const nextTemplates = getWorkspaceV2Templates();
    setTemplates(nextTemplates);
    const nextSelected = nextTemplates.find((template) => template.id === nextSelectedId) || nextTemplates[0] || createWorkspaceDraft();
    setSelectedId(nextSelected.id || '');
    setDraft(nextSelected);
  };

  const selectTemplate = (templateId) => {
    const nextTemplate = templates.find((template) => template.id === templateId);
    if (!nextTemplate) return;
    setSelectedId(nextTemplate.id);
    setDraft(nextTemplate);
    setStatus('');
  };

  const updateDraft = (patch) => {
    setDraft((prev) => ({ ...(prev || createWorkspaceDraft()), ...patch }));
    setStatus('');
  };

  const updateNestedDraft = (section, patch) => {
    setDraft((prev) => ({
      ...(prev || createWorkspaceDraft()),
      [section]: {
        ...((prev || {})[section] || {}),
        ...patch,
      },
    }));
    setStatus('');
  };

  const updateStep = (index, patch) => {
    setDraft((prev) => {
      const pipeline = Array.isArray(prev?.pipeline) ? [...prev.pipeline] : [];
      pipeline[index] = { ...(pipeline[index] || createWorkspaceStep(index + 1)), ...patch };
      return { ...(prev || createWorkspaceDraft()), pipeline };
    });
    setStatus('');
  };

  const addStep = () => {
    setDraft((prev) => {
      const pipeline = Array.isArray(prev?.pipeline) ? [...prev.pipeline] : [];
      pipeline.push(createWorkspaceStep(pipeline.length + 1));
      return { ...(prev || createWorkspaceDraft()), pipeline };
    });
    setStatus('');
  };

  const moveStep = (index, direction) => {
    setDraft((prev) => {
      const pipeline = Array.isArray(prev?.pipeline) ? [...prev.pipeline] : [];
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= pipeline.length) return prev;
      [pipeline[index], pipeline[nextIndex]] = [pipeline[nextIndex], pipeline[index]];
      return { ...(prev || createWorkspaceDraft()), pipeline };
    });
    setStatus('');
  };

  const removeStep = (index) => {
    setDraft((prev) => {
      const pipeline = (Array.isArray(prev?.pipeline) ? prev.pipeline : []).filter((_, itemIndex) => itemIndex !== index);
      return { ...(prev || createWorkspaceDraft()), pipeline: pipeline.length ? pipeline : [createWorkspaceStep(1)] };
    });
    setStatus('');
  };

  const handleCreate = () => {
    const created = createWorkspaceV2Template(createWorkspaceDraft());
    refreshTemplates(created.id);
    setStatus('נוצרה סביבת עבודה חדשה. אפשר לערוך ולשמור.');
  };

  const handleDuplicate = () => {
    const base = draft || createWorkspaceDraft();
    const created = createWorkspaceV2Template({
      ...base,
      id: '',
      builtIn: false,
      label: `${base.label || 'סביבת עבודה'} - עותק`,
    });
    refreshTemplates(created.id);
    setStatus('נוצר עותק חדש לעריכה חופשית.');
  };

  const handleSave = () => {
    const saved = saveWorkspaceV2Template(draft);
    refreshTemplates(saved.id);
    setStatus('סביבת העבודה נשמרה והמסך הראשי יתעדכן מיד.');
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    const message = isBuiltin
      ? 'לאפס את כל השינויים שבוצעו לסביבת העבודה המובנית הזאת?'
      : 'למחוק את סביבת העבודה המותאמת הזאת?';
    if (!(await showConfirm(message, { title: isBuiltin ? 'איפוס סביבה' : 'מחיקת סביבה', confirmLabel: isBuiltin ? 'אפס' : 'מחק', tone: 'danger' }))) return;
    deleteWorkspaceV2Template(selectedId);
    refreshTemplates('');
    setStatus(isBuiltin ? 'השינויים לסביבה המובנית אופסו.' : 'סביבת העבודה נמחקה.');
  };

  const handleResetAll = async () => {
    if (!(await showConfirm('לאפס את כל סביבות העבודה המותאמות והשינויים לתבניות המובנות?', { title: 'איפוס כל הסביבות', confirmLabel: 'אפס הכל', tone: 'danger' }))) return;
    resetWorkspaceV2Templates();
    refreshTemplates('');
    setStatus('כל סביבות העבודה אופסו לברירת המחדל.');
  };

  return (
    <div dir="rtl" style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) 1fr', gap: 16 }}>
      <div style={{ border: '1px solid var(--s-border)', borderRadius: 16, padding: 14, background: 'var(--s-surface-2)', alignSelf: 'start' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--s-text-strong)', marginBottom: 6 }}>סביבות עבודה</div>
        <div style={{ fontSize: 12, color: 'var(--s-muted)', lineHeight: 1.6, marginBottom: 12 }}>
          כאן מנהלים את הצוותים שמופיעים במסך הבית. המסלול הישיר נשאר נפרד ולא מושפע מהטאב הזה.
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <button type="button" onClick={handleCreate} style={{ border: '1px solid #2563EB', background: '#2563EB', color: 'white', borderRadius: 10, padding: '8px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>צור חדשה</button>
          <button type="button" onClick={handleDuplicate} style={{ border: '1px solid var(--s-border)', background: 'white', color: 'var(--s-text)', borderRadius: 10, padding: '8px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>שכפל</button>
          <button type="button" onClick={handleResetAll} style={{ border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#991B1B', borderRadius: 10, padding: '8px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>אפס הכל</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => selectTemplate(template.id)}
              style={{
                textAlign: 'right',
                border: selectedId === template.id ? '1px solid #2563EB' : '1px solid var(--s-border)',
                background: selectedId === template.id ? '#EFF6FF' : 'white',
                color: 'var(--s-text-strong)',
                borderRadius: 12,
                padding: 12,
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <strong style={{ fontSize: 13 }}>{template.label}</strong>
                <span style={{ fontSize: 10, color: template.builtIn ? 'var(--s-muted)' : '#047857', border: '1px solid var(--s-border)', borderRadius: 999, padding: '2px 7px', background: 'white' }}>
                  {template.builtIn ? 'מובנית' : 'מותאמת'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.5, marginTop: 4 }}>{template.mission}</div>
              <div style={{ fontSize: 10, color: 'var(--s-muted)', marginTop: 6 }}>
                {template.pipeline?.length || 0} תפקידים · {template.providerId || 'ספק לפי מסך הבית'}
                {(template.pipeline || []).some((step) => step.providerId || step.model) ? ' · מודלים לפי תפקיד' : ''}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ border: '1px solid var(--s-border)', borderRadius: 16, padding: 16, background: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', marginBottom: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--s-text-strong)' }}>עריכת סביבת עבודה</div>
              <div style={{ fontSize: 12, color: 'var(--s-muted)', marginTop: 4 }}>כל שינוי כאן משפיע על Workspace v2 בלבד. Direct נשאר נקי.</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={handleDelete} style={{ border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#991B1B', borderRadius: 10, padding: '9px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                {isBuiltin ? 'אפס סביבה' : 'מחק סביבה'}
              </button>
              <button type="button" onClick={handleSave} style={{ border: '1px solid #16A34A', background: '#16A34A', color: 'white', borderRadius: 10, padding: '9px 16px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>שמור סביבה</button>
            </div>
          </div>
          {status && <div style={{ border: '1px solid #BBF7D0', background: '#F0FDF4', color: '#166534', borderRadius: 10, padding: '9px 11px', fontSize: 12, marginBottom: 12 }}>{status}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>שם הסביבה</div>
              <input value={draft?.label || ''} onChange={(e) => updateDraft({ label: e.target.value })} style={{ width: '100%', border: '1px solid var(--s-border)', borderRadius: 10, padding: '9px 10px', fontSize: 13 }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>מזהה פנימי</div>
              <input value={draft?.id || 'ייווצר בשמירה'} readOnly style={{ width: '100%', border: '1px solid var(--s-border)', borderRadius: 10, padding: '9px 10px', fontSize: 13, background: 'var(--s-surface-2)', color: 'var(--s-muted)' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>ייעוד הסביבה</div>
              <textarea value={draft?.mission || ''} onChange={(e) => updateDraft({ mission: e.target.value })} rows={3} style={{ width: '100%', border: '1px solid var(--s-border)', borderRadius: 10, padding: '9px 10px', fontSize: 13, resize: 'vertical' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>ספק AI</div>
              <select
                value={selectedProviderId}
                onChange={(e) => updateDraft({ providerId: e.target.value, model: '' })}
                style={{ width: '100%', border: '1px solid var(--s-border)', borderRadius: 10, padding: '9px 10px', fontSize: 13, background: 'white' }}
              >
                <option value="">לפי הבחירה במסך הבית</option>
                {providerChoices.map((provider) => <option key={provider.id} value={provider.id}>{provider.label || provider.id}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>מודל</div>
              <select
                value={draft?.model || ''}
                disabled={!selectedProviderId}
                onChange={(e) => updateDraft({ model: e.target.value })}
                style={{ width: '100%', border: '1px solid var(--s-border)', borderRadius: 10, padding: '9px 10px', fontSize: 13, background: selectedProviderId ? 'white' : 'var(--s-surface-2)' }}
              >
                <option value="">ברירת המחדל של הספק</option>
                {modelChoices.map((model) => <option key={model} value={model}>{model}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>מילות זיהוי לסיווג אוטומטי, שורה לכל סימן</div>
              <textarea value={workspaceListToText(draft?.taskSignals)} onChange={(e) => updateDraft({ taskSignals: workspaceTextToList(e.target.value) })} rows={3} style={{ width: '100%', border: '1px solid var(--s-border)', borderRadius: 10, padding: '9px 10px', fontSize: 13, resize: 'vertical' }} />
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ border: '1px solid var(--s-border)', borderRadius: 16, padding: 16, background: 'white' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--s-text-strong)', marginBottom: 10 }}>מקורות וציטוטים</div>
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ fontSize: 11, color: 'var(--s-muted)' }}>מדיניות מקורות
                <select value={draft?.sourcePolicy?.mode || 'context-aware'} onChange={(e) => updateNestedDraft('sourcePolicy', { mode: e.target.value })} style={{ display: 'block', marginTop: 4, width: '100%', border: '1px solid var(--s-border)', borderRadius: 10, padding: '9px 10px', fontSize: 13, background: 'white' }}>
                  <option value="context-aware">לפי הקשר</option>
                  <option value="required">חובה כשאפשר</option>
                  <option value="optional">אופציונלי</option>
                </select>
              </label>
              <label style={{ fontSize: 11, color: 'var(--s-muted)' }}>סגנון ציטוט
                <input value={draft?.sourcePolicy?.citationStyle || ''} onChange={(e) => updateNestedDraft('sourcePolicy', { citationStyle: e.target.value })} style={{ display: 'block', marginTop: 4, width: '100%', border: '1px solid var(--s-border)', borderRadius: 10, padding: '9px 10px', fontSize: 13 }} />
              </label>
              <label style={{ fontSize: 11, color: 'var(--s-muted)' }}>מתי חייבים מקורות, שורה לכל תנאי
                <textarea value={workspaceListToText(draft?.sourcePolicy?.requireSourcesWhen)} onChange={(e) => updateNestedDraft('sourcePolicy', { requireSourcesWhen: workspaceTextToList(e.target.value) })} rows={4} style={{ display: 'block', marginTop: 4, width: '100%', border: '1px solid var(--s-border)', borderRadius: 10, padding: '9px 10px', fontSize: 13, resize: 'vertical' }} />
              </label>
            </div>
          </div>

          <div style={{ border: '1px solid var(--s-border)', borderRadius: 16, padding: 16, background: 'white' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--s-text-strong)', marginBottom: 10 }}>סגנון אישי ובטיחות</div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--s-text)', marginBottom: 8 }}>
              <input type="checkbox" checked={draft?.stylePolicy?.preservePersonalStyle !== false} onChange={(e) => updateNestedDraft('stylePolicy', { preservePersonalStyle: e.target.checked })} />
              לשמור על הסגנון האישי כברירת חובה
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--s-text)', marginBottom: 10 }}>
              <input type="checkbox" checked={draft?.stylePolicy?.allowPersuasiveReframing === true} onChange={(e) => updateNestedDraft('stylePolicy', { allowPersuasiveReframing: e.target.checked })} />
              לאפשר ניסוח שכנועי אגרסיבי יותר כשזה מתאים
            </label>
            <label style={{ fontSize: 11, color: 'var(--s-muted)' }}>ממה להימנע, שורה לכל כלל
              <textarea value={workspaceListToText(draft?.stylePolicy?.avoid)} onChange={(e) => updateNestedDraft('stylePolicy', { avoid: workspaceTextToList(e.target.value) })} rows={5} style={{ display: 'block', marginTop: 4, width: '100%', border: '1px solid var(--s-border)', borderRadius: 10, padding: '9px 10px', fontSize: 13, resize: 'vertical' }} />
            </label>
          </div>
        </div>

        <div style={{ border: '1px solid var(--s-border)', borderRadius: 16, padding: 16, background: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--s-text-strong)' }}>תפקידי הצוות</div>
              <div style={{ fontSize: 12, color: 'var(--s-muted)', marginTop: 3 }}>כל כרטיס הוא “סוכן” בתוך הפרומפט: תפקיד, יעד, הוראות ותוצר צפוי.</div>
            </div>
            <button type="button" onClick={addStep} style={{ border: '1px solid #2563EB', background: '#EFF6FF', color: '#1D4ED8', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>הוסף תפקיד</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(draft?.pipeline || []).map((step, index) => (
              <div key={step.id || index} style={{ border: '1px solid var(--s-border)', borderRadius: 14, padding: 14, background: 'var(--s-surface-2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 13, color: 'var(--s-text-strong)' }}>שלב {index + 1}</strong>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => moveStep(index, -1)} disabled={index === 0} style={{ border: '1px solid var(--s-border)', background: 'white', color: 'var(--s-text)', borderRadius: 8, padding: '6px 9px', fontSize: 11, cursor: index === 0 ? 'not-allowed' : 'pointer', opacity: index === 0 ? 0.5 : 1 }}>למעלה</button>
                    <button type="button" onClick={() => moveStep(index, 1)} disabled={index === (draft?.pipeline || []).length - 1} style={{ border: '1px solid var(--s-border)', background: 'white', color: 'var(--s-text)', borderRadius: 8, padding: '6px 9px', fontSize: 11, cursor: index === (draft?.pipeline || []).length - 1 ? 'not-allowed' : 'pointer', opacity: index === (draft?.pipeline || []).length - 1 ? 0.5 : 1 }}>למטה</button>
                    <button type="button" onClick={() => removeStep(index)} style={{ border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#991B1B', borderRadius: 8, padding: '6px 9px', fontSize: 11, cursor: 'pointer' }}>הסר</button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <label style={{ fontSize: 11, color: 'var(--s-muted)' }}>ספק לשלב הזה
                    <select
                      value={step.providerId || ''}
                      onChange={(e) => updateStep(index, { providerId: e.target.value, model: '' })}
                      style={{ display: 'block', marginTop: 4, width: '100%', border: '1px solid var(--s-border)', borderRadius: 10, padding: '9px 10px', fontSize: 13, background: 'white' }}
                    >
                      <option value="">יורש מהסביבה / מסך הבית</option>
                      {providerChoices.map((provider) => <option key={provider.id} value={provider.id}>{provider.label || provider.id}</option>)}
                    </select>
                  </label>
                  <label style={{ fontSize: 11, color: 'var(--s-muted)' }}>מודל לשלב הזה
                    <select
                      value={step.model || ''}
                      disabled={!step.providerId}
                      onChange={(e) => updateStep(index, { model: e.target.value })}
                      style={{ display: 'block', marginTop: 4, width: '100%', border: '1px solid var(--s-border)', borderRadius: 10, padding: '9px 10px', fontSize: 13, background: step.providerId ? 'white' : 'var(--s-surface-2)' }}
                    >
                      <option value="">ברירת המחדל של הספק/הסביבה</option>
                      {getProviderModelChoices(step.providerId || '', config, [step.model].filter(Boolean)).map((modelName) => (
                        <option key={modelName} value={modelName}>{modelName}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ fontSize: 11, color: 'var(--s-muted)' }}>תפקיד
                    <input value={step.role || ''} onChange={(e) => updateStep(index, { role: e.target.value })} style={{ display: 'block', marginTop: 4, width: '100%', border: '1px solid var(--s-border)', borderRadius: 10, padding: '9px 10px', fontSize: 13 }} />
                  </label>
                  <label style={{ fontSize: 11, color: 'var(--s-muted)' }}>תוצר צפוי
                    <input value={step.output || ''} onChange={(e) => updateStep(index, { output: e.target.value })} style={{ display: 'block', marginTop: 4, width: '100%', border: '1px solid var(--s-border)', borderRadius: 10, padding: '9px 10px', fontSize: 13 }} />
                  </label>
                  <label style={{ fontSize: 11, color: 'var(--s-muted)', gridColumn: '1 / -1' }}>מטרה
                    <textarea value={step.goal || ''} onChange={(e) => updateStep(index, { goal: e.target.value })} rows={2} style={{ display: 'block', marginTop: 4, width: '100%', border: '1px solid var(--s-border)', borderRadius: 10, padding: '9px 10px', fontSize: 13, resize: 'vertical' }} />
                  </label>
                  <label style={{ fontSize: 11, color: 'var(--s-muted)', gridColumn: '1 / -1' }}>הוראות לתפקיד, שורה לכל הוראה
                    <textarea value={workspaceListToText(step.instructions)} onChange={(e) => updateStep(index, { instructions: workspaceTextToList(e.target.value) })} rows={4} style={{ display: 'block', marginTop: 4, width: '100%', border: '1px solid var(--s-border)', borderRadius: 10, padding: '9px 10px', fontSize: 13, resize: 'vertical' }} />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function InstallAppSettingsCard() {
  const readInstallState = () => {
    if (typeof window === 'undefined') {
      return {
        supported: false,
        installed: false,
        canInstall: false,
        statusLabel: '',
        instructions: '',
        install: async () => ({ ok: false, reason: 'unavailable' }),
      };
    }
    return window.__wordflowPwaInstall || {
      supported: !window.desktopApp,
      installed: false,
      canInstall: false,
      statusLabel: window.desktopApp ? 'בתוך אפליקציית הדסקטופ אין צורך בהתקנה נוספת' : 'אפשר להתקין מהדפדפן',
      instructions: window.desktopApp ? 'כדי להתקין בטלפון, פתח את האתר בדפדפן במובייל.' : '',
      install: async () => ({ ok: false, reason: 'not-ready' }),
    };
  };

  const [installState, setInstallState] = useState(readInstallState);
  const [installFeedback, setInstallFeedback] = useState('');

  useEffect(() => {
    const handleStateUpdate = (event) => {
      if (event?.detail) {
        setInstallState(event.detail);
      } else {
        setInstallState(readInstallState());
      }
    };

    window.addEventListener('wordflow:pwa-install-state', handleStateUpdate);
    handleStateUpdate();
    return () => window.removeEventListener('wordflow:pwa-install-state', handleStateUpdate);
  }, []);

  const handleInstallClick = async () => {
    const installHandler = installState?.install;
    if (typeof installHandler !== 'function') return;
    const result = await installHandler();
    if (result?.reason === 'accepted') {
      setInstallFeedback('נשלחה בקשת התקנה. אחרי האישור, האפליקציה תופיע על מסך הבית.');
      return;
    }
    if (result?.reason === 'dismissed') {
      setInstallFeedback('חלון ההתקנה נסגר. אפשר לנסות שוב מתי שתרצה.');
      return;
    }
    if (result?.reason === 'already-installed') {
      setInstallFeedback('האפליקציה כבר מותקנת על המכשיר הזה.');
      return;
    }
    if (result?.reason === 'not-available') {
      setInstallFeedback('בדפדפן הזה אין כרגע חלון התקנה אוטומטי, אבל אפשר להשתמש בהוראות הידניות למטה.');
    }
  };

  const installButtonDisabled = !installState?.canInstall || installState?.installed || !installState?.supported;

  return (
    <div style={{ border: '1px solid #D1FAE5', borderRadius: 20, padding: '16px', background: 'linear-gradient(135deg, #ECFDF5 0%, var(--s-surface-2) 100%)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#047857', marginBottom: 6, letterSpacing: '0.08em' }}>INSTALL ON PHONE</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--s-text-strong)', marginBottom: 6 }}>התקנת האתר כאפליקציה בטלפון</div>
          <div style={{ fontSize: 12, color: 'var(--s-muted)', lineHeight: 1.75, maxWidth: 760 }}>
            אחרי ההתקנה האתר נפתח מהמסך הראשי כמו אפליקציה, עם מסך מלא וגישה מהירה יותר.
          </div>
        </div>
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          borderRadius: 999,
          padding: '6px 10px',
          background: installState?.installed ? '#DCFCE7' : installState?.canInstall ? '#DBEAFE' : 'var(--s-border)',
          color: installState?.installed ? '#166534' : installState?.canInstall ? '#1D4ED8' : 'var(--s-muted)',
        }}>
          {installState?.statusLabel || 'בודק זמינות התקנה'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 12 }}>
        <div style={{ border: '1px solid #D1FAE5', borderRadius: 14, background: 'white', padding: '11px 12px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 5 }}>מה מקבלים</div>
          <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.7 }}>אייקון על מסך הבית, פתיחה מהירה, תחושה של אפליקציה מלאה ושימוש נוח יותר במובייל.</div>
        </div>
        <div style={{ border: '1px solid #D1FAE5', borderRadius: 14, background: 'white', padding: '11px 12px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 5 }}>אם אין כפתור התקנה</div>
          <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.7 }}>{installState?.instructions || 'בדרך כלל אפשר לפתוח את תפריט הדפדפן ולבחור Add to Home Screen.'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          onClick={handleInstallClick}
          disabled={installButtonDisabled}
          style={{
            border: installButtonDisabled ? '1px solid var(--s-border)' : '1px solid #0EA5E9',
            background: installButtonDisabled ? 'var(--s-surface-2)' : '#0EA5E9',
            color: installButtonDisabled ? 'var(--s-muted)' : 'white',
            borderRadius: 12,
            padding: '10px 14px',
            fontSize: 12,
            fontWeight: 700,
            cursor: installButtonDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          {installState?.installed ? 'כבר מותקן' : installState?.canInstall ? 'התקן עכשיו' : 'התקנה ידנית מהדפדפן'}
        </button>
        {installFeedback ? (
          <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.7 }}>{installFeedback}</div>
        ) : null}
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
      description: 'מסך הבית הוא נקודת הכניסה: בוחרים נושא, תבנית, טיוטת בסיס, חומרי עזר והנחיות, ואז מריצים בקשה ישירה מול המודל שבחרת.',
      bullets: [
        'שדה הנושא העליון הוא brief קצר בלבד, וההנחיות למטה הן המקור המחייב.',
        'אפשר לבחור טיוטת בסיס כדי לעדכן מסמך קיים במקום להתחיל מאפס.',
        'אפשר להוסיף חומרי עזר וקובץ הנחיות עוד לפני שמריצים את היצירה.',
        'חומרים שסימנת נשלחים עם הבקשה — סמן רק מה שרלוונטי למסמך הזה.',
        'מצב סגור מכבה כל חיפוש חיצוני — כותבים רק מהבקשה ומהחומרים.',
      ],
      actions: [],
    },
    {
      id: 'direct',
      eyebrow: 'שלב 2 · מסלול ישיר',
      title: 'מסלול ישיר = ספק ומודל ברורים',
      description: 'הבקשה נשלחת ישירות לספק והמודל שבחרת במסך הבית, בלי שכבת תיאום נוספת.',
      bullets: [
        'המסלול הזה טוב לטיוטות מהירות, ניסוחים נקודתיים ועבודה חופשית.',
        'הבורר של ספק AI ומודל במסך הבית שולט בדיוק על המסלול הזה.',
        'אם המטרה שלך פשוטה או דחופה, לרוב זה המסלול המהיר ביותר.',
      ],
      actions: [
        { label: 'פתח מנועי AI', tab: 'ai' },
      ],
    },
    {
      id: 'chat',
      eyebrow: 'שלב 3 · חלונית AI',
      title: 'מפה ממשיכים בשיחה רציפה',
      description: 'חלונית ה-AI מיועדת לעבודה שוטפת על המסמך: שכתוב, קיצור, הרחבה, בדיקות, ורצף איטרציות עד שהתוצאה יושבת נכון.',
      bullets: [
        'כותבים בקשה חופשית כשלא צריך שליטה מיוחדת.',
        'משתמשים ב-/ כדי להפעיל skill ממוקד כמו academic-structure או source-hunter.',
      ],
      actions: [
        { label: 'פתח הגדרות עוזר', tab: 'assistant' },
      ],
    },
    {
      id: 'skills',
      eyebrow: 'שלב 4 · שליטה מדויקת',
      title: 'סקילים ו-prompts',
      description: 'אם אתה רוצה לקבע צורת עבודה מסוימת, זה האזור שבו מגדירים יכולות ממוקדות והנחיות רוחביות.',
      bullets: [
        'טאב הסקילים מתאים ליכולות ממוקדות כמו מחקר, שלד אקדמי, או הגשה סופית.',
        'טאב Prompt מתאים להנחיות רוחביות שחוזרות כמעט בכל הרצה.',
      ],
      actions: [
        { label: 'פתח סקילים', tab: 'skills' },
        { label: 'פתח Prompt', tab: 'prompt' },
      ],
    },
    {
      id: 'style',
      eyebrow: 'שלב 5 · התאמה אישית',
      title: 'מלמדים את המערכת איך אתה כותב',
      description: 'המערכת יכולה ללמוד העדפות כתיבה, טון, דוגמאות זהב, חומרי לימוד וסגנון אישי, כדי שלא תצטרך לחזור על אותן הנחיות בכל פעם.',
      bullets: [
        'טאב פרופיל והגשה מרכז את ה-onboarding, רקע, תפקידי שימוש והשלמת הגשה.',
        'טאב סגנון אישי מיועד להעדפות כתיבה, דוגמאות, ביטויים ולמידה מחומרים.',
        'כשאתה מצרף חומרים אישיים, עדיף להסביר בקצרה למה הם משמשים: סגנון, תוכן, או מבנה.',
        'מנוע הסגנון לומד מהעבודות שלך (או מניתוח חיצוני שהדבקת) יעדי מבנה ואוצר מילים — ושומר מדידות בלבד, לא את הטקסטים.',
        'גלאי ה-AI המקומי נותן ציון וסימנים, מסמן את המשפטים החשודים בעורך, ומתכייל לפי תיוגי "זה אני" / "זה AI".',
      ],
      actions: [
        { label: 'פתח פרופיל והגשה', tab: 'onboarding' },
        { label: 'פתח סגנון אישי', tab: 'personal' },
      ],
    },
    {
      id: 'finish',
      eyebrow: 'שלב 6 · לפני מסירה',
      title: 'ליטוש, עיצוב וייצוא',
      description: 'בסוף התהליך עוברים על כתיבה, גופנים, מראה, ליטוש והגשה, ואז מייצאים ל-DOCX או ממשיכים לעוד איטרציה אחת קצרה.',
      bullets: [
        'טאב כתיבה מרכז ברירות מחדל כמו גופנים, גדלים והעדפות מסמך.',
        'טאב מראה מתאים להתאמות ויזואליות של הממשק.',
        'אם הטיוטה כבר כתובה, אפשר להמשיך בסבבי שיחה קצרים עד שהיא מוכנה למסירה.',
        'הערות שוליים, תוכן עניינים ועמוד שער נשמרים בייצוא ל-DOCX.',
      ],
      actions: [
        { label: 'פתח כתיבה', tab: 'writing' },
        { label: 'פתח מראה', tab: 'appearance' },
      ],
    },
  ];
  const quickRoutes = [
    { title: 'חיבור ספק AI', text: 'להגדיר API key, לבחור מודל ולבדוק חיבור לפני שמתחילים.', tab: 'ai' },
    { title: 'התאמת סגנון אישי', text: 'ללמד את המערכת העדפות כתיבה, טון ודוגמאות זהב.', tab: 'personal' },
    { title: 'אוןבורדינג והגשה', text: 'להשלים פרופיל, רקע אקדמי ומסלול הגשה מסודר.', tab: 'onboarding' },
    { title: 'ברירות מחדל למסמך', text: 'גופנים, גדלים, בדיקות ושמירה אוטומטית לכל מסמך חדש.', tab: 'writing' },
    { title: 'אבטחה וסנכרון', text: 'הצפנת המפתחות בענן וההגדרות שמסתנכרנות בין מכשירים.', tab: 'security' },
  ];
  const demoPrompts = [
    { title: 'שכתוב מהיר', text: 'שכתב את הפסקה הזאת בצורה טבעית וברורה יותר' },
    { title: 'הפעלת סקיל', text: '/academic-structure בנה לי שלד לעבודה על מנהיגות דיגיטלית' },
    { title: 'מקורות מחקר', text: '/source-hunter תן לי מילות חיפוש ל-Google Scholar על חרדת מבחנים' },
  ];
  const activeStep = guidedTourSteps[activeStepIndex] || guidedTourSteps[0];

  const resetSavedMemory = async () => {
    if (!(await showConfirm('לאפס את כל הזיכרון השמור (שיחות אחרונות, תזכורות והעדפות)?\nפעולה זו לא ניתנת לביטול.', { title: 'איפוס זיכרון שמור', confirmLabel: 'אפס', tone: 'danger' }))) return;
    clearAppMemory();
    try {
      clearSidebarChatHistory({ clearAll: true });
    } catch {}
    setMemorySnapshot(getAppMemory());
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ border: '1px solid #C7D2FE', borderRadius: 20, padding: '18px 18px 16px', background: 'linear-gradient(135deg, #EEF2FF 0%, var(--s-surface-2) 45%, #ECFEFF 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#4338CA', marginBottom: 6, letterSpacing: '0.08em' }}>GUIDED TOUR</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--s-text-strong)', marginBottom: 6 }}>סיור מודרך ב-WordFlow AI</div>
            <div style={{ fontSize: 12, color: 'var(--s-muted)', lineHeight: 1.8, maxWidth: 760 }}>
              במקום מדריך סטטי, הטאב הזה מוביל אותך שלב-שלב דרך המסך הראשי, הסביבות, הספקים, הסקילים וההגדרות. אפשר להתקדם בסדר, או לקפוץ ישר לאזור הרלוונטי.
            </div>
          </div>
          <div style={{ minWidth: 180, padding: '12px 14px', borderRadius: 16, background: 'rgba(255,255,255,0.8)', border: '1px solid #DBEAFE' }}>
            <div style={{ fontSize: 11, color: '#6366F1', fontWeight: 700, marginBottom: 6 }}>התקדמות בסיור</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#1E293B' }}>{activeStepIndex + 1}<span style={{ fontSize: 15, color: 'var(--s-muted)' }}> / {guidedTourSteps.length}</span></div>
            <div style={{ marginTop: 10, height: 8, borderRadius: 999, background: 'var(--s-border)', overflow: 'hidden' }}>
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
                  border: selected ? '1px solid #4F46E5' : '1px solid var(--s-border)',
                  background: selected ? '#EEF2FF' : 'rgba(255,255,255,0.75)',
                  color: selected ? '#312E81' : 'var(--s-text)',
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

      <div style={{ border: '1px solid var(--s-border)', borderRadius: 20, padding: '16px', background: 'white' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#0284C7', marginBottom: 6, letterSpacing: '0.08em' }}>מתחילים כאן</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--s-text-strong)', marginBottom: 8 }}>מילון מושגים למתחילים</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 12 }}>
          <div style={{ border: '1px solid var(--s-border)', borderRadius: 14, background: 'var(--s-surface-2)', padding: '11px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 5 }}>מה זה API key?</div>
            <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.7 }}>API key הוא מפתח גישה אישי לספק ה-AI שלך. האפליקציה משתמשת בו כדי להתחבר לחשבון שלך ולהפעיל מודלים.</div>
          </div>
          <div style={{ border: '1px solid var(--s-border)', borderRadius: 14, background: 'var(--s-surface-2)', padding: '11px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 5 }}>מה זה Provider?</div>
            <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.7 }}>Provider הוא ספק השירות שמריץ את מודל ה-AI בפועל, כמו Gemini או OpenAI. אפשר לבחור ספק אחר לפי מהירות, מחיר וסוג המשימה.</div>
          </div>
        </div>
        <div style={{ border: '1px solid #DBEAFE', borderRadius: 14, background: '#EFF6FF', padding: '10px 12px', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1E3A8A', marginBottom: 4 }}>איך עובדים נכון במסלול הישיר?</div>
          <div style={{ fontSize: 11, color: '#1E40AF', lineHeight: 1.7 }}>כותבים הנחיה ברורה, מצרפים חומרי עזר כשצריך, ובוחרים ספק ומודל שמתאימים למשימה.</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[
            { label: 'הגדרת AI וספקים', tab: 'ai' },
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

      <DesktopDownloadCard />

      <InstallAppSettingsCard />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        <div style={{ border: '1px solid var(--s-border)', borderRadius: 20, padding: '18px', background: 'white' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#0284C7', marginBottom: 6, letterSpacing: '0.08em' }}>{activeStep.eyebrow}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--s-text-strong)', marginBottom: 8 }}>{activeStep.title}</div>
          <div style={{ fontSize: 12, color: 'var(--s-muted)', lineHeight: 1.8, marginBottom: 14 }}>{activeStep.description}</div>
          <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
            {activeStep.bullets.map((item) => (
              <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, borderRadius: 12, background: 'var(--s-surface-2)', border: '1px solid var(--s-border)', padding: '10px 12px' }}>
                <span style={{ color: '#4F46E5', fontWeight: 900, lineHeight: 1.5 }}>•</span>
                <span style={{ fontSize: 12, color: 'var(--s-text)', lineHeight: 1.75 }}>{item}</span>
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
              style={{ border: '1px solid var(--s-border)', background: activeStepIndex === 0 ? 'var(--s-surface-2)' : 'white', color: activeStepIndex === 0 ? 'var(--s-muted)' : 'var(--s-text)', borderRadius: 12, padding: '9px 12px', fontSize: 11, fontWeight: 700, cursor: activeStepIndex === 0 ? 'not-allowed' : 'pointer' }}
            >
              השלב הקודם
            </button>
            <button
              type="button"
              onClick={() => setActiveStepIndex((prev) => Math.min(guidedTourSteps.length - 1, prev + 1))}
              disabled={activeStepIndex === guidedTourSteps.length - 1}
              style={{ border: '1px solid #0EA5E9', background: activeStepIndex === guidedTourSteps.length - 1 ? 'var(--s-border)' : '#0EA5E9', color: activeStepIndex === guidedTourSteps.length - 1 ? 'var(--s-muted)' : 'white', borderRadius: 12, padding: '9px 12px', fontSize: 11, fontWeight: 700, cursor: activeStepIndex === guidedTourSteps.length - 1 ? 'not-allowed' : 'pointer' }}
            >
              השלב הבא
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ border: '1px solid var(--s-border)', borderRadius: 20, padding: '16px', background: 'white' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--s-text-strong)', marginBottom: 10 }}>קפיצה מהירה להגדרות</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {quickRoutes.map((route) => (
                <button
                  key={route.tab}
                  type="button"
                  onClick={() => onNavigate(route.tab)}
                  style={{ textAlign: 'right', border: '1px solid var(--s-border)', background: route.tab === activeTab ? '#EEF2FF' : 'var(--s-surface-2)', borderRadius: 14, padding: '11px 12px', cursor: 'pointer' }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 4 }}>{route.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6 }}>{route.text}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ border: '1px solid var(--s-border)', borderRadius: 20, padding: '16px', background: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--s-text-strong)' }}>זיכרון מתמשך</div>
              <button onClick={resetSavedMemory} style={{ border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', borderRadius: 10, padding: '7px 10px', fontSize: 11, cursor: 'pointer' }}>
                אפס זיכרון שמור
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.7, marginBottom: 10 }}>
              האפליקציה זוכרת מקומית שיחות אחרונות, סקילים והעדפות, כדי להמשיך מאותה נקודה במקום להתחיל מחדש בכל פתיחה.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 10, background: '#EEF2FF', color: '#3730A3', padding: '4px 8px', borderRadius: 999 }}>שיחות שמורות: {(memorySnapshot.recentChats || []).length}</span>
              <span style={{ fontSize: 10, background: '#ECFDF5', color: '#166534', padding: '4px 8px', borderRadius: 999 }}>תזכורות פעילות: {(memorySnapshot.memoryNotes || []).length}</span>
              <span style={{ fontSize: 10, background: 'var(--s-surface-2)', color: 'var(--s-text)', padding: '4px 8px', borderRadius: 999 }}>סקיל אחרון: {memorySnapshot.lastSelectedSkillId || 'ללא'}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ border: '1px solid var(--s-border)', borderRadius: 20, padding: '16px', background: 'white' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--s-text-strong)', marginBottom: 10 }}>הדגמות מוכנות להעתקה לחלונית ה-AI</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
          {demoPrompts.map((item) => (
            <div key={item.title} style={{ border: '1px solid var(--s-border)', borderRadius: 14, padding: '12px', background: 'var(--s-surface-2)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 11, color: '#1E293B', lineHeight: 1.7, fontFamily: 'Consolas, monospace', background: 'white', border: '1px dashed var(--s-border)', borderRadius: 10, padding: '9px 10px' }}>
                {item.text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OnboardingTabContainer({ profile, setProfile, persistProfile = null, setProviderConfig = () => {}, onOpenAiSettings = () => {}, onOpenPersonalStyle = () => {}, onOpenSecuritySettings = () => {}, onDismiss = () => {}, onSubmitExternalAnalysis = () => {}, externalAnalysisBusy = false, providerConfig = getProviderConfig() }) {
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

    if (!['gemini', 'openai', 'claude', 'groq', 'perplexity', 'scholar'].includes(resolvedQuickSetupProviderId)) return;
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

  const resetLearningGame = async () => {
    if (!(await showConfirm('האם אתה בטוח שברצונך לאפס את הלמידה?', { title: 'איפוס למידה', confirmLabel: 'אפס', tone: 'danger' }))) return;
    setProfile((prev) => ({
      ...prev,
      learningGameAnswers: {},
      learningGameInsights: [],
      learningGamesCompletedAt: '',
      styleTrainingSummary: '',
      preferredTrainingExamples: [],
      dislikedStylePatterns: [],
    }));
  };


  const formatSyllabusImportError = (error) => {
    const code = String(error?.message || '').trim();
    if (code === 'unsupported-binary-file') return 'סוג הקובץ לא נתמך. אפשר להעלות docx, pdf, txt, md, html, מצגות (pptx), Excel‏ (xls/xlsx) ותמונות עם OCR. פורמטים ישנים כמו .doc/.ppt או קבצי ארכיון (zip/rar) לא נתמכים — המר אותם קודם.';
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
      onQuickProviderKeyChange={updateQuickProviderKey}
      STYLE_TRAINING_QUESTIONS={STYLE_TRAINING_QUESTIONS}
      STYLE_PRESET_OPTIONS={STYLE_PRESET_OPTIONS}
      trainingAnswers={trainingAnswers}
      selectLearningOption={selectLearningOption}
      toggleStyle={toggleStyle}
      resetLearningGame={resetLearningGame}
      onOpenAiSettings={onOpenAiSettings}
      onOpenPersonalStyle={onOpenPersonalStyle}
      onOpenSecuritySettings={onOpenSecuritySettings}
      syllabusImport={syllabusImport}
      onImportSyllabusFile={handleSyllabusImport}
      onComplete={markOnboardingComplete}
      onDismiss={onDismiss}
      providerConfig={providerConfig}
      setProviderConfig={setProviderConfig}
    />
  );
}

const COVER_EDITOR_FONTS = ['Alef', 'Heebo', 'Assistant', 'Frank Ruhl Libre', 'Miriam Libre', 'David', 'Times New Roman', 'Arial'];
const COVER_EDITOR_SIZES = ['12', '14', '16', '18', '20', '24', '28', '36', '48'];
const COVER_STARTER_HTML = `<p style="text-align:center">{{institution}}</p><h1 style="text-align:center">{{title}}</h1><h3 style="text-align:center">{{subtitle}}</h3><p></p><p></p><p style="text-align:center">בקורס: {{course}}</p><p style="text-align:center">מרצה: {{lecturer}}</p><p></p><p style="text-align:center">מגיש/ה: {{studentName}} · ת.ז. {{studentId}}</p><p style="text-align:center">{{date}}</p>`;

// עורך WYSIWYG קומפקטי לעיצוב תבנית עמוד השער האישית ישירות מההגדרות (מסלול "מיני-עורך").
function CoverTemplateSettings({ profile, setProfile }) {
  const initialInner = useMemo(() => {
    const raw = String(profile.coverTemplateHtml || '').trim();
    if (!raw) return COVER_STARTER_HTML;
    return raw
      .replace(/^<div[^>]*data-cover-page="true"[^>]*>/i, '')
      .replace(/<\/div>\s*$/i, '')
      .trim() || COVER_STARTER_HTML;
  // מאותחל פעם אחת בלבד כדי לא לקטוע את הקלדת המשתמש
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [savedAt, setSavedAt] = useState(String(profile.coverTemplateSavedAt || ''));
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle, FontFamily, FontSize, LineHeight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: initialInner,
    editorProps: { attributes: { dir: 'rtl', style: 'min-height:200px;padding:14px;outline:none;' } },
  });

  const apply = (fn) => { if (editor) fn(editor.chain().focus()).run(); };
  const insertField = (token) => { if (editor) editor.chain().focus().insertContent(token).run(); };

  const handleSave = () => {
    if (!editor) return;
    const inner = editor.getHTML();
    const plain = inner.replace(/<[^>]+>/g, '').replace(/ /g, ' ').trim();
    if (!plain) { showToast('התבנית ריקה — כתוב תוכן לפני שמירה.', { tone: 'warning' }); return; }
    const html = `<div data-cover-page="true">${inner}</div>`;
    const at = new Date().toISOString();
    setProfile((prev) => ({ ...prev, coverTemplateHtml: html, coverTemplateSavedAt: at }));
    setSavedAt(at);
    showToast('תבנית עמוד השער נשמרה. הוסף אותה בכל מסמך דרך "עמוד שער ← עמוד השער שלי".', { tone: 'success', duration: 6000 });
  };

  const handleClear = async () => {
    if (!(await showConfirm('למחוק את תבנית עמוד השער השמורה?', { title: 'מחיקת תבנית', confirmLabel: 'מחק', tone: 'danger' }))) return;
    setProfile((prev) => ({ ...prev, coverTemplateHtml: '', coverTemplateSavedAt: '' }));
    setSavedAt('');
    editor?.commands.setContent(COVER_STARTER_HTML);
    showToast('התבנית נמחקה.', { tone: 'info' });
  };

  const previewHtml = useMemo(
    () => fillCoverTemplateTokens(String(profile.coverTemplateHtml || ''), profile),
    [profile.coverTemplateHtml, profile.currentCourses, profile.lecturerNames, profile.lecturerName, profile.displayName, profile.studentId, profile.institutionName, profile.assignmentType, profile.submissionDate]
  );

  const btn = (active) => ({ padding: '5px 9px', borderRadius: 6, border: `1px solid ${active ? '#1D4ED8' : '#C8C6C4'}`, background: active ? '#DBEAFE' : 'white', color: active ? '#1D4ED8' : '#323130', cursor: 'pointer', fontSize: 12 });

  return (
    <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 4 }}>עמוד שער אישי 📄</div>
      <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 10, lineHeight: 1.6 }}>
        עצב כאן את עמוד השער המועדף — פונט, גודל, יישור ומיקום שורות נשמרים במדויק. שדות דינמיים (קורס, מרצה, שם) יתמלאו אוטומטית בהוספה אם ידועים, אחרת יישארו ריקים. אפשר גם לעצב עמוד בעורך עצמו וללחוץ שם "שמור עמוד נוכחי כתבנית".
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        <select onChange={(e) => { apply((c) => c.setFontFamily(e.target.value)); }} defaultValue="" style={{ ...btn(false), padding: '5px 8px' }}>
          <option value="" disabled>פונט</option>
          {COVER_EDITOR_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
        </select>
        <select onChange={(e) => { apply((c) => c.setFontSize(`${e.target.value}pt`)); }} defaultValue="" style={{ ...btn(false), padding: '5px 8px' }}>
          <option value="" disabled>גודל</option>
          {COVER_EDITOR_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="button" style={btn(editor?.isActive('bold'))} onClick={() => apply((c) => c.toggleBold())}><b>B</b></button>
        <button type="button" style={btn(editor?.isActive('underline'))} onClick={() => apply((c) => c.toggleUnderline())}><u>U</u></button>
        <button type="button" style={btn(editor?.isActive({ textAlign: 'right' }))} onClick={() => apply((c) => c.setTextAlign('right'))}>ימין</button>
        <button type="button" style={btn(editor?.isActive({ textAlign: 'center' }))} onClick={() => apply((c) => c.setTextAlign('center'))}>מרכז</button>
        <button type="button" style={btn(editor?.isActive({ textAlign: 'left' }))} onClick={() => apply((c) => c.setTextAlign('left'))}>שמאל</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--s-muted)' }}>הוסף שדה:</span>
        {COVER_TEMPLATE_FIELDS.map((f) => (
          <button key={f.key} type="button" title={f.token} onClick={() => insertField(f.token)}
            style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 999, border: '1px solid #E2E8F0', background: '#F8FAFC', cursor: 'pointer' }}>{f.label}</button>
        ))}
      </div>
      <div style={{ border: '1px solid #C8C6C4', borderRadius: 8, background: '#fff' }}>
        <EditorContent editor={editor} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
        <button type="button" onClick={handleSave} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#1D4ED8', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>שמור תבנית</button>
        {savedAt ? <button type="button" onClick={handleClear} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #FCA5A5', background: 'white', color: '#B91C1C', cursor: 'pointer', fontSize: 12 }}>מחק תבנית</button> : null}
        {savedAt ? <span style={{ fontSize: 10, color: '#059669' }}>✓ נשמרה</span> : <span style={{ fontSize: 10, color: 'var(--s-muted)' }}>לא נשמרה עדיין</span>}
      </div>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10, cursor: String(profile.coverTemplateHtml || '').trim() ? 'pointer' : 'not-allowed', opacity: String(profile.coverTemplateHtml || '').trim() ? 1 : 0.5 }}>
        <input
          type="checkbox"
          checked={Boolean(profile.coverTemplateAutoInsert)}
          disabled={!String(profile.coverTemplateHtml || '').trim()}
          onChange={(e) => setProfile((prev) => ({ ...prev, coverTemplateAutoInsert: e.target.checked }))}
          style={{ marginTop: 2 }}
        />
        <span style={{ fontSize: 12, color: 'var(--s-text-strong)', lineHeight: 1.6 }}>
          הוסף את עמוד השער הזה אוטומטית לכל מסמך חדש
          <span style={{ display: 'block', fontSize: 10.5, color: 'var(--s-muted)' }}>חל על מסמך ריק, תבנית ומסמך שנוצר ב-AI. השדות הידועים (קורס, מרצה, סוג מטלה, תאריך, כותרת) יתמלאו לבד.</span>
        </span>
      </label>
      {String(profile.coverTemplateHtml || '').trim() ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 6 }}>תצוגה מקדימה (עם הערכים הידועים כרגע):</div>
          <div style={{ border: '1px dashed #CBD5E1', borderRadius: 8, padding: 14, background: '#FCFCFD', direction: 'rtl' }}
            dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
      ) : null}
    </div>
  );
}

// --- עזרי פריסה לטאב "סגנון אישי" ---
// הטאב מאחד ארבעה נושאים נפרדים (זהות / חוקי כתיבה ידניים / מנוע הסגנון / תבניות וחומרים).
// בלי היררכיה זה היה גליל אחד ארוך; SettingsSection נותן כותרת, תיאור וקיפול לכל נושא.
function SettingsSection({ title, desc = '', badge = null, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section style={{ border: '1px solid var(--s-border)', borderRadius: 14, background: 'white', marginBottom: 12, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: open ? 'var(--s-surface-2)' : 'white', border: 'none', borderBottom: open ? '1px solid var(--s-border)' : 'none', cursor: 'pointer', textAlign: 'right' }}
      >
        <span style={{ fontSize: 11, color: 'var(--s-muted)', transform: open ? 'rotate(90deg)' : 'rotate(180deg)', transition: 'transform .15s' }}>▶</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: 'var(--s-text-strong)' }}>{title}</span>
          {desc ? <span style={{ display: 'block', fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6, marginTop: 2 }}>{desc}</span> : null}
        </span>
        {badge ? <span style={{ fontSize: 10, fontWeight: 700, background: '#EEF2FF', color: '#4338CA', padding: '4px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>{badge}</span> : null}
      </button>
      {open ? <div style={{ padding: 14 }}>{children}</div> : null}
    </section>
  );
}

// שדה עם תווית אמיתית. רוב השדות בטאב הזה היו textarea "עירומים" עם placeholder בלבד —
// ברגע שיש ערך ה-placeholder נעלם ואי אפשר לדעת מה השדה מייצג.
function ProfileField({ label, hint = '', children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 4 }}>{label}</label>
      {hint ? <div style={{ fontSize: 10.5, color: 'var(--s-muted)', lineHeight: 1.5, marginBottom: 4 }}>{hint}</div> : null}
      {children}
    </div>
  );
}

const PROFILE_INPUT_STYLE = { width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12 };
const PROFILE_TEXTAREA_STYLE = { ...PROFILE_INPUT_STYLE, resize: 'vertical' };
const PROFILE_SELECT_STYLE = { ...PROFILE_INPUT_STYLE, background: 'white' };

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
  const [buildingGoldenExample, setBuildingGoldenExample] = useState(false);
  const [styleProbePrompt, setStyleProbePrompt] = useState('כתוב פסקה קצרה שמסבירה למה כדאי להתחיל לכתוב מוקדם.');
  const [styleProbeRunning, setStyleProbeRunning] = useState(false);
  const [styleProbeResult, setStyleProbeResult] = useState(null);
  const [recentMaterials, setRecentMaterials] = useState([]);
  const [lastUploadedMaterials, setLastUploadedMaterials] = useState([]);
  const [uploadKind, setUploadKind] = useState('general');
  const fileInputRef = useRef(null);
  // מנוע הסגנון (טאב מאוחד, למטה) מכסה כבר "העלה עבודות ללמוד סגנון" — כרטיסי הזהב/הלמידה
  // האוטומטית כאן מיותרים ברגע שיש לו chunks אמיתיים. engineHasChunks נבדק פעם אחת + על אירועי עדכון.
  const [engineHasChunks, setEngineHasChunks] = useState(false);
  useEffect(() => {
    const refreshEngineChunks = () => {
      try { setEngineHasChunks((getSampleStoreStats()?.chunkCount || 0) > 0); } catch { setEngineHasChunks(false); }
    };
    refreshEngineChunks();
    window.addEventListener('wordai-style-samples-updated', refreshEngineChunks);
    window.addEventListener('wordai-personal-style-updated', refreshEngineChunks);
    return () => {
      window.removeEventListener('wordai-style-samples-updated', refreshEngineChunks);
      window.removeEventListener('wordai-personal-style-updated', refreshEngineChunks);
    };
  }, []);
  const styleEngineActive = Boolean(profile.styleEngine?.enabled);
  const styleEngineSupersedesLegacy = styleEngineActive && engineHasChunks;
  const currentCoursesInput = useDelimitedListInput(profile.currentCourses, (value) => updateList('currentCourses', value));
  const lecturerNamesInput = useDelimitedListInput(getLecturerNamesFromProfile(profile), (value) => updateList('lecturerNames', value));
  const syllabusTopicsInput = useDelimitedListInput(profile.syllabusTopics, (value) => updateList('syllabusTopics', value));
  const manualVocabularyInput = useDelimitedListInput(profile.manualVocabulary, (value) => updateList('manualVocabulary', value));
  const protectedVocabularyInput = useDelimitedListInput(profile.protectedVocabulary, (value) => updateList('protectedVocabulary', value));
  const manualPhrasesInput = useDelimitedListInput(profile.manualPhrases, (value) => updateList('manualPhrases', value));
  const preferredSentenceStructuresInput = useDelimitedListInput(profile.preferredSentenceStructures, (value) => updateList('preferredSentenceStructures', value));
  const tonePreferencesInput = useDelimitedListInput(profile.tonePreferences, (value) => updateList('tonePreferences', value));

  const handleResetProfile = async () => {
    if (!(await showConfirm('לאפס רק את העדפות הפרופיל, נתוני ההיכרות והלמידה השמורה בפרופיל? חומרי מקור מקומיים, עבודות עבר והיסטוריית הלמידה המקומית לא יימחקו.', { title: 'איפוס פרופיל', confirmLabel: 'אפס', tone: 'danger' }))) return;
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
    const failedUploads = [];
    try {
      const selectedUploadMeta = getMaterialUploadMeta(uploadKind);
      const uploadedIds = [];
      for (const file of files) {
        try {
          const result = await saveHelperMaterial(file, selectedUploadMeta);
          if (result?.entry?.id) uploadedIds.push(result.entry.id);
        } catch (error) {
          console.error('Material upload failed:', file?.name, error);
          failedUploads.push({ name: file?.name || 'קובץ ללא שם', message: error?.message || String(error) });
        }
      }
      if (uploadedIds.length) await syncLearnedStyleFromWorkspace();
      setProfile(getPersonalStyleProfile());
      const items = await loadProjectMaterials();
      setRecentMaterials(items.slice(0, 4));
      const uploadedMaterials = uploadedIds.length ? items.filter((item) => uploadedIds.includes(item.id)) : [];
      setLastUploadedMaterials(uploadedMaterials);
      const problematicUploads = uploadedMaterials
        .map((item) => ({ item, info: getMaterialExtractionStatusInfo(item) }))
        .filter(({ info }) => info.status !== 'success');
      if (failedUploads.length || problematicUploads.length) {
        showToast([
          failedUploads.length ? 'הקבצים הבאים נכשלו בהעלאה ולא נשמרו:' : '',
          ...failedUploads.map(({ name, message }) => `- ${name}: ${message}`),
          failedUploads.length && problematicUploads.length ? '' : '',
          problematicUploads.length ? 'חלק מהקבצים נשמרו אבל לא נקראו במלואם:' : '',
          ...problematicUploads.map(({ item, info }) => `- ${item.title}: ${info.message}`),
        ].filter((line) => line !== '').join('\n'), { tone: 'warning', duration: 8000 });
      }
    } catch (error) {
      // React event-handler rejections are not caught by ErrorBoundary. Keep a
      // failed style refresh or storage write inside the upload UI instead of
      // letting the global crash overlay replace the entire application.
      console.error('Material upload pipeline failed:', error);
      showToast(`העלאת החומרים נעצרה: ${error?.message || 'שגיאה לא ידועה'}`, { tone: 'error', duration: 10000 });
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

  const handleBuildGoldenExample = async () => {
    if (String(profile.goldenExample || '').trim()) {
      const confirmed = await showConfirm('כבר קיימת דוגמת זהב בפרופיל. לבנות דוגמה חדשה מהחומרים הקיימים ולהחליף אותה?', { title: 'דוגמת זהב', confirmLabel: 'בנה מחדש' });
      if (!confirmed) return;
    }

    setBuildingGoldenExample(true);
    try {
      const result = await buildGoldenExampleFromWorkspace();
      if (result?.ok && result.profile) {
        setProfile(result.profile);
      } else {
        showToast(result?.message || 'לא נמצאו מספיק דוגמאות כתיבה לבניית דוגמת זהב.', { tone: 'warning' });
      }
    } finally {
      setBuildingGoldenExample(false);
    }
  };

  const handleRunStyleProbe = async () => {
    setStyleProbeRunning(true);
    setStyleProbeResult(null);
    try {
      const result = await probePersonalStyleInfluence({ prompt: styleProbePrompt });
      setStyleProbeResult(result);
      if (!result?.ok) {
        showToast(result?.message || 'הבדיקה נכשלה.', { tone: 'warning' });
      }
    } catch (error) {
      showToast(`הבדיקה נכשלה: ${error?.message || error}`, { tone: 'warning' });
    } finally {
      setStyleProbeRunning(false);
    }
  };

  return (
    <div>
      {/* רצועת מצב קומפקטית — מחליפה כרטיס "היכרות" גדול שתפס את ראש הטאב בלי לתת מידע חדש. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', border: '1px solid var(--s-border)', borderRadius: 12, padding: '10px 12px', background: onboardingDone ? 'var(--s-surface-2)' : '#FFF7ED', marginBottom: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1, minWidth: 200 }}>
          <span style={{ fontSize: 10, fontWeight: 700, background: onboardingDone ? '#DCFCE7' : '#FEF3C7', color: onboardingDone ? '#166534' : '#92400E', padding: '4px 8px', borderRadius: 999 }}>
            {onboardingDone ? '✓ ההיכרות הושלמה' : 'ההיכרות לא הושלמה'}
          </span>
          {profile.displayName ? <span style={{ fontSize: 10, background: '#FAE8FF', color: '#A21CAF', padding: '4px 8px', borderRadius: 999 }}>{profile.displayName}</span> : null}
          {profile.institutionName ? <span style={{ fontSize: 10, background: '#FEF3C7', color: '#92400E', padding: '4px 8px', borderRadius: 999 }}>{profile.institutionName}</span> : null}
          <span style={{ fontSize: 10, background: styleEngineActive ? '#EEF2FF' : '#F1F5F9', color: styleEngineActive ? '#4338CA' : 'var(--s-muted)', padding: '4px 8px', borderRadius: 999 }}>
            מנוע הסגנון: {styleEngineActive ? 'פעיל' : 'כבוי'}
          </span>
          <span style={{ fontSize: 10, background: profile.learningConsent === false ? '#FEF3C7' : '#DCFCE7', color: profile.learningConsent === false ? '#92400E' : '#166534', padding: '4px 8px', borderRadius: 999 }}>
            {profile.learningConsent === false ? 'למידה ברקע כבויה' : 'למידה ברקע פעילה'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleResetProfile}
          title="מאפס העדפות, onboarding ולמידה שמורה בפרופיל בלבד. חומרי מקור, עבודות עבר והיסטוריית הלמידה המקומית נשארים."
          style={{ padding: '6px 11px', borderRadius: 8, border: '1px solid #FCA5A5', background: 'white', color: '#B91C1C', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}
        >
          אפס פרופיל
        </button>
      </div>

      <SettingsSection title="👤 מי אני" desc="הפרטים וההקשר שמאפשרים לסוכן לדעת למי ובשביל מה הוא כותב.">

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0 12px' }}>
          <ProfileField label="שם">
            <input
              value={profile.displayName || ''}
              onChange={(e) => updateField('displayName', e.target.value)}
              placeholder="איך תרצה שהסוכן יקרא לך"
              style={PROFILE_INPUT_STYLE}
            />
          </ProfileField>

          <ProfileField label="מוסד או מקום עבודה">
            <input
              value={profile.institutionName || ''}
              onChange={(e) => updateField('institutionName', e.target.value)}
              placeholder="מוסד לימודים, ארגון או מקום עבודה"
              style={PROFILE_INPUT_STYLE}
            />
          </ProfileField>

          <ProfileField label="חוג או מסלול">
            <input
              value={profile.studyTrack || ''}
              onChange={(e) => updateField('studyTrack', e.target.value)}
              placeholder="חוג, מסלול, התמחות או תחום מרכזי"
              style={PROFILE_INPUT_STYLE}
            />
          </ProfileField>

          <ProfileField label="תפקיד או סטטוס">
            <input
              value={profile.userRole || ''}
              onChange={(e) => updateField('userRole', e.target.value)}
              placeholder="למשל: סטודנט, מרצה, מנהל"
              style={PROFILE_INPUT_STYLE}
            />
          </ProfileField>
        </div>

        <ProfileField label="רמה אקדמית">
          <select
            value={profile.academic_level || 'undergraduate'}
            onChange={(e) => updateField('academic_level', e.target.value)}
            style={PROFILE_SELECT_STYLE}
          >
            <option value="school">בית ספר</option>
            <option value="undergraduate">תואר ראשון</option>
            <option value="graduate">תואר שני</option>
            <option value="doctoral">דוקטורט</option>
            <option value="professional">מקצועי</option>
          </select>
        </ProfileField>

        <ProfileField label="קורסים פעילים" hint="אפשר להפריד בפסיק או שורה חדשה.">
          <textarea {...currentCoursesInput} placeholder="קורסים, שיעורים או נושאים פעילים כרגע" rows={2} style={PROFILE_TEXTAREA_STYLE} />
        </ProfileField>

        <ProfileField label="מרצים או מנחים" hint="אפשר להפריד בפסיק או שורה חדשה.">
          <textarea {...lecturerNamesInput} placeholder="מרצים או מנחים קבועים" rows={2} style={PROFILE_TEXTAREA_STYLE} />
        </ProfileField>

        <ProfileField label="נושאי סילבוס ודגשים" hint="אפשר להפריד בפסיק או שורה חדשה.">
          <textarea {...syllabusTopicsInput} placeholder="נושאי סילבוס, יחידות לימוד או דגשים חוזרים" rows={2} style={PROFILE_TEXTAREA_STYLE} />
        </ProfileField>

        <ProfileField label="הרקע שלך ככותב">
          <textarea
            value={profile.userBackground || ''}
            onChange={(e) => updateField('userBackground', e.target.value)}
            placeholder="מי אתה ככותב או באיזה הקשר אתה בדרך כלל כותב"
            rows={2}
            style={PROFILE_TEXTAREA_STYLE}
          />
        </ProfileField>

        <ProfileField label="מטרות הכתיבה">
          <textarea
            value={profile.writingGoals || ''}
            onChange={(e) => updateField('writingGoals', e.target.value)}
            placeholder="למשל: עבודה אקדמית מדויקת, ניסוח עסקי חד, סיכומים קצרים"
            rows={2}
            style={PROFILE_TEXTAREA_STYLE}
          />
        </ProfileField>

        <ProfileField label="קהל היעד">
          <textarea
            value={profile.defaultAudience || ''}
            onChange={(e) => updateField('defaultAudience', e.target.value)}
            placeholder="מי קהל היעד הטיפוסי שלך"
            rows={2}
            style={PROFILE_TEXTAREA_STYLE}
          />
        </ProfileField>

        <ProfileField label="הקשר נוסף">
          <textarea
            value={profile.additionalContext || ''}
            onChange={(e) => updateField('additionalContext', e.target.value)}
            placeholder="כל פרט נוסף שיעזור לסוכן להכיר אותך ולהתאים את התשובות"
            rows={2}
            style={PROFILE_TEXTAREA_STYLE}
          />
        </ProfileField>
      </SettingsSection>

      <SettingsSection
        title="🖋️ מנוע הסגנון האישי"
        desc="העלה עבודות שכתבת — מכאן נלמדים דפוסי הכתיבה האמיתיים שלך."
        badge={styleEngineActive ? 'פעיל' : 'כבוי'}
      >
        <StyleProfilePanel embedded />

        <div style={{ borderTop: '1px solid var(--s-border)', marginTop: 14, paddingTop: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.7, background: 'var(--s-surface-2)', border: '1px solid var(--s-border)', borderRadius: 10, padding: '8px 10px', marginBottom: 10 }}>
            בנוסף לעבודות שמעלים כאן, האפליקציה יכולה ללמוד ברקע מהמסמך הפעיל ומהתיקונים שלך לאורך הזמן.
            {profile.autoLearnedFromEditorAt ? <div style={{ marginTop: 4 }}>עודכן לאחרונה: {new Date(profile.autoLearnedFromEditorAt).toLocaleString('he-IL')}</div> : null}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--s-text-strong)' }}>
            <input type="checkbox" checked={profile.learningConsent === true} onChange={(e) => updateField('learningConsent', e.target.checked)} />
            אפשר לסוכן להמשיך ללמוד מהמסמכים המקומיים שלי עם הזמן
          </label>
        </div>
      </SettingsSection>

      <SettingsSection
        title="🎓 מה המנוע למד ממך"
        desc="שקיפות: ההרגלים שנמדדו מהעבודות שהעלית — פתיחים, מסגרות משפט ויעדים מבניים."
        defaultOpen={false}
      >
        <PersonalTrainerPanel />
      </SettingsSection>

      <SettingsSection
        title="✍️ איך אני כותב"
        desc={styleEngineSupersedesLegacy
          ? 'חוקים ידניים שגוברים על המנוע או משלימים אותו. מלא כאן רק מה שהמנוע לא קלע אליו.'
          : 'חוקים ידניים שאתה קובע. כל עוד לא העלית עבודות למנוע, זה מה שמכתיב את הסגנון.'}
      >
        <ProfileField label="העדפות מבנה ותצורה">
          <textarea
            value={profile.formatPreferences || ''}
            onChange={(e) => updateField('formatPreferences', e.target.value)}
            placeholder="איך אתה מעדיף שהטקסט ייראה: קצר, מובנה, עם סעיפים, מפורט, וכדומה"
            rows={2}
            style={PROFILE_TEXTAREA_STYLE}
          />
        </ProfileField>

        <ProfileField label="סגנונות מועדפים במסך הבית">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {STYLE_PRESET_OPTIONS.map((style) => {
              const active = (profile.preferredHomeStyleIds || []).includes(style.id);
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => toggleStyle(style.id)}
                  style={{ padding: '6px 10px', borderRadius: 999, border: `1px solid ${active ? '#1D4ED8' : 'var(--s-border)'}`, background: active ? '#DBEAFE' : 'white', color: active ? '#1D4ED8' : 'var(--s-text)', cursor: 'pointer', fontSize: 12 }}
                >
                  {style.label}
                </button>
              );
            })}
          </div>
        </ProfileField>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 12px' }}>
          <ProfileField label="סגנון מסמך ברירת מחדל">
            <select
              value={profile.defaultDocumentStyle || 'academic'}
              onChange={(e) => updateField('defaultDocumentStyle', e.target.value)}
              style={PROFILE_SELECT_STYLE}
            >
              {STYLE_PRESET_OPTIONS.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}
            </select>
          </ProfileField>

          <ProfileField label="אורך משפטים">
            <select
              value={profile.sentenceLengthPreference || 'מאוזן'}
              onChange={(e) => updateField('sentenceLengthPreference', e.target.value)}
              style={PROFILE_SELECT_STYLE}
            >
              <option value="קצר">משפטים קצרים</option>
              <option value="מאוזן">משפטים מאוזנים</option>
              <option value="מעמיק">משפטים מעמיקים</option>
            </select>
          </ProfileField>

          <ProfileField label="אורך פסקאות">
            <select
              value={profile.paragraphLengthPreference || 'בינוני'}
              onChange={(e) => updateField('paragraphLengthPreference', e.target.value)}
              style={PROFILE_SELECT_STYLE}
            >
              <option value="תמציתי">פסקאות קצרות</option>
              <option value="בינוני">פסקאות בינוניות</option>
              <option value="מפורט">פסקאות מפורטות</option>
            </select>
          </ProfileField>
        </div>

        <ProfileField label="חוקי סגנון אישיים" hint="הנחיות חופשיות שיצורפו לכל בקשת כתיבה.">
          <textarea
            value={profile.customStyleGuidance || ''}
            onChange={(e) => updateField('customStyleGuidance', e.target.value)}
            placeholder="למשל: אל תפתח פסקה במילת קישור, הימנע ממשפטים בסביל"
            rows={2}
            style={PROFILE_TEXTAREA_STYLE}
          />
        </ProfileField>

        <ProfileField label="מונחים מועדפים" hint="מונחים שהעוזר יעדיף להשתמש בהם. הפרד בפסיק או שורה חדשה.">
          <textarea {...manualVocabularyInput} placeholder="למשל: תפיסה, מסגור, הבניה" rows={2} style={PROFILE_TEXTAREA_STYLE} />
        </ProfileField>

        <ProfileField label="מונחים מוגנים" hint="מונחים שלא ישונו לעולם בעריכה או בשכתוב.">
          <textarea {...protectedVocabularyInput} placeholder="מונחים שחייבים להישאר בדיוק כפי שהם" rows={2} style={PROFILE_TEXTAREA_STYLE} />
        </ProfileField>

        <ProfileField label="ביטויים אופייניים" hint="ביטויים שתרצה שישולבו כשמתאים.">
          <textarea {...manualPhrasesInput} placeholder="ביטויים אופייניים שתרצה לשלב" rows={2} style={PROFILE_TEXTAREA_STYLE} />
        </ProfileField>

        <ProfileField label="מבני משפט מועדפים">
          <textarea {...preferredSentenceStructuresInput} placeholder="למשל: מצד אחד... מצד שני, יתרה מזו, ניתן לראות כי" rows={2} style={PROFILE_TEXTAREA_STYLE} />
        </ProfileField>

        <ProfileField label="טון כתיבה מועדף">
          <textarea {...tonePreferencesInput} placeholder="למשל: ענייני, אקדמי, רהוט, ישיר" rows={2} style={PROFILE_TEXTAREA_STYLE} />
        </ProfileField>

        <ProfileField label="העדפות לפסקאות">
          <textarea
            value={profile.paragraphPreferences || ''}
            onChange={(e) => updateField('paragraphPreferences', e.target.value)}
            placeholder="למשל: פסקאות קצרות של 3–4 שורות, או פסקאות ארוכות ומעמיקות"
            rows={2}
            style={PROFILE_TEXTAREA_STYLE}
          />
        </ProfileField>

        <ProfileField label="הערות נוספות">
          <textarea
            value={profile.notes || ''}
            onChange={(e) => updateField('notes', e.target.value)}
            placeholder="כל דבר נוסף על הסגנון האישי שלך"
            rows={3}
            style={PROFILE_TEXTAREA_STYLE}
          />
        </ProfileField>
      </SettingsSection>

      {/* כלים משניים. defaultOpen קבוע ולא תלוי-מצב בכוונה: engineHasChunks נקבע ב-useEffect
          אחרי הרינדור הראשון, ו-SettingsSection קורא את defaultOpen רק ב-useState ההתחלתי —
          ערך תלוי-מצב היה נתפס תמיד כ-false ומתעלם מהמנוע. */}
      <SettingsSection
        title="🧪 כלים נוספים ואבחון"
        desc="דוגמת זהב ידנית, בדיקת השפעת הסגנון, ומה נלמד אוטומטית."
        defaultOpen={false}
      >
      {!styleEngineSupersedesLegacy && (
      <div style={{ border: '1px solid #C7D2FE', borderRadius: 12, padding: '14px', background: '#F8FAFF', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, color: '#3730A3', fontWeight: 800 }}>דוגמת זהב לסגנון אישי</div>
            <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6 }}>העוזר משתמש בדוגמה הזו כדי לחקות קצב, טון ומבני משפטים בלי להעתיק משפטים. ברגע שמנוע הסגנון למטה לומד מעבודות אמיתיות, הוא מחליף את הדוגמה הזו.</div>
          </div>
          <button
            type="button"
            onClick={handleBuildGoldenExample}
            disabled={buildingGoldenExample}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #818CF8', background: buildingGoldenExample ? '#EEF2FF' : 'white', color: '#3730A3', cursor: buildingGoldenExample ? 'wait' : 'pointer', fontSize: 12, fontWeight: 700 }}
          >
            {buildingGoldenExample ? 'בונה...' : 'בנה מהחומרים הקיימים'}
          </button>
        </div>
        <textarea
          value={profile.goldenExample || ''}
          onChange={(e) => updateField('goldenExample', e.target.value)}
          placeholder="אפשר להדביק כאן קטע שכתבת, או ללחוץ על בנייה אוטומטית אחרי שמעלים עבודות קודמות."
          rows={7}
          style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', background: 'white' }}
        />
        {profile.styleGoldenExampleBuiltAt ? (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6 }}>
            נבנתה לאחרונה: {new Date(profile.styleGoldenExampleBuiltAt).toLocaleString('he-IL')}
            {profile.styleGoldenExampleSources?.length ? ` · מקורות: ${profile.styleGoldenExampleSources.slice(0, 3).join(', ')}` : ''}
          </div>
        ) : null}
      </div>
      )}

      <div style={{ border: '1px solid #FBCFE8', borderRadius: 12, padding: '14px', background: '#FFF7FC', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, color: '#9D174D', fontWeight: 800 }}>בדיקת השפעת הסגנון</div>
            <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6 }}>מפיק שני פלטים על אותה בקשה — אחד עם הפרופיל ואחד בלעדיו — ומשווה כדי לבדוק כמה הסגנון באמת משפיע.</div>
          </div>
          <button
            type="button"
            onClick={handleRunStyleProbe}
            disabled={styleProbeRunning}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #F472B6', background: styleProbeRunning ? '#FDF2F8' : 'white', color: '#9D174D', cursor: styleProbeRunning ? 'wait' : 'pointer', fontSize: 12, fontWeight: 700 }}
          >
            {styleProbeRunning ? 'מריץ...' : 'הרץ בדיקה'}
          </button>
        </div>
        <textarea
          value={styleProbePrompt}
          onChange={(e) => setStyleProbePrompt(e.target.value)}
          placeholder="כתוב כאן בקשת כתיבה לדוגמה, למשל: כתוב פסקת פתיחה למאמר על..."
          rows={2}
          style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', background: 'white' }}
        />
        {styleProbeResult?.ok ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: styleProbeResult.negligible ? '#B91C1C' : '#047857', marginBottom: 6 }}>
              {styleProbeResult.verdict}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11, color: 'var(--s-text)', marginBottom: 8 }}>
              <span style={{ background: '#F1F5F9', padding: '4px 8px', borderRadius: 999 }}>חפיפת אוצר מילים: {Math.round(styleProbeResult.metrics.vocabularyOverlap * 100)}%</span>
              <span style={{ background: '#F1F5F9', padding: '4px 8px', borderRadius: 999 }}>הפרש מילים למשפט: {styleProbeResult.metrics.sentenceDelta}</span>
              <span style={{ background: '#F1F5F9', padding: '4px 8px', borderRadius: 999 }}>הפרש מילים לפסקה: {styleProbeResult.metrics.paragraphDelta}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ border: '1px solid #FBCFE8', borderRadius: 8, padding: 8, background: 'white' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#9D174D', marginBottom: 4 }}>עם הפרופיל</div>
                <div style={{ fontSize: 11, color: 'var(--s-muted)', whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>{styleProbeResult.withStyleText}</div>
              </div>
              <div style={{ border: '1px solid var(--s-border)', borderRadius: 8, padding: 8, background: 'white' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--s-muted)', marginBottom: 4 }}>בלי הפרופיל</div>
                <div style={{ fontSize: 11, color: 'var(--s-muted)', whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>{styleProbeResult.withoutStyleText}</div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* מה נלמד אוטומטית — שייך למנוע, לא לחוקים הידניים. כשהמנוע פעיל השדות האלה
          (learnedVocabulary/preferredSentenceOpeners/toneDescriptors) מדוכאים בפרומפט, אז
          מציגים הסבר במקום רשימות מתות. השדות הידניים בסעיף "איך אני כותב" ממשיכים לפעול. */}
      {styleEngineActive ? (
        <div style={{ marginTop: 12, border: '1px solid var(--s-border)', borderRadius: 10, padding: '10px 12px', background: '#F9FAFB', fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.7 }}>
          המנוע פעיל — הוא מזהה בעצמו מונחים, פתיחות משפט וטון, ולכן הרשימות שנלמדו בעבר לא נשלחות יותר. החוקים הידניים שבסעיף "איך אני כותב" ממשיכים לחול כרגיל.
        </div>
      ) : (
        <div style={{ marginTop: 12, border: '1px solid var(--s-border)', borderRadius: 10, padding: '10px 12px', background: '#F9FAFB' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 6 }}>מה נלמד אוטומטית מהקבצים</div>
          <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.8 }}>
            מונחים בולטים: {(profile.learnedVocabulary || []).slice(0, 8).join(', ') || 'עדיין אין'}
            <br />
            פתיחות משפט: {(profile.preferredSentenceOpeners || []).slice(0, 4).join(', ') || 'עדיין אין'}
            <br />
            טון שנלמד: {(profile.toneDescriptors || []).slice(0, 4).join(', ') || 'עדיין אין'}
            <br />
            למידה ממשחקים: {(profile.learningGameInsights || []).slice(0, 4).join(' • ') || 'עדיין אין'}
          </div>
        </div>
      )}
      </SettingsSection>

      <SettingsSection
        title="📎 תבניות וחומרים"
        desc="עמוד שער אישי וקובצי הקשר. לא משפיע על אופן הכתיבה עצמו."
        defaultOpen={false}
      >
        <CoverTemplateSettings profile={profile} setProfile={setProfile} />

      <div style={{ border: '1px solid #DBEAFE', borderRadius: 12, padding: '14px', background: 'var(--s-surface-2)', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 13, color: '#1E3A8A', fontWeight: 700 }}>חומרי עזר נוספים</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={uploadKind}
              onChange={(e) => setUploadKind(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #C8C6C4', background: 'white', fontSize: 12 }}
            >
              {Object.values(MATERIAL_UPLOAD_PRESETS).filter((item) => item.id !== 'writing-sample').map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
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
        <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6 }}>
          לחומרי הקשר כלליים, דפי שער לדוגמה, תבניות מסמך או חומרי קורס — בחר את סוג הקובץ לפני ההעלאה. לעבודות כתיבה שלך שממנן לומדים את הסגנון עצמו — בקטע "מנוע הסגנון האישי" למטה.
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--s-text)', background: 'white', border: '1px solid #DBEAFE', borderRadius: 10, padding: '8px 10px' }}>
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

      </SettingsSection>
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
  const [workspaceDialogStatus, setWorkspaceDialogStatus] = useState({ type: '', message: '' });

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

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (previewWorkspaceId) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        setPreviewWorkspaceId('');
        return;
      }
      if (deepEditWorkspaceState.id) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        closeDeepWorkspaceEdit();
        return;
      }
      if (editWorkspaceState.id) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        closeEditWorkspace();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [previewWorkspaceId, editWorkspaceState.id, deepEditWorkspaceState.id]);

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
      showToast('הסביבה נוצרה, אבל לא הצלחתי לעבור אליה אוטומטית. נסה לבחור אותה מהרשימה.', { tone: 'warning' });
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

  const handleDeleteWorkspace = async (workspaceId, workspaceName) => {
    const targetId = String(workspaceId || '').trim();
    if (!targetId || Object.prototype.hasOwnProperty.call(DEFAULT_WORKSPACES_LIBRARY, targetId)) return;
    if (!(await showConfirm(`למחוק את סביבת העבודה "${workspaceName || targetId}"?`, { title: 'מחיקת סביבה', confirmLabel: 'מחק', tone: 'danger' }))) return;
    const deleted = deleteWorkspace(targetId);
    if (!deleted) {
      showToast('לא הצלחתי למחוק את סביבת העבודה.', { tone: 'error' });
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
    setWorkspaceDialogStatus({ type: '', message: '' });
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
    setWorkspaceDialogStatus({ type: '', message: '' });
    const resolvedWorkspace = typeof workspaceInput === 'string'
      ? workspacesLib?.[String(workspaceInput || '').trim()]
      : workspaceInput;
    const targetId = String(resolvedWorkspace?.id || '').trim();
    if (!targetId || !resolvedWorkspace) {
      showToast('לא הצלחתי לפתוח את סביבת העבודה לעריכה.', { tone: 'error' });
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
      setWorkspaceDialogStatus({ type: 'error', message: 'צריך לתת שם לסביבת העבודה.' });
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
      setWorkspaceDialogStatus({ type: 'error', message: 'לא הצלחתי לשמור את העריכה המלאה של סביבת העבודה.' });
      return;
    }

    refreshWorkspaceState();
    if (String(getWorkspaceAutomation().activeWorkspaceId || '').trim() === targetId) {
      setAgents(getRoleAgents());
      setAutomation(getWorkspaceAutomation());
    }
    setWorkspaceDialogStatus({ type: 'ok', message: 'סביבת העבודה נשמרה. חזרת להגדרות הסוכנים.' });
    closeDeepWorkspaceEdit();
  };

  const saveWorkspaceDetails = () => {
    const targetId = String(editWorkspaceState.id || '').trim();
    if (!targetId) return;
    const nextName = String(editWorkspaceState.name || '').trim();
    if (!nextName) {
      setWorkspaceDialogStatus({ type: 'error', message: 'צריך לתת שם לסביבת העבודה.' });
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
      setWorkspaceDialogStatus({ type: 'error', message: 'לא הצלחתי לשמור את פרטי סביבת העבודה.' });
      return;
    }
    refreshWorkspaceState();
    setWorkspaceDialogStatus({ type: 'ok', message: 'השינויים נשמרו. חזרת להגדרות הסוכנים.' });
    closeEditWorkspace();
  };

  return (
    <div style={{ marginBottom: 20, border: '1px solid var(--s-border)', borderRadius: 12, padding: '14px', background: '#F9FAFB' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginBottom: 12 }}>
        📦 יצירה ושמירה של סביבות עבודה
      </div>
      {workspaceDialogStatus.message ? (
        <div style={{ border: `1px solid ${workspaceDialogStatus.type === 'ok' ? '#86EFAC' : '#FCA5A5'}`, borderRadius: 10, padding: '8px 10px', background: workspaceDialogStatus.type === 'ok' ? '#F0FDF4' : '#FEF2F2', color: workspaceDialogStatus.type === 'ok' ? '#166534' : '#991B1B', fontSize: 11, fontWeight: 700, marginBottom: 10 }}>
          {workspaceDialogStatus.message}
        </div>
      ) : null}

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--s-muted)', lineHeight: 1.7 }}>
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
            <div style={{ marginTop: 6, fontSize: 10, color: 'var(--s-muted)' }}>
              שם בפועל: <strong>{String(newWorkspaceName ?? '').trim() ? String(newWorkspaceName ?? '') : getWorkspaceFallbackName()}</strong>
            </div>
          </div>

          <div style={{ marginBottom: 10, fontSize: 10, color: 'var(--s-muted)', lineHeight: 1.6 }}>
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

      <div style={{ marginBottom: 12, background: 'white', border: '1px solid var(--s-border)', borderRadius: 8, padding: '10px 12px' }}>
        <div style={{ fontSize: 12, color: 'var(--s-muted)', fontWeight: 700, marginBottom: 8 }}>
          סביבות שמורות ({savedWorkspaces.length})
        </div>
        <div style={{ display: 'grid', gap: 6, maxHeight: 170, overflow: 'auto' }}>
          {savedWorkspaces.map((ws) => (
              <div key={ws.id} style={{ fontSize: 11, color: '#4B5563', border: '1px solid var(--s-border)', borderRadius: 8, padding: '10px', background: '#F9FAFB' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <strong style={{ color: '#111827', display: 'block' }}>{ws.name || ws.id}</strong>
                    <div style={{ color: 'var(--s-muted)', marginTop: 4 }}>
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
              <div style={{ color: 'var(--s-muted)', marginTop: 4 }}>
                עודכנה: {new Date(ws.lastModified || Date.now()).toLocaleDateString('he-IL')}
              </div>
                {ws?.automation?.sharedGoal ? (
                  <div style={{ color: 'var(--s-muted)', marginTop: 6, lineHeight: 1.5 }}>
                    מטרה: {String(ws.automation.sharedGoal).slice(0, 80)}{String(ws.automation.sharedGoal).length > 80 ? '…' : ''}
                  </div>
                ) : null}
            </div>
          ))}
        </div>
      </div>

        {previewWorkspace ? (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1700, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ width: 'min(680px, 94vw)', background: 'white', borderRadius: 18, border: '1px solid var(--s-border)', boxShadow: '0 24px 64px rgba(15,23,42,0.28)', padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--s-text-strong)' }}>{previewWorkspace.name || previewWorkspace.id}</div>
                  <div style={{ fontSize: 12, color: 'var(--s-muted)', marginTop: 4 }}>{formatWorkflowLabel(previewWorkspace?.automation)}</div>
                </div>
                <button type="button" onClick={() => setPreviewWorkspaceId('')} style={{ border: '1px solid var(--s-border)', background: 'white', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: 'var(--s-text)' }}>סגור</button>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '12px 14px', background: 'var(--s-surface-2)' }}>
                  <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>שם</div>
                  <div style={{ fontSize: 13, color: '#111827', fontWeight: 700 }}>{previewWorkspace.name || previewWorkspace.id}</div>
                </div>

                <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '12px 14px', background: 'var(--s-surface-2)' }}>
                  <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>מטרה משותפת</div>
                  <div style={{ fontSize: 13, color: '#111827', lineHeight: 1.7 }}>{previewWorkspace?.automation?.sharedGoal || 'לא הוגדרה מטרה משותפת.'}</div>
                </div>

                <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '12px 14px', background: 'var(--s-surface-2)' }}>
                  <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 8 }}>סוכנים בסביבה</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {(Array.isArray(previewWorkspace?.agents) ? previewWorkspace.agents : []).length ? (previewWorkspace.agents || []).map((agent) => (
                      <div key={`${previewWorkspace.id}-${agent.id}`} style={{ border: '1px solid var(--s-border)', borderRadius: 10, padding: '8px 10px', background: 'white' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--s-text-strong)' }}>{agent.name || agent.id}</div>
                        <div style={{ fontSize: 11, color: 'var(--s-muted)', marginTop: 3 }}>{agent.provider || 'ברירת מחדל'}{agent.model ? ` · ${agent.model}` : ''}</div>
                      </div>
                    )) : <div style={{ fontSize: 12, color: 'var(--s-muted)' }}>אין סוכנים שמורים בסביבה זו.</div>}
                  </div>
                </div>
              </div>

              {workspaceDialogStatus.message ? (
                <div style={{ marginTop: 12, border: `1px solid ${workspaceDialogStatus.type === 'ok' ? '#86EFAC' : '#FCA5A5'}`, borderRadius: 10, padding: '8px 10px', background: workspaceDialogStatus.type === 'ok' ? '#F0FDF4' : '#FEF2F2', color: workspaceDialogStatus.type === 'ok' ? '#166534' : '#991B1B', fontSize: 11, fontWeight: 700 }}>
                  {workspaceDialogStatus.message}
                </div>
              ) : null}

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => openEditWorkspace(previewWorkspace)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #DDD6FE', background: '#F5F3FF', color: '#6D28D9', cursor: 'pointer', fontWeight: 700 }}>עריכה בסיסית</button>
                <button type="button" onClick={() => openDeepWorkspaceEdit(previewWorkspace)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', fontWeight: 700 }}>פתח עריכה מלאה</button>
              </div>
            </div>
          </div>
        ) : null}

        {editingWorkspace ? (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1700, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ width: 'min(620px, 94vw)', background: 'white', borderRadius: 18, border: '1px solid var(--s-border)', boxShadow: '0 24px 64px rgba(15,23,42,0.28)', padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--s-text-strong)' }}>עריכה בסיסית של סביבת עבודה</div>
                  <div style={{ fontSize: 12, color: 'var(--s-muted)', marginTop: 4 }}>{editingWorkspace.name || editingWorkspace.id}</div>
                </div>
                <button type="button" onClick={closeEditWorkspace} style={{ border: '1px solid var(--s-border)', background: 'white', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: 'var(--s-text)' }}>סגור</button>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>שם הסביבה</div>
                  <input
                    value={editWorkspaceState.name}
                    onChange={(e) => setEditWorkspaceState((prev) => ({ ...prev, name: e.target.value }))}
                    style={{ width: '100%', padding: '9px 10px', border: '1px solid var(--s-border)', borderRadius: 8, fontSize: 12 }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>מטרה משותפת</div>
                  <textarea
                    value={editWorkspaceState.sharedGoal}
                    onChange={(e) => setEditWorkspaceState((prev) => ({ ...prev, sharedGoal: e.target.value }))}
                    rows={5}
                    placeholder="למשל: לבנות טיוטות אקדמיות קצרות עם דגש על מקורות ומבנה ברור"
                    style={{ width: '100%', padding: '9px 10px', border: '1px solid var(--s-border)', borderRadius: 8, fontSize: 12, resize: 'vertical' }}
                  />
                </div>
              </div>

              {workspaceDialogStatus.message ? (
                <div style={{ marginTop: 12, border: `1px solid ${workspaceDialogStatus.type === 'ok' ? '#86EFAC' : '#FCA5A5'}`, borderRadius: 10, padding: '8px 10px', background: workspaceDialogStatus.type === 'ok' ? '#F0FDF4' : '#FEF2F2', color: workspaceDialogStatus.type === 'ok' ? '#166534' : '#991B1B', fontSize: 11, fontWeight: 700 }}>
                  {workspaceDialogStatus.message}
                </div>
              ) : null}

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => openDeepWorkspaceEdit(editingWorkspace)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', fontWeight: 700 }}>פתח עריכה מלאה</button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={closeEditWorkspace} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--s-border)', background: 'white', color: 'var(--s-text)', cursor: 'pointer', fontWeight: 700 }}>ביטול</button>
                  <button type="button" onClick={saveWorkspaceDetails} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #16A34A', background: '#16A34A', color: 'white', cursor: 'pointer', fontWeight: 700 }}>שמור שינויים</button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {deepEditingWorkspace ? (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1710, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ width: 'min(1040px, 96vw)', maxHeight: '92vh', background: 'white', borderRadius: 20, border: '1px solid var(--s-border)', boxShadow: '0 28px 72px rgba(15,23,42,0.32)', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--s-text-strong)' }}>עריכה מלאה של סביבת עבודה</div>
                  <div style={{ fontSize: 12, color: 'var(--s-muted)', marginTop: 4 }}>{deepEditWorkspaceState.automation?.workspaceName || deepEditingWorkspace.name || deepEditingWorkspace.id}</div>
                </div>
                <button type="button" onClick={closeDeepWorkspaceEdit} style={{ border: '1px solid var(--s-border)', background: 'white', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: 'var(--s-text)' }}>סגור</button>
              </div>

              <div style={{ fontSize: 12, color: 'var(--s-muted)', lineHeight: 1.7 }}>
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

              {workspaceDialogStatus.message ? (
                <div style={{ border: `1px solid ${workspaceDialogStatus.type === 'ok' ? '#86EFAC' : '#FCA5A5'}`, borderRadius: 10, padding: '8px 10px', background: workspaceDialogStatus.type === 'ok' ? '#F0FDF4' : '#FEF2F2', color: workspaceDialogStatus.type === 'ok' ? '#166534' : '#991B1B', fontSize: 11, fontWeight: 700 }}>
                  {workspaceDialogStatus.message}
                </div>
              ) : null}

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, color: 'var(--s-muted)' }}>
                  השינויים בפופאפ הזה לא מחליפים את סביבת העבודה הפעילה עד לשמירה.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={closeDeepWorkspaceEdit} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--s-border)', background: 'white', color: 'var(--s-text)', cursor: 'pointer', fontWeight: 700 }}>ביטול</button>
                  <button type="button" onClick={saveDeepWorkspaceEdit} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #16A34A', background: '#16A34A', color: 'white', cursor: 'pointer', fontWeight: 700 }}>שמור סביבת עבודה</button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

      <div style={{ fontSize: 11, color: 'var(--s-muted)', background: '#F3F4F6', padding: '10px', borderRadius: 6 }}>
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
      if (field === 'provider') {
        const nextProvider = String(value || '').trim();
        const modelChoices = getProviderModelChoices(nextProvider, config, [agent?.model]);
        if (!nextProvider) {
          nextAgent.model = '';
        } else if (!isProviderModelChoiceCompatible(nextProvider, agent?.model || '', config)) {
          nextAgent.model = modelChoices[0] || '';
        }
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
      <p style={{ fontSize: 13, color: 'var(--s-muted)', marginBottom: 10 }}>
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

      <div style={{ border: `1px solid ${isAutopilotManagerMode ? '#BFDBFE' : '#DDD6FE'}`, borderRadius: 12, padding: '12px 14px', background: isAutopilotManagerMode ? 'var(--s-surface-2)' : '#F8F7FF', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: isAutopilotManagerMode ? '#1E3A8A' : '#6D28D9', marginBottom: 6 }}>
          חוקי ההכרעה הפעילים
        </div>
        <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.7 }}>
          {isAutopilotManagerMode
            ? automation?.workflowMode === 'autopilot-full'
              ? 'במצב הזה מתבצעת קריאת preflight: מנהל הצוות בוחר דינמית סוכנים, ספקים, מודלים, הנחיות שלב ומספר סבבים לפני ההרצה עצמה.'
              : 'במצב הזה כל סוכן מדווח מה הושלם ומה עדיין חסר, ומנהל הצוות הוא זה שמחליט על הצעד הבא.'
            : 'במצב הזה כל סוכן עדיין מדווח מה חסר, אבל ההמשך נקבע לפי כללים וסקילים פעילים ולא על ידי מנהל מרכזי.'}
        </div>
      </div>

      <div style={{ border: '1px solid #DBEAFE', borderRadius: 12, padding: '14px', background: 'var(--s-surface-2)', marginBottom: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: bypassActive ? 'var(--s-muted)' : '#1E3A8A', fontWeight: 700, marginBottom: 12 }}>
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
            <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4, fontWeight: 500 }}>Preset</div>
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
            <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4, fontWeight: 500 }}>סדר עבודה</div>
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
            <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4, fontWeight: 500 }}>שם סביבת העבודה</div>
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
            <div style={{ marginTop: 4, fontSize: 10, color: 'var(--s-muted)' }}>אפשר להקליד שם עם רווחים. השמירה מתבצעת ב-Enter או ביציאה מהשדה.</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4, fontWeight: 500 }}>Retry אוטומטי</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'white', border: '1px solid #C8C6C4', borderRadius: 6, padding: '8px 10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--s-text-strong)' }}>
                <input
                  type="checkbox"
                  checked={automation?.retryEnabled !== false}
                  onChange={(e) => setAutomation(prev => ({ ...prev, retryEnabled: e.target.checked }))}
                />
                פעיל
              </label>
              <span style={{ fontSize: 12, color: 'var(--s-muted)' }}>עד</span>
              <input
                type="number"
                min="0"
                max="5"
                value={automation?.maxRetries ?? 2}
                onChange={(e) => setAutomation(prev => ({ ...prev, maxRetries: Math.max(0, Number(e.target.value) || 0) }))}
                style={{ width: 60, padding: '6px 8px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12 }}
              />
              <span style={{ fontSize: 12, color: 'var(--s-muted)' }}>ניסיונות</span>
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
            <div style={{ marginTop: 6, color: 'var(--s-text)' }}>
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
                <span style={{ color: 'var(--s-muted)' }}>מקסימום סבבים לכל סוכן</span>
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
          <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4, fontWeight: 500 }}>מטרה והנחיה משותפת לסביבת הסוכנים</div>
          <textarea
            value={automation?.sharedGoal || ''}
            onChange={(e) => setAutomation(prev => ({ ...prev, sharedGoal: e.target.value }))}
            placeholder="למשל: כתיבת עבודות אקדמיות בעברית, עם מבנה מסודר, מקורות, וליטוש סופי"
            rows={3}
            style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', background: 'white' }}
          />
        </div>

        <div style={{ marginTop: 10, border: '1px solid var(--s-border)', borderRadius: 10, padding: '10px 12px', background: 'var(--s-surface)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#1E293B', fontWeight: 700, marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={automation?.appendAgentNotesToOutput === true}
              onChange={(e) => setAutomation(prev => ({ ...prev, appendAgentNotesToOutput: e.target.checked }))}
            />
            צרף בסוף המסמך נספח הערות סוכנים (כולל סיכום מנהל ואינדיקציה פנימית להגשה)
          </label>
          <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.7, marginBottom: 8 }}>
            כשפעיל, המסמך יקבל בסוף נספח שמרכז הערות לפי סוכן, המלצות מנהל עבודה והערכת היצמדות להנחיות.
          </div>
          <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4, fontWeight: 500 }}>הנחיה מותאמת להערות הסוכן בסוף העבודה</div>
          <textarea
            value={automation?.agentNotesInstruction || ''}
            onChange={(e) => setAutomation(prev => ({ ...prev, agentNotesInstruction: e.target.value }))}
            placeholder="למשל: ציין פערים מתודולוגיים, מה לתקן לפני הגשה, ומה נשמר מצוין לפי ההנחיות"
            rows={2}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--s-border)', borderRadius: 8, fontSize: 12, resize: 'vertical', background: 'white' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: bypassActive ? 'var(--s-muted)' : 'var(--s-text-strong)' }}>
            <input
              type="checkbox"
              checked={automation?.autoDispatch !== false}
              disabled={bypassActive}
              onChange={(e) => setAutomation(prev => ({ ...prev, autoDispatch: e.target.checked }))}
            />
            הפעלה אוטומטית בין הסוכנים
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--s-text-strong)' }}>
            <input
              type="checkbox"
              checked={automation?.showProgress !== false}
              onChange={(e) => setAutomation(prev => ({ ...prev, showProgress: e.target.checked }))}
            />
            הצג חיווי התקדמות וסטטוס חי
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--s-text-strong)' }}>
            <input
              type="checkbox"
              checked={automation?.timeoutEnabled === true}
              onChange={(e) => setAutomation(prev => ({ ...prev, timeoutEnabled: e.target.checked }))}
            />
            הפעל timeout לסוכנים
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: automation?.timeoutEnabled === true ? 'var(--s-text-strong)' : 'var(--s-muted)' }}>
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
                  background: automation?.timeoutEnabled === true ? 'white' : 'var(--s-surface-2)',
                  color: automation?.timeoutEnabled === true ? 'var(--s-text-strong)' : 'var(--s-muted)',
                  opacity: automation?.timeoutEnabled === true ? 1 : 0.75,
                }}
              />
              <span>ms</span>
            </div>
            <div style={{ fontSize: 11, color: automation?.timeoutEnabled === true ? 'var(--s-muted)' : '#0F766E', lineHeight: 1.6 }}>
              {automation?.timeoutEnabled === true
                ? 'המערכת תעצור ריצת סוכנים ארוכה במיוחד לפי הערך שהוגדר במילישניות.'
                : 'כבוי כברירת מחדל. ריצות סוכנים ימשיכו ללא timeout אוטומטי.'}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.7 }}>
          אפשר לבנות כאן סביבת עבודה משלך: לבחור שם לסביבה, מטרה, להוסיף או למחוק סוכנים, ולהגדיר לכל סוכן מודל ותפקיד שונים. במצב AUTOPILOT המערכת גם תקבע לבד מי יעבוד, באיזה סדר, ומה יהיה התפקיד המעשי של כל שלב לפי ההנחיה והחומרים.
        </div>
      </div>

      {isAutopilotManagerMode && managerAgent && (
        <div style={{ border: '1px solid #BFDBFE', borderRadius: 12, padding: '14px', background: 'var(--s-surface-2)', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1E3A8A' }}>בקרת מנהל העבודה</div>
              <div style={{ fontSize: 11, color: 'var(--s-muted)', marginTop: 4 }}>כאן בוחרים מהר את המנוע והמודל של מי שמנהל את כל תהליך ה-AUTOPILOT.</div>
            </div>
            <span style={{ fontSize: 10, background: '#DBEAFE', color: '#1D4ED8', padding: '4px 8px', borderRadius: 999, fontWeight: 700 }}>AUTOPILOT</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4, fontWeight: 500 }}>ספק למנהל</div>
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
                <option value="scholar" disabled={!isProviderConfigured(config, 'scholar')}>Google Scholar</option>
                <option value="ollama" disabled={!isProviderConfigured(config, 'ollama')}>Ollama</option>
                <option value="custom" disabled={!isProviderConfigured(config, 'custom')}>Custom</option>
              </select>
            </div>

            <div>
              <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4, fontWeight: 500 }}>מודל למנהל</div>
              <input
                value={managerAgent.model || ''}
                onChange={(e) => updateManager('model', e.target.value)}
                placeholder="למשל: gemini-2.5-pro או claude-sonnet-4-6"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, direction: 'ltr', background: 'white' }}
              />
            </div>
          </div>

          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--s-text)', lineHeight: 1.6 }}>
            ההנחיות המלאות של המנהל זמינות לעריכה בכרטיס שלו למטה, אבל בחירת המוח המנהל עכשיו הרבה יותר ישירה.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {agents.map((agent, index) => {
          const compatibleAgentModel = agent.provider && isProviderModelChoiceCompatible(agent.provider, agent.model, config) ? agent.model : '';
          const agentModelChoices = getProviderModelChoices(agent.provider, config, compatibleAgentModel ? [compatibleAgentModel] : []);
          return (
          <div key={agent.id || index} style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '14px', background: 'white' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <span style={{ minWidth: 28, height: 28, borderRadius: 999, background: '#EEF4FF', color: 'var(--color-chrome)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
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
                style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #BFDBFE', background: index === 0 ? 'var(--s-surface-2)' : '#EFF6FF', color: '#1D4ED8', cursor: index === 0 ? 'default' : 'pointer' }}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={index === agents.length - 1}
                onClick={() => moveAgent(index, 1)}
                style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #BFDBFE', background: index === agents.length - 1 ? 'var(--s-surface-2)' : '#EFF6FF', color: '#1D4ED8', cursor: index === agents.length - 1 ? 'default' : 'pointer' }}
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
                <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4, fontWeight: 500 }}>ספק מועדף</div>
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
                <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4, fontWeight: 500 }}>מודל מועדף לסוכן</div>
                <select
                  value={(agent.provider && compatibleAgentModel && agentModelChoices.includes(compatibleAgentModel)) ? compatibleAgentModel : ''}
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

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--s-text-strong)' }}>
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
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6 }}>
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
    if (state === 'available') return { color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE', title: 'יש גרסה חדשה' };
    if (state === 'downloaded') return { color: '#166534', bg: '#F0FDF4', border: '#BBF7D0', title: 'העדכון מוכן להתקנה' };
    if (state === 'downloading' || state === 'checking') return { color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE', title: 'העדכון בבדיקה/הורדה' };
    if (state === 'up-to-date') return { color: '#166534', bg: '#F0FDF4', border: '#BBF7D0', title: 'האפליקציה מעודכנת' };
    if (state === 'manual-download') return { color: '#92400E', bg: '#FFFBEB', border: '#FDE68A', title: 'נדרש עדכון ידני' };
    if (state === 'dev-mode' || state === 'web' || state === 'unavailable') return { color: '#92400E', bg: '#FFFBEB', border: '#FDE68A', title: 'עדכון לא זמין כרגע' };
    if (state === 'error') return { color: '#991B1B', bg: '#FEF2F2', border: '#FECACA', title: 'אירעה שגיאה בעדכון' };
    return { color: 'var(--s-muted)', bg: 'var(--s-surface-2)', border: 'var(--s-border)', title: 'בדיקת עדכונים' };
  };

  const meta = getStatusMeta(updateInfo.status);

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--s-muted)', marginBottom: 14, lineHeight: 1.7 }}>
        כאן אפשר לבדוק ידנית אם יש גרסה חדשה, ולהתקין אותה מתוך האפליקציה ברגע שהיא מוכנה.
      </p>

      <div style={{ border: `1px solid ${meta.border}`, background: meta.bg, borderRadius: 14, padding: '14px', marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: meta.color, marginBottom: 6 }}>{meta.title}</div>
        <div style={{ fontSize: 12, color: 'var(--s-text)', marginBottom: 8 }}>{updateInfo.message || 'מוכן לבדיקת עדכונים'}</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: 'var(--s-muted)' }}>
          <span>גרסה נוכחית: {updateInfo.currentVersion || '—'}</span>
          {updateInfo.availableVersion && <span>גרסה זמינה: {updateInfo.availableVersion}</span>}
          {(updateInfo.status === 'downloading' || updateInfo.status === 'checking') && <span>התקדמות: {Math.round(Number(updateInfo.percent || 0))}%</span>}
        </div>

        {updateInfo.status === 'downloading' && (
          <div style={{ marginTop: 10, height: 6, borderRadius: 999, background: '#DBEAFE', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.max(2, Math.min(100, Number(updateInfo.percent || 0)))}%`, background: '#2563EB', borderRadius: 999, transition: 'width 0.2s linear' }} />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={checkNow}
          disabled={busy || updateInfo.status === 'checking' || updateInfo.status === 'downloading' || !window.desktopApp?.checkForAppUpdates}
          style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #93C5FD', background: (busy || updateInfo.status === 'checking' || updateInfo.status === 'downloading') ? 'var(--s-border)' : '#EFF6FF', color: '#1D4ED8', cursor: (busy || updateInfo.status === 'checking' || updateInfo.status === 'downloading') ? 'default' : 'pointer', fontWeight: 700 }}
        >
          {busy ? 'בודק…' : 'בדוק אם יש עדכון'}
        </button>

        {(updateInfo.status === 'available' || updateInfo.status === 'downloaded') && (
          <button
            onClick={installNow}
            disabled={busy}
            style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #16A34A', background: busy ? 'var(--s-border)' : '#16A34A', color: 'white', cursor: busy ? 'default' : 'pointer', fontWeight: 700 }}
          >
            {busy ? 'מוריד ומתקין…' : 'הורד והתקן עכשיו'}
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
    if (state === 'idle') return { icon: '✗', color: 'var(--s-muted)', bg: 'var(--s-surface-2)', border: 'var(--s-border)' };
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

  const resetLogs = async () => {
    if (!(await showConfirm('לנקות את כל הלוגים של סביבת העבודה הנוכחית?', { title: 'ניקוי לוגים', confirmLabel: 'נקה', tone: 'danger' }))) return;
    clearAgentDebugLogs(activeWorkspaceId);
    setLogs([]);
    setSummary(getLatestAgentRunSummary(automation));
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--s-muted)', marginBottom: 14, lineHeight: 1.7 }}>
        כאן אפשר לראות בדיוק מה קרה בהרצה האחרונה: האם הופעל API, האם AUTOPILOT ניהל את הצוות, ואילו שלבים הושלמו או נכשלו.
      </p>

      <div style={{ marginBottom: 14, border: '1px solid var(--s-border)', background: 'var(--s-surface-2)', borderRadius: 10, padding: '8px 10px', fontSize: 11, color: 'var(--s-text)' }}>
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
              <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6 }}>{item.details}</div>
            </div>
          );
        })}
      </div>

      <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--s-text-strong)', marginBottom: 10 }}>מצב שלבים</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {(summary?.stages || []).map((stage) => {
            const meta = getStatusMeta(stage.state);
            return (
              <div key={stage.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: `1px solid ${meta.border}`, borderRadius: 10, padding: '8px 10px', background: meta.bg }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1F2937' }}>{stage.label}</div>
                  {stage.configuredName && stage.configuredName !== stage.label && (
                    <div style={{ fontSize: 10, color: 'var(--s-muted)', marginTop: 2 }}>שם מוגדר: {stage.configuredName}</div>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--s-muted)', marginTop: 2 }}>{stage.details || 'לא הופעל'}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {(stage.provider || stage.model) && <span style={{ fontSize: 10, color: 'var(--s-muted)' }}>{[stage.provider, stage.model].filter(Boolean).join(' · ')}</span>}
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

      <div style={{ border: '1px solid var(--s-border)', borderRadius: 12, padding: '14px', background: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--s-text-strong)' }}>קונסולת לוגים</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={copyLogs} style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid var(--s-border)', background: 'white', cursor: 'pointer', fontSize: 11 }}>העתק</button>
            <button onClick={resetLogs} style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', cursor: 'pointer', fontSize: 11 }}>נקה</button>
          </div>
        </div>

        <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--s-text-strong)', borderRadius: 12, padding: '10px' }}>
          {logs.length ? logs.map((log) => {
            const meta = getStatusMeta(log.state);
            return (
              <div key={log.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--s-border)' }}>{getAgentTitle(log)}</span>
                  <span style={{ fontSize: 10, color: 'var(--s-muted)' }}>{formatTime(log.ts)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 999, background: 'white', color: meta.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11 }}>{meta.icon}</span>
                  <span style={{ fontSize: 11, color: 'var(--s-surface-2)', lineHeight: 1.5 }}>{log.message || 'ללא הודעה'}</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--s-muted)' }}>
                  {[log.workspaceName ? `סביבה: ${log.workspaceName}` : '', log.provider, log.model, log.errorMessage].filter(Boolean).join(' • ')}
                </div>
              </div>
            );
          }) : (
            <div style={{ fontSize: 11, color: 'var(--s-muted)', padding: '8px 4px' }}>עדיין אין לוגים להצגה.</div>
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
    void saveBlobInBrowser(blob, filename);
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
      <div style={{ border: '1px solid var(--s-border)', borderRadius: 14, padding: '14px', background: 'var(--s-surface)', gridColumn: 'span 2' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginBottom: 8 }}>Generation Inspector</div>
        <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6 }}>עדיין לא נשמר snapshot של generation או revise להצגה.</div>
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
    <div style={{ border: '1px solid var(--s-border)', borderRadius: 14, padding: '14px', background: 'var(--s-surface)', gridColumn: 'span 2' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginBottom: 4 }}>Generation Inspector</div>
          <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6 }}>
            snapshot מינימלי של מה שנשלח למסלול generation ומה באמת נפתר בזמן הריצה האחרונה.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={copySummary} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid var(--s-border)', background: 'white', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Copy summary</button>
          <button onClick={exportSummary} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid var(--s-border)', background: 'var(--s-surface-2)', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Export JSON</button>
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
          <div key={item.label} style={{ border: '1px solid var(--s-border)', borderRadius: 10, background: 'var(--s-surface-2)', padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1F2937', lineHeight: 1.5, wordBreak: 'break-word' }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
        <div style={{ border: '1px solid var(--s-border)', borderRadius: 10, background: 'var(--s-surface-2)', padding: '10px 12px' }}>
          <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>Base draft</div>
          <div style={{ fontSize: 12, color: '#1F2937', lineHeight: 1.6 }}>
            {snapshot.baseDraft
              ? `${snapshot.baseDraft.title || 'טיוטת בסיס'} · html ${snapshot.baseDraft.htmlChars || 0} chars · text ${snapshot.baseDraft.textChars || 0} chars`
              : 'לא נשלחה טיוטת בסיס בהרצה האחרונה.'}
          </div>
        </div>

        <div style={{ border: `1px solid ${snapshot.errorMessage ? '#FECACA' : snapshot.usedFallback ? '#FDE68A' : 'var(--s-border)'}`, borderRadius: 10, background: snapshot.errorMessage ? '#FEF2F2' : snapshot.usedFallback ? '#FFFBEB' : 'var(--s-surface-2)', padding: '10px 12px' }}>
          <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>Fallback / Error</div>
          <div style={{ fontSize: 12, color: snapshot.errorMessage ? '#991B1B' : '#1F2937', lineHeight: 1.6 }}>
            {snapshot.errorMessage || (snapshot.usedFallback ? 'ההרצה חזרה ל-fallback בטוח.' : 'לא נרשם fallback או error בהרצה האחרונה.')}
          </div>
          {snapshot.routeModeReason ? (
            <div style={{ fontSize: 11, color: 'var(--s-muted)', marginTop: 6 }}>route hint: {snapshot.routeModeReason}</div>
          ) : null}
        </div>
      </div>

      <div style={{ border: '1px solid var(--s-border)', borderRadius: 10, background: 'var(--s-surface)', padding: '12px 12px 4px' }}>
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
                <div style={{ fontSize: 11, color: 'var(--s-muted)', marginTop: 3 }}>{item.label || 'ללא label'}</div>
                {item.previewError ? (
                  <div style={{ fontSize: 11, color: '#B91C1C', marginTop: 4 }}>preview error: {item.previewError}</div>
                ) : null}
              </div>
              <div style={{ fontSize: 11, color: item.hasPreview ? '#166534' : 'var(--s-muted)', background: item.hasPreview ? '#F0FDF4' : 'var(--s-surface-2)', border: `1px solid ${item.hasPreview ? '#BBF7D0' : 'var(--s-border)'}`, borderRadius: 999, padding: '4px 8px', whiteSpace: 'nowrap' }}>
                {previewLabel}
              </div>
            </div>
          );
        }) : (
          <div style={{ fontSize: 11, color: 'var(--s-muted)', paddingBottom: 8 }}>לא נבחרו חומרי עזר בהרצה האחרונה.</div>
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
  const [blockedDomainsText, setBlockedDomainsText] = useState(() => getBlockedSourceDomains().join(', '));
  const [blockedDomainsSaved, setBlockedDomainsSaved] = useState(false);
  const saveBlockedDomains = () => {
    const normalized = saveBlockedSourceDomains(blockedDomainsText);
    setBlockedDomainsText(normalized.join(', '));
    setBlockedDomainsSaved(true);
    setTimeout(() => setBlockedDomainsSaved(false), 1600);
  };
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
  const clearStorageKey = async (key) => {
    if (!(await showConfirm(`למחוק את המפתח "${key}" מה-localStorage?\nפעולה זו לא ניתנת לביטול.`, { title: 'מחיקת מפתח אחסון', confirmLabel: 'מחק', tone: 'danger' }))) return;
    localStorage.removeItem(key);
    refreshStorageInfo();
  };
  const totalStorageBytes = storageInfo.reduce((sum, e) => sum + e.sizeBytes, 0);

  // App memory & chat history state
  const [appMemory, setAppMemory] = useState(() => getAppMemory());
  const [chatCleared, setChatCleared] = useState(false);
  const handleClearAppMemory = async () => {
    if (!(await showConfirm('לנקות את זיכרון ה-AI (הערות ושיחות אחרונות)?\nפעולה זו לא ניתנת לביטול.', { title: 'ניקוי זיכרון AI', confirmLabel: 'נקה', tone: 'danger' }))) return;
    clearAppMemory();
    setAppMemory(getAppMemory());
  };
  const handleClearChatHistory = async () => {
    if (!(await showConfirm('לנקות את היסטוריית הצ׳אט של סביבת העבודה הנוכחית?', { title: 'ניקוי צ׳אט', confirmLabel: 'נקה', tone: 'danger' }))) return;
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

  const resetLogs = async () => {
    if (!(await showConfirm('לנקות את כל הלוגים של סביבת העבודה הנוכחית?', { title: 'ניקוי לוגים', confirmLabel: 'נקה', tone: 'danger' }))) return;
    clearAgentDebugLogs(activeWorkspaceId);
    setLogsCount(0);
    setSummary(getLatestAgentRunSummary(getWorkspaceAutomation()));
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 13, color: 'var(--s-muted)', marginBottom: 0, lineHeight: 1.7, flex: '1 1 320px' }}>
          אזור מרוכז למשתמש מתקדם: שליטה מהירה על provider/model פעיל, shell של חלונית הצ׳אט, guardrails למחקר ומקורות, timeout במילישניות, ו-debug בסיסי בלי לטייל בין כמה טאבים.
        </p>
        <div style={{ display: 'grid', gap: 6, justifyItems: 'start' }}>
          <button
            onClick={resetDeveloperDefaults}
            style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid var(--s-border)', background: 'white', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
          >
            Reset to defaults
          </button>
          <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6 }}>
            מחזיר provider/model, preset חלונית, כללי מקורות, timeout ונספח הערות סוכנים לברירת המחדל. מפתחות API לא נמחקים.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        <div style={{ border: '1px solid var(--s-border)', borderRadius: 14, padding: '14px', background: 'var(--s-surface)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginBottom: 8 }}>Provider / Model פעיל</div>
          <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6, marginBottom: 12 }}>
            זהו ה-override הזמין ביותר למסלול הישיר ולכל מקום שנשען על הספק הפעיל בהגדרות.
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--s-muted)' }}>ספק פעיל</span>
              <select
                value={activeProviderId}
                onChange={(e) => setConfig((prev) => ({ ...prev, active: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--s-border)', borderRadius: 10, fontSize: 12, background: 'white' }}
              >
                {DEVELOPER_PROVIDER_OPTIONS.map(([providerId, label]) => (
                  <option key={providerId} value={providerId} disabled={!isProviderConfigured(config, providerId) && activeProviderId !== providerId}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--s-muted)' }}>מודל פעיל</span>
              <select
                value={activeModelChoices.includes(activeProviderModel) ? activeProviderModel : ''}
                onChange={(e) => setConfig((prev) => ({
                  ...prev,
                  [activeProviderId]: {
                    ...(prev?.[activeProviderId] || {}),
                    model: e.target.value,
                  },
                }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--s-border)', borderRadius: 10, fontSize: 12, background: 'white', marginBottom: 6 }}
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
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--s-border)', borderRadius: 10, fontSize: 12, direction: 'ltr', background: 'white' }}
              />
            </label>
          </div>
        </div>

        <div style={{ border: '1px solid var(--s-border)', borderRadius: 14, padding: '14px', background: 'var(--s-surface)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginBottom: 8 }}>Chat Pane Shell & Grounding</div>
          <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6, marginBottom: 12 }}>
            כאן בוחרים איזה shell המשתמש רואה בתוך ה-sidebar, ואיך בקשות למקורות מטופלות כדי לצמצם הזיות, URLs שבורים והמצאת כתבות.
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--s-muted)' }}>Preset לחלונית הצ׳אט</span>
              <select
                value={sidebarPreset}
                onChange={(e) => setAssistantBehavior((prev) => ({ ...prev, sidebarPreset: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--s-border)', borderRadius: 10, fontSize: 12, background: 'white' }}
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

            <div style={{ marginTop: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#1F2937', display: 'block', marginBottom: 4 }}>
                🚫 אתרים לא רצויים למקורות
              </label>
              <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6, marginBottom: 6 }}>
                דומיינים שלא יופיעו כמקורות, מופרדים בפסיק או שורה (למשל: <code>example.com, some-blog.co.il</code>). מתווספים לרשימה הקשיחה — ויקיפדיה, רשתות חברתיות ובלוגים חסומים תמיד.
              </div>
              <textarea
                value={blockedDomainsText}
                onChange={(e) => setBlockedDomainsText(e.target.value)}
                rows={3}
                placeholder="example.com, some-blog.co.il"
                style={{ width: '100%', border: '1px solid var(--s-border)', borderRadius: 10, padding: '9px 10px', fontSize: 13, resize: 'vertical', direction: 'ltr', textAlign: 'left' }}
              />
              <button
                type="button"
                onClick={saveBlockedDomains}
                style={{ marginTop: 8, border: '1px solid #2563EB', background: blockedDomainsSaved ? '#DCFCE7' : '#EFF6FF', color: blockedDomainsSaved ? '#166534' : '#1D4ED8', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
              >
                {blockedDomainsSaved ? 'נשמר ✓' : 'שמור רשימת חסימה'}
              </button>
            </div>
          </div>

          <div style={{ fontSize: 11, color: verifiedRetrievalConfigured ? 'var(--s-muted)' : '#B45309', lineHeight: 1.6, marginTop: 10 }}>
            {perplexityConfigured && scholarConfigured
              ? 'Perplexity ו-SerpAPI Scholar מוגדרים: Perplexity זמין למחקר כללי ולבקשות משולבות, ו-Scholar זמין לבקשות מקורות אקדמיים מאומתים.'
              : perplexityConfigured
                ? 'Perplexity מוגדר, לכן Auto-Route יכול לעבור למסלול מחקר עם אינטרנט אמיתי כשנדרשים מקורות.'
                : scholarConfigured
                  ? 'Perplexity לא מוגדר, אבל SerpAPI Scholar כן מוגדר. לכן בקשות מקורות אקדמיים מאומתים עדיין זמינות במסלול source-only, בעוד שבקשות משולבות או מקורות כלליים ללא אחזור מאומת ייחסמו.'
                  : 'Perplexity ו-SerpAPI Scholar עדיין לא מוגדרים. האכיפה עדיין פעילה, ולכן בקשות למקורות יחזירו חסימה מפורשת עד שיוגדר ספק אחזור מאומת.'}
          </div>
        </div>

        <div style={{ border: '1px solid var(--s-border)', borderRadius: 14, padding: '14px', background: 'var(--s-surface)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginBottom: 8 }}>Timeout לסוכנים</div>
          <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6, marginBottom: 12 }}>
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
            <span style={{ fontSize: 11, fontWeight: 600, color: automation?.timeoutEnabled === true ? 'var(--s-muted)' : 'var(--s-muted)' }}>Timeout במילישניות</span>
            <input
              type="number"
              min="10000"
              max="300000"
              step="1000"
              disabled={automation?.timeoutEnabled !== true}
              value={automation?.requestTimeoutMs ?? 45000}
              onChange={(e) => setAutomation((prev) => ({ ...prev, requestTimeoutMs: Math.max(10000, Number(e.target.value) || 45000) }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--s-border)', borderRadius: 10, fontSize: 12, background: automation?.timeoutEnabled === true ? 'white' : 'var(--s-surface-2)', color: automation?.timeoutEnabled === true ? '#1F2937' : 'var(--s-muted)' }}
            />
          </label>

          <div style={{ fontSize: 11, color: automation?.timeoutEnabled === true ? 'var(--s-muted)' : '#0F766E', lineHeight: 1.6, marginTop: 8 }}>
            {automation?.timeoutEnabled === true
              ? 'הערך ייחתך אוטומטית למינימום 10000ms כדי למנוע timeout אגרסיבי מדי.'
              : 'כבוי כרגע. ריצות ארוכות ימשיכו ללא עצירה אוטומטית.'}
          </div>
        </div>

        <div style={{ border: '1px solid var(--s-border)', borderRadius: 14, padding: '14px', background: 'var(--s-surface)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginBottom: 8 }}>Workspace automation</div>
          <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6, marginBottom: 12 }}>
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
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--s-muted)' }}>הנחיה מותאמת לנספח</span>
            <textarea
              value={automation?.agentNotesInstruction || ''}
              onChange={(e) => setAutomation((prev) => ({ ...prev, agentNotesInstruction: e.target.value }))}
              placeholder="למשל: ציין פערים מתודולוגיים, מה לתקן לפני הגשה, ומה נשמר מצוין לפי ההנחיות"
              rows={3}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--s-border)', borderRadius: 10, fontSize: 12, resize: 'vertical', background: 'white' }}
            />
          </label>

          <div style={{ fontSize: 11, color: automation?.appendAgentNotesToOutput === true ? 'var(--s-muted)' : '#0F766E', lineHeight: 1.6, marginTop: 8 }}>
            {automation?.appendAgentNotesToOutput === true
              ? 'הנספח יצורף רק לריצות automation שמחזירות מסמך, עם ההנחיה הייעודית שנכתבה כאן.'
              : 'כבוי כרגע. הפלט יישאר נקי מנספח הערות עד שמפעילים את ההגדרה.'}
          </div>
        </div>

        <div style={{ border: '1px solid var(--s-border)', borderRadius: 14, padding: '14px', background: 'var(--s-surface)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginBottom: 8 }}>Debug Logs</div>
          <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6, marginBottom: 12 }}>
            ייצוא מהיר של הלוגים הפעילים או ניקוי מלא של סביבת העבודה הנוכחית.
          </div>

          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <div style={{ border: '1px solid var(--s-border)', borderRadius: 10, background: 'var(--s-surface-2)', padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: 'var(--s-muted)' }}>סביבה פעילה</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginTop: 4 }}>{summary?.workspaceName || automation?.workspaceName || 'ללא שם'}</div>
              <div style={{ fontSize: 11, color: 'var(--s-muted)', marginTop: 6 }}>לוגים שמורים: {logsCount}</div>
            </div>
            {!!summary?.lastError && (
              <div style={{ border: '1px solid #FECACA', borderRadius: 10, background: '#FEF2F2', padding: '10px 12px', fontSize: 11, color: '#991B1B', lineHeight: 1.6 }}>
                שגיאה אחרונה: {summary.lastError}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={exportLogs} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid var(--s-border)', background: 'white', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>ייצא JSON</button>
            <button onClick={resetLogs} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>נקה לוגים</button>
          </div>
        </div>

        <GenerationInspectorCard lastGenerationAction={lastGenerationAction} liveGeneration={liveGeneration} />

        {/* ─── כרטיס: בדיקת חיבור ─── */}
        <div style={{ border: '1px solid var(--s-border)', borderRadius: 14, padding: '14px', background: 'var(--s-surface)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginBottom: 8 }}>בדיקת חיבור לספק</div>
          <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6, marginBottom: 12 }}>
            שולח בקשת ping לספק הפעיל ומציג תשובה, מודל שנענה, ועיכוב ברמת מילישניות.
          </div>
          <button
            onClick={runConnTest}
            disabled={connTest.status === 'running'}
            style={{ padding: '9px 16px', borderRadius: 999, border: '1px solid var(--s-border)', background: connTest.status === 'running' ? '#F1F5F9' : 'white', cursor: connTest.status === 'running' ? 'wait' : 'pointer', fontSize: 12, fontWeight: 700, marginBottom: 12 }}
          >
            {connTest.status === 'running' ? '⏳ בודק...' : '🔌 בדוק עכשיו'}
          </button>
          {connTest.status === 'done' && connTest.result && (
            <div style={{ border: `1px solid ${connTest.result.ok ? '#BBF7D0' : '#FECACA'}`, borderRadius: 10, background: connTest.result.ok ? '#F0FDF4' : '#FEF2F2', padding: '10px 12px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: connTest.result.ok ? '#15803D' : '#B91C1C', marginBottom: 6 }}>
                {connTest.result.ok ? `✅ חיבור תקין — ${connTest.elapsed}ms` : `❌ שגיאה — ${connTest.elapsed}ms`}
              </div>
              {connTest.result.model && (
                <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4 }}>מודל: <code style={{ background: 'var(--s-border)', padding: '1px 5px', borderRadius: 4 }}>{connTest.result.model}</code></div>
              )}
              {connTest.result.reply && (
                <div style={{ fontSize: 11, color: 'var(--s-muted)', marginBottom: 4, lineHeight: 1.5 }}>תגובה: <em>{String(connTest.result.reply).slice(0, 120)}{connTest.result.reply.length > 120 ? '…' : ''}</em></div>
              )}
              {connTest.result.error && (
                <div style={{ fontSize: 11, color: '#B91C1C', lineHeight: 1.5 }}>{connTest.result.error}</div>
              )}
            </div>
          )}
        </div>

        {/* ─── כרטיס: Storage Inspector ─── */}
        <div style={{ border: '1px solid var(--s-border)', borderRadius: 14, padding: '14px', background: 'var(--s-surface)', gridColumn: 'span 2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', flex: 1 }}>Storage Inspector</div>
            <div style={{ fontSize: 11, color: 'var(--s-muted)' }}>סה"כ: {(totalStorageBytes / 1024).toFixed(1)} KB</div>
            <button onClick={refreshStorageInfo} style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid var(--s-border)', background: 'white', cursor: 'pointer', fontSize: 11 }}>רענן</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6, marginBottom: 10 }}>
            כל מפתחות ה-localStorage של WordFlow. לחץ על 🗑 למחיקת מפתח ספציפי.
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #F1F5F9', borderRadius: 10 }}>
            {storageInfo.length === 0 && (
              <div style={{ padding: 12, fontSize: 11, color: 'var(--s-muted)', textAlign: 'center' }}>אין נתונים</div>
            )}
            {storageInfo.map(({ key, sizeBytes }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid var(--s-surface-2)', direction: 'ltr' }}>
                <div style={{ flex: 1, fontSize: 11, color: '#1F2937', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{key}</div>
                <div style={{ fontSize: 10, color: 'var(--s-muted)', whiteSpace: 'nowrap' }}>{(sizeBytes / 1024).toFixed(1)} KB</div>
                <button onClick={() => clearStorageKey(key)} title="מחק מפתח" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#F87171', padding: '0 2px', lineHeight: 1 }}>🗑</button>
              </div>
            ))}
          </div>
        </div>

        {/* ─── כרטיס: App Memory & Chat History ─── */}
        <div style={{ border: '1px solid var(--s-border)', borderRadius: 14, padding: '14px', background: 'var(--s-surface)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginBottom: 8 }}>App Memory & Chat</div>
          <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6, marginBottom: 12 }}>
            זיכרון ה-AI (הערות + שיחות אחרונות) והיסטוריית Sidebar Chat.
          </div>
          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <div style={{ border: '1px solid var(--s-border)', borderRadius: 10, background: 'var(--s-surface-2)', padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: 'var(--s-muted)' }}>הערות זיכרון</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1F2937' }}>{appMemory.memoryNotes?.length ?? 0}</div>
            </div>
            <div style={{ border: '1px solid var(--s-border)', borderRadius: 10, background: 'var(--s-surface-2)', padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: 'var(--s-muted)' }}>שיחות אחרונות שמורות</div>
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
        <div style={{ border: '1px solid var(--s-border)', borderRadius: 14, padding: '14px', background: 'var(--s-surface)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginBottom: 8 }}>🔄 Workflow Engine</div>
          <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6, marginBottom: 12 }}>
            שליטה מלאה על מנגנון ריצת הסוכנים: מצב, אוטומציה, ו-Bypass לסביבת עבודה.
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--s-muted)' }}>מצב Workflow</span>
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
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--s-border)', borderRadius: 10, fontSize: 12, background: 'white' }}
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
        <div style={{ border: '1px solid var(--s-border)', borderRadius: 14, padding: '14px', background: 'var(--s-surface)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', marginBottom: 8 }}>🔁 Circular Workflow & Retry</div>
          <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6, marginBottom: 12 }}>
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
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--s-muted)' }}>סבבים מינימום</span>
                <input type="number" min={1} max={10}
                  value={automation?.circularMinRounds ?? 1}
                  onChange={(e) => setAutomation((prev) => ({ ...prev, circularMinRounds: Math.max(1, Number(e.target.value) || 1) }))}
                  style={{ padding: '8px 10px', border: '1px solid var(--s-border)', borderRadius: 10, fontSize: 12 }}
                />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--s-muted)' }}>סבבים מקסימום</span>
                <input type="number" min={1} max={10}
                  value={automation?.circularMaxRounds ?? 2}
                  onChange={(e) => setAutomation((prev) => ({ ...prev, circularMaxRounds: Math.max(1, Number(e.target.value) || 2) }))}
                  style={{ padding: '8px 10px', border: '1px solid var(--s-border)', borderRadius: 10, fontSize: 12 }}
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
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--s-muted)' }}>מספר ניסיונות חוזרים</span>
                <input type="number" min={0} max={5}
                  disabled={automation?.retryEnabled === false}
                  value={automation?.maxRetries ?? 2}
                  onChange={(e) => setAutomation((prev) => ({ ...prev, maxRetries: Math.max(0, Number(e.target.value) || 0) }))}
                  style={{ padding: '8px 10px', border: '1px solid var(--s-border)', borderRadius: 10, fontSize: 12, background: automation?.retryEnabled === false ? 'var(--s-surface-2)' : 'white' }}
                />
              </label>
            </div>
          </div>
        </div>

        {/* ─── כרטיס: Assistant Popup ─── */}
        {assistantBehavior && setAssistantBehavior && (
          <div style={{ border: '1px solid var(--s-border)', borderRadius: 14, padding: '14px', background: 'var(--s-surface)' }}>
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
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--s-muted)' }}>זמן עצירה לפני קפיצה (שניות)</span>
                <input type="number" min={2} max={60}
                  disabled={assistantBehavior?.autoPopup === false}
                  value={assistantBehavior?.idleSeconds ?? 5}
                  onChange={(e) => setAssistantBehavior((prev) => ({ ...prev, idleSeconds: Math.max(2, Number(e.target.value) || 5) }))}
                  style={{ padding: '8px 10px', border: '1px solid var(--s-border)', borderRadius: 10, fontSize: 12, width: 120 }}
                />
              </label>
            </div>
          </div>
        )}

        {/* ─── כרטיס: AI Quick Actions ─── */}
        {wordPrefs?.aiQuickActions && setWordPrefs && (
          <div style={{ border: '1px solid var(--s-border)', borderRadius: 14, padding: '14px', background: 'var(--s-surface)', gridColumn: 'span 2' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', flex: 1 }}>⚡ AI Quick Actions בסרגל</div>
              <button
                onClick={() => setWordPrefs((prev) => ({ ...prev, aiQuickActions: Object.fromEntries(Object.keys(prev.aiQuickActions || {}).map((k) => [k, true])) }))}
                style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid var(--s-border)', background: 'white', cursor: 'pointer', fontSize: 11 }}
              >הפעל הכל</button>
              <button
                onClick={() => setWordPrefs((prev) => ({ ...prev, aiQuickActions: Object.fromEntries(Object.keys(prev.aiQuickActions || {}).map((k) => [k, false])) }))}
                style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', cursor: 'pointer', fontSize: 11 }}
              >כבה הכל</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--s-muted)', lineHeight: 1.6, marginBottom: 10 }}>
              שלוט אילו כפתורי AI מהיר מוצגים בסרגל הכלים כשמסמנים טקסט.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
              {Object.entries(wordPrefs.aiQuickActions).map(([key, enabled]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#1F2937', padding: '6px 10px', border: `1px solid ${enabled ? '#BFDBFE' : 'var(--s-border)'}`, borderRadius: 8, background: enabled ? '#EFF6FF' : 'var(--s-surface-2)', cursor: 'pointer', userSelect: 'none' }}>
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
    { name: 'Word Classic',    vars: { '--word-blue': '#2B579A', '--page-bg': 'var(--s-border)', '--text-color': 'var(--s-text-strong)' }, preview: ['#2B579A', 'var(--s-border)'] },
    { name: 'ירוק Office',     vars: { '--word-blue': '#217346', '--page-bg': '#D5E8D4', '--text-color': '#1E3A2B' }, preview: ['#217346', '#D5E8D4'] },
    { name: 'כהה (Dark)',      vars: { '--word-blue': '#3B82F6', '--page-bg': '#1E1E1E', '--text-color': '#D4D4D4' }, preview: ['#1E1E1E', '#2D2D2D'] },
    { name: 'מינימל לבן',     vars: { '--word-blue': '#4B5563', '--page-bg': '#F9FAFB', '--text-color': '#111827' }, preview: ['#4B5563', '#F9FAFB'] },
    { name: 'סגול',             vars: { '--word-blue': '#7C3AED', '--page-bg': '#EDE9FE', '--text-color': '#2E1065' }, preview: ['#7C3AED', '#EDE9FE'] },
    { name: 'כחול בהיר',       vars: { '--word-blue': '#0369A1', '--page-bg': '#E0F2FE', '--text-color': '#0C4A6E' }, preview: ['#0369A1', '#E0F2FE'] },
  ];
  const applyTheme = (vars) => Object.entries(vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));

  const [appTheme, setAppThemeState] = useState(getTheme);
  useEffect(() => onThemeChange(setAppThemeState), []);
  const themeModes = [
    { id: 'light', label: 'בהיר', icon: 'ph-sun', blurb: 'ברירת מחדל — ממשק בהיר' },
    { id: 'dark', label: 'כהה', icon: 'ph-moon', blurb: 'Navy + teal — נוח לעיניים' },
  ];

  return (
    <div>
      <p className="text-[13px] text-slate-500 mb-3 font-medium dark:text-[#8ba3bd]">מצב תצוגה — תחול מיידית ונשמר:</p>
      <div className="grid grid-cols-2 gap-3 mb-7">
        {themeModes.map((m) => {
          const active = appTheme === m.id;
          return (
            <button key={m.id} type="button" onClick={() => setAppTheme(m.id)}
              className={`flex items-center gap-3 rounded-2xl border p-3.5 text-right transition-all outline-none focus:ring-2 ${active
                ? 'border-indigo-300 bg-indigo-50 shadow-sm focus:ring-indigo-100 dark:border-[#2dd4bf]/60 dark:bg-[#2dd4bf]/10 dark:focus:ring-[#2dd4bf]/20'
                : 'border-slate-200 bg-white hover:border-indigo-200 hover:shadow-sm focus:ring-slate-100 dark:border-white/12 dark:bg-white/5 dark:hover:border-white/20'}`}>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[20px] ${active ? 'bg-indigo-600 text-white dark:bg-[#2dd4bf] dark:text-[#06231f]' : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-[#8ba3bd]'}`}>
                <i className={`ph ${m.icon}`} />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-extrabold text-slate-800 dark:text-[#f1f6fb]">{m.label}{active ? ' ✓' : ''}</span>
                <span className="block text-[11.5px] text-slate-500 dark:text-[#8ba3bd]">{m.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[13px] text-slate-500 mb-4 font-medium dark:text-[#8ba3bd]">צבע מותג ודף — תחול מיידית:</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {themes.map(t => (
          <button key={t.name} onClick={() => applyTheme(t.vars)}
            className="border border-slate-200 rounded-xl overflow-hidden bg-white text-center transition-all hover:border-indigo-200 hover:shadow-md outline-none focus:ring-2 focus:ring-indigo-100 dark:border-white/12 dark:bg-white/5 dark:hover:border-[#2dd4bf]/40">
            <div className="h-9" style={{ background: `linear-gradient(90deg, ${t.preview[0]} 50%, ${t.preview[1]} 50%)` }} />
            <div className="px-1.5 py-2 text-[11px] text-slate-700 font-semibold dark:text-[#cfe0ef]">{t.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── הגדרות אבטחה: הצפנת קצה-לקצה למפתחות בענן ───
const MIN_PASSPHRASE_LEN = 8;

function RecoveryCodeCard({ code, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { showToast('ההעתקה נכשלה — העתק ידנית.', 'error'); }
  };
  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 dark:border-amber-400/40 dark:bg-amber-400/10">
      <div className="text-[15px] font-extrabold text-amber-900 mb-2 dark:text-amber-200">🗝️ קוד השחזור שלך</div>
      <p className="text-[13px] text-amber-800 leading-relaxed mb-3 dark:text-amber-100/80">
        זו הדרך היחידה לשחזר גישה אם תשכח את הסיסמה. שמור אותו במקום בטוח (מנהל סיסמאות / דף מודפס).
        <b> לא נציג אותו שוב.</b>
      </p>
      <div dir="ltr" className="font-mono text-[16px] sm:text-[18px] font-bold tracking-wider text-slate-800 bg-white rounded-xl border border-amber-200 px-4 py-3 text-center select-all break-all dark:bg-[#0f1d2e] dark:text-amber-100 dark:border-amber-400/30">
        {code}
      </div>
      <div className="flex gap-2 mt-3">
        <button type="button" onClick={copy}
          className="px-4 py-2 rounded-lg bg-amber-600 text-white text-[13px] font-bold hover:bg-amber-500 transition-colors">
          {copied ? '✓ הועתק' : 'העתק קוד'}
        </button>
        <button type="button" onClick={onClose}
          className="px-4 py-2 rounded-lg bg-white text-amber-800 border border-amber-300 text-[13px] font-bold hover:bg-amber-100 transition-colors dark:bg-white/5 dark:text-amber-200 dark:border-amber-400/30">
          שמרתי — סגור
        </button>
      </div>
    </div>
  );
}

function PassphraseField({ value, onChange, placeholder, autoFocus = false }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} autoFocus={autoFocus} dir="ltr"
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pe-12 text-[14px] text-slate-800 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 dark:bg-white/5 dark:border-white/12 dark:text-[#f1f6fb]"
      />
      <button type="button" onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 end-2 my-auto h-7 px-2 text-[11px] font-bold text-slate-400 hover:text-slate-600 dark:text-[#8ba3bd]">
        {show ? 'הסתר' : 'הצג'}
      </button>
    </div>
  );
}

function SecuritySettings() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [bundle, setBundle] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [unlocked, setUnlocked] = useState(isCryptoUnlocked());
  const [busy, setBusy] = useState(false);
  const [revealedRecovery, setRevealedRecovery] = useState(null);
  const [deviceRemembered, setDeviceRemembered] = useState(false);

  // טפסים
  const [setupPass, setSetupPass] = useState('');
  const [setupPass2, setSetupPass2] = useState('');
  const [unlockPass, setUnlockPass] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState('');
  const [recoveryVerified, setRecoveryVerified] = useState(false);
  const [changePass, setChangePass] = useState('');
  const [changePass2, setChangePass2] = useState('');
  const [showChange, setShowChange] = useState(false);

  useEffect(() => onCloudAuthChange((u) => { setUser(u || null); setAuthReady(true); }), []);

  // משיכת ה-bundle מהענן כשהמשתמש מתחבר. נוכחות bundle = הצפנה פעילה לחשבון.
  useEffect(() => {
    let cancelled = false;
    if (!user) { setBundle(null); return undefined; }
    setLoadingMeta(true);
    fetchCloudCryptoMeta(user)
      .then((b) => {
        if (cancelled) return;
        setBundle(b || null);
        if (b) setCloudCryptoEnabled(true); // מכשיר זה משתתף בהצפנה
        setUnlocked(isCryptoUnlocked());
      })
      .catch(() => { if (!cancelled) setBundle(null); })
      .finally(() => { if (!cancelled) setLoadingMeta(false); });
    return () => { cancelled = true; };
  }, [user]);

  // אם הסנכרון גילה נתונים מוצפנים ואין מפתח פתוח — לעדכן את ה-UI.
  useEffect(() => {
    const onLocked = () => setUnlocked(false);
    window.addEventListener('wordai-cloud-crypto-locked', onLocked);
    return () => window.removeEventListener('wordai-cloud-crypto-locked', onLocked);
  }, []);

  // מצב "זכור במכשיר הזה" עבור החשבון הנוכחי.
  useEffect(() => {
    let cancelled = false;
    if (!user?.uid) { setDeviceRemembered(false); return undefined; }
    hasCloudDeviceKey(user.uid).then((has) => { if (!cancelled) setDeviceRemembered(has); }).catch(() => {});
    return () => { cancelled = true; };
  }, [user, unlocked]);

  const rememberThisDevice = async () => {
    setBusy(true);
    try {
      const ok = await saveCloudDeviceKey(user.uid, getCryptoSessionDek());
      setDeviceRemembered(ok);
      showToast(ok ? 'המכשיר הזה ייפתח אוטומטית מעכשיו.' : 'שמירת המפתח במכשיר נכשלה.', ok ? 'success' : 'error');
    } finally { setBusy(false); }
  };

  const forgetThisDevice = async () => {
    setBusy(true);
    try {
      await clearCloudDeviceKey(user.uid);
      setDeviceRemembered(false);
      showToast('המכשיר נשכח — בפתיחה הבאה תידרש הסיסמה.', 'info');
    } finally { setBusy(false); }
  };

  const validatePair = (a, b) => {
    if (a.length < MIN_PASSPHRASE_LEN) { showToast(`הסיסמה חייבת באורך ${MIN_PASSPHRASE_LEN} תווים לפחות.`, 'error'); return false; }
    if (a !== b) { showToast('הסיסמאות לא תואמות.', 'error'); return false; }
    return true;
  };

  const handleEnable = async () => {
    if (!validatePair(setupPass, setupPass2)) return;
    setBusy(true);
    try {
      const { bundle: b, recoveryCode } = await initCryptoPassphrase(setupPass);
      await saveCloudCryptoMeta(user, b);
      setCloudCryptoEnabled(true);
      setBundle(b); setUnlocked(true); setRevealedRecovery(recoveryCode);
      setSetupPass(''); setSetupPass2('');
      // מיגרציה: סנכרון כפוי שמצפין את המפתחות שכבר בענן.
      await triggerCloudSync(user, { immediate: true, force: true });
      showToast('הצפנת ענן הופעלה.', 'success');
    } catch (e) {
      showToast('שגיאה בהפעלת ההצפנה: ' + (e?.message || e), 'error');
    } finally { setBusy(false); }
  };

  const handleUnlock = async () => {
    setBusy(true);
    try {
      const ok = await unlockCryptoPassphrase(unlockPass, bundle);
      if (!ok) { showToast('סיסמה שגויה.', 'error'); return; }
      setUnlocked(true); setUnlockPass('');
      await pullFromCloud(user, { force: true }); // פענוח והחלת המפתחות מהענן
      showToast('נפתח. המפתחות נטענו מהענן.', 'success');
    } catch (e) {
      showToast('שגיאה בפתיחה: ' + (e?.message || e), 'error');
    } finally { setBusy(false); }
  };

  const handleRecoveryVerify = async () => {
    setBusy(true);
    try {
      const ok = await unlockCryptoRecovery(recoveryInput, bundle);
      if (!ok) { showToast('קוד שחזור שגוי.', 'error'); return; }
      setUnlocked(true); setRecoveryVerified(true);
      await pullFromCloud(user, { force: true });
      showToast('הקוד אומת. כעת קבע סיסמה חדשה.', 'success');
    } catch (e) {
      showToast('שגיאה בשחזור: ' + (e?.message || e), 'error');
    } finally { setBusy(false); }
  };

  const handleRecoverySetNewPass = async () => {
    if (!validatePair(changePass, changePass2)) return;
    setBusy(true);
    try {
      const b2 = await changeCryptoPassphrase(bundle, changePass);
      await saveCloudCryptoMeta(user, b2);
      setBundle(b2);
      setShowForgot(false); setRecoveryVerified(false); setRecoveryInput('');
      setChangePass(''); setChangePass2('');
      showToast('סיסמה חדשה נקבעה.', 'success');
    } catch (e) {
      showToast('שגיאה בקביעת סיסמה: ' + (e?.message || e), 'error');
    } finally { setBusy(false); }
  };

  const handleChangePassphrase = async () => {
    if (!validatePair(changePass, changePass2)) return;
    setBusy(true);
    try {
      const b2 = await changeCryptoPassphrase(bundle, changePass);
      await saveCloudCryptoMeta(user, b2);
      setBundle(b2); setShowChange(false); setChangePass(''); setChangePass2('');
      showToast('הסיסמה עודכנה.', 'success');
    } catch (e) {
      showToast('שגיאה בעדכון הסיסמה: ' + (e?.message || e), 'error');
    } finally { setBusy(false); }
  };

  const handleRotateRecovery = async () => {
    const confirmed = await showConfirm('ליצור קוד שחזור חדש? הקוד הישן יפסיק לעבוד.', { title: 'קוד שחזור חדש', confirmLabel: 'צור חדש' });
    if (!confirmed) return;
    setBusy(true);
    try {
      const { bundle: b2, recoveryCode } = await rotateCryptoRecovery(bundle);
      await saveCloudCryptoMeta(user, b2);
      setBundle(b2); setRevealedRecovery(recoveryCode);
    } catch (e) {
      showToast('שגיאה ביצירת קוד: ' + (e?.message || e), 'error');
    } finally { setBusy(false); }
  };

  const handleDisable = async () => {
    const confirmed = await showConfirm(
      'להשבית הצפנת ענן? מפתחות ה-API יחזרו להישמר בענן ללא הצפנה (גלויים בקונסולת Firebase). המפתחות במכשיר הזה לא נמחקים.',
      { title: 'השבת הצפנת ענן', confirmLabel: 'השבת', tone: 'danger' },
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await deleteCloudCryptoMeta(user);
      setCloudCryptoEnabled(false);
      lockCryptoSession();
      try { await clearCloudDeviceKey(user.uid); } catch { /* ignore */ }
      setDeviceRemembered(false);
      setBundle(null); setUnlocked(false);
      await triggerCloudSync(user, { immediate: true, force: true }); // העלאת גלוי במקום המוצפן
      showToast('הצפנת ענן הושבתה.', 'info');
    } catch (e) {
      showToast('שגיאה בהשבתה: ' + (e?.message || e), 'error');
    } finally { setBusy(false); }
  };

  const card = 'rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/12 dark:bg-white/5';
  const primaryBtn = 'px-5 py-2.5 rounded-xl bg-[var(--wf-accent)] text-[var(--wf-accent-text)] text-[13px] font-extrabold hover:brightness-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed';
  const ghostBtn = 'px-4 py-2.5 rounded-xl bg-slate-50 text-slate-600 border border-slate-200 text-[13px] font-bold hover:bg-slate-100 transition-colors disabled:opacity-50 dark:bg-white/5 dark:text-[#cfe0ef] dark:border-white/12';
  const label = 'block text-[12px] font-bold text-slate-500 mb-1.5 dark:text-[#8ba3bd]';

  // הסבר קבוע בראש
  const intro = (
    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 mb-5 dark:bg-white/5 dark:border-white/10">
      <p className="text-[13px] text-slate-600 leading-relaxed dark:text-[#cfe0ef]">
        הצפנת קצה-לקצה מגנה על מפתחות ה-API שלך כשהם מסתנכרנים לענן: הם נשמרים מעורבבים,
        וניתנים לפענוח רק עם סיסמת ההצפנה שלך. <b>הסיסמה לא נשמרת בשום מקום</b> — גם לא אצלנו.
        במכשיר חדש תתבקש להקליד אותה פעם אחת.
      </p>
    </div>
  );

  if (!authReady) return <div className="text-[14px] text-slate-500 dark:text-[#8ba3bd]">טוען…</div>;

  if (!user) {
    return (
      <div>
        {intro}
        <div className={card}>
          <div className="text-[15px] font-extrabold text-slate-800 mb-2 dark:text-[#f1f6fb]">🔌 צריך חיבור לענן</div>
          <p className="text-[13px] text-slate-500 leading-relaxed dark:text-[#8ba3bd]">
            התחבר לחשבון הענן (דרך תפריט המשתמש בראש המסך) כדי להפעיל הצפנה ולסנכרן מפתחות בין מכשירים.
          </p>
        </div>
      </div>
    );
  }

  if (loadingMeta) return <div className="text-[14px] text-slate-500 dark:text-[#8ba3bd]">בודק מצב הצפנה…</div>;

  // קוד שחזור מוצג (אחרי הפעלה/יצירה מחדש) — חוסם עד אישור
  if (revealedRecovery) {
    return (
      <div>
        {intro}
        <RecoveryCodeCard code={revealedRecovery} onClose={() => setRevealedRecovery(null)} />
      </div>
    );
  }

  // לא הופעל עדיין
  if (!bundle) {
    return (
      <div>
        {intro}
        <div className={card}>
          <div className="text-[15px] font-extrabold text-slate-800 mb-1 dark:text-[#f1f6fb]">הפעלת הצפנת ענן</div>
          <p className="text-[13px] text-slate-500 leading-relaxed mb-4 dark:text-[#8ba3bd]">
            בחר סיסמת הצפנה. תקבל קוד שחזור לשמירה. ⚠️ אם תשכח את שניהם — המפתחות בענן יאבדו ותצטרך להזין אותם מחדש.
          </p>
          <div className="grid gap-3 max-w-md">
            <div>
              <label className={label}>סיסמת הצפנה (לפחות {MIN_PASSPHRASE_LEN} תווים)</label>
              <PassphraseField value={setupPass} onChange={setSetupPass} placeholder="סיסמה" />
            </div>
            <div>
              <label className={label}>אימות סיסמה</label>
              <PassphraseField value={setupPass2} onChange={setSetupPass2} placeholder="שוב" />
            </div>
            <div>
              <button type="button" onClick={handleEnable} disabled={busy} className={primaryBtn}>
                {busy ? 'מפעיל…' : '🔒 הפעל הצפנה'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // הופעל אבל נעול
  if (!unlocked) {
    return (
      <div>
        {intro}
        <div className={card}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[15px] font-extrabold text-slate-800 dark:text-[#f1f6fb]">🔐 נעול</span>
            <span className="text-[11px] font-bold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5 dark:bg-amber-400/15 dark:text-amber-200">הצפנה פעילה</span>
          </div>
          <p className="text-[13px] text-slate-500 leading-relaxed mb-4 dark:text-[#8ba3bd]">
            הקלד את סיסמת ההצפנה כדי לטעון את המפתחות מהענן למכשיר הזה.
          </p>

          {!showForgot && (
            <div className="grid gap-3 max-w-md">
              <PassphraseField value={unlockPass} onChange={setUnlockPass} placeholder="סיסמת הצפנה" autoFocus />
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleUnlock} disabled={busy || !unlockPass} className={primaryBtn}>
                  {busy ? 'פותח…' : 'פתח'}
                </button>
                <button type="button" onClick={() => setShowForgot(true)} className="text-[12px] font-bold text-indigo-600 hover:underline dark:text-[#2dd4bf]">
                  שכחתי את הסיסמה
                </button>
              </div>
            </div>
          )}

          {showForgot && !recoveryVerified && (
            <div className="grid gap-3 max-w-md">
              <label className={label}>הקלד את קוד השחזור</label>
              <input value={recoveryInput} onChange={(e) => setRecoveryInput(e.target.value)} dir="ltr"
                placeholder="XXXXX-XXXXX-…"
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-[14px] text-slate-800 outline-none focus:ring-2 focus:ring-indigo-100 dark:bg-white/5 dark:border-white/12 dark:text-[#f1f6fb]" />
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleRecoveryVerify} disabled={busy || !recoveryInput} className={primaryBtn}>
                  {busy ? 'מאמת…' : 'אמת קוד'}
                </button>
                <button type="button" onClick={() => { setShowForgot(false); setRecoveryInput(''); }} className="text-[12px] font-bold text-slate-400 hover:underline dark:text-[#8ba3bd]">
                  חזור
                </button>
              </div>
            </div>
          )}

          {showForgot && recoveryVerified && (
            <div className="grid gap-3 max-w-md">
              <div className="text-[13px] font-bold text-emerald-700 dark:text-emerald-300">✓ הקוד אומת. קבע סיסמה חדשה:</div>
              <div>
                <label className={label}>סיסמה חדשה (לפחות {MIN_PASSPHRASE_LEN} תווים)</label>
                <PassphraseField value={changePass} onChange={setChangePass} placeholder="סיסמה חדשה" />
              </div>
              <div>
                <label className={label}>אימות</label>
                <PassphraseField value={changePass2} onChange={setChangePass2} placeholder="שוב" />
              </div>
              <button type="button" onClick={handleRecoverySetNewPass} disabled={busy} className={primaryBtn}>
                {busy ? 'שומר…' : 'קבע סיסמה חדשה'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // הופעל ופתוח
  return (
    <div className="flex flex-col gap-5">
      {intro}
      <div className={card}>
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-extrabold text-slate-800 dark:text-[#f1f6fb]">🔓 פעיל ופתוח</span>
          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5 dark:bg-emerald-400/15 dark:text-emerald-200">מפתחות מוצפנים בענן</span>
        </div>
        <p className="text-[13px] text-slate-500 leading-relaxed mt-2 dark:text-[#8ba3bd]">
          מפתחות ה-API מוצפנים לפני שהם עולים לענן. הסנכרון בין מכשירים פעיל.
        </p>
      </div>

      <div className={card}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[14px] font-extrabold text-slate-800 dark:text-[#f1f6fb]">💻 מכשיר זה</span>
          <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${deviceRemembered ? 'text-emerald-700 bg-emerald-100 dark:bg-emerald-400/15 dark:text-emerald-200' : 'text-slate-500 bg-slate-100 dark:bg-white/10 dark:text-[#8ba3bd]'}`}>
            {deviceRemembered ? 'נפתח אוטומטית' : 'דורש סיסמה'}
          </span>
        </div>
        <p className="text-[12px] text-slate-500 mb-3 leading-relaxed dark:text-[#8ba3bd]">
          {deviceRemembered
            ? 'המפתח שמור מקומית (מוגן ע״י מערכת ההפעלה/הדפדפן) — האפליקציה נפתחת בלי לבקש סיסמה, גם אחרי עדכון גרסה. במכשיר חדש עדיין תידרש הסיסמה.'
            : 'הפעלת זכירה תשמור את המפתח במכשיר הזה כדי שלא תתבקש סיסמה בכל פתיחה.'}
        </p>
        <button type="button" onClick={deviceRemembered ? forgetThisDevice : rememberThisDevice} disabled={busy || !unlocked} className={ghostBtn}>
          {deviceRemembered ? 'שכח מכשיר זה' : 'זכור במכשיר הזה'}
        </button>
      </div>

      <div className={card}>
        <div className="text-[14px] font-extrabold text-slate-800 mb-3 dark:text-[#f1f6fb]">🔑 שינוי סיסמה</div>
        {!showChange ? (
          <button type="button" onClick={() => setShowChange(true)} className={ghostBtn}>שנה סיסמת הצפנה</button>
        ) : (
          <div className="grid gap-3 max-w-md">
            <div>
              <label className={label}>סיסמה חדשה (לפחות {MIN_PASSPHRASE_LEN} תווים)</label>
              <PassphraseField value={changePass} onChange={setChangePass} placeholder="סיסמה חדשה" />
            </div>
            <div>
              <label className={label}>אימות</label>
              <PassphraseField value={changePass2} onChange={setChangePass2} placeholder="שוב" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={handleChangePassphrase} disabled={busy} className={primaryBtn}>{busy ? 'שומר…' : 'עדכן סיסמה'}</button>
              <button type="button" onClick={() => { setShowChange(false); setChangePass(''); setChangePass2(''); }} className={ghostBtn}>ביטול</button>
            </div>
          </div>
        )}
      </div>

      <div className={card}>
        <div className="text-[14px] font-extrabold text-slate-800 mb-1 dark:text-[#f1f6fb]">🗝️ קוד שחזור</div>
        <p className="text-[12px] text-slate-500 mb-3 dark:text-[#8ba3bd]">אם איבדת את קוד השחזור או שאתה חושד שנחשף — צור חדש. הישן יפסיק לעבוד.</p>
        <button type="button" onClick={handleRotateRecovery} disabled={busy} className={ghostBtn}>צור קוד שחזור חדש</button>
      </div>

      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-400/30 dark:bg-rose-400/10">
        <div className="text-[14px] font-extrabold text-rose-800 mb-1 dark:text-rose-200">השבתת הצפנה</div>
        <p className="text-[12px] text-rose-700 mb-3 leading-relaxed dark:text-rose-200/80">
          מפתחות ה-API יחזרו להישמר בענן ללא הצפנה. המפתחות במכשיר הזה לא יימחקו.
        </p>
        <button type="button" onClick={handleDisable} disabled={busy}
          className="px-5 py-2.5 rounded-xl bg-rose-600 text-white text-[13px] font-extrabold hover:bg-rose-500 transition-colors disabled:opacity-50">
          {busy ? 'משבית…' : 'השבת הצפנת ענן'}
        </button>
      </div>
    </div>
  );
}

// ─── FileMenu ראשי ───
export default function FileMenu({ onClose, onCommand, shortcuts, onShortcutsChange, assistantBehavior, onAssistantBehaviorChange, wordPreferences, onWordPreferencesChange, initialSettingsTab = null, updateCheckToken = 0, lastGenerationAction = null, liveGeneration = null }) {
  const normalizeVisibleSettingsTab = (tab = '') => {
    const t = tab === 'agents' ? 'ai' : (tab || 'ai');
    if (t === 'assistant') return 'sidebar';
    if (t === 'debug') return 'developer';
    return t;
  };
  const [activePanel, setActivePanel] = useState(initialSettingsTab ? 'settings' : 'main');
  const [settingsTab, setSettingsTab] = useState(normalizeVisibleSettingsTab(initialSettingsTab));
  const [settingsSearchQuery, setSettingsSearchQuery] = useState('');
  const [settingsSearchOpen, setSettingsSearchOpen] = useState(false);
  const openedDirectlyInSettings = Boolean(initialSettingsTab);
  const onboardingSessionActiveRef = useRef(initialSettingsTab === 'onboarding');
  const [config, setConfig] = useState(getProviderConfig);
  const [shortcutsState, setShortcutsState] = useState(shortcuts || getShortcutsConfig());
  const [assistantBehaviorState, setAssistantBehaviorState] = useState(assistantBehavior || getAssistantBehavior());
  const [wordPrefsState, setWordPrefsState] = useState(wordPreferences || getWordPreferences());
  const [presentationPrefsState, setPresentationPrefsState] = useState(getPresentationPreferences());
  const [spssPrefsState, setSpssPrefsState] = useState(getSpssPreferences());
  const [personalStyleState, setPersonalStyleState] = useState(getPersonalStyleProfile());
  const personalStyleStateRef = useRef(getPersonalStyleProfile());
  const skipNextPersonalStylePersistRef = useRef(false);
  const [sharedInstructionsState, setSharedInstructionsState] = useState(getSharedAgentInstructions());
  const [skillsState, setSkillsState] = useState(getSkillsConfig());
  const [roleAgents, setRoleAgents] = useState(getRoleAgents());
  const [workspaceAutomationState, setWorkspaceAutomationState] = useState(getWorkspaceAutomation());
  const [saved, setSaved] = useState(false);
  const didHydrate = useRef(false);
  const settingsPersistTimerRef = useRef(null);
  const externalAnalysisAutoRef = useRef('');
  const [inlineUpdateState, setInlineUpdateState] = useState({ status: 'idle', message: '' });
  const [externalAnalysisBusy, setExternalAnalysisBusy] = useState(false);
  const [consumedUpdateCheckToken, setConsumedUpdateCheckToken] = useState(0);
  const pendingUpdateCheckToken = updateCheckToken > consumedUpdateCheckToken ? updateCheckToken : 0;
  const inferredExternalProviderId = deriveExternalAnalysisProviderId(config);
  const normalizedSettingsSearch = normalizeSettingsSearchValue(settingsSearchQuery);
  const settingsSearchTokens = normalizedSettingsSearch ? normalizedSettingsSearch.split(' ').filter(Boolean) : [];
  const settingsSearchResults = settingsSearchTokens.length
    ? SETTINGS_TAB_SEARCH_INDEX.filter((entry) => (entry.id !== 'updates' || isDesktopApp()) && settingsSearchTokens.every((token) => entry.searchText.includes(token)))
    : [];
  // טאב העדכונים רלוונטי רק לאפליקציית הדסקטופ — באתר מסתירים אותו מהרייל ומהחיפוש.
  const visibleSettingsGroups = SETTINGS_TAB_GROUPS
    .map((group) => ({
      ...group,
      tabs: group.tabs.filter(([id]) => id !== 'updates' || isDesktopApp()),
    }))
    .filter((group) => group.tabs.length);
  const activeSettingsTabLabel = (SETTINGS_TAB_GROUPS.flatMap((group) => group.tabs).find(([id]) => id === settingsTab) || [])[1] || '';
  const activeSettingsTabMeta = SETTINGS_TAB_META[settingsTab] || null;

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
      setSettingsTab(normalizeVisibleSettingsTab(initialSettingsTab));
      if (initialSettingsTab === 'onboarding') onboardingSessionActiveRef.current = true;
    }
  }, [initialSettingsTab]);

  useEffect(() => {
    if (settingsTab === 'agents') {
      setSettingsTab('ai');
      return;
    }
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

  const persistSettingsSnapshot = (shouldSkipPersonalStylePersist = false) => {
    const normalizedPersonalStyle = mergePersonalStyleForSave(personalStyleState);
    const persistedComparableProfile = buildComparablePersonalStyleProfile(getPersonalStyleProfile());
    const nextComparableProfile = buildComparablePersonalStyleProfile(normalizedPersonalStyle);
    const shouldPersistPersonalStyle = !shouldSkipPersonalStylePersist
      && JSON.stringify(persistedComparableProfile) !== JSON.stringify(nextComparableProfile);

    saveProviderConfig(config);
    saveShortcutsConfig(shortcutsState);
    saveAssistantBehavior(assistantBehaviorState);
    saveWordPreferences(wordPrefsState);
    savePresentationPreferences(presentationPrefsState);
    saveSpssPreferences(spssPrefsState);
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
    setTimeout(() => setSaved(false), 1200);
  };

  useEffect(() => {
    if (!didHydrate.current) {
      didHydrate.current = true;
      return;
    }

    const shouldSkipPersonalStylePersist = skipNextPersonalStylePersistRef.current;
    skipNextPersonalStylePersistRef.current = false;

    if (settingsPersistTimerRef.current) {
      clearTimeout(settingsPersistTimerRef.current);
    }

    settingsPersistTimerRef.current = setTimeout(() => {
      persistSettingsSnapshot(shouldSkipPersonalStylePersist);
    }, 350);

    return () => {
      if (settingsPersistTimerRef.current) {
        clearTimeout(settingsPersistTimerRef.current);
        settingsPersistTimerRef.current = null;
      }
    };
  }, [config, shortcutsState, assistantBehaviorState, wordPrefsState, presentationPrefsState, spssPrefsState, personalStyleState, sharedInstructionsState, skillsState, roleAgents, workspaceAutomationState, onShortcutsChange, onAssistantBehaviorChange, onWordPreferencesChange]);

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
    if (settingsPersistTimerRef.current) {
      clearTimeout(settingsPersistTimerRef.current);
      settingsPersistTimerRef.current = null;
      persistSettingsSnapshot(false);
    }
    onClose();
  };

  const closeSettingsPanel = () => {
    maybePostponeOnboardingSession();
    if (settingsPersistTimerRef.current) {
      clearTimeout(settingsPersistTimerRef.current);
      settingsPersistTimerRef.current = null;
      persistSettingsSnapshot(false);
    }
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
            {isDesktopApp() && (
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

            )}

            {isDesktopApp() && inlineUpdateState.status === 'available' && (
              <div className="px-4">
                <button
                  className="text-[10px] bg-yellow-400/20 border border-yellow-400/40 text-yellow-300 px-2 py-0.5 rounded-lg hover:bg-yellow-400/40 transition-colors"
                  onClick={() => { setActivePanel('settings'); setSettingsTab('updates'); }}>
                  פרטים והתקנה
                </button>
              </div>
            )}

          <button
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-white bg-indigo-500/20 border border-indigo-500/30 hover:bg-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/10 transition-all w-full text-right group mt-2 outline-none focus:ring-2 focus:ring-indigo-400/50"
            onClick={() => { setActivePanel('settings'); setSettingsTab('developer'); }}>
            <i className="ph-fill ph-sliders-horizontal text-lg text-indigo-300 group-hover:text-white transition-colors" />
            <span className="font-bold text-[13px]">הגדרות מתקדמות</span>
          </button>
        </div>

        </div>
        
        <div className="px-4 pb-4 pt-2">
            <div className="mb-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] font-semibold text-slate-400">
              <a href="legal/privacy.html" target="_blank" rel="noopener noreferrer" className="hover:text-white">פרטיות</a>
              <a href="legal/terms.html" target="_blank" rel="noopener noreferrer" className="hover:text-white">תנאי שימוש</a>
              <a href="legal/accessibility.html" target="_blank" rel="noopener noreferrer" className="hover:text-white">נגישות</a>
            </div>
            <button className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-slate-400 bg-black/20 hover:text-white hover:bg-black/40 transition-colors w-full outline-none focus:ring-1 focus:ring-indigo-400/50" onClick={closeFileMenu}>
              <i className="ph ph-x text-sm" />
              <span className="font-semibold text-xs">חזור לעריכה</span>
            </button>
        </div>

        <div className="pb-4 text-center text-[10px] text-slate-600 font-mono tracking-wider opacity-60">
          WordFlow {APP_VERSION_LABEL || 'OS'}
        </div>
      </div>

      {/* ─── Settings Popup Modal ─── */}
      {activePanel === 'settings' && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-md transition-opacity duration-200" onClick={closeSettingsPanel}>
          <div className={`${settingsTab === 'onboarding' ? 'bg-transparent w-full max-w-[1400px] h-[95vh] border-none shadow-none' : 'wf-settings-modal bg-slate-50 w-full max-w-[1280px] h-[90vh] sm:h-[85vh] rounded-[24px] shadow-2xl border border-slate-200/60'} flex flex-col overflow-hidden`} onClick={e => e.stopPropagation()}>
             {/* POPUP HEADER — עיצוב linen: gear tile + חיפוש-פקודה + סגירה */}
             <div className="relative z-30 bg-white px-5 sm:px-6 py-3.5 border-b border-slate-200 flex items-center gap-4 shadow-sm shrink-0 dark:bg-[#0a1422] dark:border-white/10">
                <div className="flex items-center gap-3 shrink-0">
                    <div className="w-[42px] h-[42px] rounded-[13px] grid place-items-center"
                         style={{ background: 'linear-gradient(145deg, var(--wf-accent), var(--wf-accent-strong))', boxShadow: '0 8px 20px color-mix(in srgb, var(--wf-accent) 38%, transparent)' }}>
                        <span className="text-[20px] leading-none">⚙️</span>
                    </div>
                    <div className="leading-tight">
                        <h2 className="text-[19px] font-extrabold text-slate-800 tracking-tight dark:text-[#f1f6fb]">הגדרות</h2>
                        {settingsTab !== 'onboarding' && (activeSettingsTabMeta?.title || activeSettingsTabLabel) && (
                          <div className="text-[12px] text-slate-400 font-semibold mt-0.5 dark:text-[#8ba3bd]">{activeSettingsTabMeta?.title || activeSettingsTabLabel}</div>
                        )}
                    </div>
                </div>

                {/* חיפוש מהיר — קפיצה לכל טאב */}
                {settingsTab !== 'onboarding' && (
                  <div className="relative flex-1 max-w-[520px] mx-auto hidden sm:block">
                    <div className="relative">
                      <span className="absolute top-1/2 -translate-y-1/2 text-[15px] text-slate-400 pointer-events-none dark:text-[#8ba3bd]" style={{ insetInlineStart: 13 }}>🔍</span>
                      <input
                        type="text"
                        dir="auto"
                        value={settingsSearchQuery}
                        onChange={(e) => { setSettingsSearchQuery(e.target.value); setSettingsSearchOpen(true); }}
                        onFocus={() => setSettingsSearchOpen(true)}
                        placeholder="חיפוש מהיר — קפיצה לכל הגדרה…"
                        className="w-full text-[14px] font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-[13px] py-[11px] outline-none transition focus:border-[var(--wf-accent)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--wf-accent)_16%,transparent)] dark:text-[#eaf2fb] dark:bg-white/5 dark:border-white/12"
                        style={{ paddingInlineStart: 40, paddingInlineEnd: 40 }}
                      />
                      <span className="absolute top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 border border-slate-200 rounded-md px-[7px] py-[2px] pointer-events-none dark:text-[#8ba3bd] dark:border-white/12" style={{ insetInlineEnd: 12 }}>⌘K</span>
                    </div>
                    {settingsSearchOpen && settingsSearchTokens.length > 0 && (
                      <>
                        <div className="absolute left-0 right-0 max-h-[340px] overflow-auto bg-white border border-slate-200 rounded-2xl shadow-2xl p-[7px] z-40 custom-scrollbar-slim dark:bg-[#0f1d2e] dark:border-white/10" style={{ top: 'calc(100% + 8px)' }}>
                          {settingsSearchResults.length === 0 ? (
                            <div className="px-3 py-4 text-center text-[13px] text-slate-400 dark:text-[#8ba3bd]">לא נמצאו הגדרות תואמות ל״{settingsSearchQuery}״</div>
                          ) : (() => {
                            const seen = new Set();
                            return settingsSearchResults.filter((e) => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
                          })().map((entry) => {
                            const meta = SETTINGS_TAB_META[entry.id] || {};
                            return (
                              <button key={entry.id} type="button"
                                onClick={() => { setSettingsTab(entry.id); setSettingsSearchQuery(''); setSettingsSearchOpen(false); }}
                                className="w-full flex items-center gap-3 text-right rounded-xl px-3 py-2.5 transition-colors hover:bg-indigo-50 dark:hover:bg-white/5">
                                <span className="shrink-0 w-8 h-8 rounded-[9px] grid place-items-center text-[16px]" style={{ background: 'color-mix(in srgb, var(--wf-accent) 14%, transparent)' }}>{meta.icon || '⚙️'}</span>
                                <span className="flex-1 min-w-0">
                                  <span className="block text-[13.5px] font-bold text-slate-800 dark:text-[#eaf2fb] truncate">{meta.title || entry.label}</span>
                                  <span className="block text-[11.5px] text-slate-400 dark:text-[#8ba3bd] truncate">{entry.groupTitle}</span>
                                </span>
                                <span className="shrink-0 text-[13px] text-slate-400 dark:text-[#8ba3bd]">↵</span>
                              </button>
                            );
                          })}
                        </div>
                        <div onClick={() => setSettingsSearchOpen(false)} className="fixed inset-0 z-[35]" />
                      </>
                    )}
                  </div>
                )}

                <button onClick={closeSettingsPanel} className="shrink-0 w-10 h-10 bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 rounded-full flex items-center justify-center transition-colors outline-none focus:ring-2 focus:ring-rose-200 dark:bg-white/10 dark:text-[#8ba3bd] dark:hover:bg-rose-500/20 dark:hover:text-rose-200">
                    <i className="ph ph-x text-lg font-bold" />
                </button>
             </div>

             {settingsTab === 'onboarding' ? (
               /* Onboarding — מסך immersive ללא רייל/footer */
               <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 bg-slate-50/50 custom-scrollbar-slim">
                 <OnboardingTabContainer
                   profile={personalStyleState}
                   setProfile={setPersonalStyleDraftState}
                   persistProfile={persistPersonalStyleDraft}
                   setProviderConfig={setConfig}
                   externalAnalysisBusy={externalAnalysisBusy}
                   providerConfig={config}
                   onOpenAiSettings={() => setSettingsTab('ai')}
                   onOpenPersonalStyle={() => setSettingsTab('personal')}
                   onOpenSecuritySettings={() => setSettingsTab('security')}
                   onDismiss={closeSettingsPanel}
                   onSubmitExternalAnalysis={() => runExternalAnalysisProcessing({ source: 'manual' })}
                 />
               </div>
             ) : (
             /* פריסת דו-פאנל: רייל ניווט + תוכן עם footer דביק */
             <div className="flex-1 flex flex-col md:flex-row min-h-0">
                {/* ─── NAV RAIL ─── */}
                <aside className="w-full md:w-64 shrink-0 bg-[var(--wf-rail)] border-b md:border-b-0 md:border-l border-slate-200 flex flex-col min-h-0 max-h-[40vh] md:max-h-none dark:border-white/10">
                  <nav className="flex-1 overflow-y-auto p-3 sm:p-4 flex flex-col gap-4 custom-scrollbar-slim">
                    {visibleSettingsGroups.map((group) => (
                      <div key={group.title}>
                        <div className="px-2.5 mb-2 text-[10.5px] font-extrabold text-slate-400 tracking-[0.12em] uppercase dark:text-[#7e96b0]">{group.title}</div>
                        <div className="flex flex-col gap-1">
                          {group.tabs.map(([id, label]) => {
                            const sp = label.indexOf(' ');
                            const ic = sp > 0 ? label.slice(0, sp) : '';
                            const tx = sp > 0 ? label.slice(sp + 1) : label;
                            const active = settingsTab === id;
                            return (
                              <button key={id} onClick={() => setSettingsTab(id)}
                                className={`w-full flex items-center gap-3 text-right px-3 py-2.5 rounded-xl text-[13.5px] font-semibold transition-all outline-none focus:ring-2 ${active ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 focus:ring-indigo-200 dark:bg-[#2dd4bf] dark:text-[#06231f] dark:shadow-[#2dd4bf]/20 dark:focus:ring-[#2dd4bf]/30' : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 focus:ring-slate-100 dark:text-[#cfe0ef] dark:hover:bg-white/5 dark:hover:text-[#2dd4bf] dark:focus:ring-white/10'}`}>
                                <span className="w-[22px] text-center text-[16px] leading-none shrink-0">{ic}</span>
                                <span className="flex-1 text-right">{tx}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </nav>
                </aside>

                {/* ─── CONTENT + STICKY FOOTER ─── */}
                <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50 dark:bg-transparent">
                  <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 custom-scrollbar-slim">
                    {/* כותרת העמוד — אייקון, כותרת ותיאור לכל טאב (עיצוב linen) */}
                    {activeSettingsTabMeta && (
                      <div className="mb-5 px-1">
                        <h1 className="m-0 flex items-center gap-3 text-[26px] sm:text-[30px] font-extrabold tracking-tight text-slate-800 dark:text-[#f1f6fb]">
                          <span className="text-[24px] leading-none">{activeSettingsTabMeta.icon}</span>{activeSettingsTabMeta.title}
                        </h1>
                        <p className="mt-2 max-w-[70ch] text-[14px] leading-relaxed text-slate-400 dark:text-[#8ba3bd]">{activeSettingsTabMeta.desc}</p>
                      </div>
                    )}
                    {/* wf-settings-pane מפעיל "סקין" כהה/linen כללי על תוכן הפאנלים (tailwind.css) */}
                    <div className="wf-settings-pane bg-white rounded-3xl p-5 sm:p-8 border border-slate-200 shadow-sm dark:bg-[#0f1d2e] dark:border-white/10 dark:shadow-black/30">
                      {settingsTab === 'guide'       && <GuideSettings activeTab={settingsTab} onNavigate={setSettingsTab} />}
                      {settingsTab === 'ai'          && <AiSettings config={config} setConfig={setConfig} />}
                      {settingsTab === 'media'       && <MediaVisualsSettings config={config} setConfig={setConfig} />}
                      {settingsTab === 'sidebar'     && (
                        <div className="flex flex-col gap-8">
                          <div>
                            <div className="text-[15px] font-extrabold text-slate-800 mb-3 flex items-center gap-2"><span>✨</span>התנהגות העוזר</div>
                            <AssistantBehaviorSettings behavior={assistantBehaviorState} setBehavior={setAssistantBehaviorState} />
                          </div>
                          <div className="border-t border-slate-100 pt-7">
                            <div className="text-[15px] font-extrabold text-slate-800 mb-3 flex items-center gap-2"><span>💬</span>מצבי הצ׳אט בחלונית</div>
                            <SidebarPanelSettings behavior={assistantBehaviorState} setBehavior={setAssistantBehaviorState} config={config} />
                          </div>
                        </div>
                      )}
                      {settingsTab === 'prompt'      && <PromptSettings sharedInstructions={sharedInstructionsState} setSharedInstructions={setSharedInstructionsState} personalStyle={personalStyleState} setPersonalStyle={setPersonalStyleState} onNavigate={setSettingsTab} />}
                      {settingsTab === 'skills'      && <SkillsSettings skillsState={skillsState} setSkillsState={setSkillsState} />}
                      {settingsTab === 'workspaceV2' && <WorkspaceV2Settings config={config} />}
                      {settingsTab === 'security'    && <SecuritySettings />}
                      {settingsTab === 'updates'     && (
                        <UpdateSettings
                          checkToken={pendingUpdateCheckToken}
                          onCheckTokenConsumed={(token) => setConsumedUpdateCheckToken((prev) => Math.max(prev, Number(token) || 0))}
                        />
                      )}
                      {settingsTab === 'developer'   && (
                        <div className="flex flex-col gap-8">
                          <div>
                            <div className="text-[15px] font-extrabold text-slate-800 mb-3 flex items-center gap-2"><span>🛠️</span>כלים מתקדמים</div>
                            <DeveloperSettings config={config} setConfig={setConfig} automation={workspaceAutomationState} setAutomation={setWorkspaceAutomationState} setAgents={setRoleAgents} assistantBehavior={assistantBehaviorState} setAssistantBehavior={setAssistantBehaviorState} wordPrefs={wordPrefsState} setWordPrefs={setWordPrefsState} lastGenerationAction={lastGenerationAction} liveGeneration={liveGeneration} />
                          </div>
                          <div className="border-t border-slate-100 pt-7">
                            <div className="text-[15px] font-extrabold text-slate-800 mb-3 flex items-center gap-2"><span>🪵</span>קונסולת לוגים</div>
                            <DebugConsoleSettings automation={workspaceAutomationState} />
                          </div>
                        </div>
                      )}
                      {settingsTab === 'writing'     && <WordDefaultsSettings prefs={wordPrefsState} setPrefs={setWordPrefsState} />}
                      {settingsTab === 'presentation' && <PresentationDefaultsSettings prefs={presentationPrefsState} setPrefs={setPresentationPrefsState} />}
                      {settingsTab === 'spss'        && <SpssDefaultsSettings prefs={spssPrefsState} setPrefs={setSpssPrefsState} />}
                      {settingsTab === 'personal'    && <PersonalStyleSettings profile={personalStyleState} setProfile={setPersonalStyleState} />}
                      {settingsTab === 'appearance'  && <AppearanceSettings />}
                    </div>
                  </div>

                  {/* Sticky Footer */}
                  <div className="shrink-0 flex flex-wrap gap-3 items-center justify-end bg-white border-t border-slate-200 px-4 sm:px-6 py-3.5 shadow-[0_-2px_8px_rgba(0,0,0,0.04)] dark:bg-[#0a1422] dark:border-white/10">
                    <div className="flex-1 text-[12px] text-slate-400 font-semibold px-2 min-w-0 dark:text-[#7e96b0]">
                       * שינויים מוחלים בלחיצה על שמירה.
                    </div>
                    <button onClick={closeSettingsPanel}
                      className="px-6 py-2.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-xl cursor-pointer text-[13px] sm:text-[14px] font-bold hover:bg-slate-100 transition-colors shadow-sm focus:ring-2 focus:ring-slate-200 outline-none dark:bg-white/5 dark:text-[#cfe0ef] dark:border-white/12 dark:hover:bg-white/10">
                      בטל וחזור לתפריט
                    </button>
                    <button onClick={handleSave}
                      style={!saved ? { boxShadow: '0 10px 22px color-mix(in srgb, var(--wf-accent) 30%, transparent)' } : undefined}
                      className={`px-8 py-2.5 rounded-xl cursor-pointer text-[13px] sm:text-[14px] font-extrabold transition-all shadow-md outline-none focus:ring-2 ${saved ? 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 shadow-emerald-600/30 focus:ring-emerald-200' : 'bg-[var(--wf-accent)] hover:brightness-105 text-[var(--wf-accent-text)] border border-[var(--wf-accent)] focus:ring-[color-mix(in_srgb,var(--wf-accent)_30%,transparent)]'}`}>
                      {saved ? '✓ עודכן בהצלחה!' : 'שמור והחל שינויים'}
                    </button>
                  </div>
                </div>
             </div>
             )}
          </div>
        </div>
      )}
    </div>
  );
}





