// PersonalTrainerPanel.jsx — "מה המנוע למד ממך": חלון שקיפות על ההרגלים שנלמדו
// משלוש שכבות הפרסונליזציה של המנוע המקומי:
//   1. openerProfileService  — פתיחי משפט לפי intent
//   2. styleFrameProfileService — מסגרות משפט (מהלכים רטוריים)
//   3. styleTargetsStore/Service — יעדים מבניים (אורך משפט, פסיקים, פסקה)
//
// ⚠️ הפאנל **מתאר בלבד**. אסור לו להבטיח שיפור ציון/איכות/עקיפת גלאים — הוא
// מדווח מה נמדד מהעבודות של המשתמש, לא מה זה יעשה לתוצאה.
// ניהול הקורפוס (העלאה/מחיקה) חי ב-StyleProfilePanel — לא משוכפל כאן.

import React, { useCallback, useEffect, useState } from 'react';
import { ensureOpenerProfile, getOpenerProfileStatus } from '../services/openerProfileService';
import { ensureFrameProfile, getFrameProfileStatus } from '../services/styleFrameProfileService';
import { ensureStyleTargetsReady, getStyleTargets, getStyleTargetsStatus, STYLE_TARGETS_UPDATED_EVENT } from '../services/styleTargetsStore';
import { describeStyleTargets, STYLE_TARGET_LABELS, STYLE_TARGET_KEYS, MIN_TARGET_DOCS } from '../services/styleTargetsService';
import { STYLE_SAMPLES_UPDATED_EVENT, ensureSampleStoreReady, getSampleStoreStats, getSampleDocuments } from '../services/styleSampleStore';
import { getDeltaAggregate } from '../services/styleDeltaService';
import { getPersonalStyleProfile } from '../services/aiService';
import {
  ensureStyleSelectProfile, describeStyleSelect, isStyleSelectEnabled, setStyleSelectEnabled,
} from '../services/styleSelectService';
import {
  ensureLecturerProfilesReady, getLecturerProfilesStatus, LECTURER_PROFILES_UPDATED_EVENT,
} from '../services/lecturerProfileStore';

// מנוהל ע"י פאנל המשוב על מסגרות המשפט.
const FRAME_FEEDBACK_UPDATED_EVENT = 'wordai-frame-feedback-updated';
// נורה ע"י savePersonalStyleProfile / styleDeltaService (dispatchProfileUpdated) — מוני
// ההצעות והעריכות משתנים בלעדיו בלי שהפאנל יידע.
const PERSONAL_STYLE_UPDATED_EVENT = 'wordai-personal-style-updated';

// תוויות המקורות שמסמך יכול להיכנס מהם לקורפוס (styleSampleStore.source).
const SAMPLE_SOURCE_LABELS = {
  upload: 'העלאה',
  paste: 'הדבקה',
  'ai-context': 'טקסט שנשלח ל-AI',
  'graded-submission': 'עבודות בדוקות',
  'finished-doc': 'מסמכים שהושלמו באפליקציה',
};
const SAMPLE_SOURCE_ORDER = ['upload', 'paste', 'ai-context', 'graded-submission', 'finished-doc'];

const INTENT_LABELS = {
  intro: 'פתיחה',
  review: 'סקירת ספרות',
  analysis: 'ניתוח',
  comparison: 'השוואה',
  argument: 'טיעון',
  method: 'שיטה',
  findings: 'ממצאים',
  conclusion: 'מסקנה',
  exposition: 'הסבר מושג',
};

const EMPTY_HINT = 'עדיין לא נלמדו הרגלים — העלה עבודות קודמות במנוע הסגנון.';

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

function Chip({ children }) {
  return (
    <span style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 700, background: '#EEF2FF', color: '#4338CA', padding: '3px 8px', borderRadius: 999, marginInlineEnd: 6, marginTop: 4 }}>
      {children}
    </span>
  );
}

function Section({ title, empty, children }) {
  return (
    <div style={CARD_STYLE}>
      <div style={TITLE_STYLE}>{title}</div>
      {empty ? <div style={EMPTY_STYLE}>{EMPTY_HINT}</div> : <div style={BODY_STYLE}>{children}</div>}
    </div>
  );
}

function fmt(n, digits = 1) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(digits) : '—';
}

