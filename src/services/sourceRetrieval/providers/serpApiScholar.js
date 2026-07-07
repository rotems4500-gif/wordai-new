// serpApiScholar.js — אחזור מקורות אקדמיים מ-Google Scholar דרך SerpAPI.
// הועבר מ-aiService.js. תוצאות = organic_results בלבד (metadata, לא טקסט מודל).

import { requestJsonOverHttp } from '../../httpTransport';
import { dedupeSources, normalizeScholarSource } from '../candidates';

const HEBREW_TEXT_PATTERN = /[֐-׿]/;

export const fetchScholarSources = async ({ query = '', apiKey = '', signal, timeoutMs = 0, limit = 5, yearLow = 0 } = {}) => {
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
  const data = await requestJsonOverHttp({
    url: `https://serpapi.com/search.json?${params.toString()}`,
    method: 'GET',
    signal,
    timeoutMs,
  });
  const status = String(data?.search_metadata?.status || '').trim().toLowerCase();
  if (status === 'error') {
    throw new Error(String(data?.error || 'SerpAPI Scholar search failed').trim());
  }
  const results = Array.isArray(data?.organic_results) ? data.organic_results : [];
  return dedupeSources(results.map(normalizeScholarSource).filter(Boolean)).slice(0, safeLimit);
};
