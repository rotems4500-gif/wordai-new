import {
  chatWithActiveProvider,
  getPersonalStyleProfile,
  savePersonalStyleProfile,
  logAgentDebugEvent,
} from './aiService';

const HISTORY_KEY = 'wordai_saved_docs_history';
const HOME_INSTRUCTIONS_KEY = 'wordai_home_instructions';
const PAST_DOCS_INDEX_URL = 'PAST-DOC/index.json';
const PROJECT_MATERIALS_INDEX_URL = 'project-materials/index.json';
const MAX_HISTORY_ITEMS = 24;

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
  academic: 'צור מסמך אקדמי מסודר, לפי המבנה שמקובל בעבודות קודמות של המשתמש.',
  legal: 'צור מסמך משפטי או פורמלי לפי המבנה הסביר ביותר, בלי להמציא פרטים חסרים.',
  report: 'צור דוח מסודר עם כותרות בלבד כשאין מידע, ופרטים מלאים רק אם קיימת להם אחיזה.',
  summary: 'צור סיכום נושאי חד ומסודר עם נקודות מפתח בלבד, ואל תמציא תוכן חסר.',
  office: 'צור מסמך מקצועי למשרד או לארגון, ענייני וברור, והשאר חלקים חסרים ריקים.',
  letter: 'צור מכתב רשמי עם פתיחה, גוף וסיום, בלי להשלים נתונים שלא נמסרו.',
  proposal: 'צור הצעה מסודרת עם רקע, מטרות ושלבים, והשאר סעיפים חסרים ריקים.',
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
  if (dominantCategory === 'academic') notes.push('רוב המסמכים הקודמים הם אקדמיים ולכן יש להעדיף מבנה פורמלי, טיעון מסודר ושפה מדויקת.');
  if (combined.some((item) => item.category === 'legal')) notes.push('נמצאו גם מסמכים משפטיים או פורמליים, ולכן בפניות רשמיות יש להעדיף ניסוח זהיר, מדויק ומאופק.');
  if (combined.some((item) => item.category === 'office')) notes.push('נמצאו גם מסמכים משרדיים, לכן כשנושא העבודה מקצועי יש להעדיף תכליתיות, סעיפים קצרים והמלצות מעשיות.');
  if (combined.some((item) => item.category === 'summary')) notes.push('נמצאו מסמכי סיכום, ולכן כדאי להשתמש לעיתים גם במבנה של נקודות מפתח וסיכומי ביניים.');
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

