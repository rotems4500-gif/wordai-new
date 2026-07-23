// ============================================================================
// tools/lexicon-build/repair.mjs
//
// סבב תיקון ממוקד לשדות נטיית השמות (ריבוי pl + נסמך cs) — השדות שנמדדו 84%
// בוולידציה. פרומפט צר (רק שני שדות, שמות עצם/תואר בלבד) מדויק יותר מהתיוג
// הרחב, ולכן במקום לתקן רק את הכשלים שנדגמו — מתייגים מחדש את *כל* השמות.
//   node tools/lexicon-build/repair.mjs [--limit N]
// מעדכן את checkpoint.json + lexicon-tagged.json + hebrewLexicon.data.js במקום.
// אחרי ריצה: validate.mjs שוב — היעד: full accuracy ≥90%.
// ============================================================================
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  HEBREW_WORD_RE, exists, sleep, normalizeLemmaKey, stripJsonFences,
  resolveGeminiApiKey, callGemini,
} from '../synonyms-build/lib.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(DIR, '..', '..');
const CHECKPOINT_PATH = path.join(DIR, 'checkpoint.json');
const RAW_JSON_PATH = path.join(DIR, 'lexicon-tagged.json');
const REPAIR_CHECKPOINT = path.join(DIR, 'repair-checkpoint.json');
const OUTPUT_MODULE_PATH = path.join(PROJECT, 'src', 'services', 'hebrewLexicon.data.js');

const BATCH = 40;
const argv = process.argv.slice(2);
const LIMIT = (() => {
  const i = argv.indexOf('--limit');
  if (i === -1) return Infinity;
  const n = Number(argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
})();

function buildRepairPrompt(items) {
  return `לפניך שמות עצם ושמות תואר בעברית. עבור כל מילה החזר:
- "pl": צורת הריבוי המלאה בכתיב מלא (לשם תואר — ריבוי זכר). אם למילה אין ריבוי
  בשימוש (שם פעולה, מושג מופשט, שם קיבוצי) — null. אל תמציא ריבוי מאולץ.
- "cs": לשם עצם בלבד — צורת הנסמך ביחיד ("שנה"→"שנת", "בית"→"בית", "ספרייה"→"ספריית").
  לשם תואר או כשאין נסמך שונה בשימוש — אפשר לחזור על צורת הבסיס.
דיוק מעל הכול: אם אינך בטוח — null.
המילים: ${items.map((it) => `"${it.lemma}" (${it.pos === 'a' ? 'תואר' : 'שם עצם'}${it.g === 'f' ? ', נקבה' : it.g === 'm' ? ', זכר' : ''})`).join(', ')}.
החזר אך ורק JSON: {"מילה": {"pl": "...", "cs": "..."}, ...}`;
}

async function main() {
  const { key: apiKey, source } = await resolveGeminiApiKey();
  if (!apiKey) { console.error('No Gemini API key.'); process.exit(1); }
  console.log(`API key ✓ (${source})`);

  const checkpoint = JSON.parse(await readFile(CHECKPOINT_PATH, 'utf8'));
  const lexicon = checkpoint.lexicon;
  const targets = Object.entries(lexicon)
    .filter(([, arr]) => arr[0] === 'n' || arr[0] === 'a')
    .map(([lemma, arr]) => ({ lemma, pos: arr[0], g: arr[1] || null }));
  console.log(`noun/adj lemmas to repair: ${targets.length}`);

  let done = new Set();
  if (await exists(REPAIR_CHECKPOINT)) {
    try { done = new Set(JSON.parse(await readFile(REPAIR_CHECKPOINT, 'utf8')).done || []); } catch {}
  }

  const batches = [];
  for (let i = 0; i < targets.length; i += BATCH) {
    batches.push({ id: `r_${i / BATCH}`, items: targets.slice(i, i + BATCH) });
  }
  const pending = batches.filter((b) => !done.has(b.id)).slice(0, LIMIT);
  console.log(`batches: ${batches.length} total, ${pending.length} to run`);

  let updated = 0;
  for (const batch of pending) {
    console.log(`[${batch.id}] ${batch.items.length} lemmas (updated so far: ${updated})`);
    try {
      const text = await callGemini(apiKey, buildRepairPrompt(batch.items));
      const parsed = JSON.parse(stripJsonFences(text));
      for (const it of batch.items) {
        const fix = parsed?.[it.lemma];
        if (!fix || typeof fix !== 'object') continue;
        const arr = lexicon[it.lemma];
        if (!arr) continue;
        // מיישרים אורך ל-8 כדי לכתוב באינדקסים 6/7, ואז חותכים nulls בזנב.
        while (arr.length < 8) arr.push(null);
        const pl = typeof fix.pl === 'string' ? normalizeLemmaKey(fix.pl) : null;
        const cs = typeof fix.cs === 'string' ? normalizeLemmaKey(fix.cs) : null;
        arr[6] = pl && HEBREW_WORD_RE.test(pl.replace(/\s+/g, '')) ? pl : null;
        arr[7] = it.pos === 'n' && cs && HEBREW_WORD_RE.test(cs.replace(/\s+/g, '')) ? cs : null;
        while (arr.length && (arr[arr.length - 1] === null || arr[arr.length - 1] === undefined)) arr.pop();
        updated += 1;
      }
    } catch (e) {
      console.warn(`  batch failed: ${e.message}`);
    }
    done.add(batch.id);
    await writeFile(REPAIR_CHECKPOINT, JSON.stringify({ done: [...done] }), 'utf8');
    // שמירת ה-checkpoint הראשי בכל אצווה — עמידות לקריסה כמו ב-build.
    await writeFile(CHECKPOINT_PATH, JSON.stringify(checkpoint), 'utf8');
    await sleep(1000);
  }

  // כתיבת הפלטים (אותו פורמט כמו build.mjs)
  await writeFile(RAW_JSON_PATH, JSON.stringify(lexicon, null, 1), 'utf8');
  const header = `// קובץ שנוצר אוטומטית ע"י tools/lexicon-build/build.mjs — לא לערוך ידנית.\n` +
    `// מבנה: lemma -> [pos, g, n, reg, root, binyan, plural, construct] (nulls בזנב נחתכו)\n` +
    `// pos: v/n/a/d/c/p/x · g: m/f/b · n: s/p · reg: 1-3 · binyan: 1-7 (פעל..התפעל)\n`;
  await writeFile(OUTPUT_MODULE_PATH,
    header + `export const HEBREW_LEXICON = ${JSON.stringify(lexicon)};\nexport const HEBREW_LEXICON_VERSION = 2;\n`, 'utf8');
  console.log(`\nrepaired ${updated} lemmas. outputs written (version 2).`);
}

main().catch((e) => { console.error('fatal:', e); process.exit(1); });
