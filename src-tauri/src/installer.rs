//! Install a base pack into a Minecraft-instance-shaped workspace/.

use reqwest::Client;
use serde::Deserialize;
use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};
use zip::ZipArchive;

/// Hosts allowed for index file downloads (Modrinth CDN + common mirrors).
pub fn is_allowed_download_host(host: &str) -> bool {
    matches!(
        host,
        "cdn.modrinth.com" | "github.com" | "objects.githubusercontent.com" | "gitlab.com"
    ) || host.ends_with(".githubusercontent.com")
}

pub fn wipe_dir(path: &Path) -> Result<(), String> {
    if path.exists() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(path).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn safe_join(base: &Path, relative: &str) -> Result<PathBuf, String> {
    let rel = Path::new(relative);
    if rel.is_absolute() || rel.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(format!("Invalid relative path: {}", relative));
    }
    Ok(base.join(rel))
}

#[derive(Debug, Clone)]
pub struct InstalledFile {
    pub mod_id: String,
    pub file_path: String,
    pub enabled_client: bool,
    pub enabled_server: bool,
    pub side: String, // "client" | "server" | "both"
    pub sha1: Option<String>,
    pub dest_path: PathBuf,
}

#[derive(Deserialize, Debug)]
pub(crate) struct ModrinthIndex {
    dependencies: std::collections::HashMap<String, String>,
    files: Vec<ModrinthIndexFile>,
}

#[derive(Deserialize, Debug)]
struct ModrinthIndexFile {
    path: String,
    hashes: Option<std::collections::HashMap<String, String>>,
    downloads: Vec<String>,
    env: Option<ModrinthEnv>,
}

#[derive(Deserialize, Debug)]
struct ModrinthEnv {
    #[serde(default)]
    client: String,
    #[serde(default)]
    server: String,
}

fn env_supported(value: &str) -> bool {
    !value.is_empty() && value != "unsupported"
}

/// Read modrinth.index.json from an mrpack/zip without extracting the whole archive.
pub fn read_index_from_archive(
    archive_path: &Path,
) -> Result<Option<(String, ModrinthIndex)>, String> {
    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().replace('\\', "/");
        if name == "modrinth.index.json" || name.ends_with("/modrinth.index.json") {
            let mut data = String::new();
            io::Read::read_to_string(&mut entry, &mut data).map_err(|e| e.to_string())?;
            let index: ModrinthIndex = serde_json::from_str(&data).map_err(|e| e.to_string())?;
            return Ok(Some((data, index)));
        }
    }
    Ok(None)
}

