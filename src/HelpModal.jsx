import React from 'react';

const GUIDE_CONTENT = {
  checkUpdates: {
    title: 'בדיקת עדכונים',
    content: (
      <div>
        <p>כדי לבדוק עדכונים אנא עבור לתפריט "קובץ" (File) בפינה הימנית העליונה, ובחר בלשונית "עדכונים". שם תוכל לראות את הגרסה הנוכחית של התוכנה ולהוריד גרסאות חדשות במידה וקיימות.</p>
        <p>לחלופין, אם אתה משתמש בגרסת האפליקציה (Desktop App), המערכת בודקת עדכונים באופן אוטומטי ברקע ותתריע בפניך במקרה של עדכון זמין.</p>
      </div>
    )
  },
  guideUser: {
    title: 'מדריך למשתמש',
    content: (
      <div>
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>ברוכים הבאים ל-WordFlow AI</h3>
          <p style={{ lineHeight: '1.6' }}>
            תוכנה זו מיועדת לכתיבה ועריכה של מסמכים בסיוע סוכני AI מתקדמים. 
            המערכת מאפשרת לכם ליצור מסמך מאפס, לערוך טקסט קיים, ולהיעזר בעוזר החכם כדי לשפר, לתקן, ולנסח מחדש.
          </p>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>יצירת עבודה או מסמך שלם</h3>
          <p style={{ lineHeight: '1.6' }}>
            כדי ליצור מסמך שלם באופן אוטומטי, ניתן ללחוץ על הכפתור "הנחיית העוזר" (Magic Wand / מטה קסם), להזין את נושא העבודה והנחיות ספציפיות, ולתת לסוכן הווירטואלי לתכנן ולכתוב את העבודה פרק אחרי פרק.<br/>
            המערכת תחלק את המטלה למספר סוכנים שיכתבו את חלקי המסמך במקביל ואז יאחדו הכל למסמך אחד מסודר.
          </p>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>עריכת טקסט</h3>
          <p style={{ lineHeight: '1.6' }}>
            בלחיצה על לשוניות הפריסה (בית, הוספה, עיצוב, פריסה) תוכלו לעצב את הטקסט, לשנות פונטים, להוסיף תמונות, טבלאות וכו' בדיוק כמו במעבד תמלילים רגיל.
          </p>
        </div>
      </div>
    )
  },
  guideAPIKeys: {
    title: 'מדריך מפתחות API - הגדרה והסבר מקיף',
    content: (
      <div>
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e40af', marginBottom: '8px' }}>מהו מפתח API ולמה הוא נדרש?</h3>
          <p style={{ lineHeight: '1.7', marginBottom: '10px' }}>
            מפתח API (Application Programming Interface Key) הוא קוד סודי וייחודי המשמש כ"תעודת תעודת זהות" עבור התוכנה שלנו כאשר היא ניגשת לשירותי הבינה המלאכותית (כמו OpenAI או Google Gemini). 
            מכיוון שחברות אלה מפעילות שרתי ענק שעולים כסף רב, הן דורשות ממשתמשים להזדהות דרך מפתח ה-API כדי לחייב אותם על בסיס השימוש ("Tokens" – אסימוני מילים).
          </p>
          <p style={{ lineHeight: '1.7' }}>
            כאשר המערכת מספקת לך אפשרות לשים מפתח API אישי משלך, זה אומר שהבקשות שלך נשלחות ישירות מחשבונך. ללא מפתח API תקין המערכת לא תוכל לייצר טקסטים או לענות לשאלותיך.
          </p>
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>כיצד להשיג מפתח API?</h3>
          <p style={{ lineHeight: '1.7', marginBottom: '8px' }}><b>עבור Google Gemini (מומלץ במיוחד, ולעיתים חינמי):</b></p>
          <ol style={{ paddingRight: '20px', listStyleType: 'decimal', lineHeight: '1.7', marginBottom: '12px' }}>
            <li>היכנסו לאתר Google AI Studio: <code>aistudio.google.com</code></li>
            <li>התחברו באמצעות חשבון הגוגל (Gmail) שלכם.</li>
            <li>בתפריט הצדדי או בעמוד הראשי, חפשו את הכפתור <b>"Get API Key"</b>.</li>
            <li>לחצו על "Create API Key" והעתיקו את הרצף הארוך שיווצר.</li>
            <li>חזרו לתוכנה, פתחו את פאנל "קובץ" (File) &gt; הגדרות &gt; מנועי AI, והדביקו את המפתח תחת "Gemini API Key".</li>
          </ol>
          
          <p style={{ lineHeight: '1.7', marginBottom: '8px' }}><b>עבור OpenAI (ChatGPT):</b></p>
          <ol style={{ paddingRight: '20px', listStyleType: 'decimal', lineHeight: '1.7' }}>
            <li>היכנסו לפלטפורמת המפתחים של OpenAI בכתובת <code>platform.openai.com</code>.</li>
            <li>הקליקו על "Dashboard" ואז "API keys" בתפריט.</li>
            <li>לחצו "Create new secret key", שמרו אותו, והדביקו בתוכנה. (שימו לב: תצטרכו להוסיף כרטיס אשראי ולהטעין סכום מינימלי ב-Billing כדי שהמפתח יעבוד).</li>
          </ol>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#991b1b', marginBottom: '8px' }}>מה לעשות אם זה נכשל? שגיאות נפוצות:</h3>
          <ul style={{ paddingRight: '20px', listStyleType: 'disc', lineHeight: '1.7' }}>
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
        <p style={{ lineHeight: '1.6', marginBottom: '12px' }}>
          אם נתקלתם בבעיה ביישום בזמן יצירת עבודה שלמה או עיבוד מסמכים:
        </p>
        <ul style={{ paddingRight: '20px', listStyleType: 'disc', lineHeight: '1.7' }}>
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
        <p style={{ lineHeight: '1.6', marginBottom: '12px' }}>
          בעיות רשת וקריסות תקשורת עם שרת ה-API הן שכיחות. כיצד לפתור?
        </p>
        <ul style={{ paddingRight: '20px', listStyleType: 'disc', lineHeight: '1.7' }}>
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
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
              <th style={{ padding: '8px', textAlign: 'right' }}>טריגר</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>פעולה</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '8px' }}><code>Ctrl + Z</code></td>
              <td style={{ padding: '8px' }}>בטל משימה אחרונה (Undo)</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '8px' }}><code>Ctrl + Y</code></td>
              <td style={{ padding: '8px' }}>בצע שוב (Redo)</td>
            </tr>
             <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '8px' }}><code>Ctrl + B / I / U</code></td>
              <td style={{ padding: '8px' }}>הדגשה / נטוי / קו תחתון</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '8px', direction: 'ltr', textAlign:'right' }}><code>Ctrl + Shift + A</code></td>
              <td style={{ padding: '8px' }}>פתיחת סייען ה-AI / חלונית הצד</td>
            </tr>
            <tr>
              <td style={{ padding: '8px' }}><code>Alt + F</code></td>
              <td style={{ padding: '8px' }}>פתיחת תפריט הקבצים והגדרות</td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  },
  about: {
    title: 'אודות',
    content: (
      <div style={{ textAlign: 'center', marginTop: '20px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1d4ed8' }}>WordFlow AI</h2>
        <p style={{ marginTop: '10px', fontSize: '15px' }}>גרסה: מקומית</p>
        <p style={{ marginTop: '10px', lineHeight: '1.6' }}>
          מערכת זו בנויה לסייע בעבודה אקדמית, כתיבה מקצועית וניהול מסמכים אינטליגנטי,
          תוך שילוב עמוק של מודלי בינה מלאכותית המתקדמים ביותר בשוק.
        </p>
        <p style={{ marginTop: '30px', fontSize: '12px', color: '#64748b' }}>פותח בשביל ליצור חוויית עריכה פורצת דרך. תשובה שאין לה תבנית.</p>
      </div>
    )
  }
};

