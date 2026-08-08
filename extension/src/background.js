// background.js — Service worker MV3: תפריטי הקשר, אורקסטרציה של כל מצבי הקליפה, כתיבה ל-Firebase.
import { getCachedUser, watchAuthState } from './lib/auth.js';
import { writeTextClip, writeImageClip, writeFileClip } from './lib/clipWriter.js';
import { CLIPPER_BUILD_LABEL } from './lib/build.js';

// נרשם בכל טעינה של ה-SW — השורה הראשונה בקונסולה אומרת איזה build רץ.
console.info(`[wordflow] Clipper ${chrome.runtime.getManifest?.().version || ''} · ${CLIPPER_BUILD_LABEL}`);

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
  sweepStaleState();
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
// ⚠️ ב-MV3 ה-service worker נהרג בין אירועים, ואז ה-setTimeout שמנקה את הבדג'
// לעולם לא רץ — הבדג' נתקע על האייקון עד לריסטרט הדפדפן. לכן מלבד ה-timeout
// (מסלול מהיר כשה-SW חי) נרשם מועד תפוגה ב-storage.session, וכל נקודת כניסה
// לתוסף מנקה בדג'ים שפג תוקפם. גם ניווט בלשונית מנקה את הבדג' שלה.
// לא משתמשים ב-chrome.alarms כדי לא להוסיף הרשאה חדשה למניפסט (סקירת חנות).
const badgeKey = (tabId) => `wordflow_badge_${tabId}`;
const badgeTimers = new Map();

async function sweepStaleBadges() {
  try {
    const all = await chrome.storage.session.get(null);
    const now = Date.now();
    const dead = [];
    for (const [key, expiresAt] of Object.entries(all || {})) {
      if (!key.startsWith('wordflow_badge_')) continue;
      if (typeof expiresAt === 'number' && expiresAt > now) continue;
      dead.push(key);
      const tabId = Number(key.slice('wordflow_badge_'.length));
      if (Number.isFinite(tabId)) {
        try { chrome.action.setBadgeText({ text: '', tabId }); } catch { /* הלשונית נסגרה */ }
      }
    }
    if (dead.length) await chrome.storage.session.remove(dead);
  } catch { /* אין storage.session — הבדג' פשוט יישאר */ }
}

function flashBadge(tabId, text, color, ms = 2500) {
  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color, tabId });
  chrome.storage.session.set({ [badgeKey(tabId)]: Date.now() + ms }).catch(() => {});
  clearTimeout(badgeTimers.get(tabId));
  badgeTimers.set(tabId, setTimeout(() => {
    badgeTimers.delete(tabId);
    chrome.action.setBadgeText({ text: '', tabId });
    chrome.storage.session.remove(badgeKey(tabId)).catch(() => {});
  }, ms));
}

// ניווט בלשונית = "הפעולה הבאה" — מנקה את הבדג' שנשאר מהפעולה הקודמת.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'loading') return;
  clearTimeout(badgeTimers.get(tabId));
  badgeTimers.delete(tabId);
  try { chrome.action.setBadgeText({ text: '', tabId }); } catch { /* נסגרה */ }
  chrome.storage.session.remove(badgeKey(tabId)).catch(() => {});
});

