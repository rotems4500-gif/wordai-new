// request.js — ניסיון בקשה בודד לספק, מעל httpTransport.
//
// אחריות: בניית URL/headers/body לפי צורת הספק, שליחה דרך הצינור המשותף
// (desktop proxy / relay / fetch), סיווג כל כשל ל-ApiError, פרסור ל-ChatResult.
// בלי retry ובלי fallback — זה תפקיד client.js.

import { proxyDesktopHttpRequest } from '../../services/httpTransport';
import { classifyProviderError, malformedError, abortedError } from './errors';
import { resolveMaxTokens } from './modelLimits';
import { parseOpenAICompatiblePayload, parseClaudePayload, parseGeminiPayload } from './responseShape';

const messagesToClaudeShape = (messages = []) => {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const rest = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }));
  return { system, messages: rest.length ? rest : [{ role: 'user', content: '' }] };
};

const messagesToGeminiShape = (messages = []) => {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  return {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: contents.length ? contents : [{ role: 'user', parts: [{ text: '' }] }],
  };
};

// בונה את פרטי הבקשה לפי הספק. baseUrl נדרש רק ל-openai-compatible.
export const buildProviderRequest = ({
  provider, model, messages, baseUrl = '', apiKey = '',
  maxTokens = 0, purpose = 'chat', temperature = null, bodyExtras = null, tools = null,
  thinkingBudget = null,
}) => {
  const resolvedMax = resolveMaxTokens({ model, requested: maxTokens, purpose });
  // קריאות plan/cheap הן מכניות — חשיבה דינמית של Gemini 2.5 מחויבת במחיר output
  // ואינה תורמת שם. ברירת מחדל 0 אלא אם הוזרק תקציב מפורש. pro לא יורד מתחת ל-128 — מדלגים.
  const resolvedThinkingBudget = Number.isFinite(thinkingBudget)
    ? thinkingBudget
    : (purpose === 'plan' || purpose === 'cheap' ? 0 : null);
  // 2.5: budget:0 מכבה חשיבה; 3.x: budget נבלע — המינימום הנתמך הוא thinkingLevel:'low' (נמדד).
  const geminiThinkingConfig = Number.isFinite(resolvedThinkingBudget) && !/-pro/i.test(String(model || ''))
    ? (/^gemini-2\.5/i.test(String(model || ''))
      ? { thinkingConfig: { thinkingBudget: Math.max(0, Math.floor(resolvedThinkingBudget)) } }
      : /^gemini-3/i.test(String(model || ''))
        ? { thinkingConfig: { thinkingLevel: 'low' } }
        : null)
    : null;
  switch (provider) {
    case 'claude': {
      const { system, messages: claudeMessages } = messagesToClaudeShape(messages);
      return {
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          // מאפשר קריאה ישירה מדפדפן (אתר/PWA) — Anthropic חוסם CORS בלי זה.
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: resolvedMax,
          ...(system ? { system } : {}),
          messages: claudeMessages,
          ...(temperature !== null ? { temperature } : {}),
          ...(bodyExtras || {}),
        }),
        parse: (data, ctx) => parseClaudePayload(data, ctx),
      };
    }
    case 'gemini': {
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...messagesToGeminiShape(messages),
          generationConfig: {
            maxOutputTokens: resolvedMax,
            ...(temperature !== null ? { temperature } : {}),
            ...(geminiThinkingConfig || {}),
          },
          ...(tools ? { tools } : {}),
          ...(bodyExtras || {}),
        }),
        parse: (data, ctx) => parseGeminiPayload(data, ctx),
      };
    }
    default: {
      // openai / groq / perplexity / ollama / custom — כולם OpenAI-compatible.
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      return {
        url: `${String(baseUrl || '').replace(/\/$/, '')}/chat/completions`,
        headers,
        body: JSON.stringify({
          model,
          messages,
          max_tokens: resolvedMax,
          stream: false,
          ...(temperature !== null ? { temperature } : {}),
          ...(bodyExtras || {}),
        }),
        parse: (data, ctx) => parseOpenAICompatiblePayload(data, ctx),
      };
    }
  }
};

// ניסיון בודד: שולח, מסווג כשלים, מחזיר ChatResult.
export const performProviderRequest = async ({
  provider, model, request, signal, timeoutMs = 0, extractWebResults = null,
}) => {
  let status = 0;
  let bodyText = '';
  let responseHeaders = {};

  try {
    const desktopResult = await proxyDesktopHttpRequest(
      { url: request.url, method: 'POST', headers: request.headers, body: request.body, timeoutMs },
      signal,
    );
    if (desktopResult) {
      status = Number(desktopResult.status) || 0;
      bodyText = String(desktopResult.body || '');
      responseHeaders = desktopResult.headers || {};
      if (!desktopResult.ok) {
        throw classifyProviderError({ provider, model, status, body: bodyText, headers: responseHeaders });
      }
    } else {
      const res = await fetch(request.url, { method: 'POST', headers: request.headers, body: request.body, signal });
      status = res.status;
      bodyText = await res.text().catch(() => '');
      responseHeaders = { 'retry-after': res.headers?.get?.('retry-after') || '' };
      if (!res.ok) {
        throw classifyProviderError({ provider, model, status, body: bodyText, headers: responseHeaders });
      }
    }
  } catch (error) {
    if (error?.name === 'ApiError') throw error;
    if (error?.name === 'AbortError') throw abortedError({ provider, model });
    throw classifyProviderError({ provider, model, status, body: bodyText || error?.message, cause: error });
  }

  let data = null;
  try {
    data = JSON.parse(bodyText || '{}');
  } catch (parseError) {
    throw malformedError({ provider, model, detail: bodyText.slice(0, 200), cause: parseError });
  }
  return request.parse(data, { provider, model, extractWebResults });
};
