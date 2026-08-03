// sync-check.mjs — שער סנכרון: styleAuthenticityService.js (המקור, browser-coupled)
// מול extractor.mjs (המראה ל-Node). extractor.mjs מוצהר "מראה verbatim" בהערת הראש שלו —
// השער הזה אוכף את זה בפועל, כי אין דרך אחרת לגלות שהם התפצלו חוץ מקריאה ידנית.
//
// לא ניתן לייבא את styleAuthenticityService.js ישירות ב-Node (הוא מייבא './aiService',
// שכבת browser כבדה). במקום זה: קוראים את שני הקבצים כטקסט, מאתרים כל בלוק מערך/אובייקט
// עם regex, ומריצים אותו עם new Function כדי לקבל את הערך האמיתי (לא פרסור-טקסט שביר).
//
// ⚠️ מאז איחוד רשימות המרקרים (styleMarkers.shared.js) יש כאן **שני** סוגי שערים:
//   · SHARED_NAMES (FORMAL_CONNECTORS / CLICHE_PHRASES) — לא מוכרזים יותר באף אחד
//     משני הקבצים אלא מיובאים מהמקור המשותף. אין מה להשוות ערכית, ולכן נבדק שאף
//     צד לא הכריז לעצמו עותק מקומי חדש ושהשניים באמת מייבאים משם.
//   · NAMES (STOP_WORDS / DEFAULT_WEIGHTS / הקבועים) — עדיין משוכפלים ידנית, ולכן
//     עדיין מושווים ערך-מול-ערך כמו קודם.
//
// הרצה: node tools/detector-train/sync-check.mjs   (exit≠0 = השערים לא מסונכרנים)

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVICE_PATH = path.join(HERE, '..', '..', 'src', 'services', 'styleAuthenticityService.js');
const EXTRACTOR_PATH = path.join(HERE, 'extractor.mjs');
const SHARED_PATH = path.join(HERE, '..', '..', 'src', 'services', 'styleMarkers.shared.js');

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

// שמות שכבר **אינם** מוכרזים באף אחד משני הקבצים: הם חיים ב-styleMarkers.shared.js
// ומיובאים לשניהם. עבורם אין מה להשוות ערך-מול-ערך (זה אותו אובייקט בדיוק); מה
// שצריך שמירה הוא שאף צד לא יחזיר לעצמו עותק מקומי — וזה בדיוק מה שנבדק כאן.
const SHARED_NAMES = ['FORMAL_CONNECTORS', 'CLICHE_PHRASES'];
const NAMES = ['STOP_WORDS', 'DEFAULT_WEIGHTS', 'NGRAM_MIN_WORDS', 'DEFAULT_THRESHOLD'];

let anyMismatch = false;
const report = [];

// ---- שער המקור המשותף ----
const SHARED_IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*['"][^'"]*styleMarkers\.shared(?:\.js)?['"]/g;
const serviceSrc = readFileSync(SERVICE_PATH, 'utf8');
const extractorSrc = readFileSync(EXTRACTOR_PATH, 'utf8');

// כל השמות שקובץ נתון מייבא מהמקור המשותף (תומך בייבוא רב-שורתי ובכינוי `as`).
const sharedImportNames = (src) => {
  const names = new Set();
  for (const m of src.matchAll(SHARED_IMPORT_RE)) {
    m[1].split(',').forEach((part) => {
      const raw = part.trim();
      if (raw) names.add(raw.split(/\s+as\s+/)[0].trim());
    });
  }
  return names;
};
const SERVICE_SHARED_IMPORTS = sharedImportNames(serviceSrc);
const EXTRACTOR_SHARED_IMPORTS = sharedImportNames(extractorSrc);

for (const name of SHARED_NAMES) {
  let sharedVal;
  try {
    sharedVal = loadDecl(SHARED_PATH, name);
  } catch (err) {
    anyMismatch = true;
    report.push(`${name}: ✗ לא נמצא ב-styleMarkers.shared.js — ${err.message}`);
    continue;
  }
  const problems = [];
  [
    [serviceSrc, SERVICE_SHARED_IMPORTS, 'styleAuthenticityService.js'],
    [extractorSrc, EXTRACTOR_SHARED_IMPORTS, 'extractor.mjs'],
  ].forEach(([src, imported, label]) => {
    // עותק מקומי שחזר: `const NAME = [` באותו קובץ.
    if (new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*\\[`).test(src)) {
      problems.push(`${label} הכריז שוב עותק מקומי`);
    }
    if (!imported.has(name)) problems.push(`${label} אינו מייבא אותו מ-styleMarkers.shared`);
  });
  if (problems.length) {
    anyMismatch = true;
    report.push(`${name}: ${problems.join(' | ')}`);
  } else {
    report.push(`${name}: ✓ מקור אחד משותף (${sharedVal.length} ביטויים) — שני הקבצים מייבאים, אין עותק מקומי`);
  }
}

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
    // אין ענף גנרי בכוונה: כל שם ב-NAMES חייב כלל השוואה מפורש. שם חדש שנוסף בלי
    // כלל היה נבדק "איכשהו" ומדווח ✓ — בדיוק סוג השקט שהשער הזה קיים כדי למנוע.
    anyMismatch = true;
    report.push(`${name}: ✗ אין כלל השוואה מוגדר ל-"${name}" ב-sync-check — להוסיף אותו.`);
  }
}

console.log('=== sync-check: styleMarkers.shared.js → styleAuthenticityService.js ↔ extractor.mjs ===');
report.forEach((line) => console.log(`  ${line}`));

if (anyMismatch) {
  console.log('\n✗ נמצא דריפט — לסנכרן ידנית בין שני הקבצים.');
  process.exit(1);
}

console.log('\n✓ מסונכרן.');
process.exit(0);
