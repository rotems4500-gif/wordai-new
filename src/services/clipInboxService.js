// clipInboxService — קליטת קליפים מתוסף הדפדפן (WordFlow Clipper).
//
// התוסף כותב מסמכי clip ל-users/{uid}/clips (טקסט ב-Firestore, תמונות ב-Storage);
// השירות הזה עושה poll עצמאי, מריץ OCR על תמונות באפליקציה (התוסף רזה בכוונה),
// ומנתב לפי destination: חומר עזר (ברירת מחדל) / זיכרון פרויקט / תיבת דואר.
//
// ⚠️ מנותק בכוונה מ-cloudSyncManager — הסנכרון שם הוא blob הגדרות עם schema
// versioning עדין; לקליפים אין שום קשר אליו מלבד אותו משתמש מחובר.

import {
  fetchPendingClips,
  updateClipStatus,
  downloadClipImageBytes,
  deleteClipImage,
  deleteClipDoc,
} from '../firebase/services';
import { extractImageOcr, pureTokenRatio, extractMaterialTextFromBytes, renderPdfPageToDataUrl } from './materialExtractBrowser';
import { makeImageThumbnailDataUrl, isPdfClip } from './clipPreviewService';
import { addMaterialDocument, commitMaterialStore, ensureMaterialStoreReady } from './materialChunkStore';
import { ensureMaterialsEmbedded } from './evidenceMatchService';
import { attachMaterialToProject, appendProjectMemory } from './projectService';
import { saveClipAsHelperMaterial } from './workspaceLearningService';
import { isDesktopApp } from '../platform';

const POLL_INTERVAL_MS = 5000;
const CLIP_DEFAULT_DESTINATION_KEY = 'wordai_clip_default_destination';
const CLIP_ROLE_KEY = 'wordai_clip_client_role';
const CLIP_REQUIRE_REVIEW_KEY = 'wordai_clip_require_review';
const CLIP_REVIEW_HINT_KEY = 'wordai_clip_review_hint_shown';
export const CLIP_INGESTED_EVENT = 'wordai-clip-ingested';
// מדווח על התחלת OCR ארוך. בלי זה קליטת PDF סרוק נראית כמו תקיעה: OCR רץ
// ~8 שניות לעמוד, וה-toast היחיד מגיע רק בסוף.
export const CLIP_PROGRESS_EVENT = 'wordai-clip-progress';

// שער איכות ל-OCR: מתחת לרצפה לא זורקים (המשתמש בחר לגזור את התמונה במפורש) —
// מסמנים low-confidence כדי שה-UI יציג אזהרה. אותה רצפה כמו GARBLE_FLOOR.
const OCR_QUALITY_FLOOR = 0.5;

let pollTimer = null;
let currentUser = null;
let ingestInFlight = false;
// קליפ שיועד לתיבת הדואר נשאר pending בכוונה — ולכן כל סבב פולינג "קולט" אותו שוב.
// בלי הסט הזה הפאנל נטען מחדש וה-toast חוזר כל 5 שניות. מוכרז פעם אחת בלבד.
const announcedInboxClipIds = new Set();

export function getClipDefaultDestination() {
  const v = localStorage.getItem(CLIP_DEFAULT_DESTINATION_KEY) || 'material';
  return ['material', 'source', 'inbox'].includes(v) ? v : 'material';
}

export function setClipDefaultDestination(value) {
  if (!['material', 'source', 'inbox'].includes(value)) return;
  localStorage.setItem(CLIP_DEFAULT_DESTINATION_KEY, value);
}

// תפקיד הלקוח מול תיבת הקליפים: 'consumer' קולט (OCR + מחיקה מהענן), 'producer'
// רק שולח. בלי השער הזה PWA פתוח בטלפון בולע קליפים לתוך IndexedDB מקומי ומוחק
// אותם מהענן — והמחשב לא רואה אותם לעולם.
// ברירת מחדל: אפליקציית דסקטופ או מסך רחב = consumer; טלפון = producer.
// הערכה פעם אחת בזמן התחברות (ה-effect רץ רק על שינוי משתמש) — רוטציית מסך
// באמצע session לא הופכת טלפון לצרכן.
export function getClipClientRole() {
  try {
    const stored = localStorage.getItem(CLIP_ROLE_KEY);
    if (stored === 'consumer' || stored === 'producer') return stored;
  } catch { /* localStorage חסום — נופל לברירת מחדל */ }
  return (isDesktopApp() || window.innerWidth > 640) ? 'consumer' : 'producer';
}

