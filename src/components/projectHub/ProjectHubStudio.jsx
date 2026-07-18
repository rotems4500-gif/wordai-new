import React, { useCallback, useEffect, useState } from 'react';
import {
  getProject,
  getProjectDocuments,
  renameProject,
  updateProjectMeta,
  computeProjectProgress,
  PROJECTS_UPDATED_EVENT,
  PROJECT_STATUSES,
} from '../../services/projectService';
import {
  generateProjectRoadmap,
  applyTemplateRoadmap,
  buildMilestoneDocPrompt,
} from '../../services/projectRoadmapService';
import { showToast, showConfirm } from '../../services/uiFeedback';
import ProjectSettingsModal from '../ProjectSettingsModal';
import ProjectBrainstormPanel from '../ProjectBrainstormPanel';
import ProjectRoadmap from './ProjectRoadmap';
import ProjectAdvisorCard from './ProjectAdvisorCard';
import ProjectHubDocsPanel from './ProjectHubDocsPanel';
import RoadmapSetupDialog from './RoadmapSetupDialog';
import { ProgressRing, PROJECT_TYPE_LABELS, deadlineTone, deadlineToneClass } from './projectHubUtils';

const PROJECT_STATUS_LABELS = { active: 'פעיל', done: 'הושלם', archived: 'בארכיון' };

function revealClass(mounted, extra = '') {
  return [
    'transition-all duration-500 ease-out',
    mounted ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
    extra,
  ].filter(Boolean).join(' ');
}

