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
// perplexity: ה-API לא מחזיר כותרות CORS לדפדפן — אחזור מקורות באתר עובר דרך ה-relay.
const ALLOWED_HOST_PATTERNS = [
  /(^|\.)serpapi\.com$/i,
  /(^|\.)copyleaks\.com$/i,
  /(^|\.)perplexity\.ai$/i,
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

// ── verifyUrl: בדיקת חיות של קישורי מקורות ──────────────────────────────────
// מקביל ל-verify_url ב-Rust בדסקטופ. מקבל דומיינים שרירותיים (בשונה מה-relay),
// ולכן ההגנות לפי צורה: https בלבד, בלי IP-literal/localhost, בלי קריאת body.
// POST { urls: string[] } (עד 10) → { results: [{ url, ok, status, finalUrl }] }.

const VERIFY_URL_MAX_BATCH = 10;
const VERIFY_URL_TIMEOUT_MS = 5000;
const VERIFY_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// rate limit best-effort בזיכרון (פר-instance): 60 בדיקות URL לדקה לכל IP.
const verifyRateBuckets = new Map();
const isVerifyRateLimited = (ip, count) => {
  const now = Date.now();
  const bucket = verifyRateBuckets.get(ip) || { windowStart: now, used: 0 };
  if (now - bucket.windowStart > 60000) {
    bucket.windowStart = now;
    bucket.used = 0;
  }
  bucket.used += count;
  verifyRateBuckets.set(ip, bucket);
  if (verifyRateBuckets.size > 5000) verifyRateBuckets.clear();
  return bucket.used > 60;
};

const isPublicHttpsUrl = (rawUrl) => {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
    if (!host.includes('.')) return false;
    if (host === 'localhost' || host.endsWith('.localhost')) return false;
    if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa')) return false;
    // IP-literal (v4 או v6 בסוגריים) — נדחה.
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
    if (host.startsWith('[') || host.includes(':')) return false;
    return true;
  } catch {
    return false;
  }
};

const verifySingleUrl = async (url) => {
  if (!isPublicHttpsUrl(url)) {
    return { url, ok: false, status: 0, finalUrl: '', error: 'blocked-url-shape' };
  }
  const attempt = async (method) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VERIFY_URL_TIMEOUT_MS);
    try {
      const resp = await fetch(url, {
        method,
        redirect: 'follow',
        headers: { 'User-Agent': VERIFY_UA },
        signal: controller.signal,
      });
      // לא קוראים body — רק סטטוס ו-URL סופי.
      try { await resp.body?.cancel(); } catch { /* opaque/consumed */ }
      return { status: resp.status, finalUrl: resp.url || url };
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    let result = await attempt('HEAD');
    if (result.status === 405 || result.status === 501) {
      result = await attempt('GET');
    }
    return {
      url,
      ok: result.status >= 200 && result.status < 400,
      status: result.status,
      finalUrl: result.finalUrl,
    };
  } catch (err) {
    return { url, ok: false, status: 0, finalUrl: '', error: String((err && err.message) || err) };
  }
};

exports.verifyUrl = onRequest({ cors: false, timeoutSeconds: 30, memory: '256MiB', invoker: 'public' }, async (req, res) => {
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
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    return;
  }

  const urls = Array.isArray(req.body?.urls)
    ? req.body.urls.filter((u) => typeof u === 'string' && u).slice(0, VERIFY_URL_MAX_BATCH)
    : [];
  if (!urls.length) {
    res.status(400).json({ ok: false, error: 'missing urls' });
    return;
  }

  const ip = req.get('x-forwarded-for')?.split(',')[0]?.trim() || req.ip || 'unknown';
  if (isVerifyRateLimited(ip, urls.length)) {
    res.status(429).json({ ok: false, error: 'rate limited' });
    return;
  }

  const results = await Promise.all(urls.map(verifySingleUrl));
  res.status(200).json({ ok: true, results });
});

