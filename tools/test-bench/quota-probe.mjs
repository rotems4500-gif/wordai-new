// quota-probe.mjs — ניסוי: האם היקף הסעיף נגזר מכמות הראיות?
// זהה ל-whole-work-harness, אבל s1 מקבל 4 ראיות במקום 1 — אותה מכסה (250).
// אם ההיקף גדל, ה'חצי מכסה' הוא רעב לראיות ולא התנהגות של המודל.
// (מקור) — כתיבת עבודה שלמה בקריאה אחת, מול ספק אמיתי.
//
// הטענות שנבדקות:
//   1. **קריאה אחת** לכל העבודה, לא אחת לסעיף. זו כל הפואנטה.
//   2. כל הסעיפים שיש להם ראיות נכתבו, והפרסור לפי הסמנים מצליח.
//   3. סעיף בלי ראיות **לא נשלח למודל** וחוזר כ-blocked.
//   4. הביבליוגרפיה נבנית מהפרובננס ולא מהמודל — ולכן לא מכילה מקור מומצא.
//   5. אין מספרים שלא מופיעים בראיות.
//
// הרצה: node tools/test-bench/run-whole-work-harness.mjs

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

const WIRE = [];
const LLM_PATTERN = /generativelanguage\.googleapis\.com|api\.openai\.com|api\.anthropic\.com|api\.groq\.com|api\.perplexity\.ai/i;
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (LLM_PATTERN.test(url)) {
      WIRE.push({ url: url.replace(/(key=)[^&]+/i, '$1***'), body: String(init?.body || '') });
    }
    return realFetch(input, init);
  };
}

const ai = await import('aiservice');
const { draftWholeWork, buildBibliography, parseWholeWorkOutput } = await import('assignai');
const { buildWholeWorkHtml } = await import('scaffolddoc');

if (process.env.WORDAI_CFG) {
  localStorage.setItem('ai_provider_config', process.env.WORDAI_CFG);
  try { ai.hydrateProviderConfigFromDisk?.(); } catch {}
}
console.log('provider:', ai.getActiveProviderName());

// ---- fixture: 3 סעיפים, אחד מהם *בלי* ראיות ----
const SECTIONS = [
  { id: 's1', title: 'רקע: מחקר הקונפורמיות של אש', intent: 'exposition', wordQuota: 200,
    instructions: 'הציגו את הרקע למחקר.' },
  { id: 's2', title: 'שיטת המחקר', intent: 'method', wordQuota: 180,
    instructions: 'תארו את ההליך ואת המדגם.' },
  { id: 's3', title: 'יישום בארגונים בישראל', intent: 'analysis', wordQuota: 200,
    instructions: 'נתחו את ההשלכות לארגונים ישראליים.' }, // בכוונה בלי ראיות
];

const SPEC = {
  title: 'עבודה מסכמת בפסיכולוגיה חברתית',
  totalWords: 600,
  citationStyle: 'APA',
  sections: SECTIONS,
};

