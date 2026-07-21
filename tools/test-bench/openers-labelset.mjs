// openers-labelset.mjs — מוציא את כל מועמדי הפתיח מהעבודות האמיתיות לקובץ תיוג.
//
// למה: כל הכיוונון עד כה נשפט בעין. "10→4 זו התוצאה הנכונה" הייתה דעה, לא
// מדידה. בלי סט מתויג אין דרך לדעת אם שינוי שיפר או הרע, ואין דרך לדעת אם
// המבחין מכליל מעבר לקורפוס שעליו כוונן.
//
// הקובץ כולל גם את **הנפסלים**. בלעדיהם מודדים דיוק בלבד (כמה מהנשמרים טובים)
// ולא החזר (כמה טובים נזרקו) — וזה הצד שבו המנוע כנראה חלש יותר.
//
// הרצה: node tools/test-bench/run-openers-labelset.mjs

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

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
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  addEventListener() {}, removeEventListener() {},
  querySelector: () => null, querySelectorAll: () => [],
  body: { appendChild() {}, removeChild() {} }, documentElement: { style: {} },
};
globalThis.addEventListener = globalThis.addEventListener || (() => {});
globalThis.removeEventListener = globalThis.removeEventListener || (() => {});
globalThis.dispatchEvent = globalThis.dispatchEvent || (() => true);
if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent { constructor(t, o = {}) { this.type = t; this.detail = o.detail; } };
}

const samples = await import('stylesamples');
const openers = await import('openersvc');
const { INTENT_LABELS } = await import('specsvc');
const lex = await import('hebrewlex');

const CORPUS = process.env.WORDAI_CORPUS_OUT
  || 'C:/Users/rotem/AppData/Local/Temp/claude/C--Users-rotem-Projects--wordai-new/5dfe23d5-acbf-4f96-9551-9997128f4b6f/scratchpad/real-corpus';
const OUT_DIR = process.env.WORDAI_LABELSET_OUT
  || 'C:/Users/rotem/AppData/Local/Temp/claude/C--Users-rotem-Projects--wordai-new/5dfe23d5-acbf-4f96-9551-9997128f4b6f/scratchpad/labelset';

// מילון חיצוני אופציונלי (ראה hebrewLexiconService.mergeExternalWordlist).
const WORDLIST = process.env.WORDAI_WORDLIST || '';
if (WORDLIST) {
  const raw = await readFile(WORDLIST, 'utf8');
  const words = raw.split(/\r?\n/).map((l) => l.trim().split(/\s+/)[0]).filter(Boolean);
  lex.mergeExternalWordlist(words);
  console.log(`מילון חיצוני: ${words.length} מילים`);
}

// טעינת העבודות — אותו קלט בדיוק שהמשתמש היה מעלה ב"הסגנון שלי".
await samples.ensureSampleStoreReady();
const dir = path.join(CORPUS, 'finals');
const files = (await readdir(dir)).filter((f) => f.endsWith('.txt')).sort();
const seen = new Set();
let loaded = 0;
for (const f of files) {
  const raw = await readFile(path.join(dir, f), 'utf8');
  const title = raw.split('\n', 1)[0].replace(/^#\s*/, '');
  const body = raw.split('\n').slice(2).join('\n').trim();
  const fp = body.replace(/\s+/g, '').slice(0, 400);
  if (!body || seen.has(fp)) continue;   // אותה עבודה בכמה גרסאות
  seen.add(fp);
  samples.addDocumentSamples({ title, text: body, source: 'real-finals' });
  loaded += 1;
}
await openers.ensureOpenersReady();

const rows = openers.collectOpenerCandidates();
console.log(`עבודות: ${loaded} · מועמדים: ${rows.length}`);

// פירוק לפי החלטה — זה מה שהתיוג אמור לאתגר.
const byReject = new Map();
rows.forEach((r) => {
  const k = r.reject || '(נשמר)';
  byReject.set(k, (byReject.get(k) || 0) + 1);
});
console.log('\nההחלטה הנוכחית:');
[...byReject.entries()].sort((a, b) => b[1] - a[1])
  .forEach(([k, n]) => console.log(`   ${String(k).padEnd(14)} ${String(n).padStart(4)}`));

// ---- קובץ התיוג ----
// דה-דופליקציה לפי הטקסט שמוצג: אותו פתיח מכמה פסקאות = שורה אחת לתייג.
const uniq = new Map();
rows.forEach((r) => {
  const shown = r.opener || r.rawCandidate;
  const key = shown.toLowerCase();
  if (!uniq.has(key)) uniq.set(key, { ...r, shown, seenIn: new Set() });
  uniq.get(key).seenIn.add(r.docId);
});

// דגימה מאוזנת: כל הנשמרים, ומדגם מייצג מכל סיבת פסילה. בלי איזון, "לא-חוזר"
// מציף את הקובץ ורותם יתייג 300 שורות של אותה סיבה.
const PER_REJECT = Number(process.env.WORDAI_PER_REJECT || 25);
const kept = [], rejected = new Map();
[...uniq.values()].forEach((r) => {
  if (!r.reject) { kept.push(r); return; }
  if (!rejected.has(r.reject)) rejected.set(r.reject, []);
  rejected.get(r.reject).push(r);
});
const sample = [...kept];
rejected.forEach((list) => {
  // דגימה בפריסה קבועה (ולא אקראית) — הרצה חוזרת נותנת אותו קובץ.
  const step = Math.max(1, Math.floor(list.length / PER_REJECT));
  for (let i = 0; i < list.length && sample.length - kept.length < PER_REJECT * rejected.size; i += step) {
    sample.push(list[i]);
  }
});

const esc = (s) => `"${String(s ?? '').replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`;
const header = ['תיוג', 'הפתיח', 'החלטה נוכחית', 'סיבה', 'כוונה', 'מסמכים', 'לפני הגזירה', 'הפסקה', 'מקור'];
const lines = [header.map(esc).join(',')];
sample.forEach((r) => {
  lines.push([
    '',                                     // ← עמודת התיוג, ריקה
    r.shown,
    r.reject ? 'נפסל' : 'נשמר',
    r.reject || '',
    r.intent ? (INTENT_LABELS[r.intent] || r.intent) : '',
    r.docs || r.seenIn.size,
    r.rawCandidate === r.shown ? '' : r.rawCandidate,
    r.paragraph,
    [...r.seenIn][0] || '',
  ].map(esc).join(','));
});

await mkdir(OUT_DIR, { recursive: true });
const csvPath = path.join(OUT_DIR, 'openers-to-label.csv');
// BOM — בלעדיו Excel קורא עברית UTF-8 כג'יבריש.
await writeFile(csvPath, `﻿${lines.join('\r\n')}`, 'utf8');

// גיבוי JSON: הצינור הבא קורא את זה, לא את ה-CSV.
await writeFile(path.join(OUT_DIR, 'openers-candidates.json'),
  JSON.stringify(rows, null, 1), 'utf8');

console.log(`\nלתיוג: ${sample.length} שורות (${kept.length} נשמרו · ${sample.length - kept.length} נפסלו)`);
console.log(`\n  ${csvPath}`);
console.log(`  ${path.join(OUT_DIR, 'openers-candidates.json')}  (מלא, ${rows.length} שורות)`);
console.log(`
מלא את עמודה A בלבד:
   כ  = כן, זה ניסוח שלי ואפשר לפתוח בו כל סעיף
   ל  = לא, זה תוכן / שם / שבר משפט
   ?  = לא בטוח — ידולג במדידה
`);
