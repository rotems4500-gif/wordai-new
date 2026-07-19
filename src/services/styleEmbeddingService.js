// styleEmbeddingService.js — מנוע הסגנון האישי: שכבת embeddings סמנטית מקומית (טרום-API).
//
// עוטף את המודל multilingual-e5-small (transformers.js, ONNX, q8) שרץ *מקומית ב-WASM*
// בלי מפתח API ובלי שרת. משמש את בניית הפרופיל (recomputeMetricsFromStore) כדי לחשב
// וקטור סמנטי לכל chunk — מתוכו נבחרים קטעים מייצגים (representativeChunkIds).
//
// למה e5 ולא MiniLM: PoC על 38 עבודות עברית הראה MiniLM קורס (MRR 22%) בעוד
// e5-small מנצח TF-IDF (MRR 71% מול 64%, Recall@3 87%). e5 תוכנן ל-retrieval עם
// prefixים 'query:'/'passage:' — קריטי לעברית. ראה docs/style-engine-plan.md.
//
// עקרונות:
//  - DEGRADE חינני: כל כשל (טעינת מודל, רשת, סביבה בלי WebAssembly) → מחזיר null
//    ומסמן reason. שום דבר במנוע לא נשבר; הפרופיל ממשיך עם TF-IDF/מדדים כרגיל.
//  - lazy dynamic import: הספרייה (+onnxruntime WASM) נטענת רק כשבאמת מבקשים embed,
//    כך שה-bundle הראשי לא מתנפח. code-split אוטומטי ב-Vite.
//  - LEAF טהור: אפס import מקבצי המנוע האחרים (אין סיכון מעגל). browser+node.
//
// int8 quantization: וקטור e5 מנורמל (יחידה) → רכיבים ב-[-1,1]. שומרים int8 (×127)
// כדי לחסוך 4× מקום ב-localStorage. cosine על ה-dequantized כמעט זהה (שגיאה <0.5%).

export const STYLE_EMBEDDING_MODEL_ID = 'Xenova/multilingual-e5-small';
export const STYLE_EMBEDDING_DIM = 384;
export const STYLE_EMBEDDING_DTYPE = 'q8';
// גרסת חתימה: משתנה אם מחליפים מודל/ממד → מאלץ חישוב-מחדש של וקטורים ישנים.
export const STYLE_EMBEDDING_SIGNATURE = `${STYLE_EMBEDDING_MODEL_ID}@${STYLE_EMBEDDING_DTYPE}#${STYLE_EMBEDDING_DIM}`;

const EMBED_MAX_CHARS = 1400; // e5 max-seq ~512 טוקנים; חיתוך שמרני למניעת truncation שקט.
const EMBED_BATCH = 16;
const QUANT_SCALE = 127;

// ---------- מצב מודול (cache + degrade) ----------

let extractorPromise = null;   // Promise<pipeline> | null — טעינה יחידה, מ-cache.
let unavailableReason = null;  // string | null — אם מסומן, מפסיקים לנסות לטעון.

/** האם שכבת ה-embeddings זמינה (לא נכשלה בעבר). לא טוענת מודל. */
export function isEmbeddingUnavailable() {
  return unavailableReason;
}

/** איפוס מצב הכשל — מאפשר ניסיון טעינה מחדש (למשל אחרי שהרשת חזרה). */
export function resetEmbeddingState() {
  extractorPromise = null;
  unavailableReason = null;
}

// טוען (פעם אחת) את ה-feature-extraction pipeline. מחזיר null בכל כשל + מסמן reason.
async function getExtractor() {
  if (unavailableReason) return null;
  if (extractorPromise) return extractorPromise;

  extractorPromise = (async () => {
    try {
      // dynamic import — נטען רק כאן, code-split מה-bundle הראשי.
      const mod = await import('@huggingface/transformers');
      const pipeline = mod.pipeline;
      if (typeof pipeline !== 'function') throw new Error('pipeline export missing');
      // הגדרות סביבה: מותר להוריד מה-hub (מודל נשמר cache בדפדפן/דיסק אחרי פעם ראשונה).
      if (mod.env) {
        try { mod.env.allowRemoteModels = true; } catch {}
      }
      const extractor = await pipeline('feature-extraction', STYLE_EMBEDDING_MODEL_ID, {
        dtype: STYLE_EMBEDDING_DTYPE,
      });
      return extractor;
    } catch (err) {
      unavailableReason = String(err?.message || err || 'embedding load failed');
      extractorPromise = null; // מאפשר reset ידני בעתיד
      return null;
    }
  })();

  return extractorPromise;
}

