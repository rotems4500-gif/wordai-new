// GradedReturnWizard.jsx — "קליטת עבודה בדוקה": אשף בן ארבעה שלבים שמכניס משוב
// מרצה מעבודות שחזרו אל lecturerProfileStore, ומציע לזקק ממנו לקחים.
//
// ⚠️ האשף **קולט בלבד**. הוא לא מבטיח ציון ולא מנחש מה המרצה "יאהב" — כל אירוע
// שנשמר הוא ציטוט של מה שנכתב בפועל בעבודה הבדוקה, והמשתמש רואה ומאשר כל אחד
// לפני השמירה.
//
// ארבעה מסלולי קליטה:
//   annotated — docx עם הערות/שינויים מסומנים, או pdf עם הערות. **כמה קבצים יחד**.
//   diff      — הגשה מקורית מול הגרסה שחזרה; ההפרש הוא המשוב.
//   manual    — הדבקת טקסט המשוב.
//   existing  — אבחון רטרואקטיבי של קבצים שכבר באפליקציה (חומרי עזר שהם בעצם
//               עבודות בדוקות שההערות בהן מעולם לא נקראו).
//
// כל המסלולים מייצרים את אותה צורת "work" (ר' feedbackScanService), ושלבים 2–4
// לא מבדילים ביניהם. שלב 3 רץ **פעם אחת** לכל האצווה, ושלב 4 מזקק פעם אחת.
//
// עיצוב: אותן קונבנציות של LecturerProfilePanel (inline styles מעל משתני --s-*),
// כדי שהאשף ייראה זהה בין הפאנל לבין סטודיו השלד.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { extractMaterialTextFromBytes } from '../services/materialExtractBrowser';
import { diffSubmissionVsReturned } from '../services/feedbackDiffService';
import { buildSubmittedBodyText } from '../services/docxFeedbackExtract';
import {
  scanFilesForFeedback,
  scanExistingMaterialsForFeedback,
  eventsForAuthor,
  ingestFeedbackBatch,
} from '../services/feedbackScanService';
import {
  ensureLecturerProfilesReady,
  listLecturerProfiles,
} from '../services/lecturerProfileStore';
import { distillLecturerRules, saveDistilledRules } from '../services/lecturerRulesService';
import { listCourses, findCourseByName } from '../services/courseStore';
import { resolveActiveCourse } from '../services/activeCourseService';
import { showToast } from '../services/uiFeedback';

const KIND_LABELS = {
  comment: 'הערה',
  deletion: 'מחיקה',
  insertion: 'הוספה',
  replacement: 'החלפה',
  highlight: 'הדגשה',
  manual: 'משוב',
  'grade-note': 'ציון',
};

const CATEGORY_LABELS = {
  citation: 'ציטוט ומראי מקום',
  structure: 'מבנה',
  argument: 'טיעון',
  language: 'ניסוח',
  formatting: 'עיצוב',
  sources: 'מקורות',
  other: 'אחר',
};

const SOURCE_LABELS = {
  'docx-comments': 'הערות Word',
  'pdf-annots': 'הערות PDF',
  diff: 'השוואת גרסאות',
  manual: 'משוב ידני',
};

const MODES = [
  { id: 'annotated', label: '📝 קובץ מוחזר עם הערות', hint: 'docx עם הערות/עקוב-אחר-שינויים, או PDF עם הערות · אפשר לבחור כמה עבודות יחד' },
  { id: 'diff', label: '🔀 השוואת גרסאות', hint: 'ההגשה המקורית מול הגרסה שהמרצה החזיר' },
  { id: 'manual', label: '✍️ משוב ידני', hint: 'הדבקת המשוב כטקסט חופשי' },
  { id: 'existing', label: '🔍 אבחון קבצים קיימים', hint: 'מחפש הערות מרצה בקבצים שכבר העלית — עבודות בדוקות שנקלטו בעבר כחומר עזר.' },
];

const STEP_TITLES = ['מקור המשוב', 'סקירת פריטי המשוב', 'שיוך ושמירה', 'זיקוק לקחים'];

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

const PRIMARY_BTN_STYLE = { ...BTN_STYLE, borderColor: '#1D4ED8', background: '#DBEAFE', color: '#1D4ED8' };

const CHIP_STYLE = {
  fontSize: 10.5,
  fontWeight: 800,
  color: '#4338CA',
  background: '#EEF2FF',
  borderRadius: 999,
  padding: '2px 7px',
  whiteSpace: 'nowrap',
};

const WARN_BOX_STYLE = {
  border: '1px solid #FCD34D',
  background: '#FEF3C7',
  color: '#92400E',
  borderRadius: 10,
  padding: '8px 10px',
  fontSize: 11.5,
  lineHeight: 1.7,
  marginBottom: 10,
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const bytesOf = async (file) => new Uint8Array(await file.arrayBuffer());

/** פסקאות משוב חופשי → אירועי manual (אותו פיצול כמו addManualFeedback). */
function manualTextToEvents(text) {
  return String(text || '')
    .split(/\n+/)
    .map((p) => p.replace(/^[\s•·\-*\d.)\]]+/, '').trim())
    .filter((p) => p.length >= 4)
    .map((p) => ({ kind: 'manual', anchorExcerpt: '', feedbackText: p }));
}

