// LecturerProfilePanel.jsx — "פרופיל מרצים": חלון שקיפות ועריכה על מה שנלמד
// ממשובי מרצים (lecturerProfileStore): עבודות שנקלטו, אירועי משוב, והלקחים
// שזוקקו מהם.
//
// ⚠️ הפאנל **מתאר בלבד**. אסור לו להבטיח שיפור ציון או "מה המרצה יאהב" — הוא
// מדווח מה נכתב בעבודות הבדוקות, לא מה זה יעשה לתוצאה הבאה.
// עריכת משתמש על לקח מסמנת userEdited ⇒ מנצחת זיקוק חוזר וסנכרון.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ensureLecturerProfilesReady,
  listLecturerProfiles,
  addManualFeedback,
  updateRule,
  setRuleStatus,
  deleteRule,
  deleteLecturer,
  mergeLecturers,
  exportLecturerProfiles,
  LECTURER_PROFILES_UPDATED_EVENT,
} from '../services/lecturerProfileStore';
import { showToast, showConfirm } from '../services/uiFeedback';
import GradedReturnWizard from './GradedReturnWizard';

const CATEGORY_LABELS = {
  citation: 'ציטוט ומראי מקום',
  structure: 'מבנה',
  argument: 'טיעון',
  language: 'ניסוח',
  formatting: 'עיצוב',
  sources: 'מקורות',
  other: 'אחר',
};

const CONFIDENCE_LABELS = { high: 'גבוה', medium: 'בינוני', low: 'נמוך' };
const CONFIDENCE_COLORS = {
  high: { bg: '#DCFCE7', fg: '#166534', border: '#86EFAC' },
  medium: { bg: '#FEF3C7', fg: '#92400E', border: '#FCD34D' },
  low: { bg: '#F1F5F9', fg: '#475569', border: '#CBD5E1' },
};

const SOURCE_LABELS = {
  'docx-comments': 'הערות Word',
  'pdf-annots': 'הערות PDF',
  manual: 'ידני',
  diff: 'השוואת גרסאות',
};

const SCOPE_LABELS = { global: 'כל המרצים', lecturer: 'המרצה', course: 'קורס' };

const GLOBAL_TAB_ID = '__global__';

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

function Chip({ children, tone = 'indigo' }) {
  const tones = {
    indigo: { bg: '#EEF2FF', fg: '#4338CA' },
    slate: { bg: '#F1F5F9', fg: '#475569' },
  };
  const t = tones[tone] || tones.indigo;
  return (
    <span style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 700, background: t.bg, color: t.fg, padding: '3px 8px', borderRadius: 999, marginInlineEnd: 6, marginTop: 4 }}>
      {children}
    </span>
  );
}

