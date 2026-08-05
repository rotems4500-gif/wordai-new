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
  nonContentPageReason,
  setVetModelTransport,
  buildSourcesQueryOverride,
  buildHoleFillSourceQueryOverride,
  setTranslateModelTransport,
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
  // לא sources[0]: הצינור מחזיר קודם מקור ביבליוגרפי בלי URL (נשמר בכוונה, בלי httpStatus).
  check('verification מוצמד', result.sources.some((source) => source.verification?.httpStatus === 200));

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

// ---- 7. contentPageFilter: דפי לא-תוכן נפסלים, תוכן אמיתי עובר ----
console.log('\n[7] contentPageFilter');
{
  check('דף מאגרי-מידע של ספרייה נפסל',
    Boolean(nonContentPageReason({ url: 'https://med-lib.tau.ac.il/dbforoccupationaltherapy', title: 'מאגרי מידע וכלי מחקר | הספרייה' })));
  check('דף בית (URL שורש) נפסל',
    Boolean(nonContentPageReason({ url: 'https://matanhakimi.com/', title: 'דף הבית' })));
  check('אינדקס כתבי-עת רדוד נפסל',
    Boolean(nonContentPageReason({ url: 'https://example.ac.il/journals', title: 'רשימת כתבי עת' })));
  check('מאמר עמוק עובר',
    nonContentPageReason({ url: 'https://www.jipts.com/article/4-21skira.pdf', title: 'סקירת ספרות שיטתית' }) === '');
  check('מועמד עם DOI מוגן גם ב-URL רדוד',
    nonContentPageReason({ url: 'https://journal.org/home', title: 'Journal home', doi: '10.1/x' }) === '');
  check('מועמד עם citedBy מוגן',
    nonContentPageReason({ url: 'https://scholar.site/index', title: 'Index', citedBy: 12 }) === '');
  check('כתבת תוכן בעומק 1 עוברת (רלוונטיות היא לא תפקיד הפילטר)',
    nonContentPageReason({ url: 'https://rambam-medicine.org.il/better-muscle-protocol/', title: 'האם עדיף להתאמן מעט כל יום' }) === '');
}

// ---- 8. pipeline + contentPageFilter: דף ספרייה חי לא נכנס לתוצאות ----
console.log('\n[8] pipeline drops non-content pages');
{
  const payload = {
    search_results: [
      { title: 'מאמר אמיתי על הרגלי למידה', url: 'https://ok.journal.co.il/articles/2026/study-habits', snippet: 'תקציר', date: '2026-01-01' },
      { title: 'מאגרי מידע | הספרייה', url: 'https://ok.med-lib.tau.ac.il/dbforstudents', snippet: '', date: '' },
      { title: 'אתר כלשהו', url: 'https://ok.some-site.co.il/', snippet: '', date: '' },
    ],
  };
  globalThis.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ ok: true, status: 200, body: JSON.stringify(payload) }),
    text: async () => '',
  });
  const session = createRetrievalSession({ runId: 'noncontent' });
  const result = await retrieveSources({
    query: 'הרגלי למידה של סטודנטים', kind: 'web', count: 5,
    cfg: { perplexity: { key: 'pplx-test', model: 'sonar' } }, session,
  });
  const urls = JSON.stringify(result.sources);
  check('אחזור הצליח', result.ok === true, JSON.stringify(result.failureReason || ''));
  check('המאמר האמיתי נשאר', urls.includes('study-habits'));
  check('דף הספרייה נזרק', !urls.includes('med-lib'));
  check('URL שורש נזרק', !urls.includes('some-site.co.il'));
}

