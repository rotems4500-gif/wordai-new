// ============================================================================
// v3-workspaces-integration.mjs — אינטגרציה offline של שלב 4b עם aiService האמיתי.
// מדמה משתמש קיים (legacy keys מלאים), מדליק workspacesTruth, ומוודא שכל ה-API
// הציבורי (getWorkspacesLibrary / getWorkspaceAutomation / save / switch / agents)
// עובד זהה — וה-blob + הקרנות ה-legacy נשארים עקביים. בלי רשת, WORDAI_CFG לא נדרש.
//   WORDAI_VERIFY_ENTRY=ws npx vite build --config vite.verify.config.mjs
//   node <scratch>/verify/out-sf/sf.mjs
// ============================================================================

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
globalThis.window = globalThis;
globalThis.self = globalThis;
if (typeof globalThis.navigator === 'undefined') globalThis.navigator = { userAgent: 'node-harness', language: 'he' };
globalThis.document = {
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }),
  createTextNode: () => ({}),
  addEventListener() {}, removeEventListener() {},
  querySelector: () => null, querySelectorAll: () => [],
  body: { appendChild() {}, removeChild() {} }, documentElement: { style: {} }, hidden: false,
};
globalThis.addEventListener = globalThis.addEventListener || (() => {});
globalThis.removeEventListener = globalThis.removeEventListener || (() => {});
globalThis.dispatchEvent = globalThis.dispatchEvent || (() => true);
if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent { constructor(type, opts = {}) { this.type = type; this.detail = opts.detail; } };
}

// משתמש קיים: סביבה מותאמת אישית ב-legacy, בלי blob v3 (מכשיר שטרם שודרג).
const CUSTOM_WS = {
  id: 'my-thesis-ws',
  name: 'התזה שלי',
  automation: { enabled: true, preset: 'custom', workflowMode: 'research-first', workspaceName: 'התזה שלי' },
  agents: [{ id: 'researcher', name: 'חוקר תזה', prompt: 'חקור לעומק', enabled: true }],
  customUserField: 'חייב לשרוד מיגרציה',
};
localStorage.setItem('wordai_workspaces_library', JSON.stringify({ 'my-thesis-ws': CUSTOM_WS }));
localStorage.setItem('wordai_workspace_automation', JSON.stringify({ activeWorkspaceId: 'my-thesis-ws', workspaceBypassEnabled: false, enabled: true }));
localStorage.setItem('wordai_role_agents', JSON.stringify(CUSTOM_WS.agents));
localStorage.setItem('ai_provider_config', '{}');
// שלב 4b פעיל
localStorage.setItem('wordai_v3_flags', JSON.stringify({ workspaces: true, workspacesTruth: true }));

