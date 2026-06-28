// train.mjs — מאמן/מנתח את הגלאי המקומי מקורפוס מתויג.
// קורא samples/ai.txt + samples/human.txt (בלוקים מופרדים בשורת ===),
// מאפיין כל דגימה, ומפיק: ממוצעי סיגנלים לכל מחלקה, משקלים+סף מכויל,
// דיוק, וגילוי מרקרים חדשים (n-grams שכיחים ב-AI ונדירים באנושי).
//
// שימוש:
//   node tools/detector-train/train.mjs
//   node tools/detector-train/train.mjs --emit   (כותב calibration.json)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  extractAuthenticityFeatures, computeSignals, scoreFromSignals,
  DEFAULT_WEIGHTS, STOP_WORDS, FORMAL_CONNECTORS, CLICHE_PHRASES, round,
} from './extractor.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SIGNAL_KEYS = Object.keys(DEFAULT_WEIGHTS);
const KNOWN = new Set([...FORMAL_CONNECTORS, ...CLICHE_PHRASES]);

function loadSamples(name) {
  const path = join(HERE, 'samples', name);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split(/\n=+\n/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 25);
}

function classMeans(samples) {
  const sums = {}; const counts = {};
  samples.forEach((s) => {
    const sig = computeSignals(extractAuthenticityFeatures(s));
    SIGNAL_KEYS.forEach((k) => {
      if (sig[k] === null || sig[k] === undefined) return;
      sums[k] = (sums[k] || 0) + sig[k];
      counts[k] = (counts[k] || 0) + 1;
    });
  });
  const means = {};
  SIGNAL_KEYS.forEach((k) => { means[k] = counts[k] ? sums[k] / counts[k] : null; });
  return means;
}

