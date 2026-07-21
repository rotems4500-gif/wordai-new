// run-opener-profile.mjs — בונה ומריץ את בדיקת האימון האישי. אפס רשת.
//
//   node tools/test-bench/run-opener-profile.mjs
//   WORDAI_OPROFILE_REBUILD=0  — דילוג על בנייה מחדש

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(DIR, '..', '..');
const SCRATCH = process.env.WORDAI_VERIFY_SCRATCH
  || path.join(process.env.LOCALAPPDATA || '', 'Temp', 'wordai-oprofile');
const BUNDLE = path.join(SCRATCH, 'out-oprofile', 'sf.mjs');

const run = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  p.on('error', reject);
});

if (process.env.WORDAI_OPROFILE_REBUILD !== '0') {
  console.log('building profile bundle…');
  await run('npx', ['vite', 'build', '--config', 'vite.verify.config.mjs'], {
    cwd: PROJECT,
    env: { ...process.env, WORDAI_VERIFY_ENTRY: 'oprofile', WORDAI_VERIFY_SCRATCH: SCRATCH },
  });
}

await import(pathToFileURL(BUNDLE).href + `?t=${Date.now()}`);
