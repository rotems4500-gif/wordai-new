// chatSourceCheck.js — אימות מקורות חי מתוך הצ'אט ("חבר ביקורתי").
//
// כשהמשתמש שואל על מקור קיים ("המקור הזה אמיתי?", "הקישור עובד?", "יש לזה מקור?")
// מאמתים את ה-URLs בבדיקה חיה (verifyUrls — Rust proxy בדסקטופ / Firebase function באתר)
// ומזריקים את התוצאות כהקשר לאותה קריאת צ'אט. המודל פוסק התאמת טענה-מקור רק
// מהראיות שסופקו — בלי לנחש סטטוס של URL (עקרון anti-hallucination).
//
// זה נתיב אימות בלבד: בקשת "תמצא לי מקורות" (find-new-sources) שייכת ל-pipeline
// האחזור של סוכני sources/holeFill ואסור לחטוף אותה כאן.

import { verifyUrls, isGoogleGroundingRedirectUrl } from './sourceRetrieval/urlVerifier';
import { classifySourceIntent } from './sourceIntent';
import { extractDomainFromUrl, isKnownNewsDomain, isUniversallyBlockedSourceDomain } from './articleSourceValidation';

export const CHAT_SOURCE_CHECK_MAX_URLS = 8;
// קריאת תוכן היא היקרה בשרשרת — קוראים רק את העמודים החיים הראשונים.
export const CHAT_SOURCE_CONTENT_MAX_PAGES = 3;
const PAGE_TEXT_TIMEOUT_MS = 8000;
const WEB_FETCH_PAGE_ENDPOINT = '/api/fetch-page-text';
const EXCERPT_MAX_COUNT = 3;
const EXCERPT_MAX_CHARS = 500;

const URL_PATTERN = /https?:\/\/[^\s"'<>()\]]+/gi;

// פעלים/ביטויי אימות — הבדיקה דורשת גם כוונת אימות וגם URL בהישג יד,
// כדי לא לירות על כל הודעה שמכילה קישור.
const VERIFY_INTENT_PATTERN = /(?:המקור(?:ות)?|הקישור(?:ים)?|הלינק(?:ים)?|האסמכתא(?:ות)?|הציטוט(?:ים)?)\s*(?:ה(?:זה|אלה|ללו))?\s*[\s\S]{0,40}?(?:אמיתי|קיים|תקין|עובד|נכון|מת|שבור|מזויף|בדוק|תבדוק|לבדוק|תאמת|לאמת|אמת)|(?:בדוק|תבדוק|תאמת|לאמת|אמת|ודא|תוודא)\s*[\s\S]{0,40}?(?:מקור|קישור|לינק|אסמכתא|ציטוט|URL)|(?:יש\s+ל(?:זה|כך|טענה)|האם\s+יש)\s*[\s\S]{0,20}?(?:מקור|אסמכתא|ביסוס)|(?:המקור|הקישור|הלינק)\s+(?:תומך|מבסס|מגבה)|יעבור\s+בדיקת\s+מרצה|verify\s+(?:the\s+)?(?:source|link|url|citation)|is\s+(?:this|the)\s+(?:source|link|url)\s+(?:real|valid|alive|working)/iu;

// "כל המקורות במסמך" — רק אז סורקים את תצלום המסמך המלא (אחרת רק prompt+קטע ממוקד,
// כדי לחסום latency של עשרות קישורים).
const ALL_DOCUMENT_SOURCES_PATTERN = /(?:כל|את\s+כל)\s+(?:ה)?(?:מקורות|קישורים|לינקים|אסמכתאות)\s*[\s\S]{0,20}?(?:במסמך|בעבודה|בטקסט)|(?:במסמך|בעבודה)\s*[\s\S]{0,20}?כל\s+(?:ה)?(?:מקורות|קישורים)/iu;

const extractUrls = (text = '') => {
  const matches = String(text || '').match(URL_PATTERN) || [];
  return matches
    .map((url) => url.replace(/[.,;:!?)\]]+$/, '').trim())
    .filter((url) => url && !isGoogleGroundingRedirectUrl(url));
};

