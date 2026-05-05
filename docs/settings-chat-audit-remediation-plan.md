# תוכנית עבודה: איחוד הגדרות, שדרוג פאנל העוזר ותיקוני עומק

## מטרה

לסגור כפילויות אחריות בין `StartScreen`, לשוניות ההגדרות והעוזר במסמך, ולבצע שדרוג ממוקד שמייצר:

- מקור אמת אחד לכל תחום הגדרה.
- פאנל עוזר יעיל לכתיבה משותפת בתוך המסמך.
- תיקון באגים שנחשפו בגלל פיצול state, מפתחות אחסון גלובליים ותלויות לא מלאות.

## עקרונות החלטה

לא נכון להתחיל משכתוב חזותי של `AiSidebar` או `StartScreen` לפני שמגדירים בעלות ברורה על state. כרגע אותה ישות עסקית נשלטת מכמה מסכים, ולכן כל שיפור UI בלבד ישמר את הרגרסיות. סדר העבודה הנכון הוא:

1. להגדיר בעלות וגבולות אחריות.
2. להוציא state ושירותים משותפים לשכבת orchestration אחת.
3. רק אז לארוז מחדש את ה-UI.

## יעדים

1. להפריד בין onboarding חד-פעמי, עריכה שוטפת של פרופיל אישי, וניהול workspace.
2. לצמצם את מספר נקודות הכניסה ל-AI ולבסס פאנל עוזר אחד עם מצבים ברורים.
3. לשפר את ניצול המסך בזמן כתיבה משותפת, במיוחד במצב docked.
4. לתקן דליפות state בין workspaces ולמנוע side effects רחבים מדי בשמירה.
5. להשאיר את השינויים מצטברים ובטוחים, בלי שבירת מסלולי כתיבה, הדפסה ויצירה קיימים.

## הבעיות הקיימות לפי אזור

### 1. בעלות אחריות והגדרות

- `ProfileOnboarding` ולשונית `personal` ב-`FileMenu` עורכים את אותו `personalStyleState`, אך משרתים שני שימושים שונים. כיום אין הבחנה אמיתית בין אשף היכרות ראשוני לבין עורך פרופיל מתמשך.
- `StartScreen` ו-`FileMenu` עורכים שניהם `workspaceAutomation` וזורמים על אותם שדות של autopilot, workflow ו-workspace selection. המשמעות היא כפילות UX וגם סיכון לדריסה הדדית.
- העלאת חומרים והנחיות מופיעה גם ב-`StartScreen` וגם באזור ההעדפות האישיות. כרגע לא מוגדר מה שייך לספריית workspace, מה שייך לפרופיל אישי ומה רק קלט חד-פעמי למסמך חדש.
- לשונית `ai` ולשונית `agents` נוגעות שתיהן בהגדרת מודלים. חסרה חלוקה ברורה: ספקים וקטלוג מצד אחד, בחירת provider/model לסוכן מצד שני.
- בתוך `FileMenu`, `WorkspacesManager` ו-`RoleAgentsSettings` חופפים ביצירה ועריכה של סוכנים וסביבות, כולל יצירה מהירה של סוכן מתוך אזור workspace. זה מבלבל ומעמיס אחריות כפולה באותו מסך.

### 2. UX של פאנל העוזר בתוך המסמך

- `src/main.jsx` מחזיק `aside` רחב ובמקביל `DocumentEditor` נשאר בברירת מחדל של משטח הדפסה. במצב כתיבה משותפת זה מבזבז רוחב יקר ומכריח את המשתמש לעבוד על עמוד מודפס צר ליד פאנל רחב.
- `AiSidebar` מאגד chat, actions, agents ו-logs בתוך מעטפת אחת צפופה מדי, עם הרבה chrome ולא מספיק היררכיה תפעולית.
- משטחי progress כפולים מוצגים גם ב-`main.jsx` וגם בתוך `AiSidebar`, ולכן בזמן generation יש חזרתיות ובמקרים מסוימים גם חריגת גובה.
- יש יותר מדי נקודות כניסה ל-AI: Ribbon, context menu, bubble menu, `MagicWand`, auto-popup. זה שובר מודל מנטלי אחד של הפעלה.
- הכיוון הנכון הוא פאנל עוזר stateful עם מצבים ברורים: `closed`, `peek`, `docked`, `expanded`, `progress`. auto-popup צריך לפתוח `peek` בלבד. במצב `docked` העורך צריך לעבור מ-`print` ל-`draft`/`web` surface רחב יותר.

