// wordRouting — "החלה חכמה": מיפוי תשובת AI ליעדי הכנסה קונקרטיים במסמך.
// פורט מהתוסף הישן (buildAIRoutingMap), עם קריאת המודל דרך chatWithActiveProvider
// של האפליקציה (כל provider מוגדר, לא רק Gemini). עקרון: לא ממציאים עוגנים,
// יעד דו-משמעי מדולג.

import { chatWithActiveProvider } from '../services/aiService';
import { normalizeLocator, sanitizeMarkdownText } from './wordBridge';

const ROUTING_MAX_SUGGESTIONS = 12;
const ROUTING_MIN_CONFIDENCE = 0.55;
const ROUTING_TARGET_MAX_LENGTH = 255; // מגבלת body.search בחלק ממארחי Word

const parseJsonSafe = (text) => {
  try { return JSON.parse(text); } catch { return null; }
};

export const extractJsonObject = (text) => {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('לא התקבל JSON תקין מה-AI');

  const direct = parseJsonSafe(raw);
  if (direct && typeof direct === 'object') return direct;

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    const fenced = parseJsonSafe(fencedMatch[1]);
    if (fenced && typeof fenced === 'object') return fenced;
  }

  const firstBrace = raw.indexOf('{');
  const firstBracket = raw.indexOf('[');
  const rootIsArray = firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace);

  if (rootIsArray) {
    for (let end = raw.lastIndexOf(']'); end > firstBracket; end = raw.lastIndexOf(']', end - 1)) {
      const parsed = parseJsonSafe(raw.slice(firstBracket, end + 1));
      if (parsed && typeof parsed === 'object') return parsed;
    }
  }
  if (firstBrace !== -1) {
    for (let end = raw.lastIndexOf('}'); end > firstBrace; end = raw.lastIndexOf('}', end - 1)) {
      const parsed = parseJsonSafe(raw.slice(firstBrace, end + 1));
      if (parsed && typeof parsed === 'object') return parsed;
    }
  }
  throw new Error('לא התקבל JSON תקין מה-AI');
};

const normalizeRoutingOperation = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['replace', 'החלפה'].includes(normalized)) return 'replace';
  if (['insert_before', 'before', 'לפני'].includes(normalized)) return 'insert_before';
  return 'insert_after';
};

const normalizeRoutingTargetKind = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['heading', 'section', 'exact_text', 'paragraph', 'document_end'].includes(normalized)) return normalized;
  if (['כותרת', 'סעיף', 'פרק'].includes(normalized)) return 'section';
  return 'exact_text';
};

