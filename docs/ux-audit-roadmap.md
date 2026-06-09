# UX Audit And Roadmap

## מטרה

לעשות סדר בחוויית המשתמש של WordFlow בלי לאבד את העוצמה של המוצר.  
המטרה אינה "לייפות מסכים", אלא לייצר מוצר שקל להבין, קל להתחיל איתו, וקל להישאר בו לאורך סשן כתיבה אמיתי.

---

## תמונת מצב

מהקריאה ב-`src/main.jsx`, `src/StartScreen.jsx`, `src/AiSidebar.jsx`, `src/DocumentEditor.jsx` ו-`src/TopBar.jsx` עולה דפוס ברור:

1. המוצר חזק מאוד, אבל כמה מערכות שונות חיות באותו shell.
2. יש יותר מדי נקודות כניסה לאותן פעולות.
3. ה-UI מערבב בין "עבודה על מסמך", "הגדרת מערכת", "בחירת orchestration", ו-"פיצ'רים מתקדמים".
4. המשתמש נדרש להבין את מבנה המערכת מוקדם מדי, לפני שקיבל ערך ראשון.

במילים פשוטות: הבעיה המרכזית כרגע היא לא חוסר פיצ'רים, אלא חוסר היררכיה.

---

## אבחון מרכזי

### 1. מעטפת מוצר לא ממוקדת

ב-`src/main.jsx` וב-`src/TopBar.jsx` אותו shell מחזיק שלושה מצבים שונים:

1. `word`
2. `presentations`
3. `spss`

מבחינת קוד זה עובד, אבל מבחינת UX זה מייצר תחושת "סופר-אפליקציה" לפני שהמשתמש בכלל בחר מה הוא רוצה לעשות.  
המעבר הזה חשוף כל הזמן ב-top bar, ולכן גם בזמן כתיבה רגיל יש עומס החלטה מיותר.

### 2. מסך פתיחה עמוס מדי

`src/StartScreen.jsx` מנסה להיות בבת אחת:

1. מסך welcome
2. בחירת תבנית
3. בחירת provider/model
4. בחירת workspace/pipeline
5. העלאת חומרי עזר
6. העלאת instruction file
7. בחירת base draft
8. onboarding אישי

זה יוצר מסך מרשים, אבל כבד קוגניטיבית.  
במקום להוביל לכתיבה, הוא מבקש מהמשתמש להגדיר את כל המנוע לפני שהניע אותו.

### 3. יותר מדי משטחי AI על אותו מסמך

כרגע פעולות AI קיימות לפחות בארבעה מקומות:

1. `Ribbon`
2. `AiSidebar`
3. `MagicWand`
4. `DocumentEditor` bubble/context actions

בנוסף יש `assignment brief`, feedback flow, progress panels, וכניסות דרך מסך הפתיחה.  
התוצאה היא כפילות: אותו משתמש צריך לנחש איפה "נכון" לבצע פעולה.

### 4. חלונית הצד עושה יותר מדי דברים

`src/AiSidebar.jsx` היא גם:

1. צ'אט
2. עורך מבוסס הנחיות
3. בחירת agent
4. בחירת skill
5. בחירת provider/model
6. ניהול sessions
7. debug/logs
8. quick actions

כל אחד מאלה הוא מוצר משנה קטן.  
בפועל, החלונית איבדה פוקוס: היא גם שולחן עבודה מתקדם וגם חלון עזרה מהירה.

### 5. שכבות UI מתחרות זו בזו

ב-`src/main.jsx` יש כמה שכבות overlay/panel שיכולות להופיע סביב אותו מסמך:

1. start screen overlay
2. sidebar
3. assignment brief panel
4. copyleaks panel
5. feedback survey
6. magic wand
7. generation/progress surfaces

גם אם כל שכבה בנויה יפה בפני עצמה, ביחד הן יוצרות מאבק על קשב ועל שטח מסך.

### 6. בעיית IA יותר מבעיית צבעים

הקושי כאן אינו קודם כל ויזואלי.  
הבעיה העיקרית היא Information Architecture:

1. מה ראשי ומה משני
2. מה קורה לפני מה
3. מה שייך למסמך הנוכחי ומה שייך להגדרות כלליות
4. מהו מסלול ברירת המחדל למשתמש חדש

---

## עקרונות UX מוצעים

### 1. ערך ראשון לפני קונפיגורציה

המשתמש צריך להגיע למסמך פעיל או ליצירה ראשונה מהר מאוד.  
provider, pipelines, skills ו-workspaces צריכים להיות משודרגים אופציונליים, לא שער הכניסה הראשי.

