// EvidencePanel — פאנל הראיות החי, מעוגן לצד העורך.
//
// עוקב אחרי הכותרת שהסמן נמצא מתחתיה ומציג את הראיות של אותו סעיף: ציטוט אמיתי
// מהחומרים של המשתמש + פרובננס, מד התקדמות מול מכסת המילים, וסימון פער כשאין חומר.
//
// הכל מקומי — הראיות חושבו מראש בסטודיו ונשמרו ב-assignmentScaffoldStore. הפאנל
// עצמו לא מריץ retrieval, ולכן הוא מיידי ולא עולה כלום.
//
// למה polling ולא event: TipTap לא משדר אירוע "הסמן עבר סעיף". מאזינים ל-selectionUpdate
// של העורך, ובנוסף לאירוע העדכון של החנות.

import React from 'react';
import {
  readScaffold,
  saveScaffold,
  clearScaffold,
  SCAFFOLD_UPDATED_EVENT,
} from '../../services/assignmentScaffoldStore';
import {
  findSectionAtCursor,
  countSectionWords,
  buildQuoteHtml,
  insertReplacingQuotaHint,
} from '../../services/assignmentScaffoldDoc';
import { formatProvenance } from '../../services/evidenceMatchService';
import { ensureOpenersReady, getOpenersForIntent } from '../../services/styleOpenerService';
import { ensureOpenerProfile, getOpenerProfile, recordOpenerFeedback } from '../../services/openerProfileService';
import { INTENT_LABELS } from '../../services/assignmentSpecService';
import { draftSectionFromEvidence } from '../../services/assignmentAiService';
import { hasUsableAiProvider } from '../../services/aiService';
import { fillGapAndRematch } from '../../services/gapSourceService';

const GAP_STAGE_LABELS = {
  search: '🔎 מחפש מקורות…',
  fetch: '📄 מושך את העמודים…',
  embed: '🧠 מוסיף לאינדקס…',
  done: '✓ סיום',
};

const GAP_FAIL_LABELS = {
  'no-query': 'אין מספיק טקסט בסעיף כדי לבנות שאילתת חיפוש. הוסף כותרת או הנחיה.',
  'no-results': 'לא נמצאו מקורות לשאילתה הזו.',
  'nothing-usable': 'נמצאו מקורות, אך לא הצלחנו למשוך מהם טקסט שמיש.',
};

