// assignment-ai-harness.mjs — מריץ את שלב 2 של שלד המטלה מול ספק אמיתי.
//
// מה זה בודק: draftSectionFromEvidence כותב טיוטה לסעיף *רק* מהראיות שסופקו,
// מפנה אליהן, ולא ממציא מקורות. וגם: buildScaffoldContextBlock מייצר את בלוק
// ההקשר שמוזרק לחלונית ה-AI.
//
// למה harness ולא בדיקה בדפדפן: לדפדפן התצוגה אין מפתחות. כאן רצים אותם קבצים
// בדיוק, עם ה-config המפוענח מ-DPAPI (כמו ה-LAB).
//
// בנייה + הרצה:
//   WORDAI_VERIFY_ENTRY=assign npx vite build --config vite.verify.config.mjs
//   node <SCRATCH>/out-assign/sf.mjs
// ה-config מוזרק דרך WORDAI_CFG (ראה tools/test-bench/run-assignment-harness.mjs).

// ---- browser shims (aiService הוא browser-coupled) ----
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

// ---- לכידת הבקשה היוצאת (ממוסך) — כדי לראות את הפרומפט שבאמת נשלח ----
const WIRE = [];
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (/googleapis|openai|anthropic|perplexity|groq/i.test(url)) {
      WIRE.push({ url: url.replace(/(key=)[^&]+/i, '$1***'), body: String(init?.body || '').slice(0, 4000) });
    }
    return realFetch(input, init);
  };
}

// סופר קריאות לכל שלב — כדי לענות על "כמה קריאות API עולה סעיף".
const countFrom = (mark) => WIRE.length - mark;

const ai = await import('aiservice');
const { draftSectionFromEvidence, buildScaffoldContextBlock } = await import('assignai');

// ---- seeding ----
if (process.env.WORDAI_CFG) {
  localStorage.setItem('ai_provider_config', process.env.WORDAI_CFG);
  try { ai.hydrateProviderConfigFromDisk?.(); } catch {}
}

console.log('provider:', ai.getActiveProviderName());
console.log('usable  :', ai.hasUsableAiProvider());

// ---- fixture: סעיף אחד + ראיות אמיתיות מ"מאמרים" ----
const SECTION = {
  id: 'sec_1',
  title: 'שיטת המחקר של אש',
  intent: 'method',
  instructions: 'תארו את ההליך ואת המדגם במחקר הקונפורמיות של אש.',
  wordQuota: 180,
};

const EVIDENCE = [
  {
    chunkId: 'mk_1',
    sourceTitle: 'אש 1951 — קונפורמיות',
    pageHint: 3,
    sectionHint: 'שיטת המחקר',
    text: 'במחקר השתתפו מאה ועשרים ושלושה נבדקים גברים, סטודנטים לתואר ראשון. ההליך כלל שמונה עשר סבבי שיפוט, מתוכם שנים עשר סבבים קריטיים שבהם הרוב ענה תשובה שגויה באופן אחיד. הנבדק האמיתי ישב תמיד במקום הלפני אחרון, כך ששמע את רוב התשובות לפני שענה בעצמו.',
    score: 0.84,
  },
  {
    chunkId: 'mk_2',
    sourceTitle: 'אש 1951 — קונפורמיות',
    pageHint: 5,
    sectionHint: 'ממצאים',
    text: 'כשליש מן התגובות בסבבים הקריטיים תאמו את התשובה השגויה של הרוב. כשלושה רבעים מן הנבדקים נכנעו ללחץ הקבוצתי לפחות פעם אחת לאורך הניסוי. בקבוצת הביקורת שיעור השגיאות היה נמוך מאחוז אחד.',
    score: 0.81,
  },
];

const SCAFFOLD = {
  active: true,
  title: 'עבודה מסכמת בפסיכולוגיה חברתית',
  spec: {
    title: 'עבודה מסכמת בפסיכולוגיה חברתית',
    totalWords: 1200,
    citationStyle: 'APA',
    sourceRequirement: { count: 4, kind: 'min' },
    sections: [SECTION],
  },
  evidence: { sec_1: { evidence: EVIDENCE, gap: false, mode: 'semantic' } },
};

