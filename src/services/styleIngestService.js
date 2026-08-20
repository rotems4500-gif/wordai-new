// styleIngestService.js — מנוע הסגנון האישי (Personal Style Engine), Phase 2 orchestrator.
//
// שכבת האפליקציה שמחברת בין ה-UI, ה-sample store, ה-primitives הטהורים של
// styleProfileService, וקריאת ה-LLM (chatWithActiveProvider). המודול הזה מייבא בחופשיות
// — ובמכוון *לא* מיובא ע"י aiService (מונע מעגל). כל השינויים לפרופיל עוברים דרך
// saveEngine() המקומי, שמבצע גם את ה-dispatch של האירוע שחסר ב-savePersonalStyleProfile.
//
// עובד בדפדפן בלבד (localStorage + window). תוכנית: docs/style-engine-plan.md §5, §6.

import {
  AI_DOC_CONTEXT_EVENT,
  chatWithActiveProvider,
  getExternalAnalysisAvailability,
  getPersonalStyleProfile,
  resolveCheapModelForProvider,
  savePersonalStyleProfile,
  mergeExternalStyleExtractionIntoProfile,
} from './aiService';
import {
  normalizeStyleEngine,
  computeLocalMetrics,
  aggregateDocumentMetrics,
  recomputeConfidence,
  extractQualitativePatterns,
  parsePatternExtractionResult,
  normalizeExternalSchemaJson,
  buildDeepProfileExtractionPrompt,
  mergeStructuralSignature,
  mergeQualitativePatterns,
  selectRepresentativeExcerpts,
  mineSignatureNgrams,
  mineStructuralFormulas,
  consensusMergePatterns,
  canonicalPatternKey,
  filterRejectedPatterns,
  deriveAutoBlacklist,
  AI_CLICHE_BLACKLIST,
  seedStyleEngineFromLegacyProfile,
  deriveManualDefaultsFromMetrics,
  GENRES,
  hasExternalProfileFields,
} from './styleProfileService';
import { loadStyleReference, primeStyleReference } from './styleReferenceService';
import { addStyleTargetDoc, removeStyleTargetDoc } from './styleTargetsStore';
import {
  addDocumentSamples,
  removeDocument,
  getChunks,
  getSampleDocuments,
  getSampleStoreStats,
  clearSampleStore,
  addGoldChunk,
  setDocumentGenre,
  setDocumentGenres,
  ensureSampleStoreReady,
  flushSampleStore,
  getSampleStoreWriteError,
} from './styleSampleStore';
import { readBrowserDocumentFile } from './documentUpload';
import {
  embedTexts,
  cosineSim,
  isEmbeddingUnavailable,
  resetEmbeddingState,
  STYLE_EMBEDDING_MODEL_ID,
  STYLE_EMBEDDING_DIM,
} from './styleEmbeddingService';
import { clearDeltas, assessDocOwnership } from './styleDeltaService';
import {
  getEmbeddedChunkIds,
  putVectors,
  getVectors,
  pruneVectors,
  ensureEmbeddingStoreReady,
  clearEmbeddingStore,
} from './styleEmbeddingStore';

// safeJsonParse אינו נדרש בשלב זה: אינו מיוצא מ-aiService (והמודול אסור לנגוע בו);
// הפענוח נעשה בתוך styleProfileService.parsePatternExtractionResult.
// getSampleDocuments/addGoldChunk משמשים כעת ל-E4 (מיגרציה חד-פעמית legacy→engine).

const STYLE_UPDATED_EVENT = 'wordai-personal-style-updated';
const PATTERN_EXTRACTION_MAX_CHARS = 5000;
const PATTERN_EXTRACTION_MAX_COUNT = 6;
const CAP_BLACKLIST_USER = 50;
// אותו cap שאוכף normalizeStyleEngine על blacklist.auto (CAP_BLACKLIST=50 ב-styleProfileService).
// משוכפל כאן כי הוא לא מיוצא; חריגה ממנו הייתה נחתכת שם בשקט ממילא.
const CAP_BLACKLIST_AUTO = 50;

// E1 — חילוץ multi-batch: כל באטצ' ~5000 תווים, עד 8 באטצ'ים.
const PATTERN_BATCH_MAX_CHARS = 5000;
const PATTERN_BATCH_MAX_BATCHES = 8;

// חילוץ דפוסים במודל זול — למעט ספקים שהמודל הזול שלהם חלש מדי בעברית ניואנסית.
const CHEAP_EXTRACTION_EXCLUDE = new Set(['groq']);

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// בונה options לקריאת chatWithActiveProvider שלא עיוורות לספק הפעיל: אם יש ספק מוגדר
// זמין (getExternalAnalysisAvailability — אותו helper ששולף "Syllabus Profile Import"),
// מכוונים אליו במפורש עם strictProviderOverride כדי שספק פעיל שבור (כמו quota מת) לא
// יפיל בשקט את כל קריאות ה-LLM של מנוע הסגנון. בלי ספק מוגדר — נופלים לספק הפעיל כרגיל.
// cheap:true מוסיף modelOverride למודל זול (resolveCheapModelForProvider) כשהספק ידוע
// ולא ברשימת cheapExclude — רק לקריאות פנימיות (סיווג/חילוץ), לא לתוצר שהמשתמש רואה.
function buildStyleLlmOptions(agentLabel, runId, { cheap = false, cheapExclude } = {}) {
  const base = {
    strictFormatting: true,
    skipAutomation: true,
    skipMultiModel: true,
    agentLabel,
    runId,
  };
  try {
    const availability = getExternalAnalysisAvailability();
    if (availability?.hasLocalProvider && availability.processingProviderId) {
      const providerId = availability.processingProviderId;
      const result = {
        ...base,
        providerOverride: providerId,
        strictProviderOverride: true,
      };
      if (cheap && !(cheapExclude && cheapExclude.has(providerId))) {
        const cheapModel = resolveCheapModelForProvider(providerId);
        if (cheapModel) {
          result.modelOverride = cheapModel;
        }
      }
      return result;
    }
  } catch {
    // כשל בשליפת זמינות — נופלים לספק הפעיל (התנהגות קודמת)
  }
  return base;
}

/**
 * מחלק את כל ה-chunks לבאטצ'ים של ~maxChars תווים, עד maxBatches.
 * אם התוכן חורג מהקיבולת — בוחר תת-קבוצה מייצגת בפריסה אחידה על הקורפוס
 * (stride) במקום לקחת רק את ההתחלה.
 * @param {Array<{text?:string}>} chunks
 * @returns {string[][]} מערך של באטצ'ים, כל אחד מערך טקסטים
 */
function buildPatternBatches(chunks, { maxChars = PATTERN_BATCH_MAX_CHARS, maxBatches = PATTERN_BATCH_MAX_BATCHES } = {}) {
  const list = (Array.isArray(chunks) ? chunks : [])
    .map((c) => String(c?.text || ''))
    .filter((t) => t.trim().length > 0);
  if (!list.length) return [];

  const totalChars = list.reduce((s, t) => s + t.length, 0);
  const capacity = maxChars * maxBatches;

  // סדר עיבוד: אם התוכן נכנס בקיבולת — סדר טבעי; אחרת — פריסה אחידה (stride).
  let order = list;
  if (totalChars > capacity) {
    const stride = Math.max(1, maxBatches);
    order = [];
    for (let offset = 0; offset < stride; offset += 1) {
      for (let i = offset; i < list.length; i += stride) order.push(list[i]);
    }
  }

  const batches = [];
  let current = [];
  let currentChars = 0;
  for (const text of order) {
    if (current.length && currentChars + text.length > maxChars) {
      batches.push(current);
      if (batches.length >= maxBatches) return batches;
      current = [];
      currentChars = 0;
    }
    current.push(text);
    currentChars += text.length;
  }
  if (current.length && batches.length < maxBatches) batches.push(current);
  return batches;
}

// ---------- classifyDocumentGenres (E3) ----------

// פענוח סובלני של map {id: genre} מפלט LLM — לעולם לא זורק.
function parseGenreMap(raw) {
  const stripped = String(raw || '')
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```/g, '')
    .trim();
  if (!stripped) return {};
  let parsed = null;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) { try { parsed = JSON.parse(match[0]); } catch { parsed = null; } }
  }
  return isPlainObject(parsed) ? parsed : {};
}

/**
 * מסווג רשימת מסמכים לז'אנרים בקריאת LLM אחת (batched). כל מסמך מוצג כ-
 * `<id>: <title> — <300 תווים ראשונים>`; המודל מחזיר JSON {"<id>":"<genre>"}.
 * ערך לא-חוקי/חסר → 'אחר'. כשל כללי → הכל 'אחר' (לעולם לא חוסם/זורק).
 * @param {Array<{id:string, title?:string, text?:string}>} docs
 * @param {(prompt:string)=>Promise<string>} invokeModel
 * @returns {Promise<Object<string,string>>} map של docId→genre
 */
async function classifyDocumentGenres(docs, invokeModel) {
  const list = (Array.isArray(docs) ? docs : []).filter((d) => d && d.id);
  const fallbackAll = () => Object.fromEntries(list.map((d) => [String(d.id), 'אחר']));
  if (!list.length) return {};
  if (typeof invokeModel !== 'function') return fallbackAll();

  const listing = list
    .map((d) => `${d.id}: ${String(d.title || 'ללא כותרת').trim()} — ${String(d.text || '').replace(/\s+/g, ' ').trim().slice(0, 300)}`)
    .join('\n');
  const prompt = [
    'אתה מסווג ז\'אנר של מסמכים בעברית. לפניך רשימת מסמכים (מזהה: כותרת — תחילת הטקסט).',
    `לכל מסמך בחר ז'אנר אחד בלבד מתוך הרשימה הסגורה: ${GENRES.map((g) => `"${g}"`).join(', ')}.`,
    'אם לא ברור — בחר "אחר".',
    'החזר JSON בלבד, ללא טקסט נוסף, בפורמט { "<מזהה>": "<ז\'אנר>" } עבור כל מזהה ברשימה.',
    '',
    'המסמכים:',
    listing,
  ].join('\n');

  let raw = '';
  try {
    raw = await invokeModel(prompt);
  } catch {
    return fallbackAll();
  }
  const parsed = parseGenreMap(raw);
  const out = {};
  list.forEach((d) => {
    const id = String(d.id);
    const g = String(parsed[id] || '').trim();
    out[id] = GENRES.includes(g) ? g : 'אחר';
  });
  return out;
}

/**
 * מסווג את כל המסמכים שחסר להם ז'אנר (genre==null/undefined) ומחיל דרך setDocumentGenre.
 * נקרא פעם אחת אחרי קליטת באטצ' מסמכים חדש. סובלני — כשל → כלום/אחר.
 * @returns {Promise<{classified:number}>}
 */
export async function classifyPendingGenres() {
  const pending = getSampleDocuments().filter((d) => d && d.id && (d.genre === null || d.genre === undefined));
  if (!pending.length) return { classified: 0 };

  // חילוץ 300 תווים ראשונים לכל מסמך מה-chunks שלו (ה-store לא שומר raw text מלא).
  const chunks = getChunks();
  const firstTextByDoc = new Map();
  chunks.forEach((c) => {
    const id = String(c?.docId || '');
    if (!id || firstTextByDoc.has(id)) return;
    firstTextByDoc.set(id, String(c?.text || ''));
  });

  const docsForClassify = pending.map((d) => ({
    id: d.id,
    title: d.title,
    text: firstTextByDoc.get(String(d.id)) || '',
  }));

  // classifyDocumentGenres בולע כשל LLM ומחזיר fallbackAll() בשקט; כדי לזהות את זה
  // מבחוץ (ולא לבלוע את הכשל לגמרי) עוטפים את invokeModel ומסמנים דגל מקומי.
  let llmFailed = false;
  const invokeModel = (prompt) => chatWithActiveProvider(prompt, '', '', {
    ...buildStyleLlmOptions('Style Genre Classification', `style-genre-${Date.now()}`, { cheap: true }),
    suppressStyleEngine: true,
    suppressPersonalStyle: true,
  }).catch((err) => {
    llmFailed = true;
    throw err;
  });

  let map = {};
  try {
    map = await classifyDocumentGenres(docsForClassify, invokeModel);
  } catch {
    llmFailed = true;
    map = Object.fromEntries(docsForClassify.map((d) => [String(d.id), 'אחר']));
  }
  // אצווה אחת: writeBlob יחיד + אירוע עדכון יחיד, במקום סריאליזציה-של-כל-הקורפוס
  // ואינבלידציית פרופילים פר-מסמך (סערת אירועים על 30 מסמכים).
  const normalizedGenres = Object.fromEntries(
    Object.entries(map).map(([id, genre]) => [id, GENRES.includes(genre) ? genre : 'אחר']),
  );
  const classified = setDocumentGenres(normalizedGenres)?.updated || 0;
  {
    const { profile, engine } = loadEngine();
    const prevMeta = isPlainObject(engine.extractionMeta) ? engine.extractionMeta : {};
    if (Boolean(prevMeta.genreClassificationFailed) !== llmFailed) {
      engine.extractionMeta = { ...prevMeta, genreClassificationFailed: llmFailed };
      saveEngine(profile, engine);
    }
  }
  return { classified };
}

// ---------- טעינה + שמירה של המנוע ----------

// טוען את הפרופיל + styleEngine מנורמל, תוך שימור הדגל qualitativePatternsStale
// (normalizeStyleEngine לא מכיר אותו, לכן מחברים אותו ידנית מהגלם).
function loadEngine() {
  const profile = getPersonalStyleProfile();
  const rawEngine = isPlainObject(profile.styleEngine) ? profile.styleEngine : {};
  const engine = normalizeStyleEngine(rawEngine);
  if (rawEngine.qualitativePatternsStale) engine.qualitativePatternsStale = true;
  return { profile, engine };
}

// שומר את המנוע לפרופיל + מפעיל ידנית את אירוע ה-DOM (savePersonalStyleProfile *לא* עושה זאת).
function saveEngine(profile, engine) {
  const normalized = normalizeStyleEngine(engine);
  // שימור דגלים שלא בסכמה של normalizeStyleEngine:
  if (engine && engine.qualitativePatternsStale) {
    normalized.qualitativePatternsStale = true;
  }
  const nextProfile = { ...(isPlainObject(profile) ? profile : {}), styleEngine: normalized };
  savePersonalStyleProfile(nextProfile);
  if (typeof window !== 'undefined') {
    try { window.dispatchEvent(new CustomEvent(STYLE_UPDATED_EVENT)); } catch {}
  }
  return normalized;
}

