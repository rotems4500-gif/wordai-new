// styleEmbeddingStore.js — אחסון וקטורי ה-embedding של chunks (מנוע הסגנון, טרום-API).
//
// מפתח נפרד 'wordai_style_embeddings_v1' — *לא* מעורבב עם blob הטקסט
// (wordai_style_samples_v1). הפרדה מכוונת: וקטורים int8-base64 (~0.5KB ל-chunk) לא
// מנפחים את blob הטקסט ולא נכנסים לחישוב ה-cap שלו. גם לא מסונכרן לענן (מקומי טהור).
//
// אחסון: IndexedDB עם cache בזיכרון (כמו styleSampleStore) — עם ה-caps החדשים
// (אלפי chunks) מאגר הוקטורים חורג בקלות מתקרת localStorage.
//
// מבנה: { schemaVersion, signature, updatedAt, vectors: { [chunkId]: base64Int8 } }.
// signature = חתימת המודל (STYLE_EMBEDDING_SIGNATURE). אם השתנתה (החלפת מודל) → כל
// הוקטורים הישנים נחשבים לא-תקפים (getVector מחזיר null), כדי לאלץ חישוב-מחדש.
//
// LEAF: מייבא אך ורק מ-styleEmbeddingService (helpers של המרה). browser+node.

import {
  STYLE_EMBEDDING_SIGNATURE,
  STYLE_EMBEDDING_DIM,
  int8ToBase64,
  base64ToInt8,
  dequantizeVector,
  quantizeVector,
} from './styleEmbeddingService';
import { idbGet, idbSet, isIdbAvailable } from './styleKvStore';

export const STYLE_EMBEDDINGS_STORAGE_KEY = 'wordai_style_embeddings_v1';
export const STYLE_EMBEDDINGS_SCHEMA_VERSION = 1;

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const nowTs = () => Date.now();

function defaultBlob() {
  return {
    schemaVersion: STYLE_EMBEDDINGS_SCHEMA_VERSION,
    signature: STYLE_EMBEDDING_SIGNATURE,
    updatedAt: 0,
    vectors: {},
  };
}

/**
 * קורא את ה-blob. סובלני: חסר/פגום → default. אם ה-signature לא תואם למודל הנוכחי
 * → מחזיר blob ריק (וקטורים ישנים לא-תקפים) אבל שומר את ה-signature הישן ב-staleSignature
 * לצורך אבחון.
 * @returns {object}
 */
function normalizeBlob(parsed) {
  if (!isPlainObject(parsed)) return defaultBlob();
  const sameSig = String(parsed.signature || '') === STYLE_EMBEDDING_SIGNATURE;
  return {
    schemaVersion: STYLE_EMBEDDINGS_SCHEMA_VERSION,
    signature: STYLE_EMBEDDING_SIGNATURE,
    staleSignature: sameSig ? null : String(parsed.signature || ''),
    updatedAt: Number.isFinite(Number(parsed.updatedAt)) ? Number(parsed.updatedAt) : 0,
    // אם ה-signature השתנה — מתעלמים מהוקטורים הישנים (ממד/מודל שונה).
    vectors: sameSig && isPlainObject(parsed.vectors) ? parsed.vectors : {},
  };
}

let cache = null;
let cacheDirty = false;
let hydratePromise = null;
let lastWriteError = null;

function readLegacyLocalStorage() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STYLE_EMBEDDINGS_STORAGE_KEY);
    if (!raw) return null;
    return normalizeBlob(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** טוען מ-IndexedDB (עם מיגרציה חד-פעמית מ-localStorage). @returns {Promise<object>} */
export function ensureEmbeddingStoreReady() {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    let loaded = null;
    if (isIdbAvailable()) {
      try {
        const stored = await idbGet(STYLE_EMBEDDINGS_STORAGE_KEY);
        if (isPlainObject(stored)) loaded = normalizeBlob(stored);
      } catch (err) {
        lastWriteError = String(err?.message || err);
      }
    }
    if (!loaded) loaded = readLegacyLocalStorage() || defaultBlob();
    if (!cacheDirty) cache = loaded;
    return cache;
  })();
  return hydratePromise;
}

export function readEmbeddingStore() {
  if (typeof window === 'undefined') return defaultBlob();
  if (!cache) cache = readLegacyLocalStorage() || defaultBlob();
  return cache;
}

