// styleFingerprintService.js — "עד כמה זה נשמע כמוך": מדד ייחוס-מחבר מקומי.
//
// למה זה נחוץ: המטרה של המסלול המקומי היא לכתוב **בסגנון של המשתמש**, אבל עד
// היום זו הייתה טענה לא-מדידה. [styleAuthenticityService](./styleAuthenticityService.js)
// עונה על שאלה אחרת — "האם זה נשמע גנרי/מכונתי" — וזה מדד *שלילי*: טקסט יכול
// לקבל בו ציון מצוין ועדיין להישמע כמו מישהו אחר לגמרי.
//
// השיטה: Burrows's Delta, התקן המקובל בייחוס-מחבר (stylometry).
//   1. בונים פרופיל מהמסמכים של המחבר: תדירות יחסית של N המילים השכיחות ביותר.
//   2. כל תכונה מתוקננת ל-z לפי ממוצע וסטיית-תקן **על פני מסמכי המחבר**.
//   3. המרחק של טקסט חדש = ממוצע |z| שלו על פני התכונות. נמוך = דומה יותר.
//
// למה מילים שכיחות ולא תוכן: בדיוק מפני שהן חסרות תוכן. "של", "אשר", "עם זאת" —
// התדירות שלהן היא טביעת אצבע של המחבר ואינה תלויה בנושא העבודה. מדד שנשען על
// מילות תוכן היה מודד *על מה כתבת*, לא *איך*.
//
// ⚠️ המדד חסר משמעות בלי ולידציה. מספר יחיד ("Delta=0.7") לא אומר כלום עד
// שמראים שהמדד מדרג עבודה *אמיתית* של המשתמש קרוב יותר מטקסט של מחבר אחר
// באותה שפה ובאותו ז'אנר. ראה tools/test-bench/style-eval.mjs — שם רצה
// ולידציית leave-one-out לפני שמישהו מצטט מספר.
//
// ⚠️ בקרה חייבת להיות **באותה שפה**. פרופיל עברי מול מקור אנגלי ייתן הפרדה
// מושלמת שמודדת שפה ולא מחבר.
//
// LEAF טהור: אפס import. עובד ב-Node וב-browser.

// ---------- למה n-גרמים של תווים ולא מילים שכיחות ----------
//
// Delta הקלאסי נשען על מילות פונקציה עצמאיות. זה עובד באנגלית (the/of/and/to)
// ו**נכשל בעברית**: רוב מילות הפונקציה מודבקות כתחיליות (ב־ ל־ כ־ מ־ ש־ ו־ ה־),
// ולכן "שהוא", "בישראל", "והמדינה" הן טוקן אחד כל אחת ונדירות בנפרד.
//
// נמדד על הקורפוס האמיתי (63 מסמכים עבריים): רק **18 מילים** מופיעות ב-60%
// מהמסמכים, ו-32 ב-50%. אי אפשר לייחס מחבר ממרחב של 18 תכונות — וזו הייתה
// הסיבה האמיתית ל-AUC 0.68, לא סף שנבחר רע.
//
// n-גרמים של תווים לוכדים את אותן תחיליות/סופיות מעצמם (" ש", "ות ", " המ"),
// ובספרות הם ממילא התכונה החזקה ביותר בייחוס-מחבר, ובמיוחד בשפות עשירות-מורפולוגיה.
export const NGRAM_N = 3;
export const DEFAULT_FEATURES = 1000;
// מסמך קצר מדי לא נושא סטטיסטיקה אמינה של מילים שכיחות.
export const MIN_DOC_WORDS = 250;

// דגימה באורך אחיד. תדירות יחסית מנורמלת בתוחלת, אבל **השונות** של האומדן
// תלויה באורך: עבודה של 300 מילים ואחת של 5,000 אינן ברות-השוואה, והאורך נכנס
// למדד כמשתנה מבלבל. חותכים את כל המסמכים לאותו חלון. חיתוך לפי תווים ולא לפי
// טוקנים — כדי לשמור פיסוק ומבנה פסקאות בשביל התכונות המבניות.
const SAMPLE_CHARS = 9000;