// ---------- recordGenerationQuality ----------

/**
 * סוגר את ה-feedback-loop בין איכות פלט ל-confidence: מוסיף ציון של
 * scoreStyleForDocument (על טקסט שנוצר) להיסטוריה המתגלגלת (cap 20), מחשב מחדש את
 * ה-confidence כדי שההשפעה תיכנס מיד, ושומר. נקרא מזרימת היצירה — לעולם לא זורק.
 * @param {number} score ציון 0-100 של הפלט (עד כמה "נשמע כמוך")
 * @param {{genre?:string|null}} [opts]
 * @returns {void}
 */
export function recordGenerationQuality(score, { genre = null } = {}) {
  try {
    if (!Number.isFinite(Number(score))) return;
    const { profile, engine } = loadEngine();
    if (!engine || engine.enabled === false) return;
    const history = Array.isArray(engine.qualityHistory) ? engine.qualityHistory.slice() : [];
    const entry = {
      score: Math.max(0, Math.min(100, Math.round(Number(score)))),
      at: Date.now(),
    };
    const g = String(genre || '').trim();
    if (g) entry.genre = g;
    history.push(entry);
    // cap 20 — שומר את האחרונות (normalizeStyleEngine גם עושה זאת, אך שומרים כאן עקביות).
    engine.qualityHistory = history.slice(-20);
    engine.confidence = recomputeConfidence(engine);
    saveEngine(profile, engine);
  } catch { /* noop — לא שוברים את זרימת היצירה */ }
}

// ---------- ingestFiles ----------

/**
 * מחלץ טקסט מכל קובץ דרך readBrowserDocumentFile ומצרף ל-sample store.
 * @param {FileList|Array<File>} fileList
 * @param {{onProgress?:function}} opts
 * @returns {Promise<{added:number, skipped:number, failed:Array<{name:string, error:string}>}>}
 */
export async function ingestFiles(fileList, { onProgress } = {}) {
  // מוודא שה-store נטען מ-IndexedDB לפני הכתיבה הראשונה — אחרת הדגימות הקיימות
  // ידרסו ע"י cache ריק.
  await ensureSampleStoreReady();

  const files = Array.from(fileList || []);
  const total = files.length;
  let added = 0;
  let skipped = 0;
  let evicted = 0;
  const failed = [];

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const name = String(file?.name || `קובץ ${i + 1}`);
    if (typeof onProgress === 'function') {
      try { onProgress({ index: i, total, name, status: 'reading' }); } catch {}
    }
    // outcome פר-קובץ ('added'|'skipped'|'failed') — נשלח באירוע ה-'done' כדי שה-UI יציג
    // ✓/⏭/✗ ישירות בלי הצלבת שמות (עמיד גם לקבצים כפולי-שם). ברירת-מחדל 'failed' עד הצלחה.
    let outcome = 'failed';
    try {
      const doc = await readBrowserDocumentFile(file);
      const text = String(doc?.text || '').trim();
      if (!text) {
        failed.push({ name, error: 'לא חולץ טקסט מהקובץ.' });
      } else {
        const result = addDocumentSamples({
          title: String(doc?.title || name),
          text,
          source: 'upload',
        });
        if (result.skipped) { skipped += 1; outcome = 'skipped'; }
        else if (result.docId && Number(result.added) > 0) {
          added += 1;
          evicted += Number(result.evicted) || 0;
          outcome = 'added';
          // ⚠️ **כאן ולא במורד הזרם**: הפרופיל המבני נמדד מגבולות הפסקה, וה-chunking
          // שזה עתה רץ מחק אותם. זו הנקודה האחרונה שבה הטקסט המלא קיים.
          // כשל כאן לעולם אינו מפיל קליטת סגנון — הפרופיל הוא שיפור, לא תנאי.
          try { await addStyleTargetDoc(text, { docId: result.docId }); } catch {}
        } else {
          // המסמך נרשם אך לא הניב אף chunk (טקסט קצר מדי לדגימה). מסירים אותו כדי
          // ש-docCount לא ינפח את הוודאות, וכדי שגרסה מתוקנת של אותו קובץ לא תיחסם
          // לנצח כ-duplicate לפי hash.
          if (result.docId) removeDocument(result.docId);
          failed.push({ name, error: 'הקובץ קצר מדי לדגימת סגנון.' });
        }
      }
    } catch (err) {
      failed.push({ name, error: String(err?.message || err || 'חילוץ נכשל.') });
    }
    if (typeof onProgress === 'function') {
      try { onProgress({ index: i, total, name, status: 'done', outcome }); } catch {}
    }
  }

  // מוודא שהכתיבה הגיעה לדיסק ומדווח כשל אחסון אמיתי (במקום לבלוע אותו).
  await flushSampleStore();
  return { added, skipped, evicted, failed, writeError: getSampleStoreWriteError() };
}

// ---------- ingestText ----------

/**
 * מצרף טקסט חופשי (הדבקה) ל-sample store.
 * @param {{title?:string, text:string, source?:string}} args
 * @returns {{docId:(string|null), added:number, skipped:boolean}}
 */
export function ingestText({ title, text, source = 'paste' } = {}) {
  const result = addDocumentSamples({
    title: String(title || '').trim() || 'טקסט שהודבק',
    text: String(text || ''),
    source: String(source || 'paste'),
  });
  // fire-and-forget: החתימה הסינכרונית של הפונקציה נשמרת, והפרופיל אינו תנאי
  // להצלחת הקליטה.
  if (result?.docId) addStyleTargetDoc(String(text || ''), { docId: result.docId }).catch(() => {});
  return result;
}

// ---------- לכידה פסיבית מקריאות AI ----------
//
// aiService משדר את טקסט המסמך שנשלח לספק חיצוני (AI_DOC_CONTEXT_EVENT) — כאן הוא
// נקלט כדגימת סגנון. דרך ingestText ולא addDocumentSamples ישירות, כדי שהטקסט המלא
// יזין גם את היעדים המבניים (addStyleTargetDoc) — מה שסוגר את פער ה-backfill שלהם.
// שערים: הסכמת למידה (learningConsent), אורך מינימלי (נאכף גם בצד המשדר), hydrate
// לפני כתיבה (מניעת דריסת קורפוס), ו-dedupe לפי hash תוכן (מובנה ב-addDocumentSamples).
// throttle: בלי זה כל סבב צ'אט על אותו מסמך (שהשתנה במילה) הוא hash חדש —
// והקורפוס מתמלא בכמעט-כפילויות שדוחקות עבודות אמיתיות מה-caps.
const AI_CONTEXT_CAPTURE_MIN_CHARS = 1200;
const AI_CONTEXT_CAPTURE_THROTTLE_MS = 15 * 60 * 1000;
let lastAiContextCaptureAt = 0;
if (typeof window !== 'undefined' && window.addEventListener) {
  try {
    window.addEventListener(AI_DOC_CONTEXT_EVENT, (event) => {
      (async () => {
        try {
          const text = String(event?.detail?.text || '');
          if (text.trim().length < AI_CONTEXT_CAPTURE_MIN_CHARS) return;
          if (Date.now() - lastAiContextCaptureAt < AI_CONTEXT_CAPTURE_THROTTLE_MS) return;
          const profile = getPersonalStyleProfile();
          if (!profile || profile.learningConsent === false) return;
          await ensureSampleStoreReady();
          const result = ingestText({ title: 'מסמך שנשלח ל-AI', text, source: 'ai-context' });
          if (result?.docId) lastAiContextCaptureAt = Date.now();
        } catch {}
      })();
    });
  } catch {}
}

// ---------- קליטת עבודות שהוגשו ומסמכים שהושלמו ----------
//
// שני מקורות שהיו עד כה בלתי-נראים למנוע:
//   1. עבודות בדוקות שחוזרות מהמרצה — גוף הטקסט הוא כתיבה אקדמית 100% של המשתמש.
//   2. מסמכים שנכתבו באפליקציה מאפס — ה-delta tracker רואה רק פלט AI שנערך.
// שניהם נקלטים כמסמכי קורפוס רגילים (לא gold): עבודה שלמה = עשרות chunks, ו-gold
// לעולם אינו מפונה. תג ה-source הוא שמבדיל אותם ב-UI.

// אורך מינימלי למסמך שנחשב "הושלם" (זהה לסף הלכידה הפסיבית).
const FINISHED_DOC_MIN_CHARS = 1200;
// throttle פר-מסמך: מסמך נקלט לכל היותר פעם ב-24 שעות, ולא שוב אם התוכן לא השתנה.
const FINISHED_CAPTURE_STORAGE_KEY = 'wordai_style_finished_capture_v1';
const FINISHED_CAPTURE_THROTTLE_MS = 24 * 60 * 60 * 1000;

// hash דטרמיניסטי מקומי (djb2 מעל טקסט מנורמל) — mirror של styleSampleStore.hashText,
// שאינו מיוצא. משמש רק לזיהוי "אותו תוכן בדיוק" ב-throttle.
function localHashText(text = '') {
  const normalized = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  let h = 5381;
  for (let i = 0; i < normalized.length; i += 1) {
    h = ((h << 5) + h + normalized.charCodeAt(i)) | 0;
  }
  return `hash_${(h >>> 0).toString(16).padStart(8, '0')}`;
}

function readFinishedCaptureMap() {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(FINISHED_CAPTURE_STORAGE_KEY) || '');
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeFinishedCaptureMap(map) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(FINISHED_CAPTURE_STORAGE_KEY, JSON.stringify(isPlainObject(map) ? map : {}));
  } catch {}
}

/**
 * קולט גוף של עבודה שהוגשה (חולץ מקובץ בדוק שחזר מהמרצה) כמסמך קורפוס.
 * dedupe לפי hash תוכן קיים ב-addDocumentSamples — סריקה חוזרת של אותה עבודה מדולגת.
 * @param {{title?:string, text:string}} args
 * @returns {Promise<{docId:(string|null), added:number, skipped:boolean}|{skipped:string}>}
 */
export async function ingestGradedSubmission({ title, text } = {}) {
  const profile = getPersonalStyleProfile();
  if (profile?.learningConsent === false) return { skipped: 'consent' };
  const raw = String(text || '');
  if (raw.trim().length < AI_CONTEXT_CAPTURE_MIN_CHARS) return { skipped: 'too-short' };

  await ensureSampleStoreReady();
  return ingestText({
    title: String(title || '').trim() || 'עבודה בדוקה',
    text: raw,
    source: 'graded-submission',
  });
}

/**
 * קולט מסמך שנראה "גמור" מתוך העורך — אחרי שקט עריכה. כל השערים כאן ולא בקורא.
 * @param {{docId:string, text:string, title?:string}} args
 * @returns {Promise<{captured:boolean, reason:string}>}
 */
export async function maybeCaptureFinishedDocument({ docId, text, title } = {}) {
  try {
    const profile = getPersonalStyleProfile();
    if (profile?.learningConsent === false) return { captured: false, reason: 'consent' };

    const engine = normalizeStyleEngine(profile?.styleEngine);
    if (engine.enabled !== true) return { captured: false, reason: 'engine-off' };

    const raw = String(text || '');
    if (raw.trim().length < FINISHED_DOC_MIN_CHARS) return { captured: false, reason: 'too-short' };

    const id = String(docId || '').trim();
    const hash = localHashText(raw);
    const map = readFinishedCaptureMap();
    const prev = isPlainObject(map[id]) ? map[id] : null;
    if (prev && id) {
      if (prev.lastHash === hash) return { captured: false, reason: 'unchanged' };
      if (Date.now() - (Number(prev.lastAt) || 0) < FINISHED_CAPTURE_THROTTLE_MS) {
        return { captured: false, reason: 'throttled' };
      }
    }

    // בעלות: מסמך שהוא עדיין פלט AI בתולי (או ברובו) לא נכנס לקורפוס.
    const ownership = assessDocOwnership({ docId: id, currentText: raw });
    if (!ownership?.eligible) return { captured: false, reason: String(ownership?.reason || 'mostly-ai') };

    await ensureSampleStoreReady();
    const result = ingestText({
      title: String(title || '').trim() || 'מסמך שנכתב באפליקציה',
      text: raw,
      source: 'finished-doc',
    });

    // מעדכנים throttle רק על קליטה אמיתית — dedupe hash (skipped) לא "צורך" 24 שעות.
    if (result?.docId) {
      if (id) {
        map[id] = { lastAt: Date.now(), lastHash: hash };
        writeFinishedCaptureMap(map);
      }
      return { captured: true, reason: 'ok' };
    }
    if (result?.skipped) return { captured: false, reason: 'deduped' };
    return { captured: false, reason: 'not-ingested' };
  } catch {
    return { captured: false, reason: 'error' };
  }
}

/**
 * שומר משוב חופשי שהמשתמש כתב בבקשת רוויזיה ("קצר מדי", "יותר פורמלי").
 * תיעוד בלבד — בלי LLM ובלי סינתזה לפרופיל (1-2 דגימות מטות יותר משהן מלמדות).
 * @param {string} feedbackText
 * @returns {boolean} true אם נרשם
 */
export function recordRevisionFeedback(feedbackText) {
  try {
    const t = String(feedbackText || '').trim();
    if (!t) return false;
    const { profile, engine } = loadEngine();
    if (profile?.learningConsent === false) return false;

    const clipped = t.slice(0, 200);
    const notes = Array.isArray(engine.revisionFeedbackNotes) ? engine.revisionFeedbackNotes.slice() : [];
    if (notes.some((n) => String(n?.text || '') === clipped)) return false;

    notes.push({ text: clipped, at: Date.now() });
    engine.revisionFeedbackNotes = notes.slice(-12);
    saveEngine(profile, engine);
    return true;
  } catch {
    return false;
  }
}

// ---------- recomputeMetricsFromStore ----------

/**
 * מחשב מחדש מדדים מכל ה-chunks: מקבץ לפי docId, computeLocalMetrics לכל מסמך,
 * aggregateDocumentMetrics על הכל → engine.metrics + metricsSpread + confidence.
 * @returns {object} engine מנורמל
 */
