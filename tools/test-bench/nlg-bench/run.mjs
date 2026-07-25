// nlg-bench/run.mjs — הבדיקה הקבועה של מנוע ה-NLG המקומי. שתי שכבות:
//   1. רגרסיה: run-scaffold-e2e.mjs כמו שהוא (exit code = שער).
//   2. יכולת: כל case ב-cases/ רץ דרך run-nlg-loop-round.mjs — פעם על המטלה
//      המקורית ופעם על וריאציות מוגרלות-בזרע — ואז אינווריאנטות + capabilityScore.
//
// הרצה:  npm run bench:nlg
//   WORDAI_BENCH_SEED=x       — זרע קבוע (ברירת מחדל: התאריך של היום)
//   WORDAI_BENCH_VARIATIONS=2 — כמה וריאציות לכל case
//   WORDAI_BENCH_SKIP_E2E=1   — דילוג על שכבת הרגרסיה (לאיטרציה מהירה)
//
// כל ריצה נרשמת ב-bench-history.jsonl. ירידת ציון >3 נק' מול הריצה הקודמת של
// אותו case ⇒ exit 1 (רגרסיית יכולת).

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { varyAssignment } from './variations.mjs';
import { checkInvariants, capabilityScore } from './invariants.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const BENCH_DIR = DIR;
const PROJECT = path.resolve(DIR, '..', '..', '..');
const HISTORY = path.join(BENCH_DIR, 'bench-history.jsonl');
const OUT_ROOT = path.join(BENCH_DIR, '.bench-out');
const N_VARIATIONS = Number(process.env.WORDAI_BENCH_VARIATIONS ?? 2);
const SEED = process.env.WORDAI_BENCH_SEED || new Date().toISOString().slice(0, 10);
const REGRESSION_TOLERANCE = 3;

const run = (cmd, args, env = {}) => new Promise((resolve) => {
  const p = spawn(cmd, args, {
    stdio: 'inherit', shell: process.platform === 'win32',
    cwd: PROJECT, env: { ...process.env, ...env },
  });
  p.on('exit', (code) => resolve(code ?? 1));
  p.on('error', () => resolve(1));
});

function gitCommit() {
  try { return execSync('git rev-parse --short HEAD', { cwd: PROJECT }).toString().trim(); }
  catch { return 'unknown'; }
}

// metrics.json של nlg-loop-round → צורת units של האינווריאנטות
function adaptMetrics(metrics) {
  const units = (metrics?.sections || []).map((s) => ({
    id: s.id,
    status: s.status === 'blocked' ? 'blocked' : 'written',
    words: s.wordCount || 0,
    quota: s.quota || 0,
    anchoredPct: s.anchoredPct,
    notes: s.note || '',
    blockReason: s.status === 'blocked' ? (s.note || '') : undefined,
  }));
  return { units };
}

async function runCase(caseDir, caseCfg, variantLabel, assignmentText) {
  const roundId = `bench-${caseCfg.id}-${variantLabel}`;
  const roundDir = path.join(OUT_ROOT, roundId);
  fs.mkdirSync(roundDir, { recursive: true });
  const assignmentPath = path.join(roundDir, 'assignment.txt');
  fs.writeFileSync(assignmentPath, assignmentText, 'utf8');

  const code = await run('node', ['tools/test-bench/run-nlg-loop-round.mjs'], {
    WORDAI_SCAFFOLD_CORPUS: caseCfg.corpusDir,
    WORDAI_NLG_OUT: OUT_ROOT,
    WORDAI_NLG_ROUND: roundId,
    WORDAI_NLG_ASSIGNMENT: assignmentPath,
    // ה-bundle נבנה פעם אחת בתחילת הריצה; הסבבים הבאים מדלגים
    WORDAI_NLGLOOP_REBUILD: builtOnce ? '0' : (process.env.WORDAI_NLGLOOP_REBUILD ?? '1'),
  });
  builtOnce = true;
  if (code !== 0) return { variant: variantLabel, error: `harness exited ${code}`, score: 0, invariants: [] };

  const metricsPath = path.join(roundDir, 'metrics.json');
  const draftPath = path.join(roundDir, 'draft.txt');
  if (!fs.existsSync(metricsPath)) return { variant: variantLabel, error: 'no metrics.json', score: 0, invariants: [] };
  const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
  const draftText = fs.existsSync(draftPath) ? fs.readFileSync(draftPath, 'utf8') : '';

  const runObj = { draftText, metrics: adaptMetrics(metrics) };
  const invariants = checkInvariants(runObj);
  const score = capabilityScore(runObj, invariants);
  return {
    variant: variantLabel, score, invariants,
    written: runObj.metrics.units.filter((u) => u.status !== 'blocked').length,
    blocked: runObj.metrics.units.filter((u) => u.status === 'blocked').length,
    words: metrics.totals?.totalWords ?? 0,
  };
}

