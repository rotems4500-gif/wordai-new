// course-store-unit.mjs — בדיקות offline להפרדת הקורסים.
// הרצה: WORDAI_VERIFY_ENTRY=courses + vite build -c vite.verify.config.mjs → node sf.mjs
//
// courseStore יושב על localStorage ו-activeCourseService על sessionStorage —
// ב-Node שניהם ממומשים כאן כ-shims פשוטים לפני ה-imports (המודולים לא נוגעים
// ב-storage בזמן init, רק בקריאות פונקציה).

const storageShim = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(String(k), String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
};
globalThis.window = globalThis;
globalThis.localStorage = storageShim();
globalThis.sessionStorage = storageShim();
if (typeof globalThis.addEventListener !== 'function') {
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  globalThis.dispatchEvent = () => true;
}

const { listCourses, getCourseById, createCourse, updateCourseMeta, archiveCourse, deleteCourse, findCourseByName, buildCourseContextBlock, bootstrapCoursesFromLegacy } = await import('../../src/services/courseStore.js');
const { resolveActiveCourse, setActiveCourseOverride, clearActiveCourseOverride, matchesCourseFilter, buildProjectCourseMap, deriveCourseIdForIngest } = await import('../../src/services/activeCourseService.js');
const { getMaterialChunks, addMaterialDocument } = await import('../../src/services/materialChunkStore.js');
const { getActiveRulesFor, upsertRule, recordGradedReturn, __resetLecturerProfilesForTests } = await import('../../src/services/lecturerProfileStore.js');
const { getProject } = await import('../../src/services/projectService.js');
const { saveDocumentHistory, getSavedDocsHistory } = await import('../../src/services/workspaceLearningService.js');

let passed = 0;
let failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
};

// ── 1. courseStore CRUD + tombstones ──
console.log('\n[courseStore]');
const c1 = createCourse({ name: 'דיני חוקה', lecturerName: 'ד"ר יעל כהן', term: 'סמסטר א' });
check('createCourse', !!c1?.id && c1.name === 'דיני חוקה');
check('duplicate name returns existing', createCourse({ name: 'דיני חוקה' })?.id === c1.id);
const c2 = createCourse({ name: 'תקשורת ומשפט' });
check('two live courses', listCourses().length === 2);
check('findCourseByName', findCourseByName('תקשורת ומשפט')?.id === c2.id);

updateCourseMeta(c1.id, { instructionsText: 'לצטט לפי APA בלבד', syllabusText: 'שבוע 1: מבוא לחופש הביטוי' });
check('updateCourseMeta persists', getCourseById(c1.id).instructionsText === 'לצטט לפי APA בלבד');

archiveCourse(c2.id);
check('archived hidden by default', listCourses().length === 1);
check('includeArchived shows it', listCourses({ includeArchived: true }).length === 2);
archiveCourse(c2.id, false);

deleteCourse(c2.id);
check('tombstone hides course', !getCourseById(c2.id) && listCourses().length === 1);

// ── 2. buildCourseContextBlock ──
console.log('\n[courseBlock]');
const block = buildCourseContextBlock(c1.id);
check('block has name+lecturer', block.includes('דיני חוקה') && block.includes('יעל כהן'));
check('block has instructions', block.includes('APA'));
check('block has syllabus', block.includes('חופש הביטוי'));
const tiny = buildCourseContextBlock(c1.id, { budget: 150 });
check('tiny budget clips', tiny.length <= 260, `len=${tiny.length}`);
const bare = createCourse({ name: 'קורס ריק' });
check('no-content course → empty block', buildCourseContextBlock(bare.id) === '');
deleteCourse(bare.id);

// ── 3. bootstrap ממחרוזות legacy ──
console.log('\n[bootstrap]');
localStorage.setItem('wordai_projects_v1', JSON.stringify({
  schemaVersion: 2,
  updatedAt: new Date().toISOString(),
  projects: {
    'prj-legacy1': { id: 'prj-legacy1', name: 'סמינריון', courseName: 'משפט חוקתי מתקדם', lecturerName: 'פרופ\' לוי', updatedAt: new Date().toISOString() },
    'prj-legacy2': { id: 'prj-legacy2', name: 'מטלה', courseName: 'משפט חוקתי מתקדם', lecturerName: 'פרופ\' לוי', updatedAt: new Date().toISOString() },
  },
}));
// bootstrap כבר רץ פעם אחת (בקריאת listCourses הראשונה, על נתונים ריקים) —
// force מריץ שוב על נתוני ה-legacy שנשתלו עכשיו.
bootstrapCoursesFromLegacy({ force: true });
const bootCourse = findCourseByName('משפט חוקתי מתקדם');
check('bootstrap created course from courseName', !!bootCourse, JSON.stringify(listCourses().map((c) => c.name)));
check('bootstrap kept consistent lecturer', bootCourse?.lecturerName === 'פרופ\' לוי');
const bootProject = getProject('prj-legacy1');
check('bootstrap stamped project.courseId', bootProject?.courseId === bootCourse?.id, `got ${bootProject?.courseId}`);