export default function PersonalTrainerPanel({ onOpenLecturerProfiles = null }) {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState({
    opener: null, frame: null, targetsStatus: null, targets: null, lecturers: null, corpus: null,
    sourceCounts: null, suggestionStats: null, deltaAgg: null, revisionNotesCount: 0,
  });
  const [selectOn, setSelectOn] = useState(() => { try { return isStyleSelectEnabled(); } catch { return false; } });
  const [selectStatus, setSelectStatus] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        Promise.resolve(ensureOpenerProfile()).catch(() => null),
        Promise.resolve(ensureFrameProfile()).catch(() => null),
        Promise.resolve(ensureStyleTargetsReady()).catch(() => null),
        Promise.resolve(ensureLecturerProfilesReady()).catch(() => null),
        Promise.resolve(ensureSampleStoreReady()).catch(() => null),
      ]);
    } catch {}
    let opener = null; let frame = null; let targetsStatus = null; let targets = null; let lecturers = null; let corpus = null;
    let sourceCounts = null; let suggestionStats = null; let deltaAgg = null; let revisionNotesCount = 0;
    try { corpus = getSampleStoreStats(); } catch {}
    try { opener = getOpenerProfileStatus(); } catch {}
    try { frame = getFrameProfileStatus(); } catch {}
    try { targetsStatus = getStyleTargetsStatus(); } catch {}
    try { targets = getStyleTargets(); } catch {}
    try { lecturers = getLecturerProfilesStatus(); } catch {}
    // פילוח הקורפוס לפי המקור שממנו המסמך נכנס (העלאה / הדבקה / נשלח ל-AI / עבודה בדוקה / הושלם באפליקציה).
    try {
      const counts = {};
      for (const doc of (getSampleDocuments() || [])) {
        const key = String(doc?.source || 'upload');
        counts[key] = (counts[key] || 0) + 1;
      }
      sourceCounts = counts;
    } catch {}
    // מוני ההצעות + הערות הרוויזיה יושבים על פרופיל הסגנון האישי, לא על שירות ייעודי.
    try {
      const engine = getPersonalStyleProfile()?.styleEngine;
      const ec = engine?.editCounters || {};
      suggestionStats = {
        accepted: Number(ec.aiSuggestionAccepted) || 0,
        rejected: Number(ec.aiSuggestionRejected) || 0,
        dismissed: Number(ec.aiSuggestionDismissed) || 0,
      };
      revisionNotesCount = Array.isArray(engine?.revisionFeedbackNotes) ? engine.revisionFeedbackNotes.length : 0;
    } catch {}
    try { deltaAgg = getDeltaAggregate(); } catch {}
    setState({
      opener, frame, targetsStatus, targets, lecturers, corpus,
      sourceCounts, suggestionStats, deltaAgg, revisionNotesCount,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    const run = () => { if (alive) load(); };
    run();
    if (typeof window !== 'undefined') {
      window.addEventListener(STYLE_SAMPLES_UPDATED_EVENT, run);
      window.addEventListener(STYLE_TARGETS_UPDATED_EVENT, run);
      window.addEventListener(FRAME_FEEDBACK_UPDATED_EVENT, run);
      window.addEventListener(LECTURER_PROFILES_UPDATED_EVENT, run);
      window.addEventListener(PERSONAL_STYLE_UPDATED_EVENT, run);
    }
    return () => {
      alive = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener(STYLE_SAMPLES_UPDATED_EVENT, run);
        window.removeEventListener(STYLE_TARGETS_UPDATED_EVENT, run);
        window.removeEventListener(FRAME_FEEDBACK_UPDATED_EVENT, run);
        window.removeEventListener(LECTURER_PROFILES_UPDATED_EVENT, run);
        window.removeEventListener(PERSONAL_STYLE_UPDATED_EVENT, run);
      }
    };
  }, [load]);

  // מצב הפרופיל מוצג רק כשהדגל דלוק — אין טעם לבנות פרופיל למי שלא ביקש.
  useEffect(() => {
    if (!selectOn) { setSelectStatus(null); return undefined; }
    let alive = true;
    setSelectStatus(describeStyleSelect());
    Promise.resolve(ensureStyleSelectProfile())
      .then((s) => { if (alive) setSelectStatus(s); })
      .catch(() => {});
    return () => { alive = false; };
  }, [selectOn]);

  const toggleSelect = useCallback(() => {
    setSelectOn((prev) => { setStyleSelectEnabled(!prev); return !prev; });
  }, []);

  const { opener, frame, targetsStatus, targets, lecturers, corpus, sourceCounts, suggestionStats, deltaAgg, revisionNotesCount } = state;
  const corpusDocs = Number(corpus?.docCount) || 0;
  const corpusWords = Number(corpus?.totalWords) || 0;

  const openerEmpty = !opener?.ready || !(opener.personalWords > 0);
  const frameEmpty = !frame?.ready || !(frame.minedFrames > 0);
  const targetsEmpty = !targets;

  // "למידה מהשימוש" — נתונים שנצברים מהעבודה השוטפת ולא מהעלאת קורפוס.
  const suggestionTotal = (suggestionStats?.accepted || 0) + (suggestionStats?.rejected || 0) + (suggestionStats?.dismissed || 0);
  const styleEdits = Number(deltaAgg?.styleEdits) || 0;
  const contentEdits = Number(deltaAgg?.contentEdits) || 0;
  const sourceRows = SAMPLE_SOURCE_ORDER
    .map((k) => [k, Number(sourceCounts?.[k]) || 0])
    .filter(([, n]) => n > 0);
  const notesCount = Number(revisionNotesCount) || 0;
  const hasUsageData = suggestionTotal > 0 || styleEdits > 0 || contentEdits > 0 || sourceRows.length > 0 || notesCount > 0;

  return (
    <div dir="rtl" style={{ display: 'block' }}>
      <div style={{ ...BODY_STYLE, marginBottom: 10 }}>
        כאן מוצג מה שהמנוע המקומי מדד מהעבודות שהעלית — תיאור בלבד של ההרגלים שזוהו.
        {loading ? <span style={{ marginInlineStart: 6, opacity: 0.7 }}>טוען…</span> : null}
      </div>

      {/* מצב הקורפוס — בלעדיו כל הסקשנים למטה אפורים בלי הסבר. */}
      <div
        style={{
          ...CARD_STYLE,
          background: corpusDocs ? 'var(--s-surface-2, #F8FAFC)' : '#FEF3C7',
          borderColor: corpusDocs ? 'var(--s-border)' : '#FCD34D',
        }}
      >
        <div style={TITLE_STYLE}>
          📚 קורפוס הכתיבה שלך: {corpusDocs.toLocaleString('he-IL')} מסמכים · {corpusWords.toLocaleString('he-IL')} מילים
        </div>
        {corpusDocs ? null : (
          <div style={BODY_STYLE}>
            עדיין לא הועלו עבודות — העלה עבודות קודמות בסקשן "סגנון אישי" כדי שהמנוע ילמד ממך.
          </div>
        )}
      </div>

      <Section title="✍️ פתיחים" empty={openerEmpty}>
        נלמדו {opener?.personalWords || 0} הרגלי פתיחה מ-{opener?.distinctDocs || 0} עבודות,
        על פני {opener?.intents?.length || 0} סוגי פסקה.
        <div style={{ marginTop: 4 }}>
          {(opener?.intents || []).map((it) => <Chip key={it}>{INTENT_LABELS[it] || it}</Chip>)}
        </div>
        <div style={{ marginTop: 6 }}>
          עוצמת התאמה אישית: {Math.round((opener?.blendLambda || 0) * 100)}%
          <span style={{ opacity: 0.75 }}> — כמה מהפתיחים נשלפים מהכתיבה שלך לעומת המאגר הכללי.</span>
        </div>
      </Section>

      <Section title="🧩 מסגרות משפט" empty={frameEmpty}>
        נכרו {frame?.minedFrames || 0} מסגרות משפט מ-{frame?.distinctDocs || 0} עבודות.
        <div style={{ marginTop: 4 }}>
          רשומות משוב שנאספו: {frame?.feedbackEntries || 0}
          <span style={{ opacity: 0.75 }}> — אישורים ודחיות שלך על ניסוחים.</span>
        </div>
      </Section>

      <Section title="📐 יעדים מבניים" empty={targetsEmpty}>
        {describeStyleTargets(targets)}
        <div style={{ marginTop: 6 }}>
          {STYLE_TARGET_KEYS.map((k) => (
            targets && Number.isFinite(Number(targets[k]))
              ? <div key={k}>• {STYLE_TARGET_LABELS[k] || k}: {fmt(targets[k], k === 'commaPerSent' || k === 'subordination' ? 2 : 1)}</div>
              : null
          ))}
        </div>
      </Section>

      {hasUsageData ? (
        <Section title="🔄 למידה מהשימוש">
          {suggestionTotal > 0 ? (
            <div>
              הצעות AI: אושרו {suggestionStats.accepted} · נדחו {suggestionStats.rejected} · נסגרו בלי שימוש {suggestionStats.dismissed}
            </div>
          ) : null}
          {(styleEdits > 0 || contentEdits > 0) ? (
            <div style={{ marginTop: 3 }}>
              עריכות שנותחו: {styleEdits} סגנון · {contentEdits} תוכן
              <span style={{ opacity: 0.75 }}> — תיקונים ידניים שלך על טקסט שנכתב במנוע.</span>
            </div>
          ) : null}
          {sourceRows.length ? (
            <div style={{ marginTop: 6 }}>
              מסמכים בקורפוס לפי מקור:
              {sourceRows.map(([k, n]) => (
                <div key={k}>• {SAMPLE_SOURCE_LABELS[k] || k}: {n}</div>
              ))}
            </div>
          ) : null}
          {notesCount > 0 ? (
            <div style={{ marginTop: 6 }}>הערות רוויזיה שנשמרו: {notesCount}</div>
          ) : null}
        </Section>
      ) : null}

      <div style={CARD_STYLE}>
        <div style={TITLE_STYLE}>🧑‍🏫 לקחים ממרצים</div>
        <div style={BODY_STYLE}>
          {lecturers?.ruleCount
            ? (
              <>
                נלמדו {lecturers.ruleCount} לקחים מ-{lecturers.lecturerCount} מרצים · {lecturers.returnCount} עבודות נקלטו.
                <div style={{ marginTop: 3, opacity: 0.75 }}>
                  תיאור של ההערות שחזרו בעבודות הבדוקות שלך — לא הבטחה לגבי העבודה הבאה.
                </div>
              </>
            )
            : <span style={EMPTY_STYLE}>עדיין לא נקלטו משובי מרצים — הוסף משוב ידני או טען עבודה בדוקה עם הערות.</span>}
        </div>
        {typeof onOpenLecturerProfiles === 'function' ? (
          <button
            type="button"
            onClick={onOpenLecturerProfiles}
            style={{ marginTop: 8, fontSize: 11.5, fontWeight: 700, padding: '5px 10px', borderRadius: 8, border: '1px solid #1D4ED8', background: '#DBEAFE', color: '#1D4ED8', cursor: 'pointer' }}
          >
            פתח פרופיל מרצים
          </button>
        ) : null}
      </div>

      <div style={CARD_STYLE}>
        <div style={TITLE_STYLE}>🧪 ניסיוני</div>
        <label style={{ ...BODY_STYLE, display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={selectOn}
            onChange={toggleSelect}
            style={{ marginTop: 3, flexShrink: 0 }}
          />
          <span>
            <span style={{ fontWeight: 700, color: 'var(--s-text-strong)' }}>בחירת ניסוח לפי הסגנון שלך</span>
            <div style={{ marginTop: 3 }}>
              המנוע המקומי מרכיב כמה ניסוחים חלופיים לכל סעיף ובוחר אחד מהם. כשהאפשרות דלוקה,
              הבחירה מתחשבת גם במידת הדמיון לכתיבה שלך — ולא רק במדד ה"נשמע כמו AI" הכללי.
              <div style={{ marginTop: 3 }}>
                חל על טיוטות מקומיות ב<b>סטודיו שלד המטלה</b> בלבד. לא נכתב תוכן חדש בגלל האפשרות הזו,
                והקישור של כל משפט לראיה שלו אינו משתנה.
              </div>
            </div>
          </span>
        </label>
        {selectOn ? (
          <div style={{ ...BODY_STYLE, marginTop: 6, opacity: 0.85 }}>
            {selectStatus?.ready
              ? `פעיל — נמדד מ-${selectStatus.docCount} עבודות שלך מול ${selectStatus.refCount} חומרי ייחוס.`
              : `לא פעיל כרגע${selectStatus?.reason ? ` — ${selectStatus.reason}` : ' — נבנה…'}. הבחירה נעשית כרגיל.`}
          </div>
        ) : null}
      </div>

      {targetsEmpty ? (
        <div style={{ ...BODY_STYLE, marginTop: -4 }}>
          נדרשות לפחות {MIN_TARGET_DOCS} עבודות כדי לגזור יעדים מבניים
          (נמדדו עד כה: {targetsStatus?.docCount || 0}).
        </div>
      ) : null}
    </div>
  );
}
