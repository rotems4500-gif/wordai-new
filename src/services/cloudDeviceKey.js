// cloudDeviceKey.js — "זכור במכשיר הזה": שמירת ה-DEK מקומית כדי שלא צריך
// להקליד את סיסמת ההצפנה בכל פתיחה (וגם לא אחרי עדכון של האתר/האפליקציה).
//
// ה-DEK נשמר מוגן ברמת מערכת ההפעלה / ה-origin:
//   - דסקטופ (Tauri): קובץ מוצפן DPAPI דרך save_secure_file — בדיוק כמו
//     שמפתחות ה-API כבר נשמרים מקומית. רק חשבון ה-Windows הזה יכול לפענח.
//   - דפדפן/PWA: CryptoKey ב-IndexedDB. שורד reload **ועדכון גרסה/Service Worker**
//     (IndexedDB לא נמחק עם ה-cache), ומוגבל ל-origin הזה.
//
// המפתח מתויג ב-uid כדי לא להתבלבל בין חשבונות גוגל. clearDeviceKey מוחק.
//
// טריידאוף מודע: מי שיש לו גישה לחשבון ה-Windows / פרופיל הדפדפן הזה ייכנס
// למפתחות בלי הסיסמה. זו בדיוק המשמעות של "זכור במכשיר הזה". במכשיר חדש עדיין
// תידרש הסיסמה. "שכח מכשיר זה" / השבתת הצפנה מנקים את המפתח השמור.
//
// ⚠️ המפתח שנטען מכאן **לא נחשב אמין עד שמאמתים אותו** מול ciphertext אמיתי
// מהענן (ראה CloudUnlockGate). מפתח ישן/לא תואם שיאומץ בעיוורון היה מצפין את
// הסנכרון הבא במפתח שגוי ומשבש את הבלוב בענן.

const DESKTOP_REL = (uid) => `cloud-dek-${uid}.json`;
const IDB_DB = 'wordai-secure';
const IDB_STORE = 'cloud-dek';

function isDesktop() {
  return Boolean(
    typeof window !== 'undefined'
    && window.desktopApp?.readSecureValue
    && window.desktopApp?.saveSecureValue,
  );
}

function bytesToB64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function b64ToBytes(b64) {
  const binary = atob(String(b64 || ''));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

// ---- IndexedDB מינימלי (web בלבד) ----
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const rq = tx.objectStore(IDB_STORE).get(key);
    rq.onsuccess = () => { db.close(); resolve(rq.result ?? null); };
    rq.onerror = () => { db.close(); reject(rq.error); };
  });
}
async function idbDel(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// שומר את ה-DEK במכשיר. מחזיר true בהצלחה.
export async function saveDeviceKey(uid, dek) {
  if (!uid || !dek) return false;
  try {
    if (isDesktop()) {
      const raw = new Uint8Array(await crypto.subtle.exportKey('raw', dek));
      const res = await window.desktopApp.saveSecureValue(DESKTOP_REL(uid), { dek: bytesToB64(raw), v: 1 });
      return Boolean(res?.ok ?? true);
    }
    // ⚠️ אסור לשמור את ה-DEK כמו שהוא: הוא נוצר extractable (cloudCrypto יוצר
    // אותו כך כדי לאפשר עטיפה מחדש), וכתיבתו ל-IndexedDB הייתה נותנת ל-XSS
    // לעשות exportKey ולהוציא את המפתח מהדפדפן. מייצאים פעם אחת בזיכרון
    // ומייבאים מחדש כ-**non-extractable** — המפתח עדיין משמש להצפנה/פענוח
    // באותו origin, אבל החומר הגולמי שלו כבר לא ניתן לחילוץ מהאחסון.
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', dek));
    const sealed = await crypto.subtle.importKey(
      'raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
    );
    raw.fill(0);
    await idbPut(uid, sealed);
    return true;
  } catch {
    return false;
  }
}

// טוען DEK שמור למכשיר הזה (CryptoKey) או null אם אין/נכשל.
export async function loadDeviceKey(uid) {
  if (!uid) return null;
  try {
    if (isDesktop()) {
      const data = await window.desktopApp.readSecureValue(DESKTOP_REL(uid));
      const b64 = data?.dek;
      if (!b64) return null;
      // non-extractable גם כאן: אחרי הייבוא אין שום צורך לחלץ ממנו raw שוב.
      return await crypto.subtle.importKey('raw', b64ToBytes(b64), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    }
    const key = await idbGet(uid);
    return key || null;
  } catch {
    return null;
  }
}

// מוחק את ה-DEK השמור (שכח מכשיר / השבתת הצפנה / מפתח שהתגלה כלא תקף).
export async function clearDeviceKey(uid) {
  if (!uid) return;
  try {
    if (isDesktop()) await window.desktopApp.saveSecureValue(DESKTOP_REL(uid), {});
    else await idbDel(uid);
  } catch { /* ignore */ }
}

export async function hasDeviceKey(uid) {
  return Boolean(await loadDeviceKey(uid));
}