### 3. באגים ורגרסיות שזוהו

- היסטוריית הצ'אט של `AiSidebar` נשמרת תחת מפתח גלובלי (`wordai_sidebar_messages`) ולכן דולפת בין workspaces.
- ב-`DocumentEditor` סנכרון font/size תלוי ב-`syncEditorSurface`, אך מצב התצוגה בפועל נשמר גם ב-`dom.dataset.viewMode`; זה מאפשר חזרה לא רצויה למצב קודם כאשר dependencies חלקיים או כאשר surface מתרענן.
- ב-`FileMenu` יש autosave רחב על `workspaceAutomationState` יחד עם state נוסף. שמירת automation מפעילה `wordai-workspace-changed` וגוררת side effects רחבים גם כשמדובר בשינוי מקומי יחסית.
- `StartScreen` מציג metadata של draft מתוך מפתחות גלובליים (`wordai_document_autosave`, `wordai_document_autosave_at`) גם אחרי החלפת workspace, ולכן ההצגה אינה מבודדת סביבתית.
- בזמן generation, השילוב בין progress panel ב-`main.jsx` ל-shell של `AiSidebar` עלול לעבור את גובה המסך וליצור overflow לא יציב.
- מסלול הסיום של `ProfileOnboarding` מסתיים ב-UI של step 7, אך אין חוזה השלמה ברור שמבטיח עדכון `onboardingCompletedAt`.

## חלוקת בעלות יעד

### `StartScreen`

- בעלות על כניסה למוצר, פתיחת מסמך, בחירת template, מצב `peek` ראשוני של העוזר, והרצת onboarding ראשוני בלבד.
- ללא עריכה שוטפת של הגדרות workspace מורכבות.
- ללא ניהול קבוע של ספריית חומרים אישית.

### `FileMenu` / Settings

- בעלות על הגדרות מתמשכות בלבד.
- חלוקה פנימית ברורה:
  - `ai`: credentials, provider catalog, בדיקת חיבור, ברירות מחדל גלובליות.
  - `agents`: מיפוי סוכנים ל-provider/model שכבר הוגדרו, סדר עבודה והרשאות agent.
  - `workspaces`: יצירה, בחירה, שכפול, מחיקה והגדרות workflow ברמת workspace.
  - `personal`: עריכת פרופיל אישי מתמשך, למידה, ספריית דוגמאות אישית.
  - `onboarding`: אשף חד-פעמי עם replay ידני בלבד.

### ספריית חומרים

- שכבת library אחת עם שני scopes בלבד:
  - `workspace`: חומרים והנחיות המשמשים תהליכי עבודה של הצוות הנוכחי.
  - `personal`: חומרים ללמידת סגנון אישי והעדפות כתיבה.
- `StartScreen` לא ינהל library, אלא רק יבחר או יצמיד חומרים קיימים למסמך חדש.

### עוזר בתוך המסמך

- מקור אמת יחיד למצב הפאנל ולמצב ה-generation.
- כל נקודות הכניסה הקיימות יתנקזו לאותו controller ויעבירו רק `reason` ו-`intent`.

## תוכנית יישום בשלבים

### שלב 1: מיפוי חוזי state והפרדת מקורות אמת

מטרה: להפסיק מצב שבו אותו אובייקט נערך מכמה מסכים בלי חוזה ברור.

משימות:

- להגדיר מסמך state contract עבור `personal profile`, `workspace automation`, `assistant ui state`, `materials library`, `provider catalog`.
- להפריד בין state גלובלי, state פר-workspace ו-state פר-session.
- לסמן במפורש אילו שדות עוברים מ-`StartScreen` להגדרות בלבד ואילו נשארים ב-onboarding.
- להחליט האם `FileMenu` מפוצל לקומפוננטות על בסיס domain או נשאר container דק שמחבר stores ייעודיים.

תוצרי שלב:

- תרשים בעלות קצר לכל domain.
- רשימת מפתחות `localStorage`/persistent storage עם שיוך scope.
- רשימת props ו-events שיוצאים משימוש.

### שלב 2: איחוד הגדרות וזרימות כפולות

מטרה: להסיר כפילות UI לפני שכתוב חזותי.

משימות:

