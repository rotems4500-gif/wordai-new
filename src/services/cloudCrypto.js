// cloudCrypto.js — הצפנת קצה-לקצה (E2EE) לשדות רגישים שעולים ל-Firebase.
//
// מודל מעטפה (envelope): מפתח-נתונים אקראי (DEK) מצפין את הנתונים בפועל. ה-DEK
// עצמו נשמר "עטוף" (מוצפן) פעמיים — פעם עם מפתח שנגזר מה-passphrase, ופעם עם
// מפתח שנגזר מ-recovery code. כך:
//   - שינוי passphrase = עוטפים מחדש את ה-DEK בלבד; הנתונים לא נוגעים.
//   - שכחת passphrase = פותחים עם ה-recovery code ומגדירים passphrase חדש.
//   - בלי passphrase וגם בלי recovery code = הנתונים אבודים (זו המהות של E2EE).
//
// הסודות (passphrase, recovery code) ו-DEK חיים בזיכרון בלבד — לעולם לא
// ל-localStorage/דיסק/Firestore. Firestore רואה רק ciphertext + מעטפות.
//
// פרימיטיבים: WebCrypto (crypto.subtle) — זמין ב-WebView2 (Tauri) ובדפדפן/PWA.
//   - גזירת KEK מ-secret: PBKDF2-SHA256, 600k iterations → AES-GCM 256
//   - DEK: AES-GCM 256 אקראי
//   - עיטוף DEK: wrapKey/unwrapKey (AES-GCM), הצפנת שדה: AES-GCM (IV אקראי לכל פעולה)

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_HASH = "SHA-256";
const SALT_BYTES = 16;
const IV_BYTES = 12;
const AES_KEY_BITS = 256;
const RECOVERY_BYTES = 16; // 128-bit recovery code

export const KEY_BUNDLE_VERSION = 1;

// סימון שדה מוצפן בתוך אובייקטים שעולים לענן. כל ערך עם המבנה הזה = ciphertext.
export const ENC_MARKER = "__enc";

function getSubtle() {
  const subtle = (typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.subtle) || null;
  if (!subtle) throw new Error("WebCrypto (crypto.subtle) לא זמין בסביבה הזו.");
  return subtle;
}

function getRandomBytes(length) {
  const cryptoObj = typeof globalThis !== "undefined" ? globalThis.crypto : null;
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== "function") {
    throw new Error("crypto.getRandomValues לא זמין.");
  }
  return cryptoObj.getRandomValues(new Uint8Array(length));
}

