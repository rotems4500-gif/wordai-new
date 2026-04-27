# תוכנית עבודה מקיפה: New User Onboarding

## מטרה

לבנות onboarding למשתמש חדש שמייצר ערך כבר בהפעלה הראשונה, אוסף את המידע המינימלי שצריך כדי להתאים את המערכת אישית, ולא מכניס שכבת state או persistence חדשה כשאין בכך צורך.

ה-onboarding צריך לכסות שישה צירים:

1. חיבור יכולת AI בפועל דרך provider, API key או endpoint מקומי מאושר.
2. הבנת השימושים המרכזיים של המשתמש.
3. התאמה אישית של tone, style והעדפות כתיבה.
4. הגדרות אמון והרשאות כמו learning consent.
5. העלאת מסמכים, עבודות קודמות וחומרי קורס ללמידת ניסיון, רק באישור מפורש.
6. יצירת צוות סוכנים אוטומטי מתוך סקר קצר שממופה ל-presets קיימים.

## המלצת מוצר

ההמלצה היא **soft onboarding מדורג ולא hard gate חוסם**.

כלומר:

1. משתמש חדש יראה מסלול היכרות ברור כבר במסך הפתיחה.
2. הוא יוכל להשלים את המסלול שלב-שלב.
3. הוא יוכל גם לדלג זמנית ולהיכנס לעורך.
4. אם אין API key, endpoint מקומי מוכן, או שהפרופיל חלקי, המערכת תמשיך להציע השלמה דרך banners, CTA-ים או פתיחה יזומה של FileMenu בלשונית הנכונה.

הסיבה להמלצה הזו היא שהקוד והזיכרון הפרויקטלי כבר מכוונים לכך שמסך הבית לא יהפוך לחסם קשיח לעריכה, אבל כן יש צורך ברור במסלול ראשון מסודר למשתמשים חדשים.

## מצב קיים בקוד

### משטחים שכבר קיימים

1. `src/main.jsx` מחליט אם להציג את מסך הפתיחה דרך `showStartExperience`.
2. `src/StartScreen.jsx` הוא נקודת הכניסה המתאימה ביותר להצגת ה-onboarding הראשוני.
3. `src/ProfileOnboarding.jsx` כבר אוסף הרבה משדות הפרופיל, השימושים, ה-style וה-learning.
4. `src/FileMenu.jsx` כבר מחזיק גם את ה-profile onboarding וגם את מסך ה-provider/API keys.
5. `src/services/aiService.js` כבר יודע לשמור `word preferences`, `personal style profile` ו-`provider config`.
6. `electron/main.cjs` ו-`electron/preload.cjs` כבר מספקים persistence לדיסק עבור provider config ו-app settings.

### מסקנה ארכיטקטונית

לא צריך להוסיף שכבת storage שלישית.
צריך רק לארגן מחדש את ה-flow, לחבר בין המשטחים שכבר קיימים, ולהוסיף gating ומצב התקדמות ברורים.

## היעדים של הפיצ'ר

### יעד ראשי

תוך פחות מ-2 דקות מההפעלה הראשונה, משתמש חדש צריך להיות מסוגל:

1. לבחור ספק AI פעיל ולהגדיר API key או endpoint מקומי.
2. להגדיר למה הוא משתמש באפליקציה.
3. לבחור כיוון סגנוני בסיסי.
4. להבין מה המערכת שומרת עליו ולתת הסכמה ללמידה אם ירצה.
5. להוסיף פרטים אישיים שימושיים כמו שם פרטי, חוג, קורסים ומטרות כתיבה.
6. להעלות עבודות או מסמכי דוגמה אם ירצה, בצורה שקופה ובהרשאה מפורשת.
7. לקבל צוות סוכנים מומלץ שמתאים לסוג העבודה שלו.
8. להגיע למסמך ראשון עם ברירות מחדל סבירות.

### יעדי משנה

