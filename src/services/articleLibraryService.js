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

// ───────────────────── גישה מוסדית (EZproxy link-wrapping) ─────────────────────
// המנוי של המוסד תקף רק בדפדפן של המשתמש (עוגיית ההתחברות ל-EZproxy יושבת שם).
// לכן העטיפה חלה **אך ורק** על קישורים שנפתחים בדפדפן (כפתור "🔗 פתח" בכרטיס),
// ולעולם לא על אחזור בתוך האפליקציה (fetchPagesText/fetch_binary) — שם אין session
// והעטיפה רק תחזיר דף התחברות במקום המאמר.
//
// דוגמה חיה (המרכז האקדמי הרב תחומי ירושלים): https://mgs.jmc.ac.il/login?url=<TARGET>
const ARTICLE_PROXY_PREFIX_KEY = 'wordflow_article_proxy_prefix';

/**
 * קידומת הפרוקסי המוסדי ששמורה מקומית, או '' אם לא הוגדרה.
 * @returns {string}
 */
export function getInstitutionProxyPrefix() {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return '';
    const stored = String(localStorage.getItem(ARTICLE_PROXY_PREFIX_KEY) || '').trim();
    // ריפוי-עצמי: ערך ישן ששמור בלי ?url= (למשל כתובת תפריט שהודבקה לפני תיקון
    // הנרמול) היה מדביק את היעד לנתיב ומחזיר 404 — מנרמלים מחדש ושומרים.
    if (stored && !/\?url=/i.test(stored) && !stored.endsWith('=')) {
      return setInstitutionProxyPrefix(stored);
    }
    return stored;
  } catch {
    return '';
  }
}

/**
 * שומר קידומת פרוקסי מוסדי אחרי נרמול. ערך ריק מוחק את ההגדרה.
 * נרמול: trim → השלמת סכימת https → הרחבת host חשוף ל-`https://<host>/login?url=`.
 *
 * @param {string} value
 * @returns {string} הקידומת המנורמלת שנשמרה ('' אם נמחקה)
 */
export function setInstitutionProxyPrefix(value) {
  let prefix = String(value || '').trim();

  if (prefix) {
    // כל קלט שאינו קידומת EZproxy מוכנה (אין בו ?url= והוא לא נגמר ב-=) מנורמל לפי
    // ה-host בלבד: `https://<host>/login?url=`. כך גם הדבקה של כתובת תפריט המאגרים
    // ("login.mgs.jmc.ac.il/menu") או host חשוף נותנת קידומת תקינה — בלי הנתיב,
    // שאחרת נדבק ליעד ומחזיר 404 ("menuhttps://...").
    if (!/\?url=/i.test(prefix) && !prefix.endsWith('=')) {
      const withScheme = /^https?:\/\//i.test(prefix) ? prefix : `https://${prefix.replace(/^\/+/, '')}`;
      try {
        prefix = `https://${new URL(withScheme).hostname}/login?url=`;
      } catch {
        prefix = `https://${withScheme.replace(/^https?:\/\//i, '').split(/[/?#]/)[0]}/login?url=`;
      }
    } else if (!/^https?:\/\//i.test(prefix)) {
      prefix = `https://${prefix.replace(/^\/+/, '')}`;
    }
    // מוסדות מגישים את הפרוקסי ב-https בלבד; http יפיל את ההתחברות.
    prefix = prefix.replace(/^http:\/\//i, 'https://');
  }

  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      if (prefix) localStorage.setItem(ARTICLE_PROXY_PREFIX_KEY, prefix);
      else localStorage.removeItem(ARTICLE_PROXY_PREFIX_KEY);
    }
  } catch { /* לא מפיל — ההגדרה פשוט לא נשמרת */ }

  return prefix;
}

/**
 * עוטף כתובת מאמר בקידומת הפרוקסי המוסדי — **לפתיחה בדפדפן בלבד**.
 * מחזיר את הכתובת כמו שהיא אם אין קידומת, אם היא לא http(s), או אם היא כבר עטופה.
 *
 * @param {string} url
 * @returns {string}
 */
