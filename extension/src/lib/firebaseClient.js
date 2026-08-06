// firebaseClient.js — אתחול Firebase יחיד לכל ה-service worker
// __FIREBASE_CONFIG__ מוזרק בזמן build (build.mjs) דרך esbuild define, מתוך .env.local בשורש הריפו.

import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// __FIREBASE_CONFIG__ הוא מחרוזת JSON (JSON.stringify כפול ב-build.mjs), לכן צריך פענוח יחיד כאן.
const firebaseConfig = JSON.parse(__FIREBASE_CONFIG__);

let appInstance = null;
let authInstance = null;
let dbInstance = null;
let storageInstance = null;

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

export function getDb() {
  if (dbInstance) return dbInstance;
  dbInstance = getFirestore(getFirebaseApp());
  return dbInstance;
}

export function getStorageInstance() {
  if (storageInstance) return storageInstance;
  storageInstance = getStorage(getFirebaseApp());
  return storageInstance;
}
