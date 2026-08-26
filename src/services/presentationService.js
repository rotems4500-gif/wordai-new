// ═══════════════════════════════════════════════════════════════
// presentationService.js — יצירת deck (JSON מובנה) מ-LLM.
// מחזיר אובייקט deck מנורמל, לא HTML. זה הלב של "מצגת אמיתית".
// ═══════════════════════════════════════════════════════════════

import { chatWithActiveProvider, getFeatureProviderConfig, hashStyleSeed } from './aiService';
import { normalizeDeck, SLIDE_LAYOUT_IDS, BG_VARIANT_IDS } from '../presentation/deckModel';
import { DECK_THEMES } from '../presentation/deckThemes';

const MAX_SOURCE_CHARS = 16000;
// חומרי עזר נבחרים — תקציב כולל, כדי שהם לא יבלעו את הפרומפט (ואת המסמך).
const MAX_MATERIALS_CHARS = 4000;

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

// ids של רקעי-שקף שהמודל רשאי לבחור. 'auto' מושמט בכוונה — ריק כבר אומר "אוטומטי",
// ושתי דרכים לומר את אותו דבר רק מבלבלות את המודל.
const PROMPT_BG_VARIANT_IDS = BG_VARIANT_IDS.filter((id) => id !== 'auto');

// מבנה אובייקט שקופית — משותף בין shot-אחד למילוי-מנות
const SLIDE_SHAPE = `{
  "layout": "אחד מ: ${SLIDE_LAYOUT_IDS.join(', ')}",
  "title": "כותרת השקופית",
  "subtitle": "כותרת משנה קצרה (אופציונלי)",
  "kicker": "תווית קצרה מעל הכותרת — שם פרק/הקשר (אופציונלי)",
  "bullets": ["נקודה קצרה", "נקודה קצרה"],
  "body": "טקסט חופשי — לפריסות quote / big-statement",
  "columns": [{"heading":"...","bullets":["..."]}],
  "stats": [{"value":"ערך קצר וחד — מספר/אחוז/סדר גודל","label":"תיאור קצר","caption":"הקשר (אופציונלי)"}],
  "steps": [{"title":"שם השלב","body":"תיאור קצר (אופציונלי)"}],
  "image": { "query": "תיאור באנגלית לחיפוש/יצירת תמונה", "alt": "תיאור התמונה בעברית — שדה חובה כשיש image" },
  "visual": "אופציונלי: 'infographic' כשהתוכן הוא מבנה/תהליך/יחסים שעדיף לראות כדיאגרמה, 'chart' כשיש סדרת מספרים אמיתית להשוואה",
  "bgVariant": "אופציונלי — טיפול הרקע של השקף. אחד מ: ${PROMPT_BG_VARIANT_IDS.join(', ')}. ריק = בחירה אוטומטית",
  "accent": "אופציונלי — צבע הדגשה לשקף בפורמט hex (#RRGGBB). השאר ריק אם אין סיבה תוכנית לשנות",
  "notes": "הערות מרצה קצרות (אופציונלי)"
}`;

// ── זוויות ניסוח ─────────────────────────────────────────────────
// ⚠️ הציר כאן הוא **ניסוח, לא מבנה**. המבנה הלימודי (מהלך הדרגתי) הוא רצוי
// ואמור להישאר יציב — מה שחזר על עצמו בין מצגות היה אוצר המילים: אותם ביטויי
// מדף ואותן תבניות משפט, רק עם נושא מוחלף. לכן כל פריט כאן הוא הוראת ניסוח/
// הדגשה, ולא הוראת סדר-שקפים.
// הזווית נבחרת אקראית (Math.random ולא hash) בכוונה — יצירה חוזרת של אותו
// brief אמורה לתת ניסוח אחר, אחרת "צור שוב" הוא כפתור מת.
const RHETORICAL_ANGLES = [
  'פתח נקודות בשאלות שמזמינות חשיבה — נסח חלק מהכותרות והנקודות כשאלה ולא כהצהרה.',
  'נסח דרך דוגמאות קונקרטיות מחיי היומיום — כל רעיון מופיע דרך מקרה או סיטואציה מוחשית.',
  'הדגש מספרים ונתונים בניסוח — שלב ערכים, סדרי גודל ומדדים בתוך המשפטים עצמם.',
  'נסח כטענות חדות שאפשר לחלוק עליהן — משפטים בעלי עמדה, לא תיאורים ניטרליים.',
  'השתמש באנלוגיות והמחשות — הסבר כל מושג מורכב דרך משהו מוכר.',
  'נסח מנקודת מבט של הקהל — "מה זה אומר עבורכם", מה משתנה אצלם בפועל.',
];

