const ARTICLE_REQUEST_HINTS = ['כתבה', 'כתבות', 'ידיעה', 'ידיעות', 'חדשה', 'חדשות', 'article', 'articles', 'news'];
const QUERY_STOP_WORDS = new Set([
  'כתבה',
  'כתבות',
  'ידיעה',
  'ידיעות',
  'חדשה',
  'חדשות',
  'מאמר',
  'מאמרים',
  'article',
  'articles',
  'news',
  'real',
  'web',
  'תביא',
  'תן',
  'תני',
  'הבא',
  'מצא',
  'חפש',
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
  'לאחרונה',
  'מהשבוע',
  'השבוע',
  'אירוע',
  'אירועים',
  'אתר',
  'אתרי',
  'חדשותי',
  'עיתונאי',
  'עיתונאית',
  'שנת',
  'בשנת',
  'משנת',
  'השנה',
  'שנה',
]);
const FOCUS_GENERIC_TOKENS = new Set(['מבצע', 'דוח', 'כתבה', 'כתבות', 'ידיעה', 'ידיעות', 'חדשות', 'מאמר', 'מאמרים', 'article', 'articles', 'news']);
const NEWS_SITE_QUERY_HINTS = ['מאתר חדשות', 'מאתרי חדשות', 'אתר חדשות', 'עיתונאית', 'עיתונאי', 'news site', 'news-site', 'journalistic news', 'journalistic article', 'from a news site'];
const OPERATION_QUERY_HINTS = ['מבצע', 'operation'];
const KNOWN_OPERATION_TITLES_REQUIRING_PREFIX = new Set(['שאגת הארי']);
export const KNOWN_NEWS_DOMAIN_HINTS = [
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
  '13tv.co.il',
  'kan.org.il',
  'ice.co.il',
  'srugim.co.il',
  'davar1.co.il',
  'the7eye.org.il',
  'inn.co.il',
  'israelnationalnews.com',
  'i24news.tv',
  '08news.co.il',
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
const KNOWN_NEWS_SOURCE_LABEL_HINTS = [
  'ynet',
  'וויינט',
  'mako',
  'n12',
  'walla',
  'וואלה',
  'haaretz',
  'הארץ',
  'the marker',
  'themarker',
  'globes',
  'גלובס',
  'calcalist',
  'כלכליסט',
  'israel hayom',
  'ישראל היום',
  'maariv',
  'מעריב',
  '13tv',
  'reshet 13',
  'רשת 13',
  'ערוץ 13',
  'חדשות 13',
  'kan',
  'כאן',
  'inn',
  'israel national news',
  'ערוץ 7',
  'ערוץ שבע',
  'i24news',
  'i24 news',
  'חדשות 08',
  'חדשות אפס שמונה 08',
  'חדשות אפס שמונה',
  '08news',
  'jerusalem post',
  'jpost',
  'times of israel',
  'reuters',
  'associated press',
  'ap news',
  'bbc',
  'cnn',
  'new york times',
  'wall street journal',
  'washington post',
  'the guardian',
  'bloomberg',
  'financial times',
  'nbc news',
  'cbs news',
  'abc news',
  'fox news',
  'newsweek',
  'axios',
  'politico',
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
const QUERY_URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>()]+/gi;

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

const extractSingleDirectUrl = (query = '') => {
  const matches = String(query || '').match(QUERY_URL_PATTERN) || [];
  const normalizedMatches = Array.from(new Set(matches.map((rawValue) => {
    const trimmedValue = String(rawValue || '').trim().replace(/[),.;]+$/g, '');
    return normalizeUrl(/^www\./i.test(trimmedValue) ? `https://${trimmedValue}` : trimmedValue);
  }).filter(Boolean)));
  return normalizedMatches.length === 1 ? normalizedMatches[0] : '';
};

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
  const exactUrl = extractSingleDirectUrl(trimmedQuery);
  const focusPhrase = extractFocusPhrase(trimmedQuery);
  const hasArticleHint = ARTICLE_REQUEST_HINTS.some((hint) => normalizedQuery.includes(normalizeText(hint)));
  const hasNewsSiteHint = NEWS_SITE_QUERY_HINTS.some((hint) => normalizedQuery.includes(normalizeText(hint)));
  const hasRecentNewsHint = ['מהשבוע', 'השבוע', 'לאחרונה', 'אחרון', 'האחרון', 'אירוע', 'אירועים', 'חדשות', 'ידיעות'].some((hint) => normalizedQuery.includes(normalizeText(hint)));
  const hasNewsContextArticleHint = /(?:מאמרים?|articles?)/iu.test(trimmedQuery) && (hasNewsSiteHint || hasRecentNewsHint);

  return {
    expectsNewsArticle: hasArticleHint || hasNewsSiteHint || hasNewsContextArticleHint || Boolean(exactUrl),
    exactUrl,
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

  if (/(^|\s)(כתבה|כתבות|ידיעה|ידיעות|מאמר|מאמרים)(?=\s|$)/u.test(trimmedQuery)) {
    return trimmedQuery.replace(/(^|\s)(כתבה|כתבות|ידיעה|ידיעות|מאמר|מאמרים)(?=\s|$)/u, (_, prefix, word) => `${prefix}${word} עיתונאית מאתר חדשות`);
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

export const buildArticleSearchQueryVariants = (query = '', queryMeta = analyzeQuery(query)) => {
  const trimmedQuery = String(query || '').trim();
  if (!trimmedQuery || !queryMeta?.expectsNewsArticle) {
    return [trimmedQuery].filter(Boolean);
  }

  const variants = new Set([trimmedQuery]);
  const newsSiteBiasedQuery = buildNewsSiteBiasedArticleQuery(trimmedQuery, queryMeta);
  if (newsSiteBiasedQuery) {
    variants.add(newsSiteBiasedQuery);
  }

  const focusPhrase = String(queryMeta?.focusPhrase || '').trim();
  const normalizedFocusPhrase = normalizeText(focusPhrase);
  const isHebrewFocusPhrase = /[\u0590-\u05FF]/u.test(focusPhrase);
  const normalizedQuery = normalizeText(trimmedQuery);
  const hasOperationHint = OPERATION_QUERY_HINTS.some((hint) => normalizedQuery.includes(normalizeText(hint)));
  const shouldApplyOperationVariants = hasOperationHint || KNOWN_OPERATION_TITLES_REQUIRING_PREFIX.has(normalizedFocusPhrase);

  if (focusPhrase && isHebrewFocusPhrase && shouldApplyOperationVariants && !normalizedFocusPhrase.includes('מבצע')) {
    variants.add(`מבצע ${focusPhrase}`);
    variants.add(`כתבה על מבצע ${focusPhrase}`);
    variants.add(`תביא כתבה על מבצע ${focusPhrase}`);
  }

  return Array.from(variants).filter(Boolean);
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

const normalizeLooseHintText = (value = '') => normalizeText(value).replace(/[\s.-]+/g, '');

const textContainsHint = (text = '', hint = '') => {
  const normalizedText = normalizeText(text);
  const normalizedHint = normalizeText(hint);

  if (!normalizedText || !normalizedHint) {
    return false;
  }

  if (normalizedText.includes(normalizedHint)) {
    return true;
  }

  if (normalizedHint.includes('.') || normalizedHint.length < 4) {
    return false;
  }

  return normalizeLooseHintText(normalizedText).includes(normalizeLooseHintText(normalizedHint));
};

const hasTextualHint = (text = '', hints = []) => hints.some((hint) => textContainsHint(text, hint));

// exported: sourceRetrieval משתמש בזה להחלטת keep-botBlocked (403 מדומיין חדשות מוכר).
export const isKnownNewsDomain = (domain = '') => {
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

// דומיינים אסורים בכל סוג בקשה (news וגם academic): ויקיפדיה, רשתות חברתיות,
// בלוגים ופורומים — מה שה-prompt של סוכן sources אוסר תמיד. בשונה מ-
// DISALLOWED_DOMAIN_HINTS (שכולל gov/idf/PDF שלגיטימיים לאקדמי), זו רשימה צרה
// שבטוח לחסום גם למקורות אקדמיים. נאכף ב-pipeline מיד אחרי אימות ה-URL.
const UNIVERSALLY_BLOCKED_DOMAIN_HINTS = [
  'wikipedia.org', 'wikimedia.org', 'wikiwand.com',
  'facebook.com', 'instagram.com', 'tiktok.com', 'youtube.com', 'youtu.be',
  'twitter.com', 'x.com', 'linkedin.com', 't.me', 'telegram.me',
  'reddit.com', 'quora.com', 'medium.com', 'substack.com', 'blogspot.com', 'wordpress.com',
];
// רשימת דומיינים אסורים מותאמת-משתמש (מוגדרת מה-UI, נשמרת ב-app-settings). מתמזגת
// עם הרשימה הקשיחה. מוזרקת ע"י aiService ב-hydrate/save (setCustomBlockedSourceDomains).
let customBlockedDomainHints = [];
const normalizeBlockedDomainHint = (value = '') => String(value || '')
  .trim().toLowerCase()
  .replace(/^https?:\/\//, '')
  .replace(/^www\./, '')
  .replace(/[/?#].*$/, '')
  .trim();
export const setCustomBlockedSourceDomains = (list = []) => {
  customBlockedDomainHints = (Array.isArray(list) ? list : [])
    .map(normalizeBlockedDomainHint)
    .filter(Boolean);
};
export const getCustomBlockedSourceDomains = () => [...customBlockedDomainHints];

export const isUniversallyBlockedSourceDomain = (domain = '') => {
  const normalizedDomain = String(domain || '').toLowerCase();
  if (!normalizedDomain) return false;
  return UNIVERSALLY_BLOCKED_DOMAIN_HINTS.some((hint) => domainMatchesHint(normalizedDomain, hint))
    || customBlockedDomainHints.some((hint) => domainMatchesHint(normalizedDomain, hint));
};

const hasKnownNewsSourceSignal = (text = '') => hasTextualHint(text, KNOWN_NEWS_DOMAIN_HINTS)
  || hasTextualHint(text, KNOWN_NEWS_SOURCE_LABEL_HINTS);

const hasDisallowedSourceSignal = (text = '') => hasTextualHint(text, DISALLOWED_DOMAIN_HINTS);

const buildValidationEvidence = (article = {}, sources = [], rawText = '') => {
  const primaryEvidence = [article?.title, article?.sourceName, article?.url, article?.summary, article?.whyRelevant]
    .filter(Boolean)
    .join(' ');
  const primaryYearEvidence = [article?.title, article?.sourceName, article?.summary, article?.whyRelevant]
    .filter(Boolean)
    .join(' ');
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
    primaryEvidence,
    primaryYearEvidence,
    sourceEvidence,
    yearEvidence,
    modelEvidence,
    combinedEvidence: [sourceEvidence, modelEvidence].filter(Boolean).join(' '),
  };
};

const collectKnownNewsDomains = (sourceDomain = '', sources = []) => {
  const knownDomains = new Set();

  if (isKnownNewsDomain(sourceDomain)) {
    knownDomains.add(sourceDomain);
  }

  if (Array.isArray(sources)) {
    sources.forEach((source) => {
      const domain = extractDomainFromUrl(String(source?.url || '')) || String(source?.domain || source?.summary || '').trim().toLowerCase();
      if (domain && isKnownNewsDomain(domain)) {
        knownDomains.add(domain);
      }
    });
  }

  return knownDomains;
};

export const validateArticleCandidate = (queryMeta = analyzeQuery(''), article = {}, sources = [], rawText = '') => {
  const normalizedUrl = normalizeUrl(article?.url);
  const normalizedUrlPath = extractNormalizedUrlPath(normalizedUrl);

  if (!normalizedUrl) {
    return 'לא התקבל קישור ישיר לכתבה.';
  }

  const sourceDomain = extractDomainFromUrl(normalizedUrl) || String(article?.sourceName || '').trim();
  const evidence = buildValidationEvidence(article, sources, rawText);
  const normalizedPrimaryEvidence = normalizeText(evidence.primaryEvidence);

  if (queryMeta?.expectsNewsArticle) {
    if (isDisallowedDomain(sourceDomain) || hasDisallowedSourceSignal(evidence.primaryEvidence) || hasAnyHint(normalizedUrlPath, DISALLOWED_PATH_HINTS) || hasAnyHint(evidence.primaryEvidence, DISALLOWED_TEXT_HINTS)) {
      return 'המקור שנמצא אינו כתבת חדשות עיתונאית מאתר חדשות אלא מקור רשמי, מחקרי או חברתי.';
    }

    if (!isLikelyNewsDomain(sourceDomain) && !hasKnownNewsSourceSignal(evidence.primaryEvidence)) {
      return 'לא נמצאה אינדיקציה מספקת שמדובר בכתבת חדשות מאתר חדשות.';
    }

    const knownNewsDomains = collectKnownNewsDomains(sourceDomain, sources);
    if (knownNewsDomains.size < 2) {
      return 'לא נמצא אימות משני דומיינים ייחודיים של אתרי חדשות מוכרים לכתבה זו.';
    }
  }

  if (Array.isArray(queryMeta?.years) && queryMeta.years.length > 0) {
    const sourceEvidenceYears = extractYears(evidence.primaryYearEvidence);
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
    const hasExactFocusPhrase = normalizedFocusPhrase && normalizedPrimaryEvidence.includes(normalizedFocusPhrase);
    const matchedTokens = queryMeta.focusTokens.filter((token) => normalizedPrimaryEvidence.includes(token));

    if (!hasExactFocusPhrase && matchedTokens.length < queryMeta.focusTokens.length) {
      return `הכתבה שנמצאה לא נאמנה מספיק לשם או לנושא המבוקש: "${queryMeta.focusPhrase}".`;
    }
  }

  return '';
};