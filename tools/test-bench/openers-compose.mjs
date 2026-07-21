// openers-compose.mjs — בדיקת מנוע ההרכבה: 5 וריאנטים × 9 אינטנטים, אפס רשת.
//
// מה נבדק:
//   1. אף אינטנט לא חוזר ריק (cold-start פתור).
//   2. התאם: פועל fin שנבחר תואם g/n לנושא (נבדק דרך ה-slots שהמנוע מחזיר).
//   3. ייחודיות: אין שני וריאנטים זהים בתוך אינטנט.
//   4. דטרמיניזם: אותו seedKey → אותו פלט.
//
// הרצה: node tools/test-bench/run-openers-compose.mjs

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
globalThis.addEventListener = globalThis.addEventListener || (() => {});

const openers = await import('openersvc');
const grammarModule = await import('../../src/services/openerGrammar.data.js');
const { INTENT_LABELS } = await import('specsvc');

await openers.ensureGrammarReady();
const GRAMMAR = grammarModule.OPENER_GRAMMAR;
const INTENTS = Object.keys(GRAMMAR.intents);

// אינדקס תכונות לכל מילה — לבדיקת ההתאם על הפלט.
const feat = new Map();
INTENTS.forEach((it) => {
  const s = GRAMMAR.intents[it].slots;
  (s.subjectNP || []).forEach((e) => feat.set(`np|${e.w}`, e));
  (s.framingVerb?.fin || []).forEach((e) => feat.set(`fin|${it}|${e.w}`, e));
});
const match = (a = 'x', b = 'x') => a === 'x' || b === 'x' || a === b;

let fail = 0;
const say = (ok, msg) => { if (!ok) { fail += 1; console.error(`  ✗ ${msg}`); } };

console.log('אינטנט            | וריאנטים | דוגמה');
console.log('------------------|----------|------------------------------------------');
for (const intent of INTENTS) {
  const list = openers.composeOpeners(intent, { count: 5, seedKey: 'lab-A' });
  say(list.length >= 3, `${intent}: רק ${list.length} וריאנטים (<3)`);

  const texts = new Set(list.map((o) => o.text));
  say(texts.size === list.length, `${intent}: וריאנטים כפולים`);

  list.forEach((o) => {
    // התאם fin↔subjectNP: אם שניהם קיימים בסלוטים, התכונות חייבות להתלכד.
    const np = o.slots.subjectNP && feat.get(`np|${o.slots.subjectNP}`);
    const fin = o.slots.subjectNP && o.slots.framingVerb && feat.get(`fin|${intent}|${o.slots.framingVerb}`);
    if (np && fin) {
      say(match(fin.g, np.g) && match(fin.n, np.n),
        `${intent}: הפרת התאם — "${o.slots.subjectNP}" + "${o.slots.framingVerb}"`);
    }
    say(o.text.endsWith('…'), `${intent}: בלי שלוש נקודות — "${o.text}"`);
  });

  const label = (INTENT_LABELS[intent] || intent).padEnd(14);
  console.log(`${label} | ${String(list.length).padStart(8)} | ${list[0]?.text || '—'}`);
}

// דטרמיניזם: אותו seed → זהה; seed אחר → (כמעט תמיד) שונה.
const a1 = openers.composeOpeners('intro', { count: 3, seedKey: 'x1' }).map((o) => o.text).join('|');
const a2 = openers.composeOpeners('intro', { count: 3, seedKey: 'x1' }).map((o) => o.text).join('|');
const b1 = openers.composeOpeners('intro', { count: 3, seedKey: 'x2' }).map((o) => o.text).join('|');
say(a1 === a2, 'דטרמיניזם נשבר: אותו seed נתן פלט שונה');
say(a1 !== b1, 'seed שונה נתן פלט זהה (חשוד)');

// cold-start דרך ה-API הציבורי: קורפוס ריק → עדיין מקבלים פתיחים, מסומנים general.
const cold = openers.getOpenersForIntent('review', { limit: 3, seedKey: 'cold' });
say(cold.length === 3, `cold-start: ${cold.length} במקום 3`);
say(cold.every((o) => o.general && o.composed), 'cold-start: חסר סימון general/composed');

// פלט JSON לשופט (judge-composed-openers): WORDAI_COMPOSE_EMIT_JSON=<path>
if (process.env.WORDAI_COMPOSE_EMIT_JSON) {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const pathMod = await import('node:path');
  const per = Number(process.env.WORDAI_COMPOSE_PER_INTENT || 5);
  const all = INTENTS.flatMap((intent) => openers.composeOpeners(intent, { count: per, seedKey: 'judge' }));
  await mkdir(pathMod.dirname(process.env.WORDAI_COMPOSE_EMIT_JSON), { recursive: true });
  await writeFile(process.env.WORDAI_COMPOSE_EMIT_JSON, JSON.stringify(all, null, 1), 'utf8');
  console.log(`emit: ${all.length} פתיחים -> ${process.env.WORDAI_COMPOSE_EMIT_JSON}`);
}

console.log(fail ? `\n${fail} בדיקות נכשלו` : '\nהכול ירוק ✓');
process.exit(fail ? 1 : 0);
