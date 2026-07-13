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
// כמה קריאות vision במקביל. גרפים מרובים/עמודי PDF מרובים נקראים בו-זמנית כדי
// לא לחכות סדרתית (7 עמודים × קריאה סדרתית = דקות; במקביל = כמעט קריאה אחת).
const VISION_CONCURRENCY = 4;
// סמן שהמודל מחזיר לעמוד ללא גרף — מאפשר לזרוק רשת רחבה של עמודי-מועמד ולסנן.
const NO_CHART_SENTINEL = 'NO_CHART';
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

// pageMode=false: המשתמש העלה תמונת גרף מפורשת — תאר אותה תמיד.
// pageMode=true: נשלח עמוד PDF שלם שאולי הוא רק טקסט/טבלה — המודל מסנן עצמו עם NO_CHART.
const buildChartDescriptionPrompt = (pageMode = false) => [
  pageMode
    ? 'התמונה המצורפת היא עמוד שלם מתוך פלט SPSS (או תוכנה סטטיסטית דומה) בעבודה אקדמית. ייתכן שהוא מכיל גרף/תרשים, וייתכן שהוא רק טקסט או טבלאות.'
    : 'התמונה המצורפת היא גרף או טבלה מתוך פלט SPSS (או תוכנה סטטיסטית דומה) בעבודה אקדמית.',
  pageMode
    ? `אם בעמוד אין שום גרף/תרשים ויזואלי (רק טקסט או טבלאות מספריות) — החזר בדיוק את המילה ${NO_CHART_SENTINEL} ותו לא.`
    : '',
  'אחרת, תאר את הגרף/ים כטקסט מובנה בעברית, כאילו הוא חלק מהפלט הטקסטואלי, כדי שאפשר יהיה לבדוק ולפרש אותו:',
  '1. סוג התרשים (עמודות/פיזור/היסטוגרמה/קו/עוגה וכו\') וכותרתו אם קיימת.',
  '2. מה על כל ציר (שם המשתנה/הקטגוריות) כולל יחידות אם מופיעות.',
  '3. הערכים: קרא כל ערך מספרי שמופיע בתווית/ציר. אם ערך לא כתוב במפורש — הערך אותו מהגרף וסמן "≈".',
  '4. המגמה/הדפוס המרכזי (הבדל בין קבוצות, כיוון קשר, התפלגות, חריגים).',
  'אם יש כמה גרפים בתמונה — תאר כל אחד בנפרד.',
  pageMode ? 'התמקד בגרפים בלבד; אל תשכתב טבלאות מספריות (הן כבר חולצו כטקסט) — לכל היותר ציין את שם הטבלה.' : '',
  'אל תמציא נתונים שלא נראים בתמונה.',
  'ענה בטקסט בלבד, בלי Markdown, קצר וענייני.',
].filter(Boolean).join('\n');

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

