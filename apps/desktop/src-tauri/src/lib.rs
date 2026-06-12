pub mod comfy;
pub mod db;
pub mod file;
pub mod lan;
pub mod search;

use std::{collections::BTreeMap, fs, path::PathBuf};
use tauri::Listener;
use tauri::Manager;

pub type AppStore = BTreeMap<String, String>;

pub(crate) fn app_store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Failed to resolve app data directory: {err}"))?;
    fs::create_dir_all(&dir)
        .map_err(|err| format!("Failed to create app data directory: {err}"))?;
    Ok(dir.join("store.json"))
}

pub(crate) fn read_app_store(app: &tauri::AppHandle) -> Result<AppStore, String> {
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

pub(crate) fn write_store_to_path(store: &AppStore, path: &PathBuf) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(store)
        .map_err(|err| format!("Failed to serialize app store: {err}"))?;
    fs::write(path, raw).map_err(|err| format!("Failed to write app store: {err}"))
}

// ── Tauri commands ─────────────────────────────────────
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
            lan::lan_server_status,
            file::pick_folder,
            file::save_workspace_dir,
            file::delete_workspace_dir,
            file::save_text_file,
            file::save_debug_prompt,
            db::sqlite_init_messages,
            db::sqlite_list_messages_by_chat_id,
            db::sqlite_list_recent_messages_by_chat_id,
            db::sqlite_list_child_messages,
            db::sqlite_migrate_parent_ids,
            db::sqlite_create_message,
            db::sqlite_update_message,
            db::sqlite_patch_message,
            db::sqlite_delete_messages_by_chat_id,
            db::sqlite_replace_messages_by_chat_id,
            db::sqlite_delete_message,
            db::sqlite_delete_messages,
            db::sqlite_init_agentic_play_states,
            db::sqlite_get_agentic_play_state,
            db::sqlite_upsert_agentic_play_state,
            db::sqlite_delete_agentic_play_state,
            db::sqlite_clear_agentic_play_states,
            search::web_search,
            comfy::comfy_get_system_stats,
            comfy::comfy_queue_prompt,
            comfy::comfy_get_history,
            comfy::comfy_get_image_data_url
        ])
        .setup(|app| {
            crate::lan::try_start_lan_server(app.handle().clone());
            // Graceful LAN server shutdown on app exit
            app.handle().listen_any("tauri://destroyed", |_| {
                crate::lan::shutdown_lan_server();
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
