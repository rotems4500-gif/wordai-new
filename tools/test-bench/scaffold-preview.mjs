// scaffold-preview.mjs — מציג את השלד כפי שהמשתמש יראה אותו במסמך, ממטלה אמיתית.
//
// שתי שאלות נפרדות, ובכוונה מופרדות:
//   1. **מבנה השלד** — כותרות, סדר, מכסות. לא דורש פרופיל אישי. רץ כאן.
//   2. **משפט הפתיחה** — נשען על הקורפוס האישי (styleSampleStore ב-IndexedDB).
//      ב-Node הקורפוס ריק, ולכן כאן רואים רק את התנהגות הנפילה. הבדיקה
//      האמיתית חייבת לרוץ בדפדפן עם החשבון של רותם מחובר.
//
// הרצה: node tools/test-bench/run-scaffold-preview.mjs [חלק-משם-הקובץ]

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

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
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  addEventListener() {}, removeEventListener() {},
  querySelector: () => null, querySelectorAll: () => [],
  body: { appendChild() {}, removeChild() {} }, documentElement: { style: {} },
};
globalThis.addEventListener = globalThis.addEventListener || (() => {});
globalThis.removeEventListener = globalThis.removeEventListener || (() => {});
globalThis.dispatchEvent = globalThis.dispatchEvent || (() => true);
if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent { constructor(t, o = {}) { this.type = t; this.detail = o.detail; } };
}

let netCalls = 0;
{ const real = globalThis.fetch; globalThis.fetch = async (...a) => { netCalls += 1; return real(...a); }; }

const { parseAssignmentSpec, INTENT_LABELS } = await import('specsvc');
const { buildScaffoldHtml } = await import('scaffolddoc');
const openers = await import('openersvc');

const CORPUS = process.env.WORDAI_CORPUS_OUT
  || 'C:/Users/rotem/AppData/Local/Temp/claude/C--Users-rotem-Projects--wordai-new/5dfe23d5-acbf-4f96-9551-9997128f4b6f/scratchpad/real-corpus';
const DIR = path.join(CORPUS, 'instructions');
const PICK = process.env.WORDAI_PREVIEW_PICK || 'דצנמ';

const files = (await readdir(DIR)).filter((f) => f.endsWith('.txt')).sort();
let chosen = null;
for (const file of files) {
  const raw = await readFile(path.join(DIR, file), 'utf8');
  const name = raw.split('\n', 1)[0].replace(/^#\s*/, '');
  if (name.includes(PICK)) { chosen = { name, body: raw.split('\n').slice(2).join('\n') }; break; }
}
if (!chosen) { console.error(`לא נמצאה מטלה שמכילה "${PICK}"`); process.exit(1); }

console.log(`📄 ${chosen.name}\n${'═'.repeat(76)}`);

const spec = parseAssignmentSpec(chosen.body);

// ---- 1. מה שהמשתמש יראה בעורך ----
console.log('\n▓▓▓ המסמך שנפתח בעורך ▓▓▓\n');
const html = buildScaffoldHtml(spec);
// רינדור גס של ה-HTML לטקסט, כדי לראות את המסמך כמו שהוא ייראה.
console.log(html
  .replace(/<h1>(.*?)<\/h1>/g, (_, t) => `\n${'━'.repeat(60)}\n${t}\n${'━'.repeat(60)}`)
  .replace(/<h2>(.*?)<\/h2>/g, (_, t) => `\n■ ${t}`)
  .replace(/<ul>/g, '').replace(/<\/ul>/g, '')
  .replace(/<li><em>(.*?)<\/em><\/li>/g, (_, t) => `   • ${t}`)
  .replace(/<p><em>(.*?)<\/em><\/p>/g, (_, t) => `   ${t}`)
  .replace(/<p><\/p>/g, '   ·')
  .replace(/<[^>]+>/g, ''));

// ---- 2. מטא-דאטה ----
console.log(`\n${'═'.repeat(76)}\n▓▓▓ מה נגזר מההנחיות ▓▓▓\n`);
console.log(`היקף כולל : ${spec.totalWords ?? '—'}`);
console.log(`ציטוט     : ${spec.citationStyle ?? '—'}`);
console.log(`מקורות    : ${spec.sourceRequirement ? `${spec.sourceRequirement.count} (${spec.sourceRequirement.kind})` : '—'}`);
console.log(`הגשה      : ${spec.dueDate ?? '—'}`);
console.log(`ודאות     : ${spec.confidence}`);
if (spec.warnings?.length) spec.warnings.forEach((w) => console.log(`⚠ ${w}`));

// ---- 3. משפטי הפתיחה ----
console.log(`\n${'═'.repeat(76)}\n▓▓▓ משפטי פתיחה לכל סעיף ▓▓▓\n`);
await openers.ensureOpenersReady().catch(() => {});
const stats = openers.getOpenerStatus?.() || null;
console.log(`מצב הקורפוס האישי: ${stats ? JSON.stringify(stats) : '(אין getOpenerStatus)'}\n`);

for (const s of spec.sections) {
  const list = openers.getOpenersForIntent(s.intent, { limit: 3 }) || [];
  console.log(`■ ${s.title}  [${INTENT_LABELS[s.intent] || s.intent}]`);
  if (!list.length) {
    console.log('   (אין פתיח — הקורפוס האישי ריק בסביבה הזו)');
  } else {
    list.forEach((o) => console.log(`   › ${typeof o === 'string' ? o : JSON.stringify(o)}`));
  }
}

console.log(`\n${'═'.repeat(76)}`);
console.log(`קריאות רשת: ${netCalls} ${netCalls === 0 ? '✓ הכול מקומי' : ''}`);
console.log('\nמשפטי הפתיחה נגזרים מהקורפוס האישי ולכן ריקים כאן.');
console.log('הבדיקה האמיתית: דפדפן, חשבון מחובר, פרופיל סגנון טעון.');
