// styleKvStore.js — עוטף IndexedDB מינימלי (key/value) למנוע הסגנון האישי.
//
// למה: מאגר הדגימות והוקטורים חרג מתקרת ה-~5MB של localStorage. כל כתיבה שחרגה
// נבלעה ב-catch ריק → מסמכים "הועלו" ונעלמו בשקט. IndexedDB נותן מקום בסדר גודל
// אחר (מאות MB) ומדווח שגיאות אמיתיות.
//
// LEAF טהור: אפס imports. browser-only (בסביבה בלי indexedDB — isIdbAvailable()=false
// והקוראים נופלים חזרה ל-localStorage).

const DB_NAME = 'wordai_style';
const DB_VERSION = 1;
const STORE = 'kv';

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

function runTx(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(STORE, mode);
    } catch (err) {
      reject(err);
      return;
    }
    const store = tx.objectStore(STORE);
    try {
      fn(store);
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  }));
}

/**
 * @param {string} key
 * @returns {Promise<any>} הערך, או undefined אם לא קיים
 */
export async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(String(key));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB get failed'));
  });
}

/**
 * @param {string} key
 * @param {any} value — structured-cloneable
 * @returns {Promise<void>}
 */
export async function idbSet(key, value) {
  await runTx('readwrite', (store) => store.put(value, String(key)));
}

/** @param {string} key @returns {Promise<void>} */
export async function idbDelete(key) {
  await runTx('readwrite', (store) => store.delete(String(key)));
}
