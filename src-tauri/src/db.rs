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
            source TEXT NOT NULL,
            icon_url TEXT DEFAULT '',
            author TEXT DEFAULT '',
            description TEXT DEFAULT '',
            is_base BOOLEAN NOT NULL DEFAULT 0,
            enabled BOOLEAN NOT NULL DEFAULT 1,
            FOREIGN KEY(instance_id) REFERENCES instances(id) ON DELETE CASCADE,
            UNIQUE(instance_id, mod_id)
        )",
        [],
    )?;

    // Migrate older databases created before the `name` column existed
    let has_name_column = conn
        .prepare("SELECT name FROM pragma_table_info('instance_mods') WHERE name = 'name'")
        .and_then(|mut stmt| stmt.exists([]))
        .unwrap_or(true);
    if !has_name_column {
        conn.execute(
            "ALTER TABLE instance_mods ADD COLUMN name TEXT NOT NULL DEFAULT ''",
            [],
        )?;
    }

    let has_file_name_column = conn
        .prepare("SELECT name FROM pragma_table_info('instance_mods') WHERE name = 'file_name'")
        .and_then(|mut stmt| stmt.exists([]))
        .unwrap_or(true);
    if !has_file_name_column {
        conn.execute("ALTER TABLE instance_mods ADD COLUMN file_name TEXT", [])?;
    }

    let has_instance_icon = conn
        .prepare("SELECT name FROM pragma_table_info('instances') WHERE name = 'icon_url'")
        .and_then(|mut stmt| stmt.exists([]))
        .unwrap_or(true);
    if !has_instance_icon {
        conn.execute(
            "ALTER TABLE instances ADD COLUMN icon_url TEXT DEFAULT ''",
            [],
        )?;
    }

    let has_mod_icon = conn
        .prepare("SELECT name FROM pragma_table_info('instance_mods') WHERE name = 'icon_url'")
        .and_then(|mut stmt| stmt.exists([]))
        .unwrap_or(true);
    if !has_mod_icon {
        conn.execute(
            "ALTER TABLE instance_mods ADD COLUMN icon_url TEXT DEFAULT ''",
            [],
        )?;
    }

    let has_mod_author = conn
        .prepare("SELECT name FROM pragma_table_info('instance_mods') WHERE name = 'author'")
        .and_then(|mut stmt| stmt.exists([]))
        .unwrap_or(true);
    if !has_mod_author {
        conn.execute(
            "ALTER TABLE instance_mods ADD COLUMN author TEXT DEFAULT ''",
            [],
        )?;
    }

    let has_mod_description = conn
        .prepare("SELECT name FROM pragma_table_info('instance_mods') WHERE name = 'description'")
        .and_then(|mut stmt| stmt.exists([]))
        .unwrap_or(true);
    if !has_mod_description {
        conn.execute(
            "ALTER TABLE instance_mods ADD COLUMN description TEXT DEFAULT ''",
            [],
        )?;
    }

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

    // Ensure unique constraint for upserts
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_instance_mods_unique ON instance_mods(instance_id, mod_id)",
        [],
    )?;

    Ok(conn)
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    #[test]
    fn test_db_schema_initialization() {
        let conn = Connection::open_in_memory().expect("Failed to open in-memory db");

        conn.execute("PRAGMA foreign_keys = ON;", []).unwrap();

        // Instances table
        conn.execute(
            "CREATE TABLE instances (
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
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )
        .expect("Failed to create instances table");

        // Instance Mods table
        conn.execute(
            "CREATE TABLE instance_mods (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                instance_id TEXT NOT NULL,
                mod_id TEXT NOT NULL,
                name TEXT NOT NULL DEFAULT '',
                mod_version_id TEXT NOT NULL,
                source TEXT NOT NULL,
                icon_url TEXT DEFAULT '',
                author TEXT DEFAULT '',
                description TEXT DEFAULT '',
                is_base BOOLEAN NOT NULL DEFAULT 0,
                enabled BOOLEAN NOT NULL DEFAULT 1,
                FOREIGN KEY(instance_id) REFERENCES instances(id) ON DELETE CASCADE,
                UNIQUE(instance_id, mod_id)
            )",
            [],
        )
        .expect("Failed to create instance_mods table");

        let mut stmt1 = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='instances'")
            .unwrap();
        assert!(stmt1.exists([]).unwrap(), "instances table should exist");

        let mut stmt2 = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='instance_mods'")
            .unwrap();
        assert!(
            stmt2.exists([]).unwrap(),
            "instance_mods table should exist"
        );

        // Verify unique constraint
        conn.execute("INSERT INTO instances (id, name, base_pack_id, base_pack_version_id, mc_version, loader, source) VALUES ('1', 'test', 'test', 'test', 'test', 'test', 'test')", []).unwrap();
        conn.execute("INSERT INTO instance_mods (instance_id, mod_id, name, mod_version_id, source) VALUES ('1', 'm1', 'mod', '1.0', 'local')", []).unwrap();
        let res = conn.execute("INSERT INTO instance_mods (instance_id, mod_id, name, mod_version_id, source) VALUES ('1', 'm1', 'mod2', '1.1', 'local')", []);
        assert!(
            res.is_err(),
            "Should enforce unique constraint on instance_id and mod_id"
        );
    }
}
