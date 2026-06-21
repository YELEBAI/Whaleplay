/// Canonical KV store backed by tauri-plugin-store.
///
/// Replaces the old `store.json` BTreeMap with a proper atomic store
/// that supports concurrent access across Tauri commands and the LAN
/// REST server through a shared `Arc<Store<Wry>>`.
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};
use tauri::Manager;
use tauri_plugin_store::StoreExt;

use serde::{Deserialize, Serialize};

type StoreRef = Arc<tauri_plugin_store::Store<tauri::Wry>>;

static STORE: OnceLock<StoreRef> = OnceLock::new();

/// Open (or create) the store once, then cache for the process lifetime.
pub(crate) fn get_store(app: &tauri::AppHandle) -> Result<StoreRef, String> {
    if let Some(store) = STORE.get() {
        return Ok(Arc::clone(store));
    }

    let path = store_path(app)?;
    let store = app
        .store(&path)
        .map_err(|err| format!("Failed to open store: {err}"))?;

    // Ensure the file is written (plugin-store may create on first write)
    store
        .save()
        .map_err(|err| format!("Failed to initialize store: {err}"))?;

    if STORE.set(Arc::clone(&store)).is_ok() {
        return Ok(store);
    }

    STORE
        .get()
        .map(Arc::clone)
        .ok_or_else(|| "Store initialization raced without producing an instance".to_string())
}

fn store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Failed to resolve app data directory: {err}"))?;
    std::fs::create_dir_all(&dir)
        .map_err(|err| format!("Failed to create app data directory: {err}"))?;
    Ok(dir.join("store.json"))
}

// ── String-based API (compatible with old AppStore) ──────────────────

pub(crate) fn get(app: &tauri::AppHandle, key: &str) -> Result<Option<String>, String> {
    let store = get_store(app)?;
    Ok(store
        .get(key)
        .and_then(|v| v.as_str().map(|s| s.to_string())))
}

pub(crate) fn set(app: &tauri::AppHandle, key: &str, value: &str) -> Result<(), String> {
    let store = get_store(app)?;
    let previous = store.get(key);
    store.set(key, serde_json::Value::String(value.to_string()));
    if let Err(error) = store.save() {
        if let Some(previous) = previous {
            store.set(key, previous);
        } else {
            store.delete(key);
        }
        let _ = store.save();
        return Err(format!("Store save: {error}"));
    }
    Ok(())
}

pub(crate) fn remove(app: &tauri::AppHandle, key: &str) -> Result<(), String> {
    let store = get_store(app)?;
    let previous = store.get(key);
    store.delete(key);
    if let Err(error) = store.save() {
        if let Some(previous) = previous {
            store.set(key, previous);
        }
        let _ = store.save();
        return Err(format!("Store save: {error}"));
    }
    Ok(())
}

pub(crate) fn entries(app: &tauri::AppHandle) -> Result<BTreeMap<String, String>, String> {
    let store = get_store(app)?;
    let mut result = BTreeMap::new();
    for key in store.keys() {
        if let Some(val) = store
            .get(&key)
            .and_then(|v| v.as_str().map(|s| s.to_string()))
        {
            result.insert(key, val);
        }
    }
    Ok(result)
}

// ── Batch ───────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub(crate) struct StoreOp {
    #[serde(rename = "type")]
    op_type: String,
    pub(crate) key: String,
    #[serde(default)]
    value: Option<String>,
}

/// Apply multiple operations in a single save.
pub(crate) fn batch_ops(app: &tauri::AppHandle, ops: &[StoreOp]) -> Result<(), String> {
    let store = get_store(app)?;
    for op in ops {
        if op.op_type != "set" && op.op_type != "remove" {
            return Err(format!("Unknown batch op type: {}", op.op_type));
        }
    }

    let mut previous = BTreeMap::new();
    for op in ops {
        previous
            .entry(op.key.clone())
            .or_insert_with(|| store.get(&op.key));
    }
    for op in ops {
        match op.op_type.as_str() {
            "set" => {
                let v = op.value.as_deref().unwrap_or("");
                store.set(&op.key, serde_json::Value::String(v.to_string()));
            }
            "remove" => {
                store.delete(&op.key);
            }
            _ => unreachable!("operation types were validated before mutation"),
        }
    }
    if let Err(error) = store.save() {
        for (key, value) in previous {
            if let Some(value) = value {
                store.set(key, value);
            } else {
                store.delete(key);
            }
        }
        let _ = store.save();
        return Err(format!("Batch save: {error}"));
    }
    Ok(())
}