// ---- base64 <-> bytes (בלי תלות ב-Buffer; עובד בדפדפן ו-WebView) ----

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(String(base64 || ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function generateSalt() {
  return bytesToBase64(getRandomBytes(SALT_BYTES));
}

// ---- recovery code: base32 (Crockford, בלי תווים מבלבלים) בקבוצות של 5 ----

const B32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // ללא I L O U

function bytesToBase32(bytes) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

// מחרוזת קריאה למשתמש: "K7QF2-9HM3X-..." ; הקלט לפענוח מנורמל ב-normalizeRecoveryCode.
export function generateRecoveryCode() {
  const raw = bytesToBase32(getRandomBytes(RECOVERY_BYTES));
  return raw.match(/.{1,5}/g).join("-");
}

// מנרמל קלט משתמש: גדולות, בלי מקפים/רווחים, מיפוי תווים דומים (O→0, I/L→1).
export function normalizeRecoveryCode(code) {
  return String(code || "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

// ---- גזירת KEK + עיטוף/פתיחת DEK ----

async function deriveKek(secret, saltBase64) {
  const subtle = getSubtle();
  const s = String(secret || "");
  if (!s) throw new Error("secret ריק.");
  const salt = base64ToBytes(saltBase64);
  if (salt.length < SALT_BYTES) throw new Error("salt לא תקין.");

  const baseKey = await subtle.importKey("raw", textEncoder.encode(s), { name: "PBKDF2" }, false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: PBKDF2_HASH },
    baseKey,
    { name: "AES-GCM", length: AES_KEY_BITS },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

async function wrapDek(dek, kek) {
  const subtle = getSubtle();
  const iv = getRandomBytes(IV_BYTES);
  const wrapped = await subtle.wrapKey("raw", dek, kek, { name: "AES-GCM", iv });
  return { ct: bytesToBase64(new Uint8Array(wrapped)), iv: bytesToBase64(iv) };
}

async function unwrapDek(envelope, kek) {
  const subtle = getSubtle();
  const iv = base64ToBytes(envelope.iv);
  const wrapped = base64ToBytes(envelope.ct);
  // extractable=true כדי שנוכל לעטוף מחדש בעת שינוי passphrase.
  return subtle.unwrapKey(
    "raw",
    wrapped,
    kek,
    { name: "AES-GCM", iv },
    { name: "AES-GCM", length: AES_KEY_BITS },
    true,
    ["encrypt", "decrypt"],
  );
}

// ---- key bundle: מה שנשמר בענן (לא סודי) ----
// { version, passSalt, recoverySalt, wrappedByPass:{ct,iv}, wrappedByRecovery:{ct,iv} }

// יצירה ראשונית: מייצר DEK + recovery code, עוטף פעמיים. מחזיר את ה-bundle לשמירה,
// את ה-recoveryCode (להציג למשתמש פעם אחת), ואת ה-DEK (CryptoKey) ל-session.
export async function createKeyBundle(passphrase) {
  const subtle = getSubtle();
  if (!String(passphrase || "")) throw new Error("passphrase ריק.");
  const dek = await subtle.generateKey({ name: "AES-GCM", length: AES_KEY_BITS }, true, ["encrypt", "decrypt"]);

  const recoveryCode = generateRecoveryCode();
  const passSalt = generateSalt();
  const recoverySalt = generateSalt();

  const passKek = await deriveKek(passphrase, passSalt);
  const recoveryKek = await deriveKek(normalizeRecoveryCode(recoveryCode), recoverySalt);

  const bundle = {
    version: KEY_BUNDLE_VERSION,
    passSalt,
    recoverySalt,
    wrappedByPass: await wrapDek(dek, passKek),
    wrappedByRecovery: await wrapDek(dek, recoveryKek),
  };

  return { bundle, recoveryCode, dek };
}

function isValidBundle(bundle) {
  return Boolean(
    bundle
    && typeof bundle === "object"
    && bundle.passSalt
    && bundle.wrappedByPass?.ct
    && bundle.wrappedByPass?.iv,
  );
}

// פתיחה עם passphrase. מחזיר DEK (CryptoKey) אם נכון, אחרת null.
export async function unlockWithPassphrase(passphrase, bundle) {
  if (!isValidBundle(bundle)) return null;
  try {
    const kek = await deriveKek(passphrase, bundle.passSalt);
    return await unwrapDek(bundle.wrappedByPass, kek);
  } catch {
    return null; // פענוח נכשל = passphrase שגוי
  }
}

// פתיחה עם recovery code. מחזיר DEK (CryptoKey) אם נכון, אחרת null.
export async function unlockWithRecoveryCode(recoveryCode, bundle) {
  if (!isValidBundle(bundle) || !bundle.recoverySalt || !bundle.wrappedByRecovery?.ct) return null;
  try {
    const kek = await deriveKek(normalizeRecoveryCode(recoveryCode), bundle.recoverySalt);
    return await unwrapDek(bundle.wrappedByRecovery, kek);
  } catch {
    return null;
  }
}

// שינוי passphrase: עוטף מחדש את ה-DEK הקיים עם passphrase חדש. הנתונים לא נוגעים.
// מחזיר bundle מעודכן (wrappedByRecovery נשאר כמו שהוא — אותו recovery code עדיין תקף).
export async function rewrapWithNewPassphrase(dek, bundle, newPassphrase) {
  if (!dek) throw new Error("חסר DEK פתוח.");
  if (!String(newPassphrase || "")) throw new Error("passphrase חדש ריק.");
  const passSalt = generateSalt();
  const passKek = await deriveKek(newPassphrase, passSalt);
  return {
    ...bundle,
    version: KEY_BUNDLE_VERSION,
    passSalt,
    wrappedByPass: await wrapDek(dek, passKek),
  };
}

// יצירת recovery code חדש (למשל אחרי שחזור עם הישן). מחזיר { bundle, recoveryCode }.
export async function regenerateRecoveryCode(dek, bundle) {
  if (!dek) throw new Error("חסר DEK פתוח.");
  const recoveryCode = generateRecoveryCode();
  const recoverySalt = generateSalt();
  const recoveryKek = await deriveKek(normalizeRecoveryCode(recoveryCode), recoverySalt);
  return {
    bundle: { ...bundle, version: KEY_BUNDLE_VERSION, recoverySalt, wrappedByRecovery: await wrapDek(dek, recoveryKek) },
    recoveryCode,
  };
}

// ---- הצפנה / פענוח של שדה בודד (מפתח = DEK) ----

export async function encryptField(plaintext, dek) {
  if (!dek) throw new Error("חסר מפתח הצפנה (DEK).");
  const subtle = getSubtle();
  const iv = getRandomBytes(IV_BYTES);
  const data = textEncoder.encode(String(plaintext ?? ""));
  const ctBuffer = await subtle.encrypt({ name: "AES-GCM", iv }, dek, data);
  return { [ENC_MARKER]: { ct: bytesToBase64(new Uint8Array(ctBuffer)), iv: bytesToBase64(iv) } };
}

export async function decryptField(blob, dek) {
  if (!dek) throw new Error("חסר מפתח הצפנה (DEK).");
  const env = isEncryptedField(blob) ? blob[ENC_MARKER] : null;
  if (!env) throw new Error("הנתון אינו שדה מוצפן תקין.");
  const subtle = getSubtle();
  const iv = base64ToBytes(env.iv);
  const ct = base64ToBytes(env.ct);
  const ptBuffer = await subtle.decrypt({ name: "AES-GCM", iv }, dek, ct);
  return textDecoder.decode(ptBuffer);
}

// זיהוי: האם הערך הוא מעטפת ciphertext (ולא טקסט גלוי). משמש להבחנה במיגרציה.
export function isEncryptedField(value) {
  return Boolean(
    value
    && typeof value === "object"
    && value[ENC_MARKER]
    && typeof value[ENC_MARKER] === "object"
    && typeof value[ENC_MARKER].ct === "string"
    && typeof value[ENC_MARKER].iv === "string",
  );
}
