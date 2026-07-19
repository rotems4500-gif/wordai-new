// styleSampleStore.js — מנוע הסגנון האישי (Personal Style Engine), Phase 2.
//
// אחסון ה-raw samples: הטקסט המלא של המסמכים שהמשתמש הזין + ה-chunks שנחתכו מהם
// (כולל gold chunks). מפתח יחיד 'wordai_style_samples_v1' (בבעלות בלעדית של המודול).
//
// בכוונה *לא* מסונכרן לענן (בניגוד ל-wordai_personal_style): ה-raw text גדול מדי
// למגבלת מסמך Firestore 1MB (תוכנית §4/§12). לכן זה store מקומי טהור —
// IndexedDB + CustomEvent בלבד, בלי syncPersistedAppSettings ובלי רישום ב-cloudSyncManager.
//
// אחסון: IndexedDB (styleKvStore) עם cache בזיכרון, כדי לשמור על ה-API הסינכרוני.
// היסטוריה: עד יולי 2026 האחסון היה localStorage — תקרת ה-~5MB שלו (יחד עם caps של
// 200 chunks) גרמה לכך שאחרי 3-4 מסמכים כל העלאה חדשה פינתה את הישנים, וכתיבה שחרגה
// מהמכסה נבלעה ב-catch ריק. עכשיו: caps גבוהים, מיגרציה חד-פעמית מ-localStorage,
// ושגיאות כתיבה נחשפות דרך getSampleStoreStats().lastWriteError.
//
// תלויות: computeLocalMetrics מ-styleProfileService (בשביל metricsLite) + styleKvStore (LEAF).
// אין ייבוא מ-aiService / workspaceLearningService (סיכון מעגל).
// עובד בדפדפן בלבד, ES modules, JS רגיל. תוכנית: docs/style-engine-plan.md §5b, §9.

import { computeLocalMetrics } from './styleProfileService';
import { idbGet, idbSet, isIdbAvailable } from './styleKvStore';

export const STYLE_SAMPLES_STORAGE_KEY = 'wordai_style_samples_v1';
export const STYLE_SAMPLES_SCHEMA_VERSION = 1;
export const STYLE_SAMPLES_UPDATED_EVENT = 'wordai-style-samples-updated';

// תקרות ברירת מחדל. eviction אוכף אותן — אף פעם לא מפנה gold.
// הועלו מ-200/600k (מגבלת localStorage) ל-IndexedDB scale: ~60-80 עבודות אקדמיות.
const DEFAULT_MAX_CHUNKS = 4000;
const DEFAULT_MAX_CHARS = 8000000;

// כללי chunking (§5b behavior details).
const CHUNK_MIN_WORDS = 40;    // מתחת לזה — נמזג עם הבא
const CHUNK_DROP_WORDS = 25;   // מתחת לזה — נזרק (קצר מדי לדגימת סגנון)
const CHUNK_MAX_WORDS = 200;   // מעל לזה — מפוצל למשפטים (בעבר: נחתך והשאר נזרק)
const CHUNK_TARGET_WORDS = 160; // גודל יעד לחתיכה שנחתכת מפסקה ארוכה
const TOP_TERMS = 8;

// stoplist עברי זעיר משוכפל מקומית (feeds RAG keyword scorer ב-Phase 3).
const STYLE_SAMPLE_STOP_WORDS = new Set([
  'של', 'על', 'את', 'זה', 'גם', 'כי', 'אבל', 'או', 'עם', 'לא',
  'אני', 'הוא', 'היא', 'הם', 'כך', 'כדי', 'אשר', 'יותר', 'הזה', 'מה',
]);

// ---------- עזרי בסיס ----------

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const nowTs = () => Date.now();

