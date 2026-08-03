# דברים פתוחים — WordFlow AI

רשימת נושאים שנדחו במכוון לטיפול עתידי. לא באגים פתוחים — החלטות שמחכות לשלב המתאים.

---

## ✅ תוקן (מרתון UX/UI — 2026-06)

- **#1, #55** — גרסה אמיתית מ-build (`src/appVersion.js` + vite define `__APP_VERSION__`) ב-footer ההגדרות וב-HelpModal.
- **#7, #18, #36, #48** — **שירות `src/services/uiFeedback.js`** (toast + confirm + alert, RTL, reduced-motion).
  הומרו **כל ~60 הדיאלוגים הנייטיב** ב-StartScreen/main/FileMenu/AiSidebar/MagicWand/DocumentEditor/Ribbon/Chef.
  Chef: סגירת Escape/"הפסק" עקבית + guard מפני דיאלוג כפול.
- **#26** — כותרת המסמך ב-TopBar מציגה שם קובץ אמיתי (`documentTitle` prop).
- **#28** — אייקון megaphone דקורטיבי הוסר.
- **#32** — ternary מת ב-MagicWand נוקה.
- **#54** — HelpModal הומר ל-Tailwind מלא; תוכן העזרה תוקן (wand=ליטוש, הוספת Ctrl+Space).
- **#56** — שורת הסטטוס מציגה מצב-תצוגה אמיתי (`VIEW_MODE_LABELS`).
- **#58 (חלקי)** — token `--brand-blue`/`--brand-blue-accent` ב-tailwind.css לריכוז ה-hex.
- **#19** — בורר טיוטת בסיס כפול ב-StartScreen אוחד.
- **#33** — כפילות פעולות ב-context menu של העורך הוסרה.
- **#45** — כפתור "המשך" באונבורדינג כבר לא נראה מושבת-כוזב.
- **#46** — מחוון התקדמות כפול באונבורדינג אוחד.
- **#8** — נוספו אישורי מחיקה (showConfirm) לכל פעולות הניקוי ההרסניות (זיכרון/לוגים/צ׳אט).

**הוחלט להשאיר (החלטת משתמש):** #44 (PII ת"ז), #51 (PresentationStudio קוד מת).
**חריג מתועד:** `confirmReplaceCurrentDocument` נשאר `window.confirm` סינכרוני (gate ב-6 callers) — ראה #57.

**נותר לעבודה הדרגתית (churn גדול/מסוכן ל-bulk):** #3/#38 (AiSidebar 6794 שורות + תוכן הגדרות inline→Tailwind),
#30 (MagicWand replace-selection), #20 (accordion במסך הבית), #9 (כפילות הגדרות Developer↔טאבים).

---

## קריאת חומרי עזר מלאה ללא חיתוך (map-reduce)

**הקשר:** היום חומרי עזר מוזרקים ליצירה חתוכים ל-5000 תווים לכל חומר
(`MATERIAL_PREVIEW_MAX_LENGTH` ב-[workspaceLearningService.js](../src/services/workspaceLearningService.js)).
גם חומר בודד גדול נחתך. הוחלט: לקרוא את **כל** הטקסט גם במחיר קריאות API נוספות
(תת-צינור digest ב-map-reduce — ראה תכנון מלא בשיחת הסקירה).

**סטטוס:** התכנון מוכן. המימוש מחכה לשלב ה-UX.

**החלטות פתוחות (תלויות רמת המשתמש — לטיפול בשלב UX):**

1. **מודל ל-map step.** קריאות החילוץ (digest לכל chunk) יכולות לרוץ במודל זול/מהיר
   (Gemini Flash / Groq) בעוד החיבור הסופי במודל החזק — חיסכון עלות/זמן.
   או להישאר באותו ספק לפשטות. תלוי ברמת המשתמש / טייר.

2. **תקרת ביטחון אבסולוטית.** גם "קרא הכל" צריך גבול עליון (מספר חומרים / סך תווים)
   שלא יקפיא את האפליקציה בטעות. הערך תלוי ברמת המשתמש.

3. **מקבילות קריאות ה-map.** מקביל (מהיר, spike ב-rate limit) מול טורי (איטי, יציב).
   מומלץ מקבילות מוגבלת (~3 בו-זמנית) — לכוונון בשלב UX.

**עקרונות שאסור לוותר עליהם במימוש:**

