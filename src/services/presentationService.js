// ═══════════════════════════════════════════════════════════════
// presentationService.js — יצירת deck (JSON מובנה) מ-LLM.
// מחזיר אובייקט deck מנורמל, לא HTML. זה הלב של "מצגת אמיתית".
// ═══════════════════════════════════════════════════════════════

import { chatWithActiveProvider, getFeatureProviderConfig, hashStyleSeed } from './aiService';
import { normalizeDeck, SLIDE_LAYOUT_IDS } from '../presentation/deckModel';
import { DECK_THEMES } from '../presentation/deckThemes';

const MAX_SOURCE_CHARS = 16000;

const DENSITY_GUIDANCE = {
  lean: 'רזה: כל שקופית כותרת + 1-3 נקודות קצרות מאוד. בלי טקסט מעוטר.',
  balanced: 'מאוזן: כותרת + 3-4 נקודות תמציתיות. מסר מרכזי חד לכל שקופית.',
  rich: 'עשיר: מסרים חדים, יותר תוכן ויזואלי, תיאורי תמונה מפורטים יותר.',
};

// מעל סף זה מייצרים ב-chunks (outline + מילוי במנות) כדי שהפלט של המודל לא ייחתך.
const CHUNK_THRESHOLD = 12;
const BATCH_SIZE = 10;

// פריסות שיכולות לשאת שדה image (חייב להישאר מסונכרן עם deckModel.SLIDE_LAYOUTS)
const IMAGE_LAYOUTS = ['cover', 'image-right', 'image-left', 'image-full', 'closing'];

// יעד מבני קשיח לפי עוצמת התמונות: כמה מהשקופיות חייבות לשאת שדה image.
// low מכוון לשער/סיום בלבד ולכן אין לו יעד יחסי.
const IMAGE_TARGET_RATIO = { high: 0.5, medium: 0.3, low: 0 };

const imageRule = (imageIntensity) =>
  imageIntensity === 'low'
    ? 'מעט תמונות — רק בשער ובסיום.'
    : imageIntensity === 'medium'
      ? `תמונות בכ-חצי מהשקופיות. **חובה**: לפחות 40% מהשקופיות בפריסות תומכות-תמונה (${IMAGE_LAYOUTS.join(', ')}) ולכל אחת מהן שדה "image" מלא.`
      : `תמונות ברוב השקופיות שתומכות בכך. **חובה**: לפחות 60% מהשקופיות בפריסות תומכות-תמונה (${IMAGE_LAYOUTS.join(', ')}) ולכל אחת מהן שדה "image" מלא. אל תשתמש ב-title-bullets לשקופית שאפשר להציג עם תמונה לצד הטקסט.`;

// מבנה אובייקט שקופית — משותף בין shot-אחד למילוי-מנות
const SLIDE_SHAPE = `{
  "layout": "אחד מ: ${SLIDE_LAYOUT_IDS.join(', ')}",
  "title": "כותרת השקופית",
  "subtitle": "כותרת משנה קצרה (אופציונלי)",
  "kicker": "תווית קצרה מעל הכותרת — שם פרק/הקשר (אופציונלי)",
  "bullets": ["נקודה קצרה", "נקודה קצרה"],
  "body": "טקסט חופשי — לפריסות quote / big-statement",
  "columns": [{"heading":"...","bullets":["..."]}],
  "stats": [{"value":"87%","label":"תיאור קצר","caption":"הקשר (אופציונלי)"}],
  "steps": [{"title":"שם השלב","body":"תיאור קצר (אופציונלי)"}],
  "image": { "query": "תיאור באנגלית לחיפוש/יצירת תמונה", "alt": "תיאור התמונה בעברית — שדה חובה כשיש image" },
  "visual": "אופציונלי: 'infographic' כשהתוכן הוא מבנה/תהליך/יחסים שעדיף לראות כדיאגרמה, 'chart' כשיש סדרת מספרים אמיתית להשוואה",
  "notes": "הערות מרצה קצרות (אופציונלי)"
}`;