// ---- 9. relevanceVet (מאחורי דגל): מסנן לפי המודל, fail-open על שגיאה ----
console.log('\n[9] relevance vetting (flagged)');
{
  const payload = {
    search_results: [
      { title: 'מאמר על הרגלי למידה', url: 'https://ok.a.co.il/articles/2026/learning', snippet: 't', date: '2026-01-01' },
      { title: 'בלוג כושר', url: 'https://ok.b.co.il/articles/2022/muscles', snippet: 't', date: '2022-01-01' },
      { title: 'בלוג יומנים', url: 'https://ok.c.co.il/articles/2024/journaling', snippet: 't', date: '2024-01-01' },
    ],
  };
  globalThis.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ ok: true, status: 200, body: JSON.stringify(payload) }),
    text: async () => '',
  });

  setVetModelTransport(async () => '[0]');
  const vetted = await retrieveSources({
    query: 'הרגלי למידה של סטודנטים', kind: 'web', count: 5, vetRelevance: true,
    cfg: { perplexity: { key: 'pplx-test', model: 'sonar' } },
    session: createRetrievalSession({ runId: 'vet1' }),
  });
  check('המודל השאיר רק את הרלוונטי', vetted.ok && vetted.sources.length === 1 && vetted.sources[0].url.includes('learning'));

  setVetModelTransport(async () => { throw new Error('vet model down'); });
  const failOpen = await retrieveSources({
    query: 'הרגלי למידה של סטודנטים', kind: 'web', count: 5, vetRelevance: true,
    cfg: { perplexity: { key: 'pplx-test', model: 'sonar' } },
    session: createRetrievalSession({ runId: 'vet2' }),
  });
  check('fail-open: כשל ווטינג משאיר את כולם', failOpen.ok && failOpen.sources.length === 3);

  setVetModelTransport(null);
  const defaultOff = await retrieveSources({
    query: 'הרגלי למידה של סטודנטים', kind: 'web', count: 5,
    cfg: { perplexity: { key: 'pplx-test', model: 'sonar' } },
    session: createRetrievalSession({ runId: 'vet3' }),
  });
  check('ברירת מחדל: ווטינג כבוי, כל המקורות נשארים', defaultOff.ok && defaultOff.sources.length === 3);
}

// ---- 10. continue-ladder: ספק ראשון דל אחרי סינון ⇒ ממשיכים לספק הבא ומאחדים ----
console.log('\n[10] continue ladder on insufficient results');
{
  const scholarPayload = {
    search_metadata: { status: 'success' },
    organic_results: [
      { title: 'Scholarly article on study habits', link: 'https://ok.scholar-a.org/articles/2026/habits', snippet: 'abstract' },
    ],
  };
  const perplexityPayload = {
    search_results: [
      { title: 'מאמר נוסף', url: 'https://ok.journal-b.co.il/articles/2026/more', snippet: 't', date: '2026-01-01' },
      { title: 'מאמר שלישי', url: 'https://ok.journal-c.co.il/articles/2025/third', snippet: 't', date: '2025-01-01' },
    ],
  };
  globalThis.fetch = async (url, init) => {
    const probe = `${String(url || '')} ${String(init?.body || '')}`;
    const body = probe.includes('serpapi') ? scholarPayload : perplexityPayload;
    return {
      ok: true, status: 200,
      json: async () => ({ ok: true, status: 200, body: JSON.stringify(body) }),
      text: async () => '',
    };
  };
  const session = createRetrievalSession({ runId: 'ladder' });
  const result = await retrieveSources({
    query: 'study habits of students', kind: 'academic', count: 5,
    cfg: { scholar: { provider: 'serpapi', key: 'serp-test' }, perplexity: { key: 'pplx-test', model: 'sonar' } },
    session,
  });
  const urls = JSON.stringify(result.sources);
  check('אחזור הצליח', result.ok === true, JSON.stringify(result.failureReason || ''));
  check('תוצאת Scholar הדלה נשמרה', urls.includes('scholar-a.org'));
  check('הסולם המשיך ל-Perplexity והתוצאות אוחדו', urls.includes('journal-b') && result.sources.length >= 2);
  const trailProviders = result.providerTrail.map((step) => step.providerId);
  check('providerTrail מתעד את שני הספקים', trailProviders.includes('serpapi-scholar') && trailProviders.includes('perplexity-search'));
}

