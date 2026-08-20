// styleTargetsStore.js — האחסון של פרופיל הסגנון המבני.
//
// למה חנות נפרדת מ-styleSampleStore, שכבר מחזיקה את העבודות: החנות ההיא שומרת
// **chunks**, והחיתוך מוחק את גבולות הפסקה. styleTargetsService נשען עליהם כדי
// להפריד פסקת פרוזה מכותרת ומשורת ביבליוגרפיה — ובלעדיהם הפרופיל היה נגזר מטקסט
// שכולל שורות שער וביבליוגרפיה, כלומר מודד את הפורמט ולא את הכתיבה.
//
// לכן המדידה נעשית **בזמן הקליטה**, כשהטקסט המלא עוד קיים, ומה שנשמר הוא
// ה**רשומה** (עשרה מספרים) ולא הטקסט. לזה שלוש תוצאות שכולן רצויות:
//   · העבודות של המשתמש אינן עוזבות את המכשיר גם כשהפרופיל מסתנכרן לענן.
//   · הוספת מסמך אחד אינה מחייבת למדוד מחדש את כל הקורפוס.
//   · הפרופיל קטן מספיק (מאות בתים) כדי לנסוע בכל מנגנון סנכרון.
//
// ⚠️ אותו פרופיל בדיוק מזין את האתר ואת האפליקציה. זו הסיבה שהמעבר האוכף
// (styleFitService) הוא דטרמיניסטי וללא מודל: שכבת הניסוח קיימת רק בדסקטופ,
// ולכן כל מה שנשען עליה מייצר פלט שונה בשני המקומות.
//
// תלויות: styleKvStore + styleTargetsService. אין תלות ב-UI.

import { idbGet, idbSet, isIdbAvailable } from './styleKvStore';
import {
  measureStyleTargets,
  aggregateStyleTargets,
  isValidStyleTargets,
  STYLE_TARGETS_STORAGE_KEY,
  STYLE_TARGETS_SCHEMA_VERSION,
} from './styleTargetsService';

export const STYLE_TARGETS_UPDATED_EVENT = 'wordai-style-targets-updated';

let cache = null;
let hydrated = false;
let hydratePromise = null;
let pendingWrite = null;
let lastWriteError = null;

const emptyBlob = () => ({ version: STYLE_TARGETS_SCHEMA_VERSION, records: [], targets: null, updatedAt: null });

function normalize(blob) {
  if (!blob || typeof blob !== 'object') return emptyBlob();
  // גרסת סכמה אחרת ⇒ הרשומות אינן בנות-השוואה. מוטב להתחיל מחדש מלגזור פרופיל
  // מתערובת של שתי הגדרות תכונה.
  if (blob.version !== STYLE_TARGETS_SCHEMA_VERSION) return emptyBlob();
  return {
    version: STYLE_TARGETS_SCHEMA_VERSION,
    records: Array.isArray(blob.records) ? blob.records : [],
    targets: isValidStyleTargets(blob.targets) ? blob.targets : null,
    updatedAt: blob.updatedAt || null,
  };
}

function emitUpdated() {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  try { window.dispatchEvent(new CustomEvent(STYLE_TARGETS_UPDATED_EVENT)); } catch {}
}

function persist() {
  const snapshot = cache;
  if (typeof window === 'undefined' || !snapshot) return Promise.resolve();
  pendingWrite = (async () => {
    if (isIdbAvailable()) {
      try {
        await idbSet(STYLE_TARGETS_STORAGE_KEY, snapshot);
        lastWriteError = null;
        return;
      } catch (err) {
        lastWriteError = `IndexedDB: ${String(err?.message || err)}`;
      }
    }
    try {
      localStorage.setItem(STYLE_TARGETS_STORAGE_KEY, JSON.stringify(snapshot));
      lastWriteError = null;
    } catch (err) {
      lastWriteError = String(err?.message || err);
    }
  })();
  return pendingWrite;
}

