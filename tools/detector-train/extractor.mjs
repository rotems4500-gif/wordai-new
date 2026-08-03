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
  // ר' ההערה המקבילה ב-styleAuthenticityService.js (סוגריים-מבארים/מרכאות-מטבע
  // מדדו יותר אנושיים בעברית — הורד מ-0.55).
  structural: 0.30,
  lowRichness: 0.35,
  openerRepeat: 0.30,
  personalMismatch: 0.55,
  // ר' ההערה המקבילה ב-styleAuthenticityService.js (תקרת ההליך הרגיל; ההחלטה
  // בפועל היא הזזת DEFAULT_THRESHOLD ל-78, לא הורדת ה-cap).
  ngramGeneric: 0.65,
  aiTemplate: 0.60,
  aiRegister: 0.55,
};

// זוג "מצד אחד/מצד שני" — משמש גם לבונוס ב-formalConnector וגם לתבנית aiTemplate.
const BALANCED_LEFT_RE = /(מצד אחד|מחד)/;
const BALANCED_RIGHT_RE = /(מצד שני|מנגד|מאידך)/;

// ניסוחי מסגור/המלצה "בטוחים" — ר' ההערה המקבילה ב-styleAuthenticityService.js.
export const AI_REGISTER_RE = /(סוגיה מורכבת|שאלות עמוקות|מהווה (סוגיה|נושא|אתגר|מוקד)|נקודת מפתח|היבט (מרכזי|חשוב|מהותי|נוסף)|חשוב (כמובן )?(לזכור|לשמור|לבדוק|להבין)|ללא ספק|אין ספק|ההמלצה|מומלץ|מה ש(הופך|מאפשר|מוביל|גורם|יוצר)|מה הופך)/g;

const WORD_RE = /[֐-׿A-Za-z][֐-׿A-Za-z'"׳״-]*/g;

// תווי רוחב-אפס (U+200B/U+2060/U+FEFF) ורווחים אקזוטיים (U+202F/U+2009/U+00A0) —
// ר' ההערה המקבילה ב-styleAuthenticityService.js.
const NORMALIZE_ZW_RE = /[​⁠﻿]/g;
const NORMALIZE_SPACE_RE = /[   ]/g;

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

// נורמליזציה (סנכרון עם השירות): NFKC + הסרת תווי רוחב-אפס + קיפול רווחים אקזוטיים.
const normalizeInput = (input) => String(input || '')
  .normalize('NFKC')
  .replace(NORMALIZE_ZW_RE, '')
  .replace(NORMALIZE_SPACE_RE, ' ');

const stripToText = (input = '') => normalizeInput(input)
  .replace(/<[^>]+>/g, ' ')
  // פענוח ישויות HTML (סנכרון עם השירות): &quot; בלי פענוח נספר כנקודה-פסיק.
  .replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/[\r\t]+/g, ' ')
  .replace(/ /g, ' ')
  // [ \t]+ ולא \s+ — \s תופס גם \n, וכך "\n\n" קרס ל-"\n" וכל המסמך נראה
  // כפסקה אחת (paragraphCount היה תמיד 1; נמצא במחקר הכללים, אוגוסט 2026).
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

// כמו countOccurrences, אבל ל-regex גלובלי (AI_REGISTER_RE) במקום רשימת ביטויים מדויקים.
const countRegexOccurrences = (haystack, re) => {
  const matches = haystack.match(re) || [];
  const counts = new Map();
  matches.forEach((m) => counts.set(m, (counts.get(m) || 0) + 1));
  const found = [...counts.entries()].map(([phrase, count]) => ({ phrase, count })).sort((a, b) => b.count - a.count);
  return { total: matches.length, found };
};

