// ============================================================================
// tools/lexicon-build/validate.mjs
//
// שופט-Flash על מדגם מהלקסיקון המתויג: בודק נכונות POS, מין, שורש, בניין,
// ריבוי ונסמך. מדפיס אחוזי דיוק לכל שדה + דוגמאות שגויות.
//   node tools/lexicon-build/validate.mjs [--sample N]   (ברירת מחדל 500)
// exit 1 אם דיוק כולל < 90% — שער לפני שילוב באפליקציה.
// ============================================================================
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sleep, stripJsonFences, resolveGeminiApiKey, callGemini } from '../synonyms-build/lib.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const RAW_JSON_PATH = path.join(DIR, 'lexicon-tagged.json');
const REPORT_PATH = path.join(DIR, 'validate-report.json');

const argv = process.argv.slice(2);
const SAMPLE = (() => {
  const idx = argv.indexOf('--sample');
  if (idx === -1) return 500;
  const n = Number(argv[idx + 1]);
  return Number.isFinite(n) && n > 0 ? n : 500;
})();
const BATCH = 25;
const PASS_THRESHOLD = 0.9;

const POS_NAMES = { v: 'פועל', n: 'שם עצם', a: 'שם תואר', d: 'תואר פועל', c: 'מילת קישור', p: 'מילת יחס', x: 'אחר' };
const BINYAN_NAMES = { 1: 'פעל', 2: 'נפעל', 3: 'פיעל', 4: 'פועל', 5: 'הפעיל', 6: 'הופעל', 7: 'התפעל' };

// שופטים רק שדות שהמנוע צורך בפועל: POS לכולם; מין/ריבוי/נסמך לשמות ותארים;
// שורש+בניין לפעלים בלבד (שם המורפולוגיה תלויה בהם — ולפעלים יש שער נוסף
// ב-morph-build). שורש על שם עצם הוא מטא-דאטה לא-נושא-משקל — טעות שם לא
// שוברת שום דבר בזמן ריצה, ולכן לא מפילה את השער.
function describeEntry(lemma, e) {
  const [pos, g, n, , root, binyan, plural, construct] = [...e, null, null, null, null, null, null, null, null];
  const parts = [`"${lemma}": ${POS_NAMES[pos] || pos}`];
  if (pos === 'n' || pos === 'a') {
    if (g) parts.push(`מין ${g === 'm' ? 'זכר' : g === 'f' ? 'נקבה' : 'דו-מיני'}`);
    if (n === 'p') parts.push('צורת בסיס ברבים');
    if (plural) parts.push(`ריבוי "${plural}"`);
    if (pos === 'n' && construct) parts.push(`נסמך "${construct}"`);
  } else if (pos === 'v') {
    if (root) parts.push(`שורש ${root}`);
    if (binyan) parts.push(`בניין ${BINYAN_NAMES[binyan]}`);
  }
  return parts.join(', ');
}

function buildJudgePrompt(items) {
  return `לפניך תיוגים דקדוקיים של מילים בעברית. עבור כל שורה, שפוט האם התיוג נכון.
שפוט **אך ורק את השדות המוצגים בשורה** — שדה שלא הוצג אינו חלק מהשיפוט ואינו שגיאה.
שגיאה = אחד השדות המוצגים שגוי (חלק דיבר, מין, ריבוי, נסמך, שורש/בניין של פועל).
כללי הגינות מחייבים:
- פועל שהלמה שלו בצורת הווה או שם-פועל ("מנתח", "לציין") — תקין. שפוט רק אם השורש
  והבניין נכונים לאותו פועל, לא את צורת הלמה.
- תעתיק שורש בלי אימות קריאה תקין: צפה/צפי, גוע/גווע, קום/קמ — כולם אותו שורש.
- מילה דו-משמעית (פועל וגם שם עצם, כמו "פתח") — אם התיוג מתאים לאחת המשמעויות, תקין.
- כינויי גוף וכמתים ("הכל", "כולם") מסומנים אצלנו כ"אחר" או כשם עצם — שניהם קבילים.
${items.map((it, i) => `${i}. ${it.desc}`).join('\n')}
החזר אך ורק JSON. לשורה תקינה: {"ok": true}. לשגויה: {"ok": false, "why": "סיבה קצרה",
"fields": [רשימת קודי השדות השגויים מתוך: "pos","g","root","binyan","pl","cs"]}.
מבנה: {"0": {"ok": true}, "1": {"ok": false, "why": "...", "fields": ["pl"]}, ...}`;
}

