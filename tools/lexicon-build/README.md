# tools/lexicon-build — לקסיקון עברי מתויג

משדרג את מאגר המילים: מ-`synonymsLexicon` (נרדפות בלבד) ללקסיקון עם POS, מין,
מספר, משלב, שורש, בניין, ריבוי ונסמך. זה הידע שמנוע המורפולוגיה (Phase 2)
ומחולל הפרוזה (Phase 4) צריכים.

## הרצה

```bash
node tools/lexicon-build/build.mjs              # תיוג + הרחבה עד 20k
node tools/lexicon-build/build.mjs --tag-only   # רק תיוג 5.7k הלממות הקיימות
node tools/lexicon-build/build.mjs --limit 5    # ריצת עשן קטנה
node tools/lexicon-build/validate.mjs           # שופט-Flash על מדגם 500, שער 90%
```

מפתח Gemini: env `GEMINI_API_KEY` → `WORDAI_CFG` → DPAPI config → keys.local.json
(אותו סדר כמו synonyms-build; הקוד המשותף ב-`../synonyms-build/lib.mjs`).

## מקורות מועמדים להרחבה (בסדר עדיפות)

1. מילים נרדפות מה-synonymsLexicon שאינן לממות בעצמן (~חינם, כבר מסונן).
2. `tools/synonyms-build/wordlists/he-top15k.txt` (רשימת תדירות).
3. רשימות-ליבה מ-Flash לפי 16 תחומים אקדמיים (נשמר ב-checkpoint, לא נקרא שוב).

## פלטים

- `lexicon-tagged.json` — raw, debug.
- `src/services/hebrewLexicon.data.js` — מודול ריצה קומפקטי:
  `lemma -> [pos, g, n, reg, root, binyan, plural, construct]` (nulls בזנב נחתכו).

## Checkpoint

`checkpoint.json` שומר אצוות שהושלמו + הלקסיקון + רשימות ה-Flash. עצירה באמצע
בטוחה; ריצה חוזרת ממשיכה מאיפה שנעצרה. `--fresh` מתחיל מאפס.
