// media-gen-unit.mjs — בדיקות offline לקטלוג המודלים (טקסט/תמונה/וידאו),
// לבחירת המודל בפועל, להחלטת ה-grounding ולמונה השימוש.
// **אפס רשת ואפס מפתחות API** — כל המסלולים כאן טהורים או יושבים על localStorage.
//
// הרצה:
//   $env:WORDAI_VERIFY_ENTRY='mediagen'; npx vite build --config vite.verify.config.mjs
//   node tools/test-bench/.verify-scratch/out-mediagen/sf.mjs
//
// ⚠️ ה-shims של הדפדפן חייבים לשבת *לפני* טעינת קוד האפליקציה (aiService נוגע
// ב-localStorage/document ברמת המודול), ולכן כל הייבוא כאן דינמי — כמו
// ב-course-store-unit.mjs / style-learning-loop-unit.mjs.

// ---------- browser shims ----------
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
if (typeof globalThis.navigator === 'undefined') globalThis.navigator = { userAgent: 'node-mediagen', language: 'he' };
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

// כל קריאת רשת כאן היא כשל בהגדרה — הבדיקה כולה offline.
globalThis.fetch = async () => { throw new Error('network call in offline harness'); };

// ---------- real app modules ----------
const {
  getProviderModelChoices,
  getMediaModelChoices,
  getModelNameForProvider,
  shouldUseInternetBackedSourceWork,
} = await import('../../src/services/aiService.js');
const { classifyModelKind, classifyGeminiApiEntry } = await import('../../src/services/modelCatalog.js');
const { recordModelUsage, getUsageSummary, resetUsageTelemetry } = await import('../../src/services/usageTelemetryService.js');

let passed = 0;
let failed = 0;
// כישלונות נכתבים ל-stdout ולא ל-stderr: מיזוג 2>&1 ב-PowerShell מוציא את
// stderr מהסדר, ושורת FAIL הופיעה תחת הכותרת של הסקשן הבא.
const check = (name, cond, extra = '') => {
  if (cond) { passed += 1; console.log(`  PASS ${name}`); }
  else { failed += 1; console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`); }
};
const eq = (name, actual, expected) => check(name, actual === expected, `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);

// ── A. classifyModelKind ────────────────────────────────────────────────────
console.log('\n[A] classifyModelKind');
eq("gemini/imagen-3.0-generate-002", classifyModelKind('gemini', 'imagen-3.0-generate-002'), 'image');
eq("gemini/gemini-2.5-flash-image", classifyModelKind('gemini', 'gemini-2.5-flash-image'), 'image');
eq("gemini/veo-3.0-generate-001", classifyModelKind('gemini', 'veo-3.0-generate-001'), 'video');
eq("gemini/gemini-2.5-flash", classifyModelKind('gemini', 'gemini-2.5-flash'), 'text');
eq("openai/gpt-image-1", classifyModelKind('openai', 'gpt-image-1'), 'image');
eq("flux/fal-ai/flux/schnell", classifyModelKind('flux', 'fal-ai/flux/schnell'), 'image');

// ── B. classifyGeminiApiEntry ───────────────────────────────────────────────
console.log('\n[B] classifyGeminiApiEntry');
eq('gemini-2.5-flash-image + generateContent → image',
  classifyGeminiApiEntry({ name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] }).kind, 'image');
eq('veo-3.0 + predictLongRunning → video',
  classifyGeminiApiEntry({ name: 'models/veo-3.0-generate-001', supportedGenerationMethods: ['predictLongRunning'] }).kind, 'video');
eq('imagen-4.0 + predict → image',
  classifyGeminiApiEntry({ name: 'models/imagen-4.0-generate-001', supportedGenerationMethods: ['predict'] }).kind, 'image');
eq('text-embedding-004 + embedContent → other',
  classifyGeminiApiEntry({ name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] }).kind, 'other');
eq('gemini-2.5-pro + generateContent → text',
  classifyGeminiApiEntry({ name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] }).kind, 'text');

