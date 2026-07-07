// chatScope.js — סיווג כוונת הודעת צ'אט, כדי שהסיידבר יתפקד גם כעוזר כללי מלא
// (תחליף לקפיצה לג'ימיני) ולא רק ככלי צמוד-מסמך.
//
// שלושה מסלולים:
//   'document'          — שאלה/פעולה על המסמך הפעיל. התנהגות היסטורית: הקשר מסמך,
//                         סוכנים, חוקי workspace. ברירת מחדל בטוחה כשלא ברור.
//   'general-knowledge' — שאלת ידע כללית שלא קשורה למסמך ("מה ההבדל", "תסביר").
//                         בלי זיהום מסמך, פרסונה ניטרלית, web לשאלות עדכניות, בלי לחץ סגנון.
//   'general-writing'   — בקשת כתיבה עצמאית ("תכתוב מייל/הודעה/פוסט"). בלי הקשר מסמך,
//                         אבל סגנון אישי מקסימלי.
//
// עיקרון שמרני: מחזירים 'document' כברירת מחדל כשיש אות מסמך או ספק — כדי לא לשבור
// את הזרימות הקיימות. עוברים לכללי רק כשהאות ברור.

// אות שהשאלה מתייחסת למסמך/לטקסט הנוכחי.
const DOC_REFERENTIAL_PATTERN = /(?:פסקה|פיסקה|במסמך|בעבודה|בטקסט|הטקסט\s+הזה|הקטע\s+הזה|הסעיף|הפרק\s+הזה|למעלה|הזה\s+שכתבתי|מה\s+שכתבתי|שכתבתי|הטיוטה|הנוסח|שבחרתי|הבחירה\s+שלי|this\s+(?:paragraph|text|section|draft)|the\s+(?:paragraph|section|draft)\s+above)/iu;

// בקשת כתיבה עצמאית: פועל-כתיבה + ז'אנר שאינו מסמך אקדמי.
const WRITE_VERB_PATTERN = /(?:תכתוב|כתוב|תכתבי|כתבי|נסח|תנסח|נסחי|תכין|הכן|תכיני|תחבר|חבר|תעזור\s+לי\s+לכתוב|נסח\s+לי|תמציא|תייצר|צור\s+לי|write|draft|compose|help\s+me\s+write)/iu;
const WRITE_GENRE_PATTERN = /(?:מייל|אימייל|דוא"?ל|הודעה|וואטסאפ|וואצאפ|whatsapp|sms|פוסט|סטטוס|טוויט|ציוץ|לינקדאין|linkedin|מכתב|נאום|דבר\s+פתיחה|ברכה|ברכת|הזמנה|קורות\s+חיים|cv|תיאור|באנר|כותרת\s+שיווקית|קופי|copy|תגובה\s+ל|email|message|post|tweet|letter|speech|caption|bio)/iu;

// שאלת ידע/הסבר כללית.
const KNOWLEDGE_QUESTION_PATTERN = /(?:^|\s)(?:מה\s+(?:זה|זו|ההבדל|המשמעות|הכוונה|קורה|היה)|מהו|מהי|מהם|למה|מדוע|איך|כיצד|מתי|היכן|איפה|מי\s+(?:זה|היה|הוא|ניצח|כתב|המציא)|כמה\s+עולה|תסביר|הסבר|תשווה|השווה|תן\s+לי\s+דוגמ|ספר\s+לי\s+על|מה\s+דעתך|what\s+(?:is|are|was)|why|how\s+(?:do|does|to)|when|where|who|explain|compare|tell\s+me\s+about)/iu;

// אות שהשאלה תלוית-זמן ודורשת מידע עדכני מהרשת.
const TIME_SENSITIVE_PATTERN = /(?:היום|עכשיו|כרגע|השנה|החודש|השבוע|האחרונ|לאחרונה|עדכני|עדכנ|נכון\s+ל|בימים\s+אלה|כעת|מזג\s+האוויר|מזג\s+אוויר|שער\s+ה?(?:דולר|יורו|מטבע)|מחיר\s+ה?(?:דולר|ביטקוין|נפט|זהב)|חדשות|מי\s+ניצח|מי\s+זכה|תוצאות\s+ה?(?:משחק|בחירות|הגרלה)|כמה\s+עולה\s+היום|today|right\s+now|currently|latest|recent(?:ly)?|this\s+(?:week|month|year)|current\s+(?:price|weather)|breaking|who\s+won)/iu;

// בקשה מפורשת שהתוצר יישמע בקול האישי של המשתמש.
const EXPLICIT_STYLE_LOOP_PATTERN = /(?:כמו\s+ש?אני(?:\s+כותב|\s+מדבר)?|בסגנון\s+שלי|בקול\s+שלי|שיישמע\s+כמו(?:ני|\s+שאני)|כאילו\s+אני\s+כתבתי|שיהיה\s+ב?סגנון\s+ה?אישי|תעשה\s+שיישמע\s+כמוני|like\s+(?:me|i\s+(?:write|wrote))|in\s+my\s+(?:voice|style))/iu;

export const isTimeSensitiveQuery = (text = '') => TIME_SENSITIVE_PATTERN.test(String(text || ''));
export const isExplicitStyleLoopRequest = (text = '') => EXPLICIT_STYLE_LOOP_PATTERN.test(String(text || ''));

export const classifyChatScope = (promptText = '', {
  hasSelection = false,
  hasCurrentBlock = false,
  hasDocument = false,
  activeAgentId = '',
  isEditComposerMode = false,
} = {}) => {
  const text = String(promptText || '').trim();
  const isTimeSensitive = isTimeSensitiveQuery(text);
  const explicitStyleLoop = isExplicitStyleLoopRequest(text);
  const result = (scope) => ({ scope, isTimeSensitive, explicitStyleLoop });

  // מצב עריכה או סוכן מפורש (מרצה/מקורות/וכו') — תמיד מסמך. לא נוגעים בזרימות הקיימות.
  if (isEditComposerMode || activeAgentId) return result('document');
  if (!text) return result('document');

  // התייחסות מפורשת למסמך/טקסט נבחר — מסמך.
  if (DOC_REFERENTIAL_PATTERN.test(text)) return result('document');
  // בחירה/פסקה פעילה + שאלה קצרה ("נראה ארוך אה?") — כנראה על הטקסט. שמרני.
  if ((hasSelection || hasCurrentBlock) && text.length <= 60 && !WRITE_GENRE_PATTERN.test(text)) {
    return result('document');
  }

  const looksWriting = WRITE_VERB_PATTERN.test(text) && WRITE_GENRE_PATTERN.test(text);
  const looksKnowledge = KNOWLEDGE_QUESTION_PATTERN.test(text);

  if (looksWriting) return result('general-writing');
  if (looksKnowledge) {
    // שאלת ידע כשאין מסמך פתוח — ודאי כללי. יש מסמך — עדיין כללי אם אין אות התייחסות
    // (כבר שללנו DOC_REFERENTIAL), כי "מה ההבדל בין X ל-Y" לא צריך את המסמך.
    return result('general-knowledge');
  }

  // אין אות ברור. אם אין מסמך פתוח ואין בחירה — אין למה לצמוד; ברירת מחדל כללית.
  if (!hasDocument && !hasSelection && !hasCurrentBlock) {
    return result('general-knowledge');
  }
  // אחרת — שמרני, מסמך.
  return result('document');
};
