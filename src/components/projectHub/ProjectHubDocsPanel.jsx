import React from 'react';
import { linkDocToMilestone, unlinkDocFromMilestone } from '../../services/projectService';
import { formatDateHe } from './projectHubUtils';

const NO_MILESTONE_KEY = '__none__';

// ProjectHubDocsPanel — רשימת מסמכי הפרויקט מקובצים לפי שלב (milestone.docHistoryIds),
// עם שיוך/הסרה דרך select. מסמכים שאין להם שלב תואם נופלים ל"ללא שלב".
export default function ProjectHubDocsPanel({ project, docs, onOpenDoc, canOpenDocs, onOpenMaterials }) {
  const milestones = project?.milestones || [];
  const docsById = Object.fromEntries((docs || []).map((d) => [String(d.id), d]));

  const milestoneOfDoc = new Map();
  milestones.forEach((m) => {
    (m.docHistoryIds || []).forEach((docId) => milestoneOfDoc.set(String(docId), m.id));
  });

  const groups = new Map();
  milestones.forEach((m) => groups.set(m.id, { milestone: m, docs: [] }));
  groups.set(NO_MILESTONE_KEY, { milestone: null, docs: [] });

  (docs || []).forEach((doc) => {
    const milestoneId = milestoneOfDoc.get(String(doc.id));
    const key = milestoneId && groups.has(milestoneId) ? milestoneId : NO_MILESTONE_KEY;
    groups.get(key).docs.push(doc);
  });

  const handleAssign = (doc, milestoneId) => {
    if (milestoneId) linkDocToMilestone(project.id, milestoneId, doc.id);
    else unlinkDocFromMilestone(project.id, doc.id);
  };

  const orderedGroups = [...milestones.map((m) => groups.get(m.id)), groups.get(NO_MILESTONE_KEY)]
    .filter((g) => g.docs.length || g === groups.get(NO_MILESTONE_KEY));

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
        <div className="mb-3 text-[13.5px] font-extrabold text-[#f1f6fb]">📄 מסמכי הפרויקט</div>

        {!docs?.length && (
          <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-3 py-3 text-center text-[11.5px] text-[#6f87a1]">
            עדיין אין מסמכים בפרויקט הזה.
          </div>
        )}

        <div className="flex flex-col gap-4">
          {orderedGroups.map((group) => {
            const key = group.milestone?.id || NO_MILESTONE_KEY;
            if (!group.docs.length) return null;
            return (
              <div key={key}>
                <div className="mb-1.5 text-[11px] font-bold text-[#8ba3bd]">
                  {group.milestone ? group.milestone.title : 'ללא שלב'}
                </div>
                <div className="flex flex-col gap-1">
                  {group.docs.map((doc) => (
                    <div key={doc.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-white/5">
                      <button
                        type="button"
                        disabled={!canOpenDocs}
                        onClick={() => onOpenDoc?.(doc)}
                        className={`flex min-w-0 flex-1 items-center gap-1.5 text-right ${canOpenDocs ? '' : 'cursor-not-allowed opacity-60'}`}
                        title={doc.title || 'מסמך ללא שם'}
                      >
                        <span className="shrink-0 text-[12px] opacity-75">📄</span>
                        <span className="min-w-0 flex-1 truncate text-[12px] text-[#d7e4f0]">{doc.title || 'מסמך ללא שם'}</span>
                      </button>
                      <span className="shrink-0 text-[10px] text-[#6f87a1]">{formatDateHe(doc.savedAt)}</span>
                      <span className="shrink-0 text-[10px] text-[#6f87a1]">{Number.isFinite(+doc.wordCount) ? `${doc.wordCount} מ׳` : '—'}</span>
                      <select
                        value={group.milestone?.id || ''}
                        onChange={(e) => handleAssign(doc, e.target.value)}
                        title="שייך לשלב…"
                        className="shrink-0 rounded-md border border-white/15 bg-slate-900 px-1 py-0.5 text-[9.5px] text-white/70 outline-none"
                      >
                        <option value="">ללא שלב</option>
                        {milestones.map((m) => (
                          <option key={m.id} value={m.id}>{m.title}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onOpenMaterials?.()}
        className="w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-center text-[12.5px] font-semibold text-[#cfe0ef] transition hover:bg-white/10"
      >
        📎 חומרים ({(project?.materialIds || []).length})
      </button>
    </div>
  );
}
