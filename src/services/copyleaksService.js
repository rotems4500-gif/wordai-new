export const COPYLEAKS_LOGIN_URL = 'https://id.copyleaks.com/v3/account/login/api';
export const COPYLEAKS_WRITER_DETECTOR_BASE_URL = 'https://api.copyleaks.com/v2/writer-detector';
export const COPYLEAKS_TEXT_MIN_CHARS = 255;
export const COPYLEAKS_TEXT_MAX_CHARS = 25000;
export const COPYLEAKS_TOKEN_TTL_MS = 47 * 60 * 60 * 1000;
export const COPYLEAKS_CLASSIFICATION_HUMAN = 1;
export const COPYLEAKS_CLASSIFICATION_AI = 2;

export const DEFAULT_COPYLEAKS_CONFIG = {
  email: '',
  key: '',
  sensitivity: 2,
  explain: false,
  sandbox: false,
  language: '',
  scanIdPrefix: 'wordflow',
};

export const COPYLEAKS_HELP_LINES = [
  'Copyleaks בודק טקסט קיים ומעריך אם הוא נראה אנושי או נראה כתוכן שנוצר בעזרת AI. הוא לא כותב טקסט.',
  'כדי להתחיל צריך שני פרטים: האימייל של חשבון Copyleaks והמפתח הסודי של החשבון.',
  'אפשר לבדוק חיבור כדי לוודא שהפרטים נכונים, ומומלץ לעשות זאת לפני הפעם הראשונה.',
  'אפשר להפעיל מצב הדגמה כדי לוודא שהחיבור עובד עם תוצאות הדגמה.',
  'אפשר להפעיל פירוט נוסף כדי לקבל הסבר מפורט יותר למה הטקסט סומן.',
  `אפשר להשאיר את השפה ריקה לזיהוי אוטומטי. בכל בדיקה אפשר לשלוח ${COPYLEAKS_TEXT_MIN_CHARS}-${COPYLEAKS_TEXT_MAX_CHARS} תווים.`,
];

const copyleaksTokenCache = new Map();

const createAbortError = (message = 'The operation was aborted.') => {
  if (typeof DOMException !== 'undefined') {
    return new DOMException(message, 'AbortError');
  }
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
};

