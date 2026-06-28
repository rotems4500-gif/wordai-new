// index.js — Firebase Function "proxy": CORS-relay צד-שרת לאתר WordFlow AI.
// מקביל ל-proxy_http_request ב-Rust בדסקטופ. הדפדפן חסום ב-CORS מול חלק מהשירותים
// (SerpAPI לחיפוש מקורות, Copyleaks לבדיקת מקוריות) — הפונקציה הזו מבצעת את הקריאה
// בשם הדפדפן (אין CORS בצד-שרת) ומחזירה { ok, status, body }.
//
// ספקי ה-AI (Gemini/Claude/OpenAI/Groq/Perplexity) לא עוברים כאן — הם מאפשרים קריאה
// ישירה מהדפדפן, כך שאין סיבה להעמיס אותם (עלות/השהיה/פרטיות). ה-allowlist למטה אוכף זאת.

const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

// מקורות מורשים (כשנקראים ישירות; דרך rewrite ב-hosting זה ממילא same-origin).
const ALLOWED_ORIGINS = [
  'https://wordai-website.web.app',
  'https://wordai-website.firebaseapp.com',
];

// רק המארחים שחסומים ב-CORS בדפדפן ועוברים proxy בדסקטופ. הרחבה עתידית = הוספת תבנית כאן.
const ALLOWED_HOST_PATTERNS = [
  /(^|\.)serpapi\.com$/i,
  /(^|\.)copyleaks\.com$/i,
];

const HOP_BY_HOP_HEADERS = new Set(['host', 'content-length', 'connection', 'origin', 'referer']);
const RELAY_TIMEOUT_MS = 110000;

const isHostAllowed = (rawUrl) => {
  try {
    return ALLOWED_HOST_PATTERNS.some((re) => re.test(new URL(rawUrl).hostname));
  } catch {
    return false;
  }
};

const sanitizeHeaders = (headers = {}) => {
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (value == null) continue;
    if (HOP_BY_HOP_HEADERS.has(String(key).toLowerCase())) continue;
    out[key] = String(value);
  }
  return out;
};

exports.proxy = onRequest({ cors: false, timeoutSeconds: 120, memory: '256MiB', invoker: 'public' }, async (req, res) => {
  const origin = req.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.set('Access-Control-Allow-Origin', allowOrigin);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, status: 405, body: 'Method Not Allowed' });
    return;
  }

  const payload = req.body || {};
  const url = typeof payload.url === 'string' ? payload.url : '';
  const method = String(payload.method || 'POST').toUpperCase();
  const headers = payload.headers && typeof payload.headers === 'object' ? payload.headers : {};
  const body = payload.body;

  if (!url) {
    res.status(400).json({ ok: false, status: 400, body: 'missing url' });
    return;
  }
  if (!isHostAllowed(url)) {
    res.status(403).json({ ok: false, status: 403, body: 'host not allowed by relay allowlist' });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RELAY_TIMEOUT_MS);
  try {
    const upstream = await fetch(url, {
      method,
      headers: sanitizeHeaders(headers),
      body: (method === 'GET' || method === 'HEAD') ? undefined : body,
      signal: controller.signal,
    });
    const text = await upstream.text();
    res.status(200).json({ ok: upstream.ok, status: upstream.status, body: text });
  } catch (err) {
    // כשל ברשת/timeout — מחזירים מבנה תקין כדי שהלקוח יטפל בחן.
    res.status(200).json({ ok: false, status: 0, body: String((err && err.message) || err) });
  } finally {
    clearTimeout(timer);
  }
});