export async function readInstructionFile(file) {
  if (!file) return '';
  const ext = String(file.name || '').toLowerCase().split('.').pop();
  const unsupportedBinary = new Set(['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'zip', 'rar', '7z']);
  if (unsupportedBinary.has(ext)) {
    throw new Error('unsupported-binary-file');
  }

  const buffer = await file.arrayBuffer();

  if (ext === 'pdf') {
    const pdfText = await extractPdfTextFromBuffer(buffer);
    if (!pdfText.trim()) throw new Error('empty-pdf-text');
    return pdfText.trim().slice(0, 6000);
  }

  const rawText = decodeTextBuffer(buffer);
  if (ext === 'html' || ext === 'htm') {
    const holder = document.createElement('div');
    holder.innerHTML = rawText;
    return String(holder.textContent || holder.innerText || '').trim().slice(0, 6000);
  }

  return String(rawText || '').trim().slice(0, 6000);
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

export function buildTemplateSkeleton(templateId = 'blank', title = '', examples = []) {
  const safeTitle = escapeHtml(title || '');
  const heading = safeTitle ? safeTitle : 'כותרת המסמך';
  const exampleText = examples.join(' ');

  const academicSections = /(תקשורת|שיווקית|פוליטית)/i.test(exampleText)
    ? ['מבוא', 'רקע תיאורטי', 'ניתוח מקרה', 'דיון ומסקנות']
    : /(הונגריה|קוסובו)/i.test(exampleText)
      ? ['רקע היסטורי', 'הצגת המקרה', 'דיון', 'סיכום']
      : ['מבוא', 'רקע תיאורטי', 'דיון', 'סיכום'];

  const cover = (label, subtitle = 'כותרת משנה', metaLine = '________________') =>
    `<p>${label}</p><h1>${heading}</h1><h2>${subtitle}</h2><hr /><p>${metaLine}</p><p>${new Date().toLocaleDateString('he-IL')}</p><div data-type="page-break"></div>`;

  const templates = {
    blank: `<h1>${heading}</h1>${blankLine(4)}`,
    academic: `${cover('עבודה אקדמית', 'נושא העבודה', 'מגיש/ה: ________________')}${academicSections.map((section) => `<h2>${section}</h2>${blankLine(2)}`).join('')}`,
    legal: `${cover('מסמך משפטי', 'הנדון', 'עבור: ________________')}<h2>רקע עובדתי</h2>${blankLine(2)}<h2>טענות</h2>${blankLine(2)}<h2>סעד מבוקש</h2>${blankLine(1)}<p>בברכה,</p>${blankLine(2)}`,
    report: `${cover('דוח מסודר', 'ממצאים והמלצות', 'מוכן לעריכה')}<h2>מטרה</h2>${blankLine(1)}<h2>ממצאים</h2>${blankLine(2)}<h2>המלצות</h2>${blankLine(2)}`,
    summary: `${cover('סיכום נושא', 'נקודות עיקריות', ' ')}<h2>נקודות עיקריות</h2><ul><li>&nbsp;</li><li>&nbsp;</li><li>&nbsp;</li></ul><h2>סיכום</h2>${blankLine(1)}`,
    office: `${cover('מסמך משרדי', 'ניסוח מקצועי', 'לטיפול: ________________')}<h2>רקע</h2>${blankLine(1)}<h2>פרטי הבקשה</h2>${blankLine(2)}<h2>המשך טיפול</h2>${blankLine(1)}`,
    proposal: `${cover('הצעה', 'רקע, מטרות ושלבים', 'מוגש ל: ________________')}<h2>רקע</h2>${blankLine(1)}<h2>מטרות</h2>${blankLine(1)}<h2>שלבים</h2>${blankLine(2)}`,
    letter: `${cover('מכתב רשמי', 'הנדון', 'לכבוד: ________________')}<p>שלום רב,</p>${blankLine(2)}<p>בברכה,</p>${blankLine(2)}`,
  };

  return templates[templateId] || templates.blank;
}

function buildLocalDraft(prompt, templateId, instructions, selectedMaterials) {
  const cleanPrompt = escapeHtml(prompt);
  const statusBlock = `
    <div style="border:1px solid #fecaca;background:#fff7f7;padding:12px 14px;border-radius:10px;margin:10px 0;">
      <p><strong>שים לב:</strong> ה-AI לא החזיר מסמך מלא בהרצה הזאת.</p>
      <p>נוצר שלד מקומי לעריכה, וניתן לבדוק את הסיבה במסך ההגדרות תחת יומן הלוגים.</p>
      ${instructions ? '<p>הנחיות המשתמש נשמרו למערכת, אך אינן מודבקות למסמך עצמו.</p>' : ''}
    </div>
  `;
  const refs = selectedMaterials.length
    ? `<h2>חומרי עזר שנבחרו</h2><ul>${selectedMaterials.map((item) => `<li>${escapeHtml(item.title)}</li>`).join('')}</ul>`
    : '';

  return `${statusBlock}${buildTemplateSkeleton(templateId, cleanPrompt)}${refs}`;
}

function normalizeGeneratedHtmlResponse(response = '') {
  return String(response || '')
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

export async function generateDocumentFromPrompt({ prompt, templateId = 'blank', instructions = '', selectedMaterials = [], returnMeta = false }) {
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt) throw new Error('צריך לכתוב נושא או בקשה למסמך');

  const learning = await syncLearnedStyleFromWorkspace();
  const materialPreviews = await Promise.all(selectedMaterials.map(async (item) => ({
    ...item,
    preview: await loadMaterialPreview(item),
  })));

  const templateGuide = TEMPLATE_GUIDES[templateId] || TEMPLATE_GUIDES.blank;
  const notes = learning.notes?.join('\n') || '';
  const materialsText = materialPreviews.map((item) => {
    const preview = item.preview ? `\nתוכן עזר:\n${item.preview}` : '';
    return `- ${item.title} (${item.label || 'כללי'})${preview}`;
  }).join('\n');

  const runId = `doc-${Date.now()}`;

  try {
    logAgentDebugEvent({
      type: 'doc-generation-start',
      state: 'running',
      runId,
      agentLabel: 'AUTOPILOT',
      message: 'התחילה יצירת מסמך חדש',
      templateId,
      selectedMaterialsCount: selectedMaterials.length,
    });

    const response = await chatWithActiveProvider(
      `צור עבורי מסמך מלא בנושא: ${cleanPrompt}`,
      materialsText,
      `תפקידך לבנות מסמך שלם מוכן לעריכה בתוך WordFlow AI. החזר HTML בלבד עם תגיות כמו h1, h2, p, ul, li.\nכאשר צריך מעבר עמוד, הדפס בדיוק: <div data-type="page-break"></div>\nסוג תבנית מועדף: ${templateGuide}.\nאל תחזיר למשתמש את קובץ ההנחיות או חומרי העזר כפי שהם. השתמש בהם רק כהכוונה לבניית המסמך.\nאם חסר מידע עובדתי או מבני, אל תמציא — השאר כותרת בלבד או מקום ריק.${instructions ? `\nהנחיות מחייבות של המשתמש:\n${instructions}` : ''}${notes ? `\nלמידה מעבודות קודמות:\n${notes}` : ''}`,
      { runId, agentLabel: 'AUTOPILOT' },
    );

    const cleanedResponse = normalizeGeneratedHtmlResponse(response);

    if (!cleanedResponse || cleanedResponse.replace(/<[^>]+>/g, '').trim().length < 20) {
      throw new Error('התקבלה תשובה ריקה או לא שמישה מהמודל');
    }

    logAgentDebugEvent({
      type: 'doc-generation-success',
      state: 'success',
      runId,
      agentLabel: 'AUTOPILOT',
      message: 'המסמך נוצר בהצלחה דרך ה-API',
      outputChars: cleanedResponse.length,
    });

    return returnMeta
      ? { html: cleanedResponse, usedFallback: false, runId, errorMessage: '' }
      : cleanedResponse;
  } catch (error) {
    logAgentDebugEvent({
      type: 'doc-generation-fallback',
      state: 'error',
      runId,
      agentLabel: 'AUTOPILOT',
      message: 'יצירת המסמך עברה לשלד מקומי במקום תשובת AI',
      errorMessage: error?.message || 'שגיאה לא ידועה',
    });
    const fallbackHtml = buildLocalDraft(cleanPrompt, templateId, instructions, selectedMaterials);
    return returnMeta
      ? { html: fallbackHtml, usedFallback: true, runId, errorMessage: error?.message || 'שגיאה לא ידועה' }
      : fallbackHtml;
  }
}

export async function reviseDocumentWithFeedback({ existingHtml = '', feedback = '', originalPrompt = '', templateId = 'blank', returnMeta = false }) {
  const cleanHtml = String(existingHtml || '').trim();
  const cleanFeedback = String(feedback || '').trim();
  if (!cleanHtml) throw new Error('אין מסמך פתוח לעדכון');
  if (!cleanFeedback) throw new Error('צריך לבחור משוב או לכתוב הערה חופשית');

  const learning = await syncLearnedStyleFromWorkspace();
  const notes = learning.notes?.join('\n') || '';
  const templateGuide = TEMPLATE_GUIDES[templateId] || TEMPLATE_GUIDES.blank;
  const runId = `doc-feedback-${Date.now()}`;

  try {
    logAgentDebugEvent({
      type: 'doc-feedback-start',
      state: 'running',
      runId,
      agentLabel: 'מנהל הצוות',
      message: 'מנהל הצוות קיבל משוב ומעדכן את המסמך',
      templateId,
    });

    const response = await chatWithActiveProvider(
      'שפר את המסמך הקיים בהתאם למשוב המשתמש',
      `נושא המסמך: ${originalPrompt || 'לא צוין'}\n\nמשוב המשתמש:\n${cleanFeedback}\n\nהמסמך הקיים ב-HTML:\n${cleanHtml}`,
      `פעל כמנהל צוות התוכן של WordFlow AI. קרא את המשוב, תאם את התיקונים עם הצוות, ושפר את המסמך הקיים בהתאם. החזר HTML בלבד עם תגיות כמו h1, h2, p, ul, li. שמור על כל מידע טוב שכבר קיים, ותקן רק מה שנדרש לפי המשוב. אם חסר מידע עובדתי, אל תמציא — השאר כותרות או ניסוח זהיר. סוג תבנית מועדף: ${templateGuide}.${notes ? `\nסגנון שנלמד מעבודות קודמות:\n${notes}` : ''}`,
      { runId, agentLabel: 'מנהל הצוות' },
    );

    const cleanedResponse = normalizeGeneratedHtmlResponse(response);
    if (!cleanedResponse || cleanedResponse.replace(/<[^>]+>/g, '').trim().length < 20) {
      throw new Error('התקבלה תשובת תיקון ריקה או לא שמישה');
    }

    logAgentDebugEvent({
      type: 'doc-feedback-success',
      state: 'success',
      runId,
      agentLabel: 'מנהל הצוות',
      message: 'המסמך עודכן בהתאם למשוב המשתמש',
      outputChars: cleanedResponse.length,
    });

    return returnMeta
      ? { html: cleanedResponse, usedFallback: false, runId, errorMessage: '' }
      : cleanedResponse;
  } catch (error) {
    logAgentDebugEvent({
      type: 'doc-feedback-fallback',
      state: 'error',
      runId,
      agentLabel: 'מנהל הצוות',
      message: 'מנהל הצוות לא הצליח להשלים את עדכון המסמך',
      errorMessage: error?.message || 'שגיאה לא ידועה',
    });

    return returnMeta
      ? { html: cleanHtml, usedFallback: true, runId, errorMessage: error?.message || 'שגיאה לא ידועה' }
      : cleanHtml;
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