const pickRhetoricalAngle = () =>
  RHETORICAL_ANGLES[Math.floor(Math.random() * RHETORICAL_ANGLES.length)];

const angleLines = (angle) => (angle
  ? `זווית הניסוח של המצגת הזו: ${angle}\nשמור על מהלך לימודי הגיוני והדרגתי.`
  : '');

// ── חוקים נגד תבניתיות — משותפים לשלד ולמילוי התוכן ───────────────
const TITLE_RULE = '- אסור כותרות גנריות: "מבוא", "רקע", "סיכום", "נושאים", "תוכן", "כללי", "דיון". כל כותרת שקף היא טענה או שאלה ספציפית לתוכן שלו, באורך 5-9 מילים (שקף ה-cover פטור — שם הכותרת היא שם המצגת).';
const LAYOUT_MIX_RULE = '- לא יותר משני שקפי title-bullets ברצף. שלב לפחות 3 פריסות שונות מלבד cover ו-closing.';
const CLOSING_RULE = '- שקף הסיום: לא "תודה" גנרי ולא "סיכום" שחוזר על מה שנאמר — סיים במסר, בקריאה לפעולה או בשאלה פתוחה, בהתאם למטרה.';

// ── נגד ביטויי-מדף ────────────────────────────────────────────────
// הבעיה שזה פותר: המבנה הלימודי היה בסדר, אבל **המילים** חזרו על עצמן בין
// מצגות — אותם ביטויי פתיחה ואותן תבניות משפט, רק עם נושא מוחלף. שלושת
// הכללים האלה תוקפים את שלושת המקורות: ביטויים שגורים, חזרה על תבנית בתוך
// אותה מצגת, וניסוח גנרי שנכון לכל נושא.
const ANTI_BOILERPLATE_RULES = [
  '- אסור להשתמש בביטויי מדף: "בעידן המודרני", "בעולם של היום", "חשוב לציין", "יתרה מזאת", "לסיכום ניתן לומר", "אין ספק ש", "משחק תפקיד מרכזי", "כלי רב עוצמה", "עולם ה...", "מסע אל".',
  '- אל תתחיל שתי שקופיות באותה מילה; אל תשתמש באותה תבנית משפט פעמיים במצגת.',
  '- כל נקודה מכילה פרט ספציפי לנושא (מונח מקצועי, שם, מספר, דוגמה) — לא ניסוח כללי שנכון לכל נושא. מבחן: אם אפשר להחליף את הנושא והמשפט עדיין נכון — נסח מחדש.',
];

