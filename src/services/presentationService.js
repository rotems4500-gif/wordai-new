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

// מעל סף זה מייצרים ב-chunks (outline + מילוי במנות) כדי שהפלט של המודל לא ייחתך.
const CHUNK_THRESHOLD = 18;
const BATCH_SIZE = 10;

const imageRule = (imageIntensity) =>
  imageIntensity === 'low'
    ? 'מעט תמונות — רק בשער ובסיום.'
    : imageIntensity === 'medium'
      ? 'תמונות בכ-חצי מהשקופיות.'
      : 'תמונות ברוב השקופיות שתומכות בכך.';

// מבנה אובייקט שקופית — משותף בין shot-אחד למילוי-מנות
const SLIDE_SHAPE = `{
  "layout": "אחד מ: ${SLIDE_LAYOUT_IDS.join(', ')}",
  "title": "כותרת השקופית",
  "subtitle": "כותרת משנה קצרה (אופציונלי)",
  "bullets": ["נקודה קצרה", "נקודה קצרה"],
  "body": "טקסט חופשי — לפריסות quote / big-statement",
  "columns": [{"heading":"...","bullets":["..."]}],
  "stats": [{"value":"87%","label":"תיאור קצר","caption":"הקשר (אופציונלי)"}],
  "steps": [{"title":"שם השלב","body":"תיאור קצר (אופציונלי)"}],
  "image": { "query": "תיאור באנגלית לחיפוש/יצירת תמונה", "alt": "תיאור בעברית" },
  "notes": "הערות מרצה קצרות (אופציונלי)"
}`;

const SLIDE_CONTENT_RULES = (imageIntensity) => [
  '- גוון פריסות לפי סוג התוכן — אל תשתמש ב-title-bullets לכל שקף. המר תוכן למבנה ויזואלי:',
  '  • stat — כשיש מספרים/אחוזים/מדדים בולטים (שדה "stats", 1-4 פריטים). value קצר וחד.',
  '  • steps — לתהליך/שלבים/שיטה (שדה "steps", 3-5 שלבים).',
  '  • comparison — להשוואת שתי גישות/אפשרויות (שדה "columns", בדיוק 2 עמודות).',
  '  • big-statement — למסר/תובנה מרכזית אחת (שדה "body", משפט אחד חד). בלי בולטים.',
  '  • two-column — לחלוקה לשני נושאים מקבילים. quote — לציטוט.',
  '- שדה "image" רק בפריסות שתומכות בתמונה (cover, image-right, image-left, image-full, closing). ה-query באנגלית, קונקרטי ונקי.',
  `- ${imageRule(imageIntensity)}`,
  '- נקודות קצרות (עד ~10 מילים). בלי פסקאות ארוכות. עברית.',
].join('\n');

// בונה את הסכמה שה-LLM חייב להחזיר (מסלול shot-אחד)
const buildSchemaInstruction = (slideCount, imageIntensity) => `
החזר JSON תקין בלבד (בלי טקסט מסביב, בלי code fences) במבנה הבא:
{
  "title": "כותרת המצגת",
  "slides": [
    ${SLIDE_SHAPE}
  ]
}
חוקים:
- בדיוק ${slideCount} שקופיות.
- שקופית ראשונה layout="cover". מומלץ לסיים ב-"closing".
${SLIDE_CONTENT_RULES(imageIntensity)}
`;

// בונה prompt לשלד (outline) — פריט קליל לכל שקופית, נכנס בקלות בלי חיתוך.
// slideCount === null => אוטומטי: המודל בוחר את מספר השקופיות לפי עומק התוכן.
const buildOutlinePrompt = (slideCount) => `
${slideCount == null
    ? 'תכנן שלד מצגת. בחר בעצמך את מספר השקופיות המתאים לעומק ולכמות התוכן.'
    : `תכנן שלד מצגת בת ${slideCount} שקופיות.`}
החזר JSON תקין בלבד (בלי טקסט מסביב, בלי code fences):
{
  "title": "כותרת המצגת",
  "outline": [
    { "layout": "אחד מ: ${SLIDE_LAYOUT_IDS.join(', ')}", "title": "כותרת השקופית", "focus": "משפט אחד: מה השקופית מכסה" }
  ]
}
חוקים:
${slideCount == null
    ? '- בחר מספר שקופיות הולם לתוכן (בדרך כלל 8–18, מותר עד 40 אם התוכן עשיר). לא מעט מדי ולא מנופח.'
    : `- בדיוק ${slideCount} פריטים.`}
- נרטיב זורם בלי חזרות.
- פריט ראשון layout="cover", אחרון layout="closing".
- מגוון פריסות לפי התוכן. עברית.
`;

