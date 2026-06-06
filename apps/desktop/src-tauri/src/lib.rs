pub mod server;

use base64::{engine::general_purpose, Engine as _};
use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use serde_json::json;
use std::{collections::BTreeMap, fs, path::PathBuf, sync::Arc, sync::Mutex, time::Duration};
use tauri::Manager;

pub type AppStore = BTreeMap<String, String>;

#[derive(Serialize)]
struct WebSearchResult {
    title: String,
    url: String,
    snippet: String,
}

fn app_store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Failed to resolve app data directory: {err}"))?;
    fs::create_dir_all(&dir)
        .map_err(|err| format!("Failed to create app data directory: {err}"))?;
    Ok(dir.join("store.json"))
}

fn read_app_store(app: &tauri::AppHandle) -> Result<AppStore, String> {
    let path = app_store_path(app)?;
    if !path.exists() {
        return Ok(AppStore::new());
    }
    let raw =
        fs::read_to_string(&path).map_err(|err| format!("Failed to read app store: {err}"))?;
    if raw.trim().is_empty() {
        return Ok(AppStore::new());
    }
    serde_json::from_str(&raw).map_err(|err| format!("Failed to parse app store: {err}"))
}

fn write_app_store(app: &tauri::AppHandle, store: &AppStore) -> Result<(), String> {
    let path = app_store_path(app)?;
    write_store_to_path(store, &path)
}

fn write_store_to_path(store: &AppStore, path: &PathBuf) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(store)
        .map_err(|err| format!("Failed to serialize app store: {err}"))?;
    fs::write(path, raw).map_err(|err| format!("Failed to write app store: {err}"))
}

// ── Tauri commands ─────────────────────────────────────
fn sqlite_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Failed to resolve app data directory: {err}"))?;
    fs::create_dir_all(&dir)
        .map_err(|err| format!("Failed to create app data directory: {err}"))?;
    Ok(dir.join("neotavern.sqlite3"))
}

fn open_sqlite(app: &tauri::AppHandle) -> Result<rusqlite::Connection, String> {
    let conn = rusqlite::Connection::open(sqlite_path(app)?)
        .map_err(|err| format!("Failed to open SQLite database: {err}"))?;
    conn.execute_batch(
        r#"
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY NOT NULL,
            chat_id TEXT NOT NULL,
            parent_id TEXT,
            created_at TEXT NOT NULL,
            message_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_messages_chat_created
            ON messages(chat_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_messages_parent_id
            ON messages(parent_id);
        CREATE TABLE IF NOT EXISTS agentic_play_states (
            chat_id TEXT PRIMARY KEY NOT NULL,
            character_id TEXT NOT NULL,
            enabled INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            record_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_agentic_play_states_character
            ON agentic_play_states(character_id, updated_at);
        "#,
    )
    .map_err(|err| format!("Failed to initialize SQLite schema: {err}"))?;

    // Migration: add parent_id column if upgrading from older schema
    let has_parent_id: bool = conn
        .prepare("SELECT parent_id FROM messages LIMIT 0")
        .is_ok();
    if !has_parent_id {
        conn.execute_batch(
            "ALTER TABLE messages ADD COLUMN parent_id TEXT;
             CREATE INDEX IF NOT EXISTS idx_messages_parent_id ON messages(parent_id);",
        )
        .map_err(|err| format!("Failed to migrate SQLite schema for parent_id: {err}"))?;
    }

    Ok(conn)
}

fn json_string_field<'a>(value: &'a serde_json::Value, field: &str) -> Result<&'a str, String> {
    value
        .get(field)
        .and_then(|inner| inner.as_str())
        .filter(|inner| !inner.is_empty())
        .ok_or_else(|| format!("Message is missing required field: {field}"))
}

fn serialize_message(
    message: &serde_json::Value,
) -> Result<(String, String, Option<String>, String, String), String> {
    let id = json_string_field(message, "id")?.to_string();
    let chat_id = json_string_field(message, "chatId")?.to_string();
    let parent_id = message
        .get("parentId")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let created_at = json_string_field(message, "createdAt")?.to_string();
    let raw = serde_json::to_string(message)
        .map_err(|err| format!("Failed to serialize message: {err}"))?;
    Ok((id, chat_id, parent_id, created_at, raw))
}

