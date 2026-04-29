import {
  chatWithActiveProvider,
  getPersonalStyleProfile,
  savePersonalStyleProfile,
  logAgentDebugEvent,
  getOrderedRoleAgents,
  getWorkspaceAutomation,
  syncPersistedAppSettings,
} from './aiService';

const HISTORY_KEY = 'wordai_saved_docs_history';
const HOME_INSTRUCTIONS_KEY = 'wordai_home_instructions';
const PAST_DOCS_INDEX_URL = 'PAST-DOC/index.json';
const PROJECT_MATERIALS_INDEX_URL = 'project-materials/index.json';
const MAX_HISTORY_ITEMS = 24;
const AUTO_CONTEXT_SOURCE_LIMIT = 3;
const CONTEXT_MATCH_MIN_TERM_LENGTH = 3;

const textLikeExtensions = new Set(['txt', 'md', 'markdown', 'html', 'htm', 'json', 'docx']);
const HEBREW_STOP_WORDS = new Set(['של', 'על', 'עם', 'זה', 'זאת', 'היא', 'הוא', 'הם', 'הן', 'אני', 'אתה', 'את', 'אנחנו', 'גם', 'אבל', 'או', 'אם', 'כי', 'כל', 'לא', 'כן', 'כך', 'מאוד', 'עוד', 'רק', 'כדי', 'היה', 'היו', 'יש', 'אין', 'אל', 'מן', 'אלו', 'אלה']);
export const MATERIAL_UPLOAD_PRESETS = {
  general: { id: 'general', label: 'קובץ עזר כללי', category: 'general', templateId: 'blank', learningHint: 'השתמש בקובץ הזה כהקשר כללי להעדפות המשתמש.' },
  'cover-page': { id: 'cover-page', label: 'דף שער לדוגמה', category: 'office', templateId: 'blank', learningHint: 'למד איך המשתמש אוהב לעצב דפי שער, כותרות ראשיות, שדות וזיהוי מוסד.' },
  'template-example': { id: 'template-example', label: 'תבנית מסמך לדוגמה', category: 'office', templateId: 'report', learningHint: 'למד את המבנה, סדר הפרקים והעיצוב שהמשתמש מעדיף למסמכים.' },
  'writing-sample': { id: 'writing-sample', label: 'דוגמת כתיבה אישית', category: 'academic', templateId: 'academic', learningHint: 'למד את הטון, אוצר המילים והניסוח האישי של המשתמש.' },
  'course-material': { id: 'course-material', label: 'חומר קורס או רקע', category: 'academic', templateId: 'summary', learningHint: 'השתמש בקובץ כדי להבין את עולם התוכן, המושגים והדרישות האקדמיות.' },
};

export function getMaterialUploadMeta(kind = 'general') {
  return MATERIAL_UPLOAD_PRESETS[String(kind || 'general')] || MATERIAL_UPLOAD_PRESETS.general;
}
const COMMON_CONNECTORS = ['לכן', 'בנוסף', 'עם זאת', 'עם-זאת', 'כמו כן', 'לעומת זאת', 'עם-כן', 'כלומר', 'למעשה', 'בהתאם לכך', 'בסופו של דבר'];
const MANUAL_HISTORY_SOURCES = new Set(['manual', 'opened-file', 'save-local', 'save-as']);
const DOCUMENT_RUN_PROVIDER_LABELS = {
  gemini: 'Gemini',
  claude: 'Claude',
  perplexity: 'Perplexity',
  openai: 'ChatGPT',
  groq: 'Groq',
  ollama: 'Ollama',
  custom: 'Custom API',
  scholar: 'Google Scholar',
};

function mergeCountMaps(base = {}, incoming = {}) {
  const next = { ...base };
  Object.entries(incoming || {}).forEach(([key, count]) => {
    if (!key) return;
    next[key] = (next[key] || 0) + Number(count || 0);
  });
  return next;
}

function subtractCountMaps(base = {}, incoming = {}) {
  const next = { ...base };
  Object.entries(incoming || {}).forEach(([key, count]) => {
    if (!key || !next[key]) return;
    const updated = Number(next[key] || 0) - Number(count || 0);
    if (updated > 0) next[key] = updated;
    else delete next[key];
  });
  return next;
}

