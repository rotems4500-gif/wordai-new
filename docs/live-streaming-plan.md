<div dir="rtl">

# תוכנית עבודה: אינטגרציה של טקסט חי (Live Streaming)

מסמך זה מתאר את הארכיטקטורה והשלבים הנדרשים להטמעת חיבור חי (Live Streaming / SSE) מהמודלים ישירות לפאנל הצדדי ולעורך התיעוד ב-WordAI.

## 1. הערכת ישימות ואתגרים (Technical Feasibility)
* **אתיקה מול `chatWithActiveProvider`:** כרגע קיימת שכבה לוגית עבה (Manager/Fallback/Parsings). מעבר פתאומי לסטרימינג עלול לשבור תהליכי Autopilot וסוכנים שמצפים לקבל JSON מלא או תבנית מאושרת.
* **הפתרון ברמת ה-Service:** יצירת פונקציה חדשה — `streamWithActiveProvider(..., onChunk)` או הוספת דגל בטוח ל-`chatWithActiveProvider` שלא יפעל במקביליות של סוכנים אלא בפעולה ישירה בלבד.
* **ממשק משתמש (Sidebar):** עדכון ה-state של השיחה מצריך טיפול ב-rendering יעיל. `React` עשוי לרנדר ברצף ולהאט את המערכת אם הסטייט יתעדכן על כל 2 תווים.
* **ProseMirror / Tiptap:** פקודות כמו `insertContent` ברצף מהיר מדי שוברות את העץ או מבטלות את בחירת הסמן. נדרשת עבודה ישירה מול `editor.state.tr` בכדי לדחוף טקסט ליעד פוזיציה נשמר.

## 2. שלבי הביצוע (Implementation Plan)

### שלב 1: שכבת המידע ב-`src/services/aiService.js`
1. יצירת כלי עזר עבור `fetch` וקריאת Stream (שימוש ב-`response.body.getReader()`).
2. טיפול בדיאלקטים השונים: פריסת SSE של OpenAI/Anthropic מול אלו של Gemini.
3. חשיפת פונקציה `streamWithActiveProvider(prompt, context, systemPrompt, options)` המקבלת גם ב-options אובייקט עם פונקציית הזרקה `onChunk(partial, done)`. הפונקציה תחזיר את הסטרינג המלא עם סיום העבודה, לטובת שלמות ה-History.

### שלב 2: פאנל הצד `src/AiSidebar.jsx`
1. הגדרת משתנה מצב `streamingBlock` (או הודעה גלויה שמתעדכנת).
2. בעת לחיצה על בקשה (לדוגמה עבודה מול סוכן קלאסי בסיסי שלא מצריך ניתוח מטא), הפניית הקריאה אל המסלול הזרמתי במקום הרגיל.
3. פונקציית ה-`onChunk` תעדכן את ה-`streamingBlock` תוך שמירה על Buffer מזערי (למניעת זחילות רנדור ב-React).

### שלב 3: הזרקה ישירה למסמך - `main.jsx`
1. כדי "להזרים" טקסט אל העורך (למשל מתוך "המשך יצירה"), ניתן להשתמש בפונקציה מיוחדת תחת ה-`App`. 
2. ניהול סמן: נשמור את המיקום ההתחלתי (Position), ונגדיל אותו בגודל ה-chunk שניתווסף (באמצעות `editor.view.dispatch(editor.state.tr.insertText(chunk, pos))`). 
3. סיום ההזרמה ישחרר טריגר `onWordCountChange` במרוכז כדי למעט חישובים גלובליים שמאטים את ההקלדה במסמכים ארוכים.

</div>