// lock.js — נעילת מקורות לכתיבה: allowed-URL set + הנחיית grounding + audit על פלט.
//
// SourceLock נוצר פעם אחת אחרי אחזור, עובר (serialized) לכל continuation pass, ומבטיח:
//   1. המודל מקבל את רשימת המקורות המאומתים בלבד.
//   2. כל URL בפלט שלא ברשימה — נמחק (או שהפלט כולו נחסם בבקשת-מקורות טהורה).
//   3. כשאין מקורות: הנחיית [דרוש מקור] במקום גנרציה חופשית שקטה.

import { buildAllowedUrlSet, hasAllowedUrl } from './candidates';
import { extractDomainFromUrl, isUniversallyBlockedSourceDomain } from '../articleSourceValidation';

export const SOURCE_GROUNDING_FAILURE_TOKEN = 'NO_VERIFIED_SOURCES_FOUND';
// חוק קשיח: ויקיפדיה ורשתות/בלוגים אסורים כמקור תמיד — גם אם ה-URL איכשהו נכנס
// ל-allowedUrls. נבדק בכל audit על פלט מודל, בנוסף לחסימה ברמת האחזור (pipeline).
const isForbiddenSourceUrl = (url = '') => isUniversallyBlockedSourceDomain(extractDomainFromUrl(url));
const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>()]+/gi;
const FAKE_URL_REGEX = /(?:https?:\/\/|www\.)example\.(?:com|org|net)[^\s<>()]*|(?:^|[\s([{"'])\/example[^\s<>()\]]*/gi;

// allowPlaceholders: בהקשר מסמך/כתיבה — אין מקור ⇒ [דרוש מקור] וממשיכים לכתוב.
// בבקשת-מקורות טהורה — טוקן כישלון ישר.
export const buildSourceGroundingPrompt = ({ enforce = false, providerSupportsGrounding = false, allowPlaceholders = false } = {}) => {
  if (!enforce) return '';
  const noSourceDirective = allowPlaceholders
    ? 'לכל טענה שדורשת מקור ואין לך מקור אמיתי שנשלף בפועל עבורה — אל תמציא. כתוב במקום האזכור בדיוק "[דרוש מקור]" והמשך לכתוב את התוכן. לעולם אל תמציא כותרת, מחבר, ציטוט, תאריך, שם פרסום או URL כדי למלא חוסר.'
    : `אם אין לפחות מקור אמין אחד שנשלף בפועל, החזר בדיוק ${SOURCE_GROUNDING_FAILURE_TOKEN}.`;
  if (providerSupportsGrounding) {
    return [
      'בקשות למקורות, כתבות, DOI או URLs חייבות להיות מקורקעות בתוצאות אחזור אמיתיות בלבד.',
      'אסור לבנות URL ידנית, אסור להשלים slug, ואסור להמציא כותרות, שמות פרסום, מחברים, ציטוטים ישירים או תאריכי פרסום שנשמעים סבירים.',
      'צטט אך ורק מקורות, כותרות, מחברים וציטוטים שמופיעים במפורש בתוצאות שנשלפו. אם משהו לא מופיע בהן — הוא לא קיים עבורך.',
      noSourceDirective,
      'אם אתה כן מחזיר מקור, השתמש רק ב-URL וב-metadata כפי שהתקבלו במפורש מתוצאות האחזור.',
    ].join('\n');
  }

  return [
    'הבקשה הנוכחית דורשת מקורות או URLs, אבל למסלול הפעיל אין אחזור מאומת.',
    'אסור לך להמציא URL, DOI, כותרת מאמר, כתבה, שם כתב עת, מחבר, ציטוט ישיר, תאריך או גוף מפרסם.',
    noSourceDirective,
    'מותר לתאר מה חסר, אבל בלי לייצר קישור, ציטוט או מקור בדוי.',
  ].join('\n');
};

const formatLockedSourceLine = (source = {}, index = 0) => {
  const title = source.title || source.finalUrl || source.url || source.doi || 'מקור ללא כותרת';
  const parts = [`${index + 1}. ${title}`];
  if (source.summary) parts.push(`(${source.summary})`);
  if (source.year && !String(source.summary || '').includes(source.year)) parts.push(source.year);
  if (source.doi) parts.push(`DOI: ${source.doi}`);
  parts.push(source.finalUrl || source.url ? `— ${source.finalUrl || source.url}` : '— ללא URL זמין; אל תמציא URL עבור מקור זה');
  return parts.join(' ');
};

// הנחיית follow-on: המקורות שנשלפו + כללי שימוש בהם בכתיבה.
export const buildLockedSourcesPrompt = (sources = [], { expectDocumentOutput = false } = {}) => {
  const safeSources = (Array.isArray(sources) ? sources : []).filter((source) => source && (source.url || source.finalUrl || source.title || source.doi));
  if (!safeSources.length) return '';
  return [
    `לפני המענה בוצע אחזור של ${safeSources.length} מקורות מאומתים עבור הבקשה. אלה המקורות היחידים שמותר לצטט.`,
    'סינון רלוונטיות: ייתכן שחלק מהמקורות ברשימה משיקים לנושא אך לא ממש רלוונטיים למטלה. השתמש רק במקורות שקשורים ישירות לנושא המרכזי של הבקשה. התעלם ממקור שהקשר שלו לנושא עקיף או שולי.',
    expectDocumentOutput
      ? 'הסתמך רק על המקורות המאומתים שמופיעים להלן בעת כתיבת המסמך. אל תחזיר רשימת מקורות בלבד: כתוב את התוצר שהמשתמש ביקש ושלב את המקורות כהפניות בגוף הטקסט ליד הטענות הרלוונטיות.'
      : 'הסתמך רק על המקורות המאומתים שמופיעים להלן כדי לבצע את משימת ההמשך שהמשתמש ביקש.',
    expectDocumentOutput
      ? 'חובה לשלב בגוף המסמך אזכורים טבעיים למקורות שנשלפו, למשל לפי כותרת/מחבר/גוף מפרסם ושנה. מקור בלי URL עדיין תקף לאזכור ביבליוגרפי; אל תדלג עליו רק כי אין קישור.'
      : '',
    'אסור להוסיף או להמציא URL, DOI, מקור, כותרת, גוף מפרסם או כתבה שלא מופיעים במפורש ברשימה הזו.',
    // אכיפה מפורשת נגד ציטוטי-פרוזה מומצאים — ה-audit חוסם URLs מומצאים אבל לא (מחבר, שנה) בלי קישור.
    'אסור בהחלט לכתוב ציטוט בסגנון (מחבר, שנה) או "המחקר של X" אלא אם אותו מקור מופיע ברשימה למטה. אל תשלים ביבליוגרפיה ממאגר הידע שלך.',
    'אין להשתמש בסימוני ציטוט ממוספרים כמו [1].',
    'אסור לתאר את המקורות בפרוזה בסגנון "האתר מציין" או "ויקיפדיה מדגישה" — שלב את המידע בכתיבה טבעית עם אזכור מחבר/כותרת ושנה.',
    `סך הכל מותר לצטט בדיוק ${safeSources.length} מקורות. אם דרושים יותר מקורות ממה שנשלף — כתוב "[דרוש מקור]" במקום הציטוט החסר, אל תמציא מחבר, שנה או מחקר.`,
    expectDocumentOutput
      ? 'חובה: בסוף המסמך הוסף חלק בכותרת <h2>מקורות</h2> ובתוכו <ul> שבו כל פריט מפרט כותרת, גוף מפרסם, תאריך, DOI אם קיים, ו-URL רק אם הוא מופיע ברשימה שלהלן. מקור ללא URL נשאר מקור ביבליוגרפי תקף, אבל אסור להמציא לו קישור.'
      : '',
    'רשימת המקורות המאומתים (היחידים המותרים):',
    safeSources.map(formatLockedSourceLine).join('\n'),
  ].filter(Boolean).join('\n');
};

// מסיר URLs ב-prose שלא ברשימה המאומתת, בלי לפגוע בשאר הטקסט.
const stripDisallowedInlineUrls = (text = '', allowedUrlSet = new Set()) => {
  const strippedUrls = [];
  const isKept = (url) => hasAllowedUrl(allowedUrlSet, url) && !isForbiddenSourceUrl(url);
  let result = String(text || '')
    .replace(/\[([^\]]+)\]\(\s*((?:https?:\/\/|www\.)[^\s)]+)\s*\)/gi, (match, label, url) => {
      if (isKept(url)) return match;
      strippedUrls.push(url);
      return label;
    })
    .replace(/<a\s[^>]*href=["']((?:https?:\/\/|www\.)[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (match, url, label) => {
      if (isKept(url)) return match;
      strippedUrls.push(url);
      return label;
    })
    .replace(URL_REGEX, (url) => {
      if (isKept(url)) return url;
      strippedUrls.push(url);
      return '';
    });
  result = result
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,;:])/g, '$1');
  return { text: result.trim(), strippedUrls };
};

