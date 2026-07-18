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

// ---------- computeLocalMetrics ----------

/**
 * מחשב מדדי סגנון מקומיים (חינם, עברית-aware) מטקסט יחיד.
 * מחזיר null אם פחות מ-25 מילים (מקביל ל-guard של styleAuthenticityService).
 * @param {string} text
 * @returns {object|null}
 */
export function computeLocalMetrics(text) {
  const clean = stripToText(text);
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
  };
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
    extractionMeta: isPlainObject(src.extractionMeta)
      ? {
          batches: Math.max(0, Math.round(toNum(src.extractionMeta.batches, 0))),
          crossValidated: src.extractionMeta.crossValidated === true,
          minedSignatures: Math.max(0, Math.round(toNum(src.extractionMeta.minedSignatures, 0))),
          at: Math.max(0, Math.round(toNum(src.extractionMeta.at, 0))),
          llmBatchesFailed: Math.max(0, Math.round(toNum(src.extractionMeta.llmBatchesFailed, 0))),
          genreClassificationFailed: src.extractionMeta.genreClassificationFailed === true,
        }
      : {},
  };
}

// ---------- recomputeConfidence ----------

/**
 * מחשב ודאות פרופיל 0-100 מ-docCount + wordCount + יציבות מדדים.
 * level: low (<3 מסמכים), medium (3-15), high (>15).
 * @param {object} styleEngine
 * @returns {{score:number, docCount:number, wordCount:number, level:string}}
 */
