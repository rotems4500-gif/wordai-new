import { GoogleGenerativeAI } from "@google/generative-ai";
import { DOMSerializer } from "@tiptap/pm/model";
import { AGENTS_CONFIG } from "../agentConfig";

// Personal style seed – loaded at runtime from disk, not bundled
const personalStyleSeed = {};

// ═══════════════════════════════════════
// Provider Config
// ═══════════════════════════════════════

export const DEFAULT_PROVIDER_CONFIG = {
  active: 'gemini',
  activeProviders: ['gemini'],
  multiModelEnabled: false,
  gemini:     { key: '', model: 'gemini-2.5-flash' },
  openai:     { key: '', model: 'gpt-4o' },
  claude:     { key: '', model: 'claude-sonnet-4-6' },
  groq:       { key: '', model: 'llama-3.3-70b-versatile' },
  ollama:     { baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' },
  perplexity: { key: '', model: 'sonar-pro' },
  custom:     { name: '', baseUrl: '', key: '', model: '' },
  scholar:    { key: '', provider: 'serpapi' },
  toolLinks: {
    googleSearch: { label: 'חיפוש גוגל', url: 'https://www.google.com/search?q={query}' },
    scholar: { label: 'Google Scholar', url: 'https://scholar.google.com/scholar?q={query}' },
    modelHub: { label: 'מודל', url: 'https://aistudio.google.com/' },
    orbit: { label: 'Orbit', url: 'https://orbit.livemind-app.com/' },
  },
};

export const DEFAULT_SHORTCUTS = {
  toggleAssistant: 'Ctrl+Shift+A',
  magicWand: 'Ctrl+Space',
  openFileMenu: 'Alt+F',
  saveLocal: 'Ctrl+S',
};

export const DEFAULT_ASSISTANT_BEHAVIOR = {
  autoPopup: true,
  idleSeconds: 5,
};

export const DEFAULT_WORD_PREFERENCES = {
  checkSpellingAsYouType: true,
  markGrammarAsYouType: true,
  grammarWithSpelling: true,
  replaceSelectionOnType: true,
  selectWholeWord: true,
  allowDragDropEditing: true,
  ctrlClickOpensLinks: true,
  showPasteOptions: true,
  smartCutPaste: true,
  showDrawings: true,
  showTextHighlighting: true,
  printBackgrounds: true,
  updateFieldsBeforePrint: true,
  savePreview: true,
  allowBackgroundSave: true,
  openAttachmentsInApp: true,
  showStartExperience: true,
  defaultFontFamily: 'Alef',
  defaultFontSize: '12pt',
  autoSave: true,
  autoSaveMinutes: 10,
  keepLastAutosavedVersion: true,
  aiQuickActions: {
    fix: true,
    humanize: true,
    summary: true,
    academic: true,
    organize: true,
    textToTable: true,
    expand: true,
    translate: true,
    bullets: true,
    shorter: true,
    continue: true,
    intro: true,
    conclusion: true,
    sources: true,
  },
};

export const DEFAULT_PERSONAL_STYLE = {
  manualVocabulary: [],
  manualPhrases: [],
  preferredSentenceStructures: [],
  paragraphPreferences: '',
  tonePreferences: [],
  learnedVocabulary: [],
  learnedPhrases: [],
  learnedVocabularyCounts: {},
  learnedPhraseCounts: {},
  protectedVocabulary: [],
  protectedPhrases: [],
  examples: [],
  notes: '',
  displayName: '',
  institutionName: '',
  studyTrack: '',
  currentCourses: [],
  userRole: '',
  additionalContext: '',
  defaultDocumentStyle: 'academic',
  preferredHomeStyleIds: ['academic'],
  customStyleGuidance: '',
  learningGameAnswers: {},
  learningGameInsights: [],
  learningGamesCompletedAt: '',
  styleTrainingSummary: '',
  preferredTrainingExamples: [],
  dislikedStylePatterns: [],
    linguisticRegisterPreference: '',
  autoLearnedFromEditorAt: '',
  lastAutoLearnedSignature: '',
  autoLearnedVocabularyCounts: {},
  autoLearnedPhraseCounts: {},
  userBackground: '',
  writingGoals: '',
  defaultAudience: '',
  preferredDocumentTypes: [],
  formatPreferences: '',
  learningConsent: false,
  onboardingCompletedAt: '',
  onboardingDismissedAt: '',
  onboardingSnoozedUntil: '',
  onboardingVersion: 1,
  learnedNotes: [],
  learnedSentencePatterns: [],
  preferredConnectors: [],
  preferredSentenceOpeners: [],
  toneDescriptors: [],
  sentenceLengthPreference: '',
  paragraphLengthPreference: '',
  styleFingerprint: {},
  scannedSourceIds: [],
  scanStats: {
    totalKnown: 0,
    totalScanned: 0,
    newlyScanned: 0,
    pendingCount: 0,
    lastScanAt: '',
  },
  academic_level: 'undergraduate',
  last_updated: '',
  ...personalStyleSeed,
};

export const DEFAULT_WORKSPACE_AUTOMATION = {
  enabled: false,
  preset: 'content-studio',
  workflowMode: 'manager-auto',
  onlyFromMaterials: false,
  autoDispatch: true,
  autopilotEnabled: true,
  circularWorkflowEnabled: false,
  circularMinRounds: 1,
  circularMaxRounds: 2,
  workspaceName: 'סביבת עבודה מותאמת',
  sharedGoal: '',
  retryEnabled: true,
  maxRetries: 2,
  requestTimeoutMs: 45,
  showProgress: true,
  activeWorkspaceId: 'default-content-studio',
};

export const DEFAULT_WORKSPACES_LIBRARY = {
  'default-content-studio': {
    id: 'default-content-studio',
    name: 'סטודיו תוכן (ברירת מחדל)',
    automation: {
      enabled: true,
      preset: 'content-studio',
      workflowMode: 'manager-auto',
      autoDispatch: true,
      autopilotEnabled: true,
      workspaceName: 'סטודיו תוכן',
      circularWorkflowEnabled: false,
      circularMinRounds: 1,
      circularMaxRounds: 2,
      sharedGoal: '',
      retryEnabled: true,
      maxRetries: 2,
      requestTimeoutMs: 45,
      showProgress: true,
    },
    agents: DEFAULT_ROLE_AGENTS,
    lastModified: new Date().toISOString(),
  },
};

export const SKILL_LIBRARY = [
  {
    id: 'style-guardian',
    label: 'שומר סגנון אישי',
    description: 'שומר על טון, ניסוח ואופי כתיבה עקבי לפי ההעדפות שנלמדו.',
    usageHint: 'שכתוב, ליטוש, התאמת טון וניסוח',
    prompt: 'פעל כשומר הסגנון האישי של המשתמש. שמור על הטון, אורך המשפטים, הבהירות והניסוחים המועדפים עליו. אל תשנה את הכוונה המקורית ואל תוסיף מלל מנופח.',
    keywords: ['שכתב', 'ניסוח', 'סגנון', 'טון', 'תחדד', 'ליטוש', 'אנושי', 'מקצועי'],
  },
  {
    id: 'template-autopilot',
    label: 'טייס תבניות ודפי שער',
    description: 'בוחר מבנה, דף שער ותבנית מתאימים למסמך החדש.',
    usageHint: 'דפי שער, מסמכים רשמיים ותבניות',
    prompt: 'פעל כטייס תבניות. כשנבנה מסמך חדש, ארגן אותו בתבנית ברורה, בחר מבנה מתאים, והצע דף שער ושדות מסודרים בלי להכביד על המשתמש.',
    keywords: ['תבנית', 'דף שער', 'שער', 'כותרת', 'מסמך רשמי', 'תבנית מסמך'],
  },
  {
    id: 'academic-structure',
    label: 'בונה שלד אקדמי',
    description: 'מייצר מבנה ברור לעבודות, מאמרים, סיכומים והצעות מחקר.',
    usageHint: 'עבודות אקדמיות, מאמרים וסיכומים',
    prompt: 'פעל כבונה שלד אקדמי. סדר את התוכן למבוא, גוף, כותרות משנה, מעבר לוגי ומסקנה. אם חסר מידע, הצע שלד ברור במקום להמציא תוכן.',
    keywords: ['עבודה', 'אקדמי', 'מאמר', 'סמינר', 'סיכום', 'הצעת מחקר', 'שלד'],
  },
  {
    id: 'source-hunter',
    label: 'צייד מקורות אקדמיים',
    description: 'מכוון לאיתור מקורות, מילות חיפוש וחוקרים רלוונטיים.',
    usageHint: 'Google Scholar, חיפוש מקורות ומחקר',
    prompt: 'פעל כחוקר מקורות אקדמיים. התמקד בהצעת כיווני מחקר, מילות חיפוש, חוקרים, ומסלולי חיפוש אמינים. אל תמציא ציטוטים או מאמרים שלא קיימים.',
    keywords: ['מקור', 'מקורות', 'גוגל סקולר', 'google scholar', 'מחקר', 'מאמרים', 'חוקרים'],
  },
  {
    id: 'citation-weaver',
    label: 'אורג ציטוטים חכם',
    description: 'מסייע לשלב ציטוטים וביבליוגרפיה בפורמט עקבי.',
    usageHint: 'APA, MLA, ביבליוגרפיה והערות שוליים',
    prompt: 'פעל כאורג ציטוטים. כשמבקשים לשלב מקורות, סדר ציטוטים בתוך הטקסט ובנה רשימת מקורות עקבית וזהירה. אם חסר מקור אמיתי, כתוב זאת במפורש.',
    keywords: ['ציטוט', 'ביבליוגרפיה', 'apa', 'mla', 'הערת שוליים', 'מקורות בטקסט'],
  },
  {
    id: 'consistency-checker',
    label: 'בודק עקביות מסמך',
    description: 'מאתר חוסר אחידות במבנה, ניסוח, כותרות ומונחים.',
    usageHint: 'בדיקת אחידות ושיפור מסמך קיים',
    prompt: 'פעל כבודק עקביות מסמך. חפש חוסר אחידות בכותרות, מונחים, זמנים, סגנון, טון ועימוד, והצע תיקונים ממוקדים.',
    keywords: ['בדוק', 'אחידות', 'עקביות', 'שגיאות', 'בקרת איכות', 'יישור קו'],
  },
  {
    id: 'draft-from-materials',
    label: 'בונה טיוטה מחומרי עזר',
    description: 'הופך נושא, חומרים וקבצים לטיוטה ראשונה מסודרת.',
    usageHint: 'יצירת טיוטה ראשונה מחומרים שהועלו',
    prompt: 'פעל כבונה טיוטה מחומרי עזר. קח נושא, מסמכי רקע והנחיות קיימות, וחבר מהם טיוטה מסודרת עם סדר לוגי, בלי להעתיק חומר גלם כמו שהוא.',
    keywords: ['טיוטה', 'מחומרי עזר', 'מחומרים', 'קבצים', 'תבנה מסמך', 'תכתוב מסמך'],
  },
  {
    id: 'final-submission',
    label: 'מצב הגשה סופית',
    description: 'מבצע מעבר אחרון לפני הגשה: שפה, מבנה, מקורות ודגלים אדומים.',
    usageHint: 'בדיקה אחרונה לפני מסירה או הגשה',
    prompt: 'פעל במצב הגשה סופית. בצע בדיקה אחרונה של בהירות, שגיאות, מבנה, עקביות, ורשימת נקודות שעדיין דורשות תשומת לב לפני שליחה.',
    keywords: ['הגשה', 'סופי', 'בדיקה אחרונה', 'לפני שליחה', 'לפני הגשה'],
  },
];

export const DEFAULT_SKILLS_CONFIG = {
  defaultSkillId: 'style-guardian',
  autoApplyDefault: false,
  skills: Object.fromEntries(SKILL_LIBRARY.map((skill) => [skill.id, {
    mode: skill.id === 'style-guardian' ? 'auto' : 'manual',
    customInstruction: '',
    customKeywords: [],
  }])),
};

export const DEFAULT_ROLE_AGENTS = [
  {
    id: 'manager',
    name: 'מנהל עבודה',
    prompt: 'נהל את המשימה כמו ראש צוות. פרק את הבקשה לשלבים, קבע סדר עבודה בין הסוכנים, שמור על מטרה ברורה, ובסוף החזר למשתמש תוצאה מרוכזת וישימה בעברית.',
    provider: '',
    model: '',
    enabled: true,
  },
  {
    id: 'designer',
    name: 'מעצב מבנה',
    prompt: 'בנה שלד, זרימה, כותרות, היררכיה וסדר פסקאות למסמך. חשוב על חוויית קריאה, בהירות ומבנה משכנע. ענה בעברית.',
    provider: '',
    model: '',
    enabled: true,
  },
  {
    id: 'writer',
    name: 'כותב תוכן',
    prompt: 'כתוב ושכתב טקסטים בעברית מקצועית, בהירה ומשכנעת. תן עדיפות עליונה למה שהמשתמש ביקש ולחומרי העזר שסיפק — ההגדרות המובנות (תבנית, קהל, מסלול) משמשות כרקע בלבד ולא מחליפות את המטלה. החזר תמיד HTML מעוצב עם תגיות <h1>, <h2>, <h3>, <p>, <ul>, <ol>, <strong> לפי הצורך — אל תחזיר גוש טקסט רציף ללא מבנה.',
    provider: '',
    model: '',
    enabled: true,
  },
  {
    id: 'researcher',
    name: 'חוקר מקורות',
    prompt: 'עזור באיסוף כיווני מחקר, שאלות, מילות חיפוש ומקורות רלוונטיים. כשאין ודאות אל תמציא. ענה בעברית מסודרת.',
    provider: '',
    model: '',
    enabled: true,
  },
  {
    id: 'proofreader',
    name: 'מגיה סופי',
    prompt: 'בצע ליטוש סופי: כתיב, פיסוק, בהירות, אחידות סגנונית ודיוק. שמור על כוונת הכותב והחזר נוסח מתוקן בעברית.',
    provider: '',
    model: '',
    enabled: true,
  },
];

const KNOWN_PROVIDER_IDS = ['gemini', 'openai', 'claude', 'groq', 'perplexity', 'ollama', 'custom'];
const KNOWN_SKILL_IDS = SKILL_LIBRARY.map((skill) => skill.id);
const PROVIDER_TAG_PATTERNS = [
  { provider: 'gemini', regex: /(^|\s)@(?:gemini|גימיני)(?::([^\s@]+))?/gi },
  { provider: 'claude', regex: /(^|\s)@(?:claude|קלוד)(?::([^\s@]+))?/gi },
  { provider: 'openai', regex: /(^|\s)@(?:openai|gpt|chatgpt)(?::([^\s@]+))?/gi },
  { provider: 'groq', regex: /(^|\s)@(?:groq|גרוק)(?::([^\s@]+))?/gi },
  { provider: 'perplexity', regex: /(^|\s)@(?:perplexity|פרפלקסיטי)(?::([^\s@]+))?/gi },
  { provider: 'ollama', regex: /(^|\s)@(?:ollama|אולמה)(?::([^\s@]+))?/gi },
  { provider: 'custom', regex: /(^|\s)@(?:custom|מותאם)(?::([^\s@]+))?/gi },
];

const readJsonFromStorage = (key, fallback) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const PERSISTED_APP_SETTINGS_KEYS = [
  'wordai_shortcuts',
  'wordai_assistant_behavior',
  'wordai_skills_config',
  'wordai_word_preferences',
  'wordai_personal_style',
  'wordai_workspace_automation',
  'wordai_workspaces_library',
  'wordai_shared_agent_instructions',
  'wordai_role_agents',
  'wordai_home_instructions',
  'wordai_saved_docs_history',
  'wordflow_home_customizations',
  'wordflow_style_overrides',
  'default-font',
  'default-size',
  'wordai_document_style',
  'wordai_active_template',
  'citation-style',
  'bib-sources',
];

const hasMeaningfulStoredValue = (value = '') => {
  const clean = String(value ?? '').trim();
  return Boolean(clean) && !['{}', '[]', 'null', 'undefined'].includes(clean);
};

export const syncPersistedAppSettings = () => {
  if (typeof window === 'undefined' || !window.desktopApp?.saveAppSettings) return;

  try {
    const snapshot = {};
    PERSISTED_APP_SETTINGS_KEYS.forEach((key) => {
      const value = localStorage.getItem(key);
      if (value !== null) snapshot[key] = value;
    });
    window.desktopApp.saveAppSettings(snapshot).catch(() => {});
  } catch {}
};

let appSettingsHydrationPromise = null;

export const hydrateAppSettingsFromDisk = async () => {
  if (typeof window === 'undefined' || !window.desktopApp?.loadAppSettings) return {};
  if (appSettingsHydrationPromise) return appSettingsHydrationPromise;

  appSettingsHydrationPromise = (async () => {
    try {
      const diskState = await window.desktopApp.loadAppSettings();
      if (!diskState || typeof diskState !== 'object' || diskState.ok === false) {
        syncPersistedAppSettings();
        return {};
      }

      PERSISTED_APP_SETTINGS_KEYS.forEach((key) => {
        const incoming = diskState[key];
        if (typeof incoming !== 'string' || !hasMeaningfulStoredValue(incoming)) return;
        const current = localStorage.getItem(key);
        if (!hasMeaningfulStoredValue(current)) {
          localStorage.setItem(key, incoming);
        }
      });

      try {
        window.dispatchEvent(new CustomEvent('wordai-settings-hydrated'));
      } catch {}

      syncPersistedAppSettings();
      return diskState;
    } catch {
      return {};
    }
  })();

  return appSettingsHydrationPromise;
};

const normalizeProviderIds = (value, fallback = DEFAULT_PROVIDER_CONFIG.active) => {
  const values = Array.isArray(value) ? value : [value];
  const normalized = [...new Set(values.map((item) => String(item || '').trim()).filter((item) => KNOWN_PROVIDER_IDS.includes(item)))];
  if (!normalized.length && fallback && KNOWN_PROVIDER_IDS.includes(fallback)) normalized.push(fallback);
  return normalized;
};

const normalizeProviderModelName = (providerId = '', modelName = '') => {
  const clean = String(modelName || '').trim();
  const provider = String(providerId || '').trim();
  if (!clean) return '';

  const aliasMap = {
    claude: {
      'claude-3-5-sonnet': 'claude-sonnet-4-6',
      'claude-3.5-sonnet': 'claude-sonnet-4-6',
      'claude-3-5-sonnet-20241022': 'claude-sonnet-4-6',
      'claude-3-5-sonnet-20240620': 'claude-sonnet-4-6',
      'claude-3-opus-20240229': 'claude-sonnet-4-6',
      'claude-3-sonnet-20240229': 'claude-sonnet-4-6',
      'claude-3-haiku-20240307': 'claude-haiku-4-5',
      'claude-sonnet-4-20250514': 'claude-sonnet-4-6',
    },
    perplexity: {
      'sonar-large': 'sonar-pro',
      'sonar-small': 'sonar',
      'sonar-medium': 'sonar-pro',
      'llama-3.1-sonar-large-128k-online': 'sonar-pro',
      'llama-3.1-sonar-small-128k-online': 'sonar',
      'llama-3.1-sonar-large-128k-chat': 'sonar-pro',
    },
  };

  return aliasMap[provider]?.[clean] || clean;
};

const normalizeToolLinkEntry = (entry = {}, fallback = {}) => {
  const label = String(entry?.label || fallback?.label || '').trim() || String(fallback?.label || '').trim();
  let url = String(entry?.url || fallback?.url || '').trim() || String(fallback?.url || '').trim();
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url.replace(/^\/+/, '')}`;
  return { label, url };
};

let providerConfigCache = null;

const resolveToolLinksConfigSource = (cfg = null) => {
  if (cfg && typeof cfg === 'object') return cfg;
  if (providerConfigCache && typeof providerConfigCache === 'object') return providerConfigCache;
  try {
    const stored = typeof localStorage !== 'undefined'
      ? JSON.parse(localStorage.getItem('ai_provider_config') || '{}')
      : {};
    return { ...DEFAULT_PROVIDER_CONFIG, ...(stored || {}) };
  } catch {
    return DEFAULT_PROVIDER_CONFIG;
  }
};

export const getToolLinksConfig = (cfg = null) => {
  const source = resolveToolLinksConfigSource(cfg);
  return {
    googleSearch: normalizeToolLinkEntry(source?.toolLinks?.googleSearch, DEFAULT_PROVIDER_CONFIG.toolLinks.googleSearch),
    scholar: normalizeToolLinkEntry(source?.toolLinks?.scholar, DEFAULT_PROVIDER_CONFIG.toolLinks.scholar),
    modelHub: normalizeToolLinkEntry(source?.toolLinks?.modelHub, DEFAULT_PROVIDER_CONFIG.toolLinks.modelHub),
    orbit: normalizeToolLinkEntry(source?.toolLinks?.orbit, DEFAULT_PROVIDER_CONFIG.toolLinks.orbit),
  };
};

export const buildExternalToolUrl = (toolId = '', query = '', cfg = null) => {
  const safeCfg = cfg && typeof cfg === 'object' ? cfg : getProviderConfig();
  const tool = getToolLinksConfig(safeCfg)?.[toolId];
  if (!tool?.url) return '';

  const cleanQuery = String(query || '').trim();
  const scholarKey = String(safeCfg?.scholar?.key || '').trim();

  let resolvedUrl = String(tool.url)
    .replace(/\{query\}/g, cleanQuery ? encodeURIComponent(cleanQuery) : '')
    .replace(/\{serpapiKey\}/g, encodeURIComponent(scholarKey))
    .replace(/\{scholarKey\}/g, encodeURIComponent(scholarKey));

  if (cleanQuery && !resolvedUrl.includes(encodeURIComponent(cleanQuery)) && !/\{query\}/.test(String(tool.url))) {
    try {
      const parsed = new URL(resolvedUrl);
      if (!parsed.searchParams.has('q')) parsed.searchParams.set('q', cleanQuery);
      resolvedUrl = parsed.toString();
    } catch {
      resolvedUrl = `${resolvedUrl}${resolvedUrl.includes('?') ? '&' : '?'}q=${encodeURIComponent(cleanQuery)}`;
    }
  }

  return resolvedUrl;
};

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

const isProviderConfiguredForUse = (providerId, cfg) => {
  const provider = cfg?.[providerId] || {};
  switch (providerId) {
    case 'gemini':
    case 'openai':
    case 'claude':
    case 'groq':
    case 'perplexity':
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

const extractTaggedModelRouting = (text = '') => {
  const originalText = String(text || '');
  let cleanText = originalText;
  const matches = [];

  PROVIDER_TAG_PATTERNS.forEach(({ provider, regex }) => {
    const scopedRegex = new RegExp(regex.source, regex.flags);
    let match;
    while ((match = scopedRegex.exec(originalText)) !== null) {
      matches.push({
        provider,
        index: match.index,
        fullMatch: match[0],
        prefix: match[1] || ' ',
        modelName: String(match[2] || '').trim(),
      });
    }
  });

  matches.sort((a, b) => a.index - b.index);

  const taggedProviders = [];
  const providerModels = {};
  let taggedModel = '';

  matches.forEach(({ provider, fullMatch, prefix, modelName }) => {
    cleanText = cleanText.replace(fullMatch, prefix || ' ');
    if (!taggedProviders.includes(provider)) taggedProviders.push(provider);
    if (modelName) {
      providerModels[provider] = modelName;
      if (!taggedModel) taggedModel = modelName;
    }
  });

  return {
    cleanText: cleanText.replace(/\s{2,}/g, ' ').trim(),
    taggedProviders,
    taggedModel,
    providerModels,
  };
};

export const getShortcutsConfig = () => ({
  ...DEFAULT_SHORTCUTS,
  ...readJsonFromStorage('wordai_shortcuts', {}),
});

export const saveShortcutsConfig = (config) => {
  localStorage.setItem('wordai_shortcuts', JSON.stringify({ ...DEFAULT_SHORTCUTS, ...config }));
  syncPersistedAppSettings();
};

export const getAssistantBehavior = () => ({
  ...DEFAULT_ASSISTANT_BEHAVIOR,
  ...readJsonFromStorage('wordai_assistant_behavior', {}),
});

export const saveAssistantBehavior = (config) => {
  localStorage.setItem('wordai_assistant_behavior', JSON.stringify({ ...DEFAULT_ASSISTANT_BEHAVIOR, ...config }));
  syncPersistedAppSettings();
};

const normalizeSkillMode = (value = '') => {
  const clean = String(value || '').trim().toLowerCase();
  return ['manual', 'auto', 'off'].includes(clean) ? clean : 'manual';
};

const normalizeSkillText = (value = '', limit = 1600) => String(value || '').trim().slice(0, limit);

const normalizeSkillKeywords = (value = []) => {
  const raw = Array.isArray(value) ? value.join(',') : String(value || '');
  return [...new Set(raw.split(/[\n,•]+/).map((item) => item.trim()).filter(Boolean))].slice(0, 20);
};

export const getSkillCatalog = () => SKILL_LIBRARY.map((skill) => ({ ...skill }));

export const getSkillsConfig = () => {
  const stored = readJsonFromStorage('wordai_skills_config', {});
  const skills = {};

  SKILL_LIBRARY.forEach((skill) => {
    skills[skill.id] = {
      mode: normalizeSkillMode(stored.skills?.[skill.id]?.mode || DEFAULT_SKILLS_CONFIG.skills?.[skill.id]?.mode || 'manual'),
      customInstruction: normalizeSkillText(stored.skills?.[skill.id]?.customInstruction || ''),
      customKeywords: normalizeSkillKeywords(stored.skills?.[skill.id]?.customKeywords || []),
    };
  });

  const defaultSkillId = KNOWN_SKILL_IDS.includes(String(stored.defaultSkillId || ''))
    ? String(stored.defaultSkillId)
    : DEFAULT_SKILLS_CONFIG.defaultSkillId;

  return {
    ...DEFAULT_SKILLS_CONFIG,
    ...stored,
    defaultSkillId,
    autoApplyDefault: stored.autoApplyDefault === true,
    skills,
  };
};

export const saveSkillsConfig = (config = {}) => {
  const current = getSkillsConfig();
  const next = {
    defaultSkillId: KNOWN_SKILL_IDS.includes(String(config.defaultSkillId || current.defaultSkillId || ''))
      ? String(config.defaultSkillId || current.defaultSkillId)
      : DEFAULT_SKILLS_CONFIG.defaultSkillId,
    autoApplyDefault: config.autoApplyDefault === true,
    skills: {},
  };

  SKILL_LIBRARY.forEach((skill) => {
    next.skills[skill.id] = {
      mode: normalizeSkillMode(config.skills?.[skill.id]?.mode || current.skills?.[skill.id]?.mode || DEFAULT_SKILLS_CONFIG.skills?.[skill.id]?.mode),
      customInstruction: normalizeSkillText(config.skills?.[skill.id]?.customInstruction || current.skills?.[skill.id]?.customInstruction || ''),
      customKeywords: normalizeSkillKeywords(config.skills?.[skill.id]?.customKeywords || current.skills?.[skill.id]?.customKeywords || []),
    };
  });

  localStorage.setItem('wordai_skills_config', JSON.stringify(next));
  syncPersistedAppSettings();
  return next;
};

export const getWordPreferences = () => ({
  ...DEFAULT_WORD_PREFERENCES,
  ...readJsonFromStorage('wordai_word_preferences', {}),
});

export const saveWordPreferences = (config) => {
  localStorage.setItem('wordai_word_preferences', JSON.stringify({ ...DEFAULT_WORD_PREFERENCES, ...config }));
  syncPersistedAppSettings();
};

export const getPersonalStyleProfile = () => ({
  ...DEFAULT_PERSONAL_STYLE,
  ...readJsonFromStorage('wordai_personal_style', {}),
});

export const savePersonalStyleProfile = (profile) => {
  localStorage.setItem('wordai_personal_style', JSON.stringify({
    ...DEFAULT_PERSONAL_STYLE,
    ...profile,
    last_updated: new Date().toISOString(),
  }));
  syncPersistedAppSettings();
};

const DEFAULT_WORKSPACE_ID = 'default-content-studio';

const sanitizeWorkspaceName = (value = '', fallback = 'סביבה חדשה') => {
  const raw = String(value ?? '');
  if (raw.trim()) return raw;
  return String(fallback || 'סביבה חדשה').trim() || 'סביבה חדשה';
};

const normalizeAgentRecord = (agent = {}, index = 0) => {
  const provider = String(agent.provider || '').trim();
  return {
    id: String(agent.id || `custom-${index + 1}`),
    name: String(agent.name || `סוכן ${index + 1}`).trim() || `סוכן ${index + 1}`,
    prompt: String(agent.prompt || '').trim(),
    provider,
    model: normalizeProviderModelName(provider, String(agent.model || '').trim()),
    enabled: agent.enabled !== false,
  };
};

const cloneAgentRecords = (agents = []) => {
  const source = Array.isArray(agents) ? agents : [];
  return source.map((agent, index) => normalizeAgentRecord(agent, index));
};

const getFallbackRoleAgents = () => cloneAgentRecords(Array.isArray(DEFAULT_ROLE_AGENTS) ? DEFAULT_ROLE_AGENTS : []);

const normalizeWorkspaceAutomationRecord = (automation = {}, workspaceId = DEFAULT_WORKSPACE_ID, workspaceName = '') => {
  const merged = {
    ...DEFAULT_WORKSPACE_AUTOMATION,
    ...(automation && typeof automation === 'object' ? automation : {}),
  };
  merged.activeWorkspaceId = workspaceId;
  merged.workspaceName = sanitizeWorkspaceName(merged.workspaceName || workspaceName || '', 'סביבת עבודה מותאמת');
  return merged;
};

const normalizeWorkspaceRecord = (workspaceId = '', workspace = {}, fallbackName = '') => {
  const safeId = String(workspace?.id || workspaceId || '').trim() || `workspace-${Date.now()}`;
  const safeName = sanitizeWorkspaceName(
    workspace?.name || workspace?.automation?.workspaceName || fallbackName,
    safeId === DEFAULT_WORKSPACE_ID ? 'סטודיו תוכן (ברירת מחדל)' : 'סביבה חדשה'
  );
  const safeAgents = cloneAgentRecords(Array.isArray(workspace?.agents) && workspace.agents.length ? workspace.agents : getFallbackRoleAgents());
  const safeAutomation = normalizeWorkspaceAutomationRecord(workspace?.automation || {}, safeId, safeName);
  return {
    id: safeId,
    name: safeName,
    automation: safeAutomation,
    agents: safeAgents,
    lastModified: workspace?.lastModified || new Date().toISOString(),
  };
};

const persistWorkspacePointer = (partial = {}) => {
  const current = readJsonFromStorage('wordai_workspace_automation', {});
  const next = {
    ...DEFAULT_WORKSPACE_AUTOMATION,
    ...(current && typeof current === 'object' ? current : {}),
    ...(partial && typeof partial === 'object' ? partial : {}),
  };
  next.activeWorkspaceId = String(next.activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  localStorage.setItem('wordai_workspace_automation', JSON.stringify(next));
  return next;
};

const emitWorkspaceChangedEvent = (reason = 'workspace-updated', workspaceId = '') => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') return;
  const automation = getWorkspaceAutomation();
  const activeId = String(workspaceId || automation.activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  const library = getWorkspacesLibrary();
  window.dispatchEvent(new CustomEvent('wordai-workspace-changed', {
    detail: {
      reason,
      workspaceId: activeId,
      workspace: library[activeId] || null,
      automation,
    },
  }));
};

export const getWorkspaceAutomation = () => {
  const baseAutomation = {
    ...DEFAULT_WORKSPACE_AUTOMATION,
    ...readJsonFromStorage('wordai_workspace_automation', {}),
  };
  const library = getWorkspacesLibrary();
  let activeWorkspaceId = String(baseAutomation.activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;

  if (!library[activeWorkspaceId]) {
    activeWorkspaceId = DEFAULT_WORKSPACE_ID;
    persistWorkspacePointer({ activeWorkspaceId });
  }

  const activeWorkspace = library[activeWorkspaceId] || normalizeWorkspaceRecord(DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACES_LIBRARY[DEFAULT_WORKSPACE_ID] || {}, 'סטודיו תוכן (ברירת מחדל)');
  return normalizeWorkspaceAutomationRecord({
    ...baseAutomation,
    ...(activeWorkspace?.automation || {}),
  }, activeWorkspaceId, activeWorkspace?.name || 'סביבת עבודה מותאמת');
};

export const saveWorkspaceAutomation = (config) => {
  const currentAutomation = getWorkspaceAutomation();
  const activeWorkspaceId = String(currentAutomation.activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  const library = getWorkspacesLibrary();
  const workspace = normalizeWorkspaceRecord(activeWorkspaceId, library[activeWorkspaceId] || {}, currentAutomation.workspaceName || 'סביבת עבודה מותאמת');
  const nextWorkspaceName = sanitizeWorkspaceName(
    config?.workspaceName || workspace?.name || workspace?.automation?.workspaceName,
    workspace?.name || 'סביבת עבודה מותאמת'
  );
  const nextAutomation = normalizeWorkspaceAutomationRecord({
    ...workspace.automation,
    ...(config && typeof config === 'object' ? config : {}),
    workspaceName: nextWorkspaceName,
  }, activeWorkspaceId, nextWorkspaceName);

  if (
    String(workspace?.name || '').trim() === nextWorkspaceName
    && JSON.stringify(currentAutomation) === JSON.stringify(nextAutomation)
  ) {
    return currentAutomation;
  }

  library[activeWorkspaceId] = normalizeWorkspaceRecord(activeWorkspaceId, {
    ...workspace,
    name: nextWorkspaceName,
    automation: nextAutomation,
    agents: workspace.agents,
    lastModified: new Date().toISOString(),
  }, nextWorkspaceName);

  saveWorkspacesLibrary(library);
  persistWorkspacePointer(nextAutomation);
  syncPersistedAppSettings();
  emitWorkspaceChangedEvent('workspace-automation-saved', activeWorkspaceId);
  return nextAutomation;
};

export const getWorkspacesLibrary = () => {
  try {
    const stored = readJsonFromStorage('wordai_workspaces_library', {});
    const source = (stored && typeof stored === 'object') ? stored : {};
    const cleaned = {};
    let needsRepair = !stored || typeof stored !== 'object';

    Object.entries(source).forEach(([key, workspace]) => {
      if (!workspace || typeof workspace !== 'object') {
        needsRepair = true;
        return;
      }
      const normalized = normalizeWorkspaceRecord(key, workspace);
      cleaned[normalized.id] = normalized;
      if (
        normalized.id !== key
        || !Array.isArray(workspace.agents)
        || !workspace.automation
        || String(workspace.name ?? '') !== normalized.name
      ) {
        needsRepair = true;
      }
    });

    if (!cleaned[DEFAULT_WORKSPACE_ID]) {
      cleaned[DEFAULT_WORKSPACE_ID] = normalizeWorkspaceRecord(
        DEFAULT_WORKSPACE_ID,
        DEFAULT_WORKSPACES_LIBRARY[DEFAULT_WORKSPACE_ID] || {},
        'סטודיו תוכן (ברירת מחדל)'
      );
      needsRepair = true;
    }

    if (needsRepair) {
      localStorage.setItem('wordai_workspaces_library', JSON.stringify(cleaned));
      syncPersistedAppSettings();
    }

    return cleaned;
  } catch (error) {
    console.error('❌ שגיאה בטעינת ספריית סביבות:', error);
    return {
      [DEFAULT_WORKSPACE_ID]: normalizeWorkspaceRecord(
        DEFAULT_WORKSPACE_ID,
        DEFAULT_WORKSPACES_LIBRARY[DEFAULT_WORKSPACE_ID] || {},
        'סטודיו תוכן (ברירת מחדל)'
      ),
    };
  }
};

export const saveWorkspacesLibrary = (library = {}) => {
  const cleaned = {};
  Object.entries(library || {}).forEach(([key, workspace]) => {
    if (!workspace || typeof workspace !== 'object') return;
    const normalized = normalizeWorkspaceRecord(key, workspace, `סביבה #${Object.keys(cleaned).length + 1}`);
    cleaned[normalized.id] = {
      ...normalized,
      lastModified: new Date().toISOString(),
    };
  });

  if (!cleaned[DEFAULT_WORKSPACE_ID]) {
    cleaned[DEFAULT_WORKSPACE_ID] = normalizeWorkspaceRecord(
      DEFAULT_WORKSPACE_ID,
      DEFAULT_WORKSPACES_LIBRARY[DEFAULT_WORKSPACE_ID] || {},
      'סטודיו תוכן (ברירת מחדל)'
    );
  }

  localStorage.setItem('wordai_workspaces_library', JSON.stringify(cleaned));

  const pointer = readJsonFromStorage('wordai_workspace_automation', {});
  const activeWorkspaceId = String(pointer.activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  if (!cleaned[activeWorkspaceId]) {
    persistWorkspacePointer({ activeWorkspaceId: DEFAULT_WORKSPACE_ID });
  }

  syncPersistedAppSettings();
  return cleaned;
};

