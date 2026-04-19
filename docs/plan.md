<div dir="rtl">

# תוכנית עבודה אופרטיבית: פיצול והקמת מעבד התמלילים העצמאי

## רקע ארכיטקטוני והחלטות
המטרה שהוגדרה היא יצירת **מעבד תמלילים עצמאי מבוסס Tiptap ו-Electron**. 
נכון לעכשיו, הפרויקט מערבב בין קוד של תוסף ל-MS Word (דוגמת `office.js`, `manifest.xml`, `taskpane.js`) לבין קוד של אפליקציית React עצמאית (`DocumentEditor.jsx`, `main.jsx`). **זהו מצב מסוכן טכנולוגית** שגורר התנגשויות בסביבת הריצה ולוגיקה מיותרת.

**החלטה יזמית:** אנו ננקה את שיירי תוסף ה-Word, נבסס את ליבת העורך כ-Web App (עם Vite + React) נקי ומהיר, ורק לאחר מכן, כשליבת ה-AI תעבוד מצוין, נעטוף את זה ב-Electron או Tauri כאפליקציית דסקטופ מקומית.

---

## רשימת מטלות חיה — אפריל 2026

### עדיפות עליונה
- [ ] פתיחה ישירה לעורך במקום מסך פתיחה חוסם, כדי לקצר זמן לערך אמיתי.
- [ ] שמירה מיידית ואימות ידידותי של מפתחות API, כדי למנוע תקיעות בהפעלה ראשונה.
- [ ] חיווי סטטוס ברור לכל פעולת AI ולפייפליינים, כולל לוגים קריאים למשתמש.
- [ ] ייצוב טעינת חומרי לימוד מקומיים ורענון הרשימה בלחיצה אחת.
- [ ] עיצוב מחדש של חלונית הצד של הצ'אט כדי לצמצם בזבוז שטח מסך ולשפר פרקטיות בעבודה רציפה.
- [ ] ביטול או החלפה של החלון הקופץ התקוע לאחר פעולת יצירה, או הפיכתו לחלון צף שניתן להזיז ולסגור בקלות.
- [ ] העברת מנגנון המשוב על המסמך לנקודת זמן נכונה יותר — רק אחרי שהמשתמש ראה תוצאה ממשית ויכול להגיב עליה בצורה מושכלת.
- [ ] לשמר את מסך התיקונים הקיים כי הוא טוב, אך לתקן את הטיימינג והמיקום שבו הוא מופיע.
- [ ] כתיבה חיה של הפלט בזמן אמת במסמך ההכנה, גם כאשר הטקסט עדיין מתעדכן, כדי לחזק תחושת עבודה חכמה וחיה.
- [ ] תיקון בעיית העימוד והחיתוך במסמך הסופי כדי שהתוכן יוצג נקי, רציף ומעוצב היטב.

### עדיפות בינונית
- [ ] שמירה אוטומטית ושחזור מסמך אחרון, כדי לשפר אמינות של אפליקציית דסקטופ.
- [ ] בקרות איכות לפלט AI כמו טון, אורך וסוג תגובה.
- [ ] בדיקות עשן קבועות למסלול הבנייה, ההפצה והעדכון האוטומטי.
- [ ] שיפור ייבוא וייצוא של מסמכים בפורמטים שימושיים.
- [ ] הוספת התאמה אישית לסרגל האקדמי ולסרגלי פעולה נוספים, כך שהמשתמש יוכל לקבוע מה מוצג ומה מוסתר.
- [ ] בחירת מודל שישמש כמנהל העבודה הראשי, כולל שדה הנחיות ייעודי עבורו.
- [ ] במצב טייס אוטומטי: פישוט הממשק כך שיוצגו רק בחירת המנהל והנחיות למנהל, ללא כרטיסיות מודלים מיותרות למטה.
- [ ] שיפור משמעת הביצוע של הסוכנים מול סעיפים והנחיות, כדי שיפעלו בצורה עקבית יותר מול תוכנית העבודה.
- [ ] תיקון מנגנון הגופנים כך שהחלת גופן תעבוד ברמת קטע או בחירה, ולא על כל המסמך, כדי לאפשר שימוש בכמה גופנים במקביל.
- [ ] סנכרון בורר הגופן עם הטקסט המסומן, כך שמעבר עם הסמן או בחירה בטקסט יציגו מייד איזה גופן פעיל באותו אזור.
- [ ] במסך הלמידה על המשתמש: להציג מה המערכת כבר למדה עד עכשיו, תוך שמירה על אפשרות להוסיף ידנית.
- [ ] ניקוי קבצי קוד מיותרים ושיירים ישנים — אבל רק לאחר מיפוי ותיעוד, כדי לא לשבור תלויות נסתרות.