export function recomputeConfidence(styleEngine) {
  const se = isPlainObject(styleEngine) ? styleEngine : {};
  const conf = isPlainObject(se.confidence) ? se.confidence : {};
  const docCount = Math.max(0, Math.round(toNum(conf.docCount, 0)));
  const wordCount = Math.max(0, Math.round(toNum(conf.wordCount, 0)));

  const base = Math.min(60, docCount * 8);
  const wordBonus = Math.min(25, wordCount / 2000);

  // בונוס יציבות: CV נמוך של המדדים בין מסמכים → יותר. עד 15.
  const spread = isPlainObject(se.metricsSpread) ? se.metricsSpread : {};
  const cvs = ['avgSentenceWords', 'sentenceLengthCV', 'avgParagraphWords']
    .map((k) => toNum(spread[k]?.cv, NaN))
    .filter((v) => Number.isFinite(v));
  let stabilityBonus = 0;
  if (docCount >= 2 && cvs.length) {
    const avgCv = mean(cvs);
    // CV 0 → בונוס מלא (15); CV ≥0.5 → 0.
    stabilityBonus = clamp((0.5 - avgCv) / 0.5, 0, 1) * 15;
  }

  // בונוס יציבות חילוץ: אם הדפוסים אומתו בין באטצ'ים (consensus) — +5.
  const em = isPlainObject(se.extractionMeta) ? se.extractionMeta : {};
  const crossValidatedBonus = em.crossValidated === true ? 5 : 0;

  const score = clamp(Math.round(base + wordBonus + stabilityBonus) + crossValidatedBonus, 0, 100);
  const level = docCount < 3 ? 'low' : docCount <= 15 ? 'medium' : 'high';

  return { score, docCount, wordCount, level, crossValidated: em.crossValidated === true };
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
  const pool = (Array.isArray(patterns) ? patterns : [])
    .filter(isPlainObject)
    .map((p) => ({ ...p, weight: clamp(toNum(p.weight, 0.5), 0, 1) }));
  if (!pool.length || count <= 0) return [];

  const sorted = [...pool].sort((a, b) => b.weight - a.weight);
  const selected = [];
  const used = new Set();

  // תמיד: signature_phrase החזק ביותר.
  const topSig = sorted.find((p) => p.type === 'signature_phrase');
  if (topSig) {
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
    // "over": שאר המילים בקבוצה שקיימות בלקסיקון (STYLE_CONNECTORS) — כלומר יכלו
    // להימדד — פרט למוביל עצמו (בין אם נמדדו בפועל ובין אם freq=0 אצל המשתמש).
    const over = group.filter((w) => w !== top.w && STYLE_CONNECTORS.includes(w));
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

/**
 * בונה בלוק הזרקה עברי רזה (~≤350 מילים) מהפרופיל, או '' אם אין מה להזריק.
 * @param {object} styleEngine
 * @param {{seed?:number}} opts
 * @returns {string}
 */
export function buildStyleEngineInjectionBlock(styleEngine, { seed = 0, chunkBlock = '', genre = null } = {}) {
  if (!isPlainObject(styleEngine) || styleEngine.enabled === false) return '';

  // E3 — כשיש ז'אנר תואם עם תת-פרופיל מדדים → משתמשים ב-metrics/metricsSpread שלו
  // לעוגני המדד (הדפוסים/blacklist נשארים גלובליים). אחרת נופלים לפרופיל הגלובלי.
  const gName = genre ? String(genre).trim() : '';
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
    if (avgSent) {
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
    const commas = roundDisplay(metrics.avgCommasPerSentence, 1);
    const parenD = Number(metrics.parenthesesDensity);
    const punctBits = [];
    if (commas !== null && commas > 0) punctBits.push(`פסיקים: ~${commas} למשפט`);
    if (Number.isFinite(parenD) && parenD > 0) {
      punctBits.push(`סוגריים: ${parenD >= 3 ? 'תכופים' : parenD >= 1 ? 'מדי פעם' : 'נדירים'}`);
    }
    if (punctBits.length) anchors.push(`${punctBits.join('. ')}.`);

    const avgPara = roundDisplay(metrics.avgParagraphWords, 0);
    if (avgPara) anchors.push(`פסקה אופיינית: ~${avgPara} מילים.`);

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

  // 2. דפוסים ברוטציה.
  const rotated = selectRotatedPatterns(patterns, { count: 5, seed });
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

const VALID_PATTERN_TYPES = new Set([
  'signature_phrase', 'structure', 'lexical_habit', 'punctuation', 'register',
]);

/**
 * בונה את פרומפט חילוץ הדפוסים האיכותניים (עברי, §6 שלב 2).
 * @param {string[]} excerpts
 * @returns {string}
 */
export function buildPatternExtractionPrompt(excerpts) {
  const joined = (Array.isArray(excerpts) ? excerpts : [])
    .map((e) => String(e || '').trim())
    .filter(Boolean)
    .join('\n---\n');

  return [
    'אתה מנתח סגנון כתיבה. לפניך קטעים אמיתיים מכתיבה של אדם אחד.',
    'המשימה: לזהות את הדפוסים האישיים החוזרים שלו — לא כללי כתיבה טובה גנריים,',
    'אלא ההרגלים הספציפיים שמזהים דווקא אותו.',
    '',
    'חובה לכלול ביטויי חתימה מילוליים — צירופים מדויקים שהכותב חוזר עליהם (למשל פתיח טיעון קבוע, פועל מועדף) — עם סוג signature_phrase.',
    'לכל דפוס חובה ציטוט ראיה מילולי מהטקסט (evidence).',
    'אל תציין מאפיינים גנריים של עברית אקדמית (למשל "משפטים ארוכים", "שימוש במונחים מקצועיים", "כתיבה פורמלית") — רק הרגלים שמבדילים את הכותב הזה מכותבים אקדמיים אחרים.',
    '',
    'לכל דפוס החזר:',
    '- label: תיאור קצר בעברית של הדפוס',
    '- type: אחד מ- signature_phrase | structure | lexical_habit | punctuation | register',
    '- weight: מספר 0-1 (עד כמה הדפוס דומיננטי אצלו)',
    '- evidence: ציטוט ראיה מילולי אחד מהטקסט (חובה)',
    '',
    'בנוסף, זהה negativeSpace — מה הכותב הזה לעולם *לא* עושה',
    '(שאלות רטוריות? הומור? סימני קריאה? משפטים בני מילה אחת? מטפורות?).',
    '',
    'החזר JSON בלבד, ללא טקסט נוסף וללא הסברים:',
    '{ "patterns": [ { "label": "...", "type": "...", "weight": 0.0, "evidence": "..." } ], "negativeSpace": [ "..." ] }',
    '',
    'הקטעים:',
    joined,
  ].join('\n');
}

// ---------- parsePatternExtractionResult ----------

const stripJsonFences = (raw) => String(raw || '')
  .replace(/```(?:json)?\s*/gi, '')
  .replace(/```/g, '')
  .trim();

/**
 * פענוח סובלני של פלט ה-LLM. לעולם לא זורק — נכשל → {patterns:[], negativeSpace:[]}.
 * @param {string} raw
 * @returns {{patterns:Array<object>, negativeSpace:string[]}}
 */
export function parsePatternExtractionResult(raw) {
  const empty = { patterns: [], negativeSpace: [] };
  if (raw === null || raw === undefined) return empty;

  const stripped = stripJsonFences(raw);
  if (!stripped) return empty;

  let parsed = null;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    // fallback: לכידת האובייקט הראשון {...}.
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { parsed = null; }
    }
  }
  if (!isPlainObject(parsed)) return empty;

  const rawPatterns = Array.isArray(parsed.patterns) ? parsed.patterns : [];
  const patterns = [];
  for (const item of rawPatterns) {
    if (!isPlainObject(item)) continue;
    const label = String(item.label || '').trim();
    if (!label) continue;
    const type = String(item.type || '').trim();
    if (!VALID_PATTERN_TYPES.has(type)) continue;
    const weightNum = Number(item.weight);
    if (!Number.isFinite(weightNum)) continue;
    const evidence = String(item.evidence || '').trim();
    patterns.push({
      label,
      type,
      weight: clamp(round(weightNum, 3), 0, 1),
      evidence,
    });
  }

  const negativeSpace = cleanStringArray(parsed.negativeSpace, CAP_NEGATIVE);

  return { patterns, negativeSpace };
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
 * @returns {Promise<{patterns:Array<object>, negativeSpace:string[]}>}
 */
export async function extractQualitativePatterns(excerpts, invokeModel) {
  if (typeof invokeModel !== 'function') return { patterns: [], negativeSpace: [] };
  const prompt = buildPatternExtractionPrompt(excerpts);
  let raw = '';
  try {
    raw = await invokeModel(prompt);
  } catch {
    return { patterns: [], negativeSpace: [] };
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
  return { patterns, negativeSpace: parsed.negativeSpace };
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
      if (weight > cur.weight) {
        list[mi].pattern = { ...cur, label, type, weight, ...extraFields, ...(stickyMined ? { mined: true } : {}) };
      } else if (stickyMined && cur.mined !== true) {
        list[mi].pattern = { ...cur, mined: true };
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
  const MINED_RESERVED = 18;
  const minedSorted = sortedAll.filter((p) => p.mined === true).slice(0, MINED_RESERVED);
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
 * @param {{minDocFraction?:number, minCount?:number, top?:number}} opts
 * @returns {Array<object>} patterns {id, label, type, weight, evidence, frequencyPer100Words, docFraction}
 */
export function mineSignatureNgrams(chunks, { minDocFraction = 0.3, minCount = 8, top = 10 } = {}) {
  const prepared = (Array.isArray(chunks) ? chunks : [])
    .filter(isPlainObject)
    .map((c) => ({
      text: stripToText(c.text || ''),
      docId: String(c.docId || '_orphan'),
    }))
    .map((c) => ({ ...c, tokens: matchWords(c.text) }))
    .filter((c) => c.tokens.length >= 2);
  if (!prepared.length) return [];

  const uniqueDocCount = new Set(prepared.map((c) => c.docId)).size || 1;
  const totalWords = prepared.reduce((s, c) => s + c.tokens.length, 0) || 1;

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

  const thresholdDocs = Math.ceil(minDocFraction * uniqueDocCount);
  const qualifying = [];
  entries.forEach((e, key) => {
    if (e.docIds.size < thresholdDocs && e.count < minCount) return;
    // Fix 1: מסננים n-gram שאין בו אף מרקר פורמלי — צירוף-שם נושאי טהור (למשל "גוש דן").
    if (!isFormulaicNgram(e.canonTokens)) return;
    // label = surface הכי שכיח (שובר-שוויון לקסיקוגרפי — דטרמיניסטי).
    const surfaces = [...e.surfaceCounts.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    qualifying.push({
      key,
      n: e.n,
      count: e.count,
      docCount: e.docIds.size,
      canonTokens: e.canonTokens,
      label: surfaces[0][0],
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
      const weight = clamp(0.5 + (0.05 * docFractionPct) / 10 + 0.03 * Math.log(q.count), 0.5, 0.95);
      return {
        id: `sp_${djb2Hex(q.canonTokens.join(' '))}`,
        label: q.label,
        type: 'signature_phrase',
        weight: round(weight, 3),
        evidence: findNgramEvidence(prepared, q.label),
        frequencyPer100Words: round((q.count / totalWords) * 100, 3),
        docFraction: round(q.docCount / uniqueDocCount, 3),
        mined: true,
        _count: q.count,
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
    // evidence — לפי הצורה השכיחה ביותר במשפחה (דטרמיניסטי).
    const topSurface = [...e.surfaces.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0][0];
    const weight = clamp(0.5 + (0.05 * docFraction * 100) / 10 + 0.03 * Math.log(e.count), 0.5, 0.95);
    patterns.push({
      id: `sp_${djb2Hex(word)}`,
      label: word,
      type: 'signature_phrase',
      weight: round(weight, 3),
      evidence: findNgramEvidence(prepared, topSurface) || findNgramEvidence(prepared, word),
      frequencyPer100Words: round(freqPer100, 3),
      docFraction: round(docFraction, 3),
      mined: true,
      _count: e.count,
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
  if (baofen.count > 0 && (baofen.docIds.size >= thresholdDocs || baofen.count >= minCount)) {
    const topVariant = [...baofen.variants.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0][0];
    const docFraction = baofen.docIds.size / uniqueDocCount;
    const weight = clamp(0.5 + (0.05 * docFraction * 100) / 10 + 0.03 * Math.log(baofen.count), 0.5, 0.95);
    patterns.push({
      id: 'sp_baofen_toar',
      label: 'באופן + תואר',
      type: 'signature_phrase',
      weight: round(weight, 3),
      evidence: findNgramEvidence(prepared, topVariant),
      frequencyPer100Words: round((baofen.count / totalWords) * 100, 3),
      docFraction: round(docFraction, 3),
      mined: true,
      _count: baofen.count,
      _key: '2|באופן + תואר',
    });
  }

  patterns.sort((a, b) => b._count - a._count || (a._key < b._key ? -1 : a._key > b._key ? 1 : 0));
  return patterns
    .slice(0, Math.max(0, top))
    .map(({ _count, _key, ...p }) => p);
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
    .map((c) => ({ text: stripToText(c.text || ''), docId: String(c.docId || '_orphan') }))
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
      if (docFraction < 0.25 && e.count < 5) return;
      if (!isFormulaicNgram(e.canonTokens)) return;
      const surfaces = [...e.surfaceCounts.entries()]
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      qualifying.push({
        key,
        n: e.n,
        count: e.count,
        docCount: e.docIds.size,
        docFraction,
        canonTokens: e.canonTokens,
        label: surfaces[0][0],
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

/**
 * ממזג תוצאות חילוץ מכמה באטצ'ים לקונצנזוס. מקבץ patterns לפי דמיון-label (Jaccard≥0.5).
 * batchCount ≤2 → כל דפוס singleton במשקל*0.5, crossValidated=false.
 * batchCount ≥3 → קלאסטרים שהופיעו ב-≥threshold באטצ'ים מקבלים boost; היתר במשקל*0.5.
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

  const crossValidated = bc >= 3;
  const threshold = crossValidated ? Math.max(2, Math.ceil(bc * 0.2)) : Infinity;

  const patterns = clusters
    .map((cl) => {
      const membersByWeight = [...cl.members].sort(
        (a, b) => b.weight - a.weight || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0),
      );
      const rep = membersByWeight[0];
      const batchesSeen = cl.batches.size;
      let weight;
      if (crossValidated && batchesSeen >= threshold) {
        weight = Math.min(0.95, rep.weight + 0.1 * (batchesSeen - 1));
      } else {
        weight = rep.weight * 0.5;
      }
      const evidence = (membersByWeight.find((m) => m.evidence) || {}).evidence || '';
      return {
        id: rep.id || patternIdForLabel(rep.label),
        label: rep.label,
        type: rep.type,
        weight: round(clamp(weight, 0, 1), 3),
        ...(evidence ? { evidence: evidence.slice(0, 140) } : {}),
        evidenceCount: batchesSeen,
      };
    })
    // Fix 3: מפילים קלאסטרים חלשי-עדות (churn). הספק ביקש להפיל singletons בלבד, אך מדידת
    // שער היציבות הראתה ש-churn שורד גם ב-2/8 באטצ'ים: דפוסי-LLM מבניים/רטוריים חוצים את
    // סף ה-2-באטצ'ים בהרצה אחת ולא באחרת → פער בגודל הסט → Jaccard נמוך. לכן מפילים כל
    // קלאסטר שנצפה בפחות מ-dropBar באטצ'ים. הביטויים ה"ידועים" (ניתן לראות כי / מהווה /
    // באופן) מגיעים דטרמיניסטית מ-mineSignatureNgrams — לא דרך הקונצנזוס — ולכן אינם נפגעים.
    .filter((p) => {
      if (bc < 4) return true;
      const dropBar = Math.max(2, Math.ceil(bc * 0.3));
      return p.evidenceCount >= dropBar;
    });

  patterns.sort((a, b) => b.weight - a.weight || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));

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

  return {
    patterns: patterns.slice(0, CAP_PATTERNS),
    negativeSpace: cleanStringArray(negClusters.map((c) => c.rep), CAP_NEGATIVE),
    crossValidated,
  };
}
