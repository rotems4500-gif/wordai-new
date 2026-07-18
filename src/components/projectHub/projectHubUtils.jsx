import React from 'react';

// projectHubUtils.js — עזרי תצוגה משותפים ל-Project Hub: פורמט תאריכים, מטא-דאטה
// של סטטוסים, מעגל סטטוס אבן-דרך, וטבעת התקדמות SVG. אין כאן קריאות ל-projectService —
// טהור תצוגה בלבד.

export function formatDateHe(iso) {
  const clean = String(iso || '').trim();
  if (!clean) return '';
  const date = new Date(clean);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

export const MILESTONE_STATUS_META = {
  todo: { label: 'טרם התחיל', dot: 'bg-slate-500', text: 'text-slate-300', chip: 'border-white/15 bg-white/10 text-slate-200' },
  'in-progress': { label: 'בעבודה', dot: 'bg-cyan-400', text: 'text-cyan-200', chip: 'border-cyan-300/30 bg-cyan-500/15 text-cyan-100' },
  review: { label: 'בבדיקה', dot: 'bg-amber-400', text: 'text-amber-200', chip: 'border-amber-300/30 bg-amber-500/15 text-amber-100' },
  done: { label: 'הושלם', dot: 'bg-emerald-400', text: 'text-emerald-200', chip: 'border-emerald-300/30 bg-emerald-500/15 text-emerald-100' },
};

export const PROJECT_TYPE_LABELS = {
  seminar: 'סמינריון',
  assignment: 'עבודה גדולה',
  thesis: 'תזה',
  custom: 'אחר',
};

const MILESTONE_STATUS_CYCLE = ['todo', 'in-progress', 'review', 'done'];

export function nextMilestoneStatus(status) {
  const idx = MILESTONE_STATUS_CYCLE.indexOf(status);
  return MILESTONE_STATUS_CYCLE[(idx < 0 ? 0 : idx + 1) % MILESTONE_STATUS_CYCLE.length];
}

export function deadlineTone(daysToDeadline) {
  if (!Number.isFinite(daysToDeadline)) return null;
  if (daysToDeadline < 7) return 'danger';
  if (daysToDeadline < 14) return 'warn';
  return 'ok';
}

const DEADLINE_TONE_CLASSES = {
  ok: 'border-emerald-300/25 bg-emerald-500/10 text-emerald-200',
  warn: 'border-amber-300/25 bg-amber-500/10 text-amber-200',
  danger: 'border-rose-300/25 bg-rose-500/10 text-rose-200',
};

export function deadlineToneClass(tone) {
  return DEADLINE_TONE_CLASSES[tone] || 'border-white/15 bg-white/10 text-slate-300';
}

/**
 * טבעת התקדמות SVG. percent: 0-100. משאיר רקע שקוף — משתלב בכל כרטיס.
 */
export function ProgressRing({ percent = 0, size = 110, stroke = 10, label = '' }) {
  const clean = Math.max(0, Math.min(100, Number(percent) || 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clean / 100);
  const gradientId = React.useId().replace(/:/g, '');

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2dd4bf" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 400ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] font-extrabold text-[#f1f6fb]">{clean}%</span>
        {label ? <span className="mt-0.5 text-[10px] text-[#8ba3bd]">{label}</span> : null}
      </div>
    </div>
  );
}