- anti-hallucination ב-map step: prompt החילוץ אוסר המצאה.
- provenance: כל digest נושא `[חומר: <כותרת>]`.
- fallback ל-preview 5000 אם digest נכשל לחומר בודד (לא לאבד אותו לגמרי).
- cache לפי `materialId + hash(requestText)` כדי לא לשלם פעמיים על revise / מקצה תיקונים.

---

## איחוד קריאות logAgentDebugEvent (Fix 6 — קוסמטי)

**הקשר:** ~25 קריאות `logAgentDebugEvent` ב-[workspaceLearningService.js](../src/services/workspaceLearningService.js)
משכפלות `runId` + `agentLabel` + `...requestLogContext`. אפשר wrapper
`createRunLogger({ runId, agentLabel, ...context })` שמחזיר `log(event)`.

**סטטוס:** נדחה במכוון. טלמטריה בלבד — לא משפיע על לוגיקה. churn רחב על מונוליט
מול תועלת נמוכה. לאימוץ הדרגתי כשנוגעים ממילא בכל פונקציה, לא כ-refactor ייעודי.

---

## חלונית הצ'אט — UX/UI פתוח (מתוך סקירת AiSidebar)

**הקשר:** סקירת [AiSidebar.jsx](../src/AiSidebar.jsx). הזרימה הלוגית תקינה
(`send` ב-~3416, נתיב סוכן ב-~3319). הבאג הלוגי של `finally` (loading תקוע) **תוקן**.
מה שנשאר הוא UX/UI — נדחה במכוון לשלב העיצוב.

1. **אין streaming בבועת הצ'אט.** ה-props `onStreamStart/Chunk/End` מתקבלים אך
   **לא בשימוש** בתוך הקובץ. התשובה מגיעה במכה אחת אחרי `await` מלא. צריך להזרים
   token-אחר-token לבועה (דורש `onChunk` ב-`chatWithActiveProvider`/`chatWithRoleAgent`).

2. **אין כפתור עצירה.** כפתור השליחה רק `disabled` בזמן loading (מציג `…`).
   אין `AbortController` — `requestCycleRef` מבטל רק את עדכון ה-UI, אבל בקשת ה-LLM
   ממשיכה לרוץ ברקע = בזבוז טוקנים/עלות. דורש העברת `AbortSignal` עד ל-fetch ב-aiService.

3. **בועה ריקה + שלד כפול.** נתיב הצ'אט הישיר דוחף הודעת assistant ריקה (`content: ''`)
   כ-placeholder, ובמקביל מוצג שלד הטעינה — יחד. נתיב הסוכן לא דוחף ריק (לא עקבי).
   פתרון אפשרי: לסנן הודעות assistant ריקות ב-`messages.map`, או לאחד את שני הנתיבים.

4. **באג אנימציה בצ'אטים ארוכים.** `animation: messageSlide 0.4s ease ${i * 0.1}s both`
   עם delay לפי אינדקס + `both` fill → הודעה #30 נשארת שקופה ~3 שניות, #50 ~5 שניות
   לפני שמופיעה. צריך delay מוגבל/יחסי-לסוף או להסיר אותו לחלוטין.

5. **`key={i}` ב-`messages.map`** (שני המקומות). append-בעיקר אז לא באג חי כיום,
   אבל יישבר אם נוסיף streaming/סינון/סידור-מחדש. כדאי id יציב להודעה כשנוגעים ב-#1/#3.

6. **UX שגיאה דל.** שגיאות מרונדרות גולמי `❌ ${err.message}` ללא כפתור retry,
   וההודעה עלולה להיות טכנית/באנגלית. צריך עטיפה ידידותית + retry.

**באג פונקציונלי קטן לבדיקה (לא UI):** מנעול ה-loading ב-`send` קורא את closure
`loading` שמתעדכן רק אחרי re-render — Enter כפול מהיר מאוד עלול לשלוח פעמיים.
פתרון: `loadingRef` שנקבע סינכרונית. סבירות נמוכה, לכן נדחה.

---

## הגדרות האפליקציה — UX/UI (מתוך סקירת FileMenu settings modal)

**הקשר:** מודאל ההגדרות ב-[FileMenu.jsx](../src/FileMenu.jsx) — tabbed modal גדול
(`activePanel === 'settings'`, החל מ-~6727). סקירת UX/UI. מסודר לפי עדיפות.

### באגים קונקרטיים

