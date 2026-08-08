import { useCallback, useEffect, useState } from 'react';
import {
  listInboxClips,
  routeInboxClip,
  discardInboxClip,
  CLIP_INGESTED_EVENT,
  getClipClientRole,
  setClipClientRole,
  getClipRequireReview,
  setClipRequireReview,
  getClipAutoOcr,
  setClipAutoOcr,
  getActiveClipIngest,
  startClipInboxPolling,
  stopClipInboxPolling,
  CLIP_PROGRESS_EVENT,
  AUTO_OCR_MAX_PAGES,
} from '../services/clipInboxService';
import {
  getClipPreview,
  loadClipBytes,
  clearClipPreviewCache,
  makeImageThumbnailDataUrl,
  formatByteSize,
} from '../services/clipPreviewService';
import { renderPdfPageToDataUrl } from '../services/materialExtractBrowser';
import { listProjects } from '../services/projectService';
import { showToast } from '../services/uiFeedback';

// אייקון לפי סוג הקליפ — 'file' לא היה מטופל וקיבל את אייקון הטקסט.
// טקסט חי לשורת "בעיבוד" — אותם שלבים כמו שורת המצב הגלובלית.
const ingestPhaseLabel = ({ phase = '', page = 0, pages = 0 } = {}) => {
  if (phase === 'ocr') return pages ? `מזהה טקסט: עמוד ${page || 1} מתוך ${pages}` : 'מזהה טקסט…';
  if (phase === 'embed') return 'מוסיף לאינדקס הראיות…';
  return 'מוריד ומחלץ טקסט…';
};

const clipIcon = (clip = {}) => {
  if (clip.kind === 'image') return '🖼️';
  if (clip.kind !== 'file') return '📄';
  const name = String(clip.fileName || '').toLowerCase();
  if (name.endsWith('.pdf')) return '📕';
  if (/\.(docx?|rtf)$/.test(name)) return '📘';
  if (/\.(pptx?)$/.test(name)) return '📙';
  if (/\.(xlsx?|xlsm|csv)$/.test(name)) return '📗';
  return '📎';
};

