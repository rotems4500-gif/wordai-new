import React, { useEffect, useRef, useState } from 'react';
import {
  getProject,
  updateProjectInstructions,
  attachProjectInstructionFile,
  removeProjectInstructionFile,
  loadProjectScopedMaterials,
  attachMaterialToProject,
  detachMaterialFromProject,
  getProjectMemory,
  removeProjectMemory,
  updateProjectMeta,
  PROJECTS_UPDATED_EVENT,
} from '../services/projectService';
import { ensureLecturerProfilesReady, listLecturerProfiles } from '../services/lecturerProfileStore';
import {
  loadProjectMaterials,
  saveHelperMaterial,
  getInstructionFileAcceptList,
  getHelperMaterialAcceptList,
} from '../services/workspaceLearningService';
import { showToast, showConfirm } from '../services/uiFeedback';

const MEMORY_SOURCE_LABELS = {
  'brainstorm-start': 'שיחת תכנון (מסך הבית)',
  'brainstorm-sidebar': 'שיחת תכנון (בתוך מסמך)',
  'external-link': 'שיחה חיצונית מצורפת',
};

const TABS = [
  { id: 'instructions', label: '📋 הנחיות' },
  { id: 'materials', label: '📎 חומרים' },
  { id: 'memory', label: '💬 שיחות שמורות' },
];