1. **גרסה stale ב-footer.** מוצג hardcoded `WF-OS v1.0.13`
   ([FileMenu.jsx](../src/FileMenu.jsx) ~6722) בעוד הגרסה האמיתית `1.0.130`.
   גם שגוי וגם קפוא. צריך לקרוא מ-`package.json` / מ-app version (IPC) במקום מספר קשיח.

2. **ערכת נושא לא נשמרת.** `AppearanceSettings.applyTheme` רק מגדיר CSS vars על
   `documentElement` ([FileMenu.jsx](../src/FileMenu.jsx) ~6246) — בלי persist.
   רענון = הערכה אובדת. בנוסף אין אינדיקציית "נבחר" על הערכה הפעילה.
   צריך: שמירה (localStorage `wordflow_style_overrides` / app-settings) + הדגשת הנבחר.

### חוסר עקביות UX/UI

3. **שתי מערכות עיצוב.** *כל* תוכן הטאבים (14 רכיבי הגדרות) בנוי ב-inline styles עם
   hex קשיח ופלטת Office ישנה (`#605E5C`, `#C8C6C4`, `#323130`, `#E1DFDD`), בעוד
   מעטפת המודאל ושאר האפליקציה ב-Tailwind/daisyUI. תוצאה: לא עקבי, לא מודע ל-theme
   (ה-Dark theme מ-AppearanceSettings לא משפיע על ההגדרות), קשה לתחזוקה.
   צריך המרה הדרגתית למערכת עיצוב אחת.

4. **הודעת שמירה מטעה.** ה-footer מצהיר "שינויים מוחלים מיד בלחיצה על שמירה",
   אבל ערכת נושא חלה מיד בלחיצה (בלי שמירה). מודל שמירה מעורב — חלק מהטאבים live,
   חלק דורשים "שמור". צריך להחליט על מודל אחיד ולתקן את הטקסט בהתאם.

5. **שני כפתורי סגירה שונים.** `X` בכותרת + "בטל וחזור לתפריט" ב-footer — תוויות
   שונות, אותה פעולה. מבלבל. לאחד תווית/כוונה.

6. **אין הגנת unsaved-changes.** סגירה/Esc זורקת עריכות בשקט (יש debounce persist
   חלקי). המשתמש עלול לאבד עריכות בטאב. צריך guard / שמירה אוטומטית עקבית.

### ממצאים רוחביים (סריקה מלאה של 14 טאבי ההגדרות)

7. **דיאלוגים נייטיב `window.alert/confirm`.** בשימוש ב-WorkspaceV2 (מחיקה/אפס הכל),
   DeveloperSettings (מחיקת מפתח storage), OnboardingTabContainer (`resetLearningGame`),
   PersonalStyleSettings (`handleResetProfile`, `handleBuildGoldenExample`, alert בהעלאה).
   חלונות דפדפן גולמיים, צורמים מול המודאל המלוטש. להחליף ב-modal/toast פנימי אחיד.

8. **הגנת destructive לא עקבית.** חלק מהפעולות ההרסניות מאשרות (מחיקת סביבה, מחיקת מפתח
   storage, אִפוס פרופיל), אחרות מוחקות מיד בלי אישור: Developer "נקה זיכרון AI" /
   "נקה לוגים" / "נקה צ׳אט Sidebar", Guide "אפס זיכרון שמור", DebugConsole "נקה".
   צריך מדיניות אחידה — אישור לכל מחיקה בלתי-הפיכה.

9. **הגדרות כפולות בין טאבים (סיכון desync).** DeveloperSettings משכפל פקדים שכבר קיימים
   בטאבים ייעודיים: Assistant Popup (`autoPopup`/`idleSeconds`) = טאב "עוזר";
   AI Quick Actions = טאב "כתיבה"; Provider/Model פעיל = טאב "מנועי AI".
   אותו state, שני ממשקים — עריכה במקום אחד משאירה את השני stale עד re-render.
   בנוסף שתי מפות תוויות (`DEV_QUICK_ACTION_LABELS` מול `ACTION_VISIBILITY_OPTIONS`)
   שעלולות להיפרד. צריך מקור-אמת אחד / להסיר את הכפילות.

10. **מודל שמירה מעורב (live מול "שמור").** רוב הטאבים עורכים draft מקומי שנשמר רק
    ב"שמור והחל", אבל הרבה פקדים מחילים מיד וכותבים לדיסק/localStorage בלי קשר לכפתור:
    AppearanceSettings theme, WorkspaceV2 (כפתורי שמור/מחק עצמאיים), PromptSettings
    (החל על הפרופיל), Developer (ניקוי storage/memory/logs), Onboarding (מפתח ספק מהיר).
    המשתמש לא יודע מה כבר נשמר ומה לא. צריך מודל מנטלי אחיד והבהרה ויזואלית.

