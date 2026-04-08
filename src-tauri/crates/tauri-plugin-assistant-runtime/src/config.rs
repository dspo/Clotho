use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value as JsonValue;
use toml::Value;

use crate::error::{Error, Result};
use crate::models::{ConfigFileCandidate, ConfigSelection, ListConfigFilesResponse, ResolvedConfig};

fn project_config_path() -> Option<PathBuf> {
    env::current_dir()
        .ok()
        .map(|dir| dir.join(".codex").join("config.toml"))
}

fn user_config_path() -> Option<PathBuf> {
    env::var_os("HOME")
        .map(PathBuf::from)
        .map(|home| home.join(".codex").join("config.toml"))
}

fn stringify_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn candidate(source: &str, path: PathBuf, is_default: bool) -> ConfigFileCandidate {
    ConfigFileCandidate {
        path: stringify_path(&path),
        source: source.to_string(),
        exists: path.exists(),
        is_default,
    }
}

fn table_value<'a>(table: &'a toml::map::Map<String, Value>, key: &str) -> Option<&'a Value> {
    table.get(key)
}

fn string_from_table(table: Option<&toml::map::Map<String, Value>>, key: &str) -> Option<String> {
    table.and_then(|table| table_value(table, key))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn load_root_table(config_file_path: &str) -> Result<toml::map::Map<String, Value>> {
    let content = fs::read_to_string(config_file_path)?;
    let root = content.parse::<Value>()?;
    Ok(root.as_table().cloned().unwrap_or_default())
}

fn resolve_effective_table(
    config_file_path: &str,
    profile: Option<&str>,
) -> Result<toml::map::Map<String, Value>> {
    let mut root_table = load_root_table(config_file_path)?;
    let profiles = root_table
        .get("profiles")
        .and_then(Value::as_table)
        .cloned()
        .unwrap_or_default();
    root_table.remove("profiles");

    if let Some(profile_name) = profile {
        let profile_table = profiles
            .get(profile_name)
            .and_then(Value::as_table)
            .cloned()
            .ok_or_else(|| Error::InvalidInput(format!("profile `{profile_name}` not found")))?;
        merge_tables(&mut root_table, &profile_table);
    }

    Ok(root_table)
}

fn merge_tables(
    base: &mut toml::map::Map<String, Value>,
    overlay: &toml::map::Map<String, Value>,
) {
    for (key, overlay_value) in overlay {
        match (base.get_mut(key), overlay_value) {
            (Some(Value::Table(base_table)), Value::Table(overlay_table)) => {
                merge_tables(base_table, overlay_table);
            }
            _ => {
                base.insert(key.clone(), overlay_value.clone());
            }
        }
    }
}

fn flatten_table(
    prefix: Option<&str>,
    table: &toml::map::Map<String, Value>,
    output: &mut HashMap<String, JsonValue>,
) -> Result<()> {
    for (key, value) in table {
        let dotted_key = match prefix {
            Some(prefix) if !prefix.is_empty() => format!("{prefix}.{key}"),
            _ => key.clone(),
        };
        match value {
            Value::Table(nested) => flatten_table(Some(&dotted_key), nested, output)?,
            other => {
                output.insert(dotted_key, toml_to_json(other)?);
            }
        }
    }
    Ok(())
}

fn toml_to_json(value: &Value) -> Result<JsonValue> {
    serde_json::to_value(value).map_err(Into::into)
}

pub fn list_config_files() -> ListConfigFilesResponse {
    let project = project_config_path();
    let user = user_config_path();
    let project_exists = project.as_ref().is_some_and(|path| path.exists());
    let user_exists = user.as_ref().is_some_and(|path| path.exists());

    let mut items = Vec::new();
    if let Some(project) = project {
        items.push(candidate("project", project, project_exists || !user_exists));
    }
    if let Some(user) = user {
        items.push(candidate("user", user, !project_exists));
    }

    ListConfigFilesResponse { items }
}

pub fn resolve_config_profile(
    config_file_path: String,
    profile: Option<String>,
) -> Result<ResolvedConfig> {
    let effective_table = resolve_effective_table(&config_file_path, profile.as_deref())?;
    let model = string_from_table(Some(&effective_table), "model").unwrap_or_default();
    let provider = string_from_table(Some(&effective_table), "model_provider")
        .unwrap_or_else(|| "openai".to_string());
    let approval_policy = string_from_table(Some(&effective_table), "approval_policy");
    let sandbox_mode = string_from_table(Some(&effective_table), "sandbox_mode");
    let reasoning_effort = string_from_table(Some(&effective_table), "model_reasoning_effort");
    let reasoning_summary = string_from_table(Some(&effective_table), "model_reasoning_summary");
    let verbosity = string_from_table(Some(&effective_table), "model_verbosity");
    let personality = string_from_table(Some(&effective_table), "personality");
    let service_tier = string_from_table(Some(&effective_table), "service_tier");

    let provider_table = effective_table
        .get("model_providers")
        .and_then(Value::as_table)
        .and_then(|providers| providers.get(&provider))
        .and_then(Value::as_table);

    let base_url = string_from_table(provider_table, "base_url");
    let env_key = string_from_table(provider_table, "env_key");
    let wire_api =
        string_from_table(provider_table, "wire_api").unwrap_or_else(|| "responses".to_string());
    let provider_config = provider_table
        .map(|table| serde_json::to_value(table))
        .transpose()?;

    Ok(ResolvedConfig {
        config_file_path,
        profile,
        model,
        provider,
        base_url,
        env_key,
        wire_api,
        approval_policy,
        sandbox_mode,
        reasoning_effort,
        reasoning_summary,
        verbosity,
        personality,
        service_tier,
        provider_config,
    })
}

pub fn request_overrides_from_selection(
    selection: &ConfigSelection,
) -> Result<HashMap<String, JsonValue>> {
    let effective_table = resolve_effective_table(
        &selection.config_file_path,
        selection.profile.as_deref(),
    )?;
    let mut output = HashMap::new();
    flatten_table(None, &effective_table, &mut output)?;
    Ok(output)
}
