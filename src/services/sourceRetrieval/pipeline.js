// pipeline.js — אורקסטרטור אחזור המקורות. שבעה שלבים:
//   (1) נורמליזציית query  (2) סולם ספקים עם early-exit  (3) מועמדים מ-metadata בלבד
//   (4) ולידציית תוכן (חדשות)  (5) אימות URL חי  (6) dedup+דירוג  (7) cache.
//
// חוזה הפלט: כל Source שמוחזר עבר אימות URL חי (או סומן botBlocked), וה-URL שלו הגיע
// אך ורק מ-metadata של ספק חיפוש. אין מסלול שבו URL מטקסט של LLM מגיע לכאן.

import { extractDomainFromUrl, isUniversallyBlockedSourceDomain } from '../articleSourceValidation';
import { dedupeSources } from './candidates';
import { getDefaultRetrievalSession } from './cache';
import { fetchGeminiGroundedSources } from './providers/geminiGrounded';
import { fetchPerplexitySources } from './providers/perplexitySearch';
import { fetchScholarSources } from './providers/serpApiScholar';
import { makeRetrievalLogger } from './telemetry';
import { verifyUrls } from './urlVerifier';
import { analyzeQuery, buildArticleSearchQueryVariants, filterNewsCandidates, isKnownNewsDomain } from './validate';

const DEFAULT_TIMEOUT_MS = 45000; // מסגרת-על (מגבלת 45s של מסלולי Claude)
const PER_PROVIDER_TIMEOUT_MS = 20000;

const withTimeout = async (promise, timeoutMs, onTimeout) => {
  const safeTimeoutMs = Number(timeoutMs);
  if (!Number.isFinite(safeTimeoutMs) || safeTimeoutMs <= 0) return promise;
  let timerId = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timerId = setTimeout(() => {
          try { onTimeout?.(); } catch {}
          reject(new Error(`source retrieval timed out after ${safeTimeoutMs}ms`));
        }, safeTimeoutMs);
      }),
    ]);
  } finally {
    if (timerId !== null) clearTimeout(timerId);
  }
};

const normalizeKind = (kind = 'web') => {
  const safeKind = String(kind || '').trim().toLowerCase();
  return safeKind === 'academic' || safeKind === 'news' ? safeKind : 'web';
};

const normalizeQuery = (query = '') => String(query || '').replace(/\s+/g, ' ').trim().slice(0, 420);

// סולם הספקים לפי סוג הבקשה. כל attempt: {providerId, run(searchQuery, signal)}.
const buildAttempts = ({ kind, cfg, count, after }) => {
  const attempts = [];
  const scholarKey = String(cfg?.scholar?.key || '').trim();
  const scholarConfigured = String(cfg?.scholar?.provider || '').trim() === 'serpapi' && scholarKey;
  const perplexityKey = String(cfg?.perplexity?.key || '').trim();
  const geminiKey = String(cfg?.gemini?.key || '').trim();

  if (kind === 'academic' && scholarConfigured) {
    attempts.push({
      providerId: 'serpapi-scholar',
      endpointHost: 'serpapi.com',
      run: (searchQuery, signal, timeoutMs) => fetchScholarSources({
        query: searchQuery, apiKey: scholarKey, signal, timeoutMs, limit: count,
        yearLow: after ? Number(after.slice(0, 4)) : 0,
      }),
    });
  }
  if (perplexityKey) {
    attempts.push({
      providerId: 'perplexity-search',
      endpointHost: 'api.perplexity.ai',
      run: (searchQuery, signal, timeoutMs) => fetchPerplexitySources({
        query: searchQuery,
        apiKey: perplexityKey,
        model: cfg?.perplexity?.model,
        signal,
        timeoutMs,
        academic: kind === 'academic',
        news: kind === 'news',
        after,
        limit: count,
      }),
    });
  }
  if (geminiKey) {
    // גם במסלול אקדמי: Gemini+GoogleSearch הוא מדרגת נפילה אחרי Scholar/Perplexity —
    // קישורי ה-grounding-redirect שלו (vertexaisearch) נפתרים ל-URL האמיתי באימות החי.
    attempts.push({
      providerId: 'gemini-google-search',
      endpointHost: 'generativelanguage.googleapis.com',
      // בכוונה לא מעבירים את מודל-השיחה של המשתמש (2.5-pro איטי, נצפו timeouts של 20s):
      // חילוץ metadata של חיפוש לא צריך מודל כבד — ברירת המחדל של הספק היא flash.
      run: (searchQuery, _signal, _timeoutMs) => fetchGeminiGroundedSources({
        query: kind === 'academic' ? `מאמרים אקדמיים שפיטים: ${searchQuery}` : searchQuery,
        apiKey: geminiKey,
        limit: count,
      }),
    });
  }
  return attempts;
};

