import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { analyzeQuery, buildNewsSiteBiasedArticleQuery, validateArticleCandidate } from '../src/services/articleSourceValidation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PROVIDER = 'gemini';
const DEFAULT_MODEL = 'gemini-2.5-pro';
const DEFAULT_PERPLEXITY_MODEL = 'sonar-pro';
const MAX_MODEL_OVERRIDE_LENGTH = 120;
const DEFAULT_PORT = Number(process.env.GEMINI_ARTICLE_CHECK_PORT || 4317);
const HTML_PATH = path.resolve(__dirname, '..', 'tools', 'gemini-article-check.html');
const LOOPBACK_ORIGINS = new Set([
  `http://127.0.0.1:${DEFAULT_PORT}`,
  `http://localhost:${DEFAULT_PORT}`,
]);
const DEV_LOOPBACK_ORIGIN_PATTERN = /^https?:\/\/(?:localhost|127(?:\.\d+){3}|\[::1\])(?::\d+)?$/i;
const CONFIG_FILE_NAME = 'ai-provider-config.json';
const LEVELDB_DIRNAME = path.join('Local Storage', 'leveldb');
const SUPPORTED_PROVIDERS = new Set(['gemini', 'perplexity']);
const USER_DATA_DIRNAMES = [
  'word-ai-assistant',
  'Word AI Assistant',
  'WordFlow AI',
  'wordflow-ai',
];
const GEMINI_KEY_PATTERN = /AIza[0-9A-Za-z_-]{20,}/g;
const PERPLEXITY_KEY_PATTERN = /pplx-[0-9A-Za-z_-]{20,}/g;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;
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
const DISALLOWED_PATH_HINTS = ['press-release', 'news-release', 'official-statement', 'blog', 'analysis', 'opinion', 'commentary', 'white-paper', 'pdf', 'video', 'tweet', 'status', 'post'];
const DISALLOWED_TEXT_HINTS = ['הודעה לעיתונות', 'הודעה רשמית', 'דוברות', 'מאמר דעה', 'פרשנות', 'analysis', 'opinion', 'commentary', 'blog post', 'press release', 'social post', 'פוסט', 'ציוץ'];

function getHttpsOptions() {
  try {
    const certsDir = path.join(os.homedir(), '.office-addin-dev-certs');
    const keyFile = path.join(certsDir, 'localhost.key');
    const certFile = path.join(certsDir, 'localhost.crt');

    if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
      return {
        key: fs.readFileSync(keyFile),
        cert: fs.readFileSync(certFile),
      };
    }
  } catch {
    return null;
  }

  return null;
}

function getAppDataRoot() {
  if (process.env.APPDATA) {
    return process.env.APPDATA;
  }

  return path.join(os.homedir(), 'AppData', 'Roaming');
}

function getUserDataDirs() {
  return USER_DATA_DIRNAMES.map((dirname) => path.join(getAppDataRoot(), dirname));
}

function readJsonFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
}

function getDefaultModelForProvider(provider) {
  return provider === 'perplexity' ? DEFAULT_PERPLEXITY_MODEL : DEFAULT_MODEL;
}