- להפוך את `ProfileOnboarding` לאשף ראשוני בלבד, עם replay דרך settings אבל ללא אחריות על עריכה שוטפת מלאה.
- להשאיר את `personal` כעורך מתמשך של אותו פרופיל, עם סיכום מצב onboarding ופעולת "הפעל שוב אשף" במקום שכפול מלא של הזרימה.
- להוציא את שליטת workspace/autopilot/workflow מ-`StartScreen` למסך `workspaces` ייעודי; במסך הבית להשאיר רק בחירה מהירה או resume של workspace פעיל.
- לאחד העלאת חומרים/הנחיות לספרייה אחת עם מסנן scope; במסכים השונים להציג רק consumers של הספרייה.
- לפצל בין `ai` ל-`agents`: הראשון מגדיר ספקים ומפתחות, השני רק צורך provider/model מורשים.
- לפרק את החפיפה בין `WorkspacesManager` ו-`RoleAgentsSettings` כך שיצירה/שכפול/מחיקה של workspace יהיו באזור workspace, ואילו יצירת/עריכת agents תהיה באזור agents בלבד.

תוצרי שלב:

- טאבים עם אחריות לא חופפת.
- פחות פעולות עריכה ישירות ב-`StartScreen`.
- service/API יחיד לכל תחום persistence.

### שלב 3: ארכיטקטורת פאנל עוזר חדשה

מטרה: להחליף shell עמוס במנגנון מצבים ברור ויעיל למסך.

משימות:

- להגדיר `assistantPanelState` יחיד עם המצבים `closed`, `peek`, `docked`, `expanded`, `progress`.
- לייצר `AssistantPanelController` ברמת `main.jsx` שינהל פתיחה, סגירה, intent, מקור הפעלה ו-progress.
- להעביר את `AiSidebar` לפירוק פנימי לפי אזורים: `conversation`, `composer`, `agent-runner`, `progress`, `logs`.
- לצמצם chrome: logs ומידע משני לא יוצגו כברירת מחדל במסך chat docked.
- במצב `docked`, להעביר את `DocumentEditor` אוטומטית מ-`print` ל-surface רחב יותר (`draft`/`web`) ולשמור חזרה ל-`print` רק במעבר מפורש.
- להשאיר auto-popup כ-trigger ל-`peek` בלבד, בלי לכפות פתיחה מלאה ובלי לגנוב פוקוס.
- להגדיר אילו כניסות נשארות ואילו מתאחדות: Ribbon ככניסה ראשית, bubble/context menu כ-actions contextual, `MagicWand` רק אם הוא ממופה לאותו controller.

תוצרי שלב:

- פאנל אחד עם היררכיה ברורה.
- משטח כתיבה מתאים ל-co-writing.
- ללא progress כפול.

### שלב 4: תיקוני persistence ובידוד workspace

מטרה: לייצב state כך שלא ידלוף בין סביבות או יחזיר ערכים ישנים.

משימות:

- להפוך את chat history למבודד לפי `workspaceId`, עם migration מהמפתח הגלובלי הישן.
- להעביר draft metadata ו-autosave metadata למפתחות scoped לפי workspace, או לשכבת persistence ייעודית למסמכים.
- לצמצם side effects של `saveWorkspaceAutomation`: event יישלח רק כששדה בעל משמעות סביבתית השתנה, לא בכל autosave כללי.
- להפריד שמירה מיידית של preferences אישיים משמירה של workspace automation כדי למנוע שרשרת עדכונים רחבה.
- להגדיר חוזה סיום מפורש ל-onboarding שמעדכן `onboardingCompletedAt` וגרסה, גם אם האשף נפתח מחדש.

תוצרי שלב:

- state מבודד בין workspaces.
- פחות re-render ו-sync loops.
- onboarding מדיד ובר-בדיקה.

### שלב 5: ייצוב editor ו-regression pass

מטרה: לסגור את הבאגים שנחשפו בעקבות שינויים במעטפת.

משימות:

- ליישר מקור אמת אחד ל-`viewMode` בין `main.jsx` ל-`DocumentEditor`, בלי להסתמך על `dataset` כ-state חבוי.
- לוודא שהחלפת font/size לא נדרסת אחרי sync surface או מעבר מצב.
- לבטל חריגות גובה בין progress header, panel body ו-shell של assistant בזמן generation חי.
- להריץ regression pass על: החלפת workspace, פתיחת draft אחרון, chat history, onboarding replay, provider setup, agent run.

תוצרי שלב:

- editor יציב במעבר בין מצבים.
- generation UI שלא נשבר בגובה המסך.
- מסלולי פתיחה ו-workspace switch צפויים.

## קריטריוני קבלה