// hash דטרמיניסטי (djb2) מעל טקסט מנורמל → 'hash_<hex>'.
const normalizeForHash = (input = '') => String(input || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

function djb2Hex(str = '') {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0; // h * 33 + c
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const hashText = (text) => `hash_${djb2Hex(normalizeForHash(text))}`;
const hash8 = (fullHash) => String(fullHash || '').replace(/^hash_/, '').slice(0, 8) || '00000000';

// מילים לספירה (עברית + אנגלית + ספרות).
const WORD_RE = /[֐-׿A-Za-z0-9'"׳״-]+/g;
const countWords = (str = '') => (String(str || '').match(WORD_RE) || []).length;

// ---------- readBlob / writeBlob ----------

function defaultBlob() {
  return {
    schemaVersion: STYLE_SAMPLES_SCHEMA_VERSION,
    updatedAt: 0,
    documents: [],
    chunks: [],
    caps: { maxChunks: DEFAULT_MAX_CHUNKS, maxChars: DEFAULT_MAX_CHARS },
  };
}

// caps ישנים ששמורים ב-blob (200/600k) לא אמורים לכבול משתמש קיים אחרי המעבר
// ל-IndexedDB — לכן לוקחים תמיד את הגבוה מבין השמור לברירת המחדל.
function normalizeCaps(raw) {
  const src = isPlainObject(raw) ? raw : {};
  const maxChunks = Math.round(Number(src.maxChunks));
  const maxChars = Math.round(Number(src.maxChars));
  return {
    maxChunks: Number.isFinite(maxChunks) && maxChunks > 0
      ? Math.max(maxChunks, DEFAULT_MAX_CHUNKS)
      : DEFAULT_MAX_CHUNKS,
    maxChars: Number.isFinite(maxChars) && maxChars > 0
      ? Math.max(maxChars, DEFAULT_MAX_CHARS)
      : DEFAULT_MAX_CHARS,
  };
}

function normalizeBlob(parsed) {
  if (!isPlainObject(parsed)) return defaultBlob();
  return {
    schemaVersion: STYLE_SAMPLES_SCHEMA_VERSION,
    updatedAt: Number.isFinite(Number(parsed.updatedAt)) ? Number(parsed.updatedAt) : 0,
    documents: Array.isArray(parsed.documents) ? parsed.documents.filter(isPlainObject) : [],
    chunks: Array.isArray(parsed.chunks) ? parsed.chunks.filter(isPlainObject) : [],
    caps: normalizeCaps(parsed.caps),
  };
}

// ---------- cache + persistence (IndexedDB, fallback localStorage) ----------

let cache = null;          // ה-blob החי בזיכרון (מקור האמת אחרי hydrate)
let cacheDirty = false;    // בוצעה כתיבה — ה-cache מנצח גם אם ה-hydrate יסתיים אחריה
let hydrated = false;      // האם נטען מה-persistence
let hydratePromise = null;
let lastWriteError = null; // מחרוזת — נחשף ב-getSampleStoreStats
let pendingWrite = null;   // Promise של הכתיבה האחרונה (flush)

function readLegacyLocalStorage() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STYLE_SAMPLES_STORAGE_KEY);
    if (!raw) return null;
    return normalizeBlob(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * טוען את ה-store מ-IndexedDB (פעם אחת). אם אין שם כלום — מהגר את ה-blob הישן
 * מ-localStorage. כשל IndexedDB → נופלים ל-localStorage בלבד (התנהגות ישנה).
 * @returns {Promise<object>} ה-blob
 */
export function ensureSampleStoreReady() {
  if (hydrated) return Promise.resolve(cache);
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    let loaded = null;
    if (isIdbAvailable()) {
      try {
        const stored = await idbGet(STYLE_SAMPLES_STORAGE_KEY);
        if (isPlainObject(stored)) loaded = normalizeBlob(stored);
      } catch (err) {
        lastWriteError = `IndexedDB: ${String(err?.message || err)}`;
      }
    }
    if (!loaded) {
      // מיגרציה חד-פעמית: ה-blob הישן מ-localStorage. לא מוחקים אותו — נשאר גיבוי.
      loaded = readLegacyLocalStorage() || defaultBlob();
    }
    // אם כבר בוצעו כתיבות לפני שה-hydrate הסתיים — הן מנצחות (cache הוא האמת).
    // קריאה סינכרונית מוקדמת (getCache) מילאה cache מה-blob הישן בלבד — אותו כן דורסים.
    if (!cacheDirty) cache = loaded;
    hydrated = true;
    if (loaded.documents.length || loaded.chunks.length) persist();
    emitUpdated(); // ה-UI נטען לפני שה-hydrate הסתיים — מרענן אותו עם הנתונים האמיתיים.
    return cache;
  })();

  return hydratePromise;
}

// מחזיר את ה-cache; לפני hydrate — קריאה סינכרונית מה-blob הישן כדי שלא נחזיר ריק.
function getCache() {
  if (cache) return cache;
  cache = readLegacyLocalStorage() || defaultBlob();
  return cache;
}

function emitUpdated() {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(STYLE_SAMPLES_UPDATED_EVENT));
  } catch {}
}

