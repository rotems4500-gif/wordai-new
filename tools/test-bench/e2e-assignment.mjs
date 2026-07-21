// e2e-assignment.mjs — הזרימה המלאה של שלד המטלה, מקצה לקצה, מול ספקים אמיתיים.
//
// זה הבדיקה שסוגרת את הלולאה. כל שלב נבדק בנפרד בהרנסים אחרים; כאן בודקים שהם
// מתחברים:
//
//   הנחיות → פרסור → חומרי עזר → אינדוקס → שיוך ראיות → סעיף חסום →
//   חיפוש מקורות ברשת → שיוך מחדש → כתיבת העבודה בקריאה אחת → סקירה → HTML
//
// מה שלא נבדק כאן: הפרופיל האישי (דורש קורפוס של המשתמש) ומעברי הליטוש
// (נבדקים ב-review-unit; הרצתם כאן רק תשרוף קריאות בלי לגלות אינטגרציה).
//
// הרצה: node tools/test-bench/run-e2e-assignment.mjs

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k), clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; },
};
globalThis.window = globalThis;
globalThis.self = globalThis;
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

const CALLS = { llm: [], search: [], page: [] };
const LLM_RE = /generativelanguage\.googleapis\.com|api\.openai\.com|api\.anthropic\.com|api\.groq\.com/i;
const SEARCH_RE = /serpapi\.com|api\.perplexity\.ai/i;
{
  const real = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const clean = url.replace(/(key=|api_key=)[^&]+/gi, '$1***');
    if (LLM_RE.test(url)) CALLS.llm.push(clean);
    else if (SEARCH_RE.test(url)) CALLS.search.push(clean);
    else if (/^https?:/i.test(url)) CALLS.page.push(clean);
    return real(input, init);
  };
}

const ai = await import('aiservice');
const { parseAssignmentSpec } = await import('specsvc');
const { addMaterialDocument, getMaterialStoreStats, clearMaterialStore } = await import('matstore');
const { ensureMaterialsEmbedded, findEvidenceForSpec, findEvidenceForSection } = await import('evmatch');
const { fillGapAndRematch } = await import('gapsource');
const { buildPrepLedger, summarizeLedger, PREP_STATE } = await import('prepsvc');
const { draftWholeWork } = await import('assignai');
const { reviewDraft, SEVERITY } = await import('review');
const { buildWholeWorkHtml } = await import('scaffolddoc');
const { setPageTextTransport } = await import('pagetext');

if (process.env.WORDAI_CFG) {
  localStorage.setItem('ai_provider_config', process.env.WORDAI_CFG);
  try { ai.hydrateProviderConfigFromDisk?.(); } catch {}
}

// ב-Node אין Rust ואין את ה-Firebase function — טרנספורט ישיר שמדמה אותם.
setPageTextTransport(async (urls) => Promise.all(urls.map(async (url) => {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WordFlowLab/1.0)', 'Accept-Language': 'he,en' },
      signal: AbortSignal.timeout(12000),
    });
    const html = await res.text();
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    return { url, ok: res.ok, status: res.status, finalUrl: res.url, title: title.trim(), text, error: '' };
  } catch (err) {
    return { url, ok: false, status: 0, finalUrl: '', title: '', text: '', error: String(err?.message || err) };
  }
})));

let pass = 0; let fail = 0; const broken = [];
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; broken.push(`${name}${extra ? ` — ${extra}` : ''}`); console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
};

console.log('provider:', ai.getActiveProviderName());
clearMaterialStore();

// ══════ שלב 1: הנחיות המטלה ══════
const INSTRUCTIONS = `עבודה מסכמת בפסיכולוגיה חברתית — קונפורמיות

היקף כולל: 700 מילים. סגנון ציטוט APA. נדרשים לפחות 2 מקורות.

1. רקע תיאורטי — הציגו את הרקע למחקר הקונפורמיות של אש ואת השאלה שהוא בא לבחון. עד 250 מילים.
2. שיטת המחקר — תארו את ההליך ואת המדגם. עד 200 מילים.
3. יישום עכשווי — נתחו את הרלוונטיות של הממצאים לרשתות חברתיות. עד 250 מילים.`;

console.log('\n══════ 1. פרסור הנחיות (0 קריאות) ══════');
const spec = parseAssignmentSpec(INSTRUCTIONS);
console.log(`  כותרת: ${spec.title}`);
console.log(`  סעיפים: ${spec.sections.map((s) => `${s.title} (${s.wordQuota || '?'})`).join(' · ')}`);
console.log(`  היקף ${spec.totalWords} · ציטוט ${spec.citationStyle} · מקורות ${spec.sourceRequirement?.count}`);
check('זוהו 3 סעיפים', spec.sections.length === 3, `${spec.sections.length}`);
check('זוהה היקף כולל', spec.totalWords === 700, String(spec.totalWords));
check('זוהה סגנון ציטוט', spec.citationStyle === 'APA', spec.citationStyle);
check('זוהתה דרישת מקורות', spec.sourceRequirement?.count === 2, JSON.stringify(spec.sourceRequirement));
check('לכל סעיף יש מכסה', spec.sections.every((s) => s.wordQuota > 0));
check('הפרסור לא עלה קריאות', CALLS.llm.length === 0 && CALLS.search.length === 0);

