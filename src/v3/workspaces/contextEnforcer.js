// contextEnforcer.js — אכיפה בפועל של memoryScopes/guardrails של ה-workspace.
//
// עד היום ההצהרות ב-workspaceV2Service (memoryScopes, guardrails) לא נאכפו בשום מקום —
// כל הקשר (מסמך, היסטוריית צ'אט, חומרים) זרם ל-prompt חופשי. כאן: הנתיב היחיד
// ממצב האפליקציה אל הרכבת ה-prompt, מסונן לפי מדיניות ה-workspace וה-scope.

const DEFAULT_POLICY = {
  includeDocumentContext: true,
  includeChatHistory: false,   // ברירת מחדל קשוחה: היסטוריה לא זולגת אלא אם הותרה במפורש
  maxChatMessages: 6,
  includeMaterials: true,
};

// גוזר policy מהצהרות ה-workspace (memoryScopes/guardrails של v2) — אם קיימות.
const resolvePolicy = (workspace = null, overrides = {}) => {
  const declared = workspace?.contextPolicy && typeof workspace.contextPolicy === 'object'
    ? workspace.contextPolicy
    : {};
  // guardrail של בידוד זיכרון (workspace v2): memoryIsolation ⇒ אין היסטוריית צ'אט.
  const memoryIsolation = Boolean(
    workspace?.guardrails?.memoryIsolation
    || (Array.isArray(workspace?.guardrails) && workspace.guardrails.includes('memoryIsolation')),
  );
  return {
    ...DEFAULT_POLICY,
    ...declared,
    ...(memoryIsolation ? { includeChatHistory: false } : {}),
    ...overrides,
  };
};

// buildEnforcedContext — מחזיר רק את מה שמדיניות ה-workspace מתירה.
// requested: מה שהקורא רוצה לצרף. הפלט הוא המסונן — הקורא משתמש בו בלבד.
export const buildEnforcedContext = ({
  scope = null,
  workspace = null,
  requested = {},
  policyOverrides = {},
} = {}) => {
  const policy = resolvePolicy(workspace, policyOverrides);

  const documentContext = policy.includeDocumentContext
    ? String(requested.documentContext ?? scope?.documentContext ?? '')
    : '';

  const chatHistory = policy.includeChatHistory && Array.isArray(requested.chatHistory)
    ? requested.chatHistory.slice(-Math.max(0, policy.maxChatMessages))
    : [];

  const materials = policy.includeMaterials && Array.isArray(requested.materials)
    ? requested.materials
    : [];

  return {
    documentContext,
    chatHistory,
    materials,
    policy,
    dropped: {
      documentContext: !policy.includeDocumentContext && Boolean(requested.documentContext),
      chatHistory: !policy.includeChatHistory && Boolean(requested.chatHistory?.length),
      materials: !policy.includeMaterials && Boolean(requested.materials?.length),
    },
  };
};
