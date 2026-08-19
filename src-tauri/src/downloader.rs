use crate::AppState;
use futures::future::join_all;
use reqwest::Client;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::Path;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone)]
pub struct ProgressEvent {
    pub instance_id: String,
    pub status: String,
    pub progress: u32,
    pub total: u32,
}

#[derive(Deserialize)]
struct ModrinthVersion {
    files: Vec<ModrinthVersionFile>,
}

#[derive(Deserialize)]
struct ModrinthVersionFile {
    url: String,
    primary: bool,
}

#[derive(Deserialize, Debug)]
struct ModrinthIndex {
    dependencies: std::collections::HashMap<String, String>,
    files: Vec<ModrinthFile>,
}

#[derive(Deserialize, Debug)]
struct ModrinthFile {
    path: String,
    downloads: Vec<String>,
    env: Option<ModrinthEnv>,
}

#[derive(Deserialize, Debug)]
struct ModrinthEnv {
    client: String,
    server: String,
}

pub async fn run_pipeline(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    instance_id: String,
    base_pack_id: String,
) -> Result<(), String> {
    let client = Client::builder()
        .user_agent("packweaver/0.1.0")
        .build()
        .map_err(|e| e.to_string())?;

    // Emits an event to the frontend
    let emit_progress = |status: &str, p: u32, t: u32| {
        let _ = app.emit(
            "instance-progress",
            ProgressEvent {
                instance_id: instance_id.clone(),
                status: status.to_string(),
                progress: p,
                total: t,
            },
        );
    };

    emit_progress("Fetching Pack Info...", 0, 100);

    // 1. Fetch Modrinth Version
    let url = format!(
        "https://api.modrinth.com/v2/project/{}/version",
        base_pack_id
    );
    let versions: Vec<ModrinthVersion> = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let latest_version = versions.into_iter().next().ok_or("No versions found")?;
    let mut files = latest_version.files;
    let pack_file = if let Some(idx) = files.iter().position(|f| f.primary) {
        files.remove(idx)
    } else {
        files.remove(0)
    };

    // 2. Setup Directories
    let app_dir = crate::db::get_portable_data_dir();
    let instance_dir = app_dir.join("instances").join(&instance_id);
    let original_dir = instance_dir.join("original");
    let workspace_dir = instance_dir.join("workspace");

    fs::create_dir_all(&original_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&workspace_dir).map_err(|e| e.to_string())?;

    // 3. Download .mrpack
    emit_progress("Downloading Basepack...", 10, 100);
    let mrpack_path = original_dir.join("basepack.mrpack");
    let mut resp = client
        .get(&pack_file.url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let mut out = fs::File::create(&mrpack_path).map_err(|e| e.to_string())?;
    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        io::Write::write_all(&mut out, &chunk).map_err(|e| e.to_string())?;
    }

    // 4. Extract .mrpack to workspace
    emit_progress("Extracting Workspace...", 20, 100);
    extract_zip(&mrpack_path, &workspace_dir)?;

    // 5. Parse modrinth.index.json
    let index_path = workspace_dir.join("modrinth.index.json");
    let index_data = fs::read_to_string(index_path).map_err(|e| e.to_string())?;
    let index: ModrinthIndex = serde_json::from_str(&index_data).map_err(|e| e.to_string())?;

    let mc_version = index
        .dependencies
        .get("minecraft")
        .cloned()
        .unwrap_or_else(|| "unknown".to_string());

    let mut loader = "unknown".to_string();
    if index.dependencies.contains_key("fabric-loader") {
        loader = "fabric".to_string();
    } else if index.dependencies.contains_key("forge") {
        loader = "forge".to_string();
    } else if index.dependencies.contains_key("quilt-loader") {
        loader = "quilt".to_string();
    } else if index.dependencies.contains_key("neoforge") {
        loader = "neoforge".to_string();
    }

    // 6. Download files (Mods/Resourcepacks)
    let total_files = index.files.len() as u32;
    emit_progress("Downloading Mods...", 0, total_files);

    // We will batch downloads to avoid "Too Many Open Files" or overwhelming network.
    // For simplicity here, we create futures and use chunking or join_all.
    // However, to emit progress as they finish, we can process them sequentially or use a bounded channel.
    // Let's do small batches for simplicity.

    let mut completed = 0;
    for chunk in index.files.chunks(5) {
        let mut tasks = Vec::new();
        for file in chunk {
            let dl_url = file.downloads.first().cloned().unwrap_or_default();
            let dest_path = instance_dir.join(&file.path);
            let client_clone = client.clone();

            // Extract env tags to save to DB
            let client_env = file
                .env
                .as_ref()
                .map(|e| e.client.clone())
                .unwrap_or_else(|| "required".to_string());
            let server_env = file
                .env
                .as_ref()
                .map(|e| e.server.clone())
                .unwrap_or_else(|| "required".to_string());
            let mod_id = file.path.clone();

            tasks.push(async move {
                if let Some(parent) = dest_path.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                if let Ok(mut r) = client_clone.get(&dl_url).send().await {
                    if let Ok(mut out) = fs::File::create(dest_path) {
                        while let Ok(Some(bytes)) = r.chunk().await {
                            let _ = io::Write::write_all(&mut out, &bytes);
                        }
                    }
                }
                (mod_id, client_env, server_env)
            });
        }

        let results = join_all(tasks).await;

        // Update DB with the downloaded mods
        let conn = state.db.lock().unwrap();
        for (mod_id, client_env, server_env) in results {
            let _ = conn.execute(
                "INSERT INTO instance_mods (instance_id, mod_id, mod_version_id, source, env_client, env_server) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![&instance_id, &mod_id, "latest", "modrinth", &client_env, &server_env],
            );
            completed += 1;
            emit_progress("Downloading Mods...", completed, total_files);
        }
    }

    // 7. Update final Instance state
    {
        let conn = state.db.lock().unwrap();
        let _ = conn.execute(
            "UPDATE instances SET mc_version = ?1, loader = ?2, status = 'Ready' WHERE id = ?3",
            params![&mc_version, &loader, &instance_id],
        );
    }

    emit_progress("Ready", total_files, total_files);

    Ok(())
}