// ══════ שלב 2: חומרי עזר ══════
// שני "מאמרים" שמכסים את סעיפים 1-2 בלבד. סעיף 3 נשאר בכוונה בלי חומר —
// שם נכנס חיפוש המקורות.
const MATERIALS = [
  {
    title: 'אש 1951 — השפעות של לחץ קבוצתי',
    text: `השפעות של לחץ קבוצתי על שינוי ועיוות שיפוט

מבוא
שאלת המחקר נגזרה מן הוויכוח על עצמאות השיפוט מול הכניעה ללחץ חברתי. עד אז הונח שאדם בוגר שומר על שיפוטו כאשר העובדות ברורות לעין. עבודתו של שריף על נורמות קבוצתיות עשתה שימוש בגירוי עמום, ואש טען שדווקא גירוי עמום מזמין הסתמכות על אחרים. המבחן האמיתי לקונפורמיות מחייב אפוא גירוי חד וברור שבו לנבדק אין כל ספק מה עיניו רואות.

שיטת המחקר
במחקר השתתפו מאה ועשרים ושלושה נבדקים גברים, סטודנטים לתואר ראשון. ההליך כלל שמונה עשר סבבי שיפוט, מתוכם שנים עשר סבבים קריטיים שבהם הרוב ענה תשובה שגויה באופן אחיד. הנבדק האמיתי ישב תמיד במקום הלפני אחרון, כך ששמע את רוב התשובות לפני שענה בעצמו. המשימה הייתה להשוות אורך של קו יחיד לשלושה קווי השוואה, ובתנאי ביקורת שיעור השגיאות היה נמוך מאחוז אחד.

ממצאים
כשליש מן התגובות בסבבים הקריטיים תאמו את התשובה השגויה של הרוב. כשלושה רבעים מן הנבדקים נכנעו ללחץ הקבוצתי לפחות פעם אחת לאורך הניסוי. הפיזור בין הנבדקים היה גדול: היו שלא נכנעו כלל, והיו שנכנעו כמעט בכל סבב קריטי.`,
  },
  {
    title: 'לוין 2004 — סקירת ספרות על קונפורמיות',
    text: `קונפורמיות: סקירת ספרות

מסגרת תיאורטית
בספרות מקובל להבחין בין השפעה נורמטיבית, שמקורה ברצון להתקבל ולהימנע מדחייה חברתית, לבין השפעה אינפורמטיבית, שבה הפרט מניח שהרוב מחזיק במידע טוב יותר משלו. ההבחנה הזו נוסחה בעקבות ממצאיו של אש, ומאז שימשה מסגרת מרכזית לניתוח תופעות של ציות קבוצתי.

תנאים מגבירים ומחלישים
גודל הרוב משפיע עד גבול מסוים: המעבר מנבדק תומך אחד לשלושה מגדיל את הקונפורמיות בחדות, ומעבר לכך התוספת שולית. הגורם החזק ביותר להפחתת קונפורמיות הוא נוכחות של בעל ברית יחיד שחולק על הרוב — די בשותף אחד כדי להוריד את שיעור הכניעה באופן דרמטי.

ביקורת
הביקורת המרכזית על הפרדיגמה נגעה לתקפות החיצונית שלה: מטלת שיפוט קווים במעבדה רחוקה מהחלטות בעלות משמעות בחיי היומיום, ומדגם של סטודנטים גברים בשנות החמישים אינו מייצג אוכלוסייה רחבה.`,
  },
];

console.log('\n══════ 2. אינדוקס חומרי עזר (0 קריאות) ══════');
let addedChunks = 0;
MATERIALS.forEach((m) => {
  const res = addMaterialDocument({ title: m.title, text: m.text, source: 'e2e' });
  addedChunks += res.added;
  console.log(`  ${m.title}: ${res.added} קטעים`);
});
check('נוספו קטעים', addedChunks > 0, String(addedChunks));

let embed = { remaining: Infinity, unavailable: null };
for (let i = 0; i < 30 && embed.remaining !== 0; i += 1) {
  embed = await ensureMaterialsEmbedded();
  if (embed.unavailable) break;
}
const stats = getMaterialStoreStats();
console.log(`  אינדקס: ${stats.chunks} קטעים · ${stats.embedded} מוטמעים${embed.unavailable ? ` · הטמעה לא זמינה (${embed.unavailable})` : ''}`);
check('האינדוקס לא עלה קריאות', CALLS.llm.length === 0 && CALLS.search.length === 0);

