// assignmentReviewService.js — סבב התיקונים שלפני האישור.
//
// שני חלקים נפרדים בכוונה:
//
//   1. reviewDraft — **אפס קריאות API.** בדיקות דטרמיניסטיות על הטיוטה: היקף מול
//      מכסה, סעיפים חסומים, סימוני [דרוש מקור נוסף], פסקאות בלי הפניה, מקורות
//      שנשמרו כתקציר בלבד. זה מה שהמשתמש רואה לפני שהוא מחליט משהו.
//
//   2. applyFinishingPasses — מעברי הסגנון, **רק אם המשתמש ביקש**. זו הייתה
//      דרישה מפורשת: לא להריץ ליטוש אוטומטית, אלא להשאיר את הבחירה לרגע שלפני
//      הצגת העבודה.
//
// למה הכל דטרמיניסטי בשלב 1: "בקר איכות" שהוא עצמו מודל שפה ממציא ליקויים
// ומפספס אמיתיים. ספירת מילים והפניות היא בדיוק הסוג של דבר שקוד עושה נכון.
//
// תלויות: styleJudgeService, humanizerLoopService, aiService (invokeModel בלבד).

import { chatWithActiveProvider, getPersonalStyleProfile } from './aiService';
import { normalizeStyleEngine } from './styleProfileService';
import { rewriteDocumentHtmlTowardStyle } from './styleJudgeService';
import { runHumanizerLoop, STEALTH_HUMANIZE_GUIDE } from './humanizerLoopService';

export const SEVERITY = { BLOCK: 'block', WARN: 'warn', INFO: 'info' };

// יחס שנמדד (tools/test-bench/quota-probe.mjs): אותה מכסה ואותו פרומפט, קטע ראיות
// אחד נתן 98 מילים וארבעה נתנו 217. המודל לא "כותב קצר" — הוא מסרב לרפד מעבר
// למה שהמקורות מאפשרים, וזה בדיוק ההתנהגות שביקשנו. לכן סעיף קצר מהמכסה הוא
// כמעט תמיד תסמין של מחסור במקורות, ועל זה צריך להתריע.
const WORDS_PER_EVIDENCE_WORD = 1.6;
// מתחת ל-75% מהמכסה זה פער שמורגש בהגשה. מעל 120% זו חריגה.
const UNDER_QUOTA_RATIO = 0.75;
const OVER_QUOTA_RATIO = 1.2;

const countWords = (text = '') => String(text || '').split(/\s+/).filter(Boolean).length;

