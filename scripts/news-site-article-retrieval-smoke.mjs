import assert from 'node:assert/strict';

import {
  extractPerplexitySources,
  fetchArticleWithStrategy,
  finalizeArticleResult,
} from './gemini-article-check-server.mjs';

const buildQueryMeta = ({ focusPhrase = '', focusTokens = [], years = [] } = {}) => ({
  expectsNewsArticle: true,
  years: [...years],
  focusPhrase,
  focusTokens: [...focusTokens],
});

const buildResultInput = ({
  query,
  queryMeta,
  article = {},
  sources = [],
  rawText = '',
  rawMatchStatus = '',
  rawNoMatchReason = '',
} = {}) => ({
  query,
  originalQuery: query,
  queryMeta,
  provider: 'perplexity',
  model: 'smoke-model',
  credentialSource: 'smoke',
  rawMatchStatus,
  rawNoMatchReason,
  article,
  sources,
  rawText,
});

const runCase = async (name, run) => {
  await run();
  console.log(`PASS ${name}`);
};

await runCase('hallucinated-topic-does-not-pass', async () => {
  const query = 'article about autonomous driving regulation';
  const sources = extractPerplexitySources({
    search_results: [
      {
        title: 'Weather improves across Europe',
        url: 'https://www.reuters.com/world/europe/weather-improves-across-europe-2024-05-01/',
        snippet: 'Storms ease across France and Germany.',
        source: 'Reuters',
        date: '2024-05-01',
      },
    ],
  });

  const result = finalizeArticleResult(buildResultInput({
    query,
    queryMeta: buildQueryMeta({
      focusPhrase: 'autonomous driving regulation',
      focusTokens: ['autonomous', 'driving', 'regulation'],
    }),
    article: {
      title: 'Autonomous driving regulation update',
      summary: 'Autonomous driving regulation changes are accelerating.',
      sourceName: 'Reuters',
      whyRelevant: 'This exactly matches autonomous driving regulation.',
      url: 'https://www.reuters.com/world/europe/weather-improves-across-europe-2024-05-01/',
    },
    sources,
    rawText: 'Autonomous driving regulation changes are accelerating.',
  }));

  assert.equal(result.matchStatus, 'no-match');
});

await runCase('url-digits-alone-do-not-satisfy-year', async () => {
  const query = 'article about Tesla sales in 2024';
  const sources = extractPerplexitySources({
    search_results: [
      {
        title: 'Tesla sales drop in Europe',
        url: 'https://edition.cnn.com/2024/05/01/business/tesla-sales-drop/index.html',
        snippet: 'Demand weakens again across key markets.',
        source: 'CNN',
      },
    ],
  });

  const result = finalizeArticleResult(buildResultInput({
    query,
    queryMeta: buildQueryMeta({
      focusPhrase: 'Tesla sales',
      focusTokens: ['tesla', 'sales'],
      years: ['2024'],
    }),
    article: {
      title: 'Tesla sales in 2024 keep falling',
      summary: 'This claims to satisfy 2024 from the URL.',
      sourceName: 'CNN',
      whyRelevant: 'Model-only year mention should not help.',
      url: 'https://edition.cnn.com/2024/05/01/business/tesla-sales-drop/index.html',
    },
    sources,
    rawText: 'Model-only year mention should not help.',
  }));

  assert.equal(result.matchStatus, 'no-match');
});

await runCase('unrelated-gathered-source-cannot-validate-displayed-article', async () => {
  const query = 'article about Nvidia chips';
  const primaryUrl = 'https://www.reuters.com/world/europe/weather-improves-across-europe-2024-05-01/';
  const sources = extractPerplexitySources({
    search_results: [
      {
        title: 'Weather improves across Europe',
        url: primaryUrl,
        snippet: 'Storms ease across France and Germany.',
        source: 'Reuters',
        date: '2024-05-01',
      },
      {
        title: 'Nvidia chips demand surges',
        url: 'https://apnews.com/article/nvidia-chips-demand-surges',
        snippet: 'Demand for Nvidia chips is rising quickly.',
        source: 'AP News',
        date: '2024-05-02',
      },
    ],
  });

  const result = finalizeArticleResult(buildResultInput({
    query,
    queryMeta: buildQueryMeta({
      focusPhrase: 'Nvidia chips',
      focusTokens: ['nvidia', 'chips'],
    }),
    article: {
      title: 'Nvidia chips demand surges',
      summary: 'Hallucinated selection should not borrow another source.',
      sourceName: 'Reuters',
      whyRelevant: 'Another gathered source is related, but the displayed one is not.',
      url: primaryUrl,
    },
    sources,
    rawText: 'Another gathered source is related, but the displayed one is not.',
  }));

  assert.equal(result.matchStatus, 'no-match');
});

await runCase('displayed-verified-fields-stay-grounded-only', async () => {
  const query = 'article about Nvidia chips in 2024';
  const groundedUrl = 'https://www.reuters.com/technology/nvidia-chips-demand-grows-2024-05-01/';
  const sources = extractPerplexitySources({
    search_results: [
      {
        title: 'Nvidia chips demand grows',
        url: groundedUrl,
        snippet: 'Nvidia chips demand rises sharply in 2024.',
        source: 'Reuters',
        date: '2024-05-01',
      },
    ],
  });

  assert.equal(sources[0].summary, 'Reuters | 2024-05-01');
  assert.equal(sources[0].year, '2024');

  const result = finalizeArticleResult(buildResultInput({
    query,
    queryMeta: buildQueryMeta({
      focusPhrase: 'Nvidia chips',
      focusTokens: ['nvidia', 'chips'],
      years: ['2024'],
    }),
    article: {
      title: 'Hallucinated title from model',
      summary: 'Hallucinated summary from model',
      sourceName: 'Fake Source',
      whyRelevant: 'Hallucinated whyRelevant from model',
      url: groundedUrl,
    },
    sources,
    rawText: 'Hallucinated raw model text.',
  }));

  assert.equal(result.matchStatus, 'match');
  assert.equal(result.article.title, 'Nvidia chips demand grows');
  assert.equal(result.article.summary, 'Nvidia chips demand rises sharply in 2024.');
  assert.equal(result.article.sourceName, 'Reuters | 2024-05-01');
  assert.equal(result.article.whyRelevant, '');
});

await runCase('explicit-gemini-does-not-fall-through-to-perplexity', async () => {
  let geminiCalls = 0;
  let perplexityCalls = 0;

  await assert.rejects(
    fetchArticleWithStrategy({
      query: 'article about Nvidia chips',
      provider: 'gemini',
      fetchGeminiImpl: async () => {
        geminiCalls += 1;
        throw new Error('Gemini unavailable');
      },
      fetchPerplexityImpl: async () => {
        perplexityCalls += 1;
        return { matchStatus: 'match' };
      },
    }),
    /Gemini unavailable/u,
  );

  assert.equal(geminiCalls, 1);
  assert.equal(perplexityCalls, 0);
});

console.log('PASS news-site-article-retrieval-smoke');