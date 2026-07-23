// materialChunkStore.js — אינדקס מקומי של חומרי העזר האקדמיים (מאמרים, פרקים, סיכומים).
//
// למה store נפרד מ-styleSampleStore: זה קורפוס *תוכן*, לא קורפוס *סגנון*. דחיפת
// מאמרים אקדמיים לחנות הסגנון הייתה מזהמת את הפרופיל — המשתמש היה "לומד" לכתוב
// כמו המחברים שהוא קורא. שני קורפוסים, שתי מטרות.
//
// מה זה פותר: היום חומרי העזר נשמרים כטקסט גולמי (wordai_browser_uploaded_materials
// ב-localStorage) והבחירה האוטומטית מדרגת לפי *מטא-דאטה* בלבד — כותרת ותווית, לא
// תוכן. כלומר מאמר רלוונטי עם כותרת גנרית לעולם לא ייבחר. כאן הם נחתכים ל-chunks,
// מקבלים embedding מקומי (e5, WASM, בלי מפתח API), ונשלפים לפי משמעות.
//
// פרובננס: בניגוד ל-chunk של סגנון, כאן חובה לדעת *מאיפה* הקטע בא — בלי זה אי אפשר
// לצטט. לכן sourceTitle/pageHint/sectionHint/charStart על כל רשומה.
//
// הווקטור נשמר על ה-chunk עצמו (base64 int8) ולא בחנות נפרדת כמו styleEmbeddingStore:
// שם ההפרדה נחוצה כי pruneVectors רץ מול חיי ה-chunks של הסגנון; כאן זה היה יוצר
// שתי חנויות שחייבות להישאר מסונכרנות בלי שום רווח.
//
// תלויות: styleSampleStore (chunkText/extractTerms בלבד) + styleKvStore (LEAF).
// browser-only. אין import מ-aiService/workspaceLearningService (סיכון מעגל).

import { chunkText, extractTerms } from './styleSampleStore';
import { idbGet, idbSet, isIdbAvailable } from './styleKvStore';

export const MATERIAL_CHUNKS_STORAGE_KEY = 'wordai_material_chunks_v1';
export const MATERIAL_CHUNKS_SCHEMA_VERSION = 1;
export const MATERIAL_CHUNKS_UPDATED_EVENT = 'wordai-material-chunks-updated';

// תקרות. גבוהות מהסגנון: ספרייה של 20-30 מאמרים אקדמיים מגיעה בקלות ל-5000 chunks.
// 6000 היה נמוך מדי: העלאה אחת של ~32 מאמרים מייצרת ~30k chunks, כלומר 80% מהחומר
// שהמשתמש העלה פונה בשקט מיד אחרי שנכנס.
const DEFAULT_MAX_CHUNKS = 30000;
const DEFAULT_MAX_CHARS = 24000000;

const WORD_RE = /[֐-׿יִ-ﭏA-Za-z0-9'"׳״-]+/g;
const countWords = (str = '') => (String(str || '').match(WORD_RE) || []).length;

// כותרת סעיף בתוך מאמר: שורה קצרה בלי נקודה בסוף, או ממוספרת, או Markdown.
const SECTION_LINE_RE = /^(?:#{1,4}\s+.+|(?:\d+(?:\.\d+)*|[א-ת])[.)]\s+\S.{0,80}|[^\n.!?]{3,80})$/;

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const nowTs = () => Date.now();

function djb2Hex(str = '') {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const normalizeForHash = (input = '') => String(input || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const hashText = (text) => `hash_${djb2Hex(normalizeForHash(text))}`;
const hash8 = (fullHash) => String(fullHash || '').replace(/^hash_/, '').slice(0, 8) || '00000000';

// ---------- blob ----------

function defaultBlob() {
  return {
    schemaVersion: MATERIAL_CHUNKS_SCHEMA_VERSION,
    updatedAt: 0,
    materials: [],
    chunks: [],
    caps: { maxChunks: DEFAULT_MAX_CHUNKS, maxChars: DEFAULT_MAX_CHARS },
  };
}

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
    schemaVersion: MATERIAL_CHUNKS_SCHEMA_VERSION,
    updatedAt: Number.isFinite(Number(parsed.updatedAt)) ? Number(parsed.updatedAt) : 0,
    materials: Array.isArray(parsed.materials) ? parsed.materials.filter(isPlainObject) : [],
    chunks: Array.isArray(parsed.chunks) ? parsed.chunks.filter(isPlainObject) : [],
    caps: normalizeCaps(parsed.caps),
  };
}

// ---------- hydration / persistence ----------

let cache = null;
let hydratePromise = null;
let pendingWrite = Promise.resolve();
let lastWriteError = null;
let writeQueued = false;
let dirty = false;

/** טוען את החנות מ-IndexedDB. בטוח לקרוא פעמים רבות. @returns {Promise<object>} */
export function ensureMaterialStoreReady() {
  if (typeof window === 'undefined') return Promise.resolve(defaultBlob());
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    if (isIdbAvailable()) {
      try {
        const stored = await idbGet(MATERIAL_CHUNKS_STORAGE_KEY);
        if (stored) {
          cache = normalizeBlob(stored);
          return cache;
        }
      } catch (err) {
        lastWriteError = `IndexedDB: ${String(err?.message || err)}`;
      }
    }
    cache = cache || defaultBlob();
    return cache;
  })();

  return hydratePromise;
}

