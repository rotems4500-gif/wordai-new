// ============================================================================
// WordFlow LAB server — drives the REAL app code paths from a browser UI.
//
// Boot sequence:
//   1. Decrypt the app's DPAPI provider config (%APPDATA%/com.wordai.assistant/
//      ai-provider-config.json) into memory via PowerShell — same keys the app
//      itself uses. If DPAPI is unavailable, fall back to gitignored
//      tools/test-bench/keys.local.json. Keys are never sent to the browser.
//   2. Build the LAB bundle (vite SSR of lab-entry.mjs → out-lab/sf.mjs) unless
//      it already exists; set WORDAI_LAB_REBUILD=1 to force a rebuild after code
//      changes.
//   3. Import the bundle (the real aiService / agentConfig / sourceRetrieval /
//      workspaceLearningService) and seed the decrypted config into it.
//
// Endpoints (all POST unless noted):
//   GET  /                → LAB UI
//   GET  /api/status      → { cfgLoaded, providers, bundleBuilt }
//   GET  /api/agents      → agent catalogue from AGENTS_CONFIG
//   /api/inspect          → build-only: exact system/user prompt + options (no network)
//   /api/run              → run an agent for real through chatWithActiveProvider
//   /api/retrieve         → real srcretr.retrieveSources with event trail
//   /api/doc              → real wls.generateDocumentFromPrompt (write-with-sources)
//   GET  /api/models      → per-provider model list (connectivity/key check)
//
//   node tools/test-bench/server.mjs        → http://localhost:5178
// ============================================================================
import { createServer } from 'node:http';
import { readFile, access, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import path from 'node:path';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(DIR, '..', '..');
const PORT = Number(process.env.TESTBENCH_PORT || 5178);
const SCRATCH = process.env.WORDAI_VERIFY_SCRATCH
  || 'C:/Users/rotem/AppData/Local/Temp/claude/C--Users-rotem-Projects--wordai-new/41ab5a23-649e-4489-9e04-a23e60b45aea/scratchpad/verify';
const BUNDLE = path.join(SCRATCH, 'out-lab', 'sf.mjs');
const LOCAL_KEYS = path.join(DIR, 'keys.local.json');

const trimTo = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const run = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { ...opts, shell: true });
  let out = '', err = '';
  p.stdout?.on('data', (d) => { out += d; });
  p.stderr?.on('data', (d) => { err += d; });
  p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err || out || `exit ${code}`))));
  p.on('error', reject);
});
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