export const createNewWorkspace = (name = '', basePresetId = 'content-studio') => {
  const library = getWorkspacesLibrary();
  const presets = getWorkspaceAgentPresets();
  const basePreset = presets[basePresetId] || presets['content-studio'];
  const baseName = sanitizeWorkspaceName(name || basePreset?.label || 'סביבה חדשה', 'סביבה חדשה');
  const seedId = `workspace-${Date.now()}`;
  let newId = seedId;
  while (library[newId]) {
    newId = `${seedId}-${Math.floor(Math.random() * 1000)}`;
  }

  const nextWorkspace = normalizeWorkspaceRecord(newId, {
    id: newId,
    name: baseName,
    automation: {
      ...DEFAULT_WORKSPACE_AUTOMATION,
      ...(basePreset?.automation || {}),
      workspaceName: baseName,
      preset: basePresetId || basePreset?.automation?.preset || 'content-studio',
      activeWorkspaceId: newId,
    },
    agents: cloneAgentRecords(basePreset?.agents || getFallbackRoleAgents()),
    lastModified: new Date().toISOString(),
  }, baseName);

  library[newId] = nextWorkspace;
  saveWorkspacesLibrary(library);
  emitWorkspaceChangedEvent('workspace-created', newId);
  return newId;
};

export const deleteWorkspace = (workspaceId) => {
  const targetId = String(workspaceId || '').trim();
  if (!targetId || targetId === DEFAULT_WORKSPACE_ID) return false;

  const library = getWorkspacesLibrary();
  if (!library[targetId]) return false;

  const wasActive = String(getWorkspaceAutomation().activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() === targetId;

  delete library[targetId];
  saveWorkspacesLibrary(library);

  if (wasActive) {
    switchToWorkspace(DEFAULT_WORKSPACE_ID);
  } else {
    emitWorkspaceChangedEvent('workspace-deleted', targetId);
  }
  return true;
};

export const switchToWorkspace = (workspaceId) => {
  const targetId = String(workspaceId || '').trim();
  if (!targetId) return false;

  const library = getWorkspacesLibrary();
  if (!library[targetId]) {
    console.error(`❌ סביבת עבודה לא נמצאה: ${targetId}`);
    return false;
  }

  const workspace = normalizeWorkspaceRecord(targetId, library[targetId], library[targetId]?.name || targetId);
  library[targetId] = workspace;
  saveWorkspacesLibrary(library);

  const automationSnapshot = normalizeWorkspaceAutomationRecord(workspace.automation || {}, targetId, workspace.name);
  persistWorkspacePointer(automationSnapshot);
  localStorage.setItem('wordai_role_agents', JSON.stringify(cloneAgentRecords(workspace.agents || [])));
  syncPersistedAppSettings();

  const verifyAutomation = getWorkspaceAutomation();
  if (verifyAutomation.activeWorkspaceId === targetId) {
    emitWorkspaceChangedEvent('workspace-switched', targetId);
    return true;
  }
  console.error(`❌ המעבר נכשל! צפוי: ${targetId}, בפועל: ${verifyAutomation.activeWorkspaceId}`);
  return false;
};

export const updateCurrentWorkspace = (updates = {}) => {
  const automation = getWorkspaceAutomation();
  const workspaceId = String(automation.activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  const library = getWorkspacesLibrary();
  const workspace = normalizeWorkspaceRecord(workspaceId, library[workspaceId] || {}, automation.workspaceName || 'סביבת עבודה מותאמת');

  if (!workspace) {
    console.error(`❌ לא ניתן לעדכן סביבה לא קיימת: ${workspaceId}`);
    return false;
  }

  const nextName = sanitizeWorkspaceName(updates?.name || workspace?.name, workspace?.name || 'סביבה חדשה');
  const nextAutomation = normalizeWorkspaceAutomationRecord({
    ...workspace.automation,
    ...(updates?.automation && typeof updates.automation === 'object' ? updates.automation : {}),
    ...(updates?.workspaceName ? { workspaceName: updates.workspaceName } : {}),
  }, workspaceId, nextName);
  const nextAgents = updates?.agents ? cloneAgentRecords(updates.agents) : cloneAgentRecords(workspace.agents || []);

  const updatedWorkspace = normalizeWorkspaceRecord(workspaceId, {
    ...workspace,
    ...(updates && typeof updates === 'object' ? updates : {}),
    name: nextName,
    automation: nextAutomation,
    agents: nextAgents,
    lastModified: new Date().toISOString(),
  }, nextName);

  library[workspaceId] = updatedWorkspace;
  saveWorkspacesLibrary(library);

  persistWorkspacePointer({
    ...nextAutomation,
    activeWorkspaceId: workspaceId,
  });

  if (updates?.agents) {
    localStorage.setItem('wordai_role_agents', JSON.stringify(nextAgents));
  }

  syncPersistedAppSettings();
  emitWorkspaceChangedEvent('workspace-updated', workspaceId);
  return true;
};

// פונקציית עזר לדיבוג - מציגה מידע על הסביבה הפעילה
export const debugWorkspaceInfo = () => {
  const automation = getWorkspaceAutomation();
  const library = getWorkspacesLibrary();
  const agents = getRoleAgents();
  
  console.group('🔍 מידע סביבת עבודה נוכחית');
  console.log('🏢 סביבה פעילה:', automation.activeWorkspaceId);
  console.log('📊 מצב זרימת עבודה:', automation.workflowMode);
  console.log('🏷️ שם סביבה:', automation.workspaceName || 'ללא שם');
  console.log('🤖 כמות סוכנים:', agents.length);
  console.log('📁 כמות סביבות זמינות:', Object.keys(library).length);
  
  if (agents.length > 0) {
    console.log('👥 סוכנים פעילים:', agents.map(a => a.name).join(', '));
  }
  
  console.groupEnd();
  
  return {
    automation,
    library,
    agents,
    totalWorkspaces: Object.keys(library).length,
    totalAgents: agents.length,
  };
};

export const getSharedAgentInstructions = () => String(localStorage.getItem('wordai_shared_agent_instructions') || '').trim();

export const saveSharedAgentInstructions = (value = '') => {
  localStorage.setItem('wordai_shared_agent_instructions', String(value || '').trim());
  syncPersistedAppSettings();
};

export const getRoleAgents = () => {
  const automation = getWorkspaceAutomation();
  const workspaceId = String(automation.activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  const library = getWorkspacesLibrary();
  const workspace = library[workspaceId];

  if (workspace && Array.isArray(workspace.agents) && workspace.agents.length) {
    return cloneAgentRecords(workspace.agents);
  }

  const stored = readJsonFromStorage('wordai_role_agents', null);
  if (Array.isArray(stored) && stored.length) {
    return cloneAgentRecords(stored);
  }

  return getFallbackRoleAgents();
};

export const saveRoleAgents = (agents) => {
  const cleanAgents = cloneAgentRecords(Array.isArray(agents) ? agents : []);

  localStorage.setItem('wordai_role_agents', JSON.stringify(cleanAgents));
  updateCurrentWorkspace({ agents: cleanAgents });
  return cleanAgents;
};

// הצגת כל הסביבות הזמינות
export const listAllWorkspaces = () => {
  const library = getWorkspacesLibrary();
  const automation = getWorkspaceAutomation();
  
  console.group('🌍 כל סביבות העבודה הזמינות');
  
  Object.entries(library).forEach(([id, workspace]) => {
    const isActive = automation.activeWorkspaceId === id;
    const prefix = isActive ? '▶️' : '⚪';
    console.log(`${prefix} ${id}: ${workspace.name || workspace.automation?.workspaceName || 'ללא שם'} (${workspace.agents?.length || 0} סוכנים)`);
  });
  
  console.groupEnd();
  
  return library;
};

// יצוא הפונקציות החדשות לחלונית
export const getOrderedRoleAgents = (workflowMode = getWorkspaceAutomation().workflowMode) => {
  const agents = getRoleAgents().filter((agent) => agent.enabled !== false);
  if (workflowMode === 'custom-order') return agents;

  const desiredOrders = {
    'manager-auto': ['manager', 'researcher', 'designer', 'writer', 'proofreader'],
    'circular-team': ['manager', 'researcher', 'designer', 'writer', 'proofreader'],
    'manager-pipeline': ['manager', 'researcher', 'designer', 'writer', 'proofreader'],
    'design-first': ['designer', 'manager', 'writer', 'researcher', 'proofreader'],
    'research-first': ['researcher', 'manager', 'designer', 'writer', 'proofreader'],
  };

  const order = desiredOrders[workflowMode];
  if (!order) return agents;

  const getRank = (agent) => {
    const id = String(agent.id || '').toLowerCase();
    const index = order.findIndex((item) => id.includes(item));
    return index === -1 ? 999 : index;
  };

  return [...agents].sort((a, b) => getRank(a) - getRank(b));
};

const WORKSPACE_AGENT_PRESETS = {
  'content-studio': {
    label: 'סטודיו תוכן',
    description: 'מנהל עבודה אוטומטי, מעצב מבנה, כותב, חוקר ומגיה.',
    automation: { enabled: true, preset: 'content-studio', workflowMode: 'manager-auto', autoDispatch: true },
    agents: DEFAULT_ROLE_AGENTS,
  },
  'academic-lab': {
    label: 'צוות אקדמי',
    description: 'מתאים לעבודות, סמינרים וסיכומים פורמליים עם מנהל עבודה אוטומטי.',
    automation: { enabled: true, preset: 'academic-lab', workflowMode: 'manager-auto', autoDispatch: true },
    agents: [
      { id: 'manager', name: 'מנהל עבודה אקדמי', prompt: 'פרק את המשימה האקדמית לשלבים ברורים: חקר, מבנה, כתיבה וליטוש. שמור על דיוק והחזר תכנית קצרה ותוצר ישים.', provider: '', model: '', enabled: true },
      { id: 'researcher', name: 'חוקר ספרות', prompt: 'אתר כיווני חיפוש, מילות מפתח, סוגי מקורות והקשרים מחקריים רלוונטיים. אל תמציא פרטים.', provider: '', model: '', enabled: true },
      { id: 'designer', name: 'בונה שלד אקדמי', prompt: 'בנה מבנה אקדמי עם מבוא, גוף, דיון וסיכום. הקפד על רצף טיעוני והיררכיית כותרות.', provider: '', model: '', enabled: true },
      { id: 'writer', name: 'כותב אקדמי', prompt: 'כתוב בעברית אקדמית, פורמלית ומדויקת, בהתאם לסגנון המשתמש. הימנע מהמצאות.', provider: '', model: '', enabled: true },
      { id: 'proofreader', name: 'מגיה אקדמי', prompt: 'בצע ליטוש סופי של ניסוח, בהירות, פיסוק ואחידות אקדמית.', provider: '', model: '', enabled: true },
    ],
  },
  'academic-dual-research': {
    label: 'אקדמי מאומת - Claude מוביל',
    description: 'קלוד מנהל, Perplexity מחקר אקדמי, Gemini מחקר משלים, כתיבה ובקרה סופית עם הפניות למקורות.',
    automation: { enabled: true, preset: 'academic-dual-research', workflowMode: 'custom-order', autoDispatch: true, autopilotEnabled: false },
    agents: [
      {
        id: 'manager',
        name: 'מנהל עבודה - Claude',
        prompt: 'פעל כמנהל העבודה הראשי. פרק את המטלה לשלבים ברורים לפי ההנחיות, קבע מה בדיוק צריך לאסוף, ומהם הקריטריונים לעבודה מוצלחת לפני כתיבה.',
        provider: 'claude',
        model: '',
        enabled: true,
      },
      {
        id: 'researcher-academic',
        name: 'אוסף מחקר אקדמי - Perplexity',
        prompt: 'אסוף חומרים מחקריים ואקדמיים בלבד: מושגי יסוד, כיווני חיפוש, מקורות אמינים, ציטוטים רלוונטיים וקישורים. אל תמציא מקורות. ציין תמיד מאיפה הגיע כל ממצא.',
        provider: 'perplexity',
        model: '',
        enabled: true,
      },
      {
        id: 'researcher-general',
        name: 'אוסף משלים - Gemini',
        prompt: 'אסוף מידע משלים שאינו אקדמי גרידא: הקשרים, דוגמאות, ניסוחים, וסיכום תובנות. אל תמציא עובדות או מקורות, וסמן בבירור מה מקור כל טענה.',
        provider: 'gemini',
        model: '',
        enabled: true,
      },
      {
        id: 'writer',
        name: 'כותב העבודה - Claude',
        prompt: 'כתוב את העבודה לפי ההנחיות בלבד ועל בסיס החומרים שנאספו בשלבים הקודמים. שלב הפניות ברורות לכל פסקה משמעותית וציין בסוף רשימת מקורות מסודרת לפי מה שנאסף בפועל.',
        provider: 'claude',
        model: '',
        enabled: true,
      },
      {
        id: 'manager-review',
        name: 'בקרת התאמה - Claude',
        prompt: 'בצע ביקורת סופית כמנהל עבודה: בדוק שהעבודה עומדת בהנחיות, שהמבנה נכון, שאין טענות לא מבוססות, ושיש הפניות מספקות למקורות. החזר הערות ותיקוני חובה אם צריך.',
        provider: 'claude',
        model: '',
        enabled: true,
      },
    ],
  },
  'product-desk': {
    label: 'צוות מוצר',
    description: 'מתאים למסמכי אפיון, רעיונות ותוכן שיווקי.',
    automation: { enabled: true, preset: 'product-desk', workflowMode: 'design-first', autoDispatch: true },
    agents: [
      { id: 'manager', name: 'מנהל מוצר', prompt: 'הגדר מטרה, קהל יעד, תוצרים וסדר עבודה. החזר תוכנית קצרה ותעדוף ברור.', provider: '', model: '', enabled: true },
      { id: 'designer', name: 'מעצב חוויה', prompt: 'בנה מבנה מסמך חד וברור, כותרות נכונות וזרימת קריאה ידידותית.', provider: '', model: '', enabled: true },
      { id: 'writer', name: 'קופירייטר', prompt: 'כתוב תוכן ברור, משכנע וקריא, עם פתיחות חזקות ומעברים טובים.', provider: '', model: '', enabled: true },
      { id: 'researcher', name: 'אנליסט שוק', prompt: 'הצע זוויות מחקר, השוואות, שאלות ותובנות מבוססות עבור מסמכי מוצר.', provider: '', model: '', enabled: true },
      { id: 'proofreader', name: 'עורך סופי', prompt: 'לטש את המסר, קצב הקריאה, הבהירות והעברית.', provider: '', model: '', enabled: true },
    ],
  },
  'custom-workspace': {
    label: 'סביבה מותאמת אישית',
    description: 'בנה צוות סוכנים משלך עם תפקידים, מודלים, הוראות וסדר עבודה ייעודיים.',
    automation: { enabled: true, preset: 'custom-workspace', workflowMode: 'custom-order', autoDispatch: true },
    agents: DEFAULT_ROLE_AGENTS,
  },
};

export const getWorkspaceAgentPresets = () => WORKSPACE_AGENT_PRESETS;

export const buildWorkspaceAgentPreset = (presetId = 'content-studio') => {
  const preset = WORKSPACE_AGENT_PRESETS[presetId] || WORKSPACE_AGENT_PRESETS['content-studio'];
  return (preset.agents || []).map((agent, index) => ({
    ...agent,
    id: agent.id || `${presetId}-${index + 1}`,
  }));
};

const normalizeShortcut = (shortcutText = '') => {
  const parts = String(shortcutText).toUpperCase().replace(/\s+/g, '').split('+').filter(Boolean);
  const modifiers = ['CTRL', 'ALT', 'SHIFT'].filter((mod) => parts.includes(mod));
  const key = parts.find((part) => !['CTRL', 'ALT', 'SHIFT'].includes(part)) || '';
  return [...modifiers, key].filter(Boolean).join('+');
};

export const matchShortcut = (event, shortcut = '') => {
  if (!shortcut) return false;
  const parts = [];
  if (event.ctrlKey) parts.push('CTRL');
  if (event.altKey) parts.push('ALT');
  if (event.shiftKey) parts.push('SHIFT');

  const rawCode = event.code || event.key || '';
  let key = rawCode;
  if (/^Key[A-Z]$/i.test(rawCode)) key = rawCode.replace(/^Key/i, '');
  else if (/^Digit\d$/i.test(rawCode)) key = rawCode.replace(/^Digit/i, '');
  else if (rawCode === 'Space') key = 'Space';
  else if (typeof event.key === 'string' && event.key.length === 1) key = event.key.toUpperCase();

  parts.push(String(key).toUpperCase());
  return normalizeShortcut(parts.join('+')) === normalizeShortcut(shortcut);
};

const normalizeProviderConfig = (config = {}) => {
  const safeActive = KNOWN_PROVIDER_IDS.includes(config?.active) ? config.active : DEFAULT_PROVIDER_CONFIG.active;
  const merged = {
    ...DEFAULT_PROVIDER_CONFIG,
    ...config,
    gemini:     { ...DEFAULT_PROVIDER_CONFIG.gemini,     ...(config?.gemini || {}) },
    openai:     { ...DEFAULT_PROVIDER_CONFIG.openai,     ...(config?.openai || {}) },
    claude:     { ...DEFAULT_PROVIDER_CONFIG.claude,     ...(config?.claude || {}) },
    groq:       { ...DEFAULT_PROVIDER_CONFIG.groq,       ...(config?.groq || {}) },
    ollama:     { ...DEFAULT_PROVIDER_CONFIG.ollama,     ...(config?.ollama || {}) },
    perplexity: { ...DEFAULT_PROVIDER_CONFIG.perplexity, ...(config?.perplexity || {}) },
    custom:     { ...DEFAULT_PROVIDER_CONFIG.custom,     ...(config?.custom || {}) },
    scholar:    { ...DEFAULT_PROVIDER_CONFIG.scholar,    ...(config?.scholar || {}) },
    toolLinks: getToolLinksConfig({ ...DEFAULT_PROVIDER_CONFIG, ...(config || {}) }),
    active: safeActive,
  };
  merged.claude.model = normalizeProviderModelName('claude', merged.claude.model || DEFAULT_PROVIDER_CONFIG.claude.model);
  merged.gemini.model = normalizeProviderModelName('gemini', merged.gemini.model || DEFAULT_PROVIDER_CONFIG.gemini.model);
  merged.perplexity.model = normalizeProviderModelName('perplexity', merged.perplexity.model || DEFAULT_PROVIDER_CONFIG.perplexity.model);
  merged.ollama.model = normalizeProviderModelName('ollama', merged.ollama.model || DEFAULT_PROVIDER_CONFIG.ollama.model);
  merged.custom.model = normalizeProviderModelName('custom', merged.custom.model || '');
  merged.activeProviders = normalizeProviderIds(merged.activeProviders || [safeActive], safeActive);
  merged.multiModelEnabled = Boolean(merged.multiModelEnabled);
  return merged;
};

export const getProviderConfig = () => {
  if (providerConfigCache) return providerConfigCache;
  try {
    const stored = JSON.parse(localStorage.getItem('ai_provider_config') || '{}');
    providerConfigCache = normalizeProviderConfig(stored);
    return providerConfigCache;
  } catch {
    providerConfigCache = normalizeProviderConfig({});
    return providerConfigCache;
  }
};

export const saveProviderConfig = (config, options = {}) => {
  const safeConfig = normalizeProviderConfig(config);
  providerConfigCache = safeConfig;
  localStorage.setItem('ai_provider_config', JSON.stringify(safeConfig));
  if (safeConfig.gemini?.key) localStorage.setItem('GEMINI_API_KEY', safeConfig.gemini.key);
  else localStorage.removeItem('GEMINI_API_KEY');

  if (!options?.skipDisk && window.desktopApp?.saveProviderConfig) {
    window.desktopApp.saveProviderConfig(safeConfig).catch(() => {});
  }

  return safeConfig;
};

let providerConfigHydrationPromise = null;

const pickNonEmptyString = (preferredValue = '', fallbackValue = '') => {
  const preferred = String(preferredValue || '').trim();
  return preferred || String(fallbackValue || '').trim();
};

const hasOwnSetting = (obj = {}, key = '') => Object.prototype.hasOwnProperty.call(obj || {}, key);

const pickStoredString = (source = {}, key = '', fallbackValue = '') => {
  if (hasOwnSetting(source, key)) return String(source?.[key] ?? '').trim();
  return String(fallbackValue ?? '').trim();
};

const mergeProviderSettings = (providerId = '', diskValue = {}, localValue = {}) => {
  const merged = {
    ...(diskValue || {}),
    ...(localValue || {}),
  };

  if ('key' in merged) merged.key = pickStoredString(localValue, 'key', diskValue?.key);
  if ('baseUrl' in merged) merged.baseUrl = pickStoredString(localValue, 'baseUrl', diskValue?.baseUrl);
  if ('name' in merged) merged.name = pickStoredString(localValue, 'name', diskValue?.name);
  if ('model' in merged) merged.model = normalizeProviderModelName(providerId, pickStoredString(localValue, 'model', diskValue?.model));

  return merged;
};

const mergeScholarSettings = (diskValue = {}, localValue = {}) => ({
  provider: pickStoredString(localValue, 'provider', diskValue?.provider || DEFAULT_PROVIDER_CONFIG.scholar.provider) || DEFAULT_PROVIDER_CONFIG.scholar.provider,
  key: pickStoredString(localValue, 'key', diskValue?.key),
});

const mergeToolLinksSettings = (diskValue = {}, localValue = {}) => {
  return Object.fromEntries(
    Object.entries(DEFAULT_PROVIDER_CONFIG.toolLinks).map(([toolId, defaults]) => [
      toolId,
      {
        label: pickStoredString(localValue?.[toolId], 'label', diskValue?.[toolId]?.label || defaults.label) || defaults.label,
        url: pickStoredString(localValue?.[toolId], 'url', diskValue?.[toolId]?.url || defaults.url),
      },
    ]),
  );
};

export const hydrateProviderConfigFromDisk = async () => {
  if (!window.desktopApp?.loadProviderConfig) return getProviderConfig();
  if (providerConfigHydrationPromise) return providerConfigHydrationPromise;

  providerConfigHydrationPromise = (async () => {
    try {
      const diskConfig = await window.desktopApp.loadProviderConfig();
      if (!diskConfig || typeof diskConfig !== 'object' || diskConfig.ok === false) {
        return getProviderConfig();
      }

      const localRaw = JSON.parse(localStorage.getItem('ai_provider_config') || '{}');
      const merged = normalizeProviderConfig({
        ...diskConfig,
        ...localRaw,
        active: KNOWN_PROVIDER_IDS.includes(localRaw.active) ? localRaw.active : diskConfig.active,
        activeProviders: normalizeProviderIds([
          ...(Array.isArray(diskConfig.activeProviders) ? diskConfig.activeProviders : []),
          ...(Array.isArray(localRaw.activeProviders) ? localRaw.activeProviders : []),
        ], localRaw.active || diskConfig.active),
        multiModelEnabled: localRaw.multiModelEnabled === true || diskConfig.multiModelEnabled === true,
        gemini: mergeProviderSettings('gemini', diskConfig.gemini, localRaw.gemini),
        openai: mergeProviderSettings('openai', diskConfig.openai, localRaw.openai),
        claude: mergeProviderSettings('claude', diskConfig.claude, localRaw.claude),
        groq: mergeProviderSettings('groq', diskConfig.groq, localRaw.groq),
        ollama: mergeProviderSettings('ollama', diskConfig.ollama, localRaw.ollama),
        perplexity: mergeProviderSettings('perplexity', diskConfig.perplexity, localRaw.perplexity),
        custom: mergeProviderSettings('custom', diskConfig.custom, localRaw.custom),
        scholar: mergeScholarSettings(diskConfig.scholar, localRaw.scholar),
        toolLinks: mergeToolLinksSettings(diskConfig.toolLinks, localRaw.toolLinks),
      });

      saveProviderConfig(merged);
      providerConfigCache = merged;
      return merged;
    } catch {
      return getProviderConfig();
    }
  })();

  return providerConfigHydrationPromise;
};

const getProviderLabelMap = (cfg) => ({
  gemini: 'Gemini',
  openai: 'GPT-4',
  claude: 'Claude',
  groq: 'Groq',
  ollama: `Ollama (${cfg.ollama?.model || 'local'})`,
  perplexity: 'Perplexity',
  custom: cfg.custom.name || 'מנוע מותאם',
});

const getSelectedProviderIds = (cfg = null, forceSingle = false) => {
  const safeCfg = cfg && typeof cfg === 'object' ? cfg : getProviderConfig();
  if (forceSingle) return [safeCfg.active];
  if (!safeCfg.multiModelEnabled) return [safeCfg.active];
  const normalized = normalizeProviderIds(safeCfg.activeProviders || [safeCfg.active], safeCfg.active);
  return [safeCfg.active, ...normalized.filter((providerId) => providerId !== safeCfg.active)];
};

export const getActiveProviderName = () => {
  const cfg = getProviderConfig();
  const names = getProviderLabelMap(cfg);
  const selectedProviders = getSelectedProviderIds(cfg);
  if (cfg.multiModelEnabled && selectedProviders.length > 1) {
    return selectedProviders.map((id) => names[id] || id).join(' + ');
  }
  return names[cfg.active] || 'AI';
};

const getSkillMatchScore = (skill = {}, text = '', skillConfig = {}) => {
  const haystack = String(text || '').toLowerCase();
  const keywords = [...new Set([
    ...(Array.isArray(skill.keywords) ? skill.keywords : []),
    ...normalizeSkillKeywords(skillConfig?.customKeywords || []),
  ])];
  return keywords.reduce((score, keyword) => {
    const token = String(keyword || '').trim().toLowerCase();
    return token && haystack.includes(token) ? score + 1 : score;
  }, 0);
};

const resolveSkillForRequest = ({ userPrompt = '', documentContext = '', skillId = '', autoUseDefault = true } = {}) => {
  const config = getSkillsConfig();
  const explicitSkillId = String(skillId || '').trim();

  if (explicitSkillId && explicitSkillId !== 'none' && KNOWN_SKILL_IDS.includes(explicitSkillId)) {
    const skill = SKILL_LIBRARY.find((item) => item.id === explicitSkillId);
    const mode = config.skills?.[explicitSkillId]?.mode || 'manual';
    if (skill && mode !== 'off') return { skill, reason: 'manual' };
  }

  const promptText = String(userPrompt || '');
  const contextText = String(documentContext || '');
  const autoCandidate = SKILL_LIBRARY
    .map((skill) => {
      const skillConfig = config.skills?.[skill.id] || {};
      if ((skillConfig.mode || 'manual') !== 'auto') return { skill, score: 0 };
      const promptScore = getSkillMatchScore(skill, promptText, skillConfig);
      const contextScore = Math.min(1, getSkillMatchScore(skill, contextText, skillConfig));
      return { skill, score: (promptScore * 3) + contextScore };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0];

  if (autoCandidate?.skill) {
    return { skill: autoCandidate.skill, reason: 'auto' };
  }

  if (autoUseDefault && config.autoApplyDefault && KNOWN_SKILL_IDS.includes(String(config.defaultSkillId || ''))) {
    const skill = SKILL_LIBRARY.find((item) => item.id === config.defaultSkillId);
    const mode = config.skills?.[config.defaultSkillId]?.mode || 'manual';
    if (skill && mode !== 'off') return { skill, reason: 'default' };
  }

  return { skill: null, reason: 'none' };
};

const buildSkillSystemPrompt = (skill = null, reason = 'manual', skillConfig = null) => {
  if (!skill?.prompt) return '';
  const reasonText = reason === 'auto'
    ? 'הסקיל הופעל אוטומטית לפי סוג הבקשה.'
    : reason === 'default'
      ? 'זהו סקיל ברירת המחדל שהוגדר למשתמש.'
      : 'הסקיל הופעל ידנית על ידי המשתמש.';
  const customInstruction = normalizeSkillText(skillConfig?.customInstruction || '');
  const customKeywords = normalizeSkillKeywords(skillConfig?.customKeywords || []);
  return [
    `סקיל פעיל: ${skill.label}.`,
    reasonText,
    skill.prompt,
    customInstruction ? `התאמה אישית שהמשתמש הגדיר לסקיל:\n${customInstruction}` : '',
    customKeywords.length ? `מילות זיהוי שהוגדרו לסקיל: ${customKeywords.join(', ')}` : '',
  ].filter(Boolean).join('\n');
};

const buildResponseModePrompt = ({ strictFormatting = false } = {}) => {
  if (strictFormatting) {
    return [
      'לתפקיד או לכלי הפעיל עשויה להיות דרישת פורמט מדויקת.',
      'אם נדרש פלט מדויק כמו HTML, JSON, רשימה מסוימת, נוסח מתוקן בלבד או מבנה קשיח אחר, שמור עליו בדיוק.',
      'גם במצב כזה אל תוסיף מבוא, סיכום, כותרות או חלקים שלא נדרשו.',
    ].join('\n');
  }

  return [
    'כלל עליון: בצע בדיוק את המטלה שהמשתמש ביקש.',
    'אל תוסיף מבוא, סיכום, "מה עשיתי", כותרות קבועות, סעיפים קשיחים או רשימות אם המשתמש לא ביקש אותם והם לא הכרחיים באמת כדי להשלים מטלה מורכבת.',
    'אם המשתמש ביקש תשובה קצרה, הכרעה ישירה, ניסוח יחיד או תיקון נקודתי, החזר בדיוק את זה.',
    'אם השאלה נקודתית, ענה ישירות בלי עטיפה מיותרת.',
    'השתמש ב-HTML ובמבנה מסמך רק כשהמשתמש ביקש טיוטה, קטע מוכן להדבקה, מסמך ארוך, או פורמט מובנה מפורש.',
    'הנחיות תפקיד, סקיל, workflow, template או ברירות מחדל אחרות הן רקע עוזר בלבד: במקרה של התנגשות, המטלה המפורשת של המשתמש קודמת.',
    'אם יש דרישת פורמט מפורשת בתוך הכלי או בבקשה עצמה, שמור עליה, אבל עדיין בלי להוסיף חלקים שלא התבקשו.',
  ].join('\n');
};

const buildWorkspaceAutomationInstructions = () => {
  const automation = getWorkspaceAutomation();
  if (!automation.enabled) return '';

  const enabledAgents = getOrderedRoleAgents(automation.workflowMode);
  const decisionMode = getDecisionMode(automation, enabledAgents);
  const agentNames = enabledAgents.map((agent) => agent.name).filter(Boolean);
  const agentInstructions = enabledAgents
    .map((agent) => `${agent.name}: ${String(agent.prompt || '').trim()}`)
    .filter(Boolean)
    .join('\n');
  const customOrderedFlow = agentNames.length
    ? `עבוד לפי סדר הסוכנים המותאם שהוגדר על ידי המשתמש: ${agentNames.join(' ← ')}.`
    : 'עבוד לפי סדר הסוכנים שהוגדר על ידי המשתמש.';

  const circularEnabled = automation.workflowMode === 'circular-team' && automation.circularWorkflowEnabled !== false;
  const circularRounds = normalizeCircularRounds(automation);

  const workflowMap = {
    'manager-auto': 'עבוד במצב AUTOPILOT מלא: קודם תכנן, אחר כך קבע לבד אילו תפקידים נדרשים, איזה מודל מתאים לכל שלב, ובאיזה סדר להפעיל אותם. החזר תהליך מתואם וסופי.',
    'circular-team': 'עבוד כצוות מעגלי: הסוכנים לא חייבים לרוץ רק בקו ישר. אם מתגלים פערים, אפשר להחזיר את הכתיבה, המבנה או הליטוש לסבב נוסף עד שהתוצר מתייצב.',
    'manager-pipeline': 'עבוד כצוות אוטומטי: קודם מנהל העבודה מפרק את הבקשה, אחר כך החוקר מאתר מקורות, לאחר מכן מעצב המבנה מארגן את השלד, הכותב מנסח, ולבסוף המגיה מלטש. החזר למשתמש תוצאה סופית מגובשת.',
    'design-first': 'עבוד בסדר הבא: מבנה וארגון, אחר כך ניסוח תוכן, אחר כך ליטוש. כשהנושא מעורפל, התחל תמיד משלד ברור.',
    'research-first': 'עבוד בסדר הבא: חקר שאלות ומקורות, בניית שלד, כתיבה, ולבסוף ליטוש. אל תמציא עובדות שלא נתמכות בהקשר.',
    'custom-order': customOrderedFlow,
  };

  return [
    'מצב סביבת עבודה רב-סוכנית פעיל.',
    automation.workspaceName ? `שם סביבת העבודה: ${automation.workspaceName}.` : '',
    automation.sharedGoal ? `מטרת הסביבה: ${automation.sharedGoal}` : '',
    agentNames.length ? `תפקידי הצוות הפעילים: ${agentNames.join(' → ')}.` : '',
    agentInstructions ? `הנחיות התפקידים הפעילים:\n${agentInstructions}` : '',
    workflowMap[automation.workflowMode] || workflowMap['manager-auto'],
    decisionMode === 'manager'
      ? 'כל סוכן חייב לדווח בסיום מה הושלם ומה עדיין חסר, ומנהל העבודה הוא זה שמכריע על הצעד הבא.'
      : 'כל סוכן חייב לדווח בסיום מה הושלם ומה עדיין חסר, והמשך הזרימה ייקבע לפי כללים וסקילים פעילים.',
    ['manager-auto', 'circular-team'].includes(automation.workflowMode) && decisionMode === 'manager'
      ? 'פעל כמו מנהל עבודה אמיתי: נתח את ההנחיות והחומרים, תכנן שלבים והעבר את השרביט באופן חכם לסוכנים מתאימים.'
      : '',
    circularEnabled
      ? `מותר לבצע חזרה לסוכן קודם אם התוצר אינו בשל (מינימום ${circularRounds.minRounds} סבבים, ולכל היותר ${circularRounds.maxRounds} סבבים למשימה).`
      : '',
    automation.onlyFromMaterials
      ? 'השתמש *אך ורק* בחומרי העזר המצורפים. אל תוסיף שום מידע חיצוני, ואל תמציא מידע שאינו קיים מפורשות בחומרים שקיבלת.'
      : '',
    automation.autoDispatch === false
      ? 'הצע חלוקת תפקידים, אך אל תדלג אוטומטית בין שלבים בלי צורך ברור.'
      : 'בכל בקשה מורכבת בצע חלוקת עבודה פנימית בין התפקידים לפני שאתה מחזיר תשובה.',
  ].filter(Boolean).join('\n');
};

const stripCodeFences = (value = '') => String(value || '')
  .trim()
  .replace(/^```(?:json|html|markdown)?\s*/i, '')
  .replace(/```\s*$/i, '')
  .trim();

const safeJsonParse = (value = '', fallback = null) => {
  const clean = stripCodeFences(value);
  if (!clean) return fallback;
  try {
    return JSON.parse(clean);
  } catch {
    const objectMatch = clean.match(/\{[\s\S]*\}/);
    if (!objectMatch) return fallback;
    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      return fallback;
    }
  }
};

const getConfiguredProviderPool = (cfg = null, preferredProviders = []) => {
  const safeCfg = cfg && typeof cfg === 'object' ? cfg : getProviderConfig();
  const requestedPreferred = normalizeProviderIds(preferredProviders, '');
  const preferred = requestedPreferred
    .filter((providerId) => isProviderConfiguredForUse(providerId, safeCfg));
  if (requestedPreferred.length) return preferred;
  const configured = KNOWN_PROVIDER_IDS.filter((providerId) => isProviderConfiguredForUse(providerId, safeCfg));
  if (!configured.length) return isProviderConfiguredForUse(safeCfg.active, safeCfg) ? [safeCfg.active] : [];
  return configured;
};

const isManagerReviewAgent = (agent = {}) => /manager.*review|review.*manager|מנהל.*בדיק|בדיק.*מנהל/i.test(`${String(agent?.id || '')} ${String(agent?.name || '')}`);

const getAgentRoleKey = (agent = {}) => {
  const value = `${String(agent?.id || '')} ${String(agent?.name || '')}`.toLowerCase();
  if (isManagerReviewAgent(agent)) return 'manager';
  if (/(research|source|חוקר|מקורות)/i.test(value)) return 'researcher';
  if (/(design|structure|outline|מבנה|מעצב)/i.test(value)) return 'designer';
  if (/(proof|review|editor|מגיה|בודק)/i.test(value)) return 'proofreader';
  if (/(writer|draft|כותב)/i.test(value)) return 'writer';
  if (/(manager|מנהל)/i.test(value)) return 'manager';
  return 'general';
};

const isPlanningManagerAgent = (agent = {}) => getAgentRoleKey(agent) === 'manager' && !isManagerReviewAgent(agent);

const chooseProviderForAgent = (agent = {}, cfg = null, preferredProviders = []) => {
  const safeCfg = cfg && typeof cfg === 'object' ? cfg : getProviderConfig();
  const requestedPool = normalizeProviderIds(preferredProviders, safeCfg.active);
  const routingPool = requestedPool
    .filter((providerId) => isProviderConfiguredForUse(providerId, safeCfg));
  const explicitProvider = String(agent?.provider || '').trim();
  if (explicitProvider) {
    if (!isProviderConfiguredForUse(explicitProvider, safeCfg)) return '';
    if (routingPool.length && !routingPool.includes(explicitProvider)) return '';
    return explicitProvider;
  }

  const roleKey = getAgentRoleKey(agent);
  if (requestedPool.length && !routingPool.length) return '';
  const pool = routingPool.length
    ? routingPool
    : getSelectedProviderIds(safeCfg).filter((providerId) => isProviderConfiguredForUse(providerId, safeCfg));
  if (!pool.length) return '';
  const preferences = roleKey === 'researcher'
    ? ['perplexity', 'gemini', 'openai', 'claude', 'groq', 'custom', 'ollama']
    : roleKey === 'proofreader'
      ? ['claude', 'openai', 'gemini', 'groq', 'custom', 'ollama', 'perplexity']
      : roleKey === 'writer'
        ? ['openai', 'claude', 'gemini', 'groq', 'custom', 'ollama', 'perplexity']
        : roleKey === 'designer'
          ? ['claude', 'openai', 'gemini', 'groq', 'custom', 'ollama', 'perplexity']
          : ['gemini', 'openai', 'claude', 'groq', 'custom', 'ollama', 'perplexity'];

  return preferences.find((providerId) => pool.includes(providerId)) || pool[0] || safeCfg.active;
};

const resolveExplicitProviderCandidate = (candidates = [], allowedProviders = [], cfg = null) => {
  const safeCfg = cfg && typeof cfg === 'object' ? cfg : getProviderConfig();
  const normalizedAllowedProviders = normalizeProviderIds(allowedProviders, '')
    .filter((providerId) => isProviderConfiguredForUse(providerId, safeCfg));

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeProviderIds([candidate], '')[0] || '';
    if (!normalizedCandidate) continue;
    if (!normalizedAllowedProviders.includes(normalizedCandidate)) continue;
    if (!isProviderConfiguredForUse(normalizedCandidate, safeCfg)) continue;
    return normalizedCandidate;
  }

  return '';
};

const resolveStageAgent = (token, enabledAgents = []) => {
  const needle = String(token || '').trim().toLowerCase();
  if (!needle) return null;

  const aliases = {
    'manager-review': ['manager-review', 'manager_review', 'manager review', 'managerreview', 'בקרת התאמה'],
    manager: ['manager', 'מנהל'],
    researcher: ['researcher', 'research', 'sources', 'source', 'חוקר', 'מקורות'],
    designer: ['designer', 'design', 'structure', 'outline', 'מעצב', 'מבנה'],
    writer: ['writer', 'draft', 'כותב'],
    proofreader: ['proofreader', 'review', 'editor', 'מגיה', 'בודק'],
  };

  const canonicalEntry = Object.entries(aliases).find(([canonical, list]) => canonical === needle || list.includes(needle));
  if (canonicalEntry) {
    const [canonical] = canonicalEntry;
    if (canonical === 'manager-review') {
      return enabledAgents.find((agent) => isManagerReviewAgent(agent)) || null;
    }
    if (canonical === 'manager') {
      return enabledAgents.find((agent) => isPlanningManagerAgent(agent)) || null;
    }
    const roleMatch = enabledAgents.find((agent) => getAgentRoleKey(agent) === canonical);
    if (roleMatch) return roleMatch;
  }

  const exactMatch = enabledAgents.find((agent) => {
    const id = String(agent?.id || '').toLowerCase();
    const name = String(agent?.name || '').toLowerCase();
    return id === needle || name === needle;
  });
  if (exactMatch) return exactMatch;

  return enabledAgents.find((agent) => {
    const id = String(agent?.id || '').toLowerCase();
    const name = String(agent?.name || '').toLowerCase();
    if (id.includes(needle) || name.includes(needle)) return true;
    return Object.entries(aliases).some(([canonical, list]) => {
      const tokenMatched = canonical === needle || list.some((alias) => needle.includes(alias) || alias.includes(needle));
      return tokenMatched && (id.includes(canonical) || list.some((alias) => id.includes(alias) || name.includes(alias)));
    });
  }) || null;
};

const resolvePlanningManagerAgent = (enabledAgents = []) => enabledAgents.find((agent) => isPlanningManagerAgent(agent)) || null;
const resolveFinalManagerReviewAgent = (enabledAgents = []) => enabledAgents.find((agent) => isManagerReviewAgent(agent)) || resolvePlanningManagerAgent(enabledAgents);

const buildHeuristicAgentPlan = (userPrompt = '', documentContext = '', enabledAgents = [], activeSkill = null) => {
  const combined = `${userPrompt}\n${documentContext}`;
  const skillId = String(activeSkill?.id || '').trim().toLowerCase();
  const isAcademic = /(אקדמ|סמינר|עבודה|מחקר|מאמר|ביבליוגרפ|apa|ציטוט|מקורות|מקור)/i.test(combined);
  const skillPrefersResearch = ['source-hunter', 'citation-weaver', 'draft-from-materials'].includes(skillId);
  const skillPrefersStructure = ['academic-structure', 'template-autopilot'].includes(skillId);
  const skillPrefersPolish = ['consistency-checker', 'final-submission', 'style-guardian'].includes(skillId);
  const needsResearch = skillPrefersResearch || isAcademic || /(reference|references|citation|source|sources|literature|journal)/i.test(combined);
  const needsStructure = skillPrefersStructure || /(שלד|מבנה|outline|כותרות|פרקים|טיוטה)/i.test(combined) || String(documentContext || '').trim().length < 1600;

  const candidateOrder = [
    'manager',
    needsResearch ? 'researcher' : '',
    needsStructure ? 'designer' : '',
    'writer',
    (skillPrefersPolish || needsResearch || needsStructure) ? 'proofreader' : '',
  ].filter(Boolean);

  const orderedAgents = [];
  candidateOrder.forEach((token) => {
    const roleMatches = token === 'manager'
      ? enabledAgents.filter((agent) => isPlanningManagerAgent(agent))
      : enabledAgents.filter((agent) => getAgentRoleKey(agent) === token && !isManagerReviewAgent(agent));
    if (roleMatches.length) {
      roleMatches.forEach((match) => {
        if (!orderedAgents.some((agent) => agent.id === match.id)) orderedAgents.push(match);
      });
      return;
    }
    const match = resolveStageAgent(token, enabledAgents);
    if (match && !orderedAgents.some((agent) => agent.id === match.id)) orderedAgents.push(match);
  });

  if (skillPrefersPolish || needsResearch || needsStructure || isAcademic) {
    enabledAgents
      .filter((agent) => isManagerReviewAgent(agent))
      .forEach((agent) => {
        if (!orderedAgents.some((item) => item.id === agent.id)) orderedAgents.push(agent);
      });
  }

  if (!orderedAgents.length) orderedAgents.push(...enabledAgents);

  const stageGoals = {};
  orderedAgents.forEach((agent) => {
    const roleKey = isManagerReviewAgent(agent) ? 'manager-review' : getAgentRoleKey(agent);
    if (roleKey === 'manager-review') stageGoals[agent.id] = DEFAULT_MANAGER_REVIEW_GOAL;
    else if (roleKey === 'manager') stageGoals[agent.id] = 'בנה תוכנית קצרה, בחר שלבים נדרשים, והכן הוראות מסירה ממוקדות לסוכן הבא.';
    else if (roleKey === 'researcher') stageGoals[agent.id] = skillPrefersResearch
      ? 'התמקד באיתור פערי ידע, כיווני חיפוש, מקורות ומונחי חיפוש. אין להמציא ציטוטים.'
      : 'חלץ מהחומרים והטיוטה מקורות, כיווני חיפוש, נקודות עובדתיות וטענות שניתן לבסס. אין להמציא ציטוטים.';
    else if (roleKey === 'designer') stageGoals[agent.id] = skillPrefersStructure
      ? 'בנה שלד ברור, היררכיית כותרות וסדר כתיבה פרקטי על בסיס הבקשה.'
      : 'ארגן שלד טיעוני ברור, סדר פרקים ותתי-כותרות לפי מטרת העבודה.';
    else if (roleKey === 'writer') stageGoals[agent.id] = 'כתוב את הטקסט המלא רק על בסיס ההנחיות, הטיוטה, והמידע שכבר נאסף בשלבים הקודמים.';
    else if (roleKey === 'proofreader') stageGoals[agent.id] = skillPrefersPolish
      ? 'בצע מעבר ליטוש קפדני: אחידות, בהירות, תיקון בעיות וטון עקבי לפני החזרה למשתמש.'
      : 'בצע בקרת איכות סופית: דיוק, אחידות, בהירות, ועמידה בדרישות אקדמיות.';
  });

  const summaryParts = [
    activeSkill?.label ? `הסקיל הפעיל "${activeSkill.label}" משפיע על סדר העבודה.` : '',
    isAcademic
      ? 'זוהתה משימה אקדמית או מבוססת מקורות; יש להפעיל חקר לפני כתיבה, ואז ללטש את הנוסח הסופי.'
      : 'זוהתה משימת כתיבה מורכבת; יש לתאם בין תכנון, ניסוח ובקרת איכות.',
  ].filter(Boolean);
  const lastAgent = orderedAgents[orderedAgents.length - 1] || null;
  const alreadyEndsWithManagerReview = Boolean(lastAgent) && isManagerReviewAgent(lastAgent);

  return {
    summary: summaryParts.join(' '),
    orderedAgents,
    stageGoals,
    stageProviders: {},
    needsFinalManagerReview: (isAcademic || skillId === 'final-submission') && Boolean(resolveFinalManagerReviewAgent(enabledAgents)) && !alreadyEndsWithManagerReview,
  };
};

const parseStagePacket = (reply = '') => {
  const raw = stripCodeFences(reply);
  const extract = (label) => {
    const match = raw.match(new RegExp(`${label}\\s*:\\s*([\\s\\S]*?)(?=\\n(?:DELIVERABLE|HANDOFF|MISSING|DECISION|CHECKLIST)\\s*:|$)`, 'i'));
    return String(match?.[1] || '').trim();
  };

  const deliverable = extract('DELIVERABLE');
  const handoff = extract('HANDOFF');
  const missing = extract('MISSING');
  const decision = extract('DECISION');
  const checklist = extract('CHECKLIST');

  return {
    raw,
    deliverable: deliverable || raw,
    handoff,
    missing,
    decision,
    checklist,
  };
};

const normalizeCircularRounds = (automation = {}) => {
  const maxRounds = Math.max(1, Math.min(10, Number(automation?.circularMaxRounds || 2)));
  const minRounds = Math.max(1, Math.min(maxRounds, Number(automation?.circularMinRounds || 1)));
  return { minRounds, maxRounds };
};

const getCircularRoundLimit = (automation = {}) => normalizeCircularRounds(automation).maxRounds;
const getCircularMinRoundLimit = (automation = {}) => normalizeCircularRounds(automation).minRounds;

const getDecisionMode = (automation = {}, enabledAgents = null) => {
  const resolvedAgents = Array.isArray(enabledAgents) ? enabledAgents : getOrderedRoleAgents(automation.workflowMode);
  const hasManagerAgent = Boolean(resolvePlanningManagerAgent(resolvedAgents));
  if (!hasManagerAgent) return 'rules';
  if (automation?.workflowMode === 'manager-auto') return automation?.autopilotEnabled === false ? 'rules' : 'manager';
  if (automation?.workflowMode === 'circular-team') return automation?.autopilotEnabled === false ? 'rules' : 'manager';
  return 'rules';
};

const getPacketReviewText = (packet = {}) => {
  const structured = [packet.handoff, packet.missing, packet.decision, packet.checklist].filter(Boolean).join('\n');
  return structured || String(packet.raw || '');
};

const inferGapTags = (packet = {}) => {
  const text = getPacketReviewText(packet);
  if (!text) return [];

  const tags = [];
  if (/(מקור|מקורות|ציטוט|citation|source|sources|מחקר|research|google scholar)/i.test(text)) tags.push('research');
  if (/(מבנה|שלד|outline|כותרת|כותרות|פרקים|סדר|ארגון)/i.test(text)) tags.push('structure');
  if (/(להרחיב|פירוט|דוגמא|דוגמה|ניסוח|שכתוב|rewrite|טיעון|כתיבה)/i.test(text)) tags.push('writing');
  if (/(דיוק|אימות|בדיקת עובדות|טעות|חסר דיוק|לא מדויק)/i.test(text)) tags.push('accuracy');
  if (/(ליטוש|פיסוק|דקדוק|בהירות|עקביות|אחידות|tone|style)/i.test(text)) tags.push('quality');
  return [...new Set(tags)];
};

const getSuggestedSkillIdsFromPacket = (packet = {}, skillsConfig = getSkillsConfig()) => {
  const gapTags = inferGapTags(packet);
  const preferred = [];
  if (gapTags.includes('research')) preferred.push('source-hunter', 'citation-weaver');
  if (gapTags.includes('structure')) preferred.push('academic-structure');
  if (gapTags.includes('writing')) preferred.push('draft-from-materials', 'style-guardian');
  if (gapTags.includes('quality') || gapTags.includes('accuracy')) preferred.push('consistency-checker', 'final-submission', 'style-guardian');
  return [...new Set(preferred)].filter((skillId) => (skillsConfig.skills?.[skillId]?.mode || 'manual') !== 'off');
};

const extractRequestedSkills = (packet = {}, skillsConfig = getSkillsConfig()) => {
  const text = [packet.decision, packet.handoff, packet.missing, packet.raw].filter(Boolean).join('\n');
  const explicit = [];
  String(text || '').replace(/SKILL\s*:\s*([^\n]+)/gi, (_, chunk) => {
    explicit.push(...String(chunk || '').split(/[>,/|]| ו/).map((item) => item.trim().toLowerCase()).filter(Boolean));
    return _;
  });

  return [...new Set([...explicit, ...getSuggestedSkillIdsFromPacket(packet, skillsConfig)])]
    .filter((skillId) => KNOWN_SKILL_IDS.includes(skillId))
    .filter((skillId) => (skillsConfig.skills?.[skillId]?.mode || 'manual') !== 'off');
};

const extractRevisitAgents = (packet = {}, enabledAgents = []) => {
  const text = [packet.handoff, packet.missing, packet.decision, packet.checklist, packet.raw].filter(Boolean).join('\n');
  if (!text) return [];

  const requestedTokens = [];
  [
    /REVISIT\s*:\s*([^\n]+)/gi,
    /סבב נוסף\s*:\s*([^\n]+)/gi,
    /חזור(?:ו)? אל\s*([^\n]+)/gi,
  ].forEach((regex) => {
    let match;
    while ((match = regex.exec(text)) !== null) {
      requestedTokens.push(String(match[1] || ''));
    }
  });

  return requestedTokens
    .flatMap((chunk) => chunk.split(/[>,/|]| ו/).map((item) => item.trim()).filter(Boolean))
    .map((token) => resolveStageAgent(token, enabledAgents))
    .filter(Boolean)
    .filter((agent, index, list) => list.findIndex((item) => item.id === agent.id) === index);
};

const getManagerReviewRevisitAgents = ({ stageAgent, packet, enabledAgents, agentRunCounts, maxRounds, forceManagerDecide = false }) => {
  const reviewText = `${packet?.missing || ''}\n${packet?.decision || ''}\n${packet?.handoff || ''}`;
  const suggestsAnotherPass = /(חסר|נדרש|דורש|לתקן|לחדד|לשפר|להרחיב|לא עקבי|אי-דיוק|פער)/i.test(reviewText);
  if (!forceManagerDecide && !suggestsAnotherPass) return [];
  if (isPlanningManagerAgent(stageAgent)) {
    if (forceManagerDecide) {
      throw new Error('מנהל העבודה דרש הכרעה נוספת אך לא סיפק שלב המשך תקף.');
    }
    return [];
  }
  const managerAgent = resolvePlanningManagerAgent(enabledAgents);
  if (!managerAgent) return [];
  if ((agentRunCounts?.[managerAgent.id] || 0) >= maxRounds) return [];
  return [managerAgent];
};

const getDecisionDirectives = (packet = {}) => {
  const decisionText = String(packet?.decision || '').trim();
  const revisitTokens = [];
  let revisitMatch;
  const revisitRegex = /REVISIT\s*:\s*([^\n]+)/gi;
  while ((revisitMatch = revisitRegex.exec(decisionText)) !== null) {
    revisitTokens.push(...String(revisitMatch[1] || '')
      .split(/[>,/|]| ו/)
      .map((item) => item.trim())
      .filter(Boolean));
  }
  return {
    stop: /(^|\b)STOP(\b|$)|עצור|סיום סופי|מוכן להחזרה/i.test(decisionText),
    managerDecide: /MANAGER_DECIDE|העבר למנהל|הכרעת מנהל/i.test(decisionText),
    revisitAll: revisitTokens.some((token) => /^(all|כולם|הכול|הכל)$/i.test(token)),
    revisitRole: revisitTokens,
  };
};

const hasMeaningfulMissingItems = (missingText = '') => {
  const normalized = String(missingText || '').trim();
  if (!normalized) return false;
  return !/^(אין\s+פערים(?:\s+מהותיים)?|אין\s+חוסרים|none|n\/a|no\s+gaps?|no\s+missing(?:\s+items)?)$/i.test(normalized);
};

const getRuleDrivenRevisitAgents = ({ stageAgent, packet, enabledAgents, agentRunCounts, maxRounds }) => {
  const gapTags = inferGapTags(packet);
  if (!gapTags.length) return [];

  const requestedTokens = [];
  if (gapTags.includes('research')) requestedTokens.push('researcher');
  if (gapTags.includes('structure')) requestedTokens.push('designer');
  if (gapTags.includes('writing') || gapTags.includes('accuracy')) requestedTokens.push('writer');
  if (gapTags.includes('quality')) requestedTokens.push('proofreader');

  if (getAgentRoleKey(stageAgent) === 'proofreader' && (gapTags.includes('writing') || gapTags.includes('structure') || gapTags.includes('accuracy'))) {
    requestedTokens.unshift('writer');
  }

  return requestedTokens
    .map((token) => resolveStageAgent(token, enabledAgents))
    .filter(Boolean)
    .filter((agent, index, list) => list.findIndex((item) => item.id === agent.id) === index)
    .filter((agent) => (agentRunCounts?.[agent.id] || 0) < maxRounds);
};

const enqueueWorkflowRevisits = ({
  requestedRevisits = [],
  executionQueue,
  agentRunCounts,
  maxRounds,
  logEvent,
  requestedByAgent = null,
  requestedByLabel = '',
  decisionMode = 'rules',
  decisionPreview = '',
  missingPreview = '',
  revisitReason = 'נדרש סבב נוסף',
}) => {
  const scheduledAgents = [];

  requestedRevisits.slice().reverse().forEach((revisitAgent) => {
    if (!revisitAgent?.id) return;
    if ((agentRunCounts?.[revisitAgent.id] || 0) >= maxRounds) return;
    if (executionQueue.some((item) => item?.agent?.id === revisitAgent.id)) return;

    executionQueue.unshift({ agent: revisitAgent, revisitReason });
    scheduledAgents.push(revisitAgent);
    logEvent('stage-revisit-scheduled', 'הסוכן הוחזר לסבב נוסף', {
      state: 'running',
      agentId: revisitAgent.id,
      agentLabel: revisitAgent.name,
      agentName: revisitAgent.name,
      requestedBy: requestedByAgent?.id || '',
      requestedByLabel: requestedByLabel || requestedByAgent?.name || '',
      roundIndex: (agentRunCounts?.[revisitAgent.id] || 0) + 1,
      decisionMode,
      decisionPreview,
      missingPreview,
    });
  });

  return scheduledAgents.reverse();
};

const DEFAULT_MANAGER_REVIEW_GOAL = 'בצע ביקורת סופית כמנהל עבודה: עמידה בדרישות, איכות, דיוק, פערים מהותיים ותיקוני חובה לפני החזרה למשתמש.';

const buildStagePrompt = ({ cleanUserPrompt, stageGoal = '', stageAgent, stagedOutput = '', batonNotes = [], planSummary = '', index = 0, total = 1, allowCircular = false, roundIndex = 0, revisitReason = '', decisionMode = 'manager', finalReview = false, enabledAgents = [] }) => {
  const batonBlock = batonNotes.length ? `שרשור מסירות בין הסוכנים:\n- ${batonNotes.join('\n- ')}` : '';
  const currentOutputBlock = stagedOutput ? `תוצר עדכני עד כה:\n${stagedOutput}` : '';
  const isPlanningManagerStage = isPlanningManagerAgent(stageAgent);
  const isManagerReviewStage = isManagerReviewAgent(stageAgent);
  const revisitTargetAgents = (Array.isArray(enabledAgents) ? enabledAgents : [])
    .filter((agent) => agent?.id)
    .filter((agent) => {
      if (finalReview || isManagerReviewStage || isPlanningManagerStage) return agent.id !== stageAgent?.id;
      return true;
    });
  const revisitTargetList = revisitTargetAgents.map((agent) => agent.id).join(', ')
    || 'writer, designer, researcher, proofreader, manager';
  const revisitTargetsHelp = `יעדי REVISIT זמינים כרגע: ${revisitTargetList}`;
  const decisionGuidance = decisionMode === 'manager'
    ? (finalReview
      ? 'אתה בשער בקרה סופי: אם צריך סבב תיקון, ציין במפורש REVISIT לסוכן המתאים. אל תחזיר את אותו סוכן לעצמו; אם הכול מוכן כתוב STOP.'
      : isPlanningManagerStage
      ? 'מצב העבודה כרגע הוא טייס אוטומטי ואתה המנהל המכריע: ציין במפורש מה עדיין חסר, ואם צריך סבב נוסף כתוב ב-DECISION: REVISIT: writer/designer/researcher/proofreader/manager. אם הכול מוכן כתוב STOP.'
      : isManagerReviewStage
        ? 'אתה שלב ביקורת ניהולי סופי: בדוק את התוצר, ואם צריך סבב תיקון כתוב ב-DECISION: REVISIT לסוכן אחר מתאים. אם הכול מוכן כתוב STOP.'
      : 'מצב העבודה כרגע הוא טייס אוטומטי: אתה חייב לציין בסוף במפורש מה עדיין חסר. אם נדרשת הכרעה נוספת, כתוב ב-DECISION: MANAGER_DECIDE והמנהל יחליט על הצעד הבא.')
    : (isManagerReviewStage
      ? 'אתה שלב ביקורת ניהולי סופי: אם צריך תיקון, כתוב במפורש REVISIT לסוכן המתאים; אם הכול מוכן כתוב STOP.'
      : 'מצב העבודה כרגע הוא רגיל: אתה חייב לציין בסוף מה עדיין חסר, וב-DECISION להמליץ לפי כללים וסקילים על הצעד הבא באמצעות agent id קונקרטי או SKILL מתאים.');
  const decisionOptions = decisionMode === 'manager'
    ? (finalReview
      ? `DECISION:\nאחת מהאפשרויות: STOP / REVISIT: ${revisitTargetList} / SKILL: skill-id`
      : isPlanningManagerStage
      ? `DECISION:\nאחת מהאפשרויות: STOP / REVISIT: ${revisitTargetList} / SKILL: skill-id`
      : isManagerReviewStage
        ? `DECISION:\nאחת מהאפשרויות: STOP / REVISIT: ${revisitTargetList} / SKILL: skill-id`
      : `DECISION:\nאחת מהאפשרויות: STOP / MANAGER_DECIDE / REVISIT: ${revisitTargetList} / SKILL: skill-id`)
    : (isManagerReviewStage
      ? `DECISION:\nאחת מהאפשרויות: STOP / REVISIT: ${revisitTargetList} / SKILL: skill-id`
      : `DECISION:\nאחת מהאפשרויות: STOP / REVISIT: ${revisitTargetList} / SKILL: skill-id`);

  return [
    `בקשת המשתמש המקורית:\n${cleanUserPrompt}`,
    planSummary ? `תכנית מנהל העבודה:\n${planSummary}` : '',
    batonBlock,
    currentOutputBlock,
    stageGoal ? `יעד השלב הנוכחי:\n${stageGoal}` : '',
    revisitReason ? `למה הוחזרת עכשיו לסבב נוסף:\n${revisitReason}` : '',
    `אתה פועל בשלב ${index + 1} מתוך ${total}${roundIndex > 0 ? ` • סבב חוזר ${roundIndex + 1}` : ''}.`,
    'שמור על דיוק ועל רצף עם מה שכבר נעשה. אם חסר מידע, אל תמציא.',
    decisionGuidance,
    revisitTargetsHelp,
    allowCircular ? 'אם לדעתך צריך להחזיר סוכן קודם לעוד סבב, ציין זאת ב-DECISION או ב-HANDOFF עם REVISIT לאחד מה-agent ids הזמינים.' : '',
    'החזר את התשובה במבנה הבא בלבד:',
    'DELIVERABLE:\nהתוצר המלא שעובר לשלב הבא או חוזר למשתמש',
    'HANDOFF:\n2-5 נקודות קצרות לסוכן הבא: מה כבר נסגר, מה עוד חסר, ועל מה חשוב לשמור',
    'MISSING:\nרשימת פערים קצרה. אם הכול מוכן כתוב: אין פערים מהותיים',
    decisionOptions,
    'CHECKLIST:\n- 2-4 בדיקות איכות קצרות',
  ].filter(Boolean).join('\n\n');
};

const planWithManagerIfNeeded = async ({ cleanUserPrompt, documentContext, enabledAgents, automation, cfg, selectedProviders, preferredProviders = [], runId, logEvent, onStatus, activeSkill = null }) => {
  const fallbackPlan = buildHeuristicAgentPlan(cleanUserPrompt, documentContext, enabledAgents, activeSkill);
  if (!['manager-auto', 'circular-team'].includes(automation.workflowMode) || automation?.autopilotEnabled === false || !enabledAgents.length) return fallbackPlan;

  const managerAgent = resolvePlanningManagerAgent(enabledAgents);
  if (!managerAgent) return fallbackPlan;
  const managerProvider = chooseProviderForAgent(managerAgent, cfg, selectedProviders);
  const availableProviders = normalizeProviderIds(selectedProviders, '')
    .filter((providerId) => isProviderConfiguredForUse(providerId, cfg))
    .map((providerId) => `${providerId}: ${getModelNameForProvider(providerId, cfg, '')}`)
    .join('\n');

  try {
    logEvent('manager-plan-start', 'מנהל העבודה בונה תכנית ביצוע דינמית', {
      state: 'running',
      agentLabel: managerAgent?.name || 'מנהל עבודה',
      provider: managerProvider,
      orderedAgents: enabledAgents.map((agent) => agent.name),
    });

    const managerPlanText = await chatWithActiveProvider(
      `בקשת המשתמש:\n${cleanUserPrompt}`,
      String(documentContext || '').slice(0, 6000),
      `${managerAgent?.prompt || ''}\nהחזר JSON בלבד וללא טקסט נוסף במבנה הזה: {"summary":"...","order":["manager","researcher","designer","writer","proofreader","manager-review"],"goals":{"manager":"...","manager-review":"..."},"roleLabels":{"researcher":"בודק מקורות","writer":"מנסח סופי","manager-review":"בקרת התאמה"},"providers":{"researcher":"perplexity","manager-review":"claude"},"needsFinalManagerReview":false}.\nבחר רק את הסוכנים הנחוצים באמת. במצב AUTOPILOT אתה גם מגדיר את התפקיד המעשי של כל שלב דרך roleLabels. אם מדובר בעבודה אקדמית, טיוטה, נושא מחקרי או חומרי עזר — העדף מקורות לפני כתיבה. אם צריך שער איכות ניהולי מפורש בסוף, מותר להוסיף manager-review כשלב נפרד. אם מצב העבודה הוא מעגלי, מותר לך לתכנן כך שסוכן יחזור לסבב נוסף בהמשך לפי הצורך.\nמודלים זמינים כרגע:\n${availableProviders}`,
      {
        providerOverride: managerProvider,
        preferredProviders: managerProvider ? [managerProvider] : preferredProviders,
        strictProviderOverride: true,
        modelOverride: managerAgent?.model || '',
        strictFormatting: true,
        skipAutomation: true,
        skipMultiModel: true,
        shouldPersistMemory: false,
        runId,
        agentLabel: managerAgent?.name || 'מנהל עבודה',
        onStatus: (payload = {}) => emitStatus(onStatus, {
          ...payload,
          runId,
          agentLabel: managerAgent?.name || 'מנהל עבודה',
          provider: payload.provider || managerProvider,
          model: payload.model || getModelNameForProvider(managerProvider, cfg, managerAgent?.model || ''),
          message: payload.message || 'מנהל העבודה מתכנן את השלבים',
          progress: Math.min(18, Number(payload.progress ?? 12)),
        }),
      },
    );

    const parsedPlan = safeJsonParse(managerPlanText, null);
    if (!parsedPlan || !Array.isArray(parsedPlan.order)) return fallbackPlan;

    const orderedAgents = parsedPlan.order
      .map((token) => resolveStageAgent(token, enabledAgents))
      .filter(Boolean)
      .filter((agent, index, arr) => arr.findIndex((item) => item.id === agent.id) === index);

    const normalizedOrderedAgents = [
      ...orderedAgents.filter((agent) => !isManagerReviewAgent(agent)),
      ...orderedAgents.filter((agent) => isManagerReviewAgent(agent)),
    ];

    if (!normalizedOrderedAgents.length) return fallbackPlan;

    logEvent('manager-plan-success', 'מנהל העבודה בחר מסלול הרצה דינמי', {
      state: 'success',
      agentLabel: managerAgent?.name || 'מנהל עבודה',
      orderedAgents: normalizedOrderedAgents.map((agent) => agent.name),
      outputPreview: trimLogText(parsedPlan.summary || ''),
    });

    const resolvedFinalReviewer = resolveFinalManagerReviewAgent(enabledAgents);
    const lastPlannedAgent = normalizedOrderedAgents[normalizedOrderedAgents.length - 1] || null;
    const alreadyEndsWithManagerReview = Boolean(lastPlannedAgent) && Boolean(resolvedFinalReviewer) && lastPlannedAgent.id === resolvedFinalReviewer.id;
    const dynamicStageGoals = { ...(parsedPlan.goals || {}) };
    normalizedOrderedAgents.forEach((agent) => {
      const roleKey = isManagerReviewAgent(agent) ? 'manager-review' : getAgentRoleKey(agent);
      const resolvedGoal = parsedPlan?.goals?.[agent.id]
        || parsedPlan?.goals?.[agent.name]
        || parsedPlan?.goals?.[String(agent.id || '').toLowerCase()]
        || parsedPlan?.goals?.[roleKey]
        || '';
      if (resolvedGoal) dynamicStageGoals[agent.id] = resolvedGoal;
    });

    return {
      ...fallbackPlan,
      summary: String(parsedPlan.summary || fallbackPlan.summary || '').trim(),
      orderedAgents: normalizedOrderedAgents,
      stageGoals: { ...fallbackPlan.stageGoals, ...dynamicStageGoals },
      stageLabels: parsedPlan.roleLabels || parsedPlan.stageLabels || {},
      stageProviders: parsedPlan.providers || {},
      needsFinalManagerReview: !alreadyEndsWithManagerReview && (typeof parsedPlan.needsFinalManagerReview === 'boolean'
        ? parsedPlan.needsFinalManagerReview
        : fallbackPlan.needsFinalManagerReview),
    };
  } catch (error) {
    logEvent('manager-plan-fallback', 'תכנון דינמי נכשל, עובר למסלול בטוח', {
      state: 'retrying',
      agentLabel: managerAgent?.name || 'מנהל עבודה',
      provider: managerProvider,
      errorMessage: error?.message || 'fallback',
    });
    return fallbackPlan;
  }
};

const buildPersonalStyleInstructions = (profile = {}) => {
  const labels = {
    school: 'בית ספר',
    undergraduate: 'תואר ראשון',
    graduate: 'תואר שני',
    doctoral: 'דוקטורט',
    professional: 'מקצועי',
  };

  const fingerprint = profile.styleFingerprint || {};
  const parts = [];
  if (profile.academic_level) parts.push(`רמת הכתיבה המועדפת: ${labels[profile.academic_level] || profile.academic_level}`);
  if (profile.displayName) parts.push(`שם המשתמש: ${String(profile.displayName).trim()}`);
  if (profile.userRole) parts.push(`תפקיד או סטטוס נוכחי: ${String(profile.userRole).trim()}`);
  if (profile.institutionName) parts.push(`מוסד לימודים או ארגון מרכזי: ${String(profile.institutionName).trim()}`);
  if (profile.studyTrack) parts.push(`מסלול, חוג או תחום עיקרי: ${String(profile.studyTrack).trim()}`);
  if (profile.currentCourses?.length) parts.push(`קורסים או נושאי עיסוק עכשוויים: ${profile.currentCourses.join(', ')}`);
  if (profile.defaultDocumentStyle) parts.push(`סגנון מסמך מועדף כברירת מחדל: ${String(profile.defaultDocumentStyle).trim()}`);
  if (profile.preferredHomeStyleIds?.length) parts.push(`סגנונות מועדפים להצגה ושימוש: ${profile.preferredHomeStyleIds.join(', ')}`);
  if (profile.customStyleGuidance) parts.push(`כללי סגנון אישיים נוספים: ${String(profile.customStyleGuidance).trim()}`);
  if (profile.learningGameInsights?.length) parts.push(`תובנות שנלמדו ממשחקי ההיכרות: ${profile.learningGameInsights.join(' | ')}`);
  if (profile.styleTrainingSummary) parts.push(`סיכום העדפות הסגנון ממשחק 'למד אותי': ${String(profile.styleTrainingSummary).trim()}`);
  if (profile.preferredTrainingExamples?.length) parts.push(`דוגמאות ניסוח שקרובות במיוחד לסגנון המועדף: ${profile.preferredTrainingExamples.join(' | ')}`);
  if (profile.dislikedStylePatterns?.length) parts.push(`יש להימנע במיוחד מ: ${profile.dislikedStylePatterns.join(', ')}`);
    if (profile.linguisticRegisterPreference) {
      const registerLabels = { academic: 'אקדמי — מינוח מקצועי ודיוק לשוני', standard: 'תקנית — שפה תקנית ומאוזנת', conversational: 'שיחתית — שפה נגישה וקרובה לקורא' };
      parts.push(`רמה לשונית מועדפת: ${registerLabels[profile.linguisticRegisterPreference] || profile.linguisticRegisterPreference}`);
    }
  if (profile.userBackground) parts.push(`רקע מקצועי או אישי של המשתמש: ${String(profile.userBackground).trim()}`);
  if (profile.writingGoals) parts.push(`מטרות הכתיבה המרכזיות: ${String(profile.writingGoals).trim()}`);
  if (profile.additionalContext) parts.push(`הקשר אישי נוסף שחשוב לזכור: ${String(profile.additionalContext).trim()}`);
  if (profile.preferredDocumentTypes?.length) parts.push(`סוגי מסמכים נפוצים למשתמש: ${profile.preferredDocumentTypes.join(', ')}`);
  if (profile.defaultAudience) parts.push(`קהל יעד מועדף: ${String(profile.defaultAudience).trim()}`);
  if (profile.formatPreferences) parts.push(`העדפות מבנה ותצורה: ${String(profile.formatPreferences).trim()}`);
  if (profile.manualVocabulary?.length) parts.push(`העדף את המונחים: ${profile.manualVocabulary.join(', ')}`);
  if (profile.manualPhrases?.length) parts.push(`ביטויים שמועדפים על המשתמש: ${profile.manualPhrases.join(', ')}`);
  if (profile.preferredSentenceStructures?.length) parts.push(`מבני משפטים מועדפים: ${profile.preferredSentenceStructures.join(', ')}`);
  if (profile.paragraphPreferences) parts.push(`העדפות לגבי אורך ומבנה פסקאות: ${String(profile.paragraphPreferences).trim()}`);
  if (profile.tonePreferences?.length) parts.push(`טון כתיבה מועדף: ${profile.tonePreferences.join(', ')}`);
  if (profile.sentenceLengthPreference) parts.push(`אורך משפטים מועדף: ${profile.sentenceLengthPreference}`);
  if (profile.paragraphLengthPreference) parts.push(`אורך פסקאות מועדף: ${profile.paragraphLengthPreference}`);
  if (profile.protectedVocabulary?.length) parts.push(`אין לשנות את המונחים: ${profile.protectedVocabulary.join(', ')}`);
  if (profile.protectedPhrases?.length) parts.push(`אין לשנות את הביטויים: ${profile.protectedPhrases.join(', ')}`);
  if (profile.learningConsent === false) {
    parts.push('המשתמש ביקש שהמערכת תישען בעיקר על ההעדפות שהגדיר ידנית, בלי הרחבה אוטומטית מעבר להן.');
  } else {
    if (profile.learnedSentencePatterns?.length) parts.push(`דפוסי כתיבה שנלמדו: ${profile.learnedSentencePatterns.join(', ')}`);
    if (profile.preferredConnectors?.length) parts.push(`מחברי טקסט שחוזרים אצל המשתמש: ${profile.preferredConnectors.join(', ')}`);
    if (profile.preferredSentenceOpeners?.length) parts.push(`פתיחות משפט אופייניות: ${profile.preferredSentenceOpeners.join(', ')}`);
    if (profile.toneDescriptors?.length) parts.push(`מאפייני טון שנלמדו: ${profile.toneDescriptors.join(', ')}`);
    if (profile.learnedVocabulary?.length) parts.push(`מונחים שנלמדו מהכתיבה שלך: ${profile.learnedVocabulary.slice(0, 14).join(', ')}`);
    if (profile.learnedPhrases?.length) parts.push(`צירופים אופייניים שנלמדו: ${profile.learnedPhrases.slice(0, 8).join(', ')}`);
    if (fingerprint.avgSentenceWords) parts.push(`ממוצע מילים למשפט: ${fingerprint.avgSentenceWords}`);
    if (fingerprint.avgParagraphWords) parts.push(`ממוצע מילים לפסקה: ${fingerprint.avgParagraphWords}`);
    if (profile.learnedNotes?.length) parts.push(`תובנות שנלמדו מהקבצים: ${profile.learnedNotes.join(' | ')}`);
  }
  if (profile.notes) parts.push(`הערות סגנון אישיות: ${String(profile.notes).trim()}`);
  return parts.filter(Boolean).join('\n');
};

// ═══════════════════════════════════════
// Legacy (backward-compat)
// ═══════════════════════════════════════
export const getApiKey = () => getProviderConfig().gemini.key || localStorage.getItem("GEMINI_API_KEY") || "";
export const setApiKey = (key) => {
  const cfg = getProviderConfig();
  cfg.gemini.key = key;
  saveProviderConfig(cfg);
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = async (promise, timeoutMs, onTimeout) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => {
        try { onTimeout?.(); } catch {}
        reject(new Error(`הבקשה ארכה יותר מדי זמן (${Math.round(timeoutMs / 1000)} שניות)`));
      }, timeoutMs);
    }),
  ]);
};

