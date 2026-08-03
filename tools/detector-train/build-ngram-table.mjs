// build-ngram-table.mjs — בונה את טבלת ה-3-גרמים (סף התו) לסיגנל ngramGeneric.
//
// למה: המרקרים הקיימים (מחברים פורמליים, קלישאות, מבנה) הם רשימת ביטויים קשיחה —
// AI "מנוקה" מקלישאות (stealth) פשוט לא מכיל אותם, ואז הגלאי עיוור (AUC 0.553 על
// stealth). n-גרמים של תווים לוכדים חתימה **התפלגותית** שקשה הרבה יותר להימנע ממנה
// במודע: תבניות תחיליות/סופיות/רצפי-אותיות שכיחים ב-AI עברי מול כתיבה אנושית,
// באותה שיטה בדיוק כמו סיווג Naive-Bayes קלאסי (LLR + add-k smoothing).
//
// קלט:
//   AI:       samples/ai.txt + samples/ai-extended.txt (בלוקים מופרדי ===, כותרת
//             #genre=... mode=... מוסרת)
//   human:    שני מקורות ממוזגים במשקל (ר' HUMAN_MIX_WEIGHT למטה):
//     • narrative — samples/human-global/*.txt (ויקיפדיה/ויקיטקסט, ~965k מילה) +
//       samples/human.txt.
//     • academic  — 314999533/** (אותו שורש קורפוס כמו tools/test-bench/style-eval.mjs),
//       **לא** כולל 'עבודות והגשות/עבודות סופיות' ולא 'טיוטות וגרסאות קודמות' (אלה
//       כתיבת המשתמש עצמו). מאמרים/חוקות/פילוסופיה פוליטית של מחברים **אחרים**,
//       ברגיסטר אקדמי — בדיוק הרגיסטר שהגלאי שופט בפועל, בשונה מוויקיפדיה הנרטיבית.
//   ⚠️ עבודות המשתמש עצמו (עבודות סופיות) אינן נכנסות לאף מקור אימון — הן קורפוס
//   ולידציה בלבד (ר' שלב הגיזום למטה).
//
// שיטה: LLR(g) = log( P(g|AI) / P_human(g) ), עם add-k=1. P_human הוא תערובת
// משוקללת של שני התת-מקורות (לא שרשור/שכפול טקסט — כל תת-מקור מוחלק בנפרד ואז
// ממוצע במשקל, כך שרגיסטר-מיעוט (academic, קטן בהרבה מ-narrative) לא נבלע).
// דירוג המועמדים: |LLR| × sqrt(תדירות משולבת) — כדי לא לבחור רק גרמים נדירים-קיצוניים.
//
// פלט: src/services/styleAiMarkers.data.js (AI_NGRAM_TABLE.grams + meta עם עוגני-ניקוד).
//
// הרצה: node tools/detector-train/build-ngram-table.mjs
//   WORDAI_NGRAM_DROP_TOP_K=<n>   (ברירת מחדל 300; 0 = בלי שלב הגיזום)
//   WORDAI_SCAFFOLD_CORPUS=<dir>  שורש קורפוס 314999533 (ברירת מחדל: OneDrive/שולחן העבודה/314999533)

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import os from 'node:os';
import mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { charNgrams, tokenizeForStyle } from '../../src/services/styleFingerprintService.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = join(HERE, 'samples');
const OUT_PATH = join(HERE, '..', '..', 'src', 'services', 'styleAiMarkers.data.js');

const MIN_WORDS = 25;
const ACADEMIC_MIN_WORDS = 250; // מסמכים שלמים (docx/pdf), לא בלוקים — סף כמו style-eval/detector-eval.
const MIN_DOC_FREQ = 5;
const TOP_N = 4000;
const LLR_CAP = 3;
// משקל התערובת האנושית: 50/50 בין רגיסטר נרטיבי (ויקיפדיה) לרגיסטר אקדמי (מקורות
// 314999533 של מחברים אחרים) — לא ספירת-טוקנים גולמית. אחרת ה-821 מסמכי ויקיפדיה
// היו בולעים את ה-~73 מסמכים האקדמיים (פי ~11 בטוקנים) והפער-רגיסטר חוזר.
const HUMAN_MIX_WEIGHT = { narrative: 0.5, academic: 0.5 };

