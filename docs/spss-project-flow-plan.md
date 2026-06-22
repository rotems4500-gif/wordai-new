# SPSS Project Flow — תוכנית

Wizard מונחה ל"עבודת סיום" סטטיסטית. נכנסים מדף הבית (כרטיס) או מהטאב הפשוט.
מצב חדש `appMode === 'spss-project'` לצד `'spss'` הקיים (שנשאר לדברים מהירים).

## 5 השלבים (state machine)

1. **הבנת המשימה** — מדביק טקסט מטלה + מעלה dataset → `analyzeSpssAssignment()` מחזיר task profile
   (אילו ניתוחים, אילו משתנים, איזה תוצר נדרש).
2. **הבאת קוד** — לולאה על `analyses` מה-profile → `generateSpssSyntax()` בלוק לכל ניתוח → master syntax.
3. **הדבקת פלט** — מריץ ב-SPSS, מדביק פלט חזרה (textarea).
4. **מקצה שיפורים** — `critiqueSpssRun()` בודק פלט מול מטלה. נקי → דלג. בעיות → תיקון בלוקים דרך `generateSpssSyntax`.
5. **הסברים + תוצר** — `interpretSpssOutput()` לכל ניתוח + לפי המטלה:
   - `findings-chapter` → `buildSpssFindingsChapter()` → מסמך לעורך (`applyImportedDocument`)
   - `interpretation` → פירוש פלט מוצג/מועתק
   - `code` → ייצוא `.sps` בלבד

## קבצים

- **חדש** `src/services/spssDataIngest.js` — קוראי קבצים משותפים (חולץ מ-SpssSyntaxStudio, dedup).
- **הרחבה** `src/services/spssSyntaxService.js` — `analyzeSpssAssignment`, `critiqueSpssRun`, `buildSpssFindingsChapter`
  (reuse של `callGuidanceProvider`, טוקניזציה, restore).
- **חדש** `src/SpssProjectStudio.jsx` — מעטפת ה-wizard.
- **חיווט** `src/main.jsx` — render appMode חדש + `onEmitDocument` → editor + entry points.
- **כניסה** `src/TopBar.jsx` (כפתור), `src/StartScreen.jsx` (כרטיס), `src/SpssSyntaxStudio.jsx` (קישור "מצב עבודה מלא").

## anti-hallucination
שלב 1+4 ממפים ניתוחים לעמודות אמיתיות בלבד (VAR_n metadata). אסור להמציא משתנים.