const emitStatus = (callback, payload) => {
  if (typeof callback === 'function') callback(payload);
};

const AGENT_DEBUG_STORAGE_KEY = 'wordai_agent_debug_logs';
const APP_MEMORY_STORAGE_KEY = 'wordai_app_memory';
const MAX_AGENT_DEBUG_LOGS = 250;
const MAX_APP_MEMORY_ITEMS = 24;

export const DEFAULT_APP_MEMORY = {
  recentChats: [],
  memoryNotes: [],
  lastSelectedSkillId: 'none',
  lastSelectedAgentId: '',
  lastResolvedSkillLabel: '',
  updatedAt: '',
};

const createRunId = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {}
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const trimLogText = (value = '', limit = 220) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
};

const normalizeArtifactText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const hasMeaningfulArtifact = (value = '', fallbackPrompt = '') => {
  const normalized = normalizeArtifactText(value);
  if (!normalized) return false;
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (normalized.length < 18 && wordCount < 3) return false;
  if (/^(ok|okay|done|בוצע|טופל|הושלם|סבבה|אושר)$/i.test(normalized)) return false;
  const normalizedPrompt = normalizeArtifactText(fallbackPrompt);
  if (normalizedPrompt && normalized === normalizedPrompt) return false;
  return true;
};

export const getAppMemory = () => {
  const stored = readJsonFromStorage(APP_MEMORY_STORAGE_KEY, {});
  return {
    ...DEFAULT_APP_MEMORY,
    ...stored,
    recentChats: Array.isArray(stored.recentChats) ? stored.recentChats.slice(-MAX_APP_MEMORY_ITEMS) : [],
    memoryNotes: Array.isArray(stored.memoryNotes) ? stored.memoryNotes.slice(0, 12) : [],
  };
};

