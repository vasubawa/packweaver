use rusqlite::{Connection, Result};
use std::path::PathBuf;

pub fn get_portable_data_dir() -> PathBuf {
    let mut path = std::env::current_exe().expect("Failed to get current executable path");
    path.pop();

    if cfg!(target_os = "macos") && path.to_string_lossy().contains(".app/Contents/MacOS") {
        path.pop();
        path.pop();
        path.pop();
    }

    path.join("packweaver-data")
}

fn has_column(conn: &Connection, table: &str, column: &str) -> bool {
    conn.prepare(&format!(
        "SELECT name FROM pragma_table_info('{}') WHERE name = '{}'",
        table, column
    ))
    .and_then(|mut stmt| stmt.exists([]))
    .unwrap_or(false)
}

/// Apply pragmas, tables, and migrations. PRAGMA assignments return a row, so they
/// must not go through `Connection::execute` (that is `ExecuteReturnedResults`).
pub fn apply_schema(conn: &Connection) -> Result<()> {
    conn.pragma_update(None, "foreign_keys", true)?;
    conn.pragma_update(None, "busy_timeout", 5000)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;

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
            description TEXT DEFAULT '',
            last_exported TEXT DEFAULT 'Never',
            banner_url TEXT DEFAULT '',
            icon_url TEXT DEFAULT '',
            export_settings TEXT DEFAULT '{}',
            original_filename TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS instance_mods (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            instance_id TEXT NOT NULL,
            mod_id TEXT NOT NULL,
            name TEXT NOT NULL DEFAULT '',
            mod_version_id TEXT NOT NULL,
            file_name TEXT,
            source_path TEXT DEFAULT '',
            source TEXT NOT NULL,
            icon_url TEXT DEFAULT '',
            author TEXT DEFAULT '',
            description TEXT DEFAULT '',
            side TEXT NOT NULL DEFAULT 'both',
            is_base BOOLEAN NOT NULL DEFAULT 0,
            enabled BOOLEAN NOT NULL DEFAULT 1,
            enabled_client BOOLEAN NOT NULL DEFAULT 1,
            enabled_server BOOLEAN NOT NULL DEFAULT 1,
            FOREIGN KEY(instance_id) REFERENCES instances(id) ON DELETE CASCADE,
            UNIQUE(instance_id, mod_id)
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS server_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            instance_id TEXT NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            source TEXT NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT 1,
            FOREIGN KEY(instance_id) REFERENCES instances(id) ON DELETE CASCADE
        )",
        [],
    )?;

    let alters: &[(&str, &str, &str)] = &[
        ("instance_mods", "name", "TEXT NOT NULL DEFAULT ''"),
        ("instance_mods", "file_name", "TEXT"),
        ("instance_mods", "source_path", "TEXT DEFAULT ''"),
        ("instance_mods", "side", "TEXT NOT NULL DEFAULT 'both'"),
        ("instance_mods", "icon_url", "TEXT DEFAULT ''"),
        ("instance_mods", "author", "TEXT DEFAULT ''"),
        ("instance_mods", "description", "TEXT DEFAULT ''"),
        (
            "instance_mods",
            "enabled_client",
            "BOOLEAN NOT NULL DEFAULT 1",
        ),
        (
            "instance_mods",
            "enabled_server",
            "BOOLEAN NOT NULL DEFAULT 1",
        ),
        (
            "instance_mods",
            "provider_version_id",
            "TEXT NOT NULL DEFAULT ''",
        ),
        ("instances", "icon_url", "TEXT DEFAULT ''"),
        ("instances", "original_filename", "TEXT DEFAULT ''"),
        ("instances", "server_original_filename", "TEXT DEFAULT ''"),
        ("instances", "notes", "TEXT DEFAULT ''"),
        ("instances", "base_pack_version_label", "TEXT DEFAULT ''"),
        ("server_files", "file_id", "TEXT DEFAULT ''"),
        ("server_files", "source_path", "TEXT DEFAULT ''"),
    ];
    for (table, col, decl) in alters {
        if !has_column(conn, table, col) {
            conn.execute(
                &format!("ALTER TABLE {} ADD COLUMN {} {}", table, col, decl),
                [],
            )?;
        }
    }

    let user_version: i32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap_or(0);
    if user_version < 1 {
        let _ = conn.execute("UPDATE instance_mods SET enabled_client = enabled", []);
        conn.pragma_update(None, "user_version", 1)?;
    }

    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_instance_mods_unique ON instance_mods(instance_id, mod_id)",
        [],
    )?;

    Ok(())
}

pub fn init_db(_app_handle: &tauri::AppHandle) -> Result<Connection> {
    let app_dir = get_portable_data_dir();
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

    let db_path = app_dir.join("packweaver.db");
    let conn = Connection::open(db_path)?;
    apply_schema(&conn)?;
    Ok(conn)
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    #[test]
    fn apply_schema_accepts_pragmas_that_return_rows() {
        let conn = Connection::open_in_memory().unwrap();
        super::apply_schema(&conn).expect("fresh schema");
        super::apply_schema(&conn).expect("idempotent schema");
        let v: i32 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert!(v >= 1);
        assert!(super::has_column(
            &conn,
            "instance_mods",
            "provider_version_id"
        ));
        assert!(super::has_column(&conn, "server_files", "file_id"));
    }

    #[test]
    fn test_db_schema_initialization() {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", true).unwrap();
        conn.execute(
            "CREATE TABLE IF NOT EXISTS instances (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                base_pack_id TEXT NOT NULL,
                base_pack_version_id TEXT NOT NULL,
                mc_version TEXT NOT NULL,
                loader TEXT NOT NULL,
                source TEXT NOT NULL
            )",
            [],
        )
        .unwrap();
        conn.execute(
            "CREATE TABLE IF NOT EXISTS instance_mods (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                instance_id TEXT NOT NULL,
                mod_id TEXT NOT NULL,
                name TEXT NOT NULL DEFAULT '',
                mod_version_id TEXT NOT NULL,
                source TEXT NOT NULL,
                is_base BOOLEAN NOT NULL DEFAULT 0,
                enabled BOOLEAN NOT NULL DEFAULT 1,
                enabled_client BOOLEAN NOT NULL DEFAULT 1,
                enabled_server BOOLEAN NOT NULL DEFAULT 1,
                FOREIGN KEY(instance_id) REFERENCES instances(id) ON DELETE CASCADE,
                UNIQUE(instance_id, mod_id)
            )",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO instances (id, name, base_pack_id, base_pack_version_id, mc_version, loader, source) VALUES ('1', 'test', 'test', 'test', 'test', 'test', 'test')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO instance_mods (instance_id, mod_id, name, mod_version_id, source) VALUES ('1', 'm1', 'mod', '1.0', 'local')",
            [],
        )
        .unwrap();
        let res = conn.execute(
            "INSERT INTO instance_mods (instance_id, mod_id, name, mod_version_id, source) VALUES ('1', 'm1', 'mod2', '1.1', 'local')",
            [],
        );
        assert!(res.is_err());
    }
}
