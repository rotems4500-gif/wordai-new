// autoDepthPlanner — המתכנן הדטרמיניסטי של מצב "אוטומטי" (עומק עבודה).
//
// פונקציה טהורה: בלי I/O, בלי window, בלי קריאת מודל — כדי שאפשר לבדוק אותה ב-Node
// (tools/test-bench/auto-depth-planner-unit.mjs) על אפס קריאות API.
//
// שתי החלטות נפרדות:
// 1. mode — האם הכול נכנס בקריאה אחת ('single-call', הנתיב של היום ללא שינוי) או
//    שנדרשות קריאות תמצות מקדימות לחומרים ('brief-then-write').
// 2. resolvedStyleDepth — איזה ליטוש-סגנון מגיע למשימה ('fast'|'normal'|'deep'),
//    לפי היקף הבקשה והחומרים. ערכי הסף מיוצאים כדי שה-harness יוכל לסרוק אותם.

import { estimateTokenCount, estimateContextBudget } from './modelCapabilities';
import { extractContextMatchTerms, countContextTermCoverage } from './lexicalRelevance';

// עלות קבועה שלא נמדדת כאן: template guide, notes סגנון, הוראות מבנה.
export const AUTO_PLAN_FIXED_OVERHEAD_TOKENS = 1500;

// חלוקת תקציב במצב brief-then-write: כמה מהתקציב מוקדש לטקסט גולמי inline,
// כמה לתמציות+קטעים נבחרים, והשאר מרווח ביטחון.
export const AUTO_PLAN_INLINE_BUDGET_RATIO = 0.55;
export const AUTO_PLAN_EXCERPT_BUDGET_RATIO = 0.25;

// גודל קטע לבחירת excerpts מחומר שנשלח לתמצות (חיתוך בגבולות פסקה).
export const AUTO_PLAN_CHUNK_CHARS = 1200;

// ניקוד עומק: מטלה אמיתית (הנחיות ארוכות + מכסות אקדמיות + הרבה חומר) ⇒ deep;
// נושא בשורה אחת בלי חומרים ⇒ fast (קריאה אחת, מינימום עלות).
export const DEEP_SCORE_THRESHOLDS = { deep: 5, normal: 2 };
export const DEEP_SCORE_WEIGHTS = {
  anyMaterials: 2,       // צירוף חומרים = משימת עבודה אמיתית, לא שאלה חטופה ⇒ לפחות normal
  manyMaterials: 2,      // ≥4 חומרים
  heavyMaterials: 2,     // >30k טוקנים של חומר
  longBrief: 2,          // >250 מילים בבקשה
  mediumBrief: 1,        // >80 מילים
  hasBaseDraft: 1,
  reviewRounds: 1,
  academicQuota: 2,      // מכסות/ביבליוגרפיה מפורשות
};

const ACADEMIC_QUOTA_PATTERN = /\d+\s*(מקורות|עמודים|מילים)|ביבליוגרפ|סקירת ספרות/;

const countWords = (text = '') => (String(text || '').trim().match(/\S+/g) || []).length;