1. לצמצם נטישה בהפעלה ראשונה.
2. להקטין תמיכה ידנית סביב API keys והגדרות ראשוניות.
3. לשפר התאמה אישית של prompts כבר מהמסמך הראשון.
4. לאפשר חזרה קלה ל-onboarding גם אחרי ההפעלה הראשונה.

## תחום הפיצ'ר

### בתוך הסקופ

1. Flow ראשוני למשתמש חדש.
2. איסוף מידע בסיסי והצעת דיפולטים.
3. חיבור ל-provider config קיים.
4. חיבור ל-profile/style הקיים.
5. סימון התקדמות והשלמה.
6. מסלולי דילוג, המשך מאוחר יותר ועריכה חוזרת.
7. העלאת חומרי למידה דרך מנגנון ה-upload הקיים.
8. סקר קצר שממפה ל-workspace preset וצוות סוכנים מומלץ.

### מחוץ לסקופ ל-phase 1

1. חשבון משתמש בענן או sync בין מכשירים.
2. שאלוני עומק ארוכים.
3. סריקה אוטומטית עמוקה של ספריות או ארכיונים שלמים בלי אישור פרטני.
4. wizard נפרד לחלוטין עם persistence חדש.

## מודל UX מומלץ

### שלב 1: Welcome

מטרת השלב: להסביר בקצרה מה המשתמש ירוויח מההגדרה הראשונית.

תוכן:

1. כותרת קצרה וברורה.
2. הסבר של 2-3 תועלות מוחשיות.
3. שני CTA-ים: `התחל הגדרה` ו-`דלג לעורך`.

### שלב 2: AI Setup

מטרת השלב: לאפשר למשתמש להפעיל את המערכת באמת.

תוכן:

1. בחירת provider פעיל ראשי מתוך ספקים מובנים, ובמקביל הצעת ספקים `OpenAI-compatible` נפוצים דרך `Custom`.
2. הזנת API key או prefill של `baseUrl`/`model` כשהמשתמש בוחר ספק שעובד דרך `Custom`, כולל מסלול מקומי שבו key הוא אופציונלי רק ל-loopback מוכר כמו `LM Studio`. `Ollama` נשאר ספק built-in נפרד.
3. כפתור `בדוק חיבור`.
4. קישור ישיר באותו שלב לעמוד יצירת המפתח או ההתקנה של כל ספק.
5. שתי שורות המלצה קצרות לפי סוג השימוש הצפוי: כתיבה כללית, מחקר, עלות, מהירות, פרטיות מקומית.
6. הדרכה קצרה בתוך החלונית: איפה לוחצים, איזה key מחפשים, ומה מדביקים לשדה.

התנהגות:

1. אם המשתמש מדלג, משאירים את `providerReady` כלא מוכן בתוך `onboardingChecklist` ומאפשרים resume בהמשך.
2. אם אין key, לא חוסמים כניסה לעורך, אבל מסמנים שחסרה יכולת AI.
3. ב-phase 1 ה-onboarding מחבר provider ראשי אחד. `activeProviders` ו-stack רב-ספקי נשמרים למסלול resume או settings reopen, ולכן `academic-dual-research` אינו יעד ברירת מחדל בשלב הראשוני.
4. אם המשתמש בוחר ספק שאינו built-in, ה-flow ממלא אוטומטית את אזור `Custom` עם `baseUrl` ו-`model` ראשוניים במקום להוסיף persistence חדש.
5. במסלול local/custom מוכר, readiness יכול להגיע מ-`baseUrl` + `model` תקינים גם בלי key, אבל רק כשה-endpoint הוא loopback מאושר; בדיקת החיבור משמשת שם כאימות נוסף, לא כפטור חלופי.

### שלב 3: Usage Profile

מטרת השלב: להבין מה המשתמש מנסה לעשות.

תוכן מוצע:

1. תפקיד או זהות מקצועית/אקדמית.
2. use cases מרכזיים.
3. קהל יעד עיקרי.
4. סוגי מסמכים נפוצים.

רוב השדות האלו כבר קיימים ב-`ProfileOnboarding`.

### שלב 4: Style Preferences

