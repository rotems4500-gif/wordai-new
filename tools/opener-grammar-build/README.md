# opener-grammar-build — אימון הדקדוק הגלובלי של הפתיחים

בונה את `src/services/openerGrammar.data.js` — דקדוק סלוטים ברמת מילה בודדת
שממנו `styleOpenerService.composeOpeners` מרכיב פתיחי סעיפים בזמן ריצה **בלי
שום קריאת API**. Gemini Flash משמש כאן בלבד, אופליין, לתיוג ולשיפוט (אגורות).

## איך ההרכבה נשארת דקדוקית בלי מודל

שתי משפחות תבניות בלבד:

1. **אימפרסונלית** — `[connector?] stance framingVerb.inf reference`
   ("לסיכום, ניתן לומר כי …"). אימפרסונלים ושמות פועל לא מוטים — חסין התאם.
2. **נושא** — `[connector?] subjectNP framingVerb.fin reference`
   ("עבודה זו תבחן את …"). פעלים נטויים שמורים **מוטים מראש** עם `{g,n}`;
   המנוע מסנן לצורה התואמת את הנושא. אין ייצור מורפולוגי בזמן ריצה.

משלימים: לכל פועל `tails` — אילו מילות reference הוא מקבל ("תעסוק"→"ב",
"תבחן"→"את"). המנוע מצליב, לא מנחש.

## קבצים

- `seed-grammar.json` — גרעין ידני (~180 ערכים). רצפת האיכות; תמיד ממוזג.
- `build.mjs` — תיוג Flash של הלקסיקון (5,724 lemmas, אצוות 100, checkpoint/resume)
  → מיזוג עם ה-seed → `grammar.json` + emit המודול. דגלים: `--fresh`, `--limit N`,
  `--emit-only` (בלי רשת).
- `validate.mjs` — שופט Flash שני על מדגם 500 תיוגי-סלוט; סלוט <85% הסכמה →
  ביקורת ידנית (`validate-report.json`).
- `checkpoint.json` — התקדמות התיוג. לא בגיט? כן בגיט — זול ומאפשר resume בכל מכונה.

## הרצה

```bash
node tools/opener-grammar-build/build.mjs        # תיוג (resume) + emit
node tools/opener-grammar-build/validate.mjs     # שיפוט מדגם
node tools/test-bench/run-openers-compose.mjs    # בדיקת ההרכבה (אפס רשת)
node tools/test-bench/judge-composed-openers.mjs # שופט Flash על הפלט
node tools/test-bench/openers-gate.mjs           # שער רגרסיה
```

מפתח: env `GEMINI_API_KEY` / config מוצפן DPAPI של האפליקציה / keys.local.json.

## האימון האישי (הצד השני של המטבע)

`src/services/openerProfileService.js` — פירוק הפתיחים הממוקשים של המשתמש
למילות סלוט מול הדקדוק הזה + לולאת משוב (הוספה=+2, רענון=−1). המיזוג:
`score = globalBase · (1 + λ·personalBoost)`, `λ = min(0.8, docs/10)`.
בדיקה: `node tools/test-bench/run-opener-profile.mjs`.
