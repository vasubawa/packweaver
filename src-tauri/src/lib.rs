mod db;
mod downloader;
mod jar_inspector;
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
            description, last_exported, banner_url, icon_url, export_settings
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
                row.get::<_, String>(1).unwrap_or_default(),
                row.get::<_, String>(2).unwrap_or_default(),
                row.get::<_, String>(3).unwrap_or_default(),
                row.get::<_, String>(4)
                    .unwrap_or_else(|_| "1.20.1".to_string()),
                row.get::<_, String>(5)
                    .unwrap_or_else(|_| "Fabric".to_string()),
                row.get::<_, String>(6)
                    .unwrap_or_else(|_| "local".to_string()),
                row.get::<_, String>(7)
                    .unwrap_or_else(|_| "Ready".to_string()),
                row.get::<_, Option<String>>(8)
                    .unwrap_or_default()
                    .unwrap_or_default(),
                row.get::<_, Option<String>>(9)
                    .unwrap_or_default()
                    .unwrap_or_default(),
                row.get::<_, Option<String>>(10)
                    .unwrap_or_default()
                    .unwrap_or_default(),
                row.get::<_, Option<String>>(11)
                    .unwrap_or_default()
                    .unwrap_or_default(),
                row.get::<_, Option<String>>(12)
                    .unwrap_or_default()
                    .unwrap_or_else(|| "{}".to_string()),
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
        icon_url,
        export_settings_str,
    ) in rows.flatten()
    {
        let export_settings =
            serde_json::from_str(&export_settings_str).unwrap_or(serde_json::json!({}));

        let mut custom_mods = Vec::new();
        let mut base_pack_mods = Vec::new();
        let mut total_mod_count = 0;
        let mut custom_mod_count = 0;

        if let Ok(mut m_stmt) = conn.prepare("SELECT mod_id, name, mod_version_id, source, is_base, enabled, icon_url, author, description, file_name FROM instance_mods WHERE instance_id = ?") {
            let instance_dir = db::get_portable_data_dir().join("instances").join(&id);
            if let Ok(m_iter) = m_stmt.query_map([&id], |mr| {
                let mod_id: String = mr.get(0)?;
                let name: String = mr.get(1)?;
                let mut m = InstanceMod {
                    id: mod_id.clone(),
                    name: if name.is_empty() { mod_id.clone() } else { name },
                    version: mr.get(2)?,
                    source: mr.get(3)?,
                    is_base: mr.get(4)?,
                    enabled: mr.get(5)?,
                    icon_url: mr.get(6).unwrap_or(None),
                    author: mr.get(7).unwrap_or(None),
                    description: mr.get(8).unwrap_or(None),
                    file_name: mr.get(9).unwrap_or(None),
                };

                // If author or name are not yet enriched, inspect local jar on disk
                let is_author_empty = m.author.as_deref().unwrap_or("").trim().is_empty();
                let is_version_unknown = m.version.trim().is_empty() || m.version == "latest" || m.version == "local";
                if is_author_empty || is_version_unknown || m.name.ends_with(".jar") || m.name.ends_with(".zip") {
                    let clean_id = m.id.replace('\\', "/");
                    let file_name_str = m.file_name.as_deref().unwrap_or(&clean_id);
                    let filename = file_name_str.split('/').next_back().unwrap_or(file_name_str);
                    let normalized_rel = clean_id.replace('/', std::path::MAIN_SEPARATOR_STR);
                    let mut possible_paths = vec![
                        instance_dir.join(&normalized_rel),
                        instance_dir.join("mods").join(filename),
                        instance_dir.join("workspace").join(&normalized_rel),
                        instance_dir.join("workspace").join("mods").join(filename),
                        instance_dir.join(filename),
                    ];

                    // If clean_id isn't the file name, also check it against mods/
                    let id_filename = clean_id.split('/').next_back().unwrap_or(&clean_id);
                    if id_filename != filename {
                         possible_paths.push(instance_dir.join("mods").join(id_filename));
                         possible_paths.push(instance_dir.join("workspace").join("mods").join(id_filename));
                    }
                    if let Some(jar_path) = possible_paths.iter().find(|p| p.exists() && p.is_file()) {
                        let meta = jar_inspector::inspect_jar(jar_path);
                        if let Some(real_name) = meta.name {
                            m.name = real_name;
                        }
                        if let Some(real_ver) = meta.version {
                            m.version = real_ver;
                        }
                        if meta.author.is_some() {
                            m.author = meta.author;
                        }
                        if meta.description.is_some() {
                            m.description = meta.description;
                        }
                    }
                }

                Ok(m)
            }) {
                for m in m_iter.flatten() {
                    total_mod_count += 1;
                    if m.is_base {
                        base_pack_mods.push(m.clone());
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
            icon_url,
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

#[derive(serde::Deserialize)]
struct BasePackMod {
    id: String,
    name: String,
    version: Option<String>,
    author: Option<String>,
    icon_url: Option<String>,
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
    description: Option<String>,
    banner_url: Option<String>,
    icon_url: Option<String>,
    base_pack_mods: Option<Vec<BasePackMod>>,
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
            "INSERT INTO instances (id, name, base_pack_id, base_pack_version_id, mc_version, loader, source, status, description, banner_url, icon_url) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![&id, &name, &base_pack_id, &base_pack_version_id, &mc_version, &loader, &source, "Starting...", description.unwrap_or_default(), banner_url.unwrap_or_default(), icon_url.unwrap_or_default()],
        ).map_err(|e| e.to_string())?;

        if let Some(mods) = base_pack_mods {
            for mod_info in mods {
                let _ = conn.execute(
                    "INSERT INTO instance_mods (instance_id, mod_id, name, mod_version_id, author, source, is_base, enabled, icon_url)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, 1, ?7)",
                    rusqlite::params![
                        &id,
                        &mod_info.id,
                        &mod_info.name,
                        &mod_info.version.unwrap_or_else(|| "latest".to_string()),
                        &mod_info.author,
                        &source,
                        &mod_info.icon_url.unwrap_or_default()
                    ],
                );
            }
        }
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
    export_settings: Option<String>,
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
    if let Some(es) = export_settings {
        conn.execute(
            "UPDATE instances SET export_settings = ?1 WHERE id = ?2",
            rusqlite::params![es, id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn add_custom_mod(
    instance_id: String,
    mod_id: String,
    name: String,
    version: Option<String>,
    source: String,
    icon_url: Option<String>,
    author: Option<String>,
    description: Option<String>,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let conn = state
        .db
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())?;
    conn.execute(
        "INSERT INTO instance_mods (instance_id, mod_id, name, mod_version_id, source, is_base, enabled, icon_url, author, description)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, 1, ?6, ?7, ?8)",
        rusqlite::params![
            instance_id,
            mod_id,
            name,
            version.unwrap_or_else(|| "latest".to_string()),
            source,
            icon_url.unwrap_or_default(),
            author.unwrap_or_default(),
            description.unwrap_or_default()
        ],
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

#[tauri::command]
fn get_app_info() -> Result<serde_json::Value, String> {
    let data_dir = db::get_portable_data_dir();
    Ok(serde_json::json!({
        "data_dir": data_dir.to_string_lossy(),
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

#[tauri::command]
fn open_data_dir() -> Result<(), String> {
    let data_dir = db::get_portable_data_dir();
    let _ = std::fs::create_dir_all(&data_dir);
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(data_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(data_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(data_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
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
            remove_custom_mod,
            get_app_info,
            open_data_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
