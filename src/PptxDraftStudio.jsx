// ═══════════════════════════════════════════════════════════════
// PptxDraftStudio.jsx — עריכת טיוטת מצגת שהועלתה (.pptx).
// מציג טקסט פר-שקופית לעריכה. שכתוב לסגנון המשתמש (כל הדק או שקופית בודדת).
// העיצוב המקורי לא מוצג כאן — הוא נשמר byte-for-byte בקובץ עצמו ומיוצא כמותו.
// ═══════════════════════════════════════════════════════════════

import React, { useReducer, useState } from 'react';
import { restylePptxDraft, setParaText, exportPptxBase64, exportPptxBlob } from './services/pptxDraftService';

// diff ברמת מילים (LCS) — מחזיר { oldParts, newParts } עם דגל removed/added לכל מקטע.
const splitWords = (s) => String(s || '').split(/(\s+)/).filter((t) => t.length);
const wordDiff = (a, b) => {
  const x = splitWords(a); const y = splitWords(b);
  const n = x.length; const m = y.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1)
    for (let j = m - 1; j >= 0; j -= 1)
      dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const oldParts = []; const newParts = [];
  let i = 0; let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { oldParts.push({ text: x[i] }); newParts.push({ text: y[j] }); i += 1; j += 1; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { oldParts.push({ text: x[i], removed: true }); i += 1; }
    else { newParts.push({ text: y[j], added: true }); j += 1; }
  }
  while (i < n) { oldParts.push({ text: x[i], removed: true }); i += 1; }
  while (j < m) { newParts.push({ text: y[j], added: true }); j += 1; }
  return { oldParts, newParts };
};

const DiffText = ({ parts, kind }) => (
  <span>
    {parts.map((p, idx) => (
      p[kind]
        ? <mark key={idx} className={kind === 'removed' ? 'bg-rose-500/25 text-rose-200 line-through decoration-rose-400/60' : 'bg-emerald-500/25 text-emerald-200'}>{p.text}</mark>
        : <span key={idx}>{p.text}</span>
    ))}
  </span>
);