function getCache() {
  if (!cache) cache = defaultBlob();
  return cache;
}

function emitUpdated() {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(MATERIAL_CHUNKS_UPDATED_EVENT));
  } catch {}
}

// כתיבה. שגיאות נחשפות ב-lastWriteError במקום להיבלע — הבליעה היא בדיוק מה שהסתיר
// את בעיית הקיבולת של חנות הסגנון עד יולי 2026.
//
// הכתיבות *מסודרות בתור*, לא נורות במקביל: כל idbSet הוא structured-clone סינכרוני
// של כל ה-blob (עשרות MB אחרי העלאה גדולה). ירי של 30 כאלה בזה אחר זה בלי להמתין
// החזיק 30 עותקי סריאליזציה בזיכרון בו-זמנית. כאן: לכל היותר אחת רצה ואחת בתור,
// והממתינה תמיד כותבת את ה-cache העדכני ביותר.
function persist() {
  if (typeof window === 'undefined' || !cache) return Promise.resolve();
  if (writeQueued) return pendingWrite;
  writeQueued = true;
  pendingWrite = pendingWrite.then(async () => {
    writeQueued = false;
    const snapshot = cache;
    if (!snapshot) return;
    if (isIdbAvailable()) {
      try {
        await idbSet(MATERIAL_CHUNKS_STORAGE_KEY, snapshot);
        lastWriteError = null;
        return;
      } catch (err) {
        lastWriteError = `IndexedDB: ${String(err?.message || err)}`;
      }
    }
    // אין fallback ל-localStorage: הקורפוס הזה גדול בהרבה מ-5MB. עדיף כישלון גלוי.
    if (!isIdbAvailable()) {
      lastWriteError = 'IndexedDB לא זמין — אינדקס חומרי העזר לא נשמר.';
    }
    // catch על החוליה: בלי זה דחייה אחת מרעילה את השרשרת ו*כל* כתיבה עתידית נכשלת.
  }).catch((err) => { lastWriteError = `write: ${String(err?.message || err)}`; });
  return pendingWrite;
}

/** ממתין לסיום הכתיבה האחרונה. @returns {Promise<void>} */
export function flushMaterialStore() {
  return Promise.resolve(pendingWrite);
}

/** שגיאת הכתיבה האחרונה (או null). */
export function getMaterialStoreWriteError() {
  return lastWriteError;
}

/** קורא את ה-blob (סינכרוני, מה-cache). @returns {object} */
export function readMaterialStore() {
  if (typeof window === 'undefined') return defaultBlob();
  return getCache();
}

function writeBlob(blob, { defer = false } = {}) {
  if (typeof window === 'undefined') return;
  cache = {
    schemaVersion: MATERIAL_CHUNKS_SCHEMA_VERSION,
    updatedAt: nowTs(),
    materials: Array.isArray(blob?.materials) ? blob.materials : [],
    chunks: Array.isArray(blob?.chunks) ? blob.chunks : [],
    caps: normalizeCaps(blob?.caps),
  };
  if (defer) { dirty = true; return; }
  dirty = false;
  persist();
  emitUpdated();
}