// ProjectHubStudio — מסך מלא-מסך של "מרכז הפרויקט": מתווה עבודה (roadmap), יועץ AI,
// ומסמכי הפרויקט. שאר הרכיבים הקיימים (ProjectSettingsModal / ProjectBrainstormPanel)
// נטענים מכאן כ-overlay באותם props כמו ב-StartScreen — הם לא משתנים.
export default function ProjectHubStudio({ projectId, onExit = () => {}, onOpenDocument = () => {}, onGenerateDocForMilestone = () => {}, onOpenHelp = null }) {
  const [project, setProject] = useState(() => getProject(projectId));
  const [docs, setDocs] = useState(() => getProjectDocuments(projectId));
  const [mounted, setMounted] = useState(false);
  const [renamingProject, setRenamingProject] = useState(false);
  const [nameDraft, setNameDraft] = useState(project?.name || '');
  const [showSettings, setShowSettings] = useState(false);
  const [showBrainstorm, setShowBrainstorm] = useState(false);
  const [roadmapDialogOpen, setRoadmapDialogOpen] = useState(false);

  const refresh = useCallback(() => {
    setProject(getProject(projectId));
    setDocs(getProjectDocuments(projectId));
  }, [projectId]);

  useEffect(() => {
    refresh();
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [refresh]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.addEventListener(PROJECTS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(PROJECTS_UPDATED_EVENT, refresh);
  }, [refresh]);

  useEffect(() => {
    if (project && !renamingProject) setNameDraft(project.name);
  }, [project, renamingProject]);

  useEffect(() => {
    if (!project) {
      const timer = setTimeout(() => onExit(), 50);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [project, onExit]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      if (showSettings || showBrainstorm || roadmapDialogOpen) return;
      onExit();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onExit, showSettings, showBrainstorm, roadmapDialogOpen]);

  const canOpenDocs = typeof window !== 'undefined' && typeof window.desktopApp?.openDocumentByPath === 'function';

  const handleOpenDoc = async (doc) => {
    const filePath = String(doc?.filePath || '').trim();
    if (!filePath || !canOpenDocs) return;
    try {
      const result = await window.desktopApp.openDocumentByPath(filePath);
      if (result?.ok === false) {
        showToast(result.error || 'לא ניתן לפתוח את הקובץ', { tone: 'error' });
        return;
      }
      await onOpenDocument(result);
    } catch (error) {
      showToast(error?.message || 'קרתה שגיאה בזמן פתיחת הקובץ', { tone: 'error' });
    }
  };

  const handleRenameCommit = () => {
    const clean = String(nameDraft || '').trim();
    setRenamingProject(false);
    if (clean && project && clean !== project.name) renameProject(project.id, clean);
    else setNameDraft(project?.name || '');
  };

  const handleCreateDocForMilestone = (milestone) => {
    onGenerateDocForMilestone({
      projectId: project.id,
      milestoneId: milestone.id,
      prompt: buildMilestoneDocPrompt(project, milestone),
      projectName: project.name,
    });
  };

  const handleOpenRoadmapDialog = async () => {
    if (project?.milestones?.length) {
      const confirmed = await showConfirm(
        'יצירת מתווה חדש תחליף את השלבים הקיימים. להמשיך?',
        { title: 'יצירת מתווה מחדש', confirmLabel: 'המשך', tone: 'danger' },
      );
      if (!confirmed) return;
    }
    setRoadmapDialogOpen(true);
  };

  const handleRoadmapSubmit = async ({ projectType, goal, targetDate, wordTarget, mode }) => {
    try {
      updateProjectMeta(project.id, { projectType, goal, targetDate, wordTarget });
      if (mode === 'template') {
        await applyTemplateRoadmap(project.id);
        showToast('נבנה מתווה מתבנית סמינריון — אפשר לערוך כל שלב', { tone: 'success' });
      } else {
        const result = await generateProjectRoadmap(project.id, { hints: goal });
        if (result?.usedFallback) {
          showToast('נוצר מתווה בסיסי מהתבנית — אפשר לערוך', { tone: 'warning' });
        } else {
          showToast('מתווה העבודה נוצר בהצלחה', { tone: 'success' });
        }
      }
      setRoadmapDialogOpen(false);
      refresh();
    } catch (err) {
      showToast(err?.message || 'יצירת המתווה נכשלה', { tone: 'error' });
    }
  };

  if (!project) {
    return (
      <div className="flex h-full min-h-[100dvh] w-full flex-col items-center justify-center gap-3 text-center" dir="rtl" style={{ background: 'radial-gradient(125% 120% at 82% -8%, #14304a 0%, #0d1b2e 46%, #0a1422 100%)' }}>
        <div className="text-4xl">🗂️</div>
        <div className="text-[15px] font-bold text-white">הפרויקט לא נמצא</div>
        <div className="text-[12.5px] text-[#8ba3bd]">חוזרים למסך הבית…</div>
      </div>
    );
  }

  const progress = computeProjectProgress(project, docs);
  const tone = deadlineTone(progress.daysToDeadline);
  const docsById = Object.fromEntries(docs.map((d) => [String(d.id), d]));
  const recentActivity = [...(project.activityLog || [])].slice(-5).reverse();

  return (
    <div className="flex h-full min-h-[100dvh] w-full flex-col overflow-hidden" dir="rtl" style={{ background: 'radial-gradient(125% 120% at 82% -8%, #14304a 0%, #0d1b2e 46%, #0a1422 100%)' }}>
      {/* Header */}
      <div className="shrink-0 border-b border-white/10 bg-white/[0.03] px-5 py-3.5 backdrop-blur-sm md:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {renamingProject ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={handleRenameCommit}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRenameCommit(); if (e.key === 'Escape') setRenamingProject(false); }}
                className="min-w-0 max-w-xs rounded-lg border border-cyan-300/40 bg-white/10 px-2 py-1 text-[17px] font-bold text-white outline-none"
              />
            ) : (
              <button type="button" onClick={() => setRenamingProject(true)} className="min-w-0 truncate text-[17px] font-bold text-[#f1f6fb] hover:underline" title="שנה שם">
                {project.name}
              </button>
            )}
            {project.projectType && (
              <span className="shrink-0 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10.5px] font-semibold text-[#cfe0ef]">
                {PROJECT_TYPE_LABELS[project.projectType] || project.projectType}
              </span>
            )}
            {Number.isFinite(progress.daysToDeadline) && (
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold ${deadlineToneClass(tone)}`}>
                {progress.daysToDeadline >= 0 ? `עוד ${progress.daysToDeadline} ימים ליעד` : 'עבר היעד'}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <select
              value={project.status}
              onChange={(e) => updateProjectMeta(project.id, { status: e.target.value })}
              className="rounded-lg border border-white/15 bg-slate-900 px-2 py-1.5 text-[11.5px] text-white/85 outline-none"
              title="סטטוס פרויקט"
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>{PROJECT_STATUS_LABELS[s] || s}</option>
              ))}
            </select>
            <button type="button" onClick={() => setShowBrainstorm(true)} title="שיחת תכנון" className="rounded-lg border border-cyan-200/25 bg-cyan-500/15 px-2.5 py-1.5 text-[12px] font-semibold text-cyan-100 transition hover:bg-cyan-500/25">
              🧭
            </button>
            <button type="button" onClick={() => setShowSettings(true)} title="הגדרות פרויקט" className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 text-[12px] text-white/85 transition hover:bg-white/15">
              ⚙️
            </button>
            <button
              type="button"
              onClick={onExit}
              className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-[12px] font-semibold text-white/85 transition hover:bg-white/15"
            >
              חזרה למסך הבית
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto w-full max-w-7xl flex-1 overflow-y-auto px-5 py-6 md:px-8">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_1fr_280px]">
          {/* Right col: overview + advisor + activity */}
          <div className={revealClass(mounted, 'flex flex-col gap-4')}>
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-4">
              <ProgressRing percent={progress.percent} label={`${progress.doneCount}/${progress.totalCount} שלבים`} />
              {Boolean(progress.wordTarget) && (
                <div className="w-full">
                  <div className="mb-1 flex items-center justify-between text-[10.5px] text-[#8ba3bd]">
                    <span>מילים</span>
                    <span>{progress.wordsWritten} / {progress.wordTarget}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-l from-cyan-400 to-teal-300 transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.round((progress.wordsWritten / Math.max(1, progress.wordTarget)) * 100))}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <ProjectAdvisorCard project={project} />

            {Boolean(recentActivity.length) && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                <div className="mb-2 text-[11.5px] font-bold text-[#cfe0ef]">פעילות אחרונה</div>
                <div className="flex flex-col gap-1">
                  {recentActivity.map((entry, idx) => (
                    <div key={`${entry.at}-${idx}`} className="text-[10.5px] leading-5 text-[#8ba3bd]">
                      {entry.label}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Center: roadmap */}
          <div className={revealClass(mounted, '')}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[14.5px] font-extrabold text-[#f1f6fb]">מתווה העבודה</div>
              {Boolean(project.milestones?.length) && (
                <button
                  type="button"
                  onClick={handleOpenRoadmapDialog}
                  className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white/85 transition hover:bg-white/15"
                >
                  🔄 צור מתווה מחדש
                </button>
              )}
            </div>

            {project.milestones?.length ? (
              <ProjectRoadmap
                project={project}
                docsById={docsById}
                onOpenDoc={handleOpenDoc}
                onCreateDocForMilestone={handleCreateDocForMilestone}
                canOpenDocs={canOpenDocs}
              />
            ) : (
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-6 py-14 text-center">
                <div className="text-4xl">🧭</div>
                <div className="text-[15px] font-bold text-[#f1f6fb]">בנה מתווה עבודה לפרויקט</div>
                <div className="max-w-sm text-[12.5px] leading-6 text-[#8ba3bd]">
                  חלוקה לשלבים עם יעדי מילים ותאריכים, הנחיה מותאמת לכל שלב, ומעקב התקדמות — נוצר אוטומטית או מתבנית סמינריון.
                </div>
                <button
                  type="button"
                  onClick={handleOpenRoadmapDialog}
                  className="rounded-xl bg-gradient-to-l from-cyan-500 to-teal-400 px-5 py-2.5 text-[13px] font-bold text-slate-950 shadow-lg transition hover:brightness-110"
                >
                  ✨ צור מתווה עבודה
                </button>
              </div>
            )}
          </div>

          {/* Left col: docs panel */}
          <div className={revealClass(mounted, '')}>
            <ProjectHubDocsPanel
              project={project}
              docs={docs}
              onOpenDoc={handleOpenDoc}
              canOpenDocs={canOpenDocs}
              onOpenMaterials={() => setShowSettings(true)}
            />
          </div>
        </div>
      </div>

      {showSettings && (
        <ProjectSettingsModal project={project} onClose={() => setShowSettings(false)} />
      )}

      {showBrainstorm && (
        <ProjectBrainstormPanel
          project={project}
          onClose={() => setShowBrainstorm(false)}
          onTurnIntoWorkDirection={({ brief } = {}) => {
            // אותו מסלול כמו "צור מסמך לשלב": יוצא למסך הבית עם הבריף כפרומפט,
            // והמסמך שייווצר משויך אוטומטית לפרויקט (בלי שלב ספציפי).
            setShowBrainstorm(false);
            onGenerateDocForMilestone({
              projectId: project.id,
              milestoneId: '',
              prompt: `הפרויקט: ${project.name}\n${String(brief || '').trim()}`,
              projectName: project.name,
            });
          }}
        />
      )}

      <RoadmapSetupDialog
        open={roadmapDialogOpen}
        project={project}
        onClose={() => setRoadmapDialogOpen(false)}
        onSubmit={handleRoadmapSubmit}
      />
    </div>
  );
}