// ---- 11. sourceQueryBuilder: "מה שסימנת זה מה שנשלח" ----
console.log('\n[11] query fidelity');
{
  const selection = 'השפעת משימות למידה יומיות קצרות על הישגים אקדמיים של סטודנטים';
  const fromSelection = buildSourcesQueryOverride('מצא לי 3 מקורות אקדמיים על הנושא', { selectedText: selection, currentBlockText: 'טקסט אחר לגמרי בבלוק' });
  check('סימון גובר על ניחוש מהפרומפט/בלוק', fromSelection === selection, fromSelection);

  const quoted = buildSourcesQueryOverride('מצא מקורות על "אקלים ארגוני ושחיקת עובדים"', { selectedText: selection });
  check('טקסט בגרשיים בבקשה גובר גם על סימון', quoted === 'אקלים ארגוני ושחיקת עובדים', quoted);

  const holeFill = buildHoleFillSourceQueryOverride('השלם חורים במסמך', { messages: [{ content: 'נושא ישן מהשיחה: דיני עבודה' }], selectedText: selection });
  check('מילוי-חורים עם סימון: הסימון נשלח, בלי כריית היסטוריה', holeFill === selection, holeFill);
}

// ---- 12. Scholar over-fetch + ranking (A): תמיד num=10, הדירוג+חיתוך קורים ב-pipeline ----
console.log('\n[12] scholar over-fetch + ranking (A)');
{
  const scholarPayload = {
    search_metadata: { status: 'success' },
    organic_results: Array.from({ length: 10 }, (_, i) => ({
      title: `Study habits paper ${i + 1}`,
      link: `https://ok.a1.org/articles/2026/x${i + 1}`,
      snippet: 'Research about study habits of students',
      inline_links: { cited_by: { total: (i + 1) * 10 } },
    })),
  };
  const capturedBodies = [];
  globalThis.fetch = async (url, init) => {
    capturedBodies.push(String(init?.body || ''));
    return {
      ok: true, status: 200,
      json: async () => ({ ok: true, status: 200, body: JSON.stringify(scholarPayload) }),
      text: async () => '',
    };
  };
  const session = createRetrievalSession({ runId: 'overfetch-a' });
  const result = await retrieveSources({
    query: 'study habits of students', kind: 'academic', count: 3,
    cfg: { scholar: { provider: 'serpapi', key: 'serp-test' } },
    session,
  });
  check('אחזור הצליח', result.ok === true, JSON.stringify(result.failureReason || ''));
  check('הבקשה ל-SerpAPI ביקשה num=10', capturedBodies.some((body) => body.includes('num=10')));
  check('הוחזרו בדיוק count=3 מקורות', result.sources.length === 3, String(result.sources.length));
  const urls = JSON.stringify(result.sources);
  check('שלושת המצוטטים ביותר נבחרו (x8/x9/x10), לא ה-3 הראשונים בתשובה',
    urls.includes('/x8') && urls.includes('/x9') && urls.includes('/x10') && !urls.includes('/x1"') && !urls.includes('/x2"'));
}

// ---- 13. פילטר רלוונטיות אקדמי (D): אפס-חפיפה נפסל *לפני* אימות URL; doi/citedBy מוגנים ----
console.log('\n[13] academic relevance filter (D)');
{
  const scholarPayload = {
    search_metadata: { status: 'success' },
    organic_results: [
      { title: 'Study habits and academic achievement of students', link: 'https://ok.d1.org/articles/2026/rel1', snippet: 'about study habits' },
      { title: 'מחקר על תזונה ים תיכונית ובריאות הלב', link: 'https://ok.d2.org/articles/2026/rel2', snippet: 'נושא שונה לגמרי' },
      { title: 'Completely unrelated topic on cooking', link: 'https://ok.d3.org/articles/2026/rel3', snippet: 'x', inline_links: { cited_by: { total: 50 } } },
    ],
  };
  globalThis.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ ok: true, status: 200, body: JSON.stringify(scholarPayload) }),
    text: async () => '',
  });
  let verifyCallCount = 0;
  const countingTransport = async (urls) => {
    verifyCallCount += urls.length;
    return baseTransport(urls);
  };
  setUrlVerifierTransport(countingTransport);
  const session = createRetrievalSession({ runId: 'relevance-d' });
  const result = await retrieveSources({
    query: 'study habits of students', kind: 'academic', count: 5,
    cfg: { scholar: { provider: 'serpapi', key: 'serp-test' } },
    session,
  });
  setUrlVerifierTransport(baseTransport);
  const urls = JSON.stringify(result.sources);
  check('אחזור הצליח', result.ok === true, JSON.stringify(result.failureReason || ''));
  check('התקבלו 2 מקורות (חופף + מוגן ב-citedBy)', result.sources.length === 2, String(result.sources.length));
  check('המקור החופף נשאר', urls.includes('rel1'));
  check('המקור המוגן ב-citedBy נשאר גם בלי חפיפה', urls.includes('rel3'));
  check('המקור חסר-החפיפה נפסל לפני אימות URL (אף פעם לא נבדק)', verifyCallCount === 2, String(verifyCallCount));
}

