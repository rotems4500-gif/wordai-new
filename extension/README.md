# WordFlow Clipper

תוסף Chrome (Manifest V3) לקליפת תוכן מהאינטרנט ישירות ל-WordFlow AI: עמודים שלמים (עם חילוץ תוכן קריא דרך Readability), קטעי טקסט מסומנים, תמונות, ואזורים נבחרים בעמוד. הקליפים נכתבים ל-Firestore/Storage תחת המשתמש המחובר, וה-app הראשי (WordFlow AI) קורא אותם משם.

## מבנה

```
extension/
  manifest.json        # הגדרת התוסף (MV3)
  build.mjs             # סקריפט בילד מבוסס esbuild
  src/
    background.js       # service worker: תפריטי הקשר + כל לוגיקת הקליפה
    content/extract.js           # Readability על שכפול DOM (מוזרק לעמוד)
    content/areaSelectOverlay.js # שכבת גרירה לבחירת אזור מהעמוד
    popup/               # ה-UI של הפופאפ (Hebrew RTL)
    lib/
      firebaseClient.js  # אתחול Firebase (config מוזרק בזמן build)
      auth.js            # התחברות Google דרך chrome.identity.launchWebAuthFlow
      clipWriter.js       # כתיבת מסמכי הקליפ ל-Firestore/Storage
      settings.js        # יעד ברירת מחדל (chrome.storage.sync)
  icons/                # 16/32/48/128 px (נגזרו מ-public/app-icon-512.png)
dist-extension/          # פלט הבילד (נטען ב-chrome://extensions, לא בריפו)
```

## התקנה ופיתוח

```bash
cd extension
npm install
node build.mjs      # או: npm run build (מריפו השורש: npm run build:extension)
```

הבילד:
1. קורא את `.env.local` בשורש הריפו (מפתחות `VITE_FIREBASE_*`) ומזריק אותם כ-`__FIREBASE_CONFIG__`.
2. מבנדל את כל הקבצים דרך esbuild ל-`dist-extension/` (בשורש הריפו, לא בתוך `extension/`).
3. מעתיק manifest.json, popup.html/css, ואת האייקונים.

### טעינה ב-Chrome

1. `chrome://extensions`
2. הפעל "מצב מפתח" (Developer mode) בפינה הימנית העליונה.
3. "טען פריט לא ארוז" (Load unpacked) → בחר את תיקיית `dist-extension/`.
4. אחרי כל שינוי בקוד: `node build.mjs` ואז לחיצה על רענון (⟳) בכרטיס התוסף.

## הגדרת OAuth (חד-פעמי, נדרש כדי שההתחברות תעבוד)

ההתחברות משתמשת ב-`chrome.identity.launchWebAuthFlow` (זרימת implicit, לא `chrome.identity.getAuthToken`), ולכן אין `oauth2` ב-manifest — אבל עדיין צריך client ID מ-Google Cloud Console:

1. להיכנס ל-[Google Cloud Console](https://console.cloud.google.com/) → הפרויקט שמשמש את wordai-website (אותו פרויקט שמוגדר ב-`.env.local` תחת `VITE_FIREBASE_PROJECT_ID`).
2. APIs & Services → Credentials → Create Credentials → OAuth client ID.
3. Application type: **"Chrome Extension"** (אם לא זמין באזור שלכם — אפשר "Web application" עם Authorized redirect URI כמו בסעיף 5).
4. לטעון את התוסף פעם אחת (load unpacked) כדי לקבל extension ID. מומלץ לקבע `key` ב-`manifest.json` כדי שה-ID לא ישתנה בין מכונות/פריסות מחדש (ראו [תיעוד Chrome](https://developer.chrome.com/docs/extensions/reference/manifest/key)) — כרגע אין `key` קבוע, כך שה-ID עלול להשתנות בין טעינות.
5. Authorized redirect URI: `https://<EXTENSION_ID>.chromiumapp.org/` — את ה-URI המדויק אפשר לראות בקונסולת ה-background service worker (מודפס עם `console.info` בכל ניסיון התחברות), או לחשב עם `chrome.identity.getRedirectURL()`.
6. להעתיק את ה-Client ID ולהדביק אותו בקובץ [`src/lib/auth.js`](src/lib/auth.js) במקום `OAUTH_CLIENT_ID = 'REPLACE_WITH_CHROME_EXTENSION_OAUTH_CLIENT_ID'`, ואז לבנות מחדש (`node build.mjs`).

בלי השלב הזה, לחיצה על "התחברות עם Google" בפופאפ תיכשל עם הודעה ברורה במקום שגיאה שקטה.

## מצבי קליפה (תפריט קליק ימני)

| פעולה | תפריט הקשר | לוגיקה |
|---|---|---|
| עמוד שלם | קליק ימני בעמוד / על אייקון התוסף | `content/extract.js` (Readability על שכפול DOM) → טקסט |
| קטע מסומן | קליק ימני על טקסט מסומן | `info.selectionText` ישירות |
| תמונה | קליק ימני על תמונה | fetch מה-SW; אם נכשל (CORS) → fetch מתוך הדף עצמו |
| אזור בעמוד | קליק ימני בעמוד / על אייקון התוסף | שכבת גרירה (`areaSelectOverlay.js`) → `captureVisibleTab` → חיתוך ב-OffscreenCanvas |

הצלחה/כישלון מוצגים כ-badge (✓/!) על אייקון התוסף — אין הרשאת `notifications`.

## סכימת הקליפ (Firestore)

`users/{uid}/clips/{clipId}`:

```js
{
  kind: 'text' | 'image',
  status: 'pending',
  captureMode: 'page' | 'selection' | 'image' | 'area',
  title, text: string|null, sourceUrl, domain,
  createdAt: serverTimestamp(),
  destination: 'material' | 'source' | 'inbox',
  projectId: null,          // שלב עתידי — בחירת פרויקט מהפופאפ
  storagePath: string|null, // רק לתמונות (Storage) — לעולם לא מוטבע ב-Firestore
  truncated: boolean,       // טקסט קוצץ ב-900,000 תווים
  errorMessage: null,
  processedAt: null,
}
```

## ידוע/נשאר לשלב הבא

- אין UI לבחירת פרויקט מהפופאפ עדיין — יעד `source` בלי `projectId` מנותב ל-inbox באפליקציה הראשית.
- אין `key` קבוע ב-manifest.json, כך שה-extension ID (ולכן ה-redirect URI ל-OAuth) עלול להשתנות אם התוסף נטען מחדש מתיקייה אחרת.
