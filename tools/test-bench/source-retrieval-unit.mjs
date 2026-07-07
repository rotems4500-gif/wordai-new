// ============================================================================
// source-retrieval-unit.mjs — בדיקות offline למודול sourceRetrieval (בלי מפתחות, בלי רשת).
// טרנספורט אימות ה-URL מוזרק (mock), ספקי החיפוש לא נקראים (retrieveSources נבדק דרך
// cache/budget בלבד). מריצים:
//   npx vite build --config vite.verify.config.mjs   (עם WORDAI_VERIFY_ENTRY=unit)
//   node <scratch>/verify/out-sf/sf.mjs
// ============================================================================

// ---- browser shims מינימליים ----
globalThis.window = globalThis;
globalThis.self = globalThis;
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};

import {
  verifyUrls,
  setUrlVerifierTransport,
  lockSources,
  SourceLock,
  auditTextAgainstAllowedUrls,
  SOURCE_GROUNDING_FAILURE_TOKEN,
  createRetrievalSession,
  retrieveSources,
  formatSourcesReply,
  canonicalizeSourceUrl,
} from 'srcretr';

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) console.log(`  ✓ ${name}`);
  else { failures += 1; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

// ---- 1. urlVerifier: verdict policy ----
console.log('\n[1] urlVerifier verdicts');
const baseTransport = async (urls) => urls.map((url) => {
  if (url.includes('dead')) return { url, ok: false, status: 404, finalUrl: '' };
  if (url.includes('blocked')) return { url, ok: false, status: 403, finalUrl: url };
  if (url.includes('redirect')) return { url, ok: true, status: 200, finalUrl: 'https://real-news.co.il/article/2026/story.html' };
  return { url, ok: true, status: 200, finalUrl: url };
});
setUrlVerifierTransport(baseTransport);
{
  const verdicts = await verifyUrls([
    'https://ok.example-site.co.il/a/b',
    'https://dead.site.com/x',
    'https://blocked.paywall.com/y',
    'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc',
  ]);
  check('חי → ok', verdicts[0].ok && !verdicts[0].dead);
  check('404 → dead', verdicts[1].dead && !verdicts[1].botBlocked);
  check('403 → botBlocked, לא dead', verdicts[2].botBlocked && !verdicts[2].dead);
  check('redirect → finalUrl אמיתי', verdicts[3].finalUrl === 'https://real-news.co.il/article/2026/story.html');
}

// ---- 1b. fail-open: תקלת טרנספורט ≠ קישור מת ----
console.log('\n[1b] fail-open on transport failure');
setUrlVerifierTransport(async () => { throw new Error('transport down'); });
{
  const verdicts = await verifyUrls(['https://real-site.co.il/article/2026/x']);
  check('טרנספורט נפל → לא-מאומת (נשמר), לא מת', verdicts[0].botBlocked && !verdicts[0].dead);
}
setUrlVerifierTransport(baseTransport);

// ---- 2. SourceLock: audit ----
console.log('\n[2] SourceLock audit');
{
  const sources = [
    { title: 'מאמר א', url: 'https://www.haaretz.co.il/news/2026-01-01/article1?utm_source=x', finalUrl: 'https://www.haaretz.co.il/news/2026-01-01/article1' },
    { title: 'מאמר ב', url: 'https://ynet.co.il/articles/abc', finalUrl: 'https://ynet.co.il/articles/abc' },
  ];
  const lock = lockSources(sources, { runId: 'test' });
  check('groundingPrompt כולל את המקורות', lock.groundingPrompt.includes('haaretz.co.il'));

  // URL מותר (עם פרמטר utm — קנוניזציה אמורה להשוות) נשאר; זר נמחק.
  const audited = lock.auditResponse(
    'טענה א (https://www.haaretz.co.il/news/2026-01-01/article1) וטענה ב https://fake-invented.com/made-up.',
  );
  check('URL מאומת נשאר', audited.text.includes('haaretz.co.il'));
  check('URL מומצא נמחק', !audited.text.includes('fake-invented.com'));
  check('strippedUrls מדווח', audited.strippedUrls.length === 1);

  // חוק קשיח: ויקיפדיה נמחקת גם אם היא ברשימת ה-allowedUrls (blocklist אוניברסלי).
  const wikiAudit = auditTextAgainstAllowedUrls(
    'ראו הרחבה https://he.wikipedia.org/wiki/נושא וגם https://www.haaretz.co.il/news/2026-01-01/article1',
    { allowedUrls: new Set(['https://he.wikipedia.org/wiki/נושא', 'https://www.haaretz.co.il/news/2026-01-01/article1']) },
  );
  check('ויקיפדיה נמחקת גם כשהיא allowed', !wikiAudit.text.includes('wikipedia.org'));
  check('מקור לגיטימי נשאר לצד חסימת ויקיפדיה', wikiAudit.text.includes('haaretz.co.il'));

  // serialize → from: שורד continuation plumbing.
  const revived = SourceLock.from(JSON.parse(JSON.stringify(lock.serialize())));
  check('serialize/from משמר allowedUrls', revived.allowedUrls.size === lock.allowedUrls.size);

  // בקשת-מקורות טהורה בלי מקורות: פלט עם URL ⇒ חסימה.
  const emptyLock = lockSources([], { runId: 'test2' });
  const blocked = emptyLock.auditResponse('הנה מקור: https://invented.example-fake.org/paper', { blockWhenNoneVerified: true });
  check('פלט עם URL בלי מקורות מאומתים נחסם', blocked.blocked && blocked.text.startsWith(SOURCE_GROUNDING_FAILURE_TOKEN));

  // הקשר מסמך: לא חוסמים, רק מנקים + מסירים טוקן כישלון.
  const docAudit = emptyLock.auditResponse(`פסקה טובה. [דרוש מקור] ${SOURCE_GROUNDING_FAILURE_TOKEN} https://invented.fake.org/x`);
  check('הקשר מסמך: prose נשמר, URL זר + טוקן הוסרו', docAudit.text.includes('פסקה טובה') && !docAudit.text.includes('fake.org') && !docAudit.text.includes(SOURCE_GROUNDING_FAILURE_TOKEN));

  const bibliographicLock = lockSources([{ title: 'מאמר אמיתי בלי URL', doi: '10.1234/example.2026', year: '2026' }], { runId: 'bib' });
  check('SourceLock שומר מקור ביבליוגרפי בלי URL', bibliographicLock.sources.length === 1 && bibliographicLock.groundingPrompt.includes('ללא URL זמין'));
  check('SourceLock מחייב שילוב מקורות בגוף המסמך', bibliographicLock.groundingPrompt.includes('אל תחזיר רשימת מקורות בלבד') && bibliographicLock.groundingPrompt.includes('בגוף המסמך'));
}

// ---- 3. canonicalizeSourceUrl ----
console.log('\n[3] canonicalize');
{
  const a = canonicalizeSourceUrl('https://www.ynet.co.il/articles/abc?utm_source=tw&fbclid=123#frag');
  const b = canonicalizeSourceUrl('https://www.ynet.co.il/articles/abc');
  check('פרמטרי מעקב + hash מוסרים', a === b, `${a} != ${b}`);
}

// ---- 4. RetrievalSession: cache + budget (בלי רשת: אין ספקים ב-cfg) ----
console.log('\n[4] session cache + budget');
{
  const session = createRetrievalSession({ runId: 'unit', budget: { maxQueries: 1 } });
  const first = await retrieveSources({ query: 'נושא לדוגמה', kind: 'web', cfg: {}, session });
  check('בלי ספקים → no-provider', first.ok === false && first.failureReason === 'no-provider');
  const second = await retrieveSources({ query: 'נושא אחר לגמרי', kind: 'web', cfg: {}, session });
  check('תקציב שאילתות אכוף', second.failureReason === 'budget-exhausted');
}

// ---- 5. retrieveSources end-to-end עם ספק מדומה (דרך cfg של perplexity + fetch mock) ----
console.log('\n[5] pipeline e2e (mock provider)');
{
  // mock fetch של Perplexity: בסביבת "ווב" (בלי desktopApp) perplexity עובר דרך ה-relay
  // /api/proxy, שמחזיר { ok, status, body } כשה-body הוא ה-JSON של Perplexity כמחרוזת.
  const perplexityPayload = {
    search_results: [
      { title: 'כתבה אמיתית', url: 'https://ok.news-site.co.il/article/2026/good', snippet: 'תקציר', date: '2026-05-01' },
      { title: 'כתבה עם קישור מת', url: 'https://dead.news-site.co.il/gone', snippet: '', date: '2026-05-01' },
      { title: 'מאמר ביבליוגרפי בלי קישור', snippet: 'מחקר אמיתי מתוך metadata', date: '2026' },
    ],
    citations: ['https://model-invented.com/should-be-ignored'],
  };
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, status: 200, body: JSON.stringify(perplexityPayload) }),
    text: async () => '',
  });
  const session = createRetrievalSession({ runId: 'e2e' });
  const result = await retrieveSources({
    query: 'השפעת בינה מלאכותית על שוק העבודה',
    kind: 'web',
    count: 5,
    cfg: { perplexity: { key: 'pplx-test', model: 'sonar' } },
    session,
  });
  check('אחזור הצליח', result.ok === true, JSON.stringify(result.failureReason || ''));
  check('קישור חי נשאר, מת נופה, מקור בלי URL נשמר', result.sources.length === 2
    && result.sources.some((source) => source.url?.includes('ok.news-site'))
    && result.sources.some((source) => source.verification?.missingUrl === true));
  check('citations של המודל לא נכנסו', !JSON.stringify(result.sources).includes('model-invented'));
  check('verification מוצמד', Boolean(result.sources[0]?.verification?.httpStatus === 200));

  // cache hit: אותה שאילתה ⇒ אפס קריאות ספק נוספות.
  const before = session.stats().providerCalls;
  const again = await retrieveSources({
    query: 'השפעת בינה מלאכותית על שוק העבודה',
    kind: 'web',
    count: 5,
    cfg: { perplexity: { key: 'pplx-test', model: 'sonar' } },
    session,
  });
  check('cache hit באותה שאילתה', again.fromCache === true && session.stats().providerCalls === before);

  const reply = formatSourcesReply({ query: 'בדיקה', sources: result.sources, kind: 'web', providerTrail: result.providerTrail });
  check('formatSourcesReply מכיל את הקישור', reply.includes('ok.news-site.co.il'));
}