/**
 * מסיים ingest שנעשה עם defer:true — כתיבה אחת ואירוע אחד לכל האצווה.
 * בלי זה, העלאה של 32 קבצים = 32 כתיבות מלאות + 32 render-ים של כל המסך.
 * @returns {Promise<void>}
 */
export function commitMaterialStore() {
  if (!dirty) return Promise.resolve(pendingWrite);
  dirty = false;
  const p = persist();
  emitUpdated();
  return p;
}

if (typeof window !== 'undefined') {
  try { ensureMaterialStoreReady(); } catch {}
}

// ---------- פרובננס ----------

// מפת עמודים: מחלץ מהטקסט את גבולות העמודים. pdfjs ב-materialExtractBrowser מפריד
// עמודים ב-form-feed (\f); כגיבוי מזוהה גם סמן "עמוד N" בשורה נפרדת.
function buildPageMap(text) {
  const src = String(text || '');
  const marks = [];
  const ff = /\f/g;
  let m = ff.exec(src);
  while (m) {
    marks.push(m.index);
    m = ff.exec(src);
  }
  if (!marks.length) {
    const re = /^\s*(?:עמוד|page)\s+(\d+)\s*$/gim;
    let pm = re.exec(src);
    while (pm) {
      marks.push(pm.index);
      pm = re.exec(src);
    }
  }
  return marks;
}

// מספר העמוד שאליו שייך offset — כמות המעברים שקדמו לו, +1.
function pageAtOffset(pageMarks, offset) {
  if (!pageMarks.length) return null;
  let count = 0;
  for (const mark of pageMarks) {
    if (mark <= offset) count += 1;
    else break;
  }
  return count + 1;
}

// האם השורה נראית ככותרת סעיף.
function looksLikeHeading(line) {
  const s = String(line || '').trim();
  if (!s || s.length > 90) return false;
  if (/[,;]$/.test(s)) return false;
  if (!SECTION_LINE_RE.test(s)) return false;
  const words = countWords(s);
  return words >= 1 && words <= 14;
}

// כותרת הסעיף הקרובה שקדמה ל-offset. סורק אחורה עד 40 שורות.
function sectionAtOffset(text, offset) {
  const before = String(text || '').slice(0, offset);
  const lines = before.split('\n');
  const scanFrom = Math.max(0, lines.length - 40);
  for (let i = lines.length - 1; i >= scanFrom; i -= 1) {
    const line = lines[i].trim();
    if (!looksLikeHeading(line)) continue;
    return line.replace(/^#{1,4}\s+/, '');
  }
  return null;
}

// הכותרת ששייכת ל-chunk. הסריקה אחורה לבדה נותנת תשובה שגויה כש-chunk *פותח*
// בכותרת שלו: charStart מצביע על הכותרת עצמה, וכל מה שלפניה שייך לסעיף הקודם.
// לכן קודם בודקים את השורה הראשונה של ה-chunk עצמו.
function sectionForChunk(fullText, chunkBody, charStart) {
  // ה-chunk הראשון פותח בכותרת *המסמך*, לא בכותרת סעיף — אין לו סעיף.
  if (charStart === 0) return null;
  const firstLine = String(chunkBody || '').split('\n', 1)[0].trim();
  if (looksLikeHeading(firstLine)) return firstLine.replace(/^#{1,4}\s+/, '');
  return sectionAtOffset(fullText, charStart);
}

// ---------- caps ----------

// פינוי הישן-קודם. הגרסה הקודמת סרקה את כל הרשימה מחדש לכל chunk שפונה (ומחשבת
// מחדש את סך התווים בכל סיבוב) — O(n²). בהעלאה של 32 מאמרים זה אלפי פינויים על
// רשימה של עשרות אלפים, כלומר מאות מיליוני איטרציות שתוקעות את הטאב עד קריסה.
// כאן: מיון גילים אחד, ואז מעבר יחיד.
function enforceCaps(chunks, caps) {
  const list = chunks;
  const lenOf = (c) => String(c.text || '').length;
  let total = 0;
  for (const c of list) total += lenOf(c);
  if (list.length <= caps.maxChunks && total <= caps.maxChars) return [...list];

  const order = list.map((c, i) => [Number(c.addedAt) || 0, i]);
  order.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));

  const drop = new Set();
  let count = list.length;
  for (let p = 0; p < order.length; p += 1) {
    if (count <= caps.maxChunks && total <= caps.maxChars) break;
    const idx = order[p][1];
    drop.add(idx);
    total -= lenOf(list[idx]);
    count -= 1;
  }
  if (!drop.size) return [...list];
  return list.filter((_, i) => !drop.has(i));
}