// ---------- קורפוס AI ----------

function splitBlocks(raw) {
  return raw.split(/\r?\n=+\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function loadAiCorpus() {
  const blocks = [];
  for (const file of ['ai.txt', 'ai-extended.txt']) {
    const p = join(SAMPLES_DIR, file);
    if (!existsSync(p)) continue;
    const raw = readFileSync(p, 'utf8');
    for (const b of splitBlocks(raw)) {
      const text = b.replace(/^#genre=\S+\s+mode=\S+\s*\n/, '').trim();
      if (tokenizeForStyle(text).length >= MIN_WORDS) blocks.push(text);
    }
  }
  return blocks;
}

// ---------- קורפוס אנושי: narrative (ויקיפדיה/ויקיטקסט) ----------

function loadNarrativeCorpus() {
  const docs = [];
  const globalDir = join(SAMPLES_DIR, 'human-global');
  if (existsSync(globalDir)) {
    for (const file of readdirSync(globalDir).filter((f) => f.endsWith('.txt')).sort()) {
      const raw = readFileSync(join(globalDir, file), 'utf8');
      for (const b of splitBlocks(raw)) {
        if (tokenizeForStyle(b).length >= MIN_WORDS) docs.push(b);
      }
    }
  }
  const humanTxt = join(SAMPLES_DIR, 'human.txt');
  if (existsSync(humanTxt)) {
    for (const b of splitBlocks(readFileSync(humanTxt, 'utf8'))) {
      if (tokenizeForStyle(b).length >= MIN_WORDS) docs.push(b);
    }
  }
  return docs;
}

// ---------- קורפוס אנושי: academic (314999533, לא עבודות המשתמש) ----------
// אותה שיטת הפרדה בדיוק כמו tools/test-bench/style-eval.mjs: SELF_DIR ותיקיית
// הטיוטות מוחרגות (כתיבת המשתמש), כל השאר הוא "בקרה" — מאמרים/חוקות/טקסטים
// משפטיים ופילוסופיים של מחברים אחרים, ברגיסטר אקדמי-פורמלי.

const CORPUS_ROOT = process.env.WORDAI_SCAFFOLD_CORPUS
  || join(os.homedir(), 'OneDrive', 'שולחן העבודה', '314999533');
const SELF_DIR = join(CORPUS_ROOT, 'עבודות והגשות', 'עבודות סופיות');
const DRAFTS_MARKER = 'טיוטות וגרסאות קודמות';

const hebrewRatio = (s) => {
  const letters = String(s || '').match(/[א-תA-Za-z]/g) || [];
  if (!letters.length) return 0;
  return letters.filter((c) => /[א-ת]/.test(c)).length / letters.length;
};
const PURE_TOKEN_RE = /^[֐-׿]{2,}[.,;:!?'"׳״)]?$|^[A-Za-z]{2,}[.,;:!?'")]?$|^\d+([.,]\d+)?$/;
function pureTokenRatio(text) {
  const tokens = (String(text || '').match(/\S+/g) || []).slice(0, 2000);
  if (tokens.length < 40) return 0;
  return tokens.filter((t) => PURE_TOKEN_RE.test(t)).length / tokens.length;
}

function walkDocs(dir, out = []) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walkDocs(full, out);
    else if (/\.(docx|pdf)$/i.test(e.name) && !e.name.startsWith('~$')) out.push(full);
  }
  return out;
}

async function extractDocxText(p) {
  try { return (await mammoth.extractRawText({ buffer: readFileSync(p) })).value || ''; }
  catch { return ''; }
}
async function extractPdfText(p) {
  try {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(p)), useSystemFonts: true }).promise;
    const parts = [];
    for (let i = 1; i <= Math.min(doc.numPages, 40); i += 1) {
      const c = await (await doc.getPage(i)).getTextContent();
      parts.push(c.items.map((it) => it.str).join(' '));
    }
    try { await doc.destroy(); } catch { /* ignore */ }
    return parts.join('\n\n');
  } catch { return ''; }
}
async function extractAnyText(p) {
  if (/\.docx$/i.test(p)) return extractDocxText(p);
  if (/\.pdf$/i.test(p)) return extractPdfText(p);
  return '';
}

