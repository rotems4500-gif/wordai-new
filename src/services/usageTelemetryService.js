// מונה שימוש/עלות מקומי — סופר טוקנים וקריאות פר חודש, כולל טוקני חשיבה (thinking)
// וקריאות מעוגנות-חיפוש (grounding, מחויבות בנפרד ~$35/1000). בלי המודול הזה החשבון
// החודשי בלתי-ניתן להסבר: נתיב ה-SDK של Gemini לא קרא usageMetadata בכלל, וה-ledger של
// v3 ספר candidatesTokenCount בלי thoughtsTokenCount — דיווח חסר שיטתי של ה-output המחויב.
// אפס תלות ב-aiService (נצרך גם מ-v3/api) ואפס DOM — בטוח ל-harness של Node.

import { estimateBucketCostUSD, resolveGroundingTier, GROUNDING_TIERS, USD_TO_ILS_APPROX } from './modelPricing.data';

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
    // בדיקת ספי מכסה/תקציב אחרי כל קריאה — משדרת אירוע פעם אחת לסף בחודש.
    // ⚠️ אסור לתת לחישוב ההתראה להפיל רישום שימוש; לכן try נפרד.
    try { evaluateUsageAlerts(); } catch { /* noop */ }
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

// ═══════════════════════════════════════════════════════════════
// עלות מצטברת + התראות מכסה
// ═══════════════════════════════════════════════════════════════

const LIMITS_KEY = 'wordai_usage_limits_v1';
const ALERTS_FIRED_KEY = 'wordai_usage_alerts_fired_v1';
export const USAGE_ALERT_EVENT = 'wordai-usage-alert';

export const DEFAULT_USAGE_LIMITS = {
  enabled: true,
  monthlyBudgetIls: 0,   // 0 = בלי תקציב; רק מכסת ה-grounding החינמית תנוטר
  warnAtPercent: 80,
};

export const getUsageLimits = () => {
  if (!hasLocalStorage()) return { ...DEFAULT_USAGE_LIMITS };
  try {
    const parsed = JSON.parse(localStorage.getItem(LIMITS_KEY) || '{}');
    return {
      ...DEFAULT_USAGE_LIMITS,
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
    };
  } catch {
    return { ...DEFAULT_USAGE_LIMITS };
  }
};

export const setUsageLimits = (patch = {}) => {
  const next = { ...getUsageLimits(), ...(patch || {}) };
  next.monthlyBudgetIls = Math.max(0, Number(next.monthlyBudgetIls) || 0);
  next.warnAtPercent = Math.min(99, Math.max(20, Number(next.warnAtPercent) || 80));
  next.enabled = next.enabled !== false;
  try { localStorage.setItem(LIMITS_KEY, JSON.stringify(next)); } catch { /* noop */ }
  return next;
};

/**
 * getUsageCostBreakdown — פילוח עלות מלא לחודש: פר מודל, פר ספק, וסך הכול.
 * מכסת ה-grounding החינמית של Gemini 3.x (5,000/חודש) משותפת לכל מודלי 3.x —
 * מוקצית כאן פעם אחת על פני כל הרשומות ולא פר-מודל.
 */
export const getUsageCostBreakdown = (month = currentUsageMonth()) => {
  const summary = getUsageSummary(month);
  const entries = Object.entries(summary.byModel || {}).map(([key, bucket]) => {
    const [provider, ...rest] = String(key).split('/');
    return { key, provider, model: rest.join('/'), bucket };
  });
  // הקצאת המכסה החינמית: הבריכה של 3.x, לפי סדר יורד של קריאות מעוגנות.
  const freePool = new Map();
  for (const item of entries) {
    const tier = resolveGroundingTier(item.model);
    if (tier.freePerMonth > 0) freePool.set(tier.label, tier.freePerMonth);
  }
  const sorted = [...entries].sort((a, b) => (Number(b.bucket.groundedCalls) || 0) - (Number(a.bucket.groundedCalls) || 0));
  const costByKey = new Map();
  let freeGroundedUsed = 0;
  for (const item of sorted) {
    const tier = resolveGroundingTier(item.model);
    const available = freePool.has(tier.label) ? freePool.get(tier.label) : 0;
    const grounded = Number(item.bucket.groundedCalls) || 0;
    const consumed = Math.min(available, grounded);
    if (freePool.has(tier.label)) freePool.set(tier.label, available - consumed);
    freeGroundedUsed += consumed;
    costByKey.set(item.key, estimateBucketCostUSD(item.provider, item.model, item.bucket, consumed));
  }

  const models = entries.map((item) => {
    const cost = costByKey.get(item.key) || { totalUsd: 0, tokensUsd: 0, groundingUsd: 0, rate: { estimated: true, local: false }, tier: null };
    return { ...item, ...cost };
  }).sort((a, b) => b.totalUsd - a.totalUsd);

  const byProvider = {};
  for (const item of models) {
    const acc = byProvider[item.provider] || { provider: item.provider, totalUsd: 0, calls: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0, groundedCalls: 0, estimated: false, local: true };
    acc.totalUsd += item.totalUsd;
    acc.calls += Number(item.bucket.calls) || 0;
    acc.inputTokens += Number(item.bucket.inputTokens) || 0;
    acc.outputTokens += Number(item.bucket.outputTokens) || 0;
    acc.thinkingTokens += Number(item.bucket.thinkingTokens) || 0;
    acc.groundedCalls += Number(item.bucket.groundedCalls) || 0;
    if (item.rate?.estimated) acc.estimated = true;
    if (!item.rate?.local) acc.local = false;
    byProvider[item.provider] = acc;
  }

  const totalUsd = models.reduce((sum, item) => sum + item.totalUsd, 0);
  const groundingFreeLimit = GROUNDING_TIERS.reduce((max, tier) => Math.max(max, tier.freePerMonth || 0), 0);
  return {
    month,
    total: summary.total,
    models,
    providers: Object.values(byProvider).sort((a, b) => b.totalUsd - a.totalUsd),
    totalUsd,
    totalIls: totalUsd * USD_TO_ILS_APPROX,
    hasEstimatedRates: models.some((item) => item.rate?.estimated),
    grounding: {
      used: Number(summary.total.groundedCalls) || 0,
      freeUsed: freeGroundedUsed,
      freeLimit: groundingFreeLimit,
      freeRemaining: Math.max(0, groundingFreeLimit - freeGroundedUsed),
    },
  };
};

