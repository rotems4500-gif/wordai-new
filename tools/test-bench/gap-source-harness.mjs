// gap-source-harness.mjs — מריץ את סגירת הפער מול מנוע האחזור האמיתי.
//
// מה זה בודק:
//   1. buildGapQuery בונה שאילתה סבירה מסעיף — דטרמיניסטית, בלי AI.
//   2. fillGapForSection באמת מביא מקורות, מושך עמודים, ומכניס לאינדקס.
//   3. **כמה קריאות למודל שפה זה עולה** — אפס קריאות *כתיבה*; מדרגת הנפילה
//      בסולם האחזור (Gemini+GoogleSearch) היא קריאת LLM אחת קצרה לחילוץ metadata.
//   4. הנפילה לתקציר עובדת ומסומנת strength:'abstract'.
//   5. הסעיף באמת יוצא מ-blocked אחרי הסגירה.
//
// הרצה: node tools/test-bench/run-gap-harness.mjs

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

// ---- הפרדה בין קריאות חיפוש לקריאות מודל-שפה ----
// זו הטענה המרכזית של הפיצ'ר: סגירת פער לא עולה קריאת LLM. נמדד, לא מוצהר.
const CALLS = { llm: [], search: [], other: [] };
const LLM_PATTERN = /generativelanguage\.googleapis\.com|api\.openai\.com|api\.anthropic\.com|api\.groq\.com/i;
const SEARCH_PATTERN = /serpapi\.com|api\.perplexity\.ai/i;
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const clean = url.replace(/(key=|api_key=)[^&]+/gi, '$1***');
    if (LLM_PATTERN.test(url)) CALLS.llm.push(clean);
    else if (SEARCH_PATTERN.test(url)) CALLS.search.push(clean);
    else if (/^https?:/i.test(url)) CALLS.other.push(clean);
    return realFetch(input, init);
  };
}

const ai = await import('aiservice');
const gap = await import('gapsource');
const { getMaterialStoreStats, getMaterials, getMaterialChunks } = await import('matstore');
const { findEvidenceForSection } = await import('evmatch');
const { buildPrepLedger, PREP_STATE } = await import('prepsvc');
const { setPageTextTransport } = await import('pagetext');

if (process.env.WORDAI_CFG) {
  localStorage.setItem('ai_provider_config', process.env.WORDAI_CFG);
  try { ai.hydrateProviderConfigFromDisk?.(); } catch {}
}

// ב-Node אין את ה-Rust ואין את ה-Firebase function — מזריקים טרנספורט שמושך ישירות
// ומחלץ טקסט מ-HTML. זה מדמה את מה שהפונקציה עושה בייצור.
setPageTextTransport(async (urls) => Promise.all(urls.map(async (url) => {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WordFlowLab/1.0)', 'Accept-Language': 'he,en' },
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { url, ok: res.ok, status: res.status, finalUrl: res.url, title: title.trim(), text, error: '' };
  } catch (err) {
    return { url, ok: false, status: 0, finalUrl: '', title: '', text: '', error: String(err?.message || err) };
  }
})));

const SECTION = {
  id: 'sec_gap',
  title: 'אפקט הקונפורמיות של אש',
  intent: 'exposition',
  instructions: 'הציגו את מחקר הקונפורמיות הקלאסי של אש ואת ההסברים התיאורטיים לתוצאותיו.',
  keywords: ['קונפורמיות', 'לחץ קבוצתי'],
  wordQuota: 300,
};

const SPEC = {
  title: 'עבודה מסכמת בפסיכולוגיה חברתית',
  totalWords: 1200,
  citationStyle: 'APA',
  sections: [SECTION],
};

console.log('provider:', ai.getActiveProviderName());

// ---- 1. השאילתה ----
console.log('\n===== buildGapQuery =====');
const query = gap.buildGapQuery(SECTION, { spec: SPEC });
console.log(`"${query}"`);
console.log('נבנתה בלי קריאת רשת:', CALLS.llm.length === 0 && CALLS.search.length === 0 ? '✓' : '✗');