export default function EvidencePanel({ editor, onClose }) {
  const [scaffold, setScaffold] = React.useState(() => readScaffold());
  const [current, setCurrent] = React.useState(null);
  const [wordsWritten, setWordsWritten] = React.useState(0);
  const [expanded, setExpanded] = React.useState(null);

  React.useEffect(() => {
    const sync = () => setScaffold(readScaffold());
    window.addEventListener(SCAFFOLD_UPDATED_EVENT, sync);
    return () => window.removeEventListener(SCAFFOLD_UPDATED_EVENT, sync);
  }, []);

  // מעקב אחרי הסמן. selectionUpdate מכסה תזוזת סמן, update מכסה הקלדה (למד המילים).
  React.useEffect(() => {
    if (!editor || !scaffold?.spec) return undefined;
    const refresh = () => {
      const hit = findSectionAtCursor(editor, scaffold.spec);
      setCurrent(hit);
      setWordsWritten(hit ? countSectionWords(editor, hit.title) : 0);
    };
    refresh();
    editor.on('selectionUpdate', refresh);
    editor.on('update', refresh);
    return () => {
      editor.off('selectionUpdate', refresh);
      editor.off('update', refresh);
    };
  }, [editor, scaffold]);

  const section = React.useMemo(() => (
    current ? (scaffold.spec?.sections || []).find((s) => s.id === current.sectionId) : null
  ), [current, scaffold]);

  // פתיחים בקול של המשתמש, לפי הכוונה הרטורית של הסעיף. נבנים מהקורפוס האישי
  // ולכן זמינים רק אחרי שהוא העלה מספיק טקסט משלו.
  const [openersReady, setOpenersReady] = React.useState(false);
  // seed הרענון: לחיצה על ↻ מרכיבה וריאציות חדשות מהדקדוק (ומדווחת "לא זה"
  // על הקודמות — כך הפרופיל האישי לומד גם מדחייה, לא רק מאימוץ).
  const [openerSeed, setOpenerSeed] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    Promise.all([ensureOpenersReady(), ensureOpenerProfile()])
      .then(() => { if (alive) setOpenersReady(true); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const found = current ? scaffold.evidence?.[current.sectionId] : null;
  const evidence = found?.evidence || [];
  const quota = Number(section?.wordQuota) || 0;
  const pct = quota ? Math.min(100, Math.round((wordsWritten / quota) * 100)) : 0;

  const openers = React.useMemo(() => (
    openersReady && section
      ? getOpenersForIntent(section.intent, {
        limit: 3,
        seedKey: `${section.id}#${openerSeed}`,
        profile: getOpenerProfile(),
      })
      : []
  ), [openersReady, section, openerSeed]);

  const refreshOpeners = () => {
    openers.filter((o) => o.composed).forEach((o) => {
      recordOpenerFeedback({ intent: section.intent, slots: o.slots, accepted: false });
    });
    setOpenerSeed((s) => s + 1);
  };

  // "עוד כמו זה": חיזוק מילות הסלוט של הווריאנט האהוב לפני ההרכבה מחדש —
  // המשקל האישי שעלה גורם ל-pickSlotWord להעדיף אותן בסבב הבא.
  const moreLikeThis = (o) => {
    recordOpenerFeedback({ intent: section.intent, slots: o.slots, accepted: true });
    setOpenerSeed((s) => s + 1);
  };

  const insertQuote = (item) => {
    if (!editor) return;
    insertReplacingQuotaHint(editor, buildQuoteHtml(item));
  };

  // פתיח נשתל כטקסט להמשך הקלדה, לא כפסקה סגורה — הסמן נשאר בסוף המשפט.
  // פתיח מורכב מוזן בלי שלוש הנקודות (המשתמש ממשיך לכתוב), והוספתו היא
  // אימוץ מפורש — המשוב מחזק את מילות הסלוט שנבחרו.
  const insertOpener = (o) => {
    if (!editor) return;
    const text = o.composed ? o.text.replace(/\s*…$/, '') : o.text;
    insertReplacingQuotaHint(editor, `${text} `);
    if (o.composed) {
      recordOpenerFeedback({ intent: section.intent, slots: o.slots, accepted: true });
    }
  };

  // שלב 2: טיוטה מעוגנת. נגישה רק כשיש ראיות *וגם* ספק מוגדר — סעיף בלי ראיות
  // לא נכתב בכלל, וזה מכוון (ראה assignmentAiService).
  const [drafting, setDrafting] = React.useState(false);
  const [draftError, setDraftError] = React.useState(null);
  const aiAvailable = React.useMemo(() => hasUsableAiProvider(), [scaffold]);

  const draftSection = async () => {
    if (!section || !editor || drafting) return;
    setDrafting(true);
    setDraftError(null);
    try {
      const result = await draftSectionFromEvidence(section, { evidence, scaffold });
      if (!result.ok) {
        setDraftError(result.reason || 'הכתיבה נכשלה.');
        return;
      }
      // המודל עשוי להחזיר HTML מוכן (<p>…</p>) או טקסט גולמי — נצפו שניהם ב-LAB.
      // עטיפה עיוורת יוצרת <p><p>…</p></p>, ולכן עוטפים רק כשזה לא כבר HTML.
      const raw = String(result.text).trim();
      const alreadyHtml = /^\s*<(p|h[1-6]|ul|ol|blockquote)\b/i.test(raw);
      const html = alreadyHtml
        ? raw
        : raw.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, ' ').trim()}</p>`).join('');
      insertReplacingQuotaHint(editor, html);
    } catch (err) {
      setDraftError(String(err?.message || err));
    } finally {
      setDrafting(false);
    }
  };

  // סגירת פער: חיפוש מקורות → משיכת טקסט → אינדקס → שיוך מחדש. אפס קריאות למודל
  // שפה, ולכן אפשר להריץ שוב ושוב בלי עלות.
  const [gapStage, setGapStage] = React.useState(null);
  const [gapResult, setGapResult] = React.useState(null);

  const fillGap = async () => {
    if (!section || gapStage) return;
    setGapStage('search');
    setGapResult(null);
    try {
      const res = await fillGapAndRematch(section, {
        spec: scaffold.spec,
        onProgress: (stage) => setGapStage(stage),
      });
      if (!res.ok) {
        setGapResult({ ok: false, message: GAP_FAIL_LABELS[res.reason] || `החיפוש נכשל (${res.reason}).`, query: res.query });
        return;
      }
      // כתיבה חזרה ל-scaffold מפעילה את SCAFFOLD_UPDATED_EVENT, וה-panel מתרענן.
      const current = readScaffold();
      saveScaffold({
        ...current,
        evidence: { ...(current.evidence || {}), [section.id]: res.evidence },
        gaps: (current.gaps || []).filter((id) => id !== section.id),
        // כשה-scaffold מוגבל לחומרים מסוימים, מקור חדש שלא יתווסף לרשימה
        // ייעלם בשיוך הבא. null = בלי הגבלה, ואז אין מה לעדכן.
        materialIds: Array.isArray(current.materialIds)
          ? [...new Set([...current.materialIds, ...res.ingested.map((s) => s.materialId)])]
          : current.materialIds,
      });
      setGapResult({
        ok: true,
        query: res.query,
        ingested: res.ingested,
        evidenceCount: res.evidence?.evidence?.length || 0,
      });
    } catch (err) {
      setGapResult({ ok: false, message: String(err?.message || err) });
    } finally {
      setGapStage(null);
    }
  };

  if (!scaffold?.active) return null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F8FAFC]" dir="rtl">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-slate-900">📎 ראיות</div>
          <div className="truncate text-[11px] text-slate-500">{scaffold.title}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => { if (window.confirm('לסיים את העבודה על המטלה ולסגור את פאנל הראיות?')) clearScaffold(); }}
            className="rounded-lg px-2 py-1 text-[11px] text-slate-400 transition hover:bg-slate-100 hover:text-rose-500"
          >
            סיים מטלה
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="סגור פאנל"
              className="rounded-lg px-2 py-1 text-slate-400 transition hover:bg-slate-100"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!section ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
            הצב את הסמן מתחת לאחת מכותרות המטלה כדי לראות את הראיות של אותו סעיף.
          </div>
        ) : (
          <>
            <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-sm font-bold text-slate-900">{section.title}</div>
              {quota > 0 && (
                <>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-all ${pct > 110 ? 'bg-rose-400' : pct >= 80 ? 'bg-emerald-400' : 'bg-sky-400'}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {wordsWritten} מתוך ~{quota} מילים
                    {wordsWritten > quota * 1.1 && <span className="text-rose-500"> · חריגה מהמכסה</span>}
                  </div>
                </>
              )}
            </div>

            {openers.length > 0 && (
              <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-bold text-indigo-900">
                    {openers.every((o) => o.general)
                      ? `פתיחים כלליים · ${INTENT_LABELS[section.intent] || section.intent}`
                      : `פתיחים בקול שלך · ${INTENT_LABELS[section.intent] || section.intent}`}
                  </div>
                  {openers.some((o) => o.composed) && (
                    <button
                      type="button"
                      onClick={refreshOpeners}
                      title="הצע ניסוחים אחרים"
                      className="rounded-md px-1.5 py-0.5 text-[11px] text-indigo-500 transition hover:bg-indigo-100"
                    >
                      ↻
                    </button>
                  )}
                </div>
                <ul className="mt-1.5 space-y-1">
                  {openers.map((o) => (
                    <li key={o.text} className="flex items-stretch gap-1">
                      {o.composed && (
                        <button
                          type="button"
                          onClick={() => moreLikeThis(o)}
                          title="עוד כמו זה"
                          className="rounded-lg border border-indigo-200/70 bg-white px-1.5 text-[11px] text-indigo-400 transition hover:border-indigo-400 hover:text-indigo-600"
                        >
                          ♥
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => insertOpener(o)}
                        title="הוסף במיקום הסמן"
                        className="w-full rounded-lg border border-indigo-200/70 bg-white px-2.5 py-1.5 text-right text-[11px] leading-relaxed text-slate-700 transition hover:border-indigo-400 hover:bg-indigo-50"
                      >
                        {o.composed ? o.text : `${o.text}…`}
                        {o.composed && (
                          <span className="mr-1 text-[10px] text-indigo-400">
                            {o.general ? '(כללי)' : '(מנוסח עבורך)'}
                          </span>
                        )}
                        {!o.composed && o.fromIntent !== section.intent && (
                          <span className="mr-1 text-[10px] text-slate-400">
                            (מ{INTENT_LABELS[o.fromIntent] || o.fromIntent})
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {evidence.length > 0 && aiAvailable && (
              <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3">
                <button
                  type="button"
                  onClick={draftSection}
                  disabled={drafting}
                  className="w-full rounded-lg bg-gradient-to-l from-cyan-600 to-blue-700 px-3 py-2 text-xs font-bold text-white shadow-sm transition disabled:opacity-50"
                >
                  {drafting ? '✍️ כותב מהראיות…' : `✍️ כתוב טיוטה מ-${evidence.length} הראיות`}
                </button>
                <div className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
                  המודל יקבל אך ורק את הקטעים שלמעלה, ויתבקש להפנות אליהם. מה שלא נתמך בהם — יסומן כדרוש מקור.
                </div>
                {draftError && (
                  <div className="mt-1.5 rounded-lg bg-rose-50 px-2 py-1 text-[11px] text-rose-700">{draftError}</div>
                )}
              </div>
            )}

            {evidence.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <div className="font-bold">אין חומר תומך לסעיף הזה.</div>
                <div className="mt-1 leading-relaxed">
                  לא נמצא בחומרים שהעלית קטע רלוונטי. אפשר לחפש מקור ברשת, להעלות מקור בעצמך, או לצמצם את הסעיף.
                </div>

                <button
                  type="button"
                  onClick={fillGap}
                  disabled={Boolean(gapStage)}
                  className="mt-2 w-full rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-60"
                >
                  {gapStage ? GAP_STAGE_LABELS[gapStage] || 'עובד…' : '🔎 חפש מקורות לסעיף הזה'}
                </button>
                <div className="mt-1 text-[10px] leading-relaxed text-amber-700/80">
                  חיפוש ומשיכת עמודים בלבד — לא נכתב כאן טקסט. (אם אין מנוי Scholar/Perplexity,
                  שלב החיפוש נופל ל-Google Search דרך Gemini — קריאה אחת קצרה.)
                </div>

                {gapResult && !gapResult.ok && (
                  <div className="mt-1.5 rounded-lg bg-white/70 px-2 py-1 text-[11px] text-amber-900">
                    {gapResult.message}
                    {gapResult.query && <div className="mt-0.5 text-[10px] text-amber-700/70">שאילתה: {gapResult.query}</div>}
                  </div>
                )}
                {gapResult?.ok && gapResult.evidenceCount === 0 && (
                  <div className="mt-1.5 rounded-lg bg-white/70 px-2 py-1 text-[11px] text-amber-900">
                    נוספו {gapResult.ingested.length} מקורות, אך אף אחד מהם לא עבר את סף הרלוונטיות לסעיף.
                  </div>
                )}

                {aiAvailable && (
                  <div className="mt-1.5 border-t border-amber-200 pt-1.5 text-[11px]">
                    כתיבה בלי מקורות לא תוצע כאן — היא הייתה המצאה.
                  </div>
                )}
              </div>
            ) : (
              <ul className="space-y-2">
                {gapResult?.ok && gapResult.evidenceCount > 0 && (
                  <li className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-[11px] text-emerald-800">
                    <span className="font-bold">הפער נסגר.</span>{' '}
                    נוספו {gapResult.ingested.length} מקורות מהרשת ({gapResult.evidenceCount} ראיות לסעיף).
                    {gapResult.ingested.some((s) => s.strength === 'abstract') && (
                      <div className="mt-0.5 text-emerald-700/80">
                        חלק מהעמודים לא נמשכו במלואם — אותם מקורות נשמרו כתקציר ומסומנים ככאלה.
                      </div>
                    )}
                  </li>
                )}
                {evidence.map((item) => {
                  const open = expanded === item.chunkId;
                  return (
                    <li key={item.chunkId} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 text-[11px] font-bold text-slate-600">
                          {formatProvenance(item)}
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                          {item.score}
                        </span>
                      </div>
                      <p className={`mt-1.5 text-xs leading-relaxed text-slate-700 ${open ? '' : 'line-clamp-4'}`}>
                        {item.text}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => insertQuote(item)}
                          className="rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-slate-700"
                        >
                          הוסף ציטוט
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpanded(open ? null : item.chunkId)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 transition hover:bg-slate-50"
                        >
                          {open ? 'כווץ' : 'הצג הכל'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {scaffold.mode === 'lexical' && (
              <div className="mt-3 text-[10px] leading-relaxed text-slate-400">
                ההתאמה רצה במצב מילולי (האינדקס הסמנטי לא היה זמין) — ייתכנו החמצות.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
