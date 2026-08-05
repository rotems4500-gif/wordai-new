// scholar-probe.mjs — בדיקה חיה של מסלול Google Scholar (SerpAPI): מה ה-API מחזיר,
// מה הנרמול שלנו שומר, ומה שורד את האימות החי + הפילטרים של ה-pipeline.
// הרצה: node tools/test-bench/run-scholar-probe.mjs

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

// מדמים את מסלול הדסקטופ (Tauri proxy) כדי שקריאות serpapi ילכו ישירות ולא דרך ה-relay של Firebase.
let proxyCalls = 0;
globalThis.window.desktopApp = {
  proxyHttpRequest: async ({ url, method = 'GET', headers = {}, body = '', timeoutMs = 0 }) => {
    proxyCalls += 1;
    const controller = new AbortController();
    const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const resp = await fetch(url, { method, headers, signal: controller.signal, ...(body ? { body } : {}) });
      const text = await resp.text();
      return { ok: resp.ok, status: resp.status, body: text };
    } finally { if (timer) clearTimeout(timer); }
  },
};

import { fetchScholarSources } from '../../src/services/sourceRetrieval/providers/serpApiScholar.js';
import { retrieveSources, setUrlVerifierTransport, createRetrievalSession } from 'srcretr';

setUrlVerifierTransport(async (urls, { timeoutMs = 6000 } = {}) => Promise.all(urls.map(async (url) => {
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

const cfg = JSON.parse(process.env.WORDAI_CFG || '{}');
const scholarKey = String(cfg?.scholar?.key || '').trim();
const scholarProvider = String(cfg?.scholar?.provider || '').trim();
console.log(`scholar provider=${scholarProvider || '(none)'} key=${scholarKey ? `${scholarKey.slice(0, 6)}…(${scholarKey.length})` : '(missing)'}`);
if (!scholarKey) { console.log('אין מפתח SerpAPI — עצירה.'); process.exit(1); }

const QUERIES = (process.env.WORDAI_SCHOLAR_QUERIES
  ? JSON.parse(process.env.WORDAI_SCHOLAR_QUERIES)
  : [
    { q: 'ייצוג אנשים עם מוגבלות בתקשורת בישראל', tag: 'he-social' },
    { q: 'חופש הביטוי לשון הרע פסיקה ישראלית', tag: 'he-law' },
    { q: 'media representation of disability framing analysis', tag: 'en-social' },
    { q: 'John Stuart Mill harm principle free speech', tag: 'en-philo' },
  ]);

// --- 1. קריאה גולמית ל-SerpAPI (בדיוק אותם פרמטרים של הספק) ---
const HEB = /[֐-׿]/;
const rawCall = async ({ q, extra = {} }) => {
  const params = new URLSearchParams({
    engine: 'google_scholar', q, api_key: scholarKey, num: '5',
    hl: HEB.test(q) ? 'iw' : 'en', as_vis: '1', output: 'json', ...extra,
  });
  const t0 = Date.now();
  const resp = await fetch(`https://serpapi.com/search.json?${params}`);
  const ms = Date.now() - t0;
  const data = await resp.json().catch(() => ({}));
  return { httpStatus: resp.status, ms, data };
};

console.log('\n================ 1) RAW SerpAPI ================');
const rawSummaries = [];
for (const { q, tag } of QUERIES) {
  const { httpStatus, ms, data } = await rawCall({ q });
  const meta = data?.search_metadata || {};
  const results = Array.isArray(data?.organic_results) ? data.organic_results : [];
  console.log(`\n[${tag}] "${q}"`);
  console.log(`  http=${httpStatus} status=${meta.status} ms=${ms} (serpapi total=${meta.total_time_taken}s) results=${results.length} error=${data?.error || '-'}`);
  console.log(`  total_results=${data?.search_information?.total_results ?? '-'} keys=${Object.keys(data || {}).join(',')}`);
  results.forEach((r, i) => {
    const pi = r.publication_info || {};
    const cited = r.inline_links?.cited_by?.total ?? null;
    const res0 = r.resources?.[0] || {};
    console.log(`   ${i + 1}. ${String(r.title || '').slice(0, 70)}`);
    console.log(`      link=${r.link ? r.link.slice(0, 80) : '(MISSING)'}`);
    console.log(`      type=${r.type || '-'} cited=${cited ?? '-'} summary="${String(pi.summary || '').slice(0, 70)}" authors=${(pi.authors || []).length} pdf=${res0.link ? res0.file_format || 'yes' : '-'}`);
  });
  rawSummaries.push({ tag, q, results, ms, status: meta.status });
}

// --- 2. אותה שאילתה דרך הספק שלנו (נרמול + dedupe) ---
console.log('\n================ 2) fetchScholarSources (הספק שלנו) ================');
for (const { q, tag } of QUERIES) {
  const t0 = Date.now();
  let sources = [];
  let err = '';
  try { sources = await fetchScholarSources({ query: q, apiKey: scholarKey, limit: 5 }); }
  catch (e) { err = String(e?.message || e); }
  const raw = rawSummaries.find((r) => r.q === q)?.results?.length ?? 0;
  console.log(`\n[${tag}] raw=${raw} → normalized=${sources.length} (${Date.now() - t0}ms) ${err ? `ERROR: ${err}` : ''}`);
  sources.forEach((s, i) => {
    console.log(`   ${i + 1}. year=${s.year ?? '-'} cited=${s.citedBy ?? '-'} doi=${s.doi || '-'} domain=${s.domain || '(none)'}`);
    console.log(`      ${String(s.title).slice(0, 75)}`);
    console.log(`      url=${s.url ? s.url.slice(0, 90) : '(EMPTY)'}`);
  });
}

// --- 3. as_ylo / as_yhi ---
console.log('\n================ 3) פילטר שנים (as_ylo) ================');
{
  const q = QUERIES[0].q;
  const plain = await fetchScholarSources({ query: q, apiKey: scholarKey, limit: 5 });
  const gated = await fetchScholarSources({ query: q, apiKey: scholarKey, limit: 5, yearLow: 2020 });
  const years = (arr) => arr.map((s) => s.year ?? '?').join(',');
  console.log(`  ללא as_ylo: n=${plain.length} years=[${years(plain)}]`);
  console.log(`  as_ylo=2020: n=${gated.length} years=[${years(gated)}]`);
  const gatedHi = await fetchScholarSources({ query: q, apiKey: scholarKey, limit: 5, yearLow: 2020, yearHigh: 2022 });
  console.log(`  as_ylo=2020&as_yhi=2022: n=${gatedHi.length} years=[${years(gatedHi)}]`);
}

// --- 4. pipeline מלא (אימות חי + פילטרים + דירוג) ---
console.log('\n================ 4) retrieveSources(kind=academic) ================');
for (const { q, tag } of QUERIES) {
  console.log(`\n[${tag}] "${q}"`);
  const result = await retrieveSources({
    query: q, kind: 'academic', count: 3, cfg,
    session: createRetrievalSession({ runId: `scholar-probe-${tag}` }),
    logEvent: (type, message) => {
      if (/provider-start|provider-result|rejected|blocked|insufficient|error|dead|translate|pdf-fallback/.test(type)) console.log(`    [${type}] ${message}`);
    },
  });
  console.log(`  ok=${result.ok} failure=${result.failureReason || '-'} trail=${JSON.stringify(result.providerTrail)}`);
  result.sources.forEach((s, i) => {
    console.log(`   ${i + 1}. [${s.provider}] cited=${s.citedBy ?? '-'} year=${s.year ?? '-'} status=${s.verification?.httpStatus}${s.verification?.botBlocked ? ' BOT-BLOCKED' : ''}`);
    console.log(`      ${String(s.title).slice(0, 75)}`);
    console.log(`      ${(s.finalUrl || s.url || '').slice(0, 95)}`);
  });
}

console.log(`\n(סה"כ קריאות proxy: ${proxyCalls})`);
process.exit(0);
