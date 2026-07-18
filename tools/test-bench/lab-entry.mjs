// ============================================================================
// WordFlow LAB entry — bundles the REAL app modules for Node (SSR) and exposes
// them to the test-bench server. NO reimplementation: every capability runs the
// exact code path the app uses, so the LAB stays in sync from code level up to
// the actual prompt sent to the provider.
//
// Fidelity:
//  • Agents run through ai.chatWithActiveProvider with the same options object
//    AiSidebar.invokeDirectCall builds (provider-pin, source-query, system ctx).
//  • Source retrieval runs srcretr.retrieveSources with the Node URL verifier
//    (HEAD→GET, parallels Rust verify_url).
//  • Document generation runs wls.generateDocumentFromPrompt (write-with-sources).
//  • Every outgoing provider request is captured (masked) so the UI shows the
//    ACTUAL query/prompt on the wire.
//
// Built via:  WORDAI_VERIFY_ENTRY=lab npx vite build --config vite.verify.config.mjs
// Consumed by tools/test-bench/server.mjs (imports the built sf.mjs).
// ============================================================================

// ---- browser shims (aiService is browser-coupled) ----
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
if (typeof globalThis.navigator === 'undefined') globalThis.navigator = { userAgent: 'node-lab', language: 'he' };
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

// ---- masking ----
const maskWire = (s) => String(s || '')
  .replace(/(api_key=)[^&\s]+/gi, '$1***')
  .replace(/([?&]key=)[^&\s]+/gi, '$1***')
  .replace(/AIza[0-9A-Za-z_-]{20,}/g, 'AIza***')
  .replace(/Bearer\s+[^"'\s]+/gi, 'Bearer ***')
  .replace(/pplx-[0-9A-Za-z]+/g, 'pplx-***')
  .replace(/sk-[0-9A-Za-z_-]+/g, 'sk-***');

// ---- wire capture: record EXACT outgoing provider requests (masked) ----
const WIRE = [];
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input?.url || String(input));
    let host = url.slice(0, 60);
    try { host = new URL(url).host; } catch {}
    WIRE.push({
      method: init.method || 'GET',
      host,
      url: maskWire(url).slice(0, 500),
      body: init.body ? maskWire(String(init.body)).slice(0, 4000) : '',
      ts: WIRE.length,
    });
    return realFetch(input, init);
  };
}
function beginCapture() { return WIRE.length; }
function endCapture(from) { return WIRE.slice(from); }

// ---- real modules ----
const ai = await import('aiservice');
const { AGENTS_CONFIG } = await import('agentcfg');
const sqb = await import('sqb');
const srcretr = await import('srcretr');
const wls = await import('wls');
const styleauth = await import('styleauth');
const spss = await import('spss');
// ---- Personal Style Engine services ----
const styleProfile = await import('styleprofile');
const styleSamples = await import('stylesamples');
const styleIngest = await import('styleingest');
const styleRetrieval = await import('styleretrieval');
const styleJudge = await import('stylejudge');

// Node URL verifier (parallels Rust verify_url): HEAD→GET, follow redirects, 5s.
// Extra vs Rust: on a live page we GET and parse <title>, returning it so the
// pipeline can enrich domain-only titles (Gemini grounding). Rust stays HEAD-only.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const extractHtmlTitle = (html) => {
  const m = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return '';
  return m[1].replace(/\s+/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim().slice(0, 300);
};
srcretr.setUrlVerifierTransport(async (urls, { timeoutMs = 5000 } = {}) => Promise.all(urls.map(async (url) => {
  const req = async (method, readBody) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { method, redirect: 'follow', headers: { 'User-Agent': UA }, signal: controller.signal });
      let title = '';
      if (readBody && resp.ok && /text\/html/i.test(resp.headers.get('content-type') || '')) {
        try { title = extractHtmlTitle((await resp.text()).slice(0, 60000)); } catch {}
      } else { try { await resp.body?.cancel(); } catch {} }
      return { status: resp.status, finalUrl: resp.url || url, title };
    } finally { clearTimeout(timer); }
  };
  try {
    let result = await req('HEAD', false);
    const alive = result.status >= 200 && result.status < 400;
    // GET for the real <title> on live pages (or when HEAD is unsupported).
    if (alive || result.status === 405 || result.status === 501) result = await req('GET', true);
    return { url, ok: result.status >= 200 && result.status < 400, status: result.status, finalUrl: result.finalUrl, title: result.title || '' };
  } catch (err) {
    return { url, ok: false, status: 0, finalUrl: '', title: '', error: String(err?.message || err) };
  }
})));

// ---- config seeding (DPAPI-decrypted JSON handed in by the server) ----
function seedConfig(cfgJson) {
  if (!cfgJson) return false;
  localStorage.setItem('ai_provider_config', typeof cfgJson === 'string' ? cfgJson : JSON.stringify(cfgJson));
  try { ai.hydrateProviderConfigFromDisk?.(); } catch {}
  return true;
}

// Seed the app-settings snapshot (DPAPI-decrypted app-settings.json). This carries
// the real personal-style profile (wordai_personal_style) + workspace prefs into
// localStorage, so generation uses the SAME style the app would.
function seedAppSettings(snapshotJson) {
  if (!snapshotJson) return false;
  try {
    const snapshot = typeof snapshotJson === 'string' ? JSON.parse(snapshotJson) : snapshotJson;
    return ai.applyPersistedAppSettingsSnapshot(snapshot, { replaceExisting: true });
  } catch { return false; }
}

// Summary of the loaded personal-style profile (no secrets — style prefs only).
function getStyleProfile() {
  const p = ai.getPersonalStyleProfile();
  const meaningful = ai.hasMeaningfulPersonalProfileData(p);
  const count = (v) => Array.isArray(v) ? v.length : 0;
  return {
    hasProfile: meaningful,
    displayName: p.displayName || '',
    tonePreference: p.tonePreference || '',
    lengthPreference: p.lengthPreference || '',
    manualVocabulary: count(p.manualVocabulary),
    manualPhrases: count(p.manualPhrases),
    learnedVocabulary: count(p.learnedVocabulary),
    learnedPhrases: count(p.learnedPhrases),
    examples: count(p.examples),
    notes: (p.notes || '').slice(0, 200),
    calibrated: !!(p.authenticityCalibration && p.authenticityCalibration.weights),
  };
}

const htmlToPlain = (html) => String(html)
  // Preserve block structure: insert paragraph breaks at block-element boundaries
  // BEFORE stripping tags, so paragraphCount/avgParagraphWords survive into computeLocalMetrics.
  .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article)\s*>/gi, '\n\n')
  .replace(/<br\s*\/?>/gi, '\n\n')
  .replace(/<[^>]+>/g, ' ')
  // Collapse horizontal whitespace but keep newlines; trim spaces around newlines
  // without eating them; then collapse runs of blank lines to a single blank line.
  .replace(/[ \t\f\v]+/g, ' ')
  .replace(/ *\n */g, '\n')
  .replace(/\n{2,}/g, '\n\n')
  .trim();

async function genOnce(prompt, dropdown, model = '') {
  const explicit = dropdown && dropdown !== 'default' ? dropdown : '';
  const cfg = ai.getProviderConfig();
  const pinnedModel = explicit
    ? (model ? ai.normalizeProviderModelName(explicit, String(model).trim()) : String(cfg?.[explicit]?.model || ''))
    : '';
  const result = await wls.generateDocumentFromPrompt({
    prompt, templateId: 'blank', instructions: '', selectedMaterials: [],
    selectedModel: '', selectedProviderId: explicit,
    selectedProviderModel: pinnedModel,
    additionalReviewRounds: 0, forceDirectMode: false, skipWorkflowAutomation: false,
    useWorkspaceV2: false, returnMeta: true,
  });
  return typeof result === 'string' ? result : (result?.html || result?.text || '');
}

// Same as genOnce but returns the full returnMeta result (for the doc tab metrics).
async function genOnceMeta(prompt, dropdown, model = '', includeSources = null, materials = null, workspace = null, sourceRoute = '', extraOpts = {}) {
  const explicit = dropdown && dropdown !== 'default' ? dropdown : '';
  const cfg = ai.getProviderConfig();
  const pinnedModel = explicit
    ? (model ? ai.normalizeProviderModelName(explicit, String(model).trim()) : String(cfg?.[explicit]?.model || ''))
    : '';
  // materials: [{name, text}] — לבדיקת bleed מחומרים מצורפים לנתיב יצירת-מסמך.
  const selectedMaterials = Array.isArray(materials) && materials.length
    ? materials.map((m, i) => ({ id: `mat-${i}`, name: m.name || `material-${i}.txt`, text: m.text || '', previewText: m.text || '', source: 'materials' }))
    : [];
  // workspace: { useWorkspaceV2, workspaceV2TemplateId, additionalReviewRounds } — הרצת ה-pipeline
  // של סביבת-העבודה (V2) במקום מסלול ישיר, לבדיקת "הסביבה מטפלת בעבודה".
  const useWorkspaceV2 = Boolean(workspace?.useWorkspaceV2);
  return wls.generateDocumentFromPrompt({
    prompt, templateId: workspace?.templateId || 'blank', instructions: '', selectedMaterials,
    selectedModel: '', selectedProviderId: explicit, selectedProviderModel: pinnedModel,
    additionalReviewRounds: Number(workspace?.additionalReviewRounds) || 0, forceDirectMode: false, skipWorkflowAutomation: false,
    useWorkspaceV2, workspaceV2TemplateId: useWorkspaceV2 ? String(workspace?.workspaceV2TemplateId || '') : '',
    returnMeta: true, includeSources, sourceRoute: String(sourceRoute || ''),
    ...(extraOpts || {}),
  });
}

