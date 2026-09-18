use crate::AppState;
use futures::future::join_all;
use reqwest::Client;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Serialize, Clone)]
pub struct ProgressEvent {
    pub instance_id: String,
    pub status: String,
    pub progress: u32,
    pub total: u32,
}

#[derive(Deserialize, Debug)]
struct ModrinthIndex {
    dependencies: std::collections::HashMap<String, String>,
    files: Vec<ModrinthFile>,
}

#[derive(Deserialize, Debug)]
struct ModrinthFile {
    path: String,
    hashes: Option<std::collections::HashMap<String, String>>,
    downloads: Vec<String>,
    env: Option<ModrinthEnv>,
}

#[derive(Deserialize, Debug)]
struct ModrinthEnv {
    client: String,
}

#[derive(Deserialize, Debug)]
struct ModrinthVersionInfo {
    project_id: String,
    version_number: String,
}

#[derive(Deserialize, Debug)]
struct ModrinthProjectInfo {
    id: String,
    title: String,
    description: Option<String>,
    icon_url: Option<String>,
    organization: Option<String>,
}

#[derive(Clone, Debug, Default)]
struct ModEnrichment {
    name: String,
    version: String,
    author: Option<String>,
    description: Option<String>,
    icon_url: Option<String>,
}

async fn fetch_modrinth_enrichment(
    client: &Client,
    hashes: &[String],
) -> std::collections::HashMap<String, ModEnrichment> {
    let mut map = std::collections::HashMap::new();
    if hashes.is_empty() {
        return map;
    }

    let payload = serde_json::json!({
        "hashes": hashes,
        "algorithm": "sha1"
    });

    let version_resp = match client
        .post("https://api.modrinth.com/v2/version_files")
        .json(&payload)
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => return map,
    };

    let version_map: std::collections::HashMap<String, ModrinthVersionInfo> =
        match version_resp.json().await {
            Ok(v) => v,
            Err(_) => return map,
        };

    let mut project_ids: Vec<String> = version_map.values().map(|v| v.project_id.clone()).collect();
    project_ids.sort();
    project_ids.dedup();

    if project_ids.is_empty() {
        return map;
    }

    let proj_json_str = match serde_json::to_string(&project_ids) {
        Ok(s) => s,
        Err(_) => return map,
    };

    let mut proj_url = match url::Url::parse("https://api.modrinth.com/v2/projects") {
        Ok(u) => u,
        Err(_) => return map,
    };
    proj_url
        .query_pairs_mut()
        .append_pair("ids", &proj_json_str);

    let proj_resp = match client.get(proj_url.as_str()).send().await {
        Ok(r) => r,
        Err(_) => return map,
    };

    let projects: Vec<ModrinthProjectInfo> = match proj_resp.json().await {
        Ok(p) => p,
        Err(_) => return map,
    };

    let project_map: std::collections::HashMap<String, ModrinthProjectInfo> =
        projects.into_iter().map(|p| (p.id.clone(), p)).collect();

    for (sha1, v_info) in version_map {
        if let Some(p_info) = project_map.get(&v_info.project_id) {
            map.insert(
                sha1,
                ModEnrichment {
                    name: p_info.title.clone(),
                    version: v_info.version_number.clone(),
                    author: p_info.organization.clone(),
                    description: p_info.description.clone(),
                    icon_url: p_info.icon_url.clone(),
                },
            );
        }
    }

    map
}

fn with_db<F, T>(app: &AppHandle, f: F) -> Result<T, String>
where
    F: FnOnce(&rusqlite::Connection) -> Result<T, String>,
{
    let state = app.state::<AppState>();
    let conn = state
        .db
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())?;
    f(&conn)
}

