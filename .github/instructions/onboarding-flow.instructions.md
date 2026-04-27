---
applyTo: "src/**/{main.jsx,StartScreen.jsx,FileMenu.jsx,ProfileOnboarding.jsx,aiService.js,workspaceLearningService.js,agentConfig.js}"
description: "Use when implementing onboarding, first-run setup, welcome flow, API key setup, provider config wiring, profile onboarding, style preferences, previous-work upload, learning materials, agent preset recommendation, workspace automation, resume flow, partial setup, learning consent, completion CTA, or StartScreen/settings reopen behavior."
---

# Onboarding Flow Rules

הקובץ הזה מגדיר את החוזה המשותף לכל סוכן שנוגע ב-onboarding של משתמש חדש בפרויקט הזה.

## עקרונות מחייבים

1. ה-onboarding כאן הוא soft onboarding, לא hard gate. המשתמש תמיד יכול להגיע לעורך גם אם ההגדרה חלקית.
2. ממנפים קודם את המשטחים הקיימים: `src/main.jsx`, `src/StartScreen.jsx`, `src/FileMenu.jsx`, `src/ProfileOnboarding.jsx`, `src/services/aiService.js`, `src/services/workspaceLearningService.js`.
3. לא מוסיפים שכבת persistence חדשה. provider ו-API keys נשארים ב-provider config הקיים; profile, style וכל מצב flow של onboarding נשמרים ב-personal style profile הקיים.
4. לפני שמוסיפים שדות flow, בודקים קודם את השדות שכבר קיימים בסכמה, במיוחד: `onboardingCompletedAt`, `onboardingDismissedAt`, `onboardingSnoozedUntil`, `onboardingVersion`, `learningConsent`.
5. אם נדרש progress נוסף, מוסיפים רק שדות מצב משלימים כמו `onboardingProgressStep` או `onboardingChecklist`, בלי לשכפל שדות דחייה/השלמה קיימים.
6. העלאת עבודות עבר ודוגמאות כתיבה צריכה reuse של `MATERIAL_UPLOAD_PRESETS`, `saveHelperMaterial` ו-`loadProjectMaterials`.
7. יצירת צוות סוכנים אוטומטית צריכה reuse של `getWorkspaceAgentPresets`, `buildWorkspaceAgentPreset`, `saveRoleAgents` ו-`saveWorkspaceAutomation`.
8. אם צריך לחבר onboarding חדש, מעדיפים flow controller קטן שעוטף משטחים קיימים, ולא שכפול של טפסים או save logic.

## עקרונות UX

1. phase 1.5 צריך להיות קצר: Welcome, Provider Setup, Usage, Style, Learning Materials, Agent Team Survey, Trust, Completion.
2. אם אין API key, מציגים מצב חלקי ו-CTA להשלמה, לא error state שחוסם את כל האפליקציה.
3. מסמכים ועבודות עבר מועלים רק באישור מפורש, עם הסבר ברור למה כל סוג קובץ ישמש.
4. completion screen צריך להוביל לעורך או להגדרות, לא לעוד שאלות.
5. ההסבר על learning ו-trust חייב להיות תכליתי ושקוף, בלי שפה כבדה.
6. אם מוסיפים preview חדש, משתמשים ב-[docs/new-user-onboarding-plan.md](../../docs/new-user-onboarding-plan.md) וב-[preview-onboarding.html](../../preview-onboarding.html) כ-reference חזותי וזרימתי בלבד.
7. מקור האמת לסכמה, לשמות שדות ולשמירה בפועל הוא הקוד הקיים ב-`src/services/aiService.js`, `src/FileMenu.jsx` ו-`src/ProfileOnboarding.jsx`.

## עקרונות מימוש

1. מתחילים תמיד מה-controlling surface הקרוב ביותר, בדרך כלל `src/main.jsx` או `src/StartScreen.jsx`.
2. לא מזיזים לוגיקת save קיימת בלי סיבה חזקה. קודם מחברים, אחר כך מחלצים.
3. בכל slice חדש, בודקים קודם את המסלול הזול ביותר שיכול להפריך את ההנחה.
4. ב-first pass לא מכניסים cloud sync, auth חדש, או flows ארוכים של למידת סגנון.
5. במיפוי survey לצוות סוכנים, ברירת המחדל היא preset קיים; `custom-workspace` הוא fallback ולא ברירת מחדל.
6. אם יש ספק בין "מסך חדש" לבין "הרחבת מסך קיים", ברירת המחדל היא reuse של הקיים.

## הגדרת הצלחה

1. משתמש חדש מבין מה הערך, מגדיר provider בסיסי, בוחר שימושים וטון, ויכול להיכנס לעבודה מהר.
2. אם הוא רוצה, הוא מעלה מסמכים ועבודות קודמות ללמידת ניסיון באישור מפורש.
3. סקר קצר מייצר המלצה שקופה לצוות סוכנים ול-workflow מתאים.
4. משתמש קיים יכול לחזור ל-onboarding מתוך settings בלי לאבד state.
5. הנתונים שנאספו משפיעים בפועל על prompts, home defaults, style guidance או workspace automation.