function scoreAgainst(text, profile) {
  const r = styleauth.scoreTextAuthenticity(text, { profile });
  if (!r.ok) return { ok: false, reason: r.reason, message: r.message };
  return {
    ok: true, score: r.score, label: r.label, threshold: r.threshold, calibrated: r.calibrated,
    markers: (r.markers || []).map((m) => ({ label: m.label, severity: m.severity, detail: m.detail })),
    wordCount: r.features?.wordCount,
  };
}

// Generate the SAME prompt twice — with the personal style active, and with it
// cleared — then score both against the real profile. Lower score = more in your
// voice / human; higher = generic / machine. delta shows how much style moved it.
async function runStyleComparison({ prompt, dropdown = 'default', model = '' }) {
  const realProfile = ai.getPersonalStyleProfile();
  const hasProfile = ai.hasMeaningfulPersonalProfileData(realProfile);
  const from = beginCapture();
  const t0 = Number(process.hrtime.bigint() / 1000000n);
  let withStyleText = '', withoutStyleText = '', error = '';
  try {
    // 1) with style (real profile in place)
    withStyleText = await genOnce(prompt, dropdown, model);
    // 2) without style — clear the profile, generate, then restore
    ai.savePersonalStyleProfile({});
    try { withoutStyleText = await genOnce(prompt, dropdown, model); }
    finally { ai.savePersonalStyleProfile(realProfile); }
  } catch (e) { error = maskWire(e?.message || String(e)); }
  const durationMs = Number(process.hrtime.bigint() / 1000000n) - t0;

  const withPlain = htmlToPlain(withStyleText);
  const withoutPlain = htmlToPlain(withoutStyleText);
  const withStyle = scoreAgainst(withPlain, realProfile);
  const withoutStyle = scoreAgainst(withoutPlain, realProfile);
  const delta = (withStyle.ok && withoutStyle.ok) ? (withoutStyle.score - withStyle.score) : null;

  return {
    prompt: prompt.slice(0, 200), hasProfile,
    withStyle: { ...withStyle, preview: maskWire(withPlain).slice(0, 1200), htmlLength: withStyleText.length },
    withoutStyle: { ...withoutStyle, preview: maskWire(withoutPlain).slice(0, 1200), htmlLength: withoutStyleText.length },
    delta,  // positive = style made output more in-your-voice (lower generic score)
    wire: endCapture(from), error, durationMs,
  };
}

// Score arbitrary pasted text against the real profile (quick check, no generation).
function scoreText({ text }) {
  const profile = ai.getPersonalStyleProfile();
  return { hasProfile: ai.hasMeaningfulPersonalProfileData(profile), ...scoreAgainst(htmlToPlain(text), profile) };
}

// ---- agent catalogue for the UI ----
function getAgents() {
  return Object.entries(AGENTS_CONFIG).map(([id, a]) => ({
    id,
    label: a.label,
    route: a.route || '',
    inline: !!a.inline,
    hasSystemCtx: !!(a.taskpaneSystemCtx || a.systemCtx),
    placeholder: a.placeholder || '',
  }));
}

function resolveModelForProvider(providerId) {
  const cfg = ai.getProviderConfig();
  const raw = String(cfg?.[providerId]?.model || '').trim();
  return ai.normalizeProviderModelName(providerId, raw);
}

// Generalised replica of AiSidebar.invokeDirectCall for ANY agent.
// dropdown: 'default' (agent route) | providerId (explicit pin).
function buildAgentRequest(agentId, { txt, dropdown = 'default', selection = {}, modelOverride = '', chatScope = 'document', forceInternetInfo = false }) {
  // צ'אט ישיר בלי סוכן (assistant-main/chat) — פסאודו-סוכן בלי systemCtx, כמו במסלול הרגיל.
  const cAgent = AGENTS_CONFIG[agentId]
    || ((agentId === 'assistant-main' || agentId === 'chat') ? { label: 'צ׳אט ישיר', systemCtx: '', inline: false } : null);
  if (!cAgent) throw new Error(`unknown agent: ${agentId}`);
  const selectedText = selection.selectedText || '';
  const currentBlockText = selection.currentBlockText || '';
  const docCtx = selection.docCtx || '';
  const messages = selection.messages || [];

  // provider-pin resolution (AiSidebar ~3665-3714), agent-agnostic
  const forceGlobalSidebarProvider = false;
  const selectedProviderId = dropdown;
  const userExplicitSidebarProvider = !forceGlobalSidebarProvider
    && Boolean(selectedProviderId) && selectedProviderId !== 'default';
  const explicitProviderId = userExplicitSidebarProvider ? selectedProviderId : '';
  const routeProviderId = String(cAgent?.sidebarSelection?.providerId || cAgent?.route || '').trim();
  const finalProviderId = explicitProviderId || routeProviderId;
  // Explicit model override (LAB multi-model): pin a specific model on the chosen provider.
  const overrideModel = explicitProviderId && modelOverride
    ? ai.normalizeProviderModelName(explicitProviderId, String(modelOverride).trim()) : '';
  const finalProviderModel = explicitProviderId
    ? (overrideModel || resolveModelForProvider(explicitProviderId))
    : String(cAgent?.sidebarSelection?.model || '').trim();
  const finalPinnedProviderId = finalProviderId && finalProviderId !== 'default' ? finalProviderId : '';
  const resolvedFinalProviderModel = finalProviderModel || (finalPinnedProviderId ? resolveModelForProvider(finalPinnedProviderId) : '');
  const pinExplicitProvider = forceGlobalSidebarProvider || userExplicitSidebarProvider;
  const globalLockProviderOverride = pinExplicitProvider ? finalPinnedProviderId : '';
  const globalLockModelOverride = pinExplicitProvider ? resolvedFinalProviderModel : '';
  const strictProviderId = globalLockProviderOverride;
  const runtimeStrictProviderOverride = pinExplicitProvider;
  const hasStrictRuntimeProviderOverride = runtimeStrictProviderOverride && Boolean(strictProviderId);
  const preferredProviderId = hasStrictRuntimeProviderOverride ? '' : finalPinnedProviderId;
  const preferredProviders = preferredProviderId ? [preferredProviderId] : [];
  const directProviderId = hasStrictRuntimeProviderOverride ? strictProviderId : '';
  const hasPinnedProviderPreference = hasStrictRuntimeProviderOverride || preferredProviders.length > 0;
  const explicitProviderModel = hasStrictRuntimeProviderOverride
    ? globalLockModelOverride
    : (preferredProviderId ? resolvedFinalProviderModel : '');

  // sources/holeFill query building — SHARED module
  const isSourceAgent = agentId === 'sources' || agentId === 'holeFill';
  const sourcesQueryOverride = isSourceAgent
    ? sqb.buildSourcesQueryOverride(txt, { selectedText, currentBlockText }) : '';
  const sourcesNewsRequest = isSourceAgent
    ? sqb.isSourcesNewsRequest(txt, sourcesQueryOverride, { selectedText, currentBlockText }) : false;

  // system prompt (AiSidebar ~3661: taskpaneSystemCtx || systemCtx)
  const finalExtraSystemPrompt = String(cAgent?.taskpaneSystemCtx || cAgent?.systemCtx || '').trim();

  // document context (AiSidebar buildContext ~3196)
  const baseDocContext = selectedText
    ? `טקסט נבחר: "${selectedText}"\n\nפסקה נוכחית: "${currentBlockText}"\n\n${docCtx}`
    : currentBlockText
      ? `פסקה נוכחית: "${currentBlockText}"\n\n${docCtx}`
      : (docCtx ? `מסמך פעיל:\n${docCtx}` : '');
  // נספח AI: מזריקים את הקול האישי של המשתמש כמו במסלול האמיתי (AiSidebar buildContext).
  const aiAppendixVoice = agentId === 'aiAppendix'
    ? (() => { const v = ai.buildPersonalStyleVoiceBlock?.() || ''; return v ? `קול אישי של המשתמש (נסח את הפרומפטים והרפלקציה בקול הזה, מותאם למשלב צ'אט):\n${v}` : ''; })()
    : '';
  const baseContext = [aiAppendixVoice, baseDocContext].filter(Boolean).join('\n\n');

  const requestedSplitCallCount = Number(cAgent?.defaultSplitCallCount || 0);
  const directAgentName = hasPinnedProviderPreference ? `${cAgent.label} · ${finalProviderId}` : cAgent.label;
  const statusLog = [];

  const options = {
    agentId,
    agentLabel: directAgentName,
    agentName: cAgent.label,
    skillId: '',
    autoUseDefaultSkill: true,
    skipSkillSelection: agentId === 'lecturer',
    forceSuppressResearchRouting: agentId === 'lecturer',
    directChat: true,
    conversationHistory: messages,
    includeAppMemory: true,
    providerOverride: directProviderId,
    preferredProviders,
    modelOverride: explicitProviderModel,
    strictProviderOverride: hasStrictRuntimeProviderOverride,
    sourceQueryOverride: sourcesQueryOverride,
    sourceQuerySource: sourcesQueryOverride ? 'taskpaneSourcesContext' : '',
    isAcademicTask: agentId === 'sources' && !sourcesNewsRequest,
    editModeRequest: false,
    allowEditModeRoutingOverride: false,
    editModeExplicitSkillInvocation: false,
    skipAutomation: true,
    skipAutomationPrompt: true,
    skipMultiModel: hasPinnedProviderPreference || requestedSplitCallCount >= 2,
    preserveFullDocumentContext: false,
    documentFallbackHtml: '',
    chatScope: String(chatScope || 'document'),
    forceInternetInfo: forceInternetInfo === true,
    phase: 'single', stepIndex: 1, stepCount: 1,
    onStatus: (p) => { try { statusLog.push(maskWire(JSON.stringify(p)).slice(0, 300)); } catch {} },
  };
  return { userPrompt: txt, documentContext: baseContext, extraSystemPrompt: finalExtraSystemPrompt, options, statusLog };
}