### עדיפות אסטרטגית
- [ ] ספריית תבניות מהירה לכתיבה אקדמית, עסקית ואישית.
- [ ] שכבת ספקי AI גמישה שתאפשר מעבר עתידי בין Gemini, Perplexity וספקים נוספים.
- [ ] מסך Onboarding קצר שמדריך משתמש חדש דרך הצעד הראשון.
- [ ] איסוף שגיאות ותקלות תצוגה בצורה ידידותית כדי לצמצם תמיכה ידנית.

### מה להתחיל היום
1. חיווי מיידי על מפתח API.
2. פתיחה ישירה לעורך.
3. כפתור רענון לחומרי לימוד עם סטטוס טעינה.

---

## חלוקת מטלות לפי סוכנים

### Agent: Product UX Reviewer
**Mission:** Run a full-product UI/UX audit across the app and list all friction points that hurt flow, readability, responsiveness, and task completion.

**Tasks:**
- Review the entire app end-to-end and identify missed UI issues beyond the current backlog.
- Focus on wasted screen real estate, unclear hierarchy, spacing, broken alignment, clipped content, modal timing, and confusing navigation.
- Check all major flows: create document, live writing, academic mode, chat sidebar, settings, study materials, and export.
- Return findings grouped by severity: blocker, high, medium, polish.

**Expected output:** Prioritized UX audit with screenshots or screen references and concrete fix recommendations.

### Agent: Lead Developer
**Mission:** Own the core workflow and orchestration logic.

**Tasks:**
- Add manager-model selection and a dedicated manager-instructions field.
- In autopilot mode, hide irrelevant lower model-role cards and leave only manager selection plus manager instructions.
- Improve agent adherence to section-by-section execution and ensure output tracks the requested structure more reliably.
- Rework feedback timing so document-review prompts appear only after visible output exists.
- Preserve the current correction flow because it is good; adjust only timing and placement.

**Expected output:** Stable orchestration logic with simpler decision flow and fewer irrelevant UI choices.

### Agent: UI Builder
**Mission:** Refine layout, space usage, and visible controls.

**Tasks:**
- Redesign the chat sidebar to use space more efficiently and reduce dead areas.
- Make post-create popups non-blocking, movable, or replace them with inline panels.
- Improve general UI consistency across typography, padding, button states, section headers, and modal behavior.
- Fix document layout so generated content does not appear cut off or visually broken.
- Add customization options for the academic toolbar and related action bars.

**Expected output:** Cleaner, denser, more practical interface that feels like a serious writing tool.

### Agent: Editor Experience Specialist
**Mission:** Fix writing-surface behavior so formatting feels professional.

**Tasks:**
- Apply fonts only to selected text or block scope instead of the whole document.
- Sync the font picker with current cursor position or current selection so the active font is always visible.
- Support mixed fonts in the same document without resetting surrounding content.
- Improve live preview so writing appears progressively while generation is still happening.

**Expected output:** Editing behavior closer to Word or Google Docs expectations.

### Agent: Knowledge Memory Manager
**Mission:** Improve what the system knows about the user and how it displays that knowledge.

**Tasks:**
- In the user-learning area, show what has already been learned so far.
- Keep manual add/edit capability for user facts and preferences.
- Make learned memory readable, editable, and clearly separated from temporary session context.

**Expected output:** Transparent memory panel with user trust and easy control.

### Agent: Cleanup Reviewer
**Mission:** Remove technical clutter safely.

