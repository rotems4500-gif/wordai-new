// ============================================================================
// WordFlow source-retrieval harness — 1:1 replica of the app's 'sources' agent
// request path in src/AiSidebar.jsx (the invokeDirectCall in `send`).
//
// Fidelity guarantees:
//  • Query-transform (user text → retrieval query) runs the SHARED module
//    src/services/sourceQueryBuilder.js — the exact code AiSidebar calls.
//  • System prompt is pulled from AGENTS_CONFIG.sources.systemCtx — same as
//    AiSidebar (finalExtraSystemPrompt via line ~3661 cAgent.systemCtx).
//  • The full options object mirrors invokeDirectCall (AiSidebar ~3810-3855).
//  • Provider-pin fields are computed by replicating AiSidebar ~3665-3714 for
//    both dropdown states (default → agent route; explicit pick → strict pin).
//  • WORDAI_WIRE=1 logs every outgoing provider request (masked) so you see the
//    ACTUAL query/prompt on the wire.
//
// Config with real keys arrives via env WORDAI_CFG (decrypted from DPAPI by the
// PowerShell caller). Keys are never printed or written to disk.
//
// ---- How to run --------------------------------------------------------------
//   1. Bundle the browser-coupled aiService for Node (SSR):
//        npx vite build --config vite.verify.config.mjs   → <scratch>/verify/out-sf/sf.mjs
//   2. Decrypt the real provider config into WORDAI_CFG and run (PowerShell):
//        $p = "$env:APPDATA\com.wordai.assistant\ai-provider-config.json"
//        Add-Type -AssemblyName System.Security
//        $raw = [IO.File]::ReadAllBytes($p); $m = [Text.Encoding]::ASCII.GetBytes("DPAPI1`n")
//        $env:WORDAI_CFG = [Text.Encoding]::UTF8.GetString(
//          [Security.Cryptography.ProtectedData]::Unprotect($raw[$m.Length..($raw.Length-1)], $null, 'CurrentUser'))
//        $env:WORDAI_SCENARIO='B'; $env:WORDAI_WIRE='1'; node <scratch>/verify/out-sf/sf.mjs
//   Env: WORDAI_SCENARIO=A|B|C|D · WORDAI_WIRE=1 (log outgoing requests) ·
//        WORDAI_MODE=extract (offline query-extraction unit test, WORDAI_CFG='{}').
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

// ---- masking (shared by wire logger + reply printer) ----
const maskWire = (s) => String(s || '')
  .replace(/(api_key=)[^&\s]+/gi, '$1***')
  .replace(/([?&]key=)[^&\s]+/gi, '$1***')
  .replace(/AIza[0-9A-Za-z_-]{20,}/g, 'AIza***')
  .replace(/Bearer\s+[^"'\s]+/gi, 'Bearer ***')
  .replace(/pplx-[0-9A-Za-z]+/g, 'pplx-***')
  .replace(/sk-[0-9A-Za-z_-]+/g, 'sk-***');

// ---- fetch interceptor: log EXACT outgoing retrieval query/prompt ----
if (process.env.WORDAI_WIRE === '1') {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input?.url || String(input));
    const host = (() => { try { return new URL(url).host; } catch { return url.slice(0, 40); } })();
    const qm = url.match(/[?&]q=([^&]+)/);
    console.log('\n>>> WIRE', (init.method || 'GET'), host, qm ? `\n    q = ${decodeURIComponent(qm[1])}` : '');
    if (init.body) console.log('    body =', maskWire(String(init.body)).slice(0, 1000));
    return realFetch(input, init);
  };
}

// seed real provider config BEFORE importing aiService
const cfgJson = process.env.WORDAI_CFG || '';
if (!cfgJson) { console.error('WORDAI_CFG missing'); process.exit(2); }
localStorage.setItem('ai_provider_config', cfgJson);

// V3 flags: WORDAI_V3_FLAGS='{"runScope":true,...}' — נטען לפני aiService (flags.js קורא localStorage).
if (process.env.WORDAI_V3_FLAGS) {
  localStorage.setItem('wordai_v3_flags', process.env.WORDAI_V3_FLAGS);
  console.log('v3 flags:', process.env.WORDAI_V3_FLAGS);
}

