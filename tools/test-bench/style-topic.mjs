// כמה מפער הסגנון הוא בכלל *נושא* ולא סגנון?
//
// הרקע: הרצפים שהפלט "מגזים" בהם הם «יר» (יקיר), «תמו» (תמונה), «שימ» (שימוש) —
// מילות המקרה של מטלת דיני התקשורת, שאין להן זכר בעבודות המשתמש על נושאים אחרים.
// אם חלק ניכר מהמרחק נובע מהן, אז 47/100 אינו מודד את מה שאנחנו חושבים.
//
// ⚠️ **המלכודת המתודית:** אם נסיר "כל מילה שהמשתמש מעולם לא כתב", הציון ישתפר
// מכנית — כי בדיוק המילים האלה יוצרות את המרחק. זו הנחת המבוקש.
// לכן:
//   1. המונחים נגזרים **מטקסט המטלה**, בלתי תלוי בקורפוס המשתמש.
//   2. ההסרה מוחלת על **הכול** — גם על עבודות המשתמש וגם על הבקרה.
//   3. ומדווח **AUC אחרי ההסרה**: אם המדד מפסיק להבחין בין המשתמש למחברים
//      אחרים, ההסרה הרסה אותו וכל ציון שיצא ממנה חסר ערך.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  buildAuthorProfile, burrowsDelta, tokenizeForStyle, styleMatchScore, MIN_DOC_WORDS,
} from '../../src/services/styleFingerprintService.js';

const CORPUS_DIR = process.env.WORDAI_SCAFFOLD_CORPUS
  || path.join(os.homedir(), 'OneDrive', 'שולחן העבודה', '314999533');
const SELF_DIR = path.join(CORPUS_DIR, 'עבודות והגשות', 'עבודות סופיות');
const PROSE = process.argv[2]
  || 'tools/test-bench/.scaffolde2e-scratch/nlg/claim-relevance-gate/prose-only.txt';
const ASSIGNMENT = 'tools/test-bench/.scaffolde2e-scratch/assignment-media-law.txt';

const hebrewRatio = (s) => {
  const l = String(s || '').match(/[א-תA-Za-z]/g) || [];
  return l.length ? l.filter((c) => /[א-ת]/.test(c)).length / l.length : 0;
};
const readDocx = async (p) => { try { return (await mammoth.extractRawText({ buffer: fs.readFileSync(p) })).value || ''; } catch { return ''; } };
async function readPdf(p) {
  try {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(p)), useSystemFonts: true }).promise;
    const parts = [];
    for (let i = 1; i <= Math.min(doc.numPages, 40); i += 1) {
      const c = await (await doc.getPage(i)).getTextContent();
      parts.push(c.items.map((it) => it.str).join(' '));
    }
    try { await doc.destroy(); } catch {}
    return parts.join('\n\n');
  } catch { return ''; }
}
const readAny = (p) => (/\.docx$/i.test(p) ? readDocx(p) : /\.pdf$/i.test(p) ? readPdf(p) : Promise.resolve(''));
function walk(dir, out = []) {
  let e = [];
  try { e = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const x of e) {
    const f = path.join(dir, x.name);
    if (x.isDirectory()) walk(f, out);
    else if (/\.(docx|pdf)$/i.test(x.name) && !x.name.startsWith('~$')) out.push(f);
  }
  return out;
}
const PURE = /^[֐-׿]{2,}[.,;:!?'"׳״)]?$|^[A-Za-z]{2,}[.,;:!?'")]?$|^\d+([.,]\d+)?$/;
const pureRatio = (t) => {
  const toks = (String(t || '').match(/\S+/g) || []).slice(0, 2000);
  return toks.length < 40 ? 0 : toks.filter((x) => PURE.test(x)).length / toks.length;
};
const usable = (t) => tokenizeForStyle(t).length >= MIN_DOC_WORDS && hebrewRatio(t) >= 0.6 && pureRatio(t) >= 0.5;

const selfDocs = []; const seen = new Set();
for (const p of walk(SELF_DIR)) {
  const t = await readAny(p);
  if (!usable(t)) continue;
  const fp = t.replace(/\s+/g, ' ').trim().slice(0, 400);
  if (seen.has(fp)) continue;
  seen.add(fp); selfDocs.push(t);
}
const selfPaths = new Set(walk(SELF_DIR).map((p) => path.resolve(p)));
const controlDocs = [];
for (const p of walk(CORPUS_DIR)) {
  if (selfPaths.has(path.resolve(p)) || p.includes('טיוטות וגרסאות קודמות')) continue;
  const t = await readAny(p);
  if (!usable(t)) continue;
  controlDocs.push(t);
  if (controlDocs.length >= 40) break;
}
console.log(`עבודות המשתמש: ${selfDocs.length} · בקרה: ${controlDocs.length}`);

const prose = fs.readFileSync(PROSE, 'utf8');
const assignment = fs.readFileSync(ASSIGNMENT, 'utf8');

// ---------- גזירת מונחי הנושא מטקסט המטלה בלבד ----------
const STOP = new Set(['אשר', 'אשרה', 'לפי', 'כאשר', 'עליו', 'עליהם', 'אותו', 'אותם', 'כדי', 'בגין', 'לאחר', 'בפני', 'מתוך', 'כלפי', 'בתוך', 'ולא', 'הוא', 'היא', 'הם', 'יש', 'אין', 'כל', 'זה', 'זו', 'את', 'של', 'על', 'עם', 'כי', 'גם', 'אך', 'או']);
const NAMES = ['משה', 'יקיר', 'דליה', 'אברהם', 'דניאל', 'יצחק'];
// שמות פרטיים = ודאי לא סגנון, בדיוק כמו שם המחבר שכבר מנוטרל ב-style-eval.
// מעבר להם: המילים השכיחות ביותר בטקסט המטלה — נגזר אוטומטית, לא נבחר ביד.
const freq = new Map();
for (const w of assignment.match(/[א-ת]{4,}/g) || []) {
  if (STOP.has(w)) continue;
  freq.set(w, (freq.get(w) || 0) + 1);
}
const topicNouns = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([w]) => w);
console.log(`\nשמות המקרה: ${NAMES.join(' · ')}`);
console.log(`20 המילים השכיחות במטלה (אוטומטי): ${topicNouns.join(' · ')}\n`);

