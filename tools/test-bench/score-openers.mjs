// score-openers.mjs — מחשב precision/recall מתוך opener-labels.json של המתייג.
//
// למה: בלי המספר הזה כל שינוי במבחין הוא ניחוש. הקובץ הזה הופך את התיוג הידני
// ל-baseline שנשמר ב-lab-results, וששער הרגרסיה (openers-gate) מודד מולו.
//
// הרצה: node tools/test-bench/score-openers.mjs <path-to-opener-labels.json>
//        (ברירת מחדל: ~/Downloads/opener-labels.json)

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const LABELS = process.argv[2] || path.join(os.homedir(), 'Downloads', 'opener-labels.json');
const OUT_DIR = path.join(DIR, 'lab-results');

const rows = JSON.parse(await readFile(LABELS, 'utf8'));
const labeled = rows.filter((r) => r.label === 'כ' || r.label === 'ל');
const skipped = rows.length - labeled.length;

// precision: מתוך מה שהמנוע שמר — כמה באמת "ניסוח שלי".
// recall:    מתוך כל מה שתויג "ניסוח שלי" — כמה המנוע שמר.
const kept = labeled.filter((r) => r.currentVerdict === 'נשמר');
const goodKept = kept.filter((r) => r.label === 'כ').length;
const goodRejected = labeled.filter((r) => r.currentVerdict === 'נפסל' && r.label === 'כ');

const precision = kept.length ? goodKept / kept.length : 0;
const recall = (goodKept + goodRejected.length) ? goodKept / (goodKept + goodRejected.length) : 0;

// אילו מסננים אוכלים פתיחים טובים — זה מה שמכוונים אחר כך.
const byReason = {};
labeled.filter((r) => r.currentVerdict === 'נפסל').forEach((r) => {
  const k = r.reason || '(ללא סיבה)';
  byReason[k] = byReason[k] || { total: 0, goodLost: 0 };
  byReason[k].total += 1;
  if (r.label === 'כ') byReason[k].goodLost += 1;
});

const result = {
  date: new Date().toISOString().slice(0, 10),
  labelsFile: LABELS,
  counts: { rows: rows.length, labeled: labeled.length, skipped, kept: kept.length, goodKept, goodRejected: goodRejected.length },
  precision: Number(precision.toFixed(3)),
  recall: Number(recall.toFixed(3)),
  byReason,
};

await mkdir(OUT_DIR, { recursive: true });
const outPath = path.join(OUT_DIR, 'openers-baseline.json');
await writeFile(outPath, JSON.stringify(result, null, 2), 'utf8');

console.log(`שורות: ${rows.length} · תויגו: ${labeled.length} · דולגו: ${skipped}`);
console.log(`precision: ${(precision * 100).toFixed(1)}%  (${goodKept}/${kept.length} מהנשמרים טובים)`);
console.log(`recall:    ${(recall * 100).toFixed(1)}%  (${goodRejected.length} טובים נפסלו)`);
console.log('\nאבדות לפי סיבת פסילה:');
Object.entries(byReason).sort((a, b) => b[1].goodLost - a[1].goodLost)
  .forEach(([k, v]) => console.log(`   ${k.padEnd(14)} ${v.goodLost}/${v.total} טובים אבדו`));
if (goodRejected.length) {
  console.log('\nהפתיחים הטובים שנפסלו:');
  goodRejected.forEach((r) => console.log(`   [${r.reason}] ${r.opener}`));
}
console.log(`\n-> ${outPath}`);