// כותב את ה-cache ל-persistence. שגיאות *לא* נבלעות — נשמרות ב-lastWriteError.
function persist() {
  const snapshot = cache;
  if (typeof window === 'undefined' || !snapshot) return Promise.resolve();
  pendingWrite = (async () => {
    if (isIdbAvailable()) {
      try {
        await idbSet(STYLE_SAMPLES_STORAGE_KEY, snapshot);
        lastWriteError = null;
        return;
      } catch (err) {
        lastWriteError = `IndexedDB: ${String(err?.message || err)}`;
      }
    }
    // fallback: localStorage (עלול לחרוג מהמכסה — מדווחים במקום לבלוע).
    try {
      localStorage.setItem(STYLE_SAMPLES_STORAGE_KEY, JSON.stringify(snapshot));
      lastWriteError = null;
    } catch (err) {
      lastWriteError = String(err?.name === 'QuotaExceededError'
        ? 'אחסון הדפדפן מלא — הדגימות האחרונות לא נשמרו.'
        : (err?.message || err));
    }
  })();
  return pendingWrite;
}

/** ממתין לסיום הכתיבה האחרונה. @returns {Promise<void>} */
export function flushSampleStore() {
  return Promise.resolve(pendingWrite);
}

/** שגיאת הכתיבה האחרונה (או null). */
export function getSampleStoreWriteError() {
  return lastWriteError;
}

/**
 * קורא ומנרמל את ה-blob (סינכרוני, מה-cache). סובלני לחלוטין.
 * @returns {object}
 */
export function readSampleStore() {
  if (typeof window === 'undefined') return defaultBlob();
  return getCache();
}

function writeBlob(blob) {
  if (typeof window === 'undefined') return;
  cache = {
    schemaVersion: STYLE_SAMPLES_SCHEMA_VERSION,
    updatedAt: nowTs(),
    documents: Array.isArray(blob?.documents) ? blob.documents : [],
    chunks: Array.isArray(blob?.chunks) ? blob.chunks : [],
    caps: normalizeCaps(blob?.caps),
  };
  cacheDirty = true;
  persist();
  emitUpdated();
}

// hydrate מוקדם — מתחיל ברגע טעינת המודול כדי שקוראים סינכרוניים יקבלו נתונים אמיתיים.
if (typeof window !== 'undefined') {
  try { ensureSampleStoreReady(); } catch {}
}

// ---------- chunking + metricsLite + terms ----------

