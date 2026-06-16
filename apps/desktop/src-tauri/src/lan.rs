use std::sync::{Arc, Mutex};
use std::time::Instant;

use actix_files::Files;
use actix_web::{
    body::BoxBody,
    dev::{ServiceRequest, ServiceResponse},
    http::header,
    middleware::Next,
    web, App, HttpResponse, HttpServer,
};
use serde_json::Value;

use crate::store;
use crate::store::StoreOp;

const LAN_ENABLED_KEY: &str = "sys:lan:enabled";
const LAN_ADDRESS_KEY: &str = "sys:lan:address";
const LAN_PORT_KEY: &str = "sys:lan:port";
const LAN_PASSWORD_KEY: &str = "secret:lan:password";
const CURRENT_STORE_SCHEMA_VERSION: &str = "4";

fn get_with_legacy(app: &tauri::AppHandle, key: &str, legacy: &str) -> Option<String> {
    store::get(app, key)
        .ok()
        .flatten()
        .or_else(|| store::get(app, legacy).ok().flatten())
}

fn store_schema_ready(app: &tauri::AppHandle) -> bool {
    let version = store::get(app, "meta:schema-version").ok().flatten();
    schema_version_ready(version.as_deref())
}

fn schema_version_ready(version: Option<&str>) -> bool {
    version.is_some_and(|version| version == CURRENT_STORE_SCHEMA_VERSION)
}

fn schema_not_ready() -> HttpResponse {
    HttpResponse::ServiceUnavailable().json(serde_json::json!({
        "error": "shared storage migration is not complete",
        "expectedSchema": CURRENT_STORE_SCHEMA_VERSION
    }))
}

fn is_legacy_store_key(key: &str) -> bool {
    key.starts_with("neotavern_") || key.starts_with("neotavern-") || key.starts_with("neo:")
}

fn legacy_write_rejected() -> HttpResponse {
    HttpResponse::Conflict().json(serde_json::json!({
        "error": "legacy storage keys are read-only after schema v4"
    }))
}

/// In-memory session tokens.
type TokenStore = Arc<Mutex<std::collections::HashMap<String, Instant>>>;

/// Channel used to signal the LAN server to shut down gracefully.
static SHUTDOWN_TX: std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>> =
    std::sync::Mutex::new(None);

/// Start the LAN HTTP server.
pub async fn start(
    addr: String,
    port: u16,
    app_handle: tauri::AppHandle,
    web_dir: String,
    mut shutdown_rx: tokio::sync::oneshot::Receiver<()>,
) -> std::io::Result<()> {
    let tokens: TokenStore = Arc::new(Mutex::new(std::collections::HashMap::new()));

    let state = web::Data::new(ServerState {
        app: app_handle.clone(),
        tokens: tokens.clone(),
    });

    let server = HttpServer::new(move || {
        let web = web_dir.clone();
        App::new()
            .app_data(state.clone())
            // ── Public routes ────────────────────────
            .route("/api/auth/login", web::post().to(login))
            // ── Protected API ───────────────────────
            .service(
                web::scope("/api")
                    .wrap(actix_web::middleware::from_fn(auth_middleware))
                    .route("/store/{key}", web::get().to(get_store))
                    .route("/store/{key}", web::put().to(set_store))
                    .route("/store/{key}", web::delete().to(delete_store))
                    .route("/store", web::get().to(list_store))
                    .route("/store/batch", web::post().to(store_batch)),
            )
            // ── Sync routes (501 stub; dev-sync fills in) ─
            .service(
                web::scope("/api/sync")
                    .route("/manifest", web::get().to(sync_manifest))
                    .route("/snapshot", web::get().to(sync_snapshot))
                    .route("/changes", web::get().to(sync_changes))
                    .route("/push", web::post().to(sync_push))
                    .route("/pair", web::post().to(sync_pair)),
            )
            // ── SPA (no auth — LoginGate handles it) ─
            .service(Files::new("/", &web).index_file("index.html"))
    })
    .bind((addr.as_str(), port))?
    .run();

    let handle = server.handle();

    tokio::select! {
        result = server => result,
        _ = &mut shutdown_rx => {
            handle.stop(true).await;
            Ok(())
        }
    }
}

struct ServerState {
    app: tauri::AppHandle,
    tokens: TokenStore,
}

// ── Auth middleware ────────────────────────────────────

