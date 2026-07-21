// judge-composed-openers.mjs — שופט Flash אופליין על הפתיחים המורכבים.
//
// שלושה צירים לכל פתיח: (א) דקדוקי? (ב) מתאים לאינטנט? (ג) נשמע כמו הכותב —
// רק כשיש דוגמאות ממוקשות להשוואה. רץ אחרי run-openers-compose (שמדפיס CSV?
// לא — כאן מרכיבים ישירות מהמודול; אין תלות ב-bundle).
//
// הרצה: node tools/test-bench/judge-composed-openers.mjs
// פלט: tools/test-bench/lab-results/openers-judge-<date>.json

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveGeminiApiKey, callGemini, stripJsonFences, sleep } from '../synonyms-build/lib.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(DIR, 'lab-results');
const PER_INTENT = Number(process.env.WORDAI_JUDGE_PER_INTENT || 5);

// הווריאנטים מופקים ע"י ה-bundle של run-openers-compose — אותו קוד שמריץ
// המוצר, לא שכפול לוגיקה שמודד את עצמו. אם openers-composed.json חסר,
// מריצים את ההרכבה עכשיו (WORDAI_COMPOSE_EMIT_JSON).
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const PROJECT = path.resolve(DIR, '..', '..');
const COMPOSED_JSON = path.join(OUT_DIR, 'openers-composed.json');

let composed;
try {
  composed = JSON.parse(await readFile(COMPOSED_JSON, 'utf8'));
} catch {
  console.log('אין openers-composed.json — מפיק דרך run-openers-compose…');
  await new Promise((resolve, reject) => {
    const p = spawn('node', ['tools/test-bench/run-openers-compose.mjs'], {
      cwd: PROJECT, stdio: 'inherit', shell: process.platform === 'win32',
      env: { ...process.env, WORDAI_COMPOSE_EMIT_JSON: COMPOSED_JSON, WORDAI_COMPOSE_PER_INTENT: String(PER_INTENT) },
    });
    p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(`exit ${c}`))));
  });
  composed = JSON.parse(await readFile(COMPOSED_JSON, 'utf8'));
}

const { key, source } = await resolveGeminiApiKey();
if (!key) { console.error('אין מפתח Gemini.'); process.exit(1); }
console.log(`מפתח: ${source} · פתיחים לשיפוט: ${composed.length}`);

const PROMPT = (rows) => `אתה שופט משפטי פתיחה אקדמיים בעברית. כל שורה: אינטנט + פתיח (מסתיים ב"…" — המשך המשפט ייכתב ע"י הסטודנט).

לכל שורה החזר:
- g: המשפט דקדוקי ותקין בעברית (התאם מין/מספר, מילות יחס נכונות)? true/false
- fit: הפתיח מתאים לתפקיד הרטורי (אינטנט)? true/false
- why: הסבר קצר רק אם אחד מהם false

החזר JSON בלבד: [{"i":0,"g":true,"fit":true,"why":""}, ...]

השורות:
${rows}`;

const results = [];
const BATCH = 30;
for (let i = 0; i < composed.length; i += BATCH) {
  const slice = composed.slice(i, i + BATCH);
  const rows = slice.map((o, j) => `${i + j}. [${o.intent}] ${o.text}`).join('\n');
  try {
    const raw = await callGemini(key, PROMPT(rows));
    JSON.parse(stripJsonFences(raw)).forEach((v) => {
      if (v && Number.isInteger(v.i) && composed[v.i]) {
        results.push({ ...composed[v.i], grammatical: Boolean(v.g), intentFit: Boolean(v.fit), why: v.why || '' });
      }
    });
  } catch (e) {
    console.warn(`אצווה נכשלה: ${e.message.slice(0, 100)}`);
  }
  await sleep(1200);
}

const gRate = results.filter((r) => r.grammatical).length / Math.max(1, results.length);
const fitRate = results.filter((r) => r.intentFit).length / Math.max(1, results.length);
console.log(`\nדקדוקיות: ${(gRate * 100).toFixed(1)}% · התאמת אינטנט: ${(fitRate * 100).toFixed(1)}%`);
results.filter((r) => !r.grammatical || !r.intentFit)
  .forEach((r) => console.log(`  ✗ [${r.intent}] ${r.text} — ${r.why}`));

await mkdir(OUT_DIR, { recursive: true });
const date = new Date().toISOString().slice(0, 10);
const outPath = path.join(OUT_DIR, `openers-judge-${date}.json`);
await writeFile(outPath, JSON.stringify({ date, judged: results.length, grammaticalRate: gRate, intentFitRate: fitRate, results }, null, 1), 'utf8');
console.log(`-> ${outPath}`);