const EV_S1 = [
  { chunkId: 'c1', materialId: 'm1', sourceTitle: 'אש 1951 — קונפורמיות', pageHint: 2,
    sectionHint: 'מבוא', strength: 'full', sourceUrl: 'https://example.org/asch1951',
    text: 'שאלת המחקר נגזרה מן הוויכוח על עצמאות השיפוט מול הכניעה ללחץ חברתי. עד אז הונח שאדם בוגר שומר על שיפוטו כאשר העובדות ברורות לעין, ואש ביקש לבחון את ההנחה הזו בתנאי מעבדה מבוקרים.', score: 0.86 },
  { chunkId: 'c1b', materialId: 'm1', sourceTitle: 'אש 1951 — קונפורמיות', pageHint: 1,
    sectionHint: 'רקע', strength: 'full', sourceUrl: 'https://example.org/asch1951',
    text: 'הרקע למחקר היה עבודתו של שריף על נורמות קבוצתיות, שבה נעשה שימוש בגירוי עמום. אש טען שדווקא גירוי עמום מזמין הסתמכות על אחרים, ולכן המבחן האמיתי לקונפורמיות מחייב גירוי חד וברור שבו לנבדק אין ספק מה עיניו רואות.', score: 0.85 },
  { chunkId: 'c1c', materialId: 'm2', sourceTitle: 'לוין 2004 — סקירת קונפורמיות', pageHint: 4,
    sectionHint: 'מסגרת תיאורטית', strength: 'full', sourceUrl: 'https://example.org/levin2004',
    text: 'בספרות מקובל להבחין בין השפעה נורמטיבית, שמקורה ברצון להתקבל ולהימנע מדחייה חברתית, לבין השפעה אינפורמטיבית, שבה הפרט מניח שהרוב מחזיק במידע טוב יותר משלו. ההבחנה הזו נוסחה בעקבות ממצאיו של אש.', score: 0.83 },
  { chunkId: 'c1d', materialId: 'm2', sourceTitle: 'לוין 2004 — סקירת קונפורמיות', pageHint: 6,
    sectionHint: 'ביקורת', strength: 'full', sourceUrl: 'https://example.org/levin2004',
    text: 'הביקורת המרכזית על הפרדיגמה נגעה לתקפות החיצונית שלה: מטלת שיפוט קווים במעבדה רחוקה מהחלטות בעלות משמעות בחיי היומיום, ומדגם של סטודנטים גברים בשנות החמישים אינו מייצג אוכלוסייה רחבה.', score: 0.81 },
];

const EV_S2 = [
  {
    chunkId: 'c2', materialId: 'm1', sourceTitle: 'אש 1951 — קונפורמיות', pageHint: 3,
    sectionHint: 'שיטת המחקר', strength: 'full', sourceUrl: 'https://example.org/asch1951',
    text: 'במחקר השתתפו מאה ועשרים ושלושה נבדקים גברים, סטודנטים לתואר ראשון. ההליך כלל שמונה עשר סבבי שיפוט, מתוכם שנים עשר סבבים קריטיים שבהם הרוב ענה תשובה שגויה באופן אחיד.',
    score: 0.84,
  },
  {
    chunkId: 'c3', materialId: 'm2', sourceTitle: 'לוין 2004 — סקירת קונפורמיות', pageHint: 11,
    sectionHint: 'ממצאים', strength: 'abstract', sourceUrl: 'https://example.org/levin2004',
    text: 'כשליש מן התגובות בסבבים הקריטיים תאמו את התשובה השגויה של הרוב, ובקבוצת הביקורת שיעור השגיאות היה נמוך מאחוז אחד.',
    score: 0.79,
  },
];

const SCAFFOLD = {
  active: true, title: SPEC.title, spec: SPEC,
  evidence: {
    s1: { evidence: EV_S1, gap: false, mode: 'semantic' },
    s2: { evidence: EV_S2, gap: false, mode: 'semantic' },
    s3: { evidence: [], gap: true, mode: 'semantic' },
  },
};

// ---- 1. הביבליוגרפיה: דטרמיניסטית, בלי מודל ----
console.log('\n===== buildBibliography (בלי מודל) =====');
const bib = buildBibliography([...EV_S1, ...EV_S2]);
bib.forEach((b) => console.log(`  · ${b.title}${b.weak ? ' [תקציר]' : ''} — ${b.url}`));
console.log('שני מקורות ייחודיים משלושה קטעים:', bib.length === 2 ? '✓' : `✗ (${bib.length})`);
console.log('קריאות עד כה:', WIRE.length, WIRE.length === 0 ? '✓ אפס' : '✗');

// ---- 2. הקריאה האחת ----
console.log('\n===== draftWholeWork =====');
const t0 = Date.now();
const result = await draftWholeWork(SPEC, { scaffold: SCAFFOLD });
const secs = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`\nקריאות API לכל העבודה: ${WIRE.length} ${WIRE.length === 1 ? '✓ (אחת, כמתוכנן)' : '✗ אמורה להיות אחת!'}`);
console.log(`זמן: ${secs}s`);