export function setClipClientRole(value) {
  if (value !== 'consumer' && value !== 'producer') return;
  try { localStorage.setItem(CLIP_ROLE_KEY, value); } catch { /* noop */ }
}

// שער סקירה: כשהוא דלוק שום קליפ לא נכנס לעבודה לבד — הכל ממתין בתיבה לאישור.
// כבוי כברירת מחדל (התנהגות קיימת: קליטה אוטומטית לפי destination).
export function getClipRequireReview() {
  try {
    return localStorage.getItem(CLIP_REQUIRE_REVIEW_KEY) === '1';
  } catch { return false; }
}

export function setClipRequireReview(value) {
  try {
    if (value) localStorage.setItem(CLIP_REQUIRE_REVIEW_KEY, '1');
    else localStorage.removeItem(CLIP_REQUIRE_REVIEW_KEY);
  } catch { /* noop */ }
}

// רמז חד-פעמי: בפעם הראשונה שקליפ נקלט לבד, מספרים למשתמש שיש שער סקירה.
function consumeReviewHint() {
  if (getClipRequireReview()) return false;
  try {
    if (localStorage.getItem(CLIP_REVIEW_HINT_KEY) === '1') return false;
    localStorage.setItem(CLIP_REVIEW_HINT_KEY, '1');
    return true;
  } catch { return false; }
}

// תמונת תצוגה קבועה לקליפ (נשמרת עם חומר העזר). כשל כאן לעולם לא מפיל קליטה.
const CLIP_THUMBNAIL_MAX_WIDTH = 320;
const CLIP_THUMBNAIL_QUALITY = 0.7;
async function buildClipThumbnail(clip, bytes) {
  try {
    if (clip.kind === 'image') {
      return await makeImageThumbnailDataUrl(bytes, {
        maxWidth: CLIP_THUMBNAIL_MAX_WIDTH,
        quality: CLIP_THUMBNAIL_QUALITY,
      });
    }
    // אותו זיהוי כמו התצוגה המקדימה (שם **או** magic bytes) — בזיהוי לפי שם בלבד
    // PDF בלי סיומת קיבל ממוזערת בתיבה ולא שמר אף אחת בחומר העזר.
    if (isPdfClip(clip.fileName, bytes)) {
      const { dataUrl } = await renderPdfPageToDataUrl(bytes, {
        page: 1,
        maxWidth: CLIP_THUMBNAIL_MAX_WIDTH,
        quality: CLIP_THUMBNAIL_QUALITY,
      });
      return dataUrl || '';
    }
  } catch (err) {
    console.error('[clipInbox] thumbnail failed', err);
  }
  return '';
}

// upscale ×2 לפני OCR — נמדד בharness (6.8.26): עברית 11px עלתה מ-recall 0.72
// ל-0.96 אחרי ההגדלה (אותו עיקרון כמו OCR_PAGE_SCALE=2.0 בנתיב ה-PDF).
// תמונות גדולות ממילא לא מוגדלות — רק בזבוז זמן וזיכרון canvas.
const OCR_UPSCALE_MAX_SOURCE_WIDTH = 1600;
async function upscaleForOcr(uint8) {
  try {
    const bmp = await createImageBitmap(new Blob([uint8]));
    if (bmp.width >= OCR_UPSCALE_MAX_SOURCE_WIDTH) return uint8;
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width * 2;
    canvas.height = bmp.height * 2;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return uint8; // תמונה שלא נפתחת — ניתן ל-OCR לנסות על המקור
  }
}

const clipTitle = (clip) => {
  const t = String(clip.title || '').trim();
  if (t) return t;
  return clip.domain ? `קליפ מ-${clip.domain}` : 'קליפ מהדפדפן';
};