// הפניה בסוגריים: (כהן, עמ' 14) או (Asch, 1951). מכוון להיות סלחני — המטרה היא
// לתפוס פסקה *בלי שום* עוגן, לא לאכוף פורמט APA.
const CITATION_RE = /\([^)]*(?:עמ['׳]|\d{4})[^)]*\)/;
const GAP_MARK_RE = /\[דרוש מקור/;

/**
 * סוקר את פלט draftWholeWork. אפס קריאות API.
 *
 * @param {object} spec
 * @param {object} draft פלט draftWholeWork
 * @param {{evidenceBySection?:object}} opts
 * @returns {{findings:Array, stats:object, ready:boolean}}
 */
export function reviewDraft(spec, draft = {}, { evidenceBySection = {} } = {}) {
  const findings = [];
  const sections = Array.isArray(spec?.sections) ? spec.sections.filter((s) => s?.enabled !== false) : [];
  const written = new Map((draft.sections || []).map((s) => [s.id, s]));

  let totalWords = 0;

  sections.forEach((section) => {
    const hit = written.get(section.id);
    const quota = Number(section.wordQuota) || 0;
    const evidence = evidenceBySection?.[section.id]?.evidence || [];

    if (!hit) {
      findings.push({
        id: `blocked:${section.id}`,
        severity: SEVERITY.BLOCK,
        sectionId: section.id,
        title: `"${section.title}" לא נכתב`,
        detail: 'אין לסעיף חומר תומך. חפש לו מקורות מפאנל הראיות, או הסר אותו מהמטלה.',
      });
      return;
    }

    const words = countWords(hit.text);
    totalWords += words;

    if (quota && words < quota * UNDER_QUOTA_RATIO) {
      // ההבחנה החשובה: מחסור במקורות מול משהו אחר. בלעדיה המשתמש חושב שהמודל
      // התעצל ומבקש "תאריך", ומקבל ריפוד — בדיוק מה שניסינו למנוע.
      const evidenceWords = evidence.reduce((sum, e) => sum + countWords(e.text), 0);
      const reachable = Math.round(evidenceWords * WORDS_PER_EVIDENCE_WORD);
      const starved = evidenceWords > 0 && reachable < quota;
      findings.push({
        id: `short:${section.id}`,
        severity: SEVERITY.WARN,
        sectionId: section.id,
        title: `"${section.title}" — ${words} מילים מתוך ${quota}`,
        detail: starved
          ? `${evidence.length} קטעי מקור מאפשרים בערך ${reachable} מילים. כדי להגיע ל-${quota} צריך עוד מקורות — הרחבה בלי מקור היא ריפוד.`
          : 'אפשר לבקש הרחבה מפאנל הראיות בסעיף הזה.',
        actionable: starved ? 'more-sources' : 'expand',
      });
    }

    if (quota && words > quota * OVER_QUOTA_RATIO) {
      findings.push({
        id: `long:${section.id}`,
        severity: SEVERITY.INFO,
        sectionId: section.id,
        title: `"${section.title}" — ${words} מילים, חריגה מ-${quota}`,
        detail: 'כדאי לקצר לפני ההגשה.',
      });
    }

    if (GAP_MARK_RE.test(hit.text)) {
      findings.push({
        id: `gap:${section.id}`,
        severity: SEVERITY.WARN,
        sectionId: section.id,
        title: `"${section.title}" מסמן פער`,
        detail: 'המודל סימן [דרוש מקור נוסף] במקום להמציא. חפש מקור להשלמה, או מחק את הסימון אם הוויתור מודע.',
        actionable: 'more-sources',
      });
    }

    // פסקאות בלי שום הפניה. פסקה קצרה היא לרוב מעבר בין סעיפים, ומעבר לא אמור
    // לטעון טענה — ולכן גם לא חייב הפניה.
    const naked = hit.text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => countWords(p) >= 25 && !CITATION_RE.test(p) && !GAP_MARK_RE.test(p));
    if (naked.length) {
      findings.push({
        id: `uncited:${section.id}`,
        severity: SEVERITY.WARN,
        sectionId: section.id,
        title: `"${section.title}" — ${naked.length} פסקאות בלי הפניה`,
        detail: 'פסקה מהותית בלי מקור היא בדיוק מה שמרצה מסמן. בדוק אותן ידנית.',
      });
    }
  });

  const weak = (draft.bibliography || []).filter((b) => b.weak);
  if (weak.length) {
    findings.push({
      id: 'weak-sources',
      severity: SEVERITY.WARN,
      title: `${weak.length} מקורות נשמרו כתקציר בלבד`,
      detail: `לא נמשך מהם הטקסט המלא: ${weak.map((w) => w.title).join(' · ')}. ודא שמה שנכתב מהם מדויק לפני ההגשה.`,
    });
  }

  const required = Number(spec?.sourceRequirement?.count) || 0;
  const actual = (draft.bibliography || []).length;
  if (required && actual < required) {
    findings.push({
      id: 'source-count',
      severity: SEVERITY.BLOCK,
      title: `${actual} מקורות מתוך ${required} נדרשים`,
      detail: 'המטלה דורשת יותר מקורות ממה שיש בעבודה. הוסף מקורות לפני ההגשה.',
      actionable: 'more-sources',
    });
  }

  const totalQuota = Number(spec?.totalWords) || 0;
  if (totalQuota && totalWords < totalQuota * UNDER_QUOTA_RATIO) {
    findings.push({
      id: 'total-short',
      severity: SEVERITY.INFO,
      title: `סה"כ ${totalWords} מילים מתוך ${totalQuota}`,
      detail: 'ההיקף הכולל נגזר מכמות המקורות. ראה ההתראות לכל סעיף.',
    });
  }

  const order = { [SEVERITY.BLOCK]: 0, [SEVERITY.WARN]: 1, [SEVERITY.INFO]: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    findings,
    stats: {
      totalWords,
      totalQuota,
      sectionsWritten: written.size,
      sectionsBlocked: (draft.blocked || []).length,
      sources: actual,
      requiredSources: required,
    },
    // "מוכן" = אין חסם. אזהרות אינן חוסמות — ההחלטה של המשתמש.
    ready: !findings.some((f) => f.severity === SEVERITY.BLOCK),
  };
}

// ---------- מעברי הליטוש (רק לפי בחירה מפורשת) ----------

export const FINISHING_PASSES = {
  NONE: 'none',
  STYLE: 'style',
  HUMANIZE: 'humanize',
  BOTH: 'both',
};

// מעריך גס לתקציב הקריאות, כדי שה-UI יוכל לומר למשתמש כמה זה עולה *לפני* שהוא לוחץ.
export function estimatePassCalls(mode, { humanizeMaxPasses = 4 } = {}) {
  const style = (mode === FINISHING_PASSES.STYLE || mode === FINISHING_PASSES.BOTH) ? 1 : 0;
  const human = (mode === FINISHING_PASSES.HUMANIZE || mode === FINISHING_PASSES.BOTH)
    ? `0–${humanizeMaxPasses}` : 0;
  if (!style && !human) return '0';
  if (!human) return String(style);
  if (!style) return String(human);
  return `${style} + ${human}`;
}

const invokeModel = (prompt, context = '', system = '') => chatWithActiveProvider(
  String(prompt || ''), String(context || ''), String(system || ''),
  { skipAutomation: true, skipMultiModel: true, forceSuppressResearchRouting: true },
);

/**
 * מריץ את מעברי הליטוש שנבחרו על ה-HTML של העבודה.
 *
 * שני המעברים ממטבים מטרות מנוגדות (התאמה לסגנון ↔ הורדת ציון הגלאי) ואף אחד
 * לא בודק את המדד של השני. לכן ב-BOTH הסדר הוא סגנון ואז האנשה — ההאנשה היא
 * האחרונה כי היא זו שהמשתמש רואה כתוצאה הסופית. הציון הסופי של שניהם מוחזר
 * כדי שהמשתמש יראה מה קרה בפועל.
 *
 * @param {string} html
 * @param {{mode?:string, styleEngine?:object|null, profile?:object|null,
 *          humanizeTarget?:number, humanizeMaxPasses?:number,
 *          onProgress?:(stage:string, detail?:object)=>void}} opts
 * @returns {Promise<{ok:boolean, html:string, style?:object, humanize?:object, reason?:string}>}
 */
export async function applyFinishingPasses(html, {
  mode = FINISHING_PASSES.NONE,
  styleEngine = null,
  profile = null,
  humanizeTarget = 35,
  humanizeMaxPasses = 4,
  onProgress = null,
} = {}) {
  const report = (stage, detail = {}) => { try { onProgress?.(stage, detail); } catch { /* לא מפיל */ } };
  let current = String(html || '');
  if (!current.trim() || mode === FINISHING_PASSES.NONE) return { ok: true, html: current };

  // אותה ריזולוציה שעושה applyStyleJudgeToText ב-aiService — הפרופיל הוא מקור
  // האמת, ו-normalizeStyleEngine מבטיח את הצורה שהמשכתב מצפה לה.
  const resolvedProfile = profile || getPersonalStyleProfile();
  const engine = styleEngine || normalizeStyleEngine(resolvedProfile?.styleEngine);

  const result = { ok: true, html: current };
  if (!engine?.enabled && (mode === FINISHING_PASSES.STYLE || mode === FINISHING_PASSES.BOTH)) {
    // מנוע סגנון כבוי = אין ממה לשכתב. לא שגיאה, אבל חייב להיאמר.
    result.style = { skipped: 'מנוע הסגנון האישי כבוי — לא הורץ מעבר סגנון.' };
  }

  if ((mode === FINISHING_PASSES.STYLE || mode === FINISHING_PASSES.BOTH) && engine?.enabled) {
    report('style');
    try {
      // rewriteDocumentHtmlTowardStyle לא-הרסני מבנית: משכתב רק את הטקסט הפנימי
      // של הפסקאות הגרועות ביותר, ושומר את התוצאה רק אם הציון השתפר.
      const styled = await rewriteDocumentHtmlTowardStyle(current, { styleEngine: engine, invokeModel });
      if (styled?.html) current = styled.html;
      result.style = { score: styled?.score, passes: styled?.passes, improved: styled?.improved };
    } catch (err) {
      // ליטוש שנכשל לא מפיל את העבודה — מחזירים את הטקסט כמו שהוא עם סיבה.
      result.style = { error: String(err?.message || err) };
    }
  }

  if (mode === FINISHING_PASSES.HUMANIZE || mode === FINISHING_PASSES.BOTH) {
    report('humanize');
    try {
      const humanized = await runHumanizerLoop({
        text: current,
        htmlMode: true,
        profile: resolvedProfile,
        target: humanizeTarget,
        maxPasses: humanizeMaxPasses,
        invokeModel: (prompt, ctx) => invokeModel(prompt, ctx, STEALTH_HUMANIZE_GUIDE),
        onProgress: (info) => report('humanize-pass', info),
      });
      if (humanized?.text) current = humanized.text;
      result.humanize = {
        score: humanized?.score, label: humanized?.label,
        passes: humanized?.passes, hitTarget: humanized?.hitTarget,
      };
    } catch (err) {
      result.humanize = { error: String(err?.message || err) };
    }
  }

  report('done');
  return { ...result, html: current };
}
