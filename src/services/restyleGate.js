// ═══════════════════════════════════════════════════════════════
// restyleGate.js — שער הקבלה המשותף לשכתוב טיוטות (DOCX ו-PPTX).
// היה בתוך documentDraftService; הועבר לכאן כדי ש-pptxDraftService יריץ
// בדיוק את אותה לוגיקה ולא עותק שמתפצל בשקט.
// ═══════════════════════════════════════════════════════════════

import { scoreStyleMatchLocal } from './styleJudgeService';
import { scoreTextAuthenticity } from './styleAuthenticityService';

// אורך מינימלי (בתווים) כדי שפסקה תיחשב לשכתוב — פסקאות זעירות (כותרות
// קצרות, פריטי רשימה בני מילה-שתיים) נושאות מבנה ולא קול, ושכתובן רק מזיק.
export const MIN_RESTYLE_CHARS = 40;
// מאיזה אורך מפעילים את שער הניקוד המקומי (מתחת לזה הציון לא אמין).
export const SCORE_GATE_MIN_CHARS = 120;

// טקסט המקור לשכתוב: אם הפסקה כבר שוכתבה ע"י ה-AI — חוזרים לטקסט המקורי
// מהייבוא (ריצה חוזרת לא מצטברת על פלט קודם); עריכה ידנית של המשתמש נשמרת.
export const restyleSourceOf = (para) => (para.restyledByAi ? para.original : para.text);

// דירוג "נשמע כמו AI" פר-פסקה: ההחלטה מה חייב שכתוב היא של הגלאי, לא של המודל.
// בלי הסימון, ה-escape hatch ("אם כבר טוב — אל תיגע") גרם למודל להשאיר גם פסקאות
// גנריות לחלוטין ללא שינוי. null = הפסקה קצרה מדי לניקוד אמין.
export const scoreParaAiness = (text) => {
  try {
    const res = scoreTextAuthenticity(String(text || ''));
    return res?.ok ? { score: res.score, threshold: res.threshold } : null;
  } catch { return null; }
};

// שער קבלה פר-פסקה (במודל של styleJudgeService.rewriteDocumentHtmlTowardStyle):
// (1) רצועת אורך ~0.6×–1.6× מהמקור — פרפרזה שקיצצה/ניפחה נדחית. הרצועה מתרחבת
//     לפי עוצמת השכתוב (band): במצב אגרסיבי ניסוח מחדש מקצה לקצה משנה אורך.
// (2) פסקה שסומנה כגנרית (aiFlagged) — המדד הרלוונטי הוא הגלאי: מקבלים אם ציון
//     ה-AI לא עלה. רצפת הסגנון המבני *לא* חלה עליה — היא דחתה שכתובים לגיטימיים
//     של פסקאות גנריות (המדד המבני מעדיף לפעמים את הניסוח המכונתי החלק).
// (3) פסקה לא-מסומנת ארוכה מספיק — never-net-worse על ציון הסגנון המקומי,
//     בסובלנות styleGateDelta. delta >= 999 = הסליידר כיבה את השער לגמרי.
// כשל ניקוד בכל מקום ⇒ קבלה לפי רצועת האורך בלבד.
export const acceptRestyledPara = (source, current, next, styleEngine, aiFlagged = false, band = null) => {
  const srcLen = String(source || '').length;
  const nextLen = String(next || '').length;
  if (!nextLen) return false;
  const minRatio = band?.minLenRatio ?? 0.6;
  const maxRatio = band?.maxLenRatio ?? 1.6;
  if (srcLen >= MIN_RESTYLE_CHARS && (nextLen < srcLen * minRatio || nextLen > srcLen * maxRatio)) return false;
  if (aiFlagged) {
    const before = scoreParaAiness(current);
    const after = scoreParaAiness(next);
    if (before && after && after.score > before.score + 5) return false;
    return true;
  }
  const styleGateDelta = band?.styleGateDelta ?? 1;
  if (styleGateDelta >= 999) return true;
  if (styleEngine?.enabled && srcLen >= SCORE_GATE_MIN_CHARS) {
    try {
      const oldScore = scoreStyleMatchLocal(current, styleEngine)?.score;
      const newScore = scoreStyleMatchLocal(next, styleEngine)?.score;
      if (Number.isFinite(oldScore) && Number.isFinite(newScore) && newScore < oldScore - styleGateDelta) return false;
    } catch { /* ניקוד נכשל — שער האורך הספיק */ }
  }
  return true;
};
