//! Install a base pack into a Minecraft-instance-shaped workspace tree.

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
        "cdn.modrinth.com"
            | "github.com"
            | "objects.githubusercontent.com"
            | "gitlab.com"
            | "maven.fabricmc.net"
            | "maven.minecraftforge.net"
            | "maven.neoforged.net"
    ) || host.ends_with(".githubusercontent.com")
        || host.ends_with(".modrinth.com")
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// Stream `url` to `dest`, optionally verifying sha1/sha512 from a hashes map.
pub async fn download_url_to_file(
    client: &Client,
    url: &str,
    dest: &Path,
    expected_hashes: Option<&std::collections::HashMap<String, String>>,
) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|e| e.to_string())?;
    let host = parsed.host_str().unwrap_or("");
    if !is_allowed_download_host(host) {
        return Err(format!("Invalid download host: {}", url));
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;

    use sha1::{Digest, Sha1};
    use sha2::Sha512;
    let mut hasher1 = Sha1::new();
    let mut hasher512 = Sha512::new();
    let mut out = fs::File::create(dest).map_err(|e| e.to_string())?;
    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        io::Write::write_all(&mut out, &chunk).map_err(|e| e.to_string())?;
        hasher1.update(&chunk);
        hasher512.update(&chunk);
    }

    if let Some(hashes) = expected_hashes {
        let sha1_got = hex_encode(&hasher1.finalize());
        let sha512_got = hex_encode(&hasher512.finalize());
        if let Some(expected) = hashes.get("sha1") {
            if &sha1_got != expected {
                let _ = fs::remove_file(dest);
                return Err(format!("SHA-1 mismatch for {}", dest.display()));
            }
        }
        if let Some(expected) = hashes.get("sha512") {
            if &sha512_got != expected {
                let _ = fs::remove_file(dest);
                return Err(format!("SHA-512 mismatch for {}", dest.display()));
            }
        }
    }
    Ok(())
}

