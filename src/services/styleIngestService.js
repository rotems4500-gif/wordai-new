// styleIngestService.js — מנוע הסגנון האישי (Personal Style Engine), Phase 2 orchestrator.
//
// שכבת האפליקציה שמחברת בין ה-UI, ה-sample store, ה-primitives הטהורים של
// styleProfileService, וקריאת ה-LLM (chatWithActiveProvider). המודול הזה מייבא בחופשיות
// — ובמכוון *לא* מיובא ע"י aiService (מונע מעגל). כל השינויים לפרופיל עוברים דרך
// saveEngine() המקומי, שמבצע גם את ה-dispatch של האירוע שחסר ב-savePersonalStyleProfile.
//
// עובד בדפדפן בלבד (localStorage + window). תוכנית: docs/style-engine-plan.md §5, §6.

import {
  chatWithActiveProvider,
  getPersonalStyleProfile,
  savePersonalStyleProfile,
  getExternalAnalysisAvailability,
} from './aiService';
import {
  normalizeStyleEngine,
  computeLocalMetrics,
  aggregateDocumentMetrics,
  recomputeConfidence,
  extractQualitativePatterns,
  mergeQualitativePatterns,
  selectRepresentativeExcerpts,
  mineSignatureNgrams,
  mineStructuralFormulas,
  consensusMergePatterns,
  canonicalPatternKey,
  filterRejectedPatterns,
  deriveAutoBlacklist,
  seedStyleEngineFromLegacyProfile,
  GENRES,
} from './styleProfileService';
import {
  addDocumentSamples,
  removeDocument,
  getChunks,
  getSampleDocuments,
  getSampleStoreStats,
  clearSampleStore,
  addGoldChunk,
  setDocumentGenre,
  ensureSampleStoreReady,
  flushSampleStore,
  getSampleStoreWriteError,
} from './styleSampleStore';
import { readBrowserDocumentFile } from './documentUpload';
import {
  embedTexts,
  cosineSim,
  isEmbeddingUnavailable,
  STYLE_EMBEDDING_MODEL_ID,
  STYLE_EMBEDDING_DIM,
} from './styleEmbeddingService';
import {
  getEmbeddedChunkIds,
  putVectors,
  getVectors,
  pruneVectors,
  ensureEmbeddingStoreReady,
} from './styleEmbeddingStore';

// safeJsonParse אינו נדרש בשלב זה: אינו מיוצא מ-aiService (והמודול אסור לנגוע בו);
// הפענוח נעשה בתוך styleProfileService.parsePatternExtractionResult.
// getSampleDocuments/addGoldChunk משמשים כעת ל-E4 (מיגרציה חד-פעמית legacy→engine).

const STYLE_UPDATED_EVENT = 'wordai-personal-style-updated';
const PATTERN_EXTRACTION_MAX_CHARS = 5000;
const PATTERN_EXTRACTION_MAX_COUNT = 6;
const CAP_BLACKLIST_USER = 50;

// E1 — חילוץ multi-batch: כל באטצ' ~5000 תווים, עד 8 באטצ'ים.
const PATTERN_BATCH_MAX_CHARS = 5000;
const PATTERN_BATCH_MAX_BATCHES = 8;

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// בונה options לקריאת chatWithActiveProvider שלא עיוורות לספק הפעיל: אם יש ספק מוגדר
// זמין (getExternalAnalysisAvailability — אותו helper ששולף "Syllabus Profile Import"),
// מכוונים אליו במפורש עם strictProviderOverride כדי שספק פעיל שבור (כמו quota מת) לא
// יפיל בשקט את כל קריאות ה-LLM של מנוע הסגנון. בלי ספק מוגדר — נופלים לספק הפעיל כרגיל.
function buildStyleLlmOptions(agentLabel, runId) {
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
      return {
        ...base,
        providerOverride: availability.processingProviderId,
        strictProviderOverride: true,
      };
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
    ...buildStyleLlmOptions('Style Genre Classification', `style-genre-${Date.now()}`),
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
  let classified = 0;
  Object.entries(map).forEach(([id, genre]) => {
    const g = GENRES.includes(genre) ? genre : 'אחר';
    const res = setDocumentGenre(id, g);
    if (res?.updated) classified += 1;
  });
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
    try {
      const doc = await readBrowserDocumentFile(file);
      const text = String(doc?.text || '').trim();
      if (!text) {
        failed.push({ name, error: 'לא חולץ טקסט מהקובץ.' });
        continue;
      }
      const result = addDocumentSamples({
        title: String(doc?.title || name),
        text,
        source: 'upload',
      });
      if (result.skipped) skipped += 1;
      else if (result.docId) {
        added += 1;
        evicted += Number(result.evicted) || 0;
      } else failed.push({ name, error: 'הקובץ קצר מדי לדגימת סגנון.' });
    } catch (err) {
      failed.push({ name, error: String(err?.message || err || 'חילוץ נכשל.') });
    }
    if (typeof onProgress === 'function') {
      try { onProgress({ index: i, total, name, status: 'done' }); } catch {}
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
  return addDocumentSamples({
    title: String(title || '').trim() || 'טקסט שהודבק',
    text: String(text || ''),
    source: String(source || 'paste'),
  });
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

  const batches = buildPatternBatches(chunks, {
    maxChars: PATTERN_BATCH_MAX_CHARS,
    maxBatches: PATTERN_BATCH_MAX_BATCHES,
  });
  if (!batches.length) {
    return { skipped: true, reason: 'no-excerpts' };
  }

  const invokeModel = (prompt) => chatWithActiveProvider(prompt, '', '', {
    ...buildStyleLlmOptions('Style Pattern Extraction', `style-patterns-${Date.now()}`),
  });

  // קריאות סדרתיות (מונע rate-limit storm); כשלון בבאטצ' בודד — מדלגים, סופרים הצלחות.
  const successfulResults = [];
  for (const batch of batches) {
    try {
      const res = await extractQualitativePatterns(batch, invokeModel);
      if (isPlainObject(res)) successfulResults.push(res);
    } catch {
      // batch נכשל — ממשיכים
    }
  }

  const consensus = consensusMergePatterns(successfulResults, { batchCount: successfulResults.length });

  // ביטויי-חתימה דטרמיניסטיים — ground truth; חייבים לשרוד את המיזוג.
  const minedPatterns = mineSignatureNgrams(getChunks(), {});
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
  engine.negativeSpace = [
    ...(Array.isArray(engine.negativeSpace) ? engine.negativeSpace : []),
    ...(Array.isArray(consensus.negativeSpace) ? consensus.negativeSpace : []),
  ];
  engine.blacklist = {
    ...engine.blacklist,
    auto: deriveAutoBlacklist(engine),
  };
  engine.qualitativePatternsStale = false;
  engine.lastAnalysisAt = Date.now();
  engine.extractionMeta = {
    batches: successfulResults.length,
    crossValidated: consensus.crossValidated,
    minedSignatures: minedPatterns.length + minedFormulas.length,
    at: Date.now(),
    llmBatchesFailed: Math.max(0, batches.length - successfulResults.length),
  };
  engine.confidence = recomputeConfidence(engine);

  const saved = saveEngine(profile, engine);
  return { skipped: false, engine: saved };
}

// ---------- removeDocumentAndRecompute ----------

/**
 * מסיר מסמך מה-store ומחשב מדדים מחדש.
 * @param {string} docId
 * @returns {object} engine מנורמל
 */
export function removeDocumentAndRecompute(docId) {
  removeDocument(docId);
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

// re-export לנוחות ה-UI (איפוס מלא של ה-store).
export { clearSampleStore };
