#!/usr/bin/env node
// make-latest-json.mjs — בונה את latest.json של ה-updater מתוך תוצרי הבנייה.
//
// למה: tauri build לא מייצר latest.json, ולכן עד היום הוא נכתב ביד. שלוש טעויות
// אפשריות שם, וכולן שקטות — המשתמש לא רואה שגיאה, פשוט לא מקבל עדכון לעולם:
//   1. חתימה עם מפתח ה-v1 המת → כל לקוח דוחה את העדכון (pubkey לא תואם).
//   2. קידוד base64 כפול של החתימה → שדה signature לא תקין.
//   3. שם ה-asset ב-url לא זהה לשם שהועלה בפועל → 404 בהורדה.
// הסקריפט חוסם את שלושתן, ומדפיס רשימת העלאה מדויקת.
//
// שימוש:
//   node scripts/make-latest-json.mjs --notes "מה חדש בגרסה"
//   node scripts/make-latest-json.mjs --notes-file docs/release-notes.txt

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE_DIR = path.join(ROOT, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
const OUT_FILE = path.join(ROOT, 'latest.json');

const fail = (message) => { console.error(`\n✗ ${message}\n`); process.exit(1); };

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : '';
};

// ── גרסה: package.json ו-tauri.conf.json חייבים להסכים ────────────────────────
const pkgVersion = readJson(path.join(ROOT, 'package.json')).version;
const conf = readJson(path.join(ROOT, 'src-tauri', 'tauri.conf.json'));
if (conf.version !== pkgVersion) {
  fail(`אי-התאמת גרסה: package.json=${pkgVersion} אבל tauri.conf.json=${conf.version}. לעדכן את שניהם.`);
}
const version = pkgVersion;

// ── מזהה מפתח: חתימה מול ה-pubkey שהלקוחות מאמינים לו ────────────────────────
// פורמט minisign: 2 בתים אלגוריתם, 8 בתים key id, ואז החתימה. משווים את ה-key id.
const keyIdOf = (base64Line) => Buffer.from(base64Line, 'base64').subarray(2, 10).toString('hex');

const pubText = Buffer.from(conf.plugins?.updater?.pubkey || '', 'base64').toString('utf8');
const pubLine = pubText.trim().split('\n').pop();
if (!pubLine) fail('לא נמצא pubkey ב-tauri.conf.json תחת plugins.updater.');
const expectedKeyId = keyIdOf(pubLine);

// ── תוצרי הבנייה ─────────────────────────────────────────────────────────────
if (!fs.existsSync(BUNDLE_DIR)) fail(`לא נמצאה תיקיית ה-bundle: ${BUNDLE_DIR}\nלהריץ קודם: npm run desktop:build`);

const files = fs.readdirSync(BUNDLE_DIR);
const exeName = files.find((f) => f.endsWith('-setup.exe') && f.includes(version));
if (!exeName) fail(`לא נמצא installer לגרסה ${version} ב-${BUNDLE_DIR}. יש שם: ${files.join(', ') || '(ריק)'}`);
const sigName = files.find((f) => f === `${exeName}.sig`);
if (!sigName) fail(`נמצא ${exeName} אבל אין לו ${exeName}.sig — הבנייה רצה בלי TAURI_SIGNING_PRIVATE_KEY.`);

// ה-.sig כבר base64 של טקסט minisign. מכניסים אותו כמו שהוא — בלי קידוד נוסף.
const signature = fs.readFileSync(path.join(BUNDLE_DIR, sigName), 'utf8').trim();

let sigText;
try {
  sigText = Buffer.from(signature, 'base64').toString('utf8');
} catch {
  fail('קובץ ה-.sig אינו base64 תקין.');
}
if (!sigText.startsWith('untrusted comment:')) {
  fail('פענוח יחיד של ה-.sig לא נתן טקסט minisign — כנראה קודד פעמיים. להכניס את תוכן הקובץ כמו שהוא.');
}

const sigLine = sigText.split('\n')[1];
const actualKeyId = keyIdOf(sigLine);
if (actualKeyId !== expectedKeyId) {
  fail(
    `החתימה נעשתה במפתח הלא נכון.\n` +
    `  pubkey ב-tauri.conf.json: ${expectedKeyId}\n` +
    `  המפתח שחתם בפועל:        ${actualKeyId}\n` +
    `זה המפתח הישן (v1). כל לקוח ידחה את העדכון בשקט.\n` +
    `לבנות מחדש עם ~/.tauri/wordflow-updater-v2.key.`
  );
}

// ── שם ה-asset הקנוני (מקף, לא רווח) — חייב להתאים ל-url ב-latest.json ───────
const canonicalName = `WordFlow-AI_${version}_x64-setup.exe`;
const uploadPath = path.join(BUNDLE_DIR, canonicalName);
if (exeName !== canonicalName) {
  fs.copyFileSync(path.join(BUNDLE_DIR, exeName), uploadPath);
}

const notesFile = arg('notes-file');
const notes = notesFile
  ? fs.readFileSync(path.resolve(ROOT, notesFile), 'utf8').trim()
  : (arg('notes') || `גרסה ${version}`);

const latest = {
  version,
  notes,
  pub_date: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  platforms: {
    'windows-x86_64': {
      signature,
      url: `https://github.com/rotems4500-gif/wordai-new/releases/download/v${version}/${canonicalName}`,
    },
  },
};

fs.writeFileSync(OUT_FILE, `${JSON.stringify(latest, null, 2)}\n`, 'utf8');

const sizeMb = (fs.statSync(uploadPath).size / (1024 * 1024)).toFixed(1);
console.log(`
✓ latest.json נכתב ל-${path.relative(ROOT, OUT_FILE)}
  גרסה:        ${version}
  מפתח חתימה:  ${actualKeyId} (תואם ל-pubkey) ✓
  installer:   ${canonicalName} · ${sizeMb} MB

להעלאה ל-release בשם התג v${version}:
  1. ${uploadPath}
  2. ${OUT_FILE}
  שני הקבצים, בשמות האלה בדיוק. ה-url ב-latest.json מצביע על השם הזה.
`);