export default function HelpModal({ isOpen, onClose, topic }) {
  React.useEffect(() => {
    if (!isOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      onClose?.();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const doc = GUIDE_CONTENT[topic] || GUIDE_CONTENT.about;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.5)', direction: 'rtl'
    }} onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      onClose?.();
    }}>
      <div style={{
        background: '#fff', width: '90%', maxWidth: '800px',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        borderRadius: '12px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 24px', borderBottom: '1px solid #e1dfdd',
          backgroundColor: '#f8fafc'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>
            {doc.title}
          </h2>
          <button 
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: '24px', color: '#64748b', display: 'flex', alignItems: 'center',
              padding: '4px', borderRadius: '6px'
            }}
            onMouseOver={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
            onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
            title="סגור"
          >
            <i className="ph ph-x"></i>
          </button>
        </div>

        {/* Content */}
        <div style={{
          padding: '24px', overflowY: 'auto', flex: 1,
          color: '#334155', fontSize: '15px'
        }}>
          {doc.content}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid #e1dfdd',
          backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'flex-end'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 24px', background: '#3b82f6', color: 'white',
              border: 'none', borderRadius: '6px', fontWeight: '600',
              cursor: 'pointer', fontSize: '14px', boxShadow: '0 2px 4px rgba(59,130,246,0.3)'
            }}
            onMouseOver={e => e.currentTarget.style.backgroundColor = '#2563eb'}
            onMouseOut={e => e.currentTarget.style.backgroundColor = '#3b82f6'}
          >
            הבנתי, תודה
          </button>
        </div>
      </div>
    </div>
  );
}