// מפצל טקסט ארוך לחתיכות של ~CHUNK_TARGET_WORDS מילים על גבול משפט.
// קריטי: שום מילה לא נזרקת. (בעבר פסקה >200 מילים נחתכה ל-200 והשאר אבד — מסמכי PDF
// מגיעים כפסקה אחת ענקית לעמוד, כך שכל עמוד תרם 200 מילים בלבד.)
function splitLongParagraph(paragraph) {
  const sentences = String(paragraph || '')
    .split(/(?<=[.!?…:;])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!sentences.length) return [];

  const out = [];
  let buffer = [];
  let bufferWords = 0;
  const flush = () => {
    if (!buffer.length) return;
    out.push(buffer.join(' '));
    buffer = [];
    bufferWords = 0;
  };

  for (const sentence of sentences) {
    const words = sentence.match(WORD_RE) || [];
    // משפט בודד ענק (למשל טקסט בלי פיסוק) — מפוצל לפי מילים, בלי לאבד שארית.
    if (words.length > CHUNK_MAX_WORDS) {
      flush();
      for (let i = 0; i < words.length; i += CHUNK_TARGET_WORDS) {
        out.push(words.slice(i, i + CHUNK_TARGET_WORDS).join(' '));
      }
      continue;
    }
    buffer.push(sentence);
    bufferWords += words.length;
    if (bufferWords >= CHUNK_TARGET_WORDS) flush();
  }
  flush();
  return out;
}

// חיתוך טקסט ל-chunks בסדר גודל פסקה (40-200 מילים).
// split על שורה כפולה; פסקה קצרה (<40) נמזגת בחמדנות עם הבאה; <25 מילים נזרק;
// >200 מילים — מפוצל למשפטים (splitLongParagraph), לא נחתך.
function chunkText(text) {
  const clean = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[\t ]+/g, ' ');
  const paragraphs = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  const merged = [];
  let buffer = '';
  let bufferWords = 0;
  for (const para of paragraphs) {
    buffer = buffer ? `${buffer}\n\n${para}` : para;
    bufferWords += countWords(para);
    if (bufferWords >= CHUNK_MIN_WORDS) {
      merged.push(buffer);
      buffer = '';
      bufferWords = 0;
    }
  }
  if (buffer) merged.push(buffer); // שארית — עשוי להיות קצר, ייבדק למטה

  const out = [];
  for (const raw of merged) {
    const words = raw.match(WORD_RE) || [];
    if (words.length < CHUNK_DROP_WORDS) continue; // קצר מדי לדגימת סגנון
    if (words.length > CHUNK_MAX_WORDS) {
      splitLongParagraph(raw).forEach((piece) => {
        if ((piece.match(WORD_RE) || []).length >= CHUNK_DROP_WORDS) out.push(piece);
      });
    } else {
      out.push(raw.trim());
    }
  }
  return out;
}

// metricsLite לכל chunk — נגזר מ-computeLocalMetrics (עשוי null ל-chunk קצר).
function deriveMetricsLite(chunkText) {
  const full = computeLocalMetrics(chunkText);
  if (!full) return { avgSentenceWords: 0, commas: 0, connectors: [] };
  return {
    avgSentenceWords: Number(full.avgSentenceWords) || 0,
    commas: Number(full.avgCommasPerSentence) || 0,
    connectors: isPlainObject(full.connectorFrequency)
      ? Object.keys(full.connectorFrequency).slice(0, 4)
      : [],
  };
}

