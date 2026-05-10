# עדכון Autopilot Full

תאריך: 2026-05-10

## מה הושלם

- הושלם מעבר ל-`workflowMode: autopilot-full` עם preflight manager planning מלא.
- ה-plan הדינמי יודע עכשיו להחזיר וגם להפעיל `executionStyle`, `stageInstructions`, `stageModels` ו-`roundBudget`.
- מסכי ההגדרות וה-`StartScreen` עודכנו כך שהמצב החדש מוצג, נשמר ונטען מחדש בצורה עקבית.

## ממצאי Bug Review שנסגרו

### 1. אובדן תצורת `manager-review`

תוקן ב-`src/services/aiService.js`.

- מיפויי `stageProviders`, `stageModels`, `stageInstructions` ו-`stageLabels` שומרים עכשיו גם את ה-alias המקורי מה-planner וגם את המיפוי המנורמל לפי `agent.id`.
- שלב הביקורת הסופי יודע לקחת גם `goal`, גם `instruction`, גם `model` וגם `provider` שתוכננו תחת `manager-review`, גם אם הסוכן לא הופיע ב-`order` המקורי.

### 2. `executionStyle` שלא השפיע בפועל

תוקן ב-`src/services/aiService.js`.

- נוספה נגזרת מפורשת מ-`executionStyle` ל-`roundBudget`.
- גם אם ה-planner מחזיר רק `lean`, `balanced` או `deep` בלי budget מלא, ה-runner משתמש עכשיו בתקציב סבבים תואם.

### 3. `StartScreen` שלא הכיר את `autopilot-full`

תוקן ב-`src/StartScreen.jsx`.

- נוסף label מפורש ל-`autopilot-full`.
- dropdown ה-workflow המהיר יודע עכשיו לבחור ולשמור `autopilot-full` וגם `manager-auto` בלי remap שקט ל-`circular-team`.

### 4. `autopilot-full` שנשאר עם round budget פעיל גם כשה-toggle כבוי

תוקן ב-`src/services/aiService.js`.

- לוגיקת ה-multi-pass וה-review budget של `autopilot-full` פועלת עכשיו רק כשה-`autopilotEnabled` באמת פעיל.
- כיבוי האוטופיילוט מחזיר את ה-runner למסלול כללים בטוח, בלי סבבי revisit עודפים שנגררים מה-plan.

### 5. stages פנימיים שקיבלו שוב את prompt הניהולי של AUTOPILOT

תוקן ב-`src/services/aiService.js`.

- כל stage פנימי וכל final review מדלגים עכשיו גם על `workspaceAutomationPrompt` כאשר `skipAutomation` פעיל.
- זה מונע מהשלבים הפנימיים לנסות לנהל מחדש את כל ה-workflow במקום להחזיר `DELIVERABLE` ממוקד.

### 6. short-circuit של verified sources שעקף workflow מלא

תוקן ב-`src/services/aiService.js`.

- מסלול `verified sources` עובר עכשיו ל-short-circuit רק כאשר מדובר בבקשת מקורות בלבד.
- בקשות כמו כתיבה אקדמית עם מקורות, ו-stages פנימיים של workflow, ממשיכים לעבור דרך ה-runner המלא במקום להיחתך לרשימת מקורות שטוחה.

### 7. source auto-route שנשבר במצב Multi-Model

תוקן ב-`src/services/aiService.js`.

- כאשר בקשה מחייבת grounding ומופעל auto-route ל-`perplexity`, ענף ה-`multi-model` לא רץ יותר במקביל על רשימת ספקים ישנה.
- זה מבטיח שבקשות מקורות מאומתים לא ידלגו בטעות למודלים ללא retrieval מאומת.

### 8. בחירת mode מנוהל בלי להדליק בפועל את Autopilot

תוקן ב-`src/FileMenu.jsx` וב-`src/StartScreen.jsx`.

- בחירה של `autopilot-full` או `manager-auto` מדליקה עכשיו גם את `autopilotEnabled`.
- ה-UI וה-runtime מסונכרנים, ולכן בחירת mode מנוהל מפעילה באמת preflight ולא רק משנה label.

