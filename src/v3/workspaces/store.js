// store.js — אחסון WorkspaceV3 תחת מפתח יחיד: wordai_workspaces_v3.
//
// שלב 4a (מצב ביניים בטוח): ה-legacy keys נשארים מקור-האמת — כל הקוראים הקיימים
// (aiService 1660-2240, StartScreen) ממשיכים לעבוד ללא שינוי. ה-blob של v3 מתוחזק
// כהקרנה מסונכרנת אחרי כל מוטציה (syncV3FromLegacy) ועולה לענן תחת schema 3.
// היפוך מקור-האמת (v3 קורא, legacy מוקרן) — שלב 4b, אחרי שהמיגרציה מוכחת בשטח.
//
// המפתחות הישנים לא נמחקים לעולם בשלב הזה.

import { buildV3, exportLegacyShape, isWorkspacesV3Blob, WORKSPACES_V3_SCHEMA_VERSION } from './model';

export const WORKSPACES_V3_STORAGE_KEY = 'wordai_workspaces_v3';
const MIGRATED_AT_KEY = 'wordai_workspaces_v3_migrated_at';

const LEGACY_KEYS = {
  library: 'wordai_workspaces_library',
  pointer: 'wordai_workspace_automation',
  roleAgents: 'wordai_role_agents',
  templates: 'wordai_workspace_v2_templates',
};

const readJson = (key, fallback) => {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const readLegacySnapshot = () => ({
  library: readJson(LEGACY_KEYS.library, {}),
  pointer: readJson(LEGACY_KEYS.pointer, {}),
  roleAgents: readJson(LEGACY_KEYS.roleAgents, null),
  templates: readJson(LEGACY_KEYS.templates, {}),
});

export const readWorkspacesV3 = () => {
  const stored = readJson(WORKSPACES_V3_STORAGE_KEY, null);
  return isWorkspacesV3Blob(stored) ? stored : null;
};

const writeWorkspacesV3 = (blob) => {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(WORKSPACES_V3_STORAGE_KEY, JSON.stringify(blob));
    return true;
  } catch {
    return false;
  }
};

// מיגרציה עצלה + אידמפוטנטית: blob קיים ⇒ מוחזר כמו שהוא; אחרת נבנה מה-legacy.
// כשל בכל שלב ⇒ null — הקוראים ממשיכים על legacy כרגיל (fail-open).
export const migrateLegacyWorkspaces = () => {
  try {
    const existing = readWorkspacesV3();
    if (existing) return existing;
    const blob = buildV3(readLegacySnapshot());
    if (!writeWorkspacesV3(blob)) return null;
    try { localStorage.setItem(MIGRATED_AT_KEY, String(Date.now())); } catch {}
    return blob;
  } catch {
    return null;
  }
};

// dual-write (הכיוון של 4a): מוטציה ב-legacy ⇒ ה-blob של v3 מתעדכן מיד, כך שהענן
// (schema 3) תמיד נושא v3 עדכני. נקרא מ-saveWorkspacesLibrary / persistWorkspacePointer /
// שמירת role agents, ואחרי apply של profile מהענן.
export const syncV3FromLegacy = () => {
  try {
    const blob = buildV3(readLegacySnapshot());
    writeWorkspacesV3(blob);
    return blob;
  } catch {
    return null;
  }
};

// pull מהענן (עתידי, מכשיר v3 בלבד): החלת blob של v3 שהגיע מהענן — מקרין ל-legacy keys
// כדי שהקוראים הקיימים יראו את העדכון. לא מוחק מפתחות, רק מעדכן.
export const applyWorkspacesV3Blob = (blob) => {
  if (!isWorkspacesV3Blob(blob)) return false;
  try {
    if (typeof localStorage === 'undefined') return false;
    const legacy = exportLegacyShape(blob);
    localStorage.setItem(LEGACY_KEYS.library, JSON.stringify(legacy.library));
    localStorage.setItem(LEGACY_KEYS.pointer, JSON.stringify(legacy.pointer));
    if (legacy.roleAgents) localStorage.setItem(LEGACY_KEYS.roleAgents, JSON.stringify(legacy.roleAgents));
    if (legacy.templates && Object.keys(legacy.templates).length) {
      localStorage.setItem(LEGACY_KEYS.templates, JSON.stringify(legacy.templates));
    }
    writeWorkspacesV3(blob);
    return true;
  } catch {
    return false;
  }
};

// ---- שלב 4b: פרימיטיבות "מקור-אמת" ----
// כשה-flag workspacesTruth פעיל, aiService/workspaceV2Service קוראים וכותבים דרך
// הפונקציות האלה: ה-blob הוא האמת, ומפתח ה-legacy התואם מוקרן בכל כתיבה (projection)
// כדי שמכשירי schema-2 והענן ימשיכו לעבוד. קריאה כשאין blob ⇒ מיגרציה עצלה מה-legacy.

const ensureBlob = () => readWorkspacesV3() || migrateLegacyWorkspaces();

const projectLegacyKey = (key, value) => {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

const updateBlob = (mutate) => {
  const blob = ensureBlob();
  if (!blob) return null;
  const next = { ...blob };
  mutate(next);
  next.updatedAt = new Date().toISOString();
  writeWorkspacesV3(next);
  return next;
};

export const readV3WorkspacesLibrary = () => {
  const blob = ensureBlob();
  return blob && typeof blob.workspaces === 'object' ? blob.workspaces : null;
};

export const writeV3WorkspacesLibrary = (library = {}) => {
  const next = updateBlob((blob) => { blob.workspaces = library && typeof library === 'object' ? library : {}; });
  if (next) projectLegacyKey(LEGACY_KEYS.library, next.workspaces);
  return Boolean(next);
};

export const readV3WorkspacePointer = () => {
  const blob = ensureBlob();
  if (!blob) return null;
  return exportLegacyShape(blob).pointer;
};

export const writeV3WorkspacePointer = (pointer = {}) => {
  const safe = pointer && typeof pointer === 'object' ? pointer : {};
  const next = updateBlob((blob) => {
    const { activeWorkspaceId, workspaceBypassEnabled, ...rest } = safe;
    blob.activeWorkspaceId = String(activeWorkspaceId || '').trim();
    blob.workspaceBypassEnabled = workspaceBypassEnabled === true;
    blob.pointerSettings = rest;
  });
  if (next) projectLegacyKey(LEGACY_KEYS.pointer, safe);
  return Boolean(next);
};

export const readV3RoleAgents = () => {
  const blob = ensureBlob();
  return blob && Array.isArray(blob.roleAgentsMirror) ? blob.roleAgentsMirror : null;
};

export const writeV3RoleAgents = (agents = []) => {
  const safe = Array.isArray(agents) ? agents : [];
  const next = updateBlob((blob) => { blob.roleAgentsMirror = safe; });
  if (next) projectLegacyKey(LEGACY_KEYS.roleAgents, safe);
  return Boolean(next);
};

export const readV3Templates = () => {
  const blob = ensureBlob();
  return blob && typeof blob.customTemplates === 'object' && blob.customTemplates !== null ? blob.customTemplates : null;
};

export const writeV3Templates = (templates = {}) => {
  const safe = templates && typeof templates === 'object' ? templates : {};
  const next = updateBlob((blob) => { blob.customTemplates = safe; });
  if (next) projectLegacyKey(LEGACY_KEYS.templates, safe);
  return Boolean(next);
};

export { WORKSPACES_V3_SCHEMA_VERSION };
