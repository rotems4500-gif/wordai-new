// lexicalRelevance — התאמה לקסיקלית טהורה (בלי I/O, בלי window, בלי מודל).
// חולץ מ-workspaceLearningService כדי שגם המתכנן האוטומטי (autoDepthPlanner) ישתמש
// באותו ניקוד בדיוק, בלי מעגל ייבוא. הפונקציות נבדקות ב-Node —
// ר' tools/test-bench/materials-context-unit.mjs ו-auto-depth-planner-unit.mjs.

export const CONTEXT_MATCH_MIN_TERM_LENGTH = 3;

export const HEBREW_STOP_WORDS = new Set(['של', 'על', 'עם', 'זה', 'זאת', 'היא', 'הוא', 'הם', 'הן', 'אני', 'אתה', 'את', 'אנחנו', 'גם', 'אבל', 'או', 'אם', 'כי', 'כל', 'לא', 'כן', 'כך', 'מאוד', 'עוד', 'רק', 'כדי', 'היה', 'היו', 'יש', 'אין', 'אל', 'מן', 'אלו', 'אלה', 'המשתמש', 'ביקש', 'בקשה', 'החל', 'יישם', 'תיקון', 'תיקונים', 'המלצה', 'המלצות', 'הערה', 'הערות', 'מרצה', 'המרצה', 'מסמך', 'המסמך', 'עבודה', 'העבודה']);

export function extractContextMatchTerms(text = '') {
  const terms = String(text || '').toLowerCase().match(/[֐-׿a-z0-9][֐-׿a-z0-9'"׳״-]*/g) || [];
  return Array.from(new Set(
    terms
      .map((term) => term.replace(/^["'׳״-]+|["'׳״-]+$/g, ''))
      .filter((term) => term.length >= CONTEXT_MATCH_MIN_TERM_LENGTH && !HEBREW_STOP_WORDS.has(term)),
  ));
}

export function countContextTermOverlap(text = '', requestTermsSet = new Set()) {
  if (!requestTermsSet.size) return 0;
  return extractContextMatchTerms(text).reduce((count, term) => count + (requestTermsSet.has(term) ? 1 : 0), 0);
}

// כמה מונחים **מובחנים** של הבקשה מופיעים בטקסט (ולא כמה פעמים הם מופיעים).
export function countContextTermCoverage(text = '', requestTermsSet = new Set()) {
  if (!requestTermsSet.size) return 0;
  const found = new Set();
  extractContextMatchTerms(text).forEach((term) => {
    if (requestTermsSet.has(term)) found.add(term);
  });
  return found.size;
}
