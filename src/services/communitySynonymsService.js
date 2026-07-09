// communitySynonymsService — שכבת נרדפות קהילתיים משותפת בFirestore
// משתמשים חדשים תורמים נרדפות, מתחזקים בעורך ועדות, ובסופו מותאמים במנוע העיקרי.
//
// שנות מודול: Map מקומי + localStorage persist + Firestore sync.
// בטוח לייבוא ב-Node (אין Firebase בTime of import, הכל dynamic).

import { analyzeHebrewWord, isHebrewWord } from './synonymsService.js';

// ---------------------------------------------------------------------------
// Module State
// ---------------------------------------------------------------------------
let _cache = new Map();                    // lemma → [{id, synonym, contextWords, status}...]
let _cacheLoadedAt = 0;                    // timestamp, for TTL check
let _metaVersion = null;                   // version from synonymsMeta/global
let _cachedPendingCount = 0;               // last known pending count

const CACHE_TTL_MS = 10 * 60 * 1000;      // 10 minutes
const STORAGE_KEY = 'wf_synonyms_community_v1';
const NORM_NIKUD = /[֑-ׇ]/g;              // nikud range
const NORM_QUOTES = /['"׳״''""]/g;         // quote chars
const NORM_PUNCT = /[^א-תa-zA-Z]+/g;      // non-letter chars

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function localNormalizeWord(input = '') {
  return String(input || '')
    .replace(NORM_NIKUD, '')
    .replace(NORM_QUOTES, '')
    .replace(NORM_PUNCT, '')
    .trim();
}

function tryLocalStorage(fn) {
  try {
    if (typeof localStorage === 'undefined') return null;
    return fn();
  } catch (e) {
    return null;
  }
}

function loadFromLocalStorage() {
  return tryLocalStorage(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  });
}

function saveToLocalStorage(data) {
  tryLocalStorage(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  });
}

// Hydrate _cache from localStorage on module init (sync, best-effort).
function hydrateFromLocalStorage() {
  const blob = loadFromLocalStorage();
  if (!blob || !Array.isArray(blob.entries)) return;

  _cache.clear();
  blob.entries.forEach(([lemma, entries]) => {
    _cache.set(lemma, entries);
  });
  _metaVersion = blob.version;
  _cachedPendingCount = blob.pendingCount || 0;
  _cacheLoadedAt = blob.savedAt || 0;
}

hydrateFromLocalStorage();

