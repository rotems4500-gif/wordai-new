// proseComposeService.js — מחולל הפרוזה המקומי: גוף פרק מראיות, בלי מודל.
//
// זה השלב שהופך את השלד לטיוטה: assignmentPrepService מסמן היום PROSE=NEEDS_AI
// תמיד; המחולל הזה מספק את המסלול המקומי — LOCAL_DRAFT — כשיש ראיות.
//
// עקרון הכנות (הקשיח ביותר במערכת): כל משפט תוכן מעוגן ב-chunk ראיה ספציפי
// ונושא את מזההו. מה שהמנוע מוסיף מעצמו הוא אך ורק *מסגור* — מסגרות רטוריות
// מ-sentenceGrammar שאינן טוענות עובדות ("על פי X, ...", "מן החומר עולה כי...").
// משפטי מטא (סיכום-ביניים) מנוסחים על *הראיות שהוצגו*, לא על העולם.
// ראיה דלה מדי למכסה → הערת [דרוש מקור נוסף] — לא ממציאים.
//
// צנרת: תכנון מהלכים לפי intent + מכסה → בחירת משפט-ליבה מכל ראיה →
// עטיפה במסגרת (composeMoveSentence) → הרכבת פסקאות + ציטוט ממוקם.
//
// תלויות: sentenceComposeService (מסגרות), evidenceMatchService (formatProvenance
// לא נחוץ — provenance כבר על הראיה). LEAF ביחס ל-aiService. browser+node.

import { composeMoveSentence, ensureSentenceGrammarReady } from './sentenceComposeService.js';
import { fitSentencesToStyle, groupParagraphs } from './styleFitService.js';
import { questionSubjects } from './localRewriteService.js';

const AVG_WORDS_PER_SENTENCE = 16;   // ברירת מחדל; styleTargets דורס
const MAX_CLAUSE_WORDS = 32;
const MIN_CLAUSE_WORDS = 6;
const QUOTE_MAX_WORDS = 30;

// ── עזרי טקסט ─────────────────────────────────────────────────────────────
function splitSentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?׃])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

const countWords = (s) => String(s || '').split(/\s+/).filter(Boolean).length;

function hebrewRatio(s) {
  const letters = (String(s || '').match(/[א-תa-zA-Z]/g) || []).length;
  const hebrew = (String(s || '').match(/[א-ת]/g) || []).length;
  return letters ? hebrew / letters : 0;
}

/** ניקוי משפט ראיה לשימוש כפסוקית: הפניות-פנים, מספור, רעש OCR קל. */
function cleanEvidenceSentence(s) {
  return String(s || '')
    .replace(/\[[0-9,\s]+\]/g, '')          // הפניות מספריות [12]
    .replace(/\((?:ראו?|see)[^)]*\)/gi, '') // (ראו שם)
    // ⚠️ כותרת רצה של כתב-עת שנדבקה לתחילת המשפט. נמדד: המשפט המרכזי של מאמר
    // ניי — "Soft power is the ability to affect others…" — נשא לפניו
    // "94 ANNALS, AAPSS, 616, March 2008" ולכן נפסל כמטא-דאטה. קילוף הכותרת
    // מציל את המשפט; פסילתו הותירה את הביוגרפיה של המחבר כ"ראיה" הטובה ביותר.
    // הרצף שמקולף חייב להיות ספרות/ראשי-תיבות/חודש-שנה בלבד, ואחריו פתיחת משפט
    // תקינה (אות גדולה + קטנה) — כדי לא לגזור תוכן אמיתי.
    .replace(/^(?:[\d,]+\s+|[A-Z]{2,},?\s+|[A-Z][a-z]+\s+\d{4}\s+)+(?=[A-Z][a-z])/, '')
    // מיקוף סוף-שורה של PDF: "pri- marily" → "primarily".
    .replace(/([A-Za-zא-ת])-\s+([a-zא-ת])/g, '$1$2')
    .replace(/^[\d.()\s׳״-]+/, '')  // מספור פותח
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * בחירת משפט-הליבה מ-chunk ראיה: המשפט שהכי שווה לדווח.
 * ניקוד: אורך בטווח + נוכחות מונחי חובה/מילות מפתח + עברית נקייה (רעש OCR נפסל).
 */
// מילות תפקוד — פרוזה אמיתית מכילה אותן; רצף כותרות-שקפים לא. לפי שפת המשפט:
// חומרי קורס הם לא פעם באנגלית (השאילתה עברית, הראיה אנגלית — מסלול נתמך).
const HE_FUNCTION_WORDS_RE = /(?:^|\s)(?:של|את|כי|על|אשר|היא|הוא|הם|בין|כאשר|לפי|וגם|אבל|כדי|בשל|לכן|כלומר|וכן)(?:\s|$)/;
const EN_FUNCTION_WORDS_RE = /(?:^|\s)(?:the|of|and|in|to|that|is|are|was|as|for|with|by|from)(?:\s|$)/i;