// ── fetchPageText: קריאת תוכן טקסטואלי של עמוד מקור ─────────────────────────
// מקביל ל-fetch_page_text ב-Rust בדסקטופ. משמש את הצ'אט לבדיקת התאמת טענה-מקור
// על סמך תוכן אמיתי. אותן הגנות-צורה כמו verifyUrl + הגנות תוכן: רק text/html
// או text/plain, body מוגבל ל-1.5MB, פלט טקסט חשוף חתוך ל-30k תווים.
// POST { urls: string[] } (עד 3) → { results: [{ url, ok, status, finalUrl, title, text }] }.

const FETCH_PAGE_MAX_BATCH = 3;
const FETCH_PAGE_TIMEOUT_MS = 8000;
const FETCH_PAGE_MAX_BODY_BYTES = 1500000;
const FETCH_PAGE_MAX_TEXT_CHARS = 30000;

const htmlToText = (html) => {
  let title = '';
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title/i.exec(html);
  if (titleMatch) title = titleMatch[1].trim();
  const text = html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1[^>]*>/gi, ' ')
    .replace(/<(?:p|br|div|li|h1|h2|h3|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return { title, text };
};

const fetchSinglePageText = async (url) => {
  if (!isPublicHttpsUrl(url)) {
    return { url, ok: false, status: 0, finalUrl: '', title: '', text: '', error: 'blocked-url-shape' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_PAGE_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': VERIFY_UA },
      signal: controller.signal,
    });
    const status = resp.status;
    const finalUrl = resp.url || url;
    if (status < 200 || status >= 400) {
      try { await resp.body?.cancel(); } catch { /* ignore */ }
      return { url, ok: false, status, finalUrl, title: '', text: '', error: 'not-accessible' };
    }
    const contentType = String(resp.headers.get('content-type') || '').toLowerCase();
    const isPlain = contentType.startsWith('text/plain');
    if (!contentType.startsWith('text/html') && !isPlain && contentType) {
      try { await resp.body?.cancel(); } catch { /* ignore */ }
      return { url, ok: false, status, finalUrl, title: '', text: '', error: `unsupported-content-type:${contentType}` };
    }
    // קריאה מוגבלת בגודל — stream עם cap.
    const reader = resp.body?.getReader?.();
    let bodyBytes = new Uint8Array(0);
    if (reader) {
      while (bodyBytes.length < FETCH_PAGE_MAX_BODY_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        const remaining = FETCH_PAGE_MAX_BODY_BYTES - bodyBytes.length;
        const chunk = value.length > remaining ? value.slice(0, remaining) : value;
        const merged = new Uint8Array(bodyBytes.length + chunk.length);
        merged.set(bodyBytes);
        merged.set(chunk, bodyBytes.length);
        bodyBytes = merged;
      }
      try { await reader.cancel(); } catch { /* ignore */ }
    }
    const body = new TextDecoder('utf-8', { fatal: false }).decode(bodyBytes);
    const { title, text } = isPlain ? { title: '', text: body } : htmlToText(body);
    return { url, ok: true, status, finalUrl, title, text: text.slice(0, FETCH_PAGE_MAX_TEXT_CHARS), error: '' };
  } catch (err) {
    return { url, ok: false, status: 0, finalUrl: '', title: '', text: '', error: String((err && err.message) || err) };
  } finally {
    clearTimeout(timer);
  }
};

exports.fetchPageText = onRequest({ cors: false, timeoutSeconds: 60, memory: '256MiB', invoker: 'public' }, async (req, res) => {
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
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    return;
  }

  const urls = Array.isArray(req.body?.urls)
    ? req.body.urls.filter((u) => typeof u === 'string' && u).slice(0, FETCH_PAGE_MAX_BATCH)
    : [];
  if (!urls.length) {
    res.status(400).json({ ok: false, error: 'missing urls' });
    return;
  }

  const ip = req.get('x-forwarded-for')?.split(',')[0]?.trim() || req.ip || 'unknown';
  // אותו bucket כמו verifyUrl — קריאת עמוד "כבדה" פי 3 מבדיקת חיות.
  if (isVerifyRateLimited(ip, urls.length * 3)) {
    res.status(429).json({ ok: false, error: 'rate limited' });
    return;
  }

  const results = await Promise.all(urls.map(fetchSinglePageText));
  res.status(200).json({ ok: true, results });
});
