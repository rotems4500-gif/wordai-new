// ============================================================================
// tools/style-reference-build/lib.mjs
//
// פורט טהור (ESM, בלי תלויות דפדפן) של computeLocalMetrics מ-
// src/services/styleProfileService.js:125-270, + עזרי אגרגציה (mean/std על פני
// מסמכים) וכריית n-grams בסיסית. משמש רק את build.mjs — לא רץ בזמן ריצה של
// האפליקציה.
//
// חשוב: הלוגיקה כאן צריכה להישאר *זהה בהתנהגותה* למקור ב-styleProfileService.js.
// אם מדדים שם משתנים, יש לעדכן כאן בהתאם (ואת רשימת המדדים ב-
// src/services/styleReferenceCorpus.data.js).
// ============================================================================

// ---------------------------------------------------------------------------
// קבועים (משוכפלים במכוון מ-styleProfileService.js, ראו הערה שם על טוהר המודול)
// ---------------------------------------------------------------------------

// מרקרים דיבוריים לזיהוי שבירת רגיסטר (הוריסטיקה לכל פסקה).
export const REGISTER_SHIFT_MARKERS = [
  'אודה ואומר', 'בכנות', 'האמת', 'פשוט', 'ממש', 'דווקא', 'בקיצור',
  'לא יאומן', 'גילוי נאות',
];

// לקסיקון מילות קישור מורחב — לצורך connectorFrequency (מידע נלווה, לא בשימוש
// ישיר ע"י styleReferenceService, אך נשמר לצורך נאמנות לפורט המקורי).
export const STYLE_CONNECTORS = [
  'לכן', 'בנוסף', 'עם זאת', 'עם-זאת', 'כמו כן', 'לעומת זאת', 'עם-כן',
  'כלומר', 'למעשה', 'בהתאם לכך', 'בסופו של דבר',
  'בכך', 'כתוצאה מכך', 'מאידך', 'מחד', 'מצד אחד', 'מצד שני', 'כפי ש',
  'אולם', 'אך', 'יתרה מכך', 'יתר על כן', 'לפיכך', 'משום כך', 'זאת ועוד',
  'על כן', 'אף על פי כן', 'ואילו', 'לבסוף', 'ראשית', 'שנית',
];

// stopwords מינימלית — לשימוש בסינון n-grams (לא לצורך computeLocalMetrics עצמו).
export const STOP_WORDS = new Set([
  'של', 'על', 'עם', 'זה', 'זאת', 'היא', 'הוא', 'הם', 'הן', 'אני', 'אתה', 'את',
  'אנחנו', 'גם', 'אבל', 'או', 'אם', 'כי', 'כל', 'לא', 'כן', 'כך', 'מאוד', 'עוד',
  'רק', 'כדי', 'היה', 'היו', 'יש', 'אין', 'אל', 'מן', 'אלו', 'אלה', 'אשר', 'כאשר',
  'בין', 'לפי', 'תוך', 'אצל', 'מתוך', 'בו', 'בה', 'בהם', 'הזה', 'הזאת',
]);

// ---------------------------------------------------------------------------
// עזרי בסיס (זהים ל-styleProfileService.js)
// ---------------------------------------------------------------------------
const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};
const nowTs = () => Date.now();

const stripToText = (input = '') => String(input || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/[\r\t]+/g, ' ')
  .replace(/ /g, ' ')
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

// ---------------------------------------------------------------------------
// computeLocalMetrics — פורט טהור של styleProfileService.js:125-270
// ---------------------------------------------------------------------------
/**
 * מחשב מדדי סגנון מקומיים מטקסט יחיד. מחזיר null אם פחות מ-25 מילים.
 * @param {string} text
 * @returns {object|null}
 */
