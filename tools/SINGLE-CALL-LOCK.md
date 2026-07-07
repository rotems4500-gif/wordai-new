# נעילת רגרסיה — מצב קריאה-אחת (single-call source mode)

מצב יציב עובד של **מסלול קריאה-אחת ב-Gemini** הוקפא ב-2026-07-05 כדי שנוכל לחזור אליו
בלחיצה אחת אם שינוי עתידי יגרום רגרסיה.

## מה נעול

תג git: **`single-call-lock`** — snapshot מלא של עץ-העבודה (כולל `sourceRetrieval/`,
`v3/`, `tools/`) במצב שאומת ונפרס לאתר. התג לא נוגע ב-`main` ולא בהיסטוריה — הוא רק
אובייקט commit יחיד ששומר את התמונה.

המצב הנעול כולל:
- **מסלול קריאה-אחת**: Gemini מחפש וכותב באותה קריאה (`tools:[{googleSearch:{}}]`), בלי
  pipeline אחזור נפרד.
- **נעילת מקורות מאומתת**: אחרי התשובה, ה-`groundingChunks` מאומתים חיים (redirect של
  Google נפתר ל-URL אמיתי), הופכים ל-`SourceLock` → המשכים יורשים אותו + ביבליוגרפיה
  מוזרקת (`finalizeSingleCallSourceLock` ב-[aiService.js](../src/services/aiService.js)).
- **ניתוב מכסה-אקדמית**: מטלות עם מכסת מקורות אקדמיים עוברות ל-pipeline (Scholar) ולא
  למסלול קריאה-אחת.
- **גדרי סגנון-מול-תוכן**: פרופיל הסגנון = סגנון בלבד לעולם לא נושא; חסימת פרומפט משובש
  (mojibake) לפני קריאת API.

## איך מחזירים (הכפתור)

```powershell
# תצוגה מקדימה — מה ישתנה, בלי לגעת בכלום:
.\tools\restore-single-call.ps1

# החזרה בפועל של קבצי-הליבה של המסלול:
.\tools\restore-single-call.ps1 -Apply

# החזרת כל עץ-העבודה למצב הנעול:
.\tools\restore-single-call.ps1 -Apply -Full
```

אחרי החזרה: `npm run build` ואז (לאתר) `npx firebase deploy --only hosting`.

## איך מאמתים שהמצב תקין

הרץ את ה-LAB (`node tools/test-bench/server.mjs`) והפעל יצירת-מסמך. רצף האירועים של מצב
תקין:

```
single-call-source-mode  →  single-call-source-lock (N מקורות אומתו)  →  verified-source-bibliography-appended
```

למטלה אקדמית (מכסת מקורות אקדמיים) — רצף תקין הוא ניתוב ל-pipeline:

```
source-retrieval-plan-fast-path (academic:...)  →  verified-source-retrieval-success
```

## אם התג נמחק בטעות

צור מחדש מ-snapshot של עץ-העבודה (מתוך שורש הריפו, כשהמצב הרצוי בעץ-העבודה):

```bash
git add -A
git tag -f single-call-lock $(git commit-tree $(git write-tree) -p HEAD -m "single-call regression lock")
git reset -q
```
