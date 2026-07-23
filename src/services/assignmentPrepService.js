// assignmentPrepService.js — פנקס ההכנה: מה כבר מוכן מקומית, ומה באמת דורש AI.
//
// זו הארכיטקטורה הדו-שלבית של המסלול הזה:
//   שלב 1 (כאן, בלי AI): ממצה כל מה שאפשר להפיק דטרמיניסטית — מבנה, מכסות,
//          ראיות מהחומרים של המשתמש, פתיחים מהקורפוס שלו, פורמט ציטוט.
//   שלב 2 (assignmentAiService): מקבל *רק* את הפריטים שנשארו, עם התוצר המקומי
//          כהקשר, ולכן הבקשות צרות ומעוגנות במקום "כתוב לי עבודה".
//
// למה פנקס ולא סתם "צור מסמך": הוא הופך את התלות ב-AI לגלויה ומדידה. המשתמש רואה
// "9 פריטים מוכנים, 4 דורשים AI, 1 חסום" ויודע בדיוק מה הוא מקבל בחינם, מה עולה
// לו קריאה, ומה שום מודל לא יפתור (חסר לו מקור).
//
// עיקרון מנחה: needsAi הוא *הודאה בכישלון מקומי*, לא ברירת מחדל. כל פריט כזה נושא
// reason קריא — אם אי אפשר לנסח למה, כנראה אפשר היה לעשות אותו מקומית.
//
// תלויות: assignmentSpecService (INTENT_LABELS), styleOpenerService. LEAF ביחס ל-AI —
// אפס import מ-aiService, כדי שהפנקס יחושב גם כשאין ספק מוגדר.

import { INTENT_LABELS } from './assignmentSpecService';
import { getOpenersForIntent, getOpenerStatus } from './styleOpenerService';
import { getOpenerProfile } from './openerProfileService';

export const PREP_STATE = {
  LOCAL: 'local',       // הופק מקומית, לא צריך כלום
  LOCAL_DRAFT: 'local-draft', // ניתן לכתוב טיוטה מקומית מהראיות (proseComposeService) — AI אופציונלי לשיפור
  NEEDS_AI: 'needs-ai', // אפשר להשלים בקריאת מודל
  BLOCKED: 'blocked',   // שום מודל לא יפתור — חסר קלט (בדרך כלל מקור)
};

// סוגי עבודה ליחידת מסמך. הסדר הוא סדר ההצגה.
export const WORK_KINDS = {
  STRUCTURE: 'structure',
  EVIDENCE: 'evidence',
  OPENER: 'opener',
  PROSE: 'prose',
};

const KIND_LABELS = {
  structure: 'מבנה ומכסה',
  evidence: 'ראיות תומכות',
  opener: 'פתיח בקול שלך',
  prose: 'גוף הסעיף',
};

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * בונה את פנקס ההכנה לשלד נתון.
 *
 * @param {object} scaffold ה-blob מ-assignmentScaffoldStore (spec + evidence)
 * @param {{hasWrittenProse?:function}} opts
 *        hasWrittenProse(section) → boolean — מאפשר לקורא לדווח אילו סעיפים כבר
 *        נכתבו בפועל בעורך, כדי שלא נציע להשלים טקסט שהמשתמש כבר כתב.
 * @returns {{items:Array<object>, bySection:Object, totals:object, sections:Array}}
 */
