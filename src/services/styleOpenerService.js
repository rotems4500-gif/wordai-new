// styleOpenerService.js — פיגומי ניסוח: איך *אתה* פותח פסקה מסוג מסוים.
//
// אפס AI. כורה מהקורפוס האישי (styleSampleStore) את הפתיחים האמיתיים של המשתמש,
// מסווג כל פסקה לכוונה רטורית באותם כללים של הפרסר, ומציע לסעיף פתיחים מאותה
// משפחה. ההצעה היא ניסוח שהמשתמש כבר כתב — לא ניסוח של מודל.
//
// למה זה עובד בלי מודל: הבעיה של "דף ריק" היא בעיקר בעיית *התחלה*. משפט פתיחה
// בקול שלך שובר את החסם, וההמשך כבר שלו.
//
// אמון: פתיח נשמר רק אם הביגרם הפותח שלו חוזר בקורפוס (MIN_PREFIX_DOCS) — ביטוי
// שהופיע פעם אחת אינו הרגל כתיבה. זה הלקח מ-v1 של styleAutocompleteService, שם
// דרישת חזרה מילה-במילה על *כל* הרצף פסלה כמעט כל שאילתה.
//
// תלויות: styleSampleStore (קריאה) + assignmentSpecService (detectIntent). browser-only.

import { getChunks, ensureSampleStoreReady, STYLE_SAMPLES_UPDATED_EVENT } from './styleSampleStore';
import { detectIntent } from './assignmentSpecService';
import { containsRareToken, isReady as lexiconReady } from './hebrewLexiconService';

// נמדד: הורדה ל-2 מכפילה את מספר הפתיחים (4→11) אבל כולם רעש — "על פי" חסר תוכן,
// ו"קמה ע" / "כץ נ" הם שורות ביבליוגרפיה שחוזרות בין עבודות ולכן נראות כהרגל.
const OPENER_MIN_WORDS = 3;
const OPENER_MAX_WORDS = 9;
// הביגרם הפותח חייב להופיע ב**שני מסמכים** לפחות — חזרה בתוך מסמך אחד היא
// תבנית של אותה עבודה ולא הרגל כתיבה.
const MIN_PREFIX_DOCS = 2;
const MAX_PER_INTENT = 5;
const MIN_PARAGRAPHS_TO_TRY = 4;  // מתחת לזה אין טעם אפילו לנסות
// שער האיכות הוא *מספר הפתיחים החוזרים שנמצאו*, לא נפח הקורפוס: ביגרם פותח שחוזר
// הוא כשלעצמו העדות להרגל. משתמש עם שלוש עבודות ודפוסים ברורים ראוי להצעות;
// משתמש עם עשרים עבודות בלי שום חזרה — לא.
const MIN_OPENERS_FOR_READY = 3;