// ---------- quantize / dequantize ----------

/** Float32 מנורמל → Int8Array (×127, clamp). */
export function quantizeVector(vec) {
  const src = vec instanceof Float32Array ? vec : Float32Array.from(vec || []);
  const out = new Int8Array(src.length);
  for (let i = 0; i < src.length; i += 1) {
    let q = Math.round(src[i] * QUANT_SCALE);
    if (q > 127) q = 127; else if (q < -127) q = -127;
    out[i] = q;
  }
  return out;
}

/** Int8Array → Float32Array (÷127). */
export function dequantizeVector(q) {
  const src = q instanceof Int8Array ? q : Int8Array.from(q || []);
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 1) out[i] = src[i] / QUANT_SCALE;
  return out;
}

// ---------- base64 (browser + node) ----------

/** Int8Array → base64 string. */
export function int8ToBase64(int8) {
  const bytes = new Uint8Array(int8 instanceof Int8Array ? int8.buffer : Int8Array.from(int8 || []).buffer);
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  // eslint-disable-next-line no-undef
  return btoa(binary);
}

/** base64 string → Int8Array. '' / פגום → Int8Array ריק. */
export function base64ToInt8(b64) {
  const str = String(b64 || '');
  if (!str) return new Int8Array(0);
  try {
    if (typeof Buffer !== 'undefined') {
      const buf = Buffer.from(str, 'base64');
      return new Int8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    }
    // eslint-disable-next-line no-undef
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Int8Array(bytes.buffer);
  } catch {
    return new Int8Array(0);
  }
}

// ---------- cosine ----------

/** cosine בין שני וקטורים (Float32/Array). מניח לא-בהכרח מנורמל → מחלק בנורמות. */
export function cosineSim(a, b) {
  const la = a?.length || 0;
  if (!la || la !== (b?.length || 0)) return 0;
  let dot = 0; let na = 0; let nb = 0;
  for (let i = 0; i < la; i += 1) {
    const x = a[i]; const y = b[i];
    dot += x * y; na += x * x; nb += y * y;
  }
  if (na <= 0 || nb <= 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ---------- embedTexts ----------

/**
 * מחשב embeddings ל-batch טקסטים. מקומי, WASM, בלי API.
 * @param {string[]} texts
 * @param {{kind?:('passage'|'query'), onProgress?:function}} opts
 * @returns {Promise<(Float32Array[]|null)>} מערך וקטורים (מנורמלים) או null אם לא זמין.
 */
export async function embedTexts(texts, { kind = 'passage', onProgress = null } = {}) {
  const list = Array.isArray(texts) ? texts.map((t) => String(t || '')) : [];
  if (!list.length) return [];

  const extractor = await getExtractor();
  if (!extractor) return null; // degrade — לא זמין

  const prefix = kind === 'query' ? 'query: ' : 'passage: ';
  const out = [];
  try {
    for (let i = 0; i < list.length; i += EMBED_BATCH) {
      const batch = list.slice(i, i + EMBED_BATCH).map((t) => prefix + t.slice(0, EMBED_MAX_CHARS));
      // pooling:'mean' + normalize:true → וקטור יחידה לכל טקסט.
      // eslint-disable-next-line no-await-in-loop
      const res = await extractor(batch, { pooling: 'mean', normalize: true });
      const dims = res.dims;
      const data = res.data;
      const d = dims[dims.length - 1];
      for (let r = 0; r < batch.length; r += 1) {
        out.push(Float32Array.from(data.slice(r * d, (r + 1) * d)));
      }
      if (typeof onProgress === 'function') {
        try { onProgress({ done: Math.min(i + EMBED_BATCH, list.length), total: list.length }); } catch {}
      }
    }
  } catch (err) {
    unavailableReason = String(err?.message || err || 'embedding inference failed');
    return null;
  }
  return out;
}

/**
 * embedding יחיד (נוחות). null אם לא זמין.
 * @param {string} text
 * @param {{kind?:('passage'|'query')}} opts
 * @returns {Promise<(Float32Array|null)>}
 */
export async function embedText(text, { kind = 'query' } = {}) {
  const res = await embedTexts([text], { kind });
  if (!res) return null;
  return res[0] || null;
}
