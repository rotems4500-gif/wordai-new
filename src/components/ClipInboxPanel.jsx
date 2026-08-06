import { useEffect, useState } from 'react';
import {
  listInboxClips,
  routeInboxClip,
  discardInboxClip,
  CLIP_INGESTED_EVENT,
} from '../services/clipInboxService';
import { listProjects } from '../services/projectService';
import { showToast } from '../services/uiFeedback';

export default function ClipInboxPanel({ user, open, onClose }) {
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [selectedProjectByClipId, setSelectedProjectByClipId] = useState({});
  const [busyClipId, setBusyClipId] = useState(null);

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

  const handleRouteMaterial = async (clip) => {
    if (!user || busyClipId) return;
    setBusyClipId(clip.id);
    try {
      const result = await routeInboxClip(user, clip, {
        destination: 'material',
        projectId: selectedProjectByClipId[clip.id] || null,
      });
      showToast(`נקלט: ${result.chunkCount || 0} קטעים`, { tone: 'info' });
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
    if (!user || !projectId || busyClipId) return;
    setBusyClipId(clip.id);
    try {
      await routeInboxClip(user, clip, {
        destination: 'source',
        projectId,
      });
      showToast('צורף כמקור לפרויקט', { tone: 'info' });
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
    if (!user) return;
    const confirmed = window.confirm('האם אתה בטוח שברצונך למחוק קליפ זה?');
    if (!confirmed) return;

    setBusyClipId(clip.id);
    try {
      await discardInboxClip(user, clip);
      showToast('הקליפ נמחק', { tone: 'info' });
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
          ) : clips.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-slate-500 dark:text-slate-400 text-center px-4">
              <p>אין קליפים ממתינים. שלח משהו מהתוסף 📎</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {clips.map((clip) => (
                <div
                  key={clip.id}
                  className="px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                >
                  {/* Clip row header */}
                  <div className="flex items-start gap-3 mb-2">
                    <span className="text-lg flex-shrink-0">
                      {clip.kind === 'image' ? '🖼️' : '📄'}
                    </span>
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
                    </div>
                  </div>

                  {/* Text snippet */}
                  {clip.text && (
                    <p className="text-sm text-slate-700 dark:text-slate-300 mb-3 line-clamp-2 whitespace-pre-wrap break-words">
                      {clip.text.substring(0, 140)}
                      {clip.text.length > 140 ? '...' : ''}
                    </p>
                  )}

                  {/* Image note */}
                  {clip.kind === 'image' && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 italic">
                      התמונה תעבור זיהוי טקסט (OCR) בקליטה
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Material button */}
                    <button
                      onClick={() => handleRouteMaterial(clip)}
                      disabled={busyClipId === clip.id}
                      className="btn btn-sm btn-primary text-white disabled:opacity-50"
                    >
                      {busyClipId === clip.id ? (
                        <span className="loading loading-spinner loading-xs"></span>
                      ) : (
                        'קלוט כחומר עזר'
                      )}
                    </button>

                    {/* Project selector */}
                    <select
                      value={selectedProjectByClipId[clip.id] || ''}
                      onChange={(e) =>
                        setSelectedProjectByClipId((prev) => ({
                          ...prev,
                          [clip.id]: e.target.value || null,
                        }))
                      }
                      disabled={busyClipId === clip.id}
                      className="select select-sm select-bordered dark:bg-slate-800 dark:border-slate-600 disabled:opacity-50"
                    >
                      <option value="">ללא פרויקט</option>
                      {projects.map((proj) => (
                        <option key={proj.id} value={proj.id}>
                          {proj.name}
                        </option>
                      ))}
                    </select>

                    {/* Source button (enabled only if project selected) */}
                    <button
                      onClick={() => handleRouteSource(clip)}
                      disabled={
                        busyClipId === clip.id || !selectedProjectByClipId[clip.id]
                      }
                      className="btn btn-sm btn-outline disabled:opacity-50"
                    >
                      {busyClipId === clip.id ? (
                        <span className="loading loading-spinner loading-xs"></span>
                      ) : (
                        'צרף כמקור'
                      )}
                    </button>

                    {/* Delete button */}
                    <button
                      onClick={() => handleDiscard(clip)}
                      disabled={busyClipId === clip.id}
                      className="btn btn-sm btn-ghost text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
                    >
                      מחק
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