export function recomputeMetricsFromStore() {
  const { profile, engine } = loadEngine();

  const chunks = getChunks();
  const byDoc = new Map();
  chunks.forEach((c) => {
    const id = String(c?.docId || '_orphan');
    if (!byDoc.has(id)) byDoc.set(id, { texts: [], genre: null });
    byDoc.get(id).texts.push(String(c?.text || ''));
    if (c?.genre && !byDoc.get(id).genre) byDoc.get(id).genre = String(c.genre);
  });

  // ז'אנר לפי מסמך מ-getSampleDocuments (מקור אמת; chunks עשויים לא לשאת ז'אנר בקצה).
  const genreByDocId = new Map();
  getSampleDocuments().forEach((d) => {
    if (d && d.id && d.genre) genreByDocId.set(String(d.id), String(d.genre));
  });

  const perDocMetrics = [];
  // E3 — צובר מדדים לכל ז'אנר (חוץ מ'אחר') לחישוב תת-פרופילים.
  const perGenreMetrics = new Map();
  byDoc.forEach((entry, docId) => {
    const m = computeLocalMetrics(entry.texts.join('\n\n'));
    if (!m) return;
    perDocMetrics.push(m);
    const genre = genreByDocId.get(String(docId)) || entry.genre || null;
    if (genre && genre !== 'אחר') {
      if (!perGenreMetrics.has(genre)) perGenreMetrics.set(genre, []);
      perGenreMetrics.get(genre).push(m);
    }
  });

  const agg = aggregateDocumentMetrics(perDocMetrics);

  // תת-פרופילי ז'אנר: רק ז'אנרים עם ≥3 מסמכים כשירים-למדדים. היתר → global fallback.
  const genreProfiles = {};
  perGenreMetrics.forEach((metricsList, genre) => {
    if (metricsList.length < 3) return;
    const gAgg = aggregateDocumentMetrics(metricsList);
    genreProfiles[genre] = {
      metrics: gAgg.metrics,
      metricsSpread: gAgg.metricsSpread,
      docCount: gAgg.docCount,
    };
  });

  engine.metrics = agg.metrics;
  engine.metricsSpread = agg.metricsSpread;
  engine.genreProfiles = genreProfiles;
  engine.lastAnalysisAt = Date.now();
  // E4 — תיקון ודאות: confidence.docCount היה מקבל את docCount של aggregateDocumentMetrics
  // (רק מסמכים "כשירים למדדים" — למשל 23), בעוד המשתמש רואה שהעלה יותר (30). docCount
  // בפועל = כל המסמכים שהועלו (getSampleDocuments); מונה הכשירים נשמר בנפרד לתצוגה.
  engine.confidence = {
    ...engine.confidence,
    docCount: getSampleDocuments().length,
    wordCount: agg.totalWordCount,
  };
  engine.metricsEligibleDocCount = agg.docCount;
  engine.confidence = recomputeConfidence(engine);

  return saveEngine(profile, engine);
}

// ---------- computeChunkEmbeddings (שכבת embeddings סמנטית מקומית, טרום-API) ----------

const EMBED_PER_RUN_BUDGET = 600; // כמה chunks לחשב embedding בריצה אחת (השאר בהרצה הבאה)
const REPRESENTATIVE_K = 8;      // כמה chunks מייצגים לשמור
const REPRESENTATIVE_MMR_LAMBDA = 0.7; // איזון מרכזיות מול גיוון

// centroid (ממוצע) של מפת וקטורים → Float32Array (לא מנורמל; cosineSim מטפל בנרמול).
function computeCentroid(vectorList) {
  if (!vectorList.length) return null;
  const dim = vectorList[0].length;
  const c = new Float32Array(dim);
  for (const v of vectorList) {
    for (let i = 0; i < dim; i += 1) c[i] += v[i];
  }
  for (let i = 0; i < dim; i += 1) c[i] /= vectorList.length;
  return c;
}

/**
 * בוחר עד k chunks מייצגים: מרכזיים (קרובים ל-centroid) אך מגוונים (MMR).
 * @param {Array<{id:string, vec:Float32Array}>} items
 * @param {number} k
 * @returns {string[]} מזהי chunks בסדר מרכזיות/MMR
 */
function selectRepresentativeChunks(items, k = REPRESENTATIVE_K) {
  if (!items.length) return [];
  const centroid = computeCentroid(items.map((it) => it.vec));
  if (!centroid) return [];
  const scored = items
    .map((it) => ({ ...it, centrality: cosineSim(it.vec, centroid) }))
    .sort((a, b) => b.centrality - a.centrality);

  const kClamped = Math.max(1, Math.min(k, scored.length));
  const selected = [];
  const pool = [...scored];
  while (selected.length < kClamped && pool.length) {
    let bestIdx = 0;
    let bestVal = -Infinity;
    for (let i = 0; i < pool.length; i += 1) {
      let maxSim = 0;
      for (const pick of selected) {
        const sim = cosineSim(pool[i].vec, pick.vec);
        if (sim > maxSim) maxSim = sim;
      }
      const mmr = (REPRESENTATIVE_MMR_LAMBDA * pool[i].centrality) - ((1 - REPRESENTATIVE_MMR_LAMBDA) * maxSim);
      if (mmr > bestVal) { bestVal = mmr; bestIdx = i; }
    }
    selected.push(pool.splice(bestIdx, 1)[0]);
  }
  return selected.map((s) => s.id);
}

/**
 * מחשב embeddings סמנטיים לכל chunk שחסר להם וקטור (מקומי, WASM, בלי מפתח API),
 * שומר int8 ב-styleEmbeddingStore, ובוחר representativeChunkIds (מרכז+MMR) לפרופיל.
 * DEGRADE חינני: אם שכבת ה-embeddings לא זמינה (טעינת מודל נכשלה) — מסמן
 * embeddingMeta.available=false + reason ולא נכשל. נקרא מ-ingestAndAnalyze (טרום-API).
 * @param {{onProgress?:function, force?:boolean}} opts
 * @returns {Promise<{available:boolean, embedded:number, coverage:number, reason?:string, representativeCount:number}>}
 */
export async function computeChunkEmbeddings({ onProgress = null, force = false } = {}) {
  // הוקטורים יושבים ב-IndexedDB — בלי ההמתנה getEmbeddedChunkIds מחזיר ריק וכל
  // הוקטורים היו מחושבים מחדש בכל העלאה.
  try { await ensureEmbeddingStoreReady(); } catch {}
  const { profile, engine } = loadEngine();
  const chunks = getChunks();

  if (!chunks.length) {
    engine.representativeChunkIds = [];
    engine.embeddingMeta = { available: false, model: STYLE_EMBEDDING_MODEL_ID, dim: STYLE_EMBEDDING_DIM, count: 0, coverage: 0, reason: 'no-chunks', at: Date.now() };
    saveEngine(profile, engine);
    return { available: false, embedded: 0, coverage: 0, reason: 'no-chunks', representativeCount: 0 };
  }

  // prune וקטורים של chunks שכבר לא קיימים.
  const liveIds = new Set(chunks.map((c) => String(c.id)));
  pruneVectors(liveIds);

  // אילו chunks חסרים וקטור תקף?
  const already = getEmbeddedChunkIds();
  const missingAll = force
    ? chunks
    : chunks.filter((c) => !already.has(String(c.id)));
  // תקציב לריצה אחת: עם caps של אלפי chunks, embedding של הכל בבת אחת תוקע את
  // ההעלאה לדקות. השאר יחושב בהעלאה/ניתוח הבא (הכיסוי מדווח ב-embeddingMeta).
  const missing = missingAll.slice(0, EMBED_PER_RUN_BUDGET);

  if (missing.length) {
    const vectors = await embedTexts(missing.map((c) => String(c.text || '')), {
      kind: 'passage',
      onProgress,
    });
    if (!vectors) {
      // degrade — המודל לא נטען/נכשל. שומרים דגל, לא נכשלים.
      const reason = String(isEmbeddingUnavailable() || 'embedding-unavailable');
      engine.embeddingMeta = { available: false, model: STYLE_EMBEDDING_MODEL_ID, dim: STYLE_EMBEDDING_DIM, count: already.size, coverage: chunks.length ? already.size / chunks.length : 0, reason, at: Date.now() };
      saveEngine(profile, engine);
      return { available: false, embedded: 0, coverage: engine.embeddingMeta.coverage, reason, representativeCount: (engine.representativeChunkIds || []).length };
    }
    const entries = [];
    for (let i = 0; i < missing.length; i += 1) {
      if (vectors[i]) entries.push({ chunkId: String(missing[i].id), vector: vectors[i] });
    }
    putVectors(entries);
  }

  // בחירת מייצגים מכל הוקטורים הקיימים כעת.
  const allIds = chunks.map((c) => String(c.id));
  const vecMap = getVectors(allIds);
  const items = [];
  for (const id of allIds) {
    const v = vecMap.get(id);
    if (v) items.push({ id, vec: v });
  }
  const representativeChunkIds = selectRepresentativeChunks(items, REPRESENTATIVE_K);
  const coverage = chunks.length ? items.length / chunks.length : 0;

  engine.representativeChunkIds = representativeChunkIds;
  engine.embeddingMeta = {
    available: items.length > 0,
    model: STYLE_EMBEDDING_MODEL_ID,
    dim: STYLE_EMBEDDING_DIM,
    count: items.length,
    coverage,
    reason: items.length ? '' : 'no-vectors',
    at: Date.now(),
  };
  saveEngine(profile, engine);

  return {
    available: items.length > 0,
    embedded: missing.length,
    coverage,
    representativeCount: representativeChunkIds.length,
  };
}

// ---------- getRepresentativeExcerpts ----------

const REPRESENTATIVE_EXCERPTS_MAX = 8;
const REPRESENTATIVE_EXCERPTS_MAX_CHARS = 6000;

/**
 * מחזיר את הקטעים המייצגים ביותר של המשתמש, לשימוש כ-excerpts בפרומפט (מקומי או
 * להדבקה חיצונית). מקור ראשון: engine.representativeChunkIds — נבחרו כבר ע"י שכבת
 * ה-embeddings (centroid + MMR לגיוון). fallback כשאין embeddings: דגימת stride על
 * כל הקורפוס, באותה רוח של buildPatternBatches — פריסה על כל המסמכים, לא רק ההתחלה.
 * לעולם לא זורק; קורפוס ריק → [].
 * @param {{max?:number, maxChars?:number}} opts
 * @returns {string[]}
 */
export function getRepresentativeExcerpts({ max = REPRESENTATIVE_EXCERPTS_MAX, maxChars = REPRESENTATIVE_EXCERPTS_MAX_CHARS } = {}) {
  const capCount = Math.max(1, Number(max) || REPRESENTATIVE_EXCERPTS_MAX);
  const capChars = Math.max(1, Number(maxChars) || REPRESENTATIVE_EXCERPTS_MAX_CHARS);
  try {
    const chunks = (getChunks() || []).filter(isPlainObject);
    if (!chunks.length) return [];

    const picked = [];
    const seen = new Set();
    const push = (text) => {
      const s = String(text || '').trim();
      if (!s || seen.has(s)) return;
      seen.add(s);
      picked.push(s);
    };

    // 1 — מייצגים שכבר נבחרו סמנטית (embeddings). מתעלמים ממזהים שנמחקו מאז.
    try {
      const byId = new Map();
      for (const c of chunks) byId.set(String(c.id), String(c.text || ''));
      const { engine } = loadEngine();
      const ids = Array.isArray(engine?.representativeChunkIds) ? engine.representativeChunkIds : [];
      for (const id of ids) {
        if (picked.length >= capCount) break;
        push(byId.get(String(id)));
      }
    } catch {
      // אין engine/embeddings — נופלים ל-stride
    }

    // 2 — fallback: דגימה בפריסה אחידה על כל הקורפוס.
    if (!picked.length) {
      const list = chunks.map((c) => String(c.text || '').trim()).filter(Boolean);
      const stride = Math.max(1, Math.ceil(list.length / capCount));
      for (let i = 0; i < list.length && picked.length < capCount; i += stride) push(list[i]);
      // אם ה-dedupe הותיר פחות מהמכסה — משלימים מההתחלה.
      for (let i = 0; i < list.length && picked.length < capCount; i += 1) push(list[i]);
    }

    // 3 — תקרת תווים כוללת: מורידים מהסוף עד שנכנסים.
    const out = [];
    let total = 0;
    for (const text of picked) {
      if (!out.length && text.length > capChars) { out.push(text.slice(0, capChars)); break; }
      if (total + text.length > capChars) break;
      out.push(text);
      total += text.length;
    }
    return out;
  } catch {
    return [];
  }
}

// ---------- runLocalPatternBatches ----------

/**
 * לולאת החילוץ המקומית המשותפת (F4/F8): בונה באטצ'ים מכל ה-chunks, מריץ אותם סדרתית
 * מול המודל הזול (cheap + CHEAP_EXTRACTION_EXCLUDE), וסופר כשלי-באטצ'. מחזיר ריק אם אין
 * chunks או אין באטצ'ים. משמש גם את runQualitativeAnalysis וגם את applyExternalPatternAnalyses
 * כדי שכשלי הבאטצ'ים ייספרו זהה בשני המסלולים (כולל ה-combined).
 * @returns {Promise<{results:Array<object>, failed:number, attempted:number}>}
 */
async function runLocalPatternBatches() {
  const chunks = getChunks();
  if (!chunks.length) return { results: [], failed: 0, attempted: 0 };

  const batches = buildPatternBatches(chunks, {
    maxChars: PATTERN_BATCH_MAX_CHARS,
    maxBatches: PATTERN_BATCH_MAX_BATCHES,
  });
  if (!batches.length) return { results: [], failed: 0, attempted: 0 };

  const invokeModel = (prompt) => chatWithActiveProvider(prompt, '', '', {
    ...buildStyleLlmOptions('Style Pattern Extraction', `style-patterns-${Date.now()}`, { cheap: true, cheapExclude: CHEAP_EXTRACTION_EXCLUDE }),
  });

  // קריאות סדרתיות (מונע rate-limit storm); כשלון בבאטצ' בודד — מדלגים, סופרים הצלחות.
  const results = [];
  for (const batch of batches) {
    try {
      // deep:true — המסלול המקומי מבקש את אותו בלוק עמוק שהמסלול החיצוני קיבל עד היום
      // (structuralSignature + avoidedPhrases). המיזוג עצמו ב-finishQualitativeMerge.
      const res = await extractQualitativePatterns(batch, invokeModel, { deep: true });
      if (isPlainObject(res)) results.push(res);
    } catch {
      // batch נכשל — ממשיכים
    }
  }

  return { results, failed: Math.max(0, batches.length - results.length), attempted: batches.length };
}