**Tasks:**
- Map unused legacy files, duplicated code paths, stale assets, and dead UI fragments.
- Mark items as safe-to-delete, review-needed, or keep-for-reference.
- Do not delete blindly; produce a removal plan first to avoid breaking hidden dependencies.

**Expected output:** Safe cleanup checklist and candidate deletion list.

### Agent: Bug Reviewer
**Mission:** Validate each implementation pass before merge.

**Tasks:**
- Recheck modal timing, sidebar responsiveness, document overflow, and manager-mode visibility rules.
- Verify no regression in settings, editor startup, local materials, and release-critical flows.
- Report only concrete bugs with severity and reproduction steps.

**Expected output:** Short bug list after every implementation batch.

---

## סדר ביצוע מומלץ — לאט, יסודי, בלי לשבור דברים

### שלב 0 — Audit and Baseline
**Owner:** Product UX Reviewer + Cleanup Reviewer  
**Goal:** להבין בדיוק מה שבור, מה מיותר, ומה מסוכן לגעת בו.

**Deliverables:**
- Full UI audit across the product.
- Safe cleanup map for legacy files and dead code.
- One validated issue list with blocker / high / medium / polish.

**Exit criteria:**
- יש רשימת בעיות אחת מאוחדת.
- יש מיפוי של קבצים חשודים למחיקה בלי לבצע מחיקה בפועל.
- אין יותר תלות ברשימות מפוזרות או בזיכרון ידני.

### שלב 1 — Core Workflow Stabilization
**Owner:** Lead Developer  
**Goal:** לייצב את חוויית היצירה הראשית לפני כל שדרוג חזותי עמוק.

**Deliverables:**
- Manager-model selection.
- Dedicated manager instructions.
- Autopilot simplification: only manager controls stay visible.
- Better section-following by agents.
- Feedback prompt appears only after real visible output exists.

**Exit criteria:**
- זרימת יצירה ברורה יותר.
- פחות אפשרויות לא רלוונטיות על המסך.
- המשוב מופיע בזמן נכון ולא חוסם מוקדם מדי.

### שלב 2 — Layout and Screen Efficiency
**Owner:** UI Builder  
**Goal:** לנצל את המסך טוב יותר ולהעלים חיכוך חזותי.

**Deliverables:**
- Tighter chat sidebar layout.
- Non-blocking or movable post-create popup.
- Cleaner spacing, hierarchy, and responsive behavior.
- Academic toolbar customization options.
- Fixes for cut-off document display.

**Exit criteria:**
- פחות שטח מבוזבז.
- אין חלונות שקופצים ומפריעים לעבודה.
- המסמך לא נחתך בתצוגה.

### שלב 3 — Editor Behavior and Live Writing
**Owner:** Editor Experience Specialist  
**Goal:** לגרום לעורך להרגיש כמו כלי כתיבה אמיתי.

**Deliverables:**
- Font applies to selection, not whole document.
- Active font syncs with cursor position.
- Mixed-font support in one document.
- Live writing preview during generation.

**Exit criteria:**
- סרגל העיצוב משקף נכון את מצב הטקסט.
- אפשר להשתמש בכמה גופנים בלי להרוס את הסביבה.
- המשתמש רואה את הפלט מתהווה בלייב.

### שלב 4 — Memory and Personalization
**Owner:** Knowledge Memory Manager  
**Goal:** להפוך את ההעדפות והלמידה על המשתמש לשקופות ושימושיות.

**Deliverables:**
- Visible “what the system learned so far” panel.
- Manual add/edit support.
- Clear separation between persistent memory and temporary context.

**Exit criteria:**
- המשתמש רואה מה נשמר עליו.
- יש שליטה מלאה בעריכה ובהוספה ידנית.

### שלב 5 — Validation and Safe Cleanup
**Owner:** Bug Reviewer + Cleanup Reviewer  
**Goal:** לוודא שאין רגרסיות ושאפשר לנקות טכנית בבטחה.

**Deliverables:**
- Regression pass on startup, settings, materials, generation, and layout.
- Safe deletion checklist.
- Final recommendation on what to remove now vs later.

**Exit criteria:**
- אין תקלות קריטיות חדשות.
- יש רשימת ניקוי בטוחה ומאושרת.

---

