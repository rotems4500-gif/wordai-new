// updater.rs — עדכונים אוטומטיים דרך tauri-plugin-updater.
// backend: GitHub releases (latest.json חתום). pubkey ב-tauri.conf.json.
// נקראות מ-shim ב-JS דרך invoke; ה-shim מוסיף percent/checkedAt.

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

/// שם האירוע שה-shim מאזין לו (onAppUpdateStatus). מדווח התקדמות הורדה בזמן אמת.
const UPDATE_EVENT: &str = "app-update-status";

#[derive(Clone, Serialize)]
struct UpdateProgress {
    status: String,
    message: String,
    percent: f64,
    #[serde(rename = "currentVersion")]
    current_version: String,
    #[serde(rename = "availableVersion")]
    available_version: String,
}

#[derive(Serialize)]
pub struct UpdateInfo {
    pub ok: bool,
    pub status: String,
    pub message: String,
    #[serde(rename = "currentVersion")]
    pub current_version: String,
    #[serde(rename = "availableVersion")]
    pub available_version: String,
}

fn info(ok: bool, status: &str, message: &str, current: &str, available: &str) -> UpdateInfo {
    UpdateInfo {
        ok,
        status: status.to_string(),
        message: message.to_string(),
        current_version: current.to_string(),
        available_version: available.to_string(),
    }
}

fn emit_progress(
    app: &AppHandle,
    status: &str,
    message: &str,
    percent: f64,
    current: &str,
    available: &str,
) {
    let _ = app.emit(
        UPDATE_EVENT,
        UpdateProgress {
            status: status.to_string(),
            message: message.to_string(),
            percent,
            current_version: current.to_string(),
            available_version: available.to_string(),
        },
    );
}

#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> UpdateInfo {
    let current = app.package_info().version.to_string();
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => return info(false, "error", &e.to_string(), &current, ""),
    };
    match updater.check().await {
        Ok(Some(update)) => info(
            true,
            "available",
            &format!("גרסה {} זמינה להורדה", update.version),
            &current,
            &update.version,
        ),
        Ok(None) => info(true, "up-to-date", "האפליקציה מעודכנת לגרסה האחרונה.", &current, ""),
        Err(e) => info(false, "error", &e.to_string(), &current, ""),
    }
}

#[tauri::command]
pub async fn install_update(app: AppHandle) -> UpdateInfo {
    let current = app.package_info().version.to_string();
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => return info(false, "error", &e.to_string(), &current, ""),
    };
    match updater.check().await {
        Ok(Some(update)) => {
            let version = update.version.clone();

            // דיווח התקדמות: ה-installer שוקל ~40MB, בלי אירועים המשתמש רואה חלון קפוא.
            emit_progress(&app, "downloading", "מוריד את העדכון…", 0.0, &current, &version);

            let on_chunk = {
                let app = app.clone();
                let current = current.clone();
                let version = version.clone();
                let mut downloaded: u64 = 0;
                let mut last_percent: i64 = -1;
                move |chunk: usize, total: Option<u64>| {
                    downloaded += chunk as u64;
                    // בלי Content-Length אין אחוז אמיתי — נשארים על 0 ומראים ספינר בצד ה-UI.
                    let percent = match total {
                        Some(t) if t > 0 => (downloaded as f64 / t as f64) * 100.0,
                        _ => 0.0,
                    };
                    let whole = percent.floor() as i64;
                    if whole > last_percent {
                        last_percent = whole;
                        emit_progress(&app, "downloading", "מוריד את העדכון…", percent, &current, &version);
                    }
                }
            };
            let on_finish = {
                let app = app.clone();
                let current = current.clone();
                let version = version.clone();
                move || {
                    emit_progress(
                        &app,
                        "downloaded",
                        "ההורדה הושלמה — מתקין ומפעיל מחדש…",
                        100.0,
                        &current,
                        &version,
                    );
                }
            };

            match update.download_and_install(on_chunk, on_finish).await {
                Ok(_) => {
                    app.restart();
                }
                Err(e) => {
                    let message = e.to_string();
                    emit_progress(&app, "error", &message, 0.0, &current, &version);
                    info(false, "error", &message, &current, &version)
                }
            }
        }
        Ok(None) => info(false, "up-to-date", "אין עדכון מוכן להתקנה.", &current, ""),
        Err(e) => info(false, "error", &e.to_string(), &current, ""),
    }
}