// קליטת קליפ יחיד → מחזיר תוצאה ל-toast/פאנל. זורק במקרה כשל (נתפס בלולאה).
// skipReviewGate=true בניתוב ידני מהפאנל: המשתמש כבר סקר, אין טעם להחזיר לתיבה.
async function ingestClip(user, clip, { skipReviewGate = false } = {}) {
  // ⚠️ הניתוב נקבע **לפני** החילוץ. קליפ שמיועד לתיבה לא צריך OCR בכלל — עד כה
  // קליפ קובץ עבר OCR מלא (שניות לעמוד) גם כשהוא רק המתין לאישור ידני.
  let destination = clip.destination || 'material';
  // destination 'source' בלי פרויקט לא שמיש — נופל ל-inbox (מוצג לניתוב ידני).
  if (destination === 'source' && !clip.projectId) destination = 'inbox';

  const heldForReview = !skipReviewGate && destination !== 'inbox' && getClipRequireReview();
  if (heldForReview) destination = 'inbox';

  if (destination === 'inbox') {
    // ⚠️ מעביר את הקליפ לסטטוס 'held' — **לא** משאיר אותו pending. חלון הקליטה
    // הוא 10 מסמכים בסדר doc-id (= כרונולוגי), כך שעשרה קליפים מוחזקים היו
    // ממלאים אותו לתמיד וקליפ חדש לא היה נקלט ולא מוכרז לעולם.
    // הבייטים ב-Storage **לא** נמחקים — זה כל עניין ההחזקה: תצוגה וקליטה ידנית.
    let holdPersisted = true;
    try {
      await updateClipStatus(user, clip.id, heldForReview
        ? { status: 'held', destination: 'inbox', heldForReview: true }
        : { status: 'held' });
    } catch (err) {
      // הכתיבה נכשלה → המסמך נשאר pending בענן. הסבב הבא ינסה שוב, ובינתיים
      // listInboxClips סובל גם קליפ pending כזה כדי שלא ייעלם מהפאנל.
      console.error('[clipInbox] hold write failed', clip.id, err);
      holdPersisted = false;
    }
    return {
      clipId: clip.id,
      title: clipTitle(clip),
      domain: clip.domain || '',
      destination: 'inbox',
      heldForReview,
      holdPersisted,
      lowConfidenceOcr: false,
      truncated: Boolean(clip.truncated),
      materialId: null,
      chunkCount: 0,
    };
  }

  let text = clip.text || '';
  let cleanDigital = true;
  let lowConfidenceOcr = false;
  let thumbnailDataUrl = '';

  // קליפ קובץ (PDF מצופה Chrome): אותו מחלץ של העלאת חומרים, כולל OCR ל-PDF סרוק.
  if (clip.kind === 'file') {
    const bytes = await downloadClipImageBytes(user, clip.storagePath);
    thumbnailDataUrl = await buildClipThumbnail(clip, bytes);
    const res = await extractMaterialTextFromBytes(clip.fileName || 'clip.pdf', bytes, 200000, {
      ocr: true,
      // מדווח פעם אחת, בעמוד הראשון: משם והלאה זה רק ספירה ומספיק שהמשתמש יודע
      // שזה רץ וכמה זמן זה ייקח.
      onOcrProgress: ({ page, pages }) => {
        if (page !== 1) return;
        window.dispatchEvent(new CustomEvent(CLIP_PROGRESS_EVENT, {
          detail: { title: clipTitle(clip), pages, phase: 'ocr' },
        }));
      },
    });
    if (!res.ok) throw new Error(res.error || 'חילוץ הקובץ נכשל');
    text = res.text || '';
    cleanDigital = !res.viaOcr;
    lowConfidenceOcr = Boolean(res.viaOcr) && pureTokenRatio(text) < OCR_QUALITY_FLOOR;
  }

  if (clip.kind === 'image') {
    const bytes = await downloadClipImageBytes(user, clip.storagePath);
    thumbnailDataUrl = await buildClipThumbnail(clip, bytes);
    text = await extractImageOcr(await upscaleForOcr(bytes));
    cleanDigital = false;
    if (!String(text || '').trim()) {
      throw new Error('ה-OCR לא זיהה טקסט בתמונה');
    }
    lowConfidenceOcr = pureTokenRatio(text) < OCR_QUALITY_FLOOR;
  }

  if (!String(text || '').trim()) {
    throw new Error('קליפ ריק — אין טקסט לקליטה');
  }

  const result = {
    clipId: clip.id,
    title: clipTitle(clip),
    domain: clip.domain || '',
    destination,
    heldForReview: false,
    lowConfidenceOcr,
    truncated: Boolean(clip.truncated),
    materialId: null,
    chunkCount: 0,
  };

  if (destination === 'source') {
    appendProjectMemory(clip.projectId, {
      source: 'web-clip',
      title: result.title,
      summary: String(text).slice(0, 800),
      sourceUrl: clip.sourceUrl || '',
      rawExcerpt: String(text).slice(0, 1200),
    });
    return result;
  }

  // material (ברירת מחדל)
  let clipCourseId = null;
  try {
    const { deriveCourseIdForIngest } = await import('./activeCourseService');
    clipCourseId = deriveCourseIdForIngest(clip.projectId || null);
  } catch {}
  const added = addMaterialDocument({
    title: result.title,
    text,
    source: 'web-clip',
    sourceUrl: clip.sourceUrl || null,
    projectId: clip.projectId || null,
    courseId: clipCourseId,
    cleanDigital,
    strength: 'full',
    defer: true,
  });
  result.materialId = added?.materialId || null;
  result.chunkCount = added?.added || 0;
  if (clip.projectId && result.materialId) {
    attachMaterialToProject(clip.projectId, result.materialId);
  }
  // ...וגם לרשימת חומרי הפרויקט — זו הרשימה שהמשתמש רואה במסך הבית.
  // כשל כאן לא מפיל את הקליטה: הראיה כבר באינדקס.
  await saveClipAsHelperMaterial({
    title: result.title,
    text,
    sourceUrl: clip.sourceUrl || '',
    projectId: clip.projectId || '',
    courseId: clipCourseId || '',
    thumbnailDataUrl,
  }).catch((err) => console.error('[clipInbox] saveClipAsHelperMaterial failed', err));
  return result;
}