const uniqueByNormalizedText = (items, getText) => {
  const seen = new Set();
  return (items || []).filter((item) => {
    const key = normalizeLocator(getText(item));
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const normalizeRoutingSuggestions = (rawSuggestions = []) => uniqueByNormalizedText(
  rawSuggestions
    .map((item) => {
      const targetLocation = String(item?.targetLocation || item?.locatorText || item?.originalText || '').trim().slice(0, ROUTING_TARGET_MAX_LENGTH);
      const targetHeading = String(item?.targetHeading || item?.heading || '').trim();
      const suggestionText = sanitizeMarkdownText(item?.suggestionText || item?.replacement || item?.text || '').trim();
      const confidence = Number(item?.confidence) || 0;
      return {
        targetKind: normalizeRoutingTargetKind(item?.targetKind || item?.kind || ''),
        targetLocation,
        targetHeading,
        locatorText: String(item?.locatorText || targetLocation || targetHeading || '').trim().slice(0, ROUTING_TARGET_MAX_LENGTH),
        suggestionText,
        operation: normalizeRoutingOperation(item?.operation || item?.action || ''),
        confidence,
      };
    })
    .filter((item) => item.suggestionText
      && item.confidence >= ROUTING_MIN_CONFIDENCE
      && (item.targetLocation || item.targetHeading || item.targetKind === 'document_end'))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, ROUTING_MAX_SUGGESTIONS),
  (item) => `${item.targetKind}:${item.targetHeading}:${item.targetLocation}:${item.suggestionText}`,
);

const buildRoutingPrompt = (aiText, snapshot, options = {}) => {
  const sections = Array.isArray(snapshot.sections) ? snapshot.sections : [];
  const sectionList = sections.slice(0, 24).map((section) =>
    `- ${section.index}. "${section.title}"${section.content ? ` — ${section.content.slice(0, 260)}` : ''}`,
  ).join('\n');

  return `You are WORDFLOW, a conservative document-aware editor for a Word add-in.
Map the assistant response into concrete insertion targets in the current Hebrew academic document.

Return ONLY valid JSON with this exact shape:
{
  "suggestions": [
    {
      "targetKind": "exact_text | heading | section | paragraph | document_end",
      "targetLocation": "exact text fragment from the document where this suggestion belongs",
      "targetHeading": "exact heading from the provided outline, if relevant",
      "locatorText": "short unique locator from the document",
      "operation": "insert_after | insert_before | replace",
      "suggestionText": "the suggestion or revision for that location",
      "confidence": 0.95
    }
  ]
}

Rules:
- Prefer exact_text when you can quote a unique fragment from the document.
- targetLocation must be at most 255 characters.
- Use heading/section only with an exact heading from the outline.
- Use document_end only for genuinely new material that has no local anchor.
- targetLocation must be an exact substring from the document when targetKind is exact_text or paragraph.
- Do not invent document text, headings, or locations.
- If a target is ambiguous, skip it.
- Split the assistant response into targeted edits; do not paste the full response into every section.
- Use replace only when the assistant response is clearly a replacement for the target text. Otherwise use insert_after.
- Return max ${ROUTING_MAX_SUGGESTIONS} suggestions, highest confidence first.

User request that produced the assistant response:
${String(options.userPrompt || '').slice(0, 2000) || 'none'}

Document outline:
${snapshot.outlineText || sectionList || 'none'}

Original Document:
${snapshot.text || snapshot.excerptText || ''}

AI Response to Route:
${String(aiText || '').slice(0, 8000)}`;
};

/**
 * ממפה תשובת assistant ליעדי הכנסה. מחזיר suggestions מנורמלים (ריק אם אין
 * עוגנים ברורים). הקריאה עוברת דרך ה-provider הפעיל של המשתמש.
 */
export const buildAIRoutingMap = async (aiText, documentSnapshot = {}, options = {}) => {
  const snapshot = documentSnapshot && typeof documentSnapshot === 'object'
    ? documentSnapshot
    : { text: String(documentSnapshot || '') };

  const routingPrompt = buildRoutingPrompt(aiText, snapshot, options);
  const response = await chatWithActiveProvider(routingPrompt, '', '', {
    directChat: true,
    skipAutomation: true,
    skipSkillSelection: true,
    skipMultiModel: true,
    includeAppMemory: false,
    autoUseDefaultSkill: false,
    agentLabel: 'WORDFLOW routing',
  });

  let parsed;
  try {
    parsed = extractJsonObject(response);
  } catch {
    // ניסיון חילוץ שני: המרה מחדש ל-JSON קפדני
    const rescue = await chatWithActiveProvider(
      `Convert the following text into STRICT JSON only.
Return ONLY valid JSON with this exact shape:
{"suggestions":[{"targetLocation":"...","suggestionText":"...","confidence":0.9}]}

Text to convert:
${String(response || '').slice(0, 6000)}`,
      '', '', {
        directChat: true,
        skipAutomation: true,
        skipSkillSelection: true,
        skipMultiModel: true,
        includeAppMemory: false,
        autoUseDefaultSkill: false,
        agentLabel: 'WORDFLOW routing rescue',
      },
    );
    parsed = extractJsonObject(rescue);
  }

  const rawSuggestions = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.suggestions)
      ? parsed.suggestions
      : [];

  return normalizeRoutingSuggestions(rawSuggestions);
};
