use rusqlite::{params, OptionalExtension};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::Manager;

static DB: OnceLock<Result<Mutex<rusqlite::Connection>, String>> = OnceLock::new();

fn sqlite_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Failed to resolve app data directory: {err}"))?;
    std::fs::create_dir_all(&dir)
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

    // Bootstrap PRAGMA user_version if not set
    let version: i64 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap_or(0);
    if version == 0 {
        conn.pragma_update(None, "user_version", 1)
            .map_err(|err| format!("Failed to set SQLite user_version: {err}"))?;
    }

    Ok(conn)
}

fn get_db(app: &tauri::AppHandle) -> Result<&Mutex<rusqlite::Connection>, String> {
    match DB.get_or_init(|| open_sqlite(app).map(Mutex::new)) {
        Ok(mutex_conn) => Ok(mutex_conn),
        Err(e) => Err(e.clone()),
    }
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

fn serialize_agentic_play_state(
    record: &serde_json::Value,
) -> Result<(String, String, bool, String, String, String), String> {
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
    serde_json::from_str(&raw)
        .map_err(|err| format!("Failed to parse Agentic Play state JSON: {err}"))
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

#[tauri::command]
pub(crate) fn sqlite_init_messages(
    app: tauri::AppHandle,
    legacy_messages_json: Option<String>,
) -> Result<(), String> {
    let mut conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
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
pub(crate) fn sqlite_list_messages_by_chat_id(
    app: tauri::AppHandle,
    chat_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
    let mut stmt = conn
        .prepare(
            "SELECT message_json FROM messages
             WHERE chat_id = ?1
             ORDER BY created_at ASC, id ASC
             LIMIT 1000",
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
pub(crate) fn sqlite_list_recent_messages_by_chat_id(
    app: tauri::AppHandle,
    chat_id: String,
    limit: i64,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
    let capped_limit = limit.clamp(1, 500);
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
pub(crate) fn sqlite_list_child_messages(
    app: tauri::AppHandle,
    parent_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
    let mut stmt = conn
        .prepare(
            "SELECT message_json FROM messages
             WHERE parent_id = ?1
             ORDER BY created_at ASC, id ASC
             LIMIT 1000",
        )
        .map_err(|err| format!("Failed to prepare child message query: {err}"))?;
    let rows = stmt
        .query_map(params![parent_id], |row| row.get::<_, String>(0))
        .map_err(|err| format!("Failed to query child messages: {err}"))?;

    let mut messages = Vec::new();
    for row in rows {
        messages.push(parse_message_json(
            row.map_err(|err| format!("Failed to read child message row: {err}"))?,
        )?);
    }
    Ok(messages)
}

#[tauri::command]
pub(crate) fn sqlite_migrate_parent_ids(app: tauri::AppHandle) -> Result<usize, String> {
    let conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, chat_id, created_at FROM messages
             WHERE parent_id IS NULL
             ORDER BY chat_id, created_at ASC, id ASC",
        )
        .map_err(|err| format!("Failed to prepare parent_id migration query: {err}"))?;
    let mut count = 0usize;
    let mut prev_by_chat: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();

    // Scope the SELECT so the statement borrow is released before we issue UPDATEs.
    let pending: Vec<(String, String)> = {
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|err| format!("Failed to read messages for parent_id migration: {err}"))?;
        let mut pending = Vec::new();
        for row in rows {
            let (id, chat_id) =
                row.map_err(|err| format!("Failed to read migration row: {err}"))?;
            if let Some(prev_id) = prev_by_chat.get(&chat_id) {
                pending.push((prev_id.clone(), id.clone()));
            }
            prev_by_chat.insert(chat_id, id);
        }
        pending
    }; // stmt borrow released here

    for (prev_id, id) in &pending {
        conn.execute(
            "UPDATE messages SET parent_id = ?1 WHERE id = ?2",
            params![prev_id, id],
        )
        .map_err(|err| format!("Failed to set parent_id: {err}"))?;
        count += 1;
    }

    Ok(count)
}

#[tauri::command]
pub(crate) fn sqlite_create_message(
    app: tauri::AppHandle,
    message: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
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
pub(crate) fn sqlite_update_message(
    app: tauri::AppHandle,
    id: String,
    content: String,
) -> Result<serde_json::Value, String> {
    let conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
    let mut message = read_sqlite_message(&conn, &id)?;
    let Some(object) = message.as_object_mut() else {
        return Err("Stored message is not a JSON object.".to_string());
    };
    object.insert("content".to_string(), serde_json::Value::String(content));
    update_sqlite_message(&conn, &message)?;
    Ok(message)
}

#[tauri::command]
pub(crate) fn sqlite_patch_message(
    app: tauri::AppHandle,
    id: String,
    patch: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
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
pub(crate) fn sqlite_delete_messages_by_chat_id(
    app: tauri::AppHandle,
    chat_id: String,
) -> Result<(), String> {
    let conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
    conn.execute("DELETE FROM messages WHERE chat_id = ?1", params![chat_id])
        .map_err(|err| format!("Failed to delete SQLite messages by chat: {err}"))?;
    Ok(())
}

#[tauri::command]
pub(crate) fn sqlite_replace_messages_by_chat_id(
    app: tauri::AppHandle,
    chat_id: String,
    messages: Vec<serde_json::Value>,
) -> Result<Vec<serde_json::Value>, String> {
    let mut conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
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
pub(crate) fn sqlite_delete_message(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
    conn.execute("DELETE FROM messages WHERE id = ?1", params![id])
        .map_err(|err| format!("Failed to delete SQLite message: {err}"))?;
    Ok(())
}

#[tauri::command]
pub(crate) fn sqlite_delete_messages(
    app: tauri::AppHandle,
    ids: Vec<String>,
) -> Result<(), String> {
    let mut conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
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
pub(crate) fn sqlite_init_agentic_play_states(
    app: tauri::AppHandle,
    legacy_states_json: Option<String>,
) -> Result<(), String> {
    let mut conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
    let count = conn
        .query_row("SELECT COUNT(*) FROM agentic_play_states", [], |row| {
            row.get::<_, i64>(0)
        })
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
        let (chat_id, character_id, enabled, created_at, updated_at, record_raw) =
            serialize_agentic_play_state(record)?;
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
pub(crate) fn sqlite_get_agentic_play_state(
    app: tauri::AppHandle,
    chat_id: String,
) -> Result<Option<serde_json::Value>, String> {
    let conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
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
pub(crate) fn sqlite_upsert_agentic_play_state(
    app: tauri::AppHandle,
    record: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
    let (chat_id, character_id, enabled, created_at, updated_at, raw) =
        serialize_agentic_play_state(&record)?;
    conn.execute(
        "INSERT OR REPLACE INTO agentic_play_states (chat_id, character_id, enabled, created_at, updated_at, record_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![chat_id, character_id, if enabled { 1 } else { 0 }, created_at, updated_at, raw],
    )
    .map_err(|err| format!("Failed to upsert SQLite Agentic Play state: {err}"))?;
    Ok(record)
}

#[tauri::command]
pub(crate) fn sqlite_delete_agentic_play_state(
    app: tauri::AppHandle,
    chat_id: String,
) -> Result<(), String> {
    let conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
    conn.execute(
        "DELETE FROM agentic_play_states WHERE chat_id = ?1",
        params![chat_id],
    )
    .map_err(|err| format!("Failed to delete SQLite Agentic Play state: {err}"))?;
    Ok(())
}

#[tauri::command]
pub(crate) fn sqlite_clear_agentic_play_states(app: tauri::AppHandle) -> Result<(), String> {
    let conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
    conn.execute("DELETE FROM agentic_play_states", [])
        .map_err(|err| format!("Failed to clear SQLite Agentic Play states: {err}"))?;
    Ok(())
}

#[tauri::command]
pub(crate) fn sqlite_get_version(app: tauri::AppHandle) -> Result<i64, String> {
    let conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
    let version: i64 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|err| format!("Failed to read SQLite user_version: {err}"))?;
    Ok(version)
}

#[tauri::command]
pub(crate) fn sqlite_set_version(app: tauri::AppHandle, version: i64) -> Result<(), String> {
    let conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
    conn.pragma_update(None, "user_version", version)
        .map_err(|err| format!("Failed to set SQLite user_version: {err}"))
}