fn parse_message_json(raw: String) -> Result<serde_json::Value, String> {
    serde_json::from_str(&raw).map_err(|err| format!("Failed to parse message JSON: {err}"))
}

fn json_bool_field(value: &serde_json::Value, field: &str) -> Result<bool, String> {
    value
        .get(field)
        .and_then(|inner| inner.as_bool())
        .ok_or_else(|| format!("Agentic Play state is missing required boolean field: {field}"))
}

fn serialize_agentic_play_state(record: &serde_json::Value) -> Result<(String, String, bool, String, String, String), String> {
    let chat_id = json_string_field(record, "chatId")?.to_string();
    let character_id = json_string_field(record, "characterId")?.to_string();
    let enabled = json_bool_field(record, "enabled")?;
    let created_at = json_string_field(record, "createdAt")?.to_string();
    let updated_at = json_string_field(record, "updatedAt")?.to_string();
    let raw = serde_json::to_string(record)
        .map_err(|err| format!("Failed to serialize Agentic Play state: {err}"))?;
    Ok((chat_id, character_id, enabled, created_at, updated_at, raw))
}

fn parse_agentic_play_state_json(raw: String) -> Result<serde_json::Value, String> {
    serde_json::from_str(&raw).map_err(|err| format!("Failed to parse Agentic Play state JSON: {err}"))
}

fn read_sqlite_message(conn: &rusqlite::Connection, id: &str) -> Result<serde_json::Value, String> {
    let raw = conn
        .query_row(
            "SELECT message_json FROM messages WHERE id = ?1",
            params![id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|err| format!("Failed to read SQLite message: {err}"))?
        .ok_or_else(|| format!("Message not found: {id}"))?;
    parse_message_json(raw)
}

fn update_sqlite_message(
    conn: &rusqlite::Connection,
    message: &serde_json::Value,
) -> Result<(), String> {
    let (id, chat_id, parent_id, created_at, raw) = serialize_message(message)?;
    conn.execute(
        "UPDATE messages SET chat_id = ?1, parent_id = ?2, created_at = ?3, message_json = ?4 WHERE id = ?5",
        params![chat_id, parent_id, created_at, raw, id],
    )
    .map_err(|err| format!("Failed to update SQLite message: {err}"))?;
    Ok(())
}

fn comfy_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|err| format!("Failed to create HTTP client: {err}"))
}

fn clean_base_url(base_url: &str) -> String {
    base_url.trim().trim_end_matches('/').to_string()
}

fn short_body(body: &str) -> String {
    body.chars().take(200).collect()
}

fn html_entity_decode(input: &str) -> String {
    input
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = &input[i + 1..i + 3];
            if let Ok(value) = u8::from_str_radix(hex, 16) {
                out.push(value);
                i += 3;
                continue;
            }
        }
        out.push(if bytes[i] == b'+' { b' ' } else { bytes[i] });
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn strip_html_tags(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut in_tag = false;
    for ch in input.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                out.push(' ');
            }
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    html_entity_decode(&out)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn find_between<'a>(input: &'a str, start: &str, end: &str) -> Option<&'a str> {
    let start_index = input.find(start)? + start.len();
    let rest = &input[start_index..];
    let end_index = rest.find(end)?;
    Some(&rest[..end_index])
}

fn extract_attr(input: &str, name: &str) -> Option<String> {
    let needle = format!("{name}=\"");
    find_between(input, &needle, "\"").map(|value| html_entity_decode(value.trim()))
}

fn clean_duckduckgo_url(raw: &str) -> String {
    let decoded = html_entity_decode(raw);
    if let Some(index) = decoded.find("uddg=") {
        let encoded = &decoded[index + 5..];
        let end = encoded.find('&').unwrap_or(encoded.len());
        return percent_decode(&encoded[..end]);
    }
    if decoded.starts_with("//") {
        return format!("https:{decoded}");
    }
    decoded
}

