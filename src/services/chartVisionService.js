// chartVisionService.js — קריאת גרפים/תמונות של פלט SPSS באמצעות מודל ראייה (vision).
// גרף ב-SPSS הוא תמונה — OCR לא מפענח אותו. כאן שולחים את התמונה למודל מולטימודאלי
// (Gemini / OpenAI / Claude, לפי הקונפיגורציה הקיימת) ומקבלים תיאור טקסטואלי מובנה
// בעברית שנכנס כ-Output רגיל לצינור הבדיקה/פירוש של הסטודיו.
// תעבורה: proxyDesktopHttpRequest בדסקטופ (עוקף CORS), fetch ישיר בדפדפן.

import { proxyDesktopHttpRequest } from './httpTransport';

export const CHART_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];
export const CHART_IMAGE_ACCEPT = CHART_IMAGE_EXTENSIONS.map((ext) => `.${ext}`).join(',');

const IMAGE_MIME_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
};

const VISION_TIMEOUT_MS = 60000;
// ספקים שהמסלול המולטימודאלי שלהם ממומש כאן.
const VISION_CAPABLE_PROVIDERS = ['gemini', 'openai', 'claude'];

export const isChartImageFileName = (fileName = '') => {
  const ext = String(fileName || '').toLowerCase().split('.').pop();
  return CHART_IMAGE_EXTENSIONS.includes(ext);
};

export const imageMimeFromFileName = (fileName = '') => {
  const ext = String(fileName || '').toLowerCase().split('.').pop();
  return IMAGE_MIME_BY_EXT[ext] || 'image/png';
};

// Uint8Array → base64 (בלוקים, בלי לחרוג ממגבלת הארגומנטים של fromCharCode).
export const bytesToBase64 = (bytes) => {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

export const readImageFileAsBase64 = async (file) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    base64: bytesToBase64(bytes),
    mimeType: file.type || imageMimeFromFileName(file.name),
    fileName: file.name || 'chart.png',
  };
};

const CHART_DESCRIPTION_PROMPT = [
  'התמונה המצורפת היא גרף או טבלה מתוך פלט SPSS (או תוכנה סטטיסטית דומה) בעבודה אקדמית.',
  'תאר אותה כטקסט מובנה בעברית, כאילו היא חלק מהפלט הטקסטואלי, כדי שאפשר יהיה לבדוק ולפרש אותה:',
  '1. סוג התרשים (עמודות/פיזור/היסטוגרמה/קו/עוגה/טבלה וכו\') וכותרתו אם קיימת.',
  '2. מה על כל ציר (שם המשתנה/הקטגוריות) כולל יחידות אם מופיעות.',
  '3. הערכים: קרא כל ערך מספרי שמופיע בתווית/ציר. אם ערך לא כתוב במפורש — הערך אותו מהגרף וסמן "≈".',
  '4. המגמה/הדפוס המרכזי (הבדל בין קבוצות, כיוון קשר, התפלגות, חריגים).',
  'אם יש כמה גרפים/טבלאות בתמונה — תאר כל אחד בנפרד.',
  'אם זהו עמוד שלם מתוך פלט שמכיל גם טבלאות וגם גרפים — התמקד בגרפים (הטבלאות בדרך כלל כבר חולצו כטקסט); ציין טבלה רק בשם/כותרת.',
  'אל תמציא נתונים שלא נראים בתמונה. אם התמונה אינה גרף/טבלה סטטיסטית — כתוב זאת במפורש.',
  'ענה בטקסט בלבד, בלי Markdown, קצר וענייני.',
].join('\n');

const postJson = async (url, headers, bodyObj, signal) => {
  const bodyStr = JSON.stringify(bodyObj);
  const desktopResult = await proxyDesktopHttpRequest(
    { url, method: 'POST', headers, body: bodyStr, timeoutMs: VISION_TIMEOUT_MS },
    signal,
  );
  if (desktopResult) {
    if (!desktopResult.ok) {
      throw new Error(`${desktopResult.status}: ${String(desktopResult.body || '').slice(0, 200)}`);
    }
    return JSON.parse(desktopResult.body || '{}');
  }
  const res = await fetch(url, { method: 'POST', headers, body: bodyStr, signal });
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${String(txt).slice(0, 200)}`);
  }
  return res.json();
};

const describeWithGemini = async ({ key, model, base64, mimeType }, signal) => {
  const cleanModel = String(model || '').trim() || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(key)}`;
  const data = await postJson(url, { 'Content-Type': 'application/json' }, {
    contents: [{
      role: 'user',
      parts: [
        { text: CHART_DESCRIPTION_PROMPT },
        { inline_data: { mime_type: mimeType, data: base64 } },
      ],
    }],
  }, signal);
  return String(data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '').trim();
};