function normalizeProvider(provider) {
  const normalized = String(provider || DEFAULT_PROVIDER).trim().toLowerCase();

  if (SUPPORTED_PROVIDERS.has(normalized)) {
    return normalized;
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

function normalizeModelOverride(model) {
  const normalized = String(model || '').trim();

  if (!normalized) {
    return '';
  }

  if (normalized.length > MAX_MODEL_OVERRIDE_LENGTH || !/^[A-Za-z0-9._:/-]+$/.test(normalized)) {
    throw new Error('Invalid model override.');
  }

  return normalized;
}

function loadProviderConfigFromDisk(provider) {
  let discoveredModel = '';
  const normalizedProvider = normalizeProvider(provider);

  for (const userDataDir of getUserDataDirs()) {
    const configPath = path.join(userDataDir, CONFIG_FILE_NAME);

    if (!fs.existsSync(configPath)) {
      continue;
    }

    try {
      const config = readJsonFile(configPath);
      const providerConfig = config?.[normalizedProvider] || {};
      const key = String(providerConfig?.key || '').trim();
      const model = String(providerConfig?.model || '').trim();

      if (!discoveredModel && model) {
        discoveredModel = model;
      }

      if (key) {
        return {
          key,
          model: model || discoveredModel || DEFAULT_MODEL,
          sourceKind: 'provider-config',
          sourcePath: configPath,
        };
      }
    } catch {
      continue;
    }
  }

  return {
    key: '',
    model: discoveredModel || getDefaultModelForProvider(normalizedProvider),
    sourceKind: 'provider-config',
    sourcePath: '',
  };
}

function loadGeminiConfigFromDisk() {
  return loadProviderConfigFromDisk('gemini');
}

function loadPerplexityConfigFromDisk() {
  return loadProviderConfigFromDisk('perplexity');
}

function extractKeyFromLevelDb(keyPattern) {
  for (const userDataDir of getUserDataDirs()) {
    const levelDbDir = path.join(userDataDir, LEVELDB_DIRNAME);

    if (!fs.existsSync(levelDbDir)) {
      continue;
    }

    let fileNames = [];

    try {
      fileNames = fs.readdirSync(levelDbDir);
    } catch {
      continue;
    }

    for (const fileName of fileNames) {
      const filePath = path.join(levelDbDir, fileName);

      try {
        if (!fs.statSync(filePath).isFile()) {
          continue;
        }

        const raw = fs.readFileSync(filePath);
        const text = raw.toString('latin1');
        const match = text.match(keyPattern);

        if (match?.[0]) {
          return {
            key: match[0],
            sourceKind: 'local-storage',
            sourcePath: filePath,
          };
        }
      } catch (error) {
        if (error && error.code === 'EBUSY') {
          continue;
        }
      }
    }
  }

  return {
    key: '',
    sourceKind: 'local-storage',
    sourcePath: '',
  };
}

function extractGeminiKeyFromLevelDb() {
  return extractKeyFromLevelDb(GEMINI_KEY_PATTERN);
}

function extractPerplexityKeyFromLevelDb() {
  return extractKeyFromLevelDb(PERPLEXITY_KEY_PATTERN);
}

function resolveGeminiCredentials(modelOverride = '') {
  const normalizedModelOverride = normalizeModelOverride(modelOverride);
  const fromConfig = loadGeminiConfigFromDisk();

  if (fromConfig.key) {
    return {
      ...fromConfig,
      model: normalizedModelOverride || fromConfig.model || DEFAULT_MODEL,
    };
  }

  const fromLevelDb = extractGeminiKeyFromLevelDb();

  if (fromLevelDb.key) {
    return {
      key: fromLevelDb.key,
      model: normalizedModelOverride || fromConfig.model || DEFAULT_MODEL,
      sourceKind: fromLevelDb.sourceKind,
      sourcePath: fromLevelDb.sourcePath,
    };
  }

  throw new Error('לא נמצא מפתח Gemini ב-ai-provider-config.json או ב-Local Storage של האפליקציה.');
}

function resolvePerplexityCredentials(modelOverride = '') {
  const normalizedModelOverride = normalizeModelOverride(modelOverride);
  const fromConfig = loadPerplexityConfigFromDisk();

  if (fromConfig.key) {
    return {
      ...fromConfig,
      model: normalizedModelOverride || fromConfig.model || DEFAULT_PERPLEXITY_MODEL,
    };
  }

  const fromLevelDb = extractPerplexityKeyFromLevelDb();

  if (fromLevelDb.key) {
    return {
      key: fromLevelDb.key,
      model: normalizedModelOverride || fromConfig.model || DEFAULT_PERPLEXITY_MODEL,
      sourceKind: fromLevelDb.sourceKind,
      sourcePath: fromLevelDb.sourcePath,
    };
  }

  throw new Error('לא נמצא מפתח Perplexity ב-ai-provider-config.json או ב-Local Storage של האפליקציה.');
}

function resolveCredentials(provider, modelOverride = '') {
  const normalizedProvider = normalizeProvider(provider);

  if (normalizedProvider === 'perplexity') {
    return resolvePerplexityCredentials(modelOverride);
  }

  return resolveGeminiCredentials(modelOverride);
}

function buildPrompt(query, provider = DEFAULT_PROVIDER, queryMeta = analyzeQuery(query)) {
  const normalizedProvider = normalizeProvider(provider);
  const searchInstruction = normalizedProvider === 'perplexity'
    ? 'מצא כתבת web אמיתית אחת שמתאימה לבקשה הבאה, והסתמך רק על מידע שניתן לעגן בחיפוש web המובנה של Perplexity.'
    : 'מצא כתבת web אמיתית אחת שמתאימה לבקשה הבאה, והסתמך רק על מידע שניתן לעגן בחיפוש Google המובנה.';

  return [
    searchInstruction,
    'אל תמציא URL ואל תמציא מקור.',
    queryMeta.expectsNewsArticle
      ? 'אם הבקשה מבקשת "כתבה", החזר רק כתבת חדשות עיתונאית מאתר חדשות. אל תחזיר הודעה רשמית, הודעה לעיתונות, עמוד של מכון מחקר, מאמר ניתוח או דעה, בלוג, פוסט חברתי, וידאו או דף קטגוריה.'
      : 'החזר רק עמוד כתבה יחיד, לא דף בית ולא דף קטגוריה.',
    queryMeta.years.length > 0
      ? `אם צוינה שנה, הכתבה חייבת להתאים בדיוק לשנה הזאת: ${queryMeta.years.join(', ')}. אל תחליף לשנה סמוכה.`
      : 'אם לא נמצאה התאמה נאמנה מספיק, החזר no-match במקום מקור קרוב-אבל-שגוי.',
    queryMeta.focusPhrase
      ? `היה נאמן בדיוק לשם או לנושא הזה: "${queryMeta.focusPhrase}". אם המקור לא מתייחס אליו במפורש, החזר no-match.`
      : 'אל תחליף אירוע, גוף, דוח או נושא בשם אחר גם אם הוא קשור חלקית.',
    'אם אין כתבה תואמת מספיק, החזר matchStatus="no-match" עם noMatchReason ברור, והשאר את title/url/summary/sourceName/whyRelevant ריקים.',
    'החזר JSON בלבד במבנה הבא:',
    '{',
    '  "matchStatus": "match או no-match",',
    '  "noMatchReason": "הסבר קצר אם לא נמצא, אחרת מחרוזת ריקה",',
    '  "title": "כותרת הכתבה",',
    '  "url": "הקישור הישיר לכתבה, או מחרוזת ריקה אם לא נמצא",',
    '  "summary": "תקציר תמציתי של 2-4 משפטים, או מחרוזת ריקה אם לא נמצא",',
    '  "sourceName": "שם האתר או המקור",',
    '  "whyRelevant": "למה הכתבה הזאת מתאימה לבקשה, או מחרוזת ריקה אם לא נמצא"',
    '}',
    '',
    `הבקשה: ${query}`,
  ].join('\n');
}

function stripCodeFence(text) {
  const trimmed = String(text || '').trim();

  if (!trimmed.startsWith('```')) {
    return trimmed;
  }

  return trimmed.replace(/^```[a-zA-Z0-9_-]*\s*/, '').replace(/\s*```$/, '').trim();
}

function parseLooseJson(text) {
  const cleaned = stripCodeFence(text);

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) {
      return {};
    }

    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return {};
    }
  }
}