11. **Preset legacy "Word Add-in".** `SIDEBAR_PRESET_OPTIONS` כולל
    `['word-taskpane', 'Taskpane קלאסי (Word Add-in)']` ([FileMenu.jsx](../src/FileMenu.jsx) ~5343) —
    מפנה לארכיטקטורת Office.js המתה (ראה CLAUDE.md). שארית מבלבלת בטאב Developer. לבדוק/להסיר.

12. **הגדרות "מזויפות" משוכפלות מ-Word.** WordDefaultsSettings מכיל הרבה צ׳קבוקסים
    שהועתקו מ-MS Word (`showDrawings`, `printBackgrounds`, `smartCutPaste`,
    `ctrlClickOpensLinks`, `updateFieldsBeforePrint`, `allowDragDropEditing`...) —
    הערה ב-~1903 מודה "סומנו אצלך ב-Word המקורי". סביר שחלקם no-op באפליקציית TipTap.
    הגדרות שלא עושות כלום = שחיקת אמון. צריך audit: לחווט או להסיר.

13. **PersonalStyleSettings מונוליט.** רכיב יחיד ~1660 שורות (3388-5049). קשה לתחזוקה.
    לפצל לתת-מקטעים (סגנון / חומרים / מילון / דוגמת זהב / היכרות).

14. **Guide: "הדגמות מוכנות להעתקה" בלי כפתור העתקה.** הקטע "הדגמות מוכנות להעתקה
    לחלונית ה-AI" מרונדר כתיבות סטטיות בלי action העתקה (בניגוד ל-PromptSettings שיש בו
    כפתורי העתקה). להוסיף כפתור העתק לכל הדגמה.

15. **AiSettings: מפתח מהיר רק ב-double-click.** ה-quick-key popup נפתח רק בלחיצה כפולה
    על chip ספק באזור Multi-Model, עם רמז בטולטיפ זעיר. גילוי נמוך. להוסיף affordance גלוי.

16. **טאב "סגנון אישי" יתום מניווט הקבוצות.** `personal` לא נמצא ב-`SETTINGS_TAB_GROUPS`,
    מגיעים אליו רק דרך חיפוש או קישורים צולבים. לא עקבי עבור טאב מרכזי. להוסיף לקבוצה.

17. **לוגיקת ברירת-מחדל שברירית ל-checkbox.** Workflow Engine ~6110:
    `checked={automation?.[key] !== false && automation?.[key] !== undefined ? ... : (key === ...)}`
    — מסורבל ושביר. לנרמל ברירות מחדל ב-`getWorkspaceAutomation` ולפשט את ה-JSX.

---

## מסך הבית — UX/UI (מתוך סקירת StartScreen)

**הקשר:** [StartScreen.jsx](../src/StartScreen.jsx) (~2.3k שורות). רובו Tailwind/daisyUI
(229 `className` מול 8 inline) — שלא כמו מודאל ההגדרות. נקודת המגע הראשונה של המשתמש.
מסודר לפי עדיפות.

18. **דיאלוגי נייטיב `alert/confirm` בכל מקום (22 מופעים).** כל ה-feedback של שגיאות,
    ולידציה והעלאות, וגם אישורי מחיקה/קובץ-גדול, עוברים דרך `window.alert`/`window.confirm`
    (העלאת חומרים, טיוטת בסיס, החלפת סביבה, מחיקת מסמך אחרון, מחיקת חומר עזר, Chef).
    חוסם, לא מעוצב, צורם מול ה-glass UI. להחליף ב-toast/inline אחיד.
    זהה לעיקרון של פריט #7 בהגדרות — כדאי פתרון רוחבי אחד לכל האפליקציה.

19. **בורר "טיוטת בסיס" כפול.** שני פקדים נפרדים לאותה פעולה (`handleSelectBaseDraft`):
    כרטיס ייעודי "טיוטת בסיס אופציונלית" (~1699-1716) וגם באזור הקבצים (~1891-1897).
    מבלבל איזה לבחור. לאחד לפקד אחד.

