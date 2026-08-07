// gapSourceService.js — סוגר פערים בשלד המטלה: סעיף בלי ראיות → חיפוש מקורות
// → משיכת טקסט → הכנסה לאינדקס החומרים → הסעיף מפסיק להיות חסום.
//
// למה זה קיים: בפנקס ההכנה (assignmentPrepService) סעיף בלי ראיות הוא **blocked**
// ולא needs-ai — כתיבה שם היא המצאה. זה המסלול היחיד שמוציא סעיף מ-blocked:
// מביא ראיות אמיתיות במקום לבקש מהמודל להמציא.
//
// הזרימה:
//   1. buildGapQuery      — שאילתה דטרמיניסטית מהכותרת/מונחים/הנחיה. אפס AI.
//   2. retrieveSources    — מנוע האחזור הקיים (URL רק ממטא-דאטה של ספק, נבדק חי).
//   3. fetchPagesText     — גוף העמוד. דסקטופ: Rust. ווב: /api/fetch-page-text.
//   4. נפילה לתקציר       — אם המשיכה נכשלה/קצרה מדי, נשמר ה-snippet עם
//                           strength:'abstract'. נשמר, אבל מסומן — לא מתחזה לטקסט מלא.
//   5. addMaterialDocument — נכנס לאותו אינדקס כמו כל חומר שהמשתמש העלה,
//                            ולכן עובר את אותו שיוך-ראיות בדיוק.
//
// עלות (נמדד ב-tools/test-bench/gap-source-harness.mjs): **אפס קריאות כתיבה**.
// שלב החיפוש עצמו תלוי בסולם הספקים: Scholar/Perplexity הם קריאות חיפוש טהורות,
// אבל מדרגת הנפילה האחרונה היא Gemini+GoogleSearch — קריאת LLM קצרה אחת לחילוץ
// metadata. אל תבטיח למשתמש "אפס קריאות API" בלי לסייג את זה.

import { retrieveSources } from './sourceRetrieval';
import { fetchPagesText } from './pageTextFetch';
import { addMaterialDocument, ensureMaterialStoreReady } from './materialChunkStore';
import { ensureMaterialsEmbedded, findEvidenceForSection } from './evidenceMatchService';
import { getProviderConfig } from './aiService';

// מתחת לזה עמוד לא נחשב "נמשך" — paywall/דף נחיתה/שגיאה מחזירים לרוב כמה מאות
// תווים של ניווט. 1200 תווים ≈ פסקה-שתיים של תוכן ממשי.
const MIN_FULL_TEXT_CHARS = 1200;
// תקציר קצר מזה חסר ערך כראיה (כותרת בלבד) — לא נשמר בכלל.
const MIN_ABSTRACT_CHARS = 180;
const MAX_PAGE_CHARS = 40000;
const DEFAULT_SOURCE_COUNT = 4;

// מילות-רעש שנפוצות בכותרות סעיפים ומזיקות לשאילתת חיפוש.
// נמדד: השארת "עבודה מסכמת" בשאילתה החזירה 0 מקורות — ספק החיפוש מחפש עבודות
// סטודנטים במקום את הנושא. מילות פורמט-מטלה חייבות לצאת.
const QUERY_STOPWORDS = new Set([
  'מבוא', 'סיכום', 'דיון', 'רקע', 'תיאורטי', 'פרק', 'סעיף', 'חלק', 'כללי',
  'תארו', 'הסבירו', 'נתחו', 'השוו', 'כתבו', 'פרטו', 'הציגו', 'יש', 'את', 'של',
  'על', 'עם', 'בין', 'לפי', 'כדי', 'זה', 'הוא', 'היא', 'אשר', 'מילים', 'עד',
  // פורמט מטלה — מגיע מכותרת ה-spec ומחזיר תוצאות על "איך כותבים עבודה".
  'עבודה', 'מסכמת', 'מסכם', 'סמינריונית', 'סמינריון', 'מטלה', 'תרגיל', 'בחינה',
  'קורס', 'מטלת', 'הגשה', 'ציון', 'סטודנט', 'סטודנטים', 'אקדמית', 'אקדמי',
]);

// "הקונפורמיות" ו"קונפורמיות" הן אותה מילה לחיפוש; כפילות רק גוזלת מקום
// מהמונחים המבחינים. גוזרים ה"א-הידיעה/ו-החיבור לצורך ההשוואה בלבד.
const dedupeKey = (term = '') => String(term)
  .toLowerCase()
  .replace(/^(?:ו?ש?[הבלכמ])(?=[֐-׿]{3,})/u, '');

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

