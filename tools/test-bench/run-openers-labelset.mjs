// run-openers-labelset.mjs — בונה ומריץ את מוציא סט התיוג.
//
//   node tools/test-bench/run-openers-labelset.mjs
//
// בלי DPAPI ובלי מפתחות: המסלול הזה מקומי לגמרי (0 קריאות רשת).
// דילוג על בנייה מחדש: WORDAI_LABELSET_REBUILD=0
// מילון חיצוני:        WORDAI_WORDLIST=<path>

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(DIR, '..', '..');
const SCRATCH = process.env.WORDAI_VERIFY_SCRATCH
  || path.join(process.env.LOCALAPPDATA || '', 'Temp', 'wordai-labelset');
const BUNDLE = path.join(SCRATCH, 'out-labelset', 'sf.mjs');

const run = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  p.on('error', reject);
});

if (process.env.WORDAI_LABELSET_REBUILD !== '0') {
  console.log('building labelset bundle…');
  await run('npx', ['vite', 'build', '--config', 'vite.verify.config.mjs'], {
    cwd: PROJECT,
    env: { ...process.env, WORDAI_VERIFY_ENTRY: 'labelset', WORDAI_VERIFY_SCRATCH: SCRATCH },
  });
}

await import(pathToFileURL(BUNDLE).href + `?t=${Date.now()}`);
