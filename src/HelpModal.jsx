import React from 'react';
import { APP_VERSION_LABEL } from './appVersion';
import { Modal, Button } from './components/ui';
import UserGuide from './UserGuide';

const GUIDE_CONTENT = {
  checkUpdates: {
    title: 'בדיקת עדכונים',
    content: (
      <div>
        <p className="leading-relaxed mb-3">כדי לבדוק עדכונים אנא עבור לתפריט "קובץ" (File) בפינה הימנית העליונה, ובחר בלשונית "עדכונים". שם תוכל לראות את הגרסה הנוכחית של התוכנה ולהוריד גרסאות חדשות במידה וקיימות.</p>
        <p className="leading-relaxed">באפליקציית הדסקטופ אין צורך לבדוק ידנית: המערכת בודקת עדכונים ברקע זמן קצר אחרי הפתיחה, ואם יש גרסה חדשה תופיע הודעה קטנה עם כפתור "עדכן עכשיו". אם תתעלם ממנה, נזכיר שוב בעוד שלושה ימים — או מיד כשתצא גרסה חדשה יותר.</p>
      </div>
    )
  },
  guideUser: {
    title: 'מדריך למשתמש',
    full: true,
    content: <UserGuide />,
  },
  studios: {
    title: 'מדריך כלים מתקדמים',
    content: (
      <div>
        <div className="mb-4">
          <h3 className="text-lg font-bold mb-2">📈 עבודת SPSS</h3>
          <p className="leading-relaxed mb-2">
            ממסך הבית בחרו <b>"עבודת SPSS"</b> כדי לפתוח סטודיו ניתוח נתונים מודרך. הסטודיו מלווה אתכם משלב המטלה והנתונים ועד הפרשנות:
          </p>
          <ul className="pr-5 list-disc leading-[1.7]">
            <li><b>העלאת קובץ נתונים:</b> תומך בקבצי SPSS (<code className="bg-slate-100 px-1.5 py-0.5 rounded">.sav</code>), Excel ו-CSV — גם בדפדפן וגם באפליקציה. המערכת קוראת את שמות המשתנים, תוויות הערכים וערכי החיסר (missing) שלהם.</li>
            <li><b>תחביר חכם לפי תפקיד המשתנה:</b> המערכת מזהה אם משתנה הוא רציף, קטגוריאלי, או סולם ליקרט — וכותבת תחביר מתאים (לא מתייחסת לקוד של "מין" או "אזור" כמספר רציף).</li>
            <li><b>זיהוי ערכי חיסר לא-מוצהרים:</b> קודים כמו 98/99/"לא יודע"/"מסרב" מסומנים אוטומטית ומקבלים <code className="bg-slate-100 px-1.5 py-0.5 rounded">MISSING VALUES</code> כדי שלא יזהמו ממוצעים ומבחנים.</li>
            <li><b>לולאת תיקון שגיאות אמיתית:</b> אם בלוק תחביר נכשל — הדביקו את הודעת השגיאה מ-SPSS, והמערכת תתקן את הקוד אוטומטית.</li>
            <li><b>פירוש פלט מהיר:</b> כבר יש לכם פלט מ-SPSS? לחצו על באנר "פרש פלט" והדביקו את הטבלאות (כטקסט/Word/Excel) לקבלת ניתוח מילולי. <b>אל תעלו קובץ <code className="bg-slate-100 px-1.5 py-0.5 rounded">.spv</code></b> — הוא בינארי; ייצאו ל-Word/Excel או העתיקו את הטבלאות כטקסט.</li>
          </ul>
        </div>
        <div className="mb-4">
          <h3 className="text-lg font-bold mb-2">📊 סטודיו מצגות</h3>
          <p className="leading-relaxed">
            ממסך הבית בחרו <b>"מצגת"</b> והזינו נושא — המערכת בונה deck שקופית-אחר-שקופית. אפשר גם לבחור טיוטת בסיס כמקור, והיא תהפוך לשקופיות בלי לדרוס את הקובץ המקורי. הגדרות המצגת (סגנון, מספר שקופיות) זמינות תחת "⚙️ הגדרות מצגת".
          </p>
        </div>
        <div className="mb-4">
          <h3 className="text-lg font-bold mb-2">🎨 שכתוב טיוטת מצגת (.pptx)</h3>
          <p className="leading-relaxed">
            יש לכם כבר מצגת מוכנה? העלו קובץ <code className="bg-slate-100 px-1.5 py-0.5 rounded">.pptx</code> והמערכת תשכתב את הטקסט לקול והסגנון שלכם — שקופית בודדת או כל המצגת בבת אחת. <b>העיצוב המקורי נשמר במלואו</b> (גופנים, צבעים, פריסה); רק הטקסט מתחלף. יש תצוגת השוואה מקור↔משוכתב לבדיקה לפני הייצוא.
          </p>
        </div>
        <div className="mb-4">
          <h3 className="text-lg font-bold mb-2">🧬 האנשה אנטי-זיהוי-AI</h3>
          <p className="leading-relaxed mb-2">
            סוכן ה<b>האנשה</b> (humanize) כבר לא ריצה חד-פעמית: הפלט נבדק מול מזהה ה-AI המקומי ונכתב מחדש שוב ושוב עד שהוא יורד מתחת לסף שהגדרתם (או עד מספר המעברים המרבי). כך הטקסט נשמע אנושי מספיק כדי שגם גלאי AI יתקשה לסמן אותו.
          </p>
          <ul className="pr-5 list-disc leading-[1.7]">
            <li><b>שליטה לכל ריצה:</b> בחלונית ה-AI יש כרטיס הגדרה — הפעלה/כיבוי, סליידר סף (10–60) ומספר מעברים.</li>
            <li><b>בזמן יצירת מסמך:</b> במסך הבית וב-Chef Mode יש תיבת סימון "🧬 האנשה בלולאה עד תוצאה מספקת" — כשהיא דולקת, המסמך כולו עובר ליטוש אנטי-זיהוי בסיום הכתיבה.</li>
          </ul>
        </div>
      </div>
    )
  },
  guideAPIKeys: {
    title: 'מדריך מפתחות API - הגדרה והסבר מקיף',
    content: (
      <div>
        <div className="mb-4">
          <h3 className="text-xl font-bold text-blue-800 mb-2">מהו מפתח API ולמה הוא נדרש?</h3>
          <p className="leading-[1.7] mb-2.5">
            מפתח API (Application Programming Interface Key) הוא קוד סודי וייחודי המשמש כ"תעודת תעודת זהות" עבור התוכנה שלנו כאשר היא ניגשת לשירותי הבינה המלאכותית (כמו OpenAI או Google Gemini).
            מכיוון שחברות אלה מפעילות שרתי ענק שעולים כסף רב, הן דורשות ממשתמשים להזדהות דרך מפתח ה-API כדי לחייב אותם על בסיס השימוש ("Tokens" – אסימוני מילים).
          </p>
          <p className="leading-[1.7]">
            כאשר המערכת מספקת לך אפשרות לשים מפתח API אישי משלך, זה אומר שהבקשות שלך נשלחות ישירות מחשבונך. ללא מפתח API תקין המערכת לא תוכל לייצר טקסטים או לענות לשאלותיך.
          </p>
        </div>

        <div className="mb-4">
          <h3 className="text-lg font-bold mb-2">כיצד להשיג מפתח API?</h3>
          <p className="leading-[1.7] mb-2"><b>עבור Google Gemini (מומלץ במיוחד, ולעיתים חינמי):</b></p>
          <ol className="pr-5 list-decimal leading-[1.7] mb-3">
            <li>היכנסו לאתר Google AI Studio: <code className="bg-slate-100 px-1.5 py-0.5 rounded">aistudio.google.com</code></li>
            <li>התחברו באמצעות חשבון הגוגל (Gmail) שלכם.</li>
            <li>בתפריט הצדדי או בעמוד הראשי, חפשו את הכפתור <b>"Get API Key"</b>.</li>
            <li>לחצו על "Create API Key" והעתיקו את הרצף הארוך שיווצר.</li>
            <li>חזרו לתוכנה, פתחו את פאנל "קובץ" (File) &gt; הגדרות &gt; מנועי AI, והדביקו את המפתח תחת "Gemini API Key".</li>
          </ol>

          <p className="leading-[1.7] mb-2"><b>עבור OpenAI (ChatGPT):</b></p>
          <ol className="pr-5 list-decimal leading-[1.7]">
            <li>היכנסו לפלטפורמת המפתחים של OpenAI בכתובת <code className="bg-slate-100 px-1.5 py-0.5 rounded">platform.openai.com</code>.</li>
            <li>הקליקו על "Dashboard" ואז "API keys" בתפריט.</li>
            <li>לחצו "Create new secret key", שמרו אותו, והדביקו בתוכנה. (שימו לב: תצטרכו להוסיף כרטיס אשראי ולהטעין סכום מינימלי ב-Billing כדי שהמפתח יעבוד).</li>
          </ol>
        </div>

        <div className="mb-4">
          <h3 className="text-lg font-bold text-red-800 mb-2">מה לעשות אם זה נכשל? שגיאות נפוצות:</h3>
          <ul className="pr-5 list-disc leading-[1.7]">
            <li><b>שגיאה "Quota Exceeded" / "Rate Limit":</b> עברתם את הגבלת השימוש או שאין יתרה כספית בחשבון ה-API שלכם. לרוב יש לגשת לאתר הספק ולהוסיף אמצעי תשלום.</li>
            <li><b>שגיאה "Invalid API Key" / "Unauthorized":</b> הטקסט שהזנתם קצר מדי או מכיל רווחים שגויים. ולדאו שהעתקתם בדיוק הכל ללא רווחים נוספים לפני או אחרי.</li>
            <li><b>מודל לא נתמך (Model Not Found):</b> ייתכן שאין לך גישה למודל המתקדם (למשל GPT-4). במקרה כזה, נסה לשנות מודל דרך ההגדרות לחלופה חינמית או בסיסית יותר.</li>
          </ul>
        </div>
      </div>
    )
  },
  tsDocs: {
    title: 'פתרון תקלות - יצירת מסמך',
    content: (
      <div>
        <p className="leading-relaxed mb-3">
          אם נתקלתם בבעיה ביישום בזמן יצירת עבודה שלמה או עיבוד מסמכים:
        </p>
        <ul className="pr-5 list-disc leading-[1.7]">
          <li><b>המסמך נעצר באמצע הכתיבה:</b> סביר להניח שיש מגבלת זמן (Timeout) או שהסוכן "יצא ממסלול" (Hallucination). נסה ללחוץ על "נסה שוב" ולבקש שימשיך מאותה נקודה בה עצר.</li>
          <li><b>כפל טקסטים או פורמט לקוי:</b> העוזר מנסה לאחד כמה טיוטות ובמקרים נדירים עלול לכפול פסקאות. השתמש במצב הקריאה (View Mode) או בעורך הרגיל כדי למחוק בקלות את האזורים הכפולים.</li>
          <li><b>קובץ מיוצא (Word .docx) שבור:</b> אם הייצוא כושל או נפתח עם תווים מוזרים, ודאו כי לא השתמשתם ביותר מידי קבצים מצורפים מורכבים במיוחד ושהפונט שבחרתם נתמך. כפתרון מיידי, העתיקו הכל (Ctrl+A, Ctrl+C) והדביקו ב-Word של מיקרוסופט.</li>
          <li><b>העוזר כותב באנגלית במקום עברית:</b> בקש ממנו בפירוש בעמוד תכנון העבודה: "כתוב את המסמך כולו בשפה העברית", וודא שבהגדרות הפרופיל שלך מוגדר שפת כתיבה מועדפת עברית.</li>
        </ul>
      </div>
    )
  },
  tsAPI: {
    title: 'פתרון תקלות - התחברות ו-API',
    content: (
      <div>
        <p className="leading-relaxed mb-3">
          בעיות רשת וקריסות תקשורת עם שרת ה-API הן שכיחות. כיצד לפתור?
        </p>
        <ul className="pr-5 list-disc leading-[1.7]">
          <li><b>התראת "לא ניתן להתחבר לשרת":</b> ודאו שחיבור האינטרנט שלכם תקין ורציף. לעיתים חומות אש (Firewall) או אינטרנט של רשתות עבודה חוסמים את הפניות לשרתים חיצוניים.</li>
          <li><b>גודל ה-Context (Token Limit):</b> אם הכנסתם למסמך קבצי PDF ארוכים מידי או טקסט באורך אדיר לסוכן – עלולה להיווצר שגיאה שהמודל לא יכול לקבל כל כך הרבה מידע (Context limit). פצלו את הבקשה.</li>
          <li><b>שגיאות לא ידועות (Error 500/503):</b> אלו בעיות בשרתים של חברת ה-AI עצמה (למשל Google נפלו קרסו למספר דקות). הפתרון היחיד הוא להמתין למספר דקות ולנסות שוב.</li>
        </ul>
      </div>
    )
  },
  shortcuts: {
    title: 'קיצורי מקלדת',
    content: (
      <div>
        <table className="w-full border-collapse mt-2.5">
          <thead>
            <tr className="bg-slate-100 border-b-2 border-slate-300">
              <th className="p-2 text-right">טריגר</th>
              <th className="p-2 text-right">פעולה</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-200">
              <td className="p-2"><code className="bg-slate-100 px-1.5 py-0.5 rounded">Ctrl + Z</code></td>
              <td className="p-2">בטל משימה אחרונה (Undo)</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="p-2"><code className="bg-slate-100 px-1.5 py-0.5 rounded">Ctrl + Y</code></td>
              <td className="p-2">בצע שוב (Redo)</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="p-2"><code className="bg-slate-100 px-1.5 py-0.5 rounded">Ctrl + B / I / U</code></td>
              <td className="p-2">הדגשה / נטוי / קו תחתון</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="p-2 text-right" dir="ltr"><code className="bg-slate-100 px-1.5 py-0.5 rounded">Ctrl + Space</code></td>
              <td className="p-2">עט קסמים AI (ליטוש מהיר)</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="p-2 text-right" dir="ltr"><code className="bg-slate-100 px-1.5 py-0.5 rounded">Ctrl + Shift + A</code></td>
              <td className="p-2">פתיחת סייען ה-AI / חלונית הצד</td>
            </tr>
            <tr>
              <td className="p-2"><code className="bg-slate-100 px-1.5 py-0.5 rounded">Alt + F</code></td>
              <td className="p-2">פתיחת תפריט הקבצים והגדרות</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-xs text-slate-500">חלק מהקיצורים ניתנים להתאמה אישית בהגדרות (קובץ → הגדרות מתקדמות).</p>
      </div>
    )
  },
  about: {
    title: 'אודות',
    content: (
      <div className="text-center mt-5">
        <h2 className="text-2xl font-bold text-blue-700">WordFlow AI</h2>
        <p className="mt-2.5 text-[15px]">גרסה: {APP_VERSION_LABEL || 'מקומית'}</p>
        <p className="mt-2.5 leading-relaxed">
          מערכת זו בנויה לסייע בעבודה אקדמית, כתיבה מקצועית וניהול מסמכים אינטליגנטי,
          תוך שילוב עמוק של מודלי בינה מלאכותית המתקדמים ביותר בשוק.
        </p>
        <p className="mt-7 text-xs text-slate-500">פותח בשביל ליצור חוויית עריכה פורצת דרך. תשובה שאין לה תבנית.</p>
      </div>
    )
  }
};

export default function HelpModal({ isOpen, onClose, topic }) {
  if (!isOpen) return null;

  const doc = GUIDE_CONTENT[topic] || GUIDE_CONTENT.about;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={doc.title}
      size={doc.full ? 'xl' : 'lg'}
      footer={<Button onClick={onClose}>הבנתי, תודה</Button>}
    >
      {doc.full
        ? <div className="-mx-5 -my-4">{doc.content}</div>
        : <div className="text-[15px] text-slate-700">{doc.content}</div>}
    </Modal>
  );
}