const stripFailureBlock = (value = '') => String(value || '')
  .replace(new RegExp(SOURCE_GROUNDING_FAILURE_TOKEN, 'g'), '')
  .replace(/MISSING\s+\w+:[^<\n]*/gi, '')
  .replace(/בחר נושא, מקרה, קבוצה או שאלת מחקר[^<\n]*/g, '')
  .replace(/<p>\s*<\/p>/gi, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

// audit על פלט מודל. blockWhenNoneVerified: בבקשת-מקורות טהורה חוסמים הכל אם אין מאומתים;
// בהקשר מסמך/כתיבה לעולם לא חוסמים — רק מנקים URLs זרים.
export const auditTextAgainstAllowedUrls = (text = '', { allowedUrls = new Set(), blockWhenNoneVerified = false } = {}) => {
  let normalizedText = String(text || '').trim();
  if (!normalizedText) return { text: normalizedText, strippedUrls: [], blocked: false };
  if (!blockWhenNoneVerified) {
    normalizedText = stripFailureBlock(normalizedText);
    if (!normalizedText) return { text: '', strippedUrls: [], blocked: false };
  }
  const allowedUrlSet = buildAllowedUrlSet(allowedUrls);
  const fakeUrls = normalizedText.match(FAKE_URL_REGEX) || [];
  if (fakeUrls.length && blockWhenNoneVerified) {
    return {
      text: `${SOURCE_GROUNDING_FAILURE_TOKEN}\n\nנחסם פלט שכלל קישורי דוגמה או placeholder, כדי לא להציג מקורות מומצאים.`,
      strippedUrls: fakeUrls,
      blocked: true,
    };
  }
  const responseUrls = normalizedText.match(URL_REGEX) || [];
  if (!responseUrls.length) return { text: normalizedText, strippedUrls: [], blocked: false };
  const disallowedUrls = responseUrls.filter((url) => !hasAllowedUrl(allowedUrlSet, url) || isForbiddenSourceUrl(url));
  if (!disallowedUrls.length) return { text: normalizedText, strippedUrls: [], blocked: false };
  if (allowedUrlSet.size || !blockWhenNoneVerified) {
    return { ...stripDisallowedInlineUrls(normalizedText, allowedUrlSet), blocked: false };
  }
  return {
    text: `${SOURCE_GROUNDING_FAILURE_TOKEN}\n\nנחסם פלט שכלל URLs שלא הופיעו באחזור המאומת, כדי לא להציג מקורות מומצאים.`,
    strippedUrls: disallowedUrls,
    blocked: true,
  };
};

export class SourceLock {
  constructor({ sources = [], workspaceId = '', runId = '', expectDocumentOutput = true } = {}) {
    this.sources = (Array.isArray(sources) ? sources : []).filter((source) => source && (source.url || source.finalUrl || source.title || source.doi));
    this.workspaceId = String(workspaceId || '');
    this.runId = String(runId || '');
    this.expectDocumentOutput = Boolean(expectDocumentOutput);
    // גם url המקורי וגם finalUrl (אחרי redirects) מותרים — המודל עשוי לצטט כל אחד מהם.
    this.allowedUrls = buildAllowedUrlSet(this.sources.flatMap((source) => [source.url, source.finalUrl]));
  }

  get groundingPrompt() {
    if (!this.sources.length) {
      // אין מקורות: כתיבה עם [דרוש מקור], בלי המצאות.
      return buildSourceGroundingPrompt({ enforce: true, providerSupportsGrounding: false, allowPlaceholders: this.expectDocumentOutput });
    }
    return [
      buildLockedSourcesPrompt(this.sources, { expectDocumentOutput: this.expectDocumentOutput }),
      buildSourceGroundingPrompt({ enforce: true, providerSupportsGrounding: true, allowPlaceholders: this.expectDocumentOutput }),
    ].filter(Boolean).join('\n\n');
  }

  auditResponse(text = '', { blockWhenNoneVerified = false } = {}) {
    return auditTextAgainstAllowedUrls(text, { allowedUrls: this.allowedUrls, blockWhenNoneVerified });
  }

  serialize() {
    return {
      __sourceLock: 1,
      sources: this.sources,
      workspaceId: this.workspaceId,
      runId: this.runId,
      expectDocumentOutput: this.expectDocumentOutput,
    };
  }

  static from(value) {
    if (value instanceof SourceLock) return value;
    if (!value || typeof value !== 'object' || !value.__sourceLock) return null;
    return new SourceLock(value);
  }
}

export const lockSources = (sources = [], { workspaceId = '', runId = '', expectDocumentOutput = true } = {}) =>
  new SourceLock({ sources, workspaceId, runId, expectDocumentOutput });
