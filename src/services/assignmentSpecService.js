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
const GLOBAL_QUOTA_CUES = /(?:היקף\s+(?:כולל|העבודה|המטלה|כללי)|אורך\s+(?:העבודה|המטלה)|סה["׳']?כ|בסך\s+הכול|היקף\s+כולל)/;

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

// מינימום מילים כדי שפסקה תיחשב דרישה. "קראו היטב." הוא הוראת תפעול, לא סעיף.
const IMPERATIVE_MIN_WORDS = 8;

/**
 * נפילה אחרונה: סעיפים לפי פסקאות שפותחות בפועל ציווי.
 *
 * למה זה חשוב יותר ממה שזה נשמע: בלי זה, מטלה בלי מספור נופלת ל-
 * defaultSectionTemplate — תבנית מומצאת שלא קשורה למטלה. עדיף לגזור סעיפים
 * *מהטקסט האמיתי* גם אם ייכנס רעש, כי המשתמש עורך את השלד ממילא. תבנית גנרית
 * היא בדיוק מה שגורם למוצר להרגיש שלא קרא את המטלה.
 */
function splitByImperatives(text) {
  const blocks = clean(text)
    .split(/\n\s*\n|\n(?=[•\-–—*]\s)/)
    .map((b) => b.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  return blocks
    .filter((b) => startsWithImperative(b) && countWords(b) >= IMPERATIVE_MIN_WORDS)
    .map((b) => {
      const { title, lead } = splitTitleAndLead(b);
      return { marker: '', title, body: lead || b, kind: 'imperative' };
    });
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
  if (!starts.length) return splitByImperatives(text);

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
    return {
      id: `sec_${i + 1}`,
      order: i + 1,
      marker: raw.marker,
      title: raw.title || `סעיף ${i + 1}`,
      instructions: raw.body,
      intent: detectIntent(combined),
      wordQuota: !isEcho && localQuota ? localQuota.words : null,
      quotaSource: !isEcho && localQuota ? 'explicit' : null,
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
    warnings.push('לא זוהו סעיפים ממוספרים בהנחיות — אפשר להוסיף סעיפים ידנית או להתחיל מתבנית.');
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
    totalWords: globalQuota?.words || null,
    quotaKind: globalQuota?.kind || null,
    sourceRequirement,
    structure,
    sections,
    warnings,
    confidence,
    parsedAt: Date.now(),
  };
}

/** תבנית ברירת מחדל כשלא זוהו סעיפים — המשתמש עורך במקום להתחיל מאפס. */
export function defaultSectionTemplate(totalWords = 1500) {
  const plan = [
    { title: 'מבוא', intent: 'intro', share: 0.12 },
    { title: 'רקע תיאורטי', intent: 'review', share: 0.28 },
    { title: 'דיון וניתוח', intent: 'analysis', share: 0.42 },
    { title: 'סיכום ומסקנות', intent: 'conclusion', share: 0.18 },
  ];
  return plan.map((p, i) => ({
    id: `sec_${i + 1}`,
    order: i + 1,
    marker: String(i + 1),
    title: p.title,
    instructions: '',
    intent: p.intent,
    wordQuota: Math.round((totalWords * p.share) / 10) * 10,
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
