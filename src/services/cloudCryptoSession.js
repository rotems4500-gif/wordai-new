// cloudCryptoSession.js — ניהול session של מפתח ה-E2EE + עיטוף providerConfig.
//
// ה-DEK הפתוח חי ב**זיכרון מודול בלבד** (המשתנה sessionDek למטה). הוא לא נכתב
// ל-localStorage / sessionStorage / דיסק / Firestore. refresh של הדף → המשתמש
// צריך לפתוח מחדש עם ה-passphrase (כמו unlock). זה מכוון: XSS לא יכול לדלות
// את המפתח מ-storage כי הוא לא שם.
//
// שכבה זו עדיין לא מחוברת ל-cloudSyncManager. היא רק מספקת את ה-glue.

import {
  encryptField,
  decryptField,
  isEncryptedField,
  createKeyBundle,
  unlockWithPassphrase as cryptoUnlockWithPassphrase,
  unlockWithRecoveryCode as cryptoUnlockWithRecoveryCode,
  rewrapWithNewPassphrase,
  regenerateRecoveryCode,
} from "./cloudCrypto";

// שמות שדות שתוכנם סוד ולכן מוצפן לפני עלייה לענן. נגזר ממבנה providerConfig:
//  - key:      gemini/openai/claude/groq/perplexity/custom/scholar/pexels/unsplash/
//              imageGen/chartEngine/copyleaks/featureOverrides.*.key
//  - stockKey, genKey: featureOverrides.*.image.*
// אפשר להעביר שמות נוספים (למשל שדות PII/תעודת זהות) דרך הארגומנט fieldNames.
export const SECRET_FIELD_NAMES = ["key", "stockKey", "genKey"];

// ---- state בזיכרון מודול בלבד ----
let sessionDek = null;        // ה-DEK הפתוח (CryptoKey), או null כשנעול

export function isUnlocked() {
  return Boolean(sessionDek);
}

// נעילה ידנית (logout / נעילה מפורשת). מאפס את ה-DEK מהזיכרון.
export function lockSession() {
  sessionDek = null;
}

// הגדרה ראשונה של passphrase. מחזיר { bundle, recoveryCode }:
//  - bundle: נשמר בענן (לא סודי).
//  - recoveryCode: מוצג למשתמש פעם אחת (לשמירה בצד) ואז נזרק מהזיכרון.
// מגדיר את ה-DEK ב-session (פתוח מיד).
export async function initializePassphrase(passphrase) {
  const { bundle, recoveryCode, dek } = await createKeyBundle(passphrase);
  sessionDek = dek;
  return { bundle, recoveryCode };
}

// פתיחה עם passphrase מול ה-bundle שנשמר בענן. מצליח → מגדיר DEK, מחזיר true.
export async function unlockWithPassphrase(passphrase, bundle) {
  const dek = await cryptoUnlockWithPassphrase(passphrase, bundle);
  if (!dek) return false;
  sessionDek = dek;
  return true;
}

// פתיחה עם recovery code (כששכחו passphrase). מצליח → מגדיר DEK, מחזיר true.
export async function unlockWithRecoveryCode(recoveryCode, bundle) {
  const dek = await cryptoUnlockWithRecoveryCode(recoveryCode, bundle);
  if (!dek) return false;
  sessionDek = dek;
  return true;
}

// שינוי passphrase. דורש session פתוח (DEK בזיכרון). מחזיר bundle מעודכן לשמירה בענן.
export async function changePassphrase(bundle, newPassphrase) {
  if (!sessionDek) throw new Error("session נעול — אי אפשר לשנות passphrase.");
  return rewrapWithNewPassphrase(sessionDek, bundle, newPassphrase);
}

// יצירת recovery code חדש (מבטל את הישן). דורש session פתוח.
// מחזיר { bundle, recoveryCode } — שמור bundle בענן, הצג recoveryCode פעם אחת.
export async function rotateRecoveryCode(bundle) {
  if (!sessionDek) throw new Error("session נעול — אי אפשר ליצור recovery code.");
  return regenerateRecoveryCode(sessionDek, bundle);
}

