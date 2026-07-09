// ============================================================================
// tools/synonyms-build/gen-wordlist.mjs
//
// Generates tools/synonyms-build/wordlists/he-top15k.txt using:
//   1. Corpus frequency words (from tools/detector-train/samples/)
//   2. Gemini generation per category (60+ categories covering Hebrew vocabulary)
// Requires Gemini API key. Resumable via checkpoint.
//
// Usage:
//   node tools/synonyms-build/gen-wordlist.mjs [--limit N]
// ============================================================================
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  resolveGeminiApiKey,
  callGemini,
  stripJsonFences,
  normalizeLemmaKey,
  HEBREW_WORD_RE,
  STOP_WORDS,
  sleep,
  exists,
} from './lib.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(DIR, '..', '..');
const WORDLISTS_DIR = path.join(DIR, 'wordlists');
const OUTPUT_PATH = path.join(WORDLISTS_DIR, 'he-top15k.txt');
const CHECKPOINT_PATH = path.join(WORDLISTS_DIR, 'gen-checkpoint.json');

// Categories for generation (60+ total)
const CATEGORIES = [
  // 22 Hebrew letters (lexical bootstrap)
  'מילים נפוצות בעברית המתחילות באות א',
  'מילים נפוצות בעברית המתחילות באות ב',
  'מילים נפוצות בעברית המתחילות באות ג',
  'מילים נפוצות בעברית המתחילות באות ד',
  'מילים נפוצות בעברית המתחילות באות ה',
  'מילים נפוצות בעברית המתחילות באות ו',
  'מילים נפוצות בעברית המתחילות באות ז',
  'מילים נפוצות בעברית המתחילות באות ח',
  'מילים נפוצות בעברית המתחילות באות ט',
  'מילים נפוצות בעברית המתחילות באות י',
  'מילים נפוצות בעברית המתחילות באות כ',
  'מילים נפוצות בעברית המתחילות באות ל',
  'מילים נפוצות בעברית המתחילות באות מ',
  'מילים נפוצות בעברית המתחילות באות נ',
  'מילים נפוצות בעברית המתחילות באות ס',
  'מילים נפוצות בעברית המתחילות באות ע',
  'מילים נפוצות בעברית המתחילות באות פ',
  'מילים נפוצות בעברית המתחילות באות צ',
  'מילים נפוצות בעברית המתחילות באות ק',
  'מילים נפוצות בעברית המתחילות באות ר',
  'מילים נפוצות בעברית המתחילות באות ש',
  'מילים נפוצות בעברית המתחילות באות ת',
  // ~38 topical categories
  'פעלים נפוצים בעברית',
  'שמות עצם יומיומיים',
  'שמות תואר',
  'מונחים אקדמיים',
  'מונחים משפטיים',
  'רגשות ותחושות',
  'מקצועות וקריאות',
  'מזון ומאכלים',
  'חי וטבע',
  'גוף האדם',
  'בית ומשפחה',
  'עיר ותחבורה',
  'כלכלה וכסף',
  'בריאות ורפואה',
  'חינוך ולימוד',
  'טכנולוגיה ומחשבים',
  'ממשל ופוליטיקה',
  'תרבות ואמנות',
  'ספורט ותחרות',
  'מדע וטבע',
  'דת ומסורה',
  'צבא וביטחון',
  'תקשורת ועיתונות',
  'פסיכולוגיה והתנהגות',
  'חברה ויחסים בינאישיים',
  'אמנות וציור',
  'מוזיקה וצלילים',
  'ספרות וכתיבה',
  'גיאוגרפיה ומקומות',
  'מזג אוויר וזמן',
  'זמן וחודשים',
  'כמויות ומידות',
  'תארי פועל וביטויי שכיחות',
  'מילות יחס מורחבות',
  'ביטויים אקדמיים',
  'שפה גבוהה ומליצית',
  'סלנג מתון וביטויים עגומים',
  'מילים בינלאומיות מעוברתות',
];

// ── Corpus collection ────────────────────────────────────────────────────
const NIKUD_RE = /[֑-ׇ]/g;

function stripNikud(s) {
  return String(s || '').replace(NIKUD_RE, '');
}