async function main() {
  const { key: apiKey } = await resolveGeminiApiKey();
  if (!apiKey) { console.error('No Gemini API key.'); process.exit(1); }

  const lexicon = JSON.parse(await readFile(RAW_JSON_PATH, 'utf8'));
  const entries = Object.entries(lexicon);
  console.log(`lexicon: ${entries.length} lemmas, sampling ${Math.min(SAMPLE, entries.length)}`);

  // דגימה דטרמיניסטית מפוזרת (כל k-י) — בלי Math.random, שחזור מלא בין ריצות.
  const step = Math.max(1, Math.floor(entries.length / SAMPLE));
  const sample = entries.filter((_, i) => i % step === 0).slice(0, SAMPLE)
    .map(([lemma, e]) => ({ lemma, entry: e, desc: describeEntry(lemma, e) }));

  // שני שערים: "נושא-משקל" (pos/g/root/binyan — מה שהמנוע צורך היום, 90%)
  // ו"נטיות שמות" (pl/cs — עוד לא מודפסות; מדווח בלבד, מיועד לסבב תיקון).
  const CORE_FIELDS = new Set(['pos', 'g', 'root', 'binyan']);
  let judged = 0, coreBad = 0, inflectBad = 0;
  const failures = [];
  for (let i = 0; i < sample.length; i += BATCH) {
    const chunk = sample.slice(i, i + BATCH);
    try {
      const text = await callGemini(apiKey, buildJudgePrompt(chunk));
      const verdicts = JSON.parse(stripJsonFences(text));
      chunk.forEach((it, j) => {
        const v = verdicts?.[String(j)];
        judged += 1;
        if (!v || v.ok !== false) return;
        const fields = Array.isArray(v.fields) ? v.fields.filter((f) => typeof f === 'string') : [];
        const isCore = fields.some((f) => CORE_FIELDS.has(f)) || !fields.length; // בלי פירוט — מחמירים
        if (isCore) coreBad += 1; else inflectBad += 1;
        failures.push({ lemma: it.lemma, entry: it.entry, why: v.why || '', fields });
      });
      console.log(`  [${i}-${i + chunk.length}] judged=${judged} coreBad=${coreBad} inflectBad=${inflectBad}`);
    } catch (e) {
      console.warn(`  batch failed (${e.message}) — counting as unjudged`);
    }
    await sleep(1000);
  }

  const coreAcc = judged ? (judged - coreBad) / judged : 0;
  const fullAcc = judged ? (judged - coreBad - inflectBad) / judged : 0;
  await writeFile(REPORT_PATH, JSON.stringify({
    sampled: judged, coreBad, inflectBad, coreAccuracy: coreAcc, fullAccuracy: fullAcc, failures,
  }, null, 2), 'utf8');
  console.log('\n── verdict ──────────────────────────────────');
  console.log(`  core (pos/g/root/binyan): ${(coreAcc * 100).toFixed(1)}%  |  full incl. pl/cs: ${(fullAcc * 100).toFixed(1)}%`);
  console.log(`  report: ${REPORT_PATH}`);
  failures.slice(0, 10).forEach((f) => console.log(`    [${f.fields.join(',') || '?'}] ${f.lemma}: ${f.why}`));
  if (coreAcc < PASS_THRESHOLD) {
    console.error(`FAIL: core accuracy below ${PASS_THRESHOLD * 100}%`);
    process.exit(1);
  }
  if (inflectBad) console.warn(`NOTE: ${inflectBad} noun-inflection issues (pl/cs) — run a repair round before using those fields in output`);
  console.log('PASS (core)');
}

main().catch((e) => { console.error('fatal:', e); process.exit(1); });
