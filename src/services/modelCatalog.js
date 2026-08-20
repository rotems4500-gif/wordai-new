// modelCatalog.js — קטלוג יכולות מודלים: אילו מודלים קיימים פר ספק ולאיזו מודליות
// (טקסט/תמונה/וידאו) כל מזהה שייך. מודול טהור — נצרך גם מ-Node harness וגם מה-taskpane.

// ── presets פר ספק ──────────────────────────────────────────────────────────
export const IMAGE_MODEL_PRESETS = {
  gemini: ['gemini-2.5-flash-image', 'gemini-3-pro-image', 'imagen-3.0-generate-002', 'imagen-4.0-generate-001'],
  openai: ['gpt-image-1'],
  stability: ['stable-diffusion-xl-1024-v1-0'],
  xai: ['grok-2-image'],
  flux: ['fal-ai/flux/schnell', 'fal-ai/flux/dev'],
};

// נמדד על מפתח אמיתי (8.2026): מפתחות AI Studio מגישים veo-3.1-*-preview; שמות ה-GA
// veo-3.0-* נשארים לתאימות מפתחות אחרים. הרשימה בפועל מתמזגת עם ה-discovery מהמפתח.
export const VIDEO_MODEL_PRESETS = {
  gemini: ['veo-3.1-fast-generate-preview', 'veo-3.1-generate-preview', 'veo-3.0-generate-001', 'veo-3.0-fast-generate-001'],
};

// איחוד שטוח ומנוכה-כפילויות של כל מודלי התמונה — הצעות להשלמה ב-UI.
export const IMAGE_GEN_MODEL_SUGGESTIONS = [
  ...new Set(Object.values(IMAGE_MODEL_PRESETS).flat()),
];

// ── סיווג לפי מזהה ──────────────────────────────────────────────────────────
const IMAGEN_RE = /^imagen-/i;
const VEO_RE = /^veo-/i;
// "image" כטוקן שלם בתוך המזהה: gpt-image-1, gemini-2.5-flash-image, grok-2-image.
const IMAGE_TOKEN_RE = /(^|[-_./])image([-_./]|$)/i;
const STABLE_DIFFUSION_RE = /stable-diffusion/i;

/**
 * מחזיר 'image' | 'video' | 'text' עבור צמד ספק+מודל.
 */
export function classifyModelKind(providerId, modelId) {
  const id = String(modelId || '');
  if (!id) return 'text';
  if (IMAGEN_RE.test(id)) return 'image';
  if (VEO_RE.test(id)) return 'video';
  // nano-banana-pro-preview: מודל תמונה בלי המילה image במזהה (נמדד ברשימת המפתח 8.2026).
  if (/nano-banana/i.test(id)) return 'image';
  if (IMAGE_TOKEN_RE.test(id)) return 'image';
  // מסלולי fal-ai (flux) אינם מכילים את המילה image במזהה.
  if (String(providerId || '') === 'flux' || /^fal-ai\//i.test(id)) return 'image';
  if (STABLE_DIFFUSION_RE.test(id)) return 'image';
  // אודיו/מוזיקה (lyria) ו-TTS מפרסמים generateContent אבל אינם צ'אט ואינם מדיה נתמכת.
  if (/^lyria-/i.test(id) || /-tts(-|$)/i.test(id)) return 'other';
  return 'text';
}

/**
 * מסווג פריט מתשובת ListModels של Gemini: { name: 'models/xxx', supportedGenerationMethods: [...] }
 * ⚠️ סדר חשוב: קודם כל הרגקס על המזהה ורק אחר כך בדיקת המתודות —
 * nano-banana (gemini-2.5-flash-image) מפרסם generateContent אבל הוא מודל תמונה,
 * ולכן הסתמכות על supportedGenerationMethods בלבד הייתה מסווגת אותו כטקסט.
 */
export function classifyGeminiApiEntry(entry) {
  const rawName = String(entry?.name || '');
  const id = rawName.replace(/^models\//, '');
  const byId = classifyModelKind('gemini', id);
  if (byId !== 'text') return { id, kind: byId };

  const methods = Array.isArray(entry?.supportedGenerationMethods)
    ? entry.supportedGenerationMethods.map((m) => String(m || ''))
    : [];
  if (methods.includes('predictLongRunning')) return { id, kind: 'video' };
  if (methods.includes('predict') && !methods.includes('generateContent')) return { id, kind: 'image' };
  // בלי generateContent (embedding/aqa וכו') — לא טקסט ולא מדיה: 'other' מסונן בכל הצרכנים.
  if (!methods.includes('generateContent')) return { id, kind: 'other' };
  return { id, kind: 'text' };
}

/**
 * האם המודל מתאים לבחירה כמודל טקסט (צ׳אט/כתיבה).
 */
export function isTextModelChoice(providerId, modelId) {
  return classifyModelKind(providerId, modelId) === 'text';
}
