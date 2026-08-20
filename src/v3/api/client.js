// client.js — ApiClient: הפסאדה של שכבת ה-API.
//
// chat(): קריאה אחת לספק עם retry ממושמע לפי retryPolicy + timeout + ledger.
// תקרה קשיחה: ניסיון + retry אחד לכל היותר. fallback בין ספקים הוא החלטת
// האורקסטרציה (chatRun, שלב 5) — לא של הלקוח; הלקוח רק מדווח אם מותר.
//
// בשלב 1 הפונקציות-עלה של aiService (callOpenAICompatible / callClaudeApi) מנותבות
// לכאן תחת flag `apiClient`. streaming מגיע בשלב 2.

import { buildProviderRequest, performProviderRequest } from './request';
import { getRetryDecision, wait } from './retryPolicy';
import { timeoutError } from './errors';
import { getPassiveLedger } from './ledger';
import { recordModelUsage } from '../../services/usageTelemetryService';

const DEFAULT_TIMEOUT_MS = 45000;

const withTimeout = (promise, timeoutMs, onTimeout, timeoutErr) => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer = null;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        try { onTimeout?.(); } catch {}
        reject(timeoutErr);
      }, timeoutMs);
    }),
  ]);
};

// chat({ provider, model, messages, ... }) → ChatResult
// זורק ApiError מסווג; error.allowProviderFallback אומר לאורקסטרציה אם ספק אחר רלוונטי.
export const chat = async ({
  provider,
  model,
  messages,
  baseUrl = '',
  apiKey = '',
  maxTokens = 0,
  purpose = 'chat',
  temperature = null,
  bodyExtras = null,
  tools = null,
  thinkingBudget = null,
  signal = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  extractWebResults = null,
  ledger = null,
  kind = 'chat',
} = {}) => {
  // צריכת תקציב רק דרך ledger שהוזרק מפורשות (למשל scope.ledger) — כשנקראים מתוך
  // chatWithActiveProvider הצריכה כבר נעשתה שם, וספירה כאן הייתה כפולה.
  // ה-ledger הפסיבי תמיד מקבל record() של תוצאות (לכידת usage/שגיאות).
  const recordLedger = ledger || getPassiveLedger();
  const request = buildProviderRequest({
    provider, model, messages, baseUrl, apiKey, maxTokens, purpose, temperature, bodyExtras, tools, thinkingBudget,
  });

  let attempt = 0;
  for (;;) {
    if (ledger) ledger.tryConsume({ kind, provider, model });
    const startedAt = Date.now();
    const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    // משרשר את ה-signal החיצוני אל ה-controller הפנימי של הניסיון.
    let externalAbortHandler = null;
    if (signal && abortController) {
      if (signal.aborted) abortController.abort();
      else {
        externalAbortHandler = () => abortController.abort();
        signal.addEventListener('abort', externalAbortHandler, { once: true });
      }
    }

    try {
      const result = await withTimeout(
        performProviderRequest({
          provider, model, request,
          signal: abortController?.signal || signal,
          timeoutMs,
          extractWebResults,
        }),
        timeoutMs,
        () => abortController?.abort(),
        timeoutError({ provider, model, timeoutMs }),
      );
      recordLedger.record({ kind, provider, model, usage: result.usage, durationMs: Date.now() - startedAt });
      recordModelUsage({
        provider,
        model,
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
        thinkingTokens: result.usage?.thinkingTokens,
        cachedTokens: result.usage?.cachedTokens,
        grounded: Boolean(tools),
      });
      return result;
    } catch (error) {
      recordLedger.record({ kind, provider, model, errorCode: error?.code || 'UNKNOWN', durationMs: Date.now() - startedAt });
      const decision = getRetryDecision(error, { attempt });
      if (!decision.shouldRetry) {
        error.allowProviderFallback = decision.allowProviderFallback;
        throw error;
      }
      attempt += 1;
      await wait(decision.delayMs);
    } finally {
      if (signal && externalAbortHandler) signal.removeEventListener('abort', externalAbortHandler);
    }
  }
};
