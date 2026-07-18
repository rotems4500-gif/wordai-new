// contentPageFilter.js — פילטר דטרמיניסטי (אפס קריאות API) לדפי "לא-תוכן":
// דפי בית של ספריות אוניברסיטאיות, עמודי מאגרי-מידע, אינדקסים של כתבי-עת, דפי
// קטלוג/חיפוש — דפים חיים ולגיטימיים שמנועי fallback (Gemini grounding, Perplexity)
// מחזירים לפעמים לשאילתות אקדמיות, אבל הם לעולם אינם מקור אקדמי בר-ציטוט.
//
// עיקרון: הפילטר רק מסיר. מועמד עם מטא-דאטה אקדמית מוצקה (doi / citedBy) לעולם
// לא נפסל — תוצאות Scholar הן מאמרים מעצם בנייתן.

import { normalizeUrl } from '../articleSourceValidation';
import { isLikelyDirectArticleUrl } from './validate';

// סגמנט path גנרי — עומק 1 עם אחד מאלה הוא עדיין "דף שער", לא תוכן.
const GENERIC_PATH_SEGMENTS = new Set([
  'index', 'index.html', 'index.htm', 'index.php', 'default', 'default.aspx',
  'home', 'main', 'he', 'en', 'iw', 'heb', 'eng', 'about', 'about-us', 'contact',
  'search', 'catalog', 'catalogue', 'category', 'categories', 'tags', 'tag',
  'login', 'signin', 'portal', 'sitemap', 'archive', 'archives', 'journals', 'journal',
  'publications', 'articles', 'library', 'libraries', 'databases', 'database', 'us',
]);

// רמזי ספרייה/מאגר-מידע בהוסט או ב-path — דפי שירות, לא מאמרים.
// גבולות [.-] כדי לתפוס גם med-lib.tau.ac.il וגם lib.huji.ac.il.
const LIBRARY_HOST_HINTS = /(?:^|[.-])(?:lib|library|libguides|primo|aleph|exlibris)(?:[.-])/i;
const LIBRARY_PATH_HINTS = /(?:\/(?:library|libraries|libguides|databases?|db-?for\w*|primo|opac)(?:\/|$))|(?:primo|exlibrisgroup|ebscohost?|proquest|libguides)\./i;

// רמזי כותרת של דף שירות (עברית + אנגלית). נבדקים רק בשילוב path רדוד — מאמר
// אמיתי *על* ספריות (path עמוק) לא נפסל בגלל המילה "ספרייה" בכותרת.
const SERVICE_TITLE_HINTS = /(?:מאגרי\s+מידע|הספרי+ה\s|ספריית\s|ספריי?ה\s+ל|קטלוג|דף\s+הבית|כתבי\s+עת\b|רשימת\s+כתבי|עמוד\s+הבית|^library\b|\blibrary\s+(?:home|guides|databases)|^databases?\b|\bjournal\s+(?:list|index)\b|\bhomepage\b|ברוכים\s+הבאים)/i;

const parseUrl = (value = '') => {
  const normalized = normalizeUrl(value);
  if (!normalized) return null;
  try {
    return new URL(normalized);
  } catch {
    return null;
  }
};

// מחזיר סיבת-פסילה קצרה, או '' אם הדף נראה כמו תוכן אמיתי.
export const nonContentPageReason = ({ url = '', title = '', doi = '', citedBy = 0 } = {}) => {
  // מטא-דאטה אקדמית מוצקה ⇒ מאמר. לא נוגעים.
  if (String(doi || '').trim() || (Number(citedBy) || 0) > 0) return '';

  const parsed = parseUrl(url);
  if (!parsed) return '';
  const segments = (parsed.pathname || '').split('/').filter(Boolean);
  const shallow = segments.length === 0
    || (segments.length === 1 && GENERIC_PATH_SEGMENTS.has(segments[0].toLowerCase()));

  const host = String(parsed.hostname || '').toLowerCase();
  const fullPath = `${parsed.pathname || ''}${parsed.search || ''}`;

  // ספרייה/מאגר-מידע: נפסל גם ב-path לא-רדוד — דף "מאגרים לריפוי בעיסוק" בספרייה
  // הוא עדיין דף שירות, לא מאמר. חריג: URL שנראה כמו מאמר ישיר (עומק/מזהה) עובר.
  if ((LIBRARY_HOST_HINTS.test(host) || LIBRARY_PATH_HINTS.test(`${host}${fullPath}`)) && !isLikelyDirectArticleUrl(url)) {
    return 'דף ספרייה/מאגר-מידע — לא מקור תוכן';
  }

  if (shallow) {
    // URL שורש או כמעט-שורש: דף בית/שער. כותרת-שירות מחזקת, אבל גם בלעדיה — דף
    // בית של אתר אינו מקור בר-ציטוט לנושא ספציפי.
    if (segments.length === 0) return 'דף בית של אתר (URL שורש) — לא מקור תוכן';
    if (SERVICE_TITLE_HINTS.test(String(title || ''))) {
      return 'דף שער/אינדקס (path רדוד + כותרת שירות) — לא מקור תוכן';
    }
    return 'דף שער כללי (path רדוד גנרי) — לא מקור תוכן';
  }

  return '';
};

// מסנן רשימת מועמדים. מחזיר {accepted, rejected:[{candidate, reason}]}.
export const filterNonContentCandidates = (candidates = []) => {
  const accepted = [];
  const rejected = [];
  (Array.isArray(candidates) ? candidates : []).filter(Boolean).forEach((candidate) => {
    const reason = nonContentPageReason({
      url: candidate.finalUrl || candidate.url,
      title: candidate.title,
      doi: candidate.doi,
      citedBy: candidate.citedBy,
    });
    if (reason) rejected.push({ candidate, reason });
    else accepted.push(candidate);
  });
  return { accepted, rejected };
};
