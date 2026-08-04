// styleTargetsService.js — גוזר **יעדי ייצור מבניים** מהכתיבה של המשתמש.
//
// זו שכבת הפרסונליזציה הראשונה של המנוע המקומי, והיא נבנתה אחרי שכל ניסיונות
// ההתאמה ברמת הפרומפט נפלו במדידה (few-shot 35 מול 34 · עטיפה במסגרות המשתמש
// 35 מול 35 · לחץ גיוון לקסיקלי 53 מול 53 — ר' docs/nlg-handoff.md). המסקנה
// שחוזרת משלושתם: **הרגיסטר שמודל 4B כותב בו חסום, והנחיה מעליו לא חורגת ממנו.**
//
// לכן כאן לא מבקשים מהמודל כלום. מודדים הרגלים מבניים בכתיבה של המשתמש, ואוכפים
// אותם דטרמיניסטית על הפלט המולחן (ר' styleFitService). היתרון המבני, וזו גם
// הסיבה שזה הציר שנבחר: **אין כאן מודל בכלל**, ולכן זה רץ זהה באתר (Firebase)
// ובאפליקציה — בעוד ששכבת הניסוח קיימת רק בדסקטופ.
//
// ---------- ⚠️ לא כל תכונה כשירה לשמש יעד ----------
// styleFingerprintService מודד שש תכונות מבניות. הן טובות כ**מדד** (AUC 0.945,
// leave-one-out 23/23) — אבל שלוש מהן פסולות כ**יעד ייצור**, וזה נמדד:
//
//   · '@paraSents' **גולמי** — בכל 23 מסמכי המשתמש ספירת "\n\n" זהה לספירת "\n",
//     כלומר מחלץ ה-docx מפריד כל בלוק בשורה ריקה ו"פסקה" כוללת כותרות, שורות
//     ביבליוגרפיה ושורות שער. הגולמי אומר 1.79 (ובמסמך המוחזק 1.22) — כאילו
//     המשתמש כותב פסקה לכל משפט. **בפסקאות פרוזה בלבד: חציון 2.54 / ממוצע 3.59**
//     (23 מסמכים, קורפוס 27.7.26; אומת מחדש 4.8.26 ב-`tools/test-bench/style-targets.mjs`:
//     2.538 ±0.538). שני המספרים אמיתיים ואינם סותרים: 3.59 הוא הממוצע לפני
//     `stripNonAuthorial`, והוא נגרר אחרי מסמך יחיד ב-7.67 — ר' «למה חציון ולא
//     ממוצע» למטה. **היעד שנאכף הוא החציון.** כלומר הכיוון שהמדד הגולמי מכתיב
//     הפוך מההרגל האמיתי, והמנוע (2.62) כותב פחות מדי משפטים לפסקה ולא יותר
//     מדי. לכן כאן היעד נגזר מפסקאות פרוזה בלבד.
//   · '@typeTokenRatio' — תלוי-אורך מכנית: טקסט ארוך יותר מקבל ציון גיוון נמוך
//     יותר בלי קשר לאוצר המילים. השוואה בין אורכים שונים מוטה מיסודה.
//   · '@sentLenSd' — נגזרת של אורך המשפט, ותזוז מאליה כשהאורך יזוז. אכיפה ישירה
//     שלה היא רעש.
//
// שלוש הנותרות (אורך משפט · פסיקים למשפט · שיעור שעבוד) חסינות-נושא, חסינות
// לצורת החילוץ, ונמדדות זהה בשני הצדדים — ורק הן נאכפות.
//
// ---------- למה חציון ולא ממוצע ----------
// נמדד: מסמך אחד ("מטלה מנהל ציבורי 2") נותן 7.50 משפטים לפסקה מול 2.0-3.5 בשאר.
// ממוצע היה נגרר אחריו. הקורפוס קטן (23 מסמכים) ולכן חריג יחיד שוקל 4%.
// זה בדיוק הפער 2.54 מול 3.59 שלמעלה: אותו קורפוס, חציון מול ממוצע. אין כאן
// שתי מדידות מתחרות אלא שני אומדנים של אותה מדידה (הממוצע בהגדרה התפעולית
// המלאה הוא 3.14; 3.59 הוא אותו ממוצע לפני stripNonAuthorial).
//
// תלויות: styleFingerprintService בלבד (שהוא עצמו LEAF). LEAF כלפי המנוע.

import {
  structuralFeatures,
  stripNonAuthorial,
  tokenizeForStyle,
  MIN_DOC_WORDS,
} from './styleFingerprintService.js';
import { COMMA_SLOT_DEFS, measureCommaSlotRates } from './styleFitService.js';

/** מפתחות שנאכפים בפועל. כל מפתח כאן חייב מימוש ב-styleFitService. */
export const STYLE_TARGET_KEYS = ['sentLen', 'commaPerSent', 'subordination', 'paraSents'];

