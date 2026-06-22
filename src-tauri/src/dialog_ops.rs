// dialog_ops.rs — דיאלוגי פתיחה/שמירה native דרך tauri-plugin-dialog.
// מחזירים נתיב בלבד; ה-JS shim קורא/כותב את התוכן וממיר פורמטים.

use serde::Deserialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[derive(Deserialize)]
pub struct FilterSpec {
    pub name: String,
    pub extensions: Vec<String>,
}

#[tauri::command]
pub async fn pick_open_file(
    app: AppHandle,
    filters: Vec<FilterSpec>,
    title: Option<String>,
) -> Option<String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let mut builder = app.dialog().file();
    if let Some(t) = title {
        builder = builder.set_title(t);
    }
    for f in &filters {
        let exts: Vec<&str> = f.extensions.iter().map(|s| s.as_str()).collect();
        builder = builder.add_filter(&f.name, &exts);
    }
    builder.pick_file(move |path| {
        let _ = tx.send(path);
    });
    match rx.await {
        Ok(Some(p)) => Some(p.to_string()),
        _ => None,
    }
}

#[tauri::command]
pub async fn pick_save_file(
    app: AppHandle,
    default_name: Option<String>,
    filters: Vec<FilterSpec>,
    title: Option<String>,
) -> Option<String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let mut builder = app.dialog().file();
    if let Some(t) = title {
        builder = builder.set_title(t);
    }
    if let Some(name) = default_name {
        builder = builder.set_file_name(name);
    }
    for f in &filters {
        let exts: Vec<&str> = f.extensions.iter().map(|s| s.as_str()).collect();
        builder = builder.add_filter(&f.name, &exts);
    }
    builder.save_file(move |path| {
        let _ = tx.send(path);
    });
    match rx.await {
        Ok(Some(p)) => Some(p.to_string()),
        _ => None,
    }
}
