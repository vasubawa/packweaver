use rusqlite::{Connection, Result};
use std::path::PathBuf;

pub fn get_portable_data_dir() -> PathBuf {
    let mut path = std::env::current_exe().expect("Failed to get current executable path");
    path.pop(); // Remove executable name

    // If on macOS and inside an .app bundle, go up to the directory containing the .app
    if cfg!(target_os = "macos") && path.to_string_lossy().contains(".app/Contents/MacOS") {
        path.pop(); // MacOS
        path.pop(); // Contents
        path.pop(); // .app
    }

    path.join("packweaver-data")
}

pub fn init_db(_app_handle: &tauri::AppHandle) -> Result<Connection> {
    let app_dir = get_portable_data_dir();

    // Ensure the directory exists
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

    let db_path = app_dir.join("packweaver.db");

    let conn = Connection::open(db_path)?;

    // Enable foreign keys
    conn.execute("PRAGMA foreign_keys = ON;", [])?;

    // Create tables robustly (IF NOT EXISTS prevents crashes on re-initialization)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS instances (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            base_pack_id TEXT NOT NULL,
            base_pack_version_id TEXT NOT NULL,
            mc_version TEXT NOT NULL,
            loader TEXT NOT NULL,
            source TEXT NOT NULL,
            status TEXT DEFAULT 'Ready',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Add column if migrating from old schema safely
    let mut stmt = conn.prepare("PRAGMA table_info(instances)")?;
    let mut has_status = false;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name == "status" {
            has_status = true;
            break;
        }
    }
    drop(rows);
    drop(stmt);
    if !has_status {
        conn.execute(
            "ALTER TABLE instances ADD COLUMN status TEXT DEFAULT 'Ready'",
            [],
        )?;
    }

    conn.execute(
        "CREATE TABLE IF NOT EXISTS instance_mods (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            instance_id TEXT NOT NULL,
            mod_id TEXT NOT NULL,
            mod_version_id TEXT NOT NULL,
            source TEXT NOT NULL,
            env_client TEXT DEFAULT 'required',
            env_server TEXT DEFAULT 'required',
            FOREIGN KEY(instance_id) REFERENCES instances(id) ON DELETE CASCADE,
            UNIQUE(instance_id, mod_id)
        )",
        [],
    )?;

    // Ensure unique constraint for upserts
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_instance_mods_unique ON instance_mods(instance_id, mod_id)",
        [],
    )?;

    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_db_schema_initialization() {
        let conn = Connection::open_in_memory().expect("Failed to open in-memory db");

        conn.execute("PRAGMA foreign_keys = ON;", []).unwrap();

        conn.execute(
            "CREATE TABLE IF NOT EXISTS instances (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                base_pack_id TEXT NOT NULL,
                base_pack_version_id TEXT NOT NULL,
                mc_version TEXT NOT NULL,
                loader TEXT NOT NULL,
                source TEXT NOT NULL,
                status TEXT DEFAULT 'Ready',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )
        .expect("Failed to create instances table");

        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='instances'")
            .unwrap();
        let exists = stmt.exists([]).unwrap();
        assert!(exists, "instances table should exist");
    }
}