pub async fn run_pipeline(
    app: AppHandle,
    _state: tauri::State<'_, AppState>,
    instance_id: String,
    base_pack_id: String,
    source: String,
) -> Result<(), String> {
    let client = Client::builder()
        .user_agent("packweaver/0.1.0 (packweaver-app)")
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(120))
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

    let base_pack_version_id = with_db(&app, |conn| {
        conn.query_row(
            "SELECT base_pack_version_id FROM instances WHERE id = ?1",
            params![&instance_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|e| e.to_string())
    })?;

    // 2. Setup Directories
    let app_dir = crate::db::get_portable_data_dir();
    let instance_dir = app_dir.join("instances").join(&instance_id);
    let original_dir = instance_dir.join("original");
    let workspace_dir = instance_dir.join("workspace");

    fs::create_dir_all(&original_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&workspace_dir).map_err(|e| e.to_string())?;

    let mrpack_path = original_dir.join("basepack.mrpack");

    let fetcher: Box<dyn crate::fetchers::BasePackFetcher> = match source.as_str() {
        "local" => Box::new(crate::fetchers::LocalFetcher),
        "modrinth" => Box::new(crate::fetchers::ModrinthFetcher::new(client.clone())),
        _ => return Err(format!("Unsupported source: {}", source)),
    };

    fetcher
        .fetch(
            &app,
            &instance_id,
            &base_pack_id,
            &base_pack_version_id,
            &mrpack_path,
        )
        .await?;

    // 4. Extract .mrpack to workspace
    emit_progress("Extracting Workspace...", 20, 100);
    extract_zip(&mrpack_path, &workspace_dir)?;

    // 5. Parse modrinth.index.json if present
    let index_path = workspace_dir.join("modrinth.index.json");
    if index_path.exists() {
        let index_data = fs::read_to_string(index_path).map_err(|e| e.to_string())?;
        let index: ModrinthIndex = serde_json::from_str(&index_data).map_err(|e| e.to_string())?;

        let mc_version = index
            .dependencies
            .get("minecraft")
            .cloned()
            .unwrap_or_else(|| "1.20.1".to_string());

        let mut loader = "fabric".to_string();
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

        let sha1_hashes: Vec<String> = index
            .files
            .iter()
            .filter_map(|f| f.hashes.as_ref()?.get("sha1").cloned())
            .collect();

        let enrichment_map = fetch_modrinth_enrichment(&client, &sha1_hashes).await;

        let mut completed = 0;
        for chunk in index.files.chunks(5) {
            let mut tasks = Vec::new();
            for file in chunk {
                // Extract project ID from download URL if possible
                let mut mod_id = file.path.clone();
                let dl_url = file.downloads.first().cloned().unwrap_or_default();

                if let Ok(parsed_url) = url::Url::parse(&dl_url) {
                    if parsed_url.host_str() == Some("cdn.modrinth.com") {
                        // format is usually: /data/PROJECT_ID/versions/...
                        let segments: Vec<&str> = parsed_url
                            .path_segments()
                            .unwrap_or("".split('/'))
                            .collect();
                        if segments.len() >= 2 && segments[0] == "data" {
                            mod_id = segments[1].to_string();
                        }
                    }
                }

                let file_path = file.path.clone();
                let sha1 = file.hashes.as_ref().and_then(|h| h.get("sha1").cloned());

                let sha512 = file.hashes.as_ref().and_then(|h| h.get("sha512").cloned());

                let client_clone = client.clone();

                let enabled = file
                    .env
                    .as_ref()
                    .map(|e| e.client.clone())
                    .unwrap_or_else(|| "required".to_string())
                    != "unsupported";

                let workspace_dir_clone = workspace_dir.clone();

                tasks.push(async move {
                    let path_comp = std::path::Path::new(&file_path);
                    if path_comp.is_absolute()
                        || path_comp
                            .components()
                            .any(|c| matches!(c, std::path::Component::ParentDir))
                    {
                        return Err(format!("Invalid file path: {}", file_path));
                    }
                    let dest_path = workspace_dir_clone.join(path_comp);

                    if let Ok(parsed_url) = url::Url::parse(&dl_url) {
                        if parsed_url.host_str() != Some("cdn.modrinth.com") {
                            return Err(format!("Invalid download host: {}", dl_url));
                        }
                    } else {
                        return Err(format!("Invalid URL: {}", dl_url));
                    }

                    if let Some(parent) = dest_path.parent() {
                        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                    }

                    let mut r = client_clone
                        .get(&dl_url)
                        .send()
                        .await
                        .map_err(|e| e.to_string())?;
                    if !r.status().is_success() {
                        return Err(format!("Download failed with status: {}", r.status()));
                    }

                    use sha1::{Digest, Sha1};
                    use sha2::Sha512;

                    let mut hasher1 = Sha1::new();
                    let mut hasher512 = Sha512::new();

                    let mut out = fs::File::create(&dest_path).map_err(|e| e.to_string())?;
                    while let Some(bytes) = r.chunk().await.map_err(|e| e.to_string())? {
                        io::Write::write_all(&mut out, &bytes).map_err(|e| e.to_string())?;
                        hasher1.update(&bytes);
                        hasher512.update(&bytes);
                    }

                    if let Some(expected) = &sha1 {
                        let result: String = hasher1
                            .finalize()
                            .iter()
                            .map(|b| format!("{:02x}", b))
                            .collect();
                        if result != *expected {
                            let _ = fs::remove_file(&dest_path);
                            return Err(format!(
                                "SHA-1 mismatch: expected {}, got {}",
                                expected, result
                            ));
                        }
                    }
                    if let Some(expected) = &sha512 {
                        let result: String = hasher512
                            .finalize()
                            .iter()
                            .map(|b| format!("{:02x}", b))
                            .collect();
                        if result != *expected {
                            let _ = fs::remove_file(&dest_path);
                            return Err(format!(
                                "SHA-512 mismatch: expected {}, got {}",
                                expected, result
                            ));
                        }
                    }

                    Ok((mod_id, file_path, enabled, sha1, dest_path))
                });
            }

            let results = join_all(tasks).await;

            with_db(&app, |conn| {
                for res in results {
                    match res {
                        Ok((mod_id, file_path, enabled, sha1, dest_path)) => {
                            let (name, version, author, description, icon_url) =
                                if let Some(enrichment) =
                                    sha1.as_ref().and_then(|s| enrichment_map.get(s))
                                {
                                    (
                                        enrichment.name.clone(),
                                        enrichment.version.clone(),
                                        enrichment.author.clone(),
                                        enrichment.description.clone(),
                                        enrichment.icon_url.clone(),
                                    )
                                } else {
                                    let jar_meta = crate::jar_inspector::inspect_jar(&dest_path);
                                    let default_name =
                                        mod_id.rsplit('/').next().unwrap_or(&mod_id).to_string();
                                    (
                                        jar_meta.name.unwrap_or(default_name),
                                        jar_meta.version.unwrap_or_else(|| "latest".to_string()),
                                        jar_meta.author,
                                        jar_meta.description,
                                        None,
                                    )
                                };

                            if let Err(e) = conn.execute(
                                "INSERT INTO instance_mods (instance_id, mod_id, name, mod_version_id, file_name, source, is_base, enabled, icon_url, author, description)
                                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                                 ON CONFLICT(instance_id, mod_id) DO UPDATE SET
                                    name=COALESCE(NULLIF(excluded.name, ''), name),
                                    mod_version_id=COALESCE(NULLIF(excluded.mod_version_id, ''), mod_version_id),
                                    file_name=excluded.file_name,
                                    source=excluded.source,
                                    is_base=excluded.is_base,
                                    enabled=excluded.enabled,
                                    icon_url=COALESCE(NULLIF(excluded.icon_url, ''), icon_url),
                                    author=COALESCE(NULLIF(excluded.author, ''), author),
                                    description=COALESCE(NULLIF(excluded.description, ''), description)",
                                params![
                                    &instance_id,
                                    &mod_id,
                                    &name,
                                    &version,
                                    &file_path,
                                    "modrinth",
                                    1,
                                    enabled,
                                    icon_url.unwrap_or_default(),
                                    author.unwrap_or_default(),
                                    description.unwrap_or_default(),
                                ],
                            ) {
                                eprintln!("SQL ERROR in downloader: {}", e);
                                return Err(e.to_string());
                            }
                            completed += 1;
                            emit_progress("Downloading Mods...", completed, total_files);
                        }
                        Err(e) => {
                            eprintln!("Failed to download mod: {}", e);
                            return Err(e);
                        }
                    }
                }
                Ok(())
            })?;
        }

        // 7. Update final Instance state
        with_db(&app, |conn| {
            conn.execute(
                "UPDATE instances SET mc_version = ?1, loader = ?2, status = 'Ready' WHERE id = ?3",
                params![&mc_version, &loader, &instance_id],
            )
            .map_err(|e| e.to_string())?;
            Ok(())
        })?;

        emit_progress("Ready", total_files, total_files);
    } else {
        // Generic local zip/pack extraction
        let mods_dir = workspace_dir.join("mods");
        let mut mod_count = 0;

        with_db(&app, |conn| {
            if mods_dir.exists() && mods_dir.is_dir() {
                if let Ok(entries) = fs::read_dir(&mods_dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_file() {
                            if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                                let jar_meta = crate::jar_inspector::inspect_jar(&path);
                                let name = jar_meta.name.unwrap_or_else(|| file_name.to_string());
                                let version =
                                    jar_meta.version.unwrap_or_else(|| "local".to_string());

                                conn.execute(
                                    "INSERT INTO instance_mods (instance_id, mod_id, name, mod_version_id, file_name, source, is_base, enabled, icon_url, author, description)
                                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                                     ON CONFLICT(instance_id, mod_id) DO UPDATE SET
                                        name=excluded.name,
                                        mod_version_id=excluded.mod_version_id,
                                        file_name=excluded.file_name,
                                        source=excluded.source,
                                        is_base=excluded.is_base,
                                        enabled=excluded.enabled,
                                        icon_url=excluded.icon_url,
                                        author=excluded.author,
                                        description=excluded.description",
                                    params![
                                        &instance_id,
                                        file_name,
                                        &name,
                                        &version,
                                        file_name,
                                        "local",
                                        1,
                                        true,
                                        "",
                                        jar_meta.author.unwrap_or_default(),
                                        jar_meta.description.unwrap_or_default(),
                                    ],
                                )
                                .map_err(|e| e.to_string())?;
                                mod_count += 1;
                            }
                        }
                    }
                }
            }

            conn.execute(
                "UPDATE instances SET status = 'Ready' WHERE id = ?1",
                params![&instance_id],
            )
            .map_err(|e| e.to_string())?;
            Ok(())
        })?;

        emit_progress("Ready", mod_count, mod_count);
    }

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

