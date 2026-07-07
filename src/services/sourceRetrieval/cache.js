// cache.js — RetrievalSession: cache run-scoped + תקציב קריאות.
//
// הבעיה שזה פותר: פעולת משתמש אחת (יצירת מסמך עם workflow) הפעילה עד 16-20 קריאות API
// כי כל agent/continuation שלף מקורות בנפרד. Session אחד per-run ⇒ אותה שאילתה = cache hit.

const QUERY_CACHE_TTL_MS = 5 * 60 * 1000;

export const DEFAULT_BUDGET = Object.freeze({
  // התקציב הוא backstop נגד לולאה פרועה, לא מגבלה הדוקה. session אחד משותף לכל הסוכנים
  // של workflow ("עבודה אקדמית כבדה" מריץ ~5 סוכנים, כל אחד שולף תוכנית רב-סעיפית). ה-cache
  // סופג כפילויות (אותה שאילתה = חינם), אבל שאילתות ייחודיות פר-סוכן דורשות תקרה גבוהה —
  // אחרת חדשות/web לא רצים כי האקדמי כבר שרף את התקציב.
  maxProviderCalls: 60,
  maxUrlChecks: 150,
  maxQueries: 40,
});

const buildCacheKey = ({ query = '', kind = 'web', count = 3 } = {}) =>
  `${kind}::${count}::${String(query || '').trim().toLowerCase().replace(/\s+/g, ' ')}`;

export class RetrievalSession {
  constructor({ runId = '', budget = {} } = {}) {
    this.runId = String(runId || `run-${Date.now().toString(36)}`);
    this.budget = { ...DEFAULT_BUDGET, ...(budget && typeof budget === 'object' ? budget : {}) };
    this.providerCalls = 0;
    this.urlChecks = 0;
    this.queries = 0;
    this.cache = new Map();
  }

  cacheKey(params) { return buildCacheKey(params); }

  getCached(params) {
    const entry = this.cache.get(buildCacheKey(params));
    if (!entry) return null;
    if (Date.now() - entry.at > QUERY_CACHE_TTL_MS) {
      this.cache.delete(buildCacheKey(params));
      return null;
    }
    return entry.result;
  }

  setCached(params, result) {
    this.cache.set(buildCacheKey(params), { at: Date.now(), result });
  }

  canQuery() { return this.queries < this.budget.maxQueries; }
  canCallProvider() { return this.providerCalls < this.budget.maxProviderCalls; }
  remainingUrlChecks() { return Math.max(0, this.budget.maxUrlChecks - this.urlChecks); }

  noteQuery() { this.queries += 1; }
  noteProviderCall() { this.providerCalls += 1; }
  noteUrlChecks(count = 0) { this.urlChecks += Math.max(0, Number(count) || 0); }

  stats() {
    return {
      runId: this.runId,
      providerCalls: this.providerCalls,
      urlChecks: this.urlChecks,
      queries: this.queries,
      budget: { ...this.budget },
    };
  }
}

export const createRetrievalSession = ({ runId = '', budget = {} } = {}) => new RetrievalSession({ runId, budget });

// session ברירת-מחדל מודולרי — צרכנים שלא מנהלים run מפורש עדיין נהנים מ-cache קצר-טווח.
// התקציב רחב יותר כי הוא חוצה-פעולות; מתאפס כל 5 דקות דרך ה-TTL של הרשומות.
let defaultSession = null;
let defaultSessionCreatedAt = 0;
export const getDefaultRetrievalSession = () => {
  const now = Date.now();
  if (!defaultSession || now - defaultSessionCreatedAt > QUERY_CACHE_TTL_MS) {
    defaultSession = new RetrievalSession({
      runId: 'default',
      budget: { maxProviderCalls: 20, maxUrlChecks: 80, maxQueries: 12 },
    });
    defaultSessionCreatedAt = now;
  }
  return defaultSession;
};