function normalizeUrl(value) {
  const url = String(value || '').trim();

  if (!url) {
    return '';
  }

  try {
    return new URL(url).toString();
  } catch {
    return '';
  }
}

const TRACKING_PARAM_KEYS = new Set([
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'msclkid',
  'igshid',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
]);

function canonicalizeArticleUrl(value) {
  const rawUrl = String(value || '').trim();

  if (!rawUrl) {
    return '';
  }

  const normalizedUrl = normalizeUrl(/^www\./i.test(rawUrl) ? `https://${rawUrl}` : rawUrl);

  if (!normalizedUrl) {
    return '';
  }

  try {
    const parsed = new URL(normalizedUrl);
    parsed.hash = '';

    if ((parsed.protocol === 'https:' && parsed.port === '443') || (parsed.protocol === 'http:' && parsed.port === '80')) {
      parsed.port = '';
    }

    Array.from(parsed.searchParams.keys()).forEach((key) => {
      const normalizedKey = String(key || '').trim().toLowerCase();

      if (!normalizedKey) {
        return;
      }

      if (/^utm_/i.test(normalizedKey) || TRACKING_PARAM_KEYS.has(normalizedKey)) {
        parsed.searchParams.delete(key);
      }
    });

    if (typeof parsed.searchParams.sort === 'function') {
      parsed.searchParams.sort();
    }

    parsed.pathname = (parsed.pathname || '/').replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
    return parsed.toString();
  } catch {
    return normalizedUrl;
  }
}

function extractDomainFromUrl(value) {
  const url = normalizeUrl(value);

  if (!url) {
    return '';
  }

  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractYears(text) {
  return Array.from(new Set(String(text || '').match(/\b(?:19|20)\d{2}\b/g) || []));
}

function extractFocusPhrase(query) {
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
}

function tokenizeFocusText(text) {
  return Array.from(
    new Set(
      normalizeText(text)
        .split(' ')
        .filter((token) => token && !QUERY_STOP_WORDS.has(token) && !/^(?:19|20)\d{2}$/.test(token) && token.length >= 2)
        .filter((token) => !FOCUS_GENERIC_TOKENS.has(token)),
    ),
  ).slice(0, 6);
}

function normalizeMatchStatus(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/_/g, '-');

  if (normalized === 'match') {
    return 'match';
  }

  if (normalized === 'no-match' || normalized === 'no match' || normalized === 'nomatch') {
    return 'no-match';
  }

  return '';
}

function domainMatchesHint(domain, hint) {
  if (!domain || !hint) {
    return false;
  }

  if (hint === '.gov') {
    return domain.endsWith('.gov') || domain.includes('.gov.');
  }

  return domain === hint || domain.endsWith(`.${hint}`) || domain.includes(hint);
}

function hasAnyHint(text, hints) {
  const normalizedText = normalizeText(text);

  return hints.some((hint) => normalizedText.includes(normalizeText(hint)));
}

function isKnownNewsDomain(domain) {
  const normalizedDomain = String(domain || '').toLowerCase();

  return KNOWN_NEWS_DOMAIN_HINTS.some((hint) => domainMatchesHint(normalizedDomain, hint));
}

