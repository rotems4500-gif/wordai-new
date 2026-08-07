// articleLibraryService.js — "ספריית מאמרים": חיפוש מאמרים מאומתים + הוספה לחומרי עזר.
//
// עיקרון: **דטרמיניסטי לחלוטין**. פירוק הבקשה החופשית של המשתמש נעשה ב-regex בלבד,
// וכל שדה בכרטיס התוצאה מגיע מ-metadata של ספק החיפוש (Scholar/Perplexity/Gemini)
// אחרי בדיקת URL חיה. אין קריאת LLM בשכבה הזו — עקבי עם עקרון ה-anti-hallucination.
//
// ⚠️ אין כאן שום import מ-aiService (מעגל אל המונולית): `cfg` מגיע כפרמטר מהקורא.
// ⚠️ כל הייבואים הכבדים הם dynamic בתוך הפונקציות, כדי שראש המודול יישאר
//    נקי מתלויות דפדפן — parseArticleLibraryRequest ניתן לייבוא ולבדיקה ב-node.

// מתחת לזה עמוד לא נחשב "נמשך" (paywall/דף נחיתה) — ראה gapSourceService.
const MIN_FULL_TEXT_CHARS = 1200;
// תקציר קצר מזה חסר ערך כראיה — לא נשמר בכלל.
const MIN_ABSTRACT_CHARS = 180;
const MAX_PAGE_CHARS = 30000;
const TOPIC_RESULT_COUNT = 8;
const LOOKUP_RESULT_COUNT = 4;
const RETRIEVAL_TIMEOUT_MS = 60000;
const PAGE_FETCH_TIMEOUT_MS = 12000;

// ─────────────────────────── פירוק הבקשה (טהור, ניתן לבדיקה ב-node) ───────────────────────────

// מילים פותחות שאינן חלק מהשאילתה: פעלי בקשה, נימוס, ומילות-חיבור לנושא.
const LEADING_NOISE = new Set([
  'תחפש', 'תחפשי', 'חפש', 'חפשי', 'תמצא', 'תמצאי', 'מצא', 'מצאי',
  'תביא', 'תביאי', 'הבא', 'הביאי', 'תראה', 'תראי', 'בבקשה', 'נא', 'אנא',
  'תוכל', 'תוכלי', 'לי', 'לנו', 'את', 'אני', 'רוצה', 'צריך', 'צריכה', 'מחפש', 'מחפשת',
  'מאמר', 'מאמרים', 'מאמרי', 'כתבה', 'כתבות', 'פוסט', 'פוסטים', 'בלוג', 'בלוגים',
  'מקור', 'מקורות', 'אקדמי', 'אקדמיים', 'אקדמית',
  'שקשור', 'שקשורים', 'שקשורות', 'הקשורים', 'הקשור', 'שעוסק', 'שעוסקים', 'שעוסקות',
  'שמדבר', 'שמדברים', 'שמדברות', 'שמתעסקים', 'בנושא', 'בנוגע', 'לגבי', 'על', 'אודות',
  'ל', 'אל', 'ב', 'ה',
]);

// אחרי מילות-חיבור אלה נהוג לכתוב "ל" מחוברת לנושא ("שקשורים לזיכרון") — גוזרים אותה.
const CONNECTORS_TAKING_LAMED = new Set([
  'שקשור', 'שקשורים', 'שקשורות', 'הקשורים', 'הקשור', 'בנוגע', 'שנוגע', 'שנוגעים',
]);

const QUOTE_CHARS = '"“”״\'׳';

const collapseSpaces = (value = '') => String(value).replace(/\s+/g, ' ').trim();

const countWords = (value = '') => collapseSpaces(value).split(' ').filter(Boolean).length;