export const saveAppMemory = (memory = {}) => {
  const current = getAppMemory();
  const next = {
    ...current,
    ...memory,
    recentChats: Array.isArray(memory.recentChats) ? memory.recentChats.slice(-MAX_APP_MEMORY_ITEMS) : current.recentChats,
    memoryNotes: Array.isArray(memory.memoryNotes) ? memory.memoryNotes.slice(0, 12) : current.memoryNotes,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(APP_MEMORY_STORAGE_KEY, JSON.stringify(next));
  return next;
};

export const clearAppMemory = () => {
  localStorage.setItem(APP_MEMORY_STORAGE_KEY, JSON.stringify(DEFAULT_APP_MEMORY));
};

export const clearSidebarChatHistory = ({ workspaceId = '', clearAll = false } = {}) => {
  const legacyKey = 'wordai_sidebar_messages';
  const activeWorkspaceId = String(workspaceId || getWorkspaceAutomation().activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  const scopedKey = `${legacyKey}:${activeWorkspaceId}`;

  if (clearAll) {
    Object.keys(localStorage)
      .filter((key) => key === legacyKey || key.startsWith(`${legacyKey}:`))
      .forEach((key) => localStorage.removeItem(key));
  } else {
    localStorage.removeItem(scopedKey);
    localStorage.removeItem(legacyKey);
  }

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wordai-chat-history-cleared', {
      detail: {
        workspaceId: activeWorkspaceId,
        clearAll,
      },
    }));
  }
};

