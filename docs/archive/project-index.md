> ⚠ מסמך היסטורי (לפני המעבר ל-Tauri, יוני 2026) — לא משקף את הארכיטקטורה הנוכחית. ראה CLAUDE.md ו-docs/CODE-MAP.md.
# אינדקס הפרויקט - WordFlow AI (Project Index)

מסמך זה מהווה תוכן עניינים (Table of Contents) מפורט למבנה קוד המקור, הקבצים המרכזיים ותיקיות הפרויקט. נועד לעזור למפתחים ולסוכני AI לנווט בקלות בארכיטקטורת המערכת של **WordFlow AI**.

---

## 📂 מבנה התיקיות הראשי (Project Structure)

המערכת בנויה כאפליקציית Electron בשילוב Frontend מבוסס React (באמצעות Vite). 

### `src/` - צד הלקוח והממשק הרספונסיבי (Frontend Components)
תיקייה זו מכילה את ה-UI של האפליקציה (React Components):
* `main.jsx` - נקודת הכניסה (Entry Point) של ה-React App בממשק המשתמש (מאתחל את מערכת הראוטינג או הקומפוננטות הראשיות).
* `StartScreen.jsx` - מסך הבית לניהול סביבות העבודה (Workspaces) ויצירת מסמכים חדשים.
* `AiSidebar.jsx` - חלונית ה-AI בצד ימין (או שמאל) המנהלת את הממשק מול המודל (Live Chat, Attachments, Live Streaming).
* `DocumentEditor.jsx` - קומפוננטת העורך המרכזית להצגת ועריכת מסמך הטקסט (Text Editor).
* `Ribbon.jsx` / `TopBar.jsx` - רצועת הכלים העליונה (תפריטים, פקודות עיצוב, Help Dropdown).
* `FileMenu.jsx` - ניהול תפריטי קבצים בסיסיים והגדרות שמירה/ינצוא.
* `HelpModal.jsx` - מודל לעזרה מהירה והסברים למשתמש.
* `ProfileOnboarding.jsx` - מסכי התקנה ראשונית וקליטת העדפות סגנון ו-API.
* `ChefModeDialog.jsx` - דיאלוג/ממשק לניהול "Chef Mode" והגדרות מתקדמות ל-workflows.
* `MagicWand.jsx` - קומפוננטת ליטוש עריכה בעזרת AI.
* `WordFlowAnimations.jsx` - אנימציות ומעברים לממשק (UI polish).
* `agentConfig.js` - הגדרות סוכני ה-AI הפועלים (Agent rules, prompts presets).

#### `src/services/` - שירותי לוגיקה ותקשורת (Services & API Logic)
* `aiService.js` - הליבה לניהול קריאות ל-API של ספקיות ה-AI (OpenAI, Gemini וכו׳). תומך ב-Live Streaming והעברת קבצים.
* `browserDocxExport.js` - כלי המרה ויצוא ה-DOM הנוכחי או נתוני המסמך לקובץ `Word (.docx)` להורדה.
* `copyleaksService.js` - בדיקת מקוריות זיהוי באמצעות שירות Copyleaks (Plagiarism/AI Check).
* `workspaceLearningService.js` - שירות זיכרון לניהול "למידה" והעדפות שנרשמו ממשתמש בהתאם למסמכים שכתב.

#### `src/firebase/` - אינטגרציה לענן (Cloud backend)
* `config.js` - חשיפת מפתחות Firebase Configuration.
* `services.js` - כלים לייבוא/שמירה, עדכון מסדי נתונים, ואוטנטיקציה.

---

### `electron/` - צד השרת ואריזת האפליקציה (Desktop App Backend)
תיקייה זו אחראית על חלונות ה-Electron, ניהול קבצים מקומי, גישה למערכת ההפעלה, ו-Auto-Updater.
* `main.cjs` - נקודת הכניסה של Electron Server. אחראי להרמת ה-Window (Main Process), ניהול Auto-Updater, ותקשורת IPC עם שלד האפליקציה.
* `preload.cjs` - סקריפט ה-Context Bridge שמחבר בין ה-Frontend (Main React) לבין הפונקציות ב-main process של הנוד, כדי להעביר בביטחה קבצים ואירועים (למשל, הדפסה, קריאת קבצים מקומיים וניהול חלונות).
* `materialExtraction.cjs` - מנוע חילוץ מידע מתוך סוגי קבצים שונים לטובת צירוף לחלונית הצ'אט (Attachment in Chat) או לטיוטת הבסיס.

---

### `docs/` - תיעוד המערכת ומפרטים למשתמש/פיתוח (Documentation)
קובצי Markdown אלו כוללים תכנונים והוראות עבודה לסביבת WordFlow.
* `user-guide.md` - מדריך משתמש (הכולל הסבר על Live Streaming, מנגנון ה-Update, ושאר פיצ'רים).
* `project-index.md` - המסמך הנוכחי, משמש למעבר זריז בין מחלקות הפרויקט (TOC).
* `project-plan.md` / `plan.md` / `next-version-plan.md` - מפות דרכים (Roadmaps) ופירוטים טכניים לגרסאות הבאות.
* `ux-audit-roadmap.md` - audit ממוקד UX עם אבחון עומס, הצעת ארכיטקטורת ממשק, ו-roadmap לביצוע הדרגתי.
* `ai-word-processor-plan.md` - הסבר קונספטואלי וארכיטקטוני למעבד התמלילים.
* `api-keys-guide.md` - הוראות טכניות להתחברות משתמשים לשירותי LLM (Gemini / OpenAI).
* `integration-plan.md` / `live-streaming-plan.md` - תיעוד ספציפי למנגנוני הזרמת מידע ל-streaming sockets והטמעת פיצ'רים.

---

### קבצי קונפיגורציה מרכזיים מקומיים (Root Level Settings)
* `package.json` - מגדיר את ה-Dependencies (כמו React, Tailwind, Electron builder).
* `vite.config.js` - הגדרות ה-Bundler וה-HMR של הפרויקט.
* `tailwind.config.js` / `postcss.config.js` - הגדרות השפה העיצובית באמצעות TailwindCSS ו-utility classes.
* `index.html` - תבנית ה-HTML שתארח את ה-React-root (ב-Vite / Electron).
