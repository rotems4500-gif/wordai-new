const ARTICLE_REQUEST_HINTS = ['כתבה', 'כתבות', 'article', 'articles', 'news'];
const QUERY_STOP_WORDS = new Set([
  'כתבה',
  'כתבות',
  'article',
  'articles',
  'news',
  'real',
  'web',
  'תביא',
  'תן',
  'תני',
  'הבא',
  'לי',
  'על',
  'אודות',
  'בנושא',
  'לגבי',
  'של',
  'עם',
  'כולל',
  'מקור',
  'קישור',
  'ברור',
  'אמין',
  'אמינה',
  'מהימן',
  'מהימנה',
  'עדכני',
  'עדכנית',
  'אמיתי',
  'אמיתית',
  'רלוונטי',
  'רלוונטית',
  'מהימים',
  'הימים',
  'האחרונים',
  'האחרון',
  'שנת',
  'בשנת',
  'משנת',
  'השנה',
  'שנה',
]);
const FOCUS_GENERIC_TOKENS = new Set(['מבצע', 'דוח', 'כתבה', 'מאמר', 'article', 'news']);
const NEWS_SITE_QUERY_HINTS = ['מאתר חדשות', 'מאתרי חדשות', 'אתר חדשות', 'עיתונאית', 'עיתונאי', 'news site', 'news-site', 'journalistic news', 'journalistic article', 'from a news site'];
const KNOWN_NEWS_DOMAIN_HINTS = [
  'ynet.co.il',
  'mako.co.il',
  'n12.co.il',
  'walla.co.il',
  'haaretz.co.il',
  'themarker.com',
  'themarker.co.il',
  'globes.co.il',
  'calcalist.co.il',
  'israelhayom.co.il',
  'maariv.co.il',
  'kan.org.il',
  'ice.co.il',
  'srugim.co.il',
  'davar1.co.il',
  'jpost.com',
  'timesofisrael.com',
  'reuters.com',
  'apnews.com',
  'bbc.com',
  'bbc.co.uk',
  'cnn.com',
  'nytimes.com',
  'wsj.com',
  'washingtonpost.com',
  'theguardian.com',
  'bloomberg.com',
  'financialtimes.com',
  'ft.com',
  'nbcnews.com',
  'cbsnews.com',
  'abcnews.go.com',
  'foxnews.com',
  'newsweek.com',
  'axios.com',
  'politico.com',
];
const GENERIC_NEWS_DOMAIN_HINTS = ['news', 'times', 'post', 'journal', 'gazette', 'herald', 'tribune', 'chronicle', 'observer', 'monitor', 'daily', 'wire'];
const DISALLOWED_DOMAIN_HINTS = [
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'youtube.com',
  'youtu.be',
  'twitter.com',
  'x.com',
  'linkedin.com',
  't.me',
  'telegram.me',
  'gov.il',
  '.gov',
  'idf.il',
  'inss.org.il',
  'wikipedia.org',
  'reddit.com',
  'medium.com',
  'substack.com',
  'blogspot.com',
];
const DISALLOWED_PATH_HINTS = ['press-release', 'news-release', 'official-statement', 'blog', 'analysis', 'opinion', 'commentary', 'white-paper', 'pdf', 'video', 'tweet', 'status', 'post', 'topic', 'topics', 'category', 'categories', 'tag', 'tags'];
const DISALLOWED_TEXT_HINTS = ['הודעה לעיתונות', 'הודעה רשמית', 'דוברות', 'מאמר דעה', 'פרשנות', 'analysis', 'opinion', 'commentary', 'blog post', 'press release', 'social post', 'פוסט', 'ציוץ'];

export const normalizeUrl = (value = '') => {
  const url = String(value || '').trim();

  if (!url) {
    return '';
  }

  try {
    return new URL(url).toString();
  } catch {
    return '';
  }
};

