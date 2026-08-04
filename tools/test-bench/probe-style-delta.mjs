// probe-style-delta.mjs — האם ה-Delta האישי בכלל יציב ביחידת **סעיף** (100-220 מילים)?
//
//   node tools/test-bench/probe-style-delta.mjs
//   WORDAI_SCAFFOLD_CORPUS=<dir>     שורש הקורפוס
//   WORDAI_PROBE_WORDS=160           גודל המדגם במילים (ברירת מחדל 160)
//   WORDAI_PROBE_SAMPLES=10          כמה מדגמים לכל צד
//
// ⚠️ הרקע: MIN_DOC_WORDS=250 הוא הסף שבו buildAuthorProfile מוכן בכלל לספור מסמך.
// שכבת בחירת-הווריאנטים במנוע רוצה לנקד סעיפים של 100-220 מילים — **מתחת** לסף.
// לפני שמחליפים את הדטקטור הגנרי במדד האישי חייבים לדעת אם ברזולוציה הזו יש
// אות או רק רעש. הפרוב מודד בדיוק את זה: פיזור cosineDelta על מדגמים בגודל סעיף,
// עצמי מול בקרה, ומול חלונות 2200 תווים (הרזולוציה שבה המדד אומת ל-AUC 0.945).
//
// אין bundling — styleFingerprintService הוא LEAF.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  buildAuthorProfile, burrowsDelta, tokenizeForStyle, styleMatchScore, MIN_DOC_WORDS,
} from '../../src/services/styleFingerprintService.js';

const CORPUS_DIR = process.env.WORDAI_SCAFFOLD_CORPUS
  || path.join(os.homedir(), 'OneDrive', 'שולחן העבודה', '314999533');
const SELF_DIR = path.join(CORPUS_DIR, 'עבודות והגשות', 'עבודות סופיות');
const SAMPLE_WORDS = Number(process.env.WORDAI_PROBE_WORDS || 160);
const SAMPLES = Number(process.env.WORDAI_PROBE_SAMPLES || 10);
// ⚠️ fileURLToPath ולא pathname.slice(1): נתיב הפרויקט מכיל רווח, ו-pathname מחזיר
// אותו מקודד (%20) — הקריאה נכשלת בשקט וסעיף העוגנים פשוט לא מודפס.
const ANCHORS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'style-anchors.json');

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
const usable = (text) => tokenizeForStyle(text).length >= MIN_DOC_WORDS
  && hebrewRatio(text) >= 0.6 && pureTokenRatio(text) >= 0.5;

async function readDocx(p) {
  try { return (await mammoth.extractRawText({ buffer: fs.readFileSync(p) })).value || ''; } catch { return ''; }
}
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
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(docx|pdf)$/i.test(e.name) && !e.name.startsWith('~$')) out.push(full);
  }
  return out;
}

if (!fs.existsSync(SELF_DIR)) { console.log(`✗ תיקיית העבודות לא נמצאה: ${SELF_DIR}`); process.exit(1); }

const selfDocs = [];
const seen = new Set();
for (const p of walk(SELF_DIR)) {
  const text = await readAny(p);
  if (!usable(text)) continue;
  const fp = text.replace(/\s+/g, ' ').trim().slice(0, 400);
  if (seen.has(fp)) continue;
  seen.add(fp);
  selfDocs.push({ name: path.basename(p), text });
}
const selfPaths = new Set(walk(SELF_DIR).map((p) => path.resolve(p)));
const controlDocs = [];
for (const p of walk(CORPUS_DIR)) {
  if (selfPaths.has(path.resolve(p))) continue;
  if (p.includes('טיוטות וגרסאות קודמות')) continue;
  const text = await readAny(p);
  if (!usable(text)) continue;
  controlDocs.push({ name: path.basename(p), text });
  if (controlDocs.length >= 40) break;
}
console.log(`עצמי: ${selfDocs.length} מסמכים · בקרה: ${controlDocs.length}`);
if (selfDocs.length < 3 || controlDocs.length < 3) { console.log('✗ קורפוס דל מדי'); process.exit(1); }

