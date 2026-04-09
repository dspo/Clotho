use std::path::PathBuf;
use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};
use tauri_plugin_agent_runtime::{
    init_with_builder, AgentError, AgentRuntime, AgentRuntimePluginBuilder, Builder,
    ConfigProvider, ExecutionMode, FunctionToolDefinition, PermissionSet, ProviderRegistration,
    RuntimeConfig, RuntimeContext, TomlConfigProvider, ToolContext, ToolProvider, Visibility,
};

const COSMIC_DEMO_CONFIG_ID: &str = "cosmic-demo";
const COSMIC_TOOL_ID: &str = "cosmic.resolve_zodiac_sign";

struct CosmicWeatherToolProvider;

#[async_trait]
impl ToolProvider for CosmicWeatherToolProvider {
    async fn list_tools(&self, _ctx: &RuntimeContext) -> Vec<FunctionToolDefinition> {
        vec![FunctionToolDefinition {
            id: COSMIC_TOOL_ID.to_string(),
            description:
                "Resolve a YYYY-MM-DD birthday into a zodiac sign, date range, and element."
                    .to_string(),
            namespace: Some("cosmic".to_string()),
            input_schema: Some(json!({
                "type": "object",
                "properties": {
                    "birthday": {
                        "type": "string",
                        "description": "Birthday in YYYY-MM-DD format"
                    }
                },
                "required": ["birthday"],
                "additionalProperties": false
            })),
            output_schema: Some(json!({
                "type": "object",
                "properties": {
                    "sign": { "type": "string" },
                    "dateRange": { "type": "string" },
                    "element": { "type": "string" },
                    "birthday": { "type": "string" }
                },
                "required": ["sign", "dateRange", "element", "birthday"],
                "additionalProperties": false
            })),
            execution_mode: ExecutionMode::Immediate,
            authz: PermissionSet::ReadOnly,
            visibility: Visibility::Public,
        }]
    }

    async fn invoke(
        &self,
        _ctx: &ToolContext,
        tool_id: &str,
        input: Value,
    ) -> Result<Value, AgentError> {
        if tool_id != COSMIC_TOOL_ID {
            return Err(AgentError::Execution(format!("unknown tool: {tool_id}")));
        }

        let birthday = input
            .get("birthday")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| AgentError::InvalidInput("missing `birthday`".to_string()))?;

        let (month, day) = parse_month_day(birthday)?;
        let (sign, date_range, element) = zodiac_for_date(month, day)?;

        Ok(json!({
            "sign": sign,
            "dateRange": date_range,
            "element": element,
            "birthday": birthday,
        }))
    }
}

fn parse_month_day(birthday: &str) -> Result<(u32, u32), AgentError> {
    let parts = birthday.split('-').collect::<Vec<_>>();
    if parts.len() != 3 {
        return Err(AgentError::InvalidInput(
            "birthday must use YYYY-MM-DD".to_string(),
        ));
    }

    let month = parts[1]
        .parse::<u32>()
        .map_err(|_| AgentError::InvalidInput("invalid birth month".to_string()))?;
    let day = parts[2]
        .parse::<u32>()
        .map_err(|_| AgentError::InvalidInput("invalid birth day".to_string()))?;

    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return Err(AgentError::InvalidInput(
            "birthday must contain a valid calendar month/day".to_string(),
        ));
    }

    Ok((month, day))
}

fn zodiac_for_date(
    month: u32,
    day: u32,
) -> Result<(&'static str, &'static str, &'static str), AgentError> {
    let sign = match (month, day) {
        (1, 20..=31) | (2, 1..=18) => ("Aquarius", "Jan 20 - Feb 18", "Air"),
        (2, 19..=29) | (3, 1..=20) => ("Pisces", "Feb 19 - Mar 20", "Water"),
        (3, 21..=31) | (4, 1..=19) => ("Aries", "Mar 21 - Apr 19", "Fire"),
        (4, 20..=30) | (5, 1..=20) => ("Taurus", "Apr 20 - May 20", "Earth"),
        (5, 21..=31) | (6, 1..=20) => ("Gemini", "May 21 - Jun 20", "Air"),
        (6, 21..=30) | (7, 1..=22) => ("Cancer", "Jun 21 - Jul 22", "Water"),
        (7, 23..=31) | (8, 1..=22) => ("Leo", "Jul 23 - Aug 22", "Fire"),
        (8, 23..=31) | (9, 1..=22) => ("Virgo", "Aug 23 - Sep 22", "Earth"),
        (9, 23..=30) | (10, 1..=22) => ("Libra", "Sep 23 - Oct 22", "Air"),
        (10, 23..=31) | (11, 1..=21) => ("Scorpio", "Oct 23 - Nov 21", "Water"),
        (11, 22..=30) | (12, 1..=21) => ("Sagittarius", "Nov 22 - Dec 21", "Fire"),
        (12, 22..=31) | (1, 1..=19) => ("Capricorn", "Dec 22 - Jan 19", "Earth"),
        _ => {
            return Err(AgentError::InvalidInput(
                "birthday must map to a valid zodiac sign".to_string(),
            ))
        }
    };

    Ok(sign)
}

fn demo_config_provider() -> Arc<dyn ConfigProvider> {
    let config_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join(".codex")
        .join("config.toml");

    Arc::new(
        TomlConfigProvider::new(
            COSMIC_DEMO_CONFIG_ID,
            "Bundled cosmic demo config",
            "demo",
            config_path,
        )
        .with_default(true),
    )
}

fn build_demo_runtime() -> AgentRuntime {
    Builder::new()
        .register_provider(
            ProviderRegistration {
                id: "cosmic-weather-tools".to_string(),
                kind: "host".to_string(),
            },
            Arc::new(CosmicWeatherToolProvider),
        )
        .set_config(RuntimeConfig {
            default_permission: PermissionSet::ReadOnly,
            provider_adapters: vec!["codex".to_string()],
            audit_enabled: true,
        })
        .build()
        .expect("failed to build Cosmic Weather runtime")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(init_with_builder(
            AgentRuntimePluginBuilder::new()
                .config_provider(demo_config_provider())
                .agent_runtime(build_demo_runtime()),
        ))
        .run(tauri::generate_context!())
        .expect("failed to run Cosmic Weather");
}
