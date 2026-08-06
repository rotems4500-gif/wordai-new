// background.js — Service worker MV3: תפריטי הקשר, אורקסטרציה של כל מצבי הקליפה, כתיבה ל-Firebase.
import { getCachedUser, watchAuthState } from './lib/auth.js';
import { writeTextClip, writeImageClip, writeFileClip } from './lib/clipWriter.js';

// --- שמירת דגל "יש לפתוח את הפופאפ ולהתחבר" כשקליפ נשלח כשהמשתמש מנותק ---
const NEEDS_LOGIN_KEY = 'wordflow_needs_login';

// שמירה שהמטמון מסונכרן גם אם ה-SW נטען מחדש בלי אינטראקציה ישירה
watchAuthState(() => {
  // ה-callback רק מרענן את המטמון (auth.js דואג לזה) — אין צורך בפעולה נוספת כאן.
});

// ---------- תפריטי הקשר ----------
// פריט-אב אחד "WordFlow AI" עם תת-תפריט — לא מעמיסים 4 שורות על תפריט הקליק-הימני.
// הפריטים הרלוונטיים בלבד מוצגים לפי ההקשר (טקסט מסומן / תמונה / עמוד).
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'wordflow-root',
    title: 'WordFlow AI',
    contexts: ['page', 'selection', 'image', 'action'],
  });
  chrome.contextMenus.create({
    id: 'wordflow-clip-selection',
    parentId: 'wordflow-root',
    title: 'שלח את הקטע המסומן',
    contexts: ['selection'],
  });
  chrome.contextMenus.create({
    id: 'wordflow-clip-image',
    parentId: 'wordflow-root',
    title: 'שלח את התמונה (עם זיהוי טקסט)',
    contexts: ['image'],
  });
  chrome.contextMenus.create({
    id: 'wordflow-clip-page',
    parentId: 'wordflow-root',
    title: 'שלח את כל העמוד',
    contexts: ['page', 'selection', 'image', 'action'],
  });
  chrome.contextMenus.create({
    id: 'wordflow-clip-area',
    parentId: 'wordflow-root',
    title: 'בחר אזור מהמסך ושלח',
    contexts: ['page', 'selection', 'image', 'action'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;
  switch (info.menuItemId) {
    case 'wordflow-clip-page':
      handleClipPage(tab).catch((err) => handleFailure(tab.id, err));
      break;
    case 'wordflow-clip-selection':
      handleClipSelection(info, tab).catch((err) => handleFailure(tab.id, err));
      break;
    case 'wordflow-clip-image':
      handleClipImage(info, tab).catch((err) => handleFailure(tab.id, err));
      break;
    case 'wordflow-clip-area':
      handleClipArea(tab).catch((err) => handleFailure(tab.id, err));
      break;
    default:
      break;
  }
});

// ---------- בדג'ים (משוב הצלחה/כשל בלי הרשאת notifications) ----------
function flashBadge(tabId, text, color, ms = 2500) {
  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color, tabId });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '', tabId });
  }, ms);
}

function handleSuccess(tabId) {
  flashBadge(tabId, '✓', '#16a34a');
}

async function handleFailure(tabId, err) {
  console.error('[wordflow][background] שגיאה בקליפה:', err);
  flashBadge(tabId, '!', '#dc2626');
}

// ---------- בדיקת התחברות לפני קליפ ----------
async function requireUser() {
  const cached = await getCachedUser();
  if (!cached) {
    await chrome.storage.local.set({ [NEEDS_LOGIN_KEY]: true });
    throw new Error('יש להתחבר עם Google לפני שליחת קליפים (פתח את הפופאפ).');
  }
  await chrome.storage.local.remove(NEEDS_LOGIN_KEY);
  return cached;
}