// מעבד את כל הקליפים הממתינים. מחזיר את תוצאות הקליטה (לניצול ע"י toast).
export async function ingestPendingClips(user = currentUser) {
  if (!user?.uid || ingestInFlight) return [];
  ingestInFlight = true;
  const results = [];
  try {
    const pending = await fetchPendingClips(user, 10);
    if (!pending.length) return [];

    // ⚠️ חובה לפני addMaterialDocument: החנות נטענת מ-IndexedDB אסינכרונית, והפולינג
    // מתחיל מיד אחרי ההתחברות. בלי ההמתנה readMaterialStore() מחזיר בלוב ריק, הקליפ
    // נכתב לתוכו, וההידרציה שמסתיימת אחר כך דורסת אותו — toast מצליח וחומר לא קיים.
    await ensureMaterialStoreReady();

    let addedMaterials = false;
    for (const clip of pending) {
      try {
        const result = await ingestClip(user, clip);
        if (result.destination === 'inbox') {
          // מוכרז פעם אחת בלבד. גם אם כתיבת ה-'held' נכשלה לא מכריזים שוב (אחרת
          // toast כל 5 שניות) — הכתיבה עצמה נוסה שוב בכל סבב, והפאנל מציג את
          // הקליפ גם בלעדיה.
          if (!announcedInboxClipIds.has(clip.id)) {
            announcedInboxClipIds.add(clip.id);
            results.push(result);
          }
          continue;
        }
        // רמז חד-פעמי על שער הסקירה — נתלה על הקליטה האוטומטית הראשונה בלבד.
        if (consumeReviewHint()) result.reviewHint = true;
        results.push(result);
        if (result.destination === 'material') addedMaterials = true;
        await updateClipStatus(user, clip.id, { status: 'processed' });
        if (clip.storagePath) { // תמונה או קובץ — הבייטים כבר חולצו לטקסט
          await deleteClipImage(user, clip.storagePath);
        }
      } catch (err) {
        console.error('[clipInbox] ingest failed for clip', clip.id, err);
        const message = String(err?.message || err);
        await updateClipStatus(user, clip.id, { status: 'error', errorMessage: message })
          .catch(() => {});
        // נכנס ל-results כדי שה-toast ידווח על הכישלון. עד כה כשל היה שקט לחלוטין:
        // הקליפ סומן error, נפל מ-fetchPendingClips, ונעלם מהפאנל בלי חיווי.
        results.push({
          clipId: clip.id,
          title: clipTitle(clip),
          domain: clip.domain || '',
          failed: true,
          errorMessage: message,
        });
      }
    }

    if (addedMaterials) {
      commitMaterialStore();
      // אותה לולאה כמו העלאת קבצים בשלד: ממשיכים עד שאין שאריות (מוגבל סבבים).
      for (let i = 0; i < 25; i += 1) {
        const { remaining, unavailable } = await ensureMaterialsEmbedded({ limit: 400 });
        if (unavailable || !remaining) break;
      }
    }

    if (results.length) {
      window.dispatchEvent(new CustomEvent(CLIP_INGESTED_EVENT, { detail: { results } }));
    }
    return results;
  } finally {
    ingestInFlight = false;
  }
}

