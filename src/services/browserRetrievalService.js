const DEFAULT_BROWSER_RETRIEVAL_TIMEOUT_MS = 12000;
const DEFAULT_BROWSER_RETRIEVAL_WAIT_MS = 1200;
const MAX_BROWSER_RETRIEVAL_TEXT_LENGTH = 24000;

const normalizeBrowserRetrievalUrl = (value = '') => {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';

  try {
    const normalizedValue = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`;
    return new URL(normalizedValue).toString();
  } catch {
    return '';
  }
};

export const isDesktopBrowserRetrievalAvailable = () => Boolean(
  typeof window !== 'undefined' && typeof window.desktopApp?.fetchBrowserPageSnapshot === 'function'
);

export async function fetchBrowserPageSnapshot(url = '', {
  timeoutMs = DEFAULT_BROWSER_RETRIEVAL_TIMEOUT_MS,
  waitMs = DEFAULT_BROWSER_RETRIEVAL_WAIT_MS,
  extractText = true,
  maxTextLength = MAX_BROWSER_RETRIEVAL_TEXT_LENGTH,
} = {}) {
  const normalizedUrl = normalizeBrowserRetrievalUrl(url);
  if (!normalizedUrl || !isDesktopBrowserRetrievalAvailable()) return null;

  const result = await window.desktopApp.fetchBrowserPageSnapshot({
    url: normalizedUrl,
    timeoutMs,
    waitMs,
    extractText,
    maxTextLength,
  });

  if (!result || result.ok === false) return null;
  return result;
}