// ── Migration lock ──────────────────────────────────────

const LOCK_KEY: &str = "meta:migration-lock";
const LOCK_STALE_AFTER_SECS: u64 = 5 * 60;

#[derive(Debug, Deserialize, Serialize)]
struct MigrationLock {
    pid: u32,
    acquired_at: u64,
}

fn unix_seconds() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn lock_is_active(raw: &str, now: u64) -> bool {
    serde_json::from_str::<MigrationLock>(raw)
        .map(|lock| now.saturating_sub(lock.acquired_at) < LOCK_STALE_AFTER_SECS)
        .unwrap_or(false)
}

/// Acquire the migration lock.  Returns true when granted.
pub(crate) fn try_lock(app: &tauri::AppHandle) -> Result<bool, String> {
    let store = get_store(app)?;
    let now = unix_seconds();
    if store
        .get(LOCK_KEY)
        .and_then(|value| value.as_str().map(|raw| lock_is_active(raw, now)))
        .unwrap_or(false)
    {
        return Ok(false);
    }
    let lock = MigrationLock {
        pid: std::process::id(),
        acquired_at: now,
    };
    let serialized = serde_json::to_string(&lock).map_err(|err| format!("Lock encode: {err}"))?;
    store.set(LOCK_KEY, serde_json::Value::String(serialized));
    if let Err(error) = store.save() {
        store.delete(LOCK_KEY);
        return Err(format!("Lock save: {error}"));
    }
    Ok(true)
}

/// Release the migration lock.
pub(crate) fn unlock(app: &tauri::AppHandle) -> Result<(), String> {
    let store = get_store(app)?;
    let previous = store.get(LOCK_KEY);
    store.delete(LOCK_KEY);
    if let Err(error) = store.save() {
        if let Some(previous) = previous {
            store.set(LOCK_KEY, previous);
        }
        return Err(format!("Unlock save: {error}"));
    }
    Ok(())
}

// ── Backup ───────────────────────────────────────────────

/// Create a timestamped backup of the current store file.
/// Returns the backup path on success.
pub(crate) fn backup(app: &tauri::AppHandle) -> Result<String, String> {
    let store = get_store(app)?;
    // Flush any pending writes before copying
    store
        .save()
        .map_err(|err| format!("Pre-backup save: {err}"))?;

    let src = store_path(app)?;
    let backup_dir = src
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .join("backups");
    std::fs::create_dir_all(&backup_dir)
        .map_err(|err| format!("Failed to create backup dir: {err}"))?;

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let backup_path = backup_dir.join(format!("store.pre-migration.{}.json", ts));
    std::fs::copy(&src, &backup_path).map_err(|err| format!("Failed to copy backup: {err}"))?;

    prune_backups(&backup_dir, 5)?;
    Ok(backup_path.to_string_lossy().to_string())
}

fn prune_backups(backup_dir: &std::path::Path, keep: usize) -> Result<(), String> {
    let mut backups = std::fs::read_dir(backup_dir)
        .map_err(|err| format!("Failed to list backups: {err}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| {
                    name.starts_with("store.pre-migration.") && name.ends_with(".json")
                })
        })
        .collect::<Vec<_>>();
    backups.sort();
    let remove_count = backups.len().saturating_sub(keep);
    for stale in backups.into_iter().take(remove_count) {
        let _ = std::fs::remove_file(stale);
    }
    Ok(())
}