function ConfidenceBadge({ confidence }) {
  const c = CONFIDENCE_COLORS[confidence] || CONFIDENCE_COLORS.low;
  return (
    <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 800, background: c.bg, color: c.fg, border: `1px solid ${c.border}`, padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap' }}>
      ביטחון {CONFIDENCE_LABELS[confidence] || CONFIDENCE_LABELS.low}
    </span>
  );
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function averageGrade(returns = []) {
  const nums = returns
    .map((r) => Number(String(r.grade ?? '').replace(/[^\d.]/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

// ── שורת לקח ──────────────────────────────────────────────────────────────
function RuleRow({ rule, events, lecturerId, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(rule.text);
  const [showEvidence, setShowEvidence] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setDraft(rule.text); }, [rule.text]);

  const evidence = useMemo(() => {
    const byId = new Map((events || []).map((e) => [e.id, e]));
    return (rule.evidenceEventIds || []).map((id) => byId.get(id)).filter(Boolean);
  }, [events, rule.evidenceEventIds]);

  const run = useCallback(async (fn, okMsg) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) showToast(okMsg, { tone: 'success' });
      onChanged();
    } catch (error) {
      showToast(error?.message || 'הפעולה נכשלה', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }, [onChanged]);

  const saveText = () => {
    const text = draft.trim();
    setEditing(false);
    if (!text || text === rule.text) { setDraft(rule.text); return; }
    run(() => updateRule(rule.id, { text }, { lecturerId }), 'הלקח עודכן');
  };

  const disabled = rule.status === 'disabled';

  return (
    <div style={{ border: '1px solid var(--s-border)', borderRadius: 10, background: 'var(--s-surface, #fff)', padding: '8px 10px', marginBottom: 6, opacity: disabled ? 0.55 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <textarea
              value={draft}
              autoFocus
              rows={2}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={saveText}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); }
                if (e.key === 'Escape') { setDraft(rule.text); setEditing(false); }
              }}
              style={{ ...INPUT_STYLE, resize: 'vertical' }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              title="לחץ לעריכה"
              style={{ all: 'unset', display: 'block', width: '100%', cursor: 'text', fontSize: 12.5, lineHeight: 1.7, color: 'var(--s-text-strong)', textAlign: 'right' }}
            >
              {rule.text}
            </button>
          )}
          <div style={{ marginTop: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
            <ConfidenceBadge confidence={rule.confidence} />
            <Chip>{CATEGORY_LABELS[rule.category] || CATEGORY_LABELS.other}</Chip>
            <Chip tone="slate">{SCOPE_LABELS[rule.scope] || rule.scope}{rule.scope === 'course' && rule.courseName ? `: ${rule.courseName}` : ''}</Chip>
            <button
              type="button"
              onClick={() => setShowEvidence((v) => !v)}
              style={{ ...BTN_STYLE, padding: '2px 8px', fontSize: 10.5, marginTop: 4 }}
            >
              {showEvidence ? '▾' : '▸'} {rule.evidenceCount} ראיות
            </button>
            {rule.userEdited ? <Chip tone="slate">נערך על ידך</Chip> : null}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => setRuleStatus(rule.id, disabled ? 'active' : 'disabled', { lecturerId }), disabled ? 'הלקח הופעל' : 'הלקח כובה')}
            style={{ ...BTN_STYLE, padding: '3px 8px', fontSize: 10.5 }}
          >
            {disabled ? 'הפעל' : 'כבה'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              const ok = await showConfirm('למחוק את הלקח הזה?', { title: 'מחיקת לקח', confirmLabel: 'מחק', tone: 'danger' });
              if (ok) run(() => deleteRule(rule.id, { lecturerId }), 'הלקח נמחק');
            }}
            style={{ ...DANGER_BTN_STYLE, padding: '3px 8px', fontSize: 10.5 }}
          >
            מחק
          </button>
        </div>
      </div>

      {showEvidence ? (
        <div style={{ marginTop: 6, borderTop: '1px solid var(--s-border)', paddingTop: 6 }}>
          {evidence.length ? evidence.map((ev) => (
            <div key={ev.id} style={{ ...BODY_STYLE, marginBottom: 5 }}>
              {ev.anchorExcerpt ? (
                <div style={{ fontStyle: 'italic', opacity: 0.85 }}>״{ev.anchorExcerpt}״</div>
              ) : null}
              <div style={{ color: 'var(--s-text-strong)' }}>← {ev.feedbackText}</div>
            </div>
          )) : (
            <div style={EMPTY_STYLE}>האירועים שמהם נגזר הלקח כבר לא נשמרים (נדחקו מהתקרה), אבל ספירת הראיות נשמרה.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── טופס משוב ידני ────────────────────────────────────────────────────────
function ManualFeedbackForm({ lecturers, defaultLecturerName = '', onDone, onCancel }) {
  const [lecturerName, setLecturerName] = useState(defaultLecturerName);
  const [courseName, setCourseName] = useState('');
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [grade, setGrade] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [busy, setBusy] = useState(false);

  const courseOptions = useMemo(() => {
    const match = lecturers.find((l) => l.name === lecturerName);
    return match ? match.courses : [...new Set(lecturers.flatMap((l) => l.courses))];
  }, [lecturers, lecturerName]);

  const submit = async () => {
    if (!lecturerName.trim()) { showToast('צריך שם מרצה', { tone: 'error' }); return; }
    if (!feedbackText.trim() && !grade.trim()) { showToast('צריך משוב או ציון', { tone: 'error' }); return; }
    setBusy(true);
    try {
      await addManualFeedback({
        lecturerName: lecturerName.trim(),
        courseName: courseName.trim(),
        assignmentTitle: assignmentTitle.trim(),
        grade: grade.trim() || null,
        feedbackText,
      });
      showToast('המשוב נקלט', { tone: 'success' });
      onDone(lecturerName.trim());
    } catch (error) {
      showToast(error?.message || 'לא הצלחתי לשמור את המשוב', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={CARD_STYLE}>
      <div style={TITLE_STYLE}>➕ משוב ידני</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label style={BODY_STYLE}>
          שם המרצה
          <input
            list="wf-lecturer-names"
            value={lecturerName}
            onChange={(e) => setLecturerName(e.target.value)}
            placeholder="ד״ר ישראל ישראלי"
            style={INPUT_STYLE}
          />
          <datalist id="wf-lecturer-names">
            {lecturers.map((l) => <option key={l.id} value={l.name} />)}
          </datalist>
        </label>
        <label style={BODY_STYLE}>
          קורס
          <input
            list="wf-lecturer-courses"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            placeholder="שם הקורס"
            style={INPUT_STYLE}
          />
          <datalist id="wf-lecturer-courses">
            {courseOptions.map((c) => <option key={c} value={c} />)}
          </datalist>
        </label>
        <label style={BODY_STYLE}>
          שם המטלה
          <input value={assignmentTitle} onChange={(e) => setAssignmentTitle(e.target.value)} placeholder="עבודת אמצע" style={INPUT_STYLE} />
        </label>
        <label style={BODY_STYLE}>
          ציון (לא חובה)
          <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="88" style={INPUT_STYLE} />
        </label>
      </div>
      <label style={{ ...BODY_STYLE, display: 'block', marginTop: 8 }}>
        המשוב
        <textarea
          value={feedbackText}
          onChange={(e) => setFeedbackText(e.target.value)}
          rows={5}
          placeholder="הדבק כאן את הערות המרצה — כל פסקה תהפוך לפריט משוב נפרד"
          style={{ ...INPUT_STYLE, resize: 'vertical' }}
        />
      </label>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-start' }}>
        <button type="button" disabled={busy} onClick={submit} style={PRIMARY_BTN_STYLE}>{busy ? 'שומר…' : 'שמור משוב'}</button>
        <button type="button" onClick={onCancel} style={BTN_STYLE}>ביטול</button>
      </div>
    </div>
  );
}

// ── הפאנל ─────────────────────────────────────────────────────────────────
export default function LecturerProfilePanel({ onClose = () => {} }) {
  const [loading, setLoading] = useState(true);
  const [lecturers, setLecturers] = useState([]);
  const [globalRules, setGlobalRules] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState('');

  const read = useCallback(() => {
    let list = [];
    let globals = [];
    try { list = listLecturerProfiles(); } catch {}
    try { globals = exportLecturerProfiles()?.globalRules || []; } catch {}
    setLecturers(list);
    setGlobalRules(globals);
    setSelectedId((prev) => {
      if (prev === GLOBAL_TAB_ID) return prev;
      if (prev && list.some((l) => l.id === prev)) return prev;
      return list[0]?.id || GLOBAL_TAB_ID;
    });
  }, []);

  useEffect(() => {
    let alive = true;
    const refresh = () => { if (alive) read(); };
    (async () => {
      try { await ensureLecturerProfilesReady(); } catch {}
      if (!alive) return;
      read();
      setLoading(false);
    })();
    if (typeof window !== 'undefined') window.addEventListener(LECTURER_PROFILES_UPDATED_EVENT, refresh);
    return () => {
      alive = false;
      if (typeof window !== 'undefined') window.removeEventListener(LECTURER_PROFILES_UPDATED_EVENT, refresh);
    };
  }, [read]);

  const isGlobalTab = selectedId === GLOBAL_TAB_ID;
  const selected = isGlobalTab ? null : lecturers.find((l) => l.id === selectedId) || null;
  const rules = isGlobalTab ? globalRules : (selected?.rules || []);
  const events = selected?.events || [];
  const returns = useMemo(
    () => [...(selected?.returns || [])].sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [selected],
  );

  const handleDeleteLecturer = async () => {
    if (!selected) return;
    const ok = await showConfirm(
      `למחוק את הפרופיל של ${selected.name}? כל הלקחים והמשובים שנקלטו ממנו יימחקו.`,
      { title: 'מחיקת מרצה', confirmLabel: 'מחק', tone: 'danger' },
    );
    if (!ok) return;
    try {
      await deleteLecturer(selected.id);
      showToast('הפרופיל נמחק', { tone: 'success' });
      setSelectedId('');
      read();
    } catch (error) {
      showToast(error?.message || 'המחיקה נכשלה', { tone: 'error' });
    }
  };

  const handleMerge = async () => {
    if (!selected || !mergeTargetId) return;
    const target = lecturers.find((l) => l.id === mergeTargetId);
    if (!target) return;
    const ok = await showConfirm(
      `למזג את "${selected.name}" לתוך "${target.name}"? השם הנוכחי יישמר כאיות חלופי והנתונים יאוחדו.`,
      { title: 'מיזוג מרצים', confirmLabel: 'מזג', tone: 'danger' },
    );
    if (!ok) return;
    try {
      await mergeLecturers(target.id, selected.id);
      showToast('המרצים מוזגו', { tone: 'success' });
      setMergeTargetId('');
      setSelectedId(target.id);
      read();
    } catch (error) {
      showToast(error?.message || 'המיזוג נכשל', { tone: 'error' });
    }
  };

  return (
    <div
      dir="rtl"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(2,6,23,0.65)', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 980,
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
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--s-text-strong)' }}>🧑‍🏫 פרופיל מרצים</div>
            <div style={{ ...BODY_STYLE, marginTop: 2 }}>
              כאן מוצג מה שנקלט מהעבודות הבדוקות שהחזירו לך — תיאור של ההערות שחזרו, ולא הבטחה לגבי העבודה הבאה.
              {loading ? <span style={{ marginInlineStart: 6, opacity: 0.7 }}>טוען…</span> : null}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <button type="button" onClick={() => setShowWizard(true)} style={PRIMARY_BTN_STYLE}>📥 קליטת עבודה בדוקה</button>
            <button type="button" onClick={onClose} style={{ ...BTN_STYLE, borderRadius: 999, padding: '4px 10px' }}>✕</button>
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* רשימת מרצים (ימין ב-RTL) */}
          <div style={{ width: 250, flexShrink: 0, borderInlineStart: '1px solid var(--s-border)', overflowY: 'auto', padding: 10, background: 'var(--s-surface-2, #F8FAFC)' }}>
            <button
              type="button"
              onClick={() => { setSelectedId(GLOBAL_TAB_ID); setShowManual(false); }}
              style={{
                ...BTN_STYLE,
                width: '100%',
                textAlign: 'right',
                marginBottom: 8,
                background: isGlobalTab ? '#DBEAFE' : 'var(--s-surface, #fff)',
                borderColor: isGlobalTab ? '#1D4ED8' : 'var(--s-border)',
                color: isGlobalTab ? '#1D4ED8' : 'var(--s-text-strong)',
              }}
            >
              🌐 כללי (כל המרצים) · {globalRules.length}
            </button>

            {!lecturers.length && !loading ? (
              <div style={EMPTY_STYLE}>עדיין לא נקלטו מרצים. הוסף משוב ידני כדי להתחיל.</div>
            ) : null}

            {lecturers.map((lecturer) => {
              const active = lecturer.id === selectedId;
              const avg = averageGrade(lecturer.returns);
              return (
                <button
                  key={lecturer.id}
                  type="button"
                  onClick={() => { setSelectedId(lecturer.id); setShowManual(false); setMergeTargetId(''); }}
                  style={{
                    ...BTN_STYLE,
                    display: 'block',
                    width: '100%',
                    textAlign: 'right',
                    marginBottom: 6,
                    padding: '8px 10px',
                    background: active ? '#DBEAFE' : 'var(--s-surface, #fff)',
                    borderColor: active ? '#1D4ED8' : 'var(--s-border)',
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: active ? '#1D4ED8' : 'var(--s-text-strong)' }}>{lecturer.name}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--s-muted)', fontWeight: 600, marginTop: 2 }}>
                    {lecturer.returns.length} עבודות · {lecturer.rules.length} לקחים
                    {avg !== null ? ` · ממוצע ${avg}` : ''}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                    {lecturer.courses.slice(0, 3).map((c) => <Chip key={c} tone="slate">{c}</Chip>)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--s-muted)', marginTop: 3 }}>עודכן {formatDate(lecturer.updatedAt) || '—'}</div>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setShowManual(true)}
              style={{ ...PRIMARY_BTN_STYLE, width: '100%', marginTop: 8 }}
            >
              ➕ מרצה חדש / משוב ידני
            </button>
          </div>

          {/* אזור ראשי */}
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 12 }}>
            {showManual ? (
              <ManualFeedbackForm
                lecturers={lecturers}
                defaultLecturerName={selected?.name || ''}
                onCancel={() => setShowManual(false)}
                onDone={(name) => {
                  setShowManual(false);
                  read();
                  const match = listLecturerProfiles().find((l) => l.name === name);
                  if (match) setSelectedId(match.id);
                }}
              />
            ) : null}

            {isGlobalTab ? (
              <div style={CARD_STYLE}>
                <div style={TITLE_STYLE}>🌐 לקחים כלליים</div>
                <div style={{ ...BODY_STYLE, marginBottom: 8 }}>
                  לקחים שחזרו אצל יותר ממרצה אחד וקודמו לרמת "כל המרצים".
                </div>
                {globalRules.length ? globalRules.map((rule) => (
                  <RuleRow key={rule.id} rule={rule} events={[]} lecturerId="" onChanged={read} />
                )) : <div style={EMPTY_STYLE}>אין עדיין לקחים כלליים.</div>}
              </div>
            ) : null}

            {selected ? (
              <>
                <div style={CARD_STYLE}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--s-text-strong)' }}>{selected.name}</div>
                      <div style={BODY_STYLE}>
                        {selected.returns.length} עבודות נקלטו · {selected.events.length} פריטי משוב · {selected.rules.length} לקחים
                        {averageGrade(selected.returns) !== null ? ` · ציון ממוצע ${averageGrade(selected.returns)}` : ''}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                        {selected.courses.map((c) => <Chip key={c}>{c}</Chip>)}
                        {selected.aliases.map((a) => <Chip key={a} tone="slate">איות חלופי: {a}</Chip>)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      <button type="button" onClick={() => setShowManual(true)} style={PRIMARY_BTN_STYLE}>➕ משוב ידני</button>
                      {lecturers.length > 1 ? (
                        <>
                          <select
                            value={mergeTargetId}
                            onChange={(e) => setMergeTargetId(e.target.value)}
                            style={{ ...INPUT_STYLE, width: 'auto', minWidth: 140 }}
                          >
                            <option value="">🔀 מיזוג עם מרצה אחר…</option>
                            {lecturers.filter((l) => l.id !== selected.id).map((l) => (
                              <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                          </select>
                          <button type="button" disabled={!mergeTargetId} onClick={handleMerge} style={BTN_STYLE}>מזג</button>
                        </>
                      ) : null}
                      <button type="button" onClick={handleDeleteLecturer} style={DANGER_BTN_STYLE}>🗑️ מחיקת מרצה</button>
                    </div>
                  </div>
                </div>

                <div style={CARD_STYLE}>
                  <div style={TITLE_STYLE}>📌 לקחים שנלמדו</div>
                  {rules.length ? rules.map((rule) => (
                    <RuleRow key={rule.id} rule={rule} events={events} lecturerId={selected.id} onChanged={read} />
                  )) : <div style={EMPTY_STYLE}>עדיין לא זוקקו לקחים מהמשובים של המרצה הזה.</div>}
                </div>

                <div style={CARD_STYLE}>
                  <div style={TITLE_STYLE}>📄 עבודות שנקלטו</div>
                  {returns.length ? returns.map((ret) => (
                    <div key={ret.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--s-border)', padding: '6px 0' }}>
                      <span style={{ fontSize: 11, color: 'var(--s-muted)', minWidth: 92 }}>{formatDate(ret.date) || '—'}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--s-text-strong)', flex: 1, minWidth: 120 }}>
                        {ret.assignmentTitle || 'מטלה ללא שם'}
                      </span>
                      {ret.courseName ? <Chip tone="slate">{ret.courseName}</Chip> : null}
                      {ret.grade !== null && ret.grade !== '' ? <Chip>ציון {ret.grade}</Chip> : null}
                      <Chip tone="slate">{SOURCE_LABELS[ret.source] || ret.source}</Chip>
                      <span style={{ fontSize: 11, color: 'var(--s-muted)' }}>{ret.eventCount} פריטי משוב</span>
                    </div>
                  )) : <div style={EMPTY_STYLE}>לא נקלטו עדיין עבודות עבור המרצה הזה.</div>}
                </div>
              </>
            ) : null}

            {!selected && !isGlobalTab && !showManual ? (
              <div style={EMPTY_STYLE}>בחר מרצה מהרשימה, או הוסף משוב ידני.</div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ⚠️ עטיפה עם stopPropagation: ה-overlay של הפאנל סוגר בלחיצה, ולחיצה בתוך
          האשף הייתה מבעבעת אליו וסוגרת גם את הפאנל שמתחתיו. */}
      {showWizard ? (
        <div onClick={(e) => e.stopPropagation()}>
          <GradedReturnWizard onClose={() => { setShowWizard(false); read(); }} />
        </div>
      ) : null}
    </div>
  );
}
