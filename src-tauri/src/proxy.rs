// proxy.rs — native CORS-bypass HTTP proxy, מחליף את proxy-http-request של Electron.
// חוזה זהה: { ok, status, body, contentType }. allowlist של hosts (anti-SSRF).

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

// רישום בקשות פעילות לביטול: requestId → oneshot sender. ביטול שולח לערוץ,
// ה-select! ב-proxy_http_request מפיל את ה-future של reqwest (סוגר את החיבור בפועל).
static ABORT_SENDERS: OnceLock<Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>> =
    OnceLock::new();

fn abort_registry() -> &'static Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>> {
    ABORT_SENDERS.get_or_init(|| Mutex::new(HashMap::new()))
}

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
    "api.unpaywall.org",
    "quickchart.io",
    "api.pexels.com",
    "images.pexels.com",
    "api.unsplash.com",
    "images.unsplash.com",
    "plus.unsplash.com",
    "oaidalleapiprodscus.blob.core.windows.net",
    // ספקי יצירת תמונות שנחשפים בהגדרות — בלעדיהם הענפים האלה ב-imageService
    // נכשלו בדסקטופ ב-"Host לא מורשה" בזמן שה-UI הציע אותם.
    "api.stability.ai",
    "fal.run",
    "queue.fal.run",
    "fal.media",
    "v3.fal.media",
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
    #[serde(default, rename = "requestId")]
    pub request_id: String,
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

