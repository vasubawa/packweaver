use rusqlite::{Connection, Result};
use std::path::PathBuf;
use tauri::Manager;

pub fn init_db(app_handle: &tauri::AppHandle) -> Result<Connection> {
    // Get the app data dir, e.g. AppData/Roaming/com.vasus.packweaver
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");
    
    // Ensure the directory exists
    std::fs::create_dir_all(&app_dir).expect("Failed to create app data dir");
    
    let db_path: PathBuf = app_dir.join("packweaver.db");
    
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

    // Add column if migrating from old schema
    let _ = conn.execute("ALTER TABLE instances ADD COLUMN status TEXT DEFAULT 'Ready'", []);

    conn.execute(
        "CREATE TABLE IF NOT EXISTS instance_mods (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            instance_id TEXT NOT NULL,
            mod_id TEXT NOT NULL,
            mod_version_id TEXT NOT NULL,
            source TEXT NOT NULL,
            env_client TEXT DEFAULT 'required',
            env_server TEXT DEFAULT 'required',
            FOREIGN KEY(instance_id) REFERENCES instances(id) ON DELETE CASCADE
        )",
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
        ).expect("Failed to create instances table");

        let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='instances'").unwrap();
        let exists = stmt.exists([]).unwrap();
        assert!(exists, "instances table should exist");
    }
}
