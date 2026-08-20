// מונה שימוש/עלות מקומי — סופר טוקנים וקריאות פר חודש, כולל טוקני חשיבה (thinking)
// וקריאות מעוגנות-חיפוש (grounding, מחויבות בנפרד ~$35/1000). בלי המודול הזה החשבון
// החודשי בלתי-ניתן להסבר: נתיב ה-SDK של Gemini לא קרא usageMetadata בכלל, וה-ledger של
// v3 ספר candidatesTokenCount בלי thoughtsTokenCount — דיווח חסר שיטתי של ה-output המחויב.
// אפס תלות ב-aiService (נצרך גם מ-v3/api) ואפס DOM — בטוח ל-harness של Node.

const STORAGE_KEY = 'wordai_usage_telemetry_v1';
const MAX_MONTHS = 13;

const hasLocalStorage = () => {
  try {
    return typeof localStorage !== 'undefined' && !!localStorage;
  } catch {
    return false;
  }
};

const emptyBucket = () => ({
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
  cachedTokens: 0,
  groundedCalls: 0,
});

const readStore = () => {
  if (!hasLocalStorage()) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeStore = (store) => {
  if (!hasLocalStorage()) return;
  try {
    const months = Object.keys(store).sort();
    while (months.length > MAX_MONTHS) {
      delete store[months.shift()];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // quota/סביבת Node — מדידה היא best-effort, לעולם לא מפילה קריאת מודל.
  }
};

export const currentUsageMonth = () => new Date().toISOString().slice(0, 7);

const toCount = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Math.floor(Number(value)) : 0);

/**
 * רישום קריאה אחת. מקבל או usageMetadata גולמי של Gemini, או שדות טוקנים מפורשים
 * (נתיב v3 / claude). outputTokens כאן = פלט נראה; thinking נספר בנפרד ומצטרף לחיוב.
 */
export const recordModelUsage = ({
  provider = '',
  model = '',
  usageMetadata = null,
  inputTokens = 0,
  outputTokens = 0,
  thinkingTokens = 0,
  cachedTokens = 0,
  grounded = false,
} = {}) => {
  try {
    const input = toCount(usageMetadata ? usageMetadata.promptTokenCount : inputTokens);
    const output = toCount(usageMetadata ? usageMetadata.candidatesTokenCount : outputTokens);
    const thinking = toCount(usageMetadata ? usageMetadata.thoughtsTokenCount : thinkingTokens);
    const cached = toCount(usageMetadata ? usageMetadata.cachedContentTokenCount : cachedTokens);
    const store = readStore();
    const month = currentUsageMonth();
    const bucket = store[month] && typeof store[month] === 'object' ? store[month] : { total: emptyBucket(), byModel: {} };
    bucket.total = { ...emptyBucket(), ...(bucket.total || {}) };
    bucket.byModel = bucket.byModel && typeof bucket.byModel === 'object' ? bucket.byModel : {};
    const modelKey = `${String(provider || 'unknown')}/${String(model || 'unknown')}`;
    const modelBucket = { ...emptyBucket(), ...(bucket.byModel[modelKey] || {}) };
    for (const target of [bucket.total, modelBucket]) {
      target.calls += 1;
      target.inputTokens += input;
      target.outputTokens += output;
      target.thinkingTokens += thinking;
      target.cachedTokens += cached;
      if (grounded) target.groundedCalls += 1;
    }
    bucket.byModel[modelKey] = modelBucket;
    store[month] = bucket;
    writeStore(store);
  } catch {
    // רישום לעולם לא מפריע לזרימה.
  }
};

export const getUsageSummary = (month = currentUsageMonth()) => {
  const store = readStore();
  const bucket = store[month];
  if (!bucket || typeof bucket !== 'object') return { month, total: emptyBucket(), byModel: {} };
  return {
    month,
    total: { ...emptyBucket(), ...(bucket.total || {}) },
    byModel: Object.fromEntries(
      Object.entries(bucket.byModel || {}).map(([key, value]) => [key, { ...emptyBucket(), ...(value || {}) }]),
    ),
  };
};

export const getUsageMonths = () => Object.keys(readStore()).sort().reverse();

export const resetUsageTelemetry = (month = '') => {
  if (!hasLocalStorage()) return;
  if (!month) {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
    return;
  }
  const store = readStore();
  delete store[month];
  writeStore(store);
};
