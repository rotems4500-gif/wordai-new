// onboardingProviders.js — רשימת ספקי ה-AI היחידה של האונבורדינג וזרימת הסגנון.
// עד 14.8.26 הרשימה חיה בשני עותקים (ProfileOnboarding + StyleSetupFlow) עם תווית
// אחת שונה — עכשיו מקור-אמת אחד. סדר = סדר תצוגה.
export const ONBOARDING_AI_PROVIDERS = [
  ['gemini', 'Gemini'], ['openai', 'OpenAI'], ['claude', 'Claude'], ['groq', 'Groq'],
  ['perplexity', 'Perplexity'], ['deepseek', 'DeepSeek'], ['mistral', 'Mistral'],
  ['together', 'Together.ai'], ['openrouter', 'OpenRouter'], ['xai', 'xAI (Grok)'],
  ['ollama', 'Ollama'], ['lmstudio', 'LM Studio'], ['custom', 'ספק אחר / מותאם'],
];

// אותה רשימה בצורת אובייקטים — הצורה ש-StyleSetupFlow (בורר הניתוח החיצוני) צורך.
export const EXTERNAL_PROVIDER_OPTIONS = ONBOARDING_AI_PROVIDERS.map(([id, label]) => ({ id, label }));
