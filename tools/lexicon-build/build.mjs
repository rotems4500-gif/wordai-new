// ============================================================================
// tools/lexicon-build/build.mjs
//
// מחולל אופליין ללקסיקון עברי מתויג (POS, מין, מספר, משלב, שורש, בניין,
// ריבוי, נסמך) — הידע שחסר ל-synonymsLexicon (שם יש רק נרדפות+הקשר).
// קורא ל-Gemini Flash באצוות, ממזג, וכותב:
//   - tools/lexicon-build/lexicon-tagged.json     (raw, pretty, debug)
//   - src/services/hebrewLexicon.data.js          (מודול קומפקטי לריצה)
//
// לא רץ אוטומטית ולא מחווט ל-build של האפליקציה. הרצה ידנית:
//   node tools/lexicon-build/build.mjs [--fresh] [--tag-only|--expand-only] [--limit N]
//
// שלבים:
//   tag    — תיוג כל הלממות הקיימות ב-SYNONYMS_LEXICON (~5.7k)
//   expand — הרחבה: (א) מילים נרדפות שאינן לממות (מקור חינמי, כבר מסונן);
//            (ב) רשימת התדירות tools/synonyms-build/wordlists/he-top15k.txt;
//            (ג) רשימות-ליבה מ-Flash לפי תחומים אקדמיים. יעד: ~20k לממות.
//
// checkpoint.json שומר גם את התוצר וגם אילו אצוות הושלמו — עצירה/המשך בטוחים.
// ============================================================================
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import {
  HEBREW_WORD_RE,
  STOP_WORDS,
  exists,
  sleep,
  stripNikud,
  normalizeLemmaKey,
  stripJsonFences,
  resolveGeminiApiKey,
  callGemini,
} from '../synonyms-build/lib.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(DIR, '..', '..');

const CHECKPOINT_PATH = path.join(DIR, 'checkpoint.json');
const RAW_JSON_PATH = path.join(DIR, 'lexicon-tagged.json');
const OUTPUT_MODULE_PATH = path.join(PROJECT, 'src', 'services', 'hebrewLexicon.data.js');
const SYNONYMS_MODULE_PATH = path.join(PROJECT, 'src', 'services', 'synonymsLexicon.data.js');
const TOP15K_PATH = path.join(PROJECT, 'tools', 'synonyms-build', 'wordlists', 'he-top15k.txt');

const BATCH_SIZE = 40;
const TARGET_LEMMAS = 20000;

// ── CLI ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const FLAGS = {
  fresh: argv.includes('--fresh'),
  tagOnly: argv.includes('--tag-only'),
  expandOnly: argv.includes('--expand-only'),
  wordlist: (() => {
    const idx = argv.indexOf('--wordlist');
    return idx !== -1 ? argv[idx + 1] : null;
  })(),
  limit: (() => {
    const idx = argv.indexOf('--limit');
    if (idx === -1) return Infinity;
    const n = Number(argv[idx + 1]);
    return Number.isFinite(n) && n > 0 ? n : Infinity;
  })(),
};

// ── סכמת הערך הקומפקטית ───────────────────────────────────────────────────
// lemma -> [pos, g, n, reg, root, binyan, plural, construct]
//   pos:    v=פועל n=שם-עצם a=שם-תואר d=תואר-פועל c=קישור p=יחס x=אחר
//   g:      m/f/b (b=דו-מיני) או null
//   n:      s/p או null
//   reg:    1=דיבורי 2=תקני 3=גבוה
//   root:   אותיות השורש ללא מפרידים ("כתב"), null לשאינו-גזור
//   binyan: 1=פעל 2=נפעל 3=פיעל 4=פועל 5=הפעיל 6=הופעל 7=התפעל, null
//   plural: צורת ריבוי מלאה (שמות/תארים), null
//   construct: צורת נסמך יחיד (שמות), null
// nulls בזנב נחתכים בכתיבה כדי לחסוך בגודל.
const POS_SET = new Set(['v', 'n', 'a', 'd', 'c', 'p', 'x']);