async fn auth_middleware(
    req: ServiceRequest,
    next: Next<BoxBody>,
) -> Result<ServiceResponse<BoxBody>, actix_web::Error> {
    let host = req.connection_info().host().to_string();
    let is_local = host.starts_with("localhost")
        || host.starts_with("127.0.0.1")
        || host.ends_with(".localhost");
    if is_local {
        return next.call(req).await;
    }

    if req.path() == "/api/auth/login" {
        return next.call(req).await;
    }

    let token = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|s| s.to_string());

    let authed = token.as_ref().is_some_and(|t| {
        req.app_data::<web::Data<ServerState>>()
            .map(|s| {
                let mut tokens = s.tokens.lock().unwrap();
                match tokens.get(t.as_str()) {
                    Some(instant)
                        if instant.elapsed() < std::time::Duration::from_secs(24 * 3600) =>
                    {
                        true
                    }
                    Some(_) => {
                        tokens.remove(t.as_str());
                        false
                    }
                    None => false,
                }
            })
            .unwrap_or(false)
    });

    if authed {
        return next.call(req).await;
    }

    Ok(req.into_response(
        HttpResponse::Unauthorized()
            .json(serde_json::json!({ "error": "unauthorized" }))
            .map_into_boxed_body(),
    ))
}

// ── Login handler ──────────────────────────────────────

#[derive(serde::Deserialize)]
struct LoginBody {
    password: String,
}

async fn login(state: web::Data<ServerState>, body: web::Json<LoginBody>) -> HttpResponse {
    let stored_pw = get_with_legacy(&state.app, LAN_PASSWORD_KEY, "neotavern_lan_password");

    match stored_pw {
        Some(pw) if pw == body.password => {
            let token: String = (0..16)
                .map(|_| format!("{:02x}", rand::random::<u8>()))
                .collect();
            let mut tokens = state.tokens.lock().unwrap();
            tokens
                .retain(|_, instant| instant.elapsed() < std::time::Duration::from_secs(24 * 3600));
            tokens.insert(token.clone(), std::time::Instant::now());
            HttpResponse::Ok().json(serde_json::json!({ "token": token }))
        }
        _ => HttpResponse::Unauthorized().json(serde_json::json!({ "error": "invalid password" })),
    }
}

// ── Store handlers ─────────────────────────────────────

async fn get_store(state: web::Data<ServerState>, key: web::Path<String>) -> HttpResponse {
    if !store_schema_ready(&state.app) {
        return schema_not_ready();
    }
    match store::get(&state.app, &key.into_inner()) {
        Ok(Some(v)) => HttpResponse::Ok().json(serde_json::json!({ "value": v })),
        Ok(None) => HttpResponse::Ok().json(serde_json::json!({ "value": null })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({ "error": e })),
    }
}

async fn set_store(
    state: web::Data<ServerState>,
    key: web::Path<String>,
    body: web::Json<Value>,
) -> HttpResponse {
    if !store_schema_ready(&state.app) {
        return schema_not_ready();
    }
    let key = key.into_inner();
    if is_legacy_store_key(&key) {
        return legacy_write_rejected();
    }
    let Some(value) = body.get("value").and_then(|v| v.as_str()) else {
        return HttpResponse::BadRequest()
            .json(serde_json::json!({ "error": "value must be a string" }));
    };
    match store::set(&state.app, &key, value) {
        Ok(()) => HttpResponse::Ok().json(serde_json::json!({ "ok": true })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({ "error": e })),
    }
}

async fn delete_store(state: web::Data<ServerState>, key: web::Path<String>) -> HttpResponse {
    if !store_schema_ready(&state.app) {
        return schema_not_ready();
    }
    let key = key.into_inner();
    if is_legacy_store_key(&key) {
        return legacy_write_rejected();
    }
    match store::remove(&state.app, &key) {
        Ok(()) => HttpResponse::Ok().json(serde_json::json!({ "ok": true })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({ "error": e })),
    }
}

async fn list_store(state: web::Data<ServerState>) -> HttpResponse {
    if !store_schema_ready(&state.app) {
        return schema_not_ready();
    }
    match store::entries(&state.app) {
        Ok(mut entries) => {
            entries.retain(|key, _| {
                !key.starts_with("secret:")
                    && key != "neotavern_setting_tavilyApiKey"
                    && key != "neotavern_lan_password"
                    && key != "meta:migration-lock"
            });
            HttpResponse::Ok().json(entries)
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({ "error": e })),
    }
}

async fn store_batch(state: web::Data<ServerState>, body: web::Json<Vec<StoreOp>>) -> HttpResponse {
    if !store_schema_ready(&state.app) {
        return schema_not_ready();
    }
    let operations = body.into_inner();
    if operations
        .iter()
        .any(|operation| is_legacy_store_key(&operation.key))
    {
        return legacy_write_rejected();
    }
    match store::batch_ops(&state.app, &operations) {
        Ok(()) => HttpResponse::Ok().json(serde_json::json!({ "ok": true })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({ "error": e })),
    }
}

