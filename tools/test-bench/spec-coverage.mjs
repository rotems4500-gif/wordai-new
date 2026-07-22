// spec-coverage.mjs — כמה מהמטלות האמיתיות הפרסר באמת מפרק, וכמה נופלות לתבנית.
//
// למה: "לא זוהו סעיפים" מפיל את המשתמש לתבנית קבועה (מבוא/רקע/דיון/סיכום) שאין
// לה שום קשר למטלה שלו. בלי למדוד על כמה מטלות זה קורה, כל תיקון לפרסר הוא ניחוש.
//
// הרצה: node tools/test-bench/run-spec-coverage.mjs

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
globalThis.addEventListener = globalThis.addEventListener || (() => {});

const { parseAssignmentSpec, INTENT_LABELS, defaultSectionTemplate } = await import('specsvc');

const CORPUS = process.env.WORDAI_CORPUS_OUT
  || 'C:/Users/rotem/AppData/Local/Temp/claude/C--Users-rotem-Projects--wordai-new/5dfe23d5-acbf-4f96-9551-9997128f4b6f/scratchpad/real-corpus';
const DIR = path.join(CORPUS, 'instructions');

const files = (await readdir(DIR)).filter((f) => f.endsWith('.txt')).sort();
const rows = [];
for (const f of files) {
  const raw = await readFile(path.join(DIR, f), 'utf8');
  const name = raw.split('\n', 1)[0].replace(/^#\s*/, '');
  const body = raw.split('\n').slice(2).join('\n');
  if (!body.trim()) continue;
  const spec = parseAssignmentSpec(body);
  rows.push({
    file: f,
    name: name.slice(0, 46),
    sections: spec.sections.length,
    intents: [...new Set(spec.sections.map((s) => s.intent))],
    words: spec.totalWords,
    conf: spec.confidence,
    chars: body.trim().length,
  });
}

const empty = rows.filter((r) => !r.sections);
const single = rows.filter((r) => r.sections === 1);

console.log('קובץ    סעיפים  היקף   ודאות  מטלה');
console.log('─'.repeat(78));
rows.forEach((r) => {
  const mark = r.sections === 0 ? '  ← תבנית!' : r.sections === 1 ? '  ← יחיד' : '';
  console.log(`${r.file}  ${String(r.sections).padStart(4)}  ${String(r.words ?? '—').padStart(6)}  ${r.conf.toFixed(2)}   ${r.name}${mark}`);
});

console.log(`\n${'═'.repeat(78)}`);
console.log(`מטלות: ${rows.length}`);
console.log(`נופלות לתבנית הקבועה (0 סעיפים): ${empty.length}  (${(empty.length / rows.length * 100).toFixed(0)}%)`);
console.log(`סעיף יחיד (חשוד): ${single.length}`);
console.log(`ממוצע סעיפים כשזוהו: ${(rows.filter((r) => r.sections).reduce((a, r) => a + r.sections, 0) / Math.max(1, rows.length - empty.length)).toFixed(1)}`);

// מה התבנית מייצרת לכל אחת מהנופלות — הבדיקה שהיא באמת נגזרת מהטקסט ולא קבועה.
if (empty.length) {
  console.log('\nהשלד שנבנה למטלות שלא פורקו (חייב להשתנות ביניהן):');
  for (const r of empty) {
    const raw = await readFile(path.join(DIR, r.file), 'utf8');
    const body = raw.split('\n').slice(2).join('\n').trim();
    const tpl = defaultSectionTemplate(r.words || 1500, body);
    const spec = parseAssignmentSpec(body);
    const flagged = spec.warnings.some((w) => w.includes('לא נראה כמו הנחיות מטלה'));
    console.log(`\n┌─ ${r.file} · ${r.name}${flagged ? '   ⚠ סומן: לא מטלה' : ''}`);
    tpl.forEach((s) => console.log(`│  ${s.title} (${s.wordQuota}) [${INTENT_LABELS[s.intent]}]`));
  }
}

// גם כמה מטלות שכן פורקו — כדי לראות שהתבנית הייתה משתנה גם עבורן.
console.log('\nביקורת: התבנית שהייתה נבנית למטלות שכן פורקו (מדגם):');
for (const r of rows.filter((x) => x.sections).slice(0, 4)) {
  const raw = await readFile(path.join(DIR, r.file), 'utf8');
  const body = raw.split('\n').slice(2).join('\n').trim();
  const tpl = defaultSectionTemplate(r.words || 1500, body);
  console.log(`  ${r.file}: ${tpl.map((s) => s.title).join(' · ')}`);
}
