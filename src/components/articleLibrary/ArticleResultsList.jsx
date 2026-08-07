import React, { useState } from 'react';
import { isArticleAlreadyInMaterials, articleHasPdfCandidate } from '../../services/articleLibraryService';

/**
 * כרטיסי תוצאות של "ספריית מאמרים" — רכיב אחד המשמש גם את הסיידבר וגם את מודאל דף הבית.
 *
 * @param {object}   props
 * @param {Array}    props.articles       DTO מ-searchArticleLibrary
 * @param {object}   props.addState       {[articleId]: {status, error, strength}}
 * @param {Function} props.onAdd          (article) => void — גם "נסה שוב"
 * @param {'light'|'dark'} props.variant  התאמה לרקע בהיר/כהה
 * @param {boolean}  props.projectMissing אין פרויקט פעיל → רמז + כפתורים מנוטרלים
 * @param {Function} [props.onDownloadPdf] (article) => Promise — אופציונלי. מועבר רק
 *                   בדסקטופ (window.desktopApp.fetchPdfBinary); בלעדיו הכפתור לא מוצג.
 */
export default function ArticleResultsList({
  articles,
  addState = {},
  onAdd,
  variant = 'dark',
  projectMissing = false,
  onDownloadPdf = null,
}) {
  // busy מקומי לכפתור ההורדה — אין לו state בקורא, ודיאלוג השמירה חוסם ממילא.
  const [downloadingIds, setDownloadingIds] = useState(() => new Set());
  const runDownload = async (cardKey, article) => {
    if (!onDownloadPdf || downloadingIds.has(cardKey)) return;
    setDownloadingIds((prev) => new Set(prev).add(cardKey));
    try {
      await onDownloadPdf(article);
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(cardKey);
        return next;
      });
    }
  };

  const list = Array.isArray(articles) ? articles : [];
  if (!list.length) return null;

  const dark = variant === 'dark';
  const cardCls = dark
    ? 'rounded-2xl border border-white/10 bg-white/[0.06] p-3'
    : 'rounded-2xl border border-slate-200 bg-white p-3';
  const titleCls = dark ? 'text-slate-100' : 'text-slate-900';
  const metaCls = dark ? 'text-slate-400' : 'text-slate-500';
  const snippetCls = dark ? 'text-slate-300/80' : 'text-slate-600';
  const badgeCls = dark
    ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
    : 'border-amber-300 bg-amber-50 text-amber-700';
  const oaBadgeCls = dark
    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
    : 'border-emerald-300 bg-emerald-50 text-emerald-700';
  const openCls = dark
    ? 'border-white/15 bg-white/10 text-slate-100 hover:bg-white/20'
    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100';

  return (
    <div dir="rtl" className="mt-2 flex w-full flex-col gap-2 text-right">
      {projectMissing && (
        <div className={`text-[11px] leading-relaxed ${metaCls}`}>
          פתח או צור פרויקט כדי להוסיף מאמרים לחומרי העזר.
        </div>
      )}

      {list.map((article, idx) => {
        const key = article?.id || article?.url || `article-${idx}`;
        const state = addState?.[article?.id] || addState?.[key] || {};
        const status = state.status || 'idle';
        const alreadyKnown = status === 'already'
          || (status === 'idle' && isArticleAlreadyInMaterials(article?.url));

        const busy = status === 'fetching' || status === 'adding' || status === 'embedding';
        const done = status === 'added' || alreadyKnown;

        let addLabel = '＋ הוסף לחומרי עזר';
        if (status === 'fetching') addLabel = '⏳ מוריד…';
        else if (status === 'adding') addLabel = '⏳ מוסיף…';
        else if (status === 'embedding') addLabel = '⏳ מאנדקס…';
        else if (status === 'added') {
          addLabel = state.strength === 'abstract' ? '✓ נוסף (תקציר בלבד)' : '✓ נוסף לחומרים';
        } else if (alreadyKnown) addLabel = '✓ כבר בחומרים';
        else if (status === 'error') addLabel = '⟳ נסה שוב';

        const addDisabled = busy || done || (projectMissing && status !== 'error');

        const authors = Array.isArray(article?.authors) ? article.authors.filter(Boolean) : [];
        const authorsText = authors.length
          ? authors.slice(0, 3).join(', ') + (authors.length > 3 ? ' ואחרים' : '')
          : '';
        const metaParts = [authorsText, article?.year ? String(article.year) : '', article?.domain || '']
          .filter(Boolean);

        // כשהמקור חסום לבדיקה אוטומטית מעדיפים עותק גישה-חופשית (Unpaywall) ואז PDF.
        const openHref = article?.botBlocked
          ? (article?.oaUrl || article?.pdfUrl || article?.url)
          : article?.url;

        const addBtnCls = done
          ? (dark ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700')
          : status === 'error'
            ? (dark ? 'border-rose-400/30 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20' : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100')
            : (dark ? 'border-sky-400/30 bg-sky-400/15 text-sky-100 hover:bg-sky-400/25' : 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100');

        return (
          <div key={key} className={cardCls}>
            <div className={`line-clamp-2 text-[12.5px] font-bold leading-snug ${titleCls}`}>
              {article?.title || 'ללא כותרת'}
            </div>

            {metaParts.length > 0 && (
              <div className={`mt-1 text-[11px] ${metaCls}`}>{metaParts.join(' · ')}</div>
            )}

            {(article?.citedBy || article?.doi) && (
              <div className={`mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] ${metaCls}`}>
                {article?.citedBy ? <span>📈 צוטט ב-{article.citedBy}</span> : null}
                {article?.doi ? <span className="break-all">DOI: {article.doi}</span> : null}
              </div>
            )}

            {article?.snippet && (
              <div className={`mt-1 line-clamp-2 text-[11px] leading-relaxed ${snippetCls}`}>
                {article.snippet}
              </div>
            )}

            {(article?.openAccess || article?.botBlocked || article?.missingUrl) && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {article?.openAccess && (
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${oaBadgeCls}`}>
                    🔓 גישה חופשית
                  </span>
                )}
                {article?.botBlocked && (
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeCls}`}>
                    🔒 חסום לבדיקה אוטומטית
                  </span>
                )}
                {article?.missingUrl && (
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeCls}`}>
                    ללא קישור
                  </span>
                )}
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {!article?.missingUrl && openHref && (
                <a
                  href={openHref}
                  target="_blank"
                  rel="noreferrer"
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${openCls}`}
                >
                  🔗 פתח
                </a>
              )}
              {onDownloadPdf && articleHasPdfCandidate(article) && (
                <button
                  type="button"
                  onClick={() => runDownload(key, article)}
                  disabled={downloadingIds.has(key)}
                  title="שמור את קובץ ה-PDF של המאמר למחשב"
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${openCls} ${downloadingIds.has(key) ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                >
                  {downloadingIds.has(key) ? '⏳ מוריד…' : '⬇ PDF'}
                </button>
              )}
              <button
                type="button"
                onClick={() => { if (!addDisabled) onAdd?.(article); }}
                disabled={addDisabled}
                title={projectMissing ? 'פתח או צור פרויקט כדי להוסיף חומרי עזר' : addLabel}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${addBtnCls} ${addDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              >
                {addLabel}
              </button>
            </div>

            {status === 'error' && state.error && (
              <div className="mt-1 text-[10.5px] font-medium text-rose-400">{state.error}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
