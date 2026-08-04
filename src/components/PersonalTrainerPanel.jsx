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
import { STYLE_SAMPLES_UPDATED_EVENT } from '../services/styleSampleStore';
import {
  ensureStyleSelectProfile, describeStyleSelect, isStyleSelectEnabled, setStyleSelectEnabled,
} from '../services/styleSelectService';

// מנוהל ע"י פאנל המשוב על מסגרות המשפט.
const FRAME_FEEDBACK_UPDATED_EVENT = 'wordai-frame-feedback-updated';

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

export default function PersonalTrainerPanel() {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState({ opener: null, frame: null, targetsStatus: null, targets: null });
  const [selectOn, setSelectOn] = useState(() => { try { return isStyleSelectEnabled(); } catch { return false; } });
  const [selectStatus, setSelectStatus] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        Promise.resolve(ensureOpenerProfile()).catch(() => null),
        Promise.resolve(ensureFrameProfile()).catch(() => null),
        Promise.resolve(ensureStyleTargetsReady()).catch(() => null),
      ]);
    } catch {}
    let opener = null; let frame = null; let targetsStatus = null; let targets = null;
    try { opener = getOpenerProfileStatus(); } catch {}
    try { frame = getFrameProfileStatus(); } catch {}
    try { targetsStatus = getStyleTargetsStatus(); } catch {}
    try { targets = getStyleTargets(); } catch {}
    setState({ opener, frame, targetsStatus, targets });
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
    }
    return () => {
      alive = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener(STYLE_SAMPLES_UPDATED_EVENT, run);
        window.removeEventListener(STYLE_TARGETS_UPDATED_EVENT, run);
        window.removeEventListener(FRAME_FEEDBACK_UPDATED_EVENT, run);
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

  const { opener, frame, targetsStatus, targets } = state;

  const openerEmpty = !opener?.ready || !(opener.personalWords > 0);
  const frameEmpty = !frame?.ready || !(frame.minedFrames > 0);
  const targetsEmpty = !targets;

  return (
    <div dir="rtl" style={{ display: 'block' }}>
      <div style={{ ...BODY_STYLE, marginBottom: 10 }}>
        כאן מוצג מה שהמנוע המקומי מדד מהעבודות שהעלית — תיאור בלבד של ההרגלים שזוהו.
        {loading ? <span style={{ marginInlineStart: 6, opacity: 0.7 }}>טוען…</span> : null}
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
