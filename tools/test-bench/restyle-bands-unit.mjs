// restyle-bands-unit.mjs — בדיקת יחידה למיפוי סליידר "עוצמת שכתוב" → רצועה
// (resolveRestyleBand). **אפס קריאות API ואפס I/O** — המיפוי הוא פונקציה טהורה.
//
// הרצה: node tools/test-bench/restyle-bands-unit.mjs
//
// הקובץ הוא גם הרץ וגם ה-entry: restyleAggressiveness מייבא את aiService, שכולל
// ייבואים ללא סיומת ואינו נטען ישירות ב-Node. לכן ריצה ישירה בונה קודם bundle
// דרך vite.verify.config.mjs (כמו שאר ה-harnesses) ואז מריצה את העותק הבנוי.
// דילוג על בנייה מחדש: WORDAI_RESTYLE_REBUILD=0

if (!process.env.WORDAI_RESTYLE_INNER) {
  const { spawn } = await import('node:child_process');
  const path = await import('node:path');
  const { fileURLToPath, pathToFileURL } = await import('node:url');

  const DIR = path.dirname(fileURLToPath(import.meta.url));
  const PROJECT = path.resolve(DIR, '..', '..');
  const SCRATCH = process.env.WORDAI_VERIFY_SCRATCH
    || path.join(process.env.LOCALAPPDATA || DIR, 'Temp', 'wordai-restyle-unit');
  const BUNDLE = path.join(SCRATCH, 'out-restyle', 'sf.mjs');

  const run = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    p.on('error', reject);
  });

  if (process.env.WORDAI_RESTYLE_REBUILD !== '0') {
    console.log('building harness bundle…');
    await run('npx', ['vite', 'build', '--config', 'vite.verify.config.mjs'], {
      cwd: PROJECT,
      env: { ...process.env, WORDAI_VERIFY_ENTRY: 'restyle', WORDAI_VERIFY_SCRATCH: SCRATCH },
    });
  }

  // shell:false — נתיב ה-node ("C:\\Program Files\\...") אינו מצוטט תחת shell.
  await run(process.execPath, [BUNDLE], {
    cwd: PROJECT,
    shell: false,
    env: { ...process.env, WORDAI_RESTYLE_INNER: '1' },
  }).catch(() => process.exit(1));
  process.exit(0);
}

// ── מכאן ומטה: רץ בתוך ה-bundle (WORDAI_RESTYLE_INNER=1) ────────────────────
globalThis.window = globalThis;
globalThis.self = globalThis;
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k), clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; },
};
if (typeof globalThis.navigator === 'undefined') globalThis.navigator = { userAgent: 'node-lab', language: 'he' };
globalThis.document = {
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }),
  createTextNode: () => ({}), addEventListener() {}, removeEventListener() {},
  querySelector: () => null, querySelectorAll: () => [],
  body: { appendChild() {}, removeChild() {} }, documentElement: { style: {} }, hidden: false,
};
globalThis.addEventListener = globalThis.addEventListener || (() => {});
globalThis.removeEventListener = globalThis.removeEventListener || (() => {});
globalThis.dispatchEvent = globalThis.dispatchEvent || (() => true);
if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent { constructor(t, o = {}) { this.type = t; this.detail = o.detail; } };
}

const { RESTYLE_BANDS, resolveRestyleBand } = await import('restyleband');

let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
};

// ── 1. גבולות הרצועות ───────────────────────────────────────────────────────
const boundaries = [
  [0, 'gentle'], [25, 'gentle'],
  [26, 'balanced'], [55, 'balanced'],
  [56, 'strong'], [80, 'strong'],
  [81, 'aggressive'], [100, 'aggressive'],
];
for (const [value, id] of boundaries) {
  const got = resolveRestyleBand(value).id;
  check(`1. ${value} → ${id}`, got === id, `got ${got}`);
}

// ── 2. צביטה מחוץ לטווח ─────────────────────────────────────────────────────
check('2a. -5 נצבט לרצועה העדינה', resolveRestyleBand(-5).id === 'gentle', resolveRestyleBand(-5).id);
check('2b. 150 נצבט לרצועה האגרסיבית', resolveRestyleBand(150).id === 'aggressive', resolveRestyleBand(150).id);

// ── 3. ברירת המחדל (40) = ההתנהגות שהייתה קשיחה בקוד לפני הסליידר ───────────
{
  const band = resolveRestyleBand(40);
  check('3a. 40 → balanced', band.id === 'balanced', band.id);
  check('3b. temperature 0.4', band.temperature === 0.4, String(band.temperature));
  check('3c. רצועת אורך 0.6–1.6', band.minLenRatio === 0.6 && band.maxLenRatio === 1.6, `${band.minLenRatio}–${band.maxLenRatio}`);
  check('3d. styleGateDelta 1', band.styleGateDelta === 1, String(band.styleGateDelta));
  check('3e. minRestyleChars 40', band.minRestyleChars === 40, String(band.minRestyleChars));
  check('3f. בלי תוספת prompt (התנהגות זהה להיום)', band.promptSuffix === '', JSON.stringify(band.promptSuffix));
  check('3g. לא נוגע בכותרות ולא מוגבל למסומנות', band.includeTitles === false && band.onlyFlagged === false);
}

// ── 4. שלמות טבלת הרצועות: כיסוי רציף של 0-100 ─────────────────────────────
{
  const ids = new Set();
  let covered = true;
  for (let v = 0; v <= 100; v += 1) {
    const band = resolveRestyleBand(v);
    if (!band) { covered = false; break; }
    ids.add(band.id);
  }
  check('4a. כל ערך 0-100 ממופה לרצועה', covered);
  check('4b. ארבע רצועות בשימוש', ids.size === 4 && RESTYLE_BANDS.length === 4, `${ids.size}/${RESTYLE_BANDS.length}`);
}

console.log(`\nrestyle-bands-unit: ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
