// ============================================================================
// tools/sentence-grammar-build/build.mjs
//
// מרחיב את sentenceGrammar.data.js: ה-seed הידני נשאר הקאנון; Flash מציע
// מסגרות נוספות לכל מהלך רטורי, שופט-Flash שני מאשר, ורק מסגרות שעברו נכנסות.
//   node tools/sentence-grammar-build/build.mjs [--per-move N] [--dry]
//
// כללי קבלה (מעבר לשופט): פסוקית/אימפרסונל בלבד (בטוח-מגדר), placeholder אחד
// לפחות, בלי מילים טוענות-עובדה ("מוכיח", "ברור כי"), אורך 2-10 מילים.
// ============================================================================
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { sleep, stripJsonFences, resolveGeminiApiKey, callGemini } from '../synonyms-build/lib.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(DIR, '..', '..');
const DATA_PATH = path.join(PROJECT, 'src', 'services', 'sentenceGrammar.data.js');

const argv = process.argv.slice(2);
const PER_MOVE = (() => {
  const i = argv.indexOf('--per-move');
  const n = i !== -1 ? Number(argv[i + 1]) : 8;
  return Number.isFinite(n) && n > 0 ? n : 8;
})();
const DRY = argv.includes('--dry');

const MOVE_DESC = {
  claim: 'הצגת טענה מרכזית (המסגרת מקבלת פסוקית תוכן @clause או נושא @topic)',
  evidence: 'דיווח ראיה ממקור (@author=שם המקור, @clause=תוכן הראיה, @cite=מראה מקום)',
  quoteIntro: 'הצגת ציטוט ישיר (@quote, @author, @cite)',
  explain: 'הסבר או פרשנות של הראיה הקודמת (@clause)',
  contrast: 'הצגת זווית מנוגדת (@clause)',
  concede: 'הסתייגות או סיוג (@clause)',
  transition: 'מעבר לנושא הבא (@topic)',
  wrap: 'סיכום ביניים (@clause)',
};

const BANNED = /(מוכיח|הוכחה חד|ברור כי|אין ספק|כידוע לכל|מדהים|מהפכני)/;

function buildProposePrompt(move, existing) {
  return `אנחנו בונים מסגרות משפט עבריות לכתיבה אקדמית, למהלך רטורי: ${MOVE_DESC[move]}.
מסגרות קיימות (אל תחזור עליהן):
${existing.map((f) => `- ${f.t.filter((x) => typeof x === 'string').join(' ')}`).join('\n')}
הצע ${PER_MOVE} מסגרות חדשות. חוקים קשיחים:
1. משלב אקדמי תקני, עברית בלבד.
2. המסגרת חייבת להיות בטוחה-מגדר: אסור שאף מילה בה תצטרך להתאים במין/מספר לתוכן.
   לכן רק ניסוח אימפרסונלי ("ניתן לומר כי", "מן הדברים עולה ש") או פסוקית.
3. כל מסגרת מכילה placeholder אחד לפחות מתוך: @clause @topic @author @cite @quote.
4. 2-10 מילים במסגרת (לא כולל placeholders). בלי מילים בומבסטיות.
החזר אך ורק JSON: [{"t": ["טקסט לפני", "@clause", "."]}, ...] — כל איבר במערך t הוא
מחרוזת מילולית או placeholder בודד.`;
}

function buildJudgePrompt(move, frames) {
  return `שפוט מסגרות משפט עבריות למהלך "${MOVE_DESC[move]}". מסגרת נפסלת אם: עברית
לא תקנית; דורשת התאמת מין/מספר לתוכן; מליצית/בומבסטית; כפולת-משמעות; או שאינה
מתאימה למהלך. היה קפדן.
${frames.map((f, i) => `${i}. ${f.t.join(' ')}`).join('\n')}
החזר אך ורק JSON: {"0": true, "1": false, ...}`;
}

function validFrame(f) {
  if (!f || !Array.isArray(f.t) || !f.t.length) return false;
  const literals = f.t.filter((x) => typeof x === 'string' && !x.startsWith('@'));
  const phs = f.t.filter((x) => typeof x === 'string' && x.startsWith('@'));
  if (!phs.length) return false;
  if (!phs.every((p) => ['@clause', '@topic', '@author', '@cite', '@quote'].includes(p))) return false;
  const text = literals.join(' ');
  if (BANNED.test(text)) return false;
  const wordCount = text.split(/\s+/).filter((w) => /[א-ת]/.test(w)).length;
  if (wordCount < 2 || wordCount > 10) return false;
  if (/[a-zA-Z]/.test(text)) return false;
  return true;
}

async function main() {
  const { key: apiKey } = await resolveGeminiApiKey();
  if (!apiKey) { console.error('No Gemini API key.'); process.exit(1); }

  const mod = await import(pathToFileURL(DATA_PATH).href);
  const grammar = JSON.parse(JSON.stringify(mod.SENTENCE_GRAMMAR));
  const version = (mod.SENTENCE_GRAMMAR_VERSION || 1) + 1;

  let added = 0;
  for (const [move, def] of Object.entries(grammar.moves)) {
    console.log(`[${move}] existing: ${def.frames.length}`);
    try {
      const proposed = JSON.parse(stripJsonFences(await callGemini(apiKey, buildProposePrompt(move, def.frames))));
      const candidates = (Array.isArray(proposed) ? proposed : []).filter(validFrame);
      if (!candidates.length) { console.log('  no valid candidates'); continue; }
      await sleep(1000);
      const verdicts = JSON.parse(stripJsonFences(await callGemini(apiKey, buildJudgePrompt(move, candidates))));
      const existingTexts = new Set(def.frames.map((f) => f.t.join('|')));
      candidates.forEach((c, i) => {
        if (verdicts?.[String(i)] !== true) return;
        const key = c.t.join('|');
        if (existingTexts.has(key)) return;
        existingTexts.add(key);
        def.frames.push({ id: `${move}_x${def.frames.length}`, t: c.t, reg: 2, generated: true });
        added += 1;
      });
      console.log(`  accepted: ${def.frames.filter((f) => f.generated).length}`);
    } catch (e) {
      console.warn(`  failed: ${e.message}`);
    }
    await sleep(1000);
  }

  console.log(`\ntotal added: ${added}`);
  if (DRY) { console.log('(dry run — not written)'); return; }
  if (!added) { console.log('nothing to write'); return; }

  const header = `// sentenceGrammar.data.js — מסגרות משפט לפי מהלך רטורי.\n` +
    `// seed ידני + הרחבות tools/sentence-grammar-build (מסומנות generated:true).\n` +
    `// מסגרות בטוחות-מגדר בלבד — ראה README של הכלי. לא לערוך את ה-generated ידנית.\n\n`;
  const body = `export const SENTENCE_GRAMMAR_VERSION = ${version};\n\n` +
    `export const SENTENCE_GRAMMAR = ${JSON.stringify(grammar, null, 2)};\n`;
  await writeFile(DATA_PATH, header + body, 'utf8');
  console.log(`written: ${DATA_PATH} (version ${version})`);
}

main().catch((e) => { console.error('fatal:', e); process.exit(1); });