const aucOf = (s, o) => {
  let wins = 0;
  for (const a of s) for (const b of o) if (a < b) wins += 1;
  return wins / (s.length * o.length);
};
const windows = (t) => {
  const out = [];
  for (let i = 0; i + 800 <= t.length && out.length < 8; i += 2200) out.push(t.slice(i, i + 2200));
  return out;
};

function evaluate(label, stripTerms) {
  // ולידציה: leave-one-out אחרי אותה הסרה בדיוק, על כל הצדדים.
  const ctlW = controlDocs.flatMap(windows);
  const s = []; const o = [];
  for (let i = 0; i < selfDocs.length; i += 1) {
    const p = buildAuthorProfile(selfDocs.filter((_, j) => j !== i), {
      referenceDocs: controlDocs, stripTerms,
    });
    if (!p) continue;
    for (const w of windows(selfDocs[i])) { const r = burrowsDelta(w, p); if (r) s.push(r.cosineDelta); }
    for (const w of ctlW) { const r = burrowsDelta(w, p); if (r) o.push(r.cosineDelta); }
  }
  const auc = aucOf(s, o);
  const selfAvg = s.reduce((a, b) => a + b, 0) / s.length;
  const otherAvg = o.reduce((a, b) => a + b, 0) / o.length;

  const full = buildAuthorProfile(selfDocs, { referenceDocs: controlDocs, stripTerms });
  const r = burrowsDelta(prose, full);
  const score = styleMatchScore(r.cosineDelta, { selfDelta: selfAvg, otherDelta: otherAvg });
  console.log(`${label.padEnd(34)} AUC ${auc.toFixed(3)} · מרחק ${r.cosineDelta.toFixed(3)} (עצמי ${selfAvg.toFixed(3)} · אחר ${otherAvg.toFixed(3)}) → ציון ${score}/100`);
  return { auc, score };
}

console.log('─'.repeat(96));
evaluate('בסיס (כלום לא מנוטרל)', []);
evaluate('בלי שמות המקרה', NAMES);
evaluate('בלי שמות + 20 מילות המטלה', [...NAMES, ...topicNouns]);
console.log('─'.repeat(96));
console.log('⚠️ ציון תקף רק אם ה-AUC נשאר ≥0.8. AUC שקורס = ההסרה הרסה את המדד.');
