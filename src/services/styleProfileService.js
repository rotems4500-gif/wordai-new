// styleProfileService.js — מנוע הסגנון האישי (Personal Style Engine), Phase 1.
//
// המודול הזה הוא בעל-הסכמה והמנוע המקומי (חינם, ללא LLM) של פרופיל הסגנון:
// כרייה של מדדים מספריים מהטקסטים של המשתמש, אגרגציה משוקללת עם התפלגות (CV/std),
// חישוב ודאות, ובניית בלוק הזרקה עברי רזה לפרומפט. הוא *טהור* — בלי תלות ב-aiService
// או ב-workspaceLearningService (שניהם מייבאים ממנו / יובאו ממנו; ייבוא הפוך = מעגל).
// לכן רשימות ה-stopwords / connectors משוכפלות כאן במכוון.
//
// עובד בדפדפן בלבד (בלי Node APIs). ES modules, JS רגיל.
// תוכנית מלאה: docs/style-engine-plan.md (במיוחד סעיפים 5a, 6, 7).
//
// שני ה-imports הבאים הם מודולי style* אחיים שכבר מייבאים *מכאן* (getChunks/
// selectExemplarSentences → styleSampleStore/styleRetrievalService, ושניהם מייבאים
// חזרה computeLocalMetrics/STYLE_CONNECTORS). זה מעגל ESM, אך בטוח: כל שימוש הדדי
// נעשה רק בתוך גופי פונקציות (בזמן קריאה), לא בזמן טעינת המודול. משמשים רק את
// deriveManualDefaultsFromMetrics; שאר המודול נשאר טהור וללא תלות ב-aiService.
import { getChunks } from './styleSampleStore';
import { selectExemplarSentences } from './styleRetrievalService';
// styleReferenceService הוא LEAF (מייבא רק את קובץ הנתונים) — ייבוא ממנו בטוח, בלי מעגל.
import { getReferenceDistribution, getReferenceNgramFreq, getCachedReference, isRealReference } from './styleReferenceService';

export const STYLE_ENGINE_SCHEMA_VERSION = 3;

// E3 — טקסונומיית ז'אנרים קבועה (6 ערכים). 'אחר' = ברירת מחדל / לא-מסווג — לא מקבל
// תת-פרופיל נפרד (נופל ל-global). כל ז'אנר אחר עם ≥3 מסמכים מקבל תת-פרופיל מדדים.
export const GENRES = [
  'אקדמי-מחקרי',
  'נייר עמדה',
  'סקירת ספרות',
  'רפלקציה אישית',
  'מנהלי-מכתבי',
  'אחר',
];
const GENRE_SET = new Set(GENRES);
// מקסימום תת-פרופילי ז'אנר שנשמרים (כל הטקסונומיה חוץ מ'אחר' = 5, אך שומרים 6 להגנה).
const MAX_GENRE_PROFILES = 6;
const MIN_DOCS_PER_GENRE_PROFILE = 3;

// כל המדדים המספריים הסקלריים שמחזיר computeLocalMetrics (לא כולל אובייקטים
// מקוננים כמו punctuationDensity/connectorFrequency, ולא counts גולמיים כמו
// wordCount/sentenceCount/paragraphCount/sampledAt) — לחישוב פיזור בין-מסמכים.
export const SPREAD_METRIC_KEYS = [
  'avgSentenceWords',
  'sentenceLengthStd',
  'sentenceLengthCV',
  'pctShortSentences',
  'pctLongSentences',
  'avgCommasPerSentence',
  'parenthesesDensity',
  'typeTokenRatio',
  'openerRepetitionRate',
  'avgParagraphWords',
  'rhetoricalQuestionRate',
  'exclamationRate',
  'oneWordSentenceRate',
  'registerShiftRate',
];

// לקסיקון מילות קישור מורחב (~30) — superset של COMMON_CONNECTORS
// (workspaceLearningService.js:338) עם מילים מזהות קריטיות שחסרות בו.
// ⚠️ **לא אוחד עם styleMarkers.shared, ובכוונה.** שם יושבות רשימות *מרקרי AI* (מה
// שמעיד על טקסט מחולל); כאן מדובר בלקסיקון *מדידה* — אילו מקשרים המשתמש עצמו
// משתמש בהם, כולל ניטרליים לגמרי ("לכן", "בכך", "ואילו") שאינם מרקרים כלל. זהו
// וקטור תכונות של פרופיל הסגנון: כל שינוי בו משנה את הציון עצמו, לא רק את הזיהוי.
export const STYLE_CONNECTORS = [
  // הבסיס הקיים (COMMON_CONNECTORS):
  'לכן', 'בנוסף', 'עם זאת', 'עם-זאת', 'כמו כן', 'לעומת זאת', 'עם-כן',
  'כלומר', 'למעשה', 'בהתאם לכך', 'בסופו של דבר',
  // תוספות מזהות:
  'בכך', 'כתוצאה מכך', 'מאידך', 'מחד', 'מצד אחד', 'מצד שני', 'כפי ש',
  'אולם', 'אך', 'יתרה מכך', 'יתר על כן', 'לפיכך', 'משום כך', 'זאת ועוד',
  'על כן', 'אף על פי כן', 'ואילו', 'לבסוף', 'ראשית', 'שנית',
];

// רשימת stopwords מינימלית (משוכפלת מ-styleAuthenticityService/ workspaceLearning בכוונה).
const STYLE_STOP_WORDS = new Set([
  'של', 'על', 'עם', 'זה', 'זאת', 'היא', 'הוא', 'הם', 'הן', 'אני', 'אתה', 'את',
  'אנחנו', 'גם', 'אבל', 'או', 'אם', 'כי', 'כל', 'לא', 'כן', 'כך', 'מאוד', 'עוד',
  'רק', 'כדי', 'היה', 'היו', 'יש', 'אין', 'אל', 'מן', 'אלו', 'אלה', 'אשר', 'כאשר',
  'בין', 'לפי', 'תוך', 'אצל', 'מתוך', 'בו', 'בה', 'בהם', 'הזה', 'הזאת', 'את',
]);

// מרקרים דיבוריים לזיהוי שבירת רגיסטר (הוריסטיקה לכל פסקה).
const REGISTER_SHIFT_MARKERS = [
  'אודה ואומר', 'בכנות', 'האמת', 'פשוט', 'ממש', 'דווקא', 'בקיצור',
  'לא יאומן', 'גילוי נאות',
];

// ---------- עזרי בסיס ----------

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const toNum = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};
const nowTs = () => Date.now();

