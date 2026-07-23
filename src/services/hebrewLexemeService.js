// hebrewLexemeService.js — גישת ריצה ללקסיקון העברי המתויג.
//
// הדאטה נבנה אופליין ע"י tools/lexicon-build (Gemini Flash, ולידציה בשופט-Flash)
// ונשמר ב-hebrewLexicon.data.js: lemma -> [pos, g, n, reg, root, binyan, plural,
// construct]. השירות הזה עוטף אותו:
//   - טעינה עצלה (הקובץ גדל לכיוון 20k לממות — לא נטען עד שצריך).
//   - lookup שמתמודד עם נטיות דרך analyzeHebrewWord של synonymsService
//     (קילוף קליטיקים/סיומות), כך ש"והספרים" מוצא את "ספר".
//   - חיבור ל-hebrewLexiconService.mergeExternalWordlist — הלקסיקון משמש גם
//     כרשת ביטחון ל"מילה נפוצה מול שם פרטי" (ה-hook שחיכה למילון ברישיון מתאים;
//     כאן המילון שלנו, נבנה בעצמנו — אין בעיית רישוי).
//
// LEAF: תלוי רק ב-synonymsService (פונקציית ניתוח) וב-hebrewLexiconService (hook).
// browser+node.

import { analyzeHebrewWord } from './synonymsService.js';
// hebrewLexiconService נטען עצלה בתוך registerLexiconAsWordlist בלבד: הוא מושך
// את חנויות ה-style/material (imports ללא סיומת, browser-oriented) — תלות
// סטטית עליו שוברת הרצת Node ישירה של המנוע (morph-build, בדיקות).

const POS = { VERB: 'v', NOUN: 'n', ADJ: 'a', ADV: 'd', CONN: 'c', PREP: 'p', OTHER: 'x' };

let lexicon = null;          // המילון עצמו אחרי טעינה
let loadPromise = null;

async function ensureLoaded() {
  if (lexicon) return lexicon;
  if (!loadPromise) {
    loadPromise = import('./hebrewLexicon.data.js')
      .then((mod) => {
        lexicon = mod.HEBREW_LEXICON || {};
        return lexicon;
      })
      .catch(() => {
        // הקובץ עוד לא נבנה (לפני ריצת הכלי) — מתנהגים כמילון ריק, בלי להפיל.
        lexicon = {};
        return lexicon;
      });
  }
  return loadPromise;
}

function entryToObject(lemma, arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  const [pos, g = null, n = null, reg = 2, root = null, binyan = null, plural = null, construct = null] = arr;
  return { lemma, pos, g, n, reg, root, binyan, plural, construct };
}

/** האם הלקסיקון נטען וכמה יש בו. */
export function lexemeStats() {
  return { loaded: Boolean(lexicon), lemmas: lexicon ? Object.keys(lexicon).length : 0 };
}

/** מבטיח טעינה; מחזיר מספר לממות. */
export async function ensureLexemesReady() {
  const lex = await ensureLoaded();
  return Object.keys(lex).length;
}

/**
 * lookup ישיר לפי למה מדויקת. sync — מחזיר null אם הלקסיקון עוד לא נטען
 * (קוראים שאכפת להם יקראו קודם ל-ensureLexemesReady).
 */
export function getLexeme(lemma) {
  if (!lexicon) return null;
  const key = String(lemma || '').trim();
  return entryToObject(key, lexicon[key]);
}

/**
 * lookup סלחני: מנסה את המילה כמו שהיא, ואז וריאנטים מקולפים (קליטיקים,
 * סיומות ריבוי/נקבה) דרך analyzeHebrewWord. מחזיר את הלקסמה + הווריאנט שקלע.
 */
export function findLexeme(word) {
  if (!lexicon) return null;
  const direct = getLexeme(word);
  if (direct) return { ...direct, matched: String(word || '').trim() };
  let analysis = null;
  try { analysis = analyzeHebrewWord(word); } catch { return null; }
  const candidates = Array.isArray(analysis?.candidates)
    ? analysis.candidates.map((c) => (typeof c === 'string' ? c : c?.lemma)).filter(Boolean)
    : [];
  for (const cand of candidates) {
    const hit = getLexeme(cand);
    if (hit) return { ...hit, matched: cand };
  }
  return null;
}

/** כל הלקסמות מחלק-דיבר נתון (למשל כל הפעלים עם שורש+בניין — למנוע המורפולוגיה). */
export function lexemesByPos(pos) {
  if (!lexicon) return [];
  const out = [];
  for (const [lemma, arr] of Object.entries(lexicon)) {
    if (arr[0] === pos) out.push(entryToObject(lemma, arr));
  }
  return out;
}

/**
 * מזין את הלקסיקון (לממות + צורות ריבוי/נסמך) לתוך hebrewLexiconService
 * כ"מילון חיצוני" — משפר את הבחנת מילה-נפוצה/שם-פרטי מעבר לקורפוס האישי.
 * מחזיר את גודל הרשימה שחוברה. לקרוא פעם אחת בעליית האפליקציה (עצל, לא חובה).
 */
export async function registerLexiconAsWordlist() {
  const lex = await ensureLoaded();
  const words = [];
  for (const [lemma, arr] of Object.entries(lex)) {
    words.push(lemma);
    if (arr[6]) words.push(arr[6]); // plural
    if (arr[7]) words.push(arr[7]); // construct
  }
  if (!words.length) return 0;
  const { mergeExternalWordlist } = await import('./hebrewLexiconService.js');
  return mergeExternalWordlist(words);
}

export const LEXEME_POS = POS;
