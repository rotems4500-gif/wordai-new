// webProxyService.js — באתר (ללא דסקטופ) חלק מהשירותים חסומים ב-CORS בדפדפן:
// SerpAPI (חיפוש מקורות), Copyleaks (בדיקת מקוריות) ו-Perplexity (אחזור מקורות — ה-API שלהם
// לא מחזיר כותרות CORS לדפדפן, נצפה "Failed to fetch" באתר). מנתבים אותם דרך Firebase Function
// שמשמשת CORS-relay (מקביל ל-proxy_http_request ב-Rust בדסקטופ).
// הקריאה היא same-origin אל /api/proxy (rewrite ב-hosting → function), כך שאין hop נוסף של CORS.
//
// שאר ספקי ה-AI (Gemini/Claude/OpenAI/Groq) *לא* עוברים כאן — הם מאפשרים קריאה ישירה
// מהדפדפן, ואין סיבה להעמיס עליהם relay (עלות/השהיה/פרטיות).

// בדפדפן הקריאה same-origin ('/api/proxy'). ב-Node (test harness) אין origin —
// WORDAI_RELAY_ORIGIN מפנה ל-relay הפרוס (למשל https://wordai-website.web.app).
const RELAY_ORIGIN = (typeof process !== 'undefined' && process.env?.WORDAI_RELAY_ORIGIN) || '';
const RELAY_ENDPOINT = `${RELAY_ORIGIN}/api/proxy`;

// חייב להישאר מסונכרן עם ה-allowlist בצד-שרת (functions/index.js).
const RELAY_HOST_PATTERNS = [
  /(^|\.)serpapi\.com$/i,
  /(^|\.)copyleaks\.com$/i,
  /(^|\.)perplexity\.ai$/i,
];

// האם המארח של ה-URL חסום ב-CORS ולכן צריך לעבור דרך ה-relay של השרת.
export const shouldRelayHostViaFunction = (url = '') => {
  try {
    const host = new URL(url).hostname;
    return RELAY_HOST_PATTERNS.some((re) => re.test(host));
  } catch {
    return false;
  }
};

// מחזיר אובייקט בצורה זהה ל-window.desktopApp.proxyHttpRequest: { ok, status, body }.
// תומך ב-AbortSignal חיצוני וב-timeout פנימי.
export const relayHttpRequestViaFunction = async (
  { url, method = 'POST', headers = {}, body, timeoutMs = 0 } = {},
  signal,
) => {
  const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  let timer = null;
  const onExternalAbort = () => controller?.abort();

  if (controller) {
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', onExternalAbort, { once: true });
    }
    if (timeoutMs > 0) timer = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    const res = await fetch(RELAY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, method, headers, body }),
      signal: controller ? controller.signal : signal,
    });

    if (!res.ok) {
      // כשל ברמת ה-relay עצמו (לא בשירות היעד).
      const text = await res.text().catch(() => '');
      return { ok: false, status: res.status, body: text || `relay error ${res.status}` };
    }

    // הפונקציה מחזירה { ok, status, body } — מעבירים כפי שהוא.
    return await res.json();
  } finally {
    if (timer) clearTimeout(timer);
    if (controller && signal) signal.removeEventListener('abort', onExternalAbort);
  }
};
