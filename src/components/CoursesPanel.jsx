import React, { useEffect, useState } from 'react';
import { listCourses, COURSES_UPDATED_EVENT } from '../services/courseStore';
import {
  resolveActiveCourse,
  setActiveCourseOverride,
  clearActiveCourseOverride,
  ACTIVE_COURSE_CHANGED_EVENT,
} from '../services/activeCourseService';

// CoursesPanel — כרטיס "קורסים" בסרגל הצדדי של מסך הבית.
// עצמאי לחלוטין: קורא את הקורסים ואת הקורס הפעיל מהשירותים ומתרענן על שני
// האירועים (עדכון רשימה / החלפת קורס פעיל). ה-prop היחיד הוא פתיחת הניהול.
const MAX_VISIBLE_COURSES = 6;
const DEFAULT_DOT_COLOR = '#2dd4bf';

const SOURCE_HINTS = {
  override: 'נבחר ידנית',
  project: 'דרך הפרויקט',
};

export default function CoursesPanel({ onOpenCourseSettings = () => {} }) {
  const [courses, setCourses] = useState(() => {
    try { return listCourses(); } catch { return []; }
  });
  const [activeInfo, setActiveInfo] = useState(() => {
    try { return resolveActiveCourse(); } catch { return { course: null, source: 'none' }; }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const refresh = () => {
      try { setCourses(listCourses()); } catch { setCourses([]); }
      try { setActiveInfo(resolveActiveCourse()); } catch { setActiveInfo({ course: null, source: 'none' }); }
    };
    refresh();
    window.addEventListener(COURSES_UPDATED_EVENT, refresh);
    window.addEventListener(ACTIVE_COURSE_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(COURSES_UPDATED_EVENT, refresh);
      window.removeEventListener(ACTIVE_COURSE_CHANGED_EVENT, refresh);
    };
  }, []);

  const activeId = activeInfo?.course?.id || '';
  const activeHint = SOURCE_HINTS[activeInfo?.source] || '';
  const visible = (Array.isArray(courses) ? courses : []).slice(0, MAX_VISIBLE_COURSES);
  const hiddenCount = Math.max(0, (courses?.length || 0) - visible.length);

  const handlePick = (course) => {
    if (!course?.id) return;
    if (course.id === activeId) clearActiveCourseOverride();
    else setActiveCourseOverride(course.id);
  };

  return (
    <div className="flex flex-col gap-3" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-extrabold text-[#cfe0ef]">📚 קורסים</div>
        {hiddenCount > 0 && (
          <span className="text-[10.5px] text-[#6f87a1]">+{hiddenCount} נוספים</span>
        )}
      </div>

      {!visible.length ? (
        <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.04] px-3 py-3">
          <div className="text-[11.5px] leading-5 text-[#8ba3bd]">
            עדיין אין קורסים — סילבוס אחד מספיק כדי להתחיל
          </div>
          <button
            type="button"
            onClick={() => onOpenCourseSettings()}
            className="mt-2 rounded-lg border border-teal-200/30 bg-[#2dd4bf]/15 px-2.5 py-1 text-[11px] font-bold text-teal-100 transition hover:bg-[#2dd4bf]/25"
          >
            ➕ הוסף קורס
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {visible.map((course) => {
            const isActive = course.id === activeId;
            return (
              <button
                key={course.id}
                type="button"
                onClick={() => handlePick(course)}
                title={isActive ? 'לחיצה נוספת מנקה את הבחירה' : `בחר את "${course.name}" כקורס הפעיל`}
                className={`w-full rounded-xl border px-2.5 py-2 text-right transition ${
                  isActive
                    ? 'border-[#2dd4bf] bg-[#2dd4bf]/[0.16]'
                    : 'border-white/10 bg-white/[0.045] hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: String(course.color || '').trim() || DEFAULT_DOT_COLOR }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-[#f1f6fb]">
                    {course.name || 'קורס ללא שם'}
                  </span>
                </div>
                {course.lecturerName ? (
                  <div className="mt-0.5 pr-[18px] truncate text-[10.5px] text-[#8ba3bd]">
                    {course.lecturerName}
                  </div>
                ) : null}
                {isActive && activeHint ? (
                  <div className="mt-0.5 pr-[18px] text-[10px] text-[#6f87a1]">{activeHint}</div>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => onOpenCourseSettings()}
        className="self-start rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] text-white/85 transition hover:bg-white/15"
      >
        ➕ קורס חדש / ניהול
      </button>
    </div>
  );
}