// ניקוי טקסט אחיד — מסיר HTML, מנרמל רווחים ושורות (מקביל ל-stripToText / analyzeTextSample).
const stripToText = (input = '') => String(input || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/[\r\t]+/g, ' ')
  .replace(/ /g, ' ')
  .replace(/\s+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const WORD_RE = /[֐-׿A-Za-z0-9'"׳״-]+/g;
const matchWords = (str = '') => str.match(WORD_RE) || [];

const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const stdDev = (arr) => {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
};

// ---------- סינון טקסט לא-אוטוריאלי (פרוזה בלבד) ----------
//
// נמדד על הקורפוס האמיתי של המשתמש (33 עבודות, 10.8.26): המדידה כאן, שרצה על
// הטקסט הגולמי, אמרה **43,622 מילים · avgSentenceWords 14 · avgParagraphWords
// 29.97 · oneWordSentenceRate 0.20**. styleTargetsService — שמסנן לבלוקי פרוזה —
// מדד על אותו קורפוס בדיוק **28,903 מילים · sentLen 17.1 · paraSents 2.65**.
// הפער, 14,719 מילים (34% מהקורפוס), הוא עמודי שער, ביבליוגרפיה, כותרות סעיפים
// והצהרת השימוש בבינה מלאכותית שהמוסד מחייב. כלומר שליש מהמדידה — וגם מהכרייה —
// לא נכתב על ידי המשתמש, והמספרים המוטים האלה נשלחו גם בתוך הפרומפט החיצוני
// ("~14 מילים" במקום 17.1).
//
// ⚠️ הכללים כאן הם **העתק** של extractProseBlocks ב-styleTargetsService.js — שם
// מקור-האמת, ומשם המספרים המאומתים. לא מייבאים משם: styleTargetsService מייבא
// *מכאן* וייבוא הפוך הוא מעגל בזמן טעינה. **שינוי בכלל אחד מחייב שינוי בשני.**
// ההבדל המכוון היחיד: טוקניזציה ב-matchWords המקומי במקום tokenizeForStyle —
// אותה הגדרת מילה, בלי לגרור לכאן את styleFingerprintService.
const MIN_PROSE_BLOCK_WORDS = 8;

// טקסט שאינו של המשתמש **גם כשהוא פרוזה תקנית**. הרשימה קטנה ומכוונת: כל דפוס
// כאן חייב להיות ניסוח קבוע שמוכתב מבחוץ, לא נושא שהמשתמש נוטה לכתוב עליו.
// המאומת בקורפוס: הצהרת השימוש ב-AI — היא שהפיקה את ביטוי-החתימה מספר 1
// ("באופן + תואר", משקל 0.95, docFraction 0.818) ואת "עבודה זו" (0.78).
// להרחבה: להוסיף כאן שורה, ורק אחרי שראו את הבלוק בפועל בקורפוס.
const NON_AUTHORIAL_BLOCK_PATTERNS = [
  /נעזרתי\s+בבינה\s+מלאכותית/,
  /הצהרה\s+על\s+שימוש\s+בבינה\s+מלאכותית/,
  /שימוש\s+בבינה\s+מלאכותית\s+ב(?:הכנת|עבודה|כתיבת)/,
  /במהלך\s+הכנת\s+עבודה\s+זו\s+נעזרתי/,
  // שורות שער — "תווית: ערך" בתחילת בלוק.
  /^\s*(?:שם\s+הקורס|מספר\s+הקורס|שם\s+המרצה|שם\s+המנחה|מגיש[יה]?\s+העבודה|מגישים|שם\s+הסטודנט(?:ית)?|תעודת\s+זהות|ת\.?\s?ז\.?|תאריך\s+הגשה|מועד\s+הגשה)\s*:/,
  // כותרות מבניות שלעיתים מגיעות עם נקודה בסוף ולכן שורדות את מבחן הפיסוק.
  /^\s*(?:רשימה\s+ביבליוגרפית|ביבליוגרפיה|רשימת\s+מקורות|מקורות|תוכן\s+עניינים)\s*\.?\s*$/,
];

const isNonAuthorialBlock = (block) =>
  NON_AUTHORIAL_BLOCK_PATTERNS.some((re) => re.test(block));

/**
 * בלוקי הפרוזה האוטוריאלית של טקסט (אחרי stripToText).
 *
 * הפיצול על `\n+` ולא על `\n{2,}` הוא בכוונה, מאותה סיבה כמו במקור:
 * mammoth מפריד בשורה אחת ומחלצים אחרים בשתיים.
 *
 * @param {string} text
 * @param {{requireTerminalEnd?:boolean}} opts
 *   requireTerminalEnd=false — כלל מקל לכרייה: ה-chunk store חותך פסקה ארוכה כל
 *   ~160 מילים ולא תמיד בגבול משפט, ולכן בלוק שנחתך באמצע משפט עדיין נחשב פרוזה
 *   אם יש בו לפחות גבול משפט אחד. המדידה משתמשת בכלל המחמיר (=המקור).
 * @returns {string[]}
 */
export function extractAuthorialProseBlocks(text, { requireTerminalEnd = true } = {}) {
  return String(text || '')
    .split(/\n+/)
    .map((b) => b.trim())
    .filter(Boolean)
    .filter((b) => !isNonAuthorialBlock(b))
    .filter((b) => (requireTerminalEnd ? /[.!?]\s*$/.test(b) : /[.!?]/.test(b)))
    .filter((b) => matchWords(b).length >= MIN_PROSE_BLOCK_WORDS);
}

/**
 * הטקסט האוטוריאלי כמחרוזת אחת, בלוק לפסקה.
 * אם לא נמצא ולו בלוק פרוזה אחד — חילוץ חריג (טקסט בלי סימני סיום בסוף שורה,
 * למשל OCR או PDF שנשבר) — נופלים חזרה לטקסט המלא בניכוי ה-boilerplate בלבד.
 * החזרת null במקרה הזה הייתה מאפסת פרופיל של משתמש קיים, וזה מחיר גבוה מדי
 * לעומת מדידה פחות נקייה על מסמך שממילא אינו פרוזה.
 */
const authorialProseText = (clean) => {
  const blocks = extractAuthorialProseBlocks(clean);
  if (blocks.length) return blocks.join('\n\n');
  return String(clean || '')
    .split(/\n+/)
    .map((b) => b.trim())
    .filter(Boolean)
    .filter((b) => !isNonAuthorialBlock(b))
    .join('\n\n');
};

// ---------- computeLocalMetrics ----------

/**
 * מחשב מדדי סגנון מקומיים (חינם, עברית-aware) מטקסט יחיד.
 * מודד **פרוזה אוטוריאלית בלבד** (ר' הבלוק שמעל) — שער, ביבליוגרפיה, כותרות
 * והצהרות מוסד אינם כתיבה של המשתמש ואינם נספרים.
 * מחזיר null אם פחות מ-25 מילים (מקביל ל-guard של styleAuthenticityService).
 * @param {string} text
 * @returns {object|null}
 */
export function computeLocalMetrics(text) {
  const raw = stripToText(text);
  if (!raw) return null;
  const clean = authorialProseText(raw);
  if (!clean) return null;

  const allWords = matchWords(clean);
  const wordCount = allWords.length;
  if (wordCount < 25) return null;

  // פסקאות: split כפול-שורה; אם אין — split שורה בודדת.
  let paragraphs = clean.split(/\n{2,}|\r\n\r\n/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length <= 1) {
    const single = clean.split(/\n+/).map((p) => p.trim()).filter(Boolean);
    if (single.length > paragraphs.length) paragraphs = single;
  }
  if (!paragraphs.length) paragraphs = [clean];

  // משפטים: split על גבולות פיסוק סוף-משפט.
  const sentences = clean.split(/[.!?…]+/).map((s) => s.trim()).filter(Boolean);
  const sentenceCount = sentences.length;
  const paragraphCount = paragraphs.length;

  // מטא לכל משפט: מספר מילים, פסיקים, סימן סיום.
  const sentenceWordCounts = [];
  let totalCommasInSentences = 0;
  let shortSentences = 0;
  let longSentences = 0;
  let oneWordSentences = 0;

  // סימני סיום נספרים מהטקסט המקורי (ה-split מסיר אותם).
  const questionMarks = (clean.match(/\?/g) || []).length;
  const exclamationMarks = (clean.match(/!/g) || []).length;

  const openerCounts = {};
  sentences.forEach((sentence) => {
    const sw = matchWords(sentence);
    const n = sw.length;
    if (n > 0) {
      sentenceWordCounts.push(n);
      if (n < 12) shortSentences += 1;
      if (n > 28) longSentences += 1;
      if (n <= 2) oneWordSentences += 1;
      const opener = sw.slice(0, Math.min(2, n)).join(' ').toLowerCase();
      if (opener.length >= 3) openerCounts[opener] = (openerCounts[opener] || 0) + 1;
    }
    totalCommasInSentences += (sentence.match(/,/g) || []).length;
  });

  const effectiveSentenceCount = sentenceWordCounts.length || 0;
  const avgSentenceWords = effectiveSentenceCount ? round(mean(sentenceWordCounts), 2) : 0;
  const sentenceLengthStd = effectiveSentenceCount >= 2 ? round(stdDev(sentenceWordCounts), 2) : 0;
  const sentenceLengthCV = (effectiveSentenceCount >= 2 && avgSentenceWords > 0)
    ? round(sentenceLengthStd / avgSentenceWords, 3)
    : 0;

  const denomSent = effectiveSentenceCount || 1;
  const pctShortSentences = Math.round((shortSentences / denomSent) * 100);
  const pctLongSentences = Math.round((longSentences / denomSent) * 100);
  const avgCommasPerSentence = round(totalCommasInSentences / denomSent, 2);

  // פיסוק — ספירות מוחלטות וצפיפות לכל מילה.
  const commaCount = (clean.match(/,/g) || []).length;
  const semicolonCount = (clean.match(/;/g) || []).length;
  const dashCount = (clean.match(/[־–—-]/g) || []).length;
  const colonCount = (clean.match(/:/g) || []).length;
  const parenPairs = (clean.match(/\([^)]*\)/g) || []).length;

  const punctuationDensity = {
    comma: round(commaCount / wordCount, 4),
    semicolon: round(semicolonCount / wordCount, 4),
    dash: round(dashCount / wordCount, 4),
    colon: round(colonCount / wordCount, 4),
  };
  const parenthesesDensity = round((parenPairs / wordCount) * 100, 2);

  // תדירות מילות קישור — ל-100 מילים, רק nonzero, ממוין יורד, cap 15.
  const connectorFrequency = {};
  STYLE_CONNECTORS.forEach((connector) => {
    let hits = 0;
    let from = 0;
    let idx = clean.indexOf(connector, from);
    while (idx !== -1) {
      hits += 1;
      from = idx + connector.length;
      idx = clean.indexOf(connector, from);
    }
    if (hits > 0) connectorFrequency[connector] = round((hits / wordCount) * 100, 3);
  });
  const connectorFrequencyCapped = Object.fromEntries(
    Object.entries(connectorFrequency).sort((a, b) => b[1] - a[1]).slice(0, 15),
  );
  // ⚠️ connectorFrequency נחתך ל-15 המובילים, ולכן היעדר מילה ממנו **אינו** אומר
  // שהמשתמש לא כותב אותה — רק שהיא לא נכנסה לרשימה. נמדד (10.8.26): בגלל זה
  // computeConnectorContrasts הורה 'העדף "בנוסף" (לא "כמו כן")' לכותב שכן כותב
  // "כמו כן". connectorsUsed הוא הרשימה המלאה והלא-חתוכה של מה שנמדד בפועל
  // (מחרוזות בלבד, ~30 לכל היותר) — הוא זה שמבדיל אפס-אמיתי מנפילה-מהחיתוך.
  const connectorsUsed = Object.keys(connectorFrequency);

  // Type-Token Ratio על 800 מילים ראשונות (מילים ≥2 תווים), למניעת הטיית אורך.
  const ttrWords = allWords
    .map((w) => w.replace(/^["'׳״-]+|["'׳״-]+$/g, '').toLowerCase())
    .filter((w) => w.length >= 2)
    .slice(0, 800);
  const typeTokenRatio = ttrWords.length ? round(new Set(ttrWords).size / ttrWords.length, 3) : 0;

  // חזרתיות פתיחים — שיעור המשפטים שהפתיח (2 מילים) שלהם חוזר.
  let repeatedOpenerSentences = 0;
  Object.values(openerCounts).forEach((count) => {
    if (count >= 2) repeatedOpenerSentences += count;
  });
  const openerRepetitionRate = effectiveSentenceCount
    ? round(repeatedOpenerSentences / effectiveSentenceCount, 3)
    : 0;

  const avgParagraphWords = paragraphCount
    ? round(wordCount / paragraphCount, 2)
    : 0;

  const rhetoricalQuestionRate = sentenceCount ? round(questionMarks / sentenceCount, 3) : 0;
  const exclamationRate = sentenceCount ? round(exclamationMarks / sentenceCount, 3) : 0;
  const oneWordSentenceRate = effectiveSentenceCount
    ? round(oneWordSentences / effectiveSentenceCount, 3)
    : 0;

  // שבירת רגיסטר — שיעור הפסקאות עם מרקר דיבורי.
  let registerShiftParagraphs = 0;
  paragraphs.forEach((p) => {
    if (REGISTER_SHIFT_MARKERS.some((marker) => p.includes(marker))) registerShiftParagraphs += 1;
  });
  const registerShiftRate = paragraphCount ? round(registerShiftParagraphs / paragraphCount, 3) : 0;

  return {
    wordCount,
    sentenceCount: effectiveSentenceCount,
    paragraphCount,
    avgSentenceWords,
    sentenceLengthStd,
    sentenceLengthCV,
    pctShortSentences,
    pctLongSentences,
    avgCommasPerSentence,
    parenthesesDensity,
    punctuationDensity,
    connectorFrequency: connectorFrequencyCapped,
    connectorsUsed,
    typeTokenRatio,
    openerRepetitionRate,
    avgParagraphWords,
    rhetoricalQuestionRate,
    exclamationRate,
    oneWordSentenceRate,
    registerShiftRate,
    sampledAt: nowTs(),
  };
}

// ---------- aggregateDocumentMetrics ----------

// ממוצע משוקלל לפי weights, מתעלם מ-null.
const weightedMean = (pairs) => {
  let sum = 0;
  let weightSum = 0;
  pairs.forEach(([value, weight]) => {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return;
    const w = weight > 0 ? weight : 0;
    sum += Number(value) * w;
    weightSum += w;
  });
  return weightSum > 0 ? sum / weightSum : 0;
};

// std + cv של סדרת ערכים (לא משוקלל — לתיאור פיזור בין מסמכים).
const spreadOf = (values) => {
  const clean = values.filter((v) => Number.isFinite(Number(v))).map(Number);
  if (clean.length < 2) return { std: 0, cv: 0 };
  const m = mean(clean);
  const std = stdDev(clean);
  return { std: round(std, 3), cv: m !== 0 ? round(std / m, 3) : 0 };
};

/**
 * אגרגציה משוקללת (לפי wordCount) של רשימת תוצאות computeLocalMetrics.
 * שומר גם התפלגות (std/cv) למדדי הליבה — כי השופט משווה שונות ולא רק מרכז.
 * @param {Array<object|null>} perDocMetricsList
 * @returns {object}
 */
export function aggregateDocumentMetrics(perDocMetricsList) {
  const list = (Array.isArray(perDocMetricsList) ? perDocMetricsList : []).filter(
    (m) => isPlainObject(m) && toNum(m.wordCount) > 0,
  );
  const docCount = list.length;

  if (!docCount) {
    return {
      metrics: null,
      metricsSpread: Object.fromEntries(
        SPREAD_METRIC_KEYS.map((k) => [k, { std: 0, cv: 0 }]),
      ),
      totalWordCount: 0,
      docCount: 0,
    };
  }

  const wc = (m) => toNum(m.wordCount);
  const totalWordCount = list.reduce((sum, m) => sum + wc(m), 0);

  const wm = (field) => weightedMean(list.map((m) => [m[field], wc(m)]));

  const punctFields = ['comma', 'semicolon', 'dash', 'colon'];
  const punctuationDensity = {};
  punctFields.forEach((f) => {
    punctuationDensity[f] = round(
      weightedMean(list.map((m) => [m.punctuationDensity?.[f], wc(m)])), 4,
    );
  });

  // מיזוג משוקלל של connectorFrequency, cap 15.
  const connectorAccum = {};
  list.forEach((m) => {
    const w = wc(m);
    Object.entries(m.connectorFrequency || {}).forEach(([k, v]) => {
      if (!connectorAccum[k]) connectorAccum[k] = { sum: 0, weight: 0 };
      connectorAccum[k].sum += Number(v || 0) * w;
      connectorAccum[k].weight += w;
    });
  });
  const connectorFrequency = Object.fromEntries(
    Object.entries(connectorAccum)
      .map(([k, { sum, weight }]) => [k, round(weight > 0 ? sum / weight : 0, 3)])
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15),
  );
  // איחוד לא-חתוך של מילות הקישור שנמדדו בפועל בכל המסמכים (ר' ההערה ב-computeLocalMetrics).
  const connectorsUsed = Array.from(new Set(
    list.flatMap((m) => (Array.isArray(m.connectorsUsed) ? m.connectorsUsed : Object.keys(m.connectorFrequency || {}))),
  ));

  const metrics = {
    wordCount: totalWordCount,
    sentenceCount: list.reduce((s, m) => s + toNum(m.sentenceCount), 0),
    paragraphCount: list.reduce((s, m) => s + toNum(m.paragraphCount), 0),
    avgSentenceWords: round(wm('avgSentenceWords'), 2),
    sentenceLengthStd: round(wm('sentenceLengthStd'), 2),
    sentenceLengthCV: round(wm('sentenceLengthCV'), 3),
    pctShortSentences: Math.round(wm('pctShortSentences')),
    pctLongSentences: Math.round(wm('pctLongSentences')),
    avgCommasPerSentence: round(wm('avgCommasPerSentence'), 2),
    parenthesesDensity: round(wm('parenthesesDensity'), 2),
    punctuationDensity,
    connectorFrequency,
    connectorsUsed,
    typeTokenRatio: round(wm('typeTokenRatio'), 3),
    openerRepetitionRate: round(wm('openerRepetitionRate'), 3),
    avgParagraphWords: round(wm('avgParagraphWords'), 2),
    rhetoricalQuestionRate: round(wm('rhetoricalQuestionRate'), 3),
    exclamationRate: round(wm('exclamationRate'), 3),
    oneWordSentenceRate: round(wm('oneWordSentenceRate'), 3),
    registerShiftRate: round(wm('registerShiftRate'), 3),
    sampledAt: nowTs(),
  };

  const metricsSpread = Object.fromEntries(
    SPREAD_METRIC_KEYS.map((k) => [k, spreadOf(list.map((m) => m[k]))]),
  );

  return { metrics, metricsSpread, totalWordCount, docCount };
}

// ---------- deriveManualDefaultsFromMetrics ----------

// ערכים קנוניים ל-lengthPreference (חייבים להתאים לפרופיל הידני/UI). הסדר = קצר→מפורט,
// כדי לאפשר "דחיפה" של צעד אחד לפי אורך הפסקה (ראה למטה).
const LENGTH_PREF_VALUES = ['short', 'default', 'detailed'];
// ערכים קנוניים ל-tonePreference: 'very_formal'|'formal'|'balanced'|'casual'|'very_casual'.

/**
 * גוזר ברירות-מחדל "ידניות" (length/tone) + משפטי-דוגמה מתוך מדדי ה-baseline של המשתמש,
 * כדי לאתחל בחוכמה את הפרופיל הידני בלי לשאול אותו. **הערכה גסה (היוריסטיקה)** — לא
 * מדידה ישירה של העדפה, ולכן tonePreferenceConfidence הוא 'medium' (או 'low' כשהראיות
 * דלילות/סותרות). טהורה ככל האפשר: קוראת רק getChunks/selectExemplarSentences (תלות
 * מקומית) — לא שומרת ולא מעדכנת פרופיל.
 * @param {object} overview  תוצר getStyleOverview(): { stats:{docCount,...}, metrics, metricsSpread }
 * @returns {{lengthPreference?:string, tonePreference?:string, tonePreferenceConfidence?:string, exemplars?:string[]}}
 */
export function deriveManualDefaultsFromMetrics(overview = {}) {
  const ov = isPlainObject(overview) ? overview : {};
  const stats = isPlainObject(ov.stats) ? ov.stats : {};
  const docCount = Math.max(0, Math.round(toNum(stats.docCount, 0)));
  const metrics = isPlainObject(ov.metrics) ? ov.metrics : null;
  // אין baseline (בלי metrics או בלי מסמכים) → מחזירים {} ולא מנחשים ברירות-מחדל.
  if (!metrics || docCount < 1) return {};

  const metricsSpread = isPlainObject(ov.metricsSpread) ? ov.metricsSpread : {};

  // גישה בטוחה לכל מדד — תמיד fallback מספרי.
  const avgSentenceWords = toNum(metrics.avgSentenceWords, 0);
  const avgParagraphWords = toNum(metrics.avgParagraphWords, 0);
  const typeTokenRatio = toNum(metrics.typeTokenRatio, 0);
  const parenthesesDensity = toNum(metrics.parenthesesDensity, 0);
  const exclamationRate = toNum(metrics.exclamationRate, 0);
  const rhetoricalQuestionRate = toNum(metrics.rhetoricalQuestionRate, 0);
  const oneWordSentenceRate = toNum(metrics.oneWordSentenceRate, 0);
  const registerShiftRate = toNum(metrics.registerShiftRate, 0);
  const connectorFreq = isPlainObject(metrics.connectorFrequency) ? metrics.connectorFrequency : {};

  // --- lengthPreference: מבוסס אורך משפט; אמינות גבוהה (מדד ישיר, לא היוריסטי). ---
  // ≥18 → מפורט, ≥11 → ברירת מחדל, אחרת קצר.
  let lengthIdx = avgSentenceWords >= 18 ? 2 : (avgSentenceWords >= 11 ? 1 : 0);
  // תיקון עדין של צעד אחד לפי אורך הפסקה: פסקה ארוכה מאוד דוחפת ל-detailed, קצרה מאוד
  // ל-short. הגנה: avgParagraphWords>0 מונע דחיפה ל-short כשאין נתון פסקה כלל.
  if (avgParagraphWords >= 90) lengthIdx = Math.min(2, lengthIdx + 1);
  else if (avgParagraphWords > 0 && avgParagraphWords <= 35) lengthIdx = Math.max(0, lengthIdx - 1);
  const lengthPreference = LENGTH_PREF_VALUES[lengthIdx];

  // --- tonePreference: ציון פורמליות 0-1 מכמה מדדים מנורמלים ומשוקללים (היוריסטיקה). ---
  // מעלי פורמליות — כל אחד מנורמל ל-0..1 מול סף "גבוה" סביר, ואז משוקלל:
  const fSentence = clamp(avgSentenceWords / 24, 0, 1);        // ~24 מילים/משפט = פורמלי מאוד
  const fTtr = clamp((typeTokenRatio - 0.35) / 0.35, 0, 1);    // עושר לקסיקלי (TTR) גבוה
  const fParen = clamp(parenthesesDensity / 4, 0, 1);          // סוגריים תכופים = כתיבה עיונית
  const connectorRichness = Object.values(connectorFreq)
    .reduce((sum, v) => sum + toNum(v, 0), 0);                 // סך תדירות מילות הקישור (ל-100 מילים)
  const fConnectors = clamp(connectorRichness / 3, 0, 1);      // שפע מילות קישור אקדמיות
  // מורידי פורמליות (מעלי casual):
  const cExcl = clamp(exclamationRate / 0.15, 0, 1);
  const cRhet = clamp(rhetoricalQuestionRate / 0.15, 0, 1);
  const cOneWord = clamp(oneWordSentenceRate / 0.15, 0, 1);
  const cRegister = clamp(registerShiftRate / 0.3, 0, 1);

  const formalUp = (fSentence * 0.35) + (fTtr * 0.25) + (fParen * 0.15) + (fConnectors * 0.25);
  const casualUp = (cExcl * 0.30) + (cRhet * 0.25) + (cOneWord * 0.20) + (cRegister * 0.25);
  // ציון סופי סביב 0.5: בסיס ניטרלי + הפרש (פורמלי פחות דיבורי), מוגבל ל-0..1.
  const formalityScore = clamp(0.5 + (formalUp - casualUp) * 0.5, 0, 1);

  let tonePreference;
  if (formalityScore >= 0.8) tonePreference = 'very_formal';
  else if (formalityScore >= 0.6) tonePreference = 'formal';
  else if (formalityScore >= 0.4) tonePreference = 'balanced';
  else if (formalityScore >= 0.2) tonePreference = 'casual';
  else tonePreference = 'very_casual';

  // אמינות הטון: זו היוריסטיקה גסה (לא מדידה ישירה של העדפת המשתמש) → 'medium' כברירת מחדל.
  // 'low' כשהראיות דלילות (docCount<2) או כשהאותות סותרים (גם פורמלי וגם דיבורי חזקים).
  const conflicting = formalUp > 0.45 && casualUp > 0.45;
  const tonePreferenceConfidence = (docCount < 2 || conflicting) ? 'low' : 'medium';

  // --- exemplars: עד 3 משפטים אמיתיים מתוך ה-chunks (best-effort; לעולם לא שובר). ---
  let exemplars = [];
  try {
    const chunks = getChunks();
    const picked = selectExemplarSentences(chunks, {
      mean: avgSentenceWords,
      std: toNum(metricsSpread?.avgSentenceWords?.std, 0),
      count: 3,
    });
    exemplars = Array.isArray(picked) ? picked : [];
  } catch {
    exemplars = [];
  }

  return { lengthPreference, tonePreference, tonePreferenceConfidence, exemplars };
}

// ---------- summarizeStyleLearning ----------

/**
 * ממפה את פלט getStyleOverview() למודל-תצוגה רזה למסכי ה-onboarding / העלאה
 * ("מה למדתי עליך"). טהורה לחלוטין — בלי imports נוספים, בלי side-effects,
 * סובלנית לכל קלט (null/זבל → ברירות-מחדל בטוחות).
 * @param {object} overview  תוצר getStyleOverview(): { stats, metrics, confidence, qualitativePatterns, extractionMeta, ... }
 * @param {{hasLlmProvider?:boolean}} [opts]  hasLlmProvider — האם קיים ספק LLM זמין לחילוץ עמוק
 * @returns {{ready:boolean, docCount:number, wordCount:number, chunkCount:number, signatureCount:number, patternCount:number, confidenceLevel:string, confidenceScore:number, localLayerDone:boolean, deepLayerPending:boolean, deepLayerNotRun:boolean, deepLayerFailed:boolean, docsButNoText:boolean, writeError:(string|null)}}
 */
export function summarizeStyleLearning(overview = {}, { hasLlmProvider = false } = {}) {
  const ov = isPlainObject(overview) ? overview : {};
  const stats = isPlainObject(ov.stats) ? ov.stats : {};
  const conf = isPlainObject(ov.confidence) ? ov.confidence : {};
  const patterns = Array.isArray(ov.qualitativePatterns) ? ov.qualitativePatterns : [];
  const extractionMeta = isPlainObject(ov.extractionMeta) ? ov.extractionMeta : {};

  const docCount = Math.max(0, Math.round(toNum(stats.docCount, 0)));
  const wordCount = Math.max(0, Math.round(toNum(stats.totalWords, 0)));
  const chunkCount = Math.max(0, Math.round(toNum(stats.chunkCount, 0)));
  const patternCount = patterns.length;
  // ביטויי-חתימה = דפוסים מסוג signature_phrase (ביטוי חוזר) או structure (נוסחה מבנית).
  const signatureCount = patterns.filter(
    (p) => isPlainObject(p) && (p.type === 'signature_phrase' || p.type === 'structure'),
  ).length;

  const confidenceLevel = ['low', 'medium', 'high'].includes(conf.level) ? conf.level : 'low';
  const confidenceScore = clamp(Math.round(toNum(conf.score, 0)), 0, 100);

  // השכבה המקומית (מדדים חינמיים) "בשלה" ברגע שיש מסמכים עם מילים — לא דורשת LLM.
  const ready = docCount > 0 && wordCount > 0;
  const localLayerDone = ready;

  // "דפוסים עמוקים" = חילוץ איכותני דרך LLM (extractionMeta.batches>0).
  const deepExtractionRan = toNum(extractionMeta.batches, 0) > 0;
  // ניסיון חילוץ עמוק כבר רץ אך כל הבאטצ'ים נכשלו: extractionMeta.at קיים ו-llmBatchesFailed>0,
  // אבל batches נשאר 0. מבחינים בזה מ"טרם רץ" כדי לא להבטיח לשווא שהדפוסים "יופקו ברקע".
  const deepLayerFailed = ready && !deepExtractionRan &&
    toNum(extractionMeta.at, 0) > 0 && toNum(extractionMeta.llmBatchesFailed, 0) > 0;
  // אין ספק LLM זמין וטרם רץ חילוץ — השכבה העמוקה ממתינה לחיבור מפתח AI.
  const deepLayerPending = ready && !hasLlmProvider && !deepExtractionRan && !deepLayerFailed;
  // יש ספק LLM זמין אך חילוץ עמוק מעולם לא רץ (ולא נכשל) — יופק אוטומטית ברקע (עקבי עם
  // ה-auto-run ב-styleIngestService שמאזין ל-wordai-provider-config-changed).
  const deepLayerNotRun = ready && hasLlmProvider && !deepExtractionRan && !deepLayerFailed;
  // נקלטו מסמכים אך לא חולץ מהם טקסט (docCount>0 אבל wordCount=0) — מצב שונה מ"לא הועלה כלום".
  const docsButNoText = docCount > 0 && wordCount <= 0;

  const writeError = stats.lastWriteError ? String(stats.lastWriteError) : null;

  return {
    ready,
    docCount,
    wordCount,
    chunkCount,
    signatureCount,
    patternCount,
    confidenceLevel,
    confidenceScore,
    localLayerDone,
    deepLayerPending,
    deepLayerNotRun,
    deepLayerFailed,
    docsButNoText,
    writeError,
  };
}

// ---------- buildStyleWritingReport ----------

/**
 * מסמך תיאורי בעברית: "ככה אתה כותב" + הצעות לשיפור — נגזר כולו ממדדים/דפוסים מקומיים
 * (בלי קריאת LLM, זמין תמיד וזול). משמש במסך "חידוד הסגנון" באונבורדינג (שלב 11) במקום
 * להציג שוב את טפסי ההעלאה שכבר מולאו בשלב 4. טהורה וסובלנית לקלט חלקי/ריק.
 * @param {object} overview  תוצר getStyleOverview()
 * @returns {{description: string[], suggestions: string[]}}
 */
export function buildStyleWritingReport(overview = {}) {
  const ov = isPlainObject(overview) ? overview : {};
  const stats = isPlainObject(ov.stats) ? ov.stats : {};
  const metrics = isPlainObject(ov.metrics) ? ov.metrics : null;
  const patterns = Array.isArray(ov.qualitativePatterns) ? ov.qualitativePatterns : [];
  const negativeSpace = Array.isArray(ov.negativeSpace) ? ov.negativeSpace : [];
  const conf = isPlainObject(ov.confidence) ? ov.confidence : {};

  const docCount = toNum(stats.docCount, 0);
  if (docCount <= 0) {
    return {
      description: ['עדיין אין מספיק חומר כדי לתאר את הכתיבה שלך.'],
      suggestions: ['העלה כמה עבודות שכתבת כדי לקבל תיאור וסגנון מדויקים.'],
    };
  }

  const description = [];
  const suggestions = [];

  if (metrics) {
    const avgSentence = toNum(metrics.avgSentenceWords, 0);
    if (avgSentence >= 18) description.push(`אתה נוטה לכתוב משפטים ארוכים ומורכבים — בממוצע כ-${Math.round(avgSentence)} מילים למשפט.`);
    else if (avgSentence > 0 && avgSentence <= 11) description.push(`אתה נוטה לכתוב משפטים קצרים וממוקדים — בממוצע כ-${Math.round(avgSentence)} מילים למשפט.`);
    else if (avgSentence > 0) description.push(`אורך המשפטים שלך מאוזן — בממוצע כ-${Math.round(avgSentence)} מילים למשפט.`);

    const cv = toNum(metrics.sentenceLengthCV, 0);
    if (avgSentence > 0 && cv > 0 && cv < 0.25) {
      suggestions.push('אורך המשפטים שלך אחיד יחסית — לשקול לערבב משפטים קצרים וארוכים כדי לשפר את הקצב והזרימה.');
    }

    const commas = toNum(metrics.avgCommasPerSentence, 0);
    if (commas >= 2) description.push('אתה משתמש הרבה בפסיקים ובמשפטים מרובי-סעיפים.');

    const parens = toNum(metrics.parenthesesDensity, 0);
    if (parens >= 1.5) description.push('יש לך נטייה בולטת להוסיף הערות אגביות בסוגריים.');

    const connectors = Object.keys(metrics.connectorFrequency || {}).slice(0, 4);
    if (connectors.length) description.push(`מילות הקישור הבולטות אצלך: ${connectors.join(', ')}.`);
    else suggestions.push('לא זוהו מילות קישור בולטות אצלך — גיוון במחברים (לעומת זאת, יתרה מזו, בהתאם) יכול לחזק את הזרימה בין רעיונות.');
  }

  const signaturePatterns = patterns.filter((p) => isPlainObject(p) && p.type === 'signature_phrase').slice(0, 3);
  if (signaturePatterns.length) {
    description.push(`ביטויי חתימה שחוזרים אצלך: ${signaturePatterns.map((p) => `"${p.label}"`).join(', ')}.`);
  }

  patterns
    .filter((p) => isPlainObject(p) && p.type === 'structure')
    .slice(0, 2)
    .forEach((p) => { if (p.label) description.push(String(p.label)); });

  if (negativeSpace.length) {
    const items = negativeSpace.slice(0, 3).map((item) => (typeof item === 'string' ? item : item?.label || '')).filter(Boolean);
    if (items.length) description.push(`דברים שאתה כמעט אף פעם לא עושה: ${items.join(', ')}.`);
  }

  const confLevel = ['low', 'medium', 'high'].includes(conf.level) ? conf.level : 'low';
  if (confLevel === 'low') {
    suggestions.push('עדיין מעט חומר לפרופיל מדויק — כל עבודה נוספת שתעלה תחדד את הדיוק.');
  } else if (patterns.length < 4) {
    suggestions.push('עוד לא זוהו הרבה דפוסים ייחודיים — עבודות נוספות עשויות לחשוף עוד הרגלי כתיבה שלך.');
  }

  if (!description.length) description.push('עדיין אין מספיק נתונים לתיאור מפורט — ככל שתעלה עוד חומר, התיאור יתעדכן.');
  if (!suggestions.length) suggestions.push('הפרופיל שלך נראה מגובש. אפשר תמיד לחדד אותו עוד דרך העלאת עבודות נוספות או הערות ידניות.');

  return { description, suggestions };
}

// ---------- normalizeStyleEngine ----------

const DEFAULT_CONFIDENCE = () => ({ score: 0, docCount: 0, wordCount: 0, level: 'low' });
const DEFAULT_SPREAD = () => Object.fromEntries(
  SPREAD_METRIC_KEYS.map((k) => [k, { std: 0, cv: 0 }]),
);
const DEFAULT_BLACKLIST = () => ({ auto: [], user: [], removed: [] });
const DEFAULT_EDIT_COUNTERS = () => ({
  shortenedSentence: 0,
  removedConnector: 0,
  replacedWord: {},
  replacementPairs: {},
  addedParenthetical: 0,
  commaAdded: 0,
  commaRemoved: 0,
  dashAdded: 0,
  dashRemoved: 0,
  totalEditsObserved: 0,
  editsSinceSynthesis: 0,
});

const CAP_PATTERNS = 30;
const CAP_BLACKLIST = 50;
const CAP_NEGATIVE = 12;
// A2/A5 — avoidedPhrases: מחרוזות ליטרליות שמזינות את blacklist.auto.
const CAP_AVOIDED_PHRASES = 20;
const CAP_AVOIDED_PHRASE_LEN = 80;
// A2/A6 — structuralSignature: חתימה מבנית ברמת העבודה כולה (לא ברמת המשפט).
// 5 מפתחות קבועים, כל ערך משפט קצר; מפתח לא ידוע = '' (אף פעם לא null).
const STRUCTURAL_SIGNATURE_KEYS = ['opening', 'closing', 'thesisPlacement', 'sectionFlow', 'firstPersonUsage'];
const CAP_STRUCTURAL_VALUE_LEN = 200;

const EMPTY_STRUCTURAL_SIGNATURE = () => ({
  opening: '',
  closing: '',
  thesisPlacement: '',
  sectionFlow: '',
  firstPersonUsage: '',
});

/**
 * מנרמל structuralSignature לאובייקט בעל בדיוק 5 המפתחות הידועים, כל ערך מחרוזת
 * מקוצצת ל-200 תווים. קלט לא-תקין/חסר → כל הערכים ''. לעולם לא מחזיר null.
 * @param {any} raw
 * @returns {{opening:string, closing:string, thesisPlacement:string, sectionFlow:string, firstPersonUsage:string}}
 */
const normalizeStructuralSignature = (raw) => {
  const src = isPlainObject(raw) ? raw : {};
  const out = EMPTY_STRUCTURAL_SIGNATURE();
  STRUCTURAL_SIGNATURE_KEYS.forEach((k) => {
    const v = src[k];
    if (typeof v !== 'string' && typeof v !== 'number') return;
    out[k] = String(v).trim().slice(0, CAP_STRUCTURAL_VALUE_LEN);
  });
  return out;
};

const cleanStringArray = (arr, cap) => {
  if (!Array.isArray(arr)) return [];
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    const s = String(item || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= cap) break;
  }
  return out;
};

const normalizePattern = (raw) => {
  if (!isPlainObject(raw)) return null;
  const label = String(raw.label || '').trim();
  if (!label) return null;
  const evidence = String(raw.evidence || '').trim().slice(0, 140);
  return {
    id: String(raw.id || '').trim() || `pat_${Math.random().toString(36).slice(2, 9)}`,
    label,
    type: String(raw.type || 'lexical_habit').trim() || 'lexical_habit',
    weight: clamp(toNum(raw.weight, 0.5), 0, 1),
    ...(evidence ? { evidence } : {}),
    ...(Number.isFinite(Number(raw.frequencyPer100Words)) ? { frequencyPer100Words: round(toNum(raw.frequencyPer100Words), 3) } : {}),
    ...(Number.isFinite(Number(raw.docFraction)) ? { docFraction: round(toNum(raw.docFraction), 3) } : {}),
    ...(Number.isFinite(Number(raw.evidenceCount)) ? { evidenceCount: toNum(raw.evidenceCount) } : {}),
    // E6 — patterns מ-mineSignatureNgrams/mineStructuralFormulas: deterministic ground
    // truth שחייב לשרוד את ה-cap (ראו mergeQualitativePatterns). דגל מפורש כי לא כל
    // הדפוסים הממוינים ניתנים לזיהוי לפי frequencyPer100Words (מבניים לא נושאים אותו).
    ...(raw.mined === true ? { mined: true } : {}),
    // קיורציה — המשתמש יכול לנעוץ (pin) דפוס: תמיד שורד את ה-cap ומקבל boost בבחירה.
    pinned: !!raw.pinned,
    userAdjustedAt: Number.isFinite(Number(raw.userAdjustedAt)) ? toNum(raw.userAdjustedAt) : 0,
  };
};

// היסטוריית איכות מתגלגלת (feedback-loop): רשומות { score, at, genre? } של ציוני
// scoreStyleForDocument על פלט שנוצר. cap 20, שומר את האחרונות. מסנן לא-תקינים,
// clamp ל-0-100. משפיע על recomputeConfidence דרך qualityAdjustment.
const CAP_QUALITY_HISTORY = 20;
const normalizeQualityHistory = (arr) => {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const item of arr) {
    if (!isPlainObject(item)) continue;
    if (!Number.isFinite(Number(item.score))) continue;
    const entry = {
      score: clamp(Math.round(toNum(item.score, 0)), 0, 100),
      at: Math.max(0, Math.round(toNum(item.at, 0))),
    };
    const genre = String(item.genre || '').trim();
    if (genre) entry.genre = genre;
    out.push(entry);
  }
  // שומר את האחרונות (cap 20).
  return out.slice(-CAP_QUALITY_HISTORY);
};

// הערות רוויזיה שהמשתמש כתב בחופשי ("קצר מדי", "יותר משפטי") — { text≤200, at }.
// אין סינתזה אוטומטית מהן (החלטה מכוונת: 1-2 דגימות מטות פרופיל). cap 12, שומר את האחרונות.
const CAP_REVISION_FEEDBACK = 12;
const normalizeRevisionFeedbackNotes = (arr) => {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const item of arr) {
    if (!isPlainObject(item)) continue;
    const text = String(item.text || '').trim().slice(0, 200);
    if (!text) continue;
    out.push({ text, at: Math.max(0, Math.round(toNum(item.at, 0))) });
  }
  return out.slice(-CAP_REVISION_FEEDBACK);
};

