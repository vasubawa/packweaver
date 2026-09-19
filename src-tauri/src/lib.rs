mod db;
mod downloader;
pub mod fetchers;
mod installer;
mod jar_inspector;
mod models;

use models::{Instance, InstanceMod, ServerFile};
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

pub struct AppState {
    pub db: Mutex<Connection>,
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

        let instance_dir = db::get_portable_data_dir().join("instances").join(&id);
        let pack_label: String = conn
            .query_row(
                "SELECT COALESCE(NULLIF(original_filename, ''), name) FROM instances WHERE id = ?1",
                [&id],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| name.clone());
        let stem = downloader::stem_from_filename(&pack_label);
        let client_ws = downloader::client_workspace_root(&id).join(&stem);
        let server_ws = downloader::server_workspace_root(&id).join(&stem);

        let mut custom_mods = Vec::new();
        let mut base_pack_mods = Vec::new();
        let mut total_mod_count = 0;
        let mut custom_mod_count = 0;

        if let Ok(mut m_stmt) = conn.prepare("SELECT mod_id, name, mod_version_id, source, is_base, enabled_client, enabled_server, COALESCE(side, 'both'), icon_url, author, description, file_name FROM instance_mods WHERE instance_id = ?") {
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
                    enabled_server: mr.get(6)?,
                    side: mr.get(7)?,
                    icon_url: mr.get(8).unwrap_or(None),
                    author: mr.get(9).unwrap_or(None),
                    description: mr.get(10).unwrap_or(None),
                    file_name: mr.get(11).unwrap_or(None),
                    on_disk_client: false,
                    on_disk_server: false,
                    file_size: None,
                };

                let clean_id = m.id.replace('\\', "/");
                let file_name_str = m.file_name.as_deref().unwrap_or(&clean_id);
                let filename = file_name_str.split('/').next_back().unwrap_or(file_name_str);
                let normalized_rel = clean_id.replace('/', std::path::MAIN_SEPARATOR_STR);

                let client_candidates = [
                    client_ws.join(&normalized_rel),
                    client_ws.join("mods").join(filename),
                    // Legacy flat layout
                    instance_dir.join("workspace").join(&normalized_rel),
                    instance_dir.join("workspace").join("mods").join(filename),
                ];
                let server_candidates = [
                    server_ws.join(&normalized_rel),
                    server_ws.join("mods").join(filename),
                    instance_dir.join("server-workspace").join(&normalized_rel),
                    instance_dir.join("server-workspace").join("mods").join(filename),
                ];
                if let Some(p) = client_candidates.iter().find(|p| p.exists() && p.is_file()) {
                    m.on_disk_client = true;
                    if let Ok(meta) = std::fs::metadata(p) {
                        m.file_size = Some(meta.len());
                    }
                }
                if let Some(p) = server_candidates.iter().find(|p| p.exists() && p.is_file()) {
                    m.on_disk_server = true;
                    if m.file_size.is_none() {
                        if let Ok(meta) = std::fs::metadata(p) {
                            m.file_size = Some(meta.len());
                        }
                    }
                }

