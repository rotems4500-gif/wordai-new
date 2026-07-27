# חתימת קוד — Azure Trusted Signing

## הבעיה

`WordFlow-AI_x.y.z_x64-setup.exe` יוצא מהבנייה **לא חתום**. Windows SmartScreen מציג לכל מוריד
מסך כחול — "Windows הגן על המחשב שלך · מפרסם: לא ידוע" — ודורש שתי לחיצות נוספות
("מידע נוסף" → "הפעל בכל מקרה") כדי להתקין.

זה לא באג בקוד ואי אפשר לתקן אותו בקוד. Windows מסמן כך כל exe שאין לו תעודת חתימה
מיצרן מזוהה. עד שתהיה תעודה, האתר מסביר את האזהרה מראש בכרטיס ההורדה
([DesktopDownloadCard.jsx](../src/components/DesktopDownloadCard.jsx)) — זה מפחית נטישה, לא מבטל את המסך.

⚠️ **שים לב לחלוקה:** יש כאן **שני מפתחות שונים לגמרי** שקל לבלבל ביניהם:

| | מה זה חותם | מה קורה בלעדיו |
|---|---|---|
| **מפתח ה-updater** (`~/.tauri/wordflow-updater-v2.key`) | את `latest.json` — כדי שהאפליקציה תסכים להתקין עדכון | אין עדכונים אוטומטיים בכלל |
| **תעודת חתימת קוד** (Azure) | את ה-exe עצמו — כדי ש-Windows יסמוך עליו | אזהרת SmartScreen בהתקנה |

הם לא מחליפים זה את זה. צריך את שניהם.

## ההחלטה: Azure Trusted Signing

נבחר על פני תעודת EV (‎$300–600 לשנה + טוקן חומרה פיזי) ותעודת OV רגילה
(משלמים ועדיין מקבלים אזהרה, כי המוניטין נצבר לאט לפי מספר ההורדות).

Azure Trusted Signing: בסביבות ‎$10 לחודש, בענן, בלי טוקן חומרה, ותומך גם באימות זהות
של יחיד ולא רק של חברה. **המחירים והתנאים משתנים — לאמת לפני רכישה.**

## הקמה חד-פעמית

1. ב-Azure Portal: ליצור משאב **Trusted Signing Account**, ובתוכו **Certificate Profile**.
2. לעבור אימות זהות (Identity Validation). זה השלב הארוך — יכול לקחת ימים.
3. ליצור **Service Principal** (App Registration) ולתת לו את התפקיד
   **Trusted Signing Certificate Profile Signer** על החשבון.
4. להתקין את הכלי שמבצע את החתימה:
   ```
   cargo install trusted-signing-cli
   ```
   (דורש Rust — ממילא נדרש לבניית הדסקטופ.)

## בנייה חתומה

הקונפיגורציה יושבת ב-[tauri.signing.conf.json](../src-tauri/tauri.signing.conf.json) **בנפרד**
מ-`tauri.conf.json`. זה מכוון: אם `signCommand` היה בקונפיג הראשי, כל בנייה במכונה בלי
הכלי והפרטים הייתה נכשלת — כולל בנייה מקומית לבדיקה.

לפני הבנייה, להגדיר את פרטי ה-Service Principal בסביבה:

```powershell
$env:AZURE_TENANT_ID = "..."
$env:AZURE_CLIENT_ID = "..."
$env:AZURE_CLIENT_SECRET = "..."
```

ואז:

```
npm run desktop:build:signed
```

⚠️ **לעדכן את [tauri.signing.conf.json](../src-tauri/tauri.signing.conf.json) לפני השימוש הראשון** —
הערכים שם (`-e` אזור, `-a` שם החשבון, `-c` שם פרופיל התעודה) הם מצייני-מקום. האזור חייב
להתאים לאזור שבו נוצר החשבון (`weu` = West Europe).

## אחרי הבנייה

```
npm run desktop:release
```

בונה את `latest.json`, מאמת שהחתימה של ה-**updater** נעשתה במפתח הנכון, ומדפיס רשימת העלאה.
ר' [scripts/make-latest-json.mjs](../scripts/make-latest-json.mjs).

## איך לוודא שהחתימה תפסה

```powershell
Get-AuthenticodeSignature "src-tauri\target\release\bundle\nsis\WordFlow-AI_x.y.z_x64-setup.exe" | Format-List Status, SignerCertificate
```

`Status: Valid` = חתום. `NotSigned` = הבנייה רצה בלי החתימה (בדרך כלל `desktop:build` במקום
`desktop:build:signed`, או משתני סביבה חסרים).