// Public: build-only (no network) — inspect the exact prompt/options the app would send.
function inspectAgent(agentId, input) {
  const req = buildAgentRequest(agentId, input);
  return {
    agentId,
    systemPrompt: req.extraSystemPrompt,
    userPrompt: req.userPrompt,
    documentContext: req.documentContext,
    options: sanitizeOptions(req.options),
  };
}

function sanitizeOptions(o) {
  const { onStatus, conversationHistory, ...rest } = o;
  return { ...rest, conversationHistoryLen: (conversationHistory || []).length };
}

// Configured providers + their available models (for the multi-model picker).
function getProviders() {
  const cfg = ai.getProviderConfig();
  return ai.getConfiguredProviderChoices(cfg).map((p) => ({
    id: p.id, label: p.label, isDefault: p.isDefault,
    configuredModel: String(cfg?.[p.id]?.model || '').trim(),
    models: ai.getProviderModelChoices(p.id, cfg),
  }));
}

// Public: run the agent for real through chatWithActiveProvider.
async function runAgent(agentId, input) {
  const req = buildAgentRequest(agentId, input);
  const from = beginCapture();
  const t0 = Number(process.hrtime.bigint() / 1000000n);
  let reply = '', error = '', rawShape = '';
  try {
    const out = await ai.chatWithActiveProvider(req.userPrompt, req.documentContext, req.extraSystemPrompt, req.options);
    rawShape = typeof out === 'string' ? `string(${out.length})` : `object{${Object.keys(out || {}).join(',')}}`;
    reply = typeof out === 'string'
      ? out
      : String(out?.text || out?.reply || out?.content || out?.html || JSON.stringify(out));
  } catch (e) {
    error = maskWire(e?.message || String(e));
  }
  const durationMs = Number(process.hrtime.bigint() / 1000000n) - t0;
  return {
    agentId,
    systemPrompt: req.extraSystemPrompt,
    userPrompt: req.userPrompt,
    documentContext: req.documentContext,
    options: sanitizeOptions(req.options),
    statusLog: req.statusLog,
    wire: endCapture(from),
    reply: maskWire(reply),
    rawShape,
    error,
    durationMs,
  };
}

// Public: run the SAME agent+prompt across several provider/model targets and
// compare. targets = [{provider, model}]. Runs sequentially so wire capture stays
// attributable per target. Each target is an explicit pin (dropdown = provider).
async function runAgentMulti(agentId, input, targets = []) {
  const list = Array.isArray(targets) && targets.length ? targets : [{ provider: 'default', model: '' }];
  const results = [];
  for (const t of list) {
    const provider = t.provider || 'default';
    const r = await runAgent(agentId, {
      txt: input.txt, selection: input.selection || {},
      dropdown: provider, modelOverride: t.model || '',
    });
    results.push({
      provider,
      requestedModel: t.model || '(from config)',
      resolvedModel: r.options?.modelOverride || '(route default)',
      reply: r.reply, rawShape: r.rawShape, error: r.error, durationMs: r.durationMs, wire: r.wire,
    });
  }
  return { agentId, count: results.length, results };
}

// Public: real source retrieval with full event trail. `providers` optionally
// restricts which source providers run — we mask the others' keys, since
// buildAttempts keys off cfg[provider].key (faithful single-provider testing).
async function retrieveSourcesLab({ query, kind = 'academic', count = 3, after = '', providers = null, blockedDomains = null }) {
  // דומיינים אסורים מותאמים לריצה הזו (מתמזג עם הרשימה הקשיחה בקוד).
  if (Array.isArray(blockedDomains)) { try { ai.saveBlockedSourceDomains(blockedDomains); } catch {} }
  let cfg = ai.getProviderConfig();
  if (Array.isArray(providers) && providers.length) {
    const keep = new Set(providers);              // subset of ['scholar','perplexity','gemini']
    cfg = JSON.parse(JSON.stringify(cfg));
    if (!keep.has('scholar') && cfg.scholar) cfg.scholar.key = '';
    if (!keep.has('perplexity') && cfg.perplexity) cfg.perplexity.key = '';
    if (!keep.has('gemini') && cfg.gemini) cfg.gemini.key = '';
  }
  const events = [];
  const from = beginCapture();
  const t0 = Number(process.hrtime.bigint() / 1000000n);
  let result, error = '';
  try {
    result = await srcretr.retrieveSources({
      query, kind, count, after, cfg,
      session: srcretr.createRetrievalSession({ runId: 'lab' }),
      logEvent: (type, message) => events.push({ type, message: maskWire(String(message)).slice(0, 400) }),
    });
  } catch (e) { error = maskWire(e?.message || String(e)); }
  const durationMs = Number(process.hrtime.bigint() / 1000000n) - t0;
  return {
    query, kind, count,
    ok: result?.ok ?? false,
    failureReason: result?.failureReason || '',
    fromCache: result?.fromCache ?? false,
    providerTrail: result?.providerTrail || [],
    sources: (result?.sources || []).map((s) => ({
      title: s.title, url: s.finalUrl || s.url,
      httpStatus: s.verification?.httpStatus, botBlocked: !!s.verification?.botBlocked,
    })),
    events, wire: endCapture(from), error, durationMs,
  };
}

// Public: real document generation (write-with-sources path).
async function generateDoc({ prompt, dropdown = 'default', model = '', includeSources = null, materials = null, workspace = null, sourceRoute = '' }) {
  const from = beginCapture();
  const t0 = Number(process.hrtime.bigint() / 1000000n);
  let html = '', error = '', meta = null;
  try {
    const result = await genOnceMeta(prompt, dropdown, model, includeSources, materials, workspace, sourceRoute);
    html = typeof result === 'string' ? result : (result?.html || result?.text || '');
    meta = typeof result === 'object' ? { ...result, html: undefined, text: undefined } : null;
  } catch (e) { error = maskWire(e?.message || String(e)); }
  const durationMs = Number(process.hrtime.bigint() / 1000000n) - t0;
  const plain = String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const urls = html.match(/https?:\/\/[^\s"'<)]+/g) || [];
  const citeNums = [...String(html).matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1]));
  const proseCites = (html.match(/\([^)]*?(?:19|20)\d{2}[^)]*?\)/g) || []).slice(0, 20);
  const daroshMakor = (html.match(/\[דרוש מקור\]/g) || []).length;
  let debugEvents = [];
  try {
    const dbg = JSON.parse(globalThis.localStorage.getItem('wordai_agent_debug_logs') || '[]');
    debugEvents = dbg
      .filter((r) => /source-retrieval-plan|verified-source-retrieval|verified-source-candidate-rejected|source-output-blocked|verified-source-output-blocked|source-topic-derived|verified-source-bibliography-appended|source-domain-blocked|single-call-source|source-relevance-vet|source-routing-decision|source-lock-applied|stale-lock-rejected/.test(String(r.type || '')))
      .map((r) => ({ type: r.type, message: maskWire(String(r.message || '')).slice(0, 300) }));
  } catch {}
  return {
    prompt: prompt.slice(0, 200),
    htmlLength: String(html).length,
    plainPreview: maskWire(plain).slice(0, 2000),
    fullHtml: maskWire(String(html)),
    meta,
    metrics: {
      urls: urls.slice(0, 20),
      urlCount: urls.length,
      maxCiteIndex: citeNums.length ? Math.max(...citeNums) : 0,
      distinctCites: [...new Set(citeNums)].sort((a, b) => a - b),
      proseCitations: proseCites,
      daroshMakorMarkers: daroshMakor,
    },
    retrievalEvents: debugEvents,
    wire: endCapture(from), error, durationMs,
  };
}

// ---- SPSS guided-studio pipeline (faithful replica of SpssProjectStudio.onGenerateAllCode) ----
// Drives the REAL spssSyntaxService: parseCsvText → analyzeSpssAssignment → per-analysis
// generateSpssSyntax with the 3-step retry ladder + prep-first ordering → reviewSpssMasterSyntax
// (pre-flight) → assemble. Same code that ships; this is the "show me the generated code" path.
const SPSS_PREP_METHOD_PATTERN = /(reliability|cronbach|recode|compute|scale|index|reverse|dummy|missing|מהימנות|סולם|מדד|היפוך|recoding|דמ[יה]|חסר)/i;
const spssIsPrep = (item) => SPSS_PREP_METHOD_PATTERN.test(`${item?.method || ''} ${item?.label || ''}`);
const SPSS_MASTER_PREAMBLE = [
  '* ═══════════════════════════════════════════════════════════════════════.',
  '* חשוב: הרץ את כל הסינטקס יחד, מלמעלה למטה, על קובץ הנתונים המקורי (Run → All).',
  '* משתנים מחושבים נוצרים בשלבי ההכנה ונשמרים רק בזיכרון.',
  '* ═══════════════════════════════════════════════════════════════════════.',
].join('\n');
const spssAssembleMaster = (blocks) => {
  const body = blocks
    .map((b, i) => `* --- ${i + 1}. ${String(b.title || 'SPSS block').replace(/\s+/g, ' ').trim()} ---.\n${String(b.syntax || '').trim()}`)
    .join('\n\n').trim();
  return body ? `${SPSS_MASTER_PREAMBLE}\n\n${body}` : '';
};

