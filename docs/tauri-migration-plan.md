# Tauri Migration — WordFlow AI Desktop (replacing Electron)

מחליפים את אפליקציית הדסקטופ הכבדה (Electron ~150MB) ב-**Tauri** (~13MB exe, משתמש ב-WebView2 של Win11). **האתר וה-PWA שלו לא נגעו בהם.** ה-frontend (React/TipTap) רץ ללא שינוי.

## ארכיטקטורה
- `src-tauri/` — מעטפת Tauri (Rust). Rust מינימלי בכוונה.
  - [proxy.rs](../src-tauri/src/proxy.rs) — CORS proxy native (reqwest) + allowlist, חוזה זהה ל-Electron.
  - [fs_ops.rs](../src-tauri/src/fs_ops.rs) — primitives של קבצים: app-data scoped (config/settings/materials) + נתיב חופשי (קבצים שהמשתמש בחר).
  - [dialog_ops.rs](../src-tauri/src/dialog_ops.rs) — דיאלוגי פתיחה/שמירה native (tauri-plugin-dialog).
- [src/desktopShim.js](../src/desktopShim.js) — משחזר את `window.desktopApp` מעל הפקודות של Tauri. נטען ראשון ב-[main.jsx](../src/main.jsx). כל ההמרות (docx via mammoth/buildDocxBlob, index.json) ב-JS.
- [src/services/materialExtractBrowser.js](../src/services/materialExtractBrowser.js) — חילוץ טקסט בדפדפן (docx/txt/xlsx/pptx).

## עקרון מפתח
ה-frontend כבר `?.`-guarded וכבר יש לו fallbacks בדפדפן (SPSS .sav, docx export). ה-shim מספק רק את מה שצריך native ומשפר UX; מה שלא — נופל לבד בחן.

## סטטוס

### ✅ הושלם ומאומת
- MSVC + Windows SDK מותקנים. cargo build נקי. `app.exe` 13MB.
- ה-frontend רונדר בחלון Tauri (daisyUI + TipTap אותחלו) — אומת פעמיים מלוג ה-webview.
- ה-shim נטען בלי שגיאות (deps אופטמו, אפס Uncaught).
- `npm run build` + frontend נקי עם ה-shim.
- **ממופה ב-shim:** proxy(+abort), provider-config, app-settings, open/save dialogs (docx/txt/html/pptx), local materials (+index.json), extractMaterialText, windowContext, versions.
- **נופל לבד (לא ב-shim):** parseSpssSavData (fallback בדפדפן ב-[spssDataIngest.js](../src/services/spssDataIngest.js)), fetchBrowserPageSnapshot (מושבת בחן).

### ✅ Phase 2 הושלם (קוד)
- **חילוץ PDF + OCR** — [materialExtractBrowser.js](../src/services/materialExtractBrowser.js): pdfjs-dist ל-PDF, tesseract.js (heb+eng) לתמונות. (OCR מוריד שפה מ-CDN — דורש רשת; offline בהמשך.)
- **עדכונים אוטומטיים** — [updater.rs](../src-tauri/src/updater.rs) (tauri-plugin-updater) + פקודות check/install, מחובר ב-shim. config ב-tauri.conf.json: endpoint ל-GitHub releases + pubkey. `createUpdaterArtifacts: true`. מפתח חתימה: `~/.tauri/wordflow-updater.key` (פרטי — **לא בריפו**).
  - **כדי שיעבוד בפועל:** ב-CI להגדיר `TAURI_SIGNING_PRIVATE_KEY(_PATH)` + `_PASSWORD`, ולהעלות את ה-`.sig` + `latest.json` ל-release.
- **file associations** — docx/txt/html ב-tauri.conf.json + לכידת argv ב-[lib.rs](../src-tauri/src/lib.rs) (`take_pending_open_file`) → `consumePendingOpenDocument` ב-shim (cold start).

### ⏳ נותר
- **second-instance** (פתיחת קובץ כשהאפליקציה כבר רצה) — צריך tauri-plugin-single-instance + emit `onOpenExternalDocument`. כרגע רק cold-start.
- **multi-window** (createAppWindow) — כרגע no-op.
- **page snapshot** — render serverless/headless אם נדרש (אופציונלי).

### ✅ הצפנה + מיגרציה (הושלם)
1. **הצפנה:** config/settings מוצפנים DPAPI ([secure.rs](../src-tauri/src/secure.rs), windows-sys CryptProtectData) — מקביל ל-safeStorage. קובץ עם magic `DPAPI1\n` + blob; plaintext נקרא כ-fallback.
2. **מיגרציה:** [lib.rs](../src-tauri/src/lib.rs) `migrate_from_electron` מעתיק `project-materials` מתיקיית Electron (`word-ai-assistant` + legacy) חד-פעמית (marker `.electron-migrated`). config/settings **לא** מוגרים (הצפנת Electron לא תואמת) → מפתחות API מוזנים מחדש פעם אחת.

### ✅ Phase 3 — Electron הוסר (הושלם)
- נמחקו: `electron/`, scripts `after-pack.cjs`/`guarded-local-publish.cjs`.
- package.json: הוסרו `main`, תלויות electron-*/builder/rcedit/concurrently/wait-on, ובלוק electron-builder. scripts `desktop:dev`/`desktop:build`/`dist:win` → Tauri.
- CLAUDE.md עודכן ל-Tauri.
- ה-build של האתר (`vite build`) נשאר תקין — לא נגענו ב-Firebase/PWA/manifest/sw.

### נותר (לא חוסם; מומלץ לפני שחרור רחב)
- **בדיקה אינטראקטיבית** של כל הפיצ'רים (לא ניתן בסביבה האוטומטית).
- **icons** ל-Tauri (`src-tauri/icons` ברירת מחדל — להחליף ל-app-icon).
- **CI**: env לחתימה + יצירת/העלאת `latest.json` ל-release.
- **OCR offline** (כרגע tesseract מוריד שפה מ-CDN).
- **multi-window** (createAppWindow כרגע no-op).

## הרצה ובנייה
```bash
npx tauri dev      # dev: vite http על 1420 + חלון Tauri
npx tauri build    # release: installer NSIS + exe ב-src-tauri/target/release/
```
- dev port **1420 http** (WebView2 דוחה את ה-self-signed HTTPS של 3001). לא מתנגש באתר/3001.
- הערה: בסביבה לא-אינטראקטיבית החלון נפתח ונסגר; בדיקת הפיצ'רים האינטראקטיביים (דיאלוגים, proxy) דורשת הרצה אינטראקטיבית מהטרמינל שלך.
