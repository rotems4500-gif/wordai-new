// style-diff.mjs — *מה* בדיוק מרחיק את הפלט מהכתיבה של המשתמש?
//
//   node tools/test-bench/style-diff.mjs <קובץ-פלט.txt>
//
// style-eval נותן ציון. הוא לא אומר מה לתקן. כאן מוחזקת בצד עבודה אחת של
// המשתמש (leave-one-out), נבנה פרופיל מכל השאר, ומודדים את **אותן תכונות**
// לשני הטקסטים: העבודה שלו והפלט. פער בתכונה שבה הוא קרוב לפרופיל והפלט רחוק
// = הרגל כתיבה שאפשר לחקות. פער בשניהם = תוכן המקרה, לא סגנון.
//
// אין bundling: styleFingerprintService הוא LEAF בלי import.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import mammoth from 'mammoth';
import {
  buildAuthorProfile, burrowsDelta, tokenizeForStyle, MIN_DOC_WORDS,
  structuralFeatures, stripNonAuthorial, STRUCTURAL_KEYS, STRUCTURAL_LABELS,
} from '../../src/services/styleFingerprintService.js';

const CORPUS_DIR = process.env.WORDAI_SCAFFOLD_CORPUS
  || path.join(os.homedir(), 'OneDrive', 'שולחן העבודה', '314999533');
const SELF_DIR = path.join(CORPUS_DIR, 'עבודות והגשות', 'עבודות סופיות');
const OUT_FILE = process.argv[2] || process.env.WORDAI_STYLE_SCORE_FILE;

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
  try { text = (await mammoth.extractRawText({ buffer: fs.readFileSync(p) })).value || ''; } catch {}
  if (tokenizeForStyle(text).length < MIN_DOC_WORDS) continue;
  if (hebrewRatio(text) < 0.6) continue;
  const fp = text.replace(/\s+/g, ' ').trim().slice(0, 400);
  if (seen.has(fp)) continue;
  seen.add(fp);
  docs.push({ name: path.basename(p), text });
}
if (docs.length < 3) { console.log(`✗ רק ${docs.length} עבודות — מעט מדי`); process.exit(1); }
if (!OUT_FILE || !fs.existsSync(OUT_FILE)) { console.log(`✗ אין קובץ פלט: ${OUT_FILE}`); process.exit(1); }
const generated = fs.readFileSync(OUT_FILE, 'utf8');

// העבודה המוחזקת בצד: זו שהכי דומה בנושא לפלט (חפיפת מילות-תוכן), כדי שההשוואה
// תהיה על סגנון ולא על נושא.
const genWords = new Set(tokenizeForStyle(generated));
let held = docs[0]; let bestOverlap = -1;
for (const d of docs) {
  const ws = new Set(tokenizeForStyle(d.text));
  let shared = 0;
  for (const w of ws) if (genWords.has(w)) shared += 1;
  const ov = shared / Math.max(ws.size, 1);
  if (ov > bestOverlap) { bestOverlap = ov; held = d; }
}
const rest = docs.filter((d) => d !== held).map((d) => d.text);
const profile = buildAuthorProfile(rest, { referenceDocs: [generated] });

console.log(`עבודות: ${docs.length} · מוחזקת בצד: ${held.name} (חפיפת נושא ${(bestOverlap * 100).toFixed(0)}%)`);

const rHeld = burrowsDelta(held.text, profile);
const rGen = burrowsDelta(generated, profile);
console.log(`\nמרחק — העבודה שלו: ${rHeld.cosineDelta.toFixed(3)} · הפלט: ${rGen.cosineDelta.toFixed(3)}`);

// ---------- תכונות מבניות: הרגלים שאפשר לחקות ----------
const sHeld = structuralFeatures(stripNonAuthorial(held.text));
const sGen = structuralFeatures(stripNonAuthorial(generated));
console.log('\n═══ הרגלים מבניים ═══');
console.log('תכונה                          שלו      הפלט     פער');
for (const k of STRUCTURAL_KEYS) {
  const a = sHeld[k] || 0; const b = sGen[k] || 0;
  const gap = b - a;
  const flag = Math.abs(gap) > Math.abs(a) * 0.35 && Math.abs(gap) > 0.002 ? '  ←' : '';
  console.log(`${(STRUCTURAL_LABELS[k] || k).padEnd(28)} ${a.toFixed(4).padStart(8)} ${b.toFixed(4).padStart(8)} ${(gap > 0 ? '+' : '') + gap.toFixed(4)}${flag}`);
}

// ---------- רצפי תווים: איפה הפלט חורג ושלו לא ----------
const zHeld = new Map(rHeld.top.map((t) => [t.key, t.z]));
console.log('\n═══ רצפים שהפלט מגזים בהם והוא לא ═══');
const rows = rGen.top
  .map((t) => ({ key: t.key, gen: t.z, held: zHeld.get(t.key) ?? 0 }))
  .filter((r) => Math.abs(r.gen) > Math.abs(r.held) + 1.5)
  .slice(0, 12);
for (const r of rows) {
  console.log(`  «${r.key}»  פלט ${r.gen > 0 ? '+' : ''}${r.gen.toFixed(2)} · שלו ${r.held > 0 ? '+' : ''}${r.held.toFixed(2)}`);
}
if (!rows.length) console.log('  (אין — החריגה משותפת לשניהם, כלומר תוכן המקרה ולא סגנון)');
