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
  gemini:     { key: '' },
  openai:     { key: '', model: 'gpt-4o' },
  claude:     { key: '', model: 'claude-sonnet-4-6' },
  groq:       { key: '', model: 'llama-3.3-70b-versatile' },
  ollama:     { baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' },
  perplexity: { key: '', model: 'sonar-pro' },
  custom:     { name: '', baseUrl: '', key: '', model: '' },
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
  autoDispatch: true,
  autopilotEnabled: true,
  workspaceName: 'סביבת עבודה מותאמת',
  sharedGoal: '',
  retryEnabled: true,
  maxRetries: 2,
  requestTimeoutMs: 45,
  showProgress: true,
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
    prompt: 'כתוב ושכתב טקסטים בעברית מקצועית, בהירה ומשכנעת. התאם את הניסוח לסגנון האישי של המשתמש והחזר תוצאה ישימה למסמך.',
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

const isProviderConfiguredForUse = (providerId, cfg) => {
  const provider = cfg?.[providerId] || {};
  switch (providerId) {
    case 'gemini':
    case 'openai':
    case 'claude':
    case 'groq':
    case 'perplexity':
      return Boolean(String(provider.key || '').trim());
    case 'ollama':
      return Boolean(String(provider.baseUrl || '').trim() && String(provider.model || '').trim());
    case 'custom':
      return Boolean(String(provider.baseUrl || '').trim() && String(provider.model || '').trim());
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
};

export const getAssistantBehavior = () => ({
  ...DEFAULT_ASSISTANT_BEHAVIOR,
  ...readJsonFromStorage('wordai_assistant_behavior', {}),
});

export const saveAssistantBehavior = (config) => {
  localStorage.setItem('wordai_assistant_behavior', JSON.stringify({ ...DEFAULT_ASSISTANT_BEHAVIOR, ...config }));
};

const normalizeSkillMode = (value = '') => {
  const clean = String(value || '').trim().toLowerCase();
  return ['manual', 'auto', 'off'].includes(clean) ? clean : 'manual';
};

export const getSkillCatalog = () => SKILL_LIBRARY.map((skill) => ({ ...skill }));

export const getSkillsConfig = () => {
  const stored = readJsonFromStorage('wordai_skills_config', {});
  const skills = {};

  SKILL_LIBRARY.forEach((skill) => {
    skills[skill.id] = {
      mode: normalizeSkillMode(stored.skills?.[skill.id]?.mode || DEFAULT_SKILLS_CONFIG.skills?.[skill.id]?.mode || 'manual'),
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
    };
  });

  localStorage.setItem('wordai_skills_config', JSON.stringify(next));
  return next;
};

export const getWordPreferences = () => ({
  ...DEFAULT_WORD_PREFERENCES,
  ...readJsonFromStorage('wordai_word_preferences', {}),
});

export const saveWordPreferences = (config) => {
  localStorage.setItem('wordai_word_preferences', JSON.stringify({ ...DEFAULT_WORD_PREFERENCES, ...config }));
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
};

export const getWorkspaceAutomation = () => ({
  ...DEFAULT_WORKSPACE_AUTOMATION,
  ...readJsonFromStorage('wordai_workspace_automation', {}),
});

export const saveWorkspaceAutomation = (config) => {
  localStorage.setItem('wordai_workspace_automation', JSON.stringify({
    ...DEFAULT_WORKSPACE_AUTOMATION,
    ...config,
  }));
};

export const getSharedAgentInstructions = () => String(localStorage.getItem('wordai_shared_agent_instructions') || '').trim();

export const saveSharedAgentInstructions = (value = '') => {
  localStorage.setItem('wordai_shared_agent_instructions', String(value || '').trim());
};

export const getRoleAgents = () => {
  const stored = readJsonFromStorage('wordai_role_agents', null);
  if (stored === null) return DEFAULT_ROLE_AGENTS;
  if (!Array.isArray(stored)) return DEFAULT_ROLE_AGENTS;
  return stored.map((agent, index) => {
    const provider = agent.provider || '';
    return {
      id: agent.id || `custom-${index + 1}`,
      name: agent.name || `סוכן ${index + 1}`,
      prompt: agent.prompt || '',
      provider,
      model: normalizeProviderModelName(provider, agent.model || ''),
      enabled: agent.enabled !== false,
    };
  });
};

export const saveRoleAgents = (agents) => {
  const cleanAgents = (Array.isArray(agents) ? agents : [])
    .map((agent, index) => {
      const provider = String(agent.provider || '').trim();
      return {
        id: agent.id || `custom-${index + 1}`,
        name: String(agent.name || '').trim(),
        prompt: String(agent.prompt || '').trim(),
        provider,
        model: normalizeProviderModelName(provider, String(agent.model || '').trim()),
        enabled: agent.enabled !== false,
      };
    });

  localStorage.setItem('wordai_role_agents', JSON.stringify(cleanAgents));
};

export const getOrderedRoleAgents = (workflowMode = getWorkspaceAutomation().workflowMode) => {
  const agents = getRoleAgents().filter((agent) => agent.enabled !== false);
  if (workflowMode === 'custom-order') return agents;

  const desiredOrders = {
    'manager-auto': ['manager', 'researcher', 'designer', 'writer', 'proofreader'],
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
    active: safeActive,
  };
  merged.claude.model = normalizeProviderModelName('claude', merged.claude.model || DEFAULT_PROVIDER_CONFIG.claude.model);
  merged.perplexity.model = normalizeProviderModelName('perplexity', merged.perplexity.model || DEFAULT_PROVIDER_CONFIG.perplexity.model);
  merged.ollama.model = normalizeProviderModelName('ollama', merged.ollama.model || DEFAULT_PROVIDER_CONFIG.ollama.model);
  merged.custom.model = normalizeProviderModelName('custom', merged.custom.model || '');
  merged.activeProviders = normalizeProviderIds(merged.activeProviders || [safeActive], safeActive);
  merged.multiModelEnabled = Boolean(merged.multiModelEnabled);
  return merged;
};

export const getProviderConfig = () => {
  try {
    const stored = JSON.parse(localStorage.getItem('ai_provider_config') || '{}');
    return normalizeProviderConfig(stored);
  } catch {
    return normalizeProviderConfig({});
  }
};

export const saveProviderConfig = (config, options = {}) => {
  const safeConfig = normalizeProviderConfig(config);
  localStorage.setItem('ai_provider_config', JSON.stringify(safeConfig));
  if (safeConfig.gemini?.key) localStorage.setItem('GEMINI_API_KEY', safeConfig.gemini.key);
  else localStorage.removeItem('GEMINI_API_KEY');

  if (!options?.skipDisk && window.desktopApp?.saveProviderConfig) {
    window.desktopApp.saveProviderConfig(safeConfig).catch(() => {});
  }

  return safeConfig;
};

let providerConfigHydrationPromise = null;

export const hydrateProviderConfigFromDisk = async () => {
  if (!window.desktopApp?.loadProviderConfig) return getProviderConfig();
  if (providerConfigHydrationPromise) return providerConfigHydrationPromise;

  providerConfigHydrationPromise = (async () => {
    try {
      const diskConfig = await window.desktopApp.loadProviderConfig();
      if (!diskConfig || typeof diskConfig !== 'object' || diskConfig.ok === false) {
        const current = getProviderConfig();
        saveProviderConfig(current);
        return current;
      }

      const localRaw = JSON.parse(localStorage.getItem('ai_provider_config') || '{}');
      const merged = normalizeProviderConfig({
        ...diskConfig,
        ...localRaw,
        gemini: { ...(diskConfig.gemini || {}), ...(localRaw.gemini || {}) },
        openai: { ...(diskConfig.openai || {}), ...(localRaw.openai || {}) },
        claude: { ...(diskConfig.claude || {}), ...(localRaw.claude || {}) },
        groq: { ...(diskConfig.groq || {}), ...(localRaw.groq || {}) },
        ollama: { ...(diskConfig.ollama || {}), ...(localRaw.ollama || {}) },
        perplexity: { ...(diskConfig.perplexity || {}), ...(localRaw.perplexity || {}) },
        custom: { ...(diskConfig.custom || {}), ...(localRaw.custom || {}) },
      });

      saveProviderConfig(merged);
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

const getSelectedProviderIds = (cfg = getProviderConfig(), forceSingle = false) => {
  if (forceSingle) return [cfg.active];
  if (!cfg.multiModelEnabled) return [cfg.active];
  const normalized = normalizeProviderIds(cfg.activeProviders || [cfg.active], cfg.active);
  return [cfg.active, ...normalized.filter((providerId) => providerId !== cfg.active)];
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

const getSkillMatchScore = (skill = {}, text = '') => {
  const haystack = String(text || '').toLowerCase();
  return (Array.isArray(skill.keywords) ? skill.keywords : []).reduce((score, keyword) => {
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
      if ((config.skills?.[skill.id]?.mode || 'manual') !== 'auto') return { skill, score: 0 };
      const promptScore = getSkillMatchScore(skill, promptText);
      const contextScore = Math.min(1, getSkillMatchScore(skill, contextText));
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

const buildSkillSystemPrompt = (skill = null, reason = 'manual') => {
  if (!skill?.prompt) return '';
  const reasonText = reason === 'auto'
    ? 'הסקיל הופעל אוטומטית לפי סוג הבקשה.'
    : reason === 'default'
      ? 'זהו סקיל ברירת המחדל שהוגדר למשתמש.'
      : 'הסקיל הופעל ידנית על ידי המשתמש.';
  return `סקיל פעיל: ${skill.label}.\n${reasonText}\n${skill.prompt}`;
};

const buildWorkspaceAutomationInstructions = () => {
  const automation = getWorkspaceAutomation();
  if (!automation.enabled) return '';

  const enabledAgents = getOrderedRoleAgents(automation.workflowMode);
  const agentNames = enabledAgents.map((agent) => agent.name).filter(Boolean);
  const agentInstructions = enabledAgents
    .map((agent) => `${agent.name}: ${String(agent.prompt || '').trim()}`)
    .filter(Boolean)
    .join('\n');
  const customOrderedFlow = agentNames.length
    ? `עבוד לפי סדר הסוכנים המותאם שהוגדר על ידי המשתמש: ${agentNames.join(' ← ')}.`
    : 'עבוד לפי סדר הסוכנים שהוגדר על ידי המשתמש.';

  const workflowMap = {
    'manager-auto': 'עבוד במצב AUTOPILOT מלא: קודם תכנן, אחר כך קבע לבד אילו תפקידים נדרשים, איזה מודל מתאים לכל שלב, ובאיזה סדר להפעיל אותם. החזר תהליך מתואם וסופי.',
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
    automation.workflowMode === 'manager-auto'
      ? 'פעל כמו מנהל עבודה אמיתי: נתח את ההנחיה, את טיוטת המסמך ואת חומרי העזר, בחר אילו סוכנים באמת נדרשים, קבע סדר, והעבר ביניהם שרביט עם משימות ברורות.'
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

const getConfiguredProviderPool = (cfg = getProviderConfig(), preferredProviders = []) => {
  const preferred = normalizeProviderIds(preferredProviders, cfg.active);
  const configured = KNOWN_PROVIDER_IDS.filter((providerId) => isProviderConfiguredForUse(providerId, cfg));
  return [...new Set([...preferred, ...configured, cfg.active].filter(Boolean))];
};

const getAgentRoleKey = (agent = {}) => {
  const value = `${String(agent?.id || '')} ${String(agent?.name || '')}`.toLowerCase();
  if (/(research|source|חוקר|מקורות)/i.test(value)) return 'researcher';
  if (/(design|structure|outline|מבנה|מעצב)/i.test(value)) return 'designer';
  if (/(proof|review|editor|מגיה|בודק)/i.test(value)) return 'proofreader';
  if (/(writer|draft|כותב)/i.test(value)) return 'writer';
  if (/(manager|מנהל)/i.test(value)) return 'manager';
  return 'general';
};

const chooseProviderForAgent = (agent = {}, cfg = getProviderConfig(), preferredProviders = []) => {
  const explicitProvider = String(agent?.provider || '').trim();
  if (explicitProvider && isProviderConfiguredForUse(explicitProvider, cfg)) return explicitProvider;

  const roleKey = getAgentRoleKey(agent);
  const pool = getConfiguredProviderPool(cfg, preferredProviders);
  const preferences = roleKey === 'researcher'
    ? ['perplexity', 'gemini', 'openai', 'claude', 'groq', 'custom', 'ollama']
    : roleKey === 'proofreader'
      ? ['claude', 'openai', 'gemini', 'groq', 'custom', 'ollama', 'perplexity']
      : roleKey === 'writer'
        ? ['openai', 'claude', 'gemini', 'groq', 'custom', 'ollama', 'perplexity']
        : roleKey === 'designer'
          ? ['claude', 'openai', 'gemini', 'groq', 'custom', 'ollama', 'perplexity']
          : ['gemini', 'openai', 'claude', 'groq', 'custom', 'ollama', 'perplexity'];

  return preferences.find((providerId) => pool.includes(providerId)) || cfg.active;
};

const resolveStageAgent = (token, enabledAgents = []) => {
  const needle = String(token || '').trim().toLowerCase();
  if (!needle) return null;

  const aliases = {
    manager: ['manager', 'מנהל'],
    researcher: ['researcher', 'research', 'sources', 'source', 'חוקר', 'מקורות'],
    designer: ['designer', 'design', 'structure', 'outline', 'מעצב', 'מבנה'],
    writer: ['writer', 'draft', 'כותב'],
    proofreader: ['proofreader', 'review', 'editor', 'מגיה', 'בודק'],
  };

  return enabledAgents.find((agent) => {
    const id = String(agent?.id || '').toLowerCase();
    const name = String(agent?.name || '').toLowerCase();
    if (id === needle || id.includes(needle) || name.includes(needle)) return true;
    return Object.entries(aliases).some(([canonical, list]) => {
      const tokenMatched = canonical === needle || list.some((alias) => needle.includes(alias) || alias.includes(needle));
      return tokenMatched && (id.includes(canonical) || list.some((alias) => id.includes(alias) || name.includes(alias)));
    });
  }) || null;
};

const buildHeuristicAgentPlan = (userPrompt = '', documentContext = '', enabledAgents = []) => {
  const combined = `${userPrompt}\n${documentContext}`;
  const isAcademic = /(אקדמ|סמינר|עבודה|מחקר|מאמר|צוק איתן|ביבליוגרפ|apa|ציטוט|מקורות|מקור)/i.test(combined);
  const needsResearch = isAcademic || /(reference|references|citation|source|sources|literature|journal)/i.test(combined);
  const needsStructure = /(שלד|מבנה|outline|כותרות|פרקים|טיוטה)/i.test(combined) || String(documentContext || '').trim().length < 1600;

  const candidateOrder = [
    'manager',
    needsResearch ? 'researcher' : '',
    needsStructure ? 'designer' : '',
    'writer',
    'proofreader',
  ].filter(Boolean);

  const orderedAgents = [];
  candidateOrder.forEach((token) => {
    const match = resolveStageAgent(token, enabledAgents);
    if (match && !orderedAgents.some((agent) => agent.id === match.id)) orderedAgents.push(match);
  });

  if (!orderedAgents.length) orderedAgents.push(...enabledAgents);

  const stageGoals = {};
  orderedAgents.forEach((agent) => {
    const id = String(agent.id || '').toLowerCase();
    if (id.includes('manager')) stageGoals[agent.id] = 'בנה תוכנית קצרה, בחר שלבים נדרשים, והכן הוראות מסירה ממוקדות לסוכן הבא.';
    else if (id.includes('research')) stageGoals[agent.id] = 'חלץ מהחומרים והטיוטה מקורות, כיווני חיפוש, נקודות עובדתיות וטענות שניתן לבסס. אין להמציא ציטוטים.';
    else if (id.includes('design')) stageGoals[agent.id] = 'ארגן שלד טיעוני ברור, סדר פרקים ותתי-כותרות לפי מטרת העבודה.';
    else if (id.includes('writer')) stageGoals[agent.id] = 'כתוב את הטקסט המלא רק על בסיס ההנחיות, הטיוטה, והמידע שכבר נאסף בשלבים הקודמים.';
    else if (id.includes('proof')) stageGoals[agent.id] = 'בצע בקרת איכות סופית: דיוק, אחידות, בהירות, ועמידה בדרישות אקדמיות.';
  });

  return {
    summary: isAcademic
      ? 'זוהתה משימה אקדמית או מבוססת מקורות; יש להפעיל חקר לפני כתיבה, ואז ללטש את הנוסח הסופי.'
      : 'זוהתה משימת כתיבה מורכבת; יש לתאם בין תכנון, ניסוח ובקרת איכות.',
    orderedAgents,
    stageGoals,
    stageProviders: {},
    needsFinalManagerReview: isAcademic,
  };
};

const parseStagePacket = (reply = '') => {
  const raw = stripCodeFences(reply);
  const extract = (label) => {
    const match = raw.match(new RegExp(`${label}\\s*:\\s*([\\s\\S]*?)(?=\\n(?:DELIVERABLE|HANDOFF|CHECKLIST)\\s*:|$)`, 'i'));
    return String(match?.[1] || '').trim();
  };

  const deliverable = extract('DELIVERABLE');
  const handoff = extract('HANDOFF');
  const checklist = extract('CHECKLIST');

  return {
    raw,
    deliverable: deliverable || raw,
    handoff,
    checklist,
  };
};

const buildStagePrompt = ({ cleanUserPrompt, stageGoal = '', stageAgent, stagedOutput = '', batonNotes = [], planSummary = '', index = 0, total = 1 }) => {
  const batonBlock = batonNotes.length ? `שרשור מסירות בין הסוכנים:\n- ${batonNotes.join('\n- ')}` : '';
  const currentOutputBlock = stagedOutput ? `תוצר עדכני עד כה:\n${stagedOutput}` : '';

  return [
    `בקשת המשתמש המקורית:\n${cleanUserPrompt}`,
    planSummary ? `תכנית מנהל העבודה:\n${planSummary}` : '',
    batonBlock,
    currentOutputBlock,
    stageGoal ? `יעד השלב הנוכחי:\n${stageGoal}` : '',
    `אתה פועל בשלב ${index + 1} מתוך ${total}.`,
    'שמור על דיוק ועל רצף עם מה שכבר נעשה. אם חסר מידע, אל תמציא.',
    'החזר את התשובה במבנה הבא בלבד:',
    'DELIVERABLE:\nהתוצר המלא שעובר לשלב הבא או חוזר למשתמש',
    'HANDOFF:\n2-5 נקודות קצרות לסוכן הבא: מה כבר נסגר, מה עוד חסר, ועל מה חשוב לשמור',
    'CHECKLIST:\n- 2-4 בדיקות איכות קצרות',
  ].filter(Boolean).join('\n\n');
};

const planWithManagerIfNeeded = async ({ cleanUserPrompt, documentContext, enabledAgents, automation, cfg, selectedProviders, runId, logEvent, onStatus }) => {
  const fallbackPlan = buildHeuristicAgentPlan(cleanUserPrompt, documentContext, enabledAgents);
  if (automation.workflowMode !== 'manager-auto' || automation?.autopilotEnabled === false || !enabledAgents.length) return fallbackPlan;

  const managerAgent = resolveStageAgent('manager', enabledAgents) || enabledAgents[0];
  const managerProvider = chooseProviderForAgent(managerAgent, cfg, selectedProviders);
  const availableProviders = getConfiguredProviderPool(cfg, selectedProviders)
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
      `${managerAgent?.prompt || ''}\nהחזר JSON בלבד וללא טקסט נוסף במבנה הזה: {"summary":"...","order":["manager","researcher","designer","writer","proofreader"],"goals":{"manager":"..."},"roleLabels":{"researcher":"בודק מקורות","writer":"מנסח סופי"},"providers":{"researcher":"perplexity"},"needsFinalManagerReview":false}.\nבחר רק את הסוכנים הנחוצים באמת. במצב AUTOPILOT אתה גם מגדיר את התפקיד המעשי של כל שלב דרך roleLabels. אם מדובר בעבודה אקדמית, טיוטה, נושא מחקרי או חומרי עזר — העדף מקורות לפני כתיבה.\nמודלים זמינים כרגע:\n${availableProviders}`,
      {
        providerOverride: managerProvider,
        modelOverride: managerAgent?.model || '',
        skipAutomation: true,
        skipMultiModel: true,
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

    if (!orderedAgents.length) return fallbackPlan;

    logEvent('manager-plan-success', 'מנהל העבודה בחר מסלול הרצה דינמי', {
      state: 'success',
      agentLabel: managerAgent?.name || 'מנהל עבודה',
      orderedAgents: orderedAgents.map((agent) => agent.name),
      outputPreview: trimLogText(parsedPlan.summary || ''),
    });

    return {
      ...fallbackPlan,
      summary: String(parsedPlan.summary || fallbackPlan.summary || '').trim(),
      orderedAgents,
      stageGoals: { ...fallbackPlan.stageGoals, ...(parsedPlan.goals || {}) },
      stageLabels: parsedPlan.roleLabels || parsedPlan.stageLabels || {},
      stageProviders: parsedPlan.providers || {},
      needsFinalManagerReview: parsedPlan.needsFinalManagerReview === true,
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
const MAX_AGENT_DEBUG_LOGS = 250;

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

const getModelNameForProvider = (provider, cfg, override = '') => {
  if (override) return normalizeProviderModelName(provider, override);

  switch (provider) {
    case 'gemini':
      return 'gemini-2.5-flash';
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

export const getAgentDebugLogs = () => {
  const logs = readJsonFromStorage(AGENT_DEBUG_STORAGE_KEY, []);
  return Array.isArray(logs) ? logs : [];
};

export const clearAgentDebugLogs = () => {
  try {
    localStorage.setItem(AGENT_DEBUG_STORAGE_KEY, JSON.stringify([]));
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wordai-agent-logs-updated', { detail: [] }));
    }
  } catch {}
};

export const logAgentDebugEvent = (entry = {}) => pushAgentDebugLog(entry);

export const getLatestAgentRunSummary = (automation = getWorkspaceAutomation()) => {
  const logs = getAgentDebugLogs();
  const orderedAgents = getOrderedRoleAgents(automation?.workflowMode || 'manager-auto');

  if (!logs.length) {
    return {
      runId: '',
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

  const lastRunLog = [...logs].reverse().find((log) => log.runId) || logs[logs.length - 1];
  const runId = lastRunLog?.runId || '';
  const runLogs = runId ? logs.filter((log) => log.runId === runId) : logs.slice(-80);
  const hasApiAttempt = runLogs.some((log) => ['request-start', 'provider-start', 'attempt-start', 'multi-model-start'].includes(log.type));
  const hasApiSuccess = runLogs.some((log) => ['attempt-success', 'multi-model-success', 'workflow-success'].includes(log.type));
  const managerRequired = automation?.enabled !== false && automation?.workflowMode === 'manager-auto' && automation?.autopilotEnabled !== false;
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
      label: success?.agentLabel || error?.agentLabel || started?.agentLabel || agent?.name || agentId,
      state: success ? 'success' : error ? 'error' : 'idle',
      details: success?.message || error?.errorMessage || started?.message || 'לא הופעל',
      provider: success?.provider || error?.provider || started?.provider || '',
      model: success?.model || error?.model || started?.model || '',
    };
  });

  return {
    runId,
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
    const record = {
      id: createRunId(),
      ts: new Date().toISOString(),
      state: 'info',
      ...entry,
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

  const res = await fetch(url, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({ model, messages, max_tokens: 4096, stream: false }),
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
  const selectedProviders = options.providerOverride
    ? [options.providerOverride]
    : taggedProviders.length
      ? taggedProviders
      : getSelectedProviderIds(cfg, options.skipMultiModel === true);
  const activeProvider = options.providerOverride || taggedProviders[0] || selectedProviders[0] || cfg.active;
  const modelOverride = options.modelOverride || taggedRouting.providerModels?.[activeProvider] || taggedRouting.taggedModel || '';
  const personalStylePrompt = buildPersonalStyleInstructions(getPersonalStyleProfile());
  const sharedInstructions = getSharedAgentInstructions();
  const workspaceAutomationPrompt = buildWorkspaceAutomationInstructions();
  const skillResolution = resolveSkillForRequest({
    userPrompt: cleanUserPrompt,
    documentContext,
    skillId: options.skillId || '',
    autoUseDefault: options.autoUseDefaultSkill !== false,
  });
  const activeSkill = skillResolution.skill;
  const skillPrompt = buildSkillSystemPrompt(activeSkill, skillResolution.reason);
  const automation = getWorkspaceAutomation();
  const onStatus = options.onStatus;
  const agentLabel = options.agentLabel || 'הסוכן הראשי';
  const timeoutMs = Math.max(10000, Number(automation.requestTimeoutMs || 45) * 1000);
  const retries = automation.retryEnabled === false ? 0 : Math.max(0, Number(automation.maxRetries || 0));
  const effectiveRetries = activeProvider === 'gemini' ? 0 : retries;
  const runId = options.runId || createRunId();
  const resolvedModel = getModelNameForProvider(activeProvider, cfg, modelOverride);
  const logEvent = (type, message, extra = {}) => pushAgentDebugLog({
    runId,
    type,
    message,
    agentLabel: extra.agentLabel || agentLabel,
    provider: extra.provider || activeProvider,
    model: extra.model || resolvedModel,
    workflowMode: automation.workflowMode,
    ...extra,
  });
  const sysPrompt = `אתה העוזר החכם של מעבד התמלילים "WordFlow AI".
ענה תמיד בעברית, קצר, ברור ומעשי.
הנח שהמשתמש נמצא באמצע כתיבה, ולכן גם שאלות קצרות כמו "נראה ארוך אה?", "יש מקור לזה?" או "תחדד לי" מתייחסות לפסקה או לטקסט שבהקשר המצורף.
אם מבקשים קיצור/הארכה/שכתוב — תן ישירות נוסח מוצע שאפשר להדביק.
אם מבקשים מקור אקדמי — תן כיוון מחקר, מילות חיפוש, סוגי מקורות, ואם אפשר גם שמות חוקרים/נושאים רלוונטיים. אם אין ודאות, אל תמציא ציטוטים.
אם המשתמש מבקש תוכן חדש, כתוב רק את התוכן עצמו כדי שיהיה קל להוסיף למסמך.
כאשר צריך לבצע הפרדת עמודים, החזר בדיוק את קטע ה-HTML הבא בלבד בשורה נפרדת: <div data-type="page-break"></div>.${extraSystemPrompt ? `\n\nהנחיית תפקיד:\n${extraSystemPrompt}` : ''}${skillPrompt ? `\n\nסקיל נבחר:\n${skillPrompt}` : ''}${sharedInstructions ? `\n\nהנחיות משותפות לפרויקט:\n${sharedInstructions}` : ''}${workspaceAutomationPrompt ? `\n\nתיאום צוות AI:\n${workspaceAutomationPrompt}` : ''}${personalStylePrompt ? `\n\nהעדפות סגנון אישיות:\n${personalStylePrompt}` : ''}${documentContext ? `\n\nהקשר מהמסמך:\n${documentContext.slice(0, 8000)}` : ''}`;

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
        runId,
        logEvent,
        onStatus,
      });

      const orderedAgents = executionPlan?.orderedAgents?.length ? executionPlan.orderedAgents : enabledAgents;
      logEvent('workflow-start', `הופעלה סביבת עבודה עם ${orderedAgents.length} סוכנים`, {
        state: 'running',
        orderedAgents: orderedAgents.map((agent) => agent.name),
        planSummary: executionPlan?.summary || '',
      });

      let stagedOutput = '';
      const batonNotes = executionPlan?.summary ? [`מנהל העבודה: ${executionPlan.summary}`] : [];

      for (let index = 0; index < orderedAgents.length; index += 1) {
        const stageAgent = orderedAgents[index];
        const stageStart = Math.round((index / orderedAgents.length) * 100);
        const stageSpan = Math.max(12, Math.round(100 / orderedAgents.length));
        const stageRoleKey = getAgentRoleKey(stageAgent);
        const stageGoal = executionPlan?.stageGoals?.[stageAgent.id]
          || executionPlan?.stageGoals?.[stageAgent.name]
          || executionPlan?.stageGoals?.[String(stageAgent.id || '').toLowerCase()]
          || executionPlan?.stageGoals?.[stageRoleKey]
          || '';
        const stageLabel = executionPlan?.stageLabels?.[stageAgent.id]
          || executionPlan?.stageLabels?.[stageAgent.name]
          || executionPlan?.stageLabels?.[String(stageAgent.id || '').toLowerCase()]
          || executionPlan?.stageLabels?.[stageRoleKey]
          || stageAgent.name;
        const requestedProvider = executionPlan?.stageProviders?.[stageAgent.id]
          || executionPlan?.stageProviders?.[stageAgent.name]
          || executionPlan?.stageProviders?.[String(stageAgent.id || '').toLowerCase()]
          || executionPlan?.stageProviders?.[stageRoleKey]
          || '';
        const stageProvider = (requestedProvider && isProviderConfiguredForUse(requestedProvider, cfg))
          ? requestedProvider
          : chooseProviderForAgent(stageAgent, cfg, selectedProviders);
        const stagePrompt = buildStagePrompt({
          cleanUserPrompt,
          stageGoal,
          stageAgent,
          stagedOutput,
          batonNotes,
          planSummary: executionPlan?.summary || '',
          index,
          total: orderedAgents.length,
        });

        logEvent('stage-start', `מתחיל שלב ${index + 1} מתוך ${orderedAgents.length}`, {
          state: 'running',
          agentId: stageAgent.id,
          agentLabel: stageLabel,
          provider: stageProvider,
          model: stageAgent.model || getModelNameForProvider(stageProvider, cfg, modelOverride),
          stageIndex: index + 1,
          stageTotal: orderedAgents.length,
          promptPreview: trimLogText(stagePrompt),
        });

        try {
          const stageReply = await chatWithActiveProvider(stagePrompt, documentContext, `${stageAgent.prompt}\nהחזר בתבנית DELIVERABLE / HANDOFF / CHECKLIST בלבד.`, {
            providerOverride: stageProvider,
            modelOverride: stageAgent.model || modelOverride,
            skipAutomation: true,
            skipMultiModel: true,
            agentLabel: stageLabel,
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
                message: payload.message || `מעבד שלב ${index + 1} מתוך ${orderedAgents.length}`,
              });
            },
          });

          const parsedReply = parseStagePacket(stageReply);
          stagedOutput = String(parsedReply.deliverable || stagedOutput || cleanUserPrompt).trim();
          if (parsedReply.handoff) {
            batonNotes.push(`${stageAgent.name}: ${parsedReply.handoff.replace(/\n+/g, ' ; ')}`);
            if (batonNotes.length > 8) batonNotes.shift();
          }

          logEvent('stage-success', `הושלם שלב ${index + 1} מתוך ${orderedAgents.length}`, {
            state: 'success',
            agentId: stageAgent.id,
            agentLabel: stageLabel,
            provider: stageProvider,
            model: stageAgent.model || getModelNameForProvider(stageProvider, cfg, modelOverride),
            stageIndex: index + 1,
            stageTotal: orderedAgents.length,
            outputChars: stagedOutput.length,
            outputPreview: trimLogText(stagedOutput),
            handoffPreview: trimLogText(parsedReply.handoff || ''),
          });
        } catch (error) {
          logEvent('stage-error', `שגיאה בשלב ${index + 1} מתוך ${orderedAgents.length}`, {
            state: 'error',
            agentId: stageAgent.id,
            agentLabel: stageLabel,
            provider: stageProvider,
            model: stageAgent.model || getModelNameForProvider(stageProvider, cfg, modelOverride),
            stageIndex: index + 1,
            stageTotal: orderedAgents.length,
            errorMessage: error?.message || 'שגיאה לא ידועה',
          });
          throw error;
        }
      }

      if (executionPlan?.needsFinalManagerReview) {
        const managerAgent = resolveStageAgent('manager', enabledAgents);
        if (managerAgent) {
          const reviewProvider = chooseProviderForAgent(managerAgent, cfg, selectedProviders);
          const reviewPrompt = buildStagePrompt({
            cleanUserPrompt,
            stageGoal: 'בצע סקירה סופית כמנהל עבודה. ודא שהמסמך עומד בדרישות, שהכותב נשען על החומרים, ושאין פערים לוגיים או ניסוחיים. החזר נוסח סופי בלבד.',
            stageAgent: managerAgent,
            stagedOutput,
            batonNotes,
            planSummary: executionPlan?.summary || '',
            index: orderedAgents.length,
            total: orderedAgents.length + 1,
          });

          const managerReply = await chatWithActiveProvider(reviewPrompt, documentContext, `${managerAgent.prompt}\nזהו שלב בדיקה סופי לפני החזרה למשתמש.`, {
            providerOverride: reviewProvider,
            modelOverride: managerAgent.model || modelOverride,
            skipAutomation: true,
            skipMultiModel: true,
            agentLabel: managerAgent.name,
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
          stagedOutput = String(parsedManagerReply.deliverable || stagedOutput || cleanUserPrompt).trim();
          if (parsedManagerReply.handoff) batonNotes.push(`${managerAgent.name}: ${parsedManagerReply.handoff.replace(/\n+/g, ' ; ')}`);
        }
      }

      const finalOutput = String(stagedOutput || cleanUserPrompt).trim();
      logEvent('workflow-success', 'כל שלבי העבודה הושלמו', {
        state: 'success',
        agentLabel: orderedAgents[orderedAgents.length - 1]?.name || agentLabel,
        outputChars: finalOutput.length,
        outputPreview: trimLogText(finalOutput),
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
      return finalOutput;
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
          modelOverride: taggedRouting.providerModels?.[providerId] || '',
          skipAutomation: true,
          skipMultiModel: true,
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
      return collectedResponses[0].content;
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
        modelOverride: taggedRouting.providerModels?.[mergeProviderId] || '',
        skipAutomation: true,
        skipMultiModel: true,
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

      return mergedReply;
    } catch (mergeError) {
      logEvent('multi-model-merge-fallback', 'איחוד התשובות נכשל, מחזיר את התשובה הטובה הראשונה', {
        state: 'error',
        provider: mergeProviderId,
        errorMessage: mergeError?.message || 'שגיאה לא ידועה',
      });
      return collectedResponses[0].content;
    }
  }

  const runProviderRequest = async (signal) => {
    switch (activeProvider) {
      case 'gemini': {
        const key = cfg.gemini.key || localStorage.getItem("GEMINI_API_KEY") || "";
        if (!key) throw new Error('מפתח Gemini לא הוגדר — עבור להגדרות AI (תפריט קובץ)');
        const genAI = new GoogleGenerativeAI(key);
        const mdl = genAI.getGenerativeModel({ model: modelOverride || "gemini-2.5-flash" });
        const result = await mdl.generateContent(`${sysPrompt}\n\nמשתמש: ${cleanUserPrompt}`);
        return result.response.text();
      }
      case 'openai': {
        if (!cfg.openai.key) throw new Error('מפתח OpenAI לא הוגדר — עבור להגדרות AI (תפריט קובץ)');
        return callOpenAICompatible('https://api.openai.com/v1', cfg.openai.key, modelOverride || cfg.openai.model || 'gpt-4o', [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: cleanUserPrompt },
        ], signal);
      }
      case 'claude': {
        if (!cfg.claude.key) throw new Error('מפתח Claude לא הוגדר — עבור להגדרות AI (תפריט קובץ)');
        return callClaudeApi(cfg.claude.key, normalizeProviderModelName('claude', modelOverride || cfg.claude.model || 'claude-sonnet-4-6'), sysPrompt, cleanUserPrompt, signal);
      }
      case 'groq': {
        if (!cfg.groq.key) throw new Error('מפתח Groq לא הוגדר — עבור להגדרות AI (תפריט קובץ)');
        return callOpenAICompatible('https://api.groq.com/openai/v1', cfg.groq.key, modelOverride || cfg.groq.model || 'llama-3.3-70b-versatile', [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: cleanUserPrompt },
        ], signal);
      }
      case 'ollama': {
        const ollamaUrl = cfg.ollama.baseUrl || 'http://localhost:11434/v1';
        const ollamaModel = modelOverride || cfg.ollama.model || 'llama3.2';
        return callOpenAICompatible(ollamaUrl, '', ollamaModel, [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: cleanUserPrompt },
        ], signal);
      }
      case 'perplexity': {
        if (!cfg.perplexity.key) throw new Error('מפתח Perplexity לא הוגדר — עבור להגדרות AI (תפריט קובץ)');
        return callOpenAICompatible('https://api.perplexity.ai', cfg.perplexity.key, normalizeProviderModelName('perplexity', modelOverride || cfg.perplexity.model || 'sonar-pro'), [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: cleanUserPrompt },
        ], signal);
      }
      case 'custom': {
        const { baseUrl, key, model, name } = cfg.custom;
        if (!baseUrl || !model) throw new Error(`מנוע "${name || 'מותאם אישית'}" לא מוגדר במלואו — עבור להגדרות AI`);
        return callOpenAICompatible(baseUrl, key, modelOverride || model, [
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
      return result;
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

  // ─── Fallback: אם המנוע נכשל ו-Gemini זמין, נסה דרך Gemini ─────
  if (activeProvider !== 'gemini' && isProviderConfiguredForUse('gemini', cfg)) {
    try {
      logEvent('provider-fallback', `מנוע ${activeProvider} נכשל, מנסה דרך gemini`, {
        state: 'retrying',
        originalProvider: activeProvider,
        originalModel: resolvedModel,
        fallbackProvider: 'gemini',
        errorMessage: lastError?.message || '',
      });
      emitStatus(onStatus, { state: 'retrying', progress: 50, runId, provider: 'gemini', model: 'gemini-2.5-flash', agentLabel, message: `מנוע ${activeProvider} נכשל, מנסה דרך Gemini` });
      const geminiKey = cfg.gemini.key || localStorage.getItem("GEMINI_API_KEY") || "";
      const genAI = new GoogleGenerativeAI(geminiKey);
      const fallbackModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const fallbackResult = await withTimeout(
        fallbackModel.generateContent(`${sysPrompt}\n\nמשתמש: ${cleanUserPrompt}`),
        timeoutMs,
        () => {}
      );
      const fallbackText = fallbackResult.response.text();
      logEvent('provider-fallback-success', 'Gemini החזיר תשובה חלופית', {
        state: 'success',
        fallbackProvider: 'gemini',
        responseChars: String(fallbackText || '').length,
      });
      emitStatus(onStatus, { state: 'success', progress: 100, runId, provider: 'gemini', model: 'gemini-2.5-flash', agentLabel, message: 'הושלם (Gemini fallback)' });
      return fallbackText;
    } catch (fallbackError) {
      logEvent('provider-fallback-error', 'גם Gemini fallback נכשל', {
        state: 'error',
        errorMessage: fallbackError?.message || '',
      });
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
  return chatWithActiveProvider(fullPrompt, context, '', { skipAutomation: true });
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
  const providerOverride = chooseProviderForAgent(agent, cfg, getSelectedProviderIds(cfg));
  return chatWithActiveProvider(userPrompt, documentContext, agent.prompt, {
    providerOverride,
    modelOverride: agent.model,
    agentLabel: agent.name || 'סוכן תפקידי',
    onStatus: runtimeOptions.onStatus,
    skillId: runtimeOptions.skillId || '',
    autoUseDefaultSkill: runtimeOptions.autoUseDefaultSkill !== false,
    skipAutomation: true,
    skipMultiModel: true,
  });
};

// Legacy alias
export const chatWithAi = chatWithActiveProvider;
