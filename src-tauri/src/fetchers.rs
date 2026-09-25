use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;
use std::fs;
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

/// True when both paths resolve to the same existing file on disk.
pub(crate) fn same_file(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

/// Remove stored archives from `dir`, preserving anything in `keep`.
pub(crate) fn clear_originals_except(dir: &Path, keep: &[&Path]) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if !path.is_file() || keep.iter().any(|k| same_file(k, &path)) {
            continue;
        }
        let _ = fs::remove_file(path);
    }
    Ok(())
}

/// Store `source` as the single archive in `dest_dir`. Copies to a temp sibling
/// and renames, and never deletes the source: re-importing the already-stored
/// archive is a no-op rather than destroying it.
pub(crate) fn store_archive(source: &Path, dest_dir: &Path) -> Result<PathBuf, String> {
    let canonical = source
        .canonicalize()
        .map_err(|e| format!("Invalid pack path: {e}"))?;
    let leaf = canonical
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid pack filename")?;
    fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;
    let dest = dest_dir.join(leaf);

    if same_file(&canonical, &dest) {
        clear_originals_except(dest_dir, &[&canonical])?;
        return Ok(dest);
    }

    let tmp = dest_dir.join(format!("{leaf}.tmp"));
    let _ = fs::remove_file(&tmp);
    fs::copy(&canonical, &tmp).map_err(|e| e.to_string())?;
    clear_originals_except(dest_dir, &[&canonical, &tmp])?;
    fs::rename(&tmp, &dest).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })?;
    Ok(dest)
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

        store_archive(&canonical, dest_dir)
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
    #[serde(default)]
    hashes: Option<std::collections::HashMap<String, String>>,
    #[serde(default)]
    size: Option<u64>,
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

        let leaf = {
            let raw = pack_file
                .filename
                .clone()
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| format!("{}.mrpack", source_id));
            let sanitized = crate::ids::jar_leaf(&raw);
            if sanitized.is_empty() || sanitized == "." || sanitized == ".." {
                format!("{}.mrpack", source_id)
            } else {
                sanitized
            }
        };
        fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;

        emit_progress(app, instance_id, "Downloading Basepack...", 10, 100);
        // Download beside the store and verify before anything is replaced: the
        // base pack gets the same host, scheme and hash checks as index files.
        let tmp_path = dest_dir.join(format!("{leaf}.tmp"));
        let _ = fs::remove_file(&tmp_path);
        crate::installer::download_url_to_file(
            &self.client,
            &pack_file.url,
            &tmp_path,
            crate::installer::Integrity::required(pack_file.hashes.as_ref(), pack_file.size),
        )
        .await?;

        let dest_path = dest_dir.join(&leaf);
        clear_originals_except(dest_dir, &[&tmp_path])?;
        fs::rename(&tmp_path, &dest_path).map_err(|e| {
            let _ = fs::remove_file(&tmp_path);
            e.to_string()
        })?;
        Ok(dest_path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pw-fetch-{}-{}", std::process::id(), name));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn reimporting_the_stored_archive_keeps_it() {
        let store = scratch("reimport");
        let archive = store.join("pack.mrpack");
        fs::write(&archive, b"payload").unwrap();

        let dest = store_archive(&archive, &store).unwrap();

        assert_eq!(dest, archive);
        assert_eq!(fs::read(&archive).unwrap(), b"payload");
        let _ = fs::remove_dir_all(&store);
    }

    #[test]
    fn storing_replaces_the_previous_archive() {
        let store = scratch("replace");
        let src_dir = scratch("replace-src");
        fs::write(store.join("old.mrpack"), b"old").unwrap();
        let source = src_dir.join("new.mrpack");
        fs::write(&source, b"new").unwrap();

        let dest = store_archive(&source, &store).unwrap();

        assert_eq!(fs::read(&dest).unwrap(), b"new");
        assert!(!store.join("old.mrpack").exists());
        assert!(!store.join("new.mrpack.tmp").exists());
        assert_eq!(fs::read(&source).unwrap(), b"new", "source must survive");
        let _ = fs::remove_dir_all(&store);
        let _ = fs::remove_dir_all(&src_dir);
    }

    #[test]
    fn missing_source_leaves_the_store_untouched() {
        let store = scratch("missing");
        fs::write(store.join("old.mrpack"), b"old").unwrap();

        assert!(store_archive(&store.join("nope.mrpack"), &store).is_err());

        assert_eq!(fs::read(store.join("old.mrpack")).unwrap(), b"old");
        let _ = fs::remove_dir_all(&store);
    }
}
