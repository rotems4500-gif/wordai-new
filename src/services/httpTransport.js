// httpTransport.js — שכבת תעבורת HTTP משותפת: דסקטופ (Tauri proxy) / אתר (relay/fetch).
// חולץ מ-aiService.js כדי ש-sourceRetrieval וגם aiService ישתמשו באותו מסלול.
// ב-Node (test harness) אין window.desktopApp → נופל ל-fetch הגלובלי, או ל-fetch מוזרק.

import { shouldRelayHostViaFunction, relayHttpRequestViaFunction } from './webProxyService';

// fetch ניתן להזרקה ל-harness (Node) — ברירת מחדל: הגלובלי.
let injectedFetch = null;
export const setHttpTransportFetch = (fetchImpl) => {
  injectedFetch = typeof fetchImpl === 'function' ? fetchImpl : null;
};
const resolveFetch = () => injectedFetch || (typeof fetch !== 'undefined' ? fetch : null);

export const createProxyAbortError = () => {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
};

const createProxyRequestId = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {}
  return `proxy-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const proxyDesktopHttpRequest = async ({ url, method = 'POST', headers = {}, body, timeoutMs = 0 } = {}, signal) => {
  if (!(typeof window !== 'undefined' && window.desktopApp?.proxyHttpRequest)) {
    // אתר (ללא דסקטופ): מארחים חסומי-CORS (SerpAPI/Copyleaks) עוברים דרך ה-relay בשרת.
    // השאר (ספקי AI) מחזירים null → הקורא עושה fetch ישיר (עובד ישירות מהדפדפן).
    if (shouldRelayHostViaFunction(url)) {
      return relayHttpRequestViaFunction({ url, method, headers, body, timeoutMs }, signal);
    }
    return null;
  }

  if (signal?.aborted) throw createProxyAbortError();

  const requestId = createProxyRequestId();
  let abortHandler = null;

  try {
    if (signal && window.desktopApp?.abortProxyHttpRequest) {
      abortHandler = () => {
        Promise.resolve(window.desktopApp.abortProxyHttpRequest(requestId)).catch(() => {});
      };
      signal.addEventListener('abort', abortHandler, { once: true });
      if (signal.aborted) {
        abortHandler();
        throw createProxyAbortError();
      }
    }

    const requestPromise = window.desktopApp.proxyHttpRequest({ url, method, headers, body, requestId, timeoutMs });
    if (!signal || !window.desktopApp?.abortProxyHttpRequest) return await requestPromise;
    if (signal.aborted) {
      abortHandler?.();
      throw createProxyAbortError();
    }

    const abortPromise = new Promise((_, reject) => {
      const rejectOnAbort = () => reject(createProxyAbortError());
      signal.addEventListener('abort', rejectOnAbort, { once: true });
      requestPromise.then(
        () => signal.removeEventListener('abort', rejectOnAbort),
        () => signal.removeEventListener('abort', rejectOnAbort),
      );
    });

    return await Promise.race([requestPromise, abortPromise]);
  } finally {
    if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
  }
};

export const requestJsonOverHttp = async ({ url, method = 'GET', headers = {}, body = '', signal, timeoutMs = 0 } = {}) => {
  const desktopResult = await proxyDesktopHttpRequest({ url, method, headers, body, timeoutMs }, signal);
  if (desktopResult) {
    if (!desktopResult.ok) {
      throw new Error(`HTTP ${desktopResult.status}: ${String(desktopResult.body || '').slice(0, 300)}`);
    }
    return JSON.parse(desktopResult.body || '{}');
  }

  const fetchImpl = resolveFetch();
  if (!fetchImpl) throw new Error('אין fetch זמין בסביבה זו');
  const response = await fetchImpl(url, {
    method,
    headers,
    signal,
    ...(body ? { body } : {}),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`HTTP ${response.status}: ${String(text || '').slice(0, 300)}`);
  }
  return response.json();
};
