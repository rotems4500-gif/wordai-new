// ═══════════════════════════════════════════════════════════════
// imageService.js — מקור תמונות מאוחד למצגות.
// שלושה מקורות: stock (Pexels/Unsplash), AI (Imagen/gpt-image), העלאה.
// כל הקריאות החיצוניות עוברות דרך proxy-http-request של Electron (CORS).
// ═══════════════════════════════════════════════════════════════

import { getProviderConfig, getFeatureImageConfig } from './aiService';

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
export const searchStockImages = async (query, { count = 12, signal, featureId = '' } = {}) => {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return [];
  const cfg = (featureId && getFeatureImageConfig(featureId)) || getProviderConfig();
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
// שני מסלולי Gemini: imagen-* עובר ב-:predict; מודלי gemini-*-image ("nano banana")
// הם מודלי generateContent רגילים שמחזירים תמונה כ-inlineData עם responseModalities.
const generateGeminiPredictImage = async (prompt, key, model, signal, aspectRatio = '16:9') => {
  const cleanModel = String(model || 'imagen-3.0-generate-002').trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:predict?key=${encodeURIComponent(key)}`;
  const body = JSON.stringify({
    instances: [{ prompt }],
    parameters: { sampleCount: 1, aspectRatio: aspectRatio || '16:9' },
  });
  const { body: resBody } = await httpRequest({ url, method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal });
  const data = JSON.parse(resBody);
  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error('Imagen לא החזיר תמונה. ייתכן שהמודל לא זמין למפתח הזה.');
  return `data:image/png;base64,${b64}`;
};

const generateGeminiFlashImage = async (prompt, key, model, signal) => {
  const cleanModel = String(model || 'gemini-2.5-flash-image').trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(key)}`;
  // נמדד ב-probe: המודל לא-דטרמיניסטי — אותו פרומפט מחזיר לפעמים תשובת טקסט בלבד.
  // הנחיה מפורשת + ניסיון-חוזר אחד עם הנחיה קשוחה יותר סוגרים את רוב המקרים.
  const directives = [
    `Generate a single image (no text-only answer).\n${prompt}`,
    `Output ONLY an image. Do not reply with text. Draw:\n${prompt}`,
  ];
  let lastError = null;
  for (const directive of directives) {
    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: directive }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    });
    const { body: resBody } = await httpRequest({ url, method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal });
    const data = JSON.parse(resBody);
    const parts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((part) => part?.inlineData?.data || part?.inline_data?.data);
    const inline = imagePart?.inlineData || imagePart?.inline_data;
    if (inline?.data) {
      const mime = inline.mimeType || inline.mime_type || 'image/png';
      return `data:${mime};base64,${inline.data}`;
    }
    const blockReason = data.promptFeedback?.blockReason || '';
    const textReply = parts.map((part) => part?.text || '').join(' ').trim().slice(0, 140);
    // אבחון קומפקטי: אילו מפתחות באמת חזרו — חוסך ניחושים כשמבנה התשובה משתנה.
    const shape = `finish=${data.candidates?.[0]?.finishReason || '?'} parts=[${parts.map((part) => Object.keys(part || {}).join('+')).join('|') || 'none'}]`;
    lastError = new Error(blockReason
      ? `המודל לא החזיר תמונה (${blockReason}) — ייתכן שהבקשה נחסמה על ידי מסנני הבטיחות.`
      : `המודל ענה בטקסט במקום תמונה${textReply ? ` ("${textReply}…")` : ''} — נסה ניסוח ממוקד יותר. [${shape}]`);
    // חסימת בטיחות לא תשתפר בניסיון חוזר — עוצרים מיד.
    if (blockReason) break;
  }
  throw lastError || new Error('המודל לא החזיר תמונה.');
};

