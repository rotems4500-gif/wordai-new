// clipPreviewService — תצוגה מקדימה של קליפים לפני קליטה.
//
// ⚠️ עיקרון: כאן **אף פעם לא מריצים OCR**. OCR עולה שניות לעמוד, והתצוגה
// המקדימה נועדה להיות מיידית — הקליטה עצמה (clipInboxService) היא זו שמחלצת
// טקסט. תמונה מוצגת כתמונה, PDF כרינדור של העמוד הראשון, קובץ אופיס כטקסט קצר.
//
// ⚠️ אסור לייבא מ-clipInboxService — הוא מייבא מכאן (מחולל התמונות המשותף),
// וייבוא הדדי היה סוגר מעגל.

import { downloadClipImageBytes } from '../firebase/services';
import { extractMaterialTextFromBytes, renderPdfPageToDataUrl } from './materialExtractBrowser';

const PREVIEW_TEXT_LIMIT = 1500;
const SNIPPET_LIMIT = 400;
// קאש בייטים קטן בכוונה: קליפ PDF הוא מגה-בייטים בודדים, וארבעה כאלה בזיכרון
// זה התקרה הסבירה. משמש את החלון הגדול (רינדור מחדש בלי הורדה חוזרת).
const BYTES_CACHE_MAX = 4;

const previewCache = new Map();   // clipId -> תוצאה
const inFlight = new Map();       // clipId -> Promise
const bytesCache = new Map();     // clipId -> Uint8Array (LRU לפי סדר הכנסה)

// שער מקבילות. פתיחת הפאנל מרנדרת עד 25 שורות בבת אחת, וכל שורה מבקשת תצוגה
// מקדימה — בלי השער האלה 25 הורדות Storage מקבילות ו-25 רינדורי pdf.js בו-זמנית
// על מכונה בלי GPU אמיתי. שלוש משבצות: מספיק כדי שהשורות הראשונות יופיעו מיד.
const PREVIEW_CONCURRENCY = 3;
let activeSlots = 0;
const slotQueue = [];

function acquireSlot() {
  if (activeSlots < PREVIEW_CONCURRENCY) {
    activeSlots += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => { slotQueue.push(resolve); });
}

function releaseSlot() {
  const next = slotQueue.shift();
  if (next) next();          // מעביר את המשבצת הלאה בלי לשחרר את המונה
  else activeSlots -= 1;
}

function rememberBytes(clipId, bytes) {
  if (!clipId || !bytes) return;
  if (bytesCache.has(clipId)) bytesCache.delete(clipId);
  bytesCache.set(clipId, bytes);
  while (bytesCache.size > BYTES_CACHE_MAX) {
    const oldest = bytesCache.keys().next().value;
    bytesCache.delete(oldest);
  }
}

// בייטים שכבר הורדו עבור התצוגה המקדימה — לשימוש החלון המוגדל.
export function getCachedClipBytes(clipId) {
  if (!clipId || !bytesCache.has(clipId)) return null;
  const bytes = bytesCache.get(clipId);
  // מגע = רענון מיקום ב-LRU
  bytesCache.delete(clipId);
  bytesCache.set(clipId, bytes);
  return bytes;
}

// ניקוי — נקרא בסגירת הפאנל, וגם אחרי מחיקה/ניתוב של קליפ בודד.
export function clearClipPreviewCache(clipId = null) {
  if (clipId) {
    previewCache.delete(clipId);
    inFlight.delete(clipId);
    bytesCache.delete(clipId);
    return;
  }
  previewCache.clear();
  inFlight.clear();
  bytesCache.clear();
}

const isPdfBytes = (bytes) => (
  bytes?.length >= 5
  && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d
);

// זיהוי PDF לפי שם **או** magic bytes — קליפ בלי סיומת עדיין PDF. מיוצא כדי
// ש-clipInboxService ישתמש באותו זיהוי בדיוק בבניית התמונה הקבועה.
export const isPdfClip = (fileName, bytes) => (
  /\.pdf$/i.test(String(fileName || '')) || isPdfBytes(bytes)
);

// סיומות תמונה שהמחלץ היה שולח ל-OCR (tesseract, עד ~90 שניות) — כאן הן נחתכות
// לפני שהן מגיעות אליו: תצוגה מקדימה מציגה תמונה, לא מחלצת ממנה טקסט.
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i;

/**
 * הקטנת תמונה ל-data URL. משותף לתצוגה המקדימה ולתמונה הקבועה שנשמרת בקליטה
 * (clipInboxService) — אותו מחולל, כדי שלא ייווצרו שני מסלולי הקטנה שונים.
 */
export async function makeImageThumbnailDataUrl(bytes, { maxWidth = 360, quality = 0.72 } = {}) {
  const bmp = await createImageBitmap(new Blob([bytes]));
  const scale = Math.min(1, maxWidth / (bmp.width || maxWidth));
  const width = Math.max(1, Math.round(bmp.width * scale));
  const height = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  canvas.width = 0;
  canvas.height = 0;
  try { bmp.close(); } catch { /* no-op */ }
  return dataUrl;
}

const snippetFrom = (text, limit = SNIPPET_LIMIT) => {
  const clean = String(text || '').replace(/\s+\n/g, '\n').trim();
  return clean.length > limit ? `${clean.slice(0, limit)}…` : clean;
};