fn parse_duckduckgo_results(html: &str, limit: usize) -> Vec<WebSearchResult> {
    let mut results = Vec::new();
    for block in html.split("result__body").skip(1) {
        if results.len() >= limit {
            break;
        }

        let Some(anchor_start) = block.find("<a") else {
            continue;
        };
        let anchor = &block[anchor_start..];
        let Some(anchor_end) = anchor.find("</a>") else {
            continue;
        };
        let anchor_block = &anchor[..anchor_end];
        if !anchor_block.contains("result__a") {
            continue;
        }

        let Some(raw_url) = extract_attr(anchor_block, "href") else {
            continue;
        };
        let title = strip_html_tags(anchor_block);
        if title.is_empty() {
            continue;
        }

        let snippet = if let Some(snippet_start) = block.find("result__snippet") {
            let snippet_block = &block[snippet_start..];
            strip_html_tags(find_between(snippet_block, ">", "</a>").unwrap_or_default())
        } else {
            String::new()
        };

        results.push(WebSearchResult {
            title,
            url: clean_duckduckgo_url(&raw_url),
            snippet,
        });
    }
    results
}

async fn read_comfy_json_response(
    response: reqwest::Response,
    label: &str,
) -> Result<serde_json::Value, String> {
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("{label} failed: {status} {}", short_body(&body)));
    }

    response
        .json::<serde_json::Value>()
        .await
        .map_err(|err| format!("{label} returned invalid JSON: {err}"))
}

#[tauri::command]
async fn web_search(query: String, limit: Option<usize>) -> Result<Vec<WebSearchResult>, String> {
    let clean_query = query.trim();
    if clean_query.is_empty() {
        return Ok(Vec::new());
    }

    let limit = limit.unwrap_or(5).clamp(1, 8);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("WhalePlay/0.1 (+https://local.whale-play)")
        .build()
        .map_err(|err| format!("Failed to create search client: {err}"))?;
    let url =
        reqwest::Url::parse_with_params("https://duckduckgo.com/html/", &[("q", clean_query)])
            .map_err(|err| format!("Failed to build search URL: {err}"))?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|err| format!("Search request failed: {err}"))?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Search failed: {status} {}", short_body(&body)));
    }

    let html = response
        .text()
        .await
        .map_err(|err| format!("Failed to read search response: {err}"))?;
    Ok(parse_duckduckgo_results(&html, limit))
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to Whale Play.", name)
}

#[tauri::command]
fn app_store_get(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    let store = read_app_store(&app)?;
    Ok(store.get(&key).cloned())
}

#[tauri::command]
fn app_store_set(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    let mut store = read_app_store(&app)?;
    store.insert(key, value);
    write_app_store(&app, &store)
}

#[tauri::command]
fn app_store_remove(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let mut store = read_app_store(&app)?;
    store.remove(&key);
    write_app_store(&app, &store)
}

#[tauri::command]
fn app_store_entries(app: tauri::AppHandle) -> Result<AppStore, String> {
    read_app_store(&app)
}

// ── LAN server commands ────────────────────────────────

