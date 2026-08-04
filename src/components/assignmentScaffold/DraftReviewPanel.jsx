// DraftReviewPanel — משוב מפורש על הניסוח של הטיוטה המקומית.
//
// כל משפט שהמנוע המקומי הרכיב נושא frameId (המסגרת הרטורית שממנה נגזר, ר'
// proseComposeService/emit). הפאנל מציג את המשפטים לפי המהלך הרטורי ומאפשר
// לדווח accept/reject על המסגרת — recordFrameFeedback משנה את משקלי המסגרות
// בפרופיל האישי, ולכן ההרכבה הבאה מעדיפה מסגרות שאושרו.
//
// ⚠️ משוב **מפורש בלבד**. אין דחייה משתמעת בהגרלה מחדש: משתמש שלוחץ "נסח מחדש"
// לא בהכרח פסל את מה שהיה, ורישום אוטומטי היה מרעיל את הפרופיל.
//
// עיצוב: כהה, RTL — הפאנל יושב בתוך AssignmentScaffoldStudio.

import React from 'react';
import { recordFrameFeedback } from '../../services/styleFrameProfileService';

const MOVE_LABELS = {
  claim: 'טענה',
  evidence: 'ראיה',
  quote: 'ציטוט',
  explain: 'הסבר',
  contrast: 'ניגוד',
  concede: 'הסתייגות',
  transition: 'מעבר',
  wrap: 'סיכום',
};

const FRAME_FEEDBACK_EVENT = 'wordai-frame-feedback-updated';

export default function DraftReviewPanel({ sentences, title }) {
  const [open, setOpen] = React.useState(false);
  // מפתח = אינדקס המשפט; ערך = הפסק שנרשם, לאישור ויזואלי קצר.
  const [acked, setAcked] = React.useState({});

  const items = React.useMemo(() => (
    (Array.isArray(sentences) ? sentences : []).filter((s) => s && s.text)
  ), [sentences]);

  const withFrame = items.filter((s) => s.frameId).length;
  if (!items.length) return null;

  const send = async (idx, sentence, verdict) => {
    setAcked((prev) => ({ ...prev, [idx]: verdict }));
    try {
      await recordFrameFeedback(sentence.move, sentence.frameId, verdict);
    } catch {
      // כשל בשמירה לא אמור להפיל את המסך; המשוב פשוט לא נרשם.
    }
    window.dispatchEvent(new CustomEvent(FRAME_FEEDBACK_EVENT));
  };

  return (
    <section className="rounded-2xl border border-white/15 bg-white/[0.05] p-4 backdrop-blur-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-right"
      >
        <h2 className="text-sm font-bold">💬 משוב על הניסוח</h2>
        <span className="text-[11px] text-white/50">
          {withFrame} משפטים · {open ? 'סגור' : 'פתח'}
        </span>
      </button>
      {open && (
        <>
          <p className="mt-2 text-[11px] leading-relaxed text-white/50">
            {title ? `${title} · ` : ''}
            המשוב משפיע על הניסוחים הבאים — מסגרת שסומנה "עוד כמו זה" תוצע שוב, ומסגרת
            שנדחתה תרד. הדיווח מפורש בלבד: לחיצה על "נסח מחדש" אינה נחשבת דחייה.
          </p>
          <ul className="mt-3 space-y-2">
            {items.map((s, idx) => {
              const ack = acked[idx];
              return (
                <li
                  key={`${idx}-${s.text.slice(0, 24)}`}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-white/60">
                      {MOVE_LABELS[s.move] || s.move || '—'}
                    </span>
                    {s.frameId ? (
                      <span className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => send(idx, s, 'accept')}
                          className={`rounded-full border px-2 py-0.5 text-[10px] transition ${ack === 'accept'
                            ? 'border-emerald-400/60 bg-emerald-400/20 text-emerald-100'
                            : 'border-white/15 bg-white/[0.04] text-white/70 hover:bg-white/10'}`}
                        >
                          {ack === 'accept' ? '✓ ' : ''}עוד כמו זה
                        </button>
                        <button
                          type="button"
                          onClick={() => send(idx, s, 'reject')}
                          className={`rounded-full border px-2 py-0.5 text-[10px] transition ${ack === 'reject'
                            ? 'border-rose-400/60 bg-rose-400/20 text-rose-100'
                            : 'border-white/15 bg-white/[0.04] text-white/70 hover:bg-white/10'}`}
                        >
                          {ack === 'reject' ? '✓ ' : ''}לא זה
                        </button>
                      </span>
                    ) : (
                      <span className="text-[10px] text-white/35">בלי מסגרת — אין על מה לדווח</span>
                    )}
                  </div>
                  <div className="text-[11px] leading-relaxed text-white/80">{s.text}</div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
