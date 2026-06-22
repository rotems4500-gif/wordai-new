// fs_ops.rs — פעולות קבצים פרימיטיביות.
// שתי משפחות:
//   • app-data scoped (config/settings/materials) — תחת app_data_dir עם הגנת path-escape.
//   • נתיב חופשי (קבצים שהמשתמש בחר בדיאלוג) — read/write base64/text.
// כל הלוגיקה הספציפית (index.json, צורת config, המרות פורמט) נמצאת ב-JS shim.

use base64::Engine;
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct IoResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl IoResult {
    fn ok_data(data: Option<String>) -> Self {
        Self { ok: true, data, error: None }
    }
    fn err(message: impl Into<String>) -> Self {
        Self { ok: false, data: None, error: Some(message.into()) }
    }
}

fn app_base_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(dir)
}

// מונע יציאה מתיקיית הבסיס (path traversal).
pub(crate) fn resolve_rel(app: &AppHandle, rel: &str) -> Result<PathBuf, String> {
    let cleaned = rel.replace('\\', "/");
    if cleaned.contains("..") || cleaned.starts_with('/') || Path::new(&cleaned).is_absolute() {
        return Err("נתיב לא חוקי".into());
    }
    let base = app_base_dir(app)?;
    let full = base.join(&cleaned);
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    Ok(full)
}

// ── app-data scoped ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn read_app_file(app: AppHandle, rel: String) -> IoResult {
    match resolve_rel(&app, &rel) {
        Ok(path) => {
            if !path.exists() {
                return IoResult::ok_data(None);
            }
            match std::fs::read_to_string(&path) {
                Ok(text) => IoResult::ok_data(Some(text)),
                Err(e) => IoResult::err(e.to_string()),
            }
        }
        Err(e) => IoResult::err(e),
    }
}

#[tauri::command]
pub fn write_app_file(app: AppHandle, rel: String, contents: String) -> IoResult {
    match resolve_rel(&app, &rel) {
        Ok(path) => match std::fs::write(&path, contents) {
            Ok(_) => IoResult::ok_data(Some(path.to_string_lossy().to_string())),
            Err(e) => IoResult::err(e.to_string()),
        },
        Err(e) => IoResult::err(e),
    }
}

#[tauri::command]
pub fn read_app_file_base64(app: AppHandle, rel: String) -> IoResult {
    match resolve_rel(&app, &rel) {
        Ok(path) => {
            if !path.exists() {
                return IoResult::ok_data(None);
            }
            match std::fs::read(&path) {
                Ok(bytes) => IoResult::ok_data(Some(
                    base64::engine::general_purpose::STANDARD.encode(&bytes),
                )),
                Err(e) => IoResult::err(e.to_string()),
            }
        }
        Err(e) => IoResult::err(e),
    }
}

#[tauri::command]
pub fn write_app_file_base64(app: AppHandle, rel: String, data_base64: String) -> IoResult {
    match resolve_rel(&app, &rel) {
        Ok(path) => match base64::engine::general_purpose::STANDARD.decode(data_base64.as_bytes()) {
            Ok(bytes) => match std::fs::write(&path, bytes) {
                Ok(_) => IoResult::ok_data(Some(path.to_string_lossy().to_string())),
                Err(e) => IoResult::err(e.to_string()),
            },
            Err(e) => IoResult::err(e.to_string()),
        },
        Err(e) => IoResult::err(e),
    }
}

#[tauri::command]
pub fn delete_app_file(app: AppHandle, rel: String) -> IoResult {
    match resolve_rel(&app, &rel) {
        Ok(path) => {
            if path.exists() {
                if let Err(e) = std::fs::remove_file(&path) {
                    return IoResult::err(e.to_string());
                }
            }
            IoResult::ok_data(None)
        }
        Err(e) => IoResult::err(e),
    }
}

#[tauri::command]
pub fn list_app_dir(app: AppHandle, rel: String) -> Vec<String> {
    let path = match resolve_rel(&app, &rel) {
        Ok(p) => p,
        Err(_) => return Vec::new(),
    };
    let mut names = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&path) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    names.push(entry.file_name().to_string_lossy().to_string());
                }
            }
        }
    }
    names
}

// ── arbitrary path (user-picked files) ──────────────────────────────────────

#[tauri::command]
pub fn read_file_base64(path: String) -> IoResult {
    match std::fs::read(&path) {
        Ok(bytes) => IoResult::ok_data(Some(
            base64::engine::general_purpose::STANDARD.encode(&bytes),
        )),
        Err(e) => IoResult::err(e.to_string()),
    }
}

#[tauri::command]
pub fn read_file_text(path: String) -> IoResult {
    match std::fs::read_to_string(&path) {
        Ok(text) => IoResult::ok_data(Some(text)),
        Err(e) => IoResult::err(e.to_string()),
    }
}

#[tauri::command]
pub fn write_file_base64(path: String, data_base64: String) -> IoResult {
    match base64::engine::general_purpose::STANDARD.decode(data_base64.as_bytes()) {
        Ok(bytes) => match std::fs::write(&path, bytes) {
            Ok(_) => IoResult::ok_data(Some(path)),
            Err(e) => IoResult::err(e.to_string()),
        },
        Err(e) => IoResult::err(e.to_string()),
    }
}

#[tauri::command]
pub fn write_file_text(path: String, contents: String) -> IoResult {
    match std::fs::write(&path, contents) {
        Ok(_) => IoResult::ok_data(Some(path)),
        Err(e) => IoResult::err(e.to_string()),
    }
}