#[tauri::command]
fn lan_server_status(app: tauri::AppHandle) -> Result<String, String> {
    let store = read_app_store(&app)?;
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

fn try_start_lan_server(handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let mut store = read_app_store(&handle).unwrap_or_default();
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

            let store_path = app_store_path(&handle)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();

            // Generate and persist LAN password on first launch
            if !store.contains_key("neotavern_lan_password") {
                let pw = random_password();
                store.insert("neotavern_lan_password".into(), pw);
                let _ = write_store_to_path(&store, &std::path::PathBuf::from(&store_path));
            }

            let frontend_dir = resolve_frontend_dir(&handle);
            let shared_store: Arc<Mutex<AppStore>> = Arc::new(Mutex::new(store));

            if let Err(e) =
                crate::server::start(addr, port, shared_store, store_path, frontend_dir).await
            {
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

fn resolve_frontend_dir(_handle: &tauri::AppHandle) -> String {
    // The exe is in the install dir; dist/ is bundled as frontend/ alongside it
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let frontend = dir.join("frontend");
            if frontend.join("index.html").exists() {
                return frontend.to_string_lossy().to_string();
            }
            // Fallback: flat files (NSIS may have flattened)
            if dir.join("index.html").exists() {
                return dir.to_string_lossy().to_string();
            }
        }
    }
    // Dev fallback: project's dist/
    std::env::current_dir()
        .map(|p| p.join("apps/desktop/dist").to_string_lossy().to_string())
        .unwrap_or_else(|_| "apps/desktop/dist".into())
}

// ── App entry ──────────────────────────────────────────

#[tauri::command]
fn save_text_file(default_filename: String, content: String) -> Result<Option<String>, String> {
    let path = rfd::FileDialog::new()
        .add_filter("JSON", &["json"])
        .set_file_name(&default_filename)
        .save_file();

    let Some(path) = path else {
        return Ok(None);
    };

    fs::write(&path, content).map_err(|err| format!("Failed to save file: {err}"))?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
fn pick_folder() -> Result<Option<String>, String> {
    let path = rfd::FileDialog::new().pick_folder();
    Ok(path.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn write_file_to_path(path: String, content: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("Failed to create directory: {err}"))?;
    }
    fs::write(&p, content).map_err(|err| format!("Failed to write file: {err}"))
}

#[tauri::command]
fn save_workspace_dir(
    app: tauri::AppHandle,
    session_id: String,
    entries_json: String,
) -> Result<(), String> {
    let mut dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Failed to resolve app data directory: {err}"))?;
    dir.push("worldbook_workspaces");
    dir.push(&session_id);

    // Clear existing workspace files
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|err| format!("Failed to clear workspace dir: {err}"))?;
    }
    fs::create_dir_all(&dir).map_err(|err| format!("Failed to create workspace dir: {err}"))?;

    let entries: Vec<serde_json::Value> = serde_json::from_str(&entries_json)
        .map_err(|err| format!("Invalid entries JSON: {err}"))?;

    for entry in &entries {
        let path_str = entry["entryPath"].as_str().unwrap_or("");
        let content = entry["content"].as_str().unwrap_or("");
        if path_str.is_empty() || content.is_empty() {
            continue;
        }

        let file_path = dir.join(path_str);
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent).map_err(|err| format!("Failed to create dir: {err}"))?;
        }
        fs::write(&file_path, content)
            .map_err(|err| format!("Failed to write entry file {}: {err}", path_str))?;
    }

    Ok(())
}

#[tauri::command]
fn delete_workspace_dir(app: tauri::AppHandle, session_id: String) -> Result<(), String> {
    let mut dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Failed to resolve app data directory: {err}"))?;
    dir.push("worldbook_workspaces");
    dir.push(&session_id);

    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|err| format!("Failed to delete workspace dir: {err}"))?;
    }
    Ok(())
}

