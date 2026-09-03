use std::fs::File;
use std::io::Read;
use std::path::Path;
use zip::ZipArchive;

#[derive(Debug, Default, Clone)]
pub struct JarMeta {
    pub name: Option<String>,
    pub version: Option<String>,
    pub author: Option<String>,
    pub description: Option<String>,
}

pub fn inspect_jar(path: &Path) -> JarMeta {
    let mut meta = JarMeta::default();
    let file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return meta,
    };

    let mut archive = match ZipArchive::new(file) {
        Ok(a) => a,
        Err(_) => return meta,
    };

    // 1. Try fabric.mod.json
    if let Ok(mut mod_file) = archive.by_name("fabric.mod.json") {
        let mut contents = String::new();
        if mod_file.read_to_string(&mut contents).is_ok() {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&contents) {
                if let Some(n) = v.get("name").and_then(|n| n.as_str()) {
                    meta.name = Some(n.to_string());
                } else if let Some(id) = v.get("id").and_then(|id| id.as_str()) {
                    meta.name = Some(id.to_string());
                }

                if let Some(ver) = v.get("version").and_then(|v| v.as_str()) {
                    meta.version = Some(ver.to_string());
                }

                if let Some(desc) = v.get("description").and_then(|d| d.as_str()) {
                    meta.description = Some(desc.trim().to_string());
                }

                if let Some(authors) = v.get("authors") {
                    if let Some(arr) = authors.as_array() {
                        let names: Vec<String> = arr
                            .iter()
                            .filter_map(|a| {
                                if let Some(s) = a.as_str() {
                                    Some(s.to_string())
                                } else if let Some(obj) = a.as_object() {
                                    obj.get("name")
                                        .and_then(|n| n.as_str())
                                        .map(|s| s.to_string())
                                } else {
                                    None
                                }
                            })
                            .collect();
                        if !names.is_empty() {
                            meta.author = Some(names.join(", "));
                        }
                    } else if let Some(s) = authors.as_str() {
                        meta.author = Some(s.to_string());
                    }
                }
                return meta;
            }
        }
    }

    // 2. Try quilt.mod.json
    if let Ok(mut mod_file) = archive.by_name("quilt.mod.json") {
        let mut contents = String::new();
        if mod_file.read_to_string(&mut contents).is_ok() {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&contents) {
                if let Some(ql) = v.get("quilt_loader") {
                    if let Some(m) = ql.get("metadata") {
                        if let Some(n) = m.get("name").and_then(|n| n.as_str()) {
                            meta.name = Some(n.to_string());
                        }
                        if let Some(desc) = m.get("description").and_then(|d| d.as_str()) {
                            meta.description = Some(desc.trim().to_string());
                        }
                        if let Some(contributors) =
                            m.get("contributors").and_then(|c| c.as_object())
                        {
                            let names: Vec<String> = contributors.keys().cloned().collect();
                            if !names.is_empty() {
                                meta.author = Some(names.join(", "));
                            }
                        }
                    }
                    if let Some(ver) = ql.get("version").and_then(|v| v.as_str()) {
                        meta.version = Some(ver.to_string());
                    }
                }
                if meta.name.is_some() {
                    return meta;
                }
            }
        }
    }

    // 3. Try META-INF/mods.toml (Forge) or META-INF/neoforge.mods.toml (NeoForge)
    let toml_paths = ["META-INF/mods.toml", "META-INF/neoforge.mods.toml"];
    for toml_path in toml_paths {
        if let Ok(mut mod_file) = archive.by_name(toml_path) {
            let mut contents = String::new();
            if mod_file.read_to_string(&mut contents).is_ok() {
                if let Ok(value) = contents.parse::<toml::Value>() {
                    if let Some(mods_array) = value.get("mods").and_then(|m| m.as_array()) {
                        if let Some(first_mod) = mods_array.first() {
                            if meta.name.is_none() {
                                if let Some(name) =
                                    first_mod.get("displayName").and_then(|v| v.as_str())
                                {
                                    meta.name = Some(name.to_string());
                                } else if let Some(mod_id) =
                                    first_mod.get("modId").and_then(|v| v.as_str())
                                {
                                    meta.name = Some(mod_id.to_string());
                                }
                            }
                            if meta.version.is_none() {
                                if let Some(version) =
                                    first_mod.get("version").and_then(|v| v.as_str())
                                {
                                    if version != "${file.jarVersion}" {
                                        meta.version = Some(version.to_string());
                                    }
                                }
                            }
                            if meta.author.is_none() {
                                if let Some(authors) =
                                    first_mod.get("authors").and_then(|v| v.as_str())
                                {
                                    meta.author = Some(authors.to_string());
                                }
                            }
                            if meta.description.is_none() {
                                if let Some(desc) =
                                    first_mod.get("description").and_then(|v| v.as_str())
                                {
                                    meta.description = Some(desc.trim().to_string());
                                }
                            }
                        }
                    }
                }
                if meta.name.is_some() {
                    return meta;
                }
            }
        }
    }

    // 4. Try mcmod.info (Legacy Forge)
    if let Ok(mut mod_file) = archive.by_name("mcmod.info") {
        let mut contents = String::new();
        if mod_file.read_to_string(&mut contents).is_ok() {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&contents) {
                let obj = if let Some(arr) = v.as_array().and_then(|a| a.first()) {
                    Some(arr)
                } else if v.is_object() {
                    Some(&v)
                } else {
                    None
                };

                if let Some(o) = obj {
                    if let Some(n) = o.get("name").and_then(|n| n.as_str()) {
                        meta.name = Some(n.to_string());
                    }
                    if let Some(ver) = o.get("version").and_then(|v| v.as_str()) {
                        meta.version = Some(ver.to_string());
                    }
                    if let Some(desc) = o.get("description").and_then(|d| d.as_str()) {
                        meta.description = Some(desc.trim().to_string());
                    }
                    if let Some(authors) = o.get("authorList").and_then(|a| a.as_array()) {
                        let names: Vec<String> = authors
                            .iter()
                            .filter_map(|a| a.as_str().map(String::from))
                            .collect();
                        if !names.is_empty() {
                            meta.author = Some(names.join(", "));
                        }
                    }
                }
            }
        }
    }

    meta
}
