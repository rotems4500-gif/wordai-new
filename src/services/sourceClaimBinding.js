// sourceClaimBinding.js — Stage 2 של תוכנית העיגון (option B, ראה CLAUDE.md / זיכרון-הפרויקט).
//
// מודול טהור, בלי side-effects ובלי תלות ב-aiService. תפקידו: לקחת מסמך שנכתב + מקורות
// מעוגנים (groundedPassages מ-Gemini groundingSupports, Stage 1), ולמפות כל טענה עובדתית
// במסמך לקטע-המקור התומך בה — כדי לחשוף טענות "Type-2" (נשמעות עובדתיות, בלי מקור),
// שהן הווקטור העיקרי להזיה.
//
// דטרמיניסטי בכוונה (בלי LLM/API): overlap + התאמת עוגני-קשה (מספר/שנה/אחוז/ציטוט). זול,
// בר-בדיקה, ולא מוסיף עלות. שלב האכיפה (gate + סף confidence + חיווט) הוא Stage 3, נפרד.
//
// אין כרגע consumer — הפונקציות עצמאיות ונקראות רק מ-Stage 3 כשייבנה.

const STOPWORDS = new Set([
  // עברית — מילות-קישור/פונקציה שכיחות שלא נושאות מידע להתאמה
  'של', 'עם', 'על', 'אל', 'את', 'זה', 'זו', 'הוא', 'היא', 'הם', 'הן', 'כי', 'גם',
  'אבל', 'או', 'אם', 'כל', 'כמו', 'יש', 'אין', 'לא', 'כן', 'רק', 'עוד', 'אשר',
  'בין', 'לפי', 'תחת', 'מעל', 'אחרי', 'לפני', 'בתוך', 'ללא', 'בלי', 'היה', 'הייתה',
  'אינו', 'אינה', 'הזה', 'הזו', 'אלה', 'אלו', 'בו', 'בה', 'בהם', 'מתוך', 'כדי',
  // אנגלית
  'the', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'for', 'and', 'or', 'but', 'is',
  'are', 'was', 'were', 'be', 'as', 'by', 'with', 'that', 'this', 'these', 'those',
  'it', 'its', 'from', 'not', 'no', 'has', 'have', 'had', 'which', 'who', 'whom',
]);

const stripDiacritics = (value = '') => String(value || '').replace(/[֑-ׇ]/g, '');

// עוגני-קשה: הטוקנים שטענה עובדתית-ספציפית נשענת עליהם. אם הם קיימים במשפט אבל לא בקטע-מקור,
// זה סימן חזק להזיה/miscitation.
const YEAR_RE = /\b(?:19|20)\d{2}\b/g;
const PERCENT_RE = /\d{1,3}(?:[.,]\d+)?\s*%|\b\d{1,3}(?:[.,]\d+)?\s*אחוז(?:ים)?\b/g;
const NUMBER_RE = /\b\d[\d.,]*\b/g;
const QUOTE_RE = /["'“”״׳「」『』»«]([^"'“”״׳「」『』»«]{3,}?)["'“”״׳「」『』»«]/g;
const DOI_RE = /\b10\.\d{4,9}\/[^\s"'<>]+/gi;
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>()]+/gi;

const normalizeForCompare = (value = '') => stripDiacritics(String(value || ''))
  .toLowerCase()
  .replace(/[^0-9a-z֐-׿%.\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const tokenize = (value = '') => normalizeForCompare(value)
  .split(' ')
  .map((token) => token.replace(/^[.,]+|[.,]+$/g, ''))
  .filter((token) => token.length >= 2 && !STOPWORDS.has(token));

// פיצול למשפטים — עברית+אנגלית. סופי-משפט: . ! ? ; ונקודתיים/שורה חדשה. שומר על יחידות קצרות.
export const splitIntoSentences = (text = '') => String(text || '')
  .replace(/\r/g, '\n')
  .split(/(?<=[.!?;])\s+|\n+/)
  .map((sentence) => sentence.trim())
  .filter((sentence) => sentence.length > 0);

// חילוץ עוגני-קשה ממשפט/קטע. מחזיר סטים מנורמלים להשוואה.
export const extractHardFacts = (value = '') => {
  const text = String(value || '');
  const collect = (re) => {
    const out = new Set();
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const raw = (m[1] || m[0] || '').trim();
      const normalized = raw.replace(/\s+/g, ' ').toLowerCase();
      if (normalized) out.add(normalized);
      if (m.index === re.lastIndex) re.lastIndex += 1; // הגנה מפני לולאה אינסופית על התאמה ריקה
    }
    return out;
  };
  const numbers = collect(NUMBER_RE);
  const years = collect(YEAR_RE);
  // שנים נספרות גם כמספרים — לא כפילות מזיקה, אבל שנה היא אות חזק יותר.
  return {
    numbers,
    years,
    percents: collect(PERCENT_RE),
    quotes: collect(QUOTE_RE),
    dois: collect(DOI_RE),
    urls: collect(URL_RE),
  };
};

// האם המשפט הוא טענה עובדתית שדורשת מקור (Type-1)? נשען על קיום עוגן-קשה.
// משפטי סינתזה/פרשנות (Type-2) בלי עוגן-קשה לא נחשבים "דורשי-מקור" אוטומטית, אבל Stage 3
// יכול לסמן אותם בנפרד אם הם נשמעים נחרצים.
export const hasHardFact = (facts = {}) => Boolean(
  (facts.years && facts.years.size)
  || (facts.percents && facts.percents.size)
  || (facts.quotes && facts.quotes.size)
  || (facts.dois && facts.dois.size)
  || (facts.numbers && facts.numbers.size),
);

export const isFactualClaim = (sentence = '') => hasHardFact(extractHardFacts(sentence));

const setOverlapCount = (a, b) => {
  if (!a || !b || !a.size || !b.size) return 0;
  let count = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const item of small) if (large.has(item)) count += 1;
  return count;
};