## ספרינט ראשון מומלץ

### Focus
לייצב את חוויית היצירה הראשית לפני הרחבות נוספות.

### Tasks for Sprint 1
1. פתיחה ישירה לעורך.
2. בחירת מנהל עבודה והנחיות למנהל.
3. פישוט מצב טייס אוטומטי.
4. תיקון טיימינג המשוב למסמך.
5. צמצום בזבוז מקום בחלונית הצ'אט.
6. סנכרון בורר הגופן עם הטקסט המסומן.

### Definition of Done
- הזרימה הראשית נוחה וברורה יותר.
- אין פופאפ מוקדם שמפריע למשתמש.
- בחירת הגופן משקפת את הטקסט בפועל.
- ממשק הטייס האוטומטי נקי ולא מבלבל.

---

## שלבי הביצוע (אבני דרך)

### שלב 1: ניקוי ארכיטקטוני וחילוץ לוגיקה (Reference Extraction)
הבנו שקבצי התוסף הישנים נועדו לשמש כרפרנס לפיצ'רים. כדי שהפרויקט החדש (מעבד תמלילים עצמאי) ירוץ נקי מבלי להתנגש:
1. **בידוד רפרנס:** העברת הקבצים הישנים (`manifest.xml`, `taskpane.js`, הקשורים ל-`office.js`) לתיקיית `legacy-reference/` נפרדת, כדי שלא יפריעו לתהליך הבילד (Build) של Vite.
2. **חילוץ ה-AI:** מעבר על `taskpane.js` לחילוץ ממשק המיני-סוכנים (ה-`AGENTS_CONFIG` שכולל את תפקידי ה-Proofreader, Humanizer, Academic וכו') והמרתו למודול שרת/לקוח אגנוסטי (שלא תלוי ב-Word).
3. הסרת התלות ב-`@microsoft/office-js` מ-`package.json` והתאמת `index.html` לטעינת מסך מלא מנותק מ-Office.

### שלב 2: שדרוג ליבת חווית הכתיבה (Tiptap V1)
כדי שהעורך ירגיש כמו מעבד תמלילים אמיתי (כמו Word או Google Docs), ה-StarterKit של Tiptap אינו מספיק.
1. הוספת תמיכה מובנית ב-RTL ויישור טקסט לשני הצדדים (Text Align).
2. הוספת סרגל כלים (Ribbon) מורחב למעלה הכולל פקודות עיצוב (Bold, Italic, כותרות, רשימות).
3. פיתוח עיצוב ויזואלי של דף A4 מרכזי (Page view) בסביבת העריכה בעזרת TailwindCSS (במקום אזור טקסט חופשי).

### שלב 3: שילוב ה-AI כשכבה שקופה (AI Context Layer)
לא נסתפק בקפיצות מחלונית או Alert! ה-AI חייב להשתלב בזרימת הכתיבה:
1. בניית Tiptap Node Extension מותאם אישית להצגת הצעות השלמה אונליין (Ghost text), עליו יהיה ניתן ללחוץ `Tab` כדי לאשר.
2. הגדרת התפריט הצף (Bubble Menu) הקיים ב-`DocumentEditor.jsx` כך שיפעיל קריאה אסינכרונית ל-Gemini או למנוע מקומי שיבחן את הבלוק הנבחר ויחזיר הצעה חלופית תחת אותו עיצוב.

### שלב 4: מנגנון קבצים מקומי (File System V1)
במקום לעבוד מול הענן בשלב הראשון:
1. יכולת יצוא לקובץ Markdown או HTML (ויותר מאוחר לקובץ `.docx`).
2. שימוש ב-File System Access API כדי לשמור ולהטעין מסמכים שמימושים לוקאליים, כהכנה למעבר ל-Electron.

### שלב 5: עיטוף (Desktop App)
רק כשכל הפיצ'רים פועלים היטב בדפדפן - נוסיף את Electron או חלופה מתקדמת (כלי עטיפה) לקוד הבסיס כדי ליצור קובץ הרצה (EXE/DMG) הכולל אינטגרציה עמוקה עם מודל מקומי באמצעות `LM Studio` / `Ollama`.

</div>