async function loadAcademicCorpus() {
  if (!existsSync(CORPUS_ROOT)) return [];
  const all = walkDocs(CORPUS_ROOT);
  const selfSet = new Set(walkDocs(SELF_DIR).map((p) => resolve(p)));
  const candidates = all.filter((p) => !selfSet.has(resolve(p)) && !p.includes(DRAFTS_MARKER));
  const docs = [];
  for (const p of candidates) {
    const text = await extractAnyText(p);
    if (tokenizeForStyle(text).length < ACADEMIC_MIN_WORDS) continue;
    if (hebrewRatio(text) < 0.6) continue;
    if (pureTokenRatio(text) < 0.5) continue;
    docs.push(text);
  }
  return docs;
}

// ---------- ריצה: טעינה ----------

const aiDocs = loadAiCorpus();
const narrativeDocs = loadNarrativeCorpus();
const academicDocs = await loadAcademicCorpus();

const wordsOf = (docs) => docs.reduce((a, d) => a + tokenizeForStyle(d).length, 0);
const aiWords = wordsOf(aiDocs);
const narrativeWords = wordsOf(narrativeDocs);
const academicWords = wordsOf(academicDocs);

console.log(`=== קורפוס AI: ${aiDocs.length} בלוקים (${aiWords} מילים) ===`);
console.log(`=== קורפוס אנושי — narrative: ${narrativeDocs.length} מסמכים (${narrativeWords} מילים) ===`);
console.log(`=== קורפוס אנושי — academic:  ${academicDocs.length} מסמכים (${academicWords} מילים, מ-${CORPUS_ROOT}, לא עבודות המשתמש) ===`);
if (!academicDocs.length) {
  console.log('  ⚠️ קורפוס academic ריק (תיקייה לא נמצאה במכונה הזו?) — נופלים חזרה למקור narrative בלבד.');
}

// ---------- ספירת גרמים ----------

// buildStats: עבור רשימת מסמכים, מחזיר { counts: Map<gram,count>, docFreq: Map<gram,count>, total }
function buildStats(docs) {
  const counts = new Map();
  const docFreq = new Map();
  let total = 0;
  for (const d of docs) {
    const grams = charNgrams(d);
    total += grams.length;
    const seen = new Set();
    for (const g of grams) {
      counts.set(g, (counts.get(g) || 0) + 1);
      if (!seen.has(g)) { seen.add(g); docFreq.set(g, (docFreq.get(g) || 0) + 1); }
    }
  }
  return { counts, docFreq, total };
}