/// Merge overrides/ and client-overrides/ from the archive into workspace root.
pub fn merge_client_overrides(archive_path: &Path, workspace: &Path) -> Result<(), String> {
    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().replace('\\', "/");
        if name.ends_with('/') {
            continue;
        }

        let stripped = if let Some(rest) = name.strip_prefix("overrides/") {
            rest
        } else if let Some(rest) = name.strip_prefix("client-overrides/") {
            rest
        } else {
            continue;
        };

        if stripped.is_empty() {
            continue;
        }

        let dest = safe_join(workspace, stripped)?;
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out = fs::File::create(&dest).map_err(|e| e.to_string())?;
        io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Download client-capable index files into workspace. Skips env.client == unsupported.
pub async fn download_index_files_client(
    client: &Client,
    index: &ModrinthIndex,
    workspace: &Path,
) -> Result<Vec<InstalledFile>, String> {
    let mut installed = Vec::new();

    for file in &index.files {
        let client_env = file
            .env
            .as_ref()
            .map(|e| e.client.as_str())
            .unwrap_or("required");
        let server_env = file
            .env
            .as_ref()
            .map(|e| e.server.as_str())
            .unwrap_or("required");

        if !env_supported(client_env) {
            continue; // server-only — skip client workspace
        }

        let enabled_client = true; // optional included by default
        let enabled_server = env_supported(server_env);
        let side = match (env_supported(client_env), enabled_server) {
            (true, true) => "both",
            (true, false) => "client",
            (false, true) => "server",
            _ => "client",
        };

        let dl_url = file
            .downloads
            .first()
            .cloned()
            .ok_or_else(|| format!("No download URL for {}", file.path))?;

        let parsed = url::Url::parse(&dl_url).map_err(|e| e.to_string())?;
        let host = parsed.host_str().unwrap_or("");
        if !is_allowed_download_host(host) {
            return Err(format!("Invalid download host: {}", dl_url));
        }

        let mut mod_id = file.path.clone();
        if host == "cdn.modrinth.com" {
            let segments: Vec<&str> = parsed
                .path_segments()
                .map(|s| s.collect())
                .unwrap_or_default();
            if segments.len() >= 2 && segments[0] == "data" {
                mod_id = segments[1].to_string();
            }
        }

        let dest_path = safe_join(workspace, &file.path)?;
        if let Some(parent) = dest_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let mut resp = client
            .get(&dl_url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?;

        use sha1::{Digest, Sha1};
        use sha2::Sha512;
        let mut hasher1 = Sha1::new();
        let mut hasher512 = Sha512::new();
        let mut out = fs::File::create(&dest_path).map_err(|e| e.to_string())?;
        while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
            io::Write::write_all(&mut out, &chunk).map_err(|e| e.to_string())?;
            hasher1.update(&chunk);
            hasher512.update(&chunk);
        }

        if let Some(hashes) = &file.hashes {
            if let Some(expected) = hashes.get("sha1") {
                let got: String = hasher1
                    .finalize()
                    .iter()
                    .map(|b| format!("{:02x}", b))
                    .collect();
                if &got != expected {
                    let _ = fs::remove_file(&dest_path);
                    return Err(format!("SHA-1 mismatch for {}", file.path));
                }
            }
            if let Some(expected) = hashes.get("sha512") {
                let got: String = hasher512
                    .finalize()
                    .iter()
                    .map(|b| format!("{:02x}", b))
                    .collect();
                if &got != expected {
                    let _ = fs::remove_file(&dest_path);
                    return Err(format!("SHA-512 mismatch for {}", file.path));
                }
            }
        }

        let sha1 = file.hashes.as_ref().and_then(|h| h.get("sha1").cloned());

        installed.push(InstalledFile {
            mod_id,
            file_path: file.path.clone(),
            enabled_client,
            enabled_server,
            side: side.to_string(),
            sha1,
            dest_path,
        });
    }

    Ok(installed)
}

pub fn parse_loader_mc(index: &ModrinthIndex) -> (String, String) {
    let mc = index
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
    (mc, loader)
}

/// Extract a plain zip as an already instance-shaped tree into workspace.
pub fn extract_instance_zip(archive_path: &Path, workspace: &Path) -> Result<(), String> {
    wipe_dir(workspace)?;
    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = match entry.enclosed_name() {
            Some(p) => workspace.join(p),
            None => continue,
        };
        if entry.name().ends_with('/') {
            fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() {
                fs::create_dir_all(p).map_err(|e| e.to_string())?;
            }
            let mut outfile = fs::File::create(&outpath).map_err(|e| e.to_string())?;
            io::copy(&mut entry, &mut outfile).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Full client install from an mrpack sitting in original/.
pub async fn install_mrpack_client(
    client: &Client,
    archive_path: &Path,
    workspace: &Path,
) -> Result<(Vec<InstalledFile>, String, String), String> {
    wipe_dir(workspace)?;

    let Some((_raw, index)) = read_index_from_archive(archive_path)? else {
        // Treat as plain instance zip
        extract_instance_zip(archive_path, workspace)?;
        return Ok((Vec::new(), "1.20.1".to_string(), "fabric".to_string()));
    };

    let (mc, loader) = parse_loader_mc(&index);
    let installed = download_index_files_client(client, &index, workspace).await?;
    merge_client_overrides(archive_path, workspace)?;
    Ok((installed, mc, loader))
}

pub fn remove_mod_file_from_workspace(workspace: &Path, file_name: Option<&str>, mod_id: &str) {
    let mods_dir = workspace.join("mods");
    let mut candidates = Vec::new();
    if let Some(name) = file_name.filter(|s| !s.is_empty()) {
        let leaf = name.split('/').next_back().unwrap_or(name);
        candidates.push(mods_dir.join(leaf));
        if name.contains('/') || name.contains('\\') {
            if let Ok(p) = safe_join(workspace, name) {
                candidates.push(p);
            }
        }
    }
    candidates.push(mods_dir.join(format!("{}.jar", mod_id)));
    let leaf = mod_id.split('/').next_back().unwrap_or(mod_id);
    candidates.push(mods_dir.join(leaf));
    for p in candidates {
        let _ = fs::remove_file(p);
    }
}

/// Re-download one index file (by path or Modrinth project id) into workspace.
/// Returns Ok(true) if found+downloaded, Ok(false) if no matching index entry.
pub async fn redownload_index_file(
    client: &Client,
    archive_path: &Path,
    workspace: &Path,
    mod_id: &str,
    file_name: &str,
) -> Result<bool, String> {
    let Some((_raw, index)) = read_index_from_archive(archive_path)? else {
        return Ok(false);
    };

    let target = index.files.iter().find(|f| {
        if f.path == file_name {
            return true;
        }
        let path_leaf = f.path.rsplit('/').next().unwrap_or(&f.path);
        let name_leaf = file_name.rsplit(['/', '\\']).next().unwrap_or(file_name);
        if path_leaf == name_leaf {
            return true;
        }
        f.downloads
            .first()
            .and_then(|u| url::Url::parse(u).ok())
            .is_some_and(|u| {
                let segs: Vec<&str> = u.path_segments().map(|s| s.collect()).unwrap_or_default();
                segs.len() >= 2 && segs[0] == "data" && segs[1] == mod_id
            })
    });

    let Some(file) = target else {
        return Ok(false);
    };

    let dl_url = file
        .downloads
        .first()
        .ok_or_else(|| format!("No download URL for {}", file.path))?;
    let parsed = url::Url::parse(dl_url).map_err(|e| e.to_string())?;
    let host = parsed.host_str().unwrap_or("");
    if !is_allowed_download_host(host) {
        return Err(format!("Invalid download host: {}", dl_url));
    }

    let dest = safe_join(workspace, &file.path)?;
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut resp = client
        .get(dl_url.as_str())
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    let mut out = fs::File::create(&dest).map_err(|e| e.to_string())?;
    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        io::Write::write_all(&mut out, &chunk).map_err(|e| e.to_string())?;
    }
    Ok(true)
}

/// Pull one jar leaf out of a plain zip into workspace/mods/.
pub fn extract_named_jar_from_zip(
    archive_path: &Path,
    workspace: &Path,
    mod_id: &str,
    file_name: &str,
) -> Result<bool, String> {
    let leaf = file_name.rsplit(['/', '\\']).next().unwrap_or(file_name);
    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let mut zip = ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().replace('\\', "/");
        let entry_leaf = name.rsplit('/').next().unwrap_or(&name);
        if entry_leaf == leaf
            || name.ends_with(file_name)
            || entry_leaf == mod_id
            || name.contains(&format!("/{}", mod_id))
        {
            let mods = workspace.join("mods");
            fs::create_dir_all(&mods).map_err(|e| e.to_string())?;
            let dest = mods.join(entry_leaf);
            let mut out = fs::File::create(&dest).map_err(|e| e.to_string())?;
            io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
            return Ok(true);
        }
    }
    Ok(false)
}
