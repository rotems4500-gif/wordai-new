// ═══════════════════════════════════════════════════════════════
// deckStore.js — שמירה מתמדת של מצגות ("המצגות שלי").
//
// אחסון דו-שכבתי, ובכוונה:
//   1. **אינדקס** ב-localStorage תחת 'wordai_decks_v1' — רשומות זעירות בלבד
//      (id, כותרת, מספר שקופיות, תאריכים, themeId, נושא). זה מה שמסתנכרן לענן
//      (PERSISTED_APP_SETTINGS_KEYS + CLOUD_PROFILE_APP_SETTING_KEYS), עם מחיקה
//      רכה (tombstone) כדי שמכשיר מיושן לא יחזיר מצגת שנמחקה.
//   2. **גוף הדק** ב-IndexedDB (DB 'wordai_decks', store 'bodies', key=id) —
//      **מקומי למכשיר, לא מסתנכרן**. הסיבה: שקופית עם תמונה מחוללת נושאת
//      data:image/...;base64 של מאות KB. דק אחד עם 10 תמונות שובר בקלות את
//      תקרת ה-~5MB של localStorage ואת תקרת ה-1MB של מסמך Firestore.
//      זו בדיוק התקלה ההיסטורית של מנוע הסגנון (ר' styleKvStore.js:1-8):
//      כתיבה שחרגה נבלעה ב-catch ריק ומסמכים "נשמרו" ונעלמו בשקט.
//
// ⚠️ אין כאן catch ריק על כתיבה. כישלון מכסה זורק שגיאה בעברית — עדיף שהמשתמש
// יראה "השמירה נכשלה" מאשר שיגלה מחר שהמצגת איננה.
//
// נפילה לאחור: בסביבה בלי IndexedDB הגוף נשמר ב-localStorage תחת
// 'wordai_deck_body_<id>' — אבל **רק** מתחת ל-300KB. מעל זה הרשומה מסומנת
// bodyMissing:true והשמירה זורקת: אין דרך כנה לשמור דק כזה בלי IndexedDB.
// ═══════════════════════════════════════════════════════════════

import { syncPersistedAppSettings } from './aiService';

export const DECKS_INDEX_KEY = 'wordai_decks_v1';
export const DECKS_UPDATED_EVENT = 'wordai-decks-updated';
export const DECKS_SCHEMA_VERSION = 1;

const DB_NAME = 'wordai_decks';
const DB_VERSION = 1;
const STORE = 'bodies';

