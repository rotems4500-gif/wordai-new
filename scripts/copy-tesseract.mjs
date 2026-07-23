// copy-tesseract.mjs — אירוח עצמי של tesseract.js ל-public/ocr/.
//
// למה: ברירת המחדל של tesseract.js v7 טוענת את ה-worker ואת ה-core מ-jsDelivr
// בזמן ריצה. ה-CSP של האתר חוסם Worker מ-jsDelivr (worker-src) — נמדד באתר החי:
//   SecurityError: Failed to construct 'Worker' … cdn.jsdelivr.net
// וכל PDF סרוק/שבור-קידוד נכשל ב"שגיאת חילוץ" (19 מקבצי הקורס). אירוח עצמי
// פותר גם את זה, גם offline בדסקטופ (Tauri), וגם תלות ב-CDN בכלל — אותו דפוס
// בדיוק כמו copy-ort-wasm.
//
// מועתקים: worker.min.js + שלוש גרסאות ה-core של LSTM (מה ש-v7 בוחר מהן לפי
// יכולות הדפדפן; מצב ברירת המחדל הוא lstmOnly) + נתוני שפה עברית+אנגלית
// דחוסים gzip (ה-worker מבקש `<langPath>/<lang>.traineddata.gz`).
// המקור לנתוני השפה: ocr-data/ בשורש הריפו (tessdata_fast).
//
// הקבצים לא נכנסים ל-git (ראה .gitignore) — נגזרים מ-node_modules בכל build.

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const CORE_FILES = [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-lstm.wasm',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm',
];
const LANGS = ['heb', 'eng'];

const fresh = (from, to) => {
  if (!fs.existsSync(from)) return false;
  const a = fs.statSync(from);
  const b = fs.existsSync(to) ? fs.statSync(to) : null;
  return !(b && b.mtimeMs >= a.mtimeMs && b.size > 0);
};

export function copyTesseract(root = process.cwd()) {
  const dest = path.resolve(root, 'public', 'ocr');
  fs.mkdirSync(dest, { recursive: true });
  let copied = 0;

  // 1. ה-worker
  const workerFrom = path.resolve(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js');
  const workerTo = path.join(dest, 'worker.min.js');
  if (!fs.existsSync(workerFrom)) return { ok: false, error: 'tesseract.js/dist לא נמצא' };
  if (fresh(workerFrom, workerTo)) { fs.copyFileSync(workerFrom, workerTo); copied += 1; }

  // 2. core (LSTM בלבד — ברירת המחדל של v7)
  const coreSrc = path.resolve(root, 'node_modules', 'tesseract.js-core');
  for (const name of CORE_FILES) {
    const from = path.join(coreSrc, name);
    const to = path.join(dest, name);
    if (!fs.existsSync(from)) continue;
    if (fresh(from, to)) { fs.copyFileSync(from, to); copied += 1; }
  }

  // 3. נתוני שפה — gzip (ה-worker מצפה ל-.traineddata.gz)
  const langDest = path.join(dest, 'lang');
  fs.mkdirSync(langDest, { recursive: true });
  for (const lang of LANGS) {
    // מקורות אפשריים לפי סדר: ocr-data/ ואז שורש הריפו
    const from = [path.resolve(root, 'ocr-data', `${lang}.traineddata`), path.resolve(root, `${lang}.traineddata`)]
      .find((p) => fs.existsSync(p));
    if (!from) { console.warn(`[ocr] ${lang}.traineddata לא נמצא — OCR ב-${lang} לא יעבוד מקומית`); continue; }
    const to = path.join(langDest, `${lang}.traineddata.gz`);
    if (fresh(from, to)) {
      fs.writeFileSync(to, zlib.gzipSync(fs.readFileSync(from)));
      copied += 1;
    }
  }

  return { ok: true, copied };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const res = copyTesseract();
  console.log(res.ok ? `[ocr] ${res.copied} קבצים הועתקו ל-public/ocr` : `[ocr] ${res.error}`);
}
