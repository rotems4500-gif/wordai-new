// runScope.js — RunScope: גבול מפורש לכל פעולת משתמש. הלב של פתרון זיהום-ההקשר.
//
// העיקרון: רק פעולת משתמש יוצרת scope (הודעה בצ'אט חדש, ניקוי צ'אט, החלפת workspace,
// בחירת סוכן מקורות). כל מה שנגזר בתוך ה-run — שאילתות אחזור, SourceLock, תקציב,
// ביטול — קשור ל-scope הזה בלבד. אין ירושה שקטה מנושא קודם.

import { createRetrievalSession } from '../../services/sourceRetrieval';
import { createCallLedger, DEFAULT_BUDGETS } from '../api/ledger';
import { isV3FlagEnabled } from '../flags';

// hash יציב לנושא — משמש לזיהוי "אותו נושא" בין בקשות באותו scope ולדחיית locks זרים.
const hashTopic = (workspaceId = '', topic = '') => {
  const input = `${String(workspaceId).trim().toLowerCase()}::${String(topic).trim().toLowerCase().replace(/\s+/g, ' ')}`;
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return `t${Math.abs(hash).toString(36)}`;
};

const createRunId = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {}
  return `run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const createRunScope = ({
  origin = 'unknown',
  workspaceId = '',
  topic = '',
  documentContext = '',
  language = 'he',
  budget = null,
  enforceBudget = null,
  runId: providedRunId = '',
} = {}) => {
  // runId חיצוני (למשל doc-run קיים) נשמר לקורלציה עם הלוגים; אחרת נוצר חדש.
  const runId = String(providedRunId || '').trim() || createRunId();
  const budgetConfig = budget || DEFAULT_BUDGETS[origin] || DEFAULT_BUDGETS.unknown;
  // אכיפת תקציב: ברירת מחדל לפי flag שלב 5 (chatRun); אפשר לכפות/לכבות מפורשות.
  const enforce = typeof enforceBudget === 'boolean' ? enforceBudget : isV3FlagEnabled('chatRun');
  const scope = {
    runId,
    origin,
    workspaceId: String(workspaceId || '').trim(),
    topic: String(topic || '').trim(),
    topicId: hashTopic(workspaceId, topic),
    documentContext: String(documentContext || ''),
    language,
    createdAt: Date.now(),
    ledger: createCallLedger({ origin, ...budgetConfig, enforce }),
    retrievalSession: createRetrievalSession({ runId }),
    sourceLock: null,
    abortController: typeof AbortController !== 'undefined' ? new AbortController() : null,
  };
  return scope;
};

// עדכון נושא בתוך scope קיים (המשתמש ערך את שורת-הנושא לפני אחזור):
// topicId מתעדכן — lock ישן שנקשר לנושא הקודם נפסל אוטומטית.
export const setScopeTopic = (scope, topic = '') => {
  if (!scope) return scope;
  const cleanTopic = String(topic || '').trim();
  if (cleanTopic === scope.topic) return scope;
  scope.topic = cleanTopic;
  scope.topicId = hashTopic(scope.workspaceId, cleanTopic);
  scope.sourceLock = null; // נושא חדש ⇒ מקורות ישנים לא רלוונטיים
  return scope;
};

// SourceLock מוצמד ל-scope רק אם הוא נוצר עבורו. lock עם runId זר נדחה —
// זה המנגנון שמונע ממקורות של נושא ישן לחלחל לכתיבה על נושא חדש.
export const attachSourceLock = (scope, sourceLock, { onStaleLock = null } = {}) => {
  if (!scope || !sourceLock) return false;
  const lockRunId = String(sourceLock.runId || '').trim();
  if (lockRunId && lockRunId !== scope.runId) {
    onStaleLock?.({ scopeRunId: scope.runId, lockRunId });
    return false;
  }
  scope.sourceLock = sourceLock;
  return true;
};

export const abortRunScope = (scope) => {
  try { scope?.abortController?.abort(); } catch {}
};

// ---- registry: scope פעיל לכל משטח (סיידבר / workflow) ----
// משטח = מחרוזת ('sidebar' / `workflow:<id>`). scope חדש מחליף ומבטל את הקודם.
const activeScopes = new Map();

export const startRunScope = (surface, params = {}) => {
  const previous = activeScopes.get(surface);
  if (previous) abortRunScope(previous);
  const scope = createRunScope(params);
  activeScopes.set(surface, scope);
  return scope;
};

export const getActiveRunScope = (surface) => activeScopes.get(surface) || null;

export const endRunScope = (surface) => {
  const scope = activeScopes.get(surface);
  if (scope) abortRunScope(scope);
  activeScopes.delete(surface);
};
