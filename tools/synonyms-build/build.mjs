// ============================================================================
// tools/synonyms-build/build.mjs
//
// One-time OFFLINE generator for a Hebrew synonyms lexicon. Calls Gemini in
// batches (seed words extracted from local corpora + fixed domain prompts),
// merges the results, and writes:
//   - tools/synonyms-build/lexicon.json          (raw merged JSON, pretty)
//   - src/services/synonymsLexicon.data.js       (compact JS module, used at runtime)
//
// This script does NOT run automatically and is NOT wired into the app build.
// Run it by hand:
//   node tools/synonyms-build/build.mjs [--fresh] [--seed-only|--domains-only] [--limit N]
//
// See tools/synonyms-build/README.md for details and resume behavior.
// ============================================================================
import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import path from 'node:path';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(DIR, '..', '..');

const CHECKPOINT_PATH = path.join(DIR, 'checkpoint.json');
const LEXICON_JSON_PATH = path.join(DIR, 'lexicon.json');
const OUTPUT_MODULE_PATH = path.join(PROJECT, 'src', 'services', 'synonymsLexicon.data.js');
const LOCAL_KEYS_PATH = path.join(DIR, '..', 'test-bench', 'keys.local.json');

const MODEL = 'gemini-2.5-flash';
const GENAI_ENDPOINT = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;

// ── CLI args ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const FLAGS = {
  fresh: argv.includes('--fresh'),
  seedOnly: argv.includes('--seed-only'),
  domainsOnly: argv.includes('--domains-only'),
  core: argv.includes('--core'),
  limit: (() => {
    const idx = argv.indexOf('--limit');
    if (idx === -1) return Infinity;
    const n = Number(argv[idx + 1]);
    return Number.isFinite(n) && n > 0 ? n : Infinity;
  })(),
};

const exists = async (p) => { try { await access(p); return true; } catch { return false; } };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const run = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { ...opts, shell: true });
  let out = '', err = '';
  p.stdout?.on('data', (d) => { out += d; });
  p.stderr?.on('data', (d) => { err += d; });
  p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err || out || `exit ${code}`))));
  p.on('error', reject);
});

// ── 1. API key resolution ────────────────────────────────────────────────
// Precedence (same pattern as tools/test-bench/server.mjs):
//   1. env GEMINI_API_KEY / GOOGLE_API_KEY
//   2. env WORDAI_CFG (JSON string, provider-config shape)
//   3. DPAPI-decrypt %APPDATA%/com.wordai.assistant/ai-provider-config.json
//   4. tools/test-bench/keys.local.json

async function decryptDpapiFile(fileName) {
  const filePath = path.join(process.env.APPDATA || '', 'com.wordai.assistant', fileName);
  try {
    const raw = await readFile(filePath);
    const magic = Buffer.from('DPAPI1\n', 'ascii');
    if (!raw.subarray(0, magic.length).equals(magic)) throw new Error('unexpected secure-file header');
  } catch (e) {
    console.warn(`DPAPI read failed (${fileName}):`, e.message);
    return '';
  }
  // ה-blob המוצפן גדול ממגבלת שורת הפקודה של cmd — לכן PowerShell קורא את הקובץ
  // בעצמו במקום לקבל את ה-base64 כארגומנט.
  const ps = [
    'Add-Type -AssemblyName System.Security',
    `$raw=[IO.File]::ReadAllBytes(${JSON.stringify(filePath)})`,
    '$blob=$raw[7..($raw.Length-1)]',
    '$dec=[Security.Cryptography.ProtectedData]::Unprotect($blob,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)',
    '[Console]::Out.Write([Text.Encoding]::UTF8.GetString($dec))',
  ].join('\n');
  const encoded = Buffer.from(ps, 'utf16le').toString('base64');
  try {
    const out = await run('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]);
    return out.trim();
  } catch (e) {
    console.warn(`DPAPI decrypt failed (${fileName}):`, e.message);
    return '';
  }
}

function extractGeminiKeyFromConfigJson(raw) {
  if (!raw) return '';
  let parsed;
  try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return ''; }
  const source = parsed?.providerConfig || parsed?.aiProviderConfig || parsed?.ai_provider_config || parsed;
  const direct = source?.gemini;
  if (typeof direct === 'string') return direct.trim();
  if (direct && typeof direct === 'object') {
    const key = String(direct.key || direct.apiKey || '').trim();
    if (key) return key;
  }
  const envKey = source?.GEMINI_API_KEY || source?.GOOGLE_API_KEY;
  if (envKey) return String(envKey).trim();
  return '';
}