async function buildPreview(user, clip, maxWidth) {
  const base = {
    kind: clip?.kind || 'text',
    thumbnailDataUrl: '',
    textSnippet: '',
    fileName: String(clip?.fileName || ''),
    pageCount: 0,
    byteSize: 0,
    error: '',
  };

  // טקסט — בלי שום רשת.
  if (base.kind !== 'image' && base.kind !== 'file') {
    base.textSnippet = snippetFrom(clip?.text);
    return base;
  }

  if (!clip?.storagePath) {
    base.error = 'לקליפ אין קובץ מצורף';
    return base;
  }

  let bytes;
  try {
    bytes = await downloadClipImageBytes(user, clip.storagePath);
  } catch (err) {
    // 404 = הקליפ נקלט בינתיים והבייטים נמחקו מה-Storage. לא שגיאה אמיתית.
    const code = String(err?.code || err?.message || '');
    base.error = /object-not-found|404/i.test(code)
      ? 'הקובץ כבר נקלט ואינו זמין לתצוגה'
      : 'טעינת התצוגה המקדימה נכשלה';
    return base;
  }

  base.byteSize = bytes?.length || 0;
  rememberBytes(clip.id, bytes);

  try {
    if (base.kind === 'image') {
      base.thumbnailDataUrl = await makeImageThumbnailDataUrl(bytes, { maxWidth });
      return base;
    }

    if (isPdfClip(clip.fileName, bytes)) {
      const { dataUrl, numPages } = await renderPdfPageToDataUrl(bytes, { page: 1, maxWidth });
      base.thumbnailDataUrl = dataUrl;
      base.pageCount = numPages || 0;
      return base;
    }

    // קליפ קובץ עם שם של תמונה (kind==='file' אבל .png/.jpg): תמונה, לא טקסט.
    // בלי הענף הזה הוא נופל למחלץ, ושם ענף התמונות מריץ OCR **בלי להתחשב**
    // ב-ocr:false — עשרות שניות בתוך מה שאמור להיות תצוגה מיידית.
    if (IMAGE_EXT_RE.test(base.fileName)) {
      base.thumbnailDataUrl = await makeImageThumbnailDataUrl(bytes, { maxWidth });
      return base;
    }

    // docx/pptx/xlsx — אין תמונה, רק טעימת טקסט (ocr:false במפורש).
    const res = await extractMaterialTextFromBytes(
      clip.fileName || 'clip.bin',
      bytes,
      PREVIEW_TEXT_LIMIT,
      { ocr: false },
    );
    base.textSnippet = res?.ok ? snippetFrom(res.text) : '';
    if (!res?.ok) base.error = res?.error || 'לא ניתן להציג תצוגה מקדימה לקובץ הזה';
    return base;
  } catch (err) {
    base.error = String(err?.message || err) || 'תצוגה מקדימה נכשלה';
    return base;
  }
}

/**
 * תצוגה מקדימה לקליפ. כל כשל אינו קטלני — מוחזר {error} וה-UI נופל לאייקון.
 * @returns {Promise<{kind:string, thumbnailDataUrl:string, textSnippet:string,
 *                    fileName:string, pageCount:number, byteSize:number, error:string}>}
 */
export async function getClipPreview(user, clip, { maxWidth = 360 } = {}) {
  const clipId = clip?.id;
  if (!clipId) return { kind: 'text', thumbnailDataUrl: '', textSnippet: '', fileName: '', pageCount: 0, byteSize: 0, error: 'קליפ לא תקין' };
  if (previewCache.has(clipId)) return previewCache.get(clipId);
  if (inFlight.has(clipId)) return inFlight.get(clipId);

  const promise = acquireSlot()
    .then(() => buildPreview(user, clip, maxWidth).finally(releaseSlot))
    .then((result) => {
      previewCache.set(clipId, result);
      return result;
    })
    .finally(() => {
      inFlight.delete(clipId);
    });
  inFlight.set(clipId, promise);
  return promise;
}

/**
 * בייטים של קליפ לחלון המוגדל: מהקאש אם הם שם, אחרת הורדה חוזרת.
 * ⚠️ קאש הבייטים הוא LRU של 4 — עם חמישה קליפי PDF בתיבה הקליפ שנפתח כבר נופה
 * ממנו. בלי ההורדה החוזרת החלון הציג ממוזערת 360px מתוחה ל-900 ודפדוף עמודים
 * שמזיז את המספר ולא את התמונה.
 * @returns {Promise<Uint8Array|null>} null כשאין קובץ מצורף או שההורדה נכשלה.
 */
export async function loadClipBytes(user, clip) {
  const clipId = clip?.id;
  if (!clipId || !clip?.storagePath) return null;
  const cached = getCachedClipBytes(clipId);
  if (cached) return cached;
  await acquireSlot();
  try {
    const bytes = await downloadClipImageBytes(user, clip.storagePath);
    rememberBytes(clipId, bytes);
    return bytes;
  } catch {
    return null; // 404/רשת — החלון נופל לממוזערת ומסתיר את הדפדוף
  } finally {
    releaseSlot();
  }
}

// גודל קריא לבני אדם (KB/MB) — מוצג בשורת המטא של הקליפ.
export function formatByteSize(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return '';
  if (n < 1024) return `${n} בייט`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