// ---- 1. בלוק ההקשר (לא דורש ספק) ----
console.log('\n===== buildScaffoldContextBlock =====');
// ב-Node אין IndexedDB, ולכן מזריקים את ה-scaffold במקום לקרוא מהחנות.
const ctx = buildScaffoldContextBlock({ sectionId: 'sec_1', scaffold: SCAFFOLD });
console.log(ctx || '(ריק)');

// ---- 2. טיוטה מעוגנת מול ספק אמיתי ----
console.log('\n===== draftSectionFromEvidence =====');
const wireBefore = WIRE.length;
const t0 = Date.now();
const result = await draftSectionFromEvidence(SECTION, { evidence: EVIDENCE, scaffold: SCAFFOLD });
const ms = Date.now() - t0;
console.log(`קריאות API לסעיף הזה: ${countFrom(wireBefore)}`);
WIRE.slice(wireBefore).forEach((w, i) => console.log(`  ${i + 1}. ${w.url.slice(0, 90)}`));

if (!result.ok) {
  console.log('❌ נכשל:', result.reason);
} else {
  const words = result.text.split(/\s+/).filter(Boolean).length;
  console.log(`✅ ${words} מילים (מכסה ${SECTION.wordQuota}) · ${(ms / 1000).toFixed(1)}s · ${result.usedEvidence} ראיות\n`);
  console.log(result.text);

  // ---- בדיקות עיגון ----
  console.log('\n===== בדיקות =====');
  const hasCitation = /\([^)]*(עמ'|עמ׳|\d{4})[^)]*\)/.test(result.text);
  const flaggedGap = /\[דרוש מקור/.test(result.text);
  // מספרים שבטיוטה אך לא במקור = חשד להמצאה. היוריסטיקה בלבד: כותרות המקורות
  // נספרות גם הן (משם באה השנה בציטוט), ומספר שכתוב במילים בראיה ומופיע כספרה
  // בטיוטה אינו המצאה — לכן נבדקת גם הצורה המילולית העברית.
  const HEB_NUM_WORDS = { 123: 'מאה ועשרים ושלושה', 18: 'שמונה עשר', 12: 'שנים עשר' };
  const evidenceText = [
    ...EVIDENCE.map((e) => `${e.text} ${e.sourceTitle} ${e.pageHint ?? ''}`),
  ].join(' ');
  const nums = [...result.text.matchAll(/\b\d{2,}\b/g)].map((m) => m[0]);
  const inventedNums = [...new Set(nums)].filter((n) => (
    !evidenceText.includes(n) && !(HEB_NUM_WORDS[n] && evidenceText.includes(HEB_NUM_WORDS[n]))
  ));
  console.log('הפניה לפחות אחת:', hasCitation ? '✓' : '✗');
  console.log('סימן פער כשחסר :', flaggedGap ? '✓ (סימן)' : '— (לא סימן)');
  console.log('מספרים שלא במקור:', inventedNums.length ? `✗ ${inventedNums.join(', ')}` : '✓ אין');
  // חריגה *מעל* המכסה היא כשל; מתחת למכסה עם סימון פער היא ההתנהגות הרצויה —
  // עדיף טקסט קצר שנתמך במקורות מאשר ריפוד עד המכסה.
  const overQuota = words > SECTION.wordQuota * 1.2;
  const underOk = words < SECTION.wordQuota && flaggedGap;
  console.log('היקף            :', overQuota ? `✗ חריגה (${words})`
    : underOk ? `✓ ${words} — קצר מהמכסה אך סימן את הפער`
    : `✓ ${words}`);
}

// ---- 3. סעיף בלי ראיות חייב להיות סירוב, לא טקסט ----
console.log('\n===== סעיף בלי ראיות =====');
const refused = await draftSectionFromEvidence(
  { id: 'sec_2', title: 'כלכלת ישראל בשנות התשעים', intent: 'analysis', wordQuota: 300 },
  { evidence: [], scaffold: SCAFFOLD },
);
console.log(refused.ok ? `✗ כתב טקסט למרות שאין ראיות!` : `✓ סירב: ${refused.reason}`);

console.log('\n===== הפרומפט שנשלח (חתוך) =====');
console.log(WIRE.length ? WIRE[0].body.slice(0, 1500) : '(לא נלכדה בקשה)');