function topMapKeys(map = {}, limit = 8) {
  return Object.entries(map || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

function shouldUseDocumentWorkflowAutomation({ automation = {}, directStructureLock = false } = {}) {
  if (directStructureLock) return false;
  const activeWorkflowAgents = getOrderedRoleAgents(automation?.workflowMode);
  const hasActiveWorkflowAgents = Array.isArray(activeWorkflowAgents) && activeWorkflowAgents.length > 0;
  return automation?.enabled === true
    && automation?.autoDispatch !== false
    && hasActiveWorkflowAgents;
}

function getDocumentRunLabel({ automation = {}, selectedModel = '', directStructureLock = false, shouldUseWorkflowAutomation = null } = {}) {
  const providerLabel = DOCUMENT_RUN_PROVIDER_LABELS[String(selectedModel || '').trim().toLowerCase()] || String(selectedModel || '').trim();
  const useWorkflowAutomation = typeof shouldUseWorkflowAutomation === 'boolean'
    ? shouldUseWorkflowAutomation
    : shouldUseDocumentWorkflowAutomation({ automation, directStructureLock });
  if (!useWorkflowAutomation) return providerLabel || 'יצירה ישירה';
  if (automation?.workflowMode === 'manager-auto' && automation?.autopilotEnabled !== false) return 'AUTOPILOT';
  return String(automation?.workspaceName || '').trim() || 'צוות העבודה';
}

function classifySentenceLength(avg = 0) {
  if (avg >= 18) return 'משפטים ארוכים ומפורטים';
  if (avg >= 11) return 'משפטים באורך בינוני';
  return 'משפטים קצרים וישירים';
}

function classifyParagraphLength(avg = 0) {
  if (avg >= 90) return 'פסקאות ארוכות ומעמיקות';
  if (avg >= 45) return 'פסקאות באורך בינוני';
  return 'פסקאות קצרות ותמציתיות';
}

function analyzeTextSample(text = '') {
  const clean = String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\r\t]+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const paragraphs = clean.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const sentences = clean.split(/[.!?…]+\s+/).map((item) => item.trim()).filter(Boolean);
  const words = clean.match(/[\u0590-\u05FFA-Za-z][\u0590-\u05FFA-Za-z'"׳״-]*/g) || [];

  const vocabularyCounts = {};
  const phraseCounts = {};
  const openerCounts = {};
  const connectorCounts = {};

  const filteredWords = words
    .map((word) => word.replace(/^["'׳״-]+|["'׳״-]+$/g, '').toLowerCase())
    .filter((word) => word.length >= 3 && !HEBREW_STOP_WORDS.has(word));

  filteredWords.forEach((word) => {
    vocabularyCounts[word] = (vocabularyCounts[word] || 0) + 1;
  });

  for (let i = 0; i < filteredWords.length - 1; i += 1) {
    const phrase = `${filteredWords[i]} ${filteredWords[i + 1]}`;
    if (phrase.length >= 7) phraseCounts[phrase] = (phraseCounts[phrase] || 0) + 1;
  }

  sentences.forEach((sentence) => {
    const sentenceWords = sentence.match(/[\u0590-\u05FFA-Za-z][\u0590-\u05FFA-Za-z'"׳״-]*/g) || [];
    if (sentenceWords.length) {
      const opener = sentenceWords.slice(0, Math.min(2, sentenceWords.length)).join(' ');
      if (opener.length >= 3) openerCounts[opener] = (openerCounts[opener] || 0) + 1;
    }
    COMMON_CONNECTORS.forEach((connector) => {
      if (sentence.includes(connector)) connectorCounts[connector] = (connectorCounts[connector] || 0) + 1;
    });
  });

  const avgSentenceWords = sentences.length
    ? Math.round((words.length / sentences.length) * 10) / 10
    : 0;

  const avgParagraphWords = paragraphs.length
    ? Math.round((words.length / paragraphs.length) * 10) / 10
    : 0;

  return {
    vocabularyCounts,
    phraseCounts,
    openerCounts,
    connectorCounts,
    avgSentenceWords,
    avgParagraphWords,
    sentencesCount: sentences.length,
    paragraphCount: paragraphs.length,
    wordCount: words.length,
  };
}

export function learnFromDocumentDraft({ html = '', title = 'מסמך פעיל', minChars = 280 } = {}) {
  const profile = getPersonalStyleProfile();
  if (profile.learningConsent === false) return { updated: false, reason: 'disabled' };

  const cleanText = String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleanText.length < minChars) return { updated: false, reason: 'too-short' };

  const stats = analyzeTextSample(cleanText);
  if (stats.wordCount < 80 || stats.sentencesCount < 3) return { updated: false, reason: 'insufficient-sample' };

  const signature = [
    String(title || '').trim(),
    stats.wordCount,
    stats.avgSentenceWords,
    stats.avgParagraphWords,
    topMapKeys(stats.openerCounts, 3).join('|'),
    topMapKeys(stats.connectorCounts, 3).join('|'),
  ].join('::');

  if (signature === profile.lastAutoLearnedSignature) return { updated: false, reason: 'duplicate' };

  const baseVocabularyCounts = subtractCountMaps(profile.learnedVocabularyCounts || {}, profile.autoLearnedVocabularyCounts || {});
  const basePhraseCounts = subtractCountMaps(profile.learnedPhraseCounts || {}, profile.autoLearnedPhraseCounts || {});
  const nextVocabularyCounts = mergeCountMaps(baseVocabularyCounts, stats.vocabularyCounts);
  const nextPhraseCounts = mergeCountMaps(basePhraseCounts, stats.phraseCounts);
  const nextSentenceLength = classifySentenceLength(stats.avgSentenceWords);
  const nextParagraphLength = classifyParagraphLength(stats.avgParagraphWords);
  const toneDescriptors = Array.from(new Set([
    ...(profile.toneDescriptors || []),
    nextSentenceLength,
    nextParagraphLength,
    Object.keys(stats.connectorCounts || {}).length >= 3 ? 'שימוש עשיר במילות קישור' : 'ניסוח ישיר יחסית',
  ].filter(Boolean))).slice(0, 8);

  const learnedNotes = Array.from(new Set([
    ...(profile.learnedNotes || []),
    `עודכן אוטומטית מהמסמך הפעיל: ${nextSentenceLength}, ${nextParagraphLength}.`,
  ])).slice(-8);

  const nextProfile = {
    ...profile,
    learnedVocabularyCounts: nextVocabularyCounts,
    learnedPhraseCounts: nextPhraseCounts,
    learnedVocabulary: topMapKeys(nextVocabularyCounts, 20),
    learnedPhrases: topMapKeys(nextPhraseCounts, 12),
    preferredConnectors: Array.from(new Set([...(profile.preferredConnectors || []), ...topMapKeys(stats.connectorCounts, 8)])).slice(0, 8),
    preferredSentenceOpeners: Array.from(new Set([...(profile.preferredSentenceOpeners || []), ...topMapKeys(stats.openerCounts, 8)])).slice(0, 8),
    toneDescriptors,
    learnedSentencePatterns: toneDescriptors,
    sentenceLengthPreference: profile.sentenceLengthPreference || nextSentenceLength,
    paragraphLengthPreference: profile.paragraphLengthPreference || nextParagraphLength,
    styleFingerprint: {
      ...(profile.styleFingerprint || {}),
      avgSentenceWords: stats.avgSentenceWords,
      avgParagraphWords: stats.avgParagraphWords,
      sentenceCount: stats.sentencesCount,
      paragraphCount: stats.paragraphCount,
    },
    autoLearnedFromEditorAt: new Date().toISOString(),
    lastAutoLearnedSignature: signature,
    autoLearnedVocabularyCounts: stats.vocabularyCounts,
    autoLearnedPhraseCounts: stats.phraseCounts,
    learnedNotes,
  };

  savePersonalStyleProfile(nextProfile);
  try {
    window.dispatchEvent(new CustomEvent('wordai-personal-style-updated', { detail: { source: 'auto-learning' } }));
  } catch {}
  return { updated: true, reason: 'learned', profile: nextProfile };
}

const TEMPLATE_GUIDES = {
  blank: 'צור מסמך חופשי, ברור ונקי.',
  academic: 'ענה על המטלה האקדמית בדיוק לפי הוראות המטלה והנחיות המשתמש, בלי לכפות מבנה קבוע שלא התבקש.',
  legal: 'ענה על המטלה המשפטית או הפורמלית לפי הוראות המטלה והחומר הקיים, בלי להמציא פרטים חסרים.',
  report: 'ענה על המטלה בפורמט של דוח רק לפי המטרה וההוראות שהתבקשו, עם כותרות רק כשיש להן הצדקה ברורה, ואל תוסיף מבוא, סיכום או פרקים קבועים שלא התבקשו.',
  summary: 'ענה על המטלה בפורמט של סיכום רק לפי ההיקף והמבנה שהתבקשו, ואל תמציא תוכן חסר.',
  office: 'ענה על המטלה כמסמך מקצועי למשרד או לארגון, ענייני וברור, ורק לפי המבנה שהתבקש.',
  letter: 'צור מכתב רשמי לפי פרטי הבקשה, בלי להשלים נתונים שלא נמסרו ובלי להוסיף חלקים שלא התבקשו.',
  proposal: 'ענה על המטלה בפורמט של הצעה רק לפי מטרת המשתמש וההוראות שניתנו, בלי לכפות סעיפים קבועים אם לא התבקשו.',
};

const WORKSPACE_TEMPLATE_LIBRARY = [
  { id: 'blank', title: 'מסמך ריק', subtitle: '' },
  { id: 'academic', title: 'עבודה אקדמית', subtitle: 'מבוסס על מטלות ועבודות קודמות' },
  { id: 'legal', title: 'מסמך משפטי', subtitle: 'מבוסס על מסמכים פורמליים קודמים' },
  { id: 'report', title: 'דוח מסודר', subtitle: 'מבנה ממצאים והמלצות' },
  { id: 'summary', title: 'סיכום נושא', subtitle: 'לנקודות מפתח ותמצות' },
  { id: 'office', title: 'מסמך משרדי', subtitle: 'פנייה, מזכר או מסמך עבודה' },
  { id: 'proposal', title: 'הצעה', subtitle: 'מטרות, מהלך ותוצרים' },
  { id: 'letter', title: 'מכתב רשמי', subtitle: 'פתיחה, גוף וסיום' },
];

function readJsonFromStorage(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeName(name = '') {
  return String(name || '').trim().toLowerCase();
}

function resolveAppUrl(resourcePath = '') {
  const cleanPath = String(resourcePath || '').replace(/^\/+/, '');
  try {
    return new URL(cleanPath, window.location.href).toString();
  } catch {
    return `./${cleanPath}`;
  }
}

export function classifyDocName(name = '') {
  const value = normalizeName(name);
  if (!value) return { category: 'general', label: 'כללי', templateId: 'blank' };

  if (/(פרקליטות|משפט|חוק|עתירה|תביעה|כתב|פסק|הסכם)/i.test(value)) {
    return { category: 'legal', label: 'משפטי', templateId: 'legal' };
  }
  if (/(עבודה|מטלה|סמינר|מחקר|אקדמ|אוריינות|יסודות|תקשורת|הונגריה|קוסובו)/i.test(value)) {
    return { category: 'academic', label: 'אקדמי', templateId: 'academic' };
  }
  if (/(סיכום|תמצית|נקודות|סיכומי)/i.test(value)) {
    return { category: 'summary', label: 'סיכום', templateId: 'summary' };
  }
  if (/(משרד|דו"ח|דוח|מזכר|memo|report)/i.test(value)) {
    return { category: 'office', label: 'משרדי', templateId: 'office' };
  }
  if (/(מכתב|פניה|פנייה|letter)/i.test(value)) {
    return { category: 'letter', label: 'מכתב', templateId: 'letter' };
  }
  return { category: 'general', label: 'כללי', templateId: 'blank' };
}

async function safeFetchJson(url, fallback) {
  try {
    const response = await fetch(resolveAppUrl(url), { cache: 'no-store' });
    if (!response.ok) return fallback;
    return await response.json();
  } catch {
    return fallback;
  }
}

export async function loadPastDocsIndex() {
  const payload = await safeFetchJson(PAST_DOCS_INDEX_URL, { files: [] });
  const files = Array.isArray(payload?.files) ? payload.files : [];
  return files.map((file) => ({
    ...file,
    ...classifyDocName(file.name),
    source: 'past-docs',
  }));
}

export async function getWorkspaceTemplateCards() {
  const [pastDocs, history] = await Promise.all([loadPastDocsIndex(), Promise.resolve(getSavedDocsHistory())]);
  const combined = [...pastDocs, ...history];

  const cards = WORKSPACE_TEMPLATE_LIBRARY.map((card) => {
    const matches = combined.filter((item) => {
      if (card.id === 'blank') return (item.templateId || 'blank') === 'blank';
      if (card.id === 'report') return ['office', 'report'].includes(item.templateId) || item.category === 'office';
      if (card.id === 'proposal') return ['proposal', 'office'].includes(item.templateId) || item.category === 'office';
      return item.templateId === card.id || item.category === card.id;
    });

    return {
      ...card,
      count: matches.length,
      example: matches[0]?.title || matches[0]?.name || '',
      examples: matches.slice(0, 3).map((item) => item.title || item.name).filter(Boolean),
      subtitle: matches.length ? card.subtitle : '',
    };
  });

  const [blankCard, ...rest] = cards;
  return [blankCard, ...rest.sort((a, b) => b.count - a.count)];
}

export async function loadProjectMaterials() {
  const [bundledPayload, localPayload] = await Promise.all([
    safeFetchJson(PROJECT_MATERIALS_INDEX_URL, []),
    window.desktopApp?.listLocalMaterials ? window.desktopApp.listLocalMaterials().catch(() => []) : Promise.resolve([]),
  ]);

  const bundledList = Array.isArray(bundledPayload) ? bundledPayload : [];
  const localList = Array.isArray(localPayload) ? localPayload : [];
  const mergedList = [...bundledList, ...localList].filter(Boolean);
  const seen = new Set();

  return mergedList
    .filter((item) => {
      const key = String(item.id || item.file || item.title || '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item, index) => {
      const name = item.title || item.file || `material-${index + 1}`;
      const type = String(item.type || '').toLowerCase();
      const inferred = classifyDocName(name);
      return {
        id: item.id || item.file || `material-${index + 1}`,
        title: name,
        file: item.file || '',
        type,
        source: item.source || 'materials',
        uploadKind: item.uploadKind || 'general',
        label: item.label || inferred.label,
        category: item.category || inferred.category,
        templateId: item.templateId || inferred.templateId,
        learningHint: item.learningHint || '',
        canPreviewText: textLikeExtensions.has(type) || type === 'pdf',
      };
    });
}

export function getSavedDocsHistory() {
  return readJsonFromStorage(HISTORY_KEY, []);
}

export function saveDocumentHistory({ title = '', content = '', templateId = 'blank', source = 'manual' }) {
  const plainText = String(content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!plainText) return [];

  const current = getSavedDocsHistory();
  const entryTitle = String(title || plainText.slice(0, 60) || 'מסמך חדש').trim();
  const entry = {
    id: `${Date.now()}`,
    title: entryTitle,
    summary: plainText.slice(0, 400),
    templateId,
    source,
    category: classifyDocName(entryTitle).category,
    savedAt: new Date().toISOString(),
  };

  const next = [entry, ...current].slice(0, MAX_HISTORY_ITEMS);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    syncPersistedAppSettings();
  } catch {
    return current;
  }
  return next;
}

export function getHomeInstructions() {
  return String(localStorage.getItem(HOME_INSTRUCTIONS_KEY) || '');
}

export function saveHomeInstructions(value = '') {
  const clean = String(value || '').trim();
  localStorage.setItem(HOME_INSTRUCTIONS_KEY, clean);
  syncPersistedAppSettings();
}

function dominantCategoryFromItems(items = []) {
  const counts = items.reduce((acc, item) => {
    const key = item.category || 'general';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'general';
}

export async function syncLearnedStyleFromWorkspace() {
  const [pastDocs, history, projectMaterials] = await Promise.all([
    loadPastDocsIndex(),
    Promise.resolve(getSavedDocsHistory()),
    loadProjectMaterials(),
  ]);

  const learnableHistory = history.filter((item) => MANUAL_HISTORY_SOURCES.has(String(item?.source || 'manual')));
  const combined = [...pastDocs, ...learnableHistory, ...projectMaterials];
  const dominantCategory = dominantCategoryFromItems(combined);
  const profile = getPersonalStyleProfile();
  const alreadyScanned = new Set(profile.scannedSourceIds || []);

  const sourceItems = [
    ...learnableHistory.map((item) => ({
      id: `history:${item.id}`,
      title: item.title || 'טיוטה שמורה',
      text: `${item.title || ''}\n${item.summary || ''}`.trim(),
    })),
    ...projectMaterials.map((item) => ({
      id: `material:${item.id}`,
      title: item.title || item.file || 'material',
      material: item,
    })),
  ];

  const preparedSources = [];
  for (const source of sourceItems) {
    if (source.material) {
      const preview = await loadMaterialPreview(source.material);
      preparedSources.push({
        id: source.id,
        title: source.title,
        text: preview || [
          source.title,
          source.material.label || '',
          source.material.learningHint || '',
        ].filter(Boolean).join('\n'),
      });
      continue;
    }
    preparedSources.push(source);
  }

  if (profile.learningConsent === false) {
    const nextProfile = {
      ...profile,
      learnedNotes: Array.from(new Set([
        ...(profile.learnedNotes || []),
        'הלמידה האוטומטית כבויה כרגע, ולכן המערכת נשענת רק על ההעדפות שבחרת ידנית.',
      ])).slice(0, 8),
      scanStats: {
        ...(profile.scanStats || {}),
        totalKnown: preparedSources.length,
        totalScanned: profile.scanStats?.totalScanned || 0,
        newlyScanned: 0,
        pendingCount: preparedSources.length,
        lastScanAt: new Date().toISOString(),
      },
    };
    savePersonalStyleProfile(nextProfile);
    return { pastDocs, history, projectMaterials, dominantCategory, notes: nextProfile.learnedNotes, scanStats: nextProfile.scanStats, profile: nextProfile };
  }

  const newlyDiscoveredSources = preparedSources.filter((source) => !alreadyScanned.has(source.id));
  let vocabularyCounts = { ...(profile.learnedVocabularyCounts || {}) };
  let phraseCounts = { ...(profile.learnedPhraseCounts || {}) };

  newlyDiscoveredSources.forEach((source) => {
    const stats = analyzeTextSample(source.text);
    vocabularyCounts = mergeCountMaps(vocabularyCounts, stats.vocabularyCounts);
    phraseCounts = mergeCountMaps(phraseCounts, stats.phraseCounts);
  });

  const overallStats = analyzeTextSample(preparedSources.map((source) => source.text).join('\n\n'));
  const toneDescriptors = Array.from(new Set([
    ...(profile.toneDescriptors || []),
    classifySentenceLength(overallStats.avgSentenceWords),
    classifyParagraphLength(overallStats.avgParagraphWords),
    Object.keys(overallStats.connectorCounts || {}).length >= 3 ? 'שימוש עשיר במילות קישור' : 'ניסוח ישיר יחסית',
  ].filter(Boolean)));

  const notes = [];
  if (dominantCategory === 'academic') notes.push('רוב המסמכים הקודמים הם אקדמיים: השתמש בשפה מדויקת ובטיעון מסודר, אך אל תוסיף מבנה פרקים קבוע אלא אם התבקשת.');
  if (combined.some((item) => item.category === 'legal')) notes.push('נמצאו גם מסמכים משפטיים או פורמליים, ולכן בפניות רשמיות יש להעדיף ניסוח זהיר, מדויק ומאופק.');
  if (combined.some((item) => item.category === 'office')) notes.push('נמצאו גם מסמכים משרדיים, לכן כשנושא העבודה מקצועי יש להעדיף תכליתיות, סעיפים קצרים והמלצות מעשיות.');
  if (combined.some((item) => item.category === 'summary')) notes.push('נמצאו מסמכי סיכום, ולכן אפשר להעדיף ניסוח תמציתי ומדויק כשזה מתאים לבקשה, בלי לכפות נקודות מפתח או סיכומי ביניים אם לא התבקשו.');
  if (topMapKeys(overallStats.connectorCounts, 4).length) notes.push(`מילות קישור בולטות: ${topMapKeys(overallStats.connectorCounts, 4).join(', ')}.`);
  if (topMapKeys(overallStats.openerCounts, 4).length) notes.push(`פתיחות משפט אופייניות: ${topMapKeys(overallStats.openerCounts, 4).join(', ')}.`);
  if (newlyDiscoveredSources.length) notes.push(`נסרקו ${newlyDiscoveredSources.length} מקורות חדשים ונוספו מאפייני סגנון.`);

  const nextScannedIds = Array.from(new Set([...(profile.scannedSourceIds || []), ...newlyDiscoveredSources.map((source) => source.id)]));
  const nextProfile = {
    ...profile,
    academic_level: dominantCategory === 'academic' ? (profile.academic_level || 'undergraduate') : profile.academic_level,
    learnedNotes: Array.from(new Set([...(profile.learnedNotes || []), ...notes])).slice(-8),
    examples: Array.from(new Set([...(profile.examples || []), ...combined.slice(0, 8).map((item) => item.title || item.name).filter(Boolean)])).slice(0, 8),
    learnedVocabularyCounts: vocabularyCounts,
    learnedPhraseCounts: phraseCounts,
    learnedVocabulary: topMapKeys(vocabularyCounts, 20),
    learnedPhrases: topMapKeys(phraseCounts, 12),
    learnedSentencePatterns: Array.from(new Set([...(profile.learnedSentencePatterns || []), ...toneDescriptors])).slice(0, 8),
    preferredConnectors: Array.from(new Set([...(profile.preferredConnectors || []), ...topMapKeys(overallStats.connectorCounts, 8)])).slice(0, 8),
    preferredSentenceOpeners: Array.from(new Set([...(profile.preferredSentenceOpeners || []), ...topMapKeys(overallStats.openerCounts, 8)])).slice(0, 8),
    toneDescriptors,
    sentenceLengthPreference: profile.sentenceLengthPreference || classifySentenceLength(overallStats.avgSentenceWords),
    paragraphLengthPreference: profile.paragraphLengthPreference || classifyParagraphLength(overallStats.avgParagraphWords),
    styleFingerprint: {
      ...(profile.styleFingerprint || {}),
      avgSentenceWords: overallStats.avgSentenceWords,
      avgParagraphWords: overallStats.avgParagraphWords,
      sentenceCount: overallStats.sentencesCount,
      paragraphCount: overallStats.paragraphCount,
    },
    scannedSourceIds: nextScannedIds,
    scanStats: {
      totalKnown: preparedSources.length,
      totalScanned: nextScannedIds.length,
      newlyScanned: newlyDiscoveredSources.length,
      pendingCount: Math.max(0, preparedSources.length - nextScannedIds.length),
      lastScanAt: new Date().toISOString(),
    },
  };

  savePersonalStyleProfile(nextProfile);
  try {
    window.dispatchEvent(new CustomEvent('wordai-personal-style-updated', { detail: { source: 'workspace-sync' } }));
  } catch {}
  return { pastDocs, history, projectMaterials, dominantCategory, notes, scanStats: nextProfile.scanStats, profile: nextProfile };
}

async function extractPdfTextFromBuffer(buffer) {
  const pdfjs = window?.pdfjsLib;
  if (!pdfjs?.getDocument) return '';
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages = [];
  for (let pageNo = 1; pageNo <= Math.min(pdf.numPages, 5); pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const pageText = (content.items || []).map((item) => item.str || '').join(' ');
    if (pageText.trim()) pages.push(pageText.trim());
  }
  return pages.join('\n');
}

function decodeTextBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  const tryDecode = (encoding) => {
    try {
      return new TextDecoder(encoding, { fatal: false }).decode(bytes);
    } catch {
      return '';
    }
  };

  const utf8Text = tryDecode('utf-8');
  const replacementCount = (utf8Text.match(/�/g) || []).length;
  const badRatio = utf8Text ? replacementCount / utf8Text.length : 0;

  if (badRatio > 0.02 || /PK\u0003\u0004/.test(utf8Text)) {
    const win1255 = tryDecode('windows-1255');
    if (win1255 && (win1255.match(/[א-ת]/g) || []).length >= (utf8Text.match(/[א-ת]/g) || []).length) {
      return win1255;
    }
    const iso88598 = tryDecode('iso-8859-8');
    if (iso88598 && (iso88598.match(/[א-ת]/g) || []).length > 0) {
      return iso88598;
    }
  }

  return utf8Text;
}

export async function readInstructionFile(file, maxLength = 6000) {
  if (!file) return '';
  const resolvedMaxLength = Number.isFinite(maxLength) && maxLength > 0 ? maxLength : 6000;
  const ext = String(file.name || '').toLowerCase().split('.').pop();
  const unsupportedBinary = new Set(['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'zip', 'rar', '7z']);
  if (unsupportedBinary.has(ext)) {
    throw new Error('unsupported-binary-file');
  }

  const buffer = await file.arrayBuffer();

  if (ext === 'pdf') {
    const pdfText = await extractPdfTextFromBuffer(buffer);
    if (!pdfText.trim()) throw new Error('empty-pdf-text');
    return pdfText.trim().slice(0, resolvedMaxLength);
  }

  const rawText = decodeTextBuffer(buffer);
  if (ext === 'html' || ext === 'htm') {
    const parsed = new DOMParser().parseFromString(rawText, 'text/html');
    parsed.querySelectorAll('script, style, noscript, template').forEach((node) => node.remove());
    const bodyText = String(parsed.body?.textContent || parsed.body?.innerText || '').trim();
    const fallbackText = String(parsed.documentElement?.textContent || parsed.documentElement?.innerText || '').trim();
    return (bodyText || fallbackText).slice(0, resolvedMaxLength);
  }

  return String(rawText || '').trim().slice(0, resolvedMaxLength);
}

async function loadMaterialPreview(material) {
  if (!material?.file || !material?.canPreviewText) return '';
  try {
    if (material.source === 'materials-local' && window.desktopApp?.readLocalMaterial) {
      const payload = await window.desktopApp.readLocalMaterial(material.file);
      if (!payload?.ok || !payload?.dataBase64) return '';
      if (payload?.extractedText && material.type !== 'pdf') {
        return String(payload.extractedText || '').slice(0, 5000);
      }
      if (material.type === 'docx') return '';
      const binary = atob(payload.dataBase64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const buffer = bytes.buffer;

      if (material.type === 'pdf') {
        return (await extractPdfTextFromBuffer(buffer)).slice(0, 5000);
      }

      const text = decodeTextBuffer(buffer);
      return text.slice(0, 5000);
    }

    const response = await fetch(resolveAppUrl(`project-materials/${encodeURIComponent(material.file)}`), { cache: 'no-store' });
    if (!response.ok) return '';

    if (material.type === 'pdf') {
      const buffer = await response.arrayBuffer();
      return (await extractPdfTextFromBuffer(buffer)).slice(0, 5000);
    }

    if (material.type === 'docx') {
      return '';
    }

    const buffer = await response.arrayBuffer();
    const text = decodeTextBuffer(buffer);
    return text.slice(0, 5000);
  } catch {
    return '';
  }
}

async function buildSelectedMaterialsContext(selectedMaterials = []) {
  if (!Array.isArray(selectedMaterials) || !selectedMaterials.length) return '';

  const materialPreviews = await Promise.all(selectedMaterials.map(async (item) => ({
    ...item,
    preview: await loadMaterialPreview(item),
  })));

  return materialPreviews.map((item) => {
    const preview = item.preview ? `\nתוכן עזר:\n${item.preview}` : '';
    return `- ${item.title} (${item.label || 'כללי'})${preview}`;
  }).join('\n');
}

function extractContextMatchTerms(text = '') {
  const terms = String(text || '').toLowerCase().match(/[\u0590-\u05ffa-z0-9][\u0590-\u05ffa-z0-9'"׳״-]*/g) || [];
  return Array.from(new Set(
    terms
      .map((term) => term.replace(/^["'׳״-]+|["'׳״-]+$/g, ''))
      .filter((term) => term.length >= CONTEXT_MATCH_MIN_TERM_LENGTH && !HEBREW_STOP_WORDS.has(term)),
  ));
}

function countContextTermOverlap(text = '', requestTermsSet = new Set()) {
  if (!requestTermsSet.size) return 0;
  return extractContextMatchTerms(text).reduce((count, term) => count + (requestTermsSet.has(term) ? 1 : 0), 0);
}

function scoreAutoContextCandidate({ title = '', summary = '', label = '', learningHint = '' } = {}, requestTermsSet = new Set()) {
  if (!requestTermsSet.size) return 0;
  const titleOverlap = countContextTermOverlap(title, requestTermsSet);
  const labelOverlap = countContextTermOverlap(label, requestTermsSet);
  const hintOverlap = countContextTermOverlap(learningHint, requestTermsSet);
  const summaryOverlap = countContextTermOverlap(summary, requestTermsSet);
  return (titleOverlap * 4) + (labelOverlap * 3) + (hintOverlap * 2) + summaryOverlap;
}

function formatAutoContextEntry({ title = '', label = '', preview = '' } = {}) {
  const cleanTitle = String(title || '').trim() || 'חומר עזר';
  const cleanLabel = String(label || '').trim() || 'כללי';
  const cleanPreview = String(preview || '').trim();
  return `- ${cleanTitle} (${cleanLabel})${cleanPreview ? `\nתוכן עזר:\n${cleanPreview}` : ''}`;
}

async function buildAutoSelectedMaterialsContext(requestText = '') {
  const requestTerms = extractContextMatchTerms(requestText);
  if (!requestTerms.length) return '';

  try {
    const requestTermsSet = new Set(requestTerms);
    const [history, projectMaterials] = await Promise.all([
      Promise.resolve(getSavedDocsHistory()),
      loadProjectMaterials(),
    ]);

    const historyCandidates = (Array.isArray(history) ? history : []).map((item, index) => {
      const score = scoreAutoContextCandidate({
        title: item?.title,
        summary: item?.summary,
      }, requestTermsSet);

      if (!score) return null;
      return {
        id: `history:${item?.id || index}`,
        score,
        rankHint: Number(new Date(item?.savedAt || 0)) || 0,
        title: item?.title || 'מסמך שמור',
        label: 'מסמך קודם',
        preview: [item?.title || '', item?.summary || ''].filter(Boolean).join('\n'),
      };
    }).filter(Boolean);

    const materialCandidates = (Array.isArray(projectMaterials) ? projectMaterials : []).map((item, index) => {
      const score = scoreAutoContextCandidate({
        title: item?.title,
        label: item?.label,
        learningHint: item?.learningHint,
      }, requestTermsSet);

      if (!score) return null;
      return {
        id: `material:${item?.id || index}`,
        score,
        rankHint: 0,
        title: item?.title || item?.file || `material-${index + 1}`,
        label: item?.label || 'כללי',
        material: item,
      };
    }).filter(Boolean);

    const topCandidates = [...historyCandidates, ...materialCandidates]
      .sort((left, right) => right.score - left.score || right.rankHint - left.rankHint || String(left.title || '').localeCompare(String(right.title || ''), 'he'))
      .slice(0, AUTO_CONTEXT_SOURCE_LIMIT);

    if (!topCandidates.length) return '';

    const preparedCandidates = await Promise.all(topCandidates.map(async (candidate) => {
      if (!candidate.material) return candidate;

      const preview = await loadMaterialPreview(candidate.material);
      return {
        ...candidate,
        preview: preview || [candidate.material?.title || candidate.title, candidate.material?.label || candidate.label, candidate.material?.learningHint || ''].filter(Boolean).join('\n'),
      };
    }));

    return preparedCandidates.map((item) => formatAutoContextEntry(item)).join('\n');
  } catch {
    return '';
  }
}

async function buildEffectiveMaterialsContext({ selectedMaterials = [], requestText = '', allowAutoSelection = false } = {}) {
  if (Array.isArray(selectedMaterials) && selectedMaterials.length) {
    return buildSelectedMaterialsContext(selectedMaterials);
  }

  if (!allowAutoSelection) {
    return '';
  }

  return buildAutoSelectedMaterialsContext(requestText);
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function blankLine(count = 1) {
  return Array.from({ length: count }, () => '<p>&nbsp;</p>').join('');
}

function buildTemplateHeader({ label = '', heading = '', detailLines = [] } = {}) {
  return [
    label ? `<p>${label}</p>` : '',
    `<h1>${heading}</h1>`,
    ...detailLines.filter(Boolean).map((line) => `<p>${line}</p>`),
    '<hr />',
  ].join('');
}

export function buildTemplateSkeleton(templateId = 'blank', title = '', examples = []) {
  const safeTitle = escapeHtml(title || '');
  const defaultHeadings = {
    blank: 'מסמך חדש',
    academic: 'כותרת העבודה',
    legal: 'כותרת המסמך המשפטי',
    report: 'כותרת הדוח',
    summary: 'כותרת הסיכום',
    office: 'כותרת המסמך המשרדי',
    proposal: 'כותרת ההצעה',
    letter: 'נושא המכתב',
  };
  const heading = safeTitle || defaultHeadings[templateId] || defaultHeadings.blank;

  void examples;

  const templates = {
    blank: `<h1>${heading}</h1><p>נושא / מטרה: ____________</p>${blankLine(3)}`,
    academic: `${buildTemplateHeader({
      label: 'עבודה אקדמית',
      heading,
      detailLines: ['מסלול / קורס: ____________', 'מגיש/ה: ____________', 'תאריך: ____________'],
    })}<h2>מסגרת העבודה</h2>${blankLine(1)}<h2>גוף הטקסט</h2>${blankLine(3)}`,
    legal: `${buildTemplateHeader({
      label: 'מסמך משפטי',
      heading,
      detailLines: ['לכבוד: ____________', 'הנדון: ____________', 'תאריך: ____________'],
    })}<h2>נוסח המסמך</h2>${blankLine(3)}<p>בכבוד רב,</p>${blankLine(2)}`,
    report: `${buildTemplateHeader({
      label: 'דוח מסודר',
      heading,
      detailLines: ['נערך עבור: ____________', 'תאריך: ____________'],
    })}<h2>מטרת הדוח</h2>${blankLine(1)}<h2>ממצאים</h2>${blankLine(2)}<h2>המשך טיפול</h2>${blankLine(1)}`,
    summary: `${buildTemplateHeader({
      label: 'סיכום נושא',
      heading,
      detailLines: ['נושא: ____________'],
    })}<h2>עיקרי הדברים</h2><ul><li>&nbsp;</li><li>&nbsp;</li><li>&nbsp;</li></ul><h2>השלמות</h2>${blankLine(1)}`,
    office: `${buildTemplateHeader({
      label: 'מסמך משרדי',
      heading,
      detailLines: ['אל: ____________', 'מאת: ____________', 'תאריך: ____________'],
    })}<h2>פרטי המסמך</h2>${blankLine(1)}<h2>לביצוע / טיפול</h2>${blankLine(2)}`,
    proposal: `${buildTemplateHeader({
      label: 'הצעה',
      heading,
      detailLines: ['מוגש ל: ____________', 'תאריך: ____________'],
    })}<h2>מה מוצע</h2>${blankLine(1)}<h2>פירוט</h2>${blankLine(2)}<h2>תיאום והשלמות</h2>${blankLine(1)}`,
    letter: `${buildTemplateHeader({
      label: 'מכתב רשמי',
      heading,
      detailLines: ['לכבוד: ____________', 'הנדון: ____________', 'תאריך: ____________'],
    })}<p>שלום רב,</p>${blankLine(2)}<p>בברכה,</p>${blankLine(2)}`,
  };

  return templates[templateId] || templates.blank;
}

function buildFallbackTemplateShell(templateId = 'blank', title = '') {
  const safeTitle = escapeHtml(title || '');
  const heading = safeTitle ? safeTitle : 'כותרת המסמך';
  const fallbackLabel = {
    academic: 'עבודה אקדמית',
    legal: 'מסמך משפטי',
    report: 'דוח מסודר',
    summary: 'סיכום נושא',
    office: 'מסמך משרדי',
    proposal: 'הצעה',
    letter: 'מכתב רשמי',
  };

  if (templateId === 'blank') {
    return `<h1>${heading}</h1>${blankLine(4)}`;
  }

  const label = fallbackLabel[templateId] || 'מסמך';

  return `<p>${label}</p><h1>${heading}</h1>${blankLine(4)}`;
}

function extractInstructionTitleCandidate(instructions = '') {
  const lines = String(instructions || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const preferredLine = lines.find((line, index) => index > 0 || !/^קובץ\s+הנחיות\s*:/i.test(line)) || lines[0] || '';

  return preferredLine
    .replace(/^(?:[-*]+|\d+[.)])\s+/, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:!?-]+|[\s,;:!?-]+$/g, '')
    .trim();
}

function resolveGenerationRequestContext({ prompt = '', instructions = '', templateId = 'blank' } = {}) {
  const cleanPrompt = String(prompt || '').trim();
  const cleanInstructions = String(instructions || '').trim();
  const title = cleanPrompt
    || extractInstructionTitleCandidate(cleanInstructions)
    || ({
      blank: 'מסמך חדש',
      academic: 'עבודה אקדמית',
      legal: 'מסמך משפטי',
      report: 'דוח מסודר',
      summary: 'סיכום נושא',
      office: 'מסמך משרדי',
      proposal: 'הצעה',
      letter: 'מכתב רשמי',
    }[templateId] || 'מסמך חדש');

  return { cleanPrompt, cleanInstructions, title };
}

function buildLocalDraft(prompt, templateId, instructions, selectedMaterials) {
  const structurePolicy = detectDocumentStructurePolicy({ prompt, instructions });
  const { title } = resolveGenerationRequestContext({ prompt, instructions, templateId });
  const preferPlainFallback = structurePolicy.noStructure || structurePolicy.flowingText || structurePolicy.followAssignmentSections;
  const promptContext = escapeHtml(
    String(prompt || '')
      .replace(LOCAL_STRUCTURE_DIRECTIVE_PATTERN, ' ')
      .replace(LOCAL_NO_INTRO_PATTERN, ' ')
      .replace(LOCAL_NO_SUMMARY_PATTERN, ' ')
      .replace(LOCAL_NO_HEADINGS_PATTERN, ' ')
      .replace(LOCAL_FLOWING_WRITING_PATTERN, ' ')
      .replace(LOCAL_ASSIGNMENT_SECTION_PATTERN, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s,;:!?-]+|[\s,;:!?-]+$/g, '')
      .trim()
  );
  const fallbackContext = promptContext || escapeHtml(title);
  const statusBlock = `
    <div style="border:1px solid #fecaca;background:#fff7f7;padding:12px 14px;border-radius:10px;margin:10px 0;">
      <p><strong>שים לב:</strong> ה-AI לא החזיר מסמך מלא בהרצה הזאת.</p>
      <p>נוצר שלד מקומי לעריכה, וניתן לבדוק את הסיבה במסך ההגדרות תחת יומן הלוגים.</p>
      ${instructions ? '<p>הנחיות המשתמש נשמרו למערכת, אך אינן מודבקות למסמך עצמו.</p>' : ''}
    </div>
  `;
    const refsList = selectedMaterials.length
      ? `<ul>${selectedMaterials.map((item) => `<li>${escapeHtml(item.title)}</li>`).join('')}</ul>`
      : '';
  const refs = selectedMaterials.length
      ? `<h2>חומרי עזר שנבחרו</h2>${refsList}`
    : '';
  const renderedRefs = structurePolicy.noHeadings ? refsList : refs;
  const fallbackShell = repairGeneratedHtmlForStructurePolicy(buildFallbackTemplateShell(templateId, title), structurePolicy);

  return preferPlainFallback
    ? `${statusBlock}${fallbackContext ? `<p>${fallbackContext}</p>` : ''}${blankLine(4)}${refsList}`
    : `${statusBlock}${fallbackShell}${renderedRefs}`;
}

function normalizeGeneratedHtmlResponse(response = '') {
  return String(response || '')
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function normalizeJsonOnlyResponse(response = '') {
  return String(response || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function tryParseJsonObjectResponse(response = '') {
  const text = String(response || '').trim();
  if (!text) return null;

  const candidates = [];
  const addCandidate = (value = '') => {
    const candidate = String(value || '').trim();
    if (!candidate || candidates.includes(candidate)) return;
    candidates.push(candidate);
  };

  addCandidate(text);
  addCandidate(normalizeJsonOnlyResponse(text));

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) addCandidate(fencedMatch[1]);

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) addCandidate(text.slice(firstBrace, lastBrace + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {}
  }

  return null;
}

function normalizeReviewSuggestionText(value = '', fallback = '') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function normalizeReviewSuggestionsPayload(payload = null) {
  if (!payload || typeof payload !== 'object') return null;

  const rawSuggestions = Array.isArray(payload.suggestions)
    ? payload.suggestions
    : Array.isArray(payload.recommendations)
      ? payload.recommendations
      : [];

  const suggestions = rawSuggestions
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;

      const title = normalizeReviewSuggestionText(item.title || item.heading || item.name, `המלצה ${index + 1}`);
      const reason = normalizeReviewSuggestionText(item.reason || item.why || item.rationale);
      const suggestedChange = normalizeReviewSuggestionText(item.suggestedChange || item.change || item.recommendedEdit || item.suggestion);
      if (!reason && !suggestedChange) return null;

      return {
        title,
        reason: reason || 'כדאי לחדד את הנקודה הזאת כדי לשפר את הקריאות והדיוק.',
        suggestedChange: suggestedChange || reason,
      };
    })
    .filter(Boolean)
    .slice(0, 6);

  const summary = normalizeReviewSuggestionText(
    payload.summary || payload.overview || payload.message || payload.shortSummary,
    suggestions.length ? 'נמצאו כמה המלצות קצרות לשיפור הטיוטה.' : '',
  );

  if (!summary && !suggestions.length) return null;
  return { summary, suggestions };
}

function buildDocumentReviewFallback({ focusText = '', errorMessage = '' } = {}) {
  return {
    summary: focusText
      ? 'לא הצלחתי להכין כרגע המלצות עריכה למוקד שביקשת. אפשר לנסות שוב או לשלוח עדכון ישיר.'
      : 'לא הצלחתי להכין כרגע המלצות עריכה לטיוטה. אפשר לנסות שוב או לשלוח עדכון ישיר.',
    suggestions: [],
    usedFallback: true,
    errorMessage: String(errorMessage || '').trim(),
  };
}

const LOCAL_STRUCTURE_DIRECTIVE_PATTERN = /(?:^|[\s,;:!?])(?:בלי\s+מבנה(?:\s+בכלל)?|ללא\s+מבנה(?:\s+בכלל)?|אין\s+צורך\s+במבנה(?:\s+בכלל)?|בלי\s+שלד(?:\s+בכלל)?|ללא\s+שלד(?:\s+בכלל)?|בלי\s+שלד\s+אקדמי|ללא\s+שלד\s+אקדמי|בלי\s+outline(?:\s+בכלל)?|ללא\s+outline(?:\s+בכלל)?|בלי\s+כותרות\s+בכלל|ללא\s+כותרות\s+בכלל|בלי\s+פרקים\s+בכלל|ללא\s+פרקים\s+בכלל|no\s+structure(?:\s+at\s+all)?|without\s+structure|no\s+outline|without\s+outline|without\s+an?\s+outline|no\s+headings\s+at\s+all|without\s+headings(?:\s+entirely)?|no\s+sections\s+at\s+all|without\s+sections(?:\s+entirely)?)/i;
const LOCAL_NO_INTRO_PATTERN = /(?:בלי|ללא)\s+מבוא|(?:בלי|ללא)\s+פתיח|לא\s+צריך\s+מבוא|ללא\s+פתיחה|בלי\s+פתיחה|no\s+intro(?:duction)?|without\s+an?\s+intro(?:duction)?/i;
const LOCAL_NO_SUMMARY_PATTERN = /(?:בלי|ללא)\s+סיכום|(?:בלי|ללא)\s+מסקנות|לא\s+צריך\s+סיכום|לא\s+צריך\s+מסקנות|no\s+summary|without\s+summary|no\s+conclusion|without\s+conclusion/i;
const LOCAL_NO_HEADINGS_PATTERN = /(?:בלי|ללא)\s+כותר(?:ת|ות)|(?:בלי|ללא)\s+ראשי\s+פרקים|(?:בלי|ללא)\s+כותרות\s+ביניים|no\s+headings|without\s+headings/i;
const LOCAL_FLOWING_WRITING_PATTERN = /(?:כתיבה|ניסוח|טקסט)\s+זור(?:ם|מת)|(?:בלי|ללא)\s+ראשי\s+פרקים\s+אלא\s+כתיבה\s+זורמת|flowing\s+writing|continuous\s+prose|running\s+text/i;
const LOCAL_ASSIGNMENT_SECTION_PATTERN = /לפי\s+סעיפי\s+המטלה|לפי\s+סעיפי\s+המשימה|רק\s+לפי\s+סעיפי\s+המטלה|סעיפי\s+המטלה\s+בלבד|follow\s+the\s+assignment\s+sections|according\s+to\s+the\s+assignment\s+sections/i;
const LEADING_GENERIC_INTRO_HEADING_PATTERN = /^(?:מבוא|פתיחה|פתח\s+דבר|רקע(?:\s+כללי)?)$/i;
const TRAILING_GENERIC_SUMMARY_HEADING_PATTERN = /^(?:סיכום(?:\s+כללי)?(?:\s+ומסקנות)?|סיכום\s+והמלצות|סיכום\s+דברים|דברי\s+סיכום|מסקנ(?:ה|ות)(?:\s+כלליות)?(?:\s+והמלצות)?|סיום|דברי\s+סיום|summary(?:\s+and\s+(?:conclusions?|recommendations?))?|conclusion(?:s)?(?:\s+and\s+recommendations?)?|concluding\s+remarks|closing\s+remarks|final\s+remarks|final\s+thoughts)$/i;
const TRAILING_SUMMARY_LIKE_BLOCK_PATTERN = /^(?:לסיכום|בסיכומו\s+של\s+דבר|בסופו\s+של\s+דבר|מן\s+האמור(?:\s+לעיל)?|לאור\s+האמור(?:\s+לעיל)?|ניתן\s+לסכם|נוכל\s+לסכם|סיכום(?:\s+והמלצות)?(?:\s*:)?|מסקנ(?:ה|ות)(?:\s+(?:כלליות|והמלצות))?(?:\s*:)?|המסקנ(?:ה|ות)(?:\s+העיקרי(?:ת|ות))?(?:\s+ה(?:יא|ן))?|in\s+summary|to\s+summari[sz]e|to\s+sum\s+up|summary(?:\s+and\s+recommendations?)?\b|in\s+conclusion|conclusion(?:s)?(?:\s+and\s+recommendations?)?\b|concluding\s+remarks|closing\s+remarks|final\s+remarks|final\s+thoughts)/i;
const TRAILING_AMBIGUOUS_SUMMARY_CUE_PATTERN = /^(?:לסיום(?:(?=\s*$)|(?=\s*[:;,.!?-])|(?:\s+(?:נציין|נאמר|נסכם|נדגיש|יודגש|נזכיר|ראוי\s+לציין|חשוב\s+לציין)\b))|to\s+conclude(?:(?=\s*$)|(?=\s*[:;,.!?-])|(?:\s+(?:we\s+(?:note|can\s+say|see|emphasize|recap)|it\s+is\s+clear|the\s+(?:main\s+point|conclusion)\s+is)\b)))/i;
const TRAILING_OPERATIONAL_AMBIGUOUS_SUMMARY_CONTINUATION_PATTERN = /^(?:לסיום|to\s+conclude)\s*[:;,.!?-]?\s*(?:(?:יש|על(?:יך|יכם|ינו|יהם|יהן)?|נדרש(?:ת|ים|ות)?|נא|אנא)\s+(?:לצרף|להגיש|לשלוח|להעביר|למלא|להשלים|לוודא|לעדכן|להוסיף|לכלול|לבצע|לפנות|להמציא)(?=$|[\s,;:.!?-])|please\s+(?:attach|include|submit|send|provide|complete|fill|ensure|update)\b|you\s+(?:should|must|need\s+to)\s+(?:attach|include|submit|send|provide|complete|fill|ensure|update)\b)/i;
const TRAILING_EXPLICIT_NON_SUMMARY_BLOCK_PATTERN = /^(?:בברכה|בכבוד(?:\s+רב)?|בברכת\s+הצלחה|לשאלות(?:\s+נוספות)?|לפרטים(?:\s+נוספים)?|למידע(?:\s+נוסף)?|ליצירת\s+קשר|מוזמנים\s+לפנות|ניתן\s+לפנות|צרו\s+קשר|נשמח\s+(?:לסייע|לעמוד\s+לרשותכם)|for\s+(?:more\s+information|questions)|feel\s+free\s+to\s+contact|contact\s+us|reach\s+out)/i;
const TRAILING_OPERATIONAL_FOLLOW_UP_BLOCK_PATTERN = /^(?:next\s+steps?|action\s+items?|implementation\s+steps?|follow-?up\s+steps?|צעדים\s+הבאים|צעדי\s+המשך|שלבי\s+המשך|פעולות\s+המשך)\b/i;
const TRAILING_CONTACT_DETAILS_PATTERN = /(?:@|https?:\/\/|www\.|(?:טלפון|טל:|נייד|דוא"ל|אימייל|email|e-mail|phone|mobile|contact))/i;
const TRAILING_SUFFIX_FOLLOW_UP_PATTERN = /(?:^|\s)(?:מנהל(?:ת)?|רכז(?:ת)?|אגף|מחלקה|יחידה|חוג|משרד|פקולטה|תוכנית|התוכנית|המחלקה|director|manager|coordinator|department|office|program|programme|faculty|team)\b/i;
const SUMMARY_OWNED_RECOMMENDATIONS_HEADING_PATTERN = /^(?:המלצות(?:\s+(?:מעשיות|להמשך|לביצוע))?|צעדים\s+הבאים|צעדי\s+המשך|שלבי\s+המשך|recommendations?|recommended\s+actions?|next\s+steps?|action\s+items?)$/i;
const TRAILING_REPAIR_TOKEN_PATTERN = /<!--[\s\S]*?-->|<h([1-6])\b[^>]*>[\s\S]*?<\/h\1>|<p\b[^>]*>[\s\S]*?<\/p>|<ul\b[^>]*>[\s\S]*?<\/ul>|<ol\b[^>]*>[\s\S]*?<\/ol>|<blockquote\b[^>]*>[\s\S]*?<\/blockquote>|<div\b[^>]*>[\s\S]*?<\/div>/gi;
const FIXED_SCAFFOLD_HEADING_PATTERN = /^(?:מבוא|פתיחה|פתח\s+דבר|רקע(?:\s+כללי)?|רקע\s+תיאורטי|דיון|גוף\s+העבודה|סיכום(?:\s+ומסקנות)?|מסקנות)$/i;

function detectDocumentStructurePolicy({ prompt = '', instructions = '' } = {}) {
  const combinedText = [String(prompt || '').trim(), String(instructions || '').trim()].filter(Boolean).join('\n');
  const noStructure = LOCAL_STRUCTURE_DIRECTIVE_PATTERN.test(combinedText);
  const noIntro = noStructure || LOCAL_NO_INTRO_PATTERN.test(combinedText);
  const flowingText = LOCAL_FLOWING_WRITING_PATTERN.test(combinedText);
  const noSummary = LOCAL_NO_SUMMARY_PATTERN.test(combinedText);
  const noHeadings = noStructure || flowingText || LOCAL_NO_HEADINGS_PATTERN.test(combinedText);
  const followAssignmentSections = LOCAL_ASSIGNMENT_SECTION_PATTERN.test(combinedText);
  const hasExplicitConstraints = noStructure || noIntro || noSummary || noHeadings || flowingText || followAssignmentSections;
  const directStructureLock = noStructure || noHeadings || flowingText || followAssignmentSections;
  return {
    combinedText,
    noStructure,
    noIntro,
    noSummary,
    noHeadings,
    flowingText,
    followAssignmentSections,
    hasExplicitConstraints,
    directStructureLock,
    structureLock: directStructureLock,
  };
}

function buildStructureLockInstructions(policy = null) {
  if (!policy?.hasExplicitConstraints) return '';
  const lines = [
    'הוראות המבנה המפורשות של המשתמש גוברות על כל סקיל, workflow, template, personal style או ברירת מחדל אחרת.',
  ];
  if (policy.followAssignmentSections) {
    lines.push('ארגן את התוכן רק לפי סעיפי המטלה שסופקו. אל תוסיף מבוא, סיכום או שלד אקדמי קבוע על דעת עצמך.');
  }
  if (policy.flowingText || policy.noHeadings) {
    lines.push('העדף כתיבה זורמת. אל תכפה כותרות ביניים, ראשי פרקים או outline שלא התבקשו במפורש.');
  }
  if (policy.noIntro) {
    lines.push('אל תוסיף מבוא, פתיח, פתיחה, פתח דבר או רקע כללי אלא אם הם נדרשו מפורשות.');
  }
  if (policy.noSummary) {
    lines.push('אל תוסיף סיכום, מסקנות או פסקת סיום מסכמת אלא אם הן נדרשו מפורשות.');
  }
  if (policy.noStructure && !policy.followAssignmentSections) {
    lines.push('אל תוסיף שלד קשיח, חלוקה אקדמית קבועה או כותרות ברירת מחדל שלא הופיעו בבקשת המשתמש.');
  }
  return lines.join('\n');
}

function stripHtmlTags(value = '') {
  return String(value || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isIgnorableStructuralTailFragment(fragmentHtml = '', visibleText = '') {
  const fragment = String(fragmentHtml || '').trim();
  if (!fragment) return true;
  if (/^<!--[\s\S]*?-->$/i.test(fragment)) return true;
  if (!/^<div\b/i.test(fragment)) return false;
  if (/\bdata-type\s*=\s*["']page-break["']/i.test(fragment)) return true;
  return !visibleText;
}

function tokenizeTrailingRepairFragments(html = '') {
  const source = String(html || '');
  return Array.from(source.matchAll(TRAILING_REPAIR_TOKEN_PATTERN)).map((match) => {
    const raw = match[0] || '';
    const start = match.index || 0;
    const end = start + raw.length;
    const headingLevelMatch = raw.match(/^<h([1-6])\b/i);
    const tagMatch = raw.match(/^<([a-z0-9-]+)/i);
    const tagName = headingLevelMatch
      ? `h${headingLevelMatch[1]}`
      : (tagMatch ? String(tagMatch[1] || '').toLowerCase() : (raw.trim().startsWith('<!--') ? 'comment' : ''));
    const visibleText = stripHtmlTags(raw);
    return {
      raw,
      start,
      end,
      tagName,
      headingLevel: headingLevelMatch ? Number(headingLevelMatch[1]) : null,
      visibleText,
      isStructural: isIgnorableStructuralTailFragment(raw, visibleText),
    };
  });
}

function isTrailingRepairContentToken(token = null) {
  return Boolean(token && !token.isStructural && token.raw);
}

function hasMeaningfulVisibleText(visibleText = '') {
  const normalizedText = String(visibleText || '').trim();
  if (!normalizedText) return false;
  const substantiveText = normalizedText.replace(/[^\u0590-\u05FFA-Za-z0-9]+/g, '');
  const wordCount = (normalizedText.match(/[\u0590-\u05FFA-Za-z0-9][\u0590-\u05FFA-Za-z0-9'"׳״.-]*/g) || []).length;
  return substantiveText.length >= 4 || wordCount >= 2;
}

function isMeaningfulTrailingRepairToken(token = null) {
  if (!isTrailingRepairContentToken(token)) return false;
  return hasMeaningfulVisibleText(token.visibleText);
}

function findLastNonStructuralTokenIndex(tokens = [], endIndex = tokens.length) {
  const limit = Math.max(0, Math.min(typeof endIndex === 'number' ? endIndex : tokens.length, tokens.length));
  for (let index = limit - 1; index >= 0; index -= 1) {
    if (!tokens[index]?.isStructural) return index;
  }
  return -1;
}

function extractTokenRangeHtml(source = '', tokens = [], startIndex = -1, endIndex = -1) {
  if (startIndex < 0 || endIndex <= startIndex || !tokens[startIndex] || !tokens[endIndex - 1]) return '';
  return String(source || '').slice(tokens[startIndex].start, tokens[endIndex - 1].end).trim();
}

function normalizeJoinedHtmlFragments(fragments = []) {
  return fragments.filter(Boolean).join('\n').replace(/(?:\s*\n){3,}/g, '\n\n').trim();
}

function isSummaryHeadingToken(token = null) {
  return Boolean(token?.headingLevel) && TRAILING_GENERIC_SUMMARY_HEADING_PATTERN.test(String(token.visibleText || '').trim());
}

function isSummaryAnchorToken(token = null) {
  return isTrailingRepairContentToken(token)
    && !token.headingLevel
    && isClearlySummaryLikeTrailingBlock(token.raw);
}

function isSummaryClusterAnchorToken(token = null) {
  return isSummaryHeadingToken(token) || isSummaryAnchorToken(token);
}

function isOperationalAmbiguousSummaryContinuation(visibleText = '') {
  const normalizedText = String(visibleText || '').trim();
  return Boolean(normalizedText) && TRAILING_OPERATIONAL_AMBIGUOUS_SUMMARY_CONTINUATION_PATTERN.test(normalizedText);
}

function isSummaryOwnedRecommendationsHeadingToken(token = null) {
  return Boolean(token?.headingLevel)
    && SUMMARY_OWNED_RECOMMENDATIONS_HEADING_PATTERN.test(String(token.visibleText || '').trim());
}

function isClearlySummaryLikeTrailingBlock(blockHtml = '', headingText = '') {
  const visibleText = stripHtmlTags(blockHtml);
  if (!visibleText) return false;
  if (TRAILING_SUMMARY_LIKE_BLOCK_PATTERN.test(visibleText)) return true;
  if (isOperationalAmbiguousSummaryContinuation(visibleText)) return false;
  if (TRAILING_AMBIGUOUS_SUMMARY_CUE_PATTERN.test(visibleText)) return true;
  return /<(?:ul|ol)\b/i.test(String(blockHtml || ''))
    && /(?:סיכום|מסקנות|המלצות|סיום)/i.test(String(headingText || '').trim());
}

function isExplicitNonSummaryTrailingBlock(blockHtml = '', headingText = '') {
  const visibleText = stripHtmlTags(blockHtml);
  if (!visibleText) return false;
  if (isOperationalAmbiguousSummaryContinuation(visibleText)) return true;
  if (isClearlySummaryLikeTrailingBlock(blockHtml, headingText)) return false;
  return TRAILING_EXPLICIT_NON_SUMMARY_BLOCK_PATTERN.test(visibleText)
    || TRAILING_OPERATIONAL_FOLLOW_UP_BLOCK_PATTERN.test(visibleText)
    || TRAILING_CONTACT_DETAILS_PATTERN.test(visibleText);
}

function findSummaryLikeClusterAfterHeading(tokens = [], headingIndex = -1, endIndex = tokens.length) {
  if (headingIndex < 0 || !tokens[headingIndex]?.headingLevel) return null;

  const limit = Math.max(headingIndex + 1, Math.min(typeof endIndex === 'number' ? endIndex : tokens.length, tokens.length));
  const headingText = String(tokens[headingIndex].visibleText || '').trim();
  let clusterStart = -1;
  let clusterEnd = -1;
  let usedHeadingOwnedFallback = false;
  let adoptedRecommendationsSubheading = false;

  for (let index = headingIndex + 1; index < limit; index += 1) {
    const token = tokens[index];
    if (!token) break;
    if (token.isStructural) continue;
    if (token.headingLevel) {
      if (clusterStart === -1 && isSummaryOwnedRecommendationsHeadingToken(token)) {
        clusterStart = index;
        clusterEnd = index + 1;
        usedHeadingOwnedFallback = true;
        adoptedRecommendationsSubheading = true;
        continue;
      }
      break;
    }
    if (adoptedRecommendationsSubheading) {
      clusterEnd = index + 1;
      continue;
    }
    if (isExplicitNonSummaryTrailingBlock(token.raw, headingText)) break;

    const clearlySummaryLike = isClearlySummaryLikeTrailingBlock(token.raw, headingText);
    const canUseHeadingOwnedFallback = !usedHeadingOwnedFallback && clusterStart === -1 && isMeaningfulTrailingRepairToken(token);
    if (!clearlySummaryLike && !canUseHeadingOwnedFallback) break;

    if (clusterStart === -1) clusterStart = index;
    clusterEnd = index + 1;
    if (!clearlySummaryLike) usedHeadingOwnedFallback = true;
  }

  return clusterStart === -1
    ? null
    : { startIndex: clusterStart, endIndex: clusterEnd };
}

function hasMeaningfulRepairedContent(html = '') {
  const source = String(html || '').trim();
  if (!source) return false;
  const tokens = tokenizeTrailingRepairFragments(source);
  const suffixRange = tokens.length ? findTrailingExplicitNonSummarySuffixRange(tokens) : null;
  const preSuffixVisibleText = stripHtmlTags(suffixRange ? source.slice(0, tokens[suffixRange.startIndex].start) : source);
  if (hasMeaningfulVisibleText(preSuffixVisibleText)) return true;
  return hasMeaningfulVisibleText(stripHtmlTags(source));
}

function isTrailingExplicitNonSummaryFollowUpToken(token = null) {
  if (!isTrailingRepairContentToken(token)) return false;
  if (!/^(?:p|div|blockquote)$/i.test(String(token.tagName || ''))) return false;
  const visibleText = String(token.visibleText || '').trim();
  if (!visibleText || isClearlySummaryLikeTrailingBlock(token.raw)) return false;
  const wordCount = visibleText.split(/\s+/).filter(Boolean).length;
  return TRAILING_CONTACT_DETAILS_PATTERN.test(visibleText)
    || TRAILING_SUFFIX_FOLLOW_UP_PATTERN.test(visibleText)
    || (wordCount <= 6 && visibleText.length <= 80 && !/[.!?](?:\s|$)/.test(visibleText));
}

function findTrailingExplicitNonSummarySuffixRange(tokens = [], endIndex = tokens.length) {
  const limit = Math.max(0, Math.min(typeof endIndex === 'number' ? endIndex : tokens.length, tokens.length));
  const lastContentIndex = findLastNonStructuralTokenIndex(tokens, limit);
  if (lastContentIndex === -1) return null;

  let anchorIndex = -1;
  for (let index = lastContentIndex; index >= 0; index -= 1) {
    const token = tokens[index];
    if (!token) break;
    if (token.isStructural) continue;
    if (isExplicitNonSummaryTrailingBlock(token.raw)) {
      anchorIndex = index;
      continue;
    }
    if (!isTrailingExplicitNonSummaryFollowUpToken(token)) break;
  }

  return anchorIndex === -1
    ? null
    : { startIndex: anchorIndex, endIndex: lastContentIndex + 1 };
}

function findTrailingSummaryLikeClusterRange(tokens = [], endIndex = tokens.length, stopIndex = -1) {
  const limit = Math.max(0, Math.min(typeof endIndex === 'number' ? endIndex : tokens.length, tokens.length));
  const lastContentIndex = findLastNonStructuralTokenIndex(tokens, limit);
  if (lastContentIndex === -1) return null;

  let anchorIndex = -1;
  for (let index = lastContentIndex; index > stopIndex; index -= 1) {
    const token = tokens[index];
    if (!token) break;
    if (token.isStructural) continue;
    if (isSummaryClusterAnchorToken(token)) {
      anchorIndex = index;
      continue;
    }
    if (token.headingLevel) break;
    if (anchorIndex !== -1 && isMeaningfulTrailingRepairToken(token)) break;
  }

  return anchorIndex === -1
    ? null
    : { startIndex: anchorIndex, endIndex: lastContentIndex + 1 };
}

function findSummaryLikeClusterImmediatelyBeforeBoundary(tokens = [], boundaryIndex = -1, stopIndex = -1) {
  if (boundaryIndex <= 0 || !tokens[boundaryIndex]?.raw) return null;
  const range = findTrailingSummaryLikeClusterRange(tokens, boundaryIndex, stopIndex);
  return range ? { startIndex: range.startIndex, endIndex: boundaryIndex } : null;
}

function stripLeadingGenericIntroSection(html = '') {
  const source = String(html || '').trim();
  if (!source) return source;
  const headingMatches = Array.from(source.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi));
  if (!headingMatches.length) return source;

  const introIndex = headingMatches.findIndex((match, index) => {
    if (index > 1) return false;
    return LEADING_GENERIC_INTRO_HEADING_PATTERN.test(stripHtmlTags(match[2]));
  });
  if (introIndex === -1) return source;

  const introMatch = headingMatches[introIndex];
  const introStart = introMatch.index || 0;
  const introEnd = introStart + introMatch[0].length;
  const nextHeading = headingMatches[introIndex + 1];
  if (!nextHeading) {
    const introParagraphsMatch = source.slice(introEnd).match(/^(?:\s*<p\b[^>]*>[\s\S]*?<\/p>){1,2}/i);
    const trimmedEnd = introEnd + (introParagraphsMatch?.[0]?.length || 0);
    return `${source.slice(0, introStart)}${source.slice(trimmedEnd)}`.trim();
  }

  return `${source.slice(0, introStart).trimEnd()}\n${source.slice(nextHeading.index || 0).trimStart()}`.trim();
}

function stripLeadingHeadingOnly(html = '', pattern = null) {
  const source = String(html || '').trim();
  if (!source || !(pattern instanceof RegExp)) return source;

  const headingMatches = Array.from(source.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi));
  const targetMatch = headingMatches.find((match, index) => index <= 1 && pattern.test(stripHtmlTags(match[2])));
  if (!targetMatch) return source;

  const matchStart = targetMatch.index || 0;
  const matchEnd = matchStart + targetMatch[0].length;
  return `${source.slice(0, matchStart)}${source.slice(matchEnd)}`.trim();
}

function unwrapSimpleTrailingRepairContainer(html = '') {
  const source = String(html || '').trim();
  if (!source || !/^<div\b/i.test(source) || !/<\/div>\s*$/i.test(source)) return null;

  const openTagMatch = source.match(/^<div\b[^>]*>/i);
  const closeTagMatch = source.match(/<\/div>\s*$/i);
  if (!openTagMatch || !closeTagMatch) return null;

  const openTag = openTagMatch[0];
  const closeTag = closeTagMatch[0].trim();
  const innerHtml = source.slice(openTag.length, source.length - closeTagMatch[0].length).trim();
  if (!innerHtml) return null;

  const innerTokenPattern = new RegExp(TRAILING_REPAIR_TOKEN_PATTERN.source, TRAILING_REPAIR_TOKEN_PATTERN.flags);
  const remainder = innerHtml.replace(innerTokenPattern, '').trim();
  if (remainder) return null;

  return { openTag, closeTag, innerHtml };
}

function rewrapSimpleTrailingRepairContainer(wrapper = null, innerHtml = '') {
  const body = String(innerHtml || '').trim();
  if (!wrapper?.openTag || !wrapper?.closeTag) return body;
  return body ? `${wrapper.openTag}${body}${wrapper.closeTag}`.trim() : '';
}

function stripTrailingGenericSummarySection(html = '') {
  const source = String(html || '').trim();
  if (!source) return source;

  const wrapper = unwrapSimpleTrailingRepairContainer(source);
  if (wrapper) {
    return rewrapSimpleTrailingRepairContainer(wrapper, stripTrailingGenericSummarySection(wrapper.innerHtml));
  }

  const tokens = tokenizeTrailingRepairFragments(source);
  if (!tokens.length) return source;

  const suffixRange = findTrailingExplicitNonSummarySuffixRange(tokens);
  const suffixStartSource = suffixRange ? tokens[suffixRange.startIndex].start : source.length;
  const contentLimit = suffixRange ? suffixRange.startIndex : tokens.length;

  let targetIndex = -1;
  for (let index = contentLimit - 1; index >= 0; index -= 1) {
    if (isSummaryHeadingToken(tokens[index])) {
      targetIndex = index;
      break;
    }
  }
  if (targetIndex === -1) return source;

  const targetToken = tokens[targetIndex];
  let immediateFollowerIndex = -1;
  for (let index = targetIndex + 1; index < contentLimit; index += 1) {
    if (!tokens[index] || tokens[index].isStructural) continue;
    immediateFollowerIndex = index;
    break;
  }
  const hasImmediateSummaryOwnedRecommendationsSubheading = immediateFollowerIndex !== -1
    && isSummaryOwnedRecommendationsHeadingToken(tokens[immediateFollowerIndex]);
  let nextHeadingIndex = -1;
  for (let index = targetIndex + 1; index < contentLimit; index += 1) {
    const token = tokens[index];
    if (!token?.headingLevel) continue;
    if (hasImmediateSummaryOwnedRecommendationsSubheading && index === immediateFollowerIndex) continue;
    if (!isSummaryHeadingToken(token)) {
      nextHeadingIndex = index;
      break;
    }
  }

  const localSummaryRange = (nextHeadingIndex === -1 || hasImmediateSummaryOwnedRecommendationsSubheading)
    ? findSummaryLikeClusterAfterHeading(tokens, targetIndex, contentLimit)
    : null;
  const middleStartSource = nextHeadingIndex === -1
    ? (localSummaryRange ? tokens[localSummaryRange.endIndex - 1].end : targetToken.end)
    : tokens[nextHeadingIndex].start;
  const preservedMiddle = source.slice(middleStartSource, suffixStartSource).trim();
  const preservedSuffix = suffixRange ? extractTokenRangeHtml(source, tokens, suffixRange.startIndex, suffixRange.endIndex) : '';

  return normalizeJoinedHtmlFragments([
    source.slice(0, targetToken.start).trimEnd(),
    preservedMiddle,
    preservedSuffix,
  ]);
}

function stripTrailingSummaryLikeBlocksWithoutHeading(html = '') {
  const source = String(html || '').trim();
  if (!source) return source;

  const wrapper = unwrapSimpleTrailingRepairContainer(source);
  if (wrapper) {
    return rewrapSimpleTrailingRepairContainer(wrapper, stripTrailingSummaryLikeBlocksWithoutHeading(wrapper.innerHtml));
  }

  const tokens = tokenizeTrailingRepairFragments(source);
  if (!tokens.length) return source;

  const suffixRange = findTrailingExplicitNonSummarySuffixRange(tokens);
  const contentLimit = suffixRange ? suffixRange.startIndex : tokens.length;
  const lastContentIndex = findLastNonStructuralTokenIndex(tokens, contentLimit);
  if (lastContentIndex === -1) return source;

  let lastHeadingIndex = -1;
  for (let index = lastContentIndex; index >= 0; index -= 1) {
    if (tokens[index]?.headingLevel) {
      lastHeadingIndex = index;
      break;
    }
  }

  const removalRanges = [];
  if (lastHeadingIndex !== -1 && lastHeadingIndex < lastContentIndex && !isSummaryHeadingToken(tokens[lastHeadingIndex])) {
    const preTailHeadingRange = findSummaryLikeClusterImmediatelyBeforeBoundary(tokens, lastHeadingIndex);
    if (preTailHeadingRange) removalRanges.push(preTailHeadingRange);
  }

  const trailingSummaryRange = findTrailingSummaryLikeClusterRange(tokens, contentLimit, lastHeadingIndex);
  if (trailingSummaryRange) removalRanges.push(trailingSummaryRange);
  if (!removalRanges.length) return source;

  removalRanges.sort((left, right) => left.startIndex - right.startIndex);
  const suffixStartSource = suffixRange ? tokens[suffixRange.startIndex].start : source.length;
  const preservedSuffix = suffixRange ? extractTokenRangeHtml(source, tokens, suffixRange.startIndex, suffixRange.endIndex) : '';
  const fragments = [];
  let cursor = 0;

  removalRanges.forEach((range) => {
    const startToken = tokens[range.startIndex];
    const endToken = tokens[range.endIndex - 1];
    if (!startToken || !endToken) return;
    fragments.push(source.slice(cursor, startToken.start).trimEnd());
    cursor = endToken.end;
  });

  fragments.push(source.slice(cursor, suffixStartSource).trimEnd());
  fragments.push(preservedSuffix);
  return normalizeJoinedHtmlFragments(fragments);
}

function repairGeneratedHtmlForStructurePolicy(html = '', policy = null) {
  if (!policy?.hasExplicitConstraints) return String(html || '').trim();

  let next = String(html || '').trim();
  if (!next) return next;

  if (policy.noIntro) {
    next = stripLeadingGenericIntroSection(next);
    next = stripLeadingHeadingOnly(next, LEADING_GENERIC_INTRO_HEADING_PATTERN);
  }

  if (policy.noSummary) {
    next = stripTrailingGenericSummarySection(next);
    next = stripTrailingSummaryLikeBlocksWithoutHeading(next);
  }

  if (!policy.noHeadings) {
    return next.replace(/(?:\s*\n){3,}/g, '\n\n').trim();
  }

  if (policy.noHeadings) {
    next = next.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, '<p>$2</p>');
    next = next.replace(/<p>\s*([^<]+?)\s*<\/p>/gi, (match, headingText) => (
      FIXED_SCAFFOLD_HEADING_PATTERN.test(String(headingText || '').trim()) ? '' : match
    ));
  }

  return next.replace(/(?:\s*\n){3,}/g, '\n\n').trim();
}

export async function generateDocumentFromPrompt({ prompt, templateId = 'blank', instructions = '', selectedMaterials = [], selectedModel, runId: providedRunId = '', returnMeta = false }) {
  const { cleanPrompt, cleanInstructions, title } = resolveGenerationRequestContext({ prompt, instructions, templateId });
  if (!cleanPrompt && !cleanInstructions) throw new Error('צריך לכתוב נושא קצר או הנחיות למסמך');
  const runId = String(providedRunId || `doc-${Date.now()}`).trim();
  const structurePolicy = detectDocumentStructurePolicy({ prompt: cleanPrompt, instructions: cleanInstructions });
  const structureLockInstructions = buildStructureLockInstructions(structurePolicy);
  const automation = getWorkspaceAutomation();
  const activeWorkflowAgents = getOrderedRoleAgents(automation?.workflowMode);
  const hasActiveWorkflowAgents = Array.isArray(activeWorkflowAgents) && activeWorkflowAgents.length > 0;
  const noActiveWorkflowAutomation = automation?.enabled === true
    && automation?.autoDispatch !== false
    && !hasActiveWorkflowAgents;
  const shouldUseWorkflowAutomation = shouldUseDocumentWorkflowAutomation({
    automation,
    directStructureLock: structurePolicy.directStructureLock,
  });
  const documentRunLabel = getDocumentRunLabel({
    automation,
    selectedModel,
    directStructureLock: structurePolicy.directStructureLock,
    shouldUseWorkflowAutomation,
  });
  const requestWorkspaceId = String(automation?.activeWorkspaceId || '').trim();
  const requestWorkspaceName = String(automation?.workspaceName || '').trim();
  const requestLogContext = {
    activeWorkspaceId: requestWorkspaceId,
    workspaceName: requestWorkspaceName,
  };

  let templateGuide = TEMPLATE_GUIDES[templateId] || TEMPLATE_GUIDES.blank;
  let notes = '';
  let materialsText = '';

  try {
    const learning = await syncLearnedStyleFromWorkspace();

    templateGuide = TEMPLATE_GUIDES[templateId] || TEMPLATE_GUIDES.blank;
    notes = learning.notes?.join('\n') || '';
    materialsText = await buildEffectiveMaterialsContext({
      selectedMaterials,
      requestText: [cleanPrompt, cleanInstructions].filter(Boolean).join('\n'),
      allowAutoSelection: false,
    });
  } catch (error) {
    logAgentDebugEvent({
      type: 'doc-generation-preparation-error',
      state: 'error',
      runId,
      agentLabel: documentRunLabel,
      message: 'שגיאה מפורשת בשלב הכנת העבודה לפני קריאת API',
      errorMessage: error?.message || 'שגיאה לא ידועה',
      ...requestLogContext,
    });
    const fallbackHtml = buildLocalDraft(cleanPrompt, templateId, cleanInstructions, selectedMaterials);
    return returnMeta
      ? { html: fallbackHtml, usedFallback: true, runId, errorMessage: error?.message || 'שגיאה לא ידועה', title }
      : fallbackHtml;
  }

  try {
    logAgentDebugEvent({
      type: 'doc-generation-start',
      state: 'running',
      runId,
      agentLabel: documentRunLabel,
      message: 'התחילה יצירת מסמך חדש',
      templateId,
      selectedMaterialsCount: selectedMaterials.length,
      ...requestLogContext,
    });

    const suppressVisibleAgentNotes = structurePolicy.noSummary || structurePolicy.directStructureLock;
    const requestOptions = {
      runId,
      agentLabel: documentRunLabel,
      activeWorkspaceId: requestWorkspaceId,
      workspaceName: requestWorkspaceName,
      structureConstraintText: [cleanInstructions, cleanPrompt].filter(Boolean).join('\n').trim(),
      expectDocumentOutput: true,
      appendAgentNotesToOutput: suppressVisibleAgentNotes ? false : automation?.appendAgentNotesToOutput === true,
      agentNotesInstruction: !suppressVisibleAgentNotes && automation?.appendAgentNotesToOutput === true
        ? String(automation?.agentNotesInstruction || '').trim()
        : '',
    };
    if (structurePolicy.directStructureLock) {
      requestOptions.strictFormatting = true;
      requestOptions.skipAutomation = true;
      requestOptions.skipAutomationPrompt = true;
      requestOptions.skipSkillSelection = true;
      requestOptions.skipMultiModel = true;
      requestOptions.omitPersonalStyleStructureHints = true;
    }
    if (noActiveWorkflowAutomation) {
      requestOptions.automationSkipReason = 'noActiveAgents';
    }
    if (selectedModel && shouldUseWorkflowAutomation === false) {
      requestOptions.providerOverride = selectedModel;
      requestOptions.strictProviderOverride = true;
    }

    const userRequestSections = [];
    if (cleanInstructions) {
      userRequestSections.push(`הוראות המשתמש המחייבות למסמך:\n${cleanInstructions}`);
      if (cleanPrompt) userRequestSections.push(`נושא קצר או הקשר משלים:\n${cleanPrompt}`);
    } else {
      userRequestSections.push(`בקשת המשתמש למסמך:\n${cleanPrompt}`);
    }

    const response = await chatWithActiveProvider(
      userRequestSections.join('\n\n'),
      materialsText,
      `תפקידך לבנות מסמך שלם מוכן לעריכה בתוך WordFlow AI. החזר HTML בלבד עם תגיות כמו h1, h2, p, ul, li.\nכאשר צריך מעבר עמוד, הדפס בדיוק: <div data-type="page-break"></div>\nסוג תבנית מועדף: ${templateGuide}.${cleanInstructions ? `\nהנחיות מחייבות של המשתמש:\n${cleanInstructions}` : ''}\nאל תחזיר למשתמש את קובץ ההנחיות או חומרי העזר כפי שהם. השתמש בהם רק כהכוונה לבניית המסמך.\nאם חסר מידע עובדתי או מבני, אל תמציא — השאר כותרת בלבד או מקום ריק.\nכלל עליון: עקוב בדיוק אחרי הוראות המשתמש והמבנה שהתבקש.\nאם המשתמש ביקש מבוא - כתוב מבוא.\nאם המשתמש לא ביקש מבוא - אל תוסיף מבוא.\nאם המשתמש ביקש פרקים - כתוב פרקים לפי הבקשה.\nאם המשתמש לא ביקש פרקים - אל תוסיף פרקים קבועים על דעת עצמך.\nאם המשתמש ביקש היקף מסוים, מספר שאלות מסוים, או מבנה מדויק - שמור עליהם במדויק.\nאל תכפה מבנה אקדמי ברירת מחדל כמו "מבוא / דיון / סיכום" אלא אם המשתמש ביקש אותו במפורש.${structureLockInstructions ? `\nנעילת מבנה מפורשת:\n${structureLockInstructions}` : ''}${notes ? `\nלמידה מעבודות קודמות:\nנא לשים לב: ההערות הבאות הן תצפיות על סגנון כתיבה קודם בלבד, לא הנחיות מבנה. כללי המבנה שלעיל גוברים עליהן.\n${notes}` : ''}`,
      requestOptions,
    );

    const cleanedResponse = normalizeGeneratedHtmlResponse(response);
    const repairedResponse = repairGeneratedHtmlForStructurePolicy(cleanedResponse, structurePolicy);
    const usedStructurePolicyRepair = (structurePolicy.noIntro || structurePolicy.noSummary || structurePolicy.noHeadings) && repairedResponse !== cleanedResponse;
    const repairedResponseHasMeaningfulContent = hasMeaningfulRepairedContent(repairedResponse);
    const finalResponse = usedStructurePolicyRepair
      ? repairedResponse
      : repairedResponse.replace(/<[^>]+>/g, '').trim().length >= 10
        ? repairedResponse
        : cleanedResponse;
    const visibleText = stripHtmlTags(finalResponse);

    if (!finalResponse || (usedStructurePolicyRepair ? !repairedResponseHasMeaningfulContent : visibleText.length < 10)) {
      throw new Error('התקבלה תשובה ריקה או לא שמישה מהמודל');
    }

    if (finalResponse !== cleanedResponse) {
      logAgentDebugEvent({
        type: 'doc-generation-structure-repair',
        state: 'success',
        runId,
        agentLabel: documentRunLabel,
        message: 'בוצע תיקון ממוקד למסמך כדי לכבד נעילת מבנה מפורשת של המשתמש',
        outputChars: finalResponse.length,
        ...requestLogContext,
      });
    }

    logAgentDebugEvent({
      type: 'doc-generation-success',
      state: 'success',
      runId,
      agentLabel: documentRunLabel,
      message: 'המסמך נוצר בהצלחה דרך ה-API',
      outputChars: finalResponse.length,
      ...requestLogContext,
    });

    return returnMeta
      ? { html: finalResponse, usedFallback: false, runId, errorMessage: '', title }
      : finalResponse;
  } catch (error) {
    logAgentDebugEvent({
      type: 'doc-generation-api-error',
      state: 'error',
      runId,
      agentLabel: documentRunLabel,
      message: 'שגיאה מפורשת בבקשת API במהלך יצירת המסמך',
      errorMessage: error?.message || 'שגיאה לא ידועה',
      ...requestLogContext,
    });
    logAgentDebugEvent({
      type: 'doc-generation-fallback',
      state: 'error',
      runId,
      agentLabel: documentRunLabel,
      message: 'יצירת המסמך עברה לשלד מקומי במקום תשובת AI',
      errorMessage: error?.message || 'שגיאה לא ידועה',
      ...requestLogContext,
    });
    const fallbackHtml = buildLocalDraft(cleanPrompt, templateId, cleanInstructions, selectedMaterials);
    return returnMeta
      ? { html: fallbackHtml, usedFallback: true, runId, errorMessage: error?.message || 'שגיאה לא ידועה', title }
      : fallbackHtml;
  }
}

async function prepareFeedbackDrivenDocumentContext({
  originalPrompt = '',
  supportingText = '',
  templateId = 'blank',
  selectedMaterials = [],
  allowAutoSelectedMaterials = true,
  includeLearnedNotes = true,
  forceDirectMode = false,
  providedRunId = '',
  runIdPrefix = 'doc-feedback',
  automatedLabel = 'עדכון מסמך ב-workflow',
  directLabel = 'עדכון ישיר',
  preparationErrorType = 'doc-feedback-preparation-error',
  preparationErrorMessage = 'שגיאה מפורשת בשלב הכנת עדכון המסמך לפני קריאת API',
}) {
  const automation = getWorkspaceAutomation();
  const activeWorkflowAgents = getOrderedRoleAgents(automation?.workflowMode);
  const hasActiveWorkflowAgents = Array.isArray(activeWorkflowAgents) && activeWorkflowAgents.length > 0;
  const noActiveWorkflowAutomation = automation?.enabled === true
    && automation?.autoDispatch !== false
    && !hasActiveWorkflowAgents;
  const shouldUseWorkflowAutomation = !forceDirectMode
    && automation?.enabled === true
    && automation?.autoDispatch !== false
    && hasActiveWorkflowAgents;
  const requestWorkspaceId = String(automation?.activeWorkspaceId || '').trim();
  const requestWorkspaceName = String(automation?.workspaceName || '').trim();
  const requestLogContext = {
    activeWorkspaceId: requestWorkspaceId,
    workspaceName: requestWorkspaceName,
  };
  const templateGuide = TEMPLATE_GUIDES[templateId] || TEMPLATE_GUIDES.blank;
  const runId = String(providedRunId || `${runIdPrefix}-${Date.now()}`).trim();
  const agentLabel = shouldUseWorkflowAutomation ? automatedLabel : directLabel;
  let notes = '';
  let materialsText = '';

  try {
    if (includeLearnedNotes) {
      const learning = await syncLearnedStyleFromWorkspace();
      notes = learning.notes?.join('\n') || '';
    }
    materialsText = await buildEffectiveMaterialsContext({
      selectedMaterials,
      requestText: [originalPrompt, supportingText].filter(Boolean).join('\n'),
      allowAutoSelection: allowAutoSelectedMaterials,
    });
  } catch (error) {
    logAgentDebugEvent({
      type: preparationErrorType,
      state: 'error',
      runId,
      agentLabel,
      message: preparationErrorMessage,
      errorMessage: error?.message || 'שגיאה לא ידועה',
      ...requestLogContext,
    });

    return {
      shouldUseWorkflowAutomation,
      noActiveWorkflowAutomation,
      requestWorkspaceId,
      requestWorkspaceName,
      requestLogContext,
      templateGuide,
      runId,
      agentLabel,
      notes: '',
      materialsText: '',
      preparationError: error,
    };
  }

  return {
    shouldUseWorkflowAutomation,
    noActiveWorkflowAutomation,
    requestWorkspaceId,
    requestWorkspaceName,
    requestLogContext,
    templateGuide,
    runId,
    agentLabel,
    notes,
    materialsText,
    preparationError: null,
  };
}

export async function reviseDocumentWithFeedback({ existingHtml = '', feedback = '', originalPrompt = '', templateId = 'blank', selectedMaterials = [], selectedModel = '', runId: providedRunId = '', returnMeta = false, forceDirectMode = true }) {
  const cleanHtml = String(existingHtml || '').trim();
  const cleanFeedback = String(feedback || '').trim();
  if (!cleanHtml) throw new Error('אין מסמך פתוח לעדכון');
  if (!cleanFeedback) throw new Error('צריך לבחור משוב או לכתוב הערה חופשית');

  const {
    shouldUseWorkflowAutomation,
    noActiveWorkflowAutomation,
    requestWorkspaceId,
    requestWorkspaceName,
    requestLogContext,
    templateGuide,
    runId,
    agentLabel: documentUpdateLabel,
    notes,
    materialsText,
    preparationError,
  } = await prepareFeedbackDrivenDocumentContext({
    originalPrompt,
    supportingText: cleanFeedback,
    templateId,
    selectedMaterials,
    allowAutoSelectedMaterials: false,
    forceDirectMode,
    providedRunId,
    runIdPrefix: 'doc-feedback',
    automatedLabel: 'עדכון מסמך ב-workflow',
    directLabel: 'עדכון ישיר',
    preparationErrorType: 'doc-feedback-preparation-error',
    preparationErrorMessage: 'שגיאה מפורשת בשלב הכנת עדכון המסמך לפני קריאת API',
  });

  if (preparationError) {
    return returnMeta
      ? { html: cleanHtml, usedFallback: true, runId, errorMessage: preparationError?.message || 'שגיאה לא ידועה' }
      : cleanHtml;
  }

  const systemPrompt = shouldUseWorkflowAutomation
    ? `עדכן את המסמך הקיים בהתאם למשוב המשתמש. החזר HTML בלבד עם תגיות כמו h1, h2, p, ul, li. שמור על כל מידע טוב שכבר קיים, ותקן רק מה שנדרש לפי המשוב. אם חסר מידע עובדתי, אל תמציא — השאר כותרות או ניסוח זהיר. אל תוסיף מבוא, סיכום, כותרות קבועות או חלקים חדשים שלא קיימים במסמך המקורי אם המשתמש לא ביקש זאת. סוג תבנית מועדף: ${templateGuide}.${materialsText ? '\nאם סופקו חומרי עזר, השתמש בהם רק כהקשר משלים לעדכון המסמך.' : ''}${notes ? `\nסגנון שנלמד מעבודות קודמות:\nנא לשים לב: ההערות הבאות הן תצפיות על סגנון כתיבה קודם בלבד, לא הנחיות מבנה. כללי המבנה של המסמך הקיים והמשוב גוברים עליהן.\n${notes}` : ''}`
    : `פעל כעורך ישיר של WordFlow AI. קרא את המשוב, ועדכן בעצמך את המסמך הקיים בהתאם בלי לתאם עם צוות ובלי לפרק את המשימה לשלבים. החזר HTML בלבד עם תגיות כמו h1, h2, p, ul, li. שמור על כל מידע טוב שכבר קיים, ותקן רק מה שנדרש לפי המשוב. אם חסר מידע עובדתי, אל תמציא — השאר כותרות או ניסוח זהיר. אל תוסיף מבוא, סיכום, כותרות קבועות או חלקים חדשים שלא קיימים במסמך המקורי אם המשתמש לא ביקש זאת. סוג תבנית מועדף: ${templateGuide}.${materialsText ? '\nאם סופקו חומרי עזר, השתמש בהם רק כהקשר משלים לעדכון המסמך.' : ''}${notes ? `\nסגנון שנלמד מעבודות קודמות:\nנא לשים לב: ההערות הבאות הן תצפיות על סגנון כתיבה קודם בלבד, לא הנחיות מבנה. כללי המבנה של המסמך הקיים והמשוב גוברים עליהן.\n${notes}` : ''}`;

  try {
    logAgentDebugEvent({
      type: 'doc-feedback-start',
      state: 'running',
      runId,
      agentLabel: documentUpdateLabel,
      message: shouldUseWorkflowAutomation ? 'התחיל עדכון המסמך לפי המשוב דרך workflow' : 'התחיל עדכון ישיר של המסמך לפי המשוב',
      templateId,
      selectedMaterialsCount: selectedMaterials.length,
      ...requestLogContext,
    });

    const requestOptions = {
      runId,
      agentLabel: documentUpdateLabel,
      activeWorkspaceId: requestWorkspaceId,
      workspaceName: requestWorkspaceName,
      structureConstraintText: cleanFeedback,
    };
    if (!shouldUseWorkflowAutomation) {
      requestOptions.skipAutomation = true;
      requestOptions.skipAutomationPrompt = true;
      requestOptions.skipSkillSelection = true;
      requestOptions.skipMultiModel = true;
    }
    if (noActiveWorkflowAutomation) {
      requestOptions.automationSkipReason = 'noActiveAgents';
    }
    if (selectedModel && !shouldUseWorkflowAutomation) {
      requestOptions.providerOverride = selectedModel;
      requestOptions.strictProviderOverride = true;
    }

    const revisionContext = [
      `נושא המסמך: ${originalPrompt || 'לא צוין'}`,
      `משוב המשתמש:\n${cleanFeedback}`,
      `המסמך הקיים ב-HTML:\n${cleanHtml}`,
      materialsText ? `חומרי עזר נלווים:\n${materialsText}` : '',
    ].filter(Boolean).join('\n\n');

    const response = await chatWithActiveProvider(
      'שפר את המסמך הקיים בהתאם למשוב המשתמש',
      revisionContext,
      systemPrompt,
      requestOptions,
    );

    const cleanedResponse = normalizeGeneratedHtmlResponse(response);
    if (!cleanedResponse || cleanedResponse.replace(/<[^>]+>/g, '').trim().length < 10) {
      throw new Error('התקבלה תשובת תיקון ריקה או לא שמישה');
    }

    logAgentDebugEvent({
      type: 'doc-feedback-success',
      state: 'success',
      runId,
      agentLabel: documentUpdateLabel,
      message: shouldUseWorkflowAutomation ? 'המסמך עודכן לפי המשוב דרך workflow' : 'המסמך עודכן ישירות לפי המשוב',
      outputChars: cleanedResponse.length,
      ...requestLogContext,
    });

    return returnMeta
      ? { html: cleanedResponse, usedFallback: false, runId, errorMessage: '' }
      : cleanedResponse;
  } catch (error) {
    logAgentDebugEvent({
      type: 'doc-feedback-fallback',
      state: 'error',
      runId,
      agentLabel: documentUpdateLabel,
      message: shouldUseWorkflowAutomation ? 'עדכון המסמך דרך workflow לא הושלם' : 'העדכון הישיר של המסמך לא הושלם',
      errorMessage: error?.message || 'שגיאה לא ידועה',
      ...requestLogContext,
    });

    return returnMeta
      ? { html: cleanHtml, usedFallback: true, runId, errorMessage: error?.message || 'שגיאה לא ידועה' }
      : cleanHtml;
  }
}

export async function reviewDocumentRecommendations({ existingHtml = '', originalPrompt = '', templateId = 'blank', selectedMaterials = [], selectedModel = '', runId: providedRunId = '', returnMeta = false, feedback = '', focus = '' }) {
  const cleanHtml = String(existingHtml || '').trim();
  const cleanFocus = [String(focus || '').trim(), String(feedback || '').trim()].filter(Boolean).join('\n\n');
  if (!cleanHtml) throw new Error('אין מסמך פתוח לבדיקה');

  const {
    shouldUseWorkflowAutomation,
    requestWorkspaceId,
    requestWorkspaceName,
    requestLogContext,
    templateGuide,
    runId,
    agentLabel: documentReviewLabel,
    notes,
    materialsText,
    preparationError,
  } = await prepareFeedbackDrivenDocumentContext({
    originalPrompt,
    supportingText: cleanFocus,
    templateId,
    selectedMaterials,
    allowAutoSelectedMaterials: false,
    includeLearnedNotes: false,
    forceDirectMode: true,
    providedRunId,
    runIdPrefix: 'doc-review',
    automatedLabel: 'סקירת טיוטה',
    directLabel: 'סקירת טיוטה',
    preparationErrorType: 'doc-review-preparation-error',
    preparationErrorMessage: 'שגיאה מפורשת בשלב הכנת סקירת הטיוטה לפני קריאת API',
  });

  if (preparationError) {
    const fallback = buildDocumentReviewFallback({
      focusText: cleanFocus,
      errorMessage: preparationError?.message || 'שגיאה לא ידועה',
    });
    return returnMeta
      ? { ...fallback, runId }
      : { summary: fallback.summary, suggestions: fallback.suggestions };
  }

  const systemPrompt = `פעל כמבקר טיוטות ישיר של WordFlow AI. החזר המלצות עריכה בלבד, בלי לשכתב את המסמך, בלי להחזיר HTML ובלי לבצע שינוי בפועל. החזר JSON בלבד במבנה הזה: {"summary":"...","suggestions":[{"title":"...","reason":"...","suggestedChange":"..."}]}. summary חייב להיות קצר. suggestions חייבת להכיל בין 3 ל-6 פריטים קצרים, מעשיים ולא חופפים. כל suggestion חייב לכלול title, reason, suggestedChange. אל תחזיר Markdown, הסברים מחוץ ל-JSON או code fences. אם המשתמש נתן מיקוד, תעדף אותו; אחרת בצע סקירה כללית לטיוטה. סוג תבנית מועדף: ${templateGuide}.${materialsText ? '\nאם סופקו חומרי עזר מפורשים, השתמש בהם רק כהקשר משלים לבדיקה.' : ''}${notes ? `\nסגנון שנלמד מעבודות קודמות:\nנא לשים לב: ההערות הבאות הן תצפיות על סגנון כתיבה קודם בלבד. הן יכולות לכוון את ההמלצות, אך תוכן הטיוטה והמיקוד של המשתמש גוברים עליהן.\n${notes}` : ''}`;

  try {
    logAgentDebugEvent({
      type: 'doc-review-start',
      state: 'running',
      runId,
      agentLabel: documentReviewLabel,
      message: 'התחילה סקירת טיוטה עם המלצות עריכה',
      templateId,
      selectedMaterialsCount: selectedMaterials.length,
      ...requestLogContext,
    });

    const requestOptions = {
      runId,
      agentLabel: documentReviewLabel,
      activeWorkspaceId: requestWorkspaceId,
      workspaceName: requestWorkspaceName,
      structureConstraintText: cleanFocus || 'סקירת טיוטה עם המלצות עריכה בלבד',
      strictFormatting: true,
    };
    if (!shouldUseWorkflowAutomation) {
      requestOptions.skipAutomation = true;
      requestOptions.skipAutomationPrompt = true;
      requestOptions.skipSkillSelection = true;
      requestOptions.skipMultiModel = true;
    }
    if (selectedModel) {
      requestOptions.providerOverride = selectedModel;
      requestOptions.strictProviderOverride = true;
    }

    const reviewContext = [
      `נושא המסמך: ${originalPrompt || 'לא צוין'}`,
      cleanFocus
        ? `מיקוד מהמשתמש לבדיקה:\n${cleanFocus}`
        : 'מיקוד מהמשתמש לבדיקה:\nבצע סקירה כללית למסמך והצע שיפורים לא מחייבים.',
      `המסמך הקיים ב-HTML:\n${cleanHtml}`,
      materialsText ? `חומרי עזר נלווים:\n${materialsText}` : '',
    ].filter(Boolean).join('\n\n');

    const response = await chatWithActiveProvider(
      'הכן המלצות עריכה לא מחייבות לטיוטה הקיימת',
      reviewContext,
      systemPrompt,
      requestOptions,
    );

    const parsedResponse = normalizeReviewSuggestionsPayload(tryParseJsonObjectResponse(response));
    if (!parsedResponse) {
      throw new Error('התקבלה תשובת המלצות ריקה או לא שמישה');
    }

    logAgentDebugEvent({
      type: 'doc-review-success',
      state: 'success',
      runId,
      agentLabel: documentReviewLabel,
      message: 'סקירת הטיוטה הושלמה בהצלחה',
      outputChars: JSON.stringify(parsedResponse).length,
      ...requestLogContext,
    });

    return returnMeta
      ? { ...parsedResponse, usedFallback: false, runId, errorMessage: '' }
      : parsedResponse;
  } catch (error) {
    logAgentDebugEvent({
      type: 'doc-review-fallback',
      state: 'error',
      runId,
      agentLabel: documentReviewLabel,
      message: 'סקירת הטיוטה לא הושלמה',
      errorMessage: error?.message || 'שגיאה לא ידועה',
      ...requestLogContext,
    });

    const fallback = buildDocumentReviewFallback({
      focusText: cleanFocus,
      errorMessage: error?.message || 'שגיאה לא ידועה',
    });
    return returnMeta
      ? { ...fallback, runId }
      : { summary: fallback.summary, suggestions: fallback.suggestions };
  }
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function saveHelperMaterial(file, options = {}) {
  if (!file) throw new Error('לא נבחר קובץ');
  const meta = getMaterialUploadMeta(options.uploadKind || options.id || 'general');
  const arrayBuffer = await file.arrayBuffer();
  const payload = {
    name: file.name,
    title: file.name,
    dataBase64: arrayBufferToBase64(arrayBuffer),
    uploadKind: meta.id,
    label: meta.label,
    category: meta.category,
    templateId: meta.templateId,
    learningHint: meta.learningHint,
  };

  if (window.desktopApp?.saveLocalMaterial) {
    return window.desktopApp.saveLocalMaterial(payload);
  }

  const response = await fetch('/api/materials/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'upload failed');
    throw new Error(errorText || 'upload failed');
  }

  return response.json();
}
