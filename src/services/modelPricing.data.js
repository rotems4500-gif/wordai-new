// modelPricing.data.js — נתוני תמחור פר ספק/מודל + המלצות שימוש בעברית.
// המחירים ידניים ומתעדכנים בקוד — שדה asOf מוצג ב-UI. מקור: דפי התמחור הרשמיים.

export const PRICING_AS_OF = '2026-08';

// טוקניזציה של עברית ≈ 2.2-2.5 טוקנים למילה (לעומת ~1.3 באנגלית) — לכן אותה
// מכסת טוקנים שווה הרבה פחות מילים בעברית, וזה מה שמוצג למשתמש.
export const HEBREW_TOKENS_PER_WORD = 2.4;

export const USD_TO_ILS_APPROX = 3.7;

export function tokensToHebrewWords(tokens) {
  return Math.round((Number(tokens) || 0) / HEBREW_TOKENS_PER_WORD);
}

export function formatHebrewWordsPerMillion() {
  const words = tokensToHebrewWords(1_000_000);
  const roundedK = Math.round(words / 5000) * 5;
  return `מיליון טוקנים ≈ כ-${roundedK} אלף מילים בעברית`;
}

// inputPerM/outputPerM — דולר למיליון טוקנים. במודלי תמונה/וידאו במקומם pricePerUnit+unit.
export const MODEL_PRICING = [
  // ── טקסט ──────────────────────────────────────────────────────────────────
  {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    inputPerM: 0.30,
    outputPerM: 2.50,
    kind: 'text',
    tier: 'זול',
    recommendation: 'ברירת המחדל: צ׳אט, תיקונים, סיכומים ורוב העבודה היומיומית. שים לב: טוקני חשיבה (thinking) מחויבים כמחיר פלט.',
  },
  {
    provider: 'gemini',
    model: 'gemini-3.7-flash',
    inputPerM: 0.75,
    outputPerM: 3.75,
    kind: 'text',
    tier: 'בינוני',
    recommendation: 'הדור החדש — חכם משמעותית מ-2.5-flash בתוספת מתונה. מחיר היכרות עד 31.12.2026 (אחריו $1.5/$7.5). מומלץ לכתיבה איכותית. בונוס: grounding על 3.x — 5,000 חיפושים חינם בחודש ואז $14/1,000 (לעומת $35 ב-2.5).',
  },
  {
    provider: 'gemini',
    model: 'gemini-3.5-flash',
    inputPerM: 1.50,
    outputPerM: 9.00,
    kind: 'text',
    tier: 'יקר',
    recommendation: 'דור 3.5 — יקר מ-3.7-flash החדש ולרוב אין סיבה להעדיף אותו.',
  },
  {
    provider: 'gemini',
    model: 'gemini-3.5-flash-lite',
    inputPerM: 0.30,
    outputPerM: 2.50,
    kind: 'text',
    tier: 'זול',
    recommendation: 'lite מדור 3.5 במחיר של 2.5-flash — חלופה מודרנית למשימות מכניות.',
  },
  {
    provider: 'gemini',
    model: 'gemini-3.1-pro-preview',
    inputPerM: 2.00,
    outputPerM: 12.00,
    kind: 'text',
    tier: 'יקר',
    recommendation: 'ה-pro החדש — לניסוח עמוק/ניתוח כבד בלבד; יקר מ-2.5-pro.',
  },
  {
    provider: 'gemini',
    model: 'gemini-2.5-flash-lite',
    inputPerM: 0.10,
    outputPerM: 0.40,
    kind: 'text',
    tier: 'זול',
    recommendation: 'משימות מכניות קצרות בכמות גדולה.',
  },
  {
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    inputPerM: 1.25,
    outputPerM: 10.00,
    kind: 'text',
    tier: 'יקר',
    recommendation: 'ניסוח עמוק של פרק שלם או ניתוח מורכב — פי 8-10 מ-flash; לבחור ידנית רק כשבאמת צריך.',
  },
  {
    provider: 'openai',
    model: 'gpt-4o',
    inputPerM: 2.50,
    outputPerM: 10.00,
    kind: 'text',
    tier: 'יקר',
    recommendation: 'רק אם יש העדפה ספציפית ל-GPT.',
  },
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    inputPerM: 0.15,
    outputPerM: 0.60,
    kind: 'text',
    tier: 'זול',
    recommendation: 'חלופה זולה ל-flash.',
  },
  {
    provider: 'claude',
    model: 'claude-sonnet-4-6',
    inputPerM: 3.00,
    outputPerM: 15.00,
    kind: 'text',
    tier: 'יקר',
    recommendation: 'איכות כתיבה גבוהה; סוכן המרצה משתמש בו נקודתית.',
  },
  {
    provider: 'claude',
    model: 'claude-haiku-4-5',
    inputPerM: 1.00,
    outputPerM: 5.00,
    kind: 'text',
    tier: 'בינוני',
    recommendation: 'איזון בין מחיר לאיכות בצד Claude.',
  },
  {
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    inputPerM: 0.59,
    outputPerM: 0.79,
    kind: 'text',
    tier: 'זול',
    recommendation: 'מהיר מאוד וכמעט חינם; איכות עברית בינונית.',
  },
  {
    provider: 'perplexity',
    model: 'sonar-pro',
    inputPerM: 3.00,
    outputPerM: 15.00,
    kind: 'text',
    tier: 'יקר',
    recommendation: 'רק לחיפוש מקורות — לא לצ׳אט רגיל.',
  },

  // ── תמונה ─────────────────────────────────────────────────────────────────
  {
    provider: 'gemini',
    model: 'imagen-3.0-generate-002',
    kind: 'image',
    unit: 'תמונה',
    pricePerUnit: 0.03,
    tier: 'זול',
    recommendation: 'תמונות אילוסטרטיביות למצגות.',
  },
  {
    provider: 'gemini',
    model: 'gemini-2.5-flash-image',
    kind: 'image',
    unit: 'תמונה',
    pricePerUnit: 0.039,
    tier: 'זול',
    recommendation: 'תרשימים ותמונות עם טקסט (עברית) — הכי מדויק בטקסט בתוך תמונה.',
  },
  {
    provider: 'openai',
    model: 'gpt-image-1',
    kind: 'image',
    unit: 'תמונה',
    pricePerUnit: 0.07, // הערכה לאיכות בינונית
    tier: 'בינוני',
    recommendation: 'חלופת OpenAI.',
  },

  // ── וידאו ─────────────────────────────────────────────────────────────────
  {
    provider: 'gemini',
    model: 'gemini-3-pro-image',
    kind: 'image',
    unit: 'תמונה',
    pricePerUnit: 0.134,
    tier: 'בינוני',
    recommendation: 'Nano Banana Pro — האיכותי ביותר לתרשימים עם טקסט עברי מדויק.',
  },
  {
    provider: 'gemini',
    model: 'veo-3.1-generate-preview',
    kind: 'video',
    unit: 'שנייה',
    pricePerUnit: 0.40,
    tier: 'יקר',
    recommendation: 'וידאו קצר עם סאונד (720p-1080p) — יקר; להשתמש במשורה.',
  },
  {
    provider: 'gemini',
    model: 'veo-3.1-fast-generate-preview',
    kind: 'video',
    unit: 'שנייה',
    pricePerUnit: 0.15,
    tier: 'בינוני',
    recommendation: 'ברירת המחדל לווידאו — גרסה מהירה וזולה יותר של Veo 3.1.',
  },
];

