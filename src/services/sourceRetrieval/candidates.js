// candidates.js — נורמליזציה, קנוניזציה ודה-דופליקציה של מועמדי-מקור.
// חוק ברזל: מועמד נבנה אך ורק מ-metadata של ספק חיפוש (search_results / groundingChunks /
// organic_results) — לעולם לא מ-URL שהופיע בטקסט חופשי של מודל.

import { extractDomainFromUrl, normalizeUrl } from '../articleSourceValidation';

export const DOI_PATTERN = /\b10\.\d{4,9}\/[-._;()/:a-z0-9]+/i;

export const stripHtmlTags = (value = '') => String(value || '').replace(/<[^>]+>/g, ' ');

export const normalizeSourceSearchText = (value = '') => stripHtmlTags(value)
  .replace(/\s+/g, ' ')
  .trim();

export const parseSourceYear = (value = '') => {
  const matches = String(value || '').match(/\b(?:19|20)\d{2}\b/g);
  return matches?.[matches.length - 1] || '';
};

export const extractDoiFromSource = (value = '') => {
  const match = String(value || '').match(DOI_PATTERN);
  return match ? String(match[0] || '').replace(/[),.;]+$/, '') : '';
};

const TRACKING_PARAM_KEYS = new Set([
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'msclkid', 'igshid', 'mc_cid', 'mc_eid', '_hsenc', '_hsmi',
]);

// URL קנוני להשוואות: בלי hash, בלי פרמטרי מעקב, path מנורמל.
export const canonicalizeSourceUrl = (value = '') => {
  const rawUrl = String(value || '').trim();
  if (!rawUrl) return '';

  const normalizedUrl = normalizeUrl(/^www\./i.test(rawUrl) ? `https://${rawUrl}` : rawUrl);
  if (!normalizedUrl) return '';

  try {
    const parsed = new URL(normalizedUrl);
    parsed.hash = '';
    if ((parsed.protocol === 'https:' && parsed.port === '443') || (parsed.protocol === 'http:' && parsed.port === '80')) {
      parsed.port = '';
    }
    Array.from(parsed.searchParams.keys()).forEach((key) => {
      const normalizedKey = String(key || '').trim().toLowerCase();
      if (!normalizedKey) return;
      if (/^utm_/i.test(normalizedKey) || TRACKING_PARAM_KEYS.has(normalizedKey)) {
        parsed.searchParams.delete(key);
      }
    });
    if (typeof parsed.searchParams.sort === 'function') parsed.searchParams.sort();
    parsed.pathname = (parsed.pathname || '/').replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
    return parsed.toString();
  } catch {
    return normalizedUrl;
  }
};

// מפתח השוואה עמיד ל-www/protocol: hostname+path+search.
export const buildUrlComparisonKey = (value = '') => {
  const canonicalUrl = canonicalizeSourceUrl(value);
  if (!canonicalUrl) return '';
  try {
    const parsed = new URL(canonicalUrl);
    const hostname = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const pathname = (parsed.pathname || '/').replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
    return `${hostname}${pathname}${parsed.search || ''}`;
  } catch {
    return canonicalUrl;
  }
};

