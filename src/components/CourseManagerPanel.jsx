// CourseManagerPanel.jsx — "ניהול קורסים": הפאנל היחיד שבו נוצרים ונערכים
// הקורסים (courseStore). קורס מחזיק שם, מרצה, סמסטר, הנחיות קבועות וסילבוס —
// והם נכנסים לכל כתיבה בקורס דרך buildCourseContextBlock.
//
// ⚠️ הפאנל **מתאר בלבד**. הוא לא מבטיח שיפור ציון ולא מנחש מה המרצה יאהב —
// הוא מנהל את מה שהמשתמש עצמו הגדיר.
//
// עיצוב: אותן קונבנציות של LecturerProfilePanel (inline styles מעל משתני --s-*).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listCourses,
  createCourse,
  updateCourseMeta,
  archiveCourse,
  deleteCourse,
  COURSES_UPDATED_EVENT,
} from '../services/courseStore';
import { listLecturerProfiles, ensureLecturerProfilesReady } from '../services/lecturerProfileStore';
import {
  readInstructionFile,
  getInstructionFileAcceptList,
  getHelperMaterialAcceptList,
  loadProjectMaterials,
  saveCourseMaterialFiles,
  removeHelperMaterial,
} from '../services/workspaceLearningService';
import { showToast, showConfirm } from '../services/uiFeedback';
import { isCourseCloudReady, pullCourseMaterialsFromCloud, removeCourseMaterialFromCloud } from '../services/courseMaterialCloud';

const CARD_STYLE = {
  border: '1px solid var(--s-border)',
  borderRadius: 12,
  background: 'var(--s-surface-2, #F8FAFC)',
  padding: '10px 12px',
  marginBottom: 10,
};

const TITLE_STYLE = { fontSize: 12.5, fontWeight: 800, color: 'var(--s-text-strong)', marginBottom: 6 };
const BODY_STYLE = { fontSize: 11.5, color: 'var(--s-muted)', lineHeight: 1.75 };
const EMPTY_STYLE = { ...BODY_STYLE, fontStyle: 'italic' };

const INPUT_STYLE = {
  width: '100%',
  fontSize: 12,
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid var(--s-border)',
  background: 'var(--s-surface, #fff)',
  color: 'var(--s-text, #0F172A)',
  outline: 'none',
};

const BTN_STYLE = {
  fontSize: 11.5,
  fontWeight: 700,
  padding: '5px 10px',
  borderRadius: 8,
  border: '1px solid var(--s-border)',
  background: 'var(--s-surface, #fff)',
  color: 'var(--s-text-strong, #0F172A)',
  cursor: 'pointer',
};

const DANGER_BTN_STYLE = { ...BTN_STYLE, borderColor: '#FCA5A5', background: '#FEF2F2', color: '#B91C1C' };
const PRIMARY_BTN_STYLE = { ...BTN_STYLE, borderColor: '#1D4ED8', background: '#DBEAFE', color: '#1D4ED8' };

function Chip({ children, tone = 'slate' }) {
  const tones = {
    indigo: { bg: '#EEF2FF', fg: '#4338CA' },
    slate: { bg: '#F1F5F9', fg: '#475569' },
    amber: { bg: '#FEF3C7', fg: '#92400E' },
  };
  const t = tones[tone] || tones.slate;
  return (
    <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, background: t.bg, color: t.fg, padding: '2px 7px', borderRadius: 999, marginInlineEnd: 5, marginTop: 3 }}>
      {children}
    </span>
  );
}

const emptyDraft = () => ({ name: '', lecturerName: '', term: '', instructionsText: '', syllabusText: '' });

const draftFromCourse = (course) => ({
  name: course?.name || '',
  lecturerName: course?.lecturerName || '',
  term: course?.term || '',
  instructionsText: course?.instructionsText || '',
  syllabusText: course?.syllabusText || '',
});