// ---- 2. מצב הסעיף לפני ----
const before = await findEvidenceForSection(SECTION);
const ledgerBefore = buildPrepLedger({ spec: SPEC, evidence: { [SECTION.id]: before } });
const blockedBefore = ledgerBefore.items.filter((i) => i.state === PREP_STATE.BLOCKED).length;
console.log(`\nלפני: ${before.evidence.length} ראיות · ${blockedBefore} יחידות חסומות`);

// ---- 3. סגירת הפער ----
console.log('\n===== fillGapForSection =====');
const t0 = Date.now();
const result = await gap.fillGapForSection(SECTION, {
  spec: SPEC,
  count: 4,
  onProgress: (stage, detail) => console.log(`  · ${stage}`, detail),
});
const secs = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`\nתוצאה: ok=${result.ok} · ${result.added} chunks · ${secs}s`);
if (!result.ok) console.log('סיבה:', result.reason);
result.ingested.forEach((s, i) => {
  console.log(`  ${i + 1}. [${s.strength === 'full' ? 'טקסט מלא' : 'תקציר'}] ${s.title.slice(0, 70)} (${s.chunks} chunks)`);
  console.log(`     ${s.url}`);
});
result.skipped.forEach((s) => console.log(`  ✗ ${s.reason}: ${String(s.title || s.url).slice(0, 60)}`));

// ---- 4. הבדיקה המרכזית: אפס קריאות למודל שפה ----
console.log('\n===== עלות =====');
console.log('סולם ספקים:', (result.providerTrail || []).map((t) => `${t.providerId || t}:${t.state || t.status || '?'}`).join(' → ') || '(לא נרשם)');
// קריאה אחת לכל מדרגת-נפילה של Gemini = חיפוש. מעבר לזה — מישהו כותב טקסט, וזה באג.
const llmBudget = 2;
console.log(`קריאות מודל שפה: ${CALLS.llm.length} ${CALLS.llm.length <= llmBudget ? '✓ (חיפוש בלבד)' : '✗ יותר מדי — מישהו כותב טקסט!'}`);
CALLS.llm.forEach((u) => console.log(`    · ${u.slice(0, 100)}`));
console.log(`קריאות ספק חיפוש: ${CALLS.search.length}`);
console.log(`משיכות עמוד/אחר : ${CALLS.other.length}`);

// ---- 5. הסעיף יצא מחסימה? ----
console.log('\n===== אחרי =====');
const after = await findEvidenceForSection(SECTION);
const ledgerAfter = buildPrepLedger({ spec: SPEC, evidence: { [SECTION.id]: after } });
const blockedAfter = ledgerAfter.items.filter((i) => i.state === PREP_STATE.BLOCKED).length;
console.log(`${after.evidence.length} ראיות (${after.mode}) · ${blockedAfter} יחידות חסומות`);
console.log('הפער נסגר:', blockedAfter < blockedBefore && after.evidence.length > 0 ? '✓' : '✗');

after.evidence.forEach((e, i) => {
  console.log(`  ${i + 1}. [${e.score}] ${e.sourceTitle.slice(0, 55)}${e.strength === 'abstract' ? ' (תקציר)' : ''}`);
  console.log(`     "${e.text.slice(0, 110)}…"`);
});

// ---- 6. תקינות האינדקס ----
const stats = getMaterialStoreStats();
console.log(`\nאינדקס: ${getMaterials().length} מקורות · ${stats.chunks ?? getMaterialChunks().length} chunks`);
const urlsKept = getMaterials().filter((m) => m.sourceUrl).length;
console.log(`מקורות עם URL שמור: ${urlsKept} ${urlsKept === result.ingested.length ? '✓' : '(חלק בלי URL)'}`);
