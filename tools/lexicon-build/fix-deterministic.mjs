// ============================================================================
// tools/lexicon-build/fix-deterministic.mjs
//
// תיקונים שלא צריכים מודל: נטיית נקבה סדירה בעברית היא חוק, לא ניחוש.
//   1. שם תואר נקבה: "רגישה"→ריבוי "רגישות" (ה→ות), "נפשית"→"נפשיות" (ת→ות).
//      (סבב ה-repair ביקש בטעות ריבוי זכר לכל התארים — כאן מוחל החוק הנכון.)
//   2. שם עצם נקבה בסיומת ה': נסמך = ה→ת ("הרעלה"→"הרעלת") — דורס גם typos
//      של המתייג ("העלת").
//   3. שם עצם נקבה בסיומת ה' בלי ריבוי שמור: ריבוי = ה→ות.
// רץ מיידית, אפס קריאות API.  node tools/lexicon-build/fix-deterministic.mjs
// ============================================================================
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(DIR, '..', '..');
const CHECKPOINT_PATH = path.join(DIR, 'checkpoint.json');
const RAW_JSON_PATH = path.join(DIR, 'lexicon-tagged.json');
const OUTPUT_MODULE_PATH = path.join(PROJECT, 'src', 'services', 'hebrewLexicon.data.js');

const trimTail = (arr) => { while (arr.length && (arr[arr.length - 1] === null || arr[arr.length - 1] === undefined)) arr.pop(); };
const pad8 = (arr) => { while (arr.length < 8) arr.push(null); };

async function main() {
  const checkpoint = JSON.parse(await readFile(CHECKPOINT_PATH, 'utf8'));
  const lexicon = checkpoint.lexicon;
  let femAdjPl = 0, femNounCs = 0, femNounPl = 0;

  for (const [lemma, arr] of Object.entries(lexicon)) {
    const [pos, g, n] = arr;
    if (n === 'p') continue;   // צורת בסיס ברבים — לא נוגעים

    if (pos === 'a' && g === 'f') {
      let pl = null;
      if (lemma.endsWith('ה')) pl = lemma.slice(0, -1) + 'ות';        // רגישה→רגישות
      else if (lemma.endsWith('ת')) pl = lemma.slice(0, -1) + 'ות';   // נפשית→נפשיות
      if (pl && arr[6] !== pl) { pad8(arr); arr[6] = pl; trimTail(arr); femAdjPl += 1; }
    }

    if (pos === 'n' && g === 'f' && lemma.endsWith('ה')) {
      const cs = lemma.slice(0, -1) + 'ת';                             // הרעלה→הרעלת
      pad8(arr);
      if (arr[7] !== cs) { arr[7] = cs; femNounCs += 1; }
      if (!arr[6]) { arr[6] = lemma.slice(0, -1) + 'ות'; femNounPl += 1; }  // ריבוי חסר
      trimTail(arr);
    }
  }

  await writeFile(CHECKPOINT_PATH, JSON.stringify(checkpoint), 'utf8');
  await writeFile(RAW_JSON_PATH, JSON.stringify(lexicon, null, 1), 'utf8');
  const header = `// קובץ שנוצר אוטומטית ע"י tools/lexicon-build/build.mjs — לא לערוך ידנית.\n` +
    `// מבנה: lemma -> [pos, g, n, reg, root, binyan, plural, construct] (nulls בזנב נחתכו)\n` +
    `// pos: v/n/a/d/c/p/x · g: m/f/b · n: s/p · reg: 1-3 · binyan: 1-7 (פעל..התפעל)\n`;
  await writeFile(OUTPUT_MODULE_PATH,
    header + `export const HEBREW_LEXICON = ${JSON.stringify(lexicon)};\nexport const HEBREW_LEXICON_VERSION = 3;\n`, 'utf8');
  console.log(`fem-adj plurals fixed: ${femAdjPl} | fem-noun constructs normalized: ${femNounCs} | fem-noun plurals filled: ${femNounPl}`);
  console.log('outputs written (version 3).');
}

main().catch((e) => { console.error('fatal:', e); process.exit(1); });