// Culling: מילה נשמרת רק אם היא מופיעה בשיעור הזה מהמסמכים. זה המבחין בין
// מילת פונקציה ("של", "אשר") למילת נושא ("דיפלומטיה") — מילת פונקציה מופיעה
// כמעט בכל מסמך, מילת נושא מרוכזת בכמה. בלי זה המדד מודד *על מה* כתבת ולא *איך*,
// וזו הייתה סיבת הכשל השנייה במדידה (AUC 0.681).
const CULL_MIN_DOC_RATIO = 0.6;

const TOKEN_RE = /[א-ת]+(?:["'׳״][א-ת]+)?|[A-Za-z]+(?:'[A-Za-z]+)?/g;

/** טוקניזציה אחידה לכל צדדי המדד. מחזיר מילים באותיות קטנות. */
export function tokenizeForStyle(text) {
  const out = String(text || '').toLowerCase().match(TOKEN_RE);
  return out || [];
}

/**
 * נרמול לצורך n-גרמים: רווחים מכווצים לרווח יחיד (הרווח הוא סמן גבול-מילה,
 * וגבול-מילה הוא בדיוק מה שלוכד תחיליות), ספרות מוחלפות ב-# כדי ששנות פרסום
 * ומספרי עמודים לא ייספרו כסגנון.
 */
function normalizeForNgrams(text) {
  return ` ${String(text || '').toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()} `;
}

/** n-גרמים של תווים, כרשימה. */
export function charNgrams(text, n = NGRAM_N) {
  const s = normalizeForNgrams(text);
  const out = [];
  for (let i = 0; i + n <= s.length; i += 1) out.push(s.slice(i, i + n));
  return out;
}

/** תדירויות יחסיות (מילה → שיעור מכלל הטוקנים). */
function relativeFrequencies(tokens) {
  const counts = new Map();
  for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
  const total = tokens.length || 1;
  const rel = new Map();
  for (const [w, c] of counts) rel.set(w, c / total);
  return rel;
}

// ---------- תכונות מבניות ----------
//
// Delta על מילים לבדו מפספס את מה שקורא אנושי שומע ראשון: אורך משפט, צפיפות
// פסיקים, שיעור שעבוד. הן נכנסות כתכונות נוספות ועוברות אותו תקנון z, ולכן
// אינן דורסות את סקאלת התדירויות.
export const STRUCTURAL_KEYS = [
  '@sentLen', '@sentLenSd', '@commaPerSent', '@subordination', '@typeTokenRatio', '@paraSents',
];

/** תוויות קריאות — משמשות את כרטיס הסגנון ב-onboarding. */
export const STRUCTURAL_LABELS = {
  '@sentLen': 'אורך משפט ממוצע (מילים)',
  '@sentLenSd': 'שונות אורך המשפט',
  '@commaPerSent': 'פסיקים למשפט',
  '@subordination': 'שיעור שעבוד (משפט מורכב)',
  '@typeTokenRatio': 'גיוון אוצר מילים',
  '@paraSents': 'משפטים לפסקה',
};

export function structuralFeatures(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const sentences = clean.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 1);
  const paragraphs = String(text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const tokens = tokenizeForStyle(clean);

  const lens = sentences.map((s) => tokenizeForStyle(s).length).filter((n) => n > 0);
  const mean = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
  const variance = lens.length > 1
    ? lens.reduce((a, n) => a + (n - mean) ** 2, 0) / (lens.length - 1)
    : 0;

  const commas = (clean.match(/,/g) || []).length;
  // שעבוד בעברית: ש-מחוברת, "אשר", "כאשר", "כדי ש", "מפני ש" — סמן מובהק
  // למשפט מורכב מול משפט פשוט.
  const subord = (clean.match(/\bאשר\b|\bכאשר\b|\bמכיוון\b|\bמפני\b|\bכיוון ש|\bבעוד\b|\bלמרות\b|ש[א-ת]{2,}/g) || []).length;

  return {
    '@sentLen': mean,
    '@sentLenSd': Math.sqrt(variance),
    '@commaPerSent': sentences.length ? commas / sentences.length : 0,
    '@subordination': tokens.length ? subord / tokens.length : 0,
    '@typeTokenRatio': tokens.length ? new Set(tokens).size / tokens.length : 0,
    '@paraSents': paragraphs.length ? sentences.length / paragraphs.length : 0,
  };
}

/**
 * וקטור התכונות הגולמי של מסמך יחיד, ביחס לרשימת מילים נתונה.
 * @returns {number[]} באורך words.length + STRUCTURAL_KEYS.length
 */
/**
 * מסיר טקסט שאינו של המחבר. קריטי: עבודה אקדמית היא בחלקה הגדול חומר מצוטט
 * ורשימת מקורות, ולשני אלה חתימת n-גרמים **משותפת לכל המחברים** (שמות לועזיים,
 * שנים, סוגריים, נקודתיים) — שגם תופסת אחוז שונה בכל מסמך. זה מדלל את אות
 * המחבר ומכניס שונות שאינה סגנונית.
 */
export function stripNonAuthorial(text, stripTerms = []) {
  let s = String(text || '');
  // ⚠️ שם המחבר. הוא מופיע בעבודות שלו ולא של אחרים, ולכן המדד לומד **חתימה**
  // ולא סגנון. נמדד: «ותם» (מתוך "רותם") צף כאחד הרצפים המבחינים ביותר.
  // באפליקציה השם ידוע מהפרופיל; בהרנס הוא מוזרק.
  for (const t of stripTerms) {
    const term = String(t || '').trim();
    if (term.length >= 2) s = s.split(term).join(' ');
  }
  // רשימת מקורות עד סוף המסמך.
  s = s.replace(/\n\s*(?:ביבליוגרפיה|רשימת מקורות|רשימה ביבליוגרפית|מקורות|references|bibliography|works cited)\s*:?\s*\n[\s\S]*$/i, '\n');
  // ציטוט ישיר במרכאות — מילותיו של אחר.
  s = s.replace(/[""״"][^""״"\n]{25,}[""״"]/g, ' ');
  // הפניה בסוגריים. ⚠️ הגרסה הראשונה דרשה שנה בת 4 ספרות ולכן **החמיצה הפניות
  // עבריות** ("(תקציר שיעור הגנות עיתונאיות)"). נמדד: ההפניה החוזרת הציפה את
  // המדד — «עור»+16.08 «יעו»+13.94 מתוך המילה "שיעור" — כלומר נמדדה מחרוזת
  // ההפניה ולא הכתיבה. כל סוגר קצר מוסר: בטקסט אקדמי רובם המכריע הפניות, וזה
  // מוחל באופן סימטרי גם על קורפוס המשתמש וגם על הפלט הנמדד.
  s = s.replace(/\([^()\n]{2,80}\)/g, ' ');
  s = s.replace(/https?:\/\/\S+/g, ' ');
  return s.replace(/[ \t]+/g, ' ');
}

// ⚠️ `stripTerms` **נשמט כאן בשקט עד 26.7.26.** הפונקציה פירקה רק `useStructural`,
// ולכן המונחים שהועברו ב-opts השפיעו על *בחירת התכונות* בלבד (ר' buildAuthorProfile,
// שם דגימות מנוטרלות) ולא על הווקטורים עצמם. התוצאה: מבחן התקפות
// "בלי שם המחבר" ב-style-eval דיווח AUC כמעט זהה — אבל השם מעולם לא הוסר
// מהווקטור, ולכן המבחן לא בדק את מה שהוא הצהיר עליו.
//
// עם ברירת המחדל (`[]`) ההתנהגות זהה לחלוטין לקודם — stripNonAuthorial(t, [])
// שווה ל-stripNonAuthorial(t) — ולכן מסלול הייצור לא זז.
export function featureVector(text, features, { useStructural = true, stripTerms = [] } = {}) {
  const sample = stripNonAuthorial(text, stripTerms).slice(0, SAMPLE_CHARS);
  const rel = relativeFrequencies(charNgrams(sample));
  const ngramPart = features.map((f) => rel.get(f) || 0);
  if (!useStructural) return ngramPart;
  const struct = structuralFeatures(sample);
  return [...ngramPart, ...STRUCTURAL_KEYS.map((k) => struct[k] || 0)];
}

/**
 * בונה פרופיל מחבר.
 *
 * ⚠️ התקנון הוא מול **אוכלוסיית הייחוס** (מסמכי המחבר + מסמכי הבקרה), לא מול
 * שונות המחבר לבדו. זו נקודת הכשל היחידה והקריטית של המדד, ונמדדה בפועל:
 * בגרסה שתיקננה מול המחבר בלבד, מסמך זר קיבל x≈0 כמעט בכל תכונה ולכן
 * z=(0−mean)/sd — ערך **קבוע שאינו תלוי במסמך**. כל טקסטי הבקרה התכנסו ל-Delta
 * זהה (0.49–0.53) והמדד איבד כושר הבחנה (AUC 0.786, leave-one-out 3/24).
 * זהו Delta של Burrows כפי שהוא מוגדר: מתקננים מול הקורפוס, ואז משווים את
 * פרופיל ה-z של המסמך לפרופיל ה-z הממוצע של המחבר.
 *
 * @param {string[]} authorDocs טקסטים של המחבר (≥2)
 * @param {{referenceDocs?:string[], mfw?:number}} opts
 *        referenceDocs — טקסטים של מחברים אחרים באותה שפה. בלעדיהם התקנון
 *        מתבצע על מסמכי המחבר בלבד, והמדד מסומן degenerate.
 * @returns {{words:string[], popMean:number[], popSd:number[], authorZ:number[],
 *            docCount:number, keys:string[], degenerate:boolean}|null}
 */
export function buildAuthorProfile(authorDocs, {
  referenceDocs = [], mfw = DEFAULT_FEATURES, useStructural = true, stripTerms = [],
} = {}) {
  const clean = (arr) => (Array.isArray(arr) ? arr : [])
    .map((d) => String(d || ''))
    .filter((d) => tokenizeForStyle(d).length >= MIN_DOC_WORDS);

  const author = clean(authorDocs);
  const reference = clean(referenceDocs);
  if (author.length < 2) return null;

  const population = [...author, ...reference];
  const degenerate = reference.length < 2;

  // המילים השכיחות נגזרות מהאוכלוסייה — לא מרשימת מילות-פונקציה קשיחה. כך
  // המדד עובד לכל משתמש ולכל שפה בלי מילון לתחזק.
  const samples = population.map((d) => stripNonAuthorial(d, stripTerms).slice(0, SAMPLE_CHARS));
  const pooled = relativeFrequencies(samples.flatMap((d) => charNgrams(d)));

  // כמה מסמכים כוללים כל n-גרם — הבסיס ל-culling. n-גרם שמופיע כמעט בכל מסמך
  // הוא תבנית לשונית כללית (סדר תווים, תחיליות), ולא סמן נושא.
  const docFreq = new Map();
  for (const s of samples) {
    for (const g of new Set(charNgrams(s))) docFreq.set(g, (docFreq.get(g) || 0) + 1);
  }
  const minDocs = Math.ceil(samples.length * CULL_MIN_DOC_RATIO);

  const words = [...pooled.entries()]
    .filter(([g]) => (docFreq.get(g) || 0) >= minDocs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, mfw)
    .map(([g]) => g);
  if (words.length < 50) return null;   // culling חתך יותר מדי — אין על מה למדוד

  const opts = { useStructural, stripTerms };
  const dim = words.length + (useStructural ? STRUCTURAL_KEYS.length : 0);
  const popVectors = population.map((d) => featureVector(d, words, opts));

  const popMean = new Array(dim).fill(0);
  for (const v of popVectors) for (let i = 0; i < dim; i += 1) popMean[i] += v[i];
  for (let i = 0; i < dim; i += 1) popMean[i] /= popVectors.length;

  const popSd = new Array(dim).fill(0);
  for (const v of popVectors) for (let i = 0; i < dim; i += 1) popSd[i] += (v[i] - popMean[i]) ** 2;
  for (let i = 0; i < dim; i += 1) {
    popSd[i] = Math.sqrt(popSd[i] / Math.max(1, popVectors.length - 1));
    if (!(popSd[i] > 1e-12)) popSd[i] = 1e-12;
  }

  // פרופיל ה-z של המחבר = ממוצע וקטורי ה-z של מסמכיו.
  const authorZ = new Array(dim).fill(0);
  for (const d of author) {
    const v = featureVector(d, words, opts);
    for (let i = 0; i < dim; i += 1) authorZ[i] += (v[i] - popMean[i]) / popSd[i];
  }
  for (let i = 0; i < dim; i += 1) authorZ[i] /= author.length;

  return {
    words, popMean, popSd, authorZ, opts,
    docCount: author.length,
    keys: useStructural ? [...words, ...STRUCTURAL_KEYS] : [...words],
    degenerate,
  };
}

/**
 * מרחק Burrows's Delta בין טקסט לפרופיל מחבר. **נמוך = דומה יותר.**
 *
 * @param {string} text
 * @param {object} profile מ-buildAuthorProfile
 * @returns {{delta:number, top:Array<{key:string,z:number}>}|null}
 *          top = התכונות שהכי מרחיקות את הטקסט מהמחבר (להסבר למשתמש)
 */
export function burrowsDelta(text, profile) {
  if (!profile?.words?.length) return null;
  const v = featureVector(text, profile.words, profile.opts || {});
  const z = v.map((x, i) => (x - profile.popMean[i]) / profile.popSd[i]);
  const diffs = z.map((zi, i) => zi - profile.authorZ[i]);

  // Delta הקלאסי: ממוצע ערכים מוחלטים (ולא מרחק אוקלידי) — כך סטייה בודדת
  // קיצונית לא מטביעה את המדד.
  const delta = diffs.reduce((a, d) => a + Math.abs(d), 0) / diffs.length;

  // Cosine Delta (Smith & Aldridge): הזווית בין וקטורי ה-z במקום המרחק ביניהם.
  // מדווח בספרות כעדיף על Delta הקלאסי, ובעיקר **חסין לאורך הטקסט** — גודל
  // הווקטור גדל עם מדגם קטן ורועש, והכיוון לא. זה בדיוק מצב החלון הבודד שבו
  // המדד הזה אמור לעבוד בייצור.
  let dot = 0; let na = 0; let nb = 0;
  for (let i = 0; i < z.length; i += 1) {
    dot += z[i] * profile.authorZ[i];
    na += z[i] * z[i];
    nb += profile.authorZ[i] * profile.authorZ[i];
  }
  const cosineDelta = (na > 0 && nb > 0) ? 1 - (dot / (Math.sqrt(na) * Math.sqrt(nb))) : 2;

  const top = diffs
    .map((d, i) => ({ key: profile.keys[i], z: Number(d.toFixed(2)) }))
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    .slice(0, 8);
  return { delta, cosineDelta, top };
}

/**
 * ממקם Delta על סקאלה קריאה בין "מחבר אחר" ל"המשתמש עצמו".
 * 100 = כמו עבודה אמיתית שלו; 0 = כמו טקסט של מחבר אחר.
 *
 * ⚠️ שני קצוות הסקאלה חייבים להימדד מנתונים (ר' style-eval.mjs). קריאה עם
 * קצוות מומצאים מייצרת מספר שנשמע מוסמך ואינו אומר דבר.
 */
export function styleMatchScore(delta, { selfDelta, otherDelta }) {
  if (!Number.isFinite(delta) || !Number.isFinite(selfDelta) || !Number.isFinite(otherDelta)) return null;
  if (otherDelta <= selfDelta) return null; // סקאלה הפוכה/מנוונת — המדד לא ולידי כאן
  const t = (otherDelta - delta) / (otherDelta - selfDelta);
  return Math.round(Math.max(0, Math.min(1, t)) * 100);
}
