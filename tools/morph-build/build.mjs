// ============================================================================
// tools/morph-build/build.mjs
//
// ולידציה של מנוע המורפולוגיה: לכל (שורש,בניין) מהלקסיקון המתויג —
// מייצר את צורות-המפתח עם hebrewMorphRules, שולח לשופט-Flash שמאשר או מתקן,
// וכותב את src/services/morphRules.data.js:
//   MORPH_VALIDATED  — זוגות שכולם אושרו (המנוע רשאי לייצר להם כל צורה)
//   MORPH_EXCEPTIONS — תיקונים נקודתיים "root|binyan|formKey" -> צורה
//
// דורש שקודם רץ tools/lexicon-build (lexicon-tagged.json).
//   node tools/morph-build/build.mjs [--fresh] [--limit N]
// יעד שער: ≥98% זוגות תקינים ב-Tier 1-2 (זוג עם >2 תיקונים נפסל כולו).
// ============================================================================
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import {
  exists, sleep, stripJsonFences, resolveGeminiApiKey, callGemini, normalizeLemmaKey, HEBREW_WORD_RE,
} from '../synonyms-build/lib.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(DIR, '..', '..');
const LEXICON_JSON = path.join(PROJECT, 'tools', 'lexicon-build', 'lexicon-tagged.json');
const RULES_MODULE = path.join(PROJECT, 'src', 'services', 'hebrewMorphRules.js');
const CHECKPOINT_PATH = path.join(DIR, 'checkpoint.json');
const OUTPUT_MODULE = path.join(PROJECT, 'src', 'services', 'morphRules.data.js');
const REPORT_PATH = path.join(DIR, 'build-report.json');

const BATCH = 12; // זוגות לאצוות שיפוט — כל זוג = ~10 צורות, לא להעמיס
const MAX_FIXES_PER_PAIR = 2; // מעל זה — התבנית כנראה שגויה לזוג, פוסלים

const argv = process.argv.slice(2);
const FLAGS = {
  fresh: argv.includes('--fresh'),
  limit: (() => {
    const i = argv.indexOf('--limit');
    if (i === -1) return Infinity;
    const n = Number(argv[i + 1]);
    return Number.isFinite(n) && n > 0 ? n : Infinity;
  })(),
};

const TENSE_LABEL = {
  past: 'עבר נסתר', pastF: 'עבר נסתרת', past1: 'עבר מדבר (אני)', pastP: 'עבר נסתרים',
  pres: 'הווה יחיד', presF: 'הווה יחידה', presP: 'הווה רבים', fut: 'עתיד נסתר', futP: 'עתיד נסתרים', inf: 'שם פועל',
};
const BINYAN_NAMES = { 1: 'פעל', 2: 'נפעל', 3: 'פיעל', 4: 'פועל', 5: 'הפעיל', 6: 'הופעל', 7: 'התפעל' };

function buildJudgePrompt(pairs) {
  const lines = pairs.map((p, i) => {
    const forms = Object.entries(p.forms).map(([k, v]) => `${TENSE_LABEL[k]}: ${v}`).join(' · ');
    return `${i}. שורש ${p.root}, בניין ${BINYAN_NAMES[p.binyan]}${p.example ? ` (למשל "${p.example}")` : ''} — ${forms}`;
  }).join('\n');
  return `לפניך נטיות פועל בעברית בכתיב מלא (בלי ניקוד) שיוצרו אוטומטית. בדוק כל שורה.
עבור כל שורה החזר:
- "ok": true אם *כל* הצורות נכונות בכתיב מלא תקני.
- אחרת "ok": false ו-"fix": אובייקט רק עם הצורות השגויות ותיקונן, במפתחות: ${Object.keys(TENSE_LABEL).join(', ')}.
- אם השורש/בניין לא קיימים בעברית או שהצירוף לא בשימוש — "ok": false, "fix": null.
שים לב: כתיב מלא (יכתוב ולא יכתב, דיבר ולא דבר). אל תתקן צורה נכונה.
${lines}
החזר אך ורק JSON: {"0": {"ok": true}, "1": {"ok": false, "fix": {"fut": "..."}}, ...}`;
}

async function loadCheckpoint() {
  if (FLAGS.fresh || !(await exists(CHECKPOINT_PATH))) return { done: [], validated: [], exceptions: {}, rejected: [] };
  try { return JSON.parse(await readFile(CHECKPOINT_PATH, 'utf8')); }
  catch { return { done: [], validated: [], exceptions: {}, rejected: [] }; }
}
const saveCheckpoint = (s) => writeFile(CHECKPOINT_PATH, JSON.stringify(s), 'utf8');

