#!/usr/bin/env node
// ============================================================================
// tools/style-reference-build/prepare-corpus.mjs
//
// מכין תיקיית קורפוס "מסמך אחד לקובץ" עבור build.mjs, מתוך חומרי הגלם שכבר
// קיימים במכונה. build.mjs מצפה לתיקייה שטוחה של קבצי .txt, מסמך אחד לקובץ —
// אבל החומר הגולמי אינו בפורמט הזה:
//
//   • tools/detector-train/samples/human-global/*.txt — בלובים מרובי-מסמכים,
//     מופרדים בשורת "===" (נבנו ע"י fetch-human-corpus.mjs).
//   • קורפוס 314999533 (מקורות אקדמיים של מחברים אחרים) — docx/pdf, לא טקסט.
//
// ⚠️ הרכב הקורפוס אינו שרירותי. נכס-הייחוס משמש לחישוב z-score של **המשתמש מול
// אוכלוסייה**, ומנוע הסגנון מכוון לכתיבה אקדמית. לכן:
//   • academic (314999533, לא עבודות המשתמש) — הרגיסטר שהמנוע באמת שופט. נלקח
//     במלואו, והוא זה שקובע את התקרה של מקור הוויקי.
//   • wiki — פרוזה עיונית פורמלית בעברית מודרנית. נדגם בתקרה 1:1 מול האקדמי,
//     כדי שלא יטביע אותו (יש שם מאות מסמכים מול עשרות אקדמיים).
//   • wikisource — **מוחרג בכוונה**. נמדד: חצי מהמסמכים בלי פיסוק סופי בכלל
//     (avgSentenceWords הגיע ל-3,344 מילים ל"משפט"), ורובם פרשנות רבנית/טקסט
//     ארכאי — רגיסטר שאינו קרוב לכתיבה אקדמית מודרנית. הכנסתו ניפחה את ה-std
//     של avgSentenceWords ל-287.
//   • wikitalk (דפי שיחה) — **מוחרג בכוונה**. רגיסטר אישי/ויכוחי; מנפח את
//     ה-std של exclamationRate/rhetoricalQuestionRate/oneWordSentenceRate ואז
//     שום משתמש אינו "חורג מהאוכלוסייה" — כלומר הוא מכבה בפועל את הפיצ'ר
//     שהקובץ הזה נועד להפעיל. (ב-detector-train הוא כן נחוץ — שם מסווגים
//     אנושי-מול-AI, לא אקדמי-מול-אקדמי.)
//   • עבודות המשתמש עצמו (עבודות סופיות + טיוטות) — לא נכנסות. אוכלוסייה =
//     אחרים; אחרת ה-z של המשתמש מול עצמו תמיד ~0.
//
// ⚠️ שערי איכות (כל אחד מהם נמדד על הקורפוס הזה, לא הונח מראש):
//   1. כפילויות — 15 מתוך 73 המסמכים האקדמיים היו עותקים כפולים של אותו PDF
//      ("… (1).pdf"). כפילות משכפלת מסמך בהתפלגות ומטה mean/std.
//   2. רציפות פרוזה — צפיפות פיסוק סופי ל-100 מילים. תוכן-עניינים/רשימת ראשי
//      פרקים נותן 0.18 ומייצר "משפטים" של מאות מילים. סף 3.0 (academic p10=4.6,
//      wiki p10=4.5 — הסף מתחתיהם ופוסל רק מסמכים לא-פרוזאיים).
//   3. שחזור פסקאות מ-PDF — pdf.js מחזיר עמוד שלם כרצף אחד; join תמים של עמודים
//      ב-\n\n הופך **עמוד** ל"פסקה" ומודד avgParagraphWords=526 (גודל עמוד, לא
//      פסקה). כאן משוחזרות שורות (itemsToLines כמו במחלץ של האפליקציה,
//      materialExtractBrowser.js:120) ואז פסקאות לפי הוריסטיקת "שורה קצרה
//      מסיימת פסקה" בטקסט מיושר.
//   4. ריהוט-דף חוזר ורשימת מקורות — 595 מתוך 1,380 ה"משפטים" במאמר אחד היו
//      חותמת JSTOR שחוזרת בכל עמוד ורשומות ביבליוגרפיה. ר' stripPageFurniture.
//   5. "מרק שברים" — מסמך שבו >25% מהמשפטים באורך ≤2 מילים נפסל: זה חילוץ שנשבר,
//      לא סגנון.
//
// ⚠️ מה שהשערים **לא** פותרים: רוב המסמכים האקדמיים מגיעים מחילוץ PDF, בעוד
// שהמשתמש נמדד על טקסט נקי מהעורך. avgParagraphWords ו-oneWordSentenceRate
// עדיין מושפעים מתנאי-המדידה ולא רק מהסגנון — בדיוק אותה אזהרה שקיימת על
// @paraSents ב-CLAUDE.md. אין להתייחס אליהם כאל מדידה טהורה של אוכלוסייה.
//
// שימוש:
//   node tools/style-reference-build/prepare-corpus.mjs                 # מכין לתיקיית ברירת מחדל
//   node tools/style-reference-build/prepare-corpus.mjs --out <dir>
//   node tools/style-reference-build/prepare-corpus.mjs --report        # רק סופר, לא כותב
//   WORDAI_SCAFFOLD_CORPUS=<dir>   שורש קורפוס 314999533 (כמו בשאר הכלים)
//
// ואז:
//   node tools/style-reference-build/build.mjs --corpus <dir>
// ============================================================================
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename } from 'node:path';
import os from 'node:os';
import mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { tokenizeForStyle } from '../../src/services/styleFingerprintService.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(HERE, '..', '..');
const HUMAN_GLOBAL_DIR = join(PROJECT, 'tools', 'detector-train', 'samples', 'human-global');
const DEFAULT_OUT = join(os.tmpdir(), 'wordai-style-ref-corpus');

