// device-key-unit.mjs — בדיקות ל"זכור במכשיר הזה" ולמנעולים שסביבו.
//
// למה זה קיים: זה קוד קריפטו שנוגע במפתחות של משתמשים אמיתיים. "vite build עבר"
// לא אומר עליו כלום. כל טענה כאן היא משהו שאם יישבר, משתמש מאבד גישה למפתחות
// או שמפתח דולף.
//
// הרצה: node tools/test-bench/run-device-key-unit.mjs   (אין צורך במפתחות API)

import { webcrypto } from 'node:crypto';

if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto;
globalThis.window = globalThis;
globalThis.self = globalThis;
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k), clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; },
};
if (typeof globalThis.navigator === 'undefined') globalThis.navigator = { userAgent: 'node-lab', language: 'he' };
globalThis.document = {
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  addEventListener() {}, removeEventListener() {},
  querySelector: () => null, querySelectorAll: () => [],
  body: { appendChild() {}, removeChild() {} }, documentElement: { style: {} },
};
globalThis.addEventListener = globalThis.addEventListener || (() => {});
globalThis.removeEventListener = globalThis.removeEventListener || (() => {});
globalThis.dispatchEvent = globalThis.dispatchEvent || (() => true);
if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent { constructor(t, o = {}) { this.type = t; this.detail = o.detail; } };
}

const session = await import('cryptosession');
const { createKeyBundle } = await import('cloudcrypto');

let pass = 0; let fail = 0; const broken = [];
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; broken.push(name); console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
};
const threw = async (fn) => { try { await fn(); return null; } catch (e) { return String(e?.message || e); } };

// ---- הכנה: bundle אמיתי + providerConfig מוצפן ----
const PASS = 'correct horse battery';
const { bundle, dek } = await createKeyBundle(PASS);

session.lockSession();
await session.unlockWithPassphrase(PASS, bundle);
const encrypted = await session.encryptSecrets({ gemini: { key: 'AIza-SECRET-123', model: 'flash' } });

console.log('\n===== canDecryptWith =====');
check('מפתח נכון מאומת', await session.canDecryptWith(dek, encrypted));

const { dek: otherDek } = await createKeyBundle('a totally different pass');
check('מפתח שגוי נדחה', (await session.canDecryptWith(otherDek, encrypted)) === false);
check('מקור בלי ciphertext נדחה', (await session.canDecryptWith(dek, { gemini: { key: '' } })) === false);
check('null נדחה', (await session.canDecryptWith(null, encrypted)) === false);

// זו הטענה המרכזית: אימות לא נוגע ב-session.
session.lockSession();
await session.canDecryptWith(dek, encrypted);
check('אימות לא פותח את ה-session', session.isUnlocked() === false);

console.log('\n===== דגל "נפתח ממכשיר" =====');
session.lockSession();
check('נעול → לא device-derived', session.isSessionDeviceDerived() === false);

session.adoptSessionDek(dek);
check('adopt מסמן device-derived', session.isSessionDeviceDerived() === true);
check('adopt פותח את ה-session', session.isUnlocked() === true);

// המנעול: rewrap עושה wrapKey, שנכשל על מפתח non-extractable.
const changeErr = await threw(() => session.changePassphrase(bundle, 'a new passphrase'));
check('שינוי סיסמה חסום בסשן ממכשיר', Boolean(changeErr), 'לא נזרקה שגיאה');
check('ההודעה מסבירה מה לעשות', /לנעול ולהיכנס/.test(changeErr || ''), changeErr);
const rotateErr = await threw(() => session.rotateRecoveryCode(bundle));
check('סיבוב קוד שחזור חסום בסשן ממכשיר', Boolean(rotateErr));

// פתיחה אמיתית אחרי סשן-ממכשיר חייבת לנקות את הדגל, אחרת המשתמש
// לא יוכל לשנות סיסמה לעולם.
await session.unlockWithPassphrase(PASS, bundle);
check('פתיחה בסיסמה מנקה את הדגל', session.isSessionDeviceDerived() === false);
const changeOk = await threw(() => session.changePassphrase(bundle, 'a new passphrase'));
check('אחרי פתיחה בסיסמה — שינוי סיסמה עובד', changeOk === null, changeOk);

session.adoptSessionDek(dek);
session.lockSession();
check('lockSession מנקה את הדגל', session.isSessionDeviceDerived() === false);

console.log('\n===== המפתח הנשמר אינו ניתן לייצוא =====');
// מדמים את מסלול הווב של saveDeviceKey: export → import כ-non-extractable.
const raw = new Uint8Array(await crypto.subtle.exportKey('raw', dek));
const sealed = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
check('המפתח האטום מסומן non-extractable', sealed.extractable === false);
const exportErr = await threw(() => crypto.subtle.exportKey('raw', sealed));
check('exportKey עליו נכשל (XSS לא יכול לגנוב)', Boolean(exportErr));
check('ועדיין מפענח נכון', await session.canDecryptWith(sealed, encrypted));

// ומכאן נובע המנעול על שינוי סיסמה — מוודאים שזה באמת המצב ולא הנחה.
session.lockSession();
session.adoptSessionDek(sealed);
const wrapErr = await threw(() => session.changePassphrase(bundle, 'yet another pass'));
check('wrapKey על מפתח אטום אכן חסום', Boolean(wrapErr));
session.lockSession();

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} עברו, ${fail} נכשלו`);
if (fail) { console.log('\nמה נשבר:'); broken.forEach((b) => console.log(`  · ${b}`)); process.exitCode = 1; }