let builtOnce = false;

// ---------- שכבה 1: רגרסיה ----------
let e2ePass = null;
if (process.env.WORDAI_BENCH_SKIP_E2E !== '1') {
  console.log('\n═══ שכבה 1: רגרסיה (scaffold-e2e) ═══');
  const code = await run('node', ['tools/test-bench/run-scaffold-e2e.mjs']);
  e2ePass = code === 0;
  console.log(e2ePass ? '✓ רגרסיה עברה' : '✗ רגרסיה נכשלה');
}

// ---------- שכבה 2: יכולת ----------
const casesDir = path.join(BENCH_DIR, 'cases');
const caseIds = fs.readdirSync(casesDir).filter((d) => fs.existsSync(path.join(casesDir, d, 'case.json')));
const results = [];

for (const caseId of caseIds) {
  const caseDir = path.join(casesDir, caseId);
  const caseCfg = JSON.parse(fs.readFileSync(path.join(caseDir, 'case.json'), 'utf8'));
  const baseText = fs.readFileSync(path.join(caseDir, caseCfg.assignment), 'utf8');
  console.log(`\n═══ שכבה 2: case ${caseId} (זרע ${SEED}) ═══`);

  const variants = [{ label: 'base', text: baseText, applied: [] }];
  for (let i = 1; i <= N_VARIATIONS; i += 1) {
    const v = varyAssignment(baseText, `${SEED}:${caseId}:${i}`);
    variants.push({ label: `var${i}`, text: v.text, applied: v.applied });
  }

  const caseRuns = [];
  for (const v of variants) {
    if (v.applied.length) console.log(`\n--- ${v.label}: ${v.applied.join(' · ')}`);
    else console.log(`\n--- ${v.label}`);
    const r = await runCase(caseDir, caseCfg, v.label, v.text);
    caseRuns.push(r);
    const inv = r.invariants.map((i) => `${i.pass ? '✓' : '✗'}${i.id}`).join(' ');
    console.log(`    ציון ${r.score} · נכתבו ${r.written ?? '?'} · חסומים ${r.blocked ?? '?'} · ${r.words ?? 0} מילים`);
    console.log(`    ${inv}${r.error ? ` · שגיאה: ${r.error}` : ''}`);
    for (const i of r.invariants.filter((x) => !x.pass)) console.log(`      ✗ ${i.id}: ${i.detail}`);
  }

  const minScore = Math.min(...caseRuns.map((r) => r.score));
  const avgScore = Math.round(caseRuns.reduce((a, r) => a + r.score, 0) / caseRuns.length);
  results.push({ caseId, minScore, avgScore, expectedMin: caseCfg.expectations?.minCapabilityScore ?? 0, runs: caseRuns });
}

// ---------- history + פסיקה ----------
const prev = new Map();
if (fs.existsSync(HISTORY)) {
  for (const line of fs.readFileSync(HISTORY, 'utf8').split('\n').filter(Boolean)) {
    try { const e = JSON.parse(line); prev.set(e.caseId, e); } catch {}
  }
}

const ts = new Date().toISOString();
const commit = gitCommit();
let exitCode = 0;
console.log('\n═══ סיכום ═══');
if (e2ePass === false) { console.log('✗ שכבת הרגרסיה נכשלה'); exitCode = 1; }

for (const r of results) {
  const prevEntry = prev.get(r.caseId);
  const delta = prevEntry ? r.avgScore - prevEntry.avgScore : null;
  const belowExpected = r.minScore < r.expectedMin;
  const regressed = prevEntry && delta < -REGRESSION_TOLERANCE;
  const flag = belowExpected || regressed ? '✗' : '✓';
  console.log(`${flag} ${r.caseId}: ממוצע ${r.avgScore} (מינ' ${r.minScore}, רף ${r.expectedMin}${delta !== null ? `, Δ${delta >= 0 ? '+' : ''}${delta}` : ''})`);
  if (belowExpected) { console.log(`    מתחת לרף ה-case`); exitCode = 1; }
  if (regressed) { console.log(`    רגרסיה מול הריצה הקודמת (${prevEntry.avgScore} → ${r.avgScore})`); exitCode = 1; }
  fs.appendFileSync(HISTORY, JSON.stringify({
    ts, commit, seed: SEED, caseId: r.caseId, avgScore: r.avgScore, minScore: r.minScore,
    runs: r.runs.map((x) => ({ variant: x.variant, score: x.score, written: x.written, blocked: x.blocked, words: x.words, failed: x.invariants.filter((i) => !i.pass).map((i) => i.id) })),
  }) + '\n', 'utf8');
}

console.log(exitCode === 0 ? '\n✓ bench ירוק' : '\n✗ bench אדום');
process.exit(exitCode);
