// tools/opener-grammar-build/validate.mjs — שופט Flash שני על מדגם מהתיוג.
//
// למה שופט נפרד: התיוג עצמו הוא Flash; מודל שבודק את עצמו באותו פרומפט מאשר
// את הטעויות של עצמו. כאן הפרומפט הפוך — "מצא סיבה לפסול" — והציון נמדד לכל
// סלוט. סלוט שההסכמה עליו נמוכה מ-85% מסומן לביקורת ידנית.
//
// הרצה: node tools/opener-grammar-build/validate.mjs   (אחרי build.mjs)

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveGeminiApiKey, callGemini, stripJsonFences, sleep } from '../synonyms-build/lib.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CHECKPOINT = path.join(DIR, 'checkpoint.json');
const OUT = path.join(DIR, 'validate-report.json');
const SAMPLE = Number(process.env.WORDAI_VALIDATE_SAMPLE || 500);
const BATCH = 50;
const AGREE_FLOOR = 0.85;

const checkpoint = JSON.parse(await readFile(CHECKPOINT, 'utf8'));
const tagged = checkpoint.tagged || [];
if (!tagged.length) { console.error('אין תיוגים ב-checkpoint — הרץ build.mjs קודם.'); process.exit(1); }

// דגימה בפריסה קבועה — הרצה חוזרת שופטת את אותו מדגם.
const flat = [];
tagged.forEach(({ w, slots }) => slots.forEach((s) => flat.push({ w, ...s })));
const step = Math.max(1, Math.floor(flat.length / SAMPLE));
const sample = [];
for (let i = 0; i < flat.length && sample.length < SAMPLE; i += step) sample.push(flat[i]);
console.log(`תיוגי-סלוט: ${flat.length} · נדגמים: ${sample.length}`);

const { key, source } = await resolveGeminiApiKey();
if (!key) { console.error('אין מפתח Gemini.'); process.exit(1); }
console.log(`מפתח: ${source}`);

const PROMPT_HEAD = `אתה בודק תיוגים לדקדוק "פתיחי פסקה אקדמיים" בעברית. לכל שורה נטען שהמילה שייכת לסלוט מסוים. חפש סיבה לפסול:
- מילה נושאת תוכן (שם, מונח דומיין) בסלוט מסגרתי → פסול
- form=fin עם g/n שגויים ("מלמדים" חייב g=m n=p) → פסול
- register לא אקדמי שסומן reg=2 → פסול
- tails שהפועל לא באמת מקבל ("לבחון" לא מקבל "כי" ישירות? שקול) → פסול אם ברור

החזר JSON בלבד: [{"i":<index>,"ok":true|false,"why":"<קצר אם פסול>"}]

השורות:
`;

const verdicts = new Map();
for (let i = 0; i < sample.length; i += BATCH) {
  const rows = sample.slice(i, i + BATCH)
    .map((s, j) => `${i + j}. w="${s.w}" slot=${s.slot}${s.form ? '/' + s.form : ''} g=${s.g || '-'} n=${s.n || '-'} reg=${s.reg} tails=${(s.tails || []).join(',') || '-'} intents=${(s.intents || []).join(',')}`)
    .join('\n');
  try {
    const raw = await callGemini(key, PROMPT_HEAD + rows);
    JSON.parse(stripJsonFences(raw)).forEach((v) => {
      if (v && Number.isInteger(v.i)) verdicts.set(v.i, v);
    });
    console.log(`  ${Math.min(i + BATCH, sample.length)}/${sample.length}`);
  } catch (e) {
    console.warn(`  אצווה נכשלה: ${e.message.slice(0, 100)}`);
  }
  await sleep(1200);
}

// הסכמה לכל סלוט
const bySlot = {};
sample.forEach((s, i) => {
  const v = verdicts.get(i);
  if (!v) return;
  const k = s.form ? `${s.slot}/${s.form}` : s.slot;
  bySlot[k] = bySlot[k] || { total: 0, ok: 0, bad: [] };
  bySlot[k].total += 1;
  if (v.ok) bySlot[k].ok += 1;
  else bySlot[k].bad.push({ w: s.w, why: v.why });
});

console.log('\nהסכמה לכל סלוט:');
const flagged = [];
Object.entries(bySlot).forEach(([slot, r]) => {
  const rate = r.ok / r.total;
  const mark = rate < AGREE_FLOOR ? '  ← ביקורת ידנית!' : '';
  if (rate < AGREE_FLOOR) flagged.push(slot);
  console.log(`  ${slot.padEnd(18)} ${(rate * 100).toFixed(1)}% (${r.ok}/${r.total})${mark}`);
});

await writeFile(OUT, JSON.stringify({ date: new Date().toISOString().slice(0, 10), sampled: sample.length, bySlot, flagged }, null, 1), 'utf8');
console.log(`\n-> ${OUT}`);
if (flagged.length) console.log(`סלוטים מתחת ל-${AGREE_FLOOR * 100}%: ${flagged.join(', ')} — עבור על ה-bad ב-report לפני emit סופי.`);
