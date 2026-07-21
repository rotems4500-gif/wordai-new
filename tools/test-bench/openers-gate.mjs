// openers-gate.mjs — שער הרגרסיה של מנוע הפתיחים. אדום → לא ממזגים.
//
// שלושה תנאים:
//   1. דקדוקיות פתיחים מורכבים ≥95% (מהשיפוט האחרון: openers-judge-*.json)
//   2. התאמת אינטנט ≥85% (שם)
//   3. precision של המסלול הממוקש לא ירד מתחת ל-baseline (openers-baseline.json)
//      — תנאי 3 מדולג עם אזהרה כל עוד אין baseline (התיוג הידני טרם הסתיים).
//
// הרצה: node tools/test-bench/openers-gate.mjs
//   רענון מדידות לפני: run-openers-compose + judge-composed-openers + score-openers

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.join(DIR, 'lab-results');

const GRAMMAR_FLOOR = 0.95;
const FIT_FLOOR = 0.85;

let fail = 0;
const gate = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) fail += 1;
};

// 1+2: השיפוט האחרון
let judge = null;
try {
  const files = (await readdir(RESULTS)).filter((f) => f.startsWith('openers-judge-')).sort();
  if (files.length) judge = JSON.parse(await readFile(path.join(RESULTS, files.at(-1)), 'utf8'));
} catch {}
if (judge) {
  gate(judge.grammaticalRate >= GRAMMAR_FLOOR,
    `דקדוקיות ${(judge.grammaticalRate * 100).toFixed(1)}% (סף ${GRAMMAR_FLOOR * 100}%) · ${judge.judged} פתיחים`);
  gate(judge.intentFitRate >= FIT_FLOOR,
    `התאמת אינטנט ${(judge.intentFitRate * 100).toFixed(1)}% (סף ${FIT_FLOOR * 100}%)`);
} else {
  gate(false, 'אין openers-judge-*.json — הרץ judge-composed-openers.mjs');
}

// 3: baseline הכרייה
try {
  const baseline = JSON.parse(await readFile(path.join(RESULTS, 'openers-baseline.json'), 'utf8'));
  // ה-baseline נמדד פעם אחת על התיוג הידני; ההשוואה השוטפת היא הרצה מחודשת של
  // score-openers על labels קיימים אחרי שינוי במבחין (openers-current.json אם קיים).
  let current = baseline;
  try {
    current = JSON.parse(await readFile(path.join(RESULTS, 'openers-current.json'), 'utf8'));
  } catch {}
  gate(current.precision >= baseline.precision,
    `precision ממוקש ${current.precision} מול baseline ${baseline.precision}`);
} catch {
  console.log('⚠ אין openers-baseline.json — תנאי ה-precision מדולג עד שהתיוג הידני יסתיים');
}

console.log(fail ? `\nשער אדום (${fail})` : '\nשער ירוק');
process.exit(fail ? 1 : 0);
