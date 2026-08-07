// courseStore.js — קורסים כישות ראשונה במעלה: שם, מרצה, סמסטר, סילבוס והנחיות
// פר-קורס. כל שאר המערכת (פרויקטים, חומרים, היסטוריה, לקחי מרצים) מצביעה לכאן
// דרך courseId.
//
// אחסון: מפתח יחיד 'wordai_courses_v1' (בבעלות בלעדית של המודול), אותו דפוס
// כמו projectService: blob קטן ב-localStorage, מיזוג ענן ברמת-רשומה
// (mergeWorkspaceMaps ב-aiService — updatedAt מנצח, tombstone לא קם לתחייה).
//
// Firebase courses collection קיימת אך לא מחוברת — הרשומה נושאת firebaseCourseId
// אופציונלי כדי שחיבור עתידי לא ישבור סכמה.

import { syncPersistedAppSettings } from './aiService';

export const COURSES_STORAGE_KEY = 'wordai_courses_v1';
export const COURSES_SCHEMA_VERSION = 1;
export const COURSES_UPDATED_EVENT = 'wordai-courses-updated';

const SYLLABUS_MAX_CHARS = 20000;
const INSTRUCTIONS_MAX_CHARS = 10000;

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const nowIso = () => new Date().toISOString();
const makeId = () => `course-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function emitUpdated() {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  try { window.dispatchEvent(new CustomEvent(COURSES_UPDATED_EVENT)); } catch {}
}

export function normalizeCourse(raw = {}) {
  return {
    id: String(raw.id || '').trim(),
    name: String(raw.name || '').trim().slice(0, 120),
    lecturerName: String(raw.lecturerName || '').trim().slice(0, 120),
    term: String(raw.term || '').trim().slice(0, 80),
    syllabusText: String(raw.syllabusText || '').slice(0, SYLLABUS_MAX_CHARS),
    instructionsText: String(raw.instructionsText || '').slice(0, INSTRUCTIONS_MAX_CHARS),
    color: String(raw.color || '').trim().slice(0, 24),
    archivedAt: raw.archivedAt || null,
    createdAt: String(raw.createdAt || ''),
    updatedAt: String(raw.updatedAt || ''),
    deletedAt: raw.deletedAt || null,
    firebaseCourseId: String(raw.firebaseCourseId || '').trim(),
  };
}

function readBlob() {
  if (typeof window === 'undefined') return { schemaVersion: COURSES_SCHEMA_VERSION, updatedAt: '', courses: {} };
  let parsed = null;
  try { parsed = JSON.parse(localStorage.getItem(COURSES_STORAGE_KEY) || ''); } catch {}
  if (!isPlainObject(parsed) || !isPlainObject(parsed.courses)) {
    return { schemaVersion: COURSES_SCHEMA_VERSION, updatedAt: '', courses: {} };
  }
  return parsed;
}

function writeBlob(blob) {
  if (typeof window === 'undefined') return;
  const next = {
    schemaVersion: COURSES_SCHEMA_VERSION,
    updatedAt: nowIso(),
    courses: isPlainObject(blob?.courses) ? blob.courses : {},
  };
  try {
    localStorage.setItem(COURSES_STORAGE_KEY, JSON.stringify(next));
    syncPersistedAppSettings();
  } catch {}
  emitUpdated();
}

/** קורסים חיים (בלי tombstones). includeArchived=false מסתיר גם מאורכבים. */
export function listCourses({ includeArchived = false } = {}) {
  bootstrapCoursesFromLegacy();
  return Object.values(readBlob().courses)
    .filter(isPlainObject)
    .map(normalizeCourse)
    .filter((c) => c.id && !c.deletedAt && (includeArchived || !c.archivedAt))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

export function getCourseById(courseId) {
  bootstrapCoursesFromLegacy();
  const clean = String(courseId || '').trim();
  if (!clean) return null;
  const raw = readBlob().courses[clean];
  if (!isPlainObject(raw)) return null;
  const course = normalizeCourse(raw);
  return course.deletedAt ? null : course;
}

/** התאמת שם מדויקת (אחרי trim) — למיגרציה ולזיהוי אוטומטי ממחרוזות legacy. */
export function findCourseByName(name) {
  const clean = String(name || '').trim();
  if (!clean) return null;
  return listCourses({ includeArchived: true }).find((c) => c.name === clean) || null;
}

const COURSE_EDITABLE_FIELDS = ['name', 'lecturerName', 'term', 'syllabusText', 'instructionsText', 'color', 'firebaseCourseId'];

export function createCourse(patch = {}) {
  const name = String(patch.name || '').trim();
  if (!name) return null;
  const existing = findCourseByName(name);
  if (existing && !existing.deletedAt) return existing;
  const blob = readBlob();
  const course = normalizeCourse({ ...patch, id: makeId(), createdAt: nowIso(), updatedAt: nowIso() });
  blob.courses[course.id] = course;
  writeBlob(blob);
  return course;
}

export function updateCourseMeta(courseId, patch = {}) {
  const clean = String(courseId || '').trim();
  const blob = readBlob();
  if (!isPlainObject(blob.courses[clean])) return null;
  const course = normalizeCourse(blob.courses[clean]);
  for (const field of COURSE_EDITABLE_FIELDS) {
    if (field in patch) course[field] = patch[field];
  }
  const next = normalizeCourse({ ...course, updatedAt: nowIso() });
  blob.courses[clean] = next;
  writeBlob(blob);
  return next;
}

export function archiveCourse(courseId, archived = true) {
  const clean = String(courseId || '').trim();
  const blob = readBlob();
  if (!isPlainObject(blob.courses[clean])) return null;
  const course = normalizeCourse(blob.courses[clean]);
  course.archivedAt = archived ? nowIso() : null;
  course.updatedAt = nowIso();
  blob.courses[clean] = course;
  writeBlob(blob);
  return course;
}

/** מחיקה רכה (tombstone) — שורדת סנכרון. */
export function deleteCourse(courseId) {
  const clean = String(courseId || '').trim();
  const blob = readBlob();
  if (!isPlainObject(blob.courses[clean])) return false;
  const course = normalizeCourse(blob.courses[clean]);
  course.deletedAt = nowIso();
  course.updatedAt = nowIso();
  blob.courses[clean] = course;
  writeBlob(blob);
  return true;
}

// ── מיגרציית bootstrap חד-פעמית ──

const BOOTSTRAP_FLAG_KEY = 'wordai_courses_bootstrap_v1';
let bootstrapChecked = false;

/**
 * יוצר רשומות קורס ממחרוזות legacy: project.courseName הייחודיים +
 * personalStyle.currentCourses, ומחתים project.courseId על התואמים.
 * חד-פעמי (דגל ב-localStorage), לא-הרסני, רץ עצלנית בקריאה הראשונה.
 */
export function bootstrapCoursesFromLegacy({ force = false } = {}) {
  if ((bootstrapChecked && !force) || typeof window === 'undefined') return;
  bootstrapChecked = true;
  try {
    if (!force && localStorage.getItem(BOOTSTRAP_FLAG_KEY)) return;
    localStorage.setItem(BOOTSTRAP_FLAG_KEY, nowIso());

    // imports דינמיים-לוגית דרך require היו נשברים ב-ESM; שני המודולים כבר
    // בגרף (aiService/projectService) ולכן import סטטי בטוח — אבל כדי לא ליצור
    // מעגל projectService⇄courseStore, קוראים ל-localStorage ישירות.
    let projectsBlob = null;
    try { projectsBlob = JSON.parse(localStorage.getItem('wordai_projects_v1') || ''); } catch {}
    const projects = isPlainObject(projectsBlob?.projects) ? projectsBlob.projects : {};

    let personal = null;
    try { personal = JSON.parse(localStorage.getItem('wordai_personal_style') || ''); } catch {}
    const personalCourses = Array.isArray(personal?.currentCourses) ? personal.currentCourses : [];

    const names = new Map(); // name → lecturerName (אם עקבי)
    for (const p of Object.values(projects)) {
      const name = String(p?.courseName || '').trim();
      if (!name || p?.deletedAt) continue;
      const lecturer = String(p?.lecturerName || '').trim();
      if (!names.has(name)) names.set(name, lecturer);
      else if (names.get(name) !== lecturer) names.set(name, ''); // סתירה — בלי מרצה
    }
    for (const c of personalCourses) {
      const name = String(c || '').trim();
      if (name && !names.has(name)) names.set(name, '');
    }
    if (!names.size) return;

    for (const [name, lecturerName] of names) {
      if (!findCourseByName(name)) createCourse({ name, lecturerName });
    }

    // החתמת project.courseId על התואמים — כתיבה ישירה ל-blob (בלי projectService,
    // למניעת מעגל import). עדכון updatedAt כדי שהסנכרון יעביר את השינוי.
    let changed = false;
    for (const [id, p] of Object.entries(projects)) {
      const name = String(p?.courseName || '').trim();
      if (!name || p?.deletedAt || p?.courseId) continue;
      const course = findCourseByName(name);
      if (course) {
        projects[id] = { ...p, courseId: course.id, updatedAt: nowIso() };
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem('wordai_projects_v1', JSON.stringify({ ...projectsBlob, projects, updatedAt: nowIso() }));
      try { window.dispatchEvent(new CustomEvent('wordai-projects-updated')); } catch {}
      syncPersistedAppSettings();
    }
  } catch { /* bootstrap כושל לא מפיל את האפליקציה — פשוט אין קורסים אוטומטיים */ }
}

// ── בלוק הקשר קורס לפרומפטים ──

const COURSE_BLOCK_HEADER = '== הקשר קורס ==';
const COURSE_BLOCK_FOOTER = '== סוף הקשר קורס ==';
const DEFAULT_COURSE_BLOCK_BUDGET = 2500;

/**
 * בלוק ההקשר של הקורס להזרקה לפרומפט: שם/מרצה/סמסטר + הנחיות + תמצית סילבוס.
 * '' כשאין קורס או אין תוכן. תקציב תווים — ההנחיות קודמות לסילבוס (הן מחייבות,
 * הסילבוס רקע).
 */
export function buildCourseContextBlock(courseId, { budget = DEFAULT_COURSE_BLOCK_BUDGET } = {}) {
  const course = getCourseById(courseId);
  if (!course) return '';

  const headParts = [`קורס: ${course.name}`];
  if (course.lecturerName) headParts.push(`מרצה: ${course.lecturerName}`);
  if (course.term) headParts.push(course.term);

  const lines = [COURSE_BLOCK_HEADER, headParts.join(' | ')];
  let used = lines.join('\n').length + COURSE_BLOCK_FOOTER.length + 2;

  const instructions = course.instructionsText.trim();
  if (instructions) {
    const room = Math.max(0, budget - used - 30);
    const clipped = instructions.length > room ? `${instructions.slice(0, room)}…` : instructions;
    if (clipped) {
      lines.push(`הנחיות קבועות של הקורס:\n${clipped}`);
      used += clipped.length + 30;
    }
  }

  const syllabus = course.syllabusText.trim();
  if (syllabus && used < budget - 100) {
    const room = Math.max(0, budget - used - 20);
    const clipped = syllabus.length > room ? `${syllabus.slice(0, room)}…` : syllabus;
    if (clipped) lines.push(`תמצית הסילבוס:\n${clipped}`);
  }

  if (lines.length === 2) return ''; // רק כותרת+שם — אין תוכן שמצדיק בלוק
  lines.push(COURSE_BLOCK_FOOTER);
  return lines.join('\n\n');
}
