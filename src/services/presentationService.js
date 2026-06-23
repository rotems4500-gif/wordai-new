// ═══════════════════════════════════════════════════════════════
// presentationService.js — יצירת deck (JSON מובנה) מ-LLM.
// מחזיר אובייקט deck מנורמל, לא HTML. זה הלב של "מצגת אמיתית".
// ═══════════════════════════════════════════════════════════════

import { chatWithActiveProvider, getFeatureProviderConfig } from './aiService';
import { normalizeDeck, SLIDE_LAYOUT_IDS } from '../presentation/deckModel';
import { DECK_THEMES } from '../presentation/deckThemes';

const MAX_SOURCE_CHARS = 16000;

const DENSITY_GUIDANCE = {
  lean: 'רזה: כל שקופית כותרת + 1-3 נקודות קצרות מאוד. בלי טקסט מעוטר.',
  balanced: 'מאוזן: כותרת + 3-4 נקודות תמציתיות. מסר מרכזי חד לכל שקופית.',
  rich: 'עשיר: מסרים חדים, יותר תוכן ויזואלי, תיאורי תמונה מפורטים יותר.',
};

// בונה את הסכמה שה-LLM חייב להחזיר
const buildSchemaInstruction = (slideCount, imageIntensity) => `
החזר JSON תקין בלבד (בלי טקסט מסביב, בלי code fences) במבנה הבא:
{
  "title": "כותרת המצגת",
  "slides": [
    {
      "layout": "אחד מ: ${SLIDE_LAYOUT_IDS.join(', ')}",
      "title": "כותרת השקופית",
      "subtitle": "כותרת משנה קצרה (אופציונלי)",
      "bullets": ["נקודה קצרה", "נקודה קצרה"],
      "body": "טקסט חופשי — רק לפריסת quote",
      "columns": [{"heading":"...","bullets":["..."]}],
      "image": { "query": "תיאור באנגלית לחיפוש/יצירת תמונה", "alt": "תיאור בעברית" },
      "notes": "הערות מרצה קצרות (אופציונלי)"
    }
  ]
}
חוקים:
- בדיוק ${slideCount} שקופיות.
- שקופית ראשונה layout="cover". מומלץ לסיים ב-"closing".
- השתמש במגוון פריסות (image-right/image-left/two-column/title-bullets) לפי התוכן.
- שדה "image" רק בפריסות שתומכות בתמונה (cover, image-right, image-left, image-full, closing). ה-query באנגלית, קונקרטי ונקי.
- ${imageIntensity === 'low' ? 'מעט תמונות — רק בשער ובסיום.' : imageIntensity === 'medium' ? 'תמונות בכ-חצי מהשקופיות.' : 'תמונות ברוב השקופיות שתומכות בכך.'}
- נקודות קצרות (עד ~10 מילים). בלי פסקאות ארוכות. עברית.
`;

// מחלץ JSON גם אם המודל עטף ב-code fence או הוסיף טקסט
const extractJson = (raw = '') => {
  let text = String(raw || '').trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('המודל לא החזיר JSON תקין למצגת.');
  }
  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch (err) {
    // ניסיון תיקון קל: הסרת פסיקים תלויים
    const repaired = candidate.replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(repaired);
  }
};

/**
 * generateDeck — מייצר deck מנושא או ממסמך קיים.
 * @returns {Promise<object>} deck מנורמל (deckModel.normalizeDeck)
 */
export const generateDeck = async ({
  source = 'topic',
  topic = '',
  audience = '',
  goal = '',
  documentText = '',
  slideCount = 10,
  themeId = 'premium',
  density = 'balanced',
  imageIntensity = 'high',
  providerConfigOverride = null,
  signal,
} = {}) => {
  const cleanTopic = String(topic || '').trim();
  const fromDocument = source === 'document';
  const safeSlideCount = Math.max(4, Math.min(20, Number(slideCount) || 10));
  const safeDensity = ['lean', 'balanced', 'rich'].includes(density) ? density : 'balanced';
  const safeTheme = DECK_THEMES.some((t) => t.id === themeId) ? themeId : 'premium';

  const trimmedDoc = fromDocument
    ? (String(documentText || '').length > MAX_SOURCE_CHARS
        ? `${String(documentText).slice(0, MAX_SOURCE_CHARS)}\n[...קוצר...]`
        : String(documentText || ''))
    : '';

  if (fromDocument && !trimmedDoc.trim()) throw new Error('אין תוכן מקור להפיכה למצגת.');
  if (!fromDocument && !cleanTopic) throw new Error('חסר נושא למצגת.');

  const prompt = [
    fromDocument
      ? 'הפוך את המסמך הבא למצגת ויזואלית שמסכמת ומציגה אותו. מותר לקצר, לסכם ולשנות מבנה.'
      : `צור מצגת בעברית בנושא: ${cleanTopic}`,
    fromDocument && cleanTopic ? `זווית/דגש מבוקש: ${cleanTopic}` : '',
    audience ? `קהל יעד: ${String(audience).trim()}` : '',
    goal ? `מטרה: ${String(goal).trim()}` : '',
    DENSITY_GUIDANCE[safeDensity],
    buildSchemaInstruction(safeSlideCount, imageIntensity),
    fromDocument ? `\nתוכן המסמך:\n"""\n${trimmedDoc}\n"""` : '',
  ].filter(Boolean).join('\n');

  // override מפורש מנצח; אחרת — API ייעודי למצגות אם הוגדר בהגדרות.
  const featureOverride = providerConfigOverride || getFeatureProviderConfig('presentations')?.config || null;

  const rawResponse = await chatWithActiveProvider(prompt, '', 'אתה מעצב מצגות מקצועי. החזר אך ורק JSON תקין לפי הסכמה.', {
    skipAutomation: true,
    skipMultiModel: true,
    directChat: true,
    skipSkillSelection: true,
    omitPersonalStyleStructureHints: true,
    ...(featureOverride ? { providerConfigOverride: featureOverride } : {}),
    ...(signal ? { signal } : {}),
  });

  const parsed = extractJson(rawResponse);
  const deck = normalizeDeck({
    title: parsed.title || cleanTopic || 'מצגת',
    themeId: safeTheme,
    meta: { audience: String(audience || '').trim(), goal: String(goal || '').trim(), topic: cleanTopic },
    slides: parsed.slides,
  });

  if (!deck.slides.length) throw new Error('לא נוצרו שקופיות.');
  return deck;
};