// top ~8 מונחי תוכן — מילים ≥3 תווים, פחות stopwords, לפי תדירות.
function extractTerms(chunkText) {
  const words = (String(chunkText || '').match(WORD_RE) || [])
    .map((w) => w.replace(/^["'׳״-]+|["'׳״-]+$/g, '').toLowerCase())
    .filter((w) => w.length >= 3 && !STYLE_SAMPLE_STOP_WORDS.has(w));
  const freq = {};
  words.forEach((w) => { freq[w] = (freq[w] || 0) + 1; });
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_TERMS)
    .map(([w]) => w);
}

// ---------- eviction (cap enforcement) ----------

// מפנה chunks הכי ישנים (NON-gold) עד לעמידה ב-caps. gold תמיד נשאר.
function enforceCaps(chunks, caps) {
  let list = [...chunks];
  const totalChars = (arr) => arr.reduce((sum, c) => sum + String(c.text || '').length, 0);
  const evictOldestNonGold = () => {
    let oldestIdx = -1;
    let oldestAt = Infinity;
    list.forEach((c, i) => {
      if (c.isGold) return;
      const at = Number(c.addedAt) || 0;
      if (at < oldestAt) { oldestAt = at; oldestIdx = i; }
    });
    if (oldestIdx === -1) return false; // רק gold נשאר
    list.splice(oldestIdx, 1);
    return true;
  };

  while (list.length > caps.maxChunks) {
    if (!evictOldestNonGold()) break;
  }
  while (totalChars(list) > caps.maxChars) {
    if (!evictOldestNonGold()) break;
  }
  return list;
}

// ---------- public getters ----------

/** @returns {Array<object>} documents[] */
export function getSampleDocuments() {
  return readSampleStore().documents;
}

/**
 * @param {{goldOnly?:boolean}} opts
 * @returns {Array<object>} chunks[]
 */
export function getChunks({ goldOnly = false } = {}) {
  const chunks = readSampleStore().chunks;
  return goldOnly ? chunks.filter((c) => c.isGold) : chunks;
}

// ---------- addDocumentSamples ----------

/**
 * חותך מסמך ל-chunks, מזהה כפילות לפי hash המסמך, ומצרף. אוכף caps.
 * אם מסמך עם אותו hash כבר קיים → skip (לא כופל).
 * @param {{title?:string, text:string, source?:string, isGold?:boolean}} args
 * @returns {{docId:(string|null), added:number, skipped:boolean}}
 */
export function addDocumentSamples({ title, text, source = 'upload', isGold = false, genre = null } = {}) {
  const raw = String(text || '');
  if (!raw.trim()) return { docId: null, added: 0, skipped: false };

  const blob = readSampleStore();
  const docHash = hashText(raw);

  // dedupe לפי hash מסמך.
  if (blob.documents.some((d) => d.hash === docHash)) {
    return { docId: null, added: 0, skipped: true };
  }

  const short = hash8(docHash);
  const counter = blob.documents.length;
  const docId = `doc_${short}_${counter}`;
  const now = nowTs();
  // E3: ז'אנר אופציונלי — מסווג פעם אחת בעת הקליטה (או null עד לסיווג post-hoc).
  const docGenre = genre ? String(genre).trim() || null : null;

  const pieces = chunkText(raw);
  const newChunks = pieces.map((chunk, index) => ({
    id: `ck_${short}_${index}`,
    docId,
    text: chunk,
    wordCount: countWords(chunk),
    isGold: Boolean(isGold),
    metricsLite: deriveMetricsLite(chunk),
    terms: extractTerms(chunk),
    addedAt: now,
    genre: docGenre,
  }));

  const docEntry = {
    id: docId,
    title: String(title || '').trim() || 'ללא כותרת',
    hash: docHash,
    wordCount: countWords(raw),
    addedAt: now,
    source: String(source || 'upload').trim() || 'upload',
    genre: docGenre,
  };

  const nextChunks = enforceCaps([...blob.chunks, ...newChunks], blob.caps);
  // אם כל ה-chunks של המסמך פונו (מקרה קצה) — עדיין רושמים את המסמך; added משקף כמה נשמרו בפועל.
  const survivingIds = new Set(nextChunks.map((c) => c.id));
  const added = newChunks.filter((c) => survivingIds.has(c.id)).length;
  // כמה chunks *קיימים* פונו כדי לפנות מקום — מדווח למעלה כדי שה-UI יזהיר במקום לשתוק.
  const evicted = blob.chunks.filter((c) => !survivingIds.has(c.id)).length;

  writeBlob({
    ...blob,
    documents: [...blob.documents, docEntry],
    chunks: nextChunks,
  });

  return { docId, added, evicted, skipped: false };
}

// ---------- removeDocument ----------

/**
 * מסיר מסמך ואת כל ה-chunks שלו.
 * @param {string} docId
 * @returns {{removed:boolean}}
 */
export function removeDocument(docId) {
  const id = String(docId || '').trim();
  if (!id) return { removed: false };
  const blob = readSampleStore();
  const hasDoc = blob.documents.some((d) => d.id === id);
  const hasChunks = blob.chunks.some((c) => c.docId === id);
  if (!hasDoc && !hasChunks) return { removed: false };

  writeBlob({
    ...blob,
    documents: blob.documents.filter((d) => d.id !== id),
    chunks: blob.chunks.filter((c) => c.docId !== id),
  });
  return { removed: true };
}

// ---------- setDocumentGenre ----------

/**
 * מעדכן את הז'אנר של מסמך + כל ה-chunks שלו (נקרא אחרי סיווג ז'אנר ב-styleIngestService).
 * @param {string} docId
 * @param {(string|null)} genre
 * @returns {{updated:boolean}}
 */
export function setDocumentGenre(docId, genre) {
  const id = String(docId || '').trim();
  if (!id) return { updated: false };
  const nextGenre = genre ? String(genre).trim() || null : null;
  const blob = readSampleStore();
  const hasDoc = blob.documents.some((d) => d.id === id);
  if (!hasDoc) return { updated: false };

  writeBlob({
    ...blob,
    documents: blob.documents.map((d) => (d.id === id ? { ...d, genre: nextGenre } : d)),
    chunks: blob.chunks.map((c) => (String(c?.docId || '') === id ? { ...c, genre: nextGenre } : c)),
  });
  return { updated: true };
}

// ---------- addGoldChunk ----------

/**
 * מוסיף chunk gold יחיד (עבור delta >20% ב-Phase 5). gold לעולם לא מפונה.
 * @param {{text:string, docId?:(string|null), title?:string}} args
 * @returns {(string|null)} chunkId
 */
export function addGoldChunk({ text, docId = null, title = 'gold' } = {}) {
  const raw = String(text || '');
  if (!raw.trim()) return null;

  const blob = readSampleStore();
  const fullHash = hashText(raw);
  const short = hash8(fullHash);
  const now = nowTs();

  // אינדקס ייחודי: hash8 + מספר ה-gold הקיימים + Date.now (מותר בקוד אפליקציה).
  const goldIndex = blob.chunks.filter((c) => c.isGold).length;
  const chunkId = `gc_${short}_${goldIndex}_${now}`;

  const goldChunk = {
    id: chunkId,
    docId: docId ? String(docId) : null,
    text: raw.trim(),
    wordCount: countWords(raw),
    isGold: true,
    metricsLite: deriveMetricsLite(raw),
    terms: extractTerms(raw),
    addedAt: now,
    ...(title ? { title: String(title).trim() } : {}),
  };

  // gold תמיד נשמר; enforceCaps לא יפנה אותו, אך עשוי לפנות non-gold ישנים אם עברנו cap.
  const nextChunks = enforceCaps([...blob.chunks, goldChunk], blob.caps);
  writeBlob({ ...blob, chunks: nextChunks });
  return chunkId;
}

// ---------- clearSampleStore ----------

/** מאפס את ה-store לחלוטין. */
export function clearSampleStore() {
  writeBlob(defaultBlob());
}

// ---------- getSampleStoreStats ----------

/**
 * @returns {{docCount:number, chunkCount:number, goldCount:number, totalChars:number, totalWords:number}}
 */
export function getSampleStoreStats() {
  const blob = readSampleStore();
  let totalChars = 0;
  let totalWords = 0;
  let goldCount = 0;
  blob.chunks.forEach((c) => {
    totalChars += String(c.text || '').length;
    totalWords += Number(c.wordCount) || 0;
    if (c.isGold) goldCount += 1;
  });
  return {
    docCount: blob.documents.length,
    chunkCount: blob.chunks.length,
    goldCount,
    totalChars,
    totalWords,
    caps: blob.caps,
    lastWriteError,
  };
}
