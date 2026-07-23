// assignmentSpecService.js — פירוק הנחיות מטלה לשלד מסמך. דטרמיניסטי לחלוטין.
//
// אפס קריאות API, אפס מודל. regex + חוקים בלבד. זה המסלול שעובד למשתמש בלי מפתח:
// הנחיות המטלה → סעיפים, כוונת כתיבה לכל סעיף, מכסות מילים, דרישת מקורות.
//
// עיקרון: הפלט הוא הצעה *נערכת*. פרסר שטועה בשקט גרוע מפרסר שלא קיים — לכן כל
// שדה נושא confidence, ו-warnings[] מסביר מה לא נמצא. ה-UI מציג ומאפשר תיקון לפני
// שנבנה שלד.
//
// גבולות מוצהרים: לא מזהה מבנה מרומז ("כתוב עבודה על X" בלי סעיפים) — במקרה כזה
// מוחזר sections=[] ו-warning, וה-UI מציע תבנית ברירת מחדל. עדיף מלהמציא סעיפים.
//
// תלויות: styleSampleStore (extractTerms בלבד). LEAF, browser+node.

import { extractTerms } from './styleSampleStore';

// ---------- קבועים ----------

// עמוד אקדמי סטנדרטי בעברית, רווח כפול, גופן 12 — לצורך המרת "עמודים"→"מילים".
const WORDS_PER_PAGE = 250;