#[tauri::command]
fn save_debug_prompt(
    app: tauri::AppHandle,
    folder: String,
    filename: String,
    content: String,
) -> Result<String, String> {
    let mut dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Failed to resolve app data directory: {err}"))?;
    dir.push("debug_prompts");
    dir.push(&folder);
    fs::create_dir_all(&dir)
        .map_err(|err| format!("Failed to create debug_prompts directory: {err}"))?;
    dir.push(&filename);
    fs::write(&dir, content).map_err(|err| format!("Failed to write debug prompt: {err}"))?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn sqlite_init_messages(
    app: tauri::AppHandle,
    legacy_messages_json: Option<String>,
) -> Result<(), String> {
    let mut conn = open_sqlite(&app)?;
    let count = conn
        .query_row("SELECT COUNT(*) FROM messages", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|err| format!("Failed to count SQLite messages: {err}"))?;

    if count > 0 {
        return Ok(());
    }

    let Some(raw) = legacy_messages_json else {
        return Ok(());
    };
    if raw.trim().is_empty() {
        return Ok(());
    }

    let parsed = serde_json::from_str::<serde_json::Value>(&raw)
        .map_err(|err| format!("Failed to parse legacy messages: {err}"))?;
    let Some(messages) = parsed.as_array() else {
        return Ok(());
    };

    let tx = conn
        .transaction()
        .map_err(|err| format!("Failed to start SQLite migration: {err}"))?;
    for message in messages {
        let (id, chat_id, parent_id, created_at, message_raw) = serialize_message(message)?;
        tx.execute(
            "INSERT OR IGNORE INTO messages (id, chat_id, parent_id, created_at, message_json)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, chat_id, parent_id, created_at, message_raw],
        )
        .map_err(|err| format!("Failed to migrate SQLite message: {err}"))?;
    }
    tx.commit()
        .map_err(|err| format!("Failed to finish SQLite migration: {err}"))?;
    Ok(())
}

#[tauri::command]
fn sqlite_list_messages_by_chat_id(
    app: tauri::AppHandle,
    chat_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = open_sqlite(&app)?;
    let mut stmt = conn
        .prepare(
            "SELECT message_json FROM messages
             WHERE chat_id = ?1
             ORDER BY created_at ASC, id ASC",
        )
        .map_err(|err| format!("Failed to prepare SQLite message query: {err}"))?;
    let rows = stmt
        .query_map(params![chat_id], |row| row.get::<_, String>(0))
        .map_err(|err| format!("Failed to query SQLite messages: {err}"))?;

    let mut messages = Vec::new();
    for row in rows {
        messages.push(parse_message_json(row.map_err(|err| {
            format!("Failed to read SQLite message row: {err}")
        })?)?);
    }
    Ok(messages)
}

#[tauri::command]
fn sqlite_list_recent_messages_by_chat_id(
    app: tauri::AppHandle,
    chat_id: String,
    limit: i64,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = open_sqlite(&app)?;
    let capped_limit = limit.max(1).min(500);
    let mut stmt = conn
        .prepare(
            "SELECT message_json FROM (
                SELECT message_json, created_at, id FROM messages
                WHERE chat_id = ?1
                ORDER BY created_at DESC, id DESC
                LIMIT ?2
             )
             ORDER BY created_at ASC, id ASC",
        )
        .map_err(|err| format!("Failed to prepare recent SQLite message query: {err}"))?;
    let rows = stmt
        .query_map(params![chat_id, capped_limit], |row| {
            row.get::<_, String>(0)
        })
        .map_err(|err| format!("Failed to query recent SQLite messages: {err}"))?;

    let mut messages = Vec::new();
    for row in rows {
        messages.push(parse_message_json(row.map_err(|err| {
            format!("Failed to read recent SQLite message row: {err}")
        })?)?);
    }
    Ok(messages)
}

#[tauri::command]
fn sqlite_list_child_messages(
    app: tauri::AppHandle,
    parent_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = open_sqlite(&app)?;
    let mut stmt = conn
        .prepare(
            "SELECT message_json FROM messages
             WHERE parent_id = ?1
             ORDER BY created_at ASC, id ASC",
        )
        .map_err(|err| format!("Failed to prepare child message query: {err}"))?;
    let rows = stmt
        .query_map(params![parent_id], |row| row.get::<_, String>(0))
        .map_err(|err| format!("Failed to query child messages: {err}"))?;

    let mut messages = Vec::new();
    for row in rows {
        messages.push(parse_message_json(row.map_err(|err| {
            format!("Failed to read child message row: {err}")
        })?)?);
    }
    Ok(messages)
}