// ציון התאמה בין טענה לקטע-מקור: משקל גבוה לעוגני-קשה משותפים (מספר/שנה/אחוז/ציטוט/DOI),
// ומשקל משני ל-overlap טוקנים. מוחזר 0..1.
export const scoreClaimPassageMatch = (sentence = '', passageText = '') => {
  const claimFacts = extractHardFacts(sentence);
  const passageFacts = extractHardFacts(passageText);

  const hardShared = setOverlapCount(claimFacts.years, passageFacts.years) * 3
    + setOverlapCount(claimFacts.percents, passageFacts.percents) * 3
    + setOverlapCount(claimFacts.quotes, passageFacts.quotes) * 4
    + setOverlapCount(claimFacts.dois, passageFacts.dois) * 5
    + setOverlapCount(claimFacts.numbers, passageFacts.numbers) * 2;

  const claimTokens = new Set(tokenize(sentence));
  const passageTokens = new Set(tokenize(passageText));
  const tokenShared = setOverlapCount(claimTokens, passageTokens);
  const tokenRatio = claimTokens.size ? tokenShared / claimTokens.size : 0;

  // עוגני-קשה שקיימים בטענה אך חסרים לגמרי בקטע — קנס: זה בדיוק מצב ה-miscitation.
  const claimHardCount = claimFacts.years.size + claimFacts.percents.size
    + claimFacts.quotes.size + claimFacts.dois.size + claimFacts.numbers.size;
  const hardMatchRatio = claimHardCount ? Math.min(1, hardShared / (claimHardCount * 2)) : 0;

  // שקלול: 0.65 עוגני-קשה, 0.35 טוקנים. אם אין עוגן-קשה בטענה — נשען על טוקנים בלבד.
  const score = claimHardCount
    ? (hardMatchRatio * 0.65) + (tokenRatio * 0.35)
    : tokenRatio;
  return Math.max(0, Math.min(1, score));
};

// מציאת קטע-המקור הטוב ביותר לטענה, מתוך כל המקורות המעוגנים.
// anchoredSources: [{ url|uri, groundedPassages:[{text, confidence}] }]
export const findBestPassageForClaim = (sentence = '', anchoredSources = []) => {
  let best = null;
  for (const source of (Array.isArray(anchoredSources) ? anchoredSources : [])) {
    const uri = String(source?.url || source?.uri || '').trim();
    const passages = Array.isArray(source?.groundedPassages) ? source.groundedPassages : [];
    for (const passage of passages) {
      const text = String(passage?.text || '').trim();
      if (!text) continue;
      const score = scoreClaimPassageMatch(sentence, text);
      const confidence = Number.isFinite(Number(passage?.confidence)) ? Number(passage.confidence) : null;
      if (!best || score > best.score) {
        best = { uri, text, confidence, score };
      }
    }
  }
  return best;
};

// הפונקציה הראשית של Stage 2: קושרת כל משפט במסמך למקור.
// opts: { matchThreshold=0.34, confidenceThreshold=0 } — הסף עצמו נקבע/נאכף ב-Stage 3.
// מחזיר דוח טהור (בלי לשנות את המסמך).
export const bindClaimsToPassages = (documentText = '', anchoredSources = [], opts = {}) => {
  const matchThreshold = Number.isFinite(Number(opts.matchThreshold)) ? Number(opts.matchThreshold) : 0.34;
  const confidenceThreshold = Number.isFinite(Number(opts.confidenceThreshold)) ? Number(opts.confidenceThreshold) : 0;

  const sentences = splitIntoSentences(documentText);
  const claims = sentences.map((sentence) => {
    const factual = isFactualClaim(sentence);
    if (!factual) {
      return { sentence, isFactual: false, bestPassage: null, status: 'non-factual' };
    }
    const bestPassage = findBestPassageForClaim(sentence, anchoredSources);
    const meetsMatch = Boolean(bestPassage) && bestPassage.score >= matchThreshold;
    const meetsConfidence = !meetsMatch
      ? false
      : (bestPassage.confidence === null || bestPassage.confidence >= confidenceThreshold);
    const status = (meetsMatch && meetsConfidence) ? 'supported' : 'unsupported';
    return { sentence, isFactual: true, bestPassage, status };
  });

  const factual = claims.filter((claim) => claim.isFactual);
  const supported = factual.filter((claim) => claim.status === 'supported');
  const unsupported = factual.filter((claim) => claim.status === 'unsupported');

  return {
    claims,
    summary: {
      total: claims.length,
      factual: factual.length,
      supported: supported.length,
      unsupported: unsupported.length,
    },
  };
};