// ══════ שלב 3: שיוך ראיות ══════
console.log('\n══════ 3. שיוך ראיות (0 קריאות) ══════');
let evidence = await findEvidenceForSpec(spec, { k: 5 });
spec.sections.forEach((s) => {
  const found = evidence.bySection[s.id];
  console.log(`  ${s.title}: ${found.evidence.length} ראיות${found.gap ? ' ⚠ פער' : ''}`);
});
check('מצב ההתאמה אינו none', evidence.mode !== 'none', evidence.mode);
check('סעיפים 1-2 קיבלו ראיות',
  !evidence.bySection[spec.sections[0].id].gap && !evidence.bySection[spec.sections[1].id].gap);
check('סעיף 3 מזוהה כפער', evidence.bySection[spec.sections[2].id].gap === true);
check('השיוך לא עלה קריאות', CALLS.llm.length === 0 && CALLS.search.length === 0);

const ledger0 = buildPrepLedger({ spec, evidence: evidence.bySection });
// summarizeLedger מחזיר משפט בעברית לתצוגה; הספירות עצמן ב-ledger.totals.
const blocked0 = ledger0.totals?.[PREP_STATE.BLOCKED] || 0;
console.log(`  פנקס: ${summarizeLedger(ledger0)}`);
check('יש יחידות חסומות לפני החיפוש', blocked0 > 0, String(blocked0));

// ══════ שלב 4: סגירת הפער ══════
console.log('\n══════ 4. חיפוש מקורות לסעיף החסום ══════');
const gapSection = spec.sections[2];
const llmBefore = CALLS.llm.length;
const gapRes = await fillGapAndRematch(gapSection, { spec });
console.log(`  ok=${gapRes.ok} · ${gapRes.added} קטעים · שאילתה: "${gapRes.query}"`);
gapRes.ingested?.forEach((s) => console.log(`    [${s.strength}] ${s.title.slice(0, 60)} — ${s.url.slice(0, 70)}`));
if (!gapRes.ok) console.log(`  סיבה: ${gapRes.reason}`);
// ⚠️ ב-Node ההטמעה הסמנטית לא זמינה (onnxruntime binding חסר) וההתאמה רצה
// לקסיקלית. מקור באנגלית לא חולק אסימונים עם שאילתה בעברית ולכן ייפול בסף גם
// כשהוא רלוונטי לחלוטין. לכן כאן נבדק מה שהסביבה *כן* יכולה להוכיח: שהחיפוש
// הביא מקור אמיתי והכניס אותו לאינדקס. סגירת הפער בפועל תלויה ב-e5 ונבדקת בדפדפן.
const lexicalOnly = Boolean(embed.unavailable);
// חיפוש חי הוא תלוי-רשת: אותה שאילתה מחזירה מקורות שונים בכל הרצה, ולפעמים
// כלום שמיש. זה לא כשל קוד, ולכן לא מפיל את הריצה — אבל כן נאמר בקול, כי אם
// זה קורה *כל* פעם, משהו כן שבור.
if (gapRes.ok && gapRes.added > 0) {
  check('החיפוש הביא מקור והכניס אותו לאינדקס', true);
} else {
  console.log(`  ⚠ החיפוש לא הביא מקור שמיש בהרצה הזו (${gapRes.reason}) — תלוי רשת, לא נספר ככשל`);
}
if (!lexicalOnly) {
  check('הפער נסגר', (gapRes.evidence?.evidence?.length || 0) > 0, 'נוספו מקורות אך לא עברו את הסף');
} else {
  const passed = (gapRes.evidence?.evidence?.length || 0) > 0;
  console.log(`  ⓘ סגירת הפער לא נבדקת כאן (מצב לקסיקלי) — בפועל ${passed ? 'עברה' : 'לא עברה'} את הסף`);
}
check('החיפוש עלה לכל היותר 2 קריאות מודל', CALLS.llm.length - llmBefore <= 2,
  `${CALLS.llm.length - llmBefore}`);

// שיוך מחדש לכל ה-spec, כי המקור החדש עשוי לשרת גם סעיפים אחרים.
evidence = await findEvidenceForSpec(spec, { k: 5 });
const ledger1 = buildPrepLedger({ spec, evidence: evidence.bySection });
const blocked1 = ledger1.totals?.[PREP_STATE.BLOCKED] || 0;
console.log(`  פנקס אחרי: ${summarizeLedger(ledger1)}`);
if (!lexicalOnly) check('מספר החסומים ירד', blocked1 < blocked0, `${blocked0} → ${blocked1}`);
else console.log(`  ⓘ פנקס: ${blocked0} → ${blocked1} חסומים (מצב לקסיקלי — לא נאכף)`);

