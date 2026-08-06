// ═══════════════════════════════════════════════════════════════
// DraftDetectorPanel.jsx — רצועת "בדיקת גלאי AI" לסטודיו הטיוטות
// (מסמך Word ומצגת כאחד). הבדיקה עצמה מקומית וסינכרונית (בלי קריאת API);
// רק כפתור "שכתב שוב את המסומנות" עולה כסף.
//
// ⚠️ פסקאות קצרות מדי לניקוד מוצגות בנפרד ולא נבלעות ב"נקיות" —
// רוב התבליטים במצגת נופלים לשם, ו"0 מכונתיות" היה שם מספר שקרי.
// ═══════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { scoreDraftParas, selectRepairTargets, MAX_REPAIR_PASSES } from '../services/draftDetectorPass';

// תג ציון פר-פסקה לרשימת הפסקאות בסטודיו. מוצג רק אחרי שהבדיקה רצה
// (lastAiScore != null); אדום = מעל הסף (נשמע מכונתי), ירוק = מתחת.
export const AiScoreChip = ({ para }) => {
  if (!para || !Number.isFinite(para.lastAiScore)) return null;
  const flagged = Number.isFinite(para.lastAiThreshold) && para.lastAiScore >= para.lastAiThreshold;
  return (
    <span
      title={`ציון גלאי AI ${para.lastAiScore} (סף ${para.lastAiThreshold ?? '?'})`}
      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${flagged
        ? 'bg-rose-500/20 text-rose-300'
        : 'bg-emerald-500/15 text-emerald-300'}`}
    >
      AI {para.lastAiScore}
    </span>
  );
};

export default function DraftDetectorPanel({
  paras = [],
  onRepair = null,
  disabled = false,
}) {
  const [stats, setStats] = useState(null);      // { scored, flagged, skippedTooShort, avgScore }
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total } | null
  const [note, setNote] = useState('');

  const runCheck = () => {
    const result = scoreDraftParas(paras);
    setStats(result);
    setNote('');
    return result;
  };

  // אין יעדים אף שיש מסומנות ⇒ כולן מיצו את מכסת הסבבים.
  const targetsLeft = stats ? selectRepairTargets(paras).length : 0;
  const exhausted = Boolean(stats && stats.flagged > 0 && targetsLeft === 0);

  const runRepair = async () => {
    if (!onRepair || busy) return;
    setBusy(true);
    setProgress({ done: 0, total: targetsLeft });
    setNote('');
    try {
      const res = await onRepair({ onProgress: (done, total) => setProgress({ done, total }) });
      const after = runCheck();
      const repaired = Number(res?.repaired || 0);
      setNote(repaired
        ? `שוכתבו ${repaired} פסקאות · נותרו ${after.flagged} מסומנות`
        : 'אף פסקה לא עברה את שער הקבלה בסבב הזה');
    } catch (e) {
      setNote(e?.message || 'סבב השכתוב נכשל');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-900/25 px-4 py-2" dir="rtl">
      <button
        onClick={runCheck}
        disabled={disabled || busy || !paras.length}
        className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-500/20 disabled:opacity-40"
      >🔍 בדוק עם גלאי AI</button>

      {stats && (
        <span className="text-[11px] text-slate-300">
          נבדקו <b className="text-slate-100">{stats.scored}</b> פסקאות ·{' '}
          <b className={stats.flagged ? 'text-rose-300' : 'text-emerald-300'}>{stats.flagged}</b> עדיין נשמעות מכונתיות ·{' '}
          <b className="text-amber-300">{stats.skippedTooShort}</b> קצרות מכדי לבדוק
          {Number.isFinite(stats.avgScore) && stats.avgScore !== null && (
            <span className="text-slate-500"> (ציון ממוצע {stats.avgScore})</span>
          )}
        </span>
      )}

      <div className="flex-1" />

      {stats && stats.flagged > 0 && onRepair && !exhausted && (
        <button
          onClick={runRepair}
          disabled={disabled || busy}
          className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-600 px-3 py-1.5 text-xs font-bold text-white hover:from-violet-400 disabled:opacity-50"
        >
          {busy
            ? `משכתב... ${progress ? `${progress.done}/${progress.total}` : ''}`
            : `✨ שכתב שוב את המסומנות (${targetsLeft})`}
        </button>
      )}

      {exhausted && (
        <span className="text-[11px] font-semibold text-amber-300">
          הגעת למקסימום סבבים על הפסקאות שנותרו ({MAX_REPAIR_PASSES})
        </span>
      )}

      {note && <span className="text-[11px] text-slate-400">{note}</span>}
    </div>
  );
}