/**
 * מנרמל אובייקט styleEngine גולמי לסכמה המלאה (5a) עם ברירות מחדל בטוחות.
 * סובלני לכל קלט (null/זבל → defaults).
 * @param {any} raw
 * @returns {object}
 */
export function normalizeStyleEngine(raw) {
  const src = isPlainObject(raw) ? raw : {};

  const confSrc = isPlainObject(src.confidence) ? src.confidence : {};
  const confidence = {
    score: clamp(Math.round(toNum(confSrc.score, 0)), 0, 100),
    docCount: Math.max(0, Math.round(toNum(confSrc.docCount, 0))),
    wordCount: Math.max(0, Math.round(toNum(confSrc.wordCount, 0))),
    level: ['low', 'medium', 'high'].includes(confSrc.level) ? confSrc.level : 'low',
    crossValidated: confSrc.crossValidated === true,
    patternCount: Math.max(0, Math.round(toNum(confSrc.patternCount, 0))),
  };

  const spreadSrc = isPlainObject(src.metricsSpread) ? src.metricsSpread : {};
  const metricsSpread = DEFAULT_SPREAD();
  SPREAD_METRIC_KEYS.forEach((k) => {
    if (isPlainObject(spreadSrc[k])) {
      metricsSpread[k] = {
        std: round(toNum(spreadSrc[k].std, 0), 3),
        cv: round(toNum(spreadSrc[k].cv, 0), 3),
      };
    }
  });

  const blSrc = isPlainObject(src.blacklist) ? src.blacklist : {};
  const blacklist = {
    auto: cleanStringArray(blSrc.auto, CAP_BLACKLIST),
    user: cleanStringArray(blSrc.user, CAP_BLACKLIST),
    removed: cleanStringArray(blSrc.removed, CAP_BLACKLIST),
  };

  const ecSrc = isPlainObject(src.editCounters) ? src.editCounters : {};
  const editCounters = {
    shortenedSentence: Math.max(0, Math.round(toNum(ecSrc.shortenedSentence, 0))),
    removedConnector: Math.max(0, Math.round(toNum(ecSrc.removedConnector, 0))),
    replacedWord: isPlainObject(ecSrc.replacedWord)
      ? Object.fromEntries(
          Object.entries(ecSrc.replacedWord)
            .filter(([k]) => String(k || '').trim())
            .map(([k, v]) => [String(k).trim(), Math.max(0, Math.round(toNum(v, 0)))]),
        )
      : {},
    // מפתח = המילה שהוסרה, ערך = { reps: { מילה-חלופית: מונה } } — ראה styleDeltaService.
    replacementPairs: isPlainObject(ecSrc.replacementPairs)
      ? Object.fromEntries(
          Object.entries(ecSrc.replacementPairs)
            .filter(([k, v]) => String(k || '').trim() && isPlainObject(v))
            .slice(0, 40)
            .map(([k, v]) => [
              String(k).trim(),
              {
                reps: isPlainObject(v.reps)
                  ? Object.fromEntries(
                      Object.entries(v.reps)
                        .filter(([rk]) => String(rk || '').trim())
                        .slice(0, 10)
                        .map(([rk, rv]) => [String(rk).trim(), Math.max(0, Math.round(toNum(rv, 0)))]),
                    )
                  : {},
              },
            ]),
        )
      : {},
    addedParenthetical: Math.max(0, Math.round(toNum(ecSrc.addedParenthetical, 0))),
    commaAdded: Math.max(0, Math.round(toNum(ecSrc.commaAdded, 0))),
    commaRemoved: Math.max(0, Math.round(toNum(ecSrc.commaRemoved, 0))),
    dashAdded: Math.max(0, Math.round(toNum(ecSrc.dashAdded, 0))),
    dashRemoved: Math.max(0, Math.round(toNum(ecSrc.dashRemoved, 0))),
    totalEditsObserved: Math.max(0, Math.round(toNum(ecSrc.totalEditsObserved, 0))),
    editsSinceSynthesis: Math.max(0, Math.round(toNum(ecSrc.editsSinceSynthesis, 0))),
    // תוצאות הצעות AI (אשר/דחה/נסגר בלי הוספה) — ראה recordSuggestionOutcome ב-styleDeltaService.
    // מונים בלבד; טקסט AI שאושר לעולם אינו נכנס לקורפוס (לולאת משוב).
    aiSuggestionAccepted: Math.max(0, Math.round(toNum(ecSrc.aiSuggestionAccepted, 0))),
    aiSuggestionRejected: Math.max(0, Math.round(toNum(ecSrc.aiSuggestionRejected, 0))),
    aiSuggestionDismissed: Math.max(0, Math.round(toNum(ecSrc.aiSuggestionDismissed, 0))),
  };

  const qualitativePatterns = (Array.isArray(src.qualitativePatterns) ? src.qualitativePatterns : [])
    .map(normalizePattern)
    .filter(Boolean)
    .slice(0, CAP_PATTERNS);

  // E3 — תת-פרופילי ז'אנר: { [genre]: { metrics, metricsSpread, docCount } }. סובלני,
  // מוגבל לטקסונומיה הידועה (חוץ מ'אחר'), cap MAX_GENRE_PROFILES.
  const genreProfiles = {};
  if (isPlainObject(src.genreProfiles)) {
    let kept = 0;
    for (const [g, gpRaw] of Object.entries(src.genreProfiles)) {
      if (kept >= MAX_GENRE_PROFILES) break;
      const gName = String(g || '').trim();
      if (!GENRE_SET.has(gName) || gName === 'אחר') continue;
      if (!isPlainObject(gpRaw)) continue;
      const gpSpreadSrc = isPlainObject(gpRaw.metricsSpread) ? gpRaw.metricsSpread : {};
      const gpSpread = DEFAULT_SPREAD();
      SPREAD_METRIC_KEYS.forEach((k) => {
        if (isPlainObject(gpSpreadSrc[k])) {
          gpSpread[k] = {
            std: round(toNum(gpSpreadSrc[k].std, 0), 3),
            cv: round(toNum(gpSpreadSrc[k].cv, 0), 3),
          };
        }
      });
      genreProfiles[gName] = {
        metrics: isPlainObject(gpRaw.metrics) ? gpRaw.metrics : null,
        metricsSpread: gpSpread,
        docCount: Math.max(0, Math.round(toNum(gpRaw.docCount, 0))),
      };
      kept += 1;
    }
  }

  return {
    schemaVersion: STYLE_ENGINE_SCHEMA_VERSION,
    enabled: src.enabled === undefined ? true : src.enabled !== false,
    confidence,
    metrics: isPlainObject(src.metrics) ? src.metrics : null,
    metricsSpread,
    genreProfiles,
    qualitativePatterns,
    negativeSpace: cleanStringArray(src.negativeSpace, CAP_NEGATIVE),
    // A6 — חתימה מבנית ברמת העבודה (איך פותח/מסיים/ממקם תזה/משרשר סעיפים/גוף ראשון).
    // ברירת מחדל: 5 מפתחות עם '' — לא null, כדי שקוראים לא יצטרכו שומרים. הנרמול
    // הזה מפיל שדות לא-מוכרים, ולכן בלי הכניסה הזו השדה היה נמחק בכל round-trip.
    // avoidedPhrases *לא* יושב כאן במכוון — הוא מוזן לתוך blacklist.auto.
    structuralSignature: normalizeStructuralSignature(src.structuralSignature),
    // קיורציה — מפתחות קנוניים של דפוסים שהמשתמש דחה ("לא אני"): מסוננים מרכזית
    // ב-runQualitativeAnalysis כדי לשרוד ניתוח מחדש. cap 60.
    rejectedPatternKeys: cleanStringArray(src.rejectedPatternKeys, 60),
    blacklist,
    editCounters,
    goldChunkRefs: cleanStringArray(src.goldChunkRefs, 100),
    lastAnalysisAt: Math.max(0, Math.round(toNum(src.lastAnalysisAt, 0))),
    lastSynthesisAt: Math.max(0, Math.round(toNum(src.lastSynthesisAt, 0))),
    // E4: מיגרציה חד-פעמית מהפרופיל הישן (goldenExample/preferredTrainingExamples) לתוך
    // ה-sample store; ומונה מסמכים "כשירים למדדים" (aggregateDocumentMetrics), נפרד מ-
    // confidence.docCount שסופר את כל המסמכים שהועלו (ראו recomputeMetricsFromStore).
    legacyMigratedAt: Math.max(0, Math.round(toNum(src.legacyMigratedAt, 0))),
    metricsEligibleDocCount: Math.max(0, Math.round(toNum(src.metricsEligibleDocCount, 0))),
    // שכבת embeddings סמנטית מקומית (טרום-API): מזהי ה-chunks המייצגים (מרכז+MMR)
    // ומטא על מצב הוקטורים. representativeChunkIds cap 24. embeddingMeta additive.
    representativeChunkIds: cleanStringArray(src.representativeChunkIds, 24),
    // feedback-loop: היסטוריית איכות פלט מתגלגלת (cap 20). default [] סופג ישנים
    // ללא bump ל-schemaVersion. משפיע על confidence דרך qualityAdjustment.
    qualityHistory: normalizeQualityHistory(src.qualityHistory),
    // משוב חופשי מרוויזיות ("תקצר", "יותר פורמלי") — תיעוד בלבד, cap 12. ראה recordRevisionFeedback.
    revisionFeedbackNotes: normalizeRevisionFeedbackNotes(src.revisionFeedbackNotes),
    embeddingMeta: isPlainObject(src.embeddingMeta)
      ? {
          available: src.embeddingMeta.available === true,
          model: String(src.embeddingMeta.model || ''),
          dim: Math.max(0, Math.round(toNum(src.embeddingMeta.dim, 0))),
          count: Math.max(0, Math.round(toNum(src.embeddingMeta.count, 0))),
          coverage: Math.max(0, Math.min(1, toNum(src.embeddingMeta.coverage, 0))),
          reason: String(src.embeddingMeta.reason || ''),
          at: Math.max(0, Math.round(toNum(src.embeddingMeta.at, 0))),
        }
      : {},
    // ⚠️ רשימת-היתר: מפתח שלא רשום כאן נמחק בכל שמירה (saveEngine מנרמל לפני persist).
    // externalBatches/structuralKeysLearned/avoidedPhrasesAdded נכתבו ב-finishQualitativeMerge
    // ולא שרדו — כל מפתח extractionMeta חדש חייב להתווסף גם כאן.
    extractionMeta: isPlainObject(src.extractionMeta)
      ? {
          batches: Math.max(0, Math.round(toNum(src.extractionMeta.batches, 0))),
          crossValidated: src.extractionMeta.crossValidated === true,
          minedSignatures: Math.max(0, Math.round(toNum(src.extractionMeta.minedSignatures, 0))),
          at: Math.max(0, Math.round(toNum(src.extractionMeta.at, 0))),
          llmBatchesFailed: Math.max(0, Math.round(toNum(src.extractionMeta.llmBatchesFailed, 0))),
          genreClassificationFailed: src.extractionMeta.genreClassificationFailed === true,
          externalBatches: Math.max(0, Math.round(toNum(src.extractionMeta.externalBatches, 0))),
          structuralKeysLearned: Math.max(0, Math.min(5, Math.round(toNum(src.extractionMeta.structuralKeysLearned, 0)))),
          avoidedPhrasesAdded: Math.max(0, Math.round(toNum(src.extractionMeta.avoidedPhrasesAdded, 0))),
          // כמה ביטויים נדחו מהרשימה השחורה כי הקורפוס מראה שהכותב דווקא משתמש בהם.
          avoidedPhrasesRejected: Math.max(0, Math.round(toNum(src.extractionMeta.avoidedPhrasesRejected, 0))),
        }
      : {},
  };
}

// ---------- recomputeConfidence ----------

// יעדי כיסוי לחישוב הוודאות. WORD_TARGET הוא "מספיק חומר כדי לחקות סגנון" —
// ~60k מילים ≈ 12-15 עבודות. הועלה מהנוסחה הישנה שהתמקדה במספר המסמכים בלבד
// (בה docCount*8 הגיע לתקרה כבר ב-7.5 מסמכים והציון נתקע גם עם קורפוס גדול).
const CONFIDENCE_WORD_TARGET = 60000;
const CONFIDENCE_DOC_TARGET = 10;
const CONFIDENCE_PATTERN_TARGET = 12;

/**
 * התאמת feedback-loop: ממפה ממוצע ציוני איכות הפלט האחרונים ל-[-8,+8]. ציון גבוה
 * (פלט "נשמע כמוך") → בונוס; נמוך → קנס. עוגן ~70. פחות מ-5 רשומות → 0 (תאימות
 * לאחור, לא מזיז את הוודאות של פרופילים קיימים).
 * @param {Array<{score:number}>} qualityHistory
 * @returns {number} מספר שלם ב-[-8,+8]
 */
function qualityAdjustment(qualityHistory) {
  if (!Array.isArray(qualityHistory) || qualityHistory.length < 5) return 0;
  const recent = qualityHistory
    .slice(-10)
    .map((e) => toNum(e?.score, NaN))
    .filter((v) => Number.isFinite(v));
  if (recent.length < 5) return 0;
  const avg = mean(recent);
  // לינארי סביב עוגן 70: avg≥80 → +8, avg≤50 → -8. שיפוע 8/10 ליחידת ציון מעל/מתחת ל-70.
  const raw = (avg - 70) * (8 / 10);
  return Math.round(clamp(raw, -8, 8));
}

/**
 * מחשב ודאות פרופיל 0-100 מכיסוי הקורפוס (מילים + מסמכים), עושר הדפוסים שחולצו
 * ויציבות המדדים. level נגזר מהציון ומהכיסוי בפועל — לא ממספר מסמכים בלבד.
 * @param {object} styleEngine
 * @returns {{score:number, docCount:number, wordCount:number, level:string, crossValidated:boolean, patternCount:number}}
 */
export function recomputeConfidence(styleEngine) {
  const se = isPlainObject(styleEngine) ? styleEngine : {};
  const conf = isPlainObject(se.confidence) ? se.confidence : {};
  const docCount = Math.max(0, Math.round(toNum(conf.docCount, 0)));
  const wordCount = Math.max(0, Math.round(toNum(conf.wordCount, 0)));
  const patternCount = Array.isArray(se.qualitativePatterns) ? se.qualitativePatterns.length : 0;

  // כיסוי טקסטואלי — המרכיב הכבד: כמה מילים אמיתיות שלך יש במאגר.
  const wordPart = clamp(wordCount / CONFIDENCE_WORD_TARGET, 0, 1) * 40;
  // גיוון מקורות — מסמכים שונים מלמדים יותר מאותו אורך בטקסט אחד.
  const docPart = clamp(docCount / CONFIDENCE_DOC_TARGET, 0, 1) * 30;
  // עושר דפוסים — כמה סימני סגנון ניתן היה לחלץ בפועל.
  const patternPart = clamp(patternCount / CONFIDENCE_PATTERN_TARGET, 0, 1) * 10;

  // בונוס יציבות: CV נמוך של המדדים בין מסמכים → יותר. עד 15.
  const spread = isPlainObject(se.metricsSpread) ? se.metricsSpread : {};
  const cvs = ['avgSentenceWords', 'sentenceLengthCV', 'avgParagraphWords']
    .map((k) => toNum(spread[k]?.cv, NaN))
    .filter((v) => Number.isFinite(v));
  let stabilityBonus = 0;
  if (docCount >= 2 && cvs.length) {
    const avgCv = mean(cvs);
    // CV 0 → בונוס מלא (15); CV ≥0.8 → 0. הסף הורחב מ-0.5: קורפוס מרובה ז'אנרים
    // (סמינר + מאמר + מכתב) פיזור גבוה מטבעו, וזה לא אמור לאפס את הוודאות.
    stabilityBonus = clamp((0.8 - avgCv) / 0.8, 0, 1) * 15;
  }

  // בונוס יציבות חילוץ: אם הדפוסים אומתו בין באטצ'ים (consensus) — +5.
  const em = isPlainObject(se.extractionMeta) ? se.extractionMeta : {};
  const crossValidatedBonus = em.crossValidated === true ? 5 : 0;

  const baseScore = Math.round(wordPart + docPart + patternPart + stabilityBonus + crossValidatedBonus);
  // התאמת feedback-loop לפי איכות הפלט שנוצר בפועל (אפס השפעה עד 5 רשומות).
  const score = clamp(baseScore + qualityAdjustment(se.qualityHistory), 0, 100);

  // level לפי כיסוי אמיתי: 'high' דורש גם ציון וגם מסה קריטית של טקסט.
  let level = 'low';
  if (score >= 70 && docCount >= 6 && wordCount >= 25000) level = 'high';
  else if (score >= 35 || (docCount >= 3 && wordCount >= 4000)) level = 'medium';

  return { score, docCount, wordCount, level, crossValidated: em.crossValidated === true, patternCount };
}

// ---------- seedStyleEngineFromLegacyProfile ----------

/**
 * גוזר styleEngine חלקי מהפרופיל הישן wordai_personal_style.
 * מחזיר null אם אין נתונים נלמדים.
 * @param {object} profile
 * @returns {object|null}
 */
export function seedStyleEngineFromLegacyProfile(profile) {
  if (!isPlainObject(profile)) return null;

  const fp = isPlainObject(profile.styleFingerprint) ? profile.styleFingerprint : {};
  const learnedPhrases = Array.isArray(profile.learnedPhrases) ? profile.learnedPhrases : [];
  const preferredConnectors = Array.isArray(profile.preferredConnectors) ? profile.preferredConnectors : [];
  const preferredOpeners = Array.isArray(profile.preferredSentenceOpeners) ? profile.preferredSentenceOpeners : [];
  const learnedVocabulary = Array.isArray(profile.learnedVocabulary) ? profile.learnedVocabulary : [];

  const hasFingerprint = toNum(fp.avgSentenceWords) > 0 || toNum(fp.avgParagraphWords) > 0;
  const hasLearned = learnedPhrases.length > 0 || preferredConnectors.length > 0
    || preferredOpeners.length > 0 || learnedVocabulary.length > 0;

  if (!hasFingerprint && !hasLearned) return null;

  // מדדים — רק avgSentenceWords/avgParagraphWords ידועים מ-fingerprint; השאר null.
  let metrics = null;
  if (hasFingerprint) {
    metrics = {
      wordCount: null,
      sentenceCount: toNum(fp.sentenceCount) || null,
      paragraphCount: toNum(fp.paragraphCount) || null,
      avgSentenceWords: toNum(fp.avgSentenceWords) || null,
      sentenceLengthStd: null,
      sentenceLengthCV: null,
      pctShortSentences: null,
      pctLongSentences: null,
      avgCommasPerSentence: null,
      parenthesesDensity: null,
      punctuationDensity: null,
      connectorFrequency: null,
      typeTokenRatio: null,
      openerRepetitionRate: null,
      avgParagraphWords: toNum(fp.avgParagraphWords) || null,
      rhetoricalQuestionRate: null,
      exclamationRate: null,
      oneWordSentenceRate: null,
      registerShiftRate: null,
      sampledAt: nowTs(),
    };
  }

  const qualitativePatterns = [];
  cleanStringArray(learnedPhrases, 8).forEach((phrase, i) => {
    qualitativePatterns.push({
      id: `seed_phrase_${i + 1}`,
      label: `ביטוי אופייני: "${phrase}"`,
      type: 'signature_phrase',
      weight: 0.5,
    });
  });

  const seedConnectors = cleanStringArray(preferredConnectors, 5);
  if (seedConnectors.length) {
    qualitativePatterns.push({
      id: 'seed_connectors',
      label: `מילות קישור מועדפות: ${seedConnectors.join(', ')}`,
      type: 'lexical_habit',
      weight: 0.6,
    });
  }

  const seeded = normalizeStyleEngine({
    metrics,
    qualitativePatterns,
    confidence: { score: 0, docCount: 0, wordCount: 0, level: 'low' },
    lastAnalysisAt: nowTs(),
  });

  return seeded;
}

// ---------- selectRotatedPatterns ----------