// ---------- מצב 1: קליפת עמוד שלם (Readability) ----------
// ⚠️ PDF שנפתח בצופה של Chrome הוא plugin, לא DOM: כל מסלולי החילוץ מהדף מחזירים 0.
// לכן מזהים אותו ומעלים את הקובץ עצמו — האפליקציה כבר יודעת לחלץ PDF (כולל OCR לסרוק).
// fetch מה-service worker מותר כאן: activeTab מעניק הרשאת מארח זמנית ללשונית הפעילה,
// ו-credentials:'include' שולח את עוגיות ה-session (חובה ל-Moodle).
const PDF_URL_PATTERN = /\.pdf(?:[?#]|$)/i;

async function fetchTabBytes(url) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`הורדת הקובץ נכשלה: ${res.status}`);
  const buf = await res.arrayBuffer();
  return { bytes: new Uint8Array(buf), contentType: res.headers.get('content-type') || '' };
}

function fileNameFromUrl(url, fallback = 'clip.pdf') {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '');
    return name || fallback;
  } catch {
    return fallback;
  }
}

async function clipPdfDocument(tab, user, bytes) {
  const fileName = fileNameFromUrl(tab.url);
  await writeFileClip({
    uid: user.uid,
    title: tab.title || fileName,
    bytes,
    fileName,
    sourceUrl: tab.url,
    captureMode: 'page',
    contentType: 'application/pdf',
  });
  handleSuccess(tab.id);
}

async function handleClipPage(tab) {
  const user = await requireUser();

  if (PDF_URL_PATTERN.test(tab.url || '')) {
    const { bytes } = await fetchTabBytes(tab.url);
    await clipPdfDocument(tab, user, bytes);
    return;
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/extract.js'],
  });

  // קריאה שנייה לאיסוף התוצאה — ר' ההערה בראש extract.js.
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const value = window.__wordflowClipExtract;
      delete window.__wordflowClipExtract;
      return value || null;
    },
  });

  if (!result) throw new Error('חילוץ התוכן מהעמוד נכשל');
  if (!String(result.textContent || '').trim()) {
    // דף בלי טקסט ב-DOM הוא לרוב מסמך מוטמע שה-URL שלו לא נגמר ב-.pdf.
    // בודקים content-type לפני שמכריזים כישלון.
    try {
      const probe = await fetchTabBytes(tab.url);
      if (probe.contentType.includes('application/pdf')) {
        await clipPdfDocument(tab, user, probe.bytes);
        return;
      }
    } catch (err) {
      console.warn('[wordflow][clip] בדיקת PDF נכשלה:', err);
    }
  }
  if (!String(result.textContent || '').trim()) {
    // כולל אבחון: איזה מסלול ניסה ומה כל אחד החזיר. בלי זה "לא נמצא טקסט" חסר ערך.
    throw new Error(`לא נמצא טקסט בעמוד (${result.diag || 'ללא אבחון'})${result.error ? ` · ${result.error}` : ''}`);
  }
  console.info('[wordflow][clip] חולץ דרך', result.via, '·', result.diag);

  await writeTextClip({
    uid: user.uid,
    title: result.title,
    text: result.textContent || '',
    sourceUrl: result.url || tab.url,
    captureMode: 'page',
  });

  handleSuccess(tab.id);
}

// ---------- מצב 2: קליפת בחירה (טקסט מסומן) ----------
async function handleClipSelection(info, tab) {
  const user = await requireUser();
  const text = info.selectionText || '';
  if (!text.trim()) throw new Error('לא נמצא טקסט מסומן');

  await writeTextClip({
    uid: user.uid,
    title: tab.title || '',
    text,
    sourceUrl: tab.url,
    captureMode: 'selection',
  });

  handleSuccess(tab.id);
}

// ---------- מצב 3: קליפת תמונה ----------
async function fetchImageAsBytes(srcUrl) {
  const res = await fetch(srcUrl);
  if (!res.ok) throw new Error(`fetch נכשל: ${res.status}`);
  const buf = await res.arrayBuffer();
  const contentType = res.headers.get('content-type') || 'image/png';
  return { bytes: new Uint8Array(buf), contentType };
}