// ── C. מודלים מוצמדים + סינון מודלי מדיה מבורר הצ'אט ────────────────────────
console.log('\n[C] pinned models + text-only filtering');
const cfg = {
  active: 'gemini',
  // gemini-2.5-flash-lite: מודל טקסט אמיתי שאינו ב-PROVIDER_MODEL_OPTIONS ואינו ב-aliasMap —
  // מייצג הצמדה אמיתית. (משפחת 2.0 מנורמלת בכוונה ל-2.5 ע"י aliasMap — retirement, לא באג;
  // הצמדת מודל ישן מתמזגת עם המוגדר וזו ההתנהגות הרצויה.)
  gemini: { key: 'x', model: 'gemini-2.5-flash', models: ['gemini-2.5-flash-lite', 'imagen-3.0-generate-002'] },
  openai: {}, claude: {}, groq: {}, perplexity: {}, scholar: {}, ollama: {}, custom: {},
};
const geminiChoices = getProviderModelChoices('gemini', cfg);
check("choices include pinned 'gemini-2.5-flash-lite'", geminiChoices.includes('gemini-2.5-flash-lite'), JSON.stringify(geminiChoices));
check("choices include 'gemini-2.5-flash'", geminiChoices.includes('gemini-2.5-flash'), JSON.stringify(geminiChoices));
check("choices exclude 'imagen-3.0-generate-002'", !geminiChoices.includes('imagen-3.0-generate-002'), JSON.stringify(geminiChoices));

eq('image override rejected → configured model', getModelNameForProvider('gemini', cfg, 'imagen-3.0-generate-002'), 'gemini-2.5-flash');
eq('video override rejected → configured model', getModelNameForProvider('gemini', cfg, 'veo-3.0-generate-001'), 'gemini-2.5-flash');
eq('text override passes through', getModelNameForProvider('gemini', cfg, 'gemini-2.5-pro'), 'gemini-2.5-pro');

// ── D. getMediaModelChoices ─────────────────────────────────────────────────
console.log('\n[D] getMediaModelChoices');
const imageChoices = getMediaModelChoices('image', 'gemini', { ...cfg, imageGen: { provider: 'gemini', key: '', model: 'imagen-3.0-generate-002' } });
check("image choices include 'imagen-3.0-generate-002'", imageChoices.includes('imagen-3.0-generate-002'), JSON.stringify(imageChoices));
check("image choices include 'gemini-2.5-flash-image'", imageChoices.includes('gemini-2.5-flash-image'), JSON.stringify(imageChoices));
const videoChoices = getMediaModelChoices('video', 'gemini', { ...cfg, videoGen: { provider: 'gemini', key: '', model: 'veo-3.0-generate-001' } });
check("video choices include 'veo-3.0-generate-001'", videoChoices.includes('veo-3.0-generate-001'), JSON.stringify(videoChoices));
check("video choices include 'veo-3.0-fast-generate-001'", videoChoices.includes('veo-3.0-fast-generate-001'), JSON.stringify(videoChoices));

// ── E. טבלת ההכרעה של חיפוש מעוגן-אינטרנט ───────────────────────────────────
// כל true כאן = קריאה בתשלום. extraSystemPrompt מתעלמים ממנו בכוונה: בלוקי
// הרקע (פרויקט/קורס) מכילים כמעט תמיד "עבודה…מקורות".
console.log('\n[E] shouldUseInternetBackedSourceWork');
const GROUNDING_CASES = [
  ['סכם את המסמך', {}, false],
  ['כתוב מבוא לעבודה', {}, false],
  ['כתוב פסקה מקורית על הנושא', {}, false],
  ['שפר את הניסוח', { extraSystemPrompt: 'הנחיות הפרויקט: העבודה תכלול מסמך עם מקורות אקדמיים וציטוטים' }, false],
  ['כתוב סקירת ספרות עם מקורות אקדמיים', {}, true],
  ['כתוב פסקה עם ציטוט ממקור אקדמי', {}, true],
  ['מה שער הדולר היום', {}, true],
  ['בדוק עובדות בפסקה הזו', {}, true],
];
for (const [userPrompt, extra, expected] of GROUNDING_CASES) {
  eq(`"${userPrompt}"${extra.extraSystemPrompt ? ' + extraSystemPrompt' : ''} → ${expected}`,
    shouldUseInternetBackedSourceWork({ userPrompt, ...extra }), expected);
}

// ── F. usageTelemetryService ────────────────────────────────────────────────
console.log('\n[F] usageTelemetryService');
resetUsageTelemetry();
recordModelUsage({
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, thoughtsTokenCount: 25, cachedContentTokenCount: 10 },
  grounded: true,
});
recordModelUsage({ provider: 'gemini', model: 'gemini-2.5-flash', inputTokens: 10, outputTokens: 5 });
const summary = getUsageSummary();
eq('calls', summary.total.calls, 2);
eq('inputTokens', summary.total.inputTokens, 110);
eq('outputTokens', summary.total.outputTokens, 55);
eq('thinkingTokens', summary.total.thinkingTokens, 25);
eq('cachedTokens', summary.total.cachedTokens, 10);
eq('groundedCalls', summary.total.groundedCalls, 1);

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