export function wrapWithInstitutionProxy(url) {
  const target = String(url || '').trim();
  if (!target || !/^https?:\/\//i.test(target)) return target;

  const prefix = getInstitutionProxyPrefix();
  if (!prefix) return target;

  // כבר עובר דרך אותו פרוקסי (או שזו כתובת של הפרוקסי עצמו) — לא עוטפים פעמיים.
  let proxyHost = '';
  try { proxyHost = new URL(prefix.replace(/\?url=.*$/i, '')).hostname.toLowerCase(); } catch { proxyHost = ''; }
  if (proxyHost && target.toLowerCase().includes(proxyHost)) return target;

  // EZproxy מקבל את היעד **לא מקודד** — כך בדיוק בונה אותו תפריט הספרייה של המוסד,
  // וקידוד גורף שובר חלק מהתצורות. החריג היחיד: יעד שמכיל '&' — בלי קידוד ה-query
  // שלו נקטע ונבלע כפרמטר של הפרוקסי, ולכן דווקא שם מקודדים.
  return target.includes('&') ? prefix + encodeURIComponent(target) : prefix + target;
}

/**
 * קישור חיפוש של המאמר ב-Google Scholar (הכותרת במרכאות — התאמה מדויקת).
 * עטוף בפרוקסי המוסדי כשהוא מוגדר — כך סקולר מציג "Full text @ המוסד" ליד התוצאות.
 * @param {object} article
 * @returns {string} '' כשאין כותרת
 */
export function buildScholarSearchUrl(article) {
  const title = String(article?.title || '').trim();
  if (!title) return '';
  const scholarUrl = `https://scholar.google.com/scholar?q=%22${encodeURIComponent(title)}%22`;
  return wrapWithInstitutionProxy(scholarUrl);
}

// ─────────────────────────── Unpaywall (Open Access) ───────────────────────────
// API חינמי ללא מפתח; דורש רק כתובת מייל ליצירת קשר. מחזיר את המיקום החוקי
// הטוב ביותר לעותק פתוח של המאמר — כך שתוצאה מאחורי paywall הופכת לפתיחה/הורדה/הטמעה.
const UNPAYWALL_API_BASE = 'https://api.unpaywall.org/v2/';
const UNPAYWALL_CONTACT_EMAIL = 'rotems4500@gmail.com';
const UNPAYWALL_TIMEOUT_MS = 5000;
// תקציב רך: מעבר לזה לא מעכבים את הצגת התוצאות.
const UNPAYWALL_MAX_ARTICLES = 10;
const UNPAYWALL_CONCURRENCY = 4;

// מנקה קידומות נפוצות ל-DOI ("https://doi.org/…", "doi:…") ומחזיר את המזהה הגולמי.
const normalizeDoi = (doi = '') => String(doi || '')
  .trim()
  .replace(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\//i, '')
  .replace(/^doi:\s*/i, '')
  .replace(/[.,;)\]]+$/, '')
  .trim();

/**
 * שואל את Unpaywall על עותק גישה-חופשית חוקי למאמר לפי DOI.
 * **fail-open**: כל כשל (רשת/404/JSON) מחזיר null ולעולם לא זורק.
 *
 * @param {string} doi
 * @param {{signal?:AbortSignal, timeoutMs?:number}} [opts]
 * @returns {Promise<{oaUrl:string, oaPdfUrl:string, isOa:boolean}|null>}
 */
export async function fetchUnpaywallOa(doi, { signal, timeoutMs = UNPAYWALL_TIMEOUT_MS } = {}) {
  const clean = normalizeDoi(doi);
  if (!/^10\.\d{4,9}\/\S+$/.test(clean)) return null;

  const url = `${UNPAYWALL_API_BASE}${encodeURIComponent(clean).replace(/%2F/gi, '/')}`
    + `?email=${encodeURIComponent(UNPAYWALL_CONTACT_EMAIL)}`;

  // timeout משלנו: במסלול ה-fetch (אתר/Node) requestJsonOverHttp מתעלם מ-timeoutMs.
  let timer = null;
  let controller = null;
  let abortRelay = null;
  try {
    if (typeof AbortController === 'function') {
      controller = new AbortController();
      timer = setTimeout(() => { try { controller.abort(); } catch { /* לא מפיל */ } }, timeoutMs);
      if (signal) {
        if (signal.aborted) return null;
        abortRelay = () => { try { controller.abort(); } catch { /* לא מפיל */ } };
        signal.addEventListener('abort', abortRelay, { once: true });
      }
    }

    const { requestJsonOverHttp } = await import('./httpTransport');
    const data = await requestJsonOverHttp({
      url,
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller ? controller.signal : signal,
      timeoutMs,
    });

    const best = data?.best_oa_location || null;
    const oaPdfUrl = String(best?.url_for_pdf || '').trim();
    const oaUrl = String(best?.url || '').trim();
    const isOa = Boolean(data?.is_oa);
    if (!oaUrl && !oaPdfUrl && !isOa) return null;
    return { oaUrl, oaPdfUrl, isOa };
  } catch {
    // fail-open — העשרה היא בונוס, לא תנאי להצגת התוצאות.
    return null;
  } finally {
    if (timer) clearTimeout(timer);
    if (signal && abortRelay) signal.removeEventListener('abort', abortRelay);
  }
}