const createRequestId = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {}
  return `copyleaks-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const simpleHash = (value = '') => {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
};

const normalizeLanguage = (value = '') => String(value || '').trim();
const normalizeUpdatedAt = (value = 0) => {
  const numeric = Number.parseInt(value, 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

export const normalizeCopyleaksConfig = (config = {}) => {
  const merged = {
    ...DEFAULT_COPYLEAKS_CONFIG,
    ...(config || {}),
  };

  return {
    email: String(merged.email || '').trim(),
    key: String(merged.key || '').trim(),
    sensitivity: clamp(Number.parseInt(merged.sensitivity, 10) || DEFAULT_COPYLEAKS_CONFIG.sensitivity, 1, 3),
    explain: toBoolean(merged.explain, DEFAULT_COPYLEAKS_CONFIG.explain),
    sandbox: toBoolean(merged.sandbox, DEFAULT_COPYLEAKS_CONFIG.sandbox),
    language: normalizeLanguage(merged.language),
    scanIdPrefix: String(merged.scanIdPrefix || DEFAULT_COPYLEAKS_CONFIG.scanIdPrefix || 'wordflow')
      .trim()
      .replace(/[^a-zA-Z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      || DEFAULT_COPYLEAKS_CONFIG.scanIdPrefix,
    updatedAt: normalizeUpdatedAt(merged.updatedAt),
  };
};

export const normalizeCopyleaksText = (text = '') => String(text || '').replace(/\r\n?/g, '\n').trim();

export const getCopyleaksTextStats = (text = '') => {
  const normalizedText = normalizeCopyleaksText(text);
  const length = normalizedText.length;
  return {
    normalizedText,
    length,
    isTooShort: length > 0 && length < COPYLEAKS_TEXT_MIN_CHARS,
    isTooLong: length > COPYLEAKS_TEXT_MAX_CHARS,
    isValid: length >= COPYLEAKS_TEXT_MIN_CHARS && length <= COPYLEAKS_TEXT_MAX_CHARS,
  };
};

export const getCopyleaksValidationMessage = (text = '') => {
  const stats = getCopyleaksTextStats(text);
  if (!stats.length) return `הדביקו כאן טקסט לבדיקה באורך ${COPYLEAKS_TEXT_MIN_CHARS}-${COPYLEAKS_TEXT_MAX_CHARS} תווים.`;
  if (stats.isTooShort) return `הטקסט קצר מדי לבדיקה. צריך לפחות ${COPYLEAKS_TEXT_MIN_CHARS} תווים.`;
  if (stats.isTooLong) return `הטקסט ארוך מדי לבדיקה אחת. אפשר לשלוח עד ${COPYLEAKS_TEXT_MAX_CHARS} תווים.`;
  return '';
};

const buildCredentialCacheKey = (email = '', key = '') => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const fingerprint = simpleHash(`${normalizedEmail}\n${String(key || '').trim()}`);
  return `copyleaks:${normalizedEmail}:${fingerprint}`;
};

const getCachedToken = (cacheKey = '') => {
  const cached = copyleaksTokenCache.get(cacheKey);
  if (!cached) return '';
  if (cached.expiresAt <= Date.now()) {
    copyleaksTokenCache.delete(cacheKey);
    return '';
  }
  return String(cached.token || '').trim();
};

const setCachedToken = (cacheKey = '', token = '') => {
  if (!cacheKey || !token) return token;
  copyleaksTokenCache.set(cacheKey, {
    token,
    expiresAt: Date.now() + COPYLEAKS_TOKEN_TTL_MS,
  });
  return token;
};

export const clearCopyleaksTokenCache = (config = {}) => {
  const normalized = normalizeCopyleaksConfig(config);
  if (normalized.email && normalized.key) {
    copyleaksTokenCache.delete(buildCredentialCacheKey(normalized.email, normalized.key));
    return;
  }
  copyleaksTokenCache.clear();
};

const safeJsonParse = (raw = '') => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const normalizeErrorTextCandidate = (value) => {
  if (value == null) return '';
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed === '[object Object]') return '';
  return trimmed;
};

const extractNestedErrorText = (value, depth = 0) => {
  if (depth > 4 || value == null) return '';

  const directText = normalizeErrorTextCandidate(value);
  if (directText) return directText;

  if (Array.isArray(value)) {
    for (const item of value) {
      const nestedText = extractNestedErrorText(item, depth + 1);
      if (nestedText) return nestedText;
    }
    return '';
  }

  if (typeof value !== 'object') return '';

  const prioritizedCandidates = [
    value.message,
    value.error,
    value.description,
    value.title,
    value.reason,
    value.details,
    value?.data?.message,
    value?.data?.error,
    value?.data?.description,
  ];

  for (const candidate of prioritizedCandidates) {
    const nestedText = extractNestedErrorText(candidate, depth + 1);
    if (nestedText) return nestedText;
  }

  for (const nestedValue of Object.values(value)) {
    const nestedText = extractNestedErrorText(nestedValue, depth + 1);
    if (nestedText) return nestedText;
  }

  return '';
};

const extractErrorMessage = (payload, status = 0, fallback = 'Copyleaks החזיר שגיאה לא צפויה.') => {
  const payloadMessage = extractNestedErrorText(payload);
  if (payloadMessage) return payloadMessage;

  if (!payload || typeof payload !== 'object') {
    if (status === 401 || status === 403) return 'ההזדהות ל-Copyleaks נכשלה. בדוק את האימייל והמפתח הסודי.';
    return fallback;
  }

  if (status === 401 || status === 403) return 'ההזדהות ל-Copyleaks נכשלה. בדוק את האימייל והמפתח הסודי.';
  return fallback;
};

const proxyDesktopHttpRequest = async ({ url, method = 'POST', headers = {}, body, timeoutMs = 0 } = {}, signal) => {
  if (!(typeof window !== 'undefined' && window.desktopApp?.proxyHttpRequest)) return null;
  if (signal?.aborted) throw createAbortError();

  const requestId = createRequestId();
  let abortHandler = null;

  try {
    if (signal && window.desktopApp?.abortProxyHttpRequest) {
      abortHandler = () => {
        Promise.resolve(window.desktopApp.abortProxyHttpRequest(requestId)).catch(() => {});
      };
      signal.addEventListener('abort', abortHandler, { once: true });
      if (signal.aborted) {
        abortHandler();
        throw createAbortError();
      }
    }

    const requestPromise = window.desktopApp.proxyHttpRequest({ url, method, headers, body, requestId, timeoutMs });
    if (!signal || !window.desktopApp?.abortProxyHttpRequest) return await requestPromise;
    if (signal.aborted) {
      abortHandler?.();
      throw createAbortError();
    }

    const abortPromise = new Promise((_, reject) => {
      const rejectOnAbort = () => reject(createAbortError());
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

const getCopyleaksTransportTechnicalMessage = (source) => {
  if (typeof source?.rawBody === 'string' && source.rawBody.trim()) return source.rawBody.trim();
  if (typeof source?.body === 'string' && source.body.trim()) return source.body.trim();
  if (typeof source?.message === 'string' && source.message.trim()) return source.message.trim();
  return '';
};

const buildCopyleaksTransportError = (source, { usedDesktopProxy = false } = {}) => {
  const technicalMessage = getCopyleaksTransportTechnicalMessage(source);
  const normalizedMessage = technicalMessage.toLowerCase();
  const errorName = String(source?.name || '').trim();
  const errorCode = String(source?.code || '').trim().toUpperCase();

  const isAbort = errorName === 'AbortError'
    || normalizedMessage.includes('aborted')
    || normalizedMessage.includes('canceled')
    || normalizedMessage.includes('cancelled');

  if (isAbort) {
    const error = createAbortError('הבקשה ל-Copyleaks בוטלה.');
    error.technicalCode = 'ABORTED';
    error.technicalMessage = technicalMessage;
    if (source instanceof Error) error.cause = source;
    return error;
  }

  const isTimeout = errorCode === 'PROXY_TIMEOUT'
    || normalizedMessage.includes('timed out')
    || normalizedMessage.includes('timeout');
  const isAllowlistFailure = normalizedMessage.includes('host לא מורשה')
    || normalizedMessage.includes('http מותר רק')
    || normalizedMessage.includes('פרוטוקול לא מורשה')
    || normalizedMessage.includes('כתובת עם פרטי הזדהות אינה מורשית');
  const isDesktopProxyFailure = normalizedMessage.includes('ipc')
    || normalizedMessage.includes('invoke')
    || normalizedMessage.includes('channel')
    || normalizedMessage.includes('object has been destroyed')
    || normalizedMessage.includes('context')
    || normalizedMessage.includes('renderer')
    || normalizedMessage.includes('proxy');
  const isNetworkFailure = source instanceof TypeError
    || normalizedMessage.includes('failed to fetch')
    || normalizedMessage.includes('network')
    || normalizedMessage.includes('econnrefused')
    || normalizedMessage.includes('enotfound')
    || normalizedMessage.includes('socket hang up')
    || normalizedMessage.includes('request closed before completion')
    || normalizedMessage.includes('response closed before completion')
    || normalizedMessage.includes('load failed');

  let userMessage = 'יש תקלה בחיבור הרשת ל-Copyleaks. בדוק את החיבור ונסה שוב.';
  let technicalCode = 'NETWORK';

  if (isTimeout) {
    userMessage = 'הבקשה ל-Copyleaks נמשכה יותר מדי זמן ולא הושלמה. נסה שוב.';
    technicalCode = 'TIMEOUT';
  } else if (isAllowlistFailure) {
    userMessage = 'חיבור Copyleaks נחסם על ידי מגבלות האבטחה של אפליקציית הדסקטופ. בדוק שהיעד מורשה ונסה שוב.';
    technicalCode = 'DESKTOP_PROXY_ALLOWLIST';
  } else if (usedDesktopProxy && isDesktopProxyFailure) {
    userMessage = 'חיבור Copyleaks דרך אפליקציית הדסקטופ נכשל. נסה להפעיל מחדש את האפליקציה ולנסות שוב.';
    technicalCode = 'DESKTOP_PROXY';
  } else if (isNetworkFailure) {
    userMessage = 'יש תקלה בחיבור הרשת ל-Copyleaks. בדוק את החיבור ונסה שוב.';
    technicalCode = 'NETWORK';
  } else if (usedDesktopProxy) {
    userMessage = 'חיבור Copyleaks דרך אפליקציית הדסקטופ נכשל. נסה להפעיל מחדש את האפליקציה ולנסות שוב.';
    technicalCode = 'DESKTOP_PROXY';
  }

  const error = new Error(userMessage);
  error.name = 'CopyleaksTransportError';
  error.technicalCode = technicalCode;
  error.technicalMessage = technicalMessage;
  if (source instanceof Error) error.cause = source;
  return error;
};

const requestCopyleaks = async ({ url, method = 'POST', headers = {}, body, timeoutMs = 0 } = {}, signal) => {
  const desktopProxyAvailable = typeof window !== 'undefined' && typeof window.desktopApp?.proxyHttpRequest === 'function';
  const normalizedHeaders = {
    Accept: 'application/json',
    ...headers,
  };
  const bodyString = body == null
    ? undefined
    : typeof body === 'string'
      ? body
      : JSON.stringify(body);

  if (bodyString && !normalizedHeaders['Content-Type'] && !normalizedHeaders['content-type']) {
    normalizedHeaders['Content-Type'] = 'application/json';
  }

  try {
    const proxied = await proxyDesktopHttpRequest({ url, method, headers: normalizedHeaders, body: bodyString, timeoutMs }, signal);
    if (proxied) {
      const rawBody = String(proxied.body || '');
      const response = {
        ok: Boolean(proxied.ok),
        status: Number(proxied.status || 0),
        rawBody,
        data: safeJsonParse(rawBody) ?? rawBody,
      };

      if (!response.ok && response.status === 0) {
        throw buildCopyleaksTransportError({ ...proxied, rawBody, message: rawBody }, { usedDesktopProxy: true });
      }

      return response;
    }

    if (typeof window !== 'undefined') {
      const error = new Error('Copyleaks דורש את אפליקציית הדסקטופ או proxy מקומי, כי הדפדפן חוסם את ה-API שלו במגבלות CORS. פתחו את האפליקציה דרך Electron ונסו שוב.');
      error.name = 'CopyleaksTransportError';
      error.technicalCode = 'BROWSER_CORS';
      error.technicalMessage = 'Copyleaks API does not expose browser CORS headers; desktop proxy is unavailable.';
      throw error;
    }

    const response = await fetch(url, {
      method,
      headers: normalizedHeaders,
      body: bodyString,
      signal,
    });
    const rawBody = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      rawBody,
      data: safeJsonParse(rawBody) ?? rawBody,
    };
  } catch (error) {
    if (error?.technicalCode) throw error;
    throw buildCopyleaksTransportError(error, { usedDesktopProxy: desktopProxyAvailable });
  }
};

const resolveTokenFromResponse = (payload) => {
  if (typeof payload === 'string') return payload.trim();
  if (!payload || typeof payload !== 'object') return '';

  const directToken = [
    payload.access_token,
    payload.accessToken,
    payload.token,
    payload.jwt,
    payload.id_token,
    payload.idToken,
    payload?.data?.access_token,
    payload?.data?.accessToken,
    payload?.data?.token,
  ].map((value) => String(value || '').trim()).find(Boolean);

  if (directToken) return directToken;
  return '';
};

const performCopyleaksLogin = async ({ email = '', key = '' } = {}, signal) => {
  const loginPayloads = [
    { email, key },
    { email, apiKey: key },
    { email, apikey: key },
  ];

  let lastError = 'לא הצלחתי להתחבר ל-Copyleaks.';

  for (const payload of loginPayloads) {
    const response = await requestCopyleaks({
      url: COPYLEAKS_LOGIN_URL,
      method: 'POST',
      body: payload,
      timeoutMs: 30000,
    }, signal);

    const token = resolveTokenFromResponse(response.data);
    if (response.ok && token) return token;

    lastError = extractErrorMessage(response.data, response.status, lastError);
    if (![400, 422].includes(response.status)) break;
  }

  throw new Error(lastError);
};

export const getCopyleaksBearerToken = async (config = {}, options = {}) => {
  const normalized = normalizeCopyleaksConfig(config);
  const { signal, forceRefresh = false } = options || {};

  if (!normalized.email) throw new Error('יש להזין אימייל Copyleaks.');
  if (!normalized.key) throw new Error('יש להזין את המפתח הסודי של Copyleaks.');

  const cacheKey = buildCredentialCacheKey(normalized.email, normalized.key);
  if (!forceRefresh) {
    const cachedToken = getCachedToken(cacheKey);
    if (cachedToken) return cachedToken;
  }

  const freshToken = await performCopyleaksLogin(normalized, signal);
  return setCachedToken(cacheKey, freshToken);
};

export const generateCopyleaksScanId = (prefix = DEFAULT_COPYLEAKS_CONFIG.scanIdPrefix) => {
  const safePrefix = String(prefix || DEFAULT_COPYLEAKS_CONFIG.scanIdPrefix)
    .trim()
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || DEFAULT_COPYLEAKS_CONFIG.scanIdPrefix;

  const uniquePart = createRequestId().replace(/[^a-zA-Z0-9-]/g, '-');
  return `${safePrefix}-${uniquePart}`.toLowerCase();
};

const normalizeClassificationCode = (value) => {
  if (value === COPYLEAKS_CLASSIFICATION_HUMAN || value === COPYLEAKS_CLASSIFICATION_AI) return value;
  const stringValue = String(value || '').trim().toLowerCase();
  if (!stringValue) return null;
  if (stringValue === '1' || stringValue === 'human' || stringValue.includes('human')) return COPYLEAKS_CLASSIFICATION_HUMAN;
  if (stringValue === '2' || stringValue === 'ai' || stringValue.includes('generated')) return COPYLEAKS_CLASSIFICATION_AI;
  return null;
};

export const getCopyleaksClassificationLabel = (classificationCode) => {
  const normalizedCode = normalizeClassificationCode(classificationCode);
  if (normalizedCode === COPYLEAKS_CLASSIFICATION_HUMAN) return 'נראה אנושי';
  if (normalizedCode === COPYLEAKS_CLASSIFICATION_AI) return 'נראה כתוכן שנוצר בעזרת AI';
  return 'לא סווג';
};

const toPercentage = (value) => {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric >= 0 && numeric <= 1) return Number((numeric * 100).toFixed(1));
  return Number(clamp(numeric, 0, 100).toFixed(1));
};

const formatTextPreview = (value = '', maxLength = 180) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trim()}...` : normalized;
};