// ---------- getters ----------

/** @returns {Array<object>} materials[] */
export function getMaterials() {
  return readMaterialStore().materials;
}

/**
 * @param {{materialIds?:string[], projectId?:string|null}} opts סינון אופציונלי
 * @returns {Array<object>} chunks[]
 */
export function getMaterialChunks({ materialIds = null, projectId = null } = {}) {
  const blob = readMaterialStore();
  let list = blob.chunks;
  if (Array.isArray(materialIds) && materialIds.length) {
    const allow = new Set(materialIds);
    list = list.filter((c) => allow.has(c.materialId));
  }
  if (projectId) {
    const inProject = new Set(
      blob.materials.filter((m) => m.projectId === projectId).map((m) => m.id),
    );
    list = list.filter((c) => inProject.has(c.materialId));
  }
  return list;
}

/** האם מאמר עם אותו תוכן כבר מאונדקס. @returns {boolean} */
export function hasMaterialText(text) {
  const h = hashText(text);
  return readMaterialStore().materials.some((m) => m.hash === h);
}

// ---------- ingest ----------

/**
 * חותך חומר עזר ל-chunks עם פרובננס ומצרף לאינדקס. dedupe לפי hash תוכן.
 *
 * strength: 'full' = נמשך גוף העמוד. 'abstract' = רק תקציר/snippet (נפילה מכוונת
 * כשמשיכת העמוד נכשלה) — נשמר, אבל מסומן כך שגם הפאנל וגם הפרומפט יידעו שזו
 * ראיה חלשה ולא הטקסט המלא.
 *
 * @param {{title?:string, text:string, source?:string, projectId?:string|null,
 *          kind?:string, materialKey?:string|null, sourceUrl?:string|null,
 *          strength?:('full'|'abstract'), defer?:boolean}} args
 *        defer=true — צובר בזיכרון בלי לכתוב ל-IDB ובלי לשדר אירוע. חובה לקרוא
 *        commitMaterialStore() בסוף האצווה.
 * @returns {{materialId:(string|null), added:number, skipped:boolean}}
 */
export function addMaterialDocument({
  title,
  text,
  source = 'upload',
  projectId = null,
  kind = 'course-materials',
  materialKey = null,
  sourceUrl = null,
  strength = 'full',
  defer = false,
} = {}) {
  const raw = String(text || '');
  if (!raw.trim()) return { materialId: null, added: 0, skipped: false };

  const blob = readMaterialStore();
  const docHash = hashText(raw);
  const existing = blob.materials.find((m) => m.hash === docHash);
  if (existing) return { materialId: existing.id, added: 0, skipped: true };

  const materialId = `mt_${hash8(docHash)}`;
  const sourceTitle = String(title || 'חומר עזר').trim();
  const pieces = chunkText(raw);
  if (!pieces.length) return { materialId: null, added: 0, skipped: false };

  const pageMarks = buildPageMap(raw);
  const addedAt = nowTs();
  const safeSourceUrl = String(sourceUrl || '').trim() || null;
  const safeStrength = strength === 'abstract' ? 'abstract' : 'full';

  // charStart: חיפוש קדימה בלבד (cursor) — chunkText שומר על סדר המקור, ולכן
  // indexOf מהמיקום האחרון מוצא את המופע הנכון גם כשקטע חוזר על עצמו.
  let cursor = 0;
  const newChunks = pieces.map((piece, i) => {
    const probe = piece.slice(0, 60);
    const found = raw.indexOf(probe, cursor);
    const charStart = found >= 0 ? found : cursor;
    cursor = charStart + Math.max(1, piece.length - 20);
    return {
      id: `mk_${hash8(docHash)}_${i}`,
      materialId,
      sourceTitle,
      text: piece,
      wordCount: countWords(piece),
      terms: extractTerms(piece),
      charStart,
      pageHint: pageAtOffset(pageMarks, charStart),
      sectionHint: sectionForChunk(raw, piece, charStart),
      sourceUrl: safeSourceUrl,
      strength: safeStrength,
      addedAt,
      vec: null,      // base64 int8 — ממולא ע"י putMaterialVectors
      vecSig: null,   // חתימת המודל, כדי לפסול וקטורים ממודל ישן
    };
  });

  const material = {
    id: materialId,
    title: sourceTitle,
    hash: docHash,
    wordCount: countWords(raw),
    chunkCount: newChunks.length,
    addedAt,
    source,
    projectId,
    kind,
    materialKey, // מקשר לרשומה ב-wordai_browser_uploaded_materials
    sourceUrl: safeSourceUrl,
    strength: safeStrength,
  };

  const caps = blob.caps;
  const merged = enforceCaps([...blob.chunks, ...newChunks], caps);
  // מאמר שכל ה-chunks שלו פונו — אין טעם לשמור את הרשומה שלו.
  const liveIds = new Set(merged.map((c) => c.materialId));
  const materials = [...blob.materials, material].filter((m) => liveIds.has(m.id));

  writeBlob({ ...blob, materials, chunks: merged }, { defer });
  return { materialId, added: newChunks.length, skipped: false };
}

