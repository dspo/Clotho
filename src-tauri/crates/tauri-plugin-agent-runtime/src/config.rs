use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde_json::Value as JsonValue;
use toml::Value;

use crate::error::{Error, Result};
use crate::models::{
    ConfigDescriptor, ConfigSelection, ListConfigsResponse, ResolvedConfig, WireApi,
};

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

/// A config candidate discovered by [`MultiSourceConfigProvider`].
#[derive(Debug, Clone)]
struct ConfigCandidate {
    source: String,
    config_path: PathBuf,
    is_default: bool,
}

/// A config provider that discovers multiple config sources (e.g. project-local
/// and user-level TOML files) with priority-based fallback.
///
/// Use [`MultiSourceConfigProvider::codex_defaults`] for the standard two-source
/// layout: `CWD/.codex/config.toml` (project, highest priority) and
/// `~/.codex/config.toml` (user). Custom paths can be added via
/// [`MultiSourceConfigProvider::with_candidate`].
#[derive(Debug, Clone)]
pub struct MultiSourceConfigProvider {
    candidates: Vec<ConfigCandidate>,
}

impl MultiSourceConfigProvider {
    /// Creates a provider with the standard Codex two-source layout.
    ///
    /// - Project: `CWD/.codex/config.toml` (default when it exists)
    /// - User: `~/.codex/config.toml` (default when project does not exist)
    pub fn codex_defaults() -> Self {
        let project_path = env::current_dir()
            .ok()
            .map(|dir| dir.join(".codex").join("config.toml"));
        let user_path = dirs::home_dir().map(|home| home.join(".codex").join("config.toml"));

        let project_exists = project_path.as_ref().is_some_and(|p| p.exists());
        let user_exists = user_path.as_ref().is_some_and(|p| p.exists());

        let mut candidates = Vec::new();
        if let Some(path) = project_path {
            candidates.push(ConfigCandidate {
                source: "project".to_string(),
                config_path: path,
                is_default: project_exists || !user_exists,
            });
        }
        if let Some(path) = user_path {
            candidates.push(ConfigCandidate {
                source: "user".to_string(),
                config_path: path,
                is_default: !project_exists,
            });
        }

        Self { candidates }
    }

    /// Adds an additional config candidate.
    pub fn with_candidate(mut self, source: &str, path: PathBuf) -> Self {
        self.candidates.push(ConfigCandidate {
            source: source.to_string(),
            config_path: path,
            is_default: false,
        });
        self
    }

    fn descriptors(&self) -> Vec<ConfigDescriptor> {
        self.candidates
            .iter()
            .map(|c| ConfigDescriptor {
                config_id: stringify_path(&c.config_path),
                label: stringify_path(&c.config_path),
                source: c.source.clone(),
                config_file_path: Some(stringify_path(&c.config_path)),
                exists: c.config_path.exists(),
                is_default: c.is_default,
            })
            .collect()
    }

    fn resolve_descriptor(&self, selection: Option<&ConfigSelection>) -> Result<ConfigDescriptor> {
        if let Some(config_id) = selection.and_then(|s| s.config_id.as_deref()) {
            let trimmed = config_id.trim();
            if trimmed.is_empty() {
                return Err(Error::InvalidInput(
                    "config selection must not be empty".to_string(),
                ));
            }

            // Match against known candidates first.
            if let Some(descriptor) = self
                .descriptors()
                .into_iter()
                .find(|d| d.config_id == trimmed)
            {
                return Ok(descriptor);
            }

            // Treat the config_id as a custom file path.
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

        // Fall back to the default candidate.
        self.descriptors()
            .into_iter()
            .find(|d| d.is_default)
            .or_else(|| self.descriptors().into_iter().next())
            .ok_or_else(|| Error::InvalidInput("no config paths are available".to_string()))
    }
}

impl ConfigProvider for MultiSourceConfigProvider {
    fn list_configs(&self) -> Result<ListConfigsResponse> {
        Ok(ListConfigsResponse {
            items: self.descriptors(),
        })
    }

    fn resolve_config(&self, selection: Option<&ConfigSelection>) -> Result<ResolvedConfig> {
        let descriptor = self.resolve_descriptor(selection)?;
        let config_path = descriptor
            .config_file_path
            .as_ref()
            .map(PathBuf::from)
            .ok_or_else(|| Error::InvalidInput("config path is unavailable".to_string()))?;
        let profile = selection.and_then(|s| s.profile.clone());
        let effective_table = resolve_effective_table(&config_path, profile.as_deref())?;
        build_resolved_config(
            descriptor.config_id,
            descriptor.label,
            descriptor.source,
            descriptor.config_file_path,
            profile,
            effective_table,
        )
    }