### 9. `StartScreen` שלא זרע fallback team למצב מנוהל

תוקן ב-`src/StartScreen.jsx`.

- מעבר ל-`autopilot-full`, `manager-auto` או `circular-team`, וגם טעינה מחדש של מצב כזה מה-workspace כשה-autopilot פעיל ולא ב-bypass, משלימים עכשיו רק את תפקידי הליבה החסרים במקום לדרוס את כל מערך הסוכנים הקיים.
- זה מונע מצב שבו ה-UI מציג autopilot פעיל אבל ה-runtime נופל בשקט ל-`rules` כי אין manager אמיתי.

### 10. fact-check שסווג בטעות כבקשת מקורות בלבד

תוקן ב-`src/services/aiService.js`.

- fact-check כבר לא נחתך למסלול `source-only` שמחזיר רק רשימת מקורות.
- עדיין נעשה שימוש ב-signals של grounding, אבל התשובה ממשיכה במסלול הרגיל כדי להחזיר ניתוח והכרעה על הטענות.

### 11. `Source Auto-Route` שלא כובד במסלול source-only

תוקן ב-`src/services/aiService.js`.

- `Verified Sources Only` נשאר קשיח עבור בקשות מקורות בלבד גם כשה-`autoRouteSourceRequests` כבוי.
- דגל `autoRouteSourceRequests` משפיע עכשיו רק על בקשות משולבות של כתיבה + מקורות, ולא מבטל את האכיפה של verified retrieval במסלול source-only.
- כאשר auto-route פעיל ובקשה משלבת כתיבה עם מקורות, העדפת `perplexity` מוזרקת גם ל-provider pool של שלבי ה-research בתוך ה-workflow הרב-סוכני.
- כאשר grounding נדרש, ענף `Multi-Model` נחסם כדי שלא יתבצע מיזוג תשובות מספקים ללא retrieval מאומת.

### 12. follow-up גנרי שהדליק מחדש query ישן של workspace

תוקן ב-`src/services/aiService.js`.

- reuse של `lastVerifiedSourceQuery` מותר עכשיו רק ל-follow-up מפורש של מקורות, ורק אם יש גם verified-source reply טרי בהיסטוריית השיחה של אותו workspace.
- אם אחרי ביטוי ה-follow-up יש נושא חדש, הוא משמש כשאילתה החדשה במקום למחזר עיוור את query העבר. בקשות גנריות כמו "עוד" כבר לא מפעילות reuse אוטומטי של query ישן.

## אימות

- `get_errors` חזר נקי עבור `src/services/aiService.js`.
- `get_errors` חזר נקי עבור `src/StartScreen.jsx`.
- `get_errors` חזר נקי עבור `src/FileMenu.jsx`.
- `npm run build` הושלם בהצלחה.

## ממצאים פתוחים מהסריקה האחרונה

- במעבר ל-managed mode, בדיקת צוות הליבה עדיין סופרת גם סוכנים מושבתים. לכן ייתכן מצב שבו ה-UI מציג `autopilot-full` או `manager-auto`, אבל ב-runtime חסר בפועל role ליבה פעיל והמערכת תרד למסלול חלקי או rules-based.
- במסלול Scholar-only, בקשות נפוצות על `מאמרים` עדיין עלולות לא להיחשב אקדמיות מספיק מוקדם, ולכן להיחסם למרות שיש SerpAPI Scholar מוגדר.
- `נקה צ׳אט Sidebar` כבר עובד ברמת ה-workspace עבור היסטוריית ה-sidebar עצמה, אבל `recentChats` ו-app memory עדיין אינם מסוננים לפי workspace ולכן הקשר ישן יכול להישאר מוזרם לבקשות חדשות.

## הערה

העדכון הזה מרכז את העבודה שבוצעה על `autopilot-full`, את האימותים שעברו, ואת הממצאים שעדיין נשארו פתוחים בסיום סריקת הבאגים.