pub fn wipe_dir(path: &Path) -> Result<(), String> {
    if path.exists() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(path).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn safe_join(base: &Path, relative: &str) -> Result<PathBuf, String> {
    let trimmed = relative.trim();
    if trimmed.is_empty()
        || trimmed.starts_with('/')
        || trimmed.starts_with('\\')
        || Path::new(trimmed).is_absolute()
        || trimmed.chars().any(|c| c == ':' || c == '\0')
        || Path::new(trimmed).components().any(|c| {
            matches!(
                c,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(format!("Invalid relative path: {}", relative));
    }
    Ok(base.join(trimmed))
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
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default, rename = "versionId")]
    pub version_id: Option<String>,
    #[serde(default)]
    pub summary: Option<String>,
    dependencies: std::collections::HashMap<String, String>,
    files: Vec<ModrinthIndexFile>,
}

#[derive(Debug, Clone, Default)]
pub struct PackInstallMeta {
    pub mc_version: String,
    pub loader: String,
    pub pack_name: String,
    pub pack_version: String,
    pub summary: String,
    /// Prism `notes=` from instance.cfg (private); mrpack `summary` stays in summary/description.
    pub notes: String,
    /// Absolute path to an icon image found in the pack tree (copied to media/ later).
    pub icon_path: String,
    /// Absolute path to a banner/background image if present.
    pub banner_path: String,
}

#[derive(Debug)]
pub struct ClientInstallResult {
    pub files: Vec<InstalledFile>,
    pub meta: PackInstallMeta,
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

/// True when the archive is a CurseForge / ForgeCDN pack (manifest + CDN file IDs).
pub fn is_curseforge_pack(archive_path: &Path) -> Result<bool, String> {
    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut has_manifest = false;
    let mut has_mrpack_index = false;
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().replace('\\', "/");
        if name == "modrinth.index.json" || name.ends_with("/modrinth.index.json") {
            has_mrpack_index = true;
        }
        if name == "manifest.json" || name.ends_with("/manifest.json") {
            has_manifest = true;
        }
    }
    if has_mrpack_index {
        return Ok(false);
    }
    if !has_manifest {
        return Ok(false);
    }
    // Confirm it looks like a CF minecraftModpack manifest.
    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().replace('\\', "/");
        if name == "manifest.json" || name.ends_with("/manifest.json") {
            let mut data = String::new();
            io::Read::read_to_string(&mut entry, &mut data).map_err(|e| e.to_string())?;
            if data.contains("minecraftModpack")
                || data.contains("\"projectID\"")
                || data.contains("\"fileID\"")
            {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

fn meta_from_index(index: &ModrinthIndex) -> PackInstallMeta {
    let (mc, loader) = parse_loader_mc(index);
    PackInstallMeta {
        mc_version: mc,
        loader,
        pack_name: index.name.clone().unwrap_or_default(),
        pack_version: index.version_id.clone().unwrap_or_default(),
        summary: index.summary.clone().unwrap_or_default(),
        notes: String::new(),
        icon_path: String::new(),
        banner_path: String::new(),
    }
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
        download_url_to_file(client, &dl_url, &dest_path, file.hashes.as_ref()).await?;

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
        .unwrap_or_default();
    let loader = if index.dependencies.contains_key("neoforge") {
        "NeoForge"
    } else if index.dependencies.contains_key("forge") {
        "Forge"
    } else if index.dependencies.contains_key("quilt-loader") {
        "Quilt"
    } else {
        "Fabric"
    };
    (mc, loader.to_string())
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

/// Full client install from an mrpack (or Prism-style instance zip) sitting in original/.
pub async fn install_mrpack_client(
    client: &Client,
    archive_path: &Path,
    workspace: &Path,
) -> Result<ClientInstallResult, String> {
    wipe_dir(workspace)?;

    if is_curseforge_pack(archive_path)? {
        return Err(
            "This archive is a CurseForge pack (manifest.json with project/file IDs). \
             Packweaver cannot download CurseForge files yet. Import a Modrinth .mrpack instead, \
             or use a launcher instance zip that already contains a mods/ folder."
                .to_string(),
        );
    }

    let Some((_raw, index)) = read_index_from_archive(archive_path)? else {
        // Treat as plain instance zip (Prism / MultiMC-style tree with mods/).
        extract_instance_zip(archive_path, workspace)?;
        hoist_single_root_if_needed(workspace)?;
        let meta = normalize_launcher_instance(workspace)?;
        let mut meta = meta;
        if meta.icon_path.is_empty() || meta.banner_path.is_empty() {
            extract_media_from_archive(archive_path, workspace, &mut meta)?;
        }
        if !workspace.join("mods").is_dir() {
            return Err("This zip has no mods/ folder and no modrinth.index.json. \
                 CurseForge downloads are not supported yet — use a Modrinth .mrpack, \
                 or a Prism/MultiMC instance zip that already includes the mod jars."
                .to_string());
        }
        return Ok(ClientInstallResult {
            files: Vec::new(),
            meta,
        });
    };

    let mut meta = meta_from_index(&index);
    let files = download_index_files_client(client, &index, workspace).await?;
    merge_client_overrides(archive_path, workspace)?;
    fill_media_paths_from_workspace(workspace, &mut meta);
    // Icons may live only in the archive (not always under overrides/) — pull them offline.
    if meta.icon_path.is_empty() || meta.banner_path.is_empty() {
        extract_media_from_archive(archive_path, workspace, &mut meta)?;
    }
    Ok(ClientInstallResult { files, meta })
}

/// Prism/MultiMC instance zip: read instance.cfg + mmc-pack.json, hoist minecraft/ game dir,
/// and locate icon/banner files that ship inside the archive (offline only).
fn normalize_launcher_instance(workspace: &Path) -> Result<PackInstallMeta, String> {
    let mut meta = PackInstallMeta::default();

    // If instance.cfg sits in a nested folder, hoist that instance root up first.
    if let Some(cfg_root) = find_instance_cfg_root(workspace) {
        if cfg_root != workspace {
            hoist_dir_contents(&cfg_root, workspace)?;
            let _ = fs::remove_dir_all(&cfg_root);
        }
    }

    if let Some(cfg_path) = find_named_file(workspace, "instance.cfg") {
        apply_instance_cfg(&cfg_path, &mut meta);
    }
    if let Some(mmc_path) = find_named_file(workspace, "mmc-pack.json") {
        apply_mmc_pack(&mmc_path, &mut meta);
    }

    // Prism keeps the Minecraft tree under minecraft/ or .minecraft/.
    hoist_game_subdir(workspace)?;
    fill_media_paths_from_workspace(workspace, &mut meta);
    Ok(meta)
}

fn find_instance_cfg_root(workspace: &Path) -> Option<PathBuf> {
    let direct = workspace.join("instance.cfg");
    if direct.is_file() {
        return Some(workspace.to_path_buf());
    }
    // One level deep: InstanceName/instance.cfg
    if let Ok(entries) = fs::read_dir(workspace) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() && p.join("instance.cfg").is_file() {
                return Some(p);
            }
        }
    }
    None
}

fn find_named_file(root: &Path, name: &str) -> Option<PathBuf> {
    let p = root.join(name);
    if p.is_file() {
        Some(p)
    } else {
        None
    }
}

fn apply_instance_cfg(path: &Path, meta: &mut PackInstallMeta) {
    let Ok(text) = fs::read_to_string(path) else {
        return;
    };
    let mut icon_key = String::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with('[') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        let value = value.trim();
        match key {
            "name" if meta.pack_name.is_empty() => meta.pack_name = value.to_string(),
            "notes" | "Notes" if meta.notes.is_empty() => meta.notes = value.to_string(),
            "iconKey" | "iconKeyOverride" => icon_key = value.to_string(),
            _ => {}
        }
    }
    if !icon_key.is_empty() {
        if let Some(icon) = find_icon_for_key(path.parent().unwrap_or(path), &icon_key) {
            meta.icon_path = icon.to_string_lossy().to_string();
        }
    }
}

fn apply_mmc_pack(path: &Path, meta: &mut PackInstallMeta) {
    let Ok(text) = fs::read_to_string(path) else {
        return;
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else {
        return;
    };
    let Some(components) = json["components"].as_array() else {
        return;
    };
    for c in components {
        let uid = c["uid"].as_str().unwrap_or("").to_ascii_lowercase();
        let ver = c["version"].as_str().unwrap_or("").to_string();
        if ver.is_empty() {
            continue;
        }
        if uid == "net.minecraft" && meta.mc_version.is_empty() {
            meta.mc_version = ver;
        } else if meta.loader.is_empty() {
            if uid.contains("fabric-loader") || uid.contains("fabricmc.fabric-loader") {
                meta.loader = "Fabric".to_string();
            } else if uid.contains("neoforge") {
                meta.loader = "NeoForge".to_string();
            } else if uid.contains("minecraftforge") || uid.ends_with(".forge") {
                meta.loader = "Forge".to_string();
            } else if uid.contains("quilt-loader") {
                meta.loader = "Quilt".to_string();
            }
        }
    }
}

fn find_icon_for_key(root: &Path, icon_key: &str) -> Option<PathBuf> {
    if icon_key.is_empty() || icon_key.eq_ignore_ascii_case("default") {
        return None;
    }
    let exts = ["png", "jpg", "jpeg", "webp", "gif", "ico"];
    for ext in exts {
        let p = root.join(format!("{icon_key}.{ext}"));
        if p.is_file() {
            return Some(p);
        }
    }
    // iconKey may already include extension
    let p = root.join(icon_key);
    if p.is_file() {
        return Some(p);
    }
    None
}

fn fill_media_paths_from_workspace(root: &Path, meta: &mut PackInstallMeta) {
    if meta.icon_path.is_empty() {
        for candidate in [
            root.join("icon.png"),
            root.join("icon.jpg"),
            root.join("pack.png"),
            root.join("overrides").join("icon.png"),
            root.join("overrides").join("icon.jpg"),
        ] {
            if candidate.is_file() {
                meta.icon_path = candidate.to_string_lossy().to_string();
                break;
            }
        }
    }
    if meta.banner_path.is_empty() {
        for candidate in [
            root.join("background.png"),
            root.join("banner.png"),
            root.join("overrides").join("background.png"),
            root.join("overrides").join("banner.png"),
        ] {
            if candidate.is_file() {
                meta.banner_path = candidate.to_string_lossy().to_string();
                break;
            }
        }
    }
}

/// Pull icon/banner straight out of the zip/.mrpack when they weren't already on disk.
fn extract_media_from_archive(
    archive_path: &Path,
    workspace: &Path,
    meta: &mut PackInstallMeta,
) -> Result<(), String> {
    let need_icon = meta.icon_path.is_empty();
    let need_banner = meta.banner_path.is_empty();
    if !need_icon && !need_banner {
        return Ok(());
    }

    let out_dir = workspace.join(".packweaver-media");
    fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;

    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    let icon_names = [
        "icon.png",
        "icon.jpg",
        "pack.png",
        "overrides/icon.png",
        "overrides/icon.jpg",
        "client-overrides/icon.png",
    ];
    let banner_names = [
        "background.png",
        "banner.png",
        "overrides/background.png",
        "overrides/banner.png",
    ];

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        if entry.name().ends_with('/') {
            continue;
        }
        let name = entry.name().replace('\\', "/");
        let leaf = name
            .rsplit('/')
            .next()
            .unwrap_or(&name)
            .to_ascii_lowercase();

        let is_icon = need_icon
            && (icon_names.iter().any(|n| name.eq_ignore_ascii_case(n))
                || leaf == "icon.png"
                || leaf == "icon.jpg"
                || leaf == "pack.png");
        let is_banner = need_banner
            && (banner_names.iter().any(|n| name.eq_ignore_ascii_case(n))
                || leaf == "background.png"
                || leaf == "banner.png");

        if !is_icon && !is_banner {
            continue;
        }

        let dest = out_dir.join(&leaf);
        {
            let mut out = fs::File::create(&dest).map_err(|e| e.to_string())?;
            io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
        }
        if is_icon && meta.icon_path.is_empty() {
            meta.icon_path = dest.to_string_lossy().to_string();
        }
        if is_banner && meta.banner_path.is_empty() {
            meta.banner_path = dest.to_string_lossy().to_string();
        }
        if (!need_icon || !meta.icon_path.is_empty())
            && (!need_banner || !meta.banner_path.is_empty())
        {
            break;
        }
    }
    Ok(())
}

fn hoist_game_subdir(workspace: &Path) -> Result<(), String> {
    for name in ["minecraft", ".minecraft"] {
        let sub = workspace.join(name);
        if sub.is_dir() && (sub.join("mods").is_dir() || sub.join("config").is_dir()) {
            hoist_dir_contents(&sub, workspace)?;
            let _ = fs::remove_dir_all(&sub);
            break;
        }
    }
    Ok(())
}

fn hoist_dir_contents(from: &Path, to: &Path) -> Result<(), String> {
    if !from.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(from).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let dest = to.join(entry.file_name());
        if dest.exists() {
            // Prefer existing top-level instance.cfg / icons; merge dirs when possible.
            if entry.path().is_dir() && dest.is_dir() {
                hoist_dir_contents(&entry.path(), &dest)?;
                let _ = fs::remove_dir_all(entry.path());
            }
            continue;
        }
        fs::rename(entry.path(), &dest).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// If the zip extracted as a single top-level folder, hoist its contents to workspace root.
fn hoist_single_root_if_needed(workspace: &Path) -> Result<(), String> {
    let mut children: Vec<PathBuf> = fs::read_dir(workspace)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .collect();
    if children.len() != 1 || !children[0].is_dir() {
        return Ok(());
    }
    let root = children.remove(0);
    // Don't hoist if it already looks like the minecraft tree.
    if root.file_name().and_then(|n| n.to_str()) == Some("mods") {
        return Ok(());
    }
    if root.join("mods").is_dir() || root.join("config").is_dir() {
        let tmp = workspace.join("__hoist_tmp");
        if tmp.exists() {
            let _ = fs::remove_dir_all(&tmp);
        }
        fs::rename(&root, &tmp).map_err(|e| e.to_string())?;
        for entry in fs::read_dir(&tmp).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let dest = workspace.join(entry.file_name());
            fs::rename(entry.path(), dest).map_err(|e| e.to_string())?;
        }
        let _ = fs::remove_dir_all(&tmp);
    }
    Ok(())
}

/// Download server-capable index files into workspace. Skips env.server == unsupported.
pub async fn download_index_files_server(
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

        if !env_supported(server_env) {
            continue; // client-only — skip server workspace
        }

        let enabled_client = env_supported(client_env);
        let enabled_server = true; // optional included by default on server
        let side = match (enabled_client, true) {
            (true, true) => "both",
            (false, true) => "server",
            (true, false) => "client",
            _ => "server",
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
        download_url_to_file(client, &dl_url, &dest_path, file.hashes.as_ref()).await?;

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

/// Merge server-overrides/ from the archive into workspace root.
pub fn merge_server_overrides(archive_path: &Path, workspace: &Path) -> Result<(), String> {
    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().replace('\\', "/");
        if name.ends_with('/') {
            continue;
        }

        let Some(stripped) = name.strip_prefix("server-overrides/") else {
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

/// Full server install from an mrpack sitting in original/.
pub async fn install_mrpack_server(
    client: &Client,
    archive_path: &Path,
    workspace: &Path,
) -> Result<(Vec<InstalledFile>, String, String), String> {
    wipe_dir(workspace)?;

    if is_curseforge_pack(archive_path)? {
        return Err(
            "This archive is a CurseForge pack. Packweaver cannot download CurseForge files yet. \
             Use a Modrinth .mrpack instead."
                .to_string(),
        );
    }

    let Some((_raw, index)) = read_index_from_archive(archive_path)? else {
        extract_instance_zip(archive_path, workspace)?;
        hoist_single_root_if_needed(workspace)?;
        return Ok((Vec::new(), String::new(), String::new()));
    };

    let (mc, loader) = parse_loader_mc(&index);
    let installed = download_index_files_server(client, &index, workspace).await?;
    merge_server_overrides(archive_path, workspace)?;
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
    download_url_to_file(client, dl_url, &dest, file.hashes.as_ref()).await?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn safe_join_blocks_parent_and_absolute() {
        let base = Path::new("/tmp/ws");
        assert!(safe_join(base, "../evil").is_err());
        assert!(safe_join(base, "/abs").is_err());
        assert!(safe_join(base, "mods/foo.jar").is_ok());
    }

    #[test]
    fn detects_curseforge_create_madlands_fixture() {
        let p = Path::new(env!("CARGO_MANIFEST_DIR")).join(
            "target/debug/packweaver-data/instances/Create-Madlands/original/Create Madlands.zip",
        );
        if !p.exists() {
            return; // fixture only present after a local CF import attempt
        }
        assert!(is_curseforge_pack(&p).unwrap());
    }
}
