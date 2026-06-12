use std::{fs, path::PathBuf};
use tauri::Manager;

#[tauri::command]
pub(crate) fn save_text_file(
    default_filename: String,
    content: String,
) -> Result<Option<String>, String> {
    let path = rfd::FileDialog::new()
        .add_filter("JSON", &["json"])
        .set_file_name(&default_filename)
        .save_file();

    let Some(path) = path else {
        return Ok(None);
    };

    const MAX_FILE_SIZE: usize = 100 * 1024 * 1024;
    if content.len() > MAX_FILE_SIZE {
        return Err("File content exceeds 100 MB size limit".to_string());
    }

    fs::write(&path, content).map_err(|err| format!("Failed to save file: {err}"))?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
pub(crate) fn pick_folder() -> Result<Option<String>, String> {
    let path = rfd::FileDialog::new().pick_folder();
    Ok(path.map(|p| p.to_string_lossy().to_string()))
}

#[allow(dead_code)]
fn write_file_to_path(path: String, content: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("Failed to create directory: {err}"))?;
    }
    fs::write(&p, content).map_err(|err| format!("Failed to write file: {err}"))
}

#[tauri::command]
pub(crate) fn save_workspace_dir(
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

    // Write to a temporary directory first, then atomically rename
    let tmp_dir = dir.with_extension("tmp");
    if tmp_dir.exists() {
        fs::remove_dir_all(&tmp_dir)
            .map_err(|err| format!("Failed to clear temp workspace dir: {err}"))?;
    }
    fs::create_dir_all(&tmp_dir)
        .map_err(|err| format!("Failed to create temp workspace dir: {err}"))?;

    let entries: Vec<serde_json::Value> = serde_json::from_str(&entries_json)
        .map_err(|err| format!("Invalid entries JSON: {err}"))?;

    for entry in &entries {
        let path_str = entry["entryPath"].as_str().unwrap_or("");
        let content = entry["content"].as_str().unwrap_or("");
        if path_str.is_empty() || content.is_empty() {
            continue;
        }

        let file_path = tmp_dir.join(path_str);
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent).map_err(|err| format!("Failed to create dir: {err}"))?;
        }
        fs::write(&file_path, content)
            .map_err(|err| format!("Failed to write entry file {}: {err}", path_str))?;
    }

    // Atomically replace the real directory
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|err| format!("Failed to clear workspace dir: {err}"))?;
    }
    fs::rename(&tmp_dir, &dir).map_err(|err| format!("Failed to finalize workspace dir: {err}"))?;

    Ok(())
}

#[tauri::command]
pub(crate) fn delete_workspace_dir(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<(), String> {
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
pub(crate) fn save_debug_prompt(
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

    const MAX_FILE_SIZE: usize = 100 * 1024 * 1024;
    if content.len() > MAX_FILE_SIZE {
        return Err("File content exceeds 100 MB size limit".to_string());
    }

    fs::write(&dir, content).map_err(|err| format!("Failed to write debug prompt: {err}"))?;
    Ok(dir.to_string_lossy().to_string())
}
