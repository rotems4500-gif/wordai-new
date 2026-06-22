// updater.rs — עדכונים אוטומטיים דרך tauri-plugin-updater.
// backend: GitHub releases (latest.json חתום). pubkey ב-tauri.conf.json.
// נקראות מ-shim ב-JS דרך invoke; ה-shim מוסיף percent/checkedAt.

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

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
            match update.download_and_install(|_chunk, _total| {}, || {}).await {
                Ok(_) => {
                    app.restart();
                }
                Err(e) => info(false, "error", &e.to_string(), &current, &version),
            }
        }
        Ok(None) => info(false, "up-to-date", "אין עדכון מוכן להתקנה.", &current, ""),
        Err(e) => info(false, "error", &e.to_string(), &current, ""),
    }
}