// טעינה עצלה של Firebase — מוחזר {app, auth, db, firestore} או זריקה/null.
// אותו דפוס init כמו src/firebase/services.js (long-polling ל-WebView2).
async function loadFirebaseBits() {
  const [{ getAuth }, firestore, config] = await Promise.all([
    import('firebase/auth'),
    import('firebase/firestore'),
    import('../firebase/config.js'),
  ]);
  if (!config.hasFirebaseConfig()) return null;
  const app = config.getFirebaseApp();
  let db;
  try {
    db = firestore.initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  } catch {
    db = firestore.getFirestore(app);
  }
  return { app, auth: getAuth(app), db, firestore };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Pure Map lookup — no IO. Returns empty array if lemma not found.
 */
export function getCommunitySynonymsSync(lemma) {
  if (!lemma) return [];
  const result = _cache.get(lemma);
  return Array.isArray(result) ? result : [];
}

/**
 * Ensure community cache is loaded from Firestore.
 * TTL: returns early if loaded recently (unless force=true).
 * Silent failures (returns empty object on cloud unavailable).
 */
export async function ensureCommunityCache({ force = false } = {}) {
  // Early exit: TTL check
  if (!force && Date.now() - _cacheLoadedAt < CACHE_TTL_MS) {
    return { pendingCount: _cachedPendingCount };
  }

  // Dynamic import Firebase (fail silently on error)
  let fb = null;
  try {
    fb = await loadFirebaseBits();
  } catch {
    fb = null;
  }
  if (!fb || !fb.auth?.currentUser) {
    return { pendingCount: _cachedPendingCount };
  }
  const { db, firestore } = fb;
  const { getDoc, getDocs, doc, collection, where, query } = firestore;

  try {
    // Read meta doc
    const metaRef = doc(db, 'synonymsMeta', 'global');
    const metaSnap = await getDoc(metaRef);
    const metaData = metaSnap.data() || {};

    // Compare version
    const newVersion = metaData.lastUpdatedAt?.toMillis?.() ?? String(metaData.lastUpdatedAt || '');
    if (newVersion === _metaVersion && _cache.size > 0) {
      // Cache is fresh, just update timestamp
      _cacheLoadedAt = Date.now();
      _cachedPendingCount = metaData.pendingCount ?? _cachedPendingCount;
      return { pendingCount: _cachedPendingCount };
    }

    // Fetch contributions (approved + pending)
    const queryRef = await getDocs(
      query(
        collection(db, 'synonymContributions'),
        where('status', 'in', ['pending', 'approved'])
      )
    );

    // Build new cache from docs
    const newCache = new Map();
    queryRef.forEach((docSnap) => {
      const data = docSnap.data();
      if (!data.lemma) return;

      const entry = {
        id: docSnap.id,
        synonym: data.synonym || '',
        contextWords: data.contextWords || [],
        status: data.status || 'pending',
      };

      if (!newCache.has(data.lemma)) {
        newCache.set(data.lemma, []);
      }
      newCache.get(data.lemma).push(entry);
    });

    // Replace cache and persist
    _cache = newCache;
    _metaVersion = newVersion;
    _cachedPendingCount = metaData.pendingCount || 0;
    _cacheLoadedAt = Date.now();

    // Persist to localStorage
    saveToLocalStorage({
      version: _metaVersion,
      savedAt: _cacheLoadedAt,
      pendingCount: _cachedPendingCount,
      entries: Array.from(_cache.entries()),
    });

    return { pendingCount: _cachedPendingCount };
  } catch (e) {
    // Query error — silent fail
    return { pendingCount: _cachedPendingCount };
  }
}

/**
 * Add a new community synonym contribution.
 * Validates inputs, extracts context, writes to Firestore in a transaction.
 * Optimistically updates local cache.
 */
export async function addCommunitySynonym({ word, synonym, sentence = '' }) {
  if (!word || !synonym) {
    return { ok: false, error: 'invalid' };
  }

  // Normalize and validate
  const lemma = analyzeHebrewWord(word).candidates[0]?.lemma || localNormalizeWord(word);
  const normSynonym = localNormalizeWord(synonym);

  if (!lemma || !normSynonym) {
    return { ok: false, error: 'invalid' };
  }

  if (!isHebrewWord(lemma) || !isHebrewWord(normSynonym)) {
    return { ok: false, error: 'invalid' };
  }

  if (lemma.length > 30 || normSynonym.length > 30) {
    return { ok: false, error: 'invalid' };
  }

  if (lemma === normSynonym) {
    return { ok: false, error: 'invalid' };
  }

  // Extract context words
  const contextWords = [];
  if (sentence) {
    const tokens = sentence.split(/[^א-תa-zA-Z]+/).filter((t) => t.length >= 2);
    for (const token of tokens) {
      if (contextWords.length >= 5) break;
      const norm = localNormalizeWord(token);
      if (norm && norm !== lemma && norm !== normSynonym) {
        contextWords.push(norm);
      }
    }
  }

  // Dynamic imports for Firestore write
  let fb = null;
  try {
    fb = await loadFirebaseBits();
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
  if (!fb) return { ok: false, error: 'no-firebase' };
  if (!fb.auth?.currentUser) return { ok: false, error: 'auth' };

  const { db, firestore } = fb;
  const { runTransaction, doc, collection, serverTimestamp } = firestore;

  let newPendingCount = _cachedPendingCount + 1;
  try {
    // Transaction: create contribution + update meta
    const uid = fb.auth.currentUser.uid;
    const newDocRef = doc(collection(db, 'synonymContributions'));
    const metaRef = doc(db, 'synonymsMeta', 'global');

    await runTransaction(db, async (tx) => {
      const metaSnap = await tx.get(metaRef);
      const metaData = metaSnap.exists() ? (metaSnap.data() || {}) : {};
      newPendingCount = (metaData.pendingCount || 0) + 1;

      // Write new contribution
      tx.set(newDocRef, {
        lemma,
        synonym: normSynonym,
        contextWords,
        createdBy: uid,
        createdAt: serverTimestamp(),
        status: 'pending',
        validatedAt: null,
        validationNote: '',
      });

      // Update meta (set+merge — המסמך אולי עוד לא קיים)
      tx.set(metaRef, {
        totalCount: (metaData.totalCount || 0) + 1,
        pendingCount: newPendingCount,
        lastUpdatedAt: serverTimestamp(),
      }, { merge: true });
    });

    // Optimistically update local cache
    if (!_cache.has(lemma)) {
      _cache.set(lemma, []);
    }
    _cache.get(lemma).push({
      id: newDocRef.id,
      synonym: normSynonym,
      contextWords,
      status: 'pending',
    });

    _cachedPendingCount++;

    // Persist to localStorage
    saveToLocalStorage({
      version: _metaVersion,
      savedAt: Date.now(),
      pendingCount: _cachedPendingCount,
      entries: Array.from(_cache.entries()),
    });

    return { ok: true, pendingCount: _cachedPendingCount };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Test helper: replace cache with given Map (or clear if null).
 * Skips localStorage, sets _cacheLoadedAt to now so TTL blocks IO.
 */
export function __setCommunityForTests(map) {
  if (map === null) {
    _cache.clear();
  } else if (map instanceof Map) {
    _cache = map;
  }
  _cacheLoadedAt = Date.now();
}

/**
 * Get last known pending count (from ensureCommunityCache or addCommunitySynonym).
 */
export function getCachedPendingCount() {
  return _cachedPendingCount;
}
