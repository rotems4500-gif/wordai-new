// ollamaEmbeddingService.js — שכבת embeddings מקומית מעל Ollama (GPU), חלופה ל-WASM.
//
// למה בכלל: e5-small שרץ ב-WASM ([styleEmbeddingService](./styleEmbeddingService.js))
// הוא 384 ממדים ו-max-seq 512 — ובעברית הוא חלש. הוא הסיבה שהאחזור נשען על ערימת
// טלאים לקסיקליים ב-evidenceMatchService (LEX_BOOST, שכבת "ראיה חלשה", hubness
// correction): כולם מפצים על מאחזר שלא מפריד טוב. bge-m3 (568M, 1024 ממדים,
// 8k הקשר) הוא מאחזר רב-לשוני שאומן ל-retrieval ומטפל בעברית משמעותית טוב יותר.
//
// למה Ollama ולא transformers.js: bge-m3 שוקל ~1.2GB. ב-WASM על thread יחיד זה
// לא ריאלי; על GPU (GTX 1650, 3.2GiB פנויים) הוא נכנס כולו ורץ מהר. Ollama כבר
// מותקן ומשרת על 11434, ו-OLLAMA_ORIGINS שלו כולל tauri://* — כלומר הדסקטופ
// יכול לדבר איתו בלי שום שינוי תצורה.
//
// עקרונות (זהים ל-styleEmbeddingService, בכוונה):
//  - DEGRADE חינני: אין שרת / אין מודל / timeout → מחזיר null + reason. הקורא
//    נופל חזרה ל-WASM. שום מסלול לא נשבר כי אולמה כבויה.
//  - LEAF טהור: אפס import מקבצי המנוע. עובד ב-Node (harness) וב-browser (Tauri).
//  - הווקטור מוחזר *מנורמל ליחידה*. quantizeVector במעלה הזרם מניח [-1,1] וכופל
//    ב-127; וקטור לא מנורמל היה נחתך ל-clamp ומאבד מידע בשקט.
//
// ⚠️ באתר/PWA (https) הקריאה ל-http://127.0.0.1 היא mixed-content והדפדפן עשוי
// לחסום אותה. זה בסדר — הקורא נופל ל-WASM. המסלול הזה נועד לדסקטופ ול-harness.

export const OLLAMA_EMBED_MODEL = 'bge-m3';
export const OLLAMA_EMBED_DIM = 1024;
export const OLLAMA_EMBED_SIGNATURE = `ollama/${OLLAMA_EMBED_MODEL}#${OLLAMA_EMBED_DIM}`;

// bge-m3 הוא prefix-free — בניגוד ל-e5 שדורש 'query: '/'passage: '. הוספת prefix
// כאן דווקא *מזיקה*: היא מוסיפה טוקנים חסרי מובן שמושכים את הווקטור. לכן kind
// מתקבל לשם תאימות-חתימה עם embedTexts ומתעלמים ממנו בכוונה.
const EMBED_MAX_CHARS = 6000;  // 8k טוקנים — חיתוך שמרני, ~1.5 תווים לטוקן בעברית
const EMBED_BATCH = 8;         // 3.2GiB VRAM: אצווה גדולה מדי מפילה ל-CPU offload
const REQUEST_TIMEOUT_MS = 120000;
const PROBE_TIMEOUT_MS = 4000;

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';

let unavailableReason = null;
let probePromise = null;
let baseUrlOverride = null;

/** כתובת השרת. סדר: override ידני → env (harness) → ברירת מחדל. */
export function getOllamaBaseUrl() {
  if (baseUrlOverride) return baseUrlOverride;
  try {
    if (typeof process !== 'undefined' && process.env?.WORDAI_OLLAMA_URL) {
      return String(process.env.WORDAI_OLLAMA_URL).replace(/\/+$/, '');
    }
  } catch {}
  return DEFAULT_BASE_URL;
}

/** קביעת כתובת שרת מפורשת (הגדרות UI). מאפסת מצב-כשל קודם. */
export function setOllamaBaseUrl(url) {
  const clean = String(url || '').trim().replace(/\/+$/, '');
  baseUrlOverride = clean || null;
  resetOllamaEmbeddingState();
}

/** סיבת אי-הזמינות האחרונה, או null. לא מבצעת בדיקה. */
export function isOllamaEmbeddingUnavailable() {
  return unavailableReason;
}

/** איפוס מצב — מאפשר ניסיון מחדש אחרי שהמשתמש הפעיל את אולמה. */
export function resetOllamaEmbeddingState() {
  unavailableReason = null;
  probePromise = null;
}

function withTimeout(ms) {
  // AbortSignal.timeout לא קיים ב-WebView2 ישן; בונים ידנית.
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(id) };
}