const SLIDE_CONTENT_RULES = (imageIntensity) => [
  '- גוון פריסות לפי סוג התוכן — אל תשתמש ב-title-bullets לכל שקף. המר תוכן למבנה ויזואלי:',
  '  • stat — כשיש מספרים/אחוזים/מדדים בולטים (שדה "stats", 1-4 פריטים). value קצר וחד.',
  '  • steps — לתהליך/שלבים/שיטה (שדה "steps", 3-5 שלבים).',
  '  • comparison — להשוואת שתי גישות/אפשרויות (שדה "columns", בדיוק 2 עמודות).',
  '  • big-statement — למסר/תובנה מרכזית אחת (שדה "body", משפט אחד חד). בלי בולטים.',
  '  • two-column — לחלוקה לשני נושאים מקבילים. quote — לציטוט.',
  '  • agenda — שקופית "על מה נדבר" אחרי השער (שדה "bullets", 4-8 פריטים קצרים). מומלץ במצגות של 8+ שקופיות.',
  '  • timeline — לכרונולוגיה/אבני דרך/roadmap (שדה "steps": title=שנה/תקופה, body=מה קרה). 3-6 נקודות.',
  `- שדה "image" רק בפריסות שתומכות בתמונה (${IMAGE_LAYOUTS.join(', ')}). ה-query באנגלית, קונקרטי ונקי.`,
  '- כשיש שדה "image" — **חובה** למלא בו גם "alt" בעברית (משפט קצר שמתאר מה רואים). alt ריק או באנגלית נחשב שגיאה.',
  '- שדה "visual": סמן "chart" רק כששדה stats/bullets מכיל סדרת מספרים אמיתית להשוואה (הערכים יצוירו כגרף מדויק — אל תמציא מספרים), ו-"infographic" כשהתוכן הוא מבנה/תהליך/יחסים שמרוויח דיאגרמה. השאר ריק כשתמונה רגילה מספיקה.',
  `- ${imageRule(imageIntensity)}`,
  '- נקודות קצרות (עד ~10 מילים). בלי פסקאות ארוכות. עברית.',
  '- שמור על טון עקבי ובהיר לאורך כל המצגת; אם סופק פרופיל סגנון — אמץ את הטון שלו בלבד, לא את מבנה המשפט או אורך הפסקה.',
  '- כל ערך בשדות ה-JSON הוא טקסט נקי בעברית: בלי markdown (**, __, `, #), בלי תגי HTML, בלי סימני ▸/•/… בתחילת או סוף טקסט, בלי הערות שוליים.',
  '- שדה "kicker": בשקופיות תוכן (לא cover/section/image-full) תן תווית קצרה (2-4 מילים) שמזהה את הפרק/הנושא שהשקופית שייכת אליו, ואחידה לכל השקופיות באותו פרק.',
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
- אם המצגת מונה 8 שקופיות ומעלה — פריט 2 יהיה layout="agenda" ("על מה נדבר").
- אם התוכן כרונולוגי (שלבים בזמן/היסטוריה/roadmap) — השתמש ב-layout="timeline" בשקופית המתאימה.
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
 * enforceImageQuota — אכיפה דטרמיניסטית של יעד התמונות אחרי normalizeDeck.
 * המודל מפר את הכלל המבני בקביעות (במיוחד במסלול ה-chunked, שבו כל מנה רואה
 * רק את עצמה). כאן ממירים שקופיות title-bullets עמוסות ל-image-right/image-left
 * לסירוגין ומצמידים להן image pending — הצינור של "מלא תמונות חסרות" ימלא אותן.
 *
 * ⚠️ שפת ה-query: עברית במכוון. אין כאן קריאת מודל ולכן אין תרגום, ו-
 * buildSlideImagePrompt ממילא נופל לטקסט השקופית העברי כשאין query. ספק
 * ברירת המחדל (Gemini) מטפל היטב בנושא עברי בתוך פרומפט אנגלי.
 */
const enforceImageQuota = (deck, imageIntensity) => {
  const ratio = IMAGE_TARGET_RATIO[imageIntensity] ?? IMAGE_TARGET_RATIO.high;
  const slides = deck.slides || [];
  if (!ratio || !slides.length) return deck;
  const target = Math.floor(slides.length * ratio);
  const have = slides.filter((s) => s.image).length;
  let missing = target - have;
  if (missing <= 0) return deck;

  const topic = String(deck?.meta?.topic || deck.title || '').trim();
  let flip = 0;
  const next = slides.map((slide) => {
    if (missing <= 0) return slide;
    if (slide.image) return slide;
    if (slide.layout !== 'title-bullets') return slide;
    if (!Array.isArray(slide.bullets) || slide.bullets.length < 2) return slide;
    const title = String(slide.title || '').trim();
    if (!title) return slide;
    missing -= 1;
    flip += 1;
    return {
      ...slide,
      layout: flip % 2 === 1 ? 'image-right' : 'image-left',
      // צורת ה-image המנורמלת (normalizeImage) — נבנית ידנית כדי לא להריץ
      // normalizeDeck שוב על דק שכבר נורמל.
      image: {
        source: 'ai',
        url: '',
        dataUrl: '',
        query: [topic, title].filter(Boolean).join(' — '),
        alt: title,
        attribution: '',
        model: '',
        provider: '',
        prompt: '',
        pending: true,
      },
    };
  });
  return { ...deck, slides: next };
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

  // seed סגנון אחד לכל המצגת: בלי זה כל batch במסלול ה-chunked קיבל seed אקראי משלו —
  // רוטציית תבניות סגנון שונה בין קבוצות שקופיות באותו deck.
  const deckSeed = hashStyleSeed(cleanTopic || trimmedDoc.slice(0, 500));
  // בידוד: יצירת deck היא קריאת JSON מכנית — לא כתיבת מסמך. בלי הבידוד הזה
  // הקריאה ירשה את הוראות ה-HTML/ביבליוגרפיה של scope המסמך, קורפוס סגנון גולמי
  // וזיכרון האפליקציה — כולם ניפחו את הפרומפט ושברו את ה-JSON.
  const runChat = (prompt, maxOutputTokens = 4096) =>
    chatWithActiveProvider(prompt, '', 'אתה מעצב מצגות מקצועי. החזר אך ורק JSON תקין לפי הסכמה.', {
      skipAutomation: true,
      skipMultiModel: true,
      directChat: true,
      skipSkillSelection: true,
      chatScope: 'general-writing',
      strictFormatting: true,
      forceSuppressResearchRouting: true,
      thinkingBudget: 0,
      includeAppMemory: false,
      shouldPersistMemory: false,
      suppressStyleEngine: true,
      maxOutputTokens,
      omitPersonalStyleStructureHints: true,
      styleEngineSeed: deckSeed,
      // אחזור דוגמאות סגנון לפי הנושא — לא לפי פרומפט-הסכמה המלא (JSON+שלד).
      ...(cleanTopic ? { styleRequestTextOverride: cleanTopic } : {}),
      ...(featureOverride ? { providerConfigOverride: featureOverride } : {}),
      ...(signal ? { signal } : {}),
    });

  let deckTitle = cleanTopic || 'מצגת';
  let slides = [];
  // אזהרות שנצברות במסלול ה-chunked (מנות שלא הושלמו) — מוצמדות ל-deck בסוף.
  const generationWarnings = [];

  if (!isAuto && safeSlideCount <= CHUNK_THRESHOLD) {
    // מסלול shot-אחד — מצגות קטנות בכמות קבועה
    const prompt = [baseContext, buildSchemaInstruction(safeSlideCount, imageIntensity), docBlock]
      .filter(Boolean).join('\n');
    const parsed = extractJson(await runChat(prompt, 8192));
    deckTitle = parsed.title || deckTitle;
    slides = Array.isArray(parsed.slides) ? parsed.slides : [];
  } else {
    // מסלול chunked — שלב 1: שלד (outline) לכל המצגת
    const outlinePrompt = [baseContext, buildOutlinePrompt(safeSlideCount), docBlock]
      .filter(Boolean).join('\n');
    const outlineParsed = extractJson(await runChat(outlinePrompt, 4096));
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
    const fillBatch = async ([start, end]) => {
      const prompt = [baseContext, buildBatchPrompt(outline, start, end, imageIntensity), docBlock]
        .filter(Boolean).join('\n');
      const parsed = extractJson(await runChat(prompt, 4096));
      const got = Array.isArray(parsed.slides) ? parsed.slides : [];
      if (!got.length) throw new Error('המנה חזרה ריקה.');
      return got;
    };

    // רשת ביטחון: שקופית מינימלית מפריט השלד, כדי שהמצגת תושלם גם אחרי כישלון מנה.
    const slideFromOutline = (o) => ({
      layout: o?.layout || 'title-bullets',
      title: o?.title || '',
      subtitle: '(השלמה נדרשת — נסה לרענן שקף זה)',
    });

    // יישור אורך המנה לשלד — שקופית N חייבת להישאר מיושרת ל-outline[N].
    const alignBatch = (got, start, end) => {
      const expected = end - start;
      const out = got.slice(0, expected);
      for (let i = out.length; i < expected; i += 1) out.push(slideFromOutline(outline[start + i]));
      return out;
    };

    // allSettled ולא all: מנה אחת שנפלה (מכסה/עומס/JSON קטוע) הפילה את כל המצגת.
    const settled = await Promise.allSettled(batches.map(fillBatch));
    const filled = [];
    for (let i = 0; i < batches.length; i += 1) {
      const [start, end] = batches[i];
      if (settled[i].status === 'fulfilled') {
        filled.push(alignBatch(settled[i].value, start, end));
        continue;
      }
      if (signal?.aborted) throw new Error('יצירת המצגת בוטלה.');
      // ניסיון חוזר יחיד, סדרתי — כישלון במקביל הוא לרוב עומס רגעי.
      try {
        filled.push(alignBatch(await fillBatch(batches[i]), start, end));
      } catch {
        filled.push(alignBatch([], start, end));
        generationWarnings.push(`שקופיות ${start + 1}-${end} לא נוצרו במלואן — רענן אותן ידנית.`);
      }
      if (signal?.aborted) throw new Error('יצירת המצגת בוטלה.');
    }
    slides = filled.flat();
  }

  const normalized = normalizeDeck({
    title: deckTitle,
    themeId: safeTheme,
    meta: { audience: String(audience || '').trim(), goal: String(goal || '').trim(), topic: cleanTopic },
    slides,
  });

  if (!normalized.slides.length) throw new Error('לא נוצרו שקופיות.');
  const deck = enforceImageQuota(normalized, imageIntensity);
  // normalizeDeck מחזיר אובייקט חדש ומשמיט מפתחות לא מוכרים — לכן מצמידים אחריו.
  if (generationWarnings.length) deck.generationWarnings = generationWarnings;
  return deck;
};