// שלב 5: אימות URL חי. מת ⇒ נזרק. botBlocked ⇒ נשאר מסומן. finalUrl הופך ל-URL תצוגה.
// כותרת "דומיין-בלבד": ריקה, שווה לדומיין, או נראית כמו host (bizportal.co.il).
// כאלה מגיעות מ-chunks של Gemini grounding שבהם web.title = הדומיין ולא שם הכתבה.
const isDomainLikeTitle = (title = '', domain = '') => {
  const t = String(title || '').trim().toLowerCase();
  if (!t) return true;
  const d = String(domain || '').trim().toLowerCase().replace(/^www\./, '');
  if (d && (t === d || t === `www.${d}`)) return true;
  return /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(t) && !/\s/.test(t);
};

// כיווץ per-domain — פריט ראשון לכל דומיין (סדר האחזור נשמר). ל-Gemini בלבד.
const dedupeByDomain = (sources = []) => {
  const seen = new Set();
  return (Array.isArray(sources) ? sources : []).filter((source) => {
    const domain = String(source?.domain || extractDomainFromUrl(source?.finalUrl || source?.url) || '').toLowerCase().replace(/^www\./, '');
    if (!domain) return true;                 // בלי דומיין — לא מכווצים
    if (seen.has(domain)) return false;
    seen.add(domain);
    return true;
  });
};

