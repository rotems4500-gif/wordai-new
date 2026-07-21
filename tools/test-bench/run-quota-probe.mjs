// run-whole-work-harness.mjs — מפענח את ה-config של האפליקציה (DPAPI), בונה את
// ה-harness ומריץ אותו. אותה שיטה של server.mjs, בלי להרים שרת.
//
//   node tools/test-bench/run-whole-work-harness.mjs
//
// דילוג על בנייה מחדש: WORDAI_QUOTA_REBUILD=0

import { spawn } from 'node:child_process';
import { readFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(DIR, '..', '..');
const SCRATCH = process.env.WORDAI_VERIFY_SCRATCH
  || path.join(process.env.LOCALAPPDATA || '', 'Temp', 'wordai-quota-probe');
const BUNDLE = path.join(SCRATCH, 'out-quota', 'sf.mjs');

const run = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  p.on('error', reject);
});

// פענוח קובץ DPAPI של האפליקציה — זהה ל-server.mjs (הבלוב נקרא ע"י PowerShell
// עצמו כדי לא לחרוג מאורך שורת הפקודה).
async function decryptDpapiFile(fileName) {
  const filePath = path.join(process.env.APPDATA || '', 'com.wordai.assistant', fileName);
  try {
    const raw = await readFile(filePath);
    const magic = Buffer.from('DPAPI1\n', 'ascii');
    if (!raw.subarray(0, magic.length).equals(magic)) throw new Error('unexpected secure-file header');
  } catch (e) {
    console.warn(`DPAPI read failed (${fileName}): ${e.message}`);
    return '';
  }
  const outPath = path.join(SCRATCH, `dpapi-${fileName}.tmp`);
  const ps = [
    'Add-Type -AssemblyName System.Security',
    `$raw=[IO.File]::ReadAllBytes(${JSON.stringify(filePath)})`,
    '$blob=[byte[]]($raw[7..($raw.Length-1)])',
    '$dec=[Security.Cryptography.ProtectedData]::Unprotect($blob,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)',
    `[IO.File]::WriteAllBytes(${JSON.stringify(outPath)},$dec)`,
  ].join('\n');
  const encoded = Buffer.from(ps, 'utf16le').toString('base64');
  try {
    await mkdir(SCRATCH, { recursive: true });
    await run('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { stdio: 'ignore' });
    const out = await readFile(outPath, 'utf8');
    await rm(outPath, { force: true });
    return out.trim();
  } catch (e) {
    console.warn(`DPAPI decrypt failed (${fileName}): ${e.message}`);
    return '';
  }
}

const cfg = process.env.WORDAI_CFG || await decryptDpapiFile('ai-provider-config.json');
console.log(cfg ? 'provider config loaded ✓' : 'no provider config — the run will fail');

if (process.env.WORDAI_QUOTA_REBUILD !== '0') {
  console.log('building harness bundle…');
  await run('npx', ['vite', 'build', '--config', 'vite.verify.config.mjs'], {
    cwd: PROJECT,
    env: { ...process.env, WORDAI_VERIFY_ENTRY: 'quota', WORDAI_VERIFY_SCRATCH: SCRATCH },
  });
}

process.env.WORDAI_CFG = cfg;
await import(pathToFileURL(BUNDLE).href + `?t=${Date.now()}`);