// ---- 14. Scholar PDF fallback (B): URL ראשי חסום/מת עם resources[0].link ⇒ מתחלף ל-PDF פתוח ----
console.log('\n[14] scholar pdf fallback (B)');
{
  const scholarPayload = {
    search_metadata: { status: 'success' },
    organic_results: [
      {
        title: 'Study habits of students behind a paywall',
        link: 'https://blocked.paywall-journal.com/stable/abc',
        snippet: 'study habits research',
        resources: [{ link: 'https://ok.openaccess1.org/paper1.pdf' }],
      },
      {
        title: 'Study habits longitudinal research with a dead link',
        link: 'https://dead.old-journal.com/doi/456',
        snippet: 'study habits research',
        resources: [{ link: 'https://ok.openaccess2.org/paper2.pdf' }],
      },
    ],
  };
  globalThis.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ ok: true, status: 200, body: JSON.stringify(scholarPayload) }),
    text: async () => '',
  });
  const session = createRetrievalSession({ runId: 'pdf-fallback-b' });
  const result = await retrieveSources({
    query: 'study habits of students', kind: 'academic', count: 5,
    cfg: { scholar: { provider: 'serpapi', key: 'serp-test' } },
    session,
  });
  const urls = JSON.stringify(result.sources);
  check('אחזור הצליח', result.ok === true, JSON.stringify(result.failureReason || ''));
  check('שני המקורות שרדו דרך ה-PDF הפתוח', result.sources.length === 2, String(result.sources.length));
  check('URL הסופי הוא ה-PDF (היה חסום)', urls.includes('openaccess1.org/paper1.pdf'));
  check('URL הסופי הוא ה-PDF (היה מת)', urls.includes('openaccess2.org/paper2.pdf'));
  check('verification.method === pdf-fallback לשני המקורות', result.sources.every((source) => source.verification?.method === 'pdf-fallback'));
}

// ---- 15. yearHigh (E): before → as_yhi, לצד after → as_ylo ----
console.log('\n[15] before param -> as_yhi (E)');
{
  const scholarPayload = {
    search_metadata: { status: 'success' },
    organic_results: [
      { title: 'Study habits and achievement of students', link: 'https://ok.e1.org/articles/2021/e1', snippet: 'study habits' },
    ],
  };
  const capturedBodies = [];
  globalThis.fetch = async (url, init) => {
    capturedBodies.push(String(init?.body || ''));
    return {
      ok: true, status: 200,
      json: async () => ({ ok: true, status: 200, body: JSON.stringify(scholarPayload) }),
      text: async () => '',
    };
  };
  const session = createRetrievalSession({ runId: 'yearhigh-e' });
  const result = await retrieveSources({
    query: 'study habits of students', kind: 'academic', count: 3,
    after: '2020-01-01', before: '2022-12-31',
    cfg: { scholar: { provider: 'serpapi', key: 'serp-test' } },
    session,
  });
  check('אחזור הצליח', result.ok === true, JSON.stringify(result.failureReason || ''));
  check('הבקשה כוללת as_ylo=2020', capturedBodies.some((body) => body.includes('as_ylo=2020')));
  check('הבקשה כוללת as_yhi=2022', capturedBodies.some((body) => body.includes('as_yhi=2022')));
}

