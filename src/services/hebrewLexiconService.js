// hebrewLexiconService.js — "האם המילה הזו מילה נפוצה, או שם פרטי / מונח תחומי?"
//
// למה זה קיים: כמה מקומות במערכת צריכים להבחין בין ניסוח לבין תוכן. הדוגמה
// שהולידה את זה — פתיח שנכרה מהכתיבה של המשתמש: "על פי הייג והרופ" חוזר בארבע
// עבודות ולכן נראה כהרגל ניסוח, אבל הוא נוקב בשמות חוקרים. שתילתו במטלה אחרת
// היא שתילת תוכן זר. אין ב-JS דרך לזהות שם פרטי בעברית — אין אותיות גדולות.
//
// העיקרון: **תדירות מסמכים היא המילון.** מילה שמופיעה בהרבה מסמכים בנושאים
// שונים היא מילת שפה; מילה שמופיעה במסמך אחד או שניים היא שם, מותג או מונח
// ייחודי לאותה עבודה. זה אותו עיקרון שכבר עבד לזיהוי הרגלי ניסוח (ספירה לפי
// מסמכים ולא לפי חזרות), מוחל על מילים בודדות.
//
// למה לא מילון חיצוני: נבדק — רשימת המילים שבריפו (tools/synonyms-build) היא
// רשימת מילות-קישור בת ~5.5k ולא מילון; היא מסמנת גם "את" ו"כי" כלא-מילים.
// מילון עברי מלא עם נטיות הוא נכס שאין לנו. אפשר לחבר כזה דרך
// `mergeExternalWordlist` אם וכאשר יימצא אחד ברישיון מתאים.
//
// תלויות: styleSampleStore + materialChunkStore (קריאה בלבד). LEAF-ish, browser+node.

import { getChunks as getStyleChunks } from './styleSampleStore';
import { getMaterialChunks } from './materialChunkStore';

const WORD_RE = /[֐-׿]{2,}/g;

// מילה שמופיעה בפחות מכך מסמכים אינה מילת שפה מבחינתנו. 3 הוא פשרה: נמוך מדי
// ושם חוזר בשתי עבודות עובר; גבוה מדי וקורפוס קטן הופך כל מילה ל"נדירה".
const COMMON_MIN_DOCS = 3;
// מתחת לכמות מסמכים הזו אין בסיס סטטיסטי, וכל תשובה תהיה ניחוש. במצב הזה
// השירות מצהיר שהוא לא מוכן, והקוראים חייבים להתייחס לזה (ראה isReady).
const MIN_DOCS_FOR_SIGNAL = 6;

let externalWords = null;   // מילון חיצוני אופציונלי (ראה mergeExternalWordlist)
let index = null;   // { df: Map<string, number>, docs: number }
let token = null;   // חתימת קורפוס — משתנה ⇒ בונים מחדש

// ה"א הידיעה, ו' החיבור ומילות היחס הצמודות. בלי הנרמול הזה "והרופ" ו"הרופ"
// נספרות כשתי מילים שונות, ושתיהן נדירות.
//
// שתי חלופות, והסדר ביניהן קריטי. הראשונה תופסת ו'/ש' *לפני* אות יחס ("וה", "שב")
// והשנייה תופסת ו'/ש' לבדה. אילו הסדר היה הפוך, "והרופ" היה מקולף ל-"הרופ" במקום
// ל-"רופ" — regex בוחר את החלופה הראשונה שמצליחה, לא את הארוכה ביותר.
//
// ו' לבדה נוספה אחרי מדידה: "ותקשורת" הופיע ב-14 מתוך 24 עבודות ולא נמצא במאגר,
// וכך גם "ודיפלומטיה", "ויחסי", "ותיקוני". כולן ו'+שורש שאין אחריו אות יחס.
//
// בכוונה **לא** מקלפים סיומות (ריבוי/שייכות). נמדד: קילוף סיומות מעלה כיסוי
// מ-87.6% ל-98%, אבל שובר 6 מתוך 8 שמות — "רותם"→"רות", "גופמן"→"גוף". ההבחנה
// בין שם למילה היא כל תפקידו של המודול, ולכן כיסוי נסוג מפניה.
const stripPrefix = (w) => String(w).replace(/^(?:ו?ש?[הבלכמ]|[וש])(?=[֐-׿]{3,})/u, '');

