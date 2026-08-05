// validate.js — עטיפה דקה מעל articleSourceValidation (שנשאר מקור-האמת לוולידציית תוכן),
// + כלל ה-relax מ-aiService: מקור מדומיין חדשות מוכר עם URL "כתבתי" ישיר עובר גם בלי
// אימות דומיין-שני. אחרי המעבר לאימות URL חי כלל ה-relax פחות קריטי, אבל נשמר לוולידציית
// חדשות כדי לא לפסול עיתונות מקומית אמיתית.

import {
  analyzeQuery,
  buildArticleSearchQueryVariants,
  extractDomainFromUrl,
  isKnownNewsDomain,
  normalizeText,
  normalizeUrl,
  validateArticleCandidate,
} from '../articleSourceValidation';
import { areSourceUrlsEquivalent } from './candidates';

export { analyzeQuery, buildArticleSearchQueryVariants, isKnownNewsDomain, validateArticleCandidate };

export const isLikelyDirectArticleUrl = (value = '') => {
  const normalizedUrl = normalizeUrl(value);
  if (!normalizedUrl) return false;
  try {
    const parsed = new URL(normalizedUrl);
    const pathSegments = (parsed.pathname || '').split('/').filter(Boolean);
    return pathSegments.length >= 2 || pathSegments.some((segment) => /(?:\d{4,}|\.html?$)/i.test(segment));
  } catch {
    return false;
  }
};

const SECONDARY_DOMAIN_VALIDATION_REASON = 'לא נמצא אימות משני דומיינים ייחודיים של אתרי חדשות מוכרים לכתבה זו.';
// בדיקת הנאמנות-לנושא של validateArticleCandidate נבנתה לציד כתבה ספציפית ("מצא את הכתבה
// על אירוע X") — בחיפוש נושאי היא פוסלת כתבות אמיתיות ורלוונטיות (ynet/גלובס על הנושא) רק כי
// הכותרת לא מכילה את מילות השאילתה במדויק. הקידומות של שגיאות ההתאמה-לתוכן:
const CONTENT_MATCH_REJECTION_PREFIXES = [
  'הכתבה שנמצאה לא נאמנה מספיק',
  'לא נמצאה התאמה מפורשת לשנה המבוקשת',
];

// מסנן מועמדי-חדשות: מחזיר את המועמדים שעברו את validateArticleCandidate (או relax).
// topicMode (ברירת מחדל): חיפוש נושאי — בדיקות תוכן-מול-שאילתה רכות (מנוע החיפוש כבר
// דירג רלוונטיות); בדיקות אתר-חדשות/blocklist/דומיין נשארות קשיחות. exact-hunt (URL
// מדויק בשאילתה) שומר על הקשיחות המלאה.
// מסנן רלוונטיות דטרמיניסטי למועמדים אקדמיים — רץ לפני אימות ה-URL החי (חוסך verify calls).
// סלחני בכוונה: snippets של Scholar קצרים, אז נדרשת חפיפת מונח *אחת* בלבד (substring על
// טקסט מנורמל — עמיד לתחיליות עברית כמו ה/ב/ל). שאילתה עם <2 מונחי-תוכן לא מסננת כלל,
// ומועמד עם doi/citedBy מוגן (המטא-דאטה של Scholar כבר מעיד שזה מאמר אמיתי — אותו עיקרון
// כמו contentPageFilter). דחייה כאן היא רק על אפס-חפיפה מוחלט (למשל "Palestine, Duel at the
// Summit" לשאילתת לשון הרע — התוצאה האמיתית שנצפתה כשה-corpus העברי של Scholar דל).
export const filterAcademicCandidates = (queryMeta, candidates = []) => {
  const safeCandidates = (Array.isArray(candidates) ? candidates : []).filter(Boolean);
  const focusTokens = Array.isArray(queryMeta?.focusTokens) ? queryMeta.focusTokens.filter(Boolean) : [];
  if (focusTokens.length < 2) return { accepted: safeCandidates, rejected: [] };
  const accepted = [];
  const rejected = [];
  safeCandidates.forEach((candidate) => {
    if (candidate.doi || candidate.citedBy) {
      accepted.push(candidate);
      return;
    }
    const candidateText = normalizeText([candidate.title, candidate.snippet, candidate.summary].filter(Boolean).join(' '));
    const overlaps = candidateText && focusTokens.some((token) => candidateText.includes(token));
    if (overlaps) {
      accepted.push(candidate);
    } else {
      rejected.push({ candidate, reason: 'אפס חפיפה בין מונחי השאילתה לכותרת/תקציר (מסנן רלוונטיות אקדמי)' });
    }
  });
  return { accepted, rejected };
};

export const filterNewsCandidates = (queryMeta, candidates = [], { topicMode } = {}) => {
  const safeCandidates = (Array.isArray(candidates) ? candidates : []).filter(Boolean);
  const effectiveTopicMode = typeof topicMode === 'boolean' ? topicMode : !queryMeta?.exactUrl;
  const accepted = [];
  const rejected = [];
  safeCandidates.forEach((candidate) => {
    const article = {
      title: candidate.title,
      summary: candidate.summary,
      sourceName: candidate.sourceName || candidate.domain || extractDomainFromUrl(candidate.url),
      whyRelevant: candidate.snippet,
      url: candidate.finalUrl || candidate.url,
    };
    const validationError = validateArticleCandidate(queryMeta, article, safeCandidates, '');
    if (!validationError) {
      accepted.push(candidate);
      return;
    }
    // חיפוש נושאי: שגיאת התאמת-תוכן מגיעה רק אחרי שכל בדיקות אתר-החדשות עברו — מקבלים.
    if (effectiveTopicMode && CONTENT_MATCH_REJECTION_PREFIXES.some((prefix) => validationError.startsWith(prefix))) {
      accepted.push(candidate);
      return;
    }
    // relax: כשל רק על דומיין-שני, אבל הדומיין מוכר וה-URL נראה ככתבה ישירה ומופיע בתוצאות.
    const relaxed = validationError === SECONDARY_DOMAIN_VALIDATION_REASON
      && isKnownNewsDomain(extractDomainFromUrl(article.url))
      && isLikelyDirectArticleUrl(article.url)
      && safeCandidates.some((other) => areSourceUrlsEquivalent(other?.url, article.url) || areSourceUrlsEquivalent(other?.finalUrl, article.url));
    if (relaxed) {
      accepted.push(candidate);
    } else {
      rejected.push({ candidate, reason: validationError });
    }
  });
  return { accepted, rejected };
};