/** תוויות לתצוגה — כרטיס הסגנון בשלב קליטת הסגנון. */
export const STYLE_TARGET_LABELS = {
  sentLen: 'אורך משפט ממוצע (מילים)',
  commaPerSent: 'פסיקים למשפט',
  subordination: 'שיעור שעבוד (משפט מורכב)',
  paraSents: 'משפטים לפסקה',
};

export const STYLE_TARGETS_STORAGE_KEY = 'wordai_style_targets_v1';
export const STYLE_TARGETS_SCHEMA_VERSION = 1;

/** מתחת לזה אין ממה לגזור חציון יציב — עדיף ברירות המחדל מיעד מומצא. */
export const MIN_TARGET_DOCS = 3;

/** בלוק קצר מזה אינו פסקת פרוזה אלא כותרת / פריט רשימה / שורת ביבליוגרפיה. */
const MIN_PROSE_BLOCK_WORDS = 8;

/**
 * בלוקי הפרוזה של מסמך — הבסיס לכל יעד כאן.
 *
 * הפיצול הוא על `\n+` ולא על `\n{2,}` בכוונה: mammoth מפריד בשורה אחת, מחלצים
 * אחרים בשתיים, וההבדל הזה הוא בדיוק מה שהרעיל את '@paraSents' הגולמי. בלוק
 * נחשב פרוזה רק אם הוא **נגמר בסימן סיום** ומכיל מספיק מילים.
 */
export function extractProseBlocks(text) {
  return String(text || '')
    .split(/\n+/)
    .map((b) => b.trim())
    .filter((b) => /[.!?]\s*$/.test(b) && tokenizeForStyle(b).length >= MIN_PROSE_BLOCK_WORDS);
}

/**
 * מודד מסמך יחיד.
 *
 * `stripNonAuthorial` מוחל **לפני** הכל, ומאותה סיבה שהוא מוחל במדד: ציטוט ישיר
 * הוא המשפט של מישהו אחר, והפניה בסוגריים ("(כהן, 2019)") תורמת פסיקים שהם
 * פורמט-ציטוט ולא הרגל כתיבה. זה גם מה ש-style-diff עושה לשני הצדדים, ולכן היעד
 * שנגזר כאן בר-השוואה ישירה למה שהדיווח שם מציג.
 *
 * @returns {{sentLen:number, commaPerSent:number, subordination:number,
 *            paraSents:number, words:number, blocks:number}|null}
 */
export function measureStyleTargets(text) {
  const blocks = extractProseBlocks(stripNonAuthorial(String(text || '')));
  if (!blocks.length) return null;
  const prose = blocks.join('\n\n');
  const words = tokenizeForStyle(prose).length;
  if (!words) return null;

  // אותה פונקציה שמייצרת את התכונות במדד — לא הגדרה מקבילה. הגדרה כפולה של
  // "שעבוד" או "משפט" הייתה נסחפת מהמדד בשקט, והיעד היה מכוון למקום אחר ממה
  // שהמדידה מדווחת.
  const f = structuralFeatures(prose);
  return {
    sentLen: f['@sentLen'],
    commaPerSent: f['@commaPerSent'],
    subordination: f['@subordination'],
    paraSents: f['@paraSents'],
    words,
    blocks: blocks.length,
    // ספירות גולמיות ולא שיעורים: הצבירה בין מסמכים חייבת להיות לפי מופעים.
    slots: measureCommaSlotRates(prose),
  };
}

