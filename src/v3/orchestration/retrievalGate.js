// retrievalGate.js — הנקודה היחידה שמותר לה להפעיל אחזור מקורות מתוך צ'אט.
//
// החוזה שהורג את הזיהום: שאילתת האחזור נבנית מ-scope.topic ומה-prompt הנוכחי בלבד.
// אין קריאת היסטוריית צ'אט, אין fallback לשאילתה קודמת, אין מיזוג documentContext
// לפי היוריסטיקת אורך. כשאין נושא — מחזירים needsTopic במקום לנחש.

import { retrieveSources } from '../../services/sourceRetrieval';
import { deriveResearchTopicQuery } from '../../services/sourceQueryBuilder';

// ניקוי מינימלי של prompt לנושא: הסרת הוראות אחזור גנריות. בכוונה שמרני —
// אם אחרי הניקוי לא נשאר נושא ממשי, עדיף לשאול את המשתמש מאשר לנחש.
const stripRetrievalInstructions = (text = '') => String(text || '')
  .replace(/<[^>]+>/g, ' ')
  // רק ראש-ההוראה נמחק ("מצא לי 3 מקורות אקדמיים") — הנושא שאחריו נשמר.
  .replace(/(?:מצא|חפש|אתר|תן|תביא|הבא)\s+(?:לי\s+)?(?:עוד\s+)?\d*\s*(?:מקורות|כתבות|מאמרים|קישורים|לינקים|sources?|articles?|references?|links?)\s*(?:אקדמיים?|מאומתים|אמינים|חדשותיים)?\s*(?:בלבד)?/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/^(?:על|בנושא|לגבי|אודות)\s+/i, '')
  .trim();

// "תביא עוד 2" / "עוד מקורות" — בקשת המשך בלי נושא חדש.
const FOLLOW_UP_ONLY_PATTERN = /^(?:(?:תביא|תן|מצא|חפש|הבא)\s+)?(?:לי\s+)?עוד\s*\d*\s*(?:מקורות|כתבות|מאמרים|קישורים)?[.!?\s]*$/i;

export const deriveGateQuery = ({ scope, prompt = '' } = {}) => {
  const promptText = String(prompt || '').trim();
  const scopeTopic = String(scope?.topic || '').trim();

  // בקשת-המשך טהורה: חובה נושא קיים ב-scope. אין — שואלים, לא מנחשים.
  if (FOLLOW_UP_ONLY_PATTERN.test(promptText)) {
    return scopeTopic
      ? { query: scopeTopic, source: 'scope-topic-follow-up' }
      : { query: '', source: 'needs-topic' };
  }

  // נושא מפורש ב-scope (המשתמש אישר/ערך אותו) גובר תמיד.
  if (scopeTopic) return { query: scopeTopic, source: 'scope-topic' };

  // חילוץ נושא אמיתי מהפרומפט (פועל-כתיבה + "על X", "הנושא: X") לפני fallback הגולמי.
  const topicFromPrompt = deriveResearchTopicQuery(promptText);
  if (topicFromPrompt) return { query: topicFromPrompt, source: 'prompt-topic' };

  const cleaned = stripRetrievalInstructions(promptText);
  if (cleaned.length >= 6) return { query: cleaned.slice(0, 260), source: 'prompt' };

  return { query: '', source: 'needs-topic' };
};

// gateRetrieval — אחזור דרך השער: query מה-scope בלבד, session וledger של ה-run.
// מחזיר { ok, sources, needsTopic, query, ... } — needsTopic ⇒ הצ'אט שואל את המשתמש
// "על איזה נושא לחפש מקורות?" במקום לירות שאילתה מנוחשת.
export const gateRetrieval = async ({
  scope,
  prompt = '',
  kind = 'web',
  count = 3,
  after = '',
  cfg = {},
  logEvent = null,
  requireLiveUrl = true,
} = {}) => {
  if (!scope) throw new Error('gateRetrieval דורש RunScope — אין אחזור בלי גבול מפורש');

  const { query, source } = deriveGateQuery({ scope, prompt });
  if (!query) {
    return { ok: false, needsTopic: true, sources: [], query: '', querySource: source };
  }

  // תקציב: אחזור נספר ב-ledger של ה-run (זורק BUDGET_EXCEEDED באכיפה).
  scope.ledger.tryConsume({ kind: 'retrieval' });

  const result = await retrieveSources({
    query,
    kind,
    count,
    after,
    signal: scope.abortController?.signal,
    session: scope.retrievalSession,
    cfg,
    logEvent,
    requireLiveUrl,
  });

  return { ...result, needsTopic: false, querySource: source };
};
