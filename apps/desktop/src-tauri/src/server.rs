use std::sync::{Arc, Mutex};

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

/// In-memory session tokens: session_token → TokenEntry
type TokenStore = Arc<Mutex<std::collections::HashMap<String, crate::sync::TokenEntry>>>;

/// Start the LAN HTTP server.
pub async fn start(
    addr: String,
    port: u16,
    store: Arc<Mutex<AppStore>>,
    store_path: String,
    frontend_dir: String,
) -> std::io::Result<()> {
    let tokens: TokenStore = Arc::new(Mutex::new(std::collections::HashMap::new()));

    let state = web::Data::new(ServerState {
        store: store.clone(),
        tokens: tokens.clone(),
    });
    let store_path_data = web::Data::new(store_path);

    HttpServer::new(move || {
        let frontend = frontend_dir.clone();
        App::new()
            .app_data(state.clone())
            .app_data(store_path_data.clone())
            // ── Public routes ────────────────────────
            .route("/api/auth/login", web::post().to(login))
            .route("/api/pair", web::post().to(pair))
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
            .service(Files::new("/", &frontend).index_file("index.html"))
    })
    .bind((addr.as_str(), port))?
    .run()
    .await
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
            .map(|s| s.tokens.lock().unwrap().contains_key(t.as_str()))
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
            let token = crate::sync::generate_session_token();
            state.tokens.lock().unwrap().insert(
                token.clone(),
                crate::sync::TokenEntry {
                    device_id: "web-ui".into(),
                    expires_at: u64::MAX,
                },
            );
            HttpResponse::Ok().json(serde_json::json!({ "token": token }))
        }
        _ => HttpResponse::Unauthorized().json(serde_json::json!({ "error": "invalid password" })),
    }
}

// ── Pair handler ────────────────────────────────────────

#[derive(serde::Deserialize)]
struct PairBody {
    token: String,
    #[serde(rename = "deviceName")]
    device_name: Option<String>,
}

async fn pair(
    state: web::Data<ServerState>,
    body: web::Json<PairBody>,
) -> HttpResponse {
    match crate::sync::verify_pairing_token(&body.token) {
        Ok(device_id) => {
            let session_token = crate::sync::generate_session_token();
            let now_ms = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64;
            state.tokens.lock().unwrap().insert(
                session_token.clone(),
                crate::sync::TokenEntry {
                    device_id,
                    expires_at: now_ms + 24 * 60 * 60 * 1000, // 24h
                },
            );
            HttpResponse::Ok().json(serde_json::json!({
                "sessionToken": session_token,
                "deviceName": body.device_name.clone().unwrap_or_default(),
            }))
        }
        Err(err) => HttpResponse::Unauthorized().json(serde_json::json!({ "error": err })),
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
    let mut store = state.store.lock().unwrap();
    let value = body.get("value").and_then(|v| v.as_str()).unwrap_or("");
    store.insert(key.into_inner(), value.to_string());

    let raw = serde_json::to_string_pretty(&*store).unwrap();
    let _ = std::fs::write(store_path.get_ref(), raw);
    HttpResponse::Ok().json(serde_json::json!({ "ok": true }))
}

async fn delete_store(
    state: web::Data<ServerState>,
    store_path: web::Data<String>,
    key: web::Path<String>,
) -> HttpResponse {
    let mut store = state.store.lock().unwrap();
    store.remove(&key.into_inner());

    let raw = serde_json::to_string_pretty(&*store).unwrap();
    let _ = std::fs::write(store_path.get_ref(), raw);
    HttpResponse::Ok().json(serde_json::json!({ "ok": true }))
}

async fn list_store(state: web::Data<ServerState>) -> HttpResponse {
    let store = state.store.lock().unwrap();
    let entries: Vec<_> = store.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
    HttpResponse::Ok().json(entries)
}
