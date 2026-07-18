import React, { useState } from 'react';
import {
  updateMilestone,
  reorderMilestone,
  removeMilestone,
  addMilestone,
  toggleMilestoneTask,
  addMilestoneTask,
  removeMilestoneTask,
} from '../../services/projectService';
import { getMilestoneGuidance } from '../../services/projectRoadmapService';
import { showConfirm, showToast } from '../../services/uiFeedback';
import { MILESTONE_STATUS_META, formatDateHe, nextMilestoneStatus } from './projectHubUtils';

// ProjectRoadmap — ציר זמן אנכי RTL של אבני הדרך. כל מוטציה קוראת ל-projectService
// ישירות; הרענון קורה דרך PROJECTS_UPDATED_EVENT שההורה מאזין לו (אין state מקומי
// שמשקף את הדאטה — רק state של UI: עריכה פתוחה, טיוטת טקסט וכו').

function sumWords(milestone, docsById) {
  const ids = Array.isArray(milestone?.docHistoryIds) ? milestone.docHistoryIds : [];
  let total = 0;
  let anyCounted = false;
  ids.forEach((id) => {
    const doc = docsById?.[id];
    if (doc && Number.isFinite(+doc.wordCount)) {
      total += Math.max(0, Math.round(+doc.wordCount));
      anyCounted = true;
    }
  });
  return anyCounted ? total : null;
}

