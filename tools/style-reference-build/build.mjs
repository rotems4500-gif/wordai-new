#!/usr/bin/env node
// ============================================================================
// tools/style-reference-build/build.mjs
//
// כלי אופליין, חד-פעמי: קורא תיקיית קורפוס (קבצי .txt של עברית אקדמית), מריץ
// עליהם computeLocalMetrics + אגרגציה (lib.mjs), ופולט מחדש את
// src/services/styleReferenceCorpus.data.js עם meta.builtFrom='corpus'.
//
// לא רץ בזמן ריצה של האפליקציה ולא מחובר ל-build. מריצים ידנית כשרוצים
// לרענן את נכס-ייחוס האוכלוסייה מקורפוס אמיתי (ראו README.md באותה תיקייה
// לאיך משיגים קורפוס).
//
// שימוש:
//   node tools/style-reference-build/build.mjs --corpus <dir>
//   node tools/style-reference-build/build.mjs --corpus <dir> --out <file>   (ברירת מחדל: הנכס עצמו)
//   node tools/style-reference-build/build.mjs                               (בלי --corpus: מדפיס הסבר ויוצא)
//
// אם בתיקיית הקורפוס יש _corpus-manifest.json (נכתב ע"י prepare-corpus.mjs),
// ההרכב שלו נכנס ל-meta.composition ולכותרת הקובץ — כך ש-meta מתעד מה באמת נכנס
// לאוכלוסייה, ולא רק נתיב תיקייה (שעלול להיות תיקייה זמנית).
// ============================================================================
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { computeLocalMetrics, aggregateReferenceDistribution, mineNgrams } from './lib.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(DIR, '..', '..');
const DEFAULT_OUT = path.join(PROJECT, 'src', 'services', 'styleReferenceCorpus.data.js');

function parseArgs(argv) {
  const args = { corpus: null, out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--corpus') args.corpus = argv[++i];
    else if (argv[i] === '--out') args.out = path.resolve(argv[++i]);
  }
  return args;
}

async function listTxtFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null; // תיקייה לא קיימת/לא נגישה
  }
  const files = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.txt')) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