#[tauri::command]
fn sqlite_migrate_parent_ids(app: tauri::AppHandle) -> Result<usize, String> {
    let conn = open_sqlite(&app)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, chat_id, created_at FROM messages
             WHERE parent_id IS NULL
             ORDER BY chat_id, created_at ASC, id ASC",
        )
        .map_err(|err| format!("Failed to prepare parent_id migration query: {err}"))?;
    let rows: Vec<(String, String, String)> = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|err| format!("Failed to read messages for parent_id migration: {err}"))?
        .filter_map(|r| r.ok())
        .collect();

    let mut count = 0usize;
    let mut prev_by_chat: std::collections::HashMap<String, String> = std::collections::HashMap::new();

    for (id, chat_id, _created_at) in &rows {
        if let Some(prev_id) = prev_by_chat.get(chat_id) {
            conn.execute(
                "UPDATE messages SET parent_id = ?1 WHERE id = ?2",
                params![prev_id, id],
            )
            .map_err(|err| format!("Failed to set parent_id: {err}"))?;
            count += 1;
        }
        prev_by_chat.insert(chat_id.clone(), id.clone());
    }

    Ok(count)
}

#[tauri::command]
fn sqlite_create_message(
    app: tauri::AppHandle,
    message: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let conn = open_sqlite(&app)?;
    let (id, chat_id, parent_id, created_at, raw) = serialize_message(&message)?;
    conn.execute(
        "INSERT OR REPLACE INTO messages (id, chat_id, parent_id, created_at, message_json)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, chat_id, parent_id, created_at, raw],
    )
    .map_err(|err| format!("Failed to create SQLite message: {err}"))?;
    Ok(message)
}

#[tauri::command]
fn sqlite_update_message(
    app: tauri::AppHandle,
    id: String,
    content: String,
) -> Result<serde_json::Value, String> {
    let conn = open_sqlite(&app)?;
    let mut message = read_sqlite_message(&conn, &id)?;
    let Some(object) = message.as_object_mut() else {
        return Err("Stored message is not a JSON object.".to_string());
    };
    object.insert("content".to_string(), serde_json::Value::String(content));
    update_sqlite_message(&conn, &message)?;
    Ok(message)
}

#[tauri::command]
fn sqlite_patch_message(
    app: tauri::AppHandle,
    id: String,
    patch: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let conn = open_sqlite(&app)?;
    let mut message = read_sqlite_message(&conn, &id)?;
    let Some(message_object) = message.as_object_mut() else {
        return Err("Stored message is not a JSON object.".to_string());
    };
    let Some(patch_object) = patch.as_object() else {
        return Err("Message patch is not a JSON object.".to_string());
    };

    for (key, value) in patch_object {
        message_object.insert(key.clone(), value.clone());
    }

    update_sqlite_message(&conn, &message)?;
    Ok(message)
}

#[tauri::command]
fn sqlite_delete_messages_by_chat_id(app: tauri::AppHandle, chat_id: String) -> Result<(), String> {
    let conn = open_sqlite(&app)?;
    conn.execute("DELETE FROM messages WHERE chat_id = ?1", params![chat_id])
        .map_err(|err| format!("Failed to delete SQLite messages by chat: {err}"))?;
    Ok(())
}

#[tauri::command]
fn sqlite_replace_messages_by_chat_id(
    app: tauri::AppHandle,
    chat_id: String,
    messages: Vec<serde_json::Value>,
) -> Result<Vec<serde_json::Value>, String> {
    let mut conn = open_sqlite(&app)?;
    let tx = conn
        .transaction()
        .map_err(|err| format!("Failed to start SQLite replace transaction: {err}"))?;
    tx.execute("DELETE FROM messages WHERE chat_id = ?1", params![chat_id])
        .map_err(|err| format!("Failed to clear SQLite chat messages: {err}"))?;

    for message in &messages {
        let (id, message_chat_id, parent_id, created_at, raw) = serialize_message(message)?;
        if message_chat_id != chat_id {
            return Err("Replacement message chatId does not match target chat.".to_string());
        }
        tx.execute(
            "INSERT OR REPLACE INTO messages (id, chat_id, parent_id, created_at, message_json)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, message_chat_id, parent_id, created_at, raw],
        )
        .map_err(|err| format!("Failed to insert replacement SQLite message: {err}"))?;
    }

    tx.commit()
        .map_err(|err| format!("Failed to finish SQLite replace transaction: {err}"))?;
    Ok(messages)
}