export default function PptxDraftStudio({
  draft,
  onExit = () => {},
  showToast = () => {},
}) {
  const [, forceRender] = useReducer((n) => n + 1, 0);
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);   // { done, total } | null
  const [exporting, setExporting] = useState(false);
  const [compare, setCompare] = useState(false);     // תצוגת השוואה מקור↔משוכתב
  const [onlyChanged, setOnlyChanged] = useState(false);

  const slides = draft?.slides || [];
  const totalParas = slides.reduce((n, s) => n + s.paras.length, 0);
  const changedCount = slides.reduce((n, s) => n + s.paras.filter((p) => p.text !== p.original).length, 0);

  const editPara = (para, value) => { setParaText(para, value); forceRender(); };

  const runRestyle = async (slideIds = null) => {
    if (busy) return;
    setBusy(true); setProgress({ done: 0, total: slideIds ? slideIds.length : slides.length });
    try {
      const { changed } = await restylePptxDraft(draft, {
        instructions: instructions.trim(),
        slideIds,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      forceRender();
      showToast(changed ? `שוכתבו ${changed} פסקאות לסגנון שלך ✓` : 'לא בוצעו שינויים', { tone: changed ? 'success' : 'info' });
    } catch (e) {
      showToast(e?.message || 'השכתוב נכשל', { tone: 'error' });
    } finally { setBusy(false); setProgress(null); }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const baseName = String(draft.fileName || 'presentation').replace(/\.pptx$/i, '');
      if (window.desktopApp?.saveDocumentDialog) {
        const base64 = await exportPptxBase64(draft);
        const res = await window.desktopApp.saveDocumentDialog({ title: `${baseName} (סגנון אישי)`, preferredExtension: 'pptx', base64 });
        if (res?.ok) showToast('המצגת נשמרה כ-PPTX ✓', { tone: 'success' });
        else if (!res?.canceled) showToast(res?.error || 'שמירה נכשלה', { tone: 'error' });
      } else {
        const blob = await exportPptxBlob(draft);
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = `${baseName} (סגנון אישי).pptx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        showToast('המצגת ירדה ✓', { tone: 'success' });
      }
    } catch (e) {
      console.error('pptx export failed', e);
      showToast(e?.message || 'ייצוא נכשל', { tone: 'error' });
    } finally { setExporting(false); }
  };

  return (
    <div className="flex min-h-full flex-1 flex-col overflow-hidden bg-slate-950" dir="rtl">
      {/* סרגל עליון */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-2">
        <span className="text-sm font-bold text-white">📥 טיוטת מצגת</span>
        <span className="truncate text-xs text-slate-400">{draft?.fileName}</span>
        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">{slides.length} שקופיות · {totalParas} פסקאות</span>
        {changedCount > 0 && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">{changedCount} שונו</span>}
        <div className="flex-1" />
        <button onClick={() => setCompare((v) => !v)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${compare ? 'border-cyan-400 bg-cyan-500/15 text-cyan-200' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}>⇆ השוואה</button>
        {compare && <button onClick={() => setOnlyChanged((v) => !v)} disabled={!changedCount} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${onlyChanged ? 'border-emerald-400 bg-emerald-500/15 text-emerald-200' : 'border-slate-700 text-slate-300 hover:bg-slate-800'} disabled:opacity-40`}>רק ששונו</button>}
        <button onClick={handleExport} disabled={exporting || busy} className="rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">{exporting ? 'מייצא...' : '⬇ ייצוא PPTX'}</button>
        <button onClick={onExit} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">חזרה</button>
      </div>

      {/* פס שכתוב גלובלי */}
      <div className="flex flex-col gap-2 border-b border-slate-800 bg-slate-900/40 px-4 py-3 sm:flex-row sm:items-center">
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="הנחיה לשכתוב (אופציונלי) — למשל: שים לב לעקביות מונחים, פשט נוסחים מסורבלים, הדגש את התרומה..."
          className="min-h-[44px] flex-1 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm leading-6 text-slate-100 outline-none focus:border-cyan-400"
        />
        <button
          onClick={() => runRestyle(null)}
          disabled={busy || !totalParas}
          className="shrink-0 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-600 px-4 py-2.5 text-sm font-bold text-white hover:from-violet-400 disabled:opacity-50"
        >
          {busy && !progress?.partial ? `משכתב... ${progress ? `${progress.done}/${progress.total}` : ''}` : '✨ שכתב הכול לסגנון שלי'}
        </button>
      </div>

      {/* רשימת שקופיות */}
      <div className="flex-1 overflow-auto px-4 py-4">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {slides.map((slide, si) => {
            const slideDirty = slide.paras.some((p) => p.text !== p.original);
            if (compare && onlyChanged && !slideDirty) return null;
            return (
            <div key={slide.slidePath} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 rounded-lg bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-300">{si + 1}</span>
                  <span className="truncate text-sm font-bold text-white">{slide.title}</span>
                </div>
                <button
                  onClick={() => runRestyle([slide.slidePath])}
                  disabled={busy || !slide.paras.length}
                  className="shrink-0 rounded-lg border border-violet-500/40 px-2.5 py-1 text-xs text-violet-300 hover:bg-violet-500/10 disabled:opacity-40"
                >✨ שכתב שקופית</button>
              </div>

              {!slide.paras.length && <p className="text-xs text-slate-500">אין טקסט לעריכה בשקופית זו.</p>}

              <div className="flex flex-col gap-2">
                {slide.paras.map((para) => {
                  const dirty = para.text !== para.original;
                  const label = para.titleish ? 'כותרת' : para.kind === 'notes' ? 'הערות מרצה' : 'תוכן';

                  // ── מצב השוואה: מקור ↔ משוכתב צד-בצד עם הדגשת מילים ──
                  if (compare) {
                    if (onlyChanged && !dirty) return null;
                    const { oldParts, newParts } = dirty
                      ? wordDiff(para.original, para.text)
                      : { oldParts: [{ text: para.original }], newParts: [{ text: para.text }] };
                    return (
                      <div key={para.id} className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          {label}
                          {dirty ? <span className="text-emerald-400">● שונה</span> : <span className="text-slate-600">ללא שינוי</span>}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="rounded-xl border border-slate-700 bg-slate-800/30 px-3 py-2 text-sm leading-6 text-slate-300">
                            <div className="mb-1 text-[10px] font-bold text-slate-500">מקור</div>
                            <DiffText parts={oldParts} kind="removed" />
                          </div>
                          <div className={`rounded-xl border bg-slate-800/30 px-3 py-2 text-sm leading-6 text-slate-100 ${dirty ? 'border-emerald-500/40' : 'border-slate-700'} ${para.titleish ? 'font-bold' : ''}`}>
                            <div className="mb-1 text-[10px] font-bold text-slate-500">משוכתב</div>
                            <DiffText parts={newParts} kind="added" />
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // ── מצב עריכה רגיל ──
                  return (
                    <div key={para.id} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {label}
                        {dirty && <span className="text-emerald-400">● שונה</span>}
                      </div>
                      <textarea
                        value={para.text}
                        onChange={(e) => editPara(para, e.target.value)}
                        rows={Math.min(6, Math.max(1, Math.ceil(para.text.length / 60)))}
                        className={`w-full resize-y rounded-xl border bg-slate-800/60 px-3 py-2 text-sm leading-6 text-slate-100 outline-none focus:border-cyan-400 ${dirty ? 'border-emerald-500/40' : 'border-slate-700'} ${para.titleish ? 'font-bold' : ''}`}
                      />
                      {dirty && (
                        <button
                          onClick={() => editPara(para, para.original)}
                          className="self-start text-[11px] text-slate-500 hover:text-slate-300"
                        >↩ שחזר מקור</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