    fn request_overrides(
        &self,
        selection: Option<&ConfigSelection>,
    ) -> Result<HashMap<String, JsonValue>> {
        let descriptor = self.resolve_descriptor(selection)?;
        let config_path = descriptor
            .config_file_path
            .as_ref()
            .map(PathBuf::from)
            .ok_or_else(|| Error::InvalidInput("config path is unavailable".to_string()))?;
        let profile = selection.and_then(|s| s.profile.as_deref());
        let effective_table = resolve_effective_table(&config_path, profile)?;
        let mut output = HashMap::new();
        flatten_table(None, &effective_table, &mut output)?;
        Ok(output)
    }
}

fn stringify_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn table_value<'a>(table: &'a toml::map::Map<String, Value>, key: &str) -> Option<&'a Value> {
    table.get(key)
}

fn string_from_table(table: Option<&toml::map::Map<String, Value>>, key: &str) -> Option<String> {
    table
        .and_then(|table| table_value(table, key))
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

fn merge_tables(base: &mut toml::map::Map<String, Value>, overlay: &toml::map::Map<String, Value>) {
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
    let wire_api = parse_wire_api(provider_table)?;
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

fn parse_wire_api(provider_table: Option<&toml::map::Map<String, Value>>) -> Result<WireApi> {
    match string_from_table(provider_table, "wire_api").as_deref() {
        None | Some("responses") => Ok(WireApi::Responses),
        Some("chat_completions") => Ok(WireApi::ChatCompletions),
        Some(other) => Err(Error::InvalidInput(format!(
            "unsupported wire_api `{other}`; expected `responses` or `chat_completions`"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::{ConfigProvider, ConfigSelection, DefaultConfigProvider, MultiSourceConfigProvider};
    use crate::models::WireApi;
    use uuid::Uuid;

    fn write_temp_config(contents: &str) -> PathBuf {
        let unique = Uuid::new_v4();
        let dir = std::env::temp_dir().join(format!("agent-runtime-config-test-{unique}"));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let path = dir.join("config.toml");
        std::fs::write(&path, contents).expect("write config");
        path
    }

    fn make_temp_dir() -> PathBuf {
        let unique = Uuid::new_v4();
        let dir = std::env::temp_dir().join(format!("agent-runtime-config-test-{unique}"));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        dir
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
        assert_eq!(resolved.wire_api, WireApi::ChatCompletions);

        let overrides = provider
            .request_overrides(Some(&selection))
            .expect("request overrides");
        assert_eq!(
            overrides
                .get("model_provider")
                .and_then(|value| value.as_str()),
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

    #[test]
    fn default_provider_rejects_unknown_wire_api_values() {
        let path = write_temp_config(
            r#"
model = "gpt-5.4"
model_provider = "openai"

[model_providers.openai]
wire_api = "legacy"
"#,
        );
        let provider = DefaultConfigProvider::from_path(path);

        let err = provider
            .resolve_config(None)
            .expect_err("invalid wire_api must fail");
        assert!(err
            .to_string()
            .contains("unsupported wire_api `legacy`; expected `responses` or `chat_completions`"));
    }

    // -- MultiSourceConfigProvider tests --

    #[test]
    fn multi_source_lists_both_candidates() {
        let project_path = write_temp_config(r#"model = "project-model""#);
        let user_path = write_temp_config(r#"model = "user-model""#);

        let provider = MultiSourceConfigProvider {
            candidates: vec![
                super::ConfigCandidate {
                    source: "project".to_string(),
                    config_path: project_path.clone(),
                    is_default: true,
                },
                super::ConfigCandidate {
                    source: "user".to_string(),
                    config_path: user_path.clone(),
                    is_default: false,
                },
            ],
        };

        let response = provider.list_configs().expect("list configs");
        assert_eq!(response.items.len(), 2);
        assert_eq!(response.items[0].source, "project");
        assert!(response.items[0].exists);
        assert!(response.items[0].is_default);
        assert_eq!(response.items[1].source, "user");
        assert!(response.items[1].exists);
        assert!(!response.items[1].is_default);
    }

    #[test]
    fn multi_source_resolves_default_candidate() {
        let project_path = write_temp_config(r#"model = "project-model""#);
        let user_path = write_temp_config(r#"model = "user-model""#);

        let provider = MultiSourceConfigProvider {
            candidates: vec![
                super::ConfigCandidate {
                    source: "project".to_string(),
                    config_path: project_path,
                    is_default: true,
                },
                super::ConfigCandidate {
                    source: "user".to_string(),
                    config_path: user_path,
                    is_default: false,
                },
            ],
        };

        let resolved = provider.resolve_config(None).expect("resolve config");
        assert_eq!(resolved.model, "project-model");
        assert_eq!(resolved.source, "project");
    }

    #[test]
    fn multi_source_selects_by_config_id() {
        let project_path = write_temp_config(r#"model = "project-model""#);
        let user_path = write_temp_config(r#"model = "user-model""#);

        let provider = MultiSourceConfigProvider {
            candidates: vec![
                super::ConfigCandidate {
                    source: "project".to_string(),
                    config_path: project_path,
                    is_default: true,
                },
                super::ConfigCandidate {
                    source: "user".to_string(),
                    config_path: user_path.clone(),
                    is_default: false,
                },
            ],
        };

        let selection = ConfigSelection {
            config_id: Some(user_path.to_string_lossy().into_owned()),
            profile: None,
        };
        let resolved = provider
            .resolve_config(Some(&selection))
            .expect("resolve by config_id");
        assert_eq!(resolved.model, "user-model");
        assert_eq!(resolved.source, "user");
    }

    #[test]
    fn multi_source_accepts_custom_path() {
        let custom_path = write_temp_config(r#"model = "custom-model""#);

        let provider = MultiSourceConfigProvider {
            candidates: vec![],
        };

        let selection = ConfigSelection {
            config_id: Some(custom_path.to_string_lossy().into_owned()),
            profile: None,
        };
        let resolved = provider
            .resolve_config(Some(&selection))
            .expect("resolve custom path");
        assert_eq!(resolved.model, "custom-model");
        assert_eq!(resolved.source, "custom");
    }

    #[test]
    fn multi_source_with_candidate_adds_extra() {
        let user_path = write_temp_config(r#"model = "user-model""#);
        let extra_path = write_temp_config(r#"model = "extra-model""#);

        let provider = MultiSourceConfigProvider {
            candidates: vec![super::ConfigCandidate {
                source: "user".to_string(),
                config_path: user_path,
                is_default: true,
            }],
        }
        .with_candidate("extra", extra_path.clone());

        let response = provider.list_configs().expect("list configs");
        assert_eq!(response.items.len(), 2);
        assert_eq!(response.items[1].source, "extra");

        let selection = ConfigSelection {
            config_id: Some(extra_path.to_string_lossy().into_owned()),
            profile: None,
        };
        let resolved = provider
            .resolve_config(Some(&selection))
            .expect("resolve extra");
        assert_eq!(resolved.model, "extra-model");
    }

    #[test]
    fn multi_source_rejects_empty_config_id() {
        let provider = MultiSourceConfigProvider {
            candidates: vec![],
        };
        let selection = ConfigSelection {
            config_id: Some("  ".to_string()),
            profile: None,
        };
        let err = provider
            .resolve_config(Some(&selection))
            .expect_err("empty config id must fail");
        assert!(err.to_string().contains("config selection must not be empty"));
    }

    #[test]
    fn multi_source_nonexistent_candidate_shows_not_exists() {
        let dir = make_temp_dir();
        let missing_path = dir.join("nonexistent.toml");

        let provider = MultiSourceConfigProvider {
            candidates: vec![super::ConfigCandidate {
                source: "project".to_string(),
                config_path: missing_path,
                is_default: true,
            }],
        };

        let response = provider.list_configs().expect("list configs");
        assert_eq!(response.items.len(), 1);
        assert!(!response.items[0].exists);
    }

    #[test]
    fn multi_source_merges_profiles() {
        let path = write_temp_config(
            r#"
model = "base-model"
model_provider = "openai"

[profiles.fast]
model = "fast-model"
"#,
        );

        let provider = MultiSourceConfigProvider {
            candidates: vec![super::ConfigCandidate {
                source: "user".to_string(),
                config_path: path,
                is_default: true,
            }],
        };

        let selection = ConfigSelection {
            config_id: None,
            profile: Some("fast".to_string()),
        };
        let resolved = provider
            .resolve_config(Some(&selection))
            .expect("resolve with profile");
        assert_eq!(resolved.model, "fast-model");
        assert_eq!(resolved.provider, "openai");
    }

    #[test]
    fn multi_source_request_overrides_flattens() {
        let path = write_temp_config(
            r#"
model = "gpt-5.4"
model_provider = "openai"

[model_providers.openai]
base_url = "https://api.openai.com/v1"
"#,
        );

        let provider = MultiSourceConfigProvider {
            candidates: vec![super::ConfigCandidate {
                source: "user".to_string(),
                config_path: path,
                is_default: true,
            }],
        };

        let overrides = provider.request_overrides(None).expect("request overrides");
        assert_eq!(
            overrides.get("model").and_then(|v| v.as_str()),
            Some("gpt-5.4")
        );
        assert_eq!(
            overrides
                .get("model_providers.openai.base_url")
                .and_then(|v| v.as_str()),
            Some("https://api.openai.com/v1")
        );
    }
}
