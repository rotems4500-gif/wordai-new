// styleAuthenticityService — זיהוי "נשמע גנרי / לא-כמוך" (לא גלאי AI בינארי).
// פלט רך 0-100 + רשימת סימנים מוסברים. משלב מרקרים גנריים של AI עם סטייה מהסגנון הנלמד.
// "אימון" = כיול ממוצעי-פיצ'ר מדוגמאות מתויגות (label: 'me' | 'ai'), בלי ML libs.
//
// הליבה (extractAuthenticityFeatures / scoreTextAuthenticity) טהורה ומקבלת profile כארגומנט.
// רק שכבת הכיול (add/train/get) נוגעת באחסון הפרופיל האישי.

import { getPersonalStyleProfile, savePersonalStyleProfile } from './aiService';
import { addGoldChunk } from './styleSampleStore';
import { charNgrams } from './styleFingerprintService';
import { AI_NGRAM_TABLE } from './styleAiMarkers.data';

// מסמך קצר מדי לא נושא מספיק 3-גרמים לאומדן LLR יציב (אותו סף כמו lowRichness).
const NGRAM_MIN_WORDS = 60;

// סף החלטה ברירת-מחדל (כשאין כיול אישי). נבחר ב-frontier sweep (tools/detector-train,
// אוגוסט 2026) לצד ngramGeneric=0.65: t=78 נותן human FPR=9.2% (מול 13.8% בבסיס,
// לפני הוספת ngramGeneric) ו-stealth TPR=64% (מול 21.2% בבסיס). ר' ההערה ליד
// DEFAULT_WEIGHTS.ngramGeneric למטה לפירוט מלא של ה-sweep.
const DEFAULT_THRESHOLD = 78;

// מילות קישור פורמליות שמודלים נוטים להעדיף בצפיפות גבוהה.
const FORMAL_CONNECTORS = [
  'יתרה מכך', 'יתרה מזאת', 'זאת ועוד', 'כמו כן', 'בנוסף לכך', 'חשוב לציין', 'ראוי לציין',
  'יש לציין', 'לאור האמור', 'לאור זאת', 'בסופו של דבר', 'במילים אחרות', 'לסיכום', 'לסיום',
  'כפי שצוין', 'מחד גיסא', 'מאידך גיסא', 'מצד אחד', 'מצד שני', 'אשר על כן', 'לפיכך',
  'משכך', 'כתוצאה מכך', 'בהקשר זה', 'בעידן הנוכחי',
  // מחברים אקדמיים שזוהו בפלט Gemini אמיתי (training session, מדעי המדינה):
  'עם זאת', 'יחד עם זאת', 'על פי', 'כלומר', 'למשל', 'מאחר ש', 'מאחר ו', 'בהתאם לכך',
  'במסגרת זו', 'במציאות זו', 'לפי הגישה', 'באופן זה', 'כפי ש',
  // מרקרי מניין (enumeration) — מובהקים מאוד ל-LLM עברי, נדירים בכתיבה אנושית זורמת.
  // נשמרים עם פסיק כדי לא לתפוס מילים כמו "בראשית" (ספר בראשית) או "השלישית".
  'ראשית,', 'שנית,', 'שלישית,', 'רביעית,', 'חמישית,', 'לבסוף,',
  'בראש ובראשונה', 'אם כן,', 'יש להדגיש', 'ראוי להדגיש', 'יש לזכור', 'יש להבין',
  'מן הראוי', 'הלכה למעשה', 'מטבע הדברים', 'בה בעת', 'באופן כללי',
  // מרקרים ממריצת אימון על קורפוס AI מורחב (train.mjs + samples/ai-extended.txt, אוגוסט 2026):
  // human=0/19 בשני הקורפוסים (מקורי ומורחב), lift 37-49 בקורפוס הקטן. "חשוב לציין כי"
  // לא נוסף בכוונה — נבלע כבר ע"י "חשוב לציין" שקיים למעלה, וספירה כפולה הייתה מנפחת צפיפות.
  'לציין כי', 'ראשית היא', 'שנית היא',
];

// קלישאות שחוקות אופייניות לטקסט מחולל.
const CLICHE_PHRASES = [
  'מגוון רחב', 'ממלא תפקיד מרכזי', 'ממלאת תפקיד מרכזי', 'אבן יסוד', 'אבן דרך',
  'בעולם של ימינו', 'בעידן הדיגיטלי', 'מאז ומתמיד', 'חשוב מאין כמוהו', 'לא ניתן להפריז',
  'חלק בלתי נפרד', 'עולם הולך ומשתנה', 'כלי רב עוצמה', 'פותח דלתות', 'קשת רחבה',
  'בעת ובעונה אחת', 'נדבך מרכזי', 'תפקיד חיוני',
  // קלישאות LLM נוספות שזוהו באימון מקומי (training loop, יוני 2026):
  'צו השעה', 'כבדות משקל', 'שינוי פרדיגמטי', 'פוטנציאל עצום', 'בעולם המודרני',
  'מהפכה של ממש', 'חשיבות עליונה', 'לא יסולא בפז', 'עידן חדש', 'בר-קיימא', 'ברת-קיימא',
];

const STOP_WORDS = new Set(['של', 'על', 'עם', 'זה', 'זאת', 'היא', 'הוא', 'הם', 'הן', 'אני', 'אתה', 'את', 'אנחנו', 'גם', 'אבל', 'או', 'אם', 'כי', 'כל', 'לא', 'כן', 'כך', 'מאוד', 'עוד', 'רק', 'כדי', 'היה', 'היו', 'יש', 'אין', 'אל', 'מן', 'אלו', 'אלה', 'אשר', 'כאשר', 'בין', 'לפי', 'תוך', 'אצל', 'מתוך', 'בו', 'בה', 'בהם']);

