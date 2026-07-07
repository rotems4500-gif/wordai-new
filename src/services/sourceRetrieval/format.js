// format.js — בניית טקסט התשובה בעברית עבור בקשת-מקורות טהורה (סוכן 'מקורות').
// מחליף את buildVerifiedSourceReply/buildVerifiedSourceFailureMessage מ-aiService.js.

import { SOURCE_GROUNDING_FAILURE_TOKEN } from './lock';

const PROVIDER_LABELS = {
  'serpapi-scholar': 'Google Scholar / SerpAPI',
  'gemini-google-search': 'Gemini + Google Search',
  'perplexity-search': 'Perplexity Search',
};

const KIND_TITLES = {
  academic: 'מקורות אקדמיים',
  news: 'כתבות מאומתות',
  web: 'מקורות',
};

export const formatSourceItem = (item = {}, index = 0) => {
  const lines = [`${index + 1}. ${item.title || item.finalUrl || item.url || 'מקור מאומת'}`];
  const publicationSummary = String(item.summary || '').trim();
  if (publicationSummary) lines.push(`פרטי פרסום: ${publicationSummary}`);
  else if (Array.isArray(item.authors) && item.authors.length) lines.push(`מחברים: ${item.authors.join(', ')}`);
  if (item.citedBy) lines.push(`צוטט על ידי: ${item.citedBy}`);
  if (item.doi) lines.push(`DOI: ${item.doi}`);
  if (item.finalUrl || item.url) lines.push(`קישור: ${item.finalUrl || item.url}`);
  else lines.push('קישור: לא זמין במטא-דאטה של ספק החיפוש');
  if (item.verification?.botBlocked) lines.push('הערה: האתר חוסם בדיקה אוטומטית (למשל paywall) — הקישור לא אומת אוטומטית אבל הדומיין מוכר.');
  if (item.verification?.missingUrl) lines.push('הערה: נשמר כמקור ביבליוגרפי ללא URL; אין להמציא לו קישור.');
  if (item.snippet) lines.push(`תקציר: ${item.snippet}`);
  return lines.join('\n');
};

export const formatSourcesReply = ({ query = '', sources = [], kind = 'web', providerTrail = [] } = {}) => {
  const safeSources = Array.isArray(sources) ? sources.filter(Boolean) : [];
  const successfulProvider = providerTrail.find((step) => step?.resultCount > 0)?.providerId
    || safeSources[0]?.provider || '';
  const providerLabel = PROVIDER_LABELS[successfulProvider] || 'ספק החיפוש';
  const linkedSources = safeSources.filter((source) => source?.finalUrl || source?.url);
  const verifiedCount = linkedSources.filter((source) => !source?.verification?.botBlocked).length;
  const missingUrlCount = safeSources.length - linkedSources.length;
  return [
    `${KIND_TITLES[kind] || KIND_TITLES.web} בלבד${query ? ` עבור: ${query}` : ''}`,
    `הוחזרו ${safeSources.length} פריטים שאותרו ישירות דרך ${providerLabel}${linkedSources.length ? `; ${linkedSources.length} קישורים נבדקו שהם נפתחים בפועל${verifiedCount < linkedSources.length ? ' (למעט פריטים המסומנים כחסומי-בדיקה)' : ''}` : ''}${missingUrlCount ? `; ${missingUrlCount} מקורות נשמרו ללא URL כי ספק החיפוש לא החזיר קישור` : ''}.`,
    ...safeSources.map((item, index) => formatSourceItem(item, index)),
    'לא הוספתי מקורות שלא הופיעו בתוצאות האחזור, קישורים מתים נופו, ולא הומצאו קישורים למקורות ללא URL.',
  ].filter(Boolean).join('\n\n');
};

export const formatSourcesFailureReply = ({ query = '', kind = 'web', failureReason = 'no-results' } = {}) => {
  const lines = [SOURCE_GROUNDING_FAILURE_TOKEN];
  if (failureReason === 'no-provider') {
    lines.push(kind === 'academic'
      ? 'אין כרגע ספק אחזור מאומת למקורות אקדמיים. הגדר SerpAPI עבור Google Scholar כדי לשלוף מאמרים אמיתיים, או הגדר Perplexity למסלול מחקר מאומת כללי.'
      : 'אין כרגע ספק אחזור מאומת למקורות. הגדר Perplexity או Gemini כדי לקבל תוצאות וקישורים אמיתיים.');
  } else if (failureReason === 'all-dead-links') {
    lines.push('נמצאו תוצאות, אבל אף קישור לא עבר את בדיקת החיות — לא הצגתי קישורים שבורים.');
  } else if (failureReason === 'budget-exhausted') {
    lines.push('תקציב קריאות ה-API לפעולה הזו נוצל. נסה שוב או צמצם את הבקשה.');
  } else if (failureReason === 'timeout') {
    lines.push('אחזור המקורות חרג ממסגרת הזמן. נסה שוב עם שאילתה ממוקדת יותר.');
  } else {
    lines.push(kind === 'academic'
      ? 'לא נמצאו מקורות אקדמיים מאומתים לשאילתה, ולכן לא יצרתי מקורות על סמך המודל.'
      : kind === 'news'
        ? 'לא נמצאה כתבת חדשות עיתונאית תואמת לשאילתה, ולכן לא החזרתי מקור קרוב-אבל-שגוי.'
        : 'לא נמצאו מקורות מאומתים לשאילתה, ולכן לא יצרתי מקורות על סמך המודל.');
  }
  if (query) lines.push(`שאילתת החיפוש שנבדקה: ${query}`);
  return lines.join('\n\n');
};
