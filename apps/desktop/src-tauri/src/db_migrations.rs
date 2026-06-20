use rusqlite::{Connection, Transaction};

pub(crate) const CURRENT_SCHEMA_VERSION: i64 = 2;

pub(crate) fn run(conn: &mut Connection) -> Result<(), String> {
    let version = schema_version(conn)?;
    if version > CURRENT_SCHEMA_VERSION {
        return Err(format!(
            "SQLite schema version {version} is newer than supported version {CURRENT_SCHEMA_VERSION}"
        ));
    }

    if version < 1 {
        migrate_to_v1(conn)?;
    }
    if schema_version(conn)? < 2 {
        migrate_to_v2(conn)?;
    }
    Ok(())
}

fn schema_version(conn: &Connection) -> Result<i64, String> {
    conn.pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|err| format!("Failed to read SQLite user_version: {err}"))
}

fn column_exists(tx: &Transaction<'_>, table: &str, column: &str) -> Result<bool, String> {
    let sql = format!("PRAGMA table_info({table})");
    let mut stmt = tx
        .prepare(&sql)
        .map_err(|err| format!("Failed to inspect SQLite table {table}: {err}"))?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|err| format!("Failed to inspect SQLite columns for {table}: {err}"))?;
    for result in columns {
        if result.map_err(|err| format!("Failed to read SQLite column for {table}: {err}"))?
            == column
        {
            return Ok(true);
        }
    }
    Ok(false)
}

fn set_schema_version(tx: &Transaction<'_>, version: i64) -> Result<(), String> {
    tx.pragma_update(None, "user_version", version)
        .map_err(|err| format!("Failed to set SQLite user_version to {version}: {err}"))
}

fn migrate_to_v1(conn: &mut Connection) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|err| format!("Failed to start SQLite v1 migration: {err}"))?;
    tx.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY NOT NULL,
            chat_id TEXT NOT NULL,
            parent_id TEXT,
            created_at TEXT NOT NULL,
            message_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_messages_chat_created
            ON messages(chat_id, created_at);
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
    .map_err(|err| format!("Failed to apply SQLite v1 schema: {err}"))?;

    if !column_exists(&tx, "messages", "parent_id")? {
        tx.execute("ALTER TABLE messages ADD COLUMN parent_id TEXT", [])
            .map_err(|err| format!("Failed to add messages.parent_id: {err}"))?;
    }
    tx.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_parent_id ON messages(parent_id)",
        [],
    )
    .map_err(|err| format!("Failed to create messages parent index: {err}"))?;

    set_schema_version(&tx, 1)?;
    tx.commit()
        .map_err(|err| format!("Failed to commit SQLite v1 migration: {err}"))
}

fn migrate_to_v2(conn: &mut Connection) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|err| format!("Failed to start SQLite v2 migration: {err}"))?;

    if !column_exists(&tx, "messages", "round_index")? {
        tx.execute("ALTER TABLE messages ADD COLUMN round_index INTEGER", [])
            .map_err(|err| format!("Failed to add messages.round_index: {err}"))?;
    }
    tx.execute_batch(
        r#"
        CREATE INDEX IF NOT EXISTS idx_messages_chat_round
            ON messages(chat_id, round_index);
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
    .map_err(|err| format!("Failed to apply SQLite v2 schema: {err}"))?;

    set_schema_version(&tx, 2)?;
    tx.commit()
        .map_err(|err| format!("Failed to commit SQLite v2 migration: {err}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn has_column(conn: &Connection, table: &str, column: &str) -> bool {
        let mut stmt = conn
            .prepare(&format!("PRAGMA table_info({table})"))
            .unwrap();
        let found = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .any(|value| value.unwrap() == column);
        found
    }

    #[test]
    fn fresh_database_reaches_current_schema() {
        let mut conn = Connection::open_in_memory().unwrap();
        run(&mut conn).unwrap();

        assert_eq!(schema_version(&conn).unwrap(), CURRENT_SCHEMA_VERSION);
        assert!(has_column(&conn, "messages", "parent_id"));
        assert!(has_column(&conn, "messages", "round_index"));
        let rag_table: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'rag_chunks'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(rag_table, 1);
    }

    #[test]
    fn legacy_database_is_upgraded_without_losing_messages() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE messages (
                id TEXT PRIMARY KEY NOT NULL,
                chat_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                message_json TEXT NOT NULL
             );
             INSERT INTO messages VALUES ('m1', 'c1', '2026-01-01', '{}');",
        )
        .unwrap();

        run(&mut conn).unwrap();

        assert!(has_column(&conn, "messages", "parent_id"));
        assert!(has_column(&conn, "messages", "round_index"));
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM messages WHERE id = 'm1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn migrations_are_idempotent_and_reject_future_schema() {
        let mut conn = Connection::open_in_memory().unwrap();
        run(&mut conn).unwrap();
        run(&mut conn).unwrap();
        assert_eq!(schema_version(&conn).unwrap(), CURRENT_SCHEMA_VERSION);

        conn.pragma_update(None, "user_version", CURRENT_SCHEMA_VERSION + 1)
            .unwrap();
        assert!(run(&mut conn).unwrap_err().contains("newer than supported"));
    }
}
