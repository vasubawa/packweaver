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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS instance_mods (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            instance_id TEXT NOT NULL,
            mod_id TEXT NOT NULL,
            mod_version_id TEXT NOT NULL,
            source TEXT NOT NULL,
            FOREIGN KEY(instance_id) REFERENCES instances(id) ON DELETE CASCADE
        )",
        [],
    )?;

    Ok(conn)
}