// גילוי מרקרים: document-frequency של n-grams לכל מחלקה.
function ngramDocFreq(samples, n) {
  const df = new Map();
  samples.forEach((s) => {
    const words = (s.replace(/<[^>]+>/g, ' ').match(/[֐-׿A-Za-z][֐-׿A-Za-z'"׳״-]*/g) || []).map((w) => w.toLowerCase());
    const seen = new Set();
    for (let i = 0; i + n <= words.length; i += 1) {
      const gram = words.slice(i, i + n).join(' ');
      // מסנן n-grams שכולם stopwords (לא אינפורמטיביים).
      const allStop = words.slice(i, i + n).every((w) => STOP_WORDS.has(w) || w.length < 2);
      if (allStop) continue;
      if (!seen.has(gram)) { seen.add(gram); df.set(gram, (df.get(gram) || 0) + 1); }
    }
  });
  return df;
}

function discoverMarkers(ai, human, n, minAiDocs) {
  const aiDF = ngramDocFreq(ai, n);
  const humanDF = ngramDocFreq(human, n);
  const out = [];
  for (const [gram, ac] of aiDF.entries()) {
    if (ac < minAiDocs) continue;
    const hc = humanDF.get(gram) || 0;
    const aiRate = ac / ai.length;
    const humanRate = hc / Math.max(1, human.length);
    const lift = (aiRate + 0.01) / (humanRate + 0.01);
    if (lift >= 2.2 && aiRate >= 0.25) {
      out.push({ gram, ai: ac, human: hc, aiRate: round(aiRate, 2), humanRate: round(humanRate, 2), lift: round(lift, 1), known: KNOWN.has(gram) });
    }
  }
  out.sort((a, b) => (b.lift - a.lift) || (b.ai - a.ai));
  return out;
}

function trainWeights(meMeans, aiMeans) {
  const weights = {};
  SIGNAL_KEYS.forEach((key) => {
    if (meMeans[key] === null || aiMeans[key] === null) {
      weights[key] = round(DEFAULT_WEIGHTS[key] * 0.6, 4);
    } else {
      const separation = Math.abs(aiMeans[key] - meMeans[key]);
      weights[key] = round(Math.max(0.2, Math.min(0.65, 0.2 + separation)), 4);
    }
  });
  const classScore = (means) => {
    let product = 1;
    SIGNAL_KEYS.forEach((key) => { if (means[key] !== null) product *= (1 - means[key] * weights[key]); });
    return (1 - product) * 100;
  };
  const meScore = classScore(meMeans);
  const aiScore = classScore(aiMeans);
  const threshold = Math.round((meScore + aiScore) / 2);
  return { weights, threshold, meScore: round(meScore), aiScore: round(aiScore) };
}

function evaluate(ai, human, weights, threshold) {
  let tp = 0, fn = 0, tn = 0, fp = 0;
  const scoreOf = (s) => scoreFromSignals(computeSignals(extractAuthenticityFeatures(s)), weights);
  ai.forEach((s) => { (scoreOf(s) >= threshold ? tp++ : fn++); });
  human.forEach((s) => { (scoreOf(s) >= threshold ? fp++ : tn++); });
  const acc = (tp + tn) / Math.max(1, ai.length + human.length);
  return { tp, fn, tn, fp, acc: round(acc, 3) };
}

// ---- run ----
const ai = loadSamples('ai.txt');
const human = loadSamples('human.txt');
console.log(`\n=== קורפוס: ${ai.length} דגימות AI · ${human.length} דגימות אנושי ===`);

const aiMeans = classMeans(ai);
const meMeans = classMeans(human);
console.log('\nממוצע סיגנל לכל מחלקה (1=מכונה):');
SIGNAL_KEYS.forEach((k) => {
  const a = aiMeans[k] === null ? ' n/a' : aiMeans[k].toFixed(2);
  const h = meMeans[k] === null ? ' n/a' : meMeans[k].toFixed(2);
  const sep = (aiMeans[k] !== null && meMeans[k] !== null) ? Math.abs(aiMeans[k] - meMeans[k]).toFixed(2) : '-';
  console.log(`  ${k.padEnd(16)} AI=${a}  human=${h}  Δ=${sep}`);
});

const baselineWeights = DEFAULT_WEIGHTS;
const baselineThreshold = 60;
const baseEval = evaluate(ai, human, baselineWeights, baselineThreshold);
console.log(`\nBASELINE (weights ברירת מחדל, סף 60): acc=${baseEval.acc}  AI נתפס=${baseEval.tp}/${ai.length}  אנושי-שגוי=${baseEval.fp}/${human.length}`);

const trained = trainWeights(meMeans, aiMeans);
const trainedEval = evaluate(ai, human, trained.weights, trained.threshold);
console.log(`\nTRAINED: סף=${trained.threshold}  (meScore=${trained.meScore} aiScore=${trained.aiScore})  acc=${trainedEval.acc}  AI נתפס=${trainedEval.tp}/${ai.length}  אנושי-שגוי=${trainedEval.fp}/${human.length}`);
console.log('  weights:', JSON.stringify(trained.weights));

console.log('\n=== מרקרים מועמדים חדשים (שכיח ב-AI, נדיר באנושי) ===');
for (const n of [2, 3]) {
  const found = discoverMarkers(ai, human, n, Math.max(2, Math.ceil(ai.length * 0.25)));
  const fresh = found.filter((f) => !f.known);
  console.log(`\n  ${n}-grams (top ${Math.min(20, fresh.length)} חדשים):`);
  fresh.slice(0, 20).forEach((f) => console.log(`    "${f.gram}"  AI=${f.ai}/${ai.length} human=${f.human}/${human.length} lift=${f.lift}`));
}

if (process.argv.includes('--emit')) {
  const payload = { weights: trained.weights, threshold: trained.threshold, meScore: trained.meScore, aiScore: trained.aiScore, meCount: human.length, aiCount: ai.length, trainedAt: new Date().toISOString() };
  writeFileSync(join(HERE, 'calibration.json'), JSON.stringify(payload, null, 2));
  console.log('\n✓ נכתב calibration.json');
}