// ביטול אמיתי: מוציא את ה-sender מהרישום ושולח — ה-select! בבקשה הפעילה מפיל
// את ה-future של reqwest וסוגר את החיבור בצד השרת (לא רק race בצד ה-JS).
#[tauri::command]
pub fn abort_proxy_http_request(request_id: String) -> AbortResponse {
    let sender = abort_registry()
        .lock()
        .ok()
        .and_then(|mut map| map.remove(&request_id));
    match sender {
        Some(tx) => {
            let _ = tx.send(());
            AbortResponse { ok: true, aborted: true }
        }
        None => AbortResponse { ok: true, aborted: false },
    }
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

// ---- verify_url: בדיקת חיות של קישור (מקורות) ----
// בשונה מ-proxy_http_request זה מקבל דומיין שרירותי, ולכן ההגנות הן לפי צורה
// (https בלבד, בלי IP-literal/localhost) ולא לפי allowlist. לא קוראים body.

const VERIFY_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

#[derive(Deserialize)]
pub struct VerifyUrlRequest {
    pub url: String,
    #[serde(default, rename = "timeoutMs")]
    pub timeout_ms: u64,
}

#[derive(Serialize)]
pub struct VerifyUrlResponse {
    pub ok: bool,
    pub status: u16,
    #[serde(rename = "finalUrl")]
    pub final_url: String,
    pub error: String,
}

fn verify_err(message: &str) -> VerifyUrlResponse {
    VerifyUrlResponse {
        ok: false,
        status: 0,
        final_url: String::new(),
        error: message.to_string(),
    }
}

fn is_public_web_host(parsed: &url::Url) -> bool {
    match parsed.host() {
        Some(url::Host::Domain(domain)) => {
            let host = normalize_host(domain);
            // דורש דומיין ציבורי אמיתי: מכיל נקודה, לא סיומת פנימית.
            host.contains('.')
                && host != "localhost"
                && !host.ends_with(".localhost")
                && !host.ends_with(".local")
                && !host.ends_with(".internal")
                && !host.ends_with(".home.arpa")
        }
        // IP-literal (v4/v6) — נדחה תמיד (anti-SSRF).
        _ => false,
    }
}

#[tauri::command]
pub async fn verify_url(request: VerifyUrlRequest) -> VerifyUrlResponse {
    let parsed = match url::Url::parse(&request.url) {
        Ok(u) => u,
        Err(_) => return verify_err("כתובת לא תקינה"),
    };
    if parsed.scheme() != "https" {
        return verify_err("רק https מורשה לאימות קישורים");
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return verify_err("כתובת עם פרטי הזדהות אינה מורשית");
    }
    if !is_public_web_host(&parsed) {
        return verify_err("Host לא ציבורי");
    }

    let timeout_ms = if request.timeout_ms > 0 {
        request.timeout_ms.clamp(1000, 10000)
    } else {
        5000
    };

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .redirect(reqwest::redirect::Policy::limited(5))
        .user_agent(VERIFY_UA)
        .build()
    {
        Ok(c) => c,
        Err(e) => return verify_err(&format!("שגיאת אתחול: {e}")),
    };

    // HEAD קודם; אתרים שלא תומכים (405/501) מקבלים GET בלי קריאת body.
    let head = client.head(parsed.clone()).send().await;
    let response = match head {
        Ok(r) if r.status().as_u16() != 405 && r.status().as_u16() != 501 => r,
        _ => match client.get(parsed).send().await {
            Ok(r) => r,
            Err(e) => {
                let msg = if e.is_timeout() { "timeout".to_string() } else { e.to_string() };
                return verify_err(&msg);
            }
        },
    };

    let status = response.status().as_u16();
    VerifyUrlResponse {
        ok: (200..400).contains(&status),
        status,
        final_url: response.url().to_string(),
        error: String::new(),
    }
}

// ---- fetch_page_text: קריאת תוכן טקסטואלי של עמוד מקור (בדיקת התאמת טענה-מקור) ----
// אותן הגנות-צורה כמו verify_url (https ציבורי בלבד, בלי IP-literal) + הגנות תוכן:
// רק text/html או text/plain, body מוגבל ל-1.5MB, הפלט טקסט חשוף בלבד (בלי HTML)
// חתוך ל-30k תווים. משמש את הצ'אט לפסיקת "המקור תומך בטענה" על סמך תוכן אמיתי.

const FETCH_PAGE_MAX_BODY_BYTES: usize = 1_500_000;
const FETCH_PAGE_MAX_TEXT_CHARS: usize = 30_000;

#[derive(Deserialize)]
pub struct FetchPageTextRequest {
    pub url: String,
    #[serde(default, rename = "timeoutMs")]
    pub timeout_ms: u64,
}

#[derive(Serialize)]
pub struct FetchPageTextResponse {
    pub ok: bool,
    pub status: u16,
    #[serde(rename = "finalUrl")]
    pub final_url: String,
    pub title: String,
    pub text: String,
    pub error: String,
}

fn fetch_page_err(status: u16, message: &str) -> FetchPageTextResponse {
    FetchPageTextResponse {
        ok: false,
        status,
        final_url: String::new(),
        title: String::new(),
        text: String::new(),
        error: message.to_string(),
    }
}

// חילוץ טקסט נאיבי מ-HTML: מסיר script/style/nav בלוקים, מפרק תגיות, מנרמל רווחים.
// לא readability מלא — מספיק כדי לתת למודל את גוף המאמר לצורך התאמת טענה.
fn html_to_text(html: &str) -> (String, String) {
    let mut title = String::new();
    if let Some(start) = html.to_ascii_lowercase().find("<title") {
        if let Some(gt) = html[start..].find('>') {
            let after = &html[start + gt + 1..];
            if let Some(end) = after.to_ascii_lowercase().find("</title") {
                title = after[..end].trim().to_string();
            }
        }
    }

    let mut cleaned = String::with_capacity(html.len());
    // ascii-lowercase משמר אורך בייטים וגבולות תווים — בטוח לאינדוקס מקביל ל-html.
    let lower = html.to_ascii_lowercase();
    let mut cursor = 0usize;
    // מעבר יחיד: מדלג על בלוקי script/style/noscript/svg/head, זורק תגיות אחרות.
    while cursor < html.len() {
        if let Some(open_rel) = lower[cursor..].find('<') {
            let open = cursor + open_rel;
            cleaned.push_str(&html[cursor..open]);
            let rest = &lower[open..];
            let skip_block = ["script", "style", "noscript", "svg", "head"]
                .iter()
                .find(|tag| rest.starts_with(&format!("<{tag}")));
            if let Some(tag) = skip_block {
                let close = format!("</{tag}");
                if let Some(end_rel) = rest.find(&close) {
                    let after_close = open + end_rel;
                    cursor = match lower[after_close..].find('>') {
                        Some(gt_rel) => after_close + gt_rel + 1,
                        None => html.len(),
                    };
                    continue;
                }
                cursor = html.len();
                continue;
            }
            // תגיות בלוק נפוצות → מעבר שורה כדי לשמר גבולות פסקאות.
            if rest.starts_with("<p") || rest.starts_with("<br") || rest.starts_with("<div")
                || rest.starts_with("<li") || rest.starts_with("<h1") || rest.starts_with("<h2")
                || rest.starts_with("<h3") || rest.starts_with("<tr")
            {
                cleaned.push('\n');
            }
            cursor = match lower[open..].find('>') {
                Some(gt_rel) => open + gt_rel + 1,
                None => html.len(),
            };
        } else {
            cleaned.push_str(&html[cursor..]);
            break;
        }
    }

    // decode ישויות נפוצות + נרמול רווחים תוך שמירת שבירות שורה.
    let decoded = cleaned
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">");
    let mut text = String::with_capacity(decoded.len());
    for line in decoded.lines() {
        let compact = line.split_whitespace().collect::<Vec<_>>().join(" ");
        if !compact.is_empty() {
            text.push_str(&compact);
            text.push('\n');
        }
    }
    (title, text)
}

