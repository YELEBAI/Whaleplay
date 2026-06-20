pub mod comfy;
pub mod db;
pub mod file;
pub mod lan;
pub mod search;
pub mod store;

use tauri::Listener;

// ── Tauri commands ─────────────────────────────────────
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to Whale Play.", name)
}

#[tauri::command]
fn app_store_get(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    store::get(&app, &key)
}

#[tauri::command]
fn app_store_set(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    store::set(&app, &key, &value)
}

#[tauri::command]
fn app_store_remove(app: tauri::AppHandle, key: String) -> Result<(), String> {
    store::remove(&app, &key)
}

#[tauri::command]
fn app_store_entries(
    app: tauri::AppHandle,
) -> Result<std::collections::BTreeMap<String, String>, String> {
    store::entries(&app)
}

#[tauri::command]
fn app_store_batch(app: tauri::AppHandle, operations: Vec<store::StoreOp>) -> Result<(), String> {
    store::batch_ops(&app, &operations)
}

#[tauri::command]
fn app_store_lock(app: tauri::AppHandle) -> Result<bool, String> {
    store::try_lock(&app)
}

#[tauri::command]
fn app_store_unlock(app: tauri::AppHandle) -> Result<(), String> {
    store::unlock(&app)
}

#[tauri::command]
fn app_store_backup(app: tauri::AppHandle) -> Result<String, String> {
    store::backup(&app)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            app_store_get,
            app_store_set,
            app_store_remove,
            app_store_entries,
            app_store_batch,
            app_store_lock,
            app_store_unlock,
            app_store_backup,
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
            db::sqlite_get_version,
            db::sqlite_set_version,
            search::web_search,
            comfy::comfy_get_system_stats,
            comfy::comfy_queue_prompt,
            comfy::comfy_get_history,
            comfy::comfy_get_image_data_url
        ])
        .setup(|app| {
            crate::lan::try_start_lan_server(app.handle().clone());
            // Graceful LAN server shutdown on app exit
            // Must keep EventId alive — dropping it unregisters the listener.
            // Box::leak ensures it lives for the entire app lifetime.
            let guard = app.handle().listen_any("tauri://destroyed", |_| {
                crate::lan::shutdown_lan_server();
            });
            Box::leak(Box::new(guard));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