const describeWithGemini = async ({ key, model, base64, mimeType, prompt }, signal) => {
  const cleanModel = String(model || '').trim() || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(key)}`;
  const data = await postJson(url, { 'Content-Type': 'application/json' }, {
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64 } },
      ],
    }],
  }, signal);
  return String(data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '').trim();
};

const describeWithOpenAI = async ({ key, model, base64, mimeType, prompt }, signal) => {
  const cleanModel = String(model || '').trim() || 'gpt-4o-mini';
  const data = await postJson('https://api.openai.com/v1/chat/completions', {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
  }, {
    model: cleanModel,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
      ],
    }],
  }, signal);
  return String(data.choices?.[0]?.message?.content || '').trim();
};

const describeWithClaude = async ({ key, model, base64, mimeType, prompt }, signal) => {
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
        { type: 'text', text: prompt },
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

// מריץ map במקביל עם תקרת מקביליות (בלי תלות חיצונית).
const mapWithConcurrency = async (items, limit, worker) => {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
};

const describeOneImage = async (image, route, prompt, signal) => {
  const describe = DESCRIBERS[route.providerId];
  return describe({ key: route.key, model: route.model, base64: image.base64, mimeType: image.mimeType, prompt }, signal);
};

/**
 * describeChartImage — מתאר תמונת גרף/טבלה מפלט SPSS כטקסט עברי מובנה.
 * @param {{base64:string, mimeType:string, fileName?:string}} image
 * @returns {Promise<{text:string, providerId:string, model:string}>}
 */
export const describeChartImage = async (image, { signal } = {}) => {
  const route = await resolveVisionRoute();
  const text = await describeOneImage(image, route, buildChartDescriptionPrompt(false), signal);
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

// זיהוי עמוד-גרף ב-PDF שיוצא מ-Word: הגרפים הם ציור וקטורי (constructPath), לא
// תמונות מוטמעות. ספירת paths גולמית לבדה תופסת גם עמודי טקסט/טבלאות (שגם להם
// יש קווים/מסגרות) — נמדד על פלט SPSS אמיתי: עמוד טקסט ~100 paths, עמוד טבלה
// ~200, עמוד תרשים-פיזור 1600. המבחין האמין הוא היחס ציור:טקסט — בעמוד גרף
// הציור שולט על הטקסט, בעמוד טבלה/טקסט הם דומים. עמודי-מועמד נשלחים ל-vision
// עם pageMode, שמסמן עמוד ללא גרף ב-NO_CHART — כך רשת רחבה נשארת בטוחה.
const PDF_CHART_STRONG_PATH_OPS = 300;   // הרבה ציור = כמעט בוודאי גרף (פיזור/קו/היסטוגרמה)
const PDF_CHART_MIN_PATH_OPS = 70;       // סף מינימלי לגרף פשוט (עמודות/עוגה)
const PDF_CHART_PATH_TO_TEXT_RATIO = 2;  // ציור צריך לשלוט על הטקסט בעמוד

const isLikelyChartPage = ({ pathOps, textOps, hasEmbeddedImage }) => {
  if (hasEmbeddedImage) return true;
  if (pathOps >= PDF_CHART_STRONG_PATH_OPS) return true;
  return pathOps >= PDF_CHART_MIN_PATH_OPS && pathOps >= textOps * PDF_CHART_PATH_TO_TEXT_RATIO;
};

export const extractPdfChartPageImages = async (bytes, { maxPages = 10 } = {}) => {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const images = [];
  try {
    for (let i = 1; i <= doc.numPages && images.length < maxPages; i += 1) {
      const page = await doc.getPage(i);
      const ops = await page.getOperatorList();
      let pathOps = 0;
      let textOps = 0;
      let hasEmbeddedImage = false;
      for (const fn of ops.fnArray) {
        if (fn === pdfjs.OPS.constructPath) pathOps += 1;
        else if (fn === pdfjs.OPS.showText) textOps += 1;
        else if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintImageXObjectRepeat || fn === pdfjs.OPS.paintJpegXObject) hasEmbeddedImage = true;
      }
      if (!isLikelyChartPage({ pathOps, textOps, hasEmbeddedImage })) continue;
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

const isNoChartReply = (text = '') => {
  const clean = String(text || '').replace(/[\s.]/g, '').toUpperCase();
  return clean === NO_CHART_SENTINEL.replace(/[\s.]/g, '') || clean.includes('NO_CHART');
};

/**
 * describeChartImages — מתאר כמה תמונות במקביל ומחזיר בלוק טקסט אחוד לשדה הפלט.
 * opts.pageMode — התמונות הן עמודי-מסמך שלמים (PDF): המודל מסמן עמוד ללא גרף
 *   ב-NO_CHART והוא מסונן, כדי שאפשר לזרוק רשת רחבה בלי לזהם את הפלט.
 * @returns {{text, providerId, model, described, noChart, failures, total}}
 */
export const describeChartImages = async (images = [], { signal, pageMode = false } = {}) => {
  if (!images.length) return { text: '', providerId: '', model: '', described: 0, noChart: 0, failures: 0, total: 0 };
  // מסלול אחד לכולם (זריקה מוקדמת אם אין ספק vision מוגדר בכלל).
  const route = await resolveVisionRoute();
  const prompt = buildChartDescriptionPrompt(pageMode);

  const outcomes = await mapWithConcurrency(images, VISION_CONCURRENCY, async (image) => {
    const label = image.fileName || 'גרף';
    try {
      const text = String(await describeOneImage(image, route, prompt, signal) || '').trim();
      if (!text) return { label, status: 'failed', error: 'המודל לא החזיר תיאור' };
      if (pageMode && isNoChartReply(text)) return { label, status: 'no-chart' };
      return { label, status: 'ok', text };
    } catch (error) {
      return { label, status: 'failed', error: error instanceof Error ? error.message : 'שגיאה' };
    }
  });

  const blocks = [];
  let described = 0;
  let noChart = 0;
  let failures = 0;
  for (const outcome of outcomes) {
    if (outcome.status === 'ok') {
      described += 1;
      blocks.push(`=== גרף (${outcome.label}) ===\n${outcome.text}`);
    } else if (outcome.status === 'no-chart') {
      noChart += 1;
    } else {
      failures += 1;
      // ב-pageMode לא מזהמים את הפלט בכשלים לכל עמוד — סופרים בלבד.
      if (!pageMode) blocks.push(`=== גרף (${outcome.label}) ===\n[קריאת התמונה נכשלה: ${outcome.error}]`);
    }
  }
  return { text: blocks.join('\n\n'), providerId: route.providerId, model: route.model, described, noChart, failures, total: images.length };
};
