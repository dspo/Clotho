use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde_json::Value as JsonValue;
use toml::Value;

use crate::error::{Error, Result};
use crate::models::{ConfigDescriptor, ConfigSelection, ListConfigsResponse, ResolvedConfig};

const DEFAULT_CONFIG_ID: &str = "default";

pub trait ConfigProvider: Send + Sync {
    fn list_configs(&self) -> Result<ListConfigsResponse>;

    fn resolve_config(&self, selection: Option<&ConfigSelection>) -> Result<ResolvedConfig>;

    fn request_overrides(
        &self,
        selection: Option<&ConfigSelection>,
    ) -> Result<HashMap<String, JsonValue>>;
}

pub type SharedConfigProvider = Arc<dyn ConfigProvider>;

#[derive(Debug, Clone)]
pub struct TomlConfigProvider {
    config_path: PathBuf,
    config_id: String,
    label: String,
    source: String,
    is_default: bool,
}

#[derive(Debug, Clone)]
pub struct DefaultConfigProvider {
    inner: TomlConfigProvider,
}

impl TomlConfigProvider {
    pub fn new(
        config_id: impl Into<String>,
        label: impl Into<String>,
        source: impl Into<String>,
        config_path: PathBuf,
    ) -> Self {
        Self {
            config_path,
            config_id: config_id.into(),
            label: label.into(),
            source: source.into(),
            is_default: false,
        }
    }

    pub fn with_default(mut self, is_default: bool) -> Self {
        self.is_default = is_default;
        self
    }

    fn descriptor(&self) -> ConfigDescriptor {
        ConfigDescriptor {
            config_id: self.config_id.clone(),
            label: self.label.clone(),
            source: self.source.clone(),
            config_file_path: Some(stringify_path(&self.config_path)),
            exists: self.config_path.exists(),
            is_default: self.is_default,
        }
    }

    fn validate_selection(&self, selection: Option<&ConfigSelection>) -> Result<()> {
        if let Some(selection) = selection {
            if let Some(config_id) = selection.config_id.as_deref() {
                if config_id != self.config_id {
                    return Err(Error::InvalidInput(format!(
                        "config `{config_id}` is not available from the default config provider"
                    )));
                }
            }
        }

        Ok(())
    }
}

impl ConfigProvider for TomlConfigProvider {
    fn list_configs(&self) -> Result<ListConfigsResponse> {
        Ok(ListConfigsResponse {
            items: vec![self.descriptor()],
        })
    }

    fn resolve_config(&self, selection: Option<&ConfigSelection>) -> Result<ResolvedConfig> {
        self.validate_selection(selection)?;

        let profile = selection.and_then(|selection| selection.profile.clone());
        let effective_table = resolve_effective_table(&self.config_path, profile.as_deref())?;
        build_resolved_config(
            self.config_id.clone(),
            self.label.clone(),
            self.source.clone(),
            Some(stringify_path(&self.config_path)),
            profile,
            effective_table,
        )
    }

    fn request_overrides(
        &self,
        selection: Option<&ConfigSelection>,
    ) -> Result<HashMap<String, JsonValue>> {
        self.validate_selection(selection)?;

        let profile = selection.and_then(|selection| selection.profile.as_deref());
        let effective_table = resolve_effective_table(&self.config_path, profile)?;
        let mut output = HashMap::new();
        flatten_table(None, &effective_table, &mut output)?;
        Ok(output)
    }
}

impl Default for DefaultConfigProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl DefaultConfigProvider {
    pub fn new() -> Self {
        let config_path = dirs::home_dir()
            .map(|home| home.join(".codex").join("config.toml"))
            .unwrap_or_else(|| PathBuf::from("~/.codex/config.toml"));
        Self::from_path(config_path)
    }

    pub fn from_path(config_path: PathBuf) -> Self {
        Self {
            inner: TomlConfigProvider::new(
                DEFAULT_CONFIG_ID,
                "~/.codex/config.toml",
                "user",
                config_path,
            )
            .with_default(true),
        }
    }
}

impl ConfigProvider for DefaultConfigProvider {
    fn list_configs(&self) -> Result<ListConfigsResponse> {
        self.inner.list_configs()
    }

    fn resolve_config(&self, selection: Option<&ConfigSelection>) -> Result<ResolvedConfig> {
        self.inner.resolve_config(selection)
    }