// ProjectSettingsModal — הגדרות פרויקט: הנחיות קבועות, חומרים ייעודיים/משותפים, וזיכרון
// שיחות התכנון שהצטבר. כל שינוי כאן משפיע על הקונטקסט שמוזרק אוטומטית לכל עבודת AI בפרויקט
// (ראה buildProjectContextBlock ב-projectService.js).
export default function ProjectSettingsModal({ project: initialProject, onClose = () => {} }) {
  const [project, setProject] = useState(initialProject);
  const [activeTab, setActiveTab] = useState('instructions');
  const [instructionsDraft, setInstructionsDraft] = useState(String(initialProject?.instructions || ''));
  const [scopedMaterials, setScopedMaterials] = useState([]);
  const [globalMaterials, setGlobalMaterials] = useState([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [expandedMemoryId, setExpandedMemoryId] = useState(null);
  const [courseDraft, setCourseDraft] = useState(String(initialProject?.courseName || ''));
  const [lecturerDraft, setLecturerDraft] = useState(String(initialProject?.lecturerName || ''));
  const [knownLecturers, setKnownLecturers] = useState([]);
  const instructionFileInputRef = useRef(null);
  const materialFileInputRef = useRef(null);

  const instructionFileAcceptList = typeof getInstructionFileAcceptList === 'function' ? getInstructionFileAcceptList() : '';
  const helperMaterialAcceptList = typeof getHelperMaterialAcceptList === 'function' ? getHelperMaterialAcceptList() : '';

  const refreshProject = () => {
    const fresh = getProject(initialProject?.id);
    if (fresh) setProject(fresh);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.addEventListener(PROJECTS_UPDATED_EVENT, refreshProject);
    return () => window.removeEventListener(PROJECTS_UPDATED_EVENT, refreshProject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshMaterials = async () => {
    if (!project?.id) return;
    setLoadingMaterials(true);
    try {
      const [scoped, all] = await Promise.all([
        loadProjectScopedMaterials(project.id),
        typeof loadProjectMaterials === 'function' ? loadProjectMaterials() : Promise.resolve([]),
      ]);
      setScopedMaterials(scoped);
      const scopedIds = new Set(scoped.map((m) => String(m.id || '')));
      setGlobalMaterials(all.filter((m) => !m.projectId && !scopedIds.has(String(m.id || ''))));
    } catch (error) {
      showToast(error?.message || 'שגיאה בטעינת חומרים', { tone: 'error' });
    } finally {
      setLoadingMaterials(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'materials') refreshMaterials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, project?.id]);

  useEffect(() => {
    let alive = true;
    Promise.resolve(ensureLecturerProfilesReady())
      .then(() => { if (alive) setKnownLecturers(listLecturerProfiles()); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // שיוך קורס/מרצה — מפתח הרזולוציה של לקחי המרצים. נשמר ב-blur.
  const handleSaveCourseLecturer = () => {
    if (!project?.id) return;
    if (courseDraft === (project.courseName || '') && lecturerDraft === (project.lecturerName || '')) return;
    updateProjectMeta(project.id, { courseName: courseDraft, lecturerName: lecturerDraft });
    refreshProject();
    showToast('השיוך נשמר', { tone: 'success' });
  };

  const handleSaveInstructions = () => {
    updateProjectInstructions(project.id, instructionsDraft);
    showToast('ההנחיות נשמרו', { tone: 'success' });
  };

  const handleInstructionFileUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      await attachProjectInstructionFile(project.id, file);
      showToast(`קובץ ההנחיות "${file.name}" נטען`, { tone: 'success' });
      refreshProject();
    } catch (error) {
      showToast(error?.message || 'לא הצלחתי לקרוא את קובץ ההנחיות', { tone: 'error' });
    }
  };

  const handleRemoveInstructionFile = () => {
    removeProjectInstructionFile(project.id);
    refreshProject();
  };

  const handleMaterialUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      await saveHelperMaterial(file, { uploadKind: 'general', projectId: project.id });
      showToast(`הקובץ "${file.name}" נוסף לפרויקט`, { tone: 'success' });
      await refreshMaterials();
    } catch (error) {
      showToast(error?.message || 'לא הצלחתי להעלות את הקובץ', { tone: 'error' });
    }
  };

  const handleAttachExisting = (material) => {
    attachMaterialToProject(project.id, material.id);
    refreshMaterials();
  };

  const handleDetach = (material) => {
    detachMaterialFromProject(project.id, material.id);
    refreshMaterials();
  };

  const handleDeleteMemory = async (memory) => {
    const confirmed = await showConfirm(
      `למחוק את הזיכרון "${memory.title || 'שיחה ללא כותרת'}"?`,
      { title: 'מחיקת זיכרון שיחה', confirmLabel: 'מחק', tone: 'danger' },
    );
    if (!confirmed) return;
    removeProjectMemory(project.id, memory.id);
    refreshProject();
  };

  if (!project) return null;
  const memoryList = [...(getProjectMemory(project.id) || [])].reverse();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        dir="rtl"
        className="max-h-[88vh] w-[680px] max-w-[96vw] overflow-y-auto rounded-[24px] border border-white/20 bg-slate-900 p-6 text-right shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-xl font-bold text-white">⚙️ הגדרות פרויקט: {project.name}</div>
            <div className="mt-1 text-[12.5px] text-slate-400">הנחיות, חומרים וזיכרון שיוזרקו אוטומטית לכל עבודת AI בפרויקט הזה.</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white">✕</button>
        </div>

        <div className="mb-4 flex gap-1 rounded-2xl bg-white/5 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 rounded-xl px-3 py-2 text-[13px] font-bold transition ${activeTab === tab.id ? 'bg-cyan-500/25 text-cyan-100' : 'text-slate-300 hover:bg-white/5'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'instructions' && (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="mb-2 text-[12.5px] font-semibold text-white">שיוך אקדמי</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11.5px] text-slate-300">
                  קורס
                  <input
                    value={courseDraft}
                    onChange={(e) => setCourseDraft(e.target.value)}
                    onBlur={handleSaveCourseLecturer}
                    placeholder="שם הקורס"
                    className="mt-1 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[12.5px] text-white placeholder-white/40 outline-none focus:border-transparent focus:ring-1 focus:ring-cyan-300"
                  />
                </label>
                <label className="text-[11.5px] text-slate-300">
                  מרצה
                  <input
                    list="wf-project-lecturer-names"
                    value={lecturerDraft}
                    onChange={(e) => setLecturerDraft(e.target.value)}
                    onBlur={handleSaveCourseLecturer}
                    placeholder="שם המרצה"
                    className="mt-1 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[12.5px] text-white placeholder-white/40 outline-none focus:border-transparent focus:ring-1 focus:ring-cyan-300"
                  />
                  <datalist id="wf-project-lecturer-names">
                    {knownLecturers.map((l) => <option key={l.id} value={l.name} />)}
                  </datalist>
                </label>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">שיוך למרצה מפעיל את הלקחים שנלמדו ממנו בכתיבה בפרויקט הזה.</div>
            </div>

            <textarea
              value={instructionsDraft}
              onChange={(e) => setInstructionsDraft(e.target.value)}
              onBlur={handleSaveInstructions}
              placeholder="הנחיות קבועות שיחולו על כל מסמך בפרויקט הזה..."
              className="min-h-[140px] w-full resize-y rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white placeholder-white/50 outline-none focus:border-transparent focus:ring-1 focus:ring-cyan-300"
            />
            <div className="flex justify-end">
              <button type="button" onClick={handleSaveInstructions} className="rounded-lg bg-cyan-500/80 px-4 py-1.5 text-[12.5px] font-bold text-white transition hover:bg-cyan-500">שמור הנחיות</button>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="mb-2 text-[12.5px] font-semibold text-white">קובץ הנחיות</div>
              {project.instructionFileName ? (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-[12px] text-slate-200">{project.instructionFileName}</span>
                  <button type="button" onClick={handleRemoveInstructionFile} className="shrink-0 text-[11px] text-rose-300 hover:text-rose-200">הסר</button>
                </div>
              ) : (
                <div className="text-[11.5px] text-slate-400">לא הועלה קובץ הנחיות עדיין.</div>
              )}
              <button
                type="button"
                onClick={() => instructionFileInputRef.current?.click()}
                className="mt-2 rounded-lg border border-fuchsia-200/30 bg-fuchsia-500/15 px-3 py-1.5 text-[11.5px] font-semibold text-fuchsia-100 transition hover:bg-fuchsia-500/25"
              >
                העלה קובץ הנחיות
              </button>
              <input ref={instructionFileInputRef} type="file" accept={instructionFileAcceptList} className="hidden" onChange={handleInstructionFileUpload} />
            </div>
          </div>
        )}

        {activeTab === 'materials' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-[12.5px] font-semibold text-white">חומרי הפרויקט</div>
              <button
                type="button"
                onClick={() => materialFileInputRef.current?.click()}
                className="rounded-lg border border-cyan-200/30 bg-cyan-500/15 px-3 py-1.5 text-[11.5px] font-semibold text-cyan-100 transition hover:bg-cyan-500/25"
              >
                הוסף קובץ עזר
              </button>
              <input ref={materialFileInputRef} type="file" accept={helperMaterialAcceptList} className="hidden" onChange={handleMaterialUpload} />
            </div>

            {loadingMaterials && <div className="text-[11.5px] text-slate-400">טוען...</div>}

            {!loadingMaterials && !scopedMaterials.length && (
              <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.04] px-3 py-3 text-[11.5px] text-slate-400">אין עדיין חומרים בפרויקט הזה.</div>
            )}

            <div className="flex flex-col gap-1.5">
              {scopedMaterials.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-[12px] text-slate-200">{m.title} <span className="text-slate-500">({m.label || 'כללי'})</span></span>
                  <button type="button" onClick={() => handleDetach(m)} className="shrink-0 text-[11px] text-rose-300 hover:text-rose-200">הסר מהפרויקט</button>
                </div>
              ))}
            </div>

            {Boolean(globalMaterials.length) && (
              <div className="mt-2 border-t border-white/10 pt-3">
                <div className="mb-2 text-[12.5px] font-semibold text-white">צרף חומר קיים</div>
                <div className="flex flex-col gap-1.5">
                  {globalMaterials.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-[12px] text-slate-200">{m.title} <span className="text-slate-500">({m.label || 'כללי'})</span></span>
                      <button type="button" onClick={() => handleAttachExisting(m)} className="shrink-0 text-[11px] text-cyan-300 hover:text-cyan-200">צרף</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'memory' && (
          <div className="flex flex-col gap-2">
            {!memoryList.length && (
              <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.04] px-3 py-3 text-[11.5px] text-slate-400">אין עדיין שיחות תכנון שמורות בפרויקט הזה.</div>
            )}
            {memoryList.map((memory) => {
              const isExpanded = expandedMemoryId === memory.id;
              const createdAt = memory.createdAt ? new Date(memory.createdAt) : null;
              const dateLabel = createdAt && !Number.isNaN(createdAt.getTime())
                ? createdAt.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })
                : '';
              return (
                <div key={memory.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => setExpandedMemoryId(isExpanded ? null : memory.id)} className="min-w-0 flex-1 text-right">
                      <div className="text-[13px] font-bold text-white">{memory.title || 'שיחה ללא כותרת'}</div>
                      <div className="mt-0.5 text-[10.5px] text-slate-400">{MEMORY_SOURCE_LABELS[memory.source] || 'שיחה'}{dateLabel ? ` · ${dateLabel}` : ''}</div>
                    </button>
                    <button type="button" onClick={() => handleDeleteMemory(memory)} className="shrink-0 text-[11px] text-rose-300 hover:text-rose-200">מחק</button>
                  </div>
                  {isExpanded && (
                    <div className="mt-2 whitespace-pre-wrap border-t border-white/10 pt-2 text-[12px] leading-6 text-slate-200">{memory.summary}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
