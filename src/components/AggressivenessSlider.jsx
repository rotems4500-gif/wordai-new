// AggressivenessSlider.jsx — סליידר "עוצמת שכתוב" (0-100) לסטודיו הטיוטות.
// רכיב מבוקר (controlled): ההורה מחזיק את הערך ואחראי לשמירה.
// המיפוי לרצועות (עדין/מאוזן/חזק/אגרסיבי) יושב ב-restyleAggressiveness.

import React from 'react';
import { resolveRestyleBand } from '../services/restyleAggressiveness';

export default function AggressivenessSlider({
  value,
  onChange = () => {},
  label = 'עוצמת שכתוב',
  helpText = '',
  disabled = false,
}) {
  const band = resolveRestyleBand(value);

  return (
    <div className="flex min-w-[220px] flex-col gap-1" dir="rtl">
      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-400">
        {/* RTL: הצאצא הראשון מוצג מימין — שם נמצא המינימום של הסליידר (0=עדין) */}
        <span>עדין</span>
        <span className="text-slate-300">
          {label}: <b className="text-sky-300">{band.label}</b>
        </span>
        <span>אגרסיבי</span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-sky-400 disabled:opacity-40"
      />
      <span className="text-right text-[11px] leading-snug text-slate-500">
        {helpText || band.hint}
      </span>
    </div>
  );
}
