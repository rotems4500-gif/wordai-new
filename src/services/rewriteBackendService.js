// rewriteBackendService.js — בוחר את מנוע *הניסוח* (שכבת ה-LLM המקומית).
//
// למה שכבה נפרדת: אותה בעיה בדיוק שנפתרה ל-embeddings ב-
// [retrievalEmbeddingService](./retrievalEmbeddingService.js), ובאותו דגם —
// בחירה פעם אחת לסשן, הקפאת הבחירה, ואי-נפילה שקטה. ההבדל היחיד, והוא מהותי,
// מתועד למטה תחת "למה כאן מותר ליפול".
//
// שלוש דרגות:
//   · ollama — הדסקטופ. gemma3:4b מלא ב-GPU. הדרגה המובילה.
//   · webgpu — האתר. מודל קטן בדפדפן. **טרם מיושם** (ר' A3 בתוכנית) —
//     מוצהר כאן כדי שהתפר יהיה בנוי, ונבחר רק כשתהיה מאחוריו מימוש.
//   · none   — מסלול הכללים בלבד. עיגון 100%, אפס המצאות, אפס תלות.
//
// ---------- למה כאן מותר ליפול, ובאחזור אסור ----------
// ב-retrievalEmbeddingService נפילה בין מנועים היא **באג נתונים**: קורפוס שחציו
// הוטמע במודל אחד וחציו באחר נותן קוסינוסים חסרי מובן והתפלגות z שקרית, ולכן
// שם מחזירים null ולא מתחלפים באמצע.
//
// כאן ההפך. הדרגה הנמוכה (`none`) אינה שבורה — היא מסלול הכללים, שמפיק פרוזה
// מעוגנת 100% ועבר את הבנצ' לפני שהניסוח נכתב בכלל. לכן נפילה מ-ollama ל-none
// היא **דרגדציה מתוכננת**, לא כשל. מה שכן אסור הוא שהיא תהיה *שקטה*: המשתמש
// חייב לדעת באיזו דרגה נכתבה העבודה שלו, ולכן `reason` נשמר ומוצג.
//
// ---------- מה מגן על אפס-ההמצאות בכל דרגה ----------
// ארבעת השערים (עיגון / העתקה / נושא השאלה / אורך) יושבים ב-localRewriteService
// וחלים על הפלט של **כל** backend. זה מה שהופך מודל חלש ללא-מזיק: הוא אינו
// מייצר זבל אלא פשוט מנסח פחות משפטים, וכל מה שלא נוסח נופל למסלול הכללים.
//
// תלויות: platform + localRewriteService בלבד. LEAF כלפי המנוע.

import { isDesktopApp } from '../platform';
import {
  probeRewriteModel,
  getRewriteModelName,
  rewriteSectionEvidence,
  resetRewriteState,
} from './localRewriteService';

export const REWRITE_BACKEND = {
  OLLAMA: 'ollama',
  WEBGPU: 'webgpu',
  NONE: 'none',
};

const PREF_STORAGE_KEY = 'wordai_rewrite_backend';

let active = null;          // {backend, reason, detail} — מוקפא אחרי ensure
let ensurePromise = null;

/**
 * ההעדפה המבוקשת: 'auto' | 'ollama' | 'webgpu' | 'none'.
 * סדר: env (harness) → localStorage (UI) → 'auto'.
 */
export function getRewriteBackendPreference() {
  try {
    if (typeof process !== 'undefined' && process.env?.WORDAI_REWRITE_BACKEND) {
      return String(process.env.WORDAI_REWRITE_BACKEND).toLowerCase();
    }
  } catch {}
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(PREF_STORAGE_KEY);
      if (v) return String(v).toLowerCase();
    }
  } catch {}
  return 'auto';
}

/** קובע העדפה מתמשכת. דורש resetRewriteBackend כדי לתפוס (הבחירה מוקפאת). */
export function setRewriteBackendPreference(pref) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PREF_STORAGE_KEY, String(pref || 'auto').toLowerCase());
    }
  } catch {}
}

/** משחרר את ההקפאה — אחרי שינוי העדפה או אחרי שהמשתמש הפעיל את Ollama. */
export function resetRewriteBackend() {
  active = null;
  ensurePromise = null;
  resetRewriteState();
}

