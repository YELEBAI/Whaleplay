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

use crate::AppStore;

/// In-memory session tokens.
///
/// Tokens are held in memory only and are destroyed when the server shuts
/// down (i.e. when the app closes). No explicit cleanup is needed — the
/// HashMap is simply dropped.
type TokenStore = Arc<Mutex<std::collections::HashMap<String, Instant>>>;

/// Channel used to signal the LAN server to shut down gracefully.
static SHUTDOWN_TX: std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>> =
    std::sync::Mutex::new(None);

/// Start the LAN HTTP server.
pub async fn start(
    addr: String,
    port: u16,
    store: Arc<Mutex<AppStore>>,
    store_path: String,
    web_dir: String,
    mut shutdown_rx: tokio::sync::oneshot::Receiver<()>,
) -> std::io::Result<()> {
    let tokens: TokenStore = Arc::new(Mutex::new(std::collections::HashMap::new()));

    let state = web::Data::new(ServerState {
        store: store.clone(),
        tokens: tokens.clone(),
    });
    let store_path_data = web::Data::new(store_path);

    let server = HttpServer::new(move || {
        let web = web_dir.clone();
        App::new()
            .app_data(state.clone())
            .app_data(store_path_data.clone())
            // ── Public routes ────────────────────────
            .route("/api/auth/login", web::post().to(login))
            // ── Protected API ───────────────────────
            .service(
                web::scope("/api")
                    .wrap(actix_web::middleware::from_fn(auth_middleware))
                    .route("/store/{key}", web::get().to(get_store))
                    .route("/store/{key}", web::put().to(set_store))
                    .route("/store/{key}", web::delete().to(delete_store))
                    .route("/store", web::get().to(list_store)),
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
    store: Arc<Mutex<AppStore>>,
    tokens: TokenStore,
}

// ── Auth middleware ────────────────────────────────────

async fn auth_middleware(
    req: ServiceRequest,
    next: Next<BoxBody>,
) -> Result<ServiceResponse<BoxBody>, actix_web::Error> {
    // Skip auth for localhost / 127.0.0.1
    let host = req.connection_info().host().to_string();
    let is_local = host.starts_with("localhost")
        || host.starts_with("127.0.0.1")
        || host.ends_with(".localhost");
    if is_local {
        return next.call(req).await;
    }

    // Login endpoint is public
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

    // Unauthenticated API call
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

async fn login(
    state: web::Data<ServerState>,
    store_path: web::Data<String>,
    body: web::Json<LoginBody>,
) -> HttpResponse {
    // Read password directly from disk — the Tauri invoke may have updated it
    let stored_pw = std::fs::read_to_string(store_path.get_ref())
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|v| {
            v.get("neotavern_lan_password")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        });

    match stored_pw {
        Some(pw) if pw == body.password => {
            // Generate a cryptographically secure random token (32 hex chars)
            let token: String = (0..16)
                .map(|_| format!("{:02x}", rand::random::<u8>()))
                .collect();
            let mut tokens = state.tokens.lock().unwrap();
            // Sweep expired tokens (older than 24 hours)
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
    let store = state.store.lock().unwrap();
    match store.get(&key.into_inner()) {
        Some(v) => HttpResponse::Ok().json(serde_json::json!({ "value": v })),
        None => HttpResponse::Ok().json(serde_json::json!({ "value": null })),
    }
}

async fn set_store(
    state: web::Data<ServerState>,
    store_path: web::Data<String>,
    key: web::Path<String>,
    body: web::Json<Value>,
) -> HttpResponse {
    let raw = {
        let mut store = state.store.lock().unwrap();
        let value = body.get("value").and_then(|v| v.as_str()).unwrap_or("");
        store.insert(key.into_inner(), value.to_string());
        serde_json::to_string_pretty(&*store).unwrap()
    };
    let _ = std::fs::write(store_path.get_ref(), raw);
    HttpResponse::Ok().json(serde_json::json!({ "ok": true }))
}

async fn delete_store(
    state: web::Data<ServerState>,
    store_path: web::Data<String>,
    key: web::Path<String>,
) -> HttpResponse {
    let raw = {
        let mut store = state.store.lock().unwrap();
        store.remove(&key.into_inner());
        serde_json::to_string_pretty(&*store).unwrap()
    };
    let _ = std::fs::write(store_path.get_ref(), raw);
    HttpResponse::Ok().json(serde_json::json!({ "ok": true }))
}

async fn list_store(state: web::Data<ServerState>) -> HttpResponse {
    let store = state.store.lock().unwrap();
    HttpResponse::Ok().json(&*store)
}

// ── LAN server commands ────────────────────────────────

#[tauri::command]
pub(crate) fn lan_server_status(app: tauri::AppHandle) -> Result<String, String> {
    let store = crate::read_app_store(&app)?;
    let enabled = store
        .get("neotavern_lan_enabled")
        .map(|v| v == "true")
        .unwrap_or(false);
    let addr = store
        .get("neotavern_lan_addr")
        .cloned()
        .unwrap_or_else(|| "0.0.0.0".into());
    let port = store
        .get("neotavern_lan_port")
        .cloned()
        .unwrap_or_else(|| "3000".into());

    if enabled {
        Ok(format!("Running on {addr}:{port}"))
    } else {
        Ok("Disabled".into())
    }
}

/// Signal the LAN server to stop gracefully.
/// Call this on Tauri app exit so the server thread can join.
pub(crate) fn shutdown_lan_server() {
    if let Some(tx) = SHUTDOWN_TX.lock().unwrap().take() {
        let _ = tx.send(());
    }
}

pub(crate) fn try_start_lan_server(handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let mut store = crate::read_app_store(&handle).unwrap_or_default();
            let enabled = store
                .get("neotavern_lan_enabled")
                .map(|v| v == "true")
                .unwrap_or(false);
            if !enabled {
                return;
            }

            let addr = store
                .get("neotavern_lan_addr")
                .cloned()
                .unwrap_or_else(|| "0.0.0.0".into());
            let port: u16 = store
                .get("neotavern_lan_port")
                .and_then(|v| v.parse().ok())
                .unwrap_or(3000);

            let store_path = crate::app_store_path(&handle)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();

            // Generate and persist LAN password on first launch
            if !store.contains_key("neotavern_lan_password") {
                let pw = random_password();
                store.insert("neotavern_lan_password".into(), pw);
                let _ = crate::write_store_to_path(&store, &std::path::PathBuf::from(&store_path));
            }

            let web_dir = resolve_web_dir(&handle);
            let shared_store: Arc<Mutex<AppStore>> = Arc::new(Mutex::new(store));

            let (tx, rx) = tokio::sync::oneshot::channel();
            *SHUTDOWN_TX.lock().unwrap() = Some(tx);

            if let Err(e) = start(addr, port, shared_store, store_path, web_dir, rx).await {
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

/// Resolve the web assets directory at runtime.
///
/// Priority:
/// 1. `<exe_dir>/web/` — bundled install (see tauri.conf.json resources)
/// 2. `<exe_dir>/` — flat layout (NSIS installer may flatten)
/// 3. `apps/desktop/dist` — dev fallback
fn resolve_web_dir(_handle: &tauri::AppHandle) -> String {
    let exe = match std::env::current_exe() {
        Ok(exe) => exe,
        Err(_) => return dev_web_dir(),
    };

    let Some(install_dir) = exe.parent() else {
        return dev_web_dir();
    };

    // Bundled layout: <install>/web/index.html
    let web_dir = install_dir.join("web");
    if web_dir.join("index.html").exists() {
        return web_dir.to_string_lossy().to_string();
    }

    // Flat layout (NSIS): <install>/index.html
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