function collectDocuments() {
  const docs = new Map(); // docId → Set<word>
  const add = (docId, text) => {
    if (!docId) return;
    if (!docs.has(docId)) docs.set(docId, new Set());
    const set = docs.get(docId);
    (String(text || '').match(WORD_RE) || []).forEach((w) => {
      set.add(w);
      const stripped = stripPrefix(w);
      if (stripped !== w && stripped.length >= 2) set.add(stripped);
    });
  };

  try {
    getStyleChunks().forEach((c) => add(c?.docId || c?.documentId || c?.sourceTitle, c?.text));
  } catch { /* חנות לא זמינה — לא קריטי */ }
  try {
    getMaterialChunks().forEach((c) => add(c?.materialId || c?.sourceTitle, c?.text));
  } catch { /* כנ"ל */ }

  return docs;
}

function build() {
  const docs = collectDocuments();
  const df = new Map();
  docs.forEach((words) => {
    words.forEach((w) => df.set(w, (df.get(w) || 0) + 1));
  });
  return { df, docs: docs.size };
}

function getIndex() {
  let sig = '0';
  try { sig = `${getStyleChunks().length}:${getMaterialChunks().length}`; } catch { /* ignore */ }
  if (index && token === sig) return index;
  index = build();
  token = sig;
  return index;
}

/** מספר המסמכים שהמילה מופיעה בהם. */
export function documentFrequency(word) {
  const { df } = getIndex();
  const w = String(word || '');
  return Math.max(df.get(w) || 0, df.get(stripPrefix(w)) || 0);
}

/** האם יש מספיק מסמכים כדי שההחלטה תהיה משמעותית. */
export function isReady() {
  if (externalWords && externalWords.size) return true;
  return getIndex().docs >= MIN_DOCS_FOR_SIGNAL;
}

export function lexiconStats() {
  const { df, docs } = getIndex();
  return { documents: docs, vocabulary: df.size, ready: docs >= MIN_DOCS_FOR_SIGNAL };
}

/**
 * מילה נפוצה = מופיעה במספיק מסמכים שונים, **או** מופיעה במילון חיצוני אם חובר.
 * המילון החיצוני הוא רשת ביטחון: הוא מרחיב את הכיסוי מעבר לקורפוס האישי, שהוא
 * קטן מטבעו ולכן מסמן מילים לגיטימיות רבות כנדירות.
 */
export function isCommonWord(word) {
  const w = String(word || '');
  if (externalWords && (externalWords.has(w) || externalWords.has(stripPrefix(w)))) return true;
  if (!isReady()) return true;   // בלי בסיס — לא פוסלים כלום
  return documentFrequency(w) >= COMMON_MIN_DOCS;
}

/**
 * האם הביטוי מכיל מילה שנראית כשם פרטי / מונח ייחודי.
 *
 * fail-open בכוונה: קורפוס קטן מדי ⇒ false, ואז המסננים האחרים עובדים כרגיל.
 * עדיף להחמיץ שם פרטי מאשר לפסול ניסוח תקין אצל משתמש חדש.
 *
 * @param {string} phrase
 * @param {{maxRare?:number}} opts כמה מילים נדירות מותרות לפני שפוסלים
 * @returns {boolean}
 */
export function containsRareToken(phrase, { maxRare = 0 } = {}) {
  if (!isReady()) return false;
  const words = String(phrase || '').match(WORD_RE) || [];
  if (!words.length) return false;
  let rare = 0;
  for (const w of words) {
    if (w.length < 3) continue;              // מילות יחס קצרות אינן אינדיקציה
    if (!isCommonWord(w)) rare += 1;
    if (rare > maxRare) return true;
  }
  return false;
}

/** נקודת חיבור למילון חיצוני, אם יימצא כזה ברישיון מתאים. */
export function mergeExternalWordlist(words) {
  externalWords = new Set((Array.isArray(words) ? words : []).map((w) => String(w).trim()).filter(Boolean));
  index = null; token = null;
  return externalWords.size;
}
export function hasExternalWordlist() {
  return Boolean(externalWords && externalWords.size);
}
