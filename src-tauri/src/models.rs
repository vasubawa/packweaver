use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Instance {
    pub id: String,
    pub name: String,
    pub base_pack_id: String,
    pub base_pack_version_id: String,
    pub mc_version: String,
    pub loader: String,
    pub source: String,
    pub mods_count: u32,
    pub status: String, // E.g. "Ready" or "Update Available"
}

// In the future we will have InstanceMod struct here
