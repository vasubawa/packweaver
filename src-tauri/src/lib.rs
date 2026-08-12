mod db;
mod models;

use std::sync::Mutex;
use rusqlite::Connection;
use tauri::Manager;
use models::Instance;

struct AppState {
    db: Mutex<Connection>,
}

#[tauri::command]
fn get_instances(state: tauri::State<AppState>) -> Result<Vec<Instance>, String> {
    let conn = state.db.lock().unwrap();
    
    let mut stmt = conn.prepare("SELECT id, name, base_pack_id, base_pack_version_id, mc_version, loader, source FROM instances").map_err(|e| e.to_string())?;
    
    let instance_iter = stmt.query_map([], |row| {
        Ok(Instance {
            id: row.get(0)?,
            name: row.get(1)?,
            base_pack_id: row.get(2)?,
            base_pack_version_id: row.get(3)?,
            mc_version: row.get(4)?,
            loader: row.get(5)?,
            source: row.get(6)?,
            // Mocking these for now since we haven't wired up the instance_mods table completely
            mods_count: 0,
            status: "Ready".to_string(),
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
    state: tauri::State<AppState>
) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    
    conn.execute(
        "INSERT INTO instances (id, name, base_pack_id, base_pack_version_id, mc_version, loader, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        (&id, &name, &base_pack_id, &base_pack_version_id, &mc_version, &loader, &source),
    ).map_err(|e| e.to_string())?;
    
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
        .invoke_handler(tauri::generate_handler![get_instances, create_instance])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