// קורא את _corpus-manifest.json של prepare-corpus.mjs, אם קיים. חסר/שבור → null
// (הכלי עדיין עובד על תיקיית .txt "ידנית" שהוכנה בלי הסקריפט).
async function readManifest(dir) {
  try {
    const raw = await readFile(path.join(dir, '_corpus-manifest.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function explainNoCorpus() {
  console.log(`
לא סופק קורפוס (או שהתיקייה ריקה/לא קיימת).

הכלי הזה בונה את src/services/styleReferenceCorpus.data.js מחדש מתוך קורפוס
טקסטים אמיתיים של עברית אקדמית. עד שיש קורפוס כזה, הקובץ הקיים הוא seed ידני
(meta.builtFrom='bootstrap') — ראו הערה בראש הקובץ.

איך להריץ:
  node tools/style-reference-build/build.mjs --corpus <תיקייה עם קבצי .txt>

לפרטים על היכן להשיג קורפוס עברי אקדמי ציבורי, ראו README.md באותה תיקייה.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.corpus) {
    explainNoCorpus();
    return;
  }

  const corpusDir = path.resolve(args.corpus);
  const files = await listTxtFiles(corpusDir);

  if (!files) {
    console.log(`תיקיית הקורפוס לא נמצאה: ${corpusDir}`);
    explainNoCorpus();
    return;
  }
  if (!files.length) {
    console.log(`אין קבצי .txt בתיקייה: ${corpusDir}`);
    explainNoCorpus();
    return;
  }

  console.log(`נמצאו ${files.length} קבצי .txt ב-${corpusDir}. קורא ומחשב מדדים...`);

  const texts = [];
  const docMetrics = [];
  let skipped = 0;

  for (const file of files) {
    let text;
    try {
      text = await readFile(file, 'utf8');
    } catch (err) {
      console.warn(`  דילוג — לא ניתן לקרוא ${path.basename(file)}: ${err.message}`);
      skipped += 1;
      continue;
    }
    const metrics = computeLocalMetrics(text);
    if (!metrics) {
      // פחות מ-25 מילים אחרי ניקוי — לא רלוונטי לאגרגציה
      skipped += 1;
      continue;
    }
    texts.push(text);
    docMetrics.push(metrics);
  }

  if (!docMetrics.length) {
    console.log('אף מסמך לא עבר את סף 25 המילים המינימלי — אין מה לאגרגט.');
    return;
  }

  console.log(`מחשב אגרגציה על ${docMetrics.length} מסמכים (${skipped} דולגו)...`);
  const global = aggregateReferenceDistribution(docMetrics);

  console.log('כורה n-grams...');
  // minDocFraction=0.1 — גרם חייב להופיע ב-≥10% מהמסמכים כדי להיחשב "ביטוי
  // אוכלוסייה" ולא צירוף-נושא/ריהוט-דף של מסמך בודד (ר' ההערה ב-lib.mjs).
  const ngramFreq = mineNgrams(texts, { sizes: [2, 3], topN: 30, minCount: 3, minDocFraction: 0.1 });

  // מניפסט ההכנה (אם קיים) — מתעד מאיזה מקורות הקורפוס הורכב.
  const manifest = await readManifest(corpusDir);

  const sourceLine = manifest?.sources?.length
    ? `נבנה מקורפוס: ${docMetrics.length} מסמכים — ${manifest.sources.map((s) => `${s.name} ${s.docs}`).join(', ')}`
    : `נבנה מקורפוס: ${docMetrics.length} מסמכים מתוך ${corpusDir}`;

  const output = {
    meta: {
      version: 1,
      source: sourceLine,
      builtFrom: 'corpus',
      docCount: docMetrics.length,
      updatedAt: new Date().toISOString(),
      ...(manifest ? { composition: manifest } : {}),
    },
    global,
    genres: {},
    ngramFreq,
  };

  const compositionComment = manifest?.sources?.length
    ? [
      '//',
      '// הרכב הקורפוס שממנו נבנה הקובץ הזה:',
      ...manifest.sources.map((s) => `//   • ${s.name}: ${s.docs} מסמכים (${s.words} מילים) — ${s.label}`),
      ...(manifest.excluded || []).map((x) => `//   ✗ הוחרג: ${x}`),
      ...(manifest.academicCorpusFound === false
        ? ['//   ⚠️ הקורפוס האקדמי לא נמצא במכונה שבנתה — הנכס מבוסס ויקי בלבד.']
        : []),
    ].join('\n')
    : '//';

  const fileContent = `// styleReferenceCorpus.data.js — נכס-ייחוס אוכלוסייה למנוע הסגנון (Style Engine).
//
// קובץ זה נוצר אוטומטית ע"י tools/style-reference-build/build.mjs — לא לערוך ידנית.
// לרענון: node tools/style-reference-build/prepare-corpus.mjs && node tools/style-reference-build/build.mjs --corpus <תיקיית קורפוס>
${compositionComment}
//
// meta.builtFrom='corpus' הוא מה שמפעיל את ניגוד-האוכלוסייה בפועל (isRealReference
// ב-styleReferenceService.js): שקלול z ב-scoreStyleMatchLocal, סינון עוגנים
// ב-buildStyleEngineInjectionBlock, ודירוג נדירות ב-mineSignatureNgrams.
//
// מבנה: ראו src/services/styleReferenceService.js לחוזה הטעינה/גישה.
export const STYLE_REFERENCE = ${JSON.stringify(output, null, 2)};
`;

  await writeFile(args.out, fileContent, 'utf8');
  console.log(`נכתב: ${args.out}`);
}

main().catch((err) => {
  console.error('שגיאה בבנייה:', err);
  process.exitCode = 1;
});