export default function CourseManagerPanel({ onClose = () => {} }) {
  const [courses, setCourses] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [lecturerNames, setLecturerNames] = useState([]);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [courseMaterials, setCourseMaterials] = useState([]);
  const [uploadProgress, setUploadProgress] = useState('');
  // מצב הענן נבדק פעם אחת בפתיחה — התחברות באמצע אינה תרחיש נפוץ כאן.
  const [cloudReady] = useState(() => {
    try { return isCourseCloudReady(); } catch { return false; }
  });

  const acceptList = useMemo(() => {
    try { return getInstructionFileAcceptList() || ''; } catch { return ''; }
  }, []);

  const read = useCallback(() => {
    let list = [];
    try { list = listCourses({ includeArchived: true }); } catch {}
    setCourses(list);
    return list;
  }, []);

  useEffect(() => {
    const list = read();
    setSelectedId((prev) => (prev && list.some((c) => c.id === prev) ? prev : (list[0]?.id || '')));
    if (typeof window === 'undefined') return undefined;
    const refresh = () => read();
    window.addEventListener(COURSES_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(COURSES_UPDATED_EVENT, refresh);
  }, [read]);

  useEffect(() => {
    let alive = true;
    Promise.resolve(ensureLecturerProfilesReady())
      .then(() => {
        if (!alive) return;
        try { setLecturerNames(listLecturerProfiles().map((l) => l.name).filter(Boolean)); } catch {}
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const selected = creating ? null : courses.find((c) => c.id === selectedId) || null;

  // טעינת הטיוטה מהקורס הנבחר (או ריקה במצב יצירה).
  useEffect(() => {
    if (creating) { setDraft(emptyDraft()); return; }
    setDraft(draftFromCourse(courses.find((c) => c.id === selectedId) || null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, creating]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setField = (field, value) => setDraft((prev) => ({ ...prev, [field]: value }));

  // חומרי הקורס: הרשימה הגלויה מסוננת לפי שיוך courseId ישיר.
  const refreshCourseMaterials = useCallback(async (courseId) => {
    if (!courseId) { setCourseMaterials([]); return; }
    try {
      const all = await loadProjectMaterials();
      setCourseMaterials((Array.isArray(all) ? all : []).filter((m) => m.courseId === courseId));
    } catch { setCourseMaterials([]); }
  }, []);

  useEffect(() => {
    refreshCourseMaterials(creating ? '' : selectedId);
  }, [selectedId, creating, refreshCourseMaterials]);

  const handleMaterialFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length || !selected) return;
    setUploadProgress(`מעלה 0/${files.length}…`);
    try {
      const result = await saveCourseMaterialFiles(files, {
        courseId: selected.id,
        onProgress: (done, total, name) => setUploadProgress(done < total ? `מעלה ${done + 1}/${total}: ${name}` : ''),
      });
      if (result.saved) {
        const parts = [`${result.saved} קבצים נשמרו לקורס`];
        if (result.indexed) parts.push(`${result.indexed} נכנסו לאינדקס הראיות`);
        if (result.uploaded) parts.push(`${result.uploaded} הועלו לענן`);
        showToast(parts.join(' · '), { tone: 'success' });
      }
      if (result.failures.length) {
        showToast(`חלק נכשלו: ${result.failures.slice(0, 2).join(' · ')}${result.failures.length > 2 ? '…' : ''}`, { tone: 'error' });
      }
    } catch (error) {
      showToast(error?.message || 'ההעלאה נכשלה', { tone: 'error' });
    } finally {
      setUploadProgress('');
      refreshCourseMaterials(selected.id);
    }
  };

  const handleRemoveMaterial = async (material) => {
    const ok = await showConfirm(`להסיר את "${material.title}" מחומרי העזר?`, { title: 'הסרת חומר', confirmLabel: 'הסר', tone: 'danger' });
    if (!ok) return;
    try {
      const res = await removeHelperMaterial(material);
      if (res?.ok === false) showToast(res.error || 'ההסרה נכשלה', { tone: 'error' });
      // מחיקה מקבילה בענן — אחרת החומר יחזור בפעם הבאה שמושכים.
      if (material.storagePath) { try { await removeCourseMaterialFromCloud(material); } catch {} }
    } catch (error) {
      showToast(error?.message || 'ההסרה נכשלה', { tone: 'error' });
    }
    refreshCourseMaterials(selected?.id || '');
  };

  const handlePullFromCloud = async () => {
    if (!selected) return;
    setUploadProgress('מושך מהענן…');
    try {
      const res = await pullCourseMaterialsFromCloud({
        courseId: selected.id,
        onProgress: (done, total, name) => setUploadProgress(done < total ? `מוריד ${done + 1}/${total}: ${name}` : ''),
      });
      if (!res.ok) showToast('צריך להתחבר לחשבון כדי למשוך מהענן', { tone: 'error' });
      else if (res.pulled) showToast(`${res.pulled} קבצים נמשכו מהענן${res.skipped ? ` · ${res.skipped} כבר קיימים` : ''}`, { tone: 'success' });
      else showToast(res.skipped ? 'כל הקבצים שבענן כבר קיימים במכשיר' : 'אין קבצים בענן לקורס הזה', { tone: 'info' });
    } catch (error) {
      showToast(error?.message || 'המשיכה נכשלה', { tone: 'error' });
    } finally {
      setUploadProgress('');
      refreshCourseMaterials(selected.id);
    }
  };

  const handleSave = () => {
    const name = draft.name.trim();
    if (!name) { showToast('צריך שם קורס', { tone: 'error' }); return; }
    setBusy(true);
    try {
      if (creating) {
        const created = createCourse({
          name,
          lecturerName: draft.lecturerName.trim(),
          term: draft.term.trim(),
          instructionsText: draft.instructionsText,
          syllabusText: draft.syllabusText,
        });
        if (!created) { showToast('לא הצלחתי ליצור את הקורס', { tone: 'error' }); return; }
        // createCourse מחזיר קורס קיים כששם זהה כבר קיים — במקרה כזה נעדכן אותו.
        updateCourseMeta(created.id, {
          lecturerName: draft.lecturerName.trim(),
          term: draft.term.trim(),
          instructionsText: draft.instructionsText,
          syllabusText: draft.syllabusText,
        });
        setCreating(false);
        setSelectedId(created.id);
        showToast('הקורס נוצר', { tone: 'success' });
      } else if (selected) {
        updateCourseMeta(selected.id, {
          name,
          lecturerName: draft.lecturerName.trim(),
          term: draft.term.trim(),
          instructionsText: draft.instructionsText,
          syllabusText: draft.syllabusText,
        });
        showToast('הקורס נשמר', { tone: 'success' });
      }
      read();
    } catch (error) {
      showToast(error?.message || 'השמירה נכשלה', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const handleSyllabusFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const text = await readInstructionFile(file, 20000);
      const clean = String(text || '').trim();
      if (!clean) { showToast('לא נמצא טקסט בקובץ', { tone: 'error' }); return; }
      setField('syllabusText', clean);
      showToast(`הטקסט מ"${file.name}" נטען לשדה הסילבוס — עוד לא נשמר`, { tone: 'success' });
    } catch (error) {
      const code = error?.message || '';
      showToast(
        code === 'unsupported-binary-file' ? 'סוג הקובץ הזה לא נתמך' : (code || 'לא הצלחתי לקרוא את הקובץ'),
        { tone: 'error' },
      );
    } finally {
      setImporting(false);
    }
  };

  const handleArchiveToggle = () => {
    if (!selected) return;
    const next = !selected.archivedAt;
    archiveCourse(selected.id, next);
    read();
    showToast(next ? 'הקורס הועבר לארכיון' : 'הקורס הוחזר מהארכיון', { tone: 'success' });
  };

  const handleDelete = async () => {
    if (!selected) return;
    const ok = await showConfirm(
      `למחוק את הקורס "${selected.name}"? ההנחיות והסילבוס שנשמרו בו יימחקו. מסמכים וחומרים ששויכו אליו לא יימחקו.`,
      { title: 'מחיקת קורס', confirmLabel: 'מחק', tone: 'danger' },
    );
    if (!ok) return;
    deleteCourse(selected.id);
    const list = read();
    setSelectedId(list.find((c) => c.id !== selected.id)?.id || '');
  };

  const showForm = creating || Boolean(selected);

  return (
    <div
      dir="rtl"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(2,6,23,0.65)', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 900,
          maxWidth: '96vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--s-surface, #fff)',
          color: 'var(--s-text, #0F172A)',
          border: '1px solid var(--s-border)',
          borderRadius: 18,
          boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--s-border)' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--s-text-strong)' }}>📚 ניהול קורסים</div>
            <div style={{ ...BODY_STYLE, marginTop: 2 }}>
              קורס מרכז את המרצה, הסמסטר, ההנחיות הקבועות והסילבוס. מה שנשמר כאן נכנס לכתיבה במסמכים ששויכו לקורס.
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ ...BTN_STYLE, borderRadius: 999, padding: '4px 10px', flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* רשימת קורסים (ימין ב-RTL) */}
          <div style={{ width: 250, flexShrink: 0, borderInlineStart: '1px solid var(--s-border)', overflowY: 'auto', padding: 10, background: 'var(--s-surface-2, #F8FAFC)' }}>
            <button
              type="button"
              onClick={() => { setCreating(true); setSelectedId(''); }}
              style={{ ...PRIMARY_BTN_STYLE, width: '100%', marginBottom: 8 }}
            >
              ➕ קורס חדש
            </button>

            {!courses.length ? (
              <div style={EMPTY_STYLE}>עדיין אין קורסים. צור קורס ראשון כדי לשמור עליו הנחיות וסילבוס.</div>
            ) : null}

            {courses.map((course) => {
              const active = !creating && course.id === selectedId;
              return (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => { setCreating(false); setSelectedId(course.id); }}
                  style={{
                    ...BTN_STYLE,
                    display: 'block',
                    width: '100%',
                    textAlign: 'right',
                    marginBottom: 6,
                    padding: '8px 10px',
                    background: active ? '#DBEAFE' : 'var(--s-surface, #fff)',
                    borderColor: active ? '#1D4ED8' : 'var(--s-border)',
                    opacity: course.archivedAt ? 0.65 : 1,
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: active ? '#1D4ED8' : 'var(--s-text-strong)' }}>{course.name}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--s-muted)', fontWeight: 600, marginTop: 2 }}>
                    {course.lecturerName || 'בלי מרצה'}{course.term ? ` · ${course.term}` : ''}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                    {course.archivedAt ? <Chip tone="amber">בארכיון</Chip> : null}
                    {course.instructionsText ? <Chip>הנחיות</Chip> : null}
                    {course.syllabusText ? <Chip>סילבוס</Chip> : null}
                  </div>
                </button>
              );
            })}
          </div>

          {/* טופס עריכה */}
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 12 }}>
            {!showForm ? (
              <div style={EMPTY_STYLE}>בחר קורס מהרשימה, או צור קורס חדש.</div>
            ) : (
              <>
                <div style={CARD_STYLE}>
                  <div style={TITLE_STYLE}>{creating ? '➕ קורס חדש' : `✏️ ${selected?.name || ''}`}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <label style={BODY_STYLE}>
                      שם הקורס
                      <input
                        value={draft.name}
                        onChange={(e) => setField('name', e.target.value)}
                        placeholder="מבוא למשפט חוקתי"
                        style={INPUT_STYLE}
                      />
                    </label>
                    <label style={BODY_STYLE}>
                      מרצה
                      <input
                        list="wf-course-lecturer-names"
                        value={draft.lecturerName}
                        onChange={(e) => setField('lecturerName', e.target.value)}
                        placeholder="ד״ר ישראל ישראלי"
                        style={INPUT_STYLE}
                      />
                      <datalist id="wf-course-lecturer-names">
                        {lecturerNames.map((name) => <option key={name} value={name} />)}
                      </datalist>
                    </label>
                    <label style={BODY_STYLE}>
                      סמסטר
                      <input
                        value={draft.term}
                        onChange={(e) => setField('term', e.target.value)}
                        placeholder="סמסטר א׳ תשפ״ז"
                        style={INPUT_STYLE}
                      />
                    </label>
                  </div>
                </div>

                <div style={CARD_STYLE}>
                  <div style={TITLE_STYLE}>📋 הנחיות קבועות לקורס</div>
                  <div style={{ ...BODY_STYLE, marginBottom: 6 }}>
                    הנחיות קבועות לקורס — ייכנסו לכל כתיבה בקורס.
                  </div>
                  <textarea
                    value={draft.instructionsText}
                    onChange={(e) => setField('instructionsText', e.target.value)}
                    rows={5}
                    placeholder="למשל: ציטוט לפי כללי האסכולה המשפטית, עד 2500 מילים, בלי כותרות משנה"
                    style={{ ...INPUT_STYLE, resize: 'vertical' }}
                  />
                </div>

                <div style={CARD_STYLE}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div style={TITLE_STYLE}>📖 סילבוס</div>
                    <label style={{ ...BTN_STYLE, display: 'inline-block' }}>
                      {importing ? 'קורא…' : '📄 ייבוא מקובץ'}
                      <input
                        type="file"
                        accept={acceptList}
                        style={{ display: 'none' }}
                        onChange={handleSyllabusFile}
                      />
                    </label>
                  </div>
                  <div style={{ ...BODY_STYLE, marginBottom: 6 }}>
                    טקסט הסילבוס משמש רקע לכתיבה בקורס. הייבוא ממלא את השדה — השמירה עדיין בידיך.
                  </div>
                  <textarea
                    value={draft.syllabusText}
                    onChange={(e) => setField('syllabusText', e.target.value)}
                    rows={8}
                    placeholder="הדבק כאן את הסילבוס, או ייבא אותו מקובץ"
                    style={{ ...INPUT_STYLE, resize: 'vertical' }}
                  />
                  <div style={{ ...BODY_STYLE, marginTop: 4 }}>{draft.syllabusText.length.toLocaleString('he-IL')} תווים</div>
                </div>

                {!creating && selected ? (
                  <div style={CARD_STYLE}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <div style={TITLE_STYLE}>📎 חומרי הקורס ({courseMaterials.length})</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {cloudReady ? (
                          <button type="button" onClick={handlePullFromCloud} disabled={Boolean(uploadProgress)} style={BTN_STYLE}>
                            ☁️ משוך מהענן
                          </button>
                        ) : null}
                        <label style={{ ...PRIMARY_BTN_STYLE, display: 'inline-block', opacity: uploadProgress ? 0.6 : 1 }}>
                          {uploadProgress || '📥 הוסף קבצים'}
                          <input
                            type="file"
                            multiple
                            accept={getHelperMaterialAcceptList()}
                            style={{ display: 'none' }}
                            disabled={Boolean(uploadProgress)}
                            onChange={handleMaterialFiles}
                          />
                        </label>
                      </div>
                    </div>
                    <div style={{ ...BODY_STYLE, marginBottom: 6 }}>
                      PDF, מצגות, וורד וטקסט. הקבצים נשמרים כחומרי עזר של הקורס ונכנסים גם לאינדקס הראיות של שלד המטלה — רק לכתיבה בקורס הזה.
                      {cloudReady
                        ? ' הקובץ המקורי נשמר גם בחשבון שלך בענן, כך שהוא זמין בכל מכשיר.'
                        : ' התחבר לחשבון כדי שהקבצים יישמרו גם בענן ויהיו זמינים בכל מכשיר.'}
                    </div>
                    {!courseMaterials.length ? (
                      <div style={EMPTY_STYLE}>עוד אין קבצים בקורס הזה.</div>
                    ) : (
                      courseMaterials.map((material) => (
                        <div key={material.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--s-border)' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--s-text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {material.title}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--s-muted)' }}>
                              {String(material.type || '').toUpperCase()}
                              {material.storagePath ? ' · ☁️ בענן' : ''}
                              {material.extractionStatus === 'success' || material.previewText ? '' : ' · בלי טקסט שחולץ'}
                            </div>
                          </div>
                          <button type="button" onClick={() => handleRemoveMaterial(material)} style={{ ...DANGER_BTN_STYLE, padding: '3px 8px', flexShrink: 0 }}>הסר</button>
                        </div>
                      ))
                    )}
                  </div>
                ) : null}

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="button" disabled={busy} onClick={handleSave} style={PRIMARY_BTN_STYLE}>
                    {busy ? 'שומר…' : (creating ? 'צור קורס' : 'שמור שינויים')}
                  </button>
                  {creating ? (
                    <button type="button" onClick={() => { setCreating(false); setSelectedId(courses[0]?.id || ''); }} style={BTN_STYLE}>ביטול</button>
                  ) : null}
                  {selected ? (
                    <>
                      <button type="button" onClick={handleArchiveToggle} style={BTN_STYLE}>
                        {selected.archivedAt ? '♻️ הוצא מהארכיון' : '🗄️ העבר לארכיון'}
                      </button>
                      <button type="button" onClick={handleDelete} style={DANGER_BTN_STYLE}>🗑️ מחק קורס</button>
                    </>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