function isLikelyNewsDomain(domain) {
  const normalizedDomain = String(domain || '').toLowerCase();

  if (!normalizedDomain) {
    return false;
  }

  if (isKnownNewsDomain(normalizedDomain)) {
    return true;
  }

  return GENERIC_NEWS_DOMAIN_HINTS.some((hint) => normalizedDomain.includes(hint));
}

function isDisallowedDomain(domain) {
  const normalizedDomain = String(domain || '').toLowerCase();

  if (!normalizedDomain || isKnownNewsDomain(normalizedDomain)) {
    return false;
  }

  return DISALLOWED_DOMAIN_HINTS.some((hint) => domainMatchesHint(normalizedDomain, hint));
}

function dedupeSources(sources) {
  const seen = new Set();
  const unique = [];

  for (const source of sources) {
    const url = normalizeUrl(source?.url);

    if (!url || seen.has(url)) {
      continue;
    }

    seen.add(url);
    unique.push({
      title: String(source?.title || '').trim(),
      url,
      domain: String(source?.domain || '').trim(),
      snippet: String(source?.snippet || '').trim(),
      summary: String(source?.summary || '').trim(),
      year: String(source?.year || '').trim(),
    });
  }

  return unique;
}

function extractGroundingSources(response) {
  const candidate = response?.candidates?.[0];
  const groundingMetadata = candidate?.groundingMetadata;

  if (!groundingMetadata) {
    return [];
  }

  const sources = [];

  for (const chunk of groundingMetadata.groundingChunks || []) {
    const web = chunk?.web || chunk?.retrievedContext || chunk;

    sources.push({
      title: web?.title || web?.displayName || '',
      url: web?.uri || web?.url || '',
      domain: web?.domain || '',
      snippet: '',
      summary: web?.domain || '',
      year: '',
    });
  }

  return dedupeSources(sources);
}

function extractSourceYear(text) {
  const match = String(text || '').match(/\b(?:19|20)\d{2}\b/);
  return match?.[0] || '';
}

function normalizePerplexitySearchResult(source) {
  const url = normalizeUrl(source?.url || source?.link || '');
  const title = String(source?.title || '').trim();
  const snippet = String(source?.snippet || '').trim();
  const sourceLabel = String(source?.source || '').trim();
  const dateLabel = String(source?.date || source?.last_updated || '').trim();

  if (!url && !title) {
    return null;
  }

  return {
    title,
    url,
    domain: sourceLabel || extractDomainFromUrl(url),
    snippet,
    summary: [sourceLabel, dateLabel].filter(Boolean).join(' | '),
    year: extractSourceYear(dateLabel),
  };
}

function normalizePerplexityCitation(source) {
  const url = normalizeUrl(typeof source === 'string' ? source : source?.url || source?.link || '');

  if (!url) {
    return null;
  }

  return {
    title: '',
    url,
    domain: extractDomainFromUrl(url),
    snippet: '',
    summary: '',
    year: '',
  };
}

function extractPerplexitySources(payload) {
  const searchResults = Array.isArray(payload?.search_results)
    ? payload.search_results.map(normalizePerplexitySearchResult).filter(Boolean)
    : [];

  if (searchResults.length > 0) {
    return dedupeSources(searchResults);
  }

  const citations = Array.isArray(payload?.citations)
    ? payload.citations.map(normalizePerplexityCitation).filter(Boolean)
    : [];

  return dedupeSources(citations);
}

function extractUrlFromText(text) {
  const match = String(text || '').match(URL_PATTERN);
  return normalizeUrl(match?.[0] || '');
}

function extractOpenAiMessageText(message) {
  if (typeof message === 'string') {
    return message.trim();
  }

  if (!Array.isArray(message)) {
    return '';
  }

  return message
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }

      return String(part?.text || '').trim();
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function scoreSource(source, parsed) {
  const sourceTitle = normalizeText(source?.title);
  const sourceDomain = normalizeText(source?.domain);
  const targetTitle = normalizeText(parsed?.title);
  const targetSource = normalizeText(parsed?.sourceName);
  let score = 0;

  if (targetTitle && sourceTitle) {
    if (sourceTitle.includes(targetTitle) || targetTitle.includes(sourceTitle)) {
      score += 6;
    } else {
      const overlap = targetTitle
        .split(' ')
        .filter((token) => token.length > 3 && sourceTitle.includes(token)).length;

      score += overlap;
    }
  }

  if (targetSource && (sourceDomain.includes(targetSource) || sourceTitle.includes(targetSource))) {
    score += 4;
  }

  return score;
}

function buildSourceTitleDomainSignature(source) {
  const title = normalizeText(source?.title || '');
  const domain = normalizeText(extractDomainFromUrl(source?.url) || source?.domain || source?.summary || '');

  if (!title && !domain) {
    return '';
  }

  return `${domain}::${title}`;
}