// תבנית-מסמך אופיינית ל-AI — ר' ההערה המקבילה ב-styleAuthenticityService.js.
const computeAiTemplateScore = (text, sentences, paragraphCount) => {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let colonBullets = 0;
  let questionHeader = 0;
  let headers = 0;
  lines.forEach((line) => {
    const wc = (line.match(WORD_RE) || []).length;
    if (/^[^.!?:\n]{2,30}:\s+\S/.test(line) && wc >= 5 && wc <= 60) colonBullets += 1;
    if (/\?$/.test(line) && wc <= 10) questionHeader += 1;
    if (wc >= 1 && wc <= 6 && !/[.!?]$/.test(line)) headers += 1;
  });
  const lastSentences = sentences.slice(-2).join(' ');
  const closingMoral = /(חשוב (כמובן )?(לזכור|לשמור|לבדוק)|ההמלצה|מומלץ|כדאי ל|לבאים אחרינו)/.test(lastSentences);
  const balancedPair = BALANCED_LEFT_RE.test(text) && BALANCED_RIGHT_RE.test(text);

  let score = 0;
  const detail = [];
  if (colonBullets >= 2) { score += 1; detail.push('כותרות עם נקודתיים'); }
  if (questionHeader >= 1) { score += 1; detail.push('כותרת-שאלה'); }
  if (headers >= 1 && paragraphCount >= 4) { score += 1; detail.push('כותרות קצרות'); }
  if (closingMoral) { score += 1; detail.push('"מוסר השכל" בסיום'); }
  if (balancedPair) { score += 1; detail.push('זוג "מצד אחד/מצד שני"'); }
  return { score, detail, balancedPair };
};

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

  // סנכרון עם השירות: בונוס לזוג "מצד אחד/מצד שני" (כולל וריאציות) לפני חישוב הצפיפות.
  const aiTemplateInfo = computeAiTemplateScore(text, sentences, paragraphs.length);
  if (aiTemplateInfo.balancedPair) formalConnectors.total += 1;

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
  let maxConsecutiveSameOpener = 0;
  let consecutiveOpener = null;
  let consecutiveRun = 0;
  sentences.forEach((s) => {
    const sw = s.match(/[֐-׿A-Za-z][֐-׿A-Za-z'"׳״-]*/g) || [];
    let opener = null;
    if (sw.length) {
      opener = sw.slice(0, Math.min(2, sw.length)).join(' ').toLowerCase();
      if (opener.length >= 3) {
        openerCounts[opener] = (openerCounts[opener] || 0) + 1;
      } else {
        opener = null;
      }
    }
    if (opener && opener === consecutiveOpener) {
      consecutiveRun += 1;
    } else {
      consecutiveOpener = opener;
      consecutiveRun = opener ? 1 : 0;
    }
    if (consecutiveRun > maxConsecutiveSameOpener) maxConsecutiveSameOpener = consecutiveRun;
  });
  const maxOpener = Object.values(openerCounts).reduce((a, b) => Math.max(a, b), 0);
  const openerRepetitionRate = sentences.length ? round(maxOpener / sentences.length, 3) : 0;

  // סנכרון עם השירות: band1030 — נתח המשפטים (≥3 מילים) שכולם ב-10-30 מילים.
  const qualifyingSentenceLengths = sentenceLengths.filter((n) => n >= 3);
  let band1030Frac = null;
  if (qualifyingSentenceLengths.length >= 5) {
    const inBand = qualifyingSentenceLengths.filter((n) => n >= 10 && n <= 30).length;
    band1030Frac = inBand / qualifyingSentenceLengths.length;
  }

  // סנכרון עם השירות: ניסוחי מסגור/המלצה "בטוחים" לאלף מילים.
  const aiRegisterMatches = countRegexOccurrences(text, AI_REGISTER_RE);
  const aiRegisterPerThousand = wordCount ? round((aiRegisterMatches.total / wordCount) * 1000, 2) : 0;

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
    maxConsecutiveSameOpener,
    band1030Frac: band1030Frac === null ? null : round(band1030Frac, 3),
    aiRegisterPerThousand,
    aiRegisterFound: aiRegisterMatches.found.slice(0, 6),
    aiTemplateScore: aiTemplateInfo.score,
    aiTemplateDetail: aiTemplateInfo.detail,
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
  // band1030 מרחיב את אחידות-האורך — ר' ההערה המקבילה ב-styleAuthenticityService.js.
  const cvSignal = (features.sentenceLengthCV === null || features.sentenceCount < 3)
    ? null
    : clamp01((0.50 - features.sentenceLengthCV) / 0.40);
  const bandSignal = features.band1030Frac === null
    ? null
    : clamp01((features.band1030Frac - 0.70) / 0.30);
  signals.uniformity = (cvSignal === null && bandSignal === null)
    ? null
    : Math.max(cvSignal ?? 0, bandSignal ?? 0);
  // צפיפות בלבד (סנכרון עם השירות) — זרועות הספירה המוחלטת הוסרו (הטיית אורך).
  signals.formalConnector = clamp01(features.formalConnectorDensity / 4);
  signals.cliche = clamp01(features.clicheDensity / 1.5);
  signals.structural = clamp01(features.structuralDensity / 4.5);
  signals.lowRichness = features.wordCount < 60
    ? null
    : clamp01((0.62 - features.typeTokenRatio) / 0.30);
  // מוגן-אנפורה (ר' ההערה המקבילה ב-styleAuthenticityService.js).
  signals.openerRepeat = (features.sentenceCount < 4 || features.maxConsecutiveSameOpener >= 3)
    ? null
    : clamp01((features.openerRepetitionRate - 0.12) / 0.25);
  signals.personalMismatch = null;
  signals.ngramGeneric = features.ngramLlrMean === null
    ? null
    : clamp01((features.ngramLlrMean - AI_NGRAM_TABLE.meta.lowAnchor) / (AI_NGRAM_TABLE.meta.highAnchor - AI_NGRAM_TABLE.meta.lowAnchor));
  signals.aiTemplate = features.wordCount < 80
    ? null
    : clamp01((features.aiTemplateScore - 2) / 3);
  signals.aiRegister = features.wordCount < 60
    ? null
    : clamp01(features.aiRegisterPerThousand / 6);
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
