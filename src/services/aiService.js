import { GoogleGenerativeAI } from "@google/generative-ai";
import { DOMSerializer } from "@tiptap/pm/model";
import { AGENTS_CONFIG } from "../agentConfig";
import { DEFAULT_COPYLEAKS_CONFIG, getCopyleaksBearerToken, normalizeCopyleaksConfig } from "./copyleaksService";

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
  copyleaks:  { ...DEFAULT_COPYLEAKS_CONFIG },
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
  sidebarPreset: 'word-taskpane',
  autoRouteSourceRequests: true,
  strictSourceGrounding: true,
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
  workspaceBypassEnabled: false,
};

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
    prompt: 'פעל כבונה שלד אקדמי. בנה את מבנה המסמך בדיוק לפי הוראות המשתמש והמטלה. אם המשתמש ביקש מבוא או פרקים מסוימים - כלול אותם; אם לא ביקש, אל תוסיף מבנה קבוע על דעת עצמך. אם חסר מידע, הצע שלד זהיר במקום להמציא תוכן.',
    keywords: ['עבודה', 'אקדמי', 'מאמר', 'סמינר', 'סיכום', 'הצעת מחקר', 'שלד'],
  },
  {
    id: 'source-hunter',
    label: 'צייד מקורות אקדמיים',
    description: 'מכוון לאיתור מקורות, מילות חיפוש וחוקרים רלוונטיים.',
    usageHint: 'Google Scholar, חיפוש מקורות ומחקר',
    prompt: 'פעל כחוקר מקורות אקדמיים. החזר חבילת מחקר usable ולא רק כיווני חיפוש כלליים: כשאפשר, ספק לפחות 3 מקורות או מאמרים קונקרטיים. לכל מקור ציין כותרת, מחבר או גוף מפרסם, שנה אם ידועה, קישור או DOI אם זמין, ולמה הוא רלוונטי למשימה. אם לא נמצאו מספיק מקורות, כתוב במפורש כמה נמצאו ומה בדיוק חסר, ואל תסתפק רק במילות חיפוש או במסלולי חיפוש כלליים. אפשר להוסיף כיווני חיפוש כהשלמה בלבד. אל תמציא ציטוטים, מאמרים, DOI או פרטים שלא אומתו. אם המשתמש ביקש במפורש גם חומר חזותי, ציין גם אילו מקורות חזותיים צריך להשלים דרך סוכן מחקר חזותי ייעודי.',
    keywords: ['מקור', 'מקורות', 'גוגל סקולר', 'google scholar', 'מחקר', 'מאמרים', 'חוקרים', 'youtube', 'וידאו', 'visual', 'ויזואלי', 'צילום מסך', 'screenshot', 'diagram'],
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
      prompt: 'אתה מנהל העבודה הראשי. הבן את המטלה, חלק אותה לשלבים ברורים, ותאם בין כלל הסוכנים. אם AUTOPILOT פעיל מותר לך לשנות סדר, לקצר את המסלול או לדלג על סוכן שאינו נדרש. אם AUTOPILOT כבוי, שמור על הסדר שהוגדר וודא שכל הסוכנים משתתפים. הכוון כל שלב כך שהתוצר הסופי יעמוד בהנחיות המטלה בפועל. אם המשתמש ביקש חקר חזותי או שיש פער בחומרים חזותיים, נצל את הסוכן הייעודי researcher-visual במקום להעמיס את המשימה על שאר החוקרים.',
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

const KNOWN_PROVIDER_IDS = ['gemini', 'openai', 'claude', 'groq', 'perplexity', 'ollama', 'custom'];
const DIRECT_INTERNET_ACCESS_CAPABILITY = 'directInternetAccess';
const INTERNET_BACKED_SOURCE_CAPABILITY = 'internetBackedSourceRetrieval';
const EMPTY_PROVIDER_RUNTIME_CAPABILITIES = Object.freeze({
  [DIRECT_INTERNET_ACCESS_CAPABILITY]: false,
  [INTERNET_BACKED_SOURCE_CAPABILITY]: false,
});
const PROVIDER_RUNTIME_CAPABILITIES = Object.freeze({
  gemini: Object.freeze({
    [DIRECT_INTERNET_ACCESS_CAPABILITY]: true,
    [INTERNET_BACKED_SOURCE_CAPABILITY]: true,
  }),
  openai: Object.freeze({
    [DIRECT_INTERNET_ACCESS_CAPABILITY]: false,
    [INTERNET_BACKED_SOURCE_CAPABILITY]: false,
  }),
  claude: Object.freeze({
    [DIRECT_INTERNET_ACCESS_CAPABILITY]: false,
    [INTERNET_BACKED_SOURCE_CAPABILITY]: false,
  }),
  groq: Object.freeze({
    [DIRECT_INTERNET_ACCESS_CAPABILITY]: false,
    [INTERNET_BACKED_SOURCE_CAPABILITY]: false,
  }),
  perplexity: Object.freeze({
    [DIRECT_INTERNET_ACCESS_CAPABILITY]: true,
    [INTERNET_BACKED_SOURCE_CAPABILITY]: true,
  }),
  ollama: Object.freeze({
    [DIRECT_INTERNET_ACCESS_CAPABILITY]: false,
    [INTERNET_BACKED_SOURCE_CAPABILITY]: false,
  }),
  custom: Object.freeze({
    [DIRECT_INTERNET_ACCESS_CAPABILITY]: false,
    [INTERNET_BACKED_SOURCE_CAPABILITY]: false,
  }),
});
const getProviderRuntimeCapabilities = (providerId = '') => (
  PROVIDER_RUNTIME_CAPABILITIES[String(providerId || '').trim()] || EMPTY_PROVIDER_RUNTIME_CAPABILITIES
);
const providerHasRuntimeCapability = (providerId = '', capability = '') => Boolean(
  getProviderRuntimeCapabilities(providerId)[String(capability || '').trim()]
);
const getProviderIdsWithRuntimeCapability = (capability = '') => KNOWN_PROVIDER_IDS
  .filter((providerId) => providerHasRuntimeCapability(providerId, capability));
const isProviderWithDirectInternetAccess = (providerId = '') => providerHasRuntimeCapability(providerId, DIRECT_INTERNET_ACCESS_CAPABILITY);
const isProviderInternetBackedSourceCapable = (providerId = '') => providerHasRuntimeCapability(providerId, INTERNET_BACKED_SOURCE_CAPABILITY);
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
    const { skipKeys, includeKeys } = resolvePersistedAppSettingsSyncOptions(options);
    const snapshot = {};
    PERSISTED_APP_SETTINGS_KEYS.forEach((key) => {
      if (skipKeys.has(key) && !includeKeys.has(key)) return;
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
  const persistedProfile = {
    ...DEFAULT_PERSONAL_STYLE,
    ...normalizedProfile,
    last_updated: new Date().toISOString(),
  };
  localStorage.setItem('wordai_personal_style', JSON.stringify({
    ...persistedProfile,
  }));
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wordai-personal-style-updated', {
      detail: { profile: persistedProfile },
    }));
  }
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
  const workspaceBypassEnabled = baseAutomation.workspaceBypassEnabled === true;
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
  }
  return resolvedAutomation;
};

export const shouldUseWorkspaceAutomation = (automation = getWorkspaceAutomation()) => (
  automation?.enabled === true && automation?.autoDispatch !== false
);

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
    workspaceBypassEnabled: Boolean(enabled),
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
  const agents = getRoleAgents().filter((agent) => agent.enabled !== false);
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
      sharedGoal: 'להפיק עבודה מלאה ומבוססת מקורות עם הפרדה בין מחקר אקדמי למחקר משלים, התאמת סגנון אישי וביקורת מסכמת.',
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
      sharedGoal: 'להפיק עבודה קלה ומהירה יותר עם מסלול מחקר אקדמי חסכוני, כתיבה, התאמת סגנון אישי וביקורת מסכמת.',
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
    copyleaks:  { ...DEFAULT_PROVIDER_CONFIG.copyleaks,  ...(config?.copyleaks || {}) },
    toolLinks: getToolLinksConfig({ ...DEFAULT_PROVIDER_CONFIG, ...(config || {}) }),
    active: safeActive,
  };
  merged.claude.model = normalizeProviderModelName('claude', merged.claude.model || DEFAULT_PROVIDER_CONFIG.claude.model);
  merged.gemini.model = normalizeProviderModelName('gemini', merged.gemini.model || DEFAULT_PROVIDER_CONFIG.gemini.model);
  merged.perplexity.model = normalizeProviderModelName('perplexity', merged.perplexity.model || DEFAULT_PROVIDER_CONFIG.perplexity.model);
  merged.ollama.model = normalizeProviderModelName('ollama', merged.ollama.model || DEFAULT_PROVIDER_CONFIG.ollama.model);
  merged.custom.model = normalizeProviderModelName('custom', merged.custom.model || '');
  merged.copyleaks = normalizeCopyleaksConfig(merged.copyleaks);
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

