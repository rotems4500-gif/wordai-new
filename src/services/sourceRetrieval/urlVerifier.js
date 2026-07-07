// urlVerifier.js — אימות חי של קישורי מקורות לפני הצגה.
//
// טרנספורט לפי סביבה:
//   1. דסקטופ: window.desktopApp.verifyUrl (פקודת Rust verify_url — reqwest, redirects, בלי body).
//   2. אתר: POST /api/verify-url (Firebase Function, batch עד 10).
//   3. harness/Node: transport מוזרק דרך setUrlVerifierTransport.
//
// מדיניות verdict (החלטת מוצר):
//   2xx/3xx-resolved            → חי.
//   401/403/405/429/999         → botBlocked: העמוד כנראה קיים אבל חוסם בוטים (paywall/WAF).
//                                  נשמר ומסומן — אחרת מאבדים חצי מהעיתונות האמיתית.
//   404/410/5xx/כשל-רשת         → מת. המקור נזרק.
// בנוסף: finalUrl (אחרי redirects) הופך ל-URL התצוגה — פותר קישורי grounding-redirect של Google.

export const VERIFY_URL_TIMEOUT_MS = 5000;
export const VERIFY_CONCURRENCY = 6;
const BOT_BLOCKED_STATUSES = new Set([401, 403, 405, 429, 999]);
const WEB_VERIFY_ENDPOINT = '/api/verify-url';
const WEB_VERIFY_BATCH = 10;

let injectedTransport = null;
// transport(urls, {signal, timeoutMs}) → [{url, ok, status, finalUrl}]
export const setUrlVerifierTransport = (transport) => {
  injectedTransport = typeof transport === 'function' ? transport : null;
};

export const isGoogleGroundingRedirectUrl = (value = '') => {
  try {
    const parsed = new URL(String(value || ''));
    const hostname = parsed.hostname.toLowerCase();
    return parsed.pathname.includes('/grounding-api-redirect')
      && (hostname === 'vertexaisearch.cloud.google.com' || hostname.endsWith('.google.com'));
  } catch {
    return false;
  }
};

const classifyVerdict = ({ url = '', ok = false, status = 0, finalUrl = '', title = '' } = {}) => {
  const safeStatus = Number(status) || 0;
  const botBlocked = BOT_BLOCKED_STATUSES.has(safeStatus);
  const alive = Boolean(ok) && safeStatus >= 200 && safeStatus < 400;
  return {
    url,
    ok: alive,
    status: safeStatus,
    finalUrl: String(finalUrl || '').trim() || url,
    // title אופציונלי מהטרנספורט (אם ביצע GET וחילץ <title>) — משמש להעשרת כותרות
    // דומיין-בלבד (chunks של Gemini grounding). טרנספורט שלא מספק — נשאר ריק.
    title: String(title || '').trim(),
    botBlocked,
    dead: !alive && !botBlocked,
    checkedAt: new Date().toISOString(),
  };
};

// עיקרון fail-open: רק verdict אמיתי מטרנספורט עובד רשאי לסמן קישור כ"מת".
// כל תקלה בטרנספורט עצמו (פקודת Rust חסרה, function לא deployed, rewrite שמחזיר HTML,
// רשת נפלה) ⇒ status 999 = "לא אומת" — המקור נשמר עם סימון, לא נזרק.
// בלי זה, תקלת-סביבה אחת זורקת את כל המקורות האמיתיים (נצפה בפועל: JSTOR status=0).
const UNVERIFIED_TRANSPORT_STATUS = 999;

const verifyViaDesktop = async (urls = [], { timeoutMs = VERIFY_URL_TIMEOUT_MS } = {}) => {
  const results = [];
  // מקבילות מוגבלת — לא מפציצים את המחשב של המשתמש.
  for (let i = 0; i < urls.length; i += VERIFY_CONCURRENCY) {
    const batch = urls.slice(i, i + VERIFY_CONCURRENCY);
    const batchResults = await Promise.all(batch.map(async (url) => {
      try {
        const result = await window.desktopApp.verifyUrl({ url, timeoutMs });
        // ה-Rust מחזיר תמיד אובייקט; status 0 ממנו = כשל רשת אמיתי מול היעד (DNS/timeout) ⇒ מת.
        return { url, ok: Boolean(result?.ok), status: Number(result?.status) || 0, finalUrl: result?.finalUrl || '' };
      } catch {
        // invoke נכשל = הפקודה לא קיימת בבינארי הרץ (גרסה ישנה) או תקלת IPC ⇒ לא אומת, לא מת.
        return { url, ok: false, status: UNVERIFIED_TRANSPORT_STATUS, finalUrl: '' };
      }
    }));
    results.push(...batchResults);
  }
  return results;
};

const verifyViaWebFunction = async (urls = [], { signal } = {}) => {
  const results = [];
  for (let i = 0; i < urls.length; i += WEB_VERIFY_BATCH) {
    const batch = urls.slice(i, i + WEB_VERIFY_BATCH);
    try {
      const response = await fetch(WEB_VERIFY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: batch }),
        signal,
      });
      // הגנות מפני "הצלחה מדומה": rewrite לא-פרוס מחזיר את index.html עם 200 —
      // חובה לוודא שזו תשובת JSON תקינה של הפונקציה לפני שסומכים עליה.
      const payload = response.ok ? await response.json().catch(() => null) : null;
      const returned = payload && Array.isArray(payload.results) ? payload.results : null;
      if (!returned) {
        batch.forEach((url) => results.push({ url, ok: false, status: UNVERIFIED_TRANSPORT_STATUS, finalUrl: '' }));
        continue;
      }
      const byUrl = new Map(returned.map((item) => [item?.url, item]));
      batch.forEach((url) => {
        const item = byUrl.get(url);
        results.push(item
          ? { url, ok: Boolean(item.ok), status: Number(item.status) || 0, finalUrl: item.finalUrl || '' }
          : { url, ok: false, status: UNVERIFIED_TRANSPORT_STATUS, finalUrl: '' });
      });
    } catch {
      batch.forEach((url) => results.push({ url, ok: false, status: UNVERIFIED_TRANSPORT_STATUS, finalUrl: '' }));
    }
  }
  return results;
};

export const verifyUrls = async (urls = [], { signal, timeoutMs = VERIFY_URL_TIMEOUT_MS } = {}) => {
  const safeUrls = (Array.isArray(urls) ? urls : [])
    .map((url) => String(url || '').trim())
    .filter(Boolean);
  if (!safeUrls.length) return [];

  let rawResults;
  if (injectedTransport) {
    try {
      rawResults = await injectedTransport(safeUrls, { signal, timeoutMs });
    } catch {
      rawResults = safeUrls.map((url) => ({ url, ok: false, status: UNVERIFIED_TRANSPORT_STATUS, finalUrl: '' }));
    }
  } else if (typeof window !== 'undefined' && window.desktopApp?.verifyUrl) {
    rawResults = await verifyViaDesktop(safeUrls, { timeoutMs });
  } else if (typeof fetch !== 'undefined') {
    rawResults = await verifyViaWebFunction(safeUrls, { signal });
  } else {
    // אין שום טרנספורט — אל תפסול מקורות בגלל חוסר יכולת לבדוק.
    rawResults = safeUrls.map((url) => ({ url, ok: false, status: 999, finalUrl: '' }));
  }

  return (Array.isArray(rawResults) ? rawResults : []).map(classifyVerdict);
};
