// build.mjs — בונה את WordFlow Clipper מ-src/ ל-dist-extension/
// מריצים: node build.mjs (מתוך תיקיית extension/, אחרי npm install)
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname; // extension/
const REPO_ROOT = path.resolve(ROOT, '..'); // שורש הריפו (יש בו .env.local)
const OUT_DIR = path.join(REPO_ROOT, 'dist-extension');

// --- קריאת .env.local מהשורש כדי לאסוף מפתחות Firebase (בלי להדפיס ערכים) ---
function parseEnvLocal(envPath) {
  const map = {};
  if (!fs.existsSync(envPath)) return map;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // הסרת גרשיים עוטפים אם יש
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    map[key] = val;
  }
  return map;
}

const env = parseEnvLocal(path.join(REPO_ROOT, '.env.local'));

const requiredKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_APP_ID',
];

const missing = requiredKeys.filter((k) => !env[k]);
if (missing.length) {
  console.warn(
    `[build] אזהרה: חסרים מפתחות ב-.env.local: ${missing.join(', ')} — ה-Firebase config בבילד יהיה חלקי.`
  );
}

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
  appId: env.VITE_FIREBASE_APP_ID || '',
};

// --- ניקוי + הכנת תיקיית פלט ---
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(path.join(OUT_DIR, 'content'), { recursive: true });
fs.mkdirSync(path.join(OUT_DIR, 'popup'), { recursive: true });
fs.mkdirSync(path.join(OUT_DIR, 'icons'), { recursive: true });

const defineFlags = {
  __FIREBASE_CONFIG__: JSON.stringify(JSON.stringify(firebaseConfig)),
};

async function run() {
  // background service worker — ESM
  await build({
    entryPoints: [path.join(ROOT, 'src/background.js')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['chrome110'],
    outfile: path.join(OUT_DIR, 'background.js'),
    define: defineFlags,
    logLevel: 'info',
  });

  // content scripts — IIFE (אי אפשר מודולים ב-content scripts)
  await build({
    entryPoints: [path.join(ROOT, 'src/content/extract.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome110'],
    outfile: path.join(OUT_DIR, 'content/extract.js'),
    define: defineFlags,
    logLevel: 'info',
  });

  await build({
    entryPoints: [path.join(ROOT, 'src/content/scanLinks.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome110'],
    outfile: path.join(OUT_DIR, 'content/scanLinks.js'),
    define: defineFlags,
    logLevel: 'info',
  });

  await build({
    entryPoints: [path.join(ROOT, 'src/content/areaSelectOverlay.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome110'],
    outfile: path.join(OUT_DIR, 'content/areaSelectOverlay.js'),
    define: defineFlags,
    logLevel: 'info',
  });

  // popup script — IIFE כדי לפשט את ה-HTML (בלי type=module)
  await build({
    entryPoints: [path.join(ROOT, 'src/popup/popup.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome110'],
    outfile: path.join(OUT_DIR, 'popup/popup.js'),
    define: defineFlags,
    logLevel: 'info',
  });

  // --- העתקת קבצים סטטיים ---
  fs.copyFileSync(path.join(ROOT, 'manifest.json'), path.join(OUT_DIR, 'manifest.json'));
  fs.copyFileSync(path.join(ROOT, 'src/popup/popup.html'), path.join(OUT_DIR, 'popup/popup.html'));
  fs.copyFileSync(path.join(ROOT, 'src/popup/popup.css'), path.join(OUT_DIR, 'popup/popup.css'));

  const iconsDir = path.join(ROOT, 'icons');
  if (fs.existsSync(iconsDir)) {
    for (const file of fs.readdirSync(iconsDir)) {
      fs.copyFileSync(path.join(iconsDir, file), path.join(OUT_DIR, 'icons', file));
    }
  }

  console.log('\n[build] הושלם. פלט ב-', OUT_DIR);
}

run().catch((err) => {
  console.error('[build] נכשל:', err);
  process.exit(1);
});