// מדגם בגודל סעיף: חיתוך לפי **מילים**, לא תווים — זו יחידת הייצור.
function wordSlices(text, words, count) {
  const toks = String(text || '').split(/\s+/).filter(Boolean);
  const out = [];
  const stride = Math.max(words, Math.floor((toks.length - words) / Math.max(1, count)) || words);
  for (let i = 0; i + words <= toks.length && out.length < count; i += stride) {
    out.push(toks.slice(i, i + words).join(' '));
  }
  return out;
}
function charWindows(text, chars, count) {
  const s = String(text || '');
  const out = [];
  for (let i = 0; i + 800 <= s.length && out.length < count; i += chars) out.push(s.slice(i, i + chars));
  return out;
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const sd = (a) => (a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - mean(a)) ** 2, 0) / (a.length - 1)) : NaN);
const aucOf = (s, o) => {
  if (!s.length || !o.length) return NaN;
  let w = 0;
  for (const x of s) for (const y of o) if (x < y) w += 1;
  return w / (s.length * o.length);
};
const fmt = (a) => `μ=${mean(a).toFixed(4)} σ=${sd(a).toFixed(4)} [${Math.min(...a).toFixed(4)}–${Math.max(...a).toFixed(4)}]`;

let anchors = null;
try { anchors = JSON.parse(fs.readFileSync(ANCHORS_FILE, 'utf8')); } catch {}

// ⚠️ leave-one-out: המסמך שממנו נגזרים המדגמים העצמיים **יוצא** מהפרופיל.
// בלי זה המדגם מודד את עצמו והפיזור נראה קטן בטעות.
function runAt(label, sampler) {
  const selfVals = [];
  const otherVals = [];
  const perDoc = [];
  for (let i = 0; i < selfDocs.length; i += 1) {
    const own = sampler(selfDocs[i].text);
    if (!own.length) continue;
    const profile = buildAuthorProfile(
      selfDocs.filter((_, j) => j !== i).map((d) => d.text),
      { referenceDocs: controlDocs.map((c) => c.text) },
    );
    if (!profile) continue;
    const vals = own.map((w) => burrowsDelta(w, profile)?.cosineDelta).filter(Number.isFinite);
    selfVals.push(...vals);
    if (vals.length > 1) perDoc.push(sd(vals));
    // בקרה מנוקדת מול אותו פרופיל בדיוק
    for (const c of controlDocs.slice(0, 12)) {
      for (const w of sampler(c.text)) {
        const r = burrowsDelta(w, profile);
        if (r && Number.isFinite(r.cosineDelta)) otherVals.push(r.cosineDelta);
      }
    }
  }
  console.log(`\n═══ ${label} ═══`);
  console.log(`  עצמי  (${selfVals.length} מדגמים):  ${fmt(selfVals)}`);
  console.log(`  בקרה  (${otherVals.length} מדגמים):  ${fmt(otherVals)}`);
  console.log(`  σ תוך-מסמכי ממוצע (רעש בין מדגמים של אותו מחבר): ${mean(perDoc).toFixed(4)}`);
  const sep = mean(otherVals) - mean(selfVals);
  console.log(`  הפרדה (μ בקרה − μ עצמי): ${sep.toFixed(4)}  ·  יחס אות/רעש = ${(sep / mean(perDoc)).toFixed(2)}`);
  console.log(`  AUC: ${aucOf(selfVals, otherVals).toFixed(3)}`);
  if (anchors) {
    const sc = (v) => styleMatchScore(v, { selfDelta: anchors.selfDelta, otherDelta: anchors.otherDelta });
    const selfScores = selfVals.map(sc).filter((x) => x != null);
    const otherScores = otherVals.map(sc).filter((x) => x != null);
    console.log(`  styleMatchScore מול העוגנים — עצמי ${mean(selfScores).toFixed(1)}±${sd(selfScores).toFixed(1)} · בקרה ${mean(otherScores).toFixed(1)}±${sd(otherScores).toFixed(1)}`);
    console.log(`  נקודות רוויה (0 או 100): עצמי ${selfScores.filter((x) => x === 0 || x === 100).length}/${selfScores.length} · בקרה ${otherScores.filter((x) => x === 0 || x === 100).length}/${otherScores.length}`);
  }
  return { selfVals, otherVals, perDocSd: mean(perDoc) };
}

runAt(`מדגם בגודל סעיף — ${SAMPLE_WORDS} מילים (${SAMPLES} לכל מסמך)`, (t) => wordSlices(t, SAMPLE_WORDS, SAMPLES));
runAt('מדגם בגודל סעיף — 100 מילים', (t) => wordSlices(t, 100, SAMPLES));
runAt('מדגם בגודל סעיף — 220 מילים', (t) => wordSlices(t, 220, SAMPLES));
runAt('בסיס: חלון 2200 תווים (~370 מילים) — הרזולוציה שאומתה', (t) => charWindows(t, 2200, 8));
