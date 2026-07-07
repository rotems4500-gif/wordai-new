// streaming.js — קריאת SSE עם read-timeout בין chunks + טיפול שגיאות מפורש.
//
// מחליף את ה-parser הישן שהיה תלוי רק ב-signal חיצוני (ספק שנתקע ⇒ הבקשה תלויה לנצח)
// ובלע שגיאות parse בשקט (chunk פגום ⇒ תשובה קטועה בלי שום סימן).
//
// streamOpenAICompatible(): fetch ישיר (סטרימינג לא עובר דרך ה-desktop proxy —
// הוא מחזיר body שלם). מחזיר ChatResult; onDelta מקבל את הטקסט המצטבר.

import { classifyProviderError, timeoutError, malformedError, abortedError } from './errors';
import { resolveMaxTokens } from './modelLimits';
import { buildChatResult } from './responseShape';

const DEFAULT_READ_TIMEOUT_MS = 30000;   // זמן מרבי בין שני chunks
const MAX_CONSECUTIVE_PARSE_ERRORS = 5;  // מעבר לזה — התשובה נחשבת פגומה

// reader.read() עם תקרת זמן — ספק שהפסיק לשדר באמצע לא תוקע את הבקשה.
const readWithTimeout = async (reader, timeoutMs, { provider, model }) => {
  let timer = null;
  try {
    return await Promise.race([
      reader.read(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          try { reader.cancel().catch(() => {}); } catch {}
          reject(timeoutError({ provider, model, timeoutMs }));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

export const streamOpenAICompatible = async ({
  provider = 'openai',
  model,
  messages,
  baseUrl,
  apiKey = '',
  maxTokens = 0,
  purpose = 'chat',
  bodyExtras = null,
  signal = null,
  onDelta = null,
  readTimeoutMs = DEFAULT_READ_TIMEOUT_MS,
} = {}) => {
  const url = `${String(baseUrl || '').replace(/\/$/, '')}/chat/completions`;
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  let res = null;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        model,
        messages,
        max_tokens: resolveMaxTokens({ model, requested: maxTokens, purpose }),
        stream: true,
        ...(bodyExtras || {}),
      }),
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw abortedError({ provider, model });
    throw classifyProviderError({ provider, model, cause: error });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw classifyProviderError({
      provider, model, status: res.status, body,
      headers: { 'retry-after': res.headers?.get?.('retry-after') || '' },
    });
  }
  if (!res.body?.getReader) {
    throw malformedError({ provider, model, detail: 'אין stream בתשובה' });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullText = '';
  let buffer = '';
  let rawFinishReason = '';
  let usage = null;
  let consecutiveParseErrors = 0;

  try {
    for (;;) {
      if (signal?.aborted) throw abortedError({ provider, model });
      const { done, value } = await readWithTimeout(reader, readTimeoutMs, { provider, model });
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, '');
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const data = JSON.parse(payload);
          consecutiveParseErrors = 0;
          const delta = data.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullText += delta;
            onDelta?.(fullText, delta);
          }
          if (data.choices?.[0]?.finish_reason) rawFinishReason = data.choices[0].finish_reason;
          if (data.usage) usage = data.usage;
        } catch (parseError) {
          consecutiveParseErrors += 1;
          if (consecutiveParseErrors >= MAX_CONSECUTIVE_PARSE_ERRORS) {
            throw malformedError({
              provider, model,
              detail: `stream פגום (${consecutiveParseErrors} שורות parse רצופות נכשלו): ${payload.slice(0, 120)}`,
              cause: parseError,
            });
          }
        }
      }
    }
  } catch (error) {
    try { reader.cancel().catch(() => {}); } catch {}
    if (error?.name === 'ApiError') throw error;
    if (error?.name === 'AbortError') throw abortedError({ provider, model });
    throw classifyProviderError({ provider, model, cause: error });
  }

  return buildChatResult({ text: fullText, provider, model, rawFinishReason, usage });
};
