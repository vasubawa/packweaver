mod db;
mod models;
mod downloader;

use std::sync::Mutex;
use rusqlite::Connection;
use tauri::{Manager, Emitter};
use models::Instance;

struct AppState {
    db: Mutex<Connection>,
}

#[tauri::command]
fn get_instances(state: tauri::State<AppState>) -> Result<Vec<Instance>, String> {
    let conn = state.db.lock().unwrap();
    
    let query = "
        SELECT 
            i.id, i.name, i.base_pack_id, i.base_pack_version_id, i.mc_version, i.loader, i.source,
            COUNT(m.id) as mods_count, i.status
        FROM instances i
        LEFT JOIN instance_mods m ON i.id = m.instance_id
        GROUP BY i.id
        ORDER BY i.created_at DESC
    ";
    
    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    
    let instance_iter = stmt.query_map([], |row| {
        Ok(Instance {
            id: row.get(0)?,
            name: row.get(1)?,
            base_pack_id: row.get(2)?,
            base_pack_version_id: row.get(3)?,
            mc_version: row.get(4)?,
            loader: row.get(5)?,
            source: row.get(6)?,
            mods_count: row.get(7)?,
            status: row.get(8).unwrap_or_else(|_| "Ready".to_string()),
        })
    }).map_err(|e| e.to_string())?;

    let mut instances = Vec::new();
    for inst in instance_iter {
        instances.push(inst.map_err(|e| e.to_string())?);
    }
    
    Ok(instances)
}

#[tauri::command]
fn create_instance(
    name: String, 
    base_pack_id: String, 
    base_pack_version_id: String, 
    mc_version: String, 
    loader: String, 
    source: String, 
    app: tauri::AppHandle,
    state: tauri::State<AppState>
) -> Result<(), String> {
    let id = uuid::Uuid::new_v4().to_string();
    
    // Insert dummy record to show in UI immediately
    {
        let conn = state.db.lock().unwrap();
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
        if let Err(e) = downloader::run_pipeline(app.clone(), app.state::<AppState>(), id_clone.clone(), bp_id_clone).await {
            println!("Pipeline error: {}", e);
            let state = app.state::<AppState>();
            if let Ok(conn) = state.db.lock() {
                let _ = conn.execute("UPDATE instances SET status = ?1 WHERE id = ?2", [&format!("Error: {}", e), &id_clone]);
            }
            let _ = app.emit("instance-progress", downloader::ProgressEvent {
                instance_id: id_clone,
                status: format!("Error: {}", e),
                progress: 0,
                total: 0,
            });
        }
    });

    Ok(())
}

#[tauri::command]
fn delete_instance(id: String, state: tauri::State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute("DELETE FROM instances WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let conn = db::init_db(app.handle()).expect("Failed to initialize database");
            app.manage(AppState { db: Mutex::new(conn) });
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_instances, create_instance, delete_instance])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