// שורש הקורפוס האקדמי — אותה קונבנציה בדיוק כמו style-eval/build-ngram-table.
const CORPUS_ROOT = process.env.WORDAI_SCAFFOLD_CORPUS
  || join(os.homedir(), 'OneDrive', 'שולחן העבודה', '314999533');
const SELF_DIR = join(CORPUS_ROOT, 'עבודות והגשות', 'עבודות סופיות');
const DRAFTS_MARKER = 'טיוטות וגרסאות קודמות';

// ---------- ספים ----------
const WIKI_MIN_WORDS = 300;      // כמו הסינון ב-fetch-human-corpus (MIN_WORDS)
const WIKI_MAX_WORDS = 6000;     // מסמך ענק מטה את התפלגות אורכי הפסקה של כל הקורפוס
const ACADEMIC_MIN_WORDS = 250;  // כמו style-eval/detector-eval
const MIN_HEBREW_RATIO = 0.7;    // עברית בלבד — המדדים והלקסיקון עבריים
const ACADEMIC_MIN_HEBREW_RATIO = 0.6;
const MIN_PURE_TOKEN_RATIO = 0.5; // מגן מפני PDF משובש (ToUnicode שבור)
const MIN_TERMINALS_PER_100 = 3.0; // שער רציפות-פרוזה (ר' הערה 2 בראש הקובץ)
// שער "מרק שברים": שיעור ה"משפטים" באורך ≤2 מילים. מסמך פרוזה אמיתי כמעט ולא
// מכיל כאלה (חציון ויקיפדיה 0.000); ערך גבוה = חילוץ PDF שנשבר להערות/כותרות.
// ⚠️ זהו שער **איכות חילוץ**, לא שער סגנון — הסף (0.25) גבוה בהרבה מכל ערך
// פרוזאי סביר, ולכן אינו גוזם את זנב ההתפלגות האמיתית של oneWordSentenceRate.
const MAX_ONE_WORD_SENTENCE_RATE = 0.25;
const SAMPLE_SEED = 20260804;