// ── Sync handlers (501 scaffold) ───────────────────────

fn not_implemented() -> HttpResponse {
    HttpResponse::NotImplemented().json(serde_json::json!({ "error": "sync not implemented" }))
}

async fn sync_manifest() -> HttpResponse {
    not_implemented()
}
async fn sync_snapshot() -> HttpResponse {
    not_implemented()
}
async fn sync_changes() -> HttpResponse {
    not_implemented()
}
async fn sync_push() -> HttpResponse {
    not_implemented()
}
async fn sync_pair() -> HttpResponse {
    not_implemented()
}

// ── LAN server commands ────────────────────────────────

#[tauri::command]
pub(crate) fn lan_server_status(app: tauri::AppHandle) -> Result<String, String> {
    let enabled = get_with_legacy(&app, LAN_ENABLED_KEY, "neotavern_lan_enabled")
        .map(|v| v == "true")
        .unwrap_or(false);
    let addr = get_with_legacy(&app, LAN_ADDRESS_KEY, "neotavern_lan_addr")
        .unwrap_or_else(|| "0.0.0.0".into());
    let port =
        get_with_legacy(&app, LAN_PORT_KEY, "neotavern_lan_port").unwrap_or_else(|| "3000".into());

    if enabled {
        Ok(format!("Running on {addr}:{port}"))
    } else {
        Ok("Disabled".into())
    }
}

/// Signal the LAN server to stop gracefully.
pub(crate) fn shutdown_lan_server() {
    if let Some(tx) = SHUTDOWN_TX.lock().unwrap().take() {
        let _ = tx.send(());
    }
}

pub(crate) fn try_start_lan_server(handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let enabled = get_with_legacy(&handle, LAN_ENABLED_KEY, "neotavern_lan_enabled")
                .map(|v| v == "true")
                .unwrap_or(false);
            if !enabled {
                return;
            }

            let addr = get_with_legacy(&handle, LAN_ADDRESS_KEY, "neotavern_lan_addr")
                .unwrap_or_else(|| "0.0.0.0".into());
            let port: u16 = get_with_legacy(&handle, LAN_PORT_KEY, "neotavern_lan_port")
                .and_then(|v| v.parse().ok())
                .unwrap_or(3000);

            // Generate and persist LAN password on first launch
            if get_with_legacy(&handle, LAN_PASSWORD_KEY, "neotavern_lan_password").is_none() {
                let pw = random_password();
                let _ = store::set(&handle, LAN_PASSWORD_KEY, &pw);
            }

            let web_dir = resolve_web_dir(&handle);

            let (tx, rx) = tokio::sync::oneshot::channel();
            *SHUTDOWN_TX.lock().unwrap() = Some(tx);

            if let Err(e) = start(addr, port, handle.clone(), web_dir, rx).await {
                eprintln!("LAN server failed: {e}");
            }
        });
    });
}

fn random_password() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let chars: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&";
    let mut pw = String::with_capacity(12);
    for i in 0..12 {
        let idx = ((seed >> (i * 4)) ^ (seed >> (i * 4 + 16))) as usize % chars.len();
        pw.push(chars[idx] as char);
    }
    pw
}

fn resolve_web_dir(_handle: &tauri::AppHandle) -> String {
    let exe = match std::env::current_exe() {
        Ok(exe) => exe,
        Err(_) => return dev_web_dir(),
    };

    let Some(install_dir) = exe.parent() else {
        return dev_web_dir();
    };

    let web_dir = install_dir.join("web");
    if web_dir.join("index.html").exists() {
        return web_dir.to_string_lossy().to_string();
    }

    if install_dir.join("index.html").exists() {
        return install_dir.to_string_lossy().to_string();
    }

    dev_web_dir()
}

fn dev_web_dir() -> String {
    std::env::current_dir()
        .map(|p| p.join("apps/desktop/dist").to_string_lossy().to_string())
        .unwrap_or_else(|_| "apps/desktop/dist".into())
}

#[cfg(test)]
mod tests {
    use super::{is_legacy_store_key, schema_version_ready};

    #[test]
    fn rest_store_requires_current_shared_schema() {
        assert!(schema_version_ready(Some("4")));
        assert!(!schema_version_ready(Some("3")));
        assert!(!schema_version_ready(None));
    }

    #[test]
    fn rest_store_rejects_legacy_write_namespaces() {
        assert!(is_legacy_store_key("neotavern_characters"));
        assert!(is_legacy_store_key("neotavern-settings"));
        assert!(is_legacy_store_key("neo:last-chat-id"));
        assert!(!is_legacy_store_key("data:characters"));
    }
}