function spssColumnDigest(analysis) {
  return (analysis?.columns || []).map((c) => ({
    token: c.token,
    name: c.originalName,
    outputName: c.outputName,
    role: c.analysisRole,
    type: c.inferredType,
    level: c.measurementLevel,
    distinct: c.distinctCount,
    range: c.numericStats ? `${c.numericStats.min}..${c.numericStats.max}` : '',
    suspectedMissing: Array.isArray(c.suspectedMissingCodes) ? c.suspectedMissingCodes : [],
  }));
}

// ---- .sav parsing in Node (real fs.stream.Readable — no browser shim needed) ----
// Mirrors src/services/spssDataIngest.js's readSpssSavFileInBrowser normalization
// (normalizeDeclaredMissing / normalizeSpssSavCellValue) so the shape fed into
// spss.parseSpssSavDataset({fileName, variables, rows}) is identical to the app's.
// 'sav-reader-core' resolves via the vite.verify.config.mjs alias to
// node_modules/sav-reader/dist/SavReader.js (same package.json dep as the app;
// no new dependency). Node's real stream.Readable.from() works fine here — the
// browser-only createBufferReadable() workaround in spssDataIngest.js is not needed.
function spssNormalizeDeclaredMissing(missing) {
  if (missing === null || missing === undefined) return null;
  const discrete = [];
  let range = null;
  if (typeof missing === 'number') {
    if (Number.isFinite(missing)) discrete.push(missing);
  } else if (Array.isArray(missing)) {
    missing.forEach((value) => { if (typeof value === 'number' && Number.isFinite(value)) discrete.push(value); });
  } else if (typeof missing === 'object') {
    const min = Number(missing.min);
    const max = Number(missing.max);
    if (Number.isFinite(min) && Number.isFinite(max)) range = { min, max };
    if (typeof missing.value === 'number' && Number.isFinite(missing.value)) discrete.push(missing.value);
  }
  if (!discrete.length && !range) return null;
  return { discrete, range };
}
function spssNormalizeSavCellValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  return String(value);
}
async function parseSavBufferToDataset(buffer, fileName = 'dataset.sav') {
  const { Readable } = await import('node:stream');
  const { SavReader } = await import('sav-reader-core');
  const readable = Readable.from(buffer);
  const sav = new SavReader(readable);
  await sav.open();

  const variables = Array.isArray(sav.meta?.sysvars)
    ? sav.meta.sysvars.map((variable) => ({
        name: String(variable?.name || '').trim(),
        label: String(variable?.label || '').trim(),
        type: variable?.type === 0 ? 'numeric' : 'string',
        valueLabels: typeof sav.meta?.getValueLabels === 'function'
          ? (sav.meta.getValueLabels(variable?.name) || []).map((entry) => ({
              value: spssNormalizeSavCellValue(entry?.val),
              label: String(entry?.label || '').trim(),
            }))
          : [],
        declaredMissing: spssNormalizeDeclaredMissing(variable?.missing),
      })).filter((variable) => variable.name)
    : [];
  if (!variables.length) throw new Error('לא זוהו משתנים בקובץ ה-SAV.');

  const rawRows = await sav.readAllRows(true);
  const rows = (Array.isArray(rawRows) ? rawRows : []).map((row) => {
    const normalizedRow = {};
    variables.forEach((variable) => { normalizedRow[variable.name] = spssNormalizeSavCellValue(row?.[variable.name]); });
    return normalizedRow;
  });
  if (!rows.length) throw new Error('קובץ ה-SAV נקרא, אבל לא נמצאו בו שורות נתונים.');

  return { fileName, rowCount: rows.length, columnCount: variables.length, variables, rows };
}

function parseLabCsvRows(csv = '') {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const text = String(csv || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === ',' && !quoted) { row.push(cell.trim()); cell = ''; continue; }
    if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell.trim());
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += ch;
  }
  row.push(cell.trim());
  if (row.some((v) => v !== '')) rows.push(row);
  const headers = rows[0] || [];
  const dataRows = rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
  return { headers, dataRows };
}

const SPSS_PREVIEW_KEYWORDS = new Set('T TEST T-TEST ONEWAY ANOVA UNIANOVA GLM DESCRIPTIVES FREQUENCIES EXAMINE LIST CORRELATIONS REGRESSION CROSSTABS MEANS GRAPH CTABLES MISSING VALUES VARIABLE LABELS VALUE LABELS FORMATS EXECUTE COMPUTE RECODE INTO IF DO ELSE END COUNT NUMERIC STRING VECTOR TEMPORARY SELECT BY WITH TO ALL VARIABLES STATISTICS CELLS GROUPS DEPENDENT METHOD ENTER'.split(/\s+/));
const SPSS_PREVIEW_COMMANDS = [
  'T-TEST', 'ONEWAY', 'ANOVA', 'UNIANOVA', 'GLM', 'DESCRIPTIVES', 'FREQUENCIES', 'EXAMINE',
  'CORRELATIONS', 'REGRESSION', 'CROSSTABS', 'MEANS', 'GRAPH', 'MISSING VALUES', 'COMPUTE', 'RECODE', 'EXECUTE',
];

function numericValuesFor(rows, name, missing = new Set()) {
  return rows
    .map((row) => Number(String(row[name] ?? '').trim()))
    .filter((value) => Number.isFinite(value) && !missing.has(value));
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
}

function sd(values) {
  if (values.length < 2) return NaN;
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + ((value - m) ** 2), 0) / (values.length - 1));
}

