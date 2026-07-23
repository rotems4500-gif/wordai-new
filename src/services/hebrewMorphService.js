// hebrewMorphService.js — נטייה בטוחה: חוקים גנרטיביים מאחורי שער ולידציה.
//
// hebrewMorphRules מסוגל להטות כל (שורש,בניין) נתמך — אבל עברית מלאה בחריגים,
// והעיקרון כאן: **אף צורה מנוחשת לא מגיעה למסמך.** tools/morph-build הריץ את
// החוקים על כל הפעלים בלקסיקון, שופט-Flash אישר/תיקן, והפלט ב-morphRules.data.js:
//   validated: ["root|binyan", ...]   — זוגות שכל צורות המפתח שלהם אושרו
//   exceptions: { "root|binyan|formKey": "צורה נכונה", ... } — תיקונים נקודתיים
//
// conjugateSafe מחזיר צורה רק אם הזוג מאושר (עם עדיפות לחריג המפורש); אחרת
// null — והקורא נופל לצורות מוטות-מראש (openerGrammar) כמו היום.
//
// תלויות: hebrewMorphRules (טהור) + hebrewLexemeService (שורש/בניין מהלקסיקון).

import { conjugate, classifyRoot, VALIDATION_FORM_KEYS } from './hebrewMorphRules.js';
import { findLexeme } from './hebrewLexemeService.js';

let data = null;          // { validated:Set, exceptions:Object }
let loadPromise = null;

async function ensureLoaded() {
  if (data) return data;
  if (!loadPromise) {
    loadPromise = import('./morphRules.data.js')
      .then((mod) => {
        data = {
          validated: new Set(mod.MORPH_VALIDATED || []),
          exceptions: mod.MORPH_EXCEPTIONS || {},
        };
        return data;
      })
      .catch(() => {
        // הדאטה עוד לא נבנה — מצב "אפס אמון": שום צורה לא מאושרת.
        data = { validated: new Set(), exceptions: {} };
        return data;
      });
  }
  return loadPromise;
}

export async function ensureMorphReady() {
  const d = await ensureLoaded();
  return d.validated.size;
}

export function morphStats() {
  return data
    ? { loaded: true, validatedPairs: data.validated.size, exceptions: Object.keys(data.exceptions).length }
    : { loaded: false, validatedPairs: 0, exceptions: 0 };
}

const featToFormKey = (feat) => {
  // ממפה feat לצורת-מפתח אם היא אחת מהנבדקות (לחיפוש חריג מדויק).
  for (const [key, f] of VALIDATION_FORM_KEYS) {
    if (f.tense === feat.tense
      && (f.person || 3) === (feat.person || 3)
      && (f.g || 'm') === (feat.g || 'm')
      && (f.n || 's') === (feat.n || 's')) return key;
  }
  return null;
};

/**
 * נטייה בטוחה. null אם הזוג לא מאושר / הגזרה לא נתמכת.
 * sync אחרי ensureMorphReady (או ריצה ראשונה — אז null עד הטעינה).
 */
export function conjugateSafe(root, binyan, feat = {}) {
  if (!data) return null;
  const pair = `${root}|${binyan}`;
  const formKey = featToFormKey(feat);
  if (formKey) {
    const exception = data.exceptions[`${pair}|${formKey}`];
    if (exception) return exception;
  }
  if (!data.validated.has(pair)) return null;
  return conjugate(root, binyan, feat);
}

/**
 * נטייה לפי מילה מהלקסיקון: מאתר שורש+בניין דרך hebrewLexemeService ומטה.
 * למשל inflectVerb('הסביר', {tense:'present', g:'f'}) → 'מסבירה'.
 */
export function inflectVerb(word, feat = {}) {
  const lex = findLexeme(word);
  if (!lex || lex.pos !== 'v' || !lex.root || !lex.binyan) return null;
  return conjugateSafe(lex.root, lex.binyan, feat);
}

export { classifyRoot };
