use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceMod {
    pub id: String,
    pub name: String,
    pub version: String,
    pub source: String,
    pub is_base: bool,
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerFile {
    pub name: String,
    pub file_type: String, // 'type' in typescript
    pub source: String,
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Instance {
    pub id: String,
    pub name: String,
    pub base_pack: String,         // mapped from base_pack_id
    pub base_pack_version: String, // mapped from base_pack_version_id
    pub mc_version: String,
    pub loader: String,
    pub source: String,
    pub status: String,
    pub description: String,
    pub last_exported: String,
    pub banner_url: String,
    pub export_settings: serde_json::Value,

    // UI needs customModCount and totalModCount
    pub custom_mod_count: u32,
    pub total_mod_count: u32,

    pub base_pack_mods: Vec<String>,
    pub custom_mods: Vec<InstanceMod>,
    pub server_files: Vec<ServerFile>,
}