export const extractDomainFromUrl = (value = '') => {
  const url = normalizeUrl(value);

  if (!url) {
    return '';
  }

  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const extractNormalizedUrlPath = (value = '') => {
  const url = normalizeUrl(value);

  if (!url) {
    return '';
  }

  try {
    return normalizeText(new URL(url).pathname || '');
  } catch {
    return '';
  }
};

export const normalizeText = (value = '') => String(value || '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}\s.-]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const extractYears = (text = '') => Array.from(new Set(String(text || '').match(/\b(?:19|20)\d{2}\b/g) || []));

const extractFocusPhrase = (query = '') => {
  const raw = String(query || '').trim();

  if (!raw) {
    return '';
  }

  const markerMatch = raw.match(/(?:^|\s)(?:על|אודות|בנושא|לגבי)\s+(.+)$/u);
  let phrase = (markerMatch?.[1] || raw).trim();

  phrase = phrase
    .replace(/\s+(?:של|משנת|בשנת|שנת)\s+(?:19|20)\d{2}(?=$|[^\p{L}\p{N}])/gu, '')
    .replace(/\s+(?:עם|כולל)\s+(?:מקור|קישור)\s+(?:ברור|אמין|מהימן).*$/u, '')
    .replace(/\s+מה(?:ימים|יום|שבוע|חודש)\s+האחרו(?:ן|נים).*$/u, '')
    .trim();

  return phrase;
};

const tokenizeFocusText = (text = '') => Array.from(
  new Set(
    normalizeText(text)
      .split(' ')
      .filter((token) => token && !QUERY_STOP_WORDS.has(token) && !/^(?:19|20)\d{2}$/.test(token) && token.length >= 2)
      .filter((token) => !FOCUS_GENERIC_TOKENS.has(token)),
  ),
).slice(0, 6);

export const analyzeQuery = (query = '') => {
  const trimmedQuery = String(query || '').trim();
  const normalizedQuery = normalizeText(trimmedQuery);
  const focusPhrase = extractFocusPhrase(trimmedQuery);

  return {
    expectsNewsArticle: ARTICLE_REQUEST_HINTS.some((hint) => normalizedQuery.includes(hint)),
    years: extractYears(trimmedQuery),
    focusPhrase,
    focusTokens: tokenizeFocusText(focusPhrase),
  };
};

export const buildNewsSiteBiasedArticleQuery = (query = '', queryMeta = analyzeQuery(query)) => {
  const trimmedQuery = String(query || '').trim();

  if (!trimmedQuery || !queryMeta?.expectsNewsArticle) {
    return '';
  }

  const normalizedQuery = normalizeText(trimmedQuery);
  if (NEWS_SITE_QUERY_HINTS.some((hint) => normalizedQuery.includes(normalizeText(hint)))) {
    return '';
  }

  if (/(^|\s)(כתבה|כתבות)(?=\s|$)/u.test(trimmedQuery)) {
    return trimmedQuery.replace(/(^|\s)(כתבה|כתבות)(?=\s|$)/u, (_, prefix, word) => `${prefix}${word} עיתונאית מאתר חדשות`);
  }

  if (/\barticles?\b/i.test(trimmedQuery)) {
    if (/\bnews\b/i.test(trimmedQuery)) {
      return `${trimmedQuery} from a journalistic news site`;
    }

    return trimmedQuery.replace(/\barticles?\b/i, (word) => `journalistic news ${word}`);
  }

  return /[\u0590-\u05FF]/u.test(trimmedQuery)
    ? `${trimmedQuery} עיתונאית מאתר חדשות`
    : `${trimmedQuery} from a journalistic news site`;
};

const domainMatchesHint = (domain = '', hint = '') => {
  if (!domain || !hint) {
    return false;
  }

  if (hint === '.gov') {
    return domain.endsWith('.gov') || domain.includes('.gov.');
  }

  return domain === hint || domain.endsWith(`.${hint}`) || domain.includes(hint);
};

const hasAnyHint = (text = '', hints = []) => {
  const normalizedText = normalizeText(text);
  return hints.some((hint) => normalizedText.includes(normalizeText(hint)));
};

const isKnownNewsDomain = (domain = '') => {
  const normalizedDomain = String(domain || '').toLowerCase();
  return KNOWN_NEWS_DOMAIN_HINTS.some((hint) => domainMatchesHint(normalizedDomain, hint));
};

const isLikelyNewsDomain = (domain = '') => {
  const normalizedDomain = String(domain || '').toLowerCase();

  if (!normalizedDomain) {
    return false;
  }

  if (isKnownNewsDomain(normalizedDomain)) {
    return true;
  }

  return GENERIC_NEWS_DOMAIN_HINTS.some((hint) => normalizedDomain.includes(hint));
};

const isDisallowedDomain = (domain = '') => {
  const normalizedDomain = String(domain || '').toLowerCase();

  if (!normalizedDomain || isKnownNewsDomain(normalizedDomain)) {
    return false;
  }

  return DISALLOWED_DOMAIN_HINTS.some((hint) => domainMatchesHint(normalizedDomain, hint));
};

const buildValidationEvidence = (article = {}, sources = [], rawText = '') => {
  const sourceEvidence = [
    ...(Array.isArray(sources)
      ? sources.flatMap((source) => [source?.title, source?.domain, source?.url, source?.summary, source?.snippet, source?.year])
      : []),
  ].filter(Boolean).join(' ');

  const yearEvidence = [
    ...(Array.isArray(sources)
      ? sources.flatMap((source) => [source?.title, source?.summary, source?.snippet, source?.year])
      : []),
  ].filter(Boolean).join(' ');

  const modelEvidence = [article?.summary, article?.whyRelevant, rawText].filter(Boolean).join(' ');

  return {
    sourceEvidence,
    yearEvidence,
    modelEvidence,
    combinedEvidence: [sourceEvidence, modelEvidence].filter(Boolean).join(' '),
  };
};

export const validateArticleCandidate = (queryMeta = analyzeQuery(''), article = {}, sources = [], rawText = '') => {
  const normalizedUrl = normalizeUrl(article?.url);
  const normalizedUrlPath = extractNormalizedUrlPath(normalizedUrl);

  if (!normalizedUrl) {
    return 'לא התקבל קישור ישיר לכתבה.';
  }

  const sourceDomain = extractDomainFromUrl(normalizedUrl) || String(article?.sourceName || '').trim();
  const evidence = buildValidationEvidence(article, sources, rawText);
  const normalizedSourceEvidence = normalizeText(evidence.sourceEvidence);

  if (queryMeta?.expectsNewsArticle) {
    if (isDisallowedDomain(sourceDomain) || hasAnyHint(normalizedUrlPath, DISALLOWED_PATH_HINTS) || hasAnyHint(evidence.sourceEvidence, DISALLOWED_TEXT_HINTS)) {
      return 'המקור שנמצא אינו כתבת חדשות עיתונאית מאתר חדשות אלא מקור רשמי, מחקרי או חברתי.';
    }

    if (!isLikelyNewsDomain(sourceDomain)) {
      return 'לא נמצאה אינדיקציה מספקת שמדובר בכתבת חדשות מאתר חדשות.';
    }
  }

  if (Array.isArray(queryMeta?.years) && queryMeta.years.length > 0) {
    const sourceEvidenceYears = extractYears(evidence.yearEvidence);
    const hasAllRequestedYears = queryMeta.years.every((year) => sourceEvidenceYears.includes(year));

    if (!hasAllRequestedYears) {
      return `לא נמצאה התאמה מפורשת לשנה המבוקשת: ${queryMeta.years.join(', ')}.`;
    }

    const conflictingSourceYears = sourceEvidenceYears.filter((year) => !queryMeta.years.includes(year));

    if (sourceEvidenceYears.length > 0 && conflictingSourceYears.length > 0 && !queryMeta.years.every((year) => sourceEvidenceYears.includes(year))) {
      return `התוצאה מפנה לשנה אחרת (${conflictingSourceYears.join(', ')}) ולא לשנה המבוקשת.`;
    }
  }

  if (Array.isArray(queryMeta?.focusTokens) && queryMeta.focusTokens.length > 0) {
    const normalizedFocusPhrase = normalizeText(queryMeta.focusPhrase);
    const hasExactFocusPhrase = normalizedFocusPhrase && normalizedSourceEvidence.includes(normalizedFocusPhrase);
    const matchedTokens = queryMeta.focusTokens.filter((token) => normalizedSourceEvidence.includes(token));

    if (!hasExactFocusPhrase && matchedTokens.length < queryMeta.focusTokens.length) {
      return `הכתבה שנמצאה לא נאמנה מספיק לשם או לנושא המבוקש: "${queryMeta.focusPhrase}".`;
    }
  }

  return '';
};