// --- API לפאנל תיבת הדואר (ClipInboxPanel) ---

// קליפים שממתינים בתיבה.
// 'held' = הוחזק לסקירה (הסטטוס החדש). 'pending' עדיין נדרש בשני מקרים:
// מסמכים שנכתבו לפני מעבר הסטטוס, וקליפ שכתיבת ההחזקה שלו נכשלה או שטרם רצה.
export async function listInboxClips(user = currentUser) {
  if (!user?.uid) return [];
  const clips = await fetchPendingClips(user, 25, ['pending', 'held', 'error']);
  const gateOn = getClipRequireReview();
  return clips.filter((clip) => {
    if (clip.status === 'error') return true; // כשל קליטה — מוצג עם הסיבה, לניתוב חוזר
    if (clip.status === 'held' || clip.heldForReview) return true;
    const dest = clip.destination || 'material';
    if (dest === 'inbox' || (dest === 'source' && !clip.projectId)) return true;
    // שער הסקירה דלוק: כל קליפ שעדיין pending ייעצר כאן ממילא. מציגים אותו מיד,
    // גם אם כתיבת ה-'held' נכשלה — אחרת הוא מוכרז פעם אחת ואז נעלם לתמיד.
    return gateOn;
  });
}

// ניתוב ידני של קליפ מהתיבה: קולט עם destination/projectId שנבחרו עכשיו.
export async function routeInboxClip(user, clip, { destination, projectId = null }) {
  await ensureMaterialStoreReady(); // ר' ההערה ב-ingestPendingClips
  const resolved = { ...clip, destination, projectId };
  // המשתמש בחר במפורש מהתיבה — שער הסקירה כבר מוצה, אחרת הקליפ היה חוזר אליה.
  const result = await ingestClip(user || currentUser, resolved, { skipReviewGate: true });
  if (result.destination === 'material') {
    commitMaterialStore();
    for (let i = 0; i < 25; i += 1) {
      const { remaining, unavailable } = await ensureMaterialsEmbedded({ limit: 400 });
      if (unavailable || !remaining) break;
    }
  }
  if (result.destination !== 'inbox') {
    await updateClipStatus(user || currentUser, clip.id, { status: 'processed' });
    if (clip.storagePath) { // תמונה או קובץ — הבייטים כבר חולצו לטקסט
      await deleteClipImage(user || currentUser, clip.storagePath);
    }
  }
  return result;
}

// מחיקת קליפ מהתיבה בלי לקלוט (כולל תמונה יתומה ב-Storage).
export async function discardInboxClip(user, clip) {
  const u = user || currentUser;
  if (clip.storagePath) { // תמונה או קובץ — הבייטים כבר חולצו לטקסט
    await deleteClipImage(u, clip.storagePath);
  }
  await deleteClipDoc(u, clip.id);
}

// מופעל מ-main.jsx ליד initCloudSyncListeners; מחזיר פונקציית עצירה.
export function startClipInboxPolling(user) {
  stopClipInboxPolling();
  // producer (טלפון) לא צורך — אחרת הוא בולע קליפים שנועדו למחשב.
  if (getClipClientRole() !== 'consumer') return () => {};
  currentUser = user || null;
  if (!currentUser?.uid) return () => {};
  ingestPendingClips(currentUser).catch(() => {});
  pollTimer = window.setInterval(() => {
    ingestPendingClips(currentUser).catch(() => {});
  }, POLL_INTERVAL_MS);
  return stopClipInboxPolling;
}

export function stopClipInboxPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
  currentUser = null;
  // הסט חי ברמת המודול ושרד החלפת משתמש — קליפ של המשתמש הבא עם אותו id לא היה
  // מוכרז לעולם. מתנקה גם כשהמכשיר עובר ל-producer.
  announcedInboxClipIds.clear();
}
