// length-bias-check.mjs — שער המיזוג לתיקון הטיית-האורך בגלאי.
// משווה את הנוסחה הנוכחית (max(צפיפות, ספירה-מוחלטת)) מול צפיפות-בלבד, על:
//   • בלוקים בודדים מהקורפוס המתויג (קצרים) — הציונים לא אמורים לזוז מהותית.
//   • מסמכים ארוכים סינתטיים (שרשור בלוקים אנושיים / AI) — אנושי-ארוך חייב
//     לרדת מתחת לסף 60; AI-ארוך חייב להישאר מעליו.
// הרצה: node tools/detector-train/length-bias-check.mjs   (exit≠0 = השער נכשל)
// הערה: אחרי שהתיקון סונכרן ל-extractor.mjs עמודת "לפני" מציגה את הנוסחה המתוקנת
// גם היא (שתי העמודות זהות) — הסקריפט משמש מאז כשער רגרסיה על תנאי הקבלה.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractAuthenticityFeatures, computeSignals, scoreFromSignals, DEFAULT_WEIGHTS, DEFAULT_THRESHOLD, clamp01 } from './extractor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const loadBlocks = (file) => readFileSync(path.join(HERE, 'samples', file), 'utf8')
  .split(/^===.*$/m).map((b) => b.trim()).filter((b) => b.length >= 100);

// הנוסחה המתוקנת (מה שנכנס לשירות):
// (1) צפיפות בלבד — בלי זרועות ספירה מוחלטת (הטיית אורך).
// (2) structural לא סופר כתיבה אקדמית אנושית: מראי-מקום עם שנה (APA) מוחרגים,
//     וגרשיים בתוך מילה (ראשי-תיבות: ד"ר, ע"ר) אינם scare quotes.
const decodeEntities = (s) => String(s)
  .replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const fixedStructuralSignal = (text, wordCount) => {
  const noCite = String(text).replace(/\([^)]*\b(?:19|20)\d{2}[^)]*\)/g, ' ');
  const emDashes = (noCite.match(/[–—]/g) || []).length;
  const parenGlosses = (noCite.match(/\([^)]{1,40}\)/g) || []).length;
  const quoteChars = (noCite.replace(/(?<=[֐-׿])["״](?=[֐-׿])/g, '').match(/["“”״]/g) || []).length;
  const semicolons = (noCite.match(/;/g) || []).length;
  const events = emDashes + parenGlosses + Math.floor(quoteChars / 2) + semicolons;
  const density = wordCount ? (events / wordCount) * 100 : 0;
  return clamp01(density / 4.5);
};
const computeSignalsFixed = (text, features) => {
  const s = computeSignals(features);
  s.formalConnector = clamp01(features.formalConnectorDensity / 4);
  s.cliche = clamp01(features.clicheDensity / 1.5);
  s.structural = fixedStructuralSignal(text, features.wordCount);
  return s;
};

const scoreBoth = (rawText) => {
  const text = decodeEntities(rawText);
  const f = extractAuthenticityFeatures(text);
  return {
    words: f.wordCount,
    before: scoreFromSignals(computeSignals(f), DEFAULT_WEIGHTS),
    after: scoreFromSignals(computeSignalsFixed(text, f), DEFAULT_WEIGHTS),
  };
};

const human = loadBlocks('human.txt');
const ai = loadBlocks('ai.txt');
// עקבי עם ברירת המחדל בייצור (DEFAULT_THRESHOLD, ר' extractor.mjs) — לא קבוע-60
// עצמאי. אחרי מעבר ngramGeneric ל-0.65 + הזזת הסף ל-78 (frontier sweep, אוגוסט
// 2026) זו נקודת ההפעלה שהכוונה המקורית של השער (אנושי-ארוך מתחת, AI-ארוך מעל)
// צריכה להימדד מולה.
const THRESHOLD = DEFAULT_THRESHOLD;

const summarize = (label, texts) => {
  const rows = texts.map(scoreBoth);
  const avg = (k) => Math.round(rows.reduce((a, r) => a + r[k], 0) / rows.length);
  const over = (k) => rows.filter((r) => r[k] >= THRESHOLD).length;
  console.log(`\n${label} (n=${rows.length})`);
  console.log(`  לפני:  ממוצע ${avg('before')} | מעל הסף ${over('before')}/${rows.length}`);
  console.log(`  אחרי:  ממוצע ${avg('after')} | מעל הסף ${over('after')}/${rows.length}`);
  return rows;
};

// 1) בלוקים בודדים — התנהגות הבסיס.
const humanShort = summarize('אנושי — בלוקים בודדים', human);
const aiShort = summarize('AI — בלוקים בודדים', ai);