const ai = await import('aiservice');
const { AGENTS_CONFIG } = await import('agentcfg');
const sqb = await import('sqb');
const srcretr = await import('srcretr');

// Node harness: אין desktopApp ואין /api/verify-url — מזריקים transport אימות-URL ישיר
// (HEAD→GET, follow redirects, 5s), מקביל ל-verify_url של Rust.
srcretr.setUrlVerifierTransport(async (urls, { timeoutMs = 5000 } = {}) => Promise.all(urls.map(async (url) => {
  const attempt = async (method) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        method,
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' },
        signal: controller.signal,
      });
      try { await resp.body?.cancel(); } catch {}
      return { status: resp.status, finalUrl: resp.url || url };
    } finally { clearTimeout(timer); }
  };
  try {
    let result = await attempt('HEAD');
    if (result.status === 405 || result.status === 501) result = await attempt('GET');
    return { url, ok: result.status >= 200 && result.status < 400, status: result.status, finalUrl: result.finalUrl };
  } catch (err) {
    return { url, ok: false, status: 0, finalUrl: '', error: String(err?.message || err) };
  }
})));

// ---------------------------------------------------------------------------
// DOC mode — reproduce the "write a document/essay WITH sources" path, which is
// a DIFFERENT entry point than the 'sources' agent: main.jsx:5617 calls
// generateDocumentFromPrompt. This is where the app fabricates citations because
// no real retrieval is wired in. WORDAI_MODE=doc.
// ---------------------------------------------------------------------------
if (process.env.WORDAI_MODE === 'doc') {
  const wls = await import('wls');
  const dropdown = process.env.WORDAI_DROPDOWN || 'default';
  const explicit = dropdown && dropdown !== 'default' ? dropdown : '';
  const cfg = ai.getProviderConfig();
  const prompt = process.env.WORDAI_PROMPT
    || 'כתוב לי עבודה אקדמית קצרה על השפעת רשתות חברתיות על דימוי גוף בקרב מתבגרים, עם מקורות אקדמיים';
  console.log('=== DOC: generateDocumentFromPrompt (write-with-sources) ===');
  console.log('prompt:', prompt.slice(0, 110));
  console.log('provider dropdown:', dropdown);
  let retrievalCalls = 0;
  const realFetch2 = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input?.url || String(input));
    if (/serpapi\.com|api\.perplexity\.ai|generativelanguage.*google_search|:generateContent/i.test(url) &&
        /serpapi\.com|perplexity/i.test(url)) retrievalCalls++;
    return realFetch2(input, init);
  };
  const t0 = Date.now();
  try {
    const result = await wls.generateDocumentFromPrompt({
      prompt,
      templateId: 'blank',
      instructions: '',
      selectedMaterials: [],
      selectedModel: '',
      selectedProviderId: explicit,
      selectedProviderModel: explicit ? String(cfg?.[explicit]?.model || '') : '',
      additionalReviewRounds: 0,
      forceDirectMode: false,
      skipWorkflowAutomation: false,
      useWorkspaceV2: false,
      returnMeta: true,
    });
    const html = typeof result === 'string' ? result : (result?.html || result?.text || JSON.stringify(result).slice(0, 300));
    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    // dump FULL html so the bibliography/end is inspectable
    if (process.env.WORDAI_DOC_OUT) {
      const fs = await import('node:fs');
      fs.writeFileSync(process.env.WORDAI_DOC_OUT, String(html), 'utf8');
      console.log('full html written to', process.env.WORDAI_DOC_OUT, '(' + String(html).length + ' chars)');
    }
    console.log(`--- document after ${dur}s ---`);
    // highest citation index used vs sources actually available
    const citeNums = [...String(html).matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1]));
    const maxCite = citeNums.length ? Math.max(...citeNums) : 0;
    console.log('numbered citations used: max index =', maxCite, '| distinct =', [...new Set(citeNums)].sort((a,b)=>a-b).join(','));
    // extract citation-like patterns and URLs to judge fabrication
    const urls = (html.match(/https?:\/\/[^\s"'<)]+/g) || []);
    const proseCites = (html.match(/\([^)]*?(?:19|20)\d{2}[^)]*?\)/g) || []).slice(0, 20);
    const daroshMakor = (html.match(/\[דרוש מקור\]/g) || []).length;
    // dump source-* debug events from localStorage (plan + per-query retrieval)
    try {
      const dbg = JSON.parse(globalThis.localStorage.getItem('wordai_agent_debug_logs') || '[]');
      const evs = dbg.filter((r) => /source-retrieval-plan|verified-source-retrieval|verified-source-candidate-rejected|source-output-blocked|verified-source-output-blocked|source-topic-derived|run-scope-query|stale-lock-rejected/.test(String(r.type || '')));
      console.log('--- retrieval events (' + evs.length + ') ---');
      evs.forEach((r) => console.log(`   [${r.type}] ${maskWire(String(r.message || '')).slice(0, 300)}`));
    } catch (e) { console.log('debug-log dump failed:', e?.message); }
    console.log('retrieval calls (serpapi/perplexity) during generation:', retrievalCalls);
    // V3 ledger: כמה קריאות ספק יצאו בפועל ב-run (baseline לשלב האכיפה)
    try {
      const ledgerStats = globalThis.__WORDAI_V3_LEDGER__?.stats?.();
      if (ledgerStats) console.log('v3 ledger:', JSON.stringify(ledgerStats));
    } catch {}
    console.log('URLs in document:', urls.length, urls.slice(0, 12));
    console.log('prose citations (Author, YEAR):', proseCites.length, proseCites.slice(0, 12));
    console.log('[דרוש מקור] markers:', daroshMakor);
    console.log('--- document text (first 1800 chars) ---');
    console.log(maskWire(String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).slice(0, 1800));
  } catch (e) {
    console.log('DOC ERROR:', maskWire(e?.message || String(e)));
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Build the 'sources' direct-agent request EXACTLY as AiSidebar.send does.
// dropdown: 'default' (dropdown on ברירת-מחדל) | 'claude' | 'gemini' | 'perplexity'
// selection: { selectedText, currentBlockText, docCtx, messages } — editor state.
// ---------------------------------------------------------------------------
const AGENT_ID = 'sources';
const cAgent = AGENTS_CONFIG[AGENT_ID];

function resolveModelForProvider(providerId) {
  const cfg = ai.getProviderConfig();
  const raw = String(cfg?.[providerId]?.model || '').trim();
  return ai.normalizeProviderModelName(providerId, raw);
}

function buildSourcesRequest({ txt, dropdown = 'default', selection = {} }) {
  const selectedText = selection.selectedText || '';
  const currentBlockText = selection.currentBlockText || '';
  const docCtx = selection.docCtx || '';
  const messages = selection.messages || [];

  // ---- provider-pin resolution (AiSidebar ~964, ~3665-3714) ----
  const forceGlobalSidebarProvider = false;                 // no global lock in harness
  const selectedProviderId = dropdown;                      // dropdown value ('default' | provider id)
  const userExplicitSidebarProvider = !forceGlobalSidebarProvider
    && Boolean(selectedProviderId) && selectedProviderId !== 'default';

  // buildClassicTaskpaneSelection('sources') effect (~3665): agent has sidebarSelection.providerId,
  // explicit dropdown pick wins over the agent route ('perplexity').
  const explicitProviderId = selectedProviderId && selectedProviderId !== 'default' ? selectedProviderId : '';
  const routeProviderId = String(cAgent?.sidebarSelection?.providerId || cAgent?.route || '').trim();
  const finalProviderId = explicitProviderId || routeProviderId; // finalProviderId after cAgent path
  const finalProviderModel = explicitProviderId
    ? resolveModelForProvider(explicitProviderId)
    : String(cAgent?.sidebarSelection?.model || '').trim();

  const finalPinnedProviderId = finalProviderId && finalProviderId !== 'default' ? finalProviderId : '';
  const resolvedFinalProviderModel = finalProviderModel || (finalPinnedProviderId ? resolveModelForProvider(finalPinnedProviderId) : '');

  const pinExplicitProvider = forceGlobalSidebarProvider || userExplicitSidebarProvider;
  const globalLockProviderOverride = pinExplicitProvider ? finalPinnedProviderId : '';
  const globalLockModelOverride = pinExplicitProvider ? resolvedFinalProviderModel : '';
  const strictProviderId = globalLockProviderOverride;      // runtimeProviderOverride='' in direct send
  const runtimeStrictProviderOverride = pinExplicitProvider;
  const hasStrictRuntimeProviderOverride = runtimeStrictProviderOverride && Boolean(strictProviderId);
  const preferredProviderId = hasStrictRuntimeProviderOverride ? '' : finalPinnedProviderId;
  const preferredProviders = preferredProviderId ? [preferredProviderId] : [];
  const directProviderId = hasStrictRuntimeProviderOverride ? strictProviderId : '';
  const hasPinnedProviderPreference = hasStrictRuntimeProviderOverride || preferredProviders.length > 0;
  const explicitProviderModel = hasStrictRuntimeProviderOverride
    ? globalLockModelOverride
    : (preferredProviderId ? resolvedFinalProviderModel : '');

  // ---- sources-specific query building (AiSidebar ~3785-3793) — SHARED module ----
  const sourcesQueryOverride = sqb.buildSourcesQueryOverride(txt, { selectedText, currentBlockText });
  const sourcesNewsRequest = sqb.isSourcesNewsRequest(txt, sourcesQueryOverride, { selectedText, currentBlockText });

  // ---- system prompt (AiSidebar ~3661-3664: cAgent.taskpaneSystemCtx || cAgent.systemCtx) ----
  const finalExtraSystemPrompt = String(cAgent?.taskpaneSystemCtx || cAgent?.systemCtx || '').trim();

  // ---- document context (AiSidebar buildContext ~3196; no edit-composer) ----
  const baseContext = selectedText
    ? `טקסט נבחר: "${selectedText}"\n\nפסקה נוכחית: "${currentBlockText}"\n\n${docCtx}`
    : currentBlockText
      ? `פסקה נוכחית: "${currentBlockText}"\n\n${docCtx}`
      : (docCtx ? `מסמך פעיל:\n${docCtx}` : '');
  const ctx = baseContext; // assignmentBrief/followUpGrounding are empty in a fresh chat

  const requestedSplitCallCount = 0; // sources has no defaultSplitCallCount
  const directAgentName = hasPinnedProviderPreference
    ? `${cAgent.label} · ${finalProviderId}`
    : cAgent.label;

  // ---- options object — mirrors invokeDirectCall (AiSidebar ~3810-3855) ----
  const options = {
    agentId: AGENT_ID,
    agentLabel: directAgentName,
    agentName: cAgent.label,
    skillId: '',                          // manualSkillId (no manual skill)
    autoUseDefaultSkill: true,            // !manualSkillId
    skipSkillSelection: false,            // not lecturer
    forceSuppressResearchRouting: false,  // not lecturer
    directChat: true,
    conversationHistory: messages,        // built from chat history
    includeAppMemory: true,               // !isEditComposerMode
    providerOverride: directProviderId,
    preferredProviders,
    modelOverride: explicitProviderModel,
    strictProviderOverride: hasStrictRuntimeProviderOverride,
    sourceQueryOverride: sourcesQueryOverride,           // || holeFill (n/a for sources)
    sourceQuerySource: sourcesQueryOverride ? 'taskpaneSourcesContext' : '',
    isAcademicTask: AGENT_ID === 'sources' && !sourcesNewsRequest,
    editModeRequest: false,
    allowEditModeRoutingOverride: false,
    editModeExplicitSkillInvocation: false,
    skipAutomation: true,
    skipAutomationPrompt: true,
    skipMultiModel: hasPinnedProviderPreference || requestedSplitCallCount >= 2,
    preserveFullDocumentContext: false,
    documentFallbackHtml: '',
    phase: 'single', stepIndex: 1, stepCount: 1,
    onStatus: (p) => console.log('   [status]', maskWire(JSON.stringify(p)).slice(0, 220)),
  };
  return { userPrompt: txt, documentContext: ctx, extraSystemPrompt: finalExtraSystemPrompt, options };
}

// ---- extraction unit-test mode (no network) ----
if (process.env.WORDAI_MODE === 'extract') {
  const prompts = [
    'מצא לי 3 מקורות אקדמיים על השפעת רשתות חברתיות על דימוי גוף בקרב מתבגרים',
    'תן לי כמה מאמרים אקדמיים בנושא שחיקה בקרב אחיות',
    'חפש מקורות על אלימות במשפחה',
    'find me 3 academic sources about climate change adaptation',
    'שלום, יש לי מטלה: יש לכתוב עבודה אקדמית בהיקף 5 עמודים הכוללת סקירת ספרות. יש לצרף לפחות 5 מקורות אקדמיים עדכניים. הנושא: שחיקה בקרב אחיות במחלקות פנימיות. תביא לי מקורות בבקשה',
    'הנושא: השפעת פעילות גופנית על חרדה',
    'בחרו אחד מהנושאים הבאים: שחיקה, מוטיבציה, מנהיגות',
  ];
  for (const p of prompts) {
    const req = buildSourcesRequest({ txt: p, dropdown: 'default' });
    console.log('PROMPT   :', p.slice(0, 70).replace(/\n/g, ' | '));
    console.log('OVERRIDE :', JSON.stringify(req.options.sourceQueryOverride));
    console.log('isAcademic:', req.options.isAcademicTask, '| preferred:', JSON.stringify(req.options.preferredProviders), '| skipMM:', req.options.skipMultiModel);
    console.log('---');
  }
  process.exit(0);
}

// ---- live scenarios (real network) ----
const SCENARIOS = {
  A: { label: 'A: sources agent, dropdown = default (agent route)', dropdown: 'default',
       txt: 'מצא לי 3 מקורות אקדמיים על השפעת רשתות חברתיות על דימוי גוף בקרב מתבגרים' },
  B: { label: 'B: sources agent, dropdown = Claude (explicit pin)', dropdown: 'claude',
       txt: 'מצא לי 3 מקורות אקדמיים על השפעת רשתות חברתיות על דימוי גוף בקרב מתבגרים' },
  C: { label: 'C: sources agent, dropdown = Gemini (explicit pin)', dropdown: 'gemini',
       txt: 'מצא לי 3 מקורות אקדמיים על השפעת רשתות חברתיות על דימוי גוף בקרב מתבגרים' },
  D: { label: 'D: assignment-style prompt, dropdown = default', dropdown: 'default',
       txt: 'שלום, יש לי מטלה: יש לכתוב עבודה אקדמית בהיקף 5 עמודים הכוללת סקירת ספרות. יש לצרף לפחות 5 מקורות אקדמיים עדכניים. הנושא: שחיקה בקרב אחיות במחלקות פנימיות. תביא לי מקורות בבקשה' },
};

const scenario = SCENARIOS[process.env.WORDAI_SCENARIO || 'A'];
// WORDAI_PROMPT דורס את טקסט התרחיש (לבדיקת מטלות אמיתיות); WORDAI_PROMPT_FILE קורא מקובץ.
if (process.env.WORDAI_PROMPT_FILE) {
  const fsMod = await import('node:fs');
  scenario.txt = fsMod.readFileSync(process.env.WORDAI_PROMPT_FILE, 'utf8');
  scenario.label += ' [prompt from file]';
} else if (process.env.WORDAI_PROMPT) {
  scenario.txt = process.env.WORDAI_PROMPT;
  scenario.label += ' [custom prompt]';
}
console.log('=== ' + scenario.label + ' ===');
const req = buildSourcesRequest({ txt: scenario.txt, dropdown: scenario.dropdown });
console.log('prompt       :', scenario.txt.slice(0, 90));
console.log('sourceOverride:', JSON.stringify(req.options.sourceQueryOverride));
console.log('preferred    :', JSON.stringify(req.options.preferredProviders), '| providerOverride:', JSON.stringify(req.options.providerOverride), '| strict:', req.options.strictProviderOverride, '| skipMM:', req.options.skipMultiModel);
const t0 = Date.now();
try {
  const reply = await ai.chatWithActiveProvider(req.userPrompt, req.documentContext, req.extraSystemPrompt, req.options);
  const text = typeof reply === 'string' ? reply : (reply?.text ?? JSON.stringify(reply)?.slice(0, 400));
  console.log(`--- reply after ${((Date.now() - t0) / 1000).toFixed(1)}s ---`);
  console.log(maskWire(String(text)).slice(0, 2200));
} catch (e) {
  console.log(`--- threw after ${((Date.now() - t0) / 1000).toFixed(1)}s ---`);
  console.log('ERROR:', maskWire(e?.message || String(e)));
}
process.exit(0);
