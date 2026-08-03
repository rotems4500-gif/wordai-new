// sync-check.mjs — שער סנכרון: styleAuthenticityService.js (המקור, browser-coupled)
// מול extractor.mjs (המראה ל-Node). extractor.mjs מוצהר "מראה verbatim" בהערת הראש שלו —
// השער הזה אוכף את זה בפועל, כי אין דרך אחרת לגלות שהם התפצלו חוץ מקריאה ידנית.
//
// לא ניתן לייבא את styleAuthenticityService.js ישירות ב-Node (הוא מייבא './aiService',
// שכבת browser כבדה). במקום זה: קוראים את שני הקבצים כטקסט, מאתרים כל בלוק מערך/אובייקט
// עם regex, ומריצים אותו עם new Function כדי לקבל את הערך האמיתי (לא פרסור-טקסט שביר).
//
// הרצה: node tools/detector-train/sync-check.mjs   (exit≠0 = השערים לא מסונכרנים)

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVICE_PATH = path.join(HERE, '..', '..', 'src', 'services', 'styleAuthenticityService.js');
const EXTRACTOR_PATH = path.join(HERE, 'extractor.mjs');

// מאתר `const/export const NAME = <ביטוי>;` ומחזיר את גוף הביטוי (תומך במערכים/אובייקטים/
// new Set([...]) — כל דבר שנגמר ב-`;` בסוף השורה שמכילה רק ')'/']'/'}' ואז ';').
function extractLiteral(source, name, filePath) {
  // תופס מ-"NAME = " ועד ל-";" התואם בעומק סוגריים/סוגריים-מרובעים/מסולסלים 0.
  const startRe = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*`, 'g');
  const m = startRe.exec(source);
  if (!m) {
    throw new Error(`sync-check: לא נמצא "${name}" ב-${filePath} — ה-regex לא תואם, לא ממשיכים בשקט.`);
  }
  let i = m.index + m[0].length;
  let depth = 0;
  const start = i;
  for (; i < source.length; i += 1) {
    const ch = source[i];
    // ⚠️ בלי "started": קבועים סקלריים (למשל `const N = 60;`) לא פותחים אף סוגר,
    // ולכן ה-";" הראשון בעומק 0 הוא תמיד סוף הביטוי — גם אם depth לא זז בכלל.
    if (ch === '(' || ch === '[' || ch === '{') { depth += 1; }
    else if (ch === ')' || ch === ']' || ch === '}') { depth -= 1; }
    else if (ch === ';' && depth === 0) break;
  }
  if (i >= source.length) {
    throw new Error(`sync-check: לא נמצא סוף-ביטוי (";") עבור "${name}" ב-${filePath} — לא ממשיכים בשקט.`);
  }
  const literalSrc = source.slice(start, i);
  // eslint-disable-next-line no-new-func
  const value = new Function(`return (${literalSrc});`)();
  return value;
}

function loadDecl(filePath, name) {
  const source = readFileSync(filePath, 'utf8');
  return extractLiteral(source, name, filePath);
}

const NAMES = ['FORMAL_CONNECTORS', 'CLICHE_PHRASES', 'STOP_WORDS', 'DEFAULT_WEIGHTS', 'NGRAM_MIN_WORDS', 'DEFAULT_THRESHOLD'];

let anyMismatch = false;
const report = [];

for (const name of NAMES) {
  let serviceVal;
  let extractorVal;
  try {
    serviceVal = loadDecl(SERVICE_PATH, name);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
  try {
    extractorVal = loadDecl(EXTRACTOR_PATH, name);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }

  if (name === 'STOP_WORDS') {
    const a = [...serviceVal].sort();
    const b = [...extractorVal].sort();
    const missingInExtractor = a.filter((w) => !b.includes(w));
    const missingInService = b.filter((w) => !a.includes(w));
    if (missingInExtractor.length || missingInService.length) {
      anyMismatch = true;
      report.push(`STOP_WORDS: קיים רק ב-service: [${missingInExtractor.join(', ')}] | קיים רק ב-extractor: [${missingInService.join(', ')}]`);
    } else {
      report.push(`STOP_WORDS: ✓ (${a.length} מילים)`);
    }
  } else if (name === 'DEFAULT_WEIGHTS') {
    const keysA = Object.keys(serviceVal).sort();
    const keysB = Object.keys(extractorVal).sort();
    const keyMismatch = JSON.stringify(keysA) !== JSON.stringify(keysB);
    const valueDiffs = [];
    keysA.forEach((k) => {
      if (serviceVal[k] !== extractorVal[k]) valueDiffs.push(`${k}: service=${serviceVal[k]} extractor=${extractorVal[k]}`);
    });
    if (keyMismatch || valueDiffs.length) {
      anyMismatch = true;
      report.push(`DEFAULT_WEIGHTS: מפתחות שונים=${keyMismatch} | ערכים שונים: ${valueDiffs.join('; ') || '-'}`);
    } else {
      report.push(`DEFAULT_WEIGHTS: ✓ (${keysA.length} מפתחות)`);
    }
  } else if (name === 'NGRAM_MIN_WORDS' || name === 'DEFAULT_THRESHOLD') {
    // קבועים סקלריים — סף מילים לחסימת ngramGeneric / סף החלטה ברירת-מחדל. חייבים
    // להיות זהים כדי שהדגימה וההרצה בייצור יתנהגו זהה בדיוק.
    if (serviceVal !== extractorVal) {
      anyMismatch = true;
      report.push(`${name}: service=${serviceVal} extractor=${extractorVal}`);
    } else {
      report.push(`${name}: ✓ (${serviceVal})`);
    }
  } else {
    // FORMAL_CONNECTORS / CLICHE_PHRASES — מערכים; משווים כרשימות מסודרות (סדר לא אמור
    // להשפיע על ההתנהגות, אבל אם הוא שונה זה עדיין סימן לדריפט ידני שכדאי לדעת עליו).
    const a = [...serviceVal];
    const b = [...extractorVal];
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    const missingInExtractor = sortedA.filter((w) => !sortedB.includes(w));
    const missingInService = sortedB.filter((w) => !sortedA.includes(w));
    const orderDiffers = JSON.stringify(a) !== JSON.stringify(b) && !missingInExtractor.length && !missingInService.length;
    if (missingInExtractor.length || missingInService.length) {
      anyMismatch = true;
      report.push(`${name}: קיים רק ב-service: [${missingInExtractor.join(', ')}] | קיים רק ב-extractor: [${missingInService.join(', ')}]`);
    } else if (orderDiffers) {
      anyMismatch = true;
      report.push(`${name}: אותה תכולה אבל סדר שונה — סימן לדריפט ידני, לתקן ידנית.`);
    } else {
      report.push(`${name}: ✓ (${a.length} ביטויים)`);
    }
  }
}

console.log('=== sync-check: styleAuthenticityService.js ↔ extractor.mjs ===');
report.forEach((line) => console.log(`  ${line}`));

if (anyMismatch) {
  console.log('\n✗ נמצא דריפט — לסנכרן ידנית בין שני הקבצים.');
  process.exit(1);
}

console.log('\n✓ מסונכרן.');
process.exit(0);