// הסגר-ג'יבריש ברמת המשפט (round-3): קטע מהמניפסט שאינו garbled ברמת ה-chunk
// עדיין נושא משפטים משובשי-OCR בודדים — גרשיים/מרכאה באמצע מילה ('בית"המלאכה'),
// כוכבית באמצע מילה ('יום*יום'), וספרות דבוקות לאותיות. הבוסט הלקסיקלי מכשיר
// בדיוק את אלה (garbage-in), ולכן הסינון חייב לרוץ *לפני* הבחירה. round-2 העביר
// 2/3 ממשפטי sec_3 המשובשים ל-prose. תלוי-עברית — טקסט אנגלי/עברי נקי לא נפגע.
function ocrCorruptScore(s) {
  const tokens = String(s || '').split(/\s+/).filter(Boolean);
  let hard = 0; // סמן-שיבוש מובהק — פסילה כבר על אחד
  let soft = 0; // סמן חלש יותר — נשקל ביחס/במצטבר
  for (const t of tokens) {
    // מרכאה/גרשיים בין שתי אותיות עבריות בתוך טוקן ארוך: כמעט-ודאי שני מילים
    // שנדבקו ב-OCR ('בית"המלאכה'=9). ר"ת לגיטימי קצר (צה"ל=4, ארה"ב=5) מתחת ל-6
    // ולא נפסל. סמן מובהק — אחד מספיק (round-2 העביר משפט עם בדיוק אחד).
    // אבל: תחילית בת אות אחת + פתיחת ציטוט ('ו"מאזני', 'ל"בעיה', 'ש"גם') היא עברית
    // תקינה לחלוטין — נדרשות ≥2 אותיות לפני הגרשיים כדי שזה יהיה הידבקות-OCR.
    const q = t.search(/["״׳“”]/);
    if (q >= 2 && /[א-ת]["״׳“”][א-ת]/.test(t) && t.replace(/["'״׳“”]/g, '').length >= 6) { hard += 1; continue; }
    if (/[א-ת][*][א-ת]/.test(t)) { hard += 1; continue; }   // יום*יום, גילדות*נגרים
    if (/\d[א-ת]|[א-ת]\d/.test(t)) { hard += 1; continue; }  // ספרה דבוקה לאות עברית
    if (/[A-Za-z]\d|\d[A-Za-z]/.test(t)) { soft += 1; }      // ספרה-לטינית: רך (COVID19)
  }
  return { hard, soft, total: tokens.length };
}

/** "זה בכלל משפט?" — מסנן רצפי כותרות/תוכן-עניינים ממצגות ו-PDF שבורים. */
// ---------- מטא-דאטה של מאמר ----------
//
// כותרת ב-PDF אינה נגמרת בנקודה, ולכן פיצול-המשפטים מדביק אותה למשפט התוכן
// שאחריה. התוצאה נמדדה בפועל בפלט המנוע:
//   "טענה מרכזית העולה מן החומר היא כי Keywords: power; soft power; … P ower is
//    the ability to affect others…"
//   "חשוב להדגיש כי Stephan Gundel n Introduction 'All our ignorance…'"
// שני אלה עברו את looksLikeProse כי יש בהם מילות תפקוד אנגליות אמיתיות —
// המשפט האמיתי שנדבק לכותרת הכשיר את הכותרת.
//
// לכן הבדיקה כאן היא על **הימצאות** סמן מבני, לא על תחילת המחרוזת.
// ⚠️ שתי מסגרות נפרדות. `\b` הוא גבול-מילה **ASCII** ואינו עובד בעברית (גוצ'ה
// מתועדת של הפרויקט) — חלופות עבריות שנכתבו עם `\b` פשוט לא נורות. נמדד:
// שקופית הכותרת "מבוא למינהל ציבורי שעור 7 … מרצה: ד"ר … קורס: …" צוטטה כראיה
// למרות ש"מבוא" היה ברשימה. הגבול העברי הוא lookahead שלילי על אות עברית.
const META_HEAD_LAT_RE = /^(?:keywords?|abstract|introduction|conclusions?|references|bibliography|acknowledge?ments?|appendix|author\s+note|table\s+\d|figure\s+\d|copyright|downloaded\s+from|see\s+the\s+terms)\b/i;
const META_HEAD_HEB_RE = /^(?:תקציר|מבוא|ביבליוגרפיה|רשימת\s+מקורות|תוכן\s+העניינים)(?![א-ת])/;
// מטא-דאטה של שקופית כותרת — מופיע גם באמצע הבלוק, לא רק בפתיחה.
const SLIDE_META_RE = /(?:^|\s)(?:מרצה|קורס|מגיש(?:ה|ים)?|מנחה)\s*:|(?:^|\s)ש[יע]עור\s+\d|(?:^|\s)שקופית\s+\d/;
// אותם סמנים באמצע המשפט = שתי יחידות שנדבקו.
const META_INLINE_RE = /\b(?:keywords?|abstract)\s*[::]/i;
// ⚠️ אות לטינית בודדת בין מילים ("Gundel n Introduction") היא סמן הערת-שוליים
// או שארית פורמט — לא מילה. "a"/"I" הן מילים אמיתיות ולכן מוחרגות.
const STRAY_LETTER_RE = /(?:^|\s)(?!a\b|i\b)[b-hj-z](?:\s|$)/i;

function isMetadataFragment(s) {
  const t = String(s || '').trim();
  // חוקים שתקפים בכל שפה — סמנים מבניים מפורשים.
  if (META_HEAD_LAT_RE.test(t)) return true;
  if (META_HEAD_HEB_RE.test(t)) return true;
  if (SLIDE_META_RE.test(t)) return true;
  if (META_INLINE_RE.test(t)) return true;

  // ⚠️ מכאן והלאה — חוקים שכוילו על **PDF אקדמי באנגלית** בלבד. החלתם על עברית
  // היא הכללה שלא נמדדה, והיא מסוכנת בדיוק לטקסט המשפטי שהמנוע אמור לכתוב עליו:
  // "1)" פותח פריט ברשימה ממוספרת, וסוגריים לא מאוזנים נפוצים כשפיצול-המשפטים
  // שובר בתוך הפניה ("(ע"א 214/89"). לכן הם מוגבלים לטקסט לטיני-דומיננטי.
  if (hebrewRatio(t) >= 0.5) return false;

  if (STRAY_LETTER_RE.test(t)) return true;
  // ⚠️ ערך ביבליוגרפי. נמדד בפלט: "Making sense of media and politics: Five
  // principles in political communication" צוטט כאילו היה טענה. הסימן הוא
  // כותרת-עם-נקודתיים בלי פועל מוטה — ואין בה אף מילת-פועל נפוצה.
  if (/^[^.!?]{10,}:\s+[A-Z]/.test(t) && !/\b(is|are|was|were|has|have|can|may|shows?|argues?|finds?|suggests?|refers?)\b/i.test(t)) return true;
  // שארית פורמט בפתח ("x), soft power refers to…") או סוגר לא מאוזן שנקטע
  // באמצע ("…crisis management (e.g").
  if (/^[a-z0-9]{1,3}\)/.test(t)) return true;
  const opens = (t.match(/\(/g) || []).length;
  const closes = (t.match(/\)/g) || []).length;
  if (opens !== closes) return true;
  // ריצת-כותרת: שיעור גבוה של מילים באות גדולה בטקסט לטיני ("Media and Peace An
  // additional demonstration" — כותרת סעיף + תחילת משפט).
  const words = t.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
  if (words.length >= 6) {
    const caps = words.filter((w) => /^[A-Z]/.test(w)).length;
    if (caps / words.length > 0.45) return true;
  }
  return false;
}

// ---------- כשירות כפסוקית משועבדת ----------
//
// המסגרות משתלות את הפסוקית אחרי "ש"/"כי" ("מן החומר עולה כי <פסוקית>").
// לא כל משפט מהמקור כשיר לכך, ונמדד בפלט האמיתי:
//   "…מראה ש**איך עיתונאי יכול להתמודד**…"   — משפט שאלה
//   "…מראה ש**במילים אחרות** ההגנה…"          — פותח במילת-קישור
//   "…עניין ציבורי **–בית המשפט קבע** כי…"    — שני משפטים שנדבקו במקף
// שלושתם עברו את כל השערים הקיימים כי הם עברית תקינה — הם פשוט לא פסוקיות.
const INTERROGATIVE_RE = /^(?:איך|כיצד|מדוע|למה|מתי|היכן|האם|מי\s|מה\s|כמה\s)/;

// ---------- קולו של המקור ----------
// ⚠️ נמדד בעבודה אמיתית (27.7): «במקרה של יקיר, **ציינתי בפתח הדברים** את חוק
// יסוד כבוד האדם וחירותו» — משפט שנלקח מסיכום של מרצה ונכתב לתוך עבודת הסטודנט.
// התוצאה מייחסת למגיש אמירה שהוא מעולם לא אמר, בעבודה שהוא חותם עליה.
//
// זה **לא** פגם סגנוני אלא פגם כנות, ולכן שער ולא ניקוד. מסונן רק גוף ראשון
// **יחיד שמפנה למהלך שיח קודם** — הצורה שאי אפשר לרשת ממקור. «נציין», «ראינו»
// ו«כאמור» נשארים: הם קול אקדמי לגיטימי, וחלקם מיוצרים ע"י המנוע עצמו.
// ⚠️ הורחב 27.7 אחרי שנמצא בפלט: «ראוי לציין שבטרם **אעבור** לחקיקה… **אני
// רוצה להציג בפניכם** שני פסקי דין» — מרצה שפונה לכיתה, בתוך עבודה שסטודנט
// חותם עליה. הרשימה הראשונה כיסתה רק פעלי-דיווח בגוף ראשון עבר.
const SOURCE_VOICE_RE = new RegExp([
  // גוף ראשון המפנה למהלך שיח — עבר ועתיד כאחד
  '(?:^|\\s)(?:ציינתי|הזכרתי|אמרתי|כתבתי|הצגתי|פירטתי|הסברתי|טענתי|הראיתי|סיכמתי',
  '|אסכם|אציין|אדון|אפרט|אטען|אעבור|אציג|אראה|אסביר|אתאר|ארחיב)(?:\\s|,|\\.|$)',
  // פנייה לקהל — שיעור, לא עבודה
  '|בפניכם|לכם\\s+(?:אני|נראה)|כזכור\\s+לכם|כפי\\s+שראיתם|בשיעור\\s+(?:שעבר|הקודם)',
  '|(?:^|\\s)אני\\s+(?:רוצה|אבקש|מבקש)(?:\\s|$)|ברצוני\\s+ל',
  // הפניות פנימיות של המקור
  '|בפתח\\s+הדברים|כפי\\s+שציינתי|כפי\\s+שהסברתי',
].join(''));

// ⚠️ הערכה ותלות-זמן: «פסק דין **מרתק** שניתן **לפני מספר חודשים**». הראשונה
// היא קולו של המרצה ולא טענה; השנייה חסרת מובן בעבודה שתיקרא בעוד שנה.
const SOURCE_DEIXIS_RE = /לפני\s+(?:מספר|כמה)\s+(?:ימים|שבועות|חודשים|שנים)|(?:^|\s)(?:מרתק|מעניין|מדהים|נהדר|יפה)(?:\s|,|\.|$)|לאחרונה\s+ממש|בימים\s+אלה/;

// ---------- אנפורה תלויה ----------
// משפט שנשלף מהמקור והושתל כ-@clause מאבד את מה שקדם לו. משפט שפותח בהפניה
// אחורה נשאר תלוי באוויר, ונקרא כשבר:
//   «במקרה של יקיר, **זאת עמדה ש**מתבטאת בלשונם של חוק הגנת…»
//   «בספרות מתואר כי **עם זאת** הוא מתיר פגיעה בפרטיות…»
// ⚠️ הפגם אינו תלוי בקשירת הצד — המסגרת רק מקדימה אותו והופכת אותו לגלוי.
// ⚠️ ‎\b אינו עובד בעברית (ר' CLAUDE.md), ולכן הגבול נאכף בתצוגה מקדימה מפורשת.
// ⚠️ הגרסה הראשונה **פסלה** את כל הרשימה, וזה עלה יותר ממה שהחזיר: ישויות
// 6/9→4/9, מילים 935→797, ופיגום שקפץ ל-35% בסעיף אחד — כי מקשר פותח נמצא בראש
// המון משפטים תקינים לחלוטין. ההפרדה הנכונה היא לפי **מה תלוי באוויר**:
//   · מקשר פותח — התוכן עומד בפני עצמו אחרי שמקלפים אותו. «עם זאת, בית המשפט
//     קבע…» → «בית המשפט קבע…». קילוף, לא פסילה.
//   · כינוי רומז כנושא — אין מה להציל. «זאת עמדה שמתבטאת…» בלי מה שקדם לו הוא
//     שבר, וקילוף "זאת" משאיר "עמדה שמתבטאת…" שאינו משפט.
// ⚠️ `^[,\s]+` בהתחלה: נמדד «מן החומר עולה כי**, אך** באותה נשימה ממש…» —
// פסוקית שנשלפה עם פסיק פותח, והמסגרת הדביקה אותה ל"כי".
const STRIP_CONNECTIVE_RE = /^[,\s]*(?:עם זאת|לעומת זאת|מנגד|מאידך|אך|אולם|אבל|בנוסף|כמו כן|יתרה מכך|יתר על כן|זאת ועוד|לפיכך|לכן|על כן|משום כך|כתוצאה מכך|מכאן|כלומר|למעשה)[,\s]+/;

// ⚠️ הורחב 27.7 ל**כינויי גוף**, לא רק רומזים. נמדד בפלט:
//   «עוד צוין כי **הוא** מתיר פגיעה בפרטיות»
//   «יש לסייג ולומר ש**כשזו נפגעת הוא** רשאי לתבוע»
//   «מראה ש**כל עוד הם** פורסמו במדוייק»
// לכינוי אין מקור בטקסט החדש — הוא הפנה למשהו שנשאר במקור. אותה משפחת פגם
// בדיוק כמו הכינוי הרומז, ורק הוא היה מכוסה.
const DANGLING_ANAPHOR_RE = /^(?:זאת|זו|זה|אלה|אלו|הדבר|כך|לכך|בכך)(?=[\s,])/;

// ⚠️ **קנס ולא שער, וזה נמדד.** כינוי גוף פותח («עוד צוין כי **הוא** מתיר…»)
// הוא פגם אמיתי — לקורא אין דרך לדעת מיהו — אבל פסילה קשיחה שלו עלתה 4 נקודות
// סגנון (31→27, מתחת לרצועת הרעש 32-46) וסילקה רק 3 מקרים מתוך 36 משפטים.
// הסיבה: שער קשיח מסלק מועמד גם כשאין תחליף, והמנוע נדחק לבחירות גרועות יותר.
// קנס משאיר את ההחלטה לבורר: נמנע כשיש חלופה, נבחר כשאין.
const PRONOUN_OPENER_RE = /^(?:הוא|היא|הם|הן|כשזו|כשהוא|כשהיא|כשהם)(?=[\s,])/;
// ⚠️ בלי \b בסוף: `\b?` הוא ביטוי לא חוקי (אי אפשר לכמת גבול-מילה), ו-\b ממילא
// חסר משמעות אחרי אות עברית. הגבול נאכף ע"י (?![א-ת]) כמו בשאר המסננים.
const DISCOURSE_OPENER_RE = /^(?:במילים אחרות|לדוגמ[הא]|למשל|כפי שהזכרנו|כאמור|לסיכום|לסיום|ראשית|שנית|שלישית|כלומר|מנגד|לעומת זאת|בנוסף|יתרה מכך|זאת ועוד)(?![א-ת])/;
// מקף שאינו מוקף ברווחים משני צדדיו = גבול משפט שנבלע בפורמט.
const GLUED_DASH_RE = /\S[–—]\s*[א-ת]|[א-ת]\s*[–—]\S/;

// בחירה דטרמיניסטית לפי מפתח — אותו seed מחזיר תמיד אותה תוצאה (תנאי לשחזור
// כשלים בבנצ', שמריץ עם זרע קבוע).
function hashPick(key, n) {
  const s = String(key || '');
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return n > 0 ? Math.abs(h) % n : 0;
}

function fitsAsSubordinateClause(s) {
  const t = String(s || '').trim();
  if (INTERROGATIVE_RE.test(t)) return false;
  if (DISCOURSE_OPENER_RE.test(t)) return false;
  if (GLUED_DASH_RE.test(t)) return false;
  return true;
}

function looksLikeProse(s) {
  if (isMetadataFragment(s)) return false;
  if (!fitsAsSubordinateClause(s)) return false;
  const words = countWords(s);
  // רצף ארוך בלי פיסוק סופי = ריצת כותרות ("תחנות יסוד... חבר פרלמנט (1865-68)...")
  if (words > 15 && !/[.!?׃]$/.test(s)) return false;
  if (s.includes('…')) return false;                       // נחתך כבר במקור
  // שיבושי-OCR: סמן מובהק אחד (hard) מספיק לפסילה; אחרת ≥2 מצטבר או >12%.
  const oc = ocrCorruptScore(s);
  if (oc.hard >= 1) return false;
  if (oc.soft >= 2 || (oc.total > 0 && oc.soft / oc.total > 0.12)) return false;
  const fnRe = hebrewRatio(s) >= 0.5 ? HE_FUNCTION_WORDS_RE : EN_FUNCTION_WORDS_RE;
  if (!fnRe.test(s)) return false;                         // אין מילות תפקוד — רשימת שמות
  // צפיפות סוגריים/מספרים גבוהה = שורת ביבליוגרפיה או ציר-זמן, לא טענה
  const numParen = (s.match(/[()0-9]/g) || []).length;
  if (numParen / Math.max(s.length, 1) > 0.12) return false;
  return true;
}

// ⚠️ `requireTerm`: לדרוש שהמשפט ייגע ולו במונח אחד של הסעיף.
//
// בלי זה אין **שום רצפת רלוונטיות**: משפט שאינו נוגע באף מונח עדיין מקבל 4
// נקודות (2 על אורך + 2 על יחס-עברית), ולכן כשבקטע אין משפט טוב יותר — נבחר
// המשפט הלא-רלוונטי ביותר שבמקרה כתוב בעברית תקינה. כך נולד הפגם שנראה בעין:
// סעיף שנפתח ב"התקופה הייתה תקופת מיתון… החזירה חברת החשמל את הרכב".
//
// למהלך `evidence` זה נסבל — הקטע כולו אוחזר בזכות רלוונטיות. למהלך `claim` זה
// קטלני: זהו **המשפט הפותח** של הסעיף, הטענה שהפרק אמור להוכיח, והוא הדבר
// הראשון שקורא אנושי רואה. לכן השער נדלק שם בלבד, ולא גלובלית.
//
// כשאין לסעיף מונחים כלל — השער מושבת, אחרת היה חוסם הכול.
/**
 * מפתח הדה-דופ של משפט. ⚠️ **אי-סימטריה שנמדדה (27.7):** `markUsed` שמר את
 * המשפט **עם** סימן הסיום, ו-`pickCoreSentence` חיפש אותו **בלי** — ולכן
 * הדה-דופ החוצה-סעיפים לא התאים לעולם עבור משפט שנגמר בנקודה, כלומר כמעט כל
 * משפט. זה מה שהפיל את `no-cross-dup`: «במקור צוין שעל פי אחת ההגדרות תום לב
 * הוא מצב של יושר צדק והוגנות» נכתב פעמיים, בשני סעיפים.
 */
const normSentenceKey = (s) => String(s).replace(/[.!?׃…]+$/, '').trim();

function pickCoreSentence(chunkText, {
  terms = [], used = new Set(), requireTerm = false, rejectAnaphor = false,
} = {}) {
  const sentences = splitSentences(chunkText).map(cleanEvidenceSentence).filter(Boolean);
  const norm = normSentenceKey;
  const gateOn = requireTerm && terms.length > 0;
  let best = null;
  let bestScore = -Infinity;
  for (const raw of sentences) {
    // ⚠️ הקילוף קודם לכל בדיקה — האורך, הניקוד וה-used חייבים להיגזר מהמשפט
    // שבאמת ייכתב, אחרת נמדד משפט אחד ונכתב אחר.
    const stripped = String(raw).trim().replace(STRIP_CONNECTIVE_RE, '');
    const s = countWords(stripped) >= MIN_CLAUSE_WORDS ? stripped : String(raw).trim();
    if (used.has(norm(s))) continue;
    const words = countWords(s);
    if (words < MIN_CLAUSE_WORDS) continue;
    if (!looksLikeProse(s)) continue;
    if (SOURCE_VOICE_RE.test(s)) continue;
    if (SOURCE_DEIXIS_RE.test(s)) continue;
    if (words > MAX_CLAUSE_WORDS) continue;   // לא נחתוך — פשוט לא נבחר
    // ⚠️ רק בפתח הסעיף. נמדד: פסילה גורפת עלתה 935→797 מילים והקפיצה את הפיגום
    // ל-35% בסעיף אחד — כלומר תיקנה פגם אחד וייצרה אחר. באמצע פסקה הכינוי הרומז
    // **אינו** תלוי: הוא מפנה למשפט שהמנוע עצמו כתב זה עתה.
    if (rejectAnaphor && DANGLING_ANAPHOR_RE.test(s)) continue;
    if (gateOn && !terms.some((t) => t && s.toLowerCase().includes(String(t).toLowerCase()))) continue;
    let score = 0;
    // ⚠️ **נוסה ונפסל (27.7).** ההשערה: משפט מקור ארוך הוא כמעט כולו העתקה
    // (sec_4 העתיק 86% עם 34 מילים למשפט, מול 65% ב-sec_1 עם 24), ולכן העדפת
    // משפט קצר תוריד את copy-budget. הוחלף ב-`2 - |words-18|/12` ונמדד:
    //   ציון 93→94 (בתוך פיזור ±6, כלומר רעש) · **העתקה ממוצעת 68%→72%**
    //   · sec_4 עדיין חורג.
    // כלומר המדד שבאתי לתקן הידרדר. הועדף משפט קצר — ונבחרו משפטים צפופי-מקור
    // יותר. מוחזר לכלל המקורי.
    if (words <= MAX_CLAUSE_WORDS) score += 2; else score -= (words - MAX_CLAUSE_WORDS) / 10;
    if (PRONOUN_OPENER_RE.test(s)) score -= 5;   // ר' ההערה ליד הביטוי
    score += hebrewRatio(s) * 2;
    // ⚠️ השוואה חסרת-רישיות. הבוסט למונח-מפתח היה תלוי-רישיות ולכן **לא נורה
    // מעולם** על מקור לטיני: המונח הוא 'soft power' והטקסט אומר "Soft power is
    // the ability to affect others…". נמדד — המשפט המרכזי של מאמר ניי קיבל אותו
    // ניקוד כמו הביוגרפיה של המחבר, וזו נבחרה כ"ראיה". בעברית אין רישיות, ולכן
    // הבאג היה שקוף לחלוטין במסלול העברי.
    const lower = s.toLowerCase();
    for (const t of terms) {
      if (t && lower.includes(String(t).toLowerCase())) score += 3;
    }
    // משפט שנקטע באמצע (בלי פיסוק סופי) פחות אמין לציטוט עקיף.
    if (!/[.!?׃]$/.test(s)) score -= 1;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  if (!best) return null;
  // ⚠️ מסמנים את **משפט המקור**, לא את הצורה החתוכה שמוחזרת. הקורא סימן עד כה
  // רק את החתוכה, והבדיקה כאן מתבצעת מול המלאה — כך שמשפט שנחתך נבחר שוב ושוב.
  // נמדד: אותו משפט של וולפספלד הופיע פעמיים באותה פסקה ועבר את בדיקת הכפילות
  // של הבנצ', שמשווה מחרוזות מדויקות והשתיים נבדלו רק בסיומת ההפניה.
  used.add(norm(best));
  // ⚠️ **לא חותכים יותר.** החיתוך ל-32 מילים הפיק «…וקבעו הלכות… [2]» — טענה
  // קטועה באמצע, ועליה מראה מקום שמייחס אותה למקור. זו בעיית כנות ולא אסתטיקה:
  // המשפט מצהיר פחות ממה שהמקור אמר ומיוחס לו במלואו. עם k=10 יש מספיק מועמדים
  // כדי לוותר על ארוך אחד; מי שחורג פשוט אינו נבחר (הניקוד כבר מעניש אותו).
  if (best.split(/\s+/).length > MAX_CLAUSE_WORDS) return null;
  return best.replace(/[.!?׃]+$/, '');
}

// round-4: תבליט-מצגת (sourceKind='slides') הוא לרוב צירוף-נושא בלי פועל מוטה —
// looksLikeProse פוסל אותו בצדק *כפסוקית מדווחת* (הוא לא), אבל כציטוט ישיר קצר
// הוא ראיה לגיטימית ושמישה. לכן ציטוט ממקור-שקפים עובר מסלול נפרד: בלי
// looksLikeProse, אבל עדיין עם סינון-הג'יבריש (ocrCorruptScore) ואורך מינימלי
// לציטוט משמעותי (ברירת מחדל 6 מילים) — לא כל שבר-תבליט ראוי לציטוט.
function pickQuoteFragment(chunkText, { terms = [], used = new Set(), minWords = 6 } = {}) {
  const sentences = splitSentences(chunkText).map(cleanEvidenceSentence).filter(Boolean);
  const norm = (s) => String(s).replace(/[.!?׃…]+$/, '').trim();
  let best = null;
  let bestScore = -Infinity;
  for (const s of sentences) {
    if (used.has(norm(s))) continue;
    const words = countWords(s);
    if (words < minWords) continue;
    // מטא-דאטה פסול גם כציטוט — ציטוט של "Keywords:" אינו ראיה.
    if (isMetadataFragment(s)) continue;
    const oc = ocrCorruptScore(s);
    if (oc.hard >= 1) continue;
    if (oc.soft >= 2 || (oc.total > 0 && oc.soft / oc.total > 0.12)) continue;
    let score = hebrewRatio(s) * 2;
    const lower = s.toLowerCase();   // ר' ההסבר ב-pickCoreSentence
    for (const t of terms) if (t && lower.includes(String(t).toLowerCase())) score += 3;
    if (words <= QUOTE_MAX_WORDS) score += 2; else score -= (words - QUOTE_MAX_WORDS) / 10;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  if (!best) return null;
  used.add(norm(best));   // כמו ב-pickCoreSentence: מסמנים את המקור, לא את החתוך
  const w = best.split(/\s+/);
  const clause = w.length > QUOTE_MAX_WORDS ? `${w.slice(0, QUOTE_MAX_WORDS).join(' ')}…` : best;
  return clause.replace(/[.!?׃]+$/, '');
}

// ---------- האם כותרת המקור היא בכלל שם מחבר ----------
//
// ⚠️ נמדד על המטלה האמיתית: המנוע כתב "בהתאם לדברים המובאים אצל תקציר שיעור
// הגנות עיתונאיות" — כלומר הציב **שם קובץ** במקום שם מחבר, בתוך המשפט. אף כותב
// אנושי לא מנסח כך, וזה גם מה שהציף את מדד הסגנון (הרצפים של "שיעור" קיבלו z+7).
//
// מקור נושא שם מחבר כשיש בו שנה ("כהן 2019", "Nye 2008") או שהוא קצר וללא מילת
// מסמך גנרית. אחרת — המסגרות שמכילות @author נפסלות לאותו מהלך, וההפניה נשארת
// בסוגריים בלבד, שם היא לגיטימית.
const GENERIC_DOC_RE = /תקציר|סיכום|שיעור|שעור|הרצאה|מצגת|קובץ|מסמך|חומר|הנחיות|notes?|slides?|lecture|summary/i;
const AUTHOR_FRAME_IDS = ['ev_perSource', 'ev_atSource', 'ev_accord', 'q_asWritten', 'q_inWords'];

function looksLikeAuthorCitation(sourceTitle) {
  const s = String(sourceTitle || '').trim();
  if (!s) return false;
  if (GENERIC_DOC_RE.test(s)) return false;
  if (/\d{4}/.test(s)) return true;
  return countWords(s) <= 4;
}

/** "@author" מכותרת מקור: 4 מילים ראשונות, בלי סיומות קובץ. */
function authorFromSource(sourceTitle) {
  const words = String(sourceTitle || '')
    .replace(/\.(pdf|docx?|txt|pptx?)$/i, '')
    // ⚠️ שם קובץ מקוקד/מקווקו הוא טוקן אחד לפיצול-רווחים, ולכן ההפניה יצאה
    // "אצל nye-2008-public-diplomacy-and-soft-power" — כל שם הקובץ. נמדד בפלט.
    // מקפים/קווים תחתונים הופכים למפרידים, וכך נגזר "nye 2008" כמצופה.
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  // שם קובץ טיפוסי: "כהן ולוי 2019 מעורבות הורים" — המחבר הוא מה שלפני השנה.
  const out = [];
  for (const w of words) {
    if (/\d/.test(w)) { out.push(w); break; }  // השנה נשארת: "כהן ולוי 2019"
    // מפריד בכותרת ("מארקס ואנגלס – המניפסט") — עוצר לפניו כדי לא לגרור מקף תלוי
    // לתוך הציטוט ("(מארקס ואנגלס –)"). round-2 flag.
    if (/^[–—-]+$/.test(w)) break;
    out.push(w);
    // ⚠️ כותרת עברית נקטעת ב-3 מילים ומאבדת את המבחין: "תקציר שיעור הגנות"
    // (במקום "…הגנות עיתונאיות") ו"תקציר שיעור חופש" (במקום "…חופש הביטוי").
    // בשם לועזי 3 מילים מספיקות ("Nye 2008"); בעברית התיאור ארוך יותר מטבעו.
    if (out.length >= (/[א-ת]/.test(w) ? 5 : 3)) break;
  }
  // ניקוי פיסוק-מפריד תלוי בקצה, ליתר ביטחון.
  return out.join(' ').replace(/[\s–—:,;.\-]+$/, '').trim() || 'המקור';
}

function citeFromEvidence(item) {
  const name = authorFromSource(item?.sourceTitle);
  const page = item?.pageHint ? `, עמ' ${item.pageHint}` : '';
  return `(${name}${page})`;
}

// ── תכנון מהלכים לפי intent ────────────────────────────────────────────────
// לכל intent: רצף הפתיחה, ואיזה "מחזור" חוזר עד שמגיעים למכסה.
// evidence = משפט מדווח מ-chunk; quote = ציטוט ישיר; contrast/concede = מסגור
// ראיה נוספת כזווית שונה (עדיין מהחומר!); wrap = משפט מטא סוגר.
// ── רשימת הפקודות (Phase "בקשות" — בלי שפה חופשית) ─────────────────────────
// כל פקודה = חוק דטרמיניסטי על תוכנית המהלכים / המכסה / הראיות. ה-UI מציג
// אותן לפי קטגוריה; single מציין קטגוריות בהן בוחרים אחת לכל היותר.
export const PROSE_COMMANDS = [
  { id: 'len_brief', cat: 'אורך', label: 'תמציתי מאוד', desc: 'כמחצית מהמכסה', single: 'len' },
  { id: 'len_short', cat: 'אורך', label: 'קצר יותר', desc: 'כ-70% מהמכסה', single: 'len' },
  { id: 'len_expand', cat: 'אורך', label: 'מפורט יותר', desc: 'כ-130% מהמכסה — אם יש מספיק ראיות', single: 'len' },
  { id: 'ev_more_quotes', cat: 'ראיות וציטוטים', label: 'יותר ציטוטים ישירים', desc: 'מהלך ציטוט נוסף בכל מחזור' },
  { id: 'ev_no_quotes', cat: 'ראיות וציטוטים', label: 'בלי ציטוטים ישירים', desc: 'הכול בדיווח עקיף עם מראה מקום' },
  { id: 'ev_strong_only', cat: 'ראיות וציטוטים', label: 'רק ראיות חזקות', desc: 'משתמש רק בהתאמות הבטוחות ביותר (z גבוה)' },
  { id: 'tone_concede', cat: 'טון ומבנה', label: 'הוסף הסתייגויות', desc: 'מהלך סיוג בכל מחזור — כתיבה זהירה יותר' },
  { id: 'tone_contrast', cat: 'טון ומבנה', label: 'הדגש ניגודים', desc: 'מהלך ניגוד בכל מחזור' },
  { id: 'tone_no_wrap', cat: 'טון ומבנה', label: 'בלי משפטי סיכום', desc: 'משאיר את הסגירה לך' },
  { id: 'st_short_paras', cat: 'ניסוח', label: 'פסקאות קצרות', desc: '2 משפטים לפסקה במקום 3' },
  { id: 'st_reshuffle', cat: 'ניסוח', label: 'נסח מחדש', desc: 'אותן ראיות, מסגרות וסדר אחרים' },
  { id: 'st_pick5', cat: 'ניסוח', label: 'בחירה קפדנית', desc: '5 וריאנטים במקום 3 — הדטקטור בוחר' },
];

const MOVE_PLANS = {
  intro:      { lead: ['claim'], cycle: ['evidence', 'explain'], close: ['transition'] },
  review:     { lead: ['claim'], cycle: ['evidence', 'evidence', 'quote'], close: ['wrap'] },
  analysis:   { lead: ['claim'], cycle: ['evidence', 'explain', 'contrast'], close: ['wrap'] },
  comparison: { lead: ['claim'], cycle: ['evidence', 'contrast'], close: ['wrap'] },
  argument:   { lead: ['claim'], cycle: ['evidence', 'explain', 'concede'], close: ['wrap'] },
  method:     { lead: [], cycle: ['evidence', 'evidence'], close: [] },
  findings:   { lead: ['claim'], cycle: ['evidence', 'quote', 'explain'], close: ['wrap'] },
  conclusion: { lead: ['wrapOpen'], cycle: ['evidence', 'explain'], close: ['wrap'] },
  exposition: { lead: ['claim'], cycle: ['evidence', 'explain', 'quote'], close: ['wrap'] },
};

// ── המחולל ────────────────────────────────────────────────────────────────
/**
 * כתיבת גוף פרק מקומית מראיות.
 *
 * @param {object} section  יחידת spec: {id, title, intent, mustMention, keywords, quota?}
 * @param {Array<object>} evidence  רשימת chunks מ-findEvidenceForSection (ranked)
 * @param {{quotaWords?:number, seedKey?:string, profile?:object,
 *          avgSentenceWords?:number}} opts
 * @returns {{sentences:Array<{text:string,move:string,evidenceId:string|null}>,
 *            html:string, wordCount:number, notes:string[], usedEvidenceIds:string[]}|null}
 */
export function composeSectionProse(section, evidence, opts = {}) {
  const list = Array.isArray(evidence) ? evidence.filter((e) => e && e.text) : [];
  if (!list.length) return null;   // BLOCKED נשאר BLOCKED — לא ממציאים

  const {
    quotaWords = 0,
    seedKey = section?.id || 'section',
    profile = null,
    avgSentenceWords = AVG_WORDS_PER_SENTENCE,
    commands = null,   // מזהי PROSE_COMMANDS — חוקים דטרמיניסטיים, לא שפה חופשית
    // Set משותף בין כל סעיפי העבודה: בלי זה אותו משפט ראיה חוזר בסעיפים א-ד
    // (נמדד בעבודה אמיתית). הקורא (Studio) מעביר Set אחד לכל הריצה.
    sharedUsedSentences = null,
    // מפת chunkId → משפט מנוסח, שהוכנה מראש ע"י localRewriteService. ראיה שאינה
    // במפה (לא עברה את שער העיגון של הניסוח) נופלת למסלול הכללים כרגיל.
    rewrites = null,
    // פרופיל היעדים המבניים של המשתמש (deriveStyleTargets). null ⇒ המנוע רץ
    // בברירות המחדל בדיוק כמו קודם. זו ההבטחה שנרשמה ליד AVG_WORDS_PER_SENTENCE.
    styleTargets = null,
  } = opts;
  const cmds = new Set(Array.isArray(commands) ? commands : commands instanceof Set ? [...commands] : []);

  // מזהה ראיה: findEvidenceForSection מחזיר chunk תחת `chunkId` (לא `id`), ולכן
  // בלי הנפילה הזו כל evidenceId היה null — עיגון-המשפט-לראיה (עקרון הכנות) לא
  // נרשם, ו-wrap תמיד ייחס למקור הראשון בלבד. נמדד ב-nlg-loop-round.
  const evId = (e) => (e && (e.chunkId ?? e.id)) || null;

  // סינון ראיות חלשות — ברירת מחדל, לא רק בפקודה. ראיה "(אולי)" טובה כהפניה
  // בשלד, אבל **לא** כבסיס למשפט תוכן: נמדד בעבודה אמיתית — כתבה על סרט בוליוודי
  // (שנקלטה כי מונח-חובה הופיע בה) נכתבה לתוך ניתוח של מיל בכל הסעיפים.
  //
  // הסף תלוי-שפה: שאילתה עברית מול מקור אנגלי מדכאת קוסינוס באופן טבעי (נמדד
  // בהרנס: ראיות אנגליות לגיטימיות ב-z 3.7-4.1), ולכן מקור לטיני מקבל סף מקל.
  // מקור עברי ב-z 4.0 הוא בדיוק פרופיל הזבל הבוליוודי — נשאר על 4.5.
  // ראיה בלי z (fallback לקסיקלי / mock) עוברת — אין לנו במה לשפוט אותה.
  //
  // round-4: 4.5 כויל נגד קורפוס OCR-מזוהם, אבל אותו הדין מוחל גם על מקור עברי
  // דיגיטלי-נקי (pptx/docx שלא עבר OCR) — נמדד: מצגת מיל on-topic ב-z3.15-3.53
  // נפסלה למרות שאין בה סיכון garbage-in. מקור שסומן cleanDigital (ר' addMaterialDocument)
  // מקבל רצפה מקלה יותר: 3.8 — עדיין מעל Z_KEEP=3.4 של evidenceMatchService,
  // כלומר לא מרפים את הסינון הסמנטי עצמו, רק את הענישה הייעודית-ל-OCR.
  const zFloor = (e) => {
    if (hebrewRatio(e.text) < 0.5) return 3.6;
    return e.cleanDigital ? 3.8 : 4.5;
  };
  // ⚠️ zFloor הוא סף **מוחלט** על z, ו-z אינו בר-השוואה בין קורפוסים: הוא מודד
  // חריגה מהתפלגות הקורפוס. בקורפוס ממוקד (חומרי קורס אחד) ה-z המרבי האפשרי
  // נמוך מלכתחילה, ולכן 4.5 אינו בר-השגה שם *בעיקרון* — לא בגלל איכות הראיה.
  // נמדד: הקטע "מנהל ציבורי חדש = NPM" — התשובה המדויקת לשאילתה — קיבל z=3.27.
  // ראיה שסומנה focused כבר עברה עוגן לקסיקלי ב-evidenceMatchService, ולכן
  // הסף המוחלט לא חל עליה. העיגון עצמו (חפיפת מילות-תוכן) נאכף כרגיל במורד.
  const passesFloor = (e) => (e.focused ? true : (typeof e.z === 'number' ? e.z >= zFloor(e) : true));
  const passing = list.filter(passesFloor);
  if (!passing.length) return null;   // רק ראיות חלשות — עדיף שלד כן מטיוטה מזויפת

  // ---------- מקור בשפה זרה ----------
  // המנוע אינו מתרגם. עד כה משפט אנגלי הושתל כפסוקית מדווחת אחרי מסגרת עברית,
  // והתוצאה נמדדה בפלט אמיתי:
  //   "מן החומר עולה כי In 2004, he published Soft Power: The Means to Success…"
  // זה לא סגנון גרוע — זה פלט בלתי שמיש, והוא עבר את כל אינווריאנטות הבנצ'
  // (עיגון, כפילות, כנות-מכסה) כי אף אחת מהן לא בודקת קריאוּת או שפה.
  //
  // מקור זר עובר לתור הציטוט: הוא יופיע כ**ציטוט ישיר מיוחס בשפת המקור**, וזה
  // מה שכותב אקדמי עושה ממילא. הוא לא ידווח כטענה בקול המנוע.
  const foreign = passing.filter((e) => hebrewRatio(e.text) < 0.5);
  let workList = passing.filter((e) => hebrewRatio(e.text) >= 0.5);

  // ---------- החלון המת ----------
  // evidenceMatchService שומר ראיה ב-z≥3.4 (עם עוגן), וכאן היא נזרקה ב-zFloor
  // (3.6 לטיני / 3.8 cleanDigital / 4.5 עברי-סרוק). ראיה שנחתה בטווח הזה הוצגה
  // למשתמש בפאנל ואז **נעלמה בשקט מהכתיבה** — נמדד: crisis-typology קיבל ראיה
  // שלישית ב-z=3.53 מול רצפה 3.6 ולא ייצר ולו מילה נוספת.
  //
  // התיקון אינו הורדת הסף. ראיה גבולית נכנסת **רק כציטוט מיוחס** — בדיוק
  // המנגנון שכבר קיים לראיית-שקפים: הקורא רואה "לפי X, '…'" ולא טענה בקול
  // המנוע. הכנות נשמרת בניסוח במקום בשתיקה, וטענות הפרק ממשיכות להישען
  // אך ורק על ראיות שעברו את הרצפה.
  let borderline = [...list.filter((e) => !passesFloor(e)), ...foreign];

  if (cmds.has('ev_strong_only')) {
    const strong = workList.filter((e) => (typeof e.z === 'number' ? e.z >= 6 : false));
    if (strong.length) workList = strong;
    borderline = [];   // "רק ראיות חזקות" — גם לא כציטוט
  }
  // אין ולו ראיה עברית אחת: הסעיף עדיין שווה משהו — ציטוטים מיוחסים ממקורות
  // זרים — אבל לא פרוזה מדווחת. מסומן במפורש כדי שהמשתמש ידע מה קיבל.
  const quoteOnlySection = workList.length === 0;
  if (quoteOnlySection && !borderline.length) return null;

  const intent = section?.intent || 'exposition';
  // נושא ארוך הוא בעצם פסוקית ("קבוצת המיעוט ביקשה להפגין בבירת המדינה") —
  // שתילתו במסגרת NP ("בכל הנוגע ל<נושא>") מייצרת עברית שבורה. נמדד בעבודה
  // אמיתית. מסגרות @topic מקבלות רק צירוף שמני קצר; אחרת הן לא ישימות והמנוע
  // בוחר מסגרת פסוקית במקומן.
  //
  // ⚠️ אבל "אין נושא" הוא **לא** התוצאה הנכונה עבור מטלת יישום. נמדד בבנצ':
  // בשאלות מסוג "אילו טענות עשויה דליה להעלות נגד יקיר" הכותרת ארוכה מ-6 מילים
  // תמיד, ולכן המסגרות קיבלו מחרוזת ריקה — והתוצאה היא סעיף שמציג דוקטרינה בלי
  // לומר על מי היא חלה. זה בדיוק מה שהאינווריאנטה answers-the-question מדדה
  // (**1/10 ישויות מהשאלה, 10%**) וזה ההסבר לפער 87 מול 99 בין מסלול הכללים
  // לבין מסלול הניסוח.
  //
  // הפתרון אינו להרפות מהכלל אלא לקיים אותו: **שם הצד הוא צירוף שמני קצר**,
  // בדיוק מה שהמסגרות דורשות. הוא נלקח מהשאלה עצמה ולכן אינו המצאה.
  const questionParty = () => {
    const parties = questionSubjects(section?.title);
    return parties.length ? parties[0] : '';
  };
  // ⚠️ אורך לבדו אינו מבחין. נמדד: «אילו טענות הגנה עשוי דניאל להעלות» היא בדיוק
  // שש מילים, עברה כ"צירוף שמני קצר", והופקה ממנה הפתיחה
  // «במקרה של אילו טענות הגנה עשוי דניאל להעלות, מבחן נזק…» — בדיוק העברית
  // השבורה שהכלל נועד למנוע. **כותרת שהיא שאלה אינה צירוף שמני באף אורך.**
  const titleIsQuestion = /^(?:אילו|איזו|איזה|אילן|מהן|מהם|מהו|מהי|כיצד|האם|מדוע|למה|מתי|היכן|כמה|מי\s|מה\s)/
    .test(String(section?.title || '').trim());
  // ---------- כמה סעיפים ינקבו בשם הצד ----------
  // ⚠️ **התנגשות שנמדדה (27.7), והיא הליבה של האיזון כאן.** קשירת הצד בכל סעיף
  // מעלה את `answers-the-question` מ-10% ל-56% ומוציאה את האתר מאדום — אבל
  // מורידה את ציון הסגנון מ-39 ל-22. הפגיעה אינה מהשמות (המדד מנטרל אותם והפער
  // נשאר) אלא מ**חזרת ניסוח המסגרות**: «אשר ל…» ו«במקרה של…» בפתח כל סעיף
  // מכניסים רצפי אותיות שהמשתמש אינו כותב.
  //
  // סף האינווריאנטה הוא 25%, ובקשירה מלאה אנחנו ב-44-56% — כלומר יש מרווח.
  // לכן הקשירה **מוגבלת למכסה לכל העבודה**: מספיק סעיפים כדי לענות על השאלה,
  // מעט מספיק כדי לא להטביע את הסגנון.
  const PARTY_MARK = '@@party:';
  // ⚠️ **המכסה יחסית ולא מוחלטת.** מספר קבוע (3) עובד למטלה בת 6 סעיפים ונשבר
  // בעבודה גדולה: ב-20 סעיפים 3 הם 15% — מתחת לסף האינווריאנטה (25%), ומהותית
  // רוב הסעיפים לא יאמרו על מי הם. מחצית הסעיפים שומרת ~50% ישויות בכל גודל.
  //
  // מחצית ולא כולם, כי עקומת העלות נמדדה **אחרי** תיקון `topicFor` והיא הדרגתית:
  //   ללא קשירה 39·36·43 (רעש ±7) · מחצית 36 · כל הסעיפים 33.
  // כלומר ~נקודת סגנון לכל סעיף קשור. מחצית קונה את מלוא ערך האינווריאנטה בחצי
  // מהעלות. (לפני התיקון העקומה הייתה שטוחה על 22 — ר' ההסבר למעלה.)
  const sectionCount = Number(opts.sectionCount) || 0;
  let partyBudget = sectionCount > 0 ? Math.max(2, Math.ceil(sectionCount / 2)) : 3;
  try {
    const v = process?.env?.WORDAI_PARTY_BIND;
    if (v !== undefined && v !== '') partyBudget = Number(v) || 0;
  } catch {}
  const partyBindsSoFar = () => {
    let n = 0;
    for (const k of usedSentences) if (typeof k === 'string' && k.startsWith(PARTY_MARK)) n += 1;
    return n;
  };
  const shortTitle = !titleIsQuestion && countWords(section?.title) <= 6;
  const topicForFrames = shortTitle
    ? String(section?.title || '').trim()
    : (partyBudget > 0 ? questionParty() : '');
  // כשהנושא הוא שם הצד — להעדיף מסגרת שבאמת נוקבת בו. בלי ההעדפה הזאת סיפוק
  // הנושא חסר ערך: נמדד שהוא לא הזיז את הישויות מ-1/10 בכלל, כי רוב מסגרות
  // ה-claim מתעלמות מ-@topic.
  const preferTopicSlot = !shortTitle && !!topicForFrames;
  // ⚠️ **פעם אחת לסעיף.** ההעדפה נכבית ברגע שהצד נקוב, אחרת כל משפט ראיה ייפתח
  // ב"אשר לדליה" — וזה גם קורא רע וגם מייצר בדיוק את החזרתיות שכבר נמדדה
  // כמושכת את טביעת הסגנון הרחק מהמשתמש (ר' WRAP_CLAUSES).
  const partyNamed = () => !!topicForFrames
    && sentences.some((s) => String(s.text).includes(topicForFrames));
  // ההעדפה פועלת רק אם הסעיף עוד לא נקב בצד **וגם** המכסה לכל העבודה לא מוצתה.
  const topicPref = () => (preferTopicSlot && !partyNamed()
    && partyBindsSoFar() < partyBudget ? 'topic' : null);
  // ⚠️ **הנושא נמסר למסגרת רק כשההעדפה פעילה.** זה המנגנון שנמצא ב-style-diff
  // (27.7): מסירת topic קבועה הפכה את שש מסגרות הנושא ל**כשירות בכל בחירה
  // בעבודה** — המכסה הגבילה רק את ההעדפה, וההגרלה הרגילה המשיכה לשלוף אותן
  // («במקרה של יקיר» ×3 בתצורת מכסה-3, יקיר 5 פעמים). זו הסיבה שהנזק הסגנוני
  // היה בינארי: מכסה 1 ומכסה 6 נתנו אותו ציון (22), כי הכשירות לא הייתה תלויה
  // במכסה כלל. כשכותרת הסעיף קצרה (נושא אמיתי, לא שם צד) — המסירה נשארת קבועה,
  // כמו תמיד.
  const topicFor = (pref) => (shortTitle ? topicForFrames : (pref ? topicForFrames : ''));
  const basePlan = MOVE_PLANS[intent] || MOVE_PLANS.exposition;
  // תוכנית מהלכים בת-שינוי לפי פקודות.
  const plan = {
    lead: [...basePlan.lead],
    cycle: [...basePlan.cycle],
    close: [...basePlan.close],
  };
  if (cmds.has('ev_no_quotes')) {
    plan.cycle = plan.cycle.map((m) => (m === 'quote' ? 'evidence' : m));
    plan.lead = plan.lead.map((m) => (m === 'quote' ? 'evidence' : m));
  }
  if (cmds.has('ev_more_quotes') && !cmds.has('ev_no_quotes')) plan.cycle.push('quote');
  if (cmds.has('tone_concede') && !plan.cycle.includes('concede')) plan.cycle.push('concede');
  if (cmds.has('tone_contrast') && !plan.cycle.includes('contrast')) plan.cycle.push('contrast');
  if (cmds.has('tone_no_wrap')) plan.close = plan.close.filter((m) => m !== 'wrap');
  // round-4: ראיית-שקפים משתתפת רק במהלך quote (ר' nextEvidence/nextQuoteEvidence
  // למעלה) — אבל MOVE_PLANS של רוב האינטנטים (analysis/argument) לא כוללים quote
  // כברירת מחדל, ולכן בלי זה הראיה פשוט לא הייתה נגישה אף פעם. מוסיפים quote
  // למחזור רק כשיש בפועל ראיית-שקפים בסעיף — לא משנה התנהגות בסעיפים בלעדיה.
  if ((workList.some((e) => e.sourceKind === 'slides') || borderline.length)
      && !plan.cycle.includes('quote')) {
    plan.cycle.push('quote');
  }
  // A3 (round-3): claim ממחזר את משפט הראיה הראשון — עם ראיה בודדת זה כפילות
  // ריקה של אותו משפט. פותחים ישר ב-evidence כשאין ≥2 ראיות. wrap מטופל בעת
  // המהלך (דורש ≥2 מקורות שונים) כדי לא לסגור פסקה חד-מקורית ב"תמונה עקבית".
  if (workList.length < 2) plan.lead = plan.lead.map((m) => (m === 'claim' ? 'evidence' : m));
  // סעיף ללא ראיה עברית — מסלול ציטוטים בלבד. claim/evidence שואבים מ-workList
  // הריק וממילא היו נכשלים; כאן זה מפורש.
  if (quoteOnlySection) {
    plan.lead = ['quote'];
    plan.cycle = ['quote'];
    plan.close = [];
  }
  const terms = [
    ...(Array.isArray(section?.mustMention) ? section.mustMention : []),
    ...(Array.isArray(section?.keywords) ? section.keywords : []),
  ].map((t) => String(t || '').trim()).filter(Boolean);

  const lenFactor = cmds.has('len_brief') ? 0.5 : cmds.has('len_short') ? 0.7 : cmds.has('len_expand') ? 1.3 : 1;
  // ראיה גבולית תורמת משפט ציטוט אחד — נספרת ביעד כדי שהמחזור לא ייעצר לפניה.
  const evidenceBudget = workList.length + borderline.length;
  const targetWords = Math.round((quotaWords > 0 ? quotaWords : Math.min(220, evidenceBudget * 45)) * lenFactor);
  const usedSentences = sharedUsedSentences instanceof Set ? sharedUsedSentences : new Set();
  // מה שנוסף בריצה הזו בלבד — מאפשר ל-composeSectionProseBest להריץ וריאנטים על
  // עותקים ולמזג ל-Set המשותף רק את משפטי הווריאנט הזוכה.
  const addedSentences = [];
  // ⚠️ **שני המפתחות.** הגולמי — כי מסלול הניסוח בודק `usedSentences.has(rw)`
  // על הטקסט כמו שהוא; והמנורמל — כי `pickCoreSentence` מחפש בלי סימן הסיום.
  // שמירת אחד בלבד היא בדיוק הבאג שהפיל את no-cross-dup.
  // ⚠️ **שני המפתחות, ובשני המקומות.** הגולמי — כי מסלול הניסוח בודק
  // `usedSentences.has(rw)` על הטקסט כמו שהוא; המנורמל — כי `pickCoreSentence`
  // מחפש בלי סימן הסיום. ו-`addedSentences` הוא מה שמתמזג חזרה לסט המשותף בין
  // הסעיפים (ר' composeSectionProseBest), ולכן דחיפת הגולמי בלבד לשם השאירה את
  // הדה-דופ החוצה-סעיפים עיוור בדיוק כמו קודם.
  let dedupStrict = true;
  try { if (process?.env?.WORDAI_DEDUP_STRICT === '0') dedupStrict = false; } catch {}
  const markUsed = (s) => {
    const key = normSentenceKey(s);
    usedSentences.add(s);
    addedSentences.push(s);
    if (dedupStrict && key !== s) { usedSentences.add(key); addedSentences.push(key); }
  };
  const avoidFrames = new Set();
  const sentences = [];
  const notes = [];
  const usedEvidenceIds = [];
  let evidenceIdx = 0;
  let wordCount = 0;
  let step = 0;
  // המקור של הציטוט האחרון — שומר-סף ל"שם" (ibid.). ר' case 'quote'.
  let lastQuoteMaterialId = null;
  // הראיה שנצרכה לאחרונה — מאפשרת מהלך ניסוח שני מאותו מקור לפני שמתקדמים.
  let lastEv = null;
  // האם נותר ניסוח-מסקנה ("#2") שטרם נצרך לראיה האחרונה. נבדק גם בתנאי הלולאה:
  // בלי זה, ברגע ש-evidenceIdx הגיע לסוף הרשימה הלולאה נעצרת והמהלך השני של
  // הראיה האחרונה נזרק — מה שהגביל את התוספת ל-18 מילים בלבד.
  // עטיפת משפטים מנוסחים במסגרות המשתמש — לסירוגין. ניתן לכיבוי לצורך מדידה.
  const frameRewrites = globalThis.__WORDAI_FRAME_REWRITES !== 0;
  let rewrittenFramed = 0;
  const stripFinalPeriod = (s) => String(s || '').replace(/\s*[.。]\s*$/, '');
  const hasPendingRewrite = () => {
    if (!lastEv || !rewrites) return false;
    const t = rewrites[`${evId(lastEv)}#2`];
    return Boolean(t && !usedSentences.has(t));
  };

  // round-4: ראיית-שקפים (sourceKind='slides') מותרת רק במהלך quote — תבליט
  // אינו פסוקית מדווחת. nextEvidence (המשמש claim/evidence/explain/contrast/
  // concede) מדלג עליה ושומר אותה בתור נפרד לציטוט, בלי לאבד אותה ובלי לספור
  // אותה פעמיים. quote מרוקן קודם את התור הזה, ורק אז פונה לתור הרגיל.
  // תור "ציטוט בלבד": ראיות שאסור להן להופיע כפרוזה מדווחת בקול המנוע, אך כן
  // כציטוט מיוחס. שני מקורות — תבליטי שקפים (round-4) וראיות גבוליות (החלון המת).
  const quoteOnlyQueue = [...borderline];
  const nextEvidence = () => {
    while (evidenceIdx < workList.length) {
      const ev = workList[evidenceIdx];
      evidenceIdx += 1;
      if (ev.sourceKind === 'slides') { quoteOnlyQueue.push(ev); continue; }
      return ev;
    }
    return null;
  };
  // מחזיר גם *מאיפה* הראיה הגיעה: לראיה מהתור אין מסלול-נפילה לפרוזה מדווחת,
  // ולכן היא מדולגת ולא מוסבת ל-move 'evidence' (ראה case 'quote').
  const nextQuoteEvidence = () => (quoteOnlyQueue.length
    ? { ev: quoteOnlyQueue.shift(), fromQueue: true }
    : { ev: nextEvidence(), fromQueue: false });

  let partyMarked = false;   // סעיף אחד צורך יחידת מכסה אחת לכל היותר
  const emit = (result, evidenceId) => {
    if (!result) return false;
    if (KI_RE.test(result.text)) kiCount += 1;
    sentences.push({ text: result.text, move: result.move, evidenceId: evidenceId || null });
    avoidFrames.add(result.frameId);
    wordCount += countWords(result.text);
    // רישום צריכת המכסה. המפתח נכנס ל-usedSentences **ול-addedSentences**, ולכן
    // הוא מתמזג לסט המשותף ונספר גם בסעיפים הבאים (ר' composeSectionProseBest).
    if (topicForFrames && !partyMarked && String(result.text).includes(topicForFrames)) {
      partyMarked = true;
      const mark = `${PARTY_MARK}${section?.id || seedKey}`;
      usedSentences.add(mark);
      addedSentences.push(mark);
    }
    return true;
  };

  // ---------- אכיפת התפלגות "כי" ----------
  // הוספת מסגרות חלופיות (grammar v2) היא תנאי הכרחי ולא מספיק: הבורר עדיין
  // יכול לבחור שוב ושוב את מסגרות ה"כי". נמדד מול הכתיבה של המשתמש —
  // «כי » z+5.94, כלומר צפיפות חריגה בעליל.
  //
  // הגישה: לא איסור אלא **תקרה**. עד KI_MAX_SHARE מהמשפטים רשאים לשאת "כי";
  // מעבר לכך המסגרת שנבחרה נדחית ומנסים אחרת. אם כל האפשרויות נושאות "כי" —
  // מחזירים את הראשונה, כי משפט עם "כי" עדיף על היעדר משפט.
  const KI_MAX_SHARE = 0.35;
  const KI_RE = /(?:^|\s)כי(?:\s|$)/;
  let kiCount = 0;
  const composeVaried = (move, content, opts) => {
    const localAvoid = new Set(opts.avoid || []);
    // מקור בלי שם מחבר אמיתי — פוסלים את המסגרות שמשתלות אותו בתוך המשפט.
    // ההפניה נשארת בסוגריים, שם שם-מסמך הוא ניסוח תקין.
    if (opts.genericSource) for (const id of AUTHOR_FRAME_IDS) localAvoid.add(id);
    let first = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const r = composeMoveSentence(move, content, { ...opts, avoid: localAvoid });
      if (!r) break;
      if (!first) first = r;
      if (!KI_RE.test(r.text)) return r;
      // המשפט הבא יהיה ה-(sentences.length+1); בודקים מול היעד אחריו.
      if ((kiCount + 1) / (sentences.length + 1) <= KI_MAX_SHARE) return r;
      localAvoid.add(r.frameId);
    }
    return first;
  };

  const doMove = (move) => {
    step += 1;
    const sk = `${seedKey}|${step}`;
    switch (move) {
      case 'claim': {
        // פסוקית פתיחה מעוגנת: הליבה של הראיה החזקה ביותר, מדווחת כטענת הפרק.
        // round-4: לא ראיית-שקפים — תבליט אינו פסוקית-דיווח (וגם היה נכשל
        // ב-looksLikeProse בשקט). הטענה הפותחת חייבת פרוזה אמיתית.
        // ⚠️ סורקים את **כל** הראיות, לא רק את הראשונה. הגרסה הקודמת לקחה את
        // הראיה הראשונה שאינה שקפים ונעלה עליה: אם דווקא בה לא היה משפט הנוגע
        // לסעיף, הטענה הפותחת נבנתה מקטע לא-רלוונטי — בזמן שראיה שנייה ברשימה
        // הכילה בדיוק את המשפט הנכון. עכשיו השער (requireTerm) בורר, והסריקה
        // נותנת לו על מה לעבוד.
        let ev = null;
        let clause = null;
        for (const cand of workList) {
          if (cand.sourceKind === 'slides') continue;
          const c = pickCoreSentence(cand.text, {
            terms, used: usedSentences, requireTerm: true, rejectAnaphor: true,
          });
          if (c) { ev = cand; clause = c; break; }
        }
        // אף ראיה לא נגעה במונחי הסעיף ⇒ **מדלגים על הטענה הפותחת**. הסעיף ייפתח
        // בראיה עצמה (המחזור ממשיך כרגיל). פתיחה לא-רלוונטית גרועה מאין-פתיחה.
        if (!clause) return false;
        markUsed(clause);
        const eid = evId(ev); if (eid && !usedEvidenceIds.includes(eid)) usedEvidenceIds.push(eid);
        const claimPref = topicPref();
        return emit(composeVaried('claim', { clause, topic: topicFor(claimPref) },
          { seedKey: sk, profile, avoid: avoidFrames, preferSlot: claimPref }), evId(ev));
      }
      case 'wrapOpen':
      case 'wrap': {
        // משפט מטא — על הראיות שהוצגו, לא על העולם. נוצר רק אם הוצג משהו.
        if (!usedEvidenceIds.length) return false;
        // חיפוש ב-list ולא ב-workList: ראיה שהובאה כציטוט (זרה/גבולית) אינה
        // ב-workList, ובלי זה שמה נשמט מהמשפט המסכם.
        const names = [...new Set(usedEvidenceIds
          .map((id) => list.find((e) => evId(e) === id))
          .filter(Boolean)
          .map((e) => authorFromSource(e.sourceTitle)))].slice(0, 3);
        // A3 (round-3): סוגר רק כשיש ≥2 מקורות שונים לסכם ("מצביעים יחד"). מקור
        // בודד ⇒ אין מה לסכם, ו"מרכזים את עיקר הידוע" היה ריפוד חלול — מדלגים.
        if (names.length < 2) return false;
        // ⚠️ **לא מרפדים סעיף דל.** נמדד: אחרי שערי הכנות sec_6 נשאר עם מעט
        // משפטי תוכן, ומשפט סיכום עליהם הקפיץ את יחס הפיגום מעל התקציב — כלומר
        // שליש מהסעיף היה מטא-טקסט על שני משפטים. סעיף שאין בו מה לסכם מדווח
        // על החוסר (הערת "דרוש מקור נוסף") במקום להתנפח.
        if (sentences.filter((s) => s.evidenceId).length < 3) return false;
        // ⚠️ הפסוקית הייתה **מחרוזת קבועה אחת**, ולכן אותו משפט סיכום מילה-במילה
        // חזר בכל סעיף בעבודה. נמדד: חמש חזרות זהות משכו את טביעת הסגנון —
        // «המק» «קרו» «ורו» (מתוך "המקורות שנסקרו") היו התכונות שהכי הרחיקו את
        // הפלט מהמשתמש. המסגרת התחלפה; הפסוקית לא.
        const WRAP_CLAUSES = [
          (n) => `העולה מן המקורות (${n}) מצביע על מגמה אחידה בסוגיה`,
          (n) => `הדברים המובאים אצל ${n} משלימים זה את זה`,
          (n) => `הן ${n} מצביעים על אותו כיוון פרשני`,
          (n) => `קריאת המקורות (${n}) יחד מלמדת על עמדה עקבית`,
          (n) => `בין המקורות (${n}) לא נמצאה סתירה של ממש`,
        ];
        const nameStr = names.join('; ');
        const clause = WRAP_CLAUSES[hashPick(`${seedKey}|wrap|${step}`, WRAP_CLAUSES.length)](nameStr);
        return emit(composeVaried('wrap', { clause },
          { seedKey: sk, profile, avoid: avoidFrames }), null);
      }
      case 'evidence':
      case 'contrast':
      case 'concede':
      case 'explain': {
        // ⚠️ לא מקדמים את מצביע הראיות כל עוד לראיה הנוכחית נותר מהלך ניסוח
        // שטרם נוצל. בלי זה nextEvidence עובר לראיה הבאה והמהלך השני ("#2")
        // לעולם לא נצרך — הראיות נגמרות לפני שהמשפטים שלהן נוצלו.
        const ev = hasPendingRewrite() ? lastEv : nextEvidence();
        if (!ev) return false;
        lastEv = ev;

        // ---------- מסלול הניסוח ----------
        // ⚠️ המשפט המנוסח נפלט **כמו שהוא**, בלי מסגרת. המסגרות קיימות כדי
        // להפוך משפט מקור מועתק לפרוזה מדווחת; משפט שכבר נוסח מחדש ומיישם את
        // הכלל על המקרה אינו זקוק לעטיפה, ועטיפה הייתה מוסיפה בדיוק את מילות
        // הפיגום שהמדד סימן ("מן החומר עולה כי…").
        // שני מהלכים לכל ראיה: המפתח הבסיסי ואז "#2". הראשון שטרם נוצל נבחר,
        // כך שהמהלך השני נצרך רק אחרי שהראשון כבר בפסקה.
        const rwKeys = [evId(ev), `${evId(ev)}#2`];
        const rw = rewrites && rwKeys.map((kk) => rewrites[kk]).find((t) => t && !usedSentences.has(t));
        if (rw && !usedSentences.has(rw)) {
          markUsed(rw);
          const eid0 = evId(ev); if (eid0 && !usedEvidenceIds.includes(eid0)) usedEvidenceIds.push(eid0);
          // ⚠️ הכרעה שנמדדה: מסלול הכללים מגיע לסגנון 55 ומסלול הניסוח ל-35 על
          // אותה מטלה — המסגרות שנכרו מהעבודות של המשתמש הן מה שנשמע כמוהו,
          // והמשפט המנוסח הוא מה שעונה על השאלה. frameRewrites מחבר: התוכן מן
          // המודל, המסגרת מן המשתמש. חלק מהמשפטים נשארים חשופים כדי שאחוז
          // הפיגום לא יטפס בחזרה.
          if (frameRewrites && (rewrittenFramed % 2 === 0)) {
            rewrittenFramed += 1;
            const rwPref = topicPref();
            const framed = composeVaried(move === 'explain' ? 'evidence' : move, {
              clause: stripFinalPeriod(rw),
              author: authorFromSource(ev.sourceTitle),
              cite: citeFromEvidence(ev),
              topic: topicFor(rwPref),
            }, {
              seedKey: sk, profile, avoid: avoidFrames,
              genericSource: !looksLikeAuthorCitation(ev.sourceTitle),
              preferSlot: rwPref,
            });
            if (framed) return emit({ ...framed, frameId: `rw:${framed.frameId}` }, evId(ev));
          }
          rewrittenFramed += 1;
          const cite = citeFromEvidence(ev);
          const text = /[.!?]$/.test(rw) ? `${rw.slice(0, -1)} ${cite}.` : `${rw} ${cite}.`;
          return emit({ text, frameId: 'rewritten', move }, evId(ev));
        }

        // ⚠️ אנפורה נפסלת בשני מצבים, ולא רק באחד:
        //   · המשפט הראשון בסעיף — אין לפניו מה שיעגן אותה.
        //   · **כשמסגרת צד עומדת להקדים אותה.** נמדד: «במקרה של יקיר, זאת עמדה
        //     שמתבטאת בלשונם של חוק הגנת הפרטיות…» — הכינוי הרומז היה מעוגן
        //     במשפט הקודם, אבל המסגרת דוחפת אותו אחרי פסיק ומנתקת אותו ממנו.
        //     זו הסיבה שהגרסה שהוגבלה לפתח הסעיף בלבד לא הספיקה.
        // ⚠️ אנפורה נפסלת **תמיד**, לא רק בפתח הסעיף. הגרסה שהוגבלה לפתח נבחרה
        // כשהפסילה הגורפת עלתה 935→797 מילים — אבל זה נמדד ב-k=6. עם k=10 יש
        // מספיק חומר, והמשפטים האלה נשארו פגומים גם באמצע פסקה: המסגרת מדביקה
        // אותם אחרי ש' («במקור צוין ש**זאת עמדה ש**מתבטאת…»), והכינוי הרומז
        // מפנה למה שהיה במקור — לא למה שהמנוע כתב.
        const clause = pickCoreSentence(ev.text, {
          terms, used: usedSentences, rejectAnaphor: true,
        });
        if (!clause) return false;
        markUsed(clause);
        const eid = evId(ev); if (eid && !usedEvidenceIds.includes(eid)) usedEvidenceIds.push(eid);
        const evPref = topicPref();
        const content = {
          clause,
          author: authorFromSource(ev.sourceTitle),
          cite: citeFromEvidence(ev),
          topic: topicFor(evPref),
        };
        // explain בלי ראיה משלו היה מדווח-כפול; כשיש ראיה — הוא פשוט מסגור
        // רך יותר לאותה ראיה ("הדבר מלמד כי..."), עדיין עם מראה מקום.
        const moveForFrame = move === 'explain' ? 'evidence' : move;
        const r = composeVaried(moveForFrame, content, {
          seedKey: sk, profile, avoid: avoidFrames,
          genericSource: !looksLikeAuthorCitation(ev.sourceTitle),
          preferSlot: evPref,
          // פסוקית שפותחת בהפניה אחורה אינה יכולה לקבל מסגרת צד: «במקרה של
          // יקיר, זאת עמדה ש…» מנתק את הכינוי הרומז ממה שעיגן אותו.
          avoidSlot: DANGLING_ANAPHOR_RE.test(clause) ? 'topic' : null,
        });
        // מסגרות contrast/concede לא נושאות @cite — מוסיפים את מראה המקום ידנית.
        if (r && (move === 'contrast' || move === 'concede') && !r.text.includes('(')) {
          r.text = r.text.replace(/\.$/, ` ${citeFromEvidence(ev)}.`);
        }
        return emit(r, evId(ev));
      }
      case 'quote': {
        // round-4: תור-השקפים קודם (evidence שאסור לה להשתתף כפרוזה מדווחת,
        // אבל כן כציטוט ישיר) — ורק אחריו התור הרגיל.
        const { ev, fromQueue } = nextQuoteEvidence();
        if (!ev) return false;
        const isSlide = ev.sourceKind === 'slides';
        // ⚠️ כל מה שמגיע מתור הציטוט עובר ב-pickQuoteFragment, לא רק שקפים.
        // pickCoreSentence חותך ל-MAX_CLAUSE_WORDS, שגדול מ-QUOTE_MAX_WORDS —
        // ולכן ציטוט תקין נפסל מיד אחר כך כ"ארוך מדי", ולראיה מהתור אין מסלול
        // נפילה. נמדד על המטלה האמיתית: sec_2 ו-sec_6 נחסמו כך למרות שהיו להן
        // ראיות. pickQuoteFragment חותך למידת הציטוט מלכתחילה.
        const quoteSentence = (isSlide || fromQueue)
          ? pickQuoteFragment(ev.text, { terms, used: usedSentences })
          : pickCoreSentence(ev.text, { terms, used: usedSentences });
        if (!quoteSentence || countWords(quoteSentence) > QUOTE_MAX_WORDS) {
          // ראיה מהתור (שקפים / גבולית) — אין לה מסלול-נפילה לפרוזה מדווחת.
          // ⚠️ בלי התנאי הזה ההסבה ל-'evidence' הייתה מושכת מ-workList עם
          // evidenceIdx מוקטן, כלומר משכפלת ראיה שכבר נוצלה.
          if (fromQueue) return false;
          // ארוך מדי לציטוט ישיר — נדווח כראיה רגילה במקום.
          evidenceIdx -= 1;
          return doMove('evidence');
        }
        markUsed(quoteSentence);
        const eid = evId(ev); if (eid && !usedEvidenceIds.includes(eid)) usedEvidenceIds.push(eid);
        // ⚠️ 'q_direct' פותחת ב"וכך נאמר **שם**" — ibid., כלומר הפניה למקור של
        // המשפט הקודם. נמדד בפלט אמיתי: הציטוט הקודם היה של Walker והנוכחי של
        // Wang, וה"שם" ייחס את Wang ל-Walker. זו הפניה כוזבת, בדיוק הכשל שהמסלול
        // הזה קיים כדי למנוע. המסגרת מותרת רק כשהמקור באמת זהה לקודם.
        const avoidHere = new Set(avoidFrames);
        if (lastQuoteMaterialId !== ev.materialId) avoidHere.add('q_direct');
        lastQuoteMaterialId = ev.materialId;
        return emit(composeVaried('quoteIntro', {
          quote: quoteSentence,
          author: authorFromSource(ev.sourceTitle),
          cite: citeFromEvidence(ev),
        }, {
          seedKey: sk, profile, avoid: avoidHere,
          genericSource: !looksLikeAuthorCitation(ev.sourceTitle),
        }), evId(ev));
      }
      case 'transition':
        return emit(composeMoveSentence('transition', { topic: topicForFrames },
          { seedKey: sk, profile, avoid: avoidFrames }), null);
      default:
        return false;
    }
  };

  for (const m of plan.lead) doMove(m);

  // מחזור עד מכסה או עד גמר הראיות. שומר-עצירה כפול — בלי לולאה אינסופית.
  let guard = 0;
  while (wordCount < targetWords
    && (evidenceIdx < workList.length || quoteOnlyQueue.length || hasPendingRewrite())
    && guard < 40) {
    for (const m of plan.cycle) {
      guard += 1;
      if (wordCount >= targetWords) break;
      doMove(m);
    }
  }

  for (const m of plan.close) doMove(m);

  if (!sentences.length) return null;

  // ---------- התאמה מבנית לסגנון המשתמש ----------
  // מעבר דטרמיניסטי אחרון: פיצול משפטים ארוכים והוספת פסיקים במשמורות שנמדדו
  // אצל המשתמש. אינו כותב מילים ואינו נוגע בציטוטים/הפניות, ולכן אינו יכול
  // להוריד עיגון או לייצר ג'יבריש (ר' styleFitService).
  //
  // ⚠️ כאן ולא בקורא: composeSectionProseBest מנקד וריאנטים, ומנקוד על טקסט שאינו
  // מה שיישלח למשתמש הוא ניקוד של הדבר הלא נכון — אותה תקלה שהתגלתה ביולי כשהבנצ'
  // מדד מסלול אחר מזה שהמוצר הריץ.
  // ⚠️ הסטטיסטיקה חוזרת כ-`fitStats` ו**אינה** נכנסת ל-notes: notes מרונדרים
  // לתוך ה-HTML של הסעיף, כלומר לתוך המסמך שהמשתמש מגיש. שם מקומן של אזהרות
  // ("דרוש מקור נוסף"), לא של מונה פסיקים.
  const fitResult = fitSentencesToStyle(sentences, styleTargets);
  const outSentences = fitResult.sentences;

  if (workList.some((e) => e.focused)) {
    notes.push('[הראיות נבחרו בדירוג יחסי בתוך קורפוס ממוקד ולא בסף מוחלט — כדאי לאמת מול המקור]');
  }
  if (quoteOnlySection) {
    notes.push('[אין בחומרים מקור בעברית לסעיף זה — הובאו ציטוטים מיוחסים בשפת המקור. גוף הסעיף דורש ניסוח או תרגום]');
  }
  if (quotaWords > 0 && wordCount < quotaWords * 0.6) {
    notes.push(`[דרוש מקור נוסף — החומר הקיים מספיק לכ-${wordCount} מילים מתוך ${quotaWords}]`);
  }

  // פסקאות: 2-4 משפטים, מעבר פסקה אחרי wrap/transition או כל 3 משפטים.
  // עם פרופיל סגנון היעד נגזר מהמשתמש (חציון 2.54 בקורפוס שנמדד) — וגודל קבוע
  // אינו יכול לפגוע ביעד לא-שלם, ולכן שם עובר הקיבוץ ל-groupParagraphs.
  const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const paraSize = cmds.has('st_short_paras') ? 2 : 3;
  const paraTarget = !cmds.has('st_short_paras') && styleTargets?.paraSents ? styleTargets.paraSents : null;
  const paragraphs = paraTarget ? groupParagraphs(outSentences, paraTarget) : [];
  if (!paraTarget) {
    let current = [];
    for (const s of outSentences) {
      current.push(s.text);
      if (current.length >= paraSize || s.move === 'wrap' || s.move === 'transition') {
        paragraphs.push(current.join(' '));
        current = [];
      }
    }
    if (current.length) paragraphs.push(current.join(' '));
  }

  // A4 (round-3): ציטוט כהערת-שוליים ולא בסוגריים inline. המטלה דורשת הערות
  // שוליים. ה-HTML בלבד — draft.txt שומר את הציטוט הקריא בתוך sentence.text.
  // התאמה על מחרוזת-הציטוט המדויקת שאנחנו הפקנו (citeFromEvidence), לא regex
  // גנרי של סוגריים — כדי לא לגעת בסוגריים לגיטימיים בטקסט. סימון <sup>[N]</sup>
  // מתדרדר בחן ל-"[N]" אם TipTap מסנן sup. עמוד חסר ⇒ "עמ' [חסר]".
  let bodyHtml = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
  const footnotes = [];
  const citeToNum = new Map();
  for (const id of usedEvidenceIds) {
    const ev = workList.find((e) => evId(e) === id);
    if (!ev) continue;
    const citeStr = escapeHtml(citeFromEvidence(ev));
    if (!bodyHtml.includes(citeStr)) continue;
    let num = citeToNum.get(citeStr);
    if (!num) {
      const page = ev.pageHint ? `, עמ' ${ev.pageHint}` : `, עמ' [חסר]`;
      footnotes.push(`${authorFromSource(ev.sourceTitle)}${page} — ${ev.sourceTitle}`);
      num = footnotes.length;
      citeToNum.set(citeStr, num);
    }
    bodyHtml = bodyHtml.split(citeStr).join(`<sup>[${num}]</sup>`);
  }
  const notesHtml = footnotes.length
    ? `<hr /><p><strong>הערות שוליים</strong></p>${footnotes.map((n, i) => `<p><em>[${i + 1}] ${escapeHtml(n)}</em></p>`).join('')}`
    : '';
  const html = bodyHtml
    + notesHtml
    + notes.map((n) => `<p><em>${escapeHtml(n)}</em></p>`).join('');

  return {
    sentences: outSentences, html, wordCount, notes, usedEvidenceIds,
    usedSentenceKeys: addedSentences, fitStats: fitResult.stats,
  };
}

/**
 * לולאת האיכות (Phase 5): מרכיב כמה וריאנטים (seedKey שונה ⇒ מסגרות/סדר שונים)
 * ובוחר את זה שנשמע הכי פחות גנרי לפי פונקציית ניקוד מוזרקת.
 *
 * scoreFn מוזרק ולא מיובא כדי שהמודול יישאר LEAF; בפועל מעבירים את
 * styleAuthenticityService.scoreTextAuthenticity — ציון 0-100, נמוך=אנושי יותר.
 *
 * @param {object} section
 * @param {Array<object>} evidence
 * @param {object} opts  כמו composeSectionProse
 * @param {{scoreFn?:function, variants?:number}} quality
 */
export function composeSectionProseBest(section, evidence, opts = {}, { scoreFn = null, variants = 3 } = {}) {
  const baseSeed = opts.seedKey || section?.id || 'section';
  // הדה-דופ החוצה-סעיפים (sharedUsedSentences) לא מוזן ישירות לווריאנטים: וריאנט
  // ראשון היה "צורך" את המשפטים והשאר היו נבנים מהשאריות. כל וריאנט רץ על עותק,
  // ורק משפטי הזוכה נרשמים ל-Set המשותף.
  const shared = opts.sharedUsedSentences instanceof Set ? opts.sharedUsedSentences : null;
  let best = null;
  let bestScore = Infinity;
  for (let v = 0; v < Math.max(1, variants); v += 1) {
    const variantOpts = {
      ...opts,
      seedKey: `${baseSeed}#${v}`,
      sharedUsedSentences: shared ? new Set(shared) : null,
    };
    const r = composeSectionProse(section, evidence, variantOpts);
    if (!r) continue;
    if (!scoreFn) { best = r; break; }   // בלי מנקד — הווריאנט הראשון התקין
    let score = 50;
    try {
      const plain = r.sentences.map((s) => s.text).join(' ');
      const scored = scoreFn(plain);
      score = Number(scored?.score ?? scored ?? 50);
    } catch { /* ניקוד נכשל — ניקוד ניטרלי */ }
    if (score < bestScore) { bestScore = score; best = { ...r, authenticityScore: score }; }
  }
  if (best && shared && Array.isArray(best.usedSentenceKeys)) {
    best.usedSentenceKeys.forEach((s) => shared.add(s));
  }
  return best;
}

export { ensureSentenceGrammarReady as ensureProseReady };
