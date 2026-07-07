# restore-single-call.ps1 — כפתור החזרה למצב היציב של "מסלול קריאה-אחת".
#
# רקע: התג single-call-lock מקפיא את המצב העובד (2026-07-05) של מצב קריאה-אחת ב-Gemini
# (כתיבה+חיפוש בקריאה אחת, נעילת מקורות מאומתת מ-groundingChunks, ניתוב מכסה-אקדמית
# ל-pipeline, וגדרי סגנון-מול-תוכן). אם שינוי עתידי גרם לרגרסיה במצב הזה — הרץ את הסקריפט
# הזה כדי להחזיר את הקבצים הרלוונטיים למצב היציב, בלחיצה אחת.
#
#   .\tools\restore-single-call.ps1              # תצוגה מקדימה בלבד (מה ישתנה) — לא נוגע בכלום
#   .\tools\restore-single-call.ps1 -Apply       # מחזיר את קבצי המסלול הקריטיים מהתג
#   .\tools\restore-single-call.ps1 -Apply -Full # מחזיר את כל עץ-העבודה מהתג (כל הקבצים)
#
# הערה: החזרה משנה קבצים בעץ-העבודה בלבד. אחרי החזרה — הרץ `npm run build` (ולפריסה
# לאתר: `npx firebase deploy --only hosting`).

[CmdletBinding()]
param(
    [switch]$Apply,   # בלי הדגל: preview בלבד. עם הדגל: מבצע את ההחזרה בפועל.
    [switch]$Full     # מחזיר את כל עץ-העבודה מהתג, לא רק את קבצי המסלול הקריטיים.
)

$ErrorActionPreference = 'Stop'
$Tag = 'single-call-lock'

# הקבצים/התיקיות שמצב קריאה-אחת תלוי בהם ישירות. החזרה סלקטיבית שלהם מטפלת ברגרסיה
# מבלי לגעת בשאר העבודה שאולי התקדמה מאז.
$CriticalPaths = @(
    'src/services/aiService.js',
    'src/services/workspaceLearningService.js',
    'src/services/sourceRetrieval',
    'src/services/sourceIntent.js',
    'src/services/sourceQueryBuilder.js',
    'src/v3/orchestration/runScope.js',
    'src/v3/orchestration/retrievalGate.js'
)

# ── ודא שנמצאים בשורש הריפו ושהתג קיים ──────────────────────────────────────
$RepoRoot = (& git rev-parse --show-toplevel 2>$null)
if (-not $RepoRoot) { Write-Error 'לא נמצא ריפו git. הרץ מתוך תיקיית הפרויקט.'; exit 1 }
Set-Location $RepoRoot

$tagCommit = (& git rev-parse --verify --quiet "$Tag^{commit}")
if (-not $tagCommit) {
    Write-Error "התג '$Tag' לא קיים. לא ניתן להחזיר. (נוצר בסשן ה-single-call; אם נמחק — צור מחדש מ-snapshot.)"
    exit 1
}
Write-Host "מצב יציב נעול בתג '$Tag' → commit $($tagCommit.Substring(0,10))" -ForegroundColor Cyan

$paths = if ($Full) { @('.') } else { $CriticalPaths }
$scope = if ($Full) { 'כל עץ-העבודה' } else { "$($CriticalPaths.Count) נתיבי-ליבה של מסלול קריאה-אחת" }

# ── תצוגה מקדימה: מה שונה בין עכשיו לבין המצב הנעול ─────────────────────────
# חלק מקבצי-הליבה (sourceRetrieval/, v3/, sourceIntent, sourceQueryBuilder) עדיין
# untracked ב-git. `git diff <tag>` מתעלם מ-untracked כבסיס ומציג אותם כ"מחיקות" מלאות
# גם כשהם זהים. כדי לקבל תצוגה מדויקת: staging זמני של הנתיבים → diff מול התג → unstage.
# ה-staging לא משנה קבצים בעץ-העבודה ומבוטל תמיד ב-finally.
Write-Host "`nהבדלים בין עץ-העבודה הנוכחי למצב הנעול ($scope):" -ForegroundColor Yellow
& git add -- @paths 2>$null
try {
    $diffStat = (& git diff --stat --cached "$Tag" -- @paths)
} finally {
    & git reset -q -- @paths 2>$null
}
if (-not $diffStat) {
    Write-Host '  (אין הבדלים — עץ-העבודה כבר תואם למצב הנעול)' -ForegroundColor Green
    if (-not $Apply) { exit 0 }
} else {
    $diffStat | ForEach-Object { Write-Host "  $_" }
}

if (-not $Apply) {
    Write-Host "`nזו תצוגה מקדימה בלבד. להחזרה בפועל הוסף -Apply:" -ForegroundColor Magenta
    Write-Host '  .\tools\restore-single-call.ps1 -Apply' -ForegroundColor Magenta
    if (-not $Full) { Write-Host '  .\tools\restore-single-call.ps1 -Apply -Full   # להחזרת כל העץ' -ForegroundColor Magenta }
    exit 0
}

# ── ביצוע ההחזרה ────────────────────────────────────────────────────────────
Write-Host "`nמחזיר את הקבצים מהמצב הנעול..." -ForegroundColor Cyan
& git checkout "$Tag" -- @paths
if ($LASTEXITCODE -ne 0) { Write-Error 'ההחזרה נכשלה (git checkout). בדוק הודעות שגיאה למעלה.'; exit 1 }

Write-Host 'ההחזרה הושלמה. הקבצים חזרו למצב היציב.' -ForegroundColor Green
Write-Host "`nהצעדים הבאים:" -ForegroundColor Yellow
Write-Host '  1. npm run build' -ForegroundColor Yellow
Write-Host '  2. (לאתר) npx firebase deploy --only hosting' -ForegroundColor Yellow
Write-Host "`nלאימות שמצב קריאה-אחת עובד: הרץ את ה-LAB (node tools/test-bench/server.mjs)" -ForegroundColor DarkGray
Write-Host 'וודא שרצף האירועים כולל: single-call-source-mode -> single-call-source-lock -> verified-source-bibliography-appended' -ForegroundColor DarkGray
