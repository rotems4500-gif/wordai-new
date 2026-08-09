// courseMaterialCloud.js — חומרי קורס בענן: העלאה, משיכה וסנכרון בין מכשירים.
//
// למה הקובץ המקורי ולא רק הטקסט: mammoth זורק הערות Word, ולכן טקסט שחולץ לא
// מאפשר אבחון רטרואקטיבי של משוב מרצה. שמירת הבייטים בענן גם פותרת את המגבלה
// של רשומות הדפדפן (טקסט בלבד) — במכשיר אחר, ובדפדפן, אפשר למשוך את המקור.
//
// יעדים: Storage `users/{uid}/course-materials/{materialId}/{file}` +
// Firestore `users/{uid}/courseMaterials/{materialId}`. שני הנתיבים כבר מכוסים
// בכללים הקיימים (users/{uid}/**) — אין צורך בפריסת rules.
//
// ⚠️ המודול הזה הוא ה**גבול היחיד** בין שכבת החומרים ל-firebase. הצרכנים
// (workspaceLearningService, ה-UI) טוענים אותו ב-import דינמי כדי שה-harness
// ב-Node לא יגרור את ה-SDK.

import {
  isCloudAvailable,
  getCurrentCloudUser,
  uploadCourseMaterial,
  listCloudCourseMaterials,
  downloadCourseMaterialBytes,
  deleteCloudCourseMaterial,
} from '../firebase/services';

// קובץ גדול מזה לא עולה: העלאה איטית, והתועלת (אבחון הערות) יורדת עם הגודל.
export const MAX_CLOUD_MATERIAL_BYTES = 25 * 1024 * 1024;

const CONTENT_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
};

const extOf = (name) => String(name || '').split('.').pop().toLowerCase();

/** האם יש ענן זמין ומשתמש מחובר. */
export function isCourseCloudReady() {
  try {
    return Boolean(isCloudAvailable() && getCurrentCloudUser()?.uid);
  } catch {
    return false;
  }
}

/**
 * מעלה חומר קורס יחיד לענן.
 * @param {{materialId:string, courseId?:string, fileName:string, bytes:Uint8Array, title?:string}} args
 * @returns {Promise<{ok:boolean, storagePath?:string, reason?:string}>}
 */
export async function uploadCourseMaterialBytes({ materialId, courseId = '', fileName, bytes, title = '' } = {}) {
  if (!isCourseCloudReady()) return { ok: false, reason: 'not-signed-in' };
  if (!bytes?.byteLength) return { ok: false, reason: 'empty' };
  if (bytes.byteLength > MAX_CLOUD_MATERIAL_BYTES) return { ok: false, reason: 'too-large' };

  try {
    const user = getCurrentCloudUser();
    const type = extOf(fileName);
    const { storagePath } = await uploadCourseMaterial(user, {
      materialId,
      courseId,
      fileName,
      bytes,
      contentType: CONTENT_TYPES[type] || 'application/octet-stream',
      meta: { title: title || fileName, type },
    });
    return { ok: true, storagePath };
  } catch (err) {
    return { ok: false, reason: String(err?.message || err) };
  }
}

/**
 * הבייטים המקוריים מהענן — לפי storagePath ששמור על החומר, או לפי materialId.
 * @returns {Promise<{ok:boolean, bytes?:Uint8Array, reason?:string}>}
 */
export async function fetchCourseMaterialBytes(material = {}) {
  if (!isCourseCloudReady()) return { ok: false, reason: 'not-signed-in' };
  try {
    let storagePath = String(material.storagePath || '').trim();
    if (!storagePath) {
      const user = getCurrentCloudUser();
      const cloud = await listCloudCourseMaterials(user, {});
      const hit = cloud.find((c) => c.materialId === material.id || c.fileName === material.file);
      storagePath = hit?.storagePath || '';
    }
    if (!storagePath) return { ok: false, reason: 'not-in-cloud' };
    return { ok: true, bytes: await downloadCourseMaterialBytes(storagePath) };
  } catch (err) {
    return { ok: false, reason: String(err?.message || err) };
  }
}

/** מטא של כל חומרי הקורס בענן (לתצוגת "מה קיים בענן"). */
export async function listCourseMaterialsInCloud({ courseId = '' } = {}) {
  if (!isCourseCloudReady()) return [];
  try {
    return await listCloudCourseMaterials(getCurrentCloudUser(), { courseId });
  } catch {
    return [];
  }
}

/**
 * משיכת חומרים שקיימים בענן ולא במכשיר הזה — סנכרון בין מכשירים.
 * שומר אותם מקומית **בלי להעלות מחדש** (uploadToCloud:false) כדי לא ליצור לולאה.
 *
 * @param {{courseId:string, onProgress?:Function}} opts
 * @returns {Promise<{ok:boolean, pulled:number, skipped:number, failures:Array}>}
 */
export async function pullCourseMaterialsFromCloud({ courseId = '', onProgress = null } = {}) {
  if (!isCourseCloudReady()) return { ok: false, pulled: 0, skipped: 0, failures: [{ reason: 'not-signed-in' }] };

  const { loadProjectMaterials, saveCourseMaterialFiles } = await import('./workspaceLearningService');
  const cloud = await listCourseMaterialsInCloud({ courseId });
  if (!cloud.length) return { ok: true, pulled: 0, skipped: 0, failures: [] };

  let local = [];
  try { local = await loadProjectMaterials(); } catch { local = []; }
  const haveFiles = new Set(local.map((m) => String(m.file || '').trim()).filter(Boolean));
  const haveTitles = new Set(local.map((m) => String(m.title || '').trim()).filter(Boolean));

  let pulled = 0;
  let skipped = 0;
  const failures = [];

  for (let i = 0; i < cloud.length; i += 1) {
    const entry = cloud[i];
    const fileName = String(entry.fileName || '').trim();
    try { onProgress?.(i, cloud.length, entry.title || fileName); } catch {}
    if (!fileName || haveFiles.has(fileName) || haveTitles.has(String(entry.title || '').trim())) {
      skipped += 1;
      continue;
    }
    try {
      const bytes = await downloadCourseMaterialBytes(entry.storagePath);
      const file = new File([bytes], fileName, { type: CONTENT_TYPES[extOf(fileName)] || 'application/octet-stream' });
      const res = await saveCourseMaterialFiles([file], {
        courseId: entry.courseId || courseId,
        uploadToCloud: false,
      });
      if (res.saved) pulled += 1;
      else failures.push({ name: fileName, reason: res.failures?.[0] || 'שמירה מקומית נכשלה' });
    } catch (err) {
      failures.push({ name: fileName, reason: String(err?.message || err) });
    }
  }

  try { onProgress?.(cloud.length, cloud.length, ''); } catch {}
  return { ok: true, pulled, skipped, failures };
}

/** מחיקת חומר מהענן (המחיקה המקומית נעשית ב-removeHelperMaterial). */
export async function removeCourseMaterialFromCloud(material = {}) {
  if (!isCourseCloudReady()) return { ok: false, reason: 'not-signed-in' };
  try {
    await deleteCloudCourseMaterial(getCurrentCloudUser(), material.id, material.storagePath || '');
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: String(err?.message || err) };
  }
}