// PRNG דטרמיניסטי (mulberry32).
const mulberry32 = (seed) => {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * בחירת תת-קבוצת דפוסים ברוטציה דטרמיניסטית משוקללת לפי weight.
 * תמיד כולל את ה-signature_phrase בעל ה-weight הגבוה ביותר (אם קיים).
 * @param {Array<object>} patterns
 * @param {{count?:number, seed?:number}} opts
 * @returns {Array<object>}
 */
export function selectRotatedPatterns(patterns, { count = 5, seed = 0 } = {}) {
  // קיורציה — דפוס נעוץ (pinned) מקבל משקל אפקטיבי מוגבר min(0.95, weight*1.2) לצורך
  // מיון/רולטה, ותמיד נכנס ראשון (לפני ה-signature_phrase הכפוי והרולטה).
  const pool = (Array.isArray(patterns) ? patterns : [])
    .filter(isPlainObject)
    .map((p) => {
      const w = clamp(toNum(p.weight, 0.5), 0, 1);
      return { ...p, weight: p.pinned ? Math.min(0.95, w * 1.2) : w };
    });
  if (!pool.length || count <= 0) return [];

  const sorted = [...pool].sort((a, b) => b.weight - a.weight);
  const selected = [];
  const used = new Set();

  // תמיד ראשונים: דפוסים נעוצים (לפי משקל אפקטיבי יורד), עם dedupe וחיתוך ל-count.
  for (const p of sorted) {
    if (selected.length >= count) break;
    if (p.pinned && !used.has(p)) {
      selected.push(p);
      used.add(p);
    }
  }

  // תמיד: signature_phrase החזק ביותר.
  const topSig = sorted.find((p) => p.type === 'signature_phrase' && !used.has(p));
  if (topSig && selected.length < count) {
    selected.push(topSig);
    used.add(topSig);
  }

  // מילוי היתר: seeded weighted sampling (roulette) בלי חזרות.
  const rand = mulberry32(Math.floor(toNum(seed, 0)));
  const candidates = sorted.filter((p) => !used.has(p));
  while (selected.length < count && candidates.length) {
    const remaining = candidates.filter((p) => !used.has(p));
    if (!remaining.length) break;
    const totalWeight = remaining.reduce((s, p) => s + Math.max(p.weight, 0.01), 0);
    let pick = rand() * totalWeight;
    let chosen = remaining[remaining.length - 1];
    for (const p of remaining) {
      pick -= Math.max(p.weight, 0.01);
      if (pick <= 0) { chosen = p; break; }
    }
    selected.push(chosen);
    used.add(chosen);
  }

  return selected.slice(0, count);
}

// ---------- computeConnectorContrasts ----------

// קבוצות מילים נרדפות (קישור) — בכל קבוצה בוחרים את החזק בבירור ומנגידים לשאר.
const CONNECTOR_CONTRAST_GROUPS = [
  ['עם זאת', 'אולם', 'אך', 'ברם'],
  ['בנוסף', 'כמו כן', 'יתר על כן', 'זאת ועוד'],
  ['לכן', 'לפיכך', 'משום כך', 'על כן'],
  ['כלומר', 'דהיינו', 'רוצה לומר'],
];

/**
 * מזהה בחירות-קישור דומיננטיות: מתוך כל קבוצת נרדפים, אם המוביל דומיננטי בבירור
 * (פי 2 מהמתחרה השני, או שהוא היחיד עם freq>0.1) — מחזיר ניגוד {prefer, over, ratio}.
 * @param {object} metrics  metrics.connectorFrequency (מ-computeLocalMetrics/aggregateDocumentMetrics)
 * @returns {Array<{prefer:string, over:string[], ratio:number|null}>}
 */
export function computeConnectorContrasts(metrics) {
  const freq = isPlainObject(metrics) && isPlainObject(metrics.connectorFrequency)
    ? metrics.connectorFrequency
    : {};
  const contrasts = [];
  CONNECTOR_CONTRAST_GROUPS.forEach((group) => {
    const present = group
      .map((w) => ({ w, f: toNum(freq[w], 0) }))
      .filter((x) => x.f > 0)
      .sort((a, b) => b.f - a.f);
    if (!present.length) return;
    const top = present[0];
    const runnerUp = present[1];
    const qualifies = runnerUp ? top.f >= 2 * runnerUp.f : top.f > 0.1;
    if (!qualifies) return;
    // "over" = רק מילות קישור שהמשתמש באמת כמעט לא כותב.
    // ⚠️ עד 10.8.26 זה כלל כל מילה בקבוצה שקיימת בלקסיקון — גם כזו שהמשתמש כותב
    // בפועל. נמדד על קורפוס אמיתי: הבלוק הורה 'העדף "בנוסף" (לא "כמו כן")' לכותב
    // שכותב "כמו כן", בדיוק כמו הרשימה השחורה שאסרה עליו את מילות הקישור שלו עצמו.
    // ⚠️ אסור להסתמך על היעדר מ-connectorFrequency: הוא חתוך ל-15 המובילים.
    // connectorsUsed הוא הרשימה המלאה, ולכן הוא זה שקובע "בשימוש" מול "לא בשימוש";
    // אם הוא חסר (פרופיל ישן) — נופלים לסף יחסי ולא מניחים אפס.
    const MINOR_CONNECTOR_RATIO = 0.25;
    const usedList = isPlainObject(metrics) && Array.isArray(metrics.connectorsUsed)
      ? metrics.connectorsUsed
      : null;
    const used = usedList ? new Set(usedList) : null;
    const over = group.filter((w) => {
      if (w === top.w || !STYLE_CONNECTORS.includes(w)) return false;
      if (used) return !used.has(w);
      return toNum(freq[w], 0) <= top.f * MINOR_CONNECTOR_RATIO;
    });
    if (!over.length) return;
    contrasts.push({
      prefer: top.w,
      over,
      ratio: runnerUp ? round(top.f / Math.max(runnerUp.f, 0.0001), 2) : null,
    });
  });
  return contrasts;
}

// ---------- classifyRequestGenre ----------

// לקסיקוני מרקרים לכל ז'אנר. הסדר = עדיפות (הספציפי ביותר קודם): נייר עמדה →
// סקירת ספרות → רפלקציה → מנהלי → אקדמי. די בהתאמה אחת כדי לקבוע ז'אנר.
const GENRE_MARKERS = [
  { genre: 'נייר עמדה', markers: ['נייר עמדה', 'עמדה', 'טיעון', 'מדיניות מוצעת', 'אני סבור'] },
  { genre: 'סקירת ספרות', markers: ['סקירת ספרות', 'סקירה', 'ספרות מחקרית', 'מחקרים קודמים'] },
  { genre: 'רפלקציה אישית', markers: ['רפלקציה', 'התנסות', 'חוויה אישית', 'יומן'] },
  { genre: 'מנהלי-מכתבי', markers: ['מכתב', 'פנייה', 'בקשה רשמית', 'לכבוד'] },
  { genre: 'אקדמי-מחקרי', markers: ['מחקר', 'אקדמי', 'עבודה סמינריונית', 'שאלת מחקר', 'פרק', 'ניתוח'] },
];

/**
 * מסווג בקשה לז'אנר לפי הוריסטיקת מילות-מפתח מקומית (בלי LLM). מחזיר שם ז'אנר מהטקסונומיה
 * או null אם אין התאמה (→ נופל לפרופיל הגלובלי). לעולם לא זורק.
 * @param {string} requestText
 * @returns {(string|null)}
 */
export function classifyRequestGenre(requestText) {
  const text = String(requestText || '');
  if (!text.trim()) return null;
  const lower = text.toLowerCase();
  for (const { genre, markers } of GENRE_MARKERS) {
    if (markers.some((m) => lower.includes(m.toLowerCase()))) return genre;
  }
  return null;
}

// ---------- buildStyleEngineInjectionBlock ----------

const roundDisplay = (value, digits = 0) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};

// A8 — סקשן החתימה המבנית בבלוק ההזרקה. תקציב קשיח כדי לא לפרוץ את ~350 המילים
// של הבלוק כולו: ~40 מילים לכל הסקשן, ~12 לערך בודד.
const STRUCTURE_SECTION_WORD_BUDGET = 40;
const STRUCTURE_VALUE_WORD_CAP = 12;
// תוויות שם-עצם (לא "פותח ב") — הערכים עצמם כבר מנוסחים כפעולה, ותווית פועל
// יוצרת כפילות מגושמת ("פותח ב: פותח בהגדרת מונח").
const STRUCTURAL_SIGNATURE_LABELS = {
  opening: 'פתיחה',
  closing: 'סיום',
  thesisPlacement: 'מיקום התזה',
  sectionFlow: 'שרשור סעיפים',
  firstPersonUsage: 'גוף ראשון',
};

const countWords = (text) => String(text || '').trim().split(/\s+/).filter(Boolean).length;

// חיתוך לפי מילים (לא תווים) — שומר על משפט קריא בעברית. 0/שלילי → ''.
const truncateWords = (text, maxWords) => {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length || maxWords <= 0) return '';
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ')}…`;
};

// ספי-רצפה ל-std בחישוב zPop של עוגני-המדד (כשאין std-קורפוס אמין לאוכלוסייה).
const METRIC_POP_STD_FLOOR = {
  avgSentenceWords: 3,
  avgCommasPerSentence: 0.6,
  parenthesesDensity: 1.0,
  avgParagraphWords: 15,
};
// סף distinctiveness: מזריקים עוגן-מדד רק כשהמשתמש חורג מהאוכלוסייה מעליו.
const POP_DISTINCTIVE_Z = 0.8;

/**
 * האם להזריק עוגן-מדד: כן אם אין נתוני-אוכלוסייה למדד (graceful), או שהמשתמש חורג
 * מהנורמה האוכלוסייתית (zPop ≥ סף). מדד "רגיל" (קרוב לאוכלוסייה) מושמט — הוא לא מלמד
 * את המודל דבר ורק מדלל את הבלוק.
 *
 * ⚠️ תוקף ההשוואה אחרי סינון הפרוזה (10.8.26) — **נבדק, והוא נשמר; השער לא שונה.**
 * נכס-הייחוס נבנה ב-tools/style-reference-build/lib.mjs, שהוא פורט של
 * computeLocalMetrics **לפני** הסינון — כלומר צד האוכלוסייה לא סונן ברמת הבלוק,
 * וצד המשתמש כן. אלא שקורפוס-הייחוס כבר מסונן ברמת ה**מסמך**: ויקיפדיה + מקורות
 * אקדמיים, בלי עמודי שער, בלי הצהרות מוסד, ועם הדחייה המפורשת של טקסט לא-פרוזאי
 * (<3 סימני סיום ל-100 מילים) ושל חילוץ מפורק (>0.25 משפטי מילה-שתיים). כלומר
 * הצד ה"מזוהם" היה צד המשתמש בלבד, והסינון מקרב את שתי ההגדרות ולא מרחיק אותן.
 * האישור המספרי: avgSentenceWords באוכלוסייה = 17.106 (std 4.07), והמשתמש עובר
 * מ-14 (z=0.76) ל-17.1 (z≈0.00) — כלומר אחרי הסינון הוא **נוחת על ממוצע
 * האוכלוסייה**, מה שלא היה קורה אילו הסינון היה מטה את המדידה. שתי ההכרעות
 * ממילא זהות (שתיהן מתחת ל-0.8 ⇒ לא מוזרק), וכך גם ב-avgParagraphWords
 * (29.97 ⇒ z=0.53 מול ~45 ⇒ z=0.22). לרענון מלא: לבנות מחדש את נכס-הייחוס אחרי
 * שהפורט ב-lib.mjs יסונכרן עם הסינון כאן.
 * @param {object} reference  נכס-הייחוס (או {}/null)
 * @param {string} key
 * @param {number} userVal
 * @param {string} genreName
 * @returns {boolean}
 */
const shouldInjectMetricAnchor = (reference, key, userVal, genreName) => {
  // F4 — גיוד anchors (סינון) מותר רק על נכס-ייחוס מקורפוס אמיתי. עם bootstrap
  // (mean/std מנוחשים) מזריקים הכל כמו לפני Phase 4 — אין סינון על נתונים מנוחשים.
  if (!isRealReference(reference)) return true;
  const dist = getReferenceDistribution(reference, key, genreName || null);
  if (!dist) return true; // אין נתוני אוכלוסייה למדד → מזריקים כרגיל (התנהגות מקורית)
  const popStd = Math.max(Number(dist.std) || 0, METRIC_POP_STD_FLOOR[key] || 0);
  if (!(popStd > 0)) return true;
  const zPop = Math.abs(Number(userVal) - Number(dist.mean)) / popStd;
  return zPop >= POP_DISTINCTIVE_Z;
};

/**
 * בונה בלוק הזרקה עברי רזה (~≤350 מילים) מהפרופיל, או '' אם אין מה להזריק.
 * @param {object} styleEngine
 * @param {{seed?:number, chunkBlock?:string, genre?:string, reference?:object, patternCount?:number, includeStructure?:boolean}} opts
 *   reference — נכס-ייחוס האוכלוסייה (מקורא async), אחרת נלקח מהמטמון הסינכרוני.
 *   includeStructure — ברירת מחדל true. הנחיית מבנה ברמת הסעיף/העבודה (פתיחה,
 *   מיקום תזה, סיום, שרשור סעיפים) הגיונית רק ביצירת מסמך שלם; בשכתוב פסקה בודדת
 *   או משפט היא רעש שמושך את המודל לכתוב פתיח/סיכום שלא ביקשו ממנו — שם העבר false.
 * @returns {string}
 */
export function buildStyleEngineInjectionBlock(styleEngine, { seed = 0, chunkBlock = '', genre = null, reference = null, patternCount = 5, includeStructure = true } = {}) {
  if (!isPlainObject(styleEngine) || styleEngine.enabled === false) return '';

  // E3 — כשיש ז'אנר תואם עם תת-פרופיל מדדים → משתמשים ב-metrics/metricsSpread שלו
  // לעוגני המדד (הדפוסים/blacklist נשארים גלובליים). אחרת נופלים לפרופיל הגלובלי.
  const gName = genre ? String(genre).trim() : '';
  // נכס-ייחוס האוכלוסייה: מהפרמטר (קורא async), אחרת מהמטמון הסינכרוני. חסר/ריק →
  // shouldInjectMetricAnchor יחזיר תמיד true → כל העוגנים מוזרקים (התנהגות מקורית).
  const ref = isPlainObject(reference) ? reference : getCachedReference();
  const genreProfiles = isPlainObject(styleEngine.genreProfiles) ? styleEngine.genreProfiles : {};
  const genreProfile = gName && isPlainObject(genreProfiles[gName]) ? genreProfiles[gName] : null;
  const useGenreMetrics = Boolean(genreProfile && isPlainObject(genreProfile.metrics));
  const metrics = useGenreMetrics
    ? genreProfile.metrics
    : (isPlainObject(styleEngine.metrics) ? styleEngine.metrics : null);
  const activeSpread = useGenreMetrics && isPlainObject(genreProfile.metricsSpread)
    ? genreProfile.metricsSpread
    : (isPlainObject(styleEngine.metricsSpread) ? styleEngine.metricsSpread : {});
  const patterns = Array.isArray(styleEngine.qualitativePatterns) ? styleEngine.qualitativePatterns : [];
  const negativeSpace = Array.isArray(styleEngine.negativeSpace) ? styleEngine.negativeSpace : [];
  const blacklist = isPlainObject(styleEngine.blacklist) ? styleEngine.blacklist : {};

  const chunkText = String(chunkBlock || '').trim();
  const hasMetrics = metrics && Object.values(metrics).some(
    (v) => Number.isFinite(Number(v)) || isPlainObject(v),
  );
  if (!hasMetrics && !patterns.length && !negativeSpace.length && !chunkText) return '';

  const lines = ['== סגנון אישי (מנוע סגנון) =='];
  if (useGenreMetrics) lines.push(`(מותאם לז'אנר: ${gName})`);

  // 0. chunks אמיתיים בראש — המנוף האיכותי העיקרי (תוכנית §7 פת.1, §10 פת.1).
  if (chunkText) lines.push(chunkText);

  // 1. עוגני מדד.
  if (hasMetrics) {
    const anchors = [];
    const avgSent = roundDisplay(metrics.avgSentenceWords, 0);
    // עוגן אורך-המשפט מוזרק רק אם המשתמש חורג מהאוכלוסייה (או שאין נתוני-אוכלוסייה).
    if (avgSent && shouldInjectMetricAnchor(ref, 'avgSentenceWords', Number(metrics.avgSentenceWords), gName)) {
      const meanSent = Number(metrics.avgSentenceWords);
      const spread = activeSpread;
      const stdRaw = Number(spread.avgSentenceWords && spread.avgSentenceWords.std);
      const std = (Number.isFinite(stdRaw) && stdRaw > 0) ? stdRaw : meanSent * 0.4;
      const lo = Math.round(Math.max(4, meanSent - 1.2 * std));
      const hi = Math.round(meanSent + 1.2 * std);
      anchors.push(`אורך משפטים: המשתמש כותב בממוצע ~${avgSent} מילים למשפט. כתוב ברובם משפטים באורך ${lo}-${hi} מילים (טווח סביב הממוצע), עם שונות מכוונת — שלב לצד משפט ארוך גם משפט קצר מאוד. אל תכתוב משפטים אחידים וארוכים.`);
      if (meanSent > 0 && meanSent < 16) {
        anchors.push('הקפד על משפטים קצרים יחסית — אל תמתח אותם.');
      }
    }
    // פסיקים/סוגריים — כל אחד מגודר בנפרד מול האוכלוסייה (מדד רגיל לא מוזרק).
    const commas = roundDisplay(metrics.avgCommasPerSentence, 1);
    const parenD = Number(metrics.parenthesesDensity);
    const punctBits = [];
    if (commas !== null && commas > 0
      && shouldInjectMetricAnchor(ref, 'avgCommasPerSentence', Number(metrics.avgCommasPerSentence), gName)) {
      punctBits.push(`פסיקים: ~${commas} למשפט`);
    }
    if (Number.isFinite(parenD) && parenD > 0
      && shouldInjectMetricAnchor(ref, 'parenthesesDensity', parenD, gName)) {
      punctBits.push(`סוגריים: ${parenD >= 3 ? 'תכופים' : parenD >= 1 ? 'מדי פעם' : 'נדירים'}`);
    }
    if (punctBits.length) anchors.push(`${punctBits.join('. ')}.`);

    const avgPara = roundDisplay(metrics.avgParagraphWords, 0);
    if (avgPara && shouldInjectMetricAnchor(ref, 'avgParagraphWords', Number(metrics.avgParagraphWords), gName)) {
      anchors.push(`פסקה אופיינית: ~${avgPara} מילים.`);
    }

    // מילות-קישור/ניגודי-קישור נשארים ללא גידור-אוכלוסייה: אין להם התפלגות {mean,std}
    // בנכס-הייחוס (הם לקסיקליים), והם ממילא נושאי-חתימה מטבעם.
    const connectors = isPlainObject(metrics.connectorFrequency)
      ? Object.keys(metrics.connectorFrequency).slice(0, 5)
      : [];
    if (connectors.length) anchors.push(`מילות קישור מזהות: ${connectors.join(', ')}.`);

    const contrasts = computeConnectorContrasts(metrics);
    if (contrasts.length) {
      const contrastText = contrasts
        .map((c) => `העדף "${c.prefer}" (לא ${c.over.map((o) => `"${o}"`).join('/')})`)
        .join('; ');
      anchors.push(`בחירות קישור: ${contrastText}.`);
    }

    if (anchors.length) lines.push(...anchors);
  }

  // 1ב. חתימה מבנית (A8) — רק ערכים לא-ריקים, תקציב ~40 מילים לכל הסקשן.
  if (includeStructure) {
    const sig = normalizeStructuralSignature(styleEngine.structuralSignature);
    const structBits = [];
    let budget = STRUCTURE_SECTION_WORD_BUDGET;
    STRUCTURAL_SIGNATURE_KEYS.forEach((k) => {
      if (budget <= 0) return;
      const value = truncateWords(sig[k], Math.min(budget, STRUCTURE_VALUE_WORD_CAP));
      if (!value) return;
      structBits.push(`${STRUCTURAL_SIGNATURE_LABELS[k]}: ${value}`);
      budget -= countWords(value) + 2; // +2 ≈ התווית עצמה
    });
    if (structBits.length) lines.push(`מבנה אופייני: ${structBits.join(' · ')}.`);
  }

  // 2. דפוסים ברוטציה. patternCount ברירת-מחדל 5 (הזרקה שוטפת); הייצוא ל-AI חיצוני
  // מבקש יותר — פרומפט חד-פעמי שנשמר אצל הספק, תקציב הטוקנים פחות לחוץ.
  const rotated = selectRotatedPatterns(patterns, { count: patternCount, seed });
  if (rotated.length) {
    lines.push('דפוסים אישיים לשילוב טבעי (אל תדחוס את כולם):');
    rotated.forEach((p) => lines.push(`- ${p.label}`));
  }

  // 3. שטח שלילי.
  const negClean = cleanStringArray(negativeSpace, CAP_NEGATIVE);
  if (negClean.length) lines.push(`כללי "לעולם לא": ${negClean.join(', ')}.`);

  // 4. blacklist: auto+user פחות removed, cap 20.
  const removedSet = new Set(cleanStringArray(blacklist.removed, CAP_BLACKLIST));
  const banned = [
    ...cleanStringArray(blacklist.auto, CAP_BLACKLIST),
    ...cleanStringArray(blacklist.user, CAP_BLACKLIST),
  ].filter((item) => !removedSet.has(item));
  const bannedUnique = cleanStringArray(banned, 20);
  if (bannedUnique.length) lines.push(`הימנע לחלוטין מהביטויים: ${bannedUnique.join(', ')}.`);

  lines.push('כתוב כאילו אתה הכותב עצמו. אל תזכיר את ההנחיות האלה.');
  lines.push('== סוף סגנון אישי ==');

  return lines.join('\n');
}

// ==========================================================================
// Phase 2 — דפוסים איכותניים (LLM), blacklist אוטומטי, בחירת קטעים מייצגים
// כל הפונקציות כאן טהורות; גישה ל-LLM נעשית אך ורק דרך callback שמוזרק
// (invokeModel) — המודול נשאר leaf בלי תלות ב-aiService/workspaceLearningService.
// תוכנית: docs/style-engine-plan.md §5a, §6 (שלב 2+3).
// ==========================================================================

// ---------- AI_CLICHE_BLACKLIST ----------

// קלישאות עברית "שמריחות AI". חלק חופף להרגלים אמיתיים של חלק מהמשתמשים
// (למשל 'יתר על כן') — deriveAutoBlacklist מסיר את אלה שהמשתמש עצמו משתמש בהם.
export const AI_CLICHE_BLACKLIST = [
  'חשוב לציין',
  'יש לציין',
  'ראוי לציין',
  'לסיכום',
  'בעידן המודרני',
  'בעולם של היום',
  'זה לא סוד ש',
  'אין ספק ש',
  'חשוב להבין ש',
  'ראשית כל',
  'בשורה התחתונה',
  'למען הסר ספק',
  'כפי שצוין לעיל',
  'במאמר מוסגר',
  'על מנת',
  'יתר על כן',
  'כמו כן חשוב',
  'בהקשר זה',
  'לאור האמור',
  'מכל האמור לעיל',
  'הבה נבחן',
  'צריך לזכור כי',
  'מן הראוי',
  'ניתן לומר בבטחה',
  'בסופו של יום',
];

const normalizeLabel = (value) => String(value || '').trim().toLowerCase();

// ---------- deriveAutoBlacklist ----------

/**
 * גוזר blacklist אוטומטי: מתחיל מ-AI_CLICHE_BLACKLIST ומסיר כל קלישאה שהיא
 * למעשה הרגל אמיתי של המשתמש (מופיעה בתוך label של qualitativePattern, או
 * כמפתח ב-metrics.connectorFrequency). ההסרה עצמה היא ההתאמה-האישית.
 * @param {object} styleEngine
 * @returns {string[]} deduped, cap 50
 */
export function deriveAutoBlacklist(styleEngine) {
  const se = isPlainObject(styleEngine) ? styleEngine : {};

  const patterns = Array.isArray(se.qualitativePatterns) ? se.qualitativePatterns : [];
  const patternLabels = patterns
    .map((p) => normalizeLabel(isPlainObject(p) ? p.label : ''))
    .filter(Boolean);

  const metrics = isPlainObject(se.metrics) ? se.metrics : {};
  const connectorKeys = isPlainObject(metrics.connectorFrequency)
    ? Object.keys(metrics.connectorFrequency).map(normalizeLabel).filter(Boolean)
    : [];

  const isUserHabit = (cliche) => {
    const norm = normalizeLabel(cliche);
    if (!norm) return false;
    // המשתמש משתמש בקישור הזה בפועל.
    if (connectorKeys.some((k) => k === norm || k.includes(norm) || norm.includes(k))) return true;
    // הביטוי מופיע בתוך אחד מהדפוסים האישיים שזוהו.
    if (patternLabels.some((label) => label.includes(norm))) return true;
    return false;
  };

  const kept = AI_CLICHE_BLACKLIST.filter((cliche) => !isUserHabit(cliche));
  return cleanStringArray(kept, CAP_BLACKLIST);
}

// ---------- buildPatternExtractionPrompt ----------

