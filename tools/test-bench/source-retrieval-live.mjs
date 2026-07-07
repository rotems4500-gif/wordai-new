// source-retrieval-live.mjs — הרצה ישירה של retrieveSources עם לוג אירועים מלא ל-console.
// שימוש: WORDAI_VERIFY_ENTRY=retr לבנייה, ואז:
//   WORDAI_CFG=<json> WORDAI_QUERY="..." WORDAI_KIND=news node .../sf.mjs

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

import { retrieveSources, setUrlVerifierTransport, createRetrievalSession } from 'srcretr';

// אימות URL ישיר ב-Node (כמו verify_url של Rust).
setUrlVerifierTransport(async (urls, { timeoutMs = 5000 } = {}) => Promise.all(urls.map(async (url) => {
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
const query = process.env.WORDAI_QUERY || 'ייצוג אנשים עם מוגבלות בתקשורת בישראל';
const kind = process.env.WORDAI_KIND || 'news';
const count = Number(process.env.WORDAI_COUNT) || 3;
const after = process.env.WORDAI_AFTER || '';

console.log(`=== retrieveSources: kind=${kind} count=${count} after=${after || '-'}\nquery: ${query}\n`);
const result = await retrieveSources({
  query,
  kind,
  count,
  after,
  cfg,
  session: createRetrievalSession({ runId: 'live-debug' }),
  logEvent: (type, message) => console.log(`  [${type}] ${message}`),
});
console.log('\n=== result ===');
console.log('ok:', result.ok, '| failureReason:', result.failureReason || '-', '| fromCache:', result.fromCache);
console.log('providerTrail:', JSON.stringify(result.providerTrail));
result.sources.forEach((source, index) => {
  console.log(`\n${index + 1}. ${source.title}`);
  console.log(`   ${source.finalUrl || source.url} (status=${source.verification?.httpStatus}${source.verification?.botBlocked ? ', bot-blocked' : ''})`);
});
process.exit(0);