export function computeLocalMetrics(text) {
  const clean = stripToText(text);
  if (!clean) return null;

  const allWords = matchWords(clean);
  const wordCount = allWords.length;
  if (wordCount < 25) return null;

  let paragraphs = clean.split(/\n{2,}|\r\n\r\n/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length <= 1) {
    const single = clean.split(/\n+/).map((p) => p.trim()).filter(Boolean);
    if (single.length > paragraphs.length) paragraphs = single;
  }
  if (!paragraphs.length) paragraphs = [clean];

  const sentences = clean.split(/[.!?…]+/).map((s) => s.trim()).filter(Boolean);
  const sentenceCount = sentences.length;
  const paragraphCount = paragraphs.length;

  const sentenceWordCounts = [];
  let totalCommasInSentences = 0;
  let shortSentences = 0;
  let longSentences = 0;
  let oneWordSentences = 0;

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

  const ttrWords = allWords
    .map((w) => w.replace(/^["'׳״-]+|["'׳״-]+$/g, '').toLowerCase())
    .filter((w) => w.length >= 2)
    .slice(0, 800);
  const typeTokenRatio = ttrWords.length ? round(new Set(ttrWords).size / ttrWords.length, 3) : 0;

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

// רשימת המדדים הסקלריים שנכנסים ל-global.<metric> של styleReferenceCorpus.data.js
// (תואם STYLE_REFERENCE.global ב-src/services/styleReferenceCorpus.data.js).
export const REFERENCE_METRIC_KEYS = [
  'avgSentenceWords',
  'sentenceLengthCV',
  'avgCommasPerSentence',
  'parenthesesDensity',
  'typeTokenRatio',
  'avgParagraphWords',
  'openerRepetitionRate',
  'pctShortSentences',
  'pctLongSentences',
  'oneWordSentenceRate',
  'rhetoricalQuestionRate',
  'exclamationRate',
  'registerShiftRate',
];

// ---------------------------------------------------------------------------
// aggregate — mean/std לכל מדד, על פני מסמכי הקורפוס
// ---------------------------------------------------------------------------
/**
 * מקבל מערך של תוצאות computeLocalMetrics (לא-null) ומחזיר
 * { metricKey: { mean, std } } לכל מדד ב-REFERENCE_METRIC_KEYS.
 * @param {object[]} docMetricsList
 * @returns {object}
 */
export function aggregateReferenceDistribution(docMetricsList) {
  const list = (docMetricsList || []).filter(Boolean);
  const out = {};
  for (const key of REFERENCE_METRIC_KEYS) {
    const values = list
      .map((m) => Number(m[key]))
      .filter((v) => Number.isFinite(v));
    out[key] = {
      mean: round(mean(values), 4),
      std: round(stdDev(values), 4),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// mineNgrams — כריית n-grams בסיסית (freqPer100Words) על פני הקורפוס כולו
// ---------------------------------------------------------------------------
/**
 * סורק את כל הטקסטים, בונה n-grams רציפים (מילים סמוכות) בגדלים שב-sizes,
 * סופר מופעים גולמיים, ומחזיר את ה-topN התדירים ביותר כ-freqPer100Words
 * (מספר מופעים / סך המילים בקורפוס * 100). מסנן n-grams שכל מיליהם stopwords
 * בלבד (לא אינפורמטיביים) ו-n-grams עם ספירה נמוכה מ-minCount.
 *
 * ⚠️ minDocFraction — שער **פיזור בין מסמכים**, לא רק תדירות. הטבלה הזו אמורה
 * לתאר ביטוי שכיח *באוכלוסייה*, אבל ספירה גולמית מדרגת גבוה כל צירוף-נושא
 * שחוזר מאה פעם במסמך אחד. נמדד בבנייה הראשונה על קורפוס אמיתי: הטבלה התמלאה
 * ב"מוגבלות שכלית"/"חיילים עם מוגבלות" (מאמר יחיד) וב-"jstor org terms"/
 * "this content" (כותרת תחתונה של JSTOR ב-3 מסמכים). הדרישה שהגרם יופיע
 * בשבריר מינימלי מהמסמכים מנקה את שניהם בלי רשימת-חריגים ידנית.
 *
 * @param {string[]} texts
 * @param {{sizes?:number[], topN?:number, minCount?:number, minDocFraction?:number}} [opts]
 * @returns {Record<string, number>}
 */
export function mineNgrams(texts, opts = {}) {
  const sizes = opts.sizes || [2, 3];
  const topN = opts.topN || 30;
  const minCount = opts.minCount || 3;
  const minDocFraction = Number.isFinite(opts.minDocFraction) ? opts.minDocFraction : 0;

  const counts = new Map();
  const docFreq = new Map();
  let totalWords = 0;
  let docCount = 0;

  for (const text of texts || []) {
    const clean = stripToText(text);
    if (!clean) continue;
    docCount += 1;
    const words = matchWords(clean).map((w) => w.toLowerCase());
    totalWords += words.length;

    const seenInDoc = new Set();
    for (const size of sizes) {
      for (let i = 0; i + size <= words.length; i++) {
        const gram = words.slice(i, i + size);
        // מסנן n-grams שכולם stopwords (לא אינפורמטיביים כביטוי סגנוני)
        if (gram.every((w) => STOP_WORDS.has(w))) continue;
        const key = gram.join(' ');
        counts.set(key, (counts.get(key) || 0) + 1);
        if (!seenInDoc.has(key)) {
          seenInDoc.add(key);
          docFreq.set(key, (docFreq.get(key) || 0) + 1);
        }
      }
    }
  }

  if (!totalWords) return {};

  const minDocs = minDocFraction > 0 ? Math.max(2, Math.ceil(docCount * minDocFraction)) : 0;

  const ranked = [...counts.entries()]
    .filter(([gram, count]) => count >= minCount && (docFreq.get(gram) || 0) >= minDocs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);

  const out = {};
  for (const [gram, count] of ranked) {
    out[gram] = round((count / totalWords) * 100, 4);
  }
  return out;
}
