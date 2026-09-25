//! App self-update: channel-aware check/install via tauri-plugin-updater.
//!
//! Channels map to separate GitHub Release manifests. Signing pubkey must be set
//! in `tauri.conf.json` (`plugins.updater.pubkey`) after `pnpm tauri signer generate`.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UpdateChannel {
    Stable,
    Unstable,
}

impl UpdateChannel {
    pub fn parse(s: &str) -> Self {
        match s.trim().to_ascii_lowercase().as_str() {
            "unstable" | "beta" | "alpha" | "testing" => Self::Unstable,
            _ => Self::Stable,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Stable => "stable",
            Self::Unstable => "unstable",
        }
    }

    /// Static GitHub Releases manifests (same repo as origin).
    pub fn endpoint(self) -> &'static str {
        match self {
            Self::Stable => {
                "https://github.com/vasubawa/packweaver/releases/latest/download/latest.json"
            }
            Self::Unstable => {
                "https://github.com/vasubawa/packweaver/releases/download/unstable/latest.json"
            }
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct AppSettingsFile {
    #[serde(default = "default_channel")]
    update_channel: String,
}

fn default_channel() -> String {
    "stable".into()
}

fn settings_path() -> PathBuf {
    crate::db::get_portable_data_dir().join("app-settings.json")
}

pub fn load_channel() -> UpdateChannel {
    let path = settings_path();
    let raw = fs::read_to_string(&path).unwrap_or_default();
    if raw.is_empty() {
        return UpdateChannel::Stable;
    }
    serde_json::from_str::<AppSettingsFile>(&raw)
        .map(|s| UpdateChannel::parse(&s.update_channel))
        .unwrap_or(UpdateChannel::Stable)
}

pub fn save_channel(channel: UpdateChannel) -> Result<(), String> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut file = if path.is_file() {
        let raw = fs::read_to_string(&path).unwrap_or_else(|_| "{}".into());
        serde_json::from_str::<AppSettingsFile>(&raw).unwrap_or_default()
    } else {
        AppSettingsFile::default()
    };
    file.update_channel = channel.as_str().to_string();
    let pretty = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    fs::write(&path, pretty).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateProgressPayload {
    pub chunk_length: usize,
    pub downloaded: u64,
    pub total: Option<u64>,
    pub percentage: Option<f32>,
}

#[derive(Debug, Serialize)]
pub struct AppUpdateStatus {
    pub available: bool,
    pub channel: String,
    pub current_version: String,
    pub version: Option<String>,
    pub notes: Option<String>,
    pub configured: bool,
    pub message: Option<String>,
}

#[cfg(desktop)]
mod desktop {
    use super::*;
    use tauri::AppHandle;
    use tauri_plugin_updater::UpdaterExt;

    fn pubkey_missing(app: &AppHandle) -> bool {
        // Prefer runtime config; fall back to treating placeholder as unset.
        let from_conf = app
            .config()
            .plugins
            .0
            .get("updater")
            .and_then(|v| v.get("pubkey"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let t = from_conf.trim();
        t.is_empty() || t.contains("REPLACE_WITH_TAURI_UPDATER_PUBKEY")
    }

    pub async fn check(app: &AppHandle, channel: UpdateChannel) -> Result<AppUpdateStatus, String> {
        let current = app.package_info().version.to_string();
        if pubkey_missing(app) {
            return Ok(AppUpdateStatus {
                available: false,
                channel: channel.as_str().into(),
                current_version: current,
                version: None,
                notes: None,
                configured: false,
                message: Some(
                    "Updater signing key not set. Run `pnpm tauri signer generate`, put the public key in tauri.conf.json plugins.updater.pubkey, and publish signed latest.json per channel."
                        .into(),
                ),
            });
        }

        let url = channel
            .endpoint()
            .parse()
            .map_err(|e| format!("Invalid update endpoint: {e}"))?;

        let updater = app
            .updater_builder()
            .endpoints(vec![url])
            .map_err(|e| e.to_string())?
            .build()
            .map_err(|e| e.to_string())?;

        match updater.check().await {
            Ok(Some(update)) => Ok(AppUpdateStatus {
                available: true,
                channel: channel.as_str().into(),
                current_version: current,
                version: Some(update.version.clone()),
                notes: update.body.clone(),
                configured: true,
                message: None,
            }),
            Ok(Option::None) => Ok(AppUpdateStatus {
                available: false,
                channel: channel.as_str().into(),
                current_version: current,
                version: None,
                notes: None,
                configured: true,
                message: Some("You're on the latest build for this channel.".into()),
            }),
            Err(e) => {
                // Plugin returns ReleaseNotFound for missing/invalid feeds (not a "404" string).
                let no_feed = matches!(e, tauri_plugin_updater::Error::ReleaseNotFound);
                if no_feed {
                    Ok(AppUpdateStatus {
                        available: false,
                        channel: channel.as_str().into(),
                        current_version: current,
                        version: None,
                        notes: None,
                        configured: true,
                        message: Some(format!(
                            "No update feed for the {} channel yet. Publish a signed latest.json for that channel first.",
                            channel.as_str()
                        )),
                    })
                } else {
                    Err(e.to_string())
                }
            }
        }
    }

    pub async fn install(app: &AppHandle, channel: UpdateChannel) -> Result<(), String> {
        if pubkey_missing(app) {
            return Err("Updater signing key not configured".into());
        }
        let url = channel
            .endpoint()
            .parse()
            .map_err(|e| format!("Invalid update endpoint: {e}"))?;
        let updater = app
            .updater_builder()
            .endpoints(vec![url])
            .map_err(|e| e.to_string())?
            .build()
            .map_err(|e| e.to_string())?;

        let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
            return Err("No update available for this channel".into());
        };

        log::info!(
            target: "packweaver",
            "app update install channel={} version={}",
            channel.as_str(),
            update.version
        );

        let downloaded = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0));
        let dl = downloaded.clone();
        let app_handle = app.clone();

        use tauri::Emitter;
        update
            .download_and_install(
                move |chunk_length, content_length| {
                    let prev =
                        dl.fetch_add(chunk_length as u64, std::sync::atomic::Ordering::Relaxed);
                    let current = prev + chunk_length as u64;
                    let percentage = content_length.map(|tot| {
                        if tot == 0 {
                            0.0
                        } else {
                            ((current as f64 / tot as f64) * 100.0) as f32
                        }
                    });
                    let _ = app_handle.emit(
                        "app-update-progress",
                        UpdateProgressPayload {
                            chunk_length,
                            downloaded: current,
                            total: content_length,
                            percentage,
                        },
                    );
                },
                || {
                    log::info!(target: "packweaver", "app update download complete, installing...");
                },
            )
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[cfg(desktop)]
pub use desktop::{check, install};

#[cfg(not(desktop))]
pub async fn check(
    _app: &tauri::AppHandle,
    channel: UpdateChannel,
) -> Result<AppUpdateStatus, String> {
    Ok(AppUpdateStatus {
        available: false,
        channel: channel.as_str().into(),
        current_version: env!("CARGO_PKG_VERSION").into(),
        version: None,
        notes: None,
        configured: false,
        message: Some("App updates are desktop-only.".into()),
    })
}

#[cfg(not(desktop))]
pub async fn install(_app: &tauri::AppHandle, _channel: UpdateChannel) -> Result<(), String> {
    Err("App updates are desktop-only.".into())
}