const normalizeResults = (results = []) => (Array.isArray(results) ? results : []).map((entry, index) => {
  const classificationCode = normalizeClassificationCode(entry?.classification ?? entry?.classificationCode ?? entry?.type);
  const preview = formatTextPreview(
    entry?.text
    ?? entry?.fragment
    ?? entry?.value
    ?? entry?.content
    ?? entry?.sentence
    ?? ''
  );
  const ai = toPercentage(entry?.summary?.ai ?? entry?.aiScore ?? entry?.ai ?? entry?.score);
  const human = toPercentage(entry?.summary?.human ?? entry?.humanScore ?? entry?.human);
  const score = toPercentage(entry?.score ?? entry?.probability ?? entry?.confidence);
  const startIndex = Number.isFinite(Number(entry?.startIndex)) ? Number(entry.startIndex) : Number.isFinite(Number(entry?.start)) ? Number(entry.start) : null;
  const endIndex = Number.isFinite(Number(entry?.endIndex)) ? Number(entry.endIndex) : Number.isFinite(Number(entry?.end)) ? Number(entry.end) : null;

  return {
    id: String(entry?.id || `${index}`),
    classificationCode,
    classificationLabel: getCopyleaksClassificationLabel(classificationCode),
    ai,
    human,
    score,
    startIndex,
    endIndex,
    preview,
  };
});