function areEquivalentSourceCandidates(sources) {
  const candidates = (Array.isArray(sources) ? sources : []).filter((source) => source && typeof source === 'object');

  if (candidates.length < 2) {
    return true;
  }

  const reference = candidates[0];
  const referenceUrl = canonicalizeArticleUrl(reference?.url);
  const referenceSignature = buildSourceTitleDomainSignature(reference);

  return candidates.slice(1).every((candidate) => {
    const candidateUrl = canonicalizeArticleUrl(candidate?.url);

    if (referenceUrl && candidateUrl && referenceUrl === candidateUrl) {
      return true;
    }

    const candidateSignature = buildSourceTitleDomainSignature(candidate);
    return Boolean(referenceSignature) && referenceSignature === candidateSignature;
  });
}

function selectPrimarySource(sources, parsed) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return null;
  }

  const scoredSources = sources
    .map((source, index) => ({
      source,
      score: scoreSource(source, parsed),
      index,
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const bestMatch = scoredSources[0] || null;
  const secondBestMatch = scoredSources[1] || null;

  if (!bestMatch || bestMatch.score <= 0) {
    return null;
  }

  const topTiedMatches = scoredSources.filter((entry) => entry.score === bestMatch.score);

  if (topTiedMatches.length > 1 && !areEquivalentSourceCandidates(topTiedMatches.map((entry) => entry.source))) {
    return null;
  }

  return bestMatch.source || null;
}

function findSourceByUrl(sources, url) {
  const normalizedUrl = canonicalizeArticleUrl(url);

  if (!normalizedUrl) {
    return null;
  }

  return (Array.isArray(sources) ? sources : []).find((source) => canonicalizeArticleUrl(source?.url) === normalizedUrl) || null;
}

async function resolveCanonicalUrl(url) {
  const normalized = normalizeUrl(url);

  if (!normalized) {
    return '';
  }

  try {
    const response = await fetch(normalized, {
      method: 'HEAD',
      redirect: 'follow',
    });

    if (response.url) {
      return response.url;
    }
  } catch {
    // Ignore and fall back to GET.
  }

  try {
    const response = await fetch(normalized, {
      method: 'GET',
      redirect: 'follow',
    });

    if (response.url) {
      return response.url;
    }
  } catch {
    return normalized;
  }

  return normalized;
}

function createCanonicalUrlResolver(resolveCanonicalUrlImpl = resolveCanonicalUrl) {
  const cache = new Map();

  return async (url) => {
    const normalizedUrl = normalizeUrl(url);

    if (!normalizedUrl) {
      return '';
    }

    const cacheKey = canonicalizeArticleUrl(normalizedUrl) || normalizedUrl;

    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const resolvedUrl = normalizeUrl(await resolveCanonicalUrlImpl(normalizedUrl)) || normalizedUrl;
    cache.set(cacheKey, resolvedUrl);
    return resolvedUrl;
  };
}

async function prepareSourcesForFinalization({ article = {}, sources = [], resolveCanonicalUrlImpl = resolveCanonicalUrl } = {}) {
  const safeSources = Array.isArray(sources) ? sources : [];
  const primarySource = selectPrimarySource(safeSources, article);

  if (!primarySource) {
    return { article, sources: safeSources };
  }

  const canonicalPrimaryUrl = normalizeUrl(await resolveCanonicalUrlImpl(primarySource?.url));

  if (!canonicalPrimaryUrl) {
    return { article, sources: safeSources };
  }

  return {
    article: {
      ...article,
      url: normalizeUrl(article?.url) || canonicalPrimaryUrl,
    },
    sources: safeSources.map((source) => (source?.url === primarySource?.url ? {
      ...source,
      url: canonicalPrimaryUrl,
    } : source)),
  };
}

async function reconcileCanonicalUrlMatch({ article = {}, sources = [], resolveCanonicalUrlImpl = resolveCanonicalUrl } = {}) {
  const safeSources = Array.isArray(sources) ? sources : [];
  const normalizedArticleUrl = normalizeUrl(article?.url);

  if (!normalizedArticleUrl || findSourceByUrl(safeSources, normalizedArticleUrl)) {
    return {
      article: normalizedArticleUrl ? { ...article, url: normalizedArticleUrl } : article,
      sources: safeSources,
    };
  }

  const resolvedArticleUrl = normalizeUrl(await resolveCanonicalUrlImpl(normalizedArticleUrl)) || normalizedArticleUrl;
  const canonicalArticleUrl = canonicalizeArticleUrl(resolvedArticleUrl);

  if (!canonicalArticleUrl) {
    return {
      article: { ...article, url: normalizedArticleUrl },
      sources: safeSources,
    };
  }

  let normalizedSources = safeSources;

  for (let index = 0; index < safeSources.length; index += 1) {
    const source = normalizedSources[index];
    const rawSourceUrl = normalizeUrl(source?.url);

    if (!rawSourceUrl) {
      continue;
    }

    if (canonicalizeArticleUrl(rawSourceUrl) === canonicalArticleUrl) {
      return {
        article: { ...article, url: resolvedArticleUrl },
        sources: normalizedSources,
      };
    }

    const resolvedSourceUrl = normalizeUrl(await resolveCanonicalUrlImpl(rawSourceUrl)) || rawSourceUrl;

    if (resolvedSourceUrl !== rawSourceUrl) {
      if (normalizedSources === safeSources) {
        normalizedSources = safeSources.slice();
      }

      normalizedSources[index] = {
        ...source,
        url: resolvedSourceUrl,
      };
    }

    if (canonicalizeArticleUrl(resolvedSourceUrl) === canonicalArticleUrl) {
      return {
        article: { ...article, url: resolvedArticleUrl },
        sources: normalizedSources,
      };
    }
  }

  return {
    article: { ...article, url: resolvedArticleUrl },
    sources: normalizedSources,
  };
}

async function finalizeArticleResultWithCanonicalResolution(result, { resolveCanonicalUrlImpl = resolveCanonicalUrl } = {}) {
  const cachedResolver = createCanonicalUrlResolver(resolveCanonicalUrlImpl);
  const { article: preparedArticle, sources: preparedSources } = await prepareSourcesForFinalization({
    article: result.article,
    sources: result.sources,
    resolveCanonicalUrlImpl: cachedResolver,
  });
  const { article, sources } = await reconcileCanonicalUrlMatch({
    article: preparedArticle,
    sources: preparedSources,
    resolveCanonicalUrlImpl: cachedResolver,
  });

  return finalizeArticleResult({
    ...result,
    article,
    sources,
  });
}

function buildValidationEvidence(article, sources, rawText) {
  const sourceEvidence = [
    article?.title,
    article?.sourceName,
    article?.url,
    ...(Array.isArray(sources)
      ? sources.flatMap((source) => [source?.title, source?.domain, source?.url])
      : []),
  ].filter(Boolean).join(' ');

  const modelEvidence = [article?.summary, article?.whyRelevant, rawText].filter(Boolean).join(' ');

  return {
    sourceEvidence,
    modelEvidence,
    combinedEvidence: [sourceEvidence, modelEvidence].filter(Boolean).join(' '),
  };
}

function buildNoMatchResult(result, reason) {
  const message = String(reason || 'לא נמצאה כתבה תואמת מספיק לבקשה.').trim();

  return {
    query: result.originalQuery || result.query,
    provider: result.provider,
    model: result.model,
    credentialSource: result.credentialSource,
    matchStatus: 'no-match',
    noMatchReason: message,
    article: {
      title: 'לא נמצאה כתבה מתאימה',
      summary: message,
      sourceName: '',
      whyRelevant: '',
      url: '',
    },
    sources: result.sources,
    rawText: result.rawText,
  };
}

function buildGroundedArticle(primarySource) {
  const normalizedArticleUrl = normalizeUrl(primarySource?.url || '');

  return {
    title: String(primarySource?.title || normalizedArticleUrl || 'כתבה מאומתת').trim(),
    summary: String(primarySource?.snippet || '').trim(),
    sourceName: String(primarySource?.summary || extractDomainFromUrl(primarySource?.url) || '').trim(),
    whyRelevant: '',
    url: normalizedArticleUrl,
  };
}

function finalizeArticleResult(result) {
  const queryMeta = result.queryMeta || analyzeQuery(result.originalQuery || result.query);
  const requestedMatchStatus = normalizeMatchStatus(result.rawMatchStatus);
  const requestedNoMatchReason = String(result.rawNoMatchReason || '').trim();

  if (requestedMatchStatus === 'no-match') {
    return buildNoMatchResult(result, requestedNoMatchReason);
  }

  const groundedParsedSource = findSourceByUrl(result.sources, result.article?.url);
  const primarySource = groundedParsedSource || selectPrimarySource(result.sources, result.article);

  if (!primarySource) {
    return buildNoMatchResult(result, 'לא התקבל מקור מאומת לכתבה עצמה.');
  }

  const article = buildGroundedArticle(primarySource);
  const validationError = validateArticleCandidate(queryMeta, article, result.sources, '');

  if (validationError) {
    return buildNoMatchResult({ ...result, article }, validationError);
  }

  return {
    query: result.originalQuery || result.query,
    provider: result.provider,
    model: result.model,
    credentialSource: result.credentialSource,
    matchStatus: 'match',
    noMatchReason: '',
    article,
    sources: result.sources,
    rawText: result.rawText,
  };
}

async function fetchArticleWithStrategy({
  query = '',
  provider = DEFAULT_PROVIDER,
  modelOverride = '',
  queryMeta = null,
  fetchGeminiImpl = fetchGeminiArticle,
  fetchPerplexityImpl = fetchPerplexityArticle,
} = {}) {
  const normalizedProvider = normalizeProvider(provider);
  const trimmedQuery = String(query || '').trim();
  const resolvedQueryMeta = queryMeta || {
    ...analyzeQuery(trimmedQuery),
    originalQuery: trimmedQuery,
  };
  const fallbackQuery = buildNewsSiteBiasedArticleQuery(trimmedQuery, resolvedQueryMeta);
  const searchQueries = fallbackQuery && fallbackQuery !== trimmedQuery ? [trimmedQuery, fallbackQuery] : [trimmedQuery];
  let lastResult = null;

  for (const searchQuery of searchQueries) {
    lastResult = normalizedProvider === 'perplexity'
      ? await fetchPerplexityImpl(searchQuery, modelOverride, resolvedQueryMeta)
      : await fetchGeminiImpl(searchQuery, modelOverride, resolvedQueryMeta);

    if (lastResult?.matchStatus === 'match') {
      return lastResult;
    }
  }

  return lastResult;
}

function isAllowedOrigin(origin) {
  return !origin || LOOPBACK_ORIGINS.has(origin) || DEV_LOOPBACK_ORIGIN_PATTERN.test(origin);
}

function buildCorsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    Vary: 'Origin',
  };

  if (origin && isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

async function fetchGeminiArticle(query, modelOverride = '', queryMeta = analyzeQuery(query)) {
  const trimmedQuery = String(query || '').trim();

  if (!trimmedQuery) {
    throw new Error('חסר טקסט לבקשת הכתבה.');
  }

  const credentials = resolveGeminiCredentials(modelOverride);
  const genAI = new GoogleGenerativeAI(credentials.key);
  const model = genAI.getGenerativeModel({
    model: credentials.model || DEFAULT_MODEL,
    tools: [{ googleSearch: {} }],
  });

  const result = await model.generateContent(buildPrompt(trimmedQuery, 'gemini', queryMeta));
  const response = result.response;
  const rawText = String(response?.text?.() || '').trim();
  const parsed = parseLooseJson(rawText);
  const parsedUrl = normalizeUrl(parsed?.url);
  const sources = extractGroundingSources(response);
  const primarySource = selectPrimarySource(sources, parsed);

  return finalizeArticleResultWithCanonicalResolution({
    query: trimmedQuery,
    originalQuery: queryMeta.originalQuery || trimmedQuery,
    queryMeta,
    provider: 'gemini',
    model: credentials.model || DEFAULT_MODEL,
    credentialSource: credentials.sourceKind,
    rawMatchStatus: parsed?.matchStatus,
    rawNoMatchReason: parsed?.noMatchReason,
    article: {
      title: String(parsed.title || primarySource?.title || 'לא זוהתה כותרת').trim(),
      summary: String(parsed.summary || rawText || '').trim(),
      sourceName: String(parsed.sourceName || primarySource?.domain || '').trim(),
      whyRelevant: String(parsed.whyRelevant || '').trim(),
      url: parsedUrl,
    },
    sources,
    rawText,
  });
}

async function fetchPerplexityArticle(query, modelOverride = '', queryMeta = analyzeQuery(query)) {
  const trimmedQuery = String(query || '').trim();

  if (!trimmedQuery) {
    throw new Error('חסר טקסט לבקשת הכתבה.');
  }

  const credentials = resolvePerplexityCredentials(modelOverride);
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${credentials.key}`,
    },
    body: JSON.stringify({
      model: credentials.model || DEFAULT_PERPLEXITY_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Return JSON only. Prefer one grounded journalistic news article from a news site when the request asks for a כתבה. Reject official press releases, institute analysis pages, blogs, social posts, videos, and category pages. If no sufficiently matching article exists, return matchStatus=no-match.',
        },
        {
          role: 'user',
          content: buildPrompt(trimmedQuery, 'perplexity', queryMeta),
        },
      ],
      max_tokens: 600,
      temperature: 0,
      stream: false,
      disable_search: false,
      web_search_options: {
        search_mode: 'web',
      },
      return_related_questions: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Perplexity request failed: HTTP ${response.status} ${String(text || '').slice(0, 300)}`);
  }

  const payload = await response.json();
  const rawText = extractOpenAiMessageText(payload?.choices?.[0]?.message?.content);
  const parsed = parseLooseJson(rawText);
  const parsedUrl = normalizeUrl(parsed?.url || extractUrlFromText(rawText));
  const sources = extractPerplexitySources(payload);
  const primarySource = selectPrimarySource(sources, parsed);

  return finalizeArticleResultWithCanonicalResolution({
    query: trimmedQuery,
    originalQuery: queryMeta.originalQuery || trimmedQuery,
    queryMeta,
    provider: 'perplexity',
    model: credentials.model || DEFAULT_PERPLEXITY_MODEL,
    credentialSource: credentials.sourceKind,
    rawMatchStatus: parsed?.matchStatus,
    rawNoMatchReason: parsed?.noMatchReason,
    article: {
      title: String(parsed.title || primarySource?.title || 'לא זוהתה כותרת').trim(),
      summary: String(parsed.summary || rawText || '').trim(),
      sourceName: String(parsed.sourceName || primarySource?.domain || '').trim(),
      whyRelevant: String(parsed.whyRelevant || '').trim(),
      url: parsedUrl,
    },
    sources,
    rawText,
  });
}

