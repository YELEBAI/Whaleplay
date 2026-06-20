use rusqlite::{params, OptionalExtension};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::Manager;

static DB: OnceLock<Result<Mutex<rusqlite::Connection>, String>> = OnceLock::new();
const LEGACY_MESSAGES_KEY: &str = "neotavern_messages";

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
            round_index INTEGER,
            created_at TEXT NOT NULL,
            message_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_messages_chat_created
            ON messages(chat_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_messages_parent_id
            ON messages(parent_id);
        CREATE INDEX IF NOT EXISTS idx_messages_chat_round
            ON messages(chat_id, round_index);
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
        CREATE TABLE IF NOT EXISTS rag_chunks (
            id TEXT PRIMARY KEY NOT NULL,
            scope TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            source_id TEXT NOT NULL,
            source_hash TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            embedding_model TEXT NOT NULL,
            embedding_json TEXT NOT NULL,
            status TEXT NOT NULL,
            metadata_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            chunk_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_rag_chunks_owner
            ON rag_chunks(scope, owner_id);
        CREATE INDEX IF NOT EXISTS idx_rag_chunks_source
            ON rag_chunks(source_id);
        CREATE INDEX IF NOT EXISTS idx_rag_chunks_model_status
            ON rag_chunks(embedding_model, status);
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

    let has_round_index: bool = conn
        .prepare("SELECT round_index FROM messages LIMIT 0")
        .is_ok();
    if !has_round_index {
        conn.execute_batch(
            "ALTER TABLE messages ADD COLUMN round_index INTEGER;
             CREATE INDEX IF NOT EXISTS idx_messages_chat_round ON messages(chat_id, round_index);",
        )
        .map_err(|err| format!("Failed to migrate SQLite schema for round_index: {err}"))?;
    }

    Ok(conn)
}

fn get_db(app: &tauri::AppHandle) -> Result<&Mutex<rusqlite::Connection>, String> {
    match DB.get_or_init(|| open_sqlite(app).map(Mutex::new)) {
        Ok(mutex_conn) => Ok(mutex_conn),
        Err(e) => Err(e.clone()),
    }
}

fn read_legacy_messages_from_app_store(app: &tauri::AppHandle) -> Option<String> {
    crate::read_app_store(app)
        .ok()
        .and_then(|store| store.get(LEGACY_MESSAGES_KEY).cloned())
        .filter(|raw| !raw.trim().is_empty())
}

fn remove_legacy_messages_from_app_store(app: &tauri::AppHandle) -> Result<(), String> {
    let mut store = crate::read_app_store(app)?;
    if store.remove(LEGACY_MESSAGES_KEY).is_none() {
        return Ok(());
    }
    let path = crate::app_store_path(app)?;
    crate::write_store_to_path(&store, &path)
}

fn cleanup_legacy_messages_from_app_store(app: &tauri::AppHandle) {
    if let Err(err) = remove_legacy_messages_from_app_store(app) {
        eprintln!("Failed to clean legacy messages from app store: {err}");
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
) -> Result<(String, String, Option<String>, Option<i64>, String, String), String> {
    let id = json_string_field(message, "id")?.to_string();
    let chat_id = json_string_field(message, "chatId")?.to_string();
    let parent_id = message
        .get("parentId")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let round_index = message
        .get("roundIndex")
        .and_then(|v| v.as_i64())
        .filter(|v| *v > 0);
    let created_at = json_string_field(message, "createdAt")?.to_string();
    let raw = serde_json::to_string(message)
        .map_err(|err| format!("Failed to serialize message: {err}"))?;
    Ok((id, chat_id, parent_id, round_index, created_at, raw))
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
    let (id, chat_id, parent_id, round_index, created_at, raw) = serialize_message(message)?;
    conn.execute(
        "UPDATE messages SET chat_id = ?1, parent_id = ?2, round_index = ?3, created_at = ?4, message_json = ?5 WHERE id = ?6",
        params![chat_id, parent_id, round_index, created_at, raw, id],
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
        cleanup_legacy_messages_from_app_store(&app);
        return Ok(());
    }

    let raw = read_legacy_messages_from_app_store(&app)
        .or_else(|| legacy_messages_json.filter(|raw| !raw.trim().is_empty()));
    let Some(raw) = raw else {
        return Ok(());
    };

    let parsed = serde_json::from_str::<serde_json::Value>(&raw)
        .map_err(|err| format!("Failed to parse legacy messages: {err}"))?;
    let Some(messages) = parsed.as_array() else {
        return Ok(());
    };

    let tx = conn
        .transaction()
        .map_err(|err| format!("Failed to start SQLite migration: {err}"))?;
    for message in messages {
        let (id, chat_id, parent_id, round_index, created_at, message_raw) =
            serialize_message(message)?;
        tx.execute(
            "INSERT OR IGNORE INTO messages (id, chat_id, parent_id, round_index, created_at, message_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, chat_id, parent_id, round_index, created_at, message_raw],
        )
        .map_err(|err| format!("Failed to migrate SQLite message: {err}"))?;
    }
    tx.commit()
        .map_err(|err| format!("Failed to finish SQLite migration: {err}"))?;
    cleanup_legacy_messages_from_app_store(&app);
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
pub(crate) fn sqlite_list_recent_turn_messages_by_chat_id(
    app: tauri::AppHandle,
    chat_id: String,
    turn_limit: i64,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
    let capped_turn_limit = turn_limit.clamp(1, 100);
    let latest_round: Option<i64> = conn
        .query_row(
            "SELECT MAX(round_index) FROM messages WHERE chat_id = ?1 AND round_index IS NOT NULL",
            params![&chat_id],
            |row| row.get(0),
        )
        .map_err(|err| format!("Failed to query latest SQLite message round: {err}"))?;

    let Some(latest_round) = latest_round else {
        drop(conn);
        return sqlite_list_recent_messages_by_chat_id(app, chat_id, capped_turn_limit * 4);
    };

    if latest_round <= capped_turn_limit {
        let mut stmt = conn
            .prepare(
                "SELECT message_json FROM messages
                 WHERE chat_id = ?1
                 ORDER BY created_at ASC, id ASC",
            )
            .map_err(|err| format!("Failed to prepare recent-turn SQLite message query: {err}"))?;
        let rows = stmt
            .query_map(params![&chat_id], |row| row.get::<_, String>(0))
            .map_err(|err| format!("Failed to query recent-turn SQLite messages: {err}"))?;

        let mut messages = Vec::new();
        for row in rows {
            messages.push(parse_message_json(row.map_err(|err| {
                format!("Failed to read recent-turn SQLite message row: {err}")
            })?)?);
        }
        return Ok(messages);
    }

    let preserve_from_round = latest_round - capped_turn_limit + 1;
    let boundary: Option<(String, String)> = conn
        .query_row(
            "SELECT created_at, id FROM messages
             WHERE chat_id = ?1 AND round_index IS NOT NULL AND round_index < ?2
             ORDER BY round_index DESC, created_at DESC, id DESC
             LIMIT 1",
            params![&chat_id, preserve_from_round],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|err| format!("Failed to query recent-turn SQLite boundary: {err}"))?;

    let mut messages = Vec::new();
    match boundary {
        Some((created_at, id)) => {
            let mut stmt = conn
                .prepare(
                    "SELECT message_json FROM messages
                     WHERE chat_id = ?1
                       AND (created_at > ?2 OR (created_at = ?2 AND id > ?3))
                     ORDER BY created_at ASC, id ASC
                     LIMIT 500",
                )
                .map_err(|err| {
                    format!("Failed to prepare bounded recent-turn SQLite query: {err}")
                })?;
            let rows = stmt
                .query_map(params![&chat_id, created_at, id], |row| {
                    row.get::<_, String>(0)
                })
                .map_err(|err| {
                    format!("Failed to query bounded recent-turn SQLite messages: {err}")
                })?;
            for row in rows {
                messages.push(parse_message_json(row.map_err(|err| {
                    format!("Failed to read bounded recent-turn SQLite row: {err}")
                })?)?);
            }
        }
        None => {
            let mut stmt = conn
                .prepare(
                    "SELECT message_json FROM messages
                     WHERE chat_id = ?1
                     ORDER BY created_at ASC, id ASC
                     LIMIT 500",
                )
                .map_err(|err| {
                    format!("Failed to prepare unbounded recent-turn SQLite query: {err}")
                })?;
            let rows = stmt
                .query_map(params![&chat_id], |row| row.get::<_, String>(0))
                .map_err(|err| {
                    format!("Failed to query unbounded recent-turn SQLite messages: {err}")
                })?;
            for row in rows {
                messages.push(parse_message_json(row.map_err(|err| {
                    format!("Failed to read unbounded recent-turn SQLite row: {err}")
                })?)?);
            }
        }
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
pub(crate) fn sqlite_migrate_round_indexes(app: tauri::AppHandle) -> Result<usize, String> {
    let conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, chat_id, round_index, message_json FROM messages
             ORDER BY chat_id, created_at ASC, id ASC",
        )
        .map_err(|err| format!("Failed to prepare round_index migration query: {err}"))?;
    let mut next_by_chat: std::collections::HashMap<String, i64> = std::collections::HashMap::new();

    let pending: Vec<(String, i64, String)> = {
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<i64>>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .map_err(|err| format!("Failed to read messages for round_index migration: {err}"))?;
        let mut pending = Vec::new();
        for row in rows {
            let (id, chat_id, db_round_index, raw) =
                row.map_err(|err| format!("Failed to read round_index migration row: {err}"))?;
            let mut message = parse_message_json(raw)?;
            if message.get("role").and_then(|value| value.as_str()) != Some("assistant") {
                continue;
            }

            let current_max = next_by_chat.get(&chat_id).copied().unwrap_or(0);
            let json_round_index = message
                .get("roundIndex")
                .and_then(|value| value.as_i64())
                .filter(|value| *value > 0);
            let round_index = match json_round_index {
                Some(value) => {
                    next_by_chat.insert(chat_id, current_max.max(value));
                    value
                }
                None => {
                    let next = current_max + 1;
                    next_by_chat.insert(chat_id, next);
                    let Some(object) = message.as_object_mut() else {
                        return Err("Stored message is not a JSON object.".to_string());
                    };
                    object.insert(
                        "roundIndex".to_string(),
                        serde_json::Value::Number(serde_json::Number::from(next)),
                    );
                    next
                }
            };

            if db_round_index != Some(round_index) || json_round_index != Some(round_index) {
                let message_raw = serde_json::to_string(&message)
                    .map_err(|err| format!("Failed to serialize migrated message: {err}"))?;
                pending.push((id, round_index, message_raw));
            }
        }
        pending
    };

    for (id, round_index, raw) in &pending {
        conn.execute(
            "UPDATE messages SET round_index = ?1, message_json = ?2 WHERE id = ?3",
            params![round_index, raw, id],
        )
        .map_err(|err| format!("Failed to set round_index: {err}"))?;
    }

    Ok(pending.len())
}

#[tauri::command]
pub(crate) fn sqlite_create_message(
    app: tauri::AppHandle,
    message: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
    let (id, chat_id, parent_id, round_index, created_at, raw) = serialize_message(&message)?;
    conn.execute(
        "INSERT OR REPLACE INTO messages (id, chat_id, parent_id, round_index, created_at, message_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, chat_id, parent_id, round_index, created_at, raw],
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
        let (id, message_chat_id, parent_id, round_index, created_at, raw) =
            serialize_message(message)?;
        if message_chat_id != chat_id {
            return Err("Replacement message chatId does not match target chat.".to_string());
        }
        tx.execute(
            "INSERT OR REPLACE INTO messages (id, chat_id, parent_id, round_index, created_at, message_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, message_chat_id, parent_id, round_index, created_at, raw],
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

fn json_i64_field(value: &serde_json::Value, field: &str) -> Result<i64, String> {
    value
        .get(field)
        .and_then(|inner| inner.as_i64())
        .ok_or_else(|| format!("RAG chunk is missing required integer field: {field}"))
}

fn serialize_rag_chunk(
    chunk: &serde_json::Value,
) -> Result<(String, String, String, String, String, i64, String, String, String, String, String, String, String, String), String>
{
    let id = json_string_field(chunk, "id")?.to_string();
    let scope = json_string_field(chunk, "scope")?.to_string();
    let owner_id = json_string_field(chunk, "ownerId")?.to_string();
    let source_id = json_string_field(chunk, "sourceId")?.to_string();
    let source_hash = json_string_field(chunk, "sourceHash")?.to_string();
    let chunk_index = json_i64_field(chunk, "chunkIndex")?;
    let title = json_string_field(chunk, "title")?.to_string();
    let content = chunk
        .get("content")
        .and_then(|inner| inner.as_str())
        .unwrap_or("")
        .to_string();
    let embedding_model = json_string_field(chunk, "embeddingModel")?.to_string();
    let embedding_json = serde_json::to_string(chunk.get("embedding").unwrap_or(&serde_json::Value::Array(vec![])))
        .map_err(|err| format!("Failed to serialize RAG embedding: {err}"))?;
    let status = json_string_field(chunk, "status")?.to_string();
    let metadata_json = serde_json::to_string(chunk.get("metadata").unwrap_or(&serde_json::Value::Object(Default::default())))
        .map_err(|err| format!("Failed to serialize RAG metadata: {err}"))?;
    let created_at = json_string_field(chunk, "createdAt")?.to_string();
    let updated_at = json_string_field(chunk, "updatedAt")?.to_string();
    Ok((
        id,
        scope,
        owner_id,
        source_id,
        source_hash,
        chunk_index,
        title,
        content,
        embedding_model,
        embedding_json,
        status,
        metadata_json,
        created_at,
        updated_at,
    ))
}

#[tauri::command]
pub(crate) fn sqlite_upsert_rag_chunks(
    app: tauri::AppHandle,
    chunks: Vec<serde_json::Value>,
) -> Result<usize, String> {
    if chunks.is_empty() {
        return Ok(0);
    }

    let mut conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
    let tx = conn
        .transaction()
        .map_err(|err| format!("Failed to start RAG upsert transaction: {err}"))?;

    let mut count = 0usize;
    for chunk in chunks {
        let (
            id,
            scope,
            owner_id,
            source_id,
            source_hash,
            chunk_index,
            title,
            content,
            embedding_model,
            embedding_json,
            status,
            metadata_json,
            created_at,
            updated_at,
        ) = serialize_rag_chunk(&chunk)?;
        let chunk_json = serde_json::to_string(&chunk)
            .map_err(|err| format!("Failed to serialize RAG chunk: {err}"))?;

        tx.execute(
            "INSERT OR REPLACE INTO rag_chunks
             (id, scope, owner_id, source_id, source_hash, chunk_index, title, content, embedding_model, embedding_json, status, metadata_json, created_at, updated_at, chunk_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                id,
                scope,
                owner_id,
                source_id,
                source_hash,
                chunk_index,
                title,
                content,
                embedding_model,
                embedding_json,
                status,
                metadata_json,
                created_at,
                updated_at,
                chunk_json
            ],
        )
        .map_err(|err| format!("Failed to upsert RAG chunk: {err}"))?;
        count += 1;
    }

    tx.commit()
        .map_err(|err| format!("Failed to finish RAG upsert transaction: {err}"))?;
    Ok(count)
}

#[tauri::command]
pub(crate) fn sqlite_list_rag_chunks_by_owners(
    app: tauri::AppHandle,
    owner_ids: Vec<String>,
    embedding_model: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    if owner_ids.is_empty() {
        return Ok(Vec::new());
    }

    let owner_set: std::collections::HashSet<String> = owner_ids.into_iter().collect();
    let conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
    let mut stmt = conn
        .prepare(
            "SELECT owner_id, embedding_model, chunk_json FROM rag_chunks
             WHERE status = 'indexed'
             ORDER BY updated_at DESC",
        )
        .map_err(|err| format!("Failed to prepare RAG chunk query: {err}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|err| format!("Failed to query RAG chunks: {err}"))?;

    let mut chunks = Vec::new();
    for row in rows {
        let (owner_id, model, raw) = row.map_err(|err| format!("Failed to read RAG row: {err}"))?;
        if !owner_set.contains(&owner_id) {
            continue;
        }
        if embedding_model.as_ref().is_some_and(|expected| expected != &model) {
            continue;
        }
        chunks.push(
            serde_json::from_str::<serde_json::Value>(&raw)
                .map_err(|err| format!("Failed to parse RAG chunk JSON: {err}"))?,
        );
    }
    Ok(chunks)
}

#[tauri::command]
pub(crate) fn sqlite_delete_rag_chunks_by_source_ids(
    app: tauri::AppHandle,
    source_ids: Vec<String>,
) -> Result<usize, String> {
    if source_ids.is_empty() {
        return Ok(0);
    }

    let mut conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
    let tx = conn
        .transaction()
        .map_err(|err| format!("Failed to start RAG delete transaction: {err}"))?;
    let mut count = 0usize;
    for source_id in source_ids {
        count += tx
            .execute("DELETE FROM rag_chunks WHERE source_id = ?1", params![source_id])
            .map_err(|err| format!("Failed to delete RAG chunks by source: {err}"))?;
    }
    tx.commit()
        .map_err(|err| format!("Failed to finish RAG delete transaction: {err}"))?;
    Ok(count)
}

#[tauri::command]
pub(crate) fn sqlite_delete_rag_chunks_by_owner(
    app: tauri::AppHandle,
    scope: String,
    owner_id: String,
) -> Result<usize, String> {
    let conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
    conn.execute(
        "DELETE FROM rag_chunks WHERE scope = ?1 AND owner_id = ?2",
        params![scope, owner_id],
    )
    .map_err(|err| format!("Failed to delete RAG chunks by owner: {err}"))
}

#[tauri::command]
pub(crate) fn sqlite_count_rag_chunks_by_owner(
    app: tauri::AppHandle,
    scope: String,
    owner_id: String,
) -> Result<usize, String> {
    let conn = get_db(&app)?
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
    let count = conn
        .query_row(
            "SELECT COUNT(*) FROM rag_chunks WHERE scope = ?1 AND owner_id = ?2",
            params![scope, owner_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|err| format!("Failed to count RAG chunks: {err}"))?;
    Ok(count.max(0) as usize)
}
