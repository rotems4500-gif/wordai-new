// review-unit.mjs — בדיקת יחידה ל-reviewDraft. **אפס קריאות API** בכוונה:
// אם הסקירה הייתה צריכה מודל כדי לרוץ, היא הייתה הופכת בעצמה למקור לטעויות.
//
// הרצה: node tools/test-bench/run-review-unit.mjs

globalThis.window = globalThis;
globalThis.self = globalThis;
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k), clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; },
};
if (typeof globalThis.navigator === 'undefined') globalThis.navigator = { userAgent: 'node-lab', language: 'he' };
globalThis.document = {
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }),
  createTextNode: () => ({}), addEventListener() {}, removeEventListener() {},
  querySelector: () => null, querySelectorAll: () => [],
  body: { appendChild() {}, removeChild() {} }, documentElement: { style: {} }, hidden: false,
};
globalThis.addEventListener = globalThis.addEventListener || (() => {});
globalThis.removeEventListener = globalThis.removeEventListener || (() => {});
globalThis.dispatchEvent = globalThis.dispatchEvent || (() => true);
if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent { constructor(t, o = {}) { this.type = t; this.detail = o.detail; } };
}

// כל קריאת רשת כאן היא כשל בהגדרה.
let netCalls = 0;
{
  const real = globalThis.fetch;
  globalThis.fetch = async (...args) => { netCalls += 1; return real(...args); };
}

const { reviewDraft, SEVERITY, FINISHING_PASSES, estimatePassCalls } = await import('review');

let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
};
const has = (r, id) => r.findings.some((f) => f.id === id);
const get = (r, id) => r.findings.find((f) => f.id === id);

const words = (n) => Array.from({ length: n }, (_, i) => `מילה${i}`).join(' ');

const SPEC = {
  title: 'מטלה',
  totalWords: 600,
  sourceRequirement: { count: 3, kind: 'min' },
  sections: [
    { id: 's1', title: 'סעיף מלא', wordQuota: 100 },
    { id: 's2', title: 'סעיף רעב', wordQuota: 300 },
    { id: 's3', title: 'סעיף חסום', wordQuota: 100 },
  ],
};

// s1: מלא במכסה, עם הפניה. s2: קצר, עם מעט ראיות ועם סימון פער.
const DRAFT = {
  sections: [
    { id: 's1', title: 'סעיף מלא', text: `${words(95)} (כהן, עמ' 3)` },
    { id: 's2', title: 'סעיף רעב', text: `${words(60)} (לוי, 2019)\n\n[דרוש מקור נוסף: נתוני שכיחות]` },
  ],
  blocked: [{ id: 's3', title: 'סעיף חסום' }],
  bibliography: [
    { title: 'כהן 2019', url: 'https://a', weak: false },
    { title: 'לוי 2019', url: 'https://b', weak: true },
  ],
};

const EVIDENCE = {
  s1: { evidence: [{ text: words(70) }] },
  // 2 קטעים × 30 מילים = 60 → כ-96 מילים ניתנות להשגה מול מכסה 300 ⇒ "רעב".
  s2: { evidence: [{ text: words(30) }, { text: words(30) }] },
  s3: { evidence: [] },
};

console.log('\n===== reviewDraft =====');
const r = reviewDraft(SPEC, DRAFT, { evidenceBySection: EVIDENCE });
r.findings.forEach((f) => console.log(`  [${f.severity}] ${f.title}`));

console.log('\n----- בדיקות -----');
check('אפס קריאות רשת', netCalls === 0, `בוצעו ${netCalls}`);
check('סעיף חסום מדווח כ-BLOCK', get(r, 'blocked:s3')?.severity === SEVERITY.BLOCK);
check('סעיף בתוך המכסה אינו מדווח', !has(r, 'short:s1'));
check('סעיף קצר מדווח', has(r, 'short:s2'));

const short = get(r, 'short:s2');
check('קוצר מזוהה כמחסור במקורות', short?.actionable === 'more-sources', short?.actionable);
check('ההסבר נוקב במספר המילים בר-ההשגה', /96|כ-\d+ מילים/.test(short?.detail || ''), short?.detail);

check('סימון פער מדווח', has(r, 'gap:s2'));
check('מקור תקציר מדווח', has(r, 'weak-sources'));
check('מחסור במקורות הוא BLOCK', get(r, 'source-count')?.severity === SEVERITY.BLOCK);
check('ready=false כשיש חסם', r.ready === false);
check('חסמים ממוינים ראשונים', r.findings[0].severity === SEVERITY.BLOCK);
// 165 = s1 (95 + 3 אסימוני ההפניה) + s2 (60 + 2 אסימוני ההפניה + 5 של שורת הפער).
// ההפניות וסימון הפער נספרים בכוונה: זה מה שיוגש בפועל, וזו הספירה שהמשתמש רואה.
check('ספירת מילים כוללת', r.stats.totalWords === 165, `קיבלתי ${r.stats.totalWords}`);

// פסקה מהותית בלי הפניה
console.log('\n===== פסקה בלי הפניה =====');
const r2 = reviewDraft(
  { title: 'ט', sections: [{ id: 'a', title: 'א', wordQuota: 30 }] },
  { sections: [{ id: 'a', title: 'א', text: `${words(40)}` }], blocked: [], bibliography: [] },
  { evidenceBySection: { a: { evidence: [{ text: words(100) }] } } },
);
check('פסקה ארוכה בלי הפניה מסומנת', has(r2, 'uncited:a'));

const r3 = reviewDraft(
  { title: 'ט', sections: [{ id: 'a', title: 'א', wordQuota: 30 }] },
  { sections: [{ id: 'a', title: 'א', text: `${words(15)}` }], blocked: [], bibliography: [] },
  { evidenceBySection: { a: { evidence: [{ text: words(100) }] } } },
);
check('פסקה קצרה (מעבר) לא מסומנת', !has(r3, 'uncited:a'));

// עבודה תקינה לגמרי
console.log('\n===== עבודה נקייה =====');
const clean = reviewDraft(
  { title: 'ט', sections: [{ id: 'a', title: 'א', wordQuota: 50 }] },
  { sections: [{ id: 'a', title: 'א', text: `${words(48)} (כהן, עמ' 2)` }], blocked: [], bibliography: [{ title: 'כהן', weak: false }] },
  { evidenceBySection: { a: { evidence: [{ text: words(100) }] } } },
);
check('אין ליקויים', clean.findings.length === 0, JSON.stringify(clean.findings.map((f) => f.id)));
check('ready=true', clean.ready === true);

console.log('\n===== estimatePassCalls =====');
check('none → 0', estimatePassCalls(FINISHING_PASSES.NONE) === '0');
check('style → 1', estimatePassCalls(FINISHING_PASSES.STYLE) === '1');
check('humanize → 0–4', estimatePassCalls(FINISHING_PASSES.HUMANIZE) === '0–4');
check('both → 1 + 0–4', estimatePassCalls(FINISHING_PASSES.BOTH) === '1 + 0–4');

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} עברו, ${fail} נכשלו · קריאות רשת: ${netCalls}`);
if (fail) process.exitCode = 1;
