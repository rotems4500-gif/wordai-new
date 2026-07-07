// telemetry.js — עטיפת אירועי debug של אחזור מקורות. שמות האירועים תואמים ל-log הקיים
// (verified-source-provider-start/-result/-error) + חדשים: source-url-verify-*, source-cache-hit,
// source-budget-exhausted.

export const makeRetrievalLogger = (logEvent) => {
  const emit = typeof logEvent === 'function' ? logEvent : null;
  return (type, message, payload = {}) => {
    try {
      emit?.(type, message, payload);
    } catch {
      // טלמטריה לעולם לא מפילה אחזור.
    }
  };
};
