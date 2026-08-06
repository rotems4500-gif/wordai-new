// clipUploadService — צד המפיק של תיבת הקליפים: טלפון (PWA) → מחשב.
//
// התוסף (extension/src/lib/clipWriter.js) כותב את אותה סכימה בדיוק ל-
// users/{uid}/clips/{clipId}; כאן מייצרים אותה מהאתר כדי שצילום מהטלפון
// ייקלט בדסקטופ דרך clipInboxService בלי שום שינוי בצד הקולט.
// ⚠️ לא מייבאים מ-extension/ — build נפרד. הקוד מועתק במכוון.

import { uploadClipImage, createClipDoc } from '../firebase/services';
import { getClipDefaultDestination } from './clipInboxService';

// מזהה זהה בפורמט לזה של התוסף.
function makeClipId() {
  const rand = Math.random().toString(36).slice(2, 6);
  return `clip-${Date.now().toString(36)}-${rand}`;
}

// הקטנה לפני העלאה: צילום מצלמה בטלפון הוא 4-12MB, וה-OCR בצד הקולט מגדיל
// ×2 ממילא כשהתמונה קטנה. 2400px בצלע הארוכה שומר קריאות טקסט ומוריד את
// ההעלאה לסדר גודל של מאות KB (ההיפך מ-upscaleForOcr ב-clipInboxService).
const MAX_LONG_EDGE = 2400;
const JPEG_QUALITY = 0.85;

async function downscaleImage(file) {
  try {
    const bmp = await createImageBitmap(file);
    const longEdge = Math.max(bmp.width, bmp.height);
    if (longEdge <= MAX_LONG_EDGE) {
      return { bytes: new Uint8Array(await file.arrayBuffer()), contentType: file.type || 'image/png' };
    }
    const scale = MAX_LONG_EDGE / longEdge;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) throw new Error('canvas-toBlob-failed');
    return { bytes: new Uint8Array(await blob.arrayBuffer()), contentType: 'image/jpeg' };
  } catch {
    // תמונה שלא נפתחת ב-createImageBitmap — מעלים כמו שהיא, ה-OCR ינסה עליה.
    return { bytes: new Uint8Array(await file.arrayBuffer()), contentType: file.type || 'image/png' };
  }
}

/**
 * שולח תמונה (צילום מהטלפון) כקליפ ממתין, לקליטה במחשב.
 * @param {{user:object, file:File|Blob, title?:string, destination?:string|null}} params
 * @returns {Promise<{clipId:string}>}
 */
export async function sendImageClipToDesktop({ user, file, title = '', destination = null }) {
  if (!user?.uid) throw new Error('צריך להתחבר לחשבון כדי לשלוח למחשב');
  if (!file) throw new Error('לא נבחרה תמונה');

  const clipId = makeClipId();
  const { bytes, contentType } = await downscaleImage(file);

  let storagePath;
  try {
    storagePath = await uploadClipImage(user, { clipId, bytes, contentType });
  } catch (error) {
    throw new Error(`העלאת התמונה נכשלה: ${error?.message || 'שגיאה לא ידועה'}`);
  }

  try {
    await createClipDoc(user, clipId, {
      kind: 'image',
      status: 'pending',
      captureMode: 'phone-camera',
      title: String(title || '').trim() || 'צילום מהטלפון',
      text: null,
      fileName: null,
      sourceUrl: null,
      domain: '',
      destination: destination || getClipDefaultDestination(),
      projectId: null,
      storagePath,
      truncated: false,
      errorMessage: null,
      processedAt: null,
      // שדות תוספתיים — הקליטה מתעלמת משדות שאינה מכירה.
      origin: 'pwa',
      contentType,
    });
  } catch (error) {
    throw new Error(`שמירת הקליפ נכשלה: ${error?.message || 'שגיאה לא ידועה'}`);
  }

  return { clipId };
}
