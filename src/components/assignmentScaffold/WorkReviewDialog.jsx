// WorkReviewDialog.jsx — הרגע שלפני הצגת העבודה.
//
// למה זה קיים כמסך ולא כ-toast: זו נקודת ההחלטה היחידה שבה המשתמש רואה את
// העבודה כמכלול — מה נכתב, מה חסר מקור, ואיפה ההיקף לא הגיע למכסה — *לפני*
// שהיא נכנסת לעורך. הליטוש (סגנון/האנשה) הוא בחירה שלו כאן, לא ברירת מחדל
// שרצה מאחורי הגב ושורפת קריאות.
//
// כל מה שמוצג כאן חושב באפס קריאות API (reviewDraft). רק לחיצת "אשר" עם מעבר
// נבחר עולה משהו, והמחיר כתוב על הכפתור.

import React from 'react';
import { SEVERITY, FINISHING_PASSES, estimatePassCalls } from '../../services/assignmentReviewService';

const SEVERITY_STYLE = {
  [SEVERITY.BLOCK]: { chip: 'bg-rose-500/20 text-rose-200 border-rose-400/30', icon: '⛔' },
  [SEVERITY.WARN]: { chip: 'bg-amber-500/20 text-amber-100 border-amber-400/30', icon: '⚠' },
  [SEVERITY.INFO]: { chip: 'bg-sky-500/20 text-sky-100 border-sky-400/30', icon: 'ℹ' },
};

const PASS_OPTIONS = [
  {
    id: FINISHING_PASSES.NONE,
    label: 'בלי ליטוש',
    hint: 'העבודה נכנסת לעורך כמו שנכתבה. אפשר תמיד להריץ ליטוש אחר כך.',
  },
  {
    id: FINISHING_PASSES.STYLE,
    label: '🖋️ מעבר סגנון אישי',
    hint: 'משכתב את הפסקאות שהכי רחוקות מהקול שלך. לא נוגע במבנה ובהפניות, ושומר רק אם הציון השתפר.',
  },
  {
    id: FINISHING_PASSES.HUMANIZE,
    label: '🧬 מעבר אנטי-גלאי',
    hint: 'משכתב עד שהציון בגלאי ה-AI המקומי יורד מתחת ליעד. מחזיר את הגרסה הטובה ביותר שנמצאה.',
  },
  {
    id: FINISHING_PASSES.BOTH,
    label: '🖋️ + 🧬 שניהם',
    hint: 'סגנון ואז האנשה. שים לב: השניים ממטבים מטרות מנוגדות, וההאנשה עשויה לכרסם חלק מהתאמת הסגנון.',
  },
];

export default function WorkReviewDialog({
  spec,
  review,
  draft,
  busy = '',
  onApprove,
  onCancel,
  onFixSources,
}) {
  const [mode, setMode] = React.useState(FINISHING_PASSES.NONE);
  const { findings = [], stats = {}, ready = true } = review || {};

  const blocking = findings.filter((f) => f.severity === SEVERITY.BLOCK);
  const cost = estimatePassCalls(mode);

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
    >
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900 text-white shadow-2xl">
        <div className="shrink-0 border-b border-white/10 px-6 py-4">
          <div className="text-lg font-bold">סבב תיקונים לפני האישור</div>
          <div className="mt-0.5 text-xs text-white/50">{spec?.title || 'מטלה'}</div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'מילים', value: stats.totalQuota ? `${stats.totalWords} / ${stats.totalQuota}` : stats.totalWords },
              { label: 'סעיפים', value: stats.sectionsWritten },
              { label: 'חסומים', value: stats.sectionsBlocked },
              { label: 'מקורות', value: stats.requiredSources ? `${stats.sources} / ${stats.requiredSources}` : stats.sources },
            ].map((box) => (
              <div key={box.label} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="text-[10px] text-white/50">{box.label}</div>
                <div className="text-lg font-bold tabular-nums">{box.value}</div>
              </div>
            ))}
          </div>

          {findings.length === 0 ? (
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">
              לא נמצאו ליקויים. ההיקף, ההפניות ומספר המקורות תואמים למה שהמטלה דורשת.
            </div>
          ) : (
            <ul className="space-y-2">
              {findings.map((f) => {
                const s = SEVERITY_STYLE[f.severity] || SEVERITY_STYLE[SEVERITY.INFO];
                return (
                  <li key={f.id} className={`rounded-xl border p-3 ${s.chip}`}>
                    <div className="flex items-start gap-2">
                      <span className="shrink-0">{s.icon}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-bold">{f.title}</div>
                        <div className="mt-0.5 text-xs leading-relaxed opacity-90">{f.detail}</div>
                        {f.actionable === 'more-sources' && onFixSources && (
                          <button
                            type="button"
                            onClick={() => onFixSources(f.sectionId)}
                            className="mt-1.5 rounded-lg bg-white/15 px-2.5 py-1 text-[11px] font-bold transition hover:bg-white/25"
                          >
                            🔎 חפש מקורות לסעיף הזה
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-5 border-t border-white/10 pt-4">
            <div className="text-sm font-bold">ליטוש לפני שאתה רואה את העבודה</div>
            <div className="mt-0.5 text-[11px] text-white/50">
              לא רץ אוטומטית. בחר מה להריץ — או כלום.
            </div>
            <div className="mt-2.5 space-y-1.5">
              {PASS_OPTIONS.map((opt) => (
                <label
                  key={opt.id}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 transition ${
                    mode === opt.id ? 'border-cyan-400/50 bg-cyan-400/10' : 'border-white/10 hover:bg-white/5'
                  }`}
                >
                  <input
                    type="radio"
                    name="finishing-pass"
                    checked={mode === opt.id}
                    onChange={() => setMode(opt.id)}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold">{opt.label}</div>
                    <div className="mt-0.5 text-[11px] leading-relaxed text-white/60">{opt.hint}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-white/10 px-6 py-3">
          {blocking.length > 0 && (
            <div className="mb-2 text-[11px] text-rose-200">
              יש {blocking.length} חסמים. אפשר לאשר בכל זאת — הם יסומנו במסמך.
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] text-white/50">
              עלות הליטוש: <b className="tabular-nums">{cost}</b> קריאות API
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={Boolean(busy)}
                className="rounded-xl border border-white/20 px-4 py-2 text-sm font-bold transition hover:bg-white/10 disabled:opacity-40"
              >
                בטל
              </button>
              <button
                type="button"
                onClick={() => onApprove?.(mode)}
                disabled={Boolean(busy)}
                className={`rounded-xl px-5 py-2 text-sm font-bold shadow-lg transition disabled:opacity-40 ${
                  ready
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600'
                    : 'bg-gradient-to-r from-amber-500 to-orange-600'
                }`}
              >
                {busy || (mode === FINISHING_PASSES.NONE ? 'פתח בעורך ←' : 'לטש ופתח בעורך ←')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