function writeBlob(blob) {
  if (typeof window === 'undefined') return;
  const next = {
    schemaVersion: STYLE_EMBEDDINGS_SCHEMA_VERSION,
    signature: STYLE_EMBEDDING_SIGNATURE,
    staleSignature: null,
    updatedAt: nowTs(),
    vectors: isPlainObject(blob?.vectors) ? blob.vectors : {},
  };
  cache = next;
  cacheDirty = true;
  (async () => {
    if (isIdbAvailable()) {
      try {
        await idbSet(STYLE_EMBEDDINGS_STORAGE_KEY, next);
        lastWriteError = null;
        return;
      } catch (err) {
        lastWriteError = String(err?.message || err);
      }
    }
    try {
      localStorage.setItem(STYLE_EMBEDDINGS_STORAGE_KEY, JSON.stringify(next));
      lastWriteError = null;
    } catch (err) {
      lastWriteError = String(err?.message || err);
    }
  })();
}

if (typeof window !== 'undefined') {
  try { ensureEmbeddingStoreReady(); } catch {}
}

/**
 * מחזיר Set של chunkIds שכבר יש להם וקטור תקף (signature תואם).
 * @returns {Set<string>}
 */
export function getEmbeddedChunkIds() {
  const blob = readEmbeddingStore();
  return new Set(Object.keys(blob.vectors));
}

/**
 * וקטור Float32 (dequantized) של chunk, או null אם חסר/פגום/ממד לא תואם.
 * @param {string} chunkId
 * @returns {(Float32Array|null)}
 */
export function getVector(chunkId) {
  const id = String(chunkId || '');
  if (!id) return null;
  const blob = readEmbeddingStore();
  const b64 = blob.vectors[id];
  if (!b64) return null;
  const int8 = base64ToInt8(b64);
  if (int8.length !== STYLE_EMBEDDING_DIM) return null;
  return dequantizeVector(int8);
}

/**
 * מחזיר map { chunkId: Float32Array } לכל ה-ids המבוקשים שיש להם וקטור תקף.
 * @param {string[]} chunkIds
 * @returns {Map<string, Float32Array>}
 */
export function getVectors(chunkIds) {
  const ids = Array.isArray(chunkIds) ? chunkIds : [];
  const blob = readEmbeddingStore();
  const out = new Map();
  for (const raw of ids) {
    const id = String(raw || '');
    const b64 = blob.vectors[id];
    if (!b64) continue;
    const int8 = base64ToInt8(b64);
    if (int8.length !== STYLE_EMBEDDING_DIM) continue;
    out.set(id, dequantizeVector(int8));
  }
  return out;
}

/**
 * שומר וקטורים חדשים (Float32/quantized). ממזג עם הקיימים. quantize ל-int8 לפני שמירה.
 * @param {Array<{chunkId:string, vector:(Float32Array|number[])}>} entries
 * @returns {{saved:number}}
 */
export function putVectors(entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) return { saved: 0 };
  const blob = readEmbeddingStore();
  const vectors = { ...blob.vectors };
  let saved = 0;
  for (const e of list) {
    const id = String(e?.chunkId || '');
    const vec = e?.vector;
    if (!id || !vec || vec.length !== STYLE_EMBEDDING_DIM) continue;
    vectors[id] = int8ToBase64(quantizeVector(vec));
    saved += 1;
  }
  writeBlob({ vectors });
  return { saved };
}

/**
 * מסיר וקטורים של chunkIds שאינם קיימים יותר ב-sample store (prune).
 * @param {Set<string>|string[]} liveChunkIds — ה-ids החיים כרגע
 * @returns {{removed:number}}
 */
export function pruneVectors(liveChunkIds) {
  const live = liveChunkIds instanceof Set ? liveChunkIds : new Set(Array.isArray(liveChunkIds) ? liveChunkIds : []);
  const blob = readEmbeddingStore();
  const vectors = {};
  let removed = 0;
  for (const [id, v] of Object.entries(blob.vectors)) {
    if (live.has(id)) vectors[id] = v;
    else removed += 1;
  }
  if (removed) writeBlob({ vectors });
  return { removed };
}

/** מאפס את מאגר הוקטורים לחלוטין. */
export function clearEmbeddingStore() {
  writeBlob(defaultBlob());
}

/**
 * @returns {{count:number, signature:string, staleSignature:(string|null), updatedAt:number}}
 */
export function getEmbeddingStoreStats() {
  const blob = readEmbeddingStore();
  return {
    count: Object.keys(blob.vectors).length,
    signature: blob.signature,
    staleSignature: blob.staleSignature || null,
    updatedAt: blob.updatedAt,
    lastWriteError,
  };
}
