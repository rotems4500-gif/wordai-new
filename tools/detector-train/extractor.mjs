// extractor.mjs — מראה מדויקת (verbatim) של ליבת הפיצ'רים מ-src/services/styleAuthenticityService.js
// משוכפל בכוונה כדי שה-harness ירוץ ב-Node טהור בלי לייבא את שכבת ה-browser של aiService.
// אם משנים את הליבה באפליקציה — לעדכן גם כאן.

export const FORMAL_CONNECTORS = [
  'יתרה מכך', 'יתרה מזאת', 'זאת ועוד', 'כמו כן', 'בנוסף לכך', 'חשוב לציין', 'ראוי לציין',
  'יש לציין', 'לאור האמור', 'לאור זאת', 'בסופו של דבר', 'במילים אחרות', 'לסיכום', 'לסיום',
  'כפי שצוין', 'מחד גיסא', 'מאידך גיסא', 'מצד אחד', 'מצד שני', 'אשר על כן', 'לפיכך',
  'משכך', 'כתוצאה מכך', 'בהקשר זה', 'בעידן הנוכחי',
  'עם זאת', 'יחד עם זאת', 'על פי', 'כלומר', 'למשל', 'מאחר ש', 'מאחר ו', 'בהתאם לכך',
  'במסגרת זו', 'במציאות זו', 'לפי הגישה', 'באופן זה', 'כפי ש',
  'ראשית,', 'שנית,', 'שלישית,', 'רביעית,', 'חמישית,', 'לבסוף,',
  'בראש ובראשונה', 'אם כן,', 'יש להדגיש', 'ראוי להדגיש', 'יש לזכור', 'יש להבין',
  'מן הראוי', 'הלכה למעשה', 'מטבע הדברים', 'בה בעת', 'באופן כללי',
];

export const CLICHE_PHRASES = [
  'מגוון רחב', 'ממלא תפקיד מרכזי', 'ממלאת תפקיד מרכזי', 'אבן יסוד', 'אבן דרך',
  'בעולם של ימינו', 'בעידן הדיגיטלי', 'מאז ומתמיד', 'חשוב מאין כמוהו', 'לא ניתן להפריז',
  'חלק בלתי נפרד', 'עולם הולך ומשתנה', 'כלי רב עוצמה', 'פותח דלתות', 'קשת רחבה',
  'בעת ובעונה אחת', 'נדבך מרכזי', 'תפקיד חיוני',
  'צו השעה', 'כבדות משקל', 'שינוי פרדיגמטי', 'פוטנציאל עצום', 'בעולם המודרני',
  'מהפכה של ממש', 'חשיבות עליונה', 'לא יסולא בפז', 'עידן חדש', 'בר-קיימא', 'ברת-קיימא',
];

export const STOP_WORDS = new Set(['של', 'על', 'עם', 'זה', 'זאת', 'היא', 'הוא', 'הם', 'הן', 'אני', 'אתה', 'את', 'אנחנו', 'גם', 'אבל', 'או', 'אם', 'כי', 'כל', 'לא', 'כן', 'כך', 'מאוד', 'עוד', 'רק', 'כדי', 'היה', 'היו', 'יש', 'אין', 'אל', 'מן', 'אלו', 'אלה', 'אשר', 'כאשר', 'בין', 'לפי', 'תוך', 'אצל', 'מתוך', 'בו', 'בה', 'בהם']);

export const DEFAULT_WEIGHTS = {
  uniformity: 0.55,
  formalConnector: 0.55,
  cliche: 0.60,
  structural: 0.55,
  lowRichness: 0.35,
  openerRepeat: 0.30,
  personalMismatch: 0.55,
};

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