// חיתוך טקסט לקטעים בגבולות פסקה (ואם אין — בגבולות משפט/רווח).
function splitToChunks(text = '', chunkChars = AUTO_PLAN_CHUNK_CHARS) {
  const clean = String(text || '');
  if (!clean) return [];
  const paragraphs = clean.split(/\n{2,}/);
  const chunks = [];
  let current = '';
  for (const para of paragraphs) {
    if ((current.length + para.length) <= chunkChars) {
      current = current ? `${current}\n\n${para}` : para;
      continue;
    }
    if (current) chunks.push(current);
    if (para.length <= chunkChars) {
      current = para;
    } else {
      for (let i = 0; i < para.length; i += chunkChars) chunks.push(para.slice(i, i + chunkChars));
      current = '';
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// הקטעים הרלוונטיים ביותר מתוך חומר, לפי כיסוי מונחי הבקשה — עד charBudget תווים.
export function selectRelevantExcerpts(text = '', requestTermsSet = new Set(), charBudget = 0) {
  if (!charBudget) return '';
  const chunks = splitToChunks(text);
  const scored = chunks.map((chunk, index) => ({
    chunk,
    index,
    score: countContextTermCoverage(chunk, requestTermsSet),
  }));
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  const picked = [];
  let used = 0;
  for (const item of scored) {
    if (!item.score) break; // קטעים בלי שום התאמה לא נכנסים — עדיף תמצית
    if (used + item.chunk.length > charBudget) {
      // הקטע הרלוונטי היחיד גדול מהתקציב — עדיף חתיכה ממנו מאשר כלום.
      if (!picked.length) {
        picked.push({ ...item, chunk: item.chunk.slice(0, charBudget) });
        used = charBudget;
      }
      continue;
    }
    picked.push(item);
    used += item.chunk.length;
  }
  // סדר מקורי — קטעים עוקבים נקראים טבעי יותר מקטעים ממוינים לפי ציון.
  picked.sort((a, b) => a.index - b.index);
  return picked.map((item) => item.chunk).join('\n[...]\n');
}

export function planAutoDepth({
  promptText = '',
  instructionsText = '',
  materials = [],            // [{ id, title, label, text }]
  model = '',
  providerId = '',
  hasBaseDraft = false,
  additionalReviewRounds = 0,
} = {}) {
  const requestText = [promptText, instructionsText].filter(Boolean).join('\n');
  const safeMaterials = (Array.isArray(materials) ? materials : []).map((item, index) => ({
    id: item?.id || `material-${index + 1}`,
    title: item?.title || `חומר ${index + 1}`,
    label: item?.label || '',
    text: String(item?.text || ''),
  }));

  const requestTokens = estimateTokenCount(requestText, providerId);
  const materialTokens = safeMaterials.reduce((sum, m) => sum + estimateTokenCount(m.text, providerId), 0);
  const totalTokens = requestTokens + materialTokens + AUTO_PLAN_FIXED_OVERHEAD_TOKENS;
  const contextBudget = estimateContextBudget({ model, providerId });

  // --- החלטת tier (בלתי תלויה ב-mode) ---
  const words = countWords(requestText);
  const w = DEEP_SCORE_WEIGHTS;
  const deepScore =
    (safeMaterials.length >= 1 ? w.anyMaterials : 0)
    + (safeMaterials.length >= 4 ? w.manyMaterials : 0)
    + (materialTokens > 30_000 ? w.heavyMaterials : 0)
    + (words > 250 ? w.longBrief : 0)
    + (words > 80 ? w.mediumBrief : 0)
    + (hasBaseDraft ? w.hasBaseDraft : 0)
    + (Number(additionalReviewRounds) > 0 ? w.reviewRounds : 0)
    + (ACADEMIC_QUOTA_PATTERN.test(requestText) ? w.academicQuota : 0);
  const resolvedStyleDepth = deepScore >= DEEP_SCORE_THRESHOLDS.deep
    ? 'deep'
    : (deepScore >= DEEP_SCORE_THRESHOLDS.normal ? 'normal' : 'fast');

  // --- החלטת mode ---
  if (totalTokens <= contextBudget || !safeMaterials.length) {
    return {
      mode: 'single-call',
      resolvedStyleDepth,
      materialPlan: safeMaterials.map((m) => ({ id: m.id, action: 'inline', charBudget: m.text.length })),
      estimatedPromptTokens: totalTokens,
      contextBudget,
      deepScore,
      reason: safeMaterials.length
        ? `הכול נכנס בקריאה אחת (~${Math.round(totalTokens / 1000)}k מתוך ~${Math.round(contextBudget / 1000)}k טוקנים) · ליטוש ${resolvedStyleDepth}`
        : `בלי חומרים — קריאה אחת · ליטוש ${resolvedStyleDepth}`,
    };
  }

  // brief-then-write: ממיינים לפי רלוונטיות לקסיקלית לבקשה, מכניסים inline עד
  // התקציב, והשאר מקבלים קריאת תמצות + קטעים נבחרים.
  const requestTermsSet = new Set(extractContextMatchTerms(requestText));
  const ranked = safeMaterials
    .map((m) => ({
      ...m,
      score: countContextTermCoverage(m.text.slice(0, 20_000), requestTermsSet)
        + countContextTermCoverage(m.title, requestTermsSet) * 2,
    }))
    .sort((a, b) => b.score - a.score);

  const providerCharsPerToken = String(providerId || '').toLowerCase() === 'gemini' ? 2.5 : 2.0;
  const inlineBudgetChars = Math.floor(contextBudget * AUTO_PLAN_INLINE_BUDGET_RATIO * providerCharsPerToken);
  const excerptBudgetChars = Math.floor(contextBudget * AUTO_PLAN_EXCERPT_BUDGET_RATIO * providerCharsPerToken);

  let inlineUsed = 0;
  const briefCount = { value: 0 };
  const materialPlan = ranked.map((m) => {
    if (inlineUsed + m.text.length <= inlineBudgetChars) {
      inlineUsed += m.text.length;
      return { id: m.id, title: m.title, action: 'inline', charBudget: m.text.length };
    }
    briefCount.value += 1;
    return { id: m.id, title: m.title, action: 'brief', charBudget: 0 };
  });
  // תקציב ה-excerpts מתחלק שווה בין החומרים שנשלחים לתמצות.
  const perBriefExcerptChars = briefCount.value
    ? Math.floor(excerptBudgetChars / briefCount.value)
    : 0;
  materialPlan.forEach((entry) => {
    if (entry.action === 'brief') entry.charBudget = perBriefExcerptChars;
  });

  return {
    mode: 'brief-then-write',
    resolvedStyleDepth,
    materialPlan,
    estimatedPromptTokens: totalTokens,
    contextBudget,
    deepScore,
    requestTermsSet,
    reason: `החומרים גדולים מחלון המודל (~${Math.round(totalTokens / 1000)}k מול ~${Math.round(contextBudget / 1000)}k) — ${briefCount.value} מתוך ${safeMaterials.length} חומרים יתומצתו לפני הכתיבה · ליטוש ${resolvedStyleDepth}`,
  };
}

export function describeAutoPlan(plan = null) {
  if (!plan) return '';
  return String(plan.reason || '');
}