### בעלות והגדרות

- אין שדה עסקי שניתן לעריכה שוטפת גם ב-`StartScreen` וגם ב-settings בלי owner יחיד.
- `onboarding` ו-`personal` חולקים data model, אבל לא חולקים אותה חוויית שימוש.
- לשונית `ai` לא עורכת שיבוץ agents, ולשונית `agents` לא שומרת credentials.
- יצירת workspace ויצירת agent לא מתבצעות מאותו אזור UI ללא גבול ברור.

### פאנל עוזר ו-UX

- פתיחה אוטומטית של assistant פותחת `peek` בלבד.
- במצב `docked`, העורך מוצג על surface רחב שמתאים ל-co-writing.
- progress מוצג במקום אחד בלבד בכל רגע נתון.
- ניתן להבין בתוך 3 שניות מאיזה מקום מתחילים chat, איפה רואים מצב הרצה ואיך חוזרים למסמך מלא.

### באגים ויציבות

- chat history לא דולפת בין workspaces.
- החלפת workspace לא מציגה metadata של draft מסביבה אחרת.
- שינוי font/size נשמר גם אחרי מעבר מצב panel או refresh surface.
- autosave של workspace automation לא מפעיל side effects לא קשורים.
- סיום onboarding מעדכן `onboardingCompletedAt` בכל מסלול השלמה תקין.

## תלויות וסיכונים

- שינויי ownership בלי migration מסודר של storage ישברו משתמשים קיימים. צריך שכבת תאימות לאחור לפחות לגרסה אחת.
- שינוי `viewMode` בזמן docked עלול להשפיע על הדפסה, export ופקודות formatting. צריך לבדוק את כל הפקודות התלויות ב-surface.
- פירוק `FileMenu` עלול לחשוף coupling נוסף בין tabs דרך autosave משותף. עדיף לפצל stores לפני פיצול UI עמוק.
- אם לא יוגדר lifecycle ברור ל-progress ול-live generation, המעבר ל-stateful panel רק יעביר את הכפילות ממקום אחד לאחר.
- איחוד ספריית החומרים דורש החלטה עסקית חדה: האם קובץ יכול להשתייך גם ל-personal וגם ל-workspace, או שמדובר בשני references נפרדים לאותה רשומה.

## רשימת TODO מעשית

- [ ] לכתוב מסמך קצר של ownership לכל domain: `personal profile`, `workspace automation`, `providers`, `agents`, `materials`, `assistant panel`.
- [ ] למפות את כל מפתחות ה-persistence הקיימים לפי scope: global, workspace, session.
- [ ] לפצל ב-`FileMenu` בין `workspaces` ל-`agents` ברמת אחריות, גם אם ה-UI יישאר זמנית באותו מסך.
- [ ] להוריד מ-`StartScreen` עריכה שוטפת של workflow/autopilot ולהשאיר רק resume/quick start.
- [ ] להפוך את `ProfileOnboarding` לאשף ראשוני עם callback השלמה מפורש.
- [ ] להקים service אחיד לספריית חומרים עם תמיכה ב-`personal` ו-`workspace` scopes.
- [ ] להגדיר `assistantPanelState` אחד ב-`main.jsx` ולהעביר אליו את כל נקודות הכניסה.
- [ ] להוציא את progress/logs מה-shell הראשי של `AiSidebar` ולהציג אותם לפי מצב panel.
- [ ] לקשור מצב `docked` של assistant למעבר editor ל-surface רחב יותר.
- [ ] להעביר chat history למפתחות scoped לפי workspace ולכתוב migration חד-פעמי.
- [ ] לבודד autosave metadata של draft לפי workspace.
- [ ] לצמצם את event side effects של `saveWorkspaceAutomation` לשינויים סביבתיים אמיתיים בלבד.
- [ ] ליישר מקור אמת יחיד ל-`viewMode`, font ו-size ב-`DocumentEditor`.
- [ ] להוסיף בדיקות smoke ידניות ממוקדות לזרימות: workspace switch, onboarding complete, docked chat, live generation, provider setup.

## סדר ביצוע מומלץ

1. חוזי state ובעלות.
2. איחוד settings וזרימות כפולות.
3. הקמת controller לפאנל העוזר.
4. שדרוג layout של editor + assistant.
5. תיקוני persistence ורגרסיות.
6. smoke pass סופי.
הערת ביצוע: לא להתחיל שכתוב UI רחב לפני שסוגרים בעלות על state ו-persistence.

