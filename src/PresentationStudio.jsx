import React, { useMemo, useState } from 'react';

const PRESENTATION_THEMES = [
  { id: 'cinematic', label: 'קולנועי', accent: 'from-amber-400 via-orange-500 to-rose-500', blurb: 'פתיחים חזקים, שקופיות גדולות ונראות עשירה.' },
  { id: 'premium', label: 'פרימיום', accent: 'from-sky-400 via-cyan-500 to-teal-500', blurb: 'מראה נקי ויוקרתי למצגות הנהלה, מכירה ופיץ׳.' },
  { id: 'academic', label: 'אקדמי', accent: 'from-indigo-400 via-blue-500 to-slate-600', blurb: 'מסרים מסודרים, היררכיה ברורה, פחות רעש ויותר טיעון.' },
  { id: 'bold', label: 'נועז', accent: 'from-fuchsia-500 via-violet-500 to-indigo-600', blurb: 'ליינים חדים, שקופיות קצרות ואימפקט גבוה.' },
];

const QUICK_BRIEFS = [
  'פיץ׳ לסטארטאפ עם מסר חד ותמונות חזקות',
  'מצגת אקדמית ברורה עם מסקנות וסיכום חזותי',
  'מצגת מכירה ללקוח עם דגש על ערך עסקי',
  'מצגת הרצאה עם מבנה סוחף ושקופיות קלות לקריאה',
];

export default function PresentationStudio({ onGenerate = () => {}, onSwitchToWord = () => {}, busy = false }) {
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('');
  const [goal, setGoal] = useState('');
  const [slideCount, setSlideCount] = useState(10);
  const [theme, setTheme] = useState('premium');
  const [imageIntensity, setImageIntensity] = useState('high');
  const [speakerNotes, setSpeakerNotes] = useState(false);
  const [includeCover, setIncludeCover] = useState(true);

  const selectedTheme = useMemo(
    () => PRESENTATION_THEMES.find((item) => item.id === theme) || PRESENTATION_THEMES[0],
    [theme],
  );

  const canGenerate = Boolean(String(topic || '').trim()) && !busy;

  const handleGenerate = () => {
    if (!canGenerate) return;
    onGenerate({
      topic: String(topic || '').trim(),
      audience: String(audience || '').trim(),
      goal: String(goal || '').trim(),
      slideCount: Math.max(4, Math.min(20, Number(slideCount) || 10)),
      theme,
      imageIntensity,
      speakerNotes,
      includeCover,
    });
  };

  return (
    <div className="flex min-h-full flex-1 overflow-auto bg-[radial-gradient(circle_at_top_right,_rgba(56,189,248,0.16),_transparent_32%),linear-gradient(180deg,_#f8fbff_0%,_#eef4ff_42%,_#f8fafc_100%)]">
      <div className="mx-auto flex w-full max-w-[1380px] flex-col gap-8 px-6 py-8 lg:px-10">
        <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
          <section className="rounded-[32px] border border-white/70 bg-white/85 p-7 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-[11px] font-bold text-white">מצגות</div>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-900">מחולל מצגות ברמה גבוהה</h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-7 text-slate-600">
              לא פאוורפוינט טכני, אלא סטודיו ליצירת מצגות עם כיוון קריאטיבי, מבנה שקופיות, מסרים חדים, מקומות לתמונות, ועיצוב שמתאים להצגה אמיתית.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-slate-700">נושא המצגת</span>
                <textarea
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="על מה המצגת? מה בדיוק צריך להעביר?"
                  className="min-h-[132px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-800 outline-none transition focus:border-cyan-300 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                />
              </label>

              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-bold text-slate-700">קהל יעד</span>
                  <input
                    value={audience}
                    onChange={(event) => setAudience(event.target.value)}
                    placeholder="משקיעים, מרצה, לקוח, הנהלה, כיתה..."
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-cyan-300 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-sm font-bold text-slate-700">מטרת המצגת</span>
                  <input
                    value={goal}
                    onChange={(event) => setGoal(event.target.value)}
                    placeholder="לשכנע, להסביר, ללמד, למכור, לסכם..."
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-cyan-300 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                  />
                </label>

                <div className="grid grid-cols-2 gap-4">
                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-bold text-slate-700">מספר שקופיות</span>
                    <input
                      type="number"
                      min="4"
                      max="20"
                      value={slideCount}
                      onChange={(event) => setSlideCount(event.target.value)}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-cyan-300 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                    />
                  </label>

                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-bold text-slate-700">דגש על תמונות</span>
                    <select
                      value={imageIntensity}
                      onChange={(event) => setImageIntensity(event.target.value)}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-cyan-300 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                    >
                      <option value="high">גבוה</option>
                      <option value="medium">בינוני</option>
                      <option value="low">נמוך</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {QUICK_BRIEFS.map((brief) => (
                <button
                  key={brief}
                  type="button"
                  onClick={() => setTopic(brief)}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-cyan-300 hover:text-cyan-700"
                >
                  {brief}
                </button>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
                <input type="checkbox" checked={includeCover} onChange={(event) => setIncludeCover(event.target.checked)} />
                שקופית פתיחה
              </label>
              <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
                <input type="checkbox" checked={speakerNotes} onChange={(event) => setSpeakerNotes(event.target.checked)} />
                הערות מרצה קצרות
              </label>
            </div>

            <div className="mt-8 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={onSwitchToWord}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                חזור ל-Word
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate}
                className={`rounded-2xl px-6 py-3 text-sm font-bold text-white shadow-lg transition ${canGenerate ? 'bg-gradient-to-r from-sky-500 to-cyan-600 hover:from-sky-600 hover:to-cyan-700' : 'cursor-not-allowed bg-slate-300'}`}
              >
                {busy ? 'בונה מצגת...' : 'צור מצגת'}
              </button>
            </div>
          </section>

          <section className="rounded-[32px] border border-slate-200/80 bg-slate-950 p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
            <div className={`rounded-[28px] bg-gradient-to-br ${selectedTheme.accent} p-[1px]`}>
              <div className="rounded-[27px] bg-slate-950/92 p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-white/60">Theme</div>
                    <div className="mt-2 text-2xl font-black">{selectedTheme.label}</div>
                  </div>
                  <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
                    {slideCount} שקופיות
                  </div>
                </div>

                <div className="mt-4 text-sm leading-7 text-white/75">{selectedTheme.blurb}</div>

                <div className="mt-6 grid gap-3">
                  {PRESENTATION_THEMES.map((item) => {
                    const active = item.id === theme;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setTheme(item.id)}
                        className={`rounded-2xl border px-4 py-3 text-right transition ${
                          active
                            ? 'border-white/60 bg-white/12 shadow-[0_0_0_1px_rgba(255,255,255,0.12)]'
                            : 'border-white/10 bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.07]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-bold text-white">{item.label}</div>
                            <div className="mt-1 text-xs leading-6 text-white/65">{item.blurb}</div>
                          </div>
                          <div className={`h-10 w-10 rounded-2xl bg-gradient-to-br ${item.accent}`} />
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/55">מה ייווצר</div>
                  <ul className="mt-3 space-y-2 text-sm leading-7 text-white/80">
                    <li>שלד שקופיות עם כותרת לכל שקופית</li>
                    <li>מסר חד לכל שקופית במקום פסקאות ארוכות</li>
                    <li>הנחיות ויזואליות ותמונות בהתאם לדגש שבחרת</li>
                    <li>עיצוב שמתאים ל־{selectedTheme.label} ולא למסמך Word רגיל</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