const describeWithOpenAI = async ({ key, model, base64, mimeType }, signal) => {
  const cleanModel = String(model || '').trim() || 'gpt-4o-mini';
  const data = await postJson('https://api.openai.com/v1/chat/completions', {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
  }, {
    model: cleanModel,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: CHART_DESCRIPTION_PROMPT },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
      ],
    }],
  }, signal);
  return String(data.choices?.[0]?.message?.content || '').trim();
};

const describeWithClaude = async ({ key, model, base64, mimeType }, signal) => {
  const cleanModel = String(model || '').trim() || 'claude-haiku-4-5-20251001';
  const data = await postJson('https://api.anthropic.com/v1/messages', {
    'Content-Type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }, {
    model: cleanModel,
    max_tokens: 1200,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
        { type: 'text', text: CHART_DESCRIPTION_PROMPT },
      ],
    }],
  }, signal);
  return String((data.content || []).map((part) => part.text || '').join('') || '').trim();
};

const DESCRIBERS = { gemini: describeWithGemini, openai: describeWithOpenAI, claude: describeWithClaude };

// בחירת מסלול vision: קודם ה-API הייעודי של פיצ'ר ה-SPSS, אחר כך הספק הפעיל,
// ולבסוף כל ספק vision מוגדר אחר (gemini → openai → claude).
const resolveVisionRoute = async () => {
  const { getProviderConfig, getFeatureProviderConfig } = await import('./aiService.js');
  const cfg = getProviderConfig();
  const feat = getFeatureProviderConfig('spss', cfg);
  const candidates = [];
  if (feat?.providerId) candidates.push({ providerId: feat.providerId, model: feat.model || '', config: feat.config || cfg });
  candidates.push({ providerId: String(cfg?.active || '').trim(), model: '', config: cfg });
  VISION_CAPABLE_PROVIDERS.forEach((providerId) => candidates.push({ providerId, model: '', config: cfg }));

  for (const candidate of candidates) {
    const providerId = String(candidate.providerId || '').trim();
    if (!VISION_CAPABLE_PROVIDERS.includes(providerId)) continue;
    const providerCfg = candidate.config?.[providerId] || {};
    const key = String(providerCfg.key || '').trim();
    if (!key) continue;
    return {
      providerId,
      key,
      model: String(candidate.model || providerCfg.model || '').trim(),
    };
  }
  throw new Error('קריאת גרפים דורשת מפתח לספק עם ראייה (Gemini / OpenAI / Claude). הגדר מפתח בהגדרות → ספקי AI.');
};

/**
 * describeChartImage — מתאר תמונת גרף/טבלה מפלט SPSS כטקסט עברי מובנה.
 * @param {{base64:string, mimeType:string, fileName?:string}} image
 * @returns {Promise<{text:string, providerId:string, model:string}>}
 */
export const describeChartImage = async (image, { signal } = {}) => {
  const route = await resolveVisionRoute();
  const describe = DESCRIBERS[route.providerId];
  const text = await describe({ key: route.key, model: route.model, base64: image.base64, mimeType: image.mimeType }, signal);
  if (!text) throw new Error('המודל לא החזיר תיאור לתמונה.');
  return { text, providerId: route.providerId, model: route.model };
};

// --- חילוץ תמונות גרפים מקבצים עשירים (docx / pdf) ---
// SPSS מדביק גרפים ל-Word כ-EMF (וקטורי של Windows) — דפדפן לא מרנדר אותו, אז
// סופרים ומדווחים. ב-PDF הגרפים הופכים לתוכן עמוד רגיל — מרנדרים את העמודים
// שמכילים תמונות ל-PNG ושולחים ל-vision.

