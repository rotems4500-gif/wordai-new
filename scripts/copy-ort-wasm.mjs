// copy-ort-wasm.mjs — מעתיק את קבצי ה-WASM של onnxruntime-web ל-public/ort/.
//
// למה: @huggingface/transformers מצמיד גרסת *dev* של onnxruntime-web
// (1.26.0-dev.…) ומכוון את wasmPaths ל-jsDelivr לגרסה הזו בדיוק. הכתובת נכשלת,
// ה-factory חוזר undefined, ו-ORT נופל עם
//   "no available backend found. ERR: [wasm] TypeError: Cannot read properties of undefined (reading 'default')"
// אירוח עצמי פותר גם את זה וגם את הדסקטופ (Tauri אופליין — אין CDN בכלל).
//
// הקבצים לא נכנסים ל-git (ראה .gitignore): הם נגזרים מ-node_modules בכל build.

import fs from 'fs';
import path from 'path';

// asyncify = מה ש-transformers בוחר בכל דפדפן שאינו Safari; הזוג הרגיל הוא מסלול Safari.
const FILES = [
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
];

export function copyOrtWasm(root = process.cwd()) {
  const src = path.resolve(root, 'node_modules', 'onnxruntime-web', 'dist');
  const dest = path.resolve(root, 'public', 'ort');
  if (!fs.existsSync(src)) return { ok: false, error: 'onnxruntime-web/dist לא נמצא' };
  fs.mkdirSync(dest, { recursive: true });

  let copied = 0;
  for (const name of FILES) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (!fs.existsSync(from)) continue;
    // דילוג כשהיעד כבר מעודכן — הקבצים הם עשרות MB, אין טעם להעתיק בכל build.
    const a = fs.statSync(from);
    const b = fs.existsSync(to) ? fs.statSync(to) : null;
    if (b && b.size === a.size && b.mtimeMs >= a.mtimeMs) continue;
    fs.copyFileSync(from, to);
    copied += 1;
  }
  return { ok: true, copied };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const res = copyOrtWasm();
  console.log(res.ok ? `[ort] ${res.copied} קבצים הועתקו ל-public/ort` : `[ort] ${res.error}`);
}
