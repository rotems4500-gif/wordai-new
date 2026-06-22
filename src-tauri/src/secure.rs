// secure.rs — אחסון מוצפן של config/settings (מפתחות API) עם Windows DPAPI,
// מקביל ל-safeStorage של Electron. הקובץ נשמר כ-[magic]["DPAPI1\n"] + blob מוצפן.
// אם קובץ הוא plaintext (למשל הוגר מ-Electron לא-מוצפן) — נקרא כמו שהוא.

use crate::fs_ops::{resolve_rel, IoResult};
use tauri::AppHandle;

const MAGIC: &[u8] = b"DPAPI1\n";

#[cfg(windows)]
mod dpapi {
    use std::ffi::c_void;
    use std::ptr;
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB,
    };

    fn run(
        data: &[u8],
        protect: bool,
    ) -> Result<Vec<u8>, String> {
        unsafe {
            let mut in_blob = CRYPT_INTEGER_BLOB {
                cbData: data.len() as u32,
                pbData: data.as_ptr() as *mut u8,
            };
            let mut out_blob = CRYPT_INTEGER_BLOB {
                cbData: 0,
                pbData: ptr::null_mut(),
            };
            let ok = if protect {
                CryptProtectData(
                    &mut in_blob,
                    ptr::null(),
                    ptr::null_mut(),
                    ptr::null_mut(),
                    ptr::null_mut(),
                    0,
                    &mut out_blob,
                )
            } else {
                CryptUnprotectData(
                    &mut in_blob,
                    ptr::null_mut(),
                    ptr::null_mut(),
                    ptr::null_mut(),
                    ptr::null_mut(),
                    0,
                    &mut out_blob,
                )
            };
            if ok == 0 {
                return Err("DPAPI operation failed".to_string());
            }
            let slice = std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize);
            let result = slice.to_vec();
            LocalFree(out_blob.pbData as *mut c_void);
            Ok(result)
        }
    }

    pub fn protect(data: &[u8]) -> Result<Vec<u8>, String> {
        run(data, true)
    }
    pub fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
        run(data, false)
    }
}

// בפלטפורמות שאינן Windows — fallback ללא הצפנה (האפליקציה ל-Windows בלבד).
#[cfg(not(windows))]
mod dpapi {
    pub fn protect(data: &[u8]) -> Result<Vec<u8>, String> {
        Ok(data.to_vec())
    }
    pub fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
        Ok(data.to_vec())
    }
}

#[tauri::command]
pub fn save_secure_file(app: AppHandle, rel: String, contents: String) -> IoResult {
    let path = match resolve_rel(&app, &rel) {
        Ok(p) => p,
        Err(e) => return IoResult { ok: false, data: None, error: Some(e) },
    };
    match dpapi::protect(contents.as_bytes()) {
        Ok(blob) => {
            let mut bytes = Vec::with_capacity(MAGIC.len() + blob.len());
            bytes.extend_from_slice(MAGIC);
            bytes.extend_from_slice(&blob);
            match std::fs::write(&path, bytes) {
                Ok(_) => IoResult { ok: true, data: Some(path.to_string_lossy().to_string()), error: None },
                Err(e) => IoResult { ok: false, data: None, error: Some(e.to_string()) },
            }
        }
        Err(e) => IoResult { ok: false, data: None, error: Some(e) },
    }
}

#[tauri::command]
pub fn read_secure_file(app: AppHandle, rel: String) -> IoResult {
    let path = match resolve_rel(&app, &rel) {
        Ok(p) => p,
        Err(e) => return IoResult { ok: false, data: None, error: Some(e) },
    };
    if !path.exists() {
        return IoResult { ok: true, data: None, error: None };
    }
    let raw = match std::fs::read(&path) {
        Ok(b) => b,
        Err(e) => return IoResult { ok: false, data: None, error: Some(e.to_string()) },
    };
    if raw.starts_with(MAGIC) {
        match dpapi::unprotect(&raw[MAGIC.len()..]) {
            Ok(plain) => IoResult {
                ok: true,
                data: Some(String::from_utf8_lossy(&plain).to_string()),
                error: None,
            },
            Err(e) => IoResult { ok: false, data: None, error: Some(e) },
        }
    } else {
        // plaintext (הוגר מ-Electron לא-מוצפן) — נחזיר כמו שהוא.
        IoResult {
            ok: true,
            data: Some(String::from_utf8_lossy(&raw).to_string()),
            error: None,
        }
    }
}