// גוזר מילות-רעש מתחילת השאילתה, כולל ה"ל" המחוברת שאחרי מילת-חיבור.
const stripLeadingNoise = (value = '') => {
  const tokens = collapseSpaces(value).split(' ').filter(Boolean);
  let lastNoise = '';
  while (tokens.length) {
    const bare = tokens[0].replace(new RegExp(`^[${QUOTE_CHARS}\\-–—,.:]+|[${QUOTE_CHARS}\\-–—,.:]+$`, 'g'), '');
    if (!bare) { tokens.shift(); continue; }
    if (LEADING_NOISE.has(bare)) {
      lastNoise = bare;
      tokens.shift();
      continue;
    }
    // "שקשורים לזיכרון עבודה" → "זיכרון עבודה" (ה"ל" היא חלק מהחיבור, לא מהנושא).
    if (CONNECTORS_TAKING_LAMED.has(lastNoise) && bare.startsWith('ל') && bare.length >= 4) {
      tokens[0] = bare.slice(1);
    }
    break;
  }
  return tokens.join(' ').trim();
};

/**
 * מפרק בקשה חופשית לכוונת חיפוש. דטרמיניסטי — regex בלבד, אפס קריאות מודל.
 *
 * @param {string} promptText
 * @returns {{intent:('lookup'|'topic'|'empty'), query:string,
 *            kind:('academic'|'news'|'web'), count:number, after:string, before:string}}
 */
