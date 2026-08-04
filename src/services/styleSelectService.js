// styleSelectService.js — בחירת וריאנט ניסוח לפי הסגנון האישי (ניסיוני, כבוי כברירת מחדל).
//
// מה זה עושה: `composeSectionProseBest` מרכיב כמה וריאנטים לכל סעיף ובוחר את
// בעל הציון הנמוך ביותר. עד היום המנקד היה הדטקטור הגנרי בלבד ("נשמע כמו AI").
// כאן מוסיפים לו מרכיב שני — כמה הטקסט דומה לכתיבה של המשתמש עצמו, לפי
// Burrows's Delta (styleFingerprintService) — ומשקללים חצי-חצי.
//
// ⚠️ **הפיצ'ר משנה בחירה בלבד, לא ייצור.** אף משפט חדש לא נכתב בגללו, והעיגון
// לראיות אינו מושפע. אם הפרופיל אינו זמין/ולידי — נופלים לדטקטור לבדו בשקט.
//
// A/B שנמדד (mill-2026, 3 זרעים לזרוע, 2026-08-04):
//   off 25.0 · blend(w=0.5) 30.7 · only 32.0  (ציון סגנון, גבוה=טוב)
//   דטקטור 61.3 / 62.7 / 65.3 (נמוך=טוב) · עיגון 100% בכל הזרועות.
// זרוע `only` **נפסלה** — הדטקטור עלה ב-4.0 נק'. נשלח blend w=0.5 בלבד.
// ר' docs/nlg-handoff.md והמימוש המקורי ב-tools/test-bench/nlg-loop-round.mjs.

import {
  buildAuthorProfile, burrowsDelta, styleMatchScore,
} from './styleFingerprintService';
import {
  ensureSampleStoreReady, getChunks, getSampleDocuments, STYLE_SAMPLES_UPDATED_EVENT,
} from './styleSampleStore';
import {
  ensureMaterialStoreReady, getMaterialChunks, getMaterials, MATERIAL_CHUNKS_UPDATED_EVENT,
} from './materialChunkStore';

export const STYLE_SELECT_STORAGE_KEY = 'wordflow_style_select_v1';

// משקל הדטקטור בשקלול. הזרוע היחידה שעברה את השער.
export const STYLE_SELECT_BLEND_W = 0.5;

// ⚠️ עוגני הסקאלה **חייבים להימדד** — styleMatchScore עם קצוות מומצאים מחזיר
// מספר שנשמע מוסמך ואינו אומר דבר. שני המספרים כאן מכוילים ומועתקים ידנית מ-
// tools/test-bench/style-anchors.json (distance=cosine, AUC 0.945, 23 מסמכי
// משתמש מול 40 מסמכי בקרה). לא מייבאים מ-tools/ אל src/ — זה היה שובר את
// ה-build של האתר. כשהעוגנים נמדדים מחדש — לעדכן כאן ידנית.
export const STYLE_SELECT_ANCHORS = Object.freeze({
  distance: 'cosine',
  selfDelta: 0.8852903228178551,
  otherDelta: 1.0640795195486557,
});

// כמה מסמכי ייחוס לוקחים לכל היותר. מעבר לזה בניית הפרופיל מתארכת בלי תמורה
// (הבנצ' רץ על 40 והגיע ל-AUC 0.945).
const MAX_REFERENCE_DOCS = 40;

// ---------- הדגל ----------