async function collectCorpusWords(topN = 2000) {
  const freq = new Map();
  const sampleFiles = [
    path.join(PROJECT, 'tools', 'detector-train', 'samples', 'human.txt'),
    path.join(PROJECT, 'tools', 'detector-train', 'samples', 'ai.txt'),
  ];

  for (const file of sampleFiles) {
    if (!(await exists(file))) {
      console.warn(`sample file missing, skipping: ${file}`);
      continue;
    }
    const raw = await readFile(file, 'utf8');
    const cleaned = stripNikud(raw)
      .replace(/={3,}/g, ' ')
      .replace(/[.,!?;:()"'"''\[\]{}\-–—/\\«»„"]/g, ' ');
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    for (const tok of tokens) {
      if (tok.length < 3) continue;
      if (!HEBREW_WORD_RE.test(tok)) continue;
      if (STOP_WORDS.has(tok)) continue;
      freq.set(tok, (freq.get(tok) || 0) + 1);
    }
  }

  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  const out = [];
  for (const [word] of sorted) {
    out.push(word);
    if (out.length >= topN) break;
  }
  return out;
}

// ── Checkpoint management ────────────────────────────────────────────────
async function loadCheckpoint() {
  if (!(await exists(CHECKPOINT_PATH))) return { done: [], words: [] };
  try {
    const raw = await readFile(CHECKPOINT_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      done: Array.isArray(parsed.done) ? parsed.done : [],
      words: Array.isArray(parsed.words) ? parsed.words : [],
    };
  } catch (e) {
    console.warn('checkpoint load failed, starting fresh:', e.message);
    return { done: [], words: [] };
  }
}

async function saveCheckpoint(state) {
  await mkdir(WORDLISTS_DIR, { recursive: true });
  await writeFile(CHECKPOINT_PATH, JSON.stringify(state, null, 2), 'utf8');
}

// ── Gemini generation ────────────────────────────────────────────────────
async function generateWordsForCategory(apiKey, category) {
  const prompt = `צור רשימה של 300 מילים נפוצות בעברית בקטגוריה: "${category}".
פעלים בצורת עבר יחיד, שמות עצם ביחיד, שמות תואר בזכר יחיד, ללא ניקוד.
החזר JSON בלבד: מערך שטוח של מחרוזות.
דוגמה: ["מילה1", "מילה2", "מילה3", ...]`;

  const text = await callGemini(apiKey, prompt);
  let cleaned = stripJsonFences(text);
  try {
    let arr;
    try {
      arr = JSON.parse(cleaned);
    } catch {
      // Handle truncated response: find last complete string and close array
      const lastQuote = cleaned.lastIndexOf('",');
      if (lastQuote > 0) arr = JSON.parse(cleaned.slice(0, lastQuote + 1) + ']');
    }
    if (Array.isArray(arr)) {
      return arr
        .map((w) => normalizeLemmaKey(w))
        .filter((w) => HEBREW_WORD_RE.test(w) && w.length >= 2);
    }
  } catch (e) {
    console.warn(`  parse failed: ${e.message} (first 150 chars: ${cleaned.slice(0, 150)})`);
  }
  return [];
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('tools/synonyms-build/gen-wordlist.mjs');
  const { key: apiKey, source: keySource } = await resolveGeminiApiKey();
  if (!apiKey) {
    console.error('No Gemini API key found.');
    process.exit(1);
  }
  console.log(`API key resolved ✓ (${keySource})\n`);

  // Parse --limit flag
  const argv = process.argv.slice(2);
  const limitIdx = argv.indexOf('--limit');
  const limit = limitIdx !== -1 ? Number(argv[limitIdx + 1]) : Infinity;

  const { done: doneCategories, words: allWords } = await loadCheckpoint();
  const doneSet = new Set(doneCategories);

  // Collect corpus words first
  console.log('collecting corpus words...');
  const corpusWords = await collectCorpusWords(2000);
  console.log(`  corpus: ${corpusWords.length} words`);

  // Generate per category
  const categoriesToRun = CATEGORIES.slice(0, Math.min(CATEGORIES.length, limit));
  console.log(`generating ${categoriesToRun.length} categories...`);

  let processed = 0;
  for (const category of categoriesToRun) {
    if (doneSet.has(category)) continue;
    processed += 1;
    console.log(`[${processed}/${categoriesToRun.length}] ${category}`);
    try {
      const words = await generateWordsForCategory(apiKey, category);
      console.log(`  generated ${words.length} words`);
      allWords.push(...words);
    } catch (e) {
      console.warn(`  failed: ${e.message}`);
    }
    doneSet.add(category);
    await saveCheckpoint({ done: [...doneSet], words: allWords });
    await sleep(1000);
  }

  // Merge and dedupe: corpus first (frequency-ordered), then generated
  console.log('\nmerging and deduping...');
  const seen = new Set();
  const final = [];
  for (const word of corpusWords) {
    if (seen.has(word)) continue;
    seen.add(word);
    final.push(word);
  }
  for (const word of allWords) {
    if (seen.has(word)) continue;
    if (!HEBREW_WORD_RE.test(word) || word.length < 2) continue;
    if (STOP_WORDS.has(word)) continue;
    seen.add(word);
    final.push(word);
  }

  // Write output
  await mkdir(WORDLISTS_DIR, { recursive: true });
  const content = final.join('\n') + '\n';
  await writeFile(OUTPUT_PATH, content, 'utf8');

  console.log(`\n✓ wrote ${final.length} words to ${OUTPUT_PATH}`);
  console.log(`  (${corpusWords.length} from corpus, ${final.length - corpusWords.length} from generation)`);
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
