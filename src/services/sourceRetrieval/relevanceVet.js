// relevanceVet.js — ווטינג רלוונטיות במודל זול (קריאה אחת batched לכל אחזור).
// כבוי כברירת מחדל (cfg.retrieval.vetRelevance === true מדליק) — הפילטר הדטרמיניסטי
// (contentPageFilter) ותיקוני השאילתות הם קו ההגנה הראשון; זה קו שני לשעת חירום.
//
// חוזה: fail-open תמיד. שגיאה/timeout/פלט לא-תקין ⇒ מחזירים את כל המקורות ללא שינוי.
// המודל רק *מסיר* — לעולם לא מוסיף/ממציא. אין import של aiService (כיוון ה-import
// המותר הוא aiService → sourceRetrieval, לא הפוך).

import { GoogleGenerativeAI } from '@google/generative-ai';

const DEFAULT_TIMEOUT_MS = 8000;

// hook לבדיקות (tools/test-bench): מזריק תחליף לקריאת המודל, כמו setUrlVerifierTransport.
let vetModelTransport = null;
export const setVetModelTransport = (transport) => { vetModelTransport = transport; };

const callCheapVetModel = async ({ prompt, cfg }) => {
  if (typeof vetModelTransport === 'function') return vetModelTransport(prompt);
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

const parseJsonArrayFromText = (text = '') => {
  const jsonText = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const start = jsonText.indexOf('[');
  const end = jsonText.lastIndexOf(']');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(jsonText.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const withTimeout = (promise, timeoutMs) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`relevance vet timed out after ${timeoutMs}ms`)), timeoutMs)),
]);

// בודק אילו מקורות שייכים לנושא. שמרני בכוונה: פוסל רק מקור שבבירור לא על הנושא.
export const vetSourceRelevance = async ({
  topic = '',
  sources = [],
  cfg = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  minKeep = 1,
  log = () => {},
} = {}) => {
  const safeSources = (Array.isArray(sources) ? sources : []).filter(Boolean);
  const material = String(topic || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
  if (safeSources.length < 2 || !material) return { sources: safeSources, vetted: false };

  const list = safeSources
    .map((source, index) => {
      const title = String(source.title || source.finalUrl || source.url || '').slice(0, 160);
      const snippet = source.snippet || source.summary
        ? ` — ${String(source.snippet || source.summary).slice(0, 160)}` : '';
      return `${index}. ${title}${snippet}`;
    })
    .join('\n');
  const prompt = [
    'להלן נושא מחקר, ואחריו רשימת מקורות ממוספרים (מ-0) שנשלפו בחיפוש.',
    'החזר JSON בלבד: מערך של מספרי המקורות ששייכים לנושא.',
    'פסול מקור רק אם הוא בבירור לא על הנושא — למשל בלוג כושר או דף שירות של ספרייה כשהנושא הוא הרגלי למידה.',
    'בספק — כלול. אל תפסול מקור רק כי הוא נוגע גם בהיבטים נוספים מעבר לנושא.',
    '',
    'הנושא:',
    material,
    '',
    'המקורות:',
    list,
  ].join('\n');

  try {
    const text = await withTimeout(callCheapVetModel({ prompt, cfg }), timeoutMs);
    const indices = parseJsonArrayFromText(text);
    if (!indices) {
      log('source-relevance-vet-failed', 'ווטינג רלוונטיות: פלט לא-תקין מהמודל — כל המקורות נשמרו', { state: 'info' });
      return { sources: safeSources, vetted: false };
    }
    const keep = new Set(indices.map((value) => Number(value)).filter((value) => Number.isInteger(value)));
    let filtered = safeSources.filter((_, index) => keep.has(index));
    if (filtered.length < minKeep) filtered = safeSources.slice(0, Math.max(minKeep, 1));
    const droppedCount = safeSources.length - filtered.length;
    if (droppedCount > 0) {
      log('source-relevance-vet', `ווטינג רלוונטיות: ${droppedCount} מקורות משיקים הוסרו (${filtered.length} נשמרו)`, {
        state: 'info', droppedCount, keptCount: filtered.length,
      });
    }
    return { sources: filtered, vetted: true };
  } catch (error) {
    log('source-relevance-vet-failed', `ווטינג רלוונטיות נכשל (${error?.message || 'שגיאה'}) — כל המקורות נשמרו`, {
      state: 'info', errorMessage: error?.message || '',
    });
    return { sources: safeSources, vetted: false, error: error?.message || '' };
  }
};
