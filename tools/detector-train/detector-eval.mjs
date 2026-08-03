// detector-eval.mjs — רתמת הערכה לגלאי הכתיבה-האנושית (styleAuthenticityService).
//
//   node tools/detector-train/detector-eval.mjs
//
// מודד את הגלאי המקומי (extractor.mjs — מראה verbatim של הליבה, ר' ההערה שם) על
// שלושה מקורות קורפוס:
//   1. עבודות אמיתיות של המשתמש (אנושי) — מפוצלות לחלונות של ~150-300 מילים,
//      **ברמת מסמך** (לא חלון) כדי שפיצול train/test לא ידלוף בין חלונות אחים.
//   2. tools/detector-train/samples/human.txt — בלוקים אנושיים מתויגים.
//   3. tools/detector-train/samples/ai.txt (+ ai-extended.txt אם קיים) — בלוקי AI.
//
// אין כאן מודל מאומן — ה-split ל-train/test נשמר לכיול עתידי; המדדים בפועל
// מחושבים על ה-TEST בלבד (וגם על הקורפוס המלא, לצורך התייחסות).
//
// שער איכות על עבודות המשתמש (usable): ≥250 מילים, ≥60% תווים עבריים, ג'יבריש
// מסונן (pureTokenRatio), דה-דופ גרסאות כמעט-זהות — אותה נוסחה כמו style-eval.mjs.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractAuthenticityFeatures, computeSignals, scoreFromSignals, DEFAULT_WEIGHTS, DEFAULT_THRESHOLD } from './extractor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// ברירת המחדל בייצור (ר' DEFAULT_THRESHOLD ב-extractor.mjs). 60 נשאר כקו-ייחוס
// משני — הסף הישן, לפני העברת ngramGeneric לתקרת ההליך הרגיל (0.65) והזזת הסף.
const THRESHOLD = DEFAULT_THRESHOLD;
const LEGACY_THRESHOLD = 60;
const SEED = 42;

// ---------- עזרים כלליים ----------

// פענוח ישויות HTML — אותה נוסחה כמו length-bias-check.mjs (הדגימות עלולות
// להישמר עם &quot; במקום גרשיים אמיתיים).
const decodeEntities = (s) => String(s)
  .replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

const scoreText = (rawText) => {
  const text = decodeEntities(rawText);
  const f = extractAuthenticityFeatures(text);
  return { words: f.wordCount, score: scoreFromSignals(computeSignals(f), DEFAULT_WEIGHTS) };
};

// mulberry32 — PRNG דטרמיניסטי בזרע קבוע, לערבול DOCUMENTS לפני חלוקת train/test.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(arr, seed) {
  const rnd = mulberry32(seed);
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// AUC — ההסתברות שדוגמת AI אקראית תדורג ציון גבוה יותר מדוגמת אנושי אקראית.
const aucOf = (humanScores, aiScores) => {
  if (!humanScores.length || !aiScores.length) return NaN;
  let wins = 0;
  for (const h of humanScores) for (const a of aiScores) {
    if (a > h) wins += 1; else if (a === h) wins += 0.5;
  }
  return wins / (humanScores.length * aiScores.length);
};

const percentile = (arr, p) => {
  if (!arr.length) return NaN;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
};
const round1 = (n) => Math.round(n * 10) / 10;

// ---------- מקור 1: עבודות אמיתיות של המשתמש ----------
// ר' style-eval.mjs — אותה נוסחת קורפוס/שער-איכות, מותאמת כאן לחלונות-פרוזה
// (ולא למדידת style fingerprint).

const CORPUS_DIR = process.env.WORDAI_SCAFFOLD_CORPUS
  || path.join(os.homedir(), 'OneDrive', 'שולחן העבודה', '314999533', 'עבודות והגשות', 'עבודות סופיות');

const hebrewRatio = (s) => {
  const letters = String(s || '').match(/[א-תA-Za-z]/g) || [];
  if (!letters.length) return 0;
  return letters.filter((c) => /[א-ת]/.test(c)).length / letters.length;
};

