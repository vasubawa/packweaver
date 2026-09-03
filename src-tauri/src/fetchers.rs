use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;
use std::fs;
use std::io;
use std::path::Path;
use tauri::{AppHandle, Emitter};

#[async_trait]
pub trait BasePackFetcher: Send + Sync {
    async fn fetch(
        &self,
        app: &AppHandle,
        instance_id: &str,
        source_id: &str,
        dest_path: &Path,
    ) -> Result<(), String>;
}

fn emit_progress(app: &AppHandle, instance_id: &str, status: &str, p: u32, t: u32) {
    let _ = app.emit(
        "instance-progress",
        crate::downloader::ProgressEvent {
            instance_id: instance_id.to_string(),
            status: status.to_string(),
            progress: p,
            total: t,
        },
    );
}

pub struct LocalFetcher;

#[async_trait]
impl BasePackFetcher for LocalFetcher {
    async fn fetch(
        &self,
        app: &AppHandle,
        instance_id: &str,
        source_id: &str,
        dest_path: &Path,
    ) -> Result<(), String> {
        emit_progress(app, instance_id, "Copying Local File...", 10, 100);
        fs::copy(source_id, dest_path).map_err(|e| e.to_string())?;
        Ok(())
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
    primary: bool,
}

#[async_trait]
impl BasePackFetcher for ModrinthFetcher {
    async fn fetch(
        &self,
        app: &AppHandle,
        instance_id: &str,
        source_id: &str,
        dest_path: &Path,
    ) -> Result<(), String> {
        emit_progress(app, instance_id, "Fetching Pack Info...", 0, 100);

        // Fetch Modrinth Version
        let url = format!("https://api.modrinth.com/v2/project/{}/version", source_id);
        let versions: Vec<ModrinthVersion> = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;

        let latest_version = versions.into_iter().next().ok_or("No versions found")?;
        let mut files = latest_version.files;
        if files.is_empty() {
            return Err("No files found in latest version".to_string());
        }
        let pack_file = if let Some(idx) = files.iter().position(|f| f.primary) {
            files.remove(idx)
        } else {
            files.remove(0)
        };

        // Download .mrpack
        emit_progress(app, instance_id, "Downloading Basepack...", 10, 100);
        let mut resp = self
            .client
            .get(&pack_file.url)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let mut out = fs::File::create(dest_path).map_err(|e| e.to_string())?;
        while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
            io::Write::write_all(&mut out, &chunk).map_err(|e| e.to_string())?;
        }

        Ok(())
    }
}