const stripToText = (input = '') => String(input || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/[\r\t]+/g, ' ')
  .replace(/ /g, ' ')
  .replace(/\s+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const countOccurrences = (haystack, needles) => {
  const found = [];
  let total = 0;
  needles.forEach((needle) => {
    let from = 0;
    let hits = 0;
    let idx = haystack.indexOf(needle, from);
    while (idx !== -1) {
      hits += 1;
      from = idx + needle.length;
      idx = haystack.indexOf(needle, from);
    }
    if (hits > 0) {
      total += hits;
      found.push({ phrase: needle, count: hits });
    }
  });
  found.sort((a, b) => b.count - a.count);
  return { total, found };
};

export function extractAuthenticityFeatures(input = '') {
  const text = stripToText(input);
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const sentences = text.split(/[.!?…]+\s+/).map((s) => s.trim()).filter(Boolean);
  const words = text.match(/[֐-׿A-Za-z][֐-׿A-Za-z'"׳״-]*/g) || [];
  const wordCount = words.length;

  const contentWords = words
    .map((w) => w.replace(/^["'׳״-]+|["'׳״-]+$/g, '').toLowerCase())
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  const sentenceLengths = sentences.map((s) => (s.match(/[֐-׿A-Za-z][֐-׿A-Za-z'"׳״-]*/g) || []).length).filter((n) => n > 0);
  const paragraphLengths = paragraphs.map((p) => (p.match(/[֐-׿A-Za-z][֐-׿A-Za-z'"׳״-]*/g) || []).length).filter((n) => n > 0);

  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const cv = (arr) => {
    if (arr.length < 2) return null;
    const m = mean(arr);
    if (!m) return null;
    const variance = arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
    return Math.sqrt(variance) / m;
  };

  const avgSentenceWords = round(mean(sentenceLengths));
  const sentenceLengthCV = cv(sentenceLengths);
  const avgParagraphWords = round(mean(paragraphLengths));

  const formalConnectors = countOccurrences(text, FORMAL_CONNECTORS);
  const cliches = countOccurrences(text, CLICHE_PHRASES);

  const per100 = (n) => (wordCount ? round((n / wordCount) * 100, 2) : 0);

  const emDashes = (text.match(/[–—]/g) || []).length;
  const parenGlosses = (text.match(/\([^)]{1,40}\)/g) || []).length;
  const quoteChars = (text.match(/["“”״]/g) || []).length;
  const scareQuotes = Math.floor(quoteChars / 2);
  const semicolons = (text.match(/;/g) || []).length;
  const structuralEvents = emDashes + parenGlosses + scareQuotes + semicolons;

  const uniqueContent = new Set(contentWords);
  const typeTokenRatio = contentWords.length ? round(uniqueContent.size / contentWords.length, 3) : 0;

  const openerCounts = {};
  sentences.forEach((s) => {
    const sw = s.match(/[֐-׿A-Za-z][֐-׿A-Za-z'"׳״-]*/g) || [];
    if (sw.length) {
      const opener = sw.slice(0, Math.min(2, sw.length)).join(' ').toLowerCase();
      if (opener.length >= 3) openerCounts[opener] = (openerCounts[opener] || 0) + 1;
    }
  });
  const maxOpener = Object.values(openerCounts).reduce((a, b) => Math.max(a, b), 0);
  const openerRepetitionRate = sentences.length ? round(maxOpener / sentences.length, 3) : 0;

  return {
    wordCount,
    sentenceCount: sentences.length,
    paragraphCount: paragraphs.length,
    avgSentenceWords,
    sentenceLengthCV: sentenceLengthCV === null ? null : round(sentenceLengthCV, 3),
    avgParagraphWords,
    formalConnectorDensity: per100(formalConnectors.total),
    formalConnectorCount: formalConnectors.total,
    formalConnectorsFound: formalConnectors.found.slice(0, 12),
    clicheDensity: per100(cliches.total),
    clicheCount: cliches.total,
    clichesFound: cliches.found.slice(0, 12),
    structuralDensity: per100(structuralEvents),
    structuralCount: structuralEvents,
    structuralDetail: { emDashes, parenGlosses, scareQuotes, semicolons },
    typeTokenRatio,
    openerRepetitionRate,
    topContentWords: Array.from(uniqueContent).slice(0, 60),
    _contentWords: contentWords,
    _sentences: sentences,
  };
}

// computeSignals בלי profile (signal 6 personalMismatch = null) — לכיול הגלאי הכללי.
export function computeSignals(features) {
  const signals = {};
  signals.uniformity = (features.sentenceLengthCV === null || features.sentenceCount < 3)
    ? null
    : clamp01((0.50 - features.sentenceLengthCV) / 0.40);
  signals.formalConnector = Math.max(clamp01(features.formalConnectorDensity / 4), clamp01(features.formalConnectorCount / 8));
  signals.cliche = Math.max(clamp01(features.clicheDensity / 1.5), clamp01(features.clicheCount / 4));
  signals.structural = Math.max(clamp01(features.structuralDensity / 4.5), clamp01(features.structuralCount / 18));
  signals.lowRichness = features.wordCount < 60
    ? null
    : clamp01((0.62 - features.typeTokenRatio) / 0.30);
  signals.openerRepeat = features.sentenceCount < 4
    ? null
    : clamp01((features.openerRepetitionRate - 0.12) / 0.25);
  signals.personalMismatch = null;
  return signals;
}

export function scoreFromSignals(signals, weights = DEFAULT_WEIGHTS) {
  let product = 1;
  Object.keys(signals).forEach((key) => {
    const signal = signals[key];
    if (signal === null || signal === undefined) return;
    const cap = Number(weights[key]) || 0;
    if (cap <= 0) return;
    product *= (1 - signal * cap);
  });
  return Math.round((1 - product) * 100);
}

export { clamp01, round };