// Persist a result locally for personal review — gitignored (tools/test-bench/lab-results/).
const RESULTS_DIR = path.join(DIR, 'lab-results');
async function saveResult(kind, data) {
  try {
    await mkdir(RESULTS_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await writeFile(path.join(RESULTS_DIR, `${kind}_${stamp}.json`), JSON.stringify(data, null, 2), 'utf8');
  } catch (e) { console.warn('saveResult failed:', e.message); }
}

// ── 1. Decrypt a DPAPI-protected app file via PowerShell (CurrentUser scope) ──
// The app writes [magic "DPAPI1\n"] + DPAPI blob (see src-tauri/src/secure.rs).
async function decryptDpapiFile(fileName) {
  const filePath = path.join(process.env.APPDATA || '', 'com.wordai.assistant', fileName);
  try {
    const raw = await readFile(filePath);
    const magic = Buffer.from('DPAPI1\n', 'ascii');
    if (!raw.subarray(0, magic.length).equals(magic)) throw new Error('unexpected secure-file header');
  } catch (e) {
    console.warn(`DPAPI read failed (${fileName}):`, e.message);
    return '';
  }
  // ה-blob לא מוטמע בשורת הפקודה (config גדול → "command line is too long" / ENAMETOOLONG):
  // PowerShell קורא את הקובץ המוצפן בעצמו וכותב את הפענוח לקובץ זמני שנקרא ונמחק כאן.
  // PS script passed as base64 UTF-16LE via -EncodedCommand so no shell quoting can
  // mangle the inner quotes.
  const outPath = path.join(SCRATCH, `dpapi-${fileName}.tmp`);
  const ps = [
    'Add-Type -AssemblyName System.Security',
    `$raw=[IO.File]::ReadAllBytes(${JSON.stringify(filePath)})`,
    '$blob=[byte[]]($raw[7..($raw.Length-1)])',
    '$dec=[Security.Cryptography.ProtectedData]::Unprotect($blob,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)',
    `[IO.File]::WriteAllBytes(${JSON.stringify(outPath)},$dec)`,
  ].join('\n');
  const encoded = Buffer.from(ps, 'utf16le').toString('base64');
  try {
    await mkdir(SCRATCH, { recursive: true });
    await run('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]);
    const out = await readFile(outPath, 'utf8');
    const { rm } = await import('node:fs/promises');
    await rm(outPath, { force: true });
    return out.trim();
  } catch (e) {
    console.warn(`DPAPI decrypt failed (${fileName}):`, e.message);
    return '';
  }
}
const PROVIDER_IDS = ['gemini', 'openai', 'perplexity', 'scholar', 'groq', 'claude', 'ollama', 'custom'];
const PROVIDER_ENV_KEYS = {
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  perplexity: ['PERPLEXITY_API_KEY'],
  scholar: ['SCHOLAR_API_KEY', 'SERPAPI_API_KEY'],
  groq: ['GROQ_API_KEY'],
  claude: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
};

function isProviderConfigValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && (Object.hasOwn(value, 'key') || Object.hasOwn(value, 'apiKey') || Object.hasOwn(value, 'model'));
}

function normalizeLocalProviderConfig(raw) {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const source = parsed?.providerConfig || parsed?.aiProviderConfig || parsed?.ai_provider_config || parsed;
  const out = {};
  if (source?.active) out.active = source.active;
  for (const id of PROVIDER_IDS) {
    const direct = source?.[id];
    const envKey = PROVIDER_ENV_KEYS[id]?.find((name) => source?.[name]);
    const model = source?.[`${id}Model`] || source?.[`${id}_model`] || source?.[`${id.toUpperCase()}_MODEL`];
    if (typeof direct === 'string') {
      if (direct.trim()) out[id] = { key: direct.trim(), ...(model ? { model } : {}) };
    } else if (isProviderConfigValue(direct)) {
      const key = String(direct.key || direct.apiKey || '').trim();
      if (key || direct.model || direct.baseUrl) out[id] = { ...direct, ...(key ? { key } : {}) };
    } else if (envKey) {
      out[id] = { key: String(source[envKey]).trim(), ...(model ? { model } : {}) };
    }
  }
  return out;
}

function configuredProviderNames(cfg) {
  return PROVIDER_IDS.filter((id) => String(cfg?.[id]?.key || cfg?.[id]?.apiKey || '').trim());
}

async function readLocalKeysConfig() {
  if (!(await exists(LOCAL_KEYS))) return '';
  try {
    const raw = await readFile(LOCAL_KEYS, 'utf8');
    const cfg = normalizeLocalProviderConfig(raw);
    const providers = configuredProviderNames(cfg);
    if (!providers.length) {
      console.warn('keys.local.json found, but no provider keys are configured');
      return '';
    }
    console.log(`provider config loaded from keys.local.json ✓ (${providers.join(', ')})`);
    return JSON.stringify(cfg);
  } catch (e) {
    console.warn('keys.local.json load failed:', e.message);
    return '';
  }
}

async function decryptProviderConfig() {
  if (process.env.WORDAI_CFG) return { json: process.env.WORDAI_CFG, source: 'WORDAI_CFG' };
  const dpapi = await decryptDpapiFile('ai-provider-config.json');
  if (dpapi) return { json: dpapi, source: 'app encrypted config' };
  const local = await readLocalKeysConfig();
  if (local) return { json: local, source: 'keys.local.json' };
  return { json: '', source: 'missing' };
}

// ── 2. Build the LAB bundle (vite SSR) ───────────────────────────────────────
async function ensureBundle() {
  const have = await exists(BUNDLE);
  if (have && process.env.WORDAI_LAB_REBUILD !== '1') return true;
  console.log('building LAB bundle (vite SSR of lab-entry.mjs)…');
  await run('npx', ['vite', 'build', '--config', 'vite.verify.config.mjs'], {
    cwd: PROJECT, env: { ...process.env, WORDAI_VERIFY_ENTRY: 'lab', WORDAI_VERIFY_SCRATCH: SCRATCH },
  });
  return exists(BUNDLE);
}

// ── 3. Load real modules ─────────────────────────────────────────────────────
let LAB = null;
let CFG_JSON = '';
let CFG_SOURCE = 'missing';
async function boot() {
  const cfg = await decryptProviderConfig();
  CFG_JSON = cfg.json;
  CFG_SOURCE = cfg.source;
  console.log(CFG_JSON ? `provider config loaded ✓ (${CFG_SOURCE})` : 'no provider config (keys will be missing)');
  // CORS-relay hosts (SerpAPI/Perplexity/Copyleaks) route through /api/proxy in the
  // app. In Node there is no CORS — point the relay at THIS server, which does the
  // real fetch (see /api/proxy below). Must be set before importing the bundle.
  if (!process.env.WORDAI_RELAY_ORIGIN) process.env.WORDAI_RELAY_ORIGIN = `http://127.0.0.1:${PORT}`;
  const built = await ensureBundle();
  if (!built) throw new Error('LAB bundle build failed');
  const mod = await import(pathToFileURL(BUNDLE).href + `?t=${Date.now()}`);
  LAB = mod.lab || mod.default;
  if (!LAB) throw new Error('lab export missing from bundle');
  LAB.seedConfig(CFG_JSON);
  // Seed the app-settings snapshot → carries the real personal-style profile.
  const settingsJson = await decryptDpapiFile('app-settings.json');
  if (settingsJson) {
    try { LAB.seedAppSettings(settingsJson); } catch (e) { console.warn('seedAppSettings:', e.message); }
    const sp = LAB.getStyleProfile();
    console.log(sp.hasProfile ? `personal style loaded ✓ (${sp.displayName || 'ללא שם'})` : 'app-settings loaded (no meaningful style profile)');
  } else {
    console.log('no app-settings.json (personal style unavailable)');
  }
  console.log('LAB ready ✓');
}

// ── model listing (raw fetch — connectivity/key check, not app logic) ─────────
function cfgKey(provider) {
  try { const c = LAB.getProviderConfig(); return String(c?.[provider]?.key || '').trim(); } catch { return ''; }
}
async function listModelsGemini(key) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=200`);
  const data = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${trimTo(JSON.stringify(data), 300)}`);
  return (data.models || []).map((m) => ({ id: String(m.name || '').replace(/^models\//, ''), display: m.displayName || '', methods: m.supportedGenerationMethods || [] }));
}
async function listModelsOpenAI(key) {
  const res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${trimTo(JSON.stringify(data), 300)}`);
  return (data.data || []).map((m) => ({ id: m.id, display: '', methods: [] }));
}
async function listModelsPerplexity(key) {
  const candidates = ['sonar', 'sonar-pro', 'sonar-reasoning', 'sonar-reasoning-pro', 'sonar-deep-research'];
  const out = [];
  for (const id of candidates) {
    try {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: id, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1, stream: false }),
      });
      out.push({ id, display: res.ok ? 'OK' : `HTTP ${res.status}`, methods: res.ok ? ['chat'] : [] });
    } catch { out.push({ id, display: 'ERR', methods: [] }); }
  }
  return out;
}
const MODEL_LISTERS = { gemini: listModelsGemini, openai: listModelsOpenAI, perplexity: listModelsPerplexity };
async function handleModels(query) {
  const provider = String(query.provider || '').trim();
  const providers = provider ? [provider] : Object.keys(MODEL_LISTERS);
  const results = [];
  for (const id of providers) {
    const lister = MODEL_LISTERS[id];
    if (!lister) continue;
    const key = cfgKey(id);
    if (!key) { results.push({ provider: id, ok: false, error: 'אין מפתח בקונפיג', models: [] }); continue; }
    try { results.push({ provider: id, ok: true, models: await lister(key) }); }
    catch (e) { results.push({ provider: id, ok: false, error: e?.message || String(e), models: [] }); }
  }
  return { results };
}

const readBody = (req) => new Promise((resolve) => {
  let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
});
const json = (res, obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };

const server = createServer(async (req, res) => {
  try {
    const url = req.url || '/';
    if (req.method === 'GET' && (url === '/' || url.startsWith('/index.html'))) {
      const html = await readFile(path.join(DIR, 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return;
    }
    if (req.method === 'GET' && url.startsWith('/api/status')) {
      let providers = [];
      try { providers = Object.keys(LAB.getProviderConfig() || {}); } catch {}
      return json(res, { cfgLoaded: !!CFG_JSON, cfgSource: CFG_SOURCE, providers, bundleReady: !!LAB });
    }
    if (req.method === 'POST' && url === '/api/local-keys') {
      const b = await readBody(req);
      const cfg = normalizeLocalProviderConfig(b.keys || b);
      const providers = configuredProviderNames(cfg);
      if (!providers.length) return json(res, { ok: false, error: 'לא הוזן אף מפתח' }, 400);
      await writeFile(LOCAL_KEYS, JSON.stringify(cfg, null, 2), 'utf8');
      CFG_JSON = JSON.stringify(cfg);
      CFG_SOURCE = 'keys.local.json';
      try { LAB.seedConfig(CFG_JSON); } catch (e) { return json(res, { ok: false, error: e?.message || String(e) }, 500); }
      return json(res, { ok: true, cfgSource: CFG_SOURCE, providers });
    }
    if (req.method === 'POST' && url === '/api/proxy') {
      // CORS-relay passthrough: mirrors the Firebase relay / desktop proxy contract
      // ({url,method,headers,body} → {ok,status,body}). Node has no CORS, so fetch direct.
      const b = await readBody(req);
      try {
        const r = await fetch(b.url, { method: b.method || 'POST', headers: b.headers || {}, ...(b.body ? { body: b.body } : {}) });
        const text = await r.text();
        return json(res, { ok: r.ok, status: r.status, body: text });
      } catch (e) { return json(res, { ok: false, status: 0, body: String(e?.message || e) }); }
    }
    if (req.method === 'GET' && url.startsWith('/api/blocked-domains')) return json(res, { domains: LAB.getBlockedDomains() });
    if (req.method === 'POST' && url === '/api/blocked-domains') {
      const b = await readBody(req);
      return json(res, { domains: LAB.saveBlockedDomains(b.domains || []) });
    }
    if (req.method === 'GET' && url.startsWith('/api/agents')) return json(res, { agents: LAB.getAgents() });
    if (req.method === 'GET' && url.startsWith('/api/providers')) return json(res, { providers: LAB.getProviders() });
    if (req.method === 'POST' && url === '/api/run-multi') {
      const b = await readBody(req);
      const out = await LAB.runAgentMulti(b.agentId, { txt: b.txt || '', selection: b.selection || {} }, b.targets || []);
      await saveResult('run-multi', out);
      return json(res, out);
    }
    if (req.method === 'GET' && url.startsWith('/api/models')) {
      const q = Object.fromEntries(new URL(url, 'http://x').searchParams);
      return json(res, await handleModels(q));
    }
    if (req.method === 'POST' && url === '/api/inspect') {
      const b = await readBody(req);
      return json(res, LAB.inspectAgent(b.agentId, { txt: b.txt || '', dropdown: b.dropdown || 'default', selection: b.selection || {}, chatScope: b.chatScope || 'document', forceInternetInfo: b.forceInternetInfo === true }));
    }
    if (req.method === 'POST' && url === '/api/run') {
      const b = await readBody(req);
      return json(res, await LAB.runAgent(b.agentId, { txt: b.txt || '', dropdown: b.dropdown || 'default', selection: b.selection || {}, chatScope: b.chatScope || 'document', forceInternetInfo: b.forceInternetInfo === true }));
    }
    if (req.method === 'POST' && url === '/api/retrieve') {
      const b = await readBody(req);
      return json(res, await LAB.retrieveSourcesLab({ query: b.query || '', kind: b.kind || 'academic', count: Number(b.count) || 3, after: b.after || '', providers: b.providers || null, blockedDomains: b.blockedDomains || null }));
    }
    if (req.method === 'POST' && url === '/api/doc') {
      const b = await readBody(req);
      return json(res, await LAB.generateDoc({ prompt: b.prompt || '', dropdown: b.dropdown || 'default', model: b.model || '', includeSources: b.includeSources ?? null, materials: b.materials || null, workspace: b.workspace || null }));
    }
    if (req.method === 'GET' && url.startsWith('/api/style-profile')) return json(res, LAB.getStyleProfile());
    if (req.method === 'POST' && url === '/api/style-compare') {
      const b = await readBody(req);
      const out = await LAB.runStyleComparison({ prompt: b.prompt || '', dropdown: b.dropdown || 'default', model: b.model || '' });
      await saveResult('style-compare', out);   // persisted locally (gitignored)
      return json(res, out);
    }
    if (req.method === 'POST' && url === '/api/score') {
      const b = await readBody(req);
      return json(res, LAB.scoreText({ text: b.text || '' }));
    }
    if (req.method === 'POST' && url === '/api/spss-syntax') {
      const b = await readBody(req);
      const out = await LAB.runSpssSyntax({
        csv: b.csv || '',
        request: b.request || '',
        mode: b.mode || 'analysis',
        actionId: b.actionId || '',
        column: b.column || '',
        output: b.output || '',
        priorSyntax: b.priorSyntax || '',
        question: b.question || '',
        provider: b.provider || '',
        model: b.model || '',
      });
      await saveResult('spss-syntax', out);
      return json(res, out);
    }
    if (req.method === 'POST' && url === '/api/spss-preview') {
      const b = await readBody(req);
      const out = await LAB.simulateSpssPreview({ csv: b.csv || '', syntax: b.syntax || '' });
      await saveResult('spss-preview', out);
      return json(res, out);
    }
    if (req.method === 'POST' && (url === '/api/spss-project' || url === '/api/spss')) {
      const b = await readBody(req);
      let csv = b.csv || '';
      let savBase64 = b.savBase64 || '';
      let savFileName = b.savFileName || 'dataset.sav';
      let assignmentText = b.assignmentText || '';
      let draftText = b.draftText || '';
      // Path variants take precedence over inline fields — absolute paths read
      // server-side (e.g. a real .sav on disk, or pre-extracted assignment/draft .txt).
      if (b.savPath) {
        try {
          const buf = await readFile(String(b.savPath));
          savBase64 = buf.toString('base64');
          savFileName = path.basename(String(b.savPath));
        } catch (e) { return json(res, { ok: false, error: `לא ניתן לקרוא savPath: ${e?.message || e}` }, 400); }
      }
      if (b.assignmentPath) {
        try { assignmentText = await readFile(String(b.assignmentPath), 'utf8'); }
        catch (e) { return json(res, { ok: false, error: `לא ניתן לקרוא assignmentPath: ${e?.message || e}` }, 400); }
      }
      if (b.draftPath) {
        try { draftText = await readFile(String(b.draftPath), 'utf8'); }
        catch (e) { return json(res, { ok: false, error: `לא ניתן לקרוא draftPath: ${e?.message || e}` }, 400); }
      }
      const out = await LAB.runSpssProject({
        csv, savBase64, savFileName, assignmentText, draftText,
        provider: b.provider || '', model: b.model || '',
      });
      await saveResult('spss', out);
      return json(res, out);
    }
    if (req.method === 'POST' && url === '/api/spss-advise') {
      const b = await readBody(req);
      let csv = b.csv || '';
      let savBase64 = b.savBase64 || '';
      let savFileName = b.savFileName || 'dataset.sav';
      let assignmentText = b.assignmentText || '';
      let profile = b.profile || null;
      let masterSyntax = b.masterSyntax || '';
      let output = b.output || '';
      let interpretations = b.interpretations || [];
      if (b.savPath) {
        try {
          const buf = await readFile(String(b.savPath));
          savBase64 = buf.toString('base64');
          savFileName = path.basename(String(b.savPath));
        } catch (e) { return json(res, { ok: false, error: `לא ניתן לקרוא savPath: ${e?.message || e}` }, 400); }
      }
      let analysis;
      try {
        analysis = await LAB.buildAnalysisFromInput({ csv, savBase64, savFileName });
      } catch (e) {
        return json(res, { ok: false, error: `לא ניתן לנתח את הנתונים: ${e?.message || e}` }, 400);
      }
      const out = await LAB.adviseLecturerNextSteps({
        assignmentText, analysis, profile, masterSyntax, output, interpretations,
        providerOverride: b.provider || '', modelOverride: b.model || '',
      });
      await saveResult('spss-advise', out);
      return json(res, out);
    }
    if (req.method === 'POST' && url === '/api/spss-litreview') {
      const b = await readBody(req);
      const out = await LAB.buildLiteratureReview({
        topic: b.topic || '', count: b.count || 5,
        providerOverride: b.provider || '', modelOverride: b.model || '',
      });
      await saveResult('spss-litreview', out);
      return json(res, out);
    }
  } catch (e) {
    json(res, { error: e?.message || String(e), stack: String(e?.stack || '').split('\n').slice(0, 4) }, 500);
  }
});

boot().then(() => {
  server.listen(PORT, '127.0.0.1', () => console.log(`WordFlow LAB → http://localhost:${PORT}`));
}).catch((e) => { console.error('boot failed:', e); process.exit(1); });