// humanSources: [{ docs, weight, label }]. P_human(g) = Σ weight_i · smoothed_i(g) —
// תערובת של הסתברויות מוחלקות בנפרד (לא שרשור טקסט), כך שמקור-מיעוט לא נבלע.
function buildTable(aiDocsIn, humanSourcesIn) {
  const aiStats = buildStats(aiDocsIn);
  const humanBuilt = humanSourcesIn
    .filter((s) => s.docs.length)
    .map((s) => ({ ...buildStats(s.docs), weight: s.weight, label: s.label }));
  // אם מקור ריק (למשל academic לא נמצא במכונה) — לנרמל משקלים על הנותרים.
  const weightSum = humanBuilt.reduce((a, h) => a + h.weight, 0) || 1;
  humanBuilt.forEach((h) => { h.weight /= weightSum; });

  const vocab = new Set(aiStats.counts.keys());
  for (const h of humanBuilt) for (const g of h.counts.keys()) vocab.add(g);
  const V = vocab.size;

  const candidates = [];
  for (const g of vocab) {
    const aiDf = aiStats.docFreq.get(g) || 0;
    const humanDfSum = humanBuilt.reduce((a, h) => a + (h.docFreq.get(g) || 0), 0);
    if (aiDf < MIN_DOC_FREQ && humanDfSum < MIN_DOC_FREQ) continue;

    const aiCount = aiStats.counts.get(g) || 0;
    const pAi = (aiCount + 1) / (aiStats.total + V);

    let pHuman = 0;
    for (const h of humanBuilt) {
      const c = h.counts.get(g) || 0;
      pHuman += h.weight * (c + 1) / (h.total + V);
    }

    let llr = Math.log(pAi / pHuman);
    llr = Math.max(-LLR_CAP, Math.min(LLR_CAP, llr));

    const humanCountSum = humanBuilt.reduce((a, h) => a + (h.counts.get(g) || 0), 0);
    const combinedFreq = aiCount + humanCountSum;
    const rankScore = Math.abs(llr) * Math.sqrt(combinedFreq);
    candidates.push({ gram: g, llr, rankScore, aiDf, humanDfSum, aiCount, humanCountSum });
  }

  candidates.sort((a, b) => b.rankScore - a.rankScore);
  return candidates.slice(0, TOP_N);
}

const humanSources = [
  { docs: narrativeDocs, weight: HUMAN_MIX_WEIGHT.narrative, label: 'narrative' },
  { docs: academicDocs, weight: HUMAN_MIX_WEIGHT.academic, label: 'academic' },
];

const fullTable = buildTable(aiDocs, humanSources);
console.log(`\nגרמים מועמדים שעברו סף doc-freq: נבחרו ${fullTable.length} (מתוך top-N=${TOP_N})`);

// ---------- מיטיגציית פער-רגיסטר (משלימה — נמדדת, לא מובנת מאליה) ----------
//
// גם עם תערובת academic/narrative, ייתכן שגרמים בודדים עדיין מנפחים עבודות
// אמיתיות של המשתמש (שאינן בשום מקור אימון). שלב זה משתמש בהן **רק** כקורפוס
// ולידציה לגיזום top-K גרמים בעייתיים — לא לחישוב LLR.
const VALIDATION_CORPUS_DIR = SELF_DIR;
const validationPaths = existsSync(VALIDATION_CORPUS_DIR) ? walkDocs(VALIDATION_CORPUS_DIR).filter((p) => /\.docx$/i.test(p)) : [];
let validationDocs = [];
if (validationPaths.length) {
  for (const p of validationPaths) {
    const text = await extractDocxText(p);
    if (tokenizeForStyle(text).length < 250) continue;
    if (hebrewRatio(text) < 0.6) continue;
    if (pureTokenRatio(text) < 0.5) continue;
    validationDocs.push(text);
  }
}
console.log(`\nקורפוס ולידציה (עבודות המשתמש עצמו, לגיזום גרמים בלבד — לא לאימון LLR): ${validationDocs.length} מסמכים`);

const DROP_TOP_K = Number(process.env.WORDAI_NGRAM_DROP_TOP_K ?? 300);
let droppedCount = 0;
if (DROP_TOP_K > 0 && validationDocs.length >= 5) {
  const gramMap = {};
  for (const c of fullTable) gramMap[c.gram] = c.llr;
  const contrib = new Map();
  for (const d of validationDocs) {
    for (const g of charNgrams(d)) {
      const llr = gramMap[g];
      if (llr && llr > 0) contrib.set(g, (contrib.get(g) || 0) + llr);
    }
  }
  const offenders = new Set([...contrib.entries()].sort((a, b) => b[1] - a[1]).slice(0, DROP_TOP_K).map(([g]) => g));
  const before = fullTable.length;
  for (let i = fullTable.length - 1; i >= 0; i -= 1) {
    if (offenders.has(fullTable[i].gram)) { fullTable.splice(i, 1); droppedCount += 1; }
  }
  console.log(`  גיזום: ${droppedCount}/${before} גרמים הוסרו (top-${DROP_TOP_K} תורמים לניפוח על קורפוס הולידציה)`);
} else if (DROP_TOP_K <= 0) {
  console.log('  ℹ️ WORDAI_NGRAM_DROP_TOP_K=0 — שלב הגיזום מדולג בכוונה.');
} else {
  console.log('  ℹ️ פחות מ-5 מסמכי ולידציה — מדלגים על שלב הגיזום.');
}

