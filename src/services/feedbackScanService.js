// feedbackScanService.js — סריקת קבצים אחרי משוב מרצה, בשני מסלולים:
//
//   1. אצווה שהמשתמש מעלה עכשיו (כמה עבודות בדוקות בבת אחת).
//   2. **אבחון רטרואקטיבי**: קבצים שכבר נמצאים באפליקציה כחומרי עזר. עבודה
//      בדוקה שהועלתה פעם כ"חומר" — ההערות שלה יושבות בקובץ ומעולם לא נקראו.
//
// שני המסלולים מייצרים את אותה צורת "work", וה-UI לא מבדיל ביניהם.
//
// ⚠️ סריקה רטרואקטיבית דורשת את **הבייטים המקוריים**: mammoth זורק הערות Word,
// ולכן טקסט שחולץ בעבר חסר-ערך כאן. רשומות דפדפן שומרות טקסט בלבד ומדווחות
// כ-'text-only' — המשתמש צריך להעלות את הקובץ מחדש.

import { extractDocxFeedback, docxFeedbackToEvents, sniffGrade } from './docxFeedbackExtract';
import { extractPdfAnnotations } from './materialExtractBrowser';
import { loadProjectMaterials, readMaterialBytes } from './workspaceLearningService';
import { recordGradedReturn } from './lecturerProfileStore';
import { matchesCourseFilter, buildProjectCourseMap } from './activeCourseService';

const SCANNABLE_TYPES = new Set(['docx', 'pdf']);
const MAX_SCAN_FILES = 80;

const baseName = (fileName) => String(fileName || '').replace(/\.[^.]+$/, '').trim();

const makeKey = (prefix, name, index) => `${prefix}:${index}:${String(name || '').slice(0, 40)}`;

/** annotations של PDF → אירועי משוב + רשימת מחברים משוערת. */
function pdfResultToWork(result, { fileName, key, origin, materialId = '' }) {
  const annots = Array.isArray(result?.annotations) ? result.annotations : [];
  if (!annots.length) return null;

  const counts = new Map();
  for (const a of annots) {
    const name = String(a.author || '').trim();
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  }
  const authors = [...counts.entries()]
    .map(([name, count]) => ({ name, count, isCreator: false }))
    .sort((a, b) => b.count - a.count);

  const events = annots.map((a) => ({
    kind: a.kind === 'deletion' ? 'deletion' : (a.text ? 'comment' : 'highlight'),
    anchorExcerpt: a.anchorExcerpt || '',
    feedbackText: a.text || '',
  }));

  // סימונים בלבד בלי מילה אחת של המרצה — אות חלש (יכול להיות סימון של המשתמש עצמו).
  const weakOnly = !events.some((e) => e.feedbackText);
  const gradeFromNote = sniffGrade(annots.map((a) => a.text).filter(Boolean).join(' '));

  return {
    key,
    origin,
    materialId,
    fileName,
    title: baseName(fileName),
    source: 'pdf-annots',
    authors,
    suspectedLecturer: authors[0]?.name || '',
    gradeSuggestion: gradeFromNote,
    events,
    allEvents: events,
    raw: null,
    weakOnly,
  };
}

/** תוצאת docx → work. שומר את ה-raw כדי לאפשר סינון-מחדש לפי מחבר ב-UI. */
function docxResultToWork(result, { fileName, key, origin, materialId = '' }) {
  const findings = (result.comments?.length || 0) + (result.revisions?.length || 0) + (result.highlights?.length || 0);
  if (!findings) return null;
  const events = docxFeedbackToEvents(result, { lecturerAuthor: result.suspectedLecturer });
  const usable = events.length ? events : docxFeedbackToEvents(result, {});
  return {
    key,
    origin,
    materialId,
    fileName,
    title: baseName(fileName),
    source: 'docx-comments',
    authors: result.authors || [],
    suspectedLecturer: result.suspectedLecturer || '',
    gradeSuggestion: result.gradeSuggestion,
    events: usable,
    allEvents: docxFeedbackToEvents(result, {}),
    raw: result,
    weakOnly: !usable.some((e) => e.feedbackText),
  };
}

/** אירועים מחדש אחרי שהמשתמש שינה "מי המרצה" (docx בלבד; ב-PDF אין סינון). */
export function eventsForAuthor(work, author) {
  if (!work) return [];
  if (work.source !== 'docx-comments' || !work.raw) return work.allEvents || work.events || [];
  return docxFeedbackToEvents(work.raw, { lecturerAuthor: author || '' });
}

async function scanBytes(bytes, fileName, meta) {
  const isDocx = /\.docx$/i.test(fileName);
  const isPdf = /\.pdf$/i.test(fileName);
  if (isDocx) {
    const result = await extractDocxFeedback(bytes);
    if (!result.ok) return { work: null, error: result.error };
    return { work: docxResultToWork(result, meta), error: '' };
  }
  if (isPdf) {
    const result = await extractPdfAnnotations(bytes);
    if (!result.ok) return { work: null, error: result.error };
    return { work: pdfResultToWork(result, meta), error: '' };
  }
  return { work: null, error: 'סוג קובץ לא נתמך לחילוץ משוב (רק docx ו-PDF)' };
}