// תקרת תרומה לכל סיגנל בצירוף noisy-OR (לא ממוצע — כדי שסיגנל בודד חזק לא יידולל).
// כל ערך = כמה הסיגנל לבדו יכול לתרום לציון (0..1). הכיול מחליף ערכים אלה לפי כושר ההפרדה.
const DEFAULT_WEIGHTS = {
  uniformity: 0.55,
  formalConnector: 0.55,
  cliche: 0.60,
  // הורד מ-0.55 ל-0.30 (מחקר הכללים, אוגוסט 2026): נמדד שסוגריים-מבארים ומרכאות-מטבע
  // הם דווקא *יותר* אנושיים בעברית (lift 0.53-0.60 לטובת אנושי), ומקף-הסבר לבדו
  // חלש מדי (lift 1.24) כדי לשאת cap גבוה. ה-cap הישן היה מרוקן אות ביטחון-שווא.
  structural: 0.30,
  lowRichness: 0.35,
  openerRepeat: 0.30,
  personalMismatch: 0.55,
  // תקרת ההליך הרגיל (trainWeights: clamp(0.2, 0.65, 0.2+הפרדה), הפרדה נמדדה 0.91
  // — ר' train.mjs). הטבלה מאומנת על תערובת אנושית משוקללת 50/50
  // narrative(ויקיפדיה)/academic(314999533, מחברים אחרים, לא עבודות המשתמש).
  // ⚠️ החלטת המוצר: cap=0.65 לבדו מפר את שער FPR@60 הישן (34.1% מול 13.8%) —
  // הפתרון שנבחר הוא **לא** cap נמוך אלא הזזת סף ההחלטה (DEFAULT_THRESHOLD למעלה)
  // מ-60 ל-78, שנבחרה ב-frontier sweep (t=76..79, cap=0.65): ב-t=78 human
  // FPR=9.2% (עבודות אמיתיות, n=119, מתחת ל-13.8% המקורי) ו-stealth TPR=63.6%
  // (מול 21.2% בבסיס) ו-normal-AI TPR=82.6%. פירוט מלא ה-sweep (t=60..85, כולל
  // cap=0.08/0.2 לחלופה) נמצא בהיסטוריית ה-PR/שיחת הפיתוח — לא משוכפל כאן.
  ngramGeneric: 0.65,
  // תבנית-מסמך אופיינית ל-AI (כותרות עם נקודתיים, כותרת-שאלה, כותרות קצרות, מוסר-השכל
  // בסיום, זוג "מצד אחד/מצד שני") — 0/5 עד 3/5 בכל עבודות המשתמש/ויקיפדיה שנבדקו,
  // וטקסט AI ידוע-כחמקן הגיע ל-5/5. ר' extractAuthenticityFeatures/computeAiTemplateScore.
  aiTemplate: 0.60,
  // ניסוחי מסגור והמלצה "בטוחים" (AI_REGISTER_RE למעלה) לאלף מילים — טקסט AI ידוע-כחמקן
  // מדד 40/1000, עבודות המשתמש p90=0.
  aiRegister: 0.55,
};

// זוג "מצד אחד/מצד שני" — משמש גם לבונוס ב-formalConnector וגם לתבנית aiTemplate.
const BALANCED_LEFT_RE = /(מצד אחד|מחד)/;
const BALANCED_RIGHT_RE = /(מצד שני|מנגד|מאידך)/;

// ניסוחי מסגור/המלצה "בטוחים" — לא כוללים ביטויים כמו "מתאפיין ב"/"בשנים האחרונות"
// שיורים על כתיבה אקדמית אנושית תקינה (נמדד על עבודות המשתמש בפועל, אוגוסט 2026).
const AI_REGISTER_RE = /(סוגיה מורכבת|שאלות עמוקות|מהווה (סוגיה|נושא|אתגר|מוקד)|נקודת מפתח|היבט (מרכזי|חשוב|מהותי|נוסף)|חשוב (כמובן )?(לזכור|לשמור|לבדוק|להבין)|ללא ספק|אין ספק|ההמלצה|מומלץ|מה ש(הופך|מאפשר|מוביל|גורם|יוצר)|מה הופך)/g;

const WORD_RE = /[֐-׿A-Za-z][֐-׿A-Za-z'"׳״-]*/g;

const MAX_CALIBRATION_SAMPLES = 40;

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

// נורמליזציה (מחקר הכללים, אוגוסט 2026): NFKC מאחד צורות תאימות-Unicode בלי לפגוע
// בניקוד עברי; הסרת תווי רוחב-אפס (U+200B/U+2060/U+FEFF — התקפה נפוצה על גלאי טקסט,
// "מסתירים" תו בתוך מילה כדי לשבש טוקניזציה); וקיפול רווחים אקזוטיים (U+202F/U+2009,
// בנוסף ל-NBSP U+00A0 שכבר מטופל למטה) לרווח רגיל.
const normalizeInput = (input) => String(input || '')
  .normalize('NFKC')
  .replace(/[\u200B\u2060\uFEFF]/g, '')
  .replace(/[\u202F\u2009\u00A0]/g, ' ');

const stripToText = (input = '') => normalizeInput(input)
  .replace(/<[^>]+>/g, ' ')
  // פענוח ישויות HTML — בלעדיו כל &quot; נספר כנקודה-פסיק (התו ; שבסוף הישות)
  // וניפח את structural פי כמה על טקסט שהגיע כ-HTML.
  .replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/[\r\t]+/g, ' ')
  .replace(/ /g, ' ')
  // [ \t]+ ולא \s+ — \s תופס גם \n, וכך "\n\n" קרס ל-"\n" וכל המסמך נראה
  // כפסקה אחת (paragraphCount היה תמיד 1; נמצא במחקר הכללים, אוגוסט 2026).
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

