// modelCapabilities — חלון קונטקסט והערכת טוקנים לפי מודל/ספק.
//
// משלים את v3/api/modelLimits.js (שמכיר רק תקרת *פלט*): כאן חלון ה-*קלט* המלא,
// לצורך המתכנן האוטומטי (autoDepthPlanner) — האם הפרומפט + החומרים נכנסים בקריאה
// אחת או שנדרשות קריאות תמצות מקדימות.
//
// ⚠️ עדיף להמעיט: ערך גבוה מדי ⇒ קיטום שקט של הפרומפט אצל הספק (המסמך יוצא חסר
// בלי שגיאה); ערך נמוך מדי ⇒ לכל היותר קריאת תמצות מיותרת. לכן ה-fallback הוא 32k.

import { getModelMaxOutput } from '../v3/api/modelLimits';

// התאמה לפי prefix — הערך הראשון שמתאים מנצח (אותה קונבנציה כמו modelLimits).
const MODEL_CAPABILITY_TABLE = [
  { match: /^gemini/i, contextWindow: 1_000_000 },          // 2.5 + 1.5, שניהם 1M
  { match: /^gpt-4\.1/i, contextWindow: 1_000_000 },
  { match: /^gpt-4o/i, contextWindow: 128_000 },            // כולל 4o-mini
  { match: /^gpt-5/i, contextWindow: 256_000 },             // שמרני בכוונה
  { match: /^o\d/i, contextWindow: 200_000 },
  { match: /^gpt/i, contextWindow: 128_000 },
  { match: /^claude/i, contextWindow: 200_000 },            // 1M הוא beta header שאיננו שולחים
  { match: /^sonar-pro/i, contextWindow: 200_000 },
  { match: /^sonar/i, contextWindow: 128_000 },
  { match: /^mixtral-8x7b-32768/i, contextWindow: 32_768 },
  { match: /^llama-3/i, contextWindow: 128_000 },           // Groq llama-3.1/3.3
  { match: /^deepseek/i, contextWindow: 64_000 },
  { match: /^mistral-large/i, contextWindow: 128_000 },
];

const FALLBACK_CONTEXT_WINDOW = 32_000;

// תקרה ברמת ספק, אחרי התאמת המודל:
// - ollama: num_ctx בפועל הוא 2048-8192 גם כשהמודל "יודע" 128k — שליחה מעבר = קיטום שקט.
// - custom: openrouter/auto או loaded-model — אין לדעת מה מאחור.
const PROVIDER_CONTEXT_CEILING = {
  ollama: 8_192,
  custom: 32_000,
};

export function getModelContextWindow(model = '', providerId = '') {
  const entry = MODEL_CAPABILITY_TABLE.find((row) => row.match.test(String(model || '')));
  const base = entry ? entry.contextWindow : FALLBACK_CONTEXT_WINDOW;
  const ceiling = PROVIDER_CONTEXT_CEILING[String(providerId || '').trim().toLowerCase()];
  return ceiling ? Math.min(base, ceiling) : base;
}

// הערכת טוקנים לפי הרכב השפה. עברית היא byte-fallback אצל רוב הטוקנייזרים —
// ‎~2 תווים/טוקן (ג'מיני/SentencePiece נדיב יותר: ~2.5). לטינית ~4. הערכת-חסר
// מכוונת: עדיף לתכנן תמצות מיותר מאשר להציף חלון.
export function estimateTokenCount(text = '', providerId = '') {
  const value = String(text || '');
  if (!value) return 0;
  const hebrew = (value.match(/[֐-׿]/g) || []).length;
  const latin = (value.match(/[A-Za-z]/g) || []).length;
  const other = value.length - hebrew - latin;
  const hebDiv = String(providerId || '').trim().toLowerCase() === 'gemini' ? 2.5 : 2.0;
  return Math.ceil(hebrew / hebDiv + latin / 4 + other / 3);
}

// התקציב השמיש לקלט: 75% מהחלון (system prompt, פרופיל סגנון, notes, הד continuation —
// אף אחד מהם לא נמדד ע"י הקורא) פחות מה ששמור לפלט.
export function estimateContextBudget({ model = '', providerId = '' } = {}) {
  const contextWindow = getModelContextWindow(model, providerId);
  const reservedOutput = getModelMaxOutput(model);
  return Math.max(4_000, Math.floor(contextWindow * 0.75) - reservedOutput);
}