### 2. משטח אחד ראשי לכל סוג פעולה

לכל פעולה מרכזית צריך להיות "בית" ברור:

1. כתיבה ועריכה: העורך
2. שיחה/בקשה חופשית: sidebar
3. פעולות מהירות על selection: bubble/context actions
4. הגדרות מערכת: FileMenu או Settings

אם פעולה מופיעה ביותר משני מקומות, צריך לבדוק למה.

### 3. הפרדה בין Session UI ל-System UI

יש להפריד בין:

1. דברים שקשורים למסמך הנוכחי
2. דברים שקשורים למשתמש/למוצר/למערכת

לדוגמה, provider selection, debug logs, workspace architecture ו-skill routing לא צריכים להתחרות על אותו אזור עם הצ'אט השוטף.

### 4. progressive disclosure

משתמש חדש צריך לראות מעט.  
משתמש מתקדם צריך לדעת שאפשר לפתוח עוד עומק.  
לא כולם צריכים לראות pipelines, split calls ו-agent routing כבר במסך הראשון.

### 5. מסך כתיבה צריך להרגיש כמו סביבת עבודה יציבה

ברגע שהמסמך פתוח, הממשק צריך להרגיש "שקט":

1. מעט תזוזות
2. מעט פתיחות אוטומטיות
3. מעט overlays
4. היררכיה ברורה בין משטחי עזר למסמך עצמו

---

## ארכיטקטורת UX מומלצת

### שכבה 1: Home

מסך הבית צריך לענות על שאלה אחת: איך מתחילים?

הוא צריך להכיל רק:

1. `מסמך חדש`
2. `המשך טיוטה אחרונה`
3. `פתח מסמך`
4. `צור עם AI`
5. `הגדרות ראשוניות` כ-CTA משני

הדברים הבאים צריכים לרדת מאזור הראשי ולהפוך ל-advanced sections או secondary drawers:

1. provider/model selection
2. workspace/pipeline details
3. חומרי עזר
4. base draft
5. instruction file

### שכבה 2: Writing Workspace

במצב כתיבה, המרחב הראשי צריך להתחלק לשלושה אזורים בלבד:

1. `Top shell` לפעולות מסמך וניווט
2. `Editor` כמרכז הכובד
3. `Assistant sidebar` כבן לוויה, לא כמרכז שליטה על כל המערכת

### שכבה 3: Review Layer

פיצ'רים כמו:

1. assignment brief
2. draft recommendations
3. copyleaks
4. feedback application

צריכים להרגיש כמו "review tools", לא כמו שכבה שמתערבבת עם flow הכתיבה הרגיל.

### שכבה 4: System Setup

הדברים הבאים צריכים לחיות יחד באזור הגדרות מסודר:

1. providers
2. models
3. workspace automation
4. skills/agents defaults
5. onboarding profile
6. memory/preferences

זה יפחית עומס ממסך הבית ומחלונית הצד.

---

## הצעת שינוי מבנית לפי משטח

### Start Screen

להשאיר:

1. תבניות עיקריות
2. מסמך אחרון
3. שדה prompt קצר ליצירה
4. CTA בולט להתחלה

להעביר לאזור מתקדם:

1. workspace V2 picker
2. provider/model controls
3. חומרי עזר
4. base draft
5. instruction file

הצעה פרקטית:

1. ברירת מחדל של `Quick Start`
2. כפתור `אפשרויות מתקדמות`
3. panel נפתח נפרד במקום להעמיס את מסך הבית עצמו

### Top Bar

ה-top bar צריך להתמקד ב-document actions.  
כרגע הוא גם מחליף mode, גם מציג search, גם quick actions, גם עדכונים, וגם כניסות להוראות.

הצעה:

1. להשאיר פעולות מסמך
2. לצמצם visibility של mode switch
3. להעביר חיפוש אם אינו עובד באמת
4. להפוך `assignment brief` לחלק מאזור review ולא לכפתור קבוע בבר העליון

### Sidebar

צריך להחליט מה ה-sidebar היא:

אופציה מומלצת:

1. מצב ברירת מחדל: chat + quick actions + session memory
2. advanced controls: drawer/tab משני נפרד
3. debug/logs: לא במסך הראשי של רוב המשתמשים

כלומר, להפוך אותה מ-"everything panel" ל-"assistant panel".

### Editor Actions

יש כיום חפיפה בין bubble menu, context panel ו-MagicWand.  
כדאי להגדיר:

1. bubble menu לפעולות קצרות על selection
2. context menu לעיצוב ופקודות עורך
3. MagicWand רק כקיצור גישה, לא כעוד מערכת פקודות עצמאית

אם אי אפשר לאחד מיד, לפחות צריך להפחית כפילויות בין הפעולות.

---

## Backlog בעדיפות גבוהה

### P0

1. לפשט את מסך הפתיחה למסלול התחלה קצר.
2. להוציא provider/workspace/materials ממרכז ה-home ל-advanced panel.
3. להגדיר תפקיד ברור ל-sidebar ולצמצם מה שמופיע כברירת מחדל.
4. לצמצם שכבות overlay שמתחרות על המסמך.

### P1

1. לאחד שפה והתנהגות בין quick actions across editor/sidebar/ribbon.
2. להעביר `assignment brief` לאזור review עקבי.
3. להחביא mode switching מאחורי selector פחות דומיננטי אם רוב השימוש הוא Word mode.
4. להפריד בין settings של מערכת לבין controls של מסמך נוכחי.

### P2

1. לבנות design tokens עקביים לשכבות, רדיוסים, spacing ו-states.
2. ללטש אנימציות ומעברים כך שיתמכו ב-flow ולא יובילו אותו.
3. לארגן מחדש את naming של מצבים ופעולות כך שגם בקוד יהיה יותר קל לתחזק UX עקבי.

---

## תוכנית ביצוע מומלצת

### שלב 1: Audit to decisions

מטרת השלב:

1. לסגור על מבנה UX אחד
2. להחליט מהו מסלול ההתחלה הראשי
3. להחליט מהו הבית של כל פעולה

Deliverables:

1. מפת משטחים
2. רשימת כפילויות
3. החלטות IA

### שלב 2: Home simplification

מטרת השלב:

1. לקצר זמן לערך ראשון
2. להקטין עומס במסך הבית

Deliverables:

1. Start screen רזה
2. advanced panel נפרד
3. CTA ברור למסמך חדש/יצירה

### שלב 3: Sidebar refocus

מטרת השלב:

1. להפוך את ה-sidebar לכלי עבודה ברור
2. להוציא ממנו controls מערכתיים שלא חייבים להיות שם תמיד

Deliverables:

1. default assistant view
2. advanced controls view
3. logs/debug מחוץ ל-default flow

### שלב 4: Review system cleanup

מטרת השלב:

1. לרכז feedback, brief ו-validation לזרימה ברורה אחת

Deliverables:

1. review hub או review rail
2. פחות overlays מתחרים
3. timing עקבי של הצעות/בדיקות

### שלב 5: Consistency pass

מטרת השלב:

1. לאחד שפה חזותית והתנהגותית

Deliverables:

1. CTA hierarchy עקבית
2. spacing system
3. states עקביים

---

## הצעה פרקטית לספרינטים

### Sprint 1

1. פישוט `StartScreen`
2. העברת advanced generation controls לאזור מתקדם
3. הגדרת default flow למשתמש חדש

### Sprint 2

1. ניקוי `AiSidebar`
2. הפרדת advanced/system controls
3. צמצום debug/log visibility

### Sprint 3

1. ארגון review tools
2. צמצום overlays
3. מיקום מחדש של `assignment brief`

### Sprint 4

1. איחוד quick actions
2. ניקוי כפילויות editor/assistant/magic wand
3. consistency pass

---

## החלטות מוצר שכדאי לקבל לפני מימוש

יש שלוש שאלות שצריך להכריע:

1. האם `Word` הוא המוצר הראשי וכל השאר הם modes משניים, או שיש כאן באמת שלושה מוצרים שווים?
2. האם `AiSidebar` היא companion לכתיבה, או control center של כל מערכת ה-AI?
3. האם מסך הבית נועד להביא מהר לכתיבה, או לשמש cockpit מלא לפני יצירה?

כל עוד שלוש השאלות האלה פתוחות, יהיה קשה לעשות UX נקי באמת.

---

## המלצה אופרטיבית

אם צריך לבחור צעד ראשון אחד בלבד, ההמלצה היא:

**להתחיל מפישוט מסך הפתיחה והגדרת מסלול התחלה ראשי אחד.**

זו הנקודה עם ההשפעה הכי רחבה, כי היא:

1. מורידה עומס
2. מבהירה את הזהות של המוצר
3. משפיעה על כל הזרימות שאחריה
4. תכריח אותנו להחליט מה ראשי ומה מתקדם

אחרי זה יהיה הרבה יותר קל לסדר גם את ה-sidebar וגם את שכבות ה-review.
