// flags.js — דגלי V3 + kill-switch לכל שלב.
//
// כל שלב ב-rollout של V3 נשלט בדגל: ברירת המחדל היא ON ברגע שהשלב נשלח,
// אבל אפשר לכבות מיידית בשטח דרך localStorage בלי build חדש:
//   localStorage.setItem('wordai_v3_flags', JSON.stringify({ apiClient: false }))
//
// הדגלים נקראים בכל גישה (לא נשמרים ב-module state) כדי שכיבוי ייכנס לתוקף
// ברענון הבא בלי סדר-טעינה עדין.

const FLAGS_STORAGE_KEY = 'wordai_v3_flags';

// ברירות מחדל לפי שלב. שלב שטרם נשלח — false עד שה-wiring שלו נוחת.
const DEFAULT_FLAGS = {
  ledger: true,       // שלב 0: טלמטריית קריאות פסיבית
  apiClient: true,    // שלב 1: תעבורת ספקים דרך v3/api/client (הופעל 2026-07-03 אחרי בדיקה חיה)
  streaming: true,    // שלב 2: SSE חדש עם read-timeout (הופעל 2026-07-03)
  runScope: true,     // שלב 3: RunScope + retrievalGate (הופעל 2026-07-03 — בדיקת doc-gen חיה עברה)
  workspaces: true,   // שלב 4a: dual-write של wordai_workspaces_v3 (הופעל 2026-07-03)
  workspacesTruth: true,  // שלב 4b: ה-blob המאוחד הוא מקור-האמת; legacy keys מוקרנים ממנו (הופעל 2026-07-03)
  chatRun: true,      // שלב 5: retry לפי מדיניות + fallback יחיד + תקציב run אוכף (הופעל 2026-07-03)
  contextEnforcement: true,  // שלב 6: אכיפת contextPolicy/memoryIsolation של הסביבה בהרכבת ה-prompt (opt-in per-workspace; רדום עד שסביבה מגדירה מדיניות)
};

const readStoredFlags = () => {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(FLAGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const isV3FlagEnabled = (name) => {
  const stored = readStoredFlags();
  if (typeof stored[name] === 'boolean') return stored[name];
  return Boolean(DEFAULT_FLAGS[name]);
};

export const getV3Flags = () => ({ ...DEFAULT_FLAGS, ...readStoredFlags() });

export const setV3Flag = (name, value) => {
  try {
    if (typeof localStorage === 'undefined') return;
    const stored = readStoredFlags();
    stored[name] = Boolean(value);
    localStorage.setItem(FLAGS_STORAGE_KEY, JSON.stringify(stored));
  } catch {}
};
