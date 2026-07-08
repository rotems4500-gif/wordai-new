# tools/synonyms-build

כלי **חד-פעמי, אופליין** ליצירת לקסיקון נרדפות בעברית מתוך Gemini. לא רץ בזמן ריצה של
האפליקציה ולא מחובר ל-build — מריצים ידנית מתי שרוצים לרענן את הלקסיקון.

## מה זה עושה

1. אוסף מילות זרע (seed words) מהקורפוס המקומי ב-`tools/detector-train/samples/` (human.txt +
   ai.txt) — טוקניזציה, הסרת ניקוד/פיסוק, סינון stop-words, ~800 מילים נפוצות.
2. בנוסף, שולח ~25 פרומפטים "דומיין" קבועים (כתיבה אקדמית, משפטית, רגשות, פעלי תנועה/דיבור/חשיבה,
   שמות תואר, ביטויי זמן/סיבתיות וכו') שמייצרים מילים ונרדפות ישירות בלי תלות בסיד.
3. לכל batch (40 מילות זרע, או פרומפט דומיין אחד) — קריאה ל-Gemini (`gemini-2.5-flash`) עם
   `responseMimeType: application/json`, ומבקש עבור כל מילה רשימת "senses" (משמעויות):
   `{"מילה": [{"s": ["נרדף1","נרדף2"], "c": ["הקשר1","הקשר2"]}]}`.
4. ממזג את כל התוצאות ללקסיקון אחד: נורמליזציה (הסרת ניקוד/רווחים), מיזוג לממות כפולות,
   דה-דופ של נרדפות, הסרת self-reference והסרת נרדפות ארוכות מדי (>3 מילים).
5. כותב שני קבצים:
   - `tools/synonyms-build/lexicon.json` — JSON גולמי (pretty, לבדיקה/דיבוג).
   - `src/services/synonymsLexicon.data.js` — מודול JS דחוס (compact JSON.stringify) שהאפליקציה
     צורכת בזמן ריצה (בלי קריאות AI).

## הרצה

```bash
node tools/synonyms-build/build.mjs                 # הכל: seed + domains
node tools/synonyms-build/build.mjs --seed-only      # רק batches מבוססי-קורפוס
node tools/synonyms-build/build.mjs --domains-only   # רק פרומפטי דומיין קבועים
node tools/synonyms-build/build.mjs --limit 3        # smoke test — רק 3 batches ראשונים
node tools/synonyms-build/build.mjs --fresh          # מתעלם מ-checkpoint קיים, מתחיל מאפס
```

## מפתח API

סדר עדיפות זהה לתבנית הקיימת ב-`tools/test-bench/server.mjs`:

1. env `GEMINI_API_KEY` / `GOOGLE_API_KEY`
2. env `WORDAI_CFG` (מחרוזת JSON בצורת provider-config)
3. פענוח DPAPI של `%APPDATA%/com.wordai.assistant/ai-provider-config.json` (אותם מפתחות
   שהאפליקציה עצמה משתמשת בהם — דרך PowerShell `ProtectedData.Unprotect`)
4. `tools/test-bench/keys.local.json` (git-ignored)

## Checkpoint / resume

אחרי כל batch נכתב `tools/synonyms-build/checkpoint.json` (רשימת batch-ids שהושלמו + הלקסיקון
המצטבר עד כה). אם הריצה נקטעת (rate limit, קריסה, Ctrl+C) — הרצה חוזרת ללא `--fresh` תדלג על
batches שכבר הושלמו ותמשיך מאיפה שנעצר. `--fresh` מוחק את ההתקדמות ומתחיל מחדש.

יש retry אוטומטי (פעם אחת, אחרי המתנה של 20 שניות) על שגיאות `429`/`5xx`. בין batches יש השהיה
של שנייה כדי לא להציף את ה-API.

## מבנה הפלט

```js
export const SYNONYMS_LEXICON = {
  "למה": [
    [ ["נרדף1", "נרדף2"], ["הקשר1", "הקשר2", "הקשר3"] ],
    // ... senses נוספים לאותה למה
  ],
};
```

כל מילת-בסיס (lemma) ממופה למערך של "senses" (משמעויות). כל sense הוא זוג מערכים:
`[synonyms[], contextKeywords[]]`. שירות זמן-ריצה שצורך את הקובץ (`synonymsLexicon.data.js`)
יכול לבחור sense לפי חפיפה בין מילות ההקשר לטקסט המקורי.
