// ═══════════════════════════════════════════════════════════════
// imageService.js — מקור תמונות מאוחד למצגות.
// שלושה מקורות: stock (Pexels/Unsplash), AI (Imagen/gpt-image), העלאה.
// כל הקריאות החיצוניות עוברות דרך proxy-http-request של Electron (CORS).
// ═══════════════════════════════════════════════════════════════

import { getProviderConfig } from './aiService';

const hasDesktopProxy = () =>
  typeof window !== 'undefined' && window.desktopApp && typeof window.desktopApp.proxyHttpRequest === 'function';

let reqCounter = 0;
const nextRequestId = () => {
  reqCounter += 1;
  return `img-${reqCounter}-${(typeof performance !== 'undefined' && performance.now) ? Math.floor(performance.now()) : reqCounter}`;
};

// בקשת HTTP דרך proxy (דסקטופ) או fetch ישיר (דפדפן/dev)
const httpRequest = async ({ url, method = 'GET', headers = {}, body = null, responseEncoding = 'utf8', signal }) => {
  if (hasDesktopProxy()) {
    const res = await window.desktopApp.proxyHttpRequest({
      url, method, headers, body, responseEncoding, requestId: nextRequestId(),
    });
    if (!res || res.ok === false) {
      throw new Error(res?.body ? `שגיאת רשת (${res.status || 0}): ${String(res.body).slice(0, 200)}` : 'שגיאת רשת');
    }
    return { body: res.body, contentType: res.contentType || '' };
  }
  // fallback dev/דפדפן
  const res = await fetch(url, { method, headers, body, signal });
  if (!res.ok) throw new Error(`שגיאת רשת (${res.status})`);
  if (responseEncoding === 'base64') {
    const buf = await res.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return { body: btoa(binary), contentType: res.headers.get('content-type') || '' };
  }
  return { body: await res.text(), contentType: res.headers.get('content-type') || '' };
};

// ── חיפוש תמונות סטוק ────────────────────────────────────────────
const searchPexels = async (query, count, key, signal) => {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`;
  const { body } = await httpRequest({ url, method: 'GET', headers: { Authorization: key }, signal });
  const data = JSON.parse(body);
  return (data.photos || []).map((p) => ({
    id: `pexels-${p.id}`,
    source: 'stock',
    url: p.src?.large2x || p.src?.large || p.src?.original,
    thumb: p.src?.medium || p.src?.small,
    alt: p.alt || query,
    attribution: `Pexels · ${p.photographer || ''}`.trim(),
    query,
  }));
};

const searchUnsplash = async (query, count, key, signal) => {
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`;
  const { body } = await httpRequest({ url, method: 'GET', headers: { Authorization: `Client-ID ${key}` }, signal });
  const data = JSON.parse(body);
  return (data.results || []).map((p) => ({
    id: `unsplash-${p.id}`,
    source: 'stock',
    url: p.urls?.regular || p.urls?.full,
    thumb: p.urls?.small || p.urls?.thumb,
    alt: p.alt_description || query,
    attribution: `Unsplash · ${p.user?.name || ''}`.trim(),
    query,
  }));
};

/**
 * searchStockImages — מחזיר מערך תוצאות תמונה לפי הספק הפעיל.
 */
export const searchStockImages = async (query, { count = 12, signal } = {}) => {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return [];
  const cfg = getProviderConfig();
  const provider = cfg.imageProvider || 'pexels';
  const safeCount = Math.max(1, Math.min(30, Number(count) || 12));

  if (provider === 'unsplash') {
    const key = cfg.unsplash?.key?.trim();
    if (!key) throw new Error('לא הוגדר מפתח Unsplash. הגדר בהגדרות → מפתחות.');
    return searchUnsplash(cleanQuery, safeCount, key, signal);
  }
  const key = cfg.pexels?.key?.trim();
  if (!key) throw new Error('לא הוגדר מפתח Pexels. הגדר בהגדרות → מפתחות.');
  return searchPexels(cleanQuery, safeCount, key, signal);
};

