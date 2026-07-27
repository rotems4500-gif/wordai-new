// style-eval.mjs — האם המדד "נשמע כמוך" באמת עובד?
//
//   node tools/test-bench/style-eval.mjs
//   WORDAI_SCAFFOLD_CORPUS=<dir>   שורש הקורפוס (ברירת מחדל: OneDrive/שולחן העבודה/314999533)
//
// זהו **שער ולידציה**, לא ציון. לפני שמותר להשתמש ב-Delta כדי לשפוט את המנוע,
// צריך להוכיח שהוא מבחין בין המשתמש למחבר אחר. הבדיקה:
//
//   leave-one-out: לכל עבודה של המשתמש — בונים פרופיל מכל *שאר* עבודותיו,
//   ומודדים Delta של (א) העבודה שהוחזקה בצד, (ב) כל טקסט הבקרה.
//   מדד תקין ⇒ (א) נמוך מ-(ב) באופן עקבי.
//
// ⚠️ הבקרה חייבת להיות **עברית ומאותו ז'אנר**. בקרה באנגלית הייתה נותנת הפרדה
// מושלמת שמודדת שפה ולא מחבר — מספר יפה חסר ערך.
//
// אין כאן bundling: styleFingerprintService הוא LEAF בלי שום import, ולכן Node
// טוען אותו ישירות.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  buildAuthorProfile, burrowsDelta, tokenizeForStyle, styleMatchScore, MIN_DOC_WORDS,
  structuralFeatures, stripNonAuthorial, STRUCTURAL_KEYS, STRUCTURAL_LABELS,
} from '../../src/services/styleFingerprintService.js';

const CORPUS_DIR = process.env.WORDAI_SCAFFOLD_CORPUS
  || path.join(os.homedir(), 'OneDrive', 'שולחן העבודה', '314999533');
// עבודות המשתמש עצמו. רק "עבודות סופיות" — תיקיית הטיוטות מכילה גרסאות כמעט
// זהות לסופיות, והן היו מזליגות את מבחן ה-leave-one-out (העבודה שהוחזקה בצד
// יושבת כמעט במלואה בתוך הפרופיל).
const SELF_DIR = path.join(CORPUS_DIR, 'עבודות והגשות', 'עבודות סופיות');

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
    try { await doc.destroy(); } catch {}
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

// ---------- איסוף ----------