const DOCX_MEDIA_IMAGE_PATTERN = /^word\/media\/.*\.(png|jpe?g|gif|bmp|webp)$/i;
const DOCX_MEDIA_VECTOR_PATTERN = /^word\/media\/.*\.(emf|wmf)$/i;
const MAX_EMBEDDED_CHART_IMAGES = 8;
const MIN_CHART_IMAGE_BASE64_LENGTH = 4000; // ~3KB — מסנן אייקונים/לוגואים

export const extractDocxChartImages = async (bytes) => {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(bytes);
  const paths = Object.keys(zip.files).filter((path) => !zip.files[path].dir);
  const vectorCount = paths.filter((path) => DOCX_MEDIA_VECTOR_PATTERN.test(path)).length;
  const images = [];
  for (const path of paths.filter((p) => DOCX_MEDIA_IMAGE_PATTERN.test(p)).sort().slice(0, MAX_EMBEDDED_CHART_IMAGES)) {
    try {
      const base64 = await zip.files[path].async('base64');
      if (base64.length < MIN_CHART_IMAGE_BASE64_LENGTH) continue;
      images.push({ base64, mimeType: imageMimeFromFileName(path), fileName: path.split('/').pop() });
    } catch {
      /* דלג על תמונה לא קריאה */
    }
  }
  return { images, vectorCount };
};

// עמוד "עם גרפיקה": תמונה מוטמעת, או ציור וקטורי משמעותי. גרפים ש-Word מייצא
// ל-PDF הם וקטורים (לא תמונות!) — נמדד על פלט SPSS אמיתי: עמודי גרף/טבלה מגיעים
// ל-60–1600 פקודות constructPath, עמוד טקסט נקי נשאר מתחת לעשרות בודדות.
const MIN_VECTOR_PATH_OPS_FOR_CHART_PAGE = 40;

export const extractPdfChartPageImages = async (bytes, { maxPages = 8 } = {}) => {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const images = [];
  try {
    for (let i = 1; i <= doc.numPages && images.length < maxPages; i += 1) {
      const page = await doc.getPage(i);
      const ops = await page.getOperatorList();
      const hasEmbeddedImage = ops.fnArray.some((fn) => fn === pdfjs.OPS.paintImageXObject
        || fn === pdfjs.OPS.paintImageXObjectRepeat
        || fn === pdfjs.OPS.paintJpegXObject);
      const vectorPathOps = ops.fnArray.reduce((count, fn) => (fn === pdfjs.OPS.constructPath ? count + 1 : count), 0);
      if (!hasEmbeddedImage && vectorPathOps < MIN_VECTOR_PATH_OPS_FOR_CHART_PAGE) continue;
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      const dataUrl = canvas.toDataURL('image/png');
      const base64 = dataUrl.split(',')[1] || '';
      if (base64) images.push({ base64, mimeType: 'image/png', fileName: `עמוד ${i}` });
    }
  } finally {
    try { await doc.destroy(); } catch { /* no-op */ }
  }
  return { images };
};

/**
 * describeChartImages — מתאר כמה תמונות ומחזיר בלוק טקסט אחוד לשדה הפלט.
 * כשל בתמונה בודדת לא מפיל את השאר — נרשם ככשל בבלוק.
 */
export const describeChartImages = async (images = [], { signal } = {}) => {
  const blocks = [];
  let providerId = '';
  let model = '';
  let failures = 0;
  for (const image of images) {
    const label = image.fileName || 'גרף';
    try {
      const result = await describeChartImage(image, { signal });
      providerId = result.providerId;
      model = result.model;
      blocks.push(`=== גרף (מתוך תמונה: ${label}) ===\n${result.text}`);
    } catch (error) {
      failures += 1;
      blocks.push(`=== גרף (מתוך תמונה: ${label}) ===\n[קריאת התמונה נכשלה: ${error instanceof Error ? error.message : 'שגיאה'}]`);
      // אין מסלול vision מוגדר בכלל — אין טעם להמשיך לתמונות הבאות.
      if (!providerId && /מפתח לספק/.test(String(error?.message || ''))) throw error;
    }
  }
  return { text: blocks.join('\n\n'), providerId, model, failures, total: images.length };
};
