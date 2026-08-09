// clipWriter.js — כתיבת קליפים ל-Firestore/Storage דרך REST-over-fetch
// סכימת מסמך: users/{uid}/clips/{clipId}
//
// ⚠️ **למה REST ולא ה-SDK.** `@firebase/storage` בבילד ה-browser מקבע
// `XhrConnection` (`new XMLHttpRequest()`), ול-service worker של MV3 אין
// XMLHttpRequest. אין שער ריצה ואין opt-out. גרוע מכך: `NetworkRequest.start()`
// קורא ל-connectionFactory בתוך callback של setTimeout **בלי try/catch**, ולכן
// הזריקה נבלעת במשימת הטיימר, ה-responseHandler לא רץ, ה-retry לא נכנס, ובתום
// עשר הדקות `stop(true)` נקרא בלי triggerCallback — כלומר `uploadBytes` לא
// נפתרת ולא נדחית **לעולם**. תוצאה: כל קליפ מסוג file/image נתקע מאז הקומיט
// הראשון, סלוט הסמפור לא משתחרר, ואחרי UPLOAD_CONCURRENCY קבצים כל העבודה
// ננעלת בשקט (ולכן שורת "סיכום עבודה" מעולם לא הודפסה).
//
// שני ההבדלים שקל ליפול בהם בין שתי הכתובות:
//   Storage   → `Authorization: Firebase <idToken>`  (לא Bearer!)
//   Firestore → `Authorization: Bearer <idToken>`

import { FIREBASE_PROJECT_ID, FIREBASE_STORAGE_BUCKET } from './firebaseClient.js';
import { getClipIdToken } from './auth.js';
import { getSettings } from './settings.js';

const MAX_TEXT_CHARS = 900000;

// ⚠️ **הגנה בעומק.** הבאג הזה היה שקט ולא רועש רק משום ששום דבר לא חסם את
// ה-await. כל העלאה מוגבלת בזמן, כך שגם הבטחה עתידית שלא נפתרת תשחרר את
// סלוט הסמפור ותופיע כשגיאת פריט במקום לנעול את העבודה.
const UPLOAD_TIMEOUT_MS = 90000;
// מספר ניסיונות ההעלאה — מחליף את ה-backoff של ה-SDK שנזרק כאן.
const UPLOAD_ATTEMPTS = 2;

const STORAGE_ENDPOINT = 'https://firebasestorage.googleapis.com/v0/b';
const FIRESTORE_ENDPOINT = 'https://firestore.googleapis.com/v1';

/** סנטינל serverTimestamp — מורם ל-updateTransforms בזמן בניית ה-commit. */
const SERVER_TIMESTAMP = Object.freeze({ __serverTimestamp: true });
function serverTimestamp() {
  return SERVER_TIMESTAMP;
}

function makeClipId() {
  const rand = Math.random().toString(36).slice(2, 6);
  return `clip-${Date.now().toString(36)}-${rand}`;
}

function domainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** ממיר ערך JS לערך ממוזג של Firestore REST. */
function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(value)) fields[k] = toFirestoreValue(v);
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

/** מחלץ את הודעת השגיאה של Google מגוף התשובה, ונופל למספר הסטטוס. */
async function restError(res, fallback) {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message || '';
  } catch {
    detail = '';
  }
  const err = new Error(detail || `${fallback} (${res.status})`);
  err.status = res.status;
  return err;
}

function withTimeout(run, ms, message) {
  let timer = null;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(message);
      err.timedOut = true;
      reject(err);
    }, ms);
  });
  return Promise.race([Promise.resolve().then(run), guard]).finally(() => clearTimeout(timer));
}

/** רק תקלת רשת / 429 / 5xx שווה ניסיון נוסף. 403 הוא כללי Storage — לא חוזרים. */
function isRetryableUpload(err) {
  if (err?.timedOut) return false; // כבר חיכינו 90 שניות; ניסיון שני רק ינעל עוד
  const status = err?.status;
  if (!status) return true; // TypeError: Failed to fetch
  return status === 429 || status >= 500;
}

/**
 * מעלה בייטים ל-Cloud Storage דרך ה-REST של Firebase.
 * @returns {Promise<void>}
 */
async function uploadBytesRest(storagePath, bytes, contentType, idToken) {
  const body = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const url = `${STORAGE_ENDPOINT}/${encodeURIComponent(FIREBASE_STORAGE_BUCKET)}/o`
    + `?uploadType=media&name=${encodeURIComponent(storagePath)}`;

  let lastErr = null;
  for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt += 1) {
    try {
      await withTimeout(async () => {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            // ⚠️ "Firebase", לא "Bearer" — כך addAuthHeader_ של ה-SDK עושה.
            Authorization: `Firebase ${idToken}`,
            'Content-Type': contentType || 'application/octet-stream',
          },
          body,
        });
        if (!res.ok) throw await restError(res, 'ההעלאה ל-Storage נכשלה');
      }, UPLOAD_TIMEOUT_MS, 'ההעלאה ל-Storage חרגה מזמן ההמתנה');
      return;
    } catch (err) {
      lastErr = err;
      if (attempt >= UPLOAD_ATTEMPTS || !isRetryableUpload(err)) throw err;
    }
  }
  throw lastErr;
}

/**
 * כותב מסמך קליפ דרך documents:commit — כך `createdAt` נשאר serverTimestamp
 * אמיתי (setToServerValue) ולא שעון מקומי.
 * @returns {Promise<string>} clipId
 */
