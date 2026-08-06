// ═══════════════════════════════════════════════════════════════
// draftDetectorPass.js — מעבר גלאי-AI על פסקאות טיוטה (DOCX/PPTX) אחרי
// השכתוב, ובחירת הפסקאות שעדיין נשמעות מכונתיות לסבב שכתוב נוסף.
//
// פורמט-אגנוסטי בכוונה: עובד על מערך פסקאות שטוח ({ id, text, ... }) ולכן
// אותה לוגיקה בדיוק רצה על מסמך Word ועל מצגת — בלי עותק שמתפצל בשקט.
//
// ⚠️ פסקה קצרה מ-25 מילים אינה "נקייה" — הגלאי פשוט מסרב לנקד אותה
// (ok:false, reason:'too-short'). רוב התבליטים במצגת נופלים לשם, ולכן הן
// נספרות בנפרד ומוצגות בנפרד בממשק. ספירתן כ"עברו" הייתה שקר מרגיע.
// ═══════════════════════════════════════════════════════════════

import { scoreTextAuthenticity } from './styleAuthenticityService';
import { buildRepairPrompt } from './humanizerLoopService';

// תקרת סבבי תיקון פר-פסקה. מעבר לזה המודל חוזר על עצמו וזו רק שריפת טוקנים.
export const MAX_REPAIR_PASSES = 3;
// תקרת פסקאות לריצת תיקון אחת — התיקון סדרתי (קריאה לפסקה), ובלי תקרה
// מסמך גדול הופך ללחיצה אחת של מאות קריאות מודל.
export const MAX_REPAIR_TARGETS_PER_RUN = 20;

/**
 * scoreDraftParas — מנקד את כל פסקאות הטיוטה מול הגלאי המקומי (סינכרוני, בלי API).
 * כותב על כל פסקה: lastAiScore / lastAiThreshold / aiCheckSkipped / _lastAiResult.
 * @param {Array<object>} paras
 * @returns {{ scored:number, flagged:number, skippedTooShort:number, flaggedIds:string[], avgScore:number|null }}
 */
export function scoreDraftParas(paras) {
  const list = Array.isArray(paras) ? paras : [];
  let scored = 0;
  let flagged = 0;
  let skippedTooShort = 0;
  let sum = 0;
  const flaggedIds = [];

  for (const para of list) {
    const text = String(para?.text || '').trim();
    if (!text) continue;
    let res = null;
    try { res = scoreTextAuthenticity(text); } catch { res = null; }
    if (!res || !res.ok) {
      // קצרה מדי לניקוד אמין — לא נקייה, פשוט לא נמדדה.
      para.aiCheckSkipped = res?.reason || 'too-short';
      para.lastAiScore = null;
      para.lastAiThreshold = null;
      para._lastAiResult = null;
      skippedTooShort += 1;
      continue;
    }
    para.aiCheckSkipped = null;
    para.lastAiScore = res.score;
    para.lastAiThreshold = res.threshold;
    // שומרים את התוצאה המלאה כדי ש-buildRepairPrompt יקבל את ה-markers הספציפיים
    // שנתפסו — בלעדיהם ההנחיה חוזרת לכללית וסבב התיקון מאבד את כל הערך שלו.
    para._lastAiResult = res;
    scored += 1;
    sum += res.score;
    if (res.score >= res.threshold) { flagged += 1; flaggedIds.push(para.id); }
  }

  return {
    scored,
    flagged,
    skippedTooShort,
    flaggedIds,
    avgScore: scored ? Math.round(sum / scored) : null,
  };
}

// האם הפסקה עדיין מסומנת לפי הניקוד האחרון שנשמר עליה.
const isFlaggedNow = (para) => Number.isFinite(para?.lastAiScore)
  && Number.isFinite(para?.lastAiThreshold)
  && para.lastAiScore >= para.lastAiThreshold;

/**
 * selectRepairTargets — הפסקאות שראויות לסבב תיקון נוסף.
 * רק מסומנות (לפי הניקוד האחרון) שלא מיצו את מכסת הסבבים. הכי גרועות קודם.
 * ⚠️ פסקה שירדה מתחת לסף בסבב קודם כבר לא מסומנת ⇒ לא נשכתבת שוב.
 */
export function selectRepairTargets(paras) {
  const list = Array.isArray(paras) ? paras : [];
  return list
    .filter((para) => isFlaggedNow(para) && (para.aiCheckPasses || 0) < MAX_REPAIR_PASSES)
    .sort((a, b) => (b.lastAiScore || 0) - (a.lastAiScore || 0))
    .slice(0, MAX_REPAIR_TARGETS_PER_RUN);
}

/**
 * buildParaRepairPrompt — prompt תיקון ממוקד לפסקה בודדת, מבוסס על אותו
 * builder של לולאת ההאנשה (המרקרים שנתפסו → הוראות קונקרטיות).
 */
export function buildParaRepairPrompt(para) {
  const result = para?._lastAiResult
    || (Number.isFinite(para?.lastAiScore) ? { score: para.lastAiScore, markers: [] } : null);
  return buildRepairPrompt(String(para?.text || ''), result, (para?.aiCheckPasses || 0) + 1, false);
}

// מנקד מחדש פסקה בודדת אחרי תיקון ומעדכן את שדותיה. מחזיר את התוצאה.
export function rescorePara(para) {
  let res = null;
  try { res = scoreTextAuthenticity(String(para?.text || '')); } catch { res = null; }
  if (!res || !res.ok) {
    para.aiCheckSkipped = res?.reason || 'too-short';
    para.lastAiScore = null;
    para.lastAiThreshold = null;
    para._lastAiResult = null;
    return null;
  }
  para.aiCheckSkipped = null;
  para.lastAiScore = res.score;
  para.lastAiThreshold = res.threshold;
  para._lastAiResult = res;
  return res;
}

// ניקוי פלט טקסט חופשי מהמודל: גדרות קוד ומרכאות עוטפות.
export function cleanModelText(raw = '') {
  let text = String(raw == null ? '' : raw).trim();
  const fence = text.match(/^```[a-z]*\s*([\s\S]*?)```$/i);
  if (fence) text = fence[1].trim();
  text = text.replace(/^"""\s*/, '').replace(/\s*"""$/, '').trim();
  return text;
}