const readFiredAlerts = () => {
  if (!hasLocalStorage()) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(ALERTS_FIRED_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

/**
 * evaluateUsageAlerts — בודק חצייה של ספי מכסה/תקציב ומשדר אירוע פעם אחת לסף בחודש.
 * ⚠️ המדידה היא של הקריאות שהאפליקציה עצמה שלחה — שימוש באותו מפתח מאפליקציה
 * אחרת לא נספר, ולכן זו התראה מקדימה ולא תחליף לחשבון של Google.
 */
export const evaluateUsageAlerts = ({ force = false } = {}) => {
  const limits = getUsageLimits();
  if (!limits.enabled) return null;
  const month = currentUsageMonth();
  const breakdown = getUsageCostBreakdown(month);
  const fired = readFiredAlerts();
  const monthFired = fired[month] && typeof fired[month] === 'object' ? fired[month] : {};
  const warnAt = Math.max(20, Math.min(99, Number(limits.warnAtPercent) || 80)) / 100;
  const candidates = [];

  const freeLimit = breakdown.grounding.freeLimit;
  if (freeLimit > 0) {
    const ratio = breakdown.grounding.freeUsed / freeLimit;
    if (ratio >= 1) {
      candidates.push({
        id: 'grounding-exhausted',
        level: 'error',
        message: `מכסת החיפושים החינמית החודשית (${freeLimit.toLocaleString('he-IL')}) נוצלה — מכאן כל חיפוש ברשת מחויב. אפשר לכבות חיפוש בחלונית ה-AI.`,
      });
    } else if (ratio >= warnAt) {
      candidates.push({
        id: 'grounding-warn',
        level: 'warning',
        message: `ניצלת ${Math.round(ratio * 100)}% ממכסת החיפושים החינמית החודשית (${breakdown.grounding.freeUsed.toLocaleString('he-IL')} מתוך ${freeLimit.toLocaleString('he-IL')}).`,
      });
    }
  }

  const budget = Number(limits.monthlyBudgetIls) || 0;
  if (budget > 0) {
    const ratio = breakdown.totalIls / budget;
    if (ratio >= 1) {
      candidates.push({
        id: 'budget-exceeded',
        level: 'error',
        message: `חצית את התקציב החודשי שהגדרת: ₪${breakdown.totalIls.toFixed(2)} מתוך ₪${budget.toFixed(0)}.`,
      });
    } else if (ratio >= warnAt) {
      candidates.push({
        id: 'budget-warn',
        level: 'warning',
        message: `הגעת ל-${Math.round(ratio * 100)}% מהתקציב החודשי: ₪${breakdown.totalIls.toFixed(2)} מתוך ₪${budget.toFixed(0)}.`,
      });
    }
  }

  const pending = candidates.filter((item) => force || !monthFired[item.id]);
  if (!pending.length) return null;
  for (const item of pending) monthFired[item.id] = Date.now();
  try {
    localStorage.setItem(ALERTS_FIRED_KEY, JSON.stringify({ [month]: monthFired }));
  } catch { /* noop */ }
  const payload = { month, alerts: pending, breakdown };
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(USAGE_ALERT_EVENT, { detail: payload }));
    }
  } catch { /* noop */ }
  return payload;
};

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