    fn request_overrides(
        &self,
        selection: Option<&ConfigSelection>,
    ) -> Result<HashMap<String, JsonValue>> {
        self.inner.request_overrides(selection)
    }
}

fn stringify_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn table_value<'a>(table: &'a toml::map::Map<String, Value>, key: &str) -> Option<&'a Value> {
    table.get(key)
}

fn string_from_table(table: Option<&toml::map::Map<String, Value>>, key: &str) -> Option<String> {
    table.and_then(|table| table_value(table, key))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn load_root_table(config_file_path: &Path) -> Result<toml::map::Map<String, Value>> {
    let content = fs::read_to_string(config_file_path)?;
    let root = content.parse::<Value>()?;
    Ok(root.as_table().cloned().unwrap_or_default())
}

fn resolve_effective_table(
    config_file_path: &Path,
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

fn build_resolved_config(
    config_id: String,
    label: String,
    source: String,
    config_file_path: Option<String>,
    profile: Option<String>,
    effective_table: toml::map::Map<String, Value>,
) -> Result<ResolvedConfig> {
    let model = string_from_table(Some(&effective_table), "model").unwrap_or_default();
    let provider =
        string_from_table(Some(&effective_table), "model_provider").unwrap_or_else(|| "openai".to_string());
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
        config_id,
        label,
        source,
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

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::{ConfigProvider, ConfigSelection, DefaultConfigProvider};
    use uuid::Uuid;

    fn write_temp_config(contents: &str) -> PathBuf {
        let unique = Uuid::new_v4();
        let dir = std::env::temp_dir().join(format!("agent-runtime-config-test-{unique}"));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let path = dir.join("config.toml");
        std::fs::write(&path, contents).expect("write config");
        path
    }

    #[test]
    fn default_provider_lists_single_default_config() {
        let path = write_temp_config(r#"model = "gpt-5.4""#);
        let provider = DefaultConfigProvider::from_path(path.clone());

        let response = provider.list_configs().expect("list configs");
        assert_eq!(response.items.len(), 1);
        assert_eq!(response.items[0].config_id, "default");
        assert_eq!(
            response.items[0].config_file_path.as_deref(),
            Some(path.to_string_lossy().as_ref())
        );
        assert!(response.items[0].is_default);
    }

    #[test]
    fn default_provider_merges_profiles_and_flattens_overrides() {
        let path = write_temp_config(
            r#"
model = "gpt-5.4"
model_provider = "openai"

[model_providers.openai]
env_key = "OPENAI_API_KEY"
wire_api = "responses"

[profiles.compat]
model_provider = "compat"
model = "gpt-4.1"

[profiles.compat.model_providers.compat]
base_url = "https://example.com/v1"
env_key = "COMPAT_API_KEY"
wire_api = "chat_completions"
"#,
        );
        let provider = DefaultConfigProvider::from_path(path);
        let selection = ConfigSelection {
            config_id: None,
            profile: Some("compat".to_string()),
        };

        let resolved = provider
            .resolve_config(Some(&selection))
            .expect("resolve config");
        assert_eq!(resolved.provider, "compat");
        assert_eq!(resolved.model, "gpt-4.1");
        assert_eq!(resolved.base_url.as_deref(), Some("https://example.com/v1"));
        assert_eq!(resolved.env_key.as_deref(), Some("COMPAT_API_KEY"));
        assert_eq!(resolved.wire_api, "chat_completions");

        let overrides = provider
            .request_overrides(Some(&selection))
            .expect("request overrides");
        assert_eq!(
            overrides.get("model_provider").and_then(|value| value.as_str()),
            Some("compat")
        );
        assert_eq!(
            overrides
                .get("model_providers.compat.base_url")
                .and_then(|value| value.as_str()),
            Some("https://example.com/v1")
        );
    }

    #[test]
    fn default_provider_rejects_unknown_config_ids() {
        let path = write_temp_config(r#"model = "gpt-5.4""#);
        let provider = DefaultConfigProvider::from_path(path);
        let selection = ConfigSelection {
            config_id: Some("demo".to_string()),
            profile: None,
        };

        let err = provider
            .resolve_config(Some(&selection))
            .expect_err("unknown config id must fail");
        assert!(err.to_string().contains("config `demo`"));
    }
}
