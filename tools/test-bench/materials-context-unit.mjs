// materials-context-unit.mjs — בדיקת יחידה ל-rankAutoContextCandidates (הבחירה
// האוטומטית של חומרי עזר ליצירת מסמך). **אפס קריאות API ואפס I/O**: הדירוג הוא
// פונקציה טהורה, ולכן הבדיקה מריצה את קוד האפליקציה האמיתי ישירות ב-Node.
//
// הרצה: node tools/test-bench/run-materials-context-unit.mjs

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

// כל קריאת רשת כאן היא כשל בהגדרה — הדירוג חייב להיות טהור.
let netCalls = 0;
{
  const real = globalThis.fetch;
  globalThis.fetch = async (...args) => { netCalls += 1; return real(...args); };
}

const { rankAutoContextCandidates } = await import('wls');

let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
};

const REQUEST = 'השפעת הרפורמה המשפטית על עצמאות מערכת המשפט בישראל';

// ── 1. תוכן מנצח מטא-דאטה: קובץ קצר וממוקד מול קובץ ענק ולא רלוונטי ──────────
// זה בדיוק המקרה שנשבר בניקוד מטא-דאטה בלבד: לקובץ הרלוונטי אין אף מילה משותפת
// בכותרת, ולכן הוא כלל לא נכנס לדירוג. גם ניקוד תוכן גולמי (ספירת חפיפות) נכשל
// כאן — הקובץ הענק חוזר על מונח אחד אלפי פעמים ומנצח בספירה.
{
  const onTopic = {
    id: 'mat-on',
    title: 'סיכום שיעור 4',
    label: 'חומר קורס',
    content: 'השפעת הרפורמה המשפטית על עצמאות מערכת המשפט בישראל נדונה בהרחבה בשיעור.',
  };
  const offTopic = {
    id: 'mat-off',
    title: 'הרפורמה — מאגר כללי',
    label: 'חומר קורס',
    content: `${'המשפט העברי בתקופת התלמוד. '.repeat(1600)}`,
  };
  const ranked = rankAutoContextCandidates({
    materials: [offTopic, onTopic],
    requestText: REQUEST,
  });
  check('1a. הקובץ הרלוונטי בכלל נכנס לדירוג', ranked.some((c) => c.id === 'material:mat-on'), JSON.stringify(ranked.map((c) => c.id)));
  check(
    '1b. קובץ קצר וממוקד מדורג מעל קובץ ענק ולא רלוונטי',
    ranked[0]?.id === 'material:mat-on',
    `ranked=${ranked.map((c) => `${c.id}:${c.score.toFixed(2)}`).join(', ')} (offTopic content=${offTopic.content.length} תווים)`,
  );
}

// ── 2. מסלול המטא-דאטה נשמר: כותרת תואמת בלי טקסט שמור עדיין מדורגת ─────────
{
  const ranked = rankAutoContextCandidates({
    materials: [
      { id: 'mat-title', title: 'הרפורמה המשפטית בישראל', label: 'כללי', content: '' },
      { id: 'mat-none', title: 'מתכונים לארוחת ערב', label: 'כללי', content: '' },
    ],
    requestText: REQUEST,
  });
  check('2. כותרת תואמת + תוכן ריק עדיין מדורגת', ranked.length === 1 && ranked[0].id === 'material:mat-title', JSON.stringify(ranked.map((c) => c.id)));
}

// ── 3. בקשה ריקה → אין בחירה אוטומטית ───────────────────────────────────────
{
  const ranked = rankAutoContextCandidates({
    materials: [{ id: 'mat-any', title: 'הרפורמה המשפטית', content: REQUEST }],
    history: [{ id: 'doc-any', title: 'הרפורמה המשפטית', savedAt: '2026-01-01T00:00:00Z' }],
    requestText: '   ',
  });
  check('3. requestText ריק מחזיר רשימה ריקה', Array.isArray(ranked) && ranked.length === 0, JSON.stringify(ranked));
}

// ── 4. limit נשמר ───────────────────────────────────────────────────────────
{
  const materials = Array.from({ length: 5 }, (_, i) => ({
    id: `mat-${i}`,
    title: `הרפורמה המשפטית ${i}`,
    content: REQUEST,
  }));
  const two = rankAutoContextCandidates({ materials, requestText: REQUEST, limit: 2 });
  const dflt = rankAutoContextCandidates({ materials, requestText: REQUEST });
  check('4a. limit=2 מחזיר שני מועמדים', two.length === 2, `got ${two.length}`);
  check('4b. ברירת המחדל היא 3', dflt.length === 3, `got ${dflt.length}`);
}

// ── 5. שובר-שוויון בהיסטוריה: המסמך החדש יותר ראשון ─────────────────────────
{
  const ranked = rankAutoContextCandidates({
    history: [
      { id: 'doc-old', title: 'הרפורמה המשפטית', summary: 'עצמאות מערכת המשפט', savedAt: '2025-01-01T00:00:00Z' },
      { id: 'doc-new', title: 'הרפורמה המשפטית', summary: 'עצמאות מערכת המשפט', savedAt: '2026-05-05T00:00:00Z' },
    ],
    requestText: REQUEST,
  });
  const sameScore = ranked.length === 2 && ranked[0].score === ranked[1].score;
  check('5. שוויון ניקוד בהיסטוריה נשבר לפי savedAt (חדש קודם)',
    sameScore && ranked[0].id === 'history:doc-new',
    `ranked=${ranked.map((c) => `${c.id}:${c.score}`).join(', ')}`);
}

check('רשת: אפס קריאות', netCalls === 0, `netCalls=${netCalls}`);

console.log(`\nmaterials-context-unit: ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