const applyLiveVerification = async ({ candidates, session, signal, log, requireLiveUrl }) => {
  if (!requireLiveUrl || !candidates.length) {
    return candidates.map((candidate) => ({ ...candidate, finalUrl: candidate.finalUrl || candidate.url }));
  }
  const budgetSlots = session.remainingUrlChecks();
  const toCheck = candidates.slice(0, budgetSlots);
  const skipped = candidates.slice(budgetSlots);
  if (skipped.length) {
    log('source-budget-exhausted', `תקציב בדיקות URL אזל: ${skipped.length} מועמדים לא נבדקו`, { skippedCount: skipped.length });
  }
  if (!toCheck.length) return [];

  const candidatesWithUrl = toCheck.filter((candidate) => String(candidate?.url || '').trim());
  const candidatesWithoutUrl = toCheck.filter((candidate) => !String(candidate?.url || '').trim());
  const survivors = candidatesWithoutUrl.map((candidate) => ({
    ...candidate,
    finalUrl: '',
    verification: {
      missingUrl: true,
      checkedAt: new Date().toISOString(),
      method: 'metadata-only',
    },
  }));
  if (candidatesWithoutUrl.length) {
    log('source-url-missing-kept', `${candidatesWithoutUrl.length} מקורות נשמרו ללא URL כי הגיעו מ-metadata של ספק אחזור`, {
      state: 'info',
      count: candidatesWithoutUrl.length,
    });
  }
  if (!candidatesWithUrl.length) return survivors;

  const urls = candidatesWithUrl.map((candidate) => candidate.url);
  session.noteUrlChecks(urls.length);
  log('source-url-verify-start', `בדיקת חיות ל-${urls.length} קישורים`, { urlCount: urls.length });
  const verdicts = await verifyUrls(urls, { signal });
  const verdictByUrl = new Map(verdicts.map((verdict) => [verdict.url, verdict]));

  candidatesWithUrl.forEach((candidate) => {
    const verdict = verdictByUrl.get(candidate.url);
    if (!verdict) return;
    if (verdict.dead) {
      log('source-url-verify-result', `קישור מת נזרק: ${candidate.url} (status=${verdict.status})`, {
        state: 'error', url: candidate.url, status: verdict.status, dropped: true,
      });
      return;
    }
    const finalUrl = verdict.finalUrl && verdict.finalUrl !== candidate.url ? verdict.finalUrl : candidate.url;
    const resolvedDomain = extractDomainFromUrl(finalUrl) || candidate.domain;
    // blocklist אוניברסלי (ויקיפדיה/רשתות/בלוגים) — נאכף בכל kind, גם academic (שם
    // filterNewsCandidates לא רץ). מונע מ-Wikipedia להופיע כמקור בניגוד לעיקרון.
    if (isUniversallyBlockedSourceDomain(resolvedDomain)) {
      log('source-domain-blocked', `דומיין חסום נזרק: ${finalUrl} (${resolvedDomain})`, {
        state: 'error', url: finalUrl, domain: resolvedDomain, dropped: true,
      });
      return;
    }
    // העשרת כותרת: אם הכותרת דומיין-בלבד (Gemini) והטרנספורט החזיר <title> אמיתי — נשתמש בו.
    const enrichedTitle = (verdict.title && isDomainLikeTitle(candidate.title, resolvedDomain))
      ? verdict.title : candidate.title;
    survivors.push({
      ...candidate,
      title: enrichedTitle,
      // finalUrl אחרי redirects הוא ה-URL שמוצג — פותר קישורי grounding-redirect של Google.
      url: finalUrl,
      finalUrl,
      domain: resolvedDomain,
      verification: {
        httpStatus: verdict.status,
        finalUrl,
        checkedAt: verdict.checkedAt,
        method: 'HEAD',
        ...(verdict.botBlocked ? { botBlocked: true } : {}),
      },
    });
    log('source-url-verify-result', `קישור אומת: ${finalUrl} (status=${verdict.status}${verdict.botBlocked ? ', bot-blocked' : ''})`, {
      state: 'success', url: finalUrl, status: verdict.status, botBlocked: Boolean(verdict.botBlocked),
    });
  });
  return survivors;
};

// דירוג: מאומת-חי לפני bot-blocked; אקדמי — לפי citedBy; חדשות — דומיין מוכר קודם.
const rankSources = (sources = [], kind = 'web') => [...sources].sort((left, right) => {
  const leftBlocked = left?.verification?.botBlocked ? 1 : 0;
  const rightBlocked = right?.verification?.botBlocked ? 1 : 0;
  if (leftBlocked !== rightBlocked) return leftBlocked - rightBlocked;
  if (kind === 'academic') {
    return (Number(right?.citedBy) || 0) - (Number(left?.citedBy) || 0);
  }
  if (kind === 'news') {
    const leftKnown = isKnownNewsDomain(left?.domain) ? 0 : 1;
    const rightKnown = isKnownNewsDomain(right?.domain) ? 0 : 1;
    if (leftKnown !== rightKnown) return leftKnown - rightKnown;
  }
  return 0;
});

const normalizeAfter = (value = '') => {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
};

// מסנן מקורות שתאריך-הפרסום שלהם קודם לסף. מסנן רק כשיש שנה במטא-דאטה — מקור בלי שנה
// לא נזרק (אי אפשר להוכיח שהוא ישן), אבל מסומן כדי שהמודל ידע לבדוק.
const filterSourcesByAfterDate = (sources = [], after = '', log = () => {}) => {
  if (!after) return sources;
  const cutoffYear = Number(after.slice(0, 4));
  if (!Number.isFinite(cutoffYear)) return sources;
  return sources.filter((source) => {
    const year = Number(source?.year);
    if (!Number.isFinite(year) || year <= 0) return true; // אין שנה — לא פוסלים
    if (year >= cutoffYear) return true;
    log('source-date-filtered', `מקור נפסל בגלל תאריך (${year} < ${cutoffYear}): ${source.finalUrl || source.url}`, {
      state: 'info', url: source.finalUrl || source.url, year, cutoffYear,
    });
    return false;
  });
};

