// styleOpenerService.js — פיגומי ניסוח: איך *אתה* פותח פסקה מסוג מסוים.
//
// אפס AI. כורה מהקורפוס האישי (styleSampleStore) את הפתיחים האמיתיים של המשתמש,
// מסווג כל פסקה לכוונה רטורית באותם כללים של הפרסר, ומציע לסעיף פתיחים מאותה
// משפחה. ההצעה היא ניסוח שהמשתמש כבר כתב — לא ניסוח של מודל.
//
// למה זה עובד בלי מודל: הבעיה של "דף ריק" היא בעיקר בעיית *התחלה*. משפט פתיחה
// בקול שלך שובר את החסם, וההמשך כבר שלו.
//
// אמון: פתיח נשמר רק אם הביגרם הפותח שלו חוזר בקורפוס (MIN_PREFIX_COUNT) — ביטוי
// שהופיע פעם אחת אינו הרגל כתיבה. זה הלקח מ-v1 של styleAutocompleteService, שם
// דרישת חזרה מילה-במילה על *כל* הרצף פסלה כמעט כל שאילתה.
//
// תלויות: styleSampleStore (קריאה) + assignmentSpecService (detectIntent). browser-only.

import { getChunks, ensureSampleStoreReady, STYLE_SAMPLES_UPDATED_EVENT } from './styleSampleStore';
import { detectIntent } from './assignmentSpecService';

const OPENER_MIN_WORDS = 3;
const OPENER_MAX_WORDS = 9;
const MIN_PREFIX_COUNT = 2;   // הביגרם הפותח חייב לחזור
const MAX_PER_INTENT = 5;
const MIN_PARAGRAPHS_TO_TRY = 4;  // מתחת לזה אין טעם אפילו לנסות
// שער האיכות הוא *מספר הפתיחים החוזרים שנמצאו*, לא נפח הקורפוס: ביגרם פותח שחוזר
// הוא כשלעצמו העדות להרגל. משתמש עם שלוש עבודות ודפוסים ברורים ראוי להצעות;
// משתמש עם עשרים עבודות בלי שום חזרה — לא.
const MIN_OPENERS_FOR_READY = 3;

const WORD_RE = /[֐-׿A-Za-z0-9'"׳״-]+/g;

// פתיחים גנריים שאינם מלמדים כלום על הקול האישי.
const BANNED_OPENERS = /^(?:זה|זאת|הוא|היא|הם|הן|יש|אין|כמו כן|בנוסף|לכן|אבל|אז)\b/;

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

// המשפט הראשון של הפסקה, חתוך לאורך פתיח סביר.
function extractOpener(paragraph) {
  const firstSentence = String(paragraph || '')
    .split(/(?<=[.!?…])\s+/)[0]
    .trim();
  if (!firstSentence) return null;

  const words = firstSentence.match(WORD_RE) || [];
  if (words.length < OPENER_MIN_WORDS) return null;

  // משפט קצר נלקח במלואו; משפט ארוך נחתך לפתיח בלבד — הרעיון הוא לתת נקודת
  // התחלה, לא להשתיל משפט שלם מעבודה אחרת.
  const take = Math.min(words.length, OPENER_MAX_WORDS);
  const opener = words.slice(0, take).join(' ');
  if (BANNED_OPENERS.test(opener)) return null;
  return opener;
}

// שני ספים בכוונה. ספירת ההרגל צריכה לראות *כל* פסקה שיש לה פתיחה — פסקה קצרה
// שפותחת ב"לסיכום הפרק" היא ראיה מלאה להרגל. ההצעה עצמה נלקחת רק מפסקאות
// מהותיות. איחוד שני הספים הוא באג: הוא הוריד ביגרמים אמיתיים מתחת ל-MIN_PREFIX_COUNT
// ומחק כוונות שלמות (conclusion/method) מהאינדקס.
const PARA_MIN_FOR_COUNT = 8;
const PARA_MIN_FOR_OFFER = 18;

function buildIndex() {
  const chunks = getChunks();
  const allParagraphs = [];
  chunks.forEach((chunk) => {
    String(chunk?.text || '')
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => countWords(p) >= PARA_MIN_FOR_COUNT)
      .forEach((p) => allParagraphs.push(p));
  });
  const paragraphs = allParagraphs.filter((p) => countWords(p) >= PARA_MIN_FOR_OFFER);

  const byIntent = {};
  if (paragraphs.length < MIN_PARAGRAPHS_TO_TRY) {
    return { byIntent, paragraphs: paragraphs.length, total: 0, sparse: true };
  }

  // ספירת ביגרמים פותחים על פני כל הקורפוס — מדד ה"הרגל".
  const bigramCount = new Map();
  allParagraphs.forEach((p) => {
    const words = p.match(WORD_RE) || [];
    if (words.length < 2) return;
    const bg = `${words[0]} ${words[1]}`.toLowerCase();
    bigramCount.set(bg, (bigramCount.get(bg) || 0) + 1);
  });

  const seen = new Set();
  paragraphs.forEach((p) => {
    const opener = extractOpener(p);
    if (!opener) return;
    const words = opener.match(WORD_RE) || [];
    const bg = `${words[0]} ${words[1]}`.toLowerCase();
    if ((bigramCount.get(bg) || 0) < MIN_PREFIX_COUNT) return;

    const key = opener.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    const intent = classifyOpener(opener, p);
    if (!byIntent[intent]) byIntent[intent] = [];
    byIntent[intent].push({ text: opener, weight: bigramCount.get(bg) });
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
  const fallbackCap = Math.min(limit, out.length + 1);
  for (const alt of (FALLBACK[intent] || [])) {
    if (out.length >= fallbackCap) break;
    push(index.byIntent[alt], alt, fallbackCap);
  }
  return out;
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
