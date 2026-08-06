// ═══════════════════════════════════════════════════════════════
// restyleAggressiveness.js — "עוצמת שכתוב": סליידר 0-100 שממופה לרצועה
// (band) של פרמטרים קשיחים לשכתוב טיוטת DOCX/PPTX.
//
// כל הפרמטרים שמושפעים מהסליידר יושבים כאן ולא מפוזרים בשירותים, כדי שאפשר
// יהיה לבדוק את המיפוי כפונקציה טהורה. הרצועה 'balanced' (ברירת המחדל, 40)
// מחזיקה בדיוק את הערכים שהיו קשיחים בקוד לפני הסליידר — כך שההתנהגות
// הקיימת לא זזה במילימטר.
// ═══════════════════════════════════════════════════════════════

import { getAppMemory, saveAppMemory } from './aiService';

export const RESTYLE_BANDS = [
  {
    id: 'gentle',
    label: 'עדין',
    min: 0,
    max: 25,
    temperature: 0.25,
    minLenRatio: 0.85,
    maxLenRatio: 1.20,
    onlyFlagged: true,
    includeTitles: false,
    minRestyleChars: 60,
    styleGateDelta: 0,
    promptSuffix: 'תקן רק פסקאות שנשמעות מכונתיות; פסקה שנשמעת טבעית — החזר אותה אות באות ללא שינוי.',
    hint: 'נגיעה מינימלית — רק פסקאות שהגלאי סימן כמכונתיות, ובשינוי קטן ככל האפשר.',
  },
  {
    id: 'balanced',
    label: 'מאוזן',
    min: 26,
    max: 55,
    temperature: 0.40,
    minLenRatio: 0.60,
    maxLenRatio: 1.60,
    onlyFlagged: false,
    includeTitles: false,
    minRestyleChars: 40,
    styleGateDelta: 1,
    promptSuffix: '',
    hint: 'ברירת המחדל — משכתב כל פסקה מהותית, עם שער סגנון ששומר שלא יֵצא גרוע יותר.',
  },
  {
    id: 'strong',
    label: 'חזק',
    min: 56,
    max: 80,
    temperature: 0.60,
    minLenRatio: 0.45,
    maxLenRatio: 1.90,
    onlyFlagged: false,
    includeTitles: false,
    minRestyleChars: 25,
    styleGateDelta: 4,
    promptSuffix: 'שכתב כל פסקה מהותית — גם כזו שנראית תקינה. גוון אורכי משפטים ופתיחים.',
    hint: 'שכתוב רחב גם לפסקאות שנראות תקינות, עם רצועת אורך ושער סגנון סלחניים יותר.',
  },
  {
    id: 'aggressive',
    label: 'אגרסיבי',
    min: 81,
    max: 100,
    temperature: 0.75,
    minLenRatio: 0.35,
    maxLenRatio: 2.20,
    onlyFlagged: false,
    includeTitles: true,
    minRestyleChars: 15,
    styleGateDelta: 999,
    promptSuffix: 'אל תחזיר אף פסקה ללא שינוי. נסח כל פסקה מחדש מקצה לקצה תוך שמירה מלאה על המשמעות.',
    hint: 'ניסוח מחדש של הכול, כולל כותרות — בלי רשת ביטחון של ציון סגנון.',
  },
];

const DEFAULT_AGGRESSIVENESS = 40;

// ממפה ערך סליידר לרצועה. ערך מחוץ לטווח נצבט (clamp) ולא נופל לברירת מחדל —
// רכיב UI שמעביר ערך פגום עדיין יקבל התנהגות מוגדרת.
export const resolveRestyleBand = (value) => {
  const n = Number(value);
  const safe = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : DEFAULT_AGGRESSIVENESS;
  return RESTYLE_BANDS.find((band) => safe >= band.min && safe <= band.max) || RESTYLE_BANDS[1];
};

// מפתחות ה-appMemory. שני scope נפרדים: שכתוב מסמך ושכתוב מצגת הם משימות
// שונות, ומשתמש שמעלה עוצמה למצגת לא מתכוון לשנות את התנהגות המסמכים.
const MEMORY_KEYS = {
  docx: 'restyleAggressivenessDocx',
  pptx: 'restyleAggressivenessPptx',
};

const memoryKeyFor = (scope) => MEMORY_KEYS[scope] || MEMORY_KEYS.docx;

export const getRestyleAggressiveness = (scope = 'docx') => {
  try {
    const raw = getAppMemory()[memoryKeyFor(scope)];
    const n = Number(raw);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : DEFAULT_AGGRESSIVENESS;
  } catch { return DEFAULT_AGGRESSIVENESS; }
};

export const saveRestyleAggressiveness = (scope = 'docx', value = DEFAULT_AGGRESSIVENESS) => {
  const n = Number(value);
  const safe = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : DEFAULT_AGGRESSIVENESS;
  try { saveAppMemory({ ...getAppMemory(), [memoryKeyFor(scope)]: safe }); } catch { /* לא קריטי */ }
  return safe;
};
