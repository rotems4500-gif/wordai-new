// styleAutocompleteService.js — השלמה אוטומטית מקומית מתוך הקורפוס האישי.
//
// למה: מחולל טקסט דורש מפתח API. השלמה *לא* דורשת — אפשר לנבא את ההמשך
// מתוך מה שהמשתמש עצמו כתב בעבר (הצ'אנקים ב-styleSampleStore). ההצעות הן
// ביטויים אמיתיים שלו, לא ניסוח של מודל.
//
// המנגנון: אינדקס n-gram (2/3 מילים → המשכים) שנבנה lazy בעליית האפליקציה
// מהצ'אנקים הקיימים, ונשמר ב-IndexedDB עם fingerprint של הקורפוס. שינה
// הקורפוס → הפינגרפרינט משתנה → בנייה מחדש. אין re-ingest למשתמשים קיימים.
//
// pruning: רק prefix שהופיע ≥MIN_PREFIX_COUNT פעמים נשמר. זה גם חוסך זיכרון
// וגם *הוא* תנאי הביטחון — ביטוי שהופיע פעם אחת אינו הרגל כתיבה.
//
// תלויות: styleSampleStore (קריאה בלבד) + styleKvStore (LEAF). browser-only.

import { getChunks, ensureSampleStoreReady, STYLE_SAMPLES_UPDATED_EVENT } from './styleSampleStore';
import { idbGet, idbSet, isIdbAvailable } from './styleKvStore';

export const STYLE_AUTOCOMPLETE_CACHE_KEY = 'wordai_style_autocomplete_v1';
// v2 (יולי 2026): ההמשכים נספרים לכל אורך 1-6 בנפרד ונשמר הארוך ביותר שחוזר.
// ב-v1 נשמר רק המשך בן 6 מילים שחייב לחזור מילה-במילה — כמעט אף שאילתה לא עברה.
// העלאת הגרסה פוסלת את ה-cache הישן ב-IndexedDB וכופה בנייה מחדש.
export const STYLE_AUTOCOMPLETE_SCHEMA_VERSION = 2;
export const STYLE_AUTOCOMPLETE_READY_EVENT = 'wordai-style-autocomplete-ready';

// ---------- כוונונים ----------

const MAX_WORDS_SCANNED = 500000; // תקרת עיבוד — מגן על מכונות חלשות
const CONTINUATION_WORDS = 6;     // אורך מקסימלי של המשך מוצע
const MIN_PREFIX_COUNT = 2;       // prefix שהופיע פעם אחת אינו הרגל
const MIN_CANDIDATE_COUNT = 2;    // וגם ההמשך עצמו חייב לחזור
const MIN_CANDIDATE_SHARE = 0.35; // ההמשך חייב להיות הדומיננטי אחרי ה-prefix
const MIN_WORDS_FOR_INDEX = 1500; // מתחת לזה הקורפוס דליל מדי — ההצעות מביכות
const YIELD_EVERY_CHUNKS = 40;    // מוותר ל-event loop כדי לא להקפיא את ה-UI

