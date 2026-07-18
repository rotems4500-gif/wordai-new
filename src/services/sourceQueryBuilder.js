// sourceQueryBuilder.js — בוני שאילתת-האחזור לסוכני 'מקורות' ו'מילוי חורים'.
//
// חולצו מ-AiSidebar.jsx כדי שקובץ הבדיקה (tools/test-bench / vite.verify) יריץ
// *בדיוק* את אותו קוד שהאפליקציה מריצה — מקור-אמת יחיד, בלי דריפט. AiSidebar עוטף
// אותם ב-wrappers דקים שמזריקים את מצב הרכיב (selectedText / currentBlockText / messages).
//
// טהורים לחלוטין: כל תלות במצב מגיעה דרך הפרמטר השני. אין גישה ל-DOM/React/window.

// "מצא לי 3 מקורות אקדמיים על X" → מחזיר את הנושא הנקי בלבד. משמש כ-sourceQueryOverride
// שנשלח ל-chatWithActiveProvider עבור סוכן 'מקורות'.
import { isSourceReuseOrIntegrationRequest } from './sourceIntent';

export const buildSourcesQueryOverride = (promptText = '', { selectedText = '', currentBlockText = '' } = {}) => {
  if (isSourceReuseOrIntegrationRequest(promptText)) return '';
  const genericInstructionPattern = /(?:מצא|חפש|אתר|תן|תביא|הבא)\s+(?:לי\s+)?(?:מקורות|כתבות|מאמרים|קישורים|לינקים|sources?|articles?|references?|links?)[^:\n.]*[:.]?/gi;
  const quotedTextMatch = String(promptText || '').match(/"([^"]{12,1600})"/);
  const cleanCandidate = (value = '') => String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(genericInstructionPattern, ' ')
    .replace(/אם\s+(?:הבקשה|נדרש)[^.]*?(?:חדשות|חדשותי)[^.]*[.]?/gi, ' ')
    .replace(/אחרת\s+העדף[^.]*[.]?/gi, ' ')
    .replace(/(?:אל\s+תמציא|בלי\s+להמציא|לא\s+להמציא)[^.:\n]*(?:URLs?|כותרות|מקורות|מאמרים|כתבות)?/gi, ' ')
    .replace(/^(?:טקסט\s+נבחר|פסקה\s+נוכחית|מסמך\s+פעיל)\s*[:：]?/gim, ' ')
    .replace(/^[\s"'“”״׳:;,.!?()-]+|[\s"'“”״׳:;,.!?()-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // עיקרון "מה שכתבת זה מה שנשלח": טקסט בגרשיים בבקשה הוא הנושא המפורש ביותר;
  // אחריו — טקסט שהמשתמש סימן בעורך (סימנת שורה וביקשת מקורות ⇒ השורה היא הנושא,
  // לא ניחוש מתוך שאר הפרומפט). רק בהיעדר שניהם נופלים לפרומפט/בלוק.
  const quotedCandidate = cleanCandidate(quotedTextMatch?.[1] || '');
  const selectionCandidate = cleanCandidate(selectedText);
  if (quotedCandidate.length >= 12) return quotedCandidate.slice(0, 260).trim();
  if (selectionCandidate.length >= 12) return selectionCandidate.slice(0, 260).trim();
  const candidates = [
    quotedCandidate,
    cleanCandidate(promptText),
    selectionCandidate,
    cleanCandidate(currentBlockText),
  ].filter(Boolean);
  const preferred = candidates.find((candidate) => candidate.length >= 18 && !/^(?:מקורות|כתבות|מאמרים|sources?|articles?)\b/i.test(candidate)) || candidates[0] || '';
  if (/^(?:עבור\s+)?(?:הטענה|הנושא|המסמך|הטקסט)\b/i.test(preferred)) return '';
  return preferred.slice(0, 260).trim();
};

export const isSourcesNewsRequest = (promptText = '', queryOverride = '', { selectedText = '', currentBlockText = '' } = {}) => {
  const cleanPrompt = String(promptText || '')
    .replace(/אם\s+הבקשה\s+או\s+הטקסט\s+עוסקים\s+בכתבות\/חדשות[^.]*\./gi, ' ')
    .replace(/אם\s+נדרש\s+מקור\s+חדשותי[^.;]*[.;]?/gi, ' ');
  const combined = [cleanPrompt, queryOverride, selectedText, currentBlockText].filter(Boolean).join('\n');
  return /(?:כתבה|כתבות|ידיעה|ידיעות|כתבת\s+חדשות|אתר(?:י)?\s+חדשות|חדשות|news\s+articles?|articles?\s+from\s+news|news\s+site)/i.test(combined);
};

export const buildHoleFillSourceQueryOverride = (promptText = '', { messages = [], selectedText = '', currentBlockText = '' } = {}) => {
  if (isSourceReuseOrIntegrationRequest(promptText)) return '';
  const sourceNeedPattern = /(?:חור|חורים|חסר|להשלים|מקור|מקורות|פסיקה|פסק(?:י)?\s+דין|ספרות|אקדמ|משפט|עיתונות|דיין|לשון\s+הרע|ציטוט|אזכור)/i;
  const genericContextPattern = /^(?:מסמך\s+פעיל|מפת\s+מסמך|טקסט\s+נבחר|פסקה\s+נוכחית)\b/i;
  const priorSourceListPattern = /(?:^(?:מקורות\s+אקדמיים\s+בלבד|מקורות\s+מאומתים|תוצאות\s+Web\s+מקורקעות|הוחזרו\s+רק\s+פריטים|לא\s+הוספתי\s+מקורות)\b)|(?:^|\n)\s*(?:\d+\.\s+[^\n]{0,160})?(?:פרטי\s+פרסום|קישור|תקציר|מקור):/i;
  const cleanCandidate = (value = '') => String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/עבור\s+על\s+(?:המסמך\s+הנוכחי|הטקסט\s+הבא|הפסקה\s+או\s+המסמך\s+הנוכחי)[^\n.:]*[.:]?/gi, ' ')
    .replace(/(?:זהה\s+מה\s+חסר\s+בו|השלם\s+רק\s+את\s+החורים\s+שדורשים\s+מידע\s+מאומת\s+מהרשת|והחזר\s+נוסח\s+מעודכן\s+שמשלב\s+את\s+ההשלמות\s+בתוך\s+(?:הטקסט|המסמך))/gi, ' ')
    .replace(/(?:קריאת\s+השלמה\s+לתיקוני\s+בדיקה\s*\+\s*תיקון|בקשת\s+המשתמש|התמקד\s+רק\s+בתיקונים\s+הבאים\s+שנשארו\s+להשלמה|בדוק\s+את\s+המסמך\s+הנוכחי[^\n]*)/gi, ' ')
    .replace(/^[\s\d.):-]+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  // עיקרון "מה שכתבת זה מה שנשלח": כשהמשתמש סימן טקסט — הסימון הוא נושא ההשלמה.
  // נשלח ישירות, בלי כריית 8 הודעות אחורה (שמחזירה לפעמים נושא ישן מהשיחה).
  const selectionCandidate = cleanCandidate(selectedText);
  if (selectionCandidate.length >= 12) return selectionCandidate.slice(0, 320).trim();
  const candidates = [
    promptText,
    ...messages.slice(-8).reverse().map((message) => message?.content || ''),
    selectedText,
    currentBlockText,
  ]
    .filter((candidate) => !priorSourceListPattern.test(String(candidate || '')))
    .map(cleanCandidate)
    .filter((candidate) => candidate && sourceNeedPattern.test(candidate) && !genericContextPattern.test(candidate) && !priorSourceListPattern.test(candidate));
  const preferred = candidates.find((candidate) => /(?:מקור|מקורות|פסיקה|פסק(?:י)?\s+דין|ספרות|אקדמ|משפט|ציטוט|אזכור)/i.test(candidate)) || candidates[0] || '';
  return preferred.slice(0, 320).trim();
};