const extractMemoryNotes = (text = '') => {
  const lines = String(text || '').split(/\n+/).map((item) => item.trim()).filter(Boolean);
  return [...new Set(
    lines
      .filter((line) => /(תמיד|חשוב לי|מעדיף|העדף|בלי |אל |תזכור|שמור על)/.test(line))
      .map((line) => trimLogText(line, 140))
  )].slice(0, 4);
};

export const rememberConversationTurn = ({ userPrompt = '', reply = '', agentLabel = '', skillId = '', skillLabel = '' } = {}) => {
  const current = getAppMemory();
  const recentChats = [
    ...current.recentChats,
    {
      ts: new Date().toISOString(),
      userPrompt: trimLogText(userPrompt, 220),
      replyPreview: trimLogText(reply, 220),
      agentLabel: String(agentLabel || '').trim(),
      skillId: String(skillId || '').trim(),
      skillLabel: String(skillLabel || '').trim(),
    },
  ].slice(-MAX_APP_MEMORY_ITEMS);
  const memoryNotes = [...new Set([...extractMemoryNotes(userPrompt), ...(current.memoryNotes || [])])].slice(0, 12);
  return saveAppMemory({ ...current, recentChats, memoryNotes });
};

const buildAppMemoryInstructions = (memory = getAppMemory()) => {
  const notes = Array.isArray(memory.memoryNotes) ? memory.memoryNotes.slice(0, 5) : [];
  const recentChats = Array.isArray(memory.recentChats) ? memory.recentChats.slice(-3) : [];
  const parts = [];
  if (notes.length) parts.push(`דברים שחשוב לזכור מהמשתמש: ${notes.join(' | ')}`);
  if (memory.lastSelectedSkillId && memory.lastSelectedSkillId !== 'none') parts.push(`הסקיל האחרון שנבחר: ${memory.lastSelectedSkillId}`);
  if (memory.lastSelectedAgentId) parts.push(`הסוכן האחרון שנבחר: ${memory.lastSelectedAgentId}`);
  if (recentChats.length) {
    parts.push(`הקשר אחרון מהשיחות הקודמות:\n${recentChats.map((item, index) => `${index + 1}. משתמש: ${item.userPrompt}${item.skillLabel ? ` | סקיל: ${item.skillLabel}` : ''}${item.agentLabel ? ` | סוכן: ${item.agentLabel}` : ''}`).join('\n')}`);
  }
  return parts.join('\n');
};

const getModelNameForProvider = (provider, cfg, override = '') => {
  const normalizedOverride = normalizeProviderModelName(provider, override);
  const isClearlyCrossProviderOverride = (() => {
    if (!normalizedOverride) return false;
    if (provider === 'custom' || provider === 'ollama') return false;

    const value = String(normalizedOverride).toLowerCase();
    const foreignFamiliesByProvider = {
      gemini: /^(claude|gpt|o\d+|sonar|pplx)/,
      claude: /^(gemini|learnlm|gpt|o\d+|sonar|pplx)/,
      openai: /^(claude|gemini|learnlm|sonar|pplx)/,
      perplexity: /^(claude|gemini|learnlm|gpt|o\d+)/,
      groq: /^(claude|gemini|learnlm|sonar|pplx)/,
    };

    const matcher = foreignFamiliesByProvider[provider];
    return Boolean(matcher && matcher.test(value));
  })();

  if (normalizedOverride && !isClearlyCrossProviderOverride) return normalizedOverride;

  switch (provider) {
    case 'gemini':
      return normalizeProviderModelName('gemini', cfg.gemini.model || 'gemini-2.5-flash');
    case 'openai':
      return normalizeProviderModelName('openai', cfg.openai.model || 'gpt-4o');
    case 'claude':
      return normalizeProviderModelName('claude', cfg.claude.model || 'claude-sonnet-4-6');
    case 'groq':
      return normalizeProviderModelName('groq', cfg.groq.model || 'llama-3.3-70b-versatile');
    case 'ollama':
      return normalizeProviderModelName('ollama', cfg.ollama.model || 'llama3.2');
    case 'perplexity':
      return normalizeProviderModelName('perplexity', cfg.perplexity.model || 'sonar-pro');
    case 'custom':
      return normalizeProviderModelName('custom', cfg.custom.model || 'custom-model');
    default:
      return '';
  }
};

export const getAgentDebugLogs = (filters = {}) => {
  const logs = readJsonFromStorage(AGENT_DEBUG_STORAGE_KEY, []);
  const entries = Array.isArray(logs) ? logs : [];
  const safeFilters = (filters && typeof filters === 'object') ? filters : {};
  const workspaceId = String(safeFilters.workspaceId || '').trim();
  const runId = String(safeFilters.runId || '').trim();
  const includeUnscoped = safeFilters.includeUnscoped !== false;

  return entries.filter((log) => {
    if (workspaceId) {
      const logWorkspaceId = String(log?.activeWorkspaceId || '').trim();
      if (logWorkspaceId && logWorkspaceId !== workspaceId) return false;
      if (!logWorkspaceId && !includeUnscoped) return false;
    }
    if (runId && String(log?.runId || '').trim() !== runId) return false;
    return true;
  });
};

export const clearAgentDebugLogs = (workspaceId = '') => {
  try {
    const targetWorkspaceId = String(workspaceId || '').trim();
    if (!targetWorkspaceId) {
      localStorage.setItem(AGENT_DEBUG_STORAGE_KEY, JSON.stringify([]));
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wordai-agent-logs-updated', { detail: [] }));
      }
      return;
    }

    const nextLogs = getAgentDebugLogs().filter((log) => String(log?.activeWorkspaceId || '').trim() !== targetWorkspaceId);
    localStorage.setItem(AGENT_DEBUG_STORAGE_KEY, JSON.stringify(nextLogs));
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wordai-agent-logs-updated', { detail: nextLogs }));
    }
  } catch {}
};

export const logAgentDebugEvent = (entry = {}) => pushAgentDebugLog(entry);