/**
 * סריקת קבצים שהמשתמש בחר עכשיו — כמה עבודות בדוקות בבת אחת.
 * @param {File[]} files
 * @param {{onProgress?:(done:number,total:number,name:string)=>void}} opts
 * @returns {Promise<{works:Array, failures:Array<{name:string,reason:string}>, empty:Array<string>}>}
 */
export async function scanFilesForFeedback(files, { onProgress = null } = {}) {
  const list = Array.from(files || []).slice(0, MAX_SCAN_FILES);
  const works = [];
  const failures = [];
  const empty = [];

  for (let i = 0; i < list.length; i += 1) {
    const file = list[i];
    try { onProgress?.(i, list.length, file.name); } catch {}
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { work, error } = await scanBytes(bytes, file.name, {
        fileName: file.name,
        key: makeKey('up', file.name, i),
        origin: 'upload',
      });
      if (work) works.push(work);
      else if (error) failures.push({ name: file.name, reason: error });
      else empty.push(file.name);
    } catch (err) {
      failures.push({ name: file.name, reason: String(err?.message || err) });
    }
  }
  try { onProgress?.(list.length, list.length, ''); } catch {}
  return { works, failures, empty };
}

/**
 * אבחון רטרואקטיבי: סורק את חומרי העזר שכבר באפליקציה ומחזיר את אלה שיש בהם
 * משוב מרצה שמעולם לא נקלט.
 *
 * @param {{courseId?:string, onProgress?:Function}} opts courseId — סינון רך לקורס
 * @returns {Promise<{works:Array, scanned:number, skipped:Array<{title:string,reason:string}>}>}
 */
export async function scanExistingMaterialsForFeedback({ courseId = '', onProgress = null } = {}) {
  let materials = [];
  try { materials = await loadProjectMaterials(); } catch { materials = []; }

  const projectCourseMap = courseId ? buildProjectCourseMap() : null;
  const candidates = (Array.isArray(materials) ? materials : [])
    .filter((m) => SCANNABLE_TYPES.has(String(m?.type || '').toLowerCase()))
    .filter((m) => !courseId || matchesCourseFilter(m, courseId, projectCourseMap))
    .slice(0, MAX_SCAN_FILES);

  const works = [];
  const skipped = [];
  let scanned = 0;

  for (let i = 0; i < candidates.length; i += 1) {
    const material = candidates[i];
    try { onProgress?.(i, candidates.length, material.title || material.file); } catch {}
    let bytes = null;
    try {
      const read = await readMaterialBytes(material);
      if (!read.ok) {
        skipped.push({
          title: material.title || material.file,
          reason: read.reason === 'text-only'
            ? 'נשמר כטקסט בלבד — צריך להעלות את הקובץ מחדש'
            : (read.reason || 'לא ניתן לקרוא את הקובץ'),
        });
        continue;
      }
      bytes = read.bytes;
    } catch (err) {
      skipped.push({ title: material.title || material.file, reason: String(err?.message || err) });
      continue;
    }

    scanned += 1;
    try {
      const { work, error } = await scanBytes(bytes, material.file || `${material.title}.${material.type}`, {
        fileName: material.file || material.title,
        key: makeKey('mat', material.id, i),
        origin: 'existing',
        materialId: material.id,
      });
      if (work) works.push({ ...work, title: material.title || work.title });
      else if (error) skipped.push({ title: material.title || material.file, reason: error });
    } catch (err) {
      skipped.push({ title: material.title || material.file, reason: String(err?.message || err) });
    }
  }

  try { onProgress?.(candidates.length, candidates.length, ''); } catch {}
  return { works, scanned, skipped };
}

/**
 * קליטת אצווה: כל work נשמר כ-return נפרד אצל אותו מרצה.
 * @param {Array} works כל אחד עם {title, grade?, events, source}
 * @param {{lecturerName:string, courseName?:string, courseId?:string, date?:string}} meta
 * @returns {Promise<{ok:boolean, saved:number, totalEvents:number, lecturerId:string, failures:Array}>}
 */
export async function ingestFeedbackBatch(works, { lecturerName, courseName = '', courseId = '', date = '' } = {}) {
  const list = (Array.isArray(works) ? works : []).filter((w) => w && (w.events || []).length);
  if (!list.length || !String(lecturerName || '').trim()) {
    return { ok: false, saved: 0, totalEvents: 0, lecturerId: '', failures: [{ name: '', reason: 'חסר מרצה או אירועים' }] };
  }

  let saved = 0;
  let totalEvents = 0;
  let lecturerId = '';
  const failures = [];

  for (const work of list) {
    try {
      const result = await recordGradedReturn(lecturerName, {
        date: date || undefined,
        courseName,
        courseId,
        assignmentTitle: work.title || work.fileName || '',
        grade: work.grade === 0 || work.grade ? work.grade : null,
        source: work.source,
      }, work.events);
      if (result?.lecturer) {
        lecturerId = result.lecturer.id;
        saved += 1;
        totalEvents += result.addedEvents.length;
      }
    } catch (err) {
      failures.push({ name: work.title || work.fileName, reason: String(err?.message || err) });
    }
  }

  return { ok: saved > 0, saved, totalEvents, lecturerId, failures };
}