async function main() {
  const { key: apiKey, source } = await resolveGeminiApiKey();
  if (!apiKey) { console.error('No Gemini API key.'); process.exit(1); }
  console.log(`API key ✓ (${source})`);

  if (!(await exists(LEXICON_JSON))) {
    console.error(`missing ${LEXICON_JSON} — run tools/lexicon-build first`);
    process.exit(1);
  }
  const rules = await import(pathToFileURL(RULES_MODULE).href);
  const lexicon = JSON.parse(await readFile(LEXICON_JSON, 'utf8'));

  // איסוף זוגות (root,binyan) ייחודיים מהפעלים המתויגים + דוגמת למה לכל זוג
  const pairs = new Map();
  for (const [lemma, arr] of Object.entries(lexicon)) {
    const [pos, , , , root, binyan] = [...arr, null, null, null, null, null, null];
    if (pos !== 'v' || !root || !binyan) continue;
    const key = `${root}|${binyan}`;
    if (!pairs.has(key)) pairs.set(key, { root, binyan, example: lemma });
  }
  console.log(`verb (root,binyan) pairs in lexicon: ${pairs.size}`);

  // יצירת צורות; זוגות שהמנוע לא תומך בהם (Tier 3) נרשמים ולא נשלחים לשיפוט
  const judgeList = [];
  let unsupported = 0;
  for (const p of pairs.values()) {
    const forms = {};
    let missing = false;
    for (const [key, feat] of rules.VALIDATION_FORM_KEYS) {
      const f = rules.conjugate(p.root, p.binyan, feat);
      if (!f) { missing = true; break; }
      forms[key] = f;
    }
    if (missing) { unsupported += 1; continue; }
    judgeList.push({ ...p, forms });
  }
  console.log(`supported by engine: ${judgeList.length}, unsupported (Tier 3): ${unsupported}`);

  const state = await loadCheckpoint();
  const doneSet = new Set(state.done);
  const validated = new Set(state.validated);
  const exceptions = state.exceptions;
  const rejected = new Set(state.rejected);

  const batches = [];
  for (let i = 0; i < judgeList.length; i += BATCH) {
    batches.push({ id: `j_${i / BATCH}`, pairs: judgeList.slice(i, i + BATCH) });
  }
  const pending = batches.filter((b) => !doneSet.has(b.id)).slice(0, FLAGS.limit);
  console.log(`judge batches: ${batches.length} total, ${pending.length} to run`);

  for (const batch of pending) {
    console.log(`[${batch.id}] ${batch.pairs.length} pairs`);
    try {
      const text = await callGemini(apiKey, buildJudgePrompt(batch.pairs));
      const verdicts = JSON.parse(stripJsonFences(text));
      batch.pairs.forEach((p, i) => {
        const v = verdicts?.[String(i)];
        const pairKey = `${p.root}|${p.binyan}`;
        if (!v) { rejected.add(pairKey); return; }
        if (v.ok === true) { validated.add(pairKey); return; }
        const fix = v.fix && typeof v.fix === 'object' ? v.fix : null;
        if (!fix) { rejected.add(pairKey); return; }
        const fixKeys = Object.keys(fix).filter((k) => TENSE_LABEL[k]);
        if (!fixKeys.length || fixKeys.length > MAX_FIXES_PER_PAIR) { rejected.add(pairKey); return; }
        let allValid = true;
        for (const k of fixKeys) {
          const corrected = normalizeLemmaKey(String(fix[k] || ''));
          if (!corrected || !HEBREW_WORD_RE.test(corrected)) { allValid = false; break; }
          exceptions[`${pairKey}|${k}`] = corrected;
        }
        if (allValid) validated.add(pairKey); else rejected.add(pairKey);
      });
    } catch (e) {
      console.warn(`  batch failed: ${e.message}`);
    }
    doneSet.add(batch.id);
    await saveCheckpoint({ done: [...doneSet], validated: [...validated], exceptions, rejected: [...rejected] });
    await sleep(1000);
  }

  // פלט
  const header = `// קובץ שנוצר אוטומטית ע"י tools/morph-build/build.mjs — לא לערוך ידנית.\n` +
    `// MORPH_VALIDATED: זוגות root|binyan שהמנוע רשאי להטות. MORPH_EXCEPTIONS: תיקונים.\n`;
  const body = `export const MORPH_VALIDATED = ${JSON.stringify([...validated].sort())};\n` +
    `export const MORPH_EXCEPTIONS = ${JSON.stringify(exceptions)};\n` +
    `export const MORPH_DATA_VERSION = 1;\n`;
  await writeFile(OUTPUT_MODULE, header + body, 'utf8');

  const judged = validated.size + rejected.size;
  const rate = judged ? validated.size / judged : 0;
  await writeFile(REPORT_PATH, JSON.stringify({
    pairs: pairs.size, unsupported, judged, validated: validated.size,
    rejected: [...rejected], exceptions: Object.keys(exceptions).length, passRate: rate,
  }, null, 2), 'utf8');
  console.log('\n── summary ──────────────────────────────────');
  console.log(`  validated: ${validated.size}/${judged} (${(rate * 100).toFixed(1)}%)  exceptions: ${Object.keys(exceptions).length}  rejected: ${rejected.size}`);
  console.log(`  output: ${OUTPUT_MODULE}`);
  if (judged && rate < 0.98) console.warn('  NOTE: below 98% target — inspect build-report.json rejected list');
}

main().catch((e) => { console.error('fatal:', e); process.exit(1); });