export const getLatestAgentRunSummary = (automation = getWorkspaceAutomation(), targetRunId = '') => {
  const activeWorkspaceId = String(automation?.activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  const logs = getAgentDebugLogs({ workspaceId: activeWorkspaceId, includeUnscoped: false });
  const requestedRunId = String(targetRunId || '').trim();
  const scopedLogs = requestedRunId ? logs.filter((log) => String(log?.runId || '').trim() === requestedRunId) : logs;
  const latestLog = scopedLogs.length ? scopedLogs[scopedLogs.length - 1] : null;
  const runWorkflowMode = String(latestLog?.workflowMode || automation?.workflowMode || 'manager-auto');
  const orderedAgents = getOrderedRoleAgents(runWorkflowMode);

  if (!scopedLogs.length) {
    return {
      runId: requestedRunId,
      workspaceId: activeWorkspaceId,
      workspaceName: automation?.workspaceName || '',
      criteria: [
        { key: 'model', label: 'המודל מילא את התפקיד שלו', state: 'idle', details: 'אין הרצה עדיין' },
        { key: 'manager', label: 'המנהל שלט בצוות', state: 'idle', details: 'אין הרצה עדיין' },
        { key: 'api', label: 'נעשה שימוש ב-API', state: 'idle', details: 'אין הרצה עדיין' },
      ],
      stages: orderedAgents.map((agent) => ({ id: agent.id, label: agent.name, state: 'idle', details: 'לא הופעל' })),
      logs: [],
      lastError: '',
    };
  }

  const lastRunLog = requestedRunId
    ? scopedLogs[scopedLogs.length - 1]
    : ([...logs].reverse().find((log) => log.runId) || logs[logs.length - 1]);
  const runId = requestedRunId || lastRunLog?.runId || '';
  const runLogs = requestedRunId
    ? scopedLogs
    : (runId ? logs.filter((log) => log.runId === runId) : logs.slice(-80));
  const summaryWorkspaceId = String(lastRunLog?.activeWorkspaceId || activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  const summaryWorkspaceName = String(lastRunLog?.workspaceName || automation?.workspaceName || '').trim();
  const hasApiAttempt = runLogs.some((log) => ['request-start', 'provider-start', 'attempt-start', 'multi-model-start'].includes(log.type));
  const hasApiSuccess = runLogs.some((log) => ['attempt-success', 'multi-model-success', 'workflow-success'].includes(log.type));
  const managerRequired = automation?.enabled !== false && ['manager-auto', 'circular-team'].includes(runWorkflowMode) && automation?.autopilotEnabled !== false;
  const managerSuccess = runLogs.some((log) => log.type === 'manager-plan-success');
  const managerFailure = runLogs.some((log) => log.type === 'manager-plan-fallback' || (log.type === 'stage-error' && /מנהל|manager/i.test(`${log.agentLabel || ''} ${log.agentId || ''}`)));
  const lastError = [...runLogs].reverse().find((log) => log.state === 'error')?.errorMessage || '';

  const stageStartByAgent = new Map();
  const stageSuccessByAgent = new Map();
  const stageErrorByAgent = new Map();

  runLogs.forEach((log) => {
    const key = String(log.agentId || '').trim();
    if (!key) return;
    if (log.type === 'stage-start' && !stageStartByAgent.has(key)) stageStartByAgent.set(key, log);
    if (log.type === 'stage-success') stageSuccessByAgent.set(key, log);
    if (log.type === 'stage-error') stageErrorByAgent.set(key, log);
  });

  const stageKeys = Array.from(new Set([
    ...orderedAgents.map((agent) => agent.id),
    ...Array.from(stageStartByAgent.keys()),
    ...Array.from(stageSuccessByAgent.keys()),
    ...Array.from(stageErrorByAgent.keys()),
  ])).filter(Boolean);

  const stages = stageKeys.map((agentId) => {
    const agent = orderedAgents.find((item) => item.id === agentId);
    const started = stageStartByAgent.get(agentId);
    const success = stageSuccessByAgent.get(agentId);
    const error = stageErrorByAgent.get(agentId);
    return {
      id: agentId,
      label: success?.agentName || success?.agentLabel || error?.agentName || error?.agentLabel || started?.agentName || started?.agentLabel || agent?.name || agentId,
      configuredName: success?.agentName || error?.agentName || started?.agentName || agent?.name || '',
      state: success ? 'success' : error ? 'error' : 'idle',
      details: success?.message || error?.errorMessage || started?.message || 'לא הופעל',
      provider: success?.provider || error?.provider || started?.provider || '',
      model: success?.model || error?.model || started?.model || '',
    };
  });

  return {
    runId,
    workspaceId: summaryWorkspaceId,
    workspaceName: summaryWorkspaceName,
    criteria: [
      {
        key: 'model',
        label: 'המודל מילא את התפקיד שלו',
        state: (stages.some((stage) => stage.state === 'success') || runLogs.some((log) => ['attempt-success', 'doc-generation-success', 'workflow-success', 'multi-model-success'].includes(log.type))) ? 'success' : hasApiAttempt ? 'error' : 'idle',
        details: (stages.some((stage) => stage.state === 'success') || runLogs.some((log) => ['attempt-success', 'doc-generation-success', 'workflow-success', 'multi-model-success'].includes(log.type))) ? 'ההרצה החזירה תוצר תקין' : hasApiAttempt ? 'ההרצה התחילה אך לא הושלמה בהצלחה' : 'עדיין לא הייתה הרצה',
      },
      {
        key: 'manager',
        label: 'המנהל שלט בצוות',
        state: managerRequired ? (managerSuccess ? 'success' : managerFailure ? 'error' : 'idle') : 'idle',
        details: managerRequired ? (managerSuccess ? 'המנהל בנה מסלול עבודה והקצה שלבים' : managerFailure ? 'המנהל לא הצליח לנהל את ההרצה' : 'המנהל טרם הופעל בהרצה האחרונה') : 'לא נדרש במצב הנוכחי',
      },
      {
        key: 'api',
        label: 'נעשה שימוש ב-API',
        state: hasApiSuccess ? 'success' : hasApiAttempt ? 'error' : 'idle',
        details: hasApiSuccess ? 'התקבלה תשובה ממנוע AI' : hasApiAttempt ? 'הייתה פנייה ל-API אך היא נכשלה' : 'לא בוצעה פנייה ל-API',
      },
    ],
    stages,
    logs: runLogs,
    lastError,
  };
};

const pushAgentDebugLog = (entry = {}) => {
  try {
    const automation = getWorkspaceAutomation();
    const rawMessage = String(entry?.message || '').trim();
    const rawError = String(entry?.errorMessage || '').trim();
    const shouldAttachError = ['error', 'retrying'].includes(String(entry?.state || '')) && rawError;
    const messageWithError = shouldAttachError && (!rawMessage || !rawMessage.includes(rawError))
      ? `${rawMessage || 'אירעה שגיאה'} · שגיאה: ${rawError}`
      : rawMessage;

    const record = {
      id: createRunId(),
      ts: new Date().toISOString(),
      state: 'info',
      activeWorkspaceId: String(entry?.activeWorkspaceId || automation.activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID,
      workspaceName: String(entry?.workspaceName || automation.workspaceName || '').trim(),
      workflowMode: String(entry?.workflowMode || automation.workflowMode || '').trim(),
      agentName: String(entry?.agentName || entry?.agentLabel || '').trim(),
      ...entry,
      message: messageWithError,
    };
    const next = [...getAgentDebugLogs(), record].slice(-MAX_AGENT_DEBUG_LOGS);
    localStorage.setItem(AGENT_DEBUG_STORAGE_KEY, JSON.stringify(next));
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wordai-agent-logs-updated', { detail: record }));
    }
    return record;
  } catch {
    return null;
  }
};

// ═══════════════════════════════════════
// OpenAI-Compatible Fetch (Groq, Mistral, Ollama, LM Studio, Together, Perplexity, etc.)
// ═══════════════════════════════════════
export const callOpenAICompatible = async (baseUrl, apiKey, model, messages, signal) => {
  const url = baseUrl.replace(/\/$/, '') + '/chat/completions';
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const bodyStr = JSON.stringify({ model, messages, max_tokens: 4096, stream: false });

  // ב-Electron: נשלח דרך main process כדי לעקוף CORS
  if (typeof window !== 'undefined' && window.desktopApp?.proxyHttpRequest) {
    const result = await window.desktopApp.proxyHttpRequest({ url, method: 'POST', headers, body: bodyStr });
    if (!result.ok) {
      throw new Error(`שגיאת API (${result.status}): ${String(result.body || '').slice(0, 300)}`);
    }
    const data = JSON.parse(result.body);
    return data.choices?.[0]?.message?.content || '';
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    signal,
    body: bodyStr,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`שגיאת API (${res.status}): ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
};

// ═══════════════════════════════════════
// Claude (Anthropic)
// ═══════════════════════════════════════
export const callClaudeApi = async (apiKey, model, systemPrompt, userMessage, signal) => {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model, max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`Claude API (${res.status}): ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || '';
};

// ═══════════════════════════════════════
// Universal Chat — routes by active provider
// ═══════════════════════════════════════
export const chatWithActiveProvider = async (userPrompt, documentContext = '', extraSystemPrompt = '', options = {}) => {
  const cfg = getProviderConfig();
  const taggedRouting = extractTaggedModelRouting(userPrompt);
  const cleanUserPrompt = taggedRouting.cleanText || String(userPrompt || '').trim();
  const taggedProviders = normalizeProviderIds(taggedRouting.taggedProviders, '');
  const preferredProviders = normalizeProviderIds(options.preferredProviders, '');
  const constrainedProviders = preferredProviders.length
    ? preferredProviders
    : taggedProviders;
  const selectedProviders = constrainedProviders.length
    ? constrainedProviders
    : options.providerOverride && options.strictProviderOverride === true
      ? [options.providerOverride]
      : getSelectedProviderIds(cfg, options.skipMultiModel === true);
  const automationPreferredProviders = constrainedProviders.length || selectedProviders.length > 1
    ? selectedProviders
    : [];
  const configuredSelectedProviders = selectedProviders
    .filter((providerId) => isProviderConfiguredForUse(providerId, cfg));
  if (constrainedProviders.length && !configuredSelectedProviders.length) {
    throw new Error('אין ספק AI זמין בתוך ה-pool שנבחר.');
  }
  const taggedProviderInPool = taggedProviders.find((providerId) => configuredSelectedProviders.includes(providerId));
  const activeProvider = options.providerOverride
    || (preferredProviders.length
      ? taggedProviderInPool
      : (taggedProviders.length ? taggedProviderInPool : ''))
    || configuredSelectedProviders[0]
    || selectedProviders[0]
    || cfg.active;
  const taggedModelOverride = taggedRouting.providerModels?.[activeProvider]
    || (preferredProviders.length ? '' : taggedRouting.taggedModel);
  const modelOverride = options.modelOverride || taggedModelOverride || '';
  const personalStylePrompt = buildPersonalStyleInstructions(getPersonalStyleProfile());
  const sharedInstructions = getSharedAgentInstructions();
  const workspaceAutomationPrompt = buildWorkspaceAutomationInstructions();
  const skillsConfig = getSkillsConfig();
  const skillResolution = resolveSkillForRequest({
    userPrompt: cleanUserPrompt,
    documentContext,
    skillId: options.skillId || '',
    autoUseDefault: options.autoUseDefaultSkill !== false,
  });
  const activeSkill = skillResolution.skill;
  const skillPrompt = buildSkillSystemPrompt(activeSkill, skillResolution.reason, activeSkill ? skillsConfig.skills?.[activeSkill.id] : null);
  const responseModePrompt = buildResponseModePrompt({ strictFormatting: options.strictFormatting === true });
  const appMemoryPrompt = options.includeAppMemory === false ? '' : buildAppMemoryInstructions(getAppMemory());
  const automation = getWorkspaceAutomation();
  const onStatus = options.onStatus;
  const agentLabel = options.agentLabel || 'הסוכן הראשי';
  const agentName = options.agentName || agentLabel;
  const timeoutMs = Math.max(10000, Number(automation.requestTimeoutMs || 45) * 1000);
  const retries = automation.retryEnabled === false ? 0 : Math.max(0, Number(automation.maxRetries || 0));
  const effectiveRetries = activeProvider === 'gemini' ? 0 : retries;
  const runId = options.runId || createRunId();
  const activeWorkspaceId = String(options.activeWorkspaceId || automation.activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  const workspaceName = String(options.workspaceName || automation.workspaceName || '').trim();
  const disableFallback = options.disableFallback === true;
  const resolvedModel = getModelNameForProvider(activeProvider, cfg, modelOverride);
  const logEvent = (type, message, extra = {}) => pushAgentDebugLog({
    runId,
    type,
    message,
    activeWorkspaceId: extra.activeWorkspaceId || activeWorkspaceId,
    workspaceName: extra.workspaceName || workspaceName,
    agentLabel: extra.agentLabel || agentLabel,
    agentName: extra.agentName || extra.agentLabel || agentName,
    provider: extra.provider || activeProvider,
    model: extra.model || resolvedModel,
    workflowMode: automation.workflowMode,
    ...extra,
  });
  const rememberSuccessfulReply = (replyText = '') => {
    if (options.shouldPersistMemory === false) return replyText;
    try {
      rememberConversationTurn({
        userPrompt: cleanUserPrompt,
        reply: String(replyText || ''),
        agentLabel,
        skillId: activeSkill?.id || '',
        skillLabel: activeSkill?.label || '',
      });
    } catch {}
    return replyText;
  };
  const sysPrompt = `אתה העוזר החכם של מעבד התמלילים "WordFlow AI".
ענה תמיד בעברית, קצר, ברור ומעשי.
הנח שהמשתמש נמצא באמצע כתיבה, ולכן גם שאלות קצרות כמו "נראה ארוך אה?", "יש מקור לזה?" או "תחדד לי" מתייחסות לפסקה או לטקסט שבהקשר המצורף.
אם מבקשים קיצור/הארכה/שכתוב — תן ישירות נוסח מוצע שאפשר להדביק.
אם מבקשים מקור אקדמי — תן כיוון מחקר, מילות חיפוש, סוגי מקורות, ואם אפשר גם שמות חוקרים/נושאים רלוונטיים. אם אין ודאות, אל תמציא ציטוטים.
אם המשתמש מבקש תוכן חדש שמיועד למסמך, כתוב רק את התוכן עצמו כדי שיהיה קל להוסיף למסמך.
עדיפות ראשונה: מה שהמשתמש ביקש מפורשות ומה שמופיע בחומרי העזר — ההגדרות המובנות (תבנית, מסלול, קהל יעד) הן רקע עוזר בלבד ולא מחליפות את המטלה.
כשמחזירים מסמך או תוכן ארוך שמיועד להדבקה במסמך, השתמש ב-HTML מעוצב עם h1, h2, h3, p, ul, ol, strong, em לפי ההקשר — אל תחזיר גוש טקסט רציף ללא היררכיה ומבנה.
כאשר צריך לבצע הפרדת עמודים, החזר בדיוק את קטע ה-HTML הבא בלבד בשורה נפרדת: <div data-type="page-break"></div>.${extraSystemPrompt ? `\n\nהנחיית תפקיד:\n${extraSystemPrompt}` : ''}${skillPrompt ? `\n\nסקיל נבחר:\n${skillPrompt}` : ''}${sharedInstructions ? `\n\nהנחיות משותפות לפרויקט:\n${sharedInstructions}` : ''}${workspaceAutomationPrompt ? `\n\nתיאום צוות AI:\n${workspaceAutomationPrompt}` : ''}${personalStylePrompt ? `\n\nהעדפות סגנון אישיות:\n${personalStylePrompt}` : ''}${appMemoryPrompt ? `\n\nזיכרון אפליקציה וסוכן:\n${appMemoryPrompt}` : ''}${documentContext ? `\n\nהקשר מהמסמך:\n${documentContext.slice(0, 8000)}` : ''}${responseModePrompt ? `\n\nכללי מטלה וצורת מענה:\n${responseModePrompt}` : ''}`;

  try { options.onSkillResolved?.(skillResolution); } catch {}

  logEvent('request-start', 'התחלת בקשת AI', {
    state: 'running',
    promptPreview: trimLogText(cleanUserPrompt),
    contextChars: String(documentContext || '').length,
    automationEnabled: automation.enabled,
    autoDispatch: automation.autoDispatch !== false,
    workspaceName: automation.workspaceName || '',
    selectedProviders,
    taggedProviders,
    taggedModel: taggedRouting.taggedModel || '',
    multiModelEnabled: cfg.multiModelEnabled === true,
    skillId: activeSkill?.id || '',
    skillLabel: activeSkill?.label || '',
    skillReason: skillResolution.reason,
  });

  if (automation.enabled && automation.autoDispatch !== false && !options.providerOverride && !options.skipAutomation) {
    const enabledAgents = getOrderedRoleAgents(automation.workflowMode);
    if (enabledAgents.length) {
      const executionPlan = await planWithManagerIfNeeded({
        cleanUserPrompt,
        documentContext,
        enabledAgents,
        automation,
        cfg,
        selectedProviders,
        preferredProviders: automationPreferredProviders,
        runId,
        logEvent,
        onStatus,
        activeSkill,
      });

      const orderedAgents = executionPlan?.orderedAgents?.length ? executionPlan.orderedAgents : enabledAgents;
      const allowCircularWorkflow = automation.workflowMode === 'circular-team' && automation.circularWorkflowEnabled !== false;
      const decisionMode = getDecisionMode(automation, enabledAgents);
      const allowDecisionRevisits = allowCircularWorkflow || decisionMode === 'manager';
      const skillsConfig = getSkillsConfig();
      const maxRoundsPerAgent = allowCircularWorkflow ? getCircularRoundLimit(automation) : (allowDecisionRevisits ? 2 : 1);
      const minRoundsPerAgent = allowCircularWorkflow ? Math.min(maxRoundsPerAgent, getCircularMinRoundLimit(automation)) : 1;
      const maxStageCount = Math.max(orderedAgents.length, orderedAgents.length * maxRoundsPerAgent);
      const agentRunCounts = {};
      const executionQueue = orderedAgents.map((agent) => ({ agent, revisitReason: '' }));

      logEvent('workflow-start', `הופעלה סביבת עבודה${allowCircularWorkflow ? ' מעגלית' : decisionMode === 'manager' ? ' דינמית' : ''} עם ${orderedAgents.length} סוכנים`, {
        state: 'running',
        orderedAgents: orderedAgents.map((agent) => agent.name),
        orderedAgentIds: orderedAgents.map((agent) => agent.id),
        planSummary: executionPlan?.summary || '',
        circularEnabled: allowCircularWorkflow,
        maxRoundsPerAgent,
        minRoundsPerAgent,
        decisionMode,
      });

      let stagedOutput = '';
      let processedStages = 0;
      let pendingFinalManagerReview = executionPlan?.needsFinalManagerReview === true;
      let finalManagerReviewPasses = 0;
      const batonNotes = executionPlan?.summary ? [`מנהל העבודה: ${executionPlan.summary}`] : [];
      const stageArtifacts = [];

      while (executionQueue.length || pendingFinalManagerReview) {
        while (executionQueue.length && processedStages < maxStageCount) {
          const queueItem = executionQueue.shift();
          const stageAgent = queueItem?.agent;
          if (!stageAgent?.id) continue;

          const runCount = (agentRunCounts[stageAgent.id] || 0) + 1;
          agentRunCounts[stageAgent.id] = runCount;
          const stageStart = Math.round((processedStages / maxStageCount) * 100);
          const stageSpan = Math.max(12, Math.round(100 / Math.max(1, maxStageCount)));
          const stageRoleKey = getAgentRoleKey(stageAgent);
          const stageRoutingKey = isManagerReviewAgent(stageAgent) ? 'manager-review' : stageRoleKey;
          const stageGoalKey = isManagerReviewAgent(stageAgent) ? 'manager-review' : stageRoleKey;
          const stageGoal = executionPlan?.stageGoals?.[stageAgent.id]
          || executionPlan?.stageGoals?.[stageAgent.name]
          || executionPlan?.stageGoals?.[String(stageAgent.id || '').toLowerCase()]
          || executionPlan?.stageGoals?.[stageGoalKey]
          || (isManagerReviewAgent(stageAgent) ? DEFAULT_MANAGER_REVIEW_GOAL : '');
          const stageLabel = executionPlan?.stageLabels?.[stageAgent.id]
          || executionPlan?.stageLabels?.[stageAgent.name]
          || executionPlan?.stageLabels?.[String(stageAgent.id || '').toLowerCase()]
          || executionPlan?.stageLabels?.[stageRoutingKey]
          || stageAgent.name;
          const allowedStageProviders = normalizeProviderIds(selectedProviders, '')
          .filter((providerId) => isProviderConfiguredForUse(providerId, cfg));
          const normalizedRequestedProvider = resolveExplicitProviderCandidate([
            executionPlan?.stageProviders?.[stageAgent.id],
            executionPlan?.stageProviders?.[stageAgent.name],
            executionPlan?.stageProviders?.[String(stageAgent.id || '').toLowerCase()],
            executionPlan?.stageProviders?.[stageRoutingKey],
          ], allowedStageProviders, cfg);
          const stageProvider = normalizedRequestedProvider || chooseProviderForAgent(stageAgent, cfg, selectedProviders);
          const stagePrompt = buildStagePrompt({
          cleanUserPrompt,
          stageGoal,
          stageAgent,
          stagedOutput,
          batonNotes,
          planSummary: executionPlan?.summary || '',
          index: processedStages,
          total: maxStageCount,
          allowCircular: allowCircularWorkflow,
          roundIndex: runCount - 1,
          revisitReason: queueItem?.revisitReason || '',
          decisionMode,
          enabledAgents,
        });

          logEvent('stage-start', `מתחיל שלב ${processedStages + 1} מתוך ${maxStageCount}${runCount > 1 ? ` • סבב ${runCount}` : ''}`, {
          state: 'running',
          agentId: stageAgent.id,
          agentLabel: stageLabel,
          agentName: stageAgent.name || stageLabel,
          provider: stageProvider,
          model: stageAgent.model || getModelNameForProvider(stageProvider, cfg, modelOverride),
          stageIndex: processedStages + 1,
          stageTotal: maxStageCount,
          roundIndex: runCount,
          revisitReason: queueItem?.revisitReason || '',
          promptPreview: trimLogText(stagePrompt),
        });

          try {
          const stageReply = await chatWithActiveProvider(stagePrompt, documentContext, `${stageAgent.prompt}\nהחזר בתבנית DELIVERABLE / HANDOFF / MISSING / DECISION / CHECKLIST בלבד.`, {
            providerOverride: stageProvider,
            preferredProviders: stageProvider ? [stageProvider] : automationPreferredProviders,
            strictProviderOverride: true,
            modelOverride: stageAgent.model || taggedRouting.providerModels?.[stageProvider] || '',
            strictFormatting: true,
            skipAutomation: true,
            skipMultiModel: true,
            shouldPersistMemory: false,
            agentLabel: stageLabel,
            agentName: stageAgent.name || stageLabel,
            runId,
            onStatus: (payload = {}) => {
              const localProgress = Number(payload.progress ?? 0);
              const mappedProgress = Math.min(99, stageStart + Math.round((localProgress / 100) * stageSpan));
              emitStatus(onStatus, {
                ...payload,
                runId,
                provider: payload.provider || stageProvider,
                model: payload.model || stageAgent.model || getModelNameForProvider(stageProvider, cfg, modelOverride),
                agentId: stageAgent.id,
                agentLabel: stageLabel,
                progress: mappedProgress,
                message: payload.message || `מעבד שלב ${processedStages + 1} מתוך ${maxStageCount}`,
              });
            },
          });

          const parsedReply = parseStagePacket(stageReply);
          const stageArtifact = String(parsedReply.deliverable || '').trim();
          if (!hasMeaningfulArtifact(stageArtifact, cleanUserPrompt)) {
            logEvent('stage-noop', `השלב ${processedStages + 1} לא החזיר תוצר שימושי`, {
              state: 'error',
              agentId: stageAgent.id,
              agentLabel: stageLabel,
              agentName: stageAgent.name || stageLabel,
              provider: stageProvider,
              model: stageAgent.model || getModelNameForProvider(stageProvider, cfg, modelOverride),
              stageIndex: processedStages + 1,
              stageTotal: maxStageCount,
              roundIndex: runCount,
              outputPreview: trimLogText(stageArtifact || stageReply || ''),
              errorMessage: 'הסוכן לא סיפק deliverable מספק',
            });
            throw new Error(`הסוכן ${stageLabel} לא סיפק deliverable מספק. עצרתי כדי למנוע גז בניוטרל.`);
          }

          stagedOutput = stageArtifact;
          stageArtifacts.push({
            agentId: stageAgent.id,
            agentLabel: stageLabel,
            chars: stageArtifact.length,
            preview: trimLogText(stageArtifact, 180),
          });

          if (parsedReply.handoff) {
            batonNotes.push(`${stageAgent.name}: ${parsedReply.handoff.replace(/\n+/g, ' ; ')}`);
          }

          if (parsedReply.missing) {
            batonNotes.push(`${stageAgent.name} זיהה פערים: ${parsedReply.missing.replace(/\n+/g, ' ; ')}`);
          }

          const suggestedSkillIds = extractRequestedSkills(parsedReply, skillsConfig);
          if (suggestedSkillIds.length) {
            const suggestedSkillLabels = suggestedSkillIds.map((skillId) => SKILL_LIBRARY.find((item) => item.id === skillId)?.label || skillId);
            batonNotes.push(`כללים/סקילים ממליצים להמשך על: ${suggestedSkillLabels.join(', ')}`);
          }

          while (batonNotes.length > 10) batonNotes.shift();

          if (allowCircularWorkflow && runCount < minRoundsPerAgent) {
            const alreadyQueued = executionQueue.some((item) => item?.agent?.id === stageAgent.id);
            if (!alreadyQueued && runCount < maxRoundsPerAgent) {
              executionQueue.push({ agent: stageAgent, revisitReason: 'עמידה במינימום סבבים מעגליים' });
              logEvent('stage-revisit-scheduled', 'הסוכן הוחזר לסבב נוסף כדי לעמוד במינימום המוגדר', {
                state: 'running',
                agentId: stageAgent.id,
                agentLabel: stageLabel,
                agentName: stageAgent.name || stageLabel,
                roundIndex: runCount + 1,
                minRoundsPerAgent,
              });
            }
          }

          const directives = getDecisionDirectives(parsedReply);
          const hasPendingMinRounds = allowCircularWorkflow && orderedAgents.some((agent) => (agentRunCounts[agent.id] || 0) < minRoundsPerAgent);
          if (directives.stop && !hasPendingMinRounds) {
            executionQueue.length = 0;
            logEvent('stage-stop-requested', 'השלב ביקש לעצור ולהחזיר תוצאה סופית', {
              state: 'success',
              agentId: stageAgent.id,
              agentLabel: stageLabel,
              agentName: stageAgent.name || stageLabel,
              decisionPreview: trimLogText(parsedReply.decision || ''),
            });
          } else if (directives.stop && hasPendingMinRounds) {
            logEvent('stage-stop-deferred', 'בקשת עצירה נדחתה עד השלמת מינימום סבבים', {
              state: 'retrying',
              agentId: stageAgent.id,
              agentLabel: stageLabel,
              agentName: stageAgent.name || stageLabel,
              minRoundsPerAgent,
            });
          } else if (allowDecisionRevisits) {
            const priorityManager = directives.managerDecide
              ? getManagerReviewRevisitAgents({ stageAgent, packet: parsedReply, enabledAgents, agentRunCounts, maxRounds: maxRoundsPerAgent, forceManagerDecide: true })
              : [];
            const requestedRevisits = [
              ...priorityManager,
              ...extractRevisitAgents(parsedReply, enabledAgents),
              ...(decisionMode === 'manager'
                ? getManagerReviewRevisitAgents({ stageAgent, packet: parsedReply, enabledAgents, agentRunCounts, maxRounds: maxRoundsPerAgent })
                : getRuleDrivenRevisitAgents({ stageAgent, packet: parsedReply, enabledAgents, agentRunCounts, maxRounds: maxRoundsPerAgent })),
            ].filter((agent, index, list) => list.findIndex((item) => item.id === agent.id) === index);
            const fallbackPlanningManager = isManagerReviewAgent(stageAgent)
              ? resolvePlanningManagerAgent(enabledAgents)
              : null;
            const fallbackWorkerAgent = isManagerReviewAgent(stageAgent)
              ? ['writer', 'proofreader', 'designer', 'researcher']
                .map((roleKey) => enabledAgents.find((agent) => agent?.id && agent.id !== stageAgent.id && getAgentRoleKey(agent) === roleKey))
                .find(Boolean)
                || enabledAgents.find((agent) => agent?.id && agent.id !== stageAgent.id)
                || null
              : null;
            const revisitTargets = requestedRevisits.length
              ? requestedRevisits
              : (isManagerReviewAgent(stageAgent) && hasMeaningfulMissingItems(parsedReply.missing) && fallbackPlanningManager && fallbackPlanningManager.id !== stageAgent.id
                ? [fallbackPlanningManager]
                : (isManagerReviewAgent(stageAgent) && hasMeaningfulMissingItems(parsedReply.missing) && fallbackWorkerAgent
                  ? [fallbackWorkerAgent]
                  : []))
                ;
            const filteredRequestedRevisits = (isManagerReviewAgent(stageAgent) || isPlanningManagerAgent(stageAgent))
              ? revisitTargets.filter((agent) => agent?.id && agent.id !== stageAgent.id)
              : revisitTargets;
            enqueueWorkflowRevisits({
              requestedRevisits: filteredRequestedRevisits,
              executionQueue,
              agentRunCounts,
              maxRounds: maxRoundsPerAgent,
              logEvent,
              requestedByAgent: stageAgent,
              requestedByLabel: stageLabel,
              decisionMode,
              decisionPreview: trimLogText(parsedReply.decision || ''),
              missingPreview: trimLogText(parsedReply.missing || ''),
              revisitReason: directives.managerDecide ? `${stageLabel} ביקש הכרעת מנהל` : `${stageLabel} זיהה שעדיין חסר משהו`,
            });
            if (isManagerReviewAgent(stageAgent) && filteredRequestedRevisits.length) {
              pendingFinalManagerReview = true;
            }
          }

          logEvent('stage-success', `הושלם שלב ${processedStages + 1} מתוך ${maxStageCount}`, {
            state: 'success',
            agentId: stageAgent.id,
            agentLabel: stageLabel,
            agentName: stageAgent.name || stageLabel,
            provider: stageProvider,
            model: stageAgent.model || getModelNameForProvider(stageProvider, cfg, modelOverride),
            stageIndex: processedStages + 1,
            stageTotal: maxStageCount,
            roundIndex: runCount,
            outputChars: stagedOutput.length,
            outputPreview: trimLogText(stagedOutput),
            handoffPreview: trimLogText(parsedReply.handoff || ''),
            missingPreview: trimLogText(parsedReply.missing || ''),
            decisionPreview: trimLogText(parsedReply.decision || ''),
            suggestedSkillIds,
          });
          processedStages += 1;
        } catch (error) {
          logEvent('stage-error', `שגיאה בשלב ${processedStages + 1} מתוך ${maxStageCount}`, {
            state: 'error',
            agentId: stageAgent.id,
            agentLabel: stageLabel,
            agentName: stageAgent.name || stageLabel,
            provider: stageProvider,
            model: stageAgent.model || getModelNameForProvider(stageProvider, cfg, modelOverride),
            stageIndex: processedStages + 1,
            stageTotal: maxStageCount,
            roundIndex: runCount,
            errorMessage: error?.message || 'שגיאה לא ידועה',
          });
          throw error;
        }
      }

        if (allowDecisionRevisits && executionQueue.length) {
          logEvent('workflow-circular-limit', 'הגעת למגבלת הסבבים; עובר לסיכום סופי', {
            state: 'retrying',
            pendingAgents: executionQueue.map((item) => item?.agent?.name).filter(Boolean),
          });
          executionQueue.length = 0;
        }

        if (!pendingFinalManagerReview) break;

        const managerAgent = resolveFinalManagerReviewAgent(enabledAgents);
        if (!managerAgent) {
          throw new Error('נדרשת סקירת manager סופית, אבל אין סוכן manager פעיל ב-workflow הנוכחי.');
        }

        const nextFinalManagerReviewPass = finalManagerReviewPasses + 1;
        const allowedFinalReviewBudget = maxRoundsPerAgent + (isPlanningManagerAgent(managerAgent) ? 1 : 0);
        if (((agentRunCounts[managerAgent.id] || 0) + nextFinalManagerReviewPass) > allowedFinalReviewBudget) {
          throw new Error('סקירת manager סופית חרגה ממגבלת הסבבים המותרת עבור אותו סוכן.');
        }
        finalManagerReviewPasses = nextFinalManagerReviewPass;
        const managerRoleKey = isManagerReviewAgent(managerAgent) ? 'manager-review' : getAgentRoleKey(managerAgent);
        const allowedReviewProviders = normalizeProviderIds(selectedProviders, '')
          .filter((providerId) => isProviderConfiguredForUse(providerId, cfg));
        const normalizedReviewProvider = resolveExplicitProviderCandidate([
          executionPlan?.stageProviders?.['manager-review'],
          executionPlan?.stageProviders?.[managerAgent.id],
          executionPlan?.stageProviders?.[managerAgent.name],
          executionPlan?.stageProviders?.[String(managerAgent.id || '').toLowerCase()],
          executionPlan?.stageProviders?.[managerRoleKey],
        ], allowedReviewProviders, cfg);
        const reviewProvider = normalizedReviewProvider || chooseProviderForAgent(managerAgent, cfg, selectedProviders);
        const reviewPrompt = buildStagePrompt({
          cleanUserPrompt,
          stageGoal: 'בצע סקירה סופית כמנהל עבודה. ודא שהמסמך עומד בדרישות, שהכותב נשען על החומרים, ושאין פערים לוגיים או ניסוחיים. החזר נוסח סופי בלבד.',
          stageAgent: managerAgent,
          stagedOutput,
          batonNotes,
          planSummary: executionPlan?.summary || '',
          index: orderedAgents.length,
          total: orderedAgents.length + 1,
          finalReview: true,
          enabledAgents,
        });

        const managerReply = await chatWithActiveProvider(reviewPrompt, documentContext, `${managerAgent.prompt}\nזהו שלב בדיקה סופי לפני החזרה למשתמש. החזר בתבנית DELIVERABLE / HANDOFF / MISSING / DECISION / CHECKLIST בלבד.`, {
          providerOverride: reviewProvider,
          preferredProviders: reviewProvider ? [reviewProvider] : automationPreferredProviders,
          strictProviderOverride: true,
          modelOverride: managerAgent.model || taggedRouting.providerModels?.[reviewProvider] || '',
          strictFormatting: true,
          skipAutomation: true,
          skipMultiModel: true,
          shouldPersistMemory: false,
          agentLabel: managerAgent.name,
          agentName: managerAgent.name,
          runId,
          onStatus: (payload = {}) => emitStatus(onStatus, {
            ...payload,
            runId,
            provider: payload.provider || reviewProvider,
            model: payload.model || managerAgent.model || getModelNameForProvider(reviewProvider, cfg, modelOverride),
            agentLabel: managerAgent.name,
            progress: Math.max(92, Number(payload.progress ?? 96)),
            message: payload.message || 'מנהל העבודה מבצע סקירה סופית',
          }),
        });

        const parsedManagerReply = parseStagePacket(managerReply);
        const managerDirectives = getDecisionDirectives(parsedManagerReply);
        const revisitAllAgents = managerDirectives.revisitAll
          ? enabledAgents.filter((agent) => agent?.id && agent.id !== managerAgent.id)
          : [];
        const managerRevisitAgents = [
          ...revisitAllAgents,
          ...extractRevisitAgents(parsedManagerReply, enabledAgents),
          ...getRuleDrivenRevisitAgents({ stageAgent: managerAgent, packet: parsedManagerReply, enabledAgents, agentRunCounts, maxRounds: maxRoundsPerAgent }),
        ]
          .filter((agent, index, list) => agent?.id ? list.findIndex((item) => item.id === agent.id) === index : false)
          .filter((agent) => agent.id !== managerAgent.id);
        const managerArtifact = String(parsedManagerReply.deliverable || '').trim();
        if (!hasMeaningfulArtifact(managerArtifact, cleanUserPrompt)) {
          logEvent('stage-noop', 'סקירת המנהל לא החזירה תוצר סופי שימושי', {
            state: 'error',
            agentId: managerAgent.id,
            agentLabel: managerAgent.name,
            agentName: managerAgent.name,
            provider: reviewProvider,
            model: managerAgent.model || getModelNameForProvider(reviewProvider, cfg, modelOverride),
            outputPreview: trimLogText(managerArtifact || managerReply || ''),
            errorMessage: 'סקירת המנהל הסתיימה ללא deliverable תקין',
          });
          throw new Error('סקירת המנהל הסתיימה ללא deliverable תקין. עצרתי כדי למנוע תוצאה ריקה.');
        }

        const managerNeedsRevisit = managerDirectives.managerDecide || managerDirectives.revisitAll || managerRevisitAgents.length || hasMeaningfulMissingItems(parsedManagerReply.missing);
        if (managerNeedsRevisit) {
          const fallbackPlanningManager = resolvePlanningManagerAgent(enabledAgents);
          const fallbackWorkerAgent = ['writer', 'proofreader', 'designer', 'researcher']
            .map((roleKey) => enabledAgents.find((agent) => agent?.id && agent.id !== managerAgent.id && getAgentRoleKey(agent) === roleKey))
            .find(Boolean)
            || enabledAgents.find((agent) => agent?.id && agent.id !== managerAgent.id)
            || null;
          const revisitTargets = managerRevisitAgents.length
            ? managerRevisitAgents
            : (fallbackPlanningManager && fallbackPlanningManager.id !== managerAgent.id
              ? [fallbackPlanningManager]
              : (fallbackWorkerAgent ? [fallbackWorkerAgent] : []));
          if (processedStages >= maxStageCount || finalManagerReviewPasses >= maxRoundsPerAgent) {
            logEvent('stage-revisit-required', 'סקירת המנהל דרשה סבב נוסף אך ה-workflow כבר הגיע למגבלת הסבבים', {
              state: 'error',
              agentId: managerAgent.id,
              agentLabel: managerAgent.name,
              agentName: managerAgent.name,
              provider: reviewProvider,
              model: managerAgent.model || getModelNameForProvider(reviewProvider, cfg, modelOverride),
              decision: parsedManagerReply.decision || '',
              missing: parsedManagerReply.missing || '',
            });
            throw new Error('סקירת manager סופית דרשה סבב נוסף, אבל ה-workflow כבר הגיע למגבלת הסבבים.');
          }

          const scheduledRevisits = enqueueWorkflowRevisits({
            requestedRevisits: revisitTargets,
            executionQueue,
            agentRunCounts,
            maxRounds: maxRoundsPerAgent,
            logEvent,
            requestedByAgent: managerAgent,
            requestedByLabel: managerAgent.name,
            decisionMode,
            decisionPreview: trimLogText(parsedManagerReply.decision || ''),
            missingPreview: trimLogText(parsedManagerReply.missing || ''),
            revisitReason: 'סקירת manager סופית דרשה סבב נוסף',
          });

          if (!scheduledRevisits.length) {
            logEvent('stage-revisit-required', 'סקירת המנהל דרשה סבב נוסף אך לא נמצא שלב המשך תקף', {
              state: 'error',
              agentId: managerAgent.id,
              agentLabel: managerAgent.name,
              agentName: managerAgent.name,
              provider: reviewProvider,
              model: managerAgent.model || getModelNameForProvider(reviewProvider, cfg, modelOverride),
              decision: parsedManagerReply.decision || '',
              missing: parsedManagerReply.missing || '',
            });
            throw new Error('סקירת manager סופית דרשה סבב נוסף, אבל לא נמצא שלב המשך תקף לביצוע.');
          }

          logEvent('stage-revisit-required', 'סקירת המנהל דרשה סבב נוסף לפני החזרה למשתמש', {
            state: 'retrying',
            agentId: managerAgent.id,
            agentLabel: managerAgent.name,
            agentName: managerAgent.name,
            provider: reviewProvider,
            model: managerAgent.model || getModelNameForProvider(reviewProvider, cfg, modelOverride),
            decision: parsedManagerReply.decision || '',
            missing: parsedManagerReply.missing || '',
            requestedAgents: scheduledRevisits.map((agent) => agent.id),
          });
          if (parsedManagerReply.handoff) batonNotes.push(`${managerAgent.name}: ${parsedManagerReply.handoff.replace(/\n+/g, ' ; ')}`);
          while (batonNotes.length > 10) batonNotes.shift();
          continue;
        }

        stagedOutput = managerArtifact;
        pendingFinalManagerReview = false;
        if (parsedManagerReply.handoff) batonNotes.push(`${managerAgent.name}: ${parsedManagerReply.handoff.replace(/\n+/g, ' ; ')}`);
        while (batonNotes.length > 10) batonNotes.shift();
      }

      const finalOutput = String(stagedOutput || cleanUserPrompt).trim();
      logEvent('workflow-success', 'כל שלבי העבודה הושלמו', {
        state: 'success',
        agentLabel: orderedAgents[orderedAgents.length - 1]?.name || agentLabel,
        agentName: orderedAgents[orderedAgents.length - 1]?.name || agentLabel,
        outputChars: finalOutput.length,
        outputPreview: trimLogText(finalOutput),
        artifactCount: stageArtifacts.length,
        stageArtifacts,
      });
      emitStatus(onStatus, {
        state: 'success',
        progress: 100,
        runId,
        provider: activeProvider,
        model: resolvedModel,
        agentLabel: orderedAgents[orderedAgents.length - 1]?.name || agentLabel,
        message: 'כל שלבי העבודה הושלמו'
      });
      return rememberSuccessfulReply(finalOutput);
    }
  }

  if (selectedProviders.length > 1 && !options.providerOverride && !options.skipMultiModel) {
    const providerNames = getProviderLabelMap(cfg);
    const skippedProviders = selectedProviders.filter((providerId) => !isProviderConfiguredForUse(providerId, cfg));
    const runnableProviders = selectedProviders.filter((providerId) => isProviderConfiguredForUse(providerId, cfg));

    logEvent('multi-model-start', `מצב Multi-Model פעיל עם ${selectedProviders.length} מנועים`, {
      state: 'running',
      selectedProviders,
      selectedProviderNames: selectedProviders.map((providerId) => providerNames[providerId] || providerId),
    });

    if (skippedProviders.length) {
      logEvent('multi-model-skipped', `חלק מהמנועים שנבחרו דולגו כי אינם מוגדרים`, {
        state: 'retrying',
        skippedProviders,
        skippedProviderNames: skippedProviders.map((providerId) => providerNames[providerId] || providerId),
      });
    }

    if (!runnableProviders.length) {
      throw new Error('לא הוגדרו מפתחות או כתובות תקינות עבור המודלים שבחרת.');
    }

    const collectedResponses = [];
    let firstError = null;

    for (let index = 0; index < runnableProviders.length; index += 1) {
      const providerId = runnableProviders[index];
      const providerLabel = providerNames[providerId] || providerId;
      emitStatus(onStatus, {
        state: 'running',
        progress: Math.min(70, 10 + Math.round((index / runnableProviders.length) * 55)),
        runId,
        provider: providerId,
        model: getModelNameForProvider(providerId, cfg, ''),
        agentLabel,
        attempt: 1,
        message: `מריץ ${providerLabel} (${index + 1}/${runnableProviders.length})`,
      });

      try {
        const providerReply = await chatWithActiveProvider(cleanUserPrompt, documentContext, extraSystemPrompt, {
          providerOverride: providerId,
          preferredProviders: runnableProviders,
          strictProviderOverride: true,
          modelOverride: taggedRouting.providerModels?.[providerId] || '',
          skipAutomation: true,
          skipMultiModel: true,
          shouldPersistMemory: false,
          runId,
          agentLabel: providerLabel,
          onStatus,
        });
        collectedResponses.push({ providerId, providerLabel, content: String(providerReply || '').trim() });
      } catch (error) {
        if (!firstError) firstError = error;
        logEvent('multi-model-provider-error', `המנוע ${providerLabel} נכשל`, {
          state: 'error',
          provider: providerId,
          agentLabel: providerLabel,
          errorMessage: error?.message || 'שגיאה לא ידועה',
        });
      }
    }

    if (!collectedResponses.length) {
      throw firstError || new Error('כל המודלים שנבחרו נכשלו.');
    }

    if (collectedResponses.length === 1) {
      logEvent('multi-model-fallback', 'רק מודל אחד החזיר תשובה תקינה', {
        state: 'success',
        provider: collectedResponses[0].providerId,
        agentLabel: collectedResponses[0].providerLabel,
      });
      return rememberSuccessfulReply(collectedResponses[0].content);
    }

    const mergeProviderId = collectedResponses.find((item) => item.providerId === activeProvider)?.providerId || collectedResponses[0].providerId;
    const mergeProviderLabel = providerNames[mergeProviderId] || mergeProviderId;

    logEvent('multi-model-merge', 'מאחד את התשובות ממספר מודלים', {
      state: 'running',
      provider: mergeProviderId,
      agentLabel: `${agentLabel} · איחוד`,
      responseCount: collectedResponses.length,
    });

    const mergePrompt = [
      `בקשת המשתמש המקורית:\n${cleanUserPrompt}`,
      'להלן כמה תשובות ממודלי AI שונים. אחד אותן לתשובה סופית אחת, ישימה, בהירה וקצרה בעברית.',
      'אל תציג למשתמש גרסאות נפרדות ואל תזכיר שהשתמשת בכמה מודלים — החזר רק את התוצאה המאוחדת הסופית.',
      ...collectedResponses.map((item, index) => `תשובה ${index + 1} (${item.providerLabel}):\n${item.content}`),
    ].join('\n\n');

    try {
      const mergedReply = await chatWithActiveProvider(mergePrompt, documentContext, 'אחד את כל הטיוטות לתשובה סופית חזקה אחת.', {
        providerOverride: mergeProviderId,
        preferredProviders: collectedResponses.map((item) => item.providerId),
        strictProviderOverride: true,
        modelOverride: taggedRouting.providerModels?.[mergeProviderId] || '',
        skipAutomation: true,
        skipMultiModel: true,
        shouldPersistMemory: false,
        runId,
        agentLabel: `${agentLabel} · איחוד`,
        onStatus,
      });

      logEvent('multi-model-success', 'האיחוד בין כמה מודלים הושלם', {
        state: 'success',
        provider: mergeProviderId,
        model: getModelNameForProvider(mergeProviderId, cfg, taggedRouting.providerModels?.[mergeProviderId] || ''),
        agentLabel: mergeProviderLabel,
        responseCount: collectedResponses.length,
        outputChars: String(mergedReply || '').length,
        outputPreview: trimLogText(mergedReply),
      });

      return rememberSuccessfulReply(mergedReply);
    } catch (mergeError) {
      logEvent('multi-model-merge-fallback', 'איחוד התשובות נכשל, מחזיר את התשובה הטובה הראשונה', {
        state: 'error',
        provider: mergeProviderId,
        errorMessage: mergeError?.message || 'שגיאה לא ידועה',
      });
      return rememberSuccessfulReply(collectedResponses[0].content);
    }
  }

  const runProviderRequest = async (signal) => {
    switch (activeProvider) {
      case 'gemini': {
        const key = cfg.gemini.key || localStorage.getItem("GEMINI_API_KEY") || "";
        if (!key) throw new Error('מפתח Gemini לא הוגדר — עבור להגדרות AI (תפריט קובץ)');
        const genAI = new GoogleGenerativeAI(key);
        const mdl = genAI.getGenerativeModel({ model: resolvedModel });
        const result = await mdl.generateContent(`${sysPrompt}\n\nמשתמש: ${cleanUserPrompt}`);
        return result.response.text();
      }
      case 'openai': {
        if (!cfg.openai.key) throw new Error('מפתח OpenAI לא הוגדר — עבור להגדרות AI (תפריט קובץ)');
        return callOpenAICompatible('https://api.openai.com/v1', cfg.openai.key, resolvedModel, [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: cleanUserPrompt },
        ], signal);
      }
      case 'claude': {
        if (!cfg.claude.key) throw new Error('מפתח Claude לא הוגדר — עבור להגדרות AI (תפריט קובץ)');
        return callClaudeApi(cfg.claude.key, resolvedModel, sysPrompt, cleanUserPrompt, signal);
      }
      case 'groq': {
        if (!cfg.groq.key) throw new Error('מפתח Groq לא הוגדר — עבור להגדרות AI (תפריט קובץ)');
        return callOpenAICompatible('https://api.groq.com/openai/v1', cfg.groq.key, resolvedModel, [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: cleanUserPrompt },
        ], signal);
      }
      case 'ollama': {
        const ollamaUrl = cfg.ollama.baseUrl || 'http://localhost:11434/v1';
        const ollamaModel = resolvedModel;
        if (!isLocalOpenAICompatibleBaseUrl(ollamaUrl)) {
          throw new Error('Ollama זמין רק עם endpoint מקומי מאושר — עבור להגדרות AI');
        }
        return callOpenAICompatible(ollamaUrl, '', ollamaModel, [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: cleanUserPrompt },
        ], signal);
      }
      case 'perplexity': {
        if (!cfg.perplexity.key) throw new Error('מפתח Perplexity לא הוגדר — עבור להגדרות AI (תפריט קובץ)');
        return callOpenAICompatible('https://api.perplexity.ai', cfg.perplexity.key, resolvedModel, [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: cleanUserPrompt },
        ], signal);
      }
      case 'custom': {
        const { baseUrl, key, model, name } = cfg.custom;
        if (!baseUrl || !model) throw new Error(`מנוע "${name || 'מותאם אישית'}" לא מוגדר במלואו — עבור להגדרות AI`);
        if (!String(key || '').trim() && !isLocalOpenAICompatibleBaseUrl(baseUrl)) {
          throw new Error(`מנוע "${name || 'מותאם אישית'}" דורש API key או endpoint מקומי מאושר — עבור להגדרות AI`);
        }
        return callOpenAICompatible(baseUrl, key, resolvedModel, [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: cleanUserPrompt },
        ], signal);
      }
      default:
        throw new Error('ספק AI לא ידוע');
    }
  };

  logEvent('provider-start', `שולח בקשה למנוע ${activeProvider}`, {
    state: 'running',
    provider: activeProvider,
    model: resolvedModel,
  });
  emitStatus(onStatus, { state: 'running', progress: 12, runId, provider: activeProvider, model: resolvedModel, agentLabel, message: 'מתחיל עיבוד' });
  let lastError = null;
  const fallbackPool = constrainedProviders.length || selectedProviders.length > 1
    ? getConfiguredProviderPool(cfg, selectedProviders)
    : getConfiguredProviderPool(cfg);
  const hasPinnedSingleTaggedProvider = !preferredProviders.length && taggedProviders.length === 1;
  const allowCrossProviderFallback = !disableFallback
    && !hasPinnedSingleTaggedProvider
    && options.strictProviderOverride !== true
    && fallbackPool.length > 1;

  for (let attempt = 0; attempt <= effectiveRetries; attempt += 1) {
    try {
      logEvent('attempt-start', attempt === 0 ? 'שולח בקשה לסוכן' : `ניסיון חוזר ${attempt + 1}`, {
        state: 'running',
        attempt: attempt + 1,
        maxAttempts: effectiveRetries + 1,
      });
      emitStatus(onStatus, {
        state: 'running',
        progress: Math.min(85, 20 + (attempt * 15)),
        runId,
        provider: activeProvider,
        model: resolvedModel,
        agentLabel,
        attempt: attempt + 1,
        message: attempt === 0 ? 'שולח בקשה לסוכן' : `ניסיון חוזר ${attempt + 1}`,
      });
      const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const result = await withTimeout(runProviderRequest(abortController?.signal), timeoutMs, () => abortController?.abort());
      logEvent('attempt-success', 'התקבלה תשובה מהמנוע', {
        state: 'success',
        attempt: attempt + 1,
        responseChars: String(result || '').length,
        responsePreview: trimLogText(result),
      });
      emitStatus(onStatus, { state: 'success', progress: 100, runId, provider: activeProvider, model: resolvedModel, agentLabel, attempt: attempt + 1, message: 'הושלם' });
      return rememberSuccessfulReply(result);
    } catch (error) {
      lastError = error;
      const errMsg = error?.message || '';
      const isModelError = /(404|not_found|invalid.model|invalid_model)/i.test(errMsg);
      if (isModelError) {
        logEvent('attempt-error', `מודל לא תקין (${resolvedModel}), מדלג על ניסיונות חוזרים`, {
          state: 'error',
          attempt: attempt + 1,
          errorMessage: errMsg,
        });
        break;
      }
      if (attempt < effectiveRetries) {
        logEvent('attempt-retry', `הבקשה נכשלה, יתבצע ניסיון נוסף (${attempt + 2}/${effectiveRetries + 1})`, {
          state: 'retrying',
          attempt: attempt + 1,
          nextAttempt: attempt + 2,
          errorMessage: error?.message || 'שגיאה לא ידועה',
        });
        emitStatus(onStatus, {
          state: 'retrying',
          progress: Math.min(90, 35 + (attempt * 10)),
          runId,
          provider: activeProvider,
          model: resolvedModel,
          agentLabel,
          attempt: attempt + 1,
          message: `נכשל, מנסה שוב (${attempt + 2}/${effectiveRetries + 1})`,
        });
        await wait(Math.min(1200 * (attempt + 1), 2500));
        continue;
      }
      logEvent('attempt-error', 'הבקשה נכשלה סופית', {
        state: 'error',
        attempt: attempt + 1,
        errorMessage: error?.message || 'שגיאה לא ידועה',
      });
      emitStatus(onStatus, { state: 'error', progress: 100, runId, provider: activeProvider, model: resolvedModel, agentLabel, attempt: attempt + 1, message: error?.message || 'שגיאה' });
    }
  }

  // ─── Fallback: שרשרת גיבוי — מנסה ספקים מוגדרים אחרים לפי סדר עדיפות ─────
  if (allowCrossProviderFallback) {
    const fallbackCandidates = fallbackPool.filter((pid) => pid !== activeProvider);

    for (const fallbackProvider of fallbackCandidates) {
      try {
        const fallbackModel = getModelNameForProvider(fallbackProvider, cfg, '');
        logEvent('provider-fallback', `מנוע ${activeProvider} נכשל, מנסה גיבוי: ${fallbackProvider}`, {
          state: 'retrying',
          originalProvider: activeProvider,
          originalModel: resolvedModel,
          fallbackProvider,
          fallbackModel,
          errorMessage: lastError?.message || '',
        });
        emitStatus(onStatus, {
          state: 'retrying',
          progress: 50,
          runId,
          provider: fallbackProvider,
          model: fallbackModel,
          agentLabel,
          message: `מנוע ${activeProvider} נכשל — עובר לגיבוי: ${fallbackProvider}`,
        });

        const fallbackText = await chatWithActiveProvider(cleanUserPrompt, documentContext, extraSystemPrompt, {
          ...options,
          providerOverride: fallbackProvider,
          preferredProviders: [fallbackProvider],
          strictProviderOverride: true,
          modelOverride: taggedRouting.providerModels?.[fallbackProvider] || '',
          skipAutomation: true,
          shouldPersistMemory: false,
          disableFallback: true,
          runId,
          agentLabel,
        });

        logEvent('provider-fallback-success', `${fallbackProvider} החזיר תשובת גיבוי`, {
          state: 'success',
          fallbackProvider,
          responseChars: String(fallbackText || '').length,
        });
        emitStatus(onStatus, {
          state: 'success',
          progress: 100,
          runId,
          provider: fallbackProvider,
          model: fallbackModel,
          agentLabel,
          message: `הושלם (גיבוי: ${fallbackProvider})`,
        });
        return rememberSuccessfulReply(fallbackText);
      } catch (fallbackError) {
        logEvent('provider-fallback-error', `גם ${fallbackProvider} נכשל בגיבוי`, {
          state: 'error',
          fallbackProvider,
          errorMessage: fallbackError?.message || '',
        });
        // ממשיך לניסיון הבא בשרשרת
      }
    }
  }

  throw lastError || new Error('שגיאה לא ידועה בבקשת AI');
};