// ── 4. activeCourseService: רזולוציה + override ──
console.log('\n[activeCourse]');
check('no context → none', resolveActiveCourse().source === 'none');
check('project resolution', resolveActiveCourse({ projectId: 'prj-legacy1' }).course?.id === bootCourse.id);
setActiveCourseOverride(c1.id);
check('override wins over project', resolveActiveCourse({ projectId: 'prj-legacy1' }).course?.id === c1.id);
check('override source labeled', resolveActiveCourse().source === 'override');
setActiveCourseOverride(null);
check('explicit no-course override', resolveActiveCourse({ projectId: 'prj-legacy1' }).course === null);
clearActiveCourseOverride();
check('clear restores project resolution', resolveActiveCourse({ projectId: 'prj-legacy1' }).course?.id === bootCourse.id);
check('deriveCourseIdForIngest via project', deriveCourseIdForIngest('prj-legacy1') === bootCourse.id);

// ── 5. matchesCourseFilter — טבלת אמת ──
console.log('\n[filter]');
const pcMap = buildProjectCourseMap();
check('projectCourseMap built', pcMap.get('prj-legacy1') === bootCourse.id);
check('no active → everything passes', matchesCourseFilter({ courseId: 'other' }, ''));
check('own course passes', matchesCourseFilter({ courseId: c1.id }, c1.id));
check('other course excluded', !matchesCourseFilter({ courseId: bootCourse.id }, c1.id));
check('unassigned included (legacy)', matchesCourseFilter({}, c1.id));
check('derived via project excluded', !matchesCourseFilter({ projectId: 'prj-legacy1' }, c1.id, pcMap));
check('derived via project included for own', matchesCourseFilter({ projectId: 'prj-legacy1' }, bootCourse.id, pcMap));

// ── 6. getMaterialChunks — סינון רך (הרגרסיה המרכזית) ──
console.log('\n[chunks]');
addMaterialDocument({ title: 'חומר בלי שיוך', text: 'טקסט ארוך מספיק לחיתוך. '.repeat(60), source: 'test' });
addMaterialDocument({ title: 'חומר של הקורס', text: 'תוכן קורס דיני חוקה. '.repeat(60), source: 'test', courseId: c1.id });
addMaterialDocument({ title: 'חומר של קורס אחר', text: 'תוכן קורס אחר לגמרי. '.repeat(60), source: 'test', courseId: bootCourse.id });
const allChunks = getMaterialChunks();
const scoped = getMaterialChunks({ courseId: c1.id });
const scopedTitles = new Set(scoped.map((c) => c.sourceTitle));
check('unassigned chunks NOT excluded', scopedTitles.has('חומר בלי שיוך'));
check('own-course chunks included', scopedTitles.has('חומר של הקורס'));
check('other-course chunks excluded', !scopedTitles.has('חומר של קורס אחר'));
check('scoped smaller than all', scoped.length < allChunks.length);

// ── 7. getActiveRulesFor — התאמה כפולה courseId/courseName ──
console.log('\n[rules]');
__resetLecturerProfilesForTests();
const lect = await recordGradedReturn('ד"ר יעל כהן', { courseName: 'דיני חוקה', courseId: c1.id, source: 'manual' }, [
  { kind: 'manual', anchorExcerpt: '', feedbackText: 'הערה כלשהי לבדיקה' },
]);
await upsertRule({ text: 'לקח בהיקף קורס לפי id', scope: 'course', courseId: c1.id, evidenceEventIds: [lect.addedEvents[0].id] }, { lecturerId: lect.lecturer.id });
await upsertRule({ text: 'לקח בהיקף קורס לפי שם legacy', scope: 'course', courseName: 'דיני חוקה', evidenceEventIds: [lect.addedEvents[0].id] }, { lecturerId: lect.lecturer.id });
const byId = getActiveRulesFor({ lecturerName: 'יעל כהן', courseId: c1.id });
check('course rule matched by id', byId.rules.some((r) => r.text.includes('לפי id')));
const byName = getActiveRulesFor({ lecturerName: 'יעל כהן', courseName: 'דיני חוקה' });
check('course rule matched by legacy name', byName.rules.some((r) => r.text.includes('legacy')));
const wrongCourse = getActiveRulesFor({ lecturerName: 'יעל כהן', courseId: 'course-none', courseName: 'אחר' });
check('course rules hidden for other course', !wrongCourse.rules.some((r) => r.scope === 'course'));

// ── 8. saveDocumentHistory — דביקות courseId ──
console.log('\n[history]');
saveDocumentHistory({ title: 'עבודה', content: '<p>תוכן ראשון של המסמך לבדיקה</p>', filePath: 'C:/docs/work.docx', courseId: c1.id });
saveDocumentHistory({ title: 'עבודה', content: '<p>שמירה חוזרת בלי courseId מפורש</p>', filePath: 'C:/docs/work.docx' });
const entry = getSavedDocsHistory().find((e) => e.filePath === 'C:/docs/work.docx');
check('courseId sticky across resave', entry?.courseId === c1.id, `got ${entry?.courseId}`);

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