20. **אין progressive disclosure — בלוק "מצב הפעלה" ענק ותמיד פתוח.** כרטיס הקלט הראשי
    מערים: toggle פלט → prompt+כפתורים → הגדרות מצגת → טיוטת בסיס → בורר סביבת עבודה →
    ספק+מודל+בדיקת חיבור → קבצים/הנחיות → 2 dropzones → textarea הנחיות → רשימת חומרים.
    הכול גלוי בו-זמנית (ההערה בקוד אומרת "Advance Options Area" אבל זה לא מתקפל).
    מציף משתמש חדש. צריך accordion / מצב בסיסי מול מתקדם.

21. **רשימת חומרי העזר צפופה.** הרשימה יושבת בתיבת scroll זעירה
    `min-h-[90px] max-h-[140px]` (~1993) ליד textarea ההנחיות, ומכילה chips של העלאה
    אחרונה + כפתורי פילטר + קבוצות + שורות פריט + כפתורי מחיקה. 140px צר מדי לסריקה/בחירה
    של הרבה קבצים. להגדיל / לפצל לאזור משלו.

22. **בחירת ספק/מודל = עוד משטח כפול.** למסך הבית בורר ספק+מודל משלו
    (`resolvedDirectProviderId`/`Model`), בנוסף לטאב מנועי AI, טאב Developer וטאב חלונית הצ׳אט.
    ארבעה מקומות שבוחרים ספק/מודל. רוחבי עם פריט #9 — צריך מודל מנטלי אחיד.

23. **צבע מותג קשיח inline.** Word-blue `#2B579A` קשיח ב-toggle המסמך/מצגת (~1546, 1553)
    במקום token. מינורי, לעקביות.

24. **הנחיות נשמרות ל-localStorage בכל הקלדה.** `saveHomeInstructions` נקרא ב-`onChange`
    של ה-textarea (~1987) בלי debounce. מינורי — כדאי debounce.

---

## המסמך עצמו — UX/UI (סרגל עליון, סרגל צד, תפריט מהיר, חלונית צד)

**הקשר:** סקירת ה-chrome של מסך העריכה: [TopBar.jsx](../src/TopBar.jsx),
[Ribbon.jsx](../src/Ribbon.jsx), [DocumentEditor.jsx](../src/DocumentEditor.jsx)
(context menu + BubbleMenu), [MagicWand.jsx](../src/MagicWand.jsx) (עט קסמים צף),
[AiSidebar.jsx](../src/AiSidebar.jsx). הערה: יש כבר סעיף ייעודי "חלונית הצ'אט" למעלה
(streaming/stop/error) — כאן רק מה שלא כוסה.

### סרגל עליון (TopBar)