#[tauri::command]
pub async fn fetch_page_text(request: FetchPageTextRequest) -> FetchPageTextResponse {
    let parsed = match url::Url::parse(&request.url) {
        Ok(u) => u,
        Err(_) => return fetch_page_err(0, "כתובת לא תקינה"),
    };
    if parsed.scheme() != "https" {
        return fetch_page_err(0, "רק https מורשה");
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return fetch_page_err(0, "כתובת עם פרטי הזדהות אינה מורשית");
    }
    if !is_public_web_host(&parsed) {
        return fetch_page_err(0, "Host לא ציבורי");
    }

    let timeout_ms = if request.timeout_ms > 0 {
        request.timeout_ms.clamp(1000, 15000)
    } else {
        8000
    };

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .redirect(reqwest::redirect::Policy::limited(5))
        .user_agent(VERIFY_UA)
        .build()
    {
        Ok(c) => c,
        Err(e) => return fetch_page_err(0, &format!("שגיאת אתחול: {e}")),
    };

    let response = match client.get(parsed).send().await {
        Ok(r) => r,
        Err(e) => {
            let msg = if e.is_timeout() { "timeout".to_string() } else { e.to_string() };
            return fetch_page_err(0, &msg);
        }
    };

    let status = response.status().as_u16();
    let final_url = response.url().to_string();
    if !(200..400).contains(&status) {
        return fetch_page_err(status, "העמוד לא נגיש");
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();
    let is_plain = content_type.starts_with("text/plain");
    if !content_type.starts_with("text/html") && !is_plain && !content_type.is_empty() {
        return fetch_page_err(status, &format!("סוג תוכן לא נתמך: {content_type}"));
    }

    // קריאת body מוגבלת בגודל — stream עם cap, בלי לטעון עמודי ענק לזיכרון.
    let mut body_bytes: Vec<u8> = Vec::new();
    let mut stream = response;
    loop {
        match stream.chunk().await {
            Ok(Some(chunk)) => {
                let remaining = FETCH_PAGE_MAX_BODY_BYTES.saturating_sub(body_bytes.len());
                if remaining == 0 {
                    break;
                }
                let take = chunk.len().min(remaining);
                body_bytes.extend_from_slice(&chunk[..take]);
                if body_bytes.len() >= FETCH_PAGE_MAX_BODY_BYTES {
                    break;
                }
            }
            Ok(None) => break,
            Err(_) => break,
        }
    }
    let body = String::from_utf8_lossy(&body_bytes).to_string();

    let (title, text) = if is_plain {
        (String::new(), body)
    } else {
        html_to_text(&body)
    };
    let text: String = text.chars().take(FETCH_PAGE_MAX_TEXT_CHARS).collect();

    FetchPageTextResponse {
        ok: true,
        status,
        final_url,
        title,
        text,
        error: String::new(),
    }
}

// ---- fetch_binary: משיכת PDF בינארי ממקור ציבורי (ספריית מאמרים) ----
// אותן הגנות-צורה כמו fetch_page_text (https ציבורי בלבד, בלי פרטי הזדהות,
// 5 redirects, Chrome UA) + הגנות תוכן: **רק application/pdf**, cap 25MB עם
// stream שנקטע (הבקשה נכשלת ולא מחזירה קובץ חתוך למחצה). הגוף חוזר base64
// כי ה-IPC של Tauri הוא JSON. חילוץ הטקסט עצמו נעשה ב-JS (materialExtractBrowser).

const FETCH_BINARY_MAX_BYTES: usize = 25 * 1024 * 1024;

#[derive(Deserialize)]
pub struct FetchBinaryRequest {
    pub url: String,
    #[serde(default, rename = "timeoutMs")]
    pub timeout_ms: u64,
}

#[derive(Serialize)]
pub struct FetchBinaryResponse {
    pub ok: bool,
    pub status: u16,
    #[serde(rename = "finalUrl")]
    pub final_url: String,
    #[serde(rename = "contentType")]
    pub content_type: String,
    #[serde(rename = "dataBase64")]
    pub data_base64: String,
    pub error: String,
}

fn fetch_binary_err(status: u16, message: &str) -> FetchBinaryResponse {
    FetchBinaryResponse {
        ok: false,
        status,
        final_url: String::new(),
        content_type: String::new(),
        data_base64: String::new(),
        error: message.to_string(),
    }
}

#[tauri::command]
pub async fn fetch_binary(request: FetchBinaryRequest) -> FetchBinaryResponse {
    let parsed = match url::Url::parse(&request.url) {
        Ok(u) => u,
        Err(_) => return fetch_binary_err(0, "כתובת לא תקינה"),
    };
    if parsed.scheme() != "https" {
        return fetch_binary_err(0, "רק https מורשה");
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return fetch_binary_err(0, "כתובת עם פרטי הזדהות אינה מורשית");
    }
    if !is_public_web_host(&parsed) {
        return fetch_binary_err(0, "Host לא ציבורי");
    }

    let timeout_ms = if request.timeout_ms > 0 {
        request.timeout_ms.clamp(1000, 30000)
    } else {
        20000
    };

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .redirect(reqwest::redirect::Policy::limited(5))
        .user_agent(VERIFY_UA)
        .build()
    {
        Ok(c) => c,
        Err(e) => return fetch_binary_err(0, &format!("שגיאת אתחול: {e}")),
    };

    let response = match client.get(parsed).send().await {
        Ok(r) => r,
        Err(e) => {
            let msg = if e.is_timeout() { "timeout".to_string() } else { e.to_string() };
            return fetch_binary_err(0, &msg);
        }
    };

    let status = response.status().as_u16();
    let final_url = response.url().to_string();
    if !(200..400).contains(&status) {
        return fetch_binary_err(status, "הקובץ לא נגיש");
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();
    // רק PDF — זה fetcher צר בכוונה, לא הורדת קבצים כללית.
    if !content_type.starts_with("application/pdf") {
        return fetch_binary_err(status, &format!("סוג תוכן לא נתמך: {content_type}"));
    }

    // הצהרת גודל מוקדמת חוסכת הורדה של קובץ ענק.
    if let Some(len) = response.content_length() {
        if len as usize > FETCH_BINARY_MAX_BYTES {
            return fetch_binary_err(status, "הקובץ גדול מ-25MB");
        }
    }

    let mut body_bytes: Vec<u8> = Vec::new();
    let mut stream = response;
    loop {
        match stream.chunk().await {
            Ok(Some(chunk)) => {
                if body_bytes.len() + chunk.len() > FETCH_BINARY_MAX_BYTES {
                    return fetch_binary_err(status, "הקובץ גדול מ-25MB");
                }
                body_bytes.extend_from_slice(&chunk);
            }
            Ok(None) => break,
            Err(e) => return fetch_binary_err(status, &e.to_string()),
        }
    }

    if body_bytes.is_empty() {
        return fetch_binary_err(status, "התקבל גוף ריק");
    }

    FetchBinaryResponse {
        ok: true,
        status,
        final_url,
        content_type,
        data_base64: base64::engine::general_purpose::STANDARD.encode(&body_bytes),
        error: String::new(),
    }
}

#[tauri::command]
pub async fn proxy_http_request(request: ProxyRequest) -> ProxyResponse {
    let request_id = request.request_id.clone();

    // בלי requestId — מסלול רגיל בלי רישום ביטול.
    if request_id.is_empty() {
        return execute_proxy_request(request).await;
    }

    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
    if let Ok(mut map) = abort_registry().lock() {
        map.insert(request_id.clone(), tx);
    }

    let response = tokio::select! {
        result = execute_proxy_request(request) => result,
        _ = rx => err_response("הבקשה בוטלה"),
    };

    if let Ok(mut map) = abort_registry().lock() {
        map.remove(&request_id);
    }
    response
}

async fn execute_proxy_request(request: ProxyRequest) -> ProxyResponse {
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
