use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

#[async_trait]
pub trait BasePackFetcher: Send + Sync {
    /// Fetch pack into `dest_dir`, returning the final file path (with real basename when known).
    async fn fetch_to_original(
        &self,
        app: &AppHandle,
        instance_id: &str,
        source_id: &str,
        version_id: &str,
        dest_dir: &Path,
    ) -> Result<PathBuf, String>;
}

fn emit_progress(app: &AppHandle, instance_id: &str, status: &str, p: u32, t: u32) {
    let _ = app.emit(
        "instance-progress",
        crate::downloader::ProgressEvent::emit_body(instance_id, status, p, t, "client"),
    );
}

pub struct LocalFetcher;

#[async_trait]
impl BasePackFetcher for LocalFetcher {
    async fn fetch_to_original(
        &self,
        app: &AppHandle,
        instance_id: &str,
        source_id: &str,
        _version_id: &str,
        dest_dir: &Path,
    ) -> Result<PathBuf, String> {
        emit_progress(app, instance_id, "Copying Local File...", 10, 100);

        let source = PathBuf::from(source_id);
        let canonical = source
            .canonicalize()
            .map_err(|e| format!("Invalid local pack path: {}", e))?;
        if !canonical.is_file() {
            return Err("Local pack path is not a file".to_string());
        }
        let ext = canonical
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        if ext != "mrpack" && ext != "zip" {
            return Err("Local pack must be a .mrpack or .zip file".to_string());
        }

        let leaf = canonical
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or("Invalid local filename")?;
        fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;
        // Clear previous originals
        if dest_dir.exists() {
            for entry in fs::read_dir(dest_dir).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let _ = fs::remove_file(entry.path());
            }
        }
        let dest = dest_dir.join(leaf);
        fs::copy(&canonical, &dest).map_err(|e| e.to_string())?;
        Ok(dest)
    }
}

pub struct ModrinthFetcher {
    client: Client,
}

impl ModrinthFetcher {
    pub fn new(client: Client) -> Self {
        Self { client }
    }
}

#[derive(Deserialize)]
struct ModrinthVersion {
    files: Vec<ModrinthVersionFile>,
}

#[derive(Deserialize)]
struct ModrinthVersionFile {
    url: String,
    filename: Option<String>,
    primary: bool,
}

fn pick_primary_file(mut files: Vec<ModrinthVersionFile>) -> Result<ModrinthVersionFile, String> {
    if files.is_empty() {
        return Err("No files found in version".to_string());
    }
    if let Some(idx) = files.iter().position(|f| f.primary) {
        Ok(files.remove(idx))
    } else {
        Ok(files.remove(0))
    }
}

#[async_trait]
impl BasePackFetcher for ModrinthFetcher {
    async fn fetch_to_original(
        &self,
        app: &AppHandle,
        instance_id: &str,
        source_id: &str,
        version_id: &str,
        dest_dir: &Path,
    ) -> Result<PathBuf, String> {
        emit_progress(app, instance_id, "Fetching Pack Info...", 0, 100);

        let pack_file = if !version_id.is_empty() && version_id != "latest" {
            let url = format!("https://api.modrinth.com/v2/version/{}", version_id);
            let version: ModrinthVersion = self
                .client
                .get(&url)
                .send()
                .await
                .map_err(|e| e.to_string())?
                .error_for_status()
                .map_err(|e| e.to_string())?
                .json()
                .await
                .map_err(|e| e.to_string())?;
            pick_primary_file(version.files)?
        } else {
            let url = format!("https://api.modrinth.com/v2/project/{}/version", source_id);
            let versions: Vec<ModrinthVersion> = self
                .client
                .get(&url)
                .send()
                .await
                .map_err(|e| e.to_string())?
                .error_for_status()
                .map_err(|e| e.to_string())?
                .json()
                .await
                .map_err(|e| e.to_string())?;

            let latest = versions.into_iter().next().ok_or("No versions found")?;
            pick_primary_file(latest.files)?
        };

        let leaf = pack_file
            .filename
            .clone()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| format!("{}.mrpack", source_id));

        fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;
        if dest_dir.exists() {
            for entry in fs::read_dir(dest_dir).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let _ = fs::remove_file(entry.path());
            }
        }
        let dest_path = dest_dir.join(&leaf);

        emit_progress(app, instance_id, "Downloading Basepack...", 10, 100);
        let mut resp = self
            .client
            .get(&pack_file.url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?;

        let mut out = fs::File::create(&dest_path).map_err(|e| e.to_string())?;
        while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
            io::Write::write_all(&mut out, &chunk).map_err(|e| e.to_string())?;
        }

        Ok(dest_path)
    }
}
