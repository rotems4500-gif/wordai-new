// real-instructions-probe.mjs — מריץ את parseAssignmentSpec על **הנחיות מרצה
// אמיתיות** ומראה מה יצא.
//
// למה: הפרסר כויל על הנחיות שאני כתבתי, ולכן הוא מצטיין בדיוק בפורמט שדמיינתי.
// זו הבדיקה שאומרת כמה זה שווה על מטלות אמיתיות. אין כאן ✓/✗ — יש פלט לקריאה,
// כי "מה נכון" דורש עין אנושית על ההנחיה עצמה.
//
// אפס קריאות API — הפרסר דטרמיניסטי.
//
// הרצה: node tools/test-bench/run-real-instructions-probe.mjs

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

const { parseAssignmentSpec, INTENT_LABELS } = await import('specsvc');

const CORPUS = process.env.WORDAI_CORPUS_OUT
  || 'C:/Users/rotem/AppData/Local/Temp/claude/C--Users-rotem-Projects--wordai-new/5dfe23d5-acbf-4f96-9551-9997128f4b6f/scratchpad/real-corpus';
const DIR = path.join(CORPUS, 'instructions');
const ONLY = process.env.WORDAI_PROBE_ONLY || '';

const files = (await readdir(DIR)).filter((f) => f.endsWith('.txt')).sort();
const rows = [];

for (const file of files) {
  const raw = await readFile(path.join(DIR, file), 'utf8');
  const firstLine = raw.split('\n', 1)[0].replace(/^#\s*/, '');
  const body = raw.split('\n').slice(2).join('\n');
  if (ONLY && !file.includes(ONLY) && !firstLine.includes(ONLY)) continue;

  const spec = parseAssignmentSpec(body);
  rows.push({ file, source: firstLine, spec, chars: body.length });
}

// ---- דוח לקריאה ----
for (const { file, source, spec, chars } of rows) {
  console.log(`\n${'═'.repeat(78)}`);
  console.log(`📄 ${source}`);
  console.log(`   ${file} · ${chars} תווים · confidence ${spec.confidence}`);
  console.log('─'.repeat(78));
  console.log(`כותרת:   ${spec.title}`);
  console.log(`היקף:    ${spec.totalWords ?? '—'}${spec.quotaKind ? ` (${spec.quotaKind})` : ''}`);
  console.log(`ציטוט:   ${spec.citationStyle ?? '—'}   מקורות: ${spec.sourceRequirement ? `${spec.sourceRequirement.count} (${spec.sourceRequirement.kind})` : '—'}`);
  console.log(`תאריך:   ${spec.dueDate ?? '—'}`);
  console.log(`סעיפים (${spec.sections.length}):`);
  spec.sections.forEach((s, i) => {
    console.log(`  ${i + 1}. [${INTENT_LABELS[s.intent] || s.intent}] ${String(s.title).slice(0, 66)}`);
    console.log(`     מכסה ${s.wordQuota || '—'}${s.quotaSource ? ` (${s.quotaSource})` : ''} · הנחיה: ${String(s.instructions || '').replace(/\s+/g, ' ').slice(0, 90)}`);
  });
  if (spec.warnings?.length) console.log(`⚠  ${spec.warnings.join(' · ')}`);
}

// ---- סיכום כמותי: איפה הפרסר שותק ----
console.log(`\n${'═'.repeat(78)}\nסיכום על ${rows.length} הנחיות אמיתיות\n${'═'.repeat(78)}`);
const n = rows.length;
const pct = (k) => `${Math.round((k / n) * 100)}%`;
const noSections = rows.filter((r) => r.spec.sections.length === 0);
const oneSection = rows.filter((r) => r.spec.sections.length === 1);
const manySections = rows.filter((r) => r.spec.sections.length > 8);
const noQuota = rows.filter((r) => !r.spec.totalWords);
const noCite = rows.filter((r) => !r.spec.citationStyle);
const noSources = rows.filter((r) => !r.spec.sourceRequirement);
const derivedOnly = rows.filter((r) => r.spec.sections.length && r.spec.sections.every((s) => s.quotaSource === 'derived'));
const allExposition = rows.filter((r) => r.spec.sections.length > 1 && new Set(r.spec.sections.map((s) => s.intent)).size === 1);
const longTitles = rows.filter((r) => r.spec.sections.some((s) => String(s.title).length > 80));

const line = (label, list) => console.log(`${label.padEnd(38)} ${String(list.length).padStart(3)} / ${n}  ${pct(list.length)}`);
line('בלי סעיפים בכלל', noSections);
line('סעיף אחד בלבד (כנראה כשל פיצול)', oneSection);
line('יותר מ-8 סעיפים (כנראה פיצול יתר)', manySections);
line('בלי היקף כולל', noQuota);
line('בלי סגנון ציטוט', noCite);
line('בלי דרישת מקורות', noSources);
line('כל המכסות נגזרו (אף אחת לא זוהתה)', derivedOnly);
line('כל הסעיפים באותה כוונה', allExposition);
line('כותרת סעיף ארוכה מ-80 תווים', longTitles);

console.log('\nהחשודים המיידיים:');
[...noSections, ...oneSection].slice(0, 10).forEach((r) => console.log(`  · ${r.source.slice(0, 70)} → ${r.spec.sections.length} סעיפים`));