export const GROUNDING_PRICING = {
  provider: 'gemini',
  pricePer1000: 35,
  freePerDay: 1500,
  note: 'חיפוש Google בתוך קריאה (grounding) מחויב בנפרד — ~12.9 אגורות לקריאה מעוגנת על מודלי 2.5. זה היה גורם העלות המרכזי באפליקציה. על מודלי 3.x התנאים טובים בהרבה: 5,000 חיפושים חינם בחודש ואז $14/1,000.',
};

// תנאי ה-grounding לפי משפחת מודל: 3.x מקבל מכסה חינם חודשית ומחיר נמוך בהרבה.
export const GROUNDING_TIERS = [
  { match: /^gemini-3/i, pricePer1000: 14, freePerMonth: 5000, label: 'Gemini 3.x' },
  { match: /^gemini/i, pricePer1000: 35, freePerMonth: 0, label: 'Gemini 2.5' },
];
export const resolveGroundingTier = (model = '') =>
  GROUNDING_TIERS.find((tier) => tier.match.test(String(model || ''))) || GROUNDING_TIERS[GROUNDING_TIERS.length - 1];

// ── תמחור למודל לא-מוכר ─────────────────────────────────────────────────────
// מודל חדש/מותאם שלא ברשימה עדיין עולה כסף — אומדן לפי משפחה עדיף על אפס שקרי.
// כל התאמה כאן מסומנת estimated:true כדי שה-UI יסמן "אומדן" ולא יתחזה לוודאות.
const PRICING_FAMILY_FALLBACKS = [
  { match: /^gemini-3[^-]*-?pro/i, inputPerM: 2.00, outputPerM: 12.00 },
  { match: /^gemini-3.*lite/i, inputPerM: 0.30, outputPerM: 2.50 },
  { match: /^gemini-3/i, inputPerM: 0.75, outputPerM: 3.75 },
  { match: /^gemini-2\.5-pro/i, inputPerM: 1.25, outputPerM: 10.00 },
  { match: /^gemini/i, inputPerM: 0.30, outputPerM: 2.50 },
  { match: /^(gpt-5|o\d)/i, inputPerM: 1.25, outputPerM: 10.00 },
  { match: /mini|lite|small|haiku|flash/i, inputPerM: 0.30, outputPerM: 1.50 },
  { match: /^claude/i, inputPerM: 3.00, outputPerM: 15.00 },
  { match: /^(sonar|pplx)/i, inputPerM: 3.00, outputPerM: 15.00 },
  { match: /^(llama|mixtral|qwen|gemma|deepseek|mistral)/i, inputPerM: 0.59, outputPerM: 0.79 },
];
const PROVIDER_FALLBACK_RATES = {
  gemini: { inputPerM: 0.30, outputPerM: 2.50 },
  openai: { inputPerM: 2.50, outputPerM: 10.00 },
  claude: { inputPerM: 3.00, outputPerM: 15.00 },
  groq: { inputPerM: 0.59, outputPerM: 0.79 },
  perplexity: { inputPerM: 3.00, outputPerM: 15.00 },
  // ollama/local רצים על המחשב — אפס עלות API אמיתית.
  ollama: { inputPerM: 0, outputPerM: 0, local: true },
  custom: { inputPerM: 1.00, outputPerM: 3.00 },
};