// 8 סוגי דפוסים. שלושת האחרונים (citation/argument_move/transition) נוספו כדי לתפוס
// את מה שחמשת הראשונים החמיצו: איך הכותב מייחס טענות, איך הוא בונה טיעון, ואיך הוא
// עובר בין רעיונות. הרחבה בלבד — סוגים ותיקים ממשיכים לעבור כרגיל.
const VALID_PATTERN_TYPES = new Set([
  'signature_phrase', 'structure', 'lexical_habit', 'punctuation', 'register',
  'citation', 'argument_move', 'transition',
]);

// תוויות עבריות לסוגי דפוסים — מקור-אמת יחיד (משמש גם ב-StyleProfilePanel וגם
// ב-buildVerificationQuestions). מיוצא כדי למנוע שכפול המפה.
export const PATTERN_TYPE_LABELS = {
  signature_phrase: 'ביטוי חתימה',
  structure: 'מבנה',
  lexical_habit: 'הרגל מילולי',
  punctuation: 'פיסוק',
  register: 'רגיסטר',
  citation: 'ציטוט והפניה',
  argument_move: 'מהלך טיעון',
  transition: 'מעבר',
};

// תוויות רמת-ודאות — מקור-אמת יחיד (נצרך ב-StyleSetupFlow / StyleProfilePanel).
export const CONFIDENCE_LABELS = { low: 'נמוכה', medium: 'בינונית', high: 'גבוהה' };

// שורות הסכימה+הכללים המשותפות לפרומפט הפנימי ולפרומפט החיצוני. חילוץ זה שומר
// זהות-ביטים ל-buildPatternExtractionPrompt (המנוע הפנימי רגיש לפרומפט המדויק).
const PATTERN_SCHEMA_INSTRUCTIONS = [
  'חובה לכלול ביטויי חתימה מילוליים — צירופים מדויקים שהכותב חוזר עליהם (למשל פתיח טיעון קבוע, פועל מועדף) — עם סוג signature_phrase.',
  'לכל דפוס חובה ציטוט ראיה מילולי מהטקסט (evidence).',
  'אל תציין מאפיינים גנריים של עברית אקדמית (למשל "משפטים ארוכים", "שימוש במונחים מקצועיים", "כתיבה פורמלית") — רק הרגלים שמבדילים את הכותב הזה מכותבים אקדמיים אחרים.',
  '',
  'לכל דפוס החזר:',
  '- label: תיאור קצר בעברית של הדפוס',
  '- type: אחד מ- signature_phrase | structure | lexical_habit | punctuation | register | citation | argument_move | transition',
  '- weight: מספר 0-1 (עד כמה הדפוס דומיננטי אצלו)',
  '- evidence: ציטוט ראיה מילולי אחד מהטקסט (חובה)',
  '',
  'שלושת הסוגים החדשים — התייחס אליהם במפורש:',
  '- citation — איך הכותב מביא מקורות ומייחס טענות: ציטוט ישיר מול פרפרזה, "כפי שטוען X" מול "(X, 2020)", ואיפה הוא ממקם את ההפניה במשפט (בתחילתו, באמצעו או בסופו).',
  '- argument_move — איך הוא בונה טיעון: פותח בטענה או בהקשר, איך הוא מודה בטענת-נגד, ואיך הוא מפריך אותה.',
  '- transition — איך הוא עובר בין רעיונות ובין פסקאות (מילת קישור? משפט-גשר? חזרה על מונח מהפסקה הקודמת?).',
  // ⚠️ נמדד על קורפוס אמיתי (10.8.26): citation ו-argument_move חזרו יפה, אבל
  // transition חזר 0 — המודל בלע את המעברים לתוך תיאור מבנה כללי במקום לתייג אותם.
  // התיקון: דוגמה קונקרטית + איסור מפורש לקפל מעברים לתוך structure.
  '  חובה לבדוק את **התפר בין פסקה לפסקה** ולא רק את מבנה הסעיף. דוגמה לדפוס transition תקין:',
  '  "פותח פסקה בחזרה על המונח שסגר את הפסקה הקודמת" · "מקשר פסקאות ב\'לצד זאת\' בתחילת משפט".',
  '  אם ההרגל הוא על מעבר בין רעיונות — תייג אותו transition, לא structure.',
  '',
  // negativeSpace הופך בהמשך ל"לעולם לא" מוחלט בכל פרומפט. נמדד (10.8.26):
  // המודל החזיר "ציטוטים ישירים ממקורות (העדפה לפרפרזה)" — כלל **תוכן** שהיה
  // מדכא ציטוט ישיר בכתיבה אקדמית. לכן ההנחיה מוגבלת מפורשות לרובד הסגנוני.
  'בנוסף, זהה negativeSpace — אילו **אמצעים סגנוניים-רטוריים** נעדרים מהכתיבה שלו',
  '(שאלות רטוריות? הומור או אירוניה? סימני קריאה? משפטים בני מילה אחת? מטפורות ודימויים? פנייה ישירה לקורא? סוגריים? קיצורים דיבוריים?).',
  'אך ורק צורת ניסוח — **אסור** להחזיר כאן כללים על ציטוט והפניה, על בחירת מקורות,',
  'על ראיות, על עומק הניתוח או על תוכן: אלה החלטות מחקר ולא הרגלי סגנון, וכלל כזה',
  'ייאכף כאיסור מוחלט ויפגע בכתיבה. אם אין היעדרות סגנונית ברורה — החזר [] ריק.',
  '',
  'החזר JSON בלבד, ללא טקסט נוסף וללא הסברים:',
  '{ "patterns": [ { "label": "...", "type": "...", "weight": 0.0, "evidence": "..." } ], "negativeSpace": [ "..." ] }',
];

// A2 — בלוק "עומק" משותף לפרומפט הפנימי (opts.deep) ולחיצוני. שני מפתחות עליונים
// נוספים: structuralSignature (ארכיטקטורה ברמת העבודה) ו-avoidedPhrases (מחרוזות
// ליטרליות שמזינות את ה-blacklist). avoidedPhrases שונה מ-negativeSpace: השני הוא
// התנהגות ("שאלות רטוריות"), הראשון הוא ניסוחים מדויקים שהכותב נמנע מהם.
const DEEP_SCHEMA_INSTRUCTIONS = [
  'בנוסף לדפוסים, זהה שני דברים ברמה גבוהה יותר:',
  '',
  '1. structuralSignature — הארכיטקטורה של העבודה כולה (לא של משפט בודד):',
  '- opening: איך הוא פותח עבודה (בשאלה? בהקשר היסטורי? בהגדרת מונח? בציטוט?).',
  '- closing: איך הוא מסיים (סיכום? השלכות? הסתייגות? שאלה פתוחה?).',
  '- thesisPlacement: איפה הוא ממקם את טענת התזה (בפסקה הראשונה? בסוף המבוא? מפוזרת?).',
  '- sectionFlow: איך הוא משרשר סעיפים זה לזה (כותרות ממוספרות? פסקת מעבר? הכרזה מראש על המבנה?).',
  '- firstPersonUsage: איך הוא מתייחס לעצמו ("אני טוען" / "העבודה תטען" / סביל בלבד).',
  'כל ערך — משפט קצר אחד בעברית. שדה שלא ניתן ללמוד מהטקסט — החזר "".',
  '',
  '2. avoidedPhrases — ניסוחים מדויקים שכותבים אקדמיים אחרים משתמשים בהם והכותב הזה',
  'נמנע מהם בעקביות (למשל "חשוב לציין", "בעידן המודרני"). מחרוזות ליטרליות בלבד,',
  'לא תיאור התנהגות — תיאורי התנהגות שייכים ל-negativeSpace.',
  '',
  'אל תמציא — שדה לא ידוע החזר "" או [].',
  'הוסף לפלט גם:',
  '"structuralSignature": {"opening":"","closing":"","thesisPlacement":"","sectionFlow":"","firstPersonUsage":""}, "avoidedPhrases": []',
];

// סכימת style/coverPageDefaults לפרומפט החיצוני — ליטרל מילולי המועתק מ-aiService.js
// (~שורה 6955). מועתק במכוון כליטרל כדי ש-styleProfileService יישאר בלי תלות ב-aiService.
const EXTERNAL_STYLE_SCHEMA_LINE = '{"profileSummary":"","style":{"defaultAudience":"","writingGoals":"","formatPreferences":"","paragraphPreferences":"","customStyleGuidance":"","manualVocabulary":[],"manualPhrases":[],"preferredSentenceStructures":[],"preferredConnectors":[],"preferredSentenceOpeners":[],"toneDescriptors":[],"tonePreferences":[],"sentenceLengthPreference":"","paragraphLengthPreference":"","defaultDocumentStyle":"","notes":""},"coverPageDefaults":{"institutionName":"","studyTrack":"","courseName":"","lecturerName":"","assignmentType":"","displayName":"","studentId":"","aiAssistanceDeclaration":"","submissionDate":""}}';

/**
 * בונה את פרומפט חילוץ הדפוסים האיכותניים (עברי, §6 שלב 2).
 * opts.deep=true מוסיף את בלוק ה-structuralSignature/avoidedPhrases (A2) — כבוי
 * כברירת מחדל כדי לשמור זהות-ביטים לפרומפט הקיים במסלולי הבאטץ' הישנים.
 * @param {string[]} excerpts
 * @param {{deep?:boolean}} opts
 * @returns {string}
 */
export function buildPatternExtractionPrompt(excerpts, opts = {}) {
  const deep = isPlainObject(opts) && opts.deep === true;
  const joined = (Array.isArray(excerpts) ? excerpts : [])
    .map((e) => String(e || '').trim())
    .filter(Boolean)
    .join('\n---\n');

  return [
    'אתה מנתח סגנון כתיבה. לפניך קטעים אמיתיים מכתיבה של אדם אחד.',
    'המשימה: לזהות את הדפוסים האישיים החוזרים שלו — לא כללי כתיבה טובה גנריים,',
    'אלא ההרגלים הספציפיים שמזהים דווקא אותו.',
    '',
    ...PATTERN_SCHEMA_INSTRUCTIONS,
    ...(deep ? ['', ...DEEP_SCHEMA_INSTRUCTIONS, '',
      'מבנה הפלט הסופי: החזר JSON יחיד בלבד, ללא טקסט נוסף, במבנה:',
      '{ "patterns": [...], "negativeSpace": [...], "structuralSignature": {...}, "avoidedPhrases": [...] }'] : []),
    '',
    'הקטעים:',
    joined,
  ].join('\n');
}

/**
 * בונה את בלוק "המדדים שכבר נמדדו" לפרומפט החיצוני. המטרה: לא לבזבז את הקשב של
 * המודל החיצוני על מה שכבר חישבנו מקומית — הוא נדרש להתמקד במה שמספרים לא מראים.
 * מחזיר '' כשאין metrics (ואז הבלוק נשמט לגמרי).
 * @param {object|null} engine
 * @returns {string}
 */
const buildMeasuredMetricsBlock = (engine) => {
  const metrics = isPlainObject(engine) && isPlainObject(engine.metrics) ? engine.metrics : null;
  if (!metrics) return '';
  const bits = [];
  const avgSent = roundDisplay(metrics.avgSentenceWords, 0);
  if (avgSent) bits.push(`- אורך משפט ממוצע: ~${avgSent} מילים`);
  const commas = roundDisplay(metrics.avgCommasPerSentence, 1);
  if (commas !== null && commas > 0) bits.push(`- פסיקים למשפט: ~${commas}`);
  const avgPara = roundDisplay(metrics.avgParagraphWords, 0);
  if (avgPara) bits.push(`- אורך פסקה ממוצע: ~${avgPara} מילים`);
  const parenD = roundDisplay(metrics.parenthesesDensity, 1);
  if (parenD !== null && parenD > 0) bits.push(`- צפיפות סוגריים: ~${parenD} ל-100 מילים`);
  if (!bits.length) return '';
  return [
    'מדדים שכבר נמדדו מהעבודות שלי (אל תנחש אותם מחדש — התמקד במה שמספרים לא מראים):',
    ...bits,
  ].join('\n');
};

/**
 * פרומפט לספק AI חיצוני (ChatGPT/Claude/Gemini): המשתמש מצרף את עבודותיו לשיחה,
 * מריץ את הפרומפט, ומדביק את פלט ה-JSON חזרה. משתמש באותם כללי סכימה כמו הפרומפט
 * הפנימי + בלוק העומק (A2) + סקשן מטא (style/coverPageDefaults) כדי לחלץ גם
 * ברירות מחדל אישיות.
 * @param {{profile?:object, engine?:object|null, excerpts?:string[]}} opts
 *   engine — כשיש בו metrics מוזרק בלוק "כבר נמדד" (אחרת נשמט לגמרי).
 *   excerpts — fallback לספקים בלי העלאת קבצים: הקטעים מודבקים לתוך הפרומפט.
 * @returns {string}
 */