function buildSecretNameSet(extraFieldNames = []) {
  const set = new Set(SECRET_FIELD_NAMES);
  (Array.isArray(extraFieldNames) ? extraFieldNames : []).forEach((name) => {
    const trimmed = String(name || "").trim();
    if (trimmed) set.add(trimmed);
  });
  return set;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// מצפין רקורסיבית את כל שדות-הסוד באובייקט. מחזיר עותק חדש (לא נוגע במקור).
// שדה ריק ('') נשאר גלוי (אין סוד להגן עליו). שדה שכבר מוצפן נשאר כמות שהוא.
// זורק אם ה-session נעול — הקורא חייב לבדוק isUnlocked() קודם.
export async function encryptSecrets(source, extraFieldNames = []) {
  if (!sessionDek) throw new Error("session הצפנה נעול — אין מפתח.");
  const secretNames = buildSecretNameSet(extraFieldNames);

  const walk = async (value, parentKeyIsSecret) => {
    if (Array.isArray(value)) {
      return Promise.all(value.map((item) => walk(item, false)));
    }
    if (isPlainObject(value)) {
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = await walk(v, secretNames.has(k));
      }
      return out;
    }
    // ערך פרימיטיבי: מצפינים רק אם שם השדה שלו סודי, הוא מחרוזת לא-ריקה, ולא כבר מוצפן.
    if (parentKeyIsSecret && typeof value === "string" && value !== "") {
      return encryptField(value, sessionDek);
    }
    return value;
  };

  // עוברים על שדות ברמה העליונה כדי שגם שדה-סוד ברמה 0 ייתפס.
  if (isPlainObject(source)) {
    const out = {};
    for (const [k, v] of Object.entries(source)) {
      out[k] = secretNames.has(k) && typeof v === "string" && v !== ""
        ? await encryptField(v, sessionDek)
        : await walk(v, secretNames.has(k));
    }
    return out;
  }
  return source;
}

// מפענח רקורסיבית כל שדה מוצפן בחזרה לטקסט גלוי. מחזיר עותק חדש.
// שדה גלוי (legacy / לפני מיגרציה) נשאר כמות שהוא. אם פענוח שדה נכשל
// (מפתח שגוי / נתון פגום) — זורק, כדי לא להחזיר "מפתח" שגוי בשקט.
export async function decryptSecrets(source) {
  if (!sessionDek) throw new Error("session הצפנה נעול — אין מפתח.");

  const walk = async (value) => {
    if (isEncryptedField(value)) {
      return decryptField(value, sessionDek);
    }
    if (Array.isArray(value)) {
      return Promise.all(value.map(walk));
    }
    if (isPlainObject(value)) {
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = await walk(v);
      }
      return out;
    }
    return value;
  };

  return walk(source);
}

// האם יש באובייקט שדה מוצפן כלשהו? משמש ב-pull כדי לדעת אם נדרש פענוח
// (וממילא passphrase) לפני שמחילים את providerConfig מהענן.
export function hasEncryptedSecrets(source) {
  let found = false;
  const walk = (value) => {
    if (found) return;
    if (isEncryptedField(value)) { found = true; return; }
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (isPlainObject(value)) { Object.values(value).forEach(walk); }
  };
  walk(source);
  return found;
}

// עזר למיגרציה: האם יש באובייקט שדה-סוד גלוי (לא מוצפן) שצריך הצפנה?
export function hasPlaintextSecrets(source, extraFieldNames = []) {
  const secretNames = buildSecretNameSet(extraFieldNames);
  let found = false;

  const walk = (value, parentKeyIsSecret) => {
    if (found) return;
    if (isEncryptedField(value)) return;
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, false));
      return;
    }
    if (isPlainObject(value)) {
      Object.entries(value).forEach(([k, v]) => walk(v, secretNames.has(k)));
      return;
    }
    if (parentKeyIsSecret && typeof value === "string" && value !== "") found = true;
  };

  walk(source, false);
  return found;
}