// ═══════════════════════════════════════
// Inline AI Agents — routes via active provider
// ═══════════════════════════════════════
const buildPrompt = (agentConfig, selectedText, context = "") => {
  return [agentConfig.systemCtx, context ? `הקשר:\n${context}` : "", `טקסט:\n${selectedText}`]
    .filter(Boolean).join("\n\n");
};

export const callAiAgent = async (agentId, selectedText, context = "") => {
  const agentConf = AGENTS_CONFIG[agentId];
  if (!agentConf) throw new Error("Invalid agent ID");
  const fullPrompt = buildPrompt(agentConf, selectedText, context);
  // משתמש במנוע הפעיל הנבחר (לא תמיד Gemini)
  return chatWithActiveProvider(fullPrompt, context, '', { skipAutomation: true, skipMultiModel: true, strictFormatting: true });
};

export const applyInlineAi = async (editor, agentId) => {
  const { from, to, empty } = editor.state.selection;
  if (empty) return;
  const selectedText = editor.state.doc.textBetween(from, to, " ");
  if (!selectedText.trim()) return;
  const originalSlice = JSON.stringify(editor.state.doc.slice(from, to).content.toJSON());
  const serializer = DOMSerializer.fromSchema(editor.schema);
  const fragment = serializer.serializeFragment(editor.state.doc.slice(from, to).content);
  const tempDiv = document.createElement('div');
  tempDiv.appendChild(fragment);
  const originalHtml = tempDiv.innerHTML;
  const aiResultText = await callAiAgent(agentId, selectedText);
  if (!aiResultText) return;
  const clean = aiResultText.replace(/^```html\s*/i, "").replace(/```\s*$/, "").trim();
  editor.chain().focus().deleteSelection().insertContent(clean).run();
  const insertedTo = editor.state.selection.to;
  editor.chain().focus()
    .setTextSelection({ from, to: insertedTo })
    .setMark("aiSuggestion", { agentType: agentId, originalText: selectedText, originalSlice, originalHtml })
    .run();
};