async function readLocalKeysGeminiKey() {
  if (!(await exists(LOCAL_KEYS_PATH))) return '';
  try {
    const raw = await readFile(LOCAL_KEYS_PATH, 'utf8');
    return extractGeminiKeyFromConfigJson(raw);
  } catch (e) {
    console.warn('keys.local.json load failed:', e.message);
    return '';
  }
}

async function resolveGeminiApiKey() {
  if (process.env.GEMINI_API_KEY) return { key: process.env.GEMINI_API_KEY.trim(), source: 'env GEMINI_API_KEY' };
  if (process.env.GOOGLE_API_KEY) return { key: process.env.GOOGLE_API_KEY.trim(), source: 'env GOOGLE_API_KEY' };
  if (process.env.WORDAI_CFG) {
    const key = extractGeminiKeyFromConfigJson(process.env.WORDAI_CFG);
    if (key) return { key, source: 'env WORDAI_CFG' };
  }
  const dpapiJson = await decryptDpapiFile('ai-provider-config.json');
  if (dpapiJson) {
    const key = extractGeminiKeyFromConfigJson(dpapiJson);
    if (key) return { key, source: 'app encrypted config (DPAPI)' };
  }
  const localKey = await readLocalKeysGeminiKey();
  if (localKey) return { key: localKey, source: 'keys.local.json' };
  return { key: '', source: 'missing' };
}

// ── 2. Seed word collection from local corpora ───────────────────────────
// Copied from src/services/styleAuthenticityService.js:37
const STOP_WORDS = new Set(['של', 'על', 'עם', 'זה', 'זאת', 'היא', 'הוא', 'הם', 'הן', 'אני', 'אתה', 'את', 'אנחנו', 'גם', 'אבל', 'או', 'אם', 'כי', 'כל', 'לא', 'כן', 'כך', 'מאוד', 'עוד', 'רק', 'כדי', 'היה', 'היו', 'יש', 'אין', 'אל', 'מן', 'אלו', 'אלה', 'אשר', 'כאשר', 'בין', 'לפי', 'תוך', 'אצל', 'מתוך', 'בו', 'בה', 'בהם']);

const SAMPLE_FILES = [
  path.join(PROJECT, 'tools', 'detector-train', 'samples', 'human.txt'),
  path.join(PROJECT, 'tools', 'detector-train', 'samples', 'ai.txt'),
];

const NIKUD_RE = /[֑-ׇ]/g;
const HEBREW_WORD_RE = /^[א-ת]+$/;

function stripNikud(s) {
  return String(s || '').replace(NIKUD_RE, '');
}

function normalizeLemmaKey(s) {
  return stripNikud(String(s || '')).trim();
}