/** work גולמי מהשירות → work עם שדות ה-UI (בחירה, ציון, מחבר-נבחר). */
function prepWork(work) {
  const events = Array.isArray(work.events) ? work.events : [];
  return {
    ...work,
    events,
    include: !work.weakOnly,
    grade: (work.gradeSuggestion === 0 || work.gradeSuggestion) ? String(work.gradeSuggestion) : '',
    lecturerAuthor: work.suspectedLecturer || '',
    selected: new Set(events.map((_, i) => i)),
  };
}

function StepDots({ step }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
      {STEP_TITLES.map((title, idx) => {
        const n = idx + 1;
        const active = n === step;
        const done = n < step;
        return (
          <span
            key={title}
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 999,
              border: `1px solid ${active ? '#1D4ED8' : 'var(--s-border)'}`,
              background: active ? '#DBEAFE' : done ? '#DCFCE7' : 'var(--s-surface, #fff)',
              color: active ? '#1D4ED8' : done ? '#166534' : 'var(--s-muted)',
            }}
          >
            {done ? '✓' : n}. {title}
          </span>
        );
      })}
    </div>
  );
}

function FilePick({ label, file, accept, onPick, multiple = false, files = null }) {
  const ref = useRef(null);
  const shown = multiple
    ? (files && files.length ? files.map((f) => f.name).join(' · ') : 'לא נבחרו קבצים')
    : (file ? file.name : 'לא נבחר קובץ');
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ ...BODY_STYLE, marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => ref.current?.click()} style={BTN_STYLE}>
          {multiple ? 'בחר קבצים…' : 'בחר קובץ…'}
        </button>
        <span style={{ ...BODY_STYLE, color: (multiple ? files?.length : file) ? 'var(--s-text-strong)' : 'var(--s-muted)', wordBreak: 'break-word' }}>
          {shown}
        </span>
        <input
          ref={ref}
          type="file"
          accept={accept}
          multiple={multiple}
          style={{ display: 'none' }}
          onChange={(e) => {
            const picked = Array.from(e.target.files || []);
            onPick(multiple ? picked : (picked[0] || null));
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

/** טבלת אירועים עם צ'קבוקס לכל פריט — משותפת לתצוגת עבודה יחידה ולכרטיס באצווה. */
function EventList({ events, selected, onToggle, maxHeight = 300 }) {
  return (
    <div style={{ maxHeight, overflowY: 'auto' }}>
      {events.map((ev, idx) => (
        <label
          key={`${ev.kind}-${idx}`}
          style={{ display: 'flex', alignItems: 'flex-start', gap: 8, borderBottom: '1px solid var(--s-border)', padding: '6px 0', cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={selected.has(idx)}
            onChange={(e) => onToggle(idx, e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span style={{ ...CHIP_STYLE, marginTop: 1 }}>{KIND_LABELS[ev.kind] || ev.kind}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            {ev.anchorExcerpt ? (
              <span style={{ ...BODY_STYLE, display: 'block', fontStyle: 'italic', opacity: 0.8 }}>״{ev.anchorExcerpt}״</span>
            ) : null}
            <span style={{ display: 'block', fontSize: 12, color: 'var(--s-text-strong)', lineHeight: 1.7 }}>
              {ev.feedbackText || '(סימון בלבד — בלי טקסט)'}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}

export default function GradedReturnWizard({ onClose = () => {}, initialFile = null, initialMode = 'annotated' }) {
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState(initialMode || 'annotated');
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const [lecturers, setLecturers] = useState([]);

  // שלב 1
  const [mainFiles, setMainFiles] = useState(initialFile ? [initialFile] : []);
  const [submittedFile, setSubmittedFile] = useState(null);
  const [returnedFile, setReturnedFile] = useState(null);
  const [manualText, setManualText] = useState('');
  const [scanReport, setScanReport] = useState(null);
  const [showSkipped, setShowSkipped] = useState(false);

  // תוצרי החילוץ — אצווה של עבודות בצורה אחידה
  const [works, setWorks] = useState([]);
  const [expanded, setExpanded] = useState(() => new Set());
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [diffConfirmed, setDiffConfirmed] = useState(false);
  const [diffStats, setDiffStats] = useState(null);

  // שלב 3
  const [lecturerName, setLecturerName] = useState('');
  const [courseName, setCourseName] = useState('');
  const [date, setDate] = useState(todayIso());

  // שלב 4
  const [savedLecturerId, setSavedLecturerId] = useState('');
  const [candidates, setCandidates] = useState(null);
  const [distillNote, setDistillNote] = useState('');
  const [doneNote, setDoneNote] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try { await ensureLecturerProfilesReady(); } catch {}
      if (!alive) return;
      try { setLecturers(listLecturerProfiles()); } catch {}
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // רשימת הקורסים המנוהלת (courseStore) + שמות הקורסים ה-legacy שנשמרו על המרצים.
  const courseOptions = useMemo(() => {
    let managed = [];
    try { managed = listCourses({ includeArchived: true }).map((c) => c.name); } catch {}
    const match = lecturers.find((l) => l.name === lecturerName);
    const legacy = match ? match.courses : lecturers.flatMap((l) => l.courses);
    return [...new Set([...managed, ...(legacy || [])].filter(Boolean))];
  }, [lecturers, lecturerName]);

  const resetExtraction = useCallback(() => {
    setWorks([]);
    setExpanded(new Set());
    setNeedsConfirmation(false);
    setDiffConfirmed(false);
    setDiffStats(null);
    setScanReport(null);
    setShowSkipped(false);
    setProgress('');
    setError('');
  }, []);

  const updateWork = useCallback((key, patch) => {
    setWorks((prev) => prev.map((w) => (w.key === key ? { ...w, ...(typeof patch === 'function' ? patch(w) : patch) } : w)));
  }, []);

  const toggleEvent = useCallback((key, idx, checked) => {
    setWorks((prev) => prev.map((w) => {
      if (w.key !== key) return w;
      const next = new Set(w.selected);
      if (checked) next.add(idx); else next.delete(idx);
      return { ...w, selected: next };
    }));
  }, []);

  const onScanProgress = useCallback((done, total, name) => {
    setProgress(name ? `סורק ${Math.min(done + 1, total)}/${total}: ${name}` : '');
  }, []);

  // ── שלב 1 → 2: חילוץ ────────────────────────────────────────────────────
  const runExtraction = useCallback(async () => {
    resetExtraction();

    if (mode === 'manual') {
      const evts = manualTextToEvents(manualText);
      if (!evts.length) { setError('אין טקסט משוב לקליטה. הדבק לפחות שורה אחת.'); return; }
      setWorks([prepWork({
        key: 'manual',
        origin: 'upload',
        materialId: '',
        fileName: '',
        title: '',
        source: 'manual',
        authors: [],
        suspectedLecturer: '',
        gradeSuggestion: null,
        events: evts,
        allEvents: evts,
        raw: null,
        weakOnly: false,
      })]);
      setStep(2);
      return;
    }

    if (mode === 'annotated') {
      if (!mainFiles.length) { setError('בחר לפחות קובץ מוחזר אחד.'); return; }
      setBusy('סורק קבצים…');
      try {
        const { works: found, failures, empty } = await scanFilesForFeedback(mainFiles, { onProgress: onScanProgress });
        setScanReport({ failures, empty, skipped: [], scanned: mainFiles.length });
        if (!found.length) {
          setError('לא נמצאו הערות, שינויים או סימונים בקבצים שנבחרו. נסה "השוואת גרסאות" מול ההגשה המקורית, או הדבק את המשוב ב"משוב ידני".');
          return;
        }
        setWorks(found.map(prepWork));
        if (found.length === 1) setExpanded(new Set([found[0].key]));
        setStep(2);
      } catch (err) {
        setError(String(err?.message || err) || 'שגיאת סריקה');
      } finally {
        setBusy('');
        setProgress('');
      }
      return;
    }

    if (mode === 'existing') {
      setBusy('סורק את החומרים הקיימים…');
      try {
        let courseId = '';
        try { courseId = resolveActiveCourse().course?.id || ''; } catch {}
        const { works: found, scanned, skipped } = await scanExistingMaterialsForFeedback({ courseId, onProgress: onScanProgress });
        setScanReport({ failures: [], empty: [], skipped, scanned });
        if (!found.length) {
          setError('לא נמצאו הערות מרצה בקבצים הקיימים.');
          return;
        }
        setWorks(found.map(prepWork));
        if (found.length === 1) setExpanded(new Set([found[0].key]));
        setStep(2);
      } catch (err) {
        setError(String(err?.message || err) || 'שגיאת סריקה');
      } finally {
        setBusy('');
        setProgress('');
      }
      return;
    }

    // diff — זוג קבצים יחיד, נעטף כ-work אחד כדי ששאר הזרימה תישאר אחידה.
    if (!submittedFile || !returnedFile) { setError('צריך את שני הקבצים: ההגשה המקורית והגרסה שחזרה.'); return; }
    setBusy('משווה בין הגרסאות…');
    try {
      const [aBytes, bBytes] = await Promise.all([bytesOf(submittedFile), bytesOf(returnedFile)]);
      const [a, b] = await Promise.all([
        extractMaterialTextFromBytes(submittedFile.name, aBytes, 200000),
        extractMaterialTextFromBytes(returnedFile.name, bBytes, 200000),
      ]);
      if (!a?.ok) { setError(`לא הצלחתי לקרוא את "${submittedFile.name}": ${a?.error || 'שגיאה'}`); return; }
      if (!b?.ok) { setError(`לא הצלחתי לקרוא את "${returnedFile.name}": ${b?.error || 'שגיאה'}`); return; }
      const diff = diffSubmissionVsReturned(a.text, b.text);
      if (!diff?.ok) { setError(diff?.error || 'ההשוואה נכשלה.'); return; }
      const evts = diff.events || [];
      setDiffStats(diff.stats || null);
      setNeedsConfirmation(!!diff.needsConfirmation);
      setWorks([prepWork({
        key: 'diff',
        origin: 'upload',
        materialId: '',
        fileName: returnedFile.name,
        title: returnedFile.name.replace(/\.[^.]+$/, ''),
        source: 'diff',
        authors: [],
        suspectedLecturer: '',
        gradeSuggestion: null,
        // הקובץ המוגש עצמו — האות הנקי ביותר לכתיבה של המשתמש (בלי אף תו של המרצה).
        submittedText: a.text,
        events: evts,
        allEvents: evts,
        raw: null,
        weakOnly: false,
      })]);
      setExpanded(new Set(['diff']));
      setStep(2);
    } catch (err) {
      setError(String(err?.message || err) || 'שגיאת השוואה');
    } finally {
      setBusy('');
    }
  }, [mode, mainFiles, submittedFile, returnedFile, manualText, resetExtraction, onScanProgress]);

  // ── נגזרות שלב 2 ────────────────────────────────────────────────────────
  const totalEvents = useMemo(() => works.reduce((sum, w) => sum + w.events.length, 0), [works]);

  const readyWorks = useMemo(
    () => works
      // בעבודה יחידה אין צ'קבוקס "כלול" בתצוגה — היא תמיד נכללת (weakOnly מבטל
      // סימון רק כשיש אצווה שצריך לסנן).
      .filter((w) => w.include || works.length === 1)
      .map((w) => ({ ...w, events: w.events.filter((_, i) => w.selected.has(i)) }))
      .filter((w) => w.events.length),
    [works],
  );

  const readySelectedEvents = useMemo(
    () => readyWorks.reduce((sum, w) => sum + w.events.length, 0),
    [readyWorks],
  );

  const single = works.length === 1 ? works[0] : null;

  const setAllEvents = useCallback((on) => {
    setWorks((prev) => prev.map((w) => ({
      ...w,
      include: on ? true : w.include,
      selected: on ? new Set(w.events.map((_, i) => i)) : new Set(),
    })));
  }, []);

  const goToAssign = useCallback(() => {
    setError('');
    if (!lecturerName.trim()) {
      // ברירת מחדל: המרצה שחוזר הכי הרבה פעמים בעבודות שנבחרו.
      const counts = new Map();
      for (const w of readyWorks) {
        const name = String(w.lecturerAuthor || w.suspectedLecturer || '').trim();
        if (name) counts.set(name, (counts.get(name) || 0) + 1);
      }
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (best) setLecturerName(best[0]);
    }
    setStep(3);
  }, [lecturerName, readyWorks]);

  // ── שלב 3: שמירה ────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!lecturerName.trim()) { setError('צריך שם מרצה.'); return; }
    if (!readyWorks.length) { setError('לא נבחר שום פריט משוב — אין מה לשמור.'); return; }
    setBusy('שומר…');
    setError('');
    try {
      // שם קורס שמתאים לרשומת קורס מנוהלת נשמר גם כ-courseId, כדי שהמשוב יתחבר
      // לקורס עצמו ולא רק למחרוזת.
      let matchedCourseId = '';
      try { matchedCourseId = findCourseByName(courseName.trim())?.id || ''; } catch {}
      const result = await ingestFeedbackBatch(
        readyWorks.map((w) => ({
          ...w,
          title: String(w.title || w.fileName || '').trim(),
          grade: String(w.grade || '').trim() || null,
        })),
        {
          lecturerName: lecturerName.trim(),
          courseName: courseName.trim(),
          courseId: matchedCourseId,
          date: date ? new Date(date).toISOString() : new Date().toISOString(),
        },
      );
      if (!result?.ok) {
        setError(result?.failures?.[0]?.reason || 'השמירה נכשלה — לא נוצר פרופיל מרצה.');
        return;
      }
      setSavedLecturerId(result.lecturerId);

      // הגוף שהמשתמש עצמו הגיש הוא כתיבה אקדמית 100% שלו — נקלט לקורפוס הסגנון.
      // fire-and-forget מוחלט: כל שער (הסכמה, אורך מינימלי, dedupe לפי hash) יושב
      // בתוך ingestGradedSubmission, וכישלון כאן לעולם לא מפיל את קליטת המשוב.
      // import דינמי — styleIngestService גורר את מנוע הסגנון כולו, ואין סיבה
      // שהאשף ייטען איתו.
      try {
        const { ingestGradedSubmission } = await import('../services/styleIngestService');
        for (const w of readyWorks) {
          // עדיפות ראשונה: הקובץ המוגש עצמו (מסלול diff). אחרת — שחזור מ-docx
          // לפי המחבר שהמשתמש אישר בשלב 2 (מחרוזת המחבר של Word, לא שם הפרופיל).
          const text = w.submittedText
            || (w.source === 'docx-comments' && w.raw
              ? buildSubmittedBodyText(w.raw, {
                lecturerAuthor: String(w.lecturerAuthor || w.suspectedLecturer || '').trim(),
              })
              : '');
          if (text) ingestGradedSubmission({ title: w.title || w.fileName, text }).catch(() => {});
        }
      } catch {}

      const failNote = result.failures?.length ? ` · ${result.failures.length} נכשלו` : '';
      setDoneNote(`נשמרו ${result.saved} עבודות · ${result.totalEvents} פריטי משוב אצל ${lecturerName.trim()}.${failNote}`);
      showToast('העבודות הבדוקות נקלטו', { tone: 'success' });
      try { setLecturers(listLecturerProfiles()); } catch {}
      setStep(4);
    } catch (err) {
      setError(String(err?.message || err) || 'השמירה נכשלה');
    } finally {
      setBusy('');
    }
  }, [lecturerName, readyWorks, courseName, date]);

  // ── שלב 4: זיקוק ────────────────────────────────────────────────────────
  const handleDistill = useCallback(async () => {
    if (!savedLecturerId) return;
    setBusy('מזקק לקחים…');
    setError('');
    try {
      const result = await distillLecturerRules(savedLecturerId);
      if (!result?.ok) { setError(result?.error || 'הזיקוק נכשל.'); return; }
      setCandidates((result.candidates || []).map((c, i) => ({
        ...c,
        _key: c.id || `c${i}`,
        _approved: true,
        _text: c.text,
      })));
      setDistillNote(result.viaModel ? 'הזיקוק רץ דרך מודל ה-AI.' : 'הזיקוק רץ מקומית (בלי מודל).');
    } catch (err) {
      setError(String(err?.message || err) || 'הזיקוק נכשל');
    } finally {
      setBusy('');
    }
  }, [savedLecturerId]);

  const handleSaveRules = useCallback(async () => {
    const approved = (candidates || [])
      .filter((c) => c._approved && String(c._text || '').trim())
      .map(({ _key, _approved, _text, ...rest }) => ({ ...rest, text: _text.trim(), userEdited: _text.trim() !== rest.text }));
    if (!approved.length) { setError('לא אושר אף לקח.'); return; }
    setBusy('שומר לקחים…');
    setError('');
    try {
      const { saved, promoted } = await saveDistilledRules(savedLecturerId, approved);
      showToast(
        `${saved} לקחים נשמרו${promoted > 0 ? ` · ${promoted} קודמו לרמה הכללית` : ''}`,
        { tone: 'success' },
      );
      setDoneNote(`${saved} לקחים נשמרו.${promoted > 0 ? ` ${promoted} קודמו לרמה הכללית.` : ''}`);
      setCandidates([]);
      onClose();
    } catch (err) {
      setError(String(err?.message || err) || 'שמירת הלקחים נכשלה');
    } finally {
      setBusy('');
    }
  }, [candidates, savedLecturerId, onClose]);

  const canProceedFromReview = (!needsConfirmation || diffConfirmed) && readyWorks.length > 0;

  // ── רינדור ──────────────────────────────────────────────────────────────
  return (
    <div
      dir="rtl"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(2,6,23,0.65)', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 860,
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
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--s-text-strong)' }}>📥 קליטת עבודה בדוקה</div>
            <StepDots step={step} />
          </div>
          <button type="button" onClick={onClose} style={{ ...BTN_STYLE, borderRadius: 999, padding: '4px 10px' }}>✕</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12 }}>
          {error ? (
            <div style={{ ...WARN_BOX_STYLE, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#B91C1C' }}>
              {error}
            </div>
          ) : null}
          {busy ? <div style={{ ...BODY_STYLE, marginBottom: 8 }}>⏳ {progress || busy}</div> : null}

          {/* ── שלב 1 ── */}
          {step === 1 ? (
            <div style={CARD_STYLE}>
              <div style={TITLE_STYLE}>מאיפה מגיע המשוב?</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {MODES.map((m) => (
                  <label
                    key={m.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      padding: '7px 9px',
                      borderRadius: 10,
                      cursor: 'pointer',
                      border: `1px solid ${mode === m.id ? '#1D4ED8' : 'var(--s-border)'}`,
                      background: mode === m.id ? '#DBEAFE' : 'var(--s-surface, #fff)',
                    }}
                  >
                    <input
                      type="radio"
                      name="wf-graded-mode"
                      checked={mode === m.id}
                      onChange={() => { setMode(m.id); resetExtraction(); }}
                      style={{ marginTop: 3 }}
                    />
                    <span>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: mode === m.id ? '#1D4ED8' : 'var(--s-text-strong)' }}>{m.label}</span>
                      <span style={{ ...BODY_STYLE, display: 'block' }}>{m.hint}</span>
                    </span>
                  </label>
                ))}
              </div>

              {mode === 'annotated' ? (
                <FilePick
                  label="הקבצים שהמרצה החזיר (docx / pdf) — אפשר לבחור כמה עבודות יחד"
                  files={mainFiles}
                  multiple
                  accept=".docx,.pdf"
                  onPick={setMainFiles}
                />
              ) : null}

              {mode === 'diff' ? (
                <>
                  <FilePick label="ההגשה המקורית" file={submittedFile} accept=".docx,.pdf,.txt" onPick={setSubmittedFile} />
                  <FilePick label="הגרסה שחזרה מהמרצה" file={returnedFile} accept=".docx,.pdf,.txt" onPick={setReturnedFile} />
                </>
              ) : null}

              {mode === 'manual' ? (
                <label style={{ ...BODY_STYLE, display: 'block' }}>
                  המשוב
                  <textarea
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                    rows={7}
                    placeholder="הדבק כאן את הערות המרצה — כל פסקה תהפוך לפריט משוב נפרד"
                    style={{ ...INPUT_STYLE, resize: 'vertical' }}
                  />
                </label>
              ) : null}

              {mode === 'existing' ? (
                <div>
                  <div style={{ ...BODY_STYLE, marginBottom: 6 }}>
                    מחפש הערות מרצה בקבצים שכבר העלית — עבודות בדוקות שנקלטו בעבר כחומר עזר.
                  </div>
                  <button type="button" disabled={!!busy} onClick={runExtraction} style={PRIMARY_BTN_STYLE}>
                    {busy ? 'סורק…' : 'סרוק את החומרים שכבר באפליקציה'}
                  </button>
                </div>
              ) : null}

              {scanReport ? (
                <div style={{ ...BODY_STYLE, marginTop: 10, borderTop: '1px solid var(--s-border)', paddingTop: 8 }}>
                  <div>נסרקו {scanReport.scanned} קבצים.</div>
                  {scanReport.empty?.length ? (
                    <div>בלי ממצאים: {scanReport.empty.join(' · ')}</div>
                  ) : null}
                  {scanReport.failures?.length ? (
                    <div>נכשלו: {scanReport.failures.map((f) => `${f.name} (${f.reason})`).join(' · ')}</div>
                  ) : null}
                  {scanReport.skipped?.length ? (
                    <div style={{ marginTop: 4 }}>
                      <button
                        type="button"
                        onClick={() => setShowSkipped((v) => !v)}
                        style={{ ...BTN_STYLE, padding: '3px 8px', fontSize: 10.5 }}
                      >
                        {showSkipped ? '▲' : '▼'} דילגתי על {scanReport.skipped.length} קבצים
                      </button>
                      {showSkipped ? (
                        <div style={{ marginTop: 4 }}>
                          {scanReport.skipped.map((s, i) => (
                            <div key={`${s.title}-${i}`} style={{ padding: '2px 0' }}>
                              <span style={{ color: 'var(--s-text-strong)' }}>{s.title}</span> — {s.reason}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ── שלב 2 ── */}
          {step === 2 ? (
            <>
              {needsConfirmation ? (
                <div style={WARN_BOX_STYLE}>
                  ⚠️ יותר מ-40% מהמשפטים שונים — ייתכן שאלה שני מסמכים שונים ולא שתי גרסאות של אותה עבודה.
                  {diffStats ? ` (${diffStats.changed} מתוך ${diffStats.total} משפטים)` : ''}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontWeight: 700, cursor: 'pointer' }}>
                    <input type="checkbox" checked={diffConfirmed} onChange={(e) => setDiffConfirmed(e.target.checked)} />
                    בדקתי — אלה באמת שתי גרסאות של אותה עבודה
                  </label>
                </div>
              ) : null}

              <div style={{ ...CARD_STYLE, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ ...TITLE_STYLE, marginBottom: 0 }}>
                  נמצאו {works.length} עבודות · {totalEvents} פריטי משוב
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" onClick={() => setAllEvents(true)} style={{ ...BTN_STYLE, padding: '3px 8px', fontSize: 10.5 }}>סמן הכל</button>
                  <button type="button" onClick={() => setAllEvents(false)} style={{ ...BTN_STYLE, padding: '3px 8px', fontSize: 10.5 }}>נקה הכל</button>
                </div>
              </div>

              {/* עבודה יחידה — התצוגה המפורטת הישנה */}
              {single ? (
                <>
                  {single.source === 'docx-comments' && single.authors?.length ? (
                    <div style={CARD_STYLE}>
                      <label style={BODY_STYLE}>
                        מי המרצה?
                        <select
                          value={single.lecturerAuthor}
                          onChange={(e) => {
                            const name = e.target.value;
                            const evts = eventsForAuthor(single, name);
                            updateWork(single.key, { lecturerAuthor: name, events: evts, selected: new Set(evts.map((_, i) => i)) });
                          }}
                          style={{ ...INPUT_STYLE, width: 'auto', minWidth: 220 }}
                        >
                          <option value="">כל המחברים</option>
                          {single.authors.map((a) => (
                            <option key={a.name} value={a.name}>
                              {a.name} · {a.count} סימונים{a.isCreator ? ' (יוצר הקובץ)' : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div style={{ ...BODY_STYLE, marginTop: 4 }}>
                        רק הסימונים של המחבר שנבחר ייקלטו. "כל המחברים" כולל גם הדגשות בלי מחבר.
                      </div>
                    </div>
                  ) : null}

                  <div style={CARD_STYLE}>
                    <div style={TITLE_STYLE}>פריטי משוב שנמצאו · {single.events.length}</div>
                    {!single.events.length ? (
                      <div style={EMPTY_STYLE}>
                        לא נמצאו הערות, שינויים או סימונים בקובץ. ייתכן שהמרצה כתב את המשוב במייל או בגוף הטקסט —
                        נסה "השוואת גרסאות" מול ההגשה המקורית, או הדבק את המשוב ב"משוב ידני".
                      </div>
                    ) : (
                      <EventList
                        events={single.events}
                        selected={single.selected}
                        onToggle={(idx, checked) => toggleEvent(single.key, idx, checked)}
                      />
                    )}
                  </div>

                  <div style={{ ...CARD_STYLE, display: 'grid', gridTemplateColumns: '1fr 140px', gap: 8 }}>
                    <label style={BODY_STYLE}>
                      שם המטלה
                      <input
                        value={single.title}
                        onChange={(e) => updateWork(single.key, { title: e.target.value })}
                        placeholder="עבודת אמצע"
                        style={INPUT_STYLE}
                      />
                    </label>
                    <label style={BODY_STYLE}>
                      ציון (אופציונלי)
                      <input
                        value={single.grade}
                        onChange={(e) => updateWork(single.key, { grade: e.target.value })}
                        placeholder="88"
                        style={INPUT_STYLE}
                      />
                    </label>
                  </div>
                </>
              ) : (
                works.map((w) => {
                  const isOpen = expanded.has(w.key);
                  const checkedCount = w.events.filter((_, i) => w.selected.has(i)).length;
                  return (
                    <div key={w.key} style={{ ...CARD_STYLE, opacity: w.include ? 1 : 0.65 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={w.include}
                          onChange={(e) => updateWork(w.key, { include: e.target.checked })}
                          style={{ marginTop: 8 }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                            <span style={CHIP_STYLE}>{SOURCE_LABELS[w.source] || w.source}</span>
                            <span style={{ ...CHIP_STYLE, background: '#F1F5F9', color: '#475569' }}>
                              {checkedCount}/{w.events.length} פריטים
                            </span>
                            {w.weakOnly ? (
                              <span style={{ ...CHIP_STYLE, background: '#FEF3C7', color: '#92400E' }}>סימונים בלבד — אות חלש</span>
                            ) : null}
                            {w.origin === 'existing' ? (
                              <span style={{ ...CHIP_STYLE, background: '#DCFCE7', color: '#166534' }}>קובץ קיים</span>
                            ) : null}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 8 }}>
                            <input
                              value={w.title}
                              onChange={(e) => updateWork(w.key, { title: e.target.value })}
                              placeholder="שם המטלה"
                              style={INPUT_STYLE}
                            />
                            <input
                              value={w.grade}
                              onChange={(e) => updateWork(w.key, { grade: e.target.value })}
                              placeholder="ציון"
                              style={INPUT_STYLE}
                            />
                          </div>
                          {w.source === 'docx-comments' && w.authors?.length ? (
                            <label style={{ ...BODY_STYLE, display: 'block', marginTop: 6 }}>
                              מי המרצה?
                              <select
                                value={w.lecturerAuthor}
                                onChange={(e) => {
                                  const name = e.target.value;
                                  const evts = eventsForAuthor(w, name);
                                  updateWork(w.key, { lecturerAuthor: name, events: evts, selected: new Set(evts.map((_, i) => i)) });
                                }}
                                style={{ ...INPUT_STYLE, width: 'auto', minWidth: 200 }}
                              >
                                <option value="">כל המחברים</option>
                                {w.authors.map((a) => (
                                  <option key={a.name} value={a.name}>
                                    {a.name} · {a.count} סימונים{a.isCreator ? ' (יוצר הקובץ)' : ''}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                          <div style={{ marginTop: 6 }}>
                            <button
                              type="button"
                              onClick={() => setExpanded((prev) => {
                                const next = new Set(prev);
                                if (next.has(w.key)) next.delete(w.key); else next.add(w.key);
                                return next;
                              })}
                              style={{ ...BTN_STYLE, padding: '3px 8px', fontSize: 10.5 }}
                            >
                              {isOpen ? '▲ הסתר פריטים' : '▼ הצג פריטים'}
                            </button>
                          </div>
                          {isOpen ? (
                            <div style={{ marginTop: 6 }}>
                              {w.events.length ? (
                                <EventList
                                  events={w.events}
                                  selected={w.selected}
                                  onToggle={(idx, checked) => toggleEvent(w.key, idx, checked)}
                                  maxHeight={220}
                                />
                              ) : (
                                <div style={EMPTY_STYLE}>אין פריטים למחבר שנבחר.</div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          ) : null}

          {/* ── שלב 3 ── */}
          {step === 3 ? (
            <div style={CARD_STYLE}>
              <div style={TITLE_STYLE}>למי לשייך את המשוב?</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label style={BODY_STYLE}>
                  שם המרצה
                  <input
                    list="wf-graded-lecturers"
                    value={lecturerName}
                    onChange={(e) => setLecturerName(e.target.value)}
                    placeholder="ד״ר ישראל ישראלי"
                    style={INPUT_STYLE}
                  />
                  <datalist id="wf-graded-lecturers">
                    {lecturers.map((l) => <option key={l.id} value={l.name} />)}
                  </datalist>
                </label>
                <label style={BODY_STYLE}>
                  קורס
                  <input
                    list="wf-graded-courses"
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    placeholder="שם הקורס"
                    style={INPUT_STYLE}
                  />
                  <datalist id="wf-graded-courses">
                    {courseOptions.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </label>
                <label style={BODY_STYLE}>
                  תאריך
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={INPUT_STYLE} />
                </label>
              </div>
              <div style={{ ...BODY_STYLE, marginTop: 8 }}>
                ייקלטו {readyWorks.length} עבודות · {readySelectedEvents} פריטי משוב. שמות המטלות והציונים נקבעו בשלב הקודם.
              </div>
            </div>
          ) : null}

          {/* ── שלב 4 ── */}
          {step === 4 ? (
            <div style={CARD_STYLE}>
              <div style={TITLE_STYLE}>✅ נשמר</div>
              <div style={{ ...BODY_STYLE, marginBottom: 8 }}>{doneNote}</div>

              {candidates === null ? (
                <>
                  <div style={{ ...BODY_STYLE, marginBottom: 8 }}>
                    אפשר לזקק מהמשובים שנצברו לקחים חוזרים. הלקחים מוצגים לאישור — כלום לא נשמר בלי שתאשר.
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" disabled={!!busy} onClick={handleDistill} style={PRIMARY_BTN_STYLE}>🧪 זקק לקחים עכשיו</button>
                    <button type="button" onClick={onClose} style={BTN_STYLE}>דלג</button>
                  </div>
                </>
              ) : (
                <>
                  {distillNote ? <div style={{ ...BODY_STYLE, marginBottom: 6 }}>{distillNote}</div> : null}
                  {candidates.length ? candidates.map((c, idx) => (
                    <div key={c._key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, border: '1px solid var(--s-border)', borderRadius: 10, background: 'var(--s-surface, #fff)', padding: '8px 10px', marginBottom: 6 }}>
                      <input
                        type="checkbox"
                        checked={c._approved}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setCandidates((prev) => prev.map((x, i) => (i === idx ? { ...x, _approved: checked } : x)));
                        }}
                        style={{ marginTop: 4 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <textarea
                          value={c._text}
                          rows={2}
                          onChange={(e) => {
                            const text = e.target.value;
                            setCandidates((prev) => prev.map((x, i) => (i === idx ? { ...x, _text: text } : x)));
                          }}
                          style={{ ...INPUT_STYLE, resize: 'vertical' }}
                        />
                        <div style={{ marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10.5, fontWeight: 700, background: '#EEF2FF', color: '#4338CA', padding: '2px 8px', borderRadius: 999 }}>
                            {CATEGORY_LABELS[c.category] || CATEGORY_LABELS.other}
                          </span>
                          <span style={{ fontSize: 10.5, fontWeight: 700, background: '#F1F5F9', color: '#475569', padding: '2px 8px', borderRadius: 999 }}>
                            {(c.evidenceEventIds?.length || c.evidenceCount || 0)} ראיות
                          </span>
                          {c.mergedInto ? (
                            <span style={{ fontSize: 10.5, fontWeight: 700, background: '#F1F5F9', color: '#475569', padding: '2px 8px', borderRadius: 999 }}>
                              מיזוג ללקח קיים
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div style={EMPTY_STYLE}>לא נמצאו לקחים חוזרים במשובים שנקלטו. אחרי עוד עבודה־שתיים יהיה מספיק חומר.</div>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    {candidates.length ? (
                      <button type="button" disabled={!!busy} onClick={handleSaveRules} style={PRIMARY_BTN_STYLE}>שמור לקחים</button>
                    ) : null}
                    <button type="button" onClick={onClose} style={BTN_STYLE}>סגור</button>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>

        {/* ניווט */}
        {step < 4 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--s-border)', background: 'var(--s-surface-2, #F8FAFC)' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {step > 1 ? (
                <button type="button" onClick={() => { setError(''); setStep(step - 1); }} style={BTN_STYLE}>→ חזרה</button>
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={onClose} style={BTN_STYLE}>ביטול</button>
              {step === 1 && mode !== 'existing' ? (
                <button type="button" disabled={!!busy} onClick={runExtraction} style={PRIMARY_BTN_STYLE}>
                  {busy ? 'קורא…' : 'המשך'}
                </button>
              ) : null}
              {step === 2 ? (
                <button
                  type="button"
                  disabled={!canProceedFromReview}
                  onClick={goToAssign}
                  style={{ ...PRIMARY_BTN_STYLE, opacity: canProceedFromReview ? 1 : 0.5 }}
                >
                  המשך
                </button>
              ) : null}
              {step === 3 ? (
                <button type="button" disabled={!!busy} onClick={handleSave} style={PRIMARY_BTN_STYLE}>
                  {busy ? 'שומר…' : 'שמור'}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
