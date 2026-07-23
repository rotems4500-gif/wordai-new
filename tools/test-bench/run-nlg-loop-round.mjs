// run-nlg-loop-round.mjs — בונה ומריץ את סבב ה-NLG המלא (parse → חומרים →
// פרופיל אישי → פרוזה מקומית → draft + metrics). אפס קריאות מודל.
//
//   node tools/test-bench/run-nlg-loop-round.mjs
//   WORDAI_NLGLOOP_REBUILD=0  — דילוג על בנייה מחדש של ה-bundle
//
// ה-bundle חייב לשבת בתוך הפרויקט: הוא external ל-pdfjs/mammoth/tesseract, ורזולוציית
// ESM מטפסת מהקובץ עצמו. ה-scratch משותף עם scaffold-e2e כדי לנצל OCR/vector cache.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(DIR, '..', '..');
// scratch משותף עם scaffold-e2e — כך ה-OCR cache וה-vec-cache שכבר נבנו נמצאים.
const SCRATCH = process.env.WORDAI_VERIFY_SCRATCH
  || path.join(DIR, '.scaffolde2e-scratch');
const BUNDLE = path.join(SCRATCH, 'out-nlgloop', 'sf.mjs');

const run = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  p.on('error', reject);
});

if (process.env.WORDAI_NLGLOOP_REBUILD !== '0') {
  console.log('building nlg-loop bundle…');
  await run('npx', ['vite', 'build', '--config', 'vite.verify.config.mjs'], {
    cwd: PROJECT,
    env: { ...process.env, WORDAI_VERIFY_ENTRY: 'nlgloop', WORDAI_VERIFY_SCRATCH: SCRATCH },
  });
}

process.env.WORDAI_VERIFY_SCRATCH = SCRATCH;
await import(pathToFileURL(BUNDLE).href + `?t=${Date.now()}`);
