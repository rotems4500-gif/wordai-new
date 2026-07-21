// pageTextFetch.js — משיכת טקסט העמוד מ-URL, דו-מסלולי.
//
// דסקטופ: window.desktopApp.fetchPageText (Rust reqwest, עוקף CORS).
// ווב:     POST /api/fetch-page-text (Firebase function, rewrite ב-firebase.json).
//
// חולץ מ-chatSourceCheck.js כשגם שלד המטלה נזקק לו (gapSourceService) — אותו
// טרנספורט, שני צרכנים. עקרון fail-open נשמר: כשל בקריאה לא זורק, מחזיר
// רשומה עם ok:false ו-error, והקורא מחליט מה לעשות (נפילה לתקציר, סימון וכו').

export const PAGE_TEXT_TIMEOUT_MS = 8000;
const WEB_FETCH_PAGE_ENDPOINT = '/api/fetch-page-text';

let injectedPageTextTransport = null;

/** transport(urls, {signal, timeoutMs}) → [{url, ok, status, finalUrl, title, text}] */
export const setPageTextTransport = (transport) => {
  injectedPageTextTransport = typeof transport === 'function' ? transport : null;
};

export const emptyPageResult = (url, error = 'unavailable') => ({
  url, ok: false, status: 0, finalUrl: '', title: '', text: '', error,
});

const normalizeResult = (url, raw) => ({
  url,
  ok: Boolean(raw?.ok),
  status: Number(raw?.status) || 0,
  finalUrl: raw?.finalUrl || '',
  title: String(raw?.title || ''),
  text: String(raw?.text || ''),
  error: String(raw?.error || ''),
});

/**
 * @param {string[]} urls
 * @param {{signal?:AbortSignal, timeoutMs?:number}} opts
 * @returns {Promise<Array<{url:string, ok:boolean, status:number, finalUrl:string, title:string, text:string, error:string}>>}
 */
export const fetchPagesText = async (urls = [], { signal, timeoutMs = PAGE_TEXT_TIMEOUT_MS } = {}) => {
  const safeUrls = (Array.isArray(urls) ? urls : []).map((url) => String(url || '').trim()).filter(Boolean);
  if (!safeUrls.length) return [];

  if (injectedPageTextTransport) {
    try {
      return await injectedPageTextTransport(safeUrls, { signal, timeoutMs });
    } catch {
      return safeUrls.map((url) => emptyPageResult(url));
    }
  }

  if (typeof window !== 'undefined' && window.desktopApp?.fetchPageText) {
    return Promise.all(safeUrls.map(async (url) => {
      try {
        return normalizeResult(url, await window.desktopApp.fetchPageText({ url, timeoutMs }));
      } catch {
        return emptyPageResult(url);
      }
    }));
  }

  if (typeof fetch !== 'undefined') {
    try {
      const response = await fetch(WEB_FETCH_PAGE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: safeUrls }),
        signal,
      });
      // rewrite לא-פרוס מחזיר את index.html עם 200 — חובה לוודא JSON תקין של הפונקציה.
      const payload = response.ok ? await response.json().catch(() => null) : null;
      const returned = payload && Array.isArray(payload.results) ? payload.results : null;
      if (!returned) return safeUrls.map((url) => emptyPageResult(url, 'endpoint-unavailable'));
      const byUrl = new Map(returned.map((item) => [item?.url, item]));
      return safeUrls.map((url) => (byUrl.has(url) ? normalizeResult(url, byUrl.get(url)) : emptyPageResult(url)));
    } catch {
      return safeUrls.map((url) => emptyPageResult(url));
    }
  }

  return safeUrls.map((url) => emptyPageResult(url));
};