async function commitClipDoc(uid, clipId, data, idToken) {
  const fields = {};
  const updateTransforms = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === SERVER_TIMESTAMP) {
      updateTransforms.push({ fieldPath: key, setToServerValue: 'REQUEST_TIME' });
      continue;
    }
    // ⚠️ null נכתב במפורש כ-nullValue ולא מושמט — הנורמליזציה באפליקציה קוראת אותו.
    fields[key] = toFirestoreValue(value);
  }

  const name = `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}/clips/${clipId}`;
  const res = await fetch(
    `${FIRESTORE_ENDPOINT}/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:commit`,
    {
      method: 'POST',
      headers: {
        // ⚠️ כאן דווקא Bearer, בניגוד ל-Storage.
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes: [{ update: { name, fields }, updateTransforms }] }),
    },
  );
  if (!res.ok) throw await restError(res, 'כתיבת מסמך הקליפ נכשלה');
  return clipId;
}

/**
 * כותב קליפ טקסטואלי (עמוד שלם / בחירה).
 * @param {{uid:string, title:string, text:string, sourceUrl:string, captureMode:string}} params
 */
export async function writeTextClip({ uid, title, text, sourceUrl, captureMode }) {
  const settings = await getSettings();
  const idToken = await getClipIdToken();
  const clipId = makeClipId();
  const truncated = text.length > MAX_TEXT_CHARS;
  const finalText = truncated ? text.slice(0, MAX_TEXT_CHARS) : text;

  await commitClipDoc(uid, clipId, {
    kind: 'text',
    status: 'pending',
    captureMode,
    title: title || '(ללא כותרת)',
    text: finalText,
    sourceUrl: sourceUrl || null,
    domain: domainFromUrl(sourceUrl),
    createdAt: serverTimestamp(),
    destination: settings.defaultDestination,
    projectId: settings.lastProjectId || null,
    storagePath: null,
    truncated,
    errorMessage: null,
    processedAt: null,
  }, idToken);

  return clipId;
}

/**
 * כותב קליפ קובץ (PDF וכו'): מעלה ל-Storage וכותב מסמך kind='file'.
 * החילוץ עצמו נעשה באפליקציה (extractMaterialTextFromBytes), כמו OCR לתמונות —
 * התוסף נשאר רזה ולא גורר pdf.js.
 *
 * ⚠️ **הסדר קדוש**: ההעלאה תמיד לפני ה-commit. clipInboxService באפליקציה
 * קורא את מסמך ה-Firestore ואז מוריד את storagePath — מסמך שנראה לפני שהבלוב
 * קיים הוא קליפ שבור. deferDoc משנה רק **מי ממתין** ל-ack, לא את הסדר:
 * מוחזר `{clipId, docWrite}` וההמתנה עוברת לקורא (מחוץ לסמפור ההעלאה).
 * בלי deferDoc ההתנהגות זהה לקודם — מוחזר clipId אחרי ששני השלבים הסתיימו.
 * @param {{uid:string, title:string, bytes:Uint8Array|ArrayBuffer, fileName:string,
 *          sourceUrl:string, captureMode:string, contentType?:string, deferDoc?:boolean}} params
 */
export async function writeFileClip({ uid, title, bytes, fileName, sourceUrl, captureMode, contentType = 'application/pdf', deferDoc = false }) {
  const settings = await getSettings();
  const idToken = await getClipIdToken();
  const clipId = makeClipId();
  const safeName = String(fileName || 'clip.pdf').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'clip.pdf';
  const storagePath = `users/${uid}/clips/${clipId}/${safeName}`;

  await uploadBytesRest(storagePath, bytes, contentType, idToken);

  const docWrite = commitClipDoc(uid, clipId, {
    kind: 'file',
    status: 'pending',
    captureMode,
    title: title || safeName,
    fileName: safeName,
    text: null,
    sourceUrl: sourceUrl || null,
    domain: domainFromUrl(sourceUrl),
    createdAt: serverTimestamp(),
    destination: settings.defaultDestination,
    projectId: settings.lastProjectId || null,
    storagePath,
    truncated: false,
    errorMessage: null,
    processedAt: null,
  }, idToken);

  if (deferDoc) return { clipId, docWrite };
  await docWrite;
  return clipId;
}

/**
 * כותב קליפ תמונה: מעלה קודם ל-Storage, ואז כותב את מסמך ה-Firestore עם הנתיב.
 * @param {{uid:string, title:string, bytes:Uint8Array|ArrayBuffer, sourceUrl:string, captureMode:string, contentType?:string}} params
 */
export async function writeImageClip({ uid, title, bytes, sourceUrl, captureMode, contentType = 'image/png' }) {
  const settings = await getSettings();
  const idToken = await getClipIdToken();
  const clipId = makeClipId();
  const storagePath = `users/${uid}/clips/${clipId}/image.png`;

  await uploadBytesRest(storagePath, bytes, contentType, idToken);

  await commitClipDoc(uid, clipId, {
    kind: 'image',
    status: 'pending',
    captureMode,
    title: title || '(תמונה ללא כותרת)',
    text: null,
    sourceUrl: sourceUrl || null,
    domain: domainFromUrl(sourceUrl),
    createdAt: serverTimestamp(),
    destination: settings.defaultDestination,
    projectId: settings.lastProjectId || null,
    storagePath,
    truncated: false,
    errorMessage: null,
    processedAt: null,
  }, idToken);

  return clipId;
}
