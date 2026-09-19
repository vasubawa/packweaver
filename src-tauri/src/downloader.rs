use crate::installer;
use crate::AppState;
use reqwest::Client;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager};

/// Per-instance install lock to prevent overlapping create/rebuild.
fn install_locks() -> &'static Mutex<std::collections::HashSet<String>> {
    static LOCKS: OnceLock<Mutex<std::collections::HashSet<String>>> = OnceLock::new();
    LOCKS.get_or_init(|| Mutex::new(std::collections::HashSet::new()))
}

pub struct InstallGuard {
    id: String,
}

impl InstallGuard {
    pub fn acquire(instance_id: &str) -> Result<Self, String> {
        let mut locks = install_locks()
            .lock()
            .map_err(|_| "Install lock poisoned".to_string())?;
        if !locks.insert(instance_id.to_string()) {
            return Err("An install/rebuild is already running for this pack".to_string());
        }
        Ok(Self {
            id: instance_id.to_string(),
        })
    }
}

impl Drop for InstallGuard {
    fn drop(&mut self) {
        if let Ok(mut locks) = install_locks().lock() {
            locks.remove(&self.id);
        }
    }
}

#[derive(Serialize, Clone)]
pub struct ProgressEvent {
    pub instance_id: String,
    pub status: String,
    pub progress: u32,
    pub total: u32,
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

fn http_client() -> Result<Client, String> {
    Client::builder()
        .user_agent("packweaver/0.1.0 (packweaver-app)")
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())
}