export function parseArticleLibraryRequest(promptText = '') {
  const original = collapseSpaces(promptText);
  let working = original;

  // ── סוג המקור (נקבע על הטקסט המקורי, לפני הגזירות) ──
  let kind = 'academic';
  if (/כתבה|כתבות|עיתון|עיתונות|חדשות/.test(original)) kind = 'news';
  else if (/פוסט|בלוג|אתר אינטרנט|אתרים/.test(original)) kind = 'web';

  // ── שנים ── "מ-2020" / "אחרי 2015" / "החל מ 2018" · "עד 2020" / "לפני 2019"
  let after = '';
  let before = '';
  const afterMatch = working.match(/(?:^|\s)(?:אחרי|החל\s*מ|מ)[-\s]?((?:19|20)\d{2})(?=\s|$)/);
  if (afterMatch) {
    after = `${afterMatch[1]}-01-01`;
    working = working.replace(afterMatch[0], ' ');
  }
  const beforeMatch = working.match(/(?:^|\s)(?:עד|לפני)[-\s]?((?:19|20)\d{2})(?=\s|$)/);
  if (beforeMatch) {
    before = `${beforeMatch[1]}-12-31`;
    working = working.replace(beforeMatch[0], ' ');
  }

  // ── כמות מבוקשת ──
  let explicitCount = 0;
  const countMatch = working.match(/(\d{1,2})\s*(?:מאמרים|כתבות|מקורות|תוצאות)/);
  if (countMatch) {
    explicitCount = Math.max(1, Math.min(10, Number(countMatch[1]) || 0));
    working = working.replace(countMatch[0], ' ');
  }
  working = collapseSpaces(working);

  const mk = (intent, query) => ({
    intent,
    query: collapseSpaces(query),
    kind,
    count: explicitCount || (intent === 'lookup' ? LOOKUP_RESULT_COUNT : TOPIC_RESULT_COUNT),
    after,
    before,
  });

  // ── lookup #1: DOI גולמי — השאילתה היא ה-DOI עצמו ──
  const doiMatch = working.match(/(10\.\d{4,9}\/[^\s]+)/);
  if (doiMatch) return mk('lookup', doiMatch[1].replace(/[.,;)]+$/, ''));

  // ── lookup #2: ציטוט במרכאות של ≥3 מילים — verbatim ──
  const quoted = working.match(new RegExp(`[${QUOTE_CHARS}]([^${QUOTE_CHARS}]{3,200})[${QUOTE_CHARS}]`));
  if (quoted && countWords(quoted[1]) >= 3) return mk('lookup', quoted[1]);

  // ── lookup #3: "המאמר של/הזה/בשם/שנקרא/שכותרתו" ──
  const namedMatch = working.match(/(?:ה?מאמר|ה?כתבה|ה?ספר)\s+(?:הזה|של|בשם|שנקרא|שנקראת|שכותרתו|שכותרתה)\s*/);
  if (namedMatch) {
    const rest = working.slice(namedMatch.index + namedMatch[0].length).trim();
    if (rest.length >= 3) return mk('lookup', rest);
  }

  // ── lookup #4: מחבר + שנה ("כהן ולוי 2018") ──
  const authorYear = working.match(/([֐-׿A-Za-z][֐-׿A-Za-z'׳"״-]{1,}(?:\s+(?:ו-?)?[֐-׿A-Za-z][֐-׿A-Za-z'׳"״-]{1,}){0,2})\s*[,(]?\s*((?:19|20)\d{2})(?=\s|\)|$)/);
  if (authorYear) {
    const stripped = stripLeadingNoise(working);
    if (stripped.length >= 3) return mk('lookup', stripped);
  }

  // ── topic ──
  const topicQuery = stripLeadingNoise(working);
  if (topicQuery.length < 3) return { intent: 'empty', query: '', kind, count: 0, after, before };
  return mk('topic', topicQuery);
}

// ─────────────────────────── נוסחי תשובה ───────────────────────────

const KIND_LABEL = { academic: 'מאמרים אקדמיים', news: 'כתבות', web: 'מקורות מהרשת' };

/**
 * כותרת עברית קצרה להודעת הצ'אט. הפירוט חי בכרטיסים — לא מדפיסים אותו כטקסט.
 * נוסחי הכישלון על בסיס format.js, אך **בלי** SOURCE_GROUNDING_FAILURE_TOKEN
 * (אין כאן זרימת כתיבה שצריך לחסום).
 */
export function formatArticleLibraryReply({
  intent = 'topic',
  query = '',
  kind = 'academic',
  articles = [],
  failureReason = '',
} = {}) {
  if (intent === 'empty') {
    return 'לא זיהיתי מה לחפש. כתוב שם מאמר, מחבר, DOI, או נושא — למשל: "מאמרים על זיכרון עבודה".';
  }

  const list = Array.isArray(articles) ? articles : [];
  if (list.length) {
    const head = intent === 'lookup'
      ? `אלה ההתאמות שנמצאו עבור: ${query}`
      : `נמצאו ${list.length} ${KIND_LABEL[kind] || KIND_LABEL.web} עבור: ${query}`;
    return `${head}\n\nכל קישור נבדק שהוא נפתח בפועל. אפשר להוסיף כל פריט לחומרי העזר בלחיצה.`;
  }

  const lines = [];
  if (failureReason === 'no-provider') {
    lines.push(kind === 'academic'
      ? 'אין כרגע ספק אחזור מאומת למקורות אקדמיים. הגדר SerpAPI עבור Google Scholar, או Perplexity למסלול מחקר מאומת כללי.'
      : 'אין כרגע ספק אחזור מאומת למקורות. הגדר Perplexity או Gemini כדי לקבל תוצאות וקישורים אמיתיים.');
  } else if (failureReason === 'all-dead-links') {
    lines.push('נמצאו תוצאות, אבל אף קישור לא עבר את בדיקת החיות — לא הצגתי קישורים שבורים.');
  } else if (failureReason === 'budget-exhausted') {
    lines.push('תקציב קריאות ה-API לפעולה הזו נוצל. נסה שוב או צמצם את הבקשה.');
  } else if (failureReason === 'timeout') {
    lines.push('החיפוש חרג ממסגרת הזמן. נסה שוב עם שאילתה ממוקדת יותר.');
  } else {
    lines.push(kind === 'academic'
      ? 'לא נמצאו מאמרים אקדמיים מאומתים לשאילתה, ולכן לא המצאתי תוצאות.'
      : 'לא נמצאו מקורות מאומתים לשאילתה, ולכן לא המצאתי תוצאות.');
  }
  if (query) lines.push(`שאילתת החיפוש שנבדקה: ${query}`);
  return lines.join('\n\n');
}

// ─────────────────────────── חיפוש ───────────────────────────

const slugify = (value = '') => collapseSpaces(value).toLowerCase().replace(/\s/g, '-').slice(0, 60);

const toArticleCard = (source, canonicalize) => {
  const url = String(source?.finalUrl || source?.url || '').trim();
  const canonical = url ? (canonicalize(url) || url) : '';
  const doi = String(source?.doi || '').trim();
  const title = String(source?.title || '').trim() || source?.domain || 'מקור';
  return {
    id: canonical || (doi ? `doi:${doi}` : `t:${slugify(title)}`),
    title,
    url,
    domain: String(source?.domain || '').trim(),
    authors: Array.isArray(source?.authors) ? source.authors.filter(Boolean) : [],
    year: source?.year || '',
    citedBy: Number(source?.citedBy) || null,
    doi,
    snippet: String(source?.snippet || '').trim(),
    summary: String(source?.summary || '').trim(),
    pdfUrl: String(source?.pdfUrl || '').trim(),
    provider: String(source?.provider || '').trim(),
    botBlocked: Boolean(source?.verification?.botBlocked),
    missingUrl: Boolean(source?.verification?.missingUrl) || !url,
    _raw: source,
  };
};

/**
 * מחפש מאמרים מאומתים לפי בקשה חופשית. אפס קריאות כתיבה למודל.
 *
 * @param {{prompt?:string, cfg?:object, signal?:AbortSignal,
 *          onStage?:(stage:string, detail?:object)=>void}} args
 * @returns {Promise<{ok:boolean, intent:string, query:string, kind:string,
 *                    articles:Array<object>, providerTrail:Array<object>, failureReason:string}>}
 */
export async function searchArticleLibrary({ prompt = '', cfg = null, signal, onStage = null } = {}) {
  const report = (stage, detail = {}) => { try { onStage?.(stage, detail); } catch { /* לא מפיל */ } };
  const parsed = parseArticleLibraryRequest(prompt);
  const base = {
    ok: false, intent: parsed.intent, query: parsed.query, kind: parsed.kind,
    articles: [], providerTrail: [], failureReason: '',
  };
  if (parsed.intent === 'empty') return { ...base, failureReason: 'no-query' };

  const { retrieveSources, createRetrievalSession, canonicalizeSourceUrl } = await import('./sourceRetrieval');
  // מחמם את חנות החומרים כדי שהכרטיסים יוכלו להציג "כבר בחומרים" מיד.
  primeArticleMaterialsIndex().catch(() => {});

  // session חדש בכל קריאה — session ברמת מודול היה מדליף תקציב בין תורי צ'אט.
  const session = createRetrievalSession({ runId: `article-library-${Date.now()}` });

  // סולם: אקדמי קודם, ואם חזר ריק — web (תקדים gapSourceService: השאילתה האקדמית
  // בעברית לפעמים מאפסת את התוצאות לגמרי).
  const ladder = parsed.kind === 'academic' ? ['academic', 'web'] : [parsed.kind];
  const trail = [];
  let retrieval = null;
  let sources = [];

  for (const attemptKind of ladder) {
    report('search', { query: parsed.query, kind: attemptKind });
    retrieval = await retrieveSources({
      query: parsed.query,
      kind: attemptKind,
      count: parsed.count,
      after: parsed.after,
      before: parsed.before,
      session,
      cfg: cfg || {},
      signal,
      timeoutMs: RETRIEVAL_TIMEOUT_MS,
      requireLiveUrl: true,
      // בלי זה early-exit מחזיר 2 תוצאות לבקשה של 8.
      minResults: parsed.count,
    });
    trail.push(...(retrieval?.providerTrail || []));
    sources = Array.isArray(retrieval?.sources) ? retrieval.sources : [];
    if (retrieval?.ok && sources.length) break;
  }

  if (!sources.length) {
    return { ...base, providerTrail: trail, failureReason: retrieval?.failureReason || 'no-results' };
  }

  const articles = sources.map((source) => toArticleCard(source, canonicalizeSourceUrl));
  report('done', { count: articles.length });
  return { ...base, ok: true, articles, providerTrail: trail };
}

// ─────────────────────────── הוספה לחומרי עזר ───────────────────────────

// טקסט המקור כשלא הצלחנו למשוך את העמוד — הרכבה של מה שספק החיפוש כבר החזיר.
// מסומן במפורש כתקציר, כדי שהראיה לא תתחזה לטקסט מלא.
const buildAbstractText = (article) => {
  const meta = [
    article?.authors?.length ? `מחברים: ${article.authors.join(', ')}` : '',
    article?.year ? `שנה: ${article.year}` : '',
    article?.doi ? `DOI: ${article.doi}` : '',
  ].filter(Boolean).join(' · ');
  return [
    String(article?.title || '').trim(),
    meta,
    '[תקציר בלבד — לא נמשך הטקסט המלא של המאמר]',
    String(article?.snippet || '').trim(),
    String(article?.summary || '').trim(),
  ]
    .filter(Boolean)
    // snippet ו-summary לפעמים זהים — כפילות רק מדללת את ה-chunk.
    .filter((part, i, arr) => arr.indexOf(part) === i)
    .join('\n\n')
    .trim();
};

const sameUrl = (left = '', right = '') => {
  const norm = (v) => String(v || '').trim().toLowerCase().replace(/^https?:\/\/(?:www\.)?/, '').replace(/[/?#]+$/, '');
  const l = norm(left);
  return Boolean(l) && l === norm(right);
};

// חנות החומרים נטענת lazy (כדי שראש המודול יישאר Node-safe), אבל
// isArticleAlreadyInMaterials נקרא מתוך render ולכן חייב להיות סינכרוני —
// שומרים הפניה למודול אחרי הטעינה הראשונה.
let materialsMod = null;
const loadMaterialsModule = async () => {
  if (!materialsMod) materialsMod = await import('./materialChunkStore');
  return materialsMod;
};

/** טוען את חנות החומרים כדי ש-isArticleAlreadyInMaterials יוכל לענות. */
export async function primeArticleMaterialsIndex() {
  const mod = await loadMaterialsModule();
  await mod.ensureMaterialStoreReady();
  return true;
}

/**
 * האם המאמר כבר באינדקס החומרים (לרינדור "✓ כבר בחומרים").
 * מחזיר false עד שהחנות נטענה (primeArticleMaterialsIndex / הוספה ראשונה).
 * @param {string} url
 * @returns {boolean}
 */
export function isArticleAlreadyInMaterials(url = '') {
  const clean = String(url || '').trim();
  if (!clean || !materialsMod) return false;
  try {
    return materialsMod.getMaterials().some((m) => sameUrl(m?.sourceUrl, clean));
  } catch {
    return false;
  }
}

/**
 * מוסיף מאמר לחומרי העזר: משיכת טקסט → אינדקס ראיות → רשימת חומרי הפרויקט → הטמעה.
 *
 * ⚠️ **triple write** (לפי clipInboxService): addMaterialDocument (אינדקס RAG) +
 * attachMaterialToProject (שיוך) + saveClipAsHelperMaterial (הרשימה שהמשתמש רואה).
 * דילוג על 2+3 = חומר בלתי-נראה למשתמש.
 * ⚠️ defer:true ⇒ commitMaterialStore() חובה בכל מסלול return.
 *
 * @param {object} article כרטיס מ-searchArticleLibrary
 * @param {{projectId?:string, signal?:AbortSignal, onStage?:(stage:string, detail?:object)=>void}} opts
 * @returns {Promise<{ok:boolean, status:('added'|'already'|'too-thin'|'error'),
 *                    materialId:(string|null), chunks:number, strength:string, error?:string}>}
 */
export async function addArticleToMaterials(article, { projectId = '', signal, onStage = null } = {}) {
  const report = (stage, detail = {}) => { try { onStage?.(stage, detail); } catch { /* לא מפיל */ } };
  const url = String(article?.url || '').trim();
  const cleanProjectId = String(projectId || '').trim();

  const [
    materials,
    { fetchPagesText },
    { fetchBrowserPageSnapshot, isDesktopBrowserRetrievalAvailable },
  ] = await Promise.all([
    loadMaterialsModule(),
    import('./pageTextFetch'),
    import('./browserRetrievalService'),
  ]);
  const {
    addMaterialDocument, ensureMaterialStoreReady, commitMaterialStore, getMaterials,
  } = materials;

  // ⚠️ חובה: החנות נטענת מ-IndexedDB אסינכרונית — בלי ההמתנה ההידרציה תדרוס את הכתיבה.
  await ensureMaterialStoreReady();

  if (url && getMaterials().some((m) => sameUrl(m?.sourceUrl, url))) {
    return { ok: true, status: 'already', materialId: null, chunks: 0, strength: '' };
  }

  try {
    // ── משיכת טקסט העמוד ──
    report('fetching', { url });
    let fullText = '';
    let resolvedUrl = url;
    let cleanDigital = true;

    if (url) {
      const [page] = await fetchPagesText([url], { signal, timeoutMs: PAGE_FETCH_TIMEOUT_MS });
      if (page?.ok) {
        fullText = String(page.text || '').trim();
        resolvedUrl = String(page.finalUrl || '').trim() || url;
      }
      // עמודי JS-rendered מחזירים כמעט כלום ב-fetch רגיל — בדסקטופ מסלים ל-snapshot.
      if (fullText.length < MIN_FULL_TEXT_CHARS && isDesktopBrowserRetrievalAvailable()) {
        const snapshot = await fetchBrowserPageSnapshot(url).catch(() => null);
        const snapshotText = String(snapshot?.text || '').trim();
        if (snapshotText.length > fullText.length) {
          fullText = snapshotText;
          resolvedUrl = String(snapshot?.finalUrl || '').trim() || resolvedUrl;
        }
      }
    }

    const useFull = fullText.length >= MIN_FULL_TEXT_CHARS;
    const text = useFull ? fullText.slice(0, MAX_PAGE_CHARS) : buildAbstractText(article);
    const strength = useFull ? 'full' : 'abstract';
    if (!useFull) cleanDigital = false;

    if (!useFull && text.length < MIN_ABSTRACT_CHARS) {
      await commitMaterialStore();
      return { ok: false, status: 'too-thin', materialId: null, chunks: 0, strength };
    }

    // ── write #1: אינדקס הראיות ──
    report('adding', { strength });
    const title = String(article?.title || '').trim() || resolvedUrl || 'מאמר';
    const added = addMaterialDocument({
      title,
      text,
      source: 'article-library',
      kind: 'retrieved-source',
      sourceUrl: resolvedUrl || null,
      projectId: cleanProjectId || null,
      cleanDigital: useFull ? cleanDigital : false,
      strength,
      defer: true,
    });

    if (added?.skipped) {
      await commitMaterialStore();
      return { ok: true, status: 'already', materialId: added.materialId || null, chunks: 0, strength };
    }
    if (!added?.materialId) {
      await commitMaterialStore();
      return { ok: false, status: 'too-thin', materialId: null, chunks: 0, strength };
    }

    // ── write #2: שיוך לפרויקט ──
    if (cleanProjectId) {
      const { attachMaterialToProject } = await import('./projectService');
      try { attachMaterialToProject(cleanProjectId, added.materialId); } catch (err) {
        console.error('[articleLibrary] attachMaterialToProject failed', err);
      }
    }

    // ── write #3: הרשימה שהמשתמש רואה. כשל כאן אינו פטאלי — הראיה כבר באינדקס.
    try {
      const { saveClipAsHelperMaterial } = await import('./workspaceLearningService');
      await saveClipAsHelperMaterial({
        title, text, sourceUrl: resolvedUrl || '', projectId: cleanProjectId,
      });
    } catch (err) {
      console.error('[articleLibrary] saveClipAsHelperMaterial failed', err);
    }

    await commitMaterialStore();

    // ── הטמעה: בלי זה ה-chunks החדשים ידורגו לקסיקלית בלבד ועלולים לא לעבור את הסף.
    report('embedding', { chunks: added.added || 0 });
    try {
      const { ensureMaterialsEmbedded } = await import('./evidenceMatchService');
      let remaining = Infinity;
      for (let guard = 0; guard < 40 && remaining !== 0; guard += 1) {
        const res = await ensureMaterialsEmbedded({ limit: 400 });
        if (res?.unavailable) break; // WASM לא זמין — המסלול הלקסיקלי עדיין עובד.
        remaining = res?.remaining ?? 0;
      }
    } catch (err) {
      console.error('[articleLibrary] embedding failed', err);
    }

    report('done', { materialId: added.materialId, strength });
    return {
      ok: true, status: 'added', materialId: added.materialId, chunks: added.added || 0, strength,
    };
  } catch (err) {
    // defer:true — גם במסלול השגיאה חייבים לסגור את האצווה.
    try { await commitMaterialStore(); } catch { /* לא מפיל */ }
    return {
      ok: false, status: 'error', materialId: null, chunks: 0, strength: '',
      error: String(err?.message || err),
    };
  }
}