const ai = await import('aiservice');

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) console.log(`  ✓ ${name}`);
  else { failures += 1; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

console.log('\n[1] קריאה ראשונה — מיגרציה עצלה + שימור הסביבה של המשתמש');
{
  const library = ai.getWorkspacesLibrary();
  check('הסביבה המותאמת שרדה', library['my-thesis-ws']?.name === 'התזה שלי');
  check('שדה משתמש לא-מוכר שרד', library['my-thesis-ws']?.customUserField === 'חייב לשרוד מיגרציה');
  check('סביבות ברירת-מחדל נזרעו לצידה', Boolean(library['default-content-studio']));
  const blob = JSON.parse(localStorage.getItem('wordai_workspaces_v3') || 'null');
  check('blob v3 נוצר במיגרציה עצלה', blob?.schemaVersion === 3 && Boolean(blob.workspaces['my-thesis-ws']));
}

console.log('\n[2] getWorkspaceAutomation — pointer מה-blob');
{
  const automation = ai.getWorkspaceAutomation();
  check('הסביבה הפעילה נשמרה', automation.activeWorkspaceId === 'my-thesis-ws');
  check('workflowMode מהסביבה', automation.workflowMode === 'research-first');
}

console.log('\n[3] מוטציה דרך ה-API הציבורי — blob + הקרנות עקביים');
{
  ai.saveWorkspaceAutomation({ sharedGoal: 'יעד חדש לצוות' });
  const blob = JSON.parse(localStorage.getItem('wordai_workspaces_v3'));
  const legacyLibrary = JSON.parse(localStorage.getItem('wordai_workspaces_library'));
  check('המוטציה נכתבה ל-blob', blob.workspaces['my-thesis-ws']?.automation?.sharedGoal === 'יעד חדש לצוות');
  check('הקרנת legacy עקבית', legacyLibrary['my-thesis-ws']?.automation?.sharedGoal === 'יעד חדש לצוות');
  check('שדה המשתמש עדיין שם אחרי מוטציה', legacyLibrary['my-thesis-ws']?.customUserField === 'חייב לשרוד מיגרציה');
}

console.log('\n[4] snapshot מהענן לא דורס את הסביבה הפעילה המקומית');
{
  const cloudBlob = JSON.parse(localStorage.getItem('wordai_workspaces_v3'));
  cloudBlob.activeWorkspaceId = 'default-content-studio'; // מכשיר אחר עומד על סביבה אחרת
  const applied = ai.applyPersistedAppSettingsSnapshot({ wordai_workspaces_v3: JSON.stringify(cloudBlob) }, { replaceExisting: true });
  const blobAfter = JSON.parse(localStorage.getItem('wordai_workspaces_v3'));
  check('activeWorkspaceId מקומי נשמר', blobAfter.activeWorkspaceId === 'my-thesis-ws', `got=${blobAfter.activeWorkspaceId} applied=${applied}`);
  check('getWorkspaceAutomation עדיין על הסביבה שלי', ai.getWorkspaceAutomation().activeWorkspaceId === 'my-thesis-ws');
}

console.log('\n[5] kill-switch: כיבוי workspacesTruth מחזיר התנהגות legacy בלי אובדן');
{
  localStorage.setItem('wordai_v3_flags', JSON.stringify({ workspaces: true, workspacesTruth: false }));
  const library = ai.getWorkspacesLibrary();
  check('legacy path רואה את אותם נתונים (ההקרנה עדכנית)', library['my-thesis-ws']?.automation?.sharedGoal === 'יעד חדש לצוות');
}

// ============================================================================
// שלב 5: מנוע הביצוע של chatRun — retry לפי מדיניות, fallback ממושמע, תקציב אוכף.
// aiService אמיתי + fetch מדומה. ספק יחיד מוגדר (openai) כדי לבודד את ההתנהגות.
// ============================================================================
console.log('\n[6] chatRun: מדיניות retry/fallback/תקציב (aiService אמיתי, fetch מדומה)');
localStorage.setItem('wordai_v3_flags', JSON.stringify({ workspaces: true, workspacesTruth: true, apiClient: true, chatRun: true, runScope: true }));
localStorage.setItem('ai_provider_config', JSON.stringify({ active: 'openai', openai: { key: 'test-key', model: 'gpt-4o' } }));

const { createRunScope } = await import('../../src/v3/orchestration/runScope.js');

const makeCountingFetch = (script) => {
  let calls = 0;
  const impl = async () => {
    const step = script[Math.min(calls, script.length - 1)];
    calls += 1;
    return {
      ok: step.status >= 200 && step.status < 300,
      status: step.status,
      headers: { get: () => (step.retryAfter || '') },
      text: async () => step.body,
    };
  };
  impl.calls = () => calls;
  return impl;
};

const CHAT_OPTIONS = {
  providerOverride: 'openai',
  strictProviderOverride: true,
  skipAutomation: true,
  skipAutomationPrompt: true,
  skipSkillSelection: true,
  skipMultiModel: true,
  directChat: true,
};

{
  // AUTH: קריאה אחת בדיוק — בלי retry, בלי fallback
  const fetchImpl = makeCountingFetch([{ status: 401, body: '{"error":"bad key"}' }]);
  globalThis.fetch = fetchImpl;
  let err = null;
  try { await ai.chatWithActiveProvider('בדיקה', '', '', CHAT_OPTIONS); } catch (e) { err = e; }
  check('AUTH → קריאה אחת, בלי ניסיונות חוזרים', fetchImpl.calls() === 1, `calls=${fetchImpl.calls()}`);
  check('AUTH → הודעה עברית ברורה', /נדחה|מפתח/.test(String(err?.message || '')), String(err?.message || '').slice(0, 80));
}
{
  // SERVER (5xx): ניסיון + retry אחד = שתי קריאות בדיוק
  const fetchImpl = makeCountingFetch([{ status: 503, body: '{"error":"overloaded"}' }]);
  globalThis.fetch = fetchImpl;
  let err = null;
  try { await ai.chatWithActiveProvider('בדיקה', '', '', CHAT_OPTIONS); } catch (e) { err = e; }
  check('5xx → בדיוק 2 קריאות (ניסיון+retry) ותו לא', fetchImpl.calls() === 2, `calls=${fetchImpl.calls()}`);
}
{
  // 5xx ואז הצלחה — ה-retry מציל את הבקשה
  const fetchImpl = makeCountingFetch([
    { status: 503, body: '{"error":"overloaded"}' },
    { status: 200, body: JSON.stringify({ choices: [{ message: { content: 'הצלחה אחרי retry' }, finish_reason: 'stop' }] }) },
  ]);
  globalThis.fetch = fetchImpl;
  const reply = await ai.chatWithActiveProvider('בדיקה', '', '', CHAT_OPTIONS);
  const text = typeof reply === 'string' ? reply : reply?.text || '';
  check('retry מציל: תשובה חוזרת', text.includes('הצלחה אחרי retry') && fetchImpl.calls() === 2);
}
{
  // תקציב run אזל → נחסם לפני יציאה לרשת
  const fetchImpl = makeCountingFetch([{ status: 200, body: '{}' }]);
  globalThis.fetch = fetchImpl;
  const scope = createRunScope({ origin: 'sidebar-chat', budget: { maxCalls: 0, maxRetrievalQueries: 0 } });
  let err = null;
  try { await ai.chatWithActiveProvider('בדיקה', '', '', { ...CHAT_OPTIONS, runScope: scope }); } catch (e) { err = e; }
  check('תקציב אזל → BUDGET_EXCEEDED בלי קריאת רשת', err?.code === 'BUDGET_EXCEEDED' && fetchImpl.calls() === 0, `code=${err?.code} calls=${fetchImpl.calls()}`);
}
{
  // תקציב תקין → הקריאה עוברת ונספרת ב-ledger של ה-scope
  const fetchImpl = makeCountingFetch([{ status: 200, body: JSON.stringify({ choices: [{ message: { content: 'תקין' }, finish_reason: 'stop' }] }) }]);
  globalThis.fetch = fetchImpl;
  const scope = createRunScope({ origin: 'sidebar-chat' });
  await ai.chatWithActiveProvider('בדיקה', '', '', { ...CHAT_OPTIONS, runScope: scope });
  check('קריאה נספרת ב-ledger של ה-scope', scope.ledger.stats().calls === 1, `calls=${scope.ledger.stats().calls}`);
}

// ============================================================================
// שלב 6: אכיפת contextPolicy של הסביבה. סביבה עם מדיניות (memoryIsolation /
// includeChatHistory:false) חוסמת זליגת היסטוריית שיחה ל-prompt; סביבה ללא מדיניות
// עוברת pass-through (בלי רגרסיה). נבדק דרך לכידת גוף הבקשה ש-chatWithActiveProvider שולח.
// ============================================================================
console.log('\n[7] אכיפת contextPolicy: מדיניות סביבה מסננת היסטוריית שיחה, ברירת-מחדל pass-through');
localStorage.setItem('wordai_v3_flags', JSON.stringify({ workspaces: true, workspacesTruth: true, apiClient: true, chatRun: true, runScope: true, contextEnforcement: true }));
localStorage.setItem('ai_provider_config', JSON.stringify({ active: 'openai', openai: { key: 'test-key', model: 'gpt-4o' } }));

const HISTORY_MARKER = 'SODI_HISTORY_MARKER_7788';
const CHAT_HISTORY = [{ role: 'user', content: HISTORY_MARKER }];
const makeCapturingFetch = () => {
  let body = '';
  const impl = async (_url, init = {}) => {
    body = String(init?.body || '');
    return {
      ok: true, status: 200, headers: { get: () => '' },
      text: async () => JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
    };
  };
  impl.body = () => body;
  return impl;
};

{
  // (a) סביבה עם contextPolicy.includeChatHistory:false ⇒ ההיסטוריה נחסמת מה-prompt
  const lib = ai.getWorkspacesLibrary();
  lib['iso-ws'] = { id: 'iso-ws', name: 'סביבה מבודדת', automation: { enabled: false }, agents: [], contextPolicy: { includeChatHistory: false } };
  ai.saveWorkspacesLibrary(lib);
  await ai.switchToWorkspace('iso-ws');
  const f = makeCapturingFetch();
  globalThis.fetch = f;
  await ai.chatWithActiveProvider('בדיקה', '', '', { ...CHAT_OPTIONS, conversationHistory: CHAT_HISTORY });
  check('סביבה מבודדת → היסטוריית שיחה לא זלגה ל-prompt', !f.body().includes(HISTORY_MARKER), 'marker leaked into prompt');
}
{
  // (b) סביבה ללא מדיניות ⇒ pass-through: ההיסטוריה כן נכנסת (הוכחת אי-רגרסיה)
  const lib = ai.getWorkspacesLibrary();
  lib['open-ws'] = { id: 'open-ws', name: 'סביבה פתוחה', automation: { enabled: false }, agents: [] };
  ai.saveWorkspacesLibrary(lib);
  await ai.switchToWorkspace('open-ws');
  const f = makeCapturingFetch();
  globalThis.fetch = f;
  await ai.chatWithActiveProvider('בדיקה', '', '', { ...CHAT_OPTIONS, conversationHistory: CHAT_HISTORY });
  check('סביבה ללא מדיניות → היסטוריה עוברת כרגיל (pass-through)', f.body().includes(HISTORY_MARKER), 'marker missing — over-enforced');
}
{
  // (c) kill-switch: contextEnforcement כבוי ⇒ pass-through גם עם מדיניות
  localStorage.setItem('wordai_v3_flags', JSON.stringify({ workspaces: true, workspacesTruth: true, apiClient: true, chatRun: true, runScope: true, contextEnforcement: false }));
  await ai.switchToWorkspace('iso-ws');
  const f = makeCapturingFetch();
  globalThis.fetch = f;
  await ai.chatWithActiveProvider('בדיקה', '', '', { ...CHAT_OPTIONS, conversationHistory: CHAT_HISTORY });
  check('דגל כבוי → אין אכיפה, היסטוריה עוברת', f.body().includes(HISTORY_MARKER), 'kill-switch did not disable enforcement');
  localStorage.setItem('wordai_v3_flags', JSON.stringify({ workspaces: true, workspacesTruth: true, apiClient: true, chatRun: true, runScope: true, contextEnforcement: true }));
}

// ============================================================================
// שלב 7 (Gap B): מיזוג ענן ברמת-רשומה. עריכות מקבילות בשתי מכונות על סביבות שונות
// שורדות; מחיקה (tombstone) לא קמה לתחייה. נבדק דרך applyPersistedAppSettingsSnapshot.
// ============================================================================
console.log('\n[8] מיזוג ענן ברמת-רשומה: עריכות מקבילות שורדות, מחיקה נשמרת');
localStorage.setItem('wordai_v3_flags', JSON.stringify({ workspaces: true, workspacesTruth: true, apiClient: true, chatRun: true, runScope: true, contextEnforcement: true }));

const T = (isoOffsetMs) => new Date(1_800_000_000_000 + isoOffsetMs).toISOString();
{
  // מכשיר מקומי: סביבה A נערכה מאוחר (updatedAt חדש), סביבה B ישנה.
  const localBlob = {
    schemaVersion: 3, updatedAt: T(500), activeWorkspaceId: 'ws-A', workspaceBypassEnabled: false,
    pointerSettings: {}, roleAgentsMirror: null, customTemplates: {},
    workspaces: {
      'ws-A': { id: 'ws-A', name: 'A מקומי חדש', automation: { enabled: false }, agents: [], updatedAt: T(500) },
      'ws-B': { id: 'ws-B', name: 'B ישן', automation: { enabled: false }, agents: [], updatedAt: T(100) },
    },
  };
  localStorage.setItem('wordai_workspaces_v3', JSON.stringify(localBlob));
  localStorage.setItem('wordai_workspaces_library', JSON.stringify(localBlob.workspaces));

  // ענן ממכשיר אחר: A ישן, B נערך מאוחר, ונוספה סביבה C.
  const cloudBlob = {
    schemaVersion: 3, updatedAt: T(600), activeWorkspaceId: 'ws-C', workspaceBypassEnabled: false,
    pointerSettings: {}, roleAgentsMirror: null, customTemplates: {},
    workspaces: {
      'ws-A': { id: 'ws-A', name: 'A ענן ישן', automation: { enabled: false }, agents: [], updatedAt: T(200) },
      'ws-B': { id: 'ws-B', name: 'B ענן חדש', automation: { enabled: false }, agents: [], updatedAt: T(400) },
      'ws-C': { id: 'ws-C', name: 'C חדש מהענן', automation: { enabled: false }, agents: [], updatedAt: T(300) },
    },
  };
  ai.applyPersistedAppSettingsSnapshot({ wordai_workspaces_v3: JSON.stringify(cloudBlob) }, { replaceExisting: true });
  const after = JSON.parse(localStorage.getItem('wordai_workspaces_v3'));
  check('A: הגרסה המקומית החדשה נשמרה (לא נדרסה מהענן)', after.workspaces['ws-A']?.name === 'A מקומי חדש', after.workspaces['ws-A']?.name);
  check('B: הגרסה מהענן (חדשה יותר) נכנסה', after.workspaces['ws-B']?.name === 'B ענן חדש', after.workspaces['ws-B']?.name);
  check('C: סביבה חדשה מהענן נוספה', after.workspaces['ws-C']?.name === 'C חדש מהענן');
  check('pointer מקומי נשמר (ws-A) למרות activeWorkspaceId אחר בענן', after.activeWorkspaceId === 'ws-A', after.activeWorkspaceId);
}
{
  // מחיקה: tombstone מקומי ל-ws-B; ענן עדיין נושא ws-B ישן ⇒ המחיקה מנצחת ולא קמה לתחייה.
  const localBlob = JSON.parse(localStorage.getItem('wordai_workspaces_v3'));
  localBlob.workspaces['ws-B'] = { id: 'ws-B', deletedAt: T(900) };
  localStorage.setItem('wordai_workspaces_v3', JSON.stringify(localBlob));
  const cloudBlob = {
    schemaVersion: 3, updatedAt: T(700), activeWorkspaceId: 'ws-A', workspaceBypassEnabled: false,
    pointerSettings: {}, roleAgentsMirror: null, customTemplates: {},
    workspaces: { 'ws-B': { id: 'ws-B', name: 'B מנסה לחזור', automation: { enabled: false }, agents: [], updatedAt: T(400) } },
  };
  ai.applyPersistedAppSettingsSnapshot({ wordai_workspaces_v3: JSON.stringify(cloudBlob) }, { replaceExisting: true });
  const after = JSON.parse(localStorage.getItem('wordai_workspaces_v3'));
  check('מחיקה מנצחת: ws-B נשאר tombstone', Boolean(after.workspaces['ws-B']?.deletedAt), JSON.stringify(after.workspaces['ws-B']));
  check('סביבה מחוקה לא מופיעה ב-getWorkspacesLibrary', !ai.getWorkspacesLibrary()['ws-B']);
}
{
  // deleteWorkspace (הנתיב שה-UI ב-FileMenu משתמש בו) מסמן tombstone; סביבה מובנית לא נמחקת.
  const lib = ai.getWorkspacesLibrary();
  lib['custom-del'] = { id: 'custom-del', name: 'למחיקה', automation: { enabled: false }, agents: [] };
  ai.saveWorkspacesLibrary(lib);
  const okCustom = ai.deleteWorkspace('custom-del');
  check('deleteWorkspace מחק סביבה מותאמת (tombstone)', okCustom === true && !ai.getWorkspacesLibrary()['custom-del']);
  const rawAfter = JSON.parse(localStorage.getItem('wordai_workspaces_v3'));
  check('המחיקה נשמרה כ-tombstone (לא הסרת-מפתח)', Boolean(rawAfter.workspaces['custom-del']?.deletedAt));
  const okBuiltin = ai.deleteWorkspace('default-content-studio');
  check('סביבה מובנית לא נמחקת (reset-to-default בלבד)', okBuiltin === false && Boolean(ai.getWorkspacesLibrary()['default-content-studio']));
}

console.log(failures === 0 ? '\n✅ אינטגרציית V3 (4b+5+אכיפה+מיזוג) עברה' : `\n❌ ${failures} בדיקות נכשלו`);
process.exit(failures === 0 ? 0 : 1);