// ── יצירת תמונה ב-AI ─────────────────────────────────────────────
const generateGeminiImage = async (prompt, key, model, signal) => {
  const cleanModel = String(model || 'imagen-3.0-generate-002').trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:predict?key=${encodeURIComponent(key)}`;
  const body = JSON.stringify({
    instances: [{ prompt }],
    parameters: { sampleCount: 1, aspectRatio: '16:9' },
  });
  const { body: resBody } = await httpRequest({ url, method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal });
  const data = JSON.parse(resBody);
  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error('Imagen לא החזיר תמונה. ייתכן שהמודל לא זמין למפתח הזה.');
  return `data:image/png;base64,${b64}`;
};

const generateOpenAiImage = async (prompt, key, model, signal) => {
  const url = 'https://api.openai.com/v1/images/generations';
  const body = JSON.stringify({
    model: String(model || 'gpt-image-1').trim() || 'gpt-image-1',
    prompt,
    n: 1,
    size: '1536x1024',
  });
  const { body: resBody } = await httpRequest({
    url, method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body, signal,
  });
  const data = JSON.parse(resBody);
  const item = data.data?.[0];
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (item?.url) return fetchImageAsDataUrl(item.url, signal);
  throw new Error('OpenAI לא החזיר תמונה.');
};

/**
 * generateAiImage — מייצר תמונה ומחזיר dataUrl.
 */
export const generateAiImage = async (prompt, { signal } = {}) => {
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt) throw new Error('חסר תיאור ליצירת התמונה.');
  const cfg = getProviderConfig();
  const gen = cfg.imageGen || {};
  const provider = gen.provider || 'gemini';

  if (provider === 'openai') {
    const key = gen.key?.trim() || cfg.openai?.key?.trim();
    if (!key) throw new Error('לא הוגדר מפתח OpenAI ליצירת תמונות.');
    const dataUrl = await generateOpenAiImage(cleanPrompt, key, gen.model, signal);
    return { source: 'ai', dataUrl, url: '', alt: cleanPrompt, query: cleanPrompt, attribution: 'נוצר ב-AI' };
  }
  const key = gen.key?.trim() || cfg.gemini?.key?.trim();
  if (!key) throw new Error('לא הוגדר מפתח Gemini ליצירת תמונות.');
  const dataUrl = await generateGeminiImage(cleanPrompt, key, gen.model, signal);
  return { source: 'ai', dataUrl, url: '', alt: cleanPrompt, query: cleanPrompt, attribution: 'נוצר ב-AI' };
};

/**
 * fetchImageAsDataUrl — מוריד תמונה מ-URL ומחזיר dataUrl (לצורך הטמעה ב-PPTX).
 */
export const fetchImageAsDataUrl = async (url, signal) => {
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl) return '';
  if (cleanUrl.startsWith('data:')) return cleanUrl;
  const { body, contentType } = await httpRequest({ url: cleanUrl, method: 'GET', responseEncoding: 'base64', signal });
  const mime = contentType && contentType.startsWith('image/') ? contentType : 'image/jpeg';
  return `data:${mime};base64,${body}`;
};

// ── זמינות מקורות (ל-UI) ─────────────────────────────────────────
export const getImageSourceAvailability = (cfg = null) => {
  const config = cfg || getProviderConfig();
  const gen = config.imageGen || {};
  const aiKey = gen.provider === 'openai'
    ? (gen.key?.trim() || config.openai?.key?.trim())
    : (gen.key?.trim() || config.gemini?.key?.trim());
  return {
    stock: Boolean(config.imageProvider === 'unsplash' ? config.unsplash?.key?.trim() : config.pexels?.key?.trim()),
    stockProvider: config.imageProvider || 'pexels',
    ai: Boolean(aiKey),
    aiProvider: gen.provider || 'gemini',
  };
};
