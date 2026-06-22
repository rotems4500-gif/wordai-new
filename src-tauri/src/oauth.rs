// oauth.rs — Google sign-in לדסקטופ דרך זרימת OAuth מקומית (loopback + PKCE).
// signInWithPopup של Firebase לא עובד ב-WebView (גוגל חוסם webview מובנה, ו-origin
// של Tauri לא ניתן לאישור). במקום זה: דפדפן מערכתי → קוד הרשאה → id_token →
// ה-frontend מעביר ל-cloudSignInWithGoogleIdToken.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;

#[derive(Serialize)]
pub struct OAuthResult {
    pub ok: bool,
    #[serde(rename = "idToken")]
    pub id_token: String,
    #[serde(rename = "accessToken")]
    pub access_token: String,
    pub error: String,
}

fn err(msg: impl Into<String>) -> OAuthResult {
    OAuthResult {
        ok: false,
        id_token: String::new(),
        access_token: String::new(),
        error: msg.into(),
    }
}

fn random_b64(len: usize) -> String {
    let mut buf = vec![0u8; len];
    let _ = getrandom::getrandom(&mut buf);
    URL_SAFE_NO_PAD.encode(&buf)
}

// ממתין ל-redirect מהדפדפן ומחזיר (code, state). מתעלם מבקשות כמו favicon.
fn wait_for_code(listener: TcpListener) -> Result<(String, String), String> {
    for stream in listener.incoming() {
        let mut stream = match stream {
            Ok(s) => s,
            Err(_) => continue,
        };
        let mut buf = [0u8; 4096];
        let n = match stream.read(&mut buf) {
            Ok(n) => n,
            Err(_) => continue,
        };
        if n == 0 {
            continue;
        }
        let req = String::from_utf8_lossy(&buf[..n]);
        let path = req
            .lines()
            .next()
            .and_then(|line| line.split_whitespace().nth(1))
            .unwrap_or("");

        if let Some(query) = path.split('?').nth(1) {
            let mut code = String::new();
            let mut state = String::new();
            for kv in query.split('&') {
                let mut it = kv.splitn(2, '=');
                match (it.next(), it.next()) {
                    (Some("code"), Some(v)) => {
                        code = urlencoding::decode(v).map(|c| c.into_owned()).unwrap_or_default()
                    }
                    (Some("state"), Some(v)) => {
                        state = urlencoding::decode(v).map(|c| c.into_owned()).unwrap_or_default()
                    }
                    _ => {}
                }
            }
            if !code.is_empty() {
                let body = "<!doctype html><html lang=\"he\" dir=\"rtl\"><meta charset=\"utf-8\"><body style=\"font-family:sans-serif;text-align:center;padding-top:3rem\"><h2>ההתחברות הושלמה \u{2705}</h2><p>אפשר לסגור את הלשונית ולחזור ל-WordFlow AI.</p></body></html>";
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(resp.as_bytes());
                return Ok((code, state));
            }
        }
        let _ = stream.write_all(b"HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n");
    }
    Err("\u{05dc}\u{05d0} \u{05d4}\u{05ea}\u{05e7}\u{05d1}\u{05dc} \u{05e7}\u{05d5}\u{05d3} \u{05d4}\u{05e8}\u{05e9}\u{05d0}\u{05d4}".into())
}

#[tauri::command]
pub async fn google_oauth(client_id: String, client_secret: String) -> OAuthResult {
    if client_id.is_empty() {
        return err("חסר Google Desktop Client ID (VITE_GOOGLE_DESKTOP_CLIENT_ID)");
    }

    let verifier = random_b64(48);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = random_b64(18);

    let listener = match TcpListener::bind("127.0.0.1:0") {
        Ok(l) => l,
        Err(e) => return err(format!("שרת מקומי נכשל: {e}")),
    };
    let port = match listener.local_addr() {
        Ok(a) => a.port(),
        Err(e) => return err(e.to_string()),
    };
    let redirect = format!("http://127.0.0.1:{port}");

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&code_challenge={}&code_challenge_method=S256&state={}&prompt=select_account",
        urlencoding::encode(&client_id),
        urlencoding::encode(&redirect),
        urlencoding::encode("openid email profile"),
        challenge,
        state,
    );

    if let Err(e) = open::that(&auth_url) {
        return err(format!("פתיחת דפדפן נכשלה: {e}"));
    }

    let (code, got_state) =
        match tauri::async_runtime::spawn_blocking(move || wait_for_code(listener)).await {
            Ok(Ok(v)) => v,
            Ok(Err(e)) => return err(e),
            Err(e) => return err(e.to_string()),
        };
    if got_state != state {
        return err("אימות state נכשל (ייתכן ניסיון זיוף)");
    }

    let client = reqwest::Client::new();
    let mut params = vec![
        ("client_id", client_id.as_str()),
        ("code", code.as_str()),
        ("code_verifier", verifier.as_str()),
        ("grant_type", "authorization_code"),
        ("redirect_uri", redirect.as_str()),
    ];
    if !client_secret.is_empty() {
        params.push(("client_secret", client_secret.as_str()));
    }

    let resp = match client
        .post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return err(format!("חילופי טוקן נכשלו: {e}")),
    };
    let json: serde_json::Value = match resp.json().await {
        Ok(j) => j,
        Err(e) => return err(e.to_string()),
    };
    if json.get("error").is_some() {
        let detail = json
            .get("error_description")
            .and_then(|v| v.as_str())
            .or_else(|| json.get("error").and_then(|v| v.as_str()))
            .unwrap_or("error");
        return err(format!("גוגל החזירה שגיאה: {detail}"));
    }
    let id_token = json.get("id_token").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let access_token = json.get("access_token").and_then(|v| v.as_str()).unwrap_or("").to_string();
    if id_token.is_empty() {
        return err("לא התקבל id_token מגוגל");
    }
    OAuthResult {
        ok: true,
        id_token,
        access_token,
        error: String::new(),
    }
}