// WebGPU עדיין לא ממומש. מוחזר כאן כדי שהסיבה שתוצג למשתמש תהיה מדויקת
// ("לא נתמך עדיין") ולא מטעה ("החומרה שלך לא תומכת").
function webgpuStatus() {
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    return { ok: false, reason: 'הדפדפן אינו תומך ב-WebGPU' };
  }
  return { ok: false, reason: 'ניסוח ב-WebGPU עדיין לא ממומש' };
}

/**
 * בוחר מנוע פעם אחת ומקפיא. לעולם אינו זורק — הגרוע ביותר הוא דרגת `none`,
 * שהיא מסלול תקין.
 *
 * @returns {Promise<{backend:string, reason:(string|null), detail:(string|null)}>}
 */
export async function ensureRewriteBackend() {
  if (active) return active;
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    const pref = getRewriteBackendPreference();

    if (pref === 'none') {
      active = { backend: REWRITE_BACKEND.NONE, reason: null, detail: 'מסלול הכללים נבחר ידנית' };
      return active;
    }

    // Ollama: ב-'auto' רק בדסקטופ. באתר (https) הקריאה ל-http://127.0.0.1 היא
    // mixed-content והדפדפן חוסם אותה — ניסיון שם רק מבזבז timeout של 4 שניות
    // לפני כל בנייה. 'ollama' מפורש עוקף, כדי ש-harness ודפדפן-dev יוכלו לבדוק.
    if (pref === 'ollama' || (pref === 'auto' && isDesktopApp())) {
      const probe = await probeRewriteModel();
      if (probe.ok) {
        active = { backend: REWRITE_BACKEND.OLLAMA, reason: null, detail: `Ollama · ${getRewriteModelName()}` };
        return active;
      }
      // בקשה מפורשת שנכשלה ראויה לדיווח; 'auto' מתגלגל בשקט לדרגה הבאה.
      active = {
        backend: REWRITE_BACKEND.NONE,
        reason: pref === 'ollama' ? `Ollama לא זמינה — ${probe.reason}` : null,
        detail: probe.reason,
      };
      return active;
    }

    if (pref === 'webgpu' || pref === 'auto') {
      const gpu = webgpuStatus();
      if (gpu.ok) {
        active = { backend: REWRITE_BACKEND.WEBGPU, reason: null, detail: 'WebGPU' };
        return active;
      }
      active = {
        backend: REWRITE_BACKEND.NONE,
        reason: pref === 'webgpu' ? gpu.reason : null,
        detail: gpu.reason,
      };
      return active;
    }

    active = { backend: REWRITE_BACKEND.NONE, reason: null, detail: null };
    return active;
  })();

  return ensurePromise;
}

/** הדרגה הפעילה (או ברירת המחדל לפני ensure). סינכרוני — לתצוגה. */
export function getRewriteBackend() {
  return active ? active.backend : REWRITE_BACKEND.NONE;
}

/** האם שכבת הניסוח פעילה בכלל. */
export function isRewriteActive() {
  return getRewriteBackend() !== REWRITE_BACKEND.NONE;
}

/** תיאור קריא של הדרגה הפעילה — לשורת הסטטוס ב-Studio. */
export function describeRewriteBackend() {
  if (!active) return 'טרם נבדק';
  switch (active.backend) {
    case REWRITE_BACKEND.OLLAMA: return `ניסוח מקומי מלא (${active.detail})`;
    case REWRITE_BACKEND.WEBGPU: return 'ניסוח מקומי בדפדפן (WebGPU)';
    default: return 'מסלול כללים בלבד';
  }
}

/**
 * מנסח את ראיות הסעיף דרך הדרגה הפעילה.
 *
 * חתימה זהה ל-rewriteSectionEvidence כדי שהקורא לא ישתנה כשתתווסף דרגה.
 * דרגת `none` מחזירה מפה ריקה — הקורא מלחין בדיוק כמו היום.
 *
 * @returns {Promise<{byChunk:Object<string,string>, ok:number, failed:number}>}
 */
export async function rewriteEvidenceForSection(args) {
  const chosen = await ensureRewriteBackend();
  if (chosen.backend === REWRITE_BACKEND.OLLAMA) return rewriteSectionEvidence(args);
  // WEBGPU: כאן ייכנס המימוש (A3). עד אז הבחירה לעולם אינה מחזירה אותו.
  return { byChunk: {}, ok: 0, failed: 0 };
}
