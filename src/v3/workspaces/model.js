// model.js — WorkspaceV3: מודל אחד שמאחד את שלושת מפתחות ה-legacy של סביבות העבודה
// (wordai_workspaces_library / wordai_workspace_automation / wordai_role_agents) + תבניות v2.
//
// עיקרון: המרה חסרת-אובדן (lossless). שדות שלא מוכרים לנו נשמרים verbatim — כך
// round-trip מלא: exportLegacyShape(buildV3(legacy)) ≡ legacy. זה מה שמאפשר dual-write
// בטוח: מכשיר ישן (cloud schema 2) ממשיך לקרוא את מפתחות ה-legacy שאנחנו מקרינים.

export const WORKSPACES_V3_SCHEMA_VERSION = 3;

// שדות ה-pointer שהם מטא של ההצבעה עצמה, לא הגדרות אוטומציה.
const POINTER_META_FIELDS = new Set(['activeWorkspaceId', 'workspaceBypassEnabled']);

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// legacy → v3. קלט: ארבעת מפתחות ה-localStorage כפי שהם. פונקציה טהורה — בלי גישה ל-storage.
export const buildV3 = ({
  library = {},
  pointer = {},
  roleAgents = null,
  templates = {},
  now = () => new Date().toISOString(),
} = {}) => {
  const safePointer = isPlainObject(pointer) ? pointer : {};
  const pointerSettings = {};
  Object.entries(safePointer).forEach(([key, value]) => {
    if (!POINTER_META_FIELDS.has(key)) pointerSettings[key] = value;
  });

  const workspaces = {};
  if (isPlainObject(library)) {
    Object.entries(library).forEach(([id, workspace]) => {
      if (!isPlainObject(workspace)) return;
      workspaces[id] = workspace; // verbatim — הנורמליזציה נשארת בשכבת הקריאה (legacy)
    });
  }

  return {
    schemaVersion: WORKSPACES_V3_SCHEMA_VERSION,
    updatedAt: now(),
    activeWorkspaceId: String(safePointer.activeWorkspaceId || '').trim(),
    workspaceBypassEnabled: safePointer.workspaceBypassEnabled === true,
    pointerSettings,
    workspaces,
    roleAgentsMirror: Array.isArray(roleAgents) ? roleAgents : null,
    customTemplates: isPlainObject(templates) ? templates : {},
  };
};

// v3 → legacy. ההקרנה שמכשירי schema-2 (וכל הקוראים הקיימים) ממשיכים לצרוך.
export const exportLegacyShape = (v3 = {}) => {
  const safe = isPlainObject(v3) ? v3 : {};
  const pointer = {
    ...(isPlainObject(safe.pointerSettings) ? safe.pointerSettings : {}),
    ...(safe.activeWorkspaceId ? { activeWorkspaceId: safe.activeWorkspaceId } : {}),
    ...(typeof safe.workspaceBypassEnabled === 'boolean' ? { workspaceBypassEnabled: safe.workspaceBypassEnabled } : {}),
  };
  return {
    library: isPlainObject(safe.workspaces) ? safe.workspaces : {},
    pointer,
    roleAgents: Array.isArray(safe.roleAgentsMirror) ? safe.roleAgentsMirror : null,
    templates: isPlainObject(safe.customTemplates) ? safe.customTemplates : {},
  };
};

export const isWorkspacesV3Blob = (value) => isPlainObject(value)
  && Number(value.schemaVersion) === WORKSPACES_V3_SCHEMA_VERSION
  && isPlainObject(value.workspaces);

// ── מיזוג ברמת-רשומה למיזוג ענן רב-מכשירי ──
// tombstone = רשומת סביבה עם deletedAt; נשמרת כדי שמחיקה לא תקום לתחייה ממכשיר מיושן.
export const WORKSPACE_TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const isWorkspaceTombstone = (ws) => isPlainObject(ws) && Boolean(ws.deletedAt);

const parseTimestamp = (value) => {
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
};

// חותמת האפקטיבית של רשומה למיזוג: המאוחרת מבין updatedAt/deletedAt/lastModified.
export const workspaceEffectiveTimestamp = (ws) => {
  if (!isPlainObject(ws)) return 0;
  return Math.max(parseTimestamp(ws.updatedAt), parseTimestamp(ws.deletedAt), parseTimestamp(ws.lastModified));
};

// מיזוג שתי מפות סביבות ברמת רשומה: לכל id, הרשומה החדשה יותר מנצחת (תיקו ⇒ המקומית).
// כך עריכות מקבילות בשתי מכונות על סביבות *שונות* לא דורסות זו את זו. tombstones ישנים מ-TTL
// (כשניתן nowMs) מנוקים. פונקציה טהורה — בלי גישה ל-storage/Date.
export const mergeWorkspaceMaps = (localMap = {}, incomingMap = {}, nowMs = null) => {
  const local = isPlainObject(localMap) ? localMap : {};
  const incoming = isPlainObject(incomingMap) ? incomingMap : {};
  const ids = new Set([...Object.keys(local), ...Object.keys(incoming)]);
  const cutoff = Number.isFinite(nowMs) ? nowMs - WORKSPACE_TOMBSTONE_TTL_MS : null;
  const merged = {};
  ids.forEach((id) => {
    const l = local[id];
    const r = incoming[id];
    const winner = (l && r)
      ? (workspaceEffectiveTimestamp(r) > workspaceEffectiveTimestamp(l) ? r : l)
      : (l || r);
    if (!winner) return;
    if (cutoff !== null && isWorkspaceTombstone(winner) && workspaceEffectiveTimestamp(winner) < cutoff) return;
    merged[id] = winner;
  });
  return merged;
};
