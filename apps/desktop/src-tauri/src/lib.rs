use std::{collections::BTreeMap, fs, path::PathBuf};
use tauri::Manager;

type AppStore = BTreeMap<String, String>;

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

    let raw = fs::read_to_string(&path)
        .map_err(|err| format!("Failed to read app store: {err}"))?;
    if raw.trim().is_empty() {
        return Ok(AppStore::new());
    }

    serde_json::from_str(&raw).map_err(|err| format!("Failed to parse app store: {err}"))
}

fn write_app_store(app: &tauri::AppHandle, store: &AppStore) -> Result<(), String> {
    let path = app_store_path(app)?;
    let raw = serde_json::to_string_pretty(store)
        .map_err(|err| format!("Failed to serialize app store: {err}"))?;
    fs::write(&path, raw).map_err(|err| format!("Failed to write app store: {err}"))
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to NeoTavern Demo.", name)
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
        .invoke_handler(tauri::generate_handler![
            greet,
            app_store_get,
            app_store_set,
            app_store_remove,
            app_store_entries
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