/**
 * resolvePricingEntry — מחזיר תעריף לכל צמד ספק/מודל, גם כשאינו ברשימה המדויקת.
 * @returns {{inputPerM:number, outputPerM:number, estimated:boolean, local:boolean, entry:object|null}}
 */
export function resolvePricingEntry(provider = '', model = '') {
  const wantedModel = String(model || '').trim();
  const wantedProvider = String(provider || '').trim();
  const exact = MODEL_PRICING.find((it) => it.model === wantedModel && (!wantedProvider || it.provider === wantedProvider))
    || MODEL_PRICING.find((it) => it.model === wantedModel);
  if (exact) {
    return {
      inputPerM: Number(exact.inputPerM) || 0,
      outputPerM: Number(exact.outputPerM) || 0,
      estimated: false,
      local: false,
      entry: exact,
    };
  }
  if (wantedProvider === 'ollama') return { inputPerM: 0, outputPerM: 0, estimated: false, local: true, entry: null };
  const family = PRICING_FAMILY_FALLBACKS.find((it) => it.match.test(wantedModel));
  if (family) return { inputPerM: family.inputPerM, outputPerM: family.outputPerM, estimated: true, local: false, entry: null };
  const byProvider = PROVIDER_FALLBACK_RATES[wantedProvider] || PROVIDER_FALLBACK_RATES.custom;
  return {
    inputPerM: byProvider.inputPerM,
    outputPerM: byProvider.outputPerM,
    estimated: true,
    local: Boolean(byProvider.local),
    entry: null,
  };
}

/**
 * estimateBucketCostUSD — עלות רשומת שימוש מצטברת (מה שהטלמטריה סופרת), כולל
 * טוקני חשיבה (מחויבים כפלט) ו-grounding לפי משפחת המודל ומכסת החינם החודשית.
 * @param {number} freeGroundingRemaining כמה קריאות מעוגנות עדיין בתוך המכסה החינמית.
 */
export function estimateBucketCostUSD(provider = '', model = '', bucket = {}, freeGroundingRemaining = 0) {
  const rate = resolvePricingEntry(provider, model);
  const input = Number(bucket.inputTokens) || 0;
  // חשיבה מחויבת במחיר פלט — ר' הערת usageTelemetryService.
  const billedOutput = (Number(bucket.outputTokens) || 0) + (Number(bucket.thinkingTokens) || 0);
  const tokensCost = (input * rate.inputPerM + billedOutput * rate.outputPerM) / 1e6;
  const grounded = Number(bucket.groundedCalls) || 0;
  const tier = resolveGroundingTier(model);
  const billableGrounded = Math.max(0, grounded - Math.max(0, Number(freeGroundingRemaining) || 0));
  const groundingCost = (billableGrounded * tier.pricePer1000) / 1000;
  return { totalUsd: tokensCost + groundingCost, tokensUsd: tokensCost, groundingUsd: groundingCost, rate, tier };
}

/**
 * הערכת עלות קריאה בודדת בדולרים (מודל לא-מוכר ⇒ אומדן משפחתי, לא אפס).
 */
export function estimateCallCostUSD({ model, provider, inputTokens = 0, outputTokens = 0, thinkingTokens = 0, grounded = false } = {}) {
  const { totalUsd } = estimateBucketCostUSD(provider, model, {
    inputTokens,
    outputTokens,
    thinkingTokens,
    groundedCalls: grounded ? 1 : 0,
  }, 0);
  return totalUsd;
}

export const QUICKCHART_NOTE = 'גרפים מנתונים: מנוע QuickChart — חינם לחלוטין, בלי מודל AI בכלל.';
