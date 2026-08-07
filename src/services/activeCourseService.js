// activeCourseService.js — "איזה קורס פעיל עכשיו" + פילטר הקורס הרך שכולם חולקים.
//
// שרשרת הרזולוציה (הראשון שפוגע מנצח):
//   1. override ידני — sessionStorage. בכוונה session ולא local: שורד reload
//      בטאב, אבל לא דולף ל-session הבא ומשאיר את המשתמש "תקוע" בקורס שגוי.
//      הצורה {courseId: null} היא בחירה מפורשת של "בלי קורס / הכול".
//   2. מסמך → פרויקט → project.courseId.
//   3. פרויקט פעיל (כשאין מסמך) → project.courseId.
//   4. null — אפס סינון, ההתנהגות של היום.
//
// ⚠️ סמנטיקת הסינון היא **רכה**: פריט בלי courseId (legacy) תמיד נכלל; מוחרג רק
// פריט שמשויך לקורס *אחר*. הלקח מ-getMaterialChunks({projectId}) — exact-match
// שם היה מרוקן את כל הראיות ברגע שהפילטר נדלק.

import { getCourseById } from './courseStore';
import { getProject, getProjectForDocument, getProjectsLibrary } from './projectService';

export const ACTIVE_COURSE_OVERRIDE_KEY = 'wordai_active_course_override';
export const ACTIVE_COURSE_CHANGED_EVENT = 'wordai-active-course-changed';

function emitChanged() {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  try { window.dispatchEvent(new CustomEvent(ACTIVE_COURSE_CHANGED_EVENT)); } catch {}
}

/** @returns {{courseId:string|null}|null} null = אין override בכלל */
export function getActiveCourseOverride() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(ACTIVE_COURSE_OVERRIDE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return { courseId: parsed.courseId ? String(parsed.courseId) : null };
  } catch {
    return null;
  }
}

/** courseId=null פירושו "בלי קורס" מפורש (שונה מהיעדר override). */
export function setActiveCourseOverride(courseId) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(ACTIVE_COURSE_OVERRIDE_KEY, JSON.stringify({ courseId: courseId || null }));
  } catch {}
  emitChanged();
}

export function clearActiveCourseOverride() {
  if (typeof window === 'undefined') return;
  try { sessionStorage.removeItem(ACTIVE_COURSE_OVERRIDE_KEY); } catch {}
  emitChanged();
}

/**
 * הקורס הפעיל בהקשר נתון.
 * @param {{projectId?:string|null, filePath?:string|null, docHistoryId?:string|null}} opts
 * @returns {{course:object|null, source:'override'|'project'|'none'}}
 */
export function resolveActiveCourse({ projectId = null, filePath = null, docHistoryId = null } = {}) {
  const override = getActiveCourseOverride();
  if (override) {
    return { course: override.courseId ? getCourseById(override.courseId) : null, source: 'override' };
  }

  let project = null;
  if (projectId) project = getProject(projectId);
  if (!project && (filePath || docHistoryId)) {
    try { project = getProjectForDocument({ filePath, docHistoryId }); } catch { project = null; }
  }
  if (project?.courseId) {
    const course = getCourseById(project.courseId);
    if (course) return { course, source: 'project' };
  }
  return { course: null, source: 'none' };
}

/**
 * הפילטר הרך — הפונקציה האחת שכל הצרכנים משתמשים בה.
 *
 * @param {object} item פריט עם courseId ו/או projectId אופציונליים
 * @param {string|null} activeCourseId ריק/null ⇒ הכול עובר
 * @param {Map<string,string>|null} projectCourseMap מיפוי projectId→courseId
 *        לגזירת שיוך לחומרים ישנים; בונים פעם אחת עם buildProjectCourseMap()
 * @returns {boolean}
 */
export function matchesCourseFilter(item, activeCourseId, projectCourseMap = null) {
  const active = String(activeCourseId || '').trim();
  if (!active) return true;
  const own = String(item?.courseId || '').trim();
  if (own) return own === active;
  // נגזרת: חומר legacy ששויך לפרויקט יורש את הקורס של הפרויקט.
  const viaProject = projectCourseMap && item?.projectId
    ? String(projectCourseMap.get(String(item.projectId)) || '').trim()
    : '';
  if (viaProject) return viaProject === active;
  return true; // לא משויך ⇒ נכלל (legacy נשאר שמיש)
}

/**
 * ה-courseId להחתמה על פריט חדש: קורס הפרויקט אם משויך, אחרת הקורס הפעיל.
 * לנקודות קליטה (מאמרים, קליפים, חיפוש פערים).
 */
export function deriveCourseIdForIngest(projectId = null) {
  if (projectId) {
    const project = getProject(projectId);
    if (project?.courseId) return project.courseId;
  }
  return resolveActiveCourse({ projectId }).course?.id || null;
}

/** מיפוי projectId→courseId, לבנייה פעם אחת לפני סינון רשימה. */
export function buildProjectCourseMap() {
  const map = new Map();
  try {
    for (const [id, project] of Object.entries(getProjectsLibrary() || {})) {
      if (project?.courseId && !project?.deletedAt) map.set(String(id), String(project.courseId));
    }
  } catch {}
  return map;
}
