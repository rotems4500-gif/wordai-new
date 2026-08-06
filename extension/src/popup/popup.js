// popup.js — ה-UI של הפופאפ. נטען כ-IIFE (bundled ע"י esbuild), ללא type=module ב-HTML.
import { signInWithGoogle, signOutUser, getCachedUser } from '../lib/auth.js';
import { getSettings, setDefaultDestination } from '../lib/settings.js';

const signedOutView = document.getElementById('signed-out-view');
const signedInView = document.getElementById('signed-in-view');
const signInBtn = document.getElementById('sign-in-btn');
const signOutBtn = document.getElementById('sign-out-btn');
const signedOutError = document.getElementById('signed-out-error');
const userEmailEl = document.getElementById('user-email');
const sendPageBtn = document.getElementById('send-page-btn');
const sendFilesBtn = document.getElementById('send-files-btn');
const sendStatusEl = document.getElementById('send-status');
const setDefaultCheckbox = document.getElementById('set-default-checkbox');
const destinationRadios = document.querySelectorAll('input[name="destination"]');

function showError(message) {
  signedOutError.textContent = message;
  signedOutError.classList.remove('hidden');
}

function showStatus(message, kind) {
  sendStatusEl.textContent = message;
  sendStatusEl.classList.remove('hidden', 'success', 'error');
  sendStatusEl.classList.add(kind);
  setTimeout(() => sendStatusEl.classList.add('hidden'), 4000);
}

async function renderSignedIn(user) {
  signedOutView.classList.add('hidden');
  signedInView.classList.remove('hidden');
  userEmailEl.textContent = user.email || user.displayName || '';

  const settings = await getSettings();
  destinationRadios.forEach((radio) => {
    radio.checked = radio.value === settings.defaultDestination;
  });
}

function renderSignedOut() {
  signedInView.classList.add('hidden');
  signedOutView.classList.remove('hidden');
}

async function init() {
  const cached = await getCachedUser();
  if (cached) {
    await renderSignedIn(cached);
  } else {
    renderSignedOut();
  }
}

signInBtn.addEventListener('click', async () => {
  signedOutError.classList.add('hidden');
  signInBtn.disabled = true;
  signInBtn.textContent = 'מתחבר...';
  try {
    const user = await signInWithGoogle();
    await renderSignedIn(user);
  } catch (err) {
    console.error('[wordflow][popup] שגיאת התחברות:', err);
    showError(err.message || 'ההתחברות נכשלה');
  } finally {
    signInBtn.disabled = false;
    signInBtn.textContent = 'התחברות עם Google';
  }
});

signOutBtn.addEventListener('click', async () => {
  await signOutUser();
  renderSignedOut();
});

sendFilesBtn.addEventListener('click', () => {
  sendFilesBtn.disabled = true;
  sendFilesBtn.textContent = 'סורק ומוריד...';
  chrome.runtime.sendMessage({ type: 'wordflow-popup-send-files' }, (response) => {
    sendFilesBtn.disabled = false;
    sendFilesBtn.textContent = 'קלוט את כל הקבצים בעמוד';
    if (chrome.runtime.lastError) {
      showStatus(chrome.runtime.lastError.message, 'error');
      return;
    }
    if (response && response.ok) {
      showStatus(`נשלחו ${response.saved} קבצים ✓`, 'success');
    } else {
      showStatus((response && response.error) || 'שליחה נכשלה', 'error');
    }
  });
});

sendPageBtn.addEventListener('click', () => {
  sendPageBtn.disabled = true;
  sendPageBtn.textContent = 'שולח...';
  chrome.runtime.sendMessage({ type: 'wordflow-popup-send-page' }, (response) => {
    sendPageBtn.disabled = false;
    sendPageBtn.textContent = 'שלח את העמוד הנוכחי';
    if (chrome.runtime.lastError) {
      showStatus(chrome.runtime.lastError.message, 'error');
      return;
    }
    if (response && response.ok) {
      showStatus('נשלח בהצלחה ✓', 'success');
    } else {
      showStatus((response && response.error) || 'שליחה נכשלה', 'error');
    }
  });
});

destinationRadios.forEach((radio) => {
  radio.addEventListener('change', async () => {
    if (!radio.checked) return;
    if (setDefaultCheckbox.checked) {
      await setDefaultDestination(radio.value);
    }
  });
});

setDefaultCheckbox.addEventListener('change', async () => {
  if (!setDefaultCheckbox.checked) return;
  const checkedRadio = Array.from(destinationRadios).find((r) => r.checked);
  if (checkedRadio) {
    await setDefaultDestination(checkedRadio.value);
  }
});

init();