/**
 * בודק פעם אחת שהשרת חי ושהמודל נמשך. התוצאה נשמרת — הבדיקה עצמה עולה סיבוב
 * רשת, ואנחנו קוראים לה לפני כל אצווה.
 *
 * ⚠️ קיום השרת אינו מספיק: שרת בלי `ollama pull bge-m3` יחזיר 404 על כל embed,
 * וזה כשל שקט שהיה נראה כמו "כל הווקטורים null". לכן בודקים את רשימת המודלים.
 *
 * @returns {Promise<{ok:boolean, reason:(string|null), models:string[]}>}
 */
export async function probeOllamaEmbedding() {
  if (unavailableReason) return { ok: false, reason: unavailableReason, models: [] };
  if (probePromise) return probePromise;

  probePromise = (async () => {
    const t = withTimeout(PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(`${getOllamaBaseUrl()}/api/tags`, { signal: t.signal });
      if (!res.ok) throw new Error(`tags HTTP ${res.status}`);
      const data = await res.json();
      const models = (Array.isArray(data?.models) ? data.models : [])
        .map((m) => String(m?.name || ''))
        .filter(Boolean);
      // ההשוואה סובלנית לתגית: 'bge-m3', 'bge-m3:latest', 'bge-m3:567m' — כולם הוא.
      const has = models.some((n) => n === OLLAMA_EMBED_MODEL || n.startsWith(`${OLLAMA_EMBED_MODEL}:`));
      if (!has) {
        unavailableReason = `המודל ${OLLAMA_EMBED_MODEL} לא מותקן ב-Ollama (ollama pull ${OLLAMA_EMBED_MODEL})`;
        return { ok: false, reason: unavailableReason, models };
      }
      return { ok: true, reason: null, models };
    } catch (err) {
      unavailableReason = String(err?.message || err || 'ollama unreachable');
      return { ok: false, reason: unavailableReason, models: [] };
    } finally {
      t.done();
    }
  })();

  return probePromise;
}

/** מנרמל ליחידה במקום. וקטור אפס מוחזר כמו שהוא (אין כיוון להחזיר). */
function normalizeInPlace(vec) {
  let norm = 0;
  for (let i = 0; i < vec.length; i += 1) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < vec.length; i += 1) vec[i] /= norm;
  return vec;
}

async function embedBatch(batch) {
  const t = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${getOllamaBaseUrl()}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, input: batch }),
      signal: t.signal,
    });
    if (!res.ok) throw new Error(`embed HTTP ${res.status}`);
    const data = await res.json();
    const rows = Array.isArray(data?.embeddings) ? data.embeddings : null;
    if (!rows || rows.length !== batch.length) {
      throw new Error(`embed החזיר ${rows ? rows.length : 'null'} וקטורים עבור ${batch.length} טקסטים`);
    }
    return rows.map((row) => normalizeInPlace(Float32Array.from(row)));
  } finally {
    t.done();
  }
}

/**
 * embeddings לאצווה. חתימה זהה ל-embedTexts של styleEmbeddingService כדי
 * שהחלפת מנוע לא תדרוש שינוי בקוראים.
 *
 * @param {string[]} texts
 * @param {{kind?:('passage'|'query'), onProgress?:function}} opts
 *        kind מתקבל לתאימות ומתעלמים ממנו — bge-m3 prefix-free (ר' למעלה).
 * @returns {Promise<(Float32Array[]|null)>} וקטורים מנורמלים, או null בכשל.
 */
export async function embedTextsOllama(texts, { onProgress = null } = {}) {
  const list = Array.isArray(texts) ? texts.map((t) => String(t || '')) : [];
  if (!list.length) return [];

  const probe = await probeOllamaEmbedding();
  if (!probe.ok) return null;

  const out = [];
  try {
    for (let i = 0; i < list.length; i += EMBED_BATCH) {
      const batch = list.slice(i, i + EMBED_BATCH).map((t) => t.slice(0, EMBED_MAX_CHARS));
      // eslint-disable-next-line no-await-in-loop
      const vectors = await embedBatch(batch);
      for (const v of vectors) out.push(v);
      if (typeof onProgress === 'function') {
        try { onProgress({ done: Math.min(i + EMBED_BATCH, list.length), total: list.length }); } catch {}
      }
    }
  } catch (err) {
    // כשל באמצע אצווה — מסמנים ומחזירים null. חצי-אינדקס גרוע מאין-אינדקס:
    // הוא היה מייצר התפלגות z על תת-קבוצה שרירותית של הקורפוס.
    unavailableReason = String(err?.message || err || 'ollama embed failed');
    return null;
  }
  return out;
}

/** embedding יחיד. null אם לא זמין. */
export async function embedTextOllama(text) {
  const res = await embedTextsOllama([text]);
  if (!res) return null;
  return res[0] || null;
}