/// Install (or rebuild) base pack into workspace, then re-layer enabled custom mods.
pub async fn run_pipeline(
    app: AppHandle,
    _state: tauri::State<'_, AppState>,
    instance_id: String,
    base_pack_id: String,
    source: String,
) -> Result<(), String> {
    let _guard = InstallGuard::acquire(&instance_id)?;

    let client = http_client()?;

    let emit = |status: &str, p: u32, t: u32| {
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

    let (base_pack_version_id, preserve_enabled): (
        String,
        std::collections::HashMap<String, (bool, bool)>,
    ) = with_db(&app, |conn| {
        let version = conn
            .query_row(
                "SELECT base_pack_version_id FROM instances WHERE id = ?1",
                params![&instance_id],
                |row| row.get::<_, String>(0),
            )
            .map_err(|e| e.to_string())?;

        // Preserve user enable flags for base mods across rebuild
        let mut map = std::collections::HashMap::new();
        if let Ok(mut stmt) = conn.prepare(
            "SELECT mod_id, enabled_client, enabled_server FROM instance_mods WHERE instance_id = ?1 AND is_base = 1",
        ) {
            if let Ok(rows) = stmt.query_map([&instance_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, bool>(1)?,
                    row.get::<_, bool>(2)?,
                ))
            }) {
                for r in rows.flatten() {
                    map.insert(r.0, (r.1, r.2));
                }
            }
        }
        Ok((version, map))
    })?;

    let app_dir = crate::db::get_portable_data_dir();
    let instance_dir = app_dir.join("instances").join(&instance_id);
    let original_dir = instance_dir.join("original");

    fs::create_dir_all(&original_dir).map_err(|e| e.to_string())?;

    let fetcher: Box<dyn crate::fetchers::BasePackFetcher> = match source.as_str() {
        "local" => Box::new(crate::fetchers::LocalFetcher),
        "modrinth" => Box::new(crate::fetchers::ModrinthFetcher::new(client.clone())),
        _ => return Err(format!("Unsupported source: {}", source)),
    };

    emit("Fetching base pack...", 5, 100);
    let archive_path = fetcher
        .fetch_to_original(
            &app,
            &instance_id,
            &base_pack_id,
            &base_pack_version_id,
            &original_dir,
        )
        .await?;

    let original_filename = archive_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("basepack.mrpack")
        .to_string();

    with_db(&app, |conn| {
        conn.execute(
            "UPDATE instances SET original_filename = ?1, status = 'Installing...' WHERE id = ?2",
            params![&original_filename, &instance_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })?;

    let stem = stem_from_filename(&original_filename);
    let client_root = client_workspace_root(&instance_id);
    // Wipe side root so a renamed stem doesn't leave an old tree behind.
    let _ = installer::wipe_dir(&client_root);
    // Drop legacy flat workspace/mods (pre client/server layout).
    for legacy in ["mods", "config", "resourcepacks", "shaderpacks"] {
        let p = instance_dir.join("workspace").join(legacy);
        if p.exists() {
            let _ = installer::wipe_dir(&p);
        }
    }
    let workspace_dir = client_root.join(&stem);

    emit("Installing into workspace...", 20, 100);
    let install_result =
        installer::install_mrpack_client(&client, &archive_path, &workspace_dir).await;

    let (installed, mc_version, loader) = match install_result {
        Ok(v) => v,
        Err(e) => {
            let _ = installer::wipe_dir(&workspace_dir);
            return Err(e);
        }
    };

    // Replace base mod rows; keep customs
    with_db(&app, |conn| {
        conn.execute(
            "DELETE FROM instance_mods WHERE instance_id = ?1 AND is_base = 1",
            params![&instance_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })?;

    let hashes: Vec<String> = installed.iter().filter_map(|f| f.sha1.clone()).collect();
    let enrichment = fetch_modrinth_enrichment(&client, &hashes).await;

    // Remove disabled base jars from workspace (install put all client-capable files)
    for file in &installed {
        let (ec, es) = preserve_enabled
            .get(&file.mod_id)
            .copied()
            .unwrap_or((file.enabled_client, file.enabled_server));

        let (name, version, author, description, icon_url) =
            if let Some(en) = file.sha1.as_ref().and_then(|s| enrichment.get(s)) {
                (
                    en.name.clone(),
                    en.version.clone(),
                    en.author.clone(),
                    en.description.clone(),
                    en.icon_url.clone(),
                )
            } else {
                let jar_meta = crate::jar_inspector::inspect_jar(&file.dest_path);
                let default_name = file
                    .mod_id
                    .rsplit('/')
                    .next()
                    .unwrap_or(&file.mod_id)
                    .to_string();
                (
                    jar_meta.name.unwrap_or(default_name),
                    jar_meta.version.unwrap_or_else(|| "unknown".to_string()),
                    jar_meta.author,
                    jar_meta.description,
                    None,
                )
            };

        if !ec {
            installer::remove_mod_file_from_workspace(
                &workspace_dir,
                Some(&file.file_path),
                &file.mod_id,
            );
        }

        with_db(&app, |conn| {
            conn.execute(
                "INSERT INTO instance_mods (instance_id, mod_id, name, mod_version_id, file_name, source, is_base, enabled, enabled_client, enabled_server, side, icon_url, author, description)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
                 ON CONFLICT(instance_id, mod_id) DO UPDATE SET
                    name=excluded.name,
                    mod_version_id=excluded.mod_version_id,
                    file_name=excluded.file_name,
                    source=excluded.source,
                    is_base=1,
                    enabled=excluded.enabled,
                    enabled_client=excluded.enabled_client,
                    enabled_server=excluded.enabled_server,
                    side=excluded.side,
                    icon_url=excluded.icon_url,
                    author=excluded.author,
                    description=excluded.description",
                params![
                    &instance_id,
                    &file.mod_id,
                    &name,
                    &version,
                    &file.file_path,
                    "modrinth",
                    ec,
                    ec,
                    es,
                    &file.side,
                    icon_url.unwrap_or_default(),
                    author.unwrap_or_default(),
                    description.unwrap_or_default(),
                ],
            )
            .map_err(|e| e.to_string())?;
            Ok(())
        })?;
    }

    // Local plain zip: scan mods dir for base entries if index was empty
    if installed.is_empty() {
        let mods_dir = workspace_dir.join("mods");
        if mods_dir.is_dir() {
            if let Ok(entries) = fs::read_dir(&mods_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if !path.is_file() {
                        continue;
                    }
                    let Some(file_name) = path.file_name().and_then(|n| n.to_str()) else {
                        continue;
                    };
                    let jar_meta = crate::jar_inspector::inspect_jar(&path);
                    let name = jar_meta.name.unwrap_or_else(|| file_name.to_string());
                    let version = jar_meta.version.unwrap_or_else(|| "local".to_string());
                    let (ec, es) = preserve_enabled
                        .get(file_name)
                        .copied()
                        .unwrap_or((true, true));
                    if !ec {
                        let _ = fs::remove_file(&path);
                    }
                    with_db(&app, |conn| {
                        conn.execute(
                            "INSERT INTO instance_mods (instance_id, mod_id, name, mod_version_id, file_name, source, is_base, enabled, enabled_client, enabled_server, side, author, description)
                             VALUES (?1, ?2, ?3, ?4, ?5, 'local', 1, ?6, ?7, ?8, 'both', ?9, ?10)
                             ON CONFLICT(instance_id, mod_id) DO UPDATE SET
                                name=excluded.name, mod_version_id=excluded.mod_version_id, file_name=excluded.file_name,
                                is_base=1, enabled=excluded.enabled, enabled_client=excluded.enabled_client, enabled_server=excluded.enabled_server",
                            params![
                                &instance_id,
                                file_name,
                                &name,
                                &version,
                                file_name,
                                ec,
                                ec,
                                es,
                                jar_meta.author.unwrap_or_default(),
                                jar_meta.description.unwrap_or_default(),
                            ],
                        )
                        .map_err(|e| e.to_string())?;
                        Ok(())
                    })?;
                }
            }
        }
    }

    emit("Layering custom mods...", 80, 100);
    layer_custom_mods(&app, &client, &instance_id, &workspace_dir, false).await?;

    with_db(&app, |conn| {
        conn.execute(
            "UPDATE instances SET mc_version = ?1, loader = ?2, status = 'Ready' WHERE id = ?3",
            params![&mc_version, &loader, &instance_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })?;

    emit("Ready", 100, 100);
    Ok(())
}

/// Download/copy one custom mod into `workspace_dir/mods`.
async fn place_custom_mod(
    app: &AppHandle,
    client: &Client,
    instance_id: &str,
    workspace_dir: &Path,
    mod_id: &str,
    source: &str,
    file_name: &str,
    mod_version_id: &str,
    source_path: &str,
) -> Result<(), String> {
    let mods_dir = workspace_dir.join("mods");
    fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;
    installer::remove_mod_file_from_workspace(workspace_dir, Some(file_name), mod_id);

    match source {
        "modrinth" => {
            let version_json: serde_json::Value = if !mod_version_id.is_empty()
                && mod_version_id != "latest"
                && !mod_version_id.contains('.')
            {
                let url = format!("https://api.modrinth.com/v2/version/{}", mod_version_id);
                client
                    .get(&url)
                    .send()
                    .await
                    .map_err(|e| e.to_string())?
                    .error_for_status()
                    .map_err(|e| e.to_string())?
                    .json()
                    .await
                    .map_err(|e| e.to_string())?
            } else {
                let url = format!("https://api.modrinth.com/v2/project/{}/version", mod_id);
                let versions: Vec<serde_json::Value> = client
                    .get(&url)
                    .send()
                    .await
                    .map_err(|e| e.to_string())?
                    .error_for_status()
                    .map_err(|e| e.to_string())?
                    .json()
                    .await
                    .map_err(|e| e.to_string())?;
                versions
                    .into_iter()
                    .next()
                    .ok_or_else(|| format!("No versions for {}", mod_id))?
            };

            let files = version_json["files"]
                .as_array()
                .ok_or_else(|| format!("No files for {}", mod_id))?;
            let file = files
                .iter()
                .find(|f| f["primary"].as_bool().unwrap_or(false))
                .or_else(|| files.first())
                .ok_or_else(|| format!("No file for {}", mod_id))?;
            let url = file["url"]
                .as_str()
                .ok_or_else(|| format!("No URL for {}", mod_id))?;
            let fname = file["filename"].as_str().unwrap_or("mod.jar").to_string();
            let dest = mods_dir.join(&fname);

            let mut resp = client
                .get(url)
                .send()
                .await
                .map_err(|e| e.to_string())?
                .error_for_status()
                .map_err(|e| e.to_string())?;
            let mut out = fs::File::create(&dest).map_err(|e| e.to_string())?;
            while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
                io::Write::write_all(&mut out, &chunk).map_err(|e| e.to_string())?;
            }

            with_db(app, |conn| {
                conn.execute(
                    "UPDATE instance_mods SET file_name = ?1 WHERE instance_id = ?2 AND mod_id = ?3",
                    params![&fname, instance_id, mod_id],
                )
                .map_err(|e| e.to_string())?;
                Ok(())
            })?;
        }
        "local" => {
            let src = if !source_path.is_empty() {
                Path::new(source_path).to_path_buf()
            } else if Path::new(file_name).is_absolute() || file_name.contains(':') {
                Path::new(file_name).to_path_buf()
            } else {
                return Err(format!("Local mod {} has no source path", mod_id));
            };
            let canonical = src
                .canonicalize()
                .map_err(|e| format!("Invalid local mod {}: {}", mod_id, e))?;
            let leaf = canonical
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or("Invalid filename")?
                .to_string();
            let dest = mods_dir.join(&leaf);
            fs::copy(&canonical, &dest).map_err(|e| e.to_string())?;
            with_db(app, |conn| {
                conn.execute(
                    "UPDATE instance_mods SET file_name = ?1, source_path = ?2 WHERE instance_id = ?3 AND mod_id = ?4",
                    params![
                        &leaf,
                        canonical.to_string_lossy().as_ref(),
                        instance_id,
                        mod_id
                    ],
                )
                .map_err(|e| e.to_string())?;
                Ok(())
            })?;
        }
        other => {
            return Err(format!("Unsupported custom mod source: {}", other));
        }
    }
    Ok(())
}

/// Download/copy enabled custom mods into `{side}/{stem}/mods` (force refresh).
/// `for_server` uses `enabled_server` and targets `workspace/server/{stem}/`.
pub async fn layer_custom_mods(
    app: &AppHandle,
    client: &Client,
    instance_id: &str,
    workspace_dir: &Path,
    for_server: bool,
) -> Result<u32, String> {
    let enabled_col = if for_server {
        "enabled_server"
    } else {
        "enabled_client"
    };
    let sql = format!(
        "SELECT mod_id, source, file_name, mod_version_id, COALESCE(source_path, '')
         FROM instance_mods
         WHERE instance_id = ?1 AND is_base = 0 AND {} = 1",
        enabled_col
    );
    let customs: Vec<(String, String, String, String, String)> = with_db(app, |conn| {
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([instance_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        Ok(rows.flatten().collect())
    })?;

    let mut count = 0u32;
    for (mod_id, source, file_name, mod_version_id, source_path) in customs {
        place_custom_mod(
            app,
            client,
            instance_id,
            workspace_dir,
            &mod_id,
            &source,
            &file_name,
            &mod_version_id,
            &source_path,
        )
        .await?;
        count += 1;
    }

    Ok(count)
}

pub fn zip_workspace(workspace_dir: &Path, dest_zip: &Path) -> Result<(), String> {
    if !workspace_dir.exists() {
        return Err("Workspace not found — rebuild the pack first".to_string());
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
    ) -> Result<(), String> {
        for entry in fs::read_dir(current).map_err(|e| e.to_string())?.flatten() {
            let path = entry.path();
            let name_str = entry.file_name().to_string_lossy().to_string();
            if path.is_dir() {
                add_dir(zip_writer, options, base, &path)?;
                continue;
            }
            if name_str == "modrinth.index.json"
                || name_str.ends_with(".disabled")
                || name_str == "overrides"
            {
                continue;
            }
            let rel = path
                .strip_prefix(base)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            if rel.starts_with("overrides/")
                || rel.starts_with("client-overrides/")
                || rel.starts_with("server-overrides/")
            {
                continue;
            }
            zip_writer
                .start_file(&rel, options)
                .map_err(|e| e.to_string())?;
            let mut f = fs::File::open(&path).map_err(|e| e.to_string())?;
            io::copy(&mut f, zip_writer).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    add_dir(&mut zip_writer, options, workspace_dir, workspace_dir)?;
    zip_writer.finish().map_err(|e| e.to_string())?;
    Ok(())
}

/// Sanitize archive / instance name into a filesystem-safe stem.
pub fn stem_from_filename(name: &str) -> String {
    let stem = name
        .trim_end_matches(".mrpack")
        .trim_end_matches(".zip")
        .trim_end_matches(".MRPACK")
        .trim_end_matches(".ZIP");
    let safe: String = stem
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '-'
            }
        })
        .collect();
    if safe.is_empty() {
        "pack".to_string()
    } else {
        safe
    }
}

pub fn instance_dir(instance_id: &str) -> std::path::PathBuf {
    crate::db::get_portable_data_dir()
        .join("instances")
        .join(instance_id)
}

/// `workspace/client` — wiped on client rebuild (clears old stems).
pub fn client_workspace_root(instance_id: &str) -> std::path::PathBuf {
    instance_dir(instance_id).join("workspace").join("client")
}

/// `workspace/server` — wiped on server rebuild.
pub fn server_workspace_root(instance_id: &str) -> std::path::PathBuf {
    instance_dir(instance_id).join("workspace").join("server")
}

/// Install / export root: `workspace/client/{stem}/`.
pub fn client_workspace_dir(
    app: &AppHandle,
    instance_id: &str,
) -> Result<std::path::PathBuf, String> {
    Ok(client_workspace_root(instance_id).join(original_stem(app, instance_id)?))
}

/// Install / export root: `workspace/server/{stem}/`.
pub fn server_workspace_dir(
    app: &AppHandle,
    instance_id: &str,
) -> Result<std::path::PathBuf, String> {
    Ok(server_workspace_root(instance_id).join(original_stem(app, instance_id)?))
}

pub fn original_stem(app: &AppHandle, instance_id: &str) -> Result<String, String> {
    with_db(app, |conn| {
        let name: String = conn
            .query_row(
                "SELECT COALESCE(NULLIF(original_filename, ''), name) FROM instances WHERE id = ?1",
                [instance_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok(stem_from_filename(&name))
    })
}

fn original_archive_path(
    instance_id: &str,
    original_filename: &str,
) -> Result<std::path::PathBuf, String> {
    let original_dir = crate::db::get_portable_data_dir()
        .join("instances")
        .join(instance_id)
        .join("original");
    if !original_filename.is_empty() {
        let p = original_dir.join(original_filename);
        if p.is_file() {
            return Ok(p);
        }
    }
    // Fallback: first file in original/
    if let Ok(entries) = fs::read_dir(&original_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                return Ok(p);
            }
        }
    }
    Err("Original base pack archive not found — rebuild the pack".to_string())
}

/// Re-download / re-extract a single base mod into the client workspace.
pub async fn ensure_base_mod_in_workspace(
    app: &AppHandle,
    instance_id: &str,
    mod_id: &str,
    file_name: &str,
) -> Result<(), String> {
    let original_filename: String = with_db(app, |conn| {
        conn.query_row(
            "SELECT COALESCE(original_filename, '') FROM instances WHERE id = ?1",
            [instance_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())
    })?;
    let workspace_dir = client_workspace_dir(app, instance_id)?;

    fs::create_dir_all(workspace_dir.join("mods")).map_err(|e| e.to_string())?;
    let archive = original_archive_path(instance_id, &original_filename)?;
    let client = http_client()?;

    if installer::redownload_index_file(&client, &archive, &workspace_dir, mod_id, file_name)
        .await?
    {
        return Ok(());
    }

    if installer::extract_named_jar_from_zip(&archive, &workspace_dir, mod_id, file_name)? {
        return Ok(());
    }

    Err(format!(
        "Could not restore base mod {} — try Rebuild workspace",
        mod_id
    ))
}

/// Apply enable change to client or server workspace disk.
pub async fn apply_mod_enabled(
    app: &AppHandle,
    instance_id: &str,
    mod_id: &str,
    enabled: bool,
    side: &str,
) -> Result<(), String> {
    let for_server = side == "server";
    let (is_base, file_name, source, source_path, mod_version_id): (
        bool,
        String,
        String,
        String,
        String,
    ) = with_db(app, |conn| {
        conn.query_row(
            "SELECT is_base, COALESCE(file_name, ''), source, COALESCE(source_path, ''), COALESCE(mod_version_id, '')
             FROM instance_mods WHERE instance_id = ?1 AND mod_id = ?2",
            params![instance_id, mod_id],
            |row| {
                Ok((
                    row.get::<_, bool>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            },
        )
        .map_err(|e| e.to_string())
    })?;

    let workspace_dir = if for_server {
        server_workspace_dir(app, instance_id)?
    } else {
        client_workspace_dir(app, instance_id)?
    };

    if !enabled {
        installer::remove_mod_file_from_workspace(&workspace_dir, Some(&file_name), mod_id);
        return Ok(());
    }

    if !workspace_dir.exists() {
        return Err(if for_server {
            "Server workspace not found — rebuild server first".to_string()
        } else {
            "Workspace not found — rebuild the pack first".to_string()
        });
    }

    if is_base {
        if for_server {
            let original_filename: String = with_db(app, |conn| {
                conn.query_row(
                    "SELECT COALESCE(original_filename, '') FROM instances WHERE id = ?1",
                    [instance_id],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())
            })?;
            let archive = original_archive_path(instance_id, &original_filename)?;
            let http = http_client()?;
            if !installer::redownload_index_file(
                &http,
                &archive,
                &workspace_dir,
                mod_id,
                &file_name,
            )
            .await?
                && !installer::extract_named_jar_from_zip(
                    &archive,
                    &workspace_dir,
                    mod_id,
                    &file_name,
                )?
            {
                return Err(format!(
                    "Could not restore base mod {} on server — rebuild server workspace",
                    mod_id
                ));
            }
        } else {
            ensure_base_mod_in_workspace(app, instance_id, mod_id, &file_name).await?;
        }
    } else {
        let http = http_client()?;
        place_custom_mod(
            app,
            &http,
            instance_id,
            &workspace_dir,
            mod_id,
            &source,
            &file_name,
            &mod_version_id,
            &source_path,
        )
        .await?;
    }
    Ok(())
}

/// Rebuild workspace/server/{stem} from original archive + enabled_server customs.
pub async fn run_server_pipeline(app: AppHandle, instance_id: String) -> Result<(), String> {
    let _guard = InstallGuard::acquire(&instance_id)?;
    let client = http_client()?;

    let emit = |status: &str, p: u32, t: u32| {
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

    let preserve_server: std::collections::HashMap<String, bool> = with_db(&app, |conn| {
        let mut map = std::collections::HashMap::new();
        if let Ok(mut stmt) =
            conn.prepare("SELECT mod_id, enabled_server FROM instance_mods WHERE instance_id = ?1")
        {
            if let Ok(rows) = stmt.query_map([&instance_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, bool>(1)?))
            }) {
                for r in rows.flatten() {
                    map.insert(r.0, r.1);
                }
            }
        }
        Ok(map)
    })?;

    let original_filename: String = with_db(&app, |conn| {
        conn.query_row(
            "SELECT COALESCE(original_filename, '') FROM instances WHERE id = ?1",
            [&instance_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())
    })?;

    let archive = original_archive_path(&instance_id, &original_filename)?;
    let stem = stem_from_filename(&original_filename);
    let server_root = server_workspace_root(&instance_id);
    let _ = installer::wipe_dir(&server_root);
    // Drop legacy sibling folder from pre-nested layout.
    let legacy_server = instance_dir(&instance_id).join("server-workspace");
    if legacy_server.exists() {
        let _ = installer::wipe_dir(&legacy_server);
    }
    let server_dir = server_root.join(&stem);

    emit("Installing server workspace...", 20, 100);
    let (installed, _mc, _loader) =
        installer::install_mrpack_server(&client, &archive, &server_dir).await?;

    for file in &installed {
        let es = preserve_server
            .get(&file.mod_id)
            .copied()
            .unwrap_or(file.enabled_server);
        if !es {
            installer::remove_mod_file_from_workspace(
                &server_dir,
                Some(&file.file_path),
                &file.mod_id,
            );
        }
        // Upsert server-only / both base rows without wiping client fields
        with_db(&app, |conn| {
            let exists: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM instance_mods WHERE instance_id = ?1 AND mod_id = ?2",
                    params![&instance_id, &file.mod_id],
                    |row| row.get(0),
                )
                .unwrap_or(0);
            if exists == 0 {
                let _ = conn.execute(
                    "INSERT INTO instance_mods (instance_id, mod_id, name, mod_version_id, file_name, source, is_base, enabled, enabled_client, enabled_server, side)
                     VALUES (?1, ?2, ?3, 'unknown', ?4, 'modrinth', 1, 0, 0, ?5, ?6)",
                    params![
                        &instance_id,
                        &file.mod_id,
                        &file.mod_id,
                        &file.file_path,
                        es,
                        &file.side,
                    ],
                );
            } else {
                let _ = conn.execute(
                    "UPDATE instance_mods SET enabled_server = ?1, side = COALESCE(NULLIF(side, ''), ?2), file_name = COALESCE(NULLIF(file_name, ''), ?3)
                     WHERE instance_id = ?4 AND mod_id = ?5",
                    params![es, &file.side, &file.file_path, &instance_id, &file.mod_id],
                );
            }
            Ok(())
        })?;
    }

    emit("Layering server custom mods...", 80, 100);
    layer_custom_mods(&app, &client, &instance_id, &server_dir, true).await?;

    emit("Server Ready", 100, 100);
    Ok(())
}
