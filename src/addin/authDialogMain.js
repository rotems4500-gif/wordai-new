// עמוד הדיאלוג של התחברות Google בתוסף ה-Word (Office Dialog API).
// signInWithPopup לא עובד ב-webview של ה-taskpane, אבל כן עובד בחלון הדיאלוג;
// התוצאה חוזרת ל-taskpane דרך messageParent והוא משלים עם cloudSignInWithGoogleIdToken.
// פורט מ-legacy-reference/auth-dialog.js.
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getFirebaseApp, getMissingFirebaseEnvVars, hasFirebaseConfig } from '../firebase/config';

const setStatus = (message) => {
  const el = document.getElementById('status');
  if (el) el.innerText = message;
};

const messageParent = (payload) => {
  try {
    Office.context.ui.messageParent(JSON.stringify(payload));
  } catch (e) {
    setStatus('לא ניתן לשלוח תשובה לתוסף: ' + (e?.message || String(e)));
  }
};

const messageFromError = (error, fallback) => {
  if (!error) return fallback;
  const text = String(error.message || fallback || '');
  if (text.includes('auth/popup-blocked')) {
    return 'חלון ההתחברות נחסם. אשר Pop-ups ונסה שוב.';
  }
  if (text.includes('missing initial state')) {
    return 'נחסם אחסון דפדפן (sessionStorage/cookies). אשר Cookies ונסה שוב.';
  }
  return text || fallback;
};

const runGoogleSignInInDialog = async () => {
  if (!hasFirebaseConfig()) {
    const missing = getMissingFirebaseEnvVars();
    setStatus('Firebase לא מוגדר בסביבה.');
    messageParent({ type: 'google-auth-error', message: missing.length ? `Missing env vars: ${missing.join(', ')}` : 'Firebase config is missing' });
    return;
  }
  try {
    const auth = getAuth(getFirebaseApp());
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    setStatus('פותח חלון התחברות Google...');
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    setStatus('התחברות הצליחה. חוזר לתוסף...');
    messageParent({
      type: 'google-auth-success',
      googleIdToken: credential?.idToken || '',
      googleAccessToken: credential?.accessToken || '',
      email: result.user?.email || '',
      uid: result.user?.uid || '',
    });
  } catch (e) {
    const message = messageFromError(e, 'Google sign-in failed');
    setStatus('שגיאה בהתחברות: ' + message);
    messageParent({ type: 'google-auth-error', message });
  }
};

Office.onReady(() => {
  const startBtn = document.getElementById('startGoogleAuth');
  setStatus('לחץ על הכפתור כדי להתחבר עם Google.');
  if (startBtn) {
    startBtn.onclick = async () => {
      startBtn.disabled = true;
      await runGoogleSignInInDialog();
      startBtn.disabled = false;
    };
  }
});