/** ניקיון שרץ בכל נקודת כניסה: בדג'ים תקועים + בחירות אזור נטושות. */
function sweepStaleState() {
  sweepStaleBadges();
  sweepStaleAreaSelects();
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
//
// ⚠️ **הבאג שהרג את קליפת הטקסט**: הגרסה הקודמת השתמשה ב-`\/(?:download|getpdf|pdf)\b`,
// ו-`\b` תופס מילה *באמצע* הנתיב. כך `wiki/PDF`, `docs/PDF/manual.html`,
// `/pdf-guide/intro`, `/download/index.html` ו-`/download.aspx?id=5` כולם סווגו PDF,
// handleClipPage נכנס לענף ה-PDF, resolvePdfBytes זרק — ו-Readability מעולם לא רץ.
// עכשיו: סיומת .pdf בסוף הנתיב · פרמטר שאילתה pdf-י · forcedownload=1 · או
// **סגמנט נתיב אחרון** download/getpdf (תיקייה בשם /pdf/ אינה נחשבת).
// `pdf` כסגמנט בודד הוסר בכוונה — הוא תפס את ערך wikipedia.
const PDF_URL_PATTERN = /\.pdf(?:[?#]|$)|[?&](?:type|format|mode|action)=[^&]*pdf|[?&]forcedownload=1|\/(?:download|getpdf)(?:[?#]|$)/i;

// זיהוי הפופאפ חייב להיות שמרני עוד יותר: כאן טעות נועלת את הממשק על מצב PDF.
// רק סיומת .pdf אמיתית בסוף הנתיב.
const PDF_URL_STRICT = /\.pdf(?:[?#]|$)/i;

const isPdfBytes = (b) => b?.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;

async function fetchTabBytes(url) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`הורדת הקובץ נכשלה: ${res.status}`);
  const buf = await res.arrayBuffer();
  return { bytes: new Uint8Array(buf), contentType: res.headers.get('content-type') || '' };
}

/**
 * משיכת PDF מתוך הדף עצמו (MAIN world) — שם ה-session, ה-Referer וכותרות האתר תקפים.
 *
 * ⚠️ בעבר הייתה כאן פונקציה מוזרקת *שנייה* עם זיהוי התחברות רופף
 * (`/login|sign[- ]?in|password|התחבר/` על 20KB הראשונים) — כל דף Moodle מכיל את
 * המילים האלה, ולכן כישלון רגיל אובחן כ"נדרשת התחברות". שתי הפונקציות המוזרקות
 * לא יכולות לחלוק closure, ולכן הפתרון הוא שיתוף *הפונקציה עצמה*: כאן רק עוטפים
 * את fetchFileViaTab, שכבר מחזיק את isLoginPage המבני היחיד.
 */
async function fetchPdfViaTab(tabId, url) {
  const res = await fetchFileViaTab(tabId, url);
  if (!res) return null;
  if (!res.ok) return { isPdf: false, looksLikeLogin: false, data: '', status: res.status };
  return {
    isPdf: !!res.isPdf,
    looksLikeLogin: !!res.looksLikeLogin,
    contentType: res.contentType || '',
    finalUrl: res.finalUrl || url,
    data: res.isPdf ? res.data : '',
  };
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
 *
 * ⚠️ שני מקרים שהפילו קליטה של דף קורס אמיתי:
 * 1. **דף עטיפה של Moodle** — משאב עם display=auto/page/frame מחזיר HTML שבתוכו
 *    הקישור האמיתי (pluginfile.php), לפעמים כ-meta refresh או iframe. בעבר ויתרנו
 *    עליו. עכשיו מחלצים את ה-URL המוטמע ומושכים אותו — **קפיצה אחת בלבד**.
 * 2. **זיהוי התחברות רגיש מדי** — ערכות נושא של Moodle מכילות טופס התחברות מוסתר
 *    (drawer/בלוק) גם למשתמש מחובר. לכן שדה סיסמה לבדו אינו מספיק: נדרש גם
 *    טופס שה-action/id שלו הוא login, או שה-URL הסופי הוא נתיב התחברות.
 */
async function fetchFileViaTab(tabId, url) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [url],
      func: async (target) => {
        // כל העזרים חייבים לחיות כאן: הפונקציה מוזרקת לעולם של הדף בלי closure.
        const FILE_LIKE = /\.(pdf|docx?|pptx?|xlsx?|txt|rtf|csv)(?:[?#]|$)|pluginfile\.php|forcedownload=1|[?&](?:type|format|mode|action)=[^&]*(?:pdf|doc|ppt|xls)|\/(?:download|getpdf|pdf)\b/i;

        const decodeEntities = (t) => String(t || '')
          .replace(/&#x2f;/gi, '/')
          .replace(/&#0*47;/g, '/')
          .replace(/&quot;/gi, '"')
          .replace(/&apos;|&#0*39;/gi, "'")
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
          .replace(/&#0*38;|&amp;/gi, '&'); // אחרון: כדי לא לפרק ישויות מקוננות פעמיים

        const grab = async (u) => {
          const r = await fetch(u, { credentials: 'include' });
          const finalUrl = r.url || u;
          if (!r.ok) return { ok: false, status: r.status, finalUrl };
          const buf = new Uint8Array(await r.arrayBuffer());
          let s = '';
          for (let i = 0; i < buf.length; i += 0x8000) {
            s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
          }
          return {
            ok: true,
            // docx/pptx/xlsx הם ZIP — מספר הקסם PK\x03\x04
            isPdf: buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46,
            isZip: buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04,
            s,
            finalUrl,
            contentType: r.headers.get('content-type') || '',
            disposition: r.headers.get('content-disposition') || '',
          };
        };

        // ⚠️ לא לחפש "login"/"password" סתם בטקסט: בדף קורס של Moodle יש קישור
        // "התחברות" בכל עמוד. גם שדה סיסמה לבדו לא מספיק (טופס מוסתר בערכת הנושא).
        const isLoginPage = (head, finalUrl) => {
          if (/\/login\/index\.php|\/auth\/login|\/login\/?(?:[?#]|$)|saml2?\/login|adfs\/ls|\/idp\/|\/sso\/|\/oauth2?\/authorize/i.test(finalUrl)) return true;
          const hasPassword = /<input[^>]+type\s*=\s*["']?password/i.test(head)
            || /<input[^>]+name\s*=\s*["']?(?:password|passwd|pwd)["'\s/>]/i.test(head);
          if (!hasPassword) return false;
          return /<form[^>]+(?:action\s*=\s*["']?[^"'>]*(?:login|auth|signin|sso)|id\s*=\s*["']?login)/i.test(head);
        };

        // ⚠️ **הבאג שהפיל 7/7 משאבים**: דף עטיפה של Moodle מלא ב-pluginfile.php
        // שהם *תמונות* — אווטאר משתמש, תמונת קורס, נכסי ערכת נושא. "ה-pluginfile
        // הראשון בגוף" קפץ תמיד לאווטאר, וכל משאב נדחה כ"תמונה". לכן: אוספים את
        // **כל** המועמדים, מסננים את הכרום של הדף, מדרגים, ומנסים עד 3.
        const DOC_EXT = /\.(pdf|docx?|pptx?|xlsx?)(?:[?#]|$)/i;
        const IMG_EXT = /\.(png|jpe?g|gif|svg|webp|ico|bmp|avif|tiff?)(?:[?#]|$)/i;
        // נתיבי "כרום" של Moodle תחת pluginfile — לעולם לא המשאב עצמו
        const CHROME_PATH = /\/(?:user\/icon|user|course\/overviewfiles|theme|blocks)\//i;
        const DOC_CT = /application\/pdf|wordprocessingml|presentationml|spreadsheetml/i;

        const collectCandidates = (html, baseUrl) => {
          const abs = (raw) => {
            const v = decodeEntities(raw).trim().replace(/^["']|["']$/g, '');
            if (!v || /^(?:#|javascript:|mailto:|data:|about:)/i.test(v)) return '';
            try {
              const u = new URL(v, baseUrl);
              return /^https?:$/.test(u.protocol) ? u.href : '';
            } catch { return ''; }
          };

          const out = [];
          const add = (u, rank) => {
            if (!u) return;
            const isPlugin = /pluginfile\.php/i.test(u);
            if (IMG_EXT.test(u)) return;                     // תמונה — לא משאב
            if (isPlugin && CHROME_PATH.test(u)) return;     // אווטאר/תמונת קורס/ערכת נושא
            const hit = out.find((c) => c.url === u);
            if (hit) { if (rank < hit.rank) hit.rank = rank; return; }
            out.push({ url: u, rank, seq: out.length });
          };

          // דרגה 1 — המטען האמיתי: mod_resource/content, סיומת מסמך, forcedownload
          const payloadRank = (u) => (
            /pluginfile\.php\/[^\s"']*\/mod_resource\/content\//i.test(u)
            || DOC_EXT.test(u)
            || /[?&]forcedownload=1/i.test(u) ? 1 : 0);

          // כל ה-pluginfile בגוף (כולל בתוך JS) — מדורגים 1 או 4, לא "ראשון מנצח"
          const pluginRe = /(?:https?:\/\/)?[^\s"'<>()\\=]*pluginfile\.php\/[^\s"'<>()\\]*/gi;
          for (const m of html.match(pluginRe) || []) {
            const u = abs(m);
            add(u, payloadRank(u) || 4);
          }

          // דרגה 2 — יעדים מבניים: object/iframe/embed, ואז <a href> שנראה כמו קובץ
          for (const tag of html.match(/<(?:iframe|embed|object)\b[^>]*>/gi) || []) {
            const attr = /\b(?:src|data)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
            const u = attr && abs(attr[1] || attr[2] || attr[3] || '');
            if (u && FILE_LIKE.test(u)) add(u, payloadRank(u) || 2);
          }
          for (const tag of html.match(/<a\b[^>]*>/gi) || []) {
            const attr = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
            const u = attr && abs(attr[1] || attr[2] || attr[3] || '');
            if (u && FILE_LIKE.test(u)) add(u, payloadRank(u) || 2);
          }

          // דרגה 3 — meta refresh
          const meta = /<meta[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/i.exec(html)
            || /<meta[^>]*content\s*=\s*["'][^"']*url\s*=[^"']*["'][^>]*>/i.exec(html);
          if (meta) {
            const content = /content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(meta[0]);
            const raw = content && (content[1] || content[2] || content[3] || '');
            const target2 = raw && /url\s*=\s*(.+)$/i.exec(raw.trim());
            if (target2) { const u = abs(target2[1]); add(u, payloadRank(u) || 3); }
          }

          return out.sort((a, b) => a.rank - b.rank || a.seq - b.seq).map((c) => c.url);
        };

        // ⚠️ content-type לבדו אינו הוכחה: שרתים (ובעיקר Moodle/EZproxy) מגישים דף
        // שגיאה או דף ניווט עם `application/pdf`. בלי הבדיקה הזו ה-HTML נשמר כ-.pdf
        // ומדווח "נשלח" — קובץ פגום שהאפליקציה לא תצליח לחלץ.
        const looksLikeMarkup = (s) => /^\s*(?:<!doctype|<html|<\?xml|<head|<body|<)/i.test(String(s || '').slice(0, 200));

        const pack = (res, extra) => {
          const isDoc = res.isPdf || res.isZip
            || (!!res.contentType && DOC_CT.test(res.contentType) && !looksLikeMarkup(res.s));
          return Object.assign({
            ok: true,
            isPdf: res.isPdf,
            isZip: res.isZip,
            isDoc,
            looksLikeLogin: !isDoc && isLoginPage(res.s.slice(0, 60000), res.finalUrl),
            finalUrl: res.finalUrl,
            contentType: res.contentType,
            disposition: res.disposition,
            data: isDoc ? btoa(res.s) : '',
          }, extra || {});
        };

        const first = await grab(target);
        if (!first.ok) return { ok: false, status: first.status, finalUrl: first.finalUrl };
        if (first.isPdf || first.isZip) return pack(first);

        // ⚠️ הקפיצה קודמת להכרעת ההתחברות, ובכוונה: ערכות נושא של Moodle מרנדרות
        // טופס התחברות אמיתי במגירה גם למשתמש מחובר, ולכן isLoginPage לבדו עדיין
        // היה חוסם. דף התחברות אמיתי לעולם אינו מכיל מועמד מסמך — אז אם נמצא קובץ
        // מוטמע, הוא התשובה. **קפיצה אחת בלבד**: כל המועמדים נאספים מדף העטיפה
        // הראשון, ותוצאת קפיצה לעולם אינה מייצרת מועמדים חדשים.
        const firstLogin = isLoginPage(first.s.slice(0, 60000), first.finalUrl);
        const candidates = collectCandidates(first.s.slice(0, 400000), first.finalUrl)
          .filter((u) => u !== first.finalUrl && u !== target)
          .slice(0, 3);
        if (!candidates.length) return pack(first, { candidates: [] });

        let lastRes = null;
        let lastUrl = '';
        for (const u of candidates) {
          let res2 = null;
          try { res2 = await grab(u); } catch { res2 = null; }
          if (!res2 || !res2.ok) continue;
          lastRes = res2;
          lastUrl = u;
          const ct = String(res2.contentType || '').toLowerCase();
          if (res2.isPdf || res2.isZip
            || (DOC_CT.test(ct) && !ct.includes('image/') && !looksLikeMarkup(res2.s))) {
            return pack(res2, { wrapperUrl: u, viaWrapper: true, candidates });
          }
          // תמונה/HTML — ממשיכים למועמד הבא במקום להיכשל
        }

        // אף מועמד לא אימת קובץ. אם הדף הראשון היה באמת דף התחברות — זו הסיבה
        // המדויקת יותר. אחרת מדווחים על היעד האחרון, שם רואים מארח חיצוני.
        return firstLogin || !lastRes
          ? pack(first, { candidates, wrapperUrl: candidates[0] })
          : pack(lastRes, { candidates, wrapperUrl: lastUrl, viaWrapper: true });
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
  ['msword', 'doc'],
  ['ms-powerpoint', 'ppt'],
  ['ms-excel', 'xls'],
  ['opendocument.text', 'odt'],
  ['rtf', 'rtf'],
  ['text/csv', 'csv'],
  ['text/plain', 'txt'],
];

// ⚠️ **הבאג**: `/\.[a-z0-9]{2,5}$/` עובר על `view.php`, ולכן משאב Moodle שמוגש
// ישירות מ-view.php הועלה בשם "view.php" — והאפליקציה מחלצת לפי הסיומת, כלומר
// הקובץ נשמר ולא נקרא לעולם. שם מה-URL מתקבל רק אם סיומתו ברשימה מוכרת.
const KNOWN_FILE_EXT = /\.(pdf|docx?|pptx?|xlsx?|txt|rtf|csv|odt|ods|odp|epub|zip|png|jpe?g|gif|webp|bmp|tiff?|svg)$/i;
// סיומות של סקריפט שרת — לעולם לא שם קובץ אמיתי, וגם לא בסיס טוב לשם.
const SCRIPT_EXT = /\.(php\d?|aspx?|jsp|jspx|cgi|do|action|html?|xhtml)$/i;

function sanitizeFileName(value) {
  return String(value || '').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function extFromContentType(probe) {
  const ct = String(probe.contentType || '').toLowerCase();
  const hit = CONTENT_TYPE_EXT.find(([needle]) => ct.includes(needle));
  if (hit) return hit[1];
  if (probe.isPdf) return 'pdf';
  if (probe.isZip) return 'zip';
  return 'bin';
}

function resolveFileName(link, probe) {
  const fromDisposition = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(probe.disposition || '');
  let base = '';
  if (fromDisposition) {
    try { base = decodeURIComponent(fromDisposition[1]); } catch { base = fromDisposition[1]; }
  }
  if (!base) base = fileNameFromUrl(probe.finalUrl || link.url, '');
  base = sanitizeFileName(base);
  if (base && KNOWN_FILE_EXT.test(base)) return base;

  // אין סיומת שימושית: גוזרים אותה מה-content-type ובוחרים בסיס קריא.
  const stem = (base && !SCRIPT_EXT.test(base) ? base.replace(/\.[a-z0-9]{1,8}$/i, '') : '')
    || sanitizeFileName(link.title)
    || 'קובץ';
  return `${stem.slice(0, 80)}.${extFromContentType(probe)}`;
}

/**
 * סריקת הקישורים בעמוד בלבד — בלי הורדה. מחזיר {pageTitle, links}.
 * ⚠️ שתי קריאות executeScript בכוונה: esbuild עוטף ב-IIFE וערך ההחזרה
 * של הזרקת {files} תמיד undefined (ר' scanLinks.js). הקריאה השנייה קוראת
 * את הגלובל ומוחקת אותו.
 * רשימה ריקה אינה שגיאה — הפופאפ מציג מצב "לא נמצאו קבצים".
 */
async function scanPageFiles(tab) {
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/scanLinks.js'] });
  const [{ result: scan }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const value = window.__wordflowClipLinks;
      delete window.__wordflowClipLinks;
      return value || null;
    },
  });

  return { pageTitle: scan?.pageTitle || tab.title || '', links: scan?.links || [] };
}

const TAB_CHANGED_MSG = 'הדף השתנה — פתח מחדש את החלון ונסה שוב';
const NO_TAB_ACCESS_MSG = 'אין גישה לדף — רענן את הלשונית ונסה שוב';
const LOGIN_MSG = 'נדרשת התחברות לאתר';

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./i, ''); } catch { return ''; }
}

/**
 * המארח שאליו נחתה הבקשה, רק אם הוא שונה מזה של הדף. ההפרש הזה הוא כל ההסבר
 * במקרה של הפניה ל-SSO/מו"ל/EZproxy — בלעדיו "נדרשת התחברות" נראה כמו באג.
 */
function foreignHost(probe, pageHost) {
  const h = hostOf(probe?.finalUrl || '');
  return h && h !== pageHost ? h : '';
}

function loginReason(probe, pageHost) {
  const h = foreignHost(probe, pageHost);
  return h ? `${LOGIN_MSG} (${h})` : LOGIN_MSG;
}

/**
 * הסיבה שמוצגת כשהמשיכה הצליחה אבל מה שחזר אינו קובץ.
 * ⚠️ זו הסיבה הנפוצה ביותר בדף קורס — היא חייבת להיות מובנת, לא "אינו קובץ".
 */
function notAFileReason(probe, pageHost = '') {
  const ct = String(probe.contentType || '').toLowerCase();
  const foreign = foreignHost(probe, pageHost);
  // דף עטיפה שהיו בו מועמדים ואף אחד לא אימת קובץ — הסיבה המדויקת. בלי זה
  // המשתמש רואה "תמונה" (ה-content-type של המועמד האחרון) וזה מטעה.
  if (probe.candidates && probe.candidates.length) {
    return foreign ? `לא נמצא קובץ בתוך הדף (${foreign})` : 'לא נמצא קובץ בתוך הדף';
  }
  if (ct.includes('text/html') || ct.includes('application/xhtml') || !ct) {
    return foreign ? `לא קובץ (דף אינטרנט ב-${foreign})` : 'לא קובץ (כנראה דף אינטרנט)';
  }
  if (ct.includes('image/')) return 'לא קובץ מסמך (תמונה)';
  if (ct.includes('video/') || ct.includes('audio/')) return 'לא קובץ מסמך (מדיה)';
  return `לא קובץ נתמך (${ct.split(';')[0]})${foreign ? ` — ${foreign}` : ''}`;
}

// Moodle: תיקייה היא דף אחד עם N קבצים. "קפיצה" רגילה מחזירה את הראשון בלבד.
const FOLDER_RESOURCE = /\/mod\/folder\/view\.php/i;
const FOLDER_FILE_CAP = 20;

/**
 * אוסף את *כל* קישורי ה-pluginfile מדף תיקייה של Moodle (לא רק הראשון).
 * ⚠️ הלוגיקה משוכפלת מ-collectCandidates בכוונה: פונקציה מוזרקת רצה ב-MAIN world
 * בלי closure, ואי אפשר לחלוק עזרים בין שתי הזרקות.
 */
async function scanFolderCandidates(tabId, url) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [url, FOLDER_FILE_CAP],
      func: async (target, cap) => {
        const r = await fetch(target, { credentials: 'include' });
        if (!r.ok) return [];
        const html = await r.text();
        const IMG_EXT = /\.(png|jpe?g|gif|svg|webp|ico|bmp|avif|tiff?)(?:[?#]|$)/i;
        const CHROME_PATH = /\/(?:user\/icon|user|course\/overviewfiles|theme|blocks)\//i;
        const re = /(?:https?:\/\/)?[^\s"'<>()\\=]*pluginfile\.php\/[^\s"'<>()\\]*/gi;
        const seen = new Set();
        const out = [];
        for (const raw of html.match(re) || []) {
          let href = '';
          try {
            href = new URL(String(raw).replace(/&amp;/gi, '&'), r.url || target).href;
          } catch { continue; }
          if (!/^https?:/i.test(href) || IMG_EXT.test(href) || CHROME_PATH.test(href)) continue;
          if (seen.has(href)) continue;
          seen.add(href);
          let name = '';
          try { name = decodeURIComponent(new URL(href).pathname.split('/').filter(Boolean).pop() || ''); } catch { name = ''; }
          out.push({ url: href, title: name });
          if (out.length >= cap) break;
        }
        return out;
      },
    });
    return res?.result || [];
  } catch {
    return [];
  }
}

/** כתיבת קליפ אחד מתוך probe מאומת. מחזיר את שם הקובץ שנשמר. */
async function saveProbedFile(user, link, probe, captureMode = 'page-files') {
  const fileName = resolveFileName(link, probe);
  // ⚠️ בעבר נכתב תמיד application/octet-stream לכל מה שאינו PDF — docx/pptx איבדו
  // את הסוג האמיתי שלהם. מעבירים את ה-content-type שהשרת הצהיר עליו כשהוא שפוי.
  const declared = String(probe.contentType || '').split(';')[0].trim();
  const contentType = declared && !/^(?:text\/html|application\/xhtml)/i.test(declared)
    ? declared
    : (probe.isPdf ? 'application/pdf' : 'application/octet-stream');
  await writeFileClip({
    uid: user.uid,
    title: link.title || fileName,
    bytes: base64ToBytes(probe.data),
    fileName,
    sourceUrl: probe.finalUrl || link.url,
    captureMode,
    contentType,
  });
  return fileName;
}

/**
 * הורדה סדרתית של רשימת קישורים. onItem נקרא לכל פריט עם
 * {index, url, title, status: 'saved'|'skipped'|'login'|'error', fileName, reason}.
 * ⚠️ הרשאת activeTab נשללת ברגע שהלשונית מנווטת — לכן בודקים את ה-URL לפני
 * כל משיכה ועוצרים במקום להיכשל בשקט על כל שאר הקבצים.
 * shouldCancel נבדק בכל איטרציה: "סרוק שוב" באמצע עבודה חייב לעצור אותה באמת,
 * אחרת הלולאה ממשיכה לכתוב את מצב העבודה חזרה ל-storage ומריצה כפילויות.
 */
async function downloadFiles(tab, links, onItem = () => {}, shouldCancel = () => false) {
  const user = await requireUser();
  const startUrl = tab.url;
  const pageHost = hostOf(startUrl || '');

  let saved = 0;
  const skipped = [];
  let aborted = false;
  let cancelled = false;

  for (let index = 0; index < links.length; index += 1) {
    const link = links[index];
    const emit = (status, extra = {}) => {
      onItem({ index, url: link.url, title: link.title || '', status, ...extra });
    };

    if (shouldCancel()) { cancelled = true; break; }

    if (!aborted) {
      try {
        const current = await chrome.tabs.get(tab.id);
        if (current?.url && startUrl && current.url !== startUrl) aborted = true;
      } catch {
        aborted = true; // הלשונית נסגרה
      }
    }
    if (aborted) {
      skipped.push(`${link.title || link.url}: ${TAB_CHANGED_MSG}`);
      emit('error', { reason: TAB_CHANGED_MSG });
      continue;
    }

    try {
      // תיקיית Moodle: כל הקבצים שבתוכה, לא רק הראשון.
      if (FOLDER_RESOURCE.test(link.url)) {
        const folder = await downloadFolderFiles(tab, user, link, shouldCancel);
        if (folder) {
          saved += folder.saved;
          if (folder.saved) {
            emit('saved', {
              fileName: folder.total > 1 ? `${folder.saved} קבצים מהתיקייה` : folder.firstName,
              reason: folder.failed ? `${folder.failed} מתוך ${folder.total} לא נקלטו` : '',
            });
          } else {
            const reason = folder.lastReason || 'לא נמצא קובץ בתוך התיקייה';
            skipped.push(`${link.title || link.url}: ${reason}`);
            emit('skipped', { reason });
          }
          continue;
        }
        // אין מועמדים בתיקייה — נופלים למסלול הרגיל (אולי זו בכלל לא תיקייה).
      }

      const probe = await fetchFileViaTab(tab.id, link.url);
      if (!probe) {
        // executeScript נכשל — אין גישה ללשונית (chrome://, צופה PDF פנימי, דף שנסגר)
        skipped.push(`${link.title || link.url}: ${NO_TAB_ACCESS_MSG}`);
        emit('skipped', { reason: NO_TAB_ACCESS_MSG });
        continue;
      }
      if (!probe.ok) {
        const reason = probe.status
          ? `השרת דחה את הבקשה (${probe.status}${probe.status === 403 || probe.status === 401 ? ' — נדרשת התחברות' : ''})`
          : 'הקובץ לא נגיש';
        skipped.push(`${link.title || link.url}: ${reason}`);
        emit('skipped', { reason });
        continue;
      }
      if (probe.candidates && probe.candidates.length) {
        console.info(
          '[wordflow][files] מועמדים בדף עטיפה עבור', link.title || link.url, '→',
          probe.candidates.map((u) => (u.length > 140 ? `${u.slice(0, 140)}…` : u)),
        );
      }
      if (!probe.isPdf && !probe.isZip && !probe.isDoc) {
        // דף HTML (ניווט/התחברות) ולא קובץ — הרוב בדף קורס. הסיבה מוצגת למשתמש,
        // כולל המארח שאליו נחתה הבקשה כשהוא שונה מהדף (SSO/מו"ל/EZproxy).
        if (probe.looksLikeLogin) {
          const reason = loginReason(probe, pageHost);
          skipped.push(`${link.title || link.url}: ${reason}`);
          emit('login', { reason });
        } else {
          // ⚠️ זו הקטגוריה הנפוצה ביותר — בעבר היא לא נרשמה ב-skipped ולכן
          // ערך ההחזרה והלוג של תפריט ההקשר החמיצו בדיוק את מה שקרה בפועל.
          const reason = notAFileReason(probe, pageHost);
          skipped.push(`${link.title || link.url}: ${reason}`);
          emit('skipped', { reason });
        }
        continue;
      }
      if (probe.viaWrapper) {
        console.info('[wordflow][files] דף עטיפה — הקובץ נמשך מ-', probe.finalUrl);
      }
      const fileName = await saveProbedFile(user, link, probe);
      saved += 1;
      flashBadge(tab.id, `${saved}`, '#2563eb', 2000);
      emit('saved', { fileName });
    } catch (err) {
      console.warn('[wordflow][files] דילוג על', link.url, err);
      const reason = String(err?.message || err);
      skipped.push(`${link.title || link.url}: ${reason}`);
      emit('error', { reason });
    }
  }

  return { saved, skipped, cancelled };
}

/**
 * קליטת כל הקבצים שבתוך תיקיית Moodle אחת. מחזיר null כשאין מועמדים בכלל
 * (ואז הקורא ממשיך במסלול הרגיל של קפיצה בודדת).
 */
async function downloadFolderFiles(tab, user, link, shouldCancel = () => false) {
  const entries = await scanFolderCandidates(tab.id, link.url);
  if (!entries.length) return null;

  let saved = 0;
  let failed = 0;
  let firstName = '';
  let lastReason = '';

  for (const entry of entries) {
    if (shouldCancel()) break;
    try {
      const probe = await fetchFileViaTab(tab.id, entry.url);
      if (!probe || !probe.ok || (!probe.isPdf && !probe.isZip && !probe.isDoc)) {
        failed += 1;
        lastReason = probe && probe.looksLikeLogin ? LOGIN_MSG : 'לא נמצא קובץ בתוך התיקייה';
        continue;
      }
      const name = await saveProbedFile(
        user,
        { url: entry.url, title: entry.title || link.title || '' },
        probe,
      );
      if (!firstName) firstName = name;
      saved += 1;
      flashBadge(tab.id, `${saved}`, '#2563eb', 2000);
    } catch (err) {
      failed += 1;
      lastReason = String(err?.message || err);
    }
  }

  console.info('[wordflow][files] תיקייה', link.url, `→ נשמרו ${saved}/${entries.length}`);
  return { saved, failed, total: entries.length, firstName, lastReason };
}

async function handleClipAllFiles(tab) {
  await requireUser();

  const { links } = await scanPageFiles(tab);
  if (!links.length) throw new Error('לא נמצאו קישורים לקבצים בעמוד');

  flashBadge(tab.id, String(links.length), '#2563eb', 4000);

  const { saved, skipped } = await downloadFiles(tab, links);

  console.info(`[wordflow][files] נשלחו ${saved} קבצים · דילוגים:`, skipped);
  if (!saved) throw new Error('לא נמצא אף קובץ שניתן להוריד בעמוד');
  handleSuccess(tab.id);
  return { saved, skipped };
}

/**
 * זיהוי מהיר של סוג הלשונית לפי ה-URL בלבד (בלי בקשת רשת) — הפופאפ צריך
 * להחליט בין מצב "PDF" למצב "רשימת קבצים" מיד עם הפתיחה.
 */
function detectTabKind(tab) {
  const url = tab?.url || '';
  if (!url) return { isPdf: false, fileName: '', url: '' };
  // ⚠️ מבחן *קפדני* בכוונה. הזיהוי הרחב נעל את הפופאפ על מצב "PDF" בכל דף
  // שהמילה pdf/download הופיעה בנתיב שלו, והכפתור היחיד שנשאר הוביל לכישלון.
  // גם עכשיו הפופאפ מציג במצב הזה מסלול חלופי (עמוד/סריקה) — ר' popup.js.
  const isPdf = PDF_URL_STRICT.test(url);
  return { isPdf, fileName: isPdf ? fileNameFromUrl(url) : '', url };
}

// ---------- מצב עבודה נמשך (הפופאפ נסגר באמצע הורדה) ----------
const jobKey = (tabId) => `wordflow_job_${tabId}`;

async function readJob(tabId) {
  try {
    const store = await chrome.storage.session.get(jobKey(tabId));
    return store?.[jobKey(tabId)] || null;
  } catch {
    return null;
  }
}

async function writeJob(tabId, job) {
  try {
    await chrome.storage.session.set({ [jobKey(tabId)]: job });
  } catch (err) {
    console.warn('[wordflow][files] שמירת מצב העבודה נכשלה:', err);
  }
}

async function clearJob(tabId) {
  try {
    await chrome.storage.session.remove(jobKey(tabId));
  } catch {
    /* אין מה לעשות */
  }
}

/**
 * לשוניות שבהן רצה כרגע הורדה *בתהליך הזה*. ⚠️ אם ה-service worker נהרג באמצע,
 * ה-Set מתאפס — וזה בדיוק הרצוי: עבודה שנשארה 'pending' ב-storage בלי ריצה חיה
 * היא מתה, ואסור שתנעל את הפופאפ לנצח.
 */
const activeJobTabs = new Set();

/**
 * לשוניות שבהן המשתמש ביקש לבטל עבודה חיה ("סרוק שוב"). ⚠️ בלי דגל אמיתי
 * הלולאה ממשיכה לרוץ אחרי clearJob וכותבת את המפתח חזרה בכל פריט — הסריקה
 * הבאה מדווחת "נקטעה" בזמן שהיא עדיין רצה, והמשתמש יכול להתחיל ריצה *שנייה*
 * במקביל על אותה לשונית (קליפים כפולים ב-Firebase).
 */
const cancelledJobTabs = new Set();

/** פורטים פתוחים של הפופאפ לכל לשונית — כדי שפופאפ שנפתח מחדש יקבל התקדמות חיה. */
const jobPorts = new Map(); // tabId -> Set<port>

function attachPort(tabId, port) {
  if (!jobPorts.has(tabId)) jobPorts.set(tabId, new Set());
  jobPorts.get(tabId).add(port);
}

function detachPort(tabId, port) {
  const set = jobPorts.get(tabId);
  if (!set) return;
  set.delete(port);
  if (!set.size) jobPorts.delete(tabId);
}

function postToTab(tabId, payload) {
  const set = jobPorts.get(tabId);
  if (!set) return;
  for (const port of set) {
    try { port.postMessage(payload); } catch { /* הפופאפ נסגר */ }
  }
}

/**
 * מחליט מה הפופאפ יראה: רק עבודה *חיה* על *אותו URL* משתלטת על התצוגה.
 * כל השאר (הסתיימה / הדף התחלף / הריצה מתה) — נמחקת, וכשהיא הסתיימה באותו דף
 * מוחזר lastSummary כדי להציג שורת סיכום מעל הרשימה הטרייה.
 */
async function resolveStoredJob(tab) {
  const job = await readJob(tab.id);
  if (!job) return { job: null, lastSummary: null };

  const sameUrl = (job.tabUrl || '') === (tab.url || '');
  const live = !job.done && activeJobTabs.has(tab.id);
  if (live && sameUrl) return { job, lastSummary: null };

  await clearJob(tab.id);
  if (!sameUrl) return { job: null, lastSummary: null };

  const items = Array.isArray(job.items) ? job.items : [];
  return {
    job: null,
    lastSummary: {
      saved: job.saved || 0,
      total: job.total || items.length,
      items,
      interrupted: !job.done,
    },
  };
}

/**
 * ערוץ ההורדה של הפופאפ. הפורט מחזיק את ה-service worker בחיים לאורך העבודה,
 * וניתוקו (סגירת הפופאפ) לא מבטל אותה — ההתקדמות ממשיכה להישמר ב-storage.session
 * וה-scan הבא מחזיר אותה כדי לצייר מחדש את המצב.
 */
/** ממתין (עד ~15 שניות) שריצה שבוטלה תסיים את הפריט הנוכחי ותשחרר את הלשונית. */
async function waitForCancelledJob(tabId) {
  for (let i = 0; i < 60 && activeJobTabs.has(tabId) && cancelledJobTabs.has(tabId); i += 1) {
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function runFilesJob(tabId, links) {
  if (activeJobTabs.has(tabId) && cancelledJobTabs.has(tabId)) await waitForCancelledJob(tabId);
  // ⚠️ שומר בפני ריצה כפולה על אותה לשונית — המקור לקליפים כפולים ב-Firebase.
  if (activeJobTabs.has(tabId)) {
    postToTab(tabId, {
      type: 'done',
      saved: 0,
      total: links.length,
      items: [],
      error: 'הורדה כבר רצה בלשונית הזו',
    });
    return;
  }

  let job = null;
  cancelledJobTabs.delete(tabId);
  activeJobTabs.add(tabId);

  try {
    const tab = await chrome.tabs.get(tabId);
    job = {
      startedAt: Date.now(),
      tabUrl: tab.url || '',
      items: links.map((l) => ({ url: l.url, title: l.title || '', status: 'pending' })),
      done: false,
      saved: 0,
      total: links.length,
    };
    await writeJob(tabId, job);

    const isCancelled = () => cancelledJobTabs.has(tabId);

    const result = await downloadFiles(tab, links, async (item) => {
      const entry = job.items[item.index];
      if (entry) {
        entry.status = item.status;
        entry.fileName = item.fileName || '';
        entry.reason = item.reason || '';
      }
      if (item.status === 'saved') job.saved += 1;
      // ⚠️ אחרי ביטול אסור לכתוב את מצב העבודה חזרה — זה מה שהחיה אותה בעבר.
      if (!isCancelled()) await writeJob(tabId, job);
      postToTab(tabId, { type: 'item', ...item });
    }, isCancelled);

    if (result.cancelled || isCancelled()) {
      await clearJob(tabId);
      postToTab(tabId, {
        type: 'done',
        saved: result.saved,
        total: links.length,
        items: job.items,
        cancelled: true,
      });
      return;
    }

    job.done = true;
    job.finishedAt = Date.now();
    job.saved = result.saved;
    job.total = links.length;
    await writeJob(tabId, job);
    // ⚠️ items נשלחים גם ב-done: אם הפופאפ נפתח מחדש באמצע העבודה הוא פספס
    // את הודעות ה-item, וזו הדרך היחידה שלו לצייר את הסיבות לכל שורה.
    postToTab(tabId, { type: 'done', saved: result.saved, total: links.length, items: job.items });
  } catch (err) {
    console.error('[wordflow][files] עבודת ההורדה נכשלה:', err);
    await clearJob(tabId);
    postToTab(tabId, {
      type: 'done',
      saved: 0,
      total: links.length,
      items: (job && job.items) || [],
      error: String(err?.message || err),
    });
  } finally {
    activeJobTabs.delete(tabId);
    cancelledJobTabs.delete(tabId);
  }
}

/**
 * פופאפ שנפתח מחדש באמצע עבודה: משדר לו את המצב הנוכחי מיד, וממשיך להזרים
 * את שאר ההודעות דרך postToTab. ⚠️ עבודה שהסתיימה בין הסריקה ל-attach חייבת
 * עדיין לקבל done — אחרת הרשימה נשארת נעולה על "⏳" לנצח.
 */
async function attachToJob(tabId) {
  const job = await readJob(tabId);
  if (!job) {
    postToTab(tabId, { type: 'gone' });
    return;
  }
  const items = Array.isArray(job.items) ? job.items : [];
  postToTab(tabId, {
    type: 'sync',
    items,
    saved: job.saved || 0,
    total: job.total || items.length,
    running: !job.done && activeJobTabs.has(tabId),
  });
  if (job.done || !activeJobTabs.has(tabId)) {
    postToTab(tabId, {
      type: 'done',
      saved: job.saved || 0,
      total: job.total || items.length,
      items,
    });
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'wordflow-files-job') return;
  sweepStaleState();

  let boundTab = null;
  port.onDisconnect.addListener(() => {
    if (boundTab !== null) detachPort(boundTab, port);
  });

  port.onMessage.addListener((msg) => {
    if (!msg || typeof msg.tabId !== 'number') return;
    if (msg.type === 'start') {
      boundTab = msg.tabId;
      attachPort(msg.tabId, port);
      runFilesJob(msg.tabId, Array.isArray(msg.links) ? msg.links : []);
    } else if (msg.type === 'attach') {
      boundTab = msg.tabId;
      attachPort(msg.tabId, port);
      attachToJob(msg.tabId);
    }
  });
});

/**
 * מחזיר בייטים של PDF מאומתים, או **null** כשמסתבר שזה בכלל לא PDF —
 * ואז הקורא ממשיך למסלול חילוץ הטקסט.
 *
 * ⚠️ בעבר כל תשובה שאינה PDF זרקה שגיאה, ולכן דפי HTML רגילים ש-URL שלהם
 * הכיל "pdf"/"download" הפכו ללא-ניתנים-לקליפה לחלוטין. זריקה נשמרת רק
 * למקרה שבו אנחנו *בטוחים* שמדובר בנקודת קצה של PDF (סיומת .pdf אמיתית)
 * שהחזירה דף התחברות — שם ההודעה באמת מסבירה למשתמש מה לעשות.
 */
async function resolvePdfBytes(tab) {
  const url = tab.url || '';
  const viaTab = await fetchPdfViaTab(tab.id, url);
  if (viaTab?.isPdf) return base64ToBytes(viaTab.data);
  if (viaTab && viaTab.looksLikeLogin && PDF_URL_STRICT.test(url)) {
    throw new Error('השרת החזיר דף התחברות במקום קובץ — יש להתחבר לאתר בדפדפן ולנסות שוב');
  }
  if (viaTab) return null; // תשובה תקינה שאינה PDF — ננסה לחלץ טקסט

  // הדף לא נגיש להזרקה (הצופה הפנימי של Chrome) — משיכה מה-service worker.
  // מותרת כי activeTab מעניק הרשאת מארח זמנית ללשונית הפעילה.
  try {
    const direct = await fetchTabBytes(url);
    return isPdfBytes(direct.bytes) ? direct.bytes : null;
  } catch (err) {
    console.warn('[wordflow][clip] משיכת PDF ישירה נכשלה:', err);
    return null;
  }
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
    const bytes = await resolvePdfBytes(tab);
    if (bytes) {
      await clipPdfDocument(tab, user, bytes);
      return;
    }
    // ⚠️ לא PDF אחרי הכול — ממשיכים למסלול הטקסט הרגיל. דפוס URL לעולם
    // לא יכול להפוך דף רגיל לבלתי-ניתן-לקליפה.
    console.info('[wordflow][clip] ה-URL נראה כמו PDF אבל התוכן אינו — ממשיך לחילוץ טקסט');
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
// ⚠️ בעבר ה-state היה גלובל בזיכרון (`pendingAreaSelect`) שהמתינו לו ב-await בלי
// timeout. ב-MV3 ה-service worker נהרג אחרי ~30 שניות ללא אירוע — בדיוק בזמן
// שהמשתמש גורר — וההודעה `wordflow-area-select-done` נפלה בין כל הענפים: בלי
// תשובה, בלי בדג', בלי לוג. עכשיו הטיפול **חסר-מצב**: ההודעה עצמה נושאת את
// המלבן, וה-handler מצלם/חותך/מעלה במקום. ה-storage.session משמש רק לזיהוי
// בחירה נטושה (timeout → בדג' '!' + לוג).
const AREA_TIMEOUT_MS = 3 * 60 * 1000;
const areaKey = (tabId) => `wordflow_area_${tabId}`;

async function markAreaSelectPending(tabId) {
  try {
    await chrome.storage.session.set({ [areaKey(tabId)]: Date.now() + AREA_TIMEOUT_MS });
  } catch { /* אין storage — לא קריטי, המסלול חסר-מצב בכל מקרה */ }
}

async function clearAreaSelectPending(tabId) {
  try { await chrome.storage.session.remove(areaKey(tabId)); } catch { /* אין מה לעשות */ }
}

async function sweepStaleAreaSelects() {
  try {
    const all = await chrome.storage.session.get(null);
    const now = Date.now();
    const dead = [];
    for (const [key, expiresAt] of Object.entries(all || {})) {
      if (!key.startsWith('wordflow_area_')) continue;
      if (typeof expiresAt === 'number' && expiresAt > now) continue;
      dead.push(key);
      const tabId = Number(key.slice('wordflow_area_'.length));
      if (!Number.isFinite(tabId)) continue;
      console.error('[wordflow][area] בחירת האזור פגה בלי שהתקבל מלבן — בוטלה', tabId);
      flashBadge(tabId, '!', '#dc2626', 3000);
    }
    if (dead.length) await chrome.storage.session.remove(dead);
  } catch { /* אין storage.session */ }
}

async function completeAreaSelect(tab, rect) {
  const user = await requireUser();
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return undefined;
  sweepStaleState();

  if (message.type === 'wordflow-area-select-done') {
    const tab = sender?.tab;
    if (!tab || !tab.id) {
      console.error('[wordflow][area] הודעת סיום הגיעה בלי לשונית שולחת');
      return undefined;
    }
    clearAreaSelectPending(tab.id);
    completeAreaSelect(tab, message.rect).catch((err) => handleFailure(tab.id, err));
    return undefined;
  }
  if (message.type === 'wordflow-area-select-cancelled') {
    if (sender?.tab?.id) clearAreaSelectPending(sender.tab.id);
    return undefined;
  }

  // הודעה מהפופאפ: סריקת הלשונית הפעילה (סוג הדף + רשימת קבצים + עבודה שרצה)
  if (message.type === 'wordflow-popup-scan') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) throw new Error('לא נמצא טאב פעיל');
        const kind = detectTabKind(tab);
        const { job, lastSummary } = await resolveStoredJob(tab);
        // forcePage: המשתמש ביקש מפורשות רשימת קבצים גם בלשונית שזוהתה כ-PDF.
        if (kind.isPdf && !message.forcePage) {
          sendResponse({
            ok: true,
            tabId: tab.id,
            isPdf: true,
            fileName: kind.fileName,
            pageTitle: tab.title || '',
            links: [],
            job,
            lastSummary,
          });
          return;
        }
        const { pageTitle, links } = await scanPageFiles(tab);
        sendResponse({ ok: true, tabId: tab.id, isPdf: false, fileName: '', pageTitle, links, job, lastSummary });
      } catch (err) {
        console.error('[wordflow][popup] סריקת העמוד נכשלה:', err);
        sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
      }
    })();
    return true;
  }

  // הודעה מהפופאפ: "סרוק שוב את העמוד" — מוחק את מצב העבודה כדי שהסריקה הבאה
  // תחזיר את הרשימה המלאה. זה מסלול המילוט מכל מצב תקוע.
  if (message.type === 'wordflow-popup-clear-job') {
    (async () => {
      try {
        let tabId = message.tabId;
        if (!tabId) {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          tabId = tab?.id;
        }
        let cancelled = false;
        if (tabId) {
          // ⚠️ ביטול אמיתי לפני המחיקה: הלולאה החיה בודקת את הדגל בכל איטרציה,
          // אחרת היא ממשיכה לרוץ, כותבת את מצב העבודה חזרה, והמשתמש יכול
          // להתחיל ריצה מקבילה שנייה (קליפים כפולים).
          cancelled = activeJobTabs.has(tabId);
          if (cancelled) cancelledJobTabs.add(tabId);
          // activeJobTabs *לא* נמחק כאן בכוונה: רק ה-finally של הלולאה מוחק אותו,
          // וכך ריצה חדשה לא יכולה להתחיל בזמן שהישנה עוד מסיימת פריט.
          await clearJob(tabId);
        }
        sendResponse({ ok: true, cancelled });
      } catch (err) {
        sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
      }
    })();
    return true;
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
  // כישלון מוקדם וברור אם אין משתמש — לפני שהמשתמש טורח לגרור.
  await requireUser();

  // הזרקת שכבת הבחירה. ⚠️ אין כאן await לתוצאה: הצילום, החיתוך וההעלאה קורים
  // ב-handler של ההודעה, כדי שמוות של ה-service worker באמצע הגרירה לא יאבד כלום.
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/areaSelectOverlay.js'],
  });
  await markAreaSelectPending(tab.id);
}
