// GradedReturnWizard.jsx — "קליטת עבודה בדוקה": אשף בן ארבעה שלבים שמכניס משוב
// מרצה מעבודה שחזרה אל lecturerProfileStore, ומציע לזקק ממנו לקחים.
//
// ⚠️ האשף **קולט בלבד**. הוא לא מבטיח ציון ולא מנחש מה המרצה "יאהב" — כל אירוע
// שנשמר הוא ציטוט של מה שנכתב בפועל בעבודה הבדוקה, והמשתמש רואה ומאשר כל אחד
// לפני השמירה.
//
// שלושה מסלולי קליטה:
//   annotated — docx עם הערות/שינויים מסומנים, או pdf עם הערות.
//   diff      — הגשה מקורית מול הגרסה שחזרה; ההפרש הוא המשוב.
//   manual    — הדבקת טקסט המשוב.
//
// עיצוב: אותן קונבנציות של LecturerProfilePanel (inline styles מעל משתני --s-*),
// כדי שהאשף ייראה זהה בין הפאנל לבין סטודיו השלד.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { extractDocxFeedback, docxFeedbackToEvents } from '../services/docxFeedbackExtract';
import { extractPdfAnnotations, extractMaterialTextFromBytes } from '../services/materialExtractBrowser';
import { diffSubmissionVsReturned } from '../services/feedbackDiffService';
import {
  ensureLecturerProfilesReady,
  listLecturerProfiles,
  recordGradedReturn,
} from '../services/lecturerProfileStore';
import { distillLecturerRules, saveDistilledRules } from '../services/lecturerRulesService';
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

const MODES = [
  { id: 'annotated', label: '📝 קובץ מוחזר עם הערות', hint: 'docx עם הערות/עקוב-אחר-שינויים, או PDF עם הערות' },
  { id: 'diff', label: '🔀 השוואת גרסאות', hint: 'ההגשה המקורית מול הגרסה שהמרצה החזיר' },
  { id: 'manual', label: '✍️ משוב ידני', hint: 'הדבקת המשוב כטקסט חופשי' },
];

const SOURCE_BY_MODE = { annotated: 'docx-comments', diff: 'diff', manual: 'manual' };

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

const extOf = (name) => String(name || '').toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || '';

/** פסקאות משוב חופשי → אירועי manual (אותו פיצול כמו addManualFeedback). */
function manualTextToEvents(text) {
  return String(text || '')
    .split(/\n+/)
    .map((p) => p.replace(/^[\s•·\-*\d.)\]]+/, '').trim())
    .filter((p) => p.length >= 4)
    .map((p) => ({ kind: 'manual', anchorExcerpt: '', feedbackText: p }));
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

function FilePick({ label, file, accept, onPick }) {
  const ref = useRef(null);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ ...BODY_STYLE, marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => ref.current?.click()} style={BTN_STYLE}>בחר קובץ…</button>
        <span style={{ ...BODY_STYLE, color: file ? 'var(--s-text-strong)' : 'var(--s-muted)' }}>
          {file ? file.name : 'לא נבחר קובץ'}
        </span>
        <input
          ref={ref}
          type="file"
          accept={accept}
          style={{ display: 'none' }}
          onChange={(e) => { onPick(e.target.files?.[0] || null); e.target.value = ''; }}
        />
      </div>
    </div>
  );
}