async function collectSeedWordsFromSamples(topN = 800) {
  const freq = new Map();
  for (const file of SAMPLE_FILES) {
    if (!(await exists(file))) {
      console.warn(`sample file missing, skipping: ${file}`);
      continue;
    }
    const raw = await readFile(file, 'utf8');
    // blocks are separated by lines of "===" — irrelevant to tokenizing, we just
    // strip punctuation and split on whitespace across the whole file.
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
  const seen = new Set();
  const out = [];
  for (const [word] of sorted) {
    if (seen.has(word)) continue;
    seen.add(word);
    out.push(word);
    if (out.length >= topN) break;
  }
  return out;
}

// ── 3. Domain prompts (fixed, generate synonyms directly without seed words) ─
const DOMAIN_TOPICS = [
  'כתיבה אקדמית — מילות מעבר ומחברים (לפיכך, יתרה מכך, וכו׳)',
  'כתיבה משפטית — מונחים ופעלים נפוצים בכתבי טענות',
  'רגשות — שמות תואר ופעלים המתארים רגש',
  'פעלי תנועה (הלך, רץ, נכנס, עלה וכו׳)',
  'פעלי דיבור (אמר, טען, ציין, הסביר וכו׳)',
  'פעלי חשיבה (חשב, האמין, שיער, הניח וכו׳)',
  'שמות תואר לגודל וכמות (גדול, קטן, רב, מעט וכו׳)',
  'שמות תואר לאיכות (טוב, גרוע, מצוין, חלש וכו׳)',
  'ביטויי זמן (לאחרונה, בעבר, כעת, בעתיד וכו׳)',
  'מילות קישור סיבתיות (בגלל, מכיוון ש, כתוצאה מכך וכו׳)',
  'מילים לתיאור חשיבות (חשוב, מהותי, קריטי, שולי וכו׳)',
  'פעלים ושמות עצם לעלייה/גידול (עלה, גדל, התרחב, זינק וכו׳)',
  'פעלים ושמות עצם לירידה/צמצום (ירד, קטן, הצטמצם, נחלש וכו׳)',
  'שם עצם: מצב (מצב, מצב עניינים, נסיבות וכו׳)',
  'שם עצם: תהליך (תהליך, מהלך, שלב, שלבים וכו׳)',
  'שם עצם: גישה/שיטה (גישה, שיטה, אסטרטגיה, דרך פעולה וכו׳)',
  'שם עצם: בעיה/אתגר (בעיה, קושי, אתגר, מכשול וכו׳)',
  'שם עצם: מטרה/יעד (מטרה, יעד, תכלית, כוונה וכו׳)',
  'שם עצם: השפעה/תוצאה (השפעה, תוצאה, השלכה, פועל יוצא וכו׳)',
  'פעלים לשיפור/החמרה (שיפר, החמיר, ייעל, פגע וכו׳)',
  'פעלים ליצירה/בנייה (יצר, בנה, פיתח, גיבש וכו׳)',
  'שמות תואר לתיאור אנשים (חכם, אמין, מנוסה, מקצועי וכו׳)',
  'ביטויי הסכמה/אי-הסכמה (מסכים, חולק, תומך, מתנגד וכו׳)',
  'מילים לתיאור ודאות/ספק (ודאי, סביר, ייתכן, מוטל בספק וכו׳)',
  'שם עצם: קשר/מערכת יחסים (קשר, יחס, זיקה, מתאם וכו׳)',
];

function buildDomainPrompt(topic) {
  return `צור רשימה של כ-40 מילים נפוצות בעברית מהתחום הבא: "${topic}".
עבור כל מילה, תן מערך של "senses" (משמעויות אפשריות). כל sense הוא אובייקט עם שני שדות:
- "s": מערך של 2 עד 6 מילים נרדפות באותו רגיסטר ואותו חלק דיבור (עדיפות למילה בודדת, לא צירוף).
- "c": מערך של 3 עד 6 מילות הקשר בעברית שמעידות על המשמעות הזו (context keywords).
דלג על מילים שאין להן נרדפות טובות.
החזר אך ורק JSON תקין (בלי טקסט נוסף, בלי גדרות קוד) במבנה:
{"מילה1": [{"s": ["נרדף1","נרדף2"], "c": ["הקשר1","הקשר2","הקשר3"]}], "מילה2": [...]}`;
}

function buildSeedPrompt(words) {
  return `להלן רשימת מילים בעברית: ${words.join(', ')}.
עבור כל מילה מהרשימה (בצורת הבסיס/למה שלה), אם יש לה מילים נרדפות טובות, תן מערך של "senses" (משמעויות אפשריות).
כל sense הוא אובייקט עם שני שדות:
- "s": מערך של 2 עד 6 מילים נרדפות באותו רגיסטר ואותו חלק דיבור (עדיפות למילה בודדת, לא צירוף).
- "c": מערך של 3 עד 6 מילות הקשר בעברית שמעידות על המשמעות הזו (context keywords).
דלג לגמרי על מילים שאין להן נרדפות טובות (אל תכלול אותן ב-JSON).
החזר אך ורק JSON תקין (בלי טקסט נוסף, בלי גדרות קוד) במבנה:
{"מילה1": [{"s": ["נרדף1","נרדף2"], "c": ["הקשר1","הקשר2","הקשר3"]}], "מילה2": [...]}`;
}

const SEED_BATCH_SIZE = 25;

// ── 4. Gemini call with retry ─────────────────────────────────────────────
function stripJsonFences(text) {
  return String(text || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/```\s*$/, '')
    .trim();
}

async function callGemini(apiKey, prompt, { retried = false } = {}) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 32768, responseMimeType: 'application/json' },
  };
  let res;
  try {
    res = await fetch(GENAI_ENDPOINT(apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (!retried) { await sleep(20000); return callGemini(apiKey, prompt, { retried: true }); }
    throw e;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if ((res.status === 429 || res.status >= 500) && !retried) {
      console.warn(`  HTTP ${res.status} — retrying once after 20s backoff`);
      await sleep(20000);
      return callGemini(apiKey, prompt, { retried: true });
    }
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  return text;
}

function parseBatchResponse(text) {
  const cleaned = stripJsonFences(text);
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return null;
  } catch (e) {
    console.warn(`  JSON parse failed: ${e.message} (first 200 chars: ${cleaned.slice(0, 200)})`);
    return null;
  }
}

// ── 5. Merge logic ────────────────────────────────────────────────────────
function countWordsInPhrase(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean).length;
}

function normalizeSense(lemma, sense) {
  if (!sense || typeof sense !== 'object') return null;
  const synonymsRaw = Array.isArray(sense.s) ? sense.s : [];
  const contextRaw = Array.isArray(sense.c) ? sense.c : [];
  const lemmaKey = normalizeLemmaKey(lemma);
  const synonyms = [];
  const seen = new Set();
  for (const raw of synonymsRaw) {
    const syn = normalizeLemmaKey(raw);
    if (!syn) continue;
    if (syn === lemmaKey) continue; // drop self-reference
    if (countWordsInPhrase(syn) > 3) continue; // drop overly long phrases
    if (seen.has(syn)) continue;
    seen.add(syn);
    synonyms.push(syn);
  }
  const context = [...new Set(contextRaw.map((c) => normalizeLemmaKey(c)).filter(Boolean))];
  if (!synonyms.length) return null;
  return [synonyms, context];
}

function mergeBatchIntoLexicon(lexicon, batchResult) {
  if (!batchResult) return;
  for (const [rawLemma, rawSenses] of Object.entries(batchResult)) {
    const lemma = normalizeLemmaKey(rawLemma);
    if (!lemma || !HEBREW_WORD_RE.test(lemma.replace(/\s+/g, ''))) continue;
    const sensesArray = Array.isArray(rawSenses) ? rawSenses : [rawSenses];
    const normalized = sensesArray.map((s) => normalizeSense(lemma, s)).filter(Boolean);
    if (!normalized.length) continue;
    if (!lexicon[lemma]) lexicon[lemma] = [];
    for (const [synonyms, context] of normalized) {
      // If a sense with heavily overlapping synonyms already exists, merge into it
      // instead of adding a near-duplicate sense.
      const existing = lexicon[lemma].find((existingSense) => {
        const [existingSyns] = existingSense;
        const overlap = existingSyns.filter((s) => synonyms.includes(s)).length;
        return overlap >= Math.min(2, Math.ceil(synonyms.length / 2));
      });
      if (existing) {
        const [existingSyns, existingCtx] = existing;
        existing[0] = [...new Set([...existingSyns, ...synonyms])];
        existing[1] = [...new Set([...existingCtx, ...context])];
      } else {
        lexicon[lemma].push([synonyms, context]);
      }
    }
  }
}

// ── 6. Checkpointing ───────────────────────────────────────────────────────
async function loadCheckpoint() {
  if (FLAGS.fresh) return { done: [], lexicon: {} };
  if (!(await exists(CHECKPOINT_PATH))) return { done: [], lexicon: {} };
  try {
    const raw = await readFile(CHECKPOINT_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return { done: Array.isArray(parsed.done) ? parsed.done : [], lexicon: parsed.lexicon || {} };
  } catch (e) {
    console.warn('checkpoint load failed, starting fresh:', e.message);
    return { done: [], lexicon: {} };
  }
}

async function saveCheckpoint(state) {
  await writeFile(CHECKPOINT_PATH, JSON.stringify(state), 'utf8');
}

// ── 7. Output writers ──────────────────────────────────────────────────────
async function writeOutputs(lexicon) {
  await writeFile(LEXICON_JSON_PATH, JSON.stringify(lexicon, null, 2), 'utf8');

  const header = `// קובץ שנוצר אוטומטית ע"י tools/synonyms-build/build.mjs — לא לערוך ידנית.\n` +
    `// מבנה: lemma -> מערך של senses, כל sense = [ [נרדפות], [מילות הקשר] ]\n`;
  const body = `export const SYNONYMS_LEXICON = ${JSON.stringify(lexicon)};\n`;
  await writeFile(OUTPUT_MODULE_PATH, header + body, 'utf8');

  const lemmaCount = Object.keys(lexicon).length;
  let synonymCount = 0;
  for (const senses of Object.values(lexicon)) {
    for (const [synonyms] of senses) synonymCount += synonyms.length;
  }
  const stat = await import('node:fs/promises').then((m) => m.stat(OUTPUT_MODULE_PATH));
  console.log('');
  console.log('── summary ──────────────────────────────────');
  console.log(`  lemmas:        ${lemmaCount}`);
  console.log(`  total synonyms: ${synonymCount}`);
  console.log(`  output file:    ${OUTPUT_MODULE_PATH} (${(stat.size / 1024).toFixed(1)} KB)`);
  console.log(`  raw json:       ${LEXICON_JSON_PATH}`);
}

// ── 8. Main ─────────────────────────────────────────────────────────────
async function main() {
  console.log(`tools/synonyms-build/build.mjs — model ${MODEL}`);
  const { key: apiKey, source: keySource } = await resolveGeminiApiKey();
  if (!apiKey) {
    console.error('No Gemini API key found. Checked: env GEMINI_API_KEY/GOOGLE_API_KEY, env WORDAI_CFG, ' +
      'DPAPI ai-provider-config.json, tools/test-bench/keys.local.json.');
    process.exit(1);
  }
  console.log(`API key resolved ✓ (${keySource})`);

  // Build batch list: each batch = { id, kind, prompt }
  const batches = [];
  if (!FLAGS.domainsOnly) {
    const seedWords = await collectSeedWordsFromSamples(800);
    console.log(`seed words collected from corpora: ${seedWords.length}`);
    for (let i = 0; i < seedWords.length; i += SEED_BATCH_SIZE) {
      const chunk = seedWords.slice(i, i + SEED_BATCH_SIZE);
      batches.push({ id: `seed_${i / SEED_BATCH_SIZE}`, kind: 'seed', prompt: buildSeedPrompt(chunk) });
    }
  }
  if (!FLAGS.seedOnly) {
    DOMAIN_TOPICS.forEach((topic, idx) => {
      batches.push({ id: `domain_${idx}`, kind: 'domain', prompt: buildDomainPrompt(topic), topic });
    });
  }
  if (FLAGS.core) {
    // מצב השלמת אוצר-ליבה: bootstrap מבקש מהמודל רשימת מילות-ליבה, ואז
    // מייצרים באצ'ים רגילים רק עבור המילים שעדיין חסרות בלקסיקון הקיים.
    const existing = new Set(Object.keys((await loadCheckpoint()).lexicon || {}));
    console.log('core mode: requesting core vocabulary list...');
    let coreWords = [];
    // שתי קריאות של 300 במקום אחת של 600 — תשובות ארוכות נחתכות.
    for (const part of ['הנפוצות ביותר', 'נפוצות נוספות (לא הבסיסיות ביותר, השכבה השנייה)']) {
      const listText = await callGemini(apiKey,
        `צור רשימה של 300 מילים ${part} בעברית כתובה (פעלים בצורת עבר יחיד, שמות עצם ביחיד, שמות תואר בזכר יחיד). ` +
        'החזר JSON בלבד: מערך שטוח של מחרוזות. ללא ניקוד, ללא הסברים.');
      let cleaned = String(listText || '').replace(/```json|```/g, '').trim();
      try {
        let arr;
        try { arr = JSON.parse(cleaned); } catch {
          // תשובה חתוכה: גזור עד המחרוזת השלמה האחרונה וסגור את המערך.
          const lastQuote = cleaned.lastIndexOf('",');
          if (lastQuote > 0) arr = JSON.parse(cleaned.slice(0, lastQuote + 1) + ']');
        }
        if (Array.isArray(arr)) coreWords.push(...arr.map((w) => normalizeLemmaKey(w)).filter((w) => HEBREW_WORD_RE.test(w) && w.length >= 2));
      } catch (e) { console.warn('core list parse failed:', e.message); }
      await sleep(1000);
    }
    const missing = [...new Set(coreWords)].filter((w) => !existing.has(w) && !STOP_WORDS.has(w));
    console.log(`core vocabulary: ${coreWords.length} words, ${missing.length} missing from lexicon`);
    for (let i = 0; i < missing.length; i += SEED_BATCH_SIZE) {
      const chunk = missing.slice(i, i + SEED_BATCH_SIZE);
      batches.push({ id: `core_${i / SEED_BATCH_SIZE}`, kind: 'seed', prompt: buildSeedPrompt(chunk) });
    }
  }

  const limited = batches.slice(0, Math.min(batches.length, FLAGS.limit));
  console.log(`total batches: ${batches.length}${limited.length !== batches.length ? ` (limited to ${limited.length} via --limit)` : ''}`);

  const { done, lexicon } = await loadCheckpoint();
  const doneSet = new Set(done);
  if (doneSet.size) console.log(`resuming: ${doneSet.size} batch(es) already completed (checkpoint found)`);

  let processed = 0;
  for (const batch of limited) {
    if (doneSet.has(batch.id)) continue;
    processed += 1;
    const label = batch.kind === 'domain' ? `domain: ${batch.topic}` : `seed batch ${batch.id}`;
    console.log(`[${batch.id}] ${label}`);
    try {
      const text = await callGemini(apiKey, batch.prompt);
      const parsed = parseBatchResponse(text);
      if (!parsed) {
        console.warn(`  skipped (unparseable response)`);
      } else {
        mergeBatchIntoLexicon(lexicon, parsed);
        console.log(`  merged ✓ (${Object.keys(parsed).length} lemma candidates)`);
      }
    } catch (e) {
      console.warn(`  batch failed: ${e.message}`);
    }
    doneSet.add(batch.id);
    await saveCheckpoint({ done: [...doneSet], lexicon });
    await sleep(1000);
  }

  console.log(`processed ${processed} new batch(es) this run.`);
  await writeOutputs(lexicon);
  console.log('done.');
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