// חילוץ נושא-מחקר משותף — אותם regex כמו deriveDocumentResearchTopic ב-workspaceLearningService.js,
// לשימוש retrievalGate/SPSS/aiService בלי import מעגלי. הבדל מכוון: כשאין סימון "הנושא:" ואין
// פועל-כתיבה+"על X" — מוחזר '' (לא הטקסט המלא), כדי שה-callers ישמרו על ה-fallback הקיים שלהם.
export const deriveResearchTopicQuery = (promptText = '', instructionsText = '') => {
  let text = [String(promptText || ''), String(instructionsText || '')].filter((s) => s.trim()).join(' ').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  // הערה: אין להשתמש ב-\b סביב עברית — ב-JS regex \b הוא ASCII בלבד ולא תופס גבול-מילה עברי.
  // עדיפות: "הנושא: X" מפורש
  const explicit = text.match(/(?:^|[\s.;,])(?:ה?נושא(?:\s+(?:העבודה|המחקר|הנבחר|שלי))?)\s*[:：\-–]\s*([^\n.;]+)/i);
  if (explicit) {
    text = explicit[1];
  } else {
    // "כתוב/צור/הכן ... על X" — לוקחים מהמופע הראשון של מילת-קישור אחרי פועל-הכתיבה
    const afterVerb = text.match(/(?:כתוב|כתבי|תכתוב|צור|צרי|תצור|הכן|הכיני|תכין|נסח|תנסח|בנה|תבנה|הפק|write|draft|compose|prepare|generate|create)(?:\s[^\n]*?)?\s(?:על|בנושא|אודות|בנוגע\s+ל|בקשר\s+ל|לגבי|about|on|regarding|concerning)\s+(.+)/i);
    if (!afterVerb) return '';
    text = afterVerb[1];
  }
  // הסרת סעיפי-דרישות/מבנה נגררים (הכולל.., בהיקף.., לפי APA, עם N מקורות..). בלי \b.
  text = text
    .replace(/[\s,،]+(?:ה?כולל(?:ת|ים)?|שתכלול|שיכלול|בהיקף|באורך|לפי|על[- ]?פי|בפורמט|בסגנון|בעימוד|עם|כולל|בצירוף|בליווי|including|with)(?:\s.*)?$/i, '')
    .replace(/[\s.,;:"'״׳()\-–]+$/g, '')
    .replace(/^[\s.,;:"'״׳()\-–]+/g, '')
    .trim();
  return text.slice(0, 200).trim();
};