/**
 * מעשיר כרטיסי מאמרים בעותקי גישה-חופשית (in-place). מוגבל ל-UNPAYWALL_MAX_ARTICLES
 * ראשונים ולריצה מקבילה של UNPAYWALL_CONCURRENCY. כשלים שקטים.
 * @returns {Promise<number>} כמה כרטיסים הועשרו
 */
async function enrichArticlesWithOpenAccess(articles, { signal } = {}) {
  const targets = (Array.isArray(articles) ? articles : [])
    .slice(0, UNPAYWALL_MAX_ARTICLES)
    .filter((a) => normalizeDoi(a?.doi));
  if (!targets.length) return 0;

  let found = 0;
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      if (signal?.aborted) return;
      const index = cursor;
      cursor += 1;
      const article = targets[index];
      if (!article) return;

      const oa = await fetchUnpaywallOa(article.doi, { signal });
      if (!oa) continue;

      let touched = false;
      if (oa.oaPdfUrl && !article.pdfUrl) { article.pdfUrl = oa.oaPdfUrl; touched = true; }
      if (article.missingUrl && oa.oaUrl) {
        article.url = oa.oaUrl;
        article.missingUrl = false;
        touched = true;
      } else if (article.botBlocked && oa.oaUrl) {
        // משאירים את ה-URL המקורי, ומוסיפים יעד חלופי לכפתור "פתח".
        article.oaUrl = oa.oaUrl;
        touched = true;
      }
      if (oa.isOa) { article.openAccess = true; touched = true; }
      if (touched) found += 1;
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(UNPAYWALL_CONCURRENCY, targets.length) }, worker),
  );
  return found;
}

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
    // מתמלאים ב-enrichArticlesWithOpenAccess (Unpaywall) אחרי המיפוי.
    openAccess: false,
    oaUrl: '',
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

  // ── העשרת Open Access: הופך תוצאות חסומות/ללא-קישור לפתיחות והורדות חוקיות ──
  const oaFound = await enrichArticlesWithOpenAccess(articles, { signal }).catch(() => 0);
  report('open-access', { found: oaFound });

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

// ─────────────────────────── מסלול PDF (דסקטופ בלבד) ───────────────────────────

// ה-shim של Tauri בלבד: באתר אין דרך לעקוף CORS למשיכת בינארי.
function isPdfBinaryFetchAvailable() {
  return typeof window !== 'undefined' && typeof window.desktopApp?.fetchPdfBinary === 'function';
}

// מעדיפים pdfUrl מפורש (Scholar מחזיר אותו); אחרת URL שנראה כמו PDF.
function resolvePdfCandidateUrl(article, fallbackUrl = '') {
  const explicit = String(article?.pdfUrl || '').trim();
  if (explicit) return explicit;
  const url = String(fallbackUrl || article?.url || '').trim();
  return /\.pdf($|\?)/i.test(url) ? url : '';
}

// true אם לכרטיס יש מסלול PDF כלשהו — משמש את ה-UI להצגת כפתור ההורדה.
export function articleHasPdfCandidate(article) {
  return Boolean(resolvePdfCandidateUrl(article));
}

const PDF_FETCH_TIMEOUT_MS = 30000;