export function buildExternalPatternAnalysisPrompt({ profile = {}, engine = null, excerpts = [] } = {}) {
  const p = isPlainObject(profile) ? profile : {};
  const lecturersRaw = Array.isArray(p.lecturerNames)
    ? p.lecturerNames.map((n) => String(n || '').trim()).filter(Boolean).join(', ')
    : String(p.lecturerName || '').trim();
  const coursesRaw = Array.isArray(p.currentCourses)
    ? p.currentCourses.map((c) => String(c || '').trim()).filter(Boolean).join(', ')
    : String(p.currentCourses || '').trim();
  const knownContext = [
    p.displayName ? `- שם משתמש ידוע: ${String(p.displayName).trim()}` : '',
    p.institutionName ? `- מוסד/מרכז אקדמי ידוע: ${String(p.institutionName).trim()}` : '',
    p.studyTrack ? `- חוג/מסלול ידוע: ${String(p.studyTrack).trim()}` : '',
    lecturersRaw ? `- מרצים/מנחים ידועים: ${lecturersRaw}` : '',
    coursesRaw ? `- קורסים ידועים: ${coursesRaw}` : '',
  ].filter(Boolean).join('\n');

  const metricsBlock = buildMeasuredMetricsBlock(engine);
  const joinedExcerpts = (Array.isArray(excerpts) ? excerpts : [])
    .map((e) => String(e || '').trim())
    .filter(Boolean)
    .join('\n---\n');

  return [
    'צירפתי לשיחה הזו עבודות שכתבתי. נתח את סגנון הכתיבה האישי שלי לפי ההנחיות הבאות.',
    '',
    metricsBlock ? `${metricsBlock}\n` : '',
    ...PATTERN_SCHEMA_INSTRUCTIONS,
    '',
    ...DEEP_SCHEMA_INSTRUCTIONS,
    '',
    'בנוסף, חלץ מהעבודות ומעמוד השער (אם צורף) ברירות מחדל אישיות, לפי הסכימה הבאה:',
    EXTERNAL_STYLE_SCHEMA_LINE,
    knownContext ? `הקשר שכבר ידוע:\n${knownContext}` : '',
    '',
    'מבנה הפלט הסופי: החזר JSON יחיד בלבד, ללא טקסט נוסף, כל הערכים בעברית, במבנה:',
    '{ "patterns": [...], "negativeSpace": [...], "structuralSignature": {...}, "avoidedPhrases": [...], "profileSummary": "", "style": {...}, "coverPageDefaults": {...} }',
    'אל תמציא — אם שדה לא ידוע החזר "" או [].',
    joinedExcerpts ? `\nקטעים מייצגים מהעבודות שלי:\n${joinedExcerpts}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * A4 — פרומפט לחילוץ בלוק המטא (profileSummary/style/coverPageDefaults) על ידי
 * ה-LLM המקומי של האפליקציה. עד היום רק המסלול החיצוני קיבל את הבלוק הזה; כאן
 * אותה סכימה בדיוק (EXTERNAL_STYLE_SCHEMA_LINE — מקור-אמת יחיד, כדי ששני
 * המסלולים לא יסטו) עם שערי אנטי-הזיה קשיחים.
 * @param {{profile?:object, excerpts?:string[]}} opts
 * @returns {string}
 */
export function buildDeepProfileExtractionPrompt({ profile = {}, excerpts = [] } = {}) {
  const p = isPlainObject(profile) ? profile : {};
  const lecturersRaw = Array.isArray(p.lecturerNames)
    ? p.lecturerNames.map((n) => String(n || '').trim()).filter(Boolean).join(', ')
    : String(p.lecturerName || '').trim();
  const coursesRaw = Array.isArray(p.currentCourses)
    ? p.currentCourses.map((c) => String(c || '').trim()).filter(Boolean).join(', ')
    : String(p.currentCourses || '').trim();
  const knownContext = [
    p.displayName ? `- שם משתמש ידוע: ${String(p.displayName).trim()}` : '',
    p.institutionName ? `- מוסד/מרכז אקדמי ידוע: ${String(p.institutionName).trim()}` : '',
    p.studyTrack ? `- חוג/מסלול ידוע: ${String(p.studyTrack).trim()}` : '',
    lecturersRaw ? `- מרצים/מנחים ידועים: ${lecturersRaw}` : '',
    coursesRaw ? `- קורסים ידועים: ${coursesRaw}` : '',
  ].filter(Boolean).join('\n');

  const joined = (Array.isArray(excerpts) ? excerpts : [])
    .map((e) => String(e || '').trim())
    .filter(Boolean)
    .join('\n---\n');

  return [
    'לפניך קטעים אמיתיים מתוך עבודות שהמשתמש כתב (כולל עמוד שער ופסקאות פתיחה, אם יש).',
    'חלץ מהם תקציר פרופיל, העדפות סגנון וברירות מחדל לעמוד שער — אך ורק מה שנתמך בטקסט.',
    'החזר JSON יחיד בלבד, בלי טקסט מסביב, כל הערכים בעברית, בדיוק במבנה:',
    EXTERNAL_STYLE_SCHEMA_LINE,
    '',
    'כללים מחייבים:',
    '- אל תמציא ואל תנחש. שדה שלא מופיע/לא נתמך בטקסט — החזר "" או [].',
    '- profileSummary = 2-3 משפטים על מי הכותב ומה הוא כותב, מהטקסט בלבד.',
    '- manualVocabulary/manualPhrases = מילים וצירופים שהכותב עצמו משתמש בהם בפועל, לא המלצות.',
    '- preferredConnectors/preferredSentenceOpeners = רק כאלה שמופיעים בטקסט יותר מפעם אחת.',
    '- coverPageDefaults = רק מה שמופיע במפורש בעמוד השער; אל תשלים מוסד/קורס מהידע הכללי שלך.',
    '- displayName = שם הכותב/המגיש בלבד, לא שם המרצה.',
    knownContext ? `\nהקשר שכבר ידוע (אל תגזור אותו מחדש, השאר "" אם אין תוספת):\n${knownContext}` : '',
    '',
    'הקטעים:',
    joined,
  ].filter(Boolean).join('\n');
}

/**
 * בונה שאלות אימות ("זה נשמע כמוך?") מתוך overview (getStyleOverview). פונקציה טהורה.
 * מועמדי דפוסים: לא-pinned בלבד; מיון: mined:true קודם (ground truth), בתוך כל קבוצה
 * weight יורד. גיוון: עד 2 שאלות לכל type, ואם לא התמלא — סבב שני בלי מגבלת type.
 * שאלות negativeSpace אחרי שאלות הדפוסים.
 * @param {object} overview
 * @param {{maxPatternQuestions?:number, maxNegativeQuestions?:number}} opts
 * @returns {Array<object>}
 */
export function buildVerificationQuestions(overview = {}, { maxPatternQuestions = 7, maxNegativeQuestions = 3 } = {}) {
  const ov = isPlainObject(overview) ? overview : {};
  const patterns = Array.isArray(ov.qualitativePatterns) ? ov.qualitativePatterns : [];
  const negativeSpace = Array.isArray(ov.negativeSpace) ? ov.negativeSpace : [];

  const patternQuestion = (p) => ({
    kind: 'pattern',
    patternId: p.id,
    typeLabel: PATTERN_TYPE_LABELS[p.type] || p.type,
    label: p.label,
    evidence: p.evidence || '',
    question: 'זה נשמע כמוך?',
  });

  // מועמדים: לא-pinned; מיון mined→weight.
  const candidates = patterns
    .filter((p) => isPlainObject(p) && !p.pinned)
    .slice()
    .sort((a, b) => {
      const am = a.mined === true ? 1 : 0;
      const bm = b.mined === true ? 1 : 0;
      if (am !== bm) return bm - am;
      return toNum(b.weight, 0) - toNum(a.weight, 0);
    });

  const questions = [];
  const used = new Set();
  const typeCount = new Map();
  // סבב ראשון: עד 2 לכל type (גיוון).
  for (const p of candidates) {
    if (questions.length >= maxPatternQuestions) break;
    const t = String(p.type || '');
    const c = typeCount.get(t) || 0;
    if (c >= 2) continue;
    typeCount.set(t, c + 1);
    used.add(p);
    questions.push(patternQuestion(p));
  }
  // סבב שני: השלמה בלי מגבלת type.
  if (questions.length < maxPatternQuestions) {
    for (const p of candidates) {
      if (questions.length >= maxPatternQuestions) break;
      if (used.has(p)) continue;
      used.add(p);
      questions.push(patternQuestion(p));
    }
  }

  const negQuestions = [];
  for (const item of negativeSpace) {
    if (negQuestions.length >= maxNegativeQuestions) break;
    const str = String(item || '').trim();
    if (!str) continue;
    negQuestions.push({ kind: 'negative', item: str, question: 'נכון שאתה כמעט אף פעם לא —' });
  }

  return [...questions, ...negQuestions];
}

// ---------- parsePatternExtractionResult ----------

const stripJsonFences = (raw) => String(raw || '')
  .replace(/```(?:json)?\s*/gi, '')
  .replace(/```/g, '')
  .trim();

// ⚠️ נמדד (12.8.26) על פלטים אמיתיים מ-ChatGPT/Claude בעברית: ההדבקה נפלה ל"לא נקלט
// כלום" בשישה מצבים שכולם JSON לגיטימי לחלוטין מבחינת המשתמש — גרשיים חכמים (עורך
// RTL/וורד ממיר " ל-" "), פסיק עוקב, עטיפה במפתח-על ("styleAnalysis": {...}), מערך
// דפוסים כשורש, שני אובייקטים בטקסט, ותווי כיווניות. ה-decoder כאן מכסה את כולם.
// סדר קריטי: ניקוי תווים בלתי־נראים → ניסיון parse נאיבי → תיקונים → מועמדים.
const INVISIBLE_CHARS_RE = /[\uFEFF\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;

const stripSmartQuotes = (text) => String(text || '')
  // גרשיים "חכמים" סביב מפתחות/ערכים — רק כשה-parse הרגיל כבר נכשל, כדי לא לגעת
  // בפלט תקין שיש בו מרכאות טיפוגרפיות *בתוך* ערך עברי.
  .replace(/[“”„‟″]/g, '"')
  .replace(/[‘’‚‛′]/g, "'");

const stripTrailingCommas = (text) => String(text || '').replace(/,\s*([}\]])/g, '$1');

const tryParseJson = (text) => {
  const t = String(text || '').trim();
  if (!t) return null;
  try { return JSON.parse(t); } catch { /* fallthrough */ }
  try { return JSON.parse(stripTrailingCommas(t)); } catch { /* fallthrough */ }
  try { return JSON.parse(stripTrailingCommas(stripSmartQuotes(t))); } catch { /* fallthrough */ }
  return null;
};

// מועמדי JSON בתוך טקסט חופשי: כל מרווח {...} / [...] מהפתיחה ה-i-ית עד הסגירה
// האחרונה התואמת. מוחזרים מהארוך לקצר, כי הפלט המלא עדיף על תת-אובייקט שנתפס במקרה.
const jsonCandidates = (text) => {
  const t = String(text || '');
  const out = [];
  for (const [open, close] of [['{', '}'], ['[', ']']]) {
    let from = 0;
    while (out.length < 12) {
      const start = t.indexOf(open, from);
      if (start < 0) break;
      const end = t.lastIndexOf(close);
      if (end > start) out.push(t.slice(start, end + 1));
      from = start + 1;
    }
  }
  return out.sort((a, b) => b.length - a.length);
};

/**
 * פענוח סובלני של פלט JSON שהודבק בידי המשתמש. מחזיר אובייקט/מערך או null.
 * מקור-אמת יחיד: משמש גם את parsePatternExtractionResult וגם את חילוץ המטא
 * ב-styleIngestService, כדי ששני המסלולים לא יסטו ביכולת הסליחה שלהם.
 * @param {string} raw
 * @returns {object|Array|null}
 */
export function decodeLooseJsonText(raw) {
  const stripped = stripJsonFences(String(raw || '').replace(INVISIBLE_CHARS_RE, ''));
  if (!stripped) return null;
  const direct = tryParseJson(stripped);
  if (direct && typeof direct === 'object') return direct;
  for (const candidate of jsonCandidates(stripped)) {
    const parsed = tryParseJson(candidate);
    if (parsed && typeof parsed === 'object') return parsed;
  }
  return null;
}

// מפתח-על עוטף ("styleAnalysis": {...}, "result": {...}) — מחפשים לעומק אחד את
// האובייקט שבאמת נושא את הסכימה, במקום להחזיר מבנה ריק.
const SCHEMA_KEYS = ['patterns', 'negativeSpace', 'structuralSignature', 'avoidedPhrases',
  'profileSummary', 'style', 'coverPageDefaults'];
const hasSchemaKey = (obj) => isPlainObject(obj) && SCHEMA_KEYS.some((k) => obj[k] !== undefined);

const unwrapSchemaObject = (parsed) => {
  if (!isPlainObject(parsed)) return parsed;
  if (hasSchemaKey(parsed)) return parsed;
  for (const value of Object.values(parsed)) {
    if (hasSchemaKey(value)) return value;
  }
  return parsed;
};

// ⚠️ נמדד (12.8.26): גם אחרי שהפענוח נעשה סלחני, פלטים אמיתיים עדיין הגיעו עם
// **שמות מפתח אחרים** — המודל תרגם את הסכימה לעברית ("דפוסים"), קינן אותה תחת
// מפתח-על בעומק 2 ("analysis":{"styleProfile":{...}}), או החזיר קמל/סנייק שונה.
// לכן הקצירה כאן היא לפי alias + סריקה לעומק, ולא לפי מפתח מדויק בשורש.
const KEY_ALIASES = {
  patterns: [/^patterns?$/i, /^stylepatterns?$/i, /^patternlist$/i, /^habits?$/i,
    /^writingpatterns?$/i, /^personalpatterns?$/i, /דפוס/],
  negativeSpace: [/^negative_?space$/i, /^negatives?$/i, /^absent/i, /נעדר/, /חסר/],
  structuralSignature: [/^structural_?signature$/i, /^structure$/i, /^architecture$/i,
    /^documentstructure$/i, /חתימה/, /מבנה/],
  avoidedPhrases: [/^avoided_?phrases?$/i, /^avoided$/i, /^phrases_?avoided$/i, /נמנע/],
  profileSummary: [/^profile_?summary$/i, /^summary$/i, /^about$/i, /תקציר/, /פרופיל/],
  style: [/^style$/i, /^stylepreferences$/i, /^preferences$/i, /העדפ/, /סגנון/],
  coverPageDefaults: [/^cover_?page_?defaults?$/i, /^coverpage$/i, /שער/],
};

const matchesAlias = (key, field) => KEY_ALIASES[field].some((re) => re.test(String(key || '').trim()));

// פריט דפוס "נראה נכון" — מספיק שיש בו תווית כלשהי. משמש לזיהוי מערך דפוסים
// שנשמר תחת מפתח שלא הכרנו בכלל.
const looksLikePatternItem = (item) => {
  if (typeof item === 'string') return item.trim().length >= 3;
  if (!isPlainObject(item)) return false;
  return ['label', 'name', 'title', 'pattern', 'habit', 'דפוס']
    .some((k) => String(item[k] || '').trim());
};

/**
 * סריקה לעומק אחרי חלקי הסכימה. עומק/מספר צמתים חסומים כדי שפלט ענק לא יתקע
 * את הדפדפן. הערך הראשון שנמצא לכל שדה מנצח (סריקה BFS — הרדוד קודם).
 * @param {any} root
 * @returns {{patterns:any, negativeSpace:any, structuralSignature:any, avoidedPhrases:any, profileSummary:any, style:any, coverPageDefaults:any}}
 */
const harvestSchemaParts = (root) => {
  const found = {
    patterns: undefined, negativeSpace: undefined, structuralSignature: undefined,
    avoidedPhrases: undefined, profileSummary: undefined, style: undefined, coverPageDefaults: undefined,
  };
  let fallbackPatterns;
  const queue = [{ node: root, depth: 0 }];
  let visited = 0;
  while (queue.length && visited < 400) {
    const { node, depth } = queue.shift();
    visited += 1;
    if (Array.isArray(node)) {
      if (fallbackPatterns === undefined && node.length && node.every(looksLikePatternItem)) {
        fallbackPatterns = node;
      }
      if (depth < 4) node.slice(0, 40).forEach((child) => queue.push({ node: child, depth: depth + 1 }));
      continue;
    }
    if (!isPlainObject(node)) continue;
    for (const [key, value] of Object.entries(node)) {
      if (value === null || value === undefined) continue;
      if (found.patterns === undefined && Array.isArray(value) && matchesAlias(key, 'patterns')) found.patterns = value;
      else if (found.negativeSpace === undefined && Array.isArray(value) && matchesAlias(key, 'negativeSpace')) found.negativeSpace = value;
      else if (found.avoidedPhrases === undefined && Array.isArray(value) && matchesAlias(key, 'avoidedPhrases')) found.avoidedPhrases = value;
      else if (found.structuralSignature === undefined && isPlainObject(value) && matchesAlias(key, 'structuralSignature')) found.structuralSignature = value;
      else if (found.coverPageDefaults === undefined && isPlainObject(value) && matchesAlias(key, 'coverPageDefaults')) found.coverPageDefaults = value;
      else if (found.style === undefined && isPlainObject(value) && matchesAlias(key, 'style')) found.style = value;
      else if (found.profileSummary === undefined && typeof value === 'string' && matchesAlias(key, 'profileSummary')) found.profileSummary = value;
      if (depth < 4 && (isPlainObject(value) || Array.isArray(value))) queue.push({ node: value, depth: depth + 1 });
    }
  }
  if (found.patterns === undefined && fallbackPatterns !== undefined) found.patterns = fallbackPatterns;
  return found;
};

/**
 * מפענח הדבקה חיצונית ומחזיר אובייקט בשמות הסכימה הקנוניים (patterns/style/
 * coverPageDefaults/...), גם כשהמודל קינן או תרגם את המפתחות. משמש את מסלול
 * המטא ב-styleIngestService, כדי שגם הוא ייהנה מאותה סלחנות. נכשל → null.
 * @param {string} raw
 * @returns {object|null}
 */
export function normalizeExternalSchemaJson(raw) {
  const decoded = decodeLooseJsonText(raw);
  if (!decoded) return null;
  const base = Array.isArray(decoded) ? { patterns: decoded } : unwrapSchemaObject(decoded);
  if (!isPlainObject(base)) return null;
  const out = { ...base };
  for (const [k, v] of Object.entries(harvestSchemaParts(base))) {
    if (out[k] === undefined && v !== undefined) out[k] = v;
  }
  return out;
}

// מפתחות פנימיים של פריט דפוס — כולל שמות עבריים, כי מודל שתרגם את הסכימה
// מתרגם גם אותם.
const pickField = (item, keys) => {
  for (const k of keys) {
    const v = item[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
};

// weight: מספר, מחרוזת ("0.7"), אחוזים ("85%" / 85), או חסר לגמרי. עד היום כל אלה
// חוץ מהראשונים הפילו את הדפוס בשקט — והמשתמש ראה "לא נקלט כלום" על פלט תקין.
const parsePatternWeight = (raw) => {
  if (raw === null || raw === undefined || raw === '') return 0.6; // ברירת מחדל שמרנית
  const str = String(raw).trim();
  const num = Number(str.replace('%', '').replace(',', '.'));
  if (!Number.isFinite(num)) return 0.6;
  if (num > 1) return clamp(num / 100, 0, 1); // 85 / "85%" → 0.85
  return clamp(num, 0, 1);
};

/**
 * פענוח סובלני של פלט ה-LLM. לעולם לא זורק — נכשל → מבנה ריק מלא (לא null),
 * כדי שקוראים לא יצטרכו שומרים.
 * lenientTypes:true — type לא-חוקי ממופה ל-'lexical_habit' במקום שהדפוס יופל (משמש
 * רק במסלול ההדבקה החיצונית; המסלול הפנימי נשאר קפדני).
 * @param {string} raw
 * @param {{lenientTypes?:boolean}} opts
 * @returns {{patterns:Array<object>, negativeSpace:string[], structuralSignature:object, avoidedPhrases:string[]}}
 */
export function parsePatternExtractionResult(raw, { lenientTypes = false } = {}) {
  const empty = () => ({
    patterns: [],
    negativeSpace: [],
    structuralSignature: EMPTY_STRUCTURAL_SIGNATURE(),
    avoidedPhrases: [],
  });
  if (raw === null || raw === undefined) return empty();

  let decoded = decodeLooseJsonText(raw);
  if (!decoded) return empty();
  // מערך כשורש = רשימת דפוסים (מודלים מחזירים את זה כשהפרומפט מדגיש "patterns").
  // רק במסלול הלניאנטי — המסלול הפנימי נשאר צר בכוונה.
  if (Array.isArray(decoded)) decoded = lenientTypes ? { patterns: decoded } : null;
  let parsed = unwrapSchemaObject(decoded);
  if (!isPlainObject(parsed)) return empty();
  // מסלול חיצוני: קצירה לפי alias + עומק. אם השורש כבר נושא את השדה — הוא מנצח,
  // והקצירה רק משלימה מה שחסר, כך שפלט תקין מתנהג בדיוק כמו קודם.
  const topKeys = Object.keys(parsed).slice(0, 20);
  if (lenientTypes) {
    const harvested = harvestSchemaParts(parsed);
    parsed = { ...parsed };
    for (const [k, v] of Object.entries(harvested)) {
      if (parsed[k] === undefined && v !== undefined) parsed[k] = v;
    }
  }

  const rawPatterns = Array.isArray(parsed.patterns) ? parsed.patterns : [];
  const patterns = [];
  for (const rawItem of rawPatterns) {
    // פריט כמחרוזת ("פותח פסקאות במונח מהפסקה הקודמת") — מודלים מחזירים את זה
    // כשהפרומפט מבקש "רשימת דפוסים". התווית היא המחרוזת עצמה.
    const item = typeof rawItem === 'string' ? { label: rawItem } : rawItem;
    if (!isPlainObject(item)) continue;
    // שמות שדה חלופיים שמודלים מחזירים בפועל (name/title, description/example) —
    // רק בהדבקה החיצונית, שם אין לנו שליטה על הפרומפט שהמשתמש הריץ.
    const label = String(
      item.label || (lenientTypes ? pickField(item, ['name', 'title', 'pattern', 'habit', 'דפוס', 'תיאור']) : '') || '',
    ).trim();
    if (!label) continue;
    let type = String(item.type || (lenientTypes ? pickField(item, ['category', 'kind', 'סוג']) : '') || '').trim();
    if (!VALID_PATTERN_TYPES.has(type)) {
      if (lenientTypes) type = 'lexical_habit';
      else continue;
    }
    let weight;
    if (lenientTypes) {
      weight = parsePatternWeight(item.weight ?? item.strength ?? item.confidence);
    } else {
      const weightNum = Number(item.weight);
      if (!Number.isFinite(weightNum)) continue;
      weight = clamp(round(weightNum, 3), 0, 1);
    }
    const evidence = String(
      item.evidence || (lenientTypes ? (item.example || item.quote || item.description) : '') || '',
    ).trim();
    patterns.push({
      label,
      type,
      weight: clamp(round(weight, 3), 0, 1),
      evidence,
    });
  }

  const negativeSpace = cleanStringArray(parsed.negativeSpace, CAP_NEGATIVE);
  const structuralSignature = normalizeStructuralSignature(parsed.structuralSignature);
  // avoidedPhrases — מחרוזות ליטרליות שמזינות את blacklist.auto (המיזוג עצמו נעשה
  // אצל הקורא). trim + dedupe + חיתוך לאורך ביטוי סביר.
  const avoidedPhrases = cleanStringArray(
    (Array.isArray(parsed.avoidedPhrases) ? parsed.avoidedPhrases : [])
      .map((v) => String(v || '').trim().slice(0, CAP_AVOIDED_PHRASE_LEN)),
    CAP_AVOIDED_PHRASES,
  );

  // hasMeta — פלט "מטא בלבד" (profileSummary/style/coverPageDefaults, בלי דפוסים) הוא
  // תקין לגמרי: applyExternalPatternAnalyses ממזג אותו לפרופיל. הדגל מפורסם כאן כדי
  // ששער ה-UI לא ידחה אותו כ"לא נקלט כלום" בזמן שהשירות דווקא כן קולט אותו.
  const hasMeta = isPlainObject(parsed.style)
    || isPlainObject(parsed.coverPageDefaults)
    || (typeof parsed.profileSummary === 'string' && parsed.profileSummary.trim().length > 0);

  // topKeys — לדיאגנוסטיקה בלבד (הודעת השגיאה ב-UI מציגה מה כן נמצא בפלט).
  return { patterns, negativeSpace, structuralSignature, avoidedPhrases, hasMeta, topKeys };
}

// ---------- extractQualitativePatterns ----------

// hash דטרמיניסטי (djb2) עבור id יציב מ-label.
const djb2Hex = (str = '') => {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
};

const patternIdForLabel = (label) => `qp_${djb2Hex(normalizeLabel(label))}`;

// ---------- מפתח קנוני חוצה-הרצות (Fix 3) ----------
// מנרמל ביטוי לצורך השוואה: trim, lowercase, כיווץ רווחים.
const normalizePhrase = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

// מחלץ ביטוי בתוך מרכאות (כפולות רגילות / עבריות / “curly” / « »). מחזיר '' אם אין.
const QUOTE_CHARS_RE = /["״„“”«»]/;
const extractQuotedPhrase = (value) => {
  const s = String(value || '');
  const m = s.match(/["״„“”«»]([^"״„“”«»]{2,}?)["״„“”«»]/);
  return m ? m[1].trim() : '';
};

/**
 * מפתח קנוני יציב חוצה-הרצות לדפוס:
 *  - יש ביטוי במרכאות (ב-label או ב-evidence) → הביטוי המנורמל.
 *  - type==='signature_phrase' → label מנורמל.
 *  - אחרת → סט אסימוני-תוכן ממוין (בלי stopwords), מחובר. נפילה ל-label אם ריק.
 * המפתח מבטיח שאותו תופעה תמופה לאותו מפתח גם כשה-LLM מנסח את ה-label אחרת.
 * @param {object} pattern
 * @returns {string}
 */
export function canonicalPatternKey(pattern) {
  const p = isPlainObject(pattern) ? pattern : {};
  const label = String(p.label || '');
  const evidence = String(p.evidence || '');
  const quoted = extractQuotedPhrase(label) || extractQuotedPhrase(evidence);
  if (quoted) return normalizePhrase(quoted);
  if (String(p.type || '') === 'signature_phrase') return normalizePhrase(label);
  const toks = matchWords(label.toLowerCase())
    .filter((t) => t && !STYLE_STOP_WORDS.has(t))
    .sort();
  return toks.length ? toks.join(' ') : normalizePhrase(label);
}

/**
 * קיורציה — מסנן דפוסים שהמשתמש דחה. מחזיר רק דפוסים שה-canonicalPatternKey שלהם
 * *אינו* בקבוצת המפתחות הדחויים. פונקציה טהורה (בונה Set פעם אחת).
 * @param {Array<object>} patterns
 * @param {string[]} rejectedKeys
 * @returns {Array<object>}
 */
export function filterRejectedPatterns(patterns, rejectedKeys) {
  const list = Array.isArray(patterns) ? patterns : [];
  const rejected = new Set(
    (Array.isArray(rejectedKeys) ? rejectedKeys : [])
      .map((k) => String(k || '').trim())
      .filter(Boolean),
  );
  if (!rejected.size) return list.slice();
  return list.filter((p) => !rejected.has(canonicalPatternKey(p)));
}

// אם ל-label יש ביטוי במרכאות — משכתב אותו לתבנית יציבה `ביטוי חוזר: "<ביטוי>"`
// ומסמן signature_phrase. אחרת מחזיר את הדפוס כמות שהוא. דטרמיניסטי → labels זהים בין הרצות.
const canonicalizePatternLabel = (pattern) => {
  if (!isPlainObject(pattern)) return pattern;
  const quoted = extractQuotedPhrase(pattern.label) || extractQuotedPhrase(pattern.evidence);
  if (!quoted) return pattern;
  return { ...pattern, label: `ביטוי חוזר: "${quoted}"`, type: 'signature_phrase' };
};

/**
 * מריץ את חילוץ הדפוסים: בונה פרומפט, קורא ל-invokeModel (async→string),
 * מפענח סובלנית, ומקצה id יציב לכל דפוס (qp_<hash of label>).
 * @param {string[]} excerpts
 * @param {(prompt:string)=>Promise<string>} invokeModel
 * @param {{deep?:boolean}} [opts] deep=true מוסיף את הבלוק העמוק (structuralSignature/avoidedPhrases)
 *   כדי שהמסלול המקומי יחלץ בדיוק כמו המסלול החיצוני.
 * @returns {Promise<{patterns:Array<object>, negativeSpace:string[],
 *   structuralSignature:object, avoidedPhrases:string[]}>}
 */
export async function extractQualitativePatterns(excerpts, invokeModel, opts = {}) {
  const empty = () => ({
    patterns: [], negativeSpace: [], structuralSignature: EMPTY_STRUCTURAL_SIGNATURE(), avoidedPhrases: [],
  });
  if (typeof invokeModel !== 'function') return empty();
  const prompt = buildPatternExtractionPrompt(excerpts, { deep: opts?.deep === true });
  let raw = '';
  try {
    raw = await invokeModel(prompt);
  } catch {
    return empty();
  }
  const parsed = parsePatternExtractionResult(raw);
  const patterns = parsed.patterns.map((rawP) => {
    // Fix 3: משכתב label של ביטוי-מצוטט לתבנית יציבה לפני חישוב id → labels זהים בין הרצות.
    const p = canonicalizePatternLabel(rawP);
    return {
      id: patternIdForLabel(p.label),
      label: p.label,
      type: p.type,
      weight: p.weight,
      ...(p.evidence ? { evidence: p.evidence } : {}),
    };
  });
  return {
    patterns,
    negativeSpace: parsed.negativeSpace,
    structuralSignature: parsed.structuralSignature,
    avoidedPhrases: parsed.avoidedPhrases,
  };
}

// ---------- mergeStructuralSignature ----------

/**
 * A7 — מיזוג פר-מפתח של חתימות מבניות מכמה באטצ'ים/הדבקות. לכל אחד מ-5 המפתחות:
 * ערך קיים ולא-ריק מנצח; רק כשהקיים ריק נלקח הערך הנכנס. בקיפול על כמה מועמדים
 * המנצח הוא הראשון שאינו ריק. מחזיר אובייקט חדש, לעולם לא זורק.
 * @param {any} existing
 * @param {any} incoming
 * @returns {{opening:string, closing:string, thesisPlacement:string, sectionFlow:string, firstPersonUsage:string}}
 */
export function mergeStructuralSignature(existing, incoming) {
  const base = normalizeStructuralSignature(existing);
  const next = normalizeStructuralSignature(incoming);
  const out = EMPTY_STRUCTURAL_SIGNATURE();
  STRUCTURAL_SIGNATURE_KEYS.forEach((k) => {
    out[k] = base[k] || next[k] || '';
  });
  return out;
}

// ---------- mergeQualitativePatterns ----------

/**
 * ממזג existing + incoming, dedupe לפי label מנורמל, על קונפליקט שומר את ה-weight
 * הגבוה, id יציב (של הראשון שנראה), ממוין weight יורד, cap 30.
 * @param {Array<object>} existing
 * @param {Array<object>} incoming
 * @returns {Array<object>}
 */
export function mergeQualitativePatterns(existing, incoming) {
  // Fix 3: dedupe לפי canonicalPatternKey (שוויון מפתח קודם) ואז Jaccard≥0.5 כ-fallback.
  const list = []; // { key, tokens, pattern }

  const findMatch = (key, tokens) => {
    for (let i = 0; i < list.length; i += 1) {
      if (list[i].key === key) return i;
    }
    for (let i = 0; i < list.length; i += 1) {
      if (jaccardSets(tokens, list[i].tokens) >= 0.5) return i;
    }
    return -1;
  };

  const ingest = (arr) => {
    (Array.isArray(arr) ? arr : []).forEach((raw) => {
      if (!isPlainObject(raw)) return;
      const label = String(raw.label || '').trim();
      if (!label) return;
      const weight = clamp(toNum(raw.weight, 0.5), 0, 1);
      const id = String(raw.id || '').trim() || patternIdForLabel(label);
      const type = String(raw.type || 'lexical_habit').trim() || 'lexical_habit';
      const extraFields = {
        ...(raw.evidence ? { evidence: String(raw.evidence).trim().slice(0, 140) } : {}),
        ...(Number.isFinite(Number(raw.frequencyPer100Words)) ? { frequencyPer100Words: round(toNum(raw.frequencyPer100Words), 3) } : {}),
        ...(Number.isFinite(Number(raw.docFraction)) ? { docFraction: round(toNum(raw.docFraction), 3) } : {}),
        ...(Number.isFinite(Number(raw.evidenceCount)) ? { evidenceCount: toNum(raw.evidenceCount) } : {}),
        // E6 — mined:true (מ-mineSignatureNgrams/mineStructuralFormulas) = ground truth
        // דטרמיניסטי ששריד בערבות מהמכסה (ראו reserved-capacity slicing למטה). על קונפליקט,
        // ה-flag "דבק" (once mined, always mined) — גם אם הגרסה המנצחת היא ה-LLM.
        ...(raw.mined === true ? { mined: true } : {}),
        // קיורציה — pinned "דבק" כמו mined: דפוס נעוץ חייב לשרוד את המיזוג/ה-cap.
        ...(raw.pinned === true ? { pinned: true } : {}),
      };
      const pattern = { id, label, type, weight, ...extraFields };
      const key = canonicalPatternKey(pattern);
      const tokens = labelTokenSet(label);
      const mi = findMatch(key, tokens);
      if (mi < 0) {
        list.push({ key, tokens, pattern });
        return;
      }
      // קונפליקט: id יציב מהראשון; שאר השדות מה-weight הגבוה.
      // E6 — mined "דבק": אם אחת הגרסאות (הקיימת או הנכנסת) מקורה בכרייה דטרמיניסטית,
      // התוצאה הממוזגת נשארת mined:true גם אם הגרסה שמנצחת בשדות היא ה-LLM, כי אחרת
      // reserved-capacity ב-cap למטה לא יזהה שהתופעה הזו נכרתה בפועל.
      const cur = list[mi].pattern;
      const stickyMined = cur.mined === true || raw.mined === true;
      const stickyPinned = cur.pinned === true || raw.pinned === true;
      const stickyFlags = { ...(stickyMined ? { mined: true } : {}), ...(stickyPinned ? { pinned: true } : {}) };
      if (weight > cur.weight) {
        list[mi].pattern = { ...cur, label, type, weight, ...extraFields, ...stickyFlags };
      } else if ((stickyMined && cur.mined !== true) || (stickyPinned && cur.pinned !== true)) {
        list[mi].pattern = { ...cur, ...stickyFlags };
      }
    });
  };

  ingest(existing);
  ingest(incoming);

  // מיון: weight יורד; שובר-שוויון — signature_phrase לפני היתר (חתימות מבוצרות לא נופלות מה-cap).
  const sigRank = (p) => (p.type === 'signature_phrase' ? 1 : 0);
  const sortedAll = list
    .map((e) => e.pattern)
    .sort((a, b) => b.weight - a.weight || sigRank(b) - sigRank(a));

  // E6 — reserved capacity: דפוסים ממוינים דטרמיניסטית (mined:true) הם ground truth ואסור
  // שה-cap (30) יפיל אותם רק כי קונצנזוס-LLM "צפוף" יותר במשקלים (ראו E6 finding — "ניתן
  // לראות כי" נעלם מפרופיל אחד בין 2 הרצות, אך לא מהשני, אך ורק בגלל סדר ה-cap). לכן:
  // קודם שומרים את כל הממוינים (עד MINED_RESERVED, לפי weight), ואז ממלאים את היתרה
  // (30-len(mined)) מהיתר לפי אותו מיון weight-יורד הקיים.
  // קיורציה — pinned נחשב כמו mined לצורך שריון: דפוס נעוץ לעולם לא נופל מה-cap.
  const MINED_RESERVED = 18;
  const minedSorted = sortedAll.filter((p) => p.mined === true || p.pinned === true).slice(0, MINED_RESERVED);
  const minedIds = new Set(minedSorted.map((p) => p.id));
  const remainingSlots = Math.max(0, CAP_PATTERNS - minedSorted.length);
  const others = sortedAll.filter((p) => !minedIds.has(p.id)).slice(0, remainingSlots);

  return [...minedSorted, ...others]
    .sort((a, b) => b.weight - a.weight || sigRank(b) - sigRank(a));
}

// ---------- selectRepresentativeExcerpts ----------

/**
 * בוחר קטעים מייצגים ל-LLM call: מעדיף chunks ארוכים, ומקסם גיוון של
 * metricsLite.avgSentenceWords (farthest-point greedy), עד maxCount ו-maxChars.
 * @param {Array<object>} chunks  אובייקטי chunk מ-sample store ({text, wordCount, metricsLite})
 * @param {{maxChars?:number, maxCount?:number}} opts
 * @returns {string[]}  chunk.text
 */
export function selectRepresentativeExcerpts(chunks, { maxChars = 5000, maxCount = 6 } = {}) {
  const pool = (Array.isArray(chunks) ? chunks : [])
    .filter(isPlainObject)
    .map((c) => ({
      text: String(c.text || ''),
      len: String(c.text || '').length,
      avg: toNum(isPlainObject(c.metricsLite) ? c.metricsLite.avgSentenceWords : 0, 0),
    }))
    .filter((c) => c.text.trim().length > 0);

  if (!pool.length || maxCount <= 0 || maxChars <= 0) return [];

  // מעדיפים chunks ארוכים כ-tie-break וכ-seed.
  pool.sort((a, b) => b.len - a.len);

  const selected = [];
  let charTotal = 0;

  // seed: ה-chunk הארוך ביותר (תמיד נכנס לפחות אחד).
  const seed = pool[0];
  selected.push(seed);
  charTotal += seed.len;
  const remaining = pool.slice(1);

  while (selected.length < maxCount && remaining.length) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const cand = remaining[i];
      if (charTotal + cand.len > maxChars) continue;
      // גיוון: המרחק המינימלי של avgSentenceWords מהנבחרים כבר.
      let minDist = Infinity;
      selected.forEach((s) => {
        const d = Math.abs(cand.avg - s.avg);
        if (d < minDist) minDist = d;
      });
      // ניקוד: גיוון עיקרי, אורך כ-tie-break קטן.
      const score = minDist * 1000 + cand.len;
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    if (bestIdx === -1) break; // אף מועמד לא נכנס ל-maxChars
    const picked = remaining.splice(bestIdx, 1)[0];
    selected.push(picked);
    charTotal += picked.len;
  }

  return selected.map((c) => c.text);
}

// ==========================================================================
// E1 — כריית חתימות דטרמיניסטית מקומית + מיזוג קונצנזוס רב-באטצ'
// שתי הפונקציות טהורות ודטרמיניסטיות (בלי Date.now, בלי אקראיות).
// ==========================================================================

// ---------- mineSignatureNgrams ----------

// prefix עברי: תחיליות שכיחות שמנרמלים במילה הראשונה בלבד (longest-match-first).
const HEB_PREFIX_RE = /^(וכש|וש|וב|ול|וה|כש|ש|ו)/;
const stripHebPrefix = (word = '') => word.replace(HEB_PREFIX_RE, '') || word;

// Fix 1: מרקרים פורמליים/פונקציונליים אופייניים לסגנון (לא לנושא). n-gram ייכרה רק אם
// ≥1 מאסימוניו (אחרי הסרת תחילית) שייך לסט הזה — מה שמפיל צירופי-שם נושאיים ("גוש דן")
// אך שומר ביטויי-סגנון ("ניתן לראות כי", "על פי").
const FORMULAIC_MARKERS = new Set([
  'ניתן', 'ראוי', 'חשוב', 'יש', 'אין', 'כי', 'אשר', 'כפי', 'לפי', 'פי', 'על', 'אף',
  'גם', 'רק', 'בין', 'לצד', 'לאור', 'בהתאם', 'מתוך', 'כדי', 'כך', 'לכן', 'אולם', 'אך',
  'כלומר', 'דהיינו', 'כאמור', 'מהווה', 'מהווים', 'מהוות', 'באופן', 'בצורה', 'במידה',
  'ביחס', 'לגבי', 'כלפי', 'עצם', 'בעצם', 'למעשה', 'זאת', 'זו', 'אלו', 'הרי',
]);

// Fix 2: יוניגרמים פורמליים לכרייה נקודתית (n≥2 לא לוכד אותם). label = הצורה הקנונית.
// משפחות למה — מאגד הטיות/תחיליות (מהווה/מהווים/מהוות/ומהווה/שמהווה…) לתחת label אחד יציב.
const FORMULAIC_UNIGRAM_FAMILIES = [
  { label: 'מהווה', re: /^[ושהכבלמ]{0,2}מהוו(ה|ים|ות)$/ },
  { label: 'לפיכך', re: /^ו?לפיכך$/ },
  { label: 'אולם', re: /^ו?אולם$/ },
  { label: 'דהיינו', re: /^ו?דהיינו$/ },
  { label: 'כאמור', re: /^ו?כאמור$/ },
  { label: 'כלומר', re: /^ו?כלומר$/ },
  { label: 'לכאורה', re: /^ו?לכאורה$/ },
  { label: 'אכן', re: /^ו?אכן$/ },
  { label: 'ודוק', re: /^ודוק$/ },
  { label: 'משכך', re: /^ו?משכך$/ },
  { label: 'בבחינת', re: /^בבחינת$/ },
  { label: 'לכשעצמו', re: /^לכשעצמו$/ },
];
const matchUnigramFamily = (token) => {
  const t = String(token || '').toLowerCase();
  for (const fam of FORMULAIC_UNIGRAM_FAMILIES) if (fam.re.test(t)) return fam.label;
  return '';
};
// ספי-כרייה ליוניגרם — כויילו לקורפוס האמיתי (משפחת "מהווה": docFrac≈0.40, freq/100≈0.10-0.21
// לפי מונה-המילים של ה-chunk store). ראו project memory / gate.
const UNIGRAM_MIN_DOC_FRACTION = 0.35;
const UNIGRAM_MIN_FREQ_PER_100 = 0.08;

// ---------- Defect 2 — שערי פיזור-מסמכים ואנטי-נושא ----------
//
// נמדד (33 עבודות, 10.8.26): השער היה `docIds.size < thresholdDocs && count <
// minCount` — כלומר **או**. ביטוי שחזר 8 פעמים בתוך עבודה אחת עבר כ"חתימה
// אישית", והוזרק לכל פרומפט: "כלפי שילוב דת ומדינה" (משקל 0.64, docFraction
// 0.091 — נושא של עבודה יחידה), ומ-mineStructuralFormulas גם 'נוהג לפתוח פסקאות
// ב: "עמדות כלפי שילוב דת"' — שהוא כותרת של עבודה. זהו בדיוק כשל הדליפה שבגללו
// mineFramesFromCorpus כובה לצמיתות. מכאן: פיזור בין מסמכים הוא **תנאי חובה**,
// ו-minCount הוא דרישה **נוספת** ולא חלופה.
const MIN_SIGNATURE_DOCS = 2;      // רצפה מוחלטת — גם בקורפוס זעיר
const MIN_STRUCTURAL_DOCS = 2;
// מילת תוכן שמופיעה בפחות מכך מהמסמכים היא מונח נושאי, לא הרגל ניסוח.
const TOPIC_TOKEN_MIN_DOC_FRACTION = 0.25;
const TOPIC_GATE_MIN_DOCS = 4;     // מתחת לזה השער כבוי (fail-open)

// ביטוי תפעולי של מסמך — לא ניסוח. מועתק מ-PROCEDURAL_OPENER ב-styleOpenerService.js.
const PROCEDURAL_PHRASE_RE = /(?:הצהרת\s*AI|אני\s*מצהיר|נעזרתי\s*ב|בסיוע\s*מודל|בינה\s*מלאכות|שם\s*הקורס|מספר\s*הקורס|תעודת\s*זהות|מגיש[יה]?\s*העבודה|רשימה\s*ביבליוגרפית|הוגש\s*ל)/i;

/**
 * האם הביטוי נושא **תוכן** ולא ניסוח.
 *
 * מותאם מ-isContentBearing ב-styleOpenerService.js (שורות 42-67) — אותה הכרעה
 * בדיוק, שם על פתיחי פסקה וכאן על n-gram כרוי. לא מייבאים משם: styleOpenerService
 * מייבא מ-styleSampleStore/styleProfileService, וייבוא הפוך הוא מעגל.
 *
 * @param {string} label
 * @param {{docFractionOf?:(t:string)=>number, uniqueDocCount?:number,
 *          allowQuotes?:boolean, allowDigits?:boolean, allowLatin?:boolean}} opts
 *   שלושת ה-allow* נועדו לתוויות שמקורן ב-LLM. תווית כרויה **היא** הביטוי עצמו,
 *   ולכן ספרה/לטינית/גרשיים בתוכה הן נתון או שם פרטי; תווית של LLM היא *תיאור*
 *   של הרגל, ובה אותם תווים לגיטימיים ("מציין שנת פרסום בסוגריים (2019)",
 *   "מפנה בסגנון APA"). שער חוסם מדי שם היה מוחק בדיוק את סוגי הדפוסים
 *   citation/argument_move/transition שהמדידה מצאה שחסרים לגמרי.
 */
function isTopicBearingPhrase(label, {
  docFractionOf = null, uniqueDocCount = 0,
  allowQuotes = false, allowDigits = false, allowLatin = false,
} = {}) {
  const s = String(label || '').trim();
  if (!s) return true;
  if (PROCEDURAL_PHRASE_RE.test(s)) return true;
  if (!allowDigits && /\d/.test(s)) return true;       // מספרים = נתון ספציפי
  if (!allowLatin && /[A-Za-z]{3,}/.test(s)) return true; // שם כלי/מוסד לועזי
  if (!allowQuotes && /["'״׳]/.test(s)) return true;   // ציטוט או שם בגרשיים
  // אות עברית בודדת כמילה = ראשי תיבות של שם פרטי בשורת ביבליוגרפיה ("קמה ע").
  if (/(?:^|\s)[֐-׿](?:\s|$)/.test(s)) return true;
  // הכרעה סטטיסטית — התחליף המקומי ל-containsRareToken: מילת תוכן (לא stopword
  // ולא מרקר פורמלי) שמופיעה בקומץ מסמכים היא מונח נושאי. fail-open בקורפוס קטן.
  if (typeof docFractionOf === 'function' && uniqueDocCount >= TOPIC_GATE_MIN_DOCS) {
    const contentTokens = matchWords(s.toLowerCase())
      .map((t) => stripHebPrefix(t))
      .filter((t) => t && !STYLE_STOP_WORDS.has(t) && !FORMULAIC_MARKERS.has(t));
    if (contentTokens.some((t) => docFractionOf(t) < TOPIC_TOKEN_MIN_DOC_FRACTION)) return true;
  }
  return false;
}

/** אינדקס תדירות-מסמכים לכל טוקן (מנורמל תחילית) — הבסיס לשער הסטטיסטי. */
const buildTokenDocFraction = (prepared, uniqueDocCount) => {
  const tokenDocs = new Map();
  prepared.forEach(({ tokens, docId }) => {
    new Set((tokens || []).map((t) => stripHebPrefix(String(t).toLowerCase()))).forEach((t) => {
      let set = tokenDocs.get(t);
      if (!set) { set = new Set(); tokenDocs.set(t, set); }
      set.add(docId);
    });
  });
  return (t) => (tokenDocs.get(t)?.size || 0) / (uniqueDocCount || 1);
};

const isFormulaicNgram = (canonTokens) =>
  (Array.isArray(canonTokens) ? canonTokens : []).some((t) => {
    const lw = String(t || '').toLowerCase();
    return FORMULAIC_MARKERS.has(lw) || FORMULAIC_MARKERS.has(stripHebPrefix(lw));
  });

// מוצא ציטוט ראיה (משפט או חלון ~15 מילים) המכיל את הביטוי, cap 140 תווים.
const findNgramEvidence = (prepared, phrase) => {
  if (!phrase) return '';
  for (const chunk of prepared) {
    const idx = chunk.text.indexOf(phrase);
    if (idx === -1) continue;
    const segs = chunk.text.split(/[.!?\n…]+/).map((s) => s.trim()).filter(Boolean);
    let ev = (segs.find((s) => s.includes(phrase)) || chunk.text).trim();
    if (ev.length > 140) {
      const wIdx = ev.indexOf(phrase);
      const before = ev.slice(0, Math.max(0, wIdx)).split(/\s+/).filter(Boolean).slice(-7).join(' ');
      const after = ev.slice(wIdx + phrase.length).split(/\s+/).filter(Boolean).slice(0, 7).join(' ');
      ev = `${before} ${phrase} ${after}`.trim();
      if (ev.length > 140) ev = ev.slice(0, 140).trim();
    }
    return ev;
  }
  return '';
};

/**
 * כריית ביטויי-חתימה מילוליים מ-chunks — דטרמיניסטית, בלי LLM.
 * מזהה n-gram (2/3/4 מילים) חוזרים, ממזג וריאציות תחיליות עברית, מסנן stopwords/ספרות,
 * מיישם subsumption (מעדיף n-gram ארוך יותר), ומחזיר patterns מסוג signature_phrase.
 * @param {Array<{docId?:string, text?:string, wordCount?:number}>} chunks
 * @param {{minDocFraction?:number, minCount?:number, top?:number, populationNgramFreq?:object}} opts
 *   populationNgramFreq — טבלת תדירויות n-gram באוכלוסייה (ref.ngramFreq). ביטוי נפוץ-
 *   באוכלוסייה = "עברית תקנית" (מוריד דירוג/משקל, demote בטוח). F4: אין יותר boost על
 *   ביטוי נדיר/נעדר — נייטרלי בלבד, כדי לא לנפח חתימות על נתוני bootstrap מנוחשים.
 *   חסר/ריק → התנהגות מקורית (graceful).
 * @returns {Array<object>} patterns {id, label, type, weight, evidence, frequencyPer100Words, docFraction}
 */
export function mineSignatureNgrams(chunks, { minDocFraction = 0.3, minCount = 8, top = 10, populationNgramFreq = null } = {}) {
  const prepared = (Array.isArray(chunks) ? chunks : [])
    .filter(isPlainObject)
    .map((c) => ({
      // Defect 1 — אותו סינון שמוחל במדידה: בלי זה ההצהרה המוסדית על שימוש
      // בבינה מלאכותית היא ביטוי-החתימה מספר 1 של המשתמש (0.95 / docFraction
      // 0.818), וגם "עבודה זו" (0.78) מגיע ממנה. כלל מקל (requireTerminalEnd
      // false) כי chunk נחתך לפי מכסת מילים ולא בהכרח בגבול משפט.
      text: extractAuthorialProseBlocks(stripToText(c.text || ''), { requireTerminalEnd: false }).join('\n\n'),
      docId: String(c.docId || '_orphan'),
    }))
    .filter((c) => c.text)
    .map((c) => ({ ...c, tokens: matchWords(c.text) }))
    .filter((c) => c.tokens.length >= 2);
  if (!prepared.length) return [];

  // ניגוד מול אוכלוסייה: מכפיל-חתימה על משקל+דירוג. ללא נתוני-אוכלוסייה → 1 (graceful).
  // F4 — ה-boost המלאכותי (1.15) בוטל: על נתוני bootstrap מנוחשים אסור להעלות ngram
  // רק כי הוא "נעדר" מהטבלה המנוחשת. נשאר רק ה-demote של boilerplate מוכר-ושכיח
  // באוכלוסייה (0.7) — הוא נשען על רשימה מפורשת ובטוח גם עם bootstrap, לכן אינו
  // מותנה ב-isRealReference.
  const popRef = isPlainObject(populationNgramFreq) ? { ngramFreq: populationNgramFreq } : null;
  const populationSignatureMult = (label, userFreqPer100) => {
    if (!popRef) return 1;
    const popF = getReferenceNgramFreq(popRef, label);
    if (popF <= 0) return 1;                         // לא-מוכר בטבלה → נייטרלי (בלי boost מלאכותי)
    const ratio = toNum(userFreqPer100, 0) / popF;  // <1 = המשתמש מתחת/סביב הנורמה האוכלוסייתית
    if (ratio <= 0.8) return 0.7;                    // מוכר ושכיח באוכלוסייה → boilerplate, demote בטוח
    return 1;                                         // אין boost — מקסימום נייטרלי
  };

  const uniqueDocCount = new Set(prepared.map((c) => c.docId)).size || 1;
  const totalWords = prepared.reduce((s, c) => s + c.tokens.length, 0) || 1;
  const docFractionOf = buildTokenDocFraction(prepared, uniqueDocCount);
  const topicOpts = { docFractionOf, uniqueDocCount };

  const isStop = (t) => STYLE_STOP_WORDS.has(t.toLowerCase());
  const hasDigit = (t) => /[0-9]/.test(t);
  const canonicalize = (gram) => {
    const lower = gram.map((t) => t.toLowerCase());
    return [stripHebPrefix(lower[0]), ...lower.slice(1)];
  };

  // canonKey -> { n, count, docIds:Set, surfaceCounts:Map, canonTokens:[] }
  const entries = new Map();
  prepared.forEach((chunk) => {
    const { tokens, docId } = chunk;
    for (let n = 2; n <= 4; n += 1) {
      for (let i = 0; i + n <= tokens.length; i += 1) {
        const gram = tokens.slice(i, i + n);
        if (gram.some(hasDigit)) continue;
        if (gram.every(isStop)) continue;
        // Fix 2: ביגרם שמתחיל ב"באופן" מטופל כמשפחה מאוחדת בהמשך — לא ככריית n-gram רגילה.
        if (n === 2 && gram[0].toLowerCase() === 'באופן') continue;
        const canonTokens = canonicalize(gram);
        const canonKey = `${n}|${canonTokens.join(' ')}`;
        const surface = gram.join(' ');
        let e = entries.get(canonKey);
        if (!e) {
          e = { n, count: 0, docIds: new Set(), surfaceCounts: new Map(), canonTokens };
          entries.set(canonKey, e);
        }
        e.count += 1;
        e.docIds.add(docId);
        e.surfaceCounts.set(surface, (e.surfaceCounts.get(surface) || 0) + 1);
      }
    }
  });

  // Defect 2 — פיזור בין מסמכים הוא תנאי חובה, עם רצפה מוחלטת של 2 מסמכים.
  const thresholdDocs = Math.max(MIN_SIGNATURE_DOCS, Math.ceil(minDocFraction * uniqueDocCount));
  const qualifying = [];
  entries.forEach((e, key) => {
    // היה `docIds.size < thresholdDocs && count < minCount` (כלומר OR): ביטוי
    // שחזר ≥8 פעמים בעבודה **אחת** נחשב חתימה אישית. עכשיו שתי הדרישות ביחד.
    if (e.docIds.size < thresholdDocs) return;
    if (e.count < minCount) return;
    // Fix 1: מסננים n-gram שאין בו אף מרקר פורמלי — צירוף-שם נושאי טהור (למשל "גוש דן").
    if (!isFormulaicNgram(e.canonTokens)) return;
    // label = surface הכי שכיח (שובר-שוויון לקסיקוגרפי — דטרמיניסטי).
    const surfaces = [...e.surfaceCounts.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const label = surfaces[0][0];
    // Defect 2 — ביטוי שנושא מונח נושאי אינו הרגל סגנון.
    if (isTopicBearingPhrase(label, topicOpts)) return;
    qualifying.push({
      key,
      n: e.n,
      count: e.count,
      docCount: e.docIds.size,
      canonTokens: e.canonTokens,
      label,
    });
  });

  // subsumption: מפילים n-gram קצר המוכל ב-n-gram ארוך יותר עם ≥60% מהספירה שלו.
  const contains = (longTokens, shortTokens) => {
    for (let i = 0; i + shortTokens.length <= longTokens.length; i += 1) {
      let ok = true;
      for (let j = 0; j < shortTokens.length; j += 1) {
        if (longTokens[i + j] !== shortTokens[j]) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  };
  const dropped = new Set();
  qualifying.forEach((s) => {
    qualifying.forEach((l) => {
      if (s === l || l.n <= s.n) return;
      if (l.count >= 0.6 * s.count && contains(l.canonTokens, s.canonTokens)) dropped.add(s.key);
    });
  });

  const patterns = qualifying
    .filter((q) => !dropped.has(q.key))
    .map((q) => {
      const docFractionPct = (q.docCount / uniqueDocCount) * 100;
      const freqPer100 = round((q.count / totalWords) * 100, 3);
      const sigMult = populationSignatureMult(q.label, freqPer100);
      const weight = clamp((0.5 + (0.05 * docFractionPct) / 10 + 0.03 * Math.log(q.count)) * sigMult, 0.5, 0.95);
      return {
        id: `sp_${djb2Hex(q.canonTokens.join(' '))}`,
        label: q.label,
        type: 'signature_phrase',
        weight: round(weight, 3),
        evidence: findNgramEvidence(prepared, q.label),
        frequencyPer100Words: freqPer100,
        docFraction: round(q.docCount / uniqueDocCount, 3),
        mined: true,
        _count: q.count,
        _sigMult: sigMult,
        _key: q.key,
      };
    });

  // Fix 2a: כריית יוניגרמים פורמליים (משפחות למה) — docFraction≥סף ו-freq/100≥סף.
  const uniStats = new Map(); // canonical label -> { count, docIds:Set, bestSurface:Map }
  prepared.forEach(({ tokens, docId }) => {
    tokens.forEach((t) => {
      const label = matchUnigramFamily(t);
      if (!label) return;
      let e = uniStats.get(label);
      if (!e) { e = { count: 0, docIds: new Set(), surfaces: new Map() }; uniStats.set(label, e); }
      e.count += 1;
      e.docIds.add(docId);
      e.surfaces.set(t, (e.surfaces.get(t) || 0) + 1);
    });
  });
  uniStats.forEach((e, word) => {
    const docFraction = e.docIds.size / uniqueDocCount;
    const freqPer100 = (e.count / totalWords) * 100;
    if (docFraction < UNIGRAM_MIN_DOC_FRACTION || freqPer100 < UNIGRAM_MIN_FREQ_PER_100) return;
    // Defect 2 — רצפת פיזור מוחלטת: docFraction לבדו מספיק בקורפוס של 2-3 מסמכים.
    if (e.docIds.size < MIN_SIGNATURE_DOCS) return;
    // evidence — לפי הצורה השכיחה ביותר במשפחה (דטרמיניסטי).
    const topSurface = [...e.surfaces.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0][0];
    const uniFreq = round(freqPer100, 3);
    const sigMult = populationSignatureMult(word, uniFreq);
    const weight = clamp((0.5 + (0.05 * docFraction * 100) / 10 + 0.03 * Math.log(e.count)) * sigMult, 0.5, 0.95);
    patterns.push({
      id: `sp_${djb2Hex(word)}`,
      label: word,
      type: 'signature_phrase',
      weight: round(weight, 3),
      evidence: findNgramEvidence(prepared, topSurface) || findNgramEvidence(prepared, word),
      frequencyPer100Words: uniFreq,
      docFraction: round(docFraction, 3),
      mined: true,
      _count: e.count,
      _sigMult: sigMult,
      _key: `1|${word}`,
    });
  });

  // Fix 2b: משפחת "באופן + תואר" — דפוס קנוני יחיד; count = סכום כל הווריאציות,
  // evidence = הווריאציה השכיחה ביותר בהקשר.
  const baofen = { count: 0, docIds: new Set(), variants: new Map() };
  prepared.forEach(({ tokens, docId }) => {
    for (let i = 0; i + 2 <= tokens.length; i += 1) {
      if (tokens[i].toLowerCase() !== 'באופן') continue;
      const surface = `${tokens[i]} ${tokens[i + 1]}`;
      baofen.count += 1;
      baofen.docIds.add(docId);
      baofen.variants.set(surface, (baofen.variants.get(surface) || 0) + 1);
    }
  });
  // Defect 2 — היה OR מפורש. עכשיו שני התנאים ביחד (ר' ההערה בשער ה-n-gram).
  if (baofen.count > 0 && baofen.docIds.size >= thresholdDocs && baofen.count >= minCount) {
    const topVariant = [...baofen.variants.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0][0];
    const docFraction = baofen.docIds.size / uniqueDocCount;
    const baofenFreq = round((baofen.count / totalWords) * 100, 3);
    const sigMult = populationSignatureMult('באופן + תואר', baofenFreq);
    const weight = clamp((0.5 + (0.05 * docFraction * 100) / 10 + 0.03 * Math.log(baofen.count)) * sigMult, 0.5, 0.95);
    patterns.push({
      id: 'sp_baofen_toar',
      label: 'באופן + תואר',
      type: 'signature_phrase',
      weight: round(weight, 3),
      evidence: findNgramEvidence(prepared, topVariant),
      frequencyPer100Words: baofenFreq,
      docFraction: round(docFraction, 3),
      mined: true,
      _count: baofen.count,
      _sigMult: sigMult,
      _key: '2|באופן + תואר',
    });
  }

  // מיון לפי ספירה משוקללת-חתימה (count × מכפיל-אוכלוסייה): ביטוי נדיר-באוכלוסייה עולה,
  // ביטוי "תקני" יורד. ללא נתוני-אוכלוסייה כל המכפילים=1 → זהה למיון המקורי לפי _count.
  patterns.sort((a, b) =>
    (b._count * (b._sigMult || 1)) - (a._count * (a._sigMult || 1))
    || (a._key < b._key ? -1 : a._key > b._key ? 1 : 0));
  return patterns
    // Defect 2 — דפוס בלי ראיה לא נפלט. נמדד: "יותר כך" (משקל 0.64) הוזרק עם
    // evidence: undefined — כלומר n-gram מרוסק שאיש לא יכול לאמת.
    .filter((p) => String(p.evidence || '').trim())
    .slice(0, Math.max(0, top))
    .map(({ _count, _key, _sigMult, ...p }) => p);
}

// ---------- mineStructuralFormulas ----------

/**
 * כריית "נוסחאות מבניות" — n-gram חוזרים בפתיחי/סיומי פסקאות (המשפט הראשון/אחרון
 * בכל פסקה). דטרמיניסטית, בלי LLM. משתמשת באותה תשתית-כרייה (מרקרים פורמליים,
 * נרמול תחילית עברית, subsumption) כמו mineSignatureNgrams, אך ממוקדת בשני
 * קורפוסים נפרדים (פתיחים/סוגרים) במקום בטקסט השלם.
 * @param {Array<{docId?:string, text?:string}>} chunks
 * @param {{top?:number}} opts
 * @returns {Array<object>} patterns {id, label, type:'structure', weight, evidence}
 */
export function mineStructuralFormulas(chunks, { top = 6 } = {}) {
  const docs = (Array.isArray(chunks) ? chunks : [])
    .filter(isPlainObject)
    // Defect 1 — פרוזה אוטוריאלית בלבד: שורת שער או שורת ביבליוגרפיה שנחשבה
    // "פסקה" תרמה כאן פתיח פסקה מזויף.
    .map((c) => ({
      text: extractAuthorialProseBlocks(stripToText(c.text || ''), { requireTerminalEnd: false }).join('\n\n'),
      docId: String(c.docId || '_orphan'),
    }))
    .filter((c) => c.text);
  if (!docs.length) return [];

  // לכל פסקה: המשפט הראשון → קורפוס פתיחים; המשפט האחרון (אם יש >1 משפט) → קורפוס סוגרים.
  const openers = [];
  const closers = [];
  docs.forEach(({ text, docId }) => {
    const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    paragraphs.forEach((p) => {
      const sentences = p.split(/[.!?…]+/).map((s) => s.trim()).filter(Boolean);
      if (!sentences.length) return;
      openers.push({ text: sentences[0], docId });
      if (sentences.length > 1) closers.push({ text: sentences[sentences.length - 1], docId });
    });
  });

  // כרייה זהה ל-mineSignatureNgrams (חלון n-gram 2-4, מרקר פורמלי, subsumption),
  // ממוקדת קורפוס נתון, בסף qualifying מקל יותר (docFraction≥0.25 / count≥5).
  const mineCorpus = (corpus) => {
    const prepared = corpus
      .map((c) => ({ text: c.text, docId: c.docId, tokens: matchWords(c.text) }))
      .filter((c) => c.tokens.length >= 2);
    if (!prepared.length) return [];

    const uniqueDocCount = new Set(prepared.map((c) => c.docId)).size || 1;
    const docFractionOf = buildTokenDocFraction(prepared, uniqueDocCount);
    const isStop = (t) => STYLE_STOP_WORDS.has(t.toLowerCase());
    const hasDigit = (t) => /[0-9]/.test(t);
    const canonicalize = (gram) => {
      const lower = gram.map((t) => t.toLowerCase());
      return [stripHebPrefix(lower[0]), ...lower.slice(1)];
    };

    const entries = new Map();
    prepared.forEach((chunk) => {
      const { tokens, docId } = chunk;
      for (let n = 2; n <= 4; n += 1) {
        for (let i = 0; i + n <= tokens.length; i += 1) {
          const gram = tokens.slice(i, i + n);
          if (gram.some(hasDigit)) continue;
          if (gram.every(isStop)) continue;
          const canonTokens = canonicalize(gram);
          const canonKey = `${n}|${canonTokens.join(' ')}`;
          const surface = gram.join(' ');
          let e = entries.get(canonKey);
          if (!e) {
            e = { n, count: 0, docIds: new Set(), surfaceCounts: new Map(), canonTokens };
            entries.set(canonKey, e);
          }
          e.count += 1;
          e.docIds.add(docId);
          e.surfaceCounts.set(surface, (e.surfaceCounts.get(surface) || 0) + 1);
        }
      }
    });

    const qualifying = [];
    entries.forEach((e, key) => {
      const docFraction = e.docIds.size / uniqueDocCount;
      // Defect 2 — היה `docFraction < 0.25 && count < 5` (OR): כותרת של עבודה
      // אחת שחזרה בפתיחי הפסקאות שלה יצרה 'נוהג לפתוח פסקאות ב: "עמדות כלפי
      // שילוב דת"'. עכשיו פיזור בין מסמכים חובה, וגם ספירה, וגם רצפה של 2.
      if (e.docIds.size < MIN_STRUCTURAL_DOCS) return;
      if (docFraction < 0.25) return;
      if (e.count < 5) return;
      if (!isFormulaicNgram(e.canonTokens)) return;
      const surfaces = [...e.surfaceCounts.entries()]
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      const label = surfaces[0][0];
      if (isTopicBearingPhrase(label, { docFractionOf, uniqueDocCount })) return;
      qualifying.push({
        key,
        n: e.n,
        count: e.count,
        docCount: e.docIds.size,
        docFraction,
        canonTokens: e.canonTokens,
        label,
      });
    });

    const contains = (longTokens, shortTokens) => {
      for (let i = 0; i + shortTokens.length <= longTokens.length; i += 1) {
        let ok = true;
        for (let j = 0; j < shortTokens.length; j += 1) {
          if (longTokens[i + j] !== shortTokens[j]) { ok = false; break; }
        }
        if (ok) return true;
      }
      return false;
    };
    const dropped = new Set();
    qualifying.forEach((s) => {
      qualifying.forEach((l) => {
        if (s === l || l.n <= s.n) return;
        if (l.count >= 0.6 * s.count && contains(l.canonTokens, s.canonTokens)) dropped.add(s.key);
      });
    });

    return qualifying
      .filter((q) => !dropped.has(q.key))
      .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  };

  const findEvidence = (corpus, phrase) => {
    const hit = corpus.find((c) => c.text.includes(phrase));
    return hit ? hit.text.slice(0, 140) : '';
  };

  const openerPatterns = mineCorpus(openers).map((q) => ({
    id: `sf_open_${djb2Hex(q.canonTokens.join(' '))}`,
    label: `נוהג לפתוח פסקאות ב: "${q.label}"`,
    type: 'structure',
    weight: 0.6,
    evidence: findEvidence(openers, q.label),
    mined: true,
    _count: q.count,
  }));
  const closerPatterns = mineCorpus(closers).map((q) => ({
    id: `sf_close_${djb2Hex(q.canonTokens.join(' '))}`,
    label: `נוהג לסגור פסקאות ב: "${q.label}"`,
    type: 'structure',
    weight: 0.6,
    evidence: findEvidence(closers, q.label),
    mined: true,
    _count: q.count,
  }));

  return [...openerPatterns, ...closerPatterns]
    // Defect 2 — נוסחה בלי ראיה לא נפלטת (ר' אותה הערה ב-mineSignatureNgrams).
    .filter((p) => String(p.evidence || '').trim())
    .sort((a, b) => b._count - a._count)
    .slice(0, Math.max(0, top))
    .map(({ _count, ...p }) => p);
}

// ---------- consensusMergePatterns ----------

// אסימוני label לחישוב Jaccard (עברית + אנגלית, lowercase).
const labelTokenSet = (label) => new Set(matchWords(String(label || '').toLowerCase()).filter(Boolean));
const jaccardSets = (a, b) => {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  a.forEach((t) => { if (b.has(t)) inter += 1; });
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
};

// ---------- Defect 3 — חזרה בין באטצ'ים מחזקת ביטחון, ואינה תנאי הישרדות ----------
//
// נמדד על הרצה אמיתית (33 עבודות, 8 באטצ'ים, llmBatchesFailed=0, 10.8.26): מתוך
// 12 הדפוסים הסופיים **11 היו mined דטרמיניסטיים**, והיחיד מה-LLM ששרד היה זבל
// ('ביטוי חוזר: "כוכבית"' עם ראיה מטבלת SWOT). שלושת הסוגים החדשים —
// citation / argument_move / transition — החזירו **0 כל אחד**, למרות שהפרומפט
// מבקש אותם והמודל ענה. הסיבה מבנית ולא איכותית: כל באטץ' הוא פרוסה של ~5,000
// תווים ממסמכים **אחרים**, המודל מנסח את אותו הרגל אחרת בכל פרוסה,
// canonicalPatternKey לא מתלכד, והפילטר מחק את כל שכבת ה-LLM.
//
// לכן: קלאסטר שנצפה ב-≥2 באטצ'ים מקבל את הטיפול הקיים (boost + crossValidated);
// קלאסטר של באטץ' יחיד שורד ב**משקל מופחת** ורק אם עבר שערי איכות. התקרה
// מונעת מהם להציף — הדפוסים הדטרמיניסטיים נשארים ground truth (ההגנה עצמה
// יושבת ב-mergeQualitativePatterns: MINED_RESERVED).
const CONSENSUS_SINGLE_BATCH_MULT = 0.6;   // היה 0.5 למחוקים-ממילא; 0.6 = "נכנס אך חלש"
const CONSENSUS_SINGLE_BATCH_CAP = 6;      // מקסימום ניצולי-באטץ'-יחיד בפלט

// תצפית גנרית על עברית אקדמית אינה הרגל אישי. הפרומפט כבר אוסר על זה במפורש —
// זהו השער שמאכף אותו בפועל על ניצולי באטץ' יחיד.
const GENERIC_STYLE_OBSERVATION_RE = /(?:משפטים\s+(?:ארוכים|מורכבים)|שפה\s+(?:פורמלית|אקדמית|רהוטה)|כתיבה\s+(?:פורמלית|אקדמית|מובנית|בהירה)|מונחים\s+(?:מקצועיים|אקדמיים)|אוצר\s+מילים\s+עשיר|מבנה\s+(?:לוגי|מסודר|ברור)|עברית\s+תקנית|פיסוק\s+תקין|טון\s+(?:אובייקטיבי|ענייני|נייטרלי))/;

// ארטיפקטים של חילוץ/פריסה — לא סגנון. נמדד: 'ביטוי חוזר: "כוכבית"' (הדפוס
// היחיד מה-LLM ששרד את הקונצנזוס הישן) נשען על תו תבליט בטבלת SWOT.
const LAYOUT_ARTIFACT_RE = /(?:כוכבית|תבליט|בולט(?:ים)?\s|טבלה|עמודה|שורת\s+טבלה|קו\s+תחתון|רווח\s+כפול|מספור\s+אוטומטי)/;

/**
 * שער איכות לדפוס שמקורו ב-LLM.
 * ראיה ריקה, תצפית גנרית, ארטיפקט פריסה או ביטוי תפעולי — לא נכנסים.
 *
 * ⚠️ השער מוחל על **כל** דפוסי הקונצנזוס ולא רק על ניצולי באטץ' יחיד, ובכוונה:
 * הדפוס היחיד מה-LLM ששרד את הקונצנזוס הישן בהרצה האמיתית היה
 * 'ביטוי חוזר: "כוכבית"' — והוא שרד דווקא מפני שנצפה בכמה באטצ'ים. חזרה
 * מאשרת שהמודל עקבי, לא שהתצפית מועילה.
 */
const passesPatternQualityGate = (p) => {
  if (!String(p.evidence || '').trim()) return false;
  const label = String(p.label || '');
  if (GENERIC_STYLE_OBSERVATION_RE.test(label)) return false;
  if (LAYOUT_ARTIFACT_RE.test(label)) return false;
  return !isTopicBearingPhrase(label, { allowQuotes: true, allowDigits: true, allowLatin: true });
};

/**
 * ממזג תוצאות חילוץ מכמה באטצ'ים לקונצנזוס. מקבץ patterns לפי דמיון-label (Jaccard≥0.5).
 * batchCount ≤1 → אין מידע חוצה-באטצ'ים כלל: כל דפוס נכנס במשקל*0.5 (התנהגות
 *   קודמת) אך רק אם עבר את שער האיכות; crossValidated=false.
 * batchCount ≥2 → קלאסטר שנצפה ב-≥threshold באטצ'ים מקבל boost; קלאסטר של באטץ'
 *   יחיד שורד במשקל*CONSENSUS_SINGLE_BATCH_MULT, בכפוף לשער האיכות ולתקרה.
 * crossValidated = לפחות קלאסטר אחד הופיע בשני באטצ'ים או יותר (ולא "רצנו יותר
 * מבאטץ' אחד" — שזה מה שהשדה סימן קודם).
 * @param {Array<{patterns:Array, negativeSpace:Array}>} batchResults
 * @param {{batchCount?:number}} opts
 * @returns {{patterns:Array<object>, negativeSpace:string[], crossValidated:boolean}}
 */
export function consensusMergePatterns(batchResults, { batchCount } = {}) {
  const results = (Array.isArray(batchResults) ? batchResults : []).filter(isPlainObject);
  const bc = Number.isFinite(Number(batchCount)) ? Number(batchCount) : results.length;

  const items = [];
  results.forEach((r, bi) => {
    (Array.isArray(r.patterns) ? r.patterns : []).forEach((p) => {
      if (!isPlainObject(p)) return;
      const label = String(p.label || '').trim();
      if (!label) return;
      items.push({
        label,
        type: String(p.type || 'lexical_habit').trim() || 'lexical_habit',
        weight: clamp(toNum(p.weight, 0.5), 0, 1),
        evidence: String(p.evidence || '').trim(),
        id: String(p.id || '').trim(),
        batch: bi,
        tokens: labelTokenSet(label),
        key: canonicalPatternKey(p), // Fix 3: מפתח קנוני חוצה-הרצות
      });
    });
  });

  // Fix 3: קיבוץ לפי שוויון-מפתח-קנוני קודם, ואז Jaccard≥0.5 כ-fallback.
  const clusters = [];
  items.forEach((it) => {
    let target = null;
    for (const cl of clusters) {
      if (cl.key && it.key && cl.key === it.key) { target = cl; break; }
    }
    if (!target) {
      for (const cl of clusters) {
        if (jaccardSets(it.tokens, cl.repTokens) >= 0.5) { target = cl; break; }
      }
    }
    if (!target) {
      target = { key: it.key, repTokens: it.tokens, members: [], batches: new Set() };
      clusters.push(target);
    }
    target.members.push(it);
    target.batches.add(it.batch);
  });

  // Defect 3 — שני מסלולים במקום מסלול-הישרדות אחד.
  const bcSafe = Math.max(1, bc);
  // סף "אושר בכמה באטצ'ים". נשמר כפי שהיה (max(2, 20% מהבאטצ'ים)) — רק שכעת אי-
  // עמידה בו אינה מחיקה אלא הפחתת משקל.
  const confirmBar = Math.max(2, Math.ceil(bcSafe * 0.2));
  // ⚠️ Fix 3 הישן הפיל כל קלאסטר מתחת ל-max(2, 30% מהבאטצ'ים) בגלל churn בין
  // הרצות. ה-churn אמיתי — ולכן הוא מטופל כאן בהפחתת משקל ובתקרה, ולא בהשמדה
  // של כל שכבת ה-LLM (ר' המדידה שבראש הסקשן: 11/12 mined, 0 citation/transition).

  const scored = clusters.map((cl) => {
    const membersByWeight = [...cl.members].sort(
      (a, b) => b.weight - a.weight || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0),
    );
    const rep = membersByWeight[0];
    const batchesSeen = cl.batches.size;
    const confirmed = bcSafe >= 2 && batchesSeen >= confirmBar;
    const weight = confirmed
      ? Math.min(0.95, rep.weight + 0.1 * (batchesSeen - 1))
      : rep.weight * (bcSafe >= 2 ? CONSENSUS_SINGLE_BATCH_MULT : 0.5);
    const evidence = (membersByWeight.find((m) => m.evidence) || {}).evidence || '';
    return {
      pattern: {
        id: rep.id || patternIdForLabel(rep.label),
        label: rep.label,
        type: rep.type,
        weight: round(clamp(weight, 0, 1), 3),
        ...(evidence ? { evidence: evidence.slice(0, 140) } : {}),
        evidenceCount: batchesSeen,
        ...(confirmed ? { crossValidated: true } : {}),
      },
      confirmed,
    };
  });

  const byWeightThenLabel = (a, b) =>
    b.weight - a.weight || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);

  const confirmedPatterns = scored
    .filter((s) => s.confirmed)
    .map((s) => s.pattern)
    .filter(passesPatternQualityGate);
  // ניצולי באטץ' יחיד: אותו שער איכות, ואז תקרה — החלשים נופלים ראשונים.
  const singleCap = bcSafe >= 2 ? CONSENSUS_SINGLE_BATCH_CAP : CAP_PATTERNS;
  const singlePatterns = scored
    .filter((s) => !s.confirmed)
    .map((s) => s.pattern)
    .filter(passesPatternQualityGate)
    .sort(byWeightThenLabel)
    .slice(0, singleCap);

  const patterns = [...confirmedPatterns, ...singlePatterns];
  patterns.sort(byWeightThenLabel);

  // negativeSpace: dedupe לפי Jaccard≥0.5, שומר את הניסוח הקצר יותר.
  const negClusters = [];
  results.forEach((r) => {
    (Array.isArray(r.negativeSpace) ? r.negativeSpace : []).forEach((s) => {
      const str = String(s || '').trim();
      if (!str) return;
      const tokens = labelTokenSet(str);
      let target = null;
      for (const cl of negClusters) {
        if (jaccardSets(tokens, cl.tokens) >= 0.5) { target = cl; break; }
      }
      if (!target) negClusters.push({ tokens, rep: str });
      else if (str.length < target.rep.length) target.rep = str;
    });
  });

  // Defect 3 — המשמעות: "לפחות דפוס אחד אושר בשני באטצ'ים או יותר". קודם השדה
  // היה `bc >= 3`, כלומר "רצנו מספיק באטצ'ים" — הוא דיווח אימות-צולב גם כשאף
  // דפוס לא חזר על עצמו אפילו פעם אחת. הוא מזין בונוס ודאות ב-recomputeConfidence,
  // ולכן הדיווח השגוי ניפח את הציון.
  const crossValidated = bcSafe >= 2 && scored.some((s) => s.confirmed);

  return {
    patterns: patterns.slice(0, CAP_PATTERNS),
    negativeSpace: cleanStringArray(negClusters.map((c) => c.rep), CAP_NEGATIVE),
    crossValidated,
  };
}
