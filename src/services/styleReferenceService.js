// styleReferenceService.js — טעינה עצלה של נכס-ייחוס האוכלוסייה (Style Reference Corpus).
//
// מודול LEAF: מייבא אך ורק את קובץ הנתונים (styleReferenceCorpus.data.js) בטעינה
// עצלה (import() דינמי בתוך פונקציה), בדיוק לפי הדפוס של synonymsService.js:16-29 —
// promise-cache יחיד ב-module state, הגנה מפני קובץ חסר/שבור (.catch → {}), ו-hook
// לעקיפה בבדיקות. לא מייבא דבר מ-styleProfileService (למניעת גרירת תלויות דפדפן/
// IndexedDB דרך styleSampleStore).
//
// שימוש טיפוסי:
//   const ref = await loadStyleReference();
//   const dist = getReferenceDistribution(ref, 'avgSentenceWords', genre);
//   const z = dist ? (userValue - dist.mean) / (dist.std || 1) : null;

// ---------------------------------------------------------------------------
// טעינה עצלה (promise יחיד ב-module state, ניתן לעקיפה בבדיקות)
// ---------------------------------------------------------------------------
let _refPromise = null;
let _testRef = null;

// עקיפת הנכס בבדיקות — מזריק fixture במקום קובץ הנתונים.
export function __setReferenceForTests(obj) {
  _testRef = obj || null;
  _refPromise = null; // איפוס cache כדי שהעקיפה תיתפס
  _cachedRef = obj || null; // מסנכרן גם את ה-accessor הסינכרוני המטמון
}

/**
 * טוען את נכס-ייחוס האוכלוסייה (עצלן, cached).
 * @returns {Promise<object>} STYLE_REFERENCE, או {} אם הקובץ חסר/שבור.
 */
export async function loadStyleReference() {
  if (_testRef) return _testRef;
  if (!_refPromise) {
    _refPromise = import('./styleReferenceCorpus.data.js')
      .then((mod) => {
        const ref = mod.STYLE_REFERENCE || {};
        _cachedRef = ref; // כל טעינה מוצלחת מחממת גם את ה-accessor הסינכרוני
        return ref;
      })
      .catch(() => ({})); // defensive: קובץ חסר/שבור → נכס ריק
  }
  return _refPromise;
}

// ---------------------------------------------------------------------------
// accessor סינכרוני מטמון — לקוראים סינכרוניים שאינם יכולים ל-await את
// loadStyleReference (buildStyleEngineInjectionBlock, scoreStyleMatchLocal בלולאת
// ה-rewrite). primeStyleReference() נקרא פעם אחת מנקודת async מוקדמת (למשל
// setStyleEngineEnabled) כדי לחמם את המטמון; getCachedReference() מחזיר את הנכס
// אם כבר נטען, אחרת {} — כך הקוד הסינכרוני נופל בחן להתנהגות הנוכחית.
// ---------------------------------------------------------------------------
let _cachedRef = null;

/** מחמם את המטמון הסינכרוני ברקע (fire-and-forget, לא זורק). */
export function primeStyleReference() {
  loadStyleReference().then((r) => { _cachedRef = r; }).catch(() => { /* noop */ });
}

/** מחזיר את הנכס המטמון אם נטען (דרך primeStyleReference/loadStyleReference), אחרת {}. */
export function getCachedReference() {
  return _cachedRef || {};
}

// ---------------------------------------------------------------------------
// עזרי גישה סינכרוניים — נקראים אחרי ש-loadStyleReference() נפתר
// ---------------------------------------------------------------------------

/**
 * מחזיר את התפלגות האוכלוסייה {mean, std} עבור מדד נתון.
 * מנסה קודם תת-פרופיל ז'אנר (אם ref.genres[genre] קיים ומכיל את המדד), ונופל
 * ל-global. מוגן מפני ref ריק/חסר.
 * @param {object} ref - התוצאה של loadStyleReference()
 * @param {string} metricKey
 * @param {string|null} genre
 * @returns {{mean:number, std:number}|null}
 */
export function getReferenceDistribution(ref, metricKey, genre = null) {
  if (!ref || typeof ref !== 'object' || !metricKey) return null;

  if (genre && ref.genres && typeof ref.genres === 'object') {
    const genreBlock = ref.genres[genre];
    const genreDist = genreBlock && typeof genreBlock === 'object' ? genreBlock[metricKey] : null;
    if (genreDist && Number.isFinite(Number(genreDist.mean)) && Number.isFinite(Number(genreDist.std))) {
      return { mean: Number(genreDist.mean), std: Number(genreDist.std) };
    }
  }

  const globalDist = ref.global && typeof ref.global === 'object' ? ref.global[metricKey] : null;
  if (globalDist && Number.isFinite(Number(globalDist.mean)) && Number.isFinite(Number(globalDist.std))) {
    return { mean: Number(globalDist.mean), std: Number(globalDist.std) };
  }

  return null;
}

/**
 * מחזיר את תדירות ה-n-gram באוכלוסייה (ל-100 מילים). 0 אם לא קיים.
 * @param {object} ref - התוצאה של loadStyleReference()
 * @param {string} ngram
 * @returns {number}
 */
export function getReferenceNgramFreq(ref, ngram) {
  if (!ref || typeof ref !== 'object' || !ngram) return 0;
  const table = ref.ngramFreq;
  if (!table || typeof table !== 'object') return 0;
  const value = Number(table[ngram]);
  return Number.isFinite(value) ? value : 0;
}

/**
 * מזהה אם נכס-הייחוס נבנה מקורפוס אמיתי (ולא bootstrap ידני מנוחש).
 * גיוד anchors ושקלול distinctiveness מותרים רק על ref אמיתי — ראה F4.
 * @param {object} ref
 * @returns {boolean}
 */
export function isRealReference(ref) {
  return ref?.meta?.builtFrom === 'corpus';
}

// חימום מוקדם בטעינת המודול: כך שהמטמון הסינכרוני (getCachedReference) חם בכל
// session ללא תלות ב-setStyleEngineEnabled — מונע {} ריק אצל משתמש חוזר שהמנוע כבר
// דלוק אצלו. fire-and-forget, לא זורק (primeStyleReference כבר עטוף).
primeStyleReference();
