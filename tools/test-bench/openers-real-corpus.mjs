// openers-real-corpus.mjs — מריץ את מנוע הפתיחים על **הכתיבה האמיתית של רותם**.
//
// למה לא בדפדפן: ה-IndexedDB של הפרופיל הוא per-origin ולא מסתנכרן לענן, ולכן
// הדפדפן של הסוכן ריק גם אחרי התחברות. אבל העבודות הסופיות עצמן יושבות על
// הדיסק — וזה אותו קלט בדיוק שהמשתמש היה מעלה ב"הסגנון שלי".
//
// מה נבדק: האם הפתיחים שנכרים הם באמת בקול שלו, האם הם מכסים את הכוונות
// שהמטלות דורשות, וכמה טקסט צריך כדי שהמנוע יתעורר.
//
// הרצה: node tools/test-bench/run-openers-real-corpus.mjs

import { readFile, readdir } from 'node:fs/promises';
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

let netCalls = 0;
{ const real = globalThis.fetch; globalThis.fetch = async (...a) => { netCalls += 1; return real(...a); }; }

const samples = await import('stylesamples');
const openers = await import('openersvc');
const { INTENT_LABELS, parseAssignmentSpec } = await import('specsvc');
const lex = await import('hebrewlex');

const CORPUS = process.env.WORDAI_CORPUS_OUT
  || 'C:/Users/rotem/AppData/Local/Temp/claude/C--Users-rotem-Projects--wordai-new/5dfe23d5-acbf-4f96-9551-9997128f4b6f/scratchpad/real-corpus';

// טעינת העבודות הסופיות — בדיוק כמו העלאה ב"הסגנון שלי".
await samples.ensureSampleStoreReady();
const dir = path.join(CORPUS, 'finals');
const files = (await readdir(dir)).filter((f) => f.endsWith('.txt')).sort();

let loaded = 0;
const seen = new Set();
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

const stats = samples.getSampleStoreStats();
console.log(`═══ הקורפוס האישי ═══`);
console.log(`עבודות שנטענו: ${loaded} (מתוך ${files.length} קבצים)`);
console.log(`מילים: ${stats.totalWords} · קטעים: ${stats.chunkCount}`);

// מילון חיצוני אופציונלי: WORDAI_WORDLIST=<path>. הרשימה היא זוגות "מילה תדירות".
// סף התדירות מסנן ערכים נדירים שהם עצמם שמות או שגיאות כתיב.
const WORDLIST = process.env.WORDAI_WORDLIST || '';
const MIN_FREQ = Number(process.env.WORDAI_WORDLIST_MIN_FREQ || 50);
if (WORDLIST) {
  const rawList = await readFile(WORDLIST, 'utf8');
  const lines = rawList.split(/\r?\n/);
  const words = lines.map((l) => {
    const parts = l.trim().split(/\s+/);
    return parts[0] && Number(parts[1]) >= MIN_FREQ ? parts[0] : null;
  }).filter(Boolean);
  console.log(`\nמילון חיצוני: ${words.length} מילים (מתוך ${lines.length}, סף ${MIN_FREQ})`);
  lex.mergeExternalWordlist(words);
}

console.log(`
═══ המילון מהקורפוס ═══`);
console.log(JSON.stringify(lex.lexiconStats()));
// דגימה: האם המילון מבחין נכון בין שם פרטי למילת שפה?
['הייג','הדסה','האגודה','ניתן','לראות','תקשורת','משבר','עצומה','לסיכום']
  .forEach((w) => console.log(`   ${w.padEnd(10)} df=${String(lex.documentFrequency(w)).padStart(3)}  ${lex.isCommonWord(w) ? 'מילת שפה' : '← נדיר / שם'}`));

// ---- כריית הפתיחים ----
await openers.ensureOpenersReady();
const status = openers.getOpenerStatus();
console.log(`\n═══ מצב מנוע הפתיחים ═══`);
console.log(JSON.stringify(status, null, 1));

console.log(`\n═══ הפתיחים שנכרו, לפי כוונה ═══`);
const ALL_INTENTS = ['intro', 'review', 'method', 'findings', 'analysis', 'comparison', 'argument', 'conclusion', 'exposition'];
for (const intent of ALL_INTENTS) {
  const list = openers.getOpenersForIntent(intent, { limit: 4 }) || [];
  const label = (INTENT_LABELS[intent] || intent).padEnd(8);
  if (!list.length) { console.log(`\n${label} —  (אין)`); continue; }
  console.log(`\n${label} (${list.length}):`);
  list.forEach((o) => console.log(`   › ${typeof o === 'string' ? o : JSON.stringify(o)}`));
}

// ---- ההצלבה שבאמת מעניינת: הכוונות שהמטלות דורשות ----
console.log(`\n═══ כיסוי מול מטלה אמיתית ═══`);
const instrDir = path.join(CORPUS, 'instructions');
const instrFiles = (await readdir(instrDir)).filter((f) => f.endsWith('.txt')).sort();
const wanted = new Map();
const seenBrief = new Set();
for (const f of instrFiles) {
  const raw = await readFile(path.join(instrDir, f), 'utf8');
  const body = raw.split('\n').slice(2).join('\n');
  const fp = body.replace(/\s+/g, '');
  if (seenBrief.has(fp)) continue;
  seenBrief.add(fp);
  parseAssignmentSpec(body).sections.forEach((s) => {
    wanted.set(s.intent, (wanted.get(s.intent) || 0) + 1);
  });
}
const rows = [...wanted.entries()].sort((a, b) => b[1] - a[1]);
console.log('כוונה     סעיפים במטלות   פתיחים זמינים');
rows.forEach(([intent, count]) => {
  const have = (openers.getOpenersForIntent(intent, { limit: 99 }) || []).length;
  const flag = have === 0 ? '  ✗ אין כיסוי' : '';
  console.log(`${(INTENT_LABELS[intent] || intent).padEnd(10)} ${String(count).padStart(6)}        ${String(have).padStart(6)}${flag}`);
});

console.log(`\nקריאות רשת: ${netCalls} ${netCalls === 0 ? '✓ הכול מקומי' : ''}`);