const WORD_RE = /[֐-׿A-Za-z0-9'"׳״-]+/g;
const countWords = (s = '') => (String(s || '').match(WORD_RE) || []).length;

// אותיות ordinal עבריות בסדר המקובל (לא ערך גימטרי — סדר רשימה).
const HEB_ORDINALS = 'אבגדהוזחטיכלמנסעפצקרשת'.split('');

// פעלים מנחים → כוונת כתיבה. הראשון שנמצא בטקסט הסעיף מנצח, לפי סדר הספציפיות:
// השוואה לפני ניתוח (כי "השווה ונתח" הוא בעיקרו השוואה), ניתוח לפני סקירה.
//
// ⚠️ בלי \b סביב מונחים עבריים. \b ב-JS הוא גבול ASCII, ואות עברית אינה \w — ולכן
// /\bנתח\b/ לעולם אינו מתאים ל"נתחו את הממצאים". התאמת תת-מחרוזת היא הנכונה כאן
// וגם רצויה: היא סופגת נטיות ותחיליות ("ונתחו", "בניתוח") בלי רשימה אינסופית.
// \b נשמר רק סביב מונחים לטיניים, שם הוא כן עובד.
const INTENT_RULES = [
  { intent: 'comparison', re: /(השוו|השווא|הבדל|בהשוואה|לעומת|\b(?:contrast|compare)\b)/i },
  { intent: 'argument',   re: /(טענו|טען |נמק|הצדיק|הצדק|עמדתך|עמדתכם|שכנע|\b(?:argue|justify)\b)/i },
  { intent: 'analysis',   re: /(נתח|ניתוח|בחנו|בחן |בדקו|העריכ|הערכה|דונו|דיון|\b(?:analyz|examine|discuss|evaluate)\b)/i },
  { intent: 'review',     re: /(סקור|סקרו|סקיר|מיפוי|רקע תיאורטי|\b(?:literature review|survey)\b)/i },
  { intent: 'method',     re: /(שיטת המחקר|מתודולוג|כלי המחקר|משתתפים|מדגם|הליך המחקר|\b(?:methodolog|participants|procedure)\b)/i },
  { intent: 'findings',   re: /(ממצאים|תוצאות המחקר|\b(?:results|findings)\b)/i },
  { intent: 'conclusion', re: /(מסקנ|סיכום|לסיכום|סכמו|המלצות|\b(?:conclusion|recommendation)\b)/i },
  { intent: 'intro',      re: /(מבוא|הקדמה|רקע כללי|\bintroduction\b)/i },
  { intent: 'exposition', re: /(הסבר|תארו|תאר |הציגו|הצג |פרטו|הגדירו|\b(?:explain|describe|present|define)\b)/i },
];

// תבניות פתיח סעיף. הסדר חשוב — הספציפי לפני הכללי.
const SECTION_PATTERNS = [
  // "שאלה 3:", "חלק ב'", "פרק 2 -", "סעיף 4."
  { kind: 'named',   re: /^\s*(שאלה|חלק|פרק|סעיף|נספח|part|section|question)\s+([0-9]+|[א-ת]['׳]?)\s*[:.)\-–—]?\s*(.*)$/i },
  // Markdown
  { kind: 'heading', re: /^\s*(#{1,4})\s+(.+?)\s*$/ },
  // "1." / "2)" / "1.3." / גם **בלי רווח** אחרי הנקודה.
  //
  // ⚠️ הרווח היה חובה (`\s+`), וזה הכשיל את רוב ההנחיות האמיתיות: חילוץ טקסט
  // מ-PDF מדביק את המספר לכותרת ("1.תיאור המשבר"). נמדד על 30 קבצי מרצים.
  // ה-lookahead דורש שאחרי הסימן יבוא תו שאינו ספרה, כדי לא לבלוע תאריכים
  // ("1.6.2026") ומספרים עשרוניים.
  { kind: 'numeric', re: /^\s*(\d+(?:\.\d+)*)\s*[.)]\s*(?=[^\d\s])(.+)$/ },
  // "א." / "ב)" / "ג׳." — גם כאן בלי רווח חובה.
  { kind: 'hebrew',  re: /^\s*([א-ת])['׳]?\s*[.)]\s*(?=[^\d\s])(.+)$/ },
];

// ---------- עזרים ----------

const clean = (s) => String(s || '').replace(/\r\n/g, '\n').replace(/[\t ]+/g, ' ');

// המרת מספר עברי-מילולי בסיסי ("שלושה מקורות"). מכסה רק 1-10 — מעבר לזה כותבים ספרות.
const HEB_NUMBERS = {
  אחד: 1, אחת: 1, שני: 2, שניים: 2, שתי: 2, שתיים: 2, שלוש: 3, שלושה: 3,
  ארבע: 4, ארבעה: 4, חמש: 5, חמישה: 5, שש: 6, שישה: 6, שבע: 7, שבעה: 7,
  שמונה: 8, תשע: 9, תשעה: 9, עשר: 10, עשרה: 10,
};

function parseCount(token) {
  const raw = String(token || '').trim();
  const digits = Number(raw.replace(/[^\d]/g, ''));
  if (Number.isFinite(digits) && digits > 0) return digits;
  return HEB_NUMBERS[raw] || null;
}

// מיוצא: styleOpenerService מסווג את הפסקאות של המשתמש באותם כללים בדיוק, כדי
// שהפתיחים שיוצעו לסעיף יהיו מאותה משפחה רטורית.
export function detectIntent(text) {
  for (const rule of INTENT_RULES) {
    if (rule.re.test(text)) return rule.intent;
  }
  return 'exposition';
}

// ---------- מכסות מילים ----------

/**
 * מחלץ מכסת מילים מקטע טקסט.
 * @returns {{words:number, kind:('max'|'min'|'about'|'range'), source:string}|null}
 */
export function extractWordQuota(text) {
  const src = clean(text);

  // טווח: "1000-1500 מילים" / "בין 1000 ל-1500 מילים"
  const range = src.match(/(?:בין\s+)?(\d[\d,]*)\s*(?:-|–|עד|ל-)\s*(\d[\d,]*)\s*(מילים|מלים|words)/i);
  if (range) {
    const lo = Number(range[1].replace(/,/g, ''));
    const hi = Number(range[2].replace(/,/g, ''));
    if (lo > 0 && hi >= lo) return { words: Math.round((lo + hi) / 2), kind: 'range', source: range[0] };
  }

  // עמודים — מומר למילים. טווח עמודים נלקח בממוצע.
  const pageRange = src.match(/(\d+)\s*(?:-|–|עד)\s*(\d+)\s*(עמודים|עמ'|pages)/i);
  if (pageRange) {
    const avg = (Number(pageRange[1]) + Number(pageRange[2])) / 2;
    return { words: Math.round(avg * WORDS_PER_PAGE), kind: 'range', source: pageRange[0] };
  }

  const singleWords = src.match(/(עד|לפחות|לא יותר מ-?|לא פחות מ-?|כ-?|בהיקף של|היקף:?)\s*(\d[\d,]*)\s*(מילים|מלים|words)/i);
  if (singleWords) {
    const n = Number(singleWords[2].replace(/,/g, ''));
    const lead = singleWords[1];
    const kind = /לפחות|לא פחות/.test(lead) ? 'min' : (/^כ/.test(lead) || /בהיקף|היקף/.test(lead) ? 'about' : 'max');
    if (n > 0) return { words: n, kind, source: singleWords[0] };
  }

  const pages = src.match(/(עד|לפחות|כ-?|בהיקף של)?\s*(\d+)\s*(עמודים|עמ'|pages)/i);
  if (pages) {
    const n = Number(pages[2]);
    if (n > 0) return { words: n * WORDS_PER_PAGE, kind: pages[1] && /לפחות/.test(pages[1]) ? 'min' : 'about', source: pages[0] };
  }

  // "מילים: 1200" בלי מילת כמת
  const bare = src.match(/(\d[\d,]{2,})\s*(מילים|מלים|words)/i);
  if (bare) {
    const n = Number(bare[1].replace(/,/g, ''));
    if (n > 0) return { words: n, kind: 'about', source: bare[0] };
  }
  return null;
}

// ניסוחים שמצהירים במפורש על היקף *העבודה כולה*, להבדיל ממכסה של סעיף.
// נמדד ב-e2e: בלי זה, "היקף כולל: 700 מילים" בראש המסמך לא נתפס (יש "כולל:"
// בין "היקף" למספר), והסורק המשיך וקלט את "עד 250 מילים" של הסעיף האחרון —
// כלומר ההיקף הכולל של העבודה נקבע לפי סעיף בודד, ומשם התפזרו מכסות שגויות.
// "(כ-1600 מילים לשני הסעיפים)" הוא הצהרה גלובלית לכל דבר — הוא פשוט לא משתמש
// במילה "היקף". בלי הזנב הזה הוא נקרא כגישוש ונדרס בסכום הסעיפים.
const GLOBAL_QUOTA_CUES = /(?:היקף\s+(?:כולל|העבודה|המטלה|כללי)|אורך\s+(?:העבודה|המטלה)|סה["׳']?כ|בסך\s+הכול|היקף\s+כולל|ל(?:כל|שני|שלושת|ארבעת)\s+ה(?:סעיפים|שאלות|חלקים))/;

/**
 * מכסת המילים של העבודה כולה. מעדיפה שורה שמצהירה על היקף גלובלי; רק אם אין
 * כזו נופלת לסריקת המסמך כולו (ואז "עד 250 מילים" של סעיף אכן ייתפס — אבל
 * במסמך בלי הצהרה גלובלית זו באמת ההערכה הטובה ביותר שיש).
 */
function extractGlobalWordQuota(text) {
  const lines = String(text || '').split('\n');
  for (const line of lines) {
    if (!GLOBAL_QUOTA_CUES.test(line)) continue;
    const hit = extractWordQuota(line);
    if (hit) return { ...hit, scope: 'global' };
  }
  return extractWordQuota(text);
}

// ---------- דרישות גלובליות ----------

// שמות הפריט הביבליוגרפי כפי שמרצים כותבים בפועל. "פריטי מקור" ו"כתבות" נוספו
// אחרי שנמדדו במטלות אמיתיות — בלעדיהם דרישות מפורשות פשוט לא נראו.
const SOURCE_NOUN = '(?:מקורות|מקור|מאמרים|מאמר|פריטי\\s*מקור|פריטים\\s*ביבליוגרפיים|הפניות|כתבות|references|sources|articles)';
// תארים שמפרידים בין המספר לשם הפריט: "שלושה מאמרים **אקדמיים** לפחות".
const SOURCE_ADJ = '(?:\\s*(?:אקדמיים|אקדמי|שפיטים|שפיט|עדכניים|רלוונטיים|מגוונים|נוספים|שונים))*';

/**
 * דרישת מספר המקורות. נמדד על מטלות אמיתיות: הניסוח מגיע בשלושה סדרים שונים,
 * והתמיכה רק בסדר אחד החמיצה יותר ממחצית מהמקרים שכן צוינו.
 */
function extractSourceRequirement(text) {
  const src = clean(text);

  // 1. "לפחות שלושה פריטי מקור" / "לפחות 5 מקורות"
  const before = src.match(new RegExp(
    `(?:לפחות|מינימום|לכל הפחות|לא פחות מ-?)\\s*([\\dא-ת]+)\\s*${SOURCE_NOUN}`, 'i'));
  if (before) {
    const n = parseCount(before[1]);
    if (n) return { count: n, kind: 'min' };
  }

  // 2. "שבעה מאמרים לפחות" / "מאמרים אקדמיים (שלושה לפחות)" — המספר לפני שם
  //    הפריט או אחריו, ו"לפחות" סוגר את הביטוי.
  const after = src.match(new RegExp(
    `([\\dא-ת]+)\\s*${SOURCE_NOUN}${SOURCE_ADJ}\\s*[)]?\\s*לפחות`, 'i'))
    || src.match(new RegExp(`${SOURCE_NOUN}${SOURCE_ADJ}\\s*[(]?\\s*([\\dא-ת]+)\\s*לפחות`, 'i'));
  if (after) {
    const n = parseCount(after[1]);
    if (n) return { count: n, kind: 'min' };
  }

  // 3. "לפחות מאמר אקדמי אחד" — הכמת בסוף. מוגבל ל"אחד/אחת" כי רק שם הסדר הזה
  //    חד-משמעי; "לפחות מאמרים שלושה" אינו עברית תקנית ולא נצפה.
  const trailing = src.match(new RegExp(
    `(?:לפחות|מינימום)\\s*${SOURCE_NOUN}${SOURCE_ADJ}\\s*(אחד|אחת)`, 'i'));
  if (trailing) return { count: 1, kind: 'min' };

  // 4. בלי "לפחות" — אמירה כמותית רכה.
  const loose = src.match(new RegExp(`([\\dא-ת]+)\\s*${SOURCE_NOUN}${SOURCE_ADJ}`, 'i'));
  if (loose) {
    const n = parseCount(loose[1]);
    if (n) return { count: n, kind: 'about' };
  }
  return null;
}

/**
 * משקל הסעיף בציון: "(400 מילים, 20 נקודות)" או "...סיפור המאבק. 20%".
 *
 * למה זה חשוב: זו האמירה המפורשת של המרצה על חשיבות יחסית של הסעיף, והיא
 * הבסיס הנכון לחלוקת מכסות — טוב בהרבה מאורך ההנחיה, שהוא פרוקסי מקרי (סעיף
 * מנוסח בקצרה יכול להיות הכבד ביותר). נמדד: מטלות אמיתיות נוקבות במשקל
 * לכל סעיף הרבה יותר מאשר במכסת מילים לכל סעיף.
 *
 * @returns {number|null} משקל יחסי (נקודות או אחוזים — הסולם לא משנה, רק היחס)
 */
function extractSectionWeight(text) {
  const src = clean(text);
  // ⚠️ בלי `\b` — הגוצ'ה החוזרת: אות עברית אינה `\w`, ואחרי "נקודות" לרוב בא ")",
  // גם הוא לא-מילה. כלומר `\b` **לעולם** לא מתקיים שם, וכל המשקלים נעלמו בשקט.
  const points = src.match(/(\d{1,3})\s*(?:נקודות|נק['׳])/);
  if (points) {
    const n = Number(points[1]);
    if (n > 0 && n <= 100) return n;
  }
  const percent = src.match(/(\d{1,3})\s*(?:%|אחוז(?:ים)?)/);
  if (percent) {
    const n = Number(percent[1]);
    if (n > 0 && n <= 100) return n;
  }
  return null;
}

function extractCitationStyle(text) {
  const src = clean(text);
  if (/\bAPA\b/i.test(src)) return 'APA';
  if (/\bMLA\b/i.test(src)) return 'MLA';
  if (/שיקגו|chicago/i.test(src)) return 'Chicago';
  if (/הרווארד|harvard/i.test(src)) return 'Harvard';
  if (/ונקובר|vancouver/i.test(src)) return 'Vancouver';
  // הרבה מרצים בעברית לא נוקבים בשם סגנון אלא בשיטה: "יש להפנות בהערות שוליים
  // ולציין את מספר העמוד". זו דרישת ציטוט לכל דבר, וכשהיא לא מזוהה גם ה-confidence
  // יורד וגם הפאנל לא מציג מה נדרש.
  if (/הער(?:ות|ת)\s+שוליים|footnote/i.test(src)) return 'הערות שוליים';
  return null;
}

// כותרת המטלה: השורה המשמעותית הראשונה שאינה פתיח סעיף ואינה שורת מטא
// ("היקף:", "להגשה עד..."). נפילה לכותרת הסעיף הראשון מייצרת h1 כפול במסמך.
function extractAssignmentTitle(text) {
  const lines = clean(text).split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 6)) {
    if (matchSectionStart(line)) continue;
    // שורת הפתיחה מכילה לרוב גם את הכותרת וגם את הדרישות באותו משפט רצף
    // ("עבודה מסכמת בפסיכולוגיה חברתית. היקף: עד 1600 מילים.") — בודקים משפט-משפט.
    for (const sentence of line.split(/(?<=[.!?])\s+/)) {
      const s = sentence.trim().replace(/[.:]\s*$/, '');
      if (!s) continue;
      if (/^(היקף|הגשה|תאריך|מועד|יש להגיש|פורמט|סגנון|נדרש)/.test(s)) continue;
      // שורות עמוד השער (שם הסטודנט, מרצה, קורס, ת.ז.) קודמות לעיתים לשם המטלה
      // בקובץ ההנחיות עצמו. נמדד: "שם מלא של הסטודנט/ית כולל ת.ז." הפך לכותרת
      // המסמך של הצהרת הכוונות.
      if (META_LABEL_RE.test(s)) continue;
      // כותרת עמוד ("עמוד 2", "[עמוד 1]") אינה שם המטלה. מופיעה בקבצים סרוקים
      // וב-PDF-ים עם כותרות ריצה.
      if (/^\[?\s*(?:עמוד|page)\s*\d+\s*\]?$/i.test(s)) continue;
      if (/\d+\s*(מילים|עמודים|מקורות)/.test(s)) continue;
      const words = countWords(s);
      if (words < 2 || words > 15) continue;
      return s;
    }
  }
  return '';
}

function extractDueDate(text) {
  const src = clean(text);
  const explicit = src.match(/(?:להגשה|תאריך הגשה|מועד הגשה|יש להגיש)[^\n]{0,30}?(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)/);
  if (explicit) return explicit[1];
  const loose = src.match(/\bעד\s+(?:ה-?)?(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)/);
  return loose ? loose[1] : null;
}

// דגלי מבנה — מקבילים ל-LOCAL_*_PATTERN ב-workspaceLearningService, אבל כאן הם
// חלק מה-spec הנערך ולא רק boolean פנימי.
function extractStructureFlags(text) {
  const src = clean(text);
  return {
    noIntro: /(?:ללא|בלי|אין צורך ב)\s*(?:מבוא|הקדמה)/.test(src),
    noSummary: /(?:ללא|בלי|אין צורך ב)\s*(?:סיכום|מסקנות)/.test(src),
    noHeadings: /(?:ללא|בלי)\s*(?:כותרות|כותרות משנה)/.test(src),
    flowing: /(?:כתיבה\s*)?(?:רצופה|זורמת|שוטפת)|טקסט רץ/.test(src),
    followSections: /לפי סעיפי המטלה|בהתאם לסעיפים|follow the assignment sections/i.test(src),
  };
}

// ---------- איכות הטקסט שנקלט ----------

// PDF-ים עבריים מסוימים משתמשים בקידוד גופן שאין לו מיפוי ל-Unicode, ואז חילוץ
// הטקסט מחזיר תווים לטיניים-מורחבים במקום אותיות (נצפה: "ð" במקום "נ") ומילים
// בסדר הפוך. נדיר (2 מתוך 38 קבצים אמיתיים) אבל הרסני: השלד ייבנה בשקט מג'יבריש.
const GARBLED_CHARS_RE = /[ðþýÿ¨©«»]/g;
const GARBLED_RATIO = 0.005;

/**
 * האם הטקסט שחולץ נראה משובש. מיועד להתריע, לא לחסום.
 * @returns {{garbled:boolean, ratio:number}}
 */
export function assessInstructionText(text) {
  const src = String(text || '');
  const hebrew = (src.match(/[֐-׿]/g) || []).length;
  const junk = (src.match(GARBLED_CHARS_RE) || []).length;
  const ratio = hebrew ? junk / hebrew : 0;
  return { garbled: hebrew > 40 && ratio > GARBLED_RATIO, ratio };
}

// ---------- זיהוי סעיפים ----------

function matchSectionStart(line) {
  for (const pattern of SECTION_PATTERNS) {
    const m = line.match(pattern.re);
    if (!m) continue;
    if (pattern.kind === 'named') {
      const label = `${m[1]} ${m[2]}`.trim();
      return { kind: 'named', marker: label, title: (m[3] || '').trim() || label, ordinalKey: m[2] };
    }
    if (pattern.kind === 'heading') {
      return { kind: 'heading', marker: m[1], title: m[2].trim(), ordinalKey: null };
    }
    if (pattern.kind === 'numeric') {
      return { kind: 'numeric', marker: m[1], title: m[2].trim(), ordinalKey: m[1] };
    }
    return { kind: 'hebrew', marker: m[1], title: m[2].trim(), ordinalKey: m[1] };
  }
  return null;
}

/**
 * שומר על רצף ממוספר **עולה אחד** בלבד.
 *
 * מטלות אמיתיות מכילות יותר מרשימה ממוספרת אחת: אחרי "1..4" של הסעיפים מגיעה
 * "1..3" של דרישות המקורות או של כללי ההגשה. בלי הכלל הזה הן נספרות כסעיפים
 * נוספים, מקבלות מכסת מילים משלהן, ובסוף נכתב "סעיף" שהוא בעצם הוראת הגשה.
 * נמדד על מטלה אמיתית שייצרה 7 סעיפים במקום 4.
 *
 * איפוס המונה (5 → 1) מסמן רשימה חדשה, ולכן חותכים שם.
 */
function keepAscendingNumericRun(starts) {
  if (starts.length < 2) return starts;
  const top = (marker) => Number(String(marker).split('.')[0]) || 0;
  const kept = [starts[0]];
  for (let i = 1; i < starts.length; i += 1) {
    if (top(starts[i].marker) > top(kept[kept.length - 1].marker)) kept.push(starts[i]);
    else break;
  }
  return kept;
}

// שומר-סף לאותיות עבריות: "ו." הוא ו' חיבור לפחות באותה תדירות שהוא סעיף ו'.
// מקבלים רצף אותיות רק אם הוא מתחיל ב-א/ב ועולה לפי HEB_ORDINALS ברובו.
function hebrewRunLooksReal(markers) {
  if (markers.length < 2) return false;
  const idx = markers.map((mk) => HEB_ORDINALS.indexOf(mk));
  if (idx.some((i) => i < 0)) return false;
  if (idx[0] > 1) return false; // לא מתחיל ב-א' או ב'
  let ascending = 0;
  for (let i = 1; i < idx.length; i += 1) if (idx[i] > idx[i - 1]) ascending += 1;
  return ascending >= idx.length - 2; // מותר חריג אחד
}

// "1. מבוא - הציגו את הנושא. עד 300 מילים." → כותרת "מבוא" + הנחיה נפרדת.
// בלי זה הכותרת בולעת את כל השורה, וגם המכסה שכתובה בה לא נספרת כהנחיה של הסעיף.
// סוגריים שמכילים רק מטא-דאטה של המטלה ("(400 מילים, 20 נקודות)") — הערך כבר
// חולץ ל-wordQuota/weight, ובכותרת הוא רק רעש שגם נכנס לכותרת במסמך שנוצר.
const TITLE_META_PAREN_RE = /\s*[（(]\s*[^)）]*?(?:מילים|מלים|נקודות|נק['׳]|%|אחוז)[^)）]*[)）]/g;

function splitTitleAndLead(rawTitle) {
  const s = String(rawTitle || '').replace(TITLE_META_PAREN_RE, '').trim();
  if (!s) return { title: '', lead: '' };

  const sep = s.match(/^(.{2,60}?)\s*[-–—:]\s+(.+)$/);
  if (sep && countWords(sep[1]) <= 8) {
    return { title: sep[1].trim(), lead: sep[2].trim() };
  }
  // בלי מפריד: שורה ארוכה היא הנחיה, לא כותרת. מקצרים לתצוגה ושומרים את המלא.
  if (countWords(s) > 10) {
    const words = s.match(WORD_RE) || [];
    return { title: `${words.slice(0, 7).join(' ')}…`, lead: s };
  }
  return { title: s, lead: '' };
}

// פעלי ציווי שפותחים דרישה במטלה עברית. חלק גדול מהמרצים לא ממספרים בכלל —
// כל פסקה פותחת ב"הציגו/נתחו/בחרו" והיא-היא הסעיף. נמדד: זה הפורמט של חלק
// ניכר מההנחיות שהחזירו אפס סעיפים אחרי שתוקן המספור.
//
// בלי `\b` — אות עברית אינה `\w` ולכן `\b` לא עובד כאן (הגוצ'ה החוזרת בפרויקט).
const IMPERATIVE_CUES = [
  'הציגו', 'תארו', 'תיארו', 'נתחו', 'בחרו', 'כתבו', 'הסבירו', 'השוו', 'דונו',
  'פרטו', 'ציינו', 'בדקו', 'זהו', 'סכמו', 'התייחסו', 'נמקו', 'הוכיחו', 'ענו',
  'אספו', 'מצאו', 'שלבו', 'הדגימו', 'העריכו', 'בססו', 'סווגו', 'חוו', 'הצביעו',
  'אפיינו', 'הגדירו', 'בחנו', 'הביאו', 'ערכו', 'גבשו', 'נסחו',
];
// גם ניסוח לא-ציווי שמסמן דרישה: "עליכם להציג", "יש לכלול", "נדרשים להתייחס".
const OBLIGATION_RE = /^(?:עליכם|עליכן|עליכם\/ן|יש\s+ל|נדרש(?:ים|ות)?\s+ל|באחריותכם)/;

const startsWithImperative = (line) => {
  const s = String(line || '').replace(/^[•\-–—*\s]+/, '').trim();
  if (!s) return false;
  if (OBLIGATION_RE.test(s)) return true;
  const firstWord = s.split(/[\s,.:;]/, 1)[0].replace(/[^֐-׿]/g, '');
  return IMPERATIVE_CUES.includes(firstWord);
};

// ---------- כותרת ראש-פרק ----------

// ציווי → שם פעולה. זה כל מה שצריך כדי להפוך הנחיה לכותרת: המרצה כותב
// "תארו את המאבק", ראש הפרק במסמך הוא "תיאור המאבק".
const IMPERATIVE_TO_NOUN = {
  תארו: 'תיאור', תיארו: 'תיאור', נתחו: 'ניתוח', הציגו: 'הצגת', הסבירו: 'הסבר',
  השוו: 'השוואת', דונו: 'דיון ב', פרטו: 'פירוט', ציינו: 'ציון', בדקו: 'בדיקת',
  זהו: 'זיהוי', סכמו: 'סיכום', התייחסו: 'התייחסות ל', נמקו: 'נימוק',
  הוכיחו: 'הוכחת', ענו: 'מענה ל', אספו: 'איסוף', מצאו: 'איתור', שלבו: 'שילוב',
  הדגימו: 'הדגמת', העריכו: 'הערכת', בססו: 'ביסוס', סווגו: 'סיווג',
  חוו: 'חוות דעת', הצביעו: 'הצבעה על', אפיינו: 'אפיון', הגדירו: 'הגדרת',
  בחנו: 'בחינת', הביאו: 'הבאת', ערכו: 'עריכת', גבשו: 'גיבוש', נסחו: 'ניסוח',
  בחרו: 'בחירת', כתבו: 'כתיבת', הציעו: 'הצעת', ספרו: 'תיאור',
};

// ⚠️ הצורה המכלילת-מגדר בנקודה — "נתח.י", "הסבר.י", "נמק.י" — היא היום ניסוח
// סטנדרטי במטלות אקדמיות בעברית, והמפה למעלה הכירה רק צורת רבים. נמדד על מטלה
// אמיתית: אף אחד מ-6 הפעלים בה לא זוהה, ולכן כל הכותרות יצאו חיתוך של ההנחיה.
const DOTTED_IMPERATIVE_TO_NOUN = {
  'נתח': 'ניתוח', 'הסבר': 'הסבר', 'תאר': 'תיאור', 'הצג': 'הצגת', 'נמק': 'נימוק',
  'השווה': 'השוואת', 'דון': 'דיון ב', 'פרט': 'פירוט', 'ציין': 'ציון', 'בדוק': 'בדיקת',
  'זהה': 'זיהוי', 'סכם': 'סיכום', 'התייחס': 'התייחסות ל', 'הוכח': 'הוכחת',
  'ענה': 'מענה ל', 'מצא': 'איתור', 'שלב': 'שילוב', 'הדגם': 'הדגמת', 'הערך': 'הערכת',
  'בסס': 'ביסוס', 'אפיין': 'אפיון', 'הגדר': 'הגדרת', 'בחן': 'בחינת', 'ערוך': 'עריכת',
  'נסח': 'ניסוח', 'בחר': 'בחירת', 'כתוב': 'כתיבת', 'הצע': 'הצעת', 'הראה': 'הצגת',
};

// "נתח.י" / "נתח. י" / "נתח/י" → הגזע "נתח". מחזיר null כשאין התאמה.
// ⚠️ בלי `\b`: אות עברית אינה `\w`, ולכן `\b` אחרי "י" *לעולם* לא מתקיים —
// הגוצ'ה החוזרת של הפרויקט. הסיומת נסגרת בלוקאהד על אות עברית.
const DOTTED_IMPERATIVE_RE = /([א-ת]{2,})\s*[.\/]\s*[יו](?![א-ת])/;

function dottedImperativeNoun(word = '') {
  const stem = String(word || '').replace(/\s*[.\/]\s*[יו]$/, '').replace(/^ו/, '');
  return DOTTED_IMPERATIVE_TO_NOUN[stem] || DOTTED_IMPERATIVE_TO_NOUN[String(word || '')] || null;
}
// מילות חיבור שאחריהן מתחילה הרשימה ולא הנושא — שם חותכים.
// "לגבי/בנוגע/ביחס" פותחות הרחבה של הנושא, לא את הנושא. בלעדיהן הכותרת נחתכת
// בתקרת שבע המילים באמצע הפסוקית ("...מיל לגבי היחסים").
const HEADING_CUT_RE = /\s*[,;]|\s+(?:וכן|וגם|תוך|כולל|בהתאם|לפי|על פי|באמצעות|כפי ש|ואת|ואילו|לגבי|בנוגע ל|בנוגע|ביחס ל|בנושא|אודות|אשר)\s/;
const HEADING_MAX_WORDS = 7;

/**
 * כותרת ראש-פרק מתוך נוסח ההנחיה.
 *
 * הבעיה: כותרות הסעיפים היו טקסט ההנחיה עצמו, חתוך בשלוש נקודות — "תארו את
 * העובדות המרכזיות התאריכים החשובים ואת…". זו לא כותרת של פרק בעבודה, זו
 * שאלה במבחן. המסמך של המשתמש צריך להיראות כמו עבודה, לא כמו דף ההנחיות.
 *
 * שני מהלכים דטרמיניסטיים: (1) הפועל בציווי הופך לשם פעולה; (2) הנושא נחתך
 * בפסיק/מילת חיבור ראשונה — שם נגמר הנושא ומתחילה ההתפרטות. ההנחיה המלאה
 * נשמרת בגוף הסעיף, כך שכלום לא אובד.
 *
 * @param {string} rawTitle נוסח ההנחיה
 * @param {string} fallbackIntent כוונת הסעיף, לכותרת גנרית כשאין מה לגזור
 * @returns {string}
 */
export function toSectionHeading(rawTitle, fallbackIntent = '') {
  let s = String(rawTitle || '')
    .replace(/…$/, '')
    .replace(/^[•\-–—*\s]+/, '')   // תבליט שנשאר מחילוץ ה-PDF
    // מטא של המרצה אינה חלק מהכותרת: "(400 מילים)", "20%", "15 נק'". סוגריים
    // מטופלים ב-TITLE_META_PAREN_RE; הצורה החשופה ("...תקשורתית 400") נדבקה
    // לכותרת בכל סעיפי המטלה המרכזית ולכן מנוקה גם היא.
    .replace(TITLE_META_PAREN_RE, ' ')
    .replace(/\s*\d+\s*(?:%|אחוז(?:ים)?|נק['׳]|נקודות|מילים|מלים)\b/g, ' ')
    .replace(/\s*[-–—]\s*$/, '')
    .replace(/\s+\d+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return INTENT_LABELS[fallbackIntent] || '';
  // שאלה היא כבר כותרת קריאה ("מה יטען יעקב בפני בית המשפט") — לא נוגעים.
  if (/^(?:מה|מי|מדוע|כיצד|האם|למה|איך|באיזו|באילו)\s/.test(s)) {
    return s.replace(/\s*[?？]\s*$/, '');
  }

  // צורה מכלילת-מגדר: "נתח.י את הסעיפים" → "ניתוח הסעיפים".
  const dotted = s.match(new RegExp(`^${DOTTED_IMPERATIVE_RE.source}`));
  if (dotted) {
    const dnoun = dottedImperativeNoun(dotted[1]);
    if (dnoun) {
      let rest = s.slice(dotted[0].length).trim().replace(/^(?:את|על|ב|ל)\s+/, '');
      // "הסבר.י ונמק.י את X" — הפועל השני מיותר בכותרת.
      rest = rest.replace(new RegExp(`^ו?${DOTTED_IMPERATIVE_RE.source}\\s*`), '').replace(/^(?:את|על|ב|ל)\s+/, '');
      s = `${dnoun}${dnoun.endsWith('ב') || dnoun.endsWith('ל') ? '' : ' '}${rest}`.trim();
    }
  }

  const first = s.split(' ')[0].replace(/[^֐-׿]/g, '');
  const noun = IMPERATIVE_TO_NOUN[first];
  if (noun) {
    // "תארו את העובדות" → "תיאור העובדות"; המילית "את"/"על" נבלעת בשם הפעולה.
    let rest = s.slice(s.indexOf(' ') + 1).trim();
    rest = rest.replace(/^(?:את|על|ב|ל)\s+/, '');
    s = `${noun}${noun.endsWith('ב') || noun.endsWith('ל') ? '' : ' '}${rest}`.trim();
  }

  // כותרת לא חוצה סוף משפט. בלי זה תת-סעיף שנפתח בשתי משפטים קצרים קיבל כותרת
  // שמאחה אותם ("...להפגין בבירת המדינה המשטרה"). נקודה שאחריה י'/ו' היא חלק
  // מפועל מכליל ("נתח.י") ולא סוף משפט.
  const sentence = s.split(/[.?!](?!\s*[יו](?![א-ת]))/)[0].trim();
  if (sentence && countWords(sentence) >= 2) s = sentence;

  const cut = s.split(HEADING_CUT_RE)[0].trim();
  if (cut && countWords(cut) >= 2) s = cut;

  const words = s.match(WORD_RE) || [];
  if (words.length > HEADING_MAX_WORDS) s = words.slice(0, HEADING_MAX_WORDS).join(' ');
  // "למדנו על X ועל Y" — ה"ועל" באמצע כותרת הוא שריד תחבירי של הפתיח שנחתך:
  // "המהפכה התעשייתית ועל עקרונות המרקסיזם" → "המהפכה התעשייתית ועקרונות המרקסיזם".
  s = s.replace(/\s+ועל\s+/g, ' ו').trim();
  // כותרת שנגמרת במילת חיבור נראית קטועה.
  s = s.replace(/\s+(?:של|את|ואת|עם|ועם|על|ועל|ל|ב|מ|ה|ו|וכן|וגם|ואילו|אל|כי|אשר|תוך|לפי)$/, '').trim();
  // פועל שני שנשאר תלוי בסוף ("...סקירת הספרות והציגו") — הדרישה השנייה נחתכה
  // באמצע, ומה שנשאר הוא זנב ולא כותרת.
  const tail = (s.match(WORD_RE) || []).at(-1) || '';
  if (IMPERATIVE_TO_NOUN[tail.replace(/^ו/, '')] || IMPERATIVE_TO_NOUN[tail]) {
    s = s.replace(/\s+\S+$/, '').trim();
  }
  return s || INTENT_LABELS[fallbackIntent] || '';
}

// "בקורס למדנו על הגותו של ג'ון סטיוארט מיל..." — הפתיח הזה מצהיר על *נושא*
// הסעיף, וזו הכותרת הטבעית שלו. בלי הכלל הזה הכותרת הייתה שבע המילים הראשונות
// של ההנחיה ("בקורס למדנו על הגותו של ג'ון סטיוארט") — מחצית ממנה היא הפתיח.
const TOPIC_PREAMBLE_RE = /^\s*(?:בקורס\s+למדנו|למדנו\s+בקורס|למדנו)\s+(?:על|אודות)\s+(.+)$/;
// היכן נגמר הנושא ומתחילה המשימה.
const TOPIC_END_RE = /[.?!]|\s+(?:להלן|על\s+בסיס|בהתבסס|יש\s+ל|נא\s+ל)\s/;

// הכותרת של הסעיף. מנסה לפי הסדר: נושא מוצהר בפתיח → פסוקית המשימה הראשונה
// (כולל הצורה המכלילת "נתח.י") → הנוסח הגולמי.
function deriveSectionHeading(rawTitle, body, intent) {
  const full = `${String(rawTitle || '')} ${String(body || '')}`.replace(/\s+/g, ' ').trim();

  const topic = full.match(TOPIC_PREAMBLE_RE);
  if (topic) {
    const cut = topic[1].split(TOPIC_END_RE)[0].trim();
    const head = toSectionHeading(cut, intent);
    if (head && countWords(head) >= 2) return head;
  }

  // פסוקית המשימה: מהפועל המכליל הראשון ועד סוף המשפט.
  // ⚠️ `[^.?!]*` לבדו נעצר בנקודה של הפועל *הבא* ("הסבר.י ונתח.י" → "הסבר.י ונתח"),
  // ולכן נקודה שאחריה י'/ו' אינה נחשבת סוף משפט.
  const task = full.match(new RegExp(`${DOTTED_IMPERATIVE_RE.source}(?:[^.?!]|\\.(?=\\s*[יו](?![א-ת])))*`));
  if (task) {
    const head = toSectionHeading(task[0].trim(), intent);
    if (head && countWords(head) >= 2) return head;
  }

  return toSectionHeading(rawTitle || '', intent);
}

// דרישות "חובה להזכיר" — המרצה מסמן אותן במפורש בסוגריים מרובעים:
// [חובה להזכיר את מושגי "הבלימה ההופכית" ו-"מאזני הצדק"]. אלה הפריטים
// היחידים במטלה שאפשר *לאמת* אוטומטית בטקסט שנכתב, ולכן הם החומר הכי שימושי
// לשלד — וקודם הם לא חולצו כלל ונבלעו בתוך גוש ההנחיה.
const MUST_MENTION_CUE = /(?:חובה|יש)\s+(?:להזכיר|לכלול|להתייחס\s+ל|לדון\s+ב)\s*(?:את\s*)?(?:מושגי[םי]?\s*|המושגים\s*|המונחים\s*)?/g;
const QUOTED_TERM_RE = /["“”״'׳]([^"“”״'׳]{2,60}?)["“”״'׳]/g;

function extractMustMention(text) {
  // ⚠️ נרמול שורות *לפני* הסריקה: ב-PDF הדרישה נשברת באמצע —
  // `[חובה להזכיר את מושגי "הבלימה\nההופכית" ו-"מאזני הצדק"]` — ולכן סריקה
  // שנעצרת ב-\n רואה מרכאה פותחת בלי סוגרת ולא מוצאת כלום.
  const src = String(text || '').replace(/\s+/g, ' ');
  const out = [];
  let m = MUST_MENTION_CUE.exec(src);
  while (m) {
    // הסריקה נעצרת בסוגר המרובע — אחרת נאספים מרכאות מכל שאר המטלה.
    const tail = src.slice(m.index + m[0].length).split(/]/)[0].slice(0, 200);
    let q = QUOTED_TERM_RE.exec(tail);
    while (q) {
      const term = q[1].trim();
      if (term && !out.includes(term)) out.push(term);
      q = QUOTED_TERM_RE.exec(tail);
    }
    QUOTED_TERM_RE.lastIndex = 0;
    m = MUST_MENTION_CUE.exec(src);
  }
  MUST_MENTION_CUE.lastIndex = 0;
  return out;
}

// ---------- תתי-סעיפים ----------

// "א. ... ב. ... ג. ... ד. ..." בתוך סעיף. אלה יחידות *נפרדות* לציון ולמכסה
// ("100 מילים לכל סעיף משנה"), ולא רשימת תבליטים. בלי הפירוק הזה ארבע תשובות
// של 100 מילים כל אחת מוצגות כגוש הנחיה אחד, ובמסמך אין להן כותרת או מכסה.
const SUB_SECTION_SPLIT = /\n(?=\s*[א-ת]['׳]?\s*[.)]\s+)/;
const SUB_SECTION_MARK = /^\s*([א-ת])['׳]?\s*[.)]\s+/;
const SUB_MIN_WORDS = 8;

// "100 מילים לכל סעיף משנה" / "כל סעיף בנפרד, 100 מילים"
const PER_SUB_QUOTA_RE = /(\d{2,4})\s*(?:מילים|מלים)\s*(?:לכל|בכל)\s*(?:סעיף|תת[- ]?סעיף|פריט)|(?:כל\s+סעיף\s+בנפרד\s*,?\s*)(\d{2,4})\s*(?:מילים|מלים)/;

function extractPerSubQuota(text) {
  const m = String(text || '').match(PER_SUB_QUOTA_RE);
  if (!m) return null;
  const n = Number(m[1] || m[2]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * מפרק גוף סעיף לתתי-סעיפים ממוספרים באותיות. מחזיר [] כשאין רצף אמיתי.
 */
function splitSubSections(body) {
  const raw = String(body || '');
  if (!raw.trim()) return [];
  const parts = raw.split(SUB_SECTION_SPLIT);
  const subs = [];
  const markers = [];
  for (const part of parts) {
    const m = part.match(SUB_SECTION_MARK);
    if (!m) continue;
    const text = part.replace(SUB_SECTION_MARK, '').replace(/\s+/g, ' ').trim();
    if (countWords(text) < SUB_MIN_WORDS) continue;
    markers.push(m[1]);
    subs.push({ marker: m[1], text });
  }
  // אותה בדיקה כמו לסעיפים ראשיים: "ו." הוא ו' חיבור לפחות באותה תדירות.
  if (subs.length < 2 || !hebrewRunLooksReal(markers)) return [];
  return subs;
}

// מינימום מילים כדי שפסקה תיחשב דרישה. "קראו היטב." הוא הוראת תפעול, לא סעיף.
const IMPERATIVE_MIN_WORDS = 8;
// מתחת לזה אין מספיק טקסט כדי שזו תהיה מטלה (עמוד שער לדוגמה = ~35 מילים).
const NOT_ASSIGNMENT_MIN_WORDS = 60;

/**
 * נפילה אחרונה: סעיפים לפי פסקאות שפותחות בפועל ציווי.
 *
 * למה זה חשוב יותר ממה שזה נשמע: בלי זה, מטלה בלי מספור נופלת ל-
 * defaultSectionTemplate — תבנית מומצאת שלא קשורה למטלה. עדיף לגזור סעיפים
 * *מהטקסט האמיתי* גם אם ייכנס רעש, כי המשתמש עורך את השלד ממילא. תבנית גנרית
 * היא בדיוק מה שגורם למוצר להרגיש שלא קרא את המטלה.
 */
// דרישה תפעולית מנוסחת בדיוק כמו דרישת תוכן ("יש להגיש את העבודה בפורמט WORD"),
// ולכן עברה את מסנן הציווי והפכה לסעיף עם מכסת מילים משלו. נמדד על מטלת שיטות
// המחקר: שניים משלושת ה"סעיפים" היו כללי הגשה.
const SUBMISSION_RULE_RE = /(?:להגיש|הגשה|פורמט|גופן|רווח כפול|word|pdf|אתר הקורס|מודל|קובץ|עמוד שער|כריכה|תעודת זהות|שם מלא|הצהרת|להצהיר|בינה מלאכותית|מספר עמודים|מיילים|בזוגות|באיחור|ציון|ייבדק|תיבדק)/i;

function splitByImperatives(text) {
  const blocks = clean(text)
    .split(/\n\s*\n|\n(?=[•\-–—*]\s)/)
    .map((b) => b.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  return blocks
    .filter((b) => startsWithImperative(b) && countWords(b) >= IMPERATIVE_MIN_WORDS)
    .filter((b) => !SUBMISSION_RULE_RE.test(b))
    .map((b) => {
      const { title, lead } = splitTitleAndLead(b);
      // rawTitle = הבלוק המלא עם הפיסוק. גזירת כותרת ראש-הפרק זקוקה לפסיקים.
      return { marker: '', title, rawTitle: b, body: lead || b, kind: 'imperative' };
    });
}

/**
 * שאלות כסעיפים: "מה יטען יעקב בפני בית המשפט?"
 *
 * מטלות משפט ומקרי-בוחן מנוסחות כרשימת שאלות בלי מספור ובלי פועל ציווי, ולכן
 * נפלו בין הכיסאות: לא ממוספר, לא ציווי → אפס סעיפים → תבנית גנרית. נמדד על
 * מטלת דיני תקשורת אמיתית (2 שאלות + דרישת הצגה) שהחזירה 0.
 *
 * רק שאלה שדורשת תשובה מנומקת נספרת — "?" בסוף שורה + אורך סביר. שאלה
 * רטורית קצרה בתוך תיאור המקרה ("האם זה סביר?") נפסלת באורך.
 */
const QUESTION_MIN_WORDS = 4;
const QUESTION_MAX_WORDS = 40;

function splitByQuestions(text) {
  const lines = clean(text).split('\n').map((l) => l.trim()).filter(Boolean);
  const out = [];
  lines.forEach((line) => {
    if (!/[?？]\s*$/.test(line)) return;
    const words = countWords(line);
    if (words < QUESTION_MIN_WORDS || words > QUESTION_MAX_WORDS) return;
    // שאלה שהיא ציטוט מתוך תיאור המקרה, לא דרישה מהסטודנט.
    if (/^["'״]/.test(line)) return;
    out.push({ marker: '', title: line.replace(/\s*[?？]\s*$/, ''), body: line, kind: 'question' });
  });
  return out;
}

/**
 * בלוקים מתויגי-תווית: "שאלת המחקר: ...", "שיטת המחקר (מדגם, ניתוח) – ...".
 *
 * הפורמט הנפוץ במטלות הצהרת-כוונות והצעת-מחקר: תווית קצרה, מקף או נקודתיים,
 * ואז ההסבר. אין מספור, אין ציווי, ולכן נפלו לתבנית. נמדד: "הצהרת כוונות"
 * האמיתית מכילה ארבעה בלוקים כאלה (נושא / שאלת מחקר / שיטה / רשימת פריטים)
 * והחזירה 0 סעיפים.
 *
 * השומרים: התווית קצרה (עד 6 מילים) ואינה מסתיימת בפיסוק-סוף, הגוף מהותי,
 * ולפחות שני בלוקים כאלה — בלוק בודד הוא בדרך כלל שורת מטא ("מרצה: ...").
 */
const LABEL_BLOCK_RE = /^([^.!?:–—-]{3,60}?)\s*[:–—-]\s+(.{20,})$/;
const LABEL_MAX_WORDS = 6;
const LABEL_MIN_BLOCKS = 2;
// שורות מטא של עמוד שער — תווית + ערך, אבל לא סעיף לכתיבה.
const META_LABEL_RE = /^(?:שם|מרצה|מתרגל|מגיש|קורס|מספר|סמסטר|תאריך|מועד|היקף|משקל|כתובת|מייל|טלפון|ת\.?ז|שנה|חוג|מחלקה|מכללה|אוניברסיט)/;

function splitByLabeledBlocks(text) {
  const blocks = clean(text)
    .split(/\n\s*\n|\n(?=[•\-–—*]\s)/)
    .map((b) => b.replace(/^[•\-–—*\s]+/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const hits = [];
  blocks.forEach((b) => {
    const m = b.match(LABEL_BLOCK_RE);
    if (m) {
      const label = m[1].trim();
      // הסוגריים הם הבהרה של התווית ולא חלק ממנה — "שיטת המחקר (אוכלוסייה,
      // מדגם, ניתוח)" היא תווית בת שתי מילים עם פירוט, לא תווית בת שבע.
      const bare = label.replace(/\([^)]*\)/g, ' ').trim();
      if (countWords(bare) <= LABEL_MAX_WORDS && !META_LABEL_RE.test(bare)
        && countWords(m[2]) >= IMPERATIVE_MIN_WORDS) {
        hits.push({ marker: '', title: bare || label, body: m[2].trim(), kind: 'labeled' });
        return;
      }
    }
    // בלוק שמסתיים בנקודתיים הוא "כאן מתחיל מה שצריך לכתוב" — התווית והדרישה
    // הן אותה שורה ("רשימת פריטים אקדמיים ... תוך הסבר והצדקה לבחירתם:").
    if (/:\s*$/.test(b) && countWords(b) >= IMPERATIVE_MIN_WORDS && !META_LABEL_RE.test(b)) {
      const stripped = b.replace(/:\s*$/, '').trim();
      const { title } = splitTitleAndLead(stripped);
      hits.push({ marker: '', title, rawTitle: stripped, body: stripped, kind: 'labeled' });
    }
  });
  return hits.length >= LABEL_MIN_BLOCKS ? hits : [];
}

/**
 * סולם הנפילות, מהמפורש לרמז. כל שלב שמחזיר משהו עוצר את הסולם.
 *
 * הכלל שמנחה את כולם: עדיף סעיפים שנגזרו **מהטקסט של המרצה** גם אם ייכנס
 * רעש — המשתמש עורך את השלד ממילא. תבנית קבועה היא בדיוק מה שגורם למוצר
 * להרגיש שלא קרא את המטלה.
 */
function splitByHeuristics(text) {
  const imperatives = splitByImperatives(text);
  if (imperatives.length) return imperatives;
  const questions = splitByQuestions(text);
  if (questions.length) return questions;
  return splitByLabeledBlocks(text);
}

// כותרות של בלוקי הנחיה כלליים. הן מסמנות את **סוף רשימת הסעיפים** — כל מה
// שאחריהן הוא כללי הגשה, לא תוכן לכתיבה.
const GENERAL_BLOCK_PHRASE = '(?:הנחיות\\s+(?:כלליות|לתוכן|לציטוט|הגשה|להגשה|טכניות|נוספות)|כללי\\s+(?:הגשה|ציטוט|האזכור)|אופן\\s+ההגשה|מבנה\\s+העבודה\\s+והגשתה|דגשים\\s+להגשה|ביבליוגרפיה|רשימת\\s+מקורות|בהצלחה)';
const GENERAL_BLOCK_HEADING = new RegExp(`^\\s*${GENERAL_BLOCK_PHRASE}\\s*:?\\s*$`);
// חילוץ מ-PDF מדביק כותרת לסוף המשפט שלפניה ("...בניתוח יישומי.) הנחיות לתוכן
// העבודה"), ולכן בדיקת שורה-שלמה בלבד מחמיצה. גרסה זו חותכת גם באמצע שורה.
const GENERAL_BLOCK_INLINE = new RegExp(GENERAL_BLOCK_PHRASE);

/**
 * מפרק את גוף ההנחיות לסעיפים גולמיים (marker/title/body), בלי פרשנות.
 * @returns {Array<{marker:string, title:string, body:string, kind:string}>}
 */
function splitIntoSections(text) {
  const lines = clean(text).split('\n');
  const starts = [];
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const hit = matchSectionStart(trimmed);
    if (hit) starts.push({ ...hit, lineIndex: i });
  });
  if (!starts.length) return splitByHeuristics(text);

  // סינון רצף אותיות עבריות מפוקפק.
  const hebrewMarkers = starts.filter((s) => s.kind === 'hebrew').map((s) => s.marker);
  const keepHebrew = hebrewRunLooksReal(hebrewMarkers);
  let filtered = starts.filter((s) => (s.kind === 'hebrew' ? keepHebrew : true));

  // אם יש גם ממוספרים וגם כותרות Markdown — הממוספרים בדרך כלל תתי-סעיפים של
  // הכותרות. ברמה הזו שומרים רק את הרמה החיצונית ביותר שנמצאה.
  const kinds = new Set(filtered.map((s) => s.kind));
  if (kinds.has('named')) filtered = filtered.filter((s) => s.kind === 'named');
  else if (kinds.has('heading')) filtered = filtered.filter((s) => s.kind === 'heading');
  // מטלות אמיתיות בנויות "1. סעיף" ומתחתיו "א. ב. ג." — האותיות הן תתי-דרישות
  // של הסעיף, לא סעיפים אחים. בלי הסינון הזה מטלה עם 3 סעיפים ו-15 תת-סעיפים
  // הופכת ל-18 סעיפים, כל אחד עם מכסת מילים משלו. זה היה מקור מרכזי ל"שלד גנרי".
  else if (kinds.has('numeric')) {
    filtered = keepAscendingNumericRun(filtered.filter((s) => s.kind === 'numeric'));
  }

  return filtered.map((start, i) => {
    const from = start.lineIndex + 1;
    const to = i + 1 < filtered.length ? filtered[i + 1].lineIndex : lines.length;
    // ⚠️ הסעיף האחרון נמשך עד סוף המסמך, ולכן בלע את כל בלוקי ההנחיות הכלליות
    // שבאים אחריו (ציטוט, הגשה, היקף, הצהרת AI). התוצאה: "סעיף" שההנחיה שלו
    // כוללת "אין לחרוג ממכסת המילים" — כלומר כלל הגשה שהוצג כתוכן לכתיבה.
    const bodyLines = lines.slice(from, to);
    const stopAt = bodyLines.findIndex((l) => GENERAL_BLOCK_HEADING.test(l.trim()));
    const kept = stopAt >= 0 ? bodyLines.slice(0, stopAt) : bodyLines.slice();
    // הכותרת עלולה להיות מודבקת לסוף שורה — חותכים בתוכה.
    const inlineIdx = kept.findIndex((l) => GENERAL_BLOCK_INLINE.test(l));
    if (inlineIdx >= 0) {
      const line = kept[inlineIdx];
      const cut = line.search(GENERAL_BLOCK_INLINE);
      kept.length = inlineIdx;
      const head = line.slice(0, cut).trim();
      if (head) kept.push(head);
    }
    const rest = kept.join('\n').trim();
    const { title, lead } = splitTitleAndLead(start.title);
    const body = [lead, rest].filter(Boolean).join('\n').trim();
    // rawTitle שומר את המכסה והמשקל שהוסרו מהכותרת לתצוגה — חילוץ המטא-דאטה
    // חייב לרוץ עליו, אחרת הוא מחפש ערך שכבר נמחק.
    return { marker: start.marker, title, rawTitle: start.title, body, kind: start.kind };
  });
}

// ---------- חלוקת מכסות ----------

// סעיפים בלי מכסה מפורשת מקבלים חלק יחסי מהשארית, לפי אורך ההנחיה שלהם —
// פרוקסי גס למשקל, אבל טוב יותר מחלוקה שווה (סעיף עם 3 דרישות אינו כמו סעיף עם אחת).
function distributeQuotas(sections, totalWords) {
  if (!Number.isFinite(totalWords) || totalWords <= 0) return sections;
  const explicit = sections.filter((s) => s.wordQuota);
  const rest = sections.filter((s) => !s.wordQuota);
  if (!rest.length) return sections;

  const used = explicit.reduce((sum, s) => sum + s.wordQuota, 0);
  const remaining = Math.max(0, totalWords - used);
  if (!remaining) return sections;

  // עדיפות למשקל שהמרצה נקב בו במפורש (נקודות/אחוזים). אורך ההנחיה הוא נפילה
  // בלבד — הוא פרוקסי מקרי, וסעיף מנוסח בקצרה יכול להיות הכבד ביותר במטלה.
  // מערבבים רק כשלכל הסעיפים חסרי-המכסה יש משקל; אחרת היחס בין השניים חסר משמעות.
  const allWeighted = rest.every((s) => Number(s.weight) > 0);
  const weights = allWeighted
    ? rest.map((s) => Number(s.weight))
    : rest.map((s) => Math.max(1, countWords(`${s.title} ${s.instructions}`)));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  rest.forEach((section, i) => {
    section.wordQuota = Math.max(80, Math.round((remaining * weights[i]) / weightSum / 10) * 10);
    section.quotaSource = 'derived';
  });
  return sections;
}

// ---------- API ראשי ----------

/**
 * מפרק טקסט הנחיות מטלה ל-spec נערך.
 *
 * @param {string} text טקסט ההנחיות (מקובץ או מהדבקה)
 * @param {{title?:string}} opts
 * @returns {{
 *   title:string, dueDate:(string|null), citationStyle:(string|null),
 *   totalWords:(number|null), quotaKind:(string|null),
 *   sourceRequirement:({count:number,kind:string}|null),
 *   structure:object, sections:Array<object>, warnings:Array<string>,
 *   confidence:number, parsedAt:number
 * }}
 */
// היקף העבודה כסכום המכסות שהמרצה כתב במפורש. null כשאף סעיף לא הצהיר מכסה —
// אז אין מה לסכום ונופלים לגישוש הגלובלי.
// ⚠️ רק כש**כל** הסעיפים הצהירו מכסה. סכום חלקי הוא מספר חסר משמעות: נמדד על
// מטלה שבה סעיף אחד מתוך שלושה נשא "(כ-400 מילים)" — הסכום יצא 400 ודרס היקף
// מוצהר של 1600.
function sumExplicitQuotas(sections) {
  const list = (sections || []).filter((s) => s?.enabled !== false);
  if (!list.length) return null;
  const explicit = list.filter((s) => s.quotaSource === 'explicit' || s.quotaSource === 'sub-sum');
  if (explicit.length !== list.length) return null;
  const sum = explicit.reduce((acc, s) => acc + (Number(s.wordQuota) || 0), 0);
  return sum > 0 ? sum : null;
}

export function parseAssignmentSpec(text, { title = '' } = {}) {
  const src = clean(text);
  const warnings = [];

  if (!src.trim()) {
    return {
      title: title || 'מטלה', dueDate: null, citationStyle: null, totalWords: null,
      quotaKind: null, sourceRequirement: null, structure: extractStructureFlags(''),
      sections: [], warnings: ['לא סופק טקסט הנחיות.'], confidence: 0, parsedAt: Date.now(),
    };
  }

  const globalQuota = extractGlobalWordQuota(src);
  const sourceRequirement = extractSourceRequirement(src);
  const citationStyle = extractCitationStyle(src);
  const dueDate = extractDueDate(src);
  const structure = extractStructureFlags(src);

  const rawSections = splitIntoSections(src);

  const sections = rawSections.map((raw, i) => {
    const combined = `${raw.title}\n${raw.body}`;
    // המכסה נמצאת בפועל **בכותרת** ולא בגוף: "1. תיאור המשבר (400 מילים, 20 נקודות)".
    // חיפוש בגוף בלבד החמיץ אותה בכל המטלות שנמדדו, וכל הסעיפים קיבלו מכסה נגזרת.
    const localQuota = extractWordQuota(raw.rawTitle || raw.title) || extractWordQuota(raw.body);
    // מכסה מקומית נלקחת רק אם היא לא אותה מחרוזת כמו המכסה הגלובלית — אחרת
    // ההיקף הכולל של העבודה היה נדבק לסעיף הראשון שבמקרה מכיל אותו.
    const isEcho = localQuota && globalQuota && localQuota.source === globalQuota.source;
    const intent = detectIntent(combined);
    // הכותרת במסמך היא ראש פרק, לא נוסח ההנחיה. ההנחיה המלאה נשמרת ב-instructions
    // ומוצגת מתחת לכותרת, כך שכלום לא אובד — אבל המסמך נראה כמו עבודה ולא כמו
    // דף השאלות של המרצה.
    // הגזירה רצה על הנוסח **המלא** ולא על raw.title: splitTitleAndLead כבר חתך
    // אותו ב-7 מילים דרך WORD_RE, וזה מוחק את הפסיקים — בלעדיהם אין איפה לחתוך
    // את הרשימה, והכותרת יצאה "תיאור העובדות המרכזיות התאריכים החשובים ואת".
    const heading = deriveSectionHeading(raw.rawTitle || raw.title, raw.body, intent);

    // תתי-סעיפים: כל אחד יחידת ציון ומכסה בפני עצמה.
    const perSubQuota = extractPerSubQuota(combined);
    const rawSubs = splitSubSections(raw.body);
    const subSections = rawSubs.map((sub, j) => ({
      id: `sec_${i + 1}_${j + 1}`,
      marker: sub.marker,
      order: j + 1,
      title: deriveSectionHeading(sub.text, '', intent) || `סעיף ${sub.marker}`,
      instructions: sub.text,
      wordQuota: extractWordQuota(sub.text)?.words || perSubQuota || null,
      mustMention: extractMustMention(sub.text),
    }));
    // כשיש תתי-סעיפים עם מכסה משלהם, מכסת האב היא הסכום — לא ה-"100 מילים"
    // שנתפס מ"100 מילים לכל סעיף משנה", שהוא מכסה של תת-סעיף בודד.
    const subTotal = subSections.reduce((sum, s) => sum + (s.wordQuota || 0), 0);
    const ownQuota = !isEcho && localQuota ? localQuota.words : null;

    return {
      id: `sec_${i + 1}`,
      order: i + 1,
      marker: raw.marker,
      title: heading || raw.title || `סעיף ${i + 1}`,
      rawTitle: raw.title || '',
      instructions: raw.body,
      intent,
      subSections,
      mustMention: extractMustMention(combined),
      wordQuota: subTotal || ownQuota,
      quotaSource: subTotal ? 'sub-sum' : (ownQuota ? 'explicit' : null),
      weight: extractSectionWeight(`${raw.rawTitle || raw.title}\n${raw.body}`),
      keywords: extractTerms(combined).slice(0, 6),
      requiresSources: /מקור|מאמר|ציטוט|הפניה|ביבליוגרפ|source|cite/i.test(combined),
      enabled: true,
    };
  });

  // אזהרת שיבוש ראשונה ברשימה: אם הטקסט לא נקרא כראוי, כל שאר הממצאים חשודים.
  const quality = assessInstructionText(src);
  if (quality.garbled) {
    warnings.push('הטקסט שחולץ מהקובץ נראה משובש (בעיית קידוד גופן ב-PDF). העלה גרסת Word של ההנחיות או הדבק את הטקסט ידנית — אחרת השלד ייבנה ממילים שגויות.');
  }

  if (!sections.length) {
    // הבחנה בין "מטלה שלא הצלחנו לפרק" ל"זה בכלל לא מטלה". נמדד: עמוד שער
    // לדוגמה ורשימת ראשי פרקים ללמידה נכנסו לשלד וקיבלו סעיפים מומצאים. אין
    // בהם היקף, אין דרישות, ואין פועל דרישה אחד — אין מה לבנות מהם.
    const looksLikeAssignment = Boolean(globalQuota) || Boolean(sourceRequirement)
      || Boolean(dueDate) || startsWithImperative(src) || /עליכם|יש\s+ל|נדרש|הגישו|מטלה|עבודה\s+מסכמת/.test(src);
    if (!looksLikeAssignment || countWords(src) < NOT_ASSIGNMENT_MIN_WORDS) {
      warnings.push('הקובץ לא נראה כמו הנחיות מטלה (אין היקף, דרישות או מועד הגשה) — ודא שהעלית את הקובץ הנכון.');
    } else {
      warnings.push('לא זוהו סעיפים ממוספרים בהנחיות — אפשר להוסיף סעיפים ידנית או להתחיל מתבנית.');
    }
  }
  if (!globalQuota) warnings.push('לא זוהה היקף מילים.');
  if (!sourceRequirement) warnings.push('לא זוהתה דרישת מספר מקורות.');

  distributeQuotas(sections, globalQuota?.words || null);

  // confidence: כמה מהעוגנים נמצאו. משמש את ה-UI כדי להחליט אם להציג את מסך
  // התיקון בהדגשה ("בדוק את זה") או כאישור שקט.
  const anchors = [
    sections.length > 0,
    Boolean(globalQuota),
    Boolean(sourceRequirement),
    Boolean(citationStyle),
  ];
  const confidence = anchors.filter(Boolean).length / anchors.length;

  return {
    title: title || extractAssignmentTitle(src) || 'מטלה',
    dueDate,
    citationStyle,
    // ⚠️ הצהרה גלובלית מפורשת ("היקף העבודה: 1600 מילים") גוברת תמיד. סכום
    // הסעיפים מחליף רק *גישוש* — extractGlobalWordQuota בלי שורת cue מחזיר את
    // המספר הראשון שנראה כמו מכסה, וזו לרוב מכסה של סעיף בודד (נמדד: מטלה עם
    // "100 מילים לכל סעיף משנה" קיבלה totalWords=100 במקום 1050).
    // בלי התנאי הזה הסכום דרס היקף מוצהר נכון ב-4 מטלות בסוויטה.
    totalWords: globalQuota?.scope === 'global'
      ? globalQuota.words
      : (sumExplicitQuotas(sections) || globalQuota?.words || null),
    quotaKind: globalQuota?.kind || null,
    sourceRequirement,
    structure,
    sections,
    warnings,
    confidence,
    parsedAt: Date.now(),
  };
}

// סדר קנוני של סעיפים בעבודה אקדמית + כמה משקל לתת לכל תפקיד. משמש רק את
// התבנית — סעיפים שזוהו בפועל שומרים על סדר המרצה.
const TEMPLATE_PLAN = {
  intro: { title: 'מבוא', share: 0.12, order: 1 },
  review: { title: 'רקע תיאורטי', share: 0.24, order: 2 },
  method: { title: 'שיטה', share: 0.16, order: 3 },
  exposition: { title: 'הצגת הנושא', share: 0.18, order: 4 },
  findings: { title: 'ממצאים', share: 0.22, order: 5 },
  comparison: { title: 'השוואה', share: 0.22, order: 6 },
  analysis: { title: 'דיון וניתוח', share: 0.28, order: 7 },
  argument: { title: 'טיעון ועמדה', share: 0.24, order: 8 },
  conclusion: { title: 'סיכום ומסקנות', share: 0.16, order: 9 },
};
// שלד מינימלי כשאפילו רמז לתפקיד לא נמצא בטקסט.
const TEMPLATE_LAST_RESORT = ['intro', 'analysis', 'conclusion'];

/**
 * תבנית כשלא זוהו סעיפים — **נגזרת מהטקסט**, לא קבועה.
 *
 * הבעיה שזה פותר: התבנית הייתה ארבעה סעיפים קשיחים (מבוא/רקע/דיון/סיכום) שהוצגו
 * לכל מטלה שלא פורקה, בלי קשר למה שהמרצה ביקש. מטלת השוואה, מטלת שיטות מחקר
 * ומטלה משפטית קיבלו את אותו שלד בדיוק — וזה גרם למוצר להרגיש שלא קרא את המטלה.
 *
 * עכשיו: סורקים את ההנחיות באותם INTENT_RULES של הפרסר, ובונים סעיף לכל תפקיד
 * שהמרצה באמת הזכיר, בסדר אקדמי קנוני. מטלה שמדברת על מדגם וממצאים תקבל שיטה
 * וממצאים; מטלה שמבקשת להשוות תקבל סעיף השוואה. רק כשאין שום רמז — שלד מינימלי.
 *
 * @param {number} totalWords היקף כולל לחלוקה
 * @param {string} instructions טקסט ההנחיות; בלעדיו חוזרים לשלד המינימלי
 */
export function defaultSectionTemplate(totalWords = 1500, instructions = '') {
  const src = clean(instructions);
  let intents = src
    ? INTENT_RULES.filter((rule) => rule.re.test(src)).map((rule) => rule.intent)
    : [];
  // מבוא וסיכום כמעט תמיד נדרשים גם כשלא נאמרו במפורש — הם מסגרת, לא תוכן.
  if (intents.length) {
    if (!intents.includes('intro')) intents.unshift('intro');
    if (!intents.includes('conclusion')) intents.push('conclusion');
  }
  // יותר מדי תפקידים = הטקסט נגע בהכול; מצמצמים לחמישה כדי לא להציף בשלד ענק.
  if (intents.length > 5) {
    const keep = new Set(['intro', 'conclusion']);
    const middle = intents.filter((i) => !keep.has(i)).slice(0, 3);
    intents = ['intro', ...middle, 'conclusion'];
  }
  if (!intents.length) intents = [...TEMPLATE_LAST_RESORT];

  const plan = [...new Set(intents)]
    .map((intent) => ({ intent, ...TEMPLATE_PLAN[intent] }))
    .filter((p) => p.title)
    .sort((a, b) => a.order - b.order);

  // נרמול המנות כך שיסתכמו בהיקף המבוקש, יהיה אשר יהיה הרכב התפקידים.
  const totalShare = plan.reduce((sum, p) => sum + p.share, 0) || 1;

  return plan.map((p, i) => ({
    id: `sec_${i + 1}`,
    order: i + 1,
    marker: String(i + 1),
    title: p.title,
    instructions: '',
    intent: p.intent,
    wordQuota: Math.round((totalWords * (p.share / totalShare)) / 10) * 10,
    quotaSource: 'template',
    keywords: [],
    requiresSources: p.intent !== 'intro',
    enabled: true,
  }));
}

/** תוויות עבריות לכוונות — לשימוש ה-UI ולבחירת פיגום ניסוח. */
export const INTENT_LABELS = {
  intro: 'מבוא',
  review: 'סקירת ספרות',
  analysis: 'ניתוח',
  comparison: 'השוואה',
  argument: 'טיעון',
  method: 'שיטה',
  findings: 'ממצאים',
  conclusion: 'מסקנות',
  exposition: 'הצגה',
};