/** @returns {boolean} ברירת מחדל: כבוי. */
export function isStyleSelectEnabled() {
  try {
    return localStorage.getItem(STYLE_SELECT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** @param {boolean} value */
export function setStyleSelectEnabled(value) {
  try {
    if (value) localStorage.setItem(STYLE_SELECT_STORAGE_KEY, '1');
    else localStorage.removeItem(STYLE_SELECT_STORAGE_KEY);
  } catch { /* מצב פרטי / אחסון חסום — הדגל פשוט לא נשמר */ }
  return Boolean(value);
}

// ---------- הפרופיל ----------

let profileState = { profile: null, fingerprint: '', reason: 'לא נבנה', docCount: 0, refCount: 0 };
let buildPromise = null;

/** מאחד chunks למסמכים שלמים לפי מזהה. buildAuthorProfile מודד מסמך, לא קטע. */
function joinChunksByDoc(chunks, idKey) {
  const byDoc = new Map();
  for (const c of chunks || []) {
    const id = String(c?.[idKey] || '');
    const text = String(c?.text || '');
    if (!id || !text) continue;
    if (!byDoc.has(id)) byDoc.set(id, []);
    byDoc.get(id).push(text);
  }
  return [...byDoc.values()].map((parts) => parts.join('\n\n'));
}

// טביעת אצבע של הקורפוס — הפרופיל נבנה מחדש רק כשהיא משתנה.
function corpusFingerprint() {
  try {
    const docs = getSampleDocuments() || [];
    const chunks = getChunks() || [];
    const mats = getMaterials() || [];
    const matChunks = getMaterialChunks() || [];
    return `${docs.length}:${chunks.length}:${mats.length}:${matChunks.length}`;
  } catch {
    return '';
  }
}

/**
 * בונה (או מחזיר מהמטמון) את פרופיל הסגנון האישי לבחירת וריאנטים.
 * אסינכרוני ולא חוסם UI — הבחירה עצמה סינכרונית ורצה רק כשהפרופיל מוכן.
 *
 * מסמכי המחבר = העבודות שהמשתמש העלה למנוע הסגנון.
 * מסמכי הייחוס = חומרי העזר שנקלטו (מחברים אחרים, אותה שפה וז'אנר) — האוכלוסייה
 * שמולה מתקננים. ⚠️ styleReferenceCorpus.data.js **אינו** משמש כאן: הוא מכיל
 * סטטיסטיקות מצטברות (מדדים גלובליים + תדירויות n-גרם מילוליות) ולא טקסטים
 * גולמיים, ו-buildAuthorProfile דורש טקסטים. בלי מסמכי ייחוס הפרופיל חוזר
 * degenerate — הסקאלה שלו אינה תואמת את העוגנים, ולכן הפיצ'ר מנוטרל בשקט.
 *
 * @returns {Promise<{ready:boolean, reason:string, docCount:number, refCount:number}>}
 */
export function ensureStyleSelectProfile() {
  const fp = corpusFingerprint();
  if (profileState.profile && profileState.fingerprint === fp) {
    return Promise.resolve(describeStyleSelect());
  }
  if (buildPromise) return buildPromise;

  buildPromise = (async () => {
    try {
      await Promise.all([
        Promise.resolve(ensureSampleStoreReady()).catch(() => null),
        Promise.resolve(ensureMaterialStoreReady()).catch(() => null),
      ]);

      const fingerprint = corpusFingerprint();
      const authorDocs = joinChunksByDoc(getChunks(), 'docId');
      const referenceDocs = joinChunksByDoc(getMaterialChunks(), 'materialId')
        .slice(0, MAX_REFERENCE_DOCS);

      if (authorDocs.length < 2) {
        profileState = { profile: null, fingerprint, reason: 'אין מספיק עבודות שלך', docCount: authorDocs.length, refCount: referenceDocs.length };
        return describeStyleSelect();
      }

      const profile = buildAuthorProfile(authorDocs, { referenceDocs });
      if (!profile) {
        profileState = { profile: null, fingerprint, reason: 'הטקסטים קצרים מדי למדידה', docCount: authorDocs.length, refCount: referenceDocs.length };
      } else if (profile.degenerate) {
        // אין מספיק חומרי ייחוס ⇒ התקנון מול המחבר לבדו ⇒ הסקאלה אינה תואמת
        // את העוגנים. נופלים לדטקטור בשקט במקום לדווח מספר שאינו ולידי.
        profileState = { profile: null, fingerprint, reason: 'אין מספיק חומרי ייחוס', docCount: profile.docCount, refCount: referenceDocs.length };
      } else {
        profileState = { profile, fingerprint, reason: '', docCount: profile.docCount, refCount: referenceDocs.length };
      }
      return describeStyleSelect();
    } finally {
      buildPromise = null;
    }
  })();
  return buildPromise;
}

/** @returns {{ready:boolean, reason:string, docCount:number, refCount:number}} */
export function describeStyleSelect() {
  return {
    ready: Boolean(profileState.profile),
    reason: profileState.reason,
    docCount: profileState.docCount,
    refCount: profileState.refCount,
  };
}

/** לבדיקות/החלפת קורפוס — מאלץ בנייה מחדש בקריאה הבאה. */
export function resetStyleSelectProfile() {
  profileState = { profile: null, fingerprint: '', reason: 'לא נבנה', docCount: 0, refCount: 0 };
}

// שינוי בקורפוס (העלאה/מחיקה) מבטל את הפרופיל; הוא ייבנה מחדש בקריאה הבאה.
if (typeof window !== 'undefined') {
  window.addEventListener(STYLE_SAMPLES_UPDATED_EVENT, resetStyleSelectProfile);
  window.addEventListener(MATERIAL_CHUNKS_UPDATED_EVENT, resetStyleSelectProfile);
}

// ---------- המנקד ----------

/**
 * עוטף מנקד דטקטור במרכיב סגנון אישי. **נמוך = טוב יותר**, כמו הדטקטור.
 *   score = 0.5·דטקטור + 0.5·(100 − styleMatchScore)
 * פרופיל לא מוכן / styleMatchScore מחזיר null (מדד מנוון או טקסט קצר) ⇒
 * הדטקטור לבדו, בלי לשנות התנהגות.
 *
 * @param {function} detectorFn למשל scoreTextAuthenticity
 * @returns {(text:string)=>number}
 */
export function makeBlendedScoreFn(detectorFn) {
  return (text) => {
    let detector = 50;
    try {
      const scored = detectorFn(text);
      const n = Number(scored?.score ?? scored);
      if (Number.isFinite(n)) detector = n;
    } catch { /* דטקטור נכשל — ניקוד ניטרלי, כמו ב-composeSectionProseBest */ }

    const profile = profileState.profile;
    if (!profile) return detector;
    try {
      const r = burrowsDelta(text, profile);
      const match = r ? styleMatchScore(r.cosineDelta, STYLE_SELECT_ANCHORS) : null;
      if (match == null) return detector;
      const styleCost = 100 - match;
      return (STYLE_SELECT_BLEND_W * detector) + ((1 - STYLE_SELECT_BLEND_W) * styleCost);
    } catch {
      return detector;
    }
  };
}