// בונה prompt למילוי טווח שקופיות בהינתן השלד המלא (להקשר)
const buildBatchPrompt = (outline, start, end, imageIntensity) => {
  const outlineLines = outline
    .map((o, i) => `${i + 1}. [${o.layout}] ${o.title} — ${o.focus || ''}`)
    .join('\n');
  return `
לפניך שלד מלא של מצגת בת ${outline.length} שקופיות (כל המצגת, להקשר ורצף):
${outlineLines}

מלא בתוכן מלא אך ורק את השקופיות ${start + 1}..${end} (כולל). שמור על אותו layout וכותרת מהשלד.
החזר JSON תקין בלבד (בלי טקסט מסביב, בלי code fences):
{
  "slides": [
    ${SLIDE_SHAPE}
  ]
}
חוקים:
- בדיוק ${end - start} שקופיות, באותו סדר כמו בשלד.
${SLIDE_CONTENT_RULES(imageIntensity)}
`;
};

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
  const isAuto = slideCount === 'auto' || slideCount === 'אוטומטי';
  const safeSlideCount = isAuto ? null : Math.max(4, Math.min(40, Number(slideCount) || 10));
  const safeDensity = ['lean', 'balanced', 'rich'].includes(density) ? density : 'balanced';
  const safeTheme = DECK_THEMES.some((t) => t.id === themeId) ? themeId : 'premium';

  const trimmedDoc = fromDocument
    ? (String(documentText || '').length > MAX_SOURCE_CHARS
        ? `${String(documentText).slice(0, MAX_SOURCE_CHARS)}\n[...קוצר...]`
        : String(documentText || ''))
    : '';

  if (fromDocument && !trimmedDoc.trim()) throw new Error('אין תוכן מקור להפיכה למצגת.');
  if (!fromDocument && !cleanTopic) throw new Error('חסר נושא למצגת.');

  // הקשר משותף לכל קריאה (נושא/קהל/מטרה/צפיפות/מסמך)
  const baseContext = [
    fromDocument
      ? 'הפוך את המסמך הבא למצגת ויזואלית שמסכמת ומציגה אותו. מותר לקצר, לסכם ולשנות מבנה.'
      : `צור מצגת בעברית בנושא: ${cleanTopic}`,
    fromDocument && cleanTopic ? `זווית/דגש מבוקש: ${cleanTopic}` : '',
    audience ? `קהל יעד: ${String(audience).trim()}` : '',
    goal ? `מטרה: ${String(goal).trim()}` : '',
    DENSITY_GUIDANCE[safeDensity],
  ].filter(Boolean).join('\n');

  const docBlock = fromDocument ? `\nתוכן המסמך:\n"""\n${trimmedDoc}\n"""` : '';

  // override מפורש מנצח; אחרת — API ייעודי למצגות אם הוגדר בהגדרות.
  const featureOverride = providerConfigOverride || getFeatureProviderConfig('presentations')?.config || null;

  const runChat = (prompt) =>
    chatWithActiveProvider(prompt, '', 'אתה מעצב מצגות מקצועי. החזר אך ורק JSON תקין לפי הסכמה.', {
      skipAutomation: true,
      skipMultiModel: true,
      directChat: true,
      skipSkillSelection: true,
      omitPersonalStyleStructureHints: true,
      ...(featureOverride ? { providerConfigOverride: featureOverride } : {}),
      ...(signal ? { signal } : {}),
    });

  let deckTitle = cleanTopic || 'מצגת';
  let slides = [];

  if (!isAuto && safeSlideCount <= CHUNK_THRESHOLD) {
    // מסלול shot-אחד — מצגות קטנות בכמות קבועה
    const prompt = [baseContext, buildSchemaInstruction(safeSlideCount, imageIntensity), docBlock]
      .filter(Boolean).join('\n');
    const parsed = extractJson(await runChat(prompt));
    deckTitle = parsed.title || deckTitle;
    slides = Array.isArray(parsed.slides) ? parsed.slides : [];
  } else {
    // מסלול chunked — שלב 1: שלד (outline) לכל המצגת
    const outlinePrompt = [baseContext, buildOutlinePrompt(safeSlideCount), docBlock]
      .filter(Boolean).join('\n');
    const outlineParsed = extractJson(await runChat(outlinePrompt));
    deckTitle = outlineParsed.title || deckTitle;
    const outline = (Array.isArray(outlineParsed.outline) ? outlineParsed.outline : [])
      .map((o) => ({ layout: o?.layout || 'title-bullets', title: o?.title || '', focus: o?.focus || '' }))
      .filter((o) => o.title);
    if (!outline.length) throw new Error('המודל לא החזיר שלד תקין למצגת.');

    // שלב 2: מילוי במנות, במקביל — כל מנה מקבלת את השלד המלא להקשר
    const batches = [];
    for (let start = 0; start < outline.length; start += BATCH_SIZE) {
      batches.push([start, Math.min(start + BATCH_SIZE, outline.length)]);
    }
    const filled = await Promise.all(
      batches.map(([start, end]) =>
        runChat([baseContext, buildBatchPrompt(outline, start, end, imageIntensity), docBlock].filter(Boolean).join('\n'))
          .then((raw) => extractJson(raw))
          .then((p) => (Array.isArray(p.slides) ? p.slides : []))
      )
    );
    slides = filled.flat();
  }

  const deck = normalizeDeck({
    title: deckTitle,
    themeId: safeTheme,
    meta: { audience: String(audience || '').trim(), goal: String(goal || '').trim(), topic: cleanTopic },
    slides,
  });

  if (!deck.slides.length) throw new Error('לא נוצרו שקופיות.');
  return deck;
};