// תקרת הדגימה של ויקיפדיה נגזרת ממספר המסמכים האקדמיים בפועל: 1:1 ⇒ אקדמי ~50%
// מהמסמכים. רצפה — רק אם הקורפוס האקדמי לא קיים במכונה (הנכס אז חלש יותר; מסומן
// במניפסט וב-meta).
const WIKI_CAP_RATIO = 1.0;
const WIKI_CAP_FALLBACK = 120;

// ---------- עזרים ----------
const splitBlocks = (raw) => String(raw || '').split(/\r?\n=+\r?\n/).map((s) => s.trim()).filter(Boolean);

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

// צפיפות פיסוק סופי ל-100 מילים — מבחין פרוזה מרשימה/תוכן-עניינים/טקסט בלי פיסוק.
// (אותו מדד כמו measureProseContinuity.per100 ב-materialChunkStore.js.)
function terminalsPer100(text) {
  const words = (String(text || '').match(/\S+/g) || []).length;
  if (!words) return 0;
  const terminals = (String(text || '').match(/[.!?׃]/g) || []).length;
  return (terminals / words) * 100;
}

// שיעור ה"משפטים" באורך ≤2 מילים — אותה חלוקה בדיוק כמו computeLocalMetrics
// (lib.mjs): פיצול על [.!?…] וספירת מילים ב-WORD_RE.
const SENT_WORD_RE = /[֐-׿A-Za-z0-9'"׳״-]+/g;
function oneWordSentenceRate(text) {
  const sentences = String(text || '').split(/[.!?…]+/).map((s) => s.trim()).filter(Boolean);
  let counted = 0;
  let tiny = 0;
  for (const s of sentences) {
    const n = (s.match(SENT_WORD_RE) || []).length;
    if (!n) continue;
    counted += 1;
    if (n <= 2) tiny += 1;
  }
  return counted ? tiny / counted : 0;
}

// טביעת אצבע לזיהוי כפילויות (אותו PDF שהועתק בשם אחר).
const textFingerprint = (text) => createHash('sha1')
  .update(String(text || '').replace(/\s+/g, ' ').trim().slice(0, 4000))
  .digest('hex');

// PRNG דטרמיניסטי (mulberry32) — דגימה חוזרת נותנת בדיוק אותו קורפוס.
function mulberry32(a) {
  return function rnd() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededSample(items, count, seed) {
  if (items.length <= count) return items.slice();
  const rnd = mulberry32(seed);
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

// ---------- מקור 1: בלובים של ויקיפדיה ----------
function loadWikiBucket(prefixes) {
  if (!existsSync(HUMAN_GLOBAL_DIR)) return [];
  const files = readdirSync(HUMAN_GLOBAL_DIR)
    .filter((f) => f.endsWith('.txt') && prefixes.some((p) => f.startsWith(p)))
    .sort();
  const docs = [];
  for (const file of files) {
    const raw = readFileSync(join(HUMAN_GLOBAL_DIR, file), 'utf8');
    splitBlocks(raw).forEach((block, idx) => {
      const words = tokenizeForStyle(block).length;
      if (words < WIKI_MIN_WORDS || words > WIKI_MAX_WORDS) return;
      if (hebrewRatio(block) < MIN_HEBREW_RATIO) return;
      if (terminalsPer100(block) < MIN_TERMINALS_PER_100) return;
      if (oneWordSentenceRate(block) > MAX_ONE_WORD_SENTENCE_RATE) return;
      docs.push({ id: `${basename(file, '.txt')}-${String(idx).padStart(4, '0')}`, text: block, words });
    });
  }
  return docs;
}

// ---------- מקור 2: אקדמי (314999533, לא עבודות המשתמש) ----------
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

// --- שחזור שורות מ-pdf.js (פורט של itemsToLines, materialExtractBrowser.js:120) ---
const LINE_Y_TOLERANCE = 2.5;
const needsSpace = (prev, next) => {
  if (!prev || !next) return false;
  const a = String(prev.str || '');
  const b = String(next.str || '');
  if (!a || !b) return false;
  return !/\s$/.test(a) && !/^\s/.test(b);
};
function itemsToLines(items = []) {
  const lines = [];
  let current = null;
  items.forEach((item) => {
    const str = String(item?.str ?? '');
    const y = Array.isArray(item?.transform) ? item.transform[5] : null;
    if (current && y !== null && Math.abs(current.y - y) <= LINE_Y_TOLERANCE) {
      if (needsSpace(current.lastItem, item)) current.parts.push(' ');
      current.parts.push(str);
      if (str) current.lastItem = item;
    } else {
      if (current) lines.push(current);
      current = { y, parts: [str], lastItem: str ? item : null };
    }
    if (item?.hasEOL) { lines.push(current); current = null; }
  });
  if (current) lines.push(current);
  return lines.map((l) => l.parts.join('').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// --- ריהוט-דף חוזר + רשימת מקורות ---
//
// ⚠️ שניהם נמדדו, לא הונחו. לפני הניקוי הזה 595 מתוך 1,380 ה"משפטים" במסמך
// אקדמי אחד היו באורך ≤2 מילים — כולם כותרת תחתונה של JSTOR שחוזרת בכל עמוד
// ("jstor", "139", "134") ורשומות ביבליוגרפיה ("שקדי, א"). זה ניפח את
// oneWordSentenceRate פי 10 והרעיל גם את טבלת ה-n-gram.
const REPEATED_LINE_MIN = 3; // שורה זהה שחוזרת ≥3 פעמים = כותרת רצה/חותמת מו"ל
const BIBLIO_HEADING = /^\s*(ביבליוגרפיה|רשימת מקורות|רשימה ביבליוגרפית|מקורות|References|Bibliography|Works Cited)\s*:?\s*$/i;

function stripPageFurniture(lines) {
  const freq = new Map();
  for (const l of lines) freq.set(l, (freq.get(l) || 0) + 1);
  return lines.filter((l) => (freq.get(l) || 0) < REPEATED_LINE_MIN);
}

function stripBibliography(lines) {
  // חותכים רק אם הכותרת מופיעה במחצית האחרונה — כותרת "מקורות" בתוכן העניינים
  // בתחילת מסמך לא אמורה לגזום את כל הגוף.
  const half = Math.floor(lines.length / 2);
  for (let i = lines.length - 1; i >= half; i -= 1) {
    if (BIBLIO_HEADING.test(lines[i])) return lines.slice(0, i);
  }
  return lines;
}

// --- שורות → פסקאות ---
// בטקסט מיושר, שורה שנגמרת הרבה לפני השוליים היא סוף פסקה. שורות ריהוט-דף
// (מספרי עמוד, כותרת רצה קצרה) מושמטות. בלי זה "פסקה" = עמוד שלם (ר' הערה 3).
const FURNITURE_MAX_CHARS = 4;
function linesToParagraphs(rawLines) {
  const lines = stripBibliography(stripPageFurniture(rawLines));
  const body = lines.filter((l) => l.length > FURNITURE_MAX_CHARS && !/^\d+$/.test(l));
  if (!body.length) return '';
  const lengths = [...body.map((l) => l.length)].sort((a, b) => a - b);
  const medianLen = lengths[Math.floor(lengths.length / 2)] || 1;
  const shortLine = medianLen * 0.7;

  // ⚠️ "שורה קצרה" לבדה שוברת יותר מדי (נמדד: 432 "פסקאות" במאמר אחד, חציון 25
  // מילים לפסקה — כותרות, שורות אחרונות של הערת שוליים, שברי-עמודה). נדרש גם
  // שהשורה תיגמר בפיסוק סופי — סוף פסקה אמיתי הוא גם סוף משפט.
  const ENDS_SENTENCE = /[.!?׃:]["'”’״]?$/;
  const paragraphs = [];
  let buf = [];
  for (const line of body) {
    buf.push(line);
    if (line.length < shortLine && ENDS_SENTENCE.test(line)) { paragraphs.push(buf.join(' ')); buf = []; }
  }
  if (buf.length) paragraphs.push(buf.join(' '));
  return paragraphs.map((p) => p.trim()).filter(Boolean).join('\n\n');
}

async function extractDocxText(p) {
  try {
    // mammoth מפריד פסקאות ב-\n יחיד; computeLocalMetrics נופל אוטומטית לפיצול
    // \n כשאין \n\n, ולכן מבנה הפסקאות נשמר נכון.
    return (await mammoth.extractRawText({ buffer: readFileSync(p) })).value || '';
  } catch { return ''; }
}
async function extractPdfText(p) {
  try {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(p)), useSystemFonts: true }).promise;
    const allLines = [];
    for (let i = 1; i <= Math.min(doc.numPages, 40); i += 1) {
      const c = await (await doc.getPage(i)).getTextContent();
      allLines.push(...itemsToLines(c.items));
    }
    try { await doc.destroy(); } catch { /* ignore */ }
    return linesToParagraphs(allLines);
  } catch { return ''; }
}
const extractAnyText = (p) => (/\.docx$/i.test(p) ? extractDocxText(p) : extractPdfText(p));

async function loadAcademicDocs(rejects) {
  if (!existsSync(CORPUS_ROOT)) return { docs: [], missing: true };
  const all = walkDocs(CORPUS_ROOT);
  const selfSet = new Set(walkDocs(SELF_DIR).map((p) => resolve(p)));
  const candidates = all.filter((p) => !selfSet.has(resolve(p)) && !p.includes(DRAFTS_MARKER));
  const docs = [];
  const seen = new Set();
  for (const p of candidates) {
    const text = await extractAnyText(p);
    const words = tokenizeForStyle(text).length;
    if (words < ACADEMIC_MIN_WORDS) { rejects.tooShort += 1; continue; }
    if (hebrewRatio(text) < ACADEMIC_MIN_HEBREW_RATIO) { rejects.notHebrew += 1; continue; }
    if (pureTokenRatio(text) < MIN_PURE_TOKEN_RATIO) { rejects.garbled += 1; continue; }
    if (terminalsPer100(text) < MIN_TERMINALS_PER_100) { rejects.notProse += 1; continue; }
    if (oneWordSentenceRate(text) > MAX_ONE_WORD_SENTENCE_RATE) { rejects.fragmented += 1; continue; }
    const fp = textFingerprint(text);
    if (seen.has(fp)) { rejects.duplicate += 1; continue; }
    seen.add(fp);
    docs.push({ id: `academic-${String(docs.length + 1).padStart(3, '0')}`, text, words, path: p });
  }
  return { docs, missing: false };
}

// ---------- ריצה ----------
function parseArgs(argv) {
  const args = { out: DEFAULT_OUT, report: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') args.out = resolve(argv[++i]);
    else if (argv[i] === '--report') args.report = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log('טוען מקורות...');
  const rejects = { tooShort: 0, notHebrew: 0, garbled: 0, notProse: 0, fragmented: 0, duplicate: 0 };
  const { docs: academic, missing: academicMissing } = await loadAcademicDocs(rejects);
  const wikiAll = loadWikiBucket(['wiki-']);

  if (academicMissing) {
    console.log(`⚠️ שורש הקורפוס האקדמי לא נמצא (${CORPUS_ROOT}) — נבנה מוויקיפדיה בלבד.`);
  }

  const wikiCap = academic.length ? Math.round(academic.length * WIKI_CAP_RATIO) : WIKI_CAP_FALLBACK;
  const wiki = seededSample(wikiAll, wikiCap, SAMPLE_SEED);

  const buckets = [
    { name: 'academic', label: 'מקורות אקדמיים (314999533, מחברים אחרים)', docs: academic, pool: academic.length },
    { name: 'wiki', label: 'ויקיפדיה עברית — ערכים עיוניים', docs: wiki, pool: wikiAll.length },
  ];

  console.log('\n=== הרכב ===');
  for (const b of buckets) {
    const words = b.docs.reduce((a, d) => a + d.words, 0);
    console.log(`  ${b.name.padEnd(10)} ${String(b.docs.length).padStart(4)} מסמכים (${words} מילים, מאגר: ${b.pool})`);
  }
  console.log(`  נפסלו באקדמי: כפולים ${rejects.duplicate} · לא-פרוזה ${rejects.notProse} · מרק-שברים ${rejects.fragmented} · לא-עברית ${rejects.notHebrew} · משובש ${rejects.garbled} · קצר ${rejects.tooShort}`);
  console.log("  מוחרגים בכוונה: wikisource (רגיסטר ארכאי, בלי פיסוק) · wikitalk (רגיסטר לא-אקדמי)");

  if (args.report) {
    console.log('\n--report: לא נכתב דבר.');
    return;
  }

  // תיקיית פלט נקייה — אחרת ריצה חוזרת מערבבת דגימות ישנות בחדשות.
  try { rmSync(args.out, { recursive: true, force: true }); } catch { /* ignore */ }
  mkdirSync(args.out, { recursive: true });

  let written = 0;
  for (const b of buckets) {
    for (const d of b.docs) {
      writeFileSync(join(args.out, `${b.name}__${d.id}.txt`), d.text, 'utf8');
      written += 1;
    }
  }

  // מניפסט — build.mjs קורא אותו וכותב meta כן לתוך הנכס (במקום נתיב תיקייה זמנית).
  const manifest = {
    preparedAt: new Date().toISOString(),
    totalDocs: written,
    academicCorpusFound: !academicMissing && academic.length > 0,
    sources: buckets.map((b) => ({
      name: b.name,
      label: b.label,
      docs: b.docs.length,
      words: b.docs.reduce((a, d) => a + d.words, 0),
      poolSize: b.pool,
    })),
    excluded: [
      'wikisource — רגיסטר ארכאי/רבני, מחצית המסמכים בלי פיסוק סופי כלל',
      'wikitalk (דפי שיחה) — רגיסטר לא-אקדמי, מנפח std ומכבה את ניגוד-האוכלוסייה',
      'עבודות המשתמש עצמו (עבודות סופיות + טיוטות) — אוכלוסייה = אחרים',
      `מקורות לא-עבריים, PDF משובש, טקסט לא-פרוזאי (<${MIN_TERMINALS_PER_100} סימני סיום ל-100 מילים) וחילוץ שנשבר לשברים (>${MAX_ONE_WORD_SENTENCE_RATE} משפטי מילה-שתיים)`,
      'כפילויות — אותו מסמך שהועתק תחת שם אחר (נמדד לפי טביעת אצבע של הטקסט)',
    ],
    academicRejects: rejects,
    filters: {
      wikiMinWords: WIKI_MIN_WORDS,
      wikiMaxWords: WIKI_MAX_WORDS,
      academicMinWords: ACADEMIC_MIN_WORDS,
      minHebrewRatio: MIN_HEBREW_RATIO,
      academicMinHebrewRatio: ACADEMIC_MIN_HEBREW_RATIO,
      minPureTokenRatio: MIN_PURE_TOKEN_RATIO,
      minTerminalsPer100: MIN_TERMINALS_PER_100,
      maxOneWordSentenceRate: MAX_ONE_WORD_SENTENCE_RATE,
      sampleSeed: SAMPLE_SEED,
    },
  };
  writeFileSync(join(args.out, '_corpus-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`\nנכתבו ${written} קבצי .txt ל-${args.out}`);
  console.log('הרצה הבאה:');
  console.log(`  node tools/style-reference-build/build.mjs --corpus "${args.out}"`);
}

main().catch((err) => {
  console.error('שגיאה בהכנת הקורפוס:', err);
  process.exitCode = 1;
});