// ---------- runQualitativeAnalysis ----------

/**
 * מריץ חילוץ דפוסים איכותניים multi-batch: מחלק את כל הקורפוס לבאטצ'ים,
 * קורא ל-LLM על כל אחד (סדרתי, סובלני לכשלים), ממזג בקונצנזוס, מוסיף ביטויי-חתימה
 * שנכרו דטרמיניסטית, גוזר blacklist אוטומטי, ומעדכן ודאות. מדלג אם אין chunks או
 * אם הדפוסים טריים (אלא אם force=true).
 * @param {{force?:boolean}} opts
 * @returns {Promise<{skipped:boolean, reason?:string, engine?:object}>}
 */
export async function runQualitativeAnalysis({ force = false } = {}) {
  const { profile, engine } = loadEngine();

  const patternsFresh = engine.qualitativePatterns.length > 0 && !engine.qualitativePatternsStale;
  if (!force && patternsFresh) {
    return { skipped: true, reason: 'fresh' };
  }

  const chunks = getChunks();
  if (chunks.length < 1) {
    return { skipped: true, reason: 'no-chunks' };
  }

  // בדיקת 'no-excerpts' נשמרת לפני הלולאה (כדי לשמר את reason המדויק) — הלולאה עצמה
  // מרוכזת ב-runLocalPatternBatches (F4), שיבנה מחדש את אותם באטצ'ים.
  const batches = buildPatternBatches(chunks, {
    maxChars: PATTERN_BATCH_MAX_CHARS,
    maxBatches: PATTERN_BATCH_MAX_BATCHES,
  });
  if (!batches.length) {
    return { skipped: true, reason: 'no-excerpts' };
  }

  const { results, failed } = await runLocalPatternBatches();

  // נכס-ייחוס האוכלוסייה לניגוד-חתימה בכריית ה-n-gram (graceful: ריק על כישלון).
  let popNgramFreq = null;
  try { const ref = await loadStyleReference(); popNgramFreq = ref && ref.ngramFreq ? ref.ngramFreq : null; } catch { popNgramFreq = null; }

  const saved = finishQualitativeMerge(profile, engine, results, {
    extraMeta: { llmBatchesFailed: failed },
    populationNgramFreq: popNgramFreq,
  });
  // llmAllFailed — כל הבאטצ'ים נכשלו (אין ספק / מפתח שבור): הקוראים מציגים אזהרה במקום ✓.
  return { skipped: false, engine: saved, llmBatchesFailed: failed, llmAllFailed: failed > 0 && results.length === 0 };
}

// ---------- אימות avoidedPhrases מול הקורפוס האמיתי ----------

// למה זה קיים: avoidedPhrases מגיע מטענה של מודל ("הכותב נמנע מ-X") שאף אחד לא בדק מול
// מה שהכותב באמת כותב. במדידה על הקורפוס האמיתי המודל הכריז שהמשתמש נמנע מ"כפי ש",
// "לכן", "כמו כן", "על כן" — בזמן ש"כפי ש" הוא מילת הקישור הרביעית בשכיחותה אצלו,
// ובמקביל "ניתן לראות כי" נכרה כדפוס חתימה (docFraction 0.364) בעוד "כפי שניתן לראות"
// ישב ב-blacklist. כלומר הפרומפט אמר למודל בו-זמנית "זו החתימה שלך" ו"לעולם אל תכתוב את זה".
// לכן כל ביטוי נכנס עובר אימות מול הקורפוס לפני שהוא נחסם, וחתימה מנצחת הימנעות.

// ספי האימות. הרציונל: הופעה בודדת במסמך בודד יכולה להיות ציטוט ממקור או מקריות, ולכן
// אינה מוכיחה הרגל. שני מסמכים שונים = ההרגל חוזר על פני עבודות (אותה לוגיקה של
// docFraction בכריית החתימות), ושלוש הופעות באותו מסמך = שימוש מכוון ולא החלקה.
const AVOIDED_VERIFY_MIN_DOCS = 2;
const AVOIDED_VERIFY_MIN_HITS = 3;

// אותיות "מילה" לצורך גבולות התאמה — עברית + לטינית + גרש/גרשיים שבתוך מילה.
const WORDISH_CHAR_RE = /[A-Za-z\u0590-\u05FF\uFB1D-\uFB4F]/;
// תחיליות בנות אות אחת שמתחברות למילה בעברית (ו/ש/ה/ב/כ/ל/מ) — מותר שיקדמו להתאמה.
const HEB_ONE_LETTER_PREFIX = new Set(['ו', 'ש', 'ה', 'ב', 'כ', 'ל', 'מ']);

// נרמול אחיד לצד הקורפוס ולצד הביטוי: כיווץ רווחים, איחוד תווי מרכאות/גרש, lowercase.
// ⚠️ בלי \b בשום מקום — הוא שבור לעברית (גוצ'א מתועד בריפו).
const normalizeForMatch = (value) => String(value || '')
  .replace(/[״“”]/g, '"')
  .replace(/[׳’]/g, "'")
  .replace(/\s+/g, ' ')
  .toLowerCase()
  .trim();

/**
 * האם ההתאמה באינדקס i היא מילה שלמה (ולא שבר של מילה ארוכה יותר).
 * אחרי ההתאמה אסורה אות (כי → כיצד ⇒ נפסל). לפניה מותר או תו שאינו אות, או תחילית
 * בת אות אחת שלפניה תו שאינו אות (וכי / שכן) — כך שהחיפוש נשאר תת-מחרוזתי אבל לא תמים.
 */
function isWholeWordHit(hay, idx, len) {
  const after = hay[idx + len];
  if (after && WORDISH_CHAR_RE.test(after)) return false;
  const before = hay[idx - 1];
  if (!before || !WORDISH_CHAR_RE.test(before)) return true;
  if (!HEB_ONE_LETTER_PREFIX.has(before)) return false;
  const before2 = hay[idx - 2];
  return !before2 || !WORDISH_CHAR_RE.test(before2);
}

/**
 * בונה **פעם אחת** אינדקס חיפוש מהקורפוס: טקסט מנורמל אחד לכל מסמך.
 * ⚠️ חובה לבנות מחוץ ללולאת הביטויים — הקורפוס הוא ~646 קטעים / ~266k תווים, ובנייה
 * מחדש לכל ביטוי הייתה סריקה כפולת-עשרות. לעולם לא זורק; כשל → null (= "לא ידוע").
 * @returns {Array<string>|null} טקסט מנורמל פר-מסמך
 */
