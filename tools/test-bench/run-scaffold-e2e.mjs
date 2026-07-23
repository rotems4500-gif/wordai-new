// run-scaffold-e2e.mjs — בונה ומריץ את harness השלד המלא (קליטה→הטמעה→אחזור→מסמך).
//
//   node tools/test-bench/run-scaffold-e2e.mjs
//   WORDAI_SCAFFOLDE2E_REBUILD=0  — דילוג על בנייה מחדש
//
// exit 0 = כל מקרי ה-eval עוברים.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(DIR, '..', '..');
// ה-bundle חייב לשבת בתוך הפרויקט: הוא external ל-pdfjs/transformers/mammoth,
// ורזולוציית ESM מטפסת מהקובץ עצמו — מחוץ לפרויקט אין node_modules והייבוא נופל.
const SCRATCH = process.env.WORDAI_VERIFY_SCRATCH
  || path.join(DIR, '.scaffolde2e-scratch');
const BUNDLE = path.join(SCRATCH, 'out-scaffolde2e', 'sf.mjs');

const run = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  p.on('error', reject);
});

if (process.env.WORDAI_SCAFFOLDE2E_REBUILD !== '0') {
  console.log('building scaffold-e2e bundle…');
  await run('npx', ['vite', 'build', '--config', 'vite.verify.config.mjs'], {
    cwd: PROJECT,
    env: { ...process.env, WORDAI_VERIFY_ENTRY: 'scaffolde2e', WORDAI_VERIFY_SCRATCH: SCRATCH },
  });
}

process.env.WORDAI_VERIFY_SCRATCH = SCRATCH;
await import(pathToFileURL(BUNDLE).href + `?t=${Date.now()}`);
