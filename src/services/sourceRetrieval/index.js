// sourceRetrieval — מודול אחזור המקורות המאומת. ה-API הציבורי היחיד:
//
//   retrieveSources({query, kind, count, signal, session, cfg, logEvent})
//     → {ok, sources, providerTrail, fromCache, failureReason?}
//   lockSources(sources, opts) → SourceLock  (נעילת URLs לכתיבה + audit)
//   verifyUrls(urls, opts)     → verdicts    (בדיקת חיות ישירה)
//   formatSourcesReply / formatSourcesFailureReply — טקסט תשובה בעברית
//   createRetrievalSession     → cache+תקציב משותפים ל-run
//
// עקרונות: URL מגיע רק מ-metadata של ספק חיפוש; כל קישור נבדק חי לפני הצגה;
// כישלון אחזור בזרימת כתיבה ⇒ [דרוש מקור], לעולם לא המצאה שקטה.

export { retrieveSources } from './pipeline';
export {
  SourceLock,
  lockSources,
  buildSourceGroundingPrompt,
  auditTextAgainstAllowedUrls,
  SOURCE_GROUNDING_FAILURE_TOKEN,
} from './lock';
export { verifyUrls, setUrlVerifierTransport, isGoogleGroundingRedirectUrl } from './urlVerifier';
export { nonContentPageReason, filterNonContentCandidates } from './contentPageFilter';
export { vetSourceRelevance, setVetModelTransport } from './relevanceVet';
export { formatSourcesReply, formatSourcesFailureReply, formatSourceItem } from './format';
export { fetchScholarSources } from './providers/serpApiScholar';
export { extractGeminiGroundedSources } from './providers/geminiGrounded';
export { createRetrievalSession, RetrievalSession, getDefaultRetrievalSession, DEFAULT_BUDGET } from './cache';
export { buildAllowedUrlSet, hasAllowedUrl, canonicalizeSourceUrl, dedupeSources } from './candidates';
export {
  buildSourcesQueryOverride,
  isSourcesNewsRequest,
  buildHoleFillSourceQueryOverride,
} from '../sourceQueryBuilder';