/** טוען פעם אחת. @returns {Promise<object>} ה-blob */
export function ensureStyleTargetsReady() {
  if (hydrated) return Promise.resolve(cache);
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    let loaded = null;
    if (isIdbAvailable()) {
      try {
        const stored = await idbGet(STYLE_TARGETS_STORAGE_KEY);
        if (stored) loaded = normalize(stored);
      } catch (err) {
        lastWriteError = `IndexedDB: ${String(err?.message || err)}`;
      }
    }
    if (!loaded && typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(STYLE_TARGETS_STORAGE_KEY);
        if (raw) loaded = normalize(JSON.parse(raw));
      } catch {}
    }
    cache = loaded || emptyBlob();
    hydrated = true;
    emitUpdated();
    return cache;
  })();

  return hydratePromise;
}

/**
 * פרופיל היעדים, או null. סינכרוני — מיועד לקוראים שכבר עשו ensure.
 *
 * ⚠️ null הוא **מסלול תקין**: המנוע רץ בברירות המחדל בדיוק כמו לפני שהשכבה
 * הזאת נכתבה. פרופיל שנגזר משני מסמכים גרוע מברירת מחדל, כי הוא נראה אישי בלי
 * להיות.
 */
export function getStyleTargets() {
  return cache?.targets || null;
}

/** כמה מסמכים כבר נמדדו — לתצוגה ולשלב קליטת הסגנון. */
export function getStyleTargetsStatus() {
  return {
    docCount: cache?.records?.length || 0,
    hasProfile: !!cache?.targets,
    updatedAt: cache?.updatedAt || null,
    writeError: lastWriteError,
  };
}

/**
 * מודד מסמך של המשתמש ומצרף אותו לפרופיל. זו נקודת החיבור היחידה שהשלב הבא
 * (קליטת סגנון ע"י המשתמש) צריך לקרוא לה.
 *
 * @param {string} text הטקסט המלא, **לפני** chunking
 * @param {{docId?:string}} opts docId מונע כפילות כשאותו מסמך נקלט שוב
 * @returns {Promise<object|null>} הפרופיל המעודכן
 */
export async function addStyleTargetDoc(text, { docId = null } = {}) {
  await ensureStyleTargetsReady();
  const record = measureStyleTargets(text);
  if (!record) return cache.targets;   // אין פסקאות פרוזה — לא מסמך כתיבה

  // מזהה אוטומטי חייב להיות ייחודי לאורך זמן: `d${length+1}` חוזר על עצמו אחרי
  // מחיקה ומוחק בשקט רשומה אחרת שכבר נושאת את המזהה הזה.
  const id = docId || `d${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const records = cache.records.filter((r) => r.docId !== id);
  records.push({ ...record, docId: id });

  cache = {
    ...cache,
    records,
    targets: aggregateStyleTargets(records, { derivedAt: new Date().toISOString() }),
    updatedAt: new Date().toISOString(),
  };
  await persist();
  emitUpdated();
  return cache.targets;
}

/** מסיר מסמך מהפרופיל (למשל כשהמשתמש מוחק דגימת סגנון). */
export async function removeStyleTargetDoc(docId) {
  await ensureStyleTargetsReady();
  const records = cache.records.filter((r) => r.docId !== docId);
  if (records.length === cache.records.length) return cache.targets;
  // כמו במסלול ההוספה — aggregateStyleTargets בלי derivedAt מאבד את חותמת הגזירה.
  cache = {
    ...cache,
    records,
    targets: aggregateStyleTargets(records, { derivedAt: new Date().toISOString() }),
    updatedAt: new Date().toISOString(),
  };
  await persist();
  emitUpdated();
  return cache.targets;
}

/** מאפס את הפרופיל. */
export async function clearStyleTargets() {
  await ensureStyleTargetsReady();
  cache = emptyBlob();
  await persist();
  emitUpdated();
}

/** ה-blob לסנכרון ענן. קטן — רשומות בלבד, בלי טקסט. */
export function exportStyleTargets() {
  return cache ? { ...cache } : emptyBlob();
}

/** קליטת blob מסנכרון ענן. הצד עם יותר מסמכים מנצח — סנכרון אינו מוחק עבודה. */
export async function importStyleTargets(blob) {
  await ensureStyleTargetsReady();
  const incoming = normalize(blob);
  if (incoming.records.length <= cache.records.length) return cache.targets;
  cache = incoming;
  await persist();
  emitUpdated();
  return cache.targets;
}

/** ממתין לסיום הכתיבה האחרונה. */
export function flushStyleTargets() {
  return Promise.resolve(pendingWrite);
}