25. **תיבת חיפוש מתה.** ה-input "חיפוש (Alt+Q)" ([TopBar.jsx](../src/TopBar.jsx) ~117-124)
    בלי `value`/`onChange`/handler — דקורטיבי לחלוטין, וגם הקיצור Alt+Q כנראה לא קיים.
    פקד מזויף = שחיקת אמון (כמו פריט #12). לחווט או להסיר.

26. **כותרת מסמך סטטית.** מוצג קשיח "מסמך 1 - Word" (~86) — אף פעם לא משקף את שם/נתיב
    הקובץ האמיתי (האפליקציה מנהלת document identity). להציג את שם הקובץ בפועל.

27. **מתג מצב חסר Presentations.** `modeBtn` מציג רק Word + SPSS (~82-83, 129-130) למרות
    שקיים `isPresentationsMode`. לא ברור איך מגיעים למצב מצגות מה-TopBar. להשלים/לבדוק.

28. **אייקונים/אווטאר דקורטיביים.** אייקון megaphone (~193) בלי onClick; אווטאר עם
    initials קשיחים `'RL'` (~209) למשתמש מקומי. מינורי — להסיר/לחווט.

### תפריט מהיר צף (MagicWand)

29. **100% inline styles + פלטת Office.** כל הרכיב inline (`#E1DFDD`, `#C8C6C4`,
    `#323130`, `#2B579A`) — לא Tailwind. עוד מופע של פיצול מערכות העיצוב (פריט #3).

30. **Apply מוסיף במקום להחליף בחירה.** הפעולות מבקשות מה-AI "ערוך רק את הטקסט הנבחר",
    אבל "הוסף למסמך" מריץ `onInsert` שמכניס בעמדת הסמן (~230-234, ב-main `insertContent`)
    במקום להחליף את הבחירה — סיכון לכפילות טקסט. צריך replace-selection.

31. **שגיאה גולמית + אין streaming.** התוצאה `❌ err.message` (~149) בלי retry, והתשובה
    מגיעה במכה אחת אחרי await. זהה לבעיות בחלונית הצ'אט — לאחד פתרון.

32. **ternary מת.** `rightPx = sidebarOpen ? 20 : 20` (~165) — שני הענפים זהים, no-op. לנקות.

### עורך — context menu + BubbleMenu (DocumentEditor)

33. **כפילות פעולות ב-context panel.** הדבק/גזור/העתק/נקה-עיצוב מופיעים פעמיים באותו פאנל:
    שורת אייקונים למעלה (~673-682) ורשימה למטה (~742-745). מיותר. לאחד.

34. **BubbleMenu ברוחב קשיח.** `min-w-[620px] max-w-[760px]` (~762) — נכפה רוחב גם בחלון צר
    או כשחלונית הצד פתוחה; עלול לגלוש מה-viewport. צריך responsive.

### סרגל עליון מורחב (Ribbon)

35. **שלוש מערכות עיצוב מעורבות.** CSS classes (`r-btn`, `toolbar-panel`, `tab-btn`,
    `var(--word-blue)`) + 132 inline styles + 49 hex של Office + utility-classes של Tailwind,
    באותו קובץ. קשה לתחזק ולעשות theming. לאחד.
    (הערה חיובית: פקודות ה-Ribbon כן מחווטות — כל `onCommand` מופיע ב-`handleCommand` ב-main.jsx,
    אז אלה לא כפתורים מתים, רק שווה לוודא שכל פקודה ממומשת מלאה.)

36. **`alert()` נייטיב.** שגיאת "צילום מסך לא נתמך" (~367) דרך `alert`. רוחבי עם #7/#18.

37. **לחיצה על טאב פעיל מקפלת את הפאנל.** `setActiveTab(activeTab===x ? '' : x)` (~517+) —
    ב-Word לחיצה על טאב פעיל לא סוגרת אותו. סטייה קלה שעלולה לבלבל. לשקול.

### חלונית הצד (AiSidebar)

38. **100% inline styles, אפס Tailwind.** 259 `style={{}}` ו-0 `className` בכל הקובץ —
    החריג הגדול ביותר במערכת העיצוב, לא מודע ל-theme. מקביל לתוכן ההגדרות. להמיר.

39. **מונוליט 6794 שורות.** הרכיב הכי גדול אחרי main/aiService. קשה לתחזוקה — לפצל
    (chat / composer / attachments / suggestion-review). משלים את הסעיף הקיים "חלונית הצ'אט".

---

## מצב SPSS — UX/UI (מתוך סקירת SpssSyntaxStudio)

**הקשר:** [SpssSyntaxStudio.jsx](../src/SpssSyntaxStudio.jsx) (~1115 שורות). מצב נפרד
(`appMode === 'spss'`), סטודיו מלא-מסך. **האזור הנקי ביותר במערכת:** 100% Tailwind
(153 `className`, 0 inline, 0 hex של Office, 0 דיאלוגים נייטיב), feedback דרך באנר `notice`
פנימי, empty-states טובים, provenance ו-tokenization (anti-hallucination), disclosure
ל"פרטים טכניים". מעט ממצאים.

40. **אין streaming ואין כפתור עצירה.** גם הצ'אט/מדריך וגם יצירת ה-syntax מציגים
    "חושב..."/"מייצר syntax..." חוסם אחרי await, בלי טוקן-אחר-טוקן ובלי abort.
    רוחבי עם פריט #1 (חלונית) ו-#31 (MagicWand) — שווה פתרון AI אחיד לכל האפליקציה.

41. **צבעים קשיחים (hex).** `#0066cc`, `#1F6FEB`, רקע `#ECE8E1` משובצים inline בתוך
    className אחרת נקי. מינורי — לעבור ל-token/Tailwind palette.

42. **"הסר אחרון" מיידי בלי undo.** `removeLastBlock` מוחק את הבלוק האחרון מיד (לא הרסני
    לדאטה, אבל אובד התוצר). כדאי undo/toast עם ביטול.

43. **Enter-to-send חסר במצב "פירוש פלט".** Enter שולח רק במצב 'ask' (~933); במצב output
    חייבים ללחוץ על הכפתור. חוסר עקביות קל.

---

## אונבורדינג — UX/UI (מתוך סקירת ProfileOnboarding)

**הקשר:** [ProfileOnboarding.jsx](../src/ProfileOnboarding.jsx) (~1091 שורות). אשף 7 שלבים,
דארק glassmorphism. רובו Tailwind (235 `className`, 42 inline — בעיקר textShadow/box-shadow/
widths, 0 hex של Office, 0 דיאלוגים נייטיב). נטען בטאב onboarding בהגדרות וגם ממסך הבית.

44. **ת"ז (PII רגיש) נשמר plaintext. ⚠️** שדה `studentId` "מספר תז להגשה" (step 1, ~386-391)
    → `updateField` → פרופיל → localStorage/`app-settings.json` בדיסק, ועלול להסתנכרן ל-Firebase
    דרך [cloudSyncManager.js](../src/services/cloudSyncManager.js). מספר תעודת זהות = PII רגיש
    שנשמר לא מוצפן. לשקול הצפנה / הסכמה מפורשת / אי-הכללה בסנכרון הענן. **עדיפות גבוהה.**

45. **כפתור "המשך" נראה מושבת בשלב 4 אבל פעיל.** `disabled={false}` קבוע (~1072), אבל
    ה-className+boxShadow מטפלים ב-`step === 4` כמושבת (אפור, `cursor-not-allowed`, ~1074-1079).
    מראה ≠ התנהגות — הכפתור עובד ומקדם. לתקן את אחד הצדדים.

46. **שני מחווני התקדמות כפולים.** למעלה step-indicators + track (~245-290), ולמטה
    "שלב X מתוך 7" + בר מיני (~1058-1068). מציגים אותו דבר פעמיים. לאחד.

47. **אין ולידציה — אפשר לסיים אונבורדינג ריק לגמרי.** `nextStep`/`onComplete` תמיד מותרים.
    אם זו כוונה (הכול אופציונלי) — OK; אחרת כדאי לוודא שדות ליבה לפני סיום.

---

## Chef Mode — UX/UI (מתוך סקירת ChefModeDialog)

**הקשר:** [ChefModeDialog.jsx](../src/ChefModeDialog.jsx) (~719 שורות). דיאלוג שאלות
דינמי מונחה-AI ממסך הבית. Tailwind נקי (45 `className`, 1 inline, 0 hex).

48. **סגירה לא עקבית + דיאלוג נייטיב.** "הפסק בישול" → `window.confirm` ואז ניקוי session
    וסגירה (~463-474), אבל Escape → `onClose()` ישיר בלי אישור ובלי ניקוי (~481-483).
    שתי התנהגויות סגירה שונות, וה-confirm עקיף לגמרי דרך Escape. רוחבי עם #7/#18/#36.

49. **עומס כפתורים בשלב השאלה.** 6 כפתורים בשורה אחת (המשך / חזרה / דלג / "יש מספיק מידע -
    התחל לכתוב" / "הוסף עוד שאלות" / "עבור ליצירת מסמך") + "הפסק בישול" בכותרת (~643-694).
    אין היררכיה ויש שלוש דרכים לצאת/לסיים. לקבץ ולהבהיר primary מול secondary.

50. **שני נתיבי "סיום" מעורפלים.** "יש מספיק מידע - התחל לכתוב" (`requestFinishWithFinalReview`)
    מול "עבור ליצירת מסמך" (`handleGoToEditor`) — ההבדל לא ברור למשתמש. להבהיר/לאחד.

---

## מצגות — UX/UI (מתוך סקירת PresentationStudio)

**הקשר:** [PresentationStudio.jsx](../src/PresentationStudio.jsx) (~291 שורות). Tailwind נקי
ובנוי היטב — אבל מתברר שהוא לא מחובר.

51. **PresentationStudio = קוד מת. ⚠️** הרכיב לא מיובא ולא מרונדר באף מקום ב-src. בנוסף
    `appMode === 'presentations'` בלתי-נגיש: `setAppMode` נקרא רק עם 'word'/'spss', והמתג
    ב-TopBar מציג רק Word/SPSS — לכן גם ה-badge "מצב מצגות פעיל" ב-TopBar מת (פריט #27).
    הפיצ'ר האמיתי של מצגות חי ב-StartScreen (output type "מצגת" → `generatePresentationDeck`).
    להחליט: לחבר את PresentationStudio או למחוק אותו + לנקות את ענפי `presentations`.

52. **כפילות הגדרות מצגת.** PresentationStudio משכפל את כל פקדי המצגת שכבר ב-StartScreen
    (slideCount/theme/density/imageIntensity/speakerNotes/cover). אם מחברים — מקור-אמת אחד;
    אם מוחקים — מתבטל.

53. **slideCount בלי clamp ב-onChange.** input 4-20 אבל `onChange` שומר ערך גולמי (~144);
    clamp רק ב-`handleGenerate`. ב-StartScreen דווקא clamp מיידי. עקביות.

---

## עזרה — UX/UI (מתוך סקירת HelpModal)

**הקשר:** [HelpModal.jsx](../src/HelpModal.jsx) (~255 שורות). מודאל עזרה עם נושאים
(מדריך/API/קיצורים/אודות/פתרון תקלות). סגירה תקינה (X + footer + Escape + backdrop).

54. **כולו inline styles.** 57 `style={{}}` ו-1 `className`. פיצול מערכת העיצוב (כמו
    AiSidebar ותוכן ההגדרות). להמיר.

55. **תוכן עזרה stale/לא מדויק.** "אודות" מציג "גרסה: מקומית" (~158) במקום הגרסה האמיתית
    (כמו #1/#26); המדריך מפנה ל-"Magic Wand / מטה קסם" ליצירת מסמך שלם (בפועל זה
    StartScreen/Chef — ה-wand הוא לליטוש inline); טבלת הקיצורים קשיחה ולא נקראת מההגדרות
    הניתנות-להתאמה, וחסר בה Ctrl+Space של ה-wand. לרענן ולחבר לנתונים אמיתיים.

---

## מודאלים ושורת סטטוס (בתוך main.jsx)

**הקשר:** משטחי UI שמרונדרים ישירות ברכיב `App` ב-[main.jsx](../src/main.jsx):
input dialog (~7889), גלאי Copyleaks (~7980), סקר משוב (~8199), פאנל הוראות מטלה (~8568),
live-generation (~7685), document-arrival/confetti, שורת סטטוס (~8670).
**חיובי:** המודאלים עצמם Tailwind נקי, בנויים היטב, התנהגות סגירה עקבית (X/Escape/backdrop).

56. **שורת סטטוס — מחוונים stale/מזויפים.** "עמוד 1 מתוך {pageCount}" — העמוד הנוכחי קשיח
    `1` (~8684), רק הסך דינמי; "מצב הדפסה" קבוע (~8689) בלי תלות ב-viewMode בפועל
    (read/web/outline/draft שנבחרים ב-Ribbon); "עברית (ישראל)" סטטי (~8686). + `#2B579A` קשיח.
    אותה תמה של פקדים מזויפים כמו #25/#26.

57. **22 דיאלוגי `alert/confirm/prompt` נייטיב ב-main.jsx.** המקור הגדול ביותר באפליקציה.
    מחזק את #7/#18/#36/#48 — **שווה פתרון רוחבי אחד**: שירות toast/modal פנימי שמחליף את כל
    ה-`window.alert/confirm` בכל הקבצים (SPSS כבר עושה את זה נכון עם באנר `notice`).

58. **צבעי מותג קשיחים חוצי-קומפוננטות.** `#0066cc` (×2) ו-`#2B579A` (×9) ב-main.jsx, ועוד
    באותם hex ב-TopBar/Ribbon/MagicWand/SPSS. מחזק את #3/#23/#41 — צריך **design token אחד**
    (CSS var כמו `--word-blue` שכבר קיים חלקית) במקום hex מפוזר.

---

## חומרי עזר — chunking + אחזור סמנטי (גשר `saveHelperMaterial` → `materialChunkStore`)

**הקשר:** הבחירה האוטומטית של חומרי עזר ליצירת מסמך
([workspaceLearningService.js](../src/services/workspaceLearningService.js), `rankAutoContextCandidates`)
מנקדת מעכשיו גם את **תוכן** החומר ולא רק את המטא-דאטה, ולכן הקבצים הנבחרים נכונים יותר.
מה שנשלח מהם עדיין נשאר "ראש הקובץ" — הזרקת טקסט רציף, בלי אחזור לפי סעיף.

**מה נדחה במכוון:** גשר בין `saveHelperMaterial` ל-[materialChunkStore](../src/services/materialChunkStore.js)
(chunking + embedding כבר בהעלאה) ואחזור הקטעים הרלוונטיים דרך
[evidenceMatchService](../src/services/evidenceMatchService.js) — כלומר אותו מנגנון RAG מקומי
שמשמש את שלד המטלה, גם במסלול יצירת המסמך הרגיל.

**סטטוס:** נדחה. הפאס הנוכחי מתקן **אילו קבצים נבחרים**, לא **מה נשלח מהם**.