// מילים: עברית + אנגלית + ספרות + גרשיים (זהה ל-styleSampleStore).
const WORD_RE = /[֐-׿A-Za-z0-9'"׳״\-]+/g;

// ---------- עזרים ----------

const normWord = (w) => String(w || '')
  .toLowerCase()
  .replace(/^["'׳״\-]+|["'׳״\-]+$/g, '');

function djb2Hex(str = '') {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// טביעת אצבע של הקורפוס — מזהי הצ'אנקים + מספרם. משתנה בכל הוספה/הסרה.
function corpusFingerprint(chunks) {
  const ids = chunks.map((c) => String(c?.id || '')).sort();
  return `${ids.length}_${djb2Hex(ids.join('|'))}`;
}

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

// ---------- מצב מודול ----------

let index = null;        // {fingerprint, words, tri:{}, bi:{}}
let buildPromise = null;
let buildState = 'idle'; // 'idle' | 'building' | 'ready' | 'empty' | 'error'
let lastError = null;

function emitReady() {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(STYLE_AUTOCOMPLETE_READY_EVENT, {
      detail: { state: buildState, words: index?.words || 0 },
    }));
  } catch {}
}

// ---------- בניית האינדקס ----------

// מפרק צ'אנק לרשימת מילים מקוריות (לפלט) + מנורמלות (למפתח).
function tokenize(text) {
  const raw = String(text || '').match(WORD_RE) || [];
  const surface = [];
  const norm = [];
  for (const w of raw) {
    const n = normWord(w);
    if (!n) continue;
    surface.push(w);
    norm.push(n);
  }
  return { surface, norm };
}

/**
 * מעבר אחד על כל הצ'אנקים; קורא ל-visit לכל טוקן עם ההקשר שלו.
 * מפוצל ל-await כל YIELD_EVERY_CHUNKS כדי לא לחסום את ה-UI.
 */
async function scanCorpus(chunks, visit) {
  let scanned = 0;
  for (let ci = 0; ci < chunks.length; ci += 1) {
    if (scanned >= MAX_WORDS_SCANNED) break;
    const { surface, norm } = tokenize(chunks[ci]?.text);
    if (norm.length >= 4) visit(surface, norm);
    scanned += norm.length;
    if (ci % YIELD_EVERY_CHUNKS === YIELD_EVERY_CHUNKS - 1) await nextTick();
  }
  return scanned;
}

/**
 * בונה את האינדקס משני מעברים:
 * 1. ספירת prefixes (2/3 מילים) — כדי לדעת מי חוזר.
 * 2. איסוף המשכים רק ל-prefixes שעברו את הסף.
 * @returns {Promise<object>} האינדקס
 */
async function buildIndex(chunks) {
  const triCount = new Map();
  const biCount = new Map();

  const words = await scanCorpus(chunks, (surface, norm) => {
    for (let i = 0; i < norm.length - 1; i += 1) {
      if (i + 1 < norm.length) {
        const bi = `${norm[i]} ${norm[i + 1]}`;
        biCount.set(bi, (biCount.get(bi) || 0) + 1);
      }
      if (i + 2 < norm.length) {
        const tri = `${norm[i]} ${norm[i + 1]} ${norm[i + 2]}`;
        triCount.set(tri, (triCount.get(tri) || 0) + 1);
      }
    }
  });

  if (words < MIN_WORDS_FOR_INDEX) {
    return { fingerprint: '', words, tri: {}, bi: {}, sparse: true };
  }

  // מעבר 2 — המשכים. Map<prefix, Map<continuation, count>>
  const triCont = new Map();
  const biCont = new Map();

  // סופר המשך *לכל אורך* 1..CONTINUATION_WORDS בנפרד. קריטי: המשך בן 6 מילים
  // כמעט אף פעם לא חוזר מילה-במילה, אבל "לפיכך ניתן" כן — בלי זה האינדקס
  // נראה מלא אבל כמעט אף שאילתה לא עוברת את סף החזרתיות.
  const collect = (bucket, counts, prefix, surface, start) => {
    if ((counts.get(prefix) || 0) < MIN_PREFIX_COUNT) return;
    const tail = surface.slice(start, start + CONTINUATION_WORDS);
    if (!tail.length) return;
    let inner = bucket.get(prefix);
    if (!inner) { inner = new Map(); bucket.set(prefix, inner); }
    for (let len = 1; len <= tail.length; len += 1) {
      const key = `${len}|${tail.slice(0, len).join(' ')}`;
      inner.set(key, (inner.get(key) || 0) + 1);
    }
  };

  await scanCorpus(chunks, (surface, norm) => {
    for (let i = 0; i < norm.length - 1; i += 1) {
      if (i + 1 < norm.length) {
        collect(biCont, biCount, `${norm[i]} ${norm[i + 1]}`, surface, i + 2);
      }
      if (i + 2 < norm.length) {
        collect(triCont, triCount, `${norm[i]} ${norm[i + 1]} ${norm[i + 2]}`, surface, i + 3);
      }
    }
  });

  // דחיסה לאובייקט serializable: לכל prefix נשמר ההמשך ה*ארוך ביותר* שעדיין
  // עומד בסף החזרתיות והדומיננטיות. מארוך לקצר — ההצעה הראשונה שעוברת מנצחת.
  const compress = (bucket, counts) => {
    const out = {};
    bucket.forEach((inner, prefix) => {
      const total = counts.get(prefix) || 0;
      const bestByLen = new Map(); // len → [text, count]
      inner.forEach((n, key) => {
        if (n < MIN_CANDIDATE_COUNT) return;
        const sep = key.indexOf('|');
        const len = Number(key.slice(0, sep));
        const text = key.slice(sep + 1);
        const cur = bestByLen.get(len);
        if (!cur || n > cur[1]) bestByLen.set(len, [text, n]);
      });
      for (let len = CONTINUATION_WORDS; len >= 1; len -= 1) {
        const cand = bestByLen.get(len);
        if (!cand) continue;
        if (cand[1] / Math.max(1, total) < MIN_CANDIDATE_SHARE) continue;
        out[prefix] = { t: total, c: [cand] };
        return;
      }
    });
    return out;
  };

  return {
    schemaVersion: STYLE_AUTOCOMPLETE_SCHEMA_VERSION,
    fingerprint: corpusFingerprint(chunks),
    words,
    tri: compress(triCont, triCount),
    bi: compress(biCont, biCount),
    sparse: false,
  };
}

// ---------- ensure (lazy + cache) ----------

/**
 * מוודא שהאינדקס בנוי. משתמש ב-cache ב-IndexedDB אם ה-fingerprint תואם.
 * בטוח לקריאה חוזרת — הבנייה רצה פעם אחת.
 * @returns {Promise<object|null>}
 */
export function ensureAutocompleteIndex() {
  if (index) return Promise.resolve(index);
  if (buildPromise) return buildPromise;

  buildState = 'building';
  buildPromise = (async () => {
    try {
      await ensureSampleStoreReady();
      const chunks = getChunks();
      const fingerprint = corpusFingerprint(chunks);

      if (isIdbAvailable()) {
        try {
          const cached = await idbGet(STYLE_AUTOCOMPLETE_CACHE_KEY);
          if (cached
            && cached.schemaVersion === STYLE_AUTOCOMPLETE_SCHEMA_VERSION
            && cached.fingerprint === fingerprint
            && !cached.sparse) {
            index = cached;
            buildState = 'ready';
            emitReady();
            return index;
          }
        } catch {} // cache פגום — פשוט בונים מחדש
      }

      const built = await buildIndex(chunks);
      if (built.sparse) {
        index = null;
        buildState = 'empty';
        emitReady();
        return null;
      }
      index = built;
      buildState = 'ready';
      if (isIdbAvailable()) {
        try { await idbSet(STYLE_AUTOCOMPLETE_CACHE_KEY, built); } catch {}
      }
      emitReady();
      return index;
    } catch (err) {
      lastError = String(err?.message || err);
      buildState = 'error';
      emitReady();
      return null;
    } finally {
      buildPromise = null;
    }
  })();

  return buildPromise;
}

/** מבטל את האינדקס (הקורפוס השתנה) — הבנייה הבאה תרוץ מחדש. */
export function invalidateAutocompleteIndex() {
  index = null;
  buildPromise = null;
  buildState = 'idle';
}

// הקורפוס השתנה (העלאה/מחיקה) → האינדקס מיושן.
if (typeof window !== 'undefined') {
  try {
    window.addEventListener(STYLE_SAMPLES_UPDATED_EVENT, invalidateAutocompleteIndex);
  } catch {}
}

// ---------- שאילתה (סינכרוני — נקרא מתוך keystroke) ----------

/**
 * מציע המשך לטקסט שלפני הסמן. סינכרוני לחלוטין: אם האינדקס עוד לא מוכן
 * מחזיר null (ולא מעכב את ההקלדה).
 * @param {string} textBefore הטקסט מתחילת הפסקה עד הסמן
 * @returns {{text:string, count:number, order:number}|null}
 */
export function suggestCompletion(textBefore) {
  if (!index) return null;
  const src = String(textBefore || '');
  // חייבים לעמוד *אחרי* רווח או סוף מילה — באמצע מילה לא משלימים.
  if (!/[\s]$/.test(src)) return null;

  const raw = src.match(WORD_RE) || [];
  if (raw.length < 2) return null;
  const norm = raw.map(normWord).filter(Boolean);
  if (norm.length < 2) return null;

  const pick = (bucket, prefix, order) => {
    const entry = bucket[prefix];
    if (!entry || !entry.c?.length) return null;
    const [text, count] = entry.c[0];
    if (count < MIN_CANDIDATE_COUNT) return null;
    if (count / Math.max(1, entry.t) < MIN_CANDIDATE_SHARE) return null;
    return { text, count, order };
  };

  if (norm.length >= 3) {
    const tri = pick(index.tri, norm.slice(-3).join(' '), 3);
    if (tri) return tri;
  }
  return pick(index.bi, norm.slice(-2).join(' '), 2);
}

/** מצב המנוע ל-UI. */
export function getAutocompleteStatus() {
  return {
    state: buildState,
    ready: buildState === 'ready',
    words: index?.words || 0,
    prefixes: index ? Object.keys(index.tri).length + Object.keys(index.bi).length : 0,
    minWordsRequired: MIN_WORDS_FOR_INDEX,
    lastError,
  };
}