const WORD_RE = /[֐-׿A-Za-z0-9'"׳״-]+/g;

// פתיחים גנריים שאינם מלמדים כלום על הקול האישי.
const BANNED_OPENERS = /^(?:זה|זאת|הוא|היא|הם|הן|יש|אין|כמו כן|בנוסף|לכן|אבל|אז)\b/;

// ביטויים שאינם ניסוח אלא הצהרה תפעולית של מסמך — אסור להציע אותם כפתיחה.
const PROCEDURAL_OPENER = /(?:הצהרת\s*AI|אני\s*מצהיר|נעזרתי\s*ב|בסיוע\s*מודל|בינה\s*מלאכות|שם\s*הקורס|מספר\s*הקורס|תעודת\s*זהות|מגיש[יה]?\s*העבודה|רשימה\s*ביבליוגרפית|הוגש\s*ל)/i;

/**
 * האם הפתיח נושא **תוכן** ולא רק ניסוח.
 *
 * זה השומר החשוב ביותר כאן. פתיח אמור להיות פיגום ריק שאפשר להמשיך ממנו בכל
 * נושא; ברגע שהוא כולל מספר, שם כלי מחקר או ראשי תיבות לועזיים, הוא גורר איתו
 * עובדות מעבודה אחרת. נמדד על הקורפוס האמיתי: "הגדרה אופרציונלית המשתנה יימדד
 * באמצעות שאלה 111 בשאלון INES" הוצע כפתיחה לסעיף ניתוח בכל מטלה שהיא —
 * כלומר שתילת נתון שמעולם לא היה במטלה הנוכחית.
 */
function isContentBearing(opener, paragraph = '') {
  const s = String(opener || '');
  // הבדיקה התפעולית רצה על **הפסקה המלאה**: הפתיח נחתך ל-9 מילים, וחיתוך
  // באמצע ביטוי ("נעזרתי בבינה | מלאכותית") ניצח את הפילטר בהרצה הקודמת.
  if (PROCEDURAL_OPENER.test(s) || PROCEDURAL_OPENER.test(String(paragraph || ''))) return true;
  if (/\d/.test(s)) return true;                    // מספרים = נתון ספציפי
  if (/[A-Za-z]{3,}/.test(s)) return true;          // שם כלי/מוסד לועזי
  if (/["'״׳]/.test(s)) return true;                // ציטוט או שם בגרשיים
  // אות עברית בודדת כמילה = ראשי תיבות של שם פרטי בשורת ביבליוגרפיה ("קמה ע",
  // "כץ נ"). אלה חוזרות בין עבודות ולכן נראות כהרגל ניסוח, אבל הן רשימת מקורות.
  if (/(?:^|\s)[֐-׿](?:\s|$)/.test(s)) return true;
  // שם פרטי בעברית ("הייג והרופ", "הדסה") — אין אות גדולה שתסגיר אותו, ולכן
  // ההכרעה היא סטטיסטית: מילה שמופיעה בקומץ מסמכים בלבד היא שם/מונח ייחודי.
  // fail-open — בקורפוס קטן מדי הבדיקה מושבתת ולא פוסלת כלום.
  if (lexiconReady() && containsRareToken(s)) return true;
  return false;
}

// סיווג לפי *הפתיח עצמו*. סיווג לפי הפסקה כולה שביר: מילה אחת באמצע ("...בתחילת
// הדיון") מטה פסקת סיכום ל'ניתוח'. המשפט הפותח הוא שקובע את התפקיד הרטורי של
// הפתיחה, וזה מה שאנחנו מציעים. נבדק ראשון; detectIntent הוא הנפילה.
const OPENER_CUES = [
  { intent: 'conclusion', re: /^(?:לסיכום|לסיום|בסיכומו של|המסקנה|מכל האמור)/ },
  { intent: 'review',     re: /^(?:מן הספרות|הספרות המחקרית|סקירת הספרות|מחקרים קודמים|בספרות המחקרית|מרבית המחקרים)/ },
  { intent: 'intro',      re: /^(?:עבודה זו|מאמר זה|פרק זה|מסמך זה|חיבור זה)/ },
  { intent: 'method',     re: /^(?:שיטת המחקר|כלי המחקר|המדגם|המשתתפים|ההליך|לצורך המחקר|הנתונים נאספו)/ },
  { intent: 'comparison', re: /^(?:בהשוואה|לעומת|בניגוד|בעוד ש)/ },
  { intent: 'findings',   re: /^(?:הממצאים|התוצאות|מן הנתונים|הנתונים מראים)/ },
  { intent: 'analysis',   re: /^(?:ניתוח|בחינה של|בחינת|עיון ב)/ },
];

function classifyOpener(opener, paragraph) {
  for (const cue of OPENER_CUES) {
    if (cue.re.test(opener)) return cue.intent;
  }
  return detectIntent(paragraph);
}

let cache = null;        // {byIntent, paragraphs, builtAt}
let corpusToken = null;  // מספר ה-chunks בזמן הבנייה — משתנה → בונים מחדש

if (typeof window !== 'undefined') {
  try {
    window.addEventListener(STYLE_SAMPLES_UPDATED_EVENT, () => { cache = null; corpusToken = null; });
  } catch {}
}

const countWords = (s = '') => (String(s || '').match(WORD_RE) || []).length;

// מילות המשפט הראשון בפסקה, עד תקרת אורך. החיתוך עצמו נעשה בהמשך (trimToPhrasing),
// כי הוא זקוק לאינדקס תדירות-המסמכים שנבנה על כל הקורפוס.
function openerCandidate(paragraph) {
  const firstSentence = String(paragraph || '')
    .split(/(?<=[.!?…])\s+/)[0]
    .trim();
  if (!firstSentence) return null;
  const words = firstSentence.match(WORD_RE) || [];
  if (words.length < OPENER_MIN_WORDS) return null;
  return words.slice(0, OPENER_MAX_WORDS);
}

/**
 * גוזר את הרצף לחלק הבר-שימוש: הרצף הארוך ביותר שעדיין חוזר בכמה מסמכים.
 *
 * הבעיה שזה פותר: חיתוך לפי מספר מילים קבוע תופס את הניסוח **ועוד** את התוכן
 * שאחריו. נמדד על 24 עבודות אמיתיות — "לסיכום ניתן לראות כי לרשתות החברתיות יש
 * השפעה עצומה" הוצע כפתיחה, כשהחלק הבר-שימוש הוא ארבע המילים הראשונות בלבד.
 *
 * העיקרון: ניסוח חוזר בין מסמכים, תוכן מופיע פעם אחת. מאריכים את הרצף מילה-מילה
 * כל עוד הוא מופיע ב-MIN_PREFIX_DOCS מסמכים, ועוצרים ברגע שהוא צונח לאחד — שם
 * בדיוק עובר הגבול בין "איך אני כותב" ל"על מה כתבתי הפעם".
 *
 * @param {string[]} words מילות המועמד
 * @param {(prefix:string)=>number} docFreq בכמה מסמכים מופיע הרצף
 * @returns {{text:string, docs:number}|null}
 */
function trimToPhrasing(words, docFreq) {
  const prefix = (n) => words.slice(0, n).join(' ');
  const baseDocs = docFreq(prefix(OPENER_MIN_WORDS).toLowerCase());
  // אפילו הרצף המינימלי אינו חוזר ⇒ אין כאן הרגל, רק משפט מעבודה אחת.
  if (baseDocs < MIN_PREFIX_DOCS) return null;

  let best = OPENER_MIN_WORDS;
  let bestDocs = baseDocs;
  for (let n = OPENER_MIN_WORDS + 1; n <= words.length; n += 1) {
    const docs = docFreq(prefix(n).toLowerCase());
    if (docs < MIN_PREFIX_DOCS) break;
    best = n;
    bestDocs = docs;
  }
  return { text: prefix(best), docs: bestDocs };
}

// שני ספים בכוונה. ספירת ההרגל צריכה לראות *כל* פסקה שיש לה פתיחה — פסקה קצרה
// שפותחת ב"לסיכום הפרק" היא ראיה מלאה להרגל. ההצעה עצמה נלקחת רק מפסקאות
// מהותיות. איחוד שני הספים הוא באג: הוא הוריד ביגרמים אמיתיים מתחת ל-MIN_PREFIX_DOCS
// ומחק כוונות שלמות (conclusion/method) מהאינדקס.
const PARA_MIN_FOR_COUNT = 8;
const PARA_MIN_FOR_OFFER = 18;

function buildIndex() {
  const chunks = getChunks();
  const allParagraphs = [];
  chunks.forEach((chunk) => {
    // מזהה המסמך נשמר לכל פסקה: "הרגל" נמדד בכמה עבודות הביטוי מופיע, לא בכמה
    // פעמים. נמדד על הקורפוס האמיתי — "הגדרה נומינלית" חזר 8 פעמים בעבודה אחת
    // בשיטות מחקר וטיפס לראש כל הכוונות, כולל מבוא וסקירת ספרות. זו תבנית של
    // מסמך בודד, לא קול אישי.
    const docId = chunk?.documentId || chunk?.docId || chunk?.sourceTitle || 'unknown';
    String(chunk?.text || '')
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => countWords(p) >= PARA_MIN_FOR_COUNT)
      .forEach((p) => allParagraphs.push({ text: p, docId }));
  });
  const paragraphs = allParagraphs.filter((p) => countWords(p.text) >= PARA_MIN_FOR_OFFER);

  const byIntent = {};
  if (paragraphs.length < MIN_PARAGRAPHS_TO_TRY) {
    return { byIntent, paragraphs: paragraphs.length, total: 0, sparse: true };
  }

  // מדד ה"הרגל" = בכמה **מסמכים נפרדים** מופיע הרצף הפותח. נספר לכל אורך רצף
  // ולא רק לביגרם, כי אותה ספירה משמשת גם כשער (האם זה הרגל בכלל) וגם כסכין
  // (איפה הניסוח נגמר) — ראה trimToPhrasing.
  const prefixDocs = new Map();
  allParagraphs.forEach(({ text, docId }) => {
    const words = text.match(WORD_RE) || [];
    for (let n = OPENER_MIN_WORDS; n <= Math.min(words.length, OPENER_MAX_WORDS); n += 1) {
      const key = words.slice(0, n).join(' ').toLowerCase();
      if (!prefixDocs.has(key)) prefixDocs.set(key, new Set());
      prefixDocs.get(key).add(docId);
    }
  });
  const docFreq = (key) => (prefixDocs.get(key)?.size || 0);

  const seen = new Set();
  paragraphs.forEach(({ text: p }) => {
    // בלוק בלי סימן פיסוק סוגר אינו פסקה אלא כותרת/עמוד שער. נמדד: "המכללה
    // האקדמית הדסה החוג לפוליטיקה ותקשורת במסגרת הקורס" הוצע כפתיחה לסעיף.
    if (!/[.!?…]/.test(p)) return;
    const candidate = openerCandidate(p);
    if (!candidate) return;
    // השער והסכין הם אותה מדידה: trimToPhrasing מחזיר null כשאפילו הרצף המינימלי
    // אינו חוזר, ואחרת מחזיר את החלק שכן.
    const trimmed = trimToPhrasing(candidate, docFreq);
    if (!trimmed) return;
    const opener = trimmed.text;
    if (BANNED_OPENERS.test(opener)) return;
    if (isContentBearing(opener, p)) return;

    const key = opener.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    const intent = classifyOpener(opener, p);
    if (!byIntent[intent]) byIntent[intent] = [];
    byIntent[intent].push({ text: opener, weight: trimmed.docs });
  });

  let total = 0;
  Object.keys(byIntent).forEach((intent) => {
    byIntent[intent] = byIntent[intent]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, MAX_PER_INTENT);
    total += byIntent[intent].length;
  });

  return { byIntent, paragraphs: paragraphs.length, total, sparse: total < MIN_OPENERS_FOR_READY };
}

function getIndex() {
  const chunks = getChunks();
  const token = `${chunks.length}`;
  if (cache && corpusToken === token) return cache;
  cache = buildIndex();
  corpusToken = token;
  return cache;
}

/** מוודא שחנות הדגימות נטענה לפני בנייה. @returns {Promise<object>} */
export async function ensureOpenersReady() {
  try { await ensureSampleStoreReady(); } catch {}
  return getIndex();
}

/**
 * פתיחים בקול של המשתמש לכוונה נתונה.
 * נופל לכוונות קרובות כשאין מספיק דוגמאות ישירות — עדיף פתיח מ"ניתוח" מאשר כלום.
 *
 * @param {string} intent
 * @param {{limit?:number}} opts
 * @returns {Array<{text:string, weight:number, fromIntent:string}>}
 */
export function getOpenersForIntent(intent, { limit = 3 } = {}) {
  const index = getIndex();
  if (index.sparse) return [];

  const FALLBACK = {
    analysis: ['argument', 'findings', 'exposition'],
    comparison: ['analysis', 'exposition'],
    argument: ['analysis', 'conclusion'],
    review: ['exposition', 'intro'],
    findings: ['analysis', 'exposition'],
    method: ['exposition'],
    conclusion: ['argument', 'analysis'],
    intro: ['exposition', 'review'],
    exposition: ['analysis', 'review'],
  };

  const out = [];
  const push = (list, fromIntent, cap) => {
    (list || []).forEach((item) => {
      if (out.length >= cap) return;
      if (out.some((o) => o.text === item.text)) return;
      out.push({ ...item, fromIntent });
    });
  };

  push(index.byIntent[intent], intent, limit);

  // נפילה לכוונה שכנה מוגבלת לפריט אחד: פתיח ממשפחה אחרת הוא עדיף על רשימה ריקה,
  // אבל רשימה שרובה "מ-הצגה" רק מרעישה ומאבדת אמון.
  //
  // ⚠️ הנפילה חייבת להיות **מסומנת**. נמדד: פתיח מתודולוגי מ'הצגה' הוצע כפתיחה
  // ל'מבוא' ול'סקירת ספרות' בלי שום סימן שהוא לא משם — והמשתמש מקבל משפט
  // שנשמע כמוהו אבל שייך לסוג פסקה אחר לגמרי. `borrowed` מאפשר ל-UI לומר זאת.
  const fallbackCap = Math.min(limit, out.length + 1);
  for (const alt of (FALLBACK[intent] || [])) {
    if (out.length >= fallbackCap) break;
    push(index.byIntent[alt], alt, fallbackCap);
  }
  return out.map((o) => (o.fromIntent === intent ? o : { ...o, borrowed: true }));
}

/** מצב האינדקס לתצוגה ב-UI. */
export function getOpenerStatus() {
  const index = getIndex();
  return {
    ready: !index.sparse,
    sparse: index.sparse,
    paragraphs: index.paragraphs,
    openers: index.total || 0,
    intents: Object.keys(index.byIntent),
  };
}
