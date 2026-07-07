// errors.js — טקסונומיית שגיאות אחידה לכל ספקי ה-AI.
//
// היום כל כשל נזרק כ-Error עם מחרוזת עברית גנרית — אי אפשר להבדיל בין מפתח שגוי,
// rate-limit, timeout או רשת, ולכן אי אפשר להחליט retry חכם. כאן כל שגיאה מסווגת
// לקוד אחד, נושאת retryable + הודעת משתמש עברית ספציפית.

export const ErrorCodes = {
  AUTH: 'AUTH',                     // 401/403 — מפתח שגוי/נדחה
  RATE_LIMIT: 'RATE_LIMIT',         // 429
  TIMEOUT: 'TIMEOUT',               // חריגת זמן שלנו
  NETWORK: 'NETWORK',               // fetch/proxy נפל, DNS, offline
  MODEL: 'MODEL',                   // מודל לא קיים / בקשה לא תקינה (400/404/422)
  MALFORMED: 'MALFORMED',           // תשובה שלא נפרסה
  ABORTED: 'ABORTED',               // בוטל ע"י המשתמש
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED', // תקציב הקריאות של ה-run אזל
  SERVER: 'SERVER',                 // 5xx בצד הספק
};

const PROVIDER_LABELS = {
  gemini: 'Gemini', openai: 'OpenAI', claude: 'Claude', groq: 'Groq',
  ollama: 'Ollama', perplexity: 'Perplexity', custom: 'מנוע מותאם אישית', scholar: 'Google Scholar',
};

const buildUserMessageHe = ({ code, provider, status, retryAfterSeconds }) => {
  const label = PROVIDER_LABELS[provider] || provider || 'הספק';
  switch (code) {
    case ErrorCodes.AUTH:
      return `מפתח ה-API של ${label} נדחה (${status}) — בדוק את המפתח בהגדרות AI`;
    case ErrorCodes.RATE_LIMIT:
      return `${label} מגביל קצב בקשות (429)${retryAfterSeconds ? ` — ניסיון חוזר בעוד ${retryAfterSeconds} שניות` : ' — נסה שוב בעוד רגע'}`;
    case ErrorCodes.TIMEOUT:
      return `הבקשה ל-${label} חרגה מזמן ההמתנה — נסה שוב או החלף מודל`;
    case ErrorCodes.NETWORK:
      return `בעיית רשת מול ${label} — בדוק חיבור לאינטרנט`;
    case ErrorCodes.MODEL:
      return `${label} דחה את הבקשה (${status || 'בקשה לא תקינה'}) — ייתכן שהמודל שנבחר לא זמין`;
    case ErrorCodes.MALFORMED:
      return `התקבלה תשובה לא תקינה מ-${label} — נסה שוב`;
    case ErrorCodes.ABORTED:
      return 'הפעולה בוטלה';
    case ErrorCodes.BUDGET_EXCEEDED:
      return 'תקציב הקריאות של הפעולה אזל — הפעולה נעצרה כדי למנוע שריפת טוקנים';
    case ErrorCodes.SERVER:
      return `שגיאה זמנית בצד ${label} (${status}) — ננסה שוב`;
    default:
      return `שגיאה מול ${label}`;
  }
};

export class ApiError extends Error {
  constructor({ code, provider = '', model = '', status = 0, retryAfterSeconds = 0, cause = null, detail = '' }) {
    const userMessageHe = buildUserMessageHe({ code, provider, status, retryAfterSeconds });
    super(detail ? `${userMessageHe} :: ${detail}` : userMessageHe);
    this.name = 'ApiError';
    this.code = code;
    this.provider = provider;
    this.model = model;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    this.userMessageHe = userMessageHe;
    this.detail = detail;
    if (cause) this.cause = cause;
  }
}

export const isApiError = (error) => error instanceof ApiError || (error && typeof error === 'object' && typeof error.code === 'string' && error.name === 'ApiError');

const parseRetryAfterSeconds = (headers = {}) => {
  const raw = headers?.['retry-after'] ?? headers?.['Retry-After'] ?? '';
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 60) : 0;
};

// מסווג כשל HTTP/רשת לשגיאה אחידה. body נחתך ל-300 תווים ל-detail.
export const classifyProviderError = ({ provider = '', model = '', status = 0, body = '', headers = {}, cause = null } = {}) => {
  const detail = String(body || '').slice(0, 300);
  if (cause?.name === 'AbortError' || cause?.code === 'ABORT_ERR') {
    return new ApiError({ code: ErrorCodes.ABORTED, provider, model, cause });
  }
  if (status === 401 || status === 403) {
    return new ApiError({ code: ErrorCodes.AUTH, provider, model, status, detail });
  }
  if (status === 429) {
    return new ApiError({ code: ErrorCodes.RATE_LIMIT, provider, model, status, detail, retryAfterSeconds: parseRetryAfterSeconds(headers) });
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ApiError({ code: ErrorCodes.MODEL, provider, model, status, detail });
  }
  if (status >= 500) {
    return new ApiError({ code: ErrorCodes.SERVER, provider, model, status, detail });
  }
  if (status > 0) {
    // סטטוס לא צפוי אחר — מתייחסים כ-MODEL (בקשה בעייתית) כדי לא לעשות retry עיוור.
    return new ApiError({ code: ErrorCodes.MODEL, provider, model, status, detail });
  }
  // אין סטטוס — כשל תעבורה (fetch נפל / proxy לא ענה).
  return new ApiError({ code: ErrorCodes.NETWORK, provider, model, detail: detail || cause?.message || '', cause });
};

export const timeoutError = ({ provider = '', model = '', timeoutMs = 0 } = {}) =>
  new ApiError({ code: ErrorCodes.TIMEOUT, provider, model, detail: timeoutMs ? `timeout=${timeoutMs}ms` : '' });

export const malformedError = ({ provider = '', model = '', detail = '', cause = null } = {}) =>
  new ApiError({ code: ErrorCodes.MALFORMED, provider, model, detail, cause });

export const abortedError = ({ provider = '', model = '' } = {}) =>
  new ApiError({ code: ErrorCodes.ABORTED, provider, model });