async function readDocx(p) {
  try { return (await mammoth.extractRawText({ buffer: fs.readFileSync(p) })).value || ''; }
  catch { return ''; }
}
async function readPdf(p) {
  try {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(p)), useSystemFonts: true }).promise;
    const parts = [];
    for (let i = 1; i <= Math.min(doc.numPages, 40); i += 1) {
      const c = await (await doc.getPage(i)).getTextContent();
      parts.push(c.items.map((it) => it.str).join(' '));
    }
    try { await doc.destroy(); } catch { /* ignore */ }
    return parts.join('\n\n');
  } catch { return ''; }
}
async function readAny(p) {
  if (/\.docx$/i.test(p)) return readDocx(p);
  if (/\.pdf$/i.test(p)) return readPdf(p);
  return '';
}
function walk(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(docx|pdf)$/i.test(e.name) && !e.name.startsWith('~$')) out.push(full);
  }
  return out;
}

// אותה נוסחת ג'יבריש כמו style-eval.mjs / scaffold-e2e / materialChunkStore.
const PURE_TOKEN_RE = /^[֐-׿]{2,}[.,;:!?'"׳״)]?$|^[A-Za-z]{2,}[.,;:!?'")]?$|^\d+([.,]\d+)?$/;
function pureTokenRatio(text) {
  const tokens = (String(text || '').match(/\S+/g) || []).slice(0, 2000);
  if (tokens.length < 40) return 0;
  return tokens.filter((t) => PURE_TOKEN_RE.test(t)).length / tokens.length;
}
const GARBLE_FLOOR = 0.5;
const MIN_DOC_WORDS = 250;

function wordCountOf(text) {
  return (String(text || '').match(/[֐-׿A-Za-z][֐-׿A-Za-z'"׳״-]*/g) || []).length;
}

// חלוקה לחלונות של ~150-300 מילים: מצטברים פסקאות עד ≥150 מילים, וחותכים
// לפני חריגה מ-~300. חלון מתחת ל-100 מילים בסוף המסמך נזרק.
function windowsOf(text) {
  const paragraphs = String(text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const windows = [];
  let buf = [];
  let bufWords = 0;
  for (const para of paragraphs) {
    const pw = wordCountOf(para);
    if (bufWords > 0 && bufWords + pw > 300) {
      if (bufWords >= 100) windows.push(buf.join('\n\n'));
      buf = [para]; bufWords = pw;
    } else {
      buf.push(para); bufWords += pw;
    }
    if (bufWords >= 150) {
      windows.push(buf.join('\n\n'));
      buf = []; bufWords = 0;
    }
  }
  if (buf.length && bufWords >= 100) windows.push(buf.join('\n\n'));
  return windows;
}

let userDocs = [];
let userDocsMissing = false;
let rejectedGarbled = 0;
if (fs.existsSync(CORPUS_DIR)) {
  const seen = new Set();
  for (const p of walk(CORPUS_DIR)) {
    const text = await readAny(p);
    if (wordCountOf(text) < MIN_DOC_WORDS) continue;
    if (hebrewRatio(text) < 0.6) continue;
    if (pureTokenRatio(text) < GARBLE_FLOOR) { rejectedGarbled += 1; continue; }
    const fp = text.replace(/\s+/g, ' ').trim().slice(0, 400);
    if (seen.has(fp)) continue;
    seen.add(fp);
    userDocs.push({ name: path.basename(p), text });
  }
} else {
  userDocsMissing = true;
}

// ---------- מקור 2/3: דגימות מתויגות (samples/) ----------

function loadTaggedBlocks(file, { withGenreMode = false } = {}) {
  const full = path.join(HERE, 'samples', file);
  if (!fs.existsSync(full)) return null;
  const raw = fs.readFileSync(full, 'utf8');
  const blocks = raw.split(/\r?\n=+\r?\n/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((block, i) => {
    let text = block;
    let mode = 'normal';
    let genre = null;
    if (withGenreMode) {
      const headerMatch = block.match(/^#genre=(\S+)\s+mode=(\S+)\s*\n([\s\S]*)$/);
      if (headerMatch) {
        genre = headerMatch[1];
        mode = headerMatch[2] === 'stealth' ? 'stealth' : 'normal';
        text = headerMatch[3].trim();
      }
    }
    return { name: `${file}#${i}`, text, mode, genre };
  });
}

// ---------- בניית הקורפוס המלא ----------

// מסמכי המשתמש הם DOCUMENTS ברמת קובץ (לפיצול train/test); דגימות ה-samples/
// הן כל אחת "מסמך" בפני עצמו — אין קבוצת חלונות-אחים לדלוף ביניהם.
const humanDocuments = [];
for (const d of userDocs) {
  const wins = windowsOf(d.text).filter((w) => wordCountOf(w) >= 100);
  if (wins.length) humanDocuments.push({ name: d.name, kind: 'user-work', windows: wins.map((w) => ({ text: w, mode: null })) });
}

const humanSampleBlocks = loadTaggedBlocks('human.txt', { withGenreMode: false });
if (humanSampleBlocks) {
  for (const b of humanSampleBlocks) {
    const words = wordCountOf(b.text);
    if (words < 25) continue;
    humanDocuments.push({ name: b.name, kind: 'human-sample', windows: [{ text: b.text, mode: null }] });
  }
} else {
  console.log(`⚠️ ${path.join('samples', 'human.txt')} לא נמצא — מדלגים על דגימות אנושי מתויגות.`);
}

const aiSampleBlocks = loadTaggedBlocks('ai.txt', { withGenreMode: false });
const aiExtendedBlocks = loadTaggedBlocks('ai-extended.txt', { withGenreMode: true });
if (!aiExtendedBlocks) {
  console.log(`ℹ️ ${path.join('samples', 'ai-extended.txt')} עדיין לא קיים — מריצים בלי בלוקי stealth/genre.`);
}

const aiDocuments = [];
if (aiSampleBlocks) {
  for (const b of aiSampleBlocks) {
    const words = wordCountOf(b.text);
    if (words < 25) continue;
    // ⚠️ mode:null בכוונה — ai.txt לא מתויג stealth/normal (בשונה מ-ai-extended.txt),
    // ולכן לא נכנס לפילוח breakdownByMode (שמסנן דווקא לפי mode==='stealth'/'normal').
    aiDocuments.push({ name: b.name, kind: 'ai-sample', windows: [{ text: b.text, mode: null }] });
  }
} else {
  console.log(`⚠️ ${path.join('samples', 'ai.txt')} לא נמצא — אין קורפוס AI כלל.`);
}
if (aiExtendedBlocks) {
  for (const b of aiExtendedBlocks) {
    const words = wordCountOf(b.text);
    if (words < 25) continue;
    aiDocuments.push({ name: b.name, kind: 'ai-extended', windows: [{ text: b.text, mode: b.mode, genre: b.genre }] });
  }
}

if (userDocsMissing) {
  console.log(`⚠️ תיקיית עבודות המשתמש לא נמצאה במכונה הזו: ${CORPUS_DIR}`);
  console.log('   מדלגים לקורפוס דגימות בלבד (samples/human.txt + samples/ai.txt).');
}
if (!humanDocuments.length || !aiDocuments.length) {
  console.log('\n✗ אין מספיק קורפוס לשני המחלקות (אנושי/AI) — אין מה למדוד.');
  process.exit(0);
}

console.log(`קורפוס אנושי: ${userDocs.length} עבודות משתמש (${humanDocuments.filter((d) => d.kind === 'user-work').length} עם חלונות תקינים) + ${humanDocuments.filter((d) => d.kind !== 'user-work').length} דגימות מתויגות | נדחו כג'יבריש: ${rejectedGarbled}`);
console.log(`קורפוס AI: ${aiDocuments.filter((d) => d.kind === 'ai-sample').length} דגימות ai.txt + ${aiDocuments.filter((d) => d.kind === 'ai-extended').length} דגימות ai-extended.txt`);

// ---------- פיצול train/test ברמת מסמך ----------

function splitDocuments(docs, seed) {
  const shuffled = seededShuffle(docs, seed);
  const trainCount = Math.round(shuffled.length * 0.7);
  return { train: shuffled.slice(0, trainCount), test: shuffled.slice(trainCount) };
}

const humanSplit = splitDocuments(humanDocuments, SEED);
const aiSplit = splitDocuments(aiDocuments, SEED + 1); // זרע שונה לכל מחלקה — אין תלות ביניהן.

// ---------- ניקוד ----------

function scoreDocuments(docs) {
  const rows = [];
  for (const d of docs) {
    for (const w of d.windows) {
      const r = scoreText(w.text);
      rows.push({ doc: d.name, kind: d.kind, mode: w.mode || null, genre: w.genre || null, ...r });
    }
  }
  return rows;
}

const humanTestRows = scoreDocuments(humanSplit.test);
const aiTestRows = scoreDocuments(aiSplit.test);
const humanAllRows = scoreDocuments(humanDocuments);
const aiAllRows = scoreDocuments(aiDocuments);

// ---------- מדדים ----------

function computeMetrics(humanRows, aiRows) {
  const humanScores = humanRows.map((r) => r.score);
  const aiScores = aiRows.map((r) => r.score);
  const auc = aucOf(humanScores, aiScores);

  // סף התפעול: אחוזון 95 של ציוני אנושי ⇒ FPR≤5% (5% מהאנושי מדורגים מעליו).
  const operatingThreshold = percentile(humanScores, 95);
  const tprAtFpr5 = aiScores.length ? aiScores.filter((s) => s >= operatingThreshold).length / aiScores.length : NaN;

  const tprAtFixed = aiScores.length ? aiScores.filter((s) => s >= THRESHOLD).length / aiScores.length : NaN;
  const fprAtFixed = humanScores.length ? humanScores.filter((s) => s >= THRESHOLD).length / humanScores.length : NaN;
  // קו-ייחוס משני בסף הישן (60) — להשוואה ישירה מול מספרים היסטוריים מלפני
  // הזזת ברירת-המחדל ל-DEFAULT_THRESHOLD.
  const tprAtLegacy = aiScores.length ? aiScores.filter((s) => s >= LEGACY_THRESHOLD).length / aiScores.length : NaN;
  const fprAtLegacy = humanScores.length ? humanScores.filter((s) => s >= LEGACY_THRESHOLD).length / humanScores.length : NaN;

  const pctOf = (arr) => ({
    p10: percentile(arr, 10), p25: percentile(arr, 25), p50: percentile(arr, 50),
    p75: percentile(arr, 75), p90: percentile(arr, 90),
  });

  return {
    n: { human: humanScores.length, ai: aiScores.length },
    auc: round1(auc * 100) / 100,
    operatingThreshold: round1(operatingThreshold),
    tprAtFpr5: round1(tprAtFpr5 * 100),
    // ⚠️ שינוי שם משדות tprAt60/fprAt60 הישנים: אלה מחושבים כעת בסף ברירת-המחדל
    // הנוכחי (78), לא בקבוע 60 — שם ישן היה מטעה אחרי הזזת הסף. tprAtLegacy60/
    // fprAtLegacy60 הם קו-הייחוס בסף הישן, להשוואה היסטורית.
    tprAtThreshold: round1(tprAtFixed * 100),
    fprAtThreshold: round1(fprAtFixed * 100),
    tprAtLegacy60: round1(tprAtLegacy * 100),
    fprAtLegacy60: round1(fprAtLegacy * 100),
    percentiles: { human: pctOf(humanScores), ai: pctOf(aiScores) },
  };
}

const testMetrics = computeMetrics(humanTestRows, aiTestRows);
const fullMetrics = computeMetrics(humanAllRows, aiAllRows);

// פילוח stealth/normal — רק אם יש בלוקי ai-extended עם mode מתויג.
function breakdownByMode(mode) {
  const aiSubset = aiAllRows.filter((r) => r.mode === mode);
  if (!aiSubset.length) return null;
  return computeMetrics(humanAllRows, aiSubset);
}
const stealthMetrics = breakdownByMode('stealth');
const normalTaggedMetrics = breakdownByMode('normal');

// ---------- דו"ח קונסולה ----------

console.log('\n═══ פיצול train/test (ברמת מסמך, זרע', SEED, ') ═══');
console.log(`  אנושי: ${humanSplit.train.length} train / ${humanSplit.test.length} test מסמכים (${humanTestRows.length} חלונות test)`);
console.log(`  AI:    ${aiSplit.train.length} train / ${aiSplit.test.length} test מסמכים (${aiTestRows.length} חלונות test)`);

function printMetrics(label, m) {
  console.log(`\n═══ ${label} ═══`);
  console.log(`  n = ${m.n.human} אנושי · ${m.n.ai} AI`);
  console.log(`  AUC: ${m.auc}`);
  console.log(`  סף תפעול (אחוזון-95 אנושי, FPR≈5%): ${m.operatingThreshold} → TPR(AI) ${m.tprAtFpr5}%`);
  console.log(`  בסף ברירת-מחדל ${THRESHOLD}: TPR(AI) ${m.tprAtThreshold}% · FPR(אנושי) ${m.fprAtThreshold}%`);
  console.log(`  קו-ייחוס — סף ישן ${LEGACY_THRESHOLD}: TPR(AI) ${m.tprAtLegacy60}% · FPR(אנושי) ${m.fprAtLegacy60}%`);
  console.log(`  אחוזוני ציון — אנושי: p10=${m.percentiles.human.p10} p25=${m.percentiles.human.p25} p50=${m.percentiles.human.p50} p75=${m.percentiles.human.p75} p90=${m.percentiles.human.p90}`);
  console.log(`  אחוזוני ציון — AI:     p10=${m.percentiles.ai.p10} p25=${m.percentiles.ai.p25} p50=${m.percentiles.ai.p50} p75=${m.percentiles.ai.p75} p90=${m.percentiles.ai.p90}`);
}

printMetrics('מדדים — TEST split (30%)', testMetrics);
printMetrics('מדדים — קורפוס מלא (התייחסות בלבד, לא ולידציה)', fullMetrics);

if (stealthMetrics) {
  printMetrics('פילוח AI — mode=stealth', stealthMetrics);
} else {
  console.log('\nℹ️ אין בלוקי AI מתויגים כ-stealth (ai-extended.txt חסר או ריק מהתגית) — מדלגים על הפילוח.');
}
if (normalTaggedMetrics) {
  printMetrics('פילוח AI — mode=normal (מתוך ai-extended.txt בלבד)', normalTaggedMetrics);
}

// ---------- כתיבת eval-results.json ----------

const resultsPath = path.join(HERE, 'eval-results.json');
let history = [];
if (fs.existsSync(resultsPath)) {
  try {
    const prev = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    history = Array.isArray(prev.history) ? prev.history : [];
  } catch { /* קובץ קודם פגום — מתחילים היסטוריה חדשה */ }
}

const entry = {
  ranAt: new Date().toISOString(),
  corpusCounts: {
    userWorkDocs: userDocs.length,
    humanDocuments: humanDocuments.length,
    aiDocuments: aiDocuments.length,
    rejectedGarbled,
    userDocsMissing,
    hasAiExtended: Boolean(aiExtendedBlocks),
  },
  seed: SEED,
  metrics: {
    test: testMetrics,
    full: fullMetrics,
    stealth: stealthMetrics,
    normal: normalTaggedMetrics,
  },
};
history.push(entry);
if (history.length > 20) history = history.slice(history.length - 20);

fs.writeFileSync(resultsPath, JSON.stringify({ ...entry, history }, null, 2), 'utf8');
console.log(`\n✓ נכתב ${resultsPath}`);