const BODY_LS_PREFIX = 'wordai_deck_body_';
// תקרת גוף ל-fallback ב-localStorage. שמרני בכוונה: המכסה כולה ~5MB ומשותפת
// עם כל שאר ההגדרות של האפליקציה.
const LS_BODY_MAX_CHARS = 300 * 1024;
// תקרת תמונה ממוזערת באינדקס. האינדקס מסתנכרן לענן — thumb גדול היה מנפח
// את מסמך ה-Firestore המשותף (תקרת 1MB) עבור כל המצגות ביחד.
export const THUMB_MAX_CHARS = 40 * 1024;

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const nowIso = () => new Date().toISOString();
const makeDeckId = () => `deck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ── IndexedDB מינימלי (אותו דפוס של styleKvStore, DB נפרד) ──────────

let dbPromise = null;

/** האם IndexedDB זמין בסביבה הנוכחית. */
export function isIdbAvailable() {
  try {
    return typeof indexedDB !== 'undefined' && Boolean(indexedDB);
  } catch {
    return false;
  }
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!isIdbAvailable()) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  }).catch((err) => {
    dbPromise = null; // מאפשר ניסיון חוזר
    throw err;
  });
  return dbPromise;
}

function idbGetBody(id) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(String(id));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB get failed'));
  }));
}

function idbRunWrite(fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(STORE, 'readwrite');
    } catch (err) {
      reject(err);
      return;
    }
    try {
      fn(tx.objectStore(STORE));
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  }));
}

// ── אינדקס ב-localStorage ────────────────────────────────────────

function emitDecksUpdated() {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(DECKS_UPDATED_EVENT));
  } catch {}
}

function readIndexBlob() {
  const empty = { schemaVersion: DECKS_SCHEMA_VERSION, updatedAt: '', decks: {} };
  if (typeof window === 'undefined') return empty;
  let parsed = null;
  try {
    parsed = JSON.parse(localStorage.getItem(DECKS_INDEX_KEY) || '');
  } catch {}
  if (!isPlainObject(parsed) || !isPlainObject(parsed.decks)) return empty;
  return parsed;
}

// ⚠️ בכוונה זורק (ולא בולע) — כשל כתיבה של האינדקס פירושו שהמצגת לא תופיע
// ברשימה, וזה חייב להגיע למשתמש.
function writeIndexBlob(blob) {
  if (typeof window === 'undefined') return;
  const next = {
    schemaVersion: DECKS_SCHEMA_VERSION,
    updatedAt: nowIso(),
    decks: isPlainObject(blob?.decks) ? blob.decks : {},
  };
  try {
    localStorage.setItem(DECKS_INDEX_KEY, JSON.stringify(next));
  } catch (err) {
    throw new Error('שמירת רשימת המצגות נכשלה — אין מקום פנוי באחסון המקומי.');
  }
  try { syncPersistedAppSettings(); } catch {}
  emitDecksUpdated();
}

function normalizeRecord(raw = {}) {
  if (!isPlainObject(raw) || !raw.id) return null;
  const thumb = String(raw.thumbDataUrl || '');
  return {
    id: String(raw.id),
    title: String(raw.title || 'מצגת ללא שם').trim() || 'מצגת ללא שם',
    slideCount: Number.isFinite(+raw.slideCount) ? Math.max(0, Math.round(+raw.slideCount)) : 0,
    createdAt: String(raw.createdAt || ''),
    updatedAt: String(raw.updatedAt || ''),
    deletedAt: raw.deletedAt || null,
    themeId: String(raw.themeId || ''),
    topic: String(raw.topic || '').slice(0, 300),
    thumbDataUrl: thumb.length <= THUMB_MAX_CHARS ? thumb : '',
    bodyMissing: Boolean(raw.bodyMissing),
  };
}

/**
 * רשימת המצגות מהאינדקס, החדשה ביותר קודם. tombstones מסוננים כברירת מחדל.
 * @returns {Array<object>}
 */
export function listDecks({ includeDeleted = false } = {}) {
  const blob = readIndexBlob();
  return Object.values(blob.decks || {})
    .map((r) => normalizeRecord(r))
    .filter((r) => r && (includeDeleted || !r.deletedAt))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

/** רשומת אינדקס בודדת (כולל tombstone), או null. */
export function getDeckRecord(id) {
  const key = String(id || '').trim();
  if (!key) return null;
  return normalizeRecord(readIndexBlob().decks?.[key]) || null;
}

// ── גוף הדק ──────────────────────────────────────────────────────

const bodyLsKey = (id) => `${BODY_LS_PREFIX}${id}`;

async function writeBody(id, deck) {
  const serialized = JSON.stringify(deck);
  if (isIdbAvailable()) {
    // שומרים את האובייקט עצמו (structured clone) — מהיר יותר מ-parse/stringify.
    await idbRunWrite((store) => store.put(deck, String(id)));
    // ניקוי שריד מ-fallback ישן, אם היה.
    try { localStorage.removeItem(bodyLsKey(id)); } catch {}
    return { ok: true };
  }
  if (serialized.length > LS_BODY_MAX_CHARS) {
    return {
      ok: false,
      message: 'המצגת כבדה מדי לשמירה בדפדפן הזה (אין IndexedDB). ייצא אותה ל-PowerPoint כדי לא לאבד אותה.',
    };
  }
  try {
    localStorage.setItem(bodyLsKey(id), serialized);
  } catch {
    return { ok: false, message: 'שמירת המצגת נכשלה — אין מקום פנוי באחסון המקומי.' };
  }
  return { ok: true };
}

async function readBody(id) {
  if (isIdbAvailable()) {
    try {
      const value = await idbGetBody(id);
      if (value) return value;
    } catch {
      // ממשיכים ל-fallback — DB חסום/פגום לא צריך למנוע קריאה מ-localStorage.
    }
  }
  try {
    const raw = localStorage.getItem(bodyLsKey(id));
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

async function removeBody(id) {
  if (isIdbAvailable()) {
    try { await idbRunWrite((store) => store.delete(String(id))); } catch {}
  }
  try { localStorage.removeItem(bodyLsKey(id)); } catch {}
}

// ── API ציבורי ───────────────────────────────────────────────────

/**
 * שמירה (upsert) של מצגת: גוף למכשיר, רשומה לאינדקס.
 * @param {object} deck  אובייקט deck מלא (deckModel)
 * @param {{thumbDataUrl?: string}} options  thumb חדש; כשלא מסופק נשמר הקיים.
 * @returns {Promise<object>} רשומת האינדקס שנכתבה
 * @throws {Error} הודעה בעברית כשהשמירה נכשלה (מכסה/אחסון)
 */
export async function saveDeck(deck, { thumbDataUrl } = {}) {
  const id = String(deck?.id || '').trim();
  if (!id) throw new Error('לא ניתן לשמור מצגת בלי מזהה.');

  const bodyResult = await writeBody(id, deck);

  const blob = readIndexBlob();
  const existing = normalizeRecord(blob.decks?.[id]);
  const incomingThumb = typeof thumbDataUrl === 'string' ? thumbDataUrl : null;
  const nextThumb = incomingThumb != null ? incomingThumb : (existing?.thumbDataUrl || '');

  const record = normalizeRecord({
    id,
    title: deck?.title || existing?.title || 'מצגת ללא שם',
    slideCount: Array.isArray(deck?.slides) ? deck.slides.length : (existing?.slideCount || 0),
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
    deletedAt: null, // שמירה מחיה מצגת שנמחקה (המשתמש פתח אותה במפורש)
    themeId: deck?.themeId || existing?.themeId || '',
    topic: deck?.meta?.topic || deck?.meta?.goal || existing?.topic || '',
    thumbDataUrl: nextThumb,
    bodyMissing: !bodyResult.ok,
  });

  writeIndexBlob({ decks: { ...(blob.decks || {}), [id]: record } });

  if (!bodyResult.ok) throw new Error(bodyResult.message);
  return record;
}

/**
 * טעינת גוף מצגת. מחזיר null כשהגוף לא קיים במכשיר הזה
 * (למשל: הרשומה הגיעה בסנכרון ממכשיר אחר).
 * @returns {Promise<object|null>}
 */
export async function loadDeck(id) {
  const key = String(id || '').trim();
  if (!key) return null;
  const body = await readBody(key);
  return isPlainObject(body) ? body : null;
}

/**
 * מחיקה רכה: tombstone באינדקס (כדי שסנכרון ממכשיר מיושן לא יחזיר אותה)
 * + מחיקה קשה של הגוף המקומי, שהוא הכבד.
 * @returns {Promise<void>}
 */
export async function deleteDeck(id) {
  const key = String(id || '').trim();
  if (!key) return;
  const blob = readIndexBlob();
  const existing = normalizeRecord(blob.decks?.[key]);
  if (existing) {
    const tombstone = {
      ...existing,
      deletedAt: nowIso(),
      updatedAt: nowIso(),
      thumbDataUrl: '',
      bodyMissing: true,
    };
    writeIndexBlob({ decks: { ...(blob.decks || {}), [key]: tombstone } });
  }
  await removeBody(key);
}

/**
 * שכפול: טוען את הגוף, מייצר id חדש ושומר.
 * @returns {Promise<object>} רשומת האינדקס החדשה
 */
export async function duplicateDeck(id) {
  const body = await loadDeck(id);
  if (!body) throw new Error('המצגת נוצרה במכשיר אחר ואינה זמינה כאן.');
  const newId = makeDeckId();
  const copy = {
    ...body,
    id: newId,
    title: `${String(body.title || 'מצגת ללא שם').trim()} (עותק)`,
  };
  return saveDeck(copy, { thumbDataUrl: getDeckRecord(id)?.thumbDataUrl || '' });
}

/**
 * שינוי שם: מעדכן את האינדקס, ואת הגוף אם הוא קיים במכשיר.
 * @returns {Promise<object|null>} הרשומה המעודכנת
 */
export async function renameDeck(id, title) {
  const key = String(id || '').trim();
  const clean = String(title || '').trim();
  if (!key || !clean) return null;

  const blob = readIndexBlob();
  const existing = normalizeRecord(blob.decks?.[key]);
  if (!existing) return null;

  const next = normalizeRecord({ ...existing, title: clean, updatedAt: nowIso() });
  writeIndexBlob({ decks: { ...(blob.decks || {}), [key]: next } });

  const body = await readBody(key);
  if (isPlainObject(body)) {
    try { await writeBody(key, { ...body, title: clean }); } catch {}
  }
  return next;
}