async function fetchArticle(query, provider = DEFAULT_PROVIDER, modelOverride = '') {
  const trimmedQuery = String(query || '').trim();
  return fetchArticleWithStrategy({
    query: trimmedQuery,
    provider,
    modelOverride,
    queryMeta: {
    ...analyzeQuery(trimmedQuery),
    originalQuery: trimmedQuery,
    },
  });
}

function sendJson(res, statusCode, payload, origin = '') {
  const body = JSON.stringify(payload, null, 2);

  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...buildCorsHeaders(origin),
  });

  res.end(body);
}

function sendHtml(res) {
  const body = fs.readFileSync(HTML_PATH, 'utf8');

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });

  res.end(body);
}

function collectRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;

      if (body.length > 1_000_000) {
        reject(new Error('Request body too large.'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function handleApiArticle(req, res) {
  try {
    const body = await collectRequestBody(req);
    const data = JSON.parse(body || '{}');
    const result = await fetchArticle(data.query, data.provider, data.model);
    sendJson(res, 200, { ok: true, ...result }, String(req.headers.origin || ''));
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, String(req.headers.origin || ''));
  }
}

function createServer() {
  const httpsOptions = getHttpsOptions();
  const requestListener = async (req, res) => {
    if (!req.url) {
      sendJson(res, 404, { ok: false, error: 'Missing URL.' }, String(req.headers.origin || ''));
      return;
    }

    const origin = String(req.headers.origin || '').trim();

    if (req.method === 'OPTIONS') {
      if (!isAllowedOrigin(origin)) {
        sendJson(res, 403, { ok: false, error: 'Origin not allowed.' }, origin);
        return;
      }

      res.writeHead(204, {
        ...buildCorsHeaders(origin),
      });
      res.end();
      return;
    }

    if (!isAllowedOrigin(origin)) {
      sendJson(res, 403, { ok: false, error: 'Origin not allowed.' }, origin);
      return;
    }

    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      sendHtml(res);
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      try {
        const credentials = resolveGeminiCredentials();
        sendJson(res, 200, {
          ok: true,
          hasGeminiKey: true,
          credentialSource: credentials.sourceKind,
          model: credentials.model || DEFAULT_MODEL,
        }, origin);
      } catch (error) {
        sendJson(res, 200, {
          ok: false,
          hasGeminiKey: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }, origin);
      }

      return;
    }

    if (req.method === 'POST' && req.url === '/api/article') {
      await handleApiArticle(req, res);
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found.' }, origin);
  };

  return {
    protocol: httpsOptions ? 'https' : 'http',
    server: httpsOptions
      ? https.createServer(httpsOptions, requestListener)
      : http.createServer(requestListener),
  };
}

function parseSelfTestArgs(args) {
  let provider = DEFAULT_PROVIDER;
  let model = '';
  const queryParts = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--provider' && args[index + 1]) {
      provider = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--model' && args[index + 1]) {
      model = args[index + 1];
      index += 1;
      continue;
    }

    queryParts.push(arg);
  }

  return {
    model,
    provider,
    query: queryParts.join(' ').trim(),
  };
}