מטרת השלב: לתת למערכת בסיס ניסוחי טוב.

תוכן מוצע:

1. tone מועדף.
2. רמת רשמיות.
3. העדפות מבנה.
4. משפטים/מילים להעדיף או להימנע מהן.
5. בחירת home styles מועדפים.

גם כאן, רוב המודל כבר קיים.

### שלב 5: Learning Materials

מטרת השלב: לאפשר למשתמש ללמד את המערכת מתוך עבודות עבר, דוגמאות כתיבה וחומרי קורס, רק אם בחר לעשות זאת.

תוכן:

1. בחירת סוג קובץ דרך ה-categories הקיימות כמו `writing-sample`, `template-example`, `cover-page`, `course-material`.
2. העלאת קבצים בפועל דרך מנגנון ה-upload הקיים.
3. checkbox ברור להרשאה להשתמש בקבצים ללמידת ניסיון וסגנון, כ-view נוסף לאותו consent state שמופיע גם בשלב trust.
4. הסבר שהקבצים נשמרים כחומרי עזר מקומיים וניתנים להסרה.

הערה יישומית:

השלב הזה צריך reuse של `MATERIAL_UPLOAD_PRESETS`, `saveHelperMaterial` ו-`loadProjectMaterials`, לא נתיב חדש לקבצים.

### שלב 6: Agent Team Survey

מטרת השלב: לייצר למשתמש סביבת סוכנים טובה בלי להכריח אותו להבין presetים, workflow modes ותפקידי משנה.

תוכן:

1. שאלה על סוג העבודה המרכזי: אקדמי, מחקר קפדני, מוצר/לקוחות, כתיבה כללית.
2. שאלה על עומק מחקר ובקרה.
3. שאלה על workflow מועדף: `manager-auto`, `circular-team`, `design-first`, `custom-order`.
4. המלצה אוטומטית על preset קיים והצגת הסוכנים שייווצרו.

הערה יישומית:

השלב הזה צריך reuse של `getWorkspaceAgentPresets`, `buildWorkspaceAgentPreset`, `saveRoleAgents` ו-`saveWorkspaceAutomation`.

### שלב 7: Learning and Trust

מטרת השלב: לייצר אמון ולבקש הרשאות בצורה שקופה.

תוכן:

1. הסבר מה נשמר מקומית.
2. הסבר מה עושה `learningConsent`, ואיך שלב החומרים ושלב trust מעדכנים source of truth אחד.
3. אפשרות לבחור `כן עכשיו`, `לא כרגע`, `אשנה אחר כך`, כשבסיום רק הסכמה חיובית נכתבת כ-`learningConsent=true`.

### שלב 8: Completion

מטרת השלב: להחזיר את המשתמש לעבודה מהר.

תוכן:

1. סיכום קצר של מה הוגדר.
2. CTA ראשי `פתח מסמך ראשון`.
3. CTA משני `פתח הגדרות להשלמה`.

## מבנה נתונים מומלץ

### נתונים שיישמרו ב-provider config הקיים

1. `active` provider.
2. `activeProviders` כשהמשתמש מוסיף stack רב-ספקי בהמשך מתוך resume path או settings.
3. `provider.key`.
4. `provider.model` אם המשתמש בחר.

### נתונים שיישמרו ב-profile הקיים

1. `displayName`.
2. `userRole`.
3. `studyTrack`.
4. `institutionName`.
5. `currentCourses`.
6. `writingGoals`.
7. `userBackground`.
8. `defaultAudience`.
9. `preferredDocumentTypes`.
10. `formatPreferences`.
11. `tonePreferences`.
12. `manualPhrases`, `protectedPhrases`, `dislikedStylePatterns`.
13. `preferredHomeStyleIds`.
14. `learningConsent`.
15. `learnedNotes`, `styleTrainingSummary`, `preferredTrainingExamples` כשיש חומרים או סקר style מתקדם.

אם מחליטים להוסיף `firstName` בנפרד מ-`displayName`, צריך לנעול אם זה field חדש אמיתי או רק alias להצגה בתוך ה-flow.

