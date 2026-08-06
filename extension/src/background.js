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
    id: 'wordflow-clip-files',
    parentId: 'wordflow-root',
    title: 'קלוט את כל הקבצים בעמוד',
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
    case 'wordflow-clip-files':
      handleClipAllFiles(tab).catch((err) => handleFailure(tab.id, err));
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
// מאומץ מ-pdf-grabber (פרויקט oil price): נקודות קצה של PDF לרוב חסרות סיומת.
const PDF_URL_PATTERN = /\.pdf(?:[?#]|$)|[?&](?:type|format|mode|action)=[^&]*pdf|\/(?:download|getpdf|pdf)\b/i;

const isPdfBytes = (b) => b?.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;

async function fetchTabBytes(url) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`הורדת הקובץ נכשלה: ${res.status}`);
  const buf = await res.arrayBuffer();
  return { bytes: new Uint8Array(buf), contentType: res.headers.get('content-type') || '' };
}

/**
 * משיכה מתוך הדף עצמו (MAIN world) — שם ה-session, ה-Referer וכותרות האתר תקפים.
 * נקודות קצה כמו Moodle מחזירות דף התחברות ב-HTTP 200 למשיכה "עירומה", ולכן
 * בודקים את מספר הקסם %PDF- ומזהים דף התחברות במקום לשמור HTML בשם .pdf.
 * מאומץ מ-pdf-grabber/background.js refetchInTab.
 */
async function fetchPdfViaTab(tabId, url) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [url],
      func: async (target) => {
        const r = await fetch(target, { credentials: 'include' });
        if (!r.ok) return null;
        const buf = new Uint8Array(await r.arrayBuffer());
        const isPdf = buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
        let s = '';
        for (let i = 0; i < buf.length; i += 0x8000) {
          s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        }
        // s הוא latin1 של הבייטים — התאמה לסמנים ASCII בלבד.
        const looksLikeLogin = !isPdf && /login|sign[- ]?in|authenticate|password|התחבר/i.test(s.slice(0, 20000));
        return { isPdf, looksLikeLogin, data: isPdf ? btoa(s) : '' };
      },
    });
    return res?.result || null;
  } catch {
    return null; // אין גישה ללשונית (צופה PDF פנימי, chrome://) — הקורא ינסה מסלול אחר
  }
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * משיכת קובץ כלשהו מתוך הדף, עם אימות סוג. עוקב אחרי הפניות (Moodle
 * /mod/resource/view.php מפנה ל-pluginfile), ולכן מחזיר גם את ה-URL הסופי.
 * מחזיר null כשאין גישה ללשונית.
 */
async function fetchFileViaTab(tabId, url) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [url],
      func: async (target) => {
        const r = await fetch(target, { credentials: 'include' });
        if (!r.ok) return { ok: false, status: r.status };
        const buf = new Uint8Array(await r.arrayBuffer());
        const isPdf = buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
        // docx/pptx/xlsx הם ZIP — מספר הקסם PK\x03\x04
        const isZip = buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
        let s = '';
        for (let i = 0; i < buf.length; i += 0x8000) {
          s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        }
        const looksLikeLogin = !isPdf && !isZip
          && /login|sign[- ]?in|authenticate|password/i.test(s.slice(0, 20000));
        return {
          ok: true,
          isPdf,
          isZip,
          looksLikeLogin,
          finalUrl: r.url || target,
          contentType: r.headers.get('content-type') || '',
          disposition: r.headers.get('content-disposition') || '',
          data: (isPdf || isZip) ? btoa(s) : '',
        };
      },
    });
    return res?.result || null;
  } catch {
    return null;
  }
}

// ---------- קליטת כל הקבצים בעמוד (דף קורס עם הרבה מסמכים) ----------
const CONTENT_TYPE_EXT = [
  ['application/pdf', 'pdf'],
  ['wordprocessingml', 'docx'],
  ['presentationml', 'pptx'],
  ['spreadsheetml', 'xlsx'],
];