// ---- 6. after-date filter: מקור ישן מהסף נזרק, חדש נשאר, חסר-שנה נשאר ----
console.log('\n[6] after-date filter');
{
  const dated = {
    search_results: [
      { title: 'חדש', url: 'https://ok.a.co.il/2026/new', snippet: 't', date: '2026-03-01' },
      { title: 'ישן', url: 'https://ok.b.co.il/2019/old', snippet: 't', date: '2019-03-01' },
      { title: 'בלי שנה', url: 'https://ok.c.co.il/x', snippet: 't', date: '' },
    ],
  };
  globalThis.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ ok: true, status: 200, body: JSON.stringify(dated) }),
    text: async () => '',
  });
  const session = createRetrievalSession({ runId: 'date' });
  const result = await retrieveSources({
    query: 'נושא עם דרישת תאריך', kind: 'web', count: 5, after: '2022-01-01',
    cfg: { perplexity: { key: 'pplx-test', model: 'sonar' } }, session,
  });
  const urls = JSON.stringify(result.sources);
  check('מקור מ-2026 נשאר', urls.includes('2026/new'));
  check('מקור מ-2019 (לפני הסף) נזרק', !urls.includes('2019/old'));
  check('מקור בלי שנה נשאר (אי אפשר להוכיח שישן)', urls.includes('ok.c.co.il'));
}

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
