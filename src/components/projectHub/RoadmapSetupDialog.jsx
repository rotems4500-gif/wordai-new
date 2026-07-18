import React, { useEffect, useRef, useState } from 'react';
import { Modal, Button, Input, TextArea, Select } from '../ui';
import { PROJECT_TYPE_LABELS } from './projectHubUtils';

// RoadmapSetupDialog — דיאלוג יצירה/יצירה-מחדש של מתווה עבודה. לא נוגע ב-projectService
// בעצמו — מחזיר את השדות דרך onSubmit({..., mode}) וההורה (ProjectHubStudio) מבצע את
// updateProjectMeta + generateProjectRoadmap/applyTemplateRoadmap.

const BUSY_MESSAGES = [
  'מנתח את ההנחיות…',
  'בונה שלבי עבודה…',
  'מחלק יעדי מילים…',
  'מסדר לוח זמנים…',
];

export default function RoadmapSetupDialog({ open, project, onClose, onSubmit }) {
  const [projectType, setProjectType] = useState(project?.projectType || 'seminar');
  const [goal, setGoal] = useState(project?.goal || '');
  const [targetDate, setTargetDate] = useState(project?.targetDate || '');
  const [wordTarget, setWordTarget] = useState(project?.wordTarget || '');
  const [busy, setBusy] = useState(false);
  const [busyMessageIndex, setBusyMessageIndex] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setProjectType(project?.projectType || 'seminar');
    setGoal(project?.goal || '');
    setTargetDate(project?.targetDate || '');
    setWordTarget(project?.wordTarget || '');
    setBusy(false);
    setBusyMessageIndex(0);
  }, [open, project]);

  useEffect(() => {
    if (!busy) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return undefined;
    }
    intervalRef.current = setInterval(() => {
      setBusyMessageIndex((i) => (i + 1) % BUSY_MESSAGES.length);
    }, 2500);
    return () => clearInterval(intervalRef.current);
  }, [busy]);

  if (!open) return null;

  const fields = { projectType, goal, targetDate, wordTarget };

  const handleSubmit = async (mode) => {
    if (busy) return;
    setBusy(true);
    setBusyMessageIndex(0);
    try {
      await onSubmit?.({ ...fields, mode });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title="בניית מתווה עבודה" size="lg" escapeBlocked={busy} backdropBlocked={busy}>
      <div className="flex flex-col gap-4 text-right" dir="rtl">
        <Select
          label="סוג העבודה"
          value={projectType}
          onChange={(e) => setProjectType(e.target.value)}
          disabled={busy}
        >
          {Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>

        <TextArea
          label="שאלת המחקר / מטרת העבודה"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="שאלת המחקר / מטרת העבודה..."
          rows={4}
          disabled={busy}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="תאריך יעד"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            disabled={busy}
          />
          <Input
            label="יעד מילים"
            type="number"
            step={500}
            min={0}
            value={wordTarget}
            onChange={(e) => setWordTarget(e.target.value)}
            placeholder="לדוגמה 6000"
            ltr
            disabled={busy}
          />
        </div>

        {busy && (
          <div className="flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-3 py-2.5 text-[12.5px] text-cyan-100">
            <i className="ph ph-spinner animate-spin text-[1.1em]" aria-hidden="true" />
            <span>{BUSY_MESSAGES[busyMessageIndex]}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 pt-4">
          <Button variant="ghost" onClick={onClose} disabled={busy}>ביטול</Button>
          <Button variant="quiet" onClick={() => handleSubmit('template')} loading={busy} disabled={busy}>
            התחל מתבנית סמינריון
          </Button>
          <Button variant="primary" onClick={() => handleSubmit('ai')} loading={busy} disabled={busy}>
            ✨ צור מתווה עם AI
          </Button>
        </div>
      </div>
    </Modal>
  );
}