// נפילה חזרה: אם fetch מה-SW נכשל (CORS), מבקשים מהעמוד עצמו למשוך את התמונה (יש לו הרשאת same-origin)
async function fetchImageViaTab(tabId, srcUrl) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async (url) => {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      const contentType = res.headers.get('content-type') || 'image/png';
      // ArrayBuffer לא ניתן ל-serialize ישירות בכל הדפדפנים דרך executeScript — נמיר ל-base64
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return { base64: btoa(binary), contentType };
    },
    args: [srcUrl],
  });

  if (!result) throw new Error('חילוץ התמונה מהעמוד נכשל');
  const binary = atob(result.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, contentType: result.contentType };
}

async function handleClipImage(info, tab) {
  const user = await requireUser();
  const srcUrl = info.srcUrl;
  if (!srcUrl) throw new Error('לא נמצאה כתובת תמונה');

  let bytes;
  let contentType;
  try {
    ({ bytes, contentType } = await fetchImageAsBytes(srcUrl));
  } catch (err) {
    console.warn('[wordflow][image] fetch ישיר נכשל, מנסה מתוך הדף:', err);
    ({ bytes, contentType } = await fetchImageViaTab(tab.id, srcUrl));
  }

  await writeImageClip({
    uid: user.uid,
    title: tab.title || '',
    bytes,
    sourceUrl: srcUrl,
    captureMode: 'image',
    contentType,
  });

  handleSuccess(tab.id);
}

// ---------- מצב 4: קליפת אזור נבחר (צילום מסך + חיתוך) ----------
// state זמני לקישור בין הטריגר (context menu) לתשובת ה-content script
let pendingAreaSelect = null; // { tabId, resolve, reject }

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (pendingAreaSelect && message.type === 'wordflow-area-select-done') {
    pendingAreaSelect.resolve(message.rect);
    pendingAreaSelect = null;
    return;
  }
  if (pendingAreaSelect && message.type === 'wordflow-area-select-cancelled') {
    pendingAreaSelect.reject(new Error('בחירת האזור בוטלה'));
    pendingAreaSelect = null;
    return;
  }

  // הודעה מהפופאפ: "שלח את העמוד הנוכחי" (משתמשת באותה לוגיקה כמו תפריט ההקשר)
  if (message.type === 'wordflow-popup-send-page') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) throw new Error('לא נמצא טאב פעיל');
        await handleClipPage(tab);
        sendResponse({ ok: true });
      } catch (err) {
        console.error('[wordflow][popup] שגיאה בשליחת העמוד:', err);
        sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
      }
    })();
    return true; // תשובה אסינכרונית
  }
});

async function cropScreenshot(dataUrl, rect) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);

  const scale = rect.devicePixelRatio || 1;
  const sx = Math.round(rect.x * scale);
  const sy = Math.round(rect.y * scale);
  const sw = Math.round(rect.width * scale);
  const sh = Math.round(rect.height * scale);

  const canvas = new OffscreenCanvas(sw, sh);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);

  const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
  const buf = await croppedBlob.arrayBuffer();
  return new Uint8Array(buf);
}

async function handleClipArea(tab) {
  const user = await requireUser();

  // הזרקת שכבת הבחירה לפני צילום המסך (הצילום קורה רק אחרי שהמשתמש גורר וממשחרר)
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/areaSelectOverlay.js'],
  });

  const rect = await new Promise((resolve, reject) => {
    pendingAreaSelect = { tabId: tab.id, resolve, reject };
  });

  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  const bytes = await cropScreenshot(dataUrl, rect);

  await writeImageClip({
    uid: user.uid,
    title: `${tab.title || 'אזור נבחר'} (קטע)`,
    bytes,
    sourceUrl: tab.url,
    captureMode: 'area',
    contentType: 'image/png',
  });

  handleSuccess(tab.id);
}