const SLIDE_CONTENT_RULES = (imageIntensity, { speakerNotes = true } = {}) => [
  TITLE_RULE,
  LAYOUT_MIX_RULE,
  CLOSING_RULE,
  ...ANTI_BOILERPLATE_RULES,
  '- גוון פריסות לפי סוג התוכן — אל תשתמש ב-title-bullets לכל שקף. המר תוכן למבנה ויזואלי:',
  '  • stat — כשיש מספרים/אחוזים/מדדים בולטים (שדה "stats", 1-4 פריטים). value קצר וחד.',
  '  • steps — לתהליך/שלבים/שיטה (שדה "steps", 3-5 שלבים).',
  '  • comparison — להשוואת שתי גישות/אפשרויות (שדה "columns", בדיוק 2 עמודות).',
  '  • big-statement — למסר/תובנה מרכזית אחת (שדה "body", משפט אחד חד). בלי בולטים.',
  '  • two-column — לחלוקה לשני נושאים מקבילים. quote — לציטוט.',
  // ⚠️ אין כאן סף — הוא חי רק ב-structureRules (AGENDA_MIN_SLIDES). שני מספרים
  // שונים באותו פרומפט הם הוראה סותרת, והמודל בחר לפי מצב רוחו.
  // ⚠️ בלי "נסח כותרת משלך" המודל העתיק את הביטוי מהפרומפט מילה במילה, וכל
  //    מצגת עם agenda קיבלה בדיוק את אותה כותרת.
  '  • agenda — שקופית מפת-דרכים אחרי השער (שדה "bullets", 4-8 פריטים קצרים), אך ורק אם חוקי המבנה למעלה מתירים זאת במפורש. נסח לה כותרת משלך שנגזרת מהנושא — לא ביטוי גנרי.',
  '  • timeline — לכרונולוגיה/אבני דרך/roadmap (שדה "steps": title=שנה/תקופה, body=מה קרה). 3-6 נקודות.',
  `- שדה "image" רק בפריסות שתומכות בתמונה (${IMAGE_LAYOUTS.join(', ')}). ה-query באנגלית, קונקרטי ונקי.`,
  '- כשיש שדה "image" — **חובה** למלא בו גם "alt" בעברית (משפט קצר שמתאר מה רואים). alt ריק או באנגלית נחשב שגיאה.',
  '- שדה "visual": סמן "chart" רק כששדה stats/bullets מכיל סדרת מספרים אמיתית להשוואה (הערכים יצוירו כגרף מדויק — אל תמציא מספרים), ו-"infographic" כשהתוכן הוא מבנה/תהליך/יחסים שמרוויח דיאגרמה. השאר ריק כשתמונה רגילה מספיקה.',
  `- ${imageRule(imageIntensity)}`,
  '- נקודות קצרות (עד ~10 מילים). בלי פסקאות ארוכות. עברית.',
  '- שמור על טון עקבי ובהיר לאורך כל המצגת; אם סופק פרופיל סגנון — אמץ את הטון שלו בלבד, לא את מבנה המשפט או אורך הפסקה.',
  '- כל ערך בשדות ה-JSON הוא טקסט נקי בעברית: בלי markdown (**, __, `, #), בלי תגי HTML, בלי סימני ▸/•/… בתחילת או סוף טקסט, בלי הערות שוליים.',
  // ⚠️ הערכים בסכמה הם תיאורי-שדה, והמודל העתיק אותם כטקסט שקופית.
  '- הערכים בסכמה למעלה הם תיאורי שדה — לדוגמה בלבד, נסח בעצמך. אל תעתיק אותם לשקופיות.',
  // ⚠️ kicker חובה הפך כל מצגת לאותה מצגת: תווית פרק מעל כל כותרת גם כשאין פרקים
  // בכלל. עכשיו הוא מותנה במבנה אמיתי — פרקים עם 3+ שקופיות כל אחד.
  '- שדה "kicker": מלא אותו רק אם למצגת יש חלוקה ברורה לפרקים ובכל פרק 3 שקופיות ומעלה — ואז תן תווית קצרה (2-4 מילים) של שם הפרק, אחידה לכל שקופיות אותו פרק. אין חלוקה כזו ⇒ השאר את kicker ריק בכל השקופיות.',
  `- שדה "bgVariant": גוון את טיפול הרקע בין שקופיות סמוכות. אל תחזור על אותו variant פעמיים ברצף. בחר מתוך: ${PROMPT_BG_VARIANT_IDS.join(', ')}. ריק = בחירה אוטומטית של המערכת.`,
  ...(speakerNotes
    ? []
    : ['- אל תמלא את שדה "notes" — השאר אותו ריק בכל השקופיות.']),
].join('\n');

// מטרה "שכנועית" — במצגת מכירה/שכנוע שקופית agenda שוברת את המומנטום.
const isPersuasiveGoal = (goal) => /שכנע|מכיר|מכירה/.test(String(goal || ''));