                // If author or name are not yet enriched, inspect local jar on disk
                let is_author_empty = m.author.as_deref().unwrap_or("").trim().is_empty();
                let is_version_unknown = m.version.trim().is_empty() || m.version == "latest" || m.version == "local";
                if is_author_empty || is_version_unknown || m.name.ends_with(".jar") || m.name.ends_with(".zip") {
                    let mut possible_paths = vec![
                        client_ws.join(&normalized_rel),
                        client_ws.join("mods").join(filename),
                        server_ws.join("mods").join(filename),
                        instance_dir.join("workspace").join("mods").join(filename),
                        instance_dir.join("server-workspace").join("mods").join(filename),
                    ];
                    let id_filename = clean_id.split('/').next_back().unwrap_or(&clean_id);
                    if id_filename != filename {
                         possible_paths.push(client_ws.join("mods").join(id_filename));
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
    let mut unique_name = name.clone();
    let final_id: String;

    // Insert dummy record to show in UI immediately
    {
        let conn = state
            .db
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;

        let mut counter = 1;
        loop {
            if let Ok(mut stmt) = conn.prepare("SELECT COUNT(*) FROM instances WHERE name = ?1") {
                let count: i64 = stmt
                    .query_row([&unique_name], |row| row.get(0))
                    .unwrap_or(0);
                if count == 0 {
                    break;
                }
            } else {
                break;
            }
            unique_name = format!("{} ({})", name, counter);
            counter += 1;
        }

        let sanitized = unique_name
            .chars()
            .map(|c| if c.is_alphanumeric() { c } else { '-' })
            .collect::<String>();
        let mut base_id = sanitized
            .split('-')
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("-");
        if base_id.is_empty() {
            base_id = "instance".to_string();
        }

        let mut candidate_id = base_id.clone();
        let mut id_counter = 1;
        loop {
            if let Ok(mut stmt) = conn.prepare("SELECT COUNT(*) FROM instances WHERE id = ?1") {
                let count: i64 = stmt
                    .query_row([&candidate_id], |row| row.get(0))
                    .unwrap_or(0);
                if count == 0 {
                    break;
                }
            } else {
                break;
            }
            candidate_id = format!("{}-{}", base_id, id_counter);
            id_counter += 1;
        }
        final_id = candidate_id;

        conn.execute(
            "INSERT INTO instances (id, name, base_pack_id, base_pack_version_id, mc_version, loader, source, status, description, banner_url, icon_url) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![&final_id, &unique_name, &base_pack_id, &base_pack_version_id, &mc_version, &loader, &source, "Starting...", description.unwrap_or_default(), banner_url.unwrap_or_default(), icon_url.unwrap_or_default()],
        ).map_err(|e| e.to_string())?;

        if let Some(mods) = base_pack_mods {
            for mod_info in mods {
                let _ = conn.execute(
                    "INSERT INTO instance_mods (instance_id, mod_id, name, mod_version_id, author, source, is_base, enabled, icon_url)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, 1, ?7)",
                    rusqlite::params![
                        &final_id,
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

    // Since AppState contains a Mutex<Connection> that is not Clone, we can just use the app handle to get the state inside the task
    let id_clone = final_id.clone();
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
async fn toggle_mod_state(
    instance_id: String,
    mod_id: String,
    enabled: bool,
    side: Option<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let side = side.unwrap_or_else(|| "client".to_string());
    let side = if side == "server" { "server" } else { "client" };
    {
        let conn = state
            .db
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;
        if side == "server" {
            conn.execute(
                "UPDATE instance_mods SET enabled_server = ?1 WHERE instance_id = ?2 AND mod_id = ?3",
                rusqlite::params![enabled, instance_id, mod_id],
            )
            .map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "UPDATE instance_mods SET enabled = ?1, enabled_client = ?1 WHERE instance_id = ?2 AND mod_id = ?3",
                rusqlite::params![enabled, instance_id, mod_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    // Enable is DB-only — jars are restored on Rebuild / Layer / server rebuild.
    // Disable removes the jar from that side's tree immediately (no download).
    if !enabled {
        downloader::apply_mod_enabled(&app, &instance_id, &mod_id, false, side).await?;
    }
    Ok(())
}

#[tauri::command]
fn update_instance_details(
    id: String,
    name: Option<String>,
    description: Option<String>,
    banner_url: Option<String>,
    export_settings: Option<String>,
    last_exported: Option<String>,
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
    if let Some(le) = last_exported {
        conn.execute(
            "UPDATE instances SET last_exported = ?1 WHERE id = ?2",
            rusqlite::params![le, id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn set_base_pack_version(
    instance_id: String,
    version_id: String,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    if version_id.trim().is_empty() {
        return Err("version_id is required".to_string());
    }
    let conn = state
        .db
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())?;
    let n = conn
        .execute(
            "UPDATE instances SET base_pack_version_id = ?1 WHERE id = ?2",
            rusqlite::params![version_id.trim(), instance_id],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("Instance not found".to_string());
    }
    Ok(())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CustomModVersionUpdate {
    mod_id: String,
    version: String,
    file_name: Option<String>,
}

#[tauri::command]
fn update_custom_mod_versions(
    instance_id: String,
    updates: Vec<CustomModVersionUpdate>,
    state: tauri::State<AppState>,
) -> Result<u32, String> {
    let conn = state
        .db
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())?;
    let mut count = 0u32;
    for u in updates {
        if u.mod_id.is_empty() || u.version.trim().is_empty() {
            continue;
        }
        let n = if let Some(ref fname) = u.file_name {
            conn.execute(
                "UPDATE instance_mods SET mod_version_id = ?1, file_name = ?2
                 WHERE instance_id = ?3 AND mod_id = ?4 AND is_base = 0",
                rusqlite::params![u.version.trim(), fname, instance_id, u.mod_id],
            )
        } else {
            conn.execute(
                "UPDATE instance_mods SET mod_version_id = ?1
                 WHERE instance_id = ?2 AND mod_id = ?3 AND is_base = 0",
                rusqlite::params![u.version.trim(), instance_id, u.mod_id],
            )
        }
        .map_err(|e| e.to_string())?;
        if n > 0 {
            count += 1;
        }
    }
    Ok(count)
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
    file_name: Option<String>,
    side: Option<String>,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let conn = state
        .db
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())?;

    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM instance_mods WHERE instance_id = ?1 AND mod_id = ?2",
            rusqlite::params![&instance_id, &mod_id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if exists > 0 {
        return Err(format!(
            "Mod '{}' is already in this pack (base or custom)",
            name
        ));
    }

    let side = match side.as_deref().unwrap_or("both") {
        "client" => "client",
        "server" => "server",
        _ => "both",
    };
    let (enabled_client, enabled_server) = match side {
        "client" => (true, false),
        "server" => (false, true),
        _ => (true, true),
    };

    let fn_ref = file_name.as_deref().unwrap_or("");
    let (source_path, stored_file_name) = if source == "local"
        && (std::path::Path::new(fn_ref).is_absolute() || fn_ref.contains(':'))
    {
        (
            fn_ref.to_string(),
            std::path::Path::new(fn_ref)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(fn_ref)
                .to_string(),
        )
    } else {
        (String::new(), fn_ref.to_string())
    };

    conn.execute(
        "INSERT INTO instance_mods (instance_id, mod_id, name, mod_version_id, source, is_base, enabled, enabled_client, enabled_server, side, icon_url, author, description, source_path, file_name)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        rusqlite::params![
            instance_id,
            mod_id,
            name,
            version.unwrap_or_else(|| "latest".to_string()),
            source,
            enabled_client,
            enabled_server,
            side,
            icon_url.unwrap_or_default(),
            author.unwrap_or_default(),
            description.unwrap_or_default(),
            source_path,
            stored_file_name,
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
    let (file_name, stem): (String, String) = {
        let conn = state
            .db
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;
        let file_name: String = conn
            .query_row(
                "SELECT COALESCE(file_name, '') FROM instance_mods WHERE instance_id = ?1 AND mod_id = ?2",
                rusqlite::params![&instance_id, &mod_id],
                |row| row.get(0),
            )
            .unwrap_or_default();
        let pack_name: String = conn
            .query_row(
                "SELECT COALESCE(NULLIF(original_filename, ''), name) FROM instances WHERE id = ?1",
                rusqlite::params![&instance_id],
                |row| row.get(0),
            )
            .unwrap_or_default();
        conn.execute(
            "DELETE FROM instance_mods WHERE instance_id = ?1 AND mod_id = ?2 AND is_base = 0",
            rusqlite::params![&instance_id, &mod_id],
        )
        .map_err(|e| e.to_string())?;
        (file_name, downloader::stem_from_filename(&pack_name))
    };

    let client_ws = downloader::client_workspace_root(&instance_id).join(&stem);
    installer::remove_mod_file_from_workspace(&client_ws, Some(&file_name), &mod_id);
    let server_ws = downloader::server_workspace_root(&instance_id).join(&stem);
    installer::remove_mod_file_from_workspace(&server_ws, Some(&file_name), &mod_id);
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

#[tauri::command]
async fn rebuild_workspace(
    instance_id: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let (base_pack_id, source): (String, String) = {
        let conn = state
            .db
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;
        conn.query_row(
            "SELECT base_pack_id, source FROM instances WHERE id = ?1",
            [&instance_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?
    };

    downloader::run_pipeline(
        app.clone(),
        app.state::<AppState>(),
        instance_id,
        base_pack_id,
        source,
    )
    .await
}

#[tauri::command]
async fn layer_custom_mods(
    instance_id: String,
    for_server: Option<bool>,
    app: tauri::AppHandle,
    _state: tauri::State<'_, AppState>,
) -> Result<u32, String> {
    let for_server = for_server.unwrap_or(false);
    let workspace_dir = if for_server {
        downloader::server_workspace_dir(&app, &instance_id)?
    } else {
        downloader::client_workspace_dir(&app, &instance_id)?
    };
    if !workspace_dir.exists() {
        return Err(if for_server {
            "Server workspace not found — rebuild server first".to_string()
        } else {
            "Workspace not found — rebuild the pack first".to_string()
        });
    }

    let client = reqwest::Client::builder()
        .user_agent("packweaver/0.1.0 (packweaver-app)")
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let _ = app.emit(
        "export-progress",
        downloader::ProgressEvent {
            instance_id: instance_id.clone(),
            status: if for_server {
                "Layering server custom mods…".to_string()
            } else {
                "Layering custom mods…".to_string()
            },
            progress: 0,
            total: 1,
        },
    );

    let count =
        downloader::layer_custom_mods(&app, &client, &instance_id, &workspace_dir, for_server)
            .await?;

    let _ = app.emit(
        "export-progress",
        downloader::ProgressEvent {
            instance_id: instance_id.clone(),
            status: format!("Layered {} custom mod(s)", count),
            progress: 1,
            total: 1,
        },
    );

    Ok(count)
}

#[tauri::command]
async fn rebuild_server_workspace(
    instance_id: String,
    app: tauri::AppHandle,
    _state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    downloader::run_server_pipeline(app, instance_id).await
}

#[tauri::command]
async fn export_instance(
    instance_id: String,
    format: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let format = format.to_lowercase();
    let is_server = format == "server";
    if format != "zip" && !is_server {
        return Err(format!(
            "Export format '{}' is not available yet. Use zip or server.",
            format
        ));
    }

    let stem = downloader::original_stem(&app, &instance_id)?;
    let default_name = if is_server {
        format!("{}-MODIFIED-server.zip", stem)
    } else {
        format!("{}-MODIFIED.zip", stem)
    };

    let _ = app.emit(
        "export-progress",
        downloader::ProgressEvent {
            instance_id: instance_id.clone(),
            status: if is_server {
                "Packaging server zip...".to_string()
            } else {
                "Packaging as zip...".to_string()
            },
            progress: 0,
            total: 3,
        },
    );

    let workspace_dir = if is_server {
        downloader::server_workspace_dir(&app, &instance_id)?
    } else {
        downloader::client_workspace_dir(&app, &instance_id)?
    };

    if !workspace_dir.exists() {
        return Err(if is_server {
            "Server workspace not found - rebuild server first".to_string()
        } else {
            "Workspace not found - rebuild the pack first".to_string()
        });
    }

    // Build the zip first; only ask where to save once packaging is done.
    let temp_dir = std::env::temp_dir().join("packweaver-exports");
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let temp_zip = temp_dir.join(format!(
        "{}-{}-{}.zip",
        if is_server { "server" } else { "client" },
        &instance_id,
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    ));

    let _ = app.emit(
        "export-progress",
        downloader::ProgressEvent {
            instance_id: instance_id.clone(),
            status: "Writing zip...".to_string(),
            progress: 1,
            total: 3,
        },
    );

    if let Err(e) = downloader::zip_workspace(&workspace_dir, &temp_zip) {
        let _ = std::fs::remove_file(&temp_zip);
        return Err(e);
    }

    let _ = app.emit(
        "export-progress",
        downloader::ProgressEvent {
            instance_id: instance_id.clone(),
            status: "Choose where to save…".to_string(),
            progress: 2,
            total: 3,
        },
    );

    use tauri_plugin_dialog::DialogExt;
    let chosen = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("ZIP Archive", &["zip"])
        .blocking_save_file();

    let dest = match chosen {
        Some(path) => path.into_path().map_err(|e| {
            let _ = std::fs::remove_file(&temp_zip);
            format!("Invalid save path: {}", e)
        })?,
        None => {
            let _ = std::fs::remove_file(&temp_zip);
            return Err("Export cancelled".to_string());
        }
    };

    let dest = if dest.extension().and_then(|e| e.to_str()) != Some("zip") {
        dest.with_extension("zip")
    } else {
        dest
    };

    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            let _ = std::fs::remove_file(&temp_zip);
            e.to_string()
        })?;
    }
    std::fs::copy(&temp_zip, &dest).map_err(|e| {
        let _ = std::fs::remove_file(&temp_zip);
        e.to_string()
    })?;
    let _ = std::fs::remove_file(&temp_zip);

    let exported_at = {
        use std::time::{SystemTime, UNIX_EPOCH};
        let secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        format!("{}", secs)
    };
    {
        let conn = state
            .db
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;
        conn.execute(
            "UPDATE instances SET last_exported = ?1 WHERE id = ?2",
            rusqlite::params![&exported_at, &instance_id],
        )
        .map_err(|e| e.to_string())?;
    }

    let dest_str = dest.to_string_lossy().to_string();
    let _ = app.emit(
        "export-progress",
        downloader::ProgressEvent {
            instance_id: instance_id.clone(),
            status: format!("Saved {}", dest_str),
            progress: 3,
            total: 3,
        },
    );

    Ok(dest_str)
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
            set_base_pack_version,
            update_custom_mod_versions,
            add_custom_mod,
            remove_custom_mod,
            rebuild_workspace,
            rebuild_server_workspace,
            layer_custom_mods,
            export_instance,
            get_app_info,
            open_data_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