fn extract_zip(archive_path: &Path, extract_to: &Path) -> Result<(), String> {
    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = match file.enclosed_name() {
            Some(path) => extract_to.join(path),
            None => continue,
        };

        if (*file.name()).ends_with('/') {
            fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p).map_err(|e| e.to_string())?;
                }
            }
            let mut outfile = fs::File::create(&outpath).map_err(|e| e.to_string())?;
            io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_modrinth_index() {
        let json_data = r#"{
            "formatVersion": 1,
            "game": "minecraft",
            "versionId": "1.0.0",
            "name": "Test Pack",
            "dependencies": {
                "minecraft": "1.20.1",
                "fabric-loader": "0.14.21"
            },
            "files": [
                {
                    "path": "mods/sodium.jar",
                    "downloads": ["https://cdn.modrinth.com/data/sodium.jar"],
                    "env": {
                        "client": "required",
                        "server": "unsupported"
                    }
                }
            ]
        }"#;

        let index: ModrinthIndex = serde_json::from_str(json_data).expect("Failed to parse index");

        assert_eq!(index.dependencies.get("minecraft").unwrap(), "1.20.1");
        assert_eq!(index.dependencies.get("fabric-loader").unwrap(), "0.14.21");

        assert_eq!(index.files.len(), 1);
        assert_eq!(index.files[0].path, "mods/sodium.jar");
        assert_eq!(index.files[0].env.as_ref().unwrap().client, "required");
        assert_eq!(index.files[0].env.as_ref().unwrap().server, "unsupported");
    }
}