// ---- 16. וריאנט אנגלי אוטומטי לשאילתה אקדמית עברית (C2) ----
console.log('\n[16] auto-translate academic query (C2)');
{
  const hebrewQuery = 'ייצוג מוגבלות בתקשורת';
  const heResult = {
    title: 'מאמר על ייצוג מוגבלות', link: 'https://ok.he1.org/articles/2026/he1',
    snippet: 'ייצוג מוגבלות בתקשורת', inline_links: { cited_by: { total: 5 } },
  };
  const enResults = [
    { title: 'Media representation of disability in the press', link: 'https://ok.en1.org/articles/2026/en1', snippet: 'media representation disability', inline_links: { cited_by: { total: 20 } } },
    { title: 'Disability portrayal in mass media', link: 'https://ok.en2.org/articles/2026/en2', snippet: 'media representation disability', inline_links: { cited_by: { total: 15 } } },
  ];

  // --- 16a: translate דלוק (ברירת מחדל) — שתי שאילתות, גם התוצאה האנגלית נכנסת ---
  setTranslateModelTransport(async () => 'media representation disability');
  {
    const capturedBodies = [];
    globalThis.fetch = async (url, init) => {
      const rawBody = String(init?.body || '');
      capturedBodies.push(rawBody);
      const isEnglish = rawBody.includes('media+representation+disability');
      const payload = { search_metadata: { status: 'success' }, organic_results: isEnglish ? enResults : [heResult] };
      return {
        ok: true, status: 200,
        json: async () => ({ ok: true, status: 200, body: JSON.stringify(payload) }),
        text: async () => '',
      };
    };
    const session = createRetrievalSession({ runId: 'translate-on' });
    const result = await retrieveSources({
      query: hebrewQuery, kind: 'academic', count: 5,
      cfg: { scholar: { provider: 'serpapi', key: 'serp-test' } },
      session,
    });
    check('אחזור הצליח (translate דלוק)', result.ok === true, JSON.stringify(result.failureReason || ''));
    check('שתי שאילתות חיפוש נשלחו (עברית + אנגלית)', capturedBodies.length === 2, String(capturedBodies.length));
    check('השאילתה האנגלית המתורגמת הופיעה בבקשה', capturedBodies.some((body) => body.includes('media+representation+disability')));
    check('התוצאות כוללות גם את המאמר האנגלי', JSON.stringify(result.sources).includes('en1.org'));
  }

  // --- 16b: cfg.retrieval.autoTranslateAcademic=false — חיפוש עברי בלבד ---
  {
    const capturedBodies = [];
    globalThis.fetch = async (url, init) => {
      capturedBodies.push(String(init?.body || ''));
      const payload = { search_metadata: { status: 'success' }, organic_results: [heResult] };
      return {
        ok: true, status: 200,
        json: async () => ({ ok: true, status: 200, body: JSON.stringify(payload) }),
        text: async () => '',
      };
    };
    const session = createRetrievalSession({ runId: 'translate-off' });
    const result = await retrieveSources({
      query: hebrewQuery, kind: 'academic', count: 5,
      cfg: { scholar: { provider: 'serpapi', key: 'serp-test' }, retrieval: { autoTranslateAcademic: false } },
      session,
    });
    check('אחזור הצליח (translate כבוי)', result.ok === true, JSON.stringify(result.failureReason || ''));
    check('רק חיפוש אחד נשלח כשה-translate כבוי', capturedBodies.length === 1, String(capturedBodies.length));
  }

  // --- 16c: fail-open — טרנספורט התרגום נופל, האחזור ממשיך בעברית בלבד ---
  {
    setTranslateModelTransport(async () => { throw new Error('translate model down'); });
    const capturedBodies = [];
    globalThis.fetch = async (url, init) => {
      capturedBodies.push(String(init?.body || ''));
      const payload = { search_metadata: { status: 'success' }, organic_results: [heResult] };
      return {
        ok: true, status: 200,
        json: async () => ({ ok: true, status: 200, body: JSON.stringify(payload) }),
        text: async () => '',
      };
    };
    const session = createRetrievalSession({ runId: 'translate-fail-open' });
    const result = await retrieveSources({
      query: hebrewQuery, kind: 'academic', count: 5,
      cfg: { scholar: { provider: 'serpapi', key: 'serp-test' } },
      session,
    });
    check('fail-open: אחזור הצליח למרות כשל התרגום', result.ok === true, JSON.stringify(result.failureReason || ''));
    check('fail-open: רק שאילתה עברית אחת נשלחה', capturedBodies.length === 1, String(capturedBodies.length));
  }

  setTranslateModelTransport(null);
}

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