export const areSourceUrlsEquivalent = (left = '', right = '') => {
  const leftCanonical = canonicalizeSourceUrl(left);
  const rightCanonical = canonicalizeSourceUrl(right);
  if (leftCanonical && rightCanonical && leftCanonical === rightCanonical) return true;
  const leftKey = buildUrlComparisonKey(leftCanonical || left);
  const rightKey = buildUrlComparisonKey(rightCanonical || right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
};

export const normalizeAllowedUrl = (value = '') => canonicalizeSourceUrl(value) || String(value || '').trim();

export const buildAllowedUrlSet = (values = []) => {
  const items = values instanceof Set ? Array.from(values) : Array.isArray(values) ? values : [];
  return new Set(items.map((url) => normalizeAllowedUrl(url)).filter(Boolean));
};

export const hasAllowedUrl = (allowedUrls = new Set(), value = '') => {
  const normalizedUrl = normalizeAllowedUrl(value);
  return Boolean(normalizedUrl) && allowedUrls.has(normalizedUrl);
};

const buildSourceKey = (item = {}) => {
  const url = canonicalizeSourceUrl(item?.finalUrl || item?.url || '') || String(item?.url || '').trim().toLowerCase();
  const title = String(item?.title || '').trim().toLowerCase();
  return `${url}::${title}`;
};

export const dedupeSources = (results = []) => {
  const seen = new Set();
  return (Array.isArray(results) ? results : []).filter((item) => {
    if (!item || typeof item !== 'object') return false;
    if (!String(item.url || '').trim() && !String(item.title || '').trim()) return false;
    const key = buildSourceKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// ---- נורמליזציה פר-ספק (metadata בלבד) ----

export const normalizeScholarSource = (raw = {}) => {
  if (!raw || typeof raw !== 'object') return null;
  const publicationInfo = raw.publication_info && typeof raw.publication_info === 'object' ? raw.publication_info : {};
  const authors = Array.isArray(publicationInfo.authors)
    ? publicationInfo.authors.map((author) => normalizeSourceSearchText(author?.name || '')).filter(Boolean)
    : [];
  const summary = normalizeSourceSearchText(publicationInfo.summary || '');
  const title = normalizeSourceSearchText(raw.title || '');
  const url = normalizeSourceSearchText(raw.link || raw.inline_links?.html_version || raw.resources?.[0]?.link || '');
  const snippet = normalizeSourceSearchText(raw.snippet || '');
  const citedByRaw = Number(raw.inline_links?.cited_by?.total);
  const citedBy = Number.isFinite(citedByRaw) && citedByRaw > 0 ? citedByRaw : null;
  const doi = extractDoiFromSource([url, snippet, summary].filter(Boolean).join(' '));
  if (!title && !url) return null;
  return {
    title,
    url,
    domain: extractDomainFromUrl(url),
    snippet,
    summary,
    authors,
    year: parseSourceYear(summary),
    citedBy,
    doi,
    provider: 'serpapi-scholar',
  };
};

export const normalizePerplexitySource = (raw = {}) => {
  if (!raw || typeof raw !== 'object') return null;
  const title = normalizeSourceSearchText(raw.title || '');
  const url = normalizeSourceSearchText(raw.url || raw.link || '');
  const snippet = normalizeSourceSearchText(raw.snippet || '');
  const sourceLabel = normalizeSourceSearchText(raw.source || '');
  const dateLabel = normalizeSourceSearchText(raw.date || raw.last_updated || '');
  const summary = [sourceLabel, dateLabel].filter(Boolean).join(' | ');
  const doi = extractDoiFromSource([title, url, snippet].filter(Boolean).join(' '));
  if (!title && !url) return null;
  return {
    title,
    url,
    domain: extractDomainFromUrl(url),
    snippet,
    summary,
    sourceName: sourceLabel,
    authors: [],
    year: parseSourceYear(dateLabel),
    citedBy: null,
    doi,
    provider: 'perplexity-search',
  };
};

// הערה מכוונת: אין כאן normalizer ל-citations של Perplexity. מערך citations יכול להכיל
// URLs שהמודל ייצר ולא תוצאות חיפוש טריות — זה היה וקטור ההזיות המרכזי. search_results בלבד.

export const normalizeGeminiChunkSource = (raw = {}, anchors = []) => {
  if (!raw || typeof raw !== 'object') return null;
  const title = normalizeSourceSearchText(raw.title || raw.displayName || '');
  const url = normalizeUrl(raw.uri || raw.url || '');
  const domain = normalizeSourceSearchText(raw.domain || extractDomainFromUrl(url));
  if (!title && !url) return null;
  return {
    title,
    url,
    domain,
    snippet: '',
    summary: domain,
    authors: [],
    year: '',
    citedBy: null,
    doi: extractDoiFromSource(url),
    provider: 'gemini-google-search',
    ...(anchors.length ? { anchors } : {}),
  };
};
