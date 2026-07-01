import { GoogleGenerativeAI } from "@google/generative-ai";
import { DOMParser as ProseMirrorDOMParser, DOMSerializer } from "@tiptap/pm/model";
import { AGENTS_CONFIG } from "../agentConfig";
import { analyzeQuery as analyzeArticleQuery, buildArticleSearchQueryVariants, extractDomainFromUrl as extractArticleDomainFromUrl, normalizeText as normalizeArticleText, normalizeUrl as normalizeArticleUrl, validateArticleCandidate } from "./articleSourceValidation";
import { fetchBrowserPageSnapshot, isDesktopBrowserRetrievalAvailable } from "./browserRetrievalService";
import { bindClaimsToPassages } from "./sourceClaimBinding";
import { shouldRelayHostViaFunction, relayHttpRequestViaFunction } from "./webProxyService";
import { DEFAULT_COPYLEAKS_CONFIG, getCopyleaksBearerToken, normalizeCopyleaksConfig } from "./copyleaksService";
import { runHumanizerLoop, STEALTH_HUMANIZE_GUIDE } from "./humanizerLoopService";
export {
  WORKSPACE_V2_VERSION,
  WORKSPACE_V2_TEMPLATE_IDS,
  WORKSPACE_V2_GLOBAL_GUARDRAILS,
  WORKSPACE_V2_TEMPLATES,
  getWorkspaceV2TemplatesMap,
  normalizeWorkspaceV2TemplateId,
  getWorkspaceV2Templates,
  getWorkspaceV2Template,
  saveWorkspaceV2Template,
  createWorkspaceV2Template,
  deleteWorkspaceV2Template,
  resetWorkspaceV2Templates,
  classifyWorkspaceV2Template,
  buildWorkspaceV2RunContext,
  validateWorkspaceV2RunContext,
} from './workspaceV2Service';

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
  // מקורות תמונה למצגות
  imageProvider: 'pexels', // ספק תמונות הסטוק הפעיל: 'pexels' | 'unsplash'
  pexels:     { key: '' },
  unsplash:   { key: '' },
  imageGen:   { provider: 'gemini', key: '', model: 'imagen-3.0-generate-002' }, // יצירת תמונות AI
  // מנוע גרפים אמיתי (QuickChart) — מרנדר תרשימים מדויקים מנתוני SPSS/מצגות
  chartEngine: { provider: 'quickchart', key: '', baseUrl: 'https://quickchart.io', fallbackToAi: true },
  // API ייעודי לפי פיצ'ר — provider+model+key נפרדים ל-SPSS ולמצגות.
  // enabled=false → נופל ל-provider הגלובלי (active). ראה getFeatureProviderConfig.
  featureOverrides: {
    spss:          { enabled: false, providerId: '', model: '', key: '', baseUrl: '', image: { enabled: false, stockProvider: '', stockKey: '', genProvider: '', genModel: '', genKey: '' } },
    presentations: { enabled: false, providerId: '', model: '', key: '', baseUrl: '', image: { enabled: false, stockProvider: '', stockKey: '', genProvider: '', genModel: '', genKey: '' } },
  },
  copyleaks:  { ...DEFAULT_COPYLEAKS_CONFIG },
  toolLinks: {
    googleSearch: { label: 'חיפוש גוגל', url: 'https://www.google.com/search?q={query}' },
    scholar: { label: 'Google Scholar', url: 'https://scholar.google.com/scholar?q={query}' },
    modelHub: { label: 'מודל', url: 'https://aistudio.google.com/' },
    orbit: { label: 'Orbit', url: 'https://orbit.livemind-app.com/' },
  },
};

export const DEFAULT_SIDEBAR_MODE_IDS = ['reviewFix', 'fix', 'holeFill', 'humanize', 'sources', 'lecturer', 'continue', 'summary', 'academic'];

export const buildDefaultSidebarModeSettings = () => ({
  forceGlobalProvider: false,
  modes: DEFAULT_SIDEBAR_MODE_IDS.map((id) => {
    const agent = AGENTS_CONFIG[id] || {};
    const selection = agent.sidebarSelection || {};
    return {
      id,
      label: agent.label || id,
      enabled: true,
      providerId: selection.providerId || agent.route || '',
      model: selection.model || '',
    };
  }),
});

export const normalizeSidebarModeSettings = (settings = {}) => {
  const defaults = buildDefaultSidebarModeSettings();
  const defaultById = Object.fromEntries(defaults.modes.map((mode) => [mode.id, mode]));
  const sourceModes = Array.isArray(settings?.modes) ? settings.modes : defaults.modes;
  const seen = new Set();
  const modes = sourceModes
    .map((mode) => {
      const id = String(mode?.id || '').trim();
      if (!id || seen.has(id) || !AGENTS_CONFIG[id]) return null;
      seen.add(id);
      const fallback = defaultById[id] || {
        id,
        label: AGENTS_CONFIG[id]?.label || id,
        enabled: true,
        providerId: AGENTS_CONFIG[id]?.sidebarSelection?.providerId || AGENTS_CONFIG[id]?.route || '',
        model: AGENTS_CONFIG[id]?.sidebarSelection?.model || '',
      };
      return {
        ...fallback,
        label: String(mode?.label || fallback.label || id).trim() || id,
        enabled: mode?.enabled !== false,
        providerId: String(Object.prototype.hasOwnProperty.call(mode || {}, 'providerId') ? mode.providerId : fallback.providerId || '').trim(),
        model: String(Object.prototype.hasOwnProperty.call(mode || {}, 'model') ? mode.model : fallback.model || '').trim(),
      };
    })
    .filter(Boolean);

  return {
    ...defaults,
    ...(settings && typeof settings === 'object' ? settings : {}),
    forceGlobalProvider: settings?.forceGlobalProvider === true,
    modes,
  };
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
  sidebarPreset: 'word-taskpane',
  autoRouteSourceRequests: true,
  strictSourceGrounding: true,
  sidebarModeSettings: buildDefaultSidebarModeSettings(),
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

export const DEFAULT_PRESENTATION_PREFERENCES = {
  defaultThemeId: 'premium',
  defaultDensity: 'balanced',
  defaultSlideCount: 10,
  defaultImageIntensity: 'high',
  defaultAudience: '',
  defaultGoal: '',
  rememberLastChoices: true,
};

export const DEFAULT_SPSS_PREFERENCES = {
  tutorMode: true,
  defaultGenMode: 'analysis',
  defaultSyntaxView: 'master',
  autoSwitchPrepForReliability: true,
  // On-page provider/model picker (like the home screen). '' = use the active
  // provider / feature default resolved in spssSyntaxService.
  providerId: '',
  model: '',
};

export const DEFAULT_PERSONAL_STYLE = {
  manualVocabulary: [],
  manualPhrases: [],
  preferredSentenceStructures: [],
  paragraphPreferences: '',
  tonePreference: '',
  lengthPreference: '',
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
  lecturerName: '',
  lecturerNames: [],
  assignmentType: '',
  studentId: '',
  aiAssistanceDeclaration: '',
  submissionDate: '',
  syllabusImportProvenance: {
    assignmentType: '',
    submissionDate: '',
  },
  currentCourses: [],
  syllabusTopics: [],
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
  externalStyleAnalysisProvider: '',
  externalStyleAnalysisRaw: '',
  externalStyleAnalysisPendingAt: '',
  externalStyleAnalysisProcessedAt: '',
  externalStyleAnalysisStatus: '',
  externalStyleAnalysisLastError: '',
  learnedNotes: [],
  learnedSentencePatterns: [],
  preferredConnectors: [],
  preferredSentenceOpeners: [],
  toneDescriptors: [],
  sentenceLengthPreference: '',
  paragraphLengthPreference: '',
  greetingStyle: '',
  signOffStyle: '',
  goldenExample: '',
  avoidRules: '',
  alwaysRules: '',
  favoritePhrases: '',
  emojiPreference: '',
  listPreference: '',
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
  timeoutEnabled: true,
  requestTimeoutMs: 45000,
  showProgress: true,
  appendAgentNotesToOutput: false,
  agentNotesInstruction: '',
  activeWorkspaceId: 'default-content-studio',
  workspaceBypassEnabled: true,
};

// The legacy workspace orchestrator is quarantined: keep saved workspace data intact,
// but do not let it affect generation until a clean v2 orchestration layer replaces it.
const WORKSPACE_AUTOMATION_QUARANTINED = true;

const AUTOPILOT_MANAGER_WORKFLOW_MODES = new Set(['manager-auto', 'circular-team', 'autopilot-full']);
const AUTOPILOT_EXECUTION_STYLE_OPTIONS = new Set(['lean', 'balanced', 'deep']);
const AUTOPILOT_MAX_STAGE_ROUNDS = 4;
const AUTOPILOT_MAX_FINAL_REVIEW_PASSES = 3;

const PROVIDER_WORKSPACE_LABELS = {
  gemini: 'Gemini',
  claude: 'Claude',
  perplexity: 'Perplexity',
};

const getProviderWorkspaceLabel = (providerId = '') => PROVIDER_WORKSPACE_LABELS[String(providerId || '').trim()] || String(providerId || 'AI').trim() || 'AI';

const buildProviderFocusedWorkspaceGoal = (providerId = '') => {
  const providerLabel = getProviderWorkspaceLabel(providerId);
  return `כל צוות הסוכנים רץ דרך ${providerLabel}. המודל בפועל נלקח מברירת המחדל של ${providerLabel} בהגדרות, כך שאפשר להחליף מנוע בלי לערוך את סביבת העבודה.`;
};

const buildProviderFocusedWorkspaceAgents = (providerId = '') => getDefaultRoleAgents().map((agent) => ({
  ...agent,
  provider: providerId,
  model: '',
}));

const buildDefaultWorkspaceSeed = ({
  id = '',
  name = '',
  preset = 'content-studio',
  workflowMode = 'manager-auto',
  autopilotEnabled = true,
  sharedGoal = '',
  appendAgentNotesToOutput = false,
  agentNotesInstruction = '',
  agents = [],
} = {}) => ({
  id,
  name,
  automation: {
    ...DEFAULT_WORKSPACE_AUTOMATION,
    enabled: true,
    preset,
    workflowMode,
    autoDispatch: true,
    autopilotEnabled,
    workspaceName: name,
    sharedGoal,
    appendAgentNotesToOutput,
    agentNotesInstruction,
    activeWorkspaceId: id,
  },
  agents,
  lastModified: new Date().toISOString(),
});

const buildProviderFocusedWorkspaceSeed = ({ id = '', name = '', preset = '', providerId = '' } = {}) => buildDefaultWorkspaceSeed({
  id,
  name,
  preset,
  workflowMode: 'manager-auto',
  autopilotEnabled: true,
  sharedGoal: buildProviderFocusedWorkspaceGoal(providerId),
  agents: buildProviderFocusedWorkspaceAgents(providerId),
});

const getAcademicLabWorkspaceAgents = () => ([
  { id: 'manager', name: 'מנהל עבודה אקדמי', prompt: 'פרק את המשימה האקדמית לשלבים ברורים: חקר, מבנה, כתיבה וליטוש. שמור על דיוק והחזר תכנית קצרה ותוצר ישים.', provider: '', model: '', enabled: true },
  { id: 'researcher', name: 'חוקר ספרות', prompt: 'אתר תוצר מחקרי קונקרטי וישים. כשאפשר, ספק לפחות 3 מקורות או מאמרים אקדמיים רלוונטיים, ולכל מקור ציין כותרת, מחבר או גוף מפרסם, שנה אם ידועה, קישור או DOI אם זמין, ולמה הוא חשוב לעבודה. אם נמצאו פחות מ-3 מקורות, כתוב במפורש כמה נמצאו ומה חסר להשלמת הסקירה, ואל תסתפק רק בכיווני חיפוש או במילות מפתח. אפשר להוסיף מונחי חיפוש כהשלמה בלבד. אל תמציא פרטים. אם נדרש גם חקר חזותי, ציין זאת כהשלמה למנהל העבודה.', provider: '', model: '', enabled: true },
  { id: 'designer', name: 'בונה שלד אקדמי', prompt: 'בנה מבנה אקדמי מדויק לפי הוראות המשתמש והמטלה. אם התבקשו מבוא, פרקים, שאלות או היקף מסוים - שמור עליהם; אם לא, אל תוסיף מבנה קבוע כמו מבוא/דיון/סיכום על דעת עצמך. הקפד על רצף טיעוני והיררכיית כותרות רק כשנדרש.', provider: '', model: '', enabled: true },
  { id: 'writer', name: 'כותב אקדמי', prompt: 'כתוב בעברית אקדמית, פורמלית ומדויקת, בהתאם לסגנון המשתמש. הימנע מהמצאות.', provider: '', model: '', enabled: true },
  { id: 'proofreader', name: 'מגיה אקדמי', prompt: 'בצע ליטוש סופי של ניסוח, בהירות, פיסוק ואחידות אקדמית.', provider: '', model: '', enabled: true },
]);

const getAcademicVerifiedWorkspaceAgents = () => ([
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
    prompt: 'אסוף חומרים מחקריים ואקדמיים בלבד כתוצר מחקרי קונקרטי וישים. כשאפשר, ספק לפחות 3 מקורות או מאמרים אקדמיים קונקרטיים, ולכל מקור ציין כותרת, מחבר או גוף מפרסם, שנה אם ידועה, קישור או DOI אם זמין, ולמה הוא רלוונטי. אם נמצאו פחות מ-3 מקורות, כתוב במפורש כמה נמצאו ומה חסר, ואל תסתפק רק בכיווני חיפוש או ברעיונות כלליים. אפשר להוסיף מושגי יסוד ומונחי חיפוש כהשלמה בלבד. אל תמציא מקורות, DOI, ציטוטים או פרטים. ציין תמיד מאיפה הגיע כל ממצא.',
    provider: 'perplexity',
    model: '',
    enabled: true,
  },
  {
    id: 'researcher-general',
    name: 'אוסף משלים - Gemini',
    prompt: 'אסוף מידע משלים שאינו אקדמי גרידא: הקשרים, דוגמאות, ניסוחים, וסיכום תובנות. אל תמציא עובדות או מקורות, וסמן בבירור מה מקור כל טענה. אם חסר גם רובד חזותי, ציין למנהל העבודה שכדאי להפעיל סוכן מחקר חזותי ייעודי.',
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
    prompt: 'בצע ביקורת סופית כמנהל עבודה: בדוק שהעבודה עומדת בהנחיות, שהמבנה נכון, שאין טענות לא מבוססות, ושיש הפניות מספקות למקורות. DELIVERABLE חייב להיות המסמך המלא והמעודכן בלבד. הערות, חוסרים ותיקוני חובה שייכים ל-HANDOFF / MISSING / CHECKLIST. גם אם צריך לעצור או לבקש סבב נוסף, אל תחזיר פסקת מטא במקום המסמך המלא.',
    provider: 'claude',
    model: '',
    enabled: true,
  },
]);

const getProductDeskWorkspaceAgents = () => ([
  { id: 'manager', name: 'מנהל מוצר', prompt: 'הגדר מטרה, קהל יעד, תוצרים וסדר עבודה. החזר תוכנית קצרה ותעדוף ברור.', provider: '', model: '', enabled: true },
  { id: 'designer', name: 'מעצב חוויה', prompt: 'בנה מבנה מסמך חד וברור, כותרות נכונות וזרימת קריאה ידידותית. אל תוסיף מבוא, סיכום או פרקים קבועים אם המשתמש לא ביקש אותם במפורש.', provider: '', model: '', enabled: true },
  { id: 'writer', name: 'קופירייטר', prompt: 'כתוב תוכן ברור, משכנע וקריא, עם פתיחה רק אם היא נדרשת לפי בקשת המשתמש או סוג המסמך, ועם מעברים טובים בלי לכפות מבוא או hook על דעת עצמך.', provider: '', model: '', enabled: true },
  { id: 'researcher', name: 'אנליסט שוק', prompt: 'הצע זוויות מחקר, השוואות, שאלות ותובנות מבוססות עבור מסמכי מוצר.', provider: '', model: '', enabled: true },
  { id: 'proofreader', name: 'עורך סופי', prompt: 'לטש את המסר, קצב הקריאה, הבהירות והעברית.', provider: '', model: '', enabled: true },
]);

const getLegalContractsWorkspaceAgents = () => ([
  { id: 'manager', name: 'מנהל מסמך משפטי', prompt: 'פרק את הבקשה למסמך משפטי, חוזה, נוהל או מכתב רשמי לשלבים ברורים. ודא שהמסמך נשאר מדויק, זהיר, ולא מציג מידע עובדתי או התחייבות שלא הופיעו בבקשת המשתמש.', provider: '', model: '', enabled: true },
  { id: 'researcher', name: 'בודק הקשר משפטי', prompt: 'אתר מונחים, מבנים מקובלים, סעיפים נפוצים ושאלות בירור שחשוב להעלות לפני ניסוח מסמך משפטי או חוזי. אל תמציא חוק, פסיקה או ייעוץ ספציפי כשאין לכך מקור מפורש בבקשה.', provider: '', model: '', enabled: true },
  { id: 'designer', name: 'בונה סעיפים וחוזים', prompt: 'סדר את המסמך במבנה משפטי ברור: כותרת, צדדים, הגדרות, סעיפים, חריגים וחתימות רק כשנדרש. הימנע מהוספת סעיפים מיותרים או ניסוחים עמומים.', provider: '', model: '', enabled: true },
  { id: 'writer', name: 'נסח משפטי', prompt: 'כתוב בעברית פורמלית, מדויקת ולא מתלהמת. שמור על ניסוחים ברורים, הגדרות עקביות וסעיפים שלא משתמעים לשתי פנים.', provider: '', model: '', enabled: true },
  { id: 'proofreader', name: 'בקרת סיכון וניסוח', prompt: 'בצע מעבר סופי על בהירות, כפילויות, סתירות פנימיות, סעיפים חסרים וניסוחים שעלולים להישמע מחייבים מדי או לא מדויקים.', provider: '', model: '', enabled: true },
]);

const getFinalPolishWorkspaceAgents = () => ([
  { id: 'manager', name: 'מנהל ליטוש', prompt: 'קבע סדר בדיקה קצר ומדויק לפני הגשה: מבנה, בהירות, ניסוח, עקביות ועמידה בהוראות. התעדף את התיקונים שמביאים את המסמך למצב הגשה מהר.', provider: '', model: '', enabled: true },
  { id: 'designer', name: 'בודק מבנה והיררכיה', prompt: 'בדוק שכותרות, סעיפים, מעברי עמוד ורצף הטקסט עובדים נכון. אם המבנה מסורבל, הצע תיקון שמרני ולא שכתוב מיותר.', provider: '', model: '', enabled: true },
  { id: 'writer', name: 'משייף ניסוח', prompt: 'לטש משפטים מסורבלים, הסר חזרתיות, חזק בהירות ושמור על קול כתיבה טבעי. אל תמציא תוכן חדש אם הבעיה היא רק ברמת הניסוח.', provider: '', model: '', enabled: true },
  { id: 'proofreader', name: 'בודק הגשה סופית', prompt: 'בצע מעבר אחרון של כתיב, פיסוק, אחידות מונחים, קצב קריאה וסימני AI גלויים. התוצאה צריכה להרגיש מוכנה להגשה.', provider: '', model: '', enabled: true },
  { id: 'manager-review', name: 'שער הגשה', prompt: 'אשר אם המסמך מוכן להגשה או ציין במדויק מה עדיין חוסם. DELIVERABLE חייב להישאר המסמך המלא והמעודכן בלבד.', provider: '', model: '', enabled: true },
]);

const getSocialContentWorkspaceAgents = () => ([
  { id: 'manager', name: 'מנהל קמפיין', prompt: 'הגדר את מטרת התוכן, הקהל, הפלטפורמה, הטון וה-CTA. דאג שכל שלב ישרת מטרה שיווקית ברורה ולא רק ניסוח יפה.', provider: '', model: '', enabled: true },
  { id: 'researcher', name: 'חוקר קהל וטרנדים', prompt: 'אסוף זוויות, כאבים, ניסוחים, התנגדויות ו-hooks שמתאימים לקהל ולפלטפורמה. התמקד בתובנות שימושיות לכתיבת פוסטים, מודעות, קופי קצר או רצף תוכן.', provider: '', model: '', enabled: true },
  { id: 'designer', name: 'בונה זווית ותבנית', prompt: 'בחר מבנה קצר וחד לפוסט, קרוסלה, מודעה או רצף סטוריז. תן flow שנוח לקריאה, עם hook, פיתוח קצר ו-CTA רק אם זה משרת את המטרה.', provider: '', model: '', enabled: true },
  { id: 'writer', name: 'קופירייטר לרשתות', prompt: 'כתוב תוכן חד, קריא ולא גנרי. התאם אורך, קצב וטון לפלטפורמה, הימנע משפה רובוטית ושמור על ערך ברור כבר בשורות הראשונות.', provider: '', model: '', enabled: true },
  { id: 'proofreader', name: 'עורך מסר והמרה', prompt: 'בדוק שהמסר חד, שאין עודף מילים, שה-CTA ברור, ושיש התאמה טובה בין הבטחה, תוכן והנעה לפעולה.', provider: '', model: '', enabled: true },
]);

const getArgumentWritingWorkspaceAgents = () => ([
  { id: 'manager', name: 'מנהל טיעון', prompt: 'הבן את העמדה, הקהל והמטרה. פרק את הטקסט לטענה מרכזית, נימוקים, דוגמאות, התמודדות עם התנגדויות וסיום חד. שמור על בקשת המשתמש ועל סגנונו האישי כקריטריונים מחייבים.', provider: '', model: '', enabled: true },
  { id: 'researcher', name: 'בודק ביסוס', prompt: 'חפש רק עובדות, דוגמאות, נתונים או מקורות שתומכים בטיעון או מאתגרים אותו. אל תמציא נתונים או מקורות. אם אין צורך במחקר חיצוני, ציין אילו נקודות בטיעון מספיקות ואילו דורשות ביסוס.', provider: '', model: '', enabled: true },
  { id: 'designer', name: 'אדריכל טיעון', prompt: 'בנה רצף טיעוני משכנע: פתיחה עניינית, טענה ברורה, נימוקים בסדר הגיוני, התייחסות לטענת נגד וסיום. אל תכפה כותרות או מבנה אקדמי אם המשתמש ביקש טקסט רציף.', provider: '', model: '', enabled: true },
  { id: 'writer', name: 'כותב טיעוני', prompt: 'כתוב טקסט טיעון חד, טבעי ומשכנע בעברית. שמור על הקול האישי של המשתמש, הימנע מניפוח ומקלישאות, ודאג שכל משפט יקדם את הטענה המרכזית.', provider: '', model: '', enabled: true },
  { id: 'proofreader', name: 'מחזק אחרון', prompt: 'לטש את הטקסט מבחינת בהירות, קצב, דיוק, זרימה ואמינות. בדוק שאין קפיצות לוגיות, טענות לא מבוססות או ניסוחים שנשמעים מלאכותיים.', provider: '', model: '', enabled: true },
]);

const DEPRECATED_DEFAULT_PROVIDER_WORKSPACES = {
  'default-gemini-studio': { preset: 'gemini-studio', providerId: 'gemini', name: 'צוות Gemini' },
  'default-claude-studio': { preset: 'claude-studio', providerId: 'claude', name: 'צוות Claude' },
  'default-perplexity-studio': { preset: 'perplexity-studio', providerId: 'perplexity', name: 'צוות Perplexity' },
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
      timeoutEnabled: true,
      requestTimeoutMs: 45000,
      showProgress: true,
      appendAgentNotesToOutput: false,
      agentNotesInstruction: '',
    },
    agents: getDefaultRoleAgents(),
    lastModified: new Date().toISOString(),
  },
  'default-system-research-heavy': {
    id: 'default-system-research-heavy',
    name: 'מחקר מערכת כבד',
    automation: {
      enabled: true,
      preset: 'system-research-heavy',
      workflowMode: 'manager-auto',
      autoDispatch: true,
      autopilotEnabled: true,
      workspaceName: 'מחקר מערכת כבד',
      circularWorkflowEnabled: false,
      circularMinRounds: 1,
      circularMaxRounds: 2,
      sharedGoal: 'להפיק עבודה מלאה ומבוססת מקורות עם הפרדה בין מחקר אקדמי למחקר משלים, כתיבה מגובשת, התאמת סגנון אישי וביקורת מסכמת לפני החזרה למשתמש.',
      retryEnabled: true,
      maxRetries: 2,
      timeoutEnabled: true,
      requestTimeoutMs: 45000,
      showProgress: true,
      appendAgentNotesToOutput: true,
      agentNotesInstruction: getResearchWorkspaceNotesInstruction(),
    },
    agents: getHeavySystemResearchAgents(),
    lastModified: new Date().toISOString(),
  },
  'default-system-research-light': {
    id: 'default-system-research-light',
    name: 'מחקר מערכת קל',
    automation: {
      enabled: true,
      preset: 'system-research-light',
      workflowMode: 'manager-auto',
      autoDispatch: true,
      autopilotEnabled: true,
      workspaceName: 'מחקר מערכת קל',
      circularWorkflowEnabled: false,
      circularMinRounds: 1,
      circularMaxRounds: 2,
      sharedGoal: 'להפיק עבודה קלה ומהירה יותר עם מחקר אקדמי חסכוני, מחקר משלים, כתיבה, התאמת סגנון אישי וביקורת מסכמת לפני החזרה למשתמש.',
      retryEnabled: true,
      maxRetries: 2,
      timeoutEnabled: true,
      requestTimeoutMs: 45000,
      showProgress: true,
      appendAgentNotesToOutput: true,
      agentNotesInstruction: getResearchWorkspaceNotesInstruction(),
    },
    agents: getLightSystemResearchAgents(),
    lastModified: new Date().toISOString(),
  },
  'default-academic-lab': buildDefaultWorkspaceSeed({
    id: 'default-academic-lab',
    name: 'כתיבה אקדמית מהירה',
    preset: 'academic-lab',
    workflowMode: 'manager-auto',
    sharedGoal: 'להפיק עבודה אקדמית מסודרת ומהירה עם מבנה ברור, מקורות רלוונטיים וליטוש פורמלי בלי להכביד במסלול מחקר מלא.',
    agents: getAcademicLabWorkspaceAgents(),
  }),
  'default-academic-verified': buildDefaultWorkspaceSeed({
    id: 'default-academic-verified',
    name: 'אקדמי מאומת ומבוסס מקורות',
    preset: 'academic-dual-research',
    workflowMode: 'custom-order',
    autopilotEnabled: false,
    sharedGoal: 'להפיק מסמך אקדמי מבוסס מקורות עם הפרדה בין מחקר אקדמי למחקר משלים, כתיבה עם הפניות ובקרת התאמה סופית לפני ההחזרה למשתמש.',
    agents: getAcademicVerifiedWorkspaceAgents(),
  }),
  'default-product-desk': buildDefaultWorkspaceSeed({
    id: 'default-product-desk',
    name: 'מוצר, אפיון ושיווק',
    preset: 'product-desk',
    workflowMode: 'design-first',
    sharedGoal: 'להפיק מסמכי מוצר, PRD, הצעות ותוכן שיווקי עם מסר חד, מבנה קריא ותיעדוף ברור של הערך העסקי.',
    agents: getProductDeskWorkspaceAgents(),
  }),
  'default-legal-contracts': buildDefaultWorkspaceSeed({
    id: 'default-legal-contracts',
    name: 'משפטי וחוזים',
    preset: 'legal-contracts',
    workflowMode: 'manager-auto',
    sharedGoal: 'להפיק מסמכים משפטיים, חוזים, נהלים ומכתבים רשמיים בניסוח מדויק, מבנה ברור ובקרה על ניסוחים מסוכנים או עמומים.',
    agents: getLegalContractsWorkspaceAgents(),
  }),
  'default-final-polish': buildDefaultWorkspaceSeed({
    id: 'default-final-polish',
    name: 'ליטוש והגשה סופית',
    preset: 'final-polish',
    workflowMode: 'custom-order',
    autopilotEnabled: false,
    sharedGoal: 'להעביר טיוטה דרך מסלול קצר של ליטוש, בדיקת מבנה, שיפור ניסוח ובקרת הגשה לפני מסירה או שליחה.',
    agents: getFinalPolishWorkspaceAgents(),
  }),
  'default-social-content': buildDefaultWorkspaceSeed({
    id: 'default-social-content',
    name: 'תוכן שיווקי לרשתות',
    preset: 'social-content',
    workflowMode: 'design-first',
    sharedGoal: 'להפיק פוסטים, קופי, קרוסלות ורצפי תוכן קצרים עם hook ברור, התאמה לפלטפורמה ו-CTA מדויק.',
    agents: getSocialContentWorkspaceAgents(),
  }),
  'default-argument-writing': buildDefaultWorkspaceSeed({
    id: 'default-argument-writing',
    name: 'טקסט טיעון ושכנוע',
    preset: 'argument-writing',
    workflowMode: 'manager-auto',
    autopilotEnabled: true,
    sharedGoal: 'להפיק טקסט טיעון חד, מבוסס ומשכנע ששומר על סגנון אישי, בונה רצף לוגי ברור ומסמן פערי ביסוס במקום להמציא.',
    agents: getArgumentWritingWorkspaceAgents(),
  }),
  'default-autopilot': buildDefaultWorkspaceSeed({
    id: 'default-autopilot',
    name: 'Auto Pilot (מנהל חכם)',
    preset: 'autopilot-full',
    workflowMode: 'autopilot-full',
    autopilotEnabled: true,
    sharedGoal: 'מצב אוטופיילוט מלא: תן לצוות הסוכנים לנווט את קצב העבודה. מנהל העבודה מגדיר לבד איזה סוכן לשתף ומתי עד להשלמת המשימה בצורה אופטימלית.',
    agents: getDefaultRoleAgents(),
  }),
};

export const SKILL_LIBRARY = [
  {
    id: 'style-guardian',
    label: 'ליטוש בסגנון שלי',
    description: 'משכתב ומלטש בלי למחוק את הקול האישי או לנפח את הטקסט.',
    usageHint: 'שכתוב, ליטוש, התאמת טון וניסוח אישי',
    prompt: 'פעל כעורך סגנון אישי. מטרתך היא לשפר ניסוח, בהירות וקצב תוך שמירה על הקול, הכוונה ואוצר המילים הטבעי של המשתמש. אל תוסיף תוכן חדש, אל תנפח משפטים, ואל להפוך טקסט פשוט לפורמלי מדי אלא אם המשתמש ביקש זאת.',
    keywords: ['שכתב', 'ניסוח', 'סגנון', 'טון', 'תחדד', 'ליטוש', 'אנושי', 'מקצועי', 'קול אישי'],
  },
  {
    id: 'template-autopilot',
    label: 'תבנית ודף שער',
    description: 'מסדר מסמך חדש בתבנית, כותרות ושדות פתיחה כשצריך.',
    usageHint: 'דפי שער, מסמכים רשמיים ותבניות',
    prompt: 'פעל כמסדר תבניות. כשנבנה מסמך חדש או רשמי, הצע מבנה, כותרות, שדות פתיחה ודף שער רק אם הם מתאימים לבקשה. אל תכפה תבנית קבועה על טקסט קצר או על שאלה פשוטה.',
    keywords: ['תבנית', 'דף שער', 'שער', 'כותרת', 'מסמך רשמי', 'תבנית מסמך'],
  },
  {
    id: 'academic-structure',
    label: 'מבנה אקדמי',
    description: 'בונה שלד, פרקים ורצף טיעוני לעבודות ומאמרים.',
    usageHint: 'עבודות אקדמיות, מאמרים וסיכומים',
    prompt: 'פעל כבונה מבנה אקדמי. סדר את העבודה לפי ההנחיות, צור שלד פרקים ורצף טיעוני ברור, והבחן בין מה שכבר ידוע לבין מה שחסר. אם המשתמש לא ביקש מבוא, סיכום או פרקים מסוימים, אל תוסיף אותם אוטומטית.',
    keywords: ['עבודה', 'אקדמי', 'מאמר', 'סמינר', 'סיכום', 'הצעת מחקר', 'שלד'],
  },
  {
    id: 'source-hunter',
    label: 'איתור מקורות',
    description: 'מחפש מקורות קונקרטיים ומסמן מה אומת ומה עדיין חסר.',
    usageHint: 'Google Scholar, חיפוש מקורות ומחקר',
    prompt: 'פעל כחוקר מקורות. החזר מקורות קונקרטיים ושימושיים, לא רק כיווני חיפוש. כשאפשר, הבא לפחות 3 מקורות עם כותרת, מחבר או גוף מפרסם, שנה, קישור או DOI, והסבר קצר למה כל מקור רלוונטי. אם אין מספיק מקורות מאומתים, אמור בדיוק מה נמצא ומה חסר. אל תמציא ציטוטים, מאמרים, DOI או פרטים שלא אומתו.',
    keywords: ['מקור', 'מקורות', 'גוגל סקולר', 'google scholar', 'מחקר', 'מאמרים', 'חוקרים', 'youtube', 'וידאו', 'visual', 'ויזואלי', 'צילום מסך', 'screenshot', 'diagram'],
  },
  {
    id: 'citation-weaver',
    label: 'ציטוטים וביבליוגרפיה',
    description: 'משלב מקורות בטקסט ומסדר רשימת מקורות עקבית.',
    usageHint: 'APA, MLA, ביבליוגרפיה והערות שוליים',
    prompt: 'פעל כעורך ציטוטים. שלב מקורות קיימים בתוך הטקסט, סדר הפניות ורשימת מקורות בפורמט עקבי, וסמן במפורש כל מקום שבו חסר מקור אמיתי. אל תמציא פרטי מקור, DOI, עמודים או ציטוטים.',
    keywords: ['ציטוט', 'ביבליוגרפיה', 'apa', 'mla', 'הערת שוליים', 'מקורות בטקסט'],
  },
  {
    id: 'consistency-checker',
    label: 'בדיקת עקביות',
    description: 'מאתר חוסר אחידות בכותרות, מונחים, זמנים וסגנון.',
    usageHint: 'בדיקת אחידות ושיפור מסמך קיים',
    prompt: 'פעל כבודק עקביות למסמך קיים. אתר חוסר אחידות בכותרות, מונחים, זמנים, סגנון, טון, הפניות ועימוד. החזר תיקונים ממוקדים לפי סדר חשיבות, בלי לשכתב את כל המסמך אם אין צורך.',
    keywords: ['בדוק', 'אחידות', 'עקביות', 'שגיאות', 'בקרת איכות', 'יישור קו'],
  },
  {
    id: 'draft-from-materials',
    label: 'טיוטה מחומרים',
    description: 'הופך קבצים, הערות ונושא לטיוטה ראשונה מסודרת.',
    usageHint: 'יצירת טיוטה ראשונה מחומרים שהועלו',
    prompt: 'פעל כבונה טיוטה מחומרי עזר. השתמש בנושא, בקבצים, בהערות ובהנחיות שסופקו כדי ליצור טיוטה ראשונה מסודרת. ארגן את החומר בסדר לוגי, אל תעתיק חומר גלם כפי שהוא, וסמן פערים שלא ניתן להשלים מהחומרים.',
    keywords: ['טיוטה', 'מחומרי עזר', 'מחומרים', 'קבצים', 'תבנה מסמך', 'תכתוב מסמך'],
  },
  {
    id: 'final-submission',
    label: 'בדיקה לפני הגשה',
    description: 'מעבר אחרון על שפה, מבנה, מקורות ודגלים אדומים.',
    usageHint: 'בדיקה אחרונה לפני מסירה או הגשה',
    prompt: 'פעל כבודק לפני הגשה. בצע מעבר אחרון על בהירות, שגיאות, מבנה, עקביות, מקורות ונקודות סיכון. החזר תיקונים או רשימת חסמים קצרה ומעשית; אל תפתח מחדש חלקים תקינים ללא צורך.',
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

function getDefaultRoleAgents() {
  return [
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
      prompt: 'הבהר ושפר את מבנה המסמך רק לפי מה שהתבקש במפורש או כבר קיים בטיוטה. אם המשתמש לא ביקש מבוא, כותרות, פרקים או סיכום - אל תוסיף אותם על דעת עצמך. חשוב על חוויית קריאה ובהירות, אך בלי לכפות שלד קשיח. ענה בעברית.',
      provider: '',
      model: '',
      enabled: true,
    },
    {
      id: 'writer',
      name: 'כותב תוכן',
      prompt: 'כתוב ושכתב טקסטים בעברית מקצועית, בהירה ומשכנעת. תן עדיפות עליונה למה שהמשתמש ביקש ולחומרי העזר שסיפק — ההגדרות המובנות (תבנית, קהל, מסלול) משמשות כרקע בלבד ולא מחליפות את המטלה. אם התוצר מיועד למסמך מוכן או להדבקה ישירה, החזר HTML מעוצב עם תגיות כמו <h1>, <h2>, <h3>, <p>, <ul>, <ol>, <strong> לפי הצורך. אם לא התבקש מסמך מובנה, אל תכפה כותרות, מבוא, סיכום או חלוקת פרקים על דעת עצמך.',
      provider: '',
      model: '',
      enabled: true,
    },
    {
      id: 'researcher',
      name: 'חוקר מקורות',
      prompt: 'אסוף חבילת מחקר usable להעברה לכותב או למנהל: תובנות, נתונים, דוגמאות ומקורות זמינים. אם מדובר בבקשה אקדמית או מבוססת מקורות, העדף מקורות קונקרטיים עם כותרת, מחבר או גוף מפרסם, שנה, וקישור או DOI אם זמין. אם אין מספיק מקורות קונקרטיים, כתוב במפורש מה נמצא ומה עדיין חסר, ורק אז הוסף כיווני חיפוש משלימים. אל תמציא עובדות, ציטוטים, DOI או פרטים שלא אומתו. אם המשתמש ביקש גם חומר חזותי, ציין זאת כהשלמת מחקר שנדרשת דרך סוכן חזותי ייעודי. ענה בעברית מסודרת.',
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
}

function getResearchWorkspaceNotesInstruction() {
  return 'כל סוכן חייב להשאיר ב-CHECKLIST 2-4 נקודות קצרות ומעשיות: מה הושלם, מה עדיין חסר, והמלצה אופרטיבית להמשך. אם נמצאו מקורות חזותיים כמו וידאו, screenshots, מצגות או diagrams, ציין גם לינקים ישירים אליהם ומה לומדים מהם. אם יש פער מהותי או שחסר חומר חזותי אמין, ציין זאת גם ב-MISSING בצורה קצרה וברורה.';
}

function getHeavySystemResearchAgents() {
  return [
    {
      id: 'manager',
      name: 'מנהל עבודה',
      prompt: 'אתה מנהל העבודה הראשי. הבן את המטלה, חלק אותה לשלבים ברורים, ותאם בין כלל הסוכנים. בסביבת מחקר כבדה ברירת המחדל היא להשתמש בצוות המלא: מחקר אקדמי, מחקר משלים, חקר חזותי כשיש צורך, כתיבה, התאמת סגנון, ביקורת מרצה ומנהל מסכם. מותר לדלג על סוכן רק אם הוא באמת לא רלוונטי למשימה, וציין זאת בתכנית. הכוון כל שלב כך שהתוצר הסופי יעמוד בהנחיות המטלה בפועל. אם המשתמש ביקש חקר חזותי או שיש פער בחומרים חזותיים, נצל את הסוכן הייעודי researcher-visual במקום להעמיס את המשימה על שאר החוקרים.',
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      enabled: true,
    },
    {
      id: 'researcher-academic',
      name: 'חוקר אקדמי',
      prompt: 'חפש מקורות אקדמיים בלבד: מחקרים, כתבי עת שפיטים, מאמרים אקדמיים ומקורות scholarly רלוונטיים למשימה. כשאפשר, הבא לפחות 3 מקורות קונקרטיים עם כותרת, מחבר או גוף מפרסם, שנה, וקישור או DOI אם זמין. בגלל שמדובר במודל reasoning, במידת הצורך מותר לך גם לנסח הסבר קצר על כל מקור ומה המסקנה שאפשר להסיק ממנו. אל תמציא מקורות או פרטים. אם חסר מקור, אמור זאת במפורש.',
      provider: 'perplexity',
      model: 'sonar-reasoning-pro',
      enabled: true,
    },
    {
      id: 'researcher-general',
      name: 'חוקר לא אקדמי',
      prompt: 'חקור את הרשת והבא כתבות, דוחות, חומרים מקצועיים ודוגמאות רלוונטיות שאינם אקדמיים. אסור להשתמש ב-Wikipedia. ציין תמיד מה המקור, מה הערך המוסף שלו לעבודה, ומה מידת האמינות או המגבלה שלו. אם ברור שחסר גם חקר חזותי, ציין למנהל העבודה שכדאי להפעיל את researcher-visual.',
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      enabled: true,
    },
    {
      id: 'researcher-visual',
      name: 'חוקר חזותי',
      prompt: 'חפש ברשת חבילת מחקר חזותית usable על המערכת, המוצר או התהליך: סרטוני YouTube/Vimeo, demos, tutorials, screenshots, דוקומנטציה רשמית עם תמונות, diagrams, slide decks, walkthroughs, case studies ותיעוד חזותי אחר. לכל פריט ציין כותרת, סוג מקור, פלטפורמה או גוף מפרסם, קישור ישיר, ומה רואים בו או מה אפשר ללמוד ממנו. תן עדיפות למקורות רשמיים, אמינים ועדכניים. אל תמציא תוכן שלא נצפה בפועל; אם לא נמצא חומר חזותי אמין מספיק, כתוב במפורש מה חסר.',
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      enabled: true,
    },
    {
      id: 'writer',
      name: 'כותב תוכן',
      prompt: 'רכז את כל החומרים שנאספו בשלבים הקודמים וכתוב מהם עבודה מלאה, קוהרנטית ובהירה. כתוב רק על בסיס החומרים שנמסרו. אם חסר לך חומר או שיש פער עובדתי או מבני, הרם דגל אדום ברור למנהל העבודה ב-HANDOFF או ב-MISSING במקום להמציא.',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      enabled: true,
    },
    {
      id: 'document-designer',
      name: 'מעצב מסמך',
      prompt: 'התפקיד היחיד שלך הוא להתאים את המסמך לסגנון האישי של המשתמש ולהפחית סימנים כתובים של AI. מצא היכן צריך לקצר, להרחיב, להחליף ניסוחים, או לשנות קצב וזרימה כדי שהטקסט יישמע אישי, טבעי ומשכנע יותר. אל תמציא עובדות חדשות ואל תשנה את הטיעון עצמו.',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      enabled: true,
    },
    {
      id: 'lecturer-review',
      name: 'מרצה',
      prompt: 'בדוק את העבודה מול הנחיות המטלה כאילו אתה המרצה או הבודק: האם המבנה עונה לדרישות, האם המקורות שהובאו נראים נכונים וקיימים, האם יש פערים לוגיים או ניסוחיים, ומה הציון המשוער. תן הערות לשיפור בצורה ברורה וישימה, אך השאר את DELIVERABLE כמסמך המלא בלבד.',
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      enabled: true,
    },
    {
      id: 'manager-review',
      name: 'מנהל עבודה מסכם',
      prompt: 'קרא את ההערות של כלל הסוכנים והכרע אם נדרש עוד סבב. אם צריך סבב נוסף, ציין זאת ב-DECISION או ב-HANDOFF עם REVISIT לסוכן הרלוונטי. אם לא, אשר את הגרסה הנוכחית. DELIVERABLE חייב להישאר המסמך המלא והמעודכן בלבד.',
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      enabled: true,
    },
  ];
}

function getLightSystemResearchAgents() {
  return getHeavySystemResearchAgents().map((agent) => (
    agent.id === 'researcher-academic'
      ? {
          ...agent,
          model: 'sonar-pro',
          prompt: 'חפש מקורות אקדמיים בלבד: מחקרים, כתבי עת שפיטים, מאמרים אקדמיים ומקורות scholarly רלוונטיים למשימה. כשאפשר, הבא לפחות 3 מקורות קונקרטיים עם כותרת, מחבר או גוף מפרסם, שנה, וקישור או DOI אם זמין. אפשר להוסיף הסבר קצר למה כל מקור חשוב, אבל שמור על מסלול יעיל וחסכוני יותר. אל תמציא מקורות או פרטים. אם חסר מקור, אמור זאת במפורש.',
        }
      : agent
  ));
}

export const DEFAULT_ROLE_AGENTS = getDefaultRoleAgents();

const KNOWN_PROVIDER_IDS = ['gemini', 'openai', 'claude', 'groq', 'perplexity', 'scholar', 'ollama', 'custom'];
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

export const PERSISTED_APP_SETTINGS_KEYS = [
  'wordai_shortcuts',
  'wordai_assistant_behavior',
  'wordai_skills_config',
  'wordai_word_preferences',
  'wordai_presentation_preferences',
  'wordai_spss_preferences',
  'wordai_personal_style',
  'wordai_workspace_automation',
  'wordai_workspace_v2_templates',
  'wordai_workspaces_library',
  'wordai_shared_agent_instructions',
  'wordai_role_agents',
  'wordai_home_instructions',
  'wordai_hidden_project_materials',
  'wordai_saved_docs_history',
  'wordai_app_memory',
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

const resolvePersistedAppSettingsSyncOptions = (options = {}) => {
  const skipKeys = new Set(
    Array.isArray(options?.skipKeys)
      ? options.skipKeys.map((key) => String(key || '').trim()).filter(Boolean)
      : []
  );
  const includeKeys = new Set(
    Array.isArray(options?.includeKeys)
      ? options.includeKeys.map((key) => String(key || '').trim()).filter(Boolean)
      : []
  );
  const isIsolatedDocumentSession = typeof window !== 'undefined'
    && window.desktopApp?.windowContext?.isolatedDocumentSession === true;

  if (isIsolatedDocumentSession && !includeKeys.has('wordai_active_template')) {
    skipKeys.add('wordai_active_template');
  }

  return { skipKeys, includeKeys };
};

export const syncPersistedAppSettings = (options = {}) => {
  if (typeof window === 'undefined' || !window.desktopApp?.saveAppSettings) return;

  try {
    const snapshot = getPersistedAppSettingsSnapshot(options);
    window.desktopApp.saveAppSettings(snapshot).catch(() => {});
  } catch {}
};

export const getPersistedAppSettingsSnapshot = (options = {}) => {
  const { skipKeys, includeKeys } = resolvePersistedAppSettingsSyncOptions(options);
  const snapshot = {};

  PERSISTED_APP_SETTINGS_KEYS.forEach((key) => {
    if (skipKeys.has(key) && !includeKeys.has(key)) return;
    const value = localStorage.getItem(key);
    if (value !== null) snapshot[key] = value;
  });

  return snapshot;
};

export const applyPersistedAppSettingsSnapshot = (snapshot = {}, options = {}) => {
  if (!snapshot || typeof snapshot !== 'object' || typeof window === 'undefined') return false;

  const replaceExisting = options?.replaceExisting !== false;
  let appliedAny = false;

  PERSISTED_APP_SETTINGS_KEYS.forEach((key) => {
    const incoming = snapshot[key];
    if (typeof incoming !== 'string') return;

    const current = localStorage.getItem(key);
    if (!replaceExisting && hasMeaningfulStoredValue(current)) return;
    if (current === incoming) return;

    localStorage.setItem(key, incoming);
    appliedAny = true;
  });

  if (!appliedAny) return false;

  try {
    window.dispatchEvent(new CustomEvent('wordai-settings-hydrated'));
    window.dispatchEvent(new CustomEvent('wordai-personal-style-updated'));
    window.dispatchEvent(new CustomEvent('wordai-workspaces-v2-changed'));
  } catch {}

  return true;
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
        if (key === 'wordai_personal_style' && hasMeaningfulStoredValue(incoming)) {
          try {
            const incomingProfile = normalizePersonalStyleProfile(JSON.parse(incoming));
            const currentProfile = normalizePersonalStyleProfile(JSON.parse(current || '{}'));
            if (hasMeaningfulPersonalProfileData(incomingProfile) && !hasMeaningfulPersonalProfileData(currentProfile)) {
              localStorage.setItem(key, incoming);
              return;
            }
          } catch {}
        }
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
    } finally {
      appSettingsHydrationPromise = null;
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

export const normalizeProviderModelName = (providerId = '', modelName = '') => {
  const clean = String(modelName || '').trim();
  const provider = String(providerId || '').trim();
  if (!clean) return '';

  const canonical = provider === 'gemini' ? clean.replace(/^models\//, '') : clean;

  const aliasMap = {
    gemini: {
      'gemini-2.0-flash': 'gemini-2.5-flash',
      'gemini-2.0-flash-001': 'gemini-2.5-flash',
      'gemini-2.0-flash-exp': 'gemini-2.5-flash',
      'gemini-2.0-flash-lite': 'gemini-2.5-flash',
      'gemini-2.0-flash-thinking': 'gemini-2.5-flash',
      'gemini-2.0-flash-thinking-exp': 'gemini-2.5-flash',
      'gemini-2.0-flash-thinking-exp-01-21': 'gemini-2.5-flash',
    },
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

  return aliasMap[provider]?.[canonical] || canonical;
};

const normalizeToolLinkEntry = (entry = {}, fallback = {}) => {
  const label = String(entry?.label || fallback?.label || '').trim() || String(fallback?.label || '').trim();
  let url = String(entry?.url || fallback?.url || '').trim() || String(fallback?.url || '').trim();
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url.replace(/^\/+/, '')}`;
  return { label, url };
};

let providerConfigCache = null;

// cache אחזור-מקורות ברמת ריצה: ב-pipeline של workspace v2 כל שלב קורא ל-chatWithActiveProvider
// בנפרד ולכן מאחזר את אותה שאילתה שוב ושוב. כאן ממסכמים תוצאה לפי runId+kind+query כדי לחסוך
// קריאות API חוזרות. cap קטן עם eviction של הישן ביותר (Map שומר סדר הכנסה).
const SOURCE_RETRIEVAL_RUN_CACHE = new Map();
const SOURCE_RETRIEVAL_RUN_CACHE_MAX = 120;
const getCachedSourceRetrieval = (key) => (key ? SOURCE_RETRIEVAL_RUN_CACHE.get(key) : undefined);
const setCachedSourceRetrieval = (key, value) => {
  if (!key) return value;
  SOURCE_RETRIEVAL_RUN_CACHE.set(key, value);
  if (SOURCE_RETRIEVAL_RUN_CACHE.size > SOURCE_RETRIEVAL_RUN_CACHE_MAX) {
    const oldestKey = SOURCE_RETRIEVAL_RUN_CACHE.keys().next().value;
    if (oldestKey !== undefined) SOURCE_RETRIEVAL_RUN_CACHE.delete(oldestKey);
  }
  return value;
};
// רק תשובות אחזור מוצלחות נכנסות ל-cache. כישלון/חסימה (טוקן NO_VERIFIED_SOURCES_FOUND או
// providerId חוסם) הוא חד-פעמי ולרוב חולף (timeout/רשת) — אם נשמור אותו, כל שלב מאוחר יותר
// באותה ריצה (runId משותף ל-pipeline) יקבל את הכישלון התקוע ומקורות שעבדו "יפסיקו לעבוד".
// Stage 3-A של תוכנית העיגון (option B): report-only, כבוי כברירת מחדל. כשדולק, אחרי כל תשובה
// מוצלחת מריצים binding טענה→קטע-מקור ופולטים דוח ל-log בלבד — לא נוגעים במסמך, לא חוסמים,
// לא זורקים. מטרה: לראות אם ה-confidence/הסף שפויים על אמת לפני שנותנים ל-gate שיניים (B/C).
const SOURCE_CLAIM_BINDING_REPORT_ENABLED = false;
// אוסף מקורות-מעוגנים (url + groundedPassages) מתוך results, לצריכת ה-binder. ריק אם אין passages.
const collectAnchoredSourcesFromResults = (results = []) => (Array.isArray(results) ? results : [])
  .map((item) => ({
    url: String(item?.url || '').trim(),
    groundedPassages: Array.isArray(item?.groundedPassages) ? item.groundedPassages : [],
  }))
  .filter((item) => item.url && item.groundedPassages.length);

const FAILURE_RETRIEVAL_PROVIDER_IDS = new Set(['verified-source-block', 'grounded-web-results-missing-query']);
const isRetrievalReplyCacheable = (reply) => {
  const text = String(reply?.text || '');
  if (!text.trim()) return false;
  if (text.includes(SOURCE_GROUNDING_FAILURE_TOKEN)) return false;
  if (FAILURE_RETRIEVAL_PROVIDER_IDS.has(String(reply?.providerId || ''))) return false;
  return true;
};

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

export const getAssistantBehavior = () => {
  const stored = readJsonFromStorage('wordai_assistant_behavior', {});
  return {
    ...DEFAULT_ASSISTANT_BEHAVIOR,
    ...stored,
    sidebarModeSettings: normalizeSidebarModeSettings(stored.sidebarModeSettings || DEFAULT_ASSISTANT_BEHAVIOR.sidebarModeSettings),
  };
};

export const saveAssistantBehavior = (config) => {
  localStorage.setItem('wordai_assistant_behavior', JSON.stringify({
    ...DEFAULT_ASSISTANT_BEHAVIOR,
    ...config,
    sidebarModeSettings: normalizeSidebarModeSettings(config?.sidebarModeSettings || DEFAULT_ASSISTANT_BEHAVIOR.sidebarModeSettings),
  }));
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

export const getPresentationPreferences = () => ({
  ...DEFAULT_PRESENTATION_PREFERENCES,
  ...readJsonFromStorage('wordai_presentation_preferences', {}),
});

export const savePresentationPreferences = (config) => {
  localStorage.setItem('wordai_presentation_preferences', JSON.stringify({ ...DEFAULT_PRESENTATION_PREFERENCES, ...config }));
  syncPersistedAppSettings();
};

export const getSpssPreferences = () => ({
  ...DEFAULT_SPSS_PREFERENCES,
  ...readJsonFromStorage('wordai_spss_preferences', {}),
});

export const saveSpssPreferences = (config) => {
  localStorage.setItem('wordai_spss_preferences', JSON.stringify({ ...DEFAULT_SPSS_PREFERENCES, ...config }));
  syncPersistedAppSettings();
};

// העדפות לולאת ההאנשה היריבה (adversarial humanizer). פר-קריאה: target=יעד ציון
// (נמוך=אנושי), maxPasses=מקס' סבבי שכתוב מול הגלאי. enabled=הפעלת הלולאה כולה.
export const DEFAULT_HUMANIZER_PREFERENCES = {
  enabled: true,
  target: 35,
  maxPasses: 4,
};

export const getHumanizerPreferences = () => {
  const stored = readJsonFromStorage('wordai_humanizer_preferences', {});
  const merged = { ...DEFAULT_HUMANIZER_PREFERENCES, ...stored };
  return {
    enabled: merged.enabled !== false,
    target: Math.max(0, Math.min(100, Number(merged.target) || DEFAULT_HUMANIZER_PREFERENCES.target)),
    maxPasses: Math.max(0, Math.min(8, Math.round(Number(merged.maxPasses) || DEFAULT_HUMANIZER_PREFERENCES.maxPasses))),
  };
};

export const saveHumanizerPreferences = (config = {}) => {
  localStorage.setItem('wordai_humanizer_preferences', JSON.stringify({ ...DEFAULT_HUMANIZER_PREFERENCES, ...config }));
  syncPersistedAppSettings();
};

const normalizeProfileTextValue = (value = '') => String(value || '').trim();
const normalizeProfileListValue = (value = []) => {
  const items = Array.isArray(value)
    ? value
    : (typeof value === 'string' ? String(value || '').split(/[\n,]/) : []);

  return [...new Set(items.map((item) => normalizeProfileTextValue(item)).filter(Boolean))];
};

const getNormalizedLecturerNames = (profile = {}) => {
  const lecturerNames = normalizeProfileListValue(profile?.lecturerNames);
  if (lecturerNames.length) return lecturerNames;
  const fallback = normalizeProfileTextValue(profile?.lecturerName);
  return fallback ? [fallback] : [];
};

const SYLLABUS_IMPORT_SCALAR_PROVENANCE_FIELDS = ['assignmentType', 'submissionDate'];

const normalizeSyllabusImportScalarProvenance = (value = {}) => {
  const source = value && typeof value === 'object' ? value : {};
  return {
    assignmentType: source.assignmentType === 'manual' || source.assignmentType === 'syllabus' ? source.assignmentType : '',
    submissionDate: source.submissionDate === 'manual' || source.submissionDate === 'syllabus' ? source.submissionDate : '',
  };
};

const getSyllabusImportScalarProvenance = (profile = {}, field = '') => (
  SYLLABUS_IMPORT_SCALAR_PROVENANCE_FIELDS.includes(field)
    ? normalizeSyllabusImportScalarProvenance(profile?.syllabusImportProvenance)[field] || ''
    : ''
);

const withSyllabusImportScalarProvenance = (profile = {}, field = '', source = '') => {
  const base = profile && typeof profile === 'object' ? profile : {};
  if (!SYLLABUS_IMPORT_SCALAR_PROVENANCE_FIELDS.includes(field)) return { ...base };
  const normalizedSource = source === 'manual' || source === 'syllabus' ? source : '';

  return {
    ...base,
    syllabusImportProvenance: {
      ...normalizeSyllabusImportScalarProvenance(base.syllabusImportProvenance),
      [field]: normalizedSource,
    },
  };
};

export const applyManualProfileScalarFieldUpdate = (profile = {}, field = '', value = '') => {
  const nextProfile = {
    ...(profile && typeof profile === 'object' ? profile : {}),
    [field]: value,
  };

  return SYLLABUS_IMPORT_SCALAR_PROVENANCE_FIELDS.includes(field)
    ? withSyllabusImportScalarProvenance(nextProfile, field, normalizeProfileTextValue(value) ? 'manual' : '')
    : nextProfile;
};

export const normalizePersonalStyleProfile = (profile = {}) => {
  const base = {
    ...DEFAULT_PERSONAL_STYLE,
    ...(profile && typeof profile === 'object' ? profile : {}),
  };
  const lecturerNames = getNormalizedLecturerNames(base);

  return {
    ...base,
    syllabusImportProvenance: normalizeSyllabusImportScalarProvenance(base.syllabusImportProvenance),
    lecturerNames,
    lecturerName: lecturerNames[0] || normalizeProfileTextValue(base.lecturerName),
    currentCourses: normalizeProfileListValue(base.currentCourses),
    syllabusTopics: normalizeProfileListValue(base.syllabusTopics),
  };
};

export const getPersonalStyleProfile = () => normalizePersonalStyleProfile(
  readJsonFromStorage('wordai_personal_style', {})
);

export const savePersonalStyleProfile = (profile) => {
  const normalizedProfile = normalizePersonalStyleProfile(profile);
  localStorage.setItem('wordai_personal_style', JSON.stringify({
    ...DEFAULT_PERSONAL_STYLE,
    ...normalizedProfile,
    last_updated: new Date().toISOString(),
  }));
  syncPersistedAppSettings();
};

const normalizeMeaningfulProfileText = normalizeProfileTextValue;
const normalizeMeaningfulProfileList = (value = []) => [...normalizeProfileListValue(value)].sort();

const hasMeaningfulPersonalProfileField = (field, value) => {
  if (Array.isArray(value)) {
    const currentValues = normalizeMeaningfulProfileList(value);
    if (!currentValues.length) return false;
    const defaultValues = normalizeMeaningfulProfileList(DEFAULT_PERSONAL_STYLE[field]);
    if (currentValues.length !== defaultValues.length) return true;
    return currentValues.some((item, index) => item !== defaultValues[index]);
  }

  const currentValue = normalizeMeaningfulProfileText(value);
  if (!currentValue) return false;
  return currentValue !== normalizeMeaningfulProfileText(DEFAULT_PERSONAL_STYLE[field]);
};

export const hasMeaningfulPersonalProfileData = (profile = {}) => {
  const textFields = [
    'displayName',
    'institutionName',
    'studyTrack',
    'lecturerName',
    'assignmentType',
    'studentId',
    'aiAssistanceDeclaration',
    'submissionDate',
    'userRole',
    'additionalContext',
    'paragraphPreferences',
    'notes',
    'customStyleGuidance',
    'styleTrainingSummary',
    'userBackground',
    'writingGoals',
    'defaultAudience',
    'formatPreferences',
    'sentenceLengthPreference',
    'paragraphLengthPreference',
    'linguisticRegisterPreference',
    'greetingStyle',
    'signOffStyle',
    'goldenExample',
    'avoidRules',
    'alwaysRules',
    'favoritePhrases',
    'externalStyleAnalysisProcessedAt',
  ];
  const listFields = [
    'lecturerNames',
    'currentCourses',
    'syllabusTopics',
    'manualVocabulary',
    'manualPhrases',
    'preferredSentenceStructures',
    'tonePreferences',
    'preferredHomeStyleIds',
    'learningGameInsights',
    'preferredTrainingExamples',
    'dislikedStylePatterns',
    'learnedNotes',
    'learnedSentencePatterns',
    'preferredConnectors',
    'preferredSentenceOpeners',
    'toneDescriptors',
    'preferredDocumentTypes',
    'examples',
  ];

  if (textFields.some((field) => hasMeaningfulPersonalProfileField(field, profile?.[field]))) return true;
  if (listFields.some((field) => hasMeaningfulPersonalProfileField(field, profile?.[field]))) return true;
  if (String(profile?.externalStyleAnalysisStatus || '').trim() === 'processed') return true;
  if (profile?.learningGameAnswers && Object.keys(profile.learningGameAnswers).length > 0) return true;
  if (profile?.styleFingerprint && Object.keys(profile.styleFingerprint).length > 0) return true;
  if (profile?.scanStats && Object.values(profile.scanStats).some((value) => (typeof value === 'number' ? value > 0 : String(value || '').trim()))) return true;
  return false;
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
  const sourceAutomation = automation && typeof automation === 'object' ? automation : {};
  const merged = {
    ...DEFAULT_WORKSPACE_AUTOMATION,
    ...sourceAutomation,
  };
  const rawRequestTimeoutMs = Number(merged.requestTimeoutMs);
  merged.requestTimeoutMs = Number.isFinite(rawRequestTimeoutMs) && rawRequestTimeoutMs > 0
    ? (rawRequestTimeoutMs < 1000 ? rawRequestTimeoutMs * 1000 : rawRequestTimeoutMs)
    : DEFAULT_WORKSPACE_AUTOMATION.requestTimeoutMs;
  const hasStoredTimeoutPreference = typeof sourceAutomation.timeoutEnabled === 'boolean';
  if (merged.timeoutConfigured !== true && !hasStoredTimeoutPreference) {
    merged.timeoutEnabled = true;
  }
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

const serializeWorkspaceForMigrationComparison = (workspaceId = '', workspace = {}, fallbackName = '') => {
  const normalized = normalizeWorkspaceRecord(workspaceId, workspace, fallbackName);
  return JSON.stringify({
    id: normalized.id,
    name: normalized.name,
    automation: normalized.automation,
    agents: normalized.agents,
  });
};

const removeDeprecatedDefaultProviderWorkspaces = (library = {}) => {
  const nextLibrary = { ...(library || {}) };
  let wasUpdated = false;
  const workspacePointer = readJsonFromStorage('wordai_workspace_automation', {});
  const activeWorkspaceId = String(workspacePointer?.activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  const workspaceBypassEnabled = workspacePointer?.workspaceBypassEnabled === true;
  let removedRememberedWorkspace = false;

  Object.entries(DEPRECATED_DEFAULT_PROVIDER_WORKSPACES).forEach(([workspaceId, metadata]) => {
    const workspace = nextLibrary[workspaceId];
    if (!workspace || typeof workspace !== 'object') return;
    if (!workspaceBypassEnabled && activeWorkspaceId === workspaceId) return;
    if (String(workspace?.automation?.preset || '').trim() !== metadata.preset) return;

    const legacyDefaultWorkspace = buildProviderFocusedWorkspaceSeed({
      id: workspaceId,
      name: metadata.name,
      preset: metadata.preset,
      providerId: metadata.providerId,
    });
    const currentWorkspaceSignature = serializeWorkspaceForMigrationComparison(workspaceId, workspace, metadata.name);
    const legacyDefaultSignature = serializeWorkspaceForMigrationComparison(workspaceId, legacyDefaultWorkspace, metadata.name);
    if (currentWorkspaceSignature !== legacyDefaultSignature) return;

    if (workspaceBypassEnabled && activeWorkspaceId === workspaceId) {
      removedRememberedWorkspace = true;
    }

    delete nextLibrary[workspaceId];
    wasUpdated = true;
  });

  if (removedRememberedWorkspace) {
    persistWorkspacePointer({
      activeWorkspaceId: DEFAULT_WORKSPACE_ID,
      workspaceBypassEnabled: true,
    });
  }

  return { library: nextLibrary, wasUpdated };
};

const buildLegacyTimeoutDisabledWorkspaceRecord = (workspace = {}) => ({
  ...(workspace && typeof workspace === 'object' ? workspace : {}),
  automation: {
    ...((workspace && typeof workspace === 'object' ? workspace.automation : {}) || {}),
    timeoutEnabled: false,
  },
});

const upgradeLegacyDefaultWorkspaceTimeouts = (library = {}) => {
  const nextLibrary = { ...(library || {}) };
  let wasUpdated = false;

  Object.entries(DEFAULT_WORKSPACES_LIBRARY).forEach(([workspaceId, workspace]) => {
    const currentWorkspace = nextLibrary[workspaceId];
    if (!currentWorkspace || typeof currentWorkspace !== 'object') return;

    const fallbackName = workspace?.name || (workspaceId === DEFAULT_WORKSPACE_ID ? 'סטודיו תוכן (ברירת מחדל)' : 'סביבה חדשה');
    const currentSignature = serializeWorkspaceForMigrationComparison(workspaceId, currentWorkspace, fallbackName);
    const legacySignature = serializeWorkspaceForMigrationComparison(
      workspaceId,
      buildLegacyTimeoutDisabledWorkspaceRecord(workspace),
      fallbackName
    );

    if (currentSignature !== legacySignature) return;

    nextLibrary[workspaceId] = normalizeWorkspaceRecord(workspaceId, workspace, fallbackName);
    wasUpdated = true;
  });

  return { library: nextLibrary, wasUpdated };
};

const ensureDefaultWorkspaceEntries = (library = {}) => {
  const migrationResult = removeDeprecatedDefaultProviderWorkspaces(library);
  const timeoutMigration = upgradeLegacyDefaultWorkspaceTimeouts(migrationResult.library || {});
  const nextLibrary = { ...(timeoutMigration.library || {}) };
  let wasUpdated = false;

  if (migrationResult.wasUpdated) wasUpdated = true;
  if (timeoutMigration.wasUpdated) wasUpdated = true;

  Object.entries(DEFAULT_WORKSPACES_LIBRARY).forEach(([workspaceId, workspace]) => {
    if (nextLibrary[workspaceId]) return;
    nextLibrary[workspaceId] = normalizeWorkspaceRecord(
      workspaceId,
      workspace,
      workspace?.name || (workspaceId === DEFAULT_WORKSPACE_ID ? 'סטודיו תוכן (ברירת מחדל)' : 'סביבה חדשה')
    );
    wasUpdated = true;
  });

  return { library: nextLibrary, wasUpdated };
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
  const workspaceBypassEnabled = WORKSPACE_AUTOMATION_QUARANTINED || baseAutomation.workspaceBypassEnabled === true;
  const library = getWorkspacesLibrary();
  let activeWorkspaceId = String(baseAutomation.activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;

  if (!library[activeWorkspaceId]) {
    activeWorkspaceId = DEFAULT_WORKSPACE_ID;
    persistWorkspacePointer({ activeWorkspaceId });
  }

  const activeWorkspace = library[activeWorkspaceId] || normalizeWorkspaceRecord(DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACES_LIBRARY[DEFAULT_WORKSPACE_ID] || {}, 'סטודיו תוכן (ברירת מחדל)');
  const resolvedAutomation = normalizeWorkspaceAutomationRecord({
    ...baseAutomation,
    ...(activeWorkspace?.automation || {}),
  }, activeWorkspaceId, activeWorkspace?.name || 'סביבת עבודה מותאמת');
  resolvedAutomation.workspaceBypassEnabled = workspaceBypassEnabled;
  if (workspaceBypassEnabled) {
    resolvedAutomation.enabled = false;
    resolvedAutomation.autoDispatch = false;
    if (WORKSPACE_AUTOMATION_QUARANTINED) {
      resolvedAutomation.quarantineReason = 'legacy-workspace-context-leak';
    }
  }
  return resolvedAutomation;
};

export const shouldUseWorkspaceAutomation = (automation = getWorkspaceAutomation()) => (
  automation?.enabled === true && automation?.autoDispatch !== false
);

export const resolveWorkspaceRouting = ({
  automation = getWorkspaceAutomation(),
  workflowMode = '',
  forceDirectMode = false,
  skipWorkflowAutomation = false,
  workspaceBypassActive = false,
  exactSourceLock = false,
} = {}) => {
  const resolvedAutomation = automation && typeof automation === 'object' ? automation : getWorkspaceAutomation();
  const resolvedWorkflowMode = String(workflowMode || resolvedAutomation?.workflowMode || 'manager-auto').trim() || 'manager-auto';

  if (forceDirectMode) {
    return { mode: 'direct', shouldUseWorkflowAutomation: false, reason: 'forceDirectMode', agents: [] };
  }
  if (skipWorkflowAutomation) {
    return { mode: 'direct', shouldUseWorkflowAutomation: false, reason: 'skipWorkflowAutomation', agents: [] };
  }
  if (exactSourceLock) {
    return { mode: 'direct', shouldUseWorkflowAutomation: false, reason: 'exactSourceUrlLock', agents: [] };
  }
  if (workspaceBypassActive || resolvedAutomation?.workspaceBypassEnabled === true) {
    return { mode: 'direct', shouldUseWorkflowAutomation: false, reason: 'workspaceBypass', agents: [] };
  }
  if (resolvedAutomation?.enabled !== true) {
    return { mode: 'direct', shouldUseWorkflowAutomation: false, reason: 'workspaceDisabled', agents: [] };
  }
  if (resolvedAutomation?.autoDispatch === false) {
    return { mode: 'direct', shouldUseWorkflowAutomation: false, reason: 'autoDispatchDisabled', agents: [] };
  }

  const agents = getOrderedRoleAgents(resolvedWorkflowMode);
  if (!Array.isArray(agents) || !agents.length) {
    return { mode: 'direct', shouldUseWorkflowAutomation: false, reason: 'noActiveAgents', agents: [] };
  }

  return {
    mode: 'workspace',
    shouldUseWorkflowAutomation: true,
    reason: '',
    agents,
    workflowMode: resolvedWorkflowMode,
    workspaceId: String(resolvedAutomation?.activeWorkspaceId || '').trim(),
    workspaceName: String(resolvedAutomation?.workspaceName || '').trim(),
  };
};

const sanitizeWorkspaceAutomationForPersistence = (automation = {}, { preserveWorkspaceToggles = true } = {}) => {
  const nextAutomation = {
    ...(automation && typeof automation === 'object' ? automation : {}),
  };
  delete nextAutomation.workspaceBypassEnabled;
  if (!preserveWorkspaceToggles) {
    delete nextAutomation.enabled;
    delete nextAutomation.autoDispatch;
  }
  return nextAutomation;
};

export const saveWorkspaceAutomation = (config) => {
  const currentAutomation = getWorkspaceAutomation();
  const activeWorkspaceId = String(currentAutomation.activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  const library = getWorkspacesLibrary();
  const workspace = normalizeWorkspaceRecord(activeWorkspaceId, library[activeWorkspaceId] || {}, currentAutomation.workspaceName || 'סביבת עבודה מותאמת');
  const bypassActive = currentAutomation.workspaceBypassEnabled === true;
  const sanitizedConfig = sanitizeWorkspaceAutomationForPersistence(config, {
    preserveWorkspaceToggles: !bypassActive,
  });
  const timeoutPreferencePatch = Object.prototype.hasOwnProperty.call(sanitizedConfig, 'timeoutEnabled')
    ? { timeoutConfigured: true }
    : ((workspace?.automation?.timeoutConfigured === true || currentAutomation.timeoutConfigured === true)
      ? { timeoutConfigured: true }
      : {});
  const nextWorkspaceName = sanitizeWorkspaceName(
    config?.workspaceName || workspace?.name || workspace?.automation?.workspaceName,
    workspace?.name || 'סביבת עבודה מותאמת'
  );
  const currentWorkspaceAutomation = normalizeWorkspaceAutomationRecord({
    ...workspace.automation,
    workspaceName: nextWorkspaceName,
  }, activeWorkspaceId, nextWorkspaceName);
  const nextAutomation = normalizeWorkspaceAutomationRecord({
    ...workspace.automation,
    ...sanitizedConfig,
    ...timeoutPreferencePatch,
    workspaceName: nextWorkspaceName,
  }, activeWorkspaceId, nextWorkspaceName);

  if (
    String(workspace?.name || '').trim() === nextWorkspaceName
    && JSON.stringify(currentWorkspaceAutomation) === JSON.stringify(nextAutomation)
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
  persistWorkspacePointer({
    ...nextAutomation,
    workspaceBypassEnabled: bypassActive,
  });
  syncPersistedAppSettings();
  emitWorkspaceChangedEvent('workspace-automation-saved', activeWorkspaceId);
  return getWorkspaceAutomation();
};

export const setWorkspaceBypassEnabled = (enabled = true) => {
  const currentAutomation = getWorkspaceAutomation();
  const activeWorkspaceId = String(currentAutomation.activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  persistWorkspacePointer({
    activeWorkspaceId,
    workspaceBypassEnabled: WORKSPACE_AUTOMATION_QUARANTINED ? true : Boolean(enabled),
  });
  syncPersistedAppSettings();
  emitWorkspaceChangedEvent(enabled ? 'workspace-bypass-enabled' : 'workspace-bypass-disabled', activeWorkspaceId);
  return getWorkspaceAutomation();
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

    const seededDefaults = ensureDefaultWorkspaceEntries(cleaned);
    if (seededDefaults.wasUpdated) needsRepair = true;

    if (needsRepair) {
      localStorage.setItem('wordai_workspaces_library', JSON.stringify(seededDefaults.library));
      syncPersistedAppSettings();
    }

    return seededDefaults.library;
  } catch (error) {
    console.error('❌ שגיאה בטעינת ספריית סביבות:', error);
    return ensureDefaultWorkspaceEntries({}).library;
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

  const seededDefaults = ensureDefaultWorkspaceEntries(cleaned);

  localStorage.setItem('wordai_workspaces_library', JSON.stringify(seededDefaults.library));

  const pointer = readJsonFromStorage('wordai_workspace_automation', {});
  const activeWorkspaceId = String(pointer.activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  if (!seededDefaults.library[activeWorkspaceId]) {
    persistWorkspacePointer({ activeWorkspaceId: DEFAULT_WORKSPACE_ID });
  }

  syncPersistedAppSettings();
  return seededDefaults.library;
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
  if (!targetId || Object.prototype.hasOwnProperty.call(DEFAULT_WORKSPACES_LIBRARY, targetId)) return false;

  const library = getWorkspacesLibrary();
  if (!library[targetId]) return false;

  const currentAutomation = getWorkspaceAutomation();
  const wasActive = String(currentAutomation.activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() === targetId;
  const bypassActive = currentAutomation.workspaceBypassEnabled === true;

  delete library[targetId];
  saveWorkspacesLibrary(library);

  if (wasActive) {
    if (bypassActive) {
      const fallbackWorkspace = normalizeWorkspaceRecord(
        DEFAULT_WORKSPACE_ID,
        library[DEFAULT_WORKSPACE_ID] || DEFAULT_WORKSPACES_LIBRARY[DEFAULT_WORKSPACE_ID] || {},
        'סטודיו תוכן (ברירת מחדל)'
      );
      persistWorkspacePointer({
        activeWorkspaceId: DEFAULT_WORKSPACE_ID,
        workspaceBypassEnabled: true,
      });
      localStorage.setItem('wordai_role_agents', JSON.stringify(cloneAgentRecords(fallbackWorkspace.agents || [])));
      syncPersistedAppSettings();
      emitWorkspaceChangedEvent('workspace-deleted', targetId);
    } else {
      switchToWorkspace(DEFAULT_WORKSPACE_ID);
    }
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
  persistWorkspacePointer({ ...automationSnapshot, workspaceBypassEnabled: false });
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

export const updateWorkspaceById = (workspaceId, updates = {}) => {
  const targetId = String(workspaceId || '').trim();
  if (!targetId) return false;

  const activeWorkspaceId = String(getWorkspaceAutomation().activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  if (targetId === activeWorkspaceId) {
    return updateCurrentWorkspace(updates);
  }

  const library = getWorkspacesLibrary();
  const existingWorkspace = library[targetId];
  if (!existingWorkspace) return false;

  const workspace = normalizeWorkspaceRecord(targetId, existingWorkspace, existingWorkspace?.name || 'סביבה חדשה');
  const nextName = sanitizeWorkspaceName(
    updates?.name || updates?.workspaceName || workspace?.name,
    workspace?.name || 'סביבה חדשה'
  );
  const nextAutomation = normalizeWorkspaceAutomationRecord({
    ...workspace.automation,
    ...(updates?.automation && typeof updates.automation === 'object' ? updates.automation : {}),
    workspaceName: nextName,
  }, targetId, nextName);
  const nextAgents = updates?.agents ? cloneAgentRecords(updates.agents) : cloneAgentRecords(workspace.agents || []);

  library[targetId] = normalizeWorkspaceRecord(targetId, {
    ...workspace,
    ...(updates && typeof updates === 'object' ? updates : {}),
    name: nextName,
    automation: nextAutomation,
    agents: nextAgents,
    lastModified: new Date().toISOString(),
  }, nextName);

  saveWorkspacesLibrary(library);
  emitWorkspaceChangedEvent('workspace-updated', targetId);
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

  console.log('📤 Final agents to save:', cleanAgents);
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
  const automation = getWorkspaceAutomation();
  const agents = getRoleAgents().filter((agent) => agent.enabled !== false && String(agent.prompt || '').trim());
  console.log('👥 Filtered enabled agents:', agents.map(a => ({ name: a.name, enabled: a.enabled, provider: a.provider, model: a.model })));
  
  if (workflowMode === 'custom-order') {
    console.log('🎨 Using custom order - returning agents as-is');
    return agents;
  }

  const configuredOrder = [
    ...agents.filter((agent) => isPlanningManagerAgent(agent)),
    ...agents.filter((agent) => !isPlanningManagerAgent(agent) && !isManagerReviewAgent(agent)),
    ...agents.filter((agent) => isManagerReviewAgent(agent)),
  ];

  if (AUTOPILOT_MANAGER_WORKFLOW_MODES.has(workflowMode) && automation?.autopilotEnabled === false) {
    return configuredOrder;
  }

  const desiredOrders = {
    'autopilot-full': ['manager', 'researcher', 'designer', 'writer', 'proofreader'],
    'manager-auto': ['manager', 'researcher', 'designer', 'writer', 'proofreader'],
    'circular-team': ['manager', 'researcher', 'designer', 'writer', 'proofreader'],
    'manager-pipeline': ['manager', 'researcher', 'designer', 'writer', 'proofreader'],
    'design-first': ['designer', 'manager', 'writer', 'researcher', 'proofreader'],
    'research-first': ['researcher', 'manager', 'designer', 'writer', 'proofreader'],
  };

  const order = desiredOrders[workflowMode];
  if (!order) return configuredOrder;

  const getRank = (agent) => {
    if (isManagerReviewAgent(agent)) return 999;
    if (isPlanningManagerAgent(agent)) return -1;
    if (isDocumentDesignerAgent(agent)) return 3.5;
    const roleKey = getAgentRoleKey(agent);
    const index = order.findIndex((item) => roleKey === item);
    return index === -1 ? 999 : index;
  };

  return [...configuredOrder].sort((a, b) => getRank(a) - getRank(b));
};

const WORKSPACE_AGENT_PRESETS = {
  'content-studio': {
    label: 'סטודיו תוכן',
    description: 'מנהל עבודה אוטומטי, מעצב מבנה, כותב, חוקר ומגיה.',
    automation: { enabled: true, preset: 'content-studio', workflowMode: 'manager-auto', autoDispatch: true },
    agents: DEFAULT_ROLE_AGENTS,
  },
  'gemini-studio': {
    label: 'צוות Gemini',
    description: 'כל הסוכנים רצים דרך Gemini. המודל בפועל נשאב מהגדרת Gemini הפעילה.',
    automation: { enabled: true, preset: 'gemini-studio', workflowMode: 'manager-auto', autoDispatch: true },
    agents: buildProviderFocusedWorkspaceAgents('gemini'),
  },
  'claude-studio': {
    label: 'צוות Claude',
    description: 'כל הסוכנים רצים דרך Claude. המודל בפועל נשאב מהגדרת Claude הפעילה.',
    automation: { enabled: true, preset: 'claude-studio', workflowMode: 'manager-auto', autoDispatch: true },
    agents: buildProviderFocusedWorkspaceAgents('claude'),
  },
  'perplexity-studio': {
    label: 'צוות Perplexity',
    description: 'כל הסוכנים רצים דרך Perplexity. המודל בפועל נשאב מהגדרת Perplexity הפעילה.',
    automation: { enabled: true, preset: 'perplexity-studio', workflowMode: 'manager-auto', autoDispatch: true },
    agents: buildProviderFocusedWorkspaceAgents('perplexity'),
  },
  'academic-lab': {
    label: 'צוות אקדמי',
    description: 'מתאים לעבודות, סמינרים וסיכומים פורמליים עם מנהל עבודה אוטומטי.',
    automation: { enabled: true, preset: 'academic-lab', workflowMode: 'manager-auto', autoDispatch: true },
    agents: getAcademicLabWorkspaceAgents(),
  },
  'academic-dual-research': {
    label: 'אקדמי מאומת - Claude מוביל',
    description: 'קלוד מנהל, Perplexity מחקר אקדמי, Gemini מחקר משלים, כתיבה ובקרה סופית עם הפניות למקורות.',
    automation: { enabled: true, preset: 'academic-dual-research', workflowMode: 'custom-order', autoDispatch: true, autopilotEnabled: false },
    agents: getAcademicVerifiedWorkspaceAgents(),
  },
  'system-research-heavy': {
    label: 'מחקר מערכת כבד',
    description: 'Gemini מנהל, Perplexity reasoning למחקר אקדמי, Gemini למחקר משלים, Claude לכתיבה ולעיצוב, מרצה בודק ומנהל מסכם.',
    automation: {
      enabled: true,
      preset: 'system-research-heavy',
      workflowMode: 'manager-auto',
      autoDispatch: true,
      autopilotEnabled: true,
      appendAgentNotesToOutput: true,
      agentNotesInstruction: getResearchWorkspaceNotesInstruction(),
      sharedGoal: 'להפיק עבודה מלאה ומבוססת מקורות בעזרת צוות מלא: מחקר אקדמי, מחקר משלים, כתיבה, התאמת סגנון אישי, ביקורת מרצה ובקרה מסכמת. מקורות, דרישות והחלטות ביניים חייבים להישמר בתיק העבודה עד התוצר הסופי.',
    },
    agents: getHeavySystemResearchAgents(),
  },
  'system-research-light': {
    label: 'מחקר מערכת קל',
    description: 'זהה למסלול הכבד, אבל החוקר האקדמי עובר ל-Sonar Pro הרגיל למסלול חסכוני יותר.',
    automation: {
      enabled: true,
      preset: 'system-research-light',
      workflowMode: 'manager-auto',
      autoDispatch: true,
      autopilotEnabled: true,
      appendAgentNotesToOutput: true,
      agentNotesInstruction: getResearchWorkspaceNotesInstruction(),
      sharedGoal: 'להפיק עבודה קלה ומהירה יותר בלי לאבד את עבודת הצוות: מחקר אקדמי חסכוני, מחקר משלים כשצריך, כתיבה, התאמת סגנון אישי וביקורת מסכמת. מקורות ודרישות ביניים חייבים להישמר עד התוצר הסופי.',
    },
    agents: getLightSystemResearchAgents(),
  },
  'product-desk': {
    label: 'צוות מוצר',
    description: 'מתאים למסמכי אפיון, רעיונות ותוכן שיווקי.',
    automation: { enabled: true, preset: 'product-desk', workflowMode: 'design-first', autoDispatch: true },
    agents: getProductDeskWorkspaceAgents(),
  },
  'legal-contracts': {
    label: 'משפטי וחוזים',
    description: 'מתאים להסכמים, נהלים, מכתבים רשמיים ומסמכים שדורשים ניסוח זהיר ומדויק.',
    automation: { enabled: true, preset: 'legal-contracts', workflowMode: 'manager-auto', autoDispatch: true },
    agents: getLegalContractsWorkspaceAgents(),
  },
  'final-polish': {
    label: 'ליטוש והגשה סופית',
    description: 'מסלול קצר לשיוף טיוטה, בדיקת מבנה, ליטוש ניסוח ושער הגשה סופי.',
    automation: { enabled: true, preset: 'final-polish', workflowMode: 'custom-order', autoDispatch: true, autopilotEnabled: false },
    agents: getFinalPolishWorkspaceAgents(),
  },
  'social-content': {
    label: 'תוכן שיווקי לרשתות',
    description: 'מיועד לפוסטים, קופי, קרוסלות, מודעות ורצפי תוכן קצרים עם hook ו-CTA.',
    automation: { enabled: true, preset: 'social-content', workflowMode: 'design-first', autoDispatch: true },
    agents: getSocialContentWorkspaceAgents(),
  },
  'argument-writing': {
    label: 'טקסט טיעון ושכנוע',
    description: 'מיועד למאמרי דעה, נאומים, פסקאות טיעון וטקסטים שצריכים לוגיקה, קול אישי ושכנוע.',
    automation: { enabled: true, preset: 'argument-writing', workflowMode: 'manager-auto', autoDispatch: true, autopilotEnabled: true },
    agents: getArgumentWritingWorkspaceAgents(),
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

// פיצ'רים שיכולים לקבל API ייעודי (provider+model+key נפרד מהגלובלי)
export const FEATURE_OVERRIDE_IDS = ['spss', 'presentations'];

// ספקי תמונות זמינים ל-override לפי פיצ'ר
export const IMAGE_STOCK_PROVIDER_IDS = ['pexels', 'unsplash'];
export const IMAGE_GEN_PROVIDER_IDS = ['gemini', 'openai', 'stability', 'xai', 'flux'];

const normalizeFeatureImage = (raw = {}) => {
  const img = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: Boolean(img.enabled),
    stockProvider: IMAGE_STOCK_PROVIDER_IDS.includes(img.stockProvider) ? img.stockProvider : '',
    stockKey: String(img.stockKey || '').trim(),
    genProvider: IMAGE_GEN_PROVIDER_IDS.includes(img.genProvider) ? img.genProvider : '',
    genModel: String(img.genModel || '').trim(),
    genKey: String(img.genKey || '').trim(),
  };
};

const normalizeFeatureOverrides = (raw = {}) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const id of FEATURE_OVERRIDE_IDS) {
    const ov = source[id] && typeof source[id] === 'object' ? source[id] : {};
    const providerId = KNOWN_PROVIDER_IDS.includes(ov.providerId) ? ov.providerId : '';
    out[id] = {
      enabled: Boolean(ov.enabled) && Boolean(providerId),
      providerId,
      model: String(ov.model || '').trim(),
      key: String(ov.key || '').trim(),
      baseUrl: String(ov.baseUrl || '').trim(),
      image: normalizeFeatureImage(ov.image),
    };
  }
  return out;
};

/**
 * getFeatureProviderConfig — מחזיר config מותאם לפיצ'ר אם הוגדר לו API ייעודי.
 * @returns {{ config: object, providerId: string, model: string } | null}
 *   null = אין override פעיל → השתמש ב-provider הגלובלי כרגיל.
 */
export const getFeatureProviderConfig = (featureId, baseConfig = null) => {
  const cfg = baseConfig || getProviderConfig();
  const ov = cfg?.featureOverrides?.[featureId];
  if (!ov || !ov.enabled) return null;
  const providerId = String(ov.providerId || '').trim();
  if (!providerId || !KNOWN_PROVIDER_IDS.includes(providerId)) return null;
  // משכפל את ה-config הגלובלי, כופה את ה-provider הייעודי ומזריק מפתח/מודל/baseUrl ייעודיים.
  // key/model ריקים → נופלים לערך הגלובלי של אותו provider.
  const merged = normalizeProviderConfig({
    ...cfg,
    active: providerId,
    activeProviders: [providerId],
    multiModelEnabled: false,
    [providerId]: {
      ...(cfg[providerId] || {}),
      ...(ov.key ? { key: ov.key } : {}),
      ...(ov.model ? { model: ov.model } : {}),
      ...(ov.baseUrl ? { baseUrl: ov.baseUrl } : {}),
    },
  });
  return { config: merged, providerId, model: String(ov.model || merged[providerId]?.model || '').trim() };
};

/**
 * getFeatureImageConfig — מחזיר config תמונות מותאם לפיצ'ר אם הוגדר API ייעודי לתמונות.
 * @returns {object|null} provider-config מנורמל עם imageProvider/pexels/unsplash/imageGen מוחלפים, או null.
 */
export const getFeatureImageConfig = (featureId, baseConfig = null) => {
  const cfg = baseConfig || getProviderConfig();
  const img = cfg?.featureOverrides?.[featureId]?.image;
  if (!img || !img.enabled) return null;
  const next = { ...cfg };
  const effectiveStock = img.stockProvider || cfg.imageProvider;
  if (img.stockProvider) next.imageProvider = img.stockProvider;
  if (img.stockKey && effectiveStock === 'pexels') next.pexels = { ...cfg.pexels, key: img.stockKey };
  if (img.stockKey && effectiveStock === 'unsplash') next.unsplash = { ...cfg.unsplash, key: img.stockKey };
  next.imageGen = {
    ...cfg.imageGen,
    ...(img.genProvider ? { provider: img.genProvider } : {}),
    ...(img.genModel ? { model: img.genModel } : {}),
    ...(img.genKey ? { key: img.genKey } : {}),
  };
  return normalizeProviderConfig(next);
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
    pexels:     { ...DEFAULT_PROVIDER_CONFIG.pexels,     ...(config?.pexels || {}) },
    unsplash:   { ...DEFAULT_PROVIDER_CONFIG.unsplash,   ...(config?.unsplash || {}) },
    imageGen:   { ...DEFAULT_PROVIDER_CONFIG.imageGen,   ...(config?.imageGen || {}) },
    copyleaks:  { ...DEFAULT_PROVIDER_CONFIG.copyleaks,  ...(config?.copyleaks || {}) },
    toolLinks: getToolLinksConfig({ ...DEFAULT_PROVIDER_CONFIG, ...(config || {}) }),
    featureOverrides: normalizeFeatureOverrides(config?.featureOverrides),
    active: safeActive,
  };
  merged.claude.model = normalizeProviderModelName('claude', merged.claude.model || DEFAULT_PROVIDER_CONFIG.claude.model);
  merged.gemini.model = normalizeProviderModelName('gemini', merged.gemini.model || DEFAULT_PROVIDER_CONFIG.gemini.model);
  merged.perplexity.model = normalizeProviderModelName('perplexity', merged.perplexity.model || DEFAULT_PROVIDER_CONFIG.perplexity.model);
  merged.ollama.model = normalizeProviderModelName('ollama', merged.ollama.model || DEFAULT_PROVIDER_CONFIG.ollama.model);
  merged.custom.model = normalizeProviderModelName('custom', merged.custom.model || '');
  // ריפוי-עצמי: מודל של ספק ענן סגור שנתקע על משפחת מודלים מקומית (למשל llama3.2 שדלף מ-Ollama)
  // מוחזר לברירת המחדל של אותו ספק — אחרת הוא נשלח כמו-שהוא וקורס ב-404.
  const FOREIGN_CLOSED_MODEL_RE = /^(models\/)?(llama|codellama|mistral|mixtral|qwen|qwq|phi|deepseek|gemma|vicuna|tinyllama|dolphin|nous|openhermes|starling|falcon|wizardlm)/i;
  ['gemini', 'openai', 'claude'].forEach((providerId) => {
    const current = String(merged[providerId]?.model || '').trim();
    if (current && FOREIGN_CLOSED_MODEL_RE.test(current)) {
      merged[providerId].model = normalizeProviderModelName(providerId, DEFAULT_PROVIDER_CONFIG[providerId].model);
    }
  });
  merged.copyleaks = normalizeCopyleaksConfig(merged.copyleaks);
  merged.activeProviders = normalizeProviderIds(merged.activeProviders || [safeActive], safeActive);
  merged.multiModelEnabled = Boolean(merged.multiModelEnabled);
  merged.imageProvider = ['pexels', 'unsplash'].includes(merged.imageProvider) ? merged.imageProvider : 'pexels';
  merged.imageGen.provider = IMAGE_GEN_PROVIDER_IDS.includes(merged.imageGen.provider) ? merged.imageGen.provider : 'gemini';
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
  const previousConfig = providerConfigCache || getProviderConfig();
  const safeConfig = normalizeProviderConfig({
    ...(config || {}),
    copyleaks: resolvePersistedCopyleaksConfig(config?.copyleaks, previousConfig?.copyleaks),
  });
  providerConfigCache = safeConfig;
  localStorage.setItem('ai_provider_config', JSON.stringify(safeConfig));
  if (safeConfig.gemini?.key) localStorage.setItem('GEMINI_API_KEY', safeConfig.gemini.key);
  else localStorage.removeItem('GEMINI_API_KEY');

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wordai-provider-config-changed', {
      detail: { config: safeConfig },
    }));
  }

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

const getCopyleaksUpdatedAt = (value = {}) => Number(normalizeCopyleaksConfig(value).updatedAt || 0);

const hasCopyleaksSnapshot = (value = {}) => Object.keys(DEFAULT_COPYLEAKS_CONFIG).some((key) => hasOwnSetting(value, key));

const hasSameCopyleaksSettings = (left = {}, right = {}) => {
  const normalizedLeft = normalizeCopyleaksConfig(left);
  const normalizedRight = normalizeCopyleaksConfig(right);
  return Object.keys(DEFAULT_COPYLEAKS_CONFIG).every((key) => normalizedLeft[key] === normalizedRight[key]);
};

const withHydratedCopyleaksTimestamp = (value = {}) => {
  const normalized = normalizeCopyleaksConfig(value);
  if (getCopyleaksUpdatedAt(normalized)) return normalized;
  return {
    ...normalized,
    updatedAt: Date.now(),
  };
};

const resolvePersistedCopyleaksConfig = (nextValue = {}, previousValue = {}) => {
  const normalizedNext = normalizeCopyleaksConfig(nextValue);
  const normalizedPrevious = normalizeCopyleaksConfig(previousValue);
  const nextUpdatedAt = getCopyleaksUpdatedAt(normalizedNext);
  const previousUpdatedAt = getCopyleaksUpdatedAt(normalizedPrevious);

  if (!hasSameCopyleaksSettings(normalizedNext, normalizedPrevious)) {
    return {
      ...normalizedNext,
      updatedAt: Math.max(Date.now(), nextUpdatedAt, previousUpdatedAt + 1),
    };
  }

  return {
    ...normalizedNext,
    updatedAt: Math.max(nextUpdatedAt, previousUpdatedAt, 0),
  };
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

const mergeCopyleaksSettings = (diskValue = {}, localValue = {}) => {
  const normalizedDisk = normalizeCopyleaksConfig(diskValue);
  const normalizedLocal = normalizeCopyleaksConfig(localValue);
  const diskUpdatedAt = getCopyleaksUpdatedAt(normalizedDisk);
  const localUpdatedAt = getCopyleaksUpdatedAt(normalizedLocal);

  if (localUpdatedAt || diskUpdatedAt) {
    if (localUpdatedAt > diskUpdatedAt) return normalizedLocal;
    if (diskUpdatedAt > localUpdatedAt) return normalizedDisk;
    return normalizedLocal;
  }

  const localHasSnapshot = hasCopyleaksSnapshot(localValue);
  const diskHasSnapshot = hasCopyleaksSnapshot(diskValue);

  if (localHasSnapshot && !diskHasSnapshot) return withHydratedCopyleaksTimestamp(normalizedLocal);
  if (diskHasSnapshot && !localHasSnapshot) return withHydratedCopyleaksTimestamp(normalizedDisk);
  if (hasSameCopyleaksSettings(normalizedDisk, normalizedLocal)) return withHydratedCopyleaksTimestamp(normalizedLocal);

  return withHydratedCopyleaksTimestamp(normalizedLocal);
};

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
        copyleaks: mergeCopyleaksSettings(diskConfig.copyleaks, localRaw.copyleaks),
        toolLinks: mergeToolLinksSettings(diskConfig.toolLinks, localRaw.toolLinks),
      });

      saveProviderConfig(merged);
      providerConfigCache = merged;
      return merged;
    } catch {
      return getProviderConfig();
    } finally {
      providerConfigHydrationPromise = null;
    }
  })();

  return providerConfigHydrationPromise;
};

const getProviderLabelMap = (cfg) => ({
  gemini: 'Gemini',
  openai: 'GPT-4',
  claude: 'Claude',
  groq: 'Groq',
  scholar: 'Google Scholar',
  ollama: `Ollama (${cfg.ollama?.model || 'local'})`,
  perplexity: 'Perplexity',
  custom: cfg.custom.name || 'מנוע מותאם',
});

const NO_USABLE_PROVIDER_LABEL = 'אין ספק AI זמין';

const getResolvedActiveProviderId = (cfg = null) => {
  const safeCfg = cfg && typeof cfg === 'object' ? cfg : getProviderConfig();
  const selectedProviders = normalizeProviderIds([
    safeCfg.active,
    ...(Array.isArray(safeCfg.activeProviders) ? safeCfg.activeProviders : []),
  ], safeCfg.active);
  const usableSelectedProvider = selectedProviders.find((providerId) => isProviderConfiguredForUse(providerId, safeCfg));
  if (usableSelectedProvider) return usableSelectedProvider;
  return KNOWN_PROVIDER_IDS.find((providerId) => isProviderConfiguredForUse(providerId, safeCfg)) || '';
};

const getSelectedProviderIds = (cfg = null, forceSingle = false) => {
  const safeCfg = cfg && typeof cfg === 'object' ? cfg : getProviderConfig();
  const resolvedActiveProviderId = getResolvedActiveProviderId(safeCfg);
  const normalized = normalizeProviderIds(safeCfg.activeProviders || [safeCfg.active], safeCfg.active);
  const selectedProviders = [safeCfg.active, ...normalized.filter((providerId) => providerId !== safeCfg.active)];
  const usableSelectedProviders = selectedProviders.filter((providerId) => isProviderConfiguredForUse(providerId, safeCfg));

  if (forceSingle || !safeCfg.multiModelEnabled) {
    if (resolvedActiveProviderId) return [resolvedActiveProviderId];
    return [safeCfg.active];
  }

  if (usableSelectedProviders.length || resolvedActiveProviderId) {
    const primaryProviderId = resolvedActiveProviderId || usableSelectedProviders[0];
    return [primaryProviderId, ...usableSelectedProviders.filter((providerId) => providerId !== primaryProviderId)];
  }

  return selectedProviders;
};

export const getActiveProviderName = () => {
  const cfg = getProviderConfig();
  const names = getProviderLabelMap(cfg);
  const resolvedActiveProviderId = getResolvedActiveProviderId(cfg);
  const selectedProviders = getSelectedProviderIds(cfg)
    .filter((providerId) => isProviderConfiguredForUse(providerId, cfg));
  if (cfg.multiModelEnabled && selectedProviders.length > 1) {
    return selectedProviders.map((id) => names[id] || id).join(' + ');
  }
  if (resolvedActiveProviderId) return names[resolvedActiveProviderId] || resolvedActiveProviderId;
  return NO_USABLE_PROVIDER_LABEL;
};

export const getConfiguredProviderChoices = (cfg = null) => {
  const safeCfg = cfg && typeof cfg === 'object' ? cfg : getProviderConfig();
  const names = getProviderLabelMap(safeCfg);
  const resolvedActiveProviderId = getResolvedActiveProviderId(safeCfg);
  return getConfiguredProviderPool(safeCfg).map((providerId) => ({
    id: providerId,
    label: names[providerId] || providerId,
    isDefault: providerId === resolvedActiveProviderId,
  }));
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

const SOURCE_GROUNDING_FAILURE_TOKEN = 'NO_VERIFIED_SOURCES_FOUND';
const SOURCE_REQUEST_PATTERN = /(doi|scholar|google\s+scholar|סקולר|peer[-\s]?reviewed|bibliograph(?:y|ies)|academic\s+sources?|scholarly\s+sources?|fact[\s-]?check|בדוק\s+עובדות|בדיקת\s+עובדות|מקור(?:ות)?\s+אקדמ(?:י(?:ים)?)?|מקור(?:ות)?\s+ל(?:עבודת\s+)?סמינר|כתב(?:י)?\s*עת(?:\s+שפיט(?:ים)?)?|אתר(?:י)?\s+חדשות|חדשות\s+מאומתות|(?:כתבה|כתבות)\s+מאומתות|(?:ידיעה|ידיעות)\s+מאומתות)/i;
const ACADEMIC_SOURCE_DISCOVERY_PATTERN = /(?:(?:מאמרים?\s+אקדמ(?:י(?:ים)?)?)|(?:מחקרים?(?:\s+אקדמ(?:י(?:ים)?)?)?))\s+(?:על|בנושא|אודות)|(?:מקור(?:ות)?|ביבליוגרפיה)\s+(?:אקדמ(?:י(?:ים)?)?\s+)?(?:על|בנושא|אודות|ל(?:עבודת\s+)?סמינר)|(?:academic|scholarly)\s+sources?\s+(?:on|about|for)|(?:academic\s+articles?|research\s+papers?|peer[-\s]?reviewed\s+(?:articles?|papers?))\s+(?:on|about|for)|bibliograph(?:y|ies)\s+(?:on|about|for)|sources?\s+for\s+(?:a\s+)?seminar\s+paper/i;
const STRICT_VERIFIED_SOURCE_REQUEST_PATTERN = /(?:(?:כתבה|כתבות|כתבת\s+חדשות|ידיעה|ידיעות|מקור|מקורות|article|articles?|source|sources?)(?:\s+[^\s,.!?;:]+){0,3}\s+(?:מאומת(?:ת|ים|ות)?|verified)|(?:מאומת(?:ת|ים|ות)?|verified)(?:\s+[^\s,.!?;:]+){0,3}\s+(?:כתבה|כתבות|כתבת\s+חדשות|ידיעה|ידיעות|מקור|מקורות|article|articles?|source|sources?))/i;
const SOURCE_GROUNDING_PROVIDER_IDS = new Set(['perplexity']);
const INTERNET_BACKED_SOURCE_PROVIDER_IDS = new Set(['gemini', 'perplexity']);
// ספקים שיש להם כלי חיפוש-רשת נייטיבי (route 1): המודל מחפש ומצטט בעצמו בזמן הכתיבה.
// Claude — server-tool web_search; OpenAI — web_search דרך ה-Responses API.
const NATIVE_WEB_SEARCH_PROVIDER_IDS = new Set(['claude', 'openai']);
const SOURCE_GROUNDING_SKILL_IDS = new Set(['source-hunter', 'citation-weaver']);
const SOURCE_GROUNDING_URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>()]+/gi;
const SOURCE_GROUNDING_FAKE_URL_REGEX = /(?:https?:\/\/|www\.)example\.(?:com|org|net)[^\s<>()]*|(?:^|[\s([{"'])\/example[^\s<>()\]]*/gi;
const SOURCE_FOCUSED_WORKFLOW_AGENT_PATTERN = /(source|sources|citation|scholar|researcher|research|academic|literature|מקור|מקורות|ציטוט|ביבליוגרפ|חוקר|מחקר|אקדמי|אקדמית|מאמרים)/i;
const VERIFIED_SOURCE_RESULT_LIMIT = 5;
const VERIFIED_SOURCE_RESULT_HARD_LIMIT = 10;
const GROUNDED_WEB_RESULT_LIMIT = 5;
const GROUNDED_WEB_RESULT_HARD_LIMIT = 10;
const GENERIC_SOURCE_QUERY_PATTERN = /^(?:יש\s+(?:לזה\s+)?(?:מקור(?:ות)?|קישור(?:ים)?|לינק(?:ים)?|doi)\??|מקור(?:ות)?\??|sources?\??|citations?\??|references?\??|links?\??|לינק(?:ים)?\??|קישור(?:ים)?\??)$/i;
const NON_SOURCE_REQUEST_PATTERN = /(source\s+code|קוד\s+מקור|reference\s+letter|recommendation\s+letter|מכתב\s+המלצה|תקן(?:י)?\s+(?:את\s+)?(?:ה-)?url|fix\s+(?:the\s+)?url|replace\s+(?:the\s+)?url|update\s+(?:the\s+)?url)/i;
const SOURCE_FOLLOW_UP_PATTERN = /^(?:עוד|תן\s+עוד|תביא\s+עוד|עוד\s+\d+|עוד\s+שניים|עוד\s+שלושה|כאלה|כזה|similar\s+ones|same\s+kind|more|more\s+sources|another\s+two|add\s+more|תוסיף\s+עוד)/i;
const SOURCE_EXPLICIT_FOLLOW_UP_PATTERN = /^(?:עוד(?:\s+\d+|\s+שניים|\s+שלושה)?\s+(?:מקורות?|מאמר(?:ים)?|כתבה|כתבות|ידיעה|ידיעות|חדשות|קישורים?|לינקים?|references?|sources?|citations?|links?)|תן\s+עוד\s+(?:מקורות?|מאמר(?:ים)?|כתבה|כתבות|ידיעה|ידיעות|חדשות|קישורים?|לינקים?|references?|sources?|citations?|links?)|תביא\s+עוד\s+(?:מקורות?|מאמר(?:ים)?|כתבה|כתבות|ידיעה|ידיעות|חדשות|קישורים?|לינקים?|references?|sources?|citations?|links?)|more\s+(?:sources?|references?|citations?|links?|news\s+articles?)|another\s+\d*\s*(?:sources?|references?|citations?|links?|news\s+articles?)|add\s+more\s+(?:sources?|references?|citations?|links?|news\s+articles?))/i;
const SOURCE_RETRIEVAL_FOLLOW_ON_PATTERN = /(?:\b(?:and\s+then|then)\b|(?:ואז|ואחר\s+כך|אחר\s+כך|ולאחר\s+מכן|לאחר\s+מכן))\s*(?:סכם|תסכם|סיכום|תקציר|הסבר|תסביר|הסבר קצר|הסבר\s+קצר|ניתוח|נתח|תנתח|כתוב|תכתוב|נסח|תנסח|טיוטה|ערוך|תערוך|summari[sz]e|summary|brief\s+summary|explain|explanation|analy[sz]e|analysis|write|draft)/i;
const SOURCE_RETRIEVAL_DIRECT_CHAT_LIGHT_DELIVERABLE_TAIL_PATTERN = /\s+(?:and\s+|ו)(?:כתוב|תכתוב|נסח|תנסח|סכם|תסכם|הסבר|תסביר|נתח|תנתח|write|draft|summari[sz]e|explain|analy[sz]e)\s+(?:לי\s+|a\s+|an\s+)?(?:פסקה(?:\s+קצרה)?|תקציר(?:\s+קצר)?|סיכום(?:\s+קצר)?|הסבר(?:\s+קצר)?|ניתוח(?:\s+קצר)?|כמה\s+משפטים|paragraph|short\s+paragraph|brief\s+summary|short\s+summary|summary|brief\s+explanation|short\s+explanation|brief\s+analysis|short\s+analysis)\b/i;
const SOURCE_ASSIGNMENT_QUERY_WRAPPER_PATTERN = /(בקשת\s+המשתמש\s+המקורית|הוראות\s+המשתמש\s+המחייבות\s+למסמך|חוזה\s+דרישות|מטלת\s+גמר|מטלה\s+מסכמת|DELIVERABLE|HANDOFF|MISSING|DECISION|CHECKLIST|stage\s+\d+|שלב\s+\d+)/i;
const SOURCE_ASSIGNMENT_METADATA_LINE_PATTERN = /^\s*(?:הקורס|שם\s+הקורס|מרצה|מתרגל|משקל\s+בציון|תאריך\s+הגשה|מועד\s+הגשה|סמסטר|שנת\s+לימודים|נקודות\s+זכות|course|lecturer|instructor|teaching\s+assistant|due\s+date|submission\s+date|grade\s+weight)\s*[:：]/i;
const SOURCE_ASSIGNMENT_REQUIREMENT_SIGNAL_PATTERN = /(הוראות\s+המשתמש\s+המחייבות|חוזה\s+דרישות|מטלת\s+גמר|מטלה\s+מסכמת|DELIVERABLE|HANDOFF|MISSING|DECISION|CHECKLIST|rubric|requirements?|יש\s+להגיש|עליכם|עליך|העבודה\s+תכלול|נדרש(?:ת|ים)?|עמודים|מילים|ציון|ביבליוגרפיה|APA)/i;
const SOURCE_UNCHOSEN_TOPIC_LIST_PATTERN = /(אחד\s+מהנושאים\s+הבאים|אחת\s+מהאפשרויות\s+הבאות|choose\s+one\s+of\s+the\s+following|one\s+of\s+the\s+following\s+topics)/i;
const SOURCE_RESEARCH_SUBJECT_MARKER_PATTERNS = [
  /(?:הנושא\s+שנבחר|הנושא\s+הוא|בחרתי\s+בנושא|בחרתי\s+את\s+הנושא|שאלת\s+המחקר|מחקר\s+על|המחקר\s+עוסק\s+ב|עוסק(?:ת|ים)?\s+ב|עבודה\s+על)\s*[:：\-–]?\s*([^\n.;]+)/i,
  /(?:מקורות|כתבות|מאמרים|חומרים|דוחות|sources?|articles?|reports?)\s+(?:על|בנושא|אודות|about|on)\s+([^\n.;]+)/i,
  // נושא מפורש בשורה ייעודית (מטלות אקדמיות): "נושא: ...", "נושא העבודה: ...", "בנושא: ...", "topic: ..."
  /(?:^|\n)\s*(?:נושא\s+העבודה|נושא\s+המסמך|נושא\s+המטלה|נושא|בנושא|הנדון|topic|subject)\s*[:：\-–]\s*([^\n.;]+)/i,
  // כותרת משימה נפוצה: "סיכום מקרה: ...", "ניתוח מקרה: ...", "עבודת חקר: ..."
  /(?:^|\n)\s*(?:סיכום\s+מקרה|ניתוח\s+מקרה|חקר\s+מקרה|עבודת\s+חקר|case\s+study)\s*[:：\-–]\s*([^\n.;]+)/i,
];
const SOURCE_DISCOVERY_ACTION_PATTERN = /(חפש|חיפוש|מצא|תן(?:י)?|תביא|הבא|שלח|צריך|צריכה|צריכים|מבקש|מבקשת|אסוף|אתר|תאתר|הוסף|צרף|שלב|show|give|need|find|send|collect|locate|provide|include|attach|add)/i;
const SOURCE_DISCOVERY_TARGET_PATTERN = /(לינק(?:ים)?|links?|קישור(?:ים)?|urls?|מאמר(?:ים)?(?:\s+אקדמ(?:י(?:ים)?)?)?|מאמר|מאמרים|מחקר(?:ים)?|כתבה|כתבות|ידיעה|ידיעות|חדשות|אתר(?:י)?\s+חדשות|papers?|research\s+papers?|academic\s+articles?|academic\s+sources?|scholarly\s+sources?|peer[-\s]?reviewed|bibliograph(?:y|ies)|sources?|references?|citations?|journal(?:s)?(?:\s+articles?)?|מקור(?:ות)?)/i;
const DIRECT_SOURCE_DISCOVERY_PATTERN = /(יש\s+(?:לזה\s+)?(?:מקור(?:ות)?|doi|לינק(?:ים)?|link|קישור(?:ים)?|url)|מצא\s+(?:מקור(?:ות)?|מאמר|מאמרים|כתבה|כתבות|ידיעה|ידיעות|חדשות)|תן(?:\s+לי)?\s+(?:\d+|שניים|שתי|שלושה|שלוש|כמה)?\s*(?:מקור(?:ות)?|מאמר|מאמרים|כתבה|כתבות|ידיעה|ידיעות|חדשות|קישור(?:ים)?|לינק(?:ים)?|links?)|need\s+(?:sources?|references?|citations?|links?|news\s+articles?)|find\s+(?:sources?|references?|citations?|links?|news\s+articles?))/i;
const NEWS_ARTICLE_DISCOVERY_PATTERN = /(?:(?:^|\s)(?:\d+|שניים|שתי|שלושה|שלוש|כמה)\s+(?:כתבה|כתבות|מאמר|מאמרים|ידיעה|ידיעות|חדשות)\b|(?:כתבה|כתבות|מאמר|מאמרים|ידיעה|ידיעות|חדשות)\s+(?:מ)?אתר(?:י)?\s+חדשות|(?:אתר(?:י)?\s+חדשות|עיתונאי(?:ת)?|חדשות)\s+.*(?:אירוע|אחרון|אחרונה|לאחרונה|מהשבוע|השבוע|הימים\s+האחרונים)|(?:news\s+articles?|articles?\s+from\s+news\s+sites?)\s+.*(?:latest|recent|this\s+week|event))/i;
const SOURCE_TRANSFORM_REQUEST_PATTERN = /(סדר|ארגן|עצב|format|reformat|תקן|fix|שכתב|rewrite|שמור|keep|preserve|המר|convert|עדכן|update|ערוך|edit).*(?:ביבליוגרפ|reference(?:\s+list)?|citation(?:s)?|ציטוט(?:ים)?|references?)/i;
const FACT_CHECK_REQUEST_PATTERN = /(fact[\s-]?check|בדוק\s+עובדות|בדיקת\s+עובדות)/i;
const SOURCE_REQUEST_WITH_DELIVERABLE_PATTERN = /((כתוב|נסח|draft|write|compose|generate|צור|בנה|הכן|prepare|summari[sz]e|סכם|analy[sz]e|נתח|rewrite|שכתב|ערוך|edit).*(סקיר|literature|review|פסקה|paragraph|section|פרק|essay|paper|עבודה|מאמר|מסמך|outline|מבנה|טיוטה|draft|מבוא|introduction|abstract|סיכום|מסקנה))|((סקיר(?:ת)?\s+ספרות|literature\s+review|essay|paper|עבודה|מאמר|מסמך).*(?:מקור|citation|reference|doi|scholar))/i;
const SOURCE_CONCEPT_EXPLANATION_PATTERN = /^(?:מה\s+זה|מהו|מהי|איך\s+(?:עובד|פועל)|הסבר(?:\s+לי)?|תסביר(?:\s+לי)?|what\s+is|how\s+does)(?:\s|$).*(?:doi|google\s+scholar|scholar|peer[-\s]?reviewed|citation|reference|כתב(?:י)?\s*עת)/i;
const EXPLICIT_WEB_LOOKUP_PATTERN = /(בדוק\s+(?:בגוגל|באינטרנט|ברשת)|תבדוק\s+(?:בגוגל|באינטרנט|ברשת)|חפש\s+(?:בגוגל|באינטרנט|ברשת)|תחפש\s+(?:בגוגל|באינטרנט|ברשת)|תן\s+נתון\s+עדכני|תביא\s+נתון\s+עדכני|google\s+it|search\s+the\s+web|look\s+it\s+up\s+online|check\s+online|browse\s+for)/i;
const EXPLICIT_GROUNDED_WEB_RESULTS_PATTERN = /(?:(?:חפש|תחפש)\s+(?:בגוגל|באינטרנט|ברשת)|google\s+it|search\s+the\s+web|browse\s+for|תוצאות\s+(?:web|ווב|חיפוש|גוגל|אינטרנט|ברשת)|web\s+results?|search\s+results?|list\s+(?:sources?|results?|links?)|רשימת\s+(?:מקורות|תוצאות|קישורים|לינקים)|(?:show|give|provide|find|list)\s+(?:me\s+)?(?:sources?|results?|links?)|(?:תן|תני|תביא|הבא|שלח|הצג|מצא|אסוף)\s+(?:לי\s+)?(?:\d+|כמה|שני|שתי|שלושה|שלוש)?\s*(?:תוצאות|מקורות|קישורים|לינקים))/i;
const CURRENT_INFO_TOPIC_PATTERN = /(שער(?:\s+ה)?(?:דולר|אירו|מטבע)|דולר|אירו|exchange\s+rate|stock\s+price|market\s+price|bitcoin|btc|ethereum|eth|crypto|קריפטו|מזג(?:\s+האוויר)?|weather|temperature|טמפרטורה|כותרות\s+חדשות|headlines?|breaking\s+news|news\s+today|תוצאות?\s+(?:משחק|כדורגל|ספורט)|משחק\s+כדורגל|football\s+(?:score|result|match)|soccer\s+(?:score|result|match)|match\s+(?:score|result))/i;
const CURRENT_INFO_TIME_SIGNAL_PATTERN = /(היום|כרגע|עכשיו|מעודכן(?:ת)?|בזמן\s+אמת|real[-\s]?time|today|current|currently|latest|live|right\s+now|as\s+of\s+today|up[-\s]?to[-\s]?date)/i;
const CURRENT_INFO_REQUEST_PATTERN = /(מה(?:ו|י)?\s+(?:שער|מחיר|שווי|מזג(?:\s+האוויר)?|הטמפרטורה|תוצאות?)|כמה\s+(?:עולה|שווה|נסחר(?:ת)?|הטמפרטורה)|תוצאות?\s+(?:משחק|כדורגל|ספורט)|what(?:'s|\s+is)?\s+(?:the\s+)?(?:exchange\s+rate|stock\s+price|market\s+price|weather|temperature|score|result)|how\s+much\s+(?:is|does).*(?:bitcoin|btc|ethereum|eth|the\s+dollar|the\s+euro))/i;
const DOCUMENT_REVIEW_OR_EDIT_REQUEST_PATTERN = /(?:(?:בדוק|תבדוק|סקור|תסקור|עבור|תעבור|בחן|תבחן|בדיקה|ביקורת|review|check|inspect|evaluate|assess|proofread)(?:\s+[^\n]{0,60})?(?:המסמך|מסמך|העבודה|עבודה|הטיוטה|טיוטה|הטקסט|טקסט|document|draft|paper|essay|text|הערות(?:\s+המרצה|\s+מרצה)?|ביקורת(?:\s+המרצה|\s+מרצה)?|פידבק|feedback|תיקונים?(?:\s+המרצה|\s+של\s+המרצה)?|הנחיות(?:\s+המרצה|\s+של\s+המרצה)?|מרצה(?:\s+אקדמי)?)|(?:תקן|תתקן|שכתב|ערוך|לטש|שפר|תשפר|שפרי|תשפרי|עדכן|תעדכן|יישם|תיישם|edit|rewrite|polish|improve|apply)(?:\s+[^\n]{0,60})?(?:המסמך|מסמך|העבודה|עבודה|הטיוטה|טיוטה|הטקסט|טקסט|document|draft|paper|essay|text|הערות(?:\s+המרצה|\s+מרצה)?|ביקורת(?:\s+המרצה|\s+מרצה)?|פידבק|feedback|תיקונים?(?:\s+המרצה|\s+של\s+המרצה)?|הנחיות(?:\s+המרצה|\s+של\s+המרצה)?|מרצה(?:\s+אקדמי)?))/i;
const DOCUMENT_REVIEW_REFERENCE_PATTERN = /(?:המסמך|מסמך|העבודה|עבודה|הטיוטה|טיוטה|הטקסט|טקסט|document|draft|paper|essay|text|הערות(?:\s+המרצה|\s+מרצה)?|ביקורת(?:\s+המרצה|\s+מרצה)?|פידבק|feedback|תיקונים?(?:\s+המרצה|\s+של\s+המרצה)?|הנחיות(?:\s+המרצה|\s+של\s+המרצה)?|מרצה(?:\s+אקדמי)?)/i;
const DOCUMENT_REVIEW_OR_EDIT_ACTION_PATTERN = /(בדוק|תבדוק|סקור|תסקור|עבור|תעבור|בחן|תבחן|בדיקה|ביקורת|review|check|inspect|evaluate|assess|proofread|תקן|תתקן|שכתב|ערוך|לטש|edit|rewrite|polish)/i;
const HOLE_FILL_DIRECT_CHAT_AGENT_PATTERN = /(?:holefill|hole_fill|hole\s+fill|מילוי\s+חורים)/i;
const NON_RESEARCH_DIRECT_CHAT_AGENT_IDS = new Set(['lecturer', 'reviewFix', 'fix', 'humanize', 'academic', 'organize', 'textToTable', 'summary', 'continue']);
const NON_RESEARCH_DIRECT_CHAT_AGENT_PATTERN = /(?:lecturer|reviewfix|review_fix|proofreader|humanizer|academic(?:\s+writer)?|organizer|table(?:\s+extractor)?|summary|continue|בדיקת\s+מרצה|בדיקה\s*\+\s*תיקון|תיקון|האנשה|אקדמי|ארגון|לטבלה|סיכום|המשך)/i;
const HEBREW_TEXT_PATTERN = /[\u0590-\u05FF]/;
const DOI_PATTERN = /\b10\.\d{4,9}\/[\-._;()/:A-Z0-9]+\b/i;
const RECENT_VERIFIED_SOURCE_FOLLOW_UP_WINDOW_MS = 30 * 60 * 1000;
const RECENT_VERIFIED_SOURCE_ALLOWED_URL_LIMIT = 40;
const VERIFIED_SOURCE_REPLY_PATTERN = /(NO_VERIFIED_SOURCES_FOUND|מקורות(?:\s+אקדמיים)?\s+מאומתים בלבד|verified\s+sources?)/i;

const isExplicitSourceRequest = (value = '') => {
  const text = String(value || '').trim();
  if (!text || NON_SOURCE_REQUEST_PATTERN.test(text)) return false;
  if (SOURCE_TRANSFORM_REQUEST_PATTERN.test(text)) return false;
  if (SOURCE_CONCEPT_EXPLANATION_PATTERN.test(text)) return false;
  return GENERIC_SOURCE_QUERY_PATTERN.test(text)
    || ACADEMIC_SOURCE_DISCOVERY_PATTERN.test(text)
    || NEWS_ARTICLE_DISCOVERY_PATTERN.test(text)
    || DIRECT_SOURCE_DISCOVERY_PATTERN.test(text)
    || SOURCE_REQUEST_PATTERN.test(text)
    || (SOURCE_DISCOVERY_ACTION_PATTERN.test(text) && SOURCE_DISCOVERY_TARGET_PATTERN.test(text));
};

const needsInternetBackedCurrentInfo = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return false;
  return EXPLICIT_WEB_LOOKUP_PATTERN.test(text)
    || (CURRENT_INFO_TOPIC_PATTERN.test(text) && (CURRENT_INFO_TIME_SIGNAL_PATTERN.test(text) || CURRENT_INFO_REQUEST_PATTERN.test(text)));
};

const extractDirectChatActionInstruction = (value = '') => {
  const text = String(value || '').replace(/\r/g, '\n').trim();
  if (!text) return '';
  const matches = Array.from(text.matchAll(new RegExp(DOCUMENT_REVIEW_OR_EDIT_ACTION_PATTERN.source, 'giu')));
  if (!matches.length) return text.slice(-900).trim();
  const lastMatch = matches[matches.length - 1];
  const startIndex = Math.max(0, Number(lastMatch.index || 0) - 80);
  return text.slice(startIndex).slice(0, 1200).trim();
};

const extractDirectChatRoutingInstruction = (value = '') => {
  const text = String(value || '').replace(/\r/g, '\n').trim();
  if (!text) return '';
  const blockQuoteMatch = text.match(/(?:\n\s*\n|:\s*(?:\n\s*)?)(?=["'“”])/u);
  const prefixOnly = blockQuoteMatch ? text.slice(0, blockQuoteMatch.index).trim() : text;
  const inlineQuotesStripped = prefixOnly
    .replace(/["“'][^"'“”\n]{0,240}["”']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return inlineQuotesStripped || extractDirectChatActionInstruction(prefixOnly || text);
};

const isDocumentReviewOrEditRequest = ({ userPrompt = '', extraSystemPrompt = '' } = {}) => {
  const combined = [userPrompt, extraSystemPrompt]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n');
  if (!combined) return false;
  const actionInstruction = extractDirectChatActionInstruction(combined);
  if (!DOCUMENT_REVIEW_OR_EDIT_ACTION_PATTERN.test(actionInstruction)) return false;
  if (!DOCUMENT_REVIEW_OR_EDIT_REQUEST_PATTERN.test(actionInstruction) && !DOCUMENT_REVIEW_REFERENCE_PATTERN.test(actionInstruction)) return false;
  if (isExplicitSourceRequest(actionInstruction)) return false;
  if (FACT_CHECK_REQUEST_PATTERN.test(actionInstruction)) return false;
  if (EXPLICIT_GROUNDED_WEB_RESULTS_PATTERN.test(actionInstruction)) return false;
  if (needsInternetBackedCurrentInfo(actionInstruction)) return false;
  return true;
};

const isNonResearchDirectChatAgent = ({ agentId = '', agentLabel = '', agentName = '' } = {}) => {
  const normalizedAgentId = String(agentId || '').trim();
  if (NON_RESEARCH_DIRECT_CHAT_AGENT_IDS.has(normalizedAgentId)) return true;
  return NON_RESEARCH_DIRECT_CHAT_AGENT_PATTERN.test([agentId, agentLabel, agentName].filter(Boolean).join(' '));
};

const isLecturerDirectChatAgent = ({ agentId = '', agentLabel = '', agentName = '' } = {}) => {
  const combined = [agentId, agentLabel, agentName].filter(Boolean).join(' ');
  return String(agentId || '').trim() === 'lecturer' || /(?:lecturer|בדיקת\s+מרצה|מרצה)/i.test(combined);
};

const isHoleFillDirectChatAgent = ({ agentId = '', agentLabel = '', agentName = '' } = {}) => HOLE_FILL_DIRECT_CHAT_AGENT_PATTERN.test([agentId, agentLabel, agentName].filter(Boolean).join(' '));

const hasSourceRetrievalFollowOnWork = (value = '') => SOURCE_RETRIEVAL_FOLLOW_ON_PATTERN.test(String(value || '').trim());

const shouldUseStrictSourceGrounding = ({ userPrompt = '', documentContext = '', extraSystemPrompt = '', skillId = '' } = {}) => {
  if (SOURCE_GROUNDING_SKILL_IDS.has(String(skillId || '').trim())) return true;
  const combined = [userPrompt, extraSystemPrompt]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n');
  if (!combined) return false;
  if (STRICT_VERIFIED_SOURCE_REQUEST_PATTERN.test(combined)) return true;
  if (ACADEMIC_SOURCE_SIGNAL_PATTERN.test(combined) && isExplicitSourceRequest(combined)) return true;
  if (!(SOURCE_EXPLICIT_FOLLOW_UP_PATTERN.test(String(userPrompt || '').trim()) || SOURCE_FOLLOW_UP_PATTERN.test(String(userPrompt || '').trim()))) return false;
  try {
    const workspaceId = String(getWorkspaceAutomation().activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
    return Boolean(getLastVerifiedSourceQuery({ workspaceId }) && hasRecentVerifiedSourceFollowUpContext({ workspaceId }));
  } catch {
    return false;
  }
};

const shouldUseInternetBackedSourceWork = ({ userPrompt = '', extraSystemPrompt = '' } = {}) => {
  const combined = [userPrompt, extraSystemPrompt]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n');
  if (!combined) return false;
  if (NON_SOURCE_REQUEST_PATTERN.test(combined)) return false;
  if (SOURCE_TRANSFORM_REQUEST_PATTERN.test(combined)) return false;
  return FACT_CHECK_REQUEST_PATTERN.test(combined)
    || needsInternetBackedCurrentInfo(combined)
    || hasSourceRetrievalFollowOnWork(combined)
    || SOURCE_REQUEST_WITH_DELIVERABLE_PATTERN.test(combined);
};

const isExplicitGroundedWebResultsRequest = ({ userPrompt = '', extraSystemPrompt = '', skillId = '' } = {}) => {
  if (SOURCE_GROUNDING_SKILL_IDS.has(String(skillId || '').trim())) return false;
  const combined = [userPrompt, extraSystemPrompt]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n');
  if (!combined) return false;
  if (NON_SOURCE_REQUEST_PATTERN.test(combined)) return false;
  if (SOURCE_TRANSFORM_REQUEST_PATTERN.test(combined)) return false;
  if (SOURCE_CONCEPT_EXPLANATION_PATTERN.test(combined)) return false;
  if (STRICT_VERIFIED_SOURCE_REQUEST_PATTERN.test(combined)) return false;
  if (ACADEMIC_SOURCE_SIGNAL_PATTERN.test(combined) && isExplicitSourceRequest(combined)) return false;
  return isExplicitSourceRequest(combined)
    || EXPLICIT_GROUNDED_WEB_RESULTS_PATTERN.test(combined);
};

const shouldUseGroundedWebResults = (params = {}) => {
  return isExplicitGroundedWebResultsRequest(params);
};

const isGroundedWebResultsOnlyRequest = ({ userPrompt = '', extraSystemPrompt = '' } = {}) => {
  const combined = [userPrompt, extraSystemPrompt]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n');
  if (!combined) return false;
  if (!isExplicitGroundedWebResultsRequest({ userPrompt, extraSystemPrompt })) return false;
  if (SOURCE_REQUEST_WITH_DELIVERABLE_PATTERN.test(combined)) return false;
  if (hasSourceRetrievalFollowOnWork(combined)) return false;
  return true;
};

const isSourceFocusedWorkflowAgent = ({ agentId = '', agentLabel = '', agentName = '', skillId = '' } = {}) => {
  const normalizedSkillId = String(skillId || '').trim();
  if (SOURCE_GROUNDING_SKILL_IDS.has(normalizedSkillId)) return true;
  return SOURCE_FOCUSED_WORKFLOW_AGENT_PATTERN.test([agentId, agentLabel, agentName, normalizedSkillId].filter(Boolean).join(' '));
};

const isSourceOnlyGroundingRequest = ({ userPrompt = '', documentContext = '', extraSystemPrompt = '', skillId = '', allowFollowOnWork = false } = {}) => {
  const normalizedPrompt = String(userPrompt || '').trim();
  const combined = [normalizedPrompt, extraSystemPrompt]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n');

  if (!combined) return false;

  const isSourceFollowUp = SOURCE_EXPLICIT_FOLLOW_UP_PATTERN.test(normalizedPrompt) || SOURCE_FOLLOW_UP_PATTERN.test(normalizedPrompt);
  if (!isExplicitSourceRequest(combined) && !isSourceFollowUp) return false;
  if (FACT_CHECK_REQUEST_PATTERN.test(combined)) return false;
  if (!allowFollowOnWork && SOURCE_REQUEST_WITH_DELIVERABLE_PATTERN.test(combined)) return false;
  if (!allowFollowOnWork && hasSourceRetrievalFollowOnWork(combined)) return false;
  return true;
};

const isSourceGroundingProvider = (providerId = '') => SOURCE_GROUNDING_PROVIDER_IDS.has(String(providerId || '').trim());
const supportsInternetBackedSourceRetrieval = (providerId = '') => INTERNET_BACKED_SOURCE_PROVIDER_IDS.has(String(providerId || '').trim());

const extractUrlSetFromText = (value = '') => {
  const matches = String(value || '').match(SOURCE_GROUNDING_URL_REGEX) || [];
  return new Set(matches.map((url) => String(url || '').trim()).filter(Boolean));
};

const buildSourceGroundingPrompt = ({ enforce = false, providerSupportsGrounding = false } = {}) => {
  if (!enforce) return '';
  if (providerSupportsGrounding) {
    return [
      'בקשות למקורות, כתבות, DOI או URLs חייבות להיות מקורקעות בתוצאות אמיתיות בלבד.',
      'אסור לבנות URL ידנית, אסור להשלים slug, ואסור להמציא כותרות או שמות פרסום שנשמעים סבירים.',
      `אם אין לפחות מקור אמין אחד שנשלף בפועל, החזר בדיוק ${SOURCE_GROUNDING_FAILURE_TOKEN}.`,
      'אם אתה כן מחזיר מקור, השתמש רק ב-URL מלא כפי שהתקבל במפורש מתוצאות האחזור.',
    ].join('\n');
  }

  return [
    'הבקשה הנוכחית דורשת מקורות או URLs, אבל למסלול הפעיל אין אחזור מאומת.',
    'אסור לך להמציא URL, DOI, כותרת מאמר, כתבה, שם כתב עת או גוף מפרסם.',
    `אם אין מקור מאומת בתוך ההקשר שסופק לך, החזר בדיוק ${SOURCE_GROUNDING_FAILURE_TOKEN}.`,
    'מותר להציע מילות חיפוש או לתאר מה חסר, אבל בלי לייצר קישור או מקור בדוי.',
  ].join('\n');
};

const buildVerifiedSourceFollowOnGroundingPrompt = (verifiedSourceText = '') => {
  const normalizedSourceText = String(verifiedSourceText || '').trim();
  if (!normalizedSourceText) return '';

  return [
    'לפני המענה בוצע אחזור של מקורות מאומתים עבור הבקשה.',
    'הסתמך רק על המקורות המאומתים שמופיעים להלן כדי לבצע את משימת ההמשך הקלה שהמשתמש ביקש.',
    'אסור להוסיף או להמציא URL, DOI, מקור, כותרת, גוף מפרסם או כתבה שלא מופיעים במפורש ברשימה הזו.',
    'אם המקורות המאומתים לא מספיקים כדי להשלים את משימת ההמשך, אמור זאת במפורש.',
    normalizedSourceText,
  ].join('\n');
};

// מסלול "אחזור מנותק מכתיבה" (route 2): כשהאחזור לא מילא את כל מכסת המקורות,
// לא מחזירים הודעת שגיאה כמסמך. מזריקים את מה שכן נמצא (אם בכלל) כ-context,
// והכותב ממשיך לכתוב את המסמך המלא, ומסמן [דרוש מקור] במקום שחסר מקור מאומת.
const buildDegradedSourceGroundingPrompt = (verifiedSourceText = '') => {
  const normalizedSourceText = stripSourceGroundingFailureToken(String(verifiedSourceText || '')).trim();
  const hasPartialSources = Boolean(normalizedSourceText);
  return [
    'בוצע ניסיון אחזור של מקורות מאומתים, אך לא נמצאה מכסת מקורות מלאה לבקשה.',
    hasPartialSources
      ? `אלה המקורות המאומתים שכן נמצאו — מותר להסתמך רק עליהם כמקור חיצוני:\n${normalizedSourceText}`
      : 'לא נמצאו כרגע מקורות מאומתים חיצוניים לבקשה הזו.',
    'כתוב את המסמך המלא לפי הוראות המטלה והחומרים המצורפים. אל תחזיר הודעת שגיאה, אל תעצור ואל תבקש מקורות מהמשתמש.',
    'במקום שבו נדרשת טענה עובדתית או ציטוט שאין לו מקור מאומת זמין — כתוב את הטקסט וסמן באותו מקום בדיוק את הסימון: [דרוש מקור]. אל תמציא URL, DOI, שם מאמר, מחבר, שנה או ציטוט.',
    'הרשימה הביבליוגרפית תכלול אך ורק מקורות מאומתים שסופקו לעיל. אל תמלא אותה במקורות מומצאים; אם חסרים מקורות, ציין זאת בקצרה בסוף הרשימה.',
  ].filter(Boolean).join('\n');
};

// מסיר URLs ב-prose שלא הופיעו באחזור המאומת, בלי לחסום את שאר הטקסט.
// קישורי markdown: שומר את התווית, מסיר רק את היעד הלא-מאומת.
const stripDisallowedInlineUrls = (text = '', allowedUrlSet = new Set()) => {
  let result = String(text || '')
    .replace(/\[([^\]]+)\]\(\s*((?:https?:\/\/|www\.)[^\s)]+)\s*\)/gi, (match, label, url) => (
      hasVerifiedSourceAllowedUrl(allowedUrlSet, url) ? match : label
    ))
    .replace(SOURCE_GROUNDING_URL_REGEX, (url) => (
      hasVerifiedSourceAllowedUrl(allowedUrlSet, url) ? url : ''
    ));
  // ניקוי שאריות: סוגריים ריקים, רווחים כפולים, רווח לפני פיסוק.
  result = result
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,;:])/g, '$1');
  return result.trim();
};

const sanitizeSourceGroundingResponse = (text = '', { enforce = false, providerSupportsGrounding = false, allowedUrls = new Set() } = {}) => {
  const normalizedText = String(text || '').trim();
  if (!normalizedText || !enforce) return normalizedText;
  const fakeUrls = normalizedText.match(SOURCE_GROUNDING_FAKE_URL_REGEX) || [];
  if (fakeUrls.length) {
    return `${SOURCE_GROUNDING_FAILURE_TOKEN}\n\nנחסם פלט שכלל קישורי דוגמה או placeholder, כדי לא להציג מקורות מומצאים.`;
  }
  const allowedUrlSet = buildVerifiedSourceAllowedUrlSet(allowedUrls);
  const responseUrls = normalizedText.match(SOURCE_GROUNDING_URL_REGEX) || [];
  if (!responseUrls.length) return normalizedText;
  const disallowedUrls = responseUrls.filter((url) => !hasVerifiedSourceAllowedUrl(allowedUrlSet, url));
  if (!disallowedUrls.length) return normalizedText;
  if (providerSupportsGrounding) {
    // ספק grounding: רוב הקישורים אמיתיים מ-metadata. אל תחסום את כל הפלט —
    // נקה רק את ה-URLs בגוף הטקסט שלא הופיעו באחזור המאומת (סגירת דליפת inline).
    if (!allowedUrlSet.size) return normalizedText;
    return stripDisallowedInlineUrls(normalizedText, allowedUrlSet);
  }
  // ספק ללא grounding: כל URL שלא ברשימה = מומצא → חסום את כל הפלט.
  return `${SOURCE_GROUNDING_FAILURE_TOKEN}\n\nנחסם פלט שכלל URLs שלא הופיעו באחזור המאומת, כדי לא להציג מקורות מומצאים.`;
};

const stripHtmlTags = (value = '') => String(value || '').replace(/<[^>]+>/g, ' ');

const normalizeSourceSearchText = (value = '') => stripHtmlTags(value)
  .replace(/\s+/g, ' ')
  .trim();

const isLikelyAssignmentInstructionQuery = (value = '') => {
  const rawText = String(value || '').trim();
  const text = normalizeSourceSearchText(rawText);
  if (!text) return false;
  if (rawText.split(/\r?\n/).some((line) => SOURCE_ASSIGNMENT_METADATA_LINE_PATTERN.test(line))) return true;
  if (/(?:הקורס|שם\s+הקורס|מרצה|מתרגל|משקל\s+בציון|תאריך\s+הגשה|מועד\s+הגשה)\s*[:：]/i.test(text)) return true;
  if (SOURCE_ASSIGNMENT_QUERY_WRAPPER_PATTERN.test(text)) return true;
  if (SOURCE_UNCHOSEN_TOPIC_LIST_PATTERN.test(text) && !/(?:הנושא\s+שנבחר|בחרתי\s+בנושא|בחרתי\s+את\s+הנושא|שאלת\s+המחקר)/i.test(text)) return true;
  if (SOURCE_ASSIGNMENT_REQUIREMENT_SIGNAL_PATTERN.test(text) && text.length > 160) return true;
  if (/^(?:שיטות\s+מחקר|מבוא\s+ל|סמינר|מטלת\s+גמר)\b/i.test(text) && text.length < 90) return true;
  return false;
};

const cleanResearchSubjectQuery = (value = '') => {
  const text = normalizeSourceSearchText(value)
    .replace(/^[\s:'"׳״\-–]+|[\s:'"׳״\-–]+$/g, '')
    .replace(/\s+(?:יש\s+להגיש|עליכם|עליך|הוראות|דרישות|מטלת|DELIVERABLE|HANDOFF|MISSING|CHECKLIST|הקורס|מרצה|תאריך\s+הגשה|מספר\s+מקורות|מקורות\s+נדרשים).*$/i, '')
    .trim();
  if (!text || GENERIC_SOURCE_QUERY_PATTERN.test(text) || isLikelyAssignmentInstructionQuery(text)) return '';
  return text.slice(0, 220).trim();
};

const extractExplicitResearchSubjectQuery = (value = '') => {
  const rawText = String(value || '').replace(/\r/g, '\n');
  if (!rawText.trim()) return '';
  const lines = rawText.split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !SOURCE_ASSIGNMENT_METADATA_LINE_PATTERN.test(line));
  const text = lines.join('\n');
  for (const pattern of SOURCE_RESEARCH_SUBJECT_MARKER_PATTERNS) {
    const match = text.match(pattern);
    const candidate = cleanResearchSubjectQuery(match?.[1] || '');
    if (candidate && !/אחד\s+מהנושאים\s+הבאים/i.test(candidate)) return candidate;
  }
  return '';
};

const normalizeSourceQueryOverride = (value = '') => {
  const explicitSubject = extractExplicitResearchSubjectQuery(value);
  if (explicitSubject) return explicitSubject;
  const text = cleanResearchSubjectQuery(value);
  if (!text || isLikelyAssignmentInstructionQuery(text)) return '';
  return text.slice(0, 220).trim();
};

const buildMissingResearchTopicMessage = () => [
  SOURCE_GROUNDING_FAILURE_TOKEN,
  'MISSING researchTopic: אי אפשר לאסוף 10 כתבות בלי נושא/שאלת מחקר נבחרת.',
  'בחר נושא, מקרה, קבוצה או שאלת מחקר ספציפיים, ואז אפשר יהיה לאסוף מקורות בלי להשתמש בהוראות המטלה כשאילתת חיפוש.',
].join('\n\n');

const stripSourceRetrievalFollowOnTail = (value = '', { includeDirectChatLightDeliverable = false } = {}) => {
  const normalizedValue = normalizeSourceSearchText(value);
  const followOnPatterns = [SOURCE_RETRIEVAL_FOLLOW_ON_PATTERN];
  if (includeDirectChatLightDeliverable) {
    followOnPatterns.push(SOURCE_RETRIEVAL_DIRECT_CHAT_LIGHT_DELIVERABLE_TAIL_PATTERN);
  }

  let followOnStartIndex = -1;
  for (const pattern of followOnPatterns) {
    const match = normalizedValue.match(pattern);
    if (!match || typeof match.index !== 'number') continue;
    if (followOnStartIndex === -1 || match.index < followOnStartIndex) {
      followOnStartIndex = match.index;
    }
  }

  if (followOnStartIndex === -1) return normalizedValue;
  return normalizeSourceSearchText(normalizedValue.slice(0, followOnStartIndex));
};

// fallback לחילוץ נושא מחקר כשהטקסט הוא מטלה ואין מסמן מפורש ("נושא:", "סיכום מקרה:" וכו').
// סורק שורות ובוחר את הראשונה שנראית ככותרת/נושא: קצרה, לא מטא-דאטה, לא הוראת-מטלה.
const deriveFallbackResearchTopic = (value = '') => {
  const lines = String(value || '').replace(/\r/g, '\n').split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !SOURCE_ASSIGNMENT_METADATA_LINE_PATTERN.test(line))
    .filter((line) => !SOURCE_ASSIGNMENT_REQUIREMENT_SIGNAL_PATTERN.test(line));
  for (const line of lines) {
    const cleaned = cleanResearchSubjectQuery(line);
    if (cleaned && cleaned.length >= 4 && cleaned.length <= 90 && !isLikelyAssignmentInstructionQuery(cleaned)) {
      return cleaned;
    }
  }
  return '';
};

const extractVerifiedSourceQuery = ({ userPrompt = '', documentContext = '', fallbackQuery = '', workspaceId = '', stripFollowOnWork = false, sourceQueryOverride = '', researchTopic = '', blockAssignmentPromptFallback = false } = {}) => {
  const overrideQuery = normalizeSourceQueryOverride(sourceQueryOverride || researchTopic);
  if (overrideQuery) return overrideQuery;
  if ((sourceQueryOverride || researchTopic || blockAssignmentPromptFallback) && !overrideQuery) return '';
  const promptText = normalizeSourceSearchText(userPrompt);
  const contextText = normalizeSourceSearchText(documentContext);
  const fallbackText = normalizeSourceSearchText(fallbackQuery);
  const explicitResearchSubject = extractExplicitResearchSubjectQuery(userPrompt);
  if (explicitResearchSubject) return explicitResearchSubject;
  const explicitSourceFollowUp = SOURCE_EXPLICIT_FOLLOW_UP_PATTERN.test(promptText);
  const genericSourceFollowUp = !explicitSourceFollowUp && SOURCE_FOLLOW_UP_PATTERN.test(promptText);
  const rawFollowUpTail = explicitSourceFollowUp
    ? normalizeSourceSearchText(promptText.replace(SOURCE_EXPLICIT_FOLLOW_UP_PATTERN, ''))
    : genericSourceFollowUp
      ? normalizeSourceSearchText(promptText.replace(SOURCE_FOLLOW_UP_PATTERN, ''))
      : '';
  const followUpTail = stripFollowOnWork
    ? stripSourceRetrievalFollowOnTail(rawFollowUpTail, { includeDirectChatLightDeliverable: true })
    : rawFollowUpTail;
  if ((explicitSourceFollowUp || genericSourceFollowUp) && fallbackText && hasRecentVerifiedSourceFollowUpContext({ workspaceId }) && !followUpTail) {
    return String(fallbackText || '').slice(0, 420).trim();
  }
  const effectivePromptText = stripFollowOnWork
    ? stripSourceRetrievalFollowOnTail(followUpTail || promptText, { includeDirectChatLightDeliverable: true })
    : (followUpTail || promptText);
  const promptNeedsContext = !effectivePromptText || effectivePromptText.length < 28 || GENERIC_SOURCE_QUERY_PATTERN.test(effectivePromptText);
  const merged = promptNeedsContext && contextText
    ? [effectivePromptText, contextText].filter(Boolean).join(' ')
    : effectivePromptText;
  const query = String(merged || '').slice(0, 420).trim();
  if (isLikelyAssignmentInstructionQuery(query)) {
    // לא משאירים את האחזור חסום: גוזרים נושא מכותרת/שורת-נושא במקום להחזיר ריק.
    return deriveFallbackResearchTopic(userPrompt) || deriveFallbackResearchTopic(documentContext) || '';
  }
  return query;
};

const parseSourceYear = (value = '') => {
  const matches = String(value || '').match(/\b(?:19|20)\d{2}\b/g);
  return matches?.[matches.length - 1] || '';
};

const extractDoiFromSource = (value = '') => {
  const match = String(value || '').match(DOI_PATTERN);
  return match ? String(match[0] || '').replace(/[),.;]+$/, '') : '';
};

const VERIFIED_SOURCE_TRACKING_PARAM_KEYS = new Set([
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'msclkid',
  'igshid',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
]);

const canonicalizeVerifiedSourceUrl = (value = '') => {
  const rawUrl = String(value || '').trim();
  if (!rawUrl) return '';

  const normalizedUrl = normalizeArticleUrl(/^www\./i.test(rawUrl) ? `https://${rawUrl}` : rawUrl);
  if (!normalizedUrl) return '';

  try {
    const parsed = new URL(normalizedUrl);
    parsed.hash = '';
    if ((parsed.protocol === 'https:' && parsed.port === '443') || (parsed.protocol === 'http:' && parsed.port === '80')) {
      parsed.port = '';
    }
    Array.from(parsed.searchParams.keys()).forEach((key) => {
      const normalizedKey = String(key || '').trim().toLowerCase();
      if (!normalizedKey) return;
      if (/^utm_/i.test(normalizedKey) || VERIFIED_SOURCE_TRACKING_PARAM_KEYS.has(normalizedKey)) {
        parsed.searchParams.delete(key);
      }
    });
    if (typeof parsed.searchParams.sort === 'function') parsed.searchParams.sort();
    parsed.pathname = (parsed.pathname || '/').replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
    return parsed.toString();
  } catch {
    return normalizedUrl;
  }
};

const buildVerifiedArticleUrlComparisonKey = (value = '') => {
  const canonicalUrl = canonicalizeVerifiedSourceUrl(value);
  if (!canonicalUrl) return '';

  try {
    const parsed = new URL(canonicalUrl);
    const hostname = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const pathname = (parsed.pathname || '/').replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
    return `${hostname}${pathname}${parsed.search || ''}`;
  } catch {
    return canonicalUrl;
  }
};

const areVerifiedArticleUrlsEquivalent = (left = '', right = '') => {
  const leftCanonicalUrl = canonicalizeVerifiedSourceUrl(left);
  const rightCanonicalUrl = canonicalizeVerifiedSourceUrl(right);
  if (leftCanonicalUrl && rightCanonicalUrl && leftCanonicalUrl === rightCanonicalUrl) return true;

  const leftComparisonKey = buildVerifiedArticleUrlComparisonKey(leftCanonicalUrl || left);
  const rightComparisonKey = buildVerifiedArticleUrlComparisonKey(rightCanonicalUrl || right);
  return Boolean(leftComparisonKey && rightComparisonKey && leftComparisonKey === rightComparisonKey);
};

const normalizeVerifiedSourceAllowedUrl = (value = '') => canonicalizeVerifiedSourceUrl(value) || String(value || '').trim();

const buildVerifiedSourceAllowedUrlSet = (values = []) => {
  const items = values instanceof Set
    ? Array.from(values)
    : Array.isArray(values)
      ? values
      : [];
  return new Set(items.map((url) => normalizeVerifiedSourceAllowedUrl(url)).filter(Boolean));
};

const hasVerifiedSourceAllowedUrl = (allowedUrls = new Set(), value = '') => {
  const normalizedUrl = normalizeVerifiedSourceAllowedUrl(value);
  return Boolean(normalizedUrl) && allowedUrls.has(normalizedUrl);
};

const buildVerifiedSourceTitleDomainSignature = (source = {}) => {
  const title = normalizeArticleText(source?.title || '');
  const domain = normalizeArticleText(extractArticleDomainFromUrl(source?.url) || source?.summary || '');
  if (!title && !domain) return '';
  return `${domain}::${title}`;
};

const areEquivalentVerifiedSourceCandidates = (sources = []) => {
  const candidates = (Array.isArray(sources) ? sources : []).filter((source) => source && typeof source === 'object');
  if (candidates.length < 2) return true;

  const reference = candidates[0];
  const referenceUrl = canonicalizeVerifiedSourceUrl(reference?.url);
  const referenceSignature = buildVerifiedSourceTitleDomainSignature(reference);

  return candidates.slice(1).every((candidate) => {
    const candidateUrl = canonicalizeVerifiedSourceUrl(candidate?.url);
    if (referenceUrl && candidateUrl && referenceUrl === candidateUrl) return true;

    const candidateSignature = buildVerifiedSourceTitleDomainSignature(candidate);
    return Boolean(referenceSignature) && referenceSignature === candidateSignature;
  });
};

const buildVerifiedSourceKey = (item = {}) => {
  const url = canonicalizeVerifiedSourceUrl(item?.url || '') || String(item?.url || '').trim().toLowerCase();
  const title = String(item?.title || '').trim().toLowerCase();
  return `${url}::${title}`;
};

const dedupeVerifiedSourceResults = (results = []) => {
  const seen = new Set();
  return (Array.isArray(results) ? results : []).filter((item) => {
    if (!item || typeof item !== 'object') return false;
    if (!String(item.url || '').trim() && !String(item.title || '').trim()) return false;
    const key = buildVerifiedSourceKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const normalizeScholarVerifiedSource = (raw = {}) => {
  if (!raw || typeof raw !== 'object') return null;
  const publicationInfo = raw.publication_info && typeof raw.publication_info === 'object' ? raw.publication_info : {};
  const authors = Array.isArray(publicationInfo.authors)
    ? publicationInfo.authors.map((author) => normalizeSourceSearchText(author?.name || '')).filter(Boolean)
    : [];
  const summary = normalizeSourceSearchText(publicationInfo.summary || '');
  const title = normalizeSourceSearchText(raw.title || '');
  const url = normalizeSourceSearchText(raw.link || raw.inline_links?.html_version || raw.resources?.[0]?.link || '');
  const snippet = normalizeSourceSearchText(raw.snippet || '');
  const citedByRaw = Number(raw.inline_links?.cited_by?.total);
  const citedBy = Number.isFinite(citedByRaw) && citedByRaw > 0 ? citedByRaw : null;
  const doi = extractDoiFromSource([url, snippet, summary].filter(Boolean).join(' '));
  if (!title && !url) return null;
  return {
    title,
    url,
    snippet,
    summary,
    authors,
    year: parseSourceYear(summary),
    citedBy,
    doi,
    providerId: 'serpapi-scholar',
  };
};

const normalizePerplexityVerifiedSource = (raw = {}) => {
  if (!raw || typeof raw !== 'object') return null;
  const title = normalizeSourceSearchText(raw.title || '');
  const url = normalizeSourceSearchText(raw.url || raw.link || '');
  const snippet = normalizeSourceSearchText(raw.snippet || '');
  const sourceLabel = normalizeSourceSearchText(raw.source || '');
  const dateLabel = normalizeSourceSearchText(raw.date || raw.last_updated || '');
  const summary = [sourceLabel, dateLabel].filter(Boolean).join(' | ');
  const doi = extractDoiFromSource([title, url, snippet].filter(Boolean).join(' '));
  if (!title && !url) return null;
  return {
    title,
    url,
    snippet,
    summary,
    authors: [],
    year: parseSourceYear(dateLabel),
    citedBy: null,
    doi,
    providerId: 'perplexity-search',
  };
};

const normalizePerplexityCitationSource = (url = '') => {
  const safeUrl = normalizeSourceSearchText(url);
  if (!safeUrl) return null;
  return {
    title: '',
    url: safeUrl,
    snippet: '',
    summary: '',
    authors: [],
    year: '',
    citedBy: null,
    doi: extractDoiFromSource(safeUrl),
    providerId: 'perplexity-search',
  };
};

const requestJsonOverHttp = async ({ url, method = 'GET', headers = {}, body = '', signal, timeoutMs = 0 } = {}) => {
  const desktopResult = await proxyDesktopHttpRequest({ url, method, headers, body, timeoutMs }, signal);
  if (desktopResult) {
    if (!desktopResult.ok) {
      throw new Error(`HTTP ${desktopResult.status}: ${String(desktopResult.body || '').slice(0, 300)}`);
    }
    return JSON.parse(desktopResult.body || '{}');
  }

  const response = await fetch(url, {
    method,
    headers,
    signal,
    ...(body ? { body } : {}),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`HTTP ${response.status}: ${String(text || '').slice(0, 300)}`);
  }
  return response.json();
};

const fetchScholarVerifiedSources = async ({ query = '', apiKey = '', signal, timeoutMs = 0, limit = VERIFIED_SOURCE_RESULT_LIMIT } = {}) => {
  const safeQuery = String(query || '').trim();
  const safeApiKey = String(apiKey || '').trim();
  if (!safeQuery || !safeApiKey) return [];

  const params = new URLSearchParams({
    engine: 'google_scholar',
    q: safeQuery,
    api_key: safeApiKey,
    num: String(Math.max(1, Math.min(10, Number(limit) || VERIFIED_SOURCE_RESULT_LIMIT))),
    hl: HEBREW_TEXT_PATTERN.test(safeQuery) ? 'iw' : 'en',
    as_vis: '1',
    output: 'json',
  });
  const data = await requestJsonOverHttp({
    url: `https://serpapi.com/search.json?${params.toString()}`,
    method: 'GET',
    signal,
    timeoutMs,
  });
  const status = String(data?.search_metadata?.status || '').trim().toLowerCase();
  if (status === 'error') {
    throw new Error(String(data?.error || 'SerpAPI Scholar search failed').trim());
  }
  const results = Array.isArray(data?.organic_results) ? data.organic_results : [];
  return dedupeVerifiedSourceResults(results.map(normalizeScholarVerifiedSource).filter(Boolean)).slice(0, Math.max(1, Math.min(VERIFIED_SOURCE_RESULT_HARD_LIMIT, Number(limit) || VERIFIED_SOURCE_RESULT_LIMIT)));
};

const fetchPerplexityVerifiedSources = async ({ query = '', apiKey = '', model = 'sonar', signal, timeoutMs = 0, academic = false, limit = VERIFIED_SOURCE_RESULT_LIMIT } = {}) => {
  const safeQuery = String(query || '').trim();
  const safeApiKey = String(apiKey || '').trim();
  if (!safeQuery || !safeApiKey) return [];

  const body = JSON.stringify({
    model: String(model || '').trim() || 'sonar',
    messages: [
      {
        role: 'system',
        content: academic
          ? 'Search for real academic sources for the user query. The answer text itself can be just OK.'
          : 'Search for real web sources for the user query. The answer text itself can be just OK.',
      },
      { role: 'user', content: safeQuery },
    ],
    max_tokens: 64,
    temperature: 0,
    stream: false,
    disable_search: false,
    web_search_options: {
      search_mode: academic ? 'academic' : 'web',
    },
    return_related_questions: false,
  });
  const data = await requestJsonOverHttp({
    url: 'https://api.perplexity.ai/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${safeApiKey}`,
    },
    body,
    signal,
    timeoutMs,
  });
  const searchResults = Array.isArray(data?.search_results)
    ? data.search_results.map(normalizePerplexityVerifiedSource).filter(Boolean)
    : [];
  if (searchResults.length) {
    return dedupeVerifiedSourceResults(searchResults).slice(0, Math.max(1, Math.min(VERIFIED_SOURCE_RESULT_HARD_LIMIT, Number(limit) || VERIFIED_SOURCE_RESULT_LIMIT)));
  }
  const citations = Array.isArray(data?.citations)
    ? data.citations.map(normalizePerplexityCitationSource).filter(Boolean)
    : [];
  return dedupeVerifiedSourceResults(citations).slice(0, Math.max(1, Math.min(VERIFIED_SOURCE_RESULT_HARD_LIMIT, Number(limit) || VERIFIED_SOURCE_RESULT_LIMIT)));
};

const VERIFIED_ARTICLE_GEMINI_MODEL = 'gemini-2.5-pro';
const VERIFIED_ARTICLE_PROVIDER_IDS = ['gemini', 'perplexity'];
const VERIFIED_ARTICLE_PROVIDER_PRIORITY = ['perplexity', 'gemini'];
const REQUESTED_VERIFIED_ARTICLE_COUNT_MAX = 10;
const HEBREW_VERIFIED_ARTICLE_COUNT_WORDS = new Map([
  ['אחד', 1],
  ['אחת', 1],
  ['שני', 2],
  ['שניים', 2],
  ['שתיים', 2],
  ['שתי', 2],
  ['שלושה', 3],
  ['שלוש', 3],
  ['ארבעה', 4],
  ['ארבע', 4],
  ['חמישה', 5],
  ['חמש', 5],
  ['שישה', 6],
  ['שש', 6],
  ['שבעה', 7],
  ['שבע', 7],
  ['שמונה', 8],
  ['תשעה', 9],
  ['תשע', 9],
  ['עשרה', 10],
  ['עשר', 10],
]);

const clampRequestedVerifiedArticleCount = (value = 1) => Math.max(1, Math.min(REQUESTED_VERIFIED_ARTICLE_COUNT_MAX, Number(value) || 1));

const extractRequestedArticleCount = (query = '') => {
  const text = String(query || '').trim();
  if (!text) return 1;

  const numericMatch = text.match(/(?:^|[^\d])([1-9]\d?)\s*(?:כתבות|כתבה|ידיעות|ידיעה|מאמרים|מאמר|articles?|news\s+articles?)(?=$|\s|[.,;:!?])/iu)
    || text.match(/(?:כתבות|כתבה|ידיעות|ידיעה|מאמרים|מאמר|articles?|news\s+articles?)\s*([1-9]\d?)(?=$|\s|[.,;:!?])/iu);
  if (numericMatch) return clampRequestedVerifiedArticleCount(numericMatch[1]);

  const wordMatch = text.match(/(?:^|\s)(אחד|אחת|שני|שניים|שתיים|שתי|שלושה|שלוש|ארבעה|ארבע|חמישה|חמש|שישה|שש|שבעה|שבע|שמונה|תשעה|תשע|עשרה|עשר)\s+(?:כתבות|כתבה|ידיעות|ידיעה|מאמרים|מאמר)(?=$|\s|[.,;:!?])/u);
  if (!wordMatch) return 1;
  return clampRequestedVerifiedArticleCount(HEBREW_VERIFIED_ARTICLE_COUNT_WORDS.get(wordMatch[1]) || 1);
};

const normalizeLoopbackHostname = (value = '') => String(value || '').trim().replace(/^\[|\]$/g, '').toLowerCase();

const isLoopbackBrowserRuntime = () => {
  if (typeof window === 'undefined') return false;
  const hostname = normalizeLoopbackHostname(window.location?.hostname || '');
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
};

const canUseLocalVerifiedArticleBridge = () => {
  if (!isLoopbackBrowserRuntime()) return false;
  return typeof window === 'undefined' ? false : !window.desktopApp;
};

const getLocalVerifiedArticleBridgeUrls = () => {
  if (typeof window === 'undefined') {
    return ['https://localhost:4317', 'http://localhost:4317', 'http://127.0.0.1:4317'];
  }

  const runtimeProtocol = String(window.location?.protocol || '').trim().toLowerCase();
  const urls = ['/api/local-article-check'];

  if (runtimeProtocol === 'https:') {
    urls.push('https://localhost:4317');
  } else {
    urls.push('http://localhost:4317', 'http://127.0.0.1:4317');
  }

  return Array.from(new Set(urls));
};

const buildVerifiedArticlePrompt = (query = '', provider = 'gemini', queryMeta = analyzeArticleQuery(query), requestedArticleCount = extractRequestedArticleCount(query)) => {
  const normalizedProvider = String(provider || 'gemini').trim().toLowerCase();
  const articleCount = clampRequestedVerifiedArticleCount(requestedArticleCount);
  const searchInstruction = normalizedProvider === 'perplexity'
    ? `מצא ${articleCount === 1 ? 'כתבת web אמיתית אחת' : `עד ${articleCount} כתבות web אמיתיות`} שמתאימות לבקשה הבאה, והסתמך רק על מידע שניתן לעגן בחיפוש web המובנה של Perplexity.`
    : `מצא ${articleCount === 1 ? 'כתבת web אמיתית אחת' : `עד ${articleCount} כתבות web אמיתיות`} שמתאימות לבקשה הבאה, והסתמך רק על מידע שניתן לעגן בחיפוש Google המובנה.`;

  const responseShape = articleCount > 1
    ? [
      '{',
      '  "matchStatus": "match או no-match",',
      '  "noMatchReason": "הסבר קצר אם לא נמצאה אף כתבה, אחרת מחרוזת ריקה",',
      '  "articles": [',
      '    {',
      '      "title": "כותרת הכתבה",',
      '      "url": "הקישור הישיר לכתבה",',
      '      "summary": "תקציר תמציתי של 2-4 משפטים",',
      '      "sourceName": "שם האתר או המקור",',
      '      "whyRelevant": "למה הכתבה הזאת מתאימה לבקשה"',
      '    }',
      '  ]',
      '}',
    ]
    : [
      '{',
      '  "matchStatus": "match או no-match",',
      '  "noMatchReason": "הסבר קצר אם לא נמצא, אחרת מחרוזת ריקה",',
      '  "title": "כותרת הכתבה",',
      '  "url": "הקישור הישיר לכתבה, או מחרוזת ריקה אם לא נמצא",',
      '  "summary": "תקציר תמציתי של 2-4 משפטים, או מחרוזת ריקה אם לא נמצא",',
      '  "sourceName": "שם האתר או המקור",',
      '  "whyRelevant": "למה הכתבה הזאת מתאימה לבקשה, או מחרוזת ריקה אם לא נמצא"',
      '}',
    ];

  return [
    searchInstruction,
    'אל תמציא URL ואל תמציא מקור.',
    queryMeta.expectsNewsArticle
      ? 'אם הבקשה מבקשת "כתבה", החזר רק כתבת חדשות עיתונאית מאתר חדשות. אל תחזיר הודעה רשמית, הודעה לעיתונות, עמוד של מכון מחקר, מאמר ניתוח או דעה, בלוג, פוסט חברתי, וידאו או דף קטגוריה.'
      : 'החזר רק עמוד כתבה יחיד, לא דף בית ולא דף קטגוריה.',
    queryMeta.years.length > 0
      ? `אם צוינה שנה, הכתבה חייבת להתאים בדיוק לשנה הזאת: ${queryMeta.years.join(', ')}. אל תחליף לשנה סמוכה.`
      : 'אם לא נמצאה התאמה נאמנה מספיק, החזר no-match במקום מקור קרוב-אבל-שגוי.',
    queryMeta.focusPhrase
      ? `היה נאמן בדיוק לשם או לנושא הזה: "${queryMeta.focusPhrase}". אם המקור לא מתייחס אליו במפורש, החזר no-match.`
      : 'אל תחליף אירוע, גוף, דוח או נושא בשם אחר גם אם הוא קשור חלקית.',
    articleCount > 1
      ? `אם נמצאו פחות מ-${articleCount} כתבות מאומתות, החזר רק את הכתבות שנמצאו באמת. אם לא נמצאה אף כתבה תואמת מספיק, החזר matchStatus="no-match" עם noMatchReason ברור ו-articles ריק.`
      : 'אם אין כתבה תואמת מספיק, החזר matchStatus="no-match" עם noMatchReason ברור, והשאר את title/url/summary/sourceName/whyRelevant ריקים.',
    'החזר JSON בלבד במבנה הבא:',
    ...responseShape,
    '',
    `הבקשה: ${query}`,
  ].join('\n');
};

const stripVerifiedArticleCodeFence = (text = '') => {
  const trimmed = String(text || '').trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```[a-zA-Z0-9_-]*\s*/, '').replace(/\s*```$/, '').trim();
};

const parseVerifiedArticleJson = (text = '') => {
  const cleaned = stripVerifiedArticleCodeFence(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return {};
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return {};
    }
  }
};

const normalizeVerifiedArticleMatchStatus = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase().replace(/_/g, '-');
  if (normalized === 'match') return 'match';
  if (normalized === 'no-match' || normalized === 'no match' || normalized === 'nomatch') return 'no-match';
  return '';
};

const extractOpenAiMessageText = (message = '') => {
  if (typeof message === 'string') return message.trim();
  if (!Array.isArray(message)) return '';
  return message
    .map((part) => {
      if (typeof part === 'string') return part;
      return String(part?.text || '').trim();
    })
    .filter(Boolean)
    .join('\n')
    .trim();
};

const normalizeGeminiVerifiedArticleSource = (raw = {}) => {
  const title = normalizeSourceSearchText(raw?.title || raw?.displayName || '');
  const url = normalizeArticleUrl(raw?.uri || raw?.url || '');
  const domain = normalizeSourceSearchText(raw?.domain || extractArticleDomainFromUrl(url));
  if (!title && !url) return null;
  return {
    title,
    url,
    snippet: '',
    summary: domain,
    authors: [],
    year: '',
    citedBy: null,
    doi: extractDoiFromSource(url),
    providerId: 'gemini-article-search',
  };
};

// עיגון ברמת-קטע (Stage 1, תוספתי): ממפה כל groundingChunk לרשימת קטעי-המקור (segment)
// שהמודל הסתמך עליהם, עם ציון-ביטחון (0-1). הנתונים כבר בתשובת ה-grounding — רק מפסיקים
// לזרוק אותם. אין כרגע consumer; ה-passages יושבים על אובייקט-המקור עד ששלב האימות יצרוך.
const buildGeminiGroundingPassageMap = (groundingMetadata = {}) => {
  const map = new Map();
  const supports = Array.isArray(groundingMetadata?.groundingSupports) ? groundingMetadata.groundingSupports : [];
  for (const support of supports) {
    const text = normalizeSourceSearchText(support?.segment?.text || '');
    if (!text) continue;
    const chunkIndices = Array.isArray(support?.groundingChunkIndices) ? support.groundingChunkIndices : [];
    const scores = Array.isArray(support?.confidenceScores) ? support.confidenceScores : [];
    chunkIndices.forEach((chunkIdx, i) => {
      const idx = Number(chunkIdx);
      if (!Number.isInteger(idx) || idx < 0) return;
      const scoreRaw = Number(scores[i]);
      const confidence = Number.isFinite(scoreRaw) ? scoreRaw : null;
      if (!map.has(idx)) map.set(idx, []);
      map.get(idx).push({ text, confidence });
    });
  }
  return map;
};

const extractGeminiVerifiedArticleSources = (response = {}, limit = VERIFIED_SOURCE_RESULT_LIMIT) => {
  const groundingMetadata = response?.candidates?.[0]?.groundingMetadata;
  const passagesByChunk = buildGeminiGroundingPassageMap(groundingMetadata);
  const sources = Array.isArray(groundingMetadata?.groundingChunks)
    ? groundingMetadata.groundingChunks
      .map((chunk, idx) => {
        const source = normalizeGeminiVerifiedArticleSource(chunk?.web || chunk?.retrievedContext || chunk);
        if (!source) return null;
        const passages = passagesByChunk.get(idx);
        return (passages && passages.length) ? { ...source, groundedPassages: passages } : source;
      })
      .filter(Boolean)
    : [];
  return dedupeVerifiedSourceResults(sources).slice(0, Math.max(1, Math.min(VERIFIED_SOURCE_RESULT_HARD_LIMIT, Number(limit) || VERIFIED_SOURCE_RESULT_LIMIT)));
};

const extractGeminiGroundingUrlsFromResponse = (response = {}) => extractGeminiVerifiedArticleSources(response)
  .map((item) => String(item?.url || '').trim())
  .filter(Boolean);

const extractPerplexityVerifiedArticleSources = (payload = {}, limit = VERIFIED_SOURCE_RESULT_LIMIT) => {
  const searchResults = Array.isArray(payload?.search_results)
    ? payload.search_results.map(normalizePerplexityVerifiedSource).filter(Boolean)
    : [];
  if (searchResults.length) {
    return dedupeVerifiedSourceResults(searchResults).slice(0, Math.max(1, Math.min(VERIFIED_SOURCE_RESULT_HARD_LIMIT, Number(limit) || VERIFIED_SOURCE_RESULT_LIMIT)));
  }
  const citations = Array.isArray(payload?.citations)
    ? payload.citations.map(normalizePerplexityCitationSource).filter(Boolean)
    : [];
  return dedupeVerifiedSourceResults(citations).slice(0, Math.max(1, Math.min(VERIFIED_SOURCE_RESULT_HARD_LIMIT, Number(limit) || VERIFIED_SOURCE_RESULT_LIMIT)));
};

const normalizeGroundedWebResult = (item = {}, providerId = '') => {
  if (!item || typeof item !== 'object') return null;
  const url = canonicalizeVerifiedSourceUrl(item.url || '');
  if (!url) return null;
  const title = normalizeSourceSearchText(item.title || item.displayName || url);
  const snippet = normalizeSourceSearchText(item.snippet || item.text || '');
  const sourceName = normalizeSourceSearchText(item.sourceName || item.source || item.domain || extractArticleDomainFromUrl(url));
  const summary = normalizeSourceSearchText(item.summary || sourceName);
  return {
    title,
    url,
    snippet,
    summary,
    sourceName,
    providerId: providerId || item.providerId || '',
    // עיגון ברמת-קטע (Stage 1) — נשמר דרך הנרמול כדי שיגיע ל-binder ב-Stage 3.
    ...((Array.isArray(item.groundedPassages) && item.groundedPassages.length) ? { groundedPassages: item.groundedPassages } : {}),
  };
};

const dedupeGroundedWebResults = (results = [], limit = GROUNDED_WEB_RESULT_LIMIT) => dedupeVerifiedSourceResults(
  (Array.isArray(results) ? results : [])
    .map((item) => normalizeGroundedWebResult(item, item?.providerId || ''))
    .filter(Boolean),
).slice(0, Math.max(1, Math.min(GROUNDED_WEB_RESULT_HARD_LIMIT, Number(limit) || GROUNDED_WEB_RESULT_LIMIT)));

const isGoogleGroundingRedirectUrl = (value = '') => {
  const normalizedUrl = normalizeArticleUrl(value);
  if (!normalizedUrl) return false;

  try {
    const parsed = new URL(normalizedUrl);
    const hostname = parsed.hostname.toLowerCase();
    return parsed.pathname.includes('/grounding-api-redirect')
      && (hostname === 'vertexaisearch.cloud.google.com' || hostname.endsWith('.google.com'));
  } catch {
    return false;
  }
};

const resolveGeminiGroundedWebResultUrl = async (url = '', resolveCanonicalUrl = resolveVerifiedArticleCanonicalUrl) => {
  const normalizedUrl = normalizeArticleUrl(url);
  if (!normalizedUrl || !isGoogleGroundingRedirectUrl(normalizedUrl)) return normalizedUrl;

  try {
    const resolvedUrl = normalizeArticleUrl(await resolveCanonicalUrl(normalizedUrl));
    return resolvedUrl && !isGoogleGroundingRedirectUrl(resolvedUrl) ? resolvedUrl : normalizedUrl;
  } catch {
    return normalizedUrl;
  }
};

const extractGeminiGroundedWebResultsFromResponse = async (response = {}, limit = GROUNDED_WEB_RESULT_LIMIT) => {
  const resolveCanonicalUrl = createVerifiedArticleCanonicalUrlResolver();
  const sources = await Promise.all(extractGeminiVerifiedArticleSources(response, limit).map(async (item) => ({
    ...item,
    url: await resolveGeminiGroundedWebResultUrl(item?.url, resolveCanonicalUrl),
    providerId: 'gemini-google-search',
  })));
  return dedupeGroundedWebResults(sources, limit);
};

const extractPerplexityGroundedWebResultsFromPayload = (payload = {}, limit = GROUNDED_WEB_RESULT_LIMIT) => dedupeGroundedWebResults(
  extractPerplexityVerifiedArticleSources(payload, limit).map((item) => ({ ...item, providerId: 'perplexity-search' })),
  limit,
);

const HEBREW_WEB_RESULT_COUNT_WORDS = new Map([
  ['אחד', 1],
  ['אחת', 1],
  ['שני', 2],
  ['שניים', 2],
  ['שתיים', 2],
  ['שתי', 2],
  ['שלושה', 3],
  ['שלוש', 3],
  ['ארבעה', 4],
  ['ארבע', 4],
  ['חמישה', 5],
  ['חמש', 5],
  ['שישה', 6],
  ['שש', 6],
  ['שבעה', 7],
  ['שבע', 7],
  ['שמונה', 8],
  ['תשעה', 9],
  ['תשע', 9],
  ['עשרה', 10],
  ['עשר', 10],
]);

const extractRequestedWebResultCount = (query = '') => {
  const text = String(query || '').trim();
  if (!text) return { count: 3, explicit: false };
  const countTargetPattern = '(?:תוצאות|תוצאה|מקורות|מקור|קישורים|קישור|לינקים|לינק|פריטי\\s+תוכן|פריט\\s+תוכן|כתבות|כתבה|ידיעות|ידיעה|מאמרים|מאמר|results?|sources?|links?|citations?|content\\s+items?|articles?|news\\s+articles?)';
  const numericMatch = text.match(new RegExp(`(?:^|[^\\d])([1-9]\\d?)\\s*${countTargetPattern}(?=$|\\s|[.,;:!?])`, 'iu'))
    || text.match(new RegExp(`${countTargetPattern}\\s*([1-9]\\d?)(?=$|\\s|[.,;:!?])`, 'iu'));
  if (numericMatch) return { count: Math.max(1, Math.min(GROUNDED_WEB_RESULT_HARD_LIMIT, Number(numericMatch[1]) || 3)), explicit: true };

  const wordMatch = text.match(new RegExp(`(?:^|\\s)(אחד|אחת|שני|שניים|שתיים|שתי|שלושה|שלוש|ארבעה|ארבע|חמישה|חמש|שישה|שש|שבעה|שבע|שמונה|תשעה|תשע|עשרה|עשר)\\s+${countTargetPattern}(?=$|\\s|[.,;:!?])`, 'u'));
  if (wordMatch) return { count: Math.max(1, Math.min(GROUNDED_WEB_RESULT_HARD_LIMIT, HEBREW_WEB_RESULT_COUNT_WORDS.get(wordMatch[1]) || 3)), explicit: true };
  return { count: 3, explicit: false };
};

const buildGroundedWebResultsSearchPrompt = (query = '', requestedCount = 3) => {
  const queryMeta = analyzeArticleQuery(query);
  return [
    `חפש ברשת ${requestedCount} תוצאות עדכניות ורלוונטיות לבקשה, אם קיימות מספיק תוצאות מקורקעות אמיתיות.`,
    'בצע חיפוש Google בפועל לפני המענה ובסס את התשובה אך ורק על תוצאות חיפוש אמיתיות (grounding). אל תענה מהזיכרון הסטטי בלי לחפש.',
    queryMeta.expectsNewsArticle
      ? 'אם הבקשה מבקשת כתבות, ידיעות או חדשות, העדף כתבות חדשות ספציפיות מאתרי חדשות. אל תעדיף Wikipedia, דפי מוסדות, דפי בית, דפי קטגוריה או הודעות רשמיות אם קיימות כתבות עיתונאיות מתאימות.'
      : '',
    'הקישורים שיוצגו למשתמש יילקחו רק מ-metadata של כלי החיפוש, לא מהטקסט שלך.',
    'ענה במשפט קצר בלבד שמתאר את נושא החיפוש.',
    `הבקשה: ${query}`,
  ].filter(Boolean).join('\n');
};

const formatGroundedWebResultItem = (item = {}, index = 0) => {
  const title = String(item.title || item.url || 'תוצאה').trim();
  const sourceName = String(item.sourceName || extractArticleDomainFromUrl(item.url) || '').trim();
  const summary = String(item.snippet || (item.summary && item.summary !== sourceName ? item.summary : '') || '').trim();
  const lines = [`${index + 1}. ${title}`];
  if (sourceName) lines.push(`מקור: ${sourceName}`);
  if (summary) lines.push(`תקציר: ${summary}`);
  lines.push(`קישור: ${item.url}`);
  return lines.join('\n');
};

const buildGroundedWebResultsReply = ({ query = '', results = [], providerId = '', requestedCount = 3, explicitCount = false } = {}) => {
  const providerLabel = providerId === 'gemini-google-search'
    ? 'Gemini + Google Search'
    : 'Perplexity Search';
  const safeResults = dedupeGroundedWebResults(results, requestedCount);
  const resultCount = safeResults.length;
  const countLine = explicitCount && resultCount < requestedCount
    ? `התבקשו ${requestedCount} תוצאות. הוחזרו ${resultCount} תוצאות שנמצאו בפועל דרך ${providerLabel}.`
    : `הוחזרו ${resultCount} תוצאות שנמצאו בפועל דרך ${providerLabel}.`;
  return [
    `תוצאות Web מקורקעות${query ? ` עבור: ${query}` : ''}`,
    countLine,
    ...safeResults.map((item, index) => formatGroundedWebResultItem(item, index)),
    'לא הוספתי קישורים שלא הגיעו מ-grounding/search results/citations של הספק.',
  ].filter(Boolean).join('\n\n');
};

const buildGroundedWebResultsFailureMessage = ({ query = '', providerAvailable = false } = {}) => [
  SOURCE_GROUNDING_FAILURE_TOKEN,
  providerAvailable
    ? 'לא נמצאו תוצאות Web מקורקעות עם URL אמיתי מ-metadata של הספק, ולכן לא החזרתי קישורים מהטקסט החופשי של המודל.'
    : 'אין כרגע ספק עם חיפוש Web מקורקע. הגדר Gemini או Perplexity כדי לקבל תוצאות וקישורים אמיתיים.',
  query ? `שאילתת החיפוש שנבדקה: ${query}` : '',
].filter(Boolean).join('\n\n');

const fetchGeminiGroundedWebResults = async ({ query = '', apiKey = '', model = '', requestedCount = 3 } = {}) => {
  const safeQuery = String(query || '').trim();
  const safeApiKey = String(apiKey || '').trim();
  if (!safeQuery || !safeApiKey) return [];
  const genAI = new GoogleGenerativeAI(safeApiKey);
  const generativeModel = genAI.getGenerativeModel({
    model: String(model || '').trim() || VERIFIED_ARTICLE_GEMINI_MODEL,
    tools: [{ googleSearch: {} }],
  });
  const result = await generativeModel.generateContent(buildGroundedWebResultsSearchPrompt(safeQuery, requestedCount));
  return await extractGeminiGroundedWebResultsFromResponse(result.response, requestedCount);
};

const fetchPerplexityGroundedWebResults = async ({ query = '', apiKey = '', model = 'sonar', signal, timeoutMs = 0, requestedCount = 3 } = {}) => {
  const safeQuery = String(query || '').trim();
  const safeApiKey = String(apiKey || '').trim();
  if (!safeQuery || !safeApiKey) return [];
  const data = await requestJsonOverHttp({
    url: 'https://api.perplexity.ai/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${safeApiKey}`,
    },
    body: JSON.stringify({
      model: String(model || '').trim() || 'sonar',
      messages: [
        { role: 'system', content: 'Search the web for current relevant results. Keep the answer short; URLs will be taken only from provider metadata.' },
        { role: 'user', content: safeQuery },
      ],
      max_tokens: 256,
      temperature: 0,
      stream: false,
      disable_search: false,
      web_search_options: { search_mode: 'web' },
      return_related_questions: false,
    }),
    signal,
    timeoutMs,
  });
  return extractPerplexityGroundedWebResultsFromPayload(data, requestedCount);
};

const resolveGroundedWebResultsReply = async ({ userPrompt = '', documentContext = '', cfg = DEFAULT_PROVIDER_CONFIG, timeoutMs = 0, preferredProviderId = '', sourceQueryOverride = '', researchTopic = '', blockAssignmentPromptFallback = false } = {}) => {
  const workspaceId = String(getWorkspaceAutomation().activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  const query = extractVerifiedSourceQuery({
    userPrompt,
    documentContext,
    fallbackQuery: getLastVerifiedSourceQuery({ workspaceId }),
    workspaceId,
    stripFollowOnWork: true,
    sourceQueryOverride,
    researchTopic,
    blockAssignmentPromptFallback,
  });
  const { count: requestedCount, explicit: explicitCount } = extractRequestedWebResultCount(userPrompt || query);
  if (!query) {
    return {
      text: buildMissingResearchTopicMessage(),
      providerId: 'grounded-web-results-missing-query',
      model: 'blocked-assignment-query',
      urls: new Set(),
      query,
      workspaceId,
    };
  }
  const preferredProvider = String(preferredProviderId || '').trim().toLowerCase();
  const providerOrder = preferredProvider && INTERNET_BACKED_SOURCE_PROVIDER_IDS.has(preferredProvider)
    ? [preferredProvider, ...Array.from(INTERNET_BACKED_SOURCE_PROVIDER_IDS).filter((providerId) => providerId !== preferredProvider)]
    : ['gemini', 'perplexity'];
  const attempts = [];

  providerOrder.forEach((providerId) => {
    if (providerId === 'gemini' && isProviderConfiguredForUse('gemini', cfg)) {
      attempts.push({
        providerId: 'gemini-google-search',
        model: getModelNameForProvider('gemini', cfg, '') || resolveVerifiedArticleGeminiModel(cfg),
        run: () => fetchGeminiGroundedWebResults({
          query,
          apiKey: cfg.gemini.key,
          model: getModelNameForProvider('gemini', cfg, '') || resolveVerifiedArticleGeminiModel(cfg),
          requestedCount,
        }),
      });
    }
    if (providerId === 'perplexity' && isProviderConfiguredForUse('perplexity', cfg)) {
      attempts.push({
        providerId: 'perplexity-search',
        model: String(cfg?.perplexity?.model || '').trim() || 'sonar',
        run: (signal) => fetchPerplexityGroundedWebResults({
          query,
          apiKey: cfg.perplexity.key,
          model: cfg.perplexity.model,
          signal,
          timeoutMs,
          requestedCount,
        }),
      });
    }
  });

  if (!attempts.length) {
    return {
      text: buildGroundedWebResultsFailureMessage({ query, providerAvailable: false }),
      providerId: 'grounded-web-results-block',
      model: '',
      urls: new Set(),
      query,
      workspaceId,
    };
  }

  let lastError = null;
  for (const attempt of attempts) {
    const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    try {
      const results = await withTimeout(attempt.run(abortController?.signal), timeoutMs, () => abortController?.abort());
      if (Array.isArray(results) && results.length) {
        return {
          text: buildGroundedWebResultsReply({ query, results, providerId: attempt.providerId, requestedCount, explicitCount }),
          providerId: attempt.providerId,
          model: attempt.model,
          urls: new Set(results.map((item) => String(item?.url || '').trim()).filter(Boolean)),
          anchoredSources: collectAnchoredSourcesFromResults(results),
          query,
          workspaceId,
        };
      }
    } catch (error) {
      lastError = error;
    }
  }

  return {
    text: buildGroundedWebResultsFailureMessage({ query, providerAvailable: true }),
    providerId: 'grounded-web-results-block',
    model: lastError ? 'retrieval-failed' : '',
    urls: new Set(),
    query,
    workspaceId,
    error: lastError,
  };
};

const VERIFIED_ARTICLE_SOURCE_DOMAIN_ALIASES = [
  { labels: ['וואלה', 'walla'], domains: ['walla.co.il'] },
  { labels: ['ynet', 'וויינט'], domains: ['ynet.co.il'] },
  { labels: ['מעריב', 'maariv'], domains: ['maariv.co.il'] },
  { labels: ['ישראל היום', 'israel hayom', 'israelhayom'], domains: ['israelhayom.co.il'] },
  { labels: ['mako', 'מאקו', 'n12', 'חדשות 12'], domains: ['mako.co.il', 'n12.co.il'] },
  { labels: ['רשת 13', 'ערוץ 13', 'חדשות 13', '13tv', 'reshet 13'], domains: ['13tv.co.il'] },
  { labels: ['ערוץ 7', 'ערוץ שבע', 'inn', 'israel national news'], domains: ['inn.co.il', 'israelnationalnews.com'] },
  { labels: ['i24news', 'i24 news'], domains: ['i24news.tv'] },
  { labels: ['חדשות 08', 'חדשות אפס שמונה 08', 'חדשות אפס שמונה', '08news'], domains: ['08news.co.il'] },
  { labels: ['הארץ', 'haaretz'], domains: ['haaretz.co.il'] },
  { labels: ['דה מרקר', 'the marker', 'themarker'], domains: ['themarker.com', 'themarker.co.il'] },
  { labels: ['כאן', 'kan'], domains: ['kan.org.il'] },
  { labels: ['גלובס', 'globes'], domains: ['globes.co.il'] },
  { labels: ['כלכליסט', 'calcalist'], domains: ['calcalist.co.il'] },
  { labels: ['ice'], domains: ['ice.co.il'] },
  { labels: ['סרוגים', 'srugim'], domains: ['srugim.co.il'] },
  { labels: ['דבר', 'davar', 'davar1'], domains: ['davar1.co.il'] },
  { labels: ['jerusalem post', 'jpost'], domains: ['jpost.com'] },
  { labels: ['times of israel', 'timesofisrael'], domains: ['timesofisrael.com'] },
  { labels: ['reuters'], domains: ['reuters.com'] },
  { labels: ['associated press', 'ap news', 'apnews'], domains: ['apnews.com'] },
  { labels: ['bbc'], domains: ['bbc.com', 'bbc.co.uk'] },
  { labels: ['cnn'], domains: ['cnn.com'] },
  { labels: ['new york times', 'nytimes'], domains: ['nytimes.com'] },
  { labels: ['wall street journal', 'wsj'], domains: ['wsj.com'] },
  { labels: ['washington post', 'washingtonpost'], domains: ['washingtonpost.com'] },
  { labels: ['the guardian', 'theguardian'], domains: ['theguardian.com'] },
  { labels: ['bloomberg'], domains: ['bloomberg.com'] },
  { labels: ['financial times', 'financialtimes', 'ft'], domains: ['financialtimes.com', 'ft.com'] },
  { labels: ['nbc news', 'nbcnews'], domains: ['nbcnews.com'] },
  { labels: ['cbs news', 'cbsnews'], domains: ['cbsnews.com'] },
  { labels: ['abc news', 'abcnews'], domains: ['abcnews.go.com'] },
  { labels: ['fox news', 'foxnews'], domains: ['foxnews.com'] },
  { labels: ['newsweek'], domains: ['newsweek.com'] },
  { labels: ['axios'], domains: ['axios.com'] },
  { labels: ['politico'], domains: ['politico.com'] },
];

const VERIFIED_ARTICLE_SECONDARY_DOMAIN_VALIDATION_REASON = 'לא נמצא אימות משני דומיינים ייחודיים של אתרי חדשות מוכרים לכתבה זו.';

const getVerifiedArticleSourceAliasEntryForDomain = (value = '') => {
  const domain = normalizeArticleText(extractArticleDomainFromUrl(value) || value);
  if (!domain) return null;

  return VERIFIED_ARTICLE_SOURCE_DOMAIN_ALIASES.find((entry) => entry.domains.some((knownDomain) => {
    const normalizedKnownDomain = normalizeArticleText(knownDomain);
    return normalizedKnownDomain && (domain === normalizedKnownDomain || domain.endsWith(`.${normalizedKnownDomain}`));
  })) || null;
};

const isKnownVerifiedArticleNewsDomain = (value = '') => Boolean(getVerifiedArticleSourceAliasEntryForDomain(value));

const isShortVerifiedArticleSourceLabel = (normalizedLabel = '') => normalizedLabel.length <= 3
  || (/^[a-z0-9]+$/.test(normalizedLabel) && normalizedLabel.length <= 4);

const hasVerifiedArticleSourceLabelMatch = (targetSource = '', normalizedLabel = '') => {
  if (!normalizedLabel) return false;
  if (targetSource === normalizedLabel) return true;
  if (!isShortVerifiedArticleSourceLabel(normalizedLabel)) return targetSource.includes(normalizedLabel);

  const escapedLabel = normalizedLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapedLabel}(?:$|[^\\p{L}\\p{N}])`, 'u').test(targetSource);
};

const isLikelyDirectVerifiedArticleUrl = (value = '') => {
  const normalizedUrl = normalizeArticleUrl(value);
  if (!normalizedUrl) return false;

  try {
    const parsed = new URL(normalizedUrl);
    const pathSegments = (parsed.pathname || '').split('/').filter(Boolean);
    return pathSegments.length >= 2 || pathSegments.some((segment) => /(?:\d{4,}|\.html?$)/i.test(segment));
  } catch {
    return false;
  }
};

const getVerifiedArticleSourceAliasDomains = (value = '') => {
  const targetSource = normalizeArticleText(value);
  if (!targetSource) return [];
  return VERIFIED_ARTICLE_SOURCE_DOMAIN_ALIASES
    .filter((entry) => entry.labels.some((label) => {
      const normalizedLabel = normalizeArticleText(label);
      return hasVerifiedArticleSourceLabelMatch(targetSource, normalizedLabel);
    }))
    .flatMap((entry) => entry.domains.map(normalizeArticleText).filter(Boolean));
};

const scoreVerifiedArticleSource = (source = {}, parsed = {}) => {
  const sourceTitle = normalizeArticleText(source?.title || '');
  const sourceUrlDomain = normalizeArticleText(extractArticleDomainFromUrl(source?.url) || '');
  const sourceDomain = normalizeArticleText(source?.summary || sourceUrlDomain || '');
  const targetTitle = normalizeArticleText(parsed?.title || '');
  const targetSource = normalizeArticleText(parsed?.sourceName || '');
  const targetSourceAliasDomains = getVerifiedArticleSourceAliasDomains(parsed?.sourceName || '');
  let score = 0;

  if (targetTitle && sourceTitle) {
    if (sourceTitle.includes(targetTitle) || targetTitle.includes(sourceTitle)) {
      score += 6;
    } else {
      const overlap = targetTitle
        .split(' ')
        .filter((token) => token.length > 3 && sourceTitle.includes(token)).length;
      score += overlap;
    }
  }

  if (targetSource && (sourceDomain.includes(targetSource) || sourceTitle.includes(targetSource))) {
    score += 4;
  }

  if (sourceUrlDomain && targetSourceAliasDomains.some((domain) => sourceUrlDomain === domain || sourceUrlDomain.endsWith(`.${domain}`))) {
    score += 4;
  }

  return score;
};

const selectPrimaryVerifiedArticleSource = (sources = [], parsed = {}) => {
  if (!Array.isArray(sources) || !sources.length) return null;
  const groundedUrlMatch = findVerifiedArticleSourceByUrl(sources, parsed?.url);
  if (groundedUrlMatch) return groundedUrlMatch;
  return null;
};

const findVerifiedArticleSourceByUrl = (sources = [], url = '') => {
  const normalizedUrl = normalizeArticleUrl(url);
  if (!normalizedUrl) return null;
  return (Array.isArray(sources) ? sources : []).find((source) => areVerifiedArticleUrlsEquivalent(source?.url, normalizedUrl)) || null;
};

const canRelaxVerifiedArticleSecondaryDomainValidation = ({
  validationError = '',
  primarySource = {},
  articleUrl = '',
  sources = [],
} = {}) => {
  if (validationError !== VERIFIED_ARTICLE_SECONDARY_DOMAIN_VALIDATION_REASON) return false;

  const primarySourceUrl = normalizeArticleUrl(primarySource?.url || '');
  const normalizedArticleUrl = normalizeArticleUrl(articleUrl);
  if (!primarySourceUrl || !normalizedArticleUrl) return false;
  if (!areVerifiedArticleUrlsEquivalent(primarySourceUrl, normalizedArticleUrl)) return false;
  if (!findVerifiedArticleSourceByUrl(sources, normalizedArticleUrl)) return false;

  return isKnownVerifiedArticleNewsDomain(primarySourceUrl) && isLikelyDirectVerifiedArticleUrl(primarySourceUrl);
};

const VERIFIED_ARTICLE_CANONICAL_REQUEST_TIMEOUT_MS = 750;
const VERIFIED_ARTICLE_CANONICAL_RESOLUTION_BUDGET_MS = 1500;

const getVerifiedArticleCanonicalResolutionTimeRemaining = (deadlineAt = 0) => {
  const safeDeadlineAt = Number(deadlineAt);
  if (!Number.isFinite(safeDeadlineAt) || safeDeadlineAt <= 0) {
    return VERIFIED_ARTICLE_CANONICAL_REQUEST_TIMEOUT_MS;
  }

  return Math.max(0, safeDeadlineAt - Date.now());
};

const fetchVerifiedArticleCanonicalUrlWithTimeout = async (url = '', options = {}, timeoutMs = 0) => {
  const safeTimeoutMs = Number(timeoutMs);
  if (!Number.isFinite(safeTimeoutMs) || safeTimeoutMs <= 0) return null;

  const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timeoutId = null;

  try {
    if (abortController) {
      timeoutId = globalThis.setTimeout(() => abortController.abort(), safeTimeoutMs);
      return await fetch(url, {
        ...options,
        signal: abortController.signal,
      });
    }

    return await Promise.race([
      fetch(url, options),
      new Promise((_, reject) => {
        timeoutId = globalThis.setTimeout(() => reject(new Error('Verified article canonical resolution timed out.')), safeTimeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== null) {
      globalThis.clearTimeout(timeoutId);
    }
  }
};

const resolveVerifiedArticleCanonicalUrlViaBrowser = async (value = '', { deadlineAt = 0 } = {}) => {
  const normalizedUrl = normalizeArticleUrl(value);
  if (!normalizedUrl || !isDesktopBrowserRetrievalAvailable()) return '';

  const timeRemainingMs = getVerifiedArticleCanonicalResolutionTimeRemaining(deadlineAt);
  const timeoutMs = Math.min(4000, timeRemainingMs);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return '';

  try {
    const snapshot = await fetchBrowserPageSnapshot(normalizedUrl, {
      timeoutMs,
      waitMs: 0,
      extractText: false,
      maxTextLength: 1000,
    });
    return normalizeArticleUrl(snapshot?.canonicalUrl || snapshot?.finalUrl || '');
  } catch {
    return '';
  }
};

const resolveVerifiedArticleCanonicalUrl = async (value = '', { deadlineAt = 0 } = {}) => {
  const normalizedUrl = normalizeArticleUrl(value);
  if (!normalizedUrl || typeof fetch !== 'function') return normalizedUrl;

  const attemptResolution = async (method = 'HEAD') => {
    const timeRemainingMs = getVerifiedArticleCanonicalResolutionTimeRemaining(deadlineAt);
    const timeoutMs = Math.min(VERIFIED_ARTICLE_CANONICAL_REQUEST_TIMEOUT_MS, timeRemainingMs);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return '';

    try {
      const response = await fetchVerifiedArticleCanonicalUrlWithTimeout(normalizedUrl, {
        method,
        redirect: 'follow',
        mode: 'no-cors',
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      }, timeoutMs);
      return normalizeArticleUrl(response?.url || '');
    } catch {
      return '';
    }
  };

  return await attemptResolution('HEAD')
    || await attemptResolution('GET')
    || await resolveVerifiedArticleCanonicalUrlViaBrowser(normalizedUrl, { deadlineAt })
    || normalizedUrl;
};

const createVerifiedArticleCanonicalUrlResolver = () => {
  const cache = new Map();
  const deadlineAt = Date.now() + VERIFIED_ARTICLE_CANONICAL_RESOLUTION_BUDGET_MS;

  return async (value = '') => {
    const normalizedUrl = normalizeArticleUrl(value);
    if (!normalizedUrl) return '';

    const cacheKey = canonicalizeVerifiedSourceUrl(normalizedUrl) || normalizedUrl;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    if (getVerifiedArticleCanonicalResolutionTimeRemaining(deadlineAt) <= 0) {
      cache.set(cacheKey, normalizedUrl);
      return normalizedUrl;
    }

    const resolvedUrl = normalizeArticleUrl(await resolveVerifiedArticleCanonicalUrl(normalizedUrl, { deadlineAt })) || normalizedUrl;
    cache.set(cacheKey, resolvedUrl);
    return resolvedUrl;
  };
};

// אימות-חיות אמיתי (דסקטופ בלבד): פקודת Rust check_url_live עושה HEAD→GET עם anti-SSRF
// ומחזירה status. מחזיר true ל-2xx/3xx, false לקישור מת, ו-null כשהפקודה לא זמינה
// (אתר/PWA או build ישן) — אז הקורא נופל לאימות המבני (JS) בלבד.
const checkVerifiedArticleUrlLive = async (value = '') => {
  const normalizedUrl = normalizeArticleUrl(value);
  if (!normalizedUrl) return null;
  const checkUrlLive = (typeof window !== 'undefined') ? window.desktopApp?.checkUrlLive : null;
  if (typeof checkUrlLive !== 'function') return null;
  try {
    const res = await checkUrlLive({ url: normalizedUrl, timeoutMs: 5000 });
    if (!res || typeof res !== 'object') return null;
    if (typeof res.ok === 'boolean') return res.ok;
    const status = Number(res.status) || 0;
    return status >= 200 && status < 400;
  } catch {
    return null;
  }
};

const prepareVerifiedArticleSourcesForFinalize = async ({
  article = {},
  sources = [],
  resolveCanonicalUrl = resolveVerifiedArticleCanonicalUrl,
} = {}) => {
  const safeSources = Array.isArray(sources) ? sources : [];
  const primarySource = selectPrimaryVerifiedArticleSource(safeSources, article);
  if (!primarySource) return { article, sources: safeSources };

  const canonicalPrimaryUrl = normalizeArticleUrl(await resolveCanonicalUrl(primarySource?.url));
  if (!canonicalPrimaryUrl) return { article, sources: safeSources };

  return {
    article: {
      ...article,
      url: normalizeArticleUrl(article?.url) || canonicalPrimaryUrl,
    },
    sources: safeSources.map((source) => (source?.url === primarySource?.url ? { ...source, url: canonicalPrimaryUrl } : source)),
  };
};

const reconcileVerifiedArticleCanonicalUrlMatch = async ({
  article = {},
  sources = [],
  resolveCanonicalUrl = resolveVerifiedArticleCanonicalUrl,
} = {}) => {
  const safeSources = Array.isArray(sources) ? sources : [];
  const normalizedArticleUrl = normalizeArticleUrl(article?.url);
  if (!normalizedArticleUrl) return { article, sources: safeSources, groundedParsedSource: null };

  const directMatch = findVerifiedArticleSourceByUrl(safeSources, normalizedArticleUrl);
  if (directMatch) {
    return {
      article: { ...article, url: normalizedArticleUrl },
      sources: safeSources,
      groundedParsedSource: directMatch,
    };
  }

  const resolvedArticleUrl = normalizeArticleUrl(await resolveCanonicalUrl(normalizedArticleUrl)) || normalizedArticleUrl;
  const canonicalArticleUrl = canonicalizeVerifiedSourceUrl(resolvedArticleUrl);
  if (!canonicalArticleUrl) {
    return {
      article: { ...article, url: normalizedArticleUrl },
      sources: safeSources,
      groundedParsedSource: null,
    };
  }

  let normalizedSources = safeSources;
  for (let index = 0; index < safeSources.length; index += 1) {
    const source = normalizedSources[index];
    const rawSourceUrl = normalizeArticleUrl(source?.url);
    if (!rawSourceUrl) continue;

    if (areVerifiedArticleUrlsEquivalent(rawSourceUrl, normalizedArticleUrl) || areVerifiedArticleUrlsEquivalent(rawSourceUrl, resolvedArticleUrl)) {
      return {
        article: { ...article, url: resolvedArticleUrl },
        sources: normalizedSources,
        groundedParsedSource: source,
      };
    }

    const resolvedSourceUrl = normalizeArticleUrl(await resolveCanonicalUrl(rawSourceUrl)) || rawSourceUrl;
    if (resolvedSourceUrl !== rawSourceUrl) {
      if (normalizedSources === safeSources) normalizedSources = safeSources.slice();
      normalizedSources[index] = { ...source, url: resolvedSourceUrl };
    }

    if (areVerifiedArticleUrlsEquivalent(resolvedSourceUrl, normalizedArticleUrl) || areVerifiedArticleUrlsEquivalent(resolvedSourceUrl, resolvedArticleUrl)) {
      return {
        article: { ...article, url: resolvedArticleUrl },
        sources: normalizedSources,
        groundedParsedSource: normalizedSources[index],
      };
    }
  }

  return {
    article: { ...article, url: resolvedArticleUrl },
    sources: normalizedSources,
    groundedParsedSource: null,
  };
};

const buildVerifiedArticleResultItem = (article = {}, providerId = '') => ({
  title: String(article?.title || article?.url || 'כתבה מאומתת').trim(),
  url: normalizeArticleUrl(article?.url),
  snippet: [String(article?.summary || '').trim(), String(article?.whyRelevant || '').trim()].filter(Boolean).join(' | '),
  summary: String(article?.sourceName || '').trim(),
  authors: [],
  year: '',
  citedBy: null,
  doi: extractDoiFromSource(article?.url),
  providerId,
});

const UNVERIFIED_NO_MATCH_URL_REPLACEMENT = '[קישור הוסר כי לא אומת]';
const sanitizeNoMatchReasonForDisplay = (reason = '') => String(reason || '')
  .trim()
  .replace(/\bhttps?:\/\/[^\s<>()"'\]\}]+/gi, UNVERIFIED_NO_MATCH_URL_REPLACEMENT);

const buildVerifiedArticleNoMatch = ({ reason = '', providerId = '', model = '' } = {}) => ({
  matchStatus: 'no-match',
  noMatchReason: sanitizeNoMatchReasonForDisplay(reason || 'לא נמצאה כתבה תואמת מספיק לבקשה.'),
  results: [],
  providerId,
  model,
});

const normalizeVerifiedArticleCandidate = (raw = {}) => ({
  title: String(raw?.title || '').trim(),
  summary: String(raw?.summary || '').trim(),
  sourceName: String(raw?.sourceName || raw?.source || raw?.publisher || '').trim(),
  whyRelevant: String(raw?.whyRelevant || raw?.relevance || '').trim(),
  url: normalizeArticleUrl(raw?.url || raw?.link || ''),
});

const sanitizeVerifiedArticleDebugText = (value = '') => String(value || '').trim().slice(0, 500);

const buildVerifiedArticleDebugCandidateDetail = (candidate = {}, { includeUrl = false } = {}) => ({
  title: sanitizeVerifiedArticleDebugText(candidate?.title),
  ...(includeUrl ? { url: normalizeArticleUrl(candidate?.url) } : {}),
  sourceName: sanitizeVerifiedArticleDebugText(candidate?.sourceName),
});

const buildVerifiedArticleDebugSourceDetail = (source = {}) => source ? ({
  title: sanitizeVerifiedArticleDebugText(source?.title),
  url: normalizeArticleUrl(source?.url),
  summary: sanitizeVerifiedArticleDebugText(source?.summary || source?.snippet),
}) : null;

const dispatchVerifiedArticleDebugEvent = (detail = {}) => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') return;
  const debugEnabled = /verified-articles-test\.html$/i.test(String(window.location?.pathname || ''))
    || window.localStorage?.getItem('wordflow_verified_article_debug') === 'true';
  if (!debugEnabled) return;
  const requestedArticleCount = Number(detail?.requestedArticleCount);
  const safeDetail = {
    providerId: sanitizeVerifiedArticleDebugText(detail?.providerId),
    model: sanitizeVerifiedArticleDebugText(detail?.model),
    requestedArticleCount: Number.isFinite(requestedArticleCount) ? requestedArticleCount : '',
  };
  if (detail?.candidate) {
    safeDetail.candidate = buildVerifiedArticleDebugCandidateDetail(detail.candidate, {
      includeUrl: detail?.acceptedCandidate === true || areVerifiedArticleUrlsEquivalent(detail?.candidate?.url, detail?.source?.url),
    });
  }
  if (detail?.source) safeDetail.source = buildVerifiedArticleDebugSourceDetail(detail.source);
  if (detail?.reason) safeDetail.reason = sanitizeNoMatchReasonForDisplay(sanitizeVerifiedArticleDebugText(detail.reason));
  if (Array.isArray(detail?.acceptedResultUrls)) {
    safeDetail.acceptedResultUrls = detail.acceptedResultUrls.map(normalizeArticleUrl).filter(Boolean);
  }
  window.dispatchEvent(new CustomEvent('wordflow-verified-article-debug', { detail: safeDetail }));
};

const extractVerifiedArticleCandidates = ({ parsed = {}, article = {}, articles = [] } = {}) => {
  const rawCandidates = Array.isArray(articles) && articles.length
    ? articles
    : Array.isArray(parsed) && parsed.length
      ? parsed
      : Array.isArray(parsed?.articles) && parsed.articles.length
        ? parsed.articles
        : Array.isArray(parsed?.results) && parsed.results.length
          ? parsed.results
          : [article];

  return rawCandidates
    .map(normalizeVerifiedArticleCandidate)
    .filter((candidate) => candidate.url || candidate.title || candidate.summary || candidate.sourceName || candidate.whyRelevant);
};

const extractVerifiedArticleCandidatesFromGroundedSources = (sources = []) => {
  const seenUrls = new Set();
  return (Array.isArray(sources) ? sources : [])
    .map((source) => normalizeVerifiedArticleCandidate({
      title: source?.title,
      summary: source?.snippet || source?.summary,
      sourceName: source?.summary || extractArticleDomainFromUrl(source?.url),
      url: source?.url,
    }))
    .filter((candidate) => {
      if (!candidate.url && !candidate.title) return false;
      const candidateKey = canonicalizeVerifiedSourceUrl(candidate.url) || normalizeArticleUrl(candidate.url) || candidate.title;
      if (seenUrls.has(candidateKey)) return false;
      seenUrls.add(candidateKey);
      return true;
    });
};

const finalizeVerifiedArticleCandidate = async ({
  queryMeta = analyzeArticleQuery(''),
  providerId = '',
  article = {},
  sources = [],
  resolveCanonicalUrl = resolveVerifiedArticleCanonicalUrl,
} = {}) => {
  const { article: preparedArticle, sources: preparedSources } = await prepareVerifiedArticleSourcesForFinalize({
    article,
    sources,
    resolveCanonicalUrl,
  });
  const {
    article: reconciledArticle,
    sources: reconciledSources,
    groundedParsedSource,
  } = await reconcileVerifiedArticleCanonicalUrlMatch({
    article: preparedArticle,
    sources: preparedSources,
    resolveCanonicalUrl,
  });
  const primarySource = groundedParsedSource || selectPrimaryVerifiedArticleSource(reconciledSources, reconciledArticle);
  if (!primarySource) {
    return { result: null, reason: 'לא נמצא source grounded/search result תואם ל-candidate.url או primarySource אמיתי מתוך מקורות ה-provider.', source: null };
  }

  const normalizedArticleUrl = normalizeArticleUrl(primarySource?.url || '');
  const requestedExactUrl = normalizeArticleUrl(queryMeta?.exactUrl || '');
  if (requestedExactUrl && !areVerifiedArticleUrlsEquivalent(normalizedArticleUrl, requestedExactUrl)) {
    return {
      result: null,
      reason: 'הכתבה שנמצאה אינה תואמת ל-URL המדויק שסופק.',
      source: primarySource,
    };
  }
  const groundedArticle = {
    title: String(primarySource?.title || normalizedArticleUrl || 'כתבה מאומתת').trim(),
    summary: String(primarySource?.snippet || '').trim(),
    sourceName: String(primarySource?.summary || extractArticleDomainFromUrl(primarySource?.url) || '').trim(),
    whyRelevant: '',
    url: normalizedArticleUrl,
  };

  // אימות-מבוסס-קישור (מחליף פסילה-לפי-reputation לאתרים לא-מוכרים):
  // (א) URL כתבה-ישירה, (ב) תואם בדיוק למקור שהספק החזיר (לא מומצא). בדסקטופ מוסיפים
  // (ג) קישור-חי בפועל. liveResult===false = קישור מת → לא סומכים; null = אימות-חי לא זמין
  // (אתר/PWA/build ישן) → נופלים לאימות המבני בלבד.
  const urlStructurallyVerified = Boolean(queryMeta?.expectsNewsArticle)
    && isLikelyDirectVerifiedArticleUrl(normalizedArticleUrl)
    && Boolean(findVerifiedArticleSourceByUrl(reconciledSources, normalizedArticleUrl));
  let trustUrlVerification = false;
  if (urlStructurallyVerified) {
    const liveResult = await checkVerifiedArticleUrlLive(normalizedArticleUrl);
    trustUrlVerification = liveResult !== false;
  }

  const validationError = validateArticleCandidate(queryMeta, groundedArticle, reconciledSources, '', trustUrlVerification);
  if (validationError && !canRelaxVerifiedArticleSecondaryDomainValidation({
    validationError,
    primarySource,
    articleUrl: normalizedArticleUrl,
    sources: reconciledSources,
  })) {
    return { result: null, reason: validationError, source: primarySource };
  }

  return {
    result: buildVerifiedArticleResultItem(groundedArticle, providerId),
    reason: '',
    source: primarySource,
  };
};

const finalizeVerifiedArticleRetrieval = async ({
  query = '',
  queryMeta = analyzeArticleQuery(query),
  providerId = '',
  model = '',
  rawText = '',
  rawMatchStatus = '',
  rawNoMatchReason = '',
  article = {},
  articles = [],
  parsed = {},
  sources = [],
  requestedArticleCount = extractRequestedArticleCount(query),
} = {}) => {
  const articleCount = clampRequestedVerifiedArticleCount(requestedArticleCount);
  const jsonCandidates = extractVerifiedArticleCandidates({ parsed, article, articles });
  const candidates = (jsonCandidates.length ? jsonCandidates : extractVerifiedArticleCandidatesFromGroundedSources(sources)).slice(0, articleCount * 2);

  if (normalizeVerifiedArticleMatchStatus(rawMatchStatus) === 'no-match' && !candidates.length) {
    dispatchVerifiedArticleDebugEvent({ providerId, model, requestedArticleCount: articleCount, reason: rawNoMatchReason || 'לא התקבלו candidates תקינים לאימות.', acceptedResultUrls: [] });
    return buildVerifiedArticleNoMatch({ reason: rawNoMatchReason, providerId, model });
  }

  const resolveCanonicalUrl = createVerifiedArticleCanonicalUrlResolver();
  const acceptedResults = [];
  const seenArticleUrls = new Set();
  let lastNoMatchReason = String(rawNoMatchReason || '').trim();

  for (const candidate of candidates) {
    const { result, reason, source } = await finalizeVerifiedArticleCandidate({
      queryMeta,
      providerId,
      article: candidate,
      sources,
      resolveCanonicalUrl,
    });
    if (!result) {
      if (reason) lastNoMatchReason = reason;
      dispatchVerifiedArticleDebugEvent({ providerId, model, requestedArticleCount: articleCount, candidate, source, reason });
      continue;
    }

    const articleKey = canonicalizeVerifiedSourceUrl(result.url) || normalizeArticleUrl(result.url);
    if (!articleKey) {
      dispatchVerifiedArticleDebugEvent({ providerId, model, requestedArticleCount: articleCount, candidate, source, reason: 'לא התקבל URL תקין לכתבה.' });
      continue;
    }
    if (seenArticleUrls.has(articleKey)) {
      dispatchVerifiedArticleDebugEvent({ providerId, model, requestedArticleCount: articleCount, candidate, source, reason: 'הכתבה כבר התקבלה מתוצאה קודמת.' });
      continue;
    }
    seenArticleUrls.add(articleKey);
    acceptedResults.push(result);
    dispatchVerifiedArticleDebugEvent({
      providerId,
      model,
      requestedArticleCount: articleCount,
      candidate,
      source,
      reason,
      acceptedCandidate: true,
      acceptedResultUrls: acceptedResults.map((item) => item.url),
    });
    if (acceptedResults.length >= articleCount) break;
  }

  if (!acceptedResults.length) {
    dispatchVerifiedArticleDebugEvent({ providerId, model, requestedArticleCount: articleCount, reason: lastNoMatchReason || 'לא התקבל מקור מאומת לכתבה עצמה.', acceptedResultUrls: [] });
    return buildVerifiedArticleNoMatch({ reason: lastNoMatchReason || 'לא התקבל מקור מאומת לכתבה עצמה.', providerId, model });
  }

  dispatchVerifiedArticleDebugEvent({ providerId, model, requestedArticleCount: articleCount, acceptedResultUrls: acceptedResults.map((item) => item.url) });

  return {
    matchStatus: 'match',
    noMatchReason: '',
    results: acceptedResults,
    requestedArticleCount: articleCount,
    providerId,
    model,
  };
};

const resolveVerifiedArticleGeminiModel = (cfg = DEFAULT_PROVIDER_CONFIG) => {
  const configuredModel = String(cfg?.gemini?.model || '').trim();
  if (!configuredModel || configuredModel === DEFAULT_PROVIDER_CONFIG.gemini.model) {
    return VERIFIED_ARTICLE_GEMINI_MODEL;
  }
  return configuredModel;
};

const getPreferredVerifiedArticleProviderIds = ({ cfg = DEFAULT_PROVIDER_CONFIG, preferredProviderId = '', strictProviderOverride = false } = {}) => {
  const normalizedPreferredProvider = String(preferredProviderId || '').trim().toLowerCase();

  if (VERIFIED_ARTICLE_PROVIDER_IDS.includes(normalizedPreferredProvider) && isProviderConfiguredForUse(normalizedPreferredProvider, cfg)) {
    return [normalizedPreferredProvider];
  }

  if (strictProviderOverride) {
    return [];
  }

  if (normalizedPreferredProvider === 'gemini') {
    return [];
  }

  const selectedProviders = getSelectedProviderIds(cfg)
    .filter((providerId) => VERIFIED_ARTICLE_PROVIDER_IDS.includes(providerId))
    .filter((providerId) => isProviderConfiguredForUse(providerId, cfg));

  if (selectedProviders.length) {
    return VERIFIED_ARTICLE_PROVIDER_PRIORITY.filter((providerId) => selectedProviders.includes(providerId));
  }

  return VERIFIED_ARTICLE_PROVIDER_PRIORITY.filter((providerId) => isProviderConfiguredForUse(providerId, cfg));
};

const fetchGeminiVerifiedArticleSource = async ({ query = '', queryMeta = analyzeArticleQuery(query), apiKey = '', model = VERIFIED_ARTICLE_GEMINI_MODEL, requestedArticleCount = extractRequestedArticleCount(query) } = {}) => {
  const safeQuery = String(query || '').trim();
  const safeApiKey = String(apiKey || '').trim();
  if (!safeQuery || !safeApiKey) return buildVerifiedArticleNoMatch({ providerId: 'gemini-article-search', model });

  const genAI = new GoogleGenerativeAI(safeApiKey);
  const generativeModel = genAI.getGenerativeModel({
    model: String(model || '').trim() || VERIFIED_ARTICLE_GEMINI_MODEL,
    tools: [{ googleSearch: {} }],
  });

  const articleCount = clampRequestedVerifiedArticleCount(requestedArticleCount);
  const result = await generativeModel.generateContent(buildVerifiedArticlePrompt(safeQuery, 'gemini', queryMeta, articleCount));
  const response = result.response;
  const rawText = String(response?.text?.() || '').trim();
  const parsed = parseVerifiedArticleJson(rawText);
  const sources = extractGeminiVerifiedArticleSources(response, articleCount);

  return finalizeVerifiedArticleRetrieval({
    query: safeQuery,
    queryMeta,
    providerId: 'gemini-article-search',
    model: String(model || '').trim() || VERIFIED_ARTICLE_GEMINI_MODEL,
    rawText,
    rawMatchStatus: parsed?.matchStatus,
    rawNoMatchReason: parsed?.noMatchReason,
    parsed,
    articles: Array.isArray(parsed?.articles) ? parsed.articles : [],
    article: {
      title: String(parsed?.title || '').trim(),
      summary: String(parsed?.summary || '').trim(),
      sourceName: String(parsed?.sourceName || '').trim(),
      whyRelevant: String(parsed?.whyRelevant || '').trim(),
      url: normalizeArticleUrl(parsed?.url),
    },
    sources,
    requestedArticleCount: articleCount,
  });
};

const fetchPerplexityVerifiedArticleSource = async ({ query = '', queryMeta = analyzeArticleQuery(query), apiKey = '', model = 'sonar-pro', signal, timeoutMs = 0, requestedArticleCount = extractRequestedArticleCount(query) } = {}) => {
  const safeQuery = String(query || '').trim();
  const safeApiKey = String(apiKey || '').trim();
  if (!safeQuery || !safeApiKey) return buildVerifiedArticleNoMatch({ providerId: 'perplexity-article-search', model });
  const articleCount = clampRequestedVerifiedArticleCount(requestedArticleCount);

  const data = await requestJsonOverHttp({
    url: 'https://api.perplexity.ai/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${safeApiKey}`,
    },
    body: JSON.stringify({
      model: String(model || '').trim() || 'sonar-pro',
      messages: [
        {
          role: 'system',
          content: `Return JSON only. Prefer up to ${articleCount} grounded journalistic news articles from news sites when the request asks for כתבה/כתבות. Reject official press releases, institute analysis pages, blogs, social posts, videos, and category pages. If no sufficiently matching article exists, return matchStatus=no-match.`,
        },
        {
          role: 'user',
          content: buildVerifiedArticlePrompt(safeQuery, 'perplexity', queryMeta, articleCount),
        },
      ],
      max_tokens: Math.max(600, Math.min(1800, 360 * articleCount)),
      temperature: 0,
      stream: false,
      disable_search: false,
      web_search_options: {
        search_mode: 'web',
      },
      return_related_questions: false,
    }),
    signal,
    timeoutMs,
  });

  const rawText = extractOpenAiMessageText(data?.choices?.[0]?.message?.content);
  const parsed = parseVerifiedArticleJson(rawText);
  const sources = extractPerplexityVerifiedArticleSources(data, articleCount);

  return finalizeVerifiedArticleRetrieval({
    query: safeQuery,
    queryMeta,
    providerId: 'perplexity-article-search',
    model: String(model || '').trim() || 'sonar-pro',
    rawText,
    rawMatchStatus: parsed?.matchStatus,
    rawNoMatchReason: parsed?.noMatchReason,
    parsed,
    articles: Array.isArray(parsed?.articles) ? parsed.articles : [],
    article: {
      title: String(parsed?.title || '').trim(),
      summary: String(parsed?.summary || '').trim(),
      sourceName: String(parsed?.sourceName || '').trim(),
      whyRelevant: String(parsed?.whyRelevant || '').trim(),
      url: normalizeArticleUrl(parsed?.url),
    },
    sources,
    requestedArticleCount: articleCount,
  });
};

const fetchLocalBridgeVerifiedArticleSource = async ({ query = '', queryMeta = analyzeArticleQuery(query), preferredProviderId = '', signal, timeoutMs = 0, requestedArticleCount = extractRequestedArticleCount(query) } = {}) => {
  const safeQuery = String(query || '').trim();
  if (!safeQuery || !queryMeta.expectsNewsArticle || !canUseLocalVerifiedArticleBridge()) {
    return buildVerifiedArticleNoMatch({ providerId: '', model: '' });
  }
  const articleCount = clampRequestedVerifiedArticleCount(requestedArticleCount);

  const normalizedPreferredProviderId = String(preferredProviderId || '').trim().toLowerCase();
  const requestedProviderIds = normalizedPreferredProviderId === 'perplexity'
    ? ['perplexity']
    : normalizedPreferredProviderId === 'gemini'
      ? ['gemini']
      : ['perplexity', 'gemini'];

  let lastError = null;
  let lastNoMatchReason = '';
  let lastResolvedProviderId = '';
  let lastResolvedModel = '';
  const bridgeBaseUrls = getLocalVerifiedArticleBridgeUrls();

  for (const requestedProviderId of requestedProviderIds) {
    for (const bridgeBaseUrl of bridgeBaseUrls) {
      try {
        const payload = await requestJsonOverHttp({
          url: `${bridgeBaseUrl}/api/article`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: safeQuery,
            provider: requestedProviderId,
            count: articleCount,
          }),
          signal,
          timeoutMs,
        });

        if (!payload?.ok) {
          throw new Error(String(payload?.error || 'Local verified article bridge request failed.').trim());
        }

        const resolvedProviderId = String(payload?.provider || requestedProviderId).trim().toLowerCase() === 'perplexity'
          ? 'perplexity-article-search'
          : 'gemini-article-search';
        const resolvedModel = String(payload?.model || '').trim();
        lastResolvedProviderId = resolvedProviderId;
        lastResolvedModel = resolvedModel;

        if (String(payload?.matchStatus || '').trim().toLowerCase() !== 'match') {
          if (payload?.noMatchReason) {
            lastNoMatchReason = String(payload.noMatchReason || '').trim();
          }
          break;
        }

        const bridgeArticle = payload?.article || {};
        const bridgeArticles = Array.isArray(payload?.articles) ? payload.articles : [];
        const bridgeSources = Array.isArray(payload?.sources) ? payload.sources.map(normalizePerplexityVerifiedSource).filter(Boolean) : [];
        const finalizedBridgeResult = await finalizeVerifiedArticleRetrieval({
          query: safeQuery,
          queryMeta,
          providerId: resolvedProviderId,
          model: resolvedModel,
          rawMatchStatus: payload?.matchStatus,
          rawNoMatchReason: payload?.noMatchReason,
          article: bridgeArticle,
          articles: bridgeArticles,
          sources: bridgeSources,
          requestedArticleCount: articleCount,
        });
        if (!finalizedBridgeResult?.results?.length) {
          lastNoMatchReason = String(payload?.noMatchReason || 'לא התקבל מקור מאומת לכתבה עצמה.').trim();
          break;
        }

        return finalizedBridgeResult;
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (lastError && !lastNoMatchReason) {
    throw lastError;
  }

  return buildVerifiedArticleNoMatch({
    reason: lastNoMatchReason,
    providerId: lastResolvedProviderId,
    model: lastResolvedModel,
  });
};

const buildVerifiedSourceFailureMessage = ({ query = '', providerAvailable = false, academic = false, articleRequest = false, noMatchReason = '', scholarKeyMissing = false } = {}) => {
  const lines = [SOURCE_GROUNDING_FAILURE_TOKEN];
  const safeNoMatchReason = sanitizeNoMatchReasonForDisplay(noMatchReason);
  lines.push(articleRequest
    ? (providerAvailable
      ? 'לא נמצאה כתבת חדשות עיתונאית תואמת לשאילתה, ולכן לא החזרתי מקור קרוב-אבל-שגוי.'
      : 'אין כרגע ספק אחזור מאומת לכתבות חדשות. הגדר Gemini או Perplexity כדי לקבל כתבה אמיתית או no-match ברור.')
    : (providerAvailable
      ? (academic
        ? 'לא נמצאו מקורות אקדמיים מאומתים לשאילתה, ולכן לא יצרתי מקורות על סמך המודל.'
        : 'לא נמצאו מקורות מאומתים לשאילתה, ולכן לא יצרתי מקורות על סמך המודל.')
      : (academic
        ? 'אין כרגע ספק אחזור מאומת למקורות אקדמיים. הגדר SerpAPI עבור Google Scholar כדי לשלוף מאמרים ומקורות אקדמיים אמיתיים, או הגדר Perplexity למסלול מחקר מאומת כללי.'
        : 'אין כרגע ספק אחזור מאומת למקורות. הגדר Perplexity או SerpAPI כדי לקבל תוצאות אמיתיות.')));
  if (academic && scholarKeyMissing) {
    lines.push('Google Scholar מזוהה כמסלול המתאים לבקשה הזאת, אבל חסר מפתח SerpAPI בהגדרות Google Scholar / SerpAPI. לאחר שמירת המפתח, בקשות כמו מאמרים על, מחקרים על, bibliography או peer reviewed יישלחו קודם ל-Scholar.');
  }
  if (safeNoMatchReason) lines.push(`סיבת אי-ההתאמה: ${safeNoMatchReason}`);
  if (query) lines.push(`שאילתת החיפוש שנבדקה: ${query}`);
  return lines.join('\n\n');
};

const formatVerifiedSourceItem = (item = {}, index = 0) => {
  const lines = [`${index + 1}. ${item.title || item.url || 'מקור מאומת'}`];
  const publicationSummary = String(item.summary || '').trim();
  if (publicationSummary) lines.push(`פרטי פרסום: ${publicationSummary}`);
  else if (Array.isArray(item.authors) && item.authors.length) lines.push(`מחברים: ${item.authors.join(', ')}`);
  if (item.citedBy) lines.push(`צוטט על ידי: ${item.citedBy}`);
  if (item.doi) lines.push(`DOI: ${item.doi}`);
  if (item.url) lines.push(`קישור: ${item.url}`);
  if (item.snippet) lines.push(`תקציר: ${item.snippet}`);
  return lines.join('\n');
};

const buildVerifiedSourceReply = ({ query = '', results = [], providerId = '', academic = false, articleRequest = false, requestedArticleCount = 1 } = {}) => {
  const providerLabel = providerId === 'serpapi-scholar'
    ? 'Google Scholar / SerpAPI'
    : (providerId === 'gemini-article-search' || providerId === 'gemini-google-search')
      ? 'Gemini + Google Search'
      : 'Perplexity Search';
  const articleCount = clampRequestedVerifiedArticleCount(requestedArticleCount);
  const resultCount = Array.isArray(results) ? results.length : 0;
  return [
    `${academic ? 'מקורות אקדמיים' : articleRequest ? (articleCount > 1 ? 'כתבות מאומתות' : 'כתבה מאומתת') : 'מקורות'} בלבד${query ? ` עבור: ${query}` : ''}`,
    articleRequest
      ? (articleCount > 1
        ? `התבקשו ${articleCount} כתבות. הוחזרו ${resultCount} כתבות חדשות עיתונאיות שאותרו ישירות דרך ${providerLabel}${resultCount < articleCount ? ', כי לא נמצאו עוד כתבות שעברו אימות נאמן לבקשה' : ''}.`
        : `הוחזרה רק כתבת חדשות עיתונאית שאותרה ישירות דרך ${providerLabel}. אם לא הייתה התאמה נאמנה מספיק, הוחזר no-match.`)
      : `הוחזרו רק פריטים שאותרו ישירות דרך ${providerLabel}, בלי השלמה חופשית של המודל.`,
    ...results.map((item, index) => formatVerifiedSourceItem(item, index)),
    articleRequest
      ? 'לא הוחזרה כתבה שלא הופיעה בפועל בתוצאות האחזור או שלא עמדה בכללי ההתאמה.'
      : 'לא הוספתי מקורות שלא הופיעו בתוצאות האחזור.',
  ].filter(Boolean).join('\n\n');
};

const resolveVerifiedArticleSourceReply = async ({ query = '', queryMeta = analyzeArticleQuery(query), cfg = DEFAULT_PROVIDER_CONFIG, timeoutMs = 0, workspaceId = '', preferredProviderId = '', strictProviderOverride = false, requestedCount = null } = {}) => {
  const baseQuery = String(query || '').trim();
  const requestedArticleCount = clampRequestedVerifiedArticleCount(requestedCount || extractRequestedArticleCount(baseQuery));
  const searchQueries = buildArticleSearchQueryVariants(baseQuery, queryMeta);
  const preferredProviderIds = getPreferredVerifiedArticleProviderIds({ cfg, preferredProviderId, strictProviderOverride });
  const attempts = [];

  preferredProviderIds.forEach((providerId) => {
    if (providerId === 'gemini') {
      const geminiModel = resolveVerifiedArticleGeminiModel(cfg);
      attempts.push({
        providerId: 'gemini-article-search',
        model: geminiModel,
        run: (searchQuery = baseQuery) => fetchGeminiVerifiedArticleSource({
          query: searchQuery,
          queryMeta,
          apiKey: cfg.gemini.key,
          model: geminiModel,
          requestedArticleCount,
        }),
      });
      return;
    }

    if (providerId === 'perplexity') {
      attempts.push({
        providerId: 'perplexity-article-search',
        model: String(cfg?.perplexity?.model || '').trim() || 'sonar-pro',
        run: (searchQuery = baseQuery, signal) => fetchPerplexityVerifiedArticleSource({
          query: searchQuery,
          queryMeta,
          apiKey: cfg.perplexity.key,
          model: cfg.perplexity.model,
          signal,
          timeoutMs,
          requestedArticleCount,
        }),
      });
    }
  });

  if (!strictProviderOverride && queryMeta.expectsNewsArticle && baseQuery && canUseLocalVerifiedArticleBridge()) {
    attempts.push({
      providerId: 'local-verified-article-bridge',
      model: '',
      run: (searchQuery = baseQuery, signal) => fetchLocalBridgeVerifiedArticleSource({
        query: searchQuery,
        queryMeta,
        preferredProviderId,
        signal,
        timeoutMs,
        requestedArticleCount,
      }),
    });
  }

  if (!attempts.length || !queryMeta.expectsNewsArticle || !baseQuery) {
    return {
      text: buildVerifiedSourceFailureMessage({ query: baseQuery, providerAvailable: false, articleRequest: true }),
      providerId: 'verified-source-block',
      model: '',
      urls: new Set(),
      query: baseQuery,
      workspaceId,
      academic: false,
    };
  }

  let lastError = null;
  let lastNoMatchReason = '';
  for (const attempt of attempts) {
    const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    try {
      for (const searchQuery of searchQueries) {
        const result = await withTimeout(attempt.run(searchQuery, abortController?.signal), timeoutMs, () => abortController?.abort());
        const results = Array.isArray(result?.results) ? result.results : [];
        if (results.length) {
          return {
            text: buildVerifiedSourceReply({ query: baseQuery, results, providerId: result?.providerId || attempt.providerId, articleRequest: true, requestedArticleCount }),
            providerId: result?.providerId || attempt.providerId,
            model: result?.model || attempt.model,
            urls: new Set(results.map((item) => String(item?.url || '').trim()).filter(Boolean)),
            anchoredSources: collectAnchoredSourcesFromResults(results),
            query: baseQuery,
            workspaceId,
            academic: false,
          };
        }
        if (result?.matchStatus === 'no-match' && result.noMatchReason) {
          lastNoMatchReason = String(result.noMatchReason || '').trim();
        }
      }
    } catch (error) {
      lastError = error;
    }
  }

  return {
    text: buildVerifiedSourceFailureMessage({
      query: baseQuery,
      providerAvailable: attempts.length > 0,
      articleRequest: true,
      noMatchReason: lastNoMatchReason,
    }),
    providerId: 'verified-source-block',
    model: lastError ? 'retrieval-failed' : '',
    urls: new Set(),
    query: baseQuery,
    workspaceId,
    academic: false,
    error: lastError,
  };
};

const resolveVerifiedSourceReply = async ({
  userPrompt = '',
  documentContext = '',
  extraSystemPrompt = '',
  skillId = '',
  isAcademicTask,
  cfg = DEFAULT_PROVIDER_CONFIG,
  timeoutMs = 0,
  preferredProviderId = '',
  strictProviderOverride = false,
  stripFollowOnWork = false,
  logEvent = null,
  assignmentRequirements = null,
  sourceQueryOverride = '',
  researchTopic = '',
  blockAssignmentPromptFallback = false,
} = {}) => {
  const workspaceId = String(getWorkspaceAutomation().activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  const query = extractVerifiedSourceQuery({
    userPrompt,
    documentContext,
    fallbackQuery: getLastVerifiedSourceQuery({ workspaceId }),
    workspaceId,
    stripFollowOnWork,
    sourceQueryOverride,
    researchTopic,
    blockAssignmentPromptFallback,
  });
  const normalizedSkillId = String(skillId || '').trim().toLowerCase();
  const articleQueryMeta = analyzeArticleQuery(query);
  const academicSignalText = [userPrompt, extraSystemPrompt, documentContext, normalizedSkillId].filter(Boolean).join('\n');
  const academicSignalDetected = ACADEMIC_SOURCE_SIGNAL_PATTERN.test(academicSignalText);
  const academic = typeof isAcademicTask === 'boolean'
    ? isAcademicTask
    : (SOURCE_GROUNDING_SKILL_IDS.has(normalizedSkillId)
      || (academicSignalDetected && !articleQueryMeta.expectsNewsArticle));
  const normalizedRequirements = normalizeAssignmentRequirements(assignmentRequirements || extractAssignmentRequirements({
    userPrompt,
    documentContext,
    extraSystemPrompt,
  }));
  const requestedSourceLimit = getRequestedSourceRetrievalLimit(normalizedRequirements, {
    academic,
    articleRequest: !academic && articleQueryMeta.expectsNewsArticle,
  });
  const scholarKey = String(cfg?.scholar?.key || '').trim();
  const scholarKeyMissing = academic && !scholarKey;
  const emitSourceLog = typeof logEvent === 'function' ? logEvent : null;
  const normalizedPreferredProviderId = String(preferredProviderId || '').trim().toLowerCase();

  if (!query) {
    emitSourceLog?.('verified-source-query-missing', 'אחזור מקורות נחסם: querySource=blocked-assignment missing researchTopic', {
      state: 'error',
      query,
      academic,
      requestedSourceLimit,
      assignmentRequirements: buildAssignmentRequirementLogPayload(normalizedRequirements),
      blockedToAvoidAssignmentAsQuery: true,
    });
    return {
      text: buildMissingResearchTopicMessage(),
      providerId: 'verified-source-missing-query',
      model: 'blocked-assignment-query',
      urls: new Set(),
      query,
      workspaceId,
      academic,
    };
  }

  if (!academic && articleQueryMeta.expectsNewsArticle) {
    emitSourceLog?.('verified-source-article-route', `מסלול אחזור כתבות מאומתות: provider=Gemini/Perplexity query="${query}"`, {
      state: 'running',
      query,
      selectedSourceProvider: 'gemini/perplexity',
      fallbackAttempted: true,
      requestedSourceLimit,
      assignmentRequirements: buildAssignmentRequirementLogPayload(normalizedRequirements),
    });
    return resolveVerifiedArticleSourceReply({
      query,
      queryMeta: articleQueryMeta,
      cfg,
      timeoutMs,
      workspaceId,
      preferredProviderId,
      strictProviderOverride,
      requestedCount: requestedSourceLimit,
    });
  }

  const attempts = [];
  if (!strictProviderOverride && academic && String(cfg?.scholar?.provider || '').trim() === 'serpapi' && scholarKey) {
    attempts.push({
      providerId: 'serpapi-scholar',
      model: 'google_scholar',
      run: (signal) => fetchScholarVerifiedSources({
        query,
        apiKey: scholarKey,
        signal,
        timeoutMs,
        limit: requestedSourceLimit,
      }),
      endpointHost: 'serpapi.com',
      endpoint: 'https://serpapi.com/search.json?engine=google_scholar',
    });
  }
  if ((!strictProviderOverride || normalizedPreferredProviderId === 'perplexity') && String(cfg?.perplexity?.key || '').trim()) {
    attempts.push({
      providerId: 'perplexity-search',
      model: String(cfg?.perplexity?.model || '').trim() || 'sonar',
      run: (signal) => fetchPerplexityVerifiedSources({
        query,
        apiKey: cfg.perplexity.key,
        model: cfg.perplexity.model,
        signal,
        timeoutMs,
        academic,
        limit: requestedSourceLimit,
      }),
      endpointHost: 'api.perplexity.ai',
      endpoint: 'https://api.perplexity.ai/chat/completions',
    });
  }
  // route 2 cascade — Gemini best-effort אחרון: כשאין Scholar/Perplexity (משתמש ברירת-מחדל),
  // googleSearch של Gemini מחזיר מקורות אמיתיים מ-grounding (לא מומצאים). לאקדמי זה לא Scholar,
  // ולכן ה-prompt מורה "אמת לפני הגשה", אבל זה מונע חסימה מוחלטת.
  if ((!strictProviderOverride || normalizedPreferredProviderId === 'gemini') && isProviderConfiguredForUse('gemini', cfg)) {
    const geminiSourceModel = resolveVerifiedArticleGeminiModel(cfg);
    attempts.push({
      providerId: 'gemini-google-search',
      model: geminiSourceModel,
      run: () => fetchGeminiGroundedWebResults({
        query,
        apiKey: cfg.gemini.key,
        model: geminiSourceModel,
        requestedCount: requestedSourceLimit,
      }),
      endpointHost: 'generativelanguage.googleapis.com',
      endpoint: 'gemini-google-search-grounding',
    });
  }

  if (!attempts.length || !query) {
    emitSourceLog?.('verified-source-provider-missing', `אחזור מקורות נחסם: providerAvailable=false academic=${academic} scholarKeyMissing=${scholarKeyMissing} query="${query}"`, {
      state: 'error',
      query,
      providerAvailable: false,
      academic,
      scholarKeyMissing,
      resultCount: 0,
      requestedSourceLimit,
      assignmentRequirements: buildAssignmentRequirementLogPayload(normalizedRequirements),
      blockedToAvoidHallucinatedSources: true,
    });
    return {
      text: buildVerifiedSourceFailureMessage({ query, providerAvailable: false, academic, scholarKeyMissing }),
      providerId: 'verified-source-block',
      model: '',
      urls: new Set(),
      query,
      workspaceId,
      academic,
    };
  }

  let lastError = null;
  for (const attempt of attempts) {
    const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    try {
      emitSourceLog?.('verified-source-provider-start', `בודק מקור מאומת: provider=${attempt.providerId} model=${attempt.model} endpoint=${attempt.endpoint} query="${query}"`, {
        state: 'running',
        provider: attempt.providerId,
        model: attempt.model,
        query,
        selectedSourceProvider: attempt.providerId,
        endpoint: attempt.endpoint,
        endpointHost: attempt.endpointHost,
        requestedSourceLimit,
        assignmentRequirements: buildAssignmentRequirementLogPayload(normalizedRequirements),
      });
      const results = await withTimeout(attempt.run(abortController?.signal), timeoutMs, () => abortController?.abort());
      emitSourceLog?.('verified-source-provider-result', `תוצאת אחזור מקורות: provider=${attempt.providerId} resultCount=${results.length} fallback=${results.length ? 'no' : 'next-provider-if-available'}`, {
        state: results.length ? 'success' : 'error',
        provider: attempt.providerId,
        model: attempt.model,
        query,
        selectedSourceProvider: attempt.providerId,
        endpoint: attempt.endpoint,
        endpointHost: attempt.endpointHost,
        resultCount: results.length,
        requestedSourceLimit,
        assignmentRequirements: buildAssignmentRequirementLogPayload(normalizedRequirements),
        fallbackAttempted: !results.length && attempts.indexOf(attempt) < attempts.length - 1,
      });
      if (results.length) {
        return {
          text: buildVerifiedSourceReply({ query, results, providerId: attempt.providerId, academic }),
          providerId: attempt.providerId,
          model: attempt.model,
          urls: new Set(results.map((item) => String(item?.url || '').trim()).filter(Boolean)),
          anchoredSources: collectAnchoredSourcesFromResults(results),
          query,
          workspaceId,
          academic,
        };
      }
    } catch (error) {
      lastError = error;
      emitSourceLog?.('verified-source-provider-error', `שגיאת אחזור מקורות: provider=${attempt.providerId} endpoint=${attempt.endpointHost} error="${error?.message || String(error)}" fallback=${attempts.indexOf(attempt) < attempts.length - 1 ? 'yes' : 'no'}`, {
        state: 'error',
        provider: attempt.providerId,
        model: attempt.model,
        query,
        selectedSourceProvider: attempt.providerId,
        endpoint: attempt.endpoint,
        endpointHost: attempt.endpointHost,
        resultCount: 0,
        requestedSourceLimit,
        assignmentRequirements: buildAssignmentRequirementLogPayload(normalizedRequirements),
        errorMessage: error?.message || String(error),
        fallbackAttempted: attempts.indexOf(attempt) < attempts.length - 1,
      });
    }
  }

  emitSourceLog?.('verified-source-output-blocked', `לא נמצאו מקורות מאומתים: query="${query}" providerAvailable=true blockedToAvoidHallucinatedSources=true`, {
    state: 'error',
    query,
    providerAvailable: true,
    academic,
    resultCount: 0,
    requestedSourceLimit,
    assignmentRequirements: buildAssignmentRequirementLogPayload(normalizedRequirements),
    errorMessage: lastError?.message || '',
    blockedToAvoidHallucinatedSources: true,
  });
  return {
    text: buildVerifiedSourceFailureMessage({ query, providerAvailable: true, academic, scholarKeyMissing }),
    providerId: 'verified-source-block',
    model: lastError ? 'retrieval-failed' : '',
    urls: new Set(),
    query,
    workspaceId,
    academic,
    error: lastError,
  };
};

const buildWorkspaceAutomationInstructions = ({ disabled = false } = {}) => {
  const automation = getWorkspaceAutomation();
  if (disabled || !automation.enabled) return '';

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
    'autopilot-full': 'עבוד במצב AUTOPILOT מלא עם קריאת preflight: קודם נתח את המשימה, בחר לבד אילו סוכנים, ספקים, מודלים, הוראות stage-level וכמה סבבים באמת נדרשים, ורק אחר כך הרץ את הצוות. אל תמחזר אותו pipeline לכל מטלה.',
    'manager-auto': 'עבוד במצב AUTOPILOT מלא: קודם תכנן, אחר כך קבע לבד אילו תפקידים נדרשים, איזה מודל מתאים לכל שלב, ובאיזה סדר להפעיל אותם. החזר תהליך מתואם וסופי.',
    'circular-team': 'עבוד כצוות מעגלי: הסוכנים לא חייבים לרוץ רק בקו ישר. אם מתגלים פערים, אפשר להחזיר את הכתיבה, המבנה או הליטוש לסבב נוסף עד שהתוצר מתייצב.',
    'manager-pipeline': 'עבוד כצוות אוטומטי: קודם מנהל העבודה מפרק את הבקשה, אחר כך החוקר מאתר מקורות, לאחר מכן מעצב המבנה מארגן את השלד, הכותב מנסח, ולבסוף המגיה מלטש. החזר למשתמש תוצאה סופית מגובשת.',
    'design-first': 'עבוד בסדר הבא: מבנה וארגון, אחר כך ניסוח תוכן, אחר כך ליטוש. אם המשתמש ביקש מבנה מפורש או שכבר קיים שלד במסמך, התחל ממנו; אחרת אל תכפה שלד ברור על דעת עצמך.',
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
    AUTOPILOT_MANAGER_WORKFLOW_MODES.has(automation.workflowMode) && decisionMode === 'manager'
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

export const parseStructuredEditBatchResponse = (value = '') => {
  const normalizeStructuredBatchReplacement = (replacementValue) => {
    if (typeof replacementValue === 'string') return replacementValue.trim();
    if (Array.isArray(replacementValue) || (replacementValue && typeof replacementValue === 'object')) {
      try {
        const serialized = JSON.stringify(replacementValue, null, 2);
        return typeof serialized === 'string' ? serialized.trim() : '';
      } catch {
        return '';
      }
    }
    return String(replacementValue ?? '').trim();
  };
  const parsed = safeJsonParse(value, null);
  const rawEdits = Array.isArray(parsed?.edits)
    ? parsed.edits
    : Array.isArray(parsed)
      ? parsed
      : [];

  return rawEdits
    .map((entry) => ({
      targetId: String(entry?.targetId || '').trim(),
      replacement: normalizeStructuredBatchReplacement(entry?.replacement ?? entry?.replacementText),
    }))
    .filter((entry) => entry.targetId && entry.replacement);
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
const isDocumentDesignerAgent = (agent = {}) => /(document-designer|מעצב מסמך|סגנון אישי|human)/i.test(`${String(agent?.id || '')} ${String(agent?.name || '')}`);

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

const getConfiguredModelForProvider = (providerId = '', cfg = null) => {
  const safeCfg = cfg && typeof cfg === 'object' ? cfg : getProviderConfig();
  const fallbackModel = DEFAULT_PROVIDER_CONFIG?.[providerId]?.model || '';
  return normalizeProviderModelName(providerId, String(safeCfg?.[providerId]?.model || fallbackModel || '').trim());
};

const inferProviderFromModelHint = (modelName = '', allowedProviders = [], cfg = null) => {
  const cleanModel = String(modelName || '').trim();
  if (!cleanModel) return '';

  const safeCfg = cfg && typeof cfg === 'object' ? cfg : getProviderConfig();
  const requestedProviders = normalizeProviderIds(allowedProviders, '')
    .filter((providerId) => KNOWN_PROVIDER_IDS.includes(providerId));
  const pool = requestedProviders.length ? requestedProviders : [...KNOWN_PROVIDER_IDS];

  const exactMatch = pool.find((providerId) => {
    const normalizedRequestedModel = normalizeProviderModelName(providerId, cleanModel).toLowerCase();
    const configuredModel = getConfiguredModelForProvider(providerId, safeCfg).toLowerCase();
    return Boolean(configuredModel) && normalizedRequestedModel === configuredModel;
  });
  if (exactMatch) return exactMatch;

  const normalizedModel = cleanModel.toLowerCase().replace(/^models\//, '');
  if (/^(gemini|learnlm)/.test(normalizedModel) && pool.includes('gemini')) return 'gemini';
  if (/^claude/.test(normalizedModel) && pool.includes('claude')) return 'claude';
  if (/^(gpt|o\d|chatgpt)/.test(normalizedModel) && pool.includes('openai')) return 'openai';
  if (/^(sonar|pplx|llama-3\.1-sonar)/.test(normalizedModel) && pool.includes('perplexity')) return 'perplexity';
  return '';
};

export const isProviderModelChoiceCompatible = (providerId = '', modelName = '', cfg = null) => {
  const safeProvider = String(providerId || '').trim();
  const normalizedModel = normalizeProviderModelName(safeProvider, String(modelName || '').trim());
  if (!safeProvider || !KNOWN_PROVIDER_IDS.includes(safeProvider) || !normalizedModel) return false;
  if (safeProvider === 'custom' || safeProvider === 'ollama') return true;

  const inferredProvider = inferProviderFromModelHint(normalizedModel, KNOWN_PROVIDER_IDS, cfg);
  return !inferredProvider || inferredProvider === safeProvider;
};

const chooseProviderForAgent = (agent = {}, cfg = null, preferredProviders = []) => {
  const safeCfg = cfg && typeof cfg === 'object' ? cfg : getProviderConfig();
  const requestedPool = normalizeProviderIds(preferredProviders, '');
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
  const inferredProvider = inferProviderFromModelHint(agent?.model || '', pool, safeCfg);
  if (inferredProvider) return inferredProvider;
  const preferences = roleKey === 'researcher'
    ? ['scholar', 'perplexity', 'gemini', 'openai', 'claude', 'groq', 'custom', 'ollama']
    : roleKey === 'proofreader'
      ? ['claude', 'openai', 'gemini', 'groq', 'custom', 'ollama', 'perplexity', 'scholar']
      : roleKey === 'writer'
        ? ['openai', 'claude', 'gemini', 'groq', 'custom', 'ollama', 'perplexity', 'scholar']
        : roleKey === 'designer'
          ? ['claude', 'openai', 'gemini', 'groq', 'custom', 'ollama', 'perplexity', 'scholar']
          : ['gemini', 'openai', 'claude', 'groq', 'custom', 'ollama', 'perplexity', 'scholar'];

  return preferences.find((providerId) => pool.includes(providerId)) || pool[0] || safeCfg.active;
};

const formatProviderRoutingSummaryLabel = (providerId = '', modelName = '', cfg = null) => {
  const safeCfg = cfg && typeof cfg === 'object' ? cfg : getProviderConfig();
  const providerLabel = getProviderLabelMap(safeCfg)[providerId] || providerId;
  const cleanModel = normalizeProviderModelName(providerId, modelName);
  return cleanModel ? `${providerLabel}/${cleanModel}` : providerLabel;
};

export const buildWorkspaceRoutingSummary = (agents = [], cfg = null, preferredProviders = []) => {
  const safeCfg = cfg && typeof cfg === 'object' ? cfg : getProviderConfig();
  const enabledAgents = Array.isArray(agents) && agents.length
    ? agents.filter((agent) => agent && agent.enabled !== false)
    : getDefaultRoleAgents();

  const routeLabels = [...new Set(enabledAgents
    .map((agent) => {
      const providerId = chooseProviderForAgent(agent, safeCfg, preferredProviders);
      if (!providerId) return '';
      const explicitProvider = String(agent?.provider || '').trim();
      const explicitModel = String(agent?.model || '').trim();
      const resolvedModel = explicitModel && (explicitProvider === providerId || inferProviderFromModelHint(explicitModel, [providerId], safeCfg) === providerId)
        ? normalizeProviderModelName(providerId, explicitModel)
        : getConfiguredModelForProvider(providerId, safeCfg);
      return formatProviderRoutingSummaryLabel(providerId, resolvedModel, safeCfg);
    })
    .filter(Boolean))];

  if (!routeLabels.length) return 'אין ספקים זמינים';
  return routeLabels.length > 2
    ? `${routeLabels.slice(0, 2).join(' + ')} + עוד`
    : routeLabels.join(' + ');
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
    'researcher-visual': ['researcher-visual', 'visual-research', 'visual research', 'חוקר חזותי', 'חקר חזותי'],
    'document-designer': ['document-designer', 'document designer', 'מעצב מסמך', 'סגנון אישי'],
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
    if (canonical === 'researcher-visual') {
      return enabledAgents.find((agent) => isVisualResearchAgent(agent)) || null;
    }
    if (canonical === 'document-designer') {
      return enabledAgents.find((agent) => isDocumentDesignerAgent(agent)) || null;
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
const GLOBAL_STRUCTURE_OPT_OUT_PATTERN = /(?:^|[\s,;:!?])(?:בלי\s+מבנה(?:\s+בכלל)?|ללא\s+מבנה(?:\s+בכלל)?|אין\s+צורך\s+במבנה(?:\s+בכלל)?|בלי\s+שלד(?:\s+בכלל)?|ללא\s+שלד(?:\s+בכלל)?|בלי\s+outline(?:\s+בכלל)?|בלי\s+כותרות\s+בכלל|ללא\s+כותרות\s+בכלל|בלי\s+פרקים\s+בכלל|ללא\s+פרקים\s+בכלל|no\s+structure\s+at\s+all|no\s+structure|without\s+structure|no\s+outline|without\s+outline|no\s+headings\s+at\s+all|without\s+headings\s+entirely|no\s+sections\s+at\s+all|without\s+sections\s+entirely)/i;
const hasExplicitStructureOptOut = (text = '') => GLOBAL_STRUCTURE_OPT_OUT_PATTERN.test(String(text || ''));
const ACADEMIC_SOURCE_SIGNAL_PATTERN = /(אקדמ|סמינר|עבוד(?:ת|ה)\s+סמינר|seminar\s+paper|ביבליוגרפ|bibliograph(?:y|ies)|ציטוט|citation|references?|academic\s+sources?|scholarly\s+sources?|academic\s+articles?|research\s+papers?|journal\s+articles?|literature|doi|scholar|סקולר|peer[-\s]?reviewed|google\s+scholar|מאמר(?:ים)?\s+אקדמ(?:י(?:ים)?)?\s+(?:על|בנושא|אודות)|מחקר(?:ים)?\s+(?:על|בנושא|אודות)|מאמר\s+אקדמי|כתב(?:י)?\s*עת(?:\s+שפיט(?:ים)?)?|מחקר(?:ים)?|ספרות|apa|mla)/i;
const isVisualResearchAgent = (agent = {}) => /(researcher-visual|visual-research|visual research|חוקר חזותי|חקר חזותי)/i.test(`${String(agent?.id || '')} ${String(agent?.name || '')}`);
const VISUAL_RESEARCH_DIRECT_PATTERN = /(חקר\s+חזותי|מחקר\s+חזותי|חיפוש\s+חזותי|מקורות\s+חזותיים|חומר(?:י|ים)?\s+עזר\s+חזותי(?:ים)?|חומר(?:י|ים)?\s+חזותי(?:ים)?|visual\s+research|visual\s+sources?|visual\s+materials?)/i;
const VISUAL_RESEARCH_STRONG_SIGNAL_PATTERN = /(youtube|vimeo|video|videos|וידאו|סרטון|סרטונים|סרטוני|screenshot|screen\s?shot|צילום\s+מסך|diagram|diagrams|תרשים|תרשימים|walkthrough|walkthroughs)/i;
const VISUAL_RESEARCH_WEAK_SIGNAL_PATTERN = /(demos|prototypes|wireframes|presentations|מצגות)/i;
const VISUAL_RESEARCH_REQUEST_SIGNAL_PATTERN = /(חפש|חיפוש|מצא|תאתר|אתר|אסוף|סקור|בדוק|תן|תביא|הבא|צריך|צריכה|צריכים|מחפש|מחפשת|מבקש|מבקשת|research|search|source|sources|references|examples|tutorial|tutorials|videos?|screenshots?)/i;
const VISUAL_RESEARCH_WEAK_REQUEST_SIGNAL_PATTERN = /(חפש|חיפוש|מצא|תאתר|אתר|אסוף|סקור|בדוק|תן|תביא|הבא|צריך|צריכה|צריכים|מחפש|מחפשת|מבקש|מבקשת|research|search|source|sources|references|examples|benchmark|tutorial|tutorials)/i;
const hasExplicitVisualResearchNeed = (text = '') => {
  const value = String(text || '');
  return VISUAL_RESEARCH_DIRECT_PATTERN.test(value)
    || (VISUAL_RESEARCH_STRONG_SIGNAL_PATTERN.test(value) && VISUAL_RESEARCH_REQUEST_SIGNAL_PATTERN.test(value))
    || (VISUAL_RESEARCH_WEAK_SIGNAL_PATTERN.test(value) && VISUAL_RESEARCH_WEAK_REQUEST_SIGNAL_PATTERN.test(value));
};
const hasVisualResearchGapInContext = (text = '') => /(פער(?:ים)?\s+חזותי(?:ים)?|חסר(?:ים)?\s+(?:חומר(?:י|ים)?\s+חזותי(?:ים)?|מקור(?:ות)?\s+חזותי(?:ים)?|צילום(?:י)?\s+מסך|screenshots?|סרטו(?:ן|נים)|וידאו|diagram|diagrams|תרשים|תרשימים)|missing\s+visual|need\s+visual|need\s+screenshots?|need\s+video)/i.test(String(text || ''));
const HEBREW_ASSIGNMENT_NUMBER_WORDS = new Map([
  ['אחד', 1],
  ['אחת', 1],
  ['שני', 2],
  ['שניים', 2],
  ['שתיים', 2],
  ['שתי', 2],
  ['שלושה', 3],
  ['שלוש', 3],
  ['ארבעה', 4],
  ['ארבע', 4],
  ['חמישה', 5],
  ['חמש', 5],
  ['שישה', 6],
  ['שש', 6],
  ['שבעה', 7],
  ['שבע', 7],
  ['שמונה', 8],
  ['תשעה', 9],
  ['תשע', 9],
  ['עשרה', 10],
  ['עשר', 10],
  ['one', 1],
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
  ['ten', 10],
]);

const normalizeAssignmentNumber = (value = '') => {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return null;
  const numericValue = Number(text.replace(/[^0-9]/g, ''));
  if (Number.isFinite(numericValue) && numericValue > 0) return numericValue;
  return HEBREW_ASSIGNMENT_NUMBER_WORDS.get(text) || null;
};

const findAssignmentNumber = (text = '', patterns = [], { max = 50 } = {}) => {
  const source = String(text || '');
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match) continue;
    const rawValue = match.slice(1).find((value) => value !== undefined && value !== null && String(value).trim());
    const numericValue = normalizeAssignmentNumber(rawValue);
    if (numericValue) return Math.max(1, Math.min(max, numericValue));
  }
  return null;
};

const normalizeAssignmentStringList = (values = []) => [...new Set((Array.isArray(values) ? values : [])
  .map((value) => String(value || '').trim())
  .filter(Boolean))];

const normalizeSectionWordBudgets = (values = []) => (Array.isArray(values) ? values : [])
  .map((item, index) => ({
    label: String(item?.label || `section-${index + 1}`).trim(),
    words: Number(item?.words || 0),
  }))
  .filter((item) => item.words > 0);

const normalizeSourceRequirements = (values = []) => (Array.isArray(values) ? values : [])
  .map((item) => ({
    kind: String(item?.kind || '').trim(),
    count: Number.isFinite(Number(item?.count)) && Number(item.count) > 0 ? Number(item.count) : null,
    notes: String(item?.notes || '').trim(),
    required: item?.required !== false,
  }))
  .filter((item) => item.kind)
  .filter((item, index, list) => list.findIndex((candidate) => candidate.kind === item.kind && candidate.notes === item.notes) === index);

const addUniqueRequirement = (items = [], requirement = {}) => {
  const normalized = normalizeSourceRequirements([requirement])[0];
  if (!normalized) return;
  const existing = items.find((item) => item.kind === normalized.kind);
  if (existing) {
    existing.count = Math.max(Number(existing.count || 0), Number(normalized.count || 0)) || existing.count || normalized.count;
    existing.required = existing.required || normalized.required;
    existing.notes = normalizeAssignmentStringList([existing.notes, normalized.notes]).join(' ');
    return;
  }
  items.push(normalized);
};

const extractSectionWordBudgets = (text = '', wordLimit = null) => {
  const source = String(text || '');
  const budgets = [];
  const seen = new Set();
  const addBudget = (words, label = '') => {
    const numericWords = Number(words || 0);
    if (!numericWords || numericWords === Number(wordLimit || 0)) return;
    const key = `${label || budgets.length + 1}:${numericWords}`;
    if (seen.has(key)) return;
    seen.add(key);
    budgets.push({ label: String(label || `section-${budgets.length + 1}`).trim().slice(0, 80), words: numericWords });
  };

  source.split(/\n+/).forEach((line) => {
    const cleanLine = String(line || '').replace(/\s+/g, ' ').trim();
    if (!cleanLine) return;
    for (const match of cleanLine.matchAll(/(?:^|[^\d])(\d{3,5})\s*(?:מילים|words?)/giu)) {
      addBudget(match[1], cleanLine.replace(match[0], '').replace(/[()\[\]:;.,-]+$/g, '').trim() || 'section');
    }
    const slashMatch = cleanLine.match(/\b(\d{3,5})\s*\/\s*(\d{3,5})(?:\s*\/\s*(\d{3,5}))?(?:\s*\/\s*(\d{3,5}))?\b/);
    if (slashMatch && /(?:section|פרק|חלק|סעיף|מילים|words?)/i.test(cleanLine)) {
      slashMatch.slice(1).filter(Boolean).forEach((words, index) => addBudget(words, `section-${index + 1}`));
    }
  });

  return normalizeSectionWordBudgets(budgets);
};

const extractAssignmentSourceRequirements = (text = '', academicSources = null) => {
  const source = String(text || '');
  const requirements = [];
  if (academicSources) {
    addUniqueRequirement(requirements, { kind: 'academic-article', count: academicSources, notes: 'מכסת מאמרים/מקורות אקדמיים כללית', required: true });
  }
  if (/(?:defin(?:e|ing|ition)\s+(?:of\s+)?["“”']?international\s+crisis|הגדר(?:ה|ת)\s+[^\n]{0,80}משבר\s+בינלאומי|משבר\s+בינלאומי[^\n]{0,80}הגדר)/i.test(source)) {
    addUniqueRequirement(requirements, { kind: 'academic-definition-article', count: 1, notes: 'מאמר אקדמי שמגדיר international crisis', required: true });
  }
  if (/(?:chosen\s+case|case\s+study|מקרה\s+נבחר|האירוע\s+הנבחר|המקרה)[^\n]{0,140}(?:academic\s+article|מאמר\s+אקדמי)|(?:academic\s+article|מאמר\s+אקדמי)[^\n]{0,140}(?:chosen\s+case|case\s+study|מקרה\s+נבחר|האירוע\s+הנבחר|המקרה)/i.test(source)) {
    addUniqueRequirement(requirements, { kind: 'academic-case-article', count: 1, notes: 'מאמר אקדמי נוסף על המקרה/המשבר הנבחר', required: true });
  }
  if (/(?:last|past)\s+six\s+years|(?:שש|6)\s+השנים\s+האחרונות|(?:מה)?שנים\s+האחרונות/i.test(source)) {
    addUniqueRequirement(requirements, { kind: 'recent-academic-article', count: 1, notes: 'לפחות מאמר אקדמי אחד מהשנים האחרונות', required: true });
  }
  if (/(?:current\s+data|נתונים\s+עדכניים|נתוני\s+רקע|מקורות\s+עדכניים)/i.test(source)) {
    addUniqueRequirement(requirements, { kind: 'current-data-source', count: 1, notes: 'מקור לנתונים עדכניים/רקע', required: true });
  }
  if (/(?:media\s+item|פריט\s+תקשורתי|כתבה|סרטון)[^\n]{0,80}(?:link|קישור|url)|(?:link|קישור|url)[^\n]{0,80}(?:media\s+item|פריט\s+תקשורתי|כתבה|סרטון)/i.test(source)) {
    addUniqueRequirement(requirements, { kind: 'media-item-link', count: 1, notes: 'פריט תקשורתי עם קישור ושאלות', required: true });
  }
  if (/(?:image|photo|תמונה|צילום)[^\n]{0,120}(?:guest|lecturer|מרצה|אורח|אורחת)|(?:guest|lecturer|מרצה|אורח|אורחת)[^\n]{0,120}(?:image|photo|תמונה|צילום)/i.test(source)) {
    addUniqueRequirement(requirements, { kind: 'image', count: 1, notes: 'תמונה להצעת מרצה אורח/ת', required: true });
  }
  if (/(?:news|posts?|כתבות|ידיעות|פוסטים|רשתות\s+חברתיות)[^\n]{0,120}(?:supplement|allowed|not\s+substitutes?|מותר|משלים|לא\s+תחליף)/i.test(source)) {
    addUniqueRequirement(requirements, { kind: 'supplementary-media-news-posts', count: null, notes: 'חדשות/פוסטים מותרים כהשלמה בלבד, לא במקום מאמרים אקדמיים', required: false });
  }
  return normalizeSourceRequirements(requirements);
};

const normalizeAssignmentRequirements = (requirements = {}) => {
  const sourceRequirements = normalizeSourceRequirements(requirements.sourceRequirements);
  const normalized = {
    contentItems: requirements.contentItems || null,
    academicSources: requirements.academicSources || null,
    directQuotes: requirements.directQuotes || null,
    wordLimit: requirements.wordLimit || null,
    pageLimit: requirements.pageLimit || null,
    outputFormat: String(requirements.outputFormat || '').trim(),
    citationStyle: String(requirements.citationStyle || '').trim(),
    needsCoverPage: requirements.needsCoverPage === true,
    needsAiUseDeclaration: requirements.needsAiUseDeclaration === true,
    sectionWordBudgets: normalizeSectionWordBudgets(requirements.sectionWordBudgets),
    requiredComponents: normalizeAssignmentStringList(requirements.requiredComponents),
    legalHypotheticals: requirements.legalHypotheticals || null,
    sourceRequirements,
    themes: requirements.themes || null,
    subthemes: requirements.subthemes || null,
    needsEthicsSection: requirements.needsEthicsSection === true,
    needsAppendix: requirements.needsAppendix === true,
    qualitativeContentAnalysis: requirements.qualitativeContentAnalysis === true,
  };
  const quotaValues = [normalized.contentItems, normalized.academicSources, normalized.directQuotes, normalized.themes, normalized.subthemes, normalized.wordLimit]
    .filter((value) => Number(value) > 0);
  const structuredRequirementPresent = Boolean(
    normalized.pageLimit
    || normalized.outputFormat
    || normalized.citationStyle
    || normalized.needsCoverPage
    || normalized.needsAiUseDeclaration
    || normalized.sectionWordBudgets.length
    || normalized.requiredComponents.length
    || normalized.legalHypotheticals
    || normalized.sourceRequirements.length,
  );
  normalized.hasExplicitRequirements = quotaValues.length > 0
    || structuredRequirementPresent
    || normalized.needsEthicsSection
    || normalized.needsAppendix
    || normalized.qualitativeContentAnalysis;
  normalized.hasSourceQuotas = Number(normalized.contentItems) > 0
    || Number(normalized.academicSources) > 0
    || Number(normalized.directQuotes) > 0
    || normalized.sourceRequirements.some((item) => item.required === true);
  normalized.sourceRequirementCategories = normalized.sourceRequirements.map((item) => item.kind);
  normalized.isHighQuotaAssignment = Number(normalized.contentItems) > VERIFIED_SOURCE_RESULT_LIMIT
    || Number(normalized.directQuotes) > VERIFIED_SOURCE_RESULT_LIMIT
    || Number(normalized.academicSources) > VERIFIED_SOURCE_RESULT_LIMIT;
  return normalized;
};

const SOURCE_QUOTA_ACADEMIC_KIND_PATTERN = /(academic|scholar|journal|peer|doi|citation|quote|bibliograph|syllabus|אקדמ|ציטוט|ביבליוגרפ|סילבוס|מאמר)/i;
const SOURCE_QUOTA_GENERAL_AGENT_PATTERN = /(general|web|news|media|visual|image|content|article|רשת|חדשות|תקשורת|חזותי|תמונה|כתבות|תוכן)/i;
const SOURCE_QUOTA_ACADEMIC_AGENT_PATTERN = /(academic|scholar|citation|literature|bibliograph|אקדמי|אקדמית|ציטוט|ביבליוגרפ|ספרות|מאמרים)/i;

const resolveAssignmentSourceQuotaRoute = (requirements = {}, agentContext = {}) => {
  const normalized = normalizeAssignmentRequirements(requirements);
  const sourceKinds = normalized.sourceRequirements.map((item) => item.kind).filter(Boolean);
  const academicSourceKinds = sourceKinds.filter((kind) => SOURCE_QUOTA_ACADEMIC_KIND_PATTERN.test(kind));
  const nonAcademicSourceKinds = sourceKinds.filter((kind) => !SOURCE_QUOTA_ACADEMIC_KIND_PATTERN.test(kind));
  const hasAcademicQuota = Number(normalized.academicSources) > 0
    || Number(normalized.directQuotes) > 0
    || academicSourceKinds.length > 0;
  const hasNonAcademicQuota = Number(normalized.contentItems) > 0
    || nonAcademicSourceKinds.length > 0;
  const agentMarker = [agentContext.agentId, agentContext.agentLabel, agentContext.agentName]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');
  const explicitlyNonAcademicAgent = /(?:non[-\s]?academic|לא\s+אקדמי)/i.test(agentMarker);
  const prefersGeneralRoute = explicitlyNonAcademicAgent || SOURCE_QUOTA_GENERAL_AGENT_PATTERN.test(agentMarker);
  const prefersAcademicRoute = !explicitlyNonAcademicAgent && SOURCE_QUOTA_ACADEMIC_AGENT_PATTERN.test(agentMarker);
  const route = hasNonAcademicQuota && !prefersAcademicRoute
    ? 'groundedWeb'
    : hasAcademicQuota
      ? 'strict'
      : hasNonAcademicQuota
        ? 'groundedWeb'
        : 'none';
  // dual-track: כשמטלה דורשת גם מקורות אקדמיים וגם כתבות/חדשות, מריצים את שני המסלולים.
  // ה-route הראשי נשאר לתאימות/לוג, אבל needsAcademic/needsGeneral שולטים בפועל באחזור.
  const needsAcademic = hasAcademicQuota && !explicitlyNonAcademicAgent;
  const needsGeneral = hasNonAcademicQuota;
  return {
    route,
    needsAcademic,
    needsGeneral,
    dualTrack: needsAcademic && needsGeneral,
    hasSourceQuota: hasAcademicQuota || hasNonAcademicQuota,
    contentItems: normalized.contentItems,
    sourceKinds,
    academicSourceKinds,
    nonAcademicSourceKinds,
    hasAcademicQuota,
    hasNonAcademicQuota,
    prefersAcademicRoute,
    prefersGeneralRoute,
  };
};

const buildSourceQueryKindSuffix = (requirements = {}) => {
  const normalized = normalizeAssignmentRequirements(requirements);
  const sourceKinds = normalized.sourceRequirements.map((item) => item.kind).filter(Boolean);
  if (Number(normalized.contentItems) > 0) return 'כתבות ומקורות תוכן';
  if (Number(normalized.academicSources) > 0 || Number(normalized.directQuotes) > 0 || sourceKinds.some((kind) => SOURCE_QUOTA_ACADEMIC_KIND_PATTERN.test(kind))) {
    return 'מאמרים אקדמיים';
  }
  return sourceKinds.slice(0, 2).join(' ');
};

const normalizeWorkflowStageFallbackQuery = (value = '') => {
  const rawText = normalizeSourceSearchText(value);
  const query = normalizeSourceQueryOverride(value);
  if (!query) return '';
  if (rawText.length > 160 && query === rawText.slice(0, 220).trim()) return '';
  return query;
};

const buildWorkflowStageSourceQueryOverride = ({ stageGoal = '', stageInstruction = '', stageAgent = null, stageLabel = '', assignmentRequirements = null, fallbackResearchTopic = '', fallbackUserPrompt = '' } = {}) => {
  const sourceFocused = isSourceFocusedWorkflowAgent({
    agentId: stageAgent?.id || '',
    agentLabel: stageLabel || stageAgent?.label || '',
    agentName: stageAgent?.name || '',
  });
  if (!sourceFocused) return { query: '', querySource: 'prompt', blocked: false };

  const kindSuffix = buildSourceQueryKindSuffix(assignmentRequirements);
  const buildQueryResult = (researchTopic, querySource) => ({
    query: [researchTopic, kindSuffix].filter(Boolean).join(' ').slice(0, 260).trim(),
    querySource,
    blocked: false,
  });

  const candidates = [
    { source: 'stageInstruction', value: stageInstruction },
    { source: 'stageGoal', value: stageGoal },
  ];
  for (const candidate of candidates) {
    const researchTopic = extractExplicitResearchSubjectQuery(candidate.value);
    if (!researchTopic) continue;
    return buildQueryResult(researchTopic, candidate.source);
  }

  const fallbackCandidates = [
    { source: 'researchTopic', value: fallbackResearchTopic },
    { source: 'cleanUserPrompt', value: fallbackUserPrompt },
  ];
  for (const candidate of fallbackCandidates) {
    const researchTopic = normalizeWorkflowStageFallbackQuery(candidate.value);
    if (!researchTopic) continue;
    return buildQueryResult(researchTopic, candidate.source);
  }

  return { query: '', querySource: 'blocked-assignment', blocked: true };
};

const extractAssignmentRequirements = ({ userPrompt = '', documentContext = '', extraSystemPrompt = '', structureConstraintText = '' } = {}) => {
  const text = [userPrompt, structureConstraintText, documentContext, extraSystemPrompt]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n');
  if (!text) return normalizeAssignmentRequirements();

  const contentItemsFromExplicitContent = findAssignmentNumber(text, [
    /(?:^|[^\d])(\d{1,2})\s*(?:פריטי?\s+תוכן|כתבות|ידיעות|content\s+items?)(?=$|\s|[.,;:!?])/iu,
    /(?:פריטי?\s+תוכן|כתבות|ידיעות|content\s+items?)\s*(?:בהיקף\s+של\s*)?(\d{1,2})(?=$|\s|[.,;:!?])/iu,
  ], { max: VERIFIED_SOURCE_RESULT_HARD_LIMIT });
  const contentItemsFromArticles = findAssignmentNumber(text, [
    /(?:^|[^\d])(\d{1,2})\s*(?:articles?|news\s+articles?)(?=$|\s|[.,;:!?])/iu,
    /(?:articles?|news\s+articles?)\s*(\d{1,2})(?=$|\s|[.,;:!?])/iu,
  ], { max: VERIFIED_SOURCE_RESULT_HARD_LIMIT });
  const contentItems = contentItemsFromExplicitContent || (Number(contentItemsFromArticles) >= 6 ? contentItemsFromArticles : null);
  const academicSources = findAssignmentNumber(text, [
    /(?:לפחות|at\s+least)\s*(\d{1,2}|[א-ת]+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:מאמרים?\s+אקדמ(?:י(?:ים)?)?|מקורות?\s+אקדמ(?:י(?:ים)?)?|מאמרים?\s+מהסילבוס|academic\s+(?:articles?|sources?)|scholarly\s+sources?|articles?\s+from\s+(?:the\s+)?syllabus)/iu,
    /(\d{1,2}|[א-ת]+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:לפחות\s*)?(?:מאמרים?\s+אקדמ(?:י(?:ים)?)?|מקורות?\s+אקדמ(?:י(?:ים)?)?|מאמרים?\s+מהסילבוס|academic\s+(?:articles?|sources?)|scholarly\s+sources?|articles?\s+from\s+(?:the\s+)?syllabus)/iu,
    /(\d{1,2}|שלושה|שלוש)\s+לפחות/iu,
  ], { max: VERIFIED_SOURCE_RESULT_HARD_LIMIT });
  const directQuotes = findAssignmentNumber(text, [
    /(?:סה["״']?כ\s*)?(\d{1,2}|[א-ת]+)\s*(?:ציטוטים?\s+ישירים?|direct\s+quotes?|quotes?)(?=$|\s|[.,;:!?])/iu,
    /(?:ציטוטים?\s+ישירים?|direct\s+quotes?|quotes?)\s*(?:סה["״']?כ\s*)?(\d{1,2}|[א-ת]+)(?=$|\s|[.,;:!?])/iu,
  ], { max: 30 });
  const wordLimit = findAssignmentNumber(text, [
    /(?:עד|לא\s+יותר\s+מ-|לא\s+יותר\s+מ|up\s+to|max(?:imum)?|no\s+more\s+than)\s*(\d{3,5})\s*(?:מילים|words?)/iu,
    /(\d{3,5})\s*(?:מילים|words?)/iu,
  ], { max: 20000 });
  const themes = findAssignmentNumber(text, [
    /(?:^|[^\d])(\d{1,2}|[א-ת]+)\s*(?:תמות|themes?)(?=$|\s|[.,;:!?])/iu,
  ], { max: 20 });
  const subthemes = findAssignmentNumber(text, [
    /(?:^|[^\d])(\d{1,2}|[א-ת]+)\s*(?:תתי[-\s]?תמות|sub[-\s]?themes?)(?=$|\s|[.,;:!?])/iu,
  ], { max: 30 });
  const pageLimit = findAssignmentNumber(text, [
    /(?:עד|לא\s+יותר\s+מ-|לא\s+יותר\s+מ|up\s+to|max(?:imum)?|no\s+more\s+than)\s*(\d{1,2}|[א-ת]+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:עמודים|דפים|pages?)/iu,
    /(\d{1,2}|[א-ת]+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:עמודים|דפים|pages?)/iu,
  ], { max: 50 });
  const legalHypotheticals = findAssignmentNumber(text, [
    /(\d{1,2}|[א-ת]+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:אירועים|מקרים|קייסים|hypotheticals?|legal\s+hypotheticals?)/iu,
    /(?:אירועים|מקרים|קייסים|hypotheticals?|legal\s+hypotheticals?)\s*(?:משפטיים\s*)?(\d{1,2}|[א-ת]+|one|two|three|four|five|six|seven|eight|nine|ten)/iu,
  ], { max: 20 });
  const outputFormat = /(?:docx|\.docx|word\s+document|קובץ\s+word|מסמך\s+word)/i.test(text) ? 'docx' : '';
  const citationStyle = /\bAPA\b/i.test(text) ? 'APA' : (/\bMLA\b/i.test(text) ? 'MLA' : '');
  const needsCoverPage = /(?:cover\s+page|דף\s+שער|עמוד\s+שער|שער)/i.test(text);
  const needsAiUseDeclaration = /(?:AI[-\s]?use\s+declaration|declaration\s+of\s+AI|הצהרת\s+שימוש\s+(?:ב-)?(?:AI|בינה\s+מלאכותית)|גילוי\s+שימוש\s+(?:ב-)?(?:AI|בינה\s+מלאכותית))/i.test(text);
  const requiredComponents = normalizeAssignmentStringList([
    /(?:definition|background|הגדרות|רקע)[^\n]{0,120}(?:current\s+data|נתונים\s+עדכניים)/i.test(text) ? 'definitions-background-current-data' : '',
    legalHypotheticals ? 'constitutionality-discussion-for-each-hypothetical' : '',
    /(?:summary|סיכום)[^\n]{0,120}(?:Q&A|שאלות\s+ותשובות|שתי\s+שאלות|2\s+שאלות)/i.test(text) ? 'article-summary-and-two-q-and-a' : '',
    /(?:appendices|appendix|נספחים|נספח)/i.test(text) ? 'academic-articles-as-appendices' : '',
    /(?:media\s+item|פריט\s+תקשורתי)/i.test(text) ? 'media-item-with-questions' : '',
    /(?:guest\s+lecturer|מרצה\s+אורח|הרצאת\s+אורח)/i.test(text) ? 'guest-lecturer-proposal' : '',
    /(?:integrative\s+summary|סיכום\s+אינטגרטיבי)/i.test(text) ? 'integrative-summary' : '',
    /(?:personal\s+reflection|רפלקציה\s+אישית|התייחסות\s+אישית)/i.test(text) ? 'personal-reflection' : '',
    /(?:chosen\s+case|case\s+study|מקרה\s+נבחר|משבר\s+נבחר)/i.test(text) ? 'choose-crisis-or-case' : '',
    /(?:choose\s+a\s+group|בחר(?:ו)?\s+קבוצה|קבוצה\s+בחברה\s+הישראלית)/i.test(text) ? 'choose-israeli-society-group' : '',
  ]);
  const sectionWordBudgets = extractSectionWordBudgets(text, wordLimit);
  const sourceRequirements = extractAssignmentSourceRequirements(text, academicSources);

  return normalizeAssignmentRequirements({
    contentItems,
    academicSources,
    directQuotes,
    wordLimit,
    pageLimit,
    outputFormat,
    citationStyle,
    needsCoverPage,
    needsAiUseDeclaration,
    sectionWordBudgets,
    requiredComponents,
    legalHypotheticals,
    sourceRequirements,
    themes,
    subthemes,
    needsEthicsSection: /(?:סעיף\s+)?אתיקה|ethics?|ethical/i.test(text),
    needsAppendix: /נספח|appendix/i.test(text),
    qualitativeContentAnalysis: /ניתוח\s+תוכן\s+איכותני|qualitative\s+content\s+analysis/i.test(text),
  });
};

const buildAssignmentRequirementLogPayload = (requirements = {}) => {
  const normalized = normalizeAssignmentRequirements(requirements);
  return {
    contentItems: normalized.contentItems,
    academicSources: normalized.academicSources,
    directQuotes: normalized.directQuotes,
    wordLimit: normalized.wordLimit,
    pageLimit: normalized.pageLimit,
    outputFormat: normalized.outputFormat,
    citationStyle: normalized.citationStyle,
    needsCoverPage: normalized.needsCoverPage,
    needsAiUseDeclaration: normalized.needsAiUseDeclaration,
    sectionWordBudgets: normalized.sectionWordBudgets,
    requiredComponents: normalized.requiredComponents,
    legalHypotheticals: normalized.legalHypotheticals,
    sourceRequirements: normalized.sourceRequirements,
    sourceRequirementCategories: normalized.sourceRequirementCategories,
    themes: normalized.themes,
    subthemes: normalized.subthemes,
    needsEthicsSection: normalized.needsEthicsSection,
    needsAppendix: normalized.needsAppendix,
    qualitativeContentAnalysis: normalized.qualitativeContentAnalysis,
    hasSourceQuotas: normalized.hasSourceQuotas,
    isHighQuotaAssignment: normalized.isHighQuotaAssignment,
  };
};

const formatSourceRequirementLine = (item = {}) => {
  const countText = item.count ? `count=${item.count}` : 'count=unspecified';
  const requiredText = item.required === false ? 'optional/supplementary' : 'required';
  return `${item.kind} (${requiredText}, ${countText})${item.notes ? ` - ${item.notes}` : ''}`;
};

const formatAssignmentRequirementsForPrompt = (requirements = {}) => {
  const normalized = normalizeAssignmentRequirements(requirements);
  if (!normalized.hasExplicitRequirements) return '';
  return [
    normalized.wordLimit ? `wordLimit<=${normalized.wordLimit}` : '',
    normalized.pageLimit ? `pageLimit<=${normalized.pageLimit}` : '',
    normalized.outputFormat ? `outputFormat=${normalized.outputFormat}` : '',
    normalized.citationStyle ? `citationStyle=${normalized.citationStyle}` : '',
    normalized.contentItems ? `contentItems=${normalized.contentItems}` : '',
    normalized.academicSources ? `academicSources>=${normalized.academicSources}` : '',
    normalized.directQuotes ? `directQuotes=${normalized.directQuotes}` : '',
    normalized.themes ? `themes=${normalized.themes}` : '',
    normalized.subthemes ? `subthemes=${normalized.subthemes}` : '',
    normalized.needsCoverPage ? 'needsCoverPage=true' : '',
    normalized.needsAiUseDeclaration ? 'needsAiUseDeclaration=true' : '',
    normalized.legalHypotheticals ? `legalHypotheticals=${normalized.legalHypotheticals}` : '',
    normalized.sectionWordBudgets.length ? `sectionWordBudgets=${normalized.sectionWordBudgets.map((item) => `${item.label}:${item.words}`).join(', ')}` : '',
    normalized.requiredComponents.length ? `requiredComponents=${normalized.requiredComponents.join(', ')}` : '',
    normalized.sourceRequirements.length ? `sourceRequirements=${normalized.sourceRequirements.map(formatSourceRequirementLine).join('; ')}` : '',
  ].filter(Boolean).join('\n');
};

const buildAssignmentRequirementContract = (requirements = {}) => {
  const normalized = normalizeAssignmentRequirements(requirements);
  if (!normalized.hasExplicitRequirements) return '';
  const quotaLines = [
    normalized.contentItems ? `contentItems=${normalized.contentItems} פריטי תוכן/כתבות אמיתיים` : '',
    normalized.academicSources ? `academicSources>=${normalized.academicSources} מאמרים/מקורות אקדמיים, רצוי מהסילבוס אם צויין` : '',
    normalized.directQuotes ? `directQuotes=${normalized.directQuotes} ציטוטים ישירים מתוך החומרים שנאספו` : '',
    normalized.themes ? `themes=${normalized.themes}` : '',
    normalized.subthemes ? `subthemes=${normalized.subthemes}` : '',
    normalized.wordLimit ? `wordLimit<=${normalized.wordLimit} מילים` : '',
    normalized.pageLimit ? `pageLimit<=${normalized.pageLimit} עמודים` : '',
    normalized.outputFormat ? `outputFormat=${normalized.outputFormat}` : '',
    normalized.citationStyle ? `citationStyle=${normalized.citationStyle}` : '',
    normalized.needsCoverPage ? 'חובה לכלול דף שער' : '',
    normalized.needsAiUseDeclaration ? 'חובה לכלול הצהרת שימוש ב-AI' : '',
    normalized.legalHypotheticals ? `legalHypotheticals=${normalized.legalHypotheticals}; נתח חוקתיות לכל מקרה` : '',
    normalized.sectionWordBudgets.length ? `sectionWordBudgets=${normalized.sectionWordBudgets.map((item) => `${item.label}:${item.words}`).join(', ')}` : '',
    normalized.requiredComponents.length ? `requiredComponents=${normalized.requiredComponents.join(', ')}` : '',
    normalized.sourceRequirements.length ? `sourceRequirements=${normalized.sourceRequirements.map(formatSourceRequirementLine).join('; ')}` : '',
    normalized.needsEthicsSection ? 'חובה לכלול סעיף אתיקה' : '',
    normalized.needsAppendix ? 'חובה לכלול נספח/נספח מקורות אם המטלה דורשת זאת' : '',
    normalized.qualitativeContentAnalysis ? 'חובה לבצע ניתוח תוכן איכותני ולא רק סיכום תיאורי' : '',
  ].filter(Boolean);
  return [
    `חוזה דרישות מזוהה: ${quotaLines.join('; ')}.`,
    'סוכני מחקר חייבים למסור ספירת found/required לכל מכסה ולכל sourceRequirements.kind בנפרד. אם קטגוריה לא מולאה, כתוב MISSING עם kind, found/required וסיבה במקום להמציא placeholders.',
    'אסור להמציא מקורות, URLs, DOI, פרטי מאמרים, כתבות או ציטוטים ישירים. כותב מתחיל ניסוח מלא רק אחרי שיש חומר מספיק או מסמן במפורש מה חסר.',
  ].join('\n');
};

const buildStageAssignmentRequirementInstruction = (requirements = {}, stageAgent = {}) => {
  const normalized = normalizeAssignmentRequirements(requirements);
  const contract = buildAssignmentRequirementContract(requirements);
  if (!contract) return '';
  const roleKey = isManagerReviewAgent(stageAgent) ? 'manager-review' : getAgentRoleKey(stageAgent);
  const marker = `${String(stageAgent?.id || '')} ${String(stageAgent?.name || '')}`;
  const isAcademicResearcher = roleKey === 'researcher' && /(researcher-academic|חוקר אקדמי|חוקר ספרות|scholar|peer)/i.test(marker);
  const isGeneralResearcher = roleKey === 'researcher' && /(researcher-general|חוקר לא אקדמי|חוקר רשת|web)/i.test(marker);
  const legalWithoutSources = Number(normalized.legalHypotheticals || 0) > 0 && !normalized.hasSourceQuotas;
  const roleInstruction = roleKey === 'manager'
    ? (legalWithoutSources
      ? 'זו מטלת מקרים משפטיים ללא דרישת מקורות מזוהה: אל תכפה שלב חיפוש מקורות; תכנן ניתוח חוקתיות לכל מקרה לפי ההנחיות והחומרים שסופקו.'
      : normalized.hasSourceQuotas
        ? 'חלק את העבודה לפי המכסות: תחילה מלא את המקורות והציטוטים שנדרשו, ורק אחר כך כתיבה וביקורת.'
        : 'חלק את העבודה לפי ההנחיות המפורשות: תחילה סגור מבנה, אורך, פורמט, שער וכל דרישה טכנית, ורק אם קיימת דרישת מקורות מפורשת עבור למחקר.')
    : isGeneralResearcher
      ? 'בשלב זה העדיפות היא למלא את מכסת פריטי התוכן/כתבות וקטגוריות sourceRequirements שאינן אקדמיות. החזר רשימה ממוספרת עם URL/כותרת/מקור/תרומה, וספור found/required לכל kind.'
      : isAcademicResearcher
        ? 'בשלב זה העדיפות היא למלא מקורות אקדמיים וציטוטים ישירים לפי kind: academic-definition-article, academic-case-article, recent-academic-article וכל מכסה אקדמית אחרת. החזר metadata מלא וציין אילו ציטוטים ישירים זמינים מכל מקור.'
        : roleKey === 'researcher'
          ? 'בשלב מחקר, מלא קודם את מכסות המקורות והציטוטים הרלוונטיות והעבר לכותב ספירת found/required לכל sourceRequirements.kind.'
          : roleKey === 'writer'
            ? 'כתוב את המסמך רק על בסיס חומרים שנאספו בפועל. אם מכסת מקורות/פריטים/ציטוטים לא מולאה, השאר MISSING ברור במקום להשלים מהראש.'
            : roleKey === 'manager-review'
              ? 'לפני אישור סופי, בדוק כל מכסה מול התוצר. אם חסרים פריטים, החזר REVISIT מתאים או MISSING עם found/required.'
              : 'ודא שהשלב שלך לא שובר את חוזה הדרישות ושכל חוסר נשאר ב-MISSING.';
  return `${contract}\n${roleInstruction}`;
};

const getRequestedSourceRetrievalLimit = (requirements = {}, { academic = false, articleRequest = false } = {}) => {
  const normalized = normalizeAssignmentRequirements(requirements);
  const sourceRequirementLimit = normalized.sourceRequirements.reduce((max, item) => Math.max(max, Number(item.count || 0)), 0);
  const requestedQuota = Math.max(
    articleRequest ? Number(normalized.contentItems || 0) : 0,
    academic ? Number(normalized.academicSources || 0) : 0,
    Number(normalized.directQuotes || 0) > VERIFIED_SOURCE_RESULT_LIMIT ? Number(normalized.directQuotes || 0) : 0,
    sourceRequirementLimit,
  );
  return Math.max(VERIFIED_SOURCE_RESULT_LIMIT, Math.min(VERIFIED_SOURCE_RESULT_HARD_LIMIT, requestedQuota || VERIFIED_SOURCE_RESULT_LIMIT));
};

const countUniqueUrlsInText = (text = '') => new Set((String(text || '').match(SOURCE_GROUNDING_URL_REGEX) || [])
  .map((url) => normalizeVerifiedSourceAllowedUrl(url))
  .filter(Boolean)).size;

const estimateDirectQuoteCount = (text = '') => {
  const value = String(text || '');
  const quoteMatches = value.match(/["״“”][^"״“”\n]{12,}["״“”]/g) || [];
  return quoteMatches.length;
};

const estimateAcademicSourceCount = (text = '') => {
  const value = stripHtmlTags(text);
  const doiCount = (value.match(DOI_PATTERN) || []).length;
  const apaYearCount = (value.match(/\((?:19|20)\d{2}\)/g) || []).length;
  const bibliographyLineCount = (value.match(/(?:^|\n)\s*\d{0,2}\.?\s*[^\n]{12,}\((?:19|20)\d{2}\)[^\n]*(?:doi|https?:\/\/|כתב עת|journal|press|publisher)?/gi) || []).length;
  return Math.max(doiCount, apaYearCount, bibliographyLineCount);
};

const estimateContentItemCount = (text = '') => {
  const value = stripHtmlTags(text);
  const urlCount = countUniqueUrlsInText(value);
  const labeledItemCount = (value.match(/(?:^|\n)\s*(?:\d{1,2}[.)]|פריט\s+תוכן\s*\d{0,2}|כתבה\s*\d{0,2}|article\s*\d{0,2})\s+[^\n]{12,}/gi) || []).length;
  return Math.max(urlCount, labeledItemCount);
};

const auditAssignmentRequirements = (output = '', requirements = {}) => {
  const normalized = normalizeAssignmentRequirements(requirements);
  const text = stripHtmlTags(output).replace(/\s+/g, ' ').trim();
  const estimated = {
    contentItems: estimateContentItemCount(output),
    academicSources: estimateAcademicSourceCount(output),
    directQuotes: estimateDirectQuoteCount(output),
    wordCount: text ? text.split(/\s+/).filter(Boolean).length : 0,
    hasEthicsSection: /אתיקה|ethics?|ethical/i.test(text),
    hasAppendix: /נספח|appendix/i.test(text),
    hasQualitativeContentAnalysis: /ניתוח\s+תוכן\s+איכותני|qualitative\s+content\s+analysis|תמה|תמות|קטגוריות|קידוד/i.test(text),
  };
  const missing = [];
  if (normalized.contentItems && estimated.contentItems < normalized.contentItems) missing.push({ key: 'contentItems', required: normalized.contentItems, found: estimated.contentItems });
  if (normalized.academicSources && estimated.academicSources < normalized.academicSources) missing.push({ key: 'academicSources', required: normalized.academicSources, found: estimated.academicSources });
  if (normalized.directQuotes && estimated.directQuotes < normalized.directQuotes) missing.push({ key: 'directQuotes', required: normalized.directQuotes, found: estimated.directQuotes });
  if (normalized.needsEthicsSection && !estimated.hasEthicsSection) missing.push({ key: 'needsEthicsSection', required: true, found: false });
  if (normalized.needsAppendix && !estimated.hasAppendix) missing.push({ key: 'needsAppendix', required: true, found: false });
  if (normalized.qualitativeContentAnalysis && !estimated.hasQualitativeContentAnalysis) missing.push({ key: 'qualitativeContentAnalysis', required: true, found: false });
  if (normalized.wordLimit && estimated.wordCount > Math.round(normalized.wordLimit * 1.12)) missing.push({ key: 'wordLimit', required: normalized.wordLimit, found: estimated.wordCount });
  return {
    required: buildAssignmentRequirementLogPayload(normalized),
    estimated,
    missing,
    isComplete: missing.length === 0,
  };
};

const resolveRequirementAuditRevisitAgents = ({ missing = [], enabledAgents = [] } = {}) => {
  const missingKeys = new Set((Array.isArray(missing) ? missing : []).map((item) => item?.key).filter(Boolean));
  const sourceHeavy = ['contentItems', 'academicSources', 'directQuotes'].some((key) => missingKeys.has(key));
  const preferredTokens = sourceHeavy
    ? ['researcher-general', 'researcher-academic', 'researcher', 'writer', 'manager-review']
    : ['writer', 'proofreader', 'manager-review'];
  return preferredTokens
    .map((token) => resolveStageAgent(token, enabledAgents))
    .filter((agent) => agent?.id)
    .filter((agent, index, list) => list.findIndex((item) => item.id === agent.id) === index);
};
const shouldEnforceConcreteAcademicResearch = (agent = {}, { academicResearchRequested = false, isAcademicTask = false } = {}) => {
  const stableAgentId = String(agent?.id || '').trim().toLowerCase();
  if (academicResearchRequested && /^(researcher|researcher-academic|source-hunter|citation-weaver)$/.test(stableAgentId)) return true;
  if (/^(researcher-academic|source-hunter|citation-weaver)$/.test(stableAgentId)) return true;
  return isAcademicTask && /^(researcher|researcher-academic|source-hunter|citation-weaver)$/.test(stableAgentId);
};

const buildHeuristicStageGoals = ({ orderedAgents = [], activeSkill = null, isAcademic = false, structureOptOut = false, assignmentRequirements = null } = {}) => {
  const skillId = String(activeSkill?.id || '').trim().toLowerCase();
  const skillPrefersPolish = ['consistency-checker', 'final-submission', 'style-guardian'].includes(skillId);
  const skillPrefersStructure = ['academic-structure', 'template-autopilot'].includes(skillId);
  const skillRequiresAcademicResearch = ['source-hunter', 'citation-weaver'].includes(skillId);
  const stageGoals = {};

  orderedAgents.forEach((agent) => {
    const marker = `${String(agent?.id || '')} ${String(agent?.name || '')}`;
    const roleKey = isManagerReviewAgent(agent) ? 'manager-review' : getAgentRoleKey(agent);
    const isAcademicResearcher = roleKey === 'researcher' && /(researcher-academic|חוקר אקדמי|חוקר ספרות|scholar|peer)/i.test(marker);
    const isGeneralResearcher = roleKey === 'researcher' && /(researcher-general|חוקר לא אקדמי|חוקר רשת|web)/i.test(marker);
    const isDocumentDesigner = roleKey === 'designer' && /(document-designer|מעצב מסמך|סגנון אישי|human)/i.test(marker);
    const isLecturerReviewer = roleKey === 'proofreader' && /(lecturer|מרצה)/i.test(marker);

    if (roleKey === 'manager-review') {
      stageGoals[agent.id] = 'קרא את ההערות של כלל הסוכנים והכרע אם דרוש עוד סבב. DELIVERABLE חייב להיות המסמך המלא והמעודכן בלבד; כל הערה, ציון, חוסר או כיוון להמשך שייכים ל-HANDOFF / MISSING / DECISION / CHECKLIST.';
      return;
    }

    if (roleKey === 'manager') {
      stageGoals[agent.id] = 'בנה תוכנית קצרה, קבע אילו שלבים נדרשים, ומה בדיוק כל סוכן צריך למסור לשלב הבא.';
      return;
    }

    if (isAcademicResearcher) {
      stageGoals[agent.id] = 'אסוף חבילת מחקר אקדמית usable: כשאפשר, הבא לפחות 3 מקורות קונקרטיים עם כותרת, מחבר או גוף מפרסם, שנה, קישור או DOI אם זמין, ומה אפשר להסיק מכל מקור. אם אין מספיק מקורות, כתוב במפורש מה חסר.';
      return;
    }

    if (isGeneralResearcher) {
      stageGoals[agent.id] = 'אסוף חומרים משלימים שאינם אקדמיים: כתבות, דוחות, דוגמאות והקשרים מהשטח. אסור להשתמש ב-Wikipedia. ציין מה מקור כל ממצא ומה תרומתו לכתיבה.';
      return;
    }

    if (isVisualResearchAgent(agent)) {
      stageGoals[agent.id] = 'אסוף חבילת מחקר חזותית usable: סרטוני וידאו, demos, screenshots, diagrams, walkthroughs, דוקומנטציה חזותית ומצגות. לכל פריט ציין קישור ישיר, מה רואים בו, ומה אפשר ללמוד ממנו. אם חסר חומר חזותי אמין, כתוב זאת במפורש.';
      return;
    }

    if (roleKey === 'researcher') {
      const requiresConcreteSources = shouldEnforceConcreteAcademicResearch(agent, {
        academicResearchRequested: skillRequiresAcademicResearch,
        isAcademicTask: isAcademic,
      });
      stageGoals[agent.id] = requiresConcreteSources
        ? 'אסוף חבילת מחקר usable להעברה לכותב: כשאפשר, הבא לפחות 3 מקורות או מאמרים קונקרטיים. לכל מקור ציין כותרת, מחבר או גוף מפרסם, שנה אם ידועה, קישור או DOI אם זמין, ולמה הוא רלוונטי. אם נמצאו פחות מ-3 מקורות, כתוב במפורש כמה נמצאו ומה חסר, ואל תסתפק רק בכיווני חיפוש כלליים. אפשר להוסיף מונחי חיפוש כהשלמה בלבד. אין להמציא ציטוטים, DOI או פרטים שלא אומתו.'
        : 'אסוף תובנות, נתונים, דוגמאות ומקורות זמינים להעברה לכותב. אם קיימים מקורות קונקרטיים, ציין אותם עם פרטים שימושיים; אם לא, כתוב מה נמצא, מה עדיין חסר, ואילו כיווני חיפוש משלימים כדאי לבדוק. אין להמציא עובדות, ציטוטים, DOI או פרטים שלא אומתו.';
      return;
    }

    if (isDocumentDesigner) {
      stageGoals[agent.id] = 'התאם את המסמך לסגנון האישי של המשתמש והפחת סימנים כתובים של AI. מותר לקצר, להרחיב, לשנות קצב וניסוחים, אבל לא להמציא מידע חדש.';
      return;
    }

    if (roleKey === 'designer') {
      stageGoals[agent.id] = structureOptOut
        ? 'אל תוסיף מבנה חדש. אם כבר יש במסמך כותרות או פרקים, רק שמור על עקביות ובהירות בלי להרחיב אותם.'
        : (skillPrefersStructure
          ? 'בנה שלד ברור, היררכיית כותרות וסדר כתיבה פרקטי רק לפי מה שהתבקש במפורש בבקשה או כבר קיים במסמך.'
          : 'הבהר ושפר את המבנה שהתבקש או שכבר קיים, בלי להוסיף פרקים, תתי-כותרות או מבוא על דעת עצמך.');
      return;
    }

    if (roleKey === 'writer') {
      stageGoals[agent.id] = 'כתוב את הטקסט המלא רק על בסיס ההנחיות, הטיוטה, והמידע שכבר נאסף בשלבים הקודמים. אם חסר חומר, הרם דגל אדום במקום להשלים מהראש.';
      return;
    }

    if (isLecturerReviewer) {
      stageGoals[agent.id] = 'בדוק את העבודה מול הנחיות המטלה והמקורות שסופקו: האם המקורות נראים נכונים וקיימים, מה הציון המשוער, ואילו שיפורים עדיין נדרשים. השאר את המסמך המלא ב-DELIVERABLE, ואת הביקורת ב-HANDOFF / MISSING / CHECKLIST.';
      return;
    }

    if (roleKey === 'proofreader') {
      stageGoals[agent.id] = skillPrefersPolish
        ? 'בצע מעבר ליטוש קפדני: אחידות, בהירות, תיקון בעיות וטון עקבי לפני החזרה למשתמש.'
        : 'בצע בקרת איכות סופית: דיוק, אחידות, בהירות, ועמידה בדרישות אקדמיות.';
      return;
    }

    stageGoals[agent.id] = 'קדם את המסמך לשלב הבא בצורה זהירה, ברורה וללא המצאת מידע חדש.';
  });

  const normalizedRequirements = normalizeAssignmentRequirements(assignmentRequirements);
  if (normalizedRequirements.hasExplicitRequirements) {
    orderedAgents.forEach((agent) => {
      if (!agent?.id || !stageGoals[agent.id]) return;
      const requirementInstruction = buildStageAssignmentRequirementInstruction(normalizedRequirements, agent);
      if (requirementInstruction) stageGoals[agent.id] = [stageGoals[agent.id], requirementInstruction].filter(Boolean).join('\n');
    });
  }

  return stageGoals;
};

const shouldAllowDocumentDesigner = (userPrompt = '', structureConstraintText = '') => {
  const requestText = `${userPrompt}\n${String(structureConstraintText || userPrompt).trim()}`;
  return /(rewrite|שכתוב|סגנון\s+אישי|tone|voice|human|humanize|ליטוש|ניסוח|פחות\s+ai|טבעי\s+יותר|להישמע\s+אישי|שפר|ערוך|polish|edit)/i.test(requestText);
};

const buildHeuristicAgentPlan = (userPrompt = '', documentContext = '', enabledAgents = [], activeSkill = null, structureConstraintText = '', assignmentRequirements = null) => {
  const combined = `${userPrompt}\n${documentContext}`;
  const normalizedRequirements = normalizeAssignmentRequirements(assignmentRequirements || extractAssignmentRequirements({ userPrompt, documentContext, structureConstraintText }));
  const resolvedStructureConstraintText = String(structureConstraintText || userPrompt).trim();
  const skillId = String(activeSkill?.id || '').trim().toLowerCase();
  const isAcademic = normalizedRequirements.hasSourceQuotas || isExplicitSourceRequest(combined);
  const needsVisualResearch = hasExplicitVisualResearchNeed(`${userPrompt}\n${resolvedStructureConstraintText}`)
    || hasExplicitVisualResearchNeed(documentContext)
    || hasVisualResearchGapInContext(documentContext);
  const disablesResearch = /(בלי מקורות|ללא מקורות|לא נדרשים מקורות|בלי מקור|ללא מקור|no sources|without sources)/i.test(combined);
  const legalHypotheticalWithoutSources = Number(normalizedRequirements.legalHypotheticals || 0) > 0
    && !normalizedRequirements.hasSourceQuotas
    && !isExplicitSourceRequest(combined);
  const skillPrefersResearch = ['source-hunter', 'citation-weaver', 'draft-from-materials'].includes(skillId);
  const skillPrefersStructure = ['academic-structure', 'template-autopilot'].includes(skillId);
  const skillPrefersPolish = ['consistency-checker', 'final-submission', 'style-guardian'].includes(skillId);
  const needsResearch = !disablesResearch && !legalHypotheticalWithoutSources && (normalizedRequirements.hasSourceQuotas || skillPrefersResearch || isAcademic || /(reference|references|citation|source|sources|literature|journal)/i.test(combined));
  const disablesStructure = hasExplicitStructureOptOut(resolvedStructureConstraintText);
  const hasStructuralDesigner = enabledAgents.some((agent) => getAgentRoleKey(agent) === 'designer' && !isDocumentDesignerAgent(agent));
  const hasDocumentDesigner = enabledAgents.some((agent) => isDocumentDesignerAgent(agent));
  const needsDocumentHumanization = hasDocumentDesigner && shouldAllowDocumentDesigner(userPrompt, resolvedStructureConstraintText);
  const needsStructure = !disablesStructure && (skillPrefersStructure || /(שלד|מבנה|outline|כותרות|פרקים)/i.test(combined));

  const candidateOrder = [
    'manager',
    needsResearch ? 'researcher' : '',
    needsVisualResearch ? 'researcher-visual' : '',
    needsStructure && hasStructuralDesigner ? 'designer' : '',
    'writer',
    needsDocumentHumanization ? 'document-designer' : '',
    (skillPrefersPolish || needsResearch || needsStructure) ? 'proofreader' : '',
  ].filter(Boolean);

  const orderedAgents = [];
  candidateOrder.forEach((token) => {
    const roleMatches = token === 'manager'
      ? enabledAgents.filter((agent) => isPlanningManagerAgent(agent))
      : token === 'researcher-visual'
        ? enabledAgents.filter((agent) => isVisualResearchAgent(agent) && !isManagerReviewAgent(agent))
        : token === 'document-designer'
          ? enabledAgents.filter((agent) => isDocumentDesignerAgent(agent) && !isManagerReviewAgent(agent))
          : enabledAgents.filter((agent) => getAgentRoleKey(agent) === token && !isManagerReviewAgent(agent) && !isVisualResearchAgent(agent) && !isDocumentDesignerAgent(agent));
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

  const stageGoals = buildHeuristicStageGoals({
    orderedAgents,
    activeSkill,
    isAcademic,
    structureOptOut: disablesStructure,
    assignmentRequirements: normalizedRequirements,
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
    needsFinalManagerReview: (isAcademic || normalizedRequirements.hasExplicitRequirements || skillId === 'final-submission') && Boolean(resolveFinalManagerReviewAgent(enabledAgents)) && !alreadyEndsWithManagerReview,
  };
};

const clampAutopilotRoundCount = (value, fallback = 1, max = AUTOPILOT_MAX_STAGE_ROUNDS) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return Math.max(1, Math.min(max, Math.round(fallback || 1)));
  return Math.max(1, Math.min(max, Math.round(numericValue)));
};

const getAutopilotRoundBudgetForExecutionStyle = (executionStyle = 'balanced', taskProfile = {}) => {
  const normalizedStyle = AUTOPILOT_EXECUTION_STYLE_OPTIONS.has(String(executionStyle || '').trim())
    ? String(executionStyle).trim()
    : 'balanced';

  const highQuotaAssignment = taskProfile?.assignmentRequirements?.isHighQuotaAssignment === true;

  if (normalizedStyle === 'deep') {
    return {
      minPerAgent: taskProfile?.needsResearch || taskProfile?.needsStructure || highQuotaAssignment ? 2 : 1,
      maxPerAgent: highQuotaAssignment ? AUTOPILOT_MAX_STAGE_ROUNDS : 3,
      finalManagerPasses: 2,
    };
  }

  if (normalizedStyle === 'lean') {
    return {
      minPerAgent: 1,
      maxPerAgent: 1,
      finalManagerPasses: 1,
    };
  }

  if (highQuotaAssignment) {
    return {
      minPerAgent: 2,
      maxPerAgent: AUTOPILOT_MAX_STAGE_ROUNDS,
      finalManagerPasses: 2,
    };
  }

  return {
    minPerAgent: 1,
    maxPerAgent: 2,
    finalManagerPasses: 1,
  };
};

const getStagePlanRoleKeys = (agent = {}) => {
  const roleKey = isManagerReviewAgent(agent) ? 'manager-review' : getAgentRoleKey(agent);
  const specializedRoleKey = isVisualResearchAgent(agent)
    ? 'researcher-visual'
    : isDocumentDesignerAgent(agent)
      ? 'document-designer'
      : roleKey;
  return [...new Set([specializedRoleKey, roleKey].filter(Boolean))];
};

const resolveStagePlanString = (mapping = {}, agent = {}) => {
  if (!mapping || typeof mapping !== 'object') return '';
  const keys = [
    agent?.id,
    agent?.name,
    String(agent?.id || '').toLowerCase(),
    ...getStagePlanRoleKeys(agent),
  ].map((value) => String(value || '').trim()).filter(Boolean);

  for (const key of keys) {
    const value = mapping[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return '';
};

const buildAutopilotTaskProfile = ({ userPrompt = '', documentContext = '', structureConstraintText = '', extraSystemPrompt = '', activeSkill = null, enabledAgents = [] } = {}) => {
  const combined = [userPrompt, documentContext, structureConstraintText, extraSystemPrompt].filter(Boolean).join('\n');
  const assignmentRequirements = extractAssignmentRequirements({
    userPrompt,
    documentContext,
    structureConstraintText,
    extraSystemPrompt,
  });
  const skillId = String(activeSkill?.id || '').trim().toLowerCase();
  const requestText = String(userPrompt || '').trim();
  const structureText = String(structureConstraintText || userPrompt || '').trim();
  const documentContextText = String(documentContext || '').trim();
  const helperFilesPresent = /(חומרי\s+עזר|קובץ\s+עזר|תוכן\s+עזר|helper\s+files?|supporting\s+materials?)/i.test(documentContextText);
  const draftExists = Boolean(documentContextText) && (!helperFilesPresent || /(המסמך\s+הקיים|טיוט|<\s*(?:p|h1|h2|h3|div)\b|current\s+document|existing\s+draft)/i.test(documentContextText));
  const isAcademic = assignmentRequirements.hasSourceQuotas || isExplicitSourceRequest(combined);
  const needsVisualResearch = hasExplicitVisualResearchNeed(`${requestText}\n${structureText}`)
    || hasExplicitVisualResearchNeed(documentContext)
    || hasVisualResearchGapInContext(documentContext);
  const disablesResearch = /(בלי מקורות|ללא מקורות|לא נדרשים מקורות|בלי מקור|ללא מקור|no sources|without sources)/i.test(combined);
  const legalHypotheticalWithoutSources = Number(assignmentRequirements.legalHypotheticals || 0) > 0
    && !assignmentRequirements.hasSourceQuotas
    && !isExplicitSourceRequest(combined);
  const needsResearch = !disablesResearch && (
    !legalHypotheticalWithoutSources
    && (assignmentRequirements.hasSourceQuotas
      || assignmentRequirements.qualitativeContentAnalysis
      || ['source-hunter', 'citation-weaver', 'draft-from-materials'].includes(skillId)
      || isAcademic
      || isExplicitSourceRequest(requestText)
      || /(research|מחקר|literature|peer[-\s]?reviewed|evidence|evidence-based)/i.test(combined))
  );
  const needsStructure = !hasExplicitStructureOptOut(structureText)
    && (['academic-structure', 'template-autopilot'].includes(skillId) || /(שלד|מבנה|outline|כותרות|פרקים|sections?|headings?)/i.test(combined));
  const needsHumanization = shouldAllowDocumentDesigner(requestText, structureText);
  const isEditPass = /(תקן|ערוך|שכתב|polish|rewrite|edit|fix|refine|humanize|shorten|expand|ליטוש|ניסוח)/i.test(requestText);
  const isFreshDraft = /(כתוב|נסח|draft|write|compose|generate|צור|בנה|create)/i.test(requestText) && !draftExists;
  const enabledAgentCount = Array.isArray(enabledAgents) ? enabledAgents.length : 0;
  const complexityScore = [
    draftExists ? 1 : 0,
    String(documentContext || '').length > 3000 ? 1 : 0,
    needsResearch ? 2 : 0,
    assignmentRequirements.isHighQuotaAssignment ? 2 : assignmentRequirements.hasExplicitRequirements ? 1 : 0,
    needsVisualResearch ? 1 : 0,
    needsStructure ? 1 : 0,
    needsHumanization ? 1 : 0,
    isAcademic ? 1 : 0,
    enabledAgentCount > 5 ? 1 : 0,
  ].reduce((sum, value) => sum + value, 0);

  const recommendedExecutionStyle = assignmentRequirements.isHighQuotaAssignment
    ? 'deep'
    : complexityScore >= 6
    ? 'deep'
    : complexityScore >= 3
      ? 'balanced'
      : 'lean';

  const recommendedRounds = getAutopilotRoundBudgetForExecutionStyle(recommendedExecutionStyle, {
    needsResearch,
    needsStructure,
    assignmentRequirements,
  });

  const signals = [
    draftExists ? 'existing-draft' : 'blank-page',
    needsResearch ? 'research' : '',
    assignmentRequirements.hasExplicitRequirements ? 'explicit-requirements' : '',
    assignmentRequirements.isHighQuotaAssignment ? 'high-quota-assignment' : '',
    needsVisualResearch ? 'visual-research' : '',
    needsStructure ? 'structure' : '',
    needsHumanization ? 'humanization' : '',
    isAcademic ? 'academic' : '',
    isEditPass ? 'editing' : '',
    isFreshDraft ? 'fresh-draft' : '',
  ].filter(Boolean);

  return {
    recommendedExecutionStyle,
    recommendedRounds,
    complexityScore,
    draftExists,
    helperFilesPresent,
    contextOrder: ['user-instructions', draftExists ? 'existing-draft' : '', helperFilesPresent ? 'helper-materials' : '', 'manager-planning', 'role-agent-dispatch'].filter(Boolean),
    needsResearch,
    needsVisualResearch,
    needsStructure,
    needsHumanization,
    isAcademic,
    assignmentRequirements,
    isEditPass,
    isFreshDraft,
    enabledAgentCount,
    activeSkillId: skillId,
    signals,
  };
};

const parseStagePacket = (reply = '') => {
  const raw = stripCodeFences(reply);
  const extract = (label) => {
    const match = raw.match(new RegExp(`${label}\\s*:\\s*([\\s\\S]*?)(?=\\n(?:DELIVERABLE|HANDOFF|MISSING|DECISION|CHECKLIST)\\s*:|$)`, 'i'));
    return String(match?.[1] || '').trim();
  };
  const hasSection = (label) => new RegExp(`(?:^|\\n)${label}\\s*:`, 'i').test(raw);

  const deliverable = extract('DELIVERABLE');
  const handoff = extract('HANDOFF');
  const missing = extract('MISSING');
  const decision = extract('DECISION');
  const checklist = extract('CHECKLIST');
  const hasStructuredMetaSections = ['HANDOFF', 'MISSING', 'DECISION', 'CHECKLIST'].some((label) => hasSection(label));
  const structuredWithoutDeliverable = !deliverable && hasStructuredMetaSections;

  return {
    raw,
    deliverable: structuredWithoutDeliverable ? '' : (deliverable || raw),
    handoff,
    missing,
    decision,
    checklist,
    hasStructuredMetaSections,
    structuredWithoutDeliverable,
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
  if (automation?.workflowMode === 'autopilot-full') return automation?.autopilotEnabled === false ? 'rules' : 'manager';
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
  if (/(וידאו|סרטון|סרטונים|youtube|vimeo|screenshot|screen\s?shot|צילום\s+מסך|diagram|diagrams|תרשים|תרשימים|walkthrough|חומר\s+חזותי|מקורות\s+חזותיים)/i.test(text)) tags.push('visual');
  if (!hasExplicitStructureOptOut(text) && /(מבנה|שלד|outline|כותרת|כותרות|פרקים|סדר|ארגון)/i.test(text)) tags.push('structure');
  if (/(להרחיב|פירוט|דוגמא|דוגמה|ניסוח|שכתוב|rewrite|טיעון|כתיבה)/i.test(text)) tags.push('writing');
  if (/(דיוק|אימות|בדיקת עובדות|טעות|חסר דיוק|לא מדויק)/i.test(text)) tags.push('accuracy');
  if (/(ליטוש|פיסוק|דקדוק|בהירות|עקביות|אחידות|tone|style)/i.test(text)) tags.push('quality');
  if (/(אנושי|humanize|human|סגנון\s+אישי|טבעי\s+יותר|פחות\s+ai|סימני\s+ai|נשמע\s+אישי)/i.test(text)) tags.push('style-humanize');
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
  if (gapTags.includes('visual')) requestedTokens.push('researcher-visual');
  if (gapTags.includes('structure')) requestedTokens.push('designer');
  if (gapTags.includes('writing') || gapTags.includes('accuracy')) requestedTokens.push('writer');
  if (gapTags.includes('quality')) requestedTokens.push('proofreader');
  if (gapTags.includes('style-humanize')) requestedTokens.push('document-designer');

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

const DEFAULT_MANAGER_REVIEW_GOAL = 'בצע ביקורת סופית כמנהל עבודה: עמידה בדרישות, איכות, דיוק, פערים מהותיים ותיקוני חובה לפני החזרה למשתמש. DELIVERABLE חייב להיות המסמך המלא והמעודכן בלבד; הערות, חוסרים ותיקוני חובה שייכים ל-HANDOFF / MISSING / CHECKLIST. גם אם צריך לעצור או להחזיר סבב, DELIVERABLE נשאר הטיוטה המלאה האחרונה או גרסה מלאה מתוקנת.';

const buildStagePrompt = ({ cleanUserPrompt, stageGoal = '', stageInstruction = '', stageAgent, stagedOutput = '', sharedMemoryArtifacts = [], batonNotes = [], planSummary = '', index = 0, total = 1, allowCircular = false, roundIndex = 0, revisitReason = '', decisionMode = 'manager', finalReview = false, enabledAgents = [], agentNotesInstruction = '', collectAgentNotes = false, assignmentRequirements = null }) => {
  const batonBlock = batonNotes.length ? `שרשור מסירות בין הסוכנים:\n- ${batonNotes.join('\n- ')}` : '';
  const sharedMemoryBlock = buildWorkflowSharedMemoryBlock(sharedMemoryArtifacts);
  const currentOutputBlock = stagedOutput ? `תוצר עדכני עד כה:\n${stagedOutput}` : '';
  const roleKey = isManagerReviewAgent(stageAgent) ? 'manager-review' : getAgentRoleKey(stageAgent);
  const sharedMemoryUsageInstruction = sharedMemoryBlock
    ? roleKey === 'writer'
      ? 'חשוב: לפני כתיבה, השתמש בכל תיק העבודה המצטבר - במיוחד מקורות, דרישות, שלדים וביקורות. אל תסתמך רק על "התוצר העדכני עד כה".'
      : roleKey === 'manager-review'
        ? 'חשוב: בביקורת הסופית בדוק גם את תיק העבודה המצטבר, לא רק את הטיוטה האחרונה, כדי לוודא שמקורות, דרישות והערות קודמות לא נשמטו.'
        : 'השתמש בתיק העבודה המצטבר כרקע מחייב לשלב הנוכחי. אל תאבד מקורות, דרישות או החלטות שכבר נאספו בשלבים קודמים.'
    : '';
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
  const managerReviewContract = (finalReview || isManagerReviewStage)
    ? 'בשלב ביקורת ניהולית, DELIVERABLE חייב להיות המסמך המלא והמעודכן בלבד. כל הערה, פער, תיקון חובה, עצירה או בקשת REVISIT שייכים ל-HANDOFF / MISSING / DECISION / CHECKLIST. גם אם עוצרים, DELIVERABLE נשאר הטיוטה המלאה האחרונה או גרסה מלאה מתוקנת.'
    : '';
  const assignmentRequirementStageContract = buildStageAssignmentRequirementInstruction(assignmentRequirements, stageAgent);
  const deliverableSection = (finalReview || isManagerReviewStage)
    ? 'DELIVERABLE:\nהמסמך המלא והמעודכן בלבד. לא הערות, לא סיכום, לא ביקורת. גם אם צריך לעצור או להחזיר סבב, החזר כאן את הטיוטה המלאה האחרונה או גרסה מלאה מתוקנת.'
    : 'DELIVERABLE:\nהתוצר המלא שעובר לשלב הבא או חוזר למשתמש';

  return [
    `בקשת המשתמש המקורית:\n${cleanUserPrompt}`,
    planSummary ? `תכנית מנהל העבודה:\n${planSummary}` : '',
    batonBlock,
    sharedMemoryBlock,
    currentOutputBlock,
    sharedMemoryUsageInstruction,
    stageGoal ? `יעד השלב הנוכחי:\n${stageGoal}` : '',
    assignmentRequirementStageContract ? `חוזה דרישות ומכסות לשלב:\n${assignmentRequirementStageContract}` : '',
    stageInstruction ? `הנחיית AUTOPILOT לשלב הנוכחי:\n${stageInstruction}` : '',
    revisitReason ? `למה הוחזרת עכשיו לסבב נוסף:\n${revisitReason}` : '',
    collectAgentNotes && agentNotesInstruction ? `הנחיה פנימית לגבי הערות סוכנים: המערכת בונה נספח באופן אוטומטי מתוך ה-HANDOFF / MISSING / CHECKLIST בבלוק המטא שלך. אזהרה: אל תכתוב את ההערות בשום פנים ואופן בתוך המסמך עצמו (DELIVERABLE)! שלב אותן בבלוקי המטא בהתאם להנחיה הבאה:\n${agentNotesInstruction}` : '',
    `אתה פועל בשלב ${index + 1} מתוך ${total}${roundIndex > 0 ? ` • סבב חוזר ${roundIndex + 1}` : ''}.`,
    'שמור על דיוק ועל רצף עם מה שכבר נעשה. אם חסר מידע, אל תמציא.',
    'אל תוסיף מבוא, סיכום, כותרות קבועות או פרקים חדשים אלא אם בקשת המשתמש או המסמך הקיים דורשים זאת במפורש.',
    decisionGuidance,
    managerReviewContract,
    revisitTargetsHelp,
    allowCircular ? 'אם לדעתך צריך להחזיר סוכן קודם לעוד סבב, ציין זאת ב-DECISION או ב-HANDOFF עם REVISIT לאחד מה-agent ids הזמינים.' : '',
    'החזר את התשובה במבנה הבא בלבד:',
    deliverableSection,
    'HANDOFF:\n2-5 נקודות קצרות לסוכן הבא: מה כבר נסגר, מה עוד חסר, ועל מה חשוב לשמור',
    'MISSING:\nרשימת פערים קצרה. אם הכול מוכן כתוב: אין פערים מהותיים',
    decisionOptions,
    collectAgentNotes
      ? 'CHECKLIST:\n- 2-4 בדיקות איכות קצרות\n- הערת סוכן קצרה שתופיע בנספח הסופי'
      : 'CHECKLIST:\n- 2-4 בדיקות איכות קצרות',
  ].filter(Boolean).join('\n\n');
};

const planWithManagerIfNeeded = async ({ cleanUserPrompt, documentContext, structureConstraintText = '', extraSystemPrompt = '', enabledAgents, automation, cfg, selectedProviders, preferredProviders = [], runId, logEvent, onStatus, activeSkill = null, preserveFullDocumentContext = false }) => {
  const autopilotTaskProfile = buildAutopilotTaskProfile({
    userPrompt: cleanUserPrompt,
    documentContext,
    structureConstraintText,
    extraSystemPrompt,
    activeSkill,
    enabledAgents,
  });
  const fallbackPlan = {
    ...buildHeuristicAgentPlan(cleanUserPrompt, documentContext, enabledAgents, activeSkill, structureConstraintText, autopilotTaskProfile.assignmentRequirements),
    executionStyle: autopilotTaskProfile.recommendedExecutionStyle,
    roundBudget: { ...autopilotTaskProfile.recommendedRounds },
    stageInstructions: {},
    stageModels: {},
    autopilotTaskProfile,
  };
  const structureOptOut = hasExplicitStructureOptOut(structureConstraintText || cleanUserPrompt);
  const combinedContext = `${cleanUserPrompt}\n${documentContext}`;
  const isAcademicTask = /(אקדמ|סמינר|עבודה|מחקר|מאמר|ביבליוגרפ|apa|ציטוט|מקורות|מקור)/i.test(combinedContext);
  const isFullAutopilot = automation.workflowMode === 'autopilot-full';
  if (!enabledAgents.length) return fallbackPlan;

  if (AUTOPILOT_MANAGER_WORKFLOW_MODES.has(automation.workflowMode) && automation?.autopilotEnabled === false) {
    const preservedOrderedAgents = [
      ...enabledAgents.filter((agent) => isPlanningManagerAgent(agent)),
      ...enabledAgents.filter((agent) => !isPlanningManagerAgent(agent) && !isManagerReviewAgent(agent)),
      ...enabledAgents.filter((agent) => isManagerReviewAgent(agent)),
    ];
    const finalReviewer = resolveFinalManagerReviewAgent(enabledAgents);
    const lastPreservedAgent = preservedOrderedAgents[preservedOrderedAgents.length - 1] || null;
    const alreadyEndsWithManagerReview = Boolean(finalReviewer) && Boolean(lastPreservedAgent) && finalReviewer.id === lastPreservedAgent.id;

    return {
      ...fallbackPlan,
      summary: ['AUTOPILOT כבוי; נשמר הסדר שהוגדר וכל הסוכנים הפעילים משתתפים.', fallbackPlan.summary].filter(Boolean).join(' '),
      orderedAgents: preservedOrderedAgents,
      stageGoals: buildHeuristicStageGoals({
        orderedAgents: preservedOrderedAgents,
        activeSkill,
        isAcademic: isAcademicTask,
        structureOptOut,
        assignmentRequirements: autopilotTaskProfile.assignmentRequirements,
      }),
      needsFinalManagerReview: !alreadyEndsWithManagerReview && fallbackPlan.needsFinalManagerReview,
    };
  }

  if (!AUTOPILOT_MANAGER_WORKFLOW_MODES.has(automation.workflowMode)) return fallbackPlan;

  const managerAgent = resolvePlanningManagerAgent(enabledAgents);
  if (!managerAgent) return fallbackPlan;
  const allowDocumentDesigner = shouldAllowDocumentDesigner(cleanUserPrompt, structureConstraintText);
  const planningProviderPool = getConfiguredProviderPool(cfg, preferredProviders);
  const managerProvider = chooseProviderForAgent(managerAgent, cfg, preferredProviders);
  const requestedManagerModelOverride = String(managerAgent?.model || '').trim();
  const effectiveManagerModelOverride = managerProvider && requestedManagerModelOverride && !isProviderModelChoiceCompatible(managerProvider, requestedManagerModelOverride, cfg)
    ? ''
    : requestedManagerModelOverride;
  const availableProviders = planningProviderPool
    .map((providerId) => `${providerId}: ${getModelNameForProvider(providerId, cfg, '')}`)
    .join('\n');
  const availableAgents = enabledAgents
    .map((agent) => {
      const roleKey = isManagerReviewAgent(agent) ? 'manager-review' : getAgentRoleKey(agent);
      const providerLabel = agent.provider ? ` · ${agent.provider}${agent.model ? `/${agent.model}` : ''}` : '';
      return `- ${agent.id}: ${agent.name} (${roleKey}${providerLabel})`;
    })
    .join('\n');
  const assignmentRequirementContract = buildAssignmentRequirementContract(autopilotTaskProfile.assignmentRequirements);
  const autopilotProfileJson = JSON.stringify(autopilotTaskProfile, null, 2);
  const planningSchemaText = isFullAutopilot
    ? 'החזר JSON בלבד וללא טקסט נוסף במבנה הזה: {"summary":"...","executionStyle":"lean|balanced|deep","requirements":{"contentItems":10,"academicSources":3,"directQuotes":8,"wordLimit":1600,"pageLimit":4,"outputFormat":"docx","citationStyle":"APA","needsCoverPage":true,"needsAiUseDeclaration":true,"sectionWordBudgets":[{"label":"...","words":400}],"sourceRequirements":[{"kind":"academic-definition-article","count":1,"required":true,"notes":"..."}],"legalHypotheticals":3},"order":["manager","researcher-general","researcher-academic","researcher-visual","writer","document-designer","lecturer-review","manager-review"],"goals":{"manager":"...","manager-review":"..."},"stageInstructions":{"researcher-general":"...","researcher-academic":"...","writer":"..."},"roleLabels":{"researcher-academic":"חוקר אקדמי"},"providers":{"researcher-academic":"perplexity"},"models":{"writer":"gpt-4o"},"roundBudget":{"minPerAgent":1,"maxPerAgent":4,"finalManagerPasses":2},"needsFinalManagerReview":true}.'
    : 'החזר JSON בלבד וללא טקסט נוסף במבנה הזה: {"summary":"...","requirements":{"contentItems":10,"academicSources":3,"directQuotes":8,"wordLimit":1600,"pageLimit":4,"citationStyle":"APA","sourceRequirements":[{"kind":"academic-case-article","count":1,"required":true}]},"order":["manager","researcher-general","researcher-academic","researcher-visual","writer","document-designer","lecturer-review","manager-review"],"goals":{"manager":"...","manager-review":"..."},"roleLabels":{"researcher-academic":"חוקר אקדמי","researcher-general":"חוקר משלים","researcher-visual":"חוקר חזותי","writer":"כותב תוכן","manager-review":"מנהל מסכם"},"providers":{"researcher-academic":"perplexity","researcher-visual":"gemini","manager-review":"gemini"},"needsFinalManagerReview":false}.';

  try {
    logEvent('manager-plan-start', 'מנהל העבודה בונה תכנית ביצוע דינמית', {
      state: 'running',
      agentLabel: managerAgent?.name || 'מנהל עבודה',
      provider: managerProvider,
      orderedAgents: enabledAgents.map((agent) => agent.name),
      executionStyle: autopilotTaskProfile.recommendedExecutionStyle,
      roundBudget: autopilotTaskProfile.recommendedRounds,
      assignmentRequirements: buildAssignmentRequirementLogPayload(autopilotTaskProfile.assignmentRequirements),
    });

    const managerPlanText = await chatWithActiveProvider(
      `בקשת המשתמש:\n${cleanUserPrompt}`,
      preserveFullDocumentContext ? String(documentContext || '') : buildPromptDocumentContext(documentContext),
      `${managerAgent?.prompt || ''}\nPREFLIGHT_REQUIRED — לפני שאתה מגדיר agents או מחלק שלבים, נעל את המצב הבא ושקף אותו ב-"summary":\n1. INSTRUCTIONS: מה המשתמש ביקש במפורש? אם לא ברור, מה ההנחיה המשוערת?\n2. DRAFT: האם קיימת טיוטה או מסמך חלקי בהקשר? (כן/לא + תיאור קצר)\n3. HELPER_FILES: האם הועלו חומרי עזר, קבצי הפניה או תבניות? (כן/לא + תיאור קצר)\nרק אחרי שנעלת את שלושת הנקודות האלה — בחר agents, הגדר goals, וצור pipeline. אל תתחיל לתכנן agents לפני שסיימת PREFLIGHT.\nלפני שאתה מחלק שלבים והוראות, קרא קודם את בקשת המשתמש במלואה. אם קיים בהקשר המסמך תוכן קיים, טיוטה, מסמך חלקי או חומר שכבר נכתב, קרא גם את הטיוטה או המסמך כפי שסופקו לך בהקשר ורק אחר כך החלט איך לחלק את העבודה. כשיש טיוטה, goals לכל סוכן חייבים להתייחס גם לדרישות המשתמש וגם למה שכבר קיים בטיוטה, כדי לשפר, להשלים או לבדוק אותה במקום לעבוד כאילו מתחילים מאפס. אם המשתמש ביקש חקר חזותי, סרטונים, screenshots, diagrams, demos, walkthroughs או חומר חזותי אחר מהרשת, תן עדיפות לסוכן researcher-visual או לשלב מפורש של מחקר חזותי ייעודי.\n${assignmentRequirementContract ? `\nחוזה מכסות מחייב למטלה:\n${assignmentRequirementContract}\nאם קיימת מכסת contentItems גבוהה, תכנן שלב researcher-general שממלא קודם את sample. אם קיימת מכסת academicSources או directQuotes, תכנן שלב researcher-academic נפרד. writer מגיע רק אחרי שהמחקר מדווח found/required או מחזיר MISSING ברור.\n` : ''}${planningSchemaText}\nבחר רק את הסוכנים הנחוצים באמת. במצב AUTOPILOT אתה גם מגדיר את התפקיד המעשי של כל שלב דרך roleLabels. במצב AUTOPILOT מלא אתה רשאי וגם נדרש לבחור provider/model/round budget/stageInstructions לכל שלב רק אם זה באמת משפר את ההתאמה למטלה. אל תמחזר pipeline קבוע כשפרופיל המטלה שונה. מותר להשתמש ב-order, goals, roleLabels, providers, models ו-stageInstructions גם ב-agent ids המדויקים מהרשימה למטה, ולא רק ב-role aliases כלליים. אם יש יותר מסוכן אחד מאותו סוג, השתמש ב-id המדויק כדי לבחור את שניהם או רק אחד מהם. אם מדובר בעבודה אקדמית, טיוטה, נושא מחקרי או חומרי עזר — העדף מקורות לפני כתיבה. אם צריך שער איכות ניהולי מפורש בסוף, מותר להוסיף manager-review כשלב נפרד.\nפרופיל מטלה אלגוריתמי שמחייב אותך לבחור pipeline לפי המשימה:\n${autopilotProfileJson}\nסוכנים זמינים כרגע:\n${availableAgents}\nמודלים זמינים כרגע:\n${availableProviders}`,
      {
        providerOverride: managerProvider,
        preferredProviders: managerProvider ? [managerProvider] : preferredProviders,
        strictProviderOverride: true,
        modelOverride: effectiveManagerModelOverride,
        preserveFullDocumentContext,
        strictFormatting: true,
        skipAutomation: true,
        skipMultiModel: true,
        assignmentRequirements: autopilotTaskProfile.assignmentRequirements,
        shouldPersistMemory: false,
        runId,
        agentLabel: managerAgent?.name || 'מנהל עבודה',
        onStatus: (payload = {}) => emitStatus(onStatus, {
          ...payload,
          runId,
          agentLabel: managerAgent?.name || 'מנהל עבודה',
          provider: payload.provider || managerProvider,
          model: payload.model || getModelNameForProvider(managerProvider, cfg, effectiveManagerModelOverride),
          message: payload.message || 'מנהל העבודה מתכנן את השלבים',
          progress: Math.min(18, Number(payload.progress ?? 12)),
        }),
      },
    );

    const parsedPlan = safeJsonParse(managerPlanText, null);
    if (!parsedPlan || !Array.isArray(parsedPlan.order)) return fallbackPlan;

    const orderedAgents = parsedPlan.order
      .map((token) => resolveStageAgent(token, enabledAgents))
      .filter((agent) => !(structureOptOut && getAgentRoleKey(agent) === 'designer' && !isDocumentDesignerAgent(agent)))
      .filter((agent) => !isDocumentDesignerAgent(agent) || allowDocumentDesigner)
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
      executionStyle: String(parsedPlan.executionStyle || fallbackPlan.executionStyle || '').trim(),
      assignmentRequirements: buildAssignmentRequirementLogPayload(autopilotTaskProfile.assignmentRequirements),
    });

    const resolvedFinalReviewer = resolveFinalManagerReviewAgent(enabledAgents);
    const lastPlannedAgent = normalizedOrderedAgents[normalizedOrderedAgents.length - 1] || null;
    const alreadyEndsWithManagerReview = Boolean(lastPlannedAgent) && Boolean(resolvedFinalReviewer) && lastPlannedAgent.id === resolvedFinalReviewer.id;
    const dynamicStageGoals = { ...(parsedPlan.goals || {}) };
    const normalizedStageLabels = {};
    const normalizedStageProviders = {};
    const normalizedStageModels = {};
    const normalizedStageInstructions = {};
    normalizedOrderedAgents.forEach((agent) => {
      const roleKeys = getStagePlanRoleKeys(agent);
      const resolvedStageLabel = resolveStagePlanString({
        ...(parsedPlan?.roleLabels || {}),
        ...(parsedPlan?.stageLabels || {}),
      }, agent);
      if (resolvedStageLabel) normalizedStageLabels[agent.id] = resolvedStageLabel;

      const resolvedStageProvider = resolveStagePlanString({
        ...(parsedPlan?.providers || {}),
        ...(parsedPlan?.stageProviders || {}),
      }, agent);
      if (resolvedStageProvider) normalizedStageProviders[agent.id] = resolvedStageProvider;

      const resolvedGoal = resolveStagePlanString(parsedPlan?.goals || {}, agent);
      if (resolvedGoal) dynamicStageGoals[agent.id] = structureOptOut && roleKeys.includes('designer')
        && !isDocumentDesignerAgent(agent)
        ? 'אל תוסיף מבנה חדש. אם כבר יש במסמך כותרות או פרקים, רק שמור על עקביות ובהירות בלי להרחיב אותם.'
        : resolvedGoal;

      const resolvedStageModel = resolveStagePlanString({
        ...(parsedPlan?.models || {}),
        ...(parsedPlan?.stageModels || {}),
      }, agent);
      if (resolvedStageModel) normalizedStageModels[agent.id] = resolvedStageModel;

      const resolvedStageInstruction = resolveStagePlanString({
        ...(parsedPlan?.stageInstructions || {}),
        ...(parsedPlan?.instructions || {}),
      }, agent);
      const requirementInstruction = buildStageAssignmentRequirementInstruction(autopilotTaskProfile.assignmentRequirements, agent);
      const combinedStageInstruction = [resolvedStageInstruction, requirementInstruction].filter(Boolean).join('\n');
      if (combinedStageInstruction) normalizedStageInstructions[agent.id] = combinedStageInstruction;
    });

    const executionStyle = AUTOPILOT_EXECUTION_STYLE_OPTIONS.has(String(parsedPlan?.executionStyle || '').trim())
      ? String(parsedPlan.executionStyle).trim()
      : fallbackPlan.executionStyle;
    const derivedRoundBudget = getAutopilotRoundBudgetForExecutionStyle(executionStyle, autopilotTaskProfile);
    const parsedRoundBudget = (parsedPlan?.roundBudget && typeof parsedPlan.roundBudget === 'object')
      ? parsedPlan.roundBudget
      : ((parsedPlan?.rounds && typeof parsedPlan.rounds === 'object') ? parsedPlan.rounds : {});
    const normalizedRoundBudget = {
      minPerAgent: clampAutopilotRoundCount(parsedRoundBudget?.minPerAgent ?? parsedRoundBudget?.min, derivedRoundBudget.minPerAgent),
      maxPerAgent: clampAutopilotRoundCount(parsedRoundBudget?.maxPerAgent ?? parsedRoundBudget?.max, derivedRoundBudget.maxPerAgent),
      finalManagerPasses: clampAutopilotRoundCount(
        parsedRoundBudget?.finalManagerPasses ?? parsedRoundBudget?.finalReviewPasses,
        derivedRoundBudget.finalManagerPasses,
        AUTOPILOT_MAX_FINAL_REVIEW_PASSES,
      ),
    };
    normalizedRoundBudget.maxPerAgent = Math.max(normalizedRoundBudget.minPerAgent, normalizedRoundBudget.maxPerAgent);

    return {
      ...fallbackPlan,
      summary: String(parsedPlan.summary || fallbackPlan.summary || '').trim(),
      orderedAgents: normalizedOrderedAgents,
      stageGoals: { ...fallbackPlan.stageGoals, ...dynamicStageGoals },
      stageLabels: {
        ...(parsedPlan?.roleLabels || {}),
        ...(parsedPlan?.stageLabels || {}),
        ...normalizedStageLabels,
      },
      stageProviders: {
        ...(parsedPlan?.providers || {}),
        ...(parsedPlan?.stageProviders || {}),
        ...normalizedStageProviders,
      },
      stageModels: {
        ...(parsedPlan?.models || {}),
        ...(parsedPlan?.stageModels || {}),
        ...normalizedStageModels,
      },
      stageInstructions: {
        ...(parsedPlan?.stageInstructions || {}),
        ...(parsedPlan?.instructions || {}),
        ...normalizedStageInstructions,
      },
      executionStyle,
      roundBudget: normalizedRoundBudget,
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

const ACADEMIC_PROFILE_STRONG_SIGNAL_PATTERN = /(אקדמ|סמינר|סילבוס|ביבליוגרפ|apa|mla|doi|peer[-\s]?reviewed|journal|מאמר|מחקר\s+אקדמי|literature\s+review)/i;
const ACADEMIC_PROFILE_WEAK_SIGNALS = ['קורס', 'מרצה', 'מנחה', 'סטודנט', 'ציטוט'];

const tokenizeAcademicContext = (value = '') => Array.from(new Set(
  String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9א-ת]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3),
));

const filterRelevantAcademicProfileValues = (values = [], requestText = '') => {
  const normalizedValues = Array.isArray(values)
    ? values.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const requestTokens = tokenizeAcademicContext(requestText);
  if (!requestTokens.length) return [];

  return normalizedValues.filter((item) => {
    const normalizedItem = item.toLowerCase();
    const itemTokens = tokenizeAcademicContext(normalizedItem);
    return requestTokens.some((token) => normalizedItem.includes(token))
      || itemTokens.some((token) => requestTokens.includes(token));
  });
};

const countAcademicWeakSignals = (value = '') => {
  const normalizedValue = String(value || '').toLowerCase();
  return ACADEMIC_PROFILE_WEAK_SIGNALS.filter((token) => normalizedValue.includes(token)).length;
};

const shouldIncludeAcademicProfileContext = ({ requestText = '', templateId = '', isAcademicTask } = {}) => {
  if (typeof isAcademicTask === 'boolean') return isAcademicTask;
  if (String(templateId || '').trim().toLowerCase() === 'academic') return true;
  return ACADEMIC_PROFILE_STRONG_SIGNAL_PATTERN.test(String(requestText || ''))
    || countAcademicWeakSignals(requestText) >= 2;
};

const buildPersonalStyleInstructions = (profile = {}, options = {}) => {
  const omitStructuralHints = options.omitStructuralHints === true;
  const labels = {
    school: 'בית ספר',
    undergraduate: 'תואר ראשון',
    graduate: 'תואר שני',
    doctoral: 'דוקטורט',
    professional: 'מקצועי',
  };
  const toneLabels = {
    very_formal: 'רשמי לחלוטין',
    formal: 'מכובד ומקצועי',
    balanced: 'מאוזן ונגיש',
    casual: 'חצי-רשמי וחברי',
    very_casual: 'שיחתי וזורם מאוד',
  };
  const lengthLabels = {
    short: 'קצר ולעניין',
    default: 'מאוזן עם מעט רקע והסבר',
    detailed: 'מפורט עם הסברים ודוגמאות',
  };
  const emojiLabels = {
    none: 'להימנע מאימוג\'י לחלוטין',
    rare: 'להשתמש באימוג\'י לעתים נדירות בלבד',
    moderate: 'אפשר לשלב אימוג\'י במידה לפי ההקשר',
    lots: 'אפשר לשלב אימוג\'י בחופשיות כשזה מתאים',
  };
  const listLabels = {
    bullets: 'להעדיף רשימות bullets',
    numbers: 'להעדיף רשימות ממוספרות',
    hyphens: 'להעדיף רשימות עם מקפים',
  };

  const fingerprint = profile.styleFingerprint || {};
  const lecturerNames = getNormalizedLecturerNames(profile);
  const currentCourses = normalizeProfileListValue(profile.currentCourses);
  const syllabusTopics = normalizeProfileListValue(profile.syllabusTopics);
  const requestText = String(options.requestText || '').trim();
  const includeAcademicContext = shouldIncludeAcademicProfileContext({
    requestText,
    templateId: options.templateId,
    isAcademicTask: typeof options.isAcademicTask === 'boolean' ? options.isAcademicTask : undefined,
  });
  const relevantLecturerNames = includeAcademicContext ? filterRelevantAcademicProfileValues(lecturerNames, requestText) : [];
  const relevantCurrentCourses = includeAcademicContext ? filterRelevantAcademicProfileValues(currentCourses, requestText) : [];
  const relevantSyllabusTopics = includeAcademicContext ? filterRelevantAcademicProfileValues(syllabusTopics, requestText) : [];
  const normalizedGoldenExample = String(profile.goldenExample || '').trim().replace(/\s+/g, ' ');
  const submissionDefaults = [
    profile.assignmentType ? `סוג מטלה: ${String(profile.assignmentType).trim()}` : '',
    profile.submissionDate ? `תאריך הגשה: ${String(profile.submissionDate).trim()}` : '',
    profile.studentId ? `תז: ${String(profile.studentId).trim()}` : '',
    profile.aiAssistanceDeclaration ? `הצהרת AI: ${String(profile.aiAssistanceDeclaration).trim()}` : '',
  ].filter(Boolean);
  const parts = [];
  if (profile.academic_level) parts.push(`רמת הכתיבה המועדפת: ${labels[profile.academic_level] || profile.academic_level}`);
  if (profile.displayName) parts.push(`שם המשתמש: ${String(profile.displayName).trim()}`);
  if (profile.userRole) parts.push(`תפקיד או סטטוס נוכחי: ${String(profile.userRole).trim()}`);
  if (includeAcademicContext && profile.institutionName) parts.push(`מוסד לימודים או ארגון מרכזי: ${String(profile.institutionName).trim()}`);
  if (includeAcademicContext && profile.studyTrack) parts.push(`מסלול, חוג או תחום עיקרי: ${String(profile.studyTrack).trim()}`);
  if (includeAcademicContext && relevantLecturerNames.length) parts.push(`מרצים או מנחים רלוונטיים: ${relevantLecturerNames.join(', ')}`);
  if (includeAcademicContext && relevantCurrentCourses.length) parts.push(`קורסים או נושאי עיסוק עכשוויים: ${relevantCurrentCourses.join(', ')}`);
  if (includeAcademicContext && relevantSyllabusTopics.length) parts.push(`נושאי סילבוס, יחידות לימוד או דגשים מרכזיים: ${relevantSyllabusTopics.join(', ')}`);
  if (includeAcademicContext && !omitStructuralHints && submissionDefaults.length) parts.push(`פרטי הגשה ברירת מחדל לשימוש כשמתבקשים עמוד שער או פרטי מסירה: ${submissionDefaults.join(' | ')}`);
  if (!omitStructuralHints && profile.defaultDocumentStyle) parts.push(`סגנון מסמך מועדף כברירת מחדל: ${String(profile.defaultDocumentStyle).trim()}`);
  if (!omitStructuralHints && profile.preferredHomeStyleIds?.length) parts.push(`סגנונות מועדפים להצגה ושימוש: ${profile.preferredHomeStyleIds.join(', ')}`);
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
  if (profile.tonePreference) parts.push(`רמת רשמיות כללית מועדפת: ${toneLabels[profile.tonePreference] || profile.tonePreference}`);
  if (profile.lengthPreference) parts.push(`רמת פירוט כללית מועדפת: ${lengthLabels[profile.lengthPreference] || profile.lengthPreference}`);
  if (!omitStructuralHints && profile.formatPreferences) parts.push(`העדפות מבנה ותצורה: ${String(profile.formatPreferences).trim()}`);
  if (profile.manualVocabulary?.length) parts.push(`העדף את המונחים: ${profile.manualVocabulary.join(', ')}`);
  if (profile.manualPhrases?.length) parts.push(`ביטויים שמועדפים על המשתמש: ${profile.manualPhrases.join(', ')}`);
  if (profile.favoritePhrases) parts.push(`ביטויים אהובים שכדאי לשלב כשזה מתאים: ${String(profile.favoritePhrases).trim()}`);
  if (profile.preferredSentenceStructures?.length) parts.push(`מבני משפטים מועדפים: ${profile.preferredSentenceStructures.join(', ')}`);
  if (!omitStructuralHints && profile.paragraphPreferences) parts.push(`העדפות לגבי אורך ומבנה פסקאות: ${String(profile.paragraphPreferences).trim()}`);
  if (profile.tonePreferences?.length) parts.push(`טון כתיבה מועדף: ${profile.tonePreferences.join(', ')}`);
  if (profile.sentenceLengthPreference) parts.push(`אורך משפטים מועדף: ${profile.sentenceLengthPreference}`);
  if (profile.paragraphLengthPreference) parts.push(`אורך פסקאות מועדף: ${profile.paragraphLengthPreference}`);
  if (profile.alwaysRules) parts.push(`כללים שחייבים להישמר בכל תוצר, אלא אם המשתמש סתר אותם במפורש: ${String(profile.alwaysRules).trim()}`);
  if (profile.avoidRules) parts.push(`גבולות סגנון מחייבים - יש להימנע במיוחד מהדברים הבאים: ${String(profile.avoidRules).trim()}`);
  if (profile.greetingStyle) parts.push(`אם מתאים לפתוח את הטקסט בברכה, העדף את הסגנון: ${String(profile.greetingStyle).trim()}`);
  if (profile.signOffStyle) parts.push(`אם מתאים לסיים בחתימה או סגירה, העדף: ${String(profile.signOffStyle).trim()}`);
  if (profile.emojiPreference) parts.push(`שימוש באימוג'י: ${emojiLabels[profile.emojiPreference] || profile.emojiPreference}`);
  if (profile.listPreference) parts.push(`פורמט רשימות מועדף: ${listLabels[profile.listPreference] || profile.listPreference}`);
  if (normalizedGoldenExample) {
    parts.push(`דוגמת כתיבה אישית לחיקוי מבוקר: ${normalizedGoldenExample.slice(0, 1400)}${normalizedGoldenExample.length > 1400 ? '...' : ''}`);
    parts.push('בעת שימוש בדוגמת הכתיבה: חלץ ממנה קצב, רמת פירוט, מבני משפטים, מעברים וטון; אל תעתיק משפטים שלמים ואל תשמר טעויות, פרטים אישיים או עובדות שאינם רלוונטיים לבקשה הנוכחית.');
  }
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

  const cleanParts = parts.filter(Boolean);
  if (!cleanParts.length) return '';
  return [
    'כללים אלה מחייבים את ניסוח התוצר כל עוד אינם סותרים הוראה מפורשת של המשתמש, חומרי מקור או דרישות מטלה. אל תדלל אותם להמלצה כללית ואל תחליף אותם בסגנון ברירת מחדל.',
    'מטרת הסגנון: התוצר צריך להרגיש כאילו המשתמש עצמו כתב אותו אחרי עריכה נקייה, לא כמו טקסט AI כללי. העדף התאמה לסגנון האישי על פני ניסוחים גנריים, פתיחות שבלוניות וסיכומי ביניים שלא התבקשו.',
    ...cleanParts,
  ].join('\n');
};

const PORTABLE_PROFILE_PACKAGE_VERSION = 1;

const sanitizePortableAgent = (agent = {}) => ({
  id: String(agent?.id || '').trim(),
  name: String(agent?.name || '').trim(),
  role: String(agent?.role || '').trim(),
  prompt: String(agent?.prompt || '').trim(),
  enabled: agent?.enabled !== false,
  order: Number.isFinite(Number(agent?.order)) ? Number(agent.order) : undefined,
  provider: String(agent?.provider || '').trim(),
  model: String(agent?.model || '').trim(),
});

const sanitizePortableAppMemory = (memory = {}) => ({
  memoryNotes: Array.isArray(memory?.memoryNotes)
    ? memory.memoryNotes.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 12)
    : [],
  lastSelectedSkillId: String(memory?.lastSelectedSkillId || '').trim(),
  lastSelectedAgentId: String(memory?.lastSelectedAgentId || '').trim(),
  lastResolvedSkillLabel: String(memory?.lastResolvedSkillLabel || '').trim(),
});

const parsePortableProfilePackage = (value = {}) => {
  if (value && typeof value === 'object') return value;
  const raw = String(value || '').trim();
  if (!raw) return null;
  const markerMatch = raw.match(/WORD_FLOW_PORTABLE_PROFILE_JSON\s*:?\s*([\s\S]+)$/i);
  const candidate = markerMatch?.[1] || raw;
  const jsonMatch = candidate.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
};

export const buildPortableProfilePackage = (options = {}) => {
  const profile = normalizePersonalStyleProfile(options.profile || getPersonalStyleProfile());
  const automation = getWorkspaceAutomation();
  return {
    kind: 'wordflow-portable-profile',
    version: PORTABLE_PROFILE_PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    sharedInstructions: typeof options.sharedInstructions === 'string'
      ? String(options.sharedInstructions || '').trim()
      : getSharedAgentInstructions(),
    personalStyle: profile,
    assistantBehavior: getAssistantBehavior(),
    wordPreferences: getWordPreferences(),
    workspaceAutomation: {
      enabled: automation.enabled === true,
      autoDispatch: automation.autoDispatch !== false,
      workflowMode: String(automation.workflowMode || DEFAULT_WORKSPACE_AUTOMATION.workflowMode).trim(),
      autopilotEnabled: automation.autopilotEnabled !== false,
      workspaceName: String(automation.workspaceName || '').trim(),
      appendAgentNotesToOutput: automation.appendAgentNotesToOutput === true,
      agentNotesInstruction: String(automation.agentNotesInstruction || '').trim(),
    },
    roleAgents: getRoleAgents().map(sanitizePortableAgent).filter((agent) => agent.id || agent.name || agent.prompt),
    skillsConfig: getSkillsConfig(),
    appMemory: sanitizePortableAppMemory(options.memory || getAppMemory()),
  };
};

export const applyPortableProfilePackage = (input = {}) => {
  const parsed = parsePortableProfilePackage(input);
  if (!parsed || parsed.kind !== 'wordflow-portable-profile') {
    return { ok: false, error: 'לא נמצאה חבילת WordFlow ניידת תקינה.' };
  }

  const applied = [];
  if (parsed.personalStyle && typeof parsed.personalStyle === 'object') {
    savePersonalStyleProfile(parsed.personalStyle);
    applied.push('personalStyle');
  }
  if (typeof parsed.sharedInstructions === 'string') {
    saveSharedAgentInstructions(parsed.sharedInstructions);
    applied.push('sharedInstructions');
  }
  if (parsed.assistantBehavior && typeof parsed.assistantBehavior === 'object') {
    saveAssistantBehavior(parsed.assistantBehavior);
    applied.push('assistantBehavior');
  }
  if (parsed.wordPreferences && typeof parsed.wordPreferences === 'object') {
    saveWordPreferences(parsed.wordPreferences);
    applied.push('wordPreferences');
  }
  if (parsed.workspaceAutomation && typeof parsed.workspaceAutomation === 'object') {
    saveWorkspaceAutomation({ ...getWorkspaceAutomation(), ...parsed.workspaceAutomation });
    applied.push('workspaceAutomation');
  }
  if (Array.isArray(parsed.roleAgents) && parsed.roleAgents.length) {
    saveRoleAgents(parsed.roleAgents.map(sanitizePortableAgent));
    applied.push('roleAgents');
  }
  if (parsed.skillsConfig && typeof parsed.skillsConfig === 'object') {
    saveSkillsConfig(parsed.skillsConfig);
    applied.push('skillsConfig');
  }
  if (parsed.appMemory && typeof parsed.appMemory === 'object') {
    saveAppMemory({ ...getAppMemory(), ...sanitizePortableAppMemory(parsed.appMemory) });
    applied.push('appMemory');
  }

  syncPersistedAppSettings();
  try {
    window.dispatchEvent(new CustomEvent('wordai-settings-hydrated'));
    window.dispatchEvent(new CustomEvent('wordai-personal-style-updated', { detail: { source: 'portable-profile-import' } }));
  } catch {}
  return { ok: true, applied };
};

export const buildPortablePrompt = (options = {}) => {
  const sharedInstructions = typeof options.sharedInstructions === 'string'
    ? String(options.sharedInstructions || '').trim()
    : getSharedAgentInstructions();
  const personalStylePrompt = buildPersonalStyleInstructions(options.profile || getPersonalStyleProfile(), {
    omitStructuralHints: options.omitStructuralHints === true,
    requestText: String(options.requestText || '').trim(),
    templateId: String(options.templateId || '').trim(),
    isAcademicTask: typeof options.isAcademicTask === 'boolean' ? options.isAcademicTask : undefined,
  });
  const sections = [
    'אתה עוזר כתיבה כללי שנועד לעבוד היטב מול כל ספק AI.',
    'ענה בעברית, ברור ומעשי, אלא אם המשתמש ביקש אחרת.',
    'אם המשתמש מבקש טקסט מוכן למסמך, החזר ישירות את התוכן בלי פתיחים ומטא מיותר.',
    sharedInstructions ? `הנחיות משותפות קבועות:\n${sharedInstructions}` : '',
    personalStylePrompt ? `פרופיל והעדפות סגנון של המשתמש:\n${personalStylePrompt}` : '',
    options.includePortablePackage === true ? `WORD_FLOW_PORTABLE_PROFILE_JSON:\n${JSON.stringify(buildPortableProfilePackage({ profile: options.profile, sharedInstructions }), null, 2)}` : '',
  ].filter(Boolean);

  return sections.join('\n\n').trim();
};

const EXTERNAL_ANALYSIS_PROVIDER_LABELS = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  claude: 'Claude',
  groq: 'Groq',
  perplexity: 'Perplexity',
  deepseek: 'DeepSeek',
  mistral: 'Mistral',
  together: 'Together.ai',
  openrouter: 'OpenRouter',
  xai: 'xAI (Grok)',
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
  custom: 'מותאם / OpenAI-Compatible',
};

const EXTERNAL_ANALYSIS_PROVIDER_HINTS = {
  gemini: 'העלה את קבצי העבודות ועמוד השער ישירות ל-Gemini לפני שליחת הפרומפט.',
  openai: 'העלה את קבצי העבודות ועמוד השער לצ\'אט של ChatGPT לפני שליחת הפרומפט.',
  claude: 'צרף את הקבצים לשיחת Claude לפני שליחת הפרומפט.',
  groq: 'אם אין העלאת קבצים ב-Groq, הדבק 2-3 קטעים מייצגים ועמוד שער במקום קבצים.',
  perplexity: 'אם אין העלאת קבצים ב-Perplexity, הדבק קטעים מייצגים ועמוד שער ידנית.',
  deepseek: 'ב-DeepSeek צרף קבצים אם יש תמיכה; אחרת הדבק 2-3 קטעים מייצגים ועמוד שער לפני שליחת הפרומפט.',
  mistral: 'ב-Mistral צרף קבצים אם אפשר; אחרת הדבק קטעים מייצגים ועמוד שער ידנית.',
  together: 'ב-Together.ai צרף קבצים אם יש תמיכה בממשק; אחרת הדבק קטעים מייצגים ועמוד שער.',
  openrouter: 'בממשק OpenRouter או הספק החיצוני שלך, צרף קבצים אם אפשר; אחרת הדבק קטעים מייצגים.',
  xai: 'ב-Grok/xAI צרף קבצים אם הממשק תומך בכך; אחרת הדבק קטעים מייצגים ועמוד שער.',
  ollama: 'בממשק המקומי שלך צרף קבצים אם יש תמיכה; אחרת הדבק קטעים מייצגים ועמוד שער.',
  lmstudio: 'ב-LM Studio אפשר להדביק קטעים מייצגים ועמוד שער, או לצרף קבצים אם Local Server שלך תומך בכך.',
  custom: 'בממשק החיצוני שלך צרף קבצים או הדבק קטעים מייצגים ועמוד שער לפני שליחת הפרומפט.',
};

const normalizeExternalAnalysisProviderKey = (value = '') => String(value || '').trim().toLowerCase();
const getExternalAnalysisRuntimeProviderId = (providerId = '') => {
  const normalizedProviderId = normalizeExternalAnalysisProviderKey(providerId);
  if (['deepseek', 'mistral', 'together', 'openrouter', 'xai', 'lmstudio'].includes(normalizedProviderId)) return 'custom';
  return normalizedProviderId;
};

export const getExternalAnalysisProviderHint = (providerId = '') => {
  const providerKey = normalizeExternalAnalysisProviderKey(providerId) || 'gemini';
  return EXTERNAL_ANALYSIS_PROVIDER_HINTS[providerKey] || EXTERNAL_ANALYSIS_PROVIDER_HINTS.custom;
};

const uniqueExternalStrings = (values = [], limit = 12) => {
  const source = Array.isArray(values) ? values : [values];
  return [...new Set(source
    .flatMap((item) => (Array.isArray(item) ? item : [item]))
    .flatMap((item) => (typeof item === 'string' ? item.split(/[\n,|]/) : [item]))
    .map((item) => String(item || '').trim())
    .filter(Boolean))].slice(0, limit);
};

const mergeImportedListIntoProfileList = (currentValues = [], importedValues = []) => {
  const merged = [];
  const seen = new Set();

  [...currentValues, ...importedValues].forEach((item) => {
    const value = normalizeProfileTextValue(item);
    if (!value || seen.has(value)) return;
    seen.add(value);
    merged.push(value);
  });

  return merged;
};

const pickExternalText = (...values) => values
  .map((value) => String(value || '').trim())
  .find(Boolean) || '';

const mergeExternalSentenceText = (...values) => [...new Set(values
  .map((value) => String(value || '').trim())
  .filter(Boolean))].join(' ').trim();

const mergeExternalBlockText = (...values) => [...new Set(values
  .map((value) => String(value || '').trim())
  .filter(Boolean))].join('\n').trim();

const HEBREW_MONTH_NUMBERS = {
  ינואר: 1,
  פברואר: 2,
  מרץ: 3,
  אפריל: 4,
  מאי: 5,
  יוני: 6,
  יולי: 7,
  אוגוסט: 8,
  ספטמבר: 9,
  אוקטובר: 10,
  נובמבר: 11,
  דצמבר: 12,
};

const normalizeHebrewMonthToken = (value = '') => String(value || '')
  .trim()
  .replace(/^ב/u, '')
  .replace(/["'׳״.,]+/gu, '');

const isPureSubmissionDateCandidate = (value = '') => {
  const clean = cleanSyllabusImportValue(value);
  if (!clean) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return true;
  if (/^\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?$/.test(clean)) return true;

  const textualMatch = clean.match(/^(\d{1,2})\s+([^\s,]+)\s*,?\s*(\d{4})$/u);
  if (!textualMatch) return false;

  const month = HEBREW_MONTH_NUMBERS[normalizeHebrewMonthToken(textualMatch[2])];
  return Number(textualMatch[1]) >= 1 && Number(textualMatch[1]) <= 31 && Number(textualMatch[3]) >= 1900 && Boolean(month);
};

const isDeadlineLikeSyllabusTopicCandidate = (value = '') => {
  const clean = cleanSyllabusImportValue(value);
  if (!clean) return false;
  if (/\b(?:deadline|due(?:\s+date)?|submission(?:\s+date)?)\b/iu.test(clean)) return true;
  if (/^(?:מועד\s+הגשה|תאריך\s+הגשה|הגשה)\b/iu.test(clean)) return true;
  return isPureSubmissionDateCandidate(clean);
};

const normalizeExternalSubmissionDate = (value = '') => {
  const clean = String(value || '').trim();
  if (!clean) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;

  const match = clean.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const textualMatch = clean.match(/^(\d{1,2})\s+([^\s,]+)\s*,?\s*(\d{4})$/u);
  if (textualMatch) {
    const day = Number(textualMatch[1]);
    const month = HEBREW_MONTH_NUMBERS[normalizeHebrewMonthToken(textualMatch[2])];
    const year = Number(textualMatch[3]);
    if (day >= 1 && day <= 31 && month && year >= 1900) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const parsed = new Date(clean);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return '';
};

const normalizeExternalDocumentStyle = (value = '') => {
  const clean = String(value || '').trim().toLowerCase();
  if (!clean) return '';
  if (/legal|משפט/.test(clean)) return 'legal';
  if (/present|slide|מצג/.test(clean)) return 'presentation';
  if (/business|עסק|report|דוח/.test(clean)) return 'business';
  if (/acad|אקד/.test(clean)) return 'academic';
  return '';
};

const normalizeExternalSentenceLength = (value = '') => {
  const clean = String(value || '').trim().toLowerCase();
  if (!clean) return '';
  if (/short|concise|קצר|תמצית/.test(clean)) return 'קצר';
  if (/long|detailed|deep|מעמיק|ארו/.test(clean)) return 'מעמיק';
  if (/balanced|medium|מאוז/.test(clean)) return 'מאוזן';
  return String(value || '').trim();
};

const normalizeExternalParagraphLength = (value = '') => {
  const clean = String(value || '').trim().toLowerCase();
  if (!clean) return '';
  if (/short|concise|brief|תמצית|קצר/.test(clean)) return 'תמציתי';
  if (/long|detailed|expanded|מפורט|ארו/.test(clean)) return 'מפורט';
  if (/balanced|medium|מאוז|בינונ/.test(clean)) return 'בינוני';
  return String(value || '').trim();
};

const areStringListsEqual = (left = [], right = []) => (
  left.length === right.length && left.every((item, index) => item === right[index])
);

const cleanSyllabusImportValue = (value = '') => String(value || '')
  .replace(/^[\s:–—-]+/, '')
  .replace(/\s+/g, ' ')
  .trim();

const cleanSyllabusTopicValue = (value = '') => cleanSyllabusImportValue(value)
  .replace(/^[•▪●◦*-]\s*/, '')
  .replace(/^\d+\s*[.)-]\s*/, '')
  .replace(/^(?:week|שבוע|שיעור|מפגש|unit|module)\s*\d+\s*[:.)-]?\s*/iu, '')
  .replace(/^\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\s*[-–:]?\s*/, '')
  .trim();

const normalizeSyllabusImportList = (values = [], limit = 12, normalizer = cleanSyllabusImportValue) => {
  const source = Array.isArray(values) ? values : [values];
  return [...new Set(source
    .flatMap((item) => (Array.isArray(item) ? item : [item]))
    .flatMap((item) => (typeof item === 'string' ? item.split(/[\n,|;]/) : [item]))
    .map((item) => normalizer(item))
    .filter((item) => item.length >= 2 && /[\u0590-\u05FFa-zA-Z]/.test(item)))].slice(0, limit);
};

const getSyllabusImportLines = (rawText = '') => String(rawText || '')
  .replace(/\r\n/g, '\n')
  .split('\n')
  .map((line) => cleanSyllabusImportValue(line))
  .filter(Boolean);

const sampleSyllabusImportText = (rawText = '', maxLength = 16000) => {
  const source = String(rawText || '').trim();
  const resolvedMaxLength = Number.isFinite(maxLength) ? Math.max(0, Math.floor(maxLength)) : 16000;
  if (!source || !resolvedMaxLength || source.length <= resolvedMaxLength) return source;

  const separator = '\n\n...\n\n';
  const availableLength = resolvedMaxLength - (separator.length * 2);
  if (availableLength <= 300) return source.slice(0, resolvedMaxLength);

  const headLength = Math.floor(availableLength * 0.4);
  const middleLength = Math.floor(availableLength * 0.2);
  const tailLength = availableLength - headLength - middleLength;
  const middleStart = Math.max(
    headLength,
    Math.min(
      source.length - tailLength - middleLength,
      Math.floor((source.length - middleLength) / 2),
    ),
  );

  return [
    source.slice(0, headLength).trimEnd(),
    source.slice(middleStart, middleStart + middleLength).trim(),
    source.slice(-tailLength).trimStart(),
  ].filter(Boolean).join(separator);
};

const findSyllabusTextMatch = (rawText = '', patterns = []) => {
  const source = String(rawText || '');
  for (const pattern of patterns) {
    const match = source.match(pattern);
    const value = cleanSyllabusImportValue(match?.[1] || '');
    if (value) return value;
  }
  return '';
};

const collectSyllabusTextMatches = (rawText = '', pattern = null) => {
  if (!(pattern instanceof RegExp)) return [];
  const source = String(rawText || '');
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const globalPattern = new RegExp(pattern.source, flags);
  return Array.from(source.matchAll(globalPattern))
    .map((match) => cleanSyllabusImportValue(match?.[1] || ''))
    .filter(Boolean);
};

const splitPotentialLecturerNames = (value = '') => normalizeSyllabusImportList(
  String(value || '')
    .replace(/\s+(?:and|&)\s+/gi, ', ')
    .replace(/\//g, ', ')
    .replace(/\s+ו\s+/gu, ', '),
  12,
);

const deriveCourseNameFromFileName = (fileName = '') => {
  const normalized = cleanSyllabusImportValue(
    String(fileName || '')
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\b(?:syllabus|outline|teaching\s+plan|course\s+outline|סילבוס|מערך|תכנית)\b/giu, ' ')
  );
  return normalized.length >= 4 ? normalized : '';
};

const inferSyllabusAssignmentType = (rawText = '') => {
  const explicitValue = findSyllabusTextMatch(rawText, [
    /(?:סוג\s*מטלה|מטלה(?:\s+מרכזית)?|מטלת\s+סיום|assignment\s+type|final\s+assignment|deliverable)\s*[:\-–]?\s*([^\n]{2,120})/iu,
  ]);
  if (explicitValue) return explicitValue;

  const mappings = [
    { pattern: /עבודה\s+מסכמת|final\s+paper|term\s+paper/iu, value: 'עבודה מסכמת' },
    { pattern: /סמינריון|seminar\s+paper/iu, value: 'סמינריון' },
    { pattern: /פרויקט|project/iu, value: 'פרויקט' },
    { pattern: /מצגת|presentation/iu, value: 'מצגת' },
    { pattern: /מאמר|essay|paper/iu, value: 'מאמר' },
    { pattern: /דוח|report/iu, value: 'דוח' },
    { pattern: /מבחן|exam/iu, value: 'מבחן' },
    { pattern: /בוחן|quiz/iu, value: 'בוחן' },
    { pattern: /תרגיל|exercise/iu, value: 'תרגיל' },
  ];

  return mappings.find((item) => item.pattern.test(rawText))?.value || '';
};

const normalizeSyllabusImportExtraction = (parsed = {}) => {
  const institutionName = cleanSyllabusImportValue(pickExternalText(parsed.institutionName, parsed.academicCenter, parsed.organization, parsed.school));
  const studyTrack = cleanSyllabusImportValue(pickExternalText(parsed.studyTrack, parsed.department, parsed.faculty, parsed.major, parsed.program));
  const currentCourses = normalizeSyllabusImportList([
    parsed.currentCourses,
    parsed.courseName,
    parsed.courseTitle,
    parsed.course,
    parsed.courses,
  ], 6);
  const lecturerNames = normalizeSyllabusImportList([
    parsed.lecturerNames,
    parsed.lecturerName,
    parsed.instructorNames,
    parsed.instructorName,
    parsed.professorNames,
  ], 12);
  const syllabusTopics = normalizeSyllabusImportList([
    parsed.syllabusTopics,
    parsed.topics,
    parsed.modules,
    parsed.units,
    parsed.keyTopics,
  ], 10, cleanSyllabusTopicValue);

  return {
    institutionName,
    studyTrack,
    currentCourses,
    lecturerNames,
    lecturerName: lecturerNames[0] || cleanSyllabusImportValue(pickExternalText(parsed.lecturerName, parsed.instructorName)),
    syllabusTopics,
    assignmentType: cleanSyllabusImportValue(pickExternalText(parsed.assignmentType, parsed.assignmentKind, parsed.documentType)),
    submissionDate: normalizeExternalSubmissionDate(pickExternalText(parsed.submissionDate, parsed.dueDate, parsed.deadline)),
  };
};

const canReplaceSyllabusImportedScalar = (field = '', currentProfile = {}, originalProfile = currentProfile) => {
  const currentSource = getSyllabusImportScalarProvenance(currentProfile, field);
  const originalSource = getSyllabusImportScalarProvenance(originalProfile, field);
  if (currentSource === 'manual' || originalSource === 'manual') return false;

  return !normalizeProfileTextValue(currentProfile?.[field])
    || currentSource === 'syllabus'
    || originalSource === 'syllabus';
};

const buildSyllabusImportProfilePatch = (extracted = {}, currentProfile = {}, options = {}) => {
  const current = normalizePersonalStyleProfile(currentProfile);
  const original = normalizePersonalStyleProfile(options.originalProfile || currentProfile);
  const patch = {};

  const importedInstitutionName = cleanSyllabusImportValue(extracted.institutionName);
  if (!normalizeProfileTextValue(original.institutionName) && importedInstitutionName && importedInstitutionName !== normalizeProfileTextValue(current.institutionName)) {
    patch.institutionName = importedInstitutionName;
  }

  const importedStudyTrack = cleanSyllabusImportValue(extracted.studyTrack);
  if (!normalizeProfileTextValue(original.studyTrack) && importedStudyTrack && importedStudyTrack !== normalizeProfileTextValue(current.studyTrack)) {
    patch.studyTrack = importedStudyTrack;
  }

  const currentCourses = normalizeProfileListValue(current.currentCourses);
  const importedCourses = normalizeSyllabusImportList(extracted.currentCourses, 6);
  const mergedCourses = mergeImportedListIntoProfileList(currentCourses, importedCourses);
  if (importedCourses.length && !areStringListsEqual(mergedCourses, currentCourses)) {
    patch.currentCourses = mergedCourses;
  }

  const currentLecturerNames = getNormalizedLecturerNames(current);
  const importedLecturerNames = normalizeSyllabusImportList([extracted.lecturerNames, extracted.lecturerName], 12);
  const mergedLecturerNames = mergeImportedListIntoProfileList(currentLecturerNames, importedLecturerNames);
  if (importedLecturerNames.length && !areStringListsEqual(mergedLecturerNames, currentLecturerNames)) {
    patch.lecturerNames = mergedLecturerNames;
  }
  if (!normalizeProfileTextValue(original.lecturerName) && mergedLecturerNames[0] && mergedLecturerNames[0] !== normalizeProfileTextValue(current.lecturerName)) {
    patch.lecturerName = mergedLecturerNames[0];
  }

  const currentSyllabusTopics = normalizeProfileListValue(current.syllabusTopics);
  const importedSyllabusTopics = normalizeSyllabusImportList(extracted.syllabusTopics, 10, cleanSyllabusTopicValue);
  const mergedSyllabusTopics = mergeImportedListIntoProfileList(currentSyllabusTopics, importedSyllabusTopics);
  if (importedSyllabusTopics.length && !areStringListsEqual(mergedSyllabusTopics, currentSyllabusTopics)) {
    patch.syllabusTopics = mergedSyllabusTopics;
  }

  const importedAssignmentType = cleanSyllabusImportValue(extracted.assignmentType);
  if (canReplaceSyllabusImportedScalar('assignmentType', current, original) && importedAssignmentType && importedAssignmentType !== normalizeProfileTextValue(current.assignmentType)) {
    patch.assignmentType = importedAssignmentType;
  }

  const importedSubmissionDate = normalizeExternalSubmissionDate(extracted.submissionDate);
  if (canReplaceSyllabusImportedScalar('submissionDate', current, original) && importedSubmissionDate && importedSubmissionDate !== normalizeProfileTextValue(current.submissionDate)) {
    patch.submissionDate = importedSubmissionDate;
  }

  return patch;
};

const SYLLABUS_IMPORT_LIST_FIELDS = ['currentCourses', 'lecturerNames', 'syllabusTopics'];

const mergeProcessedSyllabusImportPatch = (heuristicPatch = {}, processedPatch = {}) => {
  const safeHeuristicPatch = heuristicPatch && typeof heuristicPatch === 'object' ? heuristicPatch : {};
  const safeProcessedPatch = processedPatch && typeof processedPatch === 'object' ? processedPatch : {};
  const mergedPatch = {
    ...safeHeuristicPatch,
    ...safeProcessedPatch,
  };

  for (const field of SYLLABUS_IMPORT_LIST_FIELDS) {
    const processedList = normalizeProfileListValue(safeProcessedPatch[field]);
    if (processedList.length) {
      mergedPatch[field] = processedList;
      continue;
    }

    const heuristicList = normalizeProfileListValue(safeHeuristicPatch[field]);
    if (heuristicList.length) {
      mergedPatch[field] = heuristicList;
      continue;
    }

    delete mergedPatch[field];
  }

  return mergedPatch;
};

export const mergeSyllabusImportPatchIntoProfile = (currentProfile = {}, importedPatch = {}) => {
  const current = normalizePersonalStyleProfile(currentProfile);
  const safePatch = importedPatch && typeof importedPatch === 'object' ? importedPatch : {};
  let mergedProfile = { ...current };

  const importedInstitutionName = cleanSyllabusImportValue(safePatch.institutionName);
  if (!normalizeProfileTextValue(current.institutionName) && importedInstitutionName) {
    mergedProfile.institutionName = importedInstitutionName;
  }

  const importedStudyTrack = cleanSyllabusImportValue(safePatch.studyTrack);
  if (!normalizeProfileTextValue(current.studyTrack) && importedStudyTrack) {
    mergedProfile.studyTrack = importedStudyTrack;
  }

  const importedCurrentCourses = normalizeSyllabusImportList(safePatch.currentCourses, 6);
  if (importedCurrentCourses.length) {
    mergedProfile.currentCourses = mergeImportedListIntoProfileList(
      normalizeProfileListValue(current.currentCourses),
      importedCurrentCourses,
    );
  }

  const importedLecturerNames = normalizeSyllabusImportList([safePatch.lecturerNames, safePatch.lecturerName], 12);
  if (importedLecturerNames.length) {
    const mergedLecturerNames = mergeImportedListIntoProfileList(getNormalizedLecturerNames(current), importedLecturerNames);
    mergedProfile.lecturerNames = mergedLecturerNames;
    mergedProfile.lecturerName = mergedLecturerNames[0] || '';
  }

  const importedSyllabusTopics = normalizeSyllabusImportList(safePatch.syllabusTopics, 10, cleanSyllabusTopicValue);
  if (importedSyllabusTopics.length) {
    mergedProfile.syllabusTopics = mergeImportedListIntoProfileList(
      normalizeProfileListValue(current.syllabusTopics),
      importedSyllabusTopics,
    );
  }

  const importedAssignmentType = cleanSyllabusImportValue(safePatch.assignmentType);
  if (
    importedAssignmentType
    && importedAssignmentType !== normalizeProfileTextValue(current.assignmentType)
    && canReplaceSyllabusImportedScalar('assignmentType', current, current)
  ) {
    mergedProfile.assignmentType = importedAssignmentType;
    mergedProfile = withSyllabusImportScalarProvenance(mergedProfile, 'assignmentType', 'syllabus');
  }

  const importedSubmissionDate = normalizeExternalSubmissionDate(safePatch.submissionDate);
  if (
    importedSubmissionDate
    && importedSubmissionDate !== normalizeProfileTextValue(current.submissionDate)
    && canReplaceSyllabusImportedScalar('submissionDate', current, current)
  ) {
    mergedProfile.submissionDate = importedSubmissionDate;
    mergedProfile = withSyllabusImportScalarProvenance(mergedProfile, 'submissionDate', 'syllabus');
  }

  return normalizePersonalStyleProfile(mergedProfile);
};

const buildSyllabusImportSummary = (profilePatch = {}) => {
  const parts = [
    Array.isArray(profilePatch.currentCourses) && profilePatch.currentCourses.length ? `קורסים: ${profilePatch.currentCourses.slice(0, 2).join(', ')}` : '',
    Array.isArray(profilePatch.lecturerNames) && profilePatch.lecturerNames.length ? `מרצים: ${profilePatch.lecturerNames.slice(0, 2).join(', ')}` : '',
    Array.isArray(profilePatch.syllabusTopics) && profilePatch.syllabusTopics.length ? `נושאים: ${profilePatch.syllabusTopics.slice(0, 3).join(', ')}` : '',
    profilePatch.assignmentType ? `מטלה: ${profilePatch.assignmentType}` : '',
    profilePatch.submissionDate ? `הגשה: ${profilePatch.submissionDate}` : '',
    profilePatch.institutionName ? `מוסד: ${profilePatch.institutionName}` : '',
    profilePatch.studyTrack ? `מסלול: ${profilePatch.studyTrack}` : '',
  ].filter(Boolean);

  return parts.slice(0, 3).join(' · ');
};

const extractSyllabusProfileHeuristically = ({ rawText = '', fileName = '' } = {}) => {
  const sourceText = String(rawText || '').trim();
  const lines = getSyllabusImportLines(sourceText);

  const institutionName = pickExternalText(
    findSyllabusTextMatch(sourceText, [
      /(?:מוסד(?:\s+לימודים)?|אוניברסיטה|מכללה|academic\s+institution|institution|college|university)\s*[:\-–]?\s*([^\n]{2,140})/iu,
    ]),
    lines.find((line) => /(?:אוניברסיט|מכלל|טכניון|המרכז\s+האקדמי|מכון|university|college|institute)/iu.test(line) && line.length <= 120),
  );

  const studyTrack = pickExternalText(
    findSyllabusTextMatch(sourceText, [
      /(?:חוג|מסלול|פקולטה|התמחות|department|faculty|major|program)\s*[:\-–]?\s*([^\n]{2,140})/iu,
    ]),
    lines.find((line) => /(?:חוג|מסלול|פקולטה|התמחות|department|faculty|major|program)/iu.test(line) && line.length <= 120),
  );

  const currentCourses = normalizeSyllabusImportList([
    findSyllabusTextMatch(sourceText, [
      /(?:שם\s*הקורס|שם\s+קורס|course\s+title|course\s+name)\s*[:\-–]?\s*([^\n]{2,140})/iu,
      /(?:קורס|course)\s*[:\-–]\s*([^\n]{2,140})/iu,
    ]),
    deriveCourseNameFromFileName(fileName),
  ], 6);

  const lecturerNames = normalizeSyllabusImportList(
    collectSyllabusTextMatches(sourceText, /(?:מרצה(?:\s+אחראי)?|מרצים|מנחה(?:ים)?|Instructor(?:s)?|Lecturer(?:s)?|Professor(?:s)?)\s*[:\-–]?\s*([^\n]{2,180})/giu)
      .flatMap((value) => splitPotentialLecturerNames(value)),
    12,
  );

  const rawTopicCandidates = [
    ...collectSyllabusTextMatches(sourceText, /(?:נושאי(?:\s+הקורס)?|יחידות(?:\s+הלימוד)?|topics?|modules?|units?)\s*[:\-–]?\s*([^\n]{4,180})/giu),
    ...lines.filter((line) => /^([•▪●◦*-]|\d{1,2}[.)]|(?:week|שבוע|שיעור|מפגש|unit|module)\s*\d+)/iu.test(line) && !isDeadlineLikeSyllabusTopicCandidate(line)),
  ];
  const syllabusTopics = normalizeSyllabusImportList(rawTopicCandidates, 10, cleanSyllabusTopicValue)
    .filter((item) => item.length >= 4 && item.length <= 100 && !isDeadlineLikeSyllabusTopicCandidate(item));

  const explicitDueValue = findSyllabusTextMatch(sourceText, [
    /(?:מועד\s+הגשה|תאריך\s+הגשה|הגשה|deadline|due\s+date|submission\s+date)\s*[:\-–]?\s*([^\n]{2,80})/iu,
  ]);
  const dueToken = String(explicitDueValue || '').match(/\d{4}-\d{2}-\d{2}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/)?.[0] || explicitDueValue;

  return normalizeSyllabusImportExtraction({
    institutionName,
    studyTrack,
    currentCourses,
    lecturerNames,
    syllabusTopics,
    assignmentType: inferSyllabusAssignmentType(sourceText),
    submissionDate: dueToken,
  });
};

const normalizeExternalStyleExtraction = (parsed = {}, currentProfile = {}) => {
  const style = parsed?.style && typeof parsed.style === 'object' ? parsed.style : {};
  const cover = parsed?.coverPageDefaults && typeof parsed.coverPageDefaults === 'object' ? parsed.coverPageDefaults : {};
  const assignmentType = pickExternalText(cover.assignmentType, parsed.assignmentType, style.assignmentType);
  const extractedDefaultStyle = normalizeExternalDocumentStyle(
    pickExternalText(style.defaultDocumentStyle, parsed.defaultDocumentStyle, style.documentStyle, parsed.documentStyle)
  );
  const currentCourses = uniqueExternalStrings([
    currentProfile.currentCourses || [],
    cover.courseName,
    parsed.courseName,
    cover.currentCourses,
    parsed.currentCourses,
  ], 6);
  const preferredHomeStyleIds = uniqueExternalStrings([
    currentProfile.preferredHomeStyleIds || [],
    extractedDefaultStyle,
  ], 4);

  return {
    institutionName: String(currentProfile.institutionName || '').trim() || pickExternalText(cover.institutionName, parsed.institutionName, cover.academicCenter, parsed.academicCenter),
    studyTrack: String(currentProfile.studyTrack || '').trim() || pickExternalText(cover.studyTrack, parsed.studyTrack, cover.department, parsed.department, cover.faculty, parsed.faculty, cover.major, parsed.major),
    currentCourses,
    lecturerName: String(currentProfile.lecturerName || '').trim() || pickExternalText(cover.lecturerName, parsed.lecturerName),
    assignmentType: String(currentProfile.assignmentType || '').trim() || assignmentType,
    displayName: String(currentProfile.displayName || '').trim() || pickExternalText(cover.displayName, parsed.displayName, cover.studentName, parsed.studentName),
    studentId: String(currentProfile.studentId || '').trim() || pickExternalText(cover.studentId, parsed.studentId),
    aiAssistanceDeclaration: String(currentProfile.aiAssistanceDeclaration || '').trim() || pickExternalText(cover.aiAssistanceDeclaration, parsed.aiAssistanceDeclaration),
    submissionDate: String(currentProfile.submissionDate || '').trim() || normalizeExternalSubmissionDate(pickExternalText(cover.submissionDate, parsed.submissionDate)),
    userBackground: String(currentProfile.userBackground || '').trim() || pickExternalText(style.userBackground, parsed.userBackground, style.writerIdentity, parsed.writerIdentity),
    writingGoals: String(currentProfile.writingGoals || '').trim() || pickExternalText(style.writingGoals, parsed.writingGoals, style.primaryGoal, parsed.primaryGoal),
    defaultAudience: String(currentProfile.defaultAudience || '').trim() || pickExternalText(style.defaultAudience, parsed.defaultAudience, style.audience, parsed.audience),
    formatPreferences: String(currentProfile.formatPreferences || '').trim() || pickExternalText(style.formatPreferences, parsed.formatPreferences),
    paragraphPreferences: String(currentProfile.paragraphPreferences || '').trim() || pickExternalText(style.paragraphPreferences, parsed.paragraphPreferences),
    customStyleGuidance: mergeExternalBlockText(currentProfile.customStyleGuidance, style.customStyleGuidance, parsed.customStyleGuidance, style.recommendedInstructions, parsed.recommendedInstructions),
    notes: mergeExternalBlockText(currentProfile.notes, style.notes, parsed.notes, parsed.keyFindings, style.keyFindings),
    styleTrainingSummary: mergeExternalSentenceText(currentProfile.styleTrainingSummary, parsed.profileSummary, parsed.summary, style.profileSummary, style.summary),
    manualVocabulary: uniqueExternalStrings([currentProfile.manualVocabulary || [], style.manualVocabulary, parsed.manualVocabulary, style.keyTerms, parsed.keyTerms], 24),
    manualPhrases: uniqueExternalStrings([currentProfile.manualPhrases || [], style.manualPhrases, parsed.manualPhrases, style.signaturePhrases, parsed.signaturePhrases], 18),
    preferredSentenceStructures: uniqueExternalStrings([currentProfile.preferredSentenceStructures || [], style.preferredSentenceStructures, parsed.preferredSentenceStructures], 12),
    preferredConnectors: uniqueExternalStrings([currentProfile.preferredConnectors || [], style.preferredConnectors, parsed.preferredConnectors], 12),
    preferredSentenceOpeners: uniqueExternalStrings([currentProfile.preferredSentenceOpeners || [], style.preferredSentenceOpeners, parsed.preferredSentenceOpeners], 12),
    toneDescriptors: uniqueExternalStrings([currentProfile.toneDescriptors || [], style.toneDescriptors, parsed.toneDescriptors], 12),
    tonePreferences: uniqueExternalStrings([currentProfile.tonePreferences || [], style.tonePreferences, parsed.tonePreferences, style.tone, parsed.tone], 6),
    sentenceLengthPreference: String(currentProfile.sentenceLengthPreference || '').trim() || normalizeExternalSentenceLength(pickExternalText(style.sentenceLengthPreference, parsed.sentenceLengthPreference)),
    paragraphLengthPreference: String(currentProfile.paragraphLengthPreference || '').trim() || normalizeExternalParagraphLength(pickExternalText(style.paragraphLengthPreference, parsed.paragraphLengthPreference)),
    defaultDocumentStyle: extractedDefaultStyle || String(currentProfile.defaultDocumentStyle || '').trim() || 'academic',
    preferredHomeStyleIds: preferredHomeStyleIds.length ? preferredHomeStyleIds : (Array.isArray(currentProfile.preferredHomeStyleIds) ? currentProfile.preferredHomeStyleIds : ['academic']),
    preferredDocumentTypes: uniqueExternalStrings([currentProfile.preferredDocumentTypes || [], assignmentType], 6),
  };
};

export const mergeExternalStyleExtractionIntoProfile = (parsed = {}, currentProfile = {}) => (
  normalizeExternalStyleExtraction(parsed, currentProfile)
);

export const getExternalAnalysisAvailability = (preferredProviderId = '', cfg = null) => {
  const safeCfg = cfg && typeof cfg === 'object' ? cfg : getProviderConfig();
  const names = getProviderLabelMap(safeCfg);
  const uiProviderId = normalizeExternalAnalysisProviderKey(preferredProviderId);
  const runtimePreferredProviderId = getExternalAnalysisRuntimeProviderId(preferredProviderId);
  const preferredPool = getConfiguredProviderPool(safeCfg, runtimePreferredProviderId ? [runtimePreferredProviderId] : []);
  const fallbackPool = preferredPool.length ? preferredPool : getConfiguredProviderPool(safeCfg);
  const processingProviderId = fallbackPool[0] || '';
  const processingProviderLabel = uiProviderId && runtimePreferredProviderId === 'custom' && processingProviderId === 'custom'
    ? (EXTERNAL_ANALYSIS_PROVIDER_LABELS[uiProviderId] || names.custom || 'custom')
    : (processingProviderId ? (names[processingProviderId] || processingProviderId) : '');
  return {
    hasLocalProvider: Boolean(processingProviderId),
    processingProviderId,
    processingProviderLabel,
    configuredChoices: getConfiguredProviderChoices(safeCfg),
  };
};

export const buildExternalStyleAnalysisPrompt = ({ providerId = '', profile = {} } = {}) => {
  const lecturerNames = getNormalizedLecturerNames(profile);
  const currentCourses = normalizeProfileListValue(profile.currentCourses);
  const syllabusTopics = normalizeProfileListValue(profile.syllabusTopics);
  const knownContext = [
    profile.displayName ? `- שם משתמש ידוע: ${String(profile.displayName).trim()}` : '',
    profile.institutionName ? `- מוסד/מרכז אקדמי ידוע: ${String(profile.institutionName).trim()}` : '',
    profile.studyTrack ? `- חוג/מסלול ידוע: ${String(profile.studyTrack).trim()}` : '',
    lecturerNames.length ? `- מרצים/מנחים שכבר ידועים: ${lecturerNames.join(', ')}` : '',
    currentCourses.length ? `- קורס/ים שכבר ידועים: ${currentCourses.join(', ')}` : '',
    syllabusTopics.length ? `- נושאי סילבוס/דגשים שכבר ידועים: ${syllabusTopics.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  return [
    'מטרה: נתח את סגנון הכתיבה הקבוע שלי ואת ברירות המחדל שאני נוהג לשים בעמוד שער אקדמי.',
    'החזר JSON בלבד, ללא הסברים מסביב, במבנה הבא:',
    '{"profileSummary":"","style":{"defaultAudience":"","writingGoals":"","formatPreferences":"","paragraphPreferences":"","customStyleGuidance":"","manualVocabulary":[],"manualPhrases":[],"preferredSentenceStructures":[],"preferredConnectors":[],"preferredSentenceOpeners":[],"toneDescriptors":[],"tonePreferences":[],"sentenceLengthPreference":"","paragraphLengthPreference":"","defaultDocumentStyle":"","notes":""},"coverPageDefaults":{"institutionName":"","studyTrack":"","courseName":"","lecturerName":"","assignmentType":"","displayName":"","studentId":"","aiAssistanceDeclaration":"","submissionDate":""}}',
    'כללים:',
    '- אל תמציא מידע שלא מופיע בקבצים או בקטעים.',
    '- אם שדה לא ידוע, החזר "" או [].',
    '- manualVocabulary/manualPhrases רק אם הם באמת חוזרים בעבודות.',
    '- submissionDate החזר ב-YYYY-MM-DD כשאפשר, אחרת "".',
    '- aiAssistanceDeclaration צריך להיות הטקסט המדויק אם הוא מופיע, או תקציר נאמן מאוד אם יש וריאציות דומות.',
    knownContext ? `הקשר שכבר ידוע:\n${knownContext}` : '',
    'אחרי ההחזרה אין צורך בטקסט נוסף. רק JSON.',
  ].filter(Boolean).join('\n');
};

export const processSyllabusProfileImport = async ({ rawText = '', fileName = '', profile = {}, providerConfig = null } = {}) => {
  const trimmedRawText = String(rawText || '').trim();
  const cleanFileName = String(fileName || '').trim();
  const syllabusAnalysisText = sampleSyllabusImportText(trimmedRawText, 28000);

  if (!trimmedRawText && !cleanFileName) {
    return {
      ok: false,
      status: 'empty',
      error: 'לא נמצא תוכן קריא לייבוא.',
      profilePatch: {},
      extractedSummary: '',
    };
  }

  const currentProfile = normalizePersonalStyleProfile(profile);
  const heuristicExtraction = extractSyllabusProfileHeuristically({ rawText: trimmedRawText, fileName: cleanFileName });
  const heuristicPatch = buildSyllabusImportProfilePatch(heuristicExtraction, currentProfile);
  const heuristicSummary = buildSyllabusImportSummary(heuristicPatch);
  const profileWithHeuristics = mergeSyllabusImportPatchIntoProfile(currentProfile, heuristicPatch);
  const availability = getExternalAnalysisAvailability('', providerConfig);

  if (!availability.hasLocalProvider) {
    return Object.keys(heuristicPatch).length
      ? {
          ok: true,
          status: 'heuristic',
          error: '',
          profilePatch: heuristicPatch,
          extractedSummary: heuristicSummary,
        }
      : {
          ok: false,
          status: 'no-change',
          error: 'לא הצלחתי לזהות פרטים חדשים מתוך הסילבוס.',
          profilePatch: {},
          extractedSummary: '',
        };
  }

  const knownCurrentCourses = normalizeProfileListValue(profileWithHeuristics.currentCourses);
  const knownLecturerNames = getNormalizedLecturerNames(profileWithHeuristics);
  const knownContext = [
    profileWithHeuristics.institutionName ? `- מוסד ידוע: ${profileWithHeuristics.institutionName}` : '',
    profileWithHeuristics.studyTrack ? `- מסלול ידוע: ${profileWithHeuristics.studyTrack}` : '',
    knownCurrentCourses.length ? `- קורסים ידועים: ${knownCurrentCourses.join(', ')}` : '',
    knownLecturerNames.length ? `- מרצים ידועים: ${knownLecturerNames.join(', ')}` : '',
  ].filter(Boolean).join('\n');
  const extractionPrompt = [
    'נתח קובץ סילבוס או דף קורס והחזר JSON בלבד.',
    'החזר בדיוק במבנה הבא:',
    '{"institutionName":"","studyTrack":"","currentCourses":[],"lecturerNames":[],"syllabusTopics":[],"assignmentType":"","submissionDate":""}',
    'כללים:',
    '- חלץ רק מידע שמופיע בטקסט או בשם הקובץ.',
    '- currentCourses צריכה להכיל עד 6 קורסים או שמות קורס קצרים.',
    '- lecturerNames צריכה להכיל רק שמות מרצים או מנחים.',
    '- syllabusTopics צריכה להכיל עד 8 נושאים קצרים, לא משפטים ארוכים.',
    '- submissionDate צריך להיות YYYY-MM-DD כשאפשר, אחרת "".',
    '- אם שדה לא ידוע, החזר "" או [].',
    knownContext ? `הקשר שכבר ידוע בפרופיל:\n${knownContext}` : '',
    `שם הקובץ: ${cleanFileName || 'לא צוין'}`,
    `טקסט הסילבוס:\n${syllabusAnalysisText}`,
  ].filter(Boolean).join('\n');

  try {
    const raw = await chatWithActiveProvider(extractionPrompt, '', '', {
      providerOverride: availability.processingProviderId,
      providerConfigOverride: providerConfig,
      strictProviderOverride: true,
      strictFormatting: true,
      skipAutomation: true,
      skipMultiModel: true,
      agentLabel: 'Syllabus Profile Import',
      runId: `syllabus-profile-${Date.now()}`,
    });
    const parsed = safeJsonParse(raw, null);
    if (!parsed || typeof parsed !== 'object') throw new Error('לא התקבל JSON תקין מהעיבוד המקומי.');

    const extracted = normalizeSyllabusImportExtraction(parsed);
    const profilePatch = buildSyllabusImportProfilePatch(extracted, currentProfile, { originalProfile: currentProfile });
    if (Object.keys(profilePatch).length) {
      const mergedProfilePatch = mergeProcessedSyllabusImportPatch(heuristicPatch, profilePatch);
      return {
        ok: true,
        status: 'processed',
        error: '',
        profilePatch: mergedProfilePatch,
        extractedSummary: buildSyllabusImportSummary(mergedProfilePatch),
      };
    }

    return Object.keys(heuristicPatch).length
      ? {
          ok: true,
          status: 'heuristic',
          error: '',
          profilePatch: heuristicPatch,
          extractedSummary: heuristicSummary,
        }
      : {
          ok: false,
          status: 'no-change',
          error: 'לא נמצאו שדות חדשים למילוי מתוך הסילבוס.',
          profilePatch: {},
          extractedSummary: '',
        };
  } catch (error) {
    if (Object.keys(heuristicPatch).length) {
      return {
        ok: true,
        status: 'heuristic',
        error: '',
        profilePatch: heuristicPatch,
        extractedSummary: heuristicSummary,
      };
    }

    return {
      ok: false,
      status: 'error',
      error: error?.message || 'לא הצלחתי למפות את הסילבוס לפרופיל.',
      profilePatch: {},
      extractedSummary: '',
    };
  }
};

export const processExternalStyleAnalysis = async ({ rawText = '', profile = {}, preferredProviderId = '', processingProviderId = '', providerConfig = null } = {}) => {
  const trimmedRawText = String(rawText || '').trim();
  const selectedExternalProvider = String(profile.externalStyleAnalysisProvider || preferredProviderId || '').trim();
  const requestedProcessingProviderId = String(processingProviderId || preferredProviderId || '').trim();
  const availability = getExternalAnalysisAvailability(requestedProcessingProviderId, providerConfig);
  const basePatch = {
    externalStyleAnalysisProvider: selectedExternalProvider,
    externalStyleAnalysisRaw: trimmedRawText,
    externalStyleAnalysisPendingAt: trimmedRawText ? (profile.externalStyleAnalysisPendingAt || new Date().toISOString()) : '',
    externalStyleAnalysisProcessedAt: '',
    externalStyleAnalysisStatus: trimmedRawText ? 'pending-provider' : '',
    externalStyleAnalysisLastError: '',
  };

  if (!trimmedRawText) {
    return {
      ok: false,
      status: 'empty',
      providerId: '',
      error: 'לא הודבק טקסט לניתוח.',
      profilePatch: basePatch,
    };
  }

  const parsedRawJson = safeJsonParse(trimmedRawText, null);
  if (parsedRawJson && typeof parsedRawJson === 'object') {
    return {
      ok: true,
      status: 'processed',
      providerId: availability.processingProviderId,
      error: '',
      extracted: parsedRawJson,
      profilePatch: {
        ...basePatch,
        ...normalizeExternalStyleExtraction(parsedRawJson, profile),
        externalStyleAnalysisPendingAt: '',
        externalStyleAnalysisProcessedAt: new Date().toISOString(),
        externalStyleAnalysisStatus: 'processed',
        externalStyleAnalysisLastError: '',
      },
    };
  }

  if (!availability.hasLocalProvider) {
    return {
      ok: false,
      status: 'pending-provider',
      providerId: '',
      error: '',
      profilePatch: basePatch,
    };
  }

  const extractionPrompt = [
    'אתה ממפה ניתוח סגנון חיצוני לפרופיל כתיבה פנימי.',
    'החזר JSON בלבד במבנה הבא:',
    '{"profileSummary":"","style":{"defaultAudience":"","writingGoals":"","formatPreferences":"","paragraphPreferences":"","customStyleGuidance":"","manualVocabulary":[],"manualPhrases":[],"preferredSentenceStructures":[],"preferredConnectors":[],"preferredSentenceOpeners":[],"toneDescriptors":[],"tonePreferences":[],"sentenceLengthPreference":"","paragraphLengthPreference":"","defaultDocumentStyle":"","notes":""},"coverPageDefaults":{"institutionName":"","studyTrack":"","courseName":"","lecturerName":"","assignmentType":"","displayName":"","studentId":"","aiAssistanceDeclaration":"","submissionDate":""}}',
    'כללים:',
    '- אל תמציא. אם אין בסיס, השאר "" או [].',
    '- אם הטקסט המודבק כבר דומה ל-JSON, חלץ ממנו את הערכים בלי שכתוב מיותר.',
    '- courseName צריך להכיל שם קורס אחד מרכזי אם יש כזה.',
    '- submissionDate החזר כ-YYYY-MM-DD כשאפשר, אחרת "".',
    '',
    `טקסט ניתוח חיצוני מודבק:\n${trimmedRawText.slice(0, 16000)}`,
  ].join('\n');

  try {
    const raw = await chatWithActiveProvider(extractionPrompt, '', '', {
      providerOverride: availability.processingProviderId,
      providerConfigOverride: providerConfig,
      strictProviderOverride: true,
      strictFormatting: true,
      skipAutomation: true,
      skipMultiModel: true,
      agentLabel: 'External Style Extractor',
      runId: `external-style-${Date.now()}`,
    });
    const parsed = safeJsonParse(raw, null);
    if (!parsed || typeof parsed !== 'object') throw new Error('לא התקבל JSON תקין מהעיבוד המקומי.');
    return {
      ok: true,
      status: 'processed',
      providerId: availability.processingProviderId,
      error: '',
      extracted: parsed,
      profilePatch: {
        ...basePatch,
        ...normalizeExternalStyleExtraction(parsed, profile),
        externalStyleAnalysisPendingAt: '',
        externalStyleAnalysisProcessedAt: new Date().toISOString(),
        externalStyleAnalysisStatus: 'processed',
        externalStyleAnalysisLastError: '',
      },
    };
  } catch (error) {
    const message = error?.message || 'שגיאה בעיבוד התוצאה החיצונית.';
    return {
      ok: false,
      status: 'error',
      providerId: availability.processingProviderId,
      error: message,
      profilePatch: {
        ...basePatch,
        externalStyleAnalysisStatus: 'error',
        externalStyleAnalysisLastError: message,
      },
    };
  }
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

const AI_REQUEST_TIMEOUT_ERROR_CODE = 'AI_REQUEST_TIMEOUT';

export const isAiRequestTimeoutError = (error) => (
  Boolean(error?.isTimeout)
  || String(error?.code || '').trim().toUpperCase() === AI_REQUEST_TIMEOUT_ERROR_CODE
  || String(error?.name || '').trim() === 'TimeoutError'
  || /הבקשה\s+ארכה\s+יותר\s+מדי/.test(String(error?.message || ''))
);

const buildAiRequestTimeoutError = (timeoutMs) => {
  const safeTimeoutMs = Number(timeoutMs);
  const seconds = Math.max(1, Math.round(safeTimeoutMs / 1000));
  const error = new Error(`הבקשה ארכה יותר מדי זמן (${seconds} שניות)`);
  error.name = 'TimeoutError';
  error.code = AI_REQUEST_TIMEOUT_ERROR_CODE;
  error.isTimeout = true;
  error.timeoutMs = safeTimeoutMs;
  return error;
};

const withTimeout = async (promise, timeoutMs, onTimeout) => {
  const safeTimeoutMs = Number(timeoutMs);
  if (!Number.isFinite(safeTimeoutMs) || safeTimeoutMs <= 0) return promise;

  let timerId = null;
  let timeoutError = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timerId = window.setTimeout(() => {
          try { onTimeout?.(); } catch {}
          timeoutError = buildAiRequestTimeoutError(safeTimeoutMs);
          reject(timeoutError);
        }, safeTimeoutMs);
      }),
    ]);
  } finally {
    if (timerId !== null) window.clearTimeout(timerId);
  }
};

const GEMINI_TRANSIENT_OVERLOAD_PATTERN = /\b(?:429|502|503|504)\b|high demand|try again later|service unavailable|overloaded|resource exhausted/i;

const isTransientGeminiOverloadError = (error) => {
  const message = typeof error === 'string' ? error : error?.message || '';
  return GEMINI_TRANSIENT_OVERLOAD_PATTERN.test(String(message || ''));
};

const buildGeminiTransientOverloadError = (model = '') => {
  const safeModel = String(model || '').trim() || 'המודל הנוכחי';
  return new Error(`Gemini עמוס כרגע במודל ${safeModel}. זה עומס זמני של השירות. אפשר לנסות שוב בעוד רגע או לעבור זמנית ל-gemini-2.5-flash.`);
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
  lastVerifiedSourceQuery: '',
  lastVerifiedSourceWorkspaceId: '',
  recentVerifiedSourceAllowedUrls: [],
  recentVerifiedSourceWorkspaceId: '',
  recentVerifiedSourceUpdatedAt: '',
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

const shouldPreservePriorDocumentFromManagerReview = (deliverable = '', previousDocument = '') => {
  const normalizedDeliverable = normalizeArtifactText(deliverable);
  const normalizedPrevious = normalizeArtifactText(previousDocument);
  if (!normalizedPrevious) return false;
  if (!normalizedDeliverable) return true;

  return /(?:^|\n)(?:MISSING|DECISION|CHECKLIST)\s*:/i.test(normalizedDeliverable);
};

const isAgentNotesAppendixOnlyArtifact = (value = '') => {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) return false;
  if (/^\s*<div[^>]*data-agent-notes\s*=\s*["']true["'][^>]*>/i.test(normalizedValue)) return true;
  
  const appendixPatterns = [
    /^(?:<[^>]+>\s*){0,4}(?:להלן|הנה|מצורף|בסוף|[\*\-#_]+|במידה ו|לבקשתך)?\s*נספח\s+(?:הערות|הערת)\s+(?:סוכנים|מנהל|הסוכנים)/i,
    /^(?:<[^>]+>\s*){0,4}<h[1-6]>\s*(?:להלן|הנה|מצורף|בסוף)?\s*נספח\s+(?:הערות|הערת)\s+(?:סוכנים|מנהל|הסוכנים)/i
  ];
  if (appendixPatterns.some(pattern => pattern.test(normalizedValue))) return true;

  if (normalizedValue.length < 2500 && /(?:נספח\s+(?:הערות|הערת)\s+(?:סוכנים|מנהל)|סיכום\s+מנהל\s+העבודה|הערות\s+לפי\s+סוכן)/i.test(normalizedValue)) {
    if (/^\s*(<[^>]+>)*\s*(?:הנה|להלן|מצורף|_+|#+|נספח|הערות)/i.test(normalizedValue)) {
       return true;
    }
  }

  return false;
};

const shouldPreservePriorDocumentFromStageArtifact = ({
  packet = null,
  previousDocument = '',
  stageAgent = null,
  expectDocumentOutput = false,
} = {}) => {
  const normalizedPrevious = normalizeArtifactText(previousDocument);
  if (!expectDocumentOutput || !normalizedPrevious) return false;

  const deliverable = String(packet?.deliverable || '').trim();
  if (packet?.structuredWithoutDeliverable === true) return true;
  if (isAgentNotesAppendixOnlyArtifact(deliverable)) return true;
  if (isManagerReviewAgent(stageAgent)) {
    return shouldPreservePriorDocumentFromManagerReview(deliverable, previousDocument);
  }
  return false;
};

const resolveDocumentPreservationCandidate = (primaryDocument = '', fallbackDocument = '') => {
  const primaryText = String(primaryDocument || '').trim();
  if (primaryText && !isAgentNotesAppendixOnlyArtifact(primaryText)) return primaryText;
  return String(fallbackDocument || '').trim();
};

const WORKFLOW_SHARED_MEMORY_TOTAL_LIMIT = 10000;
const WORKFLOW_SHARED_MEMORY_ITEM_LIMIT = 2200;
const WORKFLOW_SHARED_MEMORY_MAX_ITEMS = 8;

const buildWorkflowSharedMemoryBlock = (artifacts = []) => {
  const usableArtifacts = (Array.isArray(artifacts) ? artifacts : [])
    .filter((item) => item && String(item.text || item.preview || '').trim())
    .slice(-WORKFLOW_SHARED_MEMORY_MAX_ITEMS);

  if (!usableArtifacts.length) return '';

  let remaining = WORKFLOW_SHARED_MEMORY_TOTAL_LIMIT;
  const sections = [];
  usableArtifacts.forEach((item, index) => {
    if (remaining <= 0) return;
    const label = String(item.agentLabel || item.agentId || `שלב ${index + 1}`).trim();
    const role = String(item.roleKey || '').trim();
    const text = String(item.text || item.preview || '').trim();
    const clippedText = text.length > WORKFLOW_SHARED_MEMORY_ITEM_LIMIT
      ? `${text.slice(0, WORKFLOW_SHARED_MEMORY_ITEM_LIMIT).trimEnd()}\n[... קוצר תוצר ביניים כדי לשמור מקום לשאר תיק העבודה ...]`
      : text;
    const section = `### ${label}${role ? ` (${role})` : ''}\n${clippedText}`;
    const clippedSection = section.length > remaining
      ? `${section.slice(0, remaining).trimEnd()}\n[... קוצר תיק העבודה המצטבר ...]`
      : section;
    if (clippedSection.trim()) {
      sections.push(clippedSection);
      remaining -= clippedSection.length + 2;
    }
  });

  return sections.length
    ? `תיק עבודה מצטבר מהשלבים הקודמים:\n${sections.join('\n\n')}`
    : '';
};

const escapeHtmlForOutput = (value = '') => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const stripSourceGroundingFailureToken = (value = '') => String(value || '')
  .replace(SOURCE_GROUNDING_FAILURE_TOKEN, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const buildForcedSourceGroundingFailureDocumentHtml = ({ url = '', failureText = '' } = {}) => {
  const safeUrl = escapeHtmlForOutput(String(url || '').trim());
  const safeFailureText = escapeHtmlForOutput(stripSourceGroundingFailureToken(failureText));
  return [
    '<p><strong>לא הצלחתי לאמת או לגשת לכתבה המדויקת שסופקה, ולכן איני ממשיך לכתוב על מקור אחר.</strong></p>',
    safeUrl ? `<p>ה-URL שננעל לבקשה: ${safeUrl}</p>` : '',
    safeFailureText ? `<p>${safeFailureText}</p>` : '',
  ].filter(Boolean).join('');
};

const looksLikeHtmlDocument = (value = '') => /<(h[1-6]|p|div|ul|ol|li|table|section|article|strong|em|blockquote|br)\b/i.test(String(value || ''));

const normalizeStageNote = (value = '') => String(value || '').replace(/\n{2,}/g, '\n').trim();
const splitStageNoteLines = (value = '') => normalizeStageNote(value)
  .split(/\n+/)
  .map((line) => line.replace(/^[\s\-•*]+/, '').trim())
  .filter(Boolean);

const renderStageNoteHtml = (value = '', emptyHtml = '<p>אין פרטים נוספים.</p>') => {
  const lines = splitStageNoteLines(value);
  if (!lines.length) return emptyHtml;
  if (lines.length === 1) return `<p>${escapeHtmlForOutput(lines[0])}</p>`;
  return `<ul>${lines.map((line) => `<li>${escapeHtmlForOutput(line)}</li>`).join('')}</ul>`;
};

const renderStageNoteText = (value = '', emptyText = 'אין פרטים נוספים.') => {
  const lines = splitStageNoteLines(value);
  if (!lines.length) return emptyText;
  return lines.map((line) => `- ${line}`).join('\n');
};

const buildSubmissionReadinessSignal = (managerMissing = '', managerDecision = '') => {
  const signal = `${String(managerMissing || '')}\n${String(managerDecision || '')}`.trim();
  const hasGaps = hasMeaningfulMissingItems(signal);
  const score = hasGaps ? 86 : 95;
  const adherence = hasGaps
    ? 'היצמדות להנחיות טובה, אך נדרש חידוד לפני הגשה סופית.'
    : 'היצמדות גבוהה להנחיות, מבנה ברור ותוצר מוכן להגשה.';
  return {
    score,
    adherence,
    disclaimer: 'זו אינדיקציה חישובית פנימית, לא ביקורת של סוכן או איש צוות אמיתי.',
  };
};

const buildAgentNotesAppendix = ({ stageNotes = [], notesInstruction = '', managerPacket = null, managerLabel = 'מנהל העבודה', preferHtml = false }) => {
  const normalizedNotes = (Array.isArray(stageNotes) ? stageNotes : [])
    .map((item) => ({
      agentLabel: String(item?.agentLabel || '').trim(),
      note: normalizeStageNote(item?.note || ''),
      roundIndex: Number(item?.roundIndex || 1),
    }))
    .filter((item) => item.agentLabel && item.note);

  const managerMissing = String(managerPacket?.missing || '').trim();
  const managerDecision = String(managerPacket?.decision || '').trim();
  const managerHandoff = String(managerPacket?.handoff || '').trim();
  const managerSummary = [managerHandoff, managerMissing, managerDecision].filter(Boolean).join('\n');
  const readinessSignal = buildSubmissionReadinessSignal(managerMissing, managerDecision);
  const hasOpenGaps = hasMeaningfulMissingItems(managerMissing);

  if (preferHtml) {
    const notesList = normalizedNotes.length
      ? `<div style="display:grid;gap:12px;">${normalizedNotes.map((item) => `
        <div style="border:1px solid #E2E8F0;border-radius:14px;padding:12px 14px;background:#FFFFFF;">
          <div style="font-weight:700;color:#0F172A;margin-bottom:6px;">${escapeHtmlForOutput(item.agentLabel)}${item.roundIndex > 1 ? ` <span style="font-weight:600;color:#64748B;">(סבב ${item.roundIndex})</span>` : ''}</div>
          <div style="color:#334155;line-height:1.7;">${renderStageNoteHtml(item.note)}</div>
        </div>`).join('')}</div>`
      : '<p>לא נאספו הערות סוכנים לסבב זה.</p>';
    const openGapsBlock = hasOpenGaps
      ? `
  <div data-open-gaps="true" style="margin:18px 0;border:1px solid #FCA5A5;background:#FEF2F2;border-radius:16px;padding:14px 16px;color:#991B1B;">
    <h3 style="margin:0 0 8px;color:#B91C1C;">חלקים חסרים שדורשים השלמה</h3>
    ${renderStageNoteHtml(managerMissing)}
    ${managerDecision ? `<div style="margin-top:10px;"><strong>החלטת מנהל:</strong>${renderStageNoteHtml(managerDecision, '<p>אין החלטת מנהל נוספת.</p>')}</div>` : ''}
    <p style="margin-top:10px;"><strong>המסמך הוחזר במצב חלקי.</strong> לא אושר או לא התאפשר סבב נוסף, ולכן הפערים נשארו מסומנים באדום.</p>
  </div>`.trim()
      : '';

    return `
<div data-agent-notes="true" style="margin-top:28px;border-top:1px solid #D1D5DB;padding-top:18px;">
  <h2>נספח הערות סוכנים</h2>
  ${notesInstruction ? `<p><strong>הנחיית משתמש לנספח:</strong> ${escapeHtmlForOutput(notesInstruction)}</p>` : ''}
  ${openGapsBlock}
  <h3>סיכום מנהל העבודה</h3>
  ${renderStageNoteHtml(managerSummary || `${managerLabel} לא הוסיף הערות מפורטות לסיום.`)}
  <h3>אינדיקציה פנימית להגשה</h3>
  <p><strong>מדד פנימי:</strong> ${readinessSignal.score}/100</p>
  <p><em>${escapeHtmlForOutput(readinessSignal.disclaimer)}</em></p>
  <p>${escapeHtmlForOutput(readinessSignal.adherence)}</p>
  <h3>הערות לפי סוכן</h3>
  ${notesList}
</div>`.trim();
  }

  const noteLines = normalizedNotes.length
    ? normalizedNotes.map((item) => `- ${item.agentLabel}${item.roundIndex > 1 ? ` (סבב ${item.roundIndex})` : ''}: ${item.note}`).join('\n')
    : '- לא נאספו הערות סוכנים לסבב זה.';
  const plainNotesInstructionText = String(notesInstruction || '').trim();
  const openGapsBlock = hasOpenGaps
    ? [
        'חלקים חסרים שדורשים השלמה:',
        renderStageNoteText(managerMissing),
        managerDecision ? '' : '',
        managerDecision ? 'החלטת מנהל:' : '',
        managerDecision ? renderStageNoteText(managerDecision) : '',
        'המסמך הוחזר במצב חלקי כי לא אושר או לא התאפשר סבב נוסף, ולכן הפערים נשארו מסומנים באדום.',
        '',
      ].filter(Boolean).join('\n')
    : '';

  return [
    'נספח הערות סוכנים',
    plainNotesInstructionText ? `הנחיית משתמש לנספח: ${plainNotesInstructionText}` : '',
    '',
    openGapsBlock,
    'סיכום מנהל העבודה:',
    managerSummary || `${managerLabel} לא הוסיף הערות מפורטות לסיום.`,
    '',
    'אינדיקציה פנימית להגשה',
    `מדד פנימי: ${readinessSignal.score}/100`,
    readinessSignal.disclaimer,
    readinessSignal.adherence,
    '',
    'הערות לפי סוכן:',
    noteLines,
  ].filter(Boolean).join('\n');
};

const appendNotesToOutput = ({ output = '', appendix = '' }) => {
  const base = String(output || '').trim();
  const suffix = String(appendix || '').trim();
  if (!suffix) return base;
  if (!base) return suffix;
  return `${base}\n\n${suffix}`;
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

const getLastVerifiedSourceQuery = ({ workspaceId = '' } = {}) => {
  const current = getAppMemory();
  const safeWorkspaceId = String(workspaceId || getWorkspaceAutomation().activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  if (String(current.lastVerifiedSourceWorkspaceId || '').trim() !== safeWorkspaceId) return '';
  return String(current.lastVerifiedSourceQuery || '').trim();
};

const hasRecentVerifiedSourceFollowUpContext = ({ workspaceId = '', maxAgeMs = RECENT_VERIFIED_SOURCE_FOLLOW_UP_WINDOW_MS } = {}) => {
  const current = getAppMemory();
  const safeWorkspaceId = String(workspaceId || getWorkspaceAutomation().activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  if (String(current.lastVerifiedSourceWorkspaceId || '').trim() !== safeWorkspaceId) return false;
  const recentSourceReply = [...(Array.isArray(current.recentChats) ? current.recentChats : [])]
    .reverse()
    .find((item) => VERIFIED_SOURCE_REPLY_PATTERN.test(String(item?.replyPreview || '').trim()));
  if (!recentSourceReply?.ts) return false;
  const recentTs = Date.parse(recentSourceReply.ts);
  if (!Number.isFinite(recentTs)) return false;
  const ageMs = Date.now() - recentTs;
  return ageMs >= 0 && ageMs <= maxAgeMs;
};

const getRecentVerifiedSourceAllowedUrls = ({ workspaceId = '', maxAgeMs = RECENT_VERIFIED_SOURCE_FOLLOW_UP_WINDOW_MS } = {}) => {
  const current = getAppMemory();
  const safeWorkspaceId = String(workspaceId || getWorkspaceAutomation().activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  if (String(current.recentVerifiedSourceWorkspaceId || '').trim() !== safeWorkspaceId) return new Set();
  const recentTs = Date.parse(current.recentVerifiedSourceUpdatedAt || '');
  if (!Number.isFinite(recentTs)) return new Set();
  const ageMs = Date.now() - recentTs;
  if (ageMs < 0 || ageMs > maxAgeMs) return new Set();
  return buildVerifiedSourceAllowedUrlSet(current.recentVerifiedSourceAllowedUrls || []);
};

const rememberVerifiedSourceAllowedUrls = ({ urls = [], workspaceId = '' } = {}) => {
  const safeWorkspaceId = String(workspaceId || getWorkspaceAutomation().activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  const nextUrls = buildVerifiedSourceAllowedUrlSet(urls);
  if (!nextUrls.size) return getRecentVerifiedSourceAllowedUrls({ workspaceId: safeWorkspaceId });

  const current = getAppMemory();
  const currentUrls = String(current.recentVerifiedSourceWorkspaceId || '').trim() === safeWorkspaceId
    ? buildVerifiedSourceAllowedUrlSet(current.recentVerifiedSourceAllowedUrls || [])
    : new Set();
  const mergedUrls = Array.from(new Set([
    ...Array.from(currentUrls),
    ...Array.from(nextUrls),
  ])).slice(-RECENT_VERIFIED_SOURCE_ALLOWED_URL_LIMIT);

  saveAppMemory({
    ...current,
    recentVerifiedSourceAllowedUrls: mergedUrls,
    recentVerifiedSourceWorkspaceId: safeWorkspaceId,
    recentVerifiedSourceUpdatedAt: new Date().toISOString(),
  });
  return buildVerifiedSourceAllowedUrlSet(mergedUrls);
};

const rememberVerifiedSourceQuery = ({ query = '', workspaceId = '' } = {}) => {
  const safeQuery = String(query || '').trim();
  if (!safeQuery) return getAppMemory();
  const safeWorkspaceId = String(workspaceId || getWorkspaceAutomation().activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  const current = getAppMemory();
  return saveAppMemory({
    ...current,
    lastVerifiedSourceQuery: trimLogText(safeQuery, 420),
    lastVerifiedSourceWorkspaceId: safeWorkspaceId,
  });
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
  syncPersistedAppSettings();
  return next;
};

export const clearAppMemory = () => {
  localStorage.setItem(APP_MEMORY_STORAGE_KEY, JSON.stringify(DEFAULT_APP_MEMORY));
  syncPersistedAppSettings();
};

export const clearSidebarChatHistory = ({ workspaceId = '', clearAll = false } = {}) => {
  const legacyKey = 'wordai_sidebar_messages';
  const activeWorkspaceId = String(workspaceId || getWorkspaceAutomation().activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  const scopedKey = `${legacyKey}:${activeWorkspaceId}`;
  const currentMemory = getAppMemory();

  if (clearAll) {
    Object.keys(localStorage)
      .filter((key) => key === legacyKey || key.startsWith(`${legacyKey}:`))
      .forEach((key) => localStorage.removeItem(key));
    saveAppMemory({
      ...currentMemory,
      recentChats: [],
      lastVerifiedSourceQuery: '',
      lastVerifiedSourceWorkspaceId: '',
      recentVerifiedSourceAllowedUrls: [],
      recentVerifiedSourceWorkspaceId: '',
      recentVerifiedSourceUpdatedAt: '',
    });
  } else {
    localStorage.removeItem(scopedKey);
    localStorage.removeItem(legacyKey);
    if (String(currentMemory.lastVerifiedSourceWorkspaceId || '').trim() === activeWorkspaceId) {
      saveAppMemory({
        ...currentMemory,
        lastVerifiedSourceQuery: '',
        lastVerifiedSourceWorkspaceId: '',
        recentVerifiedSourceAllowedUrls: [],
        recentVerifiedSourceWorkspaceId: '',
        recentVerifiedSourceUpdatedAt: '',
      });
    }
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

const MAX_CONVERSATION_HISTORY_PROMPT_TURNS = 12;
const MAX_CONVERSATION_HISTORY_PROMPT_CHARS = 2400;

const normalizeConversationHistoryForPrompt = (value = []) => {
  if (!Array.isArray(value) || !value.length) return [];

  const normalized = value
    .map((entry) => {
      const role = entry?.role === 'assistant'
        ? 'assistant'
        : (entry?.role === 'user' ? 'user' : '');
      const content = trimLogText(String(entry?.content || '').replace(/\s+/g, ' ').trim(), 320);
      if (!role || !content) return null;
      return { role, content };
    })
    .filter(Boolean)
    .slice(-MAX_CONVERSATION_HISTORY_PROMPT_TURNS);

  if (!normalized.length) return [];

  let remainingChars = MAX_CONVERSATION_HISTORY_PROMPT_CHARS;
  const compactHistory = [];
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    if (remainingChars <= 0) break;
    const entry = normalized[index];
    const boundedLength = Math.max(80, remainingChars);
    const content = entry.content.length > remainingChars
      ? trimLogText(entry.content, boundedLength)
      : entry.content;
    if (!content) continue;
    compactHistory.push({ ...entry, content });
    remainingChars -= content.length;
  }

  return compactHistory.reverse();
};

const buildConversationHistoryPrompt = (value = []) => {
  const history = normalizeConversationHistoryForPrompt(value);
  if (!history.length) return '';
  return history
    .map((entry, index) => `${index + 1}. ${entry.role === 'assistant' ? 'עוזר' : 'משתמש'}: ${entry.content}`)
    .join('\n');
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
    // משפחות מודלים מקומיים/Ollama — זרות לספקי הענן הסגורים (gemini/claude/openai).
    // בלי זה מודל כמו "llama3.2" (ברירת המחדל של Ollama) דלף ל-Gemini ויצר 404 → שלד מקומי.
    // לא מוסיפים ל-groq/perplexity: groq מריץ llama/mixtral/gemma לגיטימית, ול-perplexity יש llama-*-sonar.
    const LOCAL_MODEL_FAMILY = 'llama|codellama|mistral|mixtral|qwen|qwq|phi|deepseek|gemma|vicuna|tinyllama|dolphin|nous|openhermes|starling|falcon|wizardlm';
    const foreignFamiliesByProvider = {
      gemini: new RegExp(`^(claude|gpt|o\\d+|sonar|pplx|${LOCAL_MODEL_FAMILY})`),
      claude: new RegExp(`^(gemini|learnlm|gpt|o\\d+|sonar|pplx|${LOCAL_MODEL_FAMILY})`),
      openai: new RegExp(`^(claude|gemini|learnlm|sonar|pplx|${LOCAL_MODEL_FAMILY})`),
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
    case 'scholar':
      return normalizeProviderModelName('scholar', cfg.scholar.model || 'serpapi');
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
      stages: requestedRunId
        ? []
        : orderedAgents.map((agent) => ({ id: agent.id, label: agent.name, state: 'idle', details: 'לא הופעל' })),
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
  const initialRequestLog = runLogs.find((log) => log.type === 'request-start') || null;
  const runSkippedAutomation = initialRequestLog?.automationSkipped === true
    || ['skipAutomation', 'providerOverride', 'noActiveAgents'].includes(String(initialRequestLog?.automationSkipReason || '').trim());
  const hasApiAttempt = runLogs.some((log) => ['request-start', 'provider-start', 'attempt-start', 'multi-model-start'].includes(log.type));
  const hasApiSuccess = runLogs.some((log) => ['attempt-success', 'multi-model-success', 'workflow-success'].includes(log.type));
  const managerRequired = !runSkippedAutomation && automation?.enabled !== false && AUTOPILOT_MANAGER_WORKFLOW_MODES.has(runWorkflowMode) && automation?.autopilotEnabled !== false;
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
    ...(runSkippedAutomation ? [] : orderedAgents.map((agent) => agent.id)),
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
        details: managerRequired ? (managerSuccess ? 'המנהל בנה מסלול עבודה והקצה שלבים' : managerFailure ? 'המנהל לא הצליח לנהל את ההרצה' : 'המנהל טרם הופעל בהרצה האחרונה') : runSkippedAutomation ? 'לא נדרש במסלול זה' : 'לא נדרש במצב הנוכחי',
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
const createProxyAbortError = () => {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
};

const createProxyRequestId = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {}
  return `proxy-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const proxyDesktopHttpRequest = async ({ url, method = 'POST', headers = {}, body, timeoutMs = 0 } = {}, signal) => {
  if (!(typeof window !== 'undefined' && window.desktopApp?.proxyHttpRequest)) {
    // אתר (ללא דסקטופ): מארחים חסומי-CORS (SerpAPI/Copyleaks) עוברים דרך ה-relay בשרת.
    // השאר (ספקי AI) מחזירים null → הקורא עושה fetch ישיר (עובד ישירות מהדפדפן).
    if (shouldRelayHostViaFunction(url)) {
      return relayHttpRequestViaFunction({ url, method, headers, body, timeoutMs }, signal);
    }
    return null;
  }

  if (signal?.aborted) throw createProxyAbortError();

  const requestId = createProxyRequestId();
  let abortHandler = null;

  try {
    if (signal && window.desktopApp?.abortProxyHttpRequest) {
      abortHandler = () => {
        Promise.resolve(window.desktopApp.abortProxyHttpRequest(requestId)).catch(() => {});
      };
      signal.addEventListener('abort', abortHandler, { once: true });
      if (signal.aborted) {
        abortHandler();
        throw createProxyAbortError();
      }
    }

    const requestPromise = window.desktopApp.proxyHttpRequest({ url, method, headers, body, requestId, timeoutMs });
    if (!signal || !window.desktopApp?.abortProxyHttpRequest) return await requestPromise;
    if (signal.aborted) {
      abortHandler?.();
      throw createProxyAbortError();
    }

    const abortPromise = new Promise((_, reject) => {
      const rejectOnAbort = () => reject(createProxyAbortError());
      signal.addEventListener('abort', rejectOnAbort, { once: true });
      requestPromise.then(
        () => signal.removeEventListener('abort', rejectOnAbort),
        () => signal.removeEventListener('abort', rejectOnAbort),
      );
    });

    return await Promise.race([requestPromise, abortPromise]);
  } finally {
    if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
  }
};

const normalizeCompletionMetadataValue = (value = '') => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const normalizeProviderCompletionPayload = (completion = {}, provider = '') => {
  if (!completion || typeof completion !== 'object' || Array.isArray(completion)) return null;
  const finishReason = normalizeCompletionMetadataValue(completion.finishReason);
  const stopReason = normalizeCompletionMetadataValue(completion.stopReason);
  const reason = normalizeCompletionMetadataValue(completion.reason) || finishReason || stopReason;
  const providerId = normalizeCompletionMetadataValue(completion.provider) || normalizeCompletionMetadataValue(provider);
  const model = normalizeCompletionMetadataValue(completion.model);
  const allowedUrls = Array.from(buildVerifiedSourceAllowedUrlSet(
    Array.isArray(completion.allowedUrls) ? completion.allowedUrls : []
  ));
  const webResults = dedupeGroundedWebResults(
    Array.isArray(completion.webResults) ? completion.webResults : [],
    GROUNDED_WEB_RESULT_LIMIT,
  );
  const normalized = {
    ...(reason ? { reason } : {}),
    ...(finishReason ? { finishReason } : {}),
    ...(stopReason ? { stopReason } : {}),
    ...(providerId ? { provider: providerId } : {}),
    ...(model ? { model } : {}),
    ...(allowedUrls.length ? { allowedUrls } : {}),
    ...(webResults.length ? { webResults } : {}),
  };
  return Object.keys(normalized).length ? normalized : null;
};

const normalizeProviderTextResponse = (response = '', provider = '') => {
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    const text = typeof response.text === 'string'
      ? response.text
      : String(response.text ?? '');
    const completion = normalizeProviderCompletionPayload(response.completion, provider);
    return completion ? { text, completion } : { text };
  }
  return { text: String(response || '') };
};

const finalizeProviderTextResponse = (response = '', provider = '', includeCompletionMetadata = false) => {
  const normalized = normalizeProviderTextResponse(response, provider);
  return includeCompletionMetadata ? normalized : normalized.text;
};

export const callOpenAICompatible = async (baseUrl, apiKey, model, messages, signal, options = {}) => {
  const includeCompletionMetadata = options.includeCompletionMetadata === true;
  const requestBodyExtras = options.requestBodyExtras && typeof options.requestBodyExtras === 'object' && !Array.isArray(options.requestBodyExtras)
    ? options.requestBodyExtras
    : null;
  const url = baseUrl.replace(/\/$/, '') + '/chat/completions';
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const bodyStr = JSON.stringify({
    model,
    messages,
    max_tokens: 4096,
    stream: false,
    ...(requestBodyExtras || {}),
  });
  const buildResponse = (data = {}) => {
    const webResults = extractPerplexityGroundedWebResultsFromPayload(data, GROUNDED_WEB_RESULT_LIMIT);
    return finalizeProviderTextResponse({
      text: data.choices?.[0]?.message?.content || '',
      completion: {
        finishReason: data.choices?.[0]?.finish_reason || '',
        ...(webResults.length ? {
          webResults,
          allowedUrls: webResults.map((item) => item.url).filter(Boolean),
        } : {}),
      },
    }, '', includeCompletionMetadata);
  };

  // ב-Electron: נשלח דרך main process כדי לעקוף CORS
  const desktopResult = await proxyDesktopHttpRequest({ url, method: 'POST', headers, body: bodyStr }, signal);
  if (desktopResult) {
    const result = desktopResult;
    if (!result.ok) {
      throw new Error(`שגיאת API (${result.status}): ${String(result.body || '').slice(0, 300)}`);
    }
    const data = JSON.parse(result.body);
    return buildResponse(data);
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
  return buildResponse(data);
};

// route 1 — OpenAI web_search דרך ה-Responses API (/v1/responses). עובד עם מודלים רגילים
// (gpt-4o/4.1/5) ולא רק search-preview, ומחזיר ציטוטי-URL ב-annotations.
const extractOpenAIResponsesUrls = (data = {}) => {
  const urls = new Set();
  for (const item of (Array.isArray(data?.output) ? data.output : [])) {
    if (item?.type === 'message' && Array.isArray(item.content)) {
      for (const part of item.content) {
        for (const annotation of (Array.isArray(part?.annotations) ? part.annotations : [])) {
          const url = String(annotation?.url || '').trim();
          if (url) urls.add(url);
        }
      }
    }
  }
  return Array.from(urls).filter(Boolean);
};

const extractOpenAIResponsesText = (data = {}) => {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const parts = [];
  for (const item of (Array.isArray(data?.output) ? data.output : [])) {
    if (item?.type === 'message' && Array.isArray(item.content)) {
      for (const part of item.content) {
        if ((part?.type === 'output_text' || typeof part?.text === 'string') && part.text) parts.push(part.text);
      }
    }
  }
  return parts.join('').trim();
};

const callOpenAIResponsesWithWebSearch = async (apiKey, model, systemPrompt, userMessage, signal, options = {}) => {
  const includeCompletionMetadata = options.includeCompletionMetadata === true;
  const url = 'https://api.openai.com/v1/responses';
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const bodyStr = JSON.stringify({
    model: String(model || '').trim() || 'gpt-4o',
    ...(String(systemPrompt || '').trim() ? { instructions: systemPrompt } : {}),
    input: userMessage,
    tools: [{ type: 'web_search' }],
    max_output_tokens: 8192,
  });
  const buildResponse = (data = {}) => {
    const allowedUrls = extractOpenAIResponsesUrls(data);
    return finalizeProviderTextResponse({
      text: extractOpenAIResponsesText(data),
      completion: {
        finishReason: data?.status || '',
        ...(allowedUrls.length ? { allowedUrls } : {}),
      },
    }, '', includeCompletionMetadata);
  };
  const desktopResult = await proxyDesktopHttpRequest({ url, method: 'POST', headers, body: bodyStr }, signal);
  if (desktopResult) {
    if (!desktopResult.ok) {
      throw new Error(`OpenAI API (${desktopResult.status}): ${String(desktopResult.body || '').slice(0, 300)}`);
    }
    return buildResponse(JSON.parse(desktopResult.body));
  }
  const res = await fetch(url, { method: 'POST', headers, signal, body: bodyStr });
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`OpenAI API (${res.status}): ${txt.slice(0, 300)}`);
  }
  return buildResponse(await res.json());
};

// ═══════════════════════════════════════
// Claude (Anthropic)
// ═══════════════════════════════════════
// בוחר את גרסת ה-server-tool של web_search לפי המודל: הגרסה החדשה (dynamic filtering)
// נתמכת ב-Opus 4.6/4.7/4.8, Sonnet 4.6 ו-Fable/Mythos 5; מודלים ישנים יותר מקבלים את הבסיסית.
const resolveClaudeWebSearchToolType = (model = '') => {
  const normalized = String(model || '').toLowerCase();
  return /(opus-4-(?:6|7|8)|sonnet-4-6|fable-5|mythos-5)/.test(normalized)
    ? 'web_search_20260209'
    : 'web_search_20250305';
};

// מחלץ את ה-URLs האמיתיים מתוצאות חיפוש-הרשת של Claude (server tool) ומהציטוטים בטקסט,
// כדי שיוזרקו ל-allowedUrls ולא ייחתכו ע"י ה-sanitizer של מניעת-הזיות.
const extractClaudeWebSearchUrls = (data = {}) => {
  const urls = new Set();
  for (const block of (Array.isArray(data?.content) ? data.content : [])) {
    if (block?.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const item of block.content) {
        const url = String(item?.url || '').trim();
        if (url) urls.add(url);
      }
    }
    if (block?.type === 'text' && Array.isArray(block.citations)) {
      for (const citation of block.citations) {
        const url = String(citation?.url || '').trim();
        if (url) urls.add(url);
      }
    }
  }
  return Array.from(urls).filter(Boolean);
};

// מאחד את כל בלוקי הטקסט בתשובה (עם web_search הטקסט עלול להגיע אחרי בלוקי tool-result, לא ב-[0]).
const extractClaudeResponseText = (data = {}) => {
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const joined = blocks
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
    .trim();
  return joined || String(data?.content?.[0]?.text || '');
};

export const callClaudeApi = async (apiKey, model, systemPrompt, userMessage, signal, options = {}) => {
  const includeCompletionMetadata = options.includeCompletionMetadata === true;
  const enableWebSearch = options.enableWebSearch === true;
  const url = 'https://api.anthropic.com/v1/messages';
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    // מאפשר קריאה ישירה מדפדפן (אתר/PWA) — Anthropic חוסם CORS בלי זה.
    // בדסקטופ הקריאה ממילא עוברת ב-proxy, והheader לא מזיק שם.
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  const webSearchTools = enableWebSearch
    ? [{ type: resolveClaudeWebSearchToolType(model), name: 'web_search' }]
    : null;

  // קריאה בודדת ל-API (proxy בדסקטופ, אחרת fetch ישיר).
  const runOnce = async (messages) => {
    const bodyStr = JSON.stringify({
      model,
      max_tokens: enableWebSearch ? 8192 : 4096,
      system: systemPrompt,
      messages,
      ...(webSearchTools ? { tools: webSearchTools } : {}),
    });
    const desktopResult = await proxyDesktopHttpRequest({ url, method: 'POST', headers, body: bodyStr }, signal);
    if (desktopResult) {
      if (!desktopResult.ok) {
        throw new Error(`Claude API (${desktopResult.status}): ${String(desktopResult.body || '').slice(0, 300)}`);
      }
      return JSON.parse(desktopResult.body);
    }
    const res = await fetch(url, { method: 'POST', signal, headers, body: bodyStr });
    if (!res.ok) {
      const txt = await res.text().catch(() => res.statusText);
      throw new Error(`Claude API (${res.status}): ${txt.slice(0, 300)}`);
    }
    return res.json();
  };

  // web_search רץ בלולאת sampling בצד השרת: stop_reason=pause_turn → לשלוח שוב כדי להמשיך.
  let messages = [{ role: 'user', content: userMessage }];
  let data = await runOnce(messages);
  const allowedUrls = new Set(extractClaudeWebSearchUrls(data));
  let continuations = 0;
  while (data?.stop_reason === 'pause_turn' && continuations < 4) {
    continuations += 1;
    messages = [...messages, { role: 'assistant', content: data.content }];
    data = await runOnce(messages);
    extractClaudeWebSearchUrls(data).forEach((u) => allowedUrls.add(u));
  }

  return finalizeProviderTextResponse({
    text: extractClaudeResponseText(data),
    completion: {
      stopReason: data?.stop_reason || '',
      allowedUrls: Array.from(allowedUrls),
    },
  }, '', includeCompletionMetadata);
};

// ═══════════════════════════════════════
// Universal Chat — routes by active provider
// ═══════════════════════════════════════
const PROMPT_DOCUMENT_CONTEXT_LIMIT = 8000;
const PROMPT_DOCUMENT_CONTEXT_GAP = '\n\n[... הושמט תוכן אמצעי כדי לשמור גם את סוף המסמך ...]\n\n';
const WORKFLOW_EXISTING_HTML_SECTION_PATTERN = /\n\nהמסמך הקיים ב-HTML:\n[\s\S]*$/;
const WORKFLOW_EXISTING_HTML_CAPTURE_PATTERN = /(?:^|\n\n)המסמך הקיים ב-HTML:\n([\s\S]*)$/;

const buildPromptDocumentContext = (documentContext = '', maxChars = PROMPT_DOCUMENT_CONTEXT_LIMIT) => {
  const text = String(documentContext || '');
  const safeLimit = Number.isFinite(maxChars) ? Math.max(0, Math.floor(maxChars)) : PROMPT_DOCUMENT_CONTEXT_LIMIT;
  if (!safeLimit || text.length <= safeLimit) return text;
  if (PROMPT_DOCUMENT_CONTEXT_GAP.length >= safeLimit) return text.slice(0, safeLimit);

  const remainingChars = safeLimit - PROMPT_DOCUMENT_CONTEXT_GAP.length;
  const headChars = Math.max(1, Math.ceil(remainingChars * 0.55));
  const tailChars = Math.max(1, remainingChars - headChars);
  return `${text.slice(0, headChars)}${PROMPT_DOCUMENT_CONTEXT_GAP}${text.slice(-tailChars)}`;
};

const buildWorkflowStageDocumentContext = (documentContext = '', stagedOutput = '') => {
  const contextText = String(documentContext || '');
  if (!String(stagedOutput || '').trim()) return contextText;
  return contextText.replace(WORKFLOW_EXISTING_HTML_SECTION_PATTERN, '').trim();
};

const extractExistingHtmlFromWorkflowContext = (documentContext = '') => {
  const contextText = String(documentContext || '');
  const match = contextText.match(WORKFLOW_EXISTING_HTML_CAPTURE_PATTERN);
  return String(match?.[1] || '').trim();
};

export const chatWithActiveProvider = async (userPrompt, documentContext = '', extraSystemPrompt = '', options = {}) => {
  const cfg = options.providerConfigOverride && typeof options.providerConfigOverride === 'object'
    ? normalizeProviderConfig(options.providerConfigOverride)
    : getProviderConfig();
  const taggedRouting = extractTaggedModelRouting(userPrompt);
  const cleanUserPrompt = taggedRouting.cleanText || String(userPrompt || '').trim();
  const assistantBehavior = getAssistantBehavior();
  const structureConstraintText = String(options.structureConstraintText || cleanUserPrompt).trim() || cleanUserPrompt;
  const strictProviderOverride = options.strictProviderOverride === true && Boolean(options.providerOverride);
  const taggedProviders = strictProviderOverride ? [] : normalizeProviderIds(taggedRouting.taggedProviders, '');
  const preferredProviders = strictProviderOverride ? [] : normalizeProviderIds(options.preferredProviders, '');
  const constrainedProviders = strictProviderOverride
    ? [options.providerOverride]
    : preferredProviders.length
      ? preferredProviders
      : taggedProviders;
  const selectedProviders = constrainedProviders.length
    ? constrainedProviders
    : strictProviderOverride
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
  let activeProvider = strictProviderOverride
    ? options.providerOverride
    : options.providerOverride
    || (preferredProviders.length
      ? taggedProviderInPool
      : (taggedProviders.length ? taggedProviderInPool : ''))
    || configuredSelectedProviders[0]
    || selectedProviders[0]
    || cfg.active;
  const skipSkillSelection = options.skipSkillSelection === true;
  const skipAutomationPrompt = options.skipAutomationPrompt === true || options.skipAutomation === true;
  const directChatRequest = options.directChat === true;
  const editModeRequest = options.editModeRequest === true;
  const allowEditModeRoutingOverride = options.allowEditModeRoutingOverride === true;
  const editModeExplicitSkillInvocation = options.editModeExplicitSkillInvocation === true;
  const suppressResearchRoutingForEditMode = editModeRequest && !allowEditModeRoutingOverride;
  const directChatRoutingInstruction = extractDirectChatRoutingInstruction(cleanUserPrompt);
  const lecturerAgentRequest = directChatRequest && isLecturerDirectChatAgent({
    agentId: options.agentId || '',
    agentLabel: options.agentLabel || '',
    agentName: options.agentName || options.agentLabel || '',
  });
  const holeFillAgentRequest = directChatRequest && isHoleFillDirectChatAgent({
    agentId: options.agentId || '',
    agentLabel: options.agentLabel || '',
    agentName: options.agentName || options.agentLabel || '',
  });
  const directChatSourceFollowUpRequested = SOURCE_EXPLICIT_FOLLOW_UP_PATTERN.test(directChatRoutingInstruction)
    || SOURCE_FOLLOW_UP_PATTERN.test(directChatRoutingInstruction)
    || hasSourceRetrievalFollowOnWork(directChatRoutingInstruction)
    || SOURCE_REQUEST_WITH_DELIVERABLE_PATTERN.test(directChatRoutingInstruction);
  const suppressResearchRoutingForDirectAgent = !suppressResearchRoutingForEditMode
    && directChatRequest
    && !holeFillAgentRequest
    && isNonResearchDirectChatAgent({
      agentId: options.agentId || '',
      agentLabel: options.agentLabel || '',
      agentName: options.agentName || options.agentLabel || '',
    })
    && (lecturerAgentRequest || !isExplicitSourceRequest(directChatRoutingInstruction))
    && (lecturerAgentRequest || !directChatSourceFollowUpRequested)
    && !FACT_CHECK_REQUEST_PATTERN.test(directChatRoutingInstruction)
    && !EXPLICIT_GROUNDED_WEB_RESULTS_PATTERN.test(directChatRoutingInstruction)
    && !needsInternetBackedCurrentInfo(directChatRoutingInstruction);
  const suppressResearchRoutingForDocumentReview = !suppressResearchRoutingForEditMode
    && !suppressResearchRoutingForDirectAgent
    && directChatRequest
    && !holeFillAgentRequest
    && isDocumentReviewOrEditRequest({
      userPrompt: cleanUserPrompt,
      extraSystemPrompt,
    });
  const suppressResearchRouting = options.forceSuppressResearchRouting === true
    || suppressResearchRoutingForEditMode
    || suppressResearchRoutingForDirectAgent
    || suppressResearchRoutingForDocumentReview;
  const sourceQueryOverride = normalizeSourceQueryOverride(options.sourceQueryOverride || options.researchTopic || '');
  const sourceQuerySource = sourceQueryOverride
    ? String(options.sourceQuerySource || (options.researchTopic ? 'researchTopic' : 'override')).trim() || 'override'
    : options.blockAssignmentSourceQuery === true
      ? 'blocked-assignment'
      : 'prompt';
  const blockAssignmentPromptFallback = options.blockAssignmentSourceQuery === true;
  const forceVerifiedSourceFollowOn = options.forceVerifiedSourceFollowOn === true;
  const exactSourceGroundingUrl = String(options.exactSourceUrl || '').trim();
  const omitPersonalStyleStructureHints = options.omitPersonalStyleStructureHints === true;
  // suppressPersonalStyle משמש לבדיקת השפעת הסגנון: מפיק פלט ללא הזרקת הפרופיל כדי להשוות מול פלט עם פרופיל.
  const personalStylePrompt = options.suppressPersonalStyle === true
    ? ''
    : buildPersonalStyleInstructions(getPersonalStyleProfile(), {
      omitStructuralHints: omitPersonalStyleStructureHints,
      requestText: [cleanUserPrompt, options.structureConstraintText].filter(Boolean).join('\n'),
      templateId: String(options.templateId || '').trim(),
      isAcademicTask: typeof options.isAcademicTask === 'boolean' ? options.isAcademicTask : undefined,
    });
  const sharedInstructions = getSharedAgentInstructions();
  const workspaceAutomationPrompt = buildWorkspaceAutomationInstructions({ disabled: skipAutomationPrompt });
  const skillsConfig = getSkillsConfig();
  const skillResolution = (skipSkillSelection || (suppressResearchRoutingForDocumentReview && !options.skillId) || (editModeRequest && !editModeExplicitSkillInvocation))
    ? { skill: null, reason: 'skipped' }
    : resolveSkillForRequest({
      userPrompt: cleanUserPrompt,
      documentContext,
      skillId: options.skillId || '',
      autoUseDefault: options.autoUseDefaultSkill !== false,
    });
  const activeSkill = skillResolution.skill;
  const optionAssignmentRequirements = normalizeAssignmentRequirements(options.assignmentRequirements || {});
  const assignmentRequirements = optionAssignmentRequirements.hasExplicitRequirements
    ? optionAssignmentRequirements
    : normalizeAssignmentRequirements(extractAssignmentRequirements({
        userPrompt: cleanUserPrompt,
        documentContext,
        extraSystemPrompt,
        structureConstraintText,
      }));
  const skillPrompt = buildSkillSystemPrompt(activeSkill, skillResolution.reason, activeSkill ? skillsConfig.skills?.[activeSkill.id] : null);
  const assignmentSourceQuotaRoute = resolveAssignmentSourceQuotaRoute(assignmentRequirements, {
    agentId: options.agentId || '',
    agentLabel: options.agentLabel || '',
    agentName: options.agentName || '',
  });
  const sourceFocusedWorkflowAgent = !suppressResearchRouting
    && options.skipAutomation === true
    && !directChatRequest
    && assignmentSourceQuotaRoute.hasSourceQuota
    && assignmentSourceQuotaRoute.route !== 'none'
    && isSourceFocusedWorkflowAgent({
      agentId: options.agentId || '',
      agentLabel: options.agentLabel || '',
      agentName: options.agentName || '',
      skillId: activeSkill?.id || options.skillId || '',
    });
  // מסמך אקדמי שנכתב במסלול ישיר (Chef/Direct → skipAutomation) לא מסווג כ-sourceFocusedWorkflowAgent,
  // ולכן היה מדלג על אחזור מקורות למרות מכסה אקדמית מזוהה — מה שאיפשר לכותב להמציא מקורות.
  // כשמזוהה מכסה אקדמית אמיתית יחד עם פלט-מסמך, כופים grounding גם ללא סוכן ייעודי.
  const documentAcademicSourceQuota = options.expectDocumentOutput === true
    && !suppressResearchRouting
    && !directChatRequest
    && assignmentSourceQuotaRoute.hasSourceQuota
    && (assignmentSourceQuotaRoute.route === 'strict' || assignmentSourceQuotaRoute.needsAcademic);
  const sourceQuotaBypassesSkipAutomation = (sourceFocusedWorkflowAgent || documentAcademicSourceQuota)
    && options.skipAutomation === true;
  const promptSourceGroundingRequired = !suppressResearchRouting && shouldUseStrictSourceGrounding({
    userPrompt: cleanUserPrompt,
    documentContext,
    extraSystemPrompt,
    skillId: activeSkill?.id || options.skillId || '',
  });
  const sourceGroundingRequired = forceVerifiedSourceFollowOn
    || promptSourceGroundingRequired
    || documentAcademicSourceQuota
    || (sourceFocusedWorkflowAgent && (assignmentSourceQuotaRoute.route === 'strict' || assignmentSourceQuotaRoute.needsAcademic));
  // dual-track: כשהמטלה דורשת גם כתבות/חדשות (needsGeneral), מריצים גם אחזור Web — גם אם המסלול האקדמי פעיל.
  const dualTrackGeneralRequired = sourceFocusedWorkflowAgent && assignmentSourceQuotaRoute.needsGeneral === true;
  const promptGroundedWebResultsRequired = !suppressResearchRouting && !sourceGroundingRequired && (holeFillAgentRequest || shouldUseGroundedWebResults({
    userPrompt: cleanUserPrompt,
    extraSystemPrompt,
    skillId: activeSkill?.id || options.skillId || '',
  }));
  const groundedWebResultsRequired = (!sourceGroundingRequired
    && (promptGroundedWebResultsRequired || (sourceFocusedWorkflowAgent && assignmentSourceQuotaRoute.route === 'groundedWeb')))
    || dualTrackGeneralRequired;
  const strictSourceGroundingEnabled = true;
  const directChatSourceFollowOnRequested = hasSourceRetrievalFollowOnWork(cleanUserPrompt)
    || SOURCE_REQUEST_WITH_DELIVERABLE_PATTERN.test(cleanUserPrompt);
  const sourceFocusedWorkflowRequest = options.skipAutomation === true
    && !directChatRequest
    && sourceGroundingRequired
    && isSourceFocusedWorkflowAgent({
      agentId: options.agentId || '',
      agentLabel: options.agentLabel || '',
      agentName: options.agentName || '',
      skillId: activeSkill?.id || options.skillId || '',
    });
  const sourceOnlyGroundingRequest = isSourceOnlyGroundingRequest({
    userPrompt: cleanUserPrompt,
    documentContext,
    extraSystemPrompt,
    skillId: activeSkill?.id || options.skillId || '',
    allowFollowOnWork: directChatRequest || sourceFocusedWorkflowRequest,
  });
  const shouldRetrieveVerifiedSourcesFirst = strictSourceGroundingEnabled
    && sourceGroundingRequired
    && (options.skipAutomation !== true || directChatRequest || sourceFocusedWorkflowRequest || sourceQuotaBypassesSkipAutomation)
    && (sourceOnlyGroundingRequest || sourceFocusedWorkflowRequest || assignmentSourceQuotaRoute.route === 'strict' || assignmentSourceQuotaRoute.needsAcademic || forceVerifiedSourceFollowOn);
  const shouldUseVerifiedSourceFollowOnGrounding = shouldRetrieveVerifiedSourcesFirst
    && ((directChatRequest && directChatSourceFollowOnRequested) || forceVerifiedSourceFollowOn);
  const shouldRetrieveGroundedWebResultsFirst = groundedWebResultsRequired
    && ((options.skipAutomation !== true || directChatRequest || sourceQuotaBypassesSkipAutomation)
      && (!strictProviderOverride || sourceQuotaBypassesSkipAutomation || supportsInternetBackedSourceRetrieval(activeProvider))
      && (isGroundedWebResultsOnlyRequest({
        userPrompt: cleanUserPrompt,
        extraSystemPrompt,
      }) || holeFillAgentRequest || (sourceFocusedWorkflowAgent && (assignmentSourceQuotaRoute.route === 'groundedWeb' || assignmentSourceQuotaRoute.needsGeneral))));
  const internetBackedSourceWorkRequired = !suppressResearchRouting && (sourceGroundingRequired || groundedWebResultsRequired || shouldUseInternetBackedSourceWork({
    userPrompt: cleanUserPrompt,
    extraSystemPrompt,
  }));
  const sourceAutoRouteEnabled = !suppressResearchRouting && assistantBehavior.autoRouteSourceRequests !== false;
  const requestedProvider = activeProvider;
  const internetBackedAutoRouteTarget = INTERNET_BACKED_SOURCE_PROVIDER_IDS.has(activeProvider)
    ? activeProvider
    : ['gemini', 'perplexity'].find((providerId) => isProviderConfiguredForUse(providerId, cfg)) || '';
  const sourceRequestAutoRouted = sourceAutoRouteEnabled
    && sourceGroundingRequired
    && !shouldUseVerifiedSourceFollowOnGrounding
    && !strictProviderOverride
    && activeProvider !== 'perplexity'
    && isProviderConfiguredForUse('perplexity', cfg);
  const internetBackedRequestAutoRouted = sourceAutoRouteEnabled
    && !sourceRequestAutoRouted
    && internetBackedSourceWorkRequired
    && !strictProviderOverride
    && !supportsInternetBackedSourceRetrieval(activeProvider)
    && Boolean(internetBackedAutoRouteTarget);
  if (sourceRequestAutoRouted) {
    activeProvider = 'perplexity';
  } else if (internetBackedRequestAutoRouted) {
    activeProvider = internetBackedAutoRouteTarget;
  }
  const taggedModelOverride = strictProviderOverride
    ? ''
    : taggedRouting.providerModels?.[activeProvider]
    || (preferredProviders.length ? '' : taggedRouting.taggedModel);
  const modelOverride = sourceRequestAutoRouted ? (taggedModelOverride || '') : (options.modelOverride || taggedModelOverride || '');
  const sourceAwareAutomationPreferredProviders = sourceAutoRouteEnabled && sourceGroundingRequired && !shouldUseVerifiedSourceFollowOnGrounding && !strictProviderOverride && isProviderConfiguredForUse('perplexity', cfg)
    ? normalizeProviderIds(['perplexity', ...automationPreferredProviders], '')
    : automationPreferredProviders;
  const responseModePrompt = buildResponseModePrompt({ strictFormatting: options.strictFormatting === true });
  const providerSupportsSourceGrounding = sourceGroundingRequired && isSourceGroundingProvider(activeProvider);
  let providerSupportsGeminiInternetBackedSourceTools = internetBackedSourceWorkRequired && supportsInternetBackedSourceRetrieval(activeProvider);
  // route 1 — חיפוש-רשת נייטיבי בכותב עצמו (משלים את ההזרקה של route 2): כש-Claude הוא הכותב
  // ועבודת המקורות דורשת אינטרנט, מפעילים את server-tool web_search שלו כדי שיחפש ויצטט בעצמו.
  const providerSupportsNativeWebSearch = internetBackedSourceWorkRequired
    && NATIVE_WEB_SEARCH_PROVIDER_IDS.has(activeProvider);
  if (providerSupportsNativeWebSearch) providerSupportsGeminiInternetBackedSourceTools = true;
  const sourceGroundingWorkspaceId = String(options.activeWorkspaceId || getWorkspaceAutomation().activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  const recentVerifiedSourceAllowedUrls = getRecentVerifiedSourceAllowedUrls({ workspaceId: sourceGroundingWorkspaceId });
  let sourceGroundingAllowedUrls = buildVerifiedSourceAllowedUrlSet([
    ...extractUrlSetFromText(cleanUserPrompt),
    ...extractUrlSetFromText(extraSystemPrompt),
    ...extractUrlSetFromText(documentContext),
    ...(exactSourceGroundingUrl ? [exactSourceGroundingUrl] : []),
    ...Array.from(recentVerifiedSourceAllowedUrls),
  ]);
  let verifiedSourceFollowOnAllowedUrls = new Set();
  let verifiedSourceFollowOnGroundingPrompt = '';
  let verifiedSourceFollowOnLocked = false;
  let groundedWebResultsContextPrompt = '';
  const sourceGroundingPrompt = buildSourceGroundingPrompt({
    enforce: strictSourceGroundingEnabled && sourceGroundingRequired,
    providerSupportsGrounding: providerSupportsSourceGrounding,
  });
  const currentInfoWithoutExplicitResults = !suppressResearchRouting
    && needsInternetBackedCurrentInfo([cleanUserPrompt, extraSystemPrompt].filter(Boolean).join('\n'))
    && !isExplicitGroundedWebResultsRequest({
      userPrompt: cleanUserPrompt,
      extraSystemPrompt,
      skillId: activeSkill?.id || options.skillId || '',
    });
  const internetBackedWorkPrompt = internetBackedSourceWorkRequired
    ? (providerSupportsGeminiInternetBackedSourceTools
        ? 'הבקשה הנוכחית דורשת מידע עדכני או בדיקה ברשת. השתמש באחזור האינטרנט המובנה של הספק הפעיל, ואל תענה מהזיכרון הסטטי כשנדרש נתון עדכני. אם גם אחרי חיפוש אין ודאות, אמור זאת במפורש.'
        : 'הבקשה הנוכחית דורשת מידע עדכני או בדיקה ברשת. אם לספק הפעיל אין אחזור אינטרנט זמין, אמור זאת במפורש ואל תטען שבדקת ברשת.')
    : '';
  const currentInfoAnswerPrompt = currentInfoWithoutExplicitResults
    ? 'כאשר האינטרנט משמש רק כדי לענות על שאלה עדכנית נקודתית והמשתמש לא ביקש מקורות, קישורים או תוצאות חיפוש, ענה בקצרה בגוף התשובה בלבד ואל תציג URLs, ציטוטים, citations או רשימת מקורות.'
    : '';
  // שלמות מסמך: מונע פלט קצר מדי (למשל מודל שמחזיר משפט/הערה במקום המסמך) בלי לכפות מילוי מומצא.
  const documentCompletenessPrompt = options.expectDocumentOutput === true
    ? 'כשמייצרים מסמך: החזר את גוף המסמך המלא ב-HTML לפי ההיקף שהתבקש — לא הערה קצרה, לא משפט בודד ולא בקשת חומרים בלבד. אם חסרים חומרי חובה, כתוב בכל זאת את כל מה שניתן לבסס (כולל מהמקורות המאומתים שסופקו) באורך סביר, וסמן חוסרים נקודתיים ב-[דרוש מקור] — בלי להמציא תוכן, מקורות או ציטוטים.'
    : '';
  const appMemoryPrompt = options.includeAppMemory === false ? '' : buildAppMemoryInstructions(getAppMemory());
  const conversationHistoryPrompt = buildConversationHistoryPrompt(options.conversationHistory);
  const automation = getWorkspaceAutomation();
  const onStatus = options.onStatus;
  const agentLabel = options.agentLabel || 'הסוכן הראשי';
  const agentName = options.agentName || agentLabel;
  const includeCompletionMetadata = options.includeCompletionMetadata === true;
  const preserveProviderCompletionMetadata = includeCompletionMetadata || groundedWebResultsRequired || (strictSourceGroundingEnabled && sourceGroundingRequired);
  const requestTimeoutMs = Number(automation.requestTimeoutMs);
  const baseTimeoutMs = automation.timeoutEnabled === true && Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0
    ? Math.max(10000, Math.round(requestTimeoutMs))
    : 0;
  // יצירת מסמך שלם (במיוחד מודלים איטיים כמו Claude עם המשכי-כתיבה) חורגת לגיטימית מ-45ש'.
  // נותנים לשלב המסמך חלון נדיב יותר כדי שלא ייפול ל-fallback מקומי בלי צורך.
  const timeoutMs = baseTimeoutMs && options.expectDocumentOutput === true
    ? Math.max(baseTimeoutMs * 4, 180000)
    : baseTimeoutMs;
  const retries = automation.retryEnabled === false ? 0 : Math.max(0, Number(automation.maxRetries || 0));
  const effectiveRetries = retries;
  const runId = options.runId || createRunId();
  const activeWorkspaceId = String(options.activeWorkspaceId || automation.activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  const workspaceName = String(options.workspaceName || automation.workspaceName || '').trim();
  const disableFallback = options.disableFallback === true;
  const expectDocumentOutput = options.expectDocumentOutput === true;
  const appendAgentNotesToOutput = expectDocumentOutput && (
    Object.prototype.hasOwnProperty.call(options, 'appendAgentNotesToOutput')
      ? options.appendAgentNotesToOutput === true
      : automation.appendAgentNotesToOutput === true
  );
  const agentNotesInstruction = expectDocumentOutput
    ? String(
      Object.prototype.hasOwnProperty.call(options, 'agentNotesInstruction')
        ? (options.agentNotesInstruction ?? '')
        : (automation.agentNotesInstruction || '')
    ).trim()
    : '';
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
  const sourceQuotaLog = {
    sourceQuota: assignmentSourceQuotaRoute.hasSourceQuota,
    contentItems: assignmentSourceQuotaRoute.contentItems,
    sourceKinds: assignmentSourceQuotaRoute.sourceKinds,
    quotaRoute: assignmentSourceQuotaRoute.route,
    hasAcademicQuota: assignmentSourceQuotaRoute.hasAcademicQuota,
    hasNonAcademicQuota: assignmentSourceQuotaRoute.hasNonAcademicQuota,
    prefersAcademicRoute: assignmentSourceQuotaRoute.prefersAcademicRoute,
    prefersGeneralRoute: assignmentSourceQuotaRoute.prefersGeneralRoute,
    skipAutomationQuotaBypass: sourceQuotaBypassesSkipAutomation,
    groundedWebRetrieveFirst: shouldRetrieveGroundedWebResultsFirst,
    sourceQueryOverride: Boolean(sourceQueryOverride),
    querySource: sourceQuerySource,
    persistedAllowedUrlCount: recentVerifiedSourceAllowedUrls.size,
  };
  logEvent('source-routing-decision', `החלטת ניתוב מקורות: required=${sourceGroundingRequired} retrieveFirst=${shouldRetrieveVerifiedSourcesFirst} groundedWeb=${groundedWebResultsRequired} groundedWebRetrieveFirst=${sourceQuotaLog.groundedWebRetrieveFirst} skipAutomation=${options.skipAutomation === true} directChat=${directChatRequest} strictProviderOverride=${strictProviderOverride} sourceQuota=${sourceQuotaLog.sourceQuota} contentItems=${sourceQuotaLog.contentItems || 0} sourceKinds=${sourceQuotaLog.sourceKinds.join(',') || 'none'} quotaRoute=${sourceQuotaLog.quotaRoute} skipAutomationQuotaBypass=${sourceQuotaLog.skipAutomationQuotaBypass} sourceQueryOverride=${sourceQuotaLog.sourceQueryOverride} querySource=${sourceQuotaLog.querySource} provider=${activeProvider} model=${resolvedModel}`, {
    state: 'info',
    provider: activeProvider,
    model: resolvedModel,
    sourceGroundingRequired,
    groundedWebResultsRequired,
    shouldRetrieveVerifiedSourcesFirst,
    shouldRetrieveGroundedWebResultsFirst,
    sourceFocusedWorkflowRequest,
    sourceOnlyGroundingRequest,
    skipAutomation: options.skipAutomation === true,
    directChat: directChatRequest,
    strictProviderOverride,
    requestedProvider,
    routedProvider: activeProvider,
    sourceRequestAutoRouted,
    internetBackedRequestAutoRouted,
    ...sourceQuotaLog,
  });
  // מקורות-מעוגנים שנאספו בריצה הזו (מ-Gemini groundingSupports), לצריכת ה-binder ב-report.
  let sourceBindingAnchoredSources = [];
  const rememberSuccessfulReply = (replyText = '', responseOptions = {}) => {
    const responseProvider = String(responseOptions.providerId || activeProvider || '').trim() || activeProvider;
    const normalizedReply = normalizeProviderTextResponse(replyText, responseProvider);
    const lockedAllowedUrls = buildVerifiedSourceAllowedUrlSet(verifiedSourceFollowOnAllowedUrls);
    const allowedUrls = verifiedSourceFollowOnLocked
      ? lockedAllowedUrls
      : buildVerifiedSourceAllowedUrlSet([
          ...Array.from(sourceGroundingAllowedUrls || []),
          ...Array.from(responseOptions.allowedUrls || []),
          ...Array.from(normalizedReply.completion?.allowedUrls || []),
        ]);
    const providerSupportsGroundingForReply = verifiedSourceFollowOnLocked
      ? false
      : (typeof responseOptions.providerSupportsGroundingOverride === 'boolean'
          ? responseOptions.providerSupportsGroundingOverride
          : providerSupportsSourceGrounding);
    const safeReplyText = sanitizeSourceGroundingResponse(normalizedReply.text, {
      enforce: strictSourceGroundingEnabled && sourceGroundingRequired,
      providerSupportsGrounding: providerSupportsGroundingForReply,
      allowedUrls,
    });
    if (safeReplyText !== normalizedReply.text) {
      logEvent('source-output-blocked', 'נחסם פלט מקורות שכלל URLs לא מאומתים או קישורי דוגמה, כדי למנוע מקורות מומצאים', {
        state: 'error',
        provider: responseProvider,
        model: responseOptions.model || resolvedModel,
        sourceGroundingRequired,
        providerSupportsGrounding: providerSupportsGroundingForReply,
        allowedUrlCount: allowedUrls.size,
        persistedAllowedUrlCount: recentVerifiedSourceAllowedUrls.size,
        blockedToAvoidHallucinatedSources: true,
        outputPreview: trimLogText(normalizedReply.text),
      });
    }
    let safeReply = safeReplyText === normalizedReply.text
      ? normalizedReply
      : {
          ...normalizedReply,
          text: safeReplyText,
        };
    if (verifiedSourceFollowOnLocked && safeReply.completion && typeof safeReply.completion === 'object') {
      const safeCompletion = { ...safeReply.completion };
      if (allowedUrls.size) safeCompletion.allowedUrls = Array.from(allowedUrls);
      else delete safeCompletion.allowedUrls;
      safeReply = {
        ...safeReply,
        completion: safeCompletion,
      };
    }
    // Stage 3-A: report-only binding טענה→קטע-מקור. flag כבוי כברירת מחדל; לא נוגע ב-safeReply,
    // רק פולט דוח ל-log. עטוף try/catch — לעולם לא מפיל את מסלול-ההחזרה.
    if (SOURCE_CLAIM_BINDING_REPORT_ENABLED && sourceBindingAnchoredSources.length && safeReply.text) {
      try {
        const bindingReport = bindClaimsToPassages(safeReply.text, sourceBindingAnchoredSources);
        logEvent('source-claim-binding-report', 'דוח עיגון טענות→מקור (report-only, לא משנה פלט)', {
          state: bindingReport.summary.unsupported > 0 ? 'warning' : 'info',
          provider: responseProvider,
          bindingSummary: bindingReport.summary,
          unsupportedClaims: bindingReport.claims
            .filter((claim) => claim.status === 'unsupported')
            .slice(0, 8)
            .map((claim) => ({
              sentence: trimLogText(claim.sentence),
              score: claim.bestPassage ? Number(claim.bestPassage.score.toFixed(2)) : 0,
              confidence: claim.bestPassage?.confidence ?? null,
            })),
        });
      } catch {}
    }
    if (options.shouldPersistMemory === false) {
      return includeCompletionMetadata ? safeReply : safeReply.text;
    }
    try {
      rememberConversationTurn({
        userPrompt: cleanUserPrompt,
        reply: safeReply.text,
        agentLabel,
        skillId: activeSkill?.id || '',
        skillLabel: activeSkill?.label || '',
      });
    } catch {}
    return includeCompletionMetadata ? safeReply : safeReply.text;
  };
  // route 2 — האחזור מנותק מהכתיבה: אם הכותב נעול strict לספק שאין לו גישה לאינטרנט (claude/openai/groq/ollama/custom),
  // עדיין מאפשרים לשלב האחזור לנדוד ל-Gemini/Perplexity/Scholar. הכתיבה עצמה נשארת נעולה לספק שהמשתמש בחר.
  const sourceRetrievalStrictOverride = strictProviderOverride && supportsInternetBackedSourceRetrieval(requestedProvider);
  if (shouldRetrieveVerifiedSourcesFirst) {
    const verifiedSourceStartQuery = extractVerifiedSourceQuery({
      userPrompt: cleanUserPrompt,
      documentContext,
      fallbackQuery: getLastVerifiedSourceQuery({ workspaceId: activeWorkspaceId }),
      workspaceId: activeWorkspaceId,
      stripFollowOnWork: shouldUseVerifiedSourceFollowOnGrounding,
      sourceQueryOverride,
      blockAssignmentPromptFallback,
    });
    const verifiedSourceStartsWithArticleRetrieval = analyzeArticleQuery(verifiedSourceStartQuery).expectsNewsArticle;
    const verifiedSourceStartProvider = verifiedSourceStartsWithArticleRetrieval
      ? (getPreferredVerifiedArticleProviderIds({ cfg, preferredProviderId: requestedProvider, strictProviderOverride: sourceRetrievalStrictOverride })[0] || activeProvider)
      : activeProvider;
    const verifiedSourceStartModel = verifiedSourceStartsWithArticleRetrieval
      ? (verifiedSourceStartProvider === 'gemini'
          ? resolveVerifiedArticleGeminiModel(cfg)
          : verifiedSourceStartProvider === 'perplexity'
            ? String(cfg?.perplexity?.model || '').trim() || 'sonar-pro'
            : resolvedModel)
      : resolvedModel;
    logEvent('verified-source-retrieval-start', 'מפעיל אחזור מאומת למקורות לפני יצירת תשובה', {
      state: 'running',
      provider: verifiedSourceStartProvider,
      model: verifiedSourceStartModel,
    });
    emitStatus(onStatus, {
      state: 'running',
      progress: 18,
      runId,
      provider: verifiedSourceStartProvider,
      model: verifiedSourceStartModel,
      agentLabel,
      message: 'מאתר מקורות מאומתים',
    });
    const verifiedCacheKey = runId && verifiedSourceStartQuery
      ? `${runId}|verified|${normalizeSourceSearchText(verifiedSourceStartQuery)}`
      : '';
    let verifiedSourceReply = getCachedSourceRetrieval(verifiedCacheKey);
    if (verifiedSourceReply) {
      logEvent('verified-source-retrieval-cache-hit', `שימוש חוזר במקורות שכבר נשלפו בריצה הזו: query="${verifiedSourceStartQuery}"`, {
        state: 'info',
        provider: verifiedSourceReply.providerId || verifiedSourceStartProvider,
      });
    } else {
      verifiedSourceReply = await resolveVerifiedSourceReply({
        userPrompt: cleanUserPrompt,
        documentContext,
        extraSystemPrompt,
        skillId: activeSkill?.id || options.skillId || '',
        isAcademicTask: typeof options.isAcademicTask === 'boolean' ? options.isAcademicTask : undefined,
        cfg,
        timeoutMs,
        preferredProviderId: requestedProvider,
        strictProviderOverride: sourceRetrievalStrictOverride,
        stripFollowOnWork: shouldUseVerifiedSourceFollowOnGrounding,
        logEvent,
        assignmentRequirements,
        sourceQueryOverride,
        blockAssignmentPromptFallback,
      });
      if (isRetrievalReplyCacheable(verifiedSourceReply)) setCachedSourceRetrieval(verifiedCacheKey, verifiedSourceReply);
    }
    if (Array.isArray(verifiedSourceReply?.anchoredSources) && verifiedSourceReply.anchoredSources.length) {
      sourceBindingAnchoredSources = verifiedSourceReply.anchoredSources;
    }
    if (verifiedSourceReply?.text) {
      if (verifiedSourceReply.query) {
        try {
          rememberVerifiedSourceQuery({
            query: verifiedSourceReply.query,
            workspaceId: verifiedSourceReply.workspaceId || activeWorkspaceId,
          });
        } catch {}
      }
      const isFailure = verifiedSourceReply.text.includes(SOURCE_GROUNDING_FAILURE_TOKEN);
      const persistedAllowedUrls = isFailure
        ? new Set()
        : rememberVerifiedSourceAllowedUrls({
            urls: verifiedSourceReply.urls || [],
            workspaceId: verifiedSourceReply.workspaceId || activeWorkspaceId,
          });
      if (persistedAllowedUrls.size) {
        sourceGroundingAllowedUrls = buildVerifiedSourceAllowedUrlSet([
          ...sourceGroundingAllowedUrls,
          ...Array.from(persistedAllowedUrls),
        ]);
      }
      const verifiedRetrievalSuccessMessage = shouldUseVerifiedSourceFollowOnGrounding
        ? 'נמצאו מקורות מאומתים ונמשיך לתשובת המשך עם grounding על בסיסם בלבד'
        : 'הוחזרו מקורות מאומתים בלבד';
      logEvent(
        isFailure ? 'verified-source-retrieval-blocked' : 'verified-source-retrieval-success',
        isFailure ? 'בקשת המקורות נחסמה כי לא נמצאו תוצאות מאומתות' : verifiedRetrievalSuccessMessage,
        {
          state: isFailure ? 'error' : 'success',
          provider: verifiedSourceReply.providerId || activeProvider,
          model: verifiedSourceReply.model || resolvedModel,
          allowedUrlCount: Array.isArray(verifiedSourceReply.urls) ? verifiedSourceReply.urls.length : 0,
          persistedAllowedUrlCount: persistedAllowedUrls.size,
          outputPreview: trimLogText(verifiedSourceReply.text),
          errorMessage: verifiedSourceReply.error?.message || '',
        },
      );
      // route 2 — אחזור מנותק מכתיבה: מזריקים את המקורות שנמצאו כ-context והכותב (כל ספק) ממשיך לכתוב.
      const injectVerifiedSourcesAsDocumentContext = ({ degraded }) => {
        verifiedSourceFollowOnGroundingPrompt = degraded
          ? buildDegradedSourceGroundingPrompt(verifiedSourceReply.text)
          : buildVerifiedSourceFollowOnGroundingPrompt(verifiedSourceReply.text);
        verifiedSourceFollowOnAllowedUrls = buildVerifiedSourceAllowedUrlSet(verifiedSourceReply.urls || []);
        sourceGroundingAllowedUrls = buildVerifiedSourceAllowedUrlSet([
          ...sourceGroundingAllowedUrls,
          ...Array.from(verifiedSourceFollowOnAllowedUrls),
        ]);
        // במצב מנוון לא נועלים נעילה קשיחה — הכותב חייב להיות חופשי לסמן [דרוש מקור] בחורים.
        verifiedSourceFollowOnLocked = !degraded;
        providerSupportsGeminiInternetBackedSourceTools = false;
      };
      if (!isFailure && (shouldUseVerifiedSourceFollowOnGrounding || holeFillAgentRequest || expectDocumentOutput)) {
        // אחזור הצליח — מזריקים מקורות מאומתים כ-context והכותב ממשיך לכתוב את המסמך המלא.
        injectVerifiedSourcesAsDocumentContext({ degraded: false });
      } else if (isFailure && expectDocumentOutput && shouldUseVerifiedSourceFollowOnGrounding && exactSourceGroundingUrl) {
        // נעילת מקור-מדויק שנכשלה: כל המסמך היה אמור להתבסס על אותו URL יחיד, לכן עוצרים במפורש.
        return rememberSuccessfulReply({
          text: buildForcedSourceGroundingFailureDocumentHtml({
            url: exactSourceGroundingUrl,
            failureText: verifiedSourceReply.text,
          }),
          completion: {
            provider: verifiedSourceReply.providerId || activeProvider,
            model: verifiedSourceReply.model || resolvedModel,
          },
        }, {
          providerId: verifiedSourceReply.providerId || activeProvider,
          providerSupportsGroundingOverride: true,
        });
      } else if (expectDocumentOutput) {
        // degrade: אחזור חלקי/נכשל — לא מחזירים שגיאה כמסמך. כותבים מה שאפשר ומסמנים [דרוש מקור].
        injectVerifiedSourcesAsDocumentContext({ degraded: true });
      } else {
        // בקשת מקורות טהורה ב-chat: מחזירים את רשימת המקורות עצמה כתשובה.
        return rememberSuccessfulReply({
          text: verifiedSourceReply.text,
          completion: {
            provider: verifiedSourceReply.providerId || activeProvider,
            model: verifiedSourceReply.model || resolvedModel,
          },
        }, {
          providerId: verifiedSourceReply.providerId || activeProvider,
          providerSupportsGroundingOverride: true,
          allowedUrls: buildVerifiedSourceAllowedUrlSet([
            ...sourceGroundingAllowedUrls,
            ...Array.from(verifiedSourceReply.urls || []),
          ]),
        });
      }
    }
  }
  if (shouldRetrieveGroundedWebResultsFirst) {
    logEvent('grounded-web-results-start', 'מפעיל אחזור Web מקורקע לפני יצירת תשובה', {
      state: 'running',
      provider: activeProvider,
      model: resolvedModel,
    });
    emitStatus(onStatus, {
      state: 'running',
      progress: 18,
      runId,
      provider: activeProvider,
      model: resolvedModel,
      agentLabel,
      message: 'מאתר תוצאות Web מקורקעות',
    });
    const groundedWebCacheKey = runId
      ? `${runId}|web|${normalizeSourceSearchText(sourceQueryOverride || cleanUserPrompt).slice(0, 200)}`
      : '';
    let groundedWebResultsReply = getCachedSourceRetrieval(groundedWebCacheKey);
    if (groundedWebResultsReply) {
      logEvent('grounded-web-results-cache-hit', 'שימוש חוזר בתוצאות Web שכבר נשלפו בריצה הזו', {
        state: 'info',
        provider: groundedWebResultsReply.providerId || activeProvider,
      });
    } else {
      groundedWebResultsReply = await resolveGroundedWebResultsReply({
        userPrompt: cleanUserPrompt,
        documentContext,
        cfg,
        timeoutMs,
        preferredProviderId: activeProvider,
        sourceQueryOverride,
        blockAssignmentPromptFallback,
      });
      if (isRetrievalReplyCacheable(groundedWebResultsReply)) setCachedSourceRetrieval(groundedWebCacheKey, groundedWebResultsReply);
    }
    if (Array.isArray(groundedWebResultsReply?.anchoredSources) && groundedWebResultsReply.anchoredSources.length) {
      sourceBindingAnchoredSources = groundedWebResultsReply.anchoredSources;
    }
    if (groundedWebResultsReply?.text) {
      if (groundedWebResultsReply.query) {
        try {
          rememberVerifiedSourceQuery({
            query: groundedWebResultsReply.query,
            workspaceId: groundedWebResultsReply.workspaceId || activeWorkspaceId,
          });
        } catch {}
      }
      const isFailure = groundedWebResultsReply.text.includes(SOURCE_GROUNDING_FAILURE_TOKEN);
      const persistedAllowedUrls = isFailure
        ? new Set()
        : rememberVerifiedSourceAllowedUrls({
            urls: groundedWebResultsReply.urls || [],
            workspaceId: groundedWebResultsReply.workspaceId || activeWorkspaceId,
          });
      if (persistedAllowedUrls.size) {
        sourceGroundingAllowedUrls = buildVerifiedSourceAllowedUrlSet([
          ...sourceGroundingAllowedUrls,
          ...Array.from(persistedAllowedUrls),
        ]);
      }
      logEvent(
        isFailure ? 'grounded-web-results-blocked' : 'grounded-web-results-success',
        isFailure ? 'בקשת Web Results נחסמה כי לא נמצאו תוצאות מקורקעות' : 'הוחזרו Web Results מקורקעות בלבד',
        {
          state: isFailure ? 'error' : 'success',
          provider: groundedWebResultsReply.providerId || activeProvider,
          model: groundedWebResultsReply.model || resolvedModel,
          allowedUrlCount: Array.isArray(groundedWebResultsReply.urls) ? groundedWebResultsReply.urls.length : 0,
          persistedAllowedUrlCount: persistedAllowedUrls.size,
          outputPreview: trimLogText(groundedWebResultsReply.text),
          errorMessage: groundedWebResultsReply.error?.message || '',
        },
      );
      if (!isFailure && (holeFillAgentRequest || expectDocumentOutput)) {
        // route 2: ממצאי Web נמצאו — מזריקים כ-context והכותב ממשיך לכתוב את המסמך.
        groundedWebResultsContextPrompt = [
          'השתמש רק בממצאי ה-Web המקורקעים הבאים כדי לבסס את המסמך. שלב אותם בטקסט עצמו, אל תחזיר רשימת תוצאות חיפוש ואל תמציא פרטים שלא מופיעים בממצאים.',
          groundedWebResultsReply.text,
        ].filter(Boolean).join('\n\n');
        // dual-track: אם המסלול האקדמי נעל allowed-URLs, מצרפים גם את כתובות החדשות כדי שלא ייחתכו בפלט.
        if (verifiedSourceFollowOnLocked) {
          verifiedSourceFollowOnAllowedUrls = buildVerifiedSourceAllowedUrlSet([
            ...Array.from(verifiedSourceFollowOnAllowedUrls),
            ...(groundedWebResultsReply.urls || []),
          ]);
        }
        providerSupportsGeminiInternetBackedSourceTools = false;
      } else if (expectDocumentOutput) {
        // degrade: לא נמצאו תוצאות Web — כותבים את המסמך מהחומרים ומסמנים [דרוש מקור] בחורים.
        groundedWebResultsContextPrompt = buildDegradedSourceGroundingPrompt(groundedWebResultsReply.text);
        providerSupportsGeminiInternetBackedSourceTools = false;
      } else {
      return rememberSuccessfulReply({
        text: groundedWebResultsReply.text,
        completion: {
          provider: groundedWebResultsReply.providerId || activeProvider,
          model: groundedWebResultsReply.model || resolvedModel,
          allowedUrls: Array.from(groundedWebResultsReply.urls || []),
        },
      }, {
        providerId: groundedWebResultsReply.providerId || activeProvider,
        providerSupportsGroundingOverride: true,
        allowedUrls: buildVerifiedSourceAllowedUrlSet([
          ...sourceGroundingAllowedUrls,
          ...Array.from(groundedWebResultsReply.urls || []),
        ]),
      });
      }
    }
  }
  const preserveFullDocumentContext = options.preserveFullDocumentContext === true;
  const promptDocumentContext = preserveFullDocumentContext
    ? String(documentContext || '')
    : buildPromptDocumentContext(documentContext);
  const sysPrompt = `אתה העוזר החכם של מעבד התמלילים "WordFlow AI".
ענה תמיד בעברית, קצר, ברור ומעשי.
הנח שהמשתמש נמצא באמצע כתיבה, ולכן גם שאלות קצרות כמו "נראה ארוך אה?", "יש מקור לזה?" או "תחדד לי" מתייחסות לפסקה או לטקסט שבהקשר המצורף.
אם מבקשים קיצור/הארכה/שכתוב — תן ישירות נוסח מוצע שאפשר להדביק.
אם מבקשים מקור אקדמי — נסה קודם להחזיר מקורות קונקרטיים עם metadata usable: כותרת, מחבר או גוף מפרסם, שנה, וקישור או DOI אם זמין. אם לא נמצאו מספיק מקורות, כתוב במפורש מה נמצא ומה עדיין חסר, ורק אז הוסף כיווני חיפוש, מילות חיפוש או חוקרים/נושאים רלוונטיים כהשלמה. אם אין ודאות, אל תמציא ציטוטים או פרטים.
אם המשתמש מבקש תוכן חדש שמיועד למסמך, כתוב רק את התוכן עצמו כדי שיהיה קל להוסיף למסמך.
עדיפות ראשונה: מה שהמשתמש ביקש מפורשות ומה שמופיע בחומרי העזר — ההגדרות המובנות (תבנית, מסלול, קהל יעד) הן רקע עוזר בלבד ולא מחליפות את המטלה.
כשמחזירים מסמך מלא, טיוטה, או תוכן שמיועד במפורש להדבקה למסמך, השתמש ב-HTML מעוצב עם h1, h2, h3, p, ul, ol, strong, em לפי ההקשר. אם המשתמש לא ביקש מסמך מובנה או תוכן להדבקה, אל תכפה היררכיית כותרות או מבנה HTML מיותר.
כאשר צריך לבצע הפרדת עמודים, החזר בדיוק את קטע ה-HTML הבא בלבד בשורה נפרדת: <div data-type="page-break"></div>.${sourceGroundingPrompt ? `\n\nGrounding למקורות:\n${sourceGroundingPrompt}` : ''}${internetBackedWorkPrompt ? `\n\nאחזור אינטרנט נדרש:\n${internetBackedWorkPrompt}` : ''}${currentInfoAnswerPrompt ? `\n\nמענה לשאלה עדכנית נקודתית:\n${currentInfoAnswerPrompt}` : ''}${documentCompletenessPrompt ? `\n\nשלמות המסמך:\n${documentCompletenessPrompt}` : ''}${verifiedSourceFollowOnGroundingPrompt ? `\n\nמקורות מאומתים לשימוש בלעדי:\n${verifiedSourceFollowOnGroundingPrompt}` : ''}${groundedWebResultsContextPrompt ? `\n\nממצאי Web לשילוב במסמך:\n${groundedWebResultsContextPrompt}` : ''}${extraSystemPrompt ? `\n\nהנחיית תפקיד:\n${extraSystemPrompt}` : ''}${skillPrompt ? `\n\nסקיל נבחר:\n${skillPrompt}` : ''}${sharedInstructions ? `\n\nהנחיות משותפות לפרויקט:\n${sharedInstructions}` : ''}${workspaceAutomationPrompt ? `\n\nתיאום צוות AI:\n${workspaceAutomationPrompt}` : ''}${personalStylePrompt ? `\n\nהעדפות סגנון אישיות:\n${personalStylePrompt}` : ''}${appMemoryPrompt ? `\n\nזיכרון אפליקציה וסוכן:\n${appMemoryPrompt}` : ''}${conversationHistoryPrompt ? `\n\nהיסטוריית השיחה הנוכחית:\n${conversationHistoryPrompt}` : ''}${promptDocumentContext ? `\n\nהקשר מהמסמך:\n${promptDocumentContext}` : ''}${responseModePrompt ? `\n\nכללי מטלה וצורת מענה:\n${responseModePrompt}` : ''}`;

  try { options.onSkillResolved?.(skillResolution); } catch {}

  const shouldAttemptAutomation = automation.enabled && automation.autoDispatch !== false && !options.providerOverride && !options.skipAutomation;
  const enabledAgents = shouldAttemptAutomation ? getOrderedRoleAgents(automation.workflowMode) : [];
  const explicitAutomationSkipReason = String(options.automationSkipReason || '').trim();
  const automationSkipReason = explicitAutomationSkipReason || (options.skipAutomation === true
    ? 'skipAutomation'
    : (options.providerOverride ? 'providerOverride' : (shouldAttemptAutomation && !enabledAgents.length ? 'noActiveAgents' : '')));

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
    requestedProvider,
    sourceGroundingRequired,
    groundedWebResultsRequired,
    sourceRequestAutoRouted,
    skillId: activeSkill?.id || '',
    skillLabel: activeSkill?.label || '',
    skillReason: skillResolution.reason,
    skillSelectionSkipped: skipSkillSelection,
    automationPromptSkipped: skipAutomationPrompt,
    automationSkipped: Boolean(automationSkipReason),
    automationSkipReason,
    personalStyleStructureHintsSkipped: omitPersonalStyleStructureHints,
    assignmentRequirements: buildAssignmentRequirementLogPayload(assignmentRequirements),
  });

  if (shouldAttemptAutomation) {
    if (enabledAgents.length) {
      const executionPlan = await planWithManagerIfNeeded({
        cleanUserPrompt,
        documentContext,
        structureConstraintText,
        extraSystemPrompt,
        enabledAgents,
        automation,
        cfg,
        selectedProviders,
        preferredProviders: sourceAwareAutomationPreferredProviders,
        runId,
        logEvent,
        onStatus,
        activeSkill,
        preserveFullDocumentContext,
      });

      const orderedAgents = executionPlan?.orderedAgents?.length ? executionPlan.orderedAgents : enabledAgents;
      const plannedRoundBudget = executionPlan?.roundBudget && typeof executionPlan.roundBudget === 'object'
        ? executionPlan.roundBudget
        : {};
      const plannedMinRounds = clampAutopilotRoundCount(plannedRoundBudget?.minPerAgent, 1);
      const plannedMaxRounds = clampAutopilotRoundCount(plannedRoundBudget?.maxPerAgent, plannedMinRounds);
      const plannedFinalManagerPasses = clampAutopilotRoundCount(
        plannedRoundBudget?.finalManagerPasses,
        1,
        AUTOPILOT_MAX_FINAL_REVIEW_PASSES,
      );
      const autopilotPlannerEnabled = automation?.autopilotEnabled !== false;
      const autopilotWantsMultiPass = autopilotPlannerEnabled && automation.workflowMode === 'autopilot-full' && (plannedMinRounds > 1 || plannedMaxRounds > 1);
      const allowCircularWorkflow = (automation.workflowMode === 'circular-team' && automation.circularWorkflowEnabled !== false) || autopilotWantsMultiPass;
      const decisionMode = getDecisionMode(automation, enabledAgents);
      const allowDecisionRevisits = allowCircularWorkflow || decisionMode === 'manager';
      const skillsConfig = getSkillsConfig();
      const requestedAdditionalReviewRounds = Math.max(0, Math.min(2, Number(options.additionalReviewRounds || 0)));
      const baseMaxRoundsPerAgent = allowCircularWorkflow ? getCircularRoundLimit(automation) : (allowDecisionRevisits ? 2 : 1);
      const maxRoundsPerAgent = autopilotPlannerEnabled && automation.workflowMode === 'autopilot-full'
        ? Math.max(plannedMinRounds, plannedMaxRounds)
        : baseMaxRoundsPerAgent;
      const maxFinalManagerReviewPasses = ((autopilotPlannerEnabled && automation.workflowMode === 'autopilot-full') ? plannedFinalManagerPasses : baseMaxRoundsPerAgent) + requestedAdditionalReviewRounds;
      const minRoundsPerAgent = allowCircularWorkflow
        ? Math.min(maxRoundsPerAgent, (autopilotPlannerEnabled && automation.workflowMode === 'autopilot-full') ? plannedMinRounds : getCircularMinRoundLimit(automation))
        : 1;
      const maxAdditionalReviewStages = requestedAdditionalReviewRounds * Math.max(2, enabledAgents.length);
      const maxStageCount = Math.max(orderedAgents.length, orderedAgents.length * maxRoundsPerAgent) + maxAdditionalReviewStages;
      const agentRunCounts = {};
      const executionQueue = orderedAgents.map((agent) => ({ agent, revisitReason: '' }));

      const workflowAgentSummary = orderedAgents.length < enabledAgents.length
        ? ` עם ${orderedAgents.length} סוכנים נבחרים מתוך ${enabledAgents.length} המוגדרים למשימה זו`
        : ` עם ${orderedAgents.length} סוכנים`;

      logEvent('workflow-start', `הופעלה סביבת עבודה${allowCircularWorkflow ? ' מעגלית' : decisionMode === 'manager' ? ' דינמית' : ''}${workflowAgentSummary}`, {
        state: 'running',
        orderedAgents: orderedAgents.map((agent) => agent.name),
        orderedAgentIds: orderedAgents.map((agent) => agent.id),
        configuredAgentCount: enabledAgents.length,
        planSummary: executionPlan?.summary || '',
        circularEnabled: allowCircularWorkflow,
        additionalReviewRounds: requestedAdditionalReviewRounds,
        maxAdditionalReviewStages,
        maxRoundsPerAgent,
        minRoundsPerAgent,
        decisionMode,
        executionStyle: executionPlan?.executionStyle || '',
        roundBudget: plannedRoundBudget,
        assignmentRequirements: buildAssignmentRequirementLogPayload(executionPlan?.autopilotTaskProfile?.assignmentRequirements),
      });

      let stagedOutput = '';
      const seededDocumentOutput = expectDocumentOutput
        ? String(options.documentFallbackHtml || extractExistingHtmlFromWorkflowContext(documentContext) || '').trim()
        : '';
      let processedStages = 0;
      let pendingFinalManagerReview = executionPlan?.needsFinalManagerReview === true;
      let finalManagerReviewPasses = 0;
      let notesAlreadyAppended = false;
      let lastManagerReviewPacket = null;
      let finalOutputProvider = activeProvider;
      let finalOutputModel = resolvedModel;
      const batonNotes = executionPlan?.summary ? [`מנהל העבודה: ${executionPlan.summary}`] : [];
      const stageArtifacts = [];
      const stageMemoryArtifacts = [];
      const stageNotes = [];
      let finalRequirementAuditRevisitUsed = false;

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
          const stageInstruction = resolveStagePlanString(executionPlan?.stageInstructions || {}, stageAgent);
          const allowedStageProviders = getConfiguredProviderPool(cfg, sourceAwareAutomationPreferredProviders);
          const normalizedRequestedProvider = resolveExplicitProviderCandidate([
            executionPlan?.stageProviders?.[stageAgent.id],
            executionPlan?.stageProviders?.[stageAgent.name],
            executionPlan?.stageProviders?.[String(stageAgent.id || '').toLowerCase()],
            executionPlan?.stageProviders?.[stageRoutingKey],
          ], allowedStageProviders, cfg);
          const stageProvider = normalizedRequestedProvider || chooseProviderForAgent(stageAgent, cfg, sourceAwareAutomationPreferredProviders);
          const plannedStageModel = resolveStagePlanString(executionPlan?.stageModels || {}, stageAgent);
          const rawStageRequestedModel = plannedStageModel || stageAgent.model || taggedRouting.providerModels?.[stageProvider] || getModelNameForProvider(stageProvider, cfg, modelOverride);
          const stageRequestedModel = stageProvider && rawStageRequestedModel && !isProviderModelChoiceCompatible(stageProvider, rawStageRequestedModel, cfg)
            ? ''
            : normalizeProviderModelName(stageProvider, rawStageRequestedModel);
          const stageDocumentContext = buildWorkflowStageDocumentContext(documentContext, stagedOutput);
          const stagePrompt = buildStagePrompt({
          cleanUserPrompt,
          stageGoal,
          stageInstruction,
          stageAgent,
          stagedOutput,
          sharedMemoryArtifacts: stageMemoryArtifacts,
          batonNotes,
          planSummary: executionPlan?.summary || '',
          index: processedStages,
          total: maxStageCount,
          allowCircular: allowCircularWorkflow,
          roundIndex: runCount - 1,
          revisitReason: queueItem?.revisitReason || '',
          decisionMode,
          enabledAgents,
          agentNotesInstruction,
          collectAgentNotes: appendAgentNotesToOutput,
          assignmentRequirements: executionPlan?.autopilotTaskProfile?.assignmentRequirements,
        });

          logEvent('stage-start', `מתחיל שלב ${processedStages + 1} מתוך ${maxStageCount}${runCount > 1 ? ` • סבב ${runCount}` : ''}`, {
          state: 'running',
          agentId: stageAgent.id,
          agentLabel: stageLabel,
          agentName: stageAgent.name || stageLabel,
          provider: stageProvider,
          model: stageRequestedModel,
          stageIndex: processedStages + 1,
          stageTotal: maxStageCount,
          roundIndex: runCount,
          revisitReason: queueItem?.revisitReason || '',
          promptPreview: trimLogText(stagePrompt),
        });

          try {
          const stageSystemPrompt = isManagerReviewAgent(stageAgent)
            ? `${stageAgent.prompt}${stageInstruction ? `\nהנחיית AUTOPILOT משלימה לשלב:\n${stageInstruction}` : ''}\nבשלב ביקורת ניהולית DELIVERABLE חייב להיות המסמך המלא והמעודכן בלבד. הערות, פערים ותיקוני חובה שייכים ל-HANDOFF / MISSING / CHECKLIST. גם אם צריך לעצור או לבקש REVISIT, אל תחזיר פסקת מטא במקום המסמך המלא.\nהחזר בתבנית DELIVERABLE / HANDOFF / MISSING / DECISION / CHECKLIST בלבד.`
            : `${stageAgent.prompt}${stageInstruction ? `\nהנחיית AUTOPILOT משלימה לשלב:\n${stageInstruction}` : ''}\nהחזר בתבנית DELIVERABLE / HANDOFF / MISSING / DECISION / CHECKLIST בלבד.`;
          const previousStageOutput = resolveDocumentPreservationCandidate(stagedOutput, seededDocumentOutput);
          const stageSourceQuery = buildWorkflowStageSourceQueryOverride({
            stageGoal,
            stageInstruction,
            stageAgent,
            stageLabel,
            assignmentRequirements: executionPlan?.autopilotTaskProfile?.assignmentRequirements,
            fallbackResearchTopic: options.researchTopic,
            fallbackUserPrompt: cleanUserPrompt,
          });
          const stageReply = await chatWithActiveProvider(stagePrompt, stageDocumentContext, stageSystemPrompt, {
            providerOverride: stageProvider,
            preferredProviders: stageProvider ? [stageProvider] : sourceAwareAutomationPreferredProviders,
            strictProviderOverride: true,
            modelOverride: stageRequestedModel || '',
            agentId: stageAgent.id || '',
            includeCompletionMetadata: true,
            strictFormatting: true,
            skipAutomation: true,
            skipMultiModel: true,
            assignmentRequirements: executionPlan?.autopilotTaskProfile?.assignmentRequirements,
            sourceQueryOverride: stageSourceQuery.query,
            sourceQuerySource: stageSourceQuery.querySource,
            blockAssignmentSourceQuery: stageSourceQuery.blocked,
            preserveFullDocumentContext,
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
                model: payload.model || stageRequestedModel,
                agentId: stageAgent.id,
                agentLabel: stageLabel,
                progress: mappedProgress,
                message: payload.message || `מעבד שלב ${processedStages + 1} מתוך ${maxStageCount}`,
              });
            },
          });

          const normalizedStageReply = normalizeProviderTextResponse(stageReply, stageProvider);
          const stageReplyProvider = normalizedStageReply.completion?.provider || stageProvider || finalOutputProvider;
          const stageReplyModel = normalizedStageReply.completion?.model || stageRequestedModel || finalOutputModel;
          const parsedReply = parseStagePacket(normalizedStageReply.text);
          const rawStageArtifact = String(parsedReply.deliverable || '').trim();
          const stageArtifact = shouldPreservePriorDocumentFromStageArtifact({
            packet: parsedReply,
            previousDocument: previousStageOutput,
            stageAgent,
            expectDocumentOutput,
          })
            ? String(previousStageOutput || '').trim()
            : rawStageArtifact;
          const stageArtifactProvider = stageArtifact === rawStageArtifact ? stageReplyProvider : finalOutputProvider;
          const stageArtifactModel = stageArtifact === rawStageArtifact ? stageReplyModel : finalOutputModel;
          const effectiveParsedReply = stageArtifact === rawStageArtifact
            ? parsedReply
            : { ...parsedReply, deliverable: stageArtifact };
          if (stageArtifact !== rawStageArtifact) {
            logEvent('stage-artifact-fallback', isManagerReviewAgent(stageAgent)
              ? 'ביקורת ניהולית החזירה פלט מטא; נשמר המסמך המלא האחרון כ-DELIVERABLE'
              : 'השלב החזיר פלט מטא או נספח הערות במקום מסמך; נשמר המסמך המלא האחרון כ-DELIVERABLE', {
              state: 'success',
              agentId: stageAgent.id,
              agentLabel: stageLabel,
              agentName: stageAgent.name || stageLabel,
              provider: stageReplyProvider,
              model: stageReplyModel,
              stageIndex: processedStages + 1,
              stageTotal: maxStageCount,
              roundIndex: runCount,
              outputPreview: trimLogText(rawStageArtifact || normalizedStageReply.text || ''),
            });
          }
          if (!hasMeaningfulArtifact(stageArtifact, cleanUserPrompt)) {
            logEvent('stage-noop', `השלב ${processedStages + 1} לא החזיר תוצר שימושי`, {
              state: 'error',
              agentId: stageAgent.id,
              agentLabel: stageLabel,
              agentName: stageAgent.name || stageLabel,
              provider: stageReplyProvider,
              model: stageReplyModel,
              stageIndex: processedStages + 1,
              stageTotal: maxStageCount,
              roundIndex: runCount,
              outputPreview: trimLogText(stageArtifact || normalizedStageReply.text || ''),
              errorMessage: 'הסוכן לא סיפק deliverable מספק',
            });
            throw new Error(`הסוכן ${stageLabel} לא סיפק deliverable מספק. עצרתי כדי למנוע גז בניוטרל.`);
          }

          stagedOutput = stageArtifact;
          if (stageArtifact === rawStageArtifact) {
            finalOutputProvider = stageReplyProvider || finalOutputProvider;
            finalOutputModel = stageReplyModel || finalOutputModel;
          }
          stageArtifacts.push({
            agentId: stageAgent.id,
            agentLabel: stageLabel,
            provider: stageArtifactProvider,
            model: stageArtifactModel,
            chars: stageArtifact.length,
            preview: trimLogText(stageArtifact, 180),
          });
          stageMemoryArtifacts.push({
            agentId: stageAgent.id,
            agentLabel: stageLabel,
            roleKey: stageRoutingKey,
            text: stageArtifact,
          });
          while (stageMemoryArtifacts.length > WORKFLOW_SHARED_MEMORY_MAX_ITEMS) stageMemoryArtifacts.shift();

          if (effectiveParsedReply.handoff) {
            batonNotes.push(`${stageAgent.name}: ${effectiveParsedReply.handoff.replace(/\n+/g, ' ; ')}`);
          }

          if (effectiveParsedReply.missing) {
            batonNotes.push(`${stageAgent.name} זיהה פערים: ${effectiveParsedReply.missing.replace(/\n+/g, ' ; ')}`);
          }

          const stageNoteText = [effectiveParsedReply.handoff, effectiveParsedReply.checklist, hasMeaningfulMissingItems(effectiveParsedReply.missing) ? effectiveParsedReply.missing : '']
            .filter(Boolean)
            .join('\n');
          if (stageNoteText.trim()) {
            stageNotes.push({
              agentId: stageAgent.id,
              agentLabel: stageLabel,
              roundIndex: runCount,
              note: stageNoteText,
            });
          }

          const suggestedSkillIds = extractRequestedSkills(effectiveParsedReply, skillsConfig);
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

          const directives = getDecisionDirectives(effectiveParsedReply);
          const hasPendingMinRounds = allowCircularWorkflow && orderedAgents.some((agent) => (agentRunCounts[agent.id] || 0) < minRoundsPerAgent);
          if (directives.stop && !hasPendingMinRounds) {
            executionQueue.length = 0;
            logEvent('stage-stop-requested', 'השלב ביקש לעצור ולהחזיר תוצאה סופית', {
              state: 'success',
              agentId: stageAgent.id,
              agentLabel: stageLabel,
              agentName: stageAgent.name || stageLabel,
              decisionPreview: trimLogText(effectiveParsedReply.decision || ''),
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
              ? getManagerReviewRevisitAgents({ stageAgent, packet: effectiveParsedReply, enabledAgents, agentRunCounts, maxRounds: maxRoundsPerAgent, forceManagerDecide: true })
              : [];
            const requestedRevisits = [
              ...priorityManager,
              ...extractRevisitAgents(effectiveParsedReply, enabledAgents),
              ...(decisionMode === 'manager'
                ? getManagerReviewRevisitAgents({ stageAgent, packet: effectiveParsedReply, enabledAgents, agentRunCounts, maxRounds: maxRoundsPerAgent })
                : getRuleDrivenRevisitAgents({ stageAgent, packet: effectiveParsedReply, enabledAgents, agentRunCounts, maxRounds: maxRoundsPerAgent })),
            ].filter((agent, index, list) => list.findIndex((item) => item.id === agent.id) === index);
            const fallbackPlanningManager = isManagerReviewAgent(stageAgent)
              ? resolvePlanningManagerAgent(enabledAgents)
              : null;
            const fallbackWorkerAgent = isManagerReviewAgent(stageAgent)
              ? ['writer', 'proofreader', 'designer', 'researcher']
                .map((token) => resolveStageAgent(token, enabledAgents))
                .filter((agent) => agent?.id && agent.id !== stageAgent.id)
                .find(Boolean)
                || enabledAgents.find((agent) => agent?.id && agent.id !== stageAgent.id)
                || null
              : null;
            const revisitTargets = requestedRevisits.length
              ? requestedRevisits
              : (isManagerReviewAgent(stageAgent) && hasMeaningfulMissingItems(effectiveParsedReply.missing) && fallbackPlanningManager && fallbackPlanningManager.id !== stageAgent.id
                ? [fallbackPlanningManager]
                : (isManagerReviewAgent(stageAgent) && hasMeaningfulMissingItems(effectiveParsedReply.missing) && fallbackWorkerAgent
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
              decisionPreview: trimLogText(effectiveParsedReply.decision || ''),
              missingPreview: trimLogText(effectiveParsedReply.missing || ''),
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
            provider: stageArtifactProvider,
            model: stageArtifactModel,
            stageIndex: processedStages + 1,
            stageTotal: maxStageCount,
            roundIndex: runCount,
            outputChars: stagedOutput.length,
            outputPreview: trimLogText(stagedOutput),
            handoffPreview: trimLogText(effectiveParsedReply.handoff || ''),
            missingPreview: trimLogText(effectiveParsedReply.missing || ''),
            decisionPreview: trimLogText(effectiveParsedReply.decision || ''),
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

        if (!pendingFinalManagerReview && !executionQueue.length && !finalRequirementAuditRevisitUsed) {
          const auditCandidate = resolveDocumentPreservationCandidate(stagedOutput, seededDocumentOutput) || String(cleanUserPrompt || '').trim();
          const requirementAudit = auditAssignmentRequirements(auditCandidate, executionPlan?.autopilotTaskProfile?.assignmentRequirements);
          if (requirementAudit.required?.hasSourceQuotas || requirementAudit.missing.length) {
            logEvent('workflow-requirement-audit', requirementAudit.isComplete
              ? 'בדיקת דרישות לפני סיום: כל המכסות המזוהות נראות מלאות'
              : 'בדיקת דרישות לפני סיום: נמצאו חוסרים במכסות המטלה', {
              state: requirementAudit.isComplete ? 'success' : 'retrying',
              ...requirementAudit,
            });
          }
          if (requirementAudit.missing.length && processedStages < maxStageCount) {
            const revisitTargets = resolveRequirementAuditRevisitAgents({
              missing: requirementAudit.missing,
              enabledAgents,
            }).filter((agent) => (agentRunCounts[agent.id] || 0) < maxRoundsPerAgent);
            const scheduledRevisits = enqueueWorkflowRevisits({
              requestedRevisits: revisitTargets,
              executionQueue,
              agentRunCounts,
              maxRounds: maxRoundsPerAgent,
              logEvent,
              requestedByAgent: orderedAgents[orderedAgents.length - 1] || null,
              requestedByLabel: 'בדיקת דרישות אוטומטית',
              decisionMode,
              decisionPreview: 'REVISIT בגלל חוסר ברור במכסות המטלה',
              missingPreview: JSON.stringify(requirementAudit.missing),
              revisitReason: 'בדיקת דרישות סופית זיהתה מכסות חסרות',
            });
            if (scheduledRevisits.length) {
              finalRequirementAuditRevisitUsed = true;
              batonNotes.push(`בדיקת דרישות: חסרים פריטים לפני סיום — ${requirementAudit.missing.map((item) => `${item.key} ${item.found}/${item.required}`).join('; ')}`);
              while (batonNotes.length > 10) batonNotes.shift();
              pendingFinalManagerReview = Boolean(resolveFinalManagerReviewAgent(enabledAgents));
              continue;
            }
          }
        }

        if (!pendingFinalManagerReview) break;

        const managerAgent = resolveFinalManagerReviewAgent(enabledAgents);
        if (!managerAgent) {
          throw new Error('נדרשת סקירת manager סופית, אבל אין סוכן manager פעיל ב-workflow הנוכחי.');
        }

        const nextFinalManagerReviewPass = finalManagerReviewPasses + 1;
        const priorManagerRuns = agentRunCounts[managerAgent.id] || 0;
        const allowedFinalReviewBudget = maxRoundsPerAgent + maxFinalManagerReviewPasses;
        if ((priorManagerRuns + nextFinalManagerReviewPass) > allowedFinalReviewBudget) {
          logEvent('stage-revisit-required', 'סקירת manager סופית הייתה חורגת ממגבלת הסבבים; מוחזרת הטיוטה המלאה האחרונה', {
            state: 'error',
            agentId: managerAgent.id,
            agentLabel: managerAgent.name,
            agentName: managerAgent.name,
            priorManagerRuns,
            finalManagerReviewPasses,
            allowedFinalReviewBudget,
          });
          pendingFinalManagerReview = false;
          executionQueue.length = 0;
          logEvent('workflow-recovered', expectDocumentOutput
            ? 'סקירת manager סופית הגיעה למגבלת הסבבים, והוחזרה הטיוטה המלאה האחרונה במקום כשלון'
            : 'סקירת manager סופית הגיעה למגבלת הסבבים, והוחזרה התשובה הטובה ביותר שנצברה עד כה', {
            state: 'success',
            agentId: managerAgent.id,
            agentLabel: managerAgent.name || 'מנהל העבודה',
            outputChars: String(stagedOutput || cleanUserPrompt).trim().length,
          });
          break;
        }
        finalManagerReviewPasses = nextFinalManagerReviewPass;
        const managerRoleKey = isManagerReviewAgent(managerAgent) ? 'manager-review' : getAgentRoleKey(managerAgent);
        const managerReviewGoal = executionPlan?.stageGoals?.['manager-review']
          || resolveStagePlanString(executionPlan?.stageGoals || {}, managerAgent)
          || DEFAULT_MANAGER_REVIEW_GOAL;
        const managerReviewInstruction = executionPlan?.stageInstructions?.['manager-review']
          || resolveStagePlanString(executionPlan?.stageInstructions || {}, managerAgent);
        const allowedReviewProviders = getConfiguredProviderPool(cfg, sourceAwareAutomationPreferredProviders);
        const normalizedReviewProvider = resolveExplicitProviderCandidate([
          executionPlan?.stageProviders?.['manager-review'],
          executionPlan?.stageProviders?.[managerAgent.id],
          executionPlan?.stageProviders?.[managerAgent.name],
          executionPlan?.stageProviders?.[String(managerAgent.id || '').toLowerCase()],
          executionPlan?.stageProviders?.[managerRoleKey],
        ], allowedReviewProviders, cfg);
        const reviewProvider = normalizedReviewProvider || chooseProviderForAgent(managerAgent, cfg, sourceAwareAutomationPreferredProviders);
        const plannedReviewModel = executionPlan?.stageModels?.['manager-review']
          || resolveStagePlanString(executionPlan?.stageModels || {}, managerAgent);
        const rawReviewRequestedModel = plannedReviewModel || managerAgent.model || taggedRouting.providerModels?.[reviewProvider] || getModelNameForProvider(reviewProvider, cfg, modelOverride);
        const reviewRequestedModel = reviewProvider && rawReviewRequestedModel && !isProviderModelChoiceCompatible(reviewProvider, rawReviewRequestedModel, cfg)
          ? ''
          : normalizeProviderModelName(reviewProvider, rawReviewRequestedModel);
        const reviewDocumentContext = buildWorkflowStageDocumentContext(documentContext, stagedOutput);
        const reviewPrompt = buildStagePrompt({
          cleanUserPrompt,
          stageGoal: managerReviewGoal,
          stageInstruction: managerReviewInstruction,
          stageAgent: managerAgent,
          stagedOutput,
          sharedMemoryArtifacts: stageMemoryArtifacts,
          batonNotes,
          planSummary: executionPlan?.summary || '',
          index: orderedAgents.length,
          total: orderedAgents.length + 1,
          finalReview: true,
          enabledAgents,
          agentNotesInstruction,
          collectAgentNotes: appendAgentNotesToOutput,
          assignmentRequirements: executionPlan?.autopilotTaskProfile?.assignmentRequirements,
        });

        const previousManagerOutput = resolveDocumentPreservationCandidate(stagedOutput, seededDocumentOutput);
        const managerReply = await chatWithActiveProvider(reviewPrompt, reviewDocumentContext, `${managerAgent.prompt}${managerReviewInstruction ? `\nהנחיית AUTOPILOT משלימה לשלב:\n${managerReviewInstruction}` : ''}\nזהו שלב בדיקה סופי לפני החזרה למשתמש. DELIVERABLE חייב להיות המסמך המלא והמעודכן בלבד. הערות, חוסרים ותיקוני חובה שייכים ל-HANDOFF / MISSING / CHECKLIST. גם אם צריך לעצור או לבקש REVISIT, אל תחזיר פסקת מטא במקום המסמך המלא. החזר בתבנית DELIVERABLE / HANDOFF / MISSING / DECISION / CHECKLIST בלבד.`, {
          providerOverride: reviewProvider,
          preferredProviders: reviewProvider ? [reviewProvider] : sourceAwareAutomationPreferredProviders,
          strictProviderOverride: true,
          modelOverride: reviewRequestedModel || '',
          includeCompletionMetadata: true,
          strictFormatting: true,
          skipAutomation: true,
          skipMultiModel: true,
          assignmentRequirements: executionPlan?.autopilotTaskProfile?.assignmentRequirements,
          preserveFullDocumentContext,
          shouldPersistMemory: false,
          agentId: managerAgent.id || '',
          agentLabel: managerAgent.name,
          agentName: managerAgent.name,
          runId,
          onStatus: (payload = {}) => emitStatus(onStatus, {
            ...payload,
            runId,
            provider: payload.provider || reviewProvider,
            model: payload.model || reviewRequestedModel,
            agentLabel: managerAgent.name,
            progress: Math.max(92, Number(payload.progress ?? 96)),
            message: payload.message || 'מנהל העבודה מבצע סקירה סופית',
          }),
        });

        const normalizedManagerReply = normalizeProviderTextResponse(managerReply, reviewProvider);
        const managerReplyProvider = normalizedManagerReply.completion?.provider || reviewProvider || finalOutputProvider;
        const managerReplyModel = normalizedManagerReply.completion?.model || reviewRequestedModel || finalOutputModel;
        const parsedManagerReply = parseStagePacket(normalizedManagerReply.text);
        const rawManagerArtifact = String(parsedManagerReply.deliverable || '').trim();
        const managerArtifact = shouldPreservePriorDocumentFromStageArtifact({
          packet: parsedManagerReply,
          previousDocument: previousManagerOutput,
          stageAgent: managerAgent,
          expectDocumentOutput,
        })
          ? String(previousManagerOutput || '').trim()
          : rawManagerArtifact;
        const effectiveManagerReply = managerArtifact === rawManagerArtifact
          ? parsedManagerReply
          : { ...parsedManagerReply, deliverable: managerArtifact };
        if (managerArtifact !== rawManagerArtifact) {
          logEvent('stage-artifact-fallback', 'סקירת המנהל החזירה פלט מטא; נשמר המסמך המלא האחרון כ-DELIVERABLE', {
            state: 'success',
            agentId: managerAgent.id,
            agentLabel: managerAgent.name,
            agentName: managerAgent.name,
            provider: managerReplyProvider,
            model: managerReplyModel,
            outputPreview: trimLogText(rawManagerArtifact || normalizedManagerReply.text || ''),
          });
        }
        lastManagerReviewPacket = effectiveManagerReply;
        const managerDirectives = getDecisionDirectives(effectiveManagerReply);
        const managerNoteText = [effectiveManagerReply.handoff, effectiveManagerReply.checklist, hasMeaningfulMissingItems(effectiveManagerReply.missing) ? effectiveManagerReply.missing : '']
          .filter(Boolean)
          .join('\n');
        if (managerNoteText.trim()) {
          stageNotes.push({
            agentId: managerAgent.id,
            agentLabel: managerAgent.name || 'מנהל העבודה',
            roundIndex: finalManagerReviewPasses,
            note: managerNoteText,
          });
        }
        const revisitAllAgents = managerDirectives.revisitAll
          ? enabledAgents.filter((agent) => agent?.id && agent.id !== managerAgent.id)
          : [];
        const managerRevisitAgents = [
          ...revisitAllAgents,
          ...extractRevisitAgents(effectiveManagerReply, enabledAgents),
          ...getRuleDrivenRevisitAgents({ stageAgent: managerAgent, packet: effectiveManagerReply, enabledAgents, agentRunCounts, maxRounds: maxRoundsPerAgent }),
        ]
          .filter((agent, index, list) => agent?.id ? list.findIndex((item) => item.id === agent.id) === index : false)
          .filter((agent) => agent.id !== managerAgent.id);
        if (!hasMeaningfulArtifact(managerArtifact, cleanUserPrompt)) {
          logEvent('stage-noop', 'סקירת המנהל לא החזירה תוצר סופי שימושי', {
            state: 'error',
            agentId: managerAgent.id,
            agentLabel: managerAgent.name,
            agentName: managerAgent.name,
            provider: managerReplyProvider,
            model: managerReplyModel,
            outputPreview: trimLogText(managerArtifact || normalizedManagerReply.text || ''),
            errorMessage: 'סקירת המנהל הסתיימה ללא deliverable תקין',
          });
          throw new Error('סקירת המנהל הסתיימה ללא deliverable תקין. עצרתי כדי למנוע תוצאה ריקה.');
        }

        const managerNeedsRevisit = managerDirectives.managerDecide || managerDirectives.revisitAll || managerRevisitAgents.length || hasMeaningfulMissingItems(effectiveManagerReply.missing);
        if (managerNeedsRevisit) {
          const fallbackPlanningManager = resolvePlanningManagerAgent(enabledAgents);
          const fallbackWorkerAgent = ['writer', 'proofreader', 'designer', 'researcher']
            .map((token) => resolveStageAgent(token, enabledAgents))
            .filter((agent) => agent?.id && agent.id !== managerAgent.id)
            .find(Boolean)
            || enabledAgents.find((agent) => agent?.id && agent.id !== managerAgent.id)
            || null;
          const revisitTargets = managerRevisitAgents.length
            ? managerRevisitAgents
            : (fallbackPlanningManager && fallbackPlanningManager.id !== managerAgent.id
              ? [fallbackPlanningManager]
              : (fallbackWorkerAgent ? [fallbackWorkerAgent] : []));
          if (processedStages >= maxStageCount || finalManagerReviewPasses >= maxFinalManagerReviewPasses) {
            logEvent('stage-revisit-required', 'סקירת המנהל דרשה סבב נוסף אך ה-workflow כבר הגיע למגבלת הסבבים', {
              state: 'error',
              agentId: managerAgent.id,
              agentLabel: managerAgent.name,
              agentName: managerAgent.name,
              provider: reviewProvider,
              model: managerAgent.model || getModelNameForProvider(reviewProvider, cfg, modelOverride),
              decision: effectiveManagerReply.decision || '',
              missing: effectiveManagerReply.missing || '',
              maxFinalManagerReviewPasses,
            });
            const recoverySource = expectDocumentOutput
              ? (stagedOutput || managerArtifact || cleanUserPrompt)
              : (managerArtifact || stagedOutput || cleanUserPrompt);
            const recoveryOutput = String(recoverySource).trim();
            if (appendAgentNotesToOutput) {
              const recoveryAppendix = buildAgentNotesAppendix({
                stageNotes,
                notesInstruction: agentNotesInstruction,
                managerPacket: effectiveManagerReply,
                managerLabel: managerAgent.name || 'מנהל העבודה',
                preferHtml: looksLikeHtmlDocument(recoveryOutput),
              });
              stagedOutput = appendNotesToOutput({
                output: recoveryOutput,
                appendix: recoveryAppendix,
              });
              notesAlreadyAppended = true;
            } else {
              stagedOutput = recoveryOutput;
              notesAlreadyAppended = false;
            }
            pendingFinalManagerReview = false;
            executionQueue.length = 0;
            logEvent('workflow-recovered', expectDocumentOutput
              ? 'ה-workflow הגיע למגבלת סבבים, והוחזרה הטיוטה המלאה האחרונה במקום תוצר ביקורת חלקי'
              : 'ה-workflow הגיע למגבלת סבבים, והוחזרה התשובה הטובה ביותר שנצברה עד כה', {
              state: 'success',
              agentId: managerAgent.id,
              agentLabel: managerAgent.name || 'מנהל העבודה',
              outputChars: stagedOutput.length,
            });
            break;
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
            decisionPreview: trimLogText(effectiveManagerReply.decision || ''),
            missingPreview: trimLogText(effectiveManagerReply.missing || ''),
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
              decision: effectiveManagerReply.decision || '',
              missing: effectiveManagerReply.missing || '',
            });
            const recoverySource = expectDocumentOutput
              ? (stagedOutput || managerArtifact || cleanUserPrompt)
              : (managerArtifact || stagedOutput || cleanUserPrompt);
            const recoveryOutput = String(recoverySource).trim();
            if (appendAgentNotesToOutput) {
              const recoveryAppendix = buildAgentNotesAppendix({
                stageNotes,
                notesInstruction: agentNotesInstruction,
                managerPacket: effectiveManagerReply,
                managerLabel: managerAgent.name || 'מנהל העבודה',
                preferHtml: looksLikeHtmlDocument(recoveryOutput),
              });
              stagedOutput = appendNotesToOutput({
                output: recoveryOutput,
                appendix: recoveryAppendix,
              });
              notesAlreadyAppended = true;
            } else {
              stagedOutput = recoveryOutput;
              notesAlreadyAppended = false;
            }
            pendingFinalManagerReview = false;
            executionQueue.length = 0;
            logEvent('workflow-recovered', expectDocumentOutput
              ? 'לא נמצא שלב המשך תקף; הוחזרה הטיוטה המלאה האחרונה במקום תוצר ביקורת חלקי'
              : 'לא נמצא שלב המשך תקף; הוחזרה התשובה הטובה ביותר במקום כשלון', {
              state: 'success',
              agentId: managerAgent.id,
              agentLabel: managerAgent.name || 'מנהל העבודה',
              outputChars: stagedOutput.length,
            });
            break;
          }

          logEvent('stage-revisit-required', 'סקירת המנהל דרשה סבב נוסף לפני החזרה למשתמש', {
            state: 'retrying',
            agentId: managerAgent.id,
            agentLabel: managerAgent.name,
            agentName: managerAgent.name,
            provider: reviewProvider,
            model: managerAgent.model || getModelNameForProvider(reviewProvider, cfg, modelOverride),
            decision: effectiveManagerReply.decision || '',
            missing: effectiveManagerReply.missing || '',
            requestedAgents: scheduledRevisits.map((agent) => agent.id),
          });
          if (effectiveManagerReply.handoff) batonNotes.push(`${managerAgent.name}: ${effectiveManagerReply.handoff.replace(/\n+/g, ' ; ')}`);
          while (batonNotes.length > 10) batonNotes.shift();
          continue;
        }

        stagedOutput = managerArtifact;
        if (managerArtifact === rawManagerArtifact) {
          finalOutputProvider = managerReplyProvider || finalOutputProvider;
          finalOutputModel = managerReplyModel || finalOutputModel;
        }
        pendingFinalManagerReview = false;
        if (effectiveManagerReply.handoff) batonNotes.push(`${managerAgent.name}: ${effectiveManagerReply.handoff.replace(/\n+/g, ' ; ')}`);
        while (batonNotes.length > 10) batonNotes.shift();
      }

      let finalOutput = resolveDocumentPreservationCandidate(stagedOutput, seededDocumentOutput) || String(cleanUserPrompt || '').trim();
      if (expectDocumentOutput && appendAgentNotesToOutput && !notesAlreadyAppended) {
        const appendix = buildAgentNotesAppendix({
          stageNotes,
          notesInstruction: agentNotesInstruction,
          managerPacket: lastManagerReviewPacket,
          managerLabel: 'מנהל העבודה',
          preferHtml: looksLikeHtmlDocument(finalOutput),
        });
        finalOutput = appendNotesToOutput({ output: finalOutput, appendix });
      }
      const finalRequirementAudit = auditAssignmentRequirements(finalOutput, executionPlan?.autopilotTaskProfile?.assignmentRequirements);
      if (finalRequirementAudit.required?.hasSourceQuotas || finalRequirementAudit.missing.length) {
        logEvent('workflow-requirement-audit', finalRequirementAudit.isComplete
          ? 'בדיקת דרישות סופית: המכסות המזוהות נראות מלאות'
          : 'בדיקת דרישות סופית: התוצר עדיין חסר מול מכסות המטלה', {
          state: finalRequirementAudit.isComplete ? 'success' : 'error',
          ...finalRequirementAudit,
        });
      }
      logEvent(finalRequirementAudit.missing.length ? 'workflow-incomplete' : 'workflow-success', finalRequirementAudit.missing.length ? 'ה-workflow הסתיים עם חוסרים גלויים בדרישות המטלה' : 'כל שלבי העבודה הושלמו', {
        state: finalRequirementAudit.missing.length ? 'error' : 'success',
        agentLabel: orderedAgents[orderedAgents.length - 1]?.name || agentLabel,
        agentName: orderedAgents[orderedAgents.length - 1]?.name || agentLabel,
        outputChars: finalOutput.length,
        outputPreview: trimLogText(finalOutput),
        artifactCount: stageArtifacts.length,
        stageArtifacts,
        requirementAudit: finalRequirementAudit,
      });
      emitStatus(onStatus, {
        state: 'success',
        progress: 100,
        runId,
        provider: finalOutputProvider,
        model: finalOutputModel,
        agentLabel: orderedAgents[orderedAgents.length - 1]?.name || agentLabel,
        message: 'כל שלבי העבודה הושלמו'
      });
      return rememberSuccessfulReply({
        text: finalOutput,
        completion: {
          provider: finalOutputProvider,
          model: finalOutputModel,
        },
      });
    }
  }

  if (selectedProviders.length > 1 && !options.providerOverride && !options.skipMultiModel && !sourceGroundingRequired) {
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
          includeCompletionMetadata: true,
          runId,
          agentLabel: providerLabel,
          onStatus,
        });
        const normalizedProviderReply = normalizeProviderTextResponse(providerReply, providerId);
        collectedResponses.push({
          providerId,
          providerLabel,
          content: normalizedProviderReply.text,
          reply: normalizedProviderReply,
        });
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
      return rememberSuccessfulReply(collectedResponses[0].reply);
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
        includeCompletionMetadata: true,
        runId,
        agentLabel: `${agentLabel} · איחוד`,
        onStatus,
      });
      const normalizedMergedReply = normalizeProviderTextResponse(mergedReply, mergeProviderId);

      logEvent('multi-model-success', 'האיחוד בין כמה מודלים הושלם', {
        state: 'success',
        provider: mergeProviderId,
        model: getModelNameForProvider(mergeProviderId, cfg, taggedRouting.providerModels?.[mergeProviderId] || ''),
        agentLabel: mergeProviderLabel,
        responseCount: collectedResponses.length,
        outputChars: normalizedMergedReply.text.length,
        outputPreview: trimLogText(normalizedMergedReply.text),
      });

      return rememberSuccessfulReply(normalizedMergedReply);
    } catch (mergeError) {
      logEvent('multi-model-merge-fallback', 'איחוד התשובות נכשל, מחזיר את התשובה הטובה הראשונה', {
        state: 'error',
        provider: mergeProviderId,
        errorMessage: mergeError?.message || 'שגיאה לא ידועה',
      });
      return rememberSuccessfulReply(collectedResponses[0].reply);
    }
  }

  const runProviderRequest = async (signal) => {
    switch (activeProvider) {
      case 'gemini': {
        const key = cfg.gemini.key || localStorage.getItem("GEMINI_API_KEY") || "";
        if (!key) throw new Error('מפתח Gemini לא הוגדר — עבור להגדרות AI (תפריט קובץ)');
        const genAI = new GoogleGenerativeAI(key);
        const geminiModelConfig = providerSupportsGeminiInternetBackedSourceTools
          ? { model: resolvedModel, tools: [{ googleSearch: {} }] }
          : { model: resolvedModel };
        const mdl = genAI.getGenerativeModel(geminiModelConfig);
        const result = await mdl.generateContent(`${sysPrompt}\n\nמשתמש: ${cleanUserPrompt}`);
        return finalizeProviderTextResponse({
          text: result.response.text(),
          completion: {
            finishReason: result.response?.candidates?.[0]?.finishReason || '',
            allowedUrls: extractGeminiGroundingUrlsFromResponse(result.response),
          },
        }, activeProvider, preserveProviderCompletionMetadata);
      }
      case 'scholar': {
        if (!cfg.scholar.key) throw new Error('מפתח Google Scholar לא הוגדר — עבור להגדרות AI (תפריט קובץ)');
        const sources = await fetchScholarVerifiedSources({ query: cleanUserPrompt, apiKey: cfg.scholar.key, signal, limit: 10 });
        const text = sources.length
          ? [
              `הנה המאמרים שאותרו ישירות ב-Google Scholar עבור: ${cleanUserPrompt}`,
              ...sources.map((source, index) => formatVerifiedSourceItem(source, index)),
              'לא הוספתי מקורות שלא הופיעו בתוצאות האחזור.',
            ].join('\n\n')
          : 'לא נמצאו אינדיקציות או מאמרים רלוונטיים ב-Google Scholar.';
        return finalizeProviderTextResponse({
          text,
          completion: {
            finishReason: sources.length ? 'stop' : 'no_results',
            model: resolvedModel,
            allowedUrls: sources.map((source) => source.url).filter(Boolean),
          },
        }, activeProvider, preserveProviderCompletionMetadata);
      }
      case 'openai': {
        if (!cfg.openai.key) throw new Error('מפתח OpenAI לא הוגדר — עבור להגדרות AI (תפריט קובץ)');
        if (providerSupportsNativeWebSearch) {
          // route 1: כשצריך אינטרנט — Responses API עם web_search כדי שהמודל יחפש ויצטט בעצמו.
          return callOpenAIResponsesWithWebSearch(cfg.openai.key, resolvedModel, sysPrompt, cleanUserPrompt, signal, {
            includeCompletionMetadata: preserveProviderCompletionMetadata,
          });
        }
        return callOpenAICompatible('https://api.openai.com/v1', cfg.openai.key, resolvedModel, [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: cleanUserPrompt },
        ], signal, { includeCompletionMetadata: preserveProviderCompletionMetadata });
      }
      case 'claude': {
        if (!cfg.claude.key) throw new Error('מפתח Claude לא הוגדר — עבור להגדרות AI (תפריט קובץ)');
        return callClaudeApi(cfg.claude.key, resolvedModel, sysPrompt, cleanUserPrompt, signal, {
          includeCompletionMetadata: preserveProviderCompletionMetadata,
          enableWebSearch: providerSupportsNativeWebSearch,
        });
      }
      case 'groq': {
        if (!cfg.groq.key) throw new Error('מפתח Groq לא הוגדר — עבור להגדרות AI (תפריט קובץ)');
        return callOpenAICompatible('https://api.groq.com/openai/v1', cfg.groq.key, resolvedModel, [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: cleanUserPrompt },
        ], signal, { includeCompletionMetadata: preserveProviderCompletionMetadata });
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
        ], signal, { includeCompletionMetadata: preserveProviderCompletionMetadata });
      }
      case 'perplexity': {
        if (!cfg.perplexity.key) throw new Error('מפתח Perplexity לא הוגדר — עבור להגדרות AI (תפריט קובץ)');
        const perplexityRequestBodyExtras = verifiedSourceFollowOnLocked
          ? { disable_search: true }
          : (internetBackedSourceWorkRequired ? { disable_search: false } : null);
        return callOpenAICompatible('https://api.perplexity.ai', cfg.perplexity.key, resolvedModel, [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: cleanUserPrompt },
        ], signal, {
          includeCompletionMetadata: preserveProviderCompletionMetadata,
          ...(perplexityRequestBodyExtras ? { requestBodyExtras: perplexityRequestBodyExtras } : {}),
        });
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
        ], signal, { includeCompletionMetadata: preserveProviderCompletionMetadata });
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
      const normalizedResult = normalizeProviderTextResponse(result, activeProvider);
      if (normalizedResult && typeof normalizedResult === 'object' && !Array.isArray(normalizedResult)) {
        normalizedResult.completion = {
          ...(normalizedResult.completion && typeof normalizedResult.completion === 'object' ? normalizedResult.completion : {}),
          provider: normalizedResult.completion?.provider || activeProvider,
          model: normalizedResult.completion?.model || resolvedModel,
        };
      }
      logEvent('attempt-success', 'התקבלה תשובה מהמנוע', {
        state: 'success',
        attempt: attempt + 1,
        responseChars: normalizedResult.text.length,
        responsePreview: trimLogText(normalizedResult.text),
        completionReason: normalizedResult.completion?.reason || '',
        completionFinishReason: normalizedResult.completion?.finishReason || '',
        completionStopReason: normalizedResult.completion?.stopReason || '',
      });
      emitStatus(onStatus, { state: 'success', progress: 100, runId, provider: activeProvider, model: resolvedModel, agentLabel, attempt: attempt + 1, message: 'הושלם' });
      return rememberSuccessfulReply(normalizedResult);
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
        const fallbackModelOverride = String(taggedRouting.providerModels?.[fallbackProvider] || '').trim();
        const fallbackModel = getModelNameForProvider(fallbackProvider, cfg, fallbackModelOverride);
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
          modelOverride: fallbackModelOverride,
          skipAutomation: true,
          shouldPersistMemory: false,
          disableFallback: true,
          runId,
          agentLabel,
        });
        const normalizedFallbackReply = normalizeProviderTextResponse(fallbackText, fallbackProvider);
        const fallbackResponseModel = normalizedFallbackReply.completion?.model || fallbackModel;

        logEvent('provider-fallback-success', `${fallbackProvider} החזיר תשובת גיבוי`, {
          state: 'success',
          provider: fallbackProvider,
          model: fallbackResponseModel,
          fallbackProvider,
          responseChars: normalizedFallbackReply.text.length,
          completionReason: normalizedFallbackReply.completion?.reason || '',
        });
        emitStatus(onStatus, {
          state: 'success',
          progress: 100,
          runId,
          provider: fallbackProvider,
          model: fallbackResponseModel,
          agentLabel,
          message: `הושלם (גיבוי: ${fallbackProvider})`,
        });
        return rememberSuccessfulReply(normalizedFallbackReply);
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

  if (activeProvider === 'gemini' && isTransientGeminiOverloadError(lastError)) {
    throw buildGeminiTransientOverloadError(resolvedModel);
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

// מחזיר את הספק/המודל הייעודיים לסוכן sidebar לפי הגדרות המשתמש (תפקידי הסרגל).
// כך גם מסלול ה-inline (BubbleMenu) מכבד את בחירת הספק/המודל לכל סוכן, כמו מסלול ה-chat.
// נופל בחזרה לספק הגלובלי כאשר forceGlobalProvider פעיל, אין בחירה, או הספק לא מוגדר.
const resolveSidebarAgentRoute = (agentId = '') => {
  const base = AGENTS_CONFIG[agentId] || {};
  let settings;
  try {
    settings = getAssistantBehavior().sidebarModeSettings;
  } catch {
    settings = null;
  }
  if (settings?.forceGlobalProvider === true) return {};
  const mode = Array.isArray(settings?.modes)
    ? settings.modes.find((item) => item?.id === agentId)
    : null;
  const providerId = String(
    (mode ? mode.providerId : (base.sidebarSelection?.providerId || base.route)) || '',
  ).trim();
  if (!providerId) return {};
  const cfg = getProviderConfig();
  if (!isProviderConfiguredForUse(providerId, cfg)) return {};
  const rawModel = String((mode ? mode.model : base.sidebarSelection?.model) || '').trim();
  const model = rawModel ? normalizeProviderModelName(providerId, rawModel) : '';
  return {
    providerOverride: providerId,
    preferredProviders: [providerId],
    ...(model ? { modelOverride: model } : {}),
  };
};

export const callAiAgent = async (agentId, selectedText, context = "") => {
  const agentConf = AGENTS_CONFIG[agentId];
  if (!agentConf) throw new Error("Invalid agent ID");
  const fullPrompt = buildPrompt(agentConf, selectedText, context);
  // משתמש בספק/מודל הייעודיים לסוכן (אם נבחרו), אחרת במנוע הפעיל הגלובלי.
  const baseOptions = {
    skipAutomation: true,
    skipMultiModel: true,
    strictFormatting: true,
    agentId,
    agentLabel: agentConf.label || agentId,
    ...resolveSidebarAgentRoute(agentId),
  };
  const firstPass = await chatWithActiveProvider(fullPrompt, context, '', baseOptions);

  // האנשה: סוגרים לולאה יריבה מול הגלאי המקומי — צור → נקד → תקן ממוקד → חזור,
  // עד שהציון יורד מתחת ליעד שהמשתמש קבע (פר-קריאה דרך getHumanizerPreferences).
  if (agentId === 'humanize') {
    const prefs = getHumanizerPreferences();
    if (prefs.enabled && prefs.maxPasses > 0 && String(firstPass || '').trim()) {
      try {
        const loop = await runHumanizerLoop({
          text: firstPass,
          context,
          target: prefs.target,
          maxPasses: prefs.maxPasses,
          profile: getPersonalStyleProfile(),
          invokeModel: (prompt, ctx) => chatWithActiveProvider(prompt, ctx, STEALTH_HUMANIZE_GUIDE, baseOptions),
        });
        if (loop?.text) return loop.text;
      } catch {
        // כשל בלולאה — מחזירים את הפלט הראשון.
      }
    }
  }
  return firstPass;
};

const AI_EDIT_ALLOWED_INLINE_TAGS = new Set(['strong', 'b', 'em', 'i', 'u', 'span', 's', 'mark', 'sub', 'sup', 'a', 'code']);
const AI_EDIT_ALLOWED_BLOCK_TAGS = new Set(['p', 'div', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote']);
const AI_EDIT_ALLOWED_TAGS = new Set([...AI_EDIT_ALLOWED_INLINE_TAGS, ...AI_EDIT_ALLOWED_BLOCK_TAGS]);
const AI_EDIT_BLOCKED_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'link', 'meta', 'base', 'form', 'input', 'button', 'textarea', 'select', 'option']);
const AI_EDIT_SINGLE_REGION_ERROR = 'מצב העריכה במסמך תומך כרגע רק בהחלפת מקטע רציף אחד. בקש מהמודל להחזיר ניסוח בפסקה אחת בלי רשימות או בלוקים מרובים ונסה שוב.';
const AI_EDIT_STRUCTURED_MULTILINE_LINE_PATTERN = /^(?:(?:[-*+]|\u2022|[\dA-Za-z\u0590-\u05FF]+[.)])\s+|#{1,6}\s+|>\s+|\[[ xX]\]\s+|[^.!?\n]{1,80}:)$/u;
const AI_EDIT_SINGLE_CODE_FENCE_WRAPPER_PATTERN = /^```[^\n`]*\r?\n([\s\S]*?)\r?\n```\s*$/;

const stripAiReplacementCodeFence = (value = '') => {
  const trimmed = String(value || '').trim();
  if (!trimmed.startsWith('```')) return trimmed;
  const match = trimmed.match(AI_EDIT_SINGLE_CODE_FENCE_WRAPPER_PATTERN);
  return match ? String(match[1] || '').trim() : trimmed;
};

const escapeAiSuggestionHtml = (value = '') => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const sanitizeAiSuggestionHref = (value = '') => {
  const href = String(value || '').trim();
  if (!href) return '';
  if (/^(?:javascript|data|vbscript):/i.test(href)) return '';
  return href;
};

const buildAiSuggestionHtmlFromText = (value = '') => {
  const normalized = String(value || '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return '';
  const paragraphs = normalized
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (!paragraphs.length) return '';
  return paragraphs
    .map((paragraph) => `<p>${escapeAiSuggestionHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
};

const sanitizeAiSuggestionHtml = (value = '', { allowBlockElements = true } = {}) => {
  if (typeof DOMParser === 'undefined') {
    return { ok: false, multiBlock: true, value: String(value || '').trim() };
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<div>${String(value || '')}</div>`, 'text/html');
  const container = parsed.body.firstElementChild;
  if (!container) {
    return { ok: false, empty: true, value: '' };
  }

  const unwrapElement = (element) => {
    while (element.firstChild) {
      element.parentNode?.insertBefore(element.firstChild, element);
    }
    element.remove();
  };

  const sanitizeElement = (element) => {
    Array.from(element.children).forEach((child) => sanitizeElement(child));

    const tagName = element.tagName.toLowerCase();
    if (AI_EDIT_BLOCKED_TAGS.has(tagName)) {
      element.remove();
      return;
    }

    if (!AI_EDIT_ALLOWED_TAGS.has(tagName)) {
      unwrapElement(element);
      return;
    }

    Array.from(element.attributes).forEach((attr) => {
      const attrName = attr.name.toLowerCase();
      if (tagName === 'a' && ['href', 'target', 'rel'].includes(attrName)) return;
      element.removeAttribute(attr.name);
    });

    if (tagName === 'a') {
      const href = sanitizeAiSuggestionHref(element.getAttribute('href'));
      if (href) {
        element.setAttribute('href', href);
        element.setAttribute('rel', 'noopener noreferrer');
        if (element.getAttribute('target') === '_blank') {
          element.setAttribute('target', '_blank');
        } else {
          element.removeAttribute('target');
        }
      } else {
        element.removeAttribute('href');
        element.removeAttribute('target');
        element.removeAttribute('rel');
      }
    }
  };

  Array.from(container.children).forEach((child) => sanitizeElement(child));

  const html = container.innerHTML.trim();
  const textContent = String(container.textContent || '').replace(/\u00A0/g, ' ').trim();
  if (!textContent) {
    return { ok: false, empty: true, value: '' };
  }

  const hasBlockElements = Array.from(container.querySelectorAll('*'))
    .some((element) => AI_EDIT_ALLOWED_BLOCK_TAGS.has(element.tagName.toLowerCase()));

  if (!allowBlockElements && hasBlockElements) {
    return { ok: false, multiBlock: true, value: html || String(value || '').trim() };
  }

  return { ok: true, value: html };
};

const createAiSuggestionId = () => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `ai-suggestion-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const prepareAiSuggestionReplacement = (replacementText, { enforceSingleRegion = false } = {}) => {
  const stripped = stripAiReplacementCodeFence(replacementText);
  if (!stripped) {
    return { ok: false, empty: true, value: '' };
  }

  const looksLikeHtml = /<\/?[a-z][^>]*>/i.test(stripped);
  if (!looksLikeHtml) {
    const normalized = stripped.replace(/\r\n?/g, '\n').trim();
    if (!normalized) {
      return { ok: false, empty: true, value: '' };
    }
    const nonEmptyLines = normalized
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (enforceSingleRegion) {
      if (/\n\s*\n/.test(normalized)) {
        return { ok: false, multiBlock: true, value: normalized };
      }
      if (
        nonEmptyLines.length > 1 &&
        nonEmptyLines.some((line) => AI_EDIT_STRUCTURED_MULTILINE_LINE_PATTERN.test(line))
      ) {
        return { ok: false, multiBlock: true, value: normalized };
      }
      return {
        ok: true,
        value: normalized
          .replace(/[ \t]*\n[ \t]*/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim(),
      };
    }

    if (!/\n/.test(normalized)) {
      return {
        ok: true,
        value: normalized
          .replace(/[ \t]*\n[ \t]*/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim(),
      };
    }

    const html = buildAiSuggestionHtmlFromText(normalized);
    const sanitizedHtml = sanitizeAiSuggestionHtml(html, { allowBlockElements: true });
    if (!sanitizedHtml.ok) {
      return sanitizedHtml.empty
        ? { ok: false, empty: true, value: '' }
        : { ok: false, multiBlock: true, value: normalized };
    }

    return { ok: true, value: sanitizedHtml.value };
  }

  return sanitizeAiSuggestionHtml(stripped, { allowBlockElements: !enforceSingleRegion });
};

const serializeAiSuggestionOriginalHtml = (editor, from, to) => {
  const serializer = DOMSerializer.fromSchema(editor.schema);
  const fragment = serializer.serializeFragment(editor.state.doc.slice(from, to).content);
  const tempDiv = document.createElement('div');
  tempDiv.appendChild(fragment);
  return tempDiv.innerHTML;
};

const parseAiSuggestionReplacementSlice = (editor, clean = '') => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = clean;
  const slice = ProseMirrorDOMParser.fromSchema(editor.schema).parseSlice(tempDiv);
  return slice?.size ? slice : null;
};

const prepareAiSuggestionRangeTransaction = (editor, { from, to, replacementText, agentType = 'assistant-edit', enforceSingleRegion = false, targetId = '' } = {}) => {
  const safeFrom = Number(from);
  const safeTo = Number(to);
  if (!Number.isInteger(safeFrom) || !Number.isInteger(safeTo) || safeFrom >= safeTo) {
    throw new Error('Invalid AI edit target');
  }

  const selectedText = editor.state.doc.textBetween(safeFrom, safeTo, ' ');
  if (!selectedText.trim()) {
    throw new Error('AI edit target is empty');
  }

  const originalSlice = JSON.stringify(editor.state.doc.slice(safeFrom, safeTo).content.toJSON());
  const originalHtml = serializeAiSuggestionOriginalHtml(editor, safeFrom, safeTo);
  const preparedReplacement = prepareAiSuggestionReplacement(replacementText, { enforceSingleRegion });
  if (!preparedReplacement.ok) {
    if (preparedReplacement.empty) return null;
    if (enforceSingleRegion) {
      throw new Error(AI_EDIT_SINGLE_REGION_ERROR);
    }
    return null;
  }

  const clean = preparedReplacement.value;
  if (!clean) return null;

  const slice = parseAiSuggestionReplacementSlice(editor, clean);
  if (!slice) return null;

  const suggestionId = createAiSuggestionId();
  const replacementTo = safeFrom + slice.size;
  return {
    from: safeFrom,
    to: safeTo,
    replacementTo,
    text: clean,
    slice,
    suggestionId,
    targetId,
    markAttrs: {
      suggestionId,
      agentType,
      originalText: selectedText,
      originalSlice,
      originalHtml,
      replacementFrom: safeFrom,
      replacementTo,
    },
  };
};

export const applyAiSuggestionToRange = (editor, { from, to, replacementText, agentType = 'assistant-edit', enforceSingleRegion = false } = {}) => {
  if (!editor) throw new Error('Editor instance is required');

  const safeFrom = Number(from);
  const safeTo = Number(to);
  if (!Number.isInteger(safeFrom) || !Number.isInteger(safeTo) || safeFrom >= safeTo) {
    throw new Error('Invalid AI edit target');
  }

  const selectedText = editor.state.doc.textBetween(safeFrom, safeTo, ' ');
  if (!selectedText.trim()) {
    throw new Error('AI edit target is empty');
  }

  const originalSlice = JSON.stringify(editor.state.doc.slice(safeFrom, safeTo).content.toJSON());
  const serializer = DOMSerializer.fromSchema(editor.schema);
  const fragment = serializer.serializeFragment(editor.state.doc.slice(safeFrom, safeTo).content);
  const tempDiv = document.createElement('div');
  tempDiv.appendChild(fragment);
  const originalHtml = tempDiv.innerHTML;
  const preparedReplacement = prepareAiSuggestionReplacement(replacementText, { enforceSingleRegion });
  if (!preparedReplacement.ok) {
    if (preparedReplacement.empty) return null;
    if (enforceSingleRegion) {
      throw new Error(AI_EDIT_SINGLE_REGION_ERROR);
    }
    return null;
  }

  const clean = preparedReplacement.value;

  if (!clean) return null;

  const suggestionId = createAiSuggestionId();

  editor.chain().focus().setTextSelection({ from: safeFrom, to: safeTo }).deleteSelection().insertContent(clean).run();
  const insertedTo = editor.state.selection.to;
  editor.chain().focus()
    .setTextSelection({ from: safeFrom, to: insertedTo })
    .setMark('aiSuggestion', {
      suggestionId,
      agentType,
      originalText: selectedText,
      originalSlice,
      originalHtml,
      replacementFrom: safeFrom,
      replacementTo: insertedTo,
    })
    .run();

  return { from: safeFrom, to: insertedTo, text: clean, suggestionId };
};

export const applyAiSuggestionBatchToRanges = (editor, edits = [], { agentType = 'assistant-edit', enforceSingleRegion = false } = {}) => {
  if (!editor) throw new Error('Editor instance is required');
  const markType = editor.schema.marks.aiSuggestion;
  if (!markType) throw new Error('AI suggestion mark is not available');

  const sortedEdits = (Array.isArray(edits) ? edits : [])
    .map((entry) => ({
      from: entry?.from ?? entry?.target?.from,
      to: entry?.to ?? entry?.target?.to,
      replacementText: entry?.replacementText,
      targetId: entry?.targetId || entry?.target?.targetId || '',
    }))
    .sort((left, right) => {
      if (Number(right.from) !== Number(left.from)) return Number(right.from) - Number(left.from);
      return Number(right.to) - Number(left.to);
    });

  const prepared = sortedEdits.map((entry) => prepareAiSuggestionRangeTransaction(editor, {
    ...entry,
    agentType,
    enforceSingleRegion,
  }));

  if (prepared.some((entry) => !entry)) return null;

  let transaction = editor.state.tr;
  prepared.forEach((entry) => {
    transaction = transaction.replace(entry.from, entry.to, entry.slice);
    transaction = transaction.addMark(entry.from, entry.replacementTo, markType.create(entry.markAttrs));
  });

  if (!transaction.docChanged) return null;
  editor.view.focus();
  editor.view.dispatch(transaction.scrollIntoView());

  return prepared.map((entry) => ({
    from: entry.from,
    to: entry.replacementTo,
    text: entry.text,
    suggestionId: entry.suggestionId,
    targetId: entry.targetId,
  }));
};

export const applyInlineAi = async (editor, agentId) => {
  const { from, to, empty } = editor.state.selection;
  if (empty) return;
  const selectedText = editor.state.doc.textBetween(from, to, " ");
  if (!selectedText.trim()) return;
  const aiResultText = await callAiAgent(agentId, selectedText);
  if (!aiResultText) return;
  applyAiSuggestionToRange(editor, { from, to, replacementText: aiResultText, agentType: agentId });
};

export const chatWithRoleAgent = async (agent, userPrompt, documentContext = '', runtimeOptions = {}) => {
  if (!agent?.prompt) throw new Error('לסוכן התפקידי אין הנחיה שמורה');
  const cfg = getProviderConfig();
  const selectedProviders = getSelectedProviderIds(cfg);
  const runtimePreferredProviders = normalizeProviderIds(runtimeOptions.preferredProviders, '')
    .filter((providerId) => isProviderConfiguredForUse(providerId, cfg));
  const effectivePreferredProviders = runtimePreferredProviders.length ? runtimePreferredProviders : selectedProviders;
  const explicitProviderOverride = String(runtimeOptions.providerOverride || '').trim();
  const runtimeModelOverride = String(runtimeOptions.modelOverride || '').trim();
  const agentModelOverride = String(agent.model || '').trim();
  const requestedModelOverride = runtimeModelOverride || agentModelOverride;
  const strictProviderOverride = runtimeOptions.strictProviderOverride === true && Boolean(explicitProviderOverride);
  const providerOverride = strictProviderOverride
    ? explicitProviderOverride
    : chooseProviderForAgent(agent, cfg, effectivePreferredProviders);
  const modelOverride = providerOverride && requestedModelOverride && !isProviderModelChoiceCompatible(providerOverride, requestedModelOverride, cfg)
    ? ''
    : requestedModelOverride;
  const combinedAgentPrompt = [String(agent.prompt || '').trim(), String(runtimeOptions.extraSystemPrompt || '').trim()]
    .filter(Boolean)
    .join('\n\n');
  return chatWithActiveProvider(userPrompt, documentContext, combinedAgentPrompt, {
    providerOverride,
    strictProviderOverride,
    preferredProviders: effectivePreferredProviders,
    modelOverride,
    agentLabel: agent.name || 'סוכן תפקידי',
    agentName: agent.name || 'סוכן תפקידי',
    onStatus: runtimeOptions.onStatus,
    conversationHistory: runtimeOptions.conversationHistory,
    includeAppMemory: runtimeOptions.includeAppMemory,
    skillId: runtimeOptions.skillId || '',
    autoUseDefaultSkill: runtimeOptions.autoUseDefaultSkill !== false,
    editModeRequest: runtimeOptions.editModeRequest === true,
    allowEditModeRoutingOverride: runtimeOptions.allowEditModeRoutingOverride === true,
    editModeExplicitSkillInvocation: runtimeOptions.editModeExplicitSkillInvocation === true,
    preserveFullDocumentContext: runtimeOptions.preserveFullDocumentContext === true,
    documentFallbackHtml: runtimeOptions.documentFallbackHtml || '',
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

const CHEF_MATERIALS_CONTEXT_MAX_CHARS = 8000;

const truncateChefMaterialsContext = (value = '', maxChars = CHEF_MATERIALS_CONTEXT_MAX_CHARS) => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
};

const formatChefMaterialsSummary = (selectedMaterials = [], preparedMaterialsContext = '') => {
  const contextText = truncateChefMaterialsContext(preparedMaterialsContext);
  if (contextText) return contextText;
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
  const preparedMaterialsContext = String(params?.materialsContext || '').trim();
  const baseDraftText = String(params?.baseDraftText || '').trim().slice(0, 6000);

  if (responses.length >= maxQuestions) {
    return { shouldStop: true, question: '', options: [], placeholder: '', reason: 'max-questions-reached' };
  }

  const responsesText = responses.map((r, idx) => formatChefResponseLine(r, idx)).join('\n\n') || 'אין תשובות עדיין';
  const materialsText = formatChefMaterialsSummary(selectedMaterials, preparedMaterialsContext);
  const assignmentRequirements = extractAssignmentRequirements({
    userPrompt: documentPrompt,
    documentContext: materialsText,
    extraSystemPrompt: instructions,
  });
  const assignmentRequirementsText = formatAssignmentRequirementsForPrompt(assignmentRequirements);
  const prompt = [
    'אתה סוכן Chef שמכין שאלת המשך אחת בלבד לתהליך אפיון מסמך.',
    `שלב נוכחי: ${step} מתוך ${maxQuestions}.`,
    'החזר JSON בלבד במבנה:',
    '{"shouldStop":false,"question":"...","options":["..."],"placeholder":"...","reason":"..."}',
    'כללים:',
    '- השאלה חייבת להיות מותאמת לקונטקסט: פרומפט, תבנית, הנחיות וחומרי עזר.',
    '- לפני ניסוח השאלה, קרא את חומרי העזר כולל קטעי התוכן, הסק מהם עובדות, דרישות, מבנה, מושגים ודגשים.',
    '- שאל רק על פערים, סתירות או החלטות שלא מופיעים בחומרי העזר, בפרומפט או בתשובות הקודמות.',
    '- אם זוהו דרישות מטלה מובנות, אל תשאל עליהן שוב. שאל רק בחירות חסרות שהמשתמש צריך להחליט, למשל משבר/מקרה/קבוצה נבחרת.',
    baseDraftText ? '- צורפה טיוטת בסיס שהמשתמש כבר התחיל לכתוב. התייחס אליה כבסיס קיים שצריך להשלים/ללטש: שאל רק על השלמות, הרחבות, כיוונים או החלטות שחסרים בה. אל תשאל על מה שכבר כתוב ומוכרע בטיוטה.' : '',
    '- options: בין 3 ל-5 אפשרויות קצרות וברורות.',
    '- אם יש מספיק מידע לכתיבה מלאה, החזר shouldStop=true ללא שאלה.',
    '- אל תייצר שאלות כלליות מדי אם כבר יש תשובות בנושא.',
    '- אם כבר יש מטרה ברורה, קהל יעד, מבנה וטון בפרומפט או בתשובות קודמות — החזר shouldStop=true מיד. אל תשאל שאלות שוליות שלא מוסיפות מידע שאינו כבר ידוע.',
    '',
    `פרומפט יצירה: ${documentPrompt || 'לא הוזן פרומפט מפורש'}`,
    `תבנית נבחרת: ${templateId}`,
    `הנחיות משתמש: ${instructions || 'ללא הנחיות נוספות'}`,
    assignmentRequirementsText ? `דרישות מטלה מזוהות:\n${assignmentRequirementsText}` : '',
    baseDraftText ? `טיוטת בסיס קיימת (המשתמש כבר התחיל — יש להשלים/ללטש אותה, לא להתחיל מאפס):\n${baseDraftText}` : '',
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
שמור כל דרישה מספרית בדיוק כפי שנמסרה: מספר פריטים/כתבות, ציטוטים, מאמרים אקדמיים, מגבלת מילים, מספר תמות/תתי-תמות, עמודים או נספחים. אל תעגל, אל תקצר, ואל תשמיט מספרים.
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
  const materialsText = formatChefMaterialsSummary(options?.selectedMaterials || [], options?.materialsContext || '');
  const assignmentRequirements = extractAssignmentRequirements({
    userPrompt: documentPrompt,
    documentContext: materialsText,
    extraSystemPrompt: instructions,
  });
  const assignmentRequirementsText = formatAssignmentRequirementsForPrompt(assignmentRequirements);
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
    '- קרא קודם את קטעי התוכן של חומרי העזר והסק מהם מידע קיים; אל תדרוש מהמשתמש פרטים שכבר נמצאים בהם.',
    '- אם זוהו דרישות מטלה מובנות, התחשב בהן ואל תעצור אם חסרה בחירה מהותית כמו משבר/מקרה/קבוצה נבחרת.',
    '- המשך לשאול רק אם נשאר פער, סתירה או החלטה חשובה שאינה מופיעה בחומרי העזר, בפרומפט או בתשובות.',
    '',
    `פרומפט יצירה: ${documentPrompt || 'לא הוזן פרומפט מפורש'}`,
    `תבנית: ${templateId}`,
    `הנחיות: ${instructions || 'ללא הנחיות נוספות'}`,
    assignmentRequirementsText ? `דרישות מטלה מזוהות:\n${assignmentRequirementsText}` : '',
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

export const streamOpenAI_API = async (baseUrl, apiKey, model, messages, signal, options = {}) => {
  const url = baseUrl.replace(/\/$/, '') + '/chat/completions';
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const bodyStr = JSON.stringify({ model, messages, max_tokens: 4096, stream: true });
  
  const res = await fetch(url, {
    method: 'POST',
    headers,
    signal,
    body: bodyStr,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`API Error (${res.status}): ${txt.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullText = '';
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunkStr = decoder.decode(value, { stream: true });
    buffer += chunkStr;
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]' && line !== 'data: [DONE]\\r') {
        try {
          const data = JSON.parse(line.slice(6));
          const text = data.choices?.[0]?.delta?.content || '';
          if (text) {
            fullText += text;
            if (options.onChunk) {
              options.onChunk(fullText);
            }
          }
        } catch(e) {}
      }
    }
  }
  return fullText;
};

export const streamWithActiveProvider = async (userPrompt, documentContext = '', extraSystemPrompt = '', options = {}) => {
  const cfg = options.providerConfigOverride && typeof options.providerConfigOverride === 'object'
    ? normalizeProviderConfig(options.providerConfigOverride)
    : getProviderConfig();
  const taggedRouting = extractTaggedModelRouting(userPrompt);
  const cleanUserPrompt = taggedRouting.cleanText || String(userPrompt || '').trim();
  const strictProviderOverride = options.strictProviderOverride === true && Boolean(options.providerOverride);
  const taggedProviders = strictProviderOverride ? [] : normalizeProviderIds(taggedRouting.taggedProviders, '');
  const preferredProviders = strictProviderOverride ? [] : normalizeProviderIds(options.preferredProviders, '');
  const constrainedProviders = strictProviderOverride
    ? [options.providerOverride]
    : preferredProviders.length
      ? preferredProviders
      : taggedProviders;
  const selectedProviders = constrainedProviders.length
    ? constrainedProviders
    : strictProviderOverride
      ? [options.providerOverride]
      : getSelectedProviderIds(cfg, options.skipMultiModel === true);
      
  const configuredSelectedProviders = selectedProviders
    .filter((providerId) => isProviderConfiguredForUse(providerId, cfg));
  if (constrainedProviders.length && !configuredSelectedProviders.length) {
    throw new Error('אין ספק AI זמין בתוך ה-pool שנבחר.');
  }
  const taggedProviderInPool = taggedProviders.find((providerId) => configuredSelectedProviders.includes(providerId));
  let activeProvider = strictProviderOverride
    ? options.providerOverride
    : options.providerOverride
    || (preferredProviders.length
      ? taggedProviderInPool
      : (taggedProviders.length ? taggedProviderInPool : ''))
    || configuredSelectedProviders[0]
    || selectedProviders[0]
    || cfg.active;

  const omitPersonalStyleStructureHints = options.omitPersonalStyleStructureHints === true;
  // suppressPersonalStyle משמש לבדיקת השפעת הסגנון: מפיק פלט ללא הזרקת הפרופיל כדי להשוות מול פלט עם פרופיל.
  const personalStylePrompt = options.suppressPersonalStyle === true
    ? ''
    : buildPersonalStyleInstructions(getPersonalStyleProfile(), {
      omitStructuralHints: omitPersonalStyleStructureHints,
      requestText: [cleanUserPrompt, options.structureConstraintText].filter(Boolean).join('\n'),
      templateId: String(options.templateId || '').trim(),
      isAcademicTask: typeof options.isAcademicTask === 'boolean' ? options.isAcademicTask : undefined,
    });
  const sharedInstructions = getSharedAgentInstructions();
  const automation = getWorkspaceAutomation();
  const skipAutomationPrompt = options.skipAutomationPrompt === true || options.skipAutomation === true;
  const workspaceAutomationPrompt = buildWorkspaceAutomationInstructions({ disabled: skipAutomationPrompt });

  const taggedModelOverride = strictProviderOverride
    ? ''
    : taggedRouting.providerModels?.[activeProvider]
    || (preferredProviders.length ? '' : taggedRouting.taggedModel);
  const modelOverride = options.modelOverride || taggedModelOverride || '';
  const resolvedModel = getModelNameForProvider(activeProvider, cfg, modelOverride);

  const preserveFullDocumentContext = options.preserveFullDocumentContext === true;
  const promptDocumentContext = preserveFullDocumentContext
    ? String(documentContext || '')
    : buildPromptDocumentContext(documentContext);

  const sysPrompt = `אתה העוזר החכם של מעבד התמלילים "WordFlow AI".
ענה תמיד בעברית, קצר, ברור ומעשי.
הנח שהמשתמש נמצא באמצע כתיבה, ולכן גם שאלות קצרות כמו "נראה ארוך אה?", "יש מקור לזה?" או "תחדד לי" מתייחסות לפסקה או לטקסט שבהקשר המצורף.
אם מבקשים קיצור/הארכה/שכתוב — תן ישירות נוסח מוצע שאפשר להדביק.
אם המשתמש מבקש תוכן חדש שמיועד למסמך, כתוב רק את התוכן עצמו כדי שיהיה קל להוסיף למסמך.
עדיפות ראשונה: מה שהמשתמש ביקש מפורשות ומה שמופיע בחומרי העזר.
כשמחזירים מסמך מלא, טיוטה, או תוכן שמיועד במפורש להדבקה למסמך, השתמש ב-HTML מעוצב עם h1, h2, h3, p, ul, ol, strong, em לפי ההקשר.
כאשר צריך לבצע הפרדת עמודים, החזר בדיוק את קטע ה-HTML הבא בלבד בשורה נפרדת: <div data-type="page-break"></div>.${extraSystemPrompt ? `\n\nהנחיית תפקיד:\n${extraSystemPrompt}` : ''}${sharedInstructions ? `\n\nהנחיות משותפות לפרויקט:\n${sharedInstructions}` : ''}${workspaceAutomationPrompt ? `\n\nתיאום צוות AI:\n${workspaceAutomationPrompt}` : ''}${personalStylePrompt ? `\n\nהעדפות סגנון אישיות:\n${personalStylePrompt}` : ''}${promptDocumentContext ? `\n\nהקשר מהמסמך:\n${promptDocumentContext}` : ''}`;

  const messages = [
    { role: 'system', content: sysPrompt },
    { role: 'user', content: cleanUserPrompt },
  ];

  const signal = options.signal;

  switch (activeProvider) {
    case 'openai': {
      if (!cfg.openai.key) throw new Error('מפתח OpenAI לא הוגדר');
      return streamOpenAI_API('https://api.openai.com/v1', cfg.openai.key, resolvedModel, messages, signal, options);
    }
    case 'groq': {
      if (!cfg.groq.key) throw new Error('מפתח Groq לא הוגדר');
      return streamOpenAI_API('https://api.groq.com/openai/v1', cfg.groq.key, resolvedModel, messages, signal, options);
    }
    case 'perplexity': {
      if (!cfg.perplexity.key) throw new Error('מפתח Perplexity לא הוגדר');
      return streamOpenAI_API('https://api.perplexity.ai', cfg.perplexity.key, resolvedModel, messages, signal, options);
    }
    case 'ollama': {
      const ollamaUrl = cfg.ollama.baseUrl || 'http://localhost:11434/v1';
      return streamOpenAI_API(ollamaUrl, '', resolvedModel, messages, signal, options);
    }
    case 'custom': {
      const { baseUrl, key } = cfg.custom;
      if (!baseUrl) throw new Error('מנוע מותאם אישית לא מוגדר במלואו');
      return streamOpenAI_API(baseUrl, key, resolvedModel, messages, signal, options);
    }
    // gemini and claude streaming would need different mapping, or could reuse if we add openai compat layer for them.
    // Assuming gemini stream handles elsewhere or falls back to chatWithActiveProvider if not supported
    default:
      throw new Error(`ספק ${activeProvider} אינו נתמך כרגע בסטרימינג.`);
  }
};


// ═══════════════════════════════════════
// בדיקת תקינות ספק — שולח הודעה קצרה ובודק תשובה
// ═══════════════════════════════════════
const PROVIDER_MODEL_OPTIONS = {
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro'],
  openai: ['gpt-4o', 'gpt-4.1', 'gpt-4o-mini'],
  claude: ['claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-opus-4-7'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
  perplexity: ['sonar-pro', 'sonar', 'sonar-reasoning-pro'],
  scholar: ['google_scholar'],
  ollama: ['llama3.2', 'qwen2.5', 'mistral'],
  custom: ['deepseek-chat', 'mistral-large-latest', 'openrouter/auto', 'grok-3-mini-beta', 'loaded-model'],
};

export const getProviderModelChoices = (providerId = '', cfg = null, extraModels = []) => {
  const safeProvider = String(providerId || '').trim();
  if (!safeProvider || !KNOWN_PROVIDER_IDS.includes(safeProvider)) return [];

  const safeCfg = cfg && typeof cfg === 'object' ? cfg : getProviderConfig();
  const configuredModel = normalizeProviderModelName(safeProvider, String(safeCfg?.[safeProvider]?.model || '').trim());
  const extra = (Array.isArray(extraModels) ? extraModels : [extraModels])
    .map((model) => normalizeProviderModelName(safeProvider, String(model || '').trim()))
    .filter(Boolean);
  const fallbacks = (PROVIDER_MODEL_OPTIONS[safeProvider] || [])
    .map((model) => normalizeProviderModelName(safeProvider, model))
    .filter(Boolean);

  return [...new Set([configuredModel, ...extra, ...fallbacks].filter(Boolean))];
};

const TEST_PROMPT = [{ role: 'user', content: 'אמור "אוקי" בלבד.' }];
const GEMINI_TEST_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_LIST_PAGE_SIZE = 1000;
const GEMINI_GENERATE_CONTENT_METHOD = 'generateContent';

const extractGeminiAvailableModels = (payload = {}) => [...new Set((Array.isArray(payload?.models) ? payload.models : [])
  .filter((entry) => Array.isArray(entry?.supportedGenerationMethods) && entry.supportedGenerationMethods.includes(GEMINI_GENERATE_CONTENT_METHOD))
  .map((entry) => String(entry?.name || '').trim().replace(/^models\//, ''))
  .filter(Boolean))];

const listGeminiAvailableModels = async (key, signal) => {
  const url = `${GEMINI_TEST_URL}?key=${encodeURIComponent(key)}&pageSize=${GEMINI_LIST_PAGE_SIZE}`;
  const desktopResult = await proxyDesktopHttpRequest({ url, method: 'GET', timeoutMs: 12000 }, signal);
  if (desktopResult) {
    const result = desktopResult;
    if (!result.ok) {
      throw new Error(`${result.status}: ${String(result.body || '').slice(0, 200)}`);
    }
    const data = JSON.parse(result.body || '{}');
    return extractGeminiAvailableModels(data);
  }

  const res = await fetch(url, {
    method: 'GET',
    signal,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return extractGeminiAvailableModels(data);
};

const pingGemini = async (key, model, signal) => {
  const cleanModel = normalizeProviderModelName('gemini', model);
  const url = `${GEMINI_TEST_URL}/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(key)}`;
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
  const url = 'https://api.anthropic.com/v1/messages';
  const headers = { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
  const bodyStr = JSON.stringify({ model, max_tokens: 16, messages: [{ role: 'user', content: 'אמור "אוקי" בלבד.' }] });

  const desktopResult = await proxyDesktopHttpRequest({ url, method: 'POST', headers, body: bodyStr, timeoutMs: 12000 }, signal);
  if (desktopResult) {
    const result = desktopResult;
    if (!result.ok) {
      throw new Error(`${result.status}: ${String(result.body || '').slice(0, 200)}`);
    }
    const data = JSON.parse(result.body);
    return data.content?.[0]?.text || 'ok';
  }

  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers,
    body: bodyStr,
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
  const bodyStr = JSON.stringify({ model, messages: TEST_PROMPT, max_tokens: 16, stream: false });

  const desktopResult = await proxyDesktopHttpRequest({ url, method: 'POST', headers, body: bodyStr, timeoutMs: 12000 }, signal);
  if (desktopResult) {
    const result = desktopResult;
    if (!result.ok) {
      throw new Error(`${result.status}: ${String(result.body || '').slice(0, 200)}`);
    }
    const data = JSON.parse(result.body);
    return data.choices?.[0]?.message?.content || 'ok';
  }

  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers,
    body: bodyStr,
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
 * עבור Gemini, אם המודל המבוקש לא זמין למפתח לפי models/list, נחזיר כשל מפורש.
 * מחזיר { ok, model, error, triedModels, availableModels?, requestedModel?, requestedModelAvailable? }
 */
export const testProviderConnection = async (providerId, providerConfig = {}) => {
  const cfg = getProviderConfig();
  const pCfg = { ...cfg[providerId], ...providerConfig };

  if (providerId === 'copyleaks') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      await getCopyleaksBearerToken(pCfg, { signal: controller.signal, forceRefresh: true });
      clearTimeout(timeout);
      return {
        ok: true,
        model: pCfg.sandbox ? 'sandbox' : 'writer-detector',
        reply: 'Bearer token מוכן',
        triedModels: ['login'],
        error: '',
        availableModels: [],
        requestedModel: '',
        requestedModelAvailable: null,
      };
    } catch (err) {
      clearTimeout(timeout);
      return {
        ok: false,
        model: '',
        reply: '',
        triedModels: ['login'],
        error: err?.name === 'AbortError' ? 'הבקשה פגה (timeout 12s)' : (err?.message || 'שגיאה לא ידועה'),
        availableModels: [],
        requestedModel: '',
        requestedModelAvailable: null,
      };
    }
  }

  const rawRequestedModel = String(pCfg.model || '').trim();
  const requestedModel = normalizeProviderModelName(providerId, rawRequestedModel);
  const modelChoiceConfig = {
    ...cfg,
    [providerId]: {
      ...(cfg?.[providerId] || {}),
      ...pCfg,
      model: requestedModel,
    },
  };
  let modelsToTry = providerId === 'ollama'
    ? [requestedModel || normalizeProviderModelName('ollama', DEFAULT_PROVIDER_CONFIG.ollama.model)]
    : providerId === 'custom'
      ? [requestedModel].filter(Boolean)
      : providerId === 'gemini'
        ? (requestedModel
          ? [requestedModel]
          : PROVIDER_MODEL_OPTIONS.gemini.slice(0, 3))
        : getProviderModelChoices(providerId, modelChoiceConfig, [requestedModel]);
  let availableModels = [];
  let requestedModelAvailable = null;

  if (providerId === 'gemini') {
    const key = String(pCfg.key || '').trim();
    if (!key) {
      return { ok: false, model: '', reply: '', triedModels: [], error: 'מפתח API חסר', availableModels, requestedModel, requestedModelAvailable };
    }

    const availabilityController = new AbortController();
    const availabilityTimeout = setTimeout(() => availabilityController.abort(), 12000);
    try {
      availableModels = await listGeminiAvailableModels(key, availabilityController.signal);
      const availableModelEntries = [...new Map(availableModels
        .map((model) => String(model || '').trim())
        .filter(Boolean)
        .map((raw) => [raw, { raw, normalized: normalizeProviderModelName('gemini', raw) }]))
        .values()];
      const availableModelEntriesByRaw = new Map(availableModelEntries.map((entry) => [entry.raw, entry]));
      const availableModelEntriesByNormalized = availableModelEntries.reduce((map, entry) => {
        if (entry.normalized && !map.has(entry.normalized)) map.set(entry.normalized, entry);
        return map;
      }, new Map());

      if (!availableModelEntries.length) {
        if (requestedModel) requestedModelAvailable = false;
        return {
          ok: false,
          model: '',
          reply: '',
          triedModels: requestedModel ? [requestedModel] : [],
          error: 'לא נמצאו מודלי Gemini זמינים עבור generateContent עם המפתח הזה',
          availableModels,
          requestedModel,
          requestedModelAvailable,
        };
      }

      const findAvailableGeminiEntry = (candidate = '') => {
        const cleanCandidate = String(candidate || '').trim();
        if (!cleanCandidate) return null;
        return availableModelEntriesByRaw.get(cleanCandidate)
          || availableModelEntriesByNormalized.get(cleanCandidate)
          || null;
      };

      if (requestedModel) {
        const matchedRequestedEntry = findAvailableGeminiEntry(rawRequestedModel) || findAvailableGeminiEntry(requestedModel);
        requestedModelAvailable = Boolean(matchedRequestedEntry);
        if (!requestedModelAvailable || !matchedRequestedEntry) {
          return {
            ok: false,
            model: '',
            reply: '',
            triedModels: [],
            error: `המודל שנבחר לא זמין למפתח Gemini הזה: ${requestedModel}`,
            availableModels,
            requestedModel,
            requestedModelAvailable,
          };
        }
        modelsToTry = [matchedRequestedEntry.raw];
      } else {
        const availableModelsToTry = PROVIDER_MODEL_OPTIONS.gemini
          .map((model) => findAvailableGeminiEntry(normalizeProviderModelName('gemini', model)))
          .filter((entry, index, entries) => entry && entries.findIndex((candidate) => candidate?.raw === entry.raw) === index)
          .slice(0, 3)
          .map((entry) => entry.raw);
        if (availableModelsToTry.length) {
          modelsToTry = availableModelsToTry;
        } else {
          modelsToTry = availableModelEntries.slice(0, 3).map((entry) => entry.raw);
        }
      }
    } catch {
      requestedModelAvailable = null;
    } finally {
      clearTimeout(availabilityTimeout);
    }
  }

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
      return { ok: true, model, reply: String(reply || '').slice(0, 80), triedModels, error: '', availableModels, requestedModel, requestedModelAvailable };
    } catch (err) {
      clearTimeout(timeout);
      lastError = err?.name === 'AbortError' ? 'הבקשה פגה (timeout 12s)' : (err?.message || 'שגיאה לא ידועה');
      // אם זה שגיאת אימות/מפתח/כתובת — אין טעם לנסות מודל אחר
      if (/401|403|מפתח|כתובת/.test(lastError)) break;
    }
  }

  return { ok: false, model: '', reply: '', triedModels, error: lastError, availableModels, requestedModel, requestedModelAvailable };
};

// יצוא הפונקציות החדשות לחלונית
if (typeof window !== 'undefined') {
  window.debugWorkspaceInfo = debugWorkspaceInfo;
  window.listAllWorkspaces = listAllWorkspaces;
  window.switchToWorkspace = switchToWorkspace;
}