const dedupe = (urls = []) => [...new Set(urls)];

// זיהוי בקשת אימות מקור מתוך הודעת צ'אט. מחזיר shouldCheck רק כשיש גם כוונת
// אימות מפורשת וגם URL לבדיקה, וכשה-intent אינו חיפוש מקורות חדשים.
export const detectSourceCheckRequest = (promptText = '', {
  selectedText = '',
  currentBlockText = '',
  documentSnapshotText = '',
  hasSourceLock = false,
} = {}) => {
  const prompt = String(promptText || '').trim();
  const noCheck = { shouldCheck: false, urls: [], claimText: '' };
  if (!prompt) return noCheck;
  if (!VERIFY_INTENT_PATTERN.test(prompt)) return noCheck;

  // בקשת חיפוש-חדש מנצחת: "תמצא לי מקור ותבדוק שהוא אמיתי" הולכת ל-pipeline האחזור.
  const { intent } = classifySourceIntent(prompt, { hasSourceLock });
  if (intent === 'find-new-sources') return noCheck;

  const scanAllDocument = ALL_DOCUMENT_SOURCES_PATTERN.test(prompt);
  const focusedScope = [prompt, selectedText, currentBlockText].filter(Boolean).join('\n');
  const urls = dedupe(scanAllDocument
    ? [...extractUrls(focusedScope), ...extractUrls(documentSnapshotText)]
    : extractUrls(focusedScope));
  if (!urls.length) return noCheck;

  // הטענה לבדיקה: הקטע הממוקד אם קיים, אחרת ההודעה עצמה.
  const claimText = String(selectedText || currentBlockText || prompt).replace(/\s+/g, ' ').trim().slice(0, 600);
  return { shouldCheck: true, urls, claimText, scanAllDocument };
};

// ── קריאת תוכן העמוד (חשיבה: לקשר את המקור לטענה, לא רק "חי/מת") ────────────

let injectedPageTextTransport = null;
// transport(urls, {signal, timeoutMs}) → [{url, ok, status, finalUrl, title, text}]
export const setPageTextTransport = (transport) => {
  injectedPageTextTransport = typeof transport === 'function' ? transport : null;
};

const emptyPageResult = (url, error = 'unavailable') => ({ url, ok: false, status: 0, finalUrl: '', title: '', text: '', error });

// fail-open: כשל בקריאת תוכן לא מפיל את הבדיקה — המקור נשאר עם verdict חיות בלבד
// והמודל מונחה לומר שהתוכן לא נקרא.
const fetchPagesText = async (urls = [], { signal } = {}) => {
  const safeUrls = (Array.isArray(urls) ? urls : []).map((url) => String(url || '').trim()).filter(Boolean);
  if (!safeUrls.length) return [];
  if (injectedPageTextTransport) {
    try {
      return await injectedPageTextTransport(safeUrls, { signal, timeoutMs: PAGE_TEXT_TIMEOUT_MS });
    } catch {
      return safeUrls.map((url) => emptyPageResult(url));
    }
  }
  if (typeof window !== 'undefined' && window.desktopApp?.fetchPageText) {
    return Promise.all(safeUrls.map(async (url) => {
      try {
        const result = await window.desktopApp.fetchPageText({ url, timeoutMs: PAGE_TEXT_TIMEOUT_MS });
        return { url, ok: Boolean(result?.ok), status: Number(result?.status) || 0, finalUrl: result?.finalUrl || '', title: String(result?.title || ''), text: String(result?.text || ''), error: String(result?.error || '') };
      } catch {
        return emptyPageResult(url);
      }
    }));
  }
  if (typeof fetch !== 'undefined') {
    try {
      const response = await fetch(WEB_FETCH_PAGE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: safeUrls }),
        signal,
      });
      const payload = response.ok ? await response.json().catch(() => null) : null;
      const returned = payload && Array.isArray(payload.results) ? payload.results : null;
      if (!returned) return safeUrls.map((url) => emptyPageResult(url));
      const byUrl = new Map(returned.map((item) => [item?.url, item]));
      return safeUrls.map((url) => {
        const item = byUrl.get(url);
        return item
          ? { url, ok: Boolean(item.ok), status: Number(item.status) || 0, finalUrl: item.finalUrl || '', title: String(item.title || ''), text: String(item.text || ''), error: String(item.error || '') }
          : emptyPageResult(url);
      });
    } catch {
      return safeUrls.map((url) => emptyPageResult(url));
    }
  }
  return safeUrls.map((url) => emptyPageResult(url));
};

