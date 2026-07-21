// assignmentScaffoldStore.js — השלד הפעיל: ה-spec של המטלה + הראיות שנמצאו לכל סעיף.
//
// למה חנות ולא state ב-main.jsx: הסטודיו מייצר את השלד ואז נסגר, אבל *פאנל הראיות*
// חי בעורך ומתעדכן לפי הסעיף שהסמן נמצא בו. שניהם צריכים את אותו מקור אמת, והוא
// חייב לשרוד רענון דף. IndexedDB דרך styleKvStore + CustomEvent, כמו שאר המנוע.
//
// שלד אחד פעיל בכל רגע. זה מכוון: המשתמש כותב מטלה אחת. החלפה = דריסה.
//
// תלויות: styleKvStore (LEAF). browser-only.

import { idbGet, idbSet, idbDelete, isIdbAvailable } from './styleKvStore';

export const SCAFFOLD_STORAGE_KEY = 'wordai_assignment_scaffold_v1';
export const SCAFFOLD_SCHEMA_VERSION = 1;
export const SCAFFOLD_UPDATED_EVENT = 'wordai-assignment-scaffold-updated';

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

function defaultBlob() {
  return {
    schemaVersion: SCAFFOLD_SCHEMA_VERSION,
    updatedAt: 0,
    active: false,
    title: '',
    spec: null,
    evidence: {},      // sectionId → {evidence:[], gap:bool, mode:string}
    gaps: [],
    mode: 'none',
    materialIds: null, // null = כל החומרים
  };
}

function normalizeBlob(parsed) {
  if (!isPlainObject(parsed)) return defaultBlob();
  return {
    ...defaultBlob(),
    ...parsed,
    schemaVersion: SCAFFOLD_SCHEMA_VERSION,
    evidence: isPlainObject(parsed.evidence) ? parsed.evidence : {},
    gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
  };
}

let cache = null;
let hydratePromise = null;

/** @returns {Promise<object>} */
export function ensureScaffoldReady() {
  if (typeof window === 'undefined') return Promise.resolve(defaultBlob());
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    if (isIdbAvailable()) {
      try {
        const stored = await idbGet(SCAFFOLD_STORAGE_KEY);
        if (stored) {
          cache = normalizeBlob(stored);
          return cache;
        }
      } catch {}
    }
    cache = cache || defaultBlob();
    return cache;
  })();
  return hydratePromise;
}

function emitUpdated() {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(SCAFFOLD_UPDATED_EVENT));
  } catch {}
}

/** @returns {object} */
export function readScaffold() {
  if (typeof window === 'undefined') return defaultBlob();
  if (!cache) cache = defaultBlob();
  return cache;
}

/** שומר שלד פעיל. @returns {object} ה-blob שנשמר */
export function saveScaffold({ spec, evidence = {}, gaps = [], mode = 'none', materialIds = null, title = '' } = {}) {
  const blob = {
    schemaVersion: SCAFFOLD_SCHEMA_VERSION,
    updatedAt: Date.now(),
    active: Boolean(spec && Array.isArray(spec.sections) && spec.sections.length),
    title: title || spec?.title || 'מטלה',
    spec: spec || null,
    evidence: isPlainObject(evidence) ? evidence : {},
    gaps: Array.isArray(gaps) ? gaps : [],
    mode,
    materialIds,
  };
  cache = blob;
  if (isIdbAvailable()) {
    idbSet(SCAFFOLD_STORAGE_KEY, blob).catch(() => {});
  }
  emitUpdated();
  return blob;
}

/** מנקה את השלד הפעיל (סיום עבודה על המטלה). */
export function clearScaffold() {
  cache = defaultBlob();
  if (isIdbAvailable()) idbDelete(SCAFFOLD_STORAGE_KEY).catch(() => {});
  emitUpdated();
}

/** ראיות לסעיף בודד. @returns {{evidence:Array, gap:boolean}} */
export function getSectionEvidence(sectionId) {
  const blob = readScaffold();
  const hit = blob.evidence?.[sectionId];
  return isPlainObject(hit) ? hit : { evidence: [], gap: true };
}

if (typeof window !== 'undefined') {
  try { ensureScaffoldReady(); } catch {}
}
