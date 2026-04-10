use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde_json::Value as JsonValue;
use tauri_plugin_agent_runtime::{
    ConfigDescriptor, ConfigProvider, ConfigSelection, Error, ListConfigsResponse, ResolvedConfig,
    Result, WireApi,
};
use toml::Value;

type TomlTable = toml::map::Map<String, Value>;

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

fn candidate(source: &str, path: PathBuf, is_default: bool) -> ConfigDescriptor {
    ConfigDescriptor {
        config_id: stringify_path(&path),
        label: stringify_path(&path),
        source: source.to_string(),
        config_file_path: Some(stringify_path(&path)),
        exists: path.exists(),
        is_default,
    }
}

fn candidate_descriptors() -> Vec<ConfigDescriptor> {
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
    items
}

fn default_config_descriptor() -> Result<ConfigDescriptor> {
    candidate_descriptors()
        .into_iter()
        .find(|descriptor| descriptor.is_default)
        .or_else(|| candidate_descriptors().into_iter().next())
        .ok_or_else(|| Error::InvalidInput("no Codex config paths are available".to_string()))
}

fn resolve_descriptor(selection: Option<&ConfigSelection>) -> Result<ConfigDescriptor> {
    if let Some(config_id) = selection.and_then(|selection| selection.config_id.as_deref()) {
        let trimmed = config_id.trim();
        if trimmed.is_empty() {
            return Err(Error::InvalidInput(
                "config selection must not be empty".to_string(),
            ));
        }

        if let Some(descriptor) = candidate_descriptors()
            .into_iter()
            .find(|descriptor| descriptor.config_id == trimmed)
        {
            return Ok(descriptor);
        }

        let path = PathBuf::from(trimmed);
        return Ok(ConfigDescriptor {
            config_id: trimmed.to_string(),
            label: trimmed.to_string(),
            source: "custom".to_string(),
            config_file_path: Some(stringify_path(&path)),
            exists: path.exists(),
            is_default: false,
        });
    }

    default_config_descriptor()
}

fn load_root_table(config_file_path: &Path) -> Result<TomlTable> {
    let content = fs::read_to_string(config_file_path)?;
    let root = content.parse::<Value>()?;
    Ok(root.as_table().cloned().unwrap_or_default())
}

fn resolve_effective_table(config_file_path: &Path, profile: Option<&str>) -> Result<TomlTable> {
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

fn merge_tables(base: &mut TomlTable, overlay: &TomlTable) {
    for (key, overlay_value) in overlay {
        match (base.get_mut(key), overlay_value) {
            (Some(Value::Table(base_table)), Value::Table(overlay_table)) => {
                merge_tables(base_table, overlay_table);
            }
            _ => {
                let value: Value = overlay_value.clone();
                base.insert(key.clone(), value);
            }
        }
    }
}

fn table_value<'a>(table: &'a TomlTable, key: &str) -> Option<&'a Value> {
    table.get(key)
}

fn string_from_table(table: Option<&TomlTable>, key: &str) -> Option<String> {
    table
        .and_then(|table| table_value(table, key))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn parse_wire_api(provider_table: Option<&TomlTable>) -> Result<WireApi> {
    match string_from_table(provider_table, "wire_api").as_deref() {
        None | Some("responses") => Ok(WireApi::Responses),
        Some("chat_completions") => Ok(WireApi::ChatCompletions),
        Some(other) => Err(Error::InvalidInput(format!(
            "unsupported wire_api `{other}`; expected `responses` or `chat_completions`"
        ))),
    }
}

fn build_resolved_config(
    descriptor: ConfigDescriptor,
    profile: Option<String>,
    effective_table: TomlTable,
) -> Result<ResolvedConfig> {
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
        .and_then(|providers: &TomlTable| providers.get(&provider))
        .and_then(Value::as_table);

    let base_url = string_from_table(provider_table, "base_url");
    let env_key = string_from_table(provider_table, "env_key");
    let wire_api = parse_wire_api(provider_table)?;
    let provider_config = provider_table
        .map(|table| serde_json::to_value(table))
        .transpose()?;

    Ok(ResolvedConfig {
        config_id: descriptor.config_id,
        label: descriptor.label,
        source: descriptor.source,
        config_file_path: descriptor.config_file_path,
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

fn flatten_table(
    prefix: Option<&str>,
    table: &TomlTable,
    output: &mut HashMap<String, JsonValue>,
) -> Result<()> {
    for (key, value) in table {
        let dotted_key: String = match prefix {
            Some(prefix) if !prefix.is_empty() => format!("{prefix}.{key}"),
            _ => key.to_string(),
        };
        match value {
            Value::Table(nested) => flatten_table(Some(&dotted_key), nested, output)?,
            other => {
                output.insert(dotted_key, serde_json::to_value(other)?);
            }
        }
    }
    Ok(())
}

#[derive(Default)]
pub struct ClothoConfigProvider;

impl ConfigProvider for ClothoConfigProvider {
    fn list_configs(&self) -> Result<ListConfigsResponse> {
        Ok(ListConfigsResponse {
            items: candidate_descriptors(),
        })
    }

    fn resolve_config(&self, selection: Option<&ConfigSelection>) -> Result<ResolvedConfig> {
        let descriptor = resolve_descriptor(selection)?;
        let config_path = descriptor
            .config_file_path
            .as_ref()
            .map(PathBuf::from)
            .ok_or_else(|| Error::InvalidInput("config path is unavailable".to_string()))?;
        let profile = selection.and_then(|selection| selection.profile.clone());
        let effective_table = resolve_effective_table(&config_path, profile.as_deref())?;
        build_resolved_config(descriptor, profile, effective_table)
    }

    fn request_overrides(
        &self,
        selection: Option<&ConfigSelection>,
    ) -> Result<HashMap<String, JsonValue>> {
        let descriptor = resolve_descriptor(selection)?;
        let config_path = descriptor
            .config_file_path
            .as_ref()
            .map(PathBuf::from)
            .ok_or_else(|| Error::InvalidInput("config path is unavailable".to_string()))?;
        let profile = selection.and_then(|selection| selection.profile.as_deref());
        let effective_table = resolve_effective_table(&config_path, profile)?;
        let mut output = HashMap::new();
        flatten_table(None, &effective_table, &mut output)?;
        Ok(output)
    }
}

pub fn shared_config_provider() -> Arc<dyn ConfigProvider> {
    Arc::new(ClothoConfigProvider)
}
