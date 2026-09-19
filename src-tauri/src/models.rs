use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstanceMod {
    pub id: String,
    pub name: String,
    pub version: String,
    pub file_name: Option<String>,
    pub source: String,
    pub is_base: bool,
    pub enabled: bool,
    pub enabled_server: bool,
    pub side: String,
    pub icon_url: Option<String>,
    pub author: Option<String>,
    pub description: Option<String>,
    /// Jar present under workspace/client/{stem}/mods (or relative path).
    pub on_disk_client: bool,
    /// Jar present under workspace/server/{stem}/mods (or relative path).
    pub on_disk_server: bool,
    /// Size in bytes of the first jar found (client preferred).
    pub file_size: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerFile {
    pub name: String,
    pub file_type: String,
    pub source: String,
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Instance {
    pub id: String,
    pub name: String,
    pub base_pack: String,
    pub base_pack_version: String,
    pub mc_version: String,
    pub loader: String,
    pub source: String,
    pub status: String,
    pub description: String,
    pub last_exported: String,
    pub banner_url: String,
    pub icon_url: String,
    pub export_settings: serde_json::Value,

    pub custom_mod_count: u32,
    pub total_mod_count: u32,

    pub base_pack_mods: Vec<InstanceMod>,
    pub custom_mods: Vec<InstanceMod>,
    pub server_files: Vec<ServerFile>,
}
