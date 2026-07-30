// style-seed-determinism.mjs — אימות A1: seed דטרמיניסטי ⇒ בלוק הזרקה זהה byte-identical.
// נבנה דרך vite.verify.config.mjs (WORDAI_VERIFY_ENTRY=styleseed) ורץ ב-Node.
import { buildStyleEngineInjectionBlock } from 'styleprofile';

// פרופיל מנוע סינתטי עם 12 תבניות — מספיק כדי שרוטציית 5-מתוך-N תהיה רגישה ל-seed.
const styleEngine = {
  enabled: true,
  metrics: { avgSentenceWords: 21, commaPerSentence: 1.4, avgParagraphWords: 62 },
  patterns: Array.from({ length: 12 }, (_, i) => ({
    text: `תבנית סגנון מספר ${i + 1}: פתיחה אופיינית ${i + 1}`,
    weight: 1 + (i % 4),
  })),
  negativeSpace: ['ביטוי שאסור 1', 'ביטוי שאסור 2'],
};

// hashStyleSeed משוכפל כאן (הפונקציה חיה ב-aiService שדורש דפדפן) — FNV-1a זהה.
const hashStyleSeed = (value = '') => {
  const text = String(value || '');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 9973;
};

const prompt = 'כתוב עבודה אקדמית על השפעת הרשתות החברתיות על שיח פוליטי בישראל';
const seed = hashStyleSeed(prompt);
const a = buildStyleEngineInjectionBlock(styleEngine, { seed, genre: null, chunkBlock: '' });
const b = buildStyleEngineInjectionBlock(styleEngine, { seed, genre: null, chunkBlock: '' });
const other = buildStyleEngineInjectionBlock(styleEngine, { seed: (seed + 1) % 9973, genre: null, chunkBlock: '' });

let failed = false;
if (!a || !a.trim()) { console.log('✗ הבלוק ריק — הפרופיל הסינתטי לא הופעל'); failed = true; }
if (a !== b) { console.log('✗ אותו seed נתן בלוקים שונים — הרוטציה לא דטרמיניסטית'); failed = true; }
else console.log('✓ אותו seed ⇒ בלוק byte-identical');
if (a === other) console.log('ℹ️ seed שונה נתן בלוק זהה (ייתכן — רוטציה לא רגישה ב-±1)');
else console.log('✓ seed שונה ⇒ רוטציה שונה (הרוטציה אכן תלוית-seed)');
console.log(`seed=${seed} · אורך בלוק=${a.length}`);
process.exit(failed ? 1 : 0);
