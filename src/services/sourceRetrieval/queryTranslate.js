// queryTranslate.js — וריאנט אנגלי לשאילתה אקדמית עברית, במודל זול (קריאה אחת).
// הרקע: הקורפוס העברי של Google Scholar דל מאוד (נמדד: total_results 14–27 לשאילתות
// אמיתיות, ו-citedBy תמיד ריק בעברית) — חיפוש אנגלי מקביל הוא ההבדל בין "אין כלום"
// לספרות אמיתית. דלוק כברירת מחדל למסלול האקדמי; כיבוי מפורש: cfg.retrieval.autoTranslateAcademic === false.
//
// חוזה: fail-open תמיד. שגיאה/timeout/פלט חשוד ⇒ מחזירים '' והאחזור ממשיך בעברית בלבד.
// אין import של aiService (כיוון ה-import המותר הוא aiService → sourceRetrieval, לא הפוך).

import { GoogleGenerativeAI } from '@google/generative-ai';

const DEFAULT_TIMEOUT_MS = 6000;
const HEBREW_TEXT_PATTERN = /[֐-׿]/;

// hook לבדיקות (tools/test-bench): מזריק תחליף לקריאת המודל, כמו setVetModelTransport.
let translateModelTransport = null;
export const setTranslateModelTransport = (transport) => { translateModelTransport = transport; };

const callCheapTranslateModel = async ({ prompt, cfg }) => {
  if (typeof translateModelTransport === 'function') return translateModelTransport(prompt);
  const geminiKey = String(cfg?.gemini?.key || '').trim();
  if (!geminiKey) return ''; // אין מודל זול זמין — fail-open בשכבה שמעל
  const genAI = new GoogleGenerativeAI(geminiKey);
  // קריאה מכנית — בלי טוקני חשיבה.
  const mdl = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
  });
  const result = await mdl.generateContent(prompt);
  return result.response.text();
};

const withTimeout = (promise, timeoutMs) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`query translate timed out after ${timeoutMs}ms`)), timeoutMs)),
]);

// האם בכלל צריך וריאנט אנגלי: שאילתה אקדמית עם עברית, בלי כיבוי מפורש בקונפיג.
export const shouldTranslateAcademicQuery = ({ kind = '', query = '', cfg = null } = {}) =>
  kind === 'academic'
  && HEBREW_TEXT_PATTERN.test(String(query || ''))
  && cfg?.retrieval?.autoTranslateAcademic !== false;

// מתרגם שאילתת חיפוש אקדמית לאנגלית תמציתית. מחזיר '' בכל כשל (fail-open).
export const translateAcademicQueryToEnglish = async ({
  query = '',
  cfg = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  log = () => {},
} = {}) => {
  const safeQuery = String(query || '').replace(/\s+/g, ' ').trim().slice(0, 420);
  if (!safeQuery || !HEBREW_TEXT_PATTERN.test(safeQuery)) return '';

  const prompt = [
    'Translate the following Hebrew academic search query into a concise English search query',
    'suitable for Google Scholar. Keep proper names and technical terms accurate.',
    'Return ONLY the English query text — no quotes, no explanation, one line.',
    '',
    safeQuery,
  ].join('\n');

  try {
    const text = await withTimeout(callCheapTranslateModel({ prompt, cfg }), timeoutMs);
    const translated = String(text || '').replace(/```[a-z]*|```/gi, '').split('\n').map((line) => line.trim()).filter(Boolean)[0] || '';
    // sanity: תוצאה חייבת להיות לטינית-בעיקרה, לא ריקה ולא ארוכה מדי (מודל שמסביר במקום לתרגם).
    const clean = translated.replace(/^["'"]+|["'"]+$/g, '').trim().slice(0, 220);
    if (!clean || clean.length < 4 || HEBREW_TEXT_PATTERN.test(clean) || !/[a-z]/i.test(clean)) {
      log('source-query-translate-failed', 'תרגום שאילתה: פלט חשוד מהמודל — ממשיכים בעברית בלבד', { state: 'info' });
      return '';
    }
    log('source-query-translate', `וריאנט אנגלי לשאילתה האקדמית: "${clean}"`, { state: 'info', translatedQuery: clean });
    return clean;
  } catch (error) {
    log('source-query-translate-failed', `תרגום שאילתה נכשל (${error?.message || 'שגיאה'}) — ממשיכים בעברית בלבד`, {
      state: 'info', errorMessage: error?.message || '',
    });
    return '';
  }
};