// ⚠️ agenda היא כבר לא ברירת מחדל. "על מה נדבר" בשקף השני הוא הסימן המובהק
// ביותר של מצגת-תבנית, והוא מצדיק את עצמו רק בפורמט פורמלי וארוך (הרצאה/
// שיעור/סמינר/דיווח) שבו הקהל באמת צריך מפת דרכים. בכל שאר המקרים — אסור.
const AGENDA_GOAL_PATTERN = /הרצאה|שיעור|סמינר|דיווח/;
const AGENDA_MIN_SLIDES = 12;

// טון נגזר-מטרה. בלי זה "מטרה" הייתה שורת קישוט בפרומפט שלא משנה שום דבר בפלט.
const toneLineForGoal = (goal) => {
  const g = String(goal || '');
  if (!g.trim()) return '';
  if (/שכנע/.test(g)) return 'טון: אסרטיבי וממוקד מסר; העדף שקפי big-statement ו-stat.';
  if (/הסבר|ללמד|הוראה/.test(g)) return 'טון: מובנה ומדורג; העדף steps ו-comparison.';
  if (/דיווח|סיכום|ממצאים/.test(g)) return 'טון: ענייני ומבוסס נתונים; העדף stat ו-timeline.';
  return '';
};

/**
 * structureRules — חוקי המבנה (שער/סיום/agenda) לפי ההקשר האמיתי,
 * במקום שלוש מחרוזות קשיחות שהפכו כל מצגת לאותה מצגת.
 * @param {string} goal מטרת המצגת (משפיעה על agenda)
 * @param {number|null} slideCount מספר שקופיות; null = אוטומטי (המודל מחליט)
 * @param {boolean} includeCover האם לפתוח בשקופית שער
 */
const structureRules = (goal, slideCount, includeCover = true) => {
  const withCover = includeCover !== false;
  const lines = [
    withCover
      ? '- שקופית ראשונה layout="cover".'
      : '- בלי שקופית שער: השקופית הראשונה היא כבר שקופית תוכן (אל תשתמש ב-layout="cover" בכלל).',
    '- מומלץ לסיים ב-layout="closing".',
  ];
  const agendaEligible = AGENDA_GOAL_PATTERN.test(String(goal || '')) && !isPersuasiveGoal(goal);
  if (!agendaEligible) {
    lines.push('- אל תכלול שקף agenda ("על מה נדבר" / "תוכן העניינים") בכלל. פתח ישר בתוכן.');
  } else if (slideCount == null) {
    lines.push(`- אם בחרת ${AGENDA_MIN_SLIDES} שקופיות ומעלה — השקופית ה${withCover ? 'שנייה' : 'ראשונה'} תהיה layout="agenda", עם כותרת בניסוח שלך שנגזרת מהנושא. פחות מ-${AGENDA_MIN_SLIDES} ⇒ בלי agenda בכלל.`);
  } else if (slideCount >= AGENDA_MIN_SLIDES) {
    lines.push(`- השקופית ה${withCover ? 'שנייה' : 'ראשונה'} תהיה layout="agenda", עם כותרת בניסוח שלך שנגזרת מהנושא.`);
  } else {
    lines.push('- אל תכלול שקף agenda ("על מה נדבר" / "תוכן העניינים") — המצגת קצרה מדי בשבילו.');
  }
  return lines.join('\n');
};

// בונה את הסכמה שה-LLM חייב להחזיר (מסלול shot-אחד)
const buildSchemaInstruction = (slideCount, imageIntensity, { goal = '', includeCover = true, speakerNotes = true, angle = '' } = {}) => `
${angleLines(angle)}
החזר JSON תקין בלבד (בלי טקסט מסביב, בלי code fences) במבנה הבא:
{
  "title": "כותרת המצגת",
  "slides": [
    ${SLIDE_SHAPE}
  ]
}
חוקים:
- בדיוק ${slideCount} שקופיות.
${structureRules(goal, slideCount, includeCover)}
${SLIDE_CONTENT_RULES(imageIntensity, { speakerNotes })}
`;