export function buildPrepLedger(scaffold, { hasWrittenProse = null } = {}) {
  const spec = scaffold?.spec;
  const sections = Array.isArray(spec?.sections)
    ? spec.sections.filter((s) => s?.enabled !== false)
    : [];

  const evidenceMap = isPlainObject(scaffold?.evidence) ? scaffold.evidence : {};
  const openerStatus = getOpenerStatus();

  const items = [];
  const bySection = {};

  sections.forEach((section) => {
    const sectionItems = [];
    const found = evidenceMap[section.id];
    const evidence = Array.isArray(found?.evidence) ? found.evidence : [];
    const written = typeof hasWrittenProse === 'function' ? Boolean(hasWrittenProse(section)) : false;

    // 1. מבנה — תמיד מקומי. זה בדיוק מה שהפרסר הדטרמיניסטי קיים בשבילו.
    sectionItems.push({
      id: `${section.id}:structure`,
      sectionId: section.id,
      kind: WORK_KINDS.STRUCTURE,
      state: PREP_STATE.LOCAL,
      detail: section.wordQuota ? `כותרת + מכסה ~${section.wordQuota} מילים` : 'כותרת',
    });

    // 2. ראיות — מקומי אם נמצא חומר תומך. אחרת *חסום*, לא needsAi: מודל שימציא
    //    מקור לסעיף שאין לו חומר הוא בדיוק הכשל שהמסלול הזה נועד למנוע.
    if (evidence.length) {
      sectionItems.push({
        id: `${section.id}:evidence`,
        sectionId: section.id,
        kind: WORK_KINDS.EVIDENCE,
        state: PREP_STATE.LOCAL,
        detail: `${evidence.length} קטעים מ-${new Set(evidence.map((e) => e.sourceTitle)).size} מקורות`,
      });
    } else {
      sectionItems.push({
        id: `${section.id}:evidence`,
        sectionId: section.id,
        kind: WORK_KINDS.EVIDENCE,
        state: PREP_STATE.BLOCKED,
        reason: 'אין בחומרים שהעלית קטע רלוונטי לסעיף הזה',
        remedy: 'העלה מקור נוסף, או חפש מקורות לסעיף',
      });
    }

    // 3. פתיח — ממוקש מהקורפוס כשיש הרגל, ואם אין — מורכב מהדקדוק הגלובלי
    //    (openerGrammar). מאז מנוע ההרכבה הענף הריק כמעט בלתי-אפשרי, אבל נשמר
    //    כרשת ביטחון (דקדוק שלא נטען עדיין).
    const openers = getOpenersForIntent(section.intent, {
      limit: 1,
      seedKey: section.id,
      profile: getOpenerProfile(),
    });
    if (openers.length) {
      const o = openers[0];
      sectionItems.push({
        id: `${section.id}:opener`,
        sectionId: section.id,
        kind: WORK_KINDS.OPENER,
        state: PREP_STATE.LOCAL,
        detail: o.composed
          ? `"${o.text}" ${o.general ? '(כללי)' : '(מנוסח עבורך)'}`
          : `"${o.text}…"`,
      });
    } else {
      sectionItems.push({
        id: `${section.id}:opener`,
        sectionId: section.id,
        kind: WORK_KINDS.OPENER,
        state: PREP_STATE.NEEDS_AI,
        reason: openerStatus.sparse
          ? 'אין מספיק טקסט שלך כדי ללמוד פתיח לסוג הסעיף הזה'
          : `לא נמצא בקורפוס שלך פתיח מסוג "${INTENT_LABELS[section.intent] || section.intent}"`,
      });
    }

    // 4. גוף הסעיף — כשיש ראיות, קיים מסלול מקומי מלא: proseComposeService מרכיב
    //    טיוטה מעוגנת (משפטי תוכן מהראיות + מסגור רטורי מ-sentenceGrammar), בלי
    //    מודל. AI נשאר כמסלול שיפור אופציונלי. בלי ראיות — חסום כמו תמיד:
    //    כתיבה בלי עיגון היא המצאה.
    if (written) {
      sectionItems.push({
        id: `${section.id}:prose`,
        sectionId: section.id,
        kind: WORK_KINDS.PROSE,
        state: PREP_STATE.LOCAL,
        detail: 'כתבת את הסעיף בעצמך',
      });
    } else {
      sectionItems.push({
        id: `${section.id}:prose`,
        sectionId: section.id,
        kind: WORK_KINDS.PROSE,
        state: evidence.length ? PREP_STATE.LOCAL_DRAFT : PREP_STATE.BLOCKED,
        reason: evidence.length
          ? 'טיוטה מקומית זמינה — מורכבת מהראיות של הסעיף בלבד (AI אופציונלי לליטוש)'
          : 'אין ראיות לעגן בהן טיוטה — כתיבה כאן תהיה המצאה',
        remedy: evidence.length ? null : 'הוסף מקור לסעיף ואז אפשר יהיה לכתוב טיוטה מעוגנת',
        groundedBy: evidence.length,
      });
    }

    bySection[section.id] = sectionItems;
    sectionItems.forEach((item) => items.push(item));
  });

  const totals = items.reduce((acc, item) => {
    acc[item.state] = (acc[item.state] || 0) + 1;
    return acc;
  }, { [PREP_STATE.LOCAL]: 0, [PREP_STATE.LOCAL_DRAFT]: 0, [PREP_STATE.NEEDS_AI]: 0, [PREP_STATE.BLOCKED]: 0 });
  totals.all = items.length;

  return { items, bySection, totals, sections };
}

/** פריטים שממתינים ל-AI בלבד — הקלט של שלב 2. */
export function getPendingAiItems(ledger) {
  return (ledger?.items || []).filter((item) => item.state === PREP_STATE.NEEDS_AI);
}

/** פריטים חסומים — אלה שדורשים פעולה של המשתמש, לא קריאת מודל. */
export function getBlockedItems(ledger) {
  return (ledger?.items || []).filter((item) => item.state === PREP_STATE.BLOCKED);
}

/**
 * סיכום קריא לאדם. משמש את הכותרת של מסך ההכנה.
 * @returns {string}
 */
export function summarizeLedger(ledger) {
  const t = ledger?.totals;
  if (!t?.all) return 'אין עדיין שלד.';
  const parts = [`${t[PREP_STATE.LOCAL]} מוכנים מקומית`];
  if (t[PREP_STATE.LOCAL_DRAFT]) parts.push(`${t[PREP_STATE.LOCAL_DRAFT]} עם טיוטה מקומית זמינה`);
  if (t[PREP_STATE.NEEDS_AI]) parts.push(`${t[PREP_STATE.NEEDS_AI]} דורשים AI`);
  if (t[PREP_STATE.BLOCKED]) parts.push(`${t[PREP_STATE.BLOCKED]} חסומים`);
  return `${parts.join(' · ')} (מתוך ${t.all})`;
}

export const WORK_KIND_LABELS = KIND_LABELS;