export default function GradedReturnWizard({ onClose = () => {}, initialFile = null }) {
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState('annotated');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const [lecturers, setLecturers] = useState([]);

  // שלב 1
  const [mainFile, setMainFile] = useState(initialFile || null);
  const [submittedFile, setSubmittedFile] = useState(null);
  const [returnedFile, setReturnedFile] = useState(null);
  const [manualText, setManualText] = useState('');

  // תוצרי החילוץ
  const [docxResult, setDocxResult] = useState(null);
  const [lecturerAuthor, setLecturerAuthor] = useState('');
  const [rawEvents, setRawEvents] = useState([]);
  const [diffStats, setDiffStats] = useState(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [diffConfirmed, setDiffConfirmed] = useState(false);

  // שלב 2/3
  const [selected, setSelected] = useState(() => new Set());
  const [grade, setGrade] = useState('');
  const [lecturerName, setLecturerName] = useState('');
  const [courseName, setCourseName] = useState('');
  const [assignmentTitle, setAssignmentTitle] = useState('');
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

  const events = useMemo(() => {
    if (mode === 'annotated' && docxResult) return docxFeedbackToEvents(docxResult, { lecturerAuthor });
    return rawEvents;
  }, [mode, docxResult, lecturerAuthor, rawEvents]);

  // כל שינוי ברשימת האירועים (למשל החלפת המחבר שנחשב מרצה) מאפס את הבחירה להכל.
  useEffect(() => {
    setSelected(new Set(events.map((_, i) => i)));
  }, [events]);

  const courseOptions = useMemo(() => {
    const match = lecturers.find((l) => l.name === lecturerName);
    return match ? match.courses : [...new Set(lecturers.flatMap((l) => l.courses))];
  }, [lecturers, lecturerName]);

  const resetExtraction = () => {
    setDocxResult(null);
    setLecturerAuthor('');
    setRawEvents([]);
    setDiffStats(null);
    setNeedsConfirmation(false);
    setDiffConfirmed(false);
    setError('');
  };

  // ── שלב 1 → 2: חילוץ ────────────────────────────────────────────────────
  const runExtraction = useCallback(async () => {
    resetExtraction();
    setError('');

    if (mode === 'manual') {
      const evts = manualTextToEvents(manualText);
      if (!evts.length) { setError('אין טקסט משוב לקליטה. הדבק לפחות שורה אחת.'); return; }
      setRawEvents(evts);
      setStep(2);
      return;
    }

    if (mode === 'annotated') {
      if (!mainFile) { setError('בחר את הקובץ המוחזר.'); return; }
      const ext = extOf(mainFile.name);
      setBusy('קורא את הקובץ…');
      try {
        const bytes = await bytesOf(mainFile);
        if (ext === '.docx') {
          const result = await extractDocxFeedback(bytes);
          if (!result?.ok) { setError(result?.error || 'לא הצלחתי לקרוא את קובץ ה-docx.'); return; }
          setDocxResult(result);
          setLecturerAuthor(result.suspectedLecturer || '');
          if (result.gradeSuggestion !== null && result.gradeSuggestion !== undefined) {
            setGrade(String(result.gradeSuggestion));
          }
          if (result.suspectedLecturer && !lecturerName) setLecturerName(result.suspectedLecturer);
          if (!assignmentTitle) setAssignmentTitle(mainFile.name.replace(/\.[^.]+$/, ''));
          setStep(2);
        } else if (ext === '.pdf') {
          const result = await extractPdfAnnotations(bytes);
          if (!result?.ok) { setError(result?.error || 'לא הצלחתי לקרוא את ה-PDF.'); return; }
          const evts = (result.annotations || []).map((a) => ({
            kind: a.kind,
            anchorExcerpt: a.anchorExcerpt,
            feedbackText: a.text,
          }));
          setRawEvents(evts);
          if (!assignmentTitle) setAssignmentTitle(mainFile.name.replace(/\.[^.]+$/, ''));
          const author = (result.annotations || []).map((a) => a.author).find(Boolean);
          if (author && !lecturerName) setLecturerName(author);
          setStep(2);
        } else {
          setError('המסלול הזה תומך ב-docx או ב-PDF בלבד. לקובץ אחר השתמש ב"השוואת גרסאות" או ב"משוב ידני".');
        }
      } catch (err) {
        setError(String(err?.message || err) || 'שגיאת קריאה');
      } finally {
        setBusy('');
      }
      return;
    }

    // diff
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
      setRawEvents(diff.events || []);
      setDiffStats(diff.stats || null);
      setNeedsConfirmation(!!diff.needsConfirmation);
      if (!assignmentTitle) setAssignmentTitle(returnedFile.name.replace(/\.[^.]+$/, ''));
      setStep(2);
    } catch (err) {
      setError(String(err?.message || err) || 'שגיאת השוואה');
    } finally {
      setBusy('');
    }
  }, [mode, mainFile, submittedFile, returnedFile, manualText, lecturerName, assignmentTitle]);

  const selectedEvents = useMemo(
    () => events.filter((_, i) => selected.has(i)),
    [events, selected],
  );

  const noFindings = step === 2 && !events.length;

  // ── שלב 3: שמירה ────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!lecturerName.trim()) { setError('צריך שם מרצה.'); return; }
    if (!selectedEvents.length && !grade.trim()) { setError('לא נבחר שום פריט משוב ואין ציון — אין מה לשמור.'); return; }
    setBusy('שומר…');
    setError('');
    try {
      const result = await recordGradedReturn(
        lecturerName.trim(),
        {
          date: date ? new Date(date).toISOString() : new Date().toISOString(),
          courseName: courseName.trim(),
          assignmentTitle: assignmentTitle.trim(),
          grade: grade.trim() || null,
          // annotated מתפצל לפי סוג הקובץ בפועל — docxResult קיים רק במסלול ה-docx.
          source: mode === 'annotated'
            ? (docxResult ? 'docx-comments' : 'pdf-annots')
            : (SOURCE_BY_MODE[mode] || 'manual'),
        },
        selectedEvents,
      );
      if (!result?.lecturer) { setError('השמירה נכשלה — לא נוצר פרופיל מרצה.'); return; }
      setSavedLecturerId(result.lecturer.id);
      setDoneNote(`נשמרו ${result.addedEvents.length} פריטי משוב אצל ${result.lecturer.name}.`);
      showToast('העבודה הבדוקה נקלטה', { tone: 'success' });
      try { setLecturers(listLecturerProfiles()); } catch {}
      setStep(4);
    } catch (err) {
      setError(String(err?.message || err) || 'השמירה נכשלה');
    } finally {
      setBusy('');
    }
  }, [lecturerName, selectedEvents, grade, date, courseName, assignmentTitle, mode, docxResult]);

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
          {busy ? <div style={{ ...BODY_STYLE, marginBottom: 8 }}>⏳ {busy}</div> : null}

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
                <FilePick label="הקובץ שהמרצה החזיר (docx / pdf)" file={mainFile} accept=".docx,.pdf" onPick={setMainFile} />
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

              {docxResult && docxResult.authors?.length ? (
                <div style={CARD_STYLE}>
                  <label style={BODY_STYLE}>
                    מי המרצה?
                    <select
                      value={lecturerAuthor}
                      onChange={(e) => setLecturerAuthor(e.target.value)}
                      style={{ ...INPUT_STYLE, width: 'auto', minWidth: 220 }}
                    >
                      <option value="">כל המחברים</option>
                      {docxResult.authors.map((a) => (
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div style={TITLE_STYLE}>פריטי משוב שנמצאו · {events.length}</div>
                  {events.length ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" onClick={() => setSelected(new Set(events.map((_, i) => i)))} style={{ ...BTN_STYLE, padding: '3px 8px', fontSize: 10.5 }}>סמן הכל</button>
                      <button type="button" onClick={() => setSelected(new Set())} style={{ ...BTN_STYLE, padding: '3px 8px', fontSize: 10.5 }}>נקה הכל</button>
                    </div>
                  ) : null}
                </div>

                {noFindings ? (
                  <div style={EMPTY_STYLE}>
                    לא נמצאו הערות, שינויים או סימונים בקובץ. ייתכן שהמרצה כתב את המשוב במייל או בגוף הטקסט —
                    נסה "השוואת גרסאות" מול ההגשה המקורית, או הדבק את המשוב ב"משוב ידני".
                  </div>
                ) : (
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {events.map((ev, idx) => (
                      <label
                        key={`${ev.kind}-${idx}`}
                        style={{ display: 'flex', alignItems: 'flex-start', gap: 8, borderBottom: '1px solid var(--s-border)', padding: '6px 0', cursor: 'pointer' }}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(idx)}
                          onChange={(e) => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(idx); else next.delete(idx);
                              return next;
                            });
                          }}
                          style={{ marginTop: 3 }}
                        />
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: '#4338CA', background: '#EEF2FF', borderRadius: 999, padding: '2px 7px', whiteSpace: 'nowrap', marginTop: 1 }}>
                          {KIND_LABELS[ev.kind] || ev.kind}
                        </span>
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
                )}
              </div>

              <div style={CARD_STYLE}>
                <label style={BODY_STYLE}>
                  ציון (אופציונלי)
                  <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="88" style={{ ...INPUT_STYLE, width: 120 }} />
                </label>
              </div>
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
                  שם המטלה
                  <input value={assignmentTitle} onChange={(e) => setAssignmentTitle(e.target.value)} placeholder="עבודת אמצע" style={INPUT_STYLE} />
                </label>
                <label style={BODY_STYLE}>
                  תאריך
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={INPUT_STYLE} />
                </label>
                <label style={BODY_STYLE}>
                  ציון (אופציונלי)
                  <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="88" style={INPUT_STYLE} />
                </label>
              </div>
              <div style={{ ...BODY_STYLE, marginTop: 8 }}>
                ייקלטו {selectedEvents.length} פריטי משוב מתוך {events.length}.
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
              {step === 1 ? (
                <button type="button" disabled={!!busy} onClick={runExtraction} style={PRIMARY_BTN_STYLE}>
                  {busy ? 'קורא…' : 'המשך'}
                </button>
              ) : null}
              {step === 2 ? (
                <button
                  type="button"
                  disabled={(needsConfirmation && !diffConfirmed) || (!selectedEvents.length && !grade.trim())}
                  onClick={() => { setError(''); setStep(3); }}
                  style={{
                    ...PRIMARY_BTN_STYLE,
                    opacity: (needsConfirmation && !diffConfirmed) || (!selectedEvents.length && !grade.trim()) ? 0.5 : 1,
                  }}
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
