// firebaseClient.js — אתחול Firebase יחיד לכל ה-service worker
// __FIREBASE_CONFIG__ מוזרק בזמן build (build.mjs) דרך esbuild define, מתוך .env.local בשורש הריפו.

//
// ⚠️ **אין כאן יותר firebase/firestore ו-firebase/storage.** ה-SDK של Storage
// (`@firebase/storage`) קורא `new XMLHttpRequest()` ישירות בבילד ה-browser
// (`XhrConnection`), ול-service worker של MV3 אין XMLHttpRequest בכלל. הזריקה
// קורית בתוך callback של setTimeout בלי try/catch, ולכן ההבטחה של uploadBytes
// **לעולם לא נפתרת ולא נדחית** — כל קליפ קובץ/תמונה נתקע לנצח והסמפור לא
// משתחרר. הכתיבה עברה ל-REST-over-fetch ב-clipWriter.js.

import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, getAuth } from 'firebase/auth';

// __FIREBASE_CONFIG__ הוא מחרוזת JSON (JSON.stringify כפול ב-build.mjs), לכן צריך פענוח יחיד כאן.
const firebaseConfig = JSON.parse(__FIREBASE_CONFIG__);

/** מזהי הפרויקט והדלי — נדרשים לבניית כתובות ה-REST של Firestore/Storage. */
export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIREBASE_STORAGE_BUCKET = firebaseConfig.storageBucket;

let appInstance = null;
let authInstance = null;

function getFirebaseApp() {
  if (appInstance) return appInstance;
  appInstance = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return appInstance;
}

export function getFirebaseAuth() {
  if (authInstance) return authInstance;
  const app = getFirebaseApp();
  try {
    // ב-MV3 service worker חייבים persistence שעובד בלי window/localStorage רגיל.
    authInstance = initializeAuth(app, {
      persistence: indexedDBLocalPersistence,
    });
  } catch (err) {
    // אם כבר אותחל (למשל hot-reload בזמן פיתוח) — ניפול חזרה ל-getAuth.
    authInstance = getAuth(app);
  }
  return authInstance;
}