export const getConfiguredProviderChoices = (cfg = null) => {
  const safeCfg = cfg && typeof cfg === 'object' ? cfg : getProviderConfig();
  const names = getProviderLabelMap(safeCfg);
  return getConfiguredProviderPool(safeCfg).map((providerId) => ({
    id: providerId,
    label: names[providerId] || providerId,
    isDefault: providerId === safeCfg.active,
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
const SOURCE_REQUEST_PATTERN = /(doi|scholar|peer[-\s]?reviewed|fact[\s-]?check|בדוק\s+עובדות|בדיקת\s+עובדות|מקור(?:ות)?\s+אקדמ(?:י(?:ים)?)?)/i;
const SOURCE_GROUNDING_PROVIDER_IDS = new Set(getProviderIdsWithRuntimeCapability(INTERNET_BACKED_SOURCE_CAPABILITY));
const VERIFIED_SOURCE_SHORT_CIRCUIT_SKILL_IDS = new Set(['source-hunter']);
const SOURCE_GROUNDING_URL_REGEX = /https?:\/\/[^\s<>()]+/gi;
const VERIFIED_SOURCE_RESULT_LIMIT = 5;
const GENERIC_SOURCE_QUERY_PATTERN = /^(?:יש\s+(?:לזה\s+)?(?:מקור(?:ות)?|קישור(?:ים)?|לינק(?:ים)?|doi)\??|מקור(?:ות)?\??|sources?\??|citations?\??|references?\??|links?\??|לינק(?:ים)?\??|קישור(?:ים)?\??)$/i;
const NON_SOURCE_REQUEST_PATTERN = /(source\s+code|קוד\s+מקור|reference\s+letter|recommendation\s+letter|מכתב\s+המלצה|תקן(?:י)?\s+(?:את\s+)?(?:ה-)?url|fix\s+(?:the\s+)?url|replace\s+(?:the\s+)?url|update\s+(?:the\s+)?url)/i;
const SOURCE_FOLLOW_UP_PATTERN = /^(?:עוד|תן\s+עוד|תביא\s+עוד|עוד\s+\d+|עוד\s+שניים|עוד\s+שלושה|כאלה|כזה|similar\s+ones|same\s+kind|more|more\s+sources|another\s+two|add\s+more|תוסיף\s+עוד)/i;
const SOURCE_EXPLICIT_FOLLOW_UP_PATTERN = /^(?:עוד(?:\s+\d+|\s+שניים|\s+שלושה)?\s+(?:מקורות?|מאמרים?|כתבות?|קישורים?|לינקים?|references?|sources?|citations?|links?)|תן\s+עוד\s+(?:מקורות?|מאמרים?|כתבות?|קישורים?|לינקים?|references?|sources?|citations?|links?)|תביא\s+עוד\s+(?:מקורות?|מאמרים?|כתבות?|קישורים?|לינקים?|references?|sources?|citations?|links?)|more\s+(?:sources?|references?|citations?|links?)|another\s+\d*\s*(?:sources?|references?|citations?|links?)|add\s+more\s+(?:sources?|references?|citations?|links?))/i;
const SOURCE_DISCOVERY_ACTION_PATTERN = /(חפש|חיפוש|מצא|תן(?:י)?|תביא|להביא|הבא|שלח|צריך|צריכה|צריכים|מבקש|מבקשת|אסוף|אתר|תאתר|הוסף|צרף|שלב|show|give|bring|need|find|send|collect|locate|provide|include|attach|add)/i;
const SOURCE_DISCOVERY_TARGET_PATTERN = /(לינק(?:ים)?|links?|קישור(?:ים)?|urls?|מאמר(?:ים)?(?:\s+אקדמ(?:י(?:ים)?)?)?|כתבה(?:ות)?|papers?|sources?|references?|citations?|journal(?:s)?(?:\s+articles?)?|מקור(?:ות)?)/i;
const DIRECT_SOURCE_DISCOVERY_PATTERN = /(יש\s+(?:לזה\s+)?(?:מקור(?:ות)?|doi|לינק(?:ים)?|link|קישור(?:ים)?|url)|מצא\s+מקור(?:ות)?|מצא\s+מאמר(?:ים)?|מצא\s+כתבה(?:ות)?|(?:תן|הבא|להביא)\s+(?:לי\s+)?(?:מקור(?:ות)?|מחקר(?:ים)?|מאמר(?:ים)?|כתבה(?:ות)?|קישור(?:ים)?|לינק(?:ים)?|links?)|need\s+(?:sources?|references?|citations?|links?)|find\s+(?:sources?|references?|citations?|links?)|bring(?:\s+me)?\s+(?:(?:an?\s+)?article(?:s)?|sources?|references?|citations?|links?))/i;
const SOURCE_TRANSFORM_REQUEST_PATTERN = /(סדר|ארגן|עצב|format|reformat|תקן|fix|שכתב|rewrite|שמור|keep|preserve|המר|convert|עדכן|update|ערוך|edit).*(?:ביבליוגרפ|reference(?:\s+list)?|citation(?:s)?|ציטוט(?:ים)?|references?)/i;
const FACT_CHECK_REQUEST_PATTERN = /(fact[\s-]?check|בדוק\s+עובדות|בדיקת\s+עובדות)/i;
const INTERNET_BACKED_SOURCE_AGENT_PATTERN = /^(?:source[-\s]?hunter|researcher-academic|researcher-general|researcher-visual|visual[-\s]?research|חוקר\s+מקורות|חוקר\s+אקדמי|חוקר\s+לא\s+אקדמי|חוקר\s+חזותי|מחקר\s+מקורות|חקר\s+חזותי)$/i;
const INTERNET_BACKED_SOURCE_DISCOVERY_PATTERN = /(fact[\s-]?check|בדוק\s+עובדות|בדיקת\s+עובדות|source\s+(?:verification|discovery|research)|verify(?:ing)?\s+(?:sources?|citations?|references?|links?|urls?|facts?)|check\s+(?:sources?|citations?|references?|links?|urls?|facts?)|cross[-\s]?check|אימות\s+מקורות|בדוק(?:י)?\s+(?:אם\s+)?(?:המקורות|הציטוטים|הקישורים|הלינקים)\s+(?:קיימים|נכונים|מאומתים)?|(?:מקורות?|ציטוט(?:ים)?|קישורים?|לינקים?).*(?:קיימ(?:ים|ות)|נכונ(?:ים|ות)|מאומת(?:ים|ות))|חפש(?:ו)?\s+(?:ברשת|באינטרנט)|חיפוש\s+(?:ברשת|באינטרנט)|חקור(?:\s+את\s+)?(?:הרשת|האינטרנט)|search(?:\s+the)?\s+(?:web|internet)|web\s+research|browse\s+(?:the\s+web|online)|look\s+up(?:\s+online)?|find\s+(?:online\s+)?(?:sources?|references?|citations?|links?|articles?|papers?|journals?)|locate\s+(?:sources?|references?|citations?|links?)|visual\s+research)/i;
const EXPLICIT_LOOKUP_OR_VERIFICATION_ACTION_PATTERN = /(חפש|חיפוש|מצא|תאתר|אתר|בדוק|בדיקה|חקור|research|search|find|locate|verify|check|cross[-\s]?check|look\s+up|lookup|browse)/i;
const INTERNET_LOOKUP_ACTION_PATTERN = /(חפש|חיפוש|מצא|תאתר|אתר|אסוף|בדוק|בדיקה|תן|תביא|הבא|search|find|locate|look\s+up|lookup|browse|check|verify|cross[-\s]?check|research)/i;
const INTERNET_LOOKUP_TARGET_PATTERN = /(web|internet|online|ברשת|באינטרנט|youtube|vimeo|screenshots?|walkthroughs?|demos?|videos?|וידאו|סרטו(?:ן|נים)|צילום(?:י)?\s+מסך)/i;
const SOURCE_REQUEST_WITH_DELIVERABLE_PATTERN = /((כתוב|נסח|draft|write|compose|generate|צור|בנה|הכן|prepare|summari[sz]e|סכם|analy[sz]e|נתח|rewrite|שכתב|ערוך|edit).*(סקיר|literature|review|פסקה|paragraph|section|פרק|essay|paper|עבודה|מאמר|מסמך|outline|מבנה|טיוטה|draft|מבוא|introduction|abstract|סיכום|מסקנה))|((סקיר(?:ת)?\s+ספרות|literature\s+review|essay|paper|עבודה|מאמר|מסמך).*(?:מקור|citation|reference|doi|scholar))/i;
const SOURCE_ONLY_DELIVERABLE_REQUEST_PATTERN = /(כתוב|נסח|draft|write|compose|generate|צור|בנה|create|prepare|סכם|summari[sz]e|נתח|analy[sz]e|rewrite|שכתב|ערוך|edit|fix|תקן|polish|humanize|expand|shorten|format|reformat|convert|המר|organize|ארגן|arrange|סדר|translate|תרגם|סקיר(?:ת)?\s+ספרות|literature\s+review|essay|paper|report|document|outline|draft|abstract|introduction|paragraph|section|פסקה|פרק|סיכום|מסמך|עבודה|מאמר|מבוא|טיוטה|מייל|email|letter|מכתב)/i;
const SOURCE_RETRIEVAL_FOLLOW_ON_ACTION_PATTERN = /(סכם|summari[sz]e|הסבר|explain|כתוב|write|נסח|draft|נתח|analy[sz]e)/i;
const SOURCE_RETRIEVAL_FOLLOW_ON_CONJUNCTION_PATTERN = /(?:\s+ו|\band\b)\s*(?:סכם|summari[sz]e|הסבר|explain|כתוב|write|נסח|draft|נתח|analy[sz]e)/i;
const SOURCE_RETRIEVAL_FOLLOW_ON_SEPARATOR_PATTERN = /(?:[,;:.]\s*|\b(?:then|and\s+then)\b\s*|(?:ואז|אחר\s+כך|לאחר\s+מכן)\s*)(?:סכם|summari[sz]e|הסבר|explain|כתוב|write|נסח|draft|נתח|analy[sz]e)/i;
const SOURCE_RETRIEVAL_FORMAT_PATTERN = /(?:בפורמט|format)\s+(?:apa|mla|chicago|harvard)/i;
const SOURCE_RETRIEVAL_PER_ITEM_SCOPE_PATTERN = /(כל\s+(?:אחד|מקור|מאמר)|each\s+(?:one|source|paper)|במשפט|בשתי\s+שורות|one\s+sentence|two\s+lines?)/i;
const NON_TOPICAL_SOURCE_QUERY_PATTERN = /^(?:hi|hello|hey|thanks?|thank\s+you|ok(?:ay)?|שלום|היי|תודה|אוק(?:יי)?|בסדר)\b/i;
const SOURCE_CITATION_REQUIREMENT_PATTERN = /(citation(?:s)?|references?(?:\s+list)?|doi|scholar|links?|urls?|bibliograph(?:y|ies)|לינק(?:ים)?|קישור(?:ים)?|רשימת\s+מקורות|מקורות\s+(?:אקדמ(?:י(?:ים)?)?|מאומתים?|ל(?:עבודה|מחקר|סקירה|מאמר|מסמך|ציטוט))|(?:עם|כולל(?:ת)?|שלב|הוסף)\s+(?:לפחות\s+)?(?:\d+\s+)?מקורות?|ביבליוגרפ(?:יה|י)|ציטוט(?:ים)?|(?:academic|scholarly|verified|real)\s+sources?|sources?(?!\s+of\b)\s+(?:for|to\s+cite|list|references?))/i;
const SOURCE_REFERENCE_NOUN_PATTERN = /(?:\bcitation(?:s)?\b|\breferences?(?:\s+list)?\b|\bsources?\b|\blinks?\b|\burls?\b|\bbibliograph(?:y|ies)\b|\bdoi\b|\bpapers?\b|\barticles?\b|\bjournals?(?:\s+articles?)?\b|\bpeer[-\s]?reviewed(?:\s+(?:papers?|articles?|journals?|studies?))?\b|\bliterature\s+review\b|לינק(?:ים)?|קישור(?:ים)?|רשימת\s+מקורות|מקורות?|ביבליוגרפ(?:יה|י)|ציטוט(?:ים)?|מאמר(?:ים)?|כתבה(?:ות)?|כתב(?:י)?\s+עת|סקיר(?:ת)?\s+ספרות)/i;
const PROVIDED_SOURCE_ENRICHMENT_COMPLETION_ACTION_PATTERN = /(השלם|השלימי|השלימו|להשלים|complete|fill\s+in|supply)/i;
const PROVIDED_SOURCE_ENRICHMENT_ADD_ACTION_PATTERN = /(הוסף|תוסיף|להוסיף|append|add)/i;
const PROVIDED_SOURCE_ENRICHMENT_MISSING_PATTERN = /(חסר(?:ים|ות)?|missing)/i;
const PROVIDED_SOURCE_ENRICHMENT_TARGET_PATTERN = /(?:doi|dois|links?|urls?|לינק(?:ים)?|קישור(?:ים)?)/i;
const STRONG_PROVIDED_SOURCE_MARKER_PATTERN = /(?:\balready\b|\bprovided\b|\bsupplied\b|\bgiven\b|\bgave(?:\s+you)?\b|\bcollected\b|\bgathered\b|\battached\b|\bincluded\b|\bfollowing\b|\bbelow\b|שכבר|סופק(?:ו|ה)?|שסופק(?:ו|ה)?|סיפק(?:תי|ת|תם|נו)|שסיפק(?:תי|ת|תם|נו)|נת(?:תי|ת|תם|נו)|שנת(?:תי|ת|תם|נו)|הובא(?:ו)?|שהובא(?:ו)?|נאספ(?:ו|ה)|שנאספ(?:ו|ה)|מצורפ(?:ים|ות|ת)?|שמצורפ(?:ים|ות|ת)?|להלן|למטה|שלמטה|בהמשך|שבהמשך)/i;
const WEAK_EXISTING_SOURCE_MARKER_PATTERN = /(?:\bexisting\b|קיים|קיימת|קיימים|קיימות)/i;
const HEBREW_TEXT_PATTERN = /[\u0590-\u05FF]/;
const DOI_PATTERN = /\b10\.\d{4,9}\/[\-._;()/:A-Z0-9]+\b/i;
const RECENT_VERIFIED_SOURCE_FOLLOW_UP_WINDOW_MS = 30 * 60 * 1000;
const VERIFIED_SOURCE_REPLY_PATTERN = /(NO_VERIFIED_SOURCES_FOUND|מקורות(?:\s+אקדמיים)?\s+מאומתים בלבד|verified\s+sources?)/i;

const PROVIDED_SOURCE_CLAUSE_BREAK_PATTERN = /[\r\n.!?;:]/;
const WEAK_SOURCE_CONNECTOR_TOKEN_PATTERN = /^(?:the|a|an|this|that|these|those|my|your|our|their|his|her|ה|של|שלי|שלך|שלו|שלה|שלנו|שלהם|שלהן)$/i;

const getPatternMatches = (text, pattern) => {
  const matches = [];
  const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  let match = globalPattern.exec(text);
  while (match) {
    matches.push({
      index: match.index,
      end: match.index + match[0].length,
    });
    if (match[0].length === 0) {
      globalPattern.lastIndex += 1;
    }
    match = globalPattern.exec(text);
  }
  return matches;
};

const hasNearbyPatternPair = (text, firstMatches, secondMatches, { maxGap, maxGapTokens, tokenPattern } = {}) => {
  const getGapDetails = (firstMatch, secondMatch) => {
    const [leftMatch, rightMatch] = firstMatch.index <= secondMatch.index
      ? [firstMatch, secondMatch]
      : [secondMatch, firstMatch];
    const gapText = text.slice(leftMatch.end, rightMatch.index);
    const gapTokens = gapText.match(/[A-Za-z0-9\u0590-\u05FF]+/g) || [];
    return {
      gapText,
      gapTokens,
    };
  };

  return firstMatches.some((firstMatch) => secondMatches.some((secondMatch) => {
    const { gapText, gapTokens } = getGapDetails(firstMatch, secondMatch);
    if (gapText.length > maxGap) return false;
    if (PROVIDED_SOURCE_CLAUSE_BREAK_PATTERN.test(gapText)) return false;
    if (typeof maxGapTokens === 'number' && gapTokens.length > maxGapTokens) return false;
    if (tokenPattern && gapTokens.some((token) => !tokenPattern.test(token))) return false;
    return true;
  }));
};

const hasProvidedSourceReferenceContext = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return false;
  const sourceMatches = getPatternMatches(text, SOURCE_REFERENCE_NOUN_PATTERN);
  if (!sourceMatches.length) return false;

  const strongMarkerMatches = getPatternMatches(text, STRONG_PROVIDED_SOURCE_MARKER_PATTERN);
  if (strongMarkerMatches.length && hasNearbyPatternPair(text, sourceMatches, strongMarkerMatches, { maxGap: 48, maxGapTokens: 6 })) {
    return true;
  }

  const weakMarkerMatches = getPatternMatches(text, WEAK_EXISTING_SOURCE_MARKER_PATTERN);
  if (!weakMarkerMatches.length) return false;

  return hasNearbyPatternPair(text, sourceMatches, weakMarkerMatches, {
    maxGap: 6,
    maxGapTokens: 1,
    tokenPattern: WEAK_SOURCE_CONNECTOR_TOKEN_PATTERN,
  });
};

const hasProvidedSourceEnrichmentLookupIntent = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return false;
  const hasCompletionAction = PROVIDED_SOURCE_ENRICHMENT_COMPLETION_ACTION_PATTERN.test(text);
  const hasMissingAddAction = PROVIDED_SOURCE_ENRICHMENT_ADD_ACTION_PATTERN.test(text)
    && PROVIDED_SOURCE_ENRICHMENT_MISSING_PATTERN.test(text);
  return hasProvidedSourceReferenceContext(text)
    && PROVIDED_SOURCE_ENRICHMENT_TARGET_PATTERN.test(text)
    && (hasCompletionAction || hasMissingAddAction);
};

const hasExplicitSourceLookupOrVerificationIntent = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return false;
  return hasProvidedSourceEnrichmentLookupIntent(text)
    || FACT_CHECK_REQUEST_PATTERN.test(text)
    || INTERNET_BACKED_SOURCE_DISCOVERY_PATTERN.test(text)
    || ((SOURCE_CITATION_REQUIREMENT_PATTERN.test(text) || SOURCE_DISCOVERY_TARGET_PATTERN.test(text) || INTERNET_LOOKUP_TARGET_PATTERN.test(text))
      && EXPLICIT_LOOKUP_OR_VERIFICATION_ACTION_PATTERN.test(text));
};

function hasSourceDiscoveryOrVerificationSignal(value = '') {
  const text = String(value || '').trim();
  if (!text) return false;
  if (hasProvidedSourceReferenceContext(text) && !hasExplicitSourceLookupOrVerificationIntent(text)) return false;
  return hasProvidedSourceEnrichmentLookupIntent(text)
    || INTERNET_BACKED_SOURCE_DISCOVERY_PATTERN.test(text)
    || FACT_CHECK_REQUEST_PATTERN.test(text)
    || DIRECT_SOURCE_DISCOVERY_PATTERN.test(text)
    || (SOURCE_DISCOVERY_ACTION_PATTERN.test(text) && SOURCE_DISCOVERY_TARGET_PATTERN.test(text))
    || (INTERNET_LOOKUP_ACTION_PATTERN.test(text) && INTERNET_LOOKUP_TARGET_PATTERN.test(text));
}

function isPureSourceTransformRequest(value = '') {
  const text = String(value || '').trim();
  return Boolean(text)
    && SOURCE_TRANSFORM_REQUEST_PATTERN.test(text)
    && !hasSourceDiscoveryOrVerificationSignal(text);
}

const hasSourceTransformRequirement = (value = '') => SOURCE_TRANSFORM_REQUEST_PATTERN.test(String(value || '').trim());

const isExplicitSourceRequest = (value = '') => {
  const text = String(value || '').trim();
  if (!text || NON_SOURCE_REQUEST_PATTERN.test(text)) return false;
  if (hasProvidedSourceReferenceContext(text) && !hasExplicitSourceLookupOrVerificationIntent(text)) return false;
  if (isPureSourceTransformRequest(text)) return false;
  return GENERIC_SOURCE_QUERY_PATTERN.test(text)
    || hasProvidedSourceEnrichmentLookupIntent(text)
    || DIRECT_SOURCE_DISCOVERY_PATTERN.test(text)
    || SOURCE_REQUEST_PATTERN.test(text)
    || (SOURCE_DISCOVERY_ACTION_PATTERN.test(text) && SOURCE_DISCOVERY_TARGET_PATTERN.test(text));
};

const hasDeliverableSourceRequirement = (value = '') => {
  const text = String(value || '').trim();
  if (!text || NON_SOURCE_REQUEST_PATTERN.test(text)) return false;
  if (hasProvidedSourceReferenceContext(text) && !hasExplicitSourceLookupOrVerificationIntent(text)) return false;
  if (isPureSourceTransformRequest(text)) return false;
  return SOURCE_REQUEST_WITH_DELIVERABLE_PATTERN.test(text)
    && (SOURCE_REQUEST_PATTERN.test(text)
      || DIRECT_SOURCE_DISCOVERY_PATTERN.test(text)
      || SOURCE_CITATION_REQUIREMENT_PATTERN.test(text));
};

const hasSourceRetrievalWithDownstreamWorkRequirement = (value = '') => {
  const text = String(value || '').trim();
  if (!text || NON_SOURCE_REQUEST_PATTERN.test(text)) return false;
  if (!isExplicitSourceRequest(text) && !SOURCE_EXPLICIT_FOLLOW_UP_PATTERN.test(text)) return false;
  if (SOURCE_REQUEST_WITH_DELIVERABLE_PATTERN.test(text) || hasSourceTransformRequirement(text)) return true;
  if (SOURCE_RETRIEVAL_FORMAT_PATTERN.test(text)) return true;
  if (SOURCE_RETRIEVAL_PER_ITEM_SCOPE_PATTERN.test(text)) return true;
  if (!SOURCE_RETRIEVAL_FOLLOW_ON_ACTION_PATTERN.test(text)) return false;
  return SOURCE_RETRIEVAL_FOLLOW_ON_CONJUNCTION_PATTERN.test(text)
    || SOURCE_RETRIEVAL_FOLLOW_ON_SEPARATOR_PATTERN.test(text);
};

const isPotentialVerifiedSourceFollowUp = (value = '') => {
  const text = String(value || '').trim();
  return Boolean(text) && (SOURCE_EXPLICIT_FOLLOW_UP_PATTERN.test(text) || SOURCE_FOLLOW_UP_PATTERN.test(text));
};

const hasVerifiedSourceFollowUpRequirement = (userPrompt = '') => {
  const normalizedUserPrompt = String(userPrompt || '').trim();
  if (!isPotentialVerifiedSourceFollowUp(normalizedUserPrompt)) return false;
  try {
    const workspaceId = String(getWorkspaceAutomation().activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
    return Boolean(getLastVerifiedSourceQuery({ workspaceId }) && hasRecentVerifiedSourceFollowUpContext({ workspaceId }));
  } catch {
    return false;
  }
};

const hasSkillBasedSourceGroundingRequirement = ({ userPrompt = '', extraSystemPrompt = '', skillId = '' } = {}) => {
  const normalizedSkillId = String(skillId || '').trim().toLowerCase();
  if (normalizedSkillId !== 'citation-weaver') return false;
  const combined = [userPrompt, extraSystemPrompt]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n');
  if (!combined) return false;
  if (isPureSourceTransformRequest(combined)) return false;
  if (hasProvidedSourceReferenceContext(combined) && !hasExplicitSourceLookupOrVerificationIntent(combined)) return false;
  return true;
};

const hasGroundingRelatedSourceWorkRequirement = ({ userPrompt = '', extraSystemPrompt = '', skillId = '', includeRecentFollowUp = true } = {}) => {
  const normalizedUserPrompt = String(userPrompt || '').trim();
  const combined = [normalizedUserPrompt, extraSystemPrompt]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n');
  if (combined) {
    if (isExplicitSourceRequest(combined)) return true;
    if (hasDeliverableSourceRequirement(combined)) return true;
  }
  if (hasSkillBasedSourceGroundingRequirement({
    userPrompt: normalizedUserPrompt,
    extraSystemPrompt,
    skillId,
  })) return true;
  if (!includeRecentFollowUp) return false;
  return hasVerifiedSourceFollowUpRequirement(normalizedUserPrompt);
};

function hasSourceHunterSourceOnlyShortcut({ userPrompt = '', extraSystemPrompt = '', skillId = '' } = {}) {
  const normalizedSkillId = String(skillId || '').trim().toLowerCase();
  if (!VERIFIED_SOURCE_SHORT_CIRCUIT_SKILL_IDS.has(normalizedSkillId)) return false;
  const normalizedPrompt = normalizeSourceSearchText(userPrompt);
  const combined = [normalizedPrompt, extraSystemPrompt]
    .map((value) => normalizeSourceSearchText(value))
    .filter(Boolean)
    .join('\n');
  if (!normalizedPrompt || NON_TOPICAL_SOURCE_QUERY_PATTERN.test(normalizedPrompt)) return false;
  if (SOURCE_FOLLOW_UP_PATTERN.test(normalizedPrompt)) return false;
  if (NON_SOURCE_REQUEST_PATTERN.test(combined)) return false;
  if (FACT_CHECK_REQUEST_PATTERN.test(combined)) return false;
  if (SOURCE_REQUEST_WITH_DELIVERABLE_PATTERN.test(combined)) return false;
  if (hasSourceTransformRequirement(combined)) return false;
  if (SOURCE_ONLY_DELIVERABLE_REQUEST_PATTERN.test(normalizedPrompt)) return false;
  const hasClearlySourceQueryLikePrompt = /^(?:(?:עוד\s+\d+|\d+\s+|another\s+\d+\s+)?(?:מקורות?|מאמרים?|כתבות?|קישורים?|לינקים?|sources?|references?|citations?|links?|papers?|journals?)\b|(?:doi|scholar)\b)/i.test(normalizedPrompt);
  return isExplicitSourceRequest(normalizedPrompt)
    || hasSourceDiscoveryOrVerificationSignal(normalizedPrompt)
    || hasClearlySourceQueryLikePrompt;
}

const hasExplicitSourceDiscoveryOrVerificationIntent = (...values) => {
  const combined = values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n');
  if (!combined) return false;
  if (NON_SOURCE_REQUEST_PATTERN.test(combined) && !FACT_CHECK_REQUEST_PATTERN.test(combined)) return false;
  if (isPureSourceTransformRequest(combined)) return false;
  return hasSourceDiscoveryOrVerificationSignal(combined);
};

const hasExplicitInternetLookupIntent = (...values) => {
  const combined = values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n');
  if (!combined) return false;
  if (NON_SOURCE_REQUEST_PATTERN.test(combined) && !FACT_CHECK_REQUEST_PATTERN.test(combined)) return false;
  return hasProvidedSourceEnrichmentLookupIntent(combined)
    || INTERNET_BACKED_SOURCE_DISCOVERY_PATTERN.test(combined)
    || (INTERNET_LOOKUP_ACTION_PATTERN.test(combined) && INTERNET_LOOKUP_TARGET_PATTERN.test(combined));
};

const hasInternetBackedSourceWorkSignal = (...values) => {
  const combined = values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n');
  if (!combined) return false;
  if (NON_SOURCE_REQUEST_PATTERN.test(combined) && !FACT_CHECK_REQUEST_PATTERN.test(combined)) return false;
  const hasExplicitLookupSignal = hasProvidedSourceEnrichmentLookupIntent(combined)
    || INTERNET_BACKED_SOURCE_DISCOVERY_PATTERN.test(combined)
    || ((SOURCE_CITATION_REQUIREMENT_PATTERN.test(combined) || SOURCE_DISCOVERY_TARGET_PATTERN.test(combined))
      && EXPLICIT_LOOKUP_OR_VERIFICATION_ACTION_PATTERN.test(combined))
    || (INTERNET_LOOKUP_TARGET_PATTERN.test(combined) && EXPLICIT_LOOKUP_OR_VERIFICATION_ACTION_PATTERN.test(combined));
  if ((isPureSourceTransformRequest(combined) || hasProvidedSourceReferenceContext(combined)) && !hasExplicitLookupSignal) return false;
  return hasExplicitLookupSignal;
};

const hasStageScopedInternetBackedSourceWorkSignal = (...values) => {
  const combined = values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n');
  if (!combined) return false;
  if (NON_SOURCE_REQUEST_PATTERN.test(combined) && !FACT_CHECK_REQUEST_PATTERN.test(combined)) return false;
  if (isPureSourceTransformRequest(combined)) return false;

  const hasProvidedSourceContext = hasProvidedSourceReferenceContext(combined);
  if (hasProvidedSourceContext) {
    return hasProvidedSourceEnrichmentLookupIntent(combined)
      || FACT_CHECK_REQUEST_PATTERN.test(combined)
      || DIRECT_SOURCE_DISCOVERY_PATTERN.test(combined)
      || (INTERNET_LOOKUP_ACTION_PATTERN.test(combined) && INTERNET_LOOKUP_TARGET_PATTERN.test(combined));
  }

  return FACT_CHECK_REQUEST_PATTERN.test(combined)
    || DIRECT_SOURCE_DISCOVERY_PATTERN.test(combined)
    || (SOURCE_DISCOVERY_ACTION_PATTERN.test(combined) && SOURCE_DISCOVERY_TARGET_PATTERN.test(combined))
    || (INTERNET_LOOKUP_ACTION_PATTERN.test(combined) && INTERNET_LOOKUP_TARGET_PATTERN.test(combined));
};

const isInherentInternetBackedSourceAgent = (agent = null) => {
  if (!agent || typeof agent !== 'object') return false;
  return [agent.id, agent.name]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .some((value) => INTERNET_BACKED_SOURCE_AGENT_PATTERN.test(value));
};

const requiresInternetBackedSourceWork = ({
  agent = null,
  skillId = '',
  stageGoal = '',
  stageInstruction = '',
  stageLabel = '',
  userPrompt = '',
  extraSystemPrompt = '',
  includeRequestSignals = true,
} = {}) => {
  const stageScopedSourceWorkRequired = hasStageScopedInternetBackedSourceWorkSignal(
    stageGoal,
    stageInstruction,
    stageLabel,
  );

  if (isInherentInternetBackedSourceAgent(agent)) return true;
  if (stageScopedSourceWorkRequired) return true;
  if (!includeRequestSignals) return false;
  if (hasGroundingRelatedSourceWorkRequirement({
    userPrompt,
    extraSystemPrompt,
    skillId,
  })) return true;
  return hasExplicitInternetLookupIntent(userPrompt, extraSystemPrompt);
};

const shouldUseStrictSourceGrounding = ({ userPrompt = '', documentContext = '', extraSystemPrompt = '', skillId = '' } = {}) => {
  return hasGroundingRelatedSourceWorkRequirement({
    userPrompt,
    extraSystemPrompt,
    skillId,
  });
};

const isSourceOnlyGroundingRequest = ({ userPrompt = '', extraSystemPrompt = '', skillId = '' } = {}) => {
  const normalizedPrompt = String(userPrompt || '').trim();
  const normalizedSkillId = String(skillId || '').trim();
  const combined = [normalizedPrompt, extraSystemPrompt]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n');

  const isSourceFollowUp = SOURCE_EXPLICIT_FOLLOW_UP_PATTERN.test(normalizedPrompt) || hasVerifiedSourceFollowUpRequirement(normalizedPrompt);
  const skillShortcutEligible = hasSourceHunterSourceOnlyShortcut({
    userPrompt: normalizedPrompt,
    extraSystemPrompt,
    skillId: normalizedSkillId,
  });
  if (!combined && !skillShortcutEligible) return false;
  if (FACT_CHECK_REQUEST_PATTERN.test(combined)) return false;
  if (hasSourceRetrievalWithDownstreamWorkRequirement(combined)) return false;
  if (SOURCE_REQUEST_WITH_DELIVERABLE_PATTERN.test(combined)) return false;
  if (hasSourceTransformRequirement(combined)) return false;
  if (!combined) return false;
  if (isExplicitSourceRequest(combined) || isSourceFollowUp) return true;
  return skillShortcutEligible;
};

const buildInternalRequestSourceClassification = (internetBackedSourceWorkRequired = false) => ({
  sourceGroundingRequired: internetBackedSourceWorkRequired,
  internetBackedSourceWorkRequired,
  sourceOnlyGroundingRequest: false,
  sourceHunterSourceOnlyShortcut: false,
});

const resolveRequestSourceClassification = ({ userPrompt = '', documentContext = '', extraSystemPrompt = '', skillId = '', overrides = null } = {}) => {
  const normalizedOverrides = overrides && typeof overrides === 'object' ? overrides : null;
  const sourceGroundingRequired = typeof normalizedOverrides?.sourceGroundingRequired === 'boolean'
    ? normalizedOverrides.sourceGroundingRequired
    : shouldUseStrictSourceGrounding({
      userPrompt,
      documentContext,
      extraSystemPrompt,
      skillId,
    });
  const internetBackedSourceWorkRequired = typeof normalizedOverrides?.internetBackedSourceWorkRequired === 'boolean'
    ? normalizedOverrides.internetBackedSourceWorkRequired
    : requiresInternetBackedSourceWork({
      userPrompt,
      extraSystemPrompt,
      skillId,
    });
  const sourceOnlyGroundingRequest = typeof normalizedOverrides?.sourceOnlyGroundingRequest === 'boolean'
    ? normalizedOverrides.sourceOnlyGroundingRequest
    : isSourceOnlyGroundingRequest({
      userPrompt,
      extraSystemPrompt,
      skillId,
    });
  const sourceHunterSourceOnlyShortcut = typeof normalizedOverrides?.sourceHunterSourceOnlyShortcut === 'boolean'
    ? normalizedOverrides.sourceHunterSourceOnlyShortcut
    : hasSourceHunterSourceOnlyShortcut({
      userPrompt,
      extraSystemPrompt,
      skillId,
    });

  return {
    sourceGroundingRequired,
    internetBackedSourceWorkRequired,
    sourceOnlyGroundingRequest,
    sourceHunterSourceOnlyShortcut,
  };
};

const isSourceGroundingProvider = (providerId = '') => SOURCE_GROUNDING_PROVIDER_IDS.has(String(providerId || '').trim());

const normalizeSourceGroundingUrl = (value = '') => String(value || '')
  .trim()
  .replace(/[)\],.;:'"]+$/g, '');

const mergeSourceGroundingUrls = (...groups) => {
  const merged = new Set();
  groups.forEach((group) => {
    if (!group) return;
    const values = group instanceof Set
      ? Array.from(group)
      : Array.isArray(group)
        ? group
        : [group];
    values.forEach((value) => {
      const normalizedUrl = normalizeSourceGroundingUrl(value);
      if (normalizedUrl) merged.add(normalizedUrl);
    });
  });
  return merged;
};

const extractUrlSetFromText = (value = '') => {
  const matches = String(value || '').match(SOURCE_GROUNDING_URL_REGEX) || [];
  return mergeSourceGroundingUrls(matches);
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

const sanitizeSourceGroundingResponse = (text = '', { enforce = false, providerSupportsGrounding = false, allowedUrls = new Set() } = {}) => {
  const normalizedText = String(text || '').trim();
  if (!normalizedText || !enforce) return normalizedText;
  const allowedUrlSet = mergeSourceGroundingUrls(allowedUrls);
  const responseUrls = normalizedText.match(SOURCE_GROUNDING_URL_REGEX) || [];
  if (!responseUrls.length) return normalizedText;
  const disallowedUrls = responseUrls.filter((url) => !allowedUrlSet.has(normalizeSourceGroundingUrl(url)));
  if (!disallowedUrls.length) return normalizedText;
  const disallowedUrlSet = new Set(disallowedUrls.map((url) => normalizeSourceGroundingUrl(url)).filter(Boolean));
  const strippedText = normalizedText
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, (match, label, url) => (
      disallowedUrlSet.has(normalizeSourceGroundingUrl(url)) ? '' : match
    ))
    .replace(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>[\s\S]*?<\/a>/gi, (match, url) => (
      disallowedUrlSet.has(normalizeSourceGroundingUrl(url)) ? '' : match
    ))
    .replace(SOURCE_GROUNDING_URL_REGEX, (url) => (disallowedUrlSet.has(normalizeSourceGroundingUrl(url)) ? '' : url))
    .replace(/^.*(?:קישור|לינק|url)\s*:\s*$/gim, '')
    .replace(/\[([^\]]+)\]\(\s*\)/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return strippedText ? `${strippedText}\n\n${SOURCE_GROUNDING_FAILURE_TOKEN}` : SOURCE_GROUNDING_FAILURE_TOKEN;
};

const stripHtmlTags = (value = '') => String(value || '').replace(/<[^>]+>/g, ' ');

const normalizeSourceSearchText = (value = '') => stripHtmlTags(value)
  .replace(/\s+/g, ' ')
  .trim();

const extractVerifiedSourceQuery = ({ userPrompt = '', documentContext = '', fallbackQuery = '', workspaceId = '' } = {}) => {
  const promptText = normalizeSourceSearchText(userPrompt);
  const contextText = normalizeSourceSearchText(documentContext);
  const fallbackText = normalizeSourceSearchText(fallbackQuery);
  const explicitSourceFollowUp = SOURCE_EXPLICIT_FOLLOW_UP_PATTERN.test(promptText);
  const genericSourceFollowUp = !explicitSourceFollowUp && SOURCE_FOLLOW_UP_PATTERN.test(promptText);
  const followUpTail = explicitSourceFollowUp
    ? normalizeSourceSearchText(promptText.replace(SOURCE_EXPLICIT_FOLLOW_UP_PATTERN, ''))
    : genericSourceFollowUp
      ? normalizeSourceSearchText(promptText.replace(SOURCE_FOLLOW_UP_PATTERN, ''))
      : '';
  if ((explicitSourceFollowUp || genericSourceFollowUp) && fallbackText && hasRecentVerifiedSourceFollowUpContext({ workspaceId }) && !followUpTail) {
    return String(fallbackText || '').slice(0, 420).trim();
  }
  const effectivePromptText = followUpTail || promptText;
  const promptNeedsContext = !effectivePromptText || effectivePromptText.length < 28 || GENERIC_SOURCE_QUERY_PATTERN.test(effectivePromptText);
  const merged = promptNeedsContext && contextText
    ? [effectivePromptText, contextText].filter(Boolean).join(' ')
    : effectivePromptText;
  return String(merged || '').slice(0, 420).trim();
};

const parseSourceYear = (value = '') => {
  const matches = String(value || '').match(/\b(?:19|20)\d{2}\b/g);
  return matches?.[matches.length - 1] || '';
};

const extractDoiFromSource = (value = '') => {
  const match = String(value || '').match(DOI_PATTERN);
  return match ? String(match[0] || '').replace(/[),.;]+$/, '') : '';
};

const buildVerifiedSourceKey = (item = {}) => {
  const url = String(item?.url || '').trim().toLowerCase();
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

const extractAllowedGroundingUrlsFromCompletion = (completion = {}) => {
  if (!completion || typeof completion !== 'object' || Array.isArray(completion)) return [];
  const searchResults = Array.isArray(completion.searchResults)
    ? completion.searchResults
    : Array.isArray(completion.search_results)
      ? completion.search_results
      : [];
  const citations = Array.isArray(completion.citations) ? completion.citations : [];
  const evidenceUrls = [
    ...searchResults
      .map(normalizePerplexityVerifiedSource)
      .filter(Boolean)
      .map((item) => item.url),
    ...citations
      .map((citation) => normalizePerplexityCitationSource(
        typeof citation === 'string' ? citation : (citation?.url || citation?.link || '')
      ))
      .filter(Boolean)
      .map((item) => item.url),
  ];
  return Array.from(mergeSourceGroundingUrls(completion.allowedUrls, evidenceUrls));
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
  return dedupeVerifiedSourceResults(results.map(normalizeScholarVerifiedSource).filter(Boolean)).slice(0, limit);
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
    return dedupeVerifiedSourceResults(searchResults).slice(0, limit);
  }
  const citations = Array.isArray(data?.citations)
    ? data.citations.map(normalizePerplexityCitationSource).filter(Boolean)
    : [];
  return dedupeVerifiedSourceResults(citations).slice(0, limit);
};

const buildVerifiedSourceFailureMessage = ({ query = '', providerAvailable = false, academic = false } = {}) => {
  const lines = [SOURCE_GROUNDING_FAILURE_TOKEN];
  lines.push(providerAvailable
    ? (academic
      ? 'לא נמצאו מקורות אקדמיים מאומתים לשאילתה, ולכן לא יצרתי מקורות על סמך המודל.'
      : 'לא נמצאו מקורות מאומתים לשאילתה, ולכן לא יצרתי מקורות על סמך המודל.')
    : (academic
      ? 'אין כרגע ספק אחזור מאומת למקורות אקדמיים. הגדר SerpAPI או Perplexity academic כדי לקבל מקורות אמיתיים.'
      : 'אין כרגע ספק אחזור מאומת למקורות. הגדר Perplexity או SerpAPI כדי לקבל תוצאות אמיתיות.'));
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

const buildVerifiedSourceReply = ({ query = '', results = [], providerId = '', academic = false } = {}) => {
  const providerLabel = providerId === 'serpapi-scholar'
    ? 'Google Scholar / SerpAPI'
    : 'Perplexity Search';
  return [
    `${academic ? 'מקורות אקדמיים' : 'מקורות'} מאומתים בלבד${query ? ` עבור: ${query}` : ''}`,
    `הוחזרו רק פריטים שאותרו ישירות דרך ${providerLabel}, בלי השלמה חופשית של המודל.`,
    ...results.map((item, index) => formatVerifiedSourceItem(item, index)),
    'לא הוספתי מקורות שלא הופיעו בתוצאות האחזור.',
  ].filter(Boolean).join('\n\n');
};

const resolveVerifiedSourceReply = async ({
  userPrompt = '',
  documentContext = '',
  extraSystemPrompt = '',
  skillId = '',
  isAcademicTask,
  cfg = DEFAULT_PROVIDER_CONFIG,
  timeoutMs = 0,
} = {}) => {
  const workspaceId = String(getWorkspaceAutomation().activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  const normalizedPrompt = normalizeSourceSearchText(userPrompt);
  const query = extractVerifiedSourceQuery({
    userPrompt,
    documentContext,
    fallbackQuery: getLastVerifiedSourceQuery({ workspaceId }),
    workspaceId,
  });
  const academicSignal = ACADEMIC_SOURCE_SIGNAL_PATTERN.test([userPrompt, extraSystemPrompt, documentContext].filter(Boolean).join('\n'));
  const academic = typeof isAcademicTask === 'boolean'
    ? isAcademicTask
    : academicSignal || (isPotentialVerifiedSourceFollowUp(normalizedPrompt)
      && hasRecentVerifiedSourceFollowUpContext({ workspaceId })
      && isRememberedVerifiedSourceAcademic({ workspaceId }));

  const attempts = [];
  if (academic && String(cfg?.scholar?.provider || '').trim() === 'serpapi' && String(cfg?.scholar?.key || '').trim()) {
    attempts.push({
      providerId: 'serpapi-scholar',
      model: 'google_scholar',
      run: (signal) => fetchScholarVerifiedSources({
        query,
        apiKey: cfg.scholar.key,
        signal,
        timeoutMs,
        limit: VERIFIED_SOURCE_RESULT_LIMIT,
      }),
    });
  }
  if (String(cfg?.perplexity?.key || '').trim()) {
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
        limit: VERIFIED_SOURCE_RESULT_LIMIT,
      }),
    });
  }

  if (!attempts.length || !query) {
    return {
      text: buildVerifiedSourceFailureMessage({ query, providerAvailable: false, academic }),
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
      const results = await withTimeout(attempt.run(abortController?.signal), timeoutMs, () => abortController?.abort());
      if (results.length) {
        return {
          text: buildVerifiedSourceReply({ query, results, providerId: attempt.providerId, academic }),
          providerId: attempt.providerId,
          model: attempt.model,
          urls: new Set(results.map((item) => String(item?.url || '').trim()).filter(Boolean)),
          query,
          workspaceId,
          academic,
        };
      }
    } catch (error) {
      lastError = error;
    }
  }

  return {
    text: buildVerifiedSourceFailureMessage({ query, providerAvailable: true, academic }),
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

const getConfiguredProvidersByRuntimeCapability = (cfg = null, capability = '', preferredProviders = []) => {
  const requestedCapability = String(capability || '').trim();
  if (!requestedCapability) return getConfiguredProviderPool(cfg, preferredProviders);
  return getConfiguredProviderPool(cfg, preferredProviders)
    .filter((providerId) => providerHasRuntimeCapability(providerId, requestedCapability));
};

const buildInternetBackedSourceProviderError = ({ subjectLabel = 'הבקשה הזו', requestedProviderId = '', configuredProviderIds = [], cfg = null } = {}) => {
  const safeCfg = cfg && typeof cfg === 'object' ? cfg : getProviderConfig();
  const providerLabelMap = getProviderLabelMap(safeCfg);
  const availableProviders = normalizeProviderIds(configuredProviderIds, '')
    .filter((providerId) => isProviderConfiguredForUse(providerId, safeCfg) && isProviderInternetBackedSourceCapable(providerId));
  const availableLabels = availableProviders
    .map((providerId) => providerLabelMap[providerId] || providerId)
    .join(', ');
  const requestedLabel = String(requestedProviderId || '').trim()
    ? (providerLabelMap[String(requestedProviderId || '').trim()] || String(requestedProviderId || '').trim())
    : '';

  if (availableLabels) {
    return `${subjectLabel} מחייבת חיפוש או אימות מקורות דרך provider עם גישה ישירה לאינטרנט. ${requestedLabel ? `${requestedLabel} לא מחווט לכך באפליקציה הזו. ` : ''}בחר provider מתאים: ${availableLabels}.`;
  }

  return `${subjectLabel} מחייבת חיפוש או אימות מקורות דרך provider עם גישה ישירה לאינטרנט, אבל אין כרגע provider כזה מוגדר באפליקציה הזו. כרגע רק Perplexity מחווט כאן לאחזור מקורות אמיתי.`;
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

const chooseProviderForAgent = (agent = {}, cfg = null, preferredProviders = [], options = {}) => {
  const safeCfg = cfg && typeof cfg === 'object' ? cfg : getProviderConfig();
  const requestedPool = normalizeProviderIds(preferredProviders, '');
  const sourceWorkRequired = options?.sourceWorkRequired === true || (
    options?.sourceWorkRequired !== false
    && requiresInternetBackedSourceWork({
      agent,
      stageGoal: options?.stageGoal || '',
      stageInstruction: options?.stageInstruction || '',
      stageLabel: options?.stageLabel || '',
      userPrompt: options?.userPrompt || '',
      extraSystemPrompt: options?.extraSystemPrompt || '',
      includeRequestSignals: options?.includeRequestSignals !== false,
    })
  );
  const filterProviderPool = (providerIds = []) => providerIds
    .filter((providerId) => isProviderConfiguredForUse(providerId, safeCfg))
    .filter((providerId) => !sourceWorkRequired || isProviderInternetBackedSourceCapable(providerId));
  const routingPool = filterProviderPool(requestedPool);
  const explicitProvider = String(agent?.provider || '').trim();
  if (explicitProvider) {
    const explicitProviderAllowed = isProviderConfiguredForUse(explicitProvider, safeCfg)
      && (!sourceWorkRequired || isProviderInternetBackedSourceCapable(explicitProvider))
      && (!requestedPool.length || routingPool.includes(explicitProvider));
    if (explicitProviderAllowed) return explicitProvider;
    if (requestedPool.length && !routingPool.length) return '';
  }

  const roleKey = getAgentRoleKey(agent);
  if (requestedPool.length && !routingPool.length) return '';
  const pool = routingPool.length
    ? routingPool
    : filterProviderPool(getSelectedProviderIds(safeCfg));
  if (!pool.length) return '';
  const inferredProvider = inferProviderFromModelHint(agent?.model || '', pool, safeCfg);
  if (inferredProvider) return inferredProvider;
  const preferences = sourceWorkRequired
    ? getProviderIdsWithRuntimeCapability(INTERNET_BACKED_SOURCE_CAPABILITY)
    : roleKey === 'researcher'
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
const ACADEMIC_SOURCE_SIGNAL_PATTERN = /(אקדמ|סמינר|ביבליוגרפ|ציטוט|citation|references?|journal\s+articles?|literature|doi|scholar|peer[-\s]?reviewed|google scholar|מאמר\s+אקדמי|ספרות|apa|mla)/i;
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
const shouldEnforceConcreteAcademicResearch = (agent = {}, { isAcademicTask = false } = {}) => {
  const stableAgentId = String(agent?.id || '').trim().toLowerCase();
  if (/^researcher-academic$/.test(stableAgentId)) return true;
  return isAcademicTask && /^(researcher|source-hunter|citation-weaver)$/.test(stableAgentId);
};

const buildHeuristicStageGoals = ({ orderedAgents = [], activeSkill = null, isAcademic = false, structureOptOut = false } = {}) => {
  const skillId = String(activeSkill?.id || '').trim().toLowerCase();
  const skillPrefersPolish = ['consistency-checker', 'final-submission', 'style-guardian'].includes(skillId);
  const skillPrefersStructure = ['academic-structure', 'template-autopilot'].includes(skillId);
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

  return stageGoals;
};

const shouldAllowDocumentDesigner = (userPrompt = '', structureConstraintText = '') => {
  const requestText = `${userPrompt}\n${String(structureConstraintText || userPrompt).trim()}`;
  return /(rewrite|שכתוב|סגנון\s+אישי|tone|voice|human|humanize|ליטוש|ניסוח|פחות\s+ai|טבעי\s+יותר|להישמע\s+אישי|שפר|ערוך|polish|edit)/i.test(requestText);
};

const buildHeuristicAgentPlan = (userPrompt = '', documentContext = '', enabledAgents = [], activeSkill = null, structureConstraintText = '') => {
  const combined = `${userPrompt}\n${documentContext}`;
  const resolvedStructureConstraintText = String(structureConstraintText || userPrompt).trim();
  const skillId = String(activeSkill?.id || '').trim().toLowerCase();
  const isAcademic = /(אקדמ|סמינר|עבודה|מחקר|מאמר|ביבליוגרפ|apa|ציטוט|מקורות|מקור)/i.test(combined);
  const needsVisualResearch = hasExplicitVisualResearchNeed(`${userPrompt}\n${resolvedStructureConstraintText}`)
    || hasExplicitVisualResearchNeed(documentContext)
    || hasVisualResearchGapInContext(documentContext);
  const disablesResearch = /(בלי מקורות|ללא מקורות|לא נדרשים מקורות|בלי מקור|ללא מקור|no sources|without sources)/i.test(combined);
  const skillPrefersResearch = ['draft-from-materials'].includes(skillId);
  const skillPrefersStructure = ['academic-structure', 'template-autopilot'].includes(skillId);
  const skillPrefersPolish = ['consistency-checker', 'final-submission', 'style-guardian'].includes(skillId);
  const needsResearch = !disablesResearch && (skillPrefersResearch || isAcademic || /(reference|references|citation|source|sources|literature|journal)/i.test(combined));
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

const clampAutopilotRoundCount = (value, fallback = 1, max = AUTOPILOT_MAX_STAGE_ROUNDS) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return Math.max(1, Math.min(max, Math.round(fallback || 1)));
  return Math.max(1, Math.min(max, Math.round(numericValue)));
};

const getAutopilotRoundBudgetForExecutionStyle = (executionStyle = 'balanced', taskProfile = {}) => {
  const normalizedStyle = AUTOPILOT_EXECUTION_STYLE_OPTIONS.has(String(executionStyle || '').trim())
    ? String(executionStyle).trim()
    : 'balanced';

  if (normalizedStyle === 'deep') {
    return {
      minPerAgent: taskProfile?.needsResearch || taskProfile?.needsStructure ? 2 : 1,
      maxPerAgent: 3,
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

const buildAutopilotTaskProfile = ({ userPrompt = '', documentContext = '', structureConstraintText = '', activeSkill = null, enabledAgents = [] } = {}) => {
  const combined = [userPrompt, documentContext, structureConstraintText].filter(Boolean).join('\n');
  const skillId = String(activeSkill?.id || '').trim().toLowerCase();
  const requestText = String(userPrompt || '').trim();
  const structureText = String(structureConstraintText || userPrompt || '').trim();
  const draftExists = Boolean(String(documentContext || '').trim());
  const isAcademic = /(אקדמ|סמינר|עבודה|מחקר|מאמר\s+אקדמי|ביבליוגרפ|apa|ציטוט|מקורות|doi|scholar)/i.test(combined);
  const needsVisualResearch = hasExplicitVisualResearchNeed(`${requestText}\n${structureText}`)
    || hasExplicitVisualResearchNeed(documentContext)
    || hasVisualResearchGapInContext(documentContext);
  const disablesResearch = /(בלי מקורות|ללא מקורות|לא נדרשים מקורות|בלי מקור|ללא מקור|no sources|without sources)/i.test(combined);
  const needsResearch = !disablesResearch && (
    ['draft-from-materials'].includes(skillId)
    || isAcademic
    || isExplicitSourceRequest(requestText)
    || /(research|מחקר|literature|peer[-\s]?reviewed|evidence|evidence-based)/i.test(combined)
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
    needsVisualResearch ? 1 : 0,
    needsStructure ? 1 : 0,
    needsHumanization ? 1 : 0,
    isAcademic ? 1 : 0,
    enabledAgentCount > 5 ? 1 : 0,
  ].reduce((sum, value) => sum + value, 0);

  const recommendedExecutionStyle = complexityScore >= 6
    ? 'deep'
    : complexityScore >= 3
      ? 'balanced'
      : 'lean';

  const recommendedRounds = getAutopilotRoundBudgetForExecutionStyle(recommendedExecutionStyle, {
    needsResearch,
    needsStructure,
  });

  const signals = [
    draftExists ? 'existing-draft' : 'blank-page',
    needsResearch ? 'research' : '',
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
    needsResearch,
    needsVisualResearch,
    needsStructure,
    needsHumanization,
    isAcademic,
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

const buildStagePrompt = ({ cleanUserPrompt, stageGoal = '', stageInstruction = '', stageAgent, stagedOutput = '', batonNotes = [], planSummary = '', index = 0, total = 1, allowCircular = false, roundIndex = 0, revisitReason = '', decisionMode = 'manager', finalReview = false, enabledAgents = [], agentNotesInstruction = '', collectAgentNotes = false }) => {
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
  const managerReviewContract = (finalReview || isManagerReviewStage)
    ? 'בשלב ביקורת ניהולית, DELIVERABLE חייב להיות המסמך המלא והמעודכן בלבד. כל הערה, פער, תיקון חובה, עצירה או בקשת REVISIT שייכים ל-HANDOFF / MISSING / DECISION / CHECKLIST. גם אם עוצרים, DELIVERABLE נשאר הטיוטה המלאה האחרונה או גרסה מלאה מתוקנת.'
    : '';
  const deliverableSection = (finalReview || isManagerReviewStage)
    ? 'DELIVERABLE:\nהמסמך המלא והמעודכן בלבד. לא הערות, לא סיכום, לא ביקורת. גם אם צריך לעצור או להחזיר סבב, החזר כאן את הטיוטה המלאה האחרונה או גרסה מלאה מתוקנת.'
    : 'DELIVERABLE:\nהתוצר המלא שעובר לשלב הבא או חוזר למשתמש';

  return [
    `בקשת המשתמש המקורית:\n${cleanUserPrompt}`,
    planSummary ? `תכנית מנהל העבודה:\n${planSummary}` : '',
    batonBlock,
    currentOutputBlock,
    stageGoal ? `יעד השלב הנוכחי:\n${stageGoal}` : '',
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

const planWithManagerIfNeeded = async ({ cleanUserPrompt, documentContext, structureConstraintText = '', enabledAgents, automation, cfg, selectedProviders, preferredProviders = [], runId, logEvent, onStatus, activeSkill = null, preserveFullDocumentContext = false }) => {
  const autopilotTaskProfile = buildAutopilotTaskProfile({
    userPrompt: cleanUserPrompt,
    documentContext,
    structureConstraintText,
    activeSkill,
    enabledAgents,
  });
  const fallbackPlan = {
    ...buildHeuristicAgentPlan(cleanUserPrompt, documentContext, enabledAgents, activeSkill, structureConstraintText),
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
  const autopilotProfileJson = JSON.stringify(autopilotTaskProfile, null, 2);
  const planningSchemaText = isFullAutopilot
    ? 'החזר JSON בלבד וללא טקסט נוסף במבנה הזה: {"summary":"...","executionStyle":"lean|balanced|deep","order":["manager","researcher-academic","researcher-general","researcher-visual","writer","document-designer","lecturer-review","manager-review"],"goals":{"manager":"...","manager-review":"..."},"stageInstructions":{"writer":"..."},"roleLabels":{"researcher-academic":"חוקר אקדמי"},"providers":{"researcher-academic":"perplexity"},"models":{"writer":"gpt-4o"},"roundBudget":{"minPerAgent":1,"maxPerAgent":3,"finalManagerPasses":2},"needsFinalManagerReview":true}.'
    : 'החזר JSON בלבד וללא טקסט נוסף במבנה הזה: {"summary":"...","order":["manager","researcher-academic","researcher-general","researcher-visual","writer","document-designer","lecturer-review","manager-review"],"goals":{"manager":"...","manager-review":"..."},"roleLabels":{"researcher-academic":"חוקר אקדמי","researcher-general":"חוקר משלים","researcher-visual":"חוקר חזותי","writer":"כותב תוכן","manager-review":"מנהל מסכם"},"providers":{"researcher-academic":"perplexity","researcher-visual":"perplexity","manager-review":"gemini"},"needsFinalManagerReview":false}.';

  try {
    logEvent('manager-plan-start', 'מנהל העבודה בונה תכנית ביצוע דינמית', {
      state: 'running',
      agentLabel: managerAgent?.name || 'מנהל עבודה',
      provider: managerProvider,
      orderedAgents: enabledAgents.map((agent) => agent.name),
      executionStyle: autopilotTaskProfile.recommendedExecutionStyle,
    });

    const managerPlanText = await chatWithActiveProvider(
      `בקשת המשתמש:\n${cleanUserPrompt}`,
      preserveFullDocumentContext ? String(documentContext || '') : buildPromptDocumentContext(documentContext),
      `${managerAgent?.prompt || ''}\nלפני שאתה מחלק שלבים והוראות, קרא קודם את בקשת המשתמש במלואה. אם קיים בהקשר המסמך תוכן קיים, טיוטה, מסמך חלקי או חומר שכבר נכתב, קרא גם את הטיוטה או המסמך כפי שסופקו לך בהקשר ורק אחר כך החלט איך לחלק את העבודה. כשיש טיוטה, goals לכל סוכן חייבים להתייחס גם לדרישות המשתמש וגם למה שכבר קיים בטיוטה, כדי לשפר, להשלים או לבדוק אותה במקום לעבוד כאילו מתחילים מאפס. אם המשתמש ביקש חקר חזותי, סרטונים, screenshots, diagrams, demos, walkthroughs או חומר חזותי אחר מהרשת, תן עדיפות לסוכן researcher-visual או לשלב מפורש של מחקר חזותי ייעודי.\n${planningSchemaText}\nבחר רק את הסוכנים הנחוצים באמת. במצב AUTOPILOT אתה גם מגדיר את התפקיד המעשי של כל שלב דרך roleLabels. במצב AUTOPILOT מלא אתה רשאי וגם נדרש לבחור provider/model/round budget/stageInstructions לכל שלב רק אם זה באמת משפר את ההתאמה למטלה. אל תמחזר pipeline קבוע כשפרופיל המטלה שונה. מותר להשתמש ב-order, goals, roleLabels, providers, models ו-stageInstructions גם ב-agent ids המדויקים מהרשימה למטה, ולא רק ב-role aliases כלליים. אם יש יותר מסוכן אחד מאותו סוג, השתמש ב-id המדויק כדי לבחור את שניהם או רק אחד מהם. אם מדובר בעבודה אקדמית, טיוטה, נושא מחקרי או חומרי עזר — העדף מקורות לפני כתיבה. אם צריך שער איכות ניהולי מפורש בסוף, מותר להוסיף manager-review כשלב נפרד.\nפרופיל מטלה אלגוריתמי שמחייב אותך לבחור pipeline לפי המשימה:\n${autopilotProfileJson}\nסוכנים זמינים כרגע:\n${availableAgents}\nמודלים זמינים כרגע:\n${availableProviders}`,
      {
        providerOverride: managerProvider,
        preferredProviders: managerProvider ? [managerProvider] : preferredProviders,
        requestSourceClassification: buildInternalRequestSourceClassification(false),
        skipVerifiedSourceShortCircuit: true,
        strictProviderOverride: true,
        modelOverride: effectiveManagerModelOverride,
        preserveFullDocumentContext,
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
      if (resolvedStageInstruction) normalizedStageInstructions[agent.id] = resolvedStageInstruction;
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
  if (includeAcademicContext && !omitStructuralHints) {
    parts.push('כשמדובר בעבודה אקדמית והמשתמש לא ביקש מבנה אחר, ברירת המחדל היא פסקאות רציפות שמפתחות טיעון ולא outline מפורק עם תתי-כותרות רבות.');
    parts.push('יש לקדם את הטיעון באמצעות מעברים טבעיים ומילות קישור בתוך הפסקאות, ולא באמצעות תוויות מודגשות קצרות או כותרות-מיני על כל נקודה.');
  }
  if (profile.alwaysRules) parts.push(`כללים שחייבים להישמר בכל תוצר: ${String(profile.alwaysRules).trim()}`);
  if (profile.avoidRules) parts.push(`יש להימנע במיוחד מהדברים הבאים: ${String(profile.avoidRules).trim()}`);
  if (profile.greetingStyle) parts.push(`אם מתאים לפתוח את הטקסט בברכה, העדף את הסגנון: ${String(profile.greetingStyle).trim()}`);
  if (profile.signOffStyle) parts.push(`אם מתאים לסיים בחתימה או סגירה, העדף: ${String(profile.signOffStyle).trim()}`);
  if (profile.emojiPreference) parts.push(`שימוש באימוג'י: ${emojiLabels[profile.emojiPreference] || profile.emojiPreference}`);
  if (profile.listPreference) parts.push(`פורמט רשימות מועדף: ${listLabels[profile.listPreference] || profile.listPreference}`);
  if (normalizedGoldenExample) parts.push(`דוגמת כתיבה אישית לחיקוי: ${normalizedGoldenExample.slice(0, 500)}${normalizedGoldenExample.length > 500 ? '...' : ''}`);
  if (profile.protectedVocabulary?.length) parts.push(`אין לשנות את המונחים: ${profile.protectedVocabulary.join(', ')}`);
  if (profile.protectedPhrases?.length) parts.push(`אין לשנות את הביטויים: ${profile.protectedPhrases.join(', ')}`);
  if (profile.learningConsent === false) {
    parts.push('המשתמש ביקש שהמערכת תישען בעיקר על ההעדפות שהגדיר ידנית, בלי הרחבה אוטומטית מעבר להן.');
  } else {
    if (profile.learnedSentencePatterns?.length) parts.push(`דפוסי כתיבה שנלמדו: ${profile.learnedSentencePatterns.join(', ')}`);
    if (profile.preferredConnectors?.length) parts.push(`שלב בפועל מחברי טקסט טבעיים שהמשתמש נוטה להשתמש בהם, למשל: ${profile.preferredConnectors.join(', ')}`);
    if (profile.preferredSentenceOpeners?.length) parts.push(`שלב לאורך הטקסט גם פתיחות משפט או פסקה אופייניות כגון: ${profile.preferredSentenceOpeners.join(', ')}`);
    if (profile.toneDescriptors?.length) parts.push(`שמור על מאפייני הטון שנלמדו מהכתיבה: ${profile.toneDescriptors.join(', ')}`);
    if (profile.learnedVocabulary?.length) parts.push(`מונחים שנלמדו מהכתיבה שלך: ${profile.learnedVocabulary.slice(0, 14).join(', ')}`);
    if (profile.learnedPhrases?.length) parts.push(`צירופים אופייניים שנלמדו: ${profile.learnedPhrases.slice(0, 8).join(', ')}`);
    if (fingerprint.avgSentenceWords) parts.push(`ממוצע מילים למשפט: ${fingerprint.avgSentenceWords}`);
    if (fingerprint.avgParagraphWords) parts.push(`ממוצע מילים לפסקה: ${fingerprint.avgParagraphWords}`);
    if (profile.learnedNotes?.length) parts.push(`תובנות שנלמדו מהקבצים: ${profile.learnedNotes.join(' | ')}`);
  }
  if (profile.notes) parts.push(`הערות סגנון אישיות: ${String(profile.notes).trim()}`);
  return parts.filter(Boolean).join('\n');
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
  let timeoutTriggered = false;
  let timeoutError = null;
  const guardedPromise = Promise.resolve(promise).catch((error) => {
    if (timeoutTriggered && String(error?.name || '').trim() === 'AbortError') {
      throw timeoutError || buildAiRequestTimeoutError(safeTimeoutMs);
    }
    throw error;
  });
  try {
    return await Promise.race([
      guardedPromise,
      new Promise((_, reject) => {
        timerId = window.setTimeout(() => {
          timeoutTriggered = true;
          timeoutError = buildAiRequestTimeoutError(safeTimeoutMs);
          try { onTimeout?.(); } catch {}
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
  lastVerifiedSourceRetrievalMode: '',
  lastVerifiedSourceWorkspaceId: '',
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

const escapeHtmlForOutput = (value = '') => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

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

const getLastVerifiedSourceRetrievalMode = ({ workspaceId = '' } = {}) => {
  const current = getAppMemory();
  const safeWorkspaceId = String(workspaceId || getWorkspaceAutomation().activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  if (String(current.lastVerifiedSourceWorkspaceId || '').trim() !== safeWorkspaceId) return '';
  const retrievalMode = String(current.lastVerifiedSourceRetrievalMode || '').trim().toLowerCase();
  return retrievalMode === 'academic' || retrievalMode === 'web' ? retrievalMode : '';
};

const isRememberedVerifiedSourceAcademic = ({ workspaceId = '' } = {}) => {
  const retrievalMode = getLastVerifiedSourceRetrievalMode({ workspaceId });
  if (retrievalMode) return retrievalMode === 'academic';
  return ACADEMIC_SOURCE_SIGNAL_PATTERN.test(getLastVerifiedSourceQuery({ workspaceId }));
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

const rememberVerifiedSourceQuery = ({ query = '', workspaceId = '', academic = false } = {}) => {
  const safeQuery = String(query || '').trim();
  if (!safeQuery) return getAppMemory();
  const safeWorkspaceId = String(workspaceId || getWorkspaceAutomation().activeWorkspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  const current = getAppMemory();
  return saveAppMemory({
    ...current,
    lastVerifiedSourceQuery: trimLogText(safeQuery, 420),
    lastVerifiedSourceRetrievalMode: academic ? 'academic' : 'web',
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
  return next;
};

export const clearAppMemory = () => {
  localStorage.setItem(APP_MEMORY_STORAGE_KEY, JSON.stringify(DEFAULT_APP_MEMORY));
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
      lastVerifiedSourceRetrievalMode: '',
      lastVerifiedSourceWorkspaceId: '',
    });
  } else {
    localStorage.removeItem(scopedKey);
    localStorage.removeItem(legacyKey);
    if (String(currentMemory.lastVerifiedSourceWorkspaceId || '').trim() === activeWorkspaceId) {
      saveAppMemory({
        ...currentMemory,
        lastVerifiedSourceQuery: '',
        lastVerifiedSourceRetrievalMode: '',
        lastVerifiedSourceWorkspaceId: '',
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
  if (!(typeof window !== 'undefined' && window.desktopApp?.proxyHttpRequest)) return null;

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
  const allowedUrls = extractAllowedGroundingUrlsFromCompletion(completion);
  const normalized = {
    ...(reason ? { reason } : {}),
    ...(finishReason ? { finishReason } : {}),
    ...(stopReason ? { stopReason } : {}),
    ...(providerId ? { provider: providerId } : {}),
    ...(model ? { model } : {}),
    ...(allowedUrls.length ? { allowedUrls } : {}),
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
  const url = baseUrl.replace(/\/$/, '') + '/chat/completions';
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const bodyStr = JSON.stringify({ model, messages, max_tokens: 4096, stream: false });
  const buildResponse = (data = {}) => finalizeProviderTextResponse({
    text: data.choices?.[0]?.message?.content || '',
    completion: {
      finishReason: data.choices?.[0]?.finish_reason || '',
      ...(Array.isArray(data?.citations) ? { citations: data.citations } : {}),
      ...(Array.isArray(data?.search_results) ? { searchResults: data.search_results } : {}),
    },
  }, '', includeCompletionMetadata);

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

// ═══════════════════════════════════════
// Claude (Anthropic)
// ═══════════════════════════════════════
export const callClaudeApi = async (apiKey, model, systemPrompt, userMessage, signal, options = {}) => {
  const includeCompletionMetadata = options.includeCompletionMetadata === true;
  const url = 'https://api.anthropic.com/v1/messages';
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };
  const bodyStr = JSON.stringify({
    model, max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });
  const buildResponse = (data = {}) => finalizeProviderTextResponse({
    text: data.content?.[0]?.text || '',
    completion: {
      stopReason: data.stop_reason || '',
    },
  }, '', includeCompletionMetadata);

  const desktopResult = await proxyDesktopHttpRequest({ url, method: 'POST', headers, body: bodyStr }, signal);
  if (desktopResult) {
    const result = desktopResult;
    if (!result.ok) {
      throw new Error(`Claude API (${result.status}): ${String(result.body || '').slice(0, 300)}`);
    }
    const data = JSON.parse(result.body);
    return buildResponse(data);
  }

  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers,
    body: bodyStr,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`Claude API (${res.status}): ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  return buildResponse(data);
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
  const skipVerifiedSourceShortCircuit = options.skipVerifiedSourceShortCircuit === true;
  const skipAutomationPrompt = options.skipAutomationPrompt === true || options.skipAutomation === true;
  const omitPersonalStyleStructureHints = options.omitPersonalStyleStructureHints === true;
  const personalStylePrompt = buildPersonalStyleInstructions(getPersonalStyleProfile(), {
    omitStructuralHints: omitPersonalStyleStructureHints,
    requestText: [cleanUserPrompt, options.structureConstraintText].filter(Boolean).join('\n'),
    templateId: String(options.templateId || '').trim(),
    isAcademicTask: typeof options.isAcademicTask === 'boolean' ? options.isAcademicTask : undefined,
  });
  const sharedInstructions = getSharedAgentInstructions();
  const workspaceAutomationPrompt = buildWorkspaceAutomationInstructions({ disabled: skipAutomationPrompt });
  const skillsConfig = getSkillsConfig();
  const skillResolution = skipSkillSelection
    ? { skill: null, reason: 'skipped' }
    : resolveSkillForRequest({
      userPrompt: cleanUserPrompt,
      documentContext,
      skillId: options.skillId || '',
      autoUseDefault: options.autoUseDefaultSkill !== false,
    });
  const activeSkill = skillResolution.skill;
  const skillPrompt = buildSkillSystemPrompt(activeSkill, skillResolution.reason, activeSkill ? skillsConfig.skills?.[activeSkill.id] : null);
  const requestSourceClassification = resolveRequestSourceClassification({
    userPrompt: cleanUserPrompt,
    documentContext,
    extraSystemPrompt,
    skillId: activeSkill?.id || options.skillId || '',
    overrides: options.requestSourceClassification,
  });
  const {
    sourceGroundingRequired,
    internetBackedSourceWorkRequired,
    sourceOnlyGroundingRequest,
    sourceHunterSourceOnlyShortcut,
  } = requestSourceClassification;
  const strictSourceGroundingEnabled = true;
  const shouldShortCircuitToVerifiedSources = strictSourceGroundingEnabled
    && !skipVerifiedSourceShortCircuit
    && sourceOnlyGroundingRequest
    && (sourceGroundingRequired || sourceHunterSourceOnlyShortcut);
  const configuredInternetSourceProviders = getConfiguredProvidersByRuntimeCapability(cfg, INTERNET_BACKED_SOURCE_CAPABILITY);
  const sourceAutoRouteEnabled = assistantBehavior.autoRouteSourceRequests !== false;
  const requestedProvider = activeProvider;
  const activeProviderCanServeInternetSourceWork = isProviderConfiguredForUse(activeProvider, cfg)
    && isProviderInternetBackedSourceCapable(activeProvider);
  const hasExplicitProviderSelection = strictProviderOverride || preferredProviders.length > 0;
  const sourceRequestAutoRouted = sourceAutoRouteEnabled
    && internetBackedSourceWorkRequired
    && !hasExplicitProviderSelection
    && !activeProviderCanServeInternetSourceWork
    && configuredInternetSourceProviders.length;
  if (sourceRequestAutoRouted) {
    activeProvider = configuredInternetSourceProviders[0];
  }
  if (internetBackedSourceWorkRequired && !activeProviderCanServeInternetSourceWork && !sourceRequestAutoRouted && !hasExplicitProviderSelection && !shouldShortCircuitToVerifiedSources) {
    throw new Error(buildInternetBackedSourceProviderError({
      subjectLabel: 'הבקשה הנוכחית',
      requestedProviderId: requestedProvider || activeProvider,
      configuredProviderIds: configuredInternetSourceProviders,
      cfg,
    }));
  }
  const taggedModelOverride = strictProviderOverride
    ? ''
    : taggedRouting.providerModels?.[activeProvider]
    || (preferredProviders.length ? '' : taggedRouting.taggedModel);
  const modelOverride = sourceRequestAutoRouted ? (taggedModelOverride || '') : (options.modelOverride || taggedModelOverride || '');
  const sourceAwareAutomationPreferredProviders = sourceAutoRouteEnabled && internetBackedSourceWorkRequired && !strictProviderOverride && configuredInternetSourceProviders.length
    ? configuredInternetSourceProviders
    : automationPreferredProviders;
  const responseModePrompt = buildResponseModePrompt({ strictFormatting: options.strictFormatting === true });
  const providerSupportsSourceGrounding = sourceGroundingRequired && isSourceGroundingProvider(activeProvider);
  const sourceGroundingAllowedUrls = new Set([
    ...extractUrlSetFromText(cleanUserPrompt),
    ...extractUrlSetFromText(extraSystemPrompt),
    ...extractUrlSetFromText(documentContext),
  ]);
  const sourceGroundingPrompt = buildSourceGroundingPrompt({
    enforce: strictSourceGroundingEnabled && sourceGroundingRequired,
    providerSupportsGrounding: providerSupportsSourceGrounding,
  });
  const appMemoryPrompt = options.includeAppMemory === false ? '' : buildAppMemoryInstructions(getAppMemory());
  const automation = getWorkspaceAutomation();
  const onStatus = options.onStatus;
  const agentLabel = options.agentLabel || 'הסוכן הראשי';
  const agentName = options.agentName || agentLabel;
  const includeCompletionMetadata = options.includeCompletionMetadata === true;
  const captureCompletionMetadata = includeCompletionMetadata || (strictSourceGroundingEnabled && sourceGroundingRequired);
  const requestTimeoutMs = Number(automation.requestTimeoutMs);
  const timeoutMs = automation.timeoutEnabled === true && Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0
    ? Math.max(10000, Math.round(requestTimeoutMs))
    : 0;
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
  const rememberSuccessfulReply = (replyText = '', responseOptions = {}) => {
    const responseProvider = String(responseOptions.providerId || activeProvider || '').trim() || activeProvider;
    const providerSupportsGroundingForReply = typeof responseOptions.providerSupportsGroundingOverride === 'boolean'
      ? responseOptions.providerSupportsGroundingOverride
      : providerSupportsSourceGrounding;
    const normalizedReply = normalizeProviderTextResponse(replyText, responseProvider);
    const allowedUrlsForReply = mergeSourceGroundingUrls(
      sourceGroundingAllowedUrls,
      responseOptions.allowedUrls,
      normalizedReply.completion?.allowedUrls,
    );
    const safeReplyText = sanitizeSourceGroundingResponse(normalizedReply.text, {
      enforce: strictSourceGroundingEnabled && sourceGroundingRequired,
      providerSupportsGrounding: providerSupportsGroundingForReply,
      allowedUrls: allowedUrlsForReply,
    });
    const safeReply = safeReplyText === normalizedReply.text
      ? normalizedReply
      : {
          ...normalizedReply,
          text: safeReplyText,
        };
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
  if (shouldShortCircuitToVerifiedSources) {
    logEvent('verified-source-retrieval-start', 'מפעיל אחזור מאומת למקורות לפני יצירת תשובה', {
      state: 'running',
      provider: activeProvider,
    });
    emitStatus(onStatus, {
      state: 'running',
      progress: 18,
      runId,
      provider: activeProvider,
      model: resolvedModel,
      agentLabel,
      message: 'מאתר מקורות מאומתים',
    });
    const verifiedSourceReply = await resolveVerifiedSourceReply({
      userPrompt: cleanUserPrompt,
      documentContext,
      extraSystemPrompt,
      skillId: activeSkill?.id || options.skillId || '',
      isAcademicTask: typeof options.isAcademicTask === 'boolean' ? options.isAcademicTask : undefined,
      cfg,
      timeoutMs,
    });
    if (verifiedSourceReply?.text) {
      if (verifiedSourceReply.query) {
        try {
          rememberVerifiedSourceQuery({
            query: verifiedSourceReply.query,
            academic: verifiedSourceReply.academic === true,
            workspaceId: verifiedSourceReply.workspaceId || activeWorkspaceId,
          });
        } catch {}
      }
      const isFailure = verifiedSourceReply.text.includes(SOURCE_GROUNDING_FAILURE_TOKEN);
      logEvent(
        isFailure ? 'verified-source-retrieval-blocked' : 'verified-source-retrieval-success',
        isFailure ? 'בקשת המקורות נחסמה כי לא נמצאו תוצאות מאומתות' : 'הוחזרו מקורות מאומתים בלבד',
        {
          state: isFailure ? 'error' : 'success',
          provider: verifiedSourceReply.providerId || activeProvider,
          model: verifiedSourceReply.model || resolvedModel,
          outputPreview: trimLogText(verifiedSourceReply.text),
          errorMessage: verifiedSourceReply.error?.message || '',
        },
      );
      return rememberSuccessfulReply({
        text: verifiedSourceReply.text,
        completion: {
          provider: verifiedSourceReply.providerId || activeProvider,
          model: verifiedSourceReply.model || resolvedModel,
        },
      }, {
        providerId: verifiedSourceReply.providerId || activeProvider,
        providerSupportsGroundingOverride: true,
        allowedUrls: new Set([
          ...sourceGroundingAllowedUrls,
          ...Array.from(verifiedSourceReply.urls || []),
        ]),
      });
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
כאשר צריך לבצע הפרדת עמודים, החזר בדיוק את קטע ה-HTML הבא בלבד בשורה נפרדת: <div data-type="page-break"></div>.${sourceGroundingPrompt ? `\n\nGrounding למקורות:\n${sourceGroundingPrompt}` : ''}${extraSystemPrompt ? `\n\nהנחיית תפקיד:\n${extraSystemPrompt}` : ''}${skillPrompt ? `\n\nסקיל נבחר:\n${skillPrompt}` : ''}${sharedInstructions ? `\n\nהנחיות משותפות לפרויקט:\n${sharedInstructions}` : ''}${workspaceAutomationPrompt ? `\n\nתיאום צוות AI:\n${workspaceAutomationPrompt}` : ''}${personalStylePrompt ? `\n\nהעדפות סגנון אישיות:\n${personalStylePrompt}` : ''}${appMemoryPrompt ? `\n\nזיכרון אפליקציה וסוכן:\n${appMemoryPrompt}` : ''}${promptDocumentContext ? `\n\nהקשר מהמסמך:\n${promptDocumentContext}` : ''}${responseModePrompt ? `\n\nכללי מטלה וצורת מענה:\n${responseModePrompt}` : ''}`;

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
    sourceRequestAutoRouted,
    skillId: activeSkill?.id || '',
    skillLabel: activeSkill?.label || '',
    skillReason: skillResolution.reason,
    skillSelectionSkipped: skipSkillSelection,
    automationPromptSkipped: skipAutomationPrompt,
    automationSkipped: Boolean(automationSkipReason),
    automationSkipReason,
    personalStyleStructureHintsSkipped: omitPersonalStyleStructureHints,
  });

  if (shouldAttemptAutomation) {
    if (enabledAgents.length) {
      const executionPlan = await planWithManagerIfNeeded({
        cleanUserPrompt,
        documentContext,
        structureConstraintText,
        enabledAgents,
        automation,
        cfg,
        selectedProviders,
        preferredProviders: automationPreferredProviders,
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
      const stageNotes = [];

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
          const stageRequiresInternetBackedSourceWork = requiresInternetBackedSourceWork({
            agent: stageAgent,
            stageGoal,
            stageInstruction,
            stageLabel,
            includeRequestSignals: false,
          });
          const stagePreferredProviders = stageRequiresInternetBackedSourceWork
            ? configuredInternetSourceProviders
            : automationPreferredProviders;
          const allowedStageProviders = stageRequiresInternetBackedSourceWork
            ? configuredInternetSourceProviders
            : getConfiguredProviderPool(cfg, stagePreferredProviders);
          const normalizedRequestedProvider = resolveExplicitProviderCandidate([
            executionPlan?.stageProviders?.[stageAgent.id],
            executionPlan?.stageProviders?.[stageAgent.name],
            executionPlan?.stageProviders?.[String(stageAgent.id || '').toLowerCase()],
            executionPlan?.stageProviders?.[stageRoutingKey],
          ], allowedStageProviders, cfg);
          const stageProvider = normalizedRequestedProvider || chooseProviderForAgent(stageAgent, cfg, stagePreferredProviders, {
            stageGoal,
            stageInstruction,
            stageLabel,
            includeRequestSignals: false,
            sourceWorkRequired: stageRequiresInternetBackedSourceWork,
          });
          if (stageRequiresInternetBackedSourceWork && !stageProvider) {
            throw new Error(buildInternetBackedSourceProviderError({
              subjectLabel: `השלב "${stageLabel || stageAgent.name || stageAgent.id}"`,
              configuredProviderIds: configuredInternetSourceProviders,
              cfg,
            }));
          }
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
          const stageReply = await chatWithActiveProvider(stagePrompt, stageDocumentContext, stageSystemPrompt, {
            providerOverride: stageProvider,
            preferredProviders: stageProvider ? [stageProvider] : stagePreferredProviders,
            requestSourceClassification: buildInternalRequestSourceClassification(stageRequiresInternetBackedSourceWork),
            skipVerifiedSourceShortCircuit: true,
            strictProviderOverride: true,
            modelOverride: stageRequestedModel || '',
            includeCompletionMetadata: true,
            strictFormatting: true,
            skipAutomation: true,
            skipMultiModel: true,
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
        const reviewRequiresInternetBackedSourceWork = requiresInternetBackedSourceWork({
          agent: managerAgent,
          stageGoal: managerReviewGoal,
          stageInstruction: managerReviewInstruction,
          stageLabel: managerAgent.name,
          includeRequestSignals: false,
        });
        const reviewPreferredProviders = reviewRequiresInternetBackedSourceWork
          ? configuredInternetSourceProviders
          : automationPreferredProviders;
        const allowedReviewProviders = reviewRequiresInternetBackedSourceWork
          ? configuredInternetSourceProviders
          : getConfiguredProviderPool(cfg, reviewPreferredProviders);
        const normalizedReviewProvider = resolveExplicitProviderCandidate([
          executionPlan?.stageProviders?.['manager-review'],
          executionPlan?.stageProviders?.[managerAgent.id],
          executionPlan?.stageProviders?.[managerAgent.name],
          executionPlan?.stageProviders?.[String(managerAgent.id || '').toLowerCase()],
          executionPlan?.stageProviders?.[managerRoleKey],
        ], allowedReviewProviders, cfg);
        const reviewProvider = normalizedReviewProvider || chooseProviderForAgent(managerAgent, cfg, reviewPreferredProviders, {
          stageGoal: managerReviewGoal,
          stageInstruction: managerReviewInstruction,
          stageLabel: managerAgent.name,
          includeRequestSignals: false,
          sourceWorkRequired: reviewRequiresInternetBackedSourceWork,
        });
        if (reviewRequiresInternetBackedSourceWork && !reviewProvider) {
          throw new Error(buildInternetBackedSourceProviderError({
            subjectLabel: `השלב "${managerAgent.name || 'manager-review'}"`,
            configuredProviderIds: configuredInternetSourceProviders,
            cfg,
          }));
        }
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
          batonNotes,
          planSummary: executionPlan?.summary || '',
          index: orderedAgents.length,
          total: orderedAgents.length + 1,
          finalReview: true,
          enabledAgents,
          agentNotesInstruction,
          collectAgentNotes: appendAgentNotesToOutput,
        });

        const previousManagerOutput = resolveDocumentPreservationCandidate(stagedOutput, seededDocumentOutput);
        const managerReply = await chatWithActiveProvider(reviewPrompt, reviewDocumentContext, `${managerAgent.prompt}${managerReviewInstruction ? `\nהנחיית AUTOPILOT משלימה לשלב:\n${managerReviewInstruction}` : ''}\nזהו שלב בדיקה סופי לפני החזרה למשתמש. DELIVERABLE חייב להיות המסמך המלא והמעודכן בלבד. הערות, חוסרים ותיקוני חובה שייכים ל-HANDOFF / MISSING / CHECKLIST. גם אם צריך לעצור או לבקש REVISIT, אל תחזיר פסקת מטא במקום המסמך המלא. החזר בתבנית DELIVERABLE / HANDOFF / MISSING / DECISION / CHECKLIST בלבד.`, {
          providerOverride: reviewProvider,
          preferredProviders: reviewProvider ? [reviewProvider] : reviewPreferredProviders,
          requestSourceClassification: buildInternalRequestSourceClassification(reviewRequiresInternetBackedSourceWork),
          skipVerifiedSourceShortCircuit: true,
          strictProviderOverride: true,
          modelOverride: reviewRequestedModel || '',
          includeCompletionMetadata: true,
          strictFormatting: true,
          skipAutomation: true,
          skipMultiModel: true,
          preserveFullDocumentContext,
          shouldPersistMemory: false,
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

  if (selectedProviders.length > 1 && !options.providerOverride && !options.skipMultiModel && !sourceGroundingRequired && !internetBackedSourceWorkRequired) {
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
        const geminiModelConfig = { model: resolvedModel };
        if (providerSupportsSourceGrounding) {
          geminiModelConfig.tools = [{ googleSearch: {} }];
        }
        const mdl = genAI.getGenerativeModel(geminiModelConfig);
        const result = await mdl.generateContent(`${sysPrompt}\n\nמשתמש: ${cleanUserPrompt}`);
        return finalizeProviderTextResponse({
          text: result.response.text(),
          completion: {
            finishReason: result.response?.candidates?.[0]?.finishReason || '',
          },
        }, activeProvider, captureCompletionMetadata);
      }
      case 'openai': {
        if (!cfg.openai.key) throw new Error('מפתח OpenAI לא הוגדר — עבור להגדרות AI (תפריט קובץ)');
        return callOpenAICompatible('https://api.openai.com/v1', cfg.openai.key, resolvedModel, [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: cleanUserPrompt },
        ], signal, { includeCompletionMetadata: captureCompletionMetadata });
      }
      case 'claude': {
        if (!cfg.claude.key) throw new Error('מפתח Claude לא הוגדר — עבור להגדרות AI (תפריט קובץ)');
        return callClaudeApi(cfg.claude.key, resolvedModel, sysPrompt, cleanUserPrompt, signal, { includeCompletionMetadata: captureCompletionMetadata });
      }
      case 'groq': {
        if (!cfg.groq.key) throw new Error('מפתח Groq לא הוגדר — עבור להגדרות AI (תפריט קובץ)');
        return callOpenAICompatible('https://api.groq.com/openai/v1', cfg.groq.key, resolvedModel, [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: cleanUserPrompt },
        ], signal, { includeCompletionMetadata: captureCompletionMetadata });
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
        ], signal, { includeCompletionMetadata: captureCompletionMetadata });
      }
      case 'perplexity': {
        if (!cfg.perplexity.key) throw new Error('מפתח Perplexity לא הוגדר — עבור להגדרות AI (תפריט קובץ)');
        return callOpenAICompatible('https://api.perplexity.ai', cfg.perplexity.key, resolvedModel, [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: cleanUserPrompt },
        ], signal, { includeCompletionMetadata: captureCompletionMetadata });
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
        ], signal, { includeCompletionMetadata: captureCompletionMetadata });
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
  const fallbackProviderHints = constrainedProviders.length || selectedProviders.length > 1 ? selectedProviders : [];
  const fallbackPool = internetBackedSourceWorkRequired
    ? getConfiguredProvidersByRuntimeCapability(cfg, INTERNET_BACKED_SOURCE_CAPABILITY, fallbackProviderHints)
    : (fallbackProviderHints.length
      ? getConfiguredProviderPool(cfg, fallbackProviderHints)
      : getConfiguredProviderPool(cfg));
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
        const normalizedFallbackReply = normalizeProviderTextResponse(fallbackText, fallbackProvider);

        logEvent('provider-fallback-success', `${fallbackProvider} החזיר תשובת גיבוי`, {
          state: 'success',
          fallbackProvider,
          responseChars: normalizedFallbackReply.text.length,
          completionReason: normalizedFallbackReply.completion?.reason || '',
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

export const callAiAgent = async (agentId, selectedText, context = "") => {
  const agentConf = AGENTS_CONFIG[agentId];
  if (!agentConf) throw new Error("Invalid agent ID");
  const fullPrompt = buildPrompt(agentConf, selectedText, context);
  // משתמש במנוע הפעיל הנבחר (לא תמיד Gemini)
  return chatWithActiveProvider(fullPrompt, context, '', {
    skipAutomation: true,
    skipMultiModel: true,
    strictFormatting: true,
  });
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
  const preferredProviders = normalizeProviderIds(runtimeOptions.preferredProviders, '');
  const explicitProviderOverride = String(runtimeOptions.providerOverride || '').trim();
  const runtimeModelOverride = String(runtimeOptions.modelOverride || '').trim();
  const extraSystemPrompt = String(runtimeOptions.extraSystemPrompt || '').trim();
  const agentModelOverride = String(agent.model || '').trim();
  const requestedModelOverride = runtimeModelOverride || agentModelOverride;
  const strictProviderOverride = runtimeOptions.strictProviderOverride === true && Boolean(explicitProviderOverride);
  const providerOverride = strictProviderOverride
    ? explicitProviderOverride
    : (preferredProviders.length ? '' : chooseProviderForAgent(agent, cfg, selectedProviders));
  const modelOverride = providerOverride && requestedModelOverride && !isProviderModelChoiceCompatible(providerOverride, requestedModelOverride, cfg)
    ? ''
    : requestedModelOverride;
  const combinedSystemPrompt = [agent.prompt, extraSystemPrompt].filter(Boolean).join('\n\n');
  return chatWithActiveProvider(userPrompt, documentContext, combinedSystemPrompt, {
    providerOverride,
    strictProviderOverride,
    preferredProviders: preferredProviders.length ? preferredProviders : selectedProviders,
    modelOverride,
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
  const personalStylePrompt = buildPersonalStyleInstructions(getPersonalStyleProfile(), {
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
  const headers = { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' };
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


