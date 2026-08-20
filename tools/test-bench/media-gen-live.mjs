// media-gen-live.mjs — probe חי לקטלוג/יצירת מדיה על המפתח האמיתי.
// עולה כסף (סנטים): קריאת list (חינם) + Imagen אחד (~$0.03) + nano-banana אחד (~$0.04).
// Veo רק מאחורי WORDAI_PROBE_VEO=1 (דקות + $$).
//
// הרצה:
//   $cfg = (פענוח DPAPI של ai-provider-config.json) או JSON עם {"gemini":{"key":"..."}}
//   $env:WORDAI_CFG=$cfg; $env:WORDAI_VERIFY_ENTRY='medialive'; npx vite build --config vite.verify.config.mjs
//   node tools/test-bench/.verify-scratch/out-medialive/sf.mjs

// ---------- browser shims (כמו media-gen-unit) ----------
const storageShim = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(String(k), String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
};
globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.localStorage = storageShim();
globalThis.sessionStorage = storageShim();
if (typeof globalThis.navigator === 'undefined') globalThis.navigator = { userAgent: 'node-medialive', language: 'he' };
globalThis.document = {
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }),
  createTextNode: () => ({}),
  addEventListener() {}, removeEventListener() {},
  querySelector: () => null, querySelectorAll: () => [],
  body: { appendChild() {}, removeChild() {} }, documentElement: { style: {} }, hidden: false,
};
if (typeof globalThis.addEventListener !== 'function') {
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  globalThis.dispatchEvent = () => true;
}
if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent { constructor(type, opts = {}) { this.type = type; this.detail = opts.detail; } };
}

if (!process.env.WORDAI_CFG) {
  console.error('חסר WORDAI_CFG (JSON של provider config עם מפתח gemini).');
  process.exit(2);
}
localStorage.setItem('ai_provider_config', process.env.WORDAI_CFG);

const { refreshGeminiModelCatalog, getCachedGeminiModels, getMediaModelChoices } = await import('../../src/services/aiService.js');
const { generateAiImage } = await import('../../src/services/imageService.js');
const { generateVeoVideo } = await import('../../src/services/videoService.js');

const isPngDataUrl = (dataUrl = '') => {
  const match = String(dataUrl).match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/s);
  if (!match) return false;
  const head = Buffer.from(match[2].slice(0, 12), 'base64');
  return head[0] === 0x89 || head[0] === 0xFF || head[0] === 0x52; // PNG / JPEG / RIFF(webp)
};

console.log('── 1) discovery: רשימת מודלים מהמפתח ──');
const refresh = await refreshGeminiModelCatalog();
if (!refresh.ok) {
  console.error('❌ list נכשל:', refresh.error);
  process.exit(1);
}
console.log(`✓ counts: text=${refresh.counts.text} image=${refresh.counts.image} video=${refresh.counts.video}`);
const imageModels = getCachedGeminiModels('image');
const videoModels = getCachedGeminiModels('video');
console.log('  image models:', imageModels.join(', ') || '(אין)');
console.log('  video models:', videoModels.join(', ') || '(אין)');
if (!imageModels.some((id) => /^imagen-/.test(id))) console.log('⚠️ אין imagen ברשימה — ייתכן שהמפתח בלי גישה');
console.log('  media choices (image):', getMediaModelChoices('image', 'gemini').join(', '));

console.log('\n── 2) Imagen :predict ──');
try {
  const imagen = await generateAiImage('איור מינימליסטי של ספר פתוח על שולחן, רקע לבן', { model: 'imagen-3.0-generate-002', provider: 'gemini' });
  console.log(isPngDataUrl(imagen.dataUrl)
    ? `✓ Imagen החזיר תמונה (${Math.round(imagen.dataUrl.length / 1024)}KB dataUrl, model=${imagen.model})`
    : `❌ Imagen dataUrl לא תקין: ${String(imagen.dataUrl).slice(0, 60)}`);
} catch (error) {
  console.log('❌ Imagen נכשל:', error?.message || error);
}

console.log('\n── 3) nano-banana :generateContent+responseModalities ──');
try {
  const nano = await generateAiImage('תרשים זרימה פשוט עם שלוש תיבות בעברית: קלט, עיבוד, פלט', { model: 'gemini-2.5-flash-image', provider: 'gemini' });
  console.log(isPngDataUrl(nano.dataUrl)
    ? `✓ nano-banana החזיר תמונה (${Math.round(nano.dataUrl.length / 1024)}KB dataUrl, model=${nano.model})`
    : `❌ nano-banana dataUrl לא תקין: ${String(nano.dataUrl).slice(0, 60)}`);
} catch (error) {
  console.log('❌ nano-banana נכשל:', error?.message || error);
}

if (process.env.WORDAI_PROBE_VEO === '1') {
  console.log('\n── 4) Veo :predictLongRunning (עולה $$, דקות) ──');
  try {
    const veo = await generateVeoVideo('לוגו מינימליסטי מסתובב על רקע לבן, שתי שניות', {
      model: 'veo-3.1-fast-generate-preview',
      onProgress: ({ phase, elapsedSec }) => console.log(`  …${phase} ${elapsedSec || 0}s`),
    });
    console.log(veo.base64
      ? `✓ Veo החזיר וידאו (${Math.round(veo.base64.length * 0.75 / 1024)}KB, mime=${veo.mime})`
      : `⚠️ Veo סיים בלי בייטים — uri: ${veo.uri} (downloadFailed=${veo.downloadFailed})`);
  } catch (error) {
    console.log('❌ Veo נכשל:', error?.message || error);
  }
} else {
  console.log('\n(Veo מדולג — הפעל עם WORDAI_PROBE_VEO=1)');
}
console.log('\nסיום probe.');
