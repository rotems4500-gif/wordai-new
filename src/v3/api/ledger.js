// ledger.js — CallLedger: תקציב קריאות + טלמטריה לכל run.
//
// שלב 0 (baseline): ledger פסיבי — record() בלבד, בלי אכיפה, כדי למדוד כמה קריאות
// בפועל יוצאות לכל פעולת משתמש.
// שלב 3: tryConsume() נהיה אוכף — חריגה מהתקרה זורקת BUDGET_EXCEEDED.
//
// kinds: 'chat' | 'merge' | 'plan' | 'humanize' | 'retrieval' | 'cheap'

// תקרות לפי origin של ה-run. מתחילים רחב (סיכון 4 בתוכנית) — מהדקים לפי נתוני LAB.
export const DEFAULT_BUDGETS = {
  'sidebar-chat': { maxCalls: 8, maxRetrievalQueries: 6 },
  'sources-agent': { maxCalls: 10, maxRetrievalQueries: 10 },
  'hole-fill': { maxCalls: 10, maxRetrievalQueries: 10 },
  workflow: { maxCalls: 24, maxRetrievalQueries: 16 },
  draft: { maxCalls: 16, maxRetrievalQueries: 10 },
  unknown: { maxCalls: 24, maxRetrievalQueries: 16 },
};

export class BudgetExceededError extends Error {
  constructor({ kind, maxCalls, calls }) {
    super(`תקציב הקריאות של הפעולה אזל (${calls}/${maxCalls}, kind=${kind}) — הפעולה נעצרה כדי למנוע שריפת טוקנים`);
    this.name = 'BudgetExceededError';
    this.code = 'BUDGET_EXCEEDED';
    this.kind = kind;
  }
}

export const createCallLedger = ({
  origin = 'unknown',
  maxCalls = DEFAULT_BUDGETS.unknown.maxCalls,
  maxRetrievalQueries = DEFAULT_BUDGETS.unknown.maxRetrievalQueries,
  enforce = false,
  now = () => Date.now(),
} = {}) => {
  const events = [];
  let calls = 0;
  let retrievalQueries = 0;

  const stats = () => ({
    origin,
    calls,
    retrievalQueries,
    maxCalls,
    maxRetrievalQueries,
    enforce,
    inputTokens: events.reduce((sum, e) => sum + (e.usage?.inputTokens || 0), 0),
    outputTokens: events.reduce((sum, e) => sum + (e.usage?.outputTokens || 0), 0),
    errors: events.filter((e) => e.errorCode).length,
  });

  return {
    origin,
    events,

    // לפני קריאה: רושם צריכה. באכיפה — זורק BudgetExceededError כשהתקציב אזל.
    tryConsume({ kind = 'chat', provider = '', model = '', estTokens = 0 } = {}) {
      const isRetrieval = kind === 'retrieval';
      if (enforce) {
        if (isRetrieval && retrievalQueries >= maxRetrievalQueries) {
          throw new BudgetExceededError({ kind, maxCalls: maxRetrievalQueries, calls: retrievalQueries });
        }
        if (!isRetrieval && calls >= maxCalls) {
          throw new BudgetExceededError({ kind, maxCalls, calls });
        }
      }
      if (isRetrieval) retrievalQueries += 1;
      else calls += 1;
      events.push({ type: 'consume', at: now(), kind, provider, model, estTokens });
    },

    // אחרי קריאה: תוצאה/שגיאה + usage אם ידוע.
    record({ kind = 'chat', provider = '', model = '', usage = null, errorCode = '', durationMs = 0 } = {}) {
      events.push({ type: 'result', at: now(), kind, provider, model, usage, errorCode, durationMs });
    },

    stats,
  };
};

// ledger גלובלי פסיבי לשלב 0 — נדבק ל-chatWithActiveProvider הקיים כדי למדוד baseline.
// ב-window כדי שגם LAB וגם DevTools יוכלו לקרוא: window.__WORDAI_V3_LEDGER__.stats()
let passiveLedger = null;
export const getPassiveLedger = () => {
  if (!passiveLedger) {
    passiveLedger = createCallLedger({ origin: 'baseline', maxCalls: Infinity, maxRetrievalQueries: Infinity, enforce: false });
    try {
      if (typeof window !== 'undefined') window.__WORDAI_V3_LEDGER__ = passiveLedger;
    } catch {}
  }
  return passiveLedger;
};