// תמונה ממוזערת לקליפ. נטענת עצלנית, וכל כשל נופל בחזרה לאייקון בלבד.
function ClipPreviewThumb({ user, clip, onOpen, onPreviewLoaded }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getClipPreview(user, clip, { maxWidth: 360 })
      .then((res) => {
        if (!alive) return;
        setPreview(res);
        onPreviewLoaded?.(clip.id, res);
      })
      .catch(() => { if (alive) setPreview({ error: 'תצוגה מקדימה נכשלה' }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user, clip.id]);

  const hasImage = Boolean(preview?.thumbnailDataUrl);
  // גם קליפ בלי תמונה (docx וכו') שווה פתיחה: השורה חותכת ל-140 תווים והחלון
  // מציג את כל טעימת הטקסט.
  const canOpen = hasImage || Boolean(preview?.textSnippet);

  return (
    <button
      type="button"
      onClick={() => canOpen && onOpen?.(clip)}
      disabled={!canOpen}
      title={canOpen ? 'הצג בגדול' : ''}
      className={`w-[72px] h-[96px] flex-shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden flex items-center justify-center ${canOpen ? 'cursor-zoom-in hover:border-blue-400' : 'cursor-default'}`}
    >
      {loading ? (
        <span className="loading loading-spinner loading-xs"></span>
      ) : hasImage ? (
        <img
          src={preview.thumbnailDataUrl}
          alt={clip.title || 'תצוגה מקדימה'}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-2xl">{clipIcon(clip)}</span>
      )}
    </button>
  );
}

// תצוגה מוגדלת. ל-PDF מרנדרים מחדש בגודל מלא מהבייטים — מהקאש אם הם שם, אחרת
// הורדה חוזרת (קאש הבייטים הוא LRU של 4, ומהקליפ החמישי ואילך הוא כבר נופה).
function ClipPreviewModal({ user, clip, preview, onClose, children }) {
  const [page, setPage] = useState(1);
  const [bigUrl, setBigUrl] = useState('');
  const [rendering, setRendering] = useState(false);
  const [bytesReady, setBytesReady] = useState(false);
  const pageCount = preview?.pageCount || 0;
  // קליפ בלי תמונה כלל (docx) — אין מה להוריד, החלון מציג רק את טעימת הטקסט.
  const renderable = Boolean(pageCount || preview?.thumbnailDataUrl);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    if (!renderable) { setBigUrl(''); setBytesReady(false); return undefined; }
    setRendering(true);
    loadClipBytes(user, clip)
      .then(async (bytes) => {
        if (!alive) return;
        if (!bytes) { setBytesReady(false); setBigUrl(''); return; }
        setBytesReady(true);
        const dataUrl = pageCount
          ? (await renderPdfPageToDataUrl(bytes, { page, maxWidth: 900 })).dataUrl
          : await makeImageThumbnailDataUrl(bytes, { maxWidth: 900, quality: 0.82 });
        if (alive) setBigUrl(dataUrl);
      })
      .catch(() => { if (alive) { setBytesReady(false); setBigUrl(''); } })
      .finally(() => { if (alive) setRendering(false); });
    return () => { alive = false; };
  }, [user, clip.id, page, pageCount, renderable]);

  const shown = bigUrl || preview?.thumbnailDataUrl || '';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      dir="rtl"
      // ⚠️ stopPropagation חובה: החלון מרונדר בתוך רקע הפאנל, שגם הוא סוגר בלחיצה —
      // בלי זה לחיצה על רקע החלון סוגרת את כל תיבת הקליפים.
      onClick={(e) => { e.stopPropagation(); onClose?.(); }}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-semibold text-slate-900 dark:text-white truncate">
            {clipIcon(clip)} {clip.title || '(בלי שם)'}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-xl"
            aria-label="סגור"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {shown ? (
            <div className="flex justify-center">
              <img
                src={shown}
                alt={clip.title || 'תצוגה'}
                className={`max-w-full rounded-lg border border-slate-200 dark:border-slate-700 ${rendering ? 'opacity-60' : ''}`}
              />
            </div>
          ) : null}

          {rendering && (
            <div className="flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="loading loading-spinner loading-xs"></span>
              <span>טוען תצוגה מלאה…</span>
            </div>
          )}

          {renderable && !rendering && !bytesReady && (
            <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
              לא הצלחתי לטעון את הקובץ בגודל מלא — מוצגת התצוגה המוקטנת.
            </p>
          )}

          {/* דפדוף עמודים מותנה בבייטים בפועל: בלעדיהם החצים היו מזיזים את המספר
              ומשאירים את אותה תמונה מטושטשת. */}
          {pageCount > 1 && bytesReady && (
            <div className="flex items-center justify-center gap-3 text-sm text-slate-600 dark:text-slate-300">
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={page >= pageCount || rendering}
              >
                ‹
              </button>
              <span>עמוד {page} מתוך {pageCount}</span>
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || rendering}
              >
                ›
              </button>
            </div>
          )}

          {preview?.textSnippet ? (
            <div className="max-h-56 overflow-y-auto rounded-lg bg-slate-50 dark:bg-slate-800 p-3 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
              {preview.textSnippet}
            </div>
          ) : null}

          {!shown && !preview?.textSnippet && (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
              {preview?.error || 'אין תצוגה מקדימה לקליפ הזה.'}
            </p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function ClipInboxPanel({ user, open, onClose }) {
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [selectedProjectByClipId, setSelectedProjectByClipId] = useState({});
  const [busyClipId, setBusyClipId] = useState(null);
  const [clientRole, setClientRole] = useState(() => getClipClientRole());
  const [requireReview, setRequireReviewState] = useState(() => getClipRequireReview());
  const [autoOcr, setAutoOcrState] = useState(() => getClipAutoOcr());
  // הקליטה שרצה כרגע (אם רצה) — כדי שהפאנל לא ייראה ריק/תקוע בזמן OCR ארוך.
  const [activeIngest, setActiveIngest] = useState(() => getActiveClipIngest());
  const [previewByClipId, setPreviewByClipId] = useState({});
  const [previewClipId, setPreviewClipId] = useState(null);

  const handlePreviewLoaded = useCallback((clipId, preview) => {
    setPreviewByClipId((prev) => ({ ...prev, [clipId]: preview }));
  }, []);

  const handleReviewToggle = (checked) => {
    setClipRequireReview(checked);
    setRequireReviewState(checked);
  };

  const handleAutoOcrToggle = (checked) => {
    setClipAutoOcr(checked);
    setAutoOcrState(checked);
  };

  // התקדמות הקליטה הפעילה. הפאנל נפתח לפעמים באמצע העבודה — ולכן גם קריאה
  // ראשונית ל-getActiveClipIngest (אירוע שנשלח לפני ה-mount היה אבוד).
  useEffect(() => {
    if (!open) return undefined;
    setActiveIngest(getActiveClipIngest());
    const onProgress = (event) => {
      const detail = event?.detail || {};
      setActiveIngest(detail.phase === 'done' ? null : detail);
    };
    window.addEventListener(CLIP_PROGRESS_EVENT, onProgress);
    return () => window.removeEventListener(CLIP_PROGRESS_EVENT, onProgress);
  }, [open]);

  // הקאש מחזיק בייטים גולמיים (עד 4 קליפים) — משחררים כשהפאנל נסגר.
  useEffect(() => {
    if (open) return undefined;
    clearClipPreviewCache();
    setPreviewByClipId({});
    setPreviewClipId(null);
    return undefined;
  }, [open]);

  const forgetClip = useCallback((clipId) => {
    clearClipPreviewCache(clipId);
    setPreviewByClipId((prev) => {
      const next = { ...prev };
      delete next[clipId];
      return next;
    });
    setPreviewClipId((current) => (current === clipId ? null : current));
  }, []);

  // שינוי תפקיד מפעיל/עוצר את הפולינג מיד — בלי לחכות לריענון (ה-effect
  // ב-main.jsx רץ רק על שינוי משתמש).
  const handleRoleToggle = (isConsumer) => {
    const role = isConsumer ? 'consumer' : 'producer';
    setClipClientRole(role);
    setClientRole(role);
    if (isConsumer) startClipInboxPolling(user);
    else stopClipInboxPolling();
  };

  // Load projects once on mount
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const proj = await listProjects();
        setProjects(proj || []);
      } catch (err) {
        console.error('Failed to load projects:', err);
      }
    };
    loadProjects();
  }, []);

  // Load clips when opening
  // silent=true לרענון ברקע: בלי ספינר, כדי שהפאנל לא יהבהב מתחת לידיים של המשתמש.
  const loadClips = async ({ silent = false } = {}) => {
    if (!user) return;
    if (!silent) setLoading(true);
    try {
      const items = await listInboxClips(user);
      setClips(items || []);
    } catch (err) {
      console.error('Failed to load clips:', err);
      showToast('שגיאה בטעינת הקליפים', { tone: 'error' });
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadClips();
    }
  }, [open, user]);

  // Listen for new clips arriving
  useEffect(() => {
    const handleClipIngested = () => {
      if (open) loadClips({ silent: true });
    };
    window.addEventListener(CLIP_INGESTED_EVENT, handleClipIngested);
    return () => window.removeEventListener(CLIP_INGESTED_EVENT, handleClipIngested);
  }, [open]);

  // קליפ שנמצא כרגע בקליטה אוטומטית אסור לניתוב ידני — שתי הקליטות היו רצות
  // במקביל על אותו קליפ (החלון המוגדל מציג את אותם כפתורים).
  const isProcessing = (clip) => activeIngest?.clipId === clip?.id;

  const handleRouteMaterial = async (clip) => {
    if (!user || busyClipId || isProcessing(clip)) return;
    setBusyClipId(clip.id);
    try {
      const result = await routeInboxClip(user, clip, {
        destination: 'material',
        projectId: selectedProjectByClipId[clip.id] || null,
      });
      showToast(`נקלט: ${result.chunkCount || 0} קטעים`, { tone: 'info' });
      forgetClip(clip.id);
      setClips((prev) => prev.filter((c) => c.id !== clip.id));
      setSelectedProjectByClipId((prev) => {
        const next = { ...prev };
        delete next[clip.id];
        return next;
      });
    } catch (err) {
      showToast(err.message || 'שגיאה בקליטת הקליפ', { tone: 'error' });
    } finally {
      setBusyClipId(null);
    }
  };

  const handleRouteSource = async (clip) => {
    const projectId = selectedProjectByClipId[clip.id];
    if (!user || !projectId || busyClipId || isProcessing(clip)) return;
    setBusyClipId(clip.id);
    try {
      await routeInboxClip(user, clip, {
        destination: 'source',
        projectId,
      });
      showToast('צורף כמקור לפרויקט', { tone: 'info' });
      forgetClip(clip.id);
      setClips((prev) => prev.filter((c) => c.id !== clip.id));
      setSelectedProjectByClipId((prev) => {
        const next = { ...prev };
        delete next[clip.id];
        return next;
      });
    } catch (err) {
      showToast(err.message || 'שגיאה בצירוף המקור', { tone: 'error' });
    } finally {
      setBusyClipId(null);
    }
  };

  const handleDiscard = async (clip) => {
    if (!user || isProcessing(clip)) return;
    const confirmed = window.confirm('האם אתה בטוח שברצונך למחוק קליפ זה?');
    if (!confirmed) return;

    setBusyClipId(clip.id);
    try {
      await discardInboxClip(user, clip);
      showToast('הקליפ נמחק', { tone: 'info' });
      forgetClip(clip.id);
      setClips((prev) => prev.filter((c) => c.id !== clip.id));
      setSelectedProjectByClipId((prev) => {
        const next = { ...prev };
        delete next[clip.id];
        return next;
      });
    } catch (err) {
      showToast(err.message || 'שגיאה במחיקת הקליפ', { tone: 'error' });
    } finally {
      setBusyClipId(null);
    }
  };

  if (!open) return null;

  // אותן פעולות בדיוק בשורה ובחלון המוגדל — handler אחד, שני אתרי רינדור.
  const renderClipActions = (clip) => (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={() => handleRouteMaterial(clip)}
        disabled={busyClipId === clip.id || isProcessing(clip)}
        className="btn btn-sm btn-primary text-white disabled:opacity-50"
      >
        {busyClipId === clip.id ? (
          <span className="loading loading-spinner loading-xs"></span>
        ) : (
          'קלוט כחומר עזר'
        )}
      </button>

      <select
        value={selectedProjectByClipId[clip.id] || ''}
        onChange={(e) =>
          setSelectedProjectByClipId((prev) => ({
            ...prev,
            [clip.id]: e.target.value || null,
          }))
        }
        disabled={busyClipId === clip.id || isProcessing(clip)}
        className="select select-sm select-bordered dark:bg-slate-800 dark:border-slate-600 disabled:opacity-50"
      >
        <option value="">ללא פרויקט</option>
        {projects.map((proj) => (
          <option key={proj.id} value={proj.id}>
            {proj.name}
          </option>
        ))}
      </select>

      <button
        onClick={() => handleRouteSource(clip)}
        disabled={busyClipId === clip.id || isProcessing(clip) || !selectedProjectByClipId[clip.id]}
        className="btn btn-sm btn-outline disabled:opacity-50"
      >
        {busyClipId === clip.id ? (
          <span className="loading loading-spinner loading-xs"></span>
        ) : (
          'צרף כמקור'
        )}
      </button>

      <button
        onClick={() => handleDiscard(clip)}
        disabled={busyClipId === clip.id || isProcessing(clip)}
        className="btn btn-sm btn-ghost text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
      >
        מחק
      </button>
    </div>
  );

  const previewClip = clips.find((c) => c.id === previewClipId) || null;
  const processingClipId = activeIngest?.clipId || null;
  const processingListed = Boolean(processingClipId && clips.some((c) => c.id === processingClipId));

  // שורת "בעיבוד" — אותה צורה בין קליפ שמופיע ברשימה לקליפ שנקלט ברקע ולא מופיע
  // בה בכלל. אין בה פעולות בכוונה: הקליפ נמצא כרגע בעבודה.
  const renderProcessingRow = (info, key) => (
    <div key={key} className="px-6 py-4 bg-blue-50/60 dark:bg-blue-900/15">
      <div className="flex items-start gap-3">
        <div className="w-[72px] h-[96px] flex-shrink-0 rounded-lg border border-blue-200 dark:border-blue-800 bg-white/60 dark:bg-slate-800 flex items-center justify-center">
          <span className="loading loading-spinner loading-sm text-blue-500"></span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 dark:text-white truncate">
            {info?.title || '(בלי שם)'}
          </h3>
          <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
            בעיבוד · {ingestPhaseLabel(info)}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            אפשר להשאיר את החלון פתוח — העבודה ממשיכה ברקע.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] mx-4 flex flex-col border border-slate-200 dark:border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            📥 קליפים מהדפדפן
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition text-xl"
            aria-label="סגור"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <span className="loading loading-spinner loading-md"></span>
            </div>
          ) : clips.length === 0 && !activeIngest ? (
            <div className="flex items-center justify-center h-32 text-slate-500 dark:text-slate-400 text-center px-4">
              <p>אין קליפים ממתינים. שלח משהו מהתוסף 📎</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {activeIngest && !processingListed ? renderProcessingRow(activeIngest, 'active-ingest') : null}
              {clips.map((clip) => (clip.id === processingClipId ? renderProcessingRow(
                { ...activeIngest, title: activeIngest?.title || clip.title },
                clip.id,
              ) : (
                <div
                  key={clip.id}
                  className="px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                >
                  {/* Clip row header */}
                  <div className="flex items-start gap-3 mb-2">
                    <ClipPreviewThumb
                      user={user}
                      clip={clip}
                      onOpen={() => setPreviewClipId(clip.id)}
                      onPreviewLoaded={handlePreviewLoaded}
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 dark:text-white truncate">
                        {clip.title || '(בלי שם)'}
                      </h3>
                      {clip.status === 'error' && (
                        <p className="text-xs text-rose-600 dark:text-rose-400 mt-0.5">
                          הקליטה נכשלה: {clip.errorMessage || 'שגיאה לא ידועה'} — אפשר לנסות שוב מכאן.
                        </p>
                      )}
                      <div className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <a
                          href={clip.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline text-blue-600 dark:text-blue-400 truncate"
                        >
                          {clip.domain}
                        </a>
                        {clip.createdAt && (
                          <span className="text-xs flex-shrink-0">
                            {typeof clip.createdAt?.toDate === 'function'
                              ? clip.createdAt.toDate().toLocaleDateString('he-IL')
                              : clip.createdAt instanceof Date
                                ? clip.createdAt.toLocaleDateString('he-IL')
                                : new Date(clip.createdAt).toLocaleDateString('he-IL')}
                          </span>
                        )}
                      </div>
                      {/* שורת מטא — מתמלאת כשהתצוגה המקדימה מוכנה */}
                      {(() => {
                        const preview = previewByClipId[clip.id];
                        if (!preview) return null;
                        const parts = [
                          clip.fileName || preview.fileName || '',
                          formatByteSize(preview.byteSize),
                          preview.pageCount ? `${preview.pageCount} עמודים` : '',
                        ].filter(Boolean);
                        if (!parts.length) return null;
                        return (
                          <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                            {parts.join(' · ')}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Text snippet */}
                  {(clip.text || previewByClipId[clip.id]?.textSnippet) && (
                    <p className="text-sm text-slate-700 dark:text-slate-300 mb-3 line-clamp-2 whitespace-pre-wrap break-words">
                      {String(clip.text || previewByClipId[clip.id]?.textSnippet || '').substring(0, 140)}
                      {String(clip.text || previewByClipId[clip.id]?.textSnippet || '').length > 140 ? '...' : ''}
                    </p>
                  )}

                  {/* כשל תצוגה מקדימה — לא חוסם קליטה, רק מדווח */}
                  {previewByClipId[clip.id]?.error && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                      {previewByClipId[clip.id].error}
                    </p>
                  )}

                  {/* Actions */}
                  {renderClipActions(clip)}
                </div>
              )))}
            </div>
          )}
        </div>

        {/* Footer — תפקיד המכשיר */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={clientRole === 'consumer'}
              onChange={(e) => handleRoleToggle(e.target.checked)}
            />
            <span>המכשיר הזה קולט קליפים (OCR וקליטה לחומרים)</span>
          </label>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            כבה בטלפון כדי שהקליפים יחכו למחשב במקום להיקלט כאן.
          </p>

          <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 dark:text-slate-300 mt-3">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={requireReview}
              onChange={(e) => handleReviewToggle(e.target.checked)}
            />
            <span>שאל אותי לפני שקליפ נכנס לעבודה</span>
          </label>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            כשמסומן, כל קליפ ממתין כאן לאישור — בלי OCR ובלי קליטה אוטומטית.
          </p>

          <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 dark:text-slate-300 mt-3">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={autoOcr}
              onChange={(e) => handleAutoOcrToggle(e.target.checked)}
            />
            <span>הרץ OCR אוטומטית על קבצים סרוקים</span>
          </label>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            זיהוי טקסט עולה כ-8 שניות לעמוד. כשכבוי, הקובץ נקלט מיד ומופיע במסך הבית
            עם כפתור "הרץ OCR עכשיו". בכל מקרה קובץ מעל {AUTO_OCR_MAX_PAGES} עמודים לא מתחיל לבד.
          </p>
        </div>
      </div>

      {previewClip && (
        <ClipPreviewModal
          user={user}
          clip={previewClip}
          preview={previewByClipId[previewClip.id]}
          onClose={() => setPreviewClipId(null)}
        >
          {renderClipActions(previewClip)}
        </ClipPreviewModal>
      )}
    </div>
  );
}
