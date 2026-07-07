// perplexitySearch.js — אחזור מקורות דרך Perplexity Sonar (search_results בלבד).
//
// שינוי מכוון מהמקור ב-aiService.js: אין fallback ל-`citations`. citations יכולים להיות
// ציטוטים שהמודל ייצר (לא תוצאות חיפוש טריות) — זה היה וקטור ההזיות המרכזי.
// search_results ריק ⇒ מחזירים [], והצנרת עוברת לספק הבא או נכשלת ביושר.

import { KNOWN_NEWS_DOMAIN_HINTS } from '../../articleSourceValidation';
import { requestJsonOverHttp } from '../../httpTransport';
import { dedupeSources, normalizePerplexitySource } from '../candidates';

// עד 10 דומיינים ל-search_domain_filter של Perplexity — כופה שהתוצאות יגיעו מאתרי חדשות
// ישראליים אמיתיים במקום יוטיוב/PDF/דפי עמותות. בלי זה חיפוש נושאי החזיר תוכן לא-עיתונאי.
const ISRAELI_NEWS_DOMAINS = [
  'ynet.co.il', 'mako.co.il', 'n12.co.il', 'walla.co.il', 'haaretz.co.il',
  'globes.co.il', 'calcalist.co.il', 'maariv.co.il', 'kan.org.il', 'davar1.co.il',
];

// ממיר 'YYYY-MM-DD' לפורמט של Perplexity search_after_date_filter: 'M/D/YYYY'.
const toPerplexityDate = (after = '') => {
  const match = String(after || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  return `${Number(match[2])}/${Number(match[3])}/${match[1]}`;
};

export const fetchPerplexitySources = async ({
  query = '',
  apiKey = '',
  model = 'sonar',
  signal,
  timeoutMs = 0,
  academic = false,
  news = false,
  after = '',
  limit = 5,
} = {}) => {
  const safeQuery = String(query || '').trim();
  const safeApiKey = String(apiKey || '').trim();
  if (!safeQuery || !safeApiKey) return [];

  const safeLimit = Math.max(1, Math.min(10, Number(limit) || 5));
  const searchMode = academic ? 'academic' : 'web';
  const afterDateFilter = toPerplexityDate(after);
  const body = JSON.stringify({
    model: String(model || '').trim() || 'sonar',
    messages: [
      {
        role: 'system',
        content: academic
          ? 'Search for real academic sources for the user query. The answer text itself can be just OK.'
          : news
            ? 'Find real journalistic news articles from news websites for the user query. Prefer specific articles, not homepages or category pages. The answer text itself can be just OK.'
            : 'Search for real web sources for the user query. The answer text itself can be just OK.',
      },
      { role: 'user', content: safeQuery },
    ],
    max_tokens: 64,
    temperature: 0,
    stream: false,
    disable_search: false,
    web_search_options: { search_mode: searchMode },
    // כתבות: מגבילים לדומייני חדשות ישראליים כדי לא לקבל וידאו/מסמכים/דפי עמותות.
    ...(news ? { search_domain_filter: ISRAELI_NEWS_DOMAINS } : {}),
    // דרישת-תאריך ("מ-2022", "אחרי 1.1.26"): מסננים בצד-שרת לפי תאריך פרסום.
    ...(afterDateFilter ? { search_after_date_filter: afterDateFilter } : {}),
    return_related_questions: false,
  });
  const data = await requestJsonOverHttp({
    url: 'https://api.perplexity.ai/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${safeApiKey}`,
    },
    body,
    signal,
    timeoutMs,
  });
  const searchResults = Array.isArray(data?.search_results)
    ? data.search_results.map(normalizePerplexitySource).filter(Boolean)
    : [];
  return dedupeSources(searchResults).slice(0, safeLimit);
};