function resolveFileName(link, probe) {
  const fromDisposition = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(probe.disposition || '');
  if (fromDisposition) {
    try { return decodeURIComponent(fromDisposition[1]); } catch { return fromDisposition[1]; }
  }
  const fromUrl = fileNameFromUrl(probe.finalUrl || link.url, '');
  if (fromUrl && /\.[a-z0-9]{2,5}$/i.test(fromUrl)) return fromUrl;
  // אין שם בהפניה ולא ב-URL: גוזרים סיומת מ-content-type ומשתמשים בטקסט הקישור.
  const ct = String(probe.contentType || '').toLowerCase();
  const ext = (CONTENT_TYPE_EXT.find(([needle]) => ct.includes(needle)) || [null, probe.isPdf ? 'pdf' : 'bin'])[1];
  const base = String(link.title || 'קובץ').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80) || 'קובץ';
  return `${base}.${ext}`;
}

async function handleClipAllFiles(tab) {
  const user = await requireUser();

  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/scanLinks.js'] });
  const [{ result: scan }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const value = window.__wordflowClipLinks;
      delete window.__wordflowClipLinks;
      return value || null;
    },
  });

  const links = scan?.links || [];
  if (!links.length) throw new Error('לא נמצאו קישורים לקבצים בעמוד');

  flashBadge(tab.id, String(links.length), '#2563eb', 4000);

  let saved = 0;
  const skipped = [];
  for (const link of links) {
    try {
      const probe = await fetchFileViaTab(tab.id, link.url);
      if (!probe?.ok) { skipped.push(`${link.title || link.url}: לא נגיש`); continue; }
      if (!probe.isPdf && !probe.isZip) {
        // דף HTML (ניווט/התחברות) ולא קובץ — מדלגים בשקט, זה הרוב בדף קורס.
        if (probe.looksLikeLogin) skipped.push(`${link.title || link.url}: נדרשת התחברות`);
        continue;
      }
      const fileName = resolveFileName(link, probe);
      await writeFileClip({
        uid: user.uid,
        title: link.title || fileName,
        bytes: base64ToBytes(probe.data),
        fileName,
        sourceUrl: probe.finalUrl || link.url,
        captureMode: 'page-files',
        contentType: probe.isPdf ? 'application/pdf' : 'application/octet-stream',
      });
      saved += 1;
      flashBadge(tab.id, `${saved}`, '#2563eb', 2000);
    } catch (err) {
      console.warn('[wordflow][files] דילוג על', link.url, err);
      skipped.push(`${link.title || link.url}: ${err?.message || err}`);
    }
  }

  console.info(`[wordflow][files] נשלחו ${saved} קבצים · דילוגים:`, skipped);
  if (!saved) throw new Error('לא נמצא אף קובץ שניתן להוריד בעמוד');
  handleSuccess(tab.id);
  return { saved, skipped };
}

/** מחזיר בייטים של PDF מאומתים, או זורק שגיאה מדויקת. */
async function resolvePdfBytes(tab) {
  const viaTab = await fetchPdfViaTab(tab.id, tab.url);
  if (viaTab?.isPdf) return base64ToBytes(viaTab.data);
  if (viaTab && !viaTab.isPdf) {
    throw new Error(viaTab.looksLikeLogin
      ? 'השרת החזיר דף התחברות במקום קובץ — יש להתחבר לאתר בדפדפן ולנסות שוב'
      : 'השרת החזיר דף ולא PDF');
  }

  // הדף לא נגיש להזרקה (הצופה הפנימי של Chrome) — משיכה מה-service worker.
  // מותרת כי activeTab מעניק הרשאת מארח זמנית ללשונית הפעילה.
  const direct = await fetchTabBytes(tab.url);
  if (!isPdfBytes(direct.bytes)) {
    throw new Error('מה שהתקבל אינו PDF תקין');
  }
  return direct.bytes;
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
    await clipPdfDocument(tab, user, await resolvePdfBytes(tab));
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
      if (probe.contentType.includes('application/pdf') || isPdfBytes(probe.bytes)) {
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

  // הודעה מהפופאפ: "קלוט את כל הקבצים בעמוד"
  if (message.type === 'wordflow-popup-send-files') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) throw new Error('לא נמצא טאב פעיל');
        const res = await handleClipAllFiles(tab);
        sendResponse({ ok: true, saved: res.saved, skipped: res.skipped });
      } catch (err) {
        console.error('[wordflow][popup] שליחת הקבצים נכשלה:', err);
        sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
      }
    })();
    return true;
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