export const retrieveSources = async ({
  query = '',
  kind = 'web',
  count = 3,
  after = '',
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  session = null,
  cfg = {},
  logEvent = null,
  requireLiveUrl = true,
} = {}) => {
  const log = makeRetrievalLogger(logEvent);
  const safeKind = normalizeKind(kind);
  const safeQuery = normalizeQuery(query);
  const safeCount = Math.max(1, Math.min(10, Number(count) || 3));
  const safeAfter = normalizeAfter(after);
  const activeSession = session || getDefaultRetrievalSession();
  const baseResult = { query: safeQuery, kind: safeKind, providerTrail: [], fromCache: false };

  if (!safeQuery) {
    return { ...baseResult, ok: false, sources: [], failureReason: 'no-results' };
  }

  // שלב 7 (קריאה): cache hit ⇒ אפס קריאות. מפתח ה-cache כולל את safeAfter (דרך count+kind+query
  // הוא לא ייחודי מספיק — אבל אותה שאילתה עם אותו after תיתן אותה תוצאה).
  const cacheParams = { query: `${safeQuery}::after=${safeAfter}`, kind: safeKind, count: safeCount };
  const cached = activeSession.getCached(cacheParams);
  if (cached) {
    log('source-cache-hit', `אחזור מה-cache: "${safeQuery}" (${cached.sources.length} מקורות, אפס קריאות API)`, {
      state: 'success', query: safeQuery, resultCount: cached.sources.length,
    });
    return { ...cached, fromCache: true };
  }

  if (!activeSession.canQuery()) {
    log('source-budget-exhausted', `תקציב שאילתות אזל (run=${activeSession.runId})`, { state: 'error', ...activeSession.stats() });
    return { ...baseResult, ok: false, sources: [], failureReason: 'budget-exhausted' };
  }
  activeSession.noteQuery();

  const attempts = buildAttempts({ kind: safeKind, cfg, count: safeCount, after: safeAfter });
  if (!attempts.length) {
    log('verified-source-provider-missing', `אין ספק אחזור מוגדר (kind=${safeKind})`, { state: 'error', query: safeQuery, kind: safeKind });
    return { ...baseResult, ok: false, sources: [], failureReason: 'no-provider' };
  }

  const queryMeta = analyzeQuery(safeQuery);
  // חדשות: וריאנטים של שאילתה (הטיה לאתרי חדשות) — מוגבל ל-2 כדי לא לשרוף את תקציב
  // קריאות ה-run על וריאציות של אותה שאילתה. אחרת — השאילתה עצמה.
  const searchQueries = safeKind === 'news'
    ? buildArticleSearchQueryVariants(safeQuery, queryMeta).slice(0, 2)
    : [safeQuery];

  const providerTrail = [];
  const deadlineAt = Date.now() + (Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS);
  let lastError = null;

  for (const attempt of attempts) {
    if (!activeSession.canCallProvider()) {
      log('source-budget-exhausted', `תקציב קריאות ספק אזל (run=${activeSession.runId})`, { state: 'error', ...activeSession.stats() });
      break;
    }
    const timeRemaining = deadlineAt - Date.now();
    if (timeRemaining <= 500) break;
    const providerTimeoutMs = Math.min(PER_PROVIDER_TIMEOUT_MS, timeRemaining);
    const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const startedAt = Date.now();

    for (const searchQuery of searchQueries) {
      if (!activeSession.canCallProvider()) break;
      activeSession.noteProviderCall();
      log('verified-source-provider-start', `אחזור מקורות: provider=${attempt.providerId} query="${searchQuery}"`, {
        state: 'running', provider: attempt.providerId, query: searchQuery, endpointHost: attempt.endpointHost,
      });
      try {
        const rawCandidates = await withTimeout(
          attempt.run(searchQuery, abortController?.signal, providerTimeoutMs),
          providerTimeoutMs,
          () => abortController?.abort(),
        );
        const candidates = dedupeSources(rawCandidates);
        log('verified-source-provider-result', `תוצאת אחזור: provider=${attempt.providerId} resultCount=${candidates.length}`, {
          state: candidates.length ? 'success' : 'error',
          provider: attempt.providerId,
          query: searchQuery,
          resultCount: candidates.length,
        });
        if (!candidates.length) continue;

        // שלב 4: אימות URL חי — לפני הוולידציה, כי קישורי grounding-redirect של Google
        // (vertexaisearch) חייבים להיפתר ל-URL/דומיין האמיתי; ולידציית דומיין-חדשות על
        // ה-redirect נכשלת תמיד ופוסלת מקורות אמיתיים.
        const verified = await applyLiveVerification({
          candidates, session: activeSession, signal, log, requireLiveUrl,
        });
        if (!verified.length) {
          log('verified-source-output-blocked', `כל הקישורים של ${attempt.providerId} מתים — עוברים לספק הבא`, {
            state: 'error', provider: attempt.providerId, query: searchQuery,
          });
          providerTrail.push({ providerId: attempt.providerId, resultCount: 0, ms: Date.now() - startedAt, error: 'all-dead-links' });
          continue;
        }

        // שלב 5: ולידציית תוכן לחדשות (דומיינים, שנים) — על ה-URL הסופי האמיתי.
        let validated = verified;
        if (safeKind === 'news') {
          const { accepted, rejected } = filterNewsCandidates(queryMeta, verified);
          rejected.forEach(({ candidate, reason }) => {
            log('verified-source-candidate-rejected', `מועמד נפסל: ${candidate.finalUrl || candidate.url} — ${reason}`, {
              state: 'error', url: candidate.finalUrl || candidate.url, reason,
            });
          });
          validated = accepted;
        }
        // שלב 5b: אכיפת דרישת-תאריך ("מ-2022", "אחרי 1.1.26") על מקורות עם שנה במטא-דאטה.
        validated = filterSourcesByAfterDate(validated, safeAfter, log);
        if (!validated.length) continue;

        // שלב 6: dedup סופי + דירוג + חיתוך.
        // Gemini grounding מחזיר לעיתים כמה chunks מאותו אתר (למשל 2× bizportal) —
        // אחרי אימות ה-domain האמיתי ידוע, אז מכווצים לפריט אחד לדומיין. שאר הספקים
        // (Perplexity/Scholar) לא מכווצים per-domain: שם לגיטימי כמה כתבות מאותו אתר.
        const collapsed = attempt.providerId === 'gemini-google-search'
          ? dedupeByDomain(validated) : validated;
        const sources = rankSources(dedupeSources(collapsed), safeKind).slice(0, safeCount);
        providerTrail.push({ providerId: attempt.providerId, resultCount: sources.length, ms: Date.now() - startedAt });
        const result = { ...baseResult, ok: true, sources, providerTrail };
        activeSession.setCached(cacheParams, result);
        return result;
      } catch (error) {
        lastError = error;
        log('verified-source-provider-error', `שגיאת אחזור: provider=${attempt.providerId} error="${error?.message || String(error)}"`, {
          state: 'error', provider: attempt.providerId, query: searchQuery, errorMessage: error?.message || String(error),
        });
      }
    }
    providerTrail.push({ providerId: attempt.providerId, resultCount: 0, ms: Date.now() - startedAt, error: lastError?.message || 'no-results' });
  }

  const timedOut = Date.now() >= deadlineAt;
  log('verified-source-output-blocked', `לא נמצאו מקורות מאומתים: query="${safeQuery}"`, {
    state: 'error', query: safeQuery, providerAvailable: true, blockedToAvoidHallucinatedSources: true,
  });
  return {
    ...baseResult,
    ok: false,
    sources: [],
    providerTrail,
    failureReason: timedOut ? 'timeout' : 'no-results',
    ...(lastError ? { error: lastError } : {}),
  };
};
