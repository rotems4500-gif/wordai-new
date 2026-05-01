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
  timeoutEnabled: false,
  requestTimeoutMs: 45,
  showProgress: true,
  appendAgentNotesToOutput: false,
  agentNotesInstruction: '',
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
      timeoutEnabled: false,
      requestTimeoutMs: 45,
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
      timeoutEnabled: false,
      requestTimeoutMs: 45,
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
      timeoutEnabled: false,
      requestTimeoutMs: 45,
      showProgress: true,
      appendAgentNotesToOutput: true,
      agentNotesInstruction: getResearchWorkspaceNotesInstruction(),
    },
    agents: getLightSystemResearchAgents(),
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

const ensureDefaultWorkspaceEntries = (library = {}) => {
  const nextLibrary = { ...(library || {}) };
  let wasUpdated = false;

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

export const shouldUseWorkspaceAutomation = (automation = getWorkspaceAutomation()) => (
  automation?.enabled === true && automation?.autoDispatch !== false
);

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
  if (workflowMode === 'custom-order') return agents;

  const configuredOrder = [
    ...agents.filter((agent) => isPlanningManagerAgent(agent)),
    ...agents.filter((agent) => !isPlanningManagerAgent(agent) && !isManagerReviewAgent(agent)),
    ...agents.filter((agent) => isManagerReviewAgent(agent)),
  ];

  if (['manager-auto', 'circular-team'].includes(workflowMode) && automation?.autopilotEnabled === false) {
    return configuredOrder;
  }

  const desiredOrders = {
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
  'academic-lab': {
    label: 'צוות אקדמי',
    description: 'מתאים לעבודות, סמינרים וסיכומים פורמליים עם מנהל עבודה אוטומטי.',
    automation: { enabled: true, preset: 'academic-lab', workflowMode: 'manager-auto', autoDispatch: true },
    agents: [
      { id: 'manager', name: 'מנהל עבודה אקדמי', prompt: 'פרק את המשימה האקדמית לשלבים ברורים: חקר, מבנה, כתיבה וליטוש. שמור על דיוק והחזר תכנית קצרה ותוצר ישים.', provider: '', model: '', enabled: true },
      { id: 'researcher', name: 'חוקר ספרות', prompt: 'אתר תוצר מחקרי קונקרטי וישים. כשאפשר, ספק לפחות 3 מקורות או מאמרים אקדמיים רלוונטיים, ולכל מקור ציין כותרת, מחבר או גוף מפרסם, שנה אם ידועה, קישור או DOI אם זמין, ולמה הוא חשוב לעבודה. אם נמצאו פחות מ-3 מקורות, כתוב במפורש כמה נמצאו ומה חסר להשלמת הסקירה, ואל תסתפק רק בכיווני חיפוש או במילות מפתח. אפשר להוסיף מונחי חיפוש כהשלמה בלבד. אל תמציא פרטים. אם נדרש גם חקר חזותי, ציין זאת כהשלמה למנהל העבודה.', provider: '', model: '', enabled: true },
      { id: 'designer', name: 'בונה שלד אקדמי', prompt: 'בנה מבנה אקדמי מדויק לפי הוראות המשתמש והמטלה. אם התבקשו מבוא, פרקים, שאלות או היקף מסוים - שמור עליהם; אם לא, אל תוסיף מבנה קבוע כמו מבוא/דיון/סיכום על דעת עצמך. הקפד על רצף טיעוני והיררכיית כותרות רק כשנדרש.', provider: '', model: '', enabled: true },
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
    ],
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
    agents: [
      { id: 'manager', name: 'מנהל מוצר', prompt: 'הגדר מטרה, קהל יעד, תוצרים וסדר עבודה. החזר תוכנית קצרה ותעדוף ברור.', provider: '', model: '', enabled: true },
      { id: 'designer', name: 'מעצב חוויה', prompt: 'בנה מבנה מסמך חד וברור, כותרות נכונות וזרימת קריאה ידידותית. אל תוסיף מבוא, סיכום או פרקים קבועים אם המשתמש לא ביקש אותם במפורש.', provider: '', model: '', enabled: true },
      { id: 'writer', name: 'קופירייטר', prompt: 'כתוב תוכן ברור, משכנע וקריא, עם פתיחה רק אם היא נדרשת לפי בקשת המשתמש או סוג המסמך, ועם מעברים טובים בלי לכפות מבוא או hook על דעת עצמך.', provider: '', model: '', enabled: true },
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
const ACADEMIC_SOURCE_SIGNAL_PATTERN = /(אקדמ|סמינר|ביבליוגרפ|ציטוט|citation|references?|journal|literature|doi|scholar|peer[-\s]?reviewed|google scholar|מאמר|ספרות)/i;
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
const shouldEnforceConcreteAcademicResearch = (agent = {}, { academicResearchRequested = false, isAcademicTask = false } = {}) => {
  const stableAgentId = String(agent?.id || '').trim().toLowerCase();
  if (academicResearchRequested && /^(researcher|researcher-academic|source-hunter|citation-weaver)$/.test(stableAgentId)) return true;
  if (/^(researcher-academic|source-hunter|citation-weaver)$/.test(stableAgentId)) return true;
  return isAcademicTask && /^(researcher|researcher-academic|source-hunter|citation-weaver)$/.test(stableAgentId);
};

const buildHeuristicStageGoals = ({ orderedAgents = [], activeSkill = null, isAcademic = false, structureOptOut = false } = {}) => {
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
  const skillPrefersResearch = ['source-hunter', 'citation-weaver', 'draft-from-materials'].includes(skillId);
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

const buildStagePrompt = ({ cleanUserPrompt, stageGoal = '', stageAgent, stagedOutput = '', batonNotes = [], planSummary = '', index = 0, total = 1, allowCircular = false, roundIndex = 0, revisitReason = '', decisionMode = 'manager', finalReview = false, enabledAgents = [], agentNotesInstruction = '', collectAgentNotes = false }) => {
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
    revisitReason ? `למה הוחזרת עכשיו לסבב נוסף:\n${revisitReason}` : '',
    collectAgentNotes && agentNotesInstruction ? `הנחיה מחייבת לנספח הערות סוכנים בסוף המסמך:\n${agentNotesInstruction}\nבסוף השלב, הוסף ב-CHECKLIST נקודות קצרות שמסבירות מה בוצע ומה נשאר.` : '',
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

const planWithManagerIfNeeded = async ({ cleanUserPrompt, documentContext, structureConstraintText = '', enabledAgents, automation, cfg, selectedProviders, preferredProviders = [], runId, logEvent, onStatus, activeSkill = null }) => {
  const fallbackPlan = buildHeuristicAgentPlan(cleanUserPrompt, documentContext, enabledAgents, activeSkill, structureConstraintText);
  const structureOptOut = hasExplicitStructureOptOut(structureConstraintText || cleanUserPrompt);
  const combinedContext = `${cleanUserPrompt}\n${documentContext}`;
  const isAcademicTask = /(אקדמ|סמינר|עבודה|מחקר|מאמר|ביבליוגרפ|apa|ציטוט|מקורות|מקור)/i.test(combinedContext);
  if (!enabledAgents.length) return fallbackPlan;

  if (['manager-auto', 'circular-team'].includes(automation.workflowMode) && automation?.autopilotEnabled === false) {
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

  if (!['manager-auto', 'circular-team'].includes(automation.workflowMode)) return fallbackPlan;

  const managerAgent = resolvePlanningManagerAgent(enabledAgents);
  if (!managerAgent) return fallbackPlan;
  const allowDocumentDesigner = shouldAllowDocumentDesigner(cleanUserPrompt, structureConstraintText);
  const planningProviderPool = getConfiguredProviderPool(cfg, preferredProviders);
  const managerProvider = chooseProviderForAgent(managerAgent, cfg, preferredProviders);
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

  try {
    logEvent('manager-plan-start', 'מנהל העבודה בונה תכנית ביצוע דינמית', {
      state: 'running',
      agentLabel: managerAgent?.name || 'מנהל עבודה',
      provider: managerProvider,
      orderedAgents: enabledAgents.map((agent) => agent.name),
    });

    const managerPlanText = await chatWithActiveProvider(
      `בקשת המשתמש:\n${cleanUserPrompt}`,
      String(documentContext || '').slice(0, 8000),
      `${managerAgent?.prompt || ''}\nלפני שאתה מחלק שלבים והוראות, קרא קודם את בקשת המשתמש במלואה. אם קיים בהקשר המסמך תוכן קיים, טיוטה, מסמך חלקי או חומר שכבר נכתב, קרא גם את הטיוטה או המסמך כפי שסופקו לך בהקשר ורק אחר כך החלט איך לחלק את העבודה. כשיש טיוטה, goals לכל סוכן חייבים להתייחס גם לדרישות המשתמש וגם למה שכבר קיים בטיוטה, כדי לשפר, להשלים או לבדוק אותה במקום לעבוד כאילו מתחילים מאפס. אם המשתמש ביקש חקר חזותי, סרטונים, screenshots, diagrams, demos, walkthroughs או חומר חזותי אחר מהרשת, תן עדיפות לסוכן researcher-visual או לשלב מפורש של מחקר חזותי ייעודי.\nהחזר JSON בלבד וללא טקסט נוסף במבנה הזה: {"summary":"...","order":["manager","researcher-academic","researcher-general","researcher-visual","writer","document-designer","lecturer-review","manager-review"],"goals":{"manager":"...","manager-review":"..."},"roleLabels":{"researcher-academic":"חוקר אקדמי","researcher-general":"חוקר משלים","researcher-visual":"חוקר חזותי","writer":"כותב תוכן","manager-review":"מנהל מסכם"},"providers":{"researcher-academic":"perplexity","researcher-visual":"gemini","manager-review":"gemini"},"needsFinalManagerReview":false}.\nבחר רק את הסוכנים הנחוצים באמת. במצב AUTOPILOT אתה גם מגדיר את התפקיד המעשי של כל שלב דרך roleLabels. מותר להשתמש ב-order, goals, roleLabels ו-providers גם ב-agent ids המדויקים מהרשימה למטה, ולא רק ב-role aliases כלליים. אם יש יותר מסוכן אחד מאותו סוג, השתמש ב-id המדויק כדי לבחור את שניהם או רק אחד מהם. אם מדובר בעבודה אקדמית, טיוטה, נושא מחקרי או חומרי עזר — העדף מקורות לפני כתיבה. אם מדובר בחקר חזותי או בפער חזותי מפורש, מותר ואף רצוי לבחור researcher-visual כשלב ייעודי. אם צריך שער איכות ניהולי מפורש בסוף, מותר להוסיף manager-review כשלב נפרד. אם מצב העבודה הוא מעגלי, מותר לך לתכנן כך שסוכן יחזור לסבב נוסף בהמשך לפי הצורך.\nסוכנים זמינים כרגע:\n${availableAgents}\nמודלים זמינים כרגע:\n${availableProviders}`,
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
    });

    const resolvedFinalReviewer = resolveFinalManagerReviewAgent(enabledAgents);
    const lastPlannedAgent = normalizedOrderedAgents[normalizedOrderedAgents.length - 1] || null;
    const alreadyEndsWithManagerReview = Boolean(lastPlannedAgent) && Boolean(resolvedFinalReviewer) && lastPlannedAgent.id === resolvedFinalReviewer.id;
    const dynamicStageGoals = { ...(parsedPlan.goals || {}) };
    const normalizedStageLabels = {};
    const normalizedStageProviders = {};
    normalizedOrderedAgents.forEach((agent) => {
      const roleKey = isManagerReviewAgent(agent) ? 'manager-review' : getAgentRoleKey(agent);
      const specializedRoleKey = isVisualResearchAgent(agent)
        ? 'researcher-visual'
        : isDocumentDesignerAgent(agent)
          ? 'document-designer'
          : roleKey;
      const resolvedStageLabel = parsedPlan?.roleLabels?.[agent.id]
        || parsedPlan?.roleLabels?.[agent.name]
        || parsedPlan?.roleLabels?.[String(agent.id || '').toLowerCase()]
        || parsedPlan?.roleLabels?.[specializedRoleKey]
        || (specializedRoleKey === roleKey ? parsedPlan?.roleLabels?.[roleKey] : '')
        || parsedPlan?.stageLabels?.[agent.id]
        || parsedPlan?.stageLabels?.[agent.name]
        || parsedPlan?.stageLabels?.[String(agent.id || '').toLowerCase()]
        || parsedPlan?.stageLabels?.[specializedRoleKey]
        || (specializedRoleKey === roleKey ? parsedPlan?.stageLabels?.[roleKey] : '')
        || '';
      if (resolvedStageLabel) normalizedStageLabels[agent.id] = resolvedStageLabel;

      const resolvedStageProvider = parsedPlan?.providers?.[agent.id]
        || parsedPlan?.providers?.[agent.name]
        || parsedPlan?.providers?.[String(agent.id || '').toLowerCase()]
        || parsedPlan?.providers?.[specializedRoleKey]
        || (specializedRoleKey === roleKey ? parsedPlan?.providers?.[roleKey] : '')
        || parsedPlan?.stageProviders?.[agent.id]
        || parsedPlan?.stageProviders?.[agent.name]
        || parsedPlan?.stageProviders?.[String(agent.id || '').toLowerCase()]
        || parsedPlan?.stageProviders?.[specializedRoleKey]
        || (specializedRoleKey === roleKey ? parsedPlan?.stageProviders?.[roleKey] : '')
        || '';
      if (resolvedStageProvider) normalizedStageProviders[agent.id] = resolvedStageProvider;

      const resolvedGoal = parsedPlan?.goals?.[agent.id]
        || parsedPlan?.goals?.[agent.name]
        || parsedPlan?.goals?.[String(agent.id || '').toLowerCase()]
        || parsedPlan?.goals?.[specializedRoleKey]
        || (specializedRoleKey === roleKey ? parsedPlan?.goals?.[roleKey] : '')
        || '';
      if (resolvedGoal) dynamicStageGoals[agent.id] = structureOptOut && roleKey === 'designer'
        && !isDocumentDesignerAgent(agent)
        ? 'אל תוסיף מבנה חדש. אם כבר יש במסמך כותרות או פרקים, רק שמור על עקביות ובהירות בלי להרחיב אותם.'
        : resolvedGoal;
    });

    return {
      ...fallbackPlan,
      summary: String(parsedPlan.summary || fallbackPlan.summary || '').trim(),
      orderedAgents: normalizedOrderedAgents,
      stageGoals: { ...fallbackPlan.stageGoals, ...dynamicStageGoals },
      stageLabels: normalizedStageLabels,
      stageProviders: normalizedStageProviders,
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
  const normalizedGoldenExample = String(profile.goldenExample || '').trim().replace(/\s+/g, ' ');
  const submissionDefaults = [
    profile.assignmentType ? `סוג מטלה: ${String(profile.assignmentType).trim()}` : '',
    profile.submissionDate ? `תאריך הגשה: ${String(profile.submissionDate).trim()}` : '',
    profile.studentId ? `מזהה מגיש: ${String(profile.studentId).trim()}` : '',
    profile.aiAssistanceDeclaration ? `הצהרת AI: ${String(profile.aiAssistanceDeclaration).trim()}` : '',
  ].filter(Boolean);
  const parts = [];
  if (profile.academic_level) parts.push(`רמת הכתיבה המועדפת: ${labels[profile.academic_level] || profile.academic_level}`);
  if (profile.displayName) parts.push(`שם המשתמש: ${String(profile.displayName).trim()}`);
  if (profile.userRole) parts.push(`תפקיד או סטטוס נוכחי: ${String(profile.userRole).trim()}`);
  if (profile.institutionName) parts.push(`מוסד לימודים או ארגון מרכזי: ${String(profile.institutionName).trim()}`);
  if (profile.studyTrack) parts.push(`מסלול, חוג או תחום עיקרי: ${String(profile.studyTrack).trim()}`);
  if (lecturerNames.length) parts.push(`מרצים או מנחים רלוונטיים: ${lecturerNames.join(', ')}`);
  if (currentCourses.length) parts.push(`קורסים או נושאי עיסוק עכשוויים: ${currentCourses.join(', ')}`);
  if (syllabusTopics.length) parts.push(`נושאי סילבוס, יחידות לימוד או דגשים מרכזיים: ${syllabusTopics.join(', ')}`);
  if (!omitStructuralHints && submissionDefaults.length) parts.push(`פרטי הגשה ברירת מחדל לשימוש כשמתבקשים עמוד שער או פרטי מסירה: ${submissionDefaults.join(' | ')}`);
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

export const buildPortablePrompt = (options = {}) => {
  const sharedInstructions = typeof options.sharedInstructions === 'string'
    ? String(options.sharedInstructions || '').trim()
    : getSharedAgentInstructions();
  const personalStylePrompt = buildPersonalStyleInstructions(options.profile || getPersonalStyleProfile(), {
    omitStructuralHints: options.omitStructuralHints === true,
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

const withTimeout = async (promise, timeoutMs, onTimeout) => {
  const safeTimeoutMs = Number(timeoutMs);
  if (!Number.isFinite(safeTimeoutMs) || safeTimeoutMs <= 0) return promise;

  let timerId = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timerId = window.setTimeout(() => {
          try { onTimeout?.(); } catch {}
          reject(new Error(`הבקשה ארכה יותר מדי זמן (${Math.round(safeTimeoutMs / 1000)} שניות)`));
        }, safeTimeoutMs);
      }),
    ]);
  } finally {
    if (timerId !== null) window.clearTimeout(timerId);
  }
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

const shouldPreservePriorDocumentFromManagerReview = (deliverable = '', previousDocument = '') => {
  const normalizedDeliverable = normalizeArtifactText(deliverable);
  const normalizedPrevious = normalizeArtifactText(previousDocument);
  if (!normalizedPrevious) return false;
  if (!normalizedDeliverable) return true;

  return /(?:^|\n)(?:MISSING|DECISION|CHECKLIST)\s*:/i.test(normalizedDeliverable);
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
  const managerRequired = !runSkippedAutomation && automation?.enabled !== false && ['manager-auto', 'circular-team'].includes(runWorkflowMode) && automation?.autopilotEnabled !== false;
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

export const callOpenAICompatible = async (baseUrl, apiKey, model, messages, signal) => {
  const url = baseUrl.replace(/\/$/, '') + '/chat/completions';
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const bodyStr = JSON.stringify({ model, messages, max_tokens: 4096, stream: false });

  // ב-Electron: נשלח דרך main process כדי לעקוף CORS
  const desktopResult = await proxyDesktopHttpRequest({ url, method: 'POST', headers, body: bodyStr }, signal);
  if (desktopResult) {
    const result = desktopResult;
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

  const desktopResult = await proxyDesktopHttpRequest({ url, method: 'POST', headers, body: bodyStr }, signal);
  if (desktopResult) {
    const result = desktopResult;
    if (!result.ok) {
      throw new Error(`Claude API (${result.status}): ${String(result.body || '').slice(0, 300)}`);
    }
    const data = JSON.parse(result.body);
    return data.content?.[0]?.text || '';
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
  return data.content?.[0]?.text || '';
};

// ═══════════════════════════════════════
// Universal Chat — routes by active provider
// ═══════════════════════════════════════
export const chatWithActiveProvider = async (userPrompt, documentContext = '', extraSystemPrompt = '', options = {}) => {
  const cfg = options.providerConfigOverride && typeof options.providerConfigOverride === 'object'
    ? normalizeProviderConfig(options.providerConfigOverride)
    : getProviderConfig();
  const taggedRouting = extractTaggedModelRouting(userPrompt);
  const cleanUserPrompt = taggedRouting.cleanText || String(userPrompt || '').trim();
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
  const activeProvider = strictProviderOverride
    ? options.providerOverride
    : options.providerOverride
    || (preferredProviders.length
      ? taggedProviderInPool
      : (taggedProviders.length ? taggedProviderInPool : ''))
    || configuredSelectedProviders[0]
    || selectedProviders[0]
    || cfg.active;
  const taggedModelOverride = strictProviderOverride
    ? ''
    : taggedRouting.providerModels?.[activeProvider]
    || (preferredProviders.length ? '' : taggedRouting.taggedModel);
  const modelOverride = options.modelOverride || taggedModelOverride || '';
  const skipSkillSelection = options.skipSkillSelection === true;
  const skipAutomationPrompt = options.skipAutomationPrompt === true;
  const omitPersonalStyleStructureHints = options.omitPersonalStyleStructureHints === true;
  const personalStylePrompt = buildPersonalStyleInstructions(getPersonalStyleProfile(), {
    omitStructuralHints: omitPersonalStyleStructureHints,
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
  const responseModePrompt = buildResponseModePrompt({ strictFormatting: options.strictFormatting === true });
  const appMemoryPrompt = options.includeAppMemory === false ? '' : buildAppMemoryInstructions(getAppMemory());
  const automation = getWorkspaceAutomation();
  const onStatus = options.onStatus;
  const agentLabel = options.agentLabel || 'הסוכן הראשי';
  const agentName = options.agentName || agentLabel;
  const requestTimeoutSeconds = Number(automation.requestTimeoutMs);
  const timeoutMs = automation.timeoutEnabled === true && Number.isFinite(requestTimeoutSeconds) && requestTimeoutSeconds > 0
    ? Math.max(10000, requestTimeoutSeconds * 1000)
    : 0;
  const retries = automation.retryEnabled === false ? 0 : Math.max(0, Number(automation.maxRetries || 0));
  const effectiveRetries = activeProvider === 'gemini' ? 0 : retries;
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
אם מבקשים מקור אקדמי — נסה קודם להחזיר מקורות קונקרטיים עם metadata usable: כותרת, מחבר או גוף מפרסם, שנה, וקישור או DOI אם זמין. אם לא נמצאו מספיק מקורות, כתוב במפורש מה נמצא ומה עדיין חסר, ורק אז הוסף כיווני חיפוש, מילות חיפוש או חוקרים/נושאים רלוונטיים כהשלמה. אם אין ודאות, אל תמציא ציטוטים או פרטים.
אם המשתמש מבקש תוכן חדש שמיועד למסמך, כתוב רק את התוכן עצמו כדי שיהיה קל להוסיף למסמך.
עדיפות ראשונה: מה שהמשתמש ביקש מפורשות ומה שמופיע בחומרי העזר — ההגדרות המובנות (תבנית, מסלול, קהל יעד) הן רקע עוזר בלבד ולא מחליפות את המטלה.
כשמחזירים מסמך מלא, טיוטה, או תוכן שמיועד במפורש להדבקה למסמך, השתמש ב-HTML מעוצב עם h1, h2, h3, p, ul, ol, strong, em לפי ההקשר. אם המשתמש לא ביקש מסמך מובנה או תוכן להדבקה, אל תכפה היררכיית כותרות או מבנה HTML מיותר.
כאשר צריך לבצע הפרדת עמודים, החזר בדיוק את קטע ה-HTML הבא בלבד בשורה נפרדת: <div data-type="page-break"></div>.${extraSystemPrompt ? `\n\nהנחיית תפקיד:\n${extraSystemPrompt}` : ''}${skillPrompt ? `\n\nסקיל נבחר:\n${skillPrompt}` : ''}${sharedInstructions ? `\n\nהנחיות משותפות לפרויקט:\n${sharedInstructions}` : ''}${workspaceAutomationPrompt ? `\n\nתיאום צוות AI:\n${workspaceAutomationPrompt}` : ''}${personalStylePrompt ? `\n\nהעדפות סגנון אישיות:\n${personalStylePrompt}` : ''}${appMemoryPrompt ? `\n\nזיכרון אפליקציה וסוכן:\n${appMemoryPrompt}` : ''}${documentContext ? `\n\nהקשר מהמסמך:\n${documentContext.slice(0, 8000)}` : ''}${responseModePrompt ? `\n\nכללי מטלה וצורת מענה:\n${responseModePrompt}` : ''}`;

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
        maxRoundsPerAgent,
        minRoundsPerAgent,
        decisionMode,
      });

      let stagedOutput = '';
      let processedStages = 0;
      let pendingFinalManagerReview = executionPlan?.needsFinalManagerReview === true;
      let finalManagerReviewPasses = 0;
      let notesAlreadyAppended = false;
      let lastManagerReviewPacket = null;
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
          const allowedStageProviders = getConfiguredProviderPool(cfg, automationPreferredProviders);
          const normalizedRequestedProvider = resolveExplicitProviderCandidate([
            executionPlan?.stageProviders?.[stageAgent.id],
            executionPlan?.stageProviders?.[stageAgent.name],
            executionPlan?.stageProviders?.[String(stageAgent.id || '').toLowerCase()],
            executionPlan?.stageProviders?.[stageRoutingKey],
          ], allowedStageProviders, cfg);
          const stageProvider = normalizedRequestedProvider || chooseProviderForAgent(stageAgent, cfg, automationPreferredProviders);
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
          agentNotesInstruction,
          collectAgentNotes: appendAgentNotesToOutput,
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
          const stageSystemPrompt = isManagerReviewAgent(stageAgent)
            ? `${stageAgent.prompt}\nבשלב ביקורת ניהולית DELIVERABLE חייב להיות המסמך המלא והמעודכן בלבד. הערות, פערים ותיקוני חובה שייכים ל-HANDOFF / MISSING / CHECKLIST. גם אם צריך לעצור או לבקש REVISIT, אל תחזיר פסקת מטא במקום המסמך המלא.\nהחזר בתבנית DELIVERABLE / HANDOFF / MISSING / DECISION / CHECKLIST בלבד.`
            : `${stageAgent.prompt}\nהחזר בתבנית DELIVERABLE / HANDOFF / MISSING / DECISION / CHECKLIST בלבד.`;
          const previousStageOutput = stagedOutput;
          const stageReply = await chatWithActiveProvider(stagePrompt, documentContext, stageSystemPrompt, {
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
          const rawStageArtifact = String(parsedReply.deliverable || '').trim();
          const stageArtifact = isManagerReviewAgent(stageAgent) && shouldPreservePriorDocumentFromManagerReview(rawStageArtifact, previousStageOutput)
            ? String(previousStageOutput || '').trim()
            : rawStageArtifact;
          const effectiveParsedReply = stageArtifact === rawStageArtifact
            ? parsedReply
            : { ...parsedReply, deliverable: stageArtifact };
          if (stageArtifact !== rawStageArtifact) {
            logEvent('stage-artifact-fallback', 'ביקורת ניהולית החזירה פלט מטא; נשמר המסמך המלא האחרון כ-DELIVERABLE', {
              state: 'success',
              agentId: stageAgent.id,
              agentLabel: stageLabel,
              agentName: stageAgent.name || stageLabel,
              provider: stageProvider,
              model: stageAgent.model || getModelNameForProvider(stageProvider, cfg, modelOverride),
              stageIndex: processedStages + 1,
              stageTotal: maxStageCount,
              roundIndex: runCount,
              outputPreview: trimLogText(rawStageArtifact || stageReply || ''),
            });
          }
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
            provider: stageProvider,
            model: stageAgent.model || getModelNameForProvider(stageProvider, cfg, modelOverride),
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
        const allowedFinalReviewBudget = maxRoundsPerAgent + (isPlanningManagerAgent(managerAgent) ? 1 : 0);
        if (((agentRunCounts[managerAgent.id] || 0) + nextFinalManagerReviewPass) > allowedFinalReviewBudget) {
          throw new Error('סקירת manager סופית חרגה ממגבלת הסבבים המותרת עבור אותו סוכן.');
        }
        finalManagerReviewPasses = nextFinalManagerReviewPass;
        const managerRoleKey = isManagerReviewAgent(managerAgent) ? 'manager-review' : getAgentRoleKey(managerAgent);
        const allowedReviewProviders = getConfiguredProviderPool(cfg, automationPreferredProviders);
        const normalizedReviewProvider = resolveExplicitProviderCandidate([
          executionPlan?.stageProviders?.['manager-review'],
          executionPlan?.stageProviders?.[managerAgent.id],
          executionPlan?.stageProviders?.[managerAgent.name],
          executionPlan?.stageProviders?.[String(managerAgent.id || '').toLowerCase()],
          executionPlan?.stageProviders?.[managerRoleKey],
        ], allowedReviewProviders, cfg);
        const reviewProvider = normalizedReviewProvider || chooseProviderForAgent(managerAgent, cfg, automationPreferredProviders);
        const reviewPrompt = buildStagePrompt({
          cleanUserPrompt,
          stageGoal: 'בצע סקירה סופית כמנהל עבודה. ודא שהמסמך עומד בדרישות, שהכותב נשען על החומרים, ושאין פערים לוגיים או ניסוחיים. DELIVERABLE חייב להיות המסמך המלא והמעודכן בלבד; הערות, חוסרים ותיקוני חובה שייכים ל-HANDOFF / MISSING / CHECKLIST.',
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

        const previousManagerOutput = stagedOutput;
        const managerReply = await chatWithActiveProvider(reviewPrompt, documentContext, `${managerAgent.prompt}\nזהו שלב בדיקה סופי לפני החזרה למשתמש. DELIVERABLE חייב להיות המסמך המלא והמעודכן בלבד. הערות, חוסרים ותיקוני חובה שייכים ל-HANDOFF / MISSING / CHECKLIST. גם אם צריך לעצור או לבקש REVISIT, אל תחזיר פסקת מטא במקום המסמך המלא. החזר בתבנית DELIVERABLE / HANDOFF / MISSING / DECISION / CHECKLIST בלבד.`, {
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
        const rawManagerArtifact = String(parsedManagerReply.deliverable || '').trim();
        const managerArtifact = shouldPreservePriorDocumentFromManagerReview(rawManagerArtifact, previousManagerOutput)
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
            provider: reviewProvider,
            model: managerAgent.model || getModelNameForProvider(reviewProvider, cfg, modelOverride),
            outputPreview: trimLogText(rawManagerArtifact || managerReply || ''),
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
            provider: reviewProvider,
            model: managerAgent.model || getModelNameForProvider(reviewProvider, cfg, modelOverride),
            outputPreview: trimLogText(managerArtifact || managerReply || ''),
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
          if (processedStages >= maxStageCount || finalManagerReviewPasses >= maxRoundsPerAgent) {
            logEvent('stage-revisit-required', 'סקירת המנהל דרשה סבב נוסף אך ה-workflow כבר הגיע למגבלת הסבבים', {
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
        pendingFinalManagerReview = false;
        if (effectiveManagerReply.handoff) batonNotes.push(`${managerAgent.name}: ${effectiveManagerReply.handoff.replace(/\n+/g, ' ; ')}`);
        while (batonNotes.length > 10) batonNotes.shift();
      }

      let finalOutput = String(stagedOutput || cleanUserPrompt).trim();
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
  const explicitProviderOverride = String(runtimeOptions.providerOverride || '').trim();
  const strictProviderOverride = runtimeOptions.strictProviderOverride === true && Boolean(explicitProviderOverride);
  const providerOverride = strictProviderOverride
    ? explicitProviderOverride
    : chooseProviderForAgent(agent, cfg, selectedProviders);
  return chatWithActiveProvider(userPrompt, documentContext, agent.prompt, {
    providerOverride,
    strictProviderOverride,
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

export const getProviderModelChoices = (providerId = '', cfg = null, extraModels = []) => {
  const safeProvider = String(providerId || '').trim();
  if (!safeProvider || !KNOWN_PROVIDER_IDS.includes(safeProvider)) return [];

  const safeCfg = cfg && typeof cfg === 'object' ? cfg : getProviderConfig();
  const configuredModel = normalizeProviderModelName(safeProvider, String(safeCfg?.[safeProvider]?.model || '').trim());
  const extra = (Array.isArray(extraModels) ? extraModels : [extraModels])
    .map((model) => normalizeProviderModelName(safeProvider, String(model || '').trim()))
    .filter(Boolean);
  const fallbacks = (PROVIDER_MODEL_FALLBACKS[safeProvider] || [])
    .map((model) => normalizeProviderModelName(safeProvider, model))
    .filter(Boolean);

  return [...new Set([configuredModel, ...extra, ...fallbacks].filter(Boolean))];
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
