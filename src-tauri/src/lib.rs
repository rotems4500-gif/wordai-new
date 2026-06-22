mod dialog_ops;
mod fs_ops;
mod oauth;
mod proxy;
mod secure;
mod updater;

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{App, Emitter, Manager};

// קובץ שנפתח דרך file-association בהפעלה (cold start).
struct PendingOpen(Mutex<Option<String>>);

const DOC_EXTENSIONS: &[&str] = &["docx", "txt", "md", "markdown", "html", "htm"];

fn find_doc_in_args<I: IntoIterator<Item = String>>(args: I) -> Option<String> {
    args.into_iter().skip(1).find(|arg| {
        let lower = arg.to_lowercase();
        DOC_EXTENSIONS.iter().any(|ext| lower.ends_with(&format!(".{ext}")))
            && std::path::Path::new(arg).exists()
    })
}

fn launch_file_from_args() -> Option<String> {
    find_doc_in_args(std::env::args())
}

#[tauri::command]
fn take_pending_open_file(state: tauri::State<PendingOpen>) -> Option<String> {
    state.0.lock().ok().and_then(|mut guard| guard.take())
}

// העתקת תיקייה (שטוחה — דילוג על תת-תיקיות כמו .ocr-cache).
fn copy_dir_flat(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        if entry.file_type()?.is_file() {
            let _ = std::fs::copy(entry.path(), dst.join(entry.file_name()));
        }
    }
    Ok(())
}

// מיגרציה חד-פעמית מ-Electron: מעתיק את project-materials (חומרים מקומיים).
// config/settings לא מוגרים — הם מוצפנים בפורמט safeStorage של Electron שאינו תואם;
// המשתמש יזין מפתחות API מחדש פעם אחת.
fn migrate_from_electron(app: &App) {
    let target = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(_) => return,
    };
    let marker = target.join(".electron-migrated");
    if marker.exists() {
        return;
    }
    let target_materials = target.join("project-materials");
    if !target_materials.exists() {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let legacy_names = [
                "word-ai-assistant",
                "Word AI Assistant",
                "WordFlow AI",
                "wordflow-ai",
            ];
            for name in legacy_names {
                let src = PathBuf::from(&appdata).join(name).join("project-materials");
                if src.exists() && src.is_dir() {
                    let _ = copy_dir_flat(&src, &target_materials);
                    break;
                }
            }
        }
    }
    let _ = std::fs::create_dir_all(&target);
    let _ = std::fs::write(&marker, b"1");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(file) = find_doc_in_args(argv) {
                if let Some(state) = app.try_state::<PendingOpen>() {
                    if let Ok(mut guard) = state.0.lock() {
                        *guard = Some(file);
                    }
                }
            }
            let _ = app.emit("open-external-document", ());
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            migrate_from_electron(app);
            app.manage(PendingOpen(Mutex::new(launch_file_from_args())));
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            proxy::proxy_http_request,
            proxy::abort_proxy_http_request,
            fs_ops::read_app_file,
            fs_ops::write_app_file,
            fs_ops::read_app_file_base64,
            fs_ops::write_app_file_base64,
            fs_ops::delete_app_file,
            fs_ops::list_app_dir,
            fs_ops::read_file_base64,
            fs_ops::read_file_text,
            fs_ops::write_file_base64,
            fs_ops::write_file_text,
            dialog_ops::pick_open_file,
            dialog_ops::pick_save_file,
            updater::check_for_update,
            updater::install_update,
            secure::save_secure_file,
            secure::read_secure_file,
            oauth::google_oauth,
            take_pending_open_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
