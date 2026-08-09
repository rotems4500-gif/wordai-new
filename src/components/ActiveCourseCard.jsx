import React, { useEffect, useState } from 'react';
import {
  ensureLecturerProfilesReady,
  getActiveRulesFor,
  LECTURER_PROFILES_UPDATED_EVENT,
} from '../services/lecturerProfileStore';

// ActiveCourseCard — כרטיס "הקורס הפעיל" בעמודה הראשית של מסך הבית.
// מרכז במקום אחד: פרטי הקורס, כמה חומרים משויכים אליו, ומה המנוע למד מהמרצה.
// הלקחים נטענים כאן ובאופן עצמאי — ensureLecturerProfilesReady חייב להסתיים
// לפני כל קריאה, אחרת getActiveRulesFor מחזיר רשימה ריקה.
const MAX_MATERIALS = 4;
const MAX_RULES = 3;
const DEFAULT_DOT_COLOR = '#2dd4bf';

export default function ActiveCourseCard({
  course = null,
  materials = [],
  onManage = () => {},
  onClearCourse = () => {},
}) {
  const [rules, setRules] = useState([]);
  const courseId = course?.id || '';
  const lecturerName = course?.lecturerName || '';
  const courseName = course?.name || '';

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        await ensureLecturerProfilesReady();
        if (!alive) return;
        const result = getActiveRulesFor({ lecturerName, courseName, courseId });
        setRules(Array.isArray(result?.rules) ? result.rules : []);
      } catch {
        if (alive) setRules([]);
      }
    };
    load();
    if (typeof window === 'undefined') return () => { alive = false; };
    window.addEventListener(LECTURER_PROFILES_UPDATED_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(LECTURER_PROFILES_UPDATED_EVENT, load);
    };
  }, [courseId, lecturerName, courseName]);

  if (!course) return null;

  const materialList = Array.isArray(materials) ? materials : [];
  const shownMaterials = materialList.slice(0, MAX_MATERIALS);
  const shownRules = rules.slice(0, MAX_RULES);
  const extraRules = Math.max(0, rules.length - shownRules.length);

  return (
    <div dir="rtl" className="bg-white/10 backdrop-blur-xl border border-white/30 rounded-2xl p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ background: String(course.color || '').trim() || DEFAULT_DOT_COLOR }}
        />
        <span className="text-white text-sm font-bold truncate max-w-[16rem]" title={courseName}>
          {courseName || 'קורס ללא שם'}
        </span>
        {course.term ? (
          <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10.5px] text-white/75">
            {course.term}
          </span>
        ) : null}
        {lecturerName ? (
          <span className="text-[11px] text-white/60">מרצה: {lecturerName}</span>
        ) : null}
        <button
          type="button"
          onClick={() => onClearCourse()}
          title="בטל את בחירת הקורס הפעיל"
          className="mr-auto rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10.5px] text-white/60 transition hover:bg-white/15 hover:text-white/90"
        >
          ✕ נקה בחירה
        </button>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
          <div className="text-[11.5px] font-semibold text-white/85">
            📎 חומרי הקורס
            <span className="text-white/50 font-normal"> · {materialList.length}</span>
          </div>
          {shownMaterials.length ? (
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {shownMaterials.map((item, index) => {
                const label = String(item?.title || item?.file || '').trim() || 'קובץ ללא שם';
                return (
                  <li
                    key={item?.id || `${label}-${index}`}
                    className="truncate text-[11px] text-white/70"
                    title={label}
                  >
                    · {label}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-1.5 text-[11px] text-white/45">עדיין לא שויכו חומרים לקורס הזה.</div>
          )}
          <div className="mt-1.5 text-[10px] text-white/40">הרשימה המלאה באזור החומרים למטה</div>
        </div>

        {shownRules.length ? (
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11.5px] font-semibold text-white/85">🎓 לקחים מהמרצה</div>
              <button
                type="button"
                onClick={() => onManage()}
                className="shrink-0 text-[10.5px] text-cyan-200/90 transition hover:text-cyan-100"
              >
                לניהול →
              </button>
            </div>
            <ul className="mt-1.5 flex flex-col gap-1">
              {shownRules.map((rule, index) => (
                <li
                  key={rule?.id || index}
                  className="line-clamp-2 text-[11px] leading-4 text-white/70"
                  title={rule?.text || ''}
                >
                  · {rule?.text || ''}
                </li>
              ))}
            </ul>
            {extraRules > 0 ? (
              <div className="mt-1 text-[10px] text-white/40">+{extraRules} נוספים</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
