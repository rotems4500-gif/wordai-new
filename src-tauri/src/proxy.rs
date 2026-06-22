// proxy.rs — native CORS-bypass HTTP proxy, מחליף את proxy-http-request של Electron.
// חוזה זהה: { ok, status, body, contentType }. allowlist של hosts (anti-SSRF).

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

const ALLOWED_HTTPS_HOSTS: &[&str] = &[
    "api.perplexity.ai",
    "api.openai.com",
    "api.anthropic.com",
    "api.groq.com",
    "api.copyleaks.com",
    "id.copyleaks.com",
    "generativelanguage.googleapis.com",
    "api.deepseek.com",
    "api.mistral.ai",
    "api.together.xyz",
    "openrouter.ai",
    "api.x.ai",
    "serpapi.com",
    "quickchart.io",
    "api.pexels.com",
    "images.pexels.com",
    "api.unsplash.com",
    "images.unsplash.com",
    "plus.unsplash.com",
    "oaidalleapiprodscus.blob.core.windows.net",
];

// loopback מקומי מאושר ל-Ollama / LM Studio
const ALLOWED_LOCAL_HOSTS: &[&str] = &["localhost", "127.0.0.1", "::1"];
const ALLOWED_LOCAL_PORTS: &[u16] = &[11434, 1234];

const HOP_BY_HOP: &[&str] = &["host", "content-length", "connection"];

fn default_method() -> String {
    "POST".to_string()
}
fn default_encoding() -> String {
    "utf8".to_string()
}

#[derive(Deserialize)]
pub struct ProxyRequest {
    pub url: String,
    #[serde(default = "default_method")]
    pub method: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default, rename = "timeoutMs")]
    pub timeout_ms: u64,
    #[serde(default = "default_encoding", rename = "responseEncoding")]
    pub response_encoding: String,
}

#[derive(Serialize)]
pub struct ProxyResponse {
    pub ok: bool,
    pub status: u16,
    pub body: String,
    #[serde(rename = "contentType")]
    pub content_type: String,
}

#[derive(Serialize)]
pub struct AbortResponse {
    pub ok: bool,
    pub aborted: bool,
}

// הביטול מטופל בצד ה-JS (Promise.race מול signal). כאן no-op לשמירת ה-API.
#[tauri::command]
pub fn abort_proxy_http_request(_request_id: String) -> AbortResponse {
    AbortResponse { ok: true, aborted: false }
}

fn err_response(message: &str) -> ProxyResponse {
    ProxyResponse {
        ok: false,
        status: 0,
        body: message.to_string(),
        content_type: String::new(),
    }
}

fn normalize_host(host: &str) -> String {
    host.trim().to_lowercase().trim_end_matches('.').to_string()
}

#[tauri::command]
pub async fn proxy_http_request(request: ProxyRequest) -> ProxyResponse {
    let parsed = match url::Url::parse(&request.url) {
        Ok(u) => u,
        Err(_) => return err_response("כתובת לא תקינה"),
    };

    let scheme = parsed.scheme();
    if scheme != "https" && scheme != "http" {
        return err_response("פרוטוקול לא מורשה");
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return err_response("כתובת עם פרטי הזדהות אינה מורשית");
    }

    let host = normalize_host(parsed.host_str().unwrap_or(""));
    let port = parsed
        .port_or_known_default()
        .unwrap_or(if scheme == "https" { 443 } else { 80 });

    let is_local_target =
        ALLOWED_LOCAL_HOSTS.contains(&host.as_str()) && ALLOWED_LOCAL_PORTS.contains(&port);

    if scheme == "http" && !is_local_target {
        return err_response("HTTP מותר רק ל-loopback מקומי מאושר");
    }
    if !is_local_target && !ALLOWED_HTTPS_HOSTS.contains(&host.as_str()) {
        return err_response(&format!("Host לא מורשה: {host}"));
    }

    let timeout_ms = if request.timeout_ms > 0 {
        request.timeout_ms.clamp(1000, 300000)
    } else {
        120000
    };

    let method = match reqwest::Method::from_bytes(request.method.to_uppercase().as_bytes()) {
        Ok(m) => m,
        Err(_) => return err_response("מתודה לא תקינה"),
    };

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .build()
    {
        Ok(c) => c,
        Err(e) => return err_response(&format!("שגיאת אתחול: {e}")),
    };

    let mut req = client.request(method, parsed);
    for (name, value) in request.headers.iter() {
        if HOP_BY_HOP.contains(&name.to_lowercase().as_str()) {
            continue;
        }
        req = req.header(name, value);
    }
    if let Some(body) = request.body {
        req = req.body(body);
    }

    let response = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            let msg = if e.is_timeout() {
                "Proxy request timed out".to_string()
            } else {
                e.to_string()
            };
            return err_response(&msg);
        }
    };

    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let body = if request.response_encoding == "base64" {
        match response.bytes().await {
            Ok(bytes) => base64::engine::general_purpose::STANDARD.encode(&bytes),
            Err(e) => return err_response(&e.to_string()),
        }
    } else {
        match response.text().await {
            Ok(text) => text,
            Err(e) => return err_response(&e.to_string()),
        }
    };

    ProxyResponse {
        ok: (200..300).contains(&status),
        status,
        body,
        content_type,
    }
}