// בונה prompt לשלד (outline) — פריט קליל לכל שקופית, נכנס בקלות בלי חיתוך.
// slideCount === null => אוטומטי: המודל בוחר את מספר השקופיות לפי עומק התוכן.
const buildOutlinePrompt = (slideCount, { goal = '', includeCover = true, angle = '' } = {}) => `
${angleLines(angle)}
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
- נרטיב זורם בלי חזרות. כל פריט מוסיף מידע חדש שלא מכוסה בפריט אחר.
${TITLE_RULE}
${LAYOUT_MIX_RULE}
${CLOSING_RULE}
${ANTI_BOILERPLATE_RULES.join('\n')}
${structureRules(goal, slideCount, includeCover)}
- אם התוכן כרונולוגי (שלבים בזמן/היסטוריה/roadmap) — השתמש ב-layout="timeline" בשקופית המתאימה.
- מגוון פריסות לפי התוכן. עברית.
`;

// בונה prompt למילוי טווח שקופיות בהינתן השלד המלא (להקשר)
const buildBatchPrompt = (outline, start, end, imageIntensity, { speakerNotes = true, angle = '' } = {}) => {
  const outlineLines = outline
    .map((o, i) => `${i + 1}. [${o.layout}] ${o.title} — ${o.focus || ''}`)
    .join('\n');
  // שכנים: המנה לא רואה את התוכן שנכתב במנות אחרות, ולכן חוזרת על עצמה בתפר.
  // הזכרת השקופית שלפני ושאחרי הטווח היא הרמז הזול היחיד שמונע כפילות בתפר.
  const prevItem = start > 0 ? outline[start - 1] : null;
  const nextItem = end < outline.length ? outline[end] : null;
  const neighbourLines = [
    prevItem ? `- לפני הטווח (שקופית ${start}): "${prevItem.title}" — כבר מכוסה, אל תחזור עליה.` : '',
    nextItem ? `- אחרי הטווח (שקופית ${end + 1}): "${nextItem.title}" — תיכתב בנפרד, אל תקדים אותה.` : '',
  ].filter(Boolean).join('\n');
  // ⚠️ זווית הניסוח חייבת להגיע גם לכאן: במצגת ארוכה גוף הטקסט נכתב **רק**
  // במנות, ובלי זה הזווית משפיעה על כותרות השלד בלבד והתוכן חוזר לניסוח שגור.
  return `
${angleLines(angle)}
לפניך שלד מלא של מצגת בת ${outline.length} שקופיות (כל המצגת, להקשר ורצף):
${outlineLines}

מלא בתוכן מלא אך ורק את השקופיות ${start + 1}..${end} (כולל). שמור על אותו layout וכותרת מהשלד.
${neighbourLines ? `\nגבולות הטווח:\n${neighbourLines}\n` : ''}
החזר JSON תקין בלבד (בלי טקסט מסביב, בלי code fences):
{
  "slides": [
    ${SLIDE_SHAPE}
  ]
}
חוקים:
- בדיוק ${end - start} שקופיות, באותו סדר כמו בשלד.
- אל תחזור על תוכן שכבר מכוסה בשקופיות אחרות במתווה; כל שקף מוסיף מידע חדש.
${SLIDE_CONTENT_RULES(imageIntensity, { speakerNotes })}
`;
};

/**
 * buildMaterialsBlock — חומרי העזר שהמשתמש סימן במסך הבית, כבלוק מקור אחד.
 * הפריטים מגיעים מ-loadProjectMaterials ⇒ { title, contentText, previewText }.
 * תקציב כולל MAX_MATERIALS_CHARS, מחולק שווה בשווה, כדי שחומר אחד ארוך לא
 * ידחוק את השאר ולא ינפח את הפרומפט מעבר לתקציב של המנה.
 */