// חתימת 3-גרמי-תווים מול טבלת ה-LLR (AI_NGRAM_TABLE) — פונקציה משותפת למחרוזת שלמה
// (מסמך ב-extractAuthenticityFeatures) או קטע קצר (משפט ב-analyzeSentencesAuthenticity),
// כדי לא לשכפל את חישוב ה-LLR פעמיים.
const computeNgramLlr = (text) => {
  const ngrams = charNgrams(text);
  if (!ngrams.length) return { mean: null, topContrib: [] };
  const contrib = new Map();
  let sum = 0;
  for (const g of ngrams) {
    const llr = AI_NGRAM_TABLE.grams[g] || 0;
    sum += llr;
    if (llr) contrib.set(g, (contrib.get(g) || 0) + llr);
  }
  const mean = sum / ngrams.length;
  const topContrib = [...contrib.entries()]
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 3)
    .map(([gram, total]) => ({ gram, llr: round(total, 3) }));
  return { mean, topContrib };
};

// סימני מבנה אופייניים ל-AI (Gemini Hebrew): מקפי הסבר, סוגריים מבארים, מרכאות-מטבע, נקודה-פסיק.
// שתי החרגות של כתיבה אקדמית אנושית (נמדדו על עבודות אמיתיות — בלעדיהן הסיגנל רווי ל-1.0):
// (1) מראה-מקום עם שנה (APA כמו "(כהן, 2020; לוי, 2019)") אינו ליטוש-מכונה — מוסר לפני הספירה.
// (2) גרשיים בתוך מילה הם ראשי-תיבות עבריים (ד"ר, ע"ר, תשפ"ו) ולא scare quotes.
const computeStructuralEvents = (text) => {
  const structText = text.replace(/\([^)]*\b(?:19|20)\d{2}[^)]*\)/g, ' ');
  const emDashes = (structText.match(/[–—]/g) || []).length;
  const parenGlosses = (structText.match(/\([^)]{1,40}\)/g) || []).length;
  const quoteChars = (structText.replace(/(?<=[֐-׿])["״](?=[֐-׿])/g, '').match(/["“”״]/g) || []).length;
  const scareQuotes = Math.floor(quoteChars / 2);
  const semicolons = (structText.match(/;/g) || []).length;
  return { emDashes, parenGlosses, scareQuotes, semicolons, total: emDashes + parenGlosses + scareQuotes + semicolons };
};