/** מסיר חומר עזר ואת כל ה-chunks שלו. @returns {boolean} */
export function removeMaterial(materialId) {
  const blob = readMaterialStore();
  if (!blob.materials.some((m) => m.id === materialId)) return false;
  writeBlob({
    ...blob,
    materials: blob.materials.filter((m) => m.id !== materialId),
    chunks: blob.chunks.filter((c) => c.materialId !== materialId),
  });
  return true;
}

/** מנקה את כל האינדקס. */
export function clearMaterialStore() {
  writeBlob({ materials: [], chunks: [], caps: readMaterialStore().caps });
}

// ---------- וקטורים ----------

/**
 * chunks שעדיין אין להם וקטור תקף (או שהחתימה שלהם ממודל ישן).
 * @param {string} signature חתימת המודל הנוכחית (STYLE_EMBEDDING_SIGNATURE)
 * @param {{limit?:number}} opts
 * @returns {Array<object>}
 */
export function getUnembeddedMaterialChunks(signature, { limit = Infinity } = {}) {
  const out = [];
  for (const chunk of readMaterialStore().chunks) {
    if (chunk.vec && chunk.vecSig === signature) continue;
    out.push(chunk);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * שומר וקטורים על ה-chunks. entries: [{chunkId, vec (base64 int8)}]
 * @returns {number} כמה נשמרו בפועל
 */
export function putMaterialVectors(entries, signature) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) return 0;
  const byId = new Map(list.map((e) => [e.chunkId, e.vec]));
  const blob = readMaterialStore();
  let saved = 0;
  const chunks = blob.chunks.map((c) => {
    if (!byId.has(c.id)) return c;
    const vec = byId.get(c.id);
    if (!vec) return c;
    saved += 1;
    return { ...c, vec, vecSig: signature };
  });
  if (!saved) return 0;
  writeBlob({ ...blob, chunks });
  return saved;
}

/**
 * מפת chunkId → וקטור base64 int8, *לא* מפוענח. הפענוח ל-Float32Array (מה ש-
 * selectChunks מצפה לו ב-vectorById) נעשה ב-evidenceMatchService — כדי שהחנות
 * תישאר בלי תלות ב-styleEmbeddingService.
 * @returns {Object<string,string>}
 */
export function getMaterialVectorsBase64(signature) {
  const map = {};
  for (const chunk of readMaterialStore().chunks) {
    if (chunk.vec && chunk.vecSig === signature) map[chunk.id] = chunk.vec;
  }
  return map;
}

/** סטטיסטיקות לתצוגה ב-UI. */
export function getMaterialStoreStats() {
  const blob = readMaterialStore();
  const signatureCounts = {};
  blob.chunks.forEach((c) => {
    const key = c.vecSig || 'none';
    signatureCounts[key] = (signatureCounts[key] || 0) + 1;
  });
  return {
    materials: blob.materials.length,
    chunks: blob.chunks.length,
    chars: blob.chunks.reduce((s, c) => s + String(c.text || '').length, 0),
    embedded: blob.chunks.filter((c) => Boolean(c.vec)).length,
    signatureCounts,
    caps: blob.caps,
    updatedAt: blob.updatedAt,
    lastWriteError,
  };
}