// ══════ שלב 5: כתיבת העבודה בקריאה אחת ══════
console.log('\n══════ 5. כתיבת העבודה (קריאה אחת) ══════');
const beforeDraft = CALLS.llm.length;
const t0 = Date.now();
const draft = await draftWholeWork(spec, { scaffold: { active: true, spec, evidence: evidence.bySection } });
const draftCalls = CALLS.llm.length - beforeDraft;
console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s · ${draftCalls} קריאות`);
check('כתיבת העבודה = קריאה אחת', draftCalls === 1, String(draftCalls));
check('הכתיבה הצליחה', draft.ok, draft.reason);

if (draft.ok) {
  draft.sections.forEach((s) => {
    const w = s.text.split(/\s+/).filter(Boolean).length;
    const spec_s = spec.sections.find((x) => x.id === s.id);
    console.log(`  ${s.title}: ${w} מילים (מכסה ${spec_s?.wordQuota || '?'})${s.unparsed ? ' ⚠ לא פורסר' : ''}`);
  });
  // הטענה היציבה: כל סעיף שיש לו ראיות נכתב, וכל סעיף בלי ראיות לא נשלח.
  // כמה סעיפים יש להם ראיות תלוי באיכות האחזור, ולכן לא נאכף כאן.
  check('נכתבו בדיוק הסעיפים שאינם חסומים',
    draft.sections.length === spec.sections.length - draft.blocked.length,
    `${draft.sections.length} נכתבו, ${draft.blocked.length} חסומים`);
  check('כל הכותרות זוהו', draft.sections.every((s) => spec.sections.some((x) => x.id === s.id)),
    draft.sections.filter((s) => !spec.sections.some((x) => x.id === s.id)).map((s) => s.title).join(', '));
  check('ביבליוגרפיה נבנתה', (draft.bibliography || []).length > 0);
  console.log(`  ביבליוגרפיה: ${draft.bibliography.map((b) => `${b.title}${b.weak ? ' [תקציר]' : ''}`).join(' · ')}`);

  // ══════ שלב 6: סקירה ══════
  console.log('\n══════ 6. סקירה (0 קריאות) ══════');
  const reviewCallsBefore = CALLS.llm.length;
  const review = reviewDraft(spec, draft, { evidenceBySection: evidence.bySection });
  console.log(`  סטטיסטיקה: ${JSON.stringify(review.stats)}`);
  review.findings.forEach((f) => console.log(`  [${f.severity}] ${f.title}`));
  check('הסקירה לא עלתה קריאות', CALLS.llm.length === reviewCallsBefore);
  check('הסקירה החזירה מבנה תקין', Array.isArray(review.findings) && typeof review.ready === 'boolean');
  check('ספירת המקורות בסקירה תואמת לביבליוגרפיה',
    review.stats.sources === draft.bibliography.length);
  check('דרישת המקורות נבדקה מול ה-spec', review.stats.requiredSources === spec.sourceRequirement.count);

  // ══════ שלב 7: HTML ══════
  console.log('\n══════ 7. הרכבת המסמך ══════');
  const html = buildWholeWorkHtml(spec, draft);
  const h2 = (html.match(/<h2>/g) || []).length;
  check('כותרת h1 אחת', (html.match(/<h1>/g) || []).length === 1);
  check('h2 לכל סעיף + ביבליוגרפיה', h2 === spec.sections.length + 1, `${h2}`);
  check('אין תגיות ש-TipTap מסנן', !/<(div|blockquote|span)\b/i.test(html));
  check('סדר הסעיפים לפי ה-spec',
    spec.sections.every((s, i) => i === 0
      || html.indexOf(`>${spec.sections[i - 1].title}<`) < html.indexOf(`>${s.title}<`)));
  check('אין HTML גולמי שדלף לטקסט', !/&lt;(p|h2)&gt;/.test(html));
  console.log(`  אורך: ${html.length} תווים`);
}

// ══════ סיכום ══════
console.log('\n══════ עלות כוללת ══════');
console.log(`  קריאות מודל שפה: ${CALLS.llm.length}`);
console.log(`  קריאות ספק חיפוש: ${CALLS.search.length}`);
console.log(`  משיכות עמוד: ${CALLS.page.length}`);

console.log(`\n${fail === 0 ? '✅ הלולאה סגורה' : '❌ נשבר'}: ${pass} עברו, ${fail} נכשלו`);
if (fail) { console.log('\nמה נשבר:'); broken.forEach((b) => console.log(`  · ${b}`)); process.exitCode = 1; }