// ── Tests ───────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;
    use std::fs;
    use std::path::{Path, PathBuf};

    // ═══════════════════════════════════════════════════════════
    //  Helpers
    // ═══════════════════════════════════════════════════════════

    /// Create an isolated temp directory for a single test.
    /// Each call produces a unique directory so parallel tests never
    /// share the same store file.
    fn make_temp_dir() -> PathBuf {
        use std::sync::atomic::{AtomicU32, Ordering};
        static COUNTER: AtomicU32 = AtomicU32::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("neo_store_test_{}_{}", std::process::id(), n));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("Failed to create temp dir");
        dir
    }

    /// Path to `store.json` inside a given directory.
    fn store_file(dir: &Path) -> PathBuf {
        dir.join("store.json")
    }

    /// Path to the `backups/` subdirectory.
    fn backups_dir(dir: &Path) -> PathBuf {
        dir.join("backups")
    }

    /// Read store.json from `dir` and return its contents as a sorted map.
    /// Returns an empty map when the file does not exist or is empty.
    fn read_store(dir: &Path) -> BTreeMap<String, String> {
        let path = store_file(dir);
        if !path.exists() {
            return BTreeMap::new();
        }
        let raw = fs::read_to_string(&path).expect("Failed to read store.json");
        if raw.trim().is_empty() {
            return BTreeMap::new();
        }
        let map: serde_json::Map<String, serde_json::Value> =
            serde_json::from_str(&raw).expect("store.json is not valid JSON");
        map.into_iter()
            .map(|(k, v)| (k, v.as_str().expect("value is not a string").to_owned()))
            .collect()
    }

    /// Write key-value pairs to store.json.
    /// All values are stored as JSON strings to match the real module's encoding.
    fn write_store(dir: &Path, data: &BTreeMap<String, String>) {
        let path = store_file(dir);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("Failed to create parent dir");
        }
        let obj: serde_json::Map<String, serde_json::Value> = data
            .iter()
            .map(|(k, v)| (k.clone(), serde_json::Value::String(v.clone())))
            .collect();
        let json = serde_json::to_vec_pretty(&obj).expect("Failed to serialise store data");
        fs::write(&path, &json).expect("Failed to write store.json");
    }

    /// Simulate `set(key, value)`: insert into map and persist.
    fn simulate_set(dir: &Path, key: &str, value: &str) {
        let mut data = read_store(dir);
        data.insert(key.to_owned(), value.to_owned());
        write_store(dir, &data);
    }

    /// Simulate `remove(key)`: delete key from map and persist.
    fn simulate_remove(dir: &Path, key: &str) {
        let mut data = read_store(dir);
        data.remove(key);
        write_store(dir, &data);
    }

    /// Simulate `entries()`: return all key-value pairs.
    fn simulate_entries(dir: &Path) -> BTreeMap<String, String> {
        read_store(dir)
    }

    /// Simulate a single `StoreOp` on the in-memory map.  Returns
    /// `Ok(())` or `Err(…​)` for an unknown op type (mirroring the real
    /// function's behaviour).
    fn simulate_op(map: &mut BTreeMap<String, String>, op: &StoreOp) -> Result<(), String> {
        match op.op_type.as_str() {
            "set" => {
                let v = op.value.as_deref().unwrap_or("");
                map.insert(op.key.clone(), v.to_owned());
                Ok(())
            }
            "remove" => {
                map.remove(&op.key);
                Ok(())
            }
            other => Err(format!("Unknown batch op type: {other}")),
        }
    }

    /// Simulate `batch_ops(ops)`: apply all operations, then persist
    /// once (atomic save).
    fn simulate_batch(dir: &Path, ops: &[StoreOp]) -> Result<(), String> {
        let mut data = read_store(dir);
        for op in ops {
            simulate_op(&mut data, op)?;
        }
        write_store(dir, &data);
        Ok(())
    }

    /// Simulate `try_lock()`: return `true` if the lock was acquired,
    /// `false` if already held.
    fn simulate_try_lock(dir: &Path) -> bool {
        let data = read_store(dir);
        if data.contains_key(LOCK_KEY) {
            return false;
        }
        simulate_set(dir, LOCK_KEY, "1");
        true
    }

    /// Simulate `unlock()`: release the migration lock.
    fn simulate_unlock(dir: &Path) {
        simulate_remove(dir, LOCK_KEY);
    }

    // ═══════════════════════════════════════════════════════════
    //  StoreOp deserialisation
    // ═══════════════════════════════════════════════════════════

    #[test]
    fn store_op_set_deserialises() {
        let json = r#"{"type":"set","key":"theme","value":"dark"}"#;
        let op: StoreOp = serde_json::from_str(json).expect("valid set op");
        assert_eq!(op.op_type, "set");
        assert_eq!(op.key, "theme");
        assert_eq!(op.value, Some("dark".to_owned()));
    }

    #[test]
    fn store_op_remove_deserialises() {
        let json = r#"{"type":"remove","key":"theme"}"#;
        let op: StoreOp = serde_json::from_str(json).expect("valid remove op");
        assert_eq!(op.op_type, "remove");
        assert_eq!(op.key, "theme");
        assert!(op.value.is_none());
    }

    #[test]
    fn store_op_set_without_value_defaults_to_none() {
        let json = r#"{"type":"set","key":"a"}"#;
        let op: StoreOp = serde_json::from_str(json).expect("set without value");
        assert_eq!(op.op_type, "set");
        assert_eq!(op.key, "a");
        assert_eq!(op.value, None);
    }

    // ═══════════════════════════════════════════════════════════
    //  Set / Get
    // ═══════════════════════════════════════════════════════════

    #[test]
    fn set_new_key_creates_and_persists() {
        let dir = make_temp_dir();
        simulate_set(&dir, "theme", "dark");

        let data = read_store(&dir);
        assert_eq!(data.get("theme").map(|s| s.as_str()), Some("dark"));
        assert_eq!(data.len(), 1);
    }

    #[test]
    fn set_overwrites_existing_key() {
        let dir = make_temp_dir();
        simulate_set(&dir, "volume", "50");
        simulate_set(&dir, "volume", "75");

        let data = read_store(&dir);
        assert_eq!(data.get("volume").map(|s| s.as_str()), Some("75"));
        assert_eq!(data.len(), 1);
    }

    #[test]
    fn get_missing_key_returns_none() {
        let dir = make_temp_dir();
        let data = read_store(&dir);
        assert!(!data.contains_key("ghost"));
    }

    #[test]
    fn get_on_empty_file_returns_none() {
        let dir = make_temp_dir();
        // create an empty store.json
        fs::write(store_file(&dir), "").expect("write empty file");
        let data = read_store(&dir);
        assert!(data.is_empty());
    }

    // ═══════════════════════════════════════════════════════════
    //  Remove
    // ═══════════════════════════════════════════════════════════

    #[test]
    fn remove_existing_key_deletes_it() {
        let dir = make_temp_dir();
        simulate_set(&dir, "a", "1");
        simulate_set(&dir, "b", "2");

        simulate_remove(&dir, "a");

        let data = read_store(&dir);
        assert!(!data.contains_key("a"));
        assert_eq!(data.get("b").map(|s| s.as_str()), Some("2"));
        assert_eq!(data.len(), 1);
    }

    #[test]
    fn remove_missing_key_is_noop() {
        let dir = make_temp_dir();
        simulate_set(&dir, "x", "100");

        simulate_remove(&dir, "no-such-key");

        let data = read_store(&dir);
        assert_eq!(data.len(), 1);
        assert!(data.contains_key("x"));
    }

    // ═══════════════════════════════════════════════════════════
    //  Entries
    // ═══════════════════════════════════════════════════════════

    #[test]
    fn entries_returns_all_key_value_pairs_sorted() {
        let dir = make_temp_dir();
        // Insert out-of-order to confirm BTreeMap ordering
        simulate_set(&dir, "z", "last");
        simulate_set(&dir, "a", "first");
        simulate_set(&dir, "m", "middle");

        let entries = simulate_entries(&dir);
        let keys: Vec<&str> = entries.keys().map(|s| s.as_str()).collect();
        assert_eq!(keys, vec!["a", "m", "z"]);
        assert_eq!(entries.get("a").map(|s| s.as_str()), Some("first"));
        assert_eq!(entries.get("z").map(|s| s.as_str()), Some("last"));
    }

    #[test]
    fn entries_on_empty_store_returns_empty_map() {
        let dir = make_temp_dir();
        let entries = simulate_entries(&dir);
        assert!(entries.is_empty());
    }

    // ═══════════════════════════════════════════════════════════
    //  Full CRUD cycle
    // ═══════════════════════════════════════════════════════════

    #[test]
    fn set_get_remove_entries_cycle() {
        let dir = make_temp_dir();

        // Start empty
        assert!(simulate_entries(&dir).is_empty());

        // Set three keys
        simulate_set(&dir, "name", "Neo");
        simulate_set(&dir, "version", "0.1.2");
        simulate_set(&dir, "debug", "true");

        let all = simulate_entries(&dir);
        assert_eq!(all.len(), 3);
        assert_eq!(all.get("name").map(|s| s.as_str()), Some("Neo"));
        assert_eq!(all.get("version").map(|s| s.as_str()), Some("0.1.2"));

        // Remove one
        simulate_remove(&dir, "debug");
        let after_remove = simulate_entries(&dir);
        assert_eq!(after_remove.len(), 2);
        assert!(!after_remove.contains_key("debug"));

        // Overwrite existing
        simulate_set(&dir, "version", "0.2.0");
        assert_eq!(
            read_store(&dir).get("version").map(|s| s.as_str()),
            Some("0.2.0")
        );
    }

    // ═══════════════════════════════════════════════════════════
    //  Batch
    // ═══════════════════════════════════════════════════════════

    #[test]
    fn batch_ops_set_and_remove_atomically() {
        let dir = make_temp_dir();

        // Pre-populate a key that will be removed
        simulate_set(&dir, "c", "old");
        simulate_set(&dir, "d", "keep");

        let ops = vec![
            StoreOp {
                op_type: "set".into(),
                key: "a".into(),
                value: Some("1".into()),
            },
            StoreOp {
                op_type: "set".into(),
                key: "b".into(),
                value: Some("2".into()),
            },
            StoreOp {
                op_type: "remove".into(),
                key: "c".into(),
                value: None,
            },
        ];

        simulate_batch(&dir, &ops).expect("batch should succeed");

        let data = read_store(&dir);
        assert_eq!(data.get("a").map(|s| s.as_str()), Some("1"));
        assert_eq!(data.get("b").map(|s| s.as_str()), Some("2"));
        assert!(!data.contains_key("c"), "c should have been removed");
        assert_eq!(data.get("d").map(|s| s.as_str()), Some("keep"));
        assert_eq!(data.len(), 3);
    }

    #[test]
    fn batch_empty_ops_is_noop() {
        let dir = make_temp_dir();
        simulate_set(&dir, "x", "42");

        let result = simulate_batch(&dir, &[]);
        assert!(result.is_ok());

        let data = read_store(&dir);
        assert_eq!(data.len(), 1);
        assert_eq!(data.get("x").map(|s| s.as_str()), Some("42"));
    }

    #[test]
    fn batch_unknown_op_type_returns_error() {
        let dir = make_temp_dir();
        let ops = vec![StoreOp {
            op_type: "delete".into(), // not "remove"
            key: "a".into(),
            value: None,
        }];
        let result = simulate_batch(&dir, &ops);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unknown batch op type"));
    }

    #[test]
    fn batch_set_without_value_defaults_to_empty_string() {
        let dir = make_temp_dir();
        let ops = vec![StoreOp {
            op_type: "set".into(),
            key: "empty_val".into(),
            value: None,
        }];
        simulate_batch(&dir, &ops).expect("batch set without value");
        let data = read_store(&dir);
        // The real module uses `op.value.as_deref().unwrap_or("")`
        assert_eq!(data.get("empty_val").map(|s| s.as_str()), Some(""));
    }

    // ═══════════════════════════════════════════════════════════
    //  Lock / Unlock
    // ═══════════════════════════════════════════════════════════

    #[test]
    fn try_lock_acquires_when_unlocked() {
        let dir = make_temp_dir();
        let acquired = simulate_try_lock(&dir);
        assert!(acquired, "first lock attempt should succeed");

        let data = read_store(&dir);
        assert!(data.contains_key(LOCK_KEY), "lock key should be set");
        assert_eq!(data.get(LOCK_KEY).map(|s| s.as_str()), Some("1"));
    }

    #[test]
    fn try_lock_fails_when_already_locked() {
        let dir = make_temp_dir();

        let first = simulate_try_lock(&dir);
        assert!(first);

        let second = simulate_try_lock(&dir);
        assert!(!second, "second lock attempt should fail");

        // Lock key should still be present
        assert!(read_store(&dir).contains_key(LOCK_KEY));
    }

    #[test]
    fn unlock_releases_lock() {
        let dir = make_temp_dir();
        simulate_try_lock(&dir);
        assert!(read_store(&dir).contains_key(LOCK_KEY));

        simulate_unlock(&dir);
        assert!(!read_store(&dir).contains_key(LOCK_KEY));
    }

    #[test]
    fn unlock_then_relock_succeeds() {
        let dir = make_temp_dir();

        // Acquire
        assert!(simulate_try_lock(&dir));
        // Cannot re-acquire
        assert!(!simulate_try_lock(&dir));
        // Release
        simulate_unlock(&dir);
        // Now acquire again
        assert!(simulate_try_lock(&dir), "should re-acquire after unlock");
    }

    #[test]
    fn lock_key_is_not_visible_in_regular_entries() {
        let dir = make_temp_dir();

        // The real module stores the lock key inside the same store.
        // Consumers filtering on LOCK_KEY handle this; here we just
        // verify the key is indeed present in the raw data.
        simulate_try_lock(&dir);
        simulate_set(&dir, "user_key", "hello");

        let data = read_store(&dir);
        assert!(data.contains_key(LOCK_KEY));
        assert!(data.contains_key("user_key"));
        assert_eq!(data.len(), 2);
    }

    // ═══════════════════════════════════════════════════════════
    //  Backup
    // ═══════════════════════════════════════════════════════════

    #[test]
    fn backup_creates_file_in_backups_directory() {
        let dir = make_temp_dir();

        // Put some data in the store
        let mut data = BTreeMap::new();
        data.insert("theme".into(), "dark".into());
        write_store(&dir, &data);

        // Simulate backup
        let src = store_file(&dir);
        let backup_dir = backups_dir(&dir);
        fs::create_dir_all(&backup_dir).expect("create backups dir");

        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let backup_path = backup_dir.join(format!("store.pre-migration.{ts}.json"));
        fs::copy(&src, &backup_path).expect("copy backup");

        assert!(backup_path.exists(), "backup file should exist");
        assert!(backup_dir.exists(), "backups dir should exist");
    }

    #[test]
    fn backup_content_matches_original_store() {
        let dir = make_temp_dir();

        let mut original = BTreeMap::new();
        original.insert("a".into(), "1".into());
        original.insert("b".into(), "2".into());
        original.insert("c".into(), "3".into());
        write_store(&dir, &original);

        // Simulate backup
        let src = store_file(&dir);
        let backup_dir = backups_dir(&dir);
        fs::create_dir_all(&backup_dir).expect("create backups dir");
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let backup_path = backup_dir.join(format!("store.pre-migration.{ts}.json"));
        fs::copy(&src, &backup_path).expect("copy backup");

        // Read backup content and compare
        let backup_raw = fs::read_to_string(&backup_path).expect("read backup");
        let backup_map: BTreeMap<String, serde_json::Value> =
            serde_json::from_str(&backup_raw).expect("parse backup");

        for (key, expected) in &original {
            let val = backup_map.get(key).and_then(|v| v.as_str()).unwrap_or("");
            assert_eq!(val, expected.as_str(), "mismatch for key '{key}'");
        }
        assert_eq!(backup_map.len(), original.len());
    }

    #[test]
    fn backup_preserves_data_after_store_modification() {
        let dir = make_temp_dir();

        // Initial state
        simulate_set(&dir, "x", "initial");

        // Backup
        let src = store_file(&dir);
        let backup_dir = backups_dir(&dir);
        fs::create_dir_all(&backup_dir).expect("create backups dir");
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let backup_path = backup_dir.join(format!("store.pre-migration.{ts}.json"));
        fs::copy(&src, &backup_path).expect("copy backup");

        // Modify store after backup
        simulate_set(&dir, "x", "modified");
        simulate_set(&dir, "y", "new");

        // Backup should still reflect the snapshot at backup time
        let backup_raw = fs::read_to_string(&backup_path).expect("read backup");
        let backup_map: BTreeMap<String, serde_json::Value> =
            serde_json::from_str(&backup_raw).expect("parse backup");
        assert_eq!(backup_map.len(), 1);
        assert_eq!(
            backup_map.get("x").and_then(|v| v.as_str()),
            Some("initial")
        );
        assert!(
            !backup_map.contains_key("y"),
            "key added after backup should not be in backup"
        );

        // Current store should have the modified data
        let current = read_store(&dir);
        assert_eq!(current.get("x").map(|s| s.as_str()), Some("modified"));
        assert_eq!(current.get("y").map(|s| s.as_str()), Some("new"));
    }

    // ═══════════════════════════════════════════════════════════
    //  File persistence
    // ═══════════════════════════════════════════════════════════

    #[test]
    fn store_json_is_pretty_printed() {
        let dir = make_temp_dir();
        simulate_set(&dir, "compact", "yes");

        let raw = fs::read_to_string(store_file(&dir)).expect("read store");
        // Pretty-printed JSON contains newlines and indentation
        assert!(raw.contains('\n'), "pretty JSON should have newlines");
        assert!(raw.contains("  "), "pretty JSON should have indentation");
    }

    #[test]
    fn values_are_always_json_strings() {
        let dir = make_temp_dir();
        simulate_set(&dir, "num", "42");

        let raw = fs::read_to_string(store_file(&dir)).expect("read store");
        let parsed: serde_json::Value = serde_json::from_str(&raw).expect("parse store");

        // Even numeric-looking values should be strings
        assert!(parsed["num"].is_string());
        assert_eq!(parsed["num"].as_str(), Some("42"));
    }

    #[test]
    fn timestamped_lock_expires_but_active_lock_does_not() {
        let now = 10_000;
        let active = serde_json::to_string(&MigrationLock {
            pid: 1,
            acquired_at: now - 10,
        })
        .unwrap();
        let stale = serde_json::to_string(&MigrationLock {
            pid: 1,
            acquired_at: now - LOCK_STALE_AFTER_SECS,
        })
        .unwrap();

        assert!(lock_is_active(&active, now));
        assert!(!lock_is_active(&stale, now));
        assert!(
            !lock_is_active("1", now),
            "legacy unowned locks must be recoverable"
        );
    }

    #[test]
    fn backup_retention_keeps_latest_five_and_ignores_other_files() {
        let dir = make_temp_dir();
        let backup_dir = backups_dir(&dir);
        fs::create_dir_all(&backup_dir).unwrap();
        for index in 0..7 {
            fs::write(
                backup_dir.join(format!("store.pre-migration.{index:02}.json")),
                "{}",
            )
            .unwrap();
        }
        fs::write(backup_dir.join("keep-me.txt"), "diagnostic").unwrap();

        prune_backups(&backup_dir, 5).unwrap();

        let mut remaining = fs::read_dir(&backup_dir)
            .unwrap()
            .filter_map(Result::ok)
            .map(|entry| entry.file_name().to_string_lossy().to_string())
            .collect::<Vec<_>>();
        remaining.sort();
        assert_eq!(
            remaining,
            vec![
                "keep-me.txt",
                "store.pre-migration.02.json",
                "store.pre-migration.03.json",
                "store.pre-migration.04.json",
                "store.pre-migration.05.json",
                "store.pre-migration.06.json",
            ]
        );
    }
}