const buildMaterialsBlock = (materials = []) => {
  const list = (Array.isArray(materials) ? materials : []).filter(Boolean);
  if (!list.length) return '';
  const perItem = Math.max(300, Math.floor(MAX_MATERIALS_CHARS / Math.min(list.length, 8)));
  let budget = MAX_MATERIALS_CHARS;
  const parts = [];
  for (const item of list) {
    if (budget <= 0) break;
    const title = String(item?.title || item?.file || '').trim() || 'חומר עזר';
    const raw = String(item?.contentText || item?.previewText || '').replace(/\s+/g, ' ').trim();
    if (!raw) continue;
    const take = Math.min(perItem, budget);
    const slice = raw.length > take ? `${raw.slice(0, take)}…` : raw;
    budget -= slice.length;
    parts.push(`- ${title}: ${slice}`);
  }
  if (!parts.length) return '';
  return `\nחומרי עזר נבחרים:\n${parts.join('\n')}`;
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
 * enforceLayoutVariety — שובר רצפים של title-bullets אחרי הנורמליזציה.
 * הכלל בפרומפט ("לא יותר משניים ברצף") מופר בקביעות, ובמסלול ה-chunked אף מנה
 * לא רואה את השכנות שלה. כאן זה נאכף דטרמיניסטית, ובשמרנות:
 * - נשברים רק רצפים של 3 שקפים ומעלה, ורק האמצעיים שבהם (הראשון והאחרון נשארים).
 * - cover/section/closing/agenda ושקפים עם תמונה לא נוגעים בהם כלל (הם לא title-bullets).
 * - ההמרה נעשית רק כשהתוכן מתאים: 4+ בולטים ⇒ שתי עמודות; בולט יחיד ⇒ big-statement.
 *   2-3 בולטים נשארים כמו שהם — עדיף רצף מעט משעמם מאשר שקף מעוות.
 */
const enforceLayoutVariety = (deck) => {
  const slides = Array.isArray(deck?.slides) ? deck.slides : [];
  if (slides.length < 3) return deck;
  const isPlainBullets = (s) => s?.layout === 'title-bullets' && !s?.image;
  const next = slides.slice();
  let changed = false;

  const breakRun = (start, end) => {
    if (end - start < 3) return;
    for (let i = start + 1; i < end - 1; i += 1) {
      if (i <= 0 || i >= next.length - 1) continue;
      const slide = next[i];
      const bullets = (Array.isArray(slide.bullets) ? slide.bullets : []).map((b) => String(b || '').trim()).filter(Boolean);
      if (bullets.length >= 4) {
        const half = Math.ceil(bullets.length / 2);
        next[i] = {
          ...slide,
          layout: 'two-column',
          bullets: [],
          // heading ריק — הרנדרר מדלג עליו, ושתי כרטיסיות בולטים זו הצורה הרצויה.
          columns: [
            { heading: '', bullets: bullets.slice(0, half) },
            { heading: '', bullets: bullets.slice(half) },
          ],
        };
        changed = true;
      } else if (bullets.length === 1) {
        const body = String(slide.body || '').trim() || bullets[0];
        if (!body) continue;
        next[i] = { ...slide, layout: 'big-statement', body, bullets: [] };
        changed = true;
      }
    }
  };

  let runStart = -1;
  for (let i = 0; i <= slides.length; i += 1) {
    if (i < slides.length && isPlainBullets(slides[i])) {
      if (runStart < 0) runStart = i;
      continue;
    }
    if (runStart >= 0) { breakRun(runStart, i); runStart = -1; }
  }
  return changed ? { ...deck, slides: next } : deck;
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
  speakerNotes = true,
  includeCover = true,
  materials = [],
  // האם שלב המדיה האוטומטית ירוץ אחרי היצירה. רק אז מותר לאכוף מכסת תמונות:
  // enforceImageQuota מצמיד image.pending לשקופיות, ובלי מילוי אוטומטי הן
  // מגיעות לעורך כבלוקים ריקים — בדיוק מה שהמשתמש ביקש להימנע ממנו.
  autoImages = false,
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

  const cleanAudience = String(audience || '').trim();
  const cleanGoal = String(goal || '').trim();

  // הקשר משותף לכל קריאה — brief אמיתי: נושא/קהל/מטרה/טון-נגזר-מטרה/צפיפות.
  // הטון הוא ההבדל בין "מטרה" כשורת קישוט לבין מטרה שמזיזה את הפלט.
  const baseContext = [
    fromDocument
      ? 'הפוך את המסמך הבא למצגת ויזואלית שמסכמת ומציגה אותו. מותר לקצר, לסכם ולשנות מבנה.'
      : `צור מצגת בעברית בנושא: ${cleanTopic}`,
    fromDocument && cleanTopic ? `זווית/דגש מבוקש: ${cleanTopic}` : '',
    cleanAudience ? `קהל יעד: ${cleanAudience} — התאם את רמת הפירוט, הדוגמאות והמונחים אליו.` : '',
    cleanGoal ? `מטרה: ${cleanGoal}` : '',
    toneLineForGoal(cleanGoal),
    DENSITY_GUIDANCE[safeDensity],
  ].filter(Boolean).join('\n');

  const docBlock = fromDocument ? `\nתוכן המסמך:\n"""\n${trimmedDoc}\n"""` : '';
  // חומרי העזר נלווים ל-docBlock בכל מסלול (shot-אחד, שלד ומנות) — מנה שלא
  // רואה את החומרים ממציאה תוכן שאמור היה לבוא מהם.
  const materialsBlock = buildMaterialsBlock(materials);

  // override מפורש מנצח; אחרת — API ייעודי למצגות אם הוגדר בהגדרות.
  const featureOverride = providerConfigOverride || getFeatureProviderConfig('presentations')?.config || null;

  // seed סגנון אחד לכל המצגת: בלי זה כל batch במסלול ה-chunked קיבל seed אקראי משלו —
  // רוטציית תבניות סגנון שונה בין קבוצות שקופיות באותו deck.
  const deckSeed = hashStyleSeed(cleanTopic || trimmedDoc.slice(0, 500));
  // בידוד: יצירת deck היא קריאת JSON מכנית — לא כתיבת מסמך. בלי הבידוד הזה
  // הקריאה ירשה את הוראות ה-HTML/ביבליוגרפיה של scope המסמך, קורפוס סגנון גולמי
  // וזיכרון האפליקציה — כולם ניפחו את הפרומפט ושברו את ה-JSON.
  const runChat = (prompt, maxOutputTokens = 4096, extraOptions = {}) =>
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
      ...extraOptions,
    });

  let deckTitle = cleanTopic || 'מצגת';
  let slides = [];
  // אזהרות שנצברות במסלול ה-chunked (מנות שלא הושלמו) — מוצמדות ל-deck בסוף.
  const generationWarnings = [];

  // זווית ניסוח אחת לכל הדק (נבחרת אקראית — יצירה חוזרת נותנת ניסוח אחר).
  const angle = pickRhetoricalAngle();

  // אפשרויות מבנה/תוכן שמשותפות לכל בוני הפרומפט
  const shapeOpts = { goal: cleanGoal, includeCover, speakerNotes, angle };

  // shot-אחד — מצגת קטנה. slideCountForShot נמסר גם ממסלול ה-auto (אורך השלד).
  const runOneShot = async (slideCountForShot, outlineHint = '') => {
    const prompt = [
      baseContext,
      outlineHint,
      buildSchemaInstruction(slideCountForShot, imageIntensity, shapeOpts),
      docBlock,
      materialsBlock,
    ].filter(Boolean).join('\n');
    // טמפרטורה לתוכן: ברירת המחדל הנמוכה החזירה את אותם ביטויי מדף ואותן
    // תבניות משפט בכל מצגת. 0.85 היא התקרה שנבדקה — מעליה ה-JSON מתחיל להישבר.
    const parsed = extractJson(await runChat(prompt, 8192, { temperature: 0.85 }));
    return {
      title: parsed.title || '',
      slides: Array.isArray(parsed.slides) ? parsed.slides : [],
    };
  };

  if (!isAuto && safeSlideCount <= CHUNK_THRESHOLD) {
    // מסלול shot-אחד — מצגות קטנות בכמות קבועה
    const shot = await runOneShot(safeSlideCount);
    deckTitle = shot.title || deckTitle;
    slides = shot.slides;
  } else {
    // מסלול chunked — שלב 1: שלד (outline) לכל המצגת
    const outlinePrompt = [baseContext, buildOutlinePrompt(safeSlideCount, shapeOpts), docBlock, materialsBlock]
      .filter(Boolean).join('\n');
    // ⚠️ 0.9 לשלד: כאן נקבע המבנה, וטמפרטורה נמוכה מחזירה שוב ושוב את אותו
    // רצף שקפים. מילוי התוכן רץ ב-0.85 — נמוך יותר, כי שם ה-JSON גדול ושביר.
    const outlineParsed = extractJson(await runChat(outlinePrompt, 4096, { temperature: 0.9 }));
    deckTitle = outlineParsed.title || deckTitle;
    const outline = (Array.isArray(outlineParsed.outline) ? outlineParsed.outline : [])
      .map((o) => ({ layout: o?.layout || 'title-bullets', title: o?.title || '', focus: o?.focus || '' }))
      .filter((o) => o.title);
    if (!outline.length) throw new Error('המודל לא החזיר שלד תקין למצגת.');

    // ── auto שיצא קצר: מצגת בת ≤CHUNK_THRESHOLD שקופיות לא צריכה מנות ──
    // ב-auto מספר השקופיות ידוע רק אחרי השלד, ולכן מצגת קצרה נכנסה עד כה
    // למסלול המנות ואיבדה את הקוהרנטיות של קריאה אחת. השלד לא הולך לפח:
    // הוא נמסר כ"מתווה מוצע" לאותה קריאה.
    if (isAuto && outline.length <= CHUNK_THRESHOLD) {
      const outlineHint = [
        'מתווה מוצע (בנה עליו; מותר לחדד ניסוח כותרות, לא לשנות את הרצף):',
        ...outline.map((o, i) => `${i + 1}. [${o.layout}] ${o.title} — ${o.focus || ''}`),
      ].join('\n');
      try {
        const shot = await runOneShot(outline.length, outlineHint);
        if (shot.slides.length) {
          deckTitle = shot.title || deckTitle;
          slides = shot.slides;
        }
      } catch {
        // נכשל (JSON קטוע/מכסה) → ממשיכים למסלול המנות עם אותו שלד.
      }
      if (signal?.aborted) throw new Error('יצירת המצגת בוטלה.');
    }

    // שלב 2: מילוי במנות, במקביל — כל מנה מקבלת את השלד המלא להקשר.
    // מדולג כשמסלול ה-shot-אחד של auto כבר החזיר שקופיות.
    if (!slides.length) {
      const batches = [];
      for (let start = 0; start < outline.length; start += BATCH_SIZE) {
        batches.push([start, Math.min(start + BATCH_SIZE, outline.length)]);
      }
      const fillBatch = async ([start, end]) => {
        const prompt = [baseContext, buildBatchPrompt(outline, start, end, imageIntensity, { speakerNotes, angle }), docBlock, materialsBlock]
          .filter(Boolean).join('\n');
        // אותה טמפרטורה כמו במסלול ה-shot-אחד — אחרת מצגת ארוכה (מסלול המנות)
        // יוצאת בניסוח שגור בדיוק במקום שבו יש הכי הרבה שקפים לחזור על עצמם.
        const parsed = extractJson(await runChat(prompt, 4096, { temperature: 0.85 }));
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
  }

  const normalized = normalizeDeck({
    title: deckTitle,
    themeId: safeTheme,
    meta: { audience: cleanAudience, goal: cleanGoal, topic: cleanTopic },
    slides,
  });

  if (!normalized.slides.length) throw new Error('לא נוצרו שקופיות.');
  // סדר: קודם מכסת התמונות (היא ממירה title-bullets ל-image-right/left ובכך
  // שוברת רצפים בעצמה), ורק אחריה שבירת הרצפים שנותרו.
  const withImages = autoImages ? enforceImageQuota(normalized, imageIntensity) : normalized;
  const deck = enforceLayoutVariety(withImages);
  // normalizeDeck מחזיר אובייקט חדש ומשמיט מפתחות לא מוכרים — לכן מצמידים אחריו.
  if (generationWarnings.length) deck.generationWarnings = generationWarnings;
  return deck;
};