export const chatWithRoleAgent = async (agent, userPrompt, documentContext = '', runtimeOptions = {}) => {
  if (!agent?.prompt) throw new Error('לסוכן התפקידי אין הנחיה שמורה');
  const cfg = getProviderConfig();
  const selectedProviders = getSelectedProviderIds(cfg);
  const providerOverride = chooseProviderForAgent(agent, cfg, selectedProviders);
  return chatWithActiveProvider(userPrompt, documentContext, agent.prompt, {
    providerOverride,
    preferredProviders: selectedProviders,
    modelOverride: agent.model,
    agentLabel: agent.name || 'סוכן תפקידי',
    agentName: agent.name || 'סוכן תפקידי',
    onStatus: runtimeOptions.onStatus,
    skillId: runtimeOptions.skillId || '',
    autoUseDefaultSkill: runtimeOptions.autoUseDefaultSkill !== false,
    skipAutomation: true,
    skipMultiModel: true,
  });
};

// Chef Mode Interview - generates document based on interview responses
const formatChefResponseLine = (response = {}, index = 0) => {
  const questionId = Number(response?.question) || index + 1;
  const questionText = String(response?.questionText || '').trim();
  const choices = Array.isArray(response?.choices) ? response.choices.filter(Boolean).join(' | ') : '';
  const freeText = String(response?.freeText || '').trim();
  const fallback = String(response?.answer || '').trim();
  const answerText = [choices, freeText].filter(Boolean).join(' || ') || fallback || 'לא סופק';
  const questionLabel = questionText ? `שאלה ${questionId}: ${questionText}` : `שאלה ${questionId}`;
  return `${questionLabel}\nתשובה: ${answerText}`;
};

const formatChefMaterialsSummary = (selectedMaterials = []) => {
  if (!Array.isArray(selectedMaterials) || !selectedMaterials.length) return 'ללא חומרי עזר נבחרים';
  return selectedMaterials
    .slice(0, 8)
    .map((item, idx) => `- ${idx + 1}. ${String(item?.title || 'ללא שם')} (${String(item?.label || 'כללי')})`)
    .join('\n');
};

const normalizeChefQuestionPayload = (payload = {}, fallbackStep = 1) => {
  const options = Array.isArray(payload?.options) ? payload.options.filter(Boolean).map((item) => String(item).trim()).filter(Boolean).slice(0, 6) : [];
  return {
    shouldStop: Boolean(payload?.shouldStop),
    question: String(payload?.question || '').trim() || `מה חשוב לך להדגיש בשלב ${fallbackStep}?`,
    options,
    placeholder: String(payload?.placeholder || '').trim() || 'אפשר גם לכתוב חופשי...',
    reason: String(payload?.reason || '').trim() || 'dynamic',
  };
};

export const chefModeGenerateQuestion = async (params = {}) => {
  const cfg = getProviderConfig();
  const maxQuestions = Number(params?.maxQuestions) > 0 ? Number(params.maxQuestions) : 13;
  const step = Number(params?.step) > 0 ? Number(params.step) : 1;
  const selectedModel = String(params?.selectedModel || cfg.active || 'gemini');
  const responses = Array.isArray(params?.responses) ? params.responses : [];
  const documentPrompt = String(params?.documentPrompt || '').trim();
  const templateId = String(params?.templateId || 'blank').trim();
  const instructions = String(params?.instructions || '').trim();
  const selectedMaterials = Array.isArray(params?.selectedMaterials) ? params.selectedMaterials : [];

  if (responses.length >= maxQuestions) {
    return { shouldStop: true, question: '', options: [], placeholder: '', reason: 'max-questions-reached' };
  }

  const responsesText = responses.map((r, idx) => formatChefResponseLine(r, idx)).join('\n\n') || 'אין תשובות עדיין';
  const materialsText = formatChefMaterialsSummary(selectedMaterials);
  const prompt = [
    'אתה סוכן Chef שמכין שאלת המשך אחת בלבד לתהליך אפיון מסמך.',
    `שלב נוכחי: ${step} מתוך ${maxQuestions}.`,
    'החזר JSON בלבד במבנה:',
    '{"shouldStop":false,"question":"...","options":["..."],"placeholder":"...","reason":"..."}',
    'כללים:',
    '- השאלה חייבת להיות מותאמת לקונטקסט: פרומפט, תבנית, הנחיות וחומרי עזר.',
    '- options: בין 3 ל-5 אפשרויות קצרות וברורות.',
    '- אם יש מספיק מידע לכתיבה מלאה, החזר shouldStop=true ללא שאלה.',
    '- אל תייצר שאלות כלליות מדי אם כבר יש תשובות בנושא.',
    '- אם כבר יש מטרה ברורה, קהל יעד, מבנה וטון בפרומפט או בתשובות קודמות — החזר shouldStop=true מיד. אל תשאל שאלות שוליות שלא מוסיפות מידע שאינו כבר ידוע.',
    '',
    `פרומפט יצירה: ${documentPrompt || 'לא הוזן פרומפט מפורש'}`,
    `תבנית נבחרת: ${templateId}`,
    `הנחיות משתמש: ${instructions || 'ללא הנחיות נוספות'}`,
    `חומרי עזר:\n${materialsText}`,
    '',
    `תשובות קודמות:\n${responsesText}`,
  ].join('\n');

  try {
    const raw = await chatWithActiveProvider(prompt, '', '', {
      providerOverride: selectedModel,
      strictProviderOverride: true,
      strictFormatting: true,
      skipAutomation: true,
      skipMultiModel: true,
      agentLabel: 'Chef Question Planner',
      runId: `chef-q-${Date.now()}`,
    });
    const parsed = safeJsonParse(raw, null);
    return normalizeChefQuestionPayload(parsed || {}, step);
  } catch {
    return normalizeChefQuestionPayload({
      shouldStop: false,
      question: `מה עוד חשוב לדייק כדי שהתוצאה תהיה בול למה שאתה צריך? (שלב ${step})`,
      options: ['קהל יעד', 'טון כתיבה', 'מבנה מסמך', 'מידע שחייב להופיע'],
      placeholder: 'אפשר לציין כאן דגשים ספציפיים... ',
      reason: 'fallback',
    }, step);
  }
};

export const chefModeInterview = async (userResponses = [], selectedModel = 'gemini', onStatus = null) => {
  const cfg = getProviderConfig();
  
  // Format responses for the Chef agent
  const responsesText = userResponses
    .map((r, idx) => formatChefResponseLine(r, idx))
    .join('\n\n');

  const systemPrompt = `== AGENT: CHEF ==
אתה שף כתיבה שמזקק את תשובות המשתמש לבריף יצירה חד וברור.

המטרה: להחזיר בריף טקסטואלי קצר שיישלח למנוע יצירת המסמך (לא מסמך HTML סופי).

החזר בדיוק 6 שורות בפורמט הבא:
נושא:
מטרה:
קהל יעד:
טון וסגנון:
מבנה ואורך:
דגשים מחייבים:

אל תחזיר HTML, אל תחזיר markdown, ואל תוסיף הקדמות.
== END AGENT ==`;

  const userPrompt = `הנה תשובות הבישול של המשתמש:

${responsesText}

זקק אותן לבריף יצירה חד וברור בהתאם לפורמט שהוגדר.`;

  const runId = `chef-${Date.now()}`;
  
  try {
    logAgentDebugEvent({
      type: 'chef-mode-start',
      state: 'running',
      runId,
      agentLabel: 'שף בישול',
      message: 'התחיל שלב הבישול',
      responsesCount: userResponses.length,
      selectedModel,
    });

    const response = await chatWithActiveProvider(
      userPrompt,
      '',
      systemPrompt,
      {
        agentLabel: 'שף בישול',
        runId,
        onStatus,
        strictProviderOverride: true,
        strictFormatting: true,
        skipAutomation: true,
        skipMultiModel: true,
        providerOverride: selectedModel || cfg.active,
      }
    );

    if (!response || !String(response).trim()) {
      throw new Error('לא קיבלנו תשובה מהשף');
    }

    logAgentDebugEvent({
      type: 'chef-mode-success',
      state: 'success',
      runId,
      agentLabel: 'שף בישול',
      message: 'המסמך נוצר בהצלחה דרך שלב הבישול',
      outputChars: response.length,
    });

    const brief = String(response || '').trim();
    return {
      brief,
      html: brief,
      success: true,
      runId,
    };
  } catch (error) {
    logAgentDebugEvent({
      type: 'chef-mode-error',
      state: 'error',
      runId,
      agentLabel: 'שף בישול',
      message: 'שגיאה בשלב הבישול',
      errorMessage: error?.message || 'שגיאה לא ידועה',
    });

    throw error;
  }
};

export const chefModeDecideNextStep = async (userResponses = [], selectedModel = 'gemini', options = {}) => {
  const cfg = getProviderConfig();
  const maxQuestions = Number(options?.maxQuestions) > 0 ? Number(options.maxQuestions) : 13;
  const currentQuestionId = Number(options?.currentQuestionId) || null;
  const answeredCount = Array.isArray(userResponses) ? userResponses.length : 0;

  if (answeredCount >= maxQuestions) {
    return { shouldStop: true, reason: 'max-questions-reached' };
  }

  const documentPrompt = String(options?.documentPrompt || '').trim();
  const templateId = String(options?.templateId || 'blank').trim();
  const instructions = String(options?.instructions || '').trim();
  const materialsText = formatChefMaterialsSummary(options?.selectedMaterials || []);
  const responsesText = (userResponses || []).map((r, idx) => formatChefResponseLine(r, idx)).join('\n\n');
  const prompt = [
    'אתה מחליט אם יש מספיק מידע להתחיל כתיבת מסמך.',
    `מספר שאלות מקסימלי: ${maxQuestions}.`,
    currentQuestionId ? `השאלה האחרונה שנענתה: ${currentQuestionId}.` : '',
    'החזר JSON בלבד במבנה:',
    '{"shouldStop":true|false,"reason":"..."}',
    'כללים:',
    '- shouldStop=true רק אם ברור שיש מטרה, קהל, מבנה וטון.',
    '- התחשב בפרומפט, בתבנית, בהנחיות ובחומרי העזר.',
    '',
    `פרומפט יצירה: ${documentPrompt || 'לא הוזן פרומפט מפורש'}`,
    `תבנית: ${templateId}`,
    `הנחיות: ${instructions || 'ללא הנחיות נוספות'}`,
    `חומרי עזר:\n${materialsText}`,
    '',
    `תשובות עד כה:\n${responsesText || 'אין תשובות'}`,
  ].filter(Boolean).join('\n');

  try {
    const raw = await chatWithActiveProvider(prompt, '', '', {
      providerOverride: selectedModel || cfg.active,
      strictProviderOverride: true,
      strictFormatting: true,
      skipAutomation: true,
      skipMultiModel: true,
      agentLabel: 'Chef Decision',
      runId: `chef-decision-${Date.now()}`,
    });
    const parsed = safeJsonParse(raw, null);
    return {
      shouldStop: Boolean(parsed?.shouldStop),
      reason: String(parsed?.reason || '').trim() || 'ai-decision',
    };
  } catch {
    return {
      shouldStop: false,
      reason: 'fallback-sequential',
    };
  }
};

// Legacy alias
export const chatWithAi = chatWithActiveProvider;

// ═══════════════════════════════════════
// בדיקת תקינות ספק — שולח הודעה קצרה ובודק תשובה
// ═══════════════════════════════════════
const PROVIDER_MODEL_FALLBACKS = {
  gemini: ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.0-pro'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
  claude: ['claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-opus-4-7'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
  perplexity: ['sonar-pro', 'sonar', 'sonar-reasoning-pro'],
  ollama: [],
  custom: [],
};

const TEST_PROMPT = [{ role: 'user', content: 'אמור "אוקי" בלבד.' }];
const GEMINI_TEST_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const pingGemini = async (key, model, signal) => {
  const url = `${GEMINI_TEST_URL}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'אמור "אוקי" בלבד.' }] }] }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'ok';
};

const pingClaude = async (key, model, signal) => {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 16, messages: [{ role: 'user', content: 'אמור "אוקי" בלבד.' }] }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || 'ok';
};

const pingOpenAICompatible = async (baseUrl, key, model, signal) => {
  const url = baseUrl.replace(/\/$/, '') + '/chat/completions';
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['Authorization'] = `Bearer ${key}`;
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers,
    body: JSON.stringify({ model, messages: TEST_PROMPT, max_tokens: 16, stream: false }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || 'ok';
};

/**
 * testProviderConnection — בודק חיבור לספק AI מסוים.
 * מנסה תחילה את המודל הנבחר, ואם נכשל — ממשיך לגיבויים.
 * מחזיר { ok, model, error, triedModels }
 */
export const testProviderConnection = async (providerId, providerConfig = {}) => {
  const cfg = getProviderConfig();
  const pCfg = { ...cfg[providerId], ...providerConfig };
  const requestedModel = String(pCfg.model || '').trim();
  const fallbacks = PROVIDER_MODEL_FALLBACKS[providerId] || [];
  const modelsToTry = providerId === 'ollama'
    ? [requestedModel || 'llama3.2']
    : requestedModel
      ? [requestedModel, ...fallbacks.filter((m) => m !== requestedModel)]
      : fallbacks;

  if (!modelsToTry.length) modelsToTry.push('default');

  const triedModels = [];
  let lastError = '';

  for (const model of modelsToTry) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    triedModels.push(model);
    try {
      let reply = '';
      if (providerId === 'gemini') {
        const key = String(pCfg.key || '').trim();
        if (!key) throw new Error('מפתח API חסר');
        reply = await pingGemini(key, model, controller.signal);
      } else if (providerId === 'claude') {
        const key = String(pCfg.key || '').trim();
        if (!key) throw new Error('מפתח API חסר');
        reply = await pingClaude(key, model, controller.signal);
      } else if (providerId === 'openai') {
        const key = String(pCfg.key || '').trim();
        if (!key) throw new Error('מפתח API חסר');
        reply = await pingOpenAICompatible('https://api.openai.com/v1', key, model, controller.signal);
      } else if (providerId === 'groq') {
        const key = String(pCfg.key || '').trim();
        if (!key) throw new Error('מפתח API חסר');
        reply = await pingOpenAICompatible('https://api.groq.com/openai/v1', key, model, controller.signal);
      } else if (providerId === 'perplexity') {
        const key = String(pCfg.key || '').trim();
        if (!key) throw new Error('מפתח API חסר');
        reply = await pingOpenAICompatible('https://api.perplexity.ai', key, model, controller.signal);
      } else if (providerId === 'ollama') {
        const baseUrl = String(pCfg.baseUrl || 'http://localhost:11434/v1').trim();
        if (!isLocalOpenAICompatibleBaseUrl(baseUrl)) throw new Error('כתובת Ollama חייבת להיות מקומית');
        reply = await pingOpenAICompatible(baseUrl, '', model, controller.signal);
      } else if (providerId === 'custom') {
        const baseUrl = String(pCfg.baseUrl || '').trim();
        if (!baseUrl) throw new Error('כתובת API חסרה');
        const key = String(pCfg.key || '').trim();
        if (!key && !isLocalOpenAICompatibleBaseUrl(baseUrl)) throw new Error('מפתח API חסר');
        reply = await pingOpenAICompatible(baseUrl, key, model, controller.signal);
      } else {
        throw new Error(`ספק לא מוכר: ${providerId}`);
      }
      clearTimeout(timeout);
      return { ok: true, model, reply: String(reply || '').slice(0, 80), triedModels, error: '' };
    } catch (err) {
      clearTimeout(timeout);
      lastError = err?.name === 'AbortError' ? 'הבקשה פגה (timeout 12s)' : (err?.message || 'שגיאה לא ידועה');
      // אם זה שגיאת אימות/מפתח/כתובת — אין טעם לנסות מודל אחר
      if (/401|403|מפתח|כתובת/.test(lastError)) break;
    }
  }

  return { ok: false, model: '', reply: '', triedModels, error: lastError };
};

// יצוא הפונקציות החדשות לחלונית
if (typeof window !== 'undefined') {
  window.debugWorkspaceInfo = debugWorkspaceInfo;
  window.listAllWorkspaces = listAllWorkspaces;
  window.switchToWorkspace = switchToWorkspace;
}