const normalizeExplainPatterns = (patterns = []) => (Array.isArray(patterns) ? patterns : []).map((pattern, index) => ({
  id: String(pattern?.id || `${index}`),
  title: String(pattern?.title || pattern?.name || pattern?.type || `Pattern ${index + 1}`).trim(),
  text: formatTextPreview(pattern?.text ?? pattern?.pattern ?? pattern?.excerpt ?? pattern?.reason ?? pattern?.description ?? '', 220),
  score: toPercentage(pattern?.score ?? pattern?.probability ?? pattern?.weight),
}));

const resolveOverallClassificationCode = (payload = {}, summary = { ai: null, human: null }) => {
  const explicit = normalizeClassificationCode(payload?.classification ?? payload?.classificationCode ?? payload?.result);
  if (explicit) return explicit;

  if (Number.isFinite(summary.ai) && Number.isFinite(summary.human)) {
    if (summary.ai > summary.human) return COPYLEAKS_CLASSIFICATION_AI;
    if (summary.human > summary.ai) return COPYLEAKS_CLASSIFICATION_HUMAN;
  }

  return null;
};

export const normalizeCopyleaksDetectionResult = (payload = {}, meta = {}) => {
  const summary = {
    ai: toPercentage(payload?.summary?.ai),
    human: toPercentage(payload?.summary?.human),
  };
  const results = normalizeResults(payload?.results);
  const classificationCode = resolveOverallClassificationCode(payload, summary, results);
  const scannedDocument = payload?.scannedDocument && typeof payload.scannedDocument === 'object'
    ? payload.scannedDocument
    : {};
  const explainPatterns = normalizeExplainPatterns(payload?.explain?.patterns);

  return {
    raw: payload,
    scanId: String(meta.scanId || '').trim(),
    summary,
    classificationCode,
    classificationLabel: getCopyleaksClassificationLabel(classificationCode),
    modelVersion: String(payload?.modelVersion || payload?.model || '').trim(),
    results,
    explainPatterns,
    scannedDocument: {
      ...scannedDocument,
      credits: Number.isFinite(Number(payload?.credits)) ? Number(payload.credits) : Number.isFinite(Number(scannedDocument?.credits)) ? Number(scannedDocument.credits) : null,
      wordCount: Number.isFinite(Number(scannedDocument?.wordCount)) ? Number(scannedDocument.wordCount) : Number.isFinite(Number(scannedDocument?.words)) ? Number(scannedDocument.words) : null,
      language: String(scannedDocument?.language || meta.language || '').trim(),
    },
    requestMeta: {
      sandbox: Boolean(meta.sandbox),
      explain: Boolean(meta.explain),
      sensitivity: Number(meta.sensitivity || DEFAULT_COPYLEAKS_CONFIG.sensitivity),
      language: String(meta.language || '').trim(),
    },
  };
};