#[tauri::command]
fn sqlite_delete_message(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = open_sqlite(&app)?;
    conn.execute("DELETE FROM messages WHERE id = ?1", params![id])
        .map_err(|err| format!("Failed to delete SQLite message: {err}"))?;
    Ok(())
}

#[tauri::command]
fn sqlite_delete_messages(app: tauri::AppHandle, ids: Vec<String>) -> Result<(), String> {
    let mut conn = open_sqlite(&app)?;
    let tx = conn
        .transaction()
        .map_err(|err| format!("Failed to start SQLite delete transaction: {err}"))?;
    for id in ids {
        tx.execute("DELETE FROM messages WHERE id = ?1", params![id])
            .map_err(|err| format!("Failed to delete SQLite message: {err}"))?;
    }
    tx.commit()
        .map_err(|err| format!("Failed to finish SQLite delete transaction: {err}"))?;
    Ok(())
}

#[tauri::command]
fn sqlite_init_agentic_play_states(
    app: tauri::AppHandle,
    legacy_states_json: Option<String>,
) -> Result<(), String> {
    let mut conn = open_sqlite(&app)?;
    let count = conn
        .query_row("SELECT COUNT(*) FROM agentic_play_states", [], |row| row.get::<_, i64>(0))
        .map_err(|err| format!("Failed to count SQLite Agentic Play states: {err}"))?;

    if count > 0 {
        return Ok(());
    }

    let Some(raw) = legacy_states_json else {
        return Ok(());
    };
    if raw.trim().is_empty() {
        return Ok(());
    }

    let parsed = serde_json::from_str::<serde_json::Value>(&raw)
        .map_err(|err| format!("Failed to parse legacy Agentic Play states: {err}"))?;
    let Some(records) = parsed.as_array() else {
        return Ok(());
    };

    let tx = conn
        .transaction()
        .map_err(|err| format!("Failed to start Agentic Play SQLite migration: {err}"))?;
    for record in records {
        let (chat_id, character_id, enabled, created_at, updated_at, record_raw) = serialize_agentic_play_state(record)?;
        tx.execute(
            "INSERT OR IGNORE INTO agentic_play_states (chat_id, character_id, enabled, created_at, updated_at, record_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![chat_id, character_id, if enabled { 1 } else { 0 }, created_at, updated_at, record_raw],
        )
        .map_err(|err| format!("Failed to migrate Agentic Play state: {err}"))?;
    }
    tx.commit()
        .map_err(|err| format!("Failed to finish Agentic Play SQLite migration: {err}"))?;
    Ok(())
}

#[tauri::command]
fn sqlite_get_agentic_play_state(
    app: tauri::AppHandle,
    chat_id: String,
) -> Result<Option<serde_json::Value>, String> {
    let conn = open_sqlite(&app)?;
    let raw = conn
        .query_row(
            "SELECT record_json FROM agentic_play_states WHERE chat_id = ?1",
            params![chat_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|err| format!("Failed to read SQLite Agentic Play state: {err}"))?;
    raw.map(parse_agentic_play_state_json).transpose()
}

#[tauri::command]
fn sqlite_upsert_agentic_play_state(
    app: tauri::AppHandle,
    record: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let conn = open_sqlite(&app)?;
    let (chat_id, character_id, enabled, created_at, updated_at, raw) = serialize_agentic_play_state(&record)?;
    conn.execute(
        "INSERT OR REPLACE INTO agentic_play_states (chat_id, character_id, enabled, created_at, updated_at, record_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![chat_id, character_id, if enabled { 1 } else { 0 }, created_at, updated_at, raw],
    )
    .map_err(|err| format!("Failed to upsert SQLite Agentic Play state: {err}"))?;
    Ok(record)
}

#[tauri::command]
fn sqlite_delete_agentic_play_state(app: tauri::AppHandle, chat_id: String) -> Result<(), String> {
    let conn = open_sqlite(&app)?;
    conn.execute("DELETE FROM agentic_play_states WHERE chat_id = ?1", params![chat_id])
        .map_err(|err| format!("Failed to delete SQLite Agentic Play state: {err}"))?;
    Ok(())
}

#[tauri::command]
fn sqlite_clear_agentic_play_states(app: tauri::AppHandle) -> Result<(), String> {
    let conn = open_sqlite(&app)?;
    conn.execute("DELETE FROM agentic_play_states", [])
        .map_err(|err| format!("Failed to clear SQLite Agentic Play states: {err}"))?;
    Ok(())
}

#[tauri::command]
async fn comfy_get_system_stats(base_url: String) -> Result<serde_json::Value, String> {
    let client = comfy_client()?;
    let url = format!("{}/system_stats", clean_base_url(&base_url));
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|err| format!("ComfyUI connection failed: {err}"))?;

    read_comfy_json_response(response, "ComfyUI connection").await
}

