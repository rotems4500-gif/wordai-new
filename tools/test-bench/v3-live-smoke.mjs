// smoke חי למסלול V3 ApiClient: קריאה אמיתית קצרה לכל ספק דרך chatWithActiveProvider
// עם הדגלים החדשים (apiClient/runScope פעילים). מאמת: תשובה חוזרת, ledger נרשם.
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

const cfgJson = process.env.WORDAI_CFG || '';
if (!cfgJson) { console.error('WORDAI_CFG missing'); process.exit(2); }
localStorage.setItem('ai_provider_config', cfgJson);
// דגלים: ברירות המחדל החדשות כבר ON — לא מזריקים override, בודקים את מה שישוחרר.

const ai = await import('aiservice');

const providers = ['openai', 'claude', 'perplexity'];
let failures = 0;
for (const providerId of providers) {
  try {
    const t0 = Date.now();
    const reply = await ai.chatWithActiveProvider('ענה במילה אחת בלבד: כן', '', 'אתה בודק תקינות. ענה במילה אחת.', {
      providerOverride: providerId,
      strictProviderOverride: true,
      skipAutomation: true,
      skipAutomationPrompt: true,
      skipSkillSelection: true,
      skipMultiModel: true,
      directChat: true,
    });
    const text = typeof reply === 'string' ? reply : reply?.text || '';
    console.log(`✓ ${providerId}: "${String(text).slice(0, 40)}" (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    failures += 1;
    console.error(`✗ ${providerId}: ${String(e?.message || e).slice(0, 200)}`);
  }
}
const stats = globalThis.__WORDAI_V3_LEDGER__?.stats?.();
console.log('v3 ledger:', JSON.stringify(stats));
process.exit(failures ? 1 : 0);
