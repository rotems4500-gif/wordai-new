import React, { useEffect, useState } from 'react';
import {
  listProjects,
  createProject,
  renameProject,
  deleteProject,
  getProjectDocuments,
  assignDocumentToProject,
  unassignDocumentFromProject,
  PROJECTS_UPDATED_EVENT,
} from '../services/projectService';
import { showToast, showConfirm } from '../services/uiFeedback';

// ProjectsPanel — כרטיסי "פרויקטים" בסרגל הצדדי של מסך הבית: יצירה/שינוי שם/מחיקה רכה,
// פתיחת שיחת תכנון (ProjectBrainstormPanel) או מסמך חדש בתוך הפרויקט, וקיבוץ המסמכים
// שכבר משויכים אליו (עם אפשרות להעביר מסמך לפרויקט אחר / להוציא אותו).
export default function ProjectsPanel({
  onOpenProjectBrainstorm = () => {},
  onOpenProjectSettings = () => {},
  onOpenDocument = () => {},
  onNewDocumentInProject = () => {},
}) {
  const [projects, setProjects] = useState(() => listProjects());
  const [expandedId, setExpandedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');

  const refresh = () => setProjects(listProjects());

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.addEventListener(PROJECTS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(PROJECTS_UPDATED_EVENT, refresh);
  }, []);

  const handleCreate = () => {
    const name = String(newName || '').trim();
    createProject({ name });
    setNewName('');
    setCreating(false);
    refresh();
  };

  const handleRenameSubmit = (projectId) => {
    const name = String(renameDraft || '').trim();
    if (name) renameProject(projectId, name);
    setRenamingId(null);
    setRenameDraft('');
    refresh();
  };

  const handleDelete = async (project) => {
    const confirmed = await showConfirm(
      `למחוק את הפרויקט "${project.name}"?\nהמסמכים שבו לא יימחקו — הם יחזרו להיות "ללא פרויקט".`,
      { title: 'מחיקת פרויקט', confirmLabel: 'מחק', tone: 'danger' },
    );
    if (!confirmed) return;
    deleteProject(project.id);
    showToast(`הפרויקט "${project.name}" נמחק`, { tone: 'success' });
    refresh();
  };

  const handleMoveDoc = (doc, targetProjectId) => {
    if (targetProjectId) assignDocumentToProject(doc.id, targetProjectId);
    else unassignDocumentFromProject(doc.id);
    refresh();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-extrabold text-[#cfe0ef]">📁 הפרויקטים שלי</div>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] text-white/85 transition hover:bg-white/15"
        >
          + פרויקט חדש
        </button>
      </div>

      {creating && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') { setCreating(false); setNewName(''); }
            }}
            placeholder="שם הפרויקט"
            className="w-full rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-[12.5px] text-white placeholder-white/50 outline-none focus:ring-1 focus:ring-cyan-300"
          />
          <button
            type="button"
            onClick={handleCreate}
            className="shrink-0 rounded-lg bg-cyan-500/80 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-cyan-500"
          >
            צור
          </button>
        </div>
      )}

      {!projects.length && !creating && (
        <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.04] px-3 py-3 text-[11.5px] text-[#8ba3bd]">
          אין עדיין פרויקטים. פרויקט מקבץ מסמכים, הנחיות קבועות וחומרים תחת הקשר אחד.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {projects.map((project) => {
          const isExpanded = expandedId === project.id;
          const docs = isExpanded ? getProjectDocuments(project.id) : [];
          const docCount = isExpanded ? docs.length : (project.documentIds || []).length;
          const isRenaming = renamingId === project.id;
          return (
            <div key={project.id} className="rounded-xl border border-white/10 bg-white/[0.045] p-2.5">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : project.id)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-right"
                  title="הצג/הסתר מסמכים"
                >
                  <span className="text-[11px] text-[#8ba3bd]">{isExpanded ? '▾' : '▸'}</span>
                  {isRenaming ? (
                    <input
                      type="text"
                      autoFocus
                      value={renameDraft}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') handleRenameSubmit(project.id);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      onBlur={() => handleRenameSubmit(project.id)}
                      className="min-w-0 flex-1 rounded-md border border-cyan-300/50 bg-white/10 px-1.5 py-0.5 text-[12.5px] text-white outline-none"
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#f1f6fb]">{project.name}</span>
                  )}
                </button>
                <button
                  type="button"
                  title="שנה שם"
                  onClick={() => { setRenamingId(project.id); setRenameDraft(project.name); }}
                  className="shrink-0 rounded-md px-1 text-[12px] text-[#8ba3bd] transition hover:bg-white/10 hover:text-white"
                >
                  ✏️
                </button>
              </div>

              <div className="mt-1 text-[10.5px] text-[#6f87a1]">{docCount} מסמכים</div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => onOpenProjectBrainstorm(project)}
                  className="rounded-lg border border-cyan-200/25 bg-cyan-500/15 px-2 py-1 text-[10.5px] font-semibold text-cyan-100 transition hover:bg-cyan-500/25"
                >
                  🧭 שיחת תכנון
                </button>
                <button
                  type="button"
                  onClick={() => onNewDocumentInProject(project)}
                  className="rounded-lg border border-emerald-200/25 bg-emerald-500/15 px-2 py-1 text-[10.5px] font-semibold text-emerald-100 transition hover:bg-emerald-500/25"
                >
                  📄 מסמך חדש
                </button>
                <button
                  type="button"
                  onClick={() => onOpenProjectSettings(project)}
                  title="הגדרות פרויקט"
                  className="rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-[10.5px] text-white/80 transition hover:bg-white/15"
                >
                  ⚙️
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(project)}
                  title="מחק פרויקט"
                  className="rounded-lg border border-rose-300/20 bg-rose-500/10 px-2 py-1 text-[10.5px] text-rose-200 transition hover:bg-rose-500/20"
                >
                  🗑️
                </button>
              </div>

              {isExpanded && (
                <div className="mt-2 flex flex-col gap-1 border-t border-white/10 pt-2">
                  {!docs.length && (
                    <div className="text-[10.5px] text-[#6f87a1]">אין מסמכים בפרויקט הזה עדיין.</div>
                  )}
                  {docs.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-1.5 rounded-lg px-1 py-1 transition hover:bg-white/5">
                      <button
                        type="button"
                        onClick={() => onOpenDocument(doc)}
                        title={doc.title || 'מסמך ללא שם'}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-right"
                      >
                        <span className="text-[11px] opacity-75">📄</span>
                        <span className="min-w-0 flex-1 truncate text-[11.5px] text-[#bcd2e6]">{doc.title || 'מסמך ללא שם'}</span>
                      </button>
                      <select
                        value={project.id}
                        onChange={(e) => handleMoveDoc(doc, e.target.value)}
                        title="העבר לפרויקט…"
                        className="shrink-0 rounded-md border border-white/15 bg-slate-900 px-1 py-0.5 text-[9.5px] text-white/75 outline-none"
                      >
                        <option value="">ללא פרויקט</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