function buildTagPrompt(words) {
  return `להלן רשימת מילים בעברית (צורת בסיס/למה): ${words.join(', ')}.
עבור כל מילה החזר אובייקט תיוג דקדוקי:
- "p": חלק דיבר — "v" פועל (הלמה בעבר נסתר), "n" שם עצם, "a" שם תואר, "d" תואר פועל, "c" מילת קישור/חיבור, "p" מילת יחס, "x" אחר.
- "g": מין דקדוקי לשמות עצם/תואר — "m" זכר, "f" נקבה, "b" דו-מיני. לפועל/אחר: null.
- "n": מספר של צורת הבסיס — "s" יחיד, "p" רבים (למשל "מים"). אם לא רלוונטי: null.
- "r": משלב — 1 דיבורי, 2 תקני/אקדמי, 3 ספרותי-גבוה.
- "sh": השורש (אותיות בלבד, בלי מקפים, למשל "כתב"). למילה שאינה גזורה משורש (מילות יחס, שאולות): null.
- "b": בניין לפעלים בלבד — 1 פעל, 2 נפעל, 3 פיעל, 4 פועל, 5 הפעיל, 6 הופעל, 7 התפעל. לא-פועל: null.
  דוגמאות בניין: כתב→1, נכנס→2, ציין→3, שופר→4, הסביר→5, הוצג→6, התפתח→7.
  אם הלמה בצורת הווה או שם-פועל (מהווה, לציין) — קבע שורש ובניין לפי צורת העבר נסתר (היווה→3, ציין→3).
- "pl": צורת הריבוי המלאה לשמות עצם ותואר (זכר אם דו-מיני). אין ריבוי או לא רלוונטי: null.
- "cs": צורת הנסמך ביחיד לשמות עצם (למשל "בית"→"בית", "שנה"→"שנת"). לא רלוונטי: null.
דיוק חשוב מכמות: אם אינך בטוח בשדה — החזר null באותו שדה. אל תנחש שורש או ריבוי.
החזר אך ורק JSON תקין:
{"מילה1": {"p":"n","g":"f","n":"s","r":2,"sh":"ספר","b":null,"pl":"ספריות","cs":"ספריית"}, ...}`;
}

const EXPAND_DOMAINS = [
  'אוצר מילים אקדמי כללי — פעלים ושמות עצם של טיעון, ניתוח והסקה',
  'מתודולוגיה של מחקר — מדגם, משתנה, מהימנות, תוקף, הליך',
  'פסיכולוגיה ומדעי ההתנהגות',
  'סוציולוגיה, חברה ומדיניות ציבורית',
  'חינוך והוראה',
  'משפטים — מונחי יסוד בכתיבה משפטית',
  'כלכלה ומנהל עסקים',
  'היסטוריה ומדעי הרוח',
  'תקשורת ומדיה',
  'מדעי המדינה ויחסים בינלאומיים',
  'עבודה סוציאלית ובריאות הנפש',
  'רפואה ומדעי הבריאות — מונחים בשימוש כללי',
  'טכנולוגיה ומערכות מידע — מונחים בשימוש כללי',
  'פעלים כלליים שימושיים בכתיבה עיונית (לכל הבניינים)',
  'שמות תואר שכיחים בכתיבה עיונית',
  'תוארי פועל ומילות אופן שכיחים',
];

function buildExpandListPrompt(topic) {
  return `צור רשימה של 120 לממות (צורות בסיס) בעברית מהתחום: "${topic}".
פעלים בעבר נסתר, שמות עצם ביחיד, שמות תואר בזכר יחיד. ללא ניקוד, ללא כפילויות, ללא שמות פרטיים.
החזר אך ורק JSON: מערך שטוח של מחרוזות.`;
}

