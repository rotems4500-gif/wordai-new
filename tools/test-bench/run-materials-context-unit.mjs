// run-materials-context-unit.mjs — בונה את bundle הבדיקה (קוד האפליקציה האמיתי
// דרך vite.verify.config.mjs) ומריץ אותו. **בלי DPAPI ובלי מפתחות API** — הדירוג
// הוא פונקציה טהורה ואינו נוגע בשום ספק.
//
//   node tools/test-bench/run-materials-context-unit.mjs
//
// דילוג על בנייה מחדש: WORDAI_MATERIALS_REBUILD=0

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(DIR, '..', '..');
const SCRATCH = process.env.WORDAI_VERIFY_SCRATCH
  || path.join(process.env.LOCALAPPDATA || '', 'Temp', 'wordai-materials-unit');
const BUNDLE = path.join(SCRATCH, 'out-materials', 'sf.mjs');

const run = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  p.on('error', reject);
});

if (process.env.WORDAI_MATERIALS_REBUILD !== '0') {
  console.log('building harness bundle…');
  await run('npx', ['vite', 'build', '--config', 'vite.verify.config.mjs'], {
    cwd: PROJECT,
    env: { ...process.env, WORDAI_VERIFY_ENTRY: 'materials', WORDAI_VERIFY_SCRATCH: SCRATCH },
  });
}

await import(pathToFileURL(BUNDLE).href + `?t=${Date.now()}`);
