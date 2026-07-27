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
// ⚠️ סבילות הרגרסיה **נגזרת מהרעש הנמדד**, לא קבועה.
//
// היה כאן קבוע 3, בזמן שהפיזור בין וריאנטים של אותה ריצה נמדד 6 (99 · 99 · 93
// ב-media-law-2026). כלומר סף שצועק "רגרסיה" על הפרש קטן מהרעש של המכשיר עצמו.
// זה לא התפוצץ רק מפני שהזרע קבוע והמנוע דטרמיניסטי — החלפת זרע, או שכבת
// וריאנטים בניסוח (B1), היו מדליקות רגרסיות שווא.
//
// הכלל: ירידה נחשבת רגרסיה רק אם היא **גדולה מהפיזור שכבר ראינו** ב-case הזה.
const MIN_REGRESSION_TOLERANCE = 3;

const run = (cmd, args, env = {}) => new Promise((resolve) => {
  const p = spawn(cmd, args, {
    stdio: 'inherit', shell: process.platform === 'win32',
    cwd: PROJECT, env: { ...process.env, ...env },
  });
  p.on('exit', (code) => resolve(code ?? 1));
  p.on('error', () => resolve(1));
});

// שורש הקורפוס של ה-case הראשון — משמש כברירת מחדל לשכבת הרגרסיה, ששואבת
// מאותה ספריית מקורות.
function firstCorpusDir() {
  try {
    const casesDir = path.join(BENCH_DIR, 'cases');
    for (const d of fs.readdirSync(casesDir)) {
      const cfgPath = path.join(casesDir, d, 'case.json');
      if (!fs.existsSync(cfgPath)) continue;
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (cfg.corpusDir) return cfg.corpusDir;
    }
  } catch {}
  return '';
}

/**
 * האם הקורפוס של ה-case קיים במכונה הזאת?
 *
 * ⚠️ בלי הבדיקה הזאת case בלי קורפוס **אינו נכשל — הוא משקר**: ההרנס סורק אפס
 * קבצים, כל הסעיפים נחסמים כ"אין ראיות בסף הרלוונטיות", והבנצ' מדווח ציון נמוך
 * כאילו המנוע נסוג. כך mill-2026 החזיר exit 1 קבוע מ-25.7.26 (המצגות נשארו
 * במחשב הישן), והשער כולו מת — כי exit 1 שתמיד דולק זהה ל-exit 1 שכבוי.
 *
 * הדילוג הוא מפורש ורועש, כמו תרחיש 1 של scaffold-e2e.
 */