/// Sync workspace jars with enabled flags, then count remaining mod files.
pub fn assemble_workspace(app: &AppHandle, instance_id: &str) -> Result<u32, String> {
    let workspace_dir = crate::db::get_portable_data_dir()
        .join("instances")
        .join(instance_id)
        .join("workspace");
    let mods_dir = workspace_dir.join("mods");
    fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;

    let mod_rows: Vec<(String, bool, Option<String>)> = with_db(app, |conn| {
        let mut stmt = conn
            .prepare("SELECT mod_id, enabled, file_name FROM instance_mods WHERE instance_id = ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([instance_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, bool>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for row in rows.flatten() {
            out.push(row);
        }
        Ok(out)
    })?;

    for (mod_id, enabled, file_name) in &mod_rows {
        let candidates = mod_jar_candidates(&mods_dir, mod_id, file_name.as_deref());
        if !enabled {
            for path in candidates {
                if path.exists() {
                    let _ = fs::remove_file(&path);
                }
            }
        }
    }

    let mut count = 0u32;
    if mods_dir.exists() {
        if let Ok(entries) = fs::read_dir(&mods_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    count += 1;
                }
            }
        }
    }
    Ok(count)
}

fn mod_jar_candidates(
    mods_dir: &Path,
    mod_id: &str,
    file_name: Option<&str>,
) -> Vec<std::path::PathBuf> {
    let mut paths = Vec::new();
    if let Some(name) = file_name.filter(|s| !s.is_empty()) {
        let leaf = name.split('/').next_back().unwrap_or(name);
        paths.push(mods_dir.join(leaf));
        // Relative paths stored as mods/foo.jar
        if name.contains('/') || name.contains('\\') {
            let workspace = mods_dir.parent().unwrap_or(mods_dir);
            paths.push(workspace.join(name.replace('/', std::path::MAIN_SEPARATOR_STR)));
        }
    }
    paths.push(mods_dir.join(format!("{}.jar", mod_id)));
    let id_leaf = mod_id.split('/').next_back().unwrap_or(mod_id);
    if id_leaf != mod_id {
        paths.push(mods_dir.join(id_leaf));
        if !id_leaf.ends_with(".jar") {
            paths.push(mods_dir.join(format!("{}.jar", id_leaf)));
        }
    }
    paths
}

