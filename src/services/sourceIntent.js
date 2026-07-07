// sourceIntent.js — שכבת כוונה לפני אחזור מקורות.
// המטרה: לא לחפש רק כי הופיעה המילה "מקורות"; קודם להבין אם המשתמש מבקש
// חיפוש חדש, שימוש במקורות קיימים, או פעולה רגילה על המסמך.

const SOURCE_ITEM_PATTERN = /(?:מקורות?|קישורים?|לינקים?|מאמרים?|כתבות?|ידיעות?|sources?|references?|citations?|links?|articles?)/i;
const FOUND_BY_ASSISTANT_PATTERN = /(?:ש(?:ה)?באת|שהבאת|שמצאת|שהצעת|שהחזרת|האלה|הללו|הקיימים|above|you\s+(?:found|brought|provided|returned)|existing|these|those)/i;
const INTEGRATE_ACTION_PATTERN = /(?:שלב|תשלב|שלבי|הטמע|תטמיע|הכנס|תכניס|הוסף|תוסיף|שבץ|שזור|צרף|תצרף|integrat(?:e|ing)|use|insert|weave|incorporate|cite|add)/i;
const WRITE_FROM_ACTION_PATTERN = /(?:כתוב|תכתוב|כתבי|נסח|תנסח|צרי|צור|בנה|תבנה|ערוך|תערוך|write|draft|compose|prepare|generate|create|edit)/i;
const BASIS_PATTERN = /(?:על\s+בסיס|בהסתמך\s+על|לפי|מתוך|based\s+on|using|with)/i;
const CONTEXT_PRONOUN_PATTERN = /(?:אותם|אותן|אותו|אותה|זה|זו|אלה|אלו|them|these|those|it|that)/i;
const NEW_SEARCH_ACTION_PATTERN = /(?:מצא|חפש|אתר|תן|תביא|הבא|שלוף|אסוף|find|search|fetch|provide|bring|get|lookup|look\s+up)/i;

export const isSourceReuseOrIntegrationRequest = (value = '', { hasSourceLock = false } = {}) => {
  const text = String(value || '').trim();
  if (!text) return false;

  // "תשלב את המקורות שהבאת" / "use the sources above"
  const explicitExistingSources = new RegExp(
    `(?:${INTEGRATE_ACTION_PATTERN.source}|${WRITE_FROM_ACTION_PATTERN.source})[\\s\\S]{0,80}${SOURCE_ITEM_PATTERN.source}[\\s\\S]{0,80}${FOUND_BY_ASSISTANT_PATTERN.source}|${SOURCE_ITEM_PATTERN.source}[\\s\\S]{0,80}${FOUND_BY_ASSISTANT_PATTERN.source}[\\s\\S]{0,80}(?:${INTEGRATE_ACTION_PATTERN.source}|${WRITE_FROM_ACTION_PATTERN.source})`,
    'i',
  );
  if (explicitExistingSources.test(text)) return true;

  // "כתוב על בסיס המקורות האלה" / "based on the references"
  const basisExistingSources = new RegExp(
    `${BASIS_PATTERN.source}[\\s\\S]{0,50}${SOURCE_ITEM_PATTERN.source}[\\s\\S]{0,60}${FOUND_BY_ASSISTANT_PATTERN.source}?`,
    'i',
  );
  if (basisExistingSources.test(text)) return true;

  // אם כבר יש lock באותו RunScope, גם ניסוחים קצרים טבעיים מתייחסים לרוב למקורות הקודמים:
  // "תכניס אותם לעבודה", "תשתמש בזה", "כתוב על בסיסם".
  if (hasSourceLock) {
    const pronounIntegration = new RegExp(
      `(?:${INTEGRATE_ACTION_PATTERN.source}|${WRITE_FROM_ACTION_PATTERN.source})[\\s\\S]{0,50}(?:${CONTEXT_PRONOUN_PATTERN.source}|${BASIS_PATTERN.source})|${BASIS_PATTERN.source}[\\s\\S]{0,50}${CONTEXT_PRONOUN_PATTERN.source}`,
      'i',
    );
    if (pronounIntegration.test(text)) return true;
  }

  return false;
};

export const classifySourceIntent = (value = '', options = {}) => {
  const text = String(value || '').trim();
  if (!text) return { intent: 'none', confidence: 0 };
  if (isSourceReuseOrIntegrationRequest(text, options)) {
    return { intent: 'reuse-existing-sources', confidence: options.hasSourceLock ? 0.95 : 0.85 };
  }
  if (NEW_SEARCH_ACTION_PATTERN.test(text) && SOURCE_ITEM_PATTERN.test(text)) {
    return { intent: 'find-new-sources', confidence: 0.8 };
  }
  return { intent: 'none', confidence: 0.4 };
};