function median(nums) {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/** פיזור עמיד (MAD) — כדי שהמעבר ידע מתי הוא "מספיק קרוב" ולא ירדוף אחרי נקודה. */
function mad(nums, med) {
  const a = nums.filter((n) => Number.isFinite(n)).map((n) => Math.abs(n - med));
  return median(a) ?? 0;
}

/**
 * גוזר את פרופיל היעדים מהעבודות של המשתמש.
 *
 * מחזיר null כשאין מספיק חומר — ו**זה מסלול תקין**: בלי פרופיל המנוע רץ בדיוק
 * כמו היום. יעד שנגזר משני מסמכים גרוע מברירת מחדל, כי הוא נראה אישי בלי להיות.
 *
 * @param {Array<string|{text:string}>} docs עבודות של המשתמש
 * @returns {{version:number, docCount:number, wordCount:number,
 *            sentLen:number, commaPerSent:number, subordination:number,
 *            paraSents:number, spread:object, derivedAt:(string|null)}|null}
 */
export function deriveStyleTargets(docs, { derivedAt = null } = {}) {
  const measured = (Array.isArray(docs) ? docs : [])
    .map((d) => (typeof d === 'string' ? d : d?.text))
    .map((t) => String(t || ''))
    .filter((t) => tokenizeForStyle(t).length >= MIN_DOC_WORDS)
    .map(measureStyleTargets)
    .filter(Boolean);
  return aggregateStyleTargets(measured, { derivedAt });
}

/**
 * מצרף רשומות-מדידה לפרופיל יעדים.
 *
 * הפרדה מ-deriveStyleTargets כדי שהאפליקציה תוכל לשמור **רשומות ולא טקסטים**:
 * רשומה היא עשרה מספרים, והיא כל מה שדרוש כדי לגזור מחדש. כך הפרופיל מסתנכרן
 * לענן בלי שהעבודות של המשתמש יעזבו את המכשיר, וכך הוספת מסמך אחד אינה מחייבת
 * למדוד מחדש את כל הקורפוס.
 *
 * @param {Array<object>} records פלטי measureStyleTargets
 */
export function aggregateStyleTargets(records, { derivedAt = null } = {}) {
  const measured = (Array.isArray(records) ? records : []).filter((m) => m && Number.isFinite(m.sentLen));
  if (measured.length < MIN_TARGET_DOCS) return null;

  const out = {
    version: STYLE_TARGETS_SCHEMA_VERSION,
    docCount: measured.length,
    wordCount: measured.reduce((a, m) => a + (m.words || 0), 0),
    spread: {},
    commaSlots: aggregateCommaSlots(measured),
    derivedAt: derivedAt || null,
  };
  for (const key of STYLE_TARGET_KEYS) {
    const vals = measured.map((m) => m[key]);
    const med = median(vals);
    out[key] = med;
    out.spread[key] = mad(vals, med);
  }
  return out;
}

/**
 * **איפה המשתמש שם פסיק בפועל** — לכל משמורת מועמדת, שיעור המופעים שהוא פיסק.
 *
 * זה מה שמחליף את הניחוש. הגרסה הראשונה קבעה ביד רשימת משמורות "בטוחות", ושתיים
 * מהן הפיקו עברית שגויה על פלט אמיתי (ר' ההערה בראש styleFitService). משמורת
 * נאכפת רק אם המשתמש עצמו עקבי בה — וזו גם הפרסונליזציה עצמה: שני משתמשים
 * שכותבים את אותו תוכן יקבלו פיסוק שונה, כי הם מפסקים שונה.
 *
 * ⚠️ הצבירה היא **לפי מופעים ולא חציון-של-שיעורים**: משמורת שמופיעה פעמיים
 * במסמך אחד ו-40 פעם באחר צריכה להישקל לפי המופעים. נמדד בקורפוס הזה — «כי»
 * מופיעה 117 פעם ומפוסקת ב-1% מהן, ואילו רשימה ידנית הייתה מסמנת אותה "בטוחה"
 * ומזריקה מאה פסיקים שהמשתמש אינו כותב.
 *
 * @returns {Object<string,{rate:number, total:number}>}
 */
export function aggregateCommaSlots(records) {
  const agg = {};
  for (const def of COMMA_SLOT_DEFS) agg[def.id] = { total: 0, withComma: 0 };
  for (const r of records) {
    for (const id of Object.keys(agg)) {
      agg[id].total += r?.slots?.[id]?.total || 0;
      agg[id].withComma += r?.slots?.[id]?.withComma || 0;
    }
  }
  const out = {};
  for (const [id, v] of Object.entries(agg)) {
    out[id] = { rate: v.total ? v.withComma / v.total : 0, total: v.total };
  }
  return out;
}

/** האם אובייקט היעדים שמיש (יכול להגיע מסנכרון ענן של גרסה אחרת). */
export function isValidStyleTargets(t) {
  if (!t || typeof t !== 'object') return false;
  if (t.version !== STYLE_TARGETS_SCHEMA_VERSION) return false;
  if (!(t.docCount >= MIN_TARGET_DOCS)) return false;
  // יעד לא-סביר מצביע על קורפוס פגום, ואכיפתו תעוות את הפלט יותר מברירת המחדל.
  if (!(t.sentLen > 5 && t.sentLen < 60)) return false;
  if (!(t.commaPerSent >= 0 && t.commaPerSent < 6)) return false;
  if (!(t.paraSents >= 1 && t.paraSents < 15)) return false;
  return true;
}

/** JSON לאחסון מקומי ולסנכרון ענן. קטן בכוונה — עשרות בתים, לא הקורפוס. */
export function serializeStyleTargets(targets) {
  return isValidStyleTargets(targets) ? JSON.stringify(targets) : null;
}

export function parseStyleTargets(raw) {
  if (!raw) return null;
  try {
    const t = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return isValidStyleTargets(t) ? t : null;
  } catch {
    return null;
  }
}

/** תיאור קריא — לשורת הסטטוס ולכרטיס הסגנון. */
export function describeStyleTargets(targets) {
  if (!isValidStyleTargets(targets)) return 'אין פרופיל סגנון — המנוע כותב בברירת המחדל';
  return `פרופיל סגנון מ-${targets.docCount} עבודות · משפט ${targets.sentLen.toFixed(1)} מילים · `
    + `${targets.commaPerSent.toFixed(2)} פסיקים למשפט · ${targets.paraSents.toFixed(1)} משפטים לפסקה`;
}