export const detectCopyleaksText = async (config = {}, text = '', options = {}) => {
  const normalizedConfig = normalizeCopyleaksConfig(config);
  const stats = getCopyleaksTextStats(text);
  const { signal, scanId: explicitScanId = '', timeoutMs = 120000 } = options || {};

  if (!stats.isValid) {
    throw new Error(getCopyleaksValidationMessage(text) || 'הטקסט לא עומד במגבלות של Copyleaks.');
  }

  if (!normalizedConfig.email) throw new Error('יש להזין אימייל Copyleaks לפני שמריצים בדיקה.');
  if (!normalizedConfig.key) throw new Error('יש להזין את המפתח הסודי של Copyleaks לפני שמריצים בדיקה.');

  const requestBody = {
    text: stats.normalizedText,
    sandbox: normalizedConfig.sandbox,
    explain: normalizedConfig.explain,
    sensitivity: normalizedConfig.sensitivity,
    ...(normalizedConfig.language ? { language: normalizedConfig.language } : {}),
  };

  const scanId = String(explicitScanId || '').trim() || generateCopyleaksScanId(normalizedConfig.scanIdPrefix);
  const performCheck = async (forceRefreshToken = false) => {
    const token = await getCopyleaksBearerToken(normalizedConfig, { signal, forceRefresh: forceRefreshToken });
    return requestCopyleaks({
      url: `${COPYLEAKS_WRITER_DETECTOR_BASE_URL}/${encodeURIComponent(scanId)}/check`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: requestBody,
      timeoutMs,
    }, signal);
  };

  let response = await performCheck(false);
  if ([401, 403].includes(response.status)) {
    clearCopyleaksTokenCache(normalizedConfig);
    response = await performCheck(true);
  }

  if (!response.ok) {
    throw new Error(extractErrorMessage(response.data, response.status, 'Copyleaks לא הצליח להשלים את הבדיקה.'));
  }

  return normalizeCopyleaksDetectionResult(response.data, {
    scanId,
    sandbox: normalizedConfig.sandbox,
    explain: normalizedConfig.explain,
    sensitivity: normalizedConfig.sensitivity,
    language: normalizedConfig.language,
  });
};