function previewMissingMap(syntax = '') {
  const map = new Map();
  const re = /^\s*MISSING\s+VALUES\s+([A-Za-z][\w$#@]*)\s+\(([^)]+)\)\s*\./gim;
  let match = re.exec(syntax);
  while (match) {
    const set = map.get(match[1]) || new Set();
    const body = match[2];
    const range = body.match(/(-?\d+(?:\.\d+)?)\s+(?:THRU|TO)\s+(-?\d+(?:\.\d+)?)/i);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      for (let value = start; value <= end; value += 1) set.add(value);
    }
    (body.match(/-?\d+(?:\.\d+)?/g) || []).forEach((value) => set.add(Number(value)));
    map.set(match[1], set);
    match = re.exec(syntax);
  }
  return map;
}

function simulateSpssPreview({ csv = '', syntax = '' } = {}) {
  const from = beginCapture();
  const t0 = Number(process.hrtime.bigint() / 1000000n);
  try {
    const analysis = spss.parseCsvText(String(csv || ''), { fileName: 'lab.csv' });
    const { headers, dataRows } = parseLabCsvRows(csv);
    const columns = spssColumnDigest(analysis);
    const allowed = new Set(columns.flatMap((c) => [c.token, c.name, c.outputName]).filter(Boolean));
    const derived = new Set(Array.from(spss.collectDeclaredTargetNames(syntax)));
    derived.forEach((name) => allowed.add(name));
    const missingMap = previewMissingMap(syntax);
    const issues = [];
    const cleanSyntax = String(syntax || '').trim();
    if (!cleanSyntax) issues.push({ severity: 'error', message: 'אין syntax לסימולציה.' });

    const commands = cleanSyntax.split(/\n(?=\s*(?:[A-Z][A-Z -]+|[*]))/i).map((part) => part.trim()).filter(Boolean);
    commands.forEach((command, index) => {
      if (command.startsWith('*')) return;
      if (!command.endsWith('.')) issues.push({ severity: 'error', message: `Command ${index + 1}: חסרה נקודה מסיימת.` });
    });

    const namesInSyntax = Array.from(new Set((cleanSyntax.match(/\b[A-Za-z][A-Za-z0-9_$#@]{1,63}\b/g) || [])
      .filter((word) => !SPSS_PREVIEW_KEYWORDS.has(word.toUpperCase()))
      .filter((word) => !SPSS_PREVIEW_COMMANDS.some((cmd) => cmd.replace(/\W/g, '').toUpperCase() === word.toUpperCase()))));
    const likelyVars = namesInSyntax.filter((word) => /_|VAR_\d+|[a-z][a-z0-9_]*\d*$/i.test(word));
    likelyVars.forEach((word) => {
      if (!allowed.has(word)) issues.push({ severity: 'warning', message: `ייתכן ש-SPSS ידווח על undefined variable: ${word}` });
    });

    const detectedCommands = SPSS_PREVIEW_COMMANDS.filter((cmd) => new RegExp(`\\b${cmd.replace(/\s+/g, '\\s+')}\\b`, 'i').test(cleanSyntax));
    const sections = [];
    const availableNames = columns.map((c) => c.outputName || c.name).filter((name) => headers.includes(name));
    const referenced = availableNames.filter((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(cleanSyntax));
    const numericReferenced = referenced.filter((name) => numericValuesFor(dataRows, name, missingMap.get(name)).length);

    if (/\b(?:DESCRIPTIVES|EXAMINE|MEANS)\b/i.test(cleanSyntax)) {
      const rows = (numericReferenced.length ? numericReferenced : availableNames)
        .map((name) => {
          const values = numericValuesFor(dataRows, name, missingMap.get(name));
          if (!values.length) return '';
          return `${name}: N=${values.length}, Mean=${mean(values).toFixed(3)}, SD=${Number.isFinite(sd(values)) ? sd(values).toFixed(3) : '—'}, Min=${Math.min(...values)}, Max=${Math.max(...values)}`;
        })
        .filter(Boolean);
      if (rows.length) sections.push({ title: 'Descriptives (preview)', lines: rows });
    }

    if (/\bFREQUENCIES\b/i.test(cleanSyntax)) {
      const rows = (referenced.length ? referenced : availableNames).slice(0, 8).map((name) => {
        const counts = new Map();
        dataRows.forEach((row) => {
          const value = String(row[name] ?? '').trim() || '(missing)';
          counts.set(value, (counts.get(value) || 0) + 1);
        });
        return `${name}: ${Array.from(counts.entries()).slice(0, 8).map(([value, count]) => `${value}=${count}`).join(', ')}`;
      });
      if (rows.length) sections.push({ title: 'Frequencies (preview)', lines: rows });
    }

    if (/\b(?:T-TEST|ONEWAY|ANOVA|CORRELATIONS|REGRESSION|CROSSTABS|GRAPH)\b/i.test(cleanSyntax)) {
      sections.push({
        title: 'Procedure response (illustration)',
        lines: detectedCommands
          .filter((cmd) => !['DESCRIPTIVES', 'FREQUENCIES', 'MISSING VALUES', 'COMPUTE', 'RECODE', 'EXECUTE'].includes(cmd))
          .map((cmd) => `${cmd}: זוהתה פקודה. ה-preview אינו מחשב את כל טבלאות SPSS, אבל יבדוק שמות משתנים ויציג סטטיסטיקה בסיסית כשאפשר.`),
      });
    }

    if (missingMap.size) {
      sections.push({ title: 'Missing values applied (preview)', lines: Array.from(missingMap.entries()).map(([name, values]) => `${name}: ${Array.from(values).join(', ')}`) });
    }

    return {
      ok: !issues.some((issue) => issue.severity === 'error'),
      disclaimer: 'זהו dry-run חינוכי של WordFlow LAB, לא מנוע IBM SPSS. להרצה סופית חובה להריץ ב-SPSS.',
      detectedCommands,
      issues,
      sections,
      columns,
      rowCount: dataRows.length,
      wire: endCapture(from),
      durationMs: Number(process.hrtime.bigint() / 1000000n) - t0,
    };
  } catch (e) {
    return { ok: false, error: maskWire(e?.message || String(e)), stack: String(e?.stack || '').split('\n').slice(0, 5), wire: endCapture(from), durationMs: Number(process.hrtime.bigint() / 1000000n) - t0 };
  }
}

// ---- SPSS Syntax Studio path (faithful to the regular SPSS tab) ----
// Uses the same spssSyntaxService primitives that SpssSyntaxStudio calls:
// parseCsvText, buildQuickActionSyntax, generateSpssSyntax, interpretSpssOutput,
// repairSpssSyntaxFromError, and runSpssGuidance.
async function runSpssSyntax({ csv, request = '', mode = 'analysis', actionId = '', column = '', output = '', priorSyntax = '', question = '', provider = '', model = '' }) {
  const from = beginCapture();
  const t0 = Number(process.hrtime.bigint() / 1000000n);
  const route = provider ? { providerOverride: provider, modelOverride: model } : {};
  try {
    const analysis = spss.parseCsvText(String(csv || ''), { fileName: 'lab.csv' });
    const columns = spssColumnDigest(analysis);
    const columnMatch = column
      ? (analysis.columns || []).find((c) => [c.token, c.originalName, c.outputName].some((v) => String(v || '').toLowerCase() === String(column).toLowerCase()))
      : null;
    let result;
    let kind = 'syntax';

    if (String(output || '').trim() && String(priorSyntax || '').trim()) {
      kind = 'repair';
      result = await spss.repairSpssSyntaxFromError({ analysis, priorSyntax, output, ...route });
    } else if (String(output || '').trim()) {
      kind = 'interpret-output';
      result = await spss.interpretSpssOutput({ analysis, output, question, ...route });
    } else if (actionId) {
      kind = 'quick-action';
      const syntax = spss.buildQuickActionSyntax({ actionId, column: columnMatch, tutorMode: true });
      result = { ok: Boolean(syntax && !spss.isGuardrailSyntaxResponse(syntax)), syntax, rawSyntax: syntax, providerId: '', model: '', error: '' };
    } else if (String(question || '').trim() && !String(request || '').trim()) {
      kind = 'guidance';
      result = await spss.runSpssGuidance({ analysis, question, mode, ...route });
    } else {
      result = await spss.generateSpssSyntax({ analysis, request, tutorMode: true, mode, ...route });
    }

    const syntax = result?.syntax || '';
    return {
      ok: result?.ok !== false,
      kind,
      mode,
      actionId,
      selectedColumn: columnMatch ? { token: columnMatch.token, name: columnMatch.originalName, outputName: columnMatch.outputName } : null,
      columns,
      quickActions: spss.SPSS_QUICK_ACTIONS,
      syntax,
      answer: result?.answer || '',
      guidanceMessage: result?.guidanceMessage || '',
      error: result?.error || '',
      providerId: result?.providerId || '',
      model: result?.model || '',
      raw: result,
      wire: endCapture(from),
      durationMs: Number(process.hrtime.bigint() / 1000000n) - t0,
    };
  } catch (e) {
    return { ok: false, error: maskWire(e?.message || String(e)), stack: String(e?.stack || '').split('\n').slice(0, 5), wire: endCapture(from), durationMs: Number(process.hrtime.bigint() / 1000000n) - t0 };
  }
}

// Faithful replica of SpssProjectStudio.onGenerateAllCode (lines ~494-580): ONE
// holistic combinedRequest (prep-first planChecklist + assignmentText), a 2-step
// retry ladder (skipMethodologyGuard on the 2nd attempt), then reviewSpssMasterSyntax.
// Accepts either csv OR a .sav file (base64) — same parseSpssSavDataset the app uses.
async function runSpssProject({ csv = '', savBase64 = '', savFileName = 'dataset.sav', assignmentText = '', draftText = '', provider = '', model = '' } = {}) {
  const from = beginCapture();
  const t0 = Number(process.hrtime.bigint() / 1000000n);
  const route = provider ? { providerOverride: provider, modelOverride: model } : {};
  const steps = [];
  try {
    let analysis;
    let savInfo = null;
    if (String(savBase64 || '').trim()) {
      const buffer = Buffer.from(savBase64, 'base64');
      const dataset = await parseSavBufferToDataset(buffer, savFileName || 'dataset.sav');
      savInfo = { fileName: dataset.fileName, rowCount: dataset.rowCount, columnCount: dataset.columnCount };
      analysis = spss.parseSpssSavDataset(dataset);
    } else {
      analysis = spss.parseCsvText(String(csv || ''), { fileName: 'lab.csv' });
    }
    // Compact metadata the model actually reasons over (role + missing signal).
    const columns = spssColumnDigest(analysis);

    // 1) plan — draftText forwarded so this stays forward-compatible with
    // analyzeSpssAssignment's upcoming draftText param (harmless extra key until it lands).
    const planned = await spss.analyzeSpssAssignment({ assignmentText, analysis, draftText, ...route });
    steps.push({ step: 'plan', ok: planned.ok, model: planned.model, error: planned.error || '' });
    if (!planned.ok) {
      return { ok: false, stage: 'plan', error: planned.error, columns, sav: savInfo, steps, wire: endCapture(from), durationMs: Number(process.hrtime.bigint() / 1000000n) - t0 };
    }
    const profile = planned.profile;

    // 2) ONE holistic combinedRequest — mirrors onGenerateAllCode exactly (prep-first
    // ordering, numbered planChecklist, assignmentText appended, 2-step retry ladder).
    const isPrepItem = (item) => spssIsPrep(item);
    const orderedAnalyses = [
      ...profile.analyses.filter((item) => isPrepItem(item)),
      ...profile.analyses.filter((item) => !isPrepItem(item)),
    ];
    const planChecklist = orderedAnalyses
      .map((item, index) => `${index + 1}. ${item.label}${item.method ? ` (${item.method})` : ''} — ${item.request || item.label}`)
      .join('\n');
    const combinedRequest = [
      'בצע עבודת SPSS מלאה שעונה על כל דרישות המטלה, בסינטקס אחד רציף ומלא.',
      '',
      'טקסט המטלה:',
      String(assignmentText || '').trim(),
      '',
      'תוכנית הניתוחים הנדרשים (בצע את כולם, בסדר הזה — הכנת נתונים תחילה):',
      planChecklist,
      '',
      'הנחיות פלט: הפק syntax אחד שכולל את כל הניתוחים לפי הסדר. לכל מבחן היסק הוסף בדיקות הנחות רלוונטיות (נורמליות, שוויון שונויות). הפרד בין הבלוקים בהערות תיאוריות (* --- כותרת ---.). ספק קוד עשיר ומלא לעבודת סיום — לא מינימלי. השתמש אך ורק במשתנים שבמטא-דאטה; אל תמציא משתנים.',
    ].join('\n');

    let result = await spss.generateSpssSyntax({ analysis, request: combinedRequest, tutorMode: true, mode: 'prep', extraAllowedNames: [], ...route });
    let repaired = false;
    if (!result.ok || !result.syntax) {
      const enrichedRequest = `${combinedRequest}\n(ספק syntax מלא ושמיש; אל תחזיר ERROR אלא אם זה באמת בלתי אפשרי.)`;
      const retry = await spss.generateSpssSyntax({
        analysis, request: enrichedRequest, tutorMode: true, mode: 'prep', extraAllowedNames: [],
        skipMethodologyGuard: true, repairHint: result.guidanceMessage, ...route,
      });
      if (retry.ok && retry.syntax) { result = retry; repaired = true; }
      else { result = retry || result; }
    }
    const genRoute = result?.providerId ? { providerId: result.providerId, model: result.model } : null;
    const succeeded = Boolean(result.ok && result.syntax);
    steps.push({ step: 'generate', ok: succeeded, repaired, model: genRoute?.model, error: succeeded ? '' : (result.guidanceMessage || result.error || '') });

    const profileDigest = {
      summary: profile.summary, deliverable: profile.deliverable, notes: profile.notes,
      analyses: (profile.analyses || []).map((a) => ({ label: a.label, method: a.method, variables: a.variables })),
    };

    if (!succeeded) {
      return {
        ok: false, stage: 'generate', error: result.guidanceMessage || result.error || 'יצירת ה-syntax נעצרה.',
        columns, sav: savInfo, profile: profileDigest, steps,
        blocks: [{ title: 'ניתוח מלא', syntax: `* ${result.guidanceMessage || 'הבקשה נעצרה לפני יצירת syntax.'}`, blocked: true }],
        wire: endCapture(from), durationMs: Number(process.hrtime.bigint() / 1000000n) - t0,
      };
    }

    let masterSyntax = result.syntax;

    // 3) pre-flight review over the master — same call onGenerateAllCode makes.
    let reviewNotes = [];
    let reviewChanged = false;
    const review = await spss.reviewSpssMasterSyntax({ assignmentText, analysis, profile, masterSyntax, ...route });
    reviewNotes = review.notes || [];
    reviewChanged = !!(review.ok && review.changed && review.syntax);
    if (reviewChanged) masterSyntax = review.syntax;
    steps.push({ step: 'preflight-review', changed: reviewChanged, notes: reviewNotes.length, model: review.model, error: review.error || '' });

    // 4) deterministic validators from stages 1-2 of the plan — guarded with typeof
    // checks so the LAB keeps working before those exports land in spssSyntaxService.js.
    let graphSynthesis = null;
    if (typeof spss.ensureGraphCoverage === 'function') {
      try {
        const graph = await spss.ensureGraphCoverage({ profile, analysis, masterSyntax });
        if (graph?.changed && graph.syntax) masterSyntax = graph.syntax;
        graphSynthesis = { changed: !!graph?.changed, missing: graph?.missing || [] };
        steps.push({ step: 'graph-coverage', changed: !!graph?.changed, missing: (graph?.missing || []).length });
      } catch (e) { graphSynthesis = { error: e?.message || String(e) }; }
    }
    let coverageReport = null;
    if (typeof spss.validatePlanCoverage === 'function') {
      try {
        coverageReport = await spss.validatePlanCoverage({ profile, analysis, masterSyntax });
        const gapCount = Array.isArray(coverageReport?.gaps) ? coverageReport.gaps.length : (Array.isArray(coverageReport?.missing) ? coverageReport.missing.length : 0);
        steps.push({ step: 'plan-coverage', gaps: gapCount });
      } catch (e) { coverageReport = { error: e?.message || String(e) }; }
    }

    // Deterministic surfaces the user can eyeball: the MISSING VALUES lines (range fix)
    // and every derived variable name (undefined-var / naming-consistency check).
    const missingValuesLines = (masterSyntax.match(/^MISSING\s+VALUES\b.*$/gim) || []);
    const uniqueDerived = Array.from(new Set(Array.from(spss.collectDeclaredTargetNames(masterSyntax))));

    return {
      ok: true,
      assignment: assignmentText,
      columns,
      sav: savInfo,
      profile: profileDigest,
      repaired,
      blocks: [{ title: 'Master syntax', syntax: masterSyntax, blocked: false, repaired }],
      derivedVariables: uniqueDerived,
      missingValuesLines,
      reviewChanged,
      reviewNotes,
      graphSynthesis,
      coverageReport,
      masterSyntax,
      providerId: genRoute?.providerId || '',
      model: genRoute?.model || '',
      steps,
      wire: endCapture(from),
      durationMs: Number(process.hrtime.bigint() / 1000000n) - t0,
    };
  } catch (e) {
    return { ok: false, error: maskWire(e?.message || String(e)), stack: String(e?.stack || '').split('\n').slice(0, 5), wire: endCapture(from), durationMs: Number(process.hrtime.bigint() / 1000000n) - t0 };
  }
}

async function buildAnalysisFromInput({ csv = '', savBase64 = '', savFileName = 'dataset.sav' } = {}) {
  if (String(savBase64 || '').trim()) {
    const buffer = Buffer.from(savBase64, 'base64');
    const dataset = await parseSavBufferToDataset(buffer, savFileName || 'dataset.sav');
    return spss.parseSpssSavDataset(dataset);
  } else {
    return spss.parseCsvText(String(csv || ''), { fileName: 'lab.csv' });
  }
}

// ---- SPSS plan revision — reviseAssignmentProfile smoke test ----
// Same CSV/analysis pipeline as runSpssProject (spss.parseCsvText → columns digest).
// 3 steps: (1) analyzeSpssAssignment builds an initial plan, (2) reviseAssignmentProfile
// applies a real variable-swap change request, (3) a second revise call asks for a
// variable that does not exist in the dataset — anti-hallucination gate must reject it
// (ok:false, or the bogus name never lands in the returned profile's analyses).
const SPSS_REVISE_SAMPLE_CSV = [
  'מגדר,גיל,שביעות_רצון,הכנסה',
  'זכר,22,4,8500',
  'נקבה,25,5,9200',
  'זכר,31,3,7600',
  'נקבה,28,4,10100',
  'זכר,45,2,6200',
  'נקבה,36,5,11400',
  'זכר,29,3,7900',
  'נקבה,41,4,9800',
  'זכר,24,2,6600',
  'נקבה,33,5,10600',
].join('\n');
const SPSS_REVISE_DEFAULT_ASSIGNMENT = 'בדוק האם יש הבדל בשביעות רצון בין גברים לנשים, וחשב מתאם בין גיל לשביעות רצון.';
const SPSS_REVISE_DEFAULT_CHANGE = 'במקום גיל תשתמש במשתנה אחר שקיים בקובץ.';
const SPSS_REVISE_REJECT_CHANGE = 'תוסיף ניתוח עם המשתנה בלה_בלה_לא_קיים.';

async function runSpssRevisePlan({
  csv = '',
  assignmentText = SPSS_REVISE_DEFAULT_ASSIGNMENT,
  changeRequest = SPSS_REVISE_DEFAULT_CHANGE,
  rejectChangeRequest = SPSS_REVISE_REJECT_CHANGE,
  provider = '',
  model = '',
} = {}) {
  const from = beginCapture();
  const t0 = Number(process.hrtime.bigint() / 1000000n);
  const route = provider ? { providerOverride: provider, modelOverride: model } : {};
  const steps = [];
  try {
    const analysis = spss.parseCsvText(String(csv || '').trim() || SPSS_REVISE_SAMPLE_CSV, { fileName: 'lab.csv' });
    const columns = spssColumnDigest(analysis);

    // 1) plan
    const planned = await spss.analyzeSpssAssignment({ assignmentText, analysis, ...route });
    steps.push({ step: 'plan', ok: planned.ok, model: planned.model, error: planned.error || '' });
    if (!planned.ok) {
      return { ok: false, stage: 'plan', error: planned.error, columns, steps, wire: endCapture(from), durationMs: Number(process.hrtime.bigint() / 1000000n) - t0 };
    }
    const profileBefore = planned.profile;

    // 2) revise — real change request (variable swap)
    const revised = await spss.reviseAssignmentProfile({
      profile: profileBefore, changeRequest, assignmentText, analysis, ...route,
    });
    steps.push({ step: 'revise', ok: revised.ok, model: revised.model, error: revised.error || '' });

    // 3) revise — anti-hallucination smoke test: request a variable that isn't in the file
    const baseForReject = revised.ok && revised.profile ? revised.profile : profileBefore;
    const rejected = await spss.reviseAssignmentProfile({
      profile: baseForReject, changeRequest: rejectChangeRequest, assignmentText, analysis, ...route,
    });
    const bogusToken = 'בלה_בלה_לא_קיים';
    const bogusInPlan = rejected.ok && rejected.profile
      ? (rejected.profile.analyses || []).some((item) => JSON.stringify(item).includes(bogusToken))
      : false;
    const rejectionWorked = rejected.ok === false || !bogusInPlan;
    steps.push({ step: 'revise-reject', ok: rejected.ok, rejectionWorked, error: rejected.error || '' });

    return {
      ok: true,
      columns,
      assignmentText,
      changeRequest,
      rejectChangeRequest,
      profileBefore,
      profileAfterRevise: revised.ok ? revised.profile : null,
      changeSummary: revised.changeSummary || '',
      reviseError: revised.error || '',
      profileAfterReject: rejected.ok ? rejected.profile : null,
      rejectionWorked,
      rejectError: rejected.error || '',
      steps,
      providerId: revised.providerId || planned.providerId || '',
      model: revised.model || planned.model || '',
      wire: endCapture(from),
      durationMs: Number(process.hrtime.bigint() / 1000000n) - t0,
    };
  } catch (e) {
    return { ok: false, error: maskWire(e?.message || String(e)), stack: String(e?.stack || '').split('\n').slice(0, 5), steps, wire: endCapture(from), durationMs: Number(process.hrtime.bigint() / 1000000n) - t0 };
  }
}

// ---- SPSS consult flow — consultAssignmentPlan → reviseAssignmentProfile → generateSpssSyntax ----
// End-to-end smoke test for the "consult produces a derived-variable change, revise applies
// it prep-first, codegen actually emits it" chain. All provider calls pinned to Gemini per
// the LAB's Gemini-only test convention (keys load from encrypted config like every other run).
const SPSS_CONSULT_SAMPLE_CSV = [
  'gender,age,income_level,education_years,occupation_prestige,satisfaction',
  'male,22,4,12,5,5',
  'female,25,6,16,7,6',
  'male,31,3,10,4,3',
  'female,28,7,18,8,6',
  'male,45,8,14,7,4',
  'female,36,5,16,6,5',
  'male,29,4,12,5,4',
  'female,41,9,20,9,7',
  'male,24,3,10,3,3',
  'female,33,6,16,6,5',
  'male,52,7,14,7,4',
  'female,38,8,18,8,6',
].join('\n');
const SPSS_CONSULT_DEFAULT_ASSIGNMENT = 'בדוק האם קיים קשר בין גיל לשביעות רצון, והשווה שביעות רצון בין גברים לנשים.';
const SPSS_CONSULT_DEFAULT_QUESTION = 'במקום גיל, תבנה משתנה מדד שמשקף מעמד סוציו-אקונומי והשתמש בו בניתוח';
const SPSS_CONSULT_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

async function runSpssConsultFlow({
  csv = '',
  assignmentText = SPSS_CONSULT_DEFAULT_ASSIGNMENT,
  question = SPSS_CONSULT_DEFAULT_QUESTION,
} = {}) {
  const from = beginCapture();
  const t0 = Number(process.hrtime.bigint() / 1000000n);
  const route = { providerOverride: 'gemini' };
  const steps = {};
  const failures = [];
  try {
    const analysis = spss.parseCsvText(String(csv || '').trim() || SPSS_CONSULT_SAMPLE_CSV, { fileName: 'lab.csv' });
    const columns = spssColumnDigest(analysis);

    // 1) plan
    const planned = await spss.analyzeSpssAssignment({ assignmentText, analysis, ...route });
    steps.plan = { ok: planned.ok, model: planned.model, error: planned.error || '' };
    if (!planned.ok) {
      failures.push(`plan: ${planned.error || 'analyzeSpssAssignment failed'}`);
      return { ok: false, columns, steps, failures, wire: endCapture(from), durationMs: Number(process.hrtime.bigint() / 1000000n) - t0 };
    }
    const profile = planned.profile;

    // 2) consult — ask for a derived socio-economic index instead of raw age
    const consulted = await spss.consultAssignmentPlan({ profile, question, assignmentText, analysis, ...route });
    const proposedChange = consulted.proposedChange || null;
    const newVariable = proposedChange?.newVariable || null;
    const consultOk = Boolean(consulted.ok && proposedChange);
    if (!consulted.ok) failures.push(`consult: ${consulted.error || 'consultAssignmentPlan failed'}`);
    if (consulted.ok && !proposedChange) failures.push('consult: proposedChange is null — expected a concrete change for this question');
    if (newVariable?.name && !SPSS_CONSULT_NAME_RE.test(newVariable.name)) {
      failures.push(`consult: newVariable.name "${newVariable.name}" is not a valid identifier`);
    }
    steps.consult = {
      ok: consulted.ok, model: consulted.model, error: consulted.error || '',
      consultOk, proposedChange, answer: String(consulted.answer || '').slice(0, 500),
    };
    if (!consultOk) {
      return { ok: false, columns, profile, steps, failures, wire: endCapture(from), durationMs: Number(process.hrtime.bigint() / 1000000n) - t0 };
    }

    // 3) revise — apply the proposed change the same way the UI's "apply advice" flow does
    const derivedName = newVariable?.name || '';
    const changeRequest = [
      proposedChange.changeRequest || '',
      derivedName ? `\n\nמשתנה נגזר לבניה: ${derivedName} — מבוסס על ${(newVariable.buildFrom || []).join(', ')} — ${newVariable.how || ''}` : '',
    ].join('');
    const advisoryContext = `${question}\n${String(consulted.answer || '').slice(0, 1000)}`;
    const revised = await spss.reviseAssignmentProfile({
      profile, changeRequest, assignmentText, analysis,
      advisoryContext, expectedAnalysis: proposedChange.expectedAnalysis || '', ...route,
    });
    const revisedProfile = revised.ok ? revised.profile : null;
    let prepStepFirst = false;
    let nameInBoth = true; // vacuously true when there's no derived variable to check
    if (revisedProfile && Array.isArray(revisedProfile.analyses)) {
      const analyses = revisedProfile.analyses;
      const prepIndex = analyses.findIndex((item) => spssIsPrep(item));
      if (derivedName) {
        const mentions = (item) => `${item?.request || ''} ${(item?.variables || []).join(' ')}`.includes(derivedName);
        const prepMentionsIt = prepIndex >= 0 && mentions(analyses[prepIndex]);
        const consumerIndex = analyses.findIndex((item, idx) => idx !== prepIndex && mentions(item));
        prepStepFirst = prepMentionsIt && consumerIndex > prepIndex;
        nameInBoth = prepMentionsIt && consumerIndex >= 0;
      } else {
        prepStepFirst = prepIndex >= 0;
      }
    }
    if (!revised.ok) failures.push(`revise: ${revised.error || 'reviseAssignmentProfile failed'}`);
    if (derivedName && !prepStepFirst) failures.push('revise: prep step (recode/compute) is not positioned before the consuming analysis');
    if (derivedName && !nameInBoth) failures.push(`revise: derived name "${derivedName}" not found in both the prep step and a consumer analysis`);
    steps.revise = { ok: revised.ok, model: revised.model, error: revised.error || '', prepStepFirst, nameInBoth };
    if (!revised.ok || !revisedProfile) {
      return { ok: false, columns, profile, revisedProfile, steps, failures, wire: endCapture(from), durationMs: Number(process.hrtime.bigint() / 1000000n) - t0 };
    }

    // 4) codegen — same holistic combinedRequest shape as runSpssProject/onGenerateAllCode
    const isPrepItem = (item) => spssIsPrep(item);
    const orderedAnalyses = [
      ...revisedProfile.analyses.filter((item) => isPrepItem(item)),
      ...revisedProfile.analyses.filter((item) => !isPrepItem(item)),
    ];
    const planChecklist = orderedAnalyses
      .map((item, index) => `${index + 1}. ${item.label}${item.method ? ` (${item.method})` : ''} — ${item.request || item.label}`)
      .join('\n');
    const combinedRequest = [
      'בצע עבודת SPSS מלאה שעונה על כל דרישות המטלה, בסינטקס אחד רציף ומלא.',
      '',
      'טקסט המטלה:',
      String(assignmentText || '').trim(),
      '',
      'תוכנית הניתוחים הנדרשים (בצע את כולם, בסדר הזה — הכנת נתונים תחילה):',
      planChecklist,
      '',
      'הנחיות פלט: הפק syntax אחד שכולל את כל הניתוחים לפי הסדר. לכל מבחן היסק הוסף בדיקות הנחות רלוונטיות (נורמליות, שוויון שונויות). הפרד בין הבלוקים בהערות תיאוריות (* --- כותרת ---.). ספק קוד עשיר ומלא לעבודת סיום — לא מינימלי. השתמש אך ורק במשתנים שבמטא-דאטה; אל תמציא משתנים.',
    ].join('\n');

    let genResult = await spss.generateSpssSyntax({ analysis, request: combinedRequest, tutorMode: true, mode: 'prep', extraAllowedNames: derivedName ? [derivedName] : [], ...route });
    let repaired = false;
    if (!genResult.ok || !genResult.syntax) {
      const enrichedRequest = `${combinedRequest}\n(ספק syntax מלא ושמיש; אל תחזיר ERROR אלא אם זה באמת בלתי אפשרי.)`;
      const retry = await spss.generateSpssSyntax({
        analysis, request: enrichedRequest, tutorMode: true, mode: 'prep', extraAllowedNames: derivedName ? [derivedName] : [],
        skipMethodologyGuard: true, repairHint: genResult.guidanceMessage, ...route,
      });
      if (retry.ok && retry.syntax) { genResult = retry; repaired = true; }
      else { genResult = retry || genResult; }
    }
    const syntax = genResult.syntax || '';
    const blockedBy = genResult.blockedBy || '';
    const codegenOk = Boolean(genResult.ok && syntax && !blockedBy);
    const hasComputeOrRecode = /COMPUTE|RECODE/i.test(syntax);
    const hasDerivedName = derivedName ? syntax.includes(derivedName) : true;
    if (!codegenOk) failures.push(`codegen: ${genResult.guidanceMessage || genResult.error || blockedBy || 'generateSpssSyntax failed'}`);
    if (codegenOk && !hasComputeOrRecode) failures.push('codegen: syntax has no COMPUTE/RECODE step');
    if (codegenOk && derivedName && !hasDerivedName) failures.push(`codegen: derived name "${derivedName}" missing from generated syntax`);
    steps.codegen = {
      ok: genResult.ok, model: genResult.model, error: genResult.error || '', blockedBy, repaired,
      codegenOk, hasComputeOrRecode, hasDerivedName, syntax: syntax.slice(0, 800),
    };

    const ok = failures.length === 0;
    return {
      ok,
      columns,
      assignmentText,
      question,
      profile,
      revisedProfile,
      derivedName,
      steps,
      failures,
      providerId: genResult.providerId || revised.providerId || consulted.providerId || planned.providerId || '',
      model: genResult.model || '',
      wire: endCapture(from),
      durationMs: Number(process.hrtime.bigint() / 1000000n) - t0,
    };
  } catch (e) {
    return { ok: false, error: maskWire(e?.message || String(e)), stack: String(e?.stack || '').split('\n').slice(0, 5), steps, failures, wire: endCapture(from), durationMs: Number(process.hrtime.bigint() / 1000000n) - t0 };
  }
}

// ============================================================================
// Personal Style Engine — LAB functions.
// Drive the REAL style-engine pipeline (ingest → metrics → LLM patterns → enable
// → generate with engine active → hybrid score) over HTTP. All state lives in the
// shared localStorage shim (sample store + profile.styleEngine), so it persists
// across calls within the process, exactly like the browser.
// ============================================================================

// 1) Ingest raw documents into a styleEngine profile.
//    Per doc: styleIngest.ingestText → recomputeMetricsFromStore → (once) real LLM
//    qualitative analysis (runQualitativeAnalysis{force}). Then enable the engine.
async function styleIngestDocs({ docs = [] } = {}) {
  const from = beginCapture();
  const t0 = Number(process.hrtime.bigint() / 1000000n);
  const ingested = [];
  let error = '';
  try {
    const list = Array.isArray(docs) ? docs : [];
    for (const d of list) {
      const title = String(d?.title || '').trim() || `doc-${ingested.length + 1}`;
      const text = String(d?.text || '');
      const res = styleIngest.ingestText({ title, text });
      ingested.push({ title, chars: text.length, added: res?.added ?? null, skipped: res?.skipped ?? null });
    }
    // E3 — classify each new doc's genre BEFORE recompute so genre sub-profiles build
    // (mirrors production ingestAndAnalyze). Never blocks the pipeline on failure.
    try { await styleIngest.classifyPendingGenres(); } catch {}
    styleIngest.recomputeMetricsFromStore();
    // Real LLM call — extracts qualitative patterns from representative excerpts.
    await styleIngest.runQualitativeAnalysis({ force: true });
    // Ingesting enables the engine so subsequent generation injects the style.
    styleIngest.setStyleEngineEnabled(true);
  } catch (e) { error = maskWire(e?.message || String(e)); }
  const durationMs = Number(process.hrtime.bigint() / 1000000n) - t0;
  return { ingested, overview: styleIngest.getStyleOverview(), error, wire: endCapture(from), durationMs };
}

// 2) Generate a document with the styleEngine active, and report how well the
//    output matches the user's style. styleScore comes from meta.styleScore (Phase 4)
//    when present, otherwise from a direct scoreStyleForDocument call.
async function styleGenerate({ prompt = '', dropdown = 'default', model = '', depth = 'auto' } = {}) {
  const from = beginCapture();
  const t0 = Number(process.hrtime.bigint() / 1000000n);
  let html = '', plainText = '', styleScore = null, error = '', meta = null;
  try {
    const styleDepth = depth === 'deep' ? 'deep' : (depth === 'fast' ? 'fast' : 'normal');
    const result = await genOnceMeta(prompt, dropdown, model, null, null, null, '', { styleDepth });
    html = typeof result === 'string' ? result : (result?.html || result?.text || '');
    meta = typeof result === 'object' && result ? { ...result, html: undefined, text: undefined } : null;
    plainText = htmlToPlain(html);
    styleScore = (meta && meta.styleScore) ? meta.styleScore : null;
    if (!styleScore) {
      styleScore = await ai.scoreStyleForDocument(plainText, { mode: depth === 'deep' ? 'deep' : 'auto', requestText: prompt });
    }
  } catch (e) { error = maskWire(e?.message || String(e)); }
  const durationMs = Number(process.hrtime.bigint() / 1000000n) - t0;
  return {
    prompt: prompt.slice(0, 200),
    htmlLength: String(html).length,
    html: maskWire(String(html)),
    plainText: maskWire(plainText).slice(0, 4000),
    styleScore,
    styleRewriteApplied: meta?.styleRewriteApplied === true,
    meta,
    error, wire: endCapture(from), durationMs,
  };
}

// 3) Score arbitrary text with the hybrid style judge (local + LLM). Distinct from
//    /api/score which uses the OLD authenticity scorer.
async function styleScoreText({ text = '', mode = 'auto', genre = null, prompt = '' } = {}) {
  const from = beginCapture();
  const t0 = Number(process.hrtime.bigint() / 1000000n);
  let breakdown = null, error = '';
  try {
    // genre/prompt אופציונליים — בלעדיהם ה-fallback ב-aiService מסווג את טקסט-הפלט עצמו.
    breakdown = await ai.scoreStyleForDocument(htmlToPlain(text), { mode: mode === 'deep' ? 'deep' : 'auto', genre, requestText: prompt || '' });
  } catch (e) { error = maskWire(e?.message || String(e)); }
  const durationMs = Number(process.hrtime.bigint() / 1000000n) - t0;
  return { enabled: breakdown !== null, breakdown, error, wire: endCapture(from), durationMs };
}

// 4) Current style-engine status: overview + sample-store stats.
function styleEngineStatus() {
  return { overview: styleIngest.getStyleOverview(), sampleStore: styleSamples.getSampleStoreStats() };
}

// 5) Reset — clear the sample store and disable/empty the styleEngine so experiments
//    start clean.
function styleReset() {
  let error = '';
  try {
    styleSamples.clearSampleStore();
    const profile = ai.getPersonalStyleProfile();
    ai.savePersonalStyleProfile({ ...profile, styleEngine: undefined });
  } catch (e) { error = maskWire(e?.message || String(e)); }
  return { ok: !error, error, overview: styleIngest.getStyleOverview(), sampleStore: styleSamples.getSampleStoreStats() };
}

// 6) Injection preview — return the EXACT styleEngine block that would be injected
//    into the model prompt for a given request (chunks + patterns + metrics).
//    buildPersonalStyleInstructions is NOT exported from aiService, so we build the
//    block directly via styleProfile.buildStyleEngineInjectionBlock (the same builder
//    aiService uses), with the RAG chunk block from styleRetrieval.
async function styleInjectionPreview({ prompt = '' } = {}) {
  const from = beginCapture();
  const t0 = Number(process.hrtime.bigint() / 1000000n);
  let block = '', chunkBlock = '', chunkCount = 0, error = '', genre = '';
  try {
    // Match production (aiService): classify the request genre and thread it through
    // both retrieval and the injection builder so the preview reflects real generation.
    genre = typeof styleProfile.classifyRequestGenre === 'function'
      ? (styleProfile.classifyRequestGenre(String(prompt || '')) || '')
      : '';
    const chunks = await styleRetrieval.selectChunks(prompt, { k: 4, genre: genre || null });
    chunkCount = Array.isArray(chunks) ? chunks.length : 0;
    chunkBlock = styleRetrieval.buildChunkInjectionText(chunks);
    const styleEngine = styleProfile.normalizeStyleEngine(ai.getPersonalStyleProfile().styleEngine);
    block = styleProfile.buildStyleEngineInjectionBlock(styleEngine, { seed: 1, chunkBlock, genre: genre || null });
  } catch (e) { error = maskWire(e?.message || String(e)); }
  const durationMs = Number(process.hrtime.bigint() / 1000000n) - t0;
  return {
    prompt: prompt.slice(0, 200),
    genre,
    chunkCount,
    chunkBlock: maskWire(chunkBlock),
    injectionBlock: maskWire(block),
    injectionBlockLength: block.length,
    builtVia: 'styleProfile.buildStyleEngineInjectionBlock (buildPersonalStyleInstructions not exported)',
    error, wire: endCapture(from), durationMs,
  };
}

export const lab = {
  seedConfig, seedAppSettings, getAgents, getProviders, inspectAgent, runAgent, runAgentMulti,
  retrieveSourcesLab, generateDoc, getStyleProfile, runStyleComparison, scoreText, runSpssSyntax, simulateSpssPreview, runSpssProject, runSpssRevisePlan, runSpssConsultFlow,
  styleIngestDocs, styleGenerate, styleScoreText, styleEngineStatus, styleReset, styleInjectionPreview,
  getProviderConfig: () => ai.getProviderConfig(),
  getBlockedDomains: () => ai.getBlockedSourceDomains(),
  saveBlockedDomains: (list) => ai.saveBlockedSourceDomains(list),
  // diagnostic passthrough — topic extraction for the bleed investigation
  extractVerifiedSourceQuery: (args) => ai.extractVerifiedSourceQuery(args),
  // offline SPSS helpers (no LLM) — unit-testable from node
  detectStaleSessionRun: (args) => spss.detectStaleSessionRun(args),
  adviseLecturerNextSteps: (args) => spss.adviseLecturerNextSteps(args),
  buildLiteratureReview: (args) => spss.buildLiteratureReview(args),
  buildAnalysisFromInput,
};
export default lab;