function caseAvailable(cfg) {
  const countIn = (dir) => {
    try {
      return fs.readdirSync(dir).filter((f) => /\.(pdf|docx|pptx)$/i.test(f) && !f.startsWith('~$')).length;
    } catch { return 0; }
  };
  // courseDir ⇒ ההרנס סורק את התיקייה כולה.
  if (cfg.courseDir) {
    const n = countIn(cfg.courseDir);
    return n > 0 ? { ok: true, detail: `${n} קבצים` } : { ok: false, detail: `courseDir ריק או חסר: ${cfg.courseDir}` };
  }
  // אחרת ההרנס משתמש ברשימה קשיחה. ה-case מצהיר קבצי-סימן כדי שנוכל לבדוק.
  if (Array.isArray(cfg.requiredFiles) && cfg.requiredFiles.length) {
    const found = cfg.requiredFiles.filter((f) => fs.existsSync(path.join(cfg.corpusDir || '', f)));
    return found.length
      ? { ok: true, detail: `${found.length}/${cfg.requiredFiles.length} קבצי-סימן` }
      : { ok: false, detail: `אף אחד מ-${cfg.requiredFiles.length} קבצי הסימן לא נמצא תחת ${cfg.corpusDir}` };
  }
  return { ok: true, detail: 'לא הוצהר קורפוס לבדיקה' };
}

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
    // מדדי "תשובה מול פיגום" — ר' invariants.mjs. חייבים לעבור דרך כאן, אחרת
    // שלוש האינווריאנטות מדווחות "לא נמדד" ועוברות ריק.
    scaffoldWordShare: s.scaffoldWordShare,
    copiedWordShare: s.copiedWordShare,
    caseEntities: s.caseEntities,
    // ⚠️ עד 27.7 היה כאן `s.note` — **ההערה הראשונה בלבד**, שהיא כמעט תמיד
    // "הראיות נבחרו בדירוג יחסי". הערת המכסה נדחפת אחריה, ולכן `quota-honesty`
    // לא יכלה לעבור לעולם בסעיף קצר: המנוע הצהיר על החוסר בטיוטה, וההצהרה
    // נחתכה בדרך אל האינווריאנטה. שני צדדים לתיקון — גם nlg-loop-round שומר
    // עכשיו `notes` מלא.
    notes: Array.isArray(s.notes) && s.notes.length ? s.notes : (s.note ? [s.note] : []),
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
    // ⚠️ בלי זה ה-case מקבל את **הקורפוס של מישהו אחר**. nlg-loop-round נופל
    // בהיעדר WORDAI_NLG_COURSE_DIR לרשימת קבצים קשיחה (COURSE_FILES — מצגות קורס
    // הפילוסופיה), ולכן כל case, ויהיה ה-corpusDir שלו אשר יהיה, נסק את אותם
    // קבצים. זה מה שהסתיר את העובדה שקורפוס mill-2026 נעלם מהמכונה: הבנצ' דיווח
    // "0 קטעים" ולא "קורפוס לא נמצא". `courseDir` ב-case.json הוא הדרך שההרנס
    // כבר תוכנן לגדול בה (ר' ההערה מעל courseFileNames).
    ...(caseCfg.courseDir ? { WORDAI_NLG_COURSE_DIR: caseCfg.courseDir } : {}),
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
  // שורש הקורפוס מועבר גם לשכבה 1. קודם היא נשענה על הנפילה הפנימית שלה, ולכן
  // רצה על נתיב אחר מזה של ה-cases — ובמכונה חדשה על נתיב שלא קיים בכלל.
  const code = await run('node', ['tools/test-bench/run-scaffold-e2e.mjs'],
    process.env.WORDAI_SCAFFOLD_CORPUS ? {} : { WORDAI_SCAFFOLD_CORPUS: firstCorpusDir() });
  e2ePass = code === 0;
  console.log(e2ePass ? '✓ רגרסיה עברה' : '✗ רגרסיה נכשלה');
}

// ---------- שכבה 2: יכולת ----------
const casesDir = path.join(BENCH_DIR, 'cases');
const caseIds = fs.readdirSync(casesDir).filter((d) => fs.existsSync(path.join(casesDir, d, 'case.json')));
const results = [];
const skipped = [];

for (const caseId of caseIds) {
  const caseDir = path.join(casesDir, caseId);
  const caseCfg = JSON.parse(fs.readFileSync(path.join(caseDir, 'case.json'), 'utf8'));
  const avail = caseAvailable(caseCfg);
  if (!avail.ok) {
    console.log(`\n═══ שכבה 2: case ${caseId} — ⏭ מדולג ═══\n    ${avail.detail}`);
    skipped.push({ caseId, reason: avail.detail });
    continue;
  }
  const baseText = fs.readFileSync(path.join(caseDir, caseCfg.assignment), 'utf8');
  console.log(`\n═══ שכבה 2: case ${caseId} (זרע ${SEED} · קורפוס: ${avail.detail}) ═══`);

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
  const maxScore = Math.max(...caseRuns.map((r) => r.score));
  const avgScore = Math.round(caseRuns.reduce((a, r) => a + r.score, 0) / caseRuns.length);
  // הפיזור בתוך הריצה = אומדן ישיר לרעש המכשיר. נרשם ומשמש כסבילות בריצה הבאה.
  const spread = maxScore - minScore;
  results.push({
    caseId, minScore, maxScore, avgScore, spread,
    expectedMin: caseCfg.expectations?.minCapabilityScore ?? 0, runs: caseRuns,
  });
}