// מפרק טענה למילות-מפתח משמעותיות (עברית/אנגלית/מספרים) להשוואה מול תוכן העמוד.
const extractClaimKeywords = (claimText = '') => {
  const tokens = String(claimText || '')
    .toLowerCase()
    .replace(/["'״׳“”(),.;:!?/\\\-—–]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 || /^\d+%?$/.test(token));
  // הסרת ה"א-הידיעה/ו-החיבור בראש מילה עברית — מעלה recall בהתאמה נאיבית.
  const stripped = tokens.map((token) => token.replace(/^(?:ו?ש?[הבלכמ]?)(?=[֐-׿]{3,})/u, ''));
  return [...new Set([...tokens, ...stripped])].filter((token) => token.length >= 3 || /^\d+%?$/.test(token));
};

// בוחר מהעמוד את הפסקאות הכי רלוונטיות לטענה (ניקוד חפיפת מילות-מפתח).
// אין התאמה ⇒ תחילת המאמר (עדיף הקשר כלשהו מכלום), עם דגל matched=false.
export const selectRelevantExcerpts = (pageText = '', claimText = '', {
  maxExcerpts = EXCERPT_MAX_COUNT,
  excerptChars = EXCERPT_MAX_CHARS,
} = {}) => {
  const paragraphs = String(pageText || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length >= 40);
  if (!paragraphs.length) return { excerpts: [], matched: false };
  const keywords = extractClaimKeywords(claimText);
  const scored = paragraphs.map((paragraph, index) => {
    const lowered = paragraph.toLowerCase();
    const score = keywords.reduce((acc, keyword) => acc + (lowered.includes(keyword) ? 1 : 0), 0);
    return { paragraph, index, score };
  });
  const matchedParagraphs = scored.filter((entry) => entry.score >= 2);
  const source = matchedParagraphs.length
    ? matchedParagraphs.sort((a, b) => b.score - a.score || a.index - b.index)
    : scored.slice(0, maxExcerpts);
  const excerpts = source
    .slice(0, maxExcerpts)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.paragraph.slice(0, excerptChars));
  return { excerpts, matched: matchedParagraphs.length > 0 };
};

const describeDomainCredibility = (url = '') => {
  const domain = extractDomainFromUrl(url);
  if (!domain) return 'לא מזוהה';
  if (isUniversallyBlockedSourceDomain(domain)) return 'חסום/לא קביל אקדמית';
  if (isKnownNewsDomain(domain)) return 'גבוהה (מקור חדשותי/מוסדי מוכר)';
  if (/\.(?:gov|gov\.il|edu|ac\.il|org)(?:$|\/)/.test(domain) || domain.endsWith('.gov') || domain.endsWith('.gov.il') || domain.endsWith('.edu') || domain.endsWith('.ac.il')) {
    return 'גבוהה (מוסדי/אקדמי)';
  }
  return 'לא מוכרת — דורש שיקול דעת';
};

const describeVerdictStatus = (result = {}) => {
  if (result.ok) {
    const redirected = result.finalUrl && result.finalUrl !== result.url ? `, הופנה ל-${result.finalUrl}` : '';
    return `קיים (HTTP ${result.status}${redirected})`;
  }
  if (result.botBlocked) {
    return result.status === 999
      ? 'לא ניתן היה לאמת (תקלת בדיקה — לא לפסול ולא לאשר)'
      : `כנראה קיים אך חוסם בוטים (HTTP ${result.status} — paywall/WAF)`;
  }
  return `לא נגיש (${result.status ? `HTTP ${result.status}` : 'כשל רשת/DNS'}) — ככל הנראה מת`;
};

// הרצת האימות החי. cap על מספר ה-URLs אלא אם המשתמש ביקש במפורש את כל המסמך.
// שלב 2 (חשיבה): לעמודים החיים הראשונים קוראים את התוכן בפועל ובוחרים פסקאות
// רלוונטיות לטענה — כדי שהמודל יפסוק "תומך/לא תומך" מציטוטים אמיתיים, לא מהשערה.
export const runChatSourceCheck = async ({ urls = [], signal, allowAll = false, claimText = '', readContent = true } = {}) => {
  const safeUrls = dedupe((Array.isArray(urls) ? urls : []).map((url) => String(url || '').trim()).filter(Boolean));
  const limitedUrls = allowAll ? safeUrls : safeUrls.slice(0, CHAT_SOURCE_CHECK_MAX_URLS);
  if (!limitedUrls.length) return { results: [], skippedCount: 0 };
  const results = await verifyUrls(limitedUrls, { signal });

  if (readContent) {
    const readableUrls = results
      .filter((result) => result.ok)
      .slice(0, CHAT_SOURCE_CONTENT_MAX_PAGES)
      .map((result) => result.finalUrl || result.url);
    if (readableUrls.length) {
      const pages = await fetchPagesText(readableUrls, { signal });
      const pageByUrl = new Map(pages.map((page) => [page.url, page]));
      results.forEach((result) => {
        const page = pageByUrl.get(result.finalUrl || result.url);
        if (!page) return;
        if (page.ok && page.text) {
          const { excerpts, matched } = selectRelevantExcerpts(page.text, claimText);
          result.pageTitle = page.title || '';
          result.excerpts = excerpts;
          result.excerptsMatchedClaim = matched;
          result.contentRead = true;
        } else {
          result.contentRead = false;
        }
      });
    }
  }

  return { results, skippedCount: safeUrls.length - limitedUrls.length };
};

// בלוק ההקשר שנוסע למודל באותה קריאה. המודל מונחה (ב-systemCtx של המרצה)
// להסתמך עליו בלבד לסטטוס URL.
export const formatSourceCheckContext = ({ results = [], skippedCount = 0, claimText = '' } = {}) => {
  if (!Array.isArray(results) || !results.length) return '';
  const lines = results.map((result, index) => {
    const header = `${index + 1}. ${result.url} — סטטוס: ${describeVerdictStatus(result)} — אמינות דומיין: ${describeDomainCredibility(result.finalUrl || result.url)}`;
    const contentLines = [];
    if (result.contentRead && Array.isArray(result.excerpts) && result.excerpts.length) {
      if (result.pageTitle) contentLines.push(`   כותרת העמוד: "${result.pageTitle}"`);
      contentLines.push(result.excerptsMatchedClaim
        ? '   קטעים מהעמוד שרלוונטיים לטענה:'
        : '   לא נמצאו קטעים תואמים לטענה — להלן תחילת העמוד:');
      result.excerpts.forEach((excerpt) => contentLines.push(`   > ${excerpt}`));
    } else if (result.ok && result.contentRead === false) {
      contentLines.push('   (תוכן העמוד לא נקרא — פסוק רק על סמך קיום, לא על התאמה)');
    }
    return [header, ...contentLines].join('\n');
  });
  const skippedLine = skippedCount > 0 ? `\n(${skippedCount} קישורים נוספים לא נבדקו בסבב זה — ציין זאת בתשובה)` : '';
  const claimLine = claimText ? `\nהטענה לבדיקה: "${claimText}"` : '';
  return `== SOURCE VERIFICATION RESULTS (בדיקה חיה, לא ניחוש) ==\n${lines.join('\n')}${skippedLine}${claimLine}\nלכל מקור פסוק: "מקור קיים ותומך בטענה" / "מקור קיים אך לא תומך בטענה" / "מקור לא נגיש". כשמצורפים קטעים מהעמוד — בסס את הפסיקה עליהם וצטט את המשפט הרלוונטי; אם הקטעים לא מאששים את הטענה, אמור זאת במפורש. מקור שחוסם בוטים או שתוכנו לא נקרא — ציין שקיומו סביר אך ההתאמה לא נבדקה.\n== END SOURCE VERIFICATION RESULTS ==`;
};