if (!result.ok) {
  console.log('❌ נכשל:', result.reason);
} else {
  console.log(`סעיפים שנכתבו: ${result.sections.length} · חסומים: ${result.blocked.length} · ראיות: ${result.usedEvidence}`);
  console.log('סעיף בלי ראיות לא נשלח:', result.blocked.some((b) => b.id === 's3') ? '✓' : '✗');
  console.log('הפרסור זיהה סעיפים:', result.sections.every((s) => !s.unparsed) ? '✓' : '✗ (נפל ל-raw)');

  result.sections.forEach((s) => {
    const words = s.text.split(/\s+/).filter(Boolean).length;
    const matched = SECTIONS.some((x) => x.id === s.id);
    console.log(`\n── ${s.title} (${words} מילים)${matched ? '' : ' ⚠ כותרת לא זוהתה'}`);
    console.log(s.text.slice(0, 400));
  });

  // ---- 3. עיגון ----
  console.log('\n===== בדיקות עיגון =====');
  const full = result.sections.map((s) => s.text).join('\n');
  const evidenceText = [...EV_S1, ...EV_S2].map((e) => `${e.text} ${e.sourceTitle} ${e.pageHint}`).join(' ');
  const HEB_NUM_WORDS = { 123: 'מאה ועשרים ושלושה', 18: 'שמונה עשר', 12: 'שנים עשר' };
  const nums = [...new Set([...full.matchAll(/\b\d{2,}\b/g)].map((m) => m[0]))];
  const invented = nums.filter((n) => !evidenceText.includes(n) && !(HEB_NUM_WORDS[n] && evidenceText.includes(HEB_NUM_WORDS[n])));
  console.log('הפניות בסוגריים:', /\([^)]*(עמ'|עמ׳|\d{4})[^)]*\)/.test(full) ? '✓' : '✗');
  console.log('מספרים שלא במקור:', invented.length ? `✗ ${invented.join(', ')}` : '✓ אין');
  // חוק 4 במערכת: המודל לא כותב ביבליוגרפיה. אם כתב — הוא התעלם מההוראה.
  const modelWroteBib = /^\s*(ביבליוגרפיה|רשימת מקורות|מקורות)\s*:?\s*$/m.test(full);
  console.log('המודל נמנע מרשימת מקורות:', modelWroteBib ? '✗ כתב בעצמו' : '✓');
  console.log('סימון פער כשחסר:', /\[דרוש מקור/.test(full) ? '✓ סימן' : '— לא סימן');

  // ---- 4. ההרכבה ל-HTML ----
  console.log('\n===== buildWholeWorkHtml =====');
  const html = buildWholeWorkHtml(SPEC, result);
  const h2Count = (html.match(/<h2>/g) || []).length;
  console.log(`h2: ${h2Count} (צפוי ${SECTIONS.length} + ביבליוגרפיה = ${SECTIONS.length + 1})`, h2Count === SECTIONS.length + 1 ? '✓' : '✗');
  console.log('סעיף חסום מסומן במקומו:', /דרוש מקור — הסעיף לא נכתב/.test(html) ? '✓' : '✗');
  console.log('סדר לפי ה-spec:', html.indexOf('שיטת המחקר') < html.indexOf('יישום בארגונים') ? '✓' : '✗');
  console.log('אין תגיות ש-TipTap מסנן:', /<(div|blockquote|span)\b/i.test(html) ? '✗' : '✓');
  console.log(`\n${html.slice(0, 500)}…`);
}

// ---- 5. פרסור עצמאי ----
console.log('\n===== parseWholeWorkOutput (יחידה) =====');
const fake = '@@סעיף: שיטת המחקר\nגוף ראשון.\n\n@@סעיף: "רקע: מחקר הקונפורמיות של אש"\nגוף שני.';
const parsed = parseWholeWorkOutput(fake, SECTIONS);
console.log('התאמה למרות מירכאות:', parsed.length === 2 && parsed[1].id === 's1' ? '✓' : `✗ ${JSON.stringify(parsed.map((p) => p.id))}`);
