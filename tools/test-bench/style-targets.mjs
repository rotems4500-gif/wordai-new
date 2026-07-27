// style-targets.mjs — מדפיס את פרופיל היעדים המבניים שנגזר מהעבודות של המשתמש,
// ואת הפער בין הפלט לבין כל יעד.
//
//   node tools/test-bench/style-targets.mjs [קובץ-פלט.txt]
//
// למה כלי נפרד מ-style-diff: style-diff מודד את **המדד** (שש התכונות, כולל אלה
// שפסולות כיעד — ר' ההערה בראש styleTargetsService). כאן מודדים בדיוק את מה
// שהמנוע אמור לאכוף, ועל אותו בסיס שהוא אוכף אותו (פסקאות פרוזה בלבד).
//
// אין bundling: styleTargetsService יושב מעל styleFingerprintService בלבד.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import mammoth from 'mammoth';
import { tokenizeForStyle, MIN_DOC_WORDS } from '../../src/services/styleFingerprintService.js';
import {
  deriveStyleTargets, measureStyleTargets, describeStyleTargets,
  STYLE_TARGET_KEYS, STYLE_TARGET_LABELS,
} from '../../src/services/styleTargetsService.js';
import { COMMA_SLOT_DEFS, enabledCommaSlots } from '../../src/services/styleFitService.js';

const CORPUS_DIR = process.env.WORDAI_SCAFFOLD_CORPUS
  || path.join(os.homedir(), 'OneDrive', 'שולחן העבודה', '314999533');
const SELF_DIR = path.join(CORPUS_DIR, 'עבודות והגשות', 'עבודות סופיות');
const OUT_FILE = process.argv[2] || process.env.WORDAI_STYLE_SCORE_FILE || null;

const hebrewRatio = (s) => {
  const letters = String(s || '').match(/[א-תA-Za-z]/g) || [];
  if (!letters.length) return 0;
  return letters.filter((c) => /[א-ת]/.test(c)).length / letters.length;
};

function walk(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.docx$/i.test(e.name) && !e.name.startsWith('~$')) out.push(full);
  }
  return out;
}

const docs = [];
const seen = new Set();
for (const p of walk(SELF_DIR)) {
  let text = '';
  try { text = (await mammoth.extractRawText({ buffer: fs.readFileSync(p) })).value || ''; } catch { continue; }
  if (tokenizeForStyle(text).length < MIN_DOC_WORDS) continue;
  if (hebrewRatio(text) < 0.6) continue;
  const fp = text.replace(/\s+/g, ' ').trim().slice(0, 400);
  if (seen.has(fp)) continue;
  seen.add(fp);
  docs.push({ name: path.basename(p), text });
}

const targets = deriveStyleTargets(docs);
if (!targets) {
  console.log(`✗ רק ${docs.length} עבודות כשירות — מתחת לסף. המנוע היה נשאר בברירת המחדל.`);
  process.exit(1);
}

console.log(`\n${describeStyleTargets(targets)}`);
console.log(`מילות פרוזה בקורפוס: ${targets.wordCount.toLocaleString('he-IL')}\n`);

const gen = OUT_FILE && fs.existsSync(OUT_FILE) ? measureStyleTargets(fs.readFileSync(OUT_FILE, 'utf8')) : null;

console.log('תכונה'.padEnd(30), 'יעד'.padStart(8), 'פיזור'.padStart(8), gen ? 'הפלט'.padStart(8) : '', gen ? 'פער'.padStart(9) : '');
console.log('─'.repeat(gen ? 68 : 50));
for (const k of STYLE_TARGET_KEYS) {
  const t = targets[k];
  const sp = targets.spread[k] ?? 0;
  const row = [
    STYLE_TARGET_LABELS[k].padEnd(30),
    t.toFixed(3).padStart(8),
    `±${sp.toFixed(3)}`.padStart(8),
  ];
  if (gen) {
    const d = gen[k] - t;
    // "בתוך הפיזור" = המשתמש עצמו נע בטווח הזה בין עבודה לעבודה. אין מה לרדוף.
    const mark = Math.abs(d) <= Math.max(sp, 1e-9) ? '✓' : '←';
    row.push(gen[k].toFixed(3).padStart(8), `${d >= 0 ? '+' : ''}${d.toFixed(3)}`.padStart(8), mark);
  }
  console.log(row.join(' '));
}
if (!gen && OUT_FILE) console.log(`\n⚠️ אין קובץ פלט: ${OUT_FILE}`);

// משמורות הפסיק — החלק הנלמד של הפרופיל. ✓ = נאכפת על הפלט.
console.log('\n─── משמורות פסיק ───');
const on = new Set(enabledCommaSlots(targets).map((s) => s.def.id));
for (const d of COMMA_SLOT_DEFS) {
  const r = targets.commaSlots?.[d.id] || { rate: 0, total: 0 };
  const why = on.has(d.id) ? ''
    : !d.applies ? '   [נמדדת בלבד — דורשת פסיק סוגר / אינה ניתנת לזיהוי]'
      : r.total < 4 ? '   [מעט מדי מופעים]'
        : '   [המשתמש אינו מפסק שם]';
  console.log(` ${on.has(d.id) ? '✓' : '·'} ${d.label.padEnd(30)} ${(r.rate * 100).toFixed(0).padStart(3)}% מתוך ${String(r.total).padStart(4)} מופעים${why}`);
}
console.log();