const grams = {};
for (const c of fullTable) grams[c.gram] = Math.round(c.llr * 1000) / 1000;

// ---------- עוגני ניקוד ----------
//
// אחוזון משוקלל: כל מסמך narrative שוקל HUMAN_MIX_WEIGHT.narrative/|narrative|,
// כל מסמך academic שוקל HUMAN_MIX_WEIGHT.academic/|academic| — כך שהעוגן משקף
// את אותה תערובת 50/50 כמו הטבלה עצמה, ולא נשלט ע"י 821 מסמכי ויקיפדיה מול 73
// אקדמיים.

function meanLlrOf(text, gramMap) {
  const g = charNgrams(text);
  if (!g.length) return 0;
  let sum = 0;
  for (const x of g) sum += gramMap[x] || 0;
  return sum / g.length;
}

function percentile(arr, p) {
  if (!arr.length) return NaN;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

function weightedPercentile(items, p) {
  // items: [{value, weight}]
  if (!items.length) return NaN;
  const totalWeight = items.reduce((a, it) => a + it.weight, 0);
  const sorted = [...items].sort((a, b) => a.value - b.value);
  const target = (p / 100) * totalWeight;
  let cum = 0;
  for (const it of sorted) {
    cum += it.weight;
    if (cum >= target) return it.value;
  }
  return sorted[sorted.length - 1].value;
}

const aiMeans = aiDocs.map((d) => meanLlrOf(d, grams));
const narrativeMeans = narrativeDocs.map((d) => meanLlrOf(d, grams));
const academicMeans = academicDocs.map((d) => meanLlrOf(d, grams));

const wNarrative = narrativeMeans.length ? HUMAN_MIX_WEIGHT.narrative / narrativeMeans.length : 0;
const wAcademic = academicMeans.length ? HUMAN_MIX_WEIGHT.academic / academicMeans.length : 0;
const humanWeightedItems = [
  ...narrativeMeans.map((value) => ({ value, weight: wNarrative })),
  ...academicMeans.map((value) => ({ value, weight: wAcademic })),
];
const humanMeansAll = [...narrativeMeans, ...academicMeans]; // לדיווח בלתי-משוקלל בלבד

let lowAnchor = weightedPercentile(humanWeightedItems, 75);
let highAnchor = percentile(aiMeans, 25);
let anchorNote = 'human(weighted 50/50) p75 / AI p25';
if (!(highAnchor > lowAnchor)) {
  lowAnchor = weightedPercentile(humanWeightedItems, 60);
  highAnchor = percentile(aiMeans, 40);
  anchorNote = 'human(weighted) p60 / AI p40 (fallback — p75/p25 התהפכו/חפפו מדי)';
}

console.log(`\nעוגני ניקוד (${anchorNote}): low=${lowAnchor.toFixed(4)} high=${highAnchor.toFixed(4)}`);
console.log(`  human meanLLR (לא-משוקלל, לדיווח): p10=${percentile(humanMeansAll, 10).toFixed(4)} p50=${percentile(humanMeansAll, 50).toFixed(4)} p90=${percentile(humanMeansAll, 90).toFixed(4)}`);
console.log(`  academic meanLLR: p10=${percentile(academicMeans, 10).toFixed(4)} p50=${percentile(academicMeans, 50).toFixed(4)} p90=${percentile(academicMeans, 90).toFixed(4)}`);
console.log(`  narrative meanLLR: p10=${percentile(narrativeMeans, 10).toFixed(4)} p50=${percentile(narrativeMeans, 50).toFixed(4)} p90=${percentile(narrativeMeans, 90).toFixed(4)}`);
console.log(`  AI meanLLR: p10=${percentile(aiMeans, 10).toFixed(4)} p50=${percentile(aiMeans, 50).toFixed(4)} p90=${percentile(aiMeans, 90).toFixed(4)}`);

// ---------- בדיקת יציבות split-half (דיווח בלבד, לא שער) ----------

const aiHalfA = aiDocs.filter((_, i) => i % 2 === 0);
const aiHalfB = aiDocs.filter((_, i) => i % 2 === 1);
const tableA = buildTable(aiHalfA, humanSources).slice(0, 1000).map((c) => c.gram);
const tableB = buildTable(aiHalfB, humanSources).slice(0, 1000).map((c) => c.gram);
const setA = new Set(tableA);
const setB = new Set(tableB);
const inter = [...setA].filter((g) => setB.has(g)).length;
const union = new Set([...setA, ...setB]).size;
const jaccard = union ? inter / union : 0;
console.log(`\nיציבות split-half (top-1000, ${aiHalfA.length}/${aiHalfB.length} בלוקי AI): Jaccard=${jaccard.toFixed(3)} (חפיפה ${inter}/${union})`);

// ---------- כתיבת הקובץ ----------

const header = `// styleAiMarkers.data.js — טבלת LLR של 3-גרמים של תווים, AI מול אנושי (עברית).
//
// נבנה ע"י: node tools/detector-train/build-ngram-table.mjs
// מקור AI: samples/ai.txt + samples/ai-extended.txt.
// מקור אנושי: תערובת משוקללת 50/50 —
//   • narrative: samples/human-global/*.txt (ויקיפדיה/ויקיטקסט) + samples/human.txt.
//   • academic:  314999533/** (כמו tools/test-bench/style-eval.mjs), לא כולל
//     עבודות המשתמש עצמו — מאמרים/חוקות/פילוסופיה של מחברים אחרים ברגיסטר אקדמי.
// ⚠️ עבודות המשתמש עצמו (עבודות סופיות) אינן בשום מקור אימון — ולידציה בלבד
// (גיזום גרמים, ר' תוצאה למטה).
//
// שימוש: styleAuthenticityService.js משתמש בטבלה לחישוב סיגנל 'ngramGeneric' —
// ממוצע LLR לגרם על פני הטקסט, ממופה ל-0..1 לפי lowAnchor/highAnchor ב-meta.
// ערך חיובי = מאפיין AI יותר; שלילי = מאפיין אנושי יותר.
//
// לעדכן/לבנות מחדש: node tools/detector-train/build-ngram-table.mjs
// (לוודא סנכרון sync-check.mjs + extractor.mjs אחרי כל בנייה מחדש).

`;

const meta = {
  version: 2,
  ngramN: 3,
  builtFrom: 'detector-train build-ngram-table (academic+narrative mix)',
  aiBlocks: aiDocs.length,
  humanDocs: narrativeDocs.length + academicDocs.length,
  humanWords: narrativeWords + academicWords,
  humanNarrativeDocs: narrativeDocs.length,
  humanAcademicDocs: academicDocs.length,
  humanMixWeight: HUMAN_MIX_WEIGHT,
  lowAnchor: Math.round(lowAnchor * 10000) / 10000,
  highAnchor: Math.round(highAnchor * 10000) / 10000,
  updatedAt: new Date().toISOString(),
};

const body = `export const AI_NGRAM_TABLE = ${JSON.stringify({ meta, grams }, null, 0)};\n`;

writeFileSync(OUT_PATH, header + body, 'utf8');
const sizeKb = Buffer.byteLength(header + body, 'utf8') / 1024;
console.log(`\n✓ נכתב ${OUT_PATH} (${sizeKb.toFixed(1)} KB, ${Object.keys(grams).length} גרמים)`);