// ---------- history + פסיקה ----------
// ---------- ⚠️ תצורת הריצה ----------
// run.mjs **אינו** מגדיר את שכבת הניסוח — הוא יורש אותה מהמעטפת (WORDAI_REWRITE).
// עד 27.7 זה לא נרשם בהיסטוריה, ולכן שתי שורות לא היו בנות-השוואה בלי לנחש:
// ריצה במעטפת נקייה מודדת את מסלול הכללים, וריצה עם WORDAI_REWRITE=1 מודדת את
// מסלול הניסוח. ההפרש ביניהן הוא ~12 נקודות (87 מול 99), כלומר **הבדל סביבה
// נראה בדיוק כמו נסיגה** — וזה קרה בפועל.
//
// מכאן התצורה נרשמת, והשוואת הרגרסיה נעשית רק מול ריצה **באותה תצורה**. שער
// שמשווה מסלול אחד לאחר אינו שער אלא מקור לאזעקות שווא.
const CONFIG = [
  process.env.WORDAI_REWRITE === '1' ? `rw:${process.env.WORDAI_REWRITE_BACKEND || 'ollama'}` : 'rw:none',
  process.env.WORDAI_STYLE_FIT === '0' ? 'fit:off' : 'fit:on',
].join('|');

const prev = new Map();
if (fs.existsSync(HISTORY)) {
  for (const line of fs.readFileSync(HISTORY, 'utf8').split('\n').filter(Boolean)) {
    try {
      const e = JSON.parse(line);
      // שורה מלפני שהתצורה נרשמה אינה בת-השוואה לאף תצורה מוצהרת — מדלגים
      // עליה במקום להניח שהיא "כמו הנוכחית".
      if ((e.config || null) !== CONFIG) continue;
      prev.set(e.caseId, e);
    } catch {}
  }
}

const ts = new Date().toISOString();
const commit = gitCommit();
let exitCode = 0;
console.log(`\n═══ סיכום ═══   תצורה: ${CONFIG}`);
if (e2ePass === false) { console.log('✗ שכבת הרגרסיה נכשלה'); exitCode = 1; }

for (const s of skipped) console.log(`⏭ ${s.caseId}: מדולג — ${s.reason}`);
// ⚠️ דילוג על **הכול** אינו הצלחה. בנצ' ששכבת היכולת שלו ריקה מדווח ירוק בלי
// שמדד ולו דבר אחד — וזה בדיוק מצב הכשל השקט שהדילוג נועד למנוע.
if (!results.length) {
  console.log("✗ אף case לא רץ — לשכבת היכולת אין קורפוס. הבנצ' לא מדד כלום.");
  exitCode = 1;
}

for (const r of results) {
  const prevEntry = prev.get(r.caseId);
  const delta = prevEntry ? r.avgScore - prevEntry.avgScore : null;
  const belowExpected = r.minScore < r.expectedMin;
  // הסבילות היא המקסימום בין רצפה קשיחה לבין הפיזור שנמדד — בריצה הקודמת ובזו.
  // שימוש בשתיהן מונע מצב שבו ריצה אחת שבמקרה יצאה צפופה מהדקת את השער לנצח.
  const tolerance = Math.max(MIN_REGRESSION_TOLERANCE, prevEntry?.spread ?? 0, r.spread);
  const regressed = prevEntry && delta < -tolerance;
  const flag = belowExpected || regressed ? '✗' : '✓';
  console.log(`${flag} ${r.caseId}: ממוצע ${r.avgScore} (מינ' ${r.minScore}, פיזור ±${r.spread}, רף ${r.expectedMin}${delta !== null ? `, Δ${delta >= 0 ? '+' : ''}${delta} מול סבילות ${tolerance}` : ''})`);
  if (belowExpected) { console.log(`    מתחת לרף ה-case`); exitCode = 1; }
  if (regressed) { console.log(`    רגרסיה מול הריצה הקודמת (${prevEntry.avgScore} → ${r.avgScore}, מעבר לסבילות ${tolerance})`); exitCode = 1; }
  fs.appendFileSync(HISTORY, JSON.stringify({
    ts, commit, seed: SEED, config: CONFIG,
    caseId: r.caseId, avgScore: r.avgScore, minScore: r.minScore, spread: r.spread,
    runs: r.runs.map((x) => ({ variant: x.variant, score: x.score, written: x.written, blocked: x.blocked, words: x.words, failed: x.invariants.filter((i) => !i.pass).map((i) => i.id) })),
  }) + '\n', 'utf8');
}

console.log(exitCode === 0 ? '\n✓ bench ירוק' : '\n✗ bench אדום');
process.exit(exitCode);