// ── נרמול תשובת תיוג ──────────────────────────────────────────────────────
function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const pos = POS_SET.has(raw.p) ? raw.p : null;
  if (!pos) return null;
  const g = ['m', 'f', 'b'].includes(raw.g) ? raw.g : null;
  const n = ['s', 'p'].includes(raw.n) ? raw.n : null;
  const reg = [1, 2, 3].includes(raw.r) ? raw.r : 2;
  let root = typeof raw.sh === 'string' ? stripNikud(raw.sh).replace(/["'\s-]/g, '') : null;
  if (root && (!HEBREW_WORD_RE.test(root) || root.length < 2 || root.length > 4)) root = null;
  const binyan = Number.isInteger(raw.b) && raw.b >= 1 && raw.b <= 7 ? raw.b : null;
  let plural = typeof raw.pl === 'string' ? normalizeLemmaKey(raw.pl) : null;
  if (plural && !HEBREW_WORD_RE.test(plural.replace(/\s+/g, ''))) plural = null;
  let construct = typeof raw.cs === 'string' ? normalizeLemmaKey(raw.cs) : null;
  if (construct && !HEBREW_WORD_RE.test(construct.replace(/\s+/g, ''))) construct = null;
  const arr = [pos, g, n, reg, root, pos === 'v' ? binyan : null, plural, construct];
  // חיתוך nulls בזנב — חוסך מגה-בייטים על 20k ערכים.
  while (arr.length && (arr[arr.length - 1] === null || arr[arr.length - 1] === undefined)) arr.pop();
  return arr;
}

function parseBatchResponse(text) {
  try {
    const parsed = JSON.parse(stripJsonFences(text));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    console.warn(`  JSON parse failed: ${e.message}`);
    return null;
  }
}

// ── איסוף מועמדים ─────────────────────────────────────────────────────────
async function loadSynonymsLexicon() {
  const mod = await import(pathToFileURL(SYNONYMS_MODULE_PATH).href);
  return mod.SYNONYMS_LEXICON || {};
}

function collectSynonymCandidates(synLex, known) {
  // כל מילה נרדפת בת מילה אחת שאינה לממה קיימת — מועמדת חינמית ומסוננת-כבר.
  const out = new Set();
  for (const senses of Object.values(synLex)) {
    for (const [synonyms] of senses) {
      for (const s of synonyms) {
        const w = normalizeLemmaKey(s);
        if (!w || known.has(w) || STOP_WORDS.has(w)) continue;
        if (!HEBREW_WORD_RE.test(w)) continue; // מילה אחת בלבד, עברית בלבד
        if (w.length < 2) continue;
        out.add(w);
      }
    }
  }
  return [...out];
}

async function collectWordlistCandidates(known) {
  if (!(await exists(TOP15K_PATH))) return [];
  const raw = await readFile(TOP15K_PATH, 'utf8');
  return [...new Set(raw.split('\n')
    .map((l) => normalizeLemmaKey(l.trim()))
    .filter((w) => w && !w.startsWith('#') && HEBREW_WORD_RE.test(w) && w.length >= 2 && !known.has(w) && !STOP_WORDS.has(w)))];
}

// ── checkpoint ─────────────────────────────────────────────────────────────
async function loadCheckpoint() {
  if (FLAGS.fresh) return { done: [], lexicon: {}, expandWords: null };
  if (!(await exists(CHECKPOINT_PATH))) return { done: [], lexicon: {}, expandWords: null };
  try {
    const parsed = JSON.parse(await readFile(CHECKPOINT_PATH, 'utf8'));
    return {
      done: Array.isArray(parsed.done) ? parsed.done : [],
      lexicon: parsed.lexicon || {},
      expandWords: Array.isArray(parsed.expandWords) ? parsed.expandWords : null,
    };
  } catch (e) {
    console.warn('checkpoint load failed, starting fresh:', e.message);
    return { done: [], lexicon: {}, expandWords: null };
  }
}
const saveCheckpoint = (state) => writeFile(CHECKPOINT_PATH, JSON.stringify(state), 'utf8');

// מזהה אצווה יציב לקובץ wordlist — ריצה חוזרת עם אותו קובץ ממשיכה מה-checkpoint.
function djb2Suffix(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return (h >>> 0).toString(16).slice(0, 6);
}

// ── פלט ────────────────────────────────────────────────────────────────────
async function writeOutputs(lexicon) {
  await writeFile(RAW_JSON_PATH, JSON.stringify(lexicon, null, 1), 'utf8');
  const header = `// קובץ שנוצר אוטומטית ע"י tools/lexicon-build/build.mjs — לא לערוך ידנית.\n` +
    `// מבנה: lemma -> [pos, g, n, reg, root, binyan, plural, construct] (nulls בזנב נחתכו)\n` +
    `// pos: v/n/a/d/c/p/x · g: m/f/b · n: s/p · reg: 1-3 · binyan: 1-7 (פעל..התפעל)\n`;
  const body = `export const HEBREW_LEXICON = ${JSON.stringify(lexicon)};\nexport const HEBREW_LEXICON_VERSION = 1;\n`;
  await writeFile(OUTPUT_MODULE_PATH, header + body, 'utf8');

  const total = Object.keys(lexicon).length;
  const byPos = {};
  let withRoot = 0;
  for (const entry of Object.values(lexicon)) {
    byPos[entry[0]] = (byPos[entry[0]] || 0) + 1;
    if (entry[4]) withRoot += 1;
  }
  const { stat } = await import('node:fs/promises');
  const st = await stat(OUTPUT_MODULE_PATH);
  console.log('\n── summary ──────────────────────────────────');
  console.log(`  lemmas: ${total}  (target ${TARGET_LEMMAS})`);
  console.log(`  by pos: ${JSON.stringify(byPos)}`);
  console.log(`  with root: ${withRoot}`);
  console.log(`  output: ${OUTPUT_MODULE_PATH} (${(st.size / 1024).toFixed(1)} KB)`);
}

// ── main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('tools/lexicon-build/build.mjs');
  const { key: apiKey, source } = await resolveGeminiApiKey();
  if (!apiKey) {
    console.error('No Gemini API key found (env / WORDAI_CFG / DPAPI / keys.local.json).');
    process.exit(1);
  }
  console.log(`API key resolved ✓ (${source})`);

  const state = await loadCheckpoint();
  const doneSet = new Set(state.done);
  const lexicon = state.lexicon;
  if (doneSet.size) console.log(`resuming: ${doneSet.size} batch(es) done, ${Object.keys(lexicon).length} lemmas so far`);

  const synLex = await loadSynonymsLexicon();
  const synLemmas = Object.keys(synLex).map(normalizeLemmaKey).filter(Boolean);
  console.log(`synonyms lexicon: ${synLemmas.length} lemmas`);

  const batches = [];

  // שלב 1: תיוג הלממות הקיימות
  if (!FLAGS.expandOnly) {
    const untagged = synLemmas.filter((w) => !lexicon[w] && HEBREW_WORD_RE.test(w));
    for (let i = 0; i < untagged.length; i += BATCH_SIZE) {
      batches.push({ id: `tag_${i / BATCH_SIZE}`, words: untagged.slice(i, i + BATCH_SIZE) });
    }
  }

  // שלב 2: הרחבה עד היעד
  if (!FLAGS.tagOnly) {
    const known = new Set([...synLemmas, ...Object.keys(lexicon)]);

    // (א+ב) מועמדים דטרמיניסטיים — נרדפות + רשימת תדירות
    const fromSynonyms = collectSynonymCandidates(synLex, known);
    fromSynonyms.forEach((w) => known.add(w));
    const fromWordlist = await collectWordlistCandidates(known);
    fromWordlist.forEach((w) => known.add(w));
    console.log(`expand candidates: ${fromSynonyms.length} from synonyms, ${fromWordlist.length} from he-top15k`);

    // (ג) רשימות-ליבה מ-Flash — פעם אחת, נשמר ב-checkpoint
    let flashWords = state.expandWords;
    if (!flashWords) {
      flashWords = [];
      for (const topic of EXPAND_DOMAINS) {
        try {
          const text = await callGemini(apiKey, buildExpandListPrompt(topic));
          const arr = JSON.parse(stripJsonFences(text));
          if (Array.isArray(arr)) {
            for (const w0 of arr) {
              const w = normalizeLemmaKey(w0);
              if (w && HEBREW_WORD_RE.test(w) && w.length >= 2 && !known.has(w) && !STOP_WORDS.has(w)) {
                flashWords.push(w);
                known.add(w);
              }
            }
          }
          console.log(`  domain list "${topic.slice(0, 30)}…": +${flashWords.length} cumulative`);
        } catch (e) {
          console.warn(`  domain list failed: ${e.message}`);
        }
        await sleep(1000);
      }
      state.expandWords = flashWords;
      await saveCheckpoint({ done: [...doneSet], lexicon, expandWords: flashWords });
    }

    const room = Math.max(0, TARGET_LEMMAS - synLemmas.length - Object.keys(lexicon).length
      + synLemmas.filter((w) => lexicon[w]).length);
    const expandPool = [...fromSynonyms, ...fromWordlist, ...flashWords].slice(0, Math.max(room, 0) + 4000);
    for (let i = 0; i < expandPool.length; i += BATCH_SIZE) {
      batches.push({ id: `exp_${i / BATCH_SIZE}`, words: expandPool.slice(i, i + BATCH_SIZE) });
    }
  }

  // מקור חיצוני: קובץ רשימת מילים (מ-gen-expansion.mjs או כל מקור אחר).
  if (FLAGS.wordlist) {
    const known = new Set([...synLemmas, ...Object.keys(lexicon)]);
    let words = [];
    try {
      const raw = await readFile(FLAGS.wordlist, 'utf8');
      words = [...new Set(raw.split('\n')
        .map((l) => normalizeLemmaKey(l.trim()))
        .filter((w) => w && !w.startsWith('#') && HEBREW_WORD_RE.test(w) && w.length >= 2 && !known.has(w) && !STOP_WORDS.has(w)))];
    } catch (e) {
      console.error(`wordlist read failed: ${e.message}`);
      process.exit(1);
    }
    console.log(`external wordlist: ${words.length} new candidates`);
    for (let i = 0; i < words.length; i += BATCH_SIZE) {
      batches.push({ id: `wl_${djb2Suffix(FLAGS.wordlist)}_${i / BATCH_SIZE}`, words: words.slice(i, i + BATCH_SIZE) });
    }
  }

  const pending = batches.filter((b) => !doneSet.has(b.id));
  const limited = pending.slice(0, Math.min(pending.length, FLAGS.limit));
  console.log(`batches: ${batches.length} total, ${pending.length} pending${limited.length !== pending.length ? `, limited to ${limited.length}` : ''}`);

  let processed = 0;
  for (const batch of limited) {
    if (Object.keys(lexicon).length >= TARGET_LEMMAS && batch.id.startsWith('exp_')) {
      console.log('target reached — stopping expansion');
      break;
    }
    processed += 1;
    console.log(`[${batch.id}] ${batch.words.length} words (${Object.keys(lexicon).length} tagged so far)`);
    try {
      const text = await callGemini(apiKey, buildTagPrompt(batch.words));
      const parsed = parseBatchResponse(text);
      if (parsed) {
        let added = 0;
        for (const [rawLemma, rawEntry] of Object.entries(parsed)) {
          const lemma = normalizeLemmaKey(rawLemma);
          if (!lemma || !HEBREW_WORD_RE.test(lemma.replace(/\s+/g, ''))) continue;
          const entry = normalizeEntry(rawEntry);
          if (!entry) continue;
          if (!lexicon[lemma]) added += 1;
          lexicon[lemma] = entry;
        }
        console.log(`  merged ✓ (+${added})`);
      } else {
        console.warn('  skipped (unparseable)');
      }
    } catch (e) {
      console.warn(`  batch failed: ${e.message}`);
    }
    doneSet.add(batch.id);
    await saveCheckpoint({ done: [...doneSet], lexicon, expandWords: state.expandWords });
    await sleep(1000);
  }

  console.log(`processed ${processed} batch(es) this run.`);
  await writeOutputs(lexicon);
  console.log('done.');
}

main().catch((e) => { console.error('fatal:', e); process.exit(1); });
