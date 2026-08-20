// modelLimits.js — טבלת max_tokens לפי משפחת מודל + מטרת הקריאה.
//
// מחליף את ה-4096 הקבוע בכל הספקים: קיטוע שקט של טיוטות ארוכות מצד אחד,
// ובזבוז על קריאות plan זולות מצד שני.
//
// purposes: 'chat' (ברירת מחדל) · 'draft' (מסמך מלא — גבוה) · 'merge' (איחוד multi-model)
//           · 'plan' (גזירת תוכנית — זול וקצר) · 'cheap' (סיווג/וטינג קצר)

// התאמה לפי prefix — הערך הראשון שמתאים מנצח. maxOutput = תקרת הספק בפועל.
const MODEL_LIMIT_TABLE = [
  { match: /^gemini-3/i, maxOutput: 65536, defaults: { chat: 8192, draft: 32768, merge: 16384, plan: 1024, cheap: 512 } },
  { match: /^gemini-2\.5/i, maxOutput: 65536, defaults: { chat: 8192, draft: 32768, merge: 16384, plan: 1024, cheap: 512 } },
  { match: /^gemini/i, maxOutput: 8192, defaults: { chat: 8192, draft: 8192, merge: 8192, plan: 1024, cheap: 512 } },
  { match: /^claude-(?:opus|sonnet|fable|mythos)/i, maxOutput: 32000, defaults: { chat: 8192, draft: 24000, merge: 12000, plan: 1024, cheap: 512 } },
  { match: /^claude/i, maxOutput: 8192, defaults: { chat: 4096, draft: 8192, merge: 8192, plan: 1024, cheap: 512 } },
  { match: /^gpt-4o|^gpt-4\.1|^gpt-5|^o\d/i, maxOutput: 16384, defaults: { chat: 8192, draft: 16384, merge: 8192, plan: 1024, cheap: 512 } },
  { match: /^gpt/i, maxOutput: 4096, defaults: { chat: 4096, draft: 4096, merge: 4096, plan: 1024, cheap: 512 } },
  { match: /^sonar/i, maxOutput: 8192, defaults: { chat: 4096, draft: 8192, merge: 4096, plan: 1024, cheap: 512 } },
  { match: /^llama|^mixtral|^qwen|^deepseek/i, maxOutput: 8192, defaults: { chat: 4096, draft: 8192, merge: 4096, plan: 1024, cheap: 512 } },
];

const FALLBACK_LIMIT = { maxOutput: 4096, defaults: { chat: 4096, draft: 4096, merge: 4096, plan: 1024, cheap: 512 } };

const findLimit = (model = '') => MODEL_LIMIT_TABLE.find((entry) => entry.match.test(String(model || ''))) || FALLBACK_LIMIT;

// requested (אם ניתן) גובר, אבל תמיד נחתך לתקרת המודל.
export const resolveMaxTokens = ({ model = '', requested = 0, purpose = 'chat' } = {}) => {
  const limit = findLimit(model);
  const safePurpose = limit.defaults[purpose] ? purpose : 'chat';
  const base = Number(requested) > 0 ? Number(requested) : limit.defaults[safePurpose];
  return Math.max(256, Math.min(base, limit.maxOutput));
};

export const getModelMaxOutput = (model = '') => findLimit(model).maxOutput;