// משיכת בייטים + חילוץ טקסט (OCR כלול). מחזיר תמיד אובייקט — אף פעם לא זורק.
async function fetchPdfFullText(pdfUrl, signal) {
  try {
    if (signal?.aborted) return { text: '', finalUrl: '', viaOcr: false };
    const res = await window.desktopApp.fetchPdfBinary(pdfUrl, { timeoutMs: PDF_FETCH_TIMEOUT_MS });
    if (!res?.ok || !res.bytes?.length) return { text: '', finalUrl: '', viaOcr: false };
    if (signal?.aborted) return { text: '', finalUrl: '', viaOcr: false };
    // dynamic — ראש המודול נשאר נקי מתלויות דפדפן (pdf.js/tesseract).
    const { extractMaterialTextFromBytes } = await import('./materialExtractBrowser');
    const out = await extractMaterialTextFromBytes('article.pdf', res.bytes, MAX_PAGE_CHARS, { ocr: true });
    if (!out?.ok) return { text: '', finalUrl: '', viaOcr: false };
    return {
      text: String(out.text || '').trim(),
      finalUrl: String(res.finalUrl || '').trim(),
      viaOcr: Boolean(out.viaOcr),
    };
  } catch (err) {
    console.error('[articleLibrary] pdf fetch/extract failed', err);
    return { text: '', finalUrl: '', viaOcr: false };
  }
}

// שם קובץ בטוח מתוך כותרת המאמר (עברית נשמרת; רק תווים אסורים ב-Windows יורדים).
function pdfFileNameFor(article) {
  const raw = String(article?.title || '').trim() || 'article';
  const slug = raw.replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return `${slug || 'article'}.pdf`;
}

/**
 * הורדת ה-PDF של המאמר לדיסק דרך דיאלוג שמירה native. דסקטופ בלבד.
 * @returns {Promise<{ok:boolean, canceled?:boolean, path?:string, error?:string}>}
 */
export async function downloadArticlePdf(article) {
  if (!isPdfBinaryFetchAvailable() || typeof window.desktopApp?.saveBinaryFile !== 'function') {
    return { ok: false, error: 'desktop-only' };
  }
  const pdfUrl = resolvePdfCandidateUrl(article);
  if (!pdfUrl) return { ok: false, error: 'לא נמצא קישור ל-PDF' };

  const fetched = await window.desktopApp.fetchPdfBinary(pdfUrl, { timeoutMs: PDF_FETCH_TIMEOUT_MS });
  if (!fetched?.ok || !fetched.bytes?.length) {
    return { ok: false, error: fetched?.error || 'משיכת ה-PDF נכשלה' };
  }

  const saved = await window.desktopApp.saveBinaryFile(pdfFileNameFor(article), fetched.bytes);
  if (saved?.canceled) return { ok: false, canceled: true };
  if (!saved?.ok) return { ok: false, error: saved?.error || 'השמירה נכשלה' };
  return { ok: true, path: saved.filePath || '' };
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

    // ── הסלמה אחרונה: PDF. fetch_page_text דוחה non-HTML, ולכן מאמרי PDF
    // נכנסו עד כה כ-strength:'abstract'. בדסקטופ מושכים את הבייטים ומחלצים
    // טקסט (כולל OCR לסרוקים) עם אותו מחלץ שמשמש את העלאת החומרים.
    if (fullText.length < MIN_FULL_TEXT_CHARS) {
      const pdfCandidate = resolvePdfCandidateUrl(article, url);
      if (pdfCandidate && isPdfBinaryFetchAvailable()) {
        report('fetching-pdf', { url: pdfCandidate });
        const pdfText = await fetchPdfFullText(pdfCandidate, signal);
        if (pdfText.text.length > fullText.length) {
          fullText = pdfText.text;
          resolvedUrl = pdfText.finalUrl || resolvedUrl;
          // OCR ⇒ הטקסט אינו "דיגיטלי נקי" (משפיע על ספי הרלוונטיות במנוע).
          cleanDigital = !pdfText.viaOcr;
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
    let ingestCourseId = null;
    try {
      const { deriveCourseIdForIngest } = await import('./activeCourseService');
      ingestCourseId = deriveCourseIdForIngest(cleanProjectId || null);
    } catch {}
    const added = addMaterialDocument({
      title,
      text,
      source: 'article-library',
      kind: 'retrieved-source',
      sourceUrl: resolvedUrl || null,
      projectId: cleanProjectId || null,
      courseId: ingestCourseId,
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
