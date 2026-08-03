// extractor.mjs — מראה מדויקת (verbatim) של ליבת הפיצ'רים מ-src/services/styleAuthenticityService.js
// משוכפל בכוונה כדי שה-harness ירוץ ב-Node טהור בלי לייבא את שכבת ה-browser של aiService.
// אם משנים את הליבה באפליקציה — לעדכן גם כאן.
//
// AI_NGRAM_TABLE + charNgrams מיובאים ישירות מ-src (שני הקבצים leaf טהורים, בטוחים
// ב-Node) — אין כאן עותק מקומי של הטבלה, ולכן אין סיכון דריפט על 4000 הגרמים עצמם.

import { charNgrams } from '../../src/services/styleFingerprintService.js';
import { AI_NGRAM_TABLE } from '../../src/services/styleAiMarkers.data.js';

export const NGRAM_MIN_WORDS = 60;

// סף החלטה ברירת-מחדל — ר' ההערה המקבילה ב-styleAuthenticityService.js
// (frontier sweep, ngramGeneric=0.65 + t=78: human FPR=9.2% מול 13.8% בבסיס,
// stealth TPR=63.6%).
export const DEFAULT_THRESHOLD = 78;

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
  // מרקרים ממריצת אימון על קורפוס AI מורחב (train.mjs + samples/ai-extended.txt, אוגוסט 2026):
  // human=0/19 בשני הקורפוסים (מקורי ומורחב), lift 37-49 בקורפוס הקטן. "חשוב לציין כי"
  // לא נוסף בכוונה — נבלע כבר ע"י "חשוב לציין" שקיים למעלה, וספירה כפולה הייתה מנפחת צפיפות.
  'לציין כי', 'ראשית היא', 'שנית היא',
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
  // ר' ההערה המקבילה ב-styleAuthenticityService.js (תקרת ההליך הרגיל; ההחלטה
  // בפועל היא הזזת DEFAULT_THRESHOLD ל-78, לא הורדת ה-cap).
  ngramGeneric: 0.65,
};

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

const stripToText = (input = '') => String(input || '')
  .replace(/<[^>]+>/g, ' ')
  // פענוח ישויות HTML (סנכרון עם השירות): &quot; בלי פענוח נספר כנקודה-פסיק.
  .replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
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

  // סנכרון עם השירות: מראי-מקום עם שנה מוחרגים; גרשיים בתוך מילה (ראשי-תיבות) אינם scare quotes.
  const structText = text.replace(/\([^)]*\b(?:19|20)\d{2}[^)]*\)/g, ' ');
  const emDashes = (structText.match(/[–—]/g) || []).length;
  const parenGlosses = (structText.match(/\([^)]{1,40}\)/g) || []).length;
  const quoteChars = (structText.replace(/(?<=[֐-׿])["״](?=[֐-׿])/g, '').match(/["“”״]/g) || []).length;
  const scareQuotes = Math.floor(quoteChars / 2);
  const semicolons = (structText.match(/;/g) || []).length;
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

  // סנכרון עם השירות: 3-גרמים של תווים מול טבלת ה-LLR.
  let ngramLlrMean = null;
  let ngramTopContrib = [];
  if (wordCount >= NGRAM_MIN_WORDS) {
    const ngrams = charNgrams(text);
    if (ngrams.length) {
      const contrib = new Map();
      let sum = 0;
      for (const g of ngrams) {
        const llr = AI_NGRAM_TABLE.grams[g] || 0;
        sum += llr;
        if (llr) contrib.set(g, (contrib.get(g) || 0) + llr);
      }
      ngramLlrMean = sum / ngrams.length;
      ngramTopContrib = [...contrib.entries()]
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 3)
        .map(([gram, total]) => ({ gram, llr: round(total, 3) }));
    }
  }

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
    ngramLlrMean: ngramLlrMean === null ? null : round(ngramLlrMean, 4),
    ngramTopContrib,
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
  // צפיפות בלבד (סנכרון עם השירות) — זרועות הספירה המוחלטת הוסרו (הטיית אורך).
  signals.formalConnector = clamp01(features.formalConnectorDensity / 4);
  signals.cliche = clamp01(features.clicheDensity / 1.5);
  signals.structural = clamp01(features.structuralDensity / 4.5);
  signals.lowRichness = features.wordCount < 60
    ? null
    : clamp01((0.62 - features.typeTokenRatio) / 0.30);
  signals.openerRepeat = features.sentenceCount < 4
    ? null
    : clamp01((features.openerRepetitionRate - 0.12) / 0.25);
  signals.personalMismatch = null;
  signals.ngramGeneric = features.ngramLlrMean === null
    ? null
    : clamp01((features.ngramLlrMean - AI_NGRAM_TABLE.meta.lowAnchor) / (AI_NGRAM_TABLE.meta.highAnchor - AI_NGRAM_TABLE.meta.lowAnchor));
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
