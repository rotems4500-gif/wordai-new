// ============================================================================
// v3-api-unit.mjs — בדיקות offline לשכבת ה-API של V3 (בלי מפתחות, בלי רשת).
// fetch מוזרק (mock) מדמה 401/429/timeout/malformed/הצלחה לכל צורת ספק.
// מריצים:
//   WORDAI_VERIFY_ENTRY=api npx vite build --config vite.verify.config.mjs
//   node <scratch>/verify/out-sf/sf.mjs
// ============================================================================

// ---- browser shims מינימליים ----
globalThis.window = globalThis;
globalThis.self = globalThis;
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};

import { classifyProviderError, ErrorCodes, ApiError } from '../../src/v3/api/errors.js';
import { getRetryDecision } from '../../src/v3/api/retryPolicy.js';
import { resolveMaxTokens, getModelMaxOutput } from '../../src/v3/api/modelLimits.js';
import { normalizeFinishReason, parseOpenAICompatiblePayload, parseClaudePayload, parseGeminiPayload, chatResultToLegacyResponse } from '../../src/v3/api/responseShape.js';
import { createCallLedger, BudgetExceededError } from '../../src/v3/api/ledger.js';
import { chat } from '../../src/v3/api/client.js';
import { isV3FlagEnabled, setV3Flag } from '../../src/v3/flags.js';
import { classifySourceIntent, isSourceReuseOrIntegrationRequest } from '../../src/services/sourceIntent.js';

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) console.log(`  ✓ ${name}`);
  else { failures += 1; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

// ---- 1. סיווג שגיאות ----
console.log('\n[1] errors: classifyProviderError');
{
  const auth = classifyProviderError({ provider: 'openai', status: 401, body: 'invalid key' });
  check('401 → AUTH', auth.code === ErrorCodes.AUTH);
  check('AUTH הודעה עברית עם שם ספק', auth.userMessageHe.includes('OpenAI'));
  const rate = classifyProviderError({ provider: 'groq', status: 429, headers: { 'retry-after': '7' } });
  check('429 → RATE_LIMIT + retry-after', rate.code === ErrorCodes.RATE_LIMIT && rate.retryAfterSeconds === 7);
  const model = classifyProviderError({ provider: 'gemini', status: 404, body: 'model not found' });
  check('404 → MODEL', model.code === ErrorCodes.MODEL);
  const server = classifyProviderError({ provider: 'claude', status: 529, body: 'overloaded' });
  check('5xx → SERVER', server.code === ErrorCodes.SERVER);
  const net = classifyProviderError({ provider: 'openai', status: 0, cause: new TypeError('fetch failed') });
  check('כשל fetch → NETWORK', net.code === ErrorCodes.NETWORK);
  const abortCause = new Error('aborted'); abortCause.name = 'AbortError';
  const aborted = classifyProviderError({ provider: 'openai', cause: abortCause });
  check('AbortError → ABORTED', aborted.code === ErrorCodes.ABORTED);
}

// ---- 2. retry policy ----
console.log('\n[2] retryPolicy');
{
  const auth = new ApiError({ code: ErrorCodes.AUTH, provider: 'openai' });
  const authDecision = getRetryDecision(auth, { attempt: 0 });
  check('AUTH: בלי retry, בלי fallback', !authDecision.shouldRetry && !authDecision.allowProviderFallback);
  const rate = new ApiError({ code: ErrorCodes.RATE_LIMIT, provider: 'openai', retryAfterSeconds: 5 });
  const rateFirst = getRetryDecision(rate, { attempt: 0 });
  check('RATE_LIMIT: retry אחד עם retry-after', rateFirst.shouldRetry && rateFirst.delayMs === 5000);
  const rateSecond = getRetryDecision(rate, { attempt: 1 });
  check('RATE_LIMIT: אין retry שני ואין fallback ספק', !rateSecond.shouldRetry && !rateSecond.allowProviderFallback);
  const timeout = new ApiError({ code: ErrorCodes.TIMEOUT, provider: 'openai' });
  const timeoutSecond = getRetryDecision(timeout, { attempt: 1 });
  check('TIMEOUT אחרי retry: fallback ספק מותר', !timeoutSecond.shouldRetry && timeoutSecond.allowProviderFallback);
  const aborted = new ApiError({ code: ErrorCodes.ABORTED, provider: 'openai' });
  check('ABORTED: כלום', !getRetryDecision(aborted, { attempt: 0 }).shouldRetry);
}

// ---- 3. modelLimits ----
console.log('\n[3] modelLimits');
{
  check('gemini-2.5 draft גבוה', resolveMaxTokens({ model: 'gemini-2.5-flash', purpose: 'draft' }) === 32768);
  check('plan זול', resolveMaxTokens({ model: 'gemini-2.5-flash', purpose: 'plan' }) === 1024);
  check('requested נחתך לתקרת מודל', resolveMaxTokens({ model: 'gpt-4o', requested: 999999 }) === getModelMaxOutput('gpt-4o'));
  check('מודל לא מוכר → fallback 4096', resolveMaxTokens({ model: 'mystery-model-9' }) === 4096);
}

// ---- 4. responseShape ----
console.log('\n[4] responseShape');
{
  check('MAX_TOKENS → length', normalizeFinishReason('MAX_TOKENS') === 'length');
  check('end_turn → stop', normalizeFinishReason('end_turn') === 'stop');
  const openai = parseOpenAICompatiblePayload({
    choices: [{ message: { content: 'שלום' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
    model: 'gpt-4o',
  }, { provider: 'openai', model: 'gpt-4o' });
  check('openai payload → ChatResult', openai.text === 'שלום' && openai.finishReason === 'stop' && openai.usage.inputTokens === 10);
  const claude = parseClaudePayload({
    content: [{ type: 'text', text: 'תשובה' }],
    stop_reason: 'max_tokens',
    usage: { input_tokens: 20, output_tokens: 8 },
  }, { model: 'claude-sonnet-4-6' });
  check('claude payload → length + usage', claude.finishReason === 'length' && claude.usage.outputTokens === 8);
  const gemini = parseGeminiPayload({
    candidates: [{ content: { parts: [{ text: 'טקסט ' }, { text: 'מחולק' }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 6 },
  }, { model: 'gemini-2.5-flash' });
  check('gemini parts מאוחדים', gemini.text === 'טקסט מחולק' && gemini.usage.inputTokens === 15);
  const legacy = chatResultToLegacyResponse(claude, { legacyStopReason: true });
  check('גשר legacy: stopReason', legacy.completion.stopReason === 'length' && legacy.text === 'תשובה');
}

// ---- 5. ledger ----
console.log('\n[5] ledger');
{
  const ledger = createCallLedger({ origin: 'sidebar-chat', maxCalls: 2, enforce: true });
  ledger.tryConsume({ kind: 'chat', provider: 'openai' });
  ledger.tryConsume({ kind: 'chat', provider: 'openai' });
  let threw = null;
  try { ledger.tryConsume({ kind: 'chat', provider: 'openai' }); } catch (e) { threw = e; }
  check('אכיפה: קריאה שלישית נחסמת', threw instanceof BudgetExceededError);
  const passive = createCallLedger({ enforce: false, maxCalls: 1 });
  passive.tryConsume({ kind: 'chat' });
  passive.tryConsume({ kind: 'chat' });
  check('פסיבי: לא חוסם', passive.stats().calls === 2);
  passive.record({ kind: 'chat', usage: { inputTokens: 100, outputTokens: 50 } });
  check('stats סוכם usage', passive.stats().outputTokens === 50);
}

// ---- 6. client.chat עם fetch מדומה ----
console.log('\n[6] client.chat (mock fetch)');
const makeFetch = (script) => {
  let call = 0;
  const fetchImpl = async (url, init) => {
    const step = script[Math.min(call, script.length - 1)];
    call += 1;
    if (step.throw) throw step.throw;
    if (step.hang) return new Promise(() => {});
    return {
      ok: step.status >= 200 && step.status < 300,
      status: step.status,
      headers: { get: (name) => (name.toLowerCase() === 'retry-after' ? (step.retryAfter || '') : '') },
      text: async () => step.body,
    };
  };
  fetchImpl.calls = () => call;
  return fetchImpl;
};

{
  // הצלחה openai-compatible
  globalThis.fetch = makeFetch([{ status: 200, body: JSON.stringify({ choices: [{ message: { content: 'עובד' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }) }]);
  const result = await chat({ provider: 'openai', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1', apiKey: 'k', messages: [{ role: 'user', content: 'הי' }] });
  check('הצלחה → ChatResult', result.text === 'עובד' && result.finishReason === 'stop');
}
{
  // 401 → AUTH בלי retry (קריאה אחת בלבד)
  const fetchImpl = makeFetch([{ status: 401, body: '{"error":"bad key"}' }]);
  globalThis.fetch = fetchImpl;
  let err = null;
  try { await chat({ provider: 'openai', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1', apiKey: 'bad', messages: [{ role: 'user', content: 'הי' }] }); } catch (e) { err = e; }
  check('401 → AUTH, קריאה אחת', err?.code === ErrorCodes.AUTH && fetchImpl.calls() === 1);
  check('AUTH: אין fallback ספק', err?.allowProviderFallback === false);
}
{
  // 429 → retry אחד ואז הצלחה (שתי קריאות)
  const fetchImpl = makeFetch([
    { status: 429, body: '{"error":"rate"}', retryAfter: '0' },
    { status: 200, body: JSON.stringify({ choices: [{ message: { content: 'אחרי retry' }, finish_reason: 'stop' }] }) },
  ]);
  globalThis.fetch = fetchImpl;
  const result = await chat({ provider: 'groq', model: 'llama-3.3-70b-versatile', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'k', messages: [{ role: 'user', content: 'הי' }] });
  check('429 → retry יחיד מצליח', result.text === 'אחרי retry' && fetchImpl.calls() === 2);
}
{
  // תשובה לא-JSON → MALFORMED (עם retry אחד לפי policy)
  const fetchImpl = makeFetch([{ status: 200, body: '<html>oops</html>' }]);
  globalThis.fetch = fetchImpl;
  let err = null;
  try { await chat({ provider: 'openai', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1', apiKey: 'k', messages: [{ role: 'user', content: 'הי' }] }); } catch (e) { err = e; }
  check('לא-JSON → MALFORMED אחרי retry אחד', err?.code === ErrorCodes.MALFORMED && fetchImpl.calls() === 2);
}
{
  // timeout: הבקשה נתקעת → TIMEOUT, ואז retry שגם נתקע → נכשל עם fallback מותר
  const fetchImpl = makeFetch([{ hang: true }]);
  globalThis.fetch = fetchImpl;
  let err = null;
  const startedAt = Date.now();
  try { await chat({ provider: 'openai', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1', apiKey: 'k', messages: [{ role: 'user', content: 'הי' }], timeoutMs: 150 }); } catch (e) { err = e; }
  check('hang → TIMEOUT', err?.code === ErrorCodes.TIMEOUT, `code=${err?.code}`);
  check('TIMEOUT: fallback ספק מותר', err?.allowProviderFallback === true);
  check('שתי קריאות (ניסיון+retry) ותו לא', fetchImpl.calls() === 2, `calls=${fetchImpl.calls()}`);
  check('לא חיכה מעבר לסביר', Date.now() - startedAt < 2000);
}
{
  // ledger אוכף עוצר את הקריאה לפני יציאה לרשת
  const fetchImpl = makeFetch([{ status: 200, body: '{}' }]);
  globalThis.fetch = fetchImpl;
  const ledger = createCallLedger({ origin: 'sidebar-chat', maxCalls: 0, enforce: true });
  let err = null;
  try { await chat({ provider: 'openai', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1', apiKey: 'k', messages: [{ role: 'user', content: 'הי' }], ledger }); } catch (e) { err = e; }
  check('תקציב אזל → אין קריאת רשת', err?.code === 'BUDGET_EXCEEDED' && fetchImpl.calls() === 0);
}
{
  // claude payload דרך client
  globalThis.fetch = makeFetch([{ status: 200, body: JSON.stringify({ content: [{ type: 'text', text: 'קלוד' }], stop_reason: 'end_turn', usage: { input_tokens: 3, output_tokens: 2 } }) }]);
  const result = await chat({ provider: 'claude', model: 'claude-sonnet-4-6', apiKey: 'k', messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'הי' }] });
  check('claude דרך client', result.text === 'קלוד' && result.finishReason === 'stop');
}
{
  // gemini payload דרך client
  globalThis.fetch = makeFetch([{ status: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ג׳מיני' }] }, finishReason: 'STOP' }] }) }]);
  const result = await chat({ provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'k', messages: [{ role: 'user', content: 'הי' }] });
  check('gemini דרך client', result.text === 'ג׳מיני' && result.finishReason === 'stop');
}

// ---- 6.5 streaming ----
console.log('\n[6.5] streaming (mock SSE)');
import { streamOpenAICompatible } from '../../src/v3/api/streaming.js';

const encoder = new TextEncoder();
const makeSseFetch = (chunks, { status = 200, stall = false } = {}) => async () => {
  let index = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => '' },
    text: async () => '',
    body: {
      getReader: () => ({
        read: async () => {
          if (index < chunks.length) {
            const value = encoder.encode(chunks[index]);
            index += 1;
            return { done: false, value };
          }
          if (stall) return new Promise(() => {});   // ספק שנתקע באמצע
          return { done: true, value: undefined };
        },
        cancel: async () => {},
      }),
    },
  };
};

{
  globalThis.fetch = makeSseFetch([
    'data: {"choices":[{"delta":{"content":"של"}}]}\n',
    'data: {"choices":[{"delta":{"content":"ום"},"finish_reason":"stop"}]}\n',
    'data: [DONE]\n',
  ]);
  const deltas = [];
  const result = await streamOpenAICompatible({
    provider: 'openai', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1', apiKey: 'k',
    messages: [{ role: 'user', content: 'הי' }],
    onDelta: (fullText) => deltas.push(fullText),
  });
  check('stream תקין: טקסט מצטבר', result.text === 'שלום' && result.finishReason === 'stop');
  check('onDelta נקרא עם מצטבר', deltas.length === 2 && deltas[1] === 'שלום');
}
{
  globalThis.fetch = makeSseFetch(['data: {"choices":[{"delta":{"content":"התחלה"}}]}\n'], { stall: true });
  let err = null;
  try {
    await streamOpenAICompatible({
      provider: 'openai', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1', apiKey: 'k',
      messages: [{ role: 'user', content: 'הי' }], readTimeoutMs: 120,
    });
  } catch (e) { err = e; }
  check('ספק נתקע באמצע → TIMEOUT', err?.code === ErrorCodes.TIMEOUT, `code=${err?.code}`);
}
{
  const brokenLines = Array.from({ length: 6 }, (_, i) => `data: {broken-json-${i}\n`);
  globalThis.fetch = makeSseFetch(brokenLines);
  let err = null;
  try {
    await streamOpenAICompatible({
      provider: 'openai', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1', apiKey: 'k',
      messages: [{ role: 'user', content: 'הי' }],
    });
  } catch (e) { err = e; }
  check('5 שגיאות parse רצופות → MALFORMED (לא שקט)', err?.code === ErrorCodes.MALFORMED, `code=${err?.code}`);
}
{
  globalThis.fetch = makeSseFetch([], { status: 429 });
  let err = null;
  try {
    await streamOpenAICompatible({
      provider: 'groq', model: 'llama-3.3-70b-versatile', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'k',
      messages: [{ role: 'user', content: 'הי' }],
    });
  } catch (e) { err = e; }
  check('סטטוס שגיאה בפתיחת stream מסווג', err?.code === ErrorCodes.RATE_LIMIT);
}

// ---- 7. flags ----
console.log('\n[7] flags');
{
  check('ברירת מחדל: ledger פעיל', isV3FlagEnabled('ledger') === true);
  check('ברירת מחדל: שלבים 1-3 פעילים (הופעלו 2026-07-03)', isV3FlagEnabled('apiClient') === true && isV3FlagEnabled('streaming') === true && isV3FlagEnabled('runScope') === true);
  check('ברירת מחדל: כל שלבי V3 פעילים (0-5)', isV3FlagEnabled('workspaces') === true && isV3FlagEnabled('workspacesTruth') === true && isV3FlagEnabled('chatRun') === true);
  setV3Flag('apiClient', false);
  check('kill-switch מכבה', isV3FlagEnabled('apiClient') === false);
  setV3Flag('apiClient', true);
  check('setV3Flag מחזיר', isV3FlagEnabled('apiClient') === true);
}

// ---- 7.5. source intent ----
console.log('\n[7.5] sourceIntent');
{
  check('שילוב מפורש של מקורות קיימים מזוהה', isSourceReuseOrIntegrationRequest('תשלב את המקורות שהבאת בתוך המסמך'));
  check('ניסוח קצר עם lock מזוהה כשימוש במקורות קיימים', classifySourceIntent('תכניס אותם לעבודה', { hasSourceLock: true }).intent === 'reuse-existing-sources');
  check('ניסוח קצר בלי lock לא חוסם חיפוש בטעות', classifySourceIntent('תכניס אותם לעבודה', { hasSourceLock: false }).intent === 'none');
  check('בקשת חיפוש חדש נשארת חיפוש', classifySourceIntent('מצא לי 3 מקורות אקדמיים על לבנון').intent === 'find-new-sources');
}

// ---- 8. runScope + retrievalGate (הריגת הזיהום) ----
console.log('\n[8] runScope + retrievalGate');
import { createRunScope, setScopeTopic, attachSourceLock, startRunScope, getActiveRunScope } from '../../src/v3/orchestration/runScope.js';
import { deriveGateQuery, gateRetrieval } from '../../src/v3/orchestration/retrievalGate.js';
import { buildEnforcedContext } from '../../src/v3/workspaces/contextEnforcer.js';

{
  // תרחיש הבאג המקורי: שיחה על מוגבלויות → צ'אט חדש → מקורות על הסכם לבנון.
  const oldScope = createRunScope({ origin: 'sources-agent', workspaceId: 'ws1', topic: 'שילוב אנשים עם מוגבלויות בשוק העבודה' });
  const newScope = createRunScope({ origin: 'sources-agent', workspaceId: 'ws1', topic: '' });
  const derived = deriveGateQuery({ scope: newScope, prompt: 'מצא לי 3 מקורות אקדמיים על ההסכם המדיני עם לבנון' });
  check('שאילתה חדשה נגזרת מה-prompt בלבד', derived.query.includes('לבנון'));
  check('אין זליגה מהנושא הישן', !derived.query.includes('מוגבלויות'));
  check('scopes שונים = runId שונים', oldScope.runId !== newScope.runId);
}
{
  // follow-up בלי נושא ב-scope → needsTopic, לא ניחוש
  const scope = createRunScope({ origin: 'sources-agent', workspaceId: 'ws1' });
  const derived = deriveGateQuery({ scope, prompt: 'תביא לי עוד 2 מקורות' });
  check('follow-up בלי נושא → needs-topic', derived.source === 'needs-topic' && derived.query === '');
  const result = await gateRetrieval({ scope, prompt: 'תביא עוד מקורות' });
  check('gateRetrieval מחזיר needsTopic במקום לירות', result.needsTopic === true && result.sources.length === 0);
}
{
  // follow-up עם נושא ב-scope → אותו נושא, בלי גזירה מחדש
  const scope = createRunScope({ origin: 'sources-agent', workspaceId: 'ws1', topic: 'ההסכם המדיני עם לבנון' });
  const derived = deriveGateQuery({ scope, prompt: 'תביא לי עוד 2 מקורות' });
  check('follow-up עם נושא → scope.topic', derived.source === 'scope-topic-follow-up' && derived.query === 'ההסכם המדיני עם לבנון');
}
{
  // lock זר נדחה
  const scope = createRunScope({ origin: 'sources-agent', workspaceId: 'ws1', topic: 'נושא' });
  let staleEvent = null;
  const attachedForeign = attachSourceLock(scope, { runId: 'run-של-מישהו-אחר', sources: [] }, { onStaleLock: (e) => { staleEvent = e; } });
  check('lock עם runId זר נדחה', attachedForeign === false && staleEvent !== null);
  const attachedOwn = attachSourceLock(scope, { runId: scope.runId, sources: [{ url: 'https://a.co.il/x' }] });
  check('lock של ה-run מוצמד', attachedOwn === true && scope.sourceLock.sources.length === 1);
  // החלפת נושא מפילה את ה-lock
  setScopeTopic(scope, 'נושא אחר לגמרי');
  check('החלפת נושא מאפסת lock', scope.sourceLock === null);
}
{
  // registry: scope חדש מחליף ומבטל את הקודם
  const first = startRunScope('sidebar', { origin: 'sidebar-chat', workspaceId: 'ws1' });
  const second = startRunScope('sidebar', { origin: 'sidebar-chat', workspaceId: 'ws1' });
  check('scope חדש מבטל את הקודם', first.abortController.signal.aborted === true && !second.abortController.signal.aborted);
  check('getActiveRunScope מחזיר את הנוכחי', getActiveRunScope('sidebar') === second);
}
{
  // תקציב retrieval נאכף דרך השער
  const scope = createRunScope({ origin: 'sources-agent', workspaceId: 'ws1', topic: 'נושא כלשהו לבדיקה', budget: { maxCalls: 5, maxRetrievalQueries: 0 }, enforceBudget: true });
  let err = null;
  try { await gateRetrieval({ scope, prompt: 'מצא מקורות על משהו' }); } catch (e) { err = e; }
  check('תקציב אחזור אזל → BUDGET_EXCEEDED', err?.code === 'BUDGET_EXCEEDED');
}

// ---- 9. contextEnforcer ----
console.log('\n[9] contextEnforcer');
{
  const requested = {
    documentContext: 'תוכן המסמך',
    chatHistory: [{ role: 'user', content: 'הודעה ישנה על מוגבלויות' }],
    materials: [{ id: 'm1' }],
  };
  const defaultCtx = buildEnforcedContext({ requested });
  check('ברירת מחדל: היסטוריית צ׳אט לא זולגת', defaultCtx.chatHistory.length === 0 && defaultCtx.dropped.chatHistory === true);
  check('ברירת מחדל: מסמך וחומרים עוברים', defaultCtx.documentContext === 'תוכן המסמך' && defaultCtx.materials.length === 1);

  const permissive = buildEnforcedContext({ requested, workspace: { contextPolicy: { includeChatHistory: true, maxChatMessages: 2 } } });
  check('workspace מתיר היסטוריה → עוברת (מוגבלת)', permissive.chatHistory.length === 1);

  const isolated = buildEnforcedContext({
    requested,
    workspace: { contextPolicy: { includeChatHistory: true }, guardrails: { memoryIsolation: true } },
  });
  check('memoryIsolation גובר על policy מתירני', isolated.chatHistory.length === 0);
}

// ---- 10. Workspace V3: round-trip + store ----
console.log('\n[10] workspaces v3 (model + store)');
import { buildV3, exportLegacyShape, isWorkspacesV3Blob } from '../../src/v3/workspaces/model.js';
import { migrateLegacyWorkspaces, syncV3FromLegacy, readWorkspacesV3, applyWorkspacesV3Blob, WORKSPACES_V3_STORAGE_KEY } from '../../src/v3/workspaces/store.js';

// fixture ריאליסטי — צורת legacy אמיתית כולל שדות שאיננו מכירים (someFutureField).
const LEGACY_FIXTURE = {
  library: {
    'default-content-studio': {
      id: 'default-content-studio',
      name: 'סטודיו תוכן (ברירת מחדל)',
      automation: { enabled: true, preset: 'content-studio', workflowMode: 'manager-auto', requestTimeoutMs: 45000, activeWorkspaceId: 'default-content-studio' },
      agents: [{ id: 'manager', name: 'מנהל עבודה', prompt: 'נהל את הצוות', enabled: true }],
      lastModified: '2026-07-01T10:00:00.000Z',
      someFutureField: { nested: ['שדה', 'לא', 'מוכר'] },
    },
    'my-legal-workspace': {
      id: 'my-legal-workspace',
      name: 'עבודות משפטיות',
      automation: { enabled: true, preset: 'custom', workflowMode: 'research-first' },
      agents: [{ id: 'writer', name: 'כותב משפטי', prompt: 'כתוב בשפה משפטית', enabled: true }],
    },
  },
  pointer: { activeWorkspaceId: 'my-legal-workspace', workspaceBypassEnabled: true, enabled: false, preset: 'custom', requestTimeoutMs: 45000 },
  roleAgents: [{ id: 'writer', name: 'כותב משפטי', prompt: 'כתוב בשפה משפטית', enabled: true }],
  templates: { marketing: { id: 'marketing', label: 'שיווק מותאם', pipeline: [{ id: 's1', role: 'כותב' }] } },
};

{
  const v3 = buildV3({ ...LEGACY_FIXTURE, now: () => '2026-07-03T00:00:00.000Z' });
  check('buildV3 → blob תקין', isWorkspacesV3Blob(v3) && v3.activeWorkspaceId === 'my-legal-workspace' && v3.workspaceBypassEnabled === true);
  check('שדות לא-מוכרים נשמרים verbatim', JSON.stringify(v3.workspaces['default-content-studio'].someFutureField) === JSON.stringify(LEGACY_FIXTURE.library['default-content-studio'].someFutureField));
  const roundTrip = exportLegacyShape(v3);
  check('round-trip: library זהה', JSON.stringify(roundTrip.library) === JSON.stringify(LEGACY_FIXTURE.library));
  check('round-trip: pointer זהה (סדר שדות בצד)', JSON.stringify(Object.entries(roundTrip.pointer).sort()) === JSON.stringify(Object.entries(LEGACY_FIXTURE.pointer).sort()));
  check('round-trip: roleAgents + templates זהים', JSON.stringify(roundTrip.roleAgents) === JSON.stringify(LEGACY_FIXTURE.roleAgents) && JSON.stringify(roundTrip.templates) === JSON.stringify(LEGACY_FIXTURE.templates));
}
{
  // store: מיגרציה עצלה + אידמפוטנטית
  localStorage.removeItem(WORKSPACES_V3_STORAGE_KEY);
  localStorage.setItem('wordai_workspaces_library', JSON.stringify(LEGACY_FIXTURE.library));
  localStorage.setItem('wordai_workspace_automation', JSON.stringify(LEGACY_FIXTURE.pointer));
  localStorage.setItem('wordai_role_agents', JSON.stringify(LEGACY_FIXTURE.roleAgents));
  localStorage.setItem('wordai_workspace_v2_templates', JSON.stringify(LEGACY_FIXTURE.templates));
  const migrated = migrateLegacyWorkspaces();
  check('מיגרציה יוצרת blob', isWorkspacesV3Blob(migrated) && Object.keys(migrated.workspaces).length === 2);
  const migratedAgain = migrateLegacyWorkspaces();
  check('מיגרציה אידמפוטנטית (blob קיים מוחזר)', migratedAgain.updatedAt === migrated.updatedAt);
  check('מפתחות legacy לא נמחקו', localStorage.getItem('wordai_workspaces_library') !== null && localStorage.getItem('wordai_workspace_automation') !== null);

  // dual-write: מוטציה ב-legacy → sync מעדכן את ה-blob
  const nextLibrary = { ...LEGACY_FIXTURE.library, 'new-ws': { id: 'new-ws', name: 'סביבה חדשה', automation: {}, agents: [] } };
  localStorage.setItem('wordai_workspaces_library', JSON.stringify(nextLibrary));
  const synced = syncV3FromLegacy();
  check('syncV3FromLegacy קולט מוטציה', Object.keys(synced.workspaces).length === 3 && readWorkspacesV3().workspaces['new-ws'].name === 'סביבה חדשה');

  // apply של blob מהענן → מקרין ל-legacy
  const incoming = buildV3({ ...LEGACY_FIXTURE, pointer: { ...LEGACY_FIXTURE.pointer, activeWorkspaceId: 'default-content-studio' } });
  check('applyWorkspacesV3Blob מחיל', applyWorkspacesV3Blob(incoming) === true);
  const pointerAfter = JSON.parse(localStorage.getItem('wordai_workspace_automation'));
  check('הקרנה ל-legacy: pointer עודכן', pointerAfter.activeWorkspaceId === 'default-content-studio');
  const libraryAfter = JSON.parse(localStorage.getItem('wordai_workspaces_library'));
  check('הקרנה ל-legacy: library הוחלף לגרסת הענן', Object.keys(libraryAfter).length === 2);
  check('blob זבל נדחה', applyWorkspacesV3Blob({ schemaVersion: 99 }) === false);
}

// ---- 11. שלב 4b: פרימיטיבות מקור-אמת (blob truth + הקרנת legacy) ----
console.log('\n[11] workspaces v3 truth primitives');
import {
  readV3WorkspacesLibrary, writeV3WorkspacesLibrary,
  readV3WorkspacePointer, writeV3WorkspacePointer,
  readV3RoleAgents, writeV3RoleAgents,
  readV3Templates, writeV3Templates,
} from '../../src/v3/workspaces/store.js';

{
  // מצב התחלה: ה-blob מהסעיף הקודם קיים. כתיבה דרך ה-store ⇒ blob + הקרנת legacy.
  const nextPointer = { activeWorkspaceId: 'my-legal-workspace', workspaceBypassEnabled: false, enabled: true, preset: 'custom' };
  check('writeV3WorkspacePointer', writeV3WorkspacePointer(nextPointer) === true);
  const pointerFromV3 = readV3WorkspacePointer();
  check('קריאת pointer מה-blob', pointerFromV3.activeWorkspaceId === 'my-legal-workspace' && pointerFromV3.enabled === true);
  const legacyPointer = JSON.parse(localStorage.getItem('wordai_workspace_automation'));
  check('הקרנת legacy: pointer', legacyPointer.activeWorkspaceId === 'my-legal-workspace' && legacyPointer.workspaceBypassEnabled === false);

  const nextLibrary = { 'ws-a': { id: 'ws-a', name: 'סביבה א', automation: {}, agents: [] } };
  check('writeV3WorkspacesLibrary', writeV3WorkspacesLibrary(nextLibrary) === true);
  check('קריאת library מה-blob', readV3WorkspacesLibrary()['ws-a'].name === 'סביבה א');
  check('הקרנת legacy: library', JSON.parse(localStorage.getItem('wordai_workspaces_library'))['ws-a'].name === 'סביבה א');

  const agents = [{ id: 'writer', name: 'כותב', prompt: 'כתוב', enabled: true }];
  check('writeV3RoleAgents + הקרנה', writeV3RoleAgents(agents) === true
    && readV3RoleAgents()[0].id === 'writer'
    && JSON.parse(localStorage.getItem('wordai_role_agents'))[0].id === 'writer');

  const templates = { legal: { id: 'legal', label: 'משפטי', pipeline: [] } };
  check('writeV3Templates + הקרנה', writeV3Templates(templates) === true
    && readV3Templates().legal.label === 'משפטי'
    && JSON.parse(localStorage.getItem('wordai_workspace_v2_templates')).legal.label === 'משפטי');

  // עקביות: blob והקרנות תמיד שקולים (round-trip דרך syncV3FromLegacy הוא זהות)
  const before = JSON.stringify(readWorkspacesV3().workspaces);
  syncV3FromLegacy();
  check('syncV3FromLegacy הוא זהות אחרי כתיבות-store', JSON.stringify(readWorkspacesV3().workspaces) === before);
}

console.log(failures === 0 ? '\n✅ כל בדיקות V3 עברו' : `\n❌ ${failures} בדיקות נכשלו`);
process.exit(failures === 0 ? 0 : 1);
