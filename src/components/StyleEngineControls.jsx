// StyleEngineControls.jsx — Phase 1 UI של מנוע הסגנון האישי (Personal Style Engine).
// רכיב self-contained: קורא/כותב את profile.styleEngine + appMemory.styleCreativity בעצמו.
// מוצג ב-StartScreen מתחת לשורות ה-toggle הקיימות (האנשה בלולאה / נספח AI).

import React, { useEffect, useState } from 'react';
import { getPersonalStyleProfile, savePersonalStyleProfile, getAppMemory, saveAppMemory } from '../services/aiService';
import { normalizeStyleEngine, seedStyleEngineFromLegacyProfile, recomputeConfidence } from '../services/styleProfileService';

// טמפרטורת הדגם מתוך ערך ה-slider (0-100) → 0.30-1.00. null אם המשתמש עוד לא נגע בסליידר.
export function getStyleCreativityTemperature() {
  const raw = getAppMemory().styleCreativity;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.round((0.3 + (n / 100) * 0.7) * 100) / 100;
}

// עומק מנוע הסגנון: 'fast' | 'normal' | 'deep'. ברירת מחדל 'normal'.
const STYLE_DEPTH_VALUES = ['fast', 'normal', 'deep'];
export function getStyleDepth() {
  const raw = getAppMemory().styleDepth;
  return STYLE_DEPTH_VALUES.includes(raw) ? raw : 'normal';
}

const DEPTH_OPTIONS = [
  { value: 'fast', label: 'מהיר' },
  { value: 'normal', label: 'רגיל' },
  { value: 'deep', label: 'מעמיק' },
];

const CONFIDENCE_STYLES = {
  low: 'border-amber-200 bg-amber-400/25 text-amber-50',
  medium: 'border-cyan-200 bg-cyan-400/25 text-cyan-50',
  high: 'border-emerald-200 bg-emerald-400/25 text-emerald-50',
};

const CONFIDENCE_LABELS = { low: 'נמוכה', medium: 'בינונית', high: 'גבוהה' };

export default function StyleEngineControls({ visible = true }) {
  const [enabled, setEnabled] = useState(() => normalizeStyleEngine(getPersonalStyleProfile()?.styleEngine).enabled);
  const [confidenceLevel, setConfidenceLevel] = useState(() => {
    const engine = normalizeStyleEngine(getPersonalStyleProfile()?.styleEngine);
    return recomputeConfidence(engine).level;
  });
  const [creativity, setCreativity] = useState(() => {
    const stored = getAppMemory().styleCreativity;
    const n = Number(stored);
    return Number.isFinite(n) ? n : 50;
  });
  const [depth, setDepth] = useState(() => getStyleDepth());

  useEffect(() => {
    const refresh = () => {
      const engine = normalizeStyleEngine(getPersonalStyleProfile()?.styleEngine);
      setEnabled(engine.enabled);
      setConfidenceLevel(recomputeConfidence(engine).level);
    };
    window.addEventListener('wordai-personal-style-updated', refresh);
    return () => window.removeEventListener('wordai-personal-style-updated', refresh);
  }, []);

  if (!visible) return null;

  const handleToggle = (e) => {
    const next = e.target.checked;
    setEnabled(next);
    const profile = getPersonalStyleProfile() || {};
    const engine = normalizeStyleEngine(profile.styleEngine);
    engine.enabled = next;
    if (next && !engine.metrics && !engine.qualitativePatterns.length) {
      const seeded = seedStyleEngineFromLegacyProfile(profile);
      if (seeded) Object.assign(engine, seeded, { enabled: true });
    }
    savePersonalStyleProfile({ ...profile, styleEngine: engine });
    setConfidenceLevel(recomputeConfidence(engine).level);
  };

  const handleCreativityChange = (e) => {
    const value = Number(e.target.value);
    setCreativity(value);
    saveAppMemory({ ...getAppMemory(), styleCreativity: value });
  };

  const handleDepthChange = (value) => {
    setDepth(value);
    saveAppMemory({ ...getAppMemory(), styleDepth: value });
  };

  return (
    <>
      <label className="flex items-center gap-3 mb-6 px-4 py-3 bg-white/10 backdrop-blur-md border border-white/25 rounded-2xl cursor-pointer text-right">
        <input
          type="checkbox"
          checked={enabled}
          onChange={handleToggle}
          className="w-4 h-4 accent-fuchsia-400 shrink-0"
        />
        <span className="flex flex-col flex-1">
          <span className="text-white font-semibold text-sm flex items-center gap-2">
            🖋️ כתוב בסגנון האישי שלי
            <span
              title="ככל שתעלה יותר מסמכים שכתבת, החיקוי יהיה מדויק יותר"
              className={`text-[10px] font-semibold rounded-full border px-2 py-0.5 ${CONFIDENCE_STYLES[confidenceLevel] || CONFIDENCE_STYLES.low}`}
            >
              ודאות פרופיל: {CONFIDENCE_LABELS[confidenceLevel] || CONFIDENCE_LABELS.low}
            </span>
          </span>
          <span className="text-white/65 text-xs">האפליקציה תחקה את דפוסי הכתיבה שנלמדו ממך</span>
        </span>
      </label>

      <div className={`flex flex-col gap-2 mb-6 px-4 py-3 bg-white/10 backdrop-blur-md border border-white/25 rounded-2xl transition-opacity ${enabled ? '' : 'opacity-50'}`}>
        <div className="flex items-center justify-between text-white/80 text-xs font-semibold">
          {/* RTL: הצאצא הראשון מוצג מימין — שם נמצא מינימום הסליידר (0=שמרני) */}
          <span>שמרני</span>
          <span>🎨 רמת יצירתיות</span>
          <span>מגוון</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={creativity}
          onChange={handleCreativityChange}
          className="w-full accent-fuchsia-400"
        />
        <span className="text-white/65 text-xs text-right">משפיע על מידת הגיוון והחופש של הניסוח</span>

        <div className="mt-2 flex items-center gap-2" dir="rtl">
          {DEPTH_OPTIONS.map((opt) => {
            const active = depth === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleDepthChange(opt.value)}
                className={`flex-1 rounded-xl border px-2 py-2 text-xs font-bold transition ${active ? 'border-cyan-200 bg-cyan-400/25 text-white' : 'border-white/25 bg-white/8 text-white/75 hover:bg-white/15'}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <span className="text-white/65 text-xs text-right">מעמיק = איכות גבוהה יותר, לאט ויקר יותר (שופט AI + יצירה מקטעית)</span>
      </div>
    </>
  );
}
