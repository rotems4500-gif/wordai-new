// retrievalEmbeddingService.js — בוחר את מנוע ה-embeddings של *האחזור* (חומרי עזר).
//
// למה שכבה נפרדת ולא החלפה בתוך styleEmbeddingService: יש שני קורפוסים עם שתי
// מטרות שונות, והם לא חייבים לרוץ על אותו מודל.
//   · קורפוס *סגנון* (styleEmbeddingStore) — בוחר קטעים מייצגים מהכתיבה של
//     המשתמש. יושב על e5@384 ו-styleEmbeddingStore מאמת אורך וקטור מול
//     STYLE_EMBEDDING_DIM. החלפת מודל שם הייתה שוברת אימות ומחייבת מיגרציה,
//     בלי שום רווח — זה לא הצוואר.
//   · קורפוס *תוכן* (materialChunkStore) — ממנו נגזרות הראיות, וכאן איכות
//     האחזור היא כל המשחק. רק הוא עובר לכאן.
//
// המנוע נבחר *פעם אחת לסשן* והחתימה מוקפאת. זה מכוון: החתימה היא מה שמפריד בין
// וקטורים של מודלים שונים ב-materialChunkStore, וקורפוס שחציו הוטמע במודל אחד
// וחציו באחר נותן קוסינוסים חסרי מובן והתפלגות z שקרית. לכן אם המנוע הנבחר נופל
// באמצע — מחזירים null (הקורא מדווח "הטמעה לא זמינה") ו*לא* נופלים חזרה בשקט.
//
// ברירת המחדל היא e5-WASM. bge-m3 הוא opt-in עד שיימדד בבנצ' — החלפת חתימה
// מאלצת הטמעה-מחדש של כל הקורפוס של המשתמש, וזה לא משהו שמפעילים על סמך הבטחה.
//
// תלויות: styleEmbeddingService + ollamaEmbeddingService בלבד. LEAF כלפי המנוע.

import {
  STYLE_EMBEDDING_SIGNATURE,
  embedTexts as embedTextsWasm,
  isEmbeddingUnavailable as isWasmUnavailable,
} from './styleEmbeddingService';
import {
  OLLAMA_EMBED_SIGNATURE,
  OLLAMA_EMBED_MODEL,
  embedTextsOllama,
  probeOllamaEmbedding,
  isOllamaEmbeddingUnavailable,
} from './ollamaEmbeddingService';

export const RETRIEVAL_BACKEND = {
  WASM_E5: 'wasm-e5',
  OLLAMA_BGE_M3: 'ollama-bge-m3',
};

const PREF_STORAGE_KEY = 'wordai_embed_backend';

let active = null;        // {backend, signature, reason} — מוקפא אחרי ensure
let ensurePromise = null;

/**
 * ההעדפה המבוקשת: 'wasm' | 'ollama' | 'auto'.
 * סדר: env (harness) → localStorage (UI) → 'wasm' (ברירת מחדל שמרנית).
 */
export function getBackendPreference() {
  try {
    if (typeof process !== 'undefined' && process.env?.WORDAI_EMBED_BACKEND) {
      return String(process.env.WORDAI_EMBED_BACKEND).toLowerCase();
    }
  } catch {}
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(PREF_STORAGE_KEY);
      if (v) return String(v).toLowerCase();
    }
  } catch {}
  return 'wasm';
}

/** קובע העדפה מתמשכת. דורש איפוס סשן כדי לתפוס (החתימה מוקפאת). */
export function setBackendPreference(pref) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PREF_STORAGE_KEY, String(pref || 'wasm').toLowerCase());
    }
  } catch {}
}

/** משחרר את ההקפאה — לשימוש אחרי שינוי העדפה או הפעלת Ollama. */
export function resetRetrievalBackend() {
  active = null;
  ensurePromise = null;
}

/**
 * בוחר מנוע פעם אחת. 'ollama' מבוקש אך לא זמין ⇒ נפילה ל-WASM *לפני* שהוטמע
 * ולו וקטור אחד, כלומר בלי לערבב חתימות.
 *
 * @returns {Promise<{backend:string, signature:string, reason:(string|null)}>}
 */
export async function ensureRetrievalBackend() {
  if (active) return active;
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    const pref = getBackendPreference();
    if (pref === 'ollama' || pref === 'auto') {
      const probe = await probeOllamaEmbedding();
      if (probe.ok) {
        active = { backend: RETRIEVAL_BACKEND.OLLAMA_BGE_M3, signature: OLLAMA_EMBED_SIGNATURE, reason: null };
        return active;
      }
      // 'ollama' מפורש שנכשל הוא כשל *ראוי לדיווח* — המשתמש ביקש מנוע והוא לא
      // קם. 'auto' מתגלגל בשקט. בשני המקרים ממשיכים ב-WASM.
      active = {
        backend: RETRIEVAL_BACKEND.WASM_E5,
        signature: STYLE_EMBEDDING_SIGNATURE,
        reason: pref === 'ollama' ? `Ollama/${OLLAMA_EMBED_MODEL} לא זמין — ${probe.reason}` : null,
      };
      return active;
    }
    active = { backend: RETRIEVAL_BACKEND.WASM_E5, signature: STYLE_EMBEDDING_SIGNATURE, reason: null };
    return active;
  })();

  return ensurePromise;
}

/**
 * החתימה של המנוע הפעיל. סינכרוני — מיועד לקוראים שכבר עשו ensure.
 * לפני ensure מחזיר את חתימת ה-WASM, שהיא גם ברירת המחדל.
 */
export function getRetrievalSignature() {
  return active ? active.signature : STYLE_EMBEDDING_SIGNATURE;
}

/** שם המנוע הפעיל (או ברירת המחדל לפני ensure). לתצוגה ולדיווח ב-harness. */
export function getRetrievalBackend() {
  return active ? active.backend : RETRIEVAL_BACKEND.WASM_E5;
}

/** אי-זמינות של המנוע הפעיל, או null. */
export function isRetrievalEmbeddingUnavailable() {
  return getRetrievalBackend() === RETRIEVAL_BACKEND.OLLAMA_BGE_M3
    ? isOllamaEmbeddingUnavailable()
    : isWasmUnavailable();
}

/**
 * מטמיע טקסטים במנוע הפעיל. חתימה זהה ל-embedTexts כדי שהקוראים לא ישתנו.
 *
 * @param {string[]} texts
 * @param {{kind?:('passage'|'query'), onProgress?:function}} opts
 * @returns {Promise<(Float32Array[]|null)>} null = המנוע נפל (ר' הערת ההקפאה למעלה)
 */
export async function embedForRetrieval(texts, { kind = 'passage', onProgress = null } = {}) {
  const chosen = await ensureRetrievalBackend();
  if (chosen.backend === RETRIEVAL_BACKEND.OLLAMA_BGE_M3) {
    return embedTextsOllama(texts, { onProgress });
  }
  return embedTextsWasm(texts, { kind, onProgress });
}
