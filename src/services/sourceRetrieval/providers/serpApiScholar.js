// serpApiScholar.js — אחזור מקורות אקדמיים מ-Google Scholar דרך SerpAPI.
// הועבר מ-aiService.js. תוצאות = organic_results בלבד (metadata, לא טקסט מודל).

import { requestJsonOverHttp } from '../../httpTransport';
import { dedupeSources, normalizeScholarSource } from '../candidates';

const HEBREW_TEXT_PATTERN = /[֐-׿]/;
const RETRY_DELAY_MS = 800;

// שגיאות זמניות (429/5xx/רשת) — ראויות לניסיון חוזר בודד. שגיאות 4xx אחרות / status:'error' — לא.
const isTransientError = (err) => {
  const msg = String(err?.message || err || '');
  const httpMatch = msg.match(/^HTTP (\d+):/);
  if (httpMatch) {
    const code = Number(httpMatch[1]);
    return code === 429 || code >= 500;
  }
  // אין קידומת HTTP -> כשלון רשת (fetch נכשל / timeout) ולא שגיאת API מובנית -> נחשב זמני.
  return true;
};

// המתנה שמתבטלת אם ה-signal מתבטל תוך כדי (לא מוסיפה עיכוב מעבר ל-RETRY_DELAY_MS).
const delayRespectingSignal = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(new DOMException('Aborted', 'AbortError'));
    return;
  }
  const timer = setTimeout(() => {
    signal?.removeEventListener?.('abort', onAbort);
    resolve();
  }, ms);
  const onAbort = () => {
    clearTimeout(timer);
    reject(new DOMException('Aborted', 'AbortError'));
  };
  signal?.addEventListener?.('abort', onAbort, { once: true });
});

export const fetchScholarSources = async ({ query = '', apiKey = '', signal, timeoutMs = 0, limit = 5, yearLow = 0, yearHigh = 0 } = {}) => {
  const safeQuery = String(query || '').trim();
  const safeApiKey = String(apiKey || '').trim();
  if (!safeQuery || !safeApiKey) return [];

  const safeLimit = Math.max(1, Math.min(10, Number(limit) || 5));
  const params = new URLSearchParams({
    engine: 'google_scholar',
    q: safeQuery,
    api_key: safeApiKey,
    num: String(safeLimit),
    hl: HEBREW_TEXT_PATTERN.test(safeQuery) ? 'iw' : 'en',
    as_vis: '1',
    output: 'json',
  });
  // דרישת-תאריך אקדמית ("מ-2022 והלאה"): Google Scholar as_ylo מגביל לשנת-פרסום מינימלית.
  const safeYearLow = Number(yearLow);
  if (Number.isFinite(safeYearLow) && safeYearLow >= 1900 && safeYearLow <= 2100) {
    params.set('as_ylo', String(safeYearLow));
  }
  // דרישת-תאריך אקדמית עליונה ("עד שנת X"): as_yhi מגביל לשנת-פרסום מקסימלית.
  const safeYearHigh = Number(yearHigh);
  if (Number.isFinite(safeYearHigh) && safeYearHigh >= 1900 && safeYearHigh <= 2100) {
    params.set('as_yhi', String(safeYearHigh));
  }
  const requestUrl = `https://serpapi.com/search.json?${params.toString()}`;
  let data;
  try {
    data = await requestJsonOverHttp({ url: requestUrl, method: 'GET', signal, timeoutMs });
  } catch (err) {
    if (!isTransientError(err)) throw err;
    await delayRespectingSignal(RETRY_DELAY_MS, signal);
    data = await requestJsonOverHttp({ url: requestUrl, method: 'GET', signal, timeoutMs });
  }
  const status = String(data?.search_metadata?.status || '').trim().toLowerCase();
  if (status === 'error') {
    throw new Error(String(data?.error || 'SerpAPI Scholar search failed').trim());
  }
  if (!Array.isArray(data?.organic_results)) {
    const hint = data && typeof data === 'object' ? Object.keys(data).join(', ') : typeof data;
    console.warn(`[serpApiScholar] organic_results missing/not-array (typeof organic_results=${typeof data?.organic_results}); response keys: ${hint}`);
  }
  const results = Array.isArray(data?.organic_results) ? data.organic_results : [];
  return dedupeSources(results.map(normalizeScholarSource).filter(Boolean)).slice(0, safeLimit);
};