function MilestoneCard({
  milestone,
  index,
  total,
  project,
  docsById,
  onOpenDoc,
  onCreateDocForMilestone,
  canOpenDocs,
}) {
  const meta = MILESTONE_STATUS_META[milestone.status] || MILESTONE_STATUS_META.todo;
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(milestone.title);
  const [editingDate, setEditingDate] = useState(false);
  const [dateDraft, setDateDraft] = useState(milestone.targetDate || '');
  const [descExpanded, setDescExpanded] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [guidanceLoading, setGuidanceLoading] = useState(false);
  const [guidanceText, setGuidanceText] = useState(milestone.aiTips || '');

  const writtenWords = sumWords(milestone, docsById);

  const commitTitle = () => {
    const clean = String(titleDraft || '').trim();
    setEditingTitle(false);
    if (clean && clean !== milestone.title) updateMilestone(project.id, milestone.id, { title: clean });
    else setTitleDraft(milestone.title);
  };

  const commitDate = () => {
    setEditingDate(false);
    if (dateDraft !== milestone.targetDate) updateMilestone(project.id, milestone.id, { targetDate: dateDraft });
  };

  const handleDelete = async () => {
    const confirmed = await showConfirm(
      `למחוק את השלב "${milestone.title}"?\nהמסמכים המקושרים לא יימחקו.`,
      { title: 'מחיקת שלב', confirmLabel: 'מחק', tone: 'danger' },
    );
    if (!confirmed) return;
    removeMilestone(project.id, milestone.id);
  };

  const handleAddTask = () => {
    const clean = newTaskText.trim();
    if (!clean) return;
    addMilestoneTask(project.id, milestone.id, clean);
    setNewTaskText('');
  };

  const linkedDocs = (milestone.docHistoryIds || []).map((id) => docsById?.[id]).filter(Boolean);

  const loadGuidance = async ({ force = false } = {}) => {
    setGuidanceLoading(true);
    try {
      const text = await getMilestoneGuidance(project.id, milestone.id, { force });
      setGuidanceText(String(text || ''));
    } catch (err) {
      showToast(err?.message || 'טעינת ההנחיה נכשלה', { tone: 'error' });
    } finally {
      setGuidanceLoading(false);
    }
  };

  const handleToggleGuidance = () => {
    const next = !guidanceOpen;
    setGuidanceOpen(next);
    if (next && !guidanceText) loadGuidance();
  };

  const descriptionText = String(milestone.description || '').trim();
  const descriptionIsLong = descriptionText.split('\n').length > 2 || descriptionText.length > 160;

  return (
    <div className="relative flex gap-3 pr-1">
      {/* פס מחבר אנכי מימין (RTL) */}
      <div className="flex w-6 shrink-0 flex-col items-center">
        <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${meta.dot} shadow-[0_0_0_4px_rgba(255,255,255,0.06)]`} />
        {index < total - 1 && <span className="mt-1 w-px flex-1 bg-white/10" />}
      </div>

      <div className="mb-4 flex-1 rounded-2xl border border-white/10 bg-white/[0.045] p-4 shadow-lg transition-all duration-200 hover:border-white/20">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => updateMilestone(project.id, milestone.id, { status: nextMilestoneStatus(milestone.status) })}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[10.5px] font-bold transition ${meta.chip}`}
              title="לחיצה מקדמת את הסטטוס"
            >
              {meta.label}
            </button>
            {editingTitle ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') { setEditingTitle(false); setTitleDraft(milestone.title); } }}
                className="min-w-0 flex-1 rounded-lg border border-cyan-300/40 bg-white/10 px-2 py-1 text-[14px] font-bold text-white outline-none"
              />
            ) : (
              <div
                className="min-w-0 flex-1 cursor-text truncate text-[14.5px] font-bold text-[#f1f6fb]"
                onDoubleClick={() => setEditingTitle(true)}
                title="לחיצה כפולה לעריכה"
              >
                {milestone.title}
              </div>
            )}
            {!editingTitle && (
              <button type="button" onClick={() => setEditingTitle(true)} className="shrink-0 text-[11px] text-[#8ba3bd] hover:text-white">✏️</button>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {editingDate ? (
              <input
                type="date"
                autoFocus
                value={dateDraft}
                onChange={(e) => setDateDraft(e.target.value)}
                onBlur={commitDate}
                className="rounded-lg border border-cyan-300/40 bg-white/10 px-1.5 py-1 text-[11px] text-white outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingDate(true)}
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10.5px] text-[#8ba3bd] transition hover:bg-white/10"
                title="יעד זמן"
              >
                {formatDateHe(milestone.targetDate) || 'קבע תאריך'}
              </button>
            )}
            <button
              type="button"
              disabled={index === 0}
              onClick={() => reorderMilestone(project.id, milestone.id, 'up')}
              className="rounded-lg px-1.5 py-1 text-[11px] text-[#8ba3bd] transition hover:bg-white/10 hover:text-white disabled:opacity-30"
              title="הזז למעלה"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={index === total - 1}
              onClick={() => reorderMilestone(project.id, milestone.id, 'down')}
              className="rounded-lg px-1.5 py-1 text-[11px] text-[#8ba3bd] transition hover:bg-white/10 hover:text-white disabled:opacity-30"
              title="הזז למטה"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg px-1.5 py-1 text-[11px] text-[#8ba3bd] transition hover:bg-rose-500/20 hover:text-rose-200"
              title="מחק שלב"
            >
              🗑️
            </button>
          </div>
        </div>

        {descriptionText && (
          <div className="mt-2 text-[12.5px] leading-6 text-[#a9bfd6]">
            <div className={descExpanded ? '' : 'line-clamp-2'}>{descriptionText}</div>
            {descriptionIsLong && (
              <button type="button" onClick={() => setDescExpanded((v) => !v)} className="mt-0.5 text-[11px] text-cyan-300 hover:text-cyan-200">
                {descExpanded ? 'הצג פחות' : 'הצג עוד'}
              </button>
            )}
          </div>
        )}

        {Boolean(milestone.wordTarget) && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[10.5px] text-[#8ba3bd]">
              <span>מילים</span>
              <span>{writtenWords === null ? '—' : writtenWords} / {milestone.wordTarget}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-l from-cyan-400 to-teal-300 transition-all duration-300"
                style={{ width: `${writtenWords === null ? 0 : Math.min(100, Math.round((writtenWords / Math.max(1, milestone.wordTarget)) * 100))}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-col gap-1">
          {(milestone.tasks || []).map((task) => (
            <div key={task.id} className="group flex items-center gap-2 rounded-lg px-1 py-1 transition hover:bg-white/5">
              <input
                type="checkbox"
                checked={Boolean(task.done)}
                onChange={() => toggleMilestoneTask(project.id, milestone.id, task.id)}
                className="h-3.5 w-3.5 shrink-0 accent-cyan-400"
              />
              <span className={`min-w-0 flex-1 text-[12px] ${task.done ? 'text-[#6f87a1] line-through' : 'text-[#d7e4f0]'}`}>{task.text}</span>
              <button
                type="button"
                onClick={() => removeMilestoneTask(project.id, milestone.id, task.id)}
                className="shrink-0 text-[11px] text-[#6f87a1] opacity-0 transition hover:text-rose-300 group-hover:opacity-100"
              >
                ✕
              </button>
            </div>
          ))}
          <div className="mt-1 flex items-center gap-2">
            <input
              type="text"
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddTask(); }}
              placeholder="+ הוסף משימה"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11.5px] text-white placeholder-white/40 outline-none focus:border-cyan-300/40"
            />
          </div>
        </div>

        {Boolean(linkedDocs.length) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {linkedDocs.map((doc) => (
              <button
                key={doc.id}
                type="button"
                disabled={!canOpenDocs}
                onClick={() => onOpenDoc?.(doc)}
                className={`rounded-lg border px-2 py-1 text-[11px] transition ${canOpenDocs ? 'border-cyan-300/25 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20' : 'cursor-not-allowed border-white/10 bg-white/5 text-[#6f87a1]'}`}
                title={doc.title || 'מסמך'}
              >
                📄 {doc.title || 'מסמך ללא שם'}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => onCreateDocForMilestone?.(milestone)}
            className="rounded-lg border border-emerald-300/25 bg-emerald-500/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-emerald-100 transition hover:bg-emerald-500/20"
          >
            📄 צור מסמך לשלב
          </button>
          <button
            type="button"
            onClick={handleToggleGuidance}
            className="rounded-lg border border-fuchsia-300/25 bg-fuchsia-500/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-fuchsia-100 transition hover:bg-fuchsia-500/20"
          >
            🧭 הנחיה לשלב
          </button>
        </div>

        {guidanceOpen && (
          <div className="mt-3 rounded-xl border border-fuchsia-300/15 bg-fuchsia-500/[0.06] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11.5px] font-bold text-fuchsia-100">הנחיה מותאמת לשלב</span>
              <button
                type="button"
                onClick={() => loadGuidance({ force: true })}
                disabled={guidanceLoading}
                className="text-[11px] text-fuchsia-200 hover:text-fuchsia-100 disabled:opacity-50"
                title="רענן"
              >
                🔄 רענן
              </button>
            </div>
            {guidanceLoading ? (
              <div className="flex items-center gap-2 text-[12px] text-[#a9bfd6]">
                <i className="ph ph-spinner animate-spin" aria-hidden="true" />
                טוען הנחיה…
              </div>
            ) : (
              <div className="whitespace-pre-wrap text-[12px] leading-6 text-[#d7e4f0]">{guidanceText || 'אין עדיין הנחיה — לחצו רענן.'}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProjectRoadmap({ project, docsById, onOpenDoc, onCreateDocForMilestone, canOpenDocs }) {
  const [newTitle, setNewTitle] = useState('');
  const milestones = [...(project?.milestones || [])].sort((a, b) => a.order - b.order);

  const handleAddMilestone = () => {
    const clean = newTitle.trim();
    if (!clean) return;
    addMilestone(project.id, { title: clean });
    setNewTitle('');
  };

  return (
    <div className="flex flex-col">
      {milestones.map((milestone, index) => (
        <MilestoneCard
          key={milestone.id}
          milestone={milestone}
          index={index}
          total={milestones.length}
          project={project}
          docsById={docsById}
          onOpenDoc={onOpenDoc}
          onCreateDocForMilestone={onCreateDocForMilestone}
          canOpenDocs={canOpenDocs}
        />
      ))}

      <div className="flex items-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-3">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAddMilestone(); }}
          placeholder="+ הוסף שלב"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-white placeholder-white/40 outline-none"
        />
        <button
          type="button"
          onClick={handleAddMilestone}
          className="shrink-0 rounded-lg bg-cyan-500/80 px-3 py-1.5 text-[11.5px] font-bold text-white transition hover:bg-cyan-500"
        >
          הוסף
        </button>
      </div>
    </div>
  );
}
