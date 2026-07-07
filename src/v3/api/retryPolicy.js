// retryPolicy.js — החלטת retry לפי סוג שגיאה.
//
// מחליף את הלולאה הקיימת (עד 3 ניסיונות + שרשרת fallback בין כל הספקים = ~10 קריאות)
// בתקרה קשיחה: לכל היותר ניסיון חוזר אחד + ספק fallback אחד = 3 קריאות במקרה הגרוע.

import { ErrorCodes, isApiError } from './errors';

// policy לכל קוד: retrySameProvider (כמה פעמים), allowProviderFallback, delayMs.
const POLICIES = {
  [ErrorCodes.AUTH]: { retrySameProvider: 0, allowProviderFallback: false },
  [ErrorCodes.RATE_LIMIT]: { retrySameProvider: 1, allowProviderFallback: false, honorRetryAfter: true, maxDelayMs: 15000 },
  [ErrorCodes.TIMEOUT]: { retrySameProvider: 1, allowProviderFallback: true, delayMs: 500 },
  [ErrorCodes.NETWORK]: { retrySameProvider: 1, allowProviderFallback: true, delayMs: 800 },
  [ErrorCodes.SERVER]: { retrySameProvider: 1, allowProviderFallback: true, delayMs: 1000 },
  [ErrorCodes.MODEL]: { retrySameProvider: 0, allowProviderFallback: false },
  [ErrorCodes.MALFORMED]: { retrySameProvider: 1, allowProviderFallback: false, delayMs: 300 },
  [ErrorCodes.ABORTED]: { retrySameProvider: 0, allowProviderFallback: false },
  [ErrorCodes.BUDGET_EXCEEDED]: { retrySameProvider: 0, allowProviderFallback: false },
};

const UNKNOWN_POLICY = { retrySameProvider: 1, allowProviderFallback: true, delayMs: 800 };

export const getRetryDecision = (error, { attempt = 0 } = {}) => {
  const policy = isApiError(error) ? (POLICIES[error.code] || UNKNOWN_POLICY) : UNKNOWN_POLICY;
  const shouldRetry = attempt < policy.retrySameProvider;
  let delayMs = policy.delayMs || 0;
  if (shouldRetry && policy.honorRetryAfter && error?.retryAfterSeconds) {
    delayMs = Math.min(error.retryAfterSeconds * 1000, policy.maxDelayMs || 15000);
  }
  return {
    shouldRetry,
    delayMs,
    allowProviderFallback: !shouldRetry && Boolean(policy.allowProviderFallback),
  };
};

export const wait = (ms) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());