const countOccurrences = (haystack, needles) => {
  const found = [];
  let total = 0;
  needles.forEach((needle) => {
    // ספירת מופעים לא חופפים.
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

// כמו countOccurrences, אבל ל-regex גלובלי (AI_REGISTER_RE) במקום רשימת ביטויים מדויקים.
const countRegexOccurrences = (haystack, re) => {
  const matches = haystack.match(re) || [];
  const counts = new Map();
  matches.forEach((m) => counts.set(m, (counts.get(m) || 0) + 1));
  const found = [...counts.entries()].map(([phrase, count]) => ({ phrase, count })).sort((a, b) => b.count - a.count);
  return { total: matches.length, found };
};

// תבנית-מסמך אופיינית ל-AI: כותרות עם נקודתיים ("צבע המים: המים..."), כותרת-שאלה
// ("מה הופך אותו למיוחד?"), כותרות קצרות בין פסקאות, "מוסר השכל" בשתי המשפטים
// האחרונים, וזוג מנוגד "מצד אחד/מצד שני". כל אחד נקודה אחת, 0..5.
// נמדד (מחקר הכללים, אוגוסט 2026): 0% מהוויקיפדיה ומעבודות המשתמש מגיעים ל-4/5;
// טקסט AI ידוע-כחמקן (נחל האסי) מדד 5/5.
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

// חילוץ וקטור פיצ'רים מטקסט. דטרמיניסטי, בלי תלות בפרופיל.
export function extractAuthenticityFeatures(input = '') {
  const text = stripToText(input);
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const sentences = text.split(/[.!?…]+\s+/).map((s) => s.trim()).filter(Boolean);
  const words = text.match(/[֐-׿A-Za-z][֐-׿A-Za-z'"׳״-]*/g) || [];
  const wordCount = words.length;

  const contentWords = words
    .map((w) => w.replace(/^["'׳״-]+|["'׳״-]+$/g, '').toLowerCase())
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  // אורכי משפט (במילים) לחישוב burstiness.
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

  // תבנית-מסמך אופיינית ל-AI (ר' הערה ליד computeAiTemplateScore). מחושב כאן (לא רק
  // בהמשך) כי הבונוס לזוג "מצד אחד/מצד שני" צריך להיכנס למונה formalConnector לפני
  // חישוב הצפיפות למטה — FORMAL_CONNECTORS מכיל רק את הניסוח המדויק ("מצד אחד"/"מצד
  // שני"), והבונוס תופס גם וריאציות (מחד/מנגד/מאידך) שהמילון מפספס.
  const aiTemplateInfo = computeAiTemplateScore(text, sentences, paragraphs.length);
  if (aiTemplateInfo.balancedPair) formalConnectors.total += 1;

  // צפיפות ל-100 מילים.
  const per100 = (n) => (wordCount ? round((n / wordCount) * 100, 2) : 0);

  // סימני מבנה אופייניים ל-AI (מקפי הסבר, סוגריים מבארים, מרכאות-מטבע, נקודה-פסיק) — ר' הערה ליד computeStructuralEvents.
  const structural = computeStructuralEvents(text);
  const { emDashes, parenGlosses, scareQuotes, semicolons } = structural;
  const structuralEvents = structural.total;

  // עושר אוצר מילים (Type-Token Ratio על מילות תוכן).
  const uniqueContent = new Set(contentWords);
  const typeTokenRatio = contentWords.length ? round(uniqueContent.size / contentWords.length, 3) : 0;

  // חזרתיות פתיחים: הפתיח הנפוץ ביותר חלקי מספר המשפטים. במקביל עוקבים אחרי הרצף
  // הרצוף הארוך ביותר של אותו פתיח (anaphora) — ר' הערה ליד signals.openerRepeat:
  // אנפורה היא מכשיר רטורי אנושי (מכתב יום הולדת: "תודה על... תודה על... תודה על...")
  // שנמדד נפוץ *יותר* באנושי מאשר ב-AI, ואסור שיזהה כחזרתיות-מכונה.
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

  // התפלגות "פס-אורך" 10-30 מילים למשפט (band1030) — מרחיב את אחידות-האורך (uniformity):
  // ב-AI 41.8% מהטקסטים כל משפטיהם ב-10-30 מילים, מול 2.4% באנושי (lift 17). דורש
  // ≥5 משפטים "אמיתיים" (≥3 מילים) כדי לא להיתפס על טקסט קצר/מקוטע.
  const qualifyingSentenceLengths = sentenceLengths.filter((n) => n >= 3);
  let band1030Frac = null;
  if (qualifyingSentenceLengths.length >= 5) {
    const inBand = qualifyingSentenceLengths.filter((n) => n >= 10 && n <= 30).length;
    band1030Frac = inBand / qualifyingSentenceLengths.length;
  }

  // ניסוחי מסגור/המלצה "בטוחים" (AI_REGISTER_RE) לאלף מילים.
  const aiRegisterMatches = countRegexOccurrences(text, AI_REGISTER_RE);
  const aiRegisterPerThousand = wordCount ? round((aiRegisterMatches.total / wordCount) * 1000, 2) : 0;

  // 3-גרמים של תווים מול טבלת ה-LLR (AI_NGRAM_TABLE): חתימה התפלגותית שנוכחת גם
  // בטקסט AI "מנוקה" מקלישאות (stealth) — בשונה מהמרקרים המילוליים למעלה, שרשימה
  // קשיחה של ביטויים אפשר לעקוף במודע. ראה tools/detector-train/build-ngram-table.mjs.
  let ngramLlrMean = null;
  let ngramTopContrib = [];
  if (wordCount >= NGRAM_MIN_WORDS) {
    const { mean, topContrib } = computeNgramLlr(text);
    ngramLlrMean = mean;
    ngramTopContrib = topContrib;
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
    formalConnectorsFound: formalConnectors.found.slice(0, 6),
    clicheDensity: per100(cliches.total),
    clicheCount: cliches.total,
    clichesFound: cliches.found.slice(0, 6),
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
    topContentWords: Array.from(uniqueContent).slice(0, 40),
    ngramLlrMean: ngramLlrMean === null ? null : round(ngramLlrMean, 4),
    ngramTopContrib,
  };
}

// המרת פיצ'רים לסיגנלים 0..1 (1 = יותר גנרי/מכונה). null = אין מספיק נתונים לסיגנל.
function computeSignals(features, profile) {
  const signals = {};

  // 1. אחידות אורך משפט (burstiness נמוך = מכונה). דורש לפחות 3 משפטים.
  const cvSignal = (features.sentenceLengthCV === null || features.sentenceCount < 3)
    ? null
    : clamp01((0.50 - features.sentenceLengthCV) / 0.40);
  // 1b. band1030: נתח המשפטים שכולם ב-10-30 מילים — AI נעול על "טווח בטוח" הרבה
  // יותר מאנושי (41.8% מול 2.4%, lift 17). max ולא ממוצע עם ה-CV: כל אחד מהם לבד
  // יכול לתפוס AI שהשני מפספס (CV נמוך גם על AI לא-נעול-בטווח, band גם על AI עם CV גבוה).
  const bandSignal = features.band1030Frac === null
    ? null
    : clamp01((features.band1030Frac - 0.70) / 0.30);
  signals.uniformity = (cvSignal === null && bandSignal === null)
    ? null
    : Math.max(cvSignal ?? 0, bandSignal ?? 0);

  // ל-2/3/3b: צפיפות בלבד. זרועות הספירה-המוחלטת (8/4/18) הוסרו — הן הטו לפי אורך:
  // כל מסמך אקדמי ארוך הגיע ל-8 מחברים ו-18 סימני מבנה והרוויה נעל את הציון על ~80
  // בלי קשר לאנושיות (נמדד על עבודות אמיתיות: 80-86 לפני, 37-54 אחרי; זיהוי AI לא נפגע —
  // שער הקורפוס ב-tools/detector-train/length-bias-check.mjs).
  // 2. מחברים פורמליים. צפיפות 4/100 = רוויה.
  signals.formalConnector = clamp01(features.formalConnectorDensity / 4);

  // 3. קלישאות. צפיפות 1.5/100 = רוויה.
  signals.cliche = clamp01(features.clicheDensity / 1.5);

  // 3b. סימני מבנה (מקפים/סוגריים/מרכאות-מטבע/נקודה-פסיק). צפיפות 4.5/100 = רוויה.
  signals.structural = clamp01(features.structuralDensity / 4.5);

  // 4. עושר אוצר מילים נמוך. אמין רק על טקסט סביר. TTR 0.62→0, 0.32→1.
  signals.lowRichness = features.wordCount < 60
    ? null
    : clamp01((0.62 - features.typeTokenRatio) / 0.30);

  // 5. חזרתיות פתיחים. מוגן-אנפורה: אם אותו פתיח חוזר ב-≥3 משפטים *רצופים* — זה
  // מכשיר רטורי אנושי (anaphora, "תודה על... תודה על..." במכתב) ולא חזרתיות-מכונה.
  // נמדד שאנפורה נפוצה יותר באנושי מ-AI; בלי המגן הזה מכתב-יום-הולדת אמיתי דורג AI.
  signals.openerRepeat = (features.sentenceCount < 4 || features.maxConsecutiveSameOpener >= 3)
    ? null
    : clamp01((features.openerRepetitionRate - 0.12) / 0.25);

  // 6. סטייה מהסגנון האישי הנלמד (רק אם יש פרופיל עם נתונים).
  const learnedVocab = Array.isArray(profile?.learnedVocabulary) ? profile.learnedVocabulary.map((w) => String(w).toLowerCase()) : [];
  const profSent = Number(profile?.styleFingerprint?.avgSentenceWords) || 0;
  if (learnedVocab.length >= 8) {
    const vocabSet = new Set(learnedVocab);
    const top = features.topContentWords || [];
    const overlap = top.length ? top.filter((w) => vocabSet.has(w)).length / top.length : 0;
    const sentDev = profSent > 0 ? clamp01(Math.abs(features.avgSentenceWords - profSent) / Math.max(profSent, 6)) : 0;
    signals.personalMismatch = clamp01(0.6 * (1 - overlap) + 0.4 * sentDev);
  } else {
    signals.personalMismatch = null;
  }

  // 7. חתימת 3-גרמים סטטיסטית מול טבלת ה-LLR (AI מול אנושי).
  signals.ngramGeneric = features.ngramLlrMean === null
    ? null
    : clamp01((features.ngramLlrMean - AI_NGRAM_TABLE.meta.lowAnchor) / (AI_NGRAM_TABLE.meta.highAnchor - AI_NGRAM_TABLE.meta.lowAnchor));

  // 8. תבנית-מסמך אופיינית ל-AI (0..5, ר' computeAiTemplateScore). דורש ≥80 מילים.
  signals.aiTemplate = features.wordCount < 80
    ? null
    : clamp01((features.aiTemplateScore - 2) / 3);

  // 9. ניסוחי מסגור/המלצה "בטוחים" לאלף מילים. דורש ≥60 מילים.
  signals.aiRegister = features.wordCount < 60
    ? null
    : clamp01(features.aiRegisterPerThousand / 6);

  return signals;
}

const SIGNAL_LABELS = {
  uniformity: 'אורך משפטים אחיד מדי (חסר קצב אנושי)',
  formalConnector: 'צפיפות גבוהה של מחברים פורמליים',
  cliche: 'קלישאות שחוקות אופייניות ל-AI',
  structural: 'מבנה מלוטש-מדי (מקפים, סוגריים מבארים, מרכאות-מטבע, נקודה-פסיק)',
  lowRichness: 'אוצר מילים חוזר/דל',
  openerRepeat: 'פתיחי משפט חוזרים',
  personalMismatch: 'לא תואם את הסגנון הנלמד שלך',
  ngramGeneric: 'תבנית סטטיסטית ברמת התו האופיינית לטקסט מחולל',
  aiTemplate: 'תבנית מסמך אופיינית ל-AI (כותרות/כותרת-שאלה/מוסר-השכל/ניגוד מאוזן)',
  aiRegister: 'ניסוחי מסגור והמלצה אופייניים ל-AI',
};

// ניתוח לפי משפט — לסימון ויזואלי בעורך (wavy underline), לא לניקוד המסמך הכולל.
// עובד על ה-input הגולמי (לא stripToText!) כדי שה-offsets שמוחזרים יהיו תקפים מול
// אותו טקסט שהמזמין העביר (בפועל: editor.getText(), טקסט רגיל בלי HTML).
// לכל משפט (מינימום 6 מילים, אחרת מדלגים): ngram LLR + מחברים/קלישאות + מבנה, בלי
// תלות בפרופיל אישי (אין מספיק הקשר במשפט בודד ל-personalMismatch/uniformity/openerRepeat).
function analyzeOneSentence(sentText, start, end, words) {
  const { mean: llrMean, topContrib } = computeNgramLlr(sentText);
  const formalConnectors = countOccurrences(sentText, FORMAL_CONNECTORS);
  const cliches = countOccurrences(sentText, CLICHE_PHRASES);
  const structural = computeStructuralEvents(sentText);
  const aiRegister = countRegexOccurrences(sentText, AI_REGISTER_RE);

  const lowAnchor = AI_NGRAM_TABLE.meta.lowAnchor;
  const highAnchor = AI_NGRAM_TABLE.meta.highAnchor;
  const base = llrMean === null ? 0 : clamp01((llrMean - lowAnchor) / (highAnchor - lowAnchor));

  const lexiconHitCount = formalConnectors.total + cliches.total + aiRegister.total;
  const lexiconBoost = Math.min(0.3, lexiconHitCount * 0.15);
  const structuralBoost = structural.total >= 2 ? 0.1 : 0;
  const level = clamp01(base + lexiconBoost + structuralBoost);

  const reasons = [];
  if (llrMean !== null && base >= 0.5) {
    const detail = topContrib.length ? topContrib.map((g) => `"${g.gram}"(${g.llr > 0 ? '+' : ''}${g.llr})`).join(', ') : '';
    reasons.push({ key: 'ngramGeneric', label: SIGNAL_LABELS.ngramGeneric, detail });
  }
  if (formalConnectors.total > 0) {
    reasons.push({ key: 'formalConnector', label: SIGNAL_LABELS.formalConnector, detail: formalConnectors.found.map((f) => `"${f.phrase}"×${f.count}`).join(', ') });
  }
  if (cliches.total > 0) {
    reasons.push({ key: 'cliche', label: SIGNAL_LABELS.cliche, detail: cliches.found.map((f) => `"${f.phrase}"×${f.count}`).join(', ') });
  }
  if (aiRegister.total > 0) {
    reasons.push({ key: 'aiRegister', label: SIGNAL_LABELS.aiRegister, detail: aiRegister.found.map((f) => `"${f.phrase}"×${f.count}`).join(', ') });
  }
  if (structural.total >= 2) {
    const d = structural;
    reasons.push({
      key: 'structural',
      label: SIGNAL_LABELS.structural,
      detail: [d.emDashes && `מקפים×${d.emDashes}`, d.parenGlosses && `סוגריים×${d.parenGlosses}`, d.scareQuotes && `מרכאות×${d.scareQuotes}`, d.semicolons && `נק'-פסיק×${d.semicolons}`].filter(Boolean).join(', '),
    });
  }

  return { text: sentText, start, end, words, level: round(level, 3), reasons };
}

export function analyzeSentencesAuthenticity(text = '') {
  const raw = String(text || '');
  if (!raw.trim()) return { ok: false, sentences: [] };

  const wordRe = /[֐-׿A-Za-z][֐-׿A-Za-z'"׳״-]*/g;
  const boundaryRe = /[.!?…]+[\s\n]+/g;
  const punctRe = /^[.!?…]+/;

  const sentences = [];
  const tryPush = (start, end) => {
    const chunk = raw.slice(start, end);
    const leadTrim = chunk.length - chunk.trimStart().length;
    const trailTrim = chunk.length - chunk.trimEnd().length;
    const sStart = start + leadTrim;
    const sEnd = end - trailTrim;
    if (sEnd <= sStart) return;
    const sentText = raw.slice(sStart, sEnd);
    const words = (sentText.match(wordRe) || []).length;
    if (words < 6) return;
    sentences.push(analyzeOneSentence(sentText, sStart, sEnd, words));
  };

  let cursor = 0;
  let match;
  boundaryRe.lastIndex = 0;
  while ((match = boundaryRe.exec(raw)) !== null) {
    const punct = match[0].match(punctRe);
    const sentenceEnd = match.index + (punct ? punct[0].length : match[0].length);
    tryPush(cursor, sentenceEnd);
    cursor = match.index + match[0].length;
  }
  tryPush(cursor, raw.length);

  return { ok: true, sentences };
}

// ניקוד טקסט: score 0-100 + label + markers מוסברים.
// opts: { profile?, calibration? } — אם לא נמסרו, נטענים מהפרופיל האישי.
export function scoreTextAuthenticity(input = '', opts = {}) {
  const features = extractAuthenticityFeatures(input);
  if (features.wordCount < 25) {
    return { ok: false, reason: 'too-short', message: 'הטקסט קצר מדי לניתוח אמין (פחות מ-25 מילים).', features };
  }

  const profile = opts.profile || getPersonalStyleProfile?.() || {};
  const rawCalibration = opts.calibration || profile?.authenticityCalibration || null;
  // כיול שנשמר לפני הוספת ngramGeneric (אוגוסט 2026) הוא stale: המשקלים שלו
  // חסרים את הסיגנל (cap 0 ⇒ הסיגנל החזק ביותר מת בשקט), והסף שלו כויל על סקאלת
  // ציונים ישנה. במקרה כזה מתעלמים מהכיול (calibrated=false) עד שהמשתמש יתייג
  // דוגמה נוספת — trainAuthenticityCalibration ירוץ אז מחדש ויכלול את הסיגנל.
  const calibration = (rawCalibration?.weights && !('ngramGeneric' in rawCalibration.weights))
    ? null
    : rawCalibration;
  // מיזוג מעל ברירת המחדל — סיגנל עתידי שיתווסף לא יימחק שוב ע"י כיול ישן.
  const weights = (calibration && calibration.weights)
    ? { ...DEFAULT_WEIGHTS, ...calibration.weights }
    : DEFAULT_WEIGHTS;

  const signals = computeSignals(features, profile);

  // צירוף noisy-OR: score = 1 - Π(1 - signal·cap). סיגנל בודד חזק לא מדולל; מספר סיגנלים מצטברים.
  let product = 1;
  const breakdown = {};
  Object.keys(signals).forEach((key) => {
    const signal = signals[key];
    if (signal === null || signal === undefined) return;
    const cap = Number(weights[key]) || 0;
    if (cap <= 0) return;
    product *= (1 - signal * cap);
    breakdown[key] = { signal: round(signal, 3), cap: round(cap, 3) };
  });

  const score = Math.round((1 - product) * 100);

  // סף החלטה: מהכיול אם קיים, אחרת DEFAULT_THRESHOLD.
  const threshold = (calibration && Number.isFinite(calibration.threshold)) ? calibration.threshold : DEFAULT_THRESHOLD;
  let label;
  if (score < Math.max(30, threshold - 20)) label = 'נשמע אנושי / בסגנונך';
  else if (score < threshold) label = 'מעורב';
  else label = 'נשמע גנרי / מכונה';

  // markers: סיגנלים מעל 0.5, או מחברים/קלישאות שנמצאו בפועל.
  const markers = [];
  Object.keys(signals).forEach((key) => {
    const signal = signals[key];
    if (signal === null) return;
    if (signal >= 0.5) {
      let detail = '';
      if (key === 'formalConnector' && features.formalConnectorsFound.length) {
        detail = features.formalConnectorsFound.map((f) => `"${f.phrase}"×${f.count}`).join(', ');
      } else if (key === 'cliche' && features.clichesFound.length) {
        detail = features.clichesFound.map((f) => `"${f.phrase}"×${f.count}`).join(', ');
      } else if (key === 'uniformity') {
        detail = `CV=${features.sentenceLengthCV} (נמוך=אחיד), ${Math.round((features.band1030Frac ?? 0) * 100)}% מהמשפטים ב-10-30 מילים`;
      } else if (key === 'structural') {
        const d = features.structuralDetail || {};
        detail = [d.emDashes && `מקפים×${d.emDashes}`, d.parenGlosses && `סוגריים×${d.parenGlosses}`, d.scareQuotes && `מרכאות×${d.scareQuotes}`, d.semicolons && `נק'-פסיק×${d.semicolons}`].filter(Boolean).join(', ');
      } else if (key === 'lowRichness') {
        detail = `TTR=${features.typeTokenRatio}`;
      } else if (key === 'openerRepeat') {
        detail = `פתיח חוזר ב-${Math.round(features.openerRepetitionRate * 100)}% מהמשפטים`;
      } else if (key === 'ngramGeneric' && features.ngramTopContrib?.length) {
        detail = features.ngramTopContrib.map((g) => `"${g.gram}"(${g.llr > 0 ? '+' : ''}${g.llr})`).join(', ');
      } else if (key === 'aiTemplate' && features.aiTemplateDetail?.length) {
        detail = features.aiTemplateDetail.join(', ');
      } else if (key === 'aiRegister' && features.aiRegisterFound?.length) {
        detail = features.aiRegisterFound.map((f) => `"${f.phrase}"×${f.count}`).join(', ');
      }
      markers.push({ key, label: SIGNAL_LABELS[key], severity: round(signal, 2), detail });
    }
  });
  markers.sort((a, b) => b.severity - a.severity);

  return {
    ok: true,
    score,
    label,
    threshold,
    calibrated: Boolean(calibration && calibration.weights),
    markers,
    breakdown,
    features,
  };
}

// פורמוט תוצאה לטקסט עברי (ל-MagicWand, AiSidebar, toast). מקבל את פלט scoreTextAuthenticity.
export function formatAuthenticityResultText(result) {
  if (!result || !result.ok) {
    return result?.message || 'לא ניתן לנתח את הטקסט.';
  }
  const humanCutoff = Math.max(30, result.threshold - 20);
  const emoji = result.score >= result.threshold ? '🤖' : (result.score < humanCutoff ? '✍️' : '⚖️');
  const lines = [`${emoji} ציון "נשמע גנרי/מכונה": ${result.score}/100 — ${result.label}`];
  if (result.calibrated) lines.push('(מכויל לפי הדוגמאות שתייגת)');
  if (Array.isArray(result.markers) && result.markers.length) {
    lines.push('', 'סימנים שזוהו:');
    result.markers.forEach((m) => lines.push(`• ${m.label}${m.detail ? ` — ${m.detail}` : ''}`));
  } else {
    lines.push('', 'לא זוהו סימנים בולטים של טקסט גנרי.');
  }
  lines.push('', 'ℹ️ אומדן רך, לא פסק-דין. טקסט אנושי מלוטש עלול להיתפס כגנרי ולהפך.');
  return lines.join('\n');
}

// תיוג קטע נבחר מהעורך → מאמן את הגלאי וגם מחנך את סוכני היצירה (דרך הפרופיל האישי).
// kind='desired': הסגנון הרצוי — נשמר כדוגמה לחיקוי (preferredTrainingExamples) + calibration 'me'.
// kind='ai': נשמע כמו AI — המרקרים הופכים לכללי 'הימנע' (dislikedStylePatterns) + calibration 'ai'.
// השדות preferredTrainingExamples/dislikedStylePatterns כבר מוזרקים לכל קריאת AI ב-buildPersonalStyleInstructions.
const MAX_CURATED_EXAMPLES = 5;
const CURATED_EXAMPLE_MAX_CHARS = 400;
const MAX_AVOID_NOTES = 8;

export function tagStyleSample(text = '', kind = 'desired') {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length < 25) {
    return { ok: false, reason: 'too-short', message: 'בחר קטע ארוך יותר (לפחות ~25 מילים) כדי לתייג סגנון.' };
  }
  const isDesired = kind === 'desired';

  // 1. הזנת הגלאי.
  const cal = addAuthenticitySample(clean, isDesired ? 'me' : 'ai');

  // 2. חינוך הסוכנים — קריאה מחדש של הפרופיל אחרי שהכיול שמר.
  const profile = getPersonalStyleProfile?.() || {};
  const next = { ...profile };

  if (isDesired) {
    const snippet = clean.slice(0, CURATED_EXAMPLE_MAX_CHARS);
    const prev = Array.isArray(profile.preferredTrainingExamples) ? profile.preferredTrainingExamples : [];
    next.preferredTrainingExamples = [...prev.filter((e) => String(e).trim() !== snippet), snippet].slice(-MAX_CURATED_EXAMPLES);
  } else {
    const res = scoreTextAuthenticity(clean, { profile });
    const markerNotes = (res.ok ? res.markers : []).map((m) => m.label).filter(Boolean);
    const prev = Array.isArray(profile.dislikedStylePatterns) ? profile.dislikedStylePatterns : [];
    next.dislikedStylePatterns = Array.from(new Set([...prev, ...markerNotes])).slice(-MAX_AVOID_NOTES);
  }
  savePersonalStyleProfile?.(next);

  // 3. אם מנוע הסגנון (Style Engine) פעיל — נתב גם לשם, בנוסף לשדות ה-legacy מעל.
  //    ה-legacy מוזרק רק כשהמנוע כבוי (ראה buildPersonalStyleInstructions), אז בלעדי זה
  //    תיוג "הסגנון שלי" הופך למת-קצה עבור משתמשי המנוע.
  try {
    const engineOn = next?.styleEngine?.enabled === true;
    const wordCount = (clean.match(/[֐-׿A-Za-z0-9'"׳״-]+/g) || []).length;
    if (engineOn && isDesired && wordCount >= 25) {
      addGoldChunk({ text: clean, title: 'סומן כסגנון שלי' });
      const updatedProfile = { ...next, styleEngine: { ...next.styleEngine, qualitativePatternsStale: true } };
      savePersonalStyleProfile?.(updatedProfile);
    }
  } catch (err) {
    console.warn('[styleAuthenticityService] tagStyleSample: style-engine routing failed (non-fatal):', err);
  }

  return {
    ok: true,
    kind: isDesired ? 'desired' : 'ai',
    trained: cal?.trained || null,
    meCount: cal?.meCount,
    aiCount: cal?.aiCount,
    message: isDesired
      ? 'נשמר כסגנון רצוי ✓ — הסוכנים יחקו אותו, והגלאי לומד שזה אתה.'
      : 'סומן כ"נשמע כמו AI" ✓ — הגלאי מתאמן, והסוכנים ילמדו להימנע מהדפוסים האלה.',
  };
}

// ===== שכבת כיול =====

export function getAuthenticityCalibration() {
  const profile = getPersonalStyleProfile?.() || {};
  return profile?.authenticityCalibration || { samples: [], weights: null, threshold: null, trainedAt: null };
}

// הוספת דוגמה מתויגת. label: 'me' | 'ai'. מאמן מחדש אוטומטית כשיש מספיק מכל קלאס.
export function addAuthenticitySample(text = '', label = 'me') {
  const normalizedLabel = label === 'ai' ? 'ai' : 'me';
  const features = extractAuthenticityFeatures(text);
  if (features.wordCount < 25) {
    return { ok: false, reason: 'too-short', message: 'הדוגמה קצרה מדי (פחות מ-25 מילים).' };
  }

  const profile = getPersonalStyleProfile?.() || {};
  const calibration = profile.authenticityCalibration || { samples: [], weights: null, threshold: null, trainedAt: null };
  const samples = Array.isArray(calibration.samples) ? calibration.samples.slice() : [];
  samples.push({ label: normalizedLabel, features, addedAt: new Date().toISOString() });
  // שמירת חלון אחרון.
  const trimmed = samples.slice(-MAX_CALIBRATION_SAMPLES);

  const nextCalibration = { ...calibration, samples: trimmed };
  savePersonalStyleProfile?.({ ...profile, authenticityCalibration: nextCalibration });

  const meCount = trimmed.filter((s) => s.label === 'me').length;
  const aiCount = trimmed.filter((s) => s.label === 'ai').length;
  let trained = null;
  if (meCount >= 2 && aiCount >= 2) {
    trained = trainAuthenticityCalibration();
  }
  return { ok: true, meCount, aiCount, trained };
}

export function removeAuthenticitySample(index) {
  const profile = getPersonalStyleProfile?.() || {};
  const calibration = profile.authenticityCalibration;
  if (!calibration || !Array.isArray(calibration.samples)) return { ok: false, reason: 'no-samples' };
  const samples = calibration.samples.slice();
  if (index < 0 || index >= samples.length) return { ok: false, reason: 'out-of-range' };
  samples.splice(index, 1);
  savePersonalStyleProfile?.({ ...profile, authenticityCalibration: { ...calibration, samples } });
  return { ok: true, remaining: samples.length };
}

// אימון: ממוצע סיגנל לכל קלאס → משקל ∝ כושר ההפרדה |mean_ai - mean_me|.
// סף = נקודת האמצע בין ציוני שני הקלאסים תחת המשקלים החדשים.
export function trainAuthenticityCalibration() {
  const profile = getPersonalStyleProfile?.() || {};
  const calibration = profile.authenticityCalibration || { samples: [] };
  const samples = Array.isArray(calibration.samples) ? calibration.samples : [];
  const me = samples.filter((s) => s.label === 'me');
  const ai = samples.filter((s) => s.label === 'ai');
  if (me.length < 2 || ai.length < 2) {
    return { ok: false, reason: 'insufficient-samples', meCount: me.length, aiCount: ai.length };
  }

  const signalKeys = Object.keys(DEFAULT_WEIGHTS);

  // ממוצע סיגנל לכל קלאס (מתעלם מ-null).
  const classMean = (group) => {
    const sums = {};
    const counts = {};
    group.forEach((sample) => {
      const sig = computeSignals(sample.features, profile);
      signalKeys.forEach((key) => {
        if (sig[key] === null || sig[key] === undefined) return;
        sums[key] = (sums[key] || 0) + sig[key];
        counts[key] = (counts[key] || 0) + 1;
      });
    });
    const means = {};
    signalKeys.forEach((key) => { means[key] = counts[key] ? sums[key] / counts[key] : null; });
    return means;
  };

  const meMeans = classMean(me);
  const aiMeans = classMean(ai);

  // תקרה (cap) לכל סיגנל = פונקציה של כושר ההפרדה בין הקלאסים. הפרדה גבוהה → cap גבוה.
  // אם אין נתון לאחד הקלאסים → ברירת מחדל מוקטנת. תחום [0.2, 0.65] מתאים ל-noisy-OR.
  const weights = {};
  signalKeys.forEach((key) => {
    if (meMeans[key] === null || aiMeans[key] === null) {
      weights[key] = round(DEFAULT_WEIGHTS[key] * 0.6, 4);
    } else {
      const separation = Math.abs(aiMeans[key] - meMeans[key]);
      weights[key] = round(Math.max(0.2, Math.min(0.65, 0.2 + separation)), 4);
    }
  });

  // ציון קלאס תחת ה-caps החדשים ב-noisy-OR → סף באמצע.
  const classScore = (means) => {
    let product = 1;
    signalKeys.forEach((key) => {
      if (means[key] === null) return;
      product *= (1 - means[key] * weights[key]);
    });
    return (1 - product) * 100;
  };
  const meScore = classScore(meMeans);
  const aiScore = classScore(aiMeans);
  const threshold = Math.round((meScore + aiScore) / 2);

  const nextCalibration = {
    ...calibration,
    weights,
    threshold,
    trainedAt: new Date().toISOString(),
    meScore: round(meScore),
    aiScore: round(aiScore),
    meCount: me.length,
    aiCount: ai.length,
  };
  savePersonalStyleProfile?.({ ...profile, authenticityCalibration: nextCalibration });
  return { ok: true, weights, threshold, meScore: round(meScore), aiScore: round(aiScore) };
}
