// auth.js — התחברות Google דרך chrome.identity.launchWebAuthFlow (implicit flow, id_token)
//
// ⚠️ הגדרה חד-פעמית נדרשת לפני שההתחברות תעבוד:
// 1. Google Cloud Console → הפרויקט של wordai-website → APIs & Services → Credentials
// 2. Create Credentials → OAuth client ID → Application type: "Chrome Extension"
//    (אם האפשרות לא זמינה, אפשר גם "Web application" עם Authorized redirect URI כמו בסעיף 4)
// 3. יש להעלות/לטעון את התוסף (load unpacked) כדי לקבל extension ID קבוע,
//    או להשתמש ב-key קבוע ב-manifest.json כדי ש-ה-ID לא ישתנה בין מכונות.
// 4. Authorized redirect URI שיש להוסיף בקונסולה: https://<EXTENSION_ID>.chromiumapp.org/
//    את ה-URI המדויק אפשר לקבל מ-chrome.identity.getRedirectURL() (מודפס לקונסול ב-background).
// 5. להעתיק את ה-Client ID לכאן במקום ה-placeholder.

export const OAUTH_CLIENT_ID = '1074126625083-k9g2j4snpej3hhk1pc2i73lg4e83dbfe.apps.googleusercontent.com';

import { getFirebaseAuth } from './firebaseClient.js';
import { GoogleAuthProvider, signInWithCredential, onAuthStateChanged, signOut as fbSignOut } from 'firebase/auth';

const CACHE_KEY = 'wordflow_auth_cache';

function randomNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function buildAuthUrl(nonce, redirectUri) {
  const params = new URLSearchParams({
    client_id: OAUTH_CLIENT_ID,
    response_type: 'id_token',
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    nonce,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function extractIdTokenFromRedirect(redirectUrl) {
  const url = new URL(redirectUrl);
  // ה-id_token מגיע ב-fragment (#id_token=...) בזרימת implicit
  const fragment = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  const params = new URLSearchParams(fragment);
  const idToken = params.get('id_token');
  if (!idToken) {
    throw new Error('לא התקבל id_token מזרימת ההתחברות');
  }
  return idToken;
}

async function cacheUser(user) {
  if (!user) {
    await chrome.storage.local.remove(CACHE_KEY);
    return;
  }
  await chrome.storage.local.set({
    [CACHE_KEY]: {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email,
    },
  });
}

export async function getCachedUser() {
  const stored = await chrome.storage.local.get(CACHE_KEY);
  return stored[CACHE_KEY] || null;
}

/**
 * מחזיר id_token טרי לקריאות ה-REST של Firestore/Storage.
 *
 * ⚠️ המטמון ב-chrome.storage (getCachedUser) מחזיק רק uid/email — אין בו
 * getIdToken. וכשה-service worker קם מחדש, `auth.currentUser` הוא null עד
 * ש-IndexedDB נטען, ולכן חייבים להמתין ל-authStateReady לפני שמסיקים
 * שהמשתמש מנותק (קיים ב-@firebase/auth 1.13.4).
 */
export async function getClipIdToken() {
  const auth = getFirebaseAuth();
  if (typeof auth.authStateReady === 'function') await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw new Error('נדרשת התחברות מחדש');
  return user.getIdToken();
}

/** מתחיל את זרימת ההתחברות עם Google, מחזיר {uid,email,displayName} בהצלחה. */
export async function signInWithGoogle() {
  if (OAUTH_CLIENT_ID === 'REPLACE_WITH_CHROME_EXTENSION_OAUTH_CLIENT_ID') {
    throw new Error(
      'לא הוגדר OAuth client id. יש לבצע את שלב ההגדרה החד-פעמי המתואר בראש קובץ auth.js.'
    );
  }

  const redirectUri = chrome.identity.getRedirectURL();
  console.info('[wordflow][auth] redirect URI (יש להוסיף ל-Google Cloud Console):', redirectUri);

  const nonce = randomNonce();
  const authUrl = buildAuthUrl(nonce, redirectUri);

  const responseUrl = await new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (result) => {
      if (chrome.runtime.lastError || !result) {
        reject(new Error(chrome.runtime.lastError?.message || 'זרימת ההתחברות בוטלה'));
        return;
      }
      resolve(result);
    });
  });

  const idToken = extractIdTokenFromRedirect(responseUrl);
  const credential = GoogleAuthProvider.credential(idToken);
  const auth = getFirebaseAuth();
  const userCredential = await signInWithCredential(auth, credential);
  const user = userCredential.user;
  await cacheUser(user);
  return { uid: user.uid, email: user.email, displayName: user.displayName || user.email };
}

export async function signOutUser() {
  const auth = getFirebaseAuth();
  await fbSignOut(auth);
  await cacheUser(null);
}

/** שומר את המטמון מסונכרן עם מצב ההתחברות האמיתי (למשל אחרי חידוש טוקן). */
export function watchAuthState(callback) {
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, async (user) => {
    await cacheUser(user);
    callback(user);
  });
}
