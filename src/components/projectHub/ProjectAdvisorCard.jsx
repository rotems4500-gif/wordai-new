import React, { useState } from 'react';
import { suggestNextStep, reviewMilestoneAgainstGuidelines } from '../../services/projectRoadmapService';
import { showToast } from '../../services/uiFeedback';

// ProjectAdvisorCard — "היועץ": שתי פעולות ביקוש-בלבד (לא רצות אוטומטית ב-mount):
// 1) מה הצעד הבא? — מבוסס על מצב המתווה כולו.
// 2) בדיקת התקדמות מול ההוראות לשלב נבחר — טקסט המסמך עצמו לא זמין כאן, ולכן
//    מועבר '' ל-reviewMilestoneAgainstGuidelines (ראה prompt החוזה בקובץ השירות).
export default function ProjectAdvisorCard({ project }) {
  const [nextStepText, setNextStepText] = useState('');
  const [nextStepLoading, setNextStepLoading] = useState(false);

  const [selectedMilestoneId, setSelectedMilestoneId] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);

  const milestones = project?.milestones || [];

  const runNextStep = async () => {
    if (nextStepLoading) return;
    setNextStepLoading(true);
    try {
      const text = await suggestNextStep(project.id);
      setNextStepText(String(text || ''));
    } catch (err) {
      showToast(err?.message || 'לא הצלחתי להציע צעד הבא', { tone: 'error' });
    } finally {
      setNextStepLoading(false);
    }
  };

  const runReview = async () => {
    const milestoneId = selectedMilestoneId || milestones[0]?.id;
    if (!milestoneId || reviewLoading) return;
    setReviewLoading(true);
    try {
      const text = await reviewMilestoneAgainstGuidelines(project.id, milestoneId, '');
      setReviewText(String(text || ''));
    } catch (err) {
      showToast(err?.message || 'בדיקת ההתקדמות נכשלה', { tone: 'error' });
    } finally {
      setReviewLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
      <div className="mb-3 text-[13.5px] font-extrabold text-[#f1f6fb]">🧠 היועץ</div>

      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12px] font-semibold text-[#cfe0ef]">מה הצעד הבא?</span>
          <button
            type="button"
            onClick={runNextStep}
            disabled={nextStepLoading}
            title="רענן"
            className="text-[11px] text-cyan-300 hover:text-cyan-200 disabled:opacity-50"
          >
            {nextStepLoading ? '…' : '🔄'}
          </button>
        </div>
        {!nextStepText && !nextStepLoading && (
          <button
            type="button"
            onClick={runNextStep}
            className="w-full rounded-lg border border-cyan-300/25 bg-cyan-500/10 px-3 py-2 text-[11.5px] font-semibold text-cyan-100 transition hover:bg-cyan-500/20"
          >
            הצע צעד הבא
          </button>
        )}
        {nextStepLoading && (
          <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-[11.5px] text-[#a9bfd6]">
            <i className="ph ph-spinner animate-spin" aria-hidden="true" />
            חושב…
          </div>
        )}
        {nextStepText && !nextStepLoading && (
          <div className="whitespace-pre-wrap rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px] leading-6 text-[#d7e4f0]">
            {nextStepText}
          </div>
        )}
      </div>

      <div className="border-t border-white/10 pt-3">
        <div className="mb-2 text-[12px] font-semibold text-[#cfe0ef]">בדוק התקדמות מול ההוראות</div>
        {milestones.length ? (
          <>
            <select
              value={selectedMilestoneId || milestones[0]?.id || ''}
              onChange={(e) => setSelectedMilestoneId(e.target.value)}
              className="mb-2 w-full rounded-lg border border-white/15 bg-slate-900 px-2 py-1.5 text-[11.5px] text-white/85 outline-none"
            >
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>{m.title}</option>
              ))}
            </select>
            <div className="mb-2 text-[10.5px] text-[#6f87a1]">
              הבדיקה מתבססת על ההנחיות הכלליות של הפרויקט (טקסט המסמך עצמו לא נבדק כאן).
            </div>
            <button
              type="button"
              onClick={runReview}
              disabled={reviewLoading}
              className="w-full rounded-lg border border-fuchsia-300/25 bg-fuchsia-500/10 px-3 py-2 text-[11.5px] font-semibold text-fuchsia-100 transition hover:bg-fuchsia-500/20 disabled:opacity-50"
            >
              {reviewLoading ? 'בודק…' : 'בדוק התקדמות'}
            </button>
            {reviewLoading && (
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-[11.5px] text-[#a9bfd6]">
                <i className="ph ph-spinner animate-spin" aria-hidden="true" />
                בודק מול ההנחיות…
              </div>
            )}
            {reviewText && !reviewLoading && (
              <div className="mt-2 whitespace-pre-wrap rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px] leading-6 text-[#d7e4f0]">
                {reviewText}
              </div>
            )}
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-3 py-2 text-[11px] text-[#6f87a1]">
            אין עדיין שלבים לבדוק.
          </div>
        )}
      </div>
    </div>
  );
}