// ⚠️ שער איכות-חילוץ. PDF עברי עם קידוד גופן שבור מחזיר ג'יבריש ("(Ntur: nttxnt"),
// וג'יבריש הוא **קבוצת ביקורת חסרת ערך**: יש לו חתימה סטטיסטית אחידה משלו, ולכן
// כל טקסטי הבקרה מתכנסים לאותו Delta והמדד נראה כאילו הוא לא מבחין. נמדד בפועל —
// עם בקרות משובשות ה-culling לא מצא ולו מילה אחת שמופיעה ב-60% מהמסמכים.
// אותה נוסחה בדיוק כמו pureTokenRatio ב-scaffold-e2e ו-isChunkGarbled ב-materialChunkStore.
const PURE_TOKEN_RE = /^[֐-׿]{2,}[.,;:!?'"׳״)]?$|^[A-Za-z]{2,}[.,;:!?'")]?$|^\d+([.,]\d+)?$/;
function pureTokenRatio(text) {
  const tokens = (String(text || '').match(/\S+/g) || []).slice(0, 2000);
  if (tokens.length < 40) return 0;
  return tokens.filter((t) => PURE_TOKEN_RE.test(t)).length / tokens.length;
}
const GARBLE_FLOOR = 0.5;

let rejectedGarbled = 0;
const usable = (text) => {
  if (tokenizeForStyle(text).length < MIN_DOC_WORDS) return false;
  if (hebrewRatio(text) < 0.6) return false;
  if (pureTokenRatio(text) < GARBLE_FLOOR) { rejectedGarbled += 1; return false; }
  return true;
};

console.log(`קורפוס: ${CORPUS_DIR}`);
if (!fs.existsSync(SELF_DIR)) {
  console.log(`✗ תיקיית העבודות של המשתמש לא נמצאה: ${SELF_DIR}`);
  process.exit(1);
}

const selfDocs = [];
const seen = new Set();
for (const p of walk(SELF_DIR)) {
  const text = await readAny(p);
  if (!usable(text)) continue;
  // דה-דופ גרסאות כמעט-זהות (אותה פתיחה) — אחרת אותה עבודה נספרת פעמיים.
  const fp = text.replace(/\s+/g, ' ').trim().slice(0, 400);
  if (seen.has(fp)) continue;
  seen.add(fp);
  selfDocs.push({ name: path.basename(p), text });
}

const selfPaths = new Set(walk(SELF_DIR).map((p) => path.resolve(p)));
const controlDocs = [];
for (const p of walk(CORPUS_DIR)) {
  if (selfPaths.has(path.resolve(p))) continue;
  // גם תיקיית הטיוטות היא המשתמש — לא בקרה.
  if (p.includes('טיוטות וגרסאות קודמות')) continue;
  const text = await readAny(p);
  if (!usable(text)) continue;
  controlDocs.push({ name: path.basename(p), text });
  if (controlDocs.length >= 40) break;
}

console.log(`עבודות המשתמש: ${selfDocs.length} · בקרה (עברית, מחברים אחרים): ${controlDocs.length} · נדחו כמשובשי-חילוץ: ${rejectedGarbled}`);
if (selfDocs.length < 3) { console.log('✗ פחות מ-3 עבודות — אין מספיק ל-leave-one-out'); process.exit(1); }
if (controlDocs.length < 3) { console.log('✗ פחות מ-3 טקסטי בקרה עבריים'); process.exit(1); }

// ---------- leave-one-out ----------

// אבחון: אילו מילים שרדו את ה-culling. אם רואים כאן מילות נושא ולא מילות
// פונקציה — המדד מודד נושא, וכל ציון שיצא ממנו חסר ערך.
{
  const p = buildAuthorProfile(selfDocs.map((d) => d.text), { referenceDocs: controlDocs.map((c) => c.text) });
  console.log(p
    ? `\nתכונות אחרי culling: ${p.words.length} n-גרמים · דוגמה: ${p.words.slice(0, 22).map((g) => `«${g}»`).join(' ')}\n`
    : '\n⚠ הפרופיל חזר null\n');
}

// ⚠️ יחידת המדידה = יחידת הייצור. המנוע מייצר סעיפים של 150-400 מילים, ולכן
// אין טעם לאמת את המדד על מסמכים שלמים: מדד שמבחין בין עבודות בנות 5,000 מילים
// עלול להיות חסר אונים על פסקה בודדת, וזה מה שנצטרך לשפוט בפועל.
// בונוס: חלוקה לחלונות מכפילה את גודל המדגם (23 מסמכים → מאות נקודות).
const WINDOW_CHARS = 2200;

function windows(text) {
  const s = String(text || '');
  const out = [];
  for (let i = 0; i + 800 <= s.length && out.length < 8; i += WINDOW_CHARS) {
    out.push(s.slice(i, i + WINDOW_CHARS));
  }
  return out;
}

// ---------- מבחני תקפות ----------
// שני חשדות שחייבים להיסגר לפני שסומכים על ה-AUC:
//   א. שם המחבר. "רותם" מופיע בעבודותיו ולא של אחרים ⇒ המדד לומד חתימה, לא סגנון.
//   ב. פורמט הקובץ. כל עבודות המשתמש הן .docx ורוב הבקרה .pdf; @paraSents נמדד
//      1.47 מול 7.04 — פער שיכול לשקף חילוץ ולא כתיבה.
// כל אחד מהם היה מנפח את התוצאה בלי לשפר את המוצר ולו במעט.
const AUTHOR_TERMS = (process.env.WORDAI_STYLE_AUTHOR_TERMS || 'רותם,לב שפירו,שפירו,כהן')
  .split(',').map((s) => s.trim()).filter(Boolean);
const docxControls = controlDocs.filter((c) => /\.docx$/i.test(c.name));

const controlWindows = controlDocs.flatMap((c) => windows(c.text));
console.log(`חלונות: בקרה ${controlWindows.length} · ${WINDOW_CHARS} תווים כל אחד (≈${Math.round(WINDOW_CHARS / 6)} מילים)\n`);

const selfDeltas = [];
const otherDeltas = [];
const selfCos = [];
const otherCos = [];
let folds = 0;
const folds_ = [];   // תוצאת כל קיפול, לשני המרחקים

// AUC = ההסתברות שחלון אקראי של המשתמש ידורג קרוב יותר מחלון בקרה אקראי.
const aucOf = (self, other) => {
  if (!self.length || !other.length) return NaN;
  let wins = 0;
  for (const s of self) for (const o of other) if (s < o) wins += 1;
  return wins / (self.length * other.length);
};

for (let i = 0; i < selfDocs.length; i += 1) {
  const heldOut = selfDocs[i];
  const ownWindows = windows(heldOut.text);
  if (!ownWindows.length) continue;
  // ⚠️ מוציאים את **כל** המסמך מהפרופיל, לא רק את החלון — אחרת חלון אחד מאמן
  // על אחיו ויש דליפה.
  const rest = selfDocs.filter((_, j) => j !== i).map((d) => d.text);
  // הבקרה משמשת כאוכלוסיית תקנון, לא כדי "ללמוד" ממנה מחבר — היא מגדירה מה
  // נחשבת סטייה רגילה בשפה/ז'אנר. בלעדיה המדד מתרווה (ר' styleFingerprintService).
  const profile = buildAuthorProfile(rest, { referenceDocs: controlDocs.map((c) => c.text) });
  if (!profile) continue;

  const ownR = ownWindows.map((w) => burrowsDelta(w, profile)).filter(Boolean);
  const ctlR = controlWindows.map((w) => burrowsDelta(w, profile)).filter(Boolean);
  if (!ownR.length || !ctlR.length) continue;

  const ownD = ownR.map((r) => r.delta);
  const ctlD = ctlR.map((r) => r.delta);
  selfDeltas.push(...ownD);
  otherDeltas.push(...ctlD);
  selfCos.push(...ownR.map((r) => r.cosineDelta));
  otherCos.push(...ctlR.map((r) => r.cosineDelta));
  folds += 1;

  // הכרעה לפי חציון — עמידה יותר מהמינימום, שנשלט ע"י חלון בקרה חריג יחיד.
  // ⚠️ ההכרעה נרשמת לשני המרחקים בנפרד. גרסה קודמת דיווחה דיוק ועוגני-סקאלה
  // של המרחק הקלאסי בזמן שהמדד שנבחר בפועל היה cosine — מספר שנראה תקף ואינו.
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  folds_.push({
    name: heldOut.name,
    windows: ownD.length,
    classic: { own: med(ownD), ctl: med(ctlD) },
    cosine: { own: med(ownR.map((r) => r.cosineDelta)), ctl: med(ctlR.map((r) => r.cosineDelta)) },
  });
}

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

const aucClassic = aucOf(selfDeltas, otherDeltas);
const aucCosine = aucOf(selfCos, otherCos);
// בוחרים את המרחק שמדד טוב יותר — ומדווחים את שניהם, כדי שהבחירה תהיה גלויה.
const useCosine = aucCosine > aucClassic;
const auc = Math.max(aucClassic, aucCosine);

// כל המספרים המדווחים נגזרים מ**המרחק הנבחר**, לא מהאחר.
const pick = (f) => (useCosine ? f.cosine : f.classic);
const selfAvg = avg(useCosine ? selfCos : selfDeltas);
const otherAvg = avg(useCosine ? otherCos : otherDeltas);
const correct = folds_.filter((f) => pick(f).own < pick(f).ctl).length;

for (const f of folds_) {
  const p = pick(f);
  console.log(`  ${p.own < p.ctl ? '✓' : '✗'} ${f.name.slice(0, 40).padEnd(42)} עצמי ${p.own.toFixed(3)} (${f.windows} חלונות) · בקרה ${p.ctl.toFixed(3)}`);
}

console.log('\n═══ ולידציית המדד ═══');
console.log(`  AUC — Delta קלאסי:         ${aucClassic.toFixed(3)}`);
console.log(`  AUC — Cosine Delta:        ${aucCosine.toFixed(3)}`);
console.log(`  נבחר:                      ${useCosine ? 'Cosine Delta' : 'Delta קלאסי'} (AUC ${auc.toFixed(3)})`);
console.log(`  מרחק ממוצע — עבודה שלו:    ${selfAvg.toFixed(3)}`);
console.log(`  מרחק ממוצע — מחבר אחר:     ${otherAvg.toFixed(3)}`);
console.log(`  דיוק leave-one-out:        ${correct}/${folds} מסמכים · ${selfDeltas.length} חלונות עצמי מול ${otherDeltas.length} בקרה`);

// רף: AUC 0.5 = הטלת מטבע. מתחת ל-0.8 המדד חלש מכדי לשפוט לפיו מנוע.
const VALID_AUC = 0.8;
if (!(auc >= VALID_AUC)) {
  console.log(`\n✗ המדד לא ולידי (AUC ${auc.toFixed(3)} < ${VALID_AUC}). אסור לשפוט לפיו את המנוע.`);
  process.exit(1);
}
// ---------- מבחני תקפות: כמה מה-AUC אמיתי ----------
function aucUnder(label, { refDocs, opts }) {
  const ctlW = refDocs.flatMap((c) => windows(c.text));
  if (!ctlW.length) return `${label}: אין בקרה`;
  const s = []; const o = [];
  for (let i = 0; i < selfDocs.length; i += 1) {
    const own = windows(selfDocs[i].text);
    if (!own.length) continue;
    const p = buildAuthorProfile(selfDocs.filter((_, j) => j !== i).map((d) => d.text),
      { referenceDocs: refDocs.map((c) => c.text), ...opts });
    if (!p) continue;
    for (const w of own) { const r = burrowsDelta(w, p); if (r) s.push(r.cosineDelta); }
    for (const w of ctlW) { const r = burrowsDelta(w, p); if (r) o.push(r.cosineDelta); }
  }
  return `${label}: AUC ${aucOf(s, o).toFixed(3)}  (${refDocs.length} מסמכי בקרה)`;
}

console.log('\n═══ מבחני תקפות ═══');
console.log('  ' + aucUnder('כמו שהוא                ', { refDocs: controlDocs, opts: {} }));
console.log('  ' + aucUnder('בלי שם המחבר            ', { refDocs: controlDocs, opts: { stripTerms: AUTHOR_TERMS } }));
console.log('  ' + aucUnder('בלי תכונות מבניות       ', { refDocs: controlDocs, opts: { useStructural: false } }));
console.log('  ' + aucUnder('בקרת docx בלבד          ', { refDocs: docxControls, opts: {} }));
console.log('  ' + aucUnder('שניהם מנוטרלים          ', { refDocs: docxControls, opts: { stripTerms: AUTHOR_TERMS, useStructural: false } }));

console.log(`\n✓ המדד ולידי. עוגני הסקאלה: עצמי=${selfAvg.toFixed(3)} · אחר=${otherAvg.toFixed(3)}`);

// ---------- כרטיס הסגנון ----------
// זה הפלט שה-onboarding יכול להראות למשתמש: מה בפועל מאפיין את הכתיבה שלו,
// מבוסס על מדד שעבר ולידציה — ולא על תיאור כללי.
{
  // ⚠️ הכרטיס נבנה עם השם מנוטרל. בלי זה «ותם» (מתוך "רותם") צף כאחד הרצפים
  // ה"מבחינים" — וזו חתימה, לא סגנון. הוא לא משפיע על ה-AUC (0.948→0.947),
  // אבל להציג אותו למשתמש כמאפיין הכתיבה שלו זו פשוט טעות.
  const fullProfile = buildAuthorProfile(selfDocs.map((d) => d.text), {
    referenceDocs: controlDocs.map((c) => c.text), stripTerms: AUTHOR_TERMS,
  });
  // ⚠️ @paraSents לא מוצג: הוא מודד גבולות פסקה, ואלה נגזרים מפורמט החילוץ
  // (docx מול pdf) ולא מהכתיבה. נמדד 1.47 מול 7.04 — פער מרשים וחסר משמעות.
  const CARD_KEYS = STRUCTURAL_KEYS.filter((k) => k !== '@paraSents');
  const meanStruct = (docs) => {
    const acc = {};
    for (const k of CARD_KEYS) acc[k] = 0;
    for (const d of docs) {
      const f = structuralFeatures(stripNonAuthorial(d, AUTHOR_TERMS).slice(0, 9000));
      for (const k of CARD_KEYS) acc[k] += f[k];
    }
    for (const k of CARD_KEYS) acc[k] /= Math.max(1, docs.length);
    return acc;
  };
  const mine = meanStruct(selfDocs.map((d) => d.text));
  const theirs = meanStruct(controlDocs.map((c) => c.text));

  console.log('\n╔═══ כרטיס הסגנון שלך ═══');
  console.log(`║ נבנה מ-${selfDocs.length} עבודות · אומת מול ${controlDocs.length} מסמכים של מחברים אחרים · AUC ${auc.toFixed(3)}`);
  console.log('║');
  console.log('║ ' + 'מדד'.padEnd(30) + 'אתה'.padStart(9) + 'אחרים'.padStart(11) + '   פער');
  for (const k of CARD_KEYS) {
    const a = mine[k]; const b = theirs[k];
    const pct = b !== 0 ? ((a - b) / Math.abs(b)) * 100 : 0;
    const arrow = pct > 8 ? '▲' : pct < -8 ? '▼' : '=';
    console.log('║ ' + STRUCTURAL_LABELS[k].padEnd(30)
      + a.toFixed(2).padStart(9) + b.toFixed(2).padStart(11)
      + `   ${arrow} ${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`);
  }

  // n-גרמים מבחינים: הערכים הקיצוניים בפרופיל ה-z של המחבר.
  const ranked = fullProfile.authorZ
    .map((z, i) => ({ key: fullProfile.keys[i], z }))
    .filter((e) => !e.key.startsWith('@'))
    .sort((a, b) => b.z - a.z);
  const fmt = (e) => `«${e.key.replace(/ /g, '␣')}»${e.z >= 0 ? '+' : ''}${e.z.toFixed(2)}`;
  console.log('║');
  console.log('║ רצפים שאתה משתמש בהם יותר מאחרים:  ' + ranked.slice(0, 8).map(fmt).join('  '));
  console.log('║ רצפים שאתה נמנע מהם:               ' + ranked.slice(-8).reverse().map(fmt).join('  '));
  console.log('╚═══');
}

// ---------- ניקוד פלט המנוע ----------
// רק אחרי שהשער נפתח. הסקאלה: 100 = כמו עבודה אמיתית שלו, 0 = כמו מחבר אחר.
const scoreFile = process.env.WORDAI_STYLE_SCORE_FILE
  || path.join(process.env.WORDAI_VERIFY_SCRATCH || path.join(path.dirname(SELF_DIR), '..', '..'), 'generated-prose.txt');
if (fs.existsSync(scoreFile)) {
  const generated = fs.readFileSync(scoreFile, 'utf8');
  const words = tokenizeForStyle(generated).length;
  if (words < 80) {
    console.log(`\n⚠ ${scoreFile}: רק ${words} מילים — קצר מכדי לנקד בשמרנות.`);
  } else {
    const fullProfile = buildAuthorProfile(selfDocs.map((d) => d.text), { referenceDocs: controlDocs.map((c) => c.text) });
    const r = burrowsDelta(generated, fullProfile);
    const d = useCosine ? r.cosineDelta : r.delta;
    const score = styleMatchScore(d, { selfDelta: selfAvg, otherDelta: otherAvg });
    console.log('\n═══ ניקוד פלט המנוע ═══');
    console.log(`  קובץ: ${path.basename(scoreFile)} (${words} מילים)`);
    console.log(`  מרחק: ${d.toFixed(3)}   (עצמי ${selfAvg.toFixed(3)} · אחר ${otherAvg.toFixed(3)})`);
    console.log(`  ציון התאמה לסגנון: ${score}/100`);
    console.log(`  התכונות שהכי מרחיקות: ${r.top.slice(0, 6).map((t) => `«${t.key}»${t.z > 0 ? '+' : ''}${t.z}`).join(' ')}`);
  }
} else {
  console.log(`\n(אין קובץ פרוזה לניקוד ב-${scoreFile} — הרץ קודם run-scaffold-e2e.mjs)`);
}
fs.writeFileSync(
  path.join(path.dirname(new URL(import.meta.url).pathname.slice(1)), 'style-anchors.json'),
  JSON.stringify({
    distance: useCosine ? 'cosine' : 'classic',
    selfDelta: selfAvg, otherDelta: otherAvg, auc,
    aucClassic, aucCosine,
    selfDocs: selfDocs.length, controlDocs: controlDocs.length,
    windowChars: WINDOW_CHARS,
  }, null, 2),
  'utf8',
);
