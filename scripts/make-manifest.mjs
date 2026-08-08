// make-manifest.mjs — רינדור manifest של תוסף ה-Word מתוך manifest.template.xml.
//   node scripts/make-manifest.mjs        → manifest.xml       (prod, Firebase hosting)
//   node scripts/make-manifest.mjs --dev  → manifest.dev.xml   (localhost:3001, gitignored)
// הגרסה נלקחת מ-package.json ומומרת לפורמט 4 רכיבים של Office (x.y.z → x.y.z.0).

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isDev = process.argv.includes('--dev');

const PROD_BASE_URL = 'https://wordai-website.web.app';
const DEV_BASE_URL = 'https://localhost:3001';

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const versionParts = String(pkg.version || '0.0.0').split('.').map((part) => String(parseInt(part, 10) || 0));
while (versionParts.length < 4) versionParts.push('0');
const officeVersion = versionParts.slice(0, 4).join('.');

const template = readFileSync(path.join(root, 'manifest.template.xml'), 'utf8');
const baseUrl = isDev ? DEV_BASE_URL : PROD_BASE_URL;
const rendered = template
  .replaceAll('{{BASE_URL}}', baseUrl)
  .replaceAll('{{VERSION}}', officeVersion)
  .replace(/^<!-- WordFlow AI — Word Add-in manifest template\.[\s\S]*?-->\n/m, '');

if (/\{\{[A-Z_]+\}\}/.test(rendered)) {
  console.error('manifest render failed: unresolved placeholder left in output');
  process.exit(1);
}
if (!isDev && /localhost/i.test(rendered)) {
  console.error('manifest render failed: "localhost" found in PROD manifest — refusing to write');
  process.exit(1);
}

const outName = isDev ? 'manifest.dev.xml' : 'manifest.xml';
writeFileSync(path.join(root, outName), rendered);
console.log(`wrote ${outName} (base ${baseUrl}, version ${officeVersion})`);