function buildCorpusMatchIndex() {
  try {
    const chunks = (getChunks() || []).filter(isPlainObject);
    if (!chunks.length) return null;
    const byDoc = new Map();
    for (const c of chunks) {
      const text = String(c?.text || '');
      if (!text.trim()) continue;
      // קטע gold ללא docId נחשב מסמך עצמאי (id הקטע) — לא לאחד הכול לדלי אחד.
      const key = String(c?.docId || `chunk:${c?.id || ''}`);
      const prev = byDoc.get(key);
      byDoc.set(key, prev ? `${prev} ${text}` : text);
    }
    const out = [];
    for (const text of byDoc.values()) {
      const norm = normalizeForMatch(text);
      if (norm) out.push(norm);
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

/**
 * סופר הופעות של ביטוי בקורפוס: כמה מסמכים שונים מכילים אותו וכמה הופעות בסך הכול.
 * @param {Array<string>|null} index תוצר buildCorpusMatchIndex
 * @param {string} phrase
 * @returns {{docs:number, hits:number}}
 */
function countPhraseInCorpus(index, phrase) {
  const needle = normalizeForMatch(phrase);
  if (!Array.isArray(index) || !needle) return { docs: 0, hits: 0 };
  let docs = 0;
  let hits = 0;
  for (const doc of index) {
    let inThisDoc = 0;
    let from = 0;
    for (;;) {
      const idx = doc.indexOf(needle, from);
      if (idx < 0) break;
      if (isWholeWordHit(doc, idx, needle.length)) inThisDoc += 1;
      from = idx + 1;
    }
    if (inThisDoc > 0) { docs += 1; hits += inThisDoc; }
  }
  return { docs, hits };
}

// מסיר תחילית בת אות אחת מאסימון, כדי ש"שניתן" ו"ניתן" ייחשבו לאותו גרעין בהשוואת
// חפיפה מול דפוסי חתימה. רק לצורך ההשוואה — לא נוגע בטקסט שנשמר.
const stripHebPrefix = (token) => (
  token.length > 2 && HEB_ONE_LETTER_PREFIX.has(token[0]) ? token.slice(1) : token
);

const coreTokens = (value) => normalizeForMatch(value)
  .replace(/["'()[\]{}.,;:!?־–—-]/g, ' ')
  .split(' ')
  .map((t) => stripHebPrefix(t.trim()))
  .filter((t) => t.length > 1);

/**
 * גרעיני החתימה שנלמדו — הביטוי שבמרכאות אם יש, אחרת ה-label המלא.
 * @param {object} engine
 * @returns {Array<{label:string, core:string}>}
 */
function collectSignatureCores(engine) {
  const patterns = Array.isArray(engine?.qualitativePatterns) ? engine.qualitativePatterns : [];
  const out = [];
  for (const p of patterns) {
    if (!isPlainObject(p)) continue;
    const label = normalizeForMatch(p.label);
    if (!label) continue;
    const quoted = label.match(/"([^"]{2,})"/);
    out.push({ label, core: quoted ? normalizeForMatch(quoted[1]) : label });
  }
  return out;
}

/**
 * חתימה מנצחת הימנעות: ביטוי שהוא חלק מדפוס חתימה שנלמד לא ייחסם לעולם.
 * שלוש בדיקות, מהזולה ליקרה:
 *  1. ה-label מכיל את הביטוי (תופס "מילות קישור מועדפות: ... כפי ש ...").
 *  2. הכלה דו-כיוונית מול הגרעין המצוטט.
 *  3. רצף של ≥2 אסימוני-גרעין משותפים — כך ש"כפי שניתן לראות" מזוהה מול חתימת
 *     "ניתן לראות כי" (הבדל של תחילית בלבד), שהיא בדיוק ההתנגשות שנמדדה.
 */
function overlapsSignature(phrase, cores) {
  const norm = normalizeForMatch(phrase);
  if (!norm || !Array.isArray(cores) || !cores.length) return false;
  const phraseTokens = coreTokens(norm);
  for (const { label, core } of cores) {
    if (label.includes(norm)) return true;
    if (core && (core.includes(norm) || norm.includes(core))) return true;
    if (phraseTokens.length >= 2) {
      const coreToks = coreTokens(core);
      for (let i = 0; i + 1 < phraseTokens.length; i += 1) {
        const pair = `${phraseTokens[i]} ${phraseTokens[i + 1]}`;
        for (let j = 0; j + 1 < coreToks.length; j += 1) {
          if (pair === `${coreToks[j]} ${coreToks[j + 1]}`) return true;
        }
      }
    }
  }
  return false;
}

// ---------- foldDeepSignals ----------

/**
 * A5/A6/A7 — מקפל את שני האותות העמוקים (חתימה מבנית + ניסוחים נמנעים) אל תוך המנוע.
 * מופרד מ-finishQualitativeMerge כדי שגם הדבקה חיצונית שאין בה דפוסים כלל — ולכן היא
 * לא עוברת בזנב המיזוג המלא — עדיין תתרום את מה שכן נמצא בה. משנה את engine במקום.
 * @param {object} engine
 * @param {Array<{structuralSignature?:object, avoidedPhrases?:Array}>} deepResults
 * @returns {{structuralKeysLearned:number, avoidedPhrasesAdded:number, avoidedPhrasesRejected:number}}
 */
function foldDeepSignals(engine, deepResults) {
  const list = (Array.isArray(deepResults) ? deepResults : []).filter(isPlainObject);
  // חתימה מבנית: קיפול פר-מפתח. ערך קיים ולא-ריק מנצח (mergeStructuralSignature), כך
  // שחתימה שנלמדה קודם לא נדרסת ע"י באטצ' חלש יותר.
  engine.structuralSignature = list.reduce(
    (acc, r) => mergeStructuralSignature(acc, r?.structuralSignature),
    engine.structuralSignature || {},
  );

  // avoidedPhrases: מחרוזות ליטרליות שהמודל זיהה שהכותב *נמנע* מהן → blacklist.auto.
  // ⚠️ deriveAutoBlacklist דורס את auto לגמרי (הוא גוזר מ-AI_CLICHE_BLACKLIST בלבד), ולכן
  // המיזוג חייב לקרות *אחריו*. שימור הישן נעשה סלקטיבית: פריטים שאינם קלישאות מהרשימה
  // הקבועה (כלומר ביטויים שנלמדו בהרצה קודמת) שורדים; קלישאות שה-derive הסיר במכוון
  // ("זה בעצם הרגל של המשתמש") לא חוזרות מהדלת האחורית. removed של המשתמש חוסם תמיד.
  const clicheSet = new Set((Array.isArray(AI_CLICHE_BLACKLIST) ? AI_CLICHE_BLACKLIST : []).map((c) => String(c || '').trim()));
  const prevAuto = Array.isArray(engine.blacklist?.auto) ? engine.blacklist.auto : [];
  const learnedBefore = prevAuto.map((p) => String(p || '').trim()).filter((p) => p && !clicheSet.has(p));
  const removedSet = new Set(
    (Array.isArray(engine.blacklist?.removed) ? engine.blacklist.removed : []).map((p) => String(p || '').trim()).filter(Boolean),
  );
  const incomingAvoided = [];
  for (const r of list) {
    const phrases = Array.isArray(r?.avoidedPhrases) ? r.avoidedPhrases : [];
    for (const phrase of phrases) {
      const s = String(phrase || '').trim();
      if (s) incomingAvoided.push(s);
    }
  }
  // ⚠️ אימות מול הקורפוס לפני חסימה (ראו הבלוק "אימות avoidedPhrases" למעלה). ביטוי
  // שהמשתמש באמת כותב, או שהוא חלק מדפוס חתימה שנלמד, נזרק מרשימת החסימה — טענת המודל
  // "הוא נמנע מזה" הוכחה כשגויה. חל גם על learnedBefore, אחרת blacklist מורעל מהרצה
  // קודמת (לכן / כמו כן / כפי ש) שורד לנצח ולא מתרפא לעולם.
  // האינדקס נבנה **פעם אחת** כאן, מחוץ ללולאה. אינדקס null (אין קורפוס / כשל) ⇒ אין
  // אימות ⇒ התנהגות קודמת נשמרת לכל ביטוי. לעולם לא מפיל את הצינור.
  const corpusIndex = buildCorpusMatchIndex();
  const signatureCores = collectSignatureCores(engine);
  let avoidedPhrasesRejected = 0;
  const verifyCache = new Map();
  const isUserVoice = (phrase) => {
    const key = normalizeForMatch(phrase);
    if (!key) return false;
    if (verifyCache.has(key)) return verifyCache.get(key);
    let verdict = false;
    try {
      // חתימה מנצחת הימנעות — נבדק גם כשאין קורפוס זמין.
      if (overlapsSignature(phrase, signatureCores)) verdict = true;
      else if (corpusIndex) {
        const { docs, hits } = countPhraseInCorpus(corpusIndex, phrase);
        verdict = docs >= AVOIDED_VERIFY_MIN_DOCS || hits >= AVOIDED_VERIFY_MIN_HITS;
      }
    } catch {
      verdict = false; // כשל אימות ⇒ התנהגות קודמת (הביטוי נחסם), לא שבירה
    }
    verifyCache.set(key, verdict);
    return verdict;
  };
  const verifiedLearnedBefore = learnedBefore.filter((p) => {
    if (!isUserVoice(p)) return true;
    avoidedPhrasesRejected += 1;
    return false;
  });
  const verifiedIncoming = incomingAvoided.filter((p) => {
    if (!isUserVoice(p)) return true;
    avoidedPhrasesRejected += 1;
    return false;
  });

  const knownBefore = new Set(prevAuto.map((p) => String(p || '').trim()).filter(Boolean));
  const mergedAuto = [];
  const seenAuto = new Set();
  let avoidedPhrasesAdded = 0;
  // ⚠️ סדר מכוון: ביטויים שנלמדו מהכותב קודמים לקלישאות הגנריות. buildStyleEngineInjectionBlock
  // מזריק רק את 20 הראשונות מ-auto+user, ו-AI_CLICHE_BLACKLIST לבדה ארוכה מזה — כלומר בסדר
  // ההפוך שום ביטוי אישי לא היה מגיע לפרומפט אף פעם. הקלישאות הגנריות נתפסות ממילא בגלאי.
  for (const item of [...verifiedLearnedBefore, ...verifiedIncoming, ...deriveAutoBlacklist(engine)]) {
    const s = String(item || '').trim();
    if (!s || seenAuto.has(s) || removedSet.has(s)) continue;
    seenAuto.add(s);
    mergedAuto.push(s);
    if (!knownBefore.has(s) && !clicheSet.has(s)) avoidedPhrasesAdded += 1;
    if (mergedAuto.length >= CAP_BLACKLIST_AUTO) break;
  }
  engine.blacklist = { ...engine.blacklist, auto: mergedAuto };

  return {
    structuralKeysLearned: Object.values(engine.structuralSignature || {})
      .filter((v) => String(v || '').trim()).length,
    avoidedPhrasesAdded,
    avoidedPhrasesRejected,
  };
}

// ---------- סינון negativeSpace: סגנון בלבד, לא מדיניות תוכן ----------

// למה זה קיים: negativeSpace מוזרק לכל פרומפט כ-כללי "לעולם לא" — איסור מוחלט. כששואלים
// מודל "ממה הכותב נמנע" הוא נודד מרטוריקה למדיניות תוכן, ואז חוק ציטוט נכנס בדלת האחורית
// כאילו היה הרגל סגנוני. במדידה על הקורפוס האמיתי נכנסו כך "ציטוטים ישירים ממקורות
// (העדפה לפרפרזה)" ו"הבעת דעה אישית ללא ביסוס" — כלומר האפליקציה אמרה למודל האקדמי
// לעולם לא לצטט מקור ישירות. זה שינוי התנהגות תוכן, לא סגנון.
// הסוכן השני מהדק את ניסוח הפרומפט; זה השכבה השנייה שחייבת להחזיק גם כשמודל מתעלם ממנו.
const NEGATIVE_SPACE_CONTENT_TERMS = [
  'ציטוט', 'ציטט', 'מצטט', 'מקור', 'מקורות', 'פרפרזה', 'ביבליוגרפ', 'הפניה', 'הפניות',
  'מראה מקום', 'ביסוס', 'ראיה', 'ראיות', 'נתונים', 'ממצא', 'דעה אישית', 'עמדה אישית',
];

/**
 * מסנן מ-negativeSpace פריטים שהם כלל תוכן/מקורות ולא הרגל סגנוני.
 * לעולם לא זורק; קלט לא-מערך → []. ה-dedupe/cap (CAP_NEGATIVE=12) נשאר ב-normalizeStyleEngine.
 * @param {Array} items
 * @returns {Array<string>}
 */
function filterContentRulesFromNegativeSpace(items) {
  const list = Array.isArray(items) ? items : [];
  return list.filter((item) => {
    try {
      // הפריטים הם מחרוזות, אבל buildStyleEngineDescription יודע גם {label} — תומכים בשניהם.
      const text = typeof item === 'string' ? item : String(item?.label || '');
      const norm = normalizeForMatch(text);
      if (!norm) return true;
      return !NEGATIVE_SPACE_CONTENT_TERMS.some((term) => norm.includes(term));
    } catch {
      return true; // כשל סינון ⇒ שומרים את הפריט, לא מפילים את המיזוג
    }
  });
}

// ---------- finishQualitativeMerge ----------

/**
 * זנב המיזוג האיכותני — משותף למסלול המקומי (runQualitativeAnalysis) ולמסלול החיצוני
 * (applyExternalPatternAnalyses). מקבל מערך תוצאות-parse של באטצ'ים; ממזג קונצנזוס +
 * כרייה דטרמיניסטית, dedupe קנוני, קיורציה, negativeSpace, blacklist auto, מעדכן
 * extractionMeta (עם מיזוג extraMeta) + confidence, ושומר. מחזיר את המנוע השמור.
 * @param {object} profile
 * @param {object} engine
 * @param {Array<{patterns:Array, negativeSpace:Array}>} batchResults
 * @param {{extraMeta?:object, populationNgramFreq?:object, deepOnlyResults?:Array}} opts
 *   populationNgramFreq — טבלת n-gram אוכלוסייתית (ref.ngramFreq) לניגוד-חתימה בכרייה.
 *   deepOnlyResults — תוצאות parse בלי דפוסים אך עם אות עמוק (structuralSignature/avoidedPhrases).
 *   ⚠️ הן *לא* נכנסות ל-batchCount ולא לקונצנזוס: תוצאה בלי דפוסים הייתה מדללת את מונה
 *   הבאטצ'ים ומורידה את משקל הדפוסים שכן נמצאו. הן תורמות רק לקיפול העמוק שלמטה.
 * @returns {object} savedEngine
 */
function finishQualitativeMerge(profile, engine, batchResults, { extraMeta = {}, populationNgramFreq = null, deepOnlyResults = [] } = {}) {
  const results = (Array.isArray(batchResults) ? batchResults : []).filter(isPlainObject);
  const batchCount = results.length;
  const deepResults = [
    ...results,
    ...(Array.isArray(deepOnlyResults) ? deepOnlyResults : []).filter(isPlainObject),
  ];

  const consensus = consensusMergePatterns(results, { batchCount });

  // ביטויי-חתימה דטרמיניסטיים — ground truth; חייבים לשרוד את המיזוג.
  const minedPatterns = mineSignatureNgrams(getChunks(), { populationNgramFreq });
  // נוסחאות מבניות (פתיחי/סיומי פסקה) — דטרמיניסטיות גם הן, אותה עדיפות-שרידות.
  const minedFormulas = mineStructuralFormulas(getChunks(), {});

  engine.qualitativePatterns = mergeQualitativePatterns(
    mergeQualitativePatterns(
      mergeQualitativePatterns(engine.qualitativePatterns, consensus.patterns),
      minedPatterns,
    ),
    minedFormulas,
  );
  // Fix 3: dedupe סופי לפי מפתח קנוני חוצה-הרצות — מבטיח שאותה תופעה (LLM מנוסח שונה +
  // חתימה שנכרתה) לא תופיע פעמיים ושמפתח יציב שורד. שומר את הראשון (weight יורד כבר ממוין).
  {
    const seen = new Set();
    engine.qualitativePatterns = engine.qualitativePatterns.filter((p) => {
      const key = canonicalPatternKey(p);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  // קיורציה — נקודת סינון מרכזית אחת: מסיר דפוסים שהמשתמש דחה ("לא אני"), כך שהם
  // לא חוזרים גם אחרי ניתוח מחדש. (מכני המיזוג/קונצנזוס נשארים ללא שינוי.)
  engine.qualitativePatterns = filterRejectedPatterns(
    engine.qualitativePatterns,
    engine.rejectedPatternKeys,
  );
  // negativeSpace: מיזוג + dedupe/cap מטופל ב-normalizeStyleEngine.
  // הסינון חל גם על מה שכבר שמור, כדי שכלל תוכן שנקלט בהרצה קודמת יתרפא ולא ישרוד לנצח.
  engine.negativeSpace = filterContentRulesFromNegativeSpace([
    ...(Array.isArray(engine.negativeSpace) ? engine.negativeSpace : []),
    ...(Array.isArray(consensus.negativeSpace) ? consensus.negativeSpace : []),
  ]);
  const { structuralKeysLearned, avoidedPhrasesAdded, avoidedPhrasesRejected } = foldDeepSignals(engine, deepResults);
  // "מוכן" רק אם באמת התקבלו תוצאות: כשכל הבאטצ'ים נכשלו (batchCount=0 עם כשלונות ב-extraMeta)
  // הדפוסים נשארים stale, כדי שהריצה הבאה תנסה שוב ושה-UI לא יציג ✓ על פרופיל בן 0 דפוסים.
  const failedBatchCount = Number((isPlainObject(extraMeta) ? extraMeta.llmBatchesFailed : 0)) || 0;
  engine.qualitativePatternsStale = batchCount === 0 && failedBatchCount > 0;
  engine.lastAnalysisAt = Date.now();
  engine.extractionMeta = {
    batches: batchCount,
    crossValidated: consensus.crossValidated,
    minedSignatures: minedPatterns.length + minedFormulas.length,
    // כמה מ-5 מפתחות החתימה המבנית מלאים בפועל, וכמה ביטויי-הימנעות חדשים נוספו.
    structuralKeysLearned,
    avoidedPhrasesAdded,
    // כמה ביטויים נדחו באימות מול הקורפוס. extractionMeta ב-normalizeStyleEngine הוא
    // allow-list קשיח, והמפתח הזה כבר נמצא בה (styleProfileService) — כלומר הוא נשמר
    // ושורד את ה-save, ולא נמחק כפי שהיה בעבר.
    avoidedPhrasesRejected,
    at: Date.now(),
    llmBatchesFailed: 0,
    ...(isPlainObject(extraMeta) ? extraMeta : {}),
  };
  engine.confidence = recomputeConfidence(engine);

  return saveEngine(profile, engine);
}

// ---------- מסלול הדבקה חיצוני (external paste pipeline) ----------

// פענוח JSON גמיש. עד 12.8.26 ישבה כאן גרסה מצומצמת (fences + JSON.parse + לכידת
// {...} ראשון) שנפלה על גרשיים חכמים, פסיק עוקב ומפתח-על עוטף — ואז המטא נזרק בשקט
// והמשתמש קיבל "לא זוהה JSON תקין". עכשיו מקור-אמת אחד עם מסלול הדפוסים.
// normalizeExternalSchemaJson מחזיר את הסכימה בשמות הקנוניים גם כשהמודל קינן
// אותה תחת מפתח-על או תרגם את המפתחות לעברית.
const decodeLooseJson = (raw) => normalizeExternalSchemaJson(raw);

/**
 * קולט פלטי-JSON שהמשתמש הדביק מספק חיצוני, ומזין אותם לאותו pipeline של דפוסים.
 * כל הדבקה נספרת כבאטצ' (≥3 → cross-validation אמיתי). אופציונלית מריץ גם באטצ'ים
 * מקומיים (includeLocalLlm). בנוסף מחלץ מטא (style/coverPageDefaults/profileSummary)
 * וממזג לפרופיל (applyMetaPatch).
 * @param {string[]} rawTexts
 * @param {{includeLocalLlm?:boolean, applyMetaPatch?:boolean}} opts
 * @returns {Promise<{ok:boolean, engine?:object, metaPatch?:object|null, externalBatches?:number, totalBatches?:number, crossValidated?:boolean, error?:string}>}
 */
export async function applyExternalPatternAnalyses(rawTexts = [], { includeLocalLlm = false, applyMetaPatch = true } = {}) {
  const list = (Array.isArray(rawTexts) ? rawTexts : [])
    .map((r) => String(r || ''))
    .filter((r) => r.trim());

  // 1 — parse סלחני-type לכל הדבקה. תוצאות עם דפוסים בלבד → externalResults.
  // הדבקה בלי דפוסים אך עם אות עמוק (חתימה מבנית / ניסוחים נמנעים) לא נזרקת: היא נכנסת
  // ל-deepExternalOnly ותורמת רק לקיפול העמוק, בלי לדלל את מונה הבאטצ'ים של הקונצנזוס.
  const externalResults = [];
  const deepExternalOnly = [];
  for (const raw of list) {
    const parsed = parsePatternExtractionResult(raw, { lenientTypes: true });
    if (!isPlainObject(parsed)) continue;
    if (Array.isArray(parsed.patterns) && parsed.patterns.length > 0) {
      externalResults.push(parsed);
      continue;
    }
    const hasStructure = Object.values(parsed.structuralSignature || {})
      .some((v) => String(v || '').trim());
    const hasAvoided = Array.isArray(parsed.avoidedPhrases) && parsed.avoidedPhrases.length > 0;
    if (hasStructure || hasAvoided) deepExternalOnly.push(parsed);
  }

  // 2 — פענוח מטא (style/coverPageDefaults/profileSummary) מראש: פלט לגיטימי עם
  // patterns:[] אבל מטא מלא הוא תקין ואסור לזרוק אותו (F2). שומרים על סדר ההדבקות.
  const metaJsons = [];
  for (const raw of list) {
    const parsedJson = decodeLooseJson(raw);
    if (isPlainObject(parsedJson) &&
      (isPlainObject(parsedJson.style) || isPlainObject(parsedJson.coverPageDefaults) || typeof parsedJson.profileSummary === 'string'
        // שדות פרופיל שהמודל הוסיף מעבר למה שהפרומפט ביקש — נקלטים גם הם (מילוי-רק-אם-ריק).
        || hasExternalProfileFields(parsedJson))) {
      metaJsons.push(parsedJson);
    }
  }

  // early-fail רק אם אין באף הדבקה דפוסים, מטא, ואות עמוק.
  if (!externalResults.length && !metaJsons.length && !deepExternalOnly.length) {
    return { ok: false, error: 'לא זוהה JSON תקין באף פלט' };
  }

  const { profile, engine } = loadEngine();

  // החלת המטא (מצטבר, כל הדבקה על גבי הקודמת) — משותף לשני הענפים. מתחיל מהפרופיל הטרי
  // (במסלול הדפוסים זה אחרי saveEngine, כדי לא לדרוס את ה-engine ששמר finishQualitativeMerge).
  const applyMeta = () => {
    let patch = null;
    let acc = getPersonalStyleProfile();
    for (const parsedJson of metaJsons) {
      acc = mergeExternalStyleExtractionIntoProfile(parsedJson, acc);
      patch = acc;
    }
    if (patch && applyMetaPatch) {
      const fresh = getPersonalStyleProfile();
      savePersonalStyleProfile({ ...fresh, ...patch });
      if (typeof window !== 'undefined') {
        try { window.dispatchEvent(new CustomEvent(STYLE_UPDATED_EVENT)); } catch { /* noop */ }
      }
    }
    return patch;
  };

  // מטא בלבד (אין דפוסים באף הדבקה) — לא קוראים ל-finishQualitativeMerge עם מערך ריק (F2):
  // הוא היה מסמן qualitativePatternsStale=false ו-lastAnalysisAt כאילו רץ ניתוח מלא.
  // אבל אות עמוק שכן נמצא בהדבקות האלה כן נקלט — דרך foldDeepSignals בלבד.
  if (!externalResults.length) {
    let deepEngine = null;
    if (deepExternalOnly.length) {
      try {
        foldDeepSignals(engine, deepExternalOnly);
        deepEngine = saveEngine(profile, engine);
      } catch { /* noop — מטא עדיין מוחל למטה */ }
    }
    const metaPatch = applyMeta();
    return {
      ok: true,
      engine: deepEngine,
      metaPatch,
      externalBatches: 0,
      totalBatches: 0,
      crossValidated: false,
      error: '',
    };
  }

  // 3 — אופציונלי: הרצת הבאטצ'ים המקומיים (helper משותף — F4). כשלים נספרים ל-combined (F8).
  const localResults = [];
  let localFailed = 0;
  if (includeLocalLlm) {
    let providerAvailable = false;
    try { providerAvailable = Boolean(getExternalAnalysisAvailability()?.hasLocalProvider); } catch { providerAvailable = false; }
    if (providerAvailable) {
      const local = await runLocalPatternBatches();
      localResults.push(...local.results);
      localFailed = local.failed;
    }
  }

  const allResults = [...localResults, ...externalResults];

  // 4 — זנב המיזוג המשותף. externalBatches + כשלי הבאטצ'ים המקומיים נכנסים ל-extractionMeta.
  let popNgramFreq = null;
  try { const ref = await loadStyleReference(); popNgramFreq = ref && ref.ngramFreq ? ref.ngramFreq : null; } catch { popNgramFreq = null; }
  const savedEngine = finishQualitativeMerge(profile, engine, allResults, {
    extraMeta: { externalBatches: externalResults.length, llmBatchesFailed: localFailed },
    populationNgramFreq: popNgramFreq,
    deepOnlyResults: deepExternalOnly,
  });

  // 5 — החלת המטא (אחרי שמירת ה-engine).
  const metaPatch = applyMeta();

  return {
    ok: true,
    engine: savedEngine,
    metaPatch,
    externalBatches: externalResults.length,
    totalBatches: allResults.length,
    crossValidated: Boolean(savedEngine?.extractionMeta?.crossValidated),
    error: '',
  };
}

// ---------- מילוי אוטומטי של הפרופיל מהעבודות שהועלו ----------
//
// עד כה המסלול המקומי (העלאת קבצים בלי הדבקת JSON חיצוני) החזיר metaPatch:null — כלומר
// שום שדה פרופיל לא התמלא, גם כשהמידע ישב בתוך המסמכים עצמם. שתי שכבות סוגרות את זה:
//   1. deriveManualDefaultPatch — טון/אורך מתוך המדדים המחושבים. מקומי, בלי LLM.
//   2. deriveProfileFactsFromSamples — זהות והקשר (שם/מוסד/מרצה/קורס/ת"ז) מעמודי השער
//      שבראש המסמכים. דורש ספק LLM.
// שתיהן **ממלאות רק שדות ריקים** ולעולם לא דורסות מה שהמשתמש הזין.

const isEmptyProfileValue = (value) => (
  value === null || value === undefined
  || (typeof value === 'string' && value.trim() === '')
  || (Array.isArray(value) && value.length === 0)
);

// שדות זהות/הקשר בלבד. סגנון לא נמצא כאן בכוונה — אותו המנוע מזריק ישירות דרך
// buildStyleEngineInjectionBlock, בלי לעבור דרך שדות הפרופיל.
const PROFILE_FACT_SCALARS = ['displayName', 'institutionName', 'studyTrack', 'studentId'];
const PROFILE_FACT_LISTS = ['lecturerNames', 'currentCourses'];

const PROFILE_FACTS_HEAD_CHUNKS_PER_DOC = 2;
const PROFILE_FACTS_MAX_CHARS = 4000;

/**
 * טון/אורך מתוך המדדים. סינכרוני, בלי LLM. ממלא רק שדות ריקים.
 * @returns {object} patch חלקי (יכול להיות ריק)
 */
function deriveManualDefaultPatch() {
  let derived = {};
  try { derived = deriveManualDefaultsFromMetrics(getStyleOverview()) || {}; } catch { return {}; }
  const live = getPersonalStyleProfile();
  const patch = {};
  // רק שני השדות האלה הם שדות פרופיל אמיתיים; tonePreferenceConfidence/exemplars הם
  // מטא-נתונים של הגזירה ואסור שייכתבו לפרופיל.
  ['tonePreference', 'lengthPreference'].forEach((field) => {
    if (derived[field] && isEmptyProfileValue(live[field])) patch[field] = derived[field];
  });
  return patch;
}

// עמוד השער יושב בתחילת המסמך — לוקחים רק את ה-chunks הראשונים של כל מסמך.
function buildProfileFactsExcerpt() {
  const chunks = getChunks();
  if (!chunks.length) return '';
  const perDoc = new Map();
  for (const chunk of chunks) {
    if (!isPlainObject(chunk)) continue;
    const key = String(chunk.docId || '');
    const list = perDoc.get(key) || [];
    if (list.length >= PROFILE_FACTS_HEAD_CHUNKS_PER_DOC) continue;
    list.push(String(chunk.text || '').trim());
    perDoc.set(key, list);
  }
  let out = '';
  for (const [, texts] of perDoc) {
    for (const text of texts) {
      if (!text) continue;
      if (out.length >= PROFILE_FACTS_MAX_CHARS) return out.slice(0, PROFILE_FACTS_MAX_CHARS);
      out += `${text}\n---\n`;
    }
  }
  return out.slice(0, PROFILE_FACTS_MAX_CHARS);
}

/**
 * מחלץ פרטי זהות והקשר מעמודי השער של העבודות שהועלו. ממלא רק שדות ריקים.
 * anti-hallucination: הפרומפט אוסר להמציא, וכל שדה שלא מופיע מפורשות חוזר ריק.
 * @returns {Promise<{patch:object, filled:string[], reason?:string}>}
 */
export async function deriveProfileFactsFromSamples() {
  let providerAvailable = false;
  try { providerAvailable = Boolean(getExternalAnalysisAvailability()?.hasLocalProvider); } catch { providerAvailable = false; }
  if (!providerAvailable) return { patch: {}, filled: [], reason: 'no-provider' };

  const live = getPersonalStyleProfile();
  // אם כל שדות היעד כבר מלאים — לא מבזבזים קריאת LLM.
  const anyEmpty = [...PROFILE_FACT_SCALARS, ...PROFILE_FACT_LISTS]
    .some((field) => isEmptyProfileValue(live[field]));
  if (!anyEmpty) return { patch: {}, filled: [], reason: 'nothing-to-fill' };

  const excerpt = buildProfileFactsExcerpt();
  if (!excerpt.trim()) return { patch: {}, filled: [], reason: 'no-text' };

  const prompt = [
    'לפניך קטעי פתיחה מתוך עבודות שהמשתמש כתב (בדרך כלל עמוד השער והפסקה הראשונה).',
    'חלץ מהם אך ורק פרטי זיהוי והקשר לימודי שמופיעים בטקסט במפורש.',
    'החזר JSON יחיד בלבד, בלי טקסט מסביב, במבנה:',
    '{"displayName":"","institutionName":"","studyTrack":"","studentId":"","lecturerNames":[],"currentCourses":[]}',
    'כללים מחייבים:',
    '- אל תמציא ואל תנחש. שדה שלא מופיע מפורשות בטקסט — החזר "" או [].',
    '- displayName = שם הכותב/המגיש בלבד, לא שם המרצה.',
    '- lecturerNames = שמות מרצים/מנחים בלבד.',
    '- currentCourses = שמות קורסים בלבד, בלי מספרי קורס ובלי שם המוסד.',
    '- studentId = מספר תעודת זהות/מספר סטודנט רק אם מופיע במפורש.',
    '',
    'הקטעים:',
    excerpt,
  ].join('\n');

  let raw = '';
  try {
    raw = await chatWithActiveProvider(prompt, '', '', {
      ...buildStyleLlmOptions('Style Profile Facts', `style-facts-${Date.now()}`, { cheap: true, cheapExclude: CHEAP_EXTRACTION_EXCLUDE }),
    });
  } catch {
    return { patch: {}, filled: [], reason: 'llm-failed' };
  }

  const parsed = decodeLooseJson(raw);
  if (!isPlainObject(parsed)) return { patch: {}, filled: [], reason: 'unparsable' };

  const patch = {};
  const filled = [];
  PROFILE_FACT_SCALARS.forEach((field) => {
    const value = String(parsed[field] ?? '').trim();
    if (value && isEmptyProfileValue(live[field])) { patch[field] = value; filled.push(field); }
  });
  PROFILE_FACT_LISTS.forEach((field) => {
    const values = Array.isArray(parsed[field])
      ? parsed[field].map((v) => String(v ?? '').trim()).filter(Boolean).slice(0, 6)
      : [];
    if (!values.length) return;
    // lecturerNames נחשב ריק רק אם גם lecturerName הסקלרי ריק (הם מסונכרנים בנרמול).
    const currentlyEmpty = field === 'lecturerNames'
      ? isEmptyProfileValue(live.lecturerNames) && isEmptyProfileValue(live.lecturerName)
      : isEmptyProfileValue(live[field]);
    if (!currentlyEmpty) return;
    patch[field] = values;
    if (field === 'lecturerNames') patch.lecturerName = values[0];
    filled.push(field);
  });

  return { patch, filled };
}

// השוואת ערכי-פרופיל (סקלר או רשימה) לצורך זיהוי "מה באמת התמלא".
const sameProfileValue = (a, b) => {
  if (Array.isArray(a) || Array.isArray(b)) {
    try { return JSON.stringify(a || []) === JSON.stringify(b || []); } catch { return false; }
  }
  return String(a ?? '').trim() === String(b ?? '').trim();
};

/**
 * A4/B4 — חילוץ הפרופיל העמוק (profileSummary + style + coverPageDefaults) מהקטעים
 * המייצגים של המשתמש, באותה סכימה בדיוק שהמסלול החיצוני מבקש. עד היום הבלוק הזה
 * הגיע רק כשהמשתמש הדביק פלט מצ'אטבוט חיצוני; כאן הוא נגזר בתוך האפליקציה.
 *
 * מדיניות המיזוג היא בדיוק זו של המסלול החיצוני (mergeExternalStyleExtractionIntoProfile):
 * מילוי-רק-אם-ריק לסקלרים, איחוד+cap לרשימות, append להערות/תקציר. לא מומצאת כאן מדיניות
 * חדשה. baseProfile מאפשר להזין פרופיל "טרי + patch שטרם נשמר" כדי שהמיזוג לא ידרוס
 * שדות שנגזרו רגע לפני (זהות מקומית / patch חיצוני).
 *
 * קריאת LLM אחת בלבד לכל ריצה. בלי ספק מוגדר — no-op שקט (reason:'no-provider').
 * לעולם לא זורק.
 * @param {{baseProfile?:object|null}} [opts]
 * @returns {Promise<{patch:object, filled:string[], reason?:string}>}
 */
export async function deriveStyleProfileFromSamples({ baseProfile = null } = {}) {
  let providerAvailable = false;
  try { providerAvailable = Boolean(getExternalAnalysisAvailability()?.hasLocalProvider); } catch { providerAvailable = false; }
  if (!providerAvailable) return { patch: {}, filled: [], reason: 'no-provider' };

  let live = null;
  try { live = isPlainObject(baseProfile) ? baseProfile : getPersonalStyleProfile(); } catch { live = null; }
  if (!isPlainObject(live)) live = {};

  const excerpts = getRepresentativeExcerpts({ max: 8, maxChars: 6000 });
  if (!excerpts.length) return { patch: {}, filled: [], reason: 'no-text' };

  let prompt = '';
  try { prompt = String(buildDeepProfileExtractionPrompt({ profile: live, excerpts }) || ''); } catch { prompt = ''; }
  if (!prompt.trim()) return { patch: {}, filled: [], reason: 'no-text' };

  let raw = '';
  try {
    raw = await chatWithActiveProvider(prompt, '', '', {
      ...buildStyleLlmOptions('Style Deep Profile', `style-deep-${Date.now()}`, { cheap: true, cheapExclude: CHEAP_EXTRACTION_EXCLUDE }),
    });
  } catch {
    return { patch: {}, filled: [], reason: 'llm-failed' };
  }

  const parsed = decodeLooseJson(raw);
  if (!isPlainObject(parsed)) return { patch: {}, filled: [], reason: 'unparsable' };

  let patch = {};
  let baseline = {};
  try {
    patch = mergeExternalStyleExtractionIntoProfile(parsed, live) || {};
    // מיזוג "ריק" על אותו בסיס — כדי לא לדווח כ"התמלא" שדות שהמיזוג ממלא מברירת מחדל
    // קשיחה (defaultDocumentStyle:'academic' וכו') ולא מהמודל.
    baseline = mergeExternalStyleExtractionIntoProfile({}, live) || {};
  } catch {
    return { patch: {}, filled: [], reason: 'merge-failed' };
  }
  if (!isPlainObject(patch)) return { patch: {}, filled: [], reason: 'merge-failed' };

  const filled = Object.keys(patch).filter((field) => (
    isEmptyProfileValue(live[field])
    && !isEmptyProfileValue(patch[field])
    && !sameProfileValue(patch[field], baseline[field])
  ));

  return { patch, filled, reason: '' };
}

/**
 * ניתוח סגנון מאוחד: בוחר בין מסלול מקומי, חיצוני, או משולב לפי הקלט.
 * @param {{externalRawTexts?:string[], onProgress?:function, applyMetaPatch?:boolean}} opts
 * @returns {Promise<{ok:boolean, mode?:string, engine?:object|null, metaPatch?:object|null, profileFactsFilled?:string[], deepProfileFilled?:string[], crossValidated?:boolean, externalBatches?:number, error?:string}>}
 */
export async function runUnifiedStyleAnalysis({ externalRawTexts = [], onProgress, applyMetaPatch = true } = {}) {
  const pastes = (Array.isArray(externalRawTexts) ? externalRawTexts : [])
    .map((r) => String(r || ''))
    .filter((r) => r.trim());
  const hasChunks = getChunks().length > 0;
  const emit = (t) => { if (typeof onProgress === 'function') { try { onProgress(t); } catch { /* noop */ } } };

  // אין הדבקות + יש chunks → מסלול מקומי בלבד.
  if (!pastes.length && hasChunks) {
    emit('מריץ ניתוח מקומי...');
    const res = await runQualitativeAnalysis({ force: true });

    // מילוי אוטומטי של שדות ריקים בפרופיל מתוך אותן עבודות (מדדים + עמודי שער).
    // עד כאן המסלול הזה החזיר metaPatch:null והשאיר את הפרופיל ריק.
    emit('משלים פרטי פרופיל מהעבודות...');
    let patch = deriveManualDefaultPatch();
    let profileFactsFilled = [];
    try {
      const facts = await deriveProfileFactsFromSamples();
      patch = { ...patch, ...facts.patch };
      profileFactsFilled = facts.filled;
    } catch {
      // חילוץ הזהות הוא bonus — כישלון בו לא מפיל את הניתוח.
    }

    // B5 — הפרופיל העמוק רץ *אחרי* פרטי הזהות ומקבל אותם כבסיס (baseProfile), כך
    // שמדיניות מילוי-רק-אם-ריק מותירה את הזהות המדויקת (הצרה) מנצחת על הגזירה הרחבה.
    let deepProfileFilled = [];
    try {
      emit('לומד פרופיל סגנון מעמיק...');
      const base = { ...getPersonalStyleProfile(), ...patch };
      const deep = await deriveStyleProfileFromSamples({ baseProfile: base });
      if (isPlainObject(deep?.patch) && Object.keys(deep.patch).length) {
        patch = { ...patch, ...deep.patch };
        deepProfileFilled = Array.isArray(deep.filled) ? deep.filled : [];
      }
    } catch {
      // גם זה bonus — כישלון לא מפיל את הניתוח.
    }

    const metaPatch = Object.keys(patch).length ? patch : null;
    if (metaPatch && applyMetaPatch) {
      const fresh = getPersonalStyleProfile();
      savePersonalStyleProfile({ ...fresh, ...metaPatch });
      if (typeof window !== 'undefined') {
        try { window.dispatchEvent(new CustomEvent(STYLE_UPDATED_EVENT)); } catch { /* noop */ }
      }
    }

    return {
      ok: !res.skipped,
      mode: 'local',
      engine: res.engine || null,
      metaPatch,
      profileFactsFilled,
      deepProfileFilled,
      crossValidated: Boolean(res.engine?.extractionMeta?.crossValidated),
      externalBatches: 0,
      // warning — הניתוח "הצליח" טכנית אבל בלי אף קריאת LLM מוצלחת; ה-UI מציג זאת במקום ✓.
      warning: res.llmAllFailed
        ? 'הניתוח האיכותני לא הושלם — קריאות ה-AI נכשלו. בדוק מפתח API בהגדרות; הדפוסים יושלמו אוטומטית כשהחיבור יעבוד.'
        : '',
      // F5 — מיפוי קוד ה-skip הגולמי להודעה עברית ידידותית.
      error: res.skipped
        ? ((res.reason === 'no-chunks' || res.reason === 'no-excerpts')
          ? 'אין מספיק טקסט לניתוח — העלה מסמכים ארוכים יותר או הוסף פלט חיצוני.'
          : 'הניתוח דולג.')
        : '',
    };
  }

  // יש הדבקות → external / combined.
  if (pastes.length) {
    let providerAvailable = false;
    try { providerAvailable = Boolean(getExternalAnalysisAvailability()?.hasLocalProvider); } catch { providerAvailable = false; }
    const includeLocalLlm = hasChunks && providerAvailable;
    const mode = includeLocalLlm ? 'combined' : 'external';
    if (includeLocalLlm) emit('מריץ ניתוח מקומי...');
    emit(`משלב ${pastes.length} פלטים חיצוניים...`);
    const res = await applyExternalPatternAnalyses(pastes, { includeLocalLlm, applyMetaPatch });
    if (!res.ok) {
      return { ok: false, mode, engine: null, metaPatch: null, crossValidated: false, externalBatches: 0, error: res.error };
    }

    // B5 — במסלול המשולב מוסיפים גם גזירה מקומית עמוקה, אבל *אחרי* שהמטא החיצוני הוחל:
    // הניתוח החיצוני ראה את המסמכים המלאים, ולכן הוא צריך לנצח. הבסיס למיזוג הוא הפרופיל
    // הטרי + ה-metaPatch החיצוני (גם כש-applyMetaPatch=false, כדי לא לדרוס אותו), ומדיניות
    // מילוי-רק-אם-ריק עושה את השאר.
    let metaPatch = res.metaPatch;
    let deepProfileFilled = [];
    if (includeLocalLlm) {
      try {
        emit('לומד פרופיל סגנון מעמיק...');
        const base = { ...getPersonalStyleProfile(), ...(isPlainObject(metaPatch) ? metaPatch : {}) };
        const deep = await deriveStyleProfileFromSamples({ baseProfile: base });
        if (isPlainObject(deep?.patch) && Object.keys(deep.patch).length) {
          metaPatch = { ...(isPlainObject(metaPatch) ? metaPatch : {}), ...deep.patch };
          deepProfileFilled = Array.isArray(deep.filled) ? deep.filled : [];
          if (applyMetaPatch) {
            const fresh = getPersonalStyleProfile();
            savePersonalStyleProfile({ ...fresh, ...deep.patch });
            if (typeof window !== 'undefined') {
              try { window.dispatchEvent(new CustomEvent(STYLE_UPDATED_EVENT)); } catch { /* noop */ }
            }
          }
        }
      } catch {
        // bonus — כישלון לא מפיל את המסלול המשולב.
      }
    }

    return {
      ok: true,
      mode,
      engine: res.engine,
      metaPatch,
      deepProfileFilled,
      crossValidated: Boolean(res.crossValidated),
      externalBatches: res.externalBatches,
      error: '',
    };
  }

  return { ok: false, error: 'אין חומר לניתוח' };
}

// ---------- removeDocumentAndRecompute ----------

/**
 * מסיר מסמך מה-store ומחשב מדדים מחדש.
 * @param {string} docId
 * @returns {object} engine מנורמל
 */
export function removeDocumentAndRecompute(docId) {
  removeDocument(docId);
  // הפרופיל המבני מחזיק רשומה נפרדת לאותו docId — בלי ההסרה הזאת מסמך שנמחק
  // היה ממשיך למשוך את היעדים אליו.
  removeStyleTargetDoc(docId).catch(() => {});
  return recomputeMetricsFromStore();
}

// ---------- ingestAndAnalyze (הצינור המלא ל-UI) ----------

/**
 * הצינור המלא לכפתור "העלה": חילוץ → recompute מדדים → (אופציונלי) חילוץ דפוסים.
 * @param {FileList|Array<File>} fileList
 * @param {{onProgress?:function, runPatterns?:boolean}} opts
 * @returns {Promise<{ingest:object, patterns:(object|null)}>}
 */
export async function ingestAndAnalyze(fileList, { onProgress, runPatterns = true } = {}) {
  const ingest = await ingestFiles(fileList, { onProgress });
  // E3 — מסווגים ז'אנר למסמכים החדשים לפני recompute כדי שתת-פרופילי הז'אנר ייבנו.
  // כשל בסיווג לעולם לא חוסם את שאר הצינור.
  try { await classifyPendingGenres(); } catch {}
  recomputeMetricsFromStore();
  // שכבת embeddings סמנטית מקומית — רצה טרום-API (WASM, בלי מפתח). כשל לעולם לא חוסם.
  let embeddings = null;
  try { embeddings = await computeChunkEmbeddings({ onProgress }); } catch {}
  let patterns = null;
  if (runPatterns) {
    patterns = await runQualitativeAnalysis({ force: true });
  }
  return { ingest, patterns, embeddings };
}

// ---------- getStyleOverview ----------

/**
 * מצב מלא ל-UI (StyleProfilePanel).
 * @returns {object}
 */
export function getStyleOverview() {
  const { engine } = loadEngine();
  const blacklist = isPlainObject(engine.blacklist) ? engine.blacklist : {};
  return {
    enabled: engine.enabled !== false,
    stats: getSampleStoreStats(),
    metrics: engine.metrics,
    metricsSpread: engine.metricsSpread,
    qualitativePatterns: engine.qualitativePatterns,
    negativeSpace: engine.negativeSpace,
    blacklist: {
      auto: Array.isArray(blacklist.auto) ? blacklist.auto : [],
      user: Array.isArray(blacklist.user) ? blacklist.user : [],
      removed: Array.isArray(blacklist.removed) ? blacklist.removed : [],
    },
    rejectedPatternKeys: Array.isArray(engine.rejectedPatternKeys) ? engine.rejectedPatternKeys : [],
    confidence: engine.confidence,
    metricsEligibleDocCount: engine.metricsEligibleDocCount || 0,
    extractionMeta: isPlainObject(engine.extractionMeta) ? engine.extractionMeta : null,
    genreProfiles: isPlainObject(engine.genreProfiles) ? engine.genreProfiles : {},
    embeddingMeta: isPlainObject(engine.embeddingMeta) ? engine.embeddingMeta : {},
    representativeChunkIds: Array.isArray(engine.representativeChunkIds) ? engine.representativeChunkIds : [],
  };
}

// ---------- setStyleEngineEnabled ----------

/**
 * מפעיל/מכבה את המנוע. בהפעלה כשהמנוע ריק — seed מהפרופיל הישן.
 * @param {boolean} enabled
 * @returns {object} engine מנורמל
 */
export function setStyleEngineEnabled(enabled) {
  // חימום המטמון הסינכרוני של נכס-ייחוס האוכלוסייה — נקודת async מוקדמת יחידה, כדי
  // שקוראים סינכרוניים (buildStyleEngineInjectionBlock, scoreStyleMatchLocal בלולאת
  // rewrite) יקבלו getCachedReference() מלא ולא {}. fire-and-forget, graceful.
  if (enabled !== false) { try { primeStyleReference(); } catch { /* noop */ } }

  const { profile, engine } = loadEngine();
  const next = { ...engine, enabled: enabled !== false };

  const isEmpty = !isPlainObject(next.metrics) && (next.qualitativePatterns || []).length === 0;
  if (enabled !== false && isEmpty) {
    const seeded = seedStyleEngineFromLegacyProfile(profile);
    if (seeded) {
      next.metrics = seeded.metrics;
      next.qualitativePatterns = mergeQualitativePatterns(
        next.qualitativePatterns,
        seeded.qualitativePatterns,
      );
      if (Array.isArray(seeded.negativeSpace) && seeded.negativeSpace.length) {
        next.negativeSpace = [...(next.negativeSpace || []), ...seeded.negativeSpace];
      }
    }
  }

  // E4 — מיגרציה חד-פעמית: בהפעלה ראשונה מזרימים את הדוגמאות הישנות (goldenExample /
  // preferredTrainingExamples) לתוך ה-sample store עצמו (לא רק ל-metrics/patterns כמו
  // ה-seed למעלה), כדי שה-RAG/gold chunks של המנוע ייהנו מהן. מוגן ע"י legacyMigratedAt
  // כדי לא לכפול בכל הפעלה מחדש.
  let didMigrate = false;
  if (enabled !== false && !next.legacyMigratedAt) {
    const goldenExample = String(profile?.goldenExample || '').trim();
    if (goldenExample && countWordsRough(goldenExample) >= 50) {
      addDocumentSamples({
        title: 'דוגמת זהב (פרופיל)',
        text: goldenExample,
        source: 'legacy-golden',
        isGold: true,
      });
      didMigrate = true;
    }

    const trainingExamples = Array.isArray(profile?.preferredTrainingExamples)
      ? profile.preferredTrainingExamples
      : [];
    trainingExamples.forEach((ex) => {
      const text = String(ex || '').trim();
      if (text && countWordsRough(text) >= 25) {
        addGoldChunk({ text, title: 'דוגמת אימון' });
        didMigrate = true;
      }
    });

    next.legacyMigratedAt = Date.now();
  }

  const savedEngine = saveEngine(profile, next);
  // אם נוספו chunks חדשים ל-store (golden/training) — מחשבים מדדים מחדש כדי
  // שה-confidence/metrics ישקפו אותם מיד, לא רק בהעלאה הבאה.
  if (didMigrate) return recomputeMetricsFromStore();
  return savedEngine;
}

// ספירת מילים גסה (split על whitespace) — מספיקה לסף המיגרציה של E4, לא מדד רשמי.
function countWordsRough(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

// ---------- setBlacklistUser ----------

/**
 * מחליף את blacklist.user (cap 50).
 * @param {string[]} list
 * @returns {object} engine מנורמל
 */
export function setBlacklistUser(list) {
  const { profile, engine } = loadEngine();
  const user = (Array.isArray(list) ? list : [])
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .slice(0, CAP_BLACKLIST_USER);
  engine.blacklist = { ...engine.blacklist, user };
  return saveEngine(profile, engine);
}

// ---------- restore / remove auto blacklist item ----------

/**
 * מחזיר פריט auto שהוסתר (מסיר אותו מ-blacklist.removed).
 * @param {string} phrase
 * @returns {object} engine מנורמל
 */
export function restoreAutoBlacklistItem(phrase) {
  const target = String(phrase || '').trim();
  const { profile, engine } = loadEngine();
  const removed = (Array.isArray(engine.blacklist?.removed) ? engine.blacklist.removed : [])
    .filter((p) => String(p || '').trim() !== target);
  engine.blacklist = { ...engine.blacklist, removed };
  return saveEngine(profile, engine);
}

/**
 * מסתיר פריט auto מההזרקה (מוסיף אותו ל-blacklist.removed).
 * @param {string} phrase
 * @returns {object} engine מנורמל
 */
export function removeAutoBlacklistItem(phrase) {
  const target = String(phrase || '').trim();
  if (!target) return loadEngine().engine;
  const { profile, engine } = loadEngine();
  const removed = Array.isArray(engine.blacklist?.removed) ? [...engine.blacklist.removed] : [];
  if (!removed.some((p) => String(p || '').trim() === target)) removed.push(target);
  engine.blacklist = { ...engine.blacklist, removed };
  return saveEngine(profile, engine);
}

// ---------- markPatternsStale ----------

/**
 * מסמן שהדפוסים דורשים ניתוח מחדש (טריגר incremental K=5 בהמשך).
 * @returns {object} engine מנורמל
 */
export function markPatternsStale() {
  const { profile, engine } = loadEngine();
  engine.qualitativePatternsStale = true;
  return saveEngine(profile, engine);
}

// ---------- קיורציה: reject / unreject / pin ----------

const CAP_REJECTED_KEYS = 60;

/**
 * דוחה דפוס ("לא אני"): מחשב את המפתח הקנוני שלו, מוסיף אותו ל-rejectedPatternKeys
 * (dedupe, cap 60), ומסיר את הדפוס מ-qualitativePatterns. המפתח הדחוי שורד ניתוח מחדש
 * (סינון מרכזי ב-runQualitativeAnalysis).
 * @param {string} patternId
 * @returns {{ok:boolean, key?:string}}
 */
export function rejectPattern(patternId) {
  const id = String(patternId || '').trim();
  if (!id) return { ok: false };
  const { profile, engine } = loadEngine();
  const patterns = Array.isArray(engine.qualitativePatterns) ? engine.qualitativePatterns : [];
  const target = patterns.find((p) => isPlainObject(p) && String(p.id || '').trim() === id);
  if (!target) return { ok: false };
  const key = canonicalPatternKey(target);
  const rejected = Array.isArray(engine.rejectedPatternKeys) ? [...engine.rejectedPatternKeys] : [];
  if (key && !rejected.includes(key)) {
    rejected.push(key);
  }
  engine.rejectedPatternKeys = rejected.slice(0, CAP_REJECTED_KEYS);
  engine.qualitativePatterns = patterns.filter((p) => String(p?.id || '').trim() !== id);
  saveEngine(profile, engine);
  return { ok: true, key };
}

/**
 * מבטל דחייה של מפתח: מסיר אותו מ-rejectedPatternKeys ומסמן qualitativePatternsStale
 * כדי שהניתוח הבא יוכל למצוא את הדפוס שוב.
 * @param {string} key
 * @returns {{ok:boolean}}
 */
export function unrejectPattern(key) {
  const target = String(key || '').trim();
  if (!target) return { ok: false };
  const { profile, engine } = loadEngine();
  const rejected = Array.isArray(engine.rejectedPatternKeys) ? engine.rejectedPatternKeys : [];
  engine.rejectedPatternKeys = rejected.filter((k) => String(k || '').trim() !== target);
  engine.qualitativePatternsStale = true;
  saveEngine(profile, engine);
  return { ok: true };
}

/**
 * נועץ/משחרר דפוס: מסמן pattern.pinned + userAdjustedAt=now. דפוס נעוץ תמיד שורד
 * את ה-cap ומקבל boost בבחירה (selectRotatedPatterns).
 * @param {string} patternId
 * @param {boolean} pinned
 * @returns {{ok:boolean}}
 */
export function pinPattern(patternId, pinned = true) {
  const id = String(patternId || '').trim();
  if (!id) return { ok: false };
  const { profile, engine } = loadEngine();
  const patterns = Array.isArray(engine.qualitativePatterns) ? engine.qualitativePatterns : [];
  const target = patterns.find((p) => isPlainObject(p) && String(p.id || '').trim() === id);
  if (!target) return { ok: false };
  target.pinned = pinned !== false;
  target.userAdjustedAt = Date.now();
  saveEngine(profile, engine);
  return { ok: true };
}

// ---------- אימות סגנון: negativeSpace + finalize ----------

/**
 * מסיר פריט מ-negativeSpace (השוואת מחרוזת מנורמלת trim/lowercase).
 * @param {string} item
 * @returns {object} engine מנורמל
 */
export function removeNegativeSpaceItem(item) {
  const norm = String(item || '').trim().toLowerCase();
  const { profile, engine } = loadEngine();
  engine.negativeSpace = (Array.isArray(engine.negativeSpace) ? engine.negativeSpace : [])
    .filter((x) => String(x || '').trim().toLowerCase() !== norm);
  return saveEngine(profile, engine);
}

/**
 * חותם על אימות הסגנון: מחשב מחדש confidence ושומר.
 * @returns {{confidence:*}}
 */
export function finalizeStyleVerification() {
  const { profile, engine } = loadEngine();
  engine.confidence = recomputeConfidence(engine);
  const saved = saveEngine(profile, engine);
  return { confidence: saved.confidence };
}

// re-export לנוחות ה-UI (איפוס מלא של ה-store).
export { clearSampleStore };

// ---------- resetStyleLearning ----------

/**
 * איפוס מלא של הלמידה — "להתחיל מחדש". מוחק את כל מה שנלמד מהמשתמש בכל שלוש
 * שכבות האחסון (דגימות, וקטורים סמנטיים, דלתות עריכה) ומחזיר את אובייקט המנוע
 * לברירת המחדל, כך ש-normalizeStyleEngine מייצר סכמה נקייה.
 *
 * מה *נשמר* בכוונה: הדגל enabled (העדפת משתמש, לא נתון שנלמד), וכן — לפי בחירה —
 * רשימת הדפוסים שנדחו ידנית ("לא אני"), שהיא קיורציה של המשתמש ולא תוצר חילוץ.
 * העדפות יצירתיות/עומק חיות מחוץ למנוע (app settings) ולכן אינן מושפעות.
 *
 * הפעולה בלתי הפיכה — ה-UI חייב לבקש אישור מפורש לפני הקריאה.
 *
 * @param {{keepRejections?:boolean}} [opts] keepRejections — לשמר rejectedPatternKeys.
 * @returns {{cleared:{documents:number,chunks:number,words:number}, keptRejections:number}}
 */
export function resetStyleLearning({ keepRejections = false } = {}) {
  const { profile, engine } = loadEngine();

  // צילום "מה נמחק" *לפני* המחיקה — ה-UI מדווח למשתמש מה בדיוק ירד.
  let before = { docCount: 0, chunkCount: 0, totalWords: 0 };
  try { before = getSampleStoreStats() || before; } catch {}

  const keptKeys = keepRejections
    ? (Array.isArray(engine.rejectedPatternKeys) ? engine.rejectedPatternKeys : [])
    : [];

  // שלוש שכבות אחסון נפרדות — מחיקה חלקית משאירה וקטורים/דלתות יתומים שימשיכו
  // להשפיע על retrieval ועל editCounters.
  try { clearSampleStore(); } catch {}
  try { clearEmbeddingStore(); } catch {}
  try { resetEmbeddingState(); } catch {}
  try { clearDeltas(); } catch {}

  // מנוע נקי: normalizeStyleEngine על אובייקט מינימלי מייצר את כל שדות ברירת המחדל.
  saveEngine(profile, {
    enabled: engine.enabled !== false,
    ...(keptKeys.length ? { rejectedPatternKeys: keptKeys } : {}),
  });

  // מאפשר לחילוץ העמוק האוטומטי לרוץ שוב אחרי איפוס (המכסה היא לכל סשן).
  deepExtractionAutoAttempts = 0;

  return {
    cleared: {
      documents: Math.max(0, Math.round(Number(before.docCount) || 0)),
      chunks: Math.max(0, Math.round(Number(before.chunkCount) || 0)),
      words: Math.max(0, Math.round(Number(before.totalWords) || 0)),
    },
    keptRejections: keptKeys.length,
  };
}

// ---------- auto deep-extraction on provider connect (MAJOR 1) ----------

// דגל in-flight — מונע ריצה כפולה במקביל (אירוע config-changed עלול להיירות פעמיים,
// וגם ה-onboarding קורא לפונקציה ישירות כשהוא מזהה שהשכבה העמוקה טרם רצה).
let deepExtractionInFlight = false;

// מונה ניסיונות אוטומטיים ברמת module — כשכל הבאטצ'ים נכשלים, finishQualitativeMerge
// שומר batches:0 (רק הצלחות נספרות), כך שהשער batches===0 לעולם לא נסגר. בלי מכסה, כל
// שמירת settings / hydration / אירוע style-updated בזמן onboarding פתוח היה מריץ שוב עד
// 8 קריאות LLM כושלות. cap 2 לסשן (retry לגיטימי אחד אחרי הראשון), reset רק ב-reload.
let deepExtractionAutoAttempts = 0;
const DEEP_EXTRACTION_MAX_AUTO_ATTEMPTS = 2;
// cooldown אחרי ניסיון כושל (llmBatchesFailed>0): לא מריצים שוב בתוך החלון. משמר retry
// לגיטימי אחרי restart/כשל חולף (extractionMeta.at ישן מספיק), בלי לולאת-כשל הדוקה.
const DEEP_EXTRACTION_FAILURE_COOLDOWN_MS = 30 * 60 * 1000;

/**
 * מריץ חילוץ עמוק אוטומטי (סיווג ז'אנר דרך LLM + חילוץ דפוסים איכותניים) כאשר כל
 * התנאים מתקיימים: המנוע פעיל, יש chunks ב-store, יש ספק LLM זמין
 * (getExternalAnalysisAvailability), וחילוץ עמוק מעולם לא רץ (extractionMeta.batches===0).
 * זה המנגנון שמאחורי ההבטחה "דפוסים עמוקים+ז'אנר יושלמו אוטומטית אחרי חיבור מפתח AI".
 * סובלני לחלוטין — לעולם לא זורק. saveEngine מדליק את wordai-personal-style-updated
 * בסיום, כך שה-UI מתרענן מעצמו.
 * @returns {Promise<{ran:boolean, reason?:string}>}
 */
export async function maybeRunDeepExtractionOnProviderReady() {
  if (deepExtractionInFlight) return { ran: false, reason: 'in-flight' };
  deepExtractionInFlight = true;
  try {
    await ensureSampleStoreReady();
    const { engine } = loadEngine();
    if (!engine || engine.enabled === false) return { ran: false, reason: 'disabled' };
    if (getChunks().length < 1) return { ran: false, reason: 'no-chunks' };
    let hasProvider = false;
    try { hasProvider = Boolean(getExternalAnalysisAvailability()?.hasLocalProvider); } catch { hasProvider = false; }
    if (!hasProvider) return { ran: false, reason: 'no-provider' };
    // חילוץ עמוק כבר רץ (batches>0) — אין מה לעשות (המנגנון חד-פעמי).
    if ((Number(engine.extractionMeta?.batches) || 0) > 0) return { ran: false, reason: 'already-ran' };

    // מכסת ניסיונות אוטומטיים לסשן — חוסמת retry בלתי-פוסק כשכל הבאטצ'ים נכשלים
    // (batches נשאר 0, כך שהשער למעלה לא נסגר). לא תלוי בסדר microtasks כמו ה-in-flight.
    if (deepExtractionAutoAttempts >= DEEP_EXTRACTION_MAX_AUTO_ATTEMPTS) {
      return { ran: false, reason: 'max-attempts' };
    }
    // cooldown — היה ניסיון כושל לאחרונה (llmBatchesFailed>0 עם at בתוך החלון): לא מריצים
    // שוב. אחרי restart/כשל חולף (at ישן מ-30 דק') הניסיון מתאפשר מחדש.
    const meta = isPlainObject(engine.extractionMeta) ? engine.extractionMeta : {};
    const lastAt = Number(meta.at) || 0;
    if ((Number(meta.llmBatchesFailed) || 0) > 0 && lastAt > 0 &&
        (Date.now() - lastAt) < DEEP_EXTRACTION_FAILURE_COOLDOWN_MS) {
      return { ran: false, reason: 'failure-cooldown' };
    }

    // נספר כניסיון עוד לפני הריצה — כשל LLM לא מגדיל את batches, אז הספירה כאן היא
    // מה שחוסם את הלולאה (גם אם הריצה תיזרוק/תיכשל בהמשך).
    deepExtractionAutoAttempts += 1;

    // סיווג ז'אנר (LLM) + recompute כדי שתת-פרופילי הז'אנר ייבנו — כשל לעולם לא חוסם
    // את חילוץ הדפוסים שאחריו.
    try {
      await classifyPendingGenres();
      recomputeMetricsFromStore();
    } catch { /* noop */ }

    await runQualitativeAnalysis({ force: true });
    return { ran: true };
  } catch {
    return { ran: false, reason: 'error' };
  } finally {
    deepExtractionInFlight = false;
  }
}

// styleIngestService נטען גם ב-LAB/node (בלי window) — רישום ה-listener מוגן.
if (typeof window !== 'undefined') {
  window.addEventListener('wordai-provider-config-changed', () => {
    // fire-and-forget; כל הבדיקות (זמינות ספק, batches===0 וכו') בתוך הפונקציה.
    try { maybeRunDeepExtractionOnProviderReady(); } catch { /* noop */ }
  });
}
