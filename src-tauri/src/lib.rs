mod db;
mod downloader;
mod models;

use models::{Instance, InstanceMod, ServerFile};
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

struct AppState {
    db: Mutex<Connection>,
}

#[tauri::command]
fn get_instances(state: tauri::State<AppState>) -> Result<Vec<Instance>, String> {
    let conn = state
        .db
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())?;

    let query = "
        SELECT 
            id, name, base_pack_id, base_pack_version_id, mc_version, loader, source, status,
            description, last_exported, banner_url, export_settings
        FROM instances
        ORDER BY created_at DESC
    ";

    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;

    let mut instances = Vec::new();

    let rows = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            Ok((
                id,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, String>(10)?,
                row.get::<_, String>(11)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    for (
        id,
        name,
        base_pack,
        base_pack_version,
        mc_version,
        loader,
        source,
        status,
        description,
        last_exported,
        banner_url,
        export_settings_str,
    ) in rows.flatten()
    {
        let export_settings =
            serde_json::from_str(&export_settings_str).unwrap_or(serde_json::json!({}));

        let mut custom_mods = Vec::new();
        let mut base_pack_mods = Vec::new();
        let mut total_mod_count = 0;
        let mut custom_mod_count = 0;

        if let Ok(mut m_stmt) = conn.prepare("SELECT mod_id, mod_version_id, source, is_base, enabled FROM instance_mods WHERE instance_id = ?") {
            if let Ok(m_iter) = m_stmt.query_map([&id], |mr| {
                let mod_id: String = mr.get(0)?;
                Ok(InstanceMod {
                    id: mod_id.clone(),
                    name: mod_id,
                    version: mr.get(1)?,
                    source: mr.get(2)?,
                    is_base: mr.get(3)?,
                    enabled: mr.get(4)?,
                })
            }) {
                for m in m_iter.flatten() {
                    total_mod_count += 1;
                    if m.is_base {
                        base_pack_mods.push(m.name.clone());
                    } else {
                        custom_mod_count += 1;
                        custom_mods.push(m);
                    }
                }
            };
        }

        // Fetch server files
        let mut server_files = Vec::new();
        if let Ok(mut sf_stmt) = conn
            .prepare("SELECT name, type, source, enabled FROM server_files WHERE instance_id = ?")
        {
            if let Ok(sf_iter) = sf_stmt.query_map([&id], |sr| {
                Ok(ServerFile {
                    name: sr.get(0)?,
                    file_type: sr.get(1)?,
                    source: sr.get(2)?,
                    enabled: sr.get(3)?,
                })
            }) {
                for sf in sf_iter.flatten() {
                    server_files.push(sf);
                }
            };
        }

        instances.push(Instance {
            id,
            name,
            base_pack,
            base_pack_version,
            mc_version,
            loader,
            source,
            status,
            description,
            last_exported,
            banner_url,
            export_settings,
            custom_mod_count,
            total_mod_count,
            base_pack_mods,
            custom_mods,
            server_files,
        });
    }

    Ok(instances)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn create_instance(
    name: String,
    base_pack_id: String,
    base_pack_version_id: String,
    mc_version: String,
    loader: String,
    source: String,
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let id = uuid::Uuid::new_v4().to_string();

    // Insert dummy record to show in UI immediately
    {
        let conn = state
            .db
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;
        conn.execute(
            "INSERT INTO instances (id, name, base_pack_id, base_pack_version_id, mc_version, loader, source, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            (&id, &name, &base_pack_id, &base_pack_version_id, &mc_version, &loader, &source, "Starting..."),
        ).map_err(|e| e.to_string())?;
    }

    // Clone state inside an Arc or just re-access it via app handle in the task
    // Since AppState contains a Mutex<Connection> that is not Clone, we can just use the app handle to get the state inside the task!
    let id_clone = id.clone();
    let bp_id_clone = base_pack_id.clone();

    tauri::async_runtime::spawn(async move {
        // App handle gives us access to state
        if let Err(e) = downloader::run_pipeline(
            app.clone(),
            app.state::<AppState>(),
            id_clone.clone(),
            bp_id_clone,
            source.clone(),
        )
        .await
        {
            eprintln!("Pipeline error: {}", e);
            let state = app.state::<AppState>();
            if let Ok(conn) = state.db.lock() {
                let _ = conn.execute(
                    "UPDATE instances SET status = ?1 WHERE id = ?2",
                    [&format!("Error: {}", e), &id_clone],
                );
            }
            let _ = app.emit(
                "instance-progress",
                downloader::ProgressEvent {
                    instance_id: id_clone,
                    status: format!("Error: {}", e),
                    progress: 0,
                    total: 0,
                },
            );
        }
    });

    Ok(())
}

#[tauri::command]
fn delete_instance(id: String, state: tauri::State<AppState>) -> Result<(), String> {
    let conn = state
        .db
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())?;
    conn.execute("DELETE FROM instances WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;

    // Delete from filesystem
    let instance_dir = db::get_portable_data_dir().join("instances").join(&id);
    if instance_dir.exists() {
        std::fs::remove_dir_all(instance_dir).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn toggle_mod_state(
    instance_id: String,
    mod_id: String,
    enabled: bool,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let conn = state
        .db
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())?;
    conn.execute(
        "UPDATE instance_mods SET enabled = ?1 WHERE instance_id = ?2 AND mod_id = ?3",
        rusqlite::params![enabled, instance_id, mod_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn update_instance_details(
    id: String,
    name: Option<String>,
    description: Option<String>,
    banner_url: Option<String>,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let conn = state
        .db
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())?;

    if let Some(n) = name {
        conn.execute(
            "UPDATE instances SET name = ?1 WHERE id = ?2",
            rusqlite::params![n, id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(d) = description {
        conn.execute(
            "UPDATE instances SET description = ?1 WHERE id = ?2",
            rusqlite::params![d, id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(b) = banner_url {
        conn.execute(
            "UPDATE instances SET banner_url = ?1 WHERE id = ?2",
            rusqlite::params![b, id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn add_custom_mod(
    instance_id: String,
    mod_id: String,
    _name: String,
    source: String,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let conn = state
        .db
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())?;
    conn.execute(
        "INSERT INTO instance_mods (instance_id, mod_id, mod_version_id, source, is_base, enabled) 
         VALUES (?1, ?2, 'latest', ?3, 0, 1)",
        rusqlite::params![instance_id, mod_id, source],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn remove_custom_mod(
    instance_id: String,
    mod_id: String,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let conn = state
        .db
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())?;
    conn.execute(
        "DELETE FROM instance_mods WHERE instance_id = ?1 AND mod_id = ?2",
        rusqlite::params![instance_id, mod_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let conn = db::init_db(app.handle()).expect("Failed to initialize database");
            app.manage(AppState {
                db: Mutex::new(conn),
            });
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_instances,
            create_instance,
            delete_instance,
            toggle_mod_state,
            update_instance_details,
            add_custom_mod,
            remove_custom_mod
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