pub fn zip_workspace(
    workspace_dir: &Path,
    dest_zip: &Path,
    skip_names: &[String],
) -> Result<(), String> {
    if !workspace_dir.exists() {
        return Err("Workspace not found — create or assemble the instance first".to_string());
    }

    if let Some(parent) = dest_zip.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let file = fs::File::create(dest_zip).map_err(|e| e.to_string())?;
    let mut zip_writer = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    fn add_dir(
        zip_writer: &mut zip::ZipWriter<fs::File>,
        options: zip::write::SimpleFileOptions,
        base: &Path,
        current: &Path,
        skip_names: &[String],
    ) -> Result<(), String> {
        let entries = fs::read_dir(current).map_err(|e| e.to_string())?;
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name();
            let name_str = name.to_string_lossy();

            if path.is_dir() {
                add_dir(zip_writer, options, base, &path, skip_names)?;
                continue;
            }

            // Skip disabled mod jars by leaf name
            if skip_names.iter().any(|s| s == name_str.as_ref()) {
                continue;
            }
            // Don't ship Modrinth index inside a plain client zip
            if name_str == "modrinth.index.json" {
                continue;
            }

            let rel = path
                .strip_prefix(base)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/");

            zip_writer
                .start_file(rel, options)
                .map_err(|e| e.to_string())?;
            let mut f = fs::File::open(&path).map_err(|e| e.to_string())?;
            io::copy(&mut f, zip_writer).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    add_dir(
        &mut zip_writer,
        options,
        workspace_dir,
        workspace_dir,
        skip_names,
    )?;
    zip_writer.finish().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn disabled_mod_leaf_names(app: &AppHandle, instance_id: &str) -> Result<Vec<String>, String> {
    with_db(app, |conn| {
        let mut stmt = conn
            .prepare(
                "SELECT mod_id, file_name FROM instance_mods
                 WHERE instance_id = ?1 AND enabled = 0",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([instance_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
            })
            .map_err(|e| e.to_string())?;
        let mut names = Vec::new();
        for row in rows.flatten() {
            let (mod_id, file_name) = row;
            if let Some(name) = file_name.filter(|s| !s.is_empty()) {
                names.push(name.split('/').next_back().unwrap_or(&name).to_string());
            }
            names.push(format!("{}.jar", mod_id));
            let leaf = mod_id.split('/').next_back().unwrap_or(&mod_id);
            names.push(leaf.to_string());
        }
        Ok(names)
    })
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
    }

    #[test]
    fn test_parse_modrinth_index_no_env() {
        let json_data = r#"{
            "dependencies": {},
            "files": [
                {
                    "path": "config/test.json",
                    "downloads": []
                }
            ]
        }"#;

        let index: ModrinthIndex = serde_json::from_str(json_data).expect("Failed to parse");
        assert_eq!(index.files.len(), 1);
        assert!(index.files[0].env.is_none());
    }

    #[test]
    fn test_parse_modrinth_index_invalid() {
        let json_data = r#"{
            "dependencies": {},
            "files": [
                {
                    "downloads": []
                }
            ]
        }"#;

        let res: Result<ModrinthIndex, _> = serde_json::from_str(json_data);
        assert!(res.is_err(), "Should fail if path is missing");
    }
}