const generateGeminiImage = async (prompt, key, model, signal, aspectRatio = '16:9') => {
  const cleanModel = String(model || 'imagen-3.0-generate-002').trim();
  // מודל תמונה שאינו imagen (למשל gemini-2.5-flash-image) ⇒ מסלול generateContent.
  if (!/^imagen-/i.test(cleanModel)) return generateGeminiFlashImage(prompt, key, cleanModel, signal);
  try {
    return await generateGeminiPredictImage(prompt, key, cleanModel, signal, aspectRatio);
  } catch (error) {
    // נמדד: מפתחות AI Studio רגילים לא מגישים imagen-* (:predict מחזיר 404) —
    // נופלים אוטומטית ל-nano-banana באותו מפתח במקום להפיל את המצגות/הסיידבר.
    if (/\(404\)/.test(String(error?.message || ''))) {
      return generateGeminiFlashImage(prompt, key, 'gemini-2.5-flash-image', signal);
    }
    throw error;
  }
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

// Stability AI (Stable Diffusion / SDXL) — endpoint v1 שמחזיר base64 ב-JSON
const generateStabilityImage = async (prompt, key, model, signal) => {
  const engine = String(model || 'stable-diffusion-xl-1024-v1-0').trim() || 'stable-diffusion-xl-1024-v1-0';
  const url = `https://api.stability.ai/v1/generation/${encodeURIComponent(engine)}/text-to-image`;
  const body = JSON.stringify({
    text_prompts: [{ text: prompt }],
    cfg_scale: 7,
    height: 1024,
    width: 1024,
    samples: 1,
    steps: 30,
  });
  const { body: resBody } = await httpRequest({
    url, method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${key}` },
    body, signal,
  });
  const data = JSON.parse(resBody);
  const b64 = data.artifacts?.[0]?.base64;
  if (!b64) throw new Error('Stability לא החזיר תמונה. בדוק את שם המנוע/המפתח.');
  return `data:image/png;base64,${b64}`;
};

// xAI Grok — תואם OpenAI images API
const generateXaiImage = async (prompt, key, model, signal) => {
  const url = 'https://api.x.ai/v1/images/generations';
  const body = JSON.stringify({
    model: String(model || 'grok-2-image').trim() || 'grok-2-image',
    prompt,
    n: 1,
    response_format: 'b64_json',
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
  throw new Error('xAI לא החזיר תמונה.');
};

// Black Forest FLUX דרך fal.ai — סינכרוני, מחזיר URL
const generateFluxImage = async (prompt, key, model, signal) => {
  const path = String(model || 'fal-ai/flux/schnell').trim() || 'fal-ai/flux/schnell';
  const url = `https://fal.run/${path.replace(/^\/+/, '')}`;
  const body = JSON.stringify({ prompt, image_size: 'landscape_16_9', num_images: 1 });
  const { body: resBody } = await httpRequest({
    url, method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${key}` },
    body, signal,
  });
  const data = JSON.parse(resBody);
  const imgUrl = data.images?.[0]?.url || data.image?.url;
  if (!imgUrl) throw new Error('FLUX (fal.ai) לא החזיר תמונה.');
  return fetchImageAsDataUrl(imgUrl, signal);
};

// בוחר מפתח AI ל-imageGen: gen.key → fallback למפתח הטקסט של אותו ספק (רק gemini/openai)
const resolveImageGenKey = (gen = {}, cfg = {}) => {
  const direct = gen.key?.trim();
  if (direct) return direct;
  if (gen.provider === 'openai') return cfg.openai?.key?.trim() || '';
  if (gen.provider === 'gemini' || !gen.provider) return cfg.gemini?.key?.trim() || '';
  return '';
};

/**
 * generateAiImage — מייצר תמונה ומחזיר dataUrl.
 * featureId (אופציונלי) → מכבד API ייעודי לתמונות של הפיצ'ר (מצגות/SPSS).
 * provider/model (אופציונליים) → override פר-קריאה (בורר המדיה בסיידבר) מעל cfg.imageGen.
 */
export const generateAiImage = async (prompt, { signal, featureId = '', provider: providerOverride = '', model: modelOverride = '', aspectRatio = '16:9' } = {}) => {
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt) throw new Error('חסר תיאור ליצירת התמונה.');
  const cfg = (featureId && getFeatureImageConfig(featureId)) || getProviderConfig();
  const gen = { ...(cfg.imageGen || {}) };
  if (providerOverride) gen.provider = providerOverride;
  if (modelOverride) gen.model = modelOverride;
  const provider = gen.provider || 'gemini';
  const key = resolveImageGenKey(gen, cfg);
  const finish = (dataUrl) => ({ source: 'ai', dataUrl, url: '', alt: cleanPrompt, query: cleanPrompt, model: String(gen.model || '').trim(), provider, attribution: 'נוצר ב-AI' });

  if (provider === 'openai') {
    if (!key) throw new Error('לא הוגדר מפתח OpenAI ליצירת תמונות.');
    return finish(await generateOpenAiImage(cleanPrompt, key, gen.model, signal));
  }
  if (provider === 'stability') {
    if (!key) throw new Error('לא הוגדר מפתח Stability AI ליצירת תמונות.');
    return finish(await generateStabilityImage(cleanPrompt, key, gen.model, signal));
  }
  if (provider === 'xai') {
    if (!key) throw new Error('לא הוגדר מפתח xAI ליצירת תמונות.');
    return finish(await generateXaiImage(cleanPrompt, key, gen.model, signal));
  }
  if (provider === 'flux') {
    if (!key) throw new Error('לא הוגדר מפתח fal.ai (FLUX) ליצירת תמונות.');
    return finish(await generateFluxImage(cleanPrompt, key, gen.model, signal));
  }
  if (!key) throw new Error('לא הוגדר מפתח Gemini ליצירת תמונות.');
  return finish(await generateGeminiImage(cleanPrompt, key, gen.model, signal, aspectRatio));
};

// ── בדיקת חיבור ליצירת מדיה ──────────────────────────────────────────────────
// שתי רמות בכוונה: בדיקה חינמית (מפתח תקף + המודל באמת מוגש למפתח הזה) לעומת
// יצירה אמיתית שעולה כסף. הבדיקה החינמית תופסת בדיוק את המקרה שנצפה בפועל —
// מפתח AI Studio תקין שאינו מגיש imagen-* וה-:predict מחזיר 404.
const listRemoteModelIds = async ({ provider, key, signal }) => {
  if (provider === 'gemini') {
    const { body } = await httpRequest({ url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=1000`, method: 'GET', signal });
    const data = JSON.parse(body || '{}');
    return (Array.isArray(data.models) ? data.models : []).map((entry) => String(entry?.name || '').replace(/^models\//, '')).filter(Boolean);
  }
  if (provider === 'openai' || provider === 'xai') {
    const url = provider === 'openai' ? 'https://api.openai.com/v1/models' : 'https://api.x.ai/v1/models';
    const { body } = await httpRequest({ url, method: 'GET', headers: { Authorization: `Bearer ${key}` }, signal });
    const data = JSON.parse(body || '{}');
    return (Array.isArray(data.data) ? data.data : []).map((entry) => String(entry?.id || '')).filter(Boolean);
  }
  if (provider === 'stability') {
    // אין endpoint לרשימת מנועים בכל החשבונות — פרטי החשבון מאמתים את המפתח.
    await httpRequest({ url: 'https://api.stability.ai/v1/user/account', method: 'GET', headers: { Authorization: `Bearer ${key}` }, signal });
    return [];
  }
  return [];
};

/**
 * testMediaGenConnection — בדיקה חינמית: המפתח תקף, והמודל המבוקש מוגש לו.
 * @returns {Promise<{ok:boolean, message:string, models?:string[], warning?:string}>}
 */
export const testMediaGenConnection = async ({ kind = 'image', provider = '', model = '', key = '', signal } = {}) => {
  const cfg = getProviderConfig();
  const section = kind === 'video' ? (cfg.videoGen || {}) : (cfg.imageGen || {});
  const activeProvider = String(provider || section.provider || 'gemini').trim();
  const activeModel = String(model || section.model || '').trim();
  const activeKey = String(key || '').trim() || resolveImageGenKey({ ...section, provider: activeProvider }, cfg);
  if (!activeKey) return { ok: false, message: 'לא הוגדר מפתח — הזן מפתח או השאר ריק כדי להשתמש במפתח הראשי של הספק.' };
  if (activeProvider === 'flux') {
    return { ok: true, message: 'המפתח נשמר. ל-fal.ai אין בדיקה חינמית — השתמש ב"צור תמונת בדיקה" כדי לוודא בפועל.', models: [] };
  }
  try {
    const models = await listRemoteModelIds({ provider: activeProvider, key: activeKey, signal });
    if (!models.length) return { ok: true, message: 'המפתח תקף ✅', models: [] };
    const served = activeModel && models.some((id) => id === activeModel || id.startsWith(`${activeModel}-`));
    if (activeModel && !served) {
      const family = kind === 'video' ? /^veo-/i : /(imagen|image|dall-e|grok-2-image|stable-diffusion)/i;
      const alternatives = models.filter((id) => family.test(id)).slice(0, 4);
      return {
        ok: false,
        message: `המפתח תקף, אבל המודל "${activeModel}" לא מוגש לו — יצירה תיכשל (404).`,
        warning: alternatives.length ? `מודלים זמינים אצלך: ${alternatives.join(', ')}` : 'לא נמצאו מודלים מתאימים למפתח הזה.',
        models,
      };
    }
    return { ok: true, message: `המפתח תקף והמודל זמין ✅ (${models.length} מודלים בחשבון)`, models };
  } catch (error) {
    return { ok: false, message: `הבדיקה נכשלה: ${String(error?.message || error).slice(0, 200)}` };
  }
};

/**
 * runMediaGenSmokeTest — יצירה אמיתית קטנה. **עולה כסף** (סנטים בודדים) ולכן
 * נקראת רק מלחיצה מפורשת של המשתמש אחרי אזהרת מחיר.
 */
export const runMediaGenSmokeTest = async ({ provider = '', model = '', signal } = {}) => {
  const result = await generateAiImage('A small blue circle centered on a plain white background', {
    provider, model, signal, aspectRatio: '1:1',
  });
  return { ok: true, dataUrl: result.dataUrl, model: result.model || model };
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
export const getImageSourceAvailability = (cfg = null, featureId = '') => {
  const config = cfg || (featureId && getFeatureImageConfig(featureId)) || getProviderConfig();
  const gen = config.imageGen || {};
  const aiKey = resolveImageGenKey(gen, config);
  return {
    stock: Boolean(config.imageProvider === 'unsplash' ? config.unsplash?.key?.trim() : config.pexels?.key?.trim()),
    stockProvider: config.imageProvider || 'pexels',
    ai: Boolean(aiKey),
    aiProvider: gen.provider || 'gemini',
  };
};
