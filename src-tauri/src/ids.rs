/// Filesystem-safe instance folder names (no path separators or `..`).
pub fn assert_safe_instance_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 128 {
        return Err("Invalid instance id".to_string());
    }
    if id.contains("..") || id.contains('/') || id.contains('\\') {
        return Err("Invalid instance id".to_string());
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Invalid instance id".to_string());
    }
    Ok(())
}

pub fn looks_like_modrinth_version_id(s: &str) -> bool {
    let t = s.trim();
    t.len() == 8 && t.chars().all(|c| c.is_ascii_alphanumeric())
}

pub fn normalize_loader_label(raw: &str) -> String {
    match raw.trim().to_ascii_lowercase().as_str() {
        "" => String::new(),
        "fabric" | "fabric-loader" => "Fabric".to_string(),
        "forge" => "Forge".to_string(),
        "neoforge" => "NeoForge".to_string(),
        "quilt" | "quilt-loader" => "Quilt".to_string(),
        other => {
            let mut chars = other.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        }
    }
}

pub fn jar_leaf(name: &str) -> String {
    name.replace('\\', "/")
        .rsplit('/')
        .next()
        .unwrap_or(name)
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_path_traversal_instance_ids() {
        assert!(assert_safe_instance_id("../evil").is_err());
        assert!(assert_safe_instance_id("a/b").is_err());
        assert!(assert_safe_instance_id("a\\b").is_err());
        assert!(assert_safe_instance_id("").is_err());
        assert!(assert_safe_instance_id("all-the-mods-9").is_ok());
        assert!(assert_safe_instance_id("pack_1").is_ok());
    }

    #[test]
    fn detects_modrinth_version_ids() {
        assert!(looks_like_modrinth_version_id("2XUIKIAa"));
        assert!(!looks_like_modrinth_version_id("2.2.3"));
        assert!(!looks_like_modrinth_version_id("latest"));
        assert!(!looks_like_modrinth_version_id("abcd"));
    }

    #[test]
    fn normalizes_loader_labels() {
        assert_eq!(normalize_loader_label("fabric-loader"), "Fabric");
        assert_eq!(normalize_loader_label("neoforge"), "NeoForge");
        assert_eq!(normalize_loader_label("Forge"), "Forge");
        assert_eq!(normalize_loader_label(""), "");
    }

    #[test]
    fn jar_leaf_strips_dirs() {
        assert_eq!(jar_leaf("mods/foo.jar"), "foo.jar");
        assert_eq!(jar_leaf("..\\foo.jar"), "foo.jar");
    }
}