const cleanToken = (token = '') => String(token)
  .replace(/["'״׳“”(),.;:!?/\\\-—–]+/g, '')
  .trim();

/**
 * שאילתת חיפוש לסעיף חסום. דטרמיניסטית לגמרי — בלי קריאה למודל.
 *
 * הכותרת לבדה לרוב דלילה ("שיטה"), וההנחיה לבדה רועשת (מכסת מילים, פורמט).
 * הרכב: נושא המטלה (עוגן תחומי) + כותרת הסעיף + מונחי מפתח מההנחיה.
 *
 * @param {object} section
 * @param {{spec?:object, maxTerms?:number}} opts
 * @returns {string}
 */
export function buildGapQuery(section, { spec = null, maxTerms = 8 } = {}) {
  if (!isPlainObject(section)) return '';

  const title = cleanToken(section.title || '');
  const keywords = Array.isArray(section.keywords) ? section.keywords.map(cleanToken) : [];
  // ההנחיה נחתכת: המשפט הראשון נושא את הנושא, השאר לרוב דרישות פורמט.
  const instructionHead = String(section.instructions || '').split(/[.!?\n]/)[0] || '';

  const fromInstruction = instructionHead
    .split(/\s+/)
    .map(cleanToken)
    .filter((t) => t.length >= 3 && !QUERY_STOPWORDS.has(t));

  const titleTerms = title.split(/\s+/).map(cleanToken).filter((t) => t && !QUERY_STOPWORDS.has(t));

  // נושא המטלה מעגן את החיפוש בתחום — "מדגם" לבד מחזיר סטטיסטיקה גנרית,
  // "מדגם קונפורמיות אש" מחזיר את המאמר.
  const specTopic = cleanToken(spec?.title || '');
  const topicTerms = specTopic.split(/\s+/).map(cleanToken).filter((t) => t.length >= 3 && !QUERY_STOPWORDS.has(t));

  // סדר = סדר עדיפות, כי maxTerms חותך. ההנחיה קודמת לנושא המטלה: נמדד ב-e2e
  // שסעיף "יישום עכשווי" עם הנחיה "...הרלוונטיות לרשתות חברתיות" איבד דווקא את
  // "רשתות חברתיות" — המונח היחיד שמבחין את הסעיף — כי מילות נושא-המטלה הכלליות
  // תפסו את התקציב. התוצאה הייתה מקור גנרי על פסיכולוגיה שלא עבר את סף הרלוונטיות.
  const seen = new Set();
  const terms = [];
  [...titleTerms, ...keywords, ...fromInstruction, ...topicTerms].forEach((term) => {
    const key = dedupeKey(term);
    // אסימון שמכיל ספרה הוא כמעט תמיד מכסת מילים או מספר סעיף — רעש בשאילתה.
    if (!term || !key || /\d/.test(term) || seen.has(key)) return;
    seen.add(key);
    terms.push(term);
  });

  return terms.slice(0, maxTerms).join(' ').trim();
}

// טקסט המקור כשלא הצלחנו למשוך את העמוד. הרכבה של מה שספק החיפוש כבר החזיר.
const buildAbstractText = (source) => [
  String(source?.title || '').trim(),
  String(source?.snippet || '').trim(),
  String(source?.summary || '').trim(),
]
  .filter(Boolean)
  // snippet ו-summary לפעמים זהים — כפילות רק מדללת את ה-chunk.
  .filter((part, i, arr) => arr.indexOf(part) === i)
  .join('\n\n')
  .trim();

// כותרת שהיא בעצם הדומיין ("textologia.net") — זה מה ש-Gemini grounding מחזיר,
// והיא חסרת ערך כפרובננס. במקרה כזה מעדיפים את ה-<title> של העמוד שנמשך.
const isDomainOnlyTitle = (title = '', domain = '') => {
  const t = String(title).trim().toLowerCase();
  if (!t) return true;
  const d = String(domain).trim().toLowerCase();
  return t === d || /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(t);
};

const buildSourceTitle = (source, page = null) => {
  let title = String(source?.title || '').trim();
  const pageTitle = String(page?.title || '').trim();
  if (isDomainOnlyTitle(title, source?.domain) && pageTitle) title = pageTitle;

  const year = String(source?.year || '').trim();
  const authors = Array.isArray(source?.authors) ? source.authors.filter(Boolean) : [];
  const lead = authors.length ? authors[0] : '';
  const head = [lead, year].filter(Boolean).join(' ');
  if (!title) return head || source?.domain || 'מקור מהרשת';
  // כותרות עמוד נוטות לגרור " | שם האתר" — חותכים את הזנב.
  const clipped = title.split(/\s+[|–—]\s+/)[0].trim().slice(0, 140) || title.slice(0, 140);
  return head ? `${clipped} (${head})` : clipped;
};

/**
 * מביא מקורות לסעיף חסום ומכניס אותם לאינדקס החומרים.
 *
 * @param {object} section סעיף מ-parseAssignmentSpec
 * @param {{spec?:object, count?:number, kind?:('academic'|'web'|'news'),
 *          signal?:AbortSignal, session?:object, cfg?:object,
 *          onProgress?:(stage:string, detail?:object)=>void}} opts
 * @returns {Promise<{ok:boolean, query:string, added:number, ingested:Array<object>,
 *                    skipped:Array<object>, reason?:string}>}
 */
export async function fillGapForSection(section, {
  spec = null,
  count = DEFAULT_SOURCE_COUNT,
  kind = 'academic',
  signal,
  session = null,
  cfg = null,
  onProgress = null,
} = {}) {
  const report = (stage, detail = {}) => { try { onProgress?.(stage, detail); } catch { /* לא מפיל */ } };

  const query = buildGapQuery(section, { spec });
  const base = { ok: false, query, added: 0, ingested: [], skipped: [] };
  if (!query) return { ...base, reason: 'no-query' };

  await ensureMaterialStoreReady();

  const safeCfg = cfg || getProviderConfig();

  // סולם: אקדמי קודם, ואם חזר ריק — web. נמדד: מסלול academic מוסיף
  // "מאמרים אקדמיים שפיטים:" לשאילתה, ובנושאים בעברית זה לפעמים מאפס את
  // התוצאות לגמרי. עדיף מקור עיוני חי מאשר סעיף שנשאר חסום.
  const ladder = kind === 'academic' ? ['academic', 'web'] : [kind];
  let retrieval = null;
  let sources = [];
  const trail = [];

  for (const attemptKind of ladder) {
    report('search', { query, kind: attemptKind });
    retrieval = await retrieveSources({ query, kind: attemptKind, count, signal, session, cfg: safeCfg });
    trail.push(...(retrieval?.providerTrail || []));
    sources = Array.isArray(retrieval?.sources) ? retrieval.sources.filter((s) => s?.url) : [];
    if (retrieval?.ok && sources.length) break;
  }

  if (!sources.length) {
    return { ...base, providerTrail: trail, reason: retrieval?.failureReason || 'no-results' };
  }

  report('fetch', { count: sources.length });
  const pages = await fetchPagesText(sources.map((s) => s.url), { signal });
  const pageByUrl = new Map(pages.map((p) => [p.url, p]));

  const ingested = [];
  const skipped = [];
  let added = 0;
  // מקור שנמשך למילוי פער נכנס לקורס הפעיל — שלא יזלוג לראיות של קורס אחר.
  let ingestCourseId = null;
  try {
    const { deriveCourseIdForIngest } = await import('./activeCourseService');
    ingestCourseId = deriveCourseIdForIngest();
  } catch {}

  for (const source of sources) {
    const page = pageByUrl.get(source.url);
    const fullText = String(page?.text || '').trim();
    // המשתמש ביקש במפורש: טקסט מלא אם אפשר, אחרת תקציר מסומן — ולא לוותר על המקור.
    const useFull = page?.ok && fullText.length >= MIN_FULL_TEXT_CHARS;
    const text = useFull ? fullText.slice(0, MAX_PAGE_CHARS) : buildAbstractText(source);
    const strength = useFull ? 'full' : 'abstract';

    if (!useFull && text.length < MIN_ABSTRACT_CHARS) {
      skipped.push({ url: source.url, title: source.title, reason: 'too-thin' });
      continue;
    }

    // ה-URL שהאחזור מחזיר הוא לפעמים redirect של vertexaisearch (grounding chunks
    // של Gemini) — הוא פג ואינו מזהה את המקור. finalUrl אחרי המעקב הוא הכתובת האמיתית.
    const resolvedUrl = String(page?.finalUrl || '').trim() || source.url;
    const title = buildSourceTitle(source, page);

    const result = addMaterialDocument({
      title,
      text,
      source: 'gap-search',
      kind: 'retrieved-source',
      sourceUrl: resolvedUrl,
      strength,
      courseId: ingestCourseId,
    });

    if (result.skipped) {
      // אותו מקור כבר באינדקס (הרצה קודמת / סעיף אחר) — לא כישלון.
      skipped.push({ url: resolvedUrl, title, reason: 'already-indexed' });
      continue;
    }
    if (!result.added) {
      skipped.push({ url: resolvedUrl, title, reason: 'no-chunks' });
      continue;
    }

    added += result.added;
    ingested.push({
      materialId: result.materialId,
      url: resolvedUrl,
      title,
      strength,
      chunks: result.added,
    });
  }

  if (!ingested.length) {
    return { ...base, ok: false, ingested: [], skipped, providerTrail: trail, reason: 'nothing-usable' };
  }

  // בלי הטמעה חוזרת ה-chunks החדשים ידורגו לקסיקלית בלבד וייתכן שלא יעברו את הסף.
  report('embed', { added });
  let remaining = Infinity;
  // embedTexts מטמיע אצווה מוגבלת בכל קריאה — לולאה עד שאין שאריות.
  for (let guard = 0; guard < 40 && remaining !== 0; guard += 1) {
    const res = await ensureMaterialsEmbedded();
    if (res.unavailable) break; // WASM לא זמין — המסלול הלקסיקלי עדיין עובד.
    remaining = res.remaining;
  }

  report('done', { added, ingested: ingested.length });
  return { ok: true, query, added, ingested, skipped, providerTrail: trail };
}

/**
 * מריץ fillGapForSection ואז משייך מחדש — מחזיר את מצב הראיות של הסעיף אחרי
 * הסגירה, כדי שה-UI יוכל לומר "עבר מחסום ל-3 ראיות" בלי קריאה נוספת.
 */
export async function fillGapAndRematch(section, opts = {}) {
  const fill = await fillGapForSection(section, opts);
  if (!fill.ok) return { ...fill, evidence: null };
  const evidence = await findEvidenceForSection(section);
  return { ...fill, evidence };
}