// 1b) עבודות אקדמיות אמיתיות של המשתמש (ארוכות ופורמליות) — התרחיש שבו הטיית
// האורך נורתה בפועל. נטען רק אם הקורפוס קיים במכונה (אותו fallback כמו הבנצ').
const DESKTOP_BASES = [
  path.join(process.env.USERPROFILE || process.env.HOME || '', 'OneDrive', 'שולחן העבודה'),
  path.join(process.env.USERPROFILE || process.env.HOME || '', 'OneDrive', 'Desktop'),
  path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop'),
];
const REAL_DOC_RELS = [
  '314999533/עבודות והגשות/עבודות סופיות/שיטות מחקר מטלת סיום רותם לב שפירו כהן.docx',
  '314999533/עבודות והגשות/טיוטות וגרסאות קודמות/חלון לחברה הישראלית – שינוי חברתי ואקטיביזם תשפ ו.docx',
  '314999533/תוכנית יחסי ציבור עמותת קול הצעירים.docx',
];
const extractDocxText = async (filePath) => {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(readFileSync(filePath));
  const xml = await zip.files['word/document.xml'].async('string');
  return xml.split(/<\/w:p>/).map((p) => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
    .map((t) => t.replace(/<[^>]+>/g, '')).join('')).filter((t) => t.trim()).join('\n\n');
};
let realHuman = [];
for (const rel of REAL_DOC_RELS) {
  for (const base of DESKTOP_BASES) {
    const p = path.join(base, rel);
    try {
      const text = await extractDocxText(p);
      if (text.length > 2000) realHuman.push({ name: path.basename(rel), text });
      break;
    } catch { /* מכונה בלי הקורפוס — מדלגים */ }
  }
}
let realRows = [];
if (realHuman.length) {
  realRows = realHuman.map((d) => ({ name: d.name, ...scoreBoth(d.text) }));
  console.log(`\nעבודות אמיתיות של המשתמש (n=${realRows.length})`);
  realRows.forEach((r) => console.log(`  ${r.words} מילים | לפני ${r.before} → אחרי ${r.after} | ${r.name}`));
} else {
  console.log('\nℹ️ קורפוס העבודות האמיתיות לא נמצא במכונה — סעיף זה דולג.');
}

// 2) מסמכים ארוכים: שרשור קבוצות של 6 בלוקים + מסמך-על אחד מכל הקורפוס.
const concatGroups = (blocks, size) => {
  const out = [];
  for (let i = 0; i + size <= blocks.length; i += size) out.push(blocks.slice(i, i + size).join('\n\n'));
  return out;
};
const humanLongDocs = [...concatGroups(human, 6), human.join('\n\n')];
const aiLongDocs = [...concatGroups(ai, 6), ai.join('\n\n')];
const humanLong = summarize('אנושי — מסמכים ארוכים (שרשור)', humanLongDocs);
const aiLong = summarize('AI — מסמכים ארוכים (שרשור)', aiLongDocs);

console.log('\nמסמכים ארוכים — פירוט:');
humanLong.forEach((r, i) => console.log(`  אנושי #${i + 1}: ${r.words} מילים | לפני ${r.before} → אחרי ${r.after}`));
aiLong.forEach((r, i) => console.log(`  AI     #${i + 1}: ${r.words} מילים | לפני ${r.before} → אחרי ${r.after}`));

// שער הקבלה:
// (א) אנושי-ארוך אחרי התיקון — מתחת לסף.
// (ב) AI-ארוך אחרי התיקון — נשאר מעל הסף.
// (ג) הפרדה על בלוקים קצרים לא נהרסת: ממוצע AI-קצר נשאר מעל ממוצע אנושי-קצר בפער ≥15.
const failures = [];
const humanLongOver = humanLong.filter((r) => r.after >= THRESHOLD).length;
if (humanLongOver > 0) failures.push(`(א) ${humanLongOver}/${humanLong.length} מסמכים אנושיים ארוכים עדיין מעל הסף`);
const realOver = realRows.filter((r) => r.after >= THRESHOLD);
if (realOver.length) failures.push(`(א2) ${realOver.length}/${realRows.length} עבודות אמיתיות עדיין מעל הסף: ${realOver.map((r) => `${r.name} (${r.after})`).join(', ')}`);
const aiLongUnder = aiLong.filter((r) => r.after < THRESHOLD).length;
if (aiLongUnder > 0) failures.push(`(ב) ${aiLongUnder}/${aiLong.length} מסמכי AI ארוכים ירדו מתחת לסף`);
const avgOf = (rows, k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
const shortGap = avgOf(aiShort, 'after') - avgOf(humanShort, 'after');
if (shortGap < 15) failures.push(`(ג) פער ההפרדה על בלוקים קצרים ירד ל-${Math.round(shortGap)} (< 15)`);

if (failures.length) {
  console.log('\n❌ השער נכשל:');
  failures.forEach((f) => console.log(`  ${f}`));
  process.exit(1);
}
console.log(`\n✅ השער עבר: אנושי-ארוך מתחת ל-${THRESHOLD}, AI-ארוך מעל, פער קצרים ${Math.round(shortGap)}.`);