### שדות flow שכדאי להוסיף

1. `onboardingVersion`.
2. `onboardingCompletedAt`.
3. `onboardingDismissedAt`.
4. `onboardingSnoozedUntil`.
5. `onboardingProgressStep`.
6. `onboardingChecklist` עם סטטוסים כמו `providerReady`, `profileReady`, `styleReady`, `materialsReady`, `agentsReady`, `consentReviewed`.

המטרה של השדות החדשים היא לאסוף מצב flow, לא לשכפל מידע עסקי שכבר נשמר במקום אחר.

## ארכיטקטורת יישום מומלצת

### עיקרון

להפריד בין `flow controller` לבין `form content`.

### הצעה פרקטית

1. ליצור wrapper חדש, למשל `src/components/onboarding/OnboardingFlow.jsx`, שינהל צעדים, ניווט, progress ו-CTA-ים.
2. לא לשכתב את `ProfileOnboarding.jsx` מהיסוד; במקום זה, לחלץ ממנו מקטעים או לארח אותו בתוך flow רחב יותר.
3. להשתמש ב-`src/main.jsx` כדי להחליט מתי לפתוח את ה-flow.
4. להשתמש ב-`src/StartScreen.jsx` כ-entry surface למשתמש חדש.
5. להשתמש ב-`src/FileMenu.jsx` כנקודת fallback/עריכה חוזרת.
6. להשתמש ב-`src/services/workspaceLearningService.js` לכל מה שקשור ל-upload, material categories ולמידה מחומרים.
7. לשמור state של onboarding, dismiss, snooze ו-checklist בתוך ה-profile הקיים, לא ב-word preferences.
8. להשתמש ב-presets וה-automation שכבר קיימים ב-`src/services/aiService.js` עבור יצירת צוות סוכנים אוטומטי.

## תוכנית עבודה בשלבים

### Phase 0: Product Decision and Mapping

מטרה: לנעול את חוויית ה-onboarding לפני כתיבת UI.

משימות:

1. לקבוע רשמית שה-flow הוא soft onboarding ולא hard blocker.
2. להגדיר מתי נחשב משתמש כ-`new user`.
3. להגדיר מהו `minimum complete setup`.
4. לנעול את רשימת הצעדים ואת שדות החובה מול שדות הרשות.

Deliverables:

1. מסמך החלטה קצר.
2. checklist של completion.
3. מיפוי שדות קיים מול שדות חסרים.

### Phase 1: Reuse Existing Surfaces

מטרה: להביא onboarding עובד מהר, במינימום סיכון.

משימות:

1. להוסיף flow controller שמחבר בין welcome, provider setup, profile/style, learning materials ו-agent survey.
2. לחבר את `StartScreen` לפתיחת ה-flow.
3. להוסיף שמירת progress ויכולת resume.
4. לחבר העלאת חומרים ל-reuse של `saveHelperMaterial` ו-`loadProjectMaterials`.
5. למפות סקר קצר ל-preset קיים דרך `buildWorkspaceAgentPreset`, לשמור את רשימת ה-agents עם `saveRoleAgents`, ולשמור workflow/preset עם `saveWorkspaceAutomation`.
6. להוסיף סימון completion ברור.
7. להוסיף CTA לכניסה לעורך גם בלי השלמה מלאה.

Deliverables:

1. onboarding ראשון עובד מקצה לקצה.
2. שמירת מצב התקדמות.
3. חזרה ל-flow מתוך settings.
4. אפשרות להעלות חומרי למידה באישור.
5. המלצה אוטומטית לצוות סוכנים.

### Phase 2: Tightening and Validation

מטרה: להקשיח את ההתנהגות והאיכות.

משימות:

1. להוסיף ולידציה נקודתית לכל שלב.
2. להוסיף חיווי ברור לחיבור provider.
3. להוסיף empty states ו-error states טובים.
4. להבטיח שהשלמה של onboarding באמת משפיעה על prompts ועל home configuration.

Deliverables:

1. flow יציב יותר.
2. מסרים ברורים במקרי failure.
3. פחות בלבול בהפעלה ראשונה.

### Phase 3: Personalization Depth

מטרה: להפוך את ה-onboarding ממסך הגדרה למסך שמייצר ערך אישי.

משימות:

1. לקצר את השאלות הארוכות ולהחליף חלק מהן בבחירות מהירות.
2. להוסיף preview של תוצאה או סגנון נבחר.
3. לשלב micro-learning או mini quiz רק אם phase 1 עובד טוב.

Deliverables:

1. onboarding מהיר יותר.
2. התאמה אישית מורגשת יותר.

## קבצים שסביר שיידרשו לשינוי ביישום

1. `src/main.jsx`.
2. `src/StartScreen.jsx`.
3. `src/FileMenu.jsx`.
4. `src/ProfileOnboarding.jsx`.
5. `src/services/aiService.js`.
6. `src/services/workspaceLearningService.js`.
7. קובץ חדש עבור flow controller ורכיבי step אם נבחר לפצל.

## קריטריוני קבלה

1. משתמש חדש רואה מסלול היכרות ברור בהפעלה ראשונה.
2. אפשר להשלים provider setup בלי ללכת לאיבוד בתוך settings.
3. אפשר לדלג לעורך בלי להיתקע.
4. המערכת זוכרת מה כבר הושלם ומה חסר.
5. completion של onboarding נשמר בין פתיחות.
6. ערכי profile/style משפיעים בפועל על generation.
7. המשתמש יכול להעלות עבודות קודמות רק לאחר אישור מפורש.
8. חומרי הלמידה זורמים דרך infrastructure קיים של materials.
9. סקר קצר מייצר preset סוכנים קיים או recommendation שקוף.
10. המשתמש יכול לפתוח מחדש את ה-onboarding מתוך settings.

## סיכונים עיקריים

1. כפילות state בין flow חדש לבין `FileMenu` אם נעתיק לוגיקה במקום למנף אותה.
2. onboarding ארוך מדי שיגרום לדילוג מלא.
3. חסימה מיותרת של העורך אם נהפוך את ה-flow ל-gate קשיח.
4. חוויית provider setup חלשה אם אין success/failure feedback מיידי גם ל-key וגם ל-endpoint מקומי.
5. סיווג שגוי של חומרי למידה אם לא מסבירים למשתמש מה כל upload kind אומר.
6. יצירת צוות סוכנים חדש במקום reuse של preset קיים תיצור מורכבות מיותרת.

## המלצה לביצוע בפועל

ה-slice הראשון שכדאי לממש הוא:

1. Welcome step חדש ב-`StartScreen`.
2. Provider setup step שממנף את state והפעולות של `FileMenu`.
3. חיבור ל-`ProfileOnboarding` הקיים כשני צעדים: `Usage` ו-`Style`, כולל שדות כמו חוג, קורסים ומטרות כתיבה.
4. שלב upload שממחזר את תשתית ה-materials הקיימת באישור מפורש.
5. שלב survey שממליץ על preset סוכנים קיים לפי סוג עבודה ו-workflow mode.
6. שמירת `onboardingProgressStep` ו-`onboardingChecklist` בתוך `personal style profile`, בזמן ש-`provider config` נשאר הבית של מפתחות ה-API.
7. CTA מסיים שמכניס את המשתמש לעורך ומכבה את מסלול ההיכרות עד לפתיחה חוזרת.

זה נותן גרסה ראשונה אמיתית בלי לפרק את המבנים שכבר עובדים.

## החלטה שצריך לנעול לפני מימוש

השאלה המוצרית המרכזית היא:

האם אתה רוצה onboarding שהוא **חלק ממסך הפתיחה הקיים** או **wizard ייעודי מעל כל האפליקציה**?

ההמלצה שלי היא להתחיל מ-**מסלול בתוך StartScreen** ואז, רק אם יש סיבה חזקה, להפריד אותו מאוחר יותר ל-surface עצמאי.