#[tauri::command]
async fn comfy_queue_prompt(
    base_url: String,
    prompt: serde_json::Value,
    client_id: String,
) -> Result<serde_json::Value, String> {
    let client = comfy_client()?;
    let url = format!("{}/prompt", clean_base_url(&base_url));
    let response = client
        .post(url)
        .json(&json!({ "prompt": prompt, "client_id": client_id }))
        .send()
        .await
        .map_err(|err| format!("ComfyUI prompt request failed: {err}"))?;

    read_comfy_json_response(response, "ComfyUI prompt").await
}

#[tauri::command]
async fn comfy_get_history(
    base_url: String,
    prompt_id: String,
) -> Result<serde_json::Value, String> {
    let client = comfy_client()?;
    let url = format!("{}/history/{}", clean_base_url(&base_url), prompt_id);
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|err| format!("ComfyUI history request failed: {err}"))?;

    read_comfy_json_response(response, "ComfyUI history").await
}

#[tauri::command]
async fn comfy_get_image_data_url(
    base_url: String,
    filename: String,
    subfolder: Option<String>,
    image_type: Option<String>,
) -> Result<String, String> {
    let client = comfy_client()?;
    let mut url = reqwest::Url::parse(&format!("{}/view", clean_base_url(&base_url)))
        .map_err(|err| format!("Invalid ComfyUI image URL: {err}"))?;

    {
        let mut query = url.query_pairs_mut();
        query.append_pair("filename", &filename);
        if let Some(subfolder) = subfolder.as_deref().filter(|value| !value.is_empty()) {
            query.append_pair("subfolder", subfolder);
        }
        if let Some(image_type) = image_type.as_deref().filter(|value| !value.is_empty()) {
            query.append_pair("type", image_type);
        }
    }

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|err| format!("ComfyUI image request failed: {err}"))?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "ComfyUI image fetch failed: {status} {}",
            short_body(&body)
        ));
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("image/png")
        .to_string();
    let bytes = response
        .bytes()
        .await
        .map_err(|err| format!("Failed to read ComfyUI image: {err}"))?;
    let encoded = general_purpose::STANDARD.encode(bytes);

    Ok(format!("data:{content_type};base64,{encoded}"))
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            app_store_get,
            app_store_set,
            app_store_remove,
            app_store_entries,
            lan_server_status,
            pick_folder,
            write_file_to_path,
            save_workspace_dir,
            delete_workspace_dir,
            save_text_file,
            save_debug_prompt,
            sqlite_init_messages,
            sqlite_list_messages_by_chat_id,
            sqlite_list_recent_messages_by_chat_id,
            sqlite_list_child_messages,
            sqlite_migrate_parent_ids,
            sqlite_create_message,
            sqlite_update_message,
            sqlite_patch_message,
            sqlite_delete_messages_by_chat_id,
            sqlite_replace_messages_by_chat_id,
            sqlite_delete_message,
            sqlite_delete_messages,
            sqlite_init_agentic_play_states,
            sqlite_get_agentic_play_state,
            sqlite_upsert_agentic_play_state,
            sqlite_delete_agentic_play_state,
            sqlite_clear_agentic_play_states,
            web_search,
            comfy_get_system_stats,
            comfy_queue_prompt,
            comfy_get_history,
            comfy_get_image_data_url
        ])
        .setup(|app| {
            try_start_lan_server(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