async function runSelfTest(query, provider = DEFAULT_PROVIDER, model = '') {
  const result = await fetchArticle(query || 'כתבה עדכנית על בינה מלאכותית', provider, model);

  console.log(
    JSON.stringify(
      {
        ok: true,
        provider: result.provider,
        matchStatus: result.matchStatus,
        noMatchReason: result.noMatchReason,
        title: result.article.title,
        url: result.article.url,
        sourceName: result.article.sourceName,
        model: result.model,
        credentialSource: result.credentialSource,
        sourceCount: result.sources.length,
      },
      null,
      2,
    ),
  );
}

async function main() {
  if (process.argv[2] === '--self-test') {
    const selfTestArgs = parseSelfTestArgs(process.argv.slice(3));
    await runSelfTest(selfTestArgs.query, selfTestArgs.provider, selfTestArgs.model);
    return;
  }

  const { server, protocol } = createServer();

  server.listen(DEFAULT_PORT, '127.0.0.1', () => {
    console.log(`Article check server is running on ${protocol}://localhost:${DEFAULT_PORT}`);
  });
}

const isDirectExecution = process.argv[1]
  ? path.resolve(process.argv[1]) === __filename
  : false;

export {
  buildGroundedArticle,
  extractPerplexitySources,
  fetchArticleWithStrategy,
  finalizeArticleResult,
  finalizeArticleResultWithCanonicalResolution,
};

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}