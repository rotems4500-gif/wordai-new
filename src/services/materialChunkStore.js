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

// יחס הטוקנים ה"טהורים" בקטע — עברית נקייה / לטינית נקייה / מספר. קטע OCR משובש
// (טורים מעורבבים בסריקה דו-טורית, עמוד איור) מלא בשברי-תווים לטיניים
// ("‎TR‏", "MINN]", "‎fe") שאינם מילים. נמדד: קטעים תקינים 0.6–0.95, משובשים
// 0.1–0.35. קטע כזה מדלל את התפלגות הדמיון באחזור ומרסק את ה-z של ההתאמות
// האמיתיות — נמדד ב-nlg-loop round-1: כל ה-z נמחצו לטווח 3.2–4.2 וה-zFloor חסם
// הכול. מסמנים את הקטע (garbled) כדי שהאחזור הסמנטי יחריגו — *לא* מוחקים אותו,
// כדי לא לשבור ids/וקטורים ב-cache ולשמור נפילה לקסיקלית. תואם ל-pureTokenRatio
// שברמת-המסמך מפעיל OCR (scaffold-e2e / nlg-loop).
const PURE_TOKEN_RE = /^[֐-׿]{2,}[.,;:!?'"׳״)]?$|^[A-Za-z]{2,}[.,;:!?'")]?$|^\d+([.,]\d+)?$/;
const GARBLE_MIN_TOKENS = 40; // קצר מדי משיפוט אמין — לא מסמנים
const CHUNK_GARBLE_FLOOR = 0.5;
function isChunkGarbled(text) {
  const tokens = String(text || '').match(/\S+/g) || [];
  if (tokens.length < GARBLE_MIN_TOKENS) return false;
  let pure = 0;
  for (const t of tokens) if (PURE_TOKEN_RE.test(t)) pure += 1;
  return pure / tokens.length < CHUNK_GARBLE_FLOOR;
}

// ---------- זיהוי מצגת ----------
//
// חומרי קורס טיפוסיים הם מצגות הרצאה שיוצאו ל-PDF. תבליט אינו פרוזה מדווחת:
// הוא צירוף-נושא בלי פועל מוטה, ולעיתים כותרת שקף שנדבקה לגוף. proseComposeService
// כבר יודע לטפל בזה (sourceKind='slides' ⇒ מהלך ציטוט בלבד, round-4) — אבל רק
// כשמישהו מסמן זאת, ו-PDF של מצגת הגיע בלי סימון.
//
// ⚠️ הסימן המתבקש — שורות קצרות בלי נקודה — **אינו אמין**: חילוץ PDF שובר כל
// פסקה לשורות ויזואליות, ולכן גם מאמר רציף נראה כך. הסימן שנבחר אינו תלוי
// בשבירת שורות: **צפיפות נקודות-סיום ל-100 מילים**. טקסט רציף בנוי ממשפטים
// (משפט ~20 מילים ⇒ ~5 נקודות ל-100 מילים); מצגת בנויה מתבליטים ללא סיומת.
const SLIDE_MIN_WORDS = 120;        // קצר מדי לשיפוט אמין
// ⚠️ המועמד הראשון — צפיפות נקודות-סיום — **נפסל במדידה**: 10 מאמרים נתנו
// 5.14-12.34 נקודות ל-100 מילים ו-5 מצגות נתנו 1.83/5.85/10.00/7.22/2.23.
// חפיפה מלאה; אחת המצגות דירגה גבוה מרוב המאמרים. הסף שנבחר להלן נקבע מהמדידה
// של ארבעת המועמדים (ר' WORDAI_SLIDE_DIAG ב-scaffold-e2e).
// נמדד על 15 מסמכים אמיתיים (10 מאמרים אקדמיים · 5 מצגות הרצאה):
//   מאמרים  7.1 – 15.2 מילים לשורה
//   מצגות   2.3 –  6.1
// הפרדה נקייה. 6.5 יושב באמצע הפער ומשאיר מרווח לשני הכיוונים.
//
// ⚠️ המדד תלוי בשבירת השורות של המחלץ (itemsToLines), ולכן הסף תקף למחלץ הזה.
// מחלץ שמאחד עמוד לשורה אחת יהרוס אותו. כיוון השגיאה נבחר בכוונה: מאמר שסווג
// בטעות כמצגת מוגבל לציטוט ומאבד פרוזה — ולכן הסף נוטה לטובת "רציף".
const SLIDE_WORDS_PER_LINE = 6.5;

/**
 * מדד הרציפות של מסמך: נקודות-סיום ל-100 מילים, וההכרעה הנגזרת ממנו.
 * @returns {{per100:number, words:number, isSlides:boolean}}
 */
export function measureProseContinuity(text) {
  const src = String(text || '');
  const words = countWords(src);
  const terminals = (src.match(/[.!?׃]/g) || []).length;
  const per100 = words ? (terminals / words) * 100 : 0;

  const lines = src.split('\n').map((l) => l.trim()).filter(Boolean);
  const linesPer100 = words ? (lines.length / words) * 100 : 0;
  const wordsPerLine = lines.length ? words / lines.length : 0;
  const closedLines = lines.filter((l) => /[.!?׃:]$/.test(l)).length;
  const closedRatio = lines.length ? closedLines / lines.length : 0;

  return {
    words, per100, linesPer100, wordsPerLine, closedRatio,
    isSlides: words >= SLIDE_MIN_WORDS && wordsPerLine < SLIDE_WORDS_PER_LINE,
  };
}

// ---------- ריהוט-דף חוזר (running headers / footers / חותמות מו"ל) ----------
//
// נמדד (יולי 2026) על קורפוס הדיפלומטיה: החיובי-השגוי הגבוה ביותר *בשני* מנועי
// ההטמעה שנבדקו (e5 ו-bge-m3) לא היה תוכן בכלל אלא חותמת הורדה של Wiley —
//   "…Downloaded from https://onlinelibrary.wiley.com/doi/… See the Terms and
//    Conditions … for rules of use; OA articles are governed by…"
// שמוזרקת מחדש **בכל עמוד**. במאמר של 12 עמודים היא נכנסה ל-35 מקטעים, קיבלה
// z=5.85 מול שאילתת בקרה שלילית על מיל, ונדחתה רק בזכות העוגן הלקסיקלי.
//
// ⚠️ למה *לא* מסנן מילות-מפתח: נמדד שאותם סמנים בדיוק ("licence", "permission",
// "Wiley") מופיעים כתוכן לגיטימי אצל ניי ("denying licenses to others", "Turkey's
// permission for American troops") ובביבליוגרפיה של וולפספלד ("Hoboken, N.J.:
// Wiley-Blackwell"). מסנן סמנים היה קורע חורים דווקא במקור המרכזי של הקורפוס.
//
// הסימן הנכון הוא **חזרתיות**: ריהוט דף חוזר מילה-במילה על פני עמודים, ומשפט
// תוכן אמיתי לא. הנרמול מוחק ספרות כדי ש"…Diplomacy 234" ו"…Diplomacy 235"
// (כותרת רצה + מספר עמוד) ייחשבו לאותה שורה.
const FURNITURE_MIN_REPEATS = 3;   // שתי הופעות עדיין יכולות להיות צירוף מקרים
const FURNITURE_MIN_CHARS = 25;    // שורה קצרה מדי חוזרת גם בתוכן ("טבלה 1")

function furnitureKey(line) {
  return String(line || '')
    .toLowerCase()
    .replace(/\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * מסיר שורות שחוזרות ≥3 פעמים במסמך (אחרי נרמול). שומר על מבנה השורות ועל
 * מפרידי העמודים (\f) — מפת העמודים והפרובננס ממשיכים לעבוד.
 *
 * @param {string} text
 * @returns {{text:string, removed:number}} removed = כמה שורות סוננו
 */
export function stripRepeatedFurniture(text) {
  const src = String(text || '');
  if (!src) return { text: src, removed: 0 };
  const lines = src.split('\n');
  if (lines.length < 6) return { text: src, removed: 0 };

  const counts = new Map();
  for (const line of lines) {
    const key = furnitureKey(line);
    if (key.length < FURNITURE_MIN_CHARS) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  let removed = 0;
  const kept = lines.filter((line) => {
    const key = furnitureKey(line);
    if (key.length < FURNITURE_MIN_CHARS) return true;
    if ((counts.get(key) || 0) < FURNITURE_MIN_REPEATS) return true;
    removed += 1;
    return false;
  });
  if (!removed) return { text: src, removed: 0 };
  return { text: kept.join('\n'), removed };
}

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
 *          strength?:('full'|'abstract'), defer?:boolean, cleanDigital?:boolean,
 *          sourceKind?:string|null}} args
 *        cleanDigital — הקורא (UI/harness) יודע אם המסמך עבר OCR/שוקם מקידוד
 *        שבור; true רק כשלא. proseComposeService משתמש בזה לרצפת-רלוונטיות
 *        מקלה (round-4) — לא מחושב כאן כי אין למודול הזה גישה לפרטי החילוץ.
 *        sourceKind — למשל 'slides' (pptx): מגביל את השימוש בראיה למהלך ציטוט.
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
  cleanDigital = false,
  sourceKind = null,
} = {}) {
  const raw = String(text || '');
  if (!raw.trim()) return { materialId: null, added: 0, skipped: false };

  const blob = readMaterialStore();
  const docHash = hashText(raw);
  const existing = blob.materials.find((m) => m.hash === docHash);
  if (existing) return { materialId: existing.id, added: 0, skipped: true };

  const materialId = `mt_${hash8(docHash)}`;
  const sourceTitle = String(title || 'חומר עזר').trim();
  // ריהוט-דף מוסר *לפני* החיתוך. ה-hash לדה-דופ נשאר על הטקסט המקורי, כך
  // שהניקוי לא הופך מסמך שכבר מאונדקס ל"חדש".
  const { text: body, removed: furnitureRemoved } = stripRepeatedFurniture(raw);
  // זיהוי מצגת אוטומטי כשהקורא לא סימן במפורש. חומרי קורס טיפוסיים הם מצגות
  // הרצאה שיוצאו ל-PDF, והן הגיעו עד כה בלי sourceKind — כלומר תבליטים שימשו
  // כפרוזה מדווחת. סימון מפורש מהקורא (pptx) תמיד גובר.
  const detectedKind = sourceKind || (measureProseContinuity(body).isSlides ? 'slides' : null);
  const pieces = chunkText(body);
  if (!pieces.length) return { materialId: null, added: 0, skipped: false };

  const pageMarks = buildPageMap(body);
  const addedAt = nowTs();
  const safeSourceUrl = String(sourceUrl || '').trim() || null;
  const safeStrength = strength === 'abstract' ? 'abstract' : 'full';

  // charStart: חיפוש קדימה בלבד (cursor) — chunkText שומר על סדר המקור, ולכן
  // indexOf מהמיקום האחרון מוצא את המופע הנכון גם כשקטע חוזר על עצמו.
  let cursor = 0;
  const newChunks = pieces.map((piece, i) => {
    const probe = piece.slice(0, 60);
    const found = body.indexOf(probe, cursor);
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
      sectionHint: sectionForChunk(body, piece, charStart),
      sourceUrl: safeSourceUrl,
      strength: safeStrength,
      // OCR משובש (טורים מעורבבים / עמוד איור) — מוחרג מהאחזור הסמנטי. שדה
      // אופציונלי: קטעים ישנים בלי השדה נחשבים תקינים (backward-compatible).
      garbled: isChunkGarbled(piece),
      // round-4: מקור שלא עבר OCR/שיקום-קידוד — מקבל רצפת-רלוונטיות מקלה
      // ב-proseComposeService. sourceKind='slides' מגביל שימוש למהלך ציטוט בלבד
      // (תבליטי מצגת אינם פרוזה מדווחת). שני השדות אופציונליים, ברירת מחדל שמרנית.
      cleanDigital: Boolean(cleanDigital),
      sourceKind: detectedKind,
      addedAt,
      vec: null,      // base64 int8 — ממולא ע"י putMaterialVectors
      vecSig: null,   // חתימת המודל, כדי לפסול וקטורים ממודל ישן
    };
  });

  const material = {
    id: materialId,
    title: sourceTitle,
    hash: docHash,
    wordCount: countWords(body),
    furnitureRemoved,
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
    furnitureRemoved: blob.materials.reduce((s, m) => s + (Number(m.furnitureRemoved) || 0), 0),
    embedded: blob.chunks.filter((c) => Boolean(c.vec)).length,
    signatureCounts,
    caps: blob.caps,
    updatedAt: blob.updatedAt,
    lastWriteError,